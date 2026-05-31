// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  DEFAULT_UNITY_ADOPTION_PROOF_OUTPUT,
  DEFAULT_UNITY_VERSION,
  DRY_RUN_UNITY_ADOPTION_PROOF_OUTPUT,
  classifyExitCode,
  createReleaseSteps,
  createUnityTargetMatrix,
  finalSubmissionEvidenceBlockers,
  formatMarkdownReport,
  missingRequiredUnityTargets,
  packageExportEvidenceFromOutput,
  parseReleaseArgs,
  requiredUnitySmokeStepIds,
  smokeResultXmlEvidenceFromOutput,
  summarizeResults,
} from './release-readiness.mjs';
import {
  requiredPackageTestAssemblies,
  requiredSmokeResultTests,
} from './unity-import-smoke.mjs';

test('release readiness args capture submission and Unity requirements', () => {
  assert.deepEqual(parseReleaseArgs([
    '--submission',
    '--require-unity',
    '--unity',
    '/opt/unity/Editor/Unity',
    '--unity-version',
    '6000.0.58f1',
    '--unity-target',
    '2023.2.20f1=/opt/unity-2023/Editor/Unity',
    '--output',
    'Validation~/artifacts/report.json',
  ]), {
    dryRunOnly: false,
    output: 'Validation~/artifacts/report.json',
    requireUnity: true,
    submission: true,
    unity: '/opt/unity/Editor/Unity',
    unityTargetEditors: [
      {
        version: '2023.2.20f1',
        editor: '/opt/unity-2023/Editor/Unity',
      },
    ],
    unityVersion: '6000.0.58f1',
  });
});

test('release readiness plans static gates, dry-run smoke, and blocked real smoke without Unity', () => {
  const steps = createReleaseSteps({
    discoveredEditors: [],
    nodePath: '/usr/local/bin/node',
  });

  assert.deepEqual(steps.map((step) => step.id), [
    'asset-store-metadata',
    'asset-store-submission-packet',
    'verified-solution-packet',
    'unity-adoption-proof',
    'node-validation-tests',
    'mcp-conformance-report',
    'unity-package-dry-run',
    'unity-smoke-dry-run-2022.3.74f1',
    'unity-smoke-dry-run-2023.2.20f1',
    'unity-smoke-dry-run-6000.0.58f1',
    'unity-editmode-smoke-2022.3.74f1',
    'unity-editmode-smoke-2023.2.20f1',
    'unity-editmode-smoke-6000.0.58f1',
    'asset-store-unitypackage-export',
  ]);
  assert.deepEqual(steps[0].command, ['/usr/local/bin/node', 'Validation~/asset-store-metadata-check.mjs']);
  assert.deepEqual(steps[1].command, ['/usr/local/bin/node', 'Validation~/asset-store-submission-check.mjs']);
  assert.deepEqual(steps[2].command, ['/usr/local/bin/node', 'Validation~/verified-solution-readiness.mjs']);
  assert.deepEqual(steps[3].command, [
    '/usr/local/bin/node',
    'Validation~/unity-adoption-proof.mjs',
    '--output',
    'Validation~/artifacts/unity-adoption-proof.json',
  ]);
  assert.equal(steps[4].shellCommand, "'/usr/local/bin/node' --test Validation~/*.test.mjs");
  assert.deepEqual(steps[5].command, [
    '/usr/local/bin/node',
    'Validation~/mcp-conformance-report.mjs',
    '--output',
    'Validation~/artifacts/mcp-conformance.md',
  ]);
  assert.deepEqual(steps[6].command, [
    '/usr/local/bin/node',
    'Validation~/package-builder.mjs',
    '--dry-run',
    '--manifest',
    'Validation~/artifacts/package-manifest.json',
    '--summary',
    'Validation~/artifacts/package-summary.md',
  ]);
  assert.ok(steps[7].command.includes('--dry-run'));
  assert.equal(steps[7].unityVersion, DEFAULT_UNITY_VERSION);
  assert.equal(steps[7].command.at(-1), DEFAULT_UNITY_VERSION);
  assert.equal(steps[8].unityVersion, '2023.2.20f1');
  assert.equal(steps[8].command.at(-1), '2023.2.20f1');
  assert.equal(steps[9].unityVersion, '6000.0.58f1');
  assert.equal(steps[9].command.at(-1), '6000.0.58f1');
  assert.equal(steps[10].status, 'blocked');
  assert.equal(steps[10].unityVersion, DEFAULT_UNITY_VERSION);
  assert.match(steps[10].reason, /2022\.3 LTS 2022\.3\.74f1/u);
  assert.equal(steps[11].status, 'blocked');
  assert.match(steps[11].reason, /2023\.2 2023\.2\.20f1/u);
  assert.equal(steps[12].status, 'blocked');
  assert.match(steps[12].reason, /Unity 6 6000\.0\.58f1/u);
  assert.equal(steps[13].status, 'blocked');
  assert.match(steps[13].reason, /Unity Editor was not found/u);
});

