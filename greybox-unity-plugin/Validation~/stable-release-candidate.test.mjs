// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  buildStableReleaseCandidateReport,
  formatStableReleaseCandidateMarkdown,
  parseStableReleaseCandidateArgs,
} from './stable-release-candidate.mjs';
import {
  DEFAULT_UNITY_PACKAGE_PROJECT_PATH,
  EXPORT_METHOD,
  createUnityPackageExportCommand,
} from './unity-package-export.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const evidenceHash = 'd'.repeat(64);

test('stable release candidate args capture all evidence paths', () => {
  assert.deepEqual(parseStableReleaseCandidateArgs([
    '--root',
    '/tmp/greybox-unity-plugin',
    '--release-readiness',
    '/tmp/release-readiness.json',
    '--unitypackage-export',
    '/tmp/unitypackage-export.json',
    '--adoption-source',
    '/tmp/unity-adoption-source.json',
    '--output',
    'Validation~/artifacts/stable-release-candidate.json',
    '--require-ready',
  ]), {
    adoptionSource: '/tmp/unity-adoption-source.json',
    output: 'Validation~/artifacts/stable-release-candidate.json',
    releaseReadiness: '/tmp/release-readiness.json',
    requireReady: true,
    root: '/tmp/greybox-unity-plugin',
    unityPackageExport: '/tmp/unitypackage-export.json',
  });
});

test('stable release candidate gate stays blocked for prerelease packages', () => {
  const prereleaseRoot = mkdtempSync(join(tmpdir(), 'greybox-unity-stable-prerelease-'));
  writeFileSync(
    join(prereleaseRoot, 'package.json'),
    readFileSync(join(root, 'package.json'), 'utf8').replace('"version": "1.0.0"', '"version": "0.1.0-alpha.1"'),
  );
  const report = buildStableReleaseCandidateReport({
    now: new Date('2026-05-22T00:00:00.000Z'),
    root: prereleaseRoot,
  });
  const markdown = formatStableReleaseCandidateMarkdown(report);

  assert.equal(report.status, 'blocked');
  assert.equal(report.package.version, '0.1.0-alpha.1');
  assert.ok(report.errors.includes('package.json version must be a stable 1.0.0 or later release candidate version'));
  assert.doesNotMatch(markdown, /OPENAI_API_KEY|UNITY_PASSWORD|gbx_/u);
});

test('stable release candidate gate stays blocked for the real package until full evidence is attached', () => {
  const report = buildStableReleaseCandidateReport({
    now: new Date('2026-05-27T00:00:00.000Z'),
    root,
  });
  const markdown = formatStableReleaseCandidateMarkdown(report);

  assert.equal(report.status, 'blocked');
  assert.equal(report.package.version, '1.0.0');
  assert.ok(report.errors.some((error) => /submission packet gate must pass in final mode \(\d+ errors\)/u.test(error)));
  assert.ok(report.errors.includes('unity adoption source proof must be ready before claiming a stable release candidate'));
  assert.doesNotMatch(markdown, /OPENAI_API_KEY|UNITY_PASSWORD|gbx_/u);
});

test('stable release candidate gate passes with matching version, package export, and source proof', () => {
  const fixture = createReadyStableFixture();
  const report = buildStableReleaseCandidateReport({
    now: new Date('2026-05-22T00:00:00.000Z'),
    root: fixture.root,
  });

  assert.equal(report.status, 'pass');
  assert.equal(report.package.name, 'com.greybox.studio');
  assert.equal(report.package.version, '1.0.0');
  assert.equal(report.submissionPacket.status, 'pass');
  assert.equal(report.releaseReadiness.status, 'pass');
  assert.equal(report.unityPackageExport.status, 'pass');
  assert.equal(report.unityPackageExport.packageVersion, '1.0.0');
  assert.equal(report.sourceProof.status, 'pass');
  assert.deepEqual(report.sourceProof.missingEvidenceTypes, []);
});

