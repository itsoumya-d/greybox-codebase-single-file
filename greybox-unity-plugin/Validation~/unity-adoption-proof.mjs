#!/usr/bin/env node
// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SUPPORTED_UNITY_TARGETS, packageExportEvidenceFromOutput, requiredUnitySmokeStepIds } from './release-readiness.mjs';
import { DEFAULT_UNITY_PACKAGE_OUTPUT } from './unity-package-export.mjs';
import { requiredPackageTestAssemblies, requiredSmokeResultTests } from './unity-import-smoke.mjs';
import { validateVerifiedSolutionPacket } from './verified-solution-readiness.mjs';

const DEFAULT_SOURCE_PATH = 'Validation~/artifacts/unity-adoption-source.json';
const DEFAULT_RELEASE_READINESS_PATH = 'Validation~/artifacts/release-readiness.json';
const REQUIRED_EVIDENCE_TYPES = [
  'asset-store-sales-export',
  'cloud-license-registry',
  'round-trip-usage-export',
  'mcp-usage-export',
  'real-unity-smoke-matrix',
  'support-sla-report',
];
const SUPPORTED_UNITY_VERSIONS = ['2022.3', '2023.2', '6000.0'];
const MIN_PAYING_CUSTOMERS = 1000;
const MIN_ASSET_STORE_PAID_CUSTOMERS = 1000;
const MIN_ACTIVE_MONTHLY_LICENSES = 500;
const MIN_ROUND_TRIP_ACTIVE_CUSTOMERS = 100;
const MIN_MCP_ACTIVE_CUSTOMERS = 50;
const MIN_SUCCESSFUL_SAMPLE_IMPORTS = 100;
const MAX_AVERAGE_SAMPLE_IMPORT_SECONDS = 30;
const MAX_P95_ROUND_TRIP_LATENCY_MS = 2000;
const MAX_EVIDENCE_AGE_DAYS = 45;
const MAX_RELEASE_READINESS_AGE_DAYS = 14;
const MAX_RELEASE_READINESS_FUTURE_DRIFT_MS = 60 * 1000;
const sha256Hex = /^[a-f0-9]{64}$/iu;
const secretPatterns = [
  /sk-[A-Za-z0-9_-]{20,}/u,
  /gbx_(?:indie|pro|studio|enterprise)_[A-Za-z0-9_-]{12,}/iu,
  /UNITY_PASSWORD\s*=/iu,
  /UNITY_LICENSE\s*=/iu,
  /STRIPE_(?:SECRET|API_KEY)\s*=/iu,
  /ANTHROPIC_API_KEY\s*=/iu,
  /OPENAI_API_KEY\s*=/iu,
];
const sourcePrivacyPatterns = [
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu,
  /\b(?:customer|contact|licensee|player|designer)(?:Name|Email|Contact|Phone)\b/iu,
  /\b(?:\+?\d[\d .()-]{8,}\d)\b/u,
  /\b(?:licenseKey|rawPortalExport|customerName|contactEmail)\b/iu,
];

