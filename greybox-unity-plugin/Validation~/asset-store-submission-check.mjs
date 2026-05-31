#!/usr/bin/env node
// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { isValidSemver } from './asset-store-metadata-check.mjs';
import {
  SUPPORTED_UNITY_TARGETS,
  hasTargetUnityVersionArgvEvidence,
  packageExportEvidenceFromOutput,
  requiredUnitySmokeStepIds,
} from './release-readiness.mjs';
import {
  requiredPackageTestAssemblies,
  requiredPackageTestAssembliesFromOutput,
  requiredSmokeResultTests,
  requiredSmokeResultsFromOutput,
} from './unity-import-smoke.mjs';

const REQUIRED_FIELDS = [
  'Publisher: Greybox Studio',
  'Package name: Greybox Studio',
  'Package id: com.greybox.studio',
  'Category: Tools / Game Toolkits',
  'Target Unity versions: 2022.3 LTS, 2023.2, Unity 6',
  'Support email: support@greybox.studio',
  'Support URL: https://greybox.studio/support',
  'Documentation URL: https://greybox.studio/docs/unity',
  'Privacy URL: https://greybox.studio/privacy',
  'License URL: https://greybox.studio/docs/unity/license',
  'Changelog URL: https://greybox.studio/docs/unity/changelog',
];

const REQUIRED_TIERS = [
  'Free Personal',
  'Indie',
  'Pro',
  'Studio site license',
];

const REQUIRED_REVIEW_NOTES = [
  'AI-assisted',
  'human designer credit',
  'EditorPrefs',
  'loopback',
  'local editor bearer token',
  'No API keys',
  'game IP',
  'watermarked',
  '3 locally tracked projects',
];

const REQUIRED_VISUAL_ASSET_SPECS = [
  { path: 'Documentation~/asset-store/icon-1600.png', width: 1600, height: 1600 },
  { path: 'Documentation~/asset-store/cover-1950x1300.png', width: 1950, height: 1300 },
  { path: 'Documentation~/asset-store/screenshot-importers.png', width: 1600, height: 900 },
  { path: 'Documentation~/asset-store/screenshot-round-trip.png', width: 1600, height: 900 },
  { path: 'Documentation~/asset-store/screenshot-mcp-bridge.png', width: 1600, height: 900 },
  { path: 'Documentation~/asset-store/screenshot-samples.png', width: 1600, height: 900 },
];
const REQUIRED_VISUAL_ASSETS = REQUIRED_VISUAL_ASSET_SPECS.map((asset) => asset.path);
const REQUIRED_RELEASE_READINESS_ARTIFACT = 'Validation~/artifacts/release-readiness.json';
const REQUIRED_RELEASE_STEPS = [
  ...requiredUnitySmokeStepIds(SUPPORTED_UNITY_TARGETS),
  'asset-store-unitypackage-export',
];
const REQUIRED_UNITY_TARGETS = SUPPORTED_UNITY_TARGETS.map((target) => [target.stream, target.version]);
const MAX_RELEASE_READINESS_ARTIFACT_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_RELEASE_READINESS_ARTIFACT_FUTURE_DRIFT_MS = 60 * 1000;

const REQUIRED_BLOCKERS = [
  'stable `1.0.0` or later version',
  '--submission --require-unity',
  'Unity 2022.3 LTS',
  '2023.2',
  'Unity 6',
  'required visual assets',
  'trademark/domain clearance',
  'Asset Store publisher credentials',
];

const REQUIRED_FINAL_COMMAND_SNIPPETS = SUPPORTED_UNITY_TARGETS.map((target) => `--unity-target "${target.version}=`);

const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9_-]{20,}/u,
  /gbx_(?:indie|pro|studio|enterprise)_[A-Za-z0-9_-]{12,}/iu,
  /UNITY_PASSWORD\s*=/iu,
  /UNITY_LICENSE\s*=/iu,
  /STRIPE_(?:SECRET|API_KEY)\s*=/iu,
  /ANTHROPIC_API_KEY\s*=/iu,
  /OPENAI_API_KEY\s*=/iu,
];

