/**
 * ComponentRenderer: turns the Game / 3D family components into Babylon
 * scene nodes. UI components are handled separately by {@link UIRenderer}.
 *
 * Each renderer function returns a small `RenderedComponent` handle so
 * the runner can dispose nodes when transitioning screens.
 *
 * @packageDocumentation
 */

import {
  Color3,
  Color4,
  DirectionalLight,
  HemisphericLight,
  MeshBuilder,
  ParticleSystem,
  PointLight,
  type Scene,
  type Sound,
  SpotLight,
  StandardMaterial,
  Texture,
  TransformNode,
  Vector3,
} from '@babylonjs/core';

import type {
  AudioSourceComponent,
  CameraComponent,
  Character,
  Character3DRefComponent,
  CheckpointComponent,
  Component,
  GameObjectComponent,
  HazardComponent,
  LightComponent,
  ParticleComponent,
  PickupComponent,
  SpawnerComponent,
  TriggerComponent,
} from '@greybox/schema';

import type { AssetLoader } from './AssetLoader.js';
import {
  applyTransform,
  type CharacterInstance,
  loadCharacterInstance,
} from './CharacterLoader.js';

/**
 * Handle returned from a component render. Disposing the handle disposes
 * all nodes the render created.
 */
export interface RenderedComponent {
  componentId: string;
  kind: Component['kind'];
  node: TransformNode | null;
  /** Optional Babylon Sound (for AudioSource). */
  sound?: Sound;
  /** Optional ParticleSystem (for Particle). */
  particles?: ParticleSystem;
  /** Optional CharacterInstance (for Character3DRef). */
  character?: CharacterInstance;
  dispose(): void;
}

export interface ComponentRendererOptions {
  characters: Map<string, Character>;
  assetLoader: AssetLoader;
}

/**
 * Render a single 3D / game component into `scene`.
 *
 * Returns `null` for UI-family components (those are handled by
 * {@link UIRenderer}). Returns a handle for everything else, even when
 * the underlying asset failed to load (the handle just has `node === null`).
 */
export async function renderComponent(
  scene: Scene,
  component: Component,
  options: ComponentRendererOptions,
): Promise<RenderedComponent | null> {
  switch (component.kind) {
    // UI family — handled elsewhere.
    case 'Button':
    case 'Image':
    case 'Text':
    case 'TextInput':
    case 'ProgressBar':
    case 'HUDBar':
    case 'MenuList':
    case 'Container':
      return null;

    case 'Character3DRef':
      return renderCharacterRef(scene, component, options);
    case 'GameObject':
      return renderGameObject(scene, component, options);
    case 'Spawner':
      return renderSpawner(scene, component);
    case 'Trigger':
      return renderTrigger(scene, component);
    case 'Pickup':
      return renderPickup(scene, component);
    case 'Hazard':
      return renderHazard(scene, component);
    case 'Checkpoint':
      return renderCheckpoint(scene, component);
    case 'Camera':
      return renderInSceneCamera(scene, component);
    case 'Light':
      return renderLight(scene, component);
    case 'Particle':
      return renderParticle(scene, component, options);
    case 'AudioSource':
      return await renderAudioSource(scene, component, options);
    default: {
      // Exhaustiveness check: schema may add new kinds; we want a runtime
      // warning rather than a crash.
      const exhaustive: never = component;
      void exhaustive;
      return null;
    }
  }
}

// ---------------------------------------------------------------------------
// Game-family renderers
// ---------------------------------------------------------------------------

async function renderCharacterRef(
  scene: Scene,
  c: Character3DRefComponent,
  options: ComponentRendererOptions,
): Promise<RenderedComponent> {
  const char = options.characters.get(c.characterRef);
  if (!char) {
    return placeholder(scene, c, '#a855f7', 'capsule');
  }
  const instance = await loadCharacterInstance(scene, char, c, options.assetLoader);
  return {
    componentId: c.id,
    kind: c.kind,
    node: instance.root,
    character: instance,
    dispose() {
      instance.dispose();
    },
  };
}

async function renderGameObject(
  scene: Scene,
  c: GameObjectComponent,
  options: ComponentRendererOptions,
): Promise<RenderedComponent> {
  // Prefabs are engine-neutral JSON or glTF assets. We treat any registered
  // asset as glTF for now; fall back to a placeholder cube otherwise.
  const meta = options.assetLoader.getMetadata(c.prefabRef);
  if (meta && (meta.type === 'gltf' || meta.type === 'fbx')) {
    // Use a placeholder pending glTF asset import; full prefab support is
    // a follow-up (deferred to Stream-2.1 — see runner README).
    return placeholder(scene, c, '#94a3b8', 'cube');
  }
  return placeholder(scene, c, '#94a3b8', 'cube');
}

