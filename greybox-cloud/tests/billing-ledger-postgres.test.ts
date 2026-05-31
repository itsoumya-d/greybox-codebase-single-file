// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createBillingInvoice, buildStripeMeterEvents, type BillingInvoice } from '../src/routers/billing.js';
import { FileUsageSink, type BillingLedgerRecord } from '../src/metering/billingLedger.js';
import {
  PostgresBillingLedger,
  type PostgresBillingLedgerClient,
} from '../src/metering/billingLedgerPostgres.js';
import { UsageEmitter } from '../src/metering/usageEmitter.js';
import { StripeMeterSubmitter } from '../src/metering/stripeMeterSubmitter.js';
import type {
  AuthContext,
  InferenceRequest,
  InferenceResult,
  ProviderCandidate,
  UsageEvent,
} from '../src/types.js';

const period = {
  start: '2026-05-01T00:00:00.000Z',
  end: '2026-06-01T00:00:00.000Z',
};

const context: AuthContext = {
  tenantId: 'tenant-indie',
  userId: 'user-1',
  tier: 'indie',
  tokenHash: 'hash',
  roles: ['designer'],
};

const request: InferenceRequest = {
  projectId: 'project-1',
  task: 'design',
  messages: [{ role: 'user', content: 'Meter this managed inference completion.' }],
};

const candidate: ProviderCandidate = {
  provider: 'openai',
  model: 'gpt-4.1-mini',
  inputCostPer1K: 0.003,
  outputCostPer1K: 0.012,
  supports: ['design'],
  slaMs: 150,
  available: true,
};

const result: InferenceResult = {
  provider: 'openai',
  model: 'gpt-4.1-mini',
  text: 'metered response',
  usage: { inputTokens: 80, outputTokens: 40 },
  redactedLog: {},
};

function usage(overrides: Partial<UsageEvent> = {}): UsageEvent {
  return {
    id: overrides.id ?? 'usage-pg-1',
    tenantId: overrides.tenantId ?? 'tenant-indie',
    userId: overrides.userId ?? 'user-1',
    projectId: overrides.projectId ?? 'project-1',
    provider: overrides.provider ?? 'openai',
    model: overrides.model ?? 'gpt-4.1-mini',
    inputTokens: overrides.inputTokens ?? 1_010_000,
    outputTokens: overrides.outputTokens ?? 210_000,
    inputCostUsd: overrides.inputCostUsd ?? 12.12,
    outputCostUsd: overrides.outputCostUsd ?? 8.4,
    createdAt: overrides.createdAt ?? '2026-05-15T12:00:00.000Z',
    ...overrides,
  };
}

