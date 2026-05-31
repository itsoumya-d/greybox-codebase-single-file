// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import type http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { FileAuditLog } from '../src/enterprise/auditLog.js';
import { FileBillingLedger, FileUsageSink } from '../src/metering/billingLedger.js';
import { StripeMeterSubmitter } from '../src/metering/stripeMeterSubmitter.js';
import {
  BillingWebhookError,
  REQUIRED_MARKETPLACE_STRIPE_EVENTS,
  auditProviderInvoice,
  auditStripeMeters,
  buildCheckoutReadinessReport,
  buildStripeMeterEvents,
  createBillingInvoice,
  handleStripeWebhook,
  LiveBillingApiClient,
  rollupUsage,
} from '../src/routers/billing.js';
import { createGreyboxCloudServer } from '../src/server.js';
import type { UsageEvent } from '../src/types.js';

const period = {
  start: '2026-05-01T00:00:00.000Z',
  end: '2026-06-01T00:00:00.000Z',
};
const stripeWebhookSecret = 'whsec_greybox_test_secret';
const stripeWebhookNow = Date.parse('2026-05-17T12:00:00.000Z');
const requiredMarketplaceEvents = [...REQUIRED_MARKETPLACE_STRIPE_EVENTS];

async function withServer<T>(
  options: Parameters<typeof createGreyboxCloudServer>[0],
  run: (baseUrl: string, server: http.Server) => Promise<T>,
): Promise<T> {
  const server = createGreyboxCloudServer(options);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  try {
    return await run(`http://127.0.0.1:${address.port}`, server);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

function stripeSignatureHeader(rawBody: string, timestamp = Math.floor(stripeWebhookNow / 1_000)): string {
  const signature = createHmac('sha256', stripeWebhookSecret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

function checkoutCompletedEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'evt_checkout_completed',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_cloud_checkout',
        object: 'checkout.session',
        mode: 'payment',
        payment_status: 'paid',
        currency: 'usd',
        amount_subtotal: 7_000,
        amount_total: 7_602,
        payment_intent: 'pi_test_cloud_checkout',
        metadata: {
          greybox_checkout_reference: 'gbx_listing-1_studio-buyer',
          greybox_listing_id: 'listing-1',
          greybox_creator_id: 'creator-1',
          greybox_buyer_id: 'studio-buyer',
          greybox_category: 'template',
        },
        automatic_tax: {
          enabled: true,
          status: 'complete',
          liability: {
            type: 'account',
            account: 'acct_creator_1',
          },
        },
        total_details: { amount_tax: 602 },
        customer_details: {
          address: {
            country: 'US',
            postal_code: '94107',
          },
        },
      },
    },
    ...overrides,
  };
}

function usage(overrides: Partial<UsageEvent>): UsageEvent {
  const event: UsageEvent = {
    id: overrides.id ?? `evt-${Math.random()}`,
    tenantId: overrides.tenantId ?? 'tenant-indie',
    userId: overrides.userId ?? 'user-a',
    projectId: overrides.projectId ?? 'project-a',
    provider: overrides.provider ?? 'openai',
    model: overrides.model ?? 'gpt-4.1-mini',
    inputTokens: overrides.inputTokens ?? 0,
    outputTokens: overrides.outputTokens ?? 0,
    inputCostUsd: overrides.inputCostUsd ?? 0,
    outputCostUsd: overrides.outputCostUsd ?? 0,
    createdAt: overrides.createdAt ?? '2026-05-15T12:00:00.000Z',
  };
  if (overrides.billingPeriodStart) event.billingPeriodStart = overrides.billingPeriodStart;
  if (overrides.billingPeriodEnd) event.billingPeriodEnd = overrides.billingPeriodEnd;
  if (overrides.includedInputTokensApplied !== undefined) event.includedInputTokensApplied = overrides.includedInputTokensApplied;
  if (overrides.includedOutputTokensApplied !== undefined) event.includedOutputTokensApplied = overrides.includedOutputTokensApplied;
  if (overrides.billableInputTokens !== undefined) event.billableInputTokens = overrides.billableInputTokens;
  if (overrides.billableOutputTokens !== undefined) event.billableOutputTokens = overrides.billableOutputTokens;
  return event;
}

function liveStripeMeterEvents(invoice: ReturnType<typeof createBillingInvoice>) {
  return buildStripeMeterEvents(invoice, {
    billingIdentity: {
      stripeCustomerId: 'cus_greybox_metered_test',
      meterPayload: {
        customerKey: 'stripe_customer_id',
        valueKey: 'value',
      },
    },
  });
}

test('rolls up usage by tenant using provider cost fields', () => {
  const rollups = rollupUsage([
    usage({ tenantId: 'a', inputTokens: 1_000, outputTokens: 200, inputCostUsd: 0.012, outputCostUsd: 0.008 }),
    usage({ tenantId: 'a', inputTokens: 500, outputTokens: 100, inputCostUsd: 0.006, outputCostUsd: 0.004 }),
    usage({ tenantId: 'b', inputTokens: 10, outputTokens: 1, inputCostUsd: 0.001, outputCostUsd: 0.001 }),
  ]);

  assert.deepEqual(rollups.find((rollup) => rollup.tenantId === 'a'), {
    tenantId: 'a',
    inputTokens: 1_500,
    outputTokens: 300,
    costUsd: 0.03,
  });
});

test('creates Indie invoices with included tokens and overage meters', () => {
  const invoice = createBillingInvoice({
    tenantId: 'tenant-indie',
    tier: 'indie',
    period,
    events: [
      usage({ inputTokens: 1_200_000, outputTokens: 260_000, inputCostUsd: 14.4, outputCostUsd: 10.4 }),
      usage({ inputTokens: 40_000, outputTokens: 20_000, createdAt: '2026-06-02T00:00:00.000Z' }),
      usage({ tenantId: 'other', inputTokens: 9_000_000, outputTokens: 9_000_000 }),
    ],
  });

  assert.equal(invoice.baseUsd, 29);
  assert.equal(invoice.includedInputTokens, 1_000_000);
  assert.equal(invoice.includedOutputTokens, 200_000);
  assert.equal(invoice.billableInputTokens, 200_000);
  assert.equal(invoice.billableOutputTokens, 60_000);
  assert.equal(invoice.inputOverageUsd, 10);
  assert.equal(invoice.outputOverageUsd, 12);
  assert.equal(invoice.totalUsd, 51);
  assert.equal(invoice.providerCostUsd, 24.8);
  assert.equal(invoice.grossMarginUsd, 26.2);

  assert.deepEqual(buildStripeMeterEvents(invoice).map((event) => ({
    eventName: event.eventName,
    quantity: event.payload.quantity,
    identifier: event.identifier,
  })), [
    {
      eventName: 'greybox.input_tokens.overage',
      quantity: 200_000,
      identifier: 'tenant-indie:2026-05-01T00:00:00.000Z:input',
    },
    {
      eventName: 'greybox.output_tokens.overage',
      quantity: 60_000,
      identifier: 'tenant-indie:2026-05-01T00:00:00.000Z:output',
    },
  ]);
});

test('does not submit Stripe meter events for Free tier usage leakage', () => {
  const invoice = createBillingInvoice({
    tenantId: 'tenant-free',
    tier: 'free',
    period,
    events: [
      usage({
        tenantId: 'tenant-free',
        inputTokens: 50_000,
        outputTokens: 10_000,
        inputCostUsd: 0.6,
        outputCostUsd: 0.4,
      }),
    ],
  });

  assert.equal(invoice.billableInputTokens, 50_000);
  assert.equal(invoice.billableOutputTokens, 10_000);
  assert.equal(invoice.totalUsd, 0);
  assert.deepEqual(buildStripeMeterEvents(invoice), []);
});

test('billing invoices dedupe usage event replays and reject conflicting duplicates', () => {
  const event = usage({
    id: 'usage-replayed-once',
    inputTokens: 1_100_000,
    outputTokens: 220_000,
    inputCostUsd: 13.2,
    outputCostUsd: 8.8,
  });
  const invoice = createBillingInvoice({
    tenantId: 'tenant-indie',
    tier: 'indie',
    period,
    events: [event, { ...event }],
  });

  assert.equal(invoice.inputTokens, 1_100_000);
  assert.equal(invoice.outputTokens, 220_000);
  assert.equal(invoice.billableInputTokens, 100_000);
  assert.equal(invoice.billableOutputTokens, 20_000);

  assert.throws(
    () => createBillingInvoice({
      tenantId: 'tenant-indie',
      tier: 'indie',
      period,
      events: [event, { ...event, inputTokens: 1_100_001 }],
    }),
    /duplicate usage event id has conflicting payload: usage-replayed-once/u,
  );
});