test('stable release candidate gate rejects stale release and package export evidence', () => {
  const fixture = createReadyStableFixture({
    releaseReadinessOverrides: {
      generatedAt: '2026-05-01T00:00:00.000Z',
    },
    unityExportOverrides: {
      generatedAt: '2026-05-01T00:00:00.000Z',
    },
  });
  const report = buildStableReleaseCandidateReport({
    now: new Date('2026-05-22T00:00:00.000Z'),
    root: fixture.root,
  });

  assert.equal(report.status, 'blocked');
  assert.equal(report.releaseReadiness.status, 'blocked');
  assert.equal(report.unityPackageExport.status, 'blocked');
  assert.ok(report.errors.includes('release readiness artifact generatedAt must be no older than 14 days'));
  assert.ok(report.errors.includes('Unity package export manifest generatedAt must be no older than 14 days'));
});

test('stable release candidate gate rejects future-dated release evidence', () => {
  const fixture = createReadyStableFixture({
    releaseReadinessOverrides: {
      generatedAt: '2026-05-22T00:02:00.000Z',
    },
    unityExportOverrides: {
      generatedAt: '2026-05-22T00:02:00.000Z',
    },
  });
  const report = buildStableReleaseCandidateReport({
    now: new Date('2026-05-22T00:00:00.000Z'),
    root: fixture.root,
  });

  assert.equal(report.status, 'blocked');
  assert.equal(report.releaseReadiness.status, 'blocked');
  assert.equal(report.unityPackageExport.status, 'blocked');
  assert.ok(report.errors.includes('release readiness artifact generatedAt must not be in the future'));
  assert.ok(report.errors.includes('Unity package export manifest generatedAt must not be in the future'));
});

test('stable release candidate gate rejects mismatched Unity package export metadata', () => {
  const fixture = createReadyStableFixture({
    unityExportOverrides: {
      packageVersion: '1.0.1',
      package: {
        bytes: 123456,
        sha256: 'e'.repeat(64),
      },
    },
  });
  const report = buildStableReleaseCandidateReport({
    now: new Date('2026-05-22T00:00:00.000Z'),
    root: fixture.root,
  });

  assert.equal(report.status, 'blocked');
  assert.ok(report.errors.includes('Unity package export manifest packageVersion must match package.json (1.0.0)'));
  assert.ok(report.errors.includes('Unity package export manifest SHA-256 must match release readiness evidence'));
});

test('stable release candidate gate rejects Unity package export paths outside dist handoff', () => {
  const fixture = createReadyStableFixture({
    releaseExportOutputPath: '/tmp/outside/com.greybox.studio.unitypackage',
    unityExportOverrides: {
      outputPath: '/tmp/outside/com.greybox.studio.unitypackage',
    },
  });
  const report = buildStableReleaseCandidateReport({
    now: new Date('2026-05-22T00:00:00.000Z'),
    root: fixture.root,
  });

  assert.equal(report.status, 'blocked');
  assert.ok(report.errors.includes('Unity package export manifest outputPath must be under the package dist/ handoff directory'));
});

test('stable release candidate gate rejects forged Unity package export provenance', () => {
  const fixture = createReadyStableFixture({
    unityExportOverrides: {
      packageRoot: '/tmp/other-workspace',
      projectRoot: '/tmp/unchecked-export-project',
      unity: '',
      unityVersion: '2021.3.45f1',
      command: 'node Validation~/package-builder.mjs --output dist/com.greybox.studio.unitypackage',
      commandWithEnvironment: 'GREYBOX_ASSET_STORE_PACKAGE_OUTPUT=/tmp/forged.unitypackage',
    },
  });
  const report = buildStableReleaseCandidateReport({
    now: new Date('2026-05-22T00:00:00.000Z'),
    root: fixture.root,
  });

  assert.equal(report.status, 'blocked');
  assert.equal(report.unityPackageExport.status, 'blocked');
  assert.ok(report.errors.includes('Unity package export manifest packageRoot must match the package workspace'));
  assert.ok(report.errors.includes('Unity package export manifest Unity editor path must be non-empty'));
  assert.ok(report.errors.includes('Unity package export manifest projectRoot must be the clean Asset Store export project under .tmp/asset-store-export'));
  assert.ok(report.errors.includes('Unity package export manifest unityVersion must match a supported Unity release target'));
  assert.ok(report.errors.includes('Unity package export manifest Unity editor must match a release-readiness ready target'));
  assert.ok(report.errors.includes('Unity package export manifest command must use the clean Asset Store export project path'));
  assert.ok(report.errors.includes('Unity package export manifest command must run Unity in batchmode, quit, and nographics mode'));
  assert.ok(report.errors.includes(`Unity package export manifest command must run ${EXPORT_METHOD}`));
  assert.ok(report.errors.includes('Unity package export manifest command must pass the package output path to Unity'));
  assert.ok(report.errors.includes('Unity package export manifest commandWithEnvironment must include the Unity export command'));
});

