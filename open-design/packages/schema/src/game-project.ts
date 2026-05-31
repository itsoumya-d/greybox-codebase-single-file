/**
 * GameProject: the root entity that aggregates every other entity in the
 * canonical Greybox Studio schema.
 *
 * Serialised form is a single JSON document. The `schemaVersion` field is
 * a literal — payloads with the wrong version are rejected by the
 * validators in this module and should be routed through `migrate`.
 *
 * @packageDocumentation
 */

import { z, ZodError } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { JsonSchema7Type } from 'zod-to-json-schema';

import { ArtSchema } from './art.js';
import { AssetSchema } from './asset.js';
import { CharacterSchema } from './character.js';
import { ComponentSchema } from './component.js';
import { ExportPolicySchema } from './export-policy.js';
import { FlowEdgeSchema } from './flow.js';
import { ProjectMetaSchema } from './meta.js';
import { ScreenSchema } from './screen.js';
import { SCHEMA_VERSION, SchemaVersionSchema } from './version.js';

/**
 * The single canonical Greybox Studio game-project document.
 *
 * Fields:
 * - `schemaVersion` — must equal {@link SCHEMA_VERSION}. Rejected otherwise.
 * - `meta` — identity, classification, target engines / platforms.
 * - `art` — palette, typography, shared materials.
 * - `exportPolicy` — per-engine settings consumed by the plugins.
 * - `assets` — all binary blobs referenced by other entities.
 * - `characters` — 3D characters with rig + animations + stats.
 * - `screens` — pages / scenes / levels with components.
 * - `flow` — directed edges describing screen-to-screen transitions.
 */
export const GameProjectSchema = z.object({
  schemaVersion: SchemaVersionSchema,
  meta: ProjectMetaSchema,
  art: ArtSchema,
  exportPolicy: ExportPolicySchema,
  assets: z.array(AssetSchema),
  characters: z.array(CharacterSchema),
  screens: z.array(ScreenSchema).min(1, 'a game project must have at least one screen'),
  flow: z.array(FlowEdgeSchema),
});
/** Inferred type for {@link GameProjectSchema}. */
export type GameProject = z.infer<typeof GameProjectSchema>;

/**
 * Strict parser: throws {@link ZodError} on any invalid input.
 *
 * Use this when you want to fail loudly (loading a saved project,
 * importing from an API). For graceful handling, use
 * {@link safeParseGameProject}.
 */
export function validateGameProject(input: unknown): GameProject {
  return GameProjectSchema.parse(input);
}

/**
 * Non-throwing parser. Returns Zod's discriminated result:
 *
 * ```ts
 * const result = safeParseGameProject(input);
 * if (!result.success) {
 *   for (const issue of result.error.issues) console.error(issue);
 *   return;
 * }
 * const project = result.data;
 * ```
 */
export function safeParseGameProject(
  input: unknown,
): z.SafeParseReturnType<unknown, GameProject> {
  return GameProjectSchema.safeParse(input);
}

/**
 * Re-export of {@link ZodError} so consumers don't need a separate Zod
 * import for error-narrowing.
 */
export { ZodError };

/**
 * Build a fresh empty GameProject scaffold pinned to {@link SCHEMA_VERSION}.
 * Useful for editors creating a new project from a single command.
 *
 * The returned object will FAIL validation because it has no screens and
 * minimal meta — callers must populate {@link ProjectMetaSchema.shape.id}
 * and add at least one Screen / palette / typography style before saving.
 */
export function emptyGameProjectScaffold(): unknown {
  return {
    schemaVersion: SCHEMA_VERSION,
    meta: {
      // id intentionally absent; caller must fill in.
      name: 'Untitled Project',
      version: '0.1.0',
      genre: 'other',
      targetEngines: ['unity'],
      platforms: ['windows'],
    },
    art: {
      palette: { name: 'default', colors: [{ role: 'primary', hex: '#000000' }] },
      typography: { styles: [{ role: 'body', family: 'Inter', size: 16, weight: 400, lineHeight: 1.4 }] },
      materials: [],
    },
    exportPolicy: {
      unity: { renderPipeline: 'urp', inputSystem: 'new', scriptingBackend: 'il2cpp' },
      unreal: { engineVersion: '5.5', inputSystem: 'enhanced' },
      godot: { engineVersion: '4.4', renderer: 'forward+' },
    },
    assets: [],
    characters: [],
    screens: [],
    flow: [],
  };
}

// ---------------------------------------------------------------------------
// JSON Schema emission
// ---------------------------------------------------------------------------

/**
 * Map of top-level entity names → JSON Schema (draft-7) representations.
 *
 * Use this to feed external validators (Unity / Unreal / Godot plugins
 * written in C# / C++ / GDScript) without re-implementing the Zod logic
 * in their language.
 *
 * The keys are stable identifiers; callers can switch on them.
 */
export function getJsonSchemas(): Record<string, JsonSchema7Type> {
  // `zod-to-json-schema` returns a JsonSchema7Type. We wrap each top-level
  // entity. Each call generates a fresh schema object with the entity
  // inlined as the root.
  return {
    GameProject: zodToJsonSchema(GameProjectSchema, 'GameProject'),
    ProjectMeta: zodToJsonSchema(ProjectMetaSchema, 'ProjectMeta'),
    Screen: zodToJsonSchema(ScreenSchema, 'Screen'),
    Component: zodToJsonSchema(ComponentSchema, 'Component'),
    FlowEdge: zodToJsonSchema(FlowEdgeSchema, 'FlowEdge'),
    Character: zodToJsonSchema(CharacterSchema, 'Character'),
    Asset: zodToJsonSchema(AssetSchema, 'Asset'),
    Art: zodToJsonSchema(ArtSchema, 'Art'),
    ExportPolicy: zodToJsonSchema(ExportPolicySchema, 'ExportPolicy'),
  };
}
