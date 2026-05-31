// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  assertPassingResults,
  createSmokeProject,
  discoverUnityEditors,
  playModeSmokeTestSource,
  requiredSmokeResultTests,
  requiredSmokeResultsFromOutput,
  smokeTestSource,
  unityPlayModeSmokeCommand,
  unitySmokeCommand,
} from './unity-import-smoke.mjs';

function writeResults(root, body) {
  const path = join(root, 'results.xml');
  writeFileSync(path, `<test-run>${body}</test-run>`);
  return path;
}

function assertRejectedResults(resultsFile, label) {
  const originalError = console.error;
  const messages = [];
  console.error = (message) => messages.push(String(message));
  try {
    assert.equal(assertPassingResults(resultsFile, label), false);
  } finally {
    console.error = originalError;
  }
  assert.match(messages.join('\n'), /missing required passing smoke test result/);
}

test('createSmokeProject writes a local UPM manifest and smoke test', () => {
  const root = mkdtempSync(join(tmpdir(), 'greybox-unity-smoke-test-'));
  createSmokeProject({
    root,
    packageRoot: '/tmp/greybox-unity-plugin',
    unityVersion: '2022.3.42f1',
  });
  const manifest = JSON.parse(readFileSync(join(root, 'Packages/manifest.json'), 'utf8'));
  assert.equal(manifest.dependencies['com.greybox.studio'], 'file:/tmp/greybox-unity-plugin');
  assert.equal(manifest.dependencies['com.unity.test-framework'], '1.1.33');
  assert.equal(manifest.dependencies['com.unity.inputsystem'], '1.7.0');
  assert.equal(manifest.dependencies['com.unity.ugui'], '1.0.0');
  assert.deepEqual(manifest.testables, ['com.greybox.studio']);
  assert.match(
    readFileSync(join(root, 'Assets/GreyboxSmoke/Editor/GreyboxImportSmoke.cs'), 'utf8'),
    /GreyboxImportSmoke/,
  );
  assert.match(
    readFileSync(join(root, 'Assets/GreyboxSmoke/Editor/GreyboxImportSmoke.cs'), 'utf8'),
    /ExpectedUnityVersion = "2022\.3\.42f1"/,
  );
  assert.match(
    readFileSync(join(root, 'Assets/GreyboxSmoke/Editor/GreyboxImportSmoke.cs'), 'utf8'),
    /ExpectedUnityStream = "2022\.3"/,
  );
  assert.match(
    readFileSync(join(root, 'Assets/GreyboxSmoke/PlayMode/GreyboxPlatformerPlaySmoke.cs'), 'utf8'),
    /GreyboxPlatformerPlaySmoke/,
  );
  assert.match(
    readFileSync(join(root, 'Assets/GreyboxSmoke/PlayMode/GreyboxPlatformerPlaySmoke.cs'), 'utf8'),
    /AssertInputFallbackComposition/,
  );
});

test('unitySmokeCommand uses batchmode EditMode test runner flags', () => {
  const command = unitySmokeCommand({
    unity: '/Applications/Unity/Hub/Editor/2022.3.42f1/Unity.app/Contents/MacOS/Unity',
    projectRoot: '/tmp/project',
    logFile: '/tmp/project/unity.log',
    resultsFile: '/tmp/project/results.xml',
  });
  assert.deepEqual(command.slice(1, 8), [
    '-batchmode',
    '-quit',
    '-nographics',
    '-projectPath',
    '/tmp/project',
    '-logFile',
    '/tmp/project/unity.log',
  ]);
  assert.ok(command.includes('-runTests'));
  assert.ok(command.includes('EditMode'));
});

test('unityPlayModeSmokeCommand uses the PlayMode test runner flags', () => {
  const command = unityPlayModeSmokeCommand({
    unity: '/Applications/Unity/Hub/Editor/2022.3.42f1/Unity.app/Contents/MacOS/Unity',
    projectRoot: '/tmp/project',
    logFile: '/tmp/project/playmode.log',
    resultsFile: '/tmp/project/playmode-results.xml',
  });
  assert.ok(command.includes('-runTests'));
  assert.ok(command.includes('PlayMode'));
  assert.ok(command.includes('/tmp/project/playmode-results.xml'));
});

test('assertPassingResults requires critical EditMode smoke results', () => {
  const root = mkdtempSync(join(tmpdir(), 'greybox-unity-results-editmode-'));
  const passing = writeResults(root, [
    '<test-suite type="Assembly" name="Greybox.Editor.Tests.dll" result="Passed" />',
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
  ].map((name) => `<test-case name="${name}" result="Passed" />`).join(''));
  assert.equal(assertPassingResults(passing, 'Unity EditMode import smoke'), true);

  const missingVersion = writeResults(root, [
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
  ].map((name) => `<test-case name="${name}" result="Passed" />`).join(''));
  assertRejectedResults(missingVersion, 'Unity EditMode import smoke');

  const skippedVersion = writeResults(root, [
    '<test-case name="EditorVersionMatchesReleaseTarget" result="Skipped" />',
    '<test-case name="PackageMetadataAndAssembliesLoad" result="Passed" />',
    '<test-case name="EnginePackagePreflightFailsClosedWhenPackageMetadataIsMissingOrUnsafe" result="Passed" />',
    '<test-case name="LiveSyncPackageHandoffRequiresPreflightAndChecksumManifest" result="Passed" />',
    '<test-case name="ConflictInboxInjectsRepresentativeRoundTripSmokeConflict" result="Passed" />',
    '<test-case name="ConflictResolverCoversWebUnityManualAndBatchUnderThirtySeconds" result="Passed" />',
    '<test-case name="ConflictWindowActionsPostRefreshAndClearInboxUnderThirtySeconds" result="Passed" />',
    '<test-case name="PrefabSidecarResolutionPreservesCanonicalChoiceUnderThirtySeconds" result="Passed" />',
    '<test-case name="McpToolDefinitionsAreProtocolShapedJson" result="Passed" />',
    '<test-case name="McpBridgeHandlesProtocolAndHierarchySmoke" result="Passed" />',
    '<test-case name="McpBridgeCreatesAndEditsRoundTripObjects" result="Passed" />',
    '<test-case name="HudBuilderSupportsUiToolkitRenderer" result="Passed" />',
    '<test-case name="PackagedSamplesImportIntoProjectAssetsUnderThirtySeconds" result="Passed" />',
    '<test-case name="RequiredSamplesDocumentationAndLegalFilesArePresent" result="Passed" />',
  ].join(''));
  assertRejectedResults(skippedVersion, 'Unity EditMode import smoke');
});