export function parseUnityAdoptionProofArgs(argv) {
  const options = {
    output: '',
    requireReady: false,
    releaseReadiness: '',
    root: '',
    source: '',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--output') options.output = argv[++index] ?? '';
    else if (arg === '--require-ready') options.requireReady = true;
    else if (arg === '--release-readiness') options.releaseReadiness = argv[++index] ?? '';
    else if (arg === '--root') options.root = argv[++index] ?? '';
    else if (arg === '--source') options.source = argv[++index] ?? '';
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

export function buildUnityAdoptionProofExport({
  now = new Date(),
  root = repoRoot(),
  releaseReadinessPath = join(root, DEFAULT_RELEASE_READINESS_PATH),
  sourcePath = join(root, DEFAULT_SOURCE_PATH),
} = {}) {
  const source = readSourceJson(sourcePath);
  const releaseReadiness = readSourceJson(releaseReadinessPath);
  const sourceRecord = isRecord(source.value) ? source.value : {};
  const releaseReadinessRecord = isRecord(releaseReadiness.value) ? releaseReadiness.value : {};
  const sourceText = source.raw ?? '';
  const packet = validateVerifiedSolutionPacket(root, { application: true, skipReleaseEvidence: true });
  const metrics = metricsFromRecord(sourceRecord);
  const evidence = evidenceFromRecord(sourceRecord, now);
  const evidenceTypes = [...new Set(evidence.map((item) => item.type))].sort();
  const missingEvidenceTypes = REQUIRED_EVIDENCE_TYPES.filter((type) => !evidenceTypes.includes(type));
  const sourceHasSecret = secretPatterns.some((pattern) => pattern.test(sourceText));
  const sourceHasPrivateData = sourcePrivacyPatterns.some((pattern) => pattern.test(sourceText));
  const applicationPacketReady = packet.status === 'pass';
  const releaseReadinessStatus = releaseReadinessStatusFromRecord(releaseReadinessRecord, now);
  const releaseReadinessReady = releaseReadiness.ok && releaseReadinessStatus.ready;
  const adoptionMetricBlockers = adoptionMetricBlockersFromMetrics(metrics);
  const adoptionMetricsReady = adoptionMetricBlockers.length === 0;
  const sourceAdoptionReady = applicationPacketReady
    && releaseReadinessReady
    && source.ok
    && !sourceHasSecret
    && !sourceHasPrivateData
    && missingEvidenceTypes.length === 0
    && adoptionMetricsReady;
  const blockers = [
    ...(source.ok ? [] : [`source file unavailable or invalid: ${source.error}`]),
    ...(applicationPacketReady ? [] : ['Unity Verified Solution application packet is not ready']),
    ...(releaseReadiness.ok ? [] : [`release readiness file unavailable or invalid: ${releaseReadiness.error}`]),
    ...(releaseReadinessReady ? [] : releaseReadinessStatus.blockers),
    ...(sourceHasSecret ? ['source evidence appears to contain secrets'] : []),
    ...(sourceHasPrivateData ? ['source evidence appears to contain customer contact data or raw portal exports'] : []),
    ...missingEvidenceTypes.map((type) => `missing evidence type: ${type}`),
    ...adoptionMetricBlockers,
  ];
  return {
    ...metrics,
    sourceAdoptionReady,
    source: {
      report: 'unity-adoption-source-proof',
      generatedAt: now.toISOString(),
      sourcePath: sourcePath.replace(`${root}/`, ''),
      sourceReady: sourceAdoptionReady,
      applicationPacketReady,
      releaseReadinessReady,
      releaseReadinessPath: releaseReadinessPath.replace(`${root}/`, ''),
      releaseReadinessStatus: releaseReadinessStatus.status,
      evidenceTypes,
      evidenceCount: evidence.length,
      missingEvidenceTypes,
      blockers,
    },
    disclaimer: 'Cloud-compatible Unity adoption proof for GREYBOX_UNITY_ADOPTION_JSON. It contains aggregate counts and evidence hashes only; do not include customer names, license keys, contacts, game IP, credentials, or raw portal exports.',
  };
}

function adoptionMetricBlockersFromMetrics(metrics) {
  const blockers = [];
  if (metrics.assetStoreLive !== true) blockers.push('Asset Store listing is not live');
  if (metrics.unityVerifiedSolutionApplied !== true) blockers.push('Unity Verified Solution application has not been applied');
  if (metrics.unityVerifiedSolutionAchieved !== true) blockers.push('Unity Verified Solution status has not been achieved');
  if (metrics.payingCustomers < MIN_PAYING_CUSTOMERS) blockers.push(`paying Unity customers below ${MIN_PAYING_CUSTOMERS}`);
  if (metrics.assetStorePaidCustomers < MIN_ASSET_STORE_PAID_CUSTOMERS) blockers.push(`Asset Store paid customers below ${MIN_ASSET_STORE_PAID_CUSTOMERS}`);
  if (metrics.activeMonthlyLicenses < MIN_ACTIVE_MONTHLY_LICENSES) blockers.push(`active monthly Unity licenses below ${MIN_ACTIVE_MONTHLY_LICENSES}`);
  if (metrics.roundTripActiveCustomers < MIN_ROUND_TRIP_ACTIVE_CUSTOMERS) blockers.push(`active round-trip customers below ${MIN_ROUND_TRIP_ACTIVE_CUSTOMERS}`);
  if (metrics.mcpActiveCustomers < MIN_MCP_ACTIVE_CUSTOMERS) blockers.push(`active MCP customers below ${MIN_MCP_ACTIVE_CUSTOMERS}`);
  if (metrics.successfulSampleImports < MIN_SUCCESSFUL_SAMPLE_IMPORTS) blockers.push(`successful sample imports below ${MIN_SUCCESSFUL_SAMPLE_IMPORTS}`);
  if (metrics.averageSampleImportSeconds <= 0 || metrics.averageSampleImportSeconds > MAX_AVERAGE_SAMPLE_IMPORT_SECONDS) {
    blockers.push(`average sample import time must be between 0 and ${MAX_AVERAGE_SAMPLE_IMPORT_SECONDS} seconds`);
  }
  if (metrics.p95RoundTripLatencyMs <= 0 || metrics.p95RoundTripLatencyMs > MAX_P95_ROUND_TRIP_LATENCY_MS) {
    blockers.push(`p95 round-trip latency must be between 0 and ${MAX_P95_ROUND_TRIP_LATENCY_MS}ms`);
  }
  if (metrics.supportBlockers !== 0) blockers.push('support blockers must be zero');
  for (const version of SUPPORTED_UNITY_VERSIONS) {
    if (!metrics.realEditorSmokeVersions.includes(version)) blockers.push(`missing real Unity smoke version: ${version}`);
  }
  return blockers;
}

function metricsFromRecord(record) {
  return {
    assetStoreLive: record.assetStoreLive === true,
    unityVerifiedSolutionApplied: record.unityVerifiedSolutionApplied === true,
    unityVerifiedSolutionAchieved: record.unityVerifiedSolutionAchieved === true,
    payingCustomers: nonNegative(record.payingCustomers),
    assetStorePaidCustomers: nonNegative(record.assetStorePaidCustomers),
    cloudPaidCustomers: nonNegative(record.cloudPaidCustomers),
    activeMonthlyLicenses: nonNegative(record.activeMonthlyLicenses),
    roundTripActiveCustomers: nonNegative(record.roundTripActiveCustomers),
    mcpActiveCustomers: nonNegative(record.mcpActiveCustomers),
    successfulSampleImports: nonNegative(record.successfulSampleImports),
    averageSampleImportSeconds: nonNegative(record.averageSampleImportSeconds),
    p95RoundTripLatencyMs: nonNegative(record.p95RoundTripLatencyMs),
    supportBlockers: nonNegative(record.supportBlockers),
    realEditorSmokeVersions: normalizeUnityVersions(record.realEditorSmokeVersions),
  };
}

function evidenceFromRecord(record, now) {
  if (!Array.isArray(record.evidence)) return [];
  return record.evidence.flatMap((item) => {
    if (!isRecord(item)) return [];
    const type = typeof item.type === 'string' ? item.type.trim() : '';
    const sourceHash = typeof item.sourceHash === 'string' ? item.sourceHash.trim().toLowerCase() : '';
    const capturedAt = typeof item.capturedAt === 'string' ? item.capturedAt.trim() : '';
    if (!REQUIRED_EVIDENCE_TYPES.includes(type)) return [];
    if (!sha256Hex.test(sourceHash)) return [];
    const capturedTime = Date.parse(capturedAt);
    if (!Number.isFinite(capturedTime) || capturedTime > now.getTime()) return [];
    if (now.getTime() - capturedTime > MAX_EVIDENCE_AGE_DAYS * 24 * 60 * 60 * 1000) return [];
    return [{ type, capturedAt, sourceHash }];
  });
}

function normalizeUnityVersions(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.flatMap((item) => {
    const text = typeof item === 'string' ? item : '';
    if (/2022\.3/u.test(text)) return ['2022.3'];
    if (/2023\.2/u.test(text)) return ['2023.2'];
    if (/Unity\s*6|6000\.0/u.test(text)) return ['6000.0'];
    return [];
  }))];
}

