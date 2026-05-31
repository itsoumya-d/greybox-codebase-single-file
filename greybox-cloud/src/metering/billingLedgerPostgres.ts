// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

// Postgres-backed billing ledger for multi-replica hosted metering. It keeps
// FileBillingLedger's append-only ordering while making invoice and Stripe
// meter evidence durable beyond a single disk volume.

import { createHash } from 'node:crypto';
import type { BillingInvoice, StripeMeterEvent } from '../routers/billing.js';
import type { UsageEvent } from '../types.js';
import type { BillingLedger, BillingLedgerRecord } from './billingLedger.js';
import {
  classifyMonthlyUsageReservation,
  monthlyUsageRequestFromReservation,
  monthlyUsageSnapshotRequest,
  type MonthlyUsageReservationRequest,
  type MonthlyUsageSnapshot,
  type MonthlyUsageSnapshotRequest,
} from './monthlyUsage.js';

export interface PostgresBillingLedgerOptions {
  readonly client: PostgresBillingLedgerClient;
  readonly tableName?: string;
}

export interface PostgresBillingLedgerClient {
  query(text: string, values?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
  transaction?<T>(run: (client: PostgresBillingLedgerClient) => Promise<T>): Promise<T>;
}

const DEFAULT_TABLE = 'billing_ledger';

export class PostgresBillingLedger implements BillingLedger {
  private readonly client: PostgresBillingLedgerClient;
  private readonly tableName: string;

  private constructor(options: PostgresBillingLedgerOptions) {
    this.client = options.client;
    this.tableName = sanitizeIdentifier(options.tableName ?? DEFAULT_TABLE);
  }

  static async create(options: PostgresBillingLedgerOptions): Promise<PostgresBillingLedger> {
    const tableName = sanitizeIdentifier(options.tableName ?? DEFAULT_TABLE);
    await ensureSchema(options.client, tableName);
    return new PostgresBillingLedger(options);
  }

  async appendRecord(record: BillingLedgerRecord): Promise<void> {
    if (this.client.transaction) {
      await this.client.transaction(async (client) => {
        await this.appendRecordWithClient(client, record);
      });
      return;
    }
    await this.appendRecordWithClient(this.client, record);
  }

