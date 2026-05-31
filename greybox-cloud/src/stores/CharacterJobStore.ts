// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

// Character generation job + library store.
//
// Mirrors the persistence pattern used by `LicenseRecordStore`
// (`src/routers/licenses.ts`) and `LicenseRecordStorePostgres`
// (`src/routers/licenseRecordsPostgres.ts`): an interface used by the
// router plus two implementations (in-memory for tests / single-process
// development, Postgres for hosted multi-replica).
//
// The store has two tables:
//
//   - character_jobs: ephemeral generation lifecycle (queued -> done|failed)
//   - characters: durable library of imported characters per tenant
//
// We keep both behind a single interface so callers can hold one store
// reference; mixing concerns is acceptable here because both tables share
// the same tenant scope.
//
// All time fields are ISO-8601 strings to make the JSON surface stable
// across in-memory + Postgres implementations.

import type {
  CharacterGenInput,
  CharacterGenJobStatus,
} from '../providers/character-gen/types.js';

/** Status discriminant we persist (subset of the provider's union). */
export type CharacterJobState = 'queued' | 'processing' | 'done' | 'failed';

/**
 * Provenance baked into the imported Character. Mirrors
 * `CharacterProvenance` in `open-design/packages/schema/src/character.ts`.
 * Keep in sync when the schema package evolves.
 */
export interface CharacterProvenance {
  /** Free-form generator id, e.g. "tripo3d", "meshy-v3", "mock". */
  genProvider?: string;
  /** Prompt or recipe used to generate the character. */
  prompt?: string;
  /** Deterministic seed at generation time. */
  seed?: number;
  /** License of the character (SPDX or free-form). */
  license?: string;
  /** Optional version label reported by the provider. */
  modelVersion?: string;
}

export interface CharacterRigJoint {
  name: string;
  parent: string | null;
}

export interface CharacterAnimationClip {
  id: string;
  /** Human-readable label (idle/walk/run/etc). */
  name: string;
  /** Asset uri reference (the character library normalises into a single .glb). */
  clipRef: string;
  /** Duration in seconds; 0 when unknown. */
  duration: number;
  /** Whether the clip is meant to loop. */
  loop: boolean;
}

export interface CharacterRecord {
  /** Globally unique character id (tenant-scoped row). */
  id: string;
  tenantId: string;
  name: string;
  /** Storage URI to the .glb (local file://, signed http(s) URL, or s3://). */
  gltfAssetUri: string;
  /** Lowercase hex sha256 of the .glb bytes. */
  sha256: string;
  /** Raw byte length of the .glb. */
  sizeBytes: number;
  rig: {
    joints: CharacterRigJoint[];
  };
  animations: CharacterAnimationClip[];
  gameStats: Record<string, number>;
  provenance: CharacterProvenance;
  /** Schema version for forward-compat / migration scripts. */
  schemaVersion: number;
  /** Soft warnings produced during import (e.g. "non-Mixamo joints"). */
  warnings: string[];
  createdAt: string;
}

