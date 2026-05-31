// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  buildUnityAdoptionProofExport,
  parseUnityAdoptionProofArgs,
} from './unity-adoption-proof.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const evidenceHash = 'b'.repeat(64);

test('Unity adoption proof args capture root, source, output, and ready enforcement', () => {
  assert.deepEqual(parseUnityAdoptionProofArgs([
    '--root',
    '/tmp/greybox-unity-plugin',
    '--source',
    '/tmp/source.json',
    '--release-readiness',
    '/tmp/release-readiness.json',
    '--output',
    '/tmp/proof.json',
    '--require-ready',
  ]), {
    output: '/tmp/proof.json',
    requireReady: true,
    releaseReadiness: '/tmp/release-readiness.json',
    root: '/tmp/greybox-unity-plugin',
    source: '/tmp/source.json',
  });
});

test('Unity adoption proof exporter stays blocked for the real alpha packet without source evidence', () => {
  const proof = buildUnityAdoptionProofExport({
    now: new Date('2026-05-18T00:00:00.000Z'),
    root,
  });

  assert.equal(proof.sourceAdoptionReady, false);
  assert.equal(proof.source.applicationPacketReady, false);
  assert.equal(proof.source.releaseReadinessReady, false);
  assert.ok(proof.source.missingEvidenceTypes.includes('asset-store-sales-export'));
  assert.ok(proof.source.blockers.some((blocker) => /release readiness step not pass|Unity target not ready/u.test(blocker)));
  assert.doesNotMatch(JSON.stringify(proof), /gbx_|API_KEY|SECRET|UNITY_PASSWORD/u);
});

test('Unity adoption proof exporter emits Cloud-compatible source-ready metrics from sanitized evidence', () => {
  const temp = createReadyUnityAdoptionFixture();
  const proof = buildUnityAdoptionProofExport({
    now: new Date('2026-05-18T00:00:00.000Z'),
    root: temp.root,
    sourcePath: temp.sourcePath,
  });

  assert.equal(proof.sourceAdoptionReady, true);
  assert.equal(proof.assetStoreLive, true);
  assert.equal(proof.payingCustomers, 1_250);
  assert.deepEqual(proof.realEditorSmokeVersions, ['2022.3', '2023.2', '6000.0']);
  assert.equal(proof.source.applicationPacketReady, true);
  assert.equal(proof.source.releaseReadinessReady, true);
  assert.equal(proof.source.releaseReadinessStatus, 'pass');
  assert.deepEqual(proof.source.missingEvidenceTypes, []);
  assert.deepEqual(proof.source.evidenceTypes, [
    'asset-store-sales-export',
    'cloud-license-registry',
    'mcp-usage-export',
    'real-unity-smoke-matrix',
    'round-trip-usage-export',
    'support-sla-report',
  ]);
  assert.doesNotMatch(JSON.stringify(proof), /customer@example\.com|gbx_|sk-test/u);
});

test('Unity adoption proof exporter rejects stale release readiness evidence', () => {
  const temp = createReadyUnityAdoptionFixture({
    releaseReadinessOverrides: {
      generatedAt: '2026-04-01T00:00:00.000Z',
    },
  });
  const proof = buildUnityAdoptionProofExport({
    now: new Date('2026-05-18T00:00:00.000Z'),
    root: temp.root,
    sourcePath: temp.sourcePath,
    releaseReadinessPath: temp.releaseReadinessPath,
  });

  assert.equal(proof.sourceAdoptionReady, false);
  assert.equal(proof.source.releaseReadinessReady, false);
  assert.ok(proof.source.blockers.includes('release readiness generatedAt is older than 14 days'));
});

test('Unity adoption proof exporter rejects future-dated release readiness evidence', () => {
  const temp = createReadyUnityAdoptionFixture({
    releaseReadinessOverrides: {
      generatedAt: '2026-05-18T00:02:00.000Z',
    },
  });
  const proof = buildUnityAdoptionProofExport({
    now: new Date('2026-05-18T00:00:00.000Z'),
    root: temp.root,
    sourcePath: temp.sourcePath,
    releaseReadinessPath: temp.releaseReadinessPath,
  });

  assert.equal(proof.sourceAdoptionReady, false);
  assert.equal(proof.source.releaseReadinessReady, false);
  assert.ok(proof.source.blockers.includes('release readiness generatedAt is in the future'));
});