function createInMemoryClient(options: { transactions?: boolean } = {}): {
  client: PostgresBillingLedgerClient;
  rows: Array<{
    sequence: number;
    type: string;
    id: string;
    created_at: string;
    payload: string;
    dry_run: boolean | null;
    stripe_request_id: string | null;
    error: string | null;
    record: string;
  }>;
  lockKeys: Array<[number, number]>;
} {
  const rows: Array<{
    sequence: number;
    type: string;
    id: string;
    created_at: string;
    payload: string;
    dry_run: boolean | null;
    stripe_request_id: string | null;
    error: string | null;
    record: string;
  }> = [];
  const lockKeys: Array<[number, number]> = [];
  let nextSequence = 1;
  let transactionTail = Promise.resolve();
  const client: PostgresBillingLedgerClient = {
    async query(text, values) {
      const trimmed = text.trim();
      if (/^CREATE TABLE/i.test(trimmed) || /^CREATE INDEX/i.test(trimmed)) return { rows: [] };
      if (/^SELECT pg_advisory_xact_lock/i.test(trimmed)) {
        lockKeys.push(values as [number, number]);
        return { rows: [] };
      }
      if (/^INSERT INTO/i.test(trimmed)) {
        const [
          type,
          id,
          created_at,
          payload,
          dry_run,
          stripe_request_id,
          error,
          record,
        ] = values as [
          string,
          string,
          string,
          string,
          boolean | null,
          string | null,
          string | null,
          string,
        ];
        rows.push({
          sequence: nextSequence++,
          type,
          id,
          created_at,
          payload,
          dry_run,
          stripe_request_id,
          error,
          record,
        });
        return { rows: [] };
      }
      if (/^SELECT record FROM/i.test(trimmed) && /\bWHERE type = \$1 AND id = \$2\b/i.test(trimmed)) {
        const [type, id] = values as [string, string];
        return {
          rows: [...rows]
            .filter((row) => row.type === type && row.id === id)
            .sort((a, b) => a.sequence - b.sequence)
            .map((row) => ({ record: row.record })),
        };
      }
      if (/^SELECT record FROM/i.test(trimmed)) {
        return { rows: [...rows].sort((a, b) => a.sequence - b.sequence).map((row) => ({ record: row.record })) };
      }
      if (/^SELECT payload FROM/i.test(trimmed)) {
        const type = values?.[0] as string;
        return {
          rows: [...rows]
            .filter((row) => row.type === type)
            .sort((a, b) => a.sequence - b.sequence)
            .map((row) => ({ payload: row.payload })),
        };
      }
      if (/^SELECT\s+COALESCE\(SUM/i.test(trimmed)) {
        const [, tenantId, periodStart, periodEnd] = values as [string, string, string, string];
        const periodStartMs = Date.parse(periodStart);
        const periodEndMs = Date.parse(periodEnd);
        const matching = rows.filter((row) => {
          if (row.type !== 'usage') return false;
          const payload = JSON.parse(row.payload) as UsageEvent;
          if (payload.tenantId !== tenantId) return false;
          if (payload.billingPeriodStart) return payload.billingPeriodStart === periodStart;
          const createdAtMs = Date.parse(payload.createdAt);
          return createdAtMs >= periodStartMs && createdAtMs < periodEndMs;
        });
        return {
          rows: [{
            input_tokens: String(matching.reduce((sum, row) => sum + (JSON.parse(row.payload) as UsageEvent).inputTokens, 0)),
            output_tokens: String(matching.reduce((sum, row) => sum + (JSON.parse(row.payload) as UsageEvent).outputTokens, 0)),
          }],
        };
      }
      throw new Error(`unexpected sql: ${trimmed}`);
    },
  };
  if (options.transactions) {
    client.transaction = async (run) => {
      const previous = transactionTail;
      let release!: () => void;
      transactionTail = new Promise((resolve) => {
        release = resolve;
      });
      await previous;
      try {
        return await run(client);
      } finally {
        release();
      }
    };
  }
  return { client, rows, lockKeys };
}

test('PostgresBillingLedger persists usage, invoice, and Stripe meter records in order', async () => {
  const { client, rows } = createInMemoryClient();
  const ledger = await PostgresBillingLedger.create({ client });
  const sink = new FileUsageSink(ledger);
  await sink.emit(usage({
    id: 'usage-pg-1',
    billingPeriodStart: period.start,
    billingPeriodEnd: period.end,
    includedInputTokensApplied: 1_000_000,
    includedOutputTokensApplied: 200_000,
    billableInputTokens: 10_000,
    billableOutputTokens: 10_000,
  }));

  const invoice: BillingInvoice = createBillingInvoice({
    tenantId: 'tenant-indie',
    tier: 'indie',
    period,
    events: await ledger.readUsageEvents(),
  });
  await ledger.appendInvoice(invoice, new Date('2026-06-01T00:00:00.000Z'));
  const submitter = new StripeMeterSubmitter({ dryRun: true, ledger });
  await submitter.submit(buildStripeMeterEvents(invoice));

  assert.equal(rows.length, 4);
  const records = await ledger.readRecords();
  assert.deepEqual(records.map((record) => record.type), [
    'usage',
    'invoice',
    'stripe-meter-event',
    'stripe-meter-event',
  ]);
  assert.equal(records[0]?.id, 'usage-pg-1');
  assert.equal(records[1]?.id, 'tenant-indie:2026-05-01T00:00:00.000Z:indie');
  assert.equal((records[2] as Extract<BillingLedgerRecord, { type: 'stripe-meter-event' }>).dryRun, true);
  assert.deepEqual((records[2] as Extract<BillingLedgerRecord, { type: 'stripe-meter-event' }>).evidence, {
    payloadConfig: { customerKey: 'tenant_id', valueKey: 'quantity' },
    payloadKeys: ['period_end', 'period_start', 'quantity', 'tenant_id'],
    customerMappingPresent: true,
    valueKeyPresent: true,
    timestampFormat: 'unix_seconds',
    source: 'internal-dry-run',
  });
});

test('PostgresBillingLedger locks and idempotently no-ops duplicate usage and invoice records', async () => {
  const { client, rows, lockKeys } = createInMemoryClient({ transactions: true });
  const ledger = await PostgresBillingLedger.create({ client });
  const usageEvent = usage({ id: 'usage-idempotent' });

  await ledger.appendUsage(usageEvent);
  await ledger.appendUsage({ ...usageEvent });

  assert.equal(rows.filter((row) => row.type === 'usage').length, 1);
  assert.equal(lockKeys.length, 2);
  assert.deepEqual(lockKeys[0], lockKeys[1]);

  const usageConflict = ledger.appendUsage(usage({
    id: 'usage-idempotent',
    userId: 'finance@example.com',
    inputTokens: 999,
  }));
  await assert.rejects(
    () => usageConflict,
    (error) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /conflicting usage billing ledger record/u);
      assert.doesNotMatch(error.message, /finance@example\.com/u);
      assert.doesNotMatch(error.message, /999/u);
      return true;
    },
  );

  const invoice = createBillingInvoice({
    tenantId: 'tenant-indie',
    tier: 'indie',
    period,
    events: [usageEvent],
  });
  await ledger.appendInvoice(invoice, new Date('2026-06-01T00:00:00.000Z'));
  await ledger.appendInvoice(invoice, new Date('2026-06-01T00:00:01.000Z'));

  assert.equal(rows.filter((row) => row.type === 'invoice').length, 1);
  await assert.rejects(
    () => ledger.appendInvoice({ ...invoice, totalUsd: invoice.totalUsd + 1 }),
    /conflicting invoice billing ledger record/u,
  );
  assert.equal(rows.filter((row) => row.type === 'invoice').length, 1);
});

