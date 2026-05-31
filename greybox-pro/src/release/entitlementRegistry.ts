// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { stableStringify } from '../bundles/stableStringify.js';
import {
  PRO_MODULE_BUNDLE_RELEASE_FORMAT,
  PRO_MODULE_BUNDLE_UPLOAD_PLAN_FORMAT,
  type ProModuleBundleReleaseItem,
  type ProModuleBundleReleaseManifest,
  type ProModuleBundleReleaseUploadObject,
  type ProModuleBundleReleaseUploadPlan,
} from './bundleRelease.js';
import {
  PRO_MODULE_BUNDLE_PUBLISH_PROOF_FORMAT,
  type ProModuleBundlePublishProof,
} from './publishProof.js';
import type {
  ProModuleEntitlementRegistry,
  ProModuleEntitlementRegistryCheck,
  ProModuleEntitlementRegistryImportItem,
  ProModuleEntitlementRegistryIssue,
} from '../types.js';

export const PRO_MODULE_ENTITLEMENT_REGISTRY_FORMAT = 'greybox.pro.entitlement-registry/v1';

const NON_PRODUCTION_PROVIDER_RE = /(?:^|[-_\s])(?:local|dry|dryrun|dry-run|mock|fixture|test|testmode|sandbox)(?:[-_\s]|$)/u;
const HASH_RE = /^[a-f0-9]{64}$/u;
const UNSAFE_REGISTRY_RE = /"encryptedPayload"\s*:|"ciphertext"\s*:|"decryptedPayload"\s*:|"payloadBody"\s*:|"licenseSecret"\s*:|"privateKey"\s*:|-----BEGIN [A-Z ]*PRIVATE KEY-----|"customerId"\s*:|gbx_(?:indie|pro|studio|enterprise)_[A-Za-z0-9_-]{12,}|sk_(?:live|test)_[A-Za-z0-9_-]{12,}|AKIA[0-9A-Z]{16}|AWS_SECRET_ACCESS_KEY|AWS_SESSION_TOKEN|X-Amz-Signature=|Signature=|token=/iu;

export interface ProModuleEntitlementRegistryCloudHandoff {
  ready: boolean;
  provider: string;
  releaseChannel: string;
  objectPrefix: string;
  keyId: string;
  moduleIds: string[];
  objectCount: number;
  totalBytes: number;
}

export interface ProModuleEntitlementRegistryOptions {
  releaseManifest: ProModuleBundleReleaseManifest;
  uploadPlan: ProModuleBundleReleaseUploadPlan;
  publishProof: ProModuleBundlePublishProof;
  cloudHandoff?: ProModuleEntitlementRegistryCloudHandoff;
  generatedAt?: number;
}