test('release readiness dry-run-only writes adoption proof outside tracked artifacts', () => {
  const steps = createReleaseSteps({
    dryRunOnly: true,
    nodePath: '/usr/local/bin/node',
  });
  const proofStep = steps.find((step) => step.id === 'unity-adoption-proof');

  assert.deepEqual(proofStep.command, [
    '/usr/local/bin/node',
    'Validation~/unity-adoption-proof.mjs',
    '--output',
    DRY_RUN_UNITY_ADOPTION_PROOF_OUTPUT,
  ]);
  assert.ok(!proofStep.command.includes(DEFAULT_UNITY_ADOPTION_PROOF_OUTPUT));
});

test('release readiness plans real Unity smoke matrix and package export when editors are supplied', () => {
  const steps = createReleaseSteps({
    discoveredEditors: [
      '/Applications/Unity/Hub/Editor/2022.3.74f1/Unity.app/Contents/MacOS/Unity',
      '/Applications/Unity/Hub/Editor/2023.2.20f1/Unity.app/Contents/MacOS/Unity',
      '/Applications/Unity/Hub/Editor/6000.0.58f1/Unity.app/Contents/MacOS/Unity',
    ],
    unityVersion: '2022.3.74f1',
  });
  const smokeSteps = steps.filter((step) => step.id.startsWith('unity-editmode-smoke-'));
  const exportStep = steps.at(-1);

  assert.deepEqual(smokeSteps.map((step) => step.id), [
    'unity-editmode-smoke-2022.3.74f1',
    'unity-editmode-smoke-2023.2.20f1',
    'unity-editmode-smoke-6000.0.58f1',
  ]);
  assert.deepEqual(smokeSteps.map((step) => step.unityVersion), [
    '2022.3.74f1',
    '2023.2.20f1',
    '6000.0.58f1',
  ]);
  assert.equal(smokeSteps.every((step) => step.status === undefined), true);
  assert.ok(smokeSteps[0].command.includes('/Applications/Unity/Hub/Editor/2022.3.74f1/Unity.app/Contents/MacOS/Unity'));
  assert.ok(smokeSteps[1].command.includes('/Applications/Unity/Hub/Editor/2023.2.20f1/Unity.app/Contents/MacOS/Unity'));
  assert.ok(smokeSteps[2].command.includes('/Applications/Unity/Hub/Editor/6000.0.58f1/Unity.app/Contents/MacOS/Unity'));
  assert.ok(smokeSteps[0].command.includes('Validation~/artifacts/unity-smoke-2022.3.74f1'));
  assert.ok(smokeSteps[0].command.some((part) => part.includes('editmode-results.xml')));
  assert.ok(smokeSteps[0].command.some((part) => part.includes('playmode-results.xml')));
  assert.equal(smokeSteps.every((step) => step.command.includes('--skip-if-missing')), true);
  assert.equal(exportStep.id, 'asset-store-unitypackage-export');
  assert.equal(exportStep.status, undefined);
  assert.ok(exportStep.command.includes('Validation~/unity-package-export.mjs'));
  assert.ok(exportStep.command.includes('dist/com.greybox.studio.unitypackage'));
  assert.ok(exportStep.command.includes('Validation~/artifacts/unitypackage-export.json'));
});

test('release readiness final submission smoke commands cannot skip missing editors', () => {
  const steps = createReleaseSteps({
    discoveredEditors: [
      '/Applications/Unity/Hub/Editor/2022.3.74f1/Unity.app/Contents/MacOS/Unity',
      '/Applications/Unity/Hub/Editor/2023.2.20f1/Unity.app/Contents/MacOS/Unity',
      '/Applications/Unity/Hub/Editor/6000.0.58f1/Unity.app/Contents/MacOS/Unity',
    ],
    submission: true,
  });
  const smokeSteps = steps.filter((step) => step.id.startsWith('unity-editmode-smoke-'));
  const verifiedSolutionStep = steps.find((step) => step.id === 'verified-solution-packet');

  assert.deepEqual(verifiedSolutionStep.command, [
    process.execPath,
    'Validation~/verified-solution-readiness.mjs',
    '--application',
    '--skip-release-evidence',
  ]);
  assert.equal(smokeSteps.length, 3);
  assert.equal(smokeSteps.every((step) => !step.command.includes('--skip-if-missing')), true);
});

