// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

import { stableStringify } from '../bundles/stableStringify.js';
import {
  PRO_MODULE_BUNDLE_RELEASE_FORMAT,
  PRO_MODULE_BUNDLE_UPLOAD_PLAN_FORMAT,
  type ProModuleBundleReleaseManifest,
  type ProModuleBundleReleaseUploadPlan,
} from '../release/bundleRelease.js';
import {
  PRO_MODULE_BUNDLE_PUBLISH_PROOF_FORMAT,
  type ProModuleBundlePublishProof,
} from '../release/publishProof.js';
import {
  PRO_MODULE_ENTITLEMENT_REGISTRY_FORMAT,
  buildProModuleEntitlementRegistry,
} from '../release/entitlementRegistry.js';
import type { ProModuleEntitlementRegistry } from '../types.js';
import type { ProModuleCloudSourceEnvExport } from './publishBundles.js';

export const PRO_MODULE_CLOUD_HANDOFF_REPORT_FORMAT = 'greybox.pro.cloud-handoff-report/v1';

const CLOUD_SOURCE_ENV_FORMAT = 'greybox.pro.cloud-source-env/v1';
const REQUIRED_VARIABLES = [
  'GREYBOX_PRO_MODULE_BUNDLES_JSON',
  'GREYBOX_PRO_MODULE_BUNDLE_UPLOAD_PLAN_JSON',
  'GREYBOX_PRO_MODULE_BUNDLE_PUBLISH_PROOF_JSON',
] as const;
const ENTITLEMENT_REGISTRY_VARIABLE = 'GREYBOX_PRO_MODULE_ENTITLEMENT_REGISTRY_JSON';

const NON_PRODUCTION_PROVIDER_RE = /(?:^|[-_\s])(?:local|dry|dryrun|dry-run|mock|fixture|test|testmode|sandbox)(?:[-_\s]|$)/u;
const UNSAFE_EVIDENCE_RE = /encryptedPayload|ciphertext|"privateKey"\s*:|-----BEGIN [A-Z ]*PRIVATE KEY-----|gbx_(?:indie|pro|studio|enterprise)_[A-Za-z0-9_-]{12,}|sk_(?:live|test)_[A-Za-z0-9_-]{12,}|AKIA[0-9A-Z]{16}|AWS_SECRET_ACCESS_KEY|AWS_SESSION_TOKEN|X-Amz-Signature=|Signature=|token=/iu;

export interface ParsedCloudHandoffArgs {
  cloudEnv: string;
  report?: string;
  minBundleModules: number;
}

export interface ProModuleCloudHandoffCheck {
  id: string;
  status: 'pass' | 'fail';
  detail: string;
}

export interface ProModuleCloudHandoffReport {
  format: typeof PRO_MODULE_CLOUD_HANDOFF_REPORT_FORMAT;
  generatedAt: number;
  ready: boolean;
  provider: string;
  releaseChannel: string;
  objectPrefix: string;
  keyId: string;
  moduleIds: string[];
  objectCount: number;
  totalBytes: number;
  checks: ProModuleCloudHandoffCheck[];
  disclaimer: string;
}

export interface ValidateCloudHandoffResult {
  report: ProModuleCloudHandoffReport;
  reportPath?: string;
}

