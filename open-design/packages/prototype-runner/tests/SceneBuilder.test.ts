/**
 * SceneBuilder unit tests. Uses Babylon's NullEngine for headless rendering.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { NullEngine } from '@babylonjs/core';
import { describe, expect, it, beforeAll } from 'vitest';

import { validateGameProject } from '@greybox/schema';

import { AssetLoader, inMemoryKeyValStore } from '../src/AssetLoader.js';
import { resolveCameraKind } from '../src/CameraController.js';
import {
  buildSceneForScreen,
  indexCharacters,
  screenHas3D,
} from '../src/SceneBuilder.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(__dirname, 'fixtures/minimal-3d-project.json');

function loadFixture(): ReturnType<typeof validateGameProject> {
  const raw = JSON.parse(readFileSync(fixturePath, 'utf-8'));
  return validateGameProject(raw);
}

/** A fetch shim that returns 1KB of zero bytes for any request. */
function stubFetch(): typeof fetch {
  return (async (url: string | URL | Request) => {
    void url;
    const buf = new ArrayBuffer(1024);
    return new Response(buf, { status: 200 });
  }) as unknown as typeof fetch;
}

describe('SceneBuilder', () => {
  let engine: NullEngine;
  beforeAll(() => {
    engine = new NullEngine({
      renderWidth: 256,
      renderHeight: 256,
      textureSize: 256,
      deterministicLockstep: true,
      lockstepMaxSteps: 4,
    });
  });

  it('indexCharacters: keys characters by id', () => {
    const project = loadFixture();
    const map = indexCharacters(project);
    expect(map.size).toBe(1);
    expect(map.get('char-goblin')?.name).toBe('Goblin');
  });

  it('screenHas3D: detects 3D vs UI-only screens', () => {
    const project = loadFixture();
    const menu = project.screens.find((s) => s.id === 'screen-main-menu')!;
    const level = project.screens.find((s) => s.id === 'screen-level-1')!;
    expect(screenHas3D(menu)).toBe(false);
    expect(screenHas3D(level)).toBe(true);
  });

  it('resolveCameraKind: defaults orbit for gameplay, ortho2d for menus', () => {
    const project = loadFixture();
    const menu = project.screens.find((s) => s.id === 'screen-main-menu')!;
    const level = project.screens.find((s) => s.id === 'screen-level-1')!;
    expect(resolveCameraKind(menu)).toBe('ortho2d');
    expect(resolveCameraKind(level)).toBe('orbit');
  });

  it('builds a scene for the main-menu screen with UI controls', async () => {
    const project = loadFixture();
    const menu = project.screens.find((s) => s.id === 'screen-main-menu')!;
    const assetLoader = new AssetLoader({
      fetchImpl: stubFetch(),
      store: inMemoryKeyValStore(),
    });
    assetLoader.register(project.assets);
    const built = await buildSceneForScreen(menu, {
      engine,
      project,
      assetLoader,
      characters: indexCharacters(project),
      onButtonClick: () => {},
      onMenuItemClick: () => {},
    });
    // UI overlay should exist with one Text + one Button control.
    expect(built.uiTexture).not.toBeNull();
    expect(built.uiNodes.size).toBe(2);
    expect(built.uiNodes.has('cmp-title')).toBe(true);
    expect(built.uiNodes.has('cmp-play-btn')).toBe(true);
    // No 3D components on this screen.
    expect(built.components.size).toBe(0);
    expect(built.scene.activeCamera?.name).toMatch(/ortho2d/);
    built.dispose();
  });

  it('builds a scene for a gameplay screen with 3D + UI components', async () => {
    const project = loadFixture();
    const level = project.screens.find((s) => s.id === 'screen-level-1')!;
    const assetLoader = new AssetLoader({
      fetchImpl: stubFetch(),
      store: inMemoryKeyValStore(),
    });
    assetLoader.register(project.assets);
    const built = await buildSceneForScreen(level, {
      engine,
      project,
      assetLoader,
      characters: indexCharacters(project),
      onButtonClick: () => {},
      onMenuItemClick: () => {},
    });
    // Expect Character3DRef + Light + Pickup + Hazard + Particle = 5 3D components.
    expect(built.components.size).toBe(5);
    expect(built.components.has('cmp-player')).toBe(true);
    expect(built.components.has('cmp-sun')).toBe(true);
    expect(built.components.has('cmp-coin')).toBe(true);
    expect(built.components.has('cmp-spikes')).toBe(true);
    expect(built.components.has('cmp-sparkle')).toBe(true);
    // UI Button on this screen.
    expect(built.uiNodes.has('cmp-back-btn')).toBe(true);
    // Camera should be an orbit camera.
    expect(built.scene.activeCamera?.name).toMatch(/orbit/);
    built.dispose();
  });

  it('respects screen background colour as scene clearColor', async () => {
    const project = loadFixture();
    const level = project.screens.find((s) => s.id === 'screen-level-1')!;
    const assetLoader = new AssetLoader({
      fetchImpl: stubFetch(),
      store: inMemoryKeyValStore(),
    });
    assetLoader.register(project.assets);
    const built = await buildSceneForScreen(level, {
      engine,
      project,
      assetLoader,
      characters: indexCharacters(project),
      onButtonClick: () => {},
      onMenuItemClick: () => {},
    });
    // #88ccff = (136, 204, 255) → (0.533, 0.8, 1.0)
    expect(built.scene.clearColor.r).toBeCloseTo(0.533, 2);
    expect(built.scene.clearColor.g).toBeCloseTo(0.8, 2);
    expect(built.scene.clearColor.b).toBeCloseTo(1.0, 2);
    built.dispose();
  });

  it('disposes scene + components on dispose()', async () => {
    const project = loadFixture();
    const level = project.screens.find((s) => s.id === 'screen-level-1')!;
    const assetLoader = new AssetLoader({
      fetchImpl: stubFetch(),
      store: inMemoryKeyValStore(),
    });
    assetLoader.register(project.assets);
    const built = await buildSceneForScreen(level, {
      engine,
      project,
      assetLoader,
      characters: indexCharacters(project),
      onButtonClick: () => {},
      onMenuItemClick: () => {},
    });
    const sceneRef = built.scene;
    expect(sceneRef.isDisposed).toBe(false);
    built.dispose();
    expect(sceneRef.isDisposed).toBe(true);
    expect(built.components.size).toBe(0);
  });
});
