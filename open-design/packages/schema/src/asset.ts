/**
 * Asset entity: a file-on-disk (or remote URL) referenced by a project.
 *
 * Assets are the only entity that point at binary blobs. Everything else
 * (Component, Character, Screen, ...) refers to assets by {@link AssetId}
 * so the project tree stays serialisable as pure JSON.
 *
 * Provenance is mandatory because most assets in a Greybox Studio project
 * are AI-generated; downstream consumers (marketplace, Unity plugin,
 * legal review) need to know who/what produced each file.
 *
 * @packageDocumentation
 */

import { z } from 'zod';

import { AssetIdSchema } from './ids.js';

/**
 * Closed enum of supported asset MIME-shape categories. Every category
 * maps to a known importer in the Unity/Unreal/Godot plugins.
 */
export const AssetTypeSchema = z.enum([
  'gltf',
  'fbx',
  'png',
  'jpg',
  'webp',
  'mp3',
  'wav',
  'json',
  'prefab',
]);
/** Discrete asset-type literal. */
export type AssetType = z.infer<typeof AssetTypeSchema>;

/**
 * Provenance block: where this asset came from. Required for AI-generated
 * artefacts so we can attribute, license-check, and reproduce them.
 */
export const AssetProvenanceSchema = z.object({
  /**
   * License identifier (SPDX where possible, free-form otherwise).
   * Example: "CC-BY-4.0", "Apache-2.0", "proprietary".
   */
  license: z.string().min(1),
  /**
   * Where the bits originated. Free-form: e.g. "user-upload",
   * "stability-ai/stable-diffusion-3", "mixamo.com", "greybox-cloud:scenario".
   */
  source: z.string().min(1),
  /**
   * Identifier of the generator if AI-produced. Free-form; common values:
   * "stable-diffusion-3", "tripo3d", "meshy", "elevenlabs", "human".
   */
  generatedBy: z.string().min(1).optional(),
  /** Prompt or recipe used to generate this asset, if applicable. */
  prompt: z.string().optional(),
  /** Deterministic seed used at generation time, if applicable. */
  seed: z.number().int().optional(),
  /** ISO-8601 timestamp the asset was created at. */
  createdAt: z.string().datetime().optional(),
});
/** Inferred type for {@link AssetProvenanceSchema}. */
export type AssetProvenance = z.infer<typeof AssetProvenanceSchema>;

/**
 * Asset entity. The `sha256` field MUST be the lowercase hex SHA-256 of
 * the file at {@link AssetSchema.shape.uri}; consumers may rely on it for
 * cache invalidation, integrity checks, and content-addressed storage.
 */
export const AssetSchema = z.object({
  id: AssetIdSchema,
  type: AssetTypeSchema,
  /**
   * Where the bytes live. Either a project-relative POSIX path
   * (`assets/textures/sky.png`) or an absolute URL (`https://...`).
   */
  uri: z.string().min(1),
  /** Lowercase hex SHA-256 of the file contents (64 hex chars). */
  sha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/, 'sha256 must be 64 lowercase hex characters'),
  /** Size of the asset payload in bytes. */
  sizeBytes: z.number().int().nonnegative(),
  /** Optional human-readable name. */
  name: z.string().min(1).optional(),
  /** Provenance / licensing metadata. */
  provenance: AssetProvenanceSchema,
});
/** Inferred {@link AssetSchema} type. */
export type Asset = z.infer<typeof AssetSchema>;
