// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

// Postgres-backed Unity/plugin license record store. This upgrades
// GREYBOX_LICENSE_RECORDS_JSON from a single-process boot artifact into a
// durable control-plane source for revocation, suspension, expiry, and feature
// overrides across cloud replicas.

import {
  normalizeLicenseHash,
  parseLicensePlan,
  parseLicenseRecordStatus,
  parseUnityLicenseTier,
  type LicenseRecord,
  type LicenseRecordStore,
} from './licenses.js';

export interface PostgresLicenseRecordStoreOptions {
  readonly client: PostgresLicenseRecordClient;
  readonly tableName?: string;
}

export interface PostgresLicenseRecordClient {
  query(text: string, values?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
}

const DEFAULT_TABLE = 'license_records';

export class PostgresLicenseRecordStore implements LicenseRecordStore {
  private readonly client: PostgresLicenseRecordClient;
  private readonly tableName: string;

  private constructor(options: PostgresLicenseRecordStoreOptions) {
    this.client = options.client;
    this.tableName = sanitizeIdentifier(options.tableName ?? DEFAULT_TABLE);
  }

  static async create(options: PostgresLicenseRecordStoreOptions): Promise<PostgresLicenseRecordStore> {
    const tableName = sanitizeIdentifier(options.tableName ?? DEFAULT_TABLE);
    await ensureSchema(options.client, tableName);
    return new PostgresLicenseRecordStore(options);
  }

  async list(): Promise<readonly LicenseRecord[]> {
    const result = await this.client.query(
      `SELECT token_hash, tier, plan, status, expires_at, features
       FROM ${this.tableName}
       ORDER BY token_hash ASC`,
    );
    return result.rows.flatMap((row) => {
      const record = licenseRecordFromRow(row);
      return record ? [record] : [];
    });
  }

  async upsert(record: LicenseRecord): Promise<void> {
    const tokenHash = normalizeLicenseHash(record.tokenHash);
    if (!tokenHash) throw new Error('license tokenHash must be a 16 or 64 character hex digest');
    await this.client.query(
      `INSERT INTO ${this.tableName} (token_hash, tier, plan, status, expires_at, features, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (token_hash) DO UPDATE SET
         tier = EXCLUDED.tier,
         plan = EXCLUDED.plan,
         status = EXCLUDED.status,
         expires_at = EXCLUDED.expires_at,
         features = EXCLUDED.features,
         updated_at = NOW()`,
      [
        tokenHash,
        record.tier,
        record.plan ?? null,
        record.status ?? 'active',
        record.expiresAt ?? null,
        JSON.stringify(record.features ?? {}),
      ],
    );
  }
}

function licenseRecordFromRow(row: Record<string, unknown>): LicenseRecord | undefined {
  const tokenHash = typeof row.token_hash === 'string' ? normalizeLicenseHash(row.token_hash) : undefined;
  const tier = parseUnityLicenseTier(row.tier);
  if (!tokenHash || !tier) return undefined;
  const plan = parseLicensePlan(row.plan);
  const status = parseLicenseRecordStatus(row.status) ?? 'active';
  const expiresAt = postgresTimestamp(row.expires_at);
  const features = licenseFeatures(row.features);
  return {
    tokenHash,
    tier,
    ...(plan ? { plan } : {}),
    status,
    ...(expiresAt ? { expiresAt } : {}),
    ...(features ? { features } : {}),
  };
}

function postgresTimestamp(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) return new Date(value).toISOString();
  return undefined;
}

function licenseFeatures(value: unknown): LicenseRecord['features'] | undefined {
  const raw = typeof value === 'string' ? parseJson(value) : value;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const record = raw as Record<string, unknown>;
  const out: LicenseRecord['features'] = {};
  for (const key of [
    'roundTripSync',
    'mcpBridge',
    'watermark',
    'priorityQueue',
    'sso',
    'customSkillPacks',
    'siteLicense',
  ] as const) {
    if (typeof record[key] === 'boolean') out[key] = record[key];
  }
  if (typeof record.maxProjects === 'number' && Number.isInteger(record.maxProjects) && record.maxProjects >= 0) {
    out.maxProjects = record.maxProjects;
  } else if (record.maxProjects === null) {
    out.maxProjects = null;
  }
  if (typeof record.seatLimit === 'number' && Number.isInteger(record.seatLimit) && record.seatLimit >= 0) {
    out.seatLimit = record.seatLimit;
  } else if (record.seatLimit === null) {
    out.seatLimit = null;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

async function ensureSchema(client: PostgresLicenseRecordClient, tableName: string): Promise<void> {
  await client.query(
    `CREATE TABLE IF NOT EXISTS ${tableName} (
       token_hash TEXT PRIMARY KEY,
       tier       TEXT NOT NULL,
       plan       TEXT,
       status     TEXT NOT NULL DEFAULT 'active',
       expires_at TIMESTAMPTZ,
       features   JSONB NOT NULL DEFAULT '{}'::jsonb,
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
  );
}

function sanitizeIdentifier(identifier: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/u.test(identifier)) {
    throw new Error(`invalid postgres identifier: ${identifier}`);
  }
  return identifier;
}

export async function postgresLicenseRecordStoreFromEnv(
  env: Record<string, string | undefined> = process.env,
): Promise<PostgresLicenseRecordStore | undefined> {
  const connectionString = env.GREYBOX_LICENSE_RECORDS_PG_URL?.trim();
  if (!connectionString) return undefined;
  // @ts-expect-error -- 'pg' is an optional peer dependency.
  const pgModule = (await import('pg').catch(() => undefined)) as
    | { default?: { Pool: new (opts: { connectionString: string }) => unknown } }
    | { Pool: new (opts: { connectionString: string }) => unknown }
    | undefined;
  if (!pgModule) {
    throw new Error(
      'GREYBOX_LICENSE_RECORDS_PG_URL is set but the `pg` package is not installed. ' +
      'Install pg or unset the env var to fall back to static license records.',
    );
  }
  const Pool = ('default' in pgModule && pgModule.default ? pgModule.default.Pool : (pgModule as { Pool: new (opts: { connectionString: string }) => unknown }).Pool);
  const pool = new Pool({ connectionString }) as {
    query: (text: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
  };
  return await PostgresLicenseRecordStore.create({
    client: { query: (text, values) => pool.query(text, values) },
    ...(env.GREYBOX_LICENSE_RECORDS_PG_TABLE ? { tableName: env.GREYBOX_LICENSE_RECORDS_PG_TABLE } : {}),
  });
}