function releaseReadinessStatusFromRecord(record, now) {
  const blockers = [];
  const generatedAt = typeof record?.generatedAt === 'string' ? record.generatedAt.trim() : '';
  if (!generatedAt) {
    blockers.push('release readiness generatedAt is missing');
  } else {
    const generatedAtTime = Date.parse(generatedAt);
    if (!Number.isFinite(generatedAtTime)) {
      blockers.push('release readiness generatedAt is invalid');
    } else if (generatedAtTime > now.getTime() + MAX_RELEASE_READINESS_FUTURE_DRIFT_MS) {
      blockers.push('release readiness generatedAt is in the future');
    } else if (now.getTime() - generatedAtTime > MAX_RELEASE_READINESS_AGE_DAYS * 24 * 60 * 60 * 1000) {
      blockers.push(`release readiness generatedAt is older than ${MAX_RELEASE_READINESS_AGE_DAYS} days`);
    }
  }
  const summaryStatus = record?.summary?.status;
  if (summaryStatus !== 'pass') blockers.push('release readiness summary is not pass');

  const steps = Array.isArray(record?.steps) ? record.steps : [];
  const requiredStepIds = [
    ...requiredUnitySmokeStepIds(),
    'asset-store-unitypackage-export',
  ];
  for (const id of requiredStepIds) {
    const step = steps.find((candidate) => candidate?.id === id);
    if (!step) {
      blockers.push(`missing release readiness step: ${id}`);
      continue;
    }
    if (step.status !== 'pass') blockers.push(`release readiness step not pass: ${id}`);
    if (id.startsWith('unity-editmode-smoke-')) {
      const target = SUPPORTED_UNITY_TARGETS.find((candidate) => id === `unity-editmode-smoke-${candidate.version}`);
      if (!hasTargetUnityVersionEvidence(step, target)) {
        blockers.push(`release readiness step missing target Unity command evidence: ${id}`);
      }
      if (!hasRequiredSmokeResultEvidence(step, 'Unity EditMode import smoke')) {
        blockers.push(`release readiness step missing named EditMode smoke evidence: ${id}`);
      }
      if (!hasPackageTestAssemblyEvidence(step, 'Unity EditMode import smoke')) {
        blockers.push(`release readiness step missing EditMode package test assembly evidence: ${id}`);
      }
      if (!hasSmokeResultXmlEvidence(step, 'Unity EditMode import smoke', target)) {
        blockers.push(`release readiness step missing validated EditMode result XML evidence: ${id}`);
      }
      if (!hasRequiredSmokeResultEvidence(step, 'Unity PlayMode gameplay smoke')) {
        blockers.push(`release readiness step missing named PlayMode smoke evidence: ${id}`);
      }
      if (!hasPackageTestAssemblyEvidence(step, 'Unity PlayMode gameplay smoke')) {
        blockers.push(`release readiness step missing PlayMode package test assembly evidence: ${id}`);
      }
      if (!hasSmokeResultXmlEvidence(step, 'Unity PlayMode gameplay smoke', target)) {
        blockers.push(`release readiness step missing validated PlayMode result XML evidence: ${id}`);
      }
    } else if (id === 'asset-store-unitypackage-export' && !hasUnityPackageExportEvidence(step)) {
      blockers.push(`release readiness step missing .unitypackage output path, byte, and SHA-256 evidence: ${id}`);
    }
  }

  const targetMatrix = Array.isArray(record?.targetMatrix) ? record.targetMatrix : [];
  for (const target of ['2022.3.74f1', '2023.2.20f1', '6000.0.58f1']) {
    const row = targetMatrix.find((candidate) => candidate?.version === target);
    if (!row || row.status !== 'ready' || typeof row.editor !== 'string' || row.editor.trim() === '') {
      blockers.push(`Unity target not ready in release readiness: ${target}`);
    }
  }

  return {
    ready: blockers.length === 0,
    status: blockers.length === 0 ? 'pass' : 'blocked',
    blockers,
  };
}

