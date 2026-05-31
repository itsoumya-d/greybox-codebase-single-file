import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { validateUnrealPlugin } from './validate-unreal-plugin.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('real Unreal plugin foundation passes static validation', () => {
  const result = validateUnrealPlugin(root);
  assert.equal(result.status, 'pass');
  assert.deepEqual(result.errors, []);
});

test('validator fails closed when descriptor is missing engine modules', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'greybox-unreal-validator-'));
  await writeFile(join(tmp, 'GreyboxStudio.uplugin'), JSON.stringify({
    FriendlyName: 'Greybox Studio',
    Category: 'Design',
    IsBetaVersion: true,
    Modules: [],
    Plugins: [],
  }));

  const result = validateUnrealPlugin(tmp);
  assert.equal(result.status, 'fail');
  assert.ok(result.errors.some((error) => error.includes('runtime module missing')));
  assert.ok(result.errors.some((error) => error.includes('editor module missing')));
});

test('validator requires Unreal engine package preflight and safe staging surfaces', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'greybox-unreal-validator-preflight-'));
  await writeFile(join(tmp, 'GreyboxStudio.uplugin'), JSON.stringify({
    FriendlyName: 'Greybox Studio',
    Category: 'Design',
    IsBetaVersion: true,
    Modules: [
      { Name: 'GreyboxStudio', Type: 'Runtime' },
      { Name: 'GreyboxStudioEditor', Type: 'Editor' },
    ],
    Plugins: [
      { Name: 'WebSockets' },
      { Name: 'UMG' },
      { Name: 'Paper2D' },
    ],
  }));

  const result = validateUnrealPlugin(tmp);
  assert.equal(result.status, 'fail');
  assert.ok(result.errors.some((error) => error.includes('GreyboxEnginePackagePreflight.h')));
  assert.ok(result.errors.some((error) => error.includes('FGreyboxEnginePackagePreflightClient')));
});

test('validator requires Unreal editor dock around preflight and staging', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'greybox-unreal-validator-dock-'));
  await writeFile(join(tmp, 'GreyboxStudio.uplugin'), JSON.stringify({
    FriendlyName: 'Greybox Studio',
    Category: 'Design',
    IsBetaVersion: true,
    Modules: [
      { Name: 'GreyboxStudio', Type: 'Runtime' },
      { Name: 'GreyboxStudioEditor', Type: 'Editor' },
    ],
    Plugins: [
      { Name: 'WebSockets' },
      { Name: 'UMG' },
      { Name: 'Paper2D' },
    ],
  }));

  const result = validateUnrealPlugin(tmp);
  assert.equal(result.status, 'fail');
  assert.ok(result.errors.some((error) => error.includes('SGreyboxStudioDock.h')));
  assert.ok(result.errors.some((error) => error.includes('RegisterNomadTabSpawner')));
});

test('validator requires deterministic Unreal import-plan writers instead of placeholder imports', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'greybox-unreal-validator-import-plan-'));
  await writeFile(join(tmp, 'GreyboxStudio.uplugin'), JSON.stringify({
    FriendlyName: 'Greybox Studio',
    Category: 'Design',
    IsBetaVersion: true,
    Modules: [
      { Name: 'GreyboxStudio', Type: 'Runtime' },
      { Name: 'GreyboxStudioEditor', Type: 'Editor' },
    ],
    Plugins: [
      { Name: 'WebSockets' },
      { Name: 'UMG' },
      { Name: 'Paper2D' },
    ],
  }));

  const result = validateUnrealPlugin(tmp);
  assert.equal(result.status, 'fail');
  assert.ok(result.errors.some((error) => error.includes('BuildGameViewPlanJson')));
  assert.ok(result.errors.some((error) => error.includes('FFileHelper::SaveStringToFile')));
  assert.ok(result.errors.some((error) => error.includes('actorCount')));
});

test('Unreal MCP bearer tokens are strict fixed-time local secrets', () => {
  const source = readFileSync(join(root, 'Source/GreyboxStudioEditor/Private/GreyboxMcpBridge.cpp'), 'utf8');
  assert.match(source, /EGuidFormats::Digits/u);
  assert.match(source, /GreyboxMcpBearerTokenChars = 64/u);
  assert.match(source, /AuthorizationHeaderMatches/u);
  assert.match(source, /BearerTokenMatches/u);
  assert.match(source, /FixedTimeEquals/u);
  assert.doesNotMatch(source, /DigitsWithHyphens/u);
});