test('enforces Studio five-seat minimum before overage', () => {
  const invoice = createBillingInvoice({
    tenantId: 'tenant-studio',
    tier: 'studio',
    period,
    seatCount: 2,
    events: [
      usage({
        tenantId: 'tenant-studio',
        inputTokens: 5_500_000,
        outputTokens: 1_250_000,
        inputCostUsd: 66,
        outputCostUsd: 50,
      }),
    ],
  });

  assert.equal(invoice.seatCount, 5);
  assert.equal(invoice.baseUsd, 395);
  assert.equal(invoice.billableInputTokens, 500_000);
  assert.equal(invoice.billableOutputTokens, 250_000);
  assert.equal(invoice.inputOverageUsd, 20);
  assert.equal(invoice.outputOverageUsd, 45);
  assert.equal(invoice.totalUsd, 460);
});

test('audits provider invoice lines against emitted usage events', () => {
  const events = [
    usage({ provider: 'anthropic', model: 'claude-sonnet-4.5', inputTokens: 1_000, outputTokens: 300, inputCostUsd: 0.012, outputCostUsd: 0.012 }),
    usage({ provider: 'anthropic', model: 'claude-sonnet-4.5', inputTokens: 2_000, outputTokens: 400, inputCostUsd: 0.024, outputCostUsd: 0.016 }),
  ];

  assert.deepEqual(auditProviderInvoice(events, [
    {
      provider: 'anthropic',
      model: 'claude-sonnet-4.5',
      inputTokens: 3_000,
      outputTokens: 700,
      costUsd: 0.064,
    },
  ]), { ok: true, discrepancies: [] });

  const failed = auditProviderInvoice(events, [
    {
      provider: 'anthropic',
      model: 'claude-sonnet-4.5',
      inputTokens: 3_010,
      outputTokens: 700,
      costUsd: 0.064,
    },
  ]);
  assert.equal(failed.ok, false);
  assert.deepEqual(failed.discrepancies[0], {
    key: 'anthropic:claude-sonnet-4.5.inputTokens',
    expected: 3_000,
    actual: 3_010,
    delta: 10,
  });
});

test('audits Stripe meter quantities from invoice overage', () => {
  const invoice = createBillingInvoice({
    tenantId: 'tenant-indie',
    tier: 'indie',
    period,
    events: [
      usage({ inputTokens: 1_050_000, outputTokens: 240_000 }),
    ],
  });

  assert.deepEqual(auditStripeMeters(invoice, [
    { tenantId: 'tenant-indie', eventName: 'greybox.input_tokens.overage', quantity: 50_000 },
    { tenantId: 'tenant-indie', eventName: 'greybox.output_tokens.overage', quantity: 40_000 },
    { tenantId: 'other', eventName: 'greybox.output_tokens.overage', quantity: 99_000 },
  ]), { ok: true, discrepancies: [] });

  const failed = auditStripeMeters(invoice, [
    { tenantId: 'tenant-indie', eventName: 'greybox.input_tokens.overage', quantity: 50_000 },
    { tenantId: 'tenant-indie', eventName: 'greybox.output_tokens.overage', quantity: 39_999 },
  ]);
  assert.equal(failed.ok, false);
  assert.deepEqual(failed.discrepancies, [
    {
      key: 'greybox.output_tokens.overage',
      expected: 40_000,
      actual: 39_999,
      delta: -1,
    },
  ]);
});

