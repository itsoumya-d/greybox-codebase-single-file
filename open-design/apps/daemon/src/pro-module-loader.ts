// SPDX-License-Identifier: Apache-2.0

import { createDecipheriv, createHash, createPublicKey, type KeyObject, verify } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import type {
  ProModuleBundleEnvelope,
  ProModuleManifest,
  ProModuleMountDescriptor,
  ProModuleMountKind,
  ProjectProModuleRuntimeRegistries,
  ProjectProModuleRuntimeRegistryEntry,
  VerifiedProModuleManifest,
} from '@ai-game-design-studio/contracts/api/pro-modules';
import { PRO_MODULE_BUNDLE_FORMAT } from '@ai-game-design-studio/contracts/api/pro-modules';

const PRO_MODULES_DIR = 'pro-modules';
const MAX_BUNDLE_BYTES = 25 * 1024 * 1024;
const SAFE_ID_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;
const SEMVERISH_RE = /^[0-9]+(?:\.[0-9]+){0,2}(?:[-+][a-zA-Z0-9.-]+)?$/;
const SHA256_RE = /^[a-f0-9]{64}$/i;
const SAFE_ENTRY_RE = /^[a-zA-Z0-9._/-]{1,240}$/;

export type ProModuleLoaderCode =
  | 'PRO_MODULE_BAD_JSON'
  | 'PRO_MODULE_BAD_FORMAT'
  | 'PRO_MODULE_BAD_MANIFEST'
  | 'PRO_MODULE_BAD_PAYLOAD_DIGEST'
  | 'PRO_MODULE_UNSIGNED'
  | 'PRO_MODULE_BAD_SIGNATURE'
  | 'PRO_MODULE_UNKNOWN_KEY'
  | 'PRO_MODULE_SIGNATURE_INVALID'
  | 'PRO_MODULE_LICENSE_REQUIRED'
  | 'PRO_MODULE_PAYLOAD_MISSING'
  | 'PRO_MODULE_PAYLOAD_DIGEST_MISMATCH'
  | 'PRO_MODULE_DECRYPT_FAILED'
  | 'PRO_MODULE_PAYLOAD_INVALID'
  | 'PRO_MODULE_PAYLOAD_FILE_DIGEST_MISMATCH'
  | 'PRO_MODULE_TOO_LARGE'
  | 'PRO_MODULE_READ_FAILED';

export type PublicKeyLike = KeyObject | string | Buffer;

export type ProModulePublicKeyRing = Readonly<Record<string, PublicKeyLike>>;

export type ProModuleVerifyResult =
  | { ok: true; bundle: VerifiedProModuleManifest }
  | { ok: false; code: ProModuleLoaderCode; message: string };

export interface ProModuleLoadResult {
  loaded: Array<VerifiedProModuleManifest & { fileName: string }>;
  rejected: Array<{ fileName: string; code: ProModuleLoaderCode; message: string }>;
}

export interface ProModulePayloadFile {
  path: string;
  mediaType?: string;
  body: string;
  digestSha256: string;
}

export interface ProModuleDecryptedPayload {
  moduleId: string;
  version: string;
  files: ProModulePayloadFile[];
  generatedBy?: string;
  license?: string;
}

export interface ProModuleMountedFile {
  mount: ProModuleMountDescriptor;
  file: ProModulePayloadFile;
  body: string;
}

export interface ProModuleMountedPayload {
  skills: ProModuleMountedFile[];
  gameArtBibles: ProModuleMountedFile[];
  engineTargets: ProModuleMountedFile[];
}

export type ProModuleLicenseSecretResolver = (
  manifest: ProModuleManifest,
  verified: VerifiedProModuleManifest & { fileName: string },
) => Promise<string | Buffer | null | undefined> | string | Buffer | null | undefined;