test('release readiness supports explicit per-target Unity editor paths', () => {
  const matrix = createUnityTargetMatrix({
    unityTargetEditors: [
      {
        version: '2023.2.20f1',
        editor: '/custom/Unity2023/Unity',
      },
      {
        version: '6000.0.58f1',
        editor: '/custom/Unity6/Unity',
      },
    ],
  });

  assert.equal(matrix[0].status, 'missing-editor');
  assert.equal(matrix[1].editor, '/custom/Unity2023/Unity');
  assert.equal(matrix[2].editor, '/custom/Unity6/Unity');
  assert.deepEqual(requiredUnitySmokeStepIds(), [
    'unity-editmode-smoke-2022.3.74f1',
    'unity-editmode-smoke-2023.2.20f1',
    'unity-editmode-smoke-6000.0.58f1',
  ]);
});

test('release readiness reports a Unity support matrix for target streams', () => {
  const matrix = createUnityTargetMatrix({
    discoveredEditors: [
      '/Applications/Unity/Hub/Editor/2022.3.74f1/Unity.app/Contents/MacOS/Unity',
      '/Applications/Unity/Hub/Editor/6000.0.58f1/Unity.app/Contents/MacOS/Unity',
    ],
  });

  assert.deepEqual(matrix.map((target) => `${target.stream}:${target.status}`), [
    '2022.3 LTS:ready',
    '2023.2:missing-editor',
    'Unity 6:ready',
  ]);
  assert.match(matrix[0].editor, /2022\.3\.74f1/u);
  assert.equal(matrix[1].editor, '');
});

test('release readiness parses Asset Store package export output path, byte, and hash evidence', () => {
  const evidence = packageExportEvidenceFromOutput([
    '# Greybox Unity Asset Store Package Export',
    '',
    'Status: pass',
    'Output: /tmp/dist/com.greybox.studio.unitypackage',
    `Package: 123456 bytes, SHA-256 \`${'a'.repeat(64)}\``,
  ].join('\n'));

  assert.deepEqual(evidence, {
    unityPackageExportPassed: true,
    unityPackageOutputPath: '/tmp/dist/com.greybox.studio.unitypackage',
    unityPackageBytes: 123456,
    unityPackageSha256: 'a'.repeat(64),
  });
  assert.equal(packageExportEvidenceFromOutput('Status: dry-run').unityPackageExportPassed, false);
  assert.equal(packageExportEvidenceFromOutput([
    '# Greybox Unity Asset Store Package Export',
    '',
    'Status: pass',
    `Package: 123456 bytes, SHA-256 \`${'a'.repeat(64)}\``,
  ].join('\n')).unityPackageExportPassed, false);
});

test('release readiness parses validated Unity smoke result XML evidence', () => {
  const root = mkdtempSync(join(tmpdir(), 'greybox-release-result-xml-'));
  const editModeResults = join(root, 'editmode-results.xml');
  writeFileSync(editModeResults, resultXml('Unity EditMode import smoke'));

  const evidence = smokeResultXmlEvidenceFromOutput(
    `PASS Unity EditMode import smoke completed. Results: ${editModeResults}`,
    'Unity EditMode import smoke',
  );

  assert.equal(evidence.path, editModeResults);
  assert.equal(evidence.validated, true);
  assert.ok(evidence.bytes > 0);
  assert.match(evidence.sha256, /^[a-f0-9]{64}$/u);
  assert.deepEqual(smokeResultXmlEvidenceFromOutput('PASS Unity EditMode import smoke completed. Results: /tmp/missing.xml', 'Unity EditMode import smoke'), {});
});

test('release readiness exit code only fails blocked smoke when Unity is required', () => {
  const report = {
    summary: summarizeResults([
      { status: 'pass' },
      { status: 'blocked' },
    ]),
  };
  assert.equal(report.summary.status, 'blocked');
  assert.equal(classifyExitCode(report), 0);
  assert.equal(classifyExitCode(report, { requireUnity: true }), 2);

  const failed = {
    summary: summarizeResults([
      { status: 'pass' },
      { status: 'fail' },
    ]),
  };
  assert.equal(classifyExitCode(failed, { requireUnity: true }), 1);
});