function renderSpawner(scene: Scene, c: SpawnerComponent): RenderedComponent {
  // Spawners are non-visual in production; we draw a yellow wireframe sphere
  // so the designer sees them in the prototype runner.
  return placeholder(scene, c, '#facc15', 'sphere', { wireframe: true });
}

function renderTrigger(scene: Scene, c: TriggerComponent): RenderedComponent {
  const shape =
    c.shape === 'sphere' ? 'sphere' : c.shape === 'capsule' ? 'capsule' : 'cube';
  return placeholder(scene, c, '#06b6d4', shape, { wireframe: true, alpha: 0.4 });
}

function renderPickup(scene: Scene, c: PickupComponent): RenderedComponent {
  return placeholder(scene, c, '#10b981', 'sphere', { glow: true });
}

function renderHazard(scene: Scene, c: HazardComponent): RenderedComponent {
  return placeholder(scene, c, '#ef4444', 'cube', { alpha: 0.7 });
}

function renderCheckpoint(scene: Scene, c: CheckpointComponent): RenderedComponent {
  return placeholder(scene, c, '#fbbf24', 'cylinder');
}

function renderInSceneCamera(scene: Scene, c: CameraComponent): RenderedComponent {
  // Camera-component existence is honoured by SceneBuilder via
  // `findSceneCamera`. This renderer just creates a placeholder transform
  // so downstream code can disposed it. The actual active camera is
  // chosen at scene build time.
  const node = new TransformNode(`cam-${c.id}`, scene);
  applyTransform(node, c.transform);
  return makeHandle(c, node);
}

// ---------------------------------------------------------------------------
// 3D-family renderers
// ---------------------------------------------------------------------------

function renderLight(scene: Scene, c: LightComponent): RenderedComponent {
  const t = c.transform;
  const dir = new Vector3(0, -1, 0);
  let light: HemisphericLight | DirectionalLight | PointLight | SpotLight;
  switch (c.lightType) {
    case 'directional':
      light = new DirectionalLight(`light-${c.id}`, dir, scene);
      break;
    case 'spot':
      light = new SpotLight(
        `light-${c.id}`,
        new Vector3(t.position.x, t.position.y, t.position.z),
        dir,
        Math.PI / 4,
        2,
        scene,
      );
      break;
    case 'area':
      // Babylon doesn't ship a first-class area light; emulate with
      // hemispheric for now.
      light = new HemisphericLight(`light-${c.id}`, new Vector3(0, 1, 0), scene);
      break;
    case 'point':
    default:
      light = new PointLight(
        `light-${c.id}`,
        new Vector3(t.position.x, t.position.y, t.position.z),
        scene,
      );
      break;
  }
  light.diffuse = parseHexColor(c.color);
  light.intensity = c.intensity;
  if ('shadowEnabled' in light) {
    light.shadowEnabled = c.castsShadows;
  }
  const node = new TransformNode(`light-host-${c.id}`, scene);
  applyTransform(node, c.transform);
  return {
    componentId: c.id,
    kind: c.kind,
    node,
    dispose() {
      try { light.dispose(); } catch { /* noop */ }
      try { node.dispose(); } catch { /* noop */ }
    },
  };
}

function renderParticle(
  scene: Scene,
  c: ParticleComponent,
  _options: ComponentRendererOptions,
): RenderedComponent {
  const ps = new ParticleSystem(`particles-${c.id}`, 200, scene);
  // Tiny default emitter — designers can override via Asset later.
  ps.emitter = new Vector3(c.transform.position.x, c.transform.position.y, c.transform.position.z);
  ps.minEmitPower = 0.2;
  ps.maxEmitPower = 0.8;
  ps.emitRate = 50;
  ps.minSize = 0.05;
  ps.maxSize = 0.2;
  ps.minLifeTime = 0.5;
  ps.maxLifeTime = 1.5;
  ps.color1 = new Color4(1, 1, 1, 1);
  ps.color2 = new Color4(0.7, 0.7, 0.7, 0.6);
  ps.colorDead = new Color4(0, 0, 0, 0);
  if (c.autoPlay) ps.start();
  const node = new TransformNode(`particle-host-${c.id}`, scene);
  applyTransform(node, c.transform);
  return {
    componentId: c.id,
    kind: c.kind,
    node,
    particles: ps,
    dispose() {
      try { ps.dispose(); } catch { /* noop */ }
      try { node.dispose(); } catch { /* noop */ }
    },
  };
}

