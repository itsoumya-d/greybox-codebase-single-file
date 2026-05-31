// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { createHmac, timingSafeEqual } from 'node:crypto';
import { parseUnityLicenseTier, type LicenseValidationResponse, type UnityLicenseTier } from './licenses.js';

const SAFE_MODULE_ID_RE = /^[a-z0-9][a-z0-9-]{0,79}$/u;
const SAFE_ENTITLEMENT_GRANT_RE = /^(?:\*|[a-z0-9][a-z0-9-]{0,79}|gbpro\.[a-z0-9][a-z0-9-]{0,79}|pro-module:[a-z0-9][a-z0-9-]{0,79})$/u;
const SAFE_STORAGE_KEY_RE = /^[a-z0-9][a-z0-9._/-]{0,240}$/u;
const SAFE_VERSION_RE = /^[0-9A-Za-z][0-9A-Za-z._+-]{0,63}$/u;
const SHA256_RE = /^[a-f0-9]{64}$/iu;
const DEFAULT_DOWNLOAD_TTL_SECONDS = 15 * 60;
const PRO_MODULE_ENTITLEMENT_REGISTRY_FORMAT = 'greybox.pro.entitlement-registry/v1';
const PRO_MODULE_CLOUD_SOURCE_ENV_FORMAT = 'greybox.pro.cloud-source-env/v1';
const PRO_MODULE_CLOUD_HANDOFF_REPORT_FORMAT = 'greybox.pro.cloud-handoff-report/v1';
const PRO_MODULE_SOURCE_ENV_KEYS = [
  'GREYBOX_PRO_MODULE_BUNDLES_JSON',
  'GREYBOX_PRO_MODULE_BUNDLE_UPLOAD_PLAN_JSON',
  'GREYBOX_PRO_MODULE_BUNDLE_PUBLISH_PROOF_JSON',
] as const;
const PRO_MODULE_ENTITLEMENT_REGISTRY_ENV_KEY = 'GREYBOX_PRO_MODULE_ENTITLEMENT_REGISTRY_JSON';
const REQUIRED_PUBLISH_PROOF_CHECK_IDS = [
  'format',
  'release-channel',
  'object-prefix',
  'object-count',
  'object-integrity',
  'receipt-timeline',
  'receipt-safety',
] as const;
const REQUIRED_CLOUD_HANDOFF_CHECK_IDS = [
  'cloud-env-format',
  'required-variables',
  'parse-GREYBOX_PRO_MODULE_BUNDLES_JSON',
  'parse-GREYBOX_PRO_MODULE_BUNDLE_UPLOAD_PLAN_JSON',
  'parse-GREYBOX_PRO_MODULE_BUNDLE_PUBLISH_PROOF_JSON',
  'release-format',
  'upload-plan-format',
  'publish-proof-format',
  'publish-proof-ready',
  'production-provider',
  'module-coverage',
  'release-fields-match',
  'object-counts-match',
  'handoff-timeline',
  'sanitized-evidence',
] as const;
const REQUIRED_ENTITLEMENT_REGISTRY_CHECK_IDS = [
  'formats',
  'release-fields',
  'publish-proof-ready',
  'production-provider',
  'module-coverage',
  'manifest-upload-alignment',
  'registry-safety',
] as const;
const NON_PRODUCTION_PROVIDER_RE = /(?:^|[-_\s])(?:local|dry|dryrun|dry-run|mock|fixture|test|testmode|sandbox)(?:[-_\s]|$)/u;
const UNSAFE_HANDOFF_EVIDENCE_RE = /encryptedPayload|ciphertext|PRIVATE KEY|gbx_(?:indie|pro|studio|enterprise)_[A-Za-z0-9_-]{12,}|sk_(?:live|test)_[A-Za-z0-9_-]{12,}|AKIA[0-9A-Z]{16}|AWS_SECRET_ACCESS_KEY|AWS_SESSION_TOKEN|X-Amz-Signature=|Signature=|token=/iu;
const UNSAFE_ENTITLEMENT_REGISTRY_RE = /encryptedPayload|ciphertext|decryptedPayload|payloadBody|licenseSecret|privateKey|PRIVATE KEY|customerId|gbx_(?:indie|pro|studio|enterprise)_[A-Za-z0-9_-]{12,}|sk_(?:live|test)_[A-Za-z0-9_-]{12,}|AKIA[0-9A-Z]{16}|AWS_SECRET_ACCESS_KEY|AWS_SESSION_TOKEN|X-Amz-Signature=|Signature=|token=/iu;

export interface ProModuleSecretRequest {
  moduleId: string;
  payloadSha256?: string;
  entitlementLookupKey?: string;
}

export interface ProModuleSecretResponse {
  moduleId: string;
  licenseHash: string;
  algorithm: 'hmac-sha256-license-module-v1';
  decryptionSecret: string;
  expiresAt: string;
}

export interface ProModuleBundleRecord {
  moduleId: string;
  version: string;
  payloadSha256: string;
  envelopeSha256?: string;
  storageKey: string;
  contentType: 'application/vnd.greybox.gbpro+json' | 'application/json';
  entitlement?: ProModuleBundleEntitlement;
  sizeBytes?: number;
  createdAt?: string;
}

interface ProModuleBundleUploadObjectEvidence {
  sourceFileName: string;
  objectKey: string;
  contentType: ProModuleBundleRecord['contentType'];
  sha256: string;
  bytes: number;
  moduleId?: string;
  version?: string;
  payloadSha256?: string;
  envelopeSha256?: string;
}

interface ProModuleBundleUploadPlanEvidence {
  generatedAt?: number;
  releaseChannel?: string;
  objectPrefix?: string;
  objectCount: number;
  totalBytes: number;
  objects: ReadonlyMap<string, ProModuleBundleUploadObjectEvidence>;
}

export interface ProModuleBundleEntitlement {
  sku: string;
  licenseTier: UnityLicenseTier;
  grantKey: string;
  price?: {
    currency: 'USD';
    oneTimeUsd: number;
    monthlyUsd?: number;
  };
}

export interface ProModuleBundleDownloadResponse {
  moduleId: string;
  version: string;
  payloadSha256: string;
  envelopeSha256?: string;
  contentType: ProModuleBundleRecord['contentType'];
  downloadUrl: string;
  expiresAt: string;
  sizeBytes?: number;
}

export type ProModuleEntitlements = Readonly<Record<string, readonly string[]>>;
export type ProModuleEntitlementLookupKeys = Readonly<Record<string, {
  licenseHash?: string;
  modules: readonly string[];
  status?: ProModuleEntitlementGrantStatus;
}>>;
export type ProModuleBundleRegistry = Readonly<Record<string, ProModuleBundleRecord>>;
export interface ProModuleBundleSourceProof {
  shippedModules: number;
  signedBundles: number;
  publishedObjects?: number;
  publishProductionReady: boolean;
  publishHandoffReady: boolean;
  publishReleaseMatchReady: boolean;
}
export type ProModuleEntitlementGrantStatus = 'active' | 'revoked';

export interface ProModuleEntitlementGrantRecord {
  licenseHash: string;
  modules: readonly string[];
  lookupKey?: string;
  status?: ProModuleEntitlementGrantStatus;
}

export interface ProModuleEntitlementGrantStore {
  list(): Promise<readonly ProModuleEntitlementGrantRecord[]>;
  upsert(record: ProModuleEntitlementGrantRecord): Promise<void>;
}