export interface CharacterJobRecord {
  id: string;
  tenantId: string;
  userId: string;
  providerName: string;
  /** ID returned by the upstream provider (used to poll). */
  providerJobId: string;
  state: CharacterJobState;
  /** 0..100 progress estimate; only meaningful when state=processing. */
  percent: number;
  /** Original input the user submitted. */
  input: CharacterGenInput;
  /** Provider outputs (mirror of the `done` branch of CharacterGenJobStatus). */
  outputs?: {
    gltfUrl: string;
    thumbnailUrl: string;
    license: string;
  };
  /** Failure reason; only set when state=failed. */
  error?: string;
  /** Optional reference to the resulting character once imported. */
  importedCharacterId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CharacterJobStore {
  // Job lifecycle ---------------------------------------------------------
  createJob(input: {
    id: string;
    tenantId: string;
    userId: string;
    providerName: string;
    providerJobId: string;
    input: CharacterGenInput;
    state?: CharacterJobState;
    percent?: number;
  }): Promise<CharacterJobRecord>;
  getJob(id: string, tenantId: string): Promise<CharacterJobRecord | undefined>;
  updateJobStatus(
    id: string,
    tenantId: string,
    status: CharacterGenJobStatus,
  ): Promise<CharacterJobRecord | undefined>;
  setJobImportedCharacter(
    id: string,
    tenantId: string,
    characterId: string,
  ): Promise<CharacterJobRecord | undefined>;
  listJobsForTenant(tenantId: string, limit?: number): Promise<readonly CharacterJobRecord[]>;

  // Character library -----------------------------------------------------
  saveCharacter(character: CharacterRecord): Promise<CharacterRecord>;
  getCharacter(id: string, tenantId: string): Promise<CharacterRecord | undefined>;
  listCharactersForTenant(tenantId: string, limit?: number): Promise<readonly CharacterRecord[]>;
}

/** Helper to convert a {@link CharacterGenJobStatus} into a stored row patch. */
export function jobStatusPatch(
  status: CharacterGenJobStatus,
): {
  state: CharacterJobState;
  percent: number;
  outputs?: CharacterJobRecord['outputs'];
  error?: string;
} {
  switch (status.state) {
    case 'queued':
      return { state: 'queued', percent: 0 };
    case 'processing':
      return { state: 'processing', percent: Math.max(0, Math.min(100, Math.round(status.percent))) };
    case 'done':
      return {
        state: 'done',
        percent: 100,
        outputs: { ...status.outputs },
      };
    case 'failed':
      return {
        state: 'failed',
        percent: 0,
        error: status.error,
      };
  }
}

/**
 * In-memory implementation. Used for tests and single-process dev. NOT
 * safe across replicas — wire the Postgres implementation for hosted
 * deployments.
 */
export class InMemoryCharacterJobStore implements CharacterJobStore {
  private readonly jobs = new Map<string, CharacterJobRecord>();
  private readonly characters = new Map<string, CharacterRecord>();
  private readonly now: () => Date;

  constructor(options: { now?: () => Date } = {}) {
    this.now = options.now ?? (() => new Date());
  }

  async createJob(input: {
    id: string;
    tenantId: string;
    userId: string;
    providerName: string;
    providerJobId: string;
    input: CharacterGenInput;
    state?: CharacterJobState;
    percent?: number;
  }): Promise<CharacterJobRecord> {
    const at = this.now().toISOString();
    const record: CharacterJobRecord = {
      id: input.id,
      tenantId: input.tenantId,
      userId: input.userId,
      providerName: input.providerName,
      providerJobId: input.providerJobId,
      state: input.state ?? 'queued',
      percent: input.percent ?? 0,
      input: input.input,
      createdAt: at,
      updatedAt: at,
    };
    this.jobs.set(jobKey(input.tenantId, input.id), record);
    return cloneJob(record);
  }

  async getJob(id: string, tenantId: string): Promise<CharacterJobRecord | undefined> {
    const found = this.jobs.get(jobKey(tenantId, id));
    return found ? cloneJob(found) : undefined;
  }

  async updateJobStatus(
    id: string,
    tenantId: string,
    status: CharacterGenJobStatus,
  ): Promise<CharacterJobRecord | undefined> {
    const found = this.jobs.get(jobKey(tenantId, id));
    if (!found) return undefined;
    const patch = jobStatusPatch(status);
    const next: CharacterJobRecord = {
      ...found,
      state: patch.state,
      percent: patch.percent,
      ...(patch.outputs !== undefined ? { outputs: patch.outputs } : { outputs: found.outputs }),
      ...(patch.error !== undefined ? { error: patch.error } : (found.error !== undefined ? { error: found.error } : {})),
      updatedAt: this.now().toISOString(),
    };
    this.jobs.set(jobKey(tenantId, id), next);
    return cloneJob(next);
  }

