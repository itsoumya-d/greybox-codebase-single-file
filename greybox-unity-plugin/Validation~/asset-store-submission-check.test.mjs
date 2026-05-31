// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  formatSubmissionReportMarkdown,
  parseSubmissionArgs,
  validateSubmissionPacket,
} from './asset-store-submission-check.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('submission args capture root and final submission mode', () => {
  assert.deepEqual(parseSubmissionArgs([
    '--root',
    '/tmp/greybox-unity-plugin',
    '--submission',
    '--skip-release-evidence',
  ]), {
    root: '/tmp/greybox-unity-plugin',
    skipReleaseEvidence: true,
    submission: true,
  });
});

test('submission packet gate passes the real alpha handoff with explicit blockers', () => {
  const report = validateSubmissionPacket(root);

  assert.equal(report.status, 'pass');
  assert.equal(report.errors.length, 0);
  assert.ok(report.warnings.some((warning) => /intentionally blocked/u.test(warning)));
  assert.equal(report.warnings.some((warning) => /visual asset not yet exported/u.test(warning)), false);
  assert.ok(report.requiredVisualAssets.includes('Documentation~/asset-store/screenshot-round-trip.png'));
  assert.doesNotMatch(JSON.stringify(report), /API_KEY|SECRET|UNITY_PASSWORD|gbx_pro_/u);
});

test('submission mode blocks prerelease package versions and not-ready packets', () => {
  const temp = mkdtempSync(join(tmpdir(), 'greybox-unity-prerelease-packet-'));
  writeFileSync(
    join(temp, 'package.json'),
    readFileSync(join(root, 'package.json'), 'utf8').replace('"version": "1.0.0"', '"version": "1.0.0-rc.1"'),
  );
  writeFileSync(
    join(temp, 'ASSET_STORE_SUBMISSION.md'),
    readFileSync(join(root, 'ASSET_STORE_SUBMISSION.md'), 'utf8'),
  );
  mkdirSync(join(temp, 'Documentation~/asset-store'), { recursive: true });

  const report = validateSubmissionPacket(temp, { submission: true, skipReleaseEvidence: true });

  assert.equal(report.status, 'fail');
  assert.ok(report.errors.includes('submission mode requires package.json to use a stable version'));
  assert.ok(report.errors.includes('submission mode requires ASSET_STORE_SUBMISSION.md to say "Ready to submit: yes"'));
});

test('submission report markdown is reviewer-readable and sanitized', () => {
  const markdown = formatSubmissionReportMarkdown(validateSubmissionPacket(root));

  assert.match(markdown, /# Greybox Unity Asset Store Submission Gate/u);
  assert.match(markdown, /Status: pass/u);
  assert.match(markdown, /screenshot-mcp-bridge\.png/u);
  assert.match(markdown, /release-readiness\.json/u);
  assert.doesNotMatch(markdown, /stdout|stderr|UNITY_PASSWORD|OPENAI_API_KEY/u);
});

test('submission packet gate catches missing review metadata and secrets', () => {
  const temp = mkdtempSync(join(tmpdir(), 'greybox-unity-submission-'));
  writeFileSync(join(temp, 'package.json'), JSON.stringify({
    name: 'com.bad.package',
    version: '1.0',
  }));
  writeFileSync(join(temp, 'ASSET_STORE_SUBMISSION.md'), [
    '# Bad packet',
    '',
    'Ready to submit: yes',
    'AI-generated package.',
    'OPENAI_API_KEY=sk-test_abcdefghijklmnopqrstuvwxyz',
  ].join('\n'));
  mkdirSync(join(temp, 'Documentation~/asset-store'), { recursive: true });

  const report = validateSubmissionPacket(temp, { submission: true });

  assert.equal(report.status, 'fail');
  assert.ok(report.errors.some((error) => error.includes('package.json name')));
  assert.ok(report.errors.some((error) => error.includes('package.json version')));
  assert.ok(report.errors.some((error) => error.includes('Publisher: Greybox Studio')));
  assert.ok(report.errors.some((error) => error.includes('Free Personal')));
  assert.ok(report.errors.some((error) => error.includes('--unity-target "2022.3.74f1=')));
  assert.ok(report.errors.some((error) => error.includes('--unity-target "2023.2.20f1=')));
  assert.ok(report.errors.some((error) => error.includes('--unity-target "6000.0.58f1=')));
  assert.ok(report.errors.some((error) => error.includes('AI-assisted')));
  assert.ok(report.errors.some((error) => error.includes('AI-assisted, not unqualified AI-generated')));
  assert.ok(report.errors.some((error) => error.includes('appears to contain a secret')));
  assert.ok(report.errors.some((error) => error.includes('visual asset not yet exported')));
});

test('submission packet gate validates visual PNG dimensions', () => {
  const temp = mkdtempSync(join(tmpdir(), 'greybox-unity-submission-visuals-'));
  writeFileSync(join(temp, 'package.json'), JSON.stringify({
    name: 'com.greybox.studio',
    version: '1.0.0',
  }));
  writeFileSync(
    join(temp, 'ASSET_STORE_SUBMISSION.md'),
    readFileSync(join(root, 'ASSET_STORE_SUBMISSION.md'), 'utf8').replace('Ready to submit: no', 'Ready to submit: yes'),
  );
  const assets = [
    ['Documentation~/asset-store/icon-1600.png', 1600, 1600],
    ['Documentation~/asset-store/cover-1950x1300.png', 1950, 1300],
    ['Documentation~/asset-store/screenshot-importers.png', 1600, 900],
    ['Documentation~/asset-store/screenshot-round-trip.png', 800, 600],
    ['Documentation~/asset-store/screenshot-mcp-bridge.png', 1600, 900],
    ['Documentation~/asset-store/screenshot-samples.png', 1600, 900],
  ];
  for (const [asset, width, height] of assets) {
    const output = join(temp, asset);
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, minimalPng(width, height));
  }

  const report = validateSubmissionPacket(temp, { submission: true });

  assert.equal(report.status, 'fail');
  assert.ok(report.errors.some((error) => (
    error.includes('screenshot-round-trip.png is 800x600, expected 1600x900')
  )));
  assert.equal(report.errors.some((error) => error.includes('visual asset not yet exported')), false);
});

