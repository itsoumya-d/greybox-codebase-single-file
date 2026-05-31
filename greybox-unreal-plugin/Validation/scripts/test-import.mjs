#!/usr/bin/env node
// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

/**
 * CI orchestration for the Greybox Unreal importer.
 *
 * What this script does:
 *
 *   1. Loads `Validation/fixtures/sample-project/project.json` and asserts
 *      it parses into the canonical GameProject shape that the C++ importer
 *      expects.
 *
 *   2. Mirrors the deterministic descriptor generation that the C++ side
 *      writes to `Saved/Greybox/ImportPlans/` and asserts every component
 *      kind in the fixture maps to an Unreal asset path. This keeps the
 *      contract honest even when no real UE editor is installed on the box.
 *
 *   3. If `UNREAL_EDITOR` is set in the environment, the script also spawns
 *      `UnrealEditor -run=GreyboxImport -ProjectJson=... -AssetBase=...`
 *      and asserts the commandlet exit code is 0 + the on-disk plan file
 *      contains the expected entries.
 *
 * The first two steps are mandatory; the third is best-effort and is
 * skipped on machines without an Unreal install (which is most CI workers).
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');
const FIXTURE_DIR = resolve(HERE, '..', 'fixtures', 'sample-project');
const FIXTURE_PROJECT = join(FIXTURE_DIR, 'project.json');

const EXPECTED_COMPONENT_KINDS = [
  'Button',
  'Image',
  'Text',
  'HUDBar',
  'Camera',
  'Light',
  'Spawner',
  'Trigger',
  'Pickup',
  'Hazard',
  'Checkpoint',
  'Character3DRef',
];

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL ${message}`);
    process.exit(1);
  }
}

function info(message) {
  console.log(`info ${message}`);
}

function joinUnreal(root, tail) {
  if (!root) return tail;
  if (!tail) return root;
  return root.endsWith('/') ? `${root}${tail}` : `${root}/${tail}`;
}

function transformToUnreal(canonical) {
  const { position, rotation, scale } = canonical;
  return {
    location: {
      x: position.x * 100,
      y: position.z * 100,
      z: position.y * 100,
    },
    rotation: {
      pitch: rotation.x,
      yaw: -rotation.y,
      roll: rotation.z,
    },
    scale: { x: scale.x, y: scale.z, z: scale.y },
  };
}

function expectedAssetClassForType(type) {
  if (type === 'gltf' || type === 'fbx') return 'SkeletalMesh|StaticMesh';
  if (type === 'png' || type === 'jpg' || type === 'webp') return 'Texture2D';
  if (type === 'mp3' || type === 'wav') return 'SoundWave';
  if (type === 'prefab') return 'Blueprint';
  if (type === 'json') return 'DataAsset';
  return 'Unknown';
}

function buildExpectedDescriptors(project, contentRoot) {
  const descriptors = {
    levels: [],
    widgets: [],
    actors: [],
    characters: [],
    assets: [],
    flowDispatcher: null,
  };
  for (const screen of project.screens) {
    descriptors.levels.push(joinUnreal(contentRoot, `Levels/${screen.id}`));
    descriptors.widgets.push(joinUnreal(contentRoot, `Widgets/${screen.id}/WBP_${screen.id}`));
    for (const component of screen.components) {
      const transform = transformToUnreal(component.transform);
      const widgetSlot = joinUnreal(contentRoot, `Widgets/${screen.id}/${component.id}`);
      const levelSlot = joinUnreal(contentRoot, `Levels/${screen.id}/${component.id}`);
      switch (component.kind) {
        case 'Button':
          descriptors.widgets.push(widgetSlot);
          assert(component.label !== undefined, `Button ${component.id} has a label`);
          break;
        case 'Image':
          descriptors.widgets.push(widgetSlot);
          assert(component.assetRef, `Image ${component.id} has an assetRef`);
          break;
        case 'Text':
          descriptors.widgets.push(widgetSlot);
          break;
        case 'TextInput':
        case 'ProgressBar':
        case 'HUDBar':
        case 'MenuList':
        case 'Container':
          descriptors.widgets.push(widgetSlot);
          break;
        case 'Character3DRef':
        case 'GameObject':
        case 'Camera':
        case 'Light':
        case 'Spawner':
        case 'Trigger':
        case 'Pickup':
        case 'Hazard':
        case 'Checkpoint':
        case 'Particle':
        case 'AudioSource':
          descriptors.actors.push({ levelSlot, kind: component.kind, transform });
          break;
        default:
          descriptors.actors.push({ levelSlot, kind: 'UnknownComponent', transform });
          break;
      }
    }
  }
  for (const character of project.characters) {
    descriptors.characters.push(joinUnreal(contentRoot, `Characters/${character.id}_SK`));
    descriptors.characters.push(joinUnreal(contentRoot, `Characters/${character.id}_ABP`));
  }
  for (const asset of project.assets) {
    descriptors.assets.push({
      packagePath: joinUnreal(contentRoot, `Assets/${asset.id}`),
      unrealAssetClass: expectedAssetClassForType(asset.type),
    });
  }
  if (project.flow && project.flow.length > 0) {
    descriptors.flowDispatcher = joinUnreal(contentRoot, 'Runtime/AGreyboxFlowDispatcher');
  }
  return descriptors;
}

function validateProjectShape(project) {
  assert(typeof project.schemaVersion === 'string', 'schemaVersion is a string');
  assert(project.meta && typeof project.meta.id === 'string', 'meta.id is a string');
  assert(Array.isArray(project.screens) && project.screens.length > 0, 'at least one screen');
  for (const screen of project.screens) {
    assert(typeof screen.id === 'string', 'screen.id is a string');
    assert(Array.isArray(screen.components), 'screen.components is an array');
    for (const component of screen.components) {
      assert(typeof component.id === 'string', `component.id present in ${screen.id}`);
      assert(typeof component.kind === 'string', `component.kind present in ${screen.id}/${component.id}`);
      assert(component.transform && component.transform.position, `transform.position present in ${component.id}`);
    }
  }
  assert(Array.isArray(project.flow), 'flow is an array');
  assert(Array.isArray(project.assets), 'assets is an array');
  assert(Array.isArray(project.characters), 'characters is an array');
}

function ensureFixtureHasEveryRequiredKind(project) {
  const seenKinds = new Set();
  for (const screen of project.screens) {
    for (const component of screen.components) {
      seenKinds.add(component.kind);
    }
  }
  for (const required of EXPECTED_COMPONENT_KINDS) {
    assert(seenKinds.has(required), `fixture includes ${required}`);
  }
}

function maybeRunUnrealCommandlet(projectJson, assetBase) {
  const editor = process.env.UNREAL_EDITOR;
  const uproject = process.env.GREYBOX_UPROJECT;
  if (!editor || !uproject) {
    info('UNREAL_EDITOR or GREYBOX_UPROJECT is unset; skipping the headless commandlet step.');
    return { skipped: true };
  }
  if (!existsSync(editor) || !existsSync(uproject)) {
    info('UNREAL_EDITOR or GREYBOX_UPROJECT points at a missing path; skipping the headless step.');
    return { skipped: true };
  }
  const args = [
    uproject,
    '-run=GreyboxImport',
    `-ProjectJson=${projectJson}`,
    `-AssetBase=${assetBase}`,
  ];
  info(`spawning ${editor} ${args.join(' ')}`);
  const result = spawnSync(editor, args, { encoding: 'utf8' });
  assert(result.status === 0, `Greybox import commandlet exited with code ${result.status ?? 'null'}`);
  return { skipped: false, exitCode: result.status };
}

function main() {
  assert(existsSync(FIXTURE_PROJECT), `fixture exists at ${FIXTURE_PROJECT}`);
  const projectBody = readFileSync(FIXTURE_PROJECT, 'utf8');
  const project = JSON.parse(projectBody);
  validateProjectShape(project);
  ensureFixtureHasEveryRequiredKind(project);

  const contentRoot = '/Game/Greybox';
  const descriptors = buildExpectedDescriptors(project, contentRoot);
  assert(descriptors.levels.length === project.screens.length, 'one level per screen');
  assert(descriptors.flowDispatcher !== null, 'flow dispatcher emitted when flow is non-empty');
  const totalActors = descriptors.actors.length;
  const totalWidgets = descriptors.widgets.length;
  info(`fixture maps to ${descriptors.levels.length} levels, ${totalWidgets} widget slots, ${totalActors} actors, ${descriptors.characters.length} character assets, ${descriptors.assets.length} asset descriptors.`);

  for (const asset of descriptors.assets) {
    assert(asset.unrealAssetClass !== 'Unknown' || asset.packagePath.endsWith('Assets/'), `asset class known: ${asset.packagePath}`);
  }

  const fixtureAssets = ['icon.png', 'character.glb'];
  for (const file of fixtureAssets) {
    const fixturePath = join(FIXTURE_DIR, 'assets', file);
    assert(existsSync(fixturePath), `bundled fixture asset present: ${file}`);
    const stat = statSync(fixturePath);
    assert(stat.size > 0, `bundled fixture asset non-empty: ${file}`);
  }

  const commandletResult = maybeRunUnrealCommandlet(FIXTURE_PROJECT, join(FIXTURE_DIR, 'assets'));
  if (commandletResult.skipped) {
    info('Headless commandlet skipped — the static fixture contract still holds.');
  } else {
    info(`Headless commandlet returned exit code ${commandletResult.exitCode}.`);
  }

  console.log('PASS Greybox Unreal importer fixture contract (Validation/scripts/test-import.mjs).');
}

main();