export function buildProModuleEntitlementRegistry(
  options: ProModuleEntitlementRegistryOptions,
): ProModuleEntitlementRegistry {
  const checks: ProModuleEntitlementRegistryCheck[] = [];
  const issues: ProModuleEntitlementRegistryIssue[] = [];
  const releaseItems = options.releaseManifest.items ?? [];
  const bundleObjects = (options.uploadPlan.objects ?? []).filter(isBundleObject);
  const uploadByModuleId = mapBy(bundleObjects, (object) => object.moduleId ?? '', 'duplicate_module_id', 'upload bundle module id', issues);
  const productionPublishProof = isProductionProvider(options.publishProof.receipt.provider);
  const cloudHandoffAligned = options.cloudHandoff
    ? isCloudHandoffAligned(options, releaseItems, checks, issues)
    : undefined;

  pushCheck(
    checks,
    'formats',
    options.releaseManifest.format === PRO_MODULE_BUNDLE_RELEASE_FORMAT
      && options.uploadPlan.format === PRO_MODULE_BUNDLE_UPLOAD_PLAN_FORMAT
      && options.publishProof.format === PRO_MODULE_BUNDLE_PUBLISH_PROOF_FORMAT,
    'Release manifest, upload plan, and publish proof formats match expected Pro release formats',
    issues,
    'format_invalid',
  );
  pushCheck(
    checks,
    'release-fields',
    options.releaseManifest.releaseChannel === options.uploadPlan.releaseChannel
      && options.releaseManifest.releaseChannel === options.publishProof.releaseChannel
      && options.releaseManifest.objectPrefix === options.uploadPlan.objectPrefix
      && options.releaseManifest.objectPrefix === options.publishProof.objectPrefix
      && options.releaseManifest.keyId === options.uploadPlan.keyId
      && options.releaseManifest.keyId === options.publishProof.keyId,
    'Release channel, object prefix, and key id match across entitlement sources',
    issues,
    'release_field_drift',
  );
  pushCheck(
    checks,
    'publish-proof-ready',
    options.publishProof.ready === true,
    options.publishProof.ready === true
      ? 'Publish proof passed object integrity, safety, and timestamp checks'
      : 'Publish proof is not ready and cannot grant production entitlements',
    issues,
    'publish_proof_not_ready',
  );
  pushCheck(
    checks,
    'production-provider',
    productionPublishProof,
    productionPublishProof
      ? `Publish proof provider ${safeDetail(options.publishProof.receipt.provider)} is production-backed`
      : `Publish proof provider ${safeDetail(options.publishProof.receipt.provider || '<missing>')} is local, dry-run, mock, fixture, or test evidence`,
    issues,
    'non_production_provider',
  );

  assertUniqueReleaseFields(releaseItems, issues);
  validateModuleCoverage(releaseItems, bundleObjects, options.publishProof, issues, checks);
  validateManifestUploadDrift(releaseItems, uploadByModuleId, issues, checks);

  const importItems = releaseItems.map((item) => {
    const uploadObject = uploadByModuleId.get(item.moduleId);
    return entitlementImportItem(
      item,
      uploadObject,
      options,
      productionPublishProof,
      cloudHandoffAligned,
    );
  });

  const registry: ProModuleEntitlementRegistry = {
    format: PRO_MODULE_ENTITLEMENT_REGISTRY_FORMAT,
    generatedAt: options.generatedAt ?? Math.max(
      options.releaseManifest.generatedAt,
      options.uploadPlan.generatedAt,
      options.publishProof.generatedAt,
    ),
    ready: false,
    releaseChannel: safeDetail(options.releaseManifest.releaseChannel),
    objectPrefix: safeDetail(options.releaseManifest.objectPrefix),
    keyId: safeDetail(options.releaseManifest.keyId),
    provider: safeDetail(options.publishProof.receipt.provider),
    itemCount: importItems.length,
    summary: {
      manifestModules: releaseItems.length,
      uploadPlanBundleObjects: bundleObjects.length,
      publishProofBundleModules: options.publishProof.uploadPlan.bundleModuleIds.length,
      productionPublishProof,
      cloudHandoffChecked: options.cloudHandoff !== undefined,
    },
    checks,
    issues,
    importItems,
    disclaimer: 'Entitlement registry import artifacts contain SKU, grant, module, hash, object path, pricing, key id, and readiness metadata only. They exclude encrypted payload bodies, decrypted payloads, license secrets, signed URL query strings, customer ids, private keys, and credentials.',
  };

  const unsafeMarkers = unsafeRegistryMarkers(registry);
  if (unsafeMarkers.length > 0) {
    for (const detail of unsafeMarkers) {
      issues.push({
        code: 'unsafe_registry_field',
        severity: 'error',
        detail,
        remediation: 'Regenerate the registry from sanitized release, upload, and publish proof artifacts before Cloud import.',
      });
    }
    checks.push({
      id: 'registry-safety',
      status: 'fail',
      detail: `${unsafeMarkers.length} unsafe registry field marker(s) detected`,
    });
  } else {
    checks.push({
      id: 'registry-safety',
      status: 'pass',
      detail: 'Entitlement registry import artifact is sanitized for Cloud handoff',
    });
  }

  registry.ready = issues.length === 0 && checks.every((check) => check.status === 'pass');
  return registry;
}

