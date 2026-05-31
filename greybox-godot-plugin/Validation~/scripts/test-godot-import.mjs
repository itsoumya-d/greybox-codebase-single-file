#!/usr/bin/env node
// Spawns headless Godot against the fixture project (when an editor is available)
// and asserts the importer writes the expected .tscn / asset files. When Godot is
// not installed we fall back to a static fixture sanity check so CI can still
// guarantee the JSON shape stays valid.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(here, '..', '..');
const fixtureRoot = resolve(here, '..', 'fixtures', 'sample-project');

const fixtureJsonPath = join(fixtureRoot, 'project.json');

function assertFixtureShape() {
  const raw = JSON.parse(readFileSync(fixtureJsonPath, 'utf8'));
  if (raw.schemaVersion !== '1.0.0') throw new Error('fixture schemaVersion must be 1.0.0');
  if (!Array.isArray(raw.screens) || raw.screens.length < 2) throw new Error('fixture must include at least two screens');
  if (!Array.isArray(raw.assets) || raw.assets.length === 0) throw new Error('fixture must include at least one asset');
  if (!Array.isArray(raw.characters) || raw.characters.length === 0) throw new Error('fixture must include at least one character');
  if (!Array.isArray(raw.flow) || raw.flow.length === 0) throw new Error('fixture must include at least one flow edge');
  const kinds = new Set();
  for (const screen of raw.screens) for (const component of screen.components) kinds.add(component.kind);
  const required = ['Button','Image','Text','TextInput','ProgressBar','HUDBar','MenuList','Container','Character3DRef','GameObject','Spawner','Trigger','Pickup','Hazard','Checkpoint','Camera','Light','Particle','AudioSource'];
  for (const kind of required) if (!kinds.has(kind)) throw new Error(`fixture is missing component kind ${kind}`);
}

function discoverEditor() {
  if (process.env.GODOT_EDITOR && existsSync(process.env.GODOT_EDITOR)) return process.env.GODOT_EDITOR;
  for (const version of ['4.4', '4.3', '4.2']) {
    const candidates = [
      `/Applications/Godot_${version}.app/Contents/MacOS/Godot`,
      `/Applications/Godot_v${version}.app/Contents/MacOS/Godot`,
      `/Applications/Godot.app/Contents/MacOS/Godot`,
    ];
    for (const candidate of candidates) if (existsSync(candidate)) return candidate;
  }
  return '';
}

async function runHeadlessImport(editor) {
  const sessionDir = join(tmpdir(), `greybox-godot-import-${randomBytes(6).toString('hex')}`);
  mkdirSync(sessionDir, { recursive: true });
  // Bootstrap a minimal project.godot so the editor opens cleanly.
  // The addon path is referenced by absolute path.
  const projectFile = join(sessionDir, 'project.godot');
  const projectBody = `; Greybox import fixture\n[application]\nconfig/name=\"Greybox Import Fixture\"\nrun/main_scene=\"\"\n[gui]\ntheme/use_hidpi=true\n`;
  const fsModule = await import('node:fs/promises');
  await fsModule.writeFile(projectFile, projectBody, 'utf8');
  await fsModule.cp(join(packageRoot, 'addons'), join(sessionDir, 'addons'), { recursive: true });
  const args = [
    '--headless',
    '--path', sessionDir,
    '--script', 'res://addons/greybox_studio/scripts/import_project.gd',
    '--',
    '--json', fixtureJsonPath,
    '--asset-base', join(fixtureRoot, 'assets'),
    '--output', 'res://Greybox/',
  ];
  const result = spawnSync(editor, args, { stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000 });
  return { result, sessionDir };
}

async function main() {
  assertFixtureShape();
  const editor = discoverEditor();
  if (!editor) {
    console.log('PASS Greybox Godot fixture shape (no editor detected)');
    return 0;
  }
  console.log(`Using Godot editor: ${editor}`);
  const { result, sessionDir } = await runHeadlessImport(editor);
  if (result.status !== 0 && result.status !== 2) {
    console.error(result.stdout?.toString?.() || '');
    console.error(result.stderr?.toString?.() || '');
    throw new Error(`Godot importer exited with ${result.status}`);
  }
  const expected = [
    'Greybox/screens/scr-main-menu.tscn',
    'Greybox/screens/scr-gameplay.tscn',
    'Greybox/characters/char-hero.tscn',
    'Greybox/assets/asset-icon.png',
    'Greybox/flow/flow_edges.json',
  ];
  for (const relative of expected) {
    const fullPath = join(sessionDir, relative);
    if (!existsSync(fullPath)) throw new Error(`expected importer output missing: ${relative}`);
  }
  console.log('PASS Greybox Godot fixture import');
  return 0;
}

main().then((code) => process.exit(code || 0)).catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
