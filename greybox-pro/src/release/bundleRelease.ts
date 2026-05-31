// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { createHash } from 'node:crypto';

import type { KeyLike } from '../bundles/gbpro.js';
import {
  createGbproBundle,
  decryptGbproBundle,
  verifyGbproBundleSignature,
} from '../bundles/gbpro.js';
import { stableStringify } from '../bundles/stableStringify.js';
import { assertCatalogHealthy, proModuleCatalog } from '../catalog/modules.js';
import type {
  ProModuleBundleEnvelope,
  ProModuleDefinition,
  ProModulePrice,
} from '../types.js';

export const PRO_MODULE_BUNDLE_RELEASE_FORMAT = 'greybox.pro.bundle-release/v1';
export const PRO_MODULE_BUNDLE_UPLOAD_PLAN_FORMAT = 'greybox.pro.bundle-upload-plan/v1';
export const GBPRO_CONTENT_TYPE = 'application/vnd.greybox.gbpro+json';
const MANIFEST_FILE_NAME = 'manifest.json';
const MANIFEST_CONTENT_TYPE = 'application/json';
const MANIFEST_CACHE_CONTROL = 'public, max-age=60';
const BUNDLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';
const BUNDLE_HASH_PREFIX_LENGTH = 12;
const SAFE_CDN_PATH_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;

export interface ProModuleBundleReleaseOptions {
  catalog?: readonly ProModuleDefinition[];
  moduleIds?: readonly string[];
  privateKey: KeyLike;
  publicKeys: Readonly<Record<string, KeyLike>>;
  keyId: string;
  licenseSecret: string | Buffer;
  releaseChannel?: string;
  outputPrefix?: string;
  now?: number;
  nonceForModule?: (module: ProModuleDefinition, index: number) => Buffer;
}

export interface ProModuleBundleReleaseItem {
  moduleId: string;
  name: string;
  version: string;
  entitlement: ProModuleBundleReleaseEntitlement;
  fileName: string;
  cdnPath: string;
  payloadSha256: string;
  envelopeSha256: string;
  envelopeBytes: number;
  contentType: typeof GBPRO_CONTENT_TYPE;
  keyId: string;
  order: number;
}

export interface ProModuleBundleReleaseEntitlement {
  sku: string;
  licenseTier: string;
  grantKey: string;
  price: ProModulePrice;
}

export interface ProModuleBundleReleaseManifest {
  format: typeof PRO_MODULE_BUNDLE_RELEASE_FORMAT;
  generatedAt: number;
  releaseChannel: string;
  objectPrefix: string;
  keyId: string;
  itemCount: number;
  totalEnvelopeBytes: number;
  items: ProModuleBundleReleaseItem[];
  disclaimer: string;
}

export interface ProModuleBundleReleaseArtifact {
  fileName: string;
  body: string;
  envelope: ProModuleBundleEnvelope;
  manifestItem: ProModuleBundleReleaseItem;
}

export interface ProModuleBundleRelease {
  manifest: ProModuleBundleReleaseManifest;
  artifacts: ProModuleBundleReleaseArtifact[];
}

export interface ProModuleBundleReleaseUploadObject {
  kind: 'manifest' | 'bundle';
  sourceFileName: string;
  objectKey: string;
  contentType: typeof GBPRO_CONTENT_TYPE | typeof MANIFEST_CONTENT_TYPE;
  sha256: string;
  bytes: number;
  cacheControl: string;
  moduleId?: string;
  version?: string;
  payloadSha256?: string;
  envelopeSha256?: string;
  entitlementSku?: string;
  entitlementGrantKey?: string;
  entitlementLicenseTier?: string;
  keyId?: string;
}

export interface ProModuleBundleReleaseUploadPlan {
  format: typeof PRO_MODULE_BUNDLE_UPLOAD_PLAN_FORMAT;
  generatedAt: number;
  releaseChannel: string;
  objectPrefix: string;
  keyId: string;
  manifestFileName: typeof MANIFEST_FILE_NAME;
  objectCount: number;
  totalBytes: number;
  objects: ProModuleBundleReleaseUploadObject[];
  disclaimer: string;
}

function sha256(input: string | Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}