test('release readiness requires every supported Unity target for submission exits', () => {
  const partial = {
    summary: summarizeResults([{ status: 'pass' }]),
    targetMatrix: [
      {
        stream: '2022.3 LTS',
        version: '2022.3.74f1',
        status: 'ready',
        editor: '/Applications/Unity/Hub/Editor/2022.3.74f1/Unity.app/Contents/MacOS/Unity',
      },
      {
        stream: '2023.2',
        version: '2023.2.20f1',
        status: 'missing-editor',
        editor: '',
      },
      {
        stream: 'Unity 6',
        version: '6000.0.58f1',
        status: 'ready',
        editor: '/Applications/Unity/Hub/Editor/6000.0.58f1/Unity.app/Contents/MacOS/Unity',
      },
    ],
  };

  assert.deepEqual(missingRequiredUnityTargets(partial).map((target) => target.stream), ['2023.2']);
  assert.equal(classifyExitCode(partial), 0);
  assert.equal(classifyExitCode(partial, { requireUnity: true }), 2);

  const complete = {
    ...partial,
    targetMatrix: partial.targetMatrix.map((target) => ({
      ...target,
      status: 'ready',
      editor: `/Applications/Unity/Hub/Editor/${target.version}/Unity.app/Contents/MacOS/Unity`,
    })),
  };
  assert.deepEqual(missingRequiredUnityTargets(complete), []);
  assert.equal(classifyExitCode(complete, { requireUnity: true }), 0);
});

test('release readiness final submission evidence blocks missing named smoke and package export proof', () => {
  const report = {
    submission: true,
    summary: summarizeResults([{ status: 'pass' }]),
    targetMatrix: readyTargetMatrix(),
    steps: [
      {
        id: 'unity-editmode-smoke-2022.3.74f1',
        status: 'pass',
        command: 'node Validation~/unity-import-smoke.mjs --unity /Applications/Unity/Hub/Editor/2022.3.74f1/Unity.app/Contents/MacOS/Unity --skip-if-missing',
      },
      smokeStep('unity-editmode-smoke-2023.2.20f1'),
      smokeStep('unity-editmode-smoke-6000.0.58f1'),
      { id: 'asset-store-unitypackage-export', status: 'pass' },
    ],
  };
  const blockers = finalSubmissionEvidenceBlockers(report);

  assert.ok(blockers.includes('final Unity smoke step must not skip missing editors: unity-editmode-smoke-2022.3.74f1'));
  assert.ok(blockers.includes('final Unity smoke step must be pinned to target Unity version: unity-editmode-smoke-2022.3.74f1'));
  assert.ok(blockers.includes('final Unity smoke step must include EditMode completion evidence: unity-editmode-smoke-2022.3.74f1'));
  assert.ok(blockers.includes('final Unity smoke step must include named PlayMode result evidence: unity-editmode-smoke-2022.3.74f1'));
  assert.ok(blockers.includes('final Unity smoke step must include validated EditMode result XML evidence: unity-editmode-smoke-2022.3.74f1'));
  assert.ok(blockers.includes('final Unity smoke step must include validated PlayMode result XML evidence: unity-editmode-smoke-2022.3.74f1'));
  assert.ok(blockers.includes('final Asset Store .unitypackage export step must include output path, byte, and SHA-256 evidence'));
});

test('release readiness final evidence rejects package export proof without output path', () => {
  const incompletePackageEvidence = assetStorePackageEvidence();
  delete incompletePackageEvidence.unityPackageOutputPath;
  const report = {
    submission: true,
    summary: summarizeResults([{ status: 'pass' }]),
    targetMatrix: readyTargetMatrix(),
    steps: [
      smokeStep('unity-editmode-smoke-2022.3.74f1'),
      smokeStep('unity-editmode-smoke-2023.2.20f1'),
      smokeStep('unity-editmode-smoke-6000.0.58f1'),
      assetStorePackageStep({ evidence: incompletePackageEvidence }),
    ],
  };

  assert.deepEqual(finalSubmissionEvidenceBlockers(report), [
    'final Asset Store .unitypackage export step must include output path, byte, and SHA-256 evidence',
  ]);
});

test('release readiness final submission evidence passes only with complete real-smoke proof', () => {
  const report = {
    submission: true,
    summary: summarizeResults([{ status: 'pass' }]),
    targetMatrix: readyTargetMatrix(),
    steps: [
      smokeStep('unity-editmode-smoke-2022.3.74f1'),
      smokeStep('unity-editmode-smoke-2023.2.20f1'),
      smokeStep('unity-editmode-smoke-6000.0.58f1'),
      assetStorePackageStep(),
    ],
  };

  assert.deepEqual(finalSubmissionEvidenceBlockers(report), []);
});