export type ProModuleMarketplaceFetch = (
  url: string,
  init: {
    method: 'POST';
    headers: Record<string, string>;
    body: string;
  },
) => Promise<Pick<Response, 'ok' | 'status' | 'json'>>;

export class ProModuleSecretError extends Error {
  readonly status: number;

  constructor(readonly code: string, status: number) {
    super(code);
    this.name = 'ProModuleSecretError';
    this.status = status;
  }
}

export function proModuleEntitlementsFromEnv(env: NodeJS.ProcessEnv = process.env): ProModuleEntitlements {
  const raw = env.GREYBOX_PRO_MODULE_ENTITLEMENTS_JSON?.trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, string[]> = {};
    for (const [licenseHash, value] of Object.entries(parsed)) {
      if (!/^[a-f0-9]{16}$/iu.test(licenseHash) || !Array.isArray(value)) continue;
      const modules = value
        .filter((item): item is string => typeof item === 'string')
        .flatMap((item) => {
          const grant = normalizeProModuleEntitlementGrant(item);
          return grant ? [grant] : [];
        });
      if (modules.length > 0) out[licenseHash.toLowerCase()] = modules;
    }
    return out;
  } catch {
    return {};
  }
}

export function proModuleEntitlementLookupKeysFromEnv(env: NodeJS.ProcessEnv = process.env): ProModuleEntitlementLookupKeys {
  const raw = env.GREYBOX_PRO_MODULE_ENTITLEMENT_LOOKUP_KEYS_JSON?.trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, { licenseHash?: string; modules: string[]; status?: ProModuleEntitlementGrantStatus }> = {};
    for (const [lookupKey, value] of Object.entries(parsed)) {
      const cleanLookupKey = normalizeEntitlementLookupKey(lookupKey);
      if (!cleanLookupKey || !value || typeof value !== 'object' || Array.isArray(value)) continue;
      const record = value as Record<string, unknown>;
      const licenseHash = typeof record.licenseHash === 'string' && /^[a-f0-9]{16}$/iu.test(record.licenseHash)
        ? record.licenseHash.toLowerCase()
        : undefined;
      const modules = Array.isArray(record.modules)
        ? record.modules
          .filter((item): item is string => typeof item === 'string')
          .flatMap((item) => {
            const grant = normalizeProModuleEntitlementGrant(item);
            return grant ? [grant] : [];
          })
        : [];
      const status = normalizeProModuleEntitlementGrantStatus(record.status) ?? 'active';
      if (modules.length > 0 || status === 'revoked') {
        out[cleanLookupKey] = {
          ...(licenseHash ? { licenseHash } : {}),
          modules,
          status,
        };
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function proModuleBundleRegistryFromEnv(env: NodeJS.ProcessEnv = process.env): ProModuleBundleRegistry {
  const sourceEnv = proModuleBundleEnvWithCloudSource(env);
  const entitlementRegistryRaw = sourceEnv[PRO_MODULE_ENTITLEMENT_REGISTRY_ENV_KEY]?.trim();
  if (entitlementRegistryRaw) {
    try {
      return proModuleBundleRegistryFromEntitlementRegistry(JSON.parse(entitlementRegistryRaw));
    } catch {
      return {};
    }
  }

  const raw = sourceEnv.GREYBOX_PRO_MODULE_BUNDLES_JSON?.trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    const uploadPlanRaw = sourceEnv.GREYBOX_PRO_MODULE_BUNDLE_UPLOAD_PLAN_JSON?.trim();
    const uploadPlan = uploadPlanRaw ? JSON.parse(uploadPlanRaw) : undefined;
    const publishProofRaw = sourceEnv.GREYBOX_PRO_MODULE_BUNDLE_PUBLISH_PROOF_JSON?.trim();
    const publishProof = publishProofRaw ? JSON.parse(publishProofRaw) : undefined;
    if (releaseManifestItems(parsed) && (!uploadPlan || !publishProof)) return {};
    return proModuleBundleRegistryFromReleaseManifest(parsed, uploadPlan, publishProof);
  } catch {
    return {};
  }
}

export function proModuleBundleSourceProofFromEnv(env: NodeJS.ProcessEnv = process.env): ProModuleBundleSourceProof | undefined {
  const sourceEnv = proModuleBundleEnvWithCloudSource(env);
  if (!sourceEnv.GREYBOX_PRO_MODULE_BUNDLES_JSON?.trim()) return undefined;
  const records = Object.values(proModuleBundleRegistryFromEnv(sourceEnv));
  const publishedObjects = proModulePublishedObjectCountFromEnv(sourceEnv);
  const publishProductionReady = publishedObjects !== undefined
    && proModulePublishProofUsesProductionStorageFromEnv(sourceEnv);
  const publishReleaseMatchReady = records.length > 0 && publishedObjects !== undefined;
  const publishHandoffReady = publishReleaseMatchReady
    && proModuleCloudHandoffReadyFromEnv(sourceEnv, { records, publishedObjects });
  return {
    shippedModules: records.length,
    signedBundles: records.filter((record) => Boolean(record.envelopeSha256)).length,
    publishedObjects: publishedObjects ?? 0,
    publishProductionReady,
    publishHandoffReady,
    publishReleaseMatchReady,
  };
}

export function proModuleBundleRegistryFromReleaseManifest(
  input: unknown,
  uploadPlan?: unknown,
  publishProof?: unknown,
): ProModuleBundleRegistry {
  const manifestItems = releaseManifestItems(input);
  const uploadEvidence = manifestItems && uploadPlan !== undefined ? releaseUploadPlanEvidence(uploadPlan) : undefined;
  if (manifestItems && uploadPlan !== undefined && !uploadEvidence) return {};
  if (manifestItems && uploadEvidence && !releaseUploadPlanMatchesManifest(input, uploadEvidence)) return {};
  if (manifestItems && publishProof !== undefined && (!uploadEvidence || !releasePublishProofMatchesUploadPlan(publishProof, uploadEvidence))) return {};
  const entries = manifestItems ?? (Array.isArray(input) ? input : Object.values(isRecord(input) ? input : {}));
  const out: Record<string, ProModuleBundleRecord> = {};
  for (const value of entries) {
    const record = manifestItems
      ? normalizeProModuleBundleReleaseItem(value, uploadEvidence?.objects)
      : normalizeProModuleBundleRecord(value);
    if (record) out[record.moduleId] = record;
  }
  return out;
}

function proModuleBundleEnvWithCloudSource(env: Record<string, string | undefined>): Record<string, string | undefined> {
  const cloudEnv = proModuleBundleEnvFromCloudSource(env);
  if (!cloudEnv) return env;
  const merged: Record<string, string | undefined> = { ...cloudEnv };
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) merged[key] = value;
  }
  return merged;
}

function proModuleBundleEnvFromCloudSource(
  env: Record<string, string | undefined>,
): Partial<Record<(typeof PRO_MODULE_SOURCE_ENV_KEYS)[number] | typeof PRO_MODULE_ENTITLEMENT_REGISTRY_ENV_KEY, string>> | undefined {
  const raw = env.GREYBOX_PRO_MODULE_CLOUD_SOURCE_ENV_JSON?.trim();
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.format !== PRO_MODULE_CLOUD_SOURCE_ENV_FORMAT || !isRecord(parsed.variables)) {
      return undefined;
    }
    const out: Partial<Record<(typeof PRO_MODULE_SOURCE_ENV_KEYS)[number] | typeof PRO_MODULE_ENTITLEMENT_REGISTRY_ENV_KEY, string>> = {};
    for (const key of PRO_MODULE_SOURCE_ENV_KEYS) {
      const value = parsed.variables[key];
      if (typeof value !== 'string' || !value.trim()) return undefined;
      out[key] = value;
    }
    const entitlementRegistry = parsed.variables[PRO_MODULE_ENTITLEMENT_REGISTRY_ENV_KEY];
    if (typeof entitlementRegistry === 'string' && entitlementRegistry.trim()) {
      out[PRO_MODULE_ENTITLEMENT_REGISTRY_ENV_KEY] = entitlementRegistry;
    }
    return out;
  } catch {
    return undefined;
  }
}