export function parseSubmissionArgs(argv) {
  const options = {
    root: '',
    skipReleaseEvidence: false,
    submission: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--root') options.root = argv[++index] ?? '';
    else if (arg === '--skip-release-evidence') options.skipReleaseEvidence = true;
    else if (arg === '--submission') options.submission = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

export function validateSubmissionPacket(root, options = {}) {
  const errors = [];
  const warnings = [];
  const packetPath = join(root, 'ASSET_STORE_SUBMISSION.md');
  const packagePath = join(root, 'package.json');
  const packet = readRequiredText(packetPath, errors);
  const manifest = readJson(packagePath, errors);

  if (manifest) {
    if (manifest.name !== 'com.greybox.studio') errors.push('package.json name must be com.greybox.studio');
    if (!isValidSemver(manifest.version)) errors.push('package.json version must be semver');
    if (options.submission && String(manifest.version).includes('-')) {
      errors.push('submission mode requires package.json to use a stable version');
    }
  }

  if (packet) {
    for (const field of REQUIRED_FIELDS) {
      if (!packet.includes(field)) errors.push(`ASSET_STORE_SUBMISSION.md missing listing field: ${field}`);
    }
    for (const tier of REQUIRED_TIERS) {
      if (!packet.includes(tier)) errors.push(`ASSET_STORE_SUBMISSION.md missing pricing tier: ${tier}`);
    }
    for (const note of REQUIRED_REVIEW_NOTES) {
      if (!packet.includes(note)) errors.push(`ASSET_STORE_SUBMISSION.md missing reviewer note: ${note}`);
    }
    for (const blocker of REQUIRED_BLOCKERS) {
      if (!packet.includes(blocker)) errors.push(`ASSET_STORE_SUBMISSION.md missing submission blocker: ${blocker}`);
    }
    for (const snippet of REQUIRED_FINAL_COMMAND_SNIPPETS) {
      if (!packet.includes(snippet)) errors.push(`ASSET_STORE_SUBMISSION.md missing final submission command evidence: ${snippet}`);
    }
    for (const asset of REQUIRED_VISUAL_ASSETS) {
      if (!packet.includes(asset)) errors.push(`ASSET_STORE_SUBMISSION.md missing required visual asset: ${asset}`);
    }
    if (/AI-generated/iu.test(packet)) {
      errors.push('ASSET_STORE_SUBMISSION.md must say AI-assisted, not unqualified AI-generated');
    }
    for (const pattern of SECRET_PATTERNS) {
      if (pattern.test(packet)) errors.push(`ASSET_STORE_SUBMISSION.md appears to contain a secret matching ${pattern}`);
    }
    const readyLine = readyToSubmitLine(packet);
    if (!readyLine) errors.push('ASSET_STORE_SUBMISSION.md must include "Ready to submit: yes|no" near the top');
    if (options.submission && readyLine !== 'yes') {
      errors.push('submission mode requires ASSET_STORE_SUBMISSION.md to say "Ready to submit: yes"');
    }
    if (!options.submission && readyLine === 'no') {
      warnings.push('Asset Store submission is intentionally blocked until stable version, real Unity smoke, visual asset portal upload, and credentials are ready');
    }
    for (const asset of REQUIRED_VISUAL_ASSET_SPECS) {
      validateVisualAsset(root, asset, { submission: Boolean(options.submission), errors, warnings });
    }
    validateReleaseReadinessArtifact(root, {
      errors,
      now: options.now instanceof Date ? options.now : new Date(),
      skipReleaseEvidence: Boolean(options.skipReleaseEvidence),
      submission: Boolean(options.submission),
    });
  }

  return {
    status: errors.length === 0 ? 'pass' : 'fail',
    errors,
    warnings,
    requiredVisualAssets: REQUIRED_VISUAL_ASSETS,
    requiredReleaseReadinessArtifact: REQUIRED_RELEASE_READINESS_ARTIFACT,
  };
}

export function formatSubmissionReportMarkdown(report) {
  const lines = [
    '# Greybox Unity Asset Store Submission Gate',
    '',
    `Status: ${report.status}`,
    '',
    '## Required Visual Assets',
    '',
    ...report.requiredVisualAssets.map((asset) => `- \`${asset}\``),
    '',
    '## Required Release Evidence',
    '',
    `- \`${report.requiredReleaseReadinessArtifact}\``,
  ];
  if (report.warnings.length > 0) {
    lines.push('', '## Warnings', '', ...report.warnings.map((warning) => `- ${warning}`));
  }
  if (report.errors.length > 0) {
    lines.push('', '## Errors', '', ...report.errors.map((error) => `- ${error}`));
  }
  return `${lines.join('\n')}\n`;
}

function readyToSubmitLine(packet) {
  const match = packet.match(/^Ready to submit:\s*(yes|no)\s*$/imu);
  return match?.[1]?.toLowerCase() ?? '';
}

function readRequiredText(path, errors) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    errors.push(`missing required submission packet: ${path}`);
    return '';
  }
}