test('Unity adoption proof exporter rejects dry-run release readiness evidence', () => {
  const temp = createReadyUnityAdoptionFixture({
    releaseReadinessOverrides: {
      summary: { status: 'pass' },
      targetMatrix: [
        { stream: '2022.3 LTS', version: '2022.3.74f1', status: 'missing-editor', editor: '' },
        { stream: '2023.2', version: '2023.2.20f1', status: 'missing-editor', editor: '' },
        { stream: 'Unity 6', version: '6000.0.58f1', status: 'missing-editor', editor: '' },
      ],
      steps: [
        { id: 'unity-editmode-smoke-2022.3.74f1', status: 'skipped' },
        { id: 'unity-editmode-smoke-2023.2.20f1', status: 'skipped' },
        { id: 'unity-editmode-smoke-6000.0.58f1', status: 'skipped' },
        { id: 'asset-store-unitypackage-export', status: 'skipped' },
      ],
    },
  });
  const proof = buildUnityAdoptionProofExport({
    now: new Date('2026-05-18T00:00:00.000Z'),
    root: temp.root,
    sourcePath: temp.sourcePath,
    releaseReadinessPath: temp.releaseReadinessPath,
  });

  assert.equal(proof.sourceAdoptionReady, false);
  assert.equal(proof.source.releaseReadinessReady, false);
  assert.ok(proof.source.blockers.includes('release readiness step not pass: unity-editmode-smoke-2022.3.74f1'));
  assert.ok(proof.source.blockers.includes('Unity target not ready in release readiness: 6000.0.58f1'));
});

test('Unity adoption proof exporter requires named Unity smoke evidence', () => {
  const temp = createReadyUnityAdoptionFixture({
    releaseReadinessOverrides: {
      steps: [
        { id: 'unity-editmode-smoke-2022.3.74f1', status: 'pass' },
        smokeStep('unity-editmode-smoke-2023.2.20f1'),
        smokeStep('unity-editmode-smoke-6000.0.58f1'),
        { id: 'asset-store-unitypackage-export', status: 'pass' },
      ],
    },
  });
  const proof = buildUnityAdoptionProofExport({
    now: new Date('2026-05-18T00:00:00.000Z'),
    root: temp.root,
    sourcePath: temp.sourcePath,
    releaseReadinessPath: temp.releaseReadinessPath,
  });

  assert.equal(proof.sourceAdoptionReady, false);
  assert.equal(proof.source.releaseReadinessReady, false);
  assert.ok(proof.source.blockers.includes('release readiness step missing named EditMode smoke evidence: unity-editmode-smoke-2022.3.74f1'));
  assert.ok(proof.source.blockers.includes('release readiness step missing EditMode package test assembly evidence: unity-editmode-smoke-2022.3.74f1'));
  assert.ok(proof.source.blockers.includes('release readiness step missing validated EditMode result XML evidence: unity-editmode-smoke-2022.3.74f1'));
  assert.ok(proof.source.blockers.includes('release readiness step missing named PlayMode smoke evidence: unity-editmode-smoke-2022.3.74f1'));
  assert.ok(proof.source.blockers.includes('release readiness step missing PlayMode package test assembly evidence: unity-editmode-smoke-2022.3.74f1'));
  assert.ok(proof.source.blockers.includes('release readiness step missing validated PlayMode result XML evidence: unity-editmode-smoke-2022.3.74f1'));
});