function proModulePublishedObjectCountFromEnv(env: Record<string, string | undefined>): number | undefined {
  const uploadPlanRaw = env.GREYBOX_PRO_MODULE_BUNDLE_UPLOAD_PLAN_JSON?.trim();
  const publishProofRaw = env.GREYBOX_PRO_MODULE_BUNDLE_PUBLISH_PROOF_JSON?.trim();
  if (!uploadPlanRaw || !publishProofRaw) return undefined;
  try {
    const uploadEvidence = releaseUploadPlanEvidence(JSON.parse(uploadPlanRaw));
    const publishProof = JSON.parse(publishProofRaw);
    return uploadEvidence && releasePublishProofMatchesUploadPlan(publishProof, uploadEvidence)
      ? uploadEvidence.objectCount
      : undefined;
  } catch {
    return undefined;
  }
}

function proModulePublishProofUsesProductionStorageFromEnv(env: Record<string, string | undefined>): boolean {
  const publishProofRaw = env.GREYBOX_PRO_MODULE_BUNDLE_PUBLISH_PROOF_JSON?.trim();
  if (!publishProofRaw) return false;
  try {
    return releasePublishProofUsesProductionStorage(JSON.parse(publishProofRaw));
  } catch {
    return false;
  }
}

function proModuleCloudHandoffReadyFromEnv(
  env: Record<string, string | undefined>,
  options: {
    records: readonly ProModuleBundleRecord[];
    publishedObjects: number;
  },
): boolean {
  const raw = env.GREYBOX_PRO_MODULE_CLOUD_HANDOFF_REPORT_JSON?.trim();
  if (!raw) return false;
  try {
    return releaseCloudHandoffReportReady(JSON.parse(raw), options);
  } catch {
    return false;
  }
}

function releaseManifestItems(input: unknown): unknown[] | undefined {
  if (!isRecord(input) || input.format !== 'greybox.pro.bundle-release/v1' || !Array.isArray(input.items)) {
    return undefined;
  }
  const createdAt = releaseManifestCreatedAt(input.generatedAt);
  return input.items.map((item) => {
    if (!isRecord(item)) return item;
    return {
      ...item,
      ...(createdAt ? { createdAt } : {}),
    };
  });
}

function normalizeProModuleBundleReleaseItem(
  input: unknown,
  uploadObjects?: ReadonlyMap<string, ProModuleBundleUploadObjectEvidence>,
): ProModuleBundleRecord | undefined {
  if (!isRecord(input)) return undefined;
  const fileName = typeof input.fileName === 'string' ? input.fileName.trim() : '';
  const storageKey = typeof input.cdnPath === 'string' ? normalizeStorageKey(input.cdnPath) : undefined;
  const envelopeSha256 = typeof input.envelopeSha256 === 'string' ? input.envelopeSha256.trim().toLowerCase() : '';
  const envelopeBytes = Number(input.envelopeBytes);
  const contentType = input.contentType === 'application/json' ? 'application/json' : 'application/vnd.greybox.gbpro+json';
  if (!fileName || !storageKey || storageKey.split('/').pop() !== fileName || !SHA256_RE.test(envelopeSha256)) {
    return undefined;
  }
  if (!Number.isInteger(envelopeBytes) || envelopeBytes <= 0) return undefined;
  if (uploadObjects && !releaseUploadObjectMatches({
    input,
    uploadObject: uploadObjects.get(storageKey),
    fileName,
    storageKey,
    envelopeSha256,
    envelopeBytes,
    contentType,
  })) {
    return undefined;
  }
  return normalizeProModuleBundleRecord({
    moduleId: input.moduleId,
    version: input.version,
    payloadSha256: input.payloadSha256,
    envelopeSha256,
    storageKey,
    contentType,
    entitlement: input.entitlement,
    sizeBytes: envelopeBytes,
    createdAt: input.createdAt,
  });
}

function releaseUploadPlanEvidence(input: unknown): ProModuleBundleUploadPlanEvidence | undefined {
  if (!isRecord(input) || input.format !== 'greybox.pro.bundle-upload-plan/v1' || !Array.isArray(input.objects)) {
    return undefined;
  }
  let hasManifestObject = false;
  let totalBytes = 0;
  const out = new Map<string, ProModuleBundleUploadObjectEvidence>();
  for (const object of input.objects) {
    if (!isRecord(object)) return undefined;
    if (object.kind === 'manifest') {
      const sourceFileName = typeof object.sourceFileName === 'string' ? object.sourceFileName.trim() : '';
      const objectKey = typeof object.objectKey === 'string' ? normalizeStorageKey(object.objectKey) : undefined;
      const sha256 = typeof object.sha256 === 'string' ? object.sha256.trim().toLowerCase() : '';
      const bytes = Number(object.bytes);
      if (
        sourceFileName !== 'manifest.json'
        || !objectKey
        || !objectKey.endsWith('/manifest.json')
        || object.contentType !== 'application/json'
        || !SHA256_RE.test(sha256)
        || !Number.isInteger(bytes)
        || bytes <= 0
      ) {
        return undefined;
      }
      hasManifestObject = true;
      totalBytes += bytes;
      continue;
    }
    if (object.kind !== 'bundle') return undefined;
    const sourceFileName = typeof object.sourceFileName === 'string' ? object.sourceFileName.trim() : '';
    const objectKey = typeof object.objectKey === 'string' ? normalizeStorageKey(object.objectKey) : undefined;
    const sha256 = typeof object.sha256 === 'string' ? object.sha256.trim().toLowerCase() : '';
    const bytes = Number(object.bytes);
    if (object.contentType !== 'application/json' && object.contentType !== 'application/vnd.greybox.gbpro+json') {
      return undefined;
    }
    const contentType = object.contentType;
    if (!sourceFileName || !objectKey || objectKey.split('/').pop() !== sourceFileName || !SHA256_RE.test(sha256)) {
      return undefined;
    }
    if (!Number.isInteger(bytes) || bytes <= 0 || out.has(objectKey)) return undefined;
    totalBytes += bytes;
    out.set(objectKey, {
      sourceFileName,
      objectKey,
      contentType,
      sha256,
      bytes,
      ...(typeof object.moduleId === 'string' ? { moduleId: object.moduleId.trim() } : {}),
      ...(typeof object.version === 'string' ? { version: object.version.trim() } : {}),
      ...(typeof object.payloadSha256 === 'string' ? { payloadSha256: object.payloadSha256.trim().toLowerCase() } : {}),
      ...(typeof object.envelopeSha256 === 'string' ? { envelopeSha256: object.envelopeSha256.trim().toLowerCase() } : {}),
    });
  }
  const objectCount = out.size + 1;
  if (typeof input.objectCount === 'number' && input.objectCount !== objectCount) return undefined;
  if (typeof input.totalBytes === 'number' && input.totalBytes !== totalBytes) return undefined;
  const generatedAt = typeof input.generatedAt === 'number' && Number.isInteger(input.generatedAt) && input.generatedAt > 0
    ? input.generatedAt
    : undefined;
  return hasManifestObject
    ? {
      ...(generatedAt ? { generatedAt } : {}),
      releaseChannel: typeof input.releaseChannel === 'string' ? input.releaseChannel.trim() : undefined,
      objectPrefix: typeof input.objectPrefix === 'string' ? input.objectPrefix.trim() : undefined,
      objectCount,
      totalBytes,
      objects: out,
    }
    : undefined;
}

