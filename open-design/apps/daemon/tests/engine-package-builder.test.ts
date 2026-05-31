// SPDX-License-Identifier: Apache-2.0

import { createHash } from 'node:crypto';

import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';

import { buildEnginePackageFromRuntime } from '../src/engine-package-builder.js';
import { buildGameEngineRuntime } from '../src/game-engine-runtime.js';

function fixtureGameView() {
  return JSON.stringify({
    version: 1,
    kind: 'game-viewport',
    surface: 'gameplay',
    title: 'Package Arena',
    objective: 'Validate package artifacts for engine plugins.',
    entities: [
      { id: 'player-start', name: 'Player Start', type: 'player-spawn', x: 40, y: 80 },
      { id: 'boss', name: 'Package Boss', type: 'enemy-spawn', x: 420, y: 180 },
    ],
    terrainZones: [
      { id: 'lava-wall', name: 'Lava Wall', type: 'blocking-hazard', x: 100, y: 120, w: 80, h: 48 },
    ],
    terrainSculptPatches: [
      { id: 'ridge', name: 'Ridge', type: 'height-sculpt', x: 180, y: 140, radius: 72, height: 1.2 },
    ],
    dynamicEvents: [
      { id: 'boss-enrage', name: 'Boss Enrage', trigger: 'tick-2', impact: 'Boss pressure increases.' },
    ],
    worldSimulation: {
      weather: 'Ash rain',
      factionTerritory: ['Arena keep'],
    },
  });
}

function digest(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

function centralDirectoryMethods(buffer: Buffer): number[] {
  const methods: number[] = [];
  for (let offset = 0; offset < buffer.length - 46; offset += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) continue;
    methods.push(buffer.readUInt16LE(offset + 10));
  }
  return methods;
}

describe('engine package builder', () => {
  it('zips native runtime files with a plugin-readable manifest', async () => {
    const runtime = buildGameEngineRuntime('arena.gameview.json', fixtureGameView(), { engine: 'unreal' });
    const result = await buildEnginePackageFromRuntime({
      projectId: 'package-project',
      projectName: 'Package Project',
      runtime,
    });

    expect(result.fileName).toBe('Package-Project-arena-unreal.zip');
    expect(result.fileCount).toBe((runtime.files?.length ?? 0) + 1);
    expect(result.contentRevisionSha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(result.manifest).toMatchObject({
      generator: 'Greybox + human designer',
      projectId: 'package-project',
      projectName: 'Package Project',
      sourceFileName: 'arena.gameview.json',
      engine: 'unreal',
      contentRevisionSha256: result.contentRevisionSha256,
      terrainColliderCount: 2,
      terrainSculptPatchCount: 1,
      dynamicEventCount: 1,
      factionCount: 1,
    });

    const zip = await JSZip.loadAsync(result.buffer);
    const manifestText = await zip.file('GreyboxEnginePackageManifest.json')?.async('string');
    expect(manifestText).toBeTruthy();
    const manifest = JSON.parse(manifestText ?? '{}');
    expect(manifest.contentRevisionSha256).toBe(result.contentRevisionSha256);
    expect(manifest.runtimeHooks).toEqual(
      expect.arrayContaining([
        expect.stringContaining('UAGDSGameViewRuntimeComponent::TerrainHeightAt'),
      ]),
    );
    expect(manifest.files.map((file: { path: string }) => file.path)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/unreal\/AGDSGameViewRuntimeComponent\.h$/),
        expect.stringMatching(/unreal\/AGDSGameViewRuntimeComponent\.cpp$/),
        expect.stringMatching(/ENGINE_EXPORT_README\.md$/),
      ]),
    );

    const sourceFile = runtime.files?.find((file) => file.path.endsWith('AGDSGameViewRuntimeComponent.cpp'));
    expect(sourceFile).toBeTruthy();
    const manifestFile = manifest.files.find((file: { path: string }) => file.path === sourceFile?.path);
    expect(manifestFile).toMatchObject({
      language: 'cpp',
      sha256: digest(sourceFile?.content ?? ''),
    });
    const zippedSource = await zip.file(sourceFile?.path ?? '')?.async('string');
    expect(zippedSource).toContain('UAGDSGameViewRuntimeComponent::AdvanceWorldTick');
    expect(centralDirectoryMethods(result.buffer)).toEqual(expect.arrayContaining([0]));
    expect(centralDirectoryMethods(result.buffer)).not.toContain(8);
  });

  it('rejects web-only and unsafe runtime packages', async () => {
    const webRuntime = buildGameEngineRuntime('arena.gameview.json', fixtureGameView());
    await expect(buildEnginePackageFromRuntime({
      projectId: 'package-project',
      projectName: 'Package Project',
      runtime: webRuntime,
    })).rejects.toThrow(/native runtime files/);

    await expect(buildEnginePackageFromRuntime({
      projectId: 'package-project',
      projectName: 'Package Project',
      runtime: {
        ...buildGameEngineRuntime('arena.gameview.json', fixtureGameView(), { engine: 'godot' }),
        files: [{
          path: '../escape.gd',
          language: 'gdscript',
          purpose: 'unsafe path regression',
          content: 'extends Node',
        }],
      },
    })).rejects.toThrow(/unsafe engine package path/);
  });
});