export type ProModuleCloudLicenseFetch = (
  url: string,
  init: {
    method: 'POST';
    headers: Record<string, string>;
    body: string;
    signal?: AbortSignal;
  },
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

export interface ProModuleCloudLicenseSecretOptions {
  cloudUrl?: string;
  licenseKey?: string;
  entitlementLookupKeys?: Readonly<Record<string, string>>;
  timeoutMs?: number;
  fetchFn?: ProModuleCloudLicenseFetch;
}

export interface LicensedProModuleLoadResult {
  loaded: Array<VerifiedProModuleManifest & {
    fileName: string;
    payload: ProModuleDecryptedPayload;
    mounted: ProModuleMountedPayload;
  }>;
  rejected: Array<{ fileName: string; code: ProModuleLoaderCode; message: string }>;
}

type ProModulePayloadResult =
  | { ok: true; payload: ProModuleDecryptedPayload; mounted: ProModuleMountedPayload }
  | { ok: false; code: ProModuleLoaderCode; message: string };

export interface ProModuleRuntimeRegistryItem {
  item: ProjectProModuleRuntimeRegistryEntry;
  body: string;
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cleanString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const clean = value.replace(/\0/g, '').trim();
  return clean ? clean.slice(0, maxLength) : undefined;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const record = value as JsonRecord;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
}

function isSafeEntry(value: string): boolean {
  if (!SAFE_ENTRY_RE.test(value)) return false;
  if (value.startsWith('/') || value.includes('\\')) return false;
  return !value.split('/').some((part) => part === '..');
}

function normalizeMountKind(value: ProModuleMountKind, expected: ProModuleMountKind): ProModuleMountKind | undefined {
  return value === expected ? value : undefined;
}

function normalizeMount(
  input: unknown,
  expectedKind: ProModuleMountKind,
): ProModuleMountDescriptor | undefined {
  if (!isRecord(input)) return undefined;
  const kind = normalizeMountKind(input.kind as ProModuleMountKind, expectedKind);
  const id = cleanString(input.id, 80);
  if (!kind || !id || !SAFE_ID_RE.test(id)) return undefined;
  const title = cleanString(input.title, 96);
  const description = cleanString(input.description, 240);
  const entry = cleanString(input.entry, 240);
  const digestSha256 = cleanString(input.digestSha256, 64);
  if (entry && !isSafeEntry(entry)) return undefined;
  if (digestSha256 && !SHA256_RE.test(digestSha256)) return undefined;
  return {
    kind,
    id,
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    ...(entry ? { entry } : {}),
    ...(digestSha256 ? { digestSha256: digestSha256.toLowerCase() } : {}),
  };
}

function normalizeMounts(
  value: unknown,
): ProModuleManifest['mounts'] | undefined {
  if (!isRecord(value)) return undefined;
  const skills = Array.isArray(value.skills)
    ? value.skills.flatMap((item) => {
      const mount = normalizeMount(item, 'skill');
      return mount ? [mount] : [];
    })
    : [];
  const gameArtBibles = Array.isArray(value.gameArtBibles)
    ? value.gameArtBibles.flatMap((item) => {
      const mount = normalizeMount(item, 'game-art-bible');
      return mount ? [mount] : [];
    })
    : [];
  const engineTargets = Array.isArray(value.engineTargets)
    ? value.engineTargets.flatMap((item) => {
      const mount = normalizeMount(item, 'engine-target');
      return mount ? [mount] : [];
    })
    : [];

  if (skills.length + gameArtBibles.length + engineTargets.length === 0) return undefined;
  return {
    ...(skills.length > 0 ? { skills } : {}),
    ...(gameArtBibles.length > 0 ? { gameArtBibles } : {}),
    ...(engineTargets.length > 0 ? { engineTargets } : {}),
  };
}

export function normalizeProModuleManifest(input: unknown): ProModuleManifest | undefined {
  if (!isRecord(input)) return undefined;
  const id = cleanString(input.id, 80);
  const name = cleanString(input.name, 96);
  const version = cleanString(input.version, 48);
  const mounts = normalizeMounts(input.mounts);
  if (!id || !SAFE_ID_RE.test(id) || !name || !version || !SEMVERISH_RE.test(version) || !mounts) {
    return undefined;
  }
  const description = cleanString(input.description, 280);
  const licenseTier = cleanString(input.licenseTier, 48);
  const minAgdsVersion = cleanString(input.minAgdsVersion, 48);
  return {
    id,
    name,
    version,
    ...(description ? { description } : {}),
    ...(licenseTier ? { licenseTier } : {}),
    ...(minAgdsVersion ? { minAgdsVersion } : {}),
    mounts,
  };
}

export function createProModuleSigningPayload(input: {
  format: typeof PRO_MODULE_BUNDLE_FORMAT;
  manifest: ProModuleManifest;
  payloadSha256: string;
}): string {
  return stableStringify({
    format: input.format,
    manifest: input.manifest,
    payloadSha256: input.payloadSha256.toLowerCase(),
  });
}

function decodeSignature(value: string): Buffer | undefined {
  try {
    return Buffer.from(value, 'base64url');
  } catch {
    try {
      return Buffer.from(value, 'base64');
    } catch {
      return undefined;
    }
  }
}

function parseEnvelope(raw: Buffer | string): ProModuleBundleEnvelope | undefined {
  try {
    const parsed = JSON.parse(Buffer.isBuffer(raw) ? raw.toString('utf8') : raw);
    return isRecord(parsed) ? parsed as unknown as ProModuleBundleEnvelope : undefined;
  } catch {
    return undefined;
  }
}

function normalizePublicKey(value: PublicKeyLike): KeyObject | PublicKeyLike {
  if (typeof value === 'string' || Buffer.isBuffer(value)) return createPublicKey(value);
  return value;
}

function sha256Hex(input: string | Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}

function licenseSecretToKey(secret: string | Buffer): Buffer {
  return createHash('sha256').update(secret).digest();
}

function encryptedPayloadDigest(encryptedPayload: string): string {
  return sha256Hex(Buffer.from(encryptedPayload, 'utf8'));
}

function cleanOptionalString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  return value.slice(0, maxLength);
}