function releaseUploadPlanMatchesManifest(
  manifest: unknown,
  uploadPlan: ProModuleBundleUploadPlanEvidence,
): boolean {
  if (!isRecord(manifest)) return false;
  if (typeof manifest.releaseChannel === 'string' && uploadPlan.releaseChannel && manifest.releaseChannel !== uploadPlan.releaseChannel) {
    return false;
  }
  if (typeof manifest.objectPrefix === 'string' && uploadPlan.objectPrefix && manifest.objectPrefix !== uploadPlan.objectPrefix) {
    return false;
  }
  return true;
}

function releasePublishProofMatchesUploadPlan(
  input: unknown,
  uploadPlan: ProModuleBundleUploadPlanEvidence,
): boolean {
  if (!isRecord(input) || input.format !== 'greybox.pro.bundle-publish-proof/v1' || input.ready !== true) {
    return false;
  }
  const generatedAt = Number(input.generatedAt);
  if (!Number.isInteger(generatedAt) || generatedAt <= 0) return false;
  if (uploadPlan.generatedAt && generatedAt < uploadPlan.generatedAt) return false;
  if (uploadPlan.releaseChannel && input.releaseChannel !== uploadPlan.releaseChannel) return false;
  if (uploadPlan.objectPrefix && input.objectPrefix !== uploadPlan.objectPrefix) return false;
  if (!isRecord(input.uploadPlan) || !isRecord(input.receipt)) return false;
  if (input.uploadPlan.objectCount !== uploadPlan.objectCount || input.uploadPlan.totalBytes !== uploadPlan.totalBytes) {
    return false;
  }
  if (input.receipt.objectCount !== uploadPlan.objectCount || input.receipt.totalBytes !== uploadPlan.totalBytes) {
    return false;
  }
  for (const key of ['missingObjectKeys', 'extraObjectKeys', 'duplicateObjectKeys', 'mismatches', 'unsafeReceiptFields', 'receiptTimelineIssues'] as const) {
    if (!Array.isArray(input[key]) || input[key].length !== 0) return false;
  }
  if (!Array.isArray(input.checks) || input.checks.length === 0) return false;
  const checksById = new Map(input.checks.flatMap((check) => (
    isRecord(check) && typeof check.id === 'string' ? [[check.id, check]] : []
  )));
  return input.checks.every((check) => isRecord(check) && check.status === 'pass')
    && REQUIRED_PUBLISH_PROOF_CHECK_IDS.every((id) => checksById.get(id)?.status === 'pass');
}

function releasePublishProofUsesProductionStorage(input: unknown): boolean {
  if (!isRecord(input) || !isRecord(input.receipt) || typeof input.receipt.provider !== 'string') return false;
  const provider = input.receipt.provider.trim().toLowerCase();
  return isProductionStorageProvider(provider);
}

function releaseCloudHandoffReportReady(
  input: unknown,
  options: {
    records: readonly ProModuleBundleRecord[];
    publishedObjects: number;
  },
): boolean {
  if (!isRecord(input) || input.format !== PRO_MODULE_CLOUD_HANDOFF_REPORT_FORMAT || input.ready !== true) {
    return false;
  }
  if (UNSAFE_HANDOFF_EVIDENCE_RE.test(JSON.stringify(input))) return false;
  if (typeof input.provider !== 'string' || !isProductionStorageProvider(input.provider)) return false;
  const generatedAt = Number(input.generatedAt);
  if (!Number.isInteger(generatedAt) || generatedAt <= 0) return false;
  if (input.objectCount !== options.publishedObjects) return false;
  if (!Number.isFinite(Number(input.totalBytes)) || Number(input.totalBytes) <= 0) return false;
  if (typeof input.releaseChannel !== 'string' || !input.releaseChannel.trim()) return false;
  if (typeof input.objectPrefix !== 'string' || !input.objectPrefix.trim()) return false;
  if (typeof input.keyId !== 'string' || !input.keyId.trim()) return false;
  const expectedModuleIds = options.records.map((record) => record.moduleId).sort();
  const reportModuleIds = Array.isArray(input.moduleIds)
    ? input.moduleIds.filter((item): item is string => typeof item === 'string').sort()
    : [];
  if (!sameStringList(expectedModuleIds, reportModuleIds)) return false;
  if (!Array.isArray(input.checks) || input.checks.length === 0) return false;
  const checksById = new Map(input.checks.flatMap((check) => (
    isRecord(check) && typeof check.id === 'string' ? [[check.id, check]] : []
  )));
  return input.checks.every((check) => isRecord(check) && check.status === 'pass')
    && REQUIRED_CLOUD_HANDOFF_CHECK_IDS.every((id) => checksById.get(id)?.status === 'pass');
}

export function proModuleBundleRegistryFromEntitlementRegistry(input: unknown): ProModuleBundleRegistry {
  if (!entitlementRegistryReady(input)) return {};
  const createdAt = releaseManifestCreatedAt(input.generatedAt);
  const out: Record<string, ProModuleBundleRecord> = {};
  const seenSkus = new Set<string>();
  const seenGrantKeys = new Set<string>();
  for (const item of input.importItems) {
    const record = normalizeProModuleBundleEntitlementRegistryImportItem(item, createdAt);
    if (!record?.entitlement) return {};
    if (out[record.moduleId] || seenSkus.has(record.entitlement.sku) || seenGrantKeys.has(record.entitlement.grantKey)) {
      return {};
    }
    out[record.moduleId] = record;
    seenSkus.add(record.entitlement.sku);
    seenGrantKeys.add(record.entitlement.grantKey);
  }
  return out;
}

function entitlementRegistryReady(input: unknown): input is Record<string, unknown> & { importItems: unknown[] } {
  if (!isRecord(input) || input.format !== PRO_MODULE_ENTITLEMENT_REGISTRY_FORMAT || input.ready !== true) {
    return false;
  }
  const serialized = JSON.stringify(input);
  if (UNSAFE_ENTITLEMENT_REGISTRY_RE.test(serialized)) return false;
  if (typeof input.provider !== 'string' || !isProductionStorageProvider(input.provider)) return false;
  const generatedAt = Number(input.generatedAt);
  if (!Number.isInteger(generatedAt) || generatedAt <= 0) return false;
  if (!Array.isArray(input.importItems) || input.importItems.length === 0) return false;
  if (input.itemCount !== input.importItems.length) return false;
  if (!Array.isArray(input.issues) || input.issues.length !== 0) return false;
  if (!Array.isArray(input.checks) || input.checks.length === 0) return false;
  const checksById = new Map(input.checks.flatMap((check) => (
    isRecord(check) && typeof check.id === 'string' ? [[check.id, check]] : []
  )));
  if (!input.checks.every((check) => isRecord(check) && check.status === 'pass')) return false;
  if (!REQUIRED_ENTITLEMENT_REGISTRY_CHECK_IDS.every((id) => checksById.get(id)?.status === 'pass')) return false;
  if (!isRecord(input.summary) || input.summary.productionPublishProof !== true) return false;
  if (input.summary.manifestModules !== input.importItems.length) return false;
  if (input.summary.uploadPlanBundleObjects !== input.importItems.length) return false;
  if (input.summary.publishProofBundleModules !== input.importItems.length) return false;
  return true;
}