test('PostgresBillingLedger keeps Stripe failures append-only and ignores records after live success', async () => {
  const { client, rows } = createInMemoryClient({ transactions: true });
  const ledger = await PostgresBillingLedger.create({ client });
  const invoice = createBillingInvoice({
    tenantId: 'tenant-indie',
    tier: 'indie',
    period,
    events: [usage({ inputTokens: 1_001_000, outputTokens: 200_000 })],
  });
  const [event] = buildStripeMeterEvents(invoice);
  assert.ok(event);

  await ledger.appendStripeMeterEvent(event, {
    dryRun: false,
    error: 'Stripe rejected [REDACTED_EMAIL]',
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
  });
  await ledger.appendStripeMeterEvent(event, {
    dryRun: false,
    error: 'Stripe rejected [REDACTED_STRIPE_ID]',
    createdAt: new Date('2026-06-01T00:00:01.000Z'),
  });
  assert.equal(rows.length, 2);

  await ledger.appendStripeMeterEvent(event, {
    dryRun: false,
    stripeRequestId: 'req_retry_after_failure',
    createdAt: new Date('2026-06-01T00:00:02.000Z'),
  });
  assert.equal(rows.length, 3);

  await ledger.appendStripeMeterEvent({
    ...event,
    payload: { ...event.payload, quantity: Number(event.payload.quantity ?? 0) + 1 },
  }, {
    dryRun: false,
    stripeRequestId: 'req_late_duplicate',
    createdAt: new Date('2026-06-01T00:00:03.000Z'),
  });
  await ledger.appendStripeMeterEvent(event, {
    dryRun: false,
    error: 'Stripe rejected after success',
    createdAt: new Date('2026-06-01T00:00:04.000Z'),
  });

  const records = await ledger.readRecords();
  assert.equal(records.length, 3);
  assert.deepEqual(records.map((record) => record.type === 'stripe-meter-event' ? record.error : undefined), [
    'Stripe rejected [REDACTED_EMAIL]',
    'Stripe rejected [REDACTED_STRIPE_ID]',
    undefined,
  ]);
  assert.equal(records[2]?.type === 'stripe-meter-event' ? records[2].stripeRequestId : undefined, 'req_retry_after_failure');
});

test('PostgresBillingLedger readUsageEvents returns only usage payloads', async () => {
  const { client } = createInMemoryClient();
  const ledger = await PostgresBillingLedger.create({ client });
  await ledger.appendUsage(usage({ id: 'usage-a', inputTokens: 120, outputTokens: 60 }));
  await ledger.appendRecord({
    type: 'stripe-meter-event',
    id: 'meter-a',
    createdAt: '2026-06-01T00:00:00.000Z',
    payload: {
      identifier: 'meter-a',
      eventName: 'greybox.input_tokens.overage',
      timestamp: '2026-06-01T00:00:00.000Z',
      payload: {
        tenant_id: 'tenant-indie',
        period_start: period.start,
        period_end: period.end,
        quantity: 20,
      },
    },
    dryRun: true,
  });

  const events = await ledger.readUsageEvents();
  assert.equal(events.length, 1);
  assert.equal(events[0]?.id, 'usage-a');
  assert.equal(events[0]?.inputTokens, 120);
});

