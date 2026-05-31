// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import type {
  ProModuleBundleReleaseUploadObject,
  ProModuleBundleReleaseUploadPlan,
} from './bundleRelease.js';

export const PRO_MODULE_BUNDLE_PUBLISH_RECEIPT_FORMAT = 'greybox.pro.bundle-publish-receipt/v1';
export const PRO_MODULE_BUNDLE_PUBLISH_PROOF_FORMAT = 'greybox.pro.bundle-publish-proof/v1';

const SECRET_PATTERNS = [
  /gbx_(?:indie|pro|studio|enterprise)_[A-Za-z0-9_-]{12,}/iu,
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu,
  /sk_(?:live|test)_[A-Za-z0-9_-]{12,}/iu,
  /AKIA[0-9A-Z]{16}/u,
  /AWS_SECRET_ACCESS_KEY\s*=/iu,
  /AWS_SESSION_TOKEN\s*=/iu,
  /X-Amz-Signature=/iu,
  /Signature=/iu,
  /token=/iu,
];

const EVIDENCE_REDACTIONS: Array<[RegExp, string]> = [
  [/gbx_(?:indie|pro|studio|enterprise)_[A-Za-z0-9_-]{12,}/giu, '[REDACTED_LICENSE_KEY]'],
  [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, '[REDACTED_EMAIL]'],
  [/sk_(?:live|test)_[A-Za-z0-9_-]{12,}/giu, '[REDACTED_PROVIDER_SECRET]'],
  [/AKIA[0-9A-Z]{16}/gu, '[REDACTED_AWS_KEY]'],
  [/(AWS_SECRET_ACCESS_KEY\s*=\s*)[^\s,;]+/giu, '$1[REDACTED_AWS_SECRET]'],
  [/(AWS_SESSION_TOKEN\s*=\s*)[^\s,;]+/giu, '$1[REDACTED_AWS_SESSION_TOKEN]'],
  [/((?:X-Amz-Signature|Signature|token)=)[^&#\s]+/giu, '$1[REDACTED_QUERY_SECRET]'],
];

export interface ProModuleBundlePublishReceiptObject {
  objectKey: string;
  sha256: string;
  bytes: number;
  contentType: string;
  cacheControl: string;
  publishedAt: number;
  publicUrl?: string;
}

export interface ProModuleBundlePublishReceipt {
  format: typeof PRO_MODULE_BUNDLE_PUBLISH_RECEIPT_FORMAT;
  generatedAt: number;
  provider: string;
  releaseChannel: string;
  objectPrefix: string;
  objects: ProModuleBundlePublishReceiptObject[];
  disclaimer?: string;
}

export type ProModuleBundlePublishProofCheckStatus = 'pass' | 'fail';

export interface ProModuleBundlePublishProofCheck {
  id: string;
  status: ProModuleBundlePublishProofCheckStatus;
  detail: string;
}

export interface ProModuleBundlePublishProofMismatch {
  objectKey: string;
  field: 'sha256' | 'bytes' | 'contentType' | 'cacheControl';
  expected: string | number;
  actual: string | number;
}

export interface ProModuleBundlePublishProof {
  format: typeof PRO_MODULE_BUNDLE_PUBLISH_PROOF_FORMAT;
  generatedAt: number;
  ready: boolean;
  releaseChannel: string;
  objectPrefix: string;
  keyId: string;
  uploadPlan: {
    objectCount: number;
    totalBytes: number;
    bundleModuleIds: string[];
  };
  receipt: {
    provider: string;
    objectCount: number;
    totalBytes: number;
  };
  checks: ProModuleBundlePublishProofCheck[];
  missingObjectKeys: string[];
  extraObjectKeys: string[];
  duplicateObjectKeys: string[];
  mismatches: ProModuleBundlePublishProofMismatch[];
  receiptTimelineIssues: string[];
  unsafeReceiptFields: string[];
  disclaimer: string;
}

export interface ProModuleBundlePublishProofOptions {
  uploadPlan: ProModuleBundleReleaseUploadPlan;
  receipt: ProModuleBundlePublishReceipt;
  generatedAt?: number;
}

export function buildProModuleBundlePublishProof(
  options: ProModuleBundlePublishProofOptions,
): ProModuleBundlePublishProof {
  const missingObjectKeys: string[] = [];
  const extraObjectKeys: string[] = [];
  const mismatches: ProModuleBundlePublishProofMismatch[] = [];
  const receiptTimelineIssues = publishReceiptTimelineIssues(options.uploadPlan, options.receipt);
  const unsafeReceiptFields = unsafeReceiptFieldMarkers(options.receipt);
  const duplicateObjectKeys = duplicatedObjectKeys(options.receipt.objects);
  const plannedByKey = new Map(options.uploadPlan.objects.map((object) => [object.objectKey, object]));
  const receivedByKey = new Map(options.receipt.objects.map((object) => [object.objectKey, object]));

  for (const planned of options.uploadPlan.objects) {
    const received = receivedByKey.get(planned.objectKey);
    if (!received) {
      missingObjectKeys.push(planned.objectKey);
      continue;
    }
    compareReceiptObject(planned, received, mismatches);
  }

  for (const received of options.receipt.objects) {
    if (!plannedByKey.has(received.objectKey)) extraObjectKeys.push(safeEvidenceText(received.objectKey));
  }

  const checks: ProModuleBundlePublishProofCheck[] = [
    {
      id: 'format',
      status: options.receipt.format === PRO_MODULE_BUNDLE_PUBLISH_RECEIPT_FORMAT ? 'pass' : 'fail',
      detail: `Receipt format ${safeEvidenceText(options.receipt.format || '<missing>')}`,
    },
    {
      id: 'release-channel',
      status: options.receipt.releaseChannel === options.uploadPlan.releaseChannel ? 'pass' : 'fail',
      detail: `${safeEvidenceText(options.receipt.releaseChannel || '<missing>')} vs ${options.uploadPlan.releaseChannel}`,
    },
    {
      id: 'object-prefix',
      status: options.receipt.objectPrefix === options.uploadPlan.objectPrefix ? 'pass' : 'fail',
      detail: `${safeEvidenceText(options.receipt.objectPrefix || '<missing>')} vs ${options.uploadPlan.objectPrefix}`,
    },
    {
      id: 'object-count',
      status: missingObjectKeys.length === 0 && extraObjectKeys.length === 0 && duplicateObjectKeys.length === 0 ? 'pass' : 'fail',
      detail: duplicateObjectKeys.length === 0
        ? `${options.receipt.objects.length}/${options.uploadPlan.objectCount} receipt objects matched the upload plan`
        : `${duplicateObjectKeys.length} duplicate receipt object key(s) detected`,
    },
    {
      id: 'object-integrity',
      status: mismatches.length === 0 ? 'pass' : 'fail',
      detail: mismatches.length === 0 ? 'All receipt hashes, byte counts, content types, and cache policies match' : `${mismatches.length} object field mismatch(es)`,
    },
    {
      id: 'receipt-timeline',
      status: receiptTimelineIssues.length === 0 ? 'pass' : 'fail',
      detail: receiptTimelineIssues.length === 0
        ? 'Receipt timestamps prove objects were published after this upload plan'
        : `${receiptTimelineIssues.length} receipt timeline issue(s) detected`,
    },
    {
      id: 'receipt-safety',
      status: unsafeReceiptFields.length === 0 ? 'pass' : 'fail',
      detail: unsafeReceiptFields.length === 0 ? 'Receipt is sanitized for Cloud proof handoff' : `${unsafeReceiptFields.length} unsafe receipt field(s) detected`,
    },
  ];

  return {
    format: PRO_MODULE_BUNDLE_PUBLISH_PROOF_FORMAT,
    generatedAt: options.generatedAt ?? Math.max(options.uploadPlan.generatedAt, options.receipt.generatedAt),
    ready: checks.every((check) => check.status === 'pass'),
    releaseChannel: options.uploadPlan.releaseChannel,
    objectPrefix: options.uploadPlan.objectPrefix,
    keyId: options.uploadPlan.keyId,
    uploadPlan: {
      objectCount: options.uploadPlan.objectCount,
      totalBytes: options.uploadPlan.totalBytes,
      bundleModuleIds: bundleModuleIdsFromUploadPlan(options.uploadPlan),
    },
    receipt: {
      provider: safeEvidenceText(options.receipt.provider),
      objectCount: options.receipt.objects.length,
      totalBytes: options.receipt.objects.reduce((total, object) => total + object.bytes, 0),
    },
    checks,
    missingObjectKeys,
    extraObjectKeys,
    duplicateObjectKeys,
    mismatches,
    receiptTimelineIssues,
    unsafeReceiptFields,
    disclaimer: 'Publish proof compares upload-plan metadata with sanitized storage receipts and timestamp freshness. It excludes signed URLs, credentials, license secrets, customer ids, and encrypted bundle bodies.',
  };
}

function duplicatedObjectKeys(objects: readonly ProModuleBundlePublishReceiptObject[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const object of objects) {
    if (seen.has(object.objectKey)) duplicates.add(object.objectKey);
    seen.add(object.objectKey);
  }
  return [...duplicates].map(safeEvidenceText).sort();
}

function bundleModuleIdsFromUploadPlan(uploadPlan: ProModuleBundleReleaseUploadPlan): string[] {
  return uploadPlan.objects
    .filter((object) => object.kind === 'bundle')
    .map((object) => object.moduleId ?? '')
    .filter(Boolean)
    .sort();
}

function compareReceiptObject(
  planned: ProModuleBundleReleaseUploadObject,
  received: ProModuleBundlePublishReceiptObject,
  mismatches: ProModuleBundlePublishProofMismatch[],
): void {
  compareField(planned.objectKey, 'sha256', planned.sha256, received.sha256, mismatches);
  compareField(planned.objectKey, 'bytes', planned.bytes, received.bytes, mismatches);
  compareField(planned.objectKey, 'contentType', planned.contentType, received.contentType, mismatches);
  compareField(planned.objectKey, 'cacheControl', planned.cacheControl, received.cacheControl, mismatches);
}

function publishReceiptTimelineIssues(
  uploadPlan: ProModuleBundleReleaseUploadPlan,
  receipt: ProModuleBundlePublishReceipt,
): string[] {
  const issues: string[] = [];
  if (!isValidTimestamp(uploadPlan.generatedAt)) {
    issues.push('upload plan generatedAt is missing or invalid');
  }
  if (!isValidTimestamp(receipt.generatedAt)) {
    issues.push('receipt generatedAt is missing or invalid');
  }
  if (isValidTimestamp(uploadPlan.generatedAt) && isValidTimestamp(receipt.generatedAt)) {
    if (receipt.generatedAt < uploadPlan.generatedAt) {
      issues.push('receipt generatedAt predates upload plan generatedAt');
    }
  }
  for (const object of receipt.objects) {
    if (!isValidTimestamp(object.publishedAt)) {
      issues.push(`${safeEvidenceText(object.objectKey)} publishedAt is missing or invalid`);
      continue;
    }
    if (isValidTimestamp(uploadPlan.generatedAt) && object.publishedAt < uploadPlan.generatedAt) {
      issues.push(`${safeEvidenceText(object.objectKey)} publishedAt predates upload plan generatedAt`);
    }
  }
  return issues;
}

function isValidTimestamp(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

function compareField(
  objectKey: string,
  field: ProModuleBundlePublishProofMismatch['field'],
  expected: string | number,
  actual: string | number,
  mismatches: ProModuleBundlePublishProofMismatch[],
): void {
  if (expected === actual) return;
  mismatches.push({
    objectKey,
    field,
    expected,
    actual,
  });
}

function unsafeReceiptFieldMarkers(receipt: ProModuleBundlePublishReceipt): string[] {
  const markers: string[] = [];
  const serialized = JSON.stringify(receipt);
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(serialized)) markers.push(`receipt matches ${pattern}`);
  }
  for (const object of receipt.objects) {
    markers.push(...unsafeObjectKeyMarkers(object.objectKey));
    markers.push(...unsafePublicUrlMarkers(object));
  }
  return markers;
}

function unsafeObjectKeyMarkers(objectKey: string): string[] {
  const markers: string[] = [];
  if (!objectKey || objectKey.startsWith('/') || objectKey.includes('\\')) {
    markers.push(`unsafe receipt object key ${safeEvidenceText(objectKey || '<missing>')}`);
  }
  if (objectKey.includes('?') || objectKey.includes('#')) {
    markers.push(`receipt object key must not contain query or fragment data: ${safeEvidenceText(objectKey)}`);
  }
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/u.test(objectKey) || objectKey.split('/').includes('..')) {
    markers.push(`receipt object key must be a relative storage path: ${safeEvidenceText(objectKey)}`);
  }
  return markers;
}