function normalizeProModuleBundleEntitlementRegistryImportItem(
  input: unknown,
  createdAt: string | undefined,
): ProModuleBundleRecord | undefined {
  if (!isRecord(input) || !registryImportItemReadinessOk(input.readiness)) return undefined;
  const objectKey = typeof input.objectKey === 'string' ? normalizeStorageKey(input.objectKey) : undefined;
  const cdnPath = typeof input.cdnPath === 'string' ? normalizeStorageKey(input.cdnPath) : undefined;
  if (!objectKey || !cdnPath || cdnPath !== objectKey) return undefined;
  if (!objectKey.endsWith('.gbpro')) return undefined;
  const contentType = input.contentType === undefined
    ? 'application/vnd.greybox.gbpro+json'
    : input.contentType;
  if (contentType !== 'application/vnd.greybox.gbpro+json') return undefined;
  const sizeBytes = registryImportItemSizeBytes(input);
  if (sizeBytes === null) return undefined;
  const record = normalizeProModuleBundleRecord({
    moduleId: input.moduleId,
    version: input.version,
    payloadSha256: input.payloadSha256,
    envelopeSha256: input.envelopeSha256,
    storageKey: objectKey,
    contentType,
    entitlement: {
      sku: input.sku,
      grantKey: input.grantKey,
      licenseTier: input.licenseTier,
      price: input.price,
    },
    ...(sizeBytes ? { sizeBytes } : {}),
    ...(createdAt ? { createdAt } : {}),
  });
  if (!record?.entitlement || !record.envelopeSha256) return undefined;
  if (input.price !== undefined && !record.entitlement.price) return undefined;
  if (!record.entitlement.price || (record.entitlement.price.oneTimeUsd <= 0 && (record.entitlement.price.monthlyUsd ?? 0) <= 0)) {
    return undefined;
  }
  if (record.entitlement.licenseTier !== 'pro' && record.entitlement.licenseTier !== 'studio') return undefined;
  return record.entitlement.sku === `gbpro.${record.moduleId}`
    && record.entitlement.grantKey === `pro-module:${record.moduleId}`
    ? record
    : undefined;
}

function registryImportItemReadinessOk(input: unknown): boolean {
  if (!isRecord(input)) return false;
  return input.manifestPresent === true
    && input.uploadPlanned === true
    && input.publishProofReady === true
    && input.productionPublishProof === true
    && (input.cloudHandoffAligned === undefined || input.cloudHandoffAligned === true);
}

function registryImportItemSizeBytes(input: Record<string, unknown>): number | undefined | null {
  for (const key of ['sizeBytes', 'envelopeBytes', 'bytes'] as const) {
    if (input[key] === undefined) continue;
    const value = Number(input[key]);
    return Number.isInteger(value) && value > 0 ? value : null;
  }
  return undefined;
}

function isProductionStorageProvider(provider: string): boolean {
  const normalized = provider.trim().toLowerCase();
  return Boolean(normalized) && !NON_PRODUCTION_PROVIDER_RE.test(normalized);
}

function sameStringList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function releaseUploadObjectMatches(options: {
  input: Record<string, unknown>;
  uploadObject: ProModuleBundleUploadObjectEvidence | undefined;
  fileName: string;
  storageKey: string;
  envelopeSha256: string;
  envelopeBytes: number;
  contentType: ProModuleBundleRecord['contentType'];
}): boolean {
  const object = options.uploadObject;
  if (!object) return false;
  const moduleId = typeof options.input.moduleId === 'string' ? options.input.moduleId.trim() : '';
  const version = typeof options.input.version === 'string' ? options.input.version.trim() : '';
  const payloadSha256 = typeof options.input.payloadSha256 === 'string' ? options.input.payloadSha256.trim().toLowerCase() : '';
  return object.sourceFileName === options.fileName
    && object.objectKey === options.storageKey
    && object.contentType === options.contentType
    && object.sha256 === options.envelopeSha256
    && object.bytes === options.envelopeBytes
    && (!object.moduleId || object.moduleId === moduleId)
    && (!object.version || object.version === version)
    && (!object.payloadSha256 || object.payloadSha256 === payloadSha256)
    && (!object.envelopeSha256 || object.envelopeSha256 === options.envelopeSha256);
}

