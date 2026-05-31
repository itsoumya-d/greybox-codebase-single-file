// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PRO_MODULE_BUNDLE_PUBLISH_RECEIPT_FORMAT,
  buildProModuleBundlePublishProof,
  type ProModuleBundlePublishProof,
  type ProModuleBundlePublishReceipt,
} from '../release/publishProof.js';
import { buildProModuleEntitlementRegistry } from '../release/entitlementRegistry.js';
import {
  PRO_MODULE_BUNDLE_RELEASE_FORMAT,
  PRO_MODULE_BUNDLE_UPLOAD_PLAN_FORMAT,
  type ProModuleBundleReleaseManifest,
  type ProModuleBundleReleaseUploadPlan,
} from '../release/bundleRelease.js';
import { stableStringify } from '../bundles/stableStringify.js';

const SAFE_OBJECT_SEGMENT_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;

export interface ParsedPublishArgs {
  releaseDir: string;
  uploadPlan: string;
  storageDir: string;
  receipt: string;
  proof?: string;
  cloudEnv?: string;
  provider: string;
  publicBaseUrl?: string;
}

export interface PublishBundlesResult {
  storageDir: string;
  receiptPath: string;
  proofPath?: string;
  cloudEnvPath?: string;
  provider: string;
  objectCount: number;
  totalBytes: number;
  proofReady?: boolean;
}

export interface ProModuleCloudSourceEnvExport {
  format: 'greybox.pro.cloud-source-env/v1';
  generatedAt: number;
  variables: {
    GREYBOX_PRO_MODULE_BUNDLES_JSON: string;
    GREYBOX_PRO_MODULE_BUNDLE_UPLOAD_PLAN_JSON: string;
    GREYBOX_PRO_MODULE_BUNDLE_PUBLISH_PROOF_JSON: string;
    GREYBOX_PRO_MODULE_ENTITLEMENT_REGISTRY_JSON?: string;
  };
  disclaimer: string;
}

function parseArgs(argv: readonly string[]): ParsedPublishArgs {
  const values = new Map<string, string[]>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined || !arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      throw new Error(`Missing value for --${key}`);
    }
    values.set(key, [...(values.get(key) ?? []), next]);
    i++;
  }

  for (const key of ['release-dir', 'upload-plan', 'storage-dir', 'receipt']) {
    if (!values.has(key)) throw new Error(`Missing required flag --${key}`);
  }

  return {
    releaseDir: one(values, 'release-dir'),
    uploadPlan: one(values, 'upload-plan'),
    storageDir: one(values, 'storage-dir'),
    receipt: one(values, 'receipt'),
    ...(values.has('proof') ? { proof: one(values, 'proof') } : {}),
    ...(values.has('cloud-env') ? { cloudEnv: one(values, 'cloud-env') } : {}),
    provider: values.get('provider')?.at(-1) ?? 'local-dry-run',
    ...(values.has('public-base-url') ? { publicBaseUrl: one(values, 'public-base-url') } : {}),
  };
}

function one(values: Map<string, string[]>, key: string): string {
  const [value] = values.get(key) ?? [];
  if (!value) throw new Error(`Missing required flag --${key}`);
  return value;
}