test('release readiness final evidence rejects smoke proof without result XML fingerprints', () => {
  const incomplete = smokeStep('unity-editmode-smoke-2022.3.74f1');
  delete incomplete.evidence.editModeResultXmlPath;
  delete incomplete.evidence.editModeResultXmlBytes;
  delete incomplete.evidence.editModeResultXmlSha256;
  delete incomplete.evidence.playModeResultXmlPath;
  delete incomplete.evidence.playModeResultXmlBytes;
  delete incomplete.evidence.playModeResultXmlSha256;
  const report = {
    submission: true,
    summary: summarizeResults([{ status: 'pass' }]),
    targetMatrix: readyTargetMatrix(),
    steps: [
      incomplete,
      smokeStep('unity-editmode-smoke-2023.2.20f1'),
      smokeStep('unity-editmode-smoke-6000.0.58f1'),
      assetStorePackageStep(),
    ],
  };

  const blockers = finalSubmissionEvidenceBlockers(report);
  assert.ok(blockers.includes('final Unity smoke step must include validated EditMode result XML evidence: unity-editmode-smoke-2022.3.74f1'));
  assert.ok(blockers.includes('final Unity smoke step must include validated PlayMode result XML evidence: unity-editmode-smoke-2022.3.74f1'));
});

test('release readiness final evidence rejects unvalidated result XML fingerprints', () => {
  const incomplete = smokeStep('unity-editmode-smoke-2022.3.74f1');
  incomplete.evidence.editModeResultXmlValidated = false;
  incomplete.evidence.playModeResultXmlValidated = false;
  const report = {
    submission: true,
    summary: summarizeResults([{ status: 'pass' }]),
    targetMatrix: readyTargetMatrix(),
    steps: [
      incomplete,
      smokeStep('unity-editmode-smoke-2023.2.20f1'),
      smokeStep('unity-editmode-smoke-6000.0.58f1'),
      assetStorePackageStep(),
    ],
  };

  const blockers = finalSubmissionEvidenceBlockers(report);
  assert.ok(blockers.includes('final Unity smoke step must include validated EditMode result XML evidence: unity-editmode-smoke-2022.3.74f1'));
  assert.ok(blockers.includes('final Unity smoke step must include validated PlayMode result XML evidence: unity-editmode-smoke-2022.3.74f1'));
});

test('release readiness final evidence rejects smoke XML outside the target artifact path', () => {
  const offPath = smokeStep('unity-editmode-smoke-2022.3.74f1');
  offPath.evidence.editModeResultXmlPath = '/tmp/stale/editmode-results.xml';
  offPath.evidence.playModeResultXmlPath = '/tmp/stale/playmode-results.xml';
  const report = {
    submission: true,
    summary: summarizeResults([{ status: 'pass' }]),
    targetMatrix: readyTargetMatrix(),
    steps: [
      offPath,
      smokeStep('unity-editmode-smoke-2023.2.20f1'),
      smokeStep('unity-editmode-smoke-6000.0.58f1'),
      assetStorePackageStep(),
    ],
  };

  const blockers = finalSubmissionEvidenceBlockers(report);
  assert.ok(blockers.includes('final Unity smoke step must include validated EditMode result XML evidence: unity-editmode-smoke-2022.3.74f1'));
  assert.ok(blockers.includes('final Unity smoke step must include validated PlayMode result XML evidence: unity-editmode-smoke-2022.3.74f1'));
});

test('release readiness final evidence rejects smoke commands without pinned result XML outputs', () => {
  const unpinned = smokeStep('unity-editmode-smoke-2022.3.74f1');
  unpinned.commandArgv = smokeCommandArgv('2022.3.74f1').filter((part, index, argv) => (
    part !== '--results-file'
    && part !== '--playmode-results-file'
    && argv[index - 1] !== '--results-file'
    && argv[index - 1] !== '--playmode-results-file'
  ));
  const report = {
    submission: true,
    summary: summarizeResults([{ status: 'pass' }]),
    targetMatrix: readyTargetMatrix(),
    steps: [
      unpinned,
      smokeStep('unity-editmode-smoke-2023.2.20f1'),
      smokeStep('unity-editmode-smoke-6000.0.58f1'),
      assetStorePackageStep(),
    ],
  };

  const blockers = finalSubmissionEvidenceBlockers(report);
  assert.ok(blockers.includes('final Unity smoke step must include validated EditMode result XML evidence: unity-editmode-smoke-2022.3.74f1'));
  assert.ok(blockers.includes('final Unity smoke step must include validated PlayMode result XML evidence: unity-editmode-smoke-2022.3.74f1'));
});

