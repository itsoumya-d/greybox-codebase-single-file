#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const requiredFiles = [
  'GreyboxStudio.uplugin',
  'Source/GreyboxStudio/GreyboxStudio.Build.cs',
  'Source/GreyboxStudio/Public/GreyboxArtifact.h',
  'Source/GreyboxStudio/Public/GreyboxStudioSettings.h',
  'Source/GreyboxStudioEditor/GreyboxStudioEditor.Build.cs',
  'Source/GreyboxStudioEditor/Public/GreyboxArtifactImporters.h',
  'Source/GreyboxStudioEditor/Private/GreyboxArtifactImporters.cpp',
  'Source/GreyboxStudioEditor/Public/GreyboxDiffApplier.h',
  'Source/GreyboxStudioEditor/Private/GreyboxDiffApplier.cpp',
  'Source/GreyboxStudioEditor/Public/GreyboxSyncClient.h',
  'Source/GreyboxStudioEditor/Private/GreyboxSyncClient.cpp',
  'Source/GreyboxStudioEditor/Public/GreyboxEnginePackagePreflight.h',
  'Source/GreyboxStudioEditor/Private/GreyboxEnginePackagePreflight.cpp',
  'Source/GreyboxStudioEditor/Public/GreyboxEnginePackageImporter.h',
  'Source/GreyboxStudioEditor/Private/GreyboxEnginePackageImporter.cpp',
  'Source/GreyboxStudioEditor/Private/Tests/GreyboxEnginePackageImporterTests.cpp',
  'Source/GreyboxStudioEditor/Public/SGreyboxStudioDock.h',
  'Source/GreyboxStudioEditor/Private/SGreyboxStudioDock.cpp',
  'Source/GreyboxStudioEditor/Private/GreyboxStudioEditorModule.cpp',
  'Source/GreyboxStudioEditor/Public/GreyboxMcpBridge.h',
  'Source/GreyboxStudioEditor/Private/GreyboxMcpBridge.cpp',
  'Source/GreyboxStudioEditor/Public/Importers/GreyboxGameProjectTypes.h',
  'Source/GreyboxStudioEditor/Public/Importers/GreyboxProjectImporter.h',
  'Source/GreyboxStudioEditor/Private/Importers/GreyboxProjectImporter.cpp',
  'Source/GreyboxStudioEditor/Public/Importers/GreyboxComponentImporter.h',
  'Source/GreyboxStudioEditor/Private/Importers/GreyboxComponentImporter.cpp',
  'Source/GreyboxStudioEditor/Public/Importers/GreyboxScreenImporter.h',
  'Source/GreyboxStudioEditor/Private/Importers/GreyboxScreenImporter.cpp',
  'Source/GreyboxStudioEditor/Public/Importers/GreyboxCharacterImporter.h',
  'Source/GreyboxStudioEditor/Private/Importers/GreyboxCharacterImporter.cpp',
  'Source/GreyboxStudioEditor/Public/Importers/GreyboxAssetImporter.h',
  'Source/GreyboxStudioEditor/Private/Importers/GreyboxAssetImporter.cpp',
  'Source/GreyboxStudioEditor/Public/Importers/GreyboxFlowImporter.h',
  'Source/GreyboxStudioEditor/Private/Importers/GreyboxFlowImporter.cpp',
  'Source/GreyboxStudioEditor/Public/Subsystems/GreyboxImportSubsystem.h',
  'Source/GreyboxStudioEditor/Private/Subsystems/GreyboxImportSubsystem.cpp',
  'Source/GreyboxStudioEditor/Public/Commandlets/GreyboxImportCommandlet.h',
  'Source/GreyboxStudioEditor/Private/Commandlets/GreyboxImportCommandlet.cpp',
  'Source/GreyboxStudioEditor/Private/Tests/GreyboxProjectImporterTests.cpp',
  'Source/GreyboxStudioEditor/Private/Tests/GreyboxDiffApplierTests.cpp',
  'Validation/fixtures/sample-project/project.json',
  'Validation/fixtures/sample-project/assets/icon.png',
  'Validation/fixtures/sample-project/assets/character.glb',
  'Validation/scripts/test-import.mjs',
  'Documentation/ARCHITECTURE.md',
  'STORE_LISTING.md',
  'LICENSE.proprietary',
];