test('stable release candidate gate rejects dry-run Unity package export provenance', () => {
  const fixture = createReadyStableFixture();
  const outputPath = join(fixture.root, 'dist', 'com.greybox.studio.unitypackage');
  const projectRoot = join(fixture.root, DEFAULT_UNITY_PACKAGE_PROJECT_PATH);
  const unity = '/Applications/Unity/Hub/Editor/2022.3.74f1/Unity.app/Contents/MacOS/Unity';
  const dryRunCommand = stableUnityPackageExportCommand({ outputPath, projectRoot, unity }).replace(' -batchmode ', ' --dry-run -batchmode ');
  writeFileSync(join(fixture.root, 'Validation~', 'artifacts', 'unitypackage-export.json'), JSON.stringify({
    ...JSON.parse(readFileSync(join(fixture.root, 'Validation~', 'artifacts', 'unitypackage-export.json'), 'utf8')),
    command: dryRunCommand,
    commandWithEnvironment: `GREYBOX_ASSET_STORE_PACKAGE_OUTPUT=${shellQuote(outputPath)} ${dryRunCommand}`,
  }, null, 2));

  const report = buildStableReleaseCandidateReport({
    now: new Date('2026-05-22T00:00:00.000Z'),
    root: fixture.root,
  });

  assert.equal(report.status, 'blocked');
  assert.ok(report.errors.includes('Unity package export manifest command must not be dry-run'));
});

test('stable release candidate gate rejects Unity package exports from untested editors', () => {
  const fixture = createReadyStableFixture();
  const outputPath = join(fixture.root, 'dist', 'com.greybox.studio.unitypackage');
  const projectRoot = join(fixture.root, DEFAULT_UNITY_PACKAGE_PROJECT_PATH);
  const unity = '/Applications/Unity/Hub/Editor/2021.3.45f1/Unity.app/Contents/MacOS/Unity';
  const command = stableUnityPackageExportCommand({ outputPath, projectRoot, unity });
  writeFileSync(join(fixture.root, 'Validation~', 'artifacts', 'unitypackage-export.json'), JSON.stringify({
    ...JSON.parse(readFileSync(join(fixture.root, 'Validation~', 'artifacts', 'unitypackage-export.json'), 'utf8')),
    unity,
    unityVersion: '2022.3.74f1',
    command,
    commandWithEnvironment: `GREYBOX_ASSET_STORE_PACKAGE_OUTPUT=${shellQuote(outputPath)} ${command}`,
  }, null, 2));

  const report = buildStableReleaseCandidateReport({
    now: new Date('2026-05-22T00:00:00.000Z'),
    root: fixture.root,
  });

  assert.equal(report.status, 'blocked');
  assert.equal(report.unityPackageExport.status, 'blocked');
  assert.ok(report.errors.includes('Unity package export manifest Unity editor must match a release-readiness ready target'));
});