function releaseManifestCreatedAt(value: unknown): string | undefined {
  const generatedAt = Number(value);
  if (!Number.isFinite(generatedAt)) return undefined;
  const date = new Date(generatedAt);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function normalizeProModuleBundleRecord(input: unknown): ProModuleBundleRecord | undefined {
  if (!isRecord(input)) return undefined;
  const moduleId = typeof input.moduleId === 'string' ? input.moduleId.trim() : '';
  const version = typeof input.version === 'string' ? input.version.trim() : '';
  const payloadSha256 = typeof input.payloadSha256 === 'string' ? input.payloadSha256.trim().toLowerCase() : '';
  const envelopeSha256 = typeof input.envelopeSha256 === 'string' ? input.envelopeSha256.trim().toLowerCase() : undefined;
  const storageKey = typeof input.storageKey === 'string' ? normalizeStorageKey(input.storageKey) : undefined;
  if (
    !SAFE_MODULE_ID_RE.test(moduleId)
    || !SAFE_VERSION_RE.test(version)
    || !SHA256_RE.test(payloadSha256)
    || (envelopeSha256 !== undefined && !SHA256_RE.test(envelopeSha256))
    || !storageKey
  ) {
    return undefined;
  }
  const contentType = input.contentType === 'application/json' ? 'application/json' : 'application/vnd.greybox.gbpro+json';
  const entitlement = normalizeProModuleBundleEntitlement(input.entitlement);
  const sizeBytes = Number.isInteger(input.sizeBytes) && Number(input.sizeBytes) > 0
    ? Number(input.sizeBytes)
    : undefined;
  const createdAt = typeof input.createdAt === 'string' && !Number.isNaN(Date.parse(input.createdAt))
    ? input.createdAt
    : undefined;
  return {
    moduleId,
    version,
    payloadSha256,
    ...(envelopeSha256 ? { envelopeSha256 } : {}),
    storageKey,
    contentType,
    ...(entitlement ? { entitlement } : {}),
    ...(sizeBytes ? { sizeBytes } : {}),
    ...(createdAt ? { createdAt } : {}),
  };
}

function normalizeProModuleBundleEntitlement(input: unknown): ProModuleBundleEntitlement | undefined {
  if (!isRecord(input)) return undefined;
  const moduleIdFromSku = typeof input.sku === 'string'
    ? input.sku.trim().match(/^gbpro\.([a-z0-9][a-z0-9-]{0,79})$/u)?.[1]
    : undefined;
  const moduleIdFromGrant = typeof input.grantKey === 'string'
    ? input.grantKey.trim().match(/^pro-module:([a-z0-9][a-z0-9-]{0,79})$/u)?.[1]
    : undefined;
  if (!moduleIdFromSku || !moduleIdFromGrant || moduleIdFromSku !== moduleIdFromGrant) return undefined;
  const licenseTier = parseUnityLicenseTier(input.licenseTier);
  if (!licenseTier) return undefined;
  const price = normalizeProModuleEntitlementPrice(input.price);
  return {
    sku: `gbpro.${moduleIdFromSku}`,
    licenseTier,
    grantKey: `pro-module:${moduleIdFromSku}`,
    ...(price ? { price } : {}),
  };
}

function normalizeProModuleEntitlementPrice(input: unknown): ProModuleBundleEntitlement['price'] | undefined {
  if (!isRecord(input) || input.currency !== 'USD') return undefined;
  const oneTimeUsd = Number(input.oneTimeUsd);
  if (!Number.isInteger(oneTimeUsd) || oneTimeUsd < 0 || oneTimeUsd > 100_000) return undefined;
  const monthlyUsd = input.monthlyUsd === undefined ? undefined : Number(input.monthlyUsd);
  if (monthlyUsd !== undefined && (!Number.isInteger(monthlyUsd) || monthlyUsd < 0 || monthlyUsd > 100_000)) return undefined;
  return {
    currency: 'USD',
    oneTimeUsd,
    ...(monthlyUsd === undefined ? {} : { monthlyUsd }),
  };
}

function normalizeStorageKey(value: string): string | undefined {
  const clean = value.trim().replace(/^\/+/u, '');
  if (
    !SAFE_STORAGE_KEY_RE.test(clean)
    || clean.includes('..')
    || clean.includes('//')
    || clean.endsWith('/')
  ) {
    return undefined;
  }
  return clean;
}

export function normalizeProModuleEntitlementGrant(value: string): string | undefined {
  const clean = value.trim();
  return SAFE_ENTITLEMENT_GRANT_RE.test(clean) ? clean : undefined;
}

export function normalizeProModuleLicenseHash(value: string): string | undefined {
  const clean = value.trim().toLowerCase();
  return /^[a-f0-9]{16}$/u.test(clean) ? clean : undefined;
}

export function normalizeEntitlementLookupKey(value: string): string | undefined {
  const clean = value.trim();
  if (!/^gbx_[A-Za-z0-9._-]{1,180}$/u.test(clean)) return undefined;
  return clean;
}

export function proModuleEntitlementsFromGrantRecords(
  records: readonly ProModuleEntitlementGrantRecord[],
): ProModuleEntitlements {
  const out: Record<string, string[]> = {};
  for (const record of records) {
    if (record.status === 'revoked') continue;
    const licenseHash = normalizeProModuleLicenseHash(record.licenseHash);
    if (!licenseHash) continue;
    const grants = record.modules.flatMap((item) => {
      const grant = normalizeProModuleEntitlementGrant(item);
      return grant ? [grant] : [];
    });
    if (grants.length === 0) continue;
    out[licenseHash] = uniqueGrants([...(out[licenseHash] ?? []), ...grants]);
  }
  return out;
}

export function proModuleEntitlementLookupKeysFromGrantRecords(
  records: readonly ProModuleEntitlementGrantRecord[],
): ProModuleEntitlementLookupKeys {
  const out: Record<string, { licenseHash?: string; modules: string[]; status?: ProModuleEntitlementGrantStatus }> = {};
  for (const record of records) {
    if (!record.lookupKey) continue;
    const lookupKey = normalizeEntitlementLookupKey(record.lookupKey);
    const licenseHash = normalizeProModuleLicenseHash(record.licenseHash);
    if (!lookupKey || !licenseHash) continue;
    const grants = record.modules.flatMap((item) => {
      const grant = normalizeProModuleEntitlementGrant(item);
      return grant ? [grant] : [];
    });
    const status = normalizeProModuleEntitlementGrantStatus(record.status) ?? 'active';
    if (grants.length === 0 && status !== 'revoked') continue;
    const existing = out[lookupKey]?.modules ?? [];
    out[lookupKey] = {
      licenseHash,
      modules: status === 'revoked' ? [] : uniqueGrants([...existing, ...grants]),
      status,
    };
  }
  return out;
}

export function mergeProModuleEntitlements(
  ...sources: readonly ProModuleEntitlements[]
): ProModuleEntitlements {
  const out: Record<string, string[]> = {};
  for (const source of sources) {
    for (const [licenseHash, grants] of Object.entries(source)) {
      const cleanHash = normalizeProModuleLicenseHash(licenseHash);
      if (!cleanHash) continue;
      out[cleanHash] = uniqueGrants([...(out[cleanHash] ?? []), ...grants]);
    }
  }
  return out;
}

export function mergeProModuleEntitlementLookupKeys(
  ...sources: readonly ProModuleEntitlementLookupKeys[]
): ProModuleEntitlementLookupKeys {
  const out: Record<string, { licenseHash?: string; modules: string[]; status?: ProModuleEntitlementGrantStatus }> = {};
  for (const source of sources) {
    for (const [lookupKey, record] of Object.entries(source)) {
      const cleanLookupKey = normalizeEntitlementLookupKey(lookupKey);
      if (!cleanLookupKey) continue;
      const licenseHash = record.licenseHash ? normalizeProModuleLicenseHash(record.licenseHash) : undefined;
      const modules = record.modules.flatMap((item) => {
        const grant = normalizeProModuleEntitlementGrant(item);
        return grant ? [grant] : [];
      });
      const existing = out[cleanLookupKey]?.modules ?? [];
      if (record.status === 'revoked') {
        out[cleanLookupKey] = {
          ...(licenseHash ? { licenseHash } : {}),
          modules: [],
          status: 'revoked',
        };
        continue;
      }
      if (modules.length === 0) continue;
      if (out[cleanLookupKey]?.status === 'revoked') continue;
      out[cleanLookupKey] = {
        ...(licenseHash ? { licenseHash } : {}),
        modules: uniqueGrants([...existing, ...modules]),
        status: 'active',
      };
    }
  }
  return out;
}

function normalizeProModuleEntitlementGrantStatus(value: unknown): ProModuleEntitlementGrantStatus | undefined {
  if (typeof value !== 'string') return undefined;
  const clean = value.trim().toLowerCase();
  return clean === 'active' || clean === 'revoked' ? clean : undefined;
}

function uniqueGrants(grants: readonly string[]): string[] {
  return [...new Set(grants)];
}

function cleanMarketplaceUrl(value: string | undefined): string | undefined {
  const clean = value?.trim();
  if (!clean) return undefined;
  try {
    const url = new URL(clean);
    const hostname = url.hostname.replace(/^\[|\]$/gu, '').toLowerCase();
    if (url.protocol !== 'https:' && !['localhost', '127.0.0.1', '::1'].includes(hostname)) return undefined;
    return url.toString().replace(/\/$/u, '');
  } catch {
    return undefined;
  }
}

export function normalizeProModuleSecretRequest(input: unknown): ProModuleSecretRequest {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ProModuleSecretError('bad_pro_module_secret_request', 400);
  }
  const record = input as Record<string, unknown>;
  const moduleId = typeof record.moduleId === 'string' ? record.moduleId.trim() : '';
  const payloadSha256 = typeof record.payloadSha256 === 'string' ? record.payloadSha256.trim().toLowerCase() : undefined;
  const entitlementLookupKey = typeof record.entitlementLookupKey === 'string'
    ? normalizeEntitlementLookupKey(record.entitlementLookupKey)
    : undefined;
  if (!SAFE_MODULE_ID_RE.test(moduleId)) {
    throw new ProModuleSecretError('bad_pro_module_id', 400);
  }
  if (payloadSha256 && !SHA256_RE.test(payloadSha256)) {
    throw new ProModuleSecretError('bad_payload_sha256', 400);
  }
  if (record.entitlementLookupKey !== undefined && !entitlementLookupKey) {
    throw new ProModuleSecretError('bad_entitlement_lookup_key', 400);
  }
  return {
    moduleId,
    ...(payloadSha256 ? { payloadSha256 } : {}),
    ...(entitlementLookupKey ? { entitlementLookupKey } : {}),
  };
}

