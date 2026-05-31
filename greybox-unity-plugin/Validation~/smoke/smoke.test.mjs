// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { parseSmokeArgs, runSmoke } from './smoke.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(HERE, 'fixtures');
const EXPECTED_MANIFEST_PATH = join(HERE, 'expected-manifest.json');

test('parseSmokeArgs defaults to dry-run when no daemon is given', () => {
  const options = parseSmokeArgs([]);
  assert.equal(options.dryRun, true);
  assert.equal(options.daemon, '');
  assert.equal(options.fixtures, FIXTURE_DIR);
});

test('parseSmokeArgs captures explicit daemon, output, and timeout', () => {
  const options = parseSmokeArgs([
    '--daemon', 'http://127.0.0.1:5174',
    '--output', '/tmp/smoke.json',
    '--timeout-ms', '500',
    '--token', 'gbx_test',
  ]);
  assert.equal(options.daemon, 'http://127.0.0.1:5174');
  assert.equal(options.dryRun, false);
  assert.equal(options.output, '/tmp/smoke.json');
  assert.equal(options.timeoutMs, 500);
  assert.equal(options.token, 'gbx_test');
});

test('parseSmokeArgs rejects unknown flags', () => {
  assert.throws(() => parseSmokeArgs(['--nope']), /Unknown argument: --nope/);
});

test('fixtures directory contains all four artifact fixtures', () => {
  const required = [
    'sample-platformer.gameview.json',
    'sample-platformer.design.md',
    'sample-platformer.gbhud.html',
    'sample-platformer.levelboard.json',
  ];
  for (const name of required) {
    assert.ok(existsSync(join(FIXTURE_DIR, name)), `missing fixture ${name}`);
  }
});

test('expected manifest defines every Unity-side artifact category', () => {
  const expected = JSON.parse(readFileSync(EXPECTED_MANIFEST_PATH, 'utf8'));
  const kinds = new Set(expected.entries.map((entry) => entry.kind));
  for (const kind of ['manifest', 'gameview', 'design', 'hud', 'levelboard', 'prefab', 'material', 'palette-scriptable', 'hud-prefab']) {
    assert.ok(kinds.has(kind), `expected manifest missing kind: ${kind}`);
  }
  assert.equal(expected.packageName, 'com.greybox.studio');
  assert.equal(expected.fixtureName, 'sample-platformer');
});

test('dry-run smoke run passes against the in-process mock daemon', async () => {
  const report = await runSmoke(parseSmokeArgs(['--dry-run']));
  assert.equal(report.status, 'pass', JSON.stringify(report.errors));
  assert.equal(report.mode, 'dry-run');
  const ids = report.steps.map((step) => step.id);
  assert.ok(ids.includes('start-mock-daemon'));
  assert.ok(ids.includes('verify-daemon-reachable'));
  assert.ok(ids.includes('submit-fixture'));
  assert.ok(ids.includes('poll-engine-package'));
  assert.ok(ids.includes('download-zip'));
  assert.ok(ids.includes('extract-zip'));
  assert.ok(ids.includes('validate-expected-manifest'));
  for (const step of report.steps) assert.equal(step.status, 'pass', `${step.id} failed: ${step.detail}`);
});

test('dry-run smoke run rejects expected manifest tampering', async () => {
  const tampered = parseSmokeArgs(['--dry-run']);
  tampered.manifest = join(HERE, '__not-found__.json');
  await assert.rejects(() => runSmoke(tampered), /ENOENT|no such file/i);
});