test('Unity adoption proof exporter requires package assembly and result XML evidence', () => {
  const incomplete = smokeStep('unity-editmode-smoke-2022.3.74f1');
  delete incomplete.evidence.editModePackageTestAssembliesPassed;
  delete incomplete.evidence.editModePackageTestAssemblies;
  delete incomplete.evidence.editModeResultXmlPath;
  delete incomplete.evidence.editModeResultXmlBytes;
  delete incomplete.evidence.editModeResultXmlSha256;
  delete incomplete.evidence.playModePackageTestAssembliesPassed;
  delete incomplete.evidence.playModePackageTestAssemblies;
  delete incomplete.evidence.playModeResultXmlPath;
  delete incomplete.evidence.playModeResultXmlBytes;
  delete incomplete.evidence.playModeResultXmlSha256;
  const temp = createReadyUnityAdoptionFixture({
    releaseReadinessOverrides: {
      steps: [
        incomplete,
        smokeStep('unity-editmode-smoke-2023.2.20f1'),
        smokeStep('unity-editmode-smoke-6000.0.58f1'),
        assetStorePackageStep(),
      ],
    },
  });
  const proof = buildUnityAdoptionProofExport({
    now: new Date('2026-05-18T00:00:00.000Z'),
    root: temp.root,
    sourcePath: temp.sourcePath,
    releaseReadinessPath: temp.releaseReadinessPath,
  });

  assert.equal(proof.sourceAdoptionReady, false);
  assert.equal(proof.source.releaseReadinessReady, false);
  assert.ok(proof.source.blockers.includes('release readiness step missing EditMode package test assembly evidence: unity-editmode-smoke-2022.3.74f1'));
  assert.ok(proof.source.blockers.includes('release readiness step missing validated EditMode result XML evidence: unity-editmode-smoke-2022.3.74f1'));
  assert.ok(proof.source.blockers.includes('release readiness step missing PlayMode package test assembly evidence: unity-editmode-smoke-2022.3.74f1'));
  assert.ok(proof.source.blockers.includes('release readiness step missing validated PlayMode result XML evidence: unity-editmode-smoke-2022.3.74f1'));
});

test('Unity adoption proof exporter requires package export output path, byte, and hash evidence', () => {
  const temp = createReadyUnityAdoptionFixture({
    releaseReadinessOverrides: {
      steps: [
        smokeStep('unity-editmode-smoke-2022.3.74f1'),
        smokeStep('unity-editmode-smoke-2023.2.20f1'),
        smokeStep('unity-editmode-smoke-6000.0.58f1'),
        { id: 'asset-store-unitypackage-export', status: 'pass' },
      ],
    },
  });
  const proof = buildUnityAdoptionProofExport({
    now: new Date('2026-05-18T00:00:00.000Z'),
    root: temp.root,
    sourcePath: temp.sourcePath,
    releaseReadinessPath: temp.releaseReadinessPath,
  });

  assert.equal(proof.sourceAdoptionReady, false);
  assert.equal(proof.source.releaseReadinessReady, false);
  assert.ok(proof.source.blockers.includes('release readiness step missing .unitypackage output path, byte, and SHA-256 evidence: asset-store-unitypackage-export'));
});

test('Unity adoption proof exporter rejects package export proof outside the canonical output path', () => {
  const temp = createReadyUnityAdoptionFixture({
    releaseReadinessOverrides: {
      steps: [
        smokeStep('unity-editmode-smoke-2022.3.74f1'),
        smokeStep('unity-editmode-smoke-2023.2.20f1'),
        smokeStep('unity-editmode-smoke-6000.0.58f1'),
        assetStorePackageStep({
          evidence: assetStorePackageEvidence({
            unityPackageOutputPath: '/tmp/stale/com.greybox.studio.unitypackage',
          }),
        }),
      ],
    },
  });
  const proof = buildUnityAdoptionProofExport({
    now: new Date('2026-05-18T00:00:00.000Z'),
    root: temp.root,
    sourcePath: temp.sourcePath,
    releaseReadinessPath: temp.releaseReadinessPath,
  });

  assert.equal(proof.sourceAdoptionReady, false);
  assert.equal(proof.source.releaseReadinessReady, false);
  assert.ok(proof.source.blockers.includes('release readiness step missing .unitypackage output path, byte, and SHA-256 evidence: asset-store-unitypackage-export'));
});

