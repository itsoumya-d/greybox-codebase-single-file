/**
 * ComponentRenderer tests. We hit each rendererable kind once and assert
 * that the Babylon node graph has the expected shape.
 */

import { NullEngine, Scene, ParticleSystem } from '@babylonjs/core';
import { describe, expect, it, beforeAll, afterEach } from 'vitest';

import {
  asAssetId,
  asCharacterId,
  asComponentId,
  type Component,
} from '@greybox/schema';

import { AssetLoader, inMemoryKeyValStore } from '../src/AssetLoader.js';
import { renderComponent } from '../src/ComponentRenderer.js';

const baseTransform = {
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
};

function stubLoader(): AssetLoader {
  const loader = new AssetLoader({
    fetchImpl: (async () =>
      new Response(new ArrayBuffer(8), { status: 200 })) as unknown as typeof fetch,
    store: inMemoryKeyValStore(),
  });
  loader.register([
    {
      id: asAssetId('asset-1'),
      type: 'gltf',
      uri: 'meshes/a.glb',
      sha256:
        '0000000000000000000000000000000000000000000000000000000000000001',
      sizeBytes: 8,
      provenance: { license: 'MIT', source: 'human' },
    },
    {
      id: asAssetId('asset-prefab'),
      type: 'prefab',
      uri: 'p/x.json',
      sha256:
        '0000000000000000000000000000000000000000000000000000000000000002',
      sizeBytes: 8,
      provenance: { license: 'MIT', source: 'human' },
    },
  ]);
  return loader;
}