export function isProModuleEntitled(
  license: Pick<LicenseValidationResponse, 'tier' | 'licenseHash'>,
  moduleId: string,
  entitlements: ProModuleEntitlements = {},
  entitlementLookupKeys: ProModuleEntitlementLookupKeys = {},
  entitlementLookupKey?: string,
  bundleRecord?: Pick<ProModuleBundleRecord, 'entitlement'>,
): boolean {
  if (bundleRecord?.entitlement) {
    if (licenseTierRank(license.tier) >= licenseTierRank(bundleRecord.entitlement.licenseTier)) return true;
  } else if (license.tier === 'pro' || license.tier === 'studio') {
    return true;
  }
  const modules = entitlements[license.licenseHash.toLowerCase()] ?? [];
  if (hasProModuleGrant(modules, moduleId, bundleRecord)) return true;
  if (!entitlementLookupKey) return false;
  const lookup = entitlementLookupKeys[entitlementLookupKey];
  if (!lookup) return false;
  if (lookup.status === 'revoked') return false;
  if (lookup.licenseHash && lookup.licenseHash !== license.licenseHash.toLowerCase()) return false;
  return hasProModuleGrant(lookup.modules, moduleId, bundleRecord);
}

function hasProModuleGrant(
  grants: readonly string[],
  moduleId: string,
  bundleRecord?: Pick<ProModuleBundleRecord, 'entitlement'>,
): boolean {
  if (grants.includes('*')) return true;
  const entitlement = bundleRecord?.entitlement;
  if (entitlement) return grants.includes(entitlement.sku) || grants.includes(entitlement.grantKey);
  return grants.includes(moduleId);
}