function unsafePublicUrlMarkers(object: ProModuleBundlePublishReceiptObject): string[] {
  if (!object.publicUrl) return [];
  const markers: string[] = [];
  let parsed: URL;
  try {
    parsed = new URL(object.publicUrl);
  } catch {
    return [`public URL is not a valid URL for ${safeEvidenceText(object.objectKey)}`];
  }
  if (parsed.protocol !== 'https:') {
    markers.push(`public URL must use HTTPS for ${safeEvidenceText(object.objectKey)}`);
  }
  if (parsed.username || parsed.password) {
    markers.push(`public URL must not contain credentials for ${safeEvidenceText(object.objectKey)}`);
  }
  if (parsed.search || parsed.hash) {
    markers.push(`signed or query URL is not allowed for ${safeEvidenceText(object.objectKey)}`);
  }
  const objectPath = decodePublicUrlPath(parsed.pathname);
  if (objectPath !== object.objectKey) {
    markers.push(`public URL path does not match object key for ${safeEvidenceText(object.objectKey)}`);
  }
  return markers;
}

function decodePublicUrlPath(pathname: string): string {
  const normalized = pathname.replace(/^\/+/u, '');
  try {
    return decodeURIComponent(normalized);
  } catch {
    return normalized;
  }
}

function safeEvidenceText(value: string): string {
  let safe = value;
  for (const [pattern, replacement] of EVIDENCE_REDACTIONS) {
    safe = safe.replace(pattern, replacement);
  }
  return safe;
}