function entitlementImportItem(
  item: ProModuleBundleReleaseItem,
  uploadObject: ProModuleBundleReleaseUploadObject | undefined,
  options: ProModuleEntitlementRegistryOptions,
  productionPublishProof: boolean,
  cloudHandoffAligned: boolean | undefined,
): ProModuleEntitlementRegistryImportItem {
  return {
    sku: safeDetail(item.entitlement.sku),
    grantKey: safeDetail(item.entitlement.grantKey),
    moduleId: safeDetail(item.moduleId),
    name: safeDetail(item.name),
    version: safeDetail(item.version),
    payloadSha256: safeHash(item.payloadSha256),
    envelopeSha256: safeHash(item.envelopeSha256),
    objectKey: safeObjectKey(uploadObject?.objectKey ?? item.cdnPath),
    cdnPath: safeObjectKey(item.cdnPath),
    licenseTier: safeDetail(item.entitlement.licenseTier),
    price: {
      currency: item.entitlement.price.currency,
      oneTimeUsd: item.entitlement.price.oneTimeUsd,
      ...(item.entitlement.price.monthlyUsd === undefined ? {} : { monthlyUsd: item.entitlement.price.monthlyUsd }),
    },
    keyId: safeDetail(item.keyId),
    releaseChannel: safeDetail(options.releaseManifest.releaseChannel),
    objectPrefix: safeDetail(options.releaseManifest.objectPrefix),
    readiness: {
      manifestPresent: true,
      uploadPlanned: Boolean(uploadObject),
      publishProofReady: options.publishProof.ready === true,
      productionPublishProof,
      ...(cloudHandoffAligned === undefined ? {} : { cloudHandoffAligned }),
    },
  };
}

function validateModuleCoverage(
  releaseItems: readonly ProModuleBundleReleaseItem[],
  bundleObjects: readonly ProModuleBundleReleaseUploadObject[],
  publishProof: ProModuleBundlePublishProof,
  issues: ProModuleEntitlementRegistryIssue[],
  checks: ProModuleEntitlementRegistryCheck[],
): void {
  const releaseModuleIds = releaseItems.map((item) => item.moduleId).sort();
  const uploadModuleIds = bundleObjects.map((object) => object.moduleId ?? '').filter(Boolean).sort();
  const proofModuleIds = [...publishProof.uploadPlan.bundleModuleIds].sort();

  recordCoverageIssues(releaseModuleIds, uploadModuleIds, 'upload plan', issues);
  recordCoverageIssues(releaseModuleIds, proofModuleIds, 'publish proof', issues);
  checks.push({
    id: 'module-coverage',
    status: sameStringList(releaseModuleIds, uploadModuleIds) && sameStringList(releaseModuleIds, proofModuleIds) ? 'pass' : 'fail',
    detail: sameStringList(releaseModuleIds, uploadModuleIds) && sameStringList(releaseModuleIds, proofModuleIds)
      ? `${releaseModuleIds.length} published module entitlement(s) are covered exactly once`
      : 'Release manifest, upload plan, or publish proof module coverage differs',
  });
}

function validateManifestUploadDrift(
  releaseItems: readonly ProModuleBundleReleaseItem[],
  uploadByModuleId: ReadonlyMap<string, ProModuleBundleReleaseUploadObject>,
  issues: ProModuleEntitlementRegistryIssue[],
  checks: ProModuleEntitlementRegistryCheck[],
): void {
  let driftCount = 0;
  for (const item of releaseItems) {
    const object = uploadByModuleId.get(item.moduleId);
    if (!object) continue;
    driftCount += pushDriftIssue(
      object.entitlementSku === item.entitlement.sku
        && object.entitlementGrantKey === item.entitlement.grantKey
        && object.entitlementLicenseTier === item.entitlement.licenseTier,
      'sku_grant_drift',
      item.moduleId,
      `Entitlement metadata drift for ${item.moduleId}`,
      issues,
    );
    driftCount += pushDriftIssue(
      object.objectKey === item.cdnPath && object.sourceFileName === item.fileName,
      'object_key_drift',
      item.moduleId,
      `Upload object key or source file drift for ${item.moduleId}`,
      issues,
    );
    driftCount += pushDriftIssue(
      object.sha256 === item.envelopeSha256
        && object.envelopeSha256 === item.envelopeSha256
        && object.payloadSha256 === item.payloadSha256
        && object.bytes === item.envelopeBytes,
      'hash_drift',
      item.moduleId,
      `Upload hash, payload hash, envelope hash, or byte count drift for ${item.moduleId}`,
      issues,
    );
  }
  checks.push({
    id: 'manifest-upload-alignment',
    status: driftCount === 0 ? 'pass' : 'fail',
    detail: driftCount === 0
      ? 'Upload plan bundle metadata matches release manifest entitlement, object, and hash fields'
      : `${driftCount} release/upload drift issue(s) detected`,
  });
}

