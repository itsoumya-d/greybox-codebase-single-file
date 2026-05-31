/**
 * Character entity: a 3D character with mesh, rig, animations, and stats.
 *
 * A character is engine-agnostic: it points at a mesh asset (typically
 * glTF) and a set of animation clip assets, plus a joint list using
 * Mixamo-standard names so all importers can re-target the rig.
 *
 * Game stats are deliberately extensible (open `Record<string, number>`)
 * so each genre can attach its own derived numbers without us churning
 * the schema.
 *
 * @packageDocumentation
 */

import { z } from 'zod';

import {
  AnimationClipIdSchema,
  AssetIdSchema,
  CharacterIdSchema,
} from './ids.js';

/**
 * Canonical Mixamo rig joint names. These are the names every importer
 * (Unity/Unreal/Godot plugins) knows how to re-target.
 *
 * Non-Mixamo joints are still accepted by the schema but
 * {@link findNonStandardJoints} will flag them so callers can warn.
 */
export const MIXAMO_STANDARD_JOINTS: readonly string[] = [
  'mixamorig:Hips',
  'mixamorig:Spine',
  'mixamorig:Spine1',
  'mixamorig:Spine2',
  'mixamorig:Neck',
  'mixamorig:Head',
  'mixamorig:HeadTop_End',
  'mixamorig:LeftShoulder',
  'mixamorig:LeftArm',
  'mixamorig:LeftForeArm',
  'mixamorig:LeftHand',
  'mixamorig:RightShoulder',
  'mixamorig:RightArm',
  'mixamorig:RightForeArm',
  'mixamorig:RightHand',
  'mixamorig:LeftUpLeg',
  'mixamorig:LeftLeg',
  'mixamorig:LeftFoot',
  'mixamorig:LeftToeBase',
  'mixamorig:LeftToe_End',
  'mixamorig:RightUpLeg',
  'mixamorig:RightLeg',
  'mixamorig:RightFoot',
  'mixamorig:RightToeBase',
  'mixamorig:RightToe_End',
];

/**
 * A single rig joint. We track the parent name so consumers can rebuild
 * the skeleton hierarchy without a recursive schema.
 */
export const RigJointSchema = z.object({
  name: z.string().min(1),
  /** Parent joint name. `null` for the root joint. */
  parent: z.string().min(1).nullable(),
});
/** Inferred type for {@link RigJointSchema}. */
export type RigJoint = z.infer<typeof RigJointSchema>;

/**
 * Skeleton: an ordered, flat list of joints. Order is the importer's
 * canonical traversal order (root-first / depth-first).
 */
export const RigSchema = z.object({
  joints: z.array(RigJointSchema).min(1, 'rig must have at least one joint'),
});
/** Inferred type for {@link RigSchema}. */
export type Rig = z.infer<typeof RigSchema>;

/**
 * An animation clip slot on a character. References an Asset by id (the
 * actual clip data lives there) but adds character-local metadata
 * (name, duration, loop flag).
 */
export const AnimationClipSchema = z.object({
  id: AnimationClipIdSchema,
  /** Human-readable label, e.g. "idle", "walk_forward", "attack_light". */
  name: z.string().min(1),
  /** Asset id of the clip payload (usually a glTF animation or .fbx). */
  clipRef: AssetIdSchema,
  /** Clip duration in seconds. Must be positive. */
  duration: z.number().positive(),
  /** Whether the clip is meant to loop in-engine. */
  loop: z.boolean(),
});
/** Inferred type for {@link AnimationClipSchema}. */
export type AnimationClip = z.infer<typeof AnimationClipSchema>;

/**
 * Game stats are intentionally an open record. Common keys:
 *   - `hp`, `speed`, `damage`, `defense`, `stamina`, `mana`, `critChance`
 *
 * Consumers are free to add genre-specific keys.
 */
export const GameStatsSchema = z
  .record(z.string().min(1), z.number())
  .refine(
    (stats) =>
      ['hp', 'speed', 'damage', 'defense'].every((key) => key in stats),
    {
      message:
        'gameStats must include hp, speed, damage, defense (additional keys allowed)',
    },
  );
/** Inferred type for {@link GameStatsSchema}. */
export type GameStats = z.infer<typeof GameStatsSchema>;

/**
 * Provenance block specific to characters (separate from {@link AssetProvenance}
 * because characters can be authored / generated independently of any one
 * asset file).
 */
export const CharacterProvenanceSchema = z.object({
  /** Free-form generator id, e.g. "tripo3d", "meshy", "human", "ready-player-me". */
  genProvider: z.string().min(1).optional(),
  /** Prompt or recipe used to generate the character. */
  prompt: z.string().optional(),
  /** Deterministic seed at generation time. */
  seed: z.number().int().optional(),
  /** License of the character (SPDX or free-form). */
  license: z.string().min(1).optional(),
});
/** Inferred type for {@link CharacterProvenanceSchema}. */
export type CharacterProvenance = z.infer<typeof CharacterProvenanceSchema>;

/**
 * Character entity.
 *
 * @example
 * ```ts
 * const goblin: Character = {
 *   id: 'char-goblin' as CharacterId,
 *   name: 'Goblin',
 *   meshRef: 'asset-goblin-gltf' as AssetId,
 *   rig: { joints: [{ name: 'mixamorig:Hips', parent: null }, ...] },
 *   animations: [...],
 *   gameStats: { hp: 30, speed: 2, damage: 5, defense: 1 },
 *   provenance: { genProvider: 'tripo3d', license: 'CC-BY-4.0' },
 * };
 * ```
 */
export const CharacterSchema = z.object({
  id: CharacterIdSchema,
  /** Display name, e.g. "Player Hero", "Goblin Grunt". */
  name: z.string().min(1),
  /** Asset id of the mesh, typically glTF. */
  meshRef: AssetIdSchema,
  rig: RigSchema,
  animations: z.array(AnimationClipSchema),
  gameStats: GameStatsSchema,
  provenance: CharacterProvenanceSchema,
});
/** Inferred type for {@link CharacterSchema}. */
export type Character = z.infer<typeof CharacterSchema>;

/**
 * Return the joint names in `rig` that are NOT in the Mixamo standard
 * set. Useful for warning users that the rig may not retarget cleanly
 * across all engines.
 *
 * @example
 * ```ts
 * const nonStandard = findNonStandardJoints(character.rig);
 * if (nonStandard.length) console.warn('Non-Mixamo joints:', nonStandard);
 * ```
 */
export function findNonStandardJoints(rig: Rig): string[] {
  const standard = new Set(MIXAMO_STANDARD_JOINTS);
  return rig.joints
    .map((j) => j.name)
    .filter((name) => !standard.has(name));
}