  async setJobImportedCharacter(
    id: string,
    tenantId: string,
    characterId: string,
  ): Promise<CharacterJobRecord | undefined> {
    const found = this.jobs.get(jobKey(tenantId, id));
    if (!found) return undefined;
    const next: CharacterJobRecord = {
      ...found,
      importedCharacterId: characterId,
      updatedAt: this.now().toISOString(),
    };
    this.jobs.set(jobKey(tenantId, id), next);
    return cloneJob(next);
  }

  async listJobsForTenant(tenantId: string, limit = 100): Promise<readonly CharacterJobRecord[]> {
    const all = [...this.jobs.values()].filter((job) => job.tenantId === tenantId);
    all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return all.slice(0, Math.max(1, limit)).map(cloneJob);
  }

  async saveCharacter(character: CharacterRecord): Promise<CharacterRecord> {
    const stored: CharacterRecord = {
      ...character,
      createdAt: character.createdAt || this.now().toISOString(),
    };
    this.characters.set(characterKey(character.tenantId, character.id), stored);
    return cloneCharacter(stored);
  }

  async getCharacter(id: string, tenantId: string): Promise<CharacterRecord | undefined> {
    const found = this.characters.get(characterKey(tenantId, id));
    return found ? cloneCharacter(found) : undefined;
  }

  async listCharactersForTenant(
    tenantId: string,
    limit = 100,
  ): Promise<readonly CharacterRecord[]> {
    const all = [...this.characters.values()].filter((row) => row.tenantId === tenantId);
    all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return all.slice(0, Math.max(1, limit)).map(cloneCharacter);
  }
}

function jobKey(tenantId: string, jobId: string): string {
  return `${tenantId}\x00${jobId}`;
}

function characterKey(tenantId: string, characterId: string): string {
  return `${tenantId}\x00${characterId}`;
}

function cloneJob(record: CharacterJobRecord): CharacterJobRecord {
  return {
    ...record,
    input: { ...record.input },
    ...(record.outputs ? { outputs: { ...record.outputs } } : {}),
  };
}

function cloneCharacter(record: CharacterRecord): CharacterRecord {
  return {
    ...record,
    rig: { joints: record.rig.joints.map((joint) => ({ ...joint })) },
    animations: record.animations.map((clip) => ({ ...clip })),
    gameStats: { ...record.gameStats },
    provenance: { ...record.provenance },
    warnings: [...record.warnings],
  };
}

// -- Postgres ----------------------------------------------------------------

export interface PostgresCharacterJobClient {
  query(text: string, values?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
}

export interface PostgresCharacterJobStoreOptions {
  client: PostgresCharacterJobClient;
  jobsTableName?: string;
  charactersTableName?: string;
}

const DEFAULT_JOBS_TABLE = 'character_jobs';
const DEFAULT_CHARACTERS_TABLE = 'characters';

export class PostgresCharacterJobStore implements CharacterJobStore {
  private readonly client: PostgresCharacterJobClient;
  private readonly jobsTableName: string;
  private readonly charactersTableName: string;

  private constructor(options: PostgresCharacterJobStoreOptions) {
    this.client = options.client;
    this.jobsTableName = sanitizeIdentifier(options.jobsTableName ?? DEFAULT_JOBS_TABLE);
    this.charactersTableName = sanitizeIdentifier(options.charactersTableName ?? DEFAULT_CHARACTERS_TABLE);
  }

  static async create(
    options: PostgresCharacterJobStoreOptions,
  ): Promise<PostgresCharacterJobStore> {
    const store = new PostgresCharacterJobStore(options);
    await ensureSchema(store.client, store.jobsTableName, store.charactersTableName);
    return store;
  }

