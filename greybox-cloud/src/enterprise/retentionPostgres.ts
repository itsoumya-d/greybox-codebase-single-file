// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

// Postgres-backed legal-hold store. It preserves FileLegalHoldStore's
// append-version behavior so counsel releases and deletion blockers remain
// auditable across hosted replicas.

import type {
  LegalHoldFilter,
  LegalHoldRecord,
  LegalHoldStore,
} from './retention.js';
import {
  legalHoldRecordFromInput,
  legalHoldRecordWithUpdate,
  RetentionError,
} from './retention.js';

export interface PostgresLegalHoldStoreOptions {
  readonly client: PostgresLegalHoldClient;
  readonly tableName?: string;
}

export interface PostgresLegalHoldClient {
  query(text: string, values?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
}

const DEFAULT_TABLE = 'legal_holds';

export class PostgresLegalHoldStore implements LegalHoldStore {
  private readonly client: PostgresLegalHoldClient;
  private readonly tableName: string;

  private constructor(options: PostgresLegalHoldStoreOptions) {
    this.client = options.client;
    this.tableName = sanitizeIdentifier(options.tableName ?? DEFAULT_TABLE);
  }

  static async create(options: PostgresLegalHoldStoreOptions): Promise<PostgresLegalHoldStore> {
    const tableName = sanitizeIdentifier(options.tableName ?? DEFAULT_TABLE);
    await ensureSchema(options.client, tableName);
    return new PostgresLegalHoldStore(options);
  }

  async create(input: unknown, actorId: string, now = new Date()): Promise<LegalHoldRecord> {
    const record = legalHoldRecordFromInput(input, actorId, now);
    await this.insertVersion(record);
    return record;
  }

  async list(filter: LegalHoldFilter = {}): Promise<LegalHoldRecord[]> {
    const { sql, values } = buildLatestSelect(this.tableName, filter);
    const result = await this.client.query(sql, values);
    return result.rows.map((row) => decodeRecord(row.record));
  }

  async get(id: string): Promise<LegalHoldRecord | undefined> {
    const result = await this.client.query(
      `SELECT record FROM ${this.tableName} WHERE id = $1 ORDER BY revision DESC LIMIT 1`,
      [id],
    );
    const row = result.rows[0];
    return row ? decodeRecord(row.record) : undefined;
  }

  async update(
    id: string,
    input: unknown,
    actorId: string,
    now = new Date(),
  ): Promise<LegalHoldRecord> {
    const current = await this.get(id);
    if (!current) throw new RetentionError(404, 'legal_hold_not_found');
    const next = legalHoldRecordWithUpdate(current, input, actorId, now);
    await this.insertVersion(next);
    return next;
  }

  private async insertVersion(record: LegalHoldRecord): Promise<void> {
    await this.client.query(
      `INSERT INTO ${this.tableName} (
         id,
         tenant_id,
         status,
         datasets,
         created_at,
         updated_at,
         record
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        record.id,
        record.tenantId,
        record.status,
        record.datasets,
        record.createdAt,
        record.updatedAt,
        JSON.stringify(record),
      ],
    );
  }
}

function decodeRecord(raw: unknown): LegalHoldRecord {
  return typeof raw === 'string' ? (JSON.parse(raw) as LegalHoldRecord) : (raw as LegalHoldRecord);
}

function buildLatestSelect(
  tableName: string,
  filter: LegalHoldFilter,
): { sql: string; values: unknown[] } {
  const where: string[] = [];
  const values: unknown[] = [];
  if (filter.tenantId) {
    values.push(filter.tenantId);
    where.push(`tenant_id = $${values.length}`);
  }
  if (filter.status) {
    values.push(filter.status);
    where.push(`status = $${values.length}`);
  }
  if (filter.dataset) {
    values.push(filter.dataset);
    where.push(`$${values.length} = ANY(datasets)`);
  }
  const whereClause = where.length > 0 ? ` WHERE ${where.join(' AND ')}` : '';
  return {
    sql: `SELECT record
          FROM (
            SELECT DISTINCT ON (id)
              id, tenant_id, status, datasets, created_at, revision, record
            FROM ${tableName}
            ORDER BY id, revision DESC
          ) latest${whereClause}
          ORDER BY created_at DESC, id DESC`,
    values,
  };
}

async function ensureSchema(client: PostgresLegalHoldClient, tableName: string): Promise<void> {
  await client.query(
    `CREATE TABLE IF NOT EXISTS ${tableName} (
       revision   BIGSERIAL PRIMARY KEY,
       id         TEXT NOT NULL,
       tenant_id  TEXT NOT NULL,
       status     TEXT NOT NULL,
       datasets   TEXT[] NOT NULL,
       created_at TIMESTAMPTZ NOT NULL,
       updated_at TIMESTAMPTZ NOT NULL,
       record     JSONB NOT NULL
     )`,
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS ${tableName}_latest_idx ON ${tableName} (id, revision DESC)`,
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS ${tableName}_tenant_status_idx ON ${tableName} (tenant_id, status, created_at DESC)`,
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS ${tableName}_datasets_idx ON ${tableName} USING GIN (datasets)`,
  );
}

function sanitizeIdentifier(identifier: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/u.test(identifier)) {
    throw new Error(`invalid postgres identifier: ${identifier}`);
  }
  return identifier;
}

export async function postgresLegalHoldStoreFromEnv(
  env: Record<string, string | undefined> = process.env,
): Promise<PostgresLegalHoldStore | undefined> {
  const connectionString = env.GREYBOX_LEGAL_HOLD_PG_URL?.trim();
  if (!connectionString) return undefined;
  // @ts-expect-error -- 'pg' is an optional peer dependency.
  const pgModule = (await import('pg').catch(() => undefined)) as
    | { default?: { Pool: new (opts: { connectionString: string }) => unknown } }
    | { Pool: new (opts: { connectionString: string }) => unknown }
    | undefined;
  if (!pgModule) {
    throw new Error(
      'GREYBOX_LEGAL_HOLD_PG_URL is set but the `pg` package is not installed. ' +
      'Install pg or unset the env var to fall back to the file-based legal hold store.',
    );
  }
  const Pool = ('default' in pgModule && pgModule.default ? pgModule.default.Pool : (pgModule as { Pool: new (opts: { connectionString: string }) => unknown }).Pool);
  const pool = new Pool({ connectionString }) as {
    query: (text: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
  };
  return await PostgresLegalHoldStore.create({
    client: { query: (text, values) => pool.query(text, values) },
    ...(env.GREYBOX_LEGAL_HOLD_PG_TABLE ? { tableName: env.GREYBOX_LEGAL_HOLD_PG_TABLE } : {}),
  });
}