test('stable release candidate gate rejects Unity package export command path drift', () => {
  const fixture = createReadyStableFixture();
  const outputPath = join(fixture.root, 'dist', 'com.greybox.studio.unitypackage');
  const projectRoot = '/tmp/other-asset-store-export';
  const unity = '/Applications/Unity/Hub/Editor/2022.3.74f1/Unity.app/Contents/MacOS/Unity';
  const command = stableUnityPackageExportCommand({ outputPath, projectRoot, unity });
  writeFileSync(join(fixture.root, 'Validation~', 'artifacts', 'unitypackage-export.json'), JSON.stringify({
    ...JSON.parse(readFileSync(join(fixture.root, 'Validation~', 'artifacts', 'unitypackage-export.json'), 'utf8')),
    commandArgv: createUnityPackageExportCommand({ outputPath, projectRoot, unity }),
    command,
    commandWithEnvironment: `GREYBOX_ASSET_STORE_PACKAGE_OUTPUT=${shellQuote(outputPath)} ${command}`,
  }, null, 2));

  const report = buildStableReleaseCandidateReport({
    now: new Date('2026-05-22T00:00:00.000Z'),
    root: fixture.root,
  });

  assert.equal(report.status, 'blocked');
  assert.equal(report.unityPackageExport.status, 'blocked');
  assert.ok(report.errors.includes('Unity package export manifest command must use the clean Asset Store export project path'));
  assert.ok(report.errors.includes('Unity package export manifest commandArgv must match the exact Unity export command'));
});

test('stable release candidate gate rejects missing Unity package export argv evidence', () => {
  const fixture = createReadyStableFixture();
  const exportManifestPath = join(fixture.root, 'Validation~', 'artifacts', 'unitypackage-export.json');
  const manifest = JSON.parse(readFileSync(exportManifestPath, 'utf8'));
  delete manifest.commandArgv;
  writeFileSync(exportManifestPath, JSON.stringify(manifest, null, 2));

  const report = buildStableReleaseCandidateReport({
    now: new Date('2026-05-22T00:00:00.000Z'),
    root: fixture.root,
  });

  assert.equal(report.status, 'blocked');
  assert.equal(report.unityPackageExport.status, 'blocked');
  assert.ok(report.errors.includes('Unity package export manifest commandArgv must include the exact Unity export argv'));
});

test('stable release candidate gate rejects substring-spoofed Unity package export argv', () => {
  const fixture = createReadyStableFixture();
  const exportManifestPath = join(fixture.root, 'Validation~', 'artifacts', 'unitypackage-export.json');
  const manifest = JSON.parse(readFileSync(exportManifestPath, 'utf8'));
  manifest.commandArgv = [
    manifest.unity,
    '-batchmode',
    '-quit',
    '-nographics',
    '-projectPath',
    `${manifest.projectRoot} --dry-run -executeMethod ${EXPORT_METHOD}`,
    '-greyboxAssetStorePackageOutput',
    manifest.outputPath,
  ];
  writeFileSync(exportManifestPath, JSON.stringify(manifest, null, 2));

  const report = buildStableReleaseCandidateReport({
    now: new Date('2026-05-22T00:00:00.000Z'),
    root: fixture.root,
  });

  assert.equal(report.status, 'blocked');
  assert.equal(report.unityPackageExport.status, 'blocked');
  assert.ok(report.errors.includes('Unity package export manifest commandArgv must match the exact Unity export command'));
});

test('stable release candidate gate rejects missing Unity package export file', () => {
  const fixture = createReadyStableFixture({
    writeUnityPackageFile: false,
  });
  const report = buildStableReleaseCandidateReport({
    now: new Date('2026-05-22T00:00:00.000Z'),
    root: fixture.root,
  });

  assert.equal(report.status, 'blocked');
  assert.equal(report.unityPackageExport.status, 'blocked');
  assert.ok(report.errors.includes('Unity package export file must exist on disk at outputPath'));
});

test('stable release candidate gate rejects Unity package file hash drift', () => {
  const fixture = createReadyStableFixture({
    unityExportOverrides: {
      package: {
        bytes: 123456,
        sha256: 'c'.repeat(64),
      },
    },
  });
  const report = buildStableReleaseCandidateReport({
    now: new Date('2026-05-22T00:00:00.000Z'),
    root: fixture.root,
  });

  assert.equal(report.status, 'blocked');
  assert.equal(report.unityPackageExport.status, 'blocked');
  assert.ok(report.errors.some((error) => /^Unity package export manifest byte count does not match file on disk \(\d+ != 123456\)$/u.test(error)));
  assert.ok(report.errors.includes('Unity package export manifest SHA-256 does not match file on disk'));
});