test('Unity adoption proof exporter rejects package export proof without pinned output argv', () => {
  for (const packageStep of [
    assetStorePackageStep({
      commandArgv: assetStorePackageCommandArgv().filter((part, index, argv) => (
        part !== '--output'
        && argv[index - 1] !== '--output'
      )),
    }),
    assetStorePackageStep({
      commandArgv: assetStorePackageCommandArgv({ output: 'dist/com.greybox.studio.unitypackage.fake' }),
    }),
  ]) {
    const temp = createReadyUnityAdoptionFixture({
      releaseReadinessOverrides: {
        steps: [
          smokeStep('unity-editmode-smoke-2022.3.74f1'),
          smokeStep('unity-editmode-smoke-2023.2.20f1'),
          smokeStep('unity-editmode-smoke-6000.0.58f1'),
          packageStep,
        ],
      },
    });
    const proof = buildUnityAdoptionProofExport({
      now: new Date('2026-05-18T00:00:00.000Z'),
      root: temp.root,
      sourcePath: temp.sourcePath,
      releaseReadinessPath: temp.releaseReadinessPath,
    });

    assert.equal(proof.sourceAdoptionReady, false);
    assert.equal(proof.source.releaseReadinessReady, false);
    assert.ok(proof.source.blockers.includes('release readiness step missing .unitypackage output path, byte, and SHA-256 evidence: asset-store-unitypackage-export'));
  }
});

test('Unity adoption proof exporter requires target-pinned Unity smoke command evidence', () => {
  const unpinned = smokeStep('unity-editmode-smoke-2022.3.74f1');
  delete unpinned.commandArgv;
  const temp = createReadyUnityAdoptionFixture({
    releaseReadinessOverrides: {
      steps: [
        unpinned,
        smokeStep('unity-editmode-smoke-2023.2.20f1'),
        smokeStep('unity-editmode-smoke-6000.0.58f1'),
        assetStorePackageStep(),
      ],
    },
  });
  const proof = buildUnityAdoptionProofExport({
    now: new Date('2026-05-18T00:00:00.000Z'),
    root: temp.root,
    sourcePath: temp.sourcePath,
    releaseReadinessPath: temp.releaseReadinessPath,
  });

  assert.equal(proof.sourceAdoptionReady, false);
  assert.equal(proof.source.releaseReadinessReady, false);
  assert.ok(proof.source.blockers.includes('release readiness step missing target Unity command evidence: unity-editmode-smoke-2022.3.74f1'));
  assert.ok(proof.source.blockers.includes('release readiness step missing validated EditMode result XML evidence: unity-editmode-smoke-2022.3.74f1'));
  assert.ok(proof.source.blockers.includes('release readiness step missing validated PlayMode result XML evidence: unity-editmode-smoke-2022.3.74f1'));
});

test('Unity adoption proof exporter rejects Unity smoke XML outside target artifact paths', () => {
  const offPath = smokeStep('unity-editmode-smoke-2022.3.74f1');
  offPath.evidence.editModeResultXmlPath = '/tmp/stale/editmode-results.xml';
  offPath.evidence.playModeResultXmlPath = '/tmp/stale/playmode-results.xml';
  const temp = createReadyUnityAdoptionFixture({
    releaseReadinessOverrides: {
      steps: [
        offPath,
        smokeStep('unity-editmode-smoke-2023.2.20f1'),
        smokeStep('unity-editmode-smoke-6000.0.58f1'),
        assetStorePackageStep(),
      ],
    },
  });
  const proof = buildUnityAdoptionProofExport({
    now: new Date('2026-05-18T00:00:00.000Z'),
    root: temp.root,
    sourcePath: temp.sourcePath,
    releaseReadinessPath: temp.releaseReadinessPath,
  });

  assert.equal(proof.sourceAdoptionReady, false);
  assert.equal(proof.source.releaseReadinessReady, false);
  assert.ok(proof.source.blockers.includes('release readiness step missing validated EditMode result XML evidence: unity-editmode-smoke-2022.3.74f1'));
  assert.ok(proof.source.blockers.includes('release readiness step missing validated PlayMode result XML evidence: unity-editmode-smoke-2022.3.74f1'));
});