export function publishBundles(
  parsed: ParsedPublishArgs,
  now = Date.now(),
): PublishBundlesResult {
  const releaseDir = absolute(parsed.releaseDir);
  const uploadPlanPath = absolute(parsed.uploadPlan);
  const storageDir = absolute(parsed.storageDir);
  const receiptPath = absolute(parsed.receipt);
  const proofPath = parsed.proof ? absolute(parsed.proof) : undefined;
  const cloudEnvPath = parsed.cloudEnv ? absolute(parsed.cloudEnv) : undefined;
  if (cloudEnvPath && !proofPath) {
    throw new Error('--cloud-env requires --proof so Cloud receives a validated publish proof');
  }
  const publicBaseUrl = parsed.publicBaseUrl ? normalizePublicBaseUrl(parsed.publicBaseUrl) : undefined;
  const uploadPlan = readUploadPlan(uploadPlanPath);

  mkdirSync(storageDir, { recursive: true });
  const receiptObjects = uploadPlan.objects.map((object, index) => {
    const sourcePath = safeSourcePath(releaseDir, object.sourceFileName);
    const body = readFileSync(sourcePath);
    const actualSha = sha256(body);
    if (body.byteLength !== object.bytes) {
      throw new Error(`${object.sourceFileName} byte count drift: expected ${object.bytes}, got ${body.byteLength}`);
    }
    if (actualSha !== object.sha256) {
      throw new Error(`${object.sourceFileName} sha256 drift: expected ${object.sha256}, got ${actualSha}`);
    }

    const targetPath = safeObjectPath(storageDir, object.objectKey);
    if (existsSync(targetPath)) {
      const existing = readFileSync(targetPath);
      const existingSha = sha256(existing);
      if (existingSha !== object.sha256 || existing.byteLength !== object.bytes) {
        throw new Error(`refusing to overwrite drifted storage object ${object.objectKey}`);
      }
    } else {
      mkdirSync(dirname(targetPath), { recursive: true });
      writeFileSync(targetPath, body);
    }

    return {
      objectKey: object.objectKey,
      sha256: object.sha256,
      bytes: object.bytes,
      contentType: object.contentType,
      cacheControl: object.cacheControl,
      publishedAt: now + index,
      ...(publicBaseUrl ? { publicUrl: `${publicBaseUrl}/${object.objectKey}` } : {}),
    };
  });

  const receipt: ProModuleBundlePublishReceipt = {
    format: PRO_MODULE_BUNDLE_PUBLISH_RECEIPT_FORMAT,
    generatedAt: now + uploadPlan.objects.length,
    provider: parsed.provider,
    releaseChannel: uploadPlan.releaseChannel,
    objectPrefix: uploadPlan.objectPrefix,
    objects: receiptObjects,
    disclaimer: 'Sanitized storage receipt. No signed URLs, customer ids, credentials, license secrets, or encrypted bundle bodies.',
  };
  writeJson(receiptPath, receipt);

  let proof: ProModuleBundlePublishProof | undefined;
  if (proofPath) {
    proof = buildProModuleBundlePublishProof({ uploadPlan, receipt });
    writeJson(proofPath, proof);
  }
  if (cloudEnvPath) {
    if (!proof) throw new Error('--cloud-env requires a generated publish proof');
    writeJson(cloudEnvPath, buildProModuleCloudSourceEnvExport({
      releaseManifest: readReleaseManifest(resolvePath(releaseDir, 'manifest.json')),
      uploadPlan,
      publishProof: proof,
      generatedAt: receipt.generatedAt,
    }));
  }

  return {
    storageDir,
    receiptPath,
    ...(proofPath ? { proofPath } : {}),
    ...(cloudEnvPath ? { cloudEnvPath } : {}),
    provider: parsed.provider,
    objectCount: receipt.objects.length,
    totalBytes: receipt.objects.reduce((total, object) => total + object.bytes, 0),
    ...(proof ? { proofReady: proof.ready } : {}),
  };
}

export function buildProModuleCloudSourceEnvExport(options: {
  releaseManifest: ProModuleBundleReleaseManifest;
  uploadPlan: ProModuleBundleReleaseUploadPlan;
  publishProof: ProModuleBundlePublishProof;
  generatedAt?: number;
}): ProModuleCloudSourceEnvExport {
  const entitlementRegistry = buildProModuleEntitlementRegistry({
    releaseManifest: options.releaseManifest,
    uploadPlan: options.uploadPlan,
    publishProof: options.publishProof,
  });
  return {
    format: 'greybox.pro.cloud-source-env/v1',
    generatedAt: options.generatedAt ?? Math.max(
      options.releaseManifest.generatedAt,
      options.uploadPlan.generatedAt,
      options.publishProof.generatedAt,
    ),
    variables: {
      GREYBOX_PRO_MODULE_BUNDLES_JSON: stableStringify(options.releaseManifest),
      GREYBOX_PRO_MODULE_BUNDLE_UPLOAD_PLAN_JSON: stableStringify(options.uploadPlan),
      GREYBOX_PRO_MODULE_BUNDLE_PUBLISH_PROOF_JSON: stableStringify(options.publishProof),
      GREYBOX_PRO_MODULE_ENTITLEMENT_REGISTRY_JSON: stableStringify(entitlementRegistry),
    },
    disclaimer: 'Cloud source env export contains sanitized release manifest, upload plan, publish proof, and entitlement registry JSON strings only. It excludes encrypted bundle bodies, license secrets, signing material, signed URLs, customer ids, and credentials.',
  };
}