  async createJob(input: {
    id: string;
    tenantId: string;
    userId: string;
    providerName: string;
    providerJobId: string;
    input: CharacterGenInput;
    state?: CharacterJobState;
    percent?: number;
  }): Promise<CharacterJobRecord> {
    const result = await this.client.query(
      `INSERT INTO ${this.jobsTableName}
         (id, tenant_id, user_id, provider_name, provider_job_id, state, percent, input, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
       RETURNING id, tenant_id, user_id, provider_name, provider_job_id, state, percent,
                 input, outputs, error, imported_character_id, created_at, updated_at`,
      [
        input.id,
        input.tenantId,
        input.userId,
        input.providerName,
        input.providerJobId,
        input.state ?? 'queued',
        input.percent ?? 0,
        JSON.stringify(input.input),
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('character_jobs insert returned no rows');
    return jobFromRow(row);
  }

  async getJob(id: string, tenantId: string): Promise<CharacterJobRecord | undefined> {
    const result = await this.client.query(
      `SELECT id, tenant_id, user_id, provider_name, provider_job_id, state, percent,
              input, outputs, error, imported_character_id, created_at, updated_at
       FROM ${this.jobsTableName}
       WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    const row = result.rows[0];
    return row ? jobFromRow(row) : undefined;
  }

  async updateJobStatus(
    id: string,
    tenantId: string,
    status: CharacterGenJobStatus,
  ): Promise<CharacterJobRecord | undefined> {
    const patch = jobStatusPatch(status);
    const result = await this.client.query(
      `UPDATE ${this.jobsTableName}
         SET state = $1,
             percent = $2,
             outputs = COALESCE($3, outputs),
             error = $4,
             updated_at = NOW()
       WHERE id = $5 AND tenant_id = $6
       RETURNING id, tenant_id, user_id, provider_name, provider_job_id, state, percent,
                 input, outputs, error, imported_character_id, created_at, updated_at`,
      [
        patch.state,
        patch.percent,
        patch.outputs ? JSON.stringify(patch.outputs) : null,
        patch.error ?? null,
        id,
        tenantId,
      ],
    );
    const row = result.rows[0];
    return row ? jobFromRow(row) : undefined;
  }

  async setJobImportedCharacter(
    id: string,
    tenantId: string,
    characterId: string,
  ): Promise<CharacterJobRecord | undefined> {
    const result = await this.client.query(
      `UPDATE ${this.jobsTableName}
         SET imported_character_id = $1, updated_at = NOW()
       WHERE id = $2 AND tenant_id = $3
       RETURNING id, tenant_id, user_id, provider_name, provider_job_id, state, percent,
                 input, outputs, error, imported_character_id, created_at, updated_at`,
      [characterId, id, tenantId],
    );
    const row = result.rows[0];
    return row ? jobFromRow(row) : undefined;
  }

  async listJobsForTenant(tenantId: string, limit = 100): Promise<readonly CharacterJobRecord[]> {
    const result = await this.client.query(
      `SELECT id, tenant_id, user_id, provider_name, provider_job_id, state, percent,
              input, outputs, error, imported_character_id, created_at, updated_at
       FROM ${this.jobsTableName}
       WHERE tenant_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [tenantId, Math.max(1, limit)],
    );
    return result.rows.map(jobFromRow);
  }

  async saveCharacter(character: CharacterRecord): Promise<CharacterRecord> {
    const result = await this.client.query(
      `INSERT INTO ${this.charactersTableName}
         (id, tenant_id, name, gltf_asset_uri, sha256, size_bytes, rig, animations,
          game_stats, provenance, schema_version, warnings, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, COALESCE($13, NOW()))
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         gltf_asset_uri = EXCLUDED.gltf_asset_uri,
         sha256 = EXCLUDED.sha256,
         size_bytes = EXCLUDED.size_bytes,
         rig = EXCLUDED.rig,
         animations = EXCLUDED.animations,
         game_stats = EXCLUDED.game_stats,
         provenance = EXCLUDED.provenance,
         schema_version = EXCLUDED.schema_version,
         warnings = EXCLUDED.warnings
       RETURNING id, tenant_id, name, gltf_asset_uri, sha256, size_bytes, rig, animations,
                 game_stats, provenance, schema_version, warnings, created_at`,
      [
        character.id,
        character.tenantId,
        character.name,
        character.gltfAssetUri,
        character.sha256,
        character.sizeBytes,
        JSON.stringify(character.rig),
        JSON.stringify(character.animations),
        JSON.stringify(character.gameStats),
        JSON.stringify(character.provenance),
        character.schemaVersion,
        JSON.stringify(character.warnings),
        character.createdAt || null,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('characters insert returned no rows');
    return characterFromRow(row);
  }

  async getCharacter(id: string, tenantId: string): Promise<CharacterRecord | undefined> {
    const result = await this.client.query(
      `SELECT id, tenant_id, name, gltf_asset_uri, sha256, size_bytes, rig, animations,
              game_stats, provenance, schema_version, warnings, created_at
       FROM ${this.charactersTableName}
       WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    const row = result.rows[0];
    return row ? characterFromRow(row) : undefined;
  }

  async listCharactersForTenant(
    tenantId: string,
    limit = 100,
  ): Promise<readonly CharacterRecord[]> {
    const result = await this.client.query(
      `SELECT id, tenant_id, name, gltf_asset_uri, sha256, size_bytes, rig, animations,
              game_stats, provenance, schema_version, warnings, created_at
       FROM ${this.charactersTableName}
       WHERE tenant_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [tenantId, Math.max(1, limit)],
    );
    return result.rows.map(characterFromRow);
  }
}

function jobFromRow(row: Record<string, unknown>): CharacterJobRecord {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    userId: String(row.user_id),
    providerName: String(row.provider_name),
    providerJobId: String(row.provider_job_id),
    state: row.state as CharacterJobState,
    percent: typeof row.percent === 'number' ? row.percent : Number(row.percent ?? 0),
    input: (parseJsonObject(row.input) ?? {}) as unknown as CharacterGenInput,
    ...(row.outputs ? { outputs: parseJsonObject(row.outputs) as unknown as CharacterJobRecord['outputs'] } : {}),
    ...(row.error !== null && row.error !== undefined ? { error: String(row.error) } : {}),
    ...(row.imported_character_id ? { importedCharacterId: String(row.imported_character_id) } : {}),
    createdAt: postgresIsoTimestamp(row.created_at) ?? new Date().toISOString(),
    updatedAt: postgresIsoTimestamp(row.updated_at) ?? new Date().toISOString(),
  };
}

function characterFromRow(row: Record<string, unknown>): CharacterRecord {
  const rig = parseJsonObject(row.rig) as { joints?: CharacterRigJoint[] } | undefined;
  const animations = parseJsonValue(row.animations);
  const warnings = parseJsonValue(row.warnings);
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    name: String(row.name),
    gltfAssetUri: String(row.gltf_asset_uri),
    sha256: String(row.sha256),
    sizeBytes: typeof row.size_bytes === 'number' ? row.size_bytes : Number(row.size_bytes ?? 0),
    rig: {
      joints: Array.isArray(rig?.joints) ? (rig?.joints ?? []) : [],
    },
    animations: Array.isArray(animations) ? (animations as CharacterAnimationClip[]) : [],
    gameStats: (parseJsonObject(row.game_stats) ?? {}) as Record<string, number>,
    provenance: (parseJsonObject(row.provenance) ?? {}) as CharacterProvenance,
    schemaVersion: typeof row.schema_version === 'number'
      ? row.schema_version
      : Number(row.schema_version ?? 1),
    warnings: Array.isArray(warnings) ? (warnings as string[]) : [],
    createdAt: postgresIsoTimestamp(row.created_at) ?? new Date().toISOString(),
  };
}

function parseJsonValue(value: unknown): unknown {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return undefined;
    }
  }
  return value;
}

function parseJsonObject(value: unknown): Record<string, unknown> | undefined {
  const parsed = parseJsonValue(value);
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>;
  }
  return undefined;
}

function postgresIsoTimestamp(value: unknown): string | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) {
    return new Date(value).toISOString();
  }
  return undefined;
}