test('stable release candidate gate rejects Unity package export path drift from release readiness', () => {
  const fixture = createReadyStableFixture({
    unityExportOverrides: {
      outputPath: join('/tmp', 'dist', 'com.greybox.studio.unitypackage'),
    },
  });
  const report = buildStableReleaseCandidateReport({
    now: new Date('2026-05-22T00:00:00.000Z'),
    root: fixture.root,
  });

  assert.equal(report.status, 'blocked');
  assert.ok(report.errors.includes('Unity package export manifest outputPath must be under the package dist/ handoff directory'));
  assert.ok(report.errors.includes('Unity package export manifest outputPath must match release readiness evidence'));
});

test('stable release candidate gate rejects release readiness package evidence without output path', () => {
  const incompletePackageEvidence = assetStorePackageEvidence('/tmp/dist/com.greybox.studio.unitypackage');
  delete incompletePackageEvidence.unityPackageOutputPath;
  const fixture = createReadyStableFixture({
    releaseReadinessOverrides: {
      steps: [
        smokeStep('unity-editmode-smoke-2022.3.74f1'),
        smokeStep('unity-editmode-smoke-2023.2.20f1'),
        smokeStep('unity-editmode-smoke-6000.0.58f1'),
        { id: 'asset-store-unitypackage-export', status: 'pass', evidence: incompletePackageEvidence },
      ],
    },
  });
  const report = buildStableReleaseCandidateReport({
    now: new Date('2026-05-22T00:00:00.000Z'),
    root: fixture.root,
  });

  assert.equal(report.status, 'blocked');
  assert.equal(report.releaseReadiness.status, 'blocked');
  assert.ok(report.errors.includes('release readiness .unitypackage export step must include output path, byte, and SHA-256 evidence'));
});

test('stable release candidate gate rejects incomplete sanitized adoption source proof', () => {
  const fixture = createReadyStableFixture({
    sourceOverrides: {
      evidence: [
        evidence('asset-store-sales-export'),
        evidence('cloud-license-registry'),
      ],
    },
  });
  const report = buildStableReleaseCandidateReport({
    now: new Date('2026-05-22T00:00:00.000Z'),
    root: fixture.root,
  });

  assert.equal(report.status, 'blocked');
  assert.ok(report.errors.includes('unity adoption source proof must be ready before claiming a stable release candidate'));
  assert.ok(report.sourceProof.missingEvidenceTypes.includes('mcp-usage-export'));
  assert.ok(report.sourceProof.missingEvidenceTypes.includes('support-sla-report'));
});

test('stable release candidate gate marks release readiness blocked when smoke evidence is incomplete', () => {
  const fixture = createReadyStableFixture({
    releaseReadinessOverrides: {
      steps: [
        { id: 'unity-editmode-smoke-2022.3.74f1', status: 'pass' },
        smokeStep('unity-editmode-smoke-2023.2.20f1'),
        smokeStep('unity-editmode-smoke-6000.0.58f1'),
        { id: 'asset-store-unitypackage-export', status: 'pass', evidence: assetStorePackageEvidence() },
      ],
    },
  });
  const report = buildStableReleaseCandidateReport({
    now: new Date('2026-05-22T00:00:00.000Z'),
    root: fixture.root,
  });

  assert.equal(report.status, 'blocked');
  assert.equal(report.releaseReadiness.status, 'blocked');
  assert.ok(report.errors.includes('release readiness Unity smoke step must be pinned to target Unity version: unity-editmode-smoke-2022.3.74f1'));
  assert.ok(report.errors.includes('release readiness Unity smoke step must include named EditMode evidence: unity-editmode-smoke-2022.3.74f1'));
  assert.ok(report.errors.includes('release readiness Unity smoke step must include EditMode package test assembly evidence: unity-editmode-smoke-2022.3.74f1'));
  assert.ok(report.errors.includes('release readiness Unity smoke step must include validated EditMode result XML evidence: unity-editmode-smoke-2022.3.74f1'));
  assert.ok(report.errors.includes('release readiness Unity smoke step must include named PlayMode evidence: unity-editmode-smoke-2022.3.74f1'));
  assert.ok(report.errors.includes('release readiness Unity smoke step must include PlayMode package test assembly evidence: unity-editmode-smoke-2022.3.74f1'));
  assert.ok(report.errors.includes('release readiness Unity smoke step must include validated PlayMode result XML evidence: unity-editmode-smoke-2022.3.74f1'));
});