function readReleaseManifest(path: string): ProModuleBundleReleaseManifest {
  const manifest = JSON.parse(readFileSync(path, 'utf8')) as ProModuleBundleReleaseManifest;
  if (manifest.format !== PRO_MODULE_BUNDLE_RELEASE_FORMAT) {
    throw new Error(`release manifest format ${manifest.format || '<missing>'} is not supported`);
  }
  if (!Array.isArray(manifest.items) || manifest.items.length === 0) {
    throw new Error('release manifest contains no modules');
  }
  return manifest;
}

function readUploadPlan(path: string): ProModuleBundleReleaseUploadPlan {
  const uploadPlan = JSON.parse(readFileSync(path, 'utf8')) as ProModuleBundleReleaseUploadPlan;
  if (uploadPlan.format !== PRO_MODULE_BUNDLE_UPLOAD_PLAN_FORMAT) {
    throw new Error(`upload plan format ${uploadPlan.format || '<missing>'} is not supported`);
  }
  if (!Array.isArray(uploadPlan.objects) || uploadPlan.objects.length === 0) {
    throw new Error('upload plan contains no objects');
  }
  return uploadPlan;
}

function writeJson(
  path: string,
  value: ProModuleBundlePublishReceipt | ProModuleBundlePublishProof | ProModuleCloudSourceEnvExport,
): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${stableStringify(value)}\n`, 'utf8');
}

function safeSourcePath(releaseDir: string, sourceFileName: string): string {
  if (!SAFE_OBJECT_SEGMENT_RE.test(sourceFileName)) {
    throw new Error(`unsafe release source filename ${sourceFileName}`);
  }
  return resolvePath(releaseDir, sourceFileName);
}

function safeObjectPath(storageDir: string, objectKey: string): string {
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/u.test(objectKey)) {
    throw new Error(`object key must not be a URL or URI: ${objectKey}`);
  }
  if (isAbsolute(objectKey)) {
    throw new Error(`object key must be relative: ${objectKey}`);
  }
  const segments = objectKey.split('/');
  if (segments.length === 0 || segments.some((segment) => !SAFE_OBJECT_SEGMENT_RE.test(segment))) {
    throw new Error(`object key contains unsafe path segment: ${objectKey}`);
  }
  const target = resolvePath(storageDir, ...segments);
  const rooted = `${storageDir.replace(/\/+$/u, '')}/`;
  if (target !== storageDir && !target.startsWith(rooted)) {
    throw new Error(`object key escapes storage directory: ${objectKey}`);
  }
  return target;
}

function normalizePublicBaseUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'https:') throw new Error('publicBaseUrl must use HTTPS');
  url.username = '';
  url.password = '';
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/+$/u, '');
}

function absolute(path: string): string {
  return isAbsolute(path) ? path : resolvePath(process.cwd(), path);
}

function sha256(input: Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}

function printUsage(): void {
  const usage = [
    'Usage: pnpm publish-bundles --release-dir <dir> --upload-plan <json> --storage-dir <dir> --receipt <json> [--proof <json>] [--cloud-env <json>] [--provider <name>] [--public-base-url <https-url>]',
    '',
    'Copies signed .gbpro release artifacts into a storage-shaped directory,',
    'verifies each upload-plan hash/byte count, and writes a sanitized publish receipt.',
    'Use --proof to emit a Cloud-safe publish proof from the same receipt.',
    'Use --cloud-env with --proof to emit sanitized GREYBOX_* source env JSON for Cloud.',
  ];
  for (const line of usage) console.log(line);
}

export function main(argv: readonly string[]): number {
  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
    printUsage();
    return 0;
  }
  try {
    const result = publishBundles(parseArgs(argv));
    console.log(stableStringify({
      ok: true,
      storageDir: result.storageDir,
      receipt: result.receiptPath,
      ...(result.proofPath ? { proof: result.proofPath, proofReady: result.proofReady } : {}),
      ...(result.cloudEnvPath ? { cloudEnv: result.cloudEnvPath } : {}),
      provider: result.provider,
      objectCount: result.objectCount,
      totalBytes: result.totalBytes,
    }));
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`publish-bundles: ${message}\n`);
    return 1;
  }
}

if (process.argv[1] && resolvePath(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
