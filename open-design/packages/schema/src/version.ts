/**
 * Schema version metadata and migration scaffolding for the canonical
 * Greybox Studio game project schema.
 *
 * Every root entity (GameProject, Screen, Character, Asset, ExportPolicy, ...)
 * carries a `schemaVersion` field that **must** equal {@link SCHEMA_VERSION}
 * for the validators in this package. When the shape of any root entity
 * changes in a breaking way, bump {@link SCHEMA_VERSION} and add a migration
 * step in {@link migrate}.
 *
 * @packageDocumentation
 */

import { z } from 'zod';

/**
 * Current canonical schema version. Bump on any breaking change.
 *
 * Convention: SemVer-style. Major bump = breaking; minor = additive only;
 * patch = doc/cosmetic. Migrations live in {@link migrate}.
 */
export const SCHEMA_VERSION = '0.1.0' as const;

/**
 * Type-level alias for the current schema version literal.
 */
export type SchemaVersion = typeof SCHEMA_VERSION;

/**
 * Zod validator for the `schemaVersion` field on root entities.
 * Forces an exact match against {@link SCHEMA_VERSION}.
 */
export const SchemaVersionSchema = z.literal(SCHEMA_VERSION);

/**
 * Project-wide list of schema versions that exist on disk. We start with
 * just the current version; future versions get appended here as they ship.
 */
export const KNOWN_SCHEMA_VERSIONS: readonly string[] = [SCHEMA_VERSION];

/**
 * Migrate an arbitrary JSON-shaped game project payload from one schema
 * version to another.
 *
 * Stub implementation: only same-version pass-through is supported today.
 *
 * **Adding a new migration:** when {@link SCHEMA_VERSION} bumps, write a
 * dedicated `migrate_<from>_to_<to>` helper in this file (or a sibling
 * `migrations/` directory if the volume grows) and chain calls inside
 * {@link migrate} based on the `from` argument.
 *
 * @param from Version the input payload claims to be at.
 * @param to Target version. Currently must equal `from`.
 * @param project Raw project payload (untyped on input by design).
 * @returns The (possibly migrated) project payload. Caller should re-run
 *   the relevant Zod validator to confirm the final shape.
 * @throws Error if the requested migration path is not implemented yet.
 */
export function migrate(from: string, to: string, project: unknown): unknown {
  if (from === to) {
    return project;
  }
  if (!KNOWN_SCHEMA_VERSIONS.includes(from)) {
    throw new Error(
      `[schema.migrate] Unknown source schemaVersion "${from}". Known: ${KNOWN_SCHEMA_VERSIONS.join(', ')}`,
    );
  }
  if (!KNOWN_SCHEMA_VERSIONS.includes(to)) {
    throw new Error(
      `[schema.migrate] Unknown target schemaVersion "${to}". Known: ${KNOWN_SCHEMA_VERSIONS.join(', ')}`,
    );
  }
  // Future: chain migration steps here as new versions land.
  throw new Error(
    `[schema.migrate] No migration path implemented from "${from}" to "${to}". ` +
      `Add a migrate_${from.replace(/\./g, '_')}_to_${to.replace(/\./g, '_')} helper and wire it up here.`,
  );
}