test('assertPassingResults requires package test assembly evidence', () => {
  const root = mkdtempSync(join(tmpdir(), 'greybox-unity-results-package-assemblies-'));
  const originalError = console.error;
  const messages = [];
  console.error = (message) => messages.push(String(message));
  try {
    const missingAssembly = writeResults(root, [
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
    ].map((name) => `<test-case name="${name}" result="Passed" />`).join(''));

    assert.equal(assertPassingResults(missingAssembly, 'Unity EditMode import smoke'), false);
  } finally {
    console.error = originalError;
  }
  assert.match(messages.join('\n'), /missing package test assembly evidence: Greybox\.Editor\.Tests/);
});

test('assertPassingResults requires package test assemblies to pass', () => {
  const root = mkdtempSync(join(tmpdir(), 'greybox-unity-results-skipped-package-assemblies-'));
  const originalError = console.error;
  const messages = [];
  console.error = (message) => messages.push(String(message));
  try {
    const skippedAssembly = writeResults(root, [
      '<test-suite type="Assembly" name="Greybox.Editor.Tests.dll" result="Skipped" />',
      '<test-case name="EditorVersionMatchesReleaseTarget" result="Passed" />',
      '<test-case name="PackageMetadataAndAssembliesLoad" result="Passed" />',
      '<test-case name="EnginePackagePreflightFailsClosedWhenPackageMetadataIsMissingOrUnsafe" result="Passed" />',
      '<test-case name="LiveSyncPackageHandoffRequiresPreflightAndChecksumManifest" result="Passed" />',
      '<test-case name="ConflictInboxInjectsRepresentativeRoundTripSmokeConflict" result="Passed" />',
      '<test-case name="ConflictResolverCoversWebUnityManualAndBatchUnderThirtySeconds" result="Passed" />',
      '<test-case name="ConflictWindowActionsPostRefreshAndClearInboxUnderThirtySeconds" result="Passed" />',
      '<test-case name="PrefabSidecarResolutionPreservesCanonicalChoiceUnderThirtySeconds" result="Passed" />',
      '<test-case name="McpToolDefinitionsAreProtocolShapedJson" result="Passed" />',
      '<test-case name="McpBridgeHandlesProtocolAndHierarchySmoke" result="Passed" />',
      '<test-case name="McpBridgeCreatesAndEditsRoundTripObjects" result="Passed" />',
      '<test-case name="HudBuilderSupportsUiToolkitRenderer" result="Passed" />',
      '<test-case name="PackagedSamplesImportIntoProjectAssetsUnderThirtySeconds" result="Passed" />',
      '<test-case name="RequiredSamplesDocumentationAndLegalFilesArePresent" result="Passed" />',
    ].join(''));

    assert.equal(assertPassingResults(skippedAssembly, 'Unity EditMode import smoke'), false);
  } finally {
    console.error = originalError;
  }
  assert.match(messages.join('\n'), /missing package test assembly evidence: Greybox\.Editor\.Tests/);
});

test('assertPassingResults rejects failed or errored Unity result summaries', () => {
  const root = mkdtempSync(join(tmpdir(), 'greybox-unity-results-failure-summary-'));
  const originalError = console.error;
  console.error = () => {};
  const failedSummary = writeResults(root, [
    '<test-suite type="Assembly" name="Greybox.Editor.Tests.dll" result="Passed" />',
    '<test-case name="EditorVersionMatchesReleaseTarget" result="Passed" />',
    '<test-case name="PackageMetadataAndAssembliesLoad" result="Passed" />',
    '<test-case name="EnginePackagePreflightFailsClosedWhenPackageMetadataIsMissingOrUnsafe" result="Passed" />',
    '<test-case name="LiveSyncPackageHandoffRequiresPreflightAndChecksumManifest" result="Passed" />',
    '<test-case name="ConflictInboxInjectsRepresentativeRoundTripSmokeConflict" result="Passed" />',
    '<test-case name="ConflictResolverCoversWebUnityManualAndBatchUnderThirtySeconds" result="Passed" />',
    '<test-case name="ConflictWindowActionsPostRefreshAndClearInboxUnderThirtySeconds" result="Passed" />',
    '<test-case name="PrefabSidecarResolutionPreservesCanonicalChoiceUnderThirtySeconds" result="Passed" />',
    '<test-case name="McpToolDefinitionsAreProtocolShapedJson" result="Passed" />',
    '<test-case name="McpBridgeHandlesProtocolAndHierarchySmoke" result="Passed" />',
    '<test-case name="McpBridgeCreatesAndEditsRoundTripObjects" result="Passed" />',
    '<test-case name="HudBuilderSupportsUiToolkitRenderer" result="Passed" />',
    '<test-case name="PackagedSamplesImportIntoProjectAssetsUnderThirtySeconds" result="Passed" />',
    '<test-case name="RequiredSamplesDocumentationAndLegalFilesArePresent" result="Passed" />',
    '<test-suite name="Greybox.Runtime.Tests.dll" result="Error" />',
  ].join(''));

  try {
    assert.equal(assertPassingResults(failedSummary, 'Unity EditMode import smoke'), false);
  } finally {
    console.error = originalError;
  }
});

