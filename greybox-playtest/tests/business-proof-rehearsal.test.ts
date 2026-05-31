// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  buildPlaytestBusinessProofRehearsal,
  playtestBusinessProofRehearsalMarkdown,
} from '../src/index.js';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

test('business proof rehearsal exports Cloud-safe playtest evidence', () => {
  const report = buildPlaytestBusinessProofRehearsal({
    generatedAt: Date.UTC(2026, 4, 18, 7),
  });

  assert.equal(report.ready, true);
  assert.equal(report.proof.playtest.sourceBusinessModelReady, true);
  assert.equal(report.proof.playtest.activePayingStudios, 100);
  assert.equal(report.source.adoption.reports, 350);
  assert.ok(report.proof.playtest.completedRuns >= 2_000);
  assert.ok(report.proof.playtest.qaSavingsUsd >= 500_000);
  assert.equal(report.source.adoption.ready, true);
  assert.equal(report.source.qaSavings.ready, true);
  assert.equal(report.source.regression.ready, true);
  assert.equal(report.source.personas.ready, true);
  assert.deepEqual(JSON.parse(report.cloudHandoff.value), report.proof);

  const serialized = JSON.stringify(report);
  assert.doesNotMatch(serialized, /studio_paid_0|qa-director@example\.com|human\.playtester@example\.com/u);
  assert.doesNotMatch(serialized, /<html|seededBugs|greybox:playtest:event|imageSha256|data:image|playableHtml/u);
  assert.match(playtestBusinessProofRehearsalMarkdown(report), /Ready: yes/u);
});

test('business proof rehearsal zeroes Cloud counters when adoption is weak', () => {
  const report = buildPlaytestBusinessProofRehearsal({
    generatedAt: Date.UTC(2026, 4, 18, 7),
    recordCount: 12,
    acceptedSuggestionStudios: 1,
  });

  assert.equal(report.ready, false);
  assert.equal(report.source.adoption.ready, false);
  assert.equal(report.proof.playtest.sourceBusinessModelReady, false);
  assert.deepEqual(report.proof.playtest, {
    activePayingStudios: 0,
    personasInProduction: 0,
    acceptedTuningSuggestions: 0,
    completedRuns: 0,
    qaSavingsUsd: 0,
    sourceBusinessModelReady: false,
  });
  assert.ok(report.source.adoption.shortfalls.some((shortfall) => shortfall.code === 'paying_studio_shortfall'));
  assert.ok(report.warnings.includes('adoption proof is not production-ready'));
});

test('business proof rehearsal rejects partial persona production coverage', () => {
  const report = buildPlaytestBusinessProofRehearsal({
    generatedAt: Date.UTC(2026, 4, 18, 7),
    personasInProduction: 5,
  });

  assert.equal(report.ready, false);
  assert.equal(report.source.personas.ready, false);
  assert.equal(report.proof.source.personaProductionReady, false);
  assert.equal(report.proof.playtest.personasInProduction, 0);
});

test('business proof rehearsal CLI writes sanitized JSON and markdown', async () => {
  const outputDir = await mkdtemp(join(tmpdir(), 'greybox-playtest-proof-'));
  const jsonPath = join(outputDir, 'proof.json');
  const markdownPath = join(outputDir, 'proof.md');
  const result = await execFileResult(process.execPath, [
    '--import',
    'tsx',
    'src/cli/rehearseBusinessProof.ts',
    '--generated-at',
    '2026-05-18T07:00:00.000Z',
    '--output',
    jsonPath,
    '--markdown',
    markdownPath,
  ]);

  assert.equal(result.code, 0);
  assert.match(result.stderr, /ready/u);
  const report = JSON.parse(await readFile(jsonPath, 'utf8')) as ReturnType<typeof buildPlaytestBusinessProofRehearsal>;
  const markdown = await readFile(markdownPath, 'utf8');
  assert.equal(report.ready, true);
  assert.equal(report.cloudHandoff.envVar, 'GREYBOX_BUSINESS_MODEL_PROOF_JSON');
  assert.match(markdown, /Cloud Proof/u);
  assert.doesNotMatch(JSON.stringify(report), /studio_paid_0|qa-director@example\.com/u);
});

test('business proof rehearsal CLI exits nonzero unless weak proof is explicitly allowed', async () => {
  const blocked = await execFileResult(process.execPath, [
    '--import',
    'tsx',
    'src/cli/rehearseBusinessProof.ts',
    '--weak-regression',
  ]);
  assert.equal(blocked.code, 1);
  assert.match(blocked.stderr, /not-ready/u);

  const allowed = await execFileResult(process.execPath, [
    '--import',
    'tsx',
    'src/cli/rehearseBusinessProof.ts',
    '--weak-regression',
    '--allow-not-ready',
  ]);
  assert.equal(allowed.code, 0);
  assert.match(allowed.stdout, /"ready": false/u);
});

function execFileResult(command: string, args: string[]): Promise<{
  code: number;
  stdout: string;
  stderr: string;
}> {
  return new Promise((resolve) => {
    execFile(command, args, { cwd: repoRoot }, (error, stdout, stderr) => {
      const code = typeof (error as { code?: unknown } | null)?.code === 'number'
        ? (error as { code: number }).code
        : 0;
      resolve({ code, stdout, stderr });
    });
  });
}