test('Unity adoption proof exporter rejects unvalidated Unity result XML proof', () => {
  const unvalidated = smokeStep('unity-editmode-smoke-2022.3.74f1');
  unvalidated.evidence.editModeResultXmlValidated = false;
  unvalidated.evidence.playModeResultXmlValidated = false;
  const temp = createReadyUnityAdoptionFixture({
    releaseReadinessOverrides: {
      steps: [
        unvalidated,
        smokeStep('unity-editmode-smoke-2023.2.20f1'),
        smokeStep('unity-editmode-smoke-6000.0.58f1'),
        assetStorePackageStep(),
      ],
    },
  });
  const proof = buildUnityAdoptionProofExport({
    now: new Date('2026-05-18T00:00:00.000Z'),
    root: temp.root,
    sourcePath: temp.sourcePath,
    releaseReadinessPath: temp.releaseReadinessPath,
  });

  assert.equal(proof.sourceAdoptionReady, false);
  assert.ok(proof.source.blockers.includes('release readiness step missing validated EditMode result XML evidence: unity-editmode-smoke-2022.3.74f1'));
  assert.ok(proof.source.blockers.includes('release readiness step missing validated PlayMode result XML evidence: unity-editmode-smoke-2022.3.74f1'));
});

test('Unity adoption proof exporter requires Verified Solution and commercial usage thresholds', () => {
  const temp = createReadyUnityAdoptionFixture({
    sourceOverrides: {
      unityVerifiedSolutionApplied: false,
      unityVerifiedSolutionAchieved: false,
      payingCustomers: 999,
      assetStorePaidCustomers: 999,
      activeMonthlyLicenses: 499,
      roundTripActiveCustomers: 99,
      mcpActiveCustomers: 49,
      successfulSampleImports: 99,
      averageSampleImportSeconds: 31,
      p95RoundTripLatencyMs: 2001,
      supportBlockers: 1,
      realEditorSmokeVersions: ['2022.3.74f1', '2023.2.20f1'],
    },
  });
  const proof = buildUnityAdoptionProofExport({
    now: new Date('2026-05-18T00:00:00.000Z'),
    root: temp.root,
    sourcePath: temp.sourcePath,
    releaseReadinessPath: temp.releaseReadinessPath,
  });

  assert.equal(proof.sourceAdoptionReady, false);
  assert.ok(proof.source.blockers.includes('Unity Verified Solution application has not been applied'));
  assert.ok(proof.source.blockers.includes('Unity Verified Solution status has not been achieved'));
  assert.ok(proof.source.blockers.includes('paying Unity customers below 1000'));
  assert.ok(proof.source.blockers.includes('Asset Store paid customers below 1000'));
  assert.ok(proof.source.blockers.includes('active monthly Unity licenses below 500'));
  assert.ok(proof.source.blockers.includes('active round-trip customers below 100'));
  assert.ok(proof.source.blockers.includes('active MCP customers below 50'));
  assert.ok(proof.source.blockers.includes('successful sample imports below 100'));
  assert.ok(proof.source.blockers.includes('average sample import time must be between 0 and 30 seconds'));
  assert.ok(proof.source.blockers.includes('p95 round-trip latency must be between 0 and 2000ms'));
  assert.ok(proof.source.blockers.includes('support blockers must be zero'));
  assert.ok(proof.source.blockers.includes('missing real Unity smoke version: 6000.0'));
});

test('Unity adoption proof exporter rejects stale source evidence hashes', () => {
  const temp = createReadyUnityAdoptionFixture({
    sourceOverrides: {
      evidence: [
        evidence('asset-store-sales-export', '2026-03-01T00:00:00.000Z'),
        evidence('cloud-license-registry', '2026-03-01T00:00:00.000Z'),
        evidence('round-trip-usage-export', '2026-03-01T00:00:00.000Z'),
        evidence('mcp-usage-export', '2026-03-01T00:00:00.000Z'),
        evidence('real-unity-smoke-matrix', '2026-03-01T00:00:00.000Z'),
        evidence('support-sla-report', '2026-03-01T00:00:00.000Z'),
      ],
    },
  });
  const proof = buildUnityAdoptionProofExport({
    now: new Date('2026-05-18T00:00:00.000Z'),
    root: temp.root,
    sourcePath: temp.sourcePath,
    releaseReadinessPath: temp.releaseReadinessPath,
  });

  assert.equal(proof.sourceAdoptionReady, false);
  assert.equal(proof.source.evidenceCount, 0);
  assert.deepEqual(proof.source.missingEvidenceTypes, [
    'asset-store-sales-export',
    'cloud-license-registry',
    'round-trip-usage-export',
    'mcp-usage-export',
    'real-unity-smoke-matrix',
    'support-sla-report',
  ]);
});