test('assertPassingResults requires exact smoke test-case names', () => {
  const root = mkdtempSync(join(tmpdir(), 'greybox-unity-results-exact-name-'));
  const impostor = writeResults(root, [
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
    'NotPackagedSamplesImportIntoProjectAssetsUnderThirtySeconds',
    'RequiredSamplesDocumentationAndLegalFilesArePresent',
  ].map((name) => `<test-case name="${name}" result="Passed" />`).join(''));

  assertRejectedResults(impostor, 'Unity EditMode import smoke');
});

test('assertPassingResults accepts Unity-qualified smoke test-case names', () => {
  const root = mkdtempSync(join(tmpdir(), 'greybox-unity-results-qualified-name-'));
  const passing = writeResults(root, [
    '<test-suite type="Assembly" name="Greybox.Editor.Tests.dll" result="Passed" />',
    ...requiredSmokeResultTests('Unity EditMode import smoke').map((name) => {
    return `<test-case name="Greybox.Validation.GreyboxImportSmoke.${name}" fullname="Greybox.Validation.GreyboxImportSmoke.${name}" result="Passed" />`;
  })].join(''));

  assert.equal(assertPassingResults(passing, 'Unity EditMode import smoke'), true);
});

test('requiredSmokeResultTests exposes the submission evidence contract', () => {
  assert.deepEqual(requiredSmokeResultTests('Unity EditMode import smoke'), [
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
  ]);
  assert.deepEqual(requiredSmokeResultTests('Unity PlayMode gameplay smoke'), [
    'GeneratedPlatformerSceneRunsGameplayLoop',
    'InputFallbackCompositionWorks',
  ]);
});

test('requiredSmokeResultsFromOutput requires exact comma-delimited names', () => {
  const spoofed = [
    'PASS Unity EditMode required smoke results: EditorVersionMatchesReleaseTarget, PackageMetadataAndAssembliesLoad, NotPackagedSamplesImportIntoProjectAssetsUnderThirtySeconds',
    'PASS Unity PlayMode required smoke results: GeneratedPlatformerSceneRunsGameplayLoop, NotInputFallbackCompositionWorks',
  ].join('\n');

  assert.deepEqual(
    requiredSmokeResultsFromOutput(spoofed, 'Unity EditMode import smoke'),
    ['EditorVersionMatchesReleaseTarget', 'PackageMetadataAndAssembliesLoad'],
  );
  assert.deepEqual(
    requiredSmokeResultsFromOutput(spoofed, 'Unity PlayMode gameplay smoke'),
    ['GeneratedPlatformerSceneRunsGameplayLoop'],
  );
});

test('assertPassingResults requires the PlayMode gameplay loop result', () => {
  const root = mkdtempSync(join(tmpdir(), 'greybox-unity-results-playmode-'));
  const passing = writeResults(root, [
    '<test-suite type="Assembly" name="Greybox.Runtime.Tests.dll" result="Passed" />',
    '<test-case name="GeneratedPlatformerSceneRunsGameplayLoop" result="Passed" />',
    '<test-case name="InputFallbackCompositionWorks" result="Passed" />',
  ].join(''));
  assert.equal(assertPassingResults(passing, 'Unity PlayMode gameplay smoke'), true);

  const wrongPlayMode = writeResults(root, [
    '<test-case name="GeneratedPlatformerSceneRunsGameplayLoop" result="Passed" />',
    '<test-case name="SomeOtherPlayModeSmoke" result="Passed" />',
  ].join(''));
  assertRejectedResults(wrongPlayMode, 'Unity PlayMode gameplay smoke');

  const skippedPlayMode = writeResults(
    root,
    [
      '<test-case name="GeneratedPlatformerSceneRunsGameplayLoop" result="Passed" />',
      '<test-case name="InputFallbackCompositionWorks" result="Skipped" />',
    ].join(''),
  );
  assertRejectedResults(skippedPlayMode, 'Unity PlayMode gameplay smoke');
});

test('dry-run generates the smoke project without requiring Unity discovery', () => {
  const root = mkdtempSync(join(tmpdir(), 'greybox-unity-smoke-dry-run-test-'));
  const script = join(dirname(fileURLToPath(import.meta.url)), 'unity-import-smoke.mjs');
  const output = execFileSync(process.execPath, [
    script,
    '--dry-run',
    '--project-path',
    root,
  ], {
    encoding: 'utf8',
    env: {
      ...process.env,
      GREYBOX_UNITY_SMOKE_DISABLE_DISCOVERY: '1',
      UNITY_EDITOR: '',
    },
  });
  assert.match(output, /DRY_RUN/);
  assert.match(output, /DRY_RUN_EDITMODE/);
  assert.match(output, /DRY_RUN_PLAYMODE/);
  assert.match(output, /\/path\/to\/Unity/);
  assert.match(readFileSync(join(root, 'Assets/GreyboxSmoke/Editor/GreyboxImportSmoke.cs'), 'utf8'), /under 30 seconds/);
  assert.match(
    readFileSync(join(root, 'Assets/GreyboxSmoke/PlayMode/GreyboxPlatformerPlaySmoke.cs'), 'utf8'),
    /GeneratedPlatformerSceneRunsGameplayLoop/,
  );
});

test('discoverUnityEditors expands configured Unity Hub editor roots', () => {
  const root = mkdtempSync(join(tmpdir(), 'greybox-unity-hub-discovery-'));
  const unity2022 = join(root, '2022.3.74f1', 'Unity.app', 'Contents', 'MacOS', 'Unity');
  const unity6 = join(root, '6000.0.58f1', 'Unity.app', 'Contents', 'MacOS', 'Unity');
  mkdirSync(dirname(unity2022), { recursive: true });
  mkdirSync(dirname(unity6), { recursive: true });
  writeFileSync(unity2022, '');
  writeFileSync(unity6, '');

  const editors = discoverUnityEditors({
    env: { GREYBOX_UNITY_HUB_EDITORS: root },
    platform: 'darwin',
  });

  assert.ok(editors.includes(unity2022));
  assert.ok(editors.includes(unity6));
  assert.ok(editors.every((editor) => !editor.includes('*')));
});