export function validateProModuleCloudHandoff(
  parsed: ParsedCloudHandoffArgs,
  now = Date.now(),
): ValidateCloudHandoffResult {
  const cloudEnvPath = absolute(parsed.cloudEnv);
  const cloudEnv = JSON.parse(readFileSync(cloudEnvPath, 'utf8')) as Partial<ProModuleCloudSourceEnvExport>;
  const checks: ProModuleCloudHandoffCheck[] = [];

  pushCheck(
    checks,
    'cloud-env-format',
    cloudEnv.format === CLOUD_SOURCE_ENV_FORMAT,
    `Cloud source env format ${safeDetail(cloudEnv.format ?? '<missing>')}`,
  );

  const variables = cloudEnv.variables && typeof cloudEnv.variables === 'object' ? cloudEnv.variables : undefined;
  const missingVariables = REQUIRED_VARIABLES.filter((key) => typeof variables?.[key] !== 'string' || variables[key].length === 0);
  pushCheck(
    checks,
    'required-variables',
    missingVariables.length === 0,
    missingVariables.length === 0
      ? 'All Cloud source env variables are present'
      : `Missing Cloud source env variable(s): ${missingVariables.join(', ')}`,
  );

  const releaseManifest = parseNestedJson<ProModuleBundleReleaseManifest>(
    variables?.GREYBOX_PRO_MODULE_BUNDLES_JSON,
    'GREYBOX_PRO_MODULE_BUNDLES_JSON',
    checks,
  );
  const uploadPlan = parseNestedJson<ProModuleBundleReleaseUploadPlan>(
    variables?.GREYBOX_PRO_MODULE_BUNDLE_UPLOAD_PLAN_JSON,
    'GREYBOX_PRO_MODULE_BUNDLE_UPLOAD_PLAN_JSON',
    checks,
  );
  const publishProof = parseNestedJson<ProModuleBundlePublishProof>(
    variables?.GREYBOX_PRO_MODULE_BUNDLE_PUBLISH_PROOF_JSON,
    'GREYBOX_PRO_MODULE_BUNDLE_PUBLISH_PROOF_JSON',
    checks,
  );
  const entitlementRegistry = parseOptionalNestedJson<ProModuleEntitlementRegistry>(
    variables?.GREYBOX_PRO_MODULE_ENTITLEMENT_REGISTRY_JSON,
    ENTITLEMENT_REGISTRY_VARIABLE,
    checks,
  );

  pushCheck(
    checks,
    'release-format',
    releaseManifest?.format === PRO_MODULE_BUNDLE_RELEASE_FORMAT,
    `Release manifest format ${safeDetail(releaseManifest?.format ?? '<missing>')}`,
  );
  pushCheck(
    checks,
    'upload-plan-format',
    uploadPlan?.format === PRO_MODULE_BUNDLE_UPLOAD_PLAN_FORMAT,
    `Upload plan format ${safeDetail(uploadPlan?.format ?? '<missing>')}`,
  );
  pushCheck(
    checks,
    'publish-proof-format',
    publishProof?.format === PRO_MODULE_BUNDLE_PUBLISH_PROOF_FORMAT,
    `Publish proof format ${safeDetail(publishProof?.format ?? '<missing>')}`,
  );

  const provider = publishProof?.receipt.provider.trim() ?? '';
  pushCheck(
    checks,
    'publish-proof-ready',
    publishProof?.ready === true,
    publishProof?.ready === true ? 'Publish proof passed object integrity, safety, and timestamp checks' : 'Publish proof is not ready',
  );
  pushCheck(
    checks,
    'production-provider',
    isProductionProvider(provider),
    isProductionProvider(provider)
      ? `Publish proof provider ${safeDetail(provider)} is production-backed`
      : `Publish proof provider ${safeDetail(provider || '<missing>')} is local, dry-run, mock, fixture, or test evidence`,
  );

  const releaseModuleIds = (releaseManifest?.items ?? []).map((item) => item.moduleId).sort();
  const proofModuleIds = [...(publishProof?.uploadPlan.bundleModuleIds ?? [])].sort();
  const expectedObjectCount = releaseModuleIds.length + 1;
  pushCheck(
    checks,
    'module-coverage',
    releaseModuleIds.length >= parsed.minBundleModules && sameStringList(releaseModuleIds, proofModuleIds),
    releaseModuleIds.length >= parsed.minBundleModules && sameStringList(releaseModuleIds, proofModuleIds)
      ? `${releaseModuleIds.length} module bundle(s) are covered by the publish proof`
      : `Release module ids and publish-proof module ids differ, or fewer than ${parsed.minBundleModules} module bundle(s) are present`,
  );

  const releaseFieldsMatch = Boolean(
    releaseManifest
      && uploadPlan
      && publishProof
      && releaseManifest.releaseChannel === uploadPlan.releaseChannel
      && releaseManifest.releaseChannel === publishProof.releaseChannel
      && releaseManifest.objectPrefix === uploadPlan.objectPrefix
      && releaseManifest.objectPrefix === publishProof.objectPrefix
      && releaseManifest.keyId === uploadPlan.keyId
      && releaseManifest.keyId === publishProof.keyId,
  );
  pushCheck(
    checks,
    'release-fields-match',
    releaseFieldsMatch,
    releaseFieldsMatch
      ? 'Release channel, object prefix, and key id match across manifest, upload plan, and publish proof'
      : 'Release channel, object prefix, or key id does not match across handoff sources',
  );

  const countsMatch = Boolean(
    releaseManifest
      && uploadPlan
      && publishProof
      && releaseManifest.itemCount === releaseManifest.items.length
      && uploadPlan.objectCount === uploadPlan.objects.length
      && uploadPlan.objectCount === expectedObjectCount
      && publishProof.uploadPlan.objectCount === uploadPlan.objectCount
      && publishProof.receipt.objectCount === uploadPlan.objectCount
      && publishProof.uploadPlan.totalBytes === uploadPlan.totalBytes
      && publishProof.receipt.totalBytes === uploadPlan.totalBytes,
  );
  pushCheck(
    checks,
    'object-counts-match',
    countsMatch,
    countsMatch
      ? `${uploadPlan?.objectCount ?? 0} published object(s) match release and upload metadata`
      : 'Release, upload plan, publish proof, or receipt object counts/bytes do not match',
  );

  const generatedAt = typeof cloudEnv.generatedAt === 'number' ? cloudEnv.generatedAt : 0;
  const timelineFresh = Boolean(
    releaseManifest
      && uploadPlan
      && publishProof
      && generatedAt >= publishProof.generatedAt
      && publishProof.generatedAt >= uploadPlan.generatedAt
      && uploadPlan.generatedAt >= releaseManifest.generatedAt,
  );
  pushCheck(
    checks,
    'handoff-timeline',
    timelineFresh,
    timelineFresh
      ? 'Cloud handoff was generated after the release manifest, upload plan, and publish proof'
      : 'Cloud handoff timestamps are missing or stale',
  );

  validateEntitlementRegistry({
    releaseManifest,
    uploadPlan,
    publishProof,
    entitlementRegistry,
    registryPresent: typeof variables?.GREYBOX_PRO_MODULE_ENTITLEMENT_REGISTRY_JSON === 'string',
    checks,
  });

  const evidence = stableStringify(cloudEnv);
  pushCheck(
    checks,
    'sanitized-evidence',
    !UNSAFE_EVIDENCE_RE.test(evidence),
    !UNSAFE_EVIDENCE_RE.test(evidence)
      ? 'Cloud handoff evidence is sanitized for operator and Cloud logs'
      : 'Cloud handoff evidence contains secret-shaped, signed URL, or encrypted payload fields',
  );

  const report: ProModuleCloudHandoffReport = {
    format: PRO_MODULE_CLOUD_HANDOFF_REPORT_FORMAT,
    generatedAt: now,
    ready: checks.every((check) => check.status === 'pass'),
    provider: safeDetail(provider || '<missing>'),
    releaseChannel: safeDetail(releaseManifest?.releaseChannel ?? uploadPlan?.releaseChannel ?? publishProof?.releaseChannel ?? '<missing>'),
    objectPrefix: safeDetail(releaseManifest?.objectPrefix ?? uploadPlan?.objectPrefix ?? publishProof?.objectPrefix ?? '<missing>'),
    keyId: safeDetail(releaseManifest?.keyId ?? uploadPlan?.keyId ?? publishProof?.keyId ?? '<missing>'),
    moduleIds: releaseModuleIds.map(safeDetail),
    objectCount: uploadPlan?.objectCount ?? publishProof?.uploadPlan.objectCount ?? 0,
    totalBytes: uploadPlan?.totalBytes ?? publishProof?.uploadPlan.totalBytes ?? 0,
    checks,
    disclaimer: 'Cloud handoff report validates production-backed Pro module source evidence for GREYBOX_PRO_* Cloud variables. It excludes encrypted bundle bodies, signed URLs, customer ids, license secrets, credentials, and signing material.',
  };

  const reportPath = parsed.report ? absolute(parsed.report) : undefined;
  if (reportPath) {
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, `${stableStringify(report)}\n`, 'utf8');
  }

  return reportPath ? { report, reportPath } : { report };
}