test('persists usage, invoices, and dry-run Stripe meter events to an append-only ledger', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-billing-ledger-'));
  try {
    const ledger = new FileBillingLedger(dir);
    const sink = new FileUsageSink(ledger);
    await sink.emit(usage({
      id: 'usage-1',
      inputTokens: 1_010_000,
      outputTokens: 210_000,
      inputCostUsd: 12.12,
      outputCostUsd: 8.4,
    }));
    const invoice = createBillingInvoice({
      tenantId: 'tenant-indie',
      tier: 'indie',
      period,
      events: await ledger.readUsageEvents(),
    });
    await ledger.appendInvoice(invoice, new Date('2026-06-01T00:00:00.000Z'));

    const submitter = new StripeMeterSubmitter({ dryRun: true, ledger });
    const submissions = await submitter.submit(buildStripeMeterEvents(invoice));
    assert.deepEqual(submissions.map((submission) => submission.status), ['dry-run', 'dry-run']);

    const records = await ledger.readRecords();
    assert.deepEqual(records.map((record) => record.type), [
      'usage',
      'invoice',
      'stripe-meter-event',
      'stripe-meter-event',
    ]);
    assert.equal(records[0]?.id, 'usage-1');
    assert.equal(records[1]?.id, 'tenant-indie:2026-05-01T00:00:00.000Z:indie');
    assert.equal(records[2]?.type === 'stripe-meter-event' ? records[2].dryRun : false, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('file usage sink preserves pre-invoice included and billable usage fields', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-billing-ledger-'));
  try {
    const ledger = new FileBillingLedger(dir);
    const sink = new FileUsageSink(ledger);
    await sink.emit(usage({
      id: 'usage-with-quota',
      inputTokens: 120,
      outputTokens: 60,
      billingPeriodStart: period.start,
      billingPeriodEnd: period.end,
      includedInputTokensApplied: 100,
      includedOutputTokensApplied: 50,
      billableInputTokens: 20,
      billableOutputTokens: 10,
    }));

    const [event] = await ledger.readUsageEvents();
    assert.equal(event?.billingPeriodStart, period.start);
    assert.equal(event?.includedInputTokensApplied, 100);
    assert.equal(event?.billableOutputTokens, 10);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('submits Stripe meter events live only when dry-run is disabled and an API key exists', async () => {
  const invoice = createBillingInvoice({
    tenantId: 'tenant-indie',
    tier: 'indie',
    period,
    events: [usage({ inputTokens: 1_001_000, outputTokens: 200_500 })],
  });
  const events = liveStripeMeterEvents(invoice);
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const submitter = new StripeMeterSubmitter({
    apiKey: 'sk_test_greybox',
    dryRun: false,
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({ id: 'mtr_evt_1' }), {
        status: 200,
        headers: { 'request-id': 'req_123' },
      });
    },
  });

  const submissions = await submitter.submit(events);
  assert.deepEqual(submissions.map((submission) => submission.status), ['submitted', 'submitted']);
  assert.equal(calls.length, 2);
  assert.equal(calls[0]?.url, 'https://api.stripe.com/v1/billing/meter_events');
  assert.equal((calls[0]?.init.headers as Record<string, string>).authorization, 'Bearer sk_test_greybox');
  assert.equal((calls[0]?.init.headers as Record<string, string>)['idempotency-key'], 'tenant-indie:2026-05-01T00:00:00.000Z:input');
  const body = calls[0]?.init.body as URLSearchParams;
  assert.equal(body.get('event_name'), 'greybox.input_tokens.overage');
  assert.equal(body.get('timestamp'), '1780272000');
  assert.equal(body.get('payload[stripe_customer_id]'), 'cus_greybox_metered_test');
  assert.equal(body.get('payload[value]'), '1000');
  assert.equal(body.get('payload[tenant_id]'), null);
  assert.equal(events[0]?.evidence?.source, 'stripe-live');
  assert.equal(submissions[0]?.stripeRequestId, 'req_123');
});

test('retries transient Stripe meter failures with stable idempotency keys', async () => {
  const invoice = createBillingInvoice({
    tenantId: 'tenant-indie',
    tier: 'indie',
    period,
    events: [usage({ inputTokens: 1_001_000, outputTokens: 200_000 })],
  });
  const [event] = liveStripeMeterEvents(invoice);
  assert.ok(event);
  const calls: RequestInit[] = [];
  const submitter = new StripeMeterSubmitter({
    apiKey: 'sk_test_greybox',
    dryRun: false,
    fetchImpl: async (_url, init) => {
      calls.push(init ?? {});
      if (calls.length === 1) return new Response('try again', { status: 503 });
      return new Response(JSON.stringify({ id: 'mtr_evt_retry' }), {
        status: 200,
        headers: { 'request-id': 'req_retry' },
      });
    },
  });

  const [submission] = await submitter.submit([event]);
  assert.equal(submission?.status, 'submitted');
  assert.equal(submission?.stripeRequestId, 'req_retry');
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map((call) => (call.headers as Record<string, string>)['idempotency-key']), [
    event.identifier,
    event.identifier,
  ]);
});

test('uses exponential backoff across Stripe meter retries', async () => {
  const invoice = createBillingInvoice({
    tenantId: 'tenant-indie',
    tier: 'indie',
    period,
    events: [usage({ inputTokens: 1_001_000, outputTokens: 200_000 })],
  });
  const [event] = liveStripeMeterEvents(invoice);
  assert.ok(event);
  const calls: RequestInit[] = [];
  const delays: number[] = [];
  const submitter = new StripeMeterSubmitter({
    apiKey: 'sk_test_greybox',
    dryRun: false,
    maxAttempts: 3,
    retryBackoffMs: 5,
    sleepMs: async (ms) => {
      delays.push(ms);
    },
    fetchImpl: async (_url, init) => {
      calls.push(init ?? {});
      if (calls.length < 3) return new Response('try again', { status: 503 });
      return new Response(JSON.stringify({ id: 'mtr_evt_retry_backoff' }), {
        status: 200,
        headers: { 'request-id': 'req_retry_backoff' },
      });
    },
  });

  const [submission] = await submitter.submit([event]);

  assert.equal(submission?.status, 'submitted');
  assert.equal(submission?.stripeRequestId, 'req_retry_backoff');
  assert.equal(calls.length, 3);
  assert.deepEqual(delays, [5, 10]);
  assert.deepEqual(calls.map((call) => (call.headers as Record<string, string>)['idempotency-key']), [
    event.identifier,
    event.identifier,
    event.identifier,
  ]);
});

test('skips Stripe meter submission when successful ledger evidence already exists', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-billing-ledger-idempotent-'));
  try {
    const ledger = new FileBillingLedger(dir);
    const invoice = createBillingInvoice({
      tenantId: 'tenant-indie',
      tier: 'indie',
      period,
      events: [usage({ inputTokens: 1_001_000, outputTokens: 200_000 })],
    });
    const [event] = liveStripeMeterEvents(invoice);
    assert.ok(event);
    await ledger.appendStripeMeterEvent(event, {
      dryRun: false,
      stripeRequestId: 'req_existing_meter_event',
      createdAt: new Date('2026-06-01T00:00:00.000Z'),
    });

    let calls = 0;
    const submitter = new StripeMeterSubmitter({
      apiKey: 'sk_test_greybox',
      dryRun: false,
      ledger,
      fetchImpl: async () => {
        calls++;
        throw new Error('Stripe must not be called for an already-submitted meter event');
      },
    });

    const [submission] = await submitter.submit([event]);

    assert.equal(calls, 0);
    assert.equal(submission?.status, 'submitted');
    assert.equal(submission?.stripeRequestId, 'req_existing_meter_event');
    const records = await ledger.readRecords();
    assert.equal(records.length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('live Stripe meter submission ignores prior dry-run ledger evidence', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-billing-ledger-live-after-dryrun-'));
  try {
    const ledger = new FileBillingLedger(dir);
    const invoice = createBillingInvoice({
      tenantId: 'tenant-indie',
      tier: 'indie',
      period,
      events: [usage({ inputTokens: 1_001_000, outputTokens: 200_000 })],
    });
    const [event] = liveStripeMeterEvents(invoice);
    assert.ok(event);
    await ledger.appendStripeMeterEvent(event, {
      dryRun: true,
      createdAt: new Date('2026-05-31T00:00:00.000Z'),
    });

    let calls = 0;
    const submitter = new StripeMeterSubmitter({
      apiKey: 'sk_test_greybox',
      dryRun: false,
      ledger,
      fetchImpl: async () => {
        calls++;
        return new Response(JSON.stringify({ id: 'mtr_evt_live_after_dryrun' }), {
          status: 200,
          headers: { 'request-id': 'req_live_after_dryrun' },
        });
      },
    });

    const [submission] = await submitter.submit([event]);

    assert.equal(calls, 1);
    assert.equal(submission?.status, 'submitted');
    assert.equal(submission?.stripeRequestId, 'req_live_after_dryrun');
    const records = await ledger.readRecords();
    assert.equal(records.length, 2);
    assert.deepEqual(records.map((record) => record.type === 'stripe-meter-event' ? record.dryRun : undefined), [true, false]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('retries Stripe meter submission when prior ledger evidence is failed', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-billing-ledger-retry-'));
  try {
    const ledger = new FileBillingLedger(dir);
    const invoice = createBillingInvoice({
      tenantId: 'tenant-indie',
      tier: 'indie',
      period,
      events: [usage({ inputTokens: 1_001_000, outputTokens: 200_000 })],
    });
    const [event] = liveStripeMeterEvents(invoice);
    assert.ok(event);
    await ledger.appendStripeMeterEvent(event, {
      dryRun: false,
      error: 'Stripe returned 503',
      createdAt: new Date('2026-06-01T00:00:00.000Z'),
    });

    let calls = 0;
    const submitter = new StripeMeterSubmitter({
      apiKey: 'sk_test_greybox',
      dryRun: false,
      ledger,
      fetchImpl: async () => {
        calls++;
        return new Response(JSON.stringify({ id: 'mtr_evt_retry_after_failure' }), {
          status: 200,
          headers: { 'request-id': 'req_retry_after_failure' },
        });
      },
    });

    const [submission] = await submitter.submit([event]);

    assert.equal(calls, 1);
    assert.equal(submission?.status, 'submitted');
    assert.equal(submission?.stripeRequestId, 'req_retry_after_failure');
    const records = await ledger.readRecords();
    assert.equal(records.length, 2);
    assert.deepEqual(records.map((record) => record.type), ['stripe-meter-event', 'stripe-meter-event']);
    assert.equal(records[1]?.type === 'stripe-meter-event' ? records[1].stripeRequestId : undefined, 'req_retry_after_failure');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('redacts PII from failed Stripe meter submissions and ledger evidence', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-billing-ledger-redacted-failure-'));
  try {
    const ledger = new FileBillingLedger(dir);
    const invoice = createBillingInvoice({
      tenantId: 'tenant-indie',
      tier: 'indie',
      period,
      events: [usage({ inputTokens: 1_001_000, outputTokens: 200_000 })],
    });
    const [event] = liveStripeMeterEvents(invoice);
    assert.ok(event);
    const submitter = new StripeMeterSubmitter({
      apiKey: 'sk_test_greybox',
      dryRun: false,
      ledger,
      fetchImpl: async () => new Response('Stripe rejected owner@example.com from 203.0.113.10 for pi_test_secret using sk_test_meter_secret', {
        status: 402,
        headers: { 'request-id': 'req_failed_redacted' },
      }),
    });

    const [submission] = await submitter.submit([event]);

    assert.equal(submission?.status, 'failed');
    assert.equal(submission?.stripeRequestId, 'req_failed_redacted');
    assert.equal(submission?.error, 'Stripe rejected [REDACTED_EMAIL] from [REDACTED_IP] for [REDACTED_STRIPE_ID] using [REDACTED_STRIPE_SECRET]');
    const serialized = JSON.stringify(await ledger.readRecords());
    assert.doesNotMatch(serialized, /owner@example\.com/u);
    assert.doesNotMatch(serialized, /203\.0\.113\.10/u);
    assert.doesNotMatch(serialized, /pi_test_secret/u);
    assert.doesNotMatch(serialized, /sk_test_meter_secret/u);
    assert.match(serialized, /\[REDACTED_EMAIL\]/u);
    assert.match(serialized, /\[REDACTED_IP\]/u);
    assert.match(serialized, /\[REDACTED_STRIPE_ID\]/u);
    assert.match(serialized, /\[REDACTED_STRIPE_SECRET\]/u);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('Checkout readiness reports hosted webhook prerequisites without secrets', () => {
  const report = buildCheckoutReadinessReport({
    stripeWebhookSecret: 'whsec_ready_0123456789abcdef',
    stripeWebhookEvents: requiredMarketplaceEvents,
    requireStripeWebhookEvents: true,
    marketplaceUrl: 'https://marketplace.greybox.studio/',
    marketplaceAdminToken: 'marketplace-admin-0123456789abcdef',
    auditLogConfigured: true,
    now: new Date('2026-05-17T00:00:00.000Z'),
  });

  assert.equal(report.ready, true);
  assert.equal(report.generatedAt, '2026-05-17T00:00:00.000Z');
  assert.deepEqual(report.requiredStripeEvents, requiredMarketplaceEvents);
  assert.equal(report.marketplaceFulfillmentPath, 'https://marketplace.greybox.studio/v1/marketplace/checkout/fulfill');
  assert.deepEqual(report.marketplaceForwardingRoutes, [
    {
      eventType: 'checkout.session.completed',
      path: '/v1/marketplace/checkout/fulfill',
      url: 'https://marketplace.greybox.studio/v1/marketplace/checkout/fulfill',
    },
    {
      eventType: 'charge.dispute.created',
      path: '/v1/marketplace/stripe-events/dispute',
      url: 'https://marketplace.greybox.studio/v1/marketplace/stripe-events/dispute',
    },
    {
      eventType: 'charge.dispute.closed',
      path: '/v1/marketplace/stripe-events/dispute',
      url: 'https://marketplace.greybox.studio/v1/marketplace/stripe-events/dispute',
    },
    {
      eventType: 'charge.refunded',
      path: '/v1/marketplace/stripe-events/refund',
      url: 'https://marketplace.greybox.studio/v1/marketplace/stripe-events/refund',
    },
  ]);
  assert.deepEqual(report.summary, { passed: 5, warnings: 0, failed: 0 });
  assert.deepEqual(report.checks.map((check) => [check.id, check.status]), [
    ['stripe-webhook-secret', 'pass'],
    ['stripe-webhook-events', 'pass'],
    ['marketplace-url', 'pass'],
    ['marketplace-admin-token', 'pass'],
    ['checkout-audit-log', 'pass'],
  ]);
  const serialized = JSON.stringify(report);
  assert.doesNotMatch(serialized, /whsec_ready_0123456789abcdef/u);
  assert.doesNotMatch(serialized, /marketplace-admin-0123456789abcdef/u);
});

test('Checkout readiness fails closed for placeholder or unaudited configuration', () => {
  const report = buildCheckoutReadinessReport({
    stripeWebhookSecret: 'replace-with-long-random-token',
    stripeWebhookEvents: ['checkout.session.completed'],
    requireStripeWebhookEvents: true,
    marketplaceUrl: 'http://marketplace.greybox.studio',
    marketplaceAdminToken: 'token',
    auditLogConfigured: false,
    now: new Date('2026-05-17T00:00:00.000Z'),
  });

  assert.equal(report.ready, false);
  assert.equal(report.summary.failed, 5);
  assert.equal(report.checks.find((check) => check.id === 'stripe-webhook-secret')?.status, 'fail');
  assert.equal(report.checks.find((check) => check.id === 'stripe-webhook-events')?.status, 'fail');
  assert.match(
    report.checks.find((check) => check.id === 'stripe-webhook-events')?.detail ?? '',
    /charge\.dispute\.created/u,
  );
  assert.equal(report.checks.find((check) => check.id === 'marketplace-url')?.status, 'fail');
  assert.equal(report.checks.find((check) => check.id === 'marketplace-admin-token')?.status, 'fail');
  assert.equal(report.checks.find((check) => check.id === 'checkout-audit-log')?.status, 'fail');
  assert.doesNotMatch(JSON.stringify(report), /replace-with-long-random-token/u);

  const shortTokenReport = buildCheckoutReadinessReport({
    stripeWebhookSecret: 'whsec_ready_0123456789abcdef',
    stripeWebhookEvents: requiredMarketplaceEvents,
    requireStripeWebhookEvents: true,
    marketplaceUrl: 'https://marketplace.greybox.studio',
    marketplaceAdminToken: 'marketplace-admin-012345',
    auditLogConfigured: true,
  });
  assert.equal(shortTokenReport.ready, false);
  assert.equal(shortTokenReport.checks.find((check) => check.id === 'marketplace-admin-token')?.status, 'fail');
});

test('Checkout readiness warns on missing local event evidence but fails strict hosted event coverage', () => {
  const localReport = buildCheckoutReadinessReport({
    stripeWebhookSecret: 'whsec_ready_0123456789abcdef',
    marketplaceUrl: 'https://marketplace.greybox.studio',
    marketplaceAdminToken: 'marketplace-admin-0123456789abcdef',
    auditLogConfigured: true,
    now: new Date('2026-05-17T00:00:00.000Z'),
  });
  assert.equal(localReport.ready, true);
  assert.equal(localReport.summary.warnings, 1);
  assert.equal(localReport.checks.find((check) => check.id === 'stripe-webhook-events')?.status, 'warn');

  const hostedReport = buildCheckoutReadinessReport({
    stripeWebhookSecret: 'whsec_ready_0123456789abcdef',
    requireStripeWebhookEvents: true,
    marketplaceUrl: 'https://marketplace.greybox.studio',
    marketplaceAdminToken: 'marketplace-admin-0123456789abcdef',
    auditLogConfigured: true,
    now: new Date('2026-05-17T00:00:00.000Z'),
  });
  assert.equal(hostedReport.ready, false);
  assert.equal(hostedReport.checks.find((check) => check.id === 'stripe-webhook-events')?.status, 'fail');
});

test('billing checkout readiness endpoint is admin protected and sanitized', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-checkout-readiness-audit-'));
  try {
    const auditLog = new FileAuditLog(dir);
    await withServer({
      billingAdminToken: 'billing-admin-0123456789abcdef',
      stripeWebhookSecret: 'whsec_ready_0123456789abcdef',
      marketplaceUrl: 'https://marketplace.greybox.studio',
      marketplaceAdminToken: 'marketplace-admin-0123456789abcdef',
      auditLog,
    }, async (baseUrl) => {
      const denied = await fetch(`${baseUrl}/v1/billing/checkout-readiness`);
      assert.equal(denied.status, 401);
      assert.deepEqual(await denied.json(), { error: 'billing_admin_required' });

      const response = await fetch(`${baseUrl}/v1/billing/checkout-readiness`, {
        headers: { authorization: 'Bearer billing-admin-0123456789abcdef' },
      });
      assert.equal(response.status, 200);
      const report = await response.json() as {
        ready: boolean;
        summary: { failed: number; warnings: number };
        requiredStripeEvents: string[];
        marketplaceFulfillmentPath: string;
      };
      assert.equal(report.ready, true);
      assert.equal(report.summary.failed, 0);
      assert.equal(report.summary.warnings, 1);
      assert.deepEqual(report.requiredStripeEvents, requiredMarketplaceEvents);
      assert.equal(report.marketplaceFulfillmentPath, 'https://marketplace.greybox.studio/v1/marketplace/checkout/fulfill');
      const serialized = JSON.stringify(report);
      assert.doesNotMatch(serialized, /billing-admin-0123456789abcdef/u);
      assert.doesNotMatch(serialized, /whsec_ready_0123456789abcdef/u);
      assert.doesNotMatch(serialized, /marketplace-admin-0123456789abcdef/u);
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('billing checkout session endpoint creates Stripe subscription sessions without leaking server keys', async () => {
  const calls: Array<{ url: string; init: { method: 'POST'; headers: Record<string, string>; body: string } }> = [];
  await withServer({
    stripeApiKey: 'sk_test_billing_checkout',
    billingPriceIds: { studio: 'price_studio_test' },
    billingApiClient: new LiveBillingApiClient({
      apiKey: 'sk_test_billing_checkout',
      retryBackoffMs: 1,
      fetchFn: async (url, init) => {
        calls.push({ url, init });
        return new Response(JSON.stringify({ id: 'cs_test_billing', url: 'https://checkout.stripe.com/c/session' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    }),
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/billing/checkout-session`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer gb_live_test',
        'content-type': 'application/json',
        'x-greybox-tenant': 'tenant-billing',
      },
      body: JSON.stringify({
        tier: 'studio',
        seats: 2,
        successUrl: 'https://app.greybox.studio/billing/success',
        cancelUrl: 'https://app.greybox.studio/billing/cancel',
      }),
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.deepEqual(payload, {
      url: 'https://checkout.stripe.com/c/session',
      id: 'cs_test_billing',
      dryRun: false,
    });
    assert.doesNotMatch(JSON.stringify(payload), /sk_test_billing_checkout/u);
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, 'https://api.stripe.com/v1/checkout/sessions');
  assert.equal(calls[0]?.init.headers.Authorization, 'Bearer sk_test_billing_checkout');
  assert.match(calls[0]?.init.body ?? '', /line_items%5B0%5D%5Bquantity%5D=5/u);
  assert.match(calls[0]?.init.body ?? '', /metadata%5Bgreybox_tenant_id%5D=tenant-billing/u);
});

test('hosted billing checkout page renders a safe Stripe handoff without secret config', async () => {
  await withServer({
    billingPriceIds: { indie: 'price_indie_secret_test' },
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/billing/checkout?tier=indie&tenantId=tenant-web&email=founder%40greybox.studio`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /text\/html/u);
    assert.match(response.headers.get('content-security-policy') ?? '', /default-src 'none'/u);
    const html = await response.text();

    assert.match(html, /Greybox Indie/u);
    assert.match(html, /\$29\/mo/u);
    assert.match(html, /1M tokens/u);
    assert.match(html, /action="\/v1\/billing\/hosted-checkout"/u);
    assert.match(html, /Continue to Stripe/u);
    assert.doesNotMatch(html, /price_indie_secret_test/u);
    assert.doesNotMatch(html, /founder@greybox.studio/u);
    assert.doesNotMatch(html, /STRIPE/u);
    assert.doesNotMatch(html, /sk_test/u);
  });
});

test('hosted billing checkout page fails closed when tenant or price config is missing', async () => {
  await withServer({
    billingPriceIds: { indie: '' },
  }, async (baseUrl) => {
    const missingTenant = await fetch(`${baseUrl}/v1/billing/checkout?tier=indie`);
    assert.equal(missingTenant.status, 400);
    const missingTenantHtml = await missingTenant.text();
    assert.match(missingTenantHtml, /valid Greybox tenant id/u);
    assert.doesNotMatch(missingTenantHtml, /Continue to Stripe/u);

    const missingPrice = await fetch(`${baseUrl}/v1/billing/checkout?tier=indie&tenantId=tenant-web`);
    assert.equal(missingPrice.status, 503);
    const missingPriceHtml = await missingPrice.text();
    assert.match(missingPriceHtml, /Stripe price IDs must be set/u);
    assert.doesNotMatch(missingPriceHtml, /Continue to Stripe/u);
  });
});

test('hosted billing checkout form creates a Stripe session, redirects, and audits without secrets', async () => {
  const calls: Array<{ url: string; init: { method: 'POST'; headers: Record<string, string>; body: string } }> = [];
  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-hosted-checkout-audit-'));
  try {
    const auditLog = new FileAuditLog(dir);
    await withServer({
      auditLog,
      billingCheckoutEnv: {
        GREYBOX_BILLING_CHECKOUT_SUCCESS_URL: 'https://app.greybox.studio/billing/success',
        GREYBOX_BILLING_CHECKOUT_CANCEL_URL: 'https://app.greybox.studio/billing/cancel',
      },
      billingPriceIds: { studio: 'price_studio_secret_test' },
      billingApiClient: new LiveBillingApiClient({
        apiKey: 'sk_test_hosted_checkout',
        retryBackoffMs: 1,
        fetchFn: async (url, init) => {
          calls.push({ url, init });
          return new Response(JSON.stringify({ id: 'cs_test_hosted', url: 'https://checkout.stripe.com/c/hosted' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        },
      }),
    }, async (baseUrl) => {
      const body = new URLSearchParams({
        tier: 'studio',
        tenantId: 'tenant-hosted',
        seats: '2',
        customerEmail: 'founder@greybox.studio',
      });
      const response = await fetch(`${baseUrl}/v1/billing/hosted-checkout`, {
        method: 'POST',
        redirect: 'manual',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          'user-agent': 'greybox-test',
        },
        body,
      });

      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), 'https://checkout.stripe.com/c/hosted');
      assert.doesNotMatch(await response.text(), /sk_test_hosted_checkout/u);
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.url, 'https://api.stripe.com/v1/checkout/sessions');
    assert.equal(calls[0]?.init.headers.Authorization, 'Bearer sk_test_hosted_checkout');
    assert.match(calls[0]?.init.body ?? '', /line_items%5B0%5D%5Bprice%5D=price_studio_secret_test/u);
    assert.match(calls[0]?.init.body ?? '', /line_items%5B0%5D%5Bquantity%5D=5/u);
    assert.match(calls[0]?.init.body ?? '', /metadata%5Bgreybox_tenant_id%5D=tenant-hosted/u);
    assert.match(calls[0]?.init.body ?? '', /customer_email=founder%40greybox.studio/u);

    const [entry] = await auditLog.readEntries({ action: 'billing.checkout_session_created' });
    assert.equal(entry?.tenantId, 'tenant-hosted');
    assert.equal(entry?.targetId, 'cs_test_hosted');
    assert.deepEqual(entry?.metadata, { dryRun: false, seats: 5, tier: 'studio' });
    assert.doesNotMatch(JSON.stringify(entry), /sk_test_hosted_checkout/u);
    assert.doesNotMatch(JSON.stringify(entry), /price_studio_secret_test/u);
    assert.doesNotMatch(JSON.stringify(entry), /founder@greybox.studio/u);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('billing checkout session endpoint fails closed without configured Stripe price', async () => {
  await withServer({}, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/billing/checkout-session`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer gb_live_test',
        'content-type': 'application/json',
        'x-greybox-tenant': 'tenant-billing',
      },
      body: JSON.stringify({
        tier: 'indie',
        successUrl: 'https://app.greybox.studio/billing/success',
        cancelUrl: 'https://app.greybox.studio/billing/cancel',
      }),
    });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'stripe_price_not_configured' });
  });
});

test('billing portal session endpoint creates Stripe portal sessions', async () => {
  const calls: Array<{ url: string; init: { method: 'POST'; headers: Record<string, string>; body: string } }> = [];
  await withServer({
    stripeApiKey: 'sk_test_billing_portal',
    billingApiClient: new LiveBillingApiClient({
      apiKey: 'sk_test_billing_portal',
      retryBackoffMs: 1,
      fetchFn: async (url, init) => {
        calls.push({ url, init });
        return new Response(JSON.stringify({ id: 'bps_test_billing', url: 'https://billing.stripe.com/p/session' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    }),
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/billing/portal-session`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer gb_live_test',
        'content-type': 'application/json',
        'x-greybox-tenant': 'tenant-billing',
      },
      body: JSON.stringify({
        customerId: 'cus_test_billing',
        returnUrl: 'https://app.greybox.studio/billing',
      }),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      url: 'https://billing.stripe.com/p/session',
      id: 'bps_test_billing',
      dryRun: false,
    });
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, 'https://api.stripe.com/v1/billing_portal/sessions');
  assert.match(calls[0]?.init.body ?? '', /customer=cus_test_billing/u);
});

test('billing marketplace report proxy keeps marketplace token server-side and audits exports', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-marketplace-report-audit-'));
  try {
    const auditLog = new FileAuditLog(dir);
    const calls: Array<{ url: string; init: { method: 'GET'; headers: Record<string, string> } }> = [];
    await withServer({
      billingAdminToken: 'billing-admin-0123456789abcdef',
      marketplaceUrl: 'https://marketplace.greybox.test/',
      marketplaceAdminToken: 'marketplace-admin-0123456789abcdef',
      auditLog,
      marketplaceReportFetch: async (url, init) => {
        calls.push({ url, init });
        return new Response('record_type,reference_type,reference_id\ncreator,creator,creator-1\n', {
          status: 200,
          headers: { 'content-type': 'text/csv' },
        });
      },
    }, async (baseUrl) => {
      const denied = await fetch(`${baseUrl}/v1/billing/marketplace-report?report=tax-compliance`);
      assert.equal(denied.status, 401);
      assert.deepEqual(await denied.json(), { error: 'billing_admin_required' });

      const response = await fetch(
        `${baseUrl}/v1/billing/marketplace-report?report=tax-compliance&year=2026&thresholdCents=5000&format=csv`,
        { headers: { authorization: 'Bearer billing-admin-0123456789abcdef' } },
      );
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type') ?? '', /text\/csv/u);
      assert.equal(await response.text(), 'record_type,reference_type,reference_id\ncreator,creator,creator-1\n');

      assert.equal(calls[0]?.url, 'https://marketplace.greybox.test/v1/marketplace/tax-compliance?format=csv&thresholdCents=5000&year=2026');
      assert.deepEqual(calls[0]?.init, {
        method: 'GET',
        headers: {
          authorization: 'Bearer marketplace-admin-0123456789abcdef',
        },
      });

      const entries = await auditLog.readEntries({ action: 'billing.marketplace_report_exported' });
      assert.equal(entries.length, 1);
      assert.equal(entries[0]?.targetId, 'tax-compliance');
      assert.deepEqual(entries[0]?.metadata, {
        report: 'tax-compliance',
        format: 'csv',
        upstreamStatus: 200,
      });
      const serialized = JSON.stringify({ entries, calls });
      assert.doesNotMatch(serialized, /billing-admin-0123456789abcdef/u);
      assert.match(JSON.stringify(calls), /marketplace-admin-0123456789abcdef/u);
      assert.doesNotMatch(JSON.stringify(entries), /marketplace-admin-0123456789abcdef/u);
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('verifies Stripe Checkout webhooks and forwards raw events to marketplace fulfillment', async () => {
  const rawBody = JSON.stringify(checkoutCompletedEvent());
  const signatureHeader = stripeSignatureHeader(rawBody);
  const calls: Array<{ url: string; init: { method: 'POST'; headers: Record<string, string>; body: string } }> = [];
  const result = await handleStripeWebhook({
    rawBody,
    signatureHeader,
    webhookSecret: stripeWebhookSecret,
    marketplaceUrl: 'https://marketplace.greybox.test/',
    marketplaceAdminToken: 'marketplace-admin-token',
    requestId: 'req_cloud_webhook_forward_123',
    now: () => stripeWebhookNow,
    fetchFn: async (url, init) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ result: { idempotent: false } }), { status: 201 });
    },
  });

  assert.deepEqual(result, {
    ok: true,
    received: true,
    verified: true,
    eventId: 'evt_checkout_completed',
    eventType: 'checkout.session.completed',
    stripeObjectId: 'cs_test_cloud_checkout',
    forwarded: true,
    marketplaceStatus: 201,
    idempotent: false,
  });
  assert.equal(calls[0]?.url, 'https://marketplace.greybox.test/v1/marketplace/checkout/fulfill');
  assert.equal(calls[0]?.init.headers.authorization, 'Bearer marketplace-admin-token');
  assert.equal(calls[0]?.init.headers['stripe-signature'], signatureHeader);
  assert.equal(calls[0]?.init.headers['x-request-id'], 'req_cloud_webhook_forward_123');
  assert.equal(calls[0]?.init.body, rawBody);
});

test('Stripe webhook handler forwards marketplace dispute and refund events to scoped routes', async () => {
  const calls: Array<{ request: string; signatureHeader: string | undefined }> = [];
  for (const [eventType, objectId, expectedPath] of [
    ['charge.dispute.created', 'dp_test_cloud', '/v1/marketplace/stripe-events/dispute'],
    ['charge.dispute.closed', 'dp_test_closed', '/v1/marketplace/stripe-events/dispute'],
    ['charge.refunded', 'ch_test_refunded', '/v1/marketplace/stripe-events/refund'],
  ] as const) {
    const rawBody = JSON.stringify({
      id: `evt_${eventType.replaceAll('.', '_')}`,
      type: eventType,
      data: { object: { id: objectId } },
    });
    const signatureHeader = stripeSignatureHeader(rawBody);
    const result = await handleStripeWebhook({
      rawBody,
      signatureHeader,
      webhookSecret: stripeWebhookSecret,
      marketplaceUrl: 'https://marketplace.greybox.test/',
      marketplaceAdminToken: 'marketplace-admin-token',
      now: () => stripeWebhookNow,
      fetchFn: async (url, init) => {
        calls.push({
          request: `${init.method} ${url}`,
          signatureHeader: init.headers['stripe-signature'],
        });
        assert.equal(init.body, rawBody);
        return new Response(JSON.stringify({ result: { idempotent: true } }), { status: 200 });
      },
    });

    assert.equal(result.forwarded, true);
    assert.equal(result.eventType, eventType);
    assert.equal(result.stripeObjectId, objectId);
    assert.equal(result.idempotent, true);
    assert.deepEqual(calls.at(-1), {
      request: `POST https://marketplace.greybox.test${expectedPath}`,
      signatureHeader,
    });
  }
});

test('Stripe webhook handler rejects non-HTTPS marketplace forwarding URLs outside local rehearsals', async () => {
  const rawBody = JSON.stringify(checkoutCompletedEvent());
  let calls = 0;
  await assert.rejects(
    handleStripeWebhook({
      rawBody,
      signatureHeader: stripeSignatureHeader(rawBody),
      webhookSecret: stripeWebhookSecret,
      marketplaceUrl: 'http://marketplace.greybox.studio',
      marketplaceAdminToken: 'marketplace-admin-token',
      now: () => stripeWebhookNow,
      fetchFn: async () => {
        calls += 1;
        return new Response('{}', { status: 200 });
      },
    }),
    (error) => error instanceof BillingWebhookError
      && error.code === 'marketplace_forwarding_not_configured'
      && error.status === 503,
  );
  assert.equal(calls, 0);

  const result = await handleStripeWebhook({
    rawBody,
    signatureHeader: stripeSignatureHeader(rawBody),
    webhookSecret: stripeWebhookSecret,
    marketplaceUrl: 'http://localhost:8787',
    marketplaceAdminToken: 'marketplace-admin-token',
    now: () => stripeWebhookNow,
    fetchFn: async (url) => {
      calls += 1;
      assert.equal(url, 'http://localhost:8787/v1/marketplace/checkout/fulfill');
      return new Response(JSON.stringify({ result: { idempotent: true } }), { status: 200 });
    },
  });
  assert.equal(result.forwarded, true);
  assert.equal(calls, 1);
});

test('Stripe webhook verification rejects bad signatures and stale timestamps', async () => {
  const rawBody = JSON.stringify(checkoutCompletedEvent());
  await assert.rejects(
    handleStripeWebhook({
      rawBody,
      signatureHeader: `t=${Math.floor(stripeWebhookNow / 1_000)},v1=${'0'.repeat(64)}`,
      webhookSecret: stripeWebhookSecret,
      marketplaceUrl: 'https://marketplace.greybox.test',
      marketplaceAdminToken: 'marketplace-admin-token',
      now: () => stripeWebhookNow,
    }),
    (error) => error instanceof BillingWebhookError
      && error.code === 'stripe_webhook_signature_invalid'
      && error.status === 400,
  );

  await assert.rejects(
    handleStripeWebhook({
      rawBody,
      signatureHeader: stripeSignatureHeader(rawBody, Math.floor(stripeWebhookNow / 1_000) - 301),
      webhookSecret: stripeWebhookSecret,
      marketplaceUrl: 'https://marketplace.greybox.test',
      marketplaceAdminToken: 'marketplace-admin-token',
      now: () => stripeWebhookNow,
    }),
    (error) => error instanceof BillingWebhookError
      && error.code === 'stripe_webhook_timestamp_outside_tolerance'
      && error.status === 400,
  );
});

test('Stripe webhook handler acknowledges unsupported signed events without marketplace forwarding', async () => {
  const rawBody = JSON.stringify({ id: 'evt_payment_intent', type: 'payment_intent.succeeded' });
  const result = await handleStripeWebhook({
    rawBody,
    signatureHeader: stripeSignatureHeader(rawBody),
    webhookSecret: stripeWebhookSecret,
    now: () => stripeWebhookNow,
  });

  assert.deepEqual(result, {
    ok: true,
    received: true,
    verified: true,
    eventId: 'evt_payment_intent',
    eventType: 'payment_intent.succeeded',
    forwarded: false,
  });
});

test('billing webhook endpoint verifies raw body and preserves marketplace idempotency', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-billing-webhook-audit-'));
  const rawBody = JSON.stringify(checkoutCompletedEvent({ id: 'evt_checkout_replay' }));
  const calls: Array<{ url: string; headers: Record<string, string>; body: string }> = [];
  try {
    const auditLog = new FileAuditLog(dir);
    await withServer({
      stripeWebhookSecret,
      marketplaceUrl: 'https://marketplace.greybox.test',
      marketplaceAdminToken: 'marketplace-admin-token',
      auditLog,
      marketplaceFetch: async (url, init) => {
        calls.push({ url, headers: init.headers, body: init.body });
        return new Response(JSON.stringify({ result: { idempotent: true } }), { status: 200 });
      },
    }, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/v1/billing/webhook`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'stripe-signature': stripeSignatureHeader(rawBody, Math.floor(Date.now() / 1_000)),
          'x-request-id': 'req_cloud_endpoint_forward_456',
        },
        body: rawBody,
      });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {
        ok: true,
        received: true,
        verified: true,
        eventId: 'evt_checkout_replay',
        eventType: 'checkout.session.completed',
        stripeObjectId: 'cs_test_cloud_checkout',
        forwarded: true,
        marketplaceStatus: 200,
        idempotent: true,
      });
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.url, 'https://marketplace.greybox.test/v1/marketplace/checkout/fulfill');
    assert.equal(calls[0]?.headers['x-request-id'], 'req_cloud_endpoint_forward_456');
    assert.equal(calls[0]?.body, rawBody);

    const [entry] = await auditLog.readEntries({ action: 'billing.checkout_fulfilled' });
    assert.equal(entry?.tenantId, 'marketplace');
    assert.equal(entry?.actorId, 'stripe:webhook');
    assert.equal(entry?.actorType, 'system');
    assert.equal(entry?.targetType, 'stripe-checkout-session');
    assert.equal(entry?.targetId, 'cs_test_cloud_checkout');
    assert.deepEqual(entry?.metadata, {
      stripeEventId: 'evt_checkout_replay',
      eventType: 'checkout.session.completed',
      forwarded: true,
      marketplaceStatus: 200,
      idempotent: true,
    });
    const serialized = JSON.stringify(entry);
    assert.doesNotMatch(serialized, /whsec_greybox_test_secret/u);
    assert.doesNotMatch(serialized, /marketplace-admin-token/u);
    assert.doesNotMatch(serialized, /v1=/u);
    assert.doesNotMatch(serialized, /studio-buyer/u);
    assert.equal((await auditLog.verify()).valid, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('billing webhook endpoint audits forwarded marketplace refund and dispute events', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-billing-risk-webhook-audit-'));
  const rawBody = JSON.stringify({
    id: 'evt_charge_refunded_audit',
    type: 'charge.refunded',
    data: {
      object: {
        id: 'ch_test_refunded_audit',
        object: 'charge',
        refunded: true,
      },
    },
  });

  try {
    const auditLog = new FileAuditLog(dir);
    await withServer({
      stripeWebhookSecret,
      marketplaceUrl: 'https://marketplace.greybox.test',
      marketplaceAdminToken: 'marketplace-admin-token',
      auditLog,
      marketplaceFetch: async () => new Response(JSON.stringify({ ok: true, ignored: false }), { status: 201 }),
    }, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/v1/billing/webhook`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'stripe-signature': stripeSignatureHeader(rawBody, Math.floor(Date.now() / 1_000)),
        },
        body: rawBody,
      });
      assert.equal(response.status, 200);
      const body = await response.json() as {
        eventType?: string;
        forwarded?: boolean;
        marketplaceStatus?: number;
      };
      assert.equal(body.eventType, 'charge.refunded');
      assert.equal(body.forwarded, true);
      assert.equal(body.marketplaceStatus, 201);
    });

    const [entry] = await auditLog.readEntries({ action: 'billing.marketplace_stripe_event_forwarded' });
    assert.equal(entry?.tenantId, 'marketplace');
    assert.equal(entry?.actorId, 'stripe:webhook');
    assert.equal(entry?.actorType, 'system');
    assert.equal(entry?.targetType, 'stripe-marketplace-event');
    assert.equal(entry?.targetId, 'ch_test_refunded_audit');
    assert.deepEqual(entry?.metadata, {
      stripeEventId: 'evt_charge_refunded_audit',
      eventType: 'charge.refunded',
      forwarded: true,
      marketplaceStatus: 201,
      idempotent: false,
    });
    const serialized = JSON.stringify(entry);
    assert.doesNotMatch(serialized, /whsec_greybox_test_secret/u);
    assert.doesNotMatch(serialized, /marketplace-admin-token/u);
    assert.doesNotMatch(serialized, /v1=/u);
    assert.equal((await auditLog.verify()).valid, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('billing webhook endpoint fails closed when signature verification is invalid', async () => {
  const rawBody = JSON.stringify(checkoutCompletedEvent({ id: 'evt_bad_signature' }));
  await withServer({
    stripeWebhookSecret,
    marketplaceUrl: 'https://marketplace.greybox.test',
    marketplaceAdminToken: 'marketplace-admin-token',
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/billing/webhook`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'stripe-signature': 't=1,v1=not-a-valid-signature',
      },
      body: rawBody,
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'stripe_signature_missing_v1' });
  });
});

test('refuses live Stripe submission without an API key', async () => {
  const invoice = createBillingInvoice({
    tenantId: 'tenant-indie',
    tier: 'indie',
    period,
    events: [usage({ inputTokens: 1_001_000, outputTokens: 200_000 })],
  });
  const submitter = new StripeMeterSubmitter({ dryRun: false });
  const [submission] = await submitter.submit(buildStripeMeterEvents(invoice));
  assert.equal(submission?.status, 'failed');
  assert.match(submission?.error ?? '', /Stripe API key is required/u);
});

test('defaults to dry-run when no Stripe API key is configured', async () => {
  const invoice = createBillingInvoice({
    tenantId: 'tenant-indie',
    tier: 'indie',
    period,
    events: [usage({ inputTokens: 1_001_000, outputTokens: 200_000 })],
  });
  const submitter = new StripeMeterSubmitter({});
  const [submission] = await submitter.submit(buildStripeMeterEvents(invoice));
  assert.equal(submission?.status, 'dry-run', 'Without an API key the submitter must default to dry-run for safety.');
});

test('defaults to live submission when a Stripe API key is configured', async () => {
  const invoice = createBillingInvoice({
    tenantId: 'tenant-indie',
    tier: 'indie',
    period,
    events: [usage({ inputTokens: 1_001_000, outputTokens: 200_500 })],
  });
  const meterEvents = liveStripeMeterEvents(invoice);
  assert.ok(meterEvents.length > 0, 'Fixture invoice must produce at least one meter event.');
  const calls: Array<{ url: string }> = [];
  const submitter = new StripeMeterSubmitter({
    apiKey: 'sk_test_default_live',
    fetchImpl: async (url) => {
      calls.push({ url: String(url) });
      return new Response(JSON.stringify({ id: 'mtr_evt_default_live' }), {
        status: 200,
        headers: { 'request-id': 'req_default_live' },
      });
    },
  });
  const submissions = await submitter.submit(meterEvents);
  assert.equal(
    submissions.every((submission) => submission.status === 'submitted'),
    true,
    'When apiKey is set without an explicit dryRun flag the submitter must default to live so revenue is captured.',
  );
  assert.equal(calls.length, meterEvents.length);
});

test('refuses live Stripe meter submission without billing identity evidence', async () => {
  const invoice = createBillingInvoice({
    tenantId: 'tenant-indie',
    tier: 'indie',
    period,
    events: [usage({ inputTokens: 1_001_000, outputTokens: 200_000 })],
  });
  let fetchCalled = false;
  const submitter = new StripeMeterSubmitter({
    apiKey: 'sk_test_requires_identity_evidence',
    dryRun: false,
    fetchImpl: async () => {
      fetchCalled = true;
      return new Response('{}', { status: 200 });
    },
  });
  const [submission] = await submitter.submit(buildStripeMeterEvents(invoice));
  assert.equal(submission?.status, 'failed');
  assert.match(submission?.error ?? '', /billing identity evidence/u);
  assert.equal(fetchCalled, false);
});

test('honours explicit dryRun=true even when an API key is configured', async () => {
  const invoice = createBillingInvoice({
    tenantId: 'tenant-indie',
    tier: 'indie',
    period,
    events: [usage({ inputTokens: 1_001_000, outputTokens: 200_000 })],
  });
  let fetchCalled = false;
  const submitter = new StripeMeterSubmitter({
    apiKey: 'sk_test_should_not_fire',
    dryRun: true,
    fetchImpl: async () => {
      fetchCalled = true;
      return new Response('{}', { status: 200 });
    },
  });
  const [submission] = await submitter.submit(buildStripeMeterEvents(invoice));
  assert.equal(submission?.status, 'dry-run');
  assert.equal(fetchCalled, false, 'Explicit dryRun=true must override the apiKey-derived default.');
});

// Billing Checkout / Portal session builder and client tests.

test('buildBillingCheckoutSessionRequest emits a subscription line + tenant metadata', async () => {
  const mod = await import('../src/routers/billing.js');
  const request = mod.buildBillingCheckoutSessionRequest({
    tenantId: 'tenant-a',
    tier: 'indie',
    seats: 1,
    priceId: 'price_indie_test',
    successUrl: 'https://app.greybox.studio/billing/success',
    cancelUrl: 'https://app.greybox.studio/billing/cancel',
  });
  assert.equal(request.endpoint, '/v1/checkout/sessions');
  assert.equal(request.idempotencyKey, 'greybox-billing-checkout-tenant-a-indie-1');
  assert.equal(request.body.mode, 'subscription');
  assert.deepEqual(
    (request.body.metadata as Record<string, string>),
    {
      greybox_tenant_id: 'tenant-a',
      greybox_plan_tier: 'indie',
      greybox_seats: '1',
    },
  );
  const lineItems = request.body.line_items as Array<{ price: string; quantity: number }>;
  assert.deepEqual(lineItems, [{ price: 'price_indie_test', quantity: 1 }]);
});

test('buildBillingCheckoutSessionRequest clamps seats to plan minimum and 1000 ceiling', async () => {
  const mod = await import('../src/routers/billing.js');
  const requested = mod.buildBillingCheckoutSessionRequest({
    tenantId: 't',
    tier: 'studio',
    seats: 1,
    priceId: 'p',
    successUrl: 'https://app.greybox.studio/success',
    cancelUrl: 'https://app.greybox.studio/cancel',
  });
  // studio plan minimum is 5; requesting 1 should bump to 5
  const lineItemsLow = requested.body.line_items as Array<{ quantity: number }>;
  assert.equal(lineItemsLow[0]!.quantity, 5);

  const ceiling = mod.buildBillingCheckoutSessionRequest({
    tenantId: 't',
    tier: 'indie',
    seats: 999_999,
    priceId: 'p',
    successUrl: 'https://app.greybox.studio/success',
    cancelUrl: 'https://app.greybox.studio/cancel',
  });
  const lineItemsHigh = ceiling.body.line_items as Array<{ quantity: number }>;
  assert.equal(lineItemsHigh[0]!.quantity, 1000);
});

test('buildBillingCheckoutSessionRequest rejects unsafe return URLs', async () => {
  const mod = await import('../src/routers/billing.js');
  assert.throws(
    () => mod.buildBillingCheckoutSessionRequest({
      tenantId: 'tenant-a',
      tier: 'indie',
      seats: 1,
      priceId: 'price_indie_test',
      successUrl: 'javascript:alert(1)',
      cancelUrl: 'https://app.greybox.studio/cancel',
    }),
    /successUrl must be an absolute https URL/u,
  );
  assert.throws(
    () => mod.buildBillingCheckoutSessionRequest({
      tenantId: 'tenant-a',
      tier: 'indie',
      seats: 1,
      priceId: 'price_indie_test',
      successUrl: 'http://app.greybox.studio/success',
      cancelUrl: 'https://app.greybox.studio/cancel',
    }),
    /successUrl must be an absolute https URL/u,
  );
  assert.throws(
    () => mod.buildBillingPortalSessionRequest({
      tenantId: 'tenant-a',
      customerId: 'cus_test_customer',
      returnUrl: 'https://user:secret@app.greybox.studio/billing',
    }),
    /returnUrl must not include credentials/u,
  );
  assert.doesNotThrow(() => mod.buildBillingCheckoutSessionRequest({
    tenantId: 'tenant-a',
    tier: 'indie',
    seats: 1,
    priceId: 'price_indie_test',
    successUrl: 'http://localhost:3000/success',
    cancelUrl: 'http://127.0.0.1:3000/cancel',
  }));
});

test('LiveBillingApiClient returns a dryRun result when no apiKey is configured', async () => {
  const mod = await import('../src/routers/billing.js');
  const client = new mod.LiveBillingApiClient({});
  const result = await client.createCheckoutSession({
    tenantId: 'tenant-dry',
    tier: 'indie',
    seats: 1,
    priceId: 'price_indie_test',
    successUrl: 'https://app.greybox.studio/success',
    cancelUrl: 'https://app.greybox.studio/cancel',
  });
  assert.equal(result.dryRun, true);
  assert.ok(result.url.includes('dryrun'));
  assert.ok(result.id.startsWith('cs_dryrun'));
});

test('LiveBillingApiClient fails closed on malformed successful Stripe responses', async () => {
  const mod = await import('../src/routers/billing.js');
  const client = new mod.LiveBillingApiClient({
    apiKey: 'sk_live_test',
    maxRetries: 0,
    retryBackoffMs: 1,
    fetchFn: async () => new Response(JSON.stringify({ id: 'cs_missing_url' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }) as unknown as Pick<Response, 'ok' | 'status' | 'json' | 'text'>,
  });
  await assert.rejects(
    () => client.createCheckoutSession({
      tenantId: 't',
      tier: 'indie',
      seats: 1,
      priceId: 'p',
      successUrl: 'https://app.greybox.studio/success',
      cancelUrl: 'https://app.greybox.studio/cancel',
    }),
    (error: unknown) => error instanceof BillingWebhookError && error.code === 'stripe_malformed_response',
  );
});

test('LiveBillingApiClient rejects non-Stripe Checkout response URLs', async () => {
  const mod = await import('../src/routers/billing.js');
  const client = new mod.LiveBillingApiClient({
    apiKey: 'sk_live_test',
    maxRetries: 0,
    retryBackoffMs: 1,
    fetchFn: async () => new Response(JSON.stringify({
      id: 'cs_live_checkout',
      url: 'https://example.com/c/session',
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }) as unknown as Pick<Response, 'ok' | 'status' | 'json' | 'text'>,
  });

  await assert.rejects(
    () => client.createCheckoutSession({
      tenantId: 't',
      tier: 'indie',
      seats: 1,
      priceId: 'p',
      successUrl: 'https://app.greybox.studio/success',
      cancelUrl: 'https://app.greybox.studio/cancel',
    }),
    (error: unknown) => {
      assert.ok(error instanceof BillingWebhookError);
      assert.equal(error.code, 'stripe_malformed_response');
      assert.equal(error.message, 'Stripe response url must be hosted on checkout.stripe.com');
      return true;
    },
  );
});

test('LiveBillingApiClient rejects Billing Portal responses with the wrong Stripe object id', async () => {
  const mod = await import('../src/routers/billing.js');
  const client = new mod.LiveBillingApiClient({
    apiKey: 'sk_live_test',
    maxRetries: 0,
    retryBackoffMs: 1,
    fetchFn: async () => new Response(JSON.stringify({
      id: 'cs_live_wrong_surface',
      url: 'https://billing.stripe.com/p/session/bps_live_ok',
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }) as unknown as Pick<Response, 'ok' | 'status' | 'json' | 'text'>,
  });

  await assert.rejects(
    () => client.createPortalSession({
      tenantId: 't',
      customerId: 'cus_live_customer',
      returnUrl: 'https://app.greybox.studio/billing',
    }),
    (error: unknown) => {
      assert.ok(error instanceof BillingWebhookError);
      assert.equal(error.code, 'stripe_malformed_response');
      assert.equal(error.message, 'Stripe response id was not a Billing Portal Session id');
      return true;
    },
  );
});

test('LiveBillingApiClient refuses non-Stripe API bases unless transport is injected', async () => {
  const mod = await import('../src/routers/billing.js');
  const fetchFn = async () => new Response('{}', { status: 200 }) as unknown as Pick<Response, 'ok' | 'status' | 'json' | 'text'>;
  assert.throws(
    () => new mod.LiveBillingApiClient({
      apiKey: 'sk_live_billing',
      stripeApiBase: 'https://stripe.test',
    }),
    /api\.stripe\.com/u,
  );
  assert.throws(
    () => new mod.LiveBillingApiClient({
      apiKey: 'sk_live_billing',
      stripeApiBase: 'https://api.stripe.com/v1',
    }),
    /must not include a path/u,
  );
  assert.doesNotThrow(() => new mod.LiveBillingApiClient({
    apiKey: 'sk_live_billing',
    stripeApiBase: 'https://stripe.test',
    fetchFn,
  }));
});

test('LiveBillingApiClient surfaces Stripe 400 errors as BillingWebhookError', async () => {
  const mod = await import('../src/routers/billing.js');
  let calls = 0;
  const client = new mod.LiveBillingApiClient({
    apiKey: 'sk_live_test',
    maxRetries: 0,
    retryBackoffMs: 1,
    fetchFn: async () => {
      calls += 1;
      return new Response('No such price price_live_secret for owner@example.com using sk_live_error_secret', { status: 400 }) as unknown as Pick<Response, 'ok' | 'status' | 'json' | 'text'>;
    },
  });
  await assert.rejects(
    () => client.createCheckoutSession({
      tenantId: 't',
      tier: 'indie',
      seats: 1,
      priceId: 'p',
      successUrl: 'https://app.greybox.studio/success',
      cancelUrl: 'https://app.greybox.studio/cancel',
    }),
    (error: unknown) => {
      assert.ok(error instanceof BillingWebhookError);
      assert.equal(error.code, 'stripe_400');
      assert.equal(error.message, 'No such price [REDACTED_STRIPE_ID] for [REDACTED_EMAIL] using [REDACTED_STRIPE_SECRET]');
      assert.doesNotMatch(error.message, /price_live_secret|owner@example\.com|sk_live_error_secret/u);
      return true;
    },
  );
  assert.equal(calls, 1);
});

test('LiveBillingApiClient redacts Stripe transport failures before surfacing', async () => {
  const mod = await import('../src/routers/billing.js');
  const client = new mod.LiveBillingApiClient({
    apiKey: 'sk_live_test',
    maxRetries: 0,
    retryBackoffMs: 1,
    fetchFn: async () => {
      throw new Error('network leaked pi_live_secret for billing@example.com with sk_live_transport_secret');
    },
  });

  await assert.rejects(
    () => client.createPortalSession({
      tenantId: 't',
      customerId: 'cus_live_customer',
      returnUrl: 'https://app.greybox.studio/billing',
    }),
    (error: unknown) => {
      assert.ok(error instanceof BillingWebhookError);
      assert.equal(error.code, 'stripe_transport_exhausted');
      assert.equal(
        error.message,
        'stripe_transport_exhausted:network leaked [REDACTED_STRIPE_ID] for [REDACTED_EMAIL] with [REDACTED_STRIPE_SECRET]',
      );
      assert.doesNotMatch(error.message, /pi_live_secret|billing@example\.com|sk_live_transport_secret/u);
      return true;
    },
  );
});

test('LiveBillingApiClient retries transient 5xx and returns a Stripe checkout url', async () => {
  const mod = await import('../src/routers/billing.js');
  let calls = 0;
  const client = new mod.LiveBillingApiClient({
    apiKey: 'sk_live_test',
    maxRetries: 2,
    retryBackoffMs: 1,
    fetchFn: async () => {
      calls += 1;
      if (calls === 1) return new Response('boom', { status: 503 }) as unknown as Pick<Response, 'ok' | 'status' | 'json' | 'text'>;
      return new Response(JSON.stringify({ id: 'cs_live_ok', url: 'https://checkout.stripe.com/c/abc' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }) as unknown as Pick<Response, 'ok' | 'status' | 'json' | 'text'>;
    },
  });
  const result = await client.createCheckoutSession({
    tenantId: 't',
    tier: 'indie',
    seats: 1,
    priceId: 'p',
    successUrl: 'https://app.greybox.studio/success',
    cancelUrl: 'https://app.greybox.studio/cancel',
  });
  assert.equal(calls, 2);
  assert.equal(result.id, 'cs_live_ok');
  assert.equal(result.url, 'https://checkout.stripe.com/c/abc');
  assert.equal(result.dryRun, false);
});
