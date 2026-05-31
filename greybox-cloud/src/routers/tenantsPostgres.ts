// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

// Postgres-backed TenantSnapshotPersister. Wires into TenantStore via the
// pluggable `persister` option so single-node deployments keep using the
// file-based default and multi-node / HA deployments can point at Postgres
// without code changes to the inference/auth/server hot path.
//
// Storage layout: a single row in `tenant_snapshot` holds the JSON snapshot
// for the whole platform. Why a single row instead of one row per tenant:
//   - TenantStore's existing interface guarantees atomic writes of the full
//     snapshot, including the optional HMAC seal. Mirroring that as a single
//     row lets us reuse the seal verification logic unchanged.
//   - Tenant churn is low (single-digit writes per day for our anticipated
//     customer base); cold-boot reads are cheap, request paths can explicitly
//     refresh the cached row when durable cross-replica freshness matters,
//     and the single-row shape keeps that refresh atomic.
//   - Migration to a normalised per-tenant table is straightforward when
//     traffic warrants; the snapshot JSON parses into the same shape.
//
// Schema:
//   CREATE TABLE tenant_snapshot (
//     id          TEXT PRIMARY KEY,        -- always 'singleton'
//     snapshot    JSONB NOT NULL,          -- serialized TenantSnapshot
//     updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
//   );
//
// The driver is loaded via dynamic import to keep the cloud package's zero-
// runtime-dependency posture intact when Postgres is not configured.

import type { TenantSnapshot, TenantSnapshotPersister } from './tenants.js';

export interface PostgresTenantPersisterOptions {
  /** A function that returns a pg-style client when the persister needs one. */
  client: PostgresTenantClient;
  /** Override the default row id ('singleton'); useful for multi-tenant test harnesses. */
  snapshotId?: string;
  /** Override the default table name (`tenant_snapshot`). */
  tableName?: string;
}

/**
 * Minimal subset of `pg.Client` / `pg.Pool` we depend on. Defined as an
 * interface here so the cloud package never imports `pg` directly. Operators
 * supply a client (typically `new pg.Pool({ connectionString }).query`) when
 * they wire the persister at boot.
 */
export interface PostgresTenantClient {
  query(text: string, values?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
}

const DEFAULT_TABLE = 'tenant_snapshot';
const DEFAULT_SNAPSHOT_ID = 'singleton';

/**
 * Postgres persister using `loadSync`-shaped APIs. The interface defined by
 * TenantStore is synchronous because the in-memory map answers ordinary reads.
 * We satisfy the synchronous contract by pre-loading the snapshot during
 * {@link initPostgresTenantPersister} and caching it. Request paths that must
 * observe cross-replica writes call refresh(), which updates that cache from
 * Postgres before TenantStore re-loads it synchronously.
 *
 * Subsequent saves are async-fire-and-forget under the hood; the persister
 * surfaces them via the {@link drain} method so operators can flush before
 * graceful shutdown.
 */
export class PostgresTenantSnapshotPersister implements TenantSnapshotPersister {
  private readonly client: PostgresTenantClient;
  private readonly tableName: string;
  private readonly snapshotId: string;
  private cached: TenantSnapshot | undefined;
  private pendingWrite: Promise<void> = Promise.resolve();
  private writeError: Error | undefined;

  private constructor(options: PostgresTenantPersisterOptions, initial: TenantSnapshot | undefined) {
    this.client = options.client;
    this.tableName = sanitizeIdentifier(options.tableName ?? DEFAULT_TABLE);
    this.snapshotId = options.snapshotId ?? DEFAULT_SNAPSHOT_ID;
    this.cached = initial;
  }

  /**
   * Construct the persister and pre-load the current snapshot. Call this once
   * at server boot. TenantStore expects the persister to answer loadSync()
   * synchronously from cache.
   */
  static async create(options: PostgresTenantPersisterOptions): Promise<PostgresTenantSnapshotPersister> {
    const snapshotId = options.snapshotId ?? DEFAULT_SNAPSHOT_ID;
    const table = sanitizeIdentifier(options.tableName ?? DEFAULT_TABLE);
    await ensureSchema(options.client, table);
    const initial = await readSnapshot(options.client, table, snapshotId);
    return new PostgresTenantSnapshotPersister(options, initial);
  }

  loadSync(): TenantSnapshot | undefined {
    return this.cached;
  }

