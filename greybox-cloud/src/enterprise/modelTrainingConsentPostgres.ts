// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

// Postgres-backed model-training consent store. This is the enforcement-grade
// version of the file JSONL ledger: every opt-in, opt-out, and revocation is
// durable across cloud replicas, while prompt/output/game-IP payloads remain
// out of the store.

import type { AuthContext } from '../types.js';
import type {
  ModelTrainingConsentFilter,
  ModelTrainingConsentRecord,
  ModelTrainingConsentStore,
} from './modelTrainingConsent.js';
import { modelTrainingConsentRecordFromInput } from './modelTrainingConsent.js';

export interface PostgresModelTrainingConsentOptions {
  readonly client: PostgresModelTrainingConsentClient;
  readonly tableName?: string;
}

export interface PostgresModelTrainingConsentClient {
  query(text: string, values?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
}

const DEFAULT_TABLE = 'model_training_consents';

export class PostgresModelTrainingConsentStore implements ModelTrainingConsentStore {
  private readonly client: PostgresModelTrainingConsentClient;
  private readonly tableName: string;

  private constructor(options: PostgresModelTrainingConsentOptions) {
    this.client = options.client;
    this.tableName = sanitizeIdentifier(options.tableName ?? DEFAULT_TABLE);
  }

  static async create(
    options: PostgresModelTrainingConsentOptions,
  ): Promise<PostgresModelTrainingConsentStore> {
    const tableName = sanitizeIdentifier(options.tableName ?? DEFAULT_TABLE);
    await ensureSchema(options.client, tableName);
    return new PostgresModelTrainingConsentStore(options);
  }

  async create(input: unknown, context: AuthContext, now = new Date()): Promise<ModelTrainingConsentRecord> {
    const record = modelTrainingConsentRecordFromInput(input, context, now);
    await this.client.query(
      `INSERT INTO ${this.tableName} (
         id,
         tenant_id,
         user_id,
         project_id,
         artifact_id,
         status,
         created_at,
         record
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        record.id,
        record.tenantId,
        record.userId,
        record.projectId,
        record.artifactId ?? null,
        record.status,
        record.createdAt,
        JSON.stringify(record),
      ],
    );
    return record;
  }

  async list(filter: ModelTrainingConsentFilter = {}): Promise<ModelTrainingConsentRecord[]> {
    const { sql, values } = buildSelect(this.tableName, filter);
    const result = await this.client.query(sql, values);
    return result.rows.map((row) => decodeRecord(row.record));
  }

  async latest(filter: ModelTrainingConsentFilter): Promise<ModelTrainingConsentRecord | undefined> {
    return (await this.list(filter))[0];
  }
}

function decodeRecord(raw: unknown): ModelTrainingConsentRecord {
  return typeof raw === 'string'
    ? (JSON.parse(raw) as ModelTrainingConsentRecord)
    : (raw as ModelTrainingConsentRecord);
}

function buildSelect(
  tableName: string,
  filter: ModelTrainingConsentFilter,
): { sql: string; values: unknown[] } {
  const where: string[] = [];
  const values: unknown[] = [];
  if (filter.tenantId) {
    values.push(filter.tenantId);
    where.push(`tenant_id = $${values.length}`);
  }
  if (filter.userId) {
    values.push(filter.userId);
    where.push(`user_id = $${values.length}`);
  }
  if (filter.projectId) {
    values.push(filter.projectId);
    where.push(`project_id = $${values.length}`);
  }
  if (filter.artifactId) {
    values.push(filter.artifactId);
    where.push(`artifact_id = $${values.length}`);
  }
  const whereClause = where.length > 0 ? ` WHERE ${where.join(' AND ')}` : '';
  return {
    sql: `SELECT record FROM ${tableName}${whereClause} ORDER BY created_at DESC, id DESC`,
    values,
  };
}

async function ensureSchema(client: PostgresModelTrainingConsentClient, tableName: string): Promise<void> {
  await client.query(
    `CREATE TABLE IF NOT EXISTS ${tableName} (
       id          TEXT PRIMARY KEY,
       tenant_id   TEXT NOT NULL,
       user_id     TEXT NOT NULL,
       project_id  TEXT NOT NULL,
       artifact_id TEXT,
       status      TEXT NOT NULL,
       created_at  TIMESTAMPTZ NOT NULL,
       record      JSONB NOT NULL
     )`,
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS ${tableName}_tenant_project_idx ON ${tableName} (tenant_id, project_id, created_at DESC)`,
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS ${tableName}_user_idx ON ${tableName} (tenant_id, user_id, created_at DESC)`,
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS ${tableName}_artifact_idx ON ${tableName} (tenant_id, project_id, artifact_id, created_at DESC)`,
  );
}

function sanitizeIdentifier(identifier: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/u.test(identifier)) {
    throw new Error(`invalid postgres identifier: ${identifier}`);
  }
  return identifier;
}

export async function postgresModelTrainingConsentStoreFromEnv(
  env: Record<string, string | undefined> = process.env,
): Promise<PostgresModelTrainingConsentStore | undefined> {
  const connectionString = env.GREYBOX_MODEL_TRAINING_CONSENT_PG_URL?.trim();
  if (!connectionString) return undefined;
  // @ts-expect-error -- 'pg' is an optional peer dependency.
  const pgModule = (await import('pg').catch(() => undefined)) as
    | { default?: { Pool: new (opts: { connectionString: string }) => unknown } }
    | { Pool: new (opts: { connectionString: string }) => unknown }
    | undefined;
  if (!pgModule) {
    throw new Error(
      'GREYBOX_MODEL_TRAINING_CONSENT_PG_URL is set but the `pg` package is not installed. ' +
      'Install pg or unset the env var to fall back to the file-based model-training consent store.',
    );
  }
  const Pool = ('default' in pgModule && pgModule.default ? pgModule.default.Pool : (pgModule as { Pool: new (opts: { connectionString: string }) => unknown }).Pool);
  const pool = new Pool({ connectionString }) as {
    query: (text: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
  };
  return await PostgresModelTrainingConsentStore.create({
    client: { query: (text, values) => pool.query(text, values) },
    ...(env.GREYBOX_MODEL_TRAINING_CONSENT_PG_TABLE ? { tableName: env.GREYBOX_MODEL_TRAINING_CONSENT_PG_TABLE } : {}),
  });
}