function hasUnityPackageExportEvidence(step) {
  if (hasUnityPackageExportEvidencePacket(step?.evidence)) return hasExpectedUnityPackageOutputArgv(step);
  const output = `${String(step?.stdout ?? '')}\n${String(step?.stderr ?? '')}`;
  return hasUnityPackageExportEvidencePacket(packageExportEvidenceFromOutput(output))
    && hasExpectedUnityPackageOutputArgv(step);
}

function hasUnityPackageExportEvidencePacket(evidence) {
  return evidence?.unityPackageExportPassed === true
    && typeof evidence?.unityPackageOutputPath === 'string'
    && unityPackageOutputPathMatchesExpected(evidence.unityPackageOutputPath)
    && Number.isInteger(evidence?.unityPackageBytes)
    && evidence.unityPackageBytes > 0
    && typeof evidence?.unityPackageSha256 === 'string'
    && /^[a-f0-9]{64}$/u.test(evidence.unityPackageSha256);
}

function hasExpectedUnityPackageOutputArgv(step) {
  const commandArgv = commandArgvFromStep(step);
  if (!commandArgv.some(isUnityPackageExportScript)) return false;
  const outputFlagIndexes = commandArgv.flatMap((part, index) => (part === '--output' ? [index] : []));
  return outputFlagIndexes.length === 1
    && unityPackageOutputPathMatchesExpected(commandArgv[outputFlagIndexes[0] + 1]);
}

