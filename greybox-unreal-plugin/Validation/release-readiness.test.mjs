import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyExitCode,
  createCloudMetrics,
  createReleaseSteps,
  createUnrealTargetMatrix,
  formatMarkdownReport,
  parseReleaseArgs,
  summarizeResults,
} from './release-readiness.mjs';

test('release readiness args capture editor requirements', () => {
  assert.deepEqual(parseReleaseArgs([
    '--require-editor',
    '--unreal',
    '/Applications/Epic Games/UE_5.5/Engine/Binaries/Mac/UnrealEditor',
    '--output',
    'Validation/artifacts/release-readiness.json',
  ]), {
    output: 'Validation/artifacts/release-readiness.json',
    requireEditor: true,
    unreal: '/Applications/Epic Games/UE_5.5/Engine/Binaries/Mac/UnrealEditor',
  });
});

test('release readiness plans static validation gate', () => {
  assert.deepEqual(createReleaseSteps({ nodePath: '/usr/local/bin/node' }), [
    {
      id: 'static-plugin-validation',
      label: 'Static Unreal plugin validation',
      command: ['/usr/local/bin/node', 'Validation/validate-unreal-plugin.mjs'],
    },
  ]);
});

test('release readiness reports target editor matrix', () => {
  const matrix = createUnrealTargetMatrix({
    discoveredEditors: [
      '/Applications/Epic Games/UE_5.3/Engine/Binaries/Mac/UnrealEditor',
      '/Applications/Epic Games/UE_5.5/Engine/Binaries/Mac/UnrealEditor',
    ],
  });

  assert.deepEqual(matrix.map((target) => `${target.stream}:${target.status}`), [
    'Unreal Engine 5.3:ready',
    'Unreal Engine 5.4:missing-editor',
    'Unreal Engine 5.5:ready',
  ]);
});

test('release readiness exit code only blocks missing editors when required', () => {
  const report = {
    summary: {
      failed: 0,
      missingEditors: 3,
    },
  };
  assert.equal(classifyExitCode(report), 0);
  assert.equal(classifyExitCode(report, { requireEditor: true }), 2);
  assert.equal(classifyExitCode({ summary: { failed: 1, missingEditors: 0 } }, { requireEditor: true }), 1);
});

test('release readiness emits Cloud source-proof metrics', () => {
  const targetMatrix = createUnrealTargetMatrix({
    discoveredEditors: ['/Applications/Epic Games/UE_5.3/Engine/Binaries/Mac/UnrealEditor'],
  });
  const summary = summarizeResults([
    {
      id: 'static-plugin-validation',
      status: 'pass',
    },
  ], targetMatrix);

  assert.equal(summary.sourceReady, true);
  assert.deepEqual(createCloudMetrics(summary, targetMatrix), {
    unrealSourceReady: true,
    unrealPluginStaticValidation: true,
    unrealEditorSmokeVersions: ['5.3'],
  });
});

test('release readiness markdown is reviewer-readable', () => {
  const markdown = formatMarkdownReport({
    generatedAt: '2026-05-18T00:00:00.000Z',
    summary: { status: 'pass', sourceReady: true },
    cloudMetrics: { unrealSourceReady: true },
    targetMatrix: [
      {
        stream: 'Unreal Engine 5.3',
        version: '5.3',
        status: 'missing-editor',
        editor: '',
      },
    ],
    steps: [
      {
        label: 'Static Unreal plugin validation',
        status: 'pass',
        command: "'node' 'Validation/validate-unreal-plugin.mjs'",
      },
    ],
  });

  assert.match(markdown, /Greybox Unreal Release Readiness/u);
  assert.match(markdown, /Source proof: ready/u);
  assert.match(markdown, /Cloud metric: unrealSourceReady=true/u);
  assert.match(markdown, /\| Unreal Engine 5\.3 \| 5\.3 \| missing-editor \| - \|/u);
  assert.match(markdown, /\| Static Unreal plugin validation \| pass \|/u);
  assert.doesNotMatch(markdown, /stdout|stderr/u);
});
