// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  formatVerifiedSolutionMarkdown,
  parseVerifiedSolutionArgs,
  validateVerifiedSolutionPacket,
} from './verified-solution-readiness.mjs';
import {
  requiredPackageTestAssemblies,
  requiredSmokeResultTests,
} from './unity-import-smoke.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('Verified Solution args capture application mode and root', () => {
  assert.deepEqual(parseVerifiedSolutionArgs([
    '--application',
    '--skip-release-evidence',
    '--root',
    '/tmp/greybox-unity-plugin',
  ]), {
    application: true,
    root: '/tmp/greybox-unity-plugin',
    skipReleaseEvidence: true,
  });
});

test('Verified Solution packet gate passes the real alpha packet with explicit blockers', () => {
  const report = validateVerifiedSolutionPacket(root);

  assert.equal(report.status, 'pass');
  assert.equal(report.errors.length, 0);
  assert.ok(report.warnings.some((warning) => /intentionally blocked/u.test(warning)));
  assert.ok(report.requiredCustomerEvidence.includes('100+ paying Unity plugin customers'));
  assert.ok(report.requiredTechnicalEvidence.includes('Validation~/artifacts/mcp-conformance.md'));
  assert.doesNotMatch(JSON.stringify(report), /API_KEY|SECRET|UNITY_PASSWORD|gbx_pro_/u);
});

test('Verified Solution application mode blocks prerelease package and not-ready packet', () => {
  const temp = mkdtempSync(join(tmpdir(), 'greybox-unity-verified-prerelease-'));
  writeFileSync(
    join(temp, 'package.json'),
    readFileSync(join(root, 'package.json'), 'utf8').replace('"version": "1.0.0"', '"version": "1.0.0-rc.1"'),
  );
  writeFileSync(
    join(temp, 'UNITY_VERIFIED_SOLUTION.md'),
    readFileSync(join(root, 'UNITY_VERIFIED_SOLUTION.md'), 'utf8'),
  );
  mkdirSync(join(temp, 'Documentation~/asset-store'), { recursive: true });

  const report = validateVerifiedSolutionPacket(temp, { application: true, skipReleaseEvidence: true });

  assert.equal(report.status, 'fail');
  assert.ok(report.errors.includes('application mode requires package.json to use a stable version'));
  assert.ok(report.errors.includes('application mode requires UNITY_VERIFIED_SOLUTION.md to say "Ready to apply: yes"'));
});

test('Verified Solution application mode can skip release artifacts only for release-readiness planning', () => {
  const temp = mkdtempSync(join(tmpdir(), 'greybox-unity-verified-skip-'));
  writeFileSync(join(temp, 'package.json'), JSON.stringify({
    name: 'com.greybox.studio',
    version: '1.0.0',
  }));
  writeFileSync(join(temp, 'UNITY_VERIFIED_SOLUTION.md'), readyVerifiedSolutionPacket());

  const skipped = validateVerifiedSolutionPacket(temp, {
    application: true,
    skipReleaseEvidence: true,
  });
  const direct = validateVerifiedSolutionPacket(temp, { application: true });

  assert.equal(skipped.status, 'pass');
  assert.equal(direct.status, 'fail');
  assert.ok(direct.errors.some((error) => error.includes('Asset Store submission gate must pass before Verified Solution application')));
  assert.ok(direct.errors.includes('application mode requires stable release candidate artifact: Validation~/artifacts/stable-release-candidate.json'));
});

