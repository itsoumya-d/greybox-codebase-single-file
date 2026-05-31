#!/usr/bin/env node
// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { isSemverAtLeast, isValidSemver } from './asset-store-metadata-check.mjs';
import { validateSubmissionPacket } from './asset-store-submission-check.mjs';
import {
  SUPPORTED_UNITY_TARGETS,
  hasTargetUnityVersionArgvEvidence,
  packageExportEvidenceFromOutput,
} from './release-readiness.mjs';
import {
  DEFAULT_UNITY_PACKAGE_PROJECT_PATH,
  EXPORT_METHOD,
  createUnityPackageExportCommand,
} from './unity-package-export.mjs';
import { buildUnityAdoptionProofExport } from './unity-adoption-proof.mjs';
import {
  requiredPackageTestAssemblies,
  requiredPackageTestAssembliesFromOutput,
  requiredSmokeResultTests,
  requiredSmokeResultsFromOutput,
} from './unity-import-smoke.mjs';

export const DEFAULT_RELEASE_READINESS_PATH = 'Validation~/artifacts/release-readiness.json';
export const DEFAULT_UNITY_PACKAGE_EXPORT_PATH = 'Validation~/artifacts/unitypackage-export.json';
export const DEFAULT_ADOPTION_SOURCE_PATH = 'Validation~/artifacts/unity-adoption-source.json';
export const MAX_STABLE_RELEASE_EVIDENCE_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_STABLE_RELEASE_EVIDENCE_FUTURE_DRIFT_MS = 60 * 1000;

