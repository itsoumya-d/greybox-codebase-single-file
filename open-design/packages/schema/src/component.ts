/**
 * Component entities: the leaf objects placed inside a {@link Screen}.
 *
 * A Component is a tagged union discriminated by `kind`. Three families:
 *
 * - **UI**: `Button`, `Image`, `Text`, `TextInput`, `ProgressBar`,
 *   `HUDBar`, `MenuList`, `Container`.
 * - **Game**: `Character3DRef` (points at a {@link Character}),
 *   `GameObject`, `Spawner`, `Trigger`, `Pickup`, `Hazard`, `Checkpoint`,
 *   `Camera`.
 * - **3D**: `Light`, `Particle`, `AudioSource`.
 *
 * All components share {@link ComponentBaseSchema}: id, name, transform,
 * optional parent component id (for nested containers), and an open
 * `properties` bag for kind-specific overrides we haven't formalised yet.
 *
 * Adding a new kind: see README.md → "How to add a new component kind".
 *
 * @packageDocumentation
 */

import { z } from 'zod';

import { AssetIdSchema, CharacterIdSchema, ComponentIdSchema } from './ids.js';

// -------------------------------------------------------------------------
// Shared building blocks
// -------------------------------------------------------------------------

/**
 * 3D transform. Position, rotation (Euler XYZ in degrees), and uniform-or-
 * per-axis scale. 2D UI components use only the XY plane and ignore Z.
 */
export const TransformSchema = z.object({
  position: z.object({ x: z.number(), y: z.number(), z: z.number() }),
  rotation: z.object({ x: z.number(), y: z.number(), z: z.number() }),
  scale: z.object({ x: z.number(), y: z.number(), z: z.number() }),
});
/** Inferred type for {@link TransformSchema}. */
export type Transform = z.infer<typeof TransformSchema>;

/**
 * Fields every component carries regardless of kind. Discriminated-union
 * variants extend this via `z.object({ ...ComponentBaseShape, kind: ..., ... })`.
 */
export const ComponentBaseShape = {
  id: ComponentIdSchema,
  name: z.string().min(1),
  transform: TransformSchema,
  /** Component id of the parent if this component is nested. */
  parent: ComponentIdSchema.nullable().optional(),
  /** Whether the component is visible / active in-runtime. */
  visible: z.boolean().default(true),
  /**
   * Open property bag for kind-specific overrides not yet formalised.
   * Used as an escape hatch; prefer adding a typed field on the variant.
   */
  properties: z.record(z.string(), z.unknown()).optional(),
} as const;

/** ZodObject form of {@link ComponentBaseShape}, used by external consumers. */
export const ComponentBaseSchema = z.object(ComponentBaseShape);
/** Inferred type for {@link ComponentBaseSchema}. */
export type ComponentBase = z.infer<typeof ComponentBaseSchema>;

// -------------------------------------------------------------------------
// UI components
// -------------------------------------------------------------------------

/** Clickable button with label, optional icon asset, and on-click flow trigger. */
export const ButtonComponentSchema = z.object({
  ...ComponentBaseShape,
  kind: z.literal('Button'),
  label: z.string(),
  iconAssetRef: AssetIdSchema.optional(),
  /** Optional event id, used by FlowEdge.trigger.scriptEvent. */
  onClickEvent: z.string().min(1).optional(),
});
/** Inferred {@link ButtonComponentSchema} type. */
export type ButtonComponent = z.infer<typeof ButtonComponentSchema>;

/** Static image (texture). */
export const ImageComponentSchema = z.object({
  ...ComponentBaseShape,
  kind: z.literal('Image'),
  assetRef: AssetIdSchema,
  altText: z.string().optional(),
});
/** Inferred {@link ImageComponentSchema} type. */
export type ImageComponent = z.infer<typeof ImageComponentSchema>;

/** Text label. */
export const TextComponentSchema = z.object({
  ...ComponentBaseShape,
  kind: z.literal('Text'),
  content: z.string(),
  /** Font family name; resolution is left to engine importers. */
  font: z.string().optional(),
  fontSize: z.number().positive().optional(),
  /** Hex colour `#RRGGBB` or `#RRGGBBAA`. */
  color: z.string().regex(/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/).optional(),
});
/** Inferred {@link TextComponentSchema} type. */
export type TextComponent = z.infer<typeof TextComponentSchema>;

/** Free-text input field. */
export const TextInputComponentSchema = z.object({
  ...ComponentBaseShape,
  kind: z.literal('TextInput'),
  placeholder: z.string().optional(),
  maxLength: z.number().int().positive().optional(),
  /** Field type hint for engines that distinguish (password, email, ...). */
  inputType: z.enum(['text', 'password', 'email', 'number']).default('text'),
});
/** Inferred {@link TextInputComponentSchema} type. */
export type TextInputComponent = z.infer<typeof TextInputComponentSchema>;

