import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyExitCode,
  createCloudMetrics,
  createGodotTargetMatrix,
  createReleaseSteps,
  formatMarkdownReport,
  parseReleaseArgs,
  summarizeResults,
} from './release-readiness.mjs';

test('release readiness args capture editor requirements', () => {
  assert.deepEqual(parseReleaseArgs([
    '--require-editor',
    '--godot',
    '/Applications/Godot_4.4.app/Contents/MacOS/Godot',
    '--output',
    'validation/artifacts/release-readiness.json',
  ]), {
    godot: '/Applications/Godot_4.4.app/Contents/MacOS/Godot',
    output: 'validation/artifacts/release-readiness.json',
    requireEditor: true,
  });
});

test('release readiness plans static validation gate', () => {
  assert.deepEqual(createReleaseSteps({ nodePath: '/usr/local/bin/node' }), [
    {
      id: 'static-addon-validation',
      label: 'Static Godot addon validation',
      command: ['/usr/local/bin/node', 'validation/validate-godot-plugin.mjs'],
    },
  ]);
});

test('release readiness reports target editor matrix', () => {
  const matrix = createGodotTargetMatrix({
    discoveredEditors: [
      '/Applications/Godot_4.2.app/Contents/MacOS/Godot',
      '/Applications/Godot_4.4.app/Contents/MacOS/Godot',
    ],
  });

  assert.deepEqual(matrix.map((target) => `${target.stream}:${target.status}`), [
    'Godot 4.2:ready',
    'Godot 4.3:missing-editor',
    'Godot 4.4:ready',
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
  const targetMatrix = createGodotTargetMatrix({
    discoveredEditors: ['/Applications/Godot_4.4.app/Contents/MacOS/Godot'],
  });
  const summary = summarizeResults([
    {
      id: 'static-addon-validation',
      status: 'pass',
    },
  ], targetMatrix);

  assert.equal(summary.sourceReady, true);
  assert.deepEqual(createCloudMetrics(summary, targetMatrix), {
    godotSourceReady: true,
    godotAddonStaticValidation: true,
    godotEditorSmokeVersions: ['4.4'],
  });
});

test('release readiness markdown is reviewer-readable', () => {
  const markdown = formatMarkdownReport({
    generatedAt: '2026-05-18T00:00:00.000Z',
    summary: { status: 'pass', sourceReady: true },
    cloudMetrics: { godotSourceReady: true },
    targetMatrix: [
      {
        stream: 'Godot 4.4',
        version: '4.4',
        status: 'missing-editor',
        editor: '',
      },
    ],
    steps: [
      {
        label: 'Static Godot addon validation',
        status: 'pass',
        command: "'node' 'validation/validate-godot-plugin.mjs'",
      },
    ],
  });

  assert.match(markdown, /Greybox Godot Release Readiness/u);
  assert.match(markdown, /Source proof: ready/u);
  assert.match(markdown, /Cloud metric: godotSourceReady=true/u);
  assert.match(markdown, /\| Godot 4\.4 \| 4\.4 \| missing-editor \| - \|/u);
  assert.match(markdown, /\| Static Godot addon validation \| pass \|/u);
  assert.doesNotMatch(markdown, /stdout|stderr/u);
});
