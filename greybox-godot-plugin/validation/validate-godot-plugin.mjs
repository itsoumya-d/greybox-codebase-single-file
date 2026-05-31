#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const requiredFiles = [
  'addons/greybox_studio/plugin.cfg',
  'addons/greybox_studio/plugin.gd',
  'addons/greybox_studio/studio_dock.gd',
  'addons/greybox_studio/runtime/greybox_artifact.gd',
  'addons/greybox_studio/importers/artifact_importers.gd',
  'addons/greybox_studio/importers/engine_package_importer.gd',
  'addons/greybox_studio/importers/project_importer.gd',
  'addons/greybox_studio/importers/screen_importer.gd',
  'addons/greybox_studio/importers/component_importer.gd',
  'addons/greybox_studio/importers/character_importer.gd',
  'addons/greybox_studio/importers/flow_importer.gd',
  'addons/greybox_studio/importers/asset_importer.gd',
  'addons/greybox_studio/scripts/import_project.gd',
  'addons/greybox_studio/sync/diff_applier.gd',
  'addons/greybox_studio/sync/sync_client.gd',
  'addons/greybox_studio/sync/engine_package_preflight.gd',
  'addons/greybox_studio/mcp/mcp_bridge.gd',
  'test/run_tests.gd',
  'test/test_diff_applier.gd',
  'test/test_component_importer.gd',
  'test/test_project_importer.gd',
  'Validation~/fixtures/sample-project/project.json',
  'docs/ARCHITECTURE.md',
  'ASSET_LIBRARY.md',
  'LICENSE.proprietary',
];

const minimumFileSizes = {
  'addons/greybox_studio/importers/project_importer.gd': 1200,
  'addons/greybox_studio/importers/screen_importer.gd': 1200,
  'addons/greybox_studio/importers/component_importer.gd': 1200,
  'addons/greybox_studio/importers/character_importer.gd': 1200,
  'addons/greybox_studio/importers/flow_importer.gd': 1200,
  'addons/greybox_studio/importers/asset_importer.gd': 1200,
  'addons/greybox_studio/sync/diff_applier.gd': 3000,
};

export function validateGodotPlugin(packageRoot = root) {
  const errors = [];
  for (const file of requiredFiles) {
    if (!existsSync(join(packageRoot, file))) errors.push(`missing ${file}`);
  }
  for (const [file, minimumBytes] of Object.entries(minimumFileSizes)) {
    const fullPath = join(packageRoot, file);
    if (!existsSync(fullPath)) continue;
    const size = readFileSync(fullPath).byteLength;
    if (size < minimumBytes) errors.push(`${file} is smaller (${size}B) than the minimum ${minimumBytes}B`);
  }

  const pluginConfig = existsSync(join(packageRoot, 'addons/greybox_studio/plugin.cfg'))
    ? readFileSync(join(packageRoot, 'addons/greybox_studio/plugin.cfg'), 'utf8')
    : '';
  for (const phrase of [
    'name="Greybox Studio"',
    'version="0.1.0-alpha.1"',
    'script="plugin.gd"',
  ]) {
    if (!pluginConfig.includes(phrase)) errors.push(`plugin.cfg missing ${phrase}`);
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
    '/api/sync/godot?projectId=',
    '/api/projects/%s/round-trip-merge',
    '/api/game-deliverables/%s/engine-package/godot/preflight',
    '/api/projects/%s/engine-package/godot',
    'GreyboxEnginePackagePreflightClient',
    'fetch_godot_preflight',
    'GreyboxEnginePackageManifest.json',
    'download_and_stage_godot_package',
    'extract_staged_package',
    'ZIPReader',
    'HashingContext.HASH_SHA256',
    'SHA-256 mismatch',
    'verified_file_count',
    'MAX_EXTRACTED_FILES',
    'extracted_file_count',
    'user://greybox/engine-packages',
    'res://GreyboxGenerated/EnginePackage',
    'is_safe_package_entry_path',
    'Authorization',
    'Bearer',
    'X-Greybox-Mcp-Token',
    'Crypto.new()',
    'generate_random_bytes',
    'is_safe_bearer_token',
    'authorization_header_matches',
    'bearer_token_matches',
    '_fixed_time_equals',
    'godot.getSceneTree',
    'godot.createNode',
    'godot.addScript',
    'godot.setProperty',
    'godot.assignResource',
    'godot.runEditorTest',
    'godot.captureViewportScreenshot',
    'godot.exportProject',
    '"int"',
    '"float"',
    '"String"',
    '"Color"',
    '"Vector2"',
    '"Vector3"',
    'AI-assisted',
    'human designer',
    'build_gameview_plan_json',
    'build_art_bible_plan_json',
    'build_hud_plan_json',
    'build_level_board_plan_json',
    'FileAccess.open(source_path, FileAccess.READ)',
    'FileAccess.open(plan_path, FileAccess.WRITE)',
    'primary_object_count',
    'actor_count',
    'spawn_point_count',
    'objective_count',
    'hazard_count',
    'color_count',
    'slot_count',
    'room_count',
    'encounter_count',
    'GreyboxProjectImporter',
    'GreyboxScreenImporter',
    'GreyboxComponentImporter',
    'GreyboxCharacterImporter',
    'GreyboxFlowImporter',
    'GreyboxAssetImporter',
    'import_from_json',
    'apply_three_way_merge',
    'resolve_conflict',
    'RESOLUTION_PENDING',
    'RESOLUTION_LOCAL',
    'RESOLUTION_REMOTE',
    'CharacterBody3D',
    'DirectionalLight3D',
    'OmniLight3D',
    'SpotLight3D',
    'GPUParticles3D',
    'AudioStreamPlayer3D',
    'Marker3D',
    'PanelContainer',
    'VBoxContainer',
    'CanvasLayer',
    'change_scene_to_file',
    'handle_event',
    'flow_dispatcher.gd',
    'GreyboxFlowDispatcher',
    'GLTFDocument',
    'EditorFileSystem',
    'Validation~/fixtures/sample-project',
  ]) {
    if (!allText.includes(phrase)) errors.push(`missing required phrase: ${phrase}`);
  }
  if (allText.includes('Queued Greybox %s import')) {
    errors.push('Godot artifact importers must write deterministic import plans, not no-op queued placeholders');
  }

  const scriptFiles = requiredFiles.filter((file) => file.endsWith('.gd') && existsSync(join(packageRoot, file)));
  for (const file of scriptFiles) {
    const body = readFileSync(join(packageRoot, file), 'utf8');
    if (!body.startsWith('# Proprietary and confidential. Copyright (c) 2026 Greybox Studio.')) {
      errors.push(`${file} missing proprietary header`);
    }
    if (!body.includes('@tool')) errors.push(`${file} must be editor-tool aware`);
  }
  if (/\bAI-generated\b/u.test(allText)) errors.push('must say AI-assisted, not AI-generated');
  if (/\bTODO\b/u.test(allText)) errors.push('unresolved TODO marker present');

  return {
    status: errors.length === 0 ? 'pass' : 'fail',
    errors,
    checkedFiles: requiredFiles.length,
  };
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('/validate-godot-plugin.mjs')) {
  const result = validateGodotPlugin();
  console.log(`${result.status === 'pass' ? 'PASS' : 'FAIL'} Godot plugin validation (${result.checkedFiles} files)`);
  if (result.errors.length > 0) console.error(result.errors.join('\n'));
  if (result.status !== 'pass') process.exitCode = 1;
}
