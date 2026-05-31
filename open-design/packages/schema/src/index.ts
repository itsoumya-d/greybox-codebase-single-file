/**
 * `@greybox/schema` — canonical cross-engine schema for Greybox Studio.
 *
 * This package owns the on-disk representation of a Greybox Studio game
 * project. Every other repo in the platform (open-design daemon,
 * greybox-cloud, Unity/Unreal/Godot plugins, marketplace, playtest)
 * consumes this schema instead of inventing its own format.
 *
 * Key entry points:
 * - {@link GameProjectSchema} / {@link validateGameProject} — top-level entity.
 * - {@link SCHEMA_VERSION} — current canonical version literal.
 * - {@link getJsonSchemas} — emit JSON Schema for non-TS consumers.
 *
 * @packageDocumentation
 */

export * from './art.js';
export * from './asset.js';
export * from './character.js';
export * from './component.js';
export * from './export-policy.js';
export * from './flow.js';
export * from './game-project.js';
export * from './ids.js';
export * from './meta.js';
export * from './screen.js';
export * from './version.js';