test('Verified Solution application mode requires final Unity evidence and stable source proof', () => {
  const temp = mkdtempSync(join(tmpdir(), 'greybox-unity-verified-evidence-'));
  const artifacts = join(temp, 'Validation~', 'artifacts');
  const now = new Date('2026-05-22T00:00:00.000Z');
  mkdirSync(artifacts, { recursive: true });
  writeFileSync(join(temp, 'package.json'), JSON.stringify({
    name: 'com.greybox.studio',
    version: '1.0.0',
  }));
  writeFileSync(join(temp, 'UNITY_VERIFIED_SOLUTION.md'), readyVerifiedSolutionPacket());
  writeFileSync(join(temp, 'ASSET_STORE_SUBMISSION.md'), readyAssetStoreSubmissionPacket());
  writeVisuals(temp);

  writeFileSync(join(artifacts, 'release-readiness.json'), JSON.stringify({
    generatedAt: now.toISOString(),
    submission: false,
    summary: { status: 'pass' },
    targetMatrix: [],
    steps: [],
  }));
  writeFileSync(join(artifacts, 'stable-release-candidate.json'), JSON.stringify({
    generatedAt: now.toISOString(),
    status: 'blocked',
    package: { stableVersionReady: true },
    submissionPacket: { status: 'pass' },
    releaseReadiness: { status: 'pass' },
    unityPackageExport: { status: 'pass' },
    sourceProof: { status: 'blocked', sourceAdoptionReady: false },
  }));

  const blocked = validateVerifiedSolutionPacket(temp, { application: true, now });
  assert.equal(blocked.status, 'fail');
  assert.ok(blocked.errors.includes('Asset Store submission gate: release readiness artifact must be generated with --submission'));
  assert.ok(blocked.errors.includes('Asset Store submission gate: release readiness artifact requires passing final Unity step: unity-editmode-smoke-2022.3.74f1'));
  assert.ok(blocked.errors.includes('Asset Store submission gate: release readiness artifact requires ready Unity target: Unity 6 6000.0.58f1'));
  assert.ok(blocked.errors.includes('stable release candidate artifact must pass before Verified Solution application, got blocked'));
  assert.ok(blocked.errors.includes('stable release candidate artifact must prove Unity adoption source proof is ready before Verified Solution application'));

  writeFileSync(join(artifacts, 'release-readiness.json'), JSON.stringify(validReleaseReadiness(now)));
  writeFileSync(join(artifacts, 'stable-release-candidate.json'), JSON.stringify(validStableReleaseCandidate(now)));
  const pass = validateVerifiedSolutionPacket(temp, { application: true, now });
  assert.equal(pass.status, 'pass');

  const stale = validStableReleaseCandidate(new Date('2026-05-01T00:00:00.000Z'));
  writeFileSync(join(artifacts, 'stable-release-candidate.json'), JSON.stringify(stale));
  const staleReport = validateVerifiedSolutionPacket(temp, { application: true, now });
  assert.equal(staleReport.status, 'fail');
  assert.ok(staleReport.errors.includes('stable release candidate artifact generatedAt must be no older than 14 days'));
});