test('discoverUnityEditors honors explicit editor lists before discovered Hub installs', () => {
  const root = mkdtempSync(join(tmpdir(), 'greybox-unity-explicit-discovery-'));
  const explicit = join(root, 'CustomUnity');
  const unityHub = join(root, '2023.2.20f1', 'Unity.app', 'Contents', 'MacOS', 'Unity');
  mkdirSync(dirname(unityHub), { recursive: true });
  writeFileSync(explicit, '');
  writeFileSync(unityHub, '');

  const editors = discoverUnityEditors({
    env: {
      GREYBOX_UNITY_EDITORS: explicit,
      GREYBOX_UNITY_HUB_EDITORS: root,
    },
    platform: 'darwin',
  });

  assert.equal(editors[0], explicit);
  assert.ok(editors.includes(unityHub));
});

test('discoverUnityEditors splits editor lists with the platform path delimiter', () => {
  const root = mkdtempSync(join(tmpdir(), 'greybox-unity-list-discovery-'));
  const first = join(root, 'UnityA');
  const second = join(root, 'UnityB');
  writeFileSync(first, '');
  writeFileSync(second, '');

  const editors = discoverUnityEditors({
    env: { UNITY_EDITORS: [first, second].join(delimiter) },
    platform: process.platform,
  });

  assert.deepEqual(editors.slice(0, 2), [first, second]);
});

