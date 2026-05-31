#!/usr/bin/env node
// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_UNITY_PACKAGE_MANIFEST,
  DEFAULT_UNITY_PACKAGE_OUTPUT,
  DEFAULT_UNITY_PACKAGE_PROJECT_PATH,
} from './unity-package-export.mjs';
import {
  assertPassingResults,
  discoverUnityEditors,
  requiredPackageTestAssemblies,
  requiredPackageTestAssembliesFromOutput,
  requiredSmokeResultTests,
  requiredSmokeResultsFromOutput,
} from './unity-import-smoke.mjs';

export const DEFAULT_UNITY_VERSION = '2022.3.74f1';
export const DEFAULT_UNITY_ADOPTION_PROOF_OUTPUT = 'Validation~/artifacts/unity-adoption-proof.json';
export const DRY_RUN_UNITY_ADOPTION_PROOF_OUTPUT = '.tmp/release-readiness/unity-adoption-proof.json';
export const SUPPORTED_UNITY_TARGETS = [
  { stream: '2022.3 LTS', version: DEFAULT_UNITY_VERSION },
  { stream: '2023.2', version: '2023.2.20f1' },
  { stream: 'Unity 6', version: '6000.0.58f1' },
];

export function parseReleaseArgs(argv) {
  const options = {
    dryRunOnly: false,
    output: '',
    requireUnity: false,
    submission: false,
    unity: '',
    unityTargetEditors: [],
    unityVersion: DEFAULT_UNITY_VERSION,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run-only') options.dryRunOnly = true;
    else if (arg === '--output') options.output = argv[++index] ?? '';
    else if (arg === '--require-unity') options.requireUnity = true;
    else if (arg === '--submission') options.submission = true;
    else if (arg === '--unity') options.unity = argv[++index] ?? '';
    else if (arg === '--unity-target') options.unityTargetEditors.push(parseUnityTargetEditor(argv[++index] ?? ''));
    else if (arg === '--unity-version') options.unityVersion = argv[++index] ?? options.unityVersion;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

export function createReleaseSteps({
  discoveredEditors = [],
  dryRunOnly = false,
  nodePath = process.execPath,
  submission = false,
  unity = '',
  unityTargetEditors = [],
  unityVersion = DEFAULT_UNITY_VERSION,
  unityTargets = SUPPORTED_UNITY_TARGETS,
} = {}) {
  const metadataArgs = ['Validation~/asset-store-metadata-check.mjs'];
  if (submission) metadataArgs.push('--submission');
  const adoptionProofOutput = dryRunOnly
    ? DRY_RUN_UNITY_ADOPTION_PROOF_OUTPUT
    : DEFAULT_UNITY_ADOPTION_PROOF_OUTPUT;

  const steps = [
    {
      id: 'asset-store-metadata',
      label: 'Asset Store metadata gate',
      command: [nodePath, ...metadataArgs],
    },
    {
      id: 'asset-store-submission-packet',
      label: 'Asset Store submission packet gate',
      command: [
        nodePath,
        'Validation~/asset-store-submission-check.mjs',
        ...(submission ? ['--submission', '--skip-release-evidence'] : []),
      ],
    },
    {
      id: 'verified-solution-packet',
      label: 'Unity Verified Solution packet gate',
      command: [
        nodePath,
        'Validation~/verified-solution-readiness.mjs',
        ...(submission ? ['--application', '--skip-release-evidence'] : []),
      ],
    },
    {
      id: 'unity-adoption-proof',
      label: 'Cloud Unity adoption proof export',
      command: [
        nodePath,
        'Validation~/unity-adoption-proof.mjs',
        '--output',
        adoptionProofOutput,
      ],
    },
    {
      id: 'node-validation-tests',
      label: 'Node validation test suite',
      shellCommand: `${shellQuote(nodePath)} --test Validation~/*.test.mjs`,
    },
    {
      id: 'mcp-conformance-report',
      label: 'MCP conformance report',
      command: [
        nodePath,
        'Validation~/mcp-conformance-report.mjs',
        '--output',
        'Validation~/artifacts/mcp-conformance.md',
      ],
    },
    {
      id: 'unity-package-dry-run',
      label: 'Deterministic Unity package dry run',
      command: [
        nodePath,
        'Validation~/package-builder.mjs',
        '--dry-run',
        '--manifest',
        'Validation~/artifacts/package-manifest.json',
        '--summary',
        'Validation~/artifacts/package-summary.md',
      ],
    },
    ...unityTargets.map((target) => ({
      id: `unity-smoke-dry-run-${target.version}`,
      label: `Unity smoke project dry run (${target.stream})`,
      unityStream: target.stream,
      unityVersion: target.version,
      command: [
        nodePath,
        'Validation~/unity-import-smoke.mjs',
        '--dry-run',
        '--unity',
        unity || '/path/to/Unity',
        '--unity-version',
        target.version,
      ],
    })),
  ];

  if (dryRunOnly) {
    for (const target of unityTargets) {
      steps.push({
        id: unitySmokeStepId(target),
        label: `Unity EditMode + PlayMode smoke (${target.stream})`,
        unityStream: target.stream,
        unityVersion: target.version,
        status: 'skipped',
        reason: '--dry-run-only was supplied.',
      });
    }
    steps.push({
      id: 'asset-store-unitypackage-export',
      label: 'Asset Store .unitypackage export',
      status: 'skipped',
      reason: '--dry-run-only was supplied.',
    });
    return steps;
  }

  const targetMatrix = createUnityTargetMatrix({
    discoveredEditors,
    unity,
    unityTargetEditors,
    unityTargets,
    unityVersion,
  });
  const readyTargets = targetMatrix.filter((target) => target.status === 'ready' && target.editor);
  if (readyTargets.length === 0) {
    for (const target of unityTargets) {
      steps.push({
        id: unitySmokeStepId(target),
        label: `Unity EditMode + PlayMode smoke (${target.stream})`,
        unityStream: target.stream,
        unityVersion: target.version,
        status: 'blocked',
        reason: `Unity Editor for ${target.stream} ${target.version} was not found.`,
      });
    }
    steps.push({
      id: 'asset-store-unitypackage-export',
      label: 'Asset Store .unitypackage export',
      status: 'blocked',
      reason: 'Unity Editor was not found. Install Unity 2022.3 LTS or pass --unity /path/to/Unity.',
    });
    return steps;
  }

  for (const target of targetMatrix) {
    if (target.status !== 'ready' || !target.editor) {
      steps.push({
        id: unitySmokeStepId(target),
        label: `Unity EditMode + PlayMode smoke (${target.stream})`,
        unityStream: target.stream,
        unityVersion: target.version,
        status: 'blocked',
        reason: `Unity Editor for ${target.stream} ${target.version} was not found.`,
      });
      continue;
    }
    steps.push({
      id: unitySmokeStepId(target),
      label: `Unity EditMode + PlayMode smoke (${target.stream})`,
      unityStream: target.stream,
      unityVersion: target.version,
      command: [
        nodePath,
        'Validation~/unity-import-smoke.mjs',
        '--unity',
        target.editor,
        '--unity-version',
        target.version,
        '--project-path',
        unitySmokeArtifactRoot(target.version),
        '--log-file',
        join(unitySmokeArtifactRoot(target.version), 'editmode.log'),
        '--results-file',
        join(unitySmokeArtifactRoot(target.version), 'editmode-results.xml'),
        '--playmode-log-file',
        join(unitySmokeArtifactRoot(target.version), 'playmode.log'),
        '--playmode-results-file',
        join(unitySmokeArtifactRoot(target.version), 'playmode-results.xml'),
        ...(submission ? [] : ['--skip-if-missing']),
      ],
    });
  }
  const exportEditor = targetMatrix.find((target) => target.version === unityVersion && target.editor)?.editor
    || readyTargets[0].editor;
  const exportVersion = targetMatrix.find((target) => target.editor === exportEditor)?.version ?? unityVersion;
  steps.push({
    id: 'asset-store-unitypackage-export',
    label: 'Asset Store .unitypackage export',
    command: [
      nodePath,
      'Validation~/unity-package-export.mjs',
      '--unity',
      exportEditor,
      '--unity-version',
      exportVersion,
      '--project-path',
      DEFAULT_UNITY_PACKAGE_PROJECT_PATH,
      '--output',
      DEFAULT_UNITY_PACKAGE_OUTPUT,
      '--manifest',
      DEFAULT_UNITY_PACKAGE_MANIFEST,
    ],
  });
  return steps;
}

export function createUnityTargetMatrix({
  discoveredEditors = [],
  unity = '',
  unityTargetEditors = [],
  unityVersion = DEFAULT_UNITY_VERSION,
  unityTargets = SUPPORTED_UNITY_TARGETS,
} = {}) {
  const editors = Array.from(new Set([unity, ...discoveredEditors].filter(Boolean)));
  return unityTargets.map((target) => {
    const suppliedTargetEditor = unityTargetEditors.find((candidate) => candidate.version === target.version)?.editor ?? '';
    const suppliedEditor = unity && unityVersion === target.version ? unity : '';
    const discoveredEditor = editors.find((editor) => editorMatchesTarget(editor, target));
    const editor = suppliedTargetEditor || suppliedEditor || discoveredEditor || '';
    return {
      stream: target.stream,
      version: target.version,
      status: editor ? 'ready' : 'missing-editor',
      editor,
    };
  });
}

export function summarizeResults(results) {
  const summary = {
    passed: results.filter((result) => result.status === 'pass').length,
    failed: results.filter((result) => result.status === 'fail').length,
    blocked: results.filter((result) => result.status === 'blocked').length,
    skipped: results.filter((result) => result.status === 'skipped').length,
  };
  return {
    ...summary,
    status: summary.failed > 0 ? 'fail' : summary.blocked > 0 ? 'blocked' : 'pass',
  };
}

export function classifyExitCode(report, { requireUnity = false } = {}) {
  if (report.summary.failed > 0) return 1;
  if (report.summary.status === 'fail') return 1;
  if (requireUnity && report.summary.status === 'blocked') return 2;
  if (requireUnity && report.summary.blocked > 0) return 2;
  if (requireUnity && missingRequiredUnityTargets(report).length > 0) return 2;
  if (requireUnity && report.submissionEvidence?.status === 'blocked') return 2;
  return 0;
}

export function missingRequiredUnityTargets(report, unityTargets = SUPPORTED_UNITY_TARGETS) {
  const matrix = Array.isArray(report?.targetMatrix) ? report.targetMatrix : [];
  return unityTargets.filter((target) => {
    const row = matrix.find((candidate) => (
      candidate?.stream === target.stream
      && candidate?.version === target.version
    ));
    return row?.status !== 'ready' || !row?.editor;
  });
}

export function requiredUnitySmokeStepIds(unityTargets = SUPPORTED_UNITY_TARGETS) {
  return unityTargets.map(unitySmokeStepId);
}

export function finalSubmissionEvidenceBlockers(report, unityTargets = SUPPORTED_UNITY_TARGETS) {
  const blockers = [];
  const steps = Array.isArray(report?.steps) ? report.steps : [];

  for (const target of missingRequiredUnityTargets(report, unityTargets)) {
    blockers.push(`Unity target not ready for final release: ${target.stream} ${target.version}`);
  }

  for (const target of unityTargets) {
    const stepId = unitySmokeStepId(target);
    const step = steps.find((candidate) => candidate?.id === stepId);
    if (step?.status !== 'pass') {
      blockers.push(`final Unity smoke step must pass: ${stepId}`);
      continue;
    }
    if (!hasTargetUnityVersionEvidence(step, target)) {
      blockers.push(`final Unity smoke step must be pinned to target Unity version: ${stepId}`);
    }
    if (String(step?.command ?? '').includes('--dry-run')) {
      blockers.push(`final Unity smoke step must not be dry-run: ${stepId}`);
    }
    if (String(step?.command ?? '').includes('--skip-if-missing')) {
      blockers.push(`final Unity smoke step must not skip missing editors: ${stepId}`);
    }
    if (!hasSmokeCompletionEvidence(step, 'Unity EditMode import smoke')) {
      blockers.push(`final Unity smoke step must include EditMode completion evidence: ${stepId}`);
    }
    if (!hasRequiredSmokeResultEvidence(step, 'Unity EditMode import smoke')) {
      blockers.push(`final Unity smoke step must include named EditMode result evidence: ${stepId}`);
    }
    if (!hasPackageTestAssemblyEvidence(step, 'Unity EditMode import smoke')) {
      blockers.push(`final Unity smoke step must include EditMode package test assembly evidence: ${stepId}`);
    }
    if (!hasSmokeResultXmlEvidence(step, 'Unity EditMode import smoke', target)) {
      blockers.push(`final Unity smoke step must include validated EditMode result XML evidence: ${stepId}`);
    }
    if (!hasSmokeCompletionEvidence(step, 'Unity PlayMode gameplay smoke')) {
      blockers.push(`final Unity smoke step must include PlayMode completion evidence: ${stepId}`);
    }
    if (!hasRequiredSmokeResultEvidence(step, 'Unity PlayMode gameplay smoke')) {
      blockers.push(`final Unity smoke step must include named PlayMode result evidence: ${stepId}`);
    }
    if (!hasPackageTestAssemblyEvidence(step, 'Unity PlayMode gameplay smoke')) {
      blockers.push(`final Unity smoke step must include PlayMode package test assembly evidence: ${stepId}`);
    }
    if (!hasSmokeResultXmlEvidence(step, 'Unity PlayMode gameplay smoke', target)) {
      blockers.push(`final Unity smoke step must include validated PlayMode result XML evidence: ${stepId}`);
    }
  }

  const exportStep = steps.find((candidate) => candidate?.id === 'asset-store-unitypackage-export');
  if (exportStep?.status !== 'pass') {
    blockers.push('final Asset Store .unitypackage export step must pass');
  } else if (!hasUnityPackageExportEvidence(exportStep)) {
    blockers.push('final Asset Store .unitypackage export step must include output path, byte, and SHA-256 evidence');
  }
  if (String(exportStep?.command ?? '').includes('--dry-run')) {
    blockers.push('final Asset Store .unitypackage export step must not be dry-run');
  }

  return blockers;
}

export function formatMarkdownReport(report) {
  const lines = [
    `# Greybox Unity Release Readiness`,
    '',
    `Generated: ${report.generatedAt}`,
    `Status: ${report.summary.status}`,
    `Unity target: ${report.unityVersion}`,
    '',
    '| Unity stream | Version | Status | Editor |',
    '| --- | --- | --- | --- |',
    ...formatTargetMatrixRows(report.targetMatrix),
    '',
    '| Step | Status | Detail |',
    '| --- | --- | --- |',
  ];
  for (const step of report.steps) {
    const detail = step.reason || step.command || `exit ${step.exitCode}`;
    lines.push(`| ${escapeTableCell(step.label)} | ${step.status} | ${escapeTableCell(detail)} |`);
  }
  return `${lines.join('\n')}\n`;
}

export function runReleaseReadiness({
  discoveredEditors,
  dryRunOnly = false,
  env = process.env,
  now = new Date(),
  output = '',
  packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..'),
  requireUnity = false,
  submission = false,
  unity = '',
  unityTargetEditors = [],
  unityVersion = DEFAULT_UNITY_VERSION,
} = {}) {
  const editors = discoveredEditors ?? discoverUnityEditors();
  const plannedSteps = createReleaseSteps({
    discoveredEditors: editors,
    dryRunOnly,
    submission,
    unity,
    unityTargetEditors,
    unityVersion,
  });
  const steps = plannedSteps.map((step) => runStep(step, packageRoot, env));
  const summary = summarizeResults(steps);
  const targetMatrix = createUnityTargetMatrix({
    discoveredEditors: editors,
    unity,
    unityTargetEditors,
    unityVersion,
  });
  const report = {
    generatedAt: now.toISOString(),
    packageRoot,
    submission,
    targetMatrix,
    unityVersion,
    summary,
    steps,
  };
  if (submission) {
    const blockers = finalSubmissionEvidenceBlockers(report);
    report.submissionEvidence = {
      status: blockers.length === 0 ? 'pass' : 'blocked',
      blockers,
    };
    if (blockers.length > 0 && report.summary.status === 'pass') {
      report.summary = {
        ...report.summary,
        evidenceBlocked: blockers.length,
        status: 'blocked',
      };
    }
  }
  if (output) {
    const outputPath = resolve(packageRoot, output);
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  }
  return {
    exitCode: classifyExitCode(report, { requireUnity }),
    markdown: formatMarkdownReport(report),
    report,
  };
}

function runStep(step, cwd, env) {
  if (step.status) {
    return {
      id: step.id,
      label: step.label,
      ...stepTargetMetadata(step),
      status: step.status,
      reason: step.reason,
    };
  }

  const started = Date.now();
  const result = step.shellCommand
    ? spawnSync(step.shellCommand, {
      cwd,
      encoding: 'utf8',
      env,
      shell: true,
    })
    : spawnSync(step.command[0], step.command.slice(1), {
      cwd,
      encoding: 'utf8',
      env,
    });
  const durationMs = Date.now() - started;
  const exitCode = result.status ?? 1;
  const evidence = stepEvidence(step, result, cwd);
  return {
    id: step.id,
    label: step.label,
    ...stepTargetMetadata(step),
    status: exitCode === 0 ? 'pass' : 'fail',
    command: step.shellCommand || step.command.map(shellQuote).join(' '),
    ...(step.command ? { commandArgv: [...step.command] } : {}),
    exitCode,
    durationMs,
    ...(evidence ? { evidence } : {}),
    stdout: trimOutput(result.stdout),
    stderr: trimOutput(result.stderr),
  };
}

function stepEvidence(step, result, cwd) {
  const output = `${String(result.stdout ?? '')}\n${String(result.stderr ?? '')}`;
  if (step.id === 'asset-store-unitypackage-export') {
    return packageExportEvidenceFromOutput(output);
  }
  if (!String(step.id ?? '').startsWith('unity-editmode-smoke')) return undefined;
  const editModeRequiredResults = requiredSmokeResultsFromOutput(output, 'Unity EditMode import smoke');
  const playModeRequiredResults = requiredSmokeResultsFromOutput(output, 'Unity PlayMode gameplay smoke');
  const editModePackageTestAssemblies = requiredPackageTestAssembliesFromOutput(output, 'Unity EditMode import smoke');
  const playModePackageTestAssemblies = requiredPackageTestAssembliesFromOutput(output, 'Unity PlayMode gameplay smoke');
  const editModeResultXml = smokeResultXmlEvidenceFromOutput(output, 'Unity EditMode import smoke', cwd);
  const playModeResultXml = smokeResultXmlEvidenceFromOutput(output, 'Unity PlayMode gameplay smoke', cwd);
  return {
    editModeSmokePassed: output.includes('PASS Unity EditMode import smoke completed.'),
    editModeRequiredResults,
    editModeRequiredResultsPassed: editModeRequiredResults.length === requiredSmokeResultTests('Unity EditMode import smoke').length,
    editModePackageTestAssemblies,
    editModePackageTestAssembliesPassed: editModePackageTestAssemblies.length === requiredPackageTestAssemblies('Unity EditMode import smoke').length,
    ...prefixSmokeResultXmlEvidence('editMode', editModeResultXml),
    playModeSmokePassed: output.includes('PASS Unity PlayMode gameplay smoke completed.'),
    playModeRequiredResults,
    playModeRequiredResultsPassed: playModeRequiredResults.length === requiredSmokeResultTests('Unity PlayMode gameplay smoke').length,
    playModePackageTestAssemblies,
    playModePackageTestAssembliesPassed: playModePackageTestAssemblies.length === requiredPackageTestAssemblies('Unity PlayMode gameplay smoke').length,
    ...prefixSmokeResultXmlEvidence('playMode', playModeResultXml),
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

function hasSmokeCompletionEvidence(step, label) {
  const isPlayMode = /PlayMode/u.test(label);
  const fieldName = isPlayMode ? 'playModeSmokePassed' : 'editModeSmokePassed';
  if (step?.evidence?.[fieldName] === true) return true;
  const output = `${String(step?.stdout ?? '')}\n${String(step?.stderr ?? '')}`;
  const marker = isPlayMode
    ? 'PASS Unity PlayMode gameplay smoke completed.'
    : 'PASS Unity EditMode import smoke completed.';
  return output.includes(marker);
}

function hasRequiredSmokeResultEvidence(step, label) {
  const requiredTests = requiredSmokeResultTests(label);
  const isPlayMode = /PlayMode/u.test(label);
  const fieldName = isPlayMode ? 'playModeRequiredResults' : 'editModeRequiredResults';
  const passedFieldName = isPlayMode ? 'playModeRequiredResultsPassed' : 'editModeRequiredResultsPassed';
  if (step?.evidence?.[passedFieldName] === true) {
    const actual = Array.isArray(step?.evidence?.[fieldName]) ? step.evidence[fieldName] : [];
    return requiredTests.every((testName) => actual.includes(testName));
  }
  return requiredSmokeResultsFromOutput(`${String(step?.stdout ?? '')}\n${String(step?.stderr ?? '')}`, label).length === requiredTests.length;
}

function hasPackageTestAssemblyEvidence(step, label) {
  const requiredAssemblies = requiredPackageTestAssemblies(label);
  const isPlayMode = /PlayMode/u.test(label);
  const fieldName = isPlayMode ? 'playModePackageTestAssemblies' : 'editModePackageTestAssemblies';
  const passedFieldName = isPlayMode ? 'playModePackageTestAssembliesPassed' : 'editModePackageTestAssembliesPassed';
  if (step?.evidence?.[passedFieldName] === true) {
    const actual = Array.isArray(step?.evidence?.[fieldName]) ? step.evidence[fieldName] : [];
    return requiredAssemblies.every((assemblyName) => actual.includes(assemblyName));
  }
  return requiredPackageTestAssembliesFromOutput(`${String(step?.stdout ?? '')}\n${String(step?.stderr ?? '')}`, label).length === requiredAssemblies.length;
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
  const actualPath = step?.evidence?.[`${prefix}ResultXmlPath`];
  return smokeResultPathMatchesTarget(actualPath, label, target);
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
  return join(unitySmokeArtifactRoot(target.version), fileName);
}

function normalizePathForEvidence(value) {
  return normalize(String(value ?? '').trim()).replaceAll('\\', '/');
}

function hasTargetUnityVersionEvidence(step, target) {
  return hasTargetUnityVersionArgvEvidence(step, target);
}

export function hasTargetUnityVersionArgvEvidence(step, target) {
  if (!target) return false;
  if (step?.unityStream !== target.stream) return false;
  if (step?.unityVersion !== target.version) return false;
  const commandArgv = commandArgvFromStep(step);
  if (commandArgv.length === 0) return false;
  if (!commandArgv.some(isUnityImportSmokeScript)) return false;
  const versionFlagIndexes = commandArgv.flatMap((arg, index) => (arg === '--unity-version' ? [index] : []));
  return versionFlagIndexes.length === 1
    && commandArgv[versionFlagIndexes[0] + 1] === target.version;
}

function commandArgvFromStep(step) {
  return Array.isArray(step?.commandArgv) && step.commandArgv.every((part) => typeof part === 'string')
    ? step.commandArgv
    : [];
}

function isUnityImportSmokeScript(part) {
  return part === 'Validation~/unity-import-smoke.mjs'
    || part.endsWith('/unity-import-smoke.mjs');
}

function isUnityPackageExportScript(part) {
  return part === 'Validation~/unity-package-export.mjs'
    || part.endsWith('/unity-package-export.mjs');
}

function stepTargetMetadata(step) {
  return {
    ...(step.unityStream ? { unityStream: step.unityStream } : {}),
    ...(step.unityVersion ? { unityVersion: step.unityVersion } : {}),
  };
}

export function packageExportEvidenceFromOutput(output) {
  const text = String(output ?? '');
  const status = text.match(/^Status:\s*([a-z-]+)\s*$/imu)?.[1] ?? '';
  const outputPath = text.match(/^Output:\s*(.+?)\s*$/imu)?.[1]?.trim() ?? '';
  const packageMatch = text.match(/^Package:\s*(\d+) bytes, SHA-256 `([a-f0-9]{64})`\s*$/imu);
  const bytes = packageMatch ? Number(packageMatch[1]) : 0;
  const sha256 = packageMatch?.[2]?.toLowerCase() ?? '';
  return {
    unityPackageExportPassed: status === 'pass'
      && outputPath.endsWith('.unitypackage')
      && Number.isInteger(bytes)
      && bytes > 0
      && /^[a-f0-9]{64}$/u.test(sha256),
    ...(outputPath ? { unityPackageOutputPath: outputPath } : {}),
    ...(bytes > 0 ? { unityPackageBytes: bytes } : {}),
    ...(sha256 ? { unityPackageSha256: sha256 } : {}),
  };
}

export function smokeResultXmlEvidenceFromOutput(output, label, cwd = process.cwd()) {
  const resultPath = smokeResultXmlPathFromOutput(output, label);
  if (!resultPath) return {};
  const absolutePath = isAbsolute(resultPath) ? resultPath : resolve(cwd, resultPath);
  if (!existsSync(absolutePath)) return {};
  const bytes = readFileSync(absolutePath);
  if (bytes.length === 0) return {};
  return {
    path: absolutePath,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    validated: withSilencedValidationErrors(() => assertPassingResults(absolutePath, label)),
  };
}

function smokeResultXmlPathFromOutput(output, label) {
  const pattern = /PlayMode/u.test(label)
    ? /^PASS Unity PlayMode gameplay smoke completed\. Results:\s*(.+?)\s*$/imu
    : /^PASS Unity EditMode import smoke completed\. Results:\s*(.+?)\s*$/imu;
  return pattern.exec(String(output ?? ''))?.[1]?.trim() ?? '';
}

function prefixSmokeResultXmlEvidence(prefix, evidence) {
  if (!evidence?.path || !evidence?.bytes || !evidence?.sha256) return {};
  return {
    [`${prefix}ResultXmlPath`]: evidence.path,
    [`${prefix}ResultXmlBytes`]: evidence.bytes,
    [`${prefix}ResultXmlSha256`]: evidence.sha256,
    [`${prefix}ResultXmlValidated`]: evidence.validated === true,
  };
}

function withSilencedValidationErrors(callback) {
  const originalError = console.error;
  console.error = () => {};
  try {
    return callback();
  } finally {
    console.error = originalError;
  }
}

function unitySmokeArtifactRoot(version) {
  return join('Validation~/artifacts', `unity-smoke-${version}`);
}

function parseUnityTargetEditor(value) {
  const separator = value.indexOf('=');
  if (separator <= 0 || separator === value.length - 1) {
    throw new Error('--unity-target must use <unity-version>=<path-to-Unity>');
  }
  return {
    version: value.slice(0, separator),
    editor: value.slice(separator + 1),
  };
}

function unitySmokeStepId(target) {
  return `unity-editmode-smoke-${target.version}`;
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function trimOutput(value) {
  const text = String(value ?? '').trim();
  if (text.length <= 4000) return text;
  return `${text.slice(0, 3800)}\n...[truncated ${text.length - 3800} chars]`;
}

function escapeTableCell(value) {
  return String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', '<br>');
}

function formatTargetMatrixRows(targetMatrix) {
  if (!Array.isArray(targetMatrix) || targetMatrix.length === 0) {
    return ['| (not configured) | - | missing-editor | - |'];
  }
  return targetMatrix.map((target) => {
    const editor = target.editor ? target.editor : '-';
    return `| ${escapeTableCell(target.stream)} | ${escapeTableCell(target.version)} | ${escapeTableCell(target.status)} | ${escapeTableCell(editor)} |`;
  });
}

function editorMatchesTarget(editor, target) {
  const normalized = String(editor ?? '');
  if (!normalized) return false;
  if (normalized.includes(target.version)) return true;
  const majorMinor = target.version.match(/^(\d+\.\d+)/)?.[1] ?? '';
  if (!majorMinor) return false;
  return normalized.includes(`/Editor/${majorMinor}`) || normalized.includes(`\\Editor\\${majorMinor}`);
}

function main() {
  try {
    const options = parseReleaseArgs(process.argv.slice(2));
    const result = runReleaseReadiness(options);
    process.stdout.write(result.markdown);
    process.exitCode = result.exitCode;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
