/**
 * Project metadata block.
 *
 * Lives at `GameProject.meta`. Captures identity (id, name), business
 * context (genre, target audience), and runtime targets (engines, platforms).
 *
 * @packageDocumentation
 */

import { z } from 'zod';

import { ProjectIdSchema } from './ids.js';

/**
 * Supported target engines. Closed set — adding a new engine here is
 * intentionally a breaking change because importers / plugins must ship
 * alongside.
 */
export const TargetEngineSchema = z.enum(['unity', 'unreal', 'godot', 'web']);
/** Inferred type. */
export type TargetEngine = z.infer<typeof TargetEngineSchema>;

/**
 * Supported runtime platforms. Closed set; expanded as plugins gain
 * platform coverage.
 */
export const PlatformSchema = z.enum([
  'ios',
  'android',
  'windows',
  'macos',
  'linux',
  'web',
  'switch',
  'ps5',
  'xbox-series',
]);
/** Inferred type. */
export type Platform = z.infer<typeof PlatformSchema>;

/**
 * Coarse genre taxonomy. Drives default agent prompts inside Greybox
 * Studio (e.g. "platformer" → camera + side-scroll templates).
 */
export const GenreSchema = z.enum([
  'platformer',
  'rpg',
  'shooter',
  'puzzle',
  'racing',
  'strategy',
  'simulation',
  'sports',
  'fighting',
  'adventure',
  'horror',
  'survival',
  'card',
  'idle',
  'roguelike',
  'visual-novel',
  'sandbox',
  'mmo',
  'other',
]);
/** Inferred type. */
export type Genre = z.infer<typeof GenreSchema>;

/**
 * Project metadata: identity, classification, targets.
 *
 * `version` here is the **project**'s SemVer (set by the user), not the
 * schema version — those are independent.
 */
export const ProjectMetaSchema = z.object({
  id: ProjectIdSchema,
  /** Human-readable project name. */
  name: z.string().min(1),
  /** Project SemVer (independent from schemaVersion). */
  version: z
    .string()
    .regex(
      /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/,
      'project version must be SemVer (e.g. 1.0.0 or 1.0.0-beta.1)',
    ),
  genre: GenreSchema,
  /** Engines the project intends to ship to. Must be non-empty. */
  targetEngines: z.array(TargetEngineSchema).min(1),
  /** Platforms the project intends to ship to. Must be non-empty. */
  platforms: z.array(PlatformSchema).min(1),
  /** Optional one-line elevator pitch. */
  tagline: z.string().optional(),
  /** Optional longer description. */
  description: z.string().optional(),
  /** ISO-8601 timestamp the project was created. */
  createdAt: z.string().datetime().optional(),
  /** ISO-8601 timestamp of the last save. */
  updatedAt: z.string().datetime().optional(),
  /** Free-form author name or list. */
  author: z.string().optional(),
});
/** Inferred type for {@link ProjectMetaSchema}. */
export type ProjectMeta = z.infer<typeof ProjectMetaSchema>;