test('stable release candidate gate rejects version-mismatched Unity smoke proof', () => {
  const mismatched = smokeStep('unity-editmode-smoke-2023.2.20f1');
  mismatched.unityVersion = '2022.3.74f1';
  mismatched.command = 'node Validation~/unity-import-smoke.mjs --unity /Applications/Unity/Hub/Editor/2022.3.74f1/Unity.app/Contents/MacOS/Unity --unity-version 2022.3.74f1';
  const unpinned = smokeStep('unity-editmode-smoke-6000.0.58f1');
  unpinned.command = 'node Validation~/unity-import-smoke.mjs --unity /Applications/Unity/Hub/Editor/6000.0.58f1/Unity.app/Contents/MacOS/Unity';
  delete unpinned.commandArgv;
  const fixture = createReadyStableFixture({
    releaseReadinessOverrides: {
      steps: [
        smokeStep('unity-editmode-smoke-2022.3.74f1'),
        mismatched,
        unpinned,
        { id: 'asset-store-unitypackage-export', status: 'pass', evidence: assetStorePackageEvidence() },
      ],
    },
  });
  const report = buildStableReleaseCandidateReport({
    now: new Date('2026-05-22T00:00:00.000Z'),
    root: fixture.root,
  });

  assert.equal(report.status, 'blocked');
  assert.ok(report.errors.includes('release readiness Unity smoke step must be pinned to target Unity version: unity-editmode-smoke-2023.2.20f1'));
  assert.ok(report.errors.includes('release readiness Unity smoke step must be pinned to target Unity version: unity-editmode-smoke-6000.0.58f1'));
});

test('stable release candidate gate rejects substring-spoofed Unity smoke argv', () => {
  const spoofed = smokeStep('unity-editmode-smoke-2022.3.74f1');
  spoofed.commandArgv = [
    'node',
    'Validation~/unity-import-smoke.mjs',
    '--unity',
    '/Applications/Unity/Hub/Editor/2022.3.74f1/Unity.app/Contents/MacOS/Unity',
    '--unity-version',
    '2022.3.74f1 --skip-if-missing',
  ];
  const fixture = createReadyStableFixture({
    releaseReadinessOverrides: {
      steps: [
        spoofed,
        smokeStep('unity-editmode-smoke-2023.2.20f1'),
        smokeStep('unity-editmode-smoke-6000.0.58f1'),
        { id: 'asset-store-unitypackage-export', status: 'pass', evidence: assetStorePackageEvidence() },
      ],
    },
  });
  const report = buildStableReleaseCandidateReport({
    now: new Date('2026-05-22T00:00:00.000Z'),
    root: fixture.root,
  });

  assert.equal(report.status, 'blocked');
  assert.ok(report.errors.includes('release readiness Unity smoke step must be pinned to target Unity version: unity-editmode-smoke-2022.3.74f1'));
});

test('stable release candidate gate rejects unvalidated Unity result XML proof', () => {
  const unvalidated = smokeStep('unity-editmode-smoke-2022.3.74f1');
  unvalidated.evidence.editModeResultXmlValidated = false;
  unvalidated.evidence.playModeResultXmlValidated = false;
  const fixture = createReadyStableFixture({
    releaseReadinessOverrides: {
      steps: [
        unvalidated,
        smokeStep('unity-editmode-smoke-2023.2.20f1'),
        smokeStep('unity-editmode-smoke-6000.0.58f1'),
        { id: 'asset-store-unitypackage-export', status: 'pass', evidence: assetStorePackageEvidence() },
      ],
    },
  });
  const report = buildStableReleaseCandidateReport({
    now: new Date('2026-05-22T00:00:00.000Z'),
    root: fixture.root,
  });

  assert.equal(report.status, 'blocked');
  assert.ok(report.errors.includes('release readiness Unity smoke step must include validated EditMode result XML evidence: unity-editmode-smoke-2022.3.74f1'));
  assert.ok(report.errors.includes('release readiness Unity smoke step must include validated PlayMode result XML evidence: unity-editmode-smoke-2022.3.74f1'));
});