  saveSync(snapshot: TenantSnapshot): void {
    this.cached = snapshot;
    // Chain writes so two saveSync() calls in quick succession serialize
    // through a single upsert sequence. Postgres still gets the latest, but
    // we don't race two UPSERTs on the same row.
    this.pendingWrite = this.pendingWrite
      .catch(() => undefined)
      .then(async () => {
        try {
          await this.client.query(
            `INSERT INTO ${this.tableName} (id, snapshot, updated_at)
             VALUES ($1, $2, NOW())
             ON CONFLICT (id) DO UPDATE SET snapshot = EXCLUDED.snapshot, updated_at = NOW()`,
            [this.snapshotId, JSON.stringify(snapshot)],
          );
          this.writeError = undefined;
        } catch (err) {
          // Persist failure: cache stays consistent with the latest mutation
          // so subsequent reads remain accurate, but surface the error via
          // drain() so callers can detect persistence loss.
          this.writeError = err instanceof Error ? err : new Error(String(err));
          throw this.writeError;
        }
      });
  }

  /**
   * Refresh the cached snapshot from Postgres. This is intentionally explicit:
   * request handlers call TenantStore.refreshFromPersister() at trust
   * boundaries such as WorkOS auth and managed inference, while purely
   * in-memory deployments keep the zero-latency sync path.
   */
  async refresh(): Promise<void> {
    await this.drain();
    this.cached = await readSnapshot(this.client, this.tableName, this.snapshotId);
  }

  /**
   * Await all pending writes. Returns the most recent write error if any
   * saveSync() failed since the last drain. Callers (server shutdown,
   * integration tests) use this to assert that mutations made it to Postgres.
   */
  async drain(): Promise<void> {
    await this.pendingWrite.catch(() => undefined);
    if (this.writeError) {
      const err = this.writeError;
      this.writeError = undefined;
      throw err;
    }
  }
}

/** Create the table if it doesn't already exist. Idempotent. */
async function ensureSchema(client: PostgresTenantClient, tableName: string): Promise<void> {
  await client.query(
    `CREATE TABLE IF NOT EXISTS ${tableName} (
       id         TEXT PRIMARY KEY,
       snapshot   JSONB NOT NULL,
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
  );
}

async function readSnapshot(
  client: PostgresTenantClient,
  tableName: string,
  snapshotId: string,
): Promise<TenantSnapshot | undefined> {
  const result = await client.query(
    `SELECT snapshot FROM ${tableName} WHERE id = $1 LIMIT 1`,
    [snapshotId],
  );
  const row = result.rows[0];
  if (!row || row.snapshot === undefined) return undefined;
  return decodeSnapshot(row.snapshot);
}

function decodeSnapshot(value: unknown): TenantSnapshot {
  return typeof value === 'string' ? (JSON.parse(value) as TenantSnapshot) : (value as TenantSnapshot);
}

/**
 * Postgres identifiers can't be parameterised, so we restrict the table name
 * to a safe character class to prevent SQL injection via operator-supplied
 * config. Anything outside [A-Za-z0-9_] throws; the default `tenant_snapshot`
 * is always valid.
 */
function sanitizeIdentifier(identifier: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/u.test(identifier)) {
    throw new Error(`invalid postgres identifier: ${identifier}`);
  }
  return identifier;
}

/**
 * Convenience loader for operators: reads `GREYBOX_TENANT_STORE_PG_URL` and
 * dynamically imports `pg` (an optional peer dependency) to build a pool-
 * backed client. Returns undefined when the env var isn't set so server boot
 * can fall back to the file-based persister cleanly.
 */
export async function postgresTenantPersisterFromEnv(
  env: Record<string, string | undefined> = process.env,
): Promise<PostgresTenantSnapshotPersister | undefined> {
  const connectionString = env.GREYBOX_TENANT_STORE_PG_URL?.trim();
  if (!connectionString) return undefined;
  // @ts-expect-error -- 'pg' is an optional peer dependency.
  const pgModule = (await import('pg').catch(() => undefined)) as
    | { default?: { Pool: new (opts: { connectionString: string }) => unknown } }
    | { Pool: new (opts: { connectionString: string }) => unknown }
    | undefined;
  if (!pgModule) {
    throw new Error(
      'GREYBOX_TENANT_STORE_PG_URL is set but the `pg` package is not installed. ' +
      'Install pg or unset the env var to fall back to the file-based tenant store.',
    );
  }
  const Pool = ('default' in pgModule && pgModule.default ? pgModule.default.Pool : (pgModule as { Pool: new (opts: { connectionString: string }) => unknown }).Pool);
  const pool = new Pool({ connectionString }) as {
    query: (text: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
  };
  return await PostgresTenantSnapshotPersister.create({
    client: { query: (text, values) => pool.query(text, values) },
    ...(env.GREYBOX_TENANT_STORE_PG_TABLE ? { tableName: env.GREYBOX_TENANT_STORE_PG_TABLE } : {}),
  });
}
