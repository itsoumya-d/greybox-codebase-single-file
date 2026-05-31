// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

// Postgres-backed audit log. Wire-compatible with FileAuditLog so existing
// callers (server.ts, routers) can swap implementations without code changes.
//
// Why Postgres:
//   - FileAuditLog reads the entire file on every append to compute the chain
//     hash. That is O(N^2) in the cumulative log size; acceptable for a few
//     thousand entries (single-tenant pilots) but fails as enterprise tenants
//     ramp into hundreds of thousands of entries per month.
//   - Postgres lets us ask for "the latest hash" with an O(1) indexed lookup
//     (`ORDER BY sequence DESC LIMIT 1`) and stream entries on read with
//     server-side filtering, so append latency stays constant.
//   - The hash-chain math is identical to the file implementation: we
//     reuse hashAuditEntry / sealAuditEntry / verifyAuditChain so the SOC2
//     audit trail story is unchanged.
//
// Schema:
//   CREATE TABLE audit_log_entries (
//     sequence    BIGSERIAL PRIMARY KEY,
//     id          TEXT UNIQUE NOT NULL,
//     tenant_id   TEXT NOT NULL,
//     action      TEXT NOT NULL,
//     created_at  TIMESTAMPTZ NOT NULL,
//     entry       JSONB NOT NULL  -- serialized AuditLogEntry including seal
//   );
//   CREATE INDEX audit_log_entries_tenant_idx ON audit_log_entries (tenant_id);
//   CREATE INDEX audit_log_entries_action_idx ON audit_log_entries (action);
//   CREATE INDEX audit_log_entries_created_at_idx ON audit_log_entries (created_at);
//
// The driver is loaded via dynamic import (see postgresAuditLogFromEnv) so
// cloud's zero-runtime-dep posture is preserved when Postgres is unconfigured.

import type {
  AuditLog,
  AuditChainVerification,
  AuditLogEntry,
  AuditLogFilter,
  AuditSealOptions,
} from './auditLog.js';
import {
  hashAuditEntry,
  sanitizeAuditLogEntry,
  sealAuditEntry,
  verifyAuditChain,
} from './auditLog.js';

export interface PostgresAuditLogOptions {
  /** Required: a pg-style client. */
  readonly client: PostgresAuditLogClient;
  /** Optional: override the default table name (`audit_log_entries`). */
  readonly tableName?: string;
  /** Optional: HMAC seal config. When provided, every appended entry is signed. */
  readonly seal?: AuditSealOptions;
}

export interface PostgresAuditLogClient {
  query(text: string, values?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
  connect?(): Promise<PostgresAuditLogSession>;
}

export interface PostgresAuditLogSession extends PostgresAuditLogClient {
  release(): void;
}

const DEFAULT_TABLE = 'audit_log_entries';
const AUDIT_APPEND_LOCK_KEY = 4_287_310_941;

/**
 * Drop-in replacement for FileAuditLog with the same public surface
 * (append/readEntries/verify). Use {@link create} to build instances so the
 * table-bootstrap query runs once.
 */
export class PostgresAuditLog implements AuditLog {
  private readonly client: PostgresAuditLogClient;
  private readonly tableName: string;
  private readonly seal: AuditSealOptions | undefined;
  // Local mutex chain: serialise appends in this Node process. When the
  // client exposes connect(), each append also takes a Postgres transaction-
  // scoped advisory lock so multiple replicas preserve the global hash chain.
  private appendChain: Promise<void> = Promise.resolve();

  private constructor(options: PostgresAuditLogOptions) {
    this.client = options.client;
    this.tableName = sanitizeIdentifier(options.tableName ?? DEFAULT_TABLE);
    if (options.seal) this.seal = options.seal;
  }

  static async create(options: PostgresAuditLogOptions): Promise<PostgresAuditLog> {
    const tableName = sanitizeIdentifier(options.tableName ?? DEFAULT_TABLE);
    await ensureSchema(options.client, tableName);
    return new PostgresAuditLog(options);
  }

  async append(entry: AuditLogEntry): Promise<void> {
    // Each append must observe the latest sequence/hash. The promise chain
    // handles this process; the advisory lock handles multi-replica writes.
    const op = this.appendChain
      .catch(() => undefined)
      .then(async () => {
        await this.withAppendSession(async (client) => {
          const { previousHash, sequence } = await this.latestChainState(client);
          const safeEntry = sanitizeAuditLogEntry(entry);
          const unsealed: AuditLogEntry = {
            ...safeEntry,
            schemaVersion: 1,
            sequence,
            previousHash,
            hash: undefined,
          };
          const hashed: AuditLogEntry = {
            ...unsealed,
            hash: hashAuditEntry(unsealed),
          };
          const sealed: AuditLogEntry = this.seal ? sealAuditEntry(hashed, this.seal) : hashed;
          await client.query(
            `INSERT INTO ${this.tableName} (id, tenant_id, action, created_at, entry)
             VALUES ($1, $2, $3, $4, $5)`,
            [
              sealed.id,
              sealed.tenantId,
              sealed.action,
              new Date(sealed.createdAt).toISOString(),
              JSON.stringify(sealed),
            ],
          );
        });
      });
    this.appendChain = op;
    await op;
  }

  async readEntries(filter: AuditLogFilter = {}): Promise<AuditLogEntry[]> {
    const { sql, values } = buildSelect(this.tableName, filter);
    const result = await this.client.query(sql, values);
    return result.rows.map((row) => decodeEntry(row.entry));
  }

