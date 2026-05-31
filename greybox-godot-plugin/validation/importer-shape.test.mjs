import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function read(relative) {
  return readFileSync(join(root, relative), 'utf8');
}

test('ProjectImporter wires every sub-importer it depends on', () => {
  const body = read('addons/greybox_studio/importers/project_importer.gd');
  assert.match(body, /GreyboxAssetImporter/u);
  assert.match(body, /GreyboxCharacterImporter/u);
  assert.match(body, /GreyboxScreenImporter/u);
  assert.match(body, /GreyboxFlowImporter/u);
  assert.match(body, /static func import_from_json/u);
  assert.match(body, /static func import_from_dictionary/u);
});

test('ComponentImporter handles every canonical kind', () => {
  const body = read('addons/greybox_studio/importers/component_importer.gd');
  const required = [
    'Button', 'Image', 'Text', 'TextInput', 'ProgressBar', 'HUDBar', 'MenuList', 'Container',
    'Character3DRef', 'GameObject', 'Spawner', 'Trigger', 'Pickup', 'Hazard', 'Checkpoint', 'Camera',
    'Light', 'Particle', 'AudioSource',
  ];
  for (const kind of required) {
    const matcher = new RegExp(`"${kind}":`);
    assert.match(body, matcher, `component_importer.gd must reference kind ${kind}`);
  }
  assert.match(body, /META_GREYBOX_ID/u);
  assert.match(body, /META_GREYBOX_KIND/u);
});

test('ScreenImporter writes PackedScene tscn files', () => {
  const body = read('addons/greybox_studio/importers/screen_importer.gd');
  assert.match(body, /PackedScene/u);
  assert.match(body, /ResourceSaver\.save/u);
  assert.match(body, /CanvasLayer/u);
  assert.match(body, /WorldEnvironment/u);
  assert.match(body, /DirectionalLight3D/u);
});

test('CharacterImporter builds CharacterBody3D scenes with animations', () => {
  const body = read('addons/greybox_studio/importers/character_importer.gd');
  assert.match(body, /CharacterBody3D/u);
  assert.match(body, /AnimationPlayer/u);
  assert.match(body, /AnimationLibrary/u);
  assert.match(body, /GLTFDocument/u);
});

test('FlowImporter generates a dispatcher script + scene + edges JSON', () => {
  const body = read('addons/greybox_studio/importers/flow_importer.gd');
  assert.match(body, /flow_dispatcher\.gd/u);
  assert.match(body, /flow_edges\.json/u);
  assert.match(body, /change_scene_to_file/u);
  assert.match(body, /GreyboxFlowDispatcher/u);
});

test('DiffApplier exposes three-way merge + conflict resolution', () => {
  const body = read('addons/greybox_studio/sync/diff_applier.gd');
  assert.match(body, /static func apply_three_way_merge/u);
  assert.match(body, /static func resolve_conflict/u);
  assert.match(body, /RESOLUTION_PENDING/u);
  assert.match(body, /RESOLUTION_LOCAL/u);
  assert.match(body, /RESOLUTION_REMOTE/u);
  assert.match(body, /_merge_array_by_id/u);
  assert.match(body, /_merge_array_positional/u);
});

test('Headless import_project script reads CLI args', () => {
  const body = read('addons/greybox_studio/scripts/import_project.gd');
  assert.match(body, /extends SceneTree/u);
  assert.match(body, /--json/u);
  assert.match(body, /--asset-base/u);
  assert.match(body, /--output/u);
  assert.match(body, /GreyboxProjectImporter\.import_from_json/u);
});

test('Studio dock surfaces the GameProject import flow', () => {
  const body = read('addons/greybox_studio/studio_dock.gd');
  assert.match(body, /Import GameProject/u);
  assert.match(body, /_show_import_dialog/u);
  assert.match(body, /_open_first_imported_screen/u);
  assert.match(body, /FileDialog/u);
});

test('Fixture project carries every canonical component kind', () => {
  const document = JSON.parse(read('Validation~/fixtures/sample-project/project.json'));
  const kinds = new Set();
  for (const screen of document.screens) for (const component of screen.components) kinds.add(component.kind);
  const required = [
    'Button', 'Image', 'Text', 'TextInput', 'ProgressBar', 'HUDBar', 'MenuList', 'Container',
    'Character3DRef', 'GameObject', 'Spawner', 'Trigger', 'Pickup', 'Hazard', 'Checkpoint', 'Camera',
    'Light', 'Particle', 'AudioSource',
  ];
  for (const kind of required) assert.ok(kinds.has(kind), `fixture missing component kind ${kind}`);
});

test('GDScript test suite covers diff applier, component importer, project importer', () => {
  const files = [
    'test/run_tests.gd',
    'test/test_diff_applier.gd',
    'test/test_component_importer.gd',
    'test/test_project_importer.gd',
  ];
  for (const file of files) assert.ok(existsSync(join(root, file)), `expected ${file}`);
  const diffTests = read('test/test_diff_applier.gd');
  const diffCases = (diffTests.match(/_test_/g) || []).length;
  assert.ok(diffCases >= 30, `expected dozens of diff merge cases, got ${diffCases} references`);
});
