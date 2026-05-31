import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { validateGodotPlugin } from './validate-godot-plugin.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('real Godot addon foundation passes static validation', () => {
  const result = validateGodotPlugin(root);
  assert.equal(result.status, 'pass');
  assert.deepEqual(result.errors, []);
});

test('validator fails closed when plugin config is incomplete', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'greybox-godot-validator-'));
  await writeFile(join(tmp, 'plugin.cfg'), '[plugin]\nname="Greybox Studio"\n');

  const result = validateGodotPlugin(tmp);
  assert.equal(result.status, 'fail');
  assert.ok(result.errors.some((error) => error.includes('plugin.cfg')));
  assert.ok(result.errors.some((error) => error.includes('missing addons/greybox_studio/plugin.gd')));
});

test('validator requires Godot engine package preflight and safe staging surfaces', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'greybox-godot-validator-preflight-'));
  await writeFile(join(tmp, 'plugin.cfg'), '[plugin]\nname="Greybox Studio"\nversion="0.1.0-alpha.1"\nscript="plugin.gd"\n');

  const result = validateGodotPlugin(tmp);
  assert.equal(result.status, 'fail');
  assert.ok(result.errors.some((error) => error.includes('engine_package_preflight.gd')));
  assert.ok(result.errors.some((error) => error.includes('GreyboxEnginePackagePreflightClient')));
});

test('validator requires Godot engine package safe extraction surface', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'greybox-godot-validator-extract-'));
  await writeFile(join(tmp, 'plugin.cfg'), '[plugin]\nname="Greybox Studio"\nversion="0.1.0-alpha.1"\nscript="plugin.gd"\n');

  const result = validateGodotPlugin(tmp);
  assert.equal(result.status, 'fail');
  assert.ok(result.errors.some((error) => error.includes('engine_package_importer.gd')));
  assert.ok(result.errors.some((error) => error.includes('extract_staged_package')));
});

test('validator requires deterministic Godot import-plan writers instead of placeholder imports', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'greybox-godot-validator-import-plan-'));
  await writeFile(join(tmp, 'plugin.cfg'), '[plugin]\nname="Greybox Studio"\nversion="0.1.0-alpha.1"\nscript="plugin.gd"\n');

  const result = validateGodotPlugin(tmp);
  assert.equal(result.status, 'fail');
  assert.ok(result.errors.some((error) => error.includes('build_gameview_plan_json')));
  assert.ok(result.errors.some((error) => error.includes('FileAccess.open(plan_path, FileAccess.WRITE)')));
  assert.ok(result.errors.some((error) => error.includes('primary_object_count')));
});

test('Godot MCP bearer tokens use crypto-backed fixed-time helpers', () => {
  const source = readFileSync(join(root, 'addons/greybox_studio/mcp/mcp_bridge.gd'), 'utf8');
  assert.match(source, /Crypto\.new\(\)/u);
  assert.match(source, /generate_random_bytes\(BEARER_TOKEN_BYTES\)/u);
  assert.match(source, /authorization_header_matches/u);
  assert.match(source, /bearer_token_matches/u);
  assert.match(source, /_fixed_time_equals/u);
  assert.doesNotMatch(source, /Time\.get_unix_time_from_system|randi\(\)/u);
});
