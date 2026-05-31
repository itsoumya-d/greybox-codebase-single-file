/**
 * Per-engine export policy.
 *
 * An ExportPolicy block lives on a GameProject and tells each target
 * engine's plugin (Unity, Unreal, Godot) how to materialise the project
 * — what render pipeline, what input system, what engine version, etc.
 *
 * The optional `web` block configures the in-browser prototype runner.
 *
 * @packageDocumentation
 */

import { z } from 'zod';

/**
 * Unity-specific knobs. Settings here match what the Unity plugin's
 * project bootstrapper reads on import.
 */
export const UnityExportPolicySchema = z.object({
  renderPipeline: z.enum(['urp', 'hdrp', 'builtin']),
  inputSystem: z.enum(['new', 'legacy']),
  scriptingBackend: z.enum(['il2cpp', 'mono']),
});
/** Inferred type for {@link UnityExportPolicySchema}. */
export type UnityExportPolicy = z.infer<typeof UnityExportPolicySchema>;

/**
 * Unreal-specific knobs.
 */
export const UnrealExportPolicySchema = z.object({
  engineVersion: z.enum(['5.3', '5.4', '5.5']),
  inputSystem: z.enum(['enhanced', 'legacy']),
});
/** Inferred type for {@link UnrealExportPolicySchema}. */
export type UnrealExportPolicy = z.infer<typeof UnrealExportPolicySchema>;

/**
 * Godot-specific knobs.
 */
export const GodotExportPolicySchema = z.object({
  engineVersion: z.enum(['4.2', '4.3', '4.4']),
  renderer: z.enum(['forward+', 'compatibility']),
});
/** Inferred type for {@link GodotExportPolicySchema}. */
export type GodotExportPolicy = z.infer<typeof GodotExportPolicySchema>;

/**
 * Web prototype-runner knobs. Optional because not every project ships
 * a web prototype.
 */
export const WebExportPolicySchema = z.object({
  runtime: z.enum(['babylon', 'three', 'playcanvas']),
});
/** Inferred type for {@link WebExportPolicySchema}. */
export type WebExportPolicy = z.infer<typeof WebExportPolicySchema>;

/**
 * Top-level export policy. All engine blocks are required so each
 * importer always has a deterministic answer; `web` is optional because
 * the in-browser prototype runner is opt-in.
 */
export const ExportPolicySchema = z.object({
  unity: UnityExportPolicySchema,
  unreal: UnrealExportPolicySchema,
  godot: GodotExportPolicySchema,
  web: WebExportPolicySchema.optional(),
});
/** Inferred type for {@link ExportPolicySchema}. */
export type ExportPolicy = z.infer<typeof ExportPolicySchema>;

/**
 * Sensible defaults: Unity URP + new input + IL2CPP, Unreal 5.5 enhanced,
 * Godot 4.4 Forward+, no web runtime. Callers usually want to override
 * one or two fields rather than building from scratch.
 */
export function defaultExportPolicy(): ExportPolicy {
  return {
    unity: {
      renderPipeline: 'urp',
      inputSystem: 'new',
      scriptingBackend: 'il2cpp',
    },
    unreal: {
      engineVersion: '5.5',
      inputSystem: 'enhanced',
    },
    godot: {
      engineVersion: '4.4',
      renderer: 'forward+',
    },
  };
}
