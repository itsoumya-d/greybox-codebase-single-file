#!/usr/bin/env node
// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateSubmissionPacket } from './asset-store-submission-check.mjs';
import { isValidSemver } from './asset-store-metadata-check.mjs';

const REQUIRED_FIELDS = [
  'Program: Unity Verified Solutions Program',
  'Product: Greybox Studio',
  'Publisher: Greybox Studio',
  'Package name: Greybox Studio',
  'Package id: com.greybox.studio',
  'Integration category: AI-assisted game design Editor extension',
  'Target Unity versions: 2022.3 LTS, 2023.2, Unity 6',
  'Support email: support@greybox.studio',
  'Support URL: https://greybox.studio/support',
  'Documentation URL: https://greybox.studio/docs/unity',
  'Privacy URL: https://greybox.studio/privacy',
];

const REQUIRED_TECHNICAL_EVIDENCE = [
  'ASSET_STORE_SUBMISSION.md',
  'node Validation~/release-readiness.mjs --submission --require-unity',
  'Unity 2022.3 LTS',
  '2023.2',
  'Unity 6',
  'Validation~/artifacts/mcp-conformance.md',
  'Validation~/artifacts/package-manifest.json',
  'Validation~/artifacts/stable-release-candidate.json',
  'node Validation~/stable-release-candidate.mjs --require-ready',
  '2-second p95',
  'under 30 seconds',
  'Free Personal and Indie stay one-way import only',
  'Pro and Studio unlock round-trip sync',
  '3 locally tracked projects',
  'watermarked generated artifacts',
];

const REQUIRED_SECURITY_EVIDENCE = [
  'No API keys',
  'game IP',
  'EditorPrefs',
  'runtime assets',
  'loopback-only',
  'local editor bearer token',
  'AI-assisted',
  'human designer',
  'separate explicit opt-in consent',
  'Third-Party Notices.txt',
];

const REQUIRED_CUSTOMER_EVIDENCE = [
  '100+ paying Unity plugin customers',
  '100+ active round-trip sync customers',
  '50+ active MCP bridge customers',
  '5+ shipped commercial games crediting Greybox',
  '3+ public Unity customer references',
  'Support SLA evidence',
];

const REQUIRED_BLOCKERS = [
  'stable `1.0.0` or later version',
  'real Unity smoke matrix',
  'required visual assets',
  'trademark/domain clearance',
  'Unity publisher credentials',
  'customer references',
  'support SLA evidence',
  'counsel-approved privacy',
];

const REQUIRED_RELEASE_READINESS_ARTIFACT = 'Validation~/artifacts/release-readiness.json';
const REQUIRED_STABLE_RELEASE_CANDIDATE_ARTIFACT = 'Validation~/artifacts/stable-release-candidate.json';
const MAX_APPLICATION_EVIDENCE_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_APPLICATION_EVIDENCE_FUTURE_DRIFT_MS = 60 * 1000;

const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9_-]{20,}/u,
  /gbx_(?:indie|pro|studio|enterprise)_[A-Za-z0-9_-]{12,}/iu,
  /UNITY_PASSWORD\s*=/iu,
  /UNITY_LICENSE\s*=/iu,
  /STRIPE_(?:SECRET|API_KEY)\s*=/iu,
  /ANTHROPIC_API_KEY\s*=/iu,
  /OPENAI_API_KEY\s*=/iu,
];