test('stable release candidate gate rejects substring-spoofed smoke stdout', () => {
  const fixture = createReadyStableFixture({
    releaseReadinessOverrides: {
      steps: [
        {
          id: 'unity-editmode-smoke-2022.3.74f1',
          status: 'pass',
          unityStream: '2022.3 LTS',
          unityVersion: '2022.3.74f1',
          command: 'node Validation~/unity-import-smoke.mjs --unity /Applications/Unity/Hub/Editor/2022.3.74f1/Unity.app/Contents/MacOS/Unity --unity-version 2022.3.74f1',
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
        { id: 'asset-store-unitypackage-export', status: 'pass', evidence: assetStorePackageEvidence() },
      ],
    },
  });
  const report = buildStableReleaseCandidateReport({
    now: new Date('2026-05-22T00:00:00.000Z'),
    root: fixture.root,
  });

  assert.equal(report.status, 'blocked');
  assert.ok(report.errors.includes('release readiness Unity smoke step must include named EditMode evidence: unity-editmode-smoke-2022.3.74f1'));
  assert.ok(report.errors.includes('release readiness Unity smoke step must include validated EditMode result XML evidence: unity-editmode-smoke-2022.3.74f1'));
  assert.ok(report.errors.includes('release readiness Unity smoke step must include named PlayMode evidence: unity-editmode-smoke-2022.3.74f1'));
  assert.ok(report.errors.includes('release readiness Unity smoke step must include validated PlayMode result XML evidence: unity-editmode-smoke-2022.3.74f1'));
});

function createReadyStableFixture({
  releaseExportOutputPath = '',
  releaseReadinessOverrides = {},
  sourceOverrides = {},
  unityExportOverrides = {},
  writeUnityPackageFile = true,
} = {}) {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'greybox-unity-stable-candidate-'));
  mkdirSync(join(fixtureRoot, 'Validation~', 'artifacts'), { recursive: true });
  const unityPackageOutputPath = releaseExportOutputPath || join(fixtureRoot, 'dist', 'com.greybox.studio.unitypackage');
  const unityEditorPath = '/Applications/Unity/Hub/Editor/2022.3.74f1/Unity.app/Contents/MacOS/Unity';
  const unityExportProjectRoot = join(fixtureRoot, DEFAULT_UNITY_PACKAGE_PROJECT_PATH);
  const unityPackageCommand = stableUnityPackageExportCommand({
    outputPath: unityPackageOutputPath,
    projectRoot: unityExportProjectRoot,
    unity: unityEditorPath,
  });
  const unityPackageBytes = Buffer.from('Greybox Unity package fixture bytes\n');
  const unityPackageSha256 = createHash('sha256').update(unityPackageBytes).digest('hex');
  if (writeUnityPackageFile) {
    mkdirSync(dirname(unityPackageOutputPath), { recursive: true });
    writeFileSync(unityPackageOutputPath, unityPackageBytes);
  }
  writeFileSync(join(fixtureRoot, 'package.json'), JSON.stringify({
    name: 'com.greybox.studio',
    displayName: 'Greybox Studio',
    version: '1.0.0',
    unity: '2022.3',
  }, null, 2));
  writeFileSync(
    join(fixtureRoot, 'ASSET_STORE_SUBMISSION.md'),
    readFileSync(join(root, 'ASSET_STORE_SUBMISSION.md'), 'utf8').replace('Ready to submit: no', 'Ready to submit: yes'),
  );
  writeFileSync(join(fixtureRoot, 'UNITY_VERIFIED_SOLUTION.md'), readyVerifiedSolutionPacket());
  writeVisuals(fixtureRoot);

  const releaseReadinessPath = join(fixtureRoot, 'Validation~', 'artifacts', 'release-readiness.json');
  writeFileSync(releaseReadinessPath, JSON.stringify({
    generatedAt: '2026-05-22T00:00:00.000Z',
    packageRoot: fixtureRoot,
    submission: true,
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
      {
        id: 'asset-store-unitypackage-export',
        status: 'pass',
        command: releaseReadinessPackageCommandArgv(unityPackageOutputPath).join(' '),
        commandArgv: releaseReadinessPackageCommandArgv(unityPackageOutputPath),
        evidence: assetStorePackageEvidence(unityPackageOutputPath, unityPackageBytes.byteLength, unityPackageSha256),
      },
    ],
    ...releaseReadinessOverrides,
  }, null, 2));

  writeFileSync(join(fixtureRoot, 'Validation~', 'artifacts', 'unitypackage-export.json'), JSON.stringify({
    generatedAt: '2026-05-22T00:00:00.000Z',
    packageRoot: fixtureRoot,
    packageName: 'com.greybox.studio',
    packageVersion: '1.0.0',
    packageDisplayName: 'Greybox Studio',
    projectRoot: unityExportProjectRoot,
    outputPath: unityPackageOutputPath,
    unityVersion: '2022.3.74f1',
    unity: unityEditorPath,
    commandArgv: createUnityPackageExportCommand({
      outputPath: unityPackageOutputPath,
      projectRoot: unityExportProjectRoot,
      unity: unityEditorPath,
    }),
    command: unityPackageCommand,
    commandWithEnvironment: `GREYBOX_ASSET_STORE_PACKAGE_OUTPUT=${shellQuote(unityPackageOutputPath)} ${unityPackageCommand}`,
    status: 'pass',
    package: {
      bytes: unityPackageBytes.byteLength,
      sha256: unityPackageSha256,
    },
    ...unityExportOverrides,
  }, null, 2));

  writeFileSync(join(fixtureRoot, 'Validation~', 'artifacts', 'unity-adoption-source.json'), JSON.stringify({
    assetStoreLive: true,
    unityVerifiedSolutionApplied: true,
    unityVerifiedSolutionAchieved: true,
    payingCustomers: 1250,
    assetStorePaidCustomers: 1000,
    cloudPaidCustomers: 250,
    activeMonthlyLicenses: 900,
    roundTripActiveCustomers: 260,
    mcpActiveCustomers: 110,
    successfulSampleImports: 180,
    averageSampleImportSeconds: 24.5,
    p95RoundTripLatencyMs: 1450,
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
  }, null, 2));

  return { root: fixtureRoot };
}

