/**
 * SceneBuilder: turn a single Screen into a fully wired Babylon Scene.
 *
 * The runner calls `buildSceneForScreen` once per screen transition. It
 * disposes the previous scene first; nothing in here is cached across
 * screens (except whatever the AssetLoader has in memory).
 *
 * @packageDocumentation
 */

import {
  Color3,
  Color4,
  type Engine,
  HemisphericLight,
  MeshBuilder,
  Scene,
  StandardMaterial,
  type TransformNode,
  Vector3,
} from '@babylonjs/core';
import { AdvancedDynamicTexture, type Control } from '@babylonjs/gui';

import type { Character, GameProject, Screen } from '@greybox/schema';

import type { AssetLoader } from './AssetLoader.js';
import { buildCamera } from './CameraController.js';
import {
  type RenderedComponent,
  renderComponent,
} from './ComponentRenderer.js';
import type { RunnerScreenHints } from './types.js';
import {
  renderUI,
  type ButtonClickHandler,
  type MenuItemClickHandler,
} from './UIRenderer.js';

/**
 * Bundle of everything a SceneBuilder produces for a single Screen.
 *
 * `dispose()` tears down the scene, every component handle, and the GUI
 * texture. Safe to call multiple times.
 */
export interface BuiltScene {
  scene: Scene;
  screen: Screen;
  /** Map keyed by component id. */
  components: Map<string, RenderedComponent>;
  /** Map of UI controls keyed by component id (when rendered). */
  uiNodes: Map<string, Control>;
  uiTexture: AdvancedDynamicTexture | null;
  dispose(): void;
}

export interface SceneBuilderOptions {
  engine: Engine;
  project: GameProject;
  assetLoader: AssetLoader;
  /**
   * Map of characters by id, built once when the project is loaded so
   * the SceneBuilder doesn't have to re-scan the project on each screen
   * transition.
   */
  characters: Map<string, Character>;
  /** Click handler for Button components. */
  onButtonClick: ButtonClickHandler;
  /** Click handler for MenuList items. */
  onMenuItemClick: MenuItemClickHandler;
  /** Optional runtime overrides per screen (camera kind, controls, ...). */
  screenHints?: Map<string, RunnerScreenHints>;
  /** Canvas used for camera control attach; can be null for headless. */
  canvas?: HTMLCanvasElement | null;
}

/** Convenience: bulk-index a project's characters by id. */
export function indexCharacters(project: GameProject): Map<string, Character> {
  const m = new Map<string, Character>();
  for (const c of project.characters) m.set(c.id, c);
  return m;
}

/**
 * Build a Babylon Scene for the given Screen. Async because some
 * component renderers (Character3DRef, AudioSource) await the AssetLoader.
 */
export async function buildSceneForScreen(
  screen: Screen,
  options: SceneBuilderOptions,
): Promise<BuiltScene> {
  const scene = new Scene(options.engine);
  scene.clearColor = parseClearColor(screen);

  const hints = options.screenHints?.get(screen.id);
  const is3DScreen = screenHas3D(screen);

  // 1. Camera.
  buildCamera(scene, screen, hints, options.canvas ?? null);

  // 2. Ambient light + ground for 3D screens.
  if (is3DScreen && (hints?.ambientLight ?? true)) {
    const light = new HemisphericLight('ambient', new Vector3(0, 1, 0), scene);
    light.intensity = 0.7;
    const groundSize = hints?.groundSize ?? 50;
    const ground = MeshBuilder.CreateGround(
      'ground',
      { width: groundSize, height: groundSize, subdivisions: 2 },
      scene,
    );
    const gmat = new StandardMaterial('ground-mat', scene);
    gmat.diffuseColor = new Color3(0.18, 0.18, 0.2);
    gmat.specularColor = new Color3(0, 0, 0);
    ground.material = gmat;
    ground.receiveShadows = true;
  }

  // 3. 3D / game components.
  const components = new Map<string, RenderedComponent>();
  for (const c of screen.components) {
    const handle = await renderComponent(scene, c, {
      assetLoader: options.assetLoader,
      characters: options.characters,
    });
    if (handle) {
      components.set(c.id, handle);
      reparentBySchemaParent(c.id, c.parent ?? null, components);
    }
  }

  // 4. UI overlay (always built, but only contains UI components).
  const ui = renderUI(scene, screen.components, {
    assetLoader: options.assetLoader,
    onButtonClick: options.onButtonClick,
    onMenuItemClick: options.onMenuItemClick,
  });

  return {
    scene,
    screen,
    components,
    uiNodes: ui.nodes,
    uiTexture: ui.texture,
    dispose() {
      for (const handle of components.values()) {
        try { handle.dispose(); } catch { /* noop */ }
      }
      components.clear();
      try { ui.texture.dispose(); } catch { /* noop */ }
      try { scene.dispose(); } catch { /* noop */ }
    },
  };
}

/** Heuristic: does a Screen contain any 3D / game component? */
export function screenHas3D(screen: Screen): boolean {
  for (const c of screen.components) {
    switch (c.kind) {
      case 'Character3DRef':
      case 'GameObject':
      case 'Spawner':
      case 'Trigger':
      case 'Pickup':
      case 'Hazard':
      case 'Checkpoint':
      case 'Camera':
      case 'Light':
      case 'Particle':
      case 'AudioSource':
        return true;
      default:
        continue;
    }
  }
  return false;
}

function parseClearColor(screen: Screen): Color4 {
  if (!screen.background) {
    return new Color4(0.05, 0.05, 0.07, 1);
  }
  if (screen.background.type === 'color') {
    const c = screen.background.color.replace('#', '');
    const r = parseInt(c.slice(0, 2), 16) / 255;
    const g = parseInt(c.slice(2, 4), 16) / 255;
    const b = parseInt(c.slice(4, 6), 16) / 255;
    const a = c.length >= 8 ? parseInt(c.slice(6, 8), 16) / 255 : 1;
    return new Color4(r, g, b, a);
  }
  // Asset background: fallback to a neutral until we wire skyboxes.
  return new Color4(0.05, 0.05, 0.07, 1);
}

function reparentBySchemaParent(
  componentId: string,
  parentId: string | null,
  registry: Map<string, RenderedComponent>,
): void {
  if (!parentId) return;
  const child = registry.get(componentId);
  const parent = registry.get(parentId);
  if (!child || !parent) return;
  if (!child.node || !parent.node) return;
  (child.node as TransformNode).parent = parent.node;
}