describe('ComponentRenderer', () => {
  let engine: NullEngine;
  let scene: Scene;

  beforeAll(() => {
    engine = new NullEngine({
      renderWidth: 256,
      renderHeight: 256,
      textureSize: 256,
      deterministicLockstep: true,
      lockstepMaxSteps: 4,
    });
  });

  afterEach(() => {
    if (scene && !scene.isDisposed) scene.dispose();
  });

  it('returns null for UI-family components', async () => {
    scene = new Scene(engine);
    const loader = stubLoader();
    const button: Component = {
      kind: 'Button',
      id: asComponentId('btn-1'),
      name: 'B',
      transform: baseTransform,
      visible: true,
      label: 'Go',
    };
    const result = await renderComponent(scene, button, {
      assetLoader: loader,
      characters: new Map(),
    });
    expect(result).toBeNull();
  });

  it('renders Pickup as a sphere mesh', async () => {
    scene = new Scene(engine);
    const loader = stubLoader();
    const pickup: Component = {
      kind: 'Pickup',
      id: asComponentId('cmp-coin'),
      name: 'Coin',
      transform: baseTransform,
      visible: true,
      grantStat: 'score',
      amount: 1,
      respawn: false,
    };
    const result = await renderComponent(scene, pickup, {
      assetLoader: loader,
      characters: new Map(),
    });
    expect(result).not.toBeNull();
    expect(result!.kind).toBe('Pickup');
    expect(result!.node).not.toBeNull();
    expect(scene.meshes.length).toBeGreaterThanOrEqual(1);
    result!.dispose();
  });

  it('renders Hazard as a cube placeholder', async () => {
    scene = new Scene(engine);
    const loader = stubLoader();
    const hazard: Component = {
      kind: 'Hazard',
      id: asComponentId('cmp-hz'),
      name: 'Spikes',
      transform: baseTransform,
      visible: true,
      damagePerSecond: 10,
      instakill: false,
    };
    const result = await renderComponent(scene, hazard, {
      assetLoader: loader,
      characters: new Map(),
    });
    expect(result).not.toBeNull();
    expect(result!.kind).toBe('Hazard');
    expect(result!.node!.getChildMeshes().length).toBeGreaterThan(0);
    result!.dispose();
  });

  it('renders Trigger with the right shape primitive', async () => {
    scene = new Scene(engine);
    const loader = stubLoader();
    const trig: Component = {
      kind: 'Trigger',
      id: asComponentId('cmp-tr'),
      name: 'T',
      transform: baseTransform,
      visible: true,
      shape: 'sphere',
      eventId: 'evt-1',
      oneShot: false,
    };
    const result = await renderComponent(scene, trig, {
      assetLoader: loader,
      characters: new Map(),
    });
    expect(result).not.toBeNull();
    expect(scene.meshes.some((m) => m.name.includes('mesh-cmp-tr'))).toBe(true);
    result!.dispose();
  });

  it('renders Light component with the given lightType', async () => {
    scene = new Scene(engine);
    const loader = stubLoader();
    const light: Component = {
      kind: 'Light',
      id: asComponentId('cmp-sun'),
      name: 'Sun',
      transform: baseTransform,
      visible: true,
      lightType: 'directional',
      color: '#ffffff',
      intensity: 1.0,
      castsShadows: true,
    };
    const result = await renderComponent(scene, light, {
      assetLoader: loader,
      characters: new Map(),
    });
    expect(result).not.toBeNull();
    expect(scene.lights.some((l) => l.name === 'light-cmp-sun')).toBe(true);
    result!.dispose();
  });

  it('renders Particle component with a ParticleSystem', async () => {
    scene = new Scene(engine);
    const loader = stubLoader();
    const particle: Component = {
      kind: 'Particle',
      id: asComponentId('cmp-p'),
      name: 'Sparkle',
      transform: baseTransform,
      visible: true,
      effectRef: asAssetId('asset-prefab'),
      autoPlay: true,
      loop: true,
    };
    const result = await renderComponent(scene, particle, {
      assetLoader: loader,
      characters: new Map(),
    });
    expect(result).not.toBeNull();
    expect(result!.particles).toBeInstanceOf(ParticleSystem);
    result!.dispose();
  });

  it('renders Spawner as a wireframe sphere', async () => {
    scene = new Scene(engine);
    const loader = stubLoader();
    const spawner: Component = {
      kind: 'Spawner',
      id: asComponentId('cmp-sp'),
      name: 'Spawn',
      transform: baseTransform,
      visible: true,
      prefabRef: asAssetId('asset-prefab'),
      intervalSeconds: 2.0,
    };
    const result = await renderComponent(scene, spawner, {
      assetLoader: loader,
      characters: new Map(),
    });
    expect(result).not.toBeNull();
    expect(result!.kind).toBe('Spawner');
    result!.dispose();
  });

  it('renders Checkpoint as a cylinder primitive', async () => {
    scene = new Scene(engine);
    const loader = stubLoader();
    const cp: Component = {
      kind: 'Checkpoint',
      id: asComponentId('cmp-cp'),
      name: 'CP',
      transform: baseTransform,
      visible: true,
      checkpointId: 'cp-1',
      heals: true,
    };
    const result = await renderComponent(scene, cp, {
      assetLoader: loader,
      characters: new Map(),
    });
    expect(result).not.toBeNull();
    expect(result!.kind).toBe('Checkpoint');
    result!.dispose();
  });

  it('renders GameObject as a placeholder cube', async () => {
    scene = new Scene(engine);
    const loader = stubLoader();
    const go: Component = {
      kind: 'GameObject',
      id: asComponentId('cmp-go'),
      name: 'Crate',
      transform: baseTransform,
      visible: true,
      prefabRef: asAssetId('asset-prefab'),
    };
    const result = await renderComponent(scene, go, {
      assetLoader: loader,
      characters: new Map(),
    });
    expect(result).not.toBeNull();
    expect(result!.node).not.toBeNull();
    result!.dispose();
  });

  it('renders in-scene Camera component as a TransformNode anchor', async () => {
    scene = new Scene(engine);
    const loader = stubLoader();
    const cam: Component = {
      kind: 'Camera',
      id: asComponentId('cmp-cam'),
      name: 'Cam',
      transform: {
        ...baseTransform,
        position: { x: 1, y: 2, z: 3 },
      },
      visible: true,
      projection: 'perspective',
      fov: 60,
      isMain: true,
    };
    const result = await renderComponent(scene, cam, {
      assetLoader: loader,
      characters: new Map(),
    });
    expect(result).not.toBeNull();
    expect(result!.node!.position.x).toBe(1);
    expect(result!.node!.position.y).toBe(2);
    expect(result!.node!.position.z).toBe(3);
    result!.dispose();
  });

  it('falls back to placeholder when characterRef is unknown', async () => {
    scene = new Scene(engine);
    const loader = stubLoader();
    const ref: Component = {
      kind: 'Character3DRef',
      id: asComponentId('cmp-p'),
      name: 'P',
      transform: baseTransform,
      visible: true,
      characterRef: asCharacterId('char-nonexistent'),
    };
    const result = await renderComponent(scene, ref, {
      assetLoader: loader,
      characters: new Map(), // empty registry
    });
    expect(result).not.toBeNull();
    expect(result!.kind).toBe('Character3DRef');
    expect(result!.node).not.toBeNull();
    result!.dispose();
  });
});