function assetStorePackageEvidence(outputPath = '/tmp/dist/com.greybox.studio.unitypackage', bytes = 123456, sha256 = 'c'.repeat(64)) {
  return {
    unityPackageExportPassed: true,
    unityPackageOutputPath: outputPath,
    unityPackageBytes: bytes,
    unityPackageSha256: sha256,
  };
}

function releaseReadinessPackageCommandArgv(outputPath = 'dist/com.greybox.studio.unitypackage') {
  return [
    'node',
    'Validation~/unity-package-export.mjs',
    '--unity',
    '/Applications/Unity/Hub/Editor/2022.3.74f1/Unity.app/Contents/MacOS/Unity',
    '--unity-version',
    '2022.3.74f1',
    '--project-path',
    DEFAULT_UNITY_PACKAGE_PROJECT_PATH,
    '--output',
    outputPath,
    '--manifest',
    'Validation~/artifacts/unitypackage-export.json',
  ];
}

function stableUnityPackageExportCommand({ outputPath, projectRoot, unity }) {
  return [
    shellQuote(unity),
    '-batchmode',
    '-quit',
    '-nographics',
    '-projectPath',
    shellQuote(projectRoot),
    '-executeMethod',
    EXPORT_METHOD,
    '-greyboxAssetStorePackageOutput',
    shellQuote(outputPath),
  ].join(' ');
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function smokeStep(id) {
  const version = id.replace('unity-editmode-smoke-', '');
  const stream = unityStreamForVersion(version);
  return {
    id,
    status: 'pass',
    unityStream: stream,
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
  ].join(' ');
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

function evidence(type) {
  return {
    type,
    sourceHash: evidenceHash,
    capturedAt: '2026-05-21T00:00:00.000Z',
  };
}

function minimalPng(width, height) {
  const buffer = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(buffer, 0);
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
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