test('release readiness final evidence rejects version-mismatched Unity smoke proof', () => {
  const mismatched = smokeStep('unity-editmode-smoke-2023.2.20f1');
  mismatched.unityVersion = '2022.3.74f1';
  mismatched.command = 'node Validation~/unity-import-smoke.mjs --unity /Applications/Unity/Hub/Editor/2022.3.74f1/Unity.app/Contents/MacOS/Unity --unity-version 2022.3.74f1';
  const unpinned = smokeStep('unity-editmode-smoke-6000.0.58f1');
  unpinned.command = 'node Validation~/unity-import-smoke.mjs --unity /Applications/Unity/Hub/Editor/6000.0.58f1/Unity.app/Contents/MacOS/Unity';
  delete unpinned.commandArgv;
  const report = {
    submission: true,
    summary: summarizeResults([{ status: 'pass' }]),
    targetMatrix: readyTargetMatrix(),
    steps: [
      smokeStep('unity-editmode-smoke-2022.3.74f1'),
      mismatched,
      unpinned,
      assetStorePackageStep(),
    ],
  };
  const blockers = finalSubmissionEvidenceBlockers(report);

  assert.ok(blockers.includes('final Unity smoke step must be pinned to target Unity version: unity-editmode-smoke-2023.2.20f1'));
  assert.ok(blockers.includes('final Unity smoke step must be pinned to target Unity version: unity-editmode-smoke-6000.0.58f1'));
});

test('release readiness final evidence rejects substring-spoofed Unity smoke argv', () => {
  const spoofed = smokeStep('unity-editmode-smoke-2022.3.74f1');
  spoofed.commandArgv = [
    'node',
    'Validation~/unity-import-smoke.mjs',
    '--unity',
    '/Applications/Unity/Hub/Editor/2022.3.74f1/Unity.app/Contents/MacOS/Unity',
    '--unity-version',
    '2022.3.74f1 --dry-run',
  ];
  const report = {
    submission: true,
    summary: summarizeResults([{ status: 'pass' }]),
    targetMatrix: readyTargetMatrix(),
    steps: [
      spoofed,
      smokeStep('unity-editmode-smoke-2023.2.20f1'),
      smokeStep('unity-editmode-smoke-6000.0.58f1'),
      assetStorePackageStep(),
    ],
  };

  assert.ok(finalSubmissionEvidenceBlockers(report).includes(
    'final Unity smoke step must be pinned to target Unity version: unity-editmode-smoke-2022.3.74f1',
  ));
});

test('release readiness final evidence rejects substring-spoofed smoke stdout', () => {
  const report = {
    submission: true,
    summary: summarizeResults([{ status: 'pass' }]),
    targetMatrix: readyTargetMatrix(),
    steps: [
      {
        id: 'unity-editmode-smoke-2022.3.74f1',
        status: 'pass',
        unityStream: '2022.3 LTS',
        unityVersion: '2022.3.74f1',
        command: 'node Validation~/unity-import-smoke.mjs --unity /Applications/Unity/Hub/Editor/2022.3.74f1/Unity.app/Contents/MacOS/Unity',
        commandArgv: smokeCommandArgv('2022.3.74f1'),
        stdout: [
          'PASS Unity EditMode required smoke results: EditorVersionMatchesReleaseTarget, PackageMetadataAndAssembliesLoad, NotPackagedSamplesImportIntoProjectAssetsUnderThirtySeconds',
          'PASS Unity EditMode import smoke completed. Results: /tmp/results.xml',
          'PASS Unity PlayMode required smoke results: GeneratedPlatformerSceneRunsGameplayLoop, NotInputFallbackCompositionWorks',
          'PASS Unity PlayMode gameplay smoke completed. Results: /tmp/playmode-results.xml',
        ].join('\n'),
      },
      smokeStep('unity-editmode-smoke-2023.2.20f1'),
      smokeStep('unity-editmode-smoke-6000.0.58f1'),
      assetStorePackageStep(),
    ],
  };
  const blockers = finalSubmissionEvidenceBlockers(report);

  assert.ok(blockers.includes('final Unity smoke step must include named EditMode result evidence: unity-editmode-smoke-2022.3.74f1'));
  assert.ok(blockers.includes('final Unity smoke step must include named PlayMode result evidence: unity-editmode-smoke-2022.3.74f1'));
});

