// SPDX-License-Identifier: Apache-2.0

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import fs from 'node:fs';
import path from 'node:path';

import type {
  ProModuleActivationConfigResponse,
  UpdateProModuleActivationConfigRequest,
} from '@ai-game-design-studio/contracts/api/pro-modules';

export const DEFAULT_GREYBOX_CLOUD_URL = 'https://cloud.greybox.studio';
export const SAVED_PRO_MODULE_LICENSE_KEY_MASK = 'saved-greybox-license-key';
export const SAVED_PRO_MODULE_ENTITLEMENT_LOOKUP_KEY_MASK = 'saved-greybox-entitlement-lookup-key';

export interface ProModuleActivationConfig {
  cloudUrl: string;
  licenseKey: string;
  entitlementLookupKeys: Record<string, string>;
}

function configPath(dataDir: string): string {
  return path.join(dataDir, 'pro-module-activation.json');
}

function cleanCloudUrl(value: unknown): string {
  if (typeof value !== 'string') return '';
  const clean = value.trim();
  if (!clean) return '';
  try {
    const url = new URL(clean);
    if (url.protocol !== 'https:' && url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') return '';
    return url.toString().replace(/\/$/u, '');
  } catch {
    return '';
  }
}

function cleanLicenseKey(value: unknown): string {
  if (typeof value !== 'string') return '';
  const clean = value.trim();
  if (!clean || clean === SAVED_PRO_MODULE_LICENSE_KEY_MASK || clean.length > 256) return '';
  return clean;
}

function cleanEntitlementLookupKey(value: unknown): string {
  if (typeof value !== 'string') return '';
  const clean = value.trim();
  if (
    !clean
    || clean === SAVED_PRO_MODULE_ENTITLEMENT_LOOKUP_KEY_MASK
    || !/^gbx_[A-Za-z0-9._-]{1,180}$/u.test(clean)
  ) {
    return '';
  }
  return clean;
}

function normalizeEntitlementLookupKeys(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(value as Record<string, unknown>)) {
    const key = rawKey.trim();
    if (!key || key === '__proto__' || key === 'constructor') continue;
    if (key !== '*' && !/^[a-z0-9][a-z0-9-]{0,79}$/u.test(key) && !/^[a-f0-9]{64}$/iu.test(key)) continue;
    const lookupKey = cleanEntitlementLookupKey(rawValue);
    if (lookupKey) out[key] = lookupKey;
  }
  return out;
}

function publicProModuleActivationConfig(config: ProModuleActivationConfig): ProModuleActivationConfigResponse {
  const entitlementLookupKeyCount = Object.keys(config.entitlementLookupKeys).length;
  return {
    cloudUrl: config.cloudUrl || DEFAULT_GREYBOX_CLOUD_URL,
    licenseKeyConfigured: Boolean(config.licenseKey),
    licenseKeyMask: config.licenseKey ? SAVED_PRO_MODULE_LICENSE_KEY_MASK : '',
    entitlementLookupKeyConfigured: entitlementLookupKeyCount > 0,
    entitlementLookupKeyMask: entitlementLookupKeyCount > 0 ? SAVED_PRO_MODULE_ENTITLEMENT_LOOKUP_KEY_MASK : '',
    entitlementLookupKeyCount,
  };
}

export async function readProModuleActivationConfig(dataDir: string): Promise<ProModuleActivationConfig> {
  try {
    const raw = await readFile(configPath(dataDir), 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { cloudUrl: '', licenseKey: '', entitlementLookupKeys: {} };
    }
    const record = parsed as Record<string, unknown>;
    return {
      cloudUrl: cleanCloudUrl(record.cloudUrl),
      licenseKey: typeof record.licenseKey === 'string' ? record.licenseKey.trim().slice(0, 256) : '',
      entitlementLookupKeys: normalizeEntitlementLookupKeys(record.entitlementLookupKeys),
    };
  } catch (error) {
    if (error instanceof SyntaxError) return { cloudUrl: '', licenseKey: '', entitlementLookupKeys: {} };
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return { cloudUrl: '', licenseKey: '', entitlementLookupKeys: {} };
    }
    throw error;
  }
}

export async function readPublicProModuleActivationConfig(
  dataDir: string,
): Promise<ProModuleActivationConfigResponse> {
  return publicProModuleActivationConfig(await readProModuleActivationConfig(dataDir));
}

export async function writeProModuleActivationConfig(
  dataDir: string,
  input: UpdateProModuleActivationConfigRequest,
): Promise<ProModuleActivationConfigResponse> {
  const current = await readProModuleActivationConfig(dataDir);
  const cloudUrl = input.cloudUrl === undefined
    ? current.cloudUrl
    : cleanCloudUrl(input.cloudUrl);
  const licenseKey = input.clearLicenseKey
    ? ''
    : input.licenseKey === undefined || input.licenseKey === SAVED_PRO_MODULE_LICENSE_KEY_MASK
      ? current.licenseKey
      : cleanLicenseKey(input.licenseKey);
  const entitlementLookupKeys = input.clearEntitlementLookupKeys
    ? {}
    : { ...current.entitlementLookupKeys };
  if (
    input.entitlementLookupKey !== undefined
    && input.entitlementLookupKey !== SAVED_PRO_MODULE_ENTITLEMENT_LOOKUP_KEY_MASK
  ) {
    const entitlementLookupKey = cleanEntitlementLookupKey(input.entitlementLookupKey);
    if (entitlementLookupKey) entitlementLookupKeys['*'] = entitlementLookupKey;
    else delete entitlementLookupKeys['*'];
  }

  const next: ProModuleActivationConfig = {
    cloudUrl,
    licenseKey,
    entitlementLookupKeys,
  };
  await mkdir(dataDir, { recursive: true });
  await writeFile(configPath(dataDir), `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  try {
    fs.chmodSync(configPath(dataDir), 0o600);
  } catch {
    // Best effort for filesystems that do not support chmod.
  }
  return publicProModuleActivationConfig(next);
}