function parseArgs(argv: readonly string[]): ParsedCloudHandoffArgs {
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
  if (!values.has('cloud-env')) throw new Error('Missing required flag --cloud-env');
  const minBundleModules = values.has('min-bundle-modules')
    ? Number.parseInt(one(values, 'min-bundle-modules'), 10)
    : 1;
  if (!Number.isInteger(minBundleModules) || minBundleModules < 1) {
    throw new Error('--min-bundle-modules must be a positive integer');
  }
  return {
    cloudEnv: one(values, 'cloud-env'),
    ...(values.has('report') ? { report: one(values, 'report') } : {}),
    minBundleModules,
  };
}

function one(values: Map<string, string[]>, key: string): string {
  const [value] = values.get(key) ?? [];
  if (!value) throw new Error(`Missing required flag --${key}`);
  return value;
}

function parseNestedJson<T>(
  value: string | undefined,
  label: string,
  checks: ProModuleCloudHandoffCheck[],
): T | undefined {
  if (!value) {
    checks.push({ id: `parse-${label}`, status: 'fail', detail: `${label} is missing` });
    return undefined;
  }
  try {
    const parsed = JSON.parse(value) as T;
    checks.push({ id: `parse-${label}`, status: 'pass', detail: `${label} parses as JSON` });
    return parsed;
  } catch {
    checks.push({ id: `parse-${label}`, status: 'fail', detail: `${label} is not valid JSON` });
    return undefined;
  }
}

function parseOptionalNestedJson<T>(
  value: string | undefined,
  label: string,
  checks: ProModuleCloudHandoffCheck[],
): T | undefined {
  if (value === undefined) {
    checks.push({
      id: `parse-${label}`,
      status: 'pass',
      detail: `${label} is not present; legacy Cloud source env files remain accepted`,
    });
    return undefined;
  }
  if (value.length === 0) {
    checks.push({ id: `parse-${label}`, status: 'fail', detail: `${label} is empty` });
    return undefined;
  }
  try {
    const parsed = JSON.parse(value) as T;
    checks.push({ id: `parse-${label}`, status: 'pass', detail: `${label} parses as JSON` });
    return parsed;
  } catch {
    checks.push({ id: `parse-${label}`, status: 'fail', detail: `${label} is not valid JSON` });
    return undefined;
  }
}