async function ensureSchema(
  client: PostgresCharacterJobClient,
  jobsTable: string,
  charactersTable: string,
): Promise<void> {
  await client.query(
    `CREATE TABLE IF NOT EXISTS ${jobsTable} (
       id                     TEXT PRIMARY KEY,
       tenant_id              TEXT NOT NULL,
       user_id                TEXT NOT NULL,
       provider_name          TEXT NOT NULL,
       provider_job_id        TEXT NOT NULL,
       state                  TEXT NOT NULL DEFAULT 'queued',
       percent                INTEGER NOT NULL DEFAULT 0,
       input                  JSONB NOT NULL DEFAULT '{}'::jsonb,
       outputs                JSONB,
       error                  TEXT,
       imported_character_id  TEXT,
       created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS ${jobsTable}_tenant_created_at_idx
       ON ${jobsTable} (tenant_id, created_at DESC)`,
  );
  await client.query(
    `CREATE TABLE IF NOT EXISTS ${charactersTable} (
       id              TEXT PRIMARY KEY,
       tenant_id       TEXT NOT NULL,
       name            TEXT NOT NULL,
       gltf_asset_uri  TEXT NOT NULL,
       sha256          TEXT NOT NULL,
       size_bytes      BIGINT NOT NULL DEFAULT 0,
       rig             JSONB NOT NULL DEFAULT '{}'::jsonb,
       animations      JSONB NOT NULL DEFAULT '[]'::jsonb,
       game_stats      JSONB NOT NULL DEFAULT '{}'::jsonb,
       provenance      JSONB NOT NULL DEFAULT '{}'::jsonb,
       schema_version  INTEGER NOT NULL DEFAULT 1,
       warnings        JSONB NOT NULL DEFAULT '[]'::jsonb,
       created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS ${charactersTable}_tenant_created_at_idx
       ON ${charactersTable} (tenant_id, created_at DESC)`,
  );
}