export function parseStableReleaseCandidateArgs(argv) {
  const options = {
    adoptionSource: '',
    output: '',
    releaseReadiness: '',
    requireReady: false,
    root: '',
    unityPackageExport: '',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--adoption-source') options.adoptionSource = argv[++index] ?? '';
    else if (arg === '--output') options.output = argv[++index] ?? '';
    else if (arg === '--release-readiness') options.releaseReadiness = argv[++index] ?? '';
    else if (arg === '--require-ready') options.requireReady = true;
    else if (arg === '--root') options.root = argv[++index] ?? '';
    else if (arg === '--unitypackage-export') options.unityPackageExport = argv[++index] ?? '';
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

export function buildStableReleaseCandidateReport({
  adoptionSourcePath = '',
  now = new Date(),
  releaseReadinessPath = '',
  root = repoRoot(),
  unityPackageExportPath = '',
} = {}) {
  const packageRoot = resolve(root);
  const releasePath = resolvePath(packageRoot, releaseReadinessPath || DEFAULT_RELEASE_READINESS_PATH);
  const unityExportPath = resolvePath(packageRoot, unityPackageExportPath || DEFAULT_UNITY_PACKAGE_EXPORT_PATH);
  const sourcePath = resolvePath(packageRoot, adoptionSourcePath || DEFAULT_ADOPTION_SOURCE_PATH);
  const errors = [];
  const warnings = [];
  const manifest = readJson(join(packageRoot, 'package.json'));
  const packageName = String(manifest.value?.name ?? '');
  const packageVersion = String(manifest.value?.version ?? '');

  validatePackageIdentity({ errors, packageName, packageVersion });

  const submissionPacket = validateSubmissionPacket(packageRoot, { submission: true });
  if (submissionPacket.status !== 'pass') {
    errors.push(`submission packet gate must pass in final mode (${submissionPacket.errors.length} errors)`);
  }

  const release = readJson(releasePath);
  const releaseFresh = release.ok
    ? validateFreshEvidenceTimestamp(errors, release.value, 'release readiness artifact', now)
    : false;
  const releaseStatus = validateReleaseReadinessRecord(release.value, errors);
  const unityExport = readJson(unityExportPath);
  const unityExportFresh = unityExport.ok
    ? validateFreshEvidenceTimestamp(errors, unityExport.value, 'Unity package export manifest', now)
    : false;
  const unityPackageStatus = validateUnityPackageExportRecord({
    errors,
    packageName,
    packageVersion,
    record: unityExport.value,
    releaseExportEvidence: releaseStatus.exportEvidence,
    releaseReadyEditors: releaseStatus.readyEditors,
    root: packageRoot,
  });
  const adoptionProof = buildUnityAdoptionProofExport({
    now,
    root: packageRoot,
    releaseReadinessPath: releasePath,
    sourcePath,
  });
  if (!adoptionProof.sourceAdoptionReady) {
    errors.push('unity adoption source proof must be ready before claiming a stable release candidate');
  }

  if (!manifest.ok) errors.push(`package.json is missing or invalid: ${manifest.error}`);
  if (!release.ok) errors.push(`release readiness artifact is missing or invalid: ${pathRelative(packageRoot, releasePath)}`);
  if (!unityExport.ok) errors.push(`Unity package export manifest is missing or invalid: ${pathRelative(packageRoot, unityExportPath)}`);

  return {
    generatedAt: now.toISOString(),
    packageRoot,
    status: errors.length === 0 ? 'pass' : 'blocked',
    package: {
      name: packageName,
      version: packageVersion,
      stableVersionReady: isStableReleaseVersion(packageVersion),
    },
    submissionPacket: {
      status: submissionPacket.status,
      errorCount: submissionPacket.errors.length,
      errors: submissionPacket.errors,
    },
    releaseReadiness: {
      path: pathRelative(packageRoot, releasePath),
      status: releaseStatus.status === 'pass' && releaseFresh ? 'pass' : 'blocked',
      submission: release.value?.submission === true,
      readyTargets: releaseStatus.readyTargets,
      requiredTargets: SUPPORTED_UNITY_TARGETS.map((target) => target.version),
      missingTargets: releaseStatus.missingTargets,
    },
    unityPackageExport: {
      path: pathRelative(packageRoot, unityExportPath),
      status: unityPackageStatus.status === 'pass' && unityExportFresh ? 'pass' : 'blocked',
      packageName: String(unityExport.value?.packageName ?? ''),
      packageVersion: String(unityExport.value?.packageVersion ?? ''),
      outputPath: String(unityExport.value?.outputPath ?? ''),
      bytes: Number.isInteger(unityExport.value?.package?.bytes) ? unityExport.value.package.bytes : 0,
      sha256: typeof unityExport.value?.package?.sha256 === 'string' ? unityExport.value.package.sha256 : '',
    },
    sourceProof: {
      path: pathRelative(packageRoot, sourcePath),
      status: adoptionProof.sourceAdoptionReady ? 'pass' : 'blocked',
      sourceAdoptionReady: adoptionProof.sourceAdoptionReady,
      evidenceTypes: adoptionProof.source.evidenceTypes,
      missingEvidenceTypes: adoptionProof.source.missingEvidenceTypes,
      blockers: adoptionProof.source.blockers,
    },
    errors,
    warnings,
    disclaimer: 'Stable release candidate proof only uses aggregate hashes and package evidence. Do not add customer names, license keys, contacts, game IP, credentials, or raw portal exports.',
  };
}

export function formatStableReleaseCandidateMarkdown(report) {
  const lines = [
    '# Greybox Unity Stable Release Candidate Gate',
    '',
    `Generated: ${report.generatedAt}`,
    `Status: ${report.status}`,
    `Package: ${report.package.name || '<missing>'}@${report.package.version || '<missing>'}`,
    `Submission packet: ${report.submissionPacket.status}`,
    `Release readiness: ${report.releaseReadiness.status}`,
    `Unity package export: ${report.unityPackageExport.status}`,
    `Source proof: ${report.sourceProof.status}`,
    '',
    '## Evidence',
    '',
    `- Release readiness: \`${report.releaseReadiness.path}\``,
    `- Unity package export: \`${report.unityPackageExport.path}\``,
    `- Adoption source: \`${report.sourceProof.path}\``,
  ];
  if (report.errors.length > 0) {
    lines.push('', '## Blockers', '', ...report.errors.map((error) => `- ${error}`));
  }
  if (report.sourceProof.blockers.length > 0) {
    lines.push('', '## Source Proof Blockers', '', ...report.sourceProof.blockers.map((blocker) => `- ${blocker}`));
  }
  if (report.warnings.length > 0) {
    lines.push('', '## Warnings', '', ...report.warnings.map((warning) => `- ${warning}`));
  }
  return `${lines.join('\n')}\n`;
}

function validatePackageIdentity({ errors, packageName, packageVersion }) {
  if (packageName !== 'com.greybox.studio') {
    errors.push('package.json name must be com.greybox.studio');
  }
  if (!isStableReleaseVersion(packageVersion)) {
    errors.push('package.json version must be a stable 1.0.0 or later release candidate version');
  }
}

function validateFreshEvidenceTimestamp(errors, record, label, now) {
  const raw = typeof record?.generatedAt === 'string' ? record.generatedAt.trim() : '';
  if (!raw) {
    errors.push(`${label} generatedAt must be present`);
    return false;
  }
  const generatedAtMs = Date.parse(raw);
  if (!Number.isFinite(generatedAtMs)) {
    errors.push(`${label} generatedAt must be a valid ISO timestamp`);
    return false;
  }
  const nowMs = now instanceof Date ? now.getTime() : Number.NaN;
  if (!Number.isFinite(nowMs)) {
    errors.push('stable release candidate gate now must be a valid Date');
    return false;
  }
  let valid = true;
  if (generatedAtMs > nowMs + MAX_STABLE_RELEASE_EVIDENCE_FUTURE_DRIFT_MS) {
    errors.push(`${label} generatedAt must not be in the future`);
    valid = false;
  }
  if (nowMs - generatedAtMs > MAX_STABLE_RELEASE_EVIDENCE_AGE_MS) {
    errors.push(`${label} generatedAt must be no older than 14 days`);
    valid = false;
  }
  return valid;
}

function validateReleaseReadinessRecord(record, errors) {
  const startingErrorCount = errors.length;
  const missingTargets = [];
  const readyEditors = [];
  const readyTargets = [];
  const steps = Array.isArray(record?.steps) ? record.steps : [];

  if (record?.submission !== true) {
    errors.push('release readiness artifact must be generated with --submission');
  }
  if (record?.summary?.status !== 'pass') {
    errors.push(`release readiness summary must pass, got ${record?.summary?.status ?? '<missing>'}`);
  }

  const targetMatrix = Array.isArray(record?.targetMatrix) ? record.targetMatrix : [];
  for (const target of SUPPORTED_UNITY_TARGETS) {
    const row = targetMatrix.find((candidate) => (
      candidate?.stream === target.stream
      && candidate?.version === target.version
    ));
    if (row?.status === 'ready' && typeof row?.editor === 'string' && row.editor.trim() !== '') {
      readyTargets.push(target.version);
      readyEditors.push({
        stream: target.stream,
        version: target.version,
        editor: row.editor.trim(),
      });
    } else {
      missingTargets.push(target.version);
      errors.push(`release readiness target must be ready: ${target.stream} ${target.version}`);
    }
  }

  for (const target of SUPPORTED_UNITY_TARGETS) {
    const stepId = `unity-editmode-smoke-${target.version}`;
    const step = steps.find((candidate) => candidate?.id === stepId);
    if (step?.status !== 'pass') {
      errors.push(`release readiness Unity smoke step must pass: ${stepId}`);
      continue;
    }
    if (!hasTargetUnityVersionEvidence(step, target)) {
      errors.push(`release readiness Unity smoke step must be pinned to target Unity version: ${stepId}`);
    }
    if (!hasRequiredSmokeResultEvidence(step, 'Unity EditMode import smoke')) {
      errors.push(`release readiness Unity smoke step must include named EditMode evidence: ${stepId}`);
    }
    if (!hasPackageTestAssemblyEvidence(step, 'Unity EditMode import smoke')) {
      errors.push(`release readiness Unity smoke step must include EditMode package test assembly evidence: ${stepId}`);
    }
    if (!hasSmokeResultXmlEvidence(step, 'Unity EditMode import smoke')) {
      errors.push(`release readiness Unity smoke step must include validated EditMode result XML evidence: ${stepId}`);
    }
    if (!hasRequiredSmokeResultEvidence(step, 'Unity PlayMode gameplay smoke')) {
      errors.push(`release readiness Unity smoke step must include named PlayMode evidence: ${stepId}`);
    }
    if (!hasPackageTestAssemblyEvidence(step, 'Unity PlayMode gameplay smoke')) {
      errors.push(`release readiness Unity smoke step must include PlayMode package test assembly evidence: ${stepId}`);
    }
    if (!hasSmokeResultXmlEvidence(step, 'Unity PlayMode gameplay smoke')) {
      errors.push(`release readiness Unity smoke step must include validated PlayMode result XML evidence: ${stepId}`);
    }
    if (String(step?.command ?? '').includes('--dry-run')) {
      errors.push(`release readiness Unity smoke step must not be dry-run: ${stepId}`);
    }
  }

  const exportStep = steps.find((candidate) => candidate?.id === 'asset-store-unitypackage-export');
  const exportEvidence = packageEvidenceFromStep(exportStep);
  if (exportStep?.status !== 'pass') {
    errors.push('release readiness .unitypackage export step must pass');
  }
  if (!exportEvidence.unityPackageExportPassed) {
    errors.push('release readiness .unitypackage export step must include output path, byte, and SHA-256 evidence');
  }
  return {
    status: errors.length === startingErrorCount ? 'pass' : 'blocked',
    exportEvidence,
    missingTargets,
    readyEditors,
    readyTargets,
  };
}

function validateUnityPackageExportRecord({
  errors,
  packageName,
  packageVersion,
  record,
  releaseExportEvidence,
  releaseReadyEditors = [],
  root,
}) {
  const startingErrorCount = errors.length;
  const exportPackage = record?.package ?? {};
  const bytes = exportPackage.bytes;
  const sha256 = typeof exportPackage.sha256 === 'string' ? exportPackage.sha256.toLowerCase() : '';
  const outputPath = typeof record?.outputPath === 'string' ? record.outputPath : '';
  const resolvedOutputPath = outputPath ? resolve(outputPath) : '';
  const distRoot = resolve(root, 'dist');
  const command = typeof record?.command === 'string' ? record.command : '';
  const commandArgv = Array.isArray(record?.commandArgv) && record.commandArgv.every((part) => typeof part === 'string')
    ? record.commandArgv
    : [];
  const commandWithEnvironment = typeof record?.commandWithEnvironment === 'string' ? record.commandWithEnvironment : '';
  const projectRoot = typeof record?.projectRoot === 'string' ? record.projectRoot : '';
  const resolvedProjectRoot = projectRoot ? resolve(projectRoot) : '';
  const expectedProjectRoot = resolve(root, DEFAULT_UNITY_PACKAGE_PROJECT_PATH);
  const unityPath = typeof record?.unity === 'string' ? record.unity.trim() : '';
  const unityVersion = typeof record?.unityVersion === 'string' ? record.unityVersion.trim() : '';
  const packageRoot = typeof record?.packageRoot === 'string' ? record.packageRoot : '';
  const supportedUnityVersion = SUPPORTED_UNITY_TARGETS.some((target) => target.version === unityVersion);
  const matchingReadyEditor = releaseReadyEditors.some((target) => (
    target.version === unityVersion
    && target.editor === unityPath
  ));
  const expectedCommandArgv = unityPath && outputPath && projectRoot
    ? createUnityPackageExportCommand({
        outputPath,
        projectRoot,
        unity: unityPath,
      })
    : [];
  let fileMatchesManifest = false;

  if (record?.status !== 'pass') {
    errors.push(`Unity package export manifest status must be pass, got ${record?.status ?? '<missing>'}`);
  }
  if (!packageRoot || resolve(packageRoot) !== root) {
    errors.push('Unity package export manifest packageRoot must match the package workspace');
  }
  if (!unityPath) {
    errors.push('Unity package export manifest Unity editor path must be non-empty');
  } else if (!command.includes(unityPath)) {
    errors.push('Unity package export manifest command must include the Unity editor path');
  }
  if (!supportedUnityVersion) {
    errors.push('Unity package export manifest unityVersion must match a supported Unity release target');
  }
  if (!matchingReadyEditor) {
    errors.push('Unity package export manifest Unity editor must match a release-readiness ready target');
  }
  if (resolvedProjectRoot !== expectedProjectRoot) {
    errors.push('Unity package export manifest projectRoot must be the clean Asset Store export project under .tmp/asset-store-export');
  }
  if (!command.includes('-projectPath') || (projectRoot && !command.includes(projectRoot))) {
    errors.push('Unity package export manifest command must use the clean Asset Store export project path');
  }
  if (commandArgv.length === 0) {
    errors.push('Unity package export manifest commandArgv must include the exact Unity export argv');
  } else if (!arraysEqual(commandArgv, expectedCommandArgv)) {
    errors.push('Unity package export manifest commandArgv must match the exact Unity export command');
  }
  if (!['-batchmode', '-quit', '-nographics'].every((arg) => command.includes(arg))) {
    errors.push('Unity package export manifest command must run Unity in batchmode, quit, and nographics mode');
  }
  if (!command.includes('-executeMethod') || !command.includes(EXPORT_METHOD)) {
    errors.push(`Unity package export manifest command must run ${EXPORT_METHOD}`);
  }
  if (!command.includes('-greyboxAssetStorePackageOutput') || (outputPath && !command.includes(outputPath))) {
    errors.push('Unity package export manifest command must pass the package output path to Unity');
  }
  if (!commandWithEnvironment.includes('GREYBOX_ASSET_STORE_PACKAGE_OUTPUT=')) {
    errors.push('Unity package export manifest commandWithEnvironment must include GREYBOX_ASSET_STORE_PACKAGE_OUTPUT');
  }
  if (outputPath && !commandWithEnvironment.includes(outputPath)) {
    errors.push('Unity package export manifest commandWithEnvironment must include the package output path');
  }
  if (command && !commandWithEnvironment.includes(command)) {
    errors.push('Unity package export manifest commandWithEnvironment must include the Unity export command');
  }
  if (command.includes('--dry-run') || commandWithEnvironment.includes('--dry-run')) {
    errors.push('Unity package export manifest command must not be dry-run');
  }
  if (record?.packageName !== packageName) {
    errors.push(`Unity package export manifest packageName must match package.json (${packageName || '<missing>'})`);
  }
  if (record?.packageVersion !== packageVersion) {
    errors.push(`Unity package export manifest packageVersion must match package.json (${packageVersion || '<missing>'})`);
  }
  if (!Number.isInteger(bytes) || bytes <= 0) {
    errors.push('Unity package export manifest must include a positive package byte count');
  }
  if (!/^[a-f0-9]{64}$/u.test(sha256)) {
    errors.push('Unity package export manifest must include a SHA-256 hash');
  }
  if (!outputPath.endsWith('.unitypackage')) {
    errors.push('Unity package export manifest outputPath must point to a .unitypackage file');
  }
  if (!isPathInsideDirectory(resolvedOutputPath, distRoot)) {
    errors.push('Unity package export manifest outputPath must be under the package dist/ handoff directory');
  }
  if (!outputPath || !existsSync(outputPath)) {
    errors.push('Unity package export file must exist on disk at outputPath');
  } else {
    const packageBytes = readFileSync(outputPath);
    const actualBytes = packageBytes.byteLength;
    const actualSha256 = createHash('sha256').update(packageBytes).digest('hex');
    if (actualBytes !== bytes) {
      errors.push(`Unity package export manifest byte count does not match file on disk (${actualBytes} != ${bytes})`);
    }
    if (actualSha256 !== sha256) {
      errors.push('Unity package export manifest SHA-256 does not match file on disk');
    }
    fileMatchesManifest = actualBytes === bytes && actualSha256 === sha256;
  }
  if (releaseExportEvidence.unityPackageExportPassed) {
    if (releaseExportEvidence.unityPackageOutputPath && resolve(releaseExportEvidence.unityPackageOutputPath) !== resolvedOutputPath) {
      errors.push('Unity package export manifest outputPath must match release readiness evidence');
    }
    if (releaseExportEvidence.unityPackageBytes !== bytes) {
      errors.push('Unity package export manifest byte count must match release readiness evidence');
    }
    if (releaseExportEvidence.unityPackageSha256 !== sha256) {
      errors.push('Unity package export manifest SHA-256 must match release readiness evidence');
    }
  }
  return {
    status: (
      record?.status === 'pass'
      && Number.isInteger(bytes)
      && bytes > 0
      && /^[a-f0-9]{64}$/u.test(sha256)
      && outputPath.endsWith('.unitypackage')
      && isPathInsideDirectory(resolvedOutputPath, distRoot)
      && fileMatchesManifest
      && errors.length === startingErrorCount
    )
      ? 'pass'
      : 'blocked',
  };
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

function hasTargetUnityVersionEvidence(step, target) {
  return hasTargetUnityVersionArgvEvidence(step, target);
}

function arraysEqual(left, right) {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function packageEvidenceFromStep(step) {
  if (
    step?.evidence?.unityPackageExportPassed === true
    && typeof step?.evidence?.unityPackageOutputPath === 'string'
    && step.evidence.unityPackageOutputPath.endsWith('.unitypackage')
    && Number.isInteger(step?.evidence?.unityPackageBytes)
    && step.evidence.unityPackageBytes > 0
    && typeof step?.evidence?.unityPackageSha256 === 'string'
    && /^[a-f0-9]{64}$/u.test(step.evidence.unityPackageSha256)
  ) {
    return {
      unityPackageExportPassed: true,
      unityPackageOutputPath: step.evidence.unityPackageOutputPath,
      unityPackageBytes: step.evidence.unityPackageBytes,
      unityPackageSha256: step.evidence.unityPackageSha256.toLowerCase(),
    };
  }
  const output = `${String(step?.stdout ?? '')}\n${String(step?.stderr ?? '')}`;
  return packageExportEvidenceFromOutput(output);
}

function isStableReleaseVersion(version) {
  return isValidSemver(version) && !String(version).includes('-') && isSemverAtLeast(version, '1.0.0');
}

function readJson(path) {
  try {
    return {
      ok: true,
      value: JSON.parse(readFileSync(path, 'utf8')),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      value: {},
    };
  }
}

function resolvePath(root, path) {
  return resolve(root, path);
}

function isPathInsideDirectory(path, directory) {
  if (!path || !directory) return false;
  const normalizedDirectory = directory.endsWith('/') ? directory : `${directory}/`;
  return path.startsWith(normalizedDirectory);
}

function pathRelative(root, path) {
  const normalizedRoot = root.endsWith('/') ? root : `${root}/`;
  return path.startsWith(normalizedRoot) ? path.slice(normalizedRoot.length) : path;
}

function repoRoot() {
  return resolve(dirname(fileURLToPath(import.meta.url)), '..');
}

function runCli() {
  const options = parseStableReleaseCandidateArgs(process.argv.slice(2));
  const root = options.root ? resolve(options.root) : repoRoot();
  const report = buildStableReleaseCandidateReport({
    adoptionSourcePath: options.adoptionSource,
    releaseReadinessPath: options.releaseReadiness,
    root,
    unityPackageExportPath: options.unityPackageExport,
  });
  const markdown = formatStableReleaseCandidateMarkdown(report);
  if (options.output) {
    const outputPath = resolve(root, options.output);
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  }
  process.stdout.write(markdown);
  if (options.requireReady && report.status !== 'pass') process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) runCli();