function validateEntitlementRegistry(options: {
  releaseManifest: ProModuleBundleReleaseManifest | undefined;
  uploadPlan: ProModuleBundleReleaseUploadPlan | undefined;
  publishProof: ProModuleBundlePublishProof | undefined;
  entitlementRegistry: ProModuleEntitlementRegistry | undefined;
  registryPresent: boolean;
  checks: ProModuleCloudHandoffCheck[];
}): void {
  if (!options.registryPresent) return;

  pushCheck(
    options.checks,
    'entitlement-registry-format',
    options.entitlementRegistry?.format === PRO_MODULE_ENTITLEMENT_REGISTRY_FORMAT,
    `Entitlement registry format ${safeDetail(options.entitlementRegistry?.format ?? '<missing>')}`,
  );
  pushCheck(
    options.checks,
    'entitlement-registry-ready',
    options.entitlementRegistry?.ready === true,
    options.entitlementRegistry?.ready === true
      ? 'Entitlement registry is ready for Cloud import'
      : 'Entitlement registry is not ready for Cloud import',
  );

  const registryGeneratedAt = typeof options.entitlementRegistry?.generatedAt === 'number'
    ? options.entitlementRegistry.generatedAt
    : undefined;
  const expected = options.releaseManifest && options.uploadPlan && options.publishProof
    ? buildProModuleEntitlementRegistry({
      releaseManifest: options.releaseManifest,
      uploadPlan: options.uploadPlan,
      publishProof: options.publishProof,
      ...(registryGeneratedAt === undefined ? {} : { generatedAt: registryGeneratedAt }),
    })
    : undefined;
  const aligned = Boolean(
    options.entitlementRegistry
      && expected
      && stableStringify(options.entitlementRegistry) === stableStringify(expected),
  );
  pushCheck(
    options.checks,
    'entitlement-registry-alignment',
    aligned,
    aligned
      ? 'Entitlement registry matches the release manifest, upload plan, and publish proof'
      : 'Entitlement registry does not match the release manifest, upload plan, and publish proof',
  );
}

function pushCheck(
  checks: ProModuleCloudHandoffCheck[],
  id: string,
  passed: boolean,
  detail: string,
): void {
  checks.push({ id, status: passed ? 'pass' : 'fail', detail: safeDetail(detail) });
}

function isProductionProvider(provider: string): boolean {
  const normalized = provider.trim().toLowerCase();
  return Boolean(normalized) && !NON_PRODUCTION_PROVIDER_RE.test(normalized);
}

function sameStringList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function safeDetail(value: string): string {
  return value
    .replace(/gbx_(?:indie|pro|studio|enterprise)_[A-Za-z0-9_-]{12,}/giu, '[REDACTED_LICENSE_KEY]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, '[REDACTED_EMAIL]')
    .replace(/sk_(?:live|test)_[A-Za-z0-9_-]{12,}/giu, '[REDACTED_PROVIDER_SECRET]')
    .replace(/AKIA[0-9A-Z]{16}/gu, '[REDACTED_AWS_KEY]')
    .replace(/((?:X-Amz-Signature|Signature|token)=)[^&#\s]+/giu, '$1[REDACTED_QUERY_SECRET]');
}

function absolute(path: string): string {
  return isAbsolute(path) ? path : resolvePath(process.cwd(), path);
}

function printUsage(): void {
  const usage = [
    'Usage: pnpm validate-cloud-handoff --cloud-env <json> [--report <json>] [--min-bundle-modules <count>]',
    '',
    'Validates that a Pro module Cloud source-env export is production-backed,',
    'internally consistent, and sanitized before GREYBOX_PRO_* variables are used by Cloud.',
  ];
  for (const line of usage) console.log(line);
}

export function main(argv: readonly string[]): number {
  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
    printUsage();
    return 0;
  }
  try {
    const result = validateProModuleCloudHandoff(parseArgs(argv));
    console.log(stableStringify({
      ok: result.report.ready,
      ...(result.reportPath ? { report: result.reportPath } : {}),
      provider: result.report.provider,
      moduleIds: result.report.moduleIds,
      objectCount: result.report.objectCount,
      totalBytes: result.report.totalBytes,
      failedChecks: result.report.checks
        .filter((check) => check.status === 'fail')
        .map((check) => check.id),
    }));
    return result.report.ready ? 0 : 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`validate-cloud-handoff: ${message}\n`);
    return 1;
  }
}

if (process.argv[1] && resolvePath(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
