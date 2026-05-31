/**
 * Screen entity: a single page / scene / level inside a GameProject.
 *
 * A Screen is a flat list of {@link Component}s. Components reference each
 * other via the optional `parent` field on {@link ComponentBaseShape},
 * which gives us nesting (containers, hierarchies) without a recursive
 * Zod schema.
 *
 * {@link validateScreenParentRefs} can be used to confirm every `parent`
 * id resolves to a sibling component within the same screen.
 *
 * @packageDocumentation
 */

import { z } from 'zod';

import { ComponentSchema } from './component.js';
import { ScreenIdSchema } from './ids.js';

/**
 * Closed enum of screen roles. Drives importer behaviour (e.g. Unity
 * plugin uses `gameplay` to attach a player rig + camera by default).
 */
export const ScreenKindSchema = z.enum([
  'main-menu',
  'gameplay',
  'cutscene',
  'pause',
  'game-over',
  'loading',
  'settings',
  'inventory',
  'shop',
  'credits',
  'custom',
]);
/** Inferred type for {@link ScreenKindSchema}. */
export type ScreenKind = z.infer<typeof ScreenKindSchema>;

/**
 * A screen background. Either a solid colour or an image asset reference.
 * Using a discriminated union here keeps importers honest (no "is this a
 * colour OR an asset?" guesswork).
 */
export const ScreenBackgroundSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('color'),
    /** Hex `#RRGGBB` or `#RRGGBBAA`. */
    color: z.string().regex(/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/),
  }),
  z.object({
    type: z.literal('asset'),
    /** Asset id of the background image / skybox. */
    assetRef: z.string().min(1),
  }),
]);
/** Inferred type for {@link ScreenBackgroundSchema}. */
export type ScreenBackground = z.infer<typeof ScreenBackgroundSchema>;

/**
 * Screen entity. A screen owns a flat list of components; components
 * declare nesting via their optional `parent` field.
 */
export const ScreenSchema = z.object({
  id: ScreenIdSchema,
  /** Human label, e.g. "Main Menu", "Level 1 — Forest". */
  name: z.string().min(1),
  kind: ScreenKindSchema,
  background: ScreenBackgroundSchema.optional(),
  /** Flat list of components. Nesting is expressed via `parent` ids. */
  components: z.array(ComponentSchema),
  /**
   * Optional notes / design rationale (visible in editor, stripped at export).
   */
  notes: z.string().optional(),
});
/** Inferred type for {@link ScreenSchema}. */
export type Screen = z.infer<typeof ScreenSchema>;

/**
 * Validate that every component whose `parent` is non-null points at
 * another component in the same screen.
 *
 * Returns an array of issues; empty array = clean.
 *
 * Does NOT detect cycles (containers parenting themselves transitively);
 * that's left as a separate higher-level lint.
 */
export function validateScreenParentRefs(screen: Screen): string[] {
  const issues: string[] = [];
  const ids = new Set(screen.components.map((c) => c.id));
  for (const c of screen.components) {
    if (c.parent == null) continue;
    if (!ids.has(c.parent)) {
      issues.push(
        `Component "${c.id}" (kind=${c.kind}) has parent="${c.parent}" which does not exist in screen "${screen.id}".`,
      );
    }
    if (c.parent === c.id) {
      issues.push(
        `Component "${c.id}" (kind=${c.kind}) lists itself as its own parent in screen "${screen.id}".`,
      );
    }
  }
  return issues;
}