test('release readiness final evidence rejects package export proof outside canonical output path', () => {
  const offPathEvidence = assetStorePackageEvidence({
    unityPackageOutputPath: '/tmp/stale/com.greybox.studio.unitypackage',
  });
  const report = {
    submission: true,
    summary: summarizeResults([{ status: 'pass' }]),
    targetMatrix: readyTargetMatrix(),
    steps: [
      smokeStep('unity-editmode-smoke-2022.3.74f1'),
      smokeStep('unity-editmode-smoke-2023.2.20f1'),
      smokeStep('unity-editmode-smoke-6000.0.58f1'),
      assetStorePackageStep({ evidence: offPathEvidence }),
    ],
  };

  assert.deepEqual(finalSubmissionEvidenceBlockers(report), [
    'final Asset Store .unitypackage export step must include output path, byte, and SHA-256 evidence',
  ]);
});

test('release readiness final evidence rejects package export commands without pinned output argv', () => {
  const unpinned = assetStorePackageStep();
  unpinned.commandArgv = unpinned.commandArgv.filter((part, index, argv) => (
    part !== '--output'
    && argv[index - 1] !== '--output'
  ));
  const spoofed = assetStorePackageStep();
  spoofed.commandArgv = assetStorePackageCommandArgv({ output: 'dist/com.greybox.studio.unitypackage.fake' });

  for (const packageStep of [unpinned, spoofed]) {
    const report = {
      submission: true,
      summary: summarizeResults([{ status: 'pass' }]),
      targetMatrix: readyTargetMatrix(),
      steps: [
        smokeStep('unity-editmode-smoke-2022.3.74f1'),
        smokeStep('unity-editmode-smoke-2023.2.20f1'),
        smokeStep('unity-editmode-smoke-6000.0.58f1'),
        packageStep,
      ],
    };

    assert.deepEqual(finalSubmissionEvidenceBlockers(report), [
      'final Asset Store .unitypackage export step must include output path, byte, and SHA-256 evidence',
    ]);
  }
});

test('release readiness markdown summarizes status without leaking logs', () => {
  const markdown = formatMarkdownReport({
    generatedAt: '2026-05-17T00:00:00.000Z',
    unityVersion: '2022.3.74f1',
    summary: { status: 'blocked' },
    targetMatrix: [
      {
        stream: '2022.3 LTS',
        version: '2022.3.74f1',
        status: 'ready',
        editor: '/Applications/Unity/Hub/Editor/2022.3.74f1/Unity.app/Contents/MacOS/Unity',
      },
      {
        stream: '2023.2',
        version: '2023.2.20f1',
        status: 'missing-editor',
        editor: '',
      },
      {
        stream: 'Unity 6',
        version: '6000.0.58f1',
        status: 'missing-editor',
        editor: '',
      },
    ],
    steps: [
      { label: 'Static gate', status: 'pass', command: "'node' Validation~/asset-store-metadata-check.mjs" },
      { label: 'Unity smoke', status: 'blocked', reason: 'Unity Editor was not found.' },
    ],
  });

  assert.match(markdown, /Greybox Unity Release Readiness/u);
  assert.match(markdown, /\| 2022\.3 LTS \| 2022\.3\.74f1 \| ready \|/u);
  assert.match(markdown, /\| Unity 6 \| 6000\.0\.58f1 \| missing-editor \| - \|/u);
  assert.match(markdown, /\| Unity smoke \| blocked \| Unity Editor was not found\. \|/u);
  assert.doesNotMatch(markdown, /stdout|stderr/u);
});

function readyTargetMatrix() {
  return [
    {
      stream: '2022.3 LTS',
      version: '2022.3.74f1',
      status: 'ready',
      editor: '/Applications/Unity/Hub/Editor/2022.3.74f1/Unity.app/Contents/MacOS/Unity',
    },
    {
      stream: '2023.2',
      version: '2023.2.20f1',
      status: 'ready',
      editor: '/Applications/Unity/Hub/Editor/2023.2.20f1/Unity.app/Contents/MacOS/Unity',
    },
    {
      stream: 'Unity 6',
      version: '6000.0.58f1',
      status: 'ready',
      editor: '/Applications/Unity/Hub/Editor/6000.0.58f1/Unity.app/Contents/MacOS/Unity',
    },
  ];
}