export function buildProModuleBundleRelease(
  options: ProModuleBundleReleaseOptions,
): ProModuleBundleRelease {
  const modules = selectReleaseModules(options.catalog ?? proModuleCatalog, options.moduleIds);
  assertCatalogHealthy(modules);
  const releaseChannel = normalizeCdnPathSegment(options.releaseChannel ?? 'alpha', 'releaseChannel');
  const outputPrefix = normalizeOutputPrefix(options.outputPrefix ?? 'pro-modules');

  const artifacts = modules.map((module, index) => {
    const moduleId = normalizeCdnPathSegment(module.manifest.id, 'module id');
    const version = normalizeCdnPathSegment(module.manifest.version, 'module version');
    const envelope = createGbproBundle(module, {
      privateKey: options.privateKey,
      keyId: options.keyId,
      licenseSecret: options.licenseSecret,
      ...(options.nonceForModule ? { nonce: options.nonceForModule(module, index) } : {}),
    });
    const verified = verifyGbproBundleSignature(envelope, options.publicKeys);
    if (!verified.ok) {
      throw new Error(`bundle verification failed for ${module.manifest.id}: ${verified.message}`);
    }

    const payload = decryptGbproBundle(envelope, options.licenseSecret);
    if (payload.moduleId !== module.manifest.id || payload.version !== module.manifest.version) {
      throw new Error(`bundle payload metadata mismatch for ${module.manifest.id}`);
    }
    if (payload.files.length !== module.files.length) {
      throw new Error(`bundle payload file count mismatch for ${module.manifest.id}`);
    }

    const body = stableStringify(envelope);
    if (body.includes('Proprietary and confidential')) {
      throw new Error(`public bundle envelope leaks proprietary payload text for ${module.manifest.id}`);
    }
    const envelopeSha256 = sha256(body);
    const fileName = contentAddressedBundleFileName(moduleId, version, envelopeSha256);
    const manifestItem: ProModuleBundleReleaseItem = {
      moduleId: module.manifest.id,
      name: module.manifest.name,
      version: module.manifest.version,
      entitlement: buildReleaseEntitlement(module),
      fileName,
      cdnPath: `${outputPrefix}/${releaseChannel}/${fileName}`,
      payloadSha256: envelope.payloadSha256,
      envelopeSha256,
      envelopeBytes: Buffer.byteLength(body, 'utf8'),
      contentType: GBPRO_CONTENT_TYPE,
      keyId: options.keyId,
      order: module.order,
    };
    return {
      fileName,
      body,
      envelope,
      manifestItem,
    };
  });

  const items = artifacts.map((artifact) => artifact.manifestItem);
  assertUniqueReleaseManifestItems(items);
  assertReleaseManifestObjectPaths(items, outputPrefix, releaseChannel);
  return {
    manifest: {
      format: PRO_MODULE_BUNDLE_RELEASE_FORMAT,
      generatedAt: options.now ?? Date.now(),
      releaseChannel,
      objectPrefix: outputPrefix,
      keyId: options.keyId,
      itemCount: items.length,
      totalEnvelopeBytes: items.reduce((total, item) => total + item.envelopeBytes, 0),
      items,
      disclaimer: 'Release manifests contain payload hashes, envelope hashes, CDN paths, and safe metadata only. They exclude encrypted payload bodies, license secrets, and signing material.',
    },
    artifacts,
  };
}

export function buildProModuleBundleUploadPlan(
  release: ProModuleBundleRelease,
): ProModuleBundleReleaseUploadPlan {
  assertReleaseManifestObjectPaths(
    release.manifest.items,
    release.manifest.objectPrefix,
    release.manifest.releaseChannel,
  );
  const manifestBody = stableStringify(release.manifest);
  const objects: ProModuleBundleReleaseUploadObject[] = [
    {
      kind: 'manifest',
      sourceFileName: MANIFEST_FILE_NAME,
      objectKey: `${release.manifest.objectPrefix}/${release.manifest.releaseChannel}/${MANIFEST_FILE_NAME}`,
      contentType: MANIFEST_CONTENT_TYPE,
      sha256: sha256(manifestBody),
      bytes: Buffer.byteLength(manifestBody, 'utf8'),
      cacheControl: MANIFEST_CACHE_CONTROL,
      keyId: release.manifest.keyId,
    },
    ...release.manifest.items.map((item) => ({
      kind: 'bundle' as const,
      sourceFileName: item.fileName,
      objectKey: item.cdnPath,
      contentType: item.contentType,
      sha256: item.envelopeSha256,
      bytes: item.envelopeBytes,
      cacheControl: BUNDLE_CACHE_CONTROL,
      moduleId: item.moduleId,
      version: item.version,
      payloadSha256: item.payloadSha256,
      envelopeSha256: item.envelopeSha256,
      entitlementSku: item.entitlement.sku,
      entitlementGrantKey: item.entitlement.grantKey,
      entitlementLicenseTier: item.entitlement.licenseTier,
      keyId: item.keyId,
    })),
  ];
  assertUniqueReleaseField(objects, (item) => item.objectKey, 'upload object key');
  assertUniqueReleaseField(objects, (item) => item.sourceFileName, 'upload source file');
  return {
    format: PRO_MODULE_BUNDLE_UPLOAD_PLAN_FORMAT,
    generatedAt: release.manifest.generatedAt,
    releaseChannel: release.manifest.releaseChannel,
    objectPrefix: release.manifest.objectPrefix,
    keyId: release.manifest.keyId,
    manifestFileName: MANIFEST_FILE_NAME,
    objectCount: objects.length,
    totalBytes: objects.reduce((total, item) => total + item.bytes, 0),
    objects,
    disclaimer: 'Upload plans contain storage object keys, hashes, byte counts, content types, cache policy, and entitlement SKU metadata only. They exclude encrypted payload bodies, license secrets, and signing material.',
  };
}