test('Unity adoption proof exporter rejects customer contact data in source evidence', () => {
  const temp = createReadyUnityAdoptionFixture({
    sourceOverrides: {
      contactEmail: 'buyer@example.com',
      customerName: 'Example Studio',
    },
  });
  const proof = buildUnityAdoptionProofExport({
    now: new Date('2026-05-18T00:00:00.000Z'),
    root: temp.root,
    sourcePath: temp.sourcePath,
    releaseReadinessPath: temp.releaseReadinessPath,
  });

  assert.equal(proof.sourceAdoptionReady, false);
  assert.ok(proof.source.blockers.includes('source evidence appears to contain customer contact data or raw portal exports'));
  assert.doesNotMatch(JSON.stringify(proof), /buyer@example\.com|Example Studio/u);
});

test('Unity adoption proof exporter blocks source-ready claims with secrets or weak evidence', () => {
  const temp = createReadyUnityAdoptionFixture({
    sourceOverrides: {
      evidence: [{ type: 'asset-store-sales-export', sourceHash: 'not-a-hash', capturedAt: '2026-05-17T00:00:00.000Z' }],
      notes: 'OPENAI_API_KEY=sk-test_abcdefghijklmnopqrstuvwxyz',
    },
  });
  const proof = buildUnityAdoptionProofExport({
    now: new Date('2026-05-18T00:00:00.000Z'),
    root: temp.root,
    sourcePath: temp.sourcePath,
  });

  assert.equal(proof.sourceAdoptionReady, false);
  assert.ok(proof.source.blockers.includes('source evidence appears to contain secrets'));
  assert.ok(proof.source.missingEvidenceTypes.includes('cloud-license-registry'));
});

function createReadyUnityAdoptionFixture({ releaseReadinessOverrides = {}, sourceOverrides = {} } = {}) {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'greybox-unity-adoption-proof-'));
  mkdirSync(join(fixtureRoot, 'Validation~', 'artifacts'), { recursive: true });
  writeFileSync(join(fixtureRoot, 'package.json'), JSON.stringify({
    name: 'com.greybox.studio',
    version: '1.0.0',
  }, null, 2));
  writeFileSync(join(fixtureRoot, 'UNITY_VERIFIED_SOLUTION.md'), readyVerifiedSolutionPacket());
  const source = {
    assetStoreLive: true,
    unityVerifiedSolutionApplied: true,
    unityVerifiedSolutionAchieved: true,
    payingCustomers: 1_250,
    assetStorePaidCustomers: 1_000,
    cloudPaidCustomers: 250,
    activeMonthlyLicenses: 900,
    roundTripActiveCustomers: 260,
    mcpActiveCustomers: 110,
    successfulSampleImports: 180,
    averageSampleImportSeconds: 24.5,
    p95RoundTripLatencyMs: 1_450,
    supportBlockers: 0,
    realEditorSmokeVersions: ['2022.3.74f1', '2023.2.20f1', 'Unity 6'],
    evidence: [
      evidence('asset-store-sales-export'),
      evidence('cloud-license-registry'),
      evidence('round-trip-usage-export'),
      evidence('mcp-usage-export'),
      evidence('real-unity-smoke-matrix'),
      evidence('support-sla-report'),
    ],
    ...sourceOverrides,
  };
  const sourcePath = join(fixtureRoot, 'Validation~', 'artifacts', 'unity-adoption-source.json');
  writeFileSync(sourcePath, JSON.stringify(source, null, 2));
  const releaseReadinessPath = join(fixtureRoot, 'Validation~', 'artifacts', 'release-readiness.json');
  writeFileSync(releaseReadinessPath, JSON.stringify({
    generatedAt: '2026-05-17T00:00:00.000Z',
    summary: { status: 'pass' },
    targetMatrix: [
      { stream: '2022.3 LTS', version: '2022.3.74f1', status: 'ready', editor: '/Applications/Unity/Hub/Editor/2022.3.74f1/Unity.app/Contents/MacOS/Unity' },
      { stream: '2023.2', version: '2023.2.20f1', status: 'ready', editor: '/Applications/Unity/Hub/Editor/2023.2.20f1/Unity.app/Contents/MacOS/Unity' },
      { stream: 'Unity 6', version: '6000.0.58f1', status: 'ready', editor: '/Applications/Unity/Hub/Editor/6000.0.58f1/Unity.app/Contents/MacOS/Unity' },
    ],
    steps: [
      smokeStep('unity-editmode-smoke-2022.3.74f1'),
      smokeStep('unity-editmode-smoke-2023.2.20f1'),
      smokeStep('unity-editmode-smoke-6000.0.58f1'),
      assetStorePackageStep(),
    ],
    ...releaseReadinessOverrides,
  }, null, 2));
  return { root: fixtureRoot, releaseReadinessPath, sourcePath };
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

