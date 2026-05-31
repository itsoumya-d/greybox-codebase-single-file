/**
 * Art direction entities: palette, typography, and material references.
 *
 * The Art block sits at the project root. It expresses *intent* rather
 * than per-screen art (which lives on Components / Backgrounds). Importers
 * pre-create palette swatches, font assets, and material libraries on
 * project import so authoring downstream is consistent.
 *
 * @packageDocumentation
 */

import { z } from 'zod';

import { AssetIdSchema, MaterialIdSchema } from './ids.js';

/**
 * Single colour entry in the project palette. `role` is a free-form tag
 * (e.g. "primary", "danger", "ui-text-on-dark") that downstream code can
 * key on.
 */
export const PaletteColorSchema = z.object({
  role: z.string().min(1),
  /** Hex `#RRGGBB` or `#RRGGBBAA`. */
  hex: z.string().regex(/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/),
  /** Optional human label, e.g. "Sunset Orange". */
  name: z.string().optional(),
});
/** Inferred type. */
export type PaletteColor = z.infer<typeof PaletteColorSchema>;

/** Project colour palette. */
export const PaletteSchema = z.object({
  name: z.string().min(1).default('default'),
  colors: z.array(PaletteColorSchema).min(1),
});
/** Inferred type for {@link PaletteSchema}. */
export type Palette = z.infer<typeof PaletteSchema>;

/**
 * A single typography style (a "named font face + size + weight" combo).
 */
export const TypographyStyleSchema = z.object({
  /** Role tag: "display", "heading", "body", "ui-label", ... */
  role: z.string().min(1),
  family: z.string().min(1),
  /** Optional asset id of a custom font file (TTF/OTF). */
  fontAssetRef: AssetIdSchema.optional(),
  /** Size in engine-neutral typography units (px-equivalent). */
  size: z.number().positive(),
  /** Weight 100..900 (CSS-style). */
  weight: z.number().int().min(100).max(900).default(400),
  /** Line height as a multiplier of size (e.g. 1.4). */
  lineHeight: z.number().positive().default(1.4),
});
/** Inferred type. */
export type TypographyStyle = z.infer<typeof TypographyStyleSchema>;

/** Project typography catalogue. */
export const TypographySchema = z.object({
  styles: z.array(TypographyStyleSchema).min(1),
});
/** Inferred type for {@link TypographySchema}. */
export type Typography = z.infer<typeof TypographySchema>;

/**
 * Material reference: a named, shared material that components / characters
 * can reuse. The actual material definition lives in an Asset (engine-
 * neutral JSON, or per-engine .mat / .uasset / .tres).
 */
export const MaterialRefSchema = z.object({
  id: MaterialIdSchema,
  name: z.string().min(1),
  /** Asset id holding the material definition. */
  assetRef: AssetIdSchema,
  /** Optional tag describing usage. Free-form. */
  role: z.string().min(1).optional(),
});
/** Inferred type for {@link MaterialRefSchema}. */
export type MaterialRef = z.infer<typeof MaterialRefSchema>;

/**
 * Project-level art direction block.
 */
export const ArtSchema = z.object({
  palette: PaletteSchema,
  typography: TypographySchema,
  materials: z.array(MaterialRefSchema),
  /**
   * Free-form mood / direction text. Captured for downstream prompts
   * (e.g. when generating new art for screens added later).
   */
  moodNotes: z.string().optional(),
});
/** Inferred type for {@link ArtSchema}. */
export type Art = z.infer<typeof ArtSchema>;