function unityPackageOutputPathMatchesExpected(value) {
  if (typeof value !== 'string' || value.trim() === '') return false;
  const expected = normalizePathForEvidence(DEFAULT_UNITY_PACKAGE_OUTPUT);
  const actual = normalizePathForEvidence(value);
  return actual === expected || actual.endsWith(`/${expected}`);
}

function commandArgvFromStep(step) {
  return Array.isArray(step?.commandArgv) && step.commandArgv.every((part) => typeof part === 'string')
    ? step.commandArgv
    : [];
}

function isUnityPackageExportScript(part) {
  return part === 'Validation~/unity-package-export.mjs'
    || part.endsWith('/unity-package-export.mjs');
}

function normalizePathForEvidence(value) {
  return normalize(String(value ?? '').trim()).replaceAll('\\', '/');
}

function hasRequiredSmokeResultEvidence(step, label) {
  const requiredTests = requiredSmokeResultTests(label);
  const fieldName = /PlayMode/u.test(label) ? 'playModeRequiredResults' : 'editModeRequiredResults';
  const passedFieldName = /PlayMode/u.test(label) ? 'playModeRequiredResultsPassed' : 'editModeRequiredResultsPassed';
  if (step?.evidence?.[passedFieldName] !== true) return false;
  const actual = Array.isArray(step?.evidence?.[fieldName]) ? step.evidence[fieldName] : [];
  return requiredTests.every((testName) => actual.includes(testName));
}

function hasPackageTestAssemblyEvidence(step, label) {
  const requiredAssemblies = requiredPackageTestAssemblies(label);
  const fieldName = /PlayMode/u.test(label) ? 'playModePackageTestAssemblies' : 'editModePackageTestAssemblies';
  const passedFieldName = /PlayMode/u.test(label) ? 'playModePackageTestAssembliesPassed' : 'editModePackageTestAssembliesPassed';
  if (step?.evidence?.[passedFieldName] !== true) return false;
  const actual = Array.isArray(step?.evidence?.[fieldName]) ? step.evidence[fieldName] : [];
  return requiredAssemblies.every((assemblyName) => actual.includes(assemblyName));
}