function licenseTierRank(tier: UnityLicenseTier): number {
  switch (tier) {
    case 'free-personal':
      return 0;
    case 'indie':
      return 1;
    case 'pro':
      return 2;
    case 'studio':
      return 3;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export async function marketplaceEntitlementLookupKeysForRequest(
  request: ProModuleSecretRequest,
  license: Pick<LicenseValidationResponse, 'licenseHash'>,
  options: {
    marketplaceUrl?: string;
    marketplaceAdminToken?: string;
    fetchFn?: ProModuleMarketplaceFetch;
    bundleRecord?: Pick<ProModuleBundleRecord, 'entitlement'>;
  },
): Promise<ProModuleEntitlementLookupKeys> {
  const claim = await marketplaceEntitlementGrantForRequest(request, license, options);
  if (!claim || claim.status === 'revoked') return {};
  return claim.lookupKey
    ? {
      [claim.lookupKey]: {
        licenseHash: claim.licenseHash,
        modules: claim.modules,
        status: 'active',
      },
    }
    : {};
}

export async function marketplaceEntitlementGrantForRequest(
  request: ProModuleSecretRequest,
  license: Pick<LicenseValidationResponse, 'licenseHash'>,
  options: {
    marketplaceUrl?: string;
    marketplaceAdminToken?: string;
    fetchFn?: ProModuleMarketplaceFetch;
    bundleRecord?: Pick<ProModuleBundleRecord, 'entitlement'>;
  },
): Promise<ProModuleEntitlementGrantRecord | undefined> {
  if (!request.entitlementLookupKey) return undefined;
  const marketplaceUrl = cleanMarketplaceUrl(options.marketplaceUrl);
  const marketplaceAdminToken = options.marketplaceAdminToken?.trim();
  if (!marketplaceUrl || !marketplaceAdminToken) return undefined;
  const revokedGrant = (): ProModuleEntitlementGrantRecord => ({
    licenseHash: license.licenseHash,
    lookupKey: request.entitlementLookupKey,
    modules: marketplaceGrantModules(request, options.bundleRecord),
    status: 'revoked',
  });

  try {
    const response = await (options.fetchFn ?? fetch)(`${marketplaceUrl}/v1/marketplace/entitlements/claim`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${marketplaceAdminToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(marketplaceEntitlementClaimBody(request, license, options.bundleRecord)),
    });
    if (!response.ok) return revokedGrant();
    const json = await response.json();
    if (!isRecord(json) || !isRecord(json.entitlement)) return revokedGrant();
    const entitlement = json.entitlement;
    const status = normalizeProModuleEntitlementGrantStatus(entitlement.status);
    if (!status || !isRecord(entitlement.activation) || !isRecord(entitlement.proModule)) {
      return revokedGrant();
    }
    if (entitlement.activation.lookupKey !== request.entitlementLookupKey) return revokedGrant();
    if (entitlement.activation.licenseHash !== license.licenseHash) return revokedGrant();
    if (entitlement.proModule.moduleId !== request.moduleId) return revokedGrant();
    if (!marketplaceClaimMatchesBundleEntitlement(entitlement.proModule, options.bundleRecord)) return revokedGrant();
    return {
      licenseHash: license.licenseHash,
      lookupKey: request.entitlementLookupKey,
      modules: marketplaceGrantModules(request, options.bundleRecord),
      status,
    };
  } catch {
    return revokedGrant();
  }
}

function marketplaceEntitlementClaimBody(
  request: ProModuleSecretRequest,
  license: Pick<LicenseValidationResponse, 'licenseHash'>,
  bundleRecord?: Pick<ProModuleBundleRecord, 'entitlement'>,
): Record<string, string> {
  return {
    lookupKey: request.entitlementLookupKey ?? '',
    licenseHash: license.licenseHash,
    moduleId: request.moduleId,
    ...(bundleRecord?.entitlement
      ? {
        entitlementSku: bundleRecord.entitlement.sku,
        entitlementGrantKey: bundleRecord.entitlement.grantKey,
      }
      : {}),
  };
}

function marketplaceGrantModules(
  request: ProModuleSecretRequest,
  bundleRecord?: Pick<ProModuleBundleRecord, 'entitlement'>,
): string[] {
  return bundleRecord?.entitlement
    ? uniqueGrants([bundleRecord.entitlement.sku, bundleRecord.entitlement.grantKey])
    : [request.moduleId];
}

function marketplaceClaimMatchesBundleEntitlement(
  proModule: Record<string, unknown>,
  bundleRecord?: Pick<ProModuleBundleRecord, 'entitlement'>,
): boolean {
  const entitlement = bundleRecord?.entitlement;
  if (!entitlement) return true;
  return proModule.entitlementSku === entitlement.sku
    && proModule.entitlementGrantKey === entitlement.grantKey
    && proModule.entitlementLicenseTier === entitlement.licenseTier;
}

export function deriveProModuleDecryptionSecret(input: {
  masterKey: string;
  licenseHash: string;
  moduleId: string;
  payloadSha256?: string;
}): string {
  // The encrypted payload digest is audited on issuance, but it cannot participate
  // in the encryption secret: that digest only exists after the payload is encrypted.
  void input.payloadSha256;
  return createHmac('sha256', input.masterKey)
    .update('greybox-pro-module-secret/v1')
    .update('\0')
    .update(input.licenseHash)
    .update('\0')
    .update(input.moduleId)
    .digest('base64url');
}

export function proModuleSecretResponse(
  request: ProModuleSecretRequest,
  license: LicenseValidationResponse,
  options: {
    masterKey?: string;
    entitlements?: ProModuleEntitlements;
    entitlementLookupKeys?: ProModuleEntitlementLookupKeys;
    bundleRecord?: Pick<ProModuleBundleRecord, 'entitlement' | 'payloadSha256'>;
    now?: Date;
  },
): ProModuleSecretResponse {
  const masterKey = options.masterKey?.trim();
  if (!masterKey) {
    throw new ProModuleSecretError('pro_module_secret_not_configured', 503);
  }
  if (request.payloadSha256 && options.bundleRecord && request.payloadSha256 !== options.bundleRecord.payloadSha256) {
    throw new ProModuleSecretError('pro_module_payload_mismatch', 409);
  }
  if (!isProModuleEntitled(
    license,
    request.moduleId,
    options.entitlements,
    options.entitlementLookupKeys,
    request.entitlementLookupKey,
    options.bundleRecord,
  )) {
    throw new ProModuleSecretError('pro_module_not_entitled', 403);
  }
  const now = options.now ?? new Date();
  return {
    moduleId: request.moduleId,
    licenseHash: license.licenseHash,
    algorithm: 'hmac-sha256-license-module-v1',
    decryptionSecret: deriveProModuleDecryptionSecret({
      masterKey,
      licenseHash: license.licenseHash,
      moduleId: request.moduleId,
      payloadSha256: request.payloadSha256,
    }),
    expiresAt: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
  };
}

export function signProModuleDownloadUrl(input: {
  cdnBaseUrl: string;
  storageKey: string;
  signingKey: string;
  licenseHash: string;
  payloadSha256: string;
  expiresAt: Date;
}): string {
  const cdnBaseUrl = cleanProModuleCdnBaseUrl(input.cdnBaseUrl);
  const storageKey = normalizeStorageKey(input.storageKey);
  const signingKey = input.signingKey.trim();
  if (!cdnBaseUrl || !storageKey || !signingKey) {
    throw new ProModuleSecretError('pro_module_download_not_configured', 503);
  }
  if (!/^[a-f0-9]{16}$/iu.test(input.licenseHash) || !SHA256_RE.test(input.payloadSha256)) {
    throw new ProModuleSecretError('bad_pro_module_download_signature_input', 400);
  }
  const url = new URL(`${cdnBaseUrl}/${storageKey.split('/').map(encodeURIComponent).join('/')}`);
  const expires = Math.floor(input.expiresAt.getTime() / 1000);
  url.searchParams.set('expires', String(expires));
  url.searchParams.set('licenseHash', input.licenseHash.toLowerCase());
  url.searchParams.set('payloadSha256', input.payloadSha256.toLowerCase());
  url.searchParams.set('signature', proModuleDownloadSignature({
    signingKey,
    origin: url.origin,
    pathname: url.pathname,
    expires,
    licenseHash: input.licenseHash.toLowerCase(),
    payloadSha256: input.payloadSha256.toLowerCase(),
  }));
  return url.toString();
}

export function verifyProModuleDownloadUrl(input: {
  downloadUrl: string;
  signingKey: string;
  now?: Date;
}): boolean {
  const signingKey = input.signingKey.trim();
  if (!signingKey) return false;
  let url: URL;
  try {
    url = new URL(input.downloadUrl);
  } catch {
    return false;
  }
  if (
    url.searchParams.getAll('expires').length !== 1
    || url.searchParams.getAll('licenseHash').length !== 1
    || url.searchParams.getAll('payloadSha256').length !== 1
    || url.searchParams.getAll('signature').length !== 1
  ) {
    return false;
  }
  const expires = Number(url.searchParams.get('expires'));
  const licenseHash = url.searchParams.get('licenseHash')?.toLowerCase() ?? '';
  const payloadSha256 = url.searchParams.get('payloadSha256')?.toLowerCase() ?? '';
  const signature = url.searchParams.get('signature') ?? '';
  if (
    !Number.isInteger(expires)
    || expires <= Math.floor((input.now ?? new Date()).getTime() / 1000)
    || !/^[a-f0-9]{16}$/u.test(licenseHash)
    || !SHA256_RE.test(payloadSha256)
    || !signature
  ) {
    return false;
  }
  const expected = proModuleDownloadSignature({
    signingKey,
    origin: url.origin,
    pathname: url.pathname,
    expires,
    licenseHash,
    payloadSha256,
  });
  return timingSafeBase64UrlEquals(signature, expected);
}

export function proModuleBundleDownloadResponse(
  request: ProModuleSecretRequest,
  license: LicenseValidationResponse,
  options: {
    registry?: ProModuleBundleRegistry;
    cdnBaseUrl?: string;
    downloadSigningKey?: string;
    entitlements?: ProModuleEntitlements;
    entitlementLookupKeys?: ProModuleEntitlementLookupKeys;
    now?: Date;
    ttlSeconds?: number;
  },
): ProModuleBundleDownloadResponse {
  const record = options.registry?.[request.moduleId];
  if (!record) throw new ProModuleSecretError('pro_module_bundle_not_found', 404);
  if (request.payloadSha256 && request.payloadSha256 !== record.payloadSha256) {
    throw new ProModuleSecretError('pro_module_payload_mismatch', 409);
  }
  if (!isProModuleEntitled(
    license,
    request.moduleId,
    options.entitlements,
    options.entitlementLookupKeys,
    request.entitlementLookupKey,
    record,
  )) {
    throw new ProModuleSecretError('pro_module_not_entitled', 403);
  }

  const ttlSeconds = options.ttlSeconds ?? DEFAULT_DOWNLOAD_TTL_SECONDS;
  if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0 || ttlSeconds > 60 * 60) {
    throw new ProModuleSecretError('bad_pro_module_download_ttl', 400);
  }
  const expiresAt = new Date((options.now ?? new Date()).getTime() + ttlSeconds * 1000);
  const downloadUrl = signProModuleDownloadUrl({
    cdnBaseUrl: options.cdnBaseUrl ?? '',
    storageKey: record.storageKey,
    signingKey: options.downloadSigningKey ?? '',
    licenseHash: license.licenseHash,
    payloadSha256: record.payloadSha256,
    expiresAt,
  });

  return {
    moduleId: record.moduleId,
    version: record.version,
    payloadSha256: record.payloadSha256,
    ...(record.envelopeSha256 ? { envelopeSha256: record.envelopeSha256 } : {}),
    contentType: record.contentType,
    downloadUrl,
    expiresAt: expiresAt.toISOString(),
    ...(record.sizeBytes ? { sizeBytes: record.sizeBytes } : {}),
  };
}

function cleanProModuleCdnBaseUrl(value: string | undefined): string | undefined {
  const clean = value?.trim();
  if (!clean) return undefined;
  try {
    const url = new URL(clean);
    if (url.protocol !== 'https:' && url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') return undefined;
    url.pathname = url.pathname.replace(/\/+$/u, '');
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/u, '');
  } catch {
    return undefined;
  }
}

function proModuleDownloadSignature(input: {
  signingKey: string;
  origin: string;
  pathname: string;
  expires: number;
  licenseHash: string;
  payloadSha256: string;
}): string {
  return createHmac('sha256', input.signingKey)
    .update('greybox-pro-module-download/v1')
    .update('\0GET')
    .update('\0')
    .update(input.origin)
    .update('\0')
    .update(input.pathname)
    .update('\0')
    .update(String(input.expires))
    .update('\0')
    .update(input.licenseHash)
    .update('\0')
    .update(input.payloadSha256)
    .digest('base64url');
}

function timingSafeBase64UrlEquals(left: string, right: string): boolean {
  if (!/^[A-Za-z0-9_-]{32,128}$/u.test(left) || !/^[A-Za-z0-9_-]{32,128}$/u.test(right)) return false;
  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}