function isCloudHandoffAligned(
  options: ProModuleEntitlementRegistryOptions,
  releaseItems: readonly ProModuleBundleReleaseItem[],
  checks: ProModuleEntitlementRegistryCheck[],
  issues: ProModuleEntitlementRegistryIssue[],
): boolean {
  const handoff = options.cloudHandoff;
  if (!handoff) return false;
  if (!handoff.ready) {
    issues.push({
      code: 'cloud_handoff_not_ready',
      severity: 'error',
      detail: 'Cloud handoff report is not ready',
      remediation: 'Run validate-cloud-handoff with production-backed source evidence before importing entitlements.',
    });
  }
  const moduleIds = releaseItems.map((item) => item.moduleId).sort();
  const aligned = handoff.ready
    && handoff.provider === options.publishProof.receipt.provider
    && handoff.releaseChannel === options.releaseManifest.releaseChannel
    && handoff.objectPrefix === options.releaseManifest.objectPrefix
    && handoff.keyId === options.releaseManifest.keyId
    && handoff.objectCount === options.uploadPlan.objectCount
    && handoff.totalBytes === options.uploadPlan.totalBytes
    && sameStringList([...handoff.moduleIds].sort(), moduleIds);
  if (!aligned) {
    issues.push({
      code: 'cloud_handoff_drift',
      severity: 'error',
      detail: 'Cloud handoff provider, release fields, module ids, object count, or byte count do not match entitlement registry inputs',
      remediation: 'Regenerate Cloud handoff from the same release manifest, upload plan, and publish proof used for entitlement import.',
    });
  }
  checks.push({
    id: 'cloud-handoff-alignment',
    status: aligned ? 'pass' : 'fail',
    detail: aligned
      ? 'Cloud handoff report aligns with entitlement registry inputs'
      : 'Cloud handoff report does not align with entitlement registry inputs',
  });
  return aligned;
}

function assertUniqueReleaseFields(
  releaseItems: readonly ProModuleBundleReleaseItem[],
  issues: ProModuleEntitlementRegistryIssue[],
): void {
  recordDuplicateIssues(releaseItems, (item) => item.moduleId, 'duplicate_module_id', 'module id', issues);
  recordDuplicateIssues(releaseItems, (item) => item.entitlement.sku, 'duplicate_sku', 'SKU', issues);
  recordDuplicateIssues(releaseItems, (item) => item.entitlement.grantKey, 'duplicate_grant_key', 'grant key', issues);
}

function recordCoverageIssues(
  expected: readonly string[],
  actual: readonly string[],
  label: string,
  issues: ProModuleEntitlementRegistryIssue[],
): void {
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);
  for (const moduleId of expected) {
    if (!actualSet.has(moduleId)) {
      issues.push({
        code: 'missing_module_id',
        severity: 'error',
        moduleId: safeDetail(moduleId),
        detail: `${label} is missing module id ${safeDetail(moduleId)}`,
        remediation: 'Regenerate the upload plan and publish proof from the same release manifest.',
      });
    }
  }
  for (const moduleId of actual) {
    if (!expectedSet.has(moduleId)) {
      issues.push({
        code: 'extra_module_id',
        severity: 'error',
        moduleId: safeDetail(moduleId),
        detail: `${label} contains extra module id ${safeDetail(moduleId)}`,
        remediation: 'Remove stale bundle evidence and regenerate the entitlement registry from one release set.',
      });
    }
  }
}