function validateVisualAsset(root, asset, options) {
  const path = join(root, asset.path);
  if (!existsSync(path)) {
    const message = `visual asset not yet exported: ${asset.path}`;
    if (options.submission) options.errors.push(message);
    else options.warnings.push(message);
    return;
  }
  let dimensions;
  try {
    dimensions = readPngDimensions(path);
  } catch (error) {
    options.errors.push(`visual asset must be a valid PNG: ${asset.path} (${error instanceof Error ? error.message : String(error)})`);
    return;
  }
  if (dimensions.width !== asset.width || dimensions.height !== asset.height) {
    options.errors.push(
      `visual asset has wrong dimensions: ${asset.path} is ${dimensions.width}x${dimensions.height}, expected ${asset.width}x${asset.height}`,
    );
  }
}

function readPngDimensions(path) {
  const buffer = readFileSync(path);
  const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(pngSignature)) {
    throw new Error('missing PNG signature');
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function validateReleaseReadinessArtifact(root, options) {
  if (!options.submission || options.skipReleaseEvidence) return;
  const artifactPath = join(root, REQUIRED_RELEASE_READINESS_ARTIFACT);
  if (!existsSync(artifactPath)) {
    options.errors.push(`submission mode requires release readiness artifact: ${REQUIRED_RELEASE_READINESS_ARTIFACT}`);
    return;
  }

  let report;
  try {
    report = JSON.parse(readFileSync(artifactPath, 'utf8'));
  } catch (error) {
    options.errors.push(`release readiness artifact must be valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }

  validateReleaseReadinessArtifactFreshness(report, options);

  if (report?.submission !== true) {
    options.errors.push('release readiness artifact must be generated with --submission');
  }
  if (report?.summary?.status !== 'pass') {
    options.errors.push(`release readiness artifact summary must pass, got ${report?.summary?.status ?? '<missing>'}`);
  }

  const steps = Array.isArray(report?.steps) ? report.steps : [];
  const nonPassingSteps = steps
    .filter((step) => step?.status !== 'pass')
    .map((step) => step?.id ?? '<unknown>');
  if (nonPassingSteps.length > 0) {
    options.errors.push(`release readiness artifact contains non-passing steps: ${nonPassingSteps.join(', ')}`);
  }
  for (const stepId of REQUIRED_RELEASE_STEPS) {
    const step = steps.find((candidate) => candidate?.id === stepId);
    if (step?.status !== 'pass') {
      options.errors.push(`release readiness artifact requires passing final Unity step: ${stepId}`);
    }
    if (String(step?.command ?? '').includes('--dry-run')) {
      options.errors.push(`release readiness artifact final Unity step must not be dry-run: ${stepId}`);
    }
    const isUnitySmoke = stepId.startsWith('unity-editmode-smoke-');
    const isUnityPackageExport = stepId === 'asset-store-unitypackage-export';
    const unityTarget = unityTargetForStepId(stepId);
    const editModeSmokePassed = step?.evidence?.editModeSmokePassed === true
      || String(step?.stdout ?? '').includes('PASS Unity EditMode import smoke completed.');
    const playModeSmokePassed = step?.evidence?.playModeSmokePassed === true
      || String(step?.stdout ?? '').includes('PASS Unity PlayMode gameplay smoke completed.');
    if (isUnitySmoke && !hasTargetUnityVersionEvidence(step, unityTarget)) {
      options.errors.push(`release readiness artifact smoke step must be pinned to target Unity version: ${stepId}`);
    }
    if (isUnitySmoke && (!editModeSmokePassed || !playModeSmokePassed)) {
      options.errors.push(`release readiness artifact must include passing EditMode and PlayMode smoke evidence: ${stepId}`);
    }
    if (isUnitySmoke && !hasRequiredSmokeResultEvidence(step, 'Unity EditMode import smoke')) {
      options.errors.push(`release readiness artifact must include named EditMode smoke result evidence: ${stepId}`);
    }
    if (isUnitySmoke && !hasPackageTestAssemblyEvidence(step, 'Unity EditMode import smoke')) {
      options.errors.push(`release readiness artifact must include EditMode package test assembly evidence: ${stepId}`);
    }
    if (isUnitySmoke && !hasSmokeResultXmlEvidence(step, 'Unity EditMode import smoke')) {
      options.errors.push(`release readiness artifact must include validated EditMode result XML evidence: ${stepId}`);
    }
    if (isUnitySmoke && !hasRequiredSmokeResultEvidence(step, 'Unity PlayMode gameplay smoke')) {
      options.errors.push(`release readiness artifact must include named PlayMode smoke result evidence: ${stepId}`);
    }
    if (isUnitySmoke && !hasPackageTestAssemblyEvidence(step, 'Unity PlayMode gameplay smoke')) {
      options.errors.push(`release readiness artifact must include PlayMode package test assembly evidence: ${stepId}`);
    }
    if (isUnitySmoke && !hasSmokeResultXmlEvidence(step, 'Unity PlayMode gameplay smoke')) {
      options.errors.push(`release readiness artifact must include validated PlayMode result XML evidence: ${stepId}`);
    }
    if (isUnityPackageExport && !hasUnityPackageExportEvidence(step)) {
      options.errors.push(`release readiness artifact must include .unitypackage output path, byte, and SHA-256 evidence: ${stepId}`);
    }
  }

  const matrix = Array.isArray(report?.targetMatrix) ? report.targetMatrix : [];
  for (const [stream, version] of REQUIRED_UNITY_TARGETS) {
    const target = matrix.find((candidate) => candidate?.stream === stream && candidate?.version === version);
    if (target?.status !== 'ready' || !target?.editor) {
      options.errors.push(`release readiness artifact requires ready Unity target: ${stream} ${version}`);
    }
  }
}

function validateReleaseReadinessArtifactFreshness(report, options) {
  const raw = typeof report?.generatedAt === 'string' ? report.generatedAt.trim() : '';
  if (!raw) {
    options.errors.push('release readiness artifact generatedAt must be present');
    return;
  }
  const generatedAtMs = Date.parse(raw);
  if (!Number.isFinite(generatedAtMs)) {
    options.errors.push('release readiness artifact generatedAt must be a valid ISO timestamp');
    return;
  }
  const nowMs = options.now instanceof Date ? options.now.getTime() : Number.NaN;
  if (!Number.isFinite(nowMs)) {
    options.errors.push('submission gate now must be a valid Date');
    return;
  }
  if (generatedAtMs > nowMs + MAX_RELEASE_READINESS_ARTIFACT_FUTURE_DRIFT_MS) {
    options.errors.push('release readiness artifact generatedAt must not be in the future');
  }
  if (nowMs - generatedAtMs > MAX_RELEASE_READINESS_ARTIFACT_AGE_MS) {
    options.errors.push('release readiness artifact generatedAt must be no older than 14 days');
  }
}

function hasRequiredSmokeResultEvidence(step, label) {
  const requiredTests = requiredSmokeResultTests(label);
  const fieldName = /PlayMode/u.test(label) ? 'playModeRequiredResults' : 'editModeRequiredResults';
  const passedFieldName = /PlayMode/u.test(label) ? 'playModeRequiredResultsPassed' : 'editModeRequiredResultsPassed';
  if (step?.evidence?.[passedFieldName] === true) {
    const actual = Array.isArray(step?.evidence?.[fieldName]) ? step.evidence[fieldName] : [];
    return requiredTests.every((testName) => actual.includes(testName));
  }
  const output = `${String(step?.stdout ?? '')}\n${String(step?.stderr ?? '')}`;
  return requiredSmokeResultsFromOutput(output, label).length === requiredTests.length;
}

function hasPackageTestAssemblyEvidence(step, label) {
  const requiredAssemblies = requiredPackageTestAssemblies(label);
  const fieldName = /PlayMode/u.test(label) ? 'playModePackageTestAssemblies' : 'editModePackageTestAssemblies';
  const passedFieldName = /PlayMode/u.test(label) ? 'playModePackageTestAssembliesPassed' : 'editModePackageTestAssembliesPassed';
  if (step?.evidence?.[passedFieldName] === true) {
    const actual = Array.isArray(step?.evidence?.[fieldName]) ? step.evidence[fieldName] : [];
    return requiredAssemblies.every((assemblyName) => actual.includes(assemblyName));
  }
  const output = `${String(step?.stdout ?? '')}\n${String(step?.stderr ?? '')}`;
  return requiredPackageTestAssembliesFromOutput(output, label).length === requiredAssemblies.length;
}

function hasSmokeResultXmlEvidence(step, label) {
  const prefix = /PlayMode/u.test(label) ? 'playMode' : 'editMode';
  return typeof step?.evidence?.[`${prefix}ResultXmlPath`] === 'string'
    && step.evidence[`${prefix}ResultXmlPath`].trim() !== ''
    && Number.isInteger(step?.evidence?.[`${prefix}ResultXmlBytes`])
    && step.evidence[`${prefix}ResultXmlBytes`] > 0
    && typeof step?.evidence?.[`${prefix}ResultXmlSha256`] === 'string'
    && /^[a-f0-9]{64}$/u.test(step.evidence[`${prefix}ResultXmlSha256`])
    && step.evidence[`${prefix}ResultXmlValidated`] === true;
}

function hasUnityPackageExportEvidence(step) {
  if (
    step?.evidence?.unityPackageExportPassed === true
    && typeof step?.evidence?.unityPackageOutputPath === 'string'
    && step.evidence.unityPackageOutputPath.endsWith('.unitypackage')
    && Number.isInteger(step?.evidence?.unityPackageBytes)
    && step.evidence.unityPackageBytes > 0
    && typeof step?.evidence?.unityPackageSha256 === 'string'
    && /^[a-f0-9]{64}$/u.test(step.evidence.unityPackageSha256)
  ) {
    return true;
  }
  const output = `${String(step?.stdout ?? '')}\n${String(step?.stderr ?? '')}`;
  return packageExportEvidenceFromOutput(output).unityPackageExportPassed === true;
}

function hasTargetUnityVersionEvidence(step, target) {
  return hasTargetUnityVersionArgvEvidence(step, target);
}

function unityTargetForStepId(stepId) {
  return SUPPORTED_UNITY_TARGETS.find((target) => stepId === `unity-editmode-smoke-${target.version}`);
}

function readJson(path, errors) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    errors.push(`failed to read ${path}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function runCli() {
  const options = parseSubmissionArgs(process.argv.slice(2));
  const root = options.root
    ? resolve(options.root)
    : resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const report = validateSubmissionPacket(root, options);
  process.stdout.write(formatSubmissionReportMarkdown(report));
  if (report.errors.length > 0) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) runCli();
