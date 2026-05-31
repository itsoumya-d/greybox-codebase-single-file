// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

// Postgres-backed security incident store. It keeps the JSONL store's
// append-version behavior so breach-clock and containment evidence is never
// overwritten, while list/get calls expose only the latest version per incident.

import type {
  SecurityIncidentFilter,
  SecurityIncidentRecord,
  SecurityIncidentStore,
} from './incidents.js';
import {
  SecurityIncidentError,
  securityIncidentRecordFromInput,
  securityIncidentRecordWithUpdate,
} from './incidents.js';

export interface PostgresSecurityIncidentStoreOptions {
  readonly client: PostgresSecurityIncidentClient;
  readonly tableName?: string;
}

export interface PostgresSecurityIncidentClient {
  query(text: string, values?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
}

const DEFAULT_TABLE = 'security_incidents';

export class PostgresSecurityIncidentStore implements SecurityIncidentStore {
  private readonly client: PostgresSecurityIncidentClient;
  private readonly tableName: string;

  private constructor(options: PostgresSecurityIncidentStoreOptions) {
    this.client = options.client;
    this.tableName = sanitizeIdentifier(options.tableName ?? DEFAULT_TABLE);
  }

  static async create(
    options: PostgresSecurityIncidentStoreOptions,
  ): Promise<PostgresSecurityIncidentStore> {
    const tableName = sanitizeIdentifier(options.tableName ?? DEFAULT_TABLE);
    await ensureSchema(options.client, tableName);
    return new PostgresSecurityIncidentStore(options);
  }

  async create(input: unknown, actorId: string, now = new Date()): Promise<SecurityIncidentRecord> {
    const record = securityIncidentRecordFromInput(input, actorId, now);
    await this.insertVersion(record);
    return record;
  }

  async list(filter: SecurityIncidentFilter = {}): Promise<SecurityIncidentRecord[]> {
    const { sql, values } = buildLatestSelect(this.tableName, filter);
    const result = await this.client.query(sql, values);
    return result.rows.map((row) => decodeRecord(row.record));
  }

  async get(id: string): Promise<SecurityIncidentRecord | undefined> {
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
  ): Promise<SecurityIncidentRecord> {
    const current = await this.get(id);
    if (!current) throw new SecurityIncidentError(404, 'security_incident_not_found');
    const next = securityIncidentRecordWithUpdate(current, input, actorId, now);
    await this.insertVersion(next);
    return next;
  }

  private async insertVersion(record: SecurityIncidentRecord): Promise<void> {
    await this.client.query(
      `INSERT INTO ${this.tableName} (
         id,
         tenant_id,
         status,
         severity,
         category,
         created_at,
         updated_at,
         record
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        record.id,
        record.tenantId,
        record.status,
        record.severity,
        record.category,
        record.createdAt,
        record.updatedAt,
        JSON.stringify(record),
      ],
    );
  }
}

function decodeRecord(raw: unknown): SecurityIncidentRecord {
  return typeof raw === 'string'
    ? (JSON.parse(raw) as SecurityIncidentRecord)
    : (raw as SecurityIncidentRecord);
}

function buildLatestSelect(
  tableName: string,
  filter: SecurityIncidentFilter,
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
  if (filter.severity) {
    values.push(filter.severity);
    where.push(`severity = $${values.length}`);
  }
  const whereClause = where.length > 0 ? ` WHERE ${where.join(' AND ')}` : '';
  return {
    sql: `SELECT record
          FROM (
            SELECT DISTINCT ON (id)
              id, tenant_id, status, severity, created_at, revision, record
            FROM ${tableName}
            ORDER BY id, revision DESC
          ) latest${whereClause}
          ORDER BY created_at DESC, id DESC`,
    values,
  };
}

async function ensureSchema(client: PostgresSecurityIncidentClient, tableName: string): Promise<void> {
  await client.query(
    `CREATE TABLE IF NOT EXISTS ${tableName} (
       revision   BIGSERIAL PRIMARY KEY,
       id         TEXT NOT NULL,
       tenant_id  TEXT NOT NULL,
       status     TEXT NOT NULL,
       severity   TEXT NOT NULL,
       category   TEXT NOT NULL,
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
    `CREATE INDEX IF NOT EXISTS ${tableName}_severity_idx ON ${tableName} (severity, created_at DESC)`,
  );
}

function sanitizeIdentifier(identifier: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/u.test(identifier)) {
    throw new Error(`invalid postgres identifier: ${identifier}`);
  }
  return identifier;
}

export async function postgresSecurityIncidentStoreFromEnv(
  env: Record<string, string | undefined> = process.env,
): Promise<PostgresSecurityIncidentStore | undefined> {
  const connectionString = env.GREYBOX_SECURITY_INCIDENT_PG_URL?.trim();
  if (!connectionString) return undefined;
  // @ts-expect-error -- 'pg' is an optional peer dependency.
  const pgModule = (await import('pg').catch(() => undefined)) as
    | { default?: { Pool: new (opts: { connectionString: string }) => unknown } }
    | { Pool: new (opts: { connectionString: string }) => unknown }
    | undefined;
  if (!pgModule) {
    throw new Error(
      'GREYBOX_SECURITY_INCIDENT_PG_URL is set but the `pg` package is not installed. ' +
      'Install pg or unset the env var to fall back to the file-based security incident store.',
    );
  }
  const Pool = ('default' in pgModule && pgModule.default ? pgModule.default.Pool : (pgModule as { Pool: new (opts: { connectionString: string }) => unknown }).Pool);
  const pool = new Pool({ connectionString }) as {
    query: (text: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
  };
  return await PostgresSecurityIncidentStore.create({
    client: { query: (text, values) => pool.query(text, values) },
    ...(env.GREYBOX_SECURITY_INCIDENT_PG_TABLE ? { tableName: env.GREYBOX_SECURITY_INCIDENT_PG_TABLE } : {}),
  });
}