function normalizePayloadFile(input: unknown): ProModulePayloadFile | undefined {
  if (!isRecord(input)) return undefined;
  const filePath = cleanString(input.path, 240);
  const body = cleanOptionalString(input.body, MAX_BUNDLE_BYTES);
  const digestSha256 = cleanString(input.digestSha256, 64);
  if (!filePath || !isSafeEntry(filePath) || typeof body !== 'string') return undefined;
  if (!digestSha256 || !SHA256_RE.test(digestSha256)) return undefined;
  const mediaType = cleanString(input.mediaType, 80);
  return {
    path: filePath,
    body,
    digestSha256: digestSha256.toLowerCase(),
    ...(mediaType ? { mediaType } : {}),
  };
}

function normalizeProModulePayload(input: unknown, manifest: ProModuleManifest): ProModuleDecryptedPayload | undefined {
  if (!isRecord(input)) return undefined;
  const moduleId = cleanString(input.moduleId, 80);
  const version = cleanString(input.version, 48);
  if (moduleId !== manifest.id || version !== manifest.version) return undefined;
  if (!Array.isArray(input.files) || input.files.length === 0) return undefined;
  const files = input.files.flatMap((item) => {
    const file = normalizePayloadFile(item);
    return file ? [file] : [];
  });
  if (files.length !== input.files.length) return undefined;
  const generatedBy = cleanString(input.generatedBy, 80);
  const license = cleanString(input.license, 80);
  return {
    moduleId,
    version,
    files,
    ...(generatedBy ? { generatedBy } : {}),
    ...(license ? { license } : {}),
  };
}

function parseEncryptedPayloadEnvelope(encryptedPayload: string): {
  nonce: Buffer;
  authTag: Buffer;
  ciphertext: Buffer;
} | undefined {
  try {
    const parsed = JSON.parse(Buffer.from(encryptedPayload, 'base64url').toString('utf8'));
    if (!isRecord(parsed)) return undefined;
    if (parsed.algorithm !== 'aes-256-gcm' || parsed.keyDerivation !== 'sha256-license-secret') {
      return undefined;
    }
    const nonce = cleanString(parsed.nonce, 64);
    const authTag = cleanString(parsed.authTag, 64);
    const ciphertext = cleanOptionalString(parsed.ciphertext, MAX_BUNDLE_BYTES);
    if (!nonce || !authTag || typeof ciphertext !== 'string') return undefined;
    return {
      nonce: Buffer.from(nonce, 'base64url'),
      authTag: Buffer.from(authTag, 'base64url'),
      ciphertext: Buffer.from(ciphertext, 'base64url'),
    };
  } catch {
    return undefined;
  }
}

