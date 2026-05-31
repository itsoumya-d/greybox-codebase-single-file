/**
 * Flow graph entities: directed edges that move the player between
 * {@link Screen}s in response to a trigger.
 *
 * A FlowEdge connects `from` → `to` (both ScreenId). The `trigger` field
 * is a discriminated union describing what causes the transition:
 *
 * - `tap` — generic UI tap, optionally bound to a component id.
 * - `longPress` — UI long-press with a duration.
 * - `swipe` — swipe gesture with a direction.
 * - `time` — automatic transition after N seconds (useful for splash).
 * - `scriptEvent` — fires when a named event is raised by gameplay.
 * - `collision` — fires when a tagged collider touches the player.
 * - `custom` — escape hatch with free-form payload.
 *
 * @packageDocumentation
 */

import { z } from 'zod';

import { ComponentIdSchema, FlowEdgeIdSchema, ScreenIdSchema } from './ids.js';

/**
 * Tap-trigger variant. `componentRef` optionally constrains the tap to a
 * specific UI component (e.g. only the "Play" button); omit for "any tap".
 */
export const TapTriggerSchema = z.object({
  type: z.literal('tap'),
  componentRef: ComponentIdSchema.optional(),
});
/** Inferred type. */
export type TapTrigger = z.infer<typeof TapTriggerSchema>;

/** Long-press trigger. */
export const LongPressTriggerSchema = z.object({
  type: z.literal('longPress'),
  componentRef: ComponentIdSchema.optional(),
  /** Press duration in seconds before the trigger fires. */
  durationSeconds: z.number().positive(),
});
/** Inferred type. */
export type LongPressTrigger = z.infer<typeof LongPressTriggerSchema>;

/** Swipe-gesture trigger. */
export const SwipeTriggerSchema = z.object({
  type: z.literal('swipe'),
  direction: z.enum(['up', 'down', 'left', 'right']),
});
/** Inferred type. */
export type SwipeTrigger = z.infer<typeof SwipeTriggerSchema>;

/** Automatic time-based trigger (e.g. splash → main menu after 3s). */
export const TimeTriggerSchema = z.object({
  type: z.literal('time'),
  /** Delay in seconds before the transition fires. */
  delaySeconds: z.number().nonnegative(),
});
/** Inferred type. */
export type TimeTrigger = z.infer<typeof TimeTriggerSchema>;

/**
 * Script-event trigger. Fires when gameplay raises an event with the
 * given id (e.g. `onClickEvent` on a Button, or `eventId` on a Trigger).
 */
export const ScriptEventTriggerSchema = z.object({
  type: z.literal('scriptEvent'),
  eventId: z.string().min(1),
});
/** Inferred type. */
export type ScriptEventTrigger = z.infer<typeof ScriptEventTriggerSchema>;

/** Physics-collision trigger: fires when a tag-matching collider touches the player. */
export const CollisionTriggerSchema = z.object({
  type: z.literal('collision'),
  /** Tag used by the gameplay layer (e.g. "exit-door"). */
  tag: z.string().min(1),
});
/** Inferred type. */
export type CollisionTrigger = z.infer<typeof CollisionTriggerSchema>;

/** Custom escape hatch with free-form payload. */
export const CustomTriggerSchema = z.object({
  type: z.literal('custom'),
  payload: z.record(z.string(), z.unknown()),
});
/** Inferred type. */
export type CustomTrigger = z.infer<typeof CustomTriggerSchema>;

/**
 * Discriminated union of all trigger variants. Use `trigger.type` to narrow.
 */
export const FlowTriggerSchema = z.discriminatedUnion('type', [
  TapTriggerSchema,
  LongPressTriggerSchema,
  SwipeTriggerSchema,
  TimeTriggerSchema,
  ScriptEventTriggerSchema,
  CollisionTriggerSchema,
  CustomTriggerSchema,
]);
/** Inferred type for {@link FlowTriggerSchema}. */
export type FlowTrigger = z.infer<typeof FlowTriggerSchema>;

/**
 * String-literal union of trigger types.
 */
export type FlowTriggerType = FlowTrigger['type'];

/**
 * Directed flow edge. `from` and `to` are screen ids; `trigger` is the
 * cause; optional `condition` is an expression evaluated at fire-time
 * (left intentionally opaque — engines pick their own scripting layer).
 */
export const FlowEdgeSchema = z.object({
  id: FlowEdgeIdSchema,
  from: ScreenIdSchema,
  to: ScreenIdSchema,
  trigger: FlowTriggerSchema,
  /**
   * Optional engine-neutral predicate. Free-form: e.g. "score >= 10",
   * or a JSON-shaped DSL the runner agrees on. Validators don't parse it.
   */
  condition: z.string().optional(),
  /** Optional notes / design rationale. */
  notes: z.string().optional(),
});
/** Inferred type for {@link FlowEdgeSchema}. */
export type FlowEdge = z.infer<typeof FlowEdgeSchema>;