/** Bounded progress bar (e.g. loading screens). */
export const ProgressBarComponentSchema = z.object({
  ...ComponentBaseShape,
  kind: z.literal('ProgressBar'),
  min: z.number(),
  max: z.number(),
  value: z.number(),
});
/** Inferred {@link ProgressBarComponentSchema} type. */
export type ProgressBarComponent = z.infer<typeof ProgressBarComponentSchema>;

/** Health/mana-style runtime HUD bar bound to a game stat. */
export const HUDBarComponentSchema = z.object({
  ...ComponentBaseShape,
  kind: z.literal('HUDBar'),
  /** Stat key on the player character, e.g. "hp" or "mana". */
  statKey: z.string().min(1),
  /** Display style. */
  style: z.enum(['bar', 'radial', 'segmented']).default('bar'),
});
/** Inferred {@link HUDBarComponentSchema} type. */
export type HUDBarComponent = z.infer<typeof HUDBarComponentSchema>;

/** Selectable list of menu items. */
export const MenuListComponentSchema = z.object({
  ...ComponentBaseShape,
  kind: z.literal('MenuList'),
  items: z
    .array(
      z.object({
        id: z.string().min(1),
        label: z.string(),
        /** Optional event id for this item. */
        event: z.string().min(1).optional(),
      }),
    )
    .min(1),
});
/** Inferred {@link MenuListComponentSchema} type. */
export type MenuListComponent = z.infer<typeof MenuListComponentSchema>;

/**
 * Layout container: a component whose children are other components that
 * declare it as their `parent`. Carries layout hints but no own visuals.
 */
export const ContainerComponentSchema = z.object({
  ...ComponentBaseShape,
  kind: z.literal('Container'),
  layout: z.enum(['stack-vertical', 'stack-horizontal', 'grid', 'absolute']).default('absolute'),
  /** Gap in pixels between children for stack layouts. */
  gap: z.number().nonnegative().optional(),
});
/** Inferred {@link ContainerComponentSchema} type. */
export type ContainerComponent = z.infer<typeof ContainerComponentSchema>;

// -------------------------------------------------------------------------
// Game components
// -------------------------------------------------------------------------

/** In-scene reference to a {@link Character}. */
export const Character3DRefComponentSchema = z.object({
  ...ComponentBaseShape,
  kind: z.literal('Character3DRef'),
  characterRef: CharacterIdSchema,
  /** Optional initial animation clip name to play. */
  initialAnimation: z.string().min(1).optional(),
});
/** Inferred {@link Character3DRefComponentSchema} type. */
export type Character3DRefComponent = z.infer<typeof Character3DRefComponentSchema>;

/** Generic engine prefab reference. */
export const GameObjectComponentSchema = z.object({
  ...ComponentBaseShape,
  kind: z.literal('GameObject'),
  /** Asset id of a prefab (engine-neutral JSON or per-engine .prefab/.uasset). */
  prefabRef: AssetIdSchema,
});
/** Inferred {@link GameObjectComponentSchema} type. */
export type GameObjectComponent = z.infer<typeof GameObjectComponentSchema>;

/** Spawns instances of a prefab at intervals or on triggers. */
export const SpawnerComponentSchema = z.object({
  ...ComponentBaseShape,
  kind: z.literal('Spawner'),
  prefabRef: AssetIdSchema,
  /** Interval in seconds. `null` = manual / event-driven. */
  intervalSeconds: z.number().positive().nullable(),
  /** Cap on simultaneously live spawned instances. */
  maxAlive: z.number().int().positive().optional(),
});
/** Inferred {@link SpawnerComponentSchema} type. */
export type SpawnerComponent = z.infer<typeof SpawnerComponentSchema>;

/** Volume that fires a scripted event when the player enters it. */
export const TriggerComponentSchema = z.object({
  ...ComponentBaseShape,
  kind: z.literal('Trigger'),
  shape: z.enum(['box', 'sphere', 'capsule']).default('box'),
  /** Event id to fire. Receivers wire this via FlowEdge.trigger. */
  eventId: z.string().min(1),
  /** If true, fires only once per playthrough. */
  oneShot: z.boolean().default(false),
});
/** Inferred {@link TriggerComponentSchema} type. */
export type TriggerComponent = z.infer<typeof TriggerComponentSchema>;

/** Collectable that grants a stat / item on pickup. */
export const PickupComponentSchema = z.object({
  ...ComponentBaseShape,
  kind: z.literal('Pickup'),
  /** Stat to grant on pickup (e.g. "hp", "score"). */
  grantStat: z.string().min(1),
  /** Amount of the stat granted. */
  amount: z.number(),
  /** If true, the pickup respawns after `respawnSeconds`. */
  respawn: z.boolean().default(false),
  respawnSeconds: z.number().positive().optional(),
});
/** Inferred {@link PickupComponentSchema} type. */
export type PickupComponent = z.infer<typeof PickupComponentSchema>;