function assertUniqueReleaseManifestItems(items: readonly ProModuleBundleReleaseItem[]): void {
  assertUniqueReleaseField(items, (item) => item.moduleId, 'module id');
  assertUniqueReleaseField(items, (item) => item.fileName, 'file name');
  assertUniqueReleaseField(items, (item) => item.cdnPath, 'CDN path');
  assertUniqueReleaseField(items, (item) => item.entitlement.sku, 'entitlement SKU');
  assertUniqueReleaseField(items, (item) => item.entitlement.grantKey, 'entitlement grant key');
}

function assertUniqueReleaseField<T>(
  items: readonly T[],
  read: (item: T) => string,
  label: string,
): void {
  const seen = new Set<string>();
  for (const item of items) {
    const value = read(item);
    if (seen.has(value)) throw new Error(`release manifest contains duplicate ${label}: ${value}`);
    seen.add(value);
  }
}

function assertReleaseManifestObjectPaths(
  items: readonly ProModuleBundleReleaseItem[],
  outputPrefix: string,
  releaseChannel: string,
): void {
  for (const item of items) {
    const expectedHashPrefix = item.envelopeSha256.slice(0, BUNDLE_HASH_PREFIX_LENGTH);
    if (!item.fileName.endsWith(`-${expectedHashPrefix}.gbpro`)) {
      throw new Error(
        `release manifest bundle file for ${item.moduleId} must include content-addressed envelope hash prefix ${expectedHashPrefix}`,
      );
    }
    const expectedPath = `${outputPrefix}/${releaseChannel}/${item.fileName}`;
    if (item.cdnPath !== expectedPath) {
      throw new Error(`release manifest object path drift for ${item.moduleId}: expected ${expectedPath}`);
    }
  }
}

function buildReleaseEntitlement(module: ProModuleDefinition): ProModuleBundleReleaseEntitlement {
  return {
    sku: `gbpro.${module.manifest.id}`,
    licenseTier: module.manifest.licenseTier ?? 'pro',
    grantKey: `pro-module:${module.manifest.id}`,
    price: {
      currency: module.price.currency,
      oneTimeUsd: module.price.oneTimeUsd,
      ...(module.price.monthlyUsd === undefined ? {} : { monthlyUsd: module.price.monthlyUsd }),
    },
  };
}

function contentAddressedBundleFileName(
  moduleId: string,
  version: string,
  envelopeSha256: string,
): string {
  return `${moduleId}-${version}-${envelopeSha256.slice(0, BUNDLE_HASH_PREFIX_LENGTH)}.gbpro`;
}

function selectReleaseModules(
  catalog: readonly ProModuleDefinition[],
  moduleIds: readonly string[] | undefined,
): ProModuleDefinition[] {
  const sorted = [...catalog].sort((left, right) => left.order - right.order);
  if (!moduleIds?.length) return sorted.filter((module) => module.status === 'alpha-ready');

  const requested = new Set(moduleIds);
  if (requested.size !== moduleIds.length) throw new Error('moduleIds must not contain duplicates');

  const modulesById = new Map(sorted.map((module) => [module.manifest.id, module]));
  return moduleIds.map((moduleId) => {
    const module = modulesById.get(moduleId);
    if (!module) throw new Error(`unknown Pro module ${moduleId}`);
    if (module.status !== 'alpha-ready') throw new Error(`${moduleId} is not alpha-ready`);
    return module;
  });
}

function normalizeOutputPrefix(value: string): string {
  const normalized = value.replace(/^\/+|\/+$/gu, '');
  if (!normalized) throw new Error('outputPrefix must not be empty');
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/u.test(normalized)) {
    throw new Error('outputPrefix must be a CDN object prefix, not a URL or URI');
  }
  const parts = normalized.split('/');
  for (const part of parts) normalizeCdnPathSegment(part, 'outputPrefix');
  return parts.join('/');
}

function normalizeCdnPathSegment(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} must not be empty`);
  if (normalized === '.' || normalized === '..' || !SAFE_CDN_PATH_SEGMENT.test(normalized)) {
    throw new Error(`${label} must use safe CDN path characters`);
  }
  return normalized;
}