function hasSmokeResultXmlEvidence(step, label, target) {
  const prefix = /PlayMode/u.test(label) ? 'playMode' : 'editMode';
  return typeof step?.evidence?.[`${prefix}ResultXmlPath`] === 'string'
    && step.evidence[`${prefix}ResultXmlPath`].trim() !== ''
    && Number.isInteger(step?.evidence?.[`${prefix}ResultXmlBytes`])
    && step.evidence[`${prefix}ResultXmlBytes`] > 0
    && typeof step?.evidence?.[`${prefix}ResultXmlSha256`] === 'string'
    && /^[a-f0-9]{64}$/u.test(step.evidence[`${prefix}ResultXmlSha256`])
    && step.evidence[`${prefix}ResultXmlValidated`] === true
    && hasExpectedSmokeResultXmlPath(step, label, target)
    && hasExpectedSmokeResultXmlArgv(step, label, target);
}

function hasExpectedSmokeResultXmlPath(step, label, target) {
  const prefix = /PlayMode/u.test(label) ? 'playMode' : 'editMode';
  return smokeResultPathMatchesTarget(step?.evidence?.[`${prefix}ResultXmlPath`], label, target);
}

function hasExpectedSmokeResultXmlArgv(step, label, target) {
  const flag = /PlayMode/u.test(label) ? '--playmode-results-file' : '--results-file';
  const commandArgv = commandArgvFromStep(step);
  const indexes = commandArgv.flatMap((part, index) => (part === flag ? [index] : []));
  return indexes.length === 1 && smokeResultPathMatchesTarget(commandArgv[indexes[0] + 1], label, target);
}

function smokeResultPathMatchesTarget(actualPath, label, target) {
  if (!target?.version || typeof actualPath !== 'string' || actualPath.trim() === '') return false;
  const expected = normalizePathForEvidence(expectedSmokeResultXmlPath(label, target));
  const actual = normalizePathForEvidence(actualPath);
  return actual === expected || actual.endsWith(`/${expected}`);
}

function expectedSmokeResultXmlPath(label, target) {
  const fileName = /PlayMode/u.test(label) ? 'playmode-results.xml' : 'editmode-results.xml';
  return join('Validation~/artifacts', `unity-smoke-${target.version}`, fileName);
}

function hasTargetUnityVersionEvidence(step, target) {
  if (!target) return false;
  if (step?.unityStream !== target.stream) return false;
  if (step?.unityVersion !== target.version) return false;
  const commandArgv = commandArgvFromStep(step);
  if (commandArgv.length === 0) return false;
  if (!commandArgv.some(isUnityImportSmokeScript)) return false;
  const versionFlagIndexes = commandArgv.flatMap((part, index) => (part === '--unity-version' ? [index] : []));
  return versionFlagIndexes.length === 1
    && commandArgv[versionFlagIndexes[0] + 1] === target.version;
}

function isUnityImportSmokeScript(part) {
  return part === 'Validation~/unity-import-smoke.mjs'
    || part.endsWith('/unity-import-smoke.mjs');
}

function readSourceJson(path) {
  try {
    const raw = readFileSync(path, 'utf8');
    return { ok: true, raw, value: JSON.parse(raw) };
  } catch {
    return {
      ok: false,
      raw: '',
      value: {},
      error: 'missing_or_invalid_source_json',
    };
  }
}

function nonNegative(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, value);
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function repoRoot() {
  return resolve(dirname(fileURLToPath(import.meta.url)), '..');
}

function runCli() {
  const options = parseUnityAdoptionProofArgs(process.argv.slice(2));
  const root = options.root ? resolve(options.root) : repoRoot();
  const sourcePath = options.source ? resolve(options.source) : join(root, DEFAULT_SOURCE_PATH);
  const releaseReadinessPath = options.releaseReadiness ? resolve(options.releaseReadiness) : join(root, DEFAULT_RELEASE_READINESS_PATH);
  const proof = buildUnityAdoptionProofExport({ root, sourcePath, releaseReadinessPath });
  const body = `${JSON.stringify(proof, null, 2)}\n`;
  if (options.output) {
    const outputPath = resolve(options.output);
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, body);
  } else {
    process.stdout.write(body);
  }
  if (options.requireReady && !proof.sourceAdoptionReady) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) runCli();