function mountPayloadFiles(
  manifest: ProModuleManifest,
  payload: ProModuleDecryptedPayload,
): ProModulePayloadResult {
  const fileByPath = new Map(payload.files.map((file) => [file.path, file]));
  const mountGroup = (mounts: ProModuleMountDescriptor[] | undefined): ProModuleMountedFile[] | ProModulePayloadResult => {
    const mounted: ProModuleMountedFile[] = [];
    for (const mount of mounts ?? []) {
      if (!mount.entry) {
        return { ok: false, code: 'PRO_MODULE_PAYLOAD_INVALID', message: `pro module mount ${mount.id} is missing an entry path` };
      }
      const file = fileByPath.get(mount.entry);
      if (!file) {
        return { ok: false, code: 'PRO_MODULE_PAYLOAD_INVALID', message: `pro module payload is missing ${mount.entry}` };
      }
      const bodyDigest = sha256Hex(Buffer.from(file.body, 'utf8'));
      if (file.digestSha256 !== bodyDigest || (mount.digestSha256 && mount.digestSha256 !== file.digestSha256)) {
        return { ok: false, code: 'PRO_MODULE_PAYLOAD_FILE_DIGEST_MISMATCH', message: `pro module payload digest mismatch for ${mount.entry}` };
      }
      mounted.push({ mount, file, body: file.body });
    }
    return mounted;
  };

  const skills = mountGroup(manifest.mounts.skills);
  if (!Array.isArray(skills)) return skills;
  const gameArtBibles = mountGroup(manifest.mounts.gameArtBibles);
  if (!Array.isArray(gameArtBibles)) return gameArtBibles;
  const engineTargets = mountGroup(manifest.mounts.engineTargets);
  if (!Array.isArray(engineTargets)) return engineTargets;
  return {
    ok: true,
    payload,
    mounted: {
      skills,
      gameArtBibles,
      engineTargets,
    },
  };
}

function hasLicenseSecret(value: string | Buffer | null | undefined): value is string | Buffer {
  if (typeof value === 'string') return value.trim().length > 0;
  return Buffer.isBuffer(value) && value.length > 0;
}

function publicRuntimeRegistryEntry(
  bundle: LicensedProModuleLoadResult['loaded'][number],
  mounted: ProModuleMountedFile,
): ProjectProModuleRuntimeRegistryEntry {
  const { mount, file } = mounted;
  return {
    kind: mount.kind,
    id: mount.id,
    source: 'pro-module',
    moduleId: bundle.manifest.id,
    moduleName: bundle.manifest.name,
    moduleVersion: bundle.manifest.version,
    fileName: bundle.fileName,
    digestSha256: file.digestSha256,
    ...(mount.title ? { title: mount.title } : {}),
    ...(mount.description ? { description: mount.description } : {}),
    ...(mount.entry ? { entry: mount.entry } : {}),
    ...(file.mediaType ? { mediaType: file.mediaType } : {}),
  };
}

export function buildProModuleRuntimeRegistries(
  bundles: LicensedProModuleLoadResult['loaded'],
): ProjectProModuleRuntimeRegistries {
  const registries: ProjectProModuleRuntimeRegistries = {
    skills: [],
    gameArtBibles: [],
    engineTargets: [],
  };
  for (const bundle of bundles) {
    registries.skills.push(
      ...bundle.mounted.skills.map((mounted) => publicRuntimeRegistryEntry(bundle, mounted)),
    );
    registries.gameArtBibles.push(
      ...bundle.mounted.gameArtBibles.map((mounted) => publicRuntimeRegistryEntry(bundle, mounted)),
    );
    registries.engineTargets.push(
      ...bundle.mounted.engineTargets.map((mounted) => publicRuntimeRegistryEntry(bundle, mounted)),
    );
  }
  return registries;
}