async function renderAudioSource(
  scene: Scene,
  c: AudioSourceComponent,
  options: ComponentRendererOptions,
): Promise<RenderedComponent> {
  const node = new TransformNode(`audio-${c.id}`, scene);
  applyTransform(node, c.transform);

  let sound: Sound | undefined;
  try {
    const loaded = await options.assetLoader.load(c.clipRef);
    // Dynamic import so headless tests don't need WebAudio.
    const { Sound: BabylonSound } = await import('@babylonjs/core');
    sound = new BabylonSound(
      `sound-${c.id}`,
      loaded.buffer,
      scene,
      null,
      {
        autoplay: c.autoPlay,
        loop: c.loop,
        volume: c.volume,
        spatialSound: c.spatial,
      },
    );
    if (c.spatial) sound.attachToMesh(node as never);
  } catch {
    // Audio failed (WebAudio not available, fetch failed, etc.) — keep
    // the placeholder node so component bookkeeping still works.
  }
  return {
    componentId: c.id,
    kind: c.kind,
    node,
    ...(sound ? { sound } : {}),
    dispose() {
      try { sound?.dispose(); } catch { /* noop */ }
      try { node.dispose(); } catch { /* noop */ }
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a placeholder primitive node for a component. Used for stubbed
 * variants and for fallback when a referenced asset isn't loaded.
 */
function placeholder(
  scene: Scene,
  c: Component,
  hex: string,
  shape: 'cube' | 'sphere' | 'cylinder' | 'capsule',
  opts: { wireframe?: boolean; alpha?: number; glow?: boolean } = {},
): RenderedComponent {
  const node = new TransformNode(`comp-${c.id}`, scene);
  let mesh;
  switch (shape) {
    case 'sphere':
      mesh = MeshBuilder.CreateSphere(`mesh-${c.id}`, { diameter: 1 }, scene);
      break;
    case 'cylinder':
      mesh = MeshBuilder.CreateCylinder(`mesh-${c.id}`, { height: 1, diameter: 1 }, scene);
      break;
    case 'capsule':
      mesh = MeshBuilder.CreateCapsule(`mesh-${c.id}`, { height: 1.5, radius: 0.4 }, scene);
      break;
    case 'cube':
    default:
      mesh = MeshBuilder.CreateBox(`mesh-${c.id}`, { size: 1 }, scene);
      break;
  }
  mesh.parent = node;
  const mat = new StandardMaterial(`mat-${c.id}`, scene);
  mat.diffuseColor = parseHexColor(hex);
  if (opts.wireframe) mat.wireframe = true;
  if (typeof opts.alpha === 'number') mat.alpha = opts.alpha;
  if (opts.glow) {
    mat.emissiveColor = parseHexColor(hex).scale(0.6);
  }
  mesh.material = mat;
  applyTransform(node, c.transform);
  return {
    componentId: c.id,
    kind: c.kind,
    node,
    dispose() {
      try { mesh.dispose(); } catch { /* noop */ }
      try { mat.dispose(); } catch { /* noop */ }
      try { node.dispose(); } catch { /* noop */ }
    },
  };
}

function makeHandle(c: Component, node: TransformNode): RenderedComponent {
  return {
    componentId: c.id,
    kind: c.kind,
    node,
    dispose() {
      try { node.dispose(); } catch { /* noop */ }
    },
  };
}

function parseHexColor(hex: string): Color3 {
  // Accept #RRGGBB and #RRGGBBAA; ignore the alpha for Color3.
  const clean = hex.replace('#', '').slice(0, 6);
  if (clean.length !== 6) return new Color3(1, 1, 1);
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  return new Color3(r, g, b);
}

/** Re-export `parseHexColor` for tests + downstream lighting helpers. */
export const _internals = { parseHexColor };

/** Texture helper used by image-backed materials (planned, not used yet). */
export function loadAssetTexture(
  scene: Scene,
  url: string,
  name = 'asset-tex',
): Texture {
  return new Texture(url, scene, false, true, Texture.TRILINEAR_SAMPLINGMODE);
}
