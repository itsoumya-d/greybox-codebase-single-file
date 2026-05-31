// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

// Postgres-backed SCIM user persister. Wires into ScimUserStore via the
// pluggable `persister` option. Same rationale as the tenant persister: file-
// based storage is single-writer, doesn't survive horizontal scale, and an
// enterprise SCIM directory needs to be readable from any cloud replica.
//
// Storage layout: per-user rows so future SCIM list operations can paginate at
// the SQL layer instead of holding the full directory in memory on the API
// node. The PRIMARY KEY is the SCIM user id; userName has a UNIQUE constraint
// to make IDP re-syncs idempotent on the database side.
//
// Schema:
//   CREATE TABLE scim_users (
//     id          TEXT PRIMARY KEY,
//     user_name   TEXT UNIQUE NOT NULL,
//     user        JSONB NOT NULL,
//     updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
//   );

import type { ScimUser, ScimUserPersister } from './scim.js';

export interface PostgresScimPersisterOptions {
  readonly client: PostgresScimClient;
  readonly tableName?: string;
}

export interface PostgresScimClient {
  query(text: string, values?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
  connect?(): Promise<PostgresScimSession>;
}

export interface PostgresScimSession extends PostgresScimClient {
  release(): void;
}

const DEFAULT_TABLE = 'scim_users';

export class PostgresScimUserPersister implements ScimUserPersister {
  private readonly client: PostgresScimClient;
  private readonly tableName: string;

  private constructor(options: PostgresScimPersisterOptions) {
    this.client = options.client;
    this.tableName = sanitizeIdentifier(options.tableName ?? DEFAULT_TABLE);
  }

  static async create(options: PostgresScimPersisterOptions): Promise<PostgresScimUserPersister> {
    const tableName = sanitizeIdentifier(options.tableName ?? DEFAULT_TABLE);
    await ensureSchema(options.client, tableName);
    return new PostgresScimUserPersister(options);
  }

  async load(): Promise<ScimUser[]> {
    const result = await this.client.query(
      `SELECT "user" FROM ${this.tableName} ORDER BY user_name ASC`,
    );
    return result.rows.map((row) => decodeUser(row.user));
  }

  async save(users: ScimUser[]): Promise<void> {
    // Strategy: upsert every user and preserve rows absent from the caller's
    // snapshot. SCIM delete is represented by active=false in ScimUserStore;
    // treating absence as a tombstone lets a stale replica erase users created
    // milliseconds earlier by another replica. Hard deletion needs an explicit
    // tombstone/retention workflow, not an accidental full-snapshot diff.
    // Identifiers are sanitised before interpolation; user values stay in
    // parameters.
    await this.withWriteTransaction(async (client) => {
      for (const user of users) {
        await client.query(
          `INSERT INTO ${this.tableName} (id, user_name, "user", updated_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (id) DO UPDATE SET user_name = EXCLUDED.user_name, "user" = EXCLUDED."user", updated_at = NOW()`,
          [user.id, user.userName, JSON.stringify(user)],
        );
      }
    });
  }

  private async withWriteTransaction(run: (client: PostgresScimClient) => Promise<void>): Promise<void> {
    const session = this.client.connect ? await this.client.connect() : undefined;
    const client = session ?? this.client;
    await client.query('BEGIN');
    try {
      await run(client);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      session?.release();
    }
  }
}

function decodeUser(raw: unknown): ScimUser {
  return typeof raw === 'string' ? (JSON.parse(raw) as ScimUser) : (raw as ScimUser);
}

async function ensureSchema(client: PostgresScimClient, tableName: string): Promise<void> {
  await client.query(
    `CREATE TABLE IF NOT EXISTS ${tableName} (
       id         TEXT PRIMARY KEY,
       user_name  TEXT UNIQUE NOT NULL,
       "user"     JSONB NOT NULL,
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

export async function postgresScimPersisterFromEnv(
  env: Record<string, string | undefined> = process.env,
): Promise<PostgresScimUserPersister | undefined> {
  const connectionString = env.GREYBOX_SCIM_PG_URL?.trim();
  if (!connectionString) return undefined;
  // @ts-expect-error -- 'pg' is an optional peer dependency.
  const pgModule = (await import('pg').catch(() => undefined)) as
    | { default?: { Pool: new (opts: { connectionString: string }) => unknown } }
    | { Pool: new (opts: { connectionString: string }) => unknown }
    | undefined;
  if (!pgModule) {
    throw new Error(
      'GREYBOX_SCIM_PG_URL is set but the `pg` package is not installed. ' +
      'Install pg or unset the env var to fall back to the file-based SCIM store.',
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
  return await PostgresScimUserPersister.create({
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
    ...(env.GREYBOX_SCIM_PG_TABLE ? { tableName: env.GREYBOX_SCIM_PG_TABLE } : {}),
  });
}
