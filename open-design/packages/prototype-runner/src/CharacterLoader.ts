/**
 * CharacterLoader: loads a Character's mesh and animation clips into a
 * Babylon Scene, returning a thin AnimationPlayer handle.
 *
 * The schema marks each Character with a `meshRef` (typically glTF/glb)
 * plus an `animations[]` array of clip refs. We load the mesh once per
 * character; animations come along with the glTF for simple projects, or
 * are loaded on demand from separate assets.
 *
 * @packageDocumentation
 */

import {
  type AbstractMesh,
  type AnimationGroup,
  ImportMeshAsync,
  type Scene,
  TransformNode,
  Vector3,
} from '@babylonjs/core';

import type { Character, Component, Transform } from '@greybox/schema';

import type { AssetLoader, LoadedAsset } from './AssetLoader.js';
import type { PlayAnimationOptions } from './types.js';

/**
 * Player-style handle exposed to the runner so it can play / stop / blend
 * named animation clips on a character.
 */
export interface AnimationPlayer {
  /** All loaded clip groups by clip name. */
  readonly clips: ReadonlyMap<string, AnimationGroup>;
  /** Currently playing clip name (or null). */
  readonly current: string | null;
  /**
   * Play the named clip. If `transitionSeconds > 0`, blends from the
   * currently-playing clip. Returns the new AnimationGroup, or null when
   * the clip is not known.
   */
  play(clipName: string, options?: PlayAnimationOptions): AnimationGroup | null;
  /** Stop all clips. */
  stop(): void;
  /** Dispose all loaded animation groups. */
  dispose(): void;
}

/**
 * In-scene character handle. Returned from {@link loadCharacterInstance}.
 */
export interface CharacterInstance {
  readonly characterId: string;
  /** Root transform node parenting the mesh hierarchy. */
  readonly root: TransformNode;
  /** Loaded meshes (excluding the root container __root__). */
  readonly meshes: AbstractMesh[];
  /** Animation player keyed by clip name. */
  readonly player: AnimationPlayer;
  dispose(): void;
}

/**
 * Apply a schema Transform to a Babylon TransformNode.
 *
 * Schema rotations are Euler XYZ in degrees; Babylon expects radians.
 */
export function applyTransform(node: TransformNode, t: Transform): void {
  node.position = new Vector3(t.position.x, t.position.y, t.position.z);
  node.rotation = new Vector3(
    (t.rotation.x * Math.PI) / 180,
    (t.rotation.y * Math.PI) / 180,
    (t.rotation.z * Math.PI) / 180,
  );
  node.scaling = new Vector3(t.scale.x, t.scale.y, t.scale.z);
}

/**
 * Builds an AnimationPlayer over a Babylon AnimationGroup list.
 *
 * Exported for tests + reuse from any code that already has loaded
 * AnimationGroups (e.g. from a manually authored Babylon scene).
 */
export function buildAnimationPlayer(
  groups: AnimationGroup[],
  character: Character,
): AnimationPlayer {
  const clips = new Map<string, AnimationGroup>();
  // First try to map AnimationGroups to clip names from the character.
  const byName = new Map<string, AnimationGroup>();
  for (const g of groups) byName.set(g.name, g);
  for (const clip of character.animations) {
    const match = byName.get(clip.name) ?? byName.get(`mixamo.com|${clip.name}`);
    if (match) {
      clips.set(clip.name, match);
      match.loopAnimation = clip.loop;
    } else if (byName.size > 0) {
      // Fallback: assume first animation == idle if char has only one clip.
      const first = groups[0];
      if (first && !clips.has(clip.name)) {
        clips.set(clip.name, first);
        first.loopAnimation = clip.loop;
      }
    }
  }
  // Also expose unmapped groups under their raw name so consumers can play
  // animations the schema doesn't enumerate.
  for (const g of groups) {
    if (!clips.has(g.name)) clips.set(g.name, g);
  }

  let current: string | null = null;

  return {
    get clips() {
      return clips;
    },
    get current() {
      return current;
    },
    play(clipName, options) {
      const next = clips.get(clipName);
      if (!next) return null;
      const transition = options?.transitionSeconds ?? 0.3;
      const speed = options?.speed ?? 1.0;
      const loop = options?.loop ?? next.loopAnimation;
      if (current) {
        const prev = clips.get(current);
        if (prev && prev !== next) {
          // Simple blend: ramp prev weight to 0, next from 0 → 1.
          try {
            prev.enableBlending = true;
            prev.blendingSpeed = 1 / Math.max(transition, 0.01) / 60;
          } catch {
            /* noop if blending not supported */
          }
        }
      }
      next.reset();
      next.speedRatio = speed;
      next.loopAnimation = loop;
      next.start(loop, speed);
      current = clipName;
      return next;
    },
    stop() {
      for (const g of clips.values()) g.stop();
      current = null;
    },
    dispose() {
      for (const g of clips.values()) {
        try {
          g.dispose();
        } catch {
          /* noop */
        }
      }
      clips.clear();
      current = null;
    },
  };
}

/**
 * Load a character's mesh + animations and place an instance in the scene.
 *
 * - `character.meshRef` is fetched via `assetLoader.load()`.
 * - The resulting glTF AnimationGroups are wrapped in an AnimationPlayer.
 * - The `component` provides the placement Transform.
 *
 * If the mesh fails to load, returns a stub instance with no meshes so the
 * runner can keep rendering the rest of the scene.
 */
export async function loadCharacterInstance(
  scene: Scene,
  character: Character,
  component: Component,
  assetLoader: AssetLoader,
): Promise<CharacterInstance> {
  const root = new TransformNode(`character-${character.id}`, scene);
  applyTransform(root, component.transform);

  let meshes: AbstractMesh[] = [];
  let groups: AnimationGroup[] = [];

  try {
    const loaded: LoadedAsset = await assetLoader.load(character.meshRef);
    const result = await ImportMeshAsync(loaded.objectUrl, scene, {
      // glb extension is implied by mime; let Babylon sniff via URL hint.
      pluginExtension: loaded.asset.type === 'gltf' ? '.glb' : undefined,
    });
    meshes = result.meshes;
    groups = result.animationGroups ?? [];
    for (const m of meshes) {
      // Re-parent into our root so transforms compose cleanly.
      if (!m.parent) m.parent = root;
    }
  } catch (err) {
    // Mesh failed: emit a placeholder capsule so the screen isn't empty.
    // We avoid throwing so the rest of the screen still renders.
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.warn(`Failed to load character ${character.id}: ${errorMessage}`);
  }

  const player = buildAnimationPlayer(groups, character);
  // Auto-play initial animation if specified on the component.
  if (
    component.kind === 'Character3DRef' &&
    component.initialAnimation &&
    player.clips.has(component.initialAnimation)
  ) {
    player.play(component.initialAnimation);
  } else if (player.clips.has('idle')) {
    player.play('idle');
  }

  return {
    characterId: character.id,
    root,
    meshes,
    player,
    dispose() {
      player.dispose();
      for (const m of meshes) {
        try {
          m.dispose();
        } catch {
          /* noop */
        }
      }
      try {
        root.dispose();
      } catch {
        /* noop */
      }
    },
  };
}