test('smoke test source checks core Greybox runtime and editor types', () => {
  const source = smokeTestSource('6000.0.58f1');
  assert.match(source, /EditorVersionMatchesReleaseTarget/);
  assert.match(source, /ExpectedUnityVersion = "6000\.0\.58f1"/);
  assert.match(source, /ExpectedUnityStream = "6000\.0"/);
  assert.match(source, /Application\.unityVersion/);
  assert.match(source, /relabeled editor path/);
  assert.match(source, /Greybox\.Runtime\.GreyboxConfig/);
  assert.match(source, /Greybox\.Runtime\.GreyboxPlatformerSamplePlayer/);
  assert.match(source, /Greybox\.Runtime\.GreyboxPlatformerSampleHazard/);
  assert.match(source, /Greybox\.Runtime\.GreyboxPlatformerSampleCheckpoint/);
  assert.match(source, /Greybox\.Runtime\.GreyboxPlatformerSampleGoal/);
  assert.match(source, /Greybox\.Runtime\.GreyboxPlatformerSampleHud/);
  assert.match(source, /Greybox\.Runtime\.GreyboxPlatformerSampleCollectible/);
  assert.match(source, /Greybox\.Runtime\.GreyboxUiToolkitHud/);
  assert.match(source, /Greybox\.Editor\.Export\.GreyboxAssetStorePackageExporter/);
  assert.match(source, /HudBuilderSupportsUiToolkitRenderer/);
  assert.match(source, /AssertUiToolkitHudBuilder/);
  assert.match(source, /AssertUiToolkitSlotPositioning/);
  assert.match(source, /System\.Reflection/);
  assert.match(source, /BindingFlags\.NonPublic/);
  assert.match(source, /marginLeft/);
  assert.match(source, /-360f/);
  assert.match(source, /GetComponent<UIDocument>/);
  assert.match(source, /PanelSettings/);
  assert.match(source, /Greybox\.Editor\.Samples\.Greybox2DPlatformerSampleBuilder/);
  assert.match(source, /Greybox\.Editor\.Sync\.DiffApplier/);
  assert.match(source, /Greybox\.Editor\.Sync\.GreyboxArtifactRefresher/);
  assert.match(source, /web-to-Unity PullAndRefreshFromEvent/);
  assert.match(source, /Greybox\.Editor\.Sync\.GreyboxConflictInbox/);
  assert.match(source, /Greybox\.Editor\.Sync\.GreyboxConflictResolver/);
  assert.match(source, /Greybox\.Editor\.Sync\.GreyboxPrefabSidecarResolver/);
  assert.match(source, /Greybox\.Editor\.Windows\.GreyboxConflictWindow/);
  assert.match(source, /ConflictInboxInjectsRepresentativeRoundTripSmokeConflict/);
  assert.match(source, /ConflictResolverCoversWebUnityManualAndBatchUnderThirtySeconds/);
  assert.match(source, /ConflictWindowActionsPostRefreshAndClearInboxUnderThirtySeconds/);
  assert.match(source, /InvokeAcceptWebMerge/);
  assert.match(source, /InvokeAcceptUnityMerge/);
  assert.match(source, /InvokeAcceptManualMerge/);
  assert.match(source, /InvokeAcceptBatchMerge/);
  assert.match(source, /InvokeManualDraft/);
  assert.match(source, /PrefabSidecarResolutionPreservesCanonicalChoiceUnderThirtySeconds/);
  assert.match(source, /GreyboxPrefabSidecarResolver\.AcceptIncoming/);
  assert.match(source, /GreyboxPrefabSidecarResolver\.KeepCanonical/);
  assert.match(source, /Prefab sidecar review actions should complete in under 30 seconds/);
  assert.match(source, /GreyboxConflictResolution\.Manual/);
  assert.match(source, /Representative round-trip conflicts should resolve in under 30 seconds/);
  assert.match(source, /RecordExampleRoundTripConflict/);
  assert.match(source, /Greybox\.Editor\.McpBridge\.GreyboxMcpServer/);
  assert.match(source, /McpBridgeHandlesProtocolAndHierarchySmoke/);
  assert.match(source, /InvokeMcpJsonRpc/);
  assert.match(source, /greybox-unity-mcp/);
  assert.match(source, /McpBridgeCreatesAndEditsRoundTripObjects/);
  assert.match(source, /InvokeMcpTool/);
  assert.match(source, /PendingMcpRoundTripEditCount/);
  assert.match(source, /GreyboxLevelConnection/);
  assert.match(source, /GreyboxSpawnPoint/);
  assert.match(source, /GreyboxObjective/);
  assert.match(source, /GreyboxHazard/);
  assert.match(source, /GreyboxLevelRoom/);
  assert.match(source, /GreyboxEncounter/);
  assert.match(source, /GreyboxLevelTilemap/);
  assert.match(source, /Tilemap/);
  assert.match(source, /TileBase/);
  assert.match(source, /GreyboxPlatformerSampleGoal/);
  assert.match(source, /GreyboxPlatformerSampleCheckpoint/);
  assert.match(source, /GreyboxPlatformerSampleCollectible/);
  assert.match(source, /connectionDefault/);
  assert.match(source, /spawnDefault/);
  assert.match(source, /objectiveDefault/);
  assert.match(source, /hazardDefault/);
  assert.match(source, /roomDefault/);
  assert.match(source, /encounterDefault/);
  assert.match(source, /tileDefault/);
  assert.match(source, /generatedTileDefault/);
  assert.match(source, /goalDefault/);
  assert.match(source, /checkpointDefault/);
  assert.match(source, /coinDefault/);
  assert.match(source, /createdActor\.ActorId/);
  assert.match(source, /createdConnection\.ConnectionType/);
  assert.match(source, /createdSpawn\.SpawnRadius/);
  assert.match(source, /createdObjective\.ObjectiveType/);
  assert.match(source, /createdHazard\.TickSeconds/);
  assert.match(source, /createdRoom\.Size/);
  assert.match(source, /createdEncounter\.EncounterType/);
  assert.match(source, /createdTile\.TileType/);
  assert.match(source, /generatedSmokeTile\.sprite/);
  assert.match(source, /createdGoal\.SourceArtifactKind/);
  assert.match(source, /createdCheckpoint\.RespawnPoint/);
  assert.match(source, /createdCoin\.SourceObjectiveDisplayName/);
  assert.match(source, /GetComponent<BoxCollider2D>\(\)\.isTrigger/);
  assert.match(source, /GetComponent<CircleCollider2D>\(\)\.isTrigger/);
  assert.match(source, /roundTripValue"\]\.Value<int>\("health"\)/);
  assert.match(source, /roundTripValue"\]\.Value<float>\("moveSpeed"\)/);
  assert.match(source, /roundTripValue"\]\.Value<float>\("travelCost"\)/);
  assert.match(source, /roundTripValue"\]\.Value<float>\("spawnRadius"\)/);
  assert.match(source, /roundTripValue"\]\.Value<string>\("objectiveType"\)/);
  assert.match(source, /roundTripValue"\]\.Value<int>\("requiredCount"\)/);
  assert.match(source, /roundTripValue"\]\.Value<float>\("tickSeconds"\)/);
  assert.match(source, /roundTripValue"\]\.Value<string>\("roomType"\)/);
  assert.match(source, /roundTripValue"\]\.Value<string>\("encounterType"\)/);
  assert.match(source, /roundTripValue"\]\.Value<float>\("radius"\)/);
  assert.match(source, /roundTripValue"\]\.Value<string>\("type"\)/);
  assert.match(source, /roundTripValue"\]\.Value<int>\("x"\)/);
  assert.match(source, /roundTripValue"\]\.Value<bool>\("isHazard"\)/);
  assert.match(source, /roundTripValue"\]\.Value<bool>\("blocksMovement"\)/);
  assert.match(source, /roundTripValue"\]\.Value<int>\("maxActivations"\)/);
  assert.match(source, /roundTripValue"\]\.Value<bool>\("spawnOnStart"\)/);
  assert.match(source, /roundTripValue"\]\.Value<string>\("sourceObjectiveType"\)/);
  assert.match(source, /GetTile\(new Vector3Int\(3, 4, 0\)\)/);
  assert.match(source, /TileTextures\.Length/);
  assert.match(source, /TileSprites\.Length/);
  assert.match(source, /sceneDirty/);
  assert.match(source, /SmokeBossMesh/);
  assert.match(source, /unity\.assignAsset/);
  assert.match(source, /meshAssetPath/);
  assert.match(source, /child\.gameObject\.scene\.isDirty/);
  assert.match(source, /EnginePackagePreflightFailsClosedWhenPackageMetadataIsMissingOrUnsafe/);
  assert.match(source, /LiveSyncPackageHandoffRequiresPreflightAndChecksumManifest/);
  assert.match(source, /ShouldRequestPackageRefresh/);
  assert.match(source, /ExtractEnginePackageZip/);
  assert.match(source, /local-private-runtime/);
  assert.match(source, /ParseEnginePackagePreflight/);
  assert.match(source, /Greybox\.Editor\.Generation\.AddressablesTagger/);
  assert.match(source, /Greybox\.Editor\.McpBridge/);
  assert.match(source, /Newtonsoft\.Json\.Linq/);
});

test('smoke test source imports packaged Greybox sample artifacts', () => {
  const source = smokeTestSource();
  assert.match(source, /PackagedSamplesImportIntoProjectAssetsUnderThirtySeconds/);
  assert.match(source, /RequiredSamplesDocumentationAndLegalFilesArePresent/);
  assert.match(source, /"platformer"/);
  assert.match(source, /"roguelike"/);
  assert.match(source, /"mobile-idle"/);
  assert.match(source, /\.gameview/);
  assert.match(source, /\.design/);
  assert.match(source, /\.levelboard/);
  assert.match(source, /GreyboxArtifactKind\.GameViewport/);
  assert.match(source, /GreyboxImportReceipt/);
  assert.match(source, /GreyboxImportReceiptExporter/);
  assert.match(source, /GreyboxArtBiblePalette/);
  assert.match(source, /OfType<Material>/);
  assert.match(source, /EnsureAddressablesSettings/);
  assert.match(source, /AddressablesTagger\.FlushPending/);
  assert.match(source, /AssertPlayablePlatformerScene/);
  assert.match(source, /AssertArtifactProvenance/);
  assert.match(source, /AssertImportedArtifact/);
  assert.match(source, /AssertImportReceipt/);
  assert.match(source, /ImportReceiptPath/);
  assert.match(source, /Assets\/Greybox\/Generated\//);
  assert.match(source, /Imported Greybox content should create a durable import receipt asset/);
  assert.match(source, /GeneratorCredit/);
  assert.match(source, /HumanDesignerCredit/);
  assert.match(source, /AiDisclosure/);
  assert.match(source, /Greybox2DPlatformerSampleBuilder\.BuildScene/);
  assert.match(source, /GeneratedScenePath/);
  assert.match(source, /EditorBuildSettings\.scenes/);
  assert.match(source, /PlayableObjectCount/);
  assert.match(source, /PlayerAttackDamage/);
  assert.match(source, /PlayerAttackRange/);
  assert.match(source, /PlayerAttackCooldownSeconds/);
  assert.match(source, /PlayerJumpImpulse/);
  assert.match(source, /Greybox2DPlatformerSampleBuilder\.SampleCoinCount/);
  assert.match(source, /HUD coin target should be driven by the imported coin-line objective count/);
  assert.match(source, /Playable exit should require the authored coin-line target before completion/);
  assert.match(source, /RequiredCoins/);
  assert.match(source, /IsLockedByCoins/);
  assert.match(source, /FindObjectOfType<GreyboxPlatformerSampleHud>/);
  assert.match(source, /Playable player width should be driven by authored gameview actor radius/);
  assert.match(source, /Playable player jump should be driven by authored gameview actor jump impulse/);
  assert.match(source, /Playable player abilities should be driven by authored gameview actor metadata/);
  assert.match(source, /Playable player should expose authored double-jump ability/);
  assert.match(source, /Playable enemy width should be driven by authored gameview actor radius/);
  assert.match(source, /Playable enemy behavior should be driven by authored gameview actor metadata/);
  assert.match(source, /Guard-aggro authored behavior should keep the sample enemy stationary/);
  assert.match(source, /Playable hazard width should be driven by authored gameview hazard radius/);
  assert.match(source, /Playable hazard tick cadence should be driven by authored gameview hazard timing/);
  assert.match(source, /Playable hazard knockback should be driven by authored gameview hazard knockback/);
  assert.match(source, /Playable spike hazard should preserve authored lethal flag/);
  assert.match(source, /Playable checkpoint width should be driven by authored gameview checkpoint radius/);
  assert.match(source, /Playable checkpoint cooldown should be driven by authored gameview spawn metadata/);
  assert.match(source, /Playable checkpoint should preserve authored spawn-on-start metadata/);
  assert.match(source, /Playable goal width should be driven by authored gameview objective radius/);
  assert.match(source, /Playable goal should preserve authored gameview objective time limit/);
  assert.match(source, /Playable goal should preserve authored primary objective flag/);
  assert.match(source, /FindObjectOfType<GreyboxPlatformerSampleCheckpoint>/);
  assert.match(source, /FindObjectsOfType<GreyboxPlatformerSampleCollectible>/);
  assert.match(source, /SourceArtifactKind/);
  assert.match(source, /gameview\.actor/);
  assert.match(source, /gameview\.hazard/);
  assert.match(source, /gameview\.checkpoint/);
  assert.match(source, /gameview\.objective/);
  assert.match(source, /gameview\.camera/);
  assert.match(source, /SourceObjectiveDisplayName/);
  assert.match(source, /collectible/);
  assert.match(source, /SampleCoinCount \+ result\.GameViewEnemyCount \+ result\.GameViewHazardCount \+ 4/);
  assert.match(source, /Readable Coin Line/);
  assert.match(source, /GameViewSourcePath/);
  assert.match(source, /platformer\.gameview/);
  assert.match(source, /ArtBibleSourcePath/);
  assert.match(source, /platformer\.design/);
  assert.match(source, /SourceTaggedRuntimeObjectCount/);
  assert.match(source, /manifest\.GeneratorCredit/);
  assert.match(source, /manifest\.HumanDesignerCredit/);
  assert.match(source, /manifest\.AiDisclosure/);
  assert.match(source, /GameViewSourceHash/);
  assert.match(source, /ArtBibleSourceHash/);
  assert.match(source, /ImportChainProvenanceReady/);
  assert.match(source, /GreyboxPlatformerSampleRunReset/);
  assert.match(source, /Playable sample should include a one-click run reset controller/);
  assert.match(source, /Run reset should capture the imported initial spawn/);
  assert.match(source, /Run reset should be keyboard-accessible for Asset Store reviewers/);
  assert.match(source, /KeyCode\.R/);
  assert.match(source, /ComposeResetPressed\(true, false\)/);
  assert.match(source, /ComposeResetPressed\(false, true\)/);
  assert.match(source, /System\.Diagnostics\.Stopwatch\.StartNew\(\)/);
  assert.match(source, /importTimer\.Elapsed\.TotalSeconds,\s*30d/);
  assert.match(source, /under 30 seconds/);
  assert.match(source, /AddressableAssetSettingsDefaultObject\.GetSettings\(true\)/);
  assert.match(source, /AssertAddressable/);
  assert.match(source, /AddressablesTagger\.GeneratedGroupName/);
  assert.match(source, /AddressablesTagger\.GeneratedLabel/);
  assert.match(source, /AddressablesTagger\.LabelForKind/);
  assert.match(source, /AssertSampleSceneAddressable/);
  assert.match(source, /AddressablesTagger\.SampleSceneLabel/);
  assert.match(source, /AddressablesTagger\.PlatformerSampleLabel/);
  assert.match(source, /Greybox generated sample scene should be Addressable/);
});

test('addressables tagger bootstraps settings without building content during import', () => {
  const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../Editor/Generation/AddressablesTagger.cs'), 'utf8');
  assert.match(source, /AddressableAssetSettingsDefaultObject\.GetSettings\(true\)/);
  assert.match(source, /settings\.CreateGroup\(GeneratedGroupName/);
  assert.match(source, /settings\.AddLabel\(currentLabel/);
  assert.match(source, /settings\.CreateOrMoveEntry\(guid, group/);
  assert.doesNotMatch(source, /BuildPlayerContent/);
});

test('playmode smoke source validates the generated platformer gameplay loop', () => {
  const source = playModeSmokeTestSource();
  assert.match(source, /GreyboxPlatformerPlaySmoke/);
  assert.match(source, /GeneratedPlatformerSceneRunsGameplayLoop/);
  assert.match(source, /InputFallbackCompositionWorks/);
  assert.match(source, /SceneManager\.LoadScene\("Greybox2DPlatformerSample"/);
  assert.match(source, /AssertInputFallbackComposition/);
  assert.match(source, /QueueInput\(1f, false\)/);
  assert.match(source, /player\.HasAbility\("double-jump"\)/);
  assert.match(source, /player\.JumpCount/);
  assert.match(source, /player\.LastUsedAbilityId/);
  assert.match(source, /Player double jump should be driven by authored ability metadata/);
  assert.match(source, /Player double jump should expose the authored ability id/);
  assert.match(source, /GreyboxPlatformerSampleHazard/);
  assert.match(source, /hazard\.Apply\(player, 10f\)/);
  assert.match(source, /hazard\.Apply\(player, 10\.2f\)/);
  assert.match(source, /hazard\.Apply\(player, 10\.7f\)/);
  assert.match(source, /player\.LastDamageTaken/);
  assert.match(source, /player\.LastKnockbackImpulse/);
  assert.match(source, /player\.LastStatusEffect/);
  assert.match(source, /hazard\.LastAppliedEffect/);
  assert.match(source, /hazard\.AffectsPlayer\(player\)/);
  assert.match(source, /player\.LastDamageSourceKind/);
  assert.match(source, /player\.LastDamageSourceId/);
  assert.match(source, /player\.CurrentHearts/);
  assert.match(source, /Hazard damage should reduce authored player hearts/);
  assert.match(source, /HUD loot slot should start from imported player inventory state/);
  assert.match(source, /Hazard should preserve imported knockback on the player/);
  assert.match(source, /Hazard should preserve imported status effect on the player/);
  assert.match(source, /Hazard affected tags should include playable player identity/);
  assert.match(source, /Hazard tick cadence should prevent duplicate immediate damage/);
  assert.match(source, /pit_gap_a/);
  assert.match(source, /GreyboxPlatformerSampleCheckpoint/);
  assert.match(source, /checkpoint\.CanActivatePlayer\(player\)/);
  assert.match(source, /Checkpoint actorIds should reject non-authored player actors/);
  assert.match(source, /Rejected checkpoint activation should not consume authored activations/);
  assert.match(source, /checkpoint\.Activate\(player, 20f\)/);
  assert.match(source, /checkpoint\.Activate\(player, 20\.25f\)/);
  assert.match(source, /Checkpoint should retain authored activation count after first use/);
  assert.match(source, /Checkpoint should respect authored spawn cooldown before reactivation/);
  assert.match(source, /CHECKPOINT FLAG SET/);
  assert.match(source, /GreyboxPlatformerSampleEnemy/);
  assert.match(source, /enemy\.Health/);
  assert.match(source, /enemy\.Damage/);
  assert.match(source, /enemy\.AttackRange/);
  assert.match(source, /enemy\.Behavior/);
  assert.match(source, /enemy\.CanPatrol\(\)/);
  assert.match(source, /enemy\.CanAggro\(\)/);
  assert.match(source, /enemy\.CanTargetPlayer\(player\)/);
  assert.match(source, /Same-faction enemy contact should not damage the player/);
  assert.match(source, /enemy\.HasAbility\("bump"\)/);
  assert.match(source, /enemy\.LastUsedAbilityId/);
  assert.match(source, /Sample enemy patrol radius should stay authored independently from attack range/);
  assert.match(source, /Sample enemy aggro radius should stay authored from the imported detection radius/);
  assert.match(source, /Sample enemy behavior should stay authored from the imported gameview actor/);
  assert.match(source, /Enemy contact should expose the authored ability used for the hit/);
  assert.match(source, /enemy\.IsPlayerInAggroRange\(player\)/);
  assert.match(source, /enemy\.IsPlayerInRange\(player\)/);
  assert.match(source, /enemy\.AttackCooldownSeconds/);
  assert.match(source, /enemy\.Apply\(player, 12f\)/);
  assert.match(source, /slime_patrol_a/);
  assert.match(source, /Enemy damage should drive the imported HUD health state down to zero/);
  assert.match(source, /Enemy contact cooldown should stay authored from the imported gameview actor/);
  assert.match(source, /Enemy contact damage should respect authored attack cooldown/);
  assert.match(source, /Enemy contact damage should respect authored detection radius/);
  assert.match(source, /Enemy contact damage should respect authored attack range/);
  assert.match(source, /enemy\.IsAttackReady\(12\.75f\)/);
  assert.match(source, /player\.ResetHealth\(\)/);
  assert.match(source, /enemy\.ResetEnemy\(\)/);
  assert.match(source, /Player attack damage should stay authored from the imported gameview actor/);
  assert.match(source, /Player attack cooldown should stay authored from the imported gameview actor/);
  assert.match(source, /player\.FindNearestAttackableEnemy\(\)/);
  assert.match(source, /player\.Simulate\(0f, false, true, 30f\)/);
  assert.match(source, /Player attack input should target the nearest authored enemy inside range/);
  assert.match(source, /Input-driven player attack should damage the imported enemy/);
  assert.match(source, /Input-driven player attack should preserve deterministic simulation time/);
  assert.match(source, /Input-driven player attack should preserve authored enemy provenance/);
  assert.match(source, /player\.Attack\(enemy, player\.LastAttackTimeSeconds \+ 0\.25f\)/);
  assert.match(source, /Player attack input should respect authored attack cooldown/);
  assert.match(source, /Cooldown-blocked player attacks should not inflate attack count/);
  assert.match(source, /player\.IsAttackReady\(player\.LastAttackTimeSeconds \+ player\.AttackCooldownSeconds\)/);
  assert.match(source, /player\.Attack\(enemy, player\.LastAttackTimeSeconds \+ player\.AttackCooldownSeconds\)/);
  assert.match(source, /Second authored player attack should defeat the imported enemy/);
  assert.match(source, /Defeated imported enemy should reject extra player attacks/);
  assert.match(source, /Player should track authored defeated enemy ids for target objectives/);
  assert.match(source, /enemy\.LastLootDropId/);
  assert.match(source, /Defeating an imported enemy should spawn a stable authored loot drop id/);
  assert.match(source, /Defeating an imported enemy should spawn a playable loot pickup/);
  assert.match(source, /Enemy loot drops should render at a stable playable pickup scale/);
  assert.match(source, /Enemy loot drops should render visibly in the generated scene/);
  assert.match(source, /Enemy loot drops should inherit an art-bible coin material/);
  assert.match(source, /Enemy loot drops should use the playable collectible runtime/);
  assert.match(source, /gameview\.loot-table/);
  assert.match(source, /Enemy loot drops should be classified separately from objective coins/);
  assert.match(source, /Enemy loot should not increment player inventory before collection/);
  assert.match(source, /Enemy loot drop should be collectible without affecting objective coin gates/);
  assert.match(source, /Enemy loot collection should update player inventory state/);
  assert.match(source, /HUD loot slot should reflect collected enemy loot/);
  assert.match(source, /Goal target ids should unlock when authored enemies are defeated/);
  assert.match(source, /Defeated-enemy target goals should become completable/);
  assert.match(source, /Resetting combat progress should clear defeated target ids for replay/);
  assert.match(source, /Defeated-enemy target goals should relock after combat progress resets/);
  assert.match(source, /player\.LastCollectedLootTableId/);
  assert.match(source, /player\.AttackCount/);
  assert.match(source, /player\.DefeatedEnemyCount/);
  assert.match(source, /player\.LastAttackedEnemyId/);
  assert.match(source, /player\.LastDefeatedEnemyLootTableId/);
  assert.match(source, /Defeating an imported enemy should expose authored loot-table provenance/);
  assert.match(source, /enemy\.Defeated/);
  assert.match(source, /enemy\.CurrentHealth/);
  assert.match(source, /Defeated imported enemy should leave the playable scene/);
  assert.match(source, /GreyboxPlatformerSampleCollectible/);
  assert.match(source, /Assert\.AreEqual\(24, coins\.Length/);
  assert.match(source, /Playable HUD should use the authored coin-line objective count/);
  assert.match(source, /SourceObjectiveType/);
  assert.match(source, /SourceObjectiveId/);
  assert.match(source, /coin_line/);
  assert.match(source, /Goal should stay locked before authored target objective coins are collected/);
  assert.match(source, /HUD should track collected authored source objective ids/);
  assert.match(source, /Goal target ids should unlock after collecting a coin from the authored target objective/);
  assert.match(source, /Duplicate coin ids should not inflate the sample counter/);
  assert.match(source, /GreyboxPlatformerSampleGoal/);
  assert.match(source, /Generated goal should require the authored coin-line objective count/);
  assert.match(source, /Generated goal should retain the authored objective reward/);
  assert.match(source, /Generated goal should retain the authored objective time limit/);
  assert.match(source, /Goal should remain completable before the authored objective time limit/);
  assert.match(source, /Goal should expire after the authored objective time limit/);
  assert.match(source, /Goal should stay locked before every authored coin is collected/);
  assert.match(source, /Goal should reject completion while authored coins remain/);
  assert.match(source, /Remaining authored coins should be collectible before exit/);
  assert.match(source, /Goal should unlock after every authored coin is collected/);
  assert.match(source, /Goal should reject completion after authored time limit expires/);
  assert.match(source, /goal\.MarkReached\(player, hud, 89f\)/);
  assert.match(source, /Goal completion should expose the authored objective reward/);
  assert.match(source, /sceneReset\.ResetSampleRun\(\)/);
  assert.match(source, /Generated scene should include a one-click sample run reset controller/);
  assert.match(source, /Sample run reset should clear awarded goal progress/);
  assert.match(source, /Sample run reset should clear collected loot progress/);
  assert.match(source, /Sample run reset should return player to imported spawn/);
  assert.match(source, /Sample run reset should reset imported enemies/);
  assert.match(source, /Sample run reset should reset imported objective coins/);
  assert.match(source, /EXIT GATE REACHED/);
});

test('playmode smoke source validates Input System and legacy keyboard fallback composition', () => {
  const source = playModeSmokeTestSource();
  assert.match(source, /AssertInputFallbackComposition/);
  assert.match(source, /ComposeHorizontal\(true, false, false, true\)/);
  assert.match(source, /ComposeHorizontal\(false, true, true, false\)/);
  assert.match(source, /ComposeHorizontal\(false, false, true, false\)/);
  assert.match(source, /ComposeHorizontal\(false, false, false, true\)/);
  assert.match(source, /ComposeJumpPressed\(true, false\)/);
  assert.match(source, /ComposeJumpPressed\(false, true\)/);
});

test('smoke test source validates MCP tools JSON inside Unity', () => {
  const source = smokeTestSource();
  assert.match(source, /McpToolDefinitionsAreProtocolShapedJson/);
  assert.match(source, /JObject\.Parse\(McpToolDefinitions\.ToolsJson\(\)\)/);
  assert.match(source, /AssertToolSchema\(tools, "unity\.getSceneHierarchy"\)/);
  assert.match(source, /AssertToolSchema\(tools, "unity\.captureGameViewScreenshot"\)/);
  assert.match(source, /AssertToolSchema\(tools, "unity\.buildAddressables"\)/);
  assert.match(source, /MCP bridge should expose the expected Unity tool surface/);
});
