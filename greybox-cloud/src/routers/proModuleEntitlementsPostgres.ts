// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

// Postgres-backed Pro module entitlement grant store. This turns marketplace
// claim responses and admin grant JSON into a durable revenue control plane so
// paid module access survives process restarts and scales across replicas.

import {
  normalizeEntitlementLookupKey,
  normalizeProModuleEntitlementGrant,
  normalizeProModuleLicenseHash,
  type ProModuleEntitlementGrantRecord,
  type ProModuleEntitlementGrantStatus,
  type ProModuleEntitlementGrantStore,
} from './pro-modules.js';

export interface PostgresProModuleEntitlementGrantStoreOptions {
  readonly client: PostgresProModuleEntitlementGrantClient;
  readonly tableName?: string;
}

export interface PostgresProModuleEntitlementGrantClient {
  query(text: string, values?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
}

const DEFAULT_TABLE = 'pro_module_entitlements';

export class PostgresProModuleEntitlementGrantStore implements ProModuleEntitlementGrantStore {
  private readonly client: PostgresProModuleEntitlementGrantClient;
  private readonly tableName: string;

  private constructor(options: PostgresProModuleEntitlementGrantStoreOptions) {
    this.client = options.client;
    this.tableName = sanitizeIdentifier(options.tableName ?? DEFAULT_TABLE);
  }

  static async create(
    options: PostgresProModuleEntitlementGrantStoreOptions,
  ): Promise<PostgresProModuleEntitlementGrantStore> {
    const tableName = sanitizeIdentifier(options.tableName ?? DEFAULT_TABLE);
    await ensureSchema(options.client, tableName);
    return new PostgresProModuleEntitlementGrantStore(options);
  }

  async list(): Promise<readonly ProModuleEntitlementGrantRecord[]> {
    const result = await this.client.query(
      `SELECT license_hash, lookup_key, grant_key, status
       FROM ${this.tableName}
       ORDER BY license_hash ASC, grant_key ASC`,
    );
    return result.rows.flatMap((row) => {
      const record = grantRecordFromRow(row);
      return record ? [record] : [];
    });
  }

  async upsert(record: ProModuleEntitlementGrantRecord): Promise<void> {
    const licenseHash = normalizeProModuleLicenseHash(record.licenseHash);
    if (!licenseHash) throw new Error('licenseHash must be a 16 character hex digest');
    const status = normalizeGrantStatus(record.status) ?? 'active';
    const lookupKey = record.lookupKey ? normalizeEntitlementLookupKey(record.lookupKey) : undefined;
    if (record.lookupKey && !lookupKey) throw new Error('lookupKey must be a Greybox entitlement lookup key');
    const grants = record.modules.flatMap((item) => {
      const grant = normalizeProModuleEntitlementGrant(item);
      return grant ? [grant] : [];
    });
    if (grants.length === 0) throw new Error('modules must include at least one valid Pro module grant');
    for (const grant of [...new Set(grants)]) {
      await this.client.query(
        `INSERT INTO ${this.tableName} (license_hash, lookup_key, grant_key, status, updated_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (license_hash, grant_key) DO UPDATE SET
           lookup_key = EXCLUDED.lookup_key,
           status = EXCLUDED.status,
           updated_at = NOW()`,
        [licenseHash, lookupKey ?? null, grant, status],
      );
    }
  }
}

function grantRecordFromRow(row: Record<string, unknown>): ProModuleEntitlementGrantRecord | undefined {
  const licenseHash = typeof row.license_hash === 'string' ? normalizeProModuleLicenseHash(row.license_hash) : undefined;
  const grant = typeof row.grant_key === 'string' ? normalizeProModuleEntitlementGrant(row.grant_key) : undefined;
  if (!licenseHash || !grant) return undefined;
  const lookupKey = typeof row.lookup_key === 'string' ? normalizeEntitlementLookupKey(row.lookup_key) : undefined;
  const status = normalizeGrantStatus(row.status) ?? 'active';
  return {
    licenseHash,
    modules: [grant],
    status,
    ...(lookupKey ? { lookupKey } : {}),
  };
}

function normalizeGrantStatus(value: unknown): ProModuleEntitlementGrantStatus | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  return normalized === 'active' || normalized === 'revoked' ? normalized : undefined;
}

async function ensureSchema(
  client: PostgresProModuleEntitlementGrantClient,
  tableName: string,
): Promise<void> {
  await client.query(
    `CREATE TABLE IF NOT EXISTS ${tableName} (
       license_hash TEXT NOT NULL,
       lookup_key   TEXT,
       grant_key    TEXT NOT NULL,
       status       TEXT NOT NULL DEFAULT 'active',
       updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       PRIMARY KEY (license_hash, grant_key)
     )`,
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS ${tableName}_lookup_key_idx
       ON ${tableName} (lookup_key)
       WHERE lookup_key IS NOT NULL`,
  );
}

function sanitizeIdentifier(identifier: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/u.test(identifier)) {
    throw new Error(`invalid postgres identifier: ${identifier}`);
  }
  return identifier;
}

export async function postgresProModuleEntitlementGrantStoreFromEnv(
  env: Record<string, string | undefined> = process.env,
): Promise<PostgresProModuleEntitlementGrantStore | undefined> {
  const connectionString = env.GREYBOX_PRO_MODULE_ENTITLEMENTS_PG_URL?.trim();
  if (!connectionString) return undefined;
  // @ts-expect-error -- 'pg' is an optional peer dependency.
  const pgModule = (await import('pg').catch(() => undefined)) as
    | { default?: { Pool: new (opts: { connectionString: string }) => unknown } }
    | { Pool: new (opts: { connectionString: string }) => unknown }
    | undefined;
  if (!pgModule) {
    throw new Error(
      'GREYBOX_PRO_MODULE_ENTITLEMENTS_PG_URL is set but the `pg` package is not installed. ' +
      'Install pg or unset the env var to fall back to static Pro module entitlements.',
    );
  }
  const Pool = ('default' in pgModule && pgModule.default ? pgModule.default.Pool : (pgModule as { Pool: new (opts: { connectionString: string }) => unknown }).Pool);
  const pool = new Pool({ connectionString }) as {
    query: (text: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
  };
  return await PostgresProModuleEntitlementGrantStore.create({
    client: { query: (text, values) => pool.query(text, values) },
    ...(env.GREYBOX_PRO_MODULE_ENTITLEMENTS_PG_TABLE
      ? { tableName: env.GREYBOX_PRO_MODULE_ENTITLEMENTS_PG_TABLE }
      : {}),
  });
}