function smokeStep(id) {
  const version = id.replace('unity-editmode-smoke-', '');
  return {
    id,
    status: 'pass',
    unityVersion: version,
    unityStream: unityStreamForVersion(version),
    command: smokeCommand(version),
    commandArgv: smokeCommandArgv(version),
    evidence: {
      editModeSmokePassed: true,
      editModeRequiredResultsPassed: true,
      editModeRequiredResults: [
        'EditorVersionMatchesReleaseTarget',
        'PackageMetadataAndAssembliesLoad',
        'EnginePackagePreflightFailsClosedWhenPackageMetadataIsMissingOrUnsafe',
        'LiveSyncPackageHandoffRequiresPreflightAndChecksumManifest',
        'ConflictInboxInjectsRepresentativeRoundTripSmokeConflict',
        'ConflictResolverCoversWebUnityManualAndBatchUnderThirtySeconds',
        'ConflictWindowActionsPostRefreshAndClearInboxUnderThirtySeconds',
        'PrefabSidecarResolutionPreservesCanonicalChoiceUnderThirtySeconds',
        'McpToolDefinitionsAreProtocolShapedJson',
        'McpBridgeHandlesProtocolAndHierarchySmoke',
        'McpBridgeCreatesAndEditsRoundTripObjects',
        'HudBuilderSupportsUiToolkitRenderer',
        'PackagedSamplesImportIntoProjectAssetsUnderThirtySeconds',
        'RequiredSamplesDocumentationAndLegalFilesArePresent',
      ],
      editModePackageTestAssembliesPassed: true,
      editModePackageTestAssemblies: ['Greybox.Editor.Tests'],
      editModeResultXmlPath: smokeResultXmlPath(version, 'editmode-results.xml'),
      editModeResultXmlBytes: 4096,
      editModeResultXmlSha256: 'a'.repeat(64),
      editModeResultXmlValidated: true,
      playModeSmokePassed: true,
      playModeRequiredResultsPassed: true,
      playModeRequiredResults: ['GeneratedPlatformerSceneRunsGameplayLoop', 'InputFallbackCompositionWorks'],
      playModePackageTestAssembliesPassed: true,
      playModePackageTestAssemblies: ['Greybox.Runtime.Tests'],
      playModeResultXmlPath: smokeResultXmlPath(version, 'playmode-results.xml'),
      playModeResultXmlBytes: 2048,
      playModeResultXmlSha256: 'b'.repeat(64),
      playModeResultXmlValidated: true,
    },
  };
}

function smokeCommand(version) {
  return `node Validation~/unity-import-smoke.mjs --unity /Applications/Unity/Hub/Editor/${version}/Unity.app/Contents/MacOS/Unity --unity-version ${version}`;
}

function smokeCommandArgv(version) {
  return [
    'node',
    'Validation~/unity-import-smoke.mjs',
    '--unity',
    `/Applications/Unity/Hub/Editor/${version}/Unity.app/Contents/MacOS/Unity`,
    '--unity-version',
    version,
    '--results-file',
    join('Validation~/artifacts', `unity-smoke-${version}`, 'editmode-results.xml'),
    '--playmode-results-file',
    join('Validation~/artifacts', `unity-smoke-${version}`, 'playmode-results.xml'),
  ];
}

function unityStreamForVersion(version) {
  if (version === '2022.3.74f1') return '2022.3 LTS';
  if (version === '2023.2.20f1') return '2023.2';
  if (version === '6000.0.58f1') return 'Unity 6';
  return '';
}

function assetStorePackageStep({ evidence = assetStorePackageEvidence(), commandArgv = assetStorePackageCommandArgv() } = {}) {
  return {
    id: 'asset-store-unitypackage-export',
    status: 'pass',
    command: commandArgv.join(' '),
    commandArgv,
    evidence,
  };
}

function assetStorePackageCommandArgv({ output = 'dist/com.greybox.studio.unitypackage' } = {}) {
  return [
    'node',
    'Validation~/unity-package-export.mjs',
    '--unity',
    '/Applications/Unity/Hub/Editor/2022.3.74f1/Unity.app/Contents/MacOS/Unity',
    '--unity-version',
    '2022.3.74f1',
    '--project-path',
    '.tmp/asset-store-export',
    '--output',
    output,
    '--manifest',
    'Validation~/artifacts/unitypackage-export.json',
  ];
}

function assetStorePackageEvidence(overrides = {}) {
  return {
    unityPackageExportPassed: true,
    unityPackageOutputPath: '/tmp/dist/com.greybox.studio.unitypackage',
    unityPackageBytes: 123456,
    unityPackageSha256: 'c'.repeat(64),
    ...overrides,
  };
}

function smokeResultXmlPath(version, fileName) {
  return join('/tmp/greybox-unity-plugin', 'Validation~/artifacts', `unity-smoke-${version}`, fileName);
}

function resultXml(label) {
  const suite = requiredPackageTestAssemblies(label)
    .map((name) => `<test-suite type="Assembly" name="${name}.dll" result="Passed" />`)
    .join('');
  const cases = requiredSmokeResultTests(label)
    .map((name) => `<test-case name="${name}" result="Passed" />`)
    .join('');
  return `<test-run failed="0" errors="0">${suite}${cases}</test-run>`;
}