  async verify(filter: AuditLogFilter = {}): Promise<AuditChainVerification> {
    // Verification requires the full chain ordered by sequence; partial
    // verifications would yield false positives on chain breaks before the
    // filter window.
    const all = await this.readEntries({});
    const result = verifyAuditChain(all, this.seal);
    const matching = filterAuditEntries(all, filter).length;
    return { ...result, matching };
  }

  private async withAppendSession<T>(run: (client: PostgresAuditLogClient) => Promise<T>): Promise<T> {
    if (!this.client.connect) return await run(this.client);
    const session = await this.client.connect();
    try {
      await session.query('BEGIN');
      await session.query('SELECT pg_advisory_xact_lock($1::bigint)', [AUDIT_APPEND_LOCK_KEY]);
      const result = await run(session);
      await session.query('COMMIT');
      return result;
    } catch (error) {
      await session.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      session.release();
    }
  }

  private async latestChainState(client: PostgresAuditLogClient): Promise<{ previousHash: string | null; sequence: number }> {
    const result = await client.query(
      `SELECT entry FROM ${this.tableName} ORDER BY sequence DESC LIMIT 1`,
    );
    const row = result.rows[0];
    if (!row) return { previousHash: null, sequence: 1 };
    const latest = decodeEntry(row.entry);
    return {
      previousHash: latest.hash ?? null,
      sequence: (latest.sequence ?? 0) + 1,
    };
  }
}

function decodeEntry(raw: unknown): AuditLogEntry {
  if (typeof raw === 'string') return JSON.parse(raw) as AuditLogEntry;
  return raw as AuditLogEntry;
}

function buildSelect(
  tableName: string,
  filter: AuditLogFilter,
): { sql: string; values: unknown[] } {
  const where: string[] = [];
  const values: unknown[] = [];
  if (filter.tenantId) {
    values.push(filter.tenantId);
    where.push(`tenant_id = $${values.length}`);
  }
  if (filter.action) {
    values.push(filter.action);
    where.push(`action = $${values.length}`);
  }
  if (filter.since) {
    values.push(new Date(filter.since).toISOString());
    where.push(`created_at >= $${values.length}`);
  }
  if (filter.until) {
    values.push(new Date(filter.until).toISOString());
    where.push(`created_at < $${values.length}`);
  }
  const whereClause = where.length > 0 ? ` WHERE ${where.join(' AND ')}` : '';
  return {
    sql: `SELECT entry FROM ${tableName}${whereClause} ORDER BY sequence ASC`,
    values,
  };
}

function filterAuditEntries(entries: AuditLogEntry[], filter: AuditLogFilter): AuditLogEntry[] {
  const sinceMs = filter.since ? Date.parse(filter.since) : undefined;
  const untilMs = filter.until ? Date.parse(filter.until) : undefined;
  return entries
    .filter((entry) => !filter.tenantId || entry.tenantId === filter.tenantId)
    .filter((entry) => !filter.action || entry.action === filter.action)
    .filter((entry) => sinceMs === undefined || Date.parse(entry.createdAt) >= sinceMs)
    .filter((entry) => untilMs === undefined || Date.parse(entry.createdAt) < untilMs);
}

async function ensureSchema(client: PostgresAuditLogClient, tableName: string): Promise<void> {
  await client.query(
    `CREATE TABLE IF NOT EXISTS ${tableName} (
       sequence    BIGSERIAL PRIMARY KEY,
       id          TEXT UNIQUE NOT NULL,
       tenant_id   TEXT NOT NULL,
       action      TEXT NOT NULL,
       created_at  TIMESTAMPTZ NOT NULL,
       entry       JSONB NOT NULL
     )`,
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS ${tableName}_tenant_idx ON ${tableName} (tenant_id)`,
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS ${tableName}_action_idx ON ${tableName} (action)`,
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS ${tableName}_created_at_idx ON ${tableName} (created_at)`,
  );
}

function sanitizeIdentifier(identifier: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/u.test(identifier)) {
    throw new Error(`invalid postgres identifier: ${identifier}`);
  }
  return identifier;
}

export async function postgresAuditLogFromEnv(
  env: Record<string, string | undefined> = process.env,
  seal?: AuditSealOptions,
): Promise<PostgresAuditLog | undefined> {
  const connectionString = env.GREYBOX_AUDIT_LOG_PG_URL?.trim();
  if (!connectionString) return undefined;
  // @ts-expect-error -- 'pg' is an optional peer dependency.
  const pgModule = (await import('pg').catch(() => undefined)) as
    | { default?: { Pool: new (opts: { connectionString: string }) => unknown } }
    | { Pool: new (opts: { connectionString: string }) => unknown }
    | undefined;
  if (!pgModule) {
    throw new Error(
      'GREYBOX_AUDIT_LOG_PG_URL is set but the `pg` package is not installed. ' +
      'Install pg or unset the env var to fall back to the file-based audit log.',
    );
  }
  const Pool = ('default' in pgModule && pgModule.default ? pgModule.default.Pool : (pgModule as { Pool: new (opts: { connectionString: string }) => unknown }).Pool);
  const pool = new Pool({ connectionString }) as {
    query: (text: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
    connect: () => Promise<{
      query: (text: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
      release: () => void;
    }>;
  };
  return await PostgresAuditLog.create({
    client: {
      query: (text, values) => pool.query(text, values),
      connect: async () => {
        const client = await pool.connect();
        return {
          query: (text, values) => client.query(text, values),
          release: () => client.release(),
        };
      },
    },
    ...(env.GREYBOX_AUDIT_LOG_PG_TABLE ? { tableName: env.GREYBOX_AUDIT_LOG_PG_TABLE } : {}),
    ...(seal ? { seal } : {}),
  });
}