function smokeStep(id) {
  const version = id.replace('unity-editmode-smoke-', '');
  return {
    id,
    status: 'pass',
    unityStream: unityStreamForVersion(version),
    unityVersion: version,
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

function smokeResultXmlPath(version, fileName) {
  return join('/tmp/greybox-unity-plugin', 'Validation~/artifacts', `unity-smoke-${version}`, fileName);
}

function unityStreamForVersion(version) {
  if (version === '2022.3.74f1') return '2022.3 LTS';
  if (version === '2023.2.20f1') return '2023.2';
  if (version === '6000.0.58f1') return 'Unity 6';
  return '';
}

function evidence(type, capturedAt = '2026-05-17T00:00:00.000Z') {
  return {
    type,
    sourceHash: evidenceHash,
    capturedAt,
  };
}

function readyVerifiedSolutionPacket() {
  return [
    '# Greybox Studio Unity Verified Solution Readiness',
    '',
    'Ready to apply: yes',
    '',
    '- Program: Unity Verified Solutions Program',
    '- Product: Greybox Studio',
    '- Publisher: Greybox Studio',
    '- Package name: Greybox Studio',
    '- Package id: com.greybox.studio',
    '- Integration category: AI-assisted game design Editor extension',
    '- Target Unity versions: 2022.3 LTS, 2023.2, Unity 6',
    '- Support email: support@greybox.studio',
    '- Support URL: https://greybox.studio/support',
    '- Documentation URL: https://greybox.studio/docs/unity',
    '- Privacy URL: https://greybox.studio/privacy',
    '- ASSET_STORE_SUBMISSION.md',
    '- node Validation~/release-readiness.mjs --submission --require-unity',
    '- Unity 2022.3 LTS',
    '- 2023.2',
    '- Unity 6',
    '- Validation~/artifacts/mcp-conformance.md',
    '- Validation~/artifacts/package-manifest.json',
    '- Validation~/artifacts/stable-release-candidate.json',
    '- node Validation~/stable-release-candidate.mjs --require-ready',
    '- 2-second p95',
    '- under 30 seconds',
    '- Free Personal and Indie stay one-way import only',
    '- Pro and Studio unlock round-trip sync',
    '- 3 locally tracked projects',
    '- watermarked generated artifacts',
    '- No API keys',
    '- game IP',
    '- EditorPrefs',
    '- runtime assets',
    '- loopback-only',
    '- local editor bearer token',
    '- AI-assisted',
    '- human designer',
    '- separate explicit opt-in consent',
    '- Third-Party Notices.txt',
    '- 100+ paying Unity plugin customers',
    '- 100+ active round-trip sync customers',
    '- 50+ active MCP bridge customers',
    '- 5+ shipped commercial games crediting Greybox',
    '- 3+ public Unity customer references',
    '- Support SLA evidence',
    '- stable `1.0.0` or later version',
    '- real Unity smoke matrix',
    '- required visual assets',
    '- trademark/domain clearance',
    '- Unity publisher credentials',
    '- customer references',
    '- support SLA evidence',
    '- counsel-approved privacy',
  ].join('\n');
}