export function parseVerifiedSolutionArgs(argv) {
  const options = {
    application: false,
    root: '',
    skipReleaseEvidence: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--application') options.application = true;
    else if (arg === '--root') options.root = argv[++index] ?? '';
    else if (arg === '--skip-release-evidence') options.skipReleaseEvidence = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

export function validateVerifiedSolutionPacket(root, options = {}) {
  const errors = [];
  const warnings = [];
  const packetPath = join(root, 'UNITY_VERIFIED_SOLUTION.md');
  const packagePath = join(root, 'package.json');
  const packet = readRequiredText(packetPath, errors);
  const manifest = readJson(packagePath, errors);

  if (manifest) {
    if (manifest.name !== 'com.greybox.studio') errors.push('package.json name must be com.greybox.studio');
    if (!isValidSemver(manifest.version)) errors.push('package.json version must be semver');
    if (options.application && String(manifest.version).includes('-')) {
      errors.push('application mode requires package.json to use a stable version');
    }
  }

  if (packet) {
    for (const field of REQUIRED_FIELDS) {
      if (!packet.includes(field)) errors.push(`UNITY_VERIFIED_SOLUTION.md missing program field: ${field}`);
    }
    for (const evidence of REQUIRED_TECHNICAL_EVIDENCE) {
      if (!packet.includes(evidence)) errors.push(`UNITY_VERIFIED_SOLUTION.md missing technical evidence: ${evidence}`);
    }
    for (const evidence of REQUIRED_SECURITY_EVIDENCE) {
      if (!packet.includes(evidence)) errors.push(`UNITY_VERIFIED_SOLUTION.md missing security evidence: ${evidence}`);
    }
    for (const evidence of REQUIRED_CUSTOMER_EVIDENCE) {
      if (!packet.includes(evidence)) errors.push(`UNITY_VERIFIED_SOLUTION.md missing customer evidence: ${evidence}`);
    }
    for (const blocker of REQUIRED_BLOCKERS) {
      if (!packet.includes(blocker)) errors.push(`UNITY_VERIFIED_SOLUTION.md missing application blocker: ${blocker}`);
    }
    if (/AI-generated/iu.test(packet)) {
      errors.push('UNITY_VERIFIED_SOLUTION.md must say AI-assisted, not unqualified AI-generated');
    }
    for (const pattern of SECRET_PATTERNS) {
      if (pattern.test(packet)) errors.push(`UNITY_VERIFIED_SOLUTION.md appears to contain a secret matching ${pattern}`);
    }
    const readyLine = readyToApplyLine(packet);
    if (!readyLine) errors.push('UNITY_VERIFIED_SOLUTION.md must include "Ready to apply: yes|no" near the top');
    if (options.application && readyLine !== 'yes') {
      errors.push('application mode requires UNITY_VERIFIED_SOLUTION.md to say "Ready to apply: yes"');
    }
    if (!options.application && readyLine === 'no') {
      warnings.push('Unity Verified Solution application is intentionally blocked until stable package, real Unity smoke matrix, customer references, and support SLA evidence are ready');
    }
    if (options.application && !options.skipReleaseEvidence) {
      validateApplicationEvidenceArtifacts(root, {
        errors,
        now: options.now instanceof Date ? options.now : new Date(),
      });
    }
  }

  return {
    status: errors.length === 0 ? 'pass' : 'fail',
    errors,
    warnings,
    requiredApplicationArtifacts: [
      REQUIRED_RELEASE_READINESS_ARTIFACT,
      REQUIRED_STABLE_RELEASE_CANDIDATE_ARTIFACT,
    ],
    requiredCustomerEvidence: REQUIRED_CUSTOMER_EVIDENCE,
    requiredTechnicalEvidence: REQUIRED_TECHNICAL_EVIDENCE,
  };
}

export function formatVerifiedSolutionMarkdown(report) {
  const lines = [
    '# Greybox Unity Verified Solution Gate',
    '',
    `Status: ${report.status}`,
    '',
    '## Customer Evidence',
    '',
    ...report.requiredCustomerEvidence.map((item) => `- ${item}`),
    '',
    '## Technical Evidence',
    '',
    ...report.requiredTechnicalEvidence.map((item) => `- ${item}`),
    '',
    '## Application Artifacts',
    '',
    ...report.requiredApplicationArtifacts.map((item) => `- \`${item}\``),
  ];
  if (report.warnings.length > 0) {
    lines.push('', '## Warnings', '', ...report.warnings.map((warning) => `- ${warning}`));
  }
  if (report.errors.length > 0) {
    lines.push('', '## Errors', '', ...report.errors.map((error) => `- ${error}`));
  }
  return `${lines.join('\n')}\n`;
}

function readyToApplyLine(packet) {
  const match = packet.match(/^Ready to apply:\s*(yes|no)\s*$/imu);
  return match?.[1]?.toLowerCase() ?? '';
}

function validateApplicationEvidenceArtifacts(root, options) {
  const submissionPacket = validateSubmissionPacket(root, {
    submission: true,
    now: options.now,
  });
  if (submissionPacket.status !== 'pass') {
    options.errors.push(`Asset Store submission gate must pass before Verified Solution application (${submissionPacket.errors.length} errors)`);
    for (const error of submissionPacket.errors) {
      options.errors.push(`Asset Store submission gate: ${error}`);
    }
  }
  validateStableReleaseCandidateArtifact(root, options);
}

function validateStableReleaseCandidateArtifact(root, options) {
  const artifactPath = join(root, REQUIRED_STABLE_RELEASE_CANDIDATE_ARTIFACT);
  const report = readRequiredJsonArtifact(
    artifactPath,
    REQUIRED_STABLE_RELEASE_CANDIDATE_ARTIFACT,
    options.errors,
    'application mode requires stable release candidate artifact',
  );
  if (!report) return;

  validateFreshEvidenceTimestamp(report, 'stable release candidate artifact', options);
  if (report?.status !== 'pass') {
    options.errors.push(`stable release candidate artifact must pass before Verified Solution application, got ${report?.status ?? '<missing>'}`);
  }
  if (report?.package?.stableVersionReady !== true) {
    options.errors.push('stable release candidate artifact must prove a stable 1.0.0+ package before Verified Solution application');
  }
  if (report?.submissionPacket?.status !== 'pass') {
    options.errors.push('stable release candidate artifact must prove the Asset Store submission packet passes before Verified Solution application');
  }
  if (report?.releaseReadiness?.status !== 'pass') {
    options.errors.push('stable release candidate artifact must prove release readiness passes before Verified Solution application');
  }
  if (report?.unityPackageExport?.status !== 'pass') {
    options.errors.push('stable release candidate artifact must prove .unitypackage export passes before Verified Solution application');
  }
  if (report?.sourceProof?.status !== 'pass' || report?.sourceProof?.sourceAdoptionReady !== true) {
    options.errors.push('stable release candidate artifact must prove Unity adoption source proof is ready before Verified Solution application');
  }
}

function validateFreshEvidenceTimestamp(record, label, options) {
  const raw = typeof record?.generatedAt === 'string' ? record.generatedAt.trim() : '';
  if (!raw) {
    options.errors.push(`${label} generatedAt must be present`);
    return;
  }
  const generatedAtMs = Date.parse(raw);
  if (!Number.isFinite(generatedAtMs)) {
    options.errors.push(`${label} generatedAt must be a valid ISO timestamp`);
    return;
  }
  const nowMs = options.now instanceof Date ? options.now.getTime() : Number.NaN;
  if (!Number.isFinite(nowMs)) {
    options.errors.push('Verified Solution application gate now must be a valid Date');
    return;
  }
  if (generatedAtMs > nowMs + MAX_APPLICATION_EVIDENCE_FUTURE_DRIFT_MS) {
    options.errors.push(`${label} generatedAt must not be in the future`);
  }
  if (nowMs - generatedAtMs > MAX_APPLICATION_EVIDENCE_AGE_MS) {
    options.errors.push(`${label} generatedAt must be no older than 14 days`);
  }
}

function readRequiredJsonArtifact(path, label, errors, missingMessage) {
  if (!existsSync(path)) {
    errors.push(`${missingMessage}: ${label}`);
    return null;
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    errors.push(`${label} must be valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function readRequiredText(path, errors) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    errors.push(`missing required Verified Solution packet: ${path}`);
    return '';
  }
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
  const options = parseVerifiedSolutionArgs(process.argv.slice(2));
  const root = options.root
    ? resolve(options.root)
    : resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const report = validateVerifiedSolutionPacket(root, options);
  process.stdout.write(formatVerifiedSolutionMarkdown(report));
  if (report.errors.length > 0) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) runCli();