/** Volume that damages or kills the player. */
export const HazardComponentSchema = z.object({
  ...ComponentBaseShape,
  kind: z.literal('Hazard'),
  /** Damage per second while in contact. */
  damagePerSecond: z.number().nonnegative(),
  /** If true, instantly kills regardless of HP. */
  instakill: z.boolean().default(false),
});
/** Inferred {@link HazardComponentSchema} type. */
export type HazardComponent = z.infer<typeof HazardComponentSchema>;

/** Save-point / respawn anchor. */
export const CheckpointComponentSchema = z.object({
  ...ComponentBaseShape,
  kind: z.literal('Checkpoint'),
  /** Unique label so save-game state can reference it. */
  checkpointId: z.string().min(1),
  /** If true, this checkpoint heals the player to full on activation. */
  heals: z.boolean().default(true),
});
/** Inferred {@link CheckpointComponentSchema} type. */
export type CheckpointComponent = z.infer<typeof CheckpointComponentSchema>;

/** Camera (in-scene). */
export const CameraComponentSchema = z.object({
  ...ComponentBaseShape,
  kind: z.literal('Camera'),
  projection: z.enum(['perspective', 'orthographic']).default('perspective'),
  /** Vertical field of view in degrees (perspective only). */
  fov: z.number().positive().optional(),
  /** Whether this camera is the default at scene start. */
  isMain: z.boolean().default(false),
});
/** Inferred {@link CameraComponentSchema} type. */
export type CameraComponent = z.infer<typeof CameraComponentSchema>;

// -------------------------------------------------------------------------
// 3D components
// -------------------------------------------------------------------------

/** Scene light. */
export const LightComponentSchema = z.object({
  ...ComponentBaseShape,
  kind: z.literal('Light'),
  lightType: z.enum(['directional', 'point', 'spot', 'area']).default('point'),
  /** Hex colour `#RRGGBB`. */
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  /** Intensity in engine-neutral units (importers map to their own scale). */
  intensity: z.number().nonnegative(),
  /** Cast shadows? */
  castsShadows: z.boolean().default(true),
});
/** Inferred {@link LightComponentSchema} type. */
export type LightComponent = z.infer<typeof LightComponentSchema>;

/** Particle system reference. */
export const ParticleComponentSchema = z.object({
  ...ComponentBaseShape,
  kind: z.literal('Particle'),
  /** Asset id of the particle definition (engine-neutral JSON or per-engine asset). */
  effectRef: AssetIdSchema,
  /** If true, plays automatically on scene load. */
  autoPlay: z.boolean().default(true),
  loop: z.boolean().default(true),
});
/** Inferred {@link ParticleComponentSchema} type. */
export type ParticleComponent = z.infer<typeof ParticleComponentSchema>;

/** Positional or 2D audio source. */
export const AudioSourceComponentSchema = z.object({
  ...ComponentBaseShape,
  kind: z.literal('AudioSource'),
  clipRef: AssetIdSchema,
  /** Linear gain 0..1. */
  volume: z.number().min(0).max(1).default(1),
  loop: z.boolean().default(false),
  /** True = 3D spatialised audio; false = stereo / UI sfx. */
  spatial: z.boolean().default(true),
  /** Auto-play on scene load? */
  autoPlay: z.boolean().default(false),
});
/** Inferred {@link AudioSourceComponentSchema} type. */
export type AudioSourceComponent = z.infer<typeof AudioSourceComponentSchema>;

// -------------------------------------------------------------------------
// Discriminated union
// -------------------------------------------------------------------------

/**
 * The Component discriminated union. Use `Component.kind` as the
 * discriminator in switch statements; TypeScript will exhaustively narrow.
 */
export const ComponentSchema = z.discriminatedUnion('kind', [
  // UI
  ButtonComponentSchema,
  ImageComponentSchema,
  TextComponentSchema,
  TextInputComponentSchema,
  ProgressBarComponentSchema,
  HUDBarComponentSchema,
  MenuListComponentSchema,
  ContainerComponentSchema,
  // Game
  Character3DRefComponentSchema,
  GameObjectComponentSchema,
  SpawnerComponentSchema,
  TriggerComponentSchema,
  PickupComponentSchema,
  HazardComponentSchema,
  CheckpointComponentSchema,
  CameraComponentSchema,
  // 3D
  LightComponentSchema,
  ParticleComponentSchema,
  AudioSourceComponentSchema,
]);
/** Inferred type for {@link ComponentSchema}. */
export type Component = z.infer<typeof ComponentSchema>;

/**
 * String literal union of every supported `kind` discriminator. Useful for
 * UI palettes and code-generation.
 */
export type ComponentKind = Component['kind'];

/** All component kinds, in the order they appear in {@link ComponentSchema}. */
export const COMPONENT_KINDS: readonly ComponentKind[] = [
  'Button',
  'Image',
  'Text',
  'TextInput',
  'ProgressBar',
  'HUDBar',
  'MenuList',
  'Container',
  'Character3DRef',
  'GameObject',
  'Spawner',
  'Trigger',
  'Pickup',
  'Hazard',
  'Checkpoint',
  'Camera',
  'Light',
  'Particle',
  'AudioSource',
];