test('PostgresBillingLedger summarizes monthly usage for durable classification', async () => {
  const { client } = createInMemoryClient();
  const ledger = await PostgresBillingLedger.create({ client });
  await ledger.appendUsage(usage({
    id: 'usage-may-a',
    tenantId: 'tenant-indie',
    inputTokens: 80,
    outputTokens: 40,
    billingPeriodStart: period.start,
    billingPeriodEnd: period.end,
  }));
  await ledger.appendUsage(usage({
    id: 'usage-may-b',
    tenantId: 'tenant-indie',
    inputTokens: 20,
    outputTokens: 10,
    createdAt: '2026-05-20T00:00:00.000Z',
  }));
  await ledger.appendUsage(usage({
    id: 'usage-other-tenant',
    tenantId: 'tenant-other',
    inputTokens: 999,
    outputTokens: 999,
    billingPeriodStart: period.start,
    billingPeriodEnd: period.end,
  }));
  await ledger.appendUsage(usage({
    id: 'usage-june',
    tenantId: 'tenant-indie',
    inputTokens: 999,
    outputTokens: 999,
    billingPeriodStart: '2026-06-01T00:00:00.000Z',
    billingPeriodEnd: '2026-07-01T00:00:00.000Z',
  }));

  const snapshot = await ledger.readMonthlyUsageSnapshot({
    tenantId: 'tenant-indie',
    periodStart: period.start,
    periodEnd: period.end,
  });

  assert.deepEqual(snapshot, {
    tenantId: 'tenant-indie',
    periodStart: period.start,
    periodEnd: period.end,
    inputTokens: 100,
    outputTokens: 50,
  });
});

test('PostgresBillingLedger reserves and appends monthly usage under a transaction lock', async () => {
  const { client } = createInMemoryClient({ transactions: true });
  const ledger = await PostgresBillingLedger.create({ client });
  const sink = new FileUsageSink(ledger);
  const firstEmitter = new UsageEmitter([sink]);
  const secondEmitter = new UsageEmitter([sink]);

  const [first, second] = await Promise.all([
    firstEmitter.emit(
      context,
      request,
      result,
      candidate,
      new Date('2026-05-15T12:00:00.000Z'),
      {
        id: 'tenant-indie',
        tier: 'indie',
        region: 'us',
        ssoEnabled: false,
        monthlyInputTokensIncluded: 100,
        monthlyOutputTokensIncluded: 50,
      },
    ),
    secondEmitter.emit(
      context,
      request,
      result,
      candidate,
      new Date('2026-05-15T12:00:01.000Z'),
      {
        id: 'tenant-indie',
        tier: 'indie',
        region: 'us',
        ssoEnabled: false,
        monthlyInputTokensIncluded: 100,
        monthlyOutputTokensIncluded: 50,
      },
    ),
  ]);

  assert.deepEqual([first, second].map((event) => ({
    includedInputTokensApplied: event.includedInputTokensApplied,
    includedOutputTokensApplied: event.includedOutputTokensApplied,
    billableInputTokens: event.billableInputTokens,
    billableOutputTokens: event.billableOutputTokens,
  })), [
    {
      includedInputTokensApplied: 80,
      includedOutputTokensApplied: 40,
      billableInputTokens: 0,
      billableOutputTokens: 0,
    },
    {
      includedInputTokensApplied: 20,
      includedOutputTokensApplied: 10,
      billableInputTokens: 60,
      billableOutputTokens: 30,
    },
  ]);
  assert.equal((await ledger.readUsageEvents()).length, 2);
});

test('PostgresBillingLedger fails closed for exact reservations without transactions', async () => {
  const { client } = createInMemoryClient();
  const ledger = await PostgresBillingLedger.create({ client });

  await assert.rejects(
    () => ledger.reserveMonthlyUsage({
      event: usage({
        id: 'usage-reserve-no-tx',
        inputTokens: 80,
        outputTokens: 40,
        createdAt: '2026-05-15T12:00:00.000Z',
      }),
      included: { inputTokens: 100, outputTokens: 50 },
      at: new Date('2026-05-15T12:00:00.000Z'),
    }),
    /transaction-capable Postgres client/u,
  );
  assert.equal((await ledger.readUsageEvents()).length, 0);
});

test('PostgresBillingLedger rejects malicious table names', async () => {
  const { client } = createInMemoryClient();
  await assert.rejects(
    () => PostgresBillingLedger.create({ client, tableName: 'ledger; DROP TABLE users; --' }),
    /invalid postgres identifier/u,
  );
});