test('Verified Solution markdown is partner-readable and sanitized', () => {
  const markdown = formatVerifiedSolutionMarkdown(validateVerifiedSolutionPacket(root));

  assert.match(markdown, /# Greybox Unity Verified Solution Gate/u);
  assert.match(markdown, /Status: pass/u);
  assert.match(markdown, /100\+ active round-trip sync customers/u);
  assert.match(markdown, /2-second p95/u);
  assert.doesNotMatch(markdown, /stdout|stderr|UNITY_PASSWORD|OPENAI_API_KEY/u);
});

test('Verified Solution packet gate catches missing partner evidence and secrets', () => {
  const temp = mkdtempSync(join(tmpdir(), 'greybox-unity-verified-'));
  writeFileSync(join(temp, 'package.json'), JSON.stringify({
    name: 'com.bad.package',
    version: '1.0',
  }));
  writeFileSync(join(temp, 'UNITY_VERIFIED_SOLUTION.md'), [
    '# Bad packet',
    '',
    'Ready to apply: yes',
    'AI-generated Unity integration.',
    'OPENAI_API_KEY=sk-test_abcdefghijklmnopqrstuvwxyz',
  ].join('\n'));

  const report = validateVerifiedSolutionPacket(temp, { application: true });

  assert.equal(report.status, 'fail');
  assert.ok(report.errors.some((error) => error.includes('package.json name')));
  assert.ok(report.errors.some((error) => error.includes('package.json version')));
  assert.ok(report.errors.some((error) => error.includes('Program: Unity Verified Solutions Program')));
  assert.ok(report.errors.some((error) => error.includes('100+ paying Unity plugin customers')));
  assert.ok(report.errors.some((error) => error.includes('2-second p95')));
  assert.ok(report.errors.some((error) => error.includes('AI-assisted, not unqualified AI-generated')));
  assert.ok(report.errors.some((error) => error.includes('appears to contain a secret')));
});

function readyVerifiedSolutionPacket() {
  return readFileSync(join(root, 'UNITY_VERIFIED_SOLUTION.md'), 'utf8')
    .replace('Ready to apply: no', 'Ready to apply: yes');
}

function readyAssetStoreSubmissionPacket() {
  return readFileSync(join(root, 'ASSET_STORE_SUBMISSION.md'), 'utf8')
    .replace('Ready to submit: no', 'Ready to submit: yes');
}

function validReleaseReadiness(now) {
  return {
    generatedAt: now.toISOString(),
    submission: true,
    summary: { status: 'pass' },
    targetMatrix: [
      targetRow('2022.3 LTS', '2022.3.74f1'),
      targetRow('2023.2', '2023.2.20f1'),
      targetRow('Unity 6', '6000.0.58f1'),
    ],
    steps: [
      smokeStep('2022.3 LTS', '2022.3.74f1'),
      smokeStep('2023.2', '2023.2.20f1'),
      smokeStep('Unity 6', '6000.0.58f1'),
      {
        id: 'asset-store-unitypackage-export',
        status: 'pass',
        command: 'node Validation~/unity-package-export.mjs --unity /Applications/Unity/Hub/Editor/2022.3.74f1/Unity.app/Contents/MacOS/Unity',
        evidence: {
          unityPackageExportPassed: true,
          unityPackageOutputPath: '/tmp/dist/com.greybox.studio.unitypackage',
          unityPackageBytes: 123456,
          unityPackageSha256: 'c'.repeat(64),
        },
      },
    ],
  };
}

function validStableReleaseCandidate(now) {
  return {
    generatedAt: now.toISOString(),
    status: 'pass',
    package: { stableVersionReady: true },
    submissionPacket: { status: 'pass' },
    releaseReadiness: { status: 'pass' },
    unityPackageExport: { status: 'pass' },
    sourceProof: { status: 'pass', sourceAdoptionReady: true },
  };
}

function targetRow(stream, version) {
  return {
    stream,
    version,
    status: 'ready',
    editor: `/Applications/Unity/Hub/Editor/${version}/Unity.app/Contents/MacOS/Unity`,
  };
}

function smokeStep(stream, version) {
  return {
    id: `unity-editmode-smoke-${version}`,
    status: 'pass',
    unityStream: stream,
    unityVersion: version,
    command: `node Validation~/unity-import-smoke.mjs --unity /Applications/Unity/Hub/Editor/${version}/Unity.app/Contents/MacOS/Unity --unity-version ${version}`,
    commandArgv: [
      'node',
      'Validation~/unity-import-smoke.mjs',
      '--unity',
      `/Applications/Unity/Hub/Editor/${version}/Unity.app/Contents/MacOS/Unity`,
      '--unity-version',
      version,
    ],
    evidence: {
      editModeSmokePassed: true,
      editModeRequiredResultsPassed: true,
      editModeRequiredResults: requiredSmokeResultTests('Unity EditMode import smoke'),
      editModePackageTestAssembliesPassed: true,
      editModePackageTestAssemblies: requiredPackageTestAssemblies('Unity EditMode import smoke'),
      editModeResultXmlPath: `/tmp/${version}/editmode-results.xml`,
      editModeResultXmlBytes: 4096,
      editModeResultXmlSha256: 'a'.repeat(64),
      editModeResultXmlValidated: true,
      playModeSmokePassed: true,
      playModeRequiredResultsPassed: true,
      playModeRequiredResults: requiredSmokeResultTests('Unity PlayMode gameplay smoke'),
      playModePackageTestAssembliesPassed: true,
      playModePackageTestAssemblies: requiredPackageTestAssemblies('Unity PlayMode gameplay smoke'),
      playModeResultXmlPath: `/tmp/${version}/playmode-results.xml`,
      playModeResultXmlBytes: 2048,
      playModeResultXmlSha256: 'b'.repeat(64),
      playModeResultXmlValidated: true,
    },
  };
}

function writeVisuals(rootDir) {
  const assets = [
    ['Documentation~/asset-store/icon-1600.png', 1600, 1600],
    ['Documentation~/asset-store/cover-1950x1300.png', 1950, 1300],
    ['Documentation~/asset-store/screenshot-importers.png', 1600, 900],
    ['Documentation~/asset-store/screenshot-round-trip.png', 1600, 900],
    ['Documentation~/asset-store/screenshot-mcp-bridge.png', 1600, 900],
    ['Documentation~/asset-store/screenshot-samples.png', 1600, 900],
  ];
  for (const [asset, width, height] of assets) {
    const output = join(rootDir, asset);
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, minimalPng(width, height));
  }
}

function minimalPng(width, height) {
  const buffer = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(buffer, 0);
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}