export function findProModuleRuntimeRegistryItem(
  bundles: LicensedProModuleLoadResult['loaded'],
  kind: ProModuleMountKind,
  id: string,
): ProModuleRuntimeRegistryItem | null {
  const cleanId = cleanString(id, 80);
  if (!cleanId || !SAFE_ID_RE.test(cleanId)) return null;
  for (const bundle of bundles) {
    const mountedFiles = kind === 'skill'
      ? bundle.mounted.skills
      : kind === 'game-art-bible'
        ? bundle.mounted.gameArtBibles
        : bundle.mounted.engineTargets;
    const mounted = mountedFiles.find((candidate) => candidate.mount.id === cleanId);
    if (mounted) {
      return {
        item: publicRuntimeRegistryEntry(bundle, mounted),
        body: mounted.body,
      };
    }
  }
  return null;
}

function cleanCloudUrl(value: string | undefined): string | undefined {
  const clean = value?.trim();
  if (!clean) return undefined;
  try {
    const url = new URL(clean);
    if (url.protocol !== 'https:' && url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') return undefined;
    return url.toString().replace(/\/$/u, '');
  } catch {
    return undefined;
  }
}

function cleanCloudLicenseSecret(value: unknown): string | null {
  if (!isRecord(value)) return null;
  const secret = value.decryptionSecret;
  return typeof secret === 'string' && secret.trim().length >= 32 ? secret.trim() : null;
}

function cleanEntitlementLookupKey(value: string | undefined): string | undefined {
  const clean = value?.trim();
  if (!clean || !/^gbx_[A-Za-z0-9._-]{1,180}$/u.test(clean)) return undefined;
  return clean;
}

export async function fetchProModuleLicenseSecretFromCloud(
  manifest: ProModuleManifest,
  verified: VerifiedProModuleManifest & { fileName: string },
  options: ProModuleCloudLicenseSecretOptions,
): Promise<string | null> {
  const cloudUrl = cleanCloudUrl(options.cloudUrl);
  const licenseKey = options.licenseKey?.trim();
  if (!cloudUrl || !licenseKey) return null;
  const entitlementLookupKey = cleanEntitlementLookupKey(
    options.entitlementLookupKeys?.[manifest.id]
      ?? options.entitlementLookupKeys?.[verified.payloadSha256]
      ?? options.entitlementLookupKeys?.['*'],
  );

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(250, options.timeoutMs ?? 3500));
  try {
    const fetchFn = options.fetchFn ?? fetch;
    const response = await fetchFn(`${cloudUrl}/v1/pro-modules/license-secret`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${licenseKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        moduleId: manifest.id,
        payloadSha256: verified.payloadSha256,
        ...(entitlementLookupKey ? { entitlementLookupKey } : {}),
      }),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return cleanCloudLicenseSecret(await response.json());
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export function verifyProModuleBundle(
  raw: Buffer | string,
  publicKeys: ProModulePublicKeyRing,
): ProModuleVerifyResult {
  const envelope = parseEnvelope(raw);
  if (!envelope) {
    return { ok: false, code: 'PRO_MODULE_BAD_JSON', message: 'pro module bundle must be a JSON envelope' };
  }
  if (envelope.format !== PRO_MODULE_BUNDLE_FORMAT) {
    return { ok: false, code: 'PRO_MODULE_BAD_FORMAT', message: `expected ${PRO_MODULE_BUNDLE_FORMAT}` };
  }
  const manifest = normalizeProModuleManifest(envelope.manifest);
  if (!manifest) {
    return { ok: false, code: 'PRO_MODULE_BAD_MANIFEST', message: 'pro module manifest is missing safe game-studio mount metadata' };
  }
  const payloadSha256 = cleanString(envelope.payloadSha256, 64)?.toLowerCase();
  if (!payloadSha256 || !SHA256_RE.test(payloadSha256)) {
    return { ok: false, code: 'PRO_MODULE_BAD_PAYLOAD_DIGEST', message: 'pro module payloadSha256 must be a SHA-256 hex digest' };
  }
  if (!envelope.signature) {
    return { ok: false, code: 'PRO_MODULE_UNSIGNED', message: 'pro module bundle is unsigned' };
  }
  if (envelope.signature.algorithm !== 'ed25519') {
    return { ok: false, code: 'PRO_MODULE_BAD_SIGNATURE', message: 'pro module signature must use ed25519' };
  }
  const keyId = cleanString(envelope.signature.keyId, 96);
  if (!keyId || !publicKeys[keyId]) {
    return { ok: false, code: 'PRO_MODULE_UNKNOWN_KEY', message: 'pro module signature key is not trusted' };
  }
  const signature = decodeSignature(envelope.signature.value);
  if (!signature || signature.length === 0) {
    return { ok: false, code: 'PRO_MODULE_BAD_SIGNATURE', message: 'pro module signature is not valid base64url' };
  }

  const signedPayload = Buffer.from(
    createProModuleSigningPayload({ format: PRO_MODULE_BUNDLE_FORMAT, manifest, payloadSha256 }),
    'utf8',
  );
  const valid = verify(null, signedPayload, normalizePublicKey(publicKeys[keyId]!), signature);
  if (!valid) {
    return { ok: false, code: 'PRO_MODULE_SIGNATURE_INVALID', message: 'pro module signature did not match manifest and payload digest' };
  }

  return {
    ok: true,
    bundle: {
      manifest,
      payloadSha256,
      signature: {
        algorithm: 'ed25519',
        keyId,
      },
    },
  };
}

export function decryptProModuleBundlePayload(
  raw: Buffer | string | ProModuleBundleEnvelope,
  licenseSecret: string | Buffer,
): ProModulePayloadResult {
  const envelope = typeof raw === 'object' && !Buffer.isBuffer(raw) && 'format' in raw
    ? raw
    : parseEnvelope(raw);
  if (!envelope) {
    return { ok: false, code: 'PRO_MODULE_BAD_JSON', message: 'pro module bundle must be a JSON envelope' };
  }
  if (envelope.format !== PRO_MODULE_BUNDLE_FORMAT) {
    return { ok: false, code: 'PRO_MODULE_BAD_FORMAT', message: `expected ${PRO_MODULE_BUNDLE_FORMAT}` };
  }
  const manifest = normalizeProModuleManifest(envelope.manifest);
  if (!manifest) {
    return { ok: false, code: 'PRO_MODULE_BAD_MANIFEST', message: 'pro module manifest is missing safe game-studio mount metadata' };
  }
  if (!envelope.encryptedPayload) {
    return { ok: false, code: 'PRO_MODULE_PAYLOAD_MISSING', message: 'pro module bundle is missing encryptedPayload' };
  }
  const payloadSha256 = cleanString(envelope.payloadSha256, 64)?.toLowerCase();
  if (!payloadSha256 || !SHA256_RE.test(payloadSha256)) {
    return { ok: false, code: 'PRO_MODULE_BAD_PAYLOAD_DIGEST', message: 'pro module payloadSha256 must be a SHA-256 hex digest' };
  }
  if (encryptedPayloadDigest(envelope.encryptedPayload) !== payloadSha256) {
    return { ok: false, code: 'PRO_MODULE_PAYLOAD_DIGEST_MISMATCH', message: 'pro module encrypted payload digest did not match payloadSha256' };
  }
  const encrypted = parseEncryptedPayloadEnvelope(envelope.encryptedPayload);
  if (!encrypted || encrypted.nonce.length !== 12 || encrypted.authTag.length === 0) {
    return { ok: false, code: 'PRO_MODULE_DECRYPT_FAILED', message: 'pro module encrypted payload envelope is invalid' };
  }

  try {
    const decipher = createDecipheriv('aes-256-gcm', licenseSecretToKey(licenseSecret), encrypted.nonce);
    decipher.setAAD(Buffer.from(stableStringify(manifest), 'utf8'));
    decipher.setAuthTag(encrypted.authTag);
    const plaintext = Buffer.concat([
      decipher.update(encrypted.ciphertext),
      decipher.final(),
    ]);
    const payload = normalizeProModulePayload(JSON.parse(plaintext.toString('utf8')), manifest);
    if (!payload) {
      return { ok: false, code: 'PRO_MODULE_PAYLOAD_INVALID', message: 'pro module decrypted payload does not match manifest' };
    }
    return mountPayloadFiles(manifest, payload);
  } catch {
    return { ok: false, code: 'PRO_MODULE_DECRYPT_FAILED', message: 'pro module payload could not be decrypted with the license key' };
  }
}

export async function listVerifiedProModuleManifests(
  projectRoot: string,
  publicKeys: ProModulePublicKeyRing,
): Promise<ProModuleLoadResult> {
  const proModulesRoot = path.join(projectRoot, PRO_MODULES_DIR);
  const loaded: ProModuleLoadResult['loaded'] = [];
  const rejected: ProModuleLoadResult['rejected'] = [];
  let entries;
  try {
    entries = await readdir(proModulesRoot, { withFileTypes: true });
  } catch {
    return { loaded, rejected };
  }
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.gbpro')) continue;
    const filePath = path.join(proModulesRoot, entry.name);
    try {
      const fileStat = await stat(filePath);
      if (fileStat.size > MAX_BUNDLE_BYTES) {
        rejected.push({
          fileName: entry.name,
          code: 'PRO_MODULE_TOO_LARGE',
          message: `pro module bundle exceeds ${MAX_BUNDLE_BYTES} bytes`,
        });
        continue;
      }
      const result = verifyProModuleBundle(await readFile(filePath), publicKeys);
      if (result.ok) loaded.push({ ...result.bundle, fileName: entry.name });
      else rejected.push({ fileName: entry.name, code: result.code, message: result.message });
    } catch (error) {
      rejected.push({
        fileName: entry.name,
        code: 'PRO_MODULE_READ_FAILED',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { loaded, rejected };
}

export async function loadLicensedProModuleBundles(
  projectRoot: string,
  publicKeys: ProModulePublicKeyRing,
  resolveLicenseSecret: ProModuleLicenseSecretResolver,
): Promise<LicensedProModuleLoadResult> {
  const proModulesRoot = path.join(projectRoot, PRO_MODULES_DIR);
  const loaded: LicensedProModuleLoadResult['loaded'] = [];
  const rejected: LicensedProModuleLoadResult['rejected'] = [];
  let entries;
  try {
    entries = await readdir(proModulesRoot, { withFileTypes: true });
  } catch {
    return { loaded, rejected };
  }
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.gbpro')) continue;
    const filePath = path.join(proModulesRoot, entry.name);
    try {
      const fileStat = await stat(filePath);
      if (fileStat.size > MAX_BUNDLE_BYTES) {
        rejected.push({
          fileName: entry.name,
          code: 'PRO_MODULE_TOO_LARGE',
          message: `pro module bundle exceeds ${MAX_BUNDLE_BYTES} bytes`,
        });
        continue;
      }
      const raw = await readFile(filePath);
      const verification = verifyProModuleBundle(raw, publicKeys);
      if (!verification.ok) {
        rejected.push({ fileName: entry.name, code: verification.code, message: verification.message });
        continue;
      }
      const verified = { ...verification.bundle, fileName: entry.name };
      const licenseSecret = await resolveLicenseSecret(verification.bundle.manifest, verified);
      if (!hasLicenseSecret(licenseSecret)) {
        rejected.push({
          fileName: entry.name,
          code: 'PRO_MODULE_LICENSE_REQUIRED',
          message: 'pro module bundle requires a valid license key',
        });
        continue;
      }
      const payloadResult = decryptProModuleBundlePayload(raw, licenseSecret);
      if (!payloadResult.ok) {
        rejected.push({ fileName: entry.name, code: payloadResult.code, message: payloadResult.message });
        continue;
      }
      loaded.push({
        ...verified,
        payload: payloadResult.payload,
        mounted: payloadResult.mounted,
      });
    } catch (error) {
      rejected.push({
        fileName: entry.name,
        code: 'PRO_MODULE_READ_FAILED',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { loaded, rejected };
}