function sanitizeIdentifier(identifier: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/u.test(identifier)) {
    throw new Error(`invalid postgres identifier: ${identifier}`);
  }
  return identifier;
}

export async function postgresCharacterJobStoreFromEnv(
  env: Record<string, string | undefined> = process.env,
): Promise<PostgresCharacterJobStore | undefined> {
  const connectionString = env.GREYBOX_CHARACTER_JOBS_PG_URL?.trim();
  if (!connectionString) return undefined;
  // @ts-expect-error -- 'pg' is an optional peer dependency.
  const pgModule = (await import('pg').catch(() => undefined)) as
    | { default?: { Pool: new (opts: { connectionString: string }) => unknown } }
    | { Pool: new (opts: { connectionString: string }) => unknown }
    | undefined;
  if (!pgModule) {
    throw new Error(
      'GREYBOX_CHARACTER_JOBS_PG_URL is set but the `pg` package is not installed. ' +
      'Install pg or unset the env var to fall back to in-memory character jobs.',
    );
  }
  const Pool = ('default' in pgModule && pgModule.default
    ? pgModule.default.Pool
    : (pgModule as { Pool: new (opts: { connectionString: string }) => unknown }).Pool);
  const pool = new Pool({ connectionString }) as {
    query: (text: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
  };
  return await PostgresCharacterJobStore.create({
    client: { query: (text, values) => pool.query(text, values) },
    ...(env.GREYBOX_CHARACTER_JOBS_TABLE ? { jobsTableName: env.GREYBOX_CHARACTER_JOBS_TABLE } : {}),
    ...(env.GREYBOX_CHARACTERS_TABLE ? { charactersTableName: env.GREYBOX_CHARACTERS_TABLE } : {}),
  });
}
