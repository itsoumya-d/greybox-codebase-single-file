// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

// Postgres-backed privacy-rights request store. It preserves the existing
// append-version semantics of FilePrivacyRequestStore: every status update
// writes a new row, while reads return the latest version per request id.

import type {
  PrivacyRequestCreateResult,
  PrivacyRequestFilter,
  PrivacyRequestRecord,
  PrivacyRequestStatusUpdate,
  PrivacyRequestStore,
} from './privacyRequests.js';
import {
  PrivacyRequestError,
  privacyRequestCreateResultFromInput,
  privacyRequestRecordWithStatusUpdate,
} from './privacyRequests.js';

export interface PostgresPrivacyRequestStoreOptions {
  readonly client: PostgresPrivacyRequestClient;
  readonly tableName?: string;
}

export interface PostgresPrivacyRequestClient {
  query(text: string, values?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
}

const DEFAULT_TABLE = 'privacy_requests';

export class PostgresPrivacyRequestStore implements PrivacyRequestStore {
  private readonly client: PostgresPrivacyRequestClient;
  private readonly tableName: string;

  private constructor(options: PostgresPrivacyRequestStoreOptions) {
    this.client = options.client;
    this.tableName = sanitizeIdentifier(options.tableName ?? DEFAULT_TABLE);
  }

  static async create(options: PostgresPrivacyRequestStoreOptions): Promise<PostgresPrivacyRequestStore> {
    const tableName = sanitizeIdentifier(options.tableName ?? DEFAULT_TABLE);
    await ensureSchema(options.client, tableName);
    return new PostgresPrivacyRequestStore(options);
  }

  async create(input: unknown, now = new Date()): Promise<PrivacyRequestCreateResult> {
    const result = privacyRequestCreateResultFromInput(input, now);
    await this.insertVersion(result.request);
    return result;
  }

  async list(filter: PrivacyRequestFilter = {}): Promise<PrivacyRequestRecord[]> {
    const { sql, values } = buildLatestSelect(this.tableName, filter);
    const result = await this.client.query(sql, values);
    return result.rows.map((row) => decodeRecord(row.record));
  }

  async get(id: string): Promise<PrivacyRequestRecord | undefined> {
    const result = await this.client.query(
      `SELECT record FROM ${this.tableName} WHERE id = $1 ORDER BY revision DESC LIMIT 1`,
      [id],
    );
    const row = result.rows[0];
    return row ? decodeRecord(row.record) : undefined;
  }

  async updateStatus(
    id: string,
    update: PrivacyRequestStatusUpdate,
    actorId: string,
    now = new Date(),
  ): Promise<PrivacyRequestRecord> {
    const current = await this.get(id);
    if (!current) throw new PrivacyRequestError(404, 'privacy_request_not_found');
    const next = privacyRequestRecordWithStatusUpdate(current, update, actorId, now);
    await this.insertVersion(next);
    return next;
  }

  private async insertVersion(record: PrivacyRequestRecord): Promise<void> {
    await this.client.query(
      `INSERT INTO ${this.tableName} (
         id,
         tenant_id,
         status,
         jurisdiction,
         request_type,
         created_at,
         updated_at,
         record
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        record.id,
        record.tenantId,
        record.status,
        record.jurisdiction,
        record.requestType,
        record.createdAt,
        record.updatedAt,
        JSON.stringify(record),
      ],
    );
  }
}

function decodeRecord(raw: unknown): PrivacyRequestRecord {
  return typeof raw === 'string' ? (JSON.parse(raw) as PrivacyRequestRecord) : (raw as PrivacyRequestRecord);
}

function buildLatestSelect(
  tableName: string,
  filter: PrivacyRequestFilter,
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
  if (filter.jurisdiction) {
    values.push(filter.jurisdiction);
    where.push(`jurisdiction = $${values.length}`);
  }
  const whereClause = where.length > 0 ? ` WHERE ${where.join(' AND ')}` : '';
  return {
    sql: `SELECT record
          FROM (
            SELECT DISTINCT ON (id)
              id, tenant_id, status, jurisdiction, created_at, revision, record
            FROM ${tableName}
            ORDER BY id, revision DESC
          ) latest${whereClause}
          ORDER BY created_at DESC, id DESC`,
    values,
  };
}

async function ensureSchema(client: PostgresPrivacyRequestClient, tableName: string): Promise<void> {
  await client.query(
    `CREATE TABLE IF NOT EXISTS ${tableName} (
       revision     BIGSERIAL PRIMARY KEY,
       id           TEXT NOT NULL,
       tenant_id    TEXT NOT NULL,
       status       TEXT NOT NULL,
       jurisdiction TEXT NOT NULL,
       request_type TEXT NOT NULL,
       created_at   TIMESTAMPTZ NOT NULL,
       updated_at   TIMESTAMPTZ NOT NULL,
       record       JSONB NOT NULL
     )`,
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS ${tableName}_latest_idx ON ${tableName} (id, revision DESC)`,
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS ${tableName}_tenant_status_idx ON ${tableName} (tenant_id, status, created_at DESC)`,
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS ${tableName}_jurisdiction_idx ON ${tableName} (jurisdiction, created_at DESC)`,
  );
}

function sanitizeIdentifier(identifier: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/u.test(identifier)) {
    throw new Error(`invalid postgres identifier: ${identifier}`);
  }
  return identifier;
}

export async function postgresPrivacyRequestStoreFromEnv(
  env: Record<string, string | undefined> = process.env,
): Promise<PostgresPrivacyRequestStore | undefined> {
  const connectionString = env.GREYBOX_PRIVACY_REQUEST_PG_URL?.trim();
  if (!connectionString) return undefined;
  // @ts-expect-error -- 'pg' is an optional peer dependency.
  const pgModule = (await import('pg').catch(() => undefined)) as
    | { default?: { Pool: new (opts: { connectionString: string }) => unknown } }
    | { Pool: new (opts: { connectionString: string }) => unknown }
    | undefined;
  if (!pgModule) {
    throw new Error(
      'GREYBOX_PRIVACY_REQUEST_PG_URL is set but the `pg` package is not installed. ' +
      'Install pg or unset the env var to fall back to the file-based privacy request store.',
    );
  }
  const Pool = ('default' in pgModule && pgModule.default ? pgModule.default.Pool : (pgModule as { Pool: new (opts: { connectionString: string }) => unknown }).Pool);
  const pool = new Pool({ connectionString }) as {
    query: (text: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
  };
  return await PostgresPrivacyRequestStore.create({
    client: { query: (text, values) => pool.query(text, values) },
    ...(env.GREYBOX_PRIVACY_REQUEST_PG_TABLE ? { tableName: env.GREYBOX_PRIVACY_REQUEST_PG_TABLE } : {}),
  });
}