export function validateUnrealPlugin(packageRoot = root) {
  const errors = [];
  for (const file of requiredFiles) {
    if (!existsSync(join(packageRoot, file))) errors.push(`missing ${file}`);
  }

  const descriptor = readJson(packageRoot, 'GreyboxStudio.uplugin', errors);
  if (descriptor) {
    if (descriptor.FriendlyName !== 'Greybox Studio') errors.push('descriptor FriendlyName must be Greybox Studio');
    if (descriptor.Category !== 'Design') errors.push('descriptor Category must be Design');
    if (!descriptor.IsBetaVersion) errors.push('descriptor must stay beta until Marketplace validation');
    const modules = descriptor.Modules ?? [];
    if (!modules.some((item) => item.Name === 'GreyboxStudio' && item.Type === 'Runtime')) errors.push('runtime module missing');
    if (!modules.some((item) => item.Name === 'GreyboxStudioEditor' && item.Type === 'Editor')) errors.push('editor module missing');
    const plugins = (descriptor.Plugins ?? []).map((item) => item.Name);
    for (const plugin of ['WebSockets', 'UMG', 'Paper2D']) {
      if (!plugins.includes(plugin)) errors.push(`descriptor plugin dependency missing ${plugin}`);
    }
  }

  const allText = requiredFiles
    .filter((file) => existsSync(join(packageRoot, file)))
    .map((file) => `${file}\n${readFileSync(join(packageRoot, file), 'utf8')}`)
    .join('\n');

  for (const phrase of [
    '.gameview.json',
    'DESIGN.md',
    'HUD HTML',
    'level board JSON',
    '/api/sync/unreal?projectId=',
    '/api/projects/%s/round-trip-merge',
    '/api/game-deliverables/%s/engine-package/unreal/preflight',
    '/api/projects/%s/engine-package/unreal',
    'FGreyboxEnginePackagePreflightClient',
    'FetchUnrealAsync',
    'GreyboxEnginePackageManifest.json',
    'DownloadAndStageUnrealPackageAsync',
    'ExtractStoredZipPackage',
    'ParseManifestHashes',
    'FSHA256::HashBuffer',
    'SHA-256 mismatch',
    'checksum-verified',
    'Unsupported ZIP compression method',
    'Saved/Greybox/EnginePackages',
    'Source/GreyboxGenerated/EnginePackage',
    'ExtractedFileCount',
    'IsSafePackageEntryPath',
    'Greybox.EnginePackage.EntryRejectsTraversal',
    'Greybox.EnginePackage.ExtractsStoredZip',
    'SGreyboxStudioDock',
    'RegisterNomadTabSpawner',
    'LevelEditor.MainMenu.Window',
    'Check Unreal Export',
    'Download Unreal Export',
    'Copy MCP Config',
    'UGreyboxStudioSettings',
    'FPlatformApplicationMisc::ClipboardCopy',
    'Authorization',
    'Bearer',
    'X-Greybox-Mcp-Token',
    'EGuidFormats::Digits',
    'GreyboxMcpBearerTokenChars',
    'IsSafeBearerToken',
    'AuthorizationHeaderMatches',
    'BearerTokenMatches',
    'FixedTimeEquals',
    'unreal.getWorldActors',
    'unreal.createActor',
    'unreal.addComponent',
    'unreal.setProperty',
    'unreal.assignAsset',
    'unreal.runAutomationTest',
    'unreal.captureViewportScreenshot',
    'unreal.buildCookedContent',
    'EGreyboxMergeFieldType::Int',
    'EGreyboxMergeFieldType::Float',
    'EGreyboxMergeFieldType::String',
    'EGreyboxMergeFieldType::Color',
    'EGreyboxMergeFieldType::Vector',
    'AI-assisted',
    'human designers',
    'BuildGameViewPlanJson',
    'BuildArtBiblePlanJson',
    'BuildHudPlanJson',
    'BuildLevelBoardPlanJson',
    'FFileHelper::LoadFileToString',
    'FFileHelper::SaveStringToFile',
    'actorCount',
    'spawnPointCount',
    'objectiveCount',
    'hazardCount',
    'colorCount',
    'slotCount',
    'roomCount',
    'encounterCount',
    'FGreyboxProjectImporter',
    'ImportFromJson',
    'FGreyboxComponentImporter',
    'FGreyboxScreenImporter',
    'FGreyboxCharacterImporter',
    'FGreyboxAssetImporter',
    'FGreyboxFlowImporter',
    'ConvertTransformToUnreal',
    'AGreyboxFlowDispatcher',
    'UGreyboxImportCommandlet',
    'UGreyboxImportSubsystem',
    'Import GameProject',
    'IsMixamoStandardJoint',
    'mixamorig:Hips',
    'EGreyboxConflictResolution',
    'KeepLocal',
    'KeepRemote',
    'EGreyboxMergeFieldType::Rotator',
    'EGreyboxMergeFieldType::Transform',
    'EGreyboxMergeFieldType::Bool',
    'EGreyboxMergeFieldType::Array',
    'EGreyboxMergeFieldType::Object',
    'FGreyboxMergeConflict',
    'JsonPointer',
  ]) {
    if (!allText.includes(phrase)) errors.push(`missing required phrase: ${phrase}`);
  }
  if (allText.includes('Queued Greybox %s import')) {
    errors.push('Unreal artifact importers must write deterministic import plans, not no-op queued placeholders');
  }

  const sourceFiles = requiredFiles.filter((file) => /\.(cs|cpp|h)$/u.test(file) && existsSync(join(packageRoot, file)));
  for (const file of sourceFiles) {
    const body = readFileSync(join(packageRoot, file), 'utf8');
    if (!body.startsWith('// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.')) {
      errors.push(`${file} missing proprietary header`);
    }
  }
  if (/\bAI-generated\b/u.test(allText)) errors.push('must say AI-assisted, not AI-generated');
  if (/\bTODO\b/u.test(allText)) errors.push('unresolved TODO marker present');

  return {
    status: errors.length === 0 ? 'pass' : 'fail',
    errors,
    checkedFiles: requiredFiles.length,
  };
}

function readJson(packageRoot, file, errors) {
  try {
    return JSON.parse(readFileSync(join(packageRoot, file), 'utf8'));
  } catch (error) {
    errors.push(`${file} must parse as JSON: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('/validate-unreal-plugin.mjs')) {
  const result = validateUnrealPlugin();
  console.log(`${result.status === 'pass' ? 'PASS' : 'FAIL'} Unreal plugin validation (${result.checkedFiles} files)`);
  if (result.errors.length > 0) console.error(result.errors.join('\n'));
  if (result.status !== 'pass') process.exitCode = 1;
}