  private async appendRecordWithClient(
    client: PostgresBillingLedgerClient,
    record: BillingLedgerRecord,
  ): Promise<void> {
    await client.query(
      'SELECT pg_advisory_xact_lock($1::INTEGER, $2::INTEGER)',
      billingRecordAdvisoryLockKey(this.tableName, record),
    );
    const existing = await this.readRecordsByTypeAndId(client, record.type, record.id);
    if (shouldSkipAppend(record, existing)) return;

    await client.query(
      `INSERT INTO ${this.tableName} (
         type,
         id,
         created_at,
         payload,
         dry_run,
         stripe_request_id,
         error,
         record
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        record.type,
        record.id,
        record.createdAt,
        JSON.stringify(record.payload),
        record.type === 'stripe-meter-event' ? record.dryRun : null,
        record.type === 'stripe-meter-event' ? record.stripeRequestId ?? null : null,
        record.type === 'stripe-meter-event' ? record.error ?? null : null,
        JSON.stringify(record),
      ],
    );
  }

  async appendUsage(event: UsageEvent): Promise<void> {
    await this.appendRecord({
      type: 'usage',
      id: event.id,
      createdAt: event.createdAt,
      payload: event,
    });
  }

  async appendInvoice(invoice: BillingInvoice, createdAt = new Date()): Promise<void> {
    await this.appendRecord({
      type: 'invoice',
      id: `${invoice.tenantId}:${invoice.period.start}:${invoice.tier}`,
      createdAt: createdAt.toISOString(),
      payload: invoice,
    });
  }

  async appendStripeMeterEvent(
    event: StripeMeterEvent,
    options: { dryRun: boolean; stripeRequestId?: string; error?: string; createdAt?: Date },
  ): Promise<void> {
    await this.appendRecord({
      type: 'stripe-meter-event',
      id: event.identifier,
      createdAt: (options.createdAt ?? new Date()).toISOString(),
      payload: event,
      dryRun: options.dryRun,
      ...(options.stripeRequestId ? { stripeRequestId: options.stripeRequestId } : {}),
      ...(options.error ? { error: options.error } : {}),
      ...(event.evidence ? { evidence: event.evidence } : {}),
    });
  }

  async readRecords(): Promise<BillingLedgerRecord[]> {
    const result = await this.client.query(`SELECT record FROM ${this.tableName} ORDER BY sequence ASC`);
    return result.rows.map((row) => decodeRecord(row.record));
  }

  async readUsageEvents(): Promise<UsageEvent[]> {
    const result = await this.client.query(
      `SELECT payload FROM ${this.tableName} WHERE type = $1 ORDER BY sequence ASC`,
      ['usage'],
    );
    return result.rows.map((row) => decodeUsageEvent(row.payload));
  }

  async readMonthlyUsageSnapshot(request: MonthlyUsageSnapshotRequest): Promise<MonthlyUsageSnapshot> {
    return await this.readMonthlyUsageSnapshotWithClient(this.client, request);
  }

  async reserveMonthlyUsage(request: MonthlyUsageReservationRequest): Promise<UsageEvent> {
    if (!this.client.transaction) {
      throw new Error(
        'exact monthly usage reservation requires a transaction-capable Postgres client',
      );
    }

    const usageRequest = monthlyUsageRequestFromReservation(request);
    const snapshotRequest = monthlyUsageSnapshotRequest(usageRequest.tenantId, usageRequest.at);
    const lockKey = monthlyUsageAdvisoryLockKey(this.tableName, snapshotRequest);

    return await this.client.transaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock($1::INTEGER, $2::INTEGER)', lockKey);
      const snapshot = await this.readMonthlyUsageSnapshotWithClient(client, snapshotRequest);
      const event = classifyMonthlyUsageReservation(request, snapshot);
      await this.appendRecordWithClient(client, {
        type: 'usage',
        id: event.id,
        createdAt: event.createdAt,
        payload: event,
      });
      return event;
    });
  }

  private async readMonthlyUsageSnapshotWithClient(
    client: PostgresBillingLedgerClient,
    request: MonthlyUsageSnapshotRequest,
  ): Promise<MonthlyUsageSnapshot> {
    const result = await client.query(
      `SELECT
         COALESCE(SUM((payload->>'inputTokens')::BIGINT), 0)::TEXT AS input_tokens,
         COALESCE(SUM((payload->>'outputTokens')::BIGINT), 0)::TEXT AS output_tokens
       FROM ${this.tableName}
       WHERE type = $1
         AND payload->>'tenantId' = $2
         AND (
           (payload ? 'billingPeriodStart' AND payload->>'billingPeriodStart' = $3)
           OR (
             NOT (payload ? 'billingPeriodStart')
             AND created_at >= $3::TIMESTAMPTZ
             AND created_at < $4::TIMESTAMPTZ
           )
         )`,
      ['usage', request.tenantId, request.periodStart, request.periodEnd],
    );
    const row = result.rows[0] ?? {};
    return {
      tenantId: request.tenantId,
      periodStart: request.periodStart,
      periodEnd: request.periodEnd,
      inputTokens: numberFromSql(row.input_tokens),
      outputTokens: numberFromSql(row.output_tokens),
    };
  }

  private async readRecordsByTypeAndId(
    client: PostgresBillingLedgerClient,
    type: BillingLedgerRecord['type'],
    id: string,
  ): Promise<BillingLedgerRecord[]> {
    const result = await client.query(
      `SELECT record FROM ${this.tableName} WHERE type = $1 AND id = $2 ORDER BY sequence ASC`,
      [type, id],
    );
    return result.rows.map((row) => decodeRecord(row.record));
  }
}

function decodeRecord(raw: unknown): BillingLedgerRecord {
  return typeof raw === 'string' ? (JSON.parse(raw) as BillingLedgerRecord) : (raw as BillingLedgerRecord);
}

function decodeUsageEvent(raw: unknown): UsageEvent {
  return typeof raw === 'string' ? (JSON.parse(raw) as UsageEvent) : (raw as UsageEvent);
}

function numberFromSql(raw: unknown): number {
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'bigint') return Number(raw);
  if (typeof raw === 'string') return Number.parseInt(raw, 10);
  return 0;
}

function monthlyUsageAdvisoryLockKey(
  tableName: string,
  request: MonthlyUsageSnapshotRequest,
): [number, number] {
  return [
    hashInt32(`greybox-cloud:${tableName}:monthly-usage`),
    hashInt32(`${request.tenantId}:${request.periodStart}`),
  ];
}

function billingRecordAdvisoryLockKey(
  tableName: string,
  record: BillingLedgerRecord,
): [number, number] {
  return [
    hashInt32(`greybox-cloud:${tableName}:billing-ledger-record`),
    hashInt32(`${record.type}:${record.id}`),
  ];
}

function shouldSkipAppend(
  record: BillingLedgerRecord,
  existing: BillingLedgerRecord[],
): boolean {
  if (existing.length === 0) return false;
  if (record.type === 'stripe-meter-event') {
    return existing.some((prior) =>
      prior.type === 'stripe-meter-event' && prior.dryRun === false && !prior.error);
  }

  const canonicalPayload = canonicalJson(record.payload);
  const hasConflict = existing.some((prior) =>
    prior.type === record.type && canonicalJson(prior.payload) !== canonicalPayload);
  if (hasConflict) {
    throw new Error(`conflicting ${record.type} billing ledger record for existing id`);
  }
  return true;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalizeJson(value));
}

function canonicalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((entry) => canonicalizeJson(entry));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalizeJson(entry)]),
  );
}

function hashInt32(value: string): number {
  const digest = createHash('sha256').update(value).digest();
  return digest.readInt32BE(0);
}

async function ensureSchema(client: PostgresBillingLedgerClient, tableName: string): Promise<void> {
  await client.query(
    `CREATE TABLE IF NOT EXISTS ${tableName} (
       sequence          BIGSERIAL PRIMARY KEY,
       type              TEXT NOT NULL,
       id                TEXT NOT NULL,
       created_at        TIMESTAMPTZ NOT NULL,
       payload           JSONB NOT NULL,
       dry_run           BOOLEAN,
       stripe_request_id TEXT,
       error             TEXT,
       record            JSONB NOT NULL
     )`,
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS ${tableName}_type_created_idx ON ${tableName} (type, created_at DESC)`,
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS ${tableName}_id_idx ON ${tableName} (id)`,
  );
}

function sanitizeIdentifier(identifier: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/u.test(identifier)) {
    throw new Error(`invalid postgres identifier: ${identifier}`);
  }
  return identifier;
}

export async function postgresBillingLedgerFromEnv(
  env: Record<string, string | undefined> = process.env,
): Promise<PostgresBillingLedger | undefined> {
  const connectionString = env.GREYBOX_BILLING_LEDGER_PG_URL?.trim();
  if (!connectionString) return undefined;
  // @ts-expect-error -- 'pg' is an optional peer dependency.
  const pgModule = (await import('pg').catch(() => undefined)) as
    | { default?: { Pool: new (opts: { connectionString: string }) => unknown } }
    | { Pool: new (opts: { connectionString: string }) => unknown }
    | undefined;
  if (!pgModule) {
    throw new Error(
      'GREYBOX_BILLING_LEDGER_PG_URL is set but the `pg` package is not installed. ' +
      'Install pg or unset the env var to fall back to the file-based billing ledger.',
    );
  }
  const Pool = 'default' in pgModule && pgModule.default
    ? pgModule.default.Pool
    : (pgModule as { Pool: new (opts: { connectionString: string }) => unknown }).Pool;
  const pool = new Pool({ connectionString }) as {
    query: (text: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
    connect: () => Promise<{
      query: (text: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
      release: () => void;
    }>;
  };
  return await PostgresBillingLedger.create({
    client: {
      query: (text, values) => pool.query(text, values),
      transaction: async (run) => {
        const connection = await pool.connect();
        try {
          await connection.query('BEGIN');
          const result = await run({ query: (text, values) => connection.query(text, values) });
          await connection.query('COMMIT');
          return result;
        } catch (error) {
          await connection.query('ROLLBACK').catch(() => undefined);
          throw error;
        } finally {
          connection.release();
        }
      },
    },
    ...(env.GREYBOX_BILLING_LEDGER_PG_TABLE ? { tableName: env.GREYBOX_BILLING_LEDGER_PG_TABLE } : {}),
  });
}
