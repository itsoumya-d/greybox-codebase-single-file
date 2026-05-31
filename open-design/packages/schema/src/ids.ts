/**
 * Branded ID types for the canonical Greybox Studio schema.
 *
 * Every entity in the schema is identified by a string that is structurally
 * just a `string`, but is brought into the TypeScript type system as a
 * **branded** string. Branded strings prevent accidentally passing, say, a
 * `ComponentId` where a `ScreenId` is expected.
 *
 * Use the `*Schema` Zod validators when parsing untrusted input. Use the
 * `as*` helpers when you have a string you already know is valid (e.g.,
 * freshly minted by your own code).
 *
 * @packageDocumentation
 */

import { z } from 'zod';

/**
 * Minimum constraints all IDs share: non-empty, max 128 chars, no leading
 * or trailing whitespace. We deliberately keep the alphabet permissive so
 * that callers can use UUIDs, ULIDs, slug strings, or content hashes.
 */
const IdString = z
  .string()
  .min(1, 'id must be non-empty')
  .max(128, 'id must be at most 128 chars')
  .regex(/^\S(?:.*\S)?$/, 'id must not have leading or trailing whitespace');

/** Branded Zod schema for a project identifier. */
export const ProjectIdSchema = IdString.brand<'ProjectId'>();
/** Branded `ProjectId` string type. */
export type ProjectId = z.infer<typeof ProjectIdSchema>;

/** Branded Zod schema for a screen identifier. */
export const ScreenIdSchema = IdString.brand<'ScreenId'>();
/** Branded `ScreenId` string type. */
export type ScreenId = z.infer<typeof ScreenIdSchema>;

/** Branded Zod schema for a component identifier. */
export const ComponentIdSchema = IdString.brand<'ComponentId'>();
/** Branded `ComponentId` string type. */
export type ComponentId = z.infer<typeof ComponentIdSchema>;

/** Branded Zod schema for a flow-edge identifier. */
export const FlowEdgeIdSchema = IdString.brand<'FlowEdgeId'>();
/** Branded `FlowEdgeId` string type. */
export type FlowEdgeId = z.infer<typeof FlowEdgeIdSchema>;

/** Branded Zod schema for a character identifier. */
export const CharacterIdSchema = IdString.brand<'CharacterId'>();
/** Branded `CharacterId` string type. */
export type CharacterId = z.infer<typeof CharacterIdSchema>;

/** Branded Zod schema for an asset identifier. */
export const AssetIdSchema = IdString.brand<'AssetId'>();
/** Branded `AssetId` string type. */
export type AssetId = z.infer<typeof AssetIdSchema>;

/** Branded Zod schema for an animation clip identifier. */
export const AnimationClipIdSchema = IdString.brand<'AnimationClipId'>();
/** Branded `AnimationClipId` string type. */
export type AnimationClipId = z.infer<typeof AnimationClipIdSchema>;

/** Branded Zod schema for a material identifier. */
export const MaterialIdSchema = IdString.brand<'MaterialId'>();
/** Branded `MaterialId` string type. */
export type MaterialId = z.infer<typeof MaterialIdSchema>;

/**
 * Cast a raw string into a {@link ProjectId} without validation.
 * Prefer {@link ProjectIdSchema}.parse for untrusted input.
 */
export const asProjectId = (s: string): ProjectId => s as ProjectId;
/** See {@link asProjectId}. */
export const asScreenId = (s: string): ScreenId => s as ScreenId;
/** See {@link asProjectId}. */
export const asComponentId = (s: string): ComponentId => s as ComponentId;
/** See {@link asProjectId}. */
export const asFlowEdgeId = (s: string): FlowEdgeId => s as FlowEdgeId;
/** See {@link asProjectId}. */
export const asCharacterId = (s: string): CharacterId => s as CharacterId;
/** See {@link asProjectId}. */
export const asAssetId = (s: string): AssetId => s as AssetId;
/** See {@link asProjectId}. */
export const asAnimationClipId = (s: string): AnimationClipId => s as AnimationClipId;
/** See {@link asProjectId}. */
export const asMaterialId = (s: string): MaterialId => s as MaterialId;