function recordDuplicateIssues<T>(
  items: readonly T[],
  read: (item: T) => string,
  code: 'duplicate_module_id' | 'duplicate_sku' | 'duplicate_grant_key',
  label: string,
  issues: ProModuleEntitlementRegistryIssue[],
): void {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const item of items) {
    const value = read(item);
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  for (const value of duplicates) {
    issues.push({
      code,
      severity: 'error',
      detail: `Entitlement registry contains duplicate ${label}: ${safeDetail(value)}`,
      remediation: 'Ensure each published module maps to exactly one SKU and grant key.',
    });
  }
}

function mapBy<T>(
  items: readonly T[],
  read: (item: T) => string,
  code: 'duplicate_module_id',
  label: string,
  issues: ProModuleEntitlementRegistryIssue[],
): Map<string, T> {
  const mapped = new Map<string, T>();
  for (const item of items) {
    const key = read(item);
    if (!key) continue;
    if (mapped.has(key)) {
      issues.push({
        code,
        severity: 'error',
        detail: `Entitlement registry source contains duplicate ${label}: ${safeDetail(key)}`,
        remediation: 'Regenerate release artifacts with unique module ids.',
      });
      continue;
    }
    mapped.set(key, item);
  }
  return mapped;
}

function pushCheck(
  checks: ProModuleEntitlementRegistryCheck[],
  id: string,
  passed: boolean,
  detail: string,
  issues: ProModuleEntitlementRegistryIssue[],
  code: ProModuleEntitlementRegistryIssue['code'],
): void {
  checks.push({ id, status: passed ? 'pass' : 'fail', detail: safeDetail(detail) });
  if (!passed) {
    issues.push({
      code,
      severity: 'error',
      detail: safeDetail(detail),
      remediation: 'Regenerate entitlement registry inputs from the same production release pipeline run.',
    });
  }
}

function pushDriftIssue(
  passed: boolean,
  code: 'sku_grant_drift' | 'object_key_drift' | 'hash_drift',
  moduleId: string,
  detail: string,
  issues: ProModuleEntitlementRegistryIssue[],
): number {
  if (passed) return 0;
  issues.push({
    code,
    severity: 'error',
    moduleId: safeDetail(moduleId),
    detail: safeDetail(detail),
    remediation: 'Regenerate the upload plan from the release manifest before importing entitlements.',
  });
  return 1;
}

function isBundleObject(
  object: ProModuleBundleReleaseUploadObject,
): object is ProModuleBundleReleaseUploadObject & { kind: 'bundle' } {
  return object.kind === 'bundle';
}

function isProductionProvider(provider: string): boolean {
  const normalized = provider.trim().toLowerCase();
  return Boolean(normalized) && !NON_PRODUCTION_PROVIDER_RE.test(normalized);
}

function sameStringList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function unsafeRegistryMarkers(registry: ProModuleEntitlementRegistry): string[] {
  const serialized = stableStringify(registry);
  return UNSAFE_REGISTRY_RE.test(serialized)
    ? ['registry matches unsafe secret, payload, customer, private key, or signed URL marker']
    : [];
}

function safeHash(value: string): string {
  return HASH_RE.test(value) ? value : '[INVALID_SHA256]';
}

function safeObjectKey(value: string): string {
  if (!value || value.startsWith('/') || value.includes('\\')) return '[UNSAFE_OBJECT_KEY]';
  if (value.includes('?') || value.includes('#')) return '[UNSAFE_OBJECT_KEY]';
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/u.test(value) || value.split('/').includes('..')) {
    return '[UNSAFE_OBJECT_KEY]';
  }
  return safeDetail(value);
}

function safeDetail(value: string): string {
  return value
    .replace(/gbx_(?:indie|pro|studio|enterprise)_[A-Za-z0-9_-]{12,}/giu, '[REDACTED_LICENSE_KEY]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, '[REDACTED_EMAIL]')
    .replace(/sk_(?:live|test)_[A-Za-z0-9_-]{12,}/giu, '[REDACTED_PROVIDER_SECRET]')
    .replace(/AKIA[0-9A-Z]{16}/gu, '[REDACTED_AWS_KEY]')
    .replace(/((?:X-Amz-Signature|Signature|token)=)[^&#\s]+/giu, '$1[REDACTED_QUERY_SECRET]');
}