test('submission mode requires real Unity release readiness evidence', () => {
  const temp = mkdtempSync(join(tmpdir(), 'greybox-unity-submission-release-'));
  writeFileSync(join(temp, 'package.json'), JSON.stringify({
    name: 'com.greybox.studio',
    version: '1.0.0',
  }));
  writeFileSync(
    join(temp, 'ASSET_STORE_SUBMISSION.md'),
    readFileSync(join(root, 'ASSET_STORE_SUBMISSION.md'), 'utf8').replace('Ready to submit: no', 'Ready to submit: yes'),
  );
  writeVisuals(temp);
  const submissionOptions = { submission: true, now: new Date('2026-05-22T00:00:00.000Z') };

  const missing = validateSubmissionPacket(temp, submissionOptions);
  assert.equal(missing.status, 'fail');
  assert.ok(missing.errors.includes('submission mode requires release readiness artifact: Validation~/artifacts/release-readiness.json'));

  const artifactPath = join(temp, 'Validation~/artifacts/release-readiness.json');
  mkdirSync(dirname(artifactPath), { recursive: true });
  writeFileSync(artifactPath, JSON.stringify({
    submission: false,
    summary: { status: 'pass' },
    targetMatrix: [],
    steps: [
      {
        id: 'unity-editmode-smoke-2022.3.74f1',
        status: 'pass',
        command: 'node Validation~/unity-import-smoke.mjs --dry-run',
      },
    ],
  }));
  const stale = validateSubmissionPacket(temp, submissionOptions);
  assert.equal(stale.status, 'fail');
  assert.ok(stale.errors.includes('release readiness artifact generatedAt must be present'));
  assert.ok(stale.errors.includes('release readiness artifact must be generated with --submission'));
  assert.ok(stale.errors.includes('release readiness artifact final Unity step must not be dry-run: unity-editmode-smoke-2022.3.74f1'));
  assert.ok(stale.errors.includes('release readiness artifact smoke step must be pinned to target Unity version: unity-editmode-smoke-2022.3.74f1'));
  assert.ok(stale.errors.includes('release readiness artifact must include passing EditMode and PlayMode smoke evidence: unity-editmode-smoke-2022.3.74f1'));
  assert.ok(stale.errors.includes('release readiness artifact must include named EditMode smoke result evidence: unity-editmode-smoke-2022.3.74f1'));
  assert.ok(stale.errors.includes('release readiness artifact must include EditMode package test assembly evidence: unity-editmode-smoke-2022.3.74f1'));
  assert.ok(stale.errors.includes('release readiness artifact must include validated EditMode result XML evidence: unity-editmode-smoke-2022.3.74f1'));
  assert.ok(stale.errors.includes('release readiness artifact must include named PlayMode smoke result evidence: unity-editmode-smoke-2022.3.74f1'));
  assert.ok(stale.errors.includes('release readiness artifact must include PlayMode package test assembly evidence: unity-editmode-smoke-2022.3.74f1'));
  assert.ok(stale.errors.includes('release readiness artifact must include validated PlayMode result XML evidence: unity-editmode-smoke-2022.3.74f1'));
  assert.ok(stale.errors.includes('release readiness artifact requires passing final Unity step: unity-editmode-smoke-2023.2.20f1'));
  assert.ok(stale.errors.includes('release readiness artifact requires passing final Unity step: unity-editmode-smoke-6000.0.58f1'));
  assert.ok(stale.errors.includes('release readiness artifact requires passing final Unity step: asset-store-unitypackage-export'));
  assert.ok(stale.errors.includes('release readiness artifact requires ready Unity target: Unity 6 6000.0.58f1'));

  writeFileSync(artifactPath, JSON.stringify({
    generatedAt: '2026-05-22T00:00:00.000Z',
    submission: true,
    summary: { status: 'pass' },
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
        status: 'ready',
        editor: '/Applications/Unity/Hub/Editor/2023.2.20f1/Unity.app/Contents/MacOS/Unity',
      },
      {
        stream: 'Unity 6',
        version: '6000.0.58f1',
        status: 'ready',
        editor: '/Applications/Unity/Hub/Editor/6000.0.58f1/Unity.app/Contents/MacOS/Unity',
      },
    ],
    steps: [
      {
        id: 'unity-editmode-smoke-2022.3.74f1',
        status: 'pass',
        unityStream: '2022.3 LTS',
        unityVersion: '2022.3.74f1',
        command: 'node Validation~/unity-import-smoke.mjs --unity /Applications/Unity/Hub/Editor/2022.3.74f1/Unity.app/Contents/MacOS/Unity --unity-version 2022.3.74f1',
        commandArgv: smokeCommandArgv('2022.3.74f1'),
        stdout: [
          'PASS Unity EditMode required smoke results: EditorVersionMatchesReleaseTarget, PackageMetadataAndAssembliesLoad, EnginePackagePreflightFailsClosedWhenPackageMetadataIsMissingOrUnsafe, LiveSyncPackageHandoffRequiresPreflightAndChecksumManifest, ConflictInboxInjectsRepresentativeRoundTripSmokeConflict, ConflictResolverCoversWebUnityManualAndBatchUnderThirtySeconds, ConflictWindowActionsPostRefreshAndClearInboxUnderThirtySeconds, PrefabSidecarResolutionPreservesCanonicalChoiceUnderThirtySeconds, McpToolDefinitionsAreProtocolShapedJson, McpBridgeHandlesProtocolAndHierarchySmoke, McpBridgeCreatesAndEditsRoundTripObjects, HudBuilderSupportsUiToolkitRenderer, PackagedSamplesImportIntoProjectAssetsUnderThirtySeconds, RequiredSamplesDocumentationAndLegalFilesArePresent',
          'PASS Unity EditMode package test assemblies: Greybox.Editor.Tests',
          'PASS Unity EditMode import smoke completed. Results: /tmp/results.xml',
          'PASS Unity PlayMode required smoke results: GeneratedPlatformerSceneRunsGameplayLoop, InputFallbackCompositionWorks',
          'PASS Unity PlayMode package test assemblies: Greybox.Runtime.Tests',
          'PASS Unity PlayMode gameplay smoke completed. Results: /tmp/playmode-results.xml',
        ].join('\n'),
        evidence: {
          editModeResultXmlPath: '/tmp/results.xml',
          editModeResultXmlBytes: 4096,
          editModeResultXmlSha256: 'a'.repeat(64),
          editModeResultXmlValidated: true,
          playModeResultXmlPath: '/tmp/playmode-results.xml',
          playModeResultXmlBytes: 2048,
          playModeResultXmlSha256: 'b'.repeat(64),
          playModeResultXmlValidated: true,
        },
      },
      {
        id: 'unity-editmode-smoke-2023.2.20f1',
        status: 'pass',
        unityStream: '2023.2',
        unityVersion: '2023.2.20f1',
        command: 'node Validation~/unity-import-smoke.mjs --unity /Applications/Unity/Hub/Editor/2023.2.20f1/Unity.app/Contents/MacOS/Unity --unity-version 2023.2.20f1',
        commandArgv: smokeCommandArgv('2023.2.20f1'),
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
          editModeResultXmlPath: '/tmp/2023.2.20f1/editmode-results.xml',
          editModeResultXmlBytes: 4096,
          editModeResultXmlSha256: 'a'.repeat(64),
          editModeResultXmlValidated: true,
          playModeSmokePassed: true,
          playModeRequiredResultsPassed: true,
          playModeRequiredResults: ['GeneratedPlatformerSceneRunsGameplayLoop', 'InputFallbackCompositionWorks'],
          playModePackageTestAssembliesPassed: true,
          playModePackageTestAssemblies: ['Greybox.Runtime.Tests'],
          playModeResultXmlPath: '/tmp/2023.2.20f1/playmode-results.xml',
          playModeResultXmlBytes: 2048,
          playModeResultXmlSha256: 'b'.repeat(64),
          playModeResultXmlValidated: true,
        },
      },
      {
        id: 'unity-editmode-smoke-6000.0.58f1',
        status: 'pass',
        unityStream: 'Unity 6',
        unityVersion: '6000.0.58f1',
        command: 'node Validation~/unity-import-smoke.mjs --unity /Applications/Unity/Hub/Editor/6000.0.58f1/Unity.app/Contents/MacOS/Unity --unity-version 6000.0.58f1',
        commandArgv: smokeCommandArgv('6000.0.58f1'),
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
          editModeResultXmlPath: '/tmp/6000.0.58f1/editmode-results.xml',
          editModeResultXmlBytes: 4096,
          editModeResultXmlSha256: 'a'.repeat(64),
          editModeResultXmlValidated: true,
          playModeSmokePassed: true,
          playModeRequiredResultsPassed: true,
          playModeRequiredResults: ['GeneratedPlatformerSceneRunsGameplayLoop', 'InputFallbackCompositionWorks'],
          playModePackageTestAssembliesPassed: true,
          playModePackageTestAssemblies: ['Greybox.Runtime.Tests'],
          playModeResultXmlPath: '/tmp/6000.0.58f1/playmode-results.xml',
          playModeResultXmlBytes: 2048,
          playModeResultXmlSha256: 'b'.repeat(64),
          playModeResultXmlValidated: true,
        },
      },
      {
        id: 'asset-store-unitypackage-export',
        status: 'pass',
        command: 'node Validation~/unity-package-export.mjs --unity /Applications/Unity/Hub/Editor/2022.3.74f1/Unity.app/Contents/MacOS/Unity',
        evidence: assetStorePackageEvidence(),
      },
    ],
  }));
  const valid = validateSubmissionPacket(temp, submissionOptions);
  assert.equal(valid.status, 'pass');

  const validArtifact = JSON.parse(readFileSync(artifactPath, 'utf8'));
  const oldArtifact = structuredClone(validArtifact);
  oldArtifact.generatedAt = '2026-05-01T00:00:00.000Z';
  writeFileSync(artifactPath, JSON.stringify(oldArtifact));
  const old = validateSubmissionPacket(temp, submissionOptions);
  assert.equal(old.status, 'fail');
  assert.ok(old.errors.includes('release readiness artifact generatedAt must be no older than 14 days'));

  const futureArtifact = structuredClone(validArtifact);
  futureArtifact.generatedAt = '2026-05-22T00:02:00.000Z';
  writeFileSync(artifactPath, JSON.stringify(futureArtifact));
  const future = validateSubmissionPacket(temp, submissionOptions);
  assert.equal(future.status, 'fail');
  assert.ok(future.errors.includes('release readiness artifact generatedAt must not be in the future'));
  writeFileSync(artifactPath, JSON.stringify(validArtifact));

  const unvalidatedArtifact = structuredClone(validArtifact);
  unvalidatedArtifact.steps[0].evidence.editModeResultXmlValidated = false;
  unvalidatedArtifact.steps[0].evidence.playModeResultXmlValidated = false;
  writeFileSync(artifactPath, JSON.stringify(unvalidatedArtifact));
  const unvalidated = validateSubmissionPacket(temp, submissionOptions);
  assert.equal(unvalidated.status, 'fail');
  assert.ok(unvalidated.errors.includes('release readiness artifact must include validated EditMode result XML evidence: unity-editmode-smoke-2022.3.74f1'));
  assert.ok(unvalidated.errors.includes('release readiness artifact must include validated PlayMode result XML evidence: unity-editmode-smoke-2022.3.74f1'));
  writeFileSync(artifactPath, JSON.stringify(validArtifact));

  const versionSpoofedArtifact = JSON.parse(readFileSync(artifactPath, 'utf8'));
  versionSpoofedArtifact.steps[1].unityVersion = '2022.3.74f1';
  versionSpoofedArtifact.steps[1].command = 'node Validation~/unity-import-smoke.mjs --unity /Applications/Unity/Hub/Editor/2022.3.74f1/Unity.app/Contents/MacOS/Unity --unity-version 2022.3.74f1';
  versionSpoofedArtifact.steps[2].command = 'node Validation~/unity-import-smoke.mjs --unity /Applications/Unity/Hub/Editor/6000.0.58f1/Unity.app/Contents/MacOS/Unity';
  delete versionSpoofedArtifact.steps[2].commandArgv;
  writeFileSync(artifactPath, JSON.stringify(versionSpoofedArtifact));
  const versionSpoofed = validateSubmissionPacket(temp, submissionOptions);
  assert.equal(versionSpoofed.status, 'fail');
  assert.ok(versionSpoofed.errors.includes('release readiness artifact smoke step must be pinned to target Unity version: unity-editmode-smoke-2023.2.20f1'));
  assert.ok(versionSpoofed.errors.includes('release readiness artifact smoke step must be pinned to target Unity version: unity-editmode-smoke-6000.0.58f1'));

  const argvSpoofedArtifact = JSON.parse(readFileSync(artifactPath, 'utf8'));
  argvSpoofedArtifact.steps[0].commandArgv = [
    'node',
    'Validation~/unity-import-smoke.mjs',
    '--unity',
    '/Applications/Unity/Hub/Editor/2022.3.74f1/Unity.app/Contents/MacOS/Unity',
    '--unity-version',
    '2022.3.74f1 --skip-if-missing',
  ];
  writeFileSync(artifactPath, JSON.stringify(argvSpoofedArtifact));
  const argvSpoofed = validateSubmissionPacket(temp, submissionOptions);
  assert.equal(argvSpoofed.status, 'fail');
  assert.ok(argvSpoofed.errors.includes('release readiness artifact smoke step must be pinned to target Unity version: unity-editmode-smoke-2022.3.74f1'));

  writeFileSync(artifactPath, JSON.stringify(validArtifact));
  const spoofedArtifact = JSON.parse(readFileSync(artifactPath, 'utf8'));
  spoofedArtifact.steps[1].unityVersion = '2023.2.20f1';
  spoofedArtifact.steps[1].command = 'node Validation~/unity-import-smoke.mjs --unity /Applications/Unity/Hub/Editor/2023.2.20f1/Unity.app/Contents/MacOS/Unity --unity-version 2023.2.20f1';
  spoofedArtifact.steps[2].command = 'node Validation~/unity-import-smoke.mjs --unity /Applications/Unity/Hub/Editor/6000.0.58f1/Unity.app/Contents/MacOS/Unity --unity-version 6000.0.58f1';
  spoofedArtifact.steps[0].stdout = [
    'PASS Unity EditMode required smoke results: EditorVersionMatchesReleaseTarget, PackageMetadataAndAssembliesLoad, NotPackagedSamplesImportIntoProjectAssetsUnderThirtySeconds',
    'PASS Unity EditMode import smoke completed. Results: /tmp/results.xml',
    'PASS Unity PlayMode required smoke results: GeneratedPlatformerSceneRunsGameplayLoop, NotInputFallbackCompositionWorks',
    'PASS Unity PlayMode gameplay smoke completed. Results: /tmp/playmode-results.xml',
  ].join('\n');
  writeFileSync(artifactPath, JSON.stringify(spoofedArtifact));
  const spoofed = validateSubmissionPacket(temp, submissionOptions);
  assert.equal(spoofed.status, 'fail');
  assert.ok(spoofed.errors.includes('release readiness artifact must include named EditMode smoke result evidence: unity-editmode-smoke-2022.3.74f1'));
  assert.ok(spoofed.errors.includes('release readiness artifact must include named PlayMode smoke result evidence: unity-editmode-smoke-2022.3.74f1'));
});

function assetStorePackageEvidence() {
  return {
    unityPackageExportPassed: true,
    unityPackageOutputPath: '/tmp/dist/com.greybox.studio.unitypackage',
    unityPackageBytes: 123456,
    unityPackageSha256: 'c'.repeat(64),
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

function smokeCommandArgv(version) {
  return [
    'node',
    'Validation~/unity-import-smoke.mjs',
    '--unity',
    `/Applications/Unity/Hub/Editor/${version}/Unity.app/Contents/MacOS/Unity`,
    '--unity-version',
    version,
  ];
}
