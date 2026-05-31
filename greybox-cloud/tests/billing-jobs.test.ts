// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import type http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { FileAuditLog } from '../src/enterprise/auditLog.js';
import { FileBillingLedger } from '../src/metering/billingLedger.js';
import { StripeMeterSubmitter } from '../src/metering/stripeMeterSubmitter.js';
import { createGreyboxCloudServer } from '../src/server.js';
import { TenantStore } from '../src/routers/tenants.js';
import type { UsageEvent } from '../src/types.js';

function usage(overrides: Partial<UsageEvent> = {}): UsageEvent {
  return {
    id: overrides.id ?? 'usage-job-1',
    tenantId: overrides.tenantId ?? 'tenant-job',
    userId: overrides.userId ?? 'user-job',
    projectId: overrides.projectId ?? 'project-job',
    provider: overrides.provider ?? 'openai',
    model: overrides.model ?? 'gpt-4.1-mini',
    inputTokens: overrides.inputTokens ?? 1_100_000,
    outputTokens: overrides.outputTokens ?? 220_000,
    inputCostUsd: overrides.inputCostUsd ?? 13.2,
    outputCostUsd: overrides.outputCostUsd ?? 8.8,
    createdAt: overrides.createdAt ?? '2026-05-15T12:00:00.000Z',
  };
}

function tenantStoreWithStripeCustomer(tenantId = 'tenant-job'): TenantStore {
  const tenantStore = new TenantStore();
  tenantStore.upsert({
    id: tenantId,
    tier: 'indie',
    region: 'us',
    ssoEnabled: false,
    monthlyInputTokensIncluded: 1_000_000,
    monthlyOutputTokensIncluded: 200_000,
    billing: {
      stripeCustomerId: 'cus_greybox_metered_test',
      stripeMeterPayload: {
        customerKey: 'stripe_customer_id',
        valueKey: 'value',
      },
    },
  });
  return tenantStore;
}

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

test('billing invoice job requires admin token', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-billing-job-'));
  try {
    const ledger = new FileBillingLedger(dir);
    await withServer(
      { billingLedger: ledger, billingAdminToken: 'secret-admin' },
      async (baseUrl) => {
        const response = await fetch(`${baseUrl}/v1/billing/jobs/invoice`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({}),
        });
        assert.equal(response.status, 401);
        assert.deepEqual(await response.json(), { error: 'billing_admin_required' });
      },
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('billing invoice job requires a configured ledger', async () => {
  await withServer(
    { billingAdminToken: 'secret-admin' },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/v1/billing/jobs/invoice`, {
        method: 'POST',
        headers: {
          authorization: 'Bearer secret-admin',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          tenantId: 'tenant-job',
          tier: 'indie',
          period: {
            start: '2026-05-01T00:00:00.000Z',
            end: '2026-06-01T00:00:00.000Z',
          },
        }),
      });
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), { error: 'billing_ledger_not_configured' });
    },
  );
});

test('billing invoice job creates invoice and dry-run meter submissions from ledger usage', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-billing-job-'));
  try {
    const ledger = new FileBillingLedger(dir);
    await ledger.appendUsage(usage());
    await withServer(
      { billingLedger: ledger, billingAdminToken: 'secret-admin' },
      async (baseUrl) => {
        const response = await fetch(`${baseUrl}/v1/billing/jobs/invoice`, {
          method: 'POST',
          headers: {
            'x-greybox-billing-admin-token': 'secret-admin',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            tenantId: 'tenant-job',
            tier: 'indie',
            period: {
              start: '2026-05-01T00:00:00.000Z',
              end: '2026-06-01T00:00:00.000Z',
            },
            submitStripe: true,
            dryRun: true,
          }),
        });
        assert.equal(response.status, 200);
        const json = await response.json() as {
          invoice: { totalUsd: number; billableInputTokens: number; billableOutputTokens: number };
          meterEvents: Array<{ payload: { quantity: number } }>;
          submissions: Array<{ status: string }>;
          dryRun: boolean;
        };
        assert.equal(json.dryRun, true);
        assert.equal(json.invoice.billableInputTokens, 100_000);
        assert.equal(json.invoice.billableOutputTokens, 20_000);
        assert.equal(json.invoice.totalUsd, 38);
        assert.deepEqual(json.meterEvents.map((event) => event.payload.quantity), [100_000, 20_000]);
        assert.deepEqual(json.submissions.map((submission) => submission.status), ['dry-run', 'dry-run']);
      },
    );

    const records = await ledger.readRecords();
    assert.deepEqual(records.map((record) => record.type), [
      'usage',
      'invoice',
      'stripe-meter-event',
      'stripe-meter-event',
    ]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('billing invoice job fails closed when Stripe meter submission fails', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-billing-job-'));
  try {
    const auditLog = new FileAuditLog(path.join(dir, 'audit'));
    const ledger = new FileBillingLedger(dir);
    await ledger.appendUsage(usage({ outputTokens: 200_000 }));
    const stripeBodies: URLSearchParams[] = [];
    const stripeSubmitter = new StripeMeterSubmitter({
      apiKey: 'sk_test_greybox',
      dryRun: false,
      ledger,
      fetchImpl: async (_url, init) => {
        stripeBodies.push(init?.body as URLSearchParams);
        return new Response('Stripe meter failed for finance@example.com on pi_test_job with sk_test_meter_secret', {
          status: 402,
          headers: { 'request-id': 'req_meter_failed' },
        });
      },
    });

    await withServer(
      {
        auditLog,
        billingLedger: ledger,
        billingAdminToken: 'secret-admin',
        billingInvoiceJobNow: () => new Date('2026-06-02T00:00:00.000Z'),
        stripeSubmitter,
        tenantStore: tenantStoreWithStripeCustomer(),
      },
      async (baseUrl) => {
        const response = await fetch(`${baseUrl}/v1/billing/jobs/invoice`, {
          method: 'POST',
          headers: {
            authorization: 'Bearer secret-admin',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            tenantId: 'tenant-job',
            tier: 'indie',
            period: {
              start: '2026-05-01T00:00:00.000Z',
              end: '2026-06-01T00:00:00.000Z',
            },
            submitStripe: true,
            dryRun: false,
          }),
        });
        assert.equal(response.status, 502);
        assert.deepEqual(await response.json(), {
          error: 'stripe_meter_submission_failed',
          failures: [
            {
              identifier: 'tenant-job:2026-05-01T00:00:00.000Z:input',
              eventName: 'greybox.input_tokens.overage',
              error: 'Stripe meter failed for [REDACTED_EMAIL] on [REDACTED_STRIPE_ID] with [REDACTED_STRIPE_SECRET]',
              stripeRequestId: 'req_meter_failed',
            },
          ],
        });
      },
    );

    const serialized = JSON.stringify(await ledger.readRecords());
    assert.match(serialized, /\[REDACTED_EMAIL\]/u);
    assert.match(serialized, /\[REDACTED_STRIPE_ID\]/u);
    assert.match(serialized, /\[REDACTED_STRIPE_SECRET\]/u);
    assert.doesNotMatch(serialized, /finance@example\.com/u);
    assert.doesNotMatch(serialized, /pi_test_job/u);
    assert.doesNotMatch(serialized, /sk_test_meter_secret/u);
    assert.equal(stripeBodies[0]?.get('payload[stripe_customer_id]'), 'cus_greybox_metered_test');
    assert.equal(stripeBodies[0]?.get('payload[value]'), '100000');
    assert.equal(stripeBodies[0]?.get('payload[tenant_id]'), null);
    assert.equal(stripeBodies[0]?.get('timestamp'), '1780272000');
    const [entry] = await auditLog.readEntries({ action: 'billing.invoice_job_run' });
    assert.equal(entry?.tenantId, 'tenant-job');
    assert.equal(entry?.targetId, 'tenant-job:2026-05-01T00:00:00.000Z:2026-06-01T00:00:00.000Z');
    assert.deepEqual(entry?.metadata, {
      tier: 'indie',
      dryRun: false,
      submitStripe: true,
      status: 'failed',
      failureCode: 'stripe_meter_submission_failed',
      failureCount: 1,
      failures: [
        {
          identifier: 'tenant-job:2026-05-01T00:00:00.000Z:input',
          eventName: 'greybox.input_tokens.overage',
          stripeRequestId: 'req_meter_failed',
        },
      ],
    });
    assert.doesNotMatch(JSON.stringify(entry), /finance@example\.com/u);
    assert.doesNotMatch(JSON.stringify(entry), /pi_test_job/u);
    assert.doesNotMatch(JSON.stringify(entry), /sk_test_meter_secret/u);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('billing invoice job rejects live Stripe metering before invoice append without tenant billing identity', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-billing-job-'));
  try {
    const auditLog = new FileAuditLog(path.join(dir, 'audit'));
    const ledger = new FileBillingLedger(dir);
    await ledger.appendUsage(usage());
    const tenantStore = new TenantStore();
    tenantStore.upsert({
      id: 'tenant-job',
      tier: 'indie',
      region: 'us',
      ssoEnabled: false,
      monthlyInputTokensIncluded: 1_000_000,
      monthlyOutputTokensIncluded: 200_000,
    });

    await withServer(
      {
        auditLog,
        billingLedger: ledger,
        billingAdminToken: 'secret-admin',
        billingInvoiceJobNow: () => new Date('2026-06-02T00:00:00.000Z'),
        tenantStore,
        stripeApiKey: 'sk_test_greybox',
      },
      async (baseUrl) => {
        const response = await fetch(`${baseUrl}/v1/billing/jobs/invoice`, {
          method: 'POST',
          headers: {
            authorization: 'Bearer secret-admin',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            tenantId: 'tenant-job',
            tier: 'indie',
            period: {
              start: '2026-05-01T00:00:00.000Z',
              end: '2026-06-01T00:00:00.000Z',
            },
            submitStripe: true,
            dryRun: false,
          }),
        });
        assert.equal(response.status, 409);
        assert.deepEqual(await response.json(), {
          error: 'billing_identity_missing',
          reasons: ['stripe_customer_id_missing'],
        });
      },
    );

    assert.deepEqual((await ledger.readRecords()).map((record) => record.type), ['usage']);
    const [entry] = await auditLog.readEntries({ action: 'billing.invoice_job_run' });
    assert.equal(entry?.metadata?.failureCode, 'billing_identity_missing');
    assert.deepEqual(entry?.metadata?.reasons, ['stripe_customer_id_missing']);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('billing invoice job rejects live Stripe metering before the billing period closes', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-billing-job-'));
  try {
    const auditLog = new FileAuditLog(path.join(dir, 'audit'));
    const ledger = new FileBillingLedger(dir);
    await ledger.appendUsage(usage());
    const stripeSubmitter = new StripeMeterSubmitter({
      apiKey: 'sk_test_greybox',
      dryRun: false,
      ledger,
      fetchImpl: async () => {
        throw new Error('Stripe should not be called for an open billing period');
      },
    });

    await withServer(
      {
        auditLog,
        billingLedger: ledger,
        billingAdminToken: 'secret-admin',
        billingInvoiceJobNow: () => new Date('2026-05-25T00:00:00.000Z'),
        stripeSubmitter,
      },
      async (baseUrl) => {
        const response = await fetch(`${baseUrl}/v1/billing/jobs/invoice`, {
          method: 'POST',
          headers: {
            authorization: 'Bearer secret-admin',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            tenantId: 'tenant-job',
            tier: 'indie',
            period: {
              start: '2026-05-01T00:00:00.000Z',
              end: '2026-06-01T00:00:00.000Z',
            },
            submitStripe: true,
            dryRun: false,
          }),
        });
        assert.equal(response.status, 409);
        assert.deepEqual(await response.json(), {
          error: 'billing_period_not_closed',
          periodEnd: '2026-06-01T00:00:00.000Z',
          now: '2026-05-25T00:00:00.000Z',
        });
      },
    );

    const records = await ledger.readRecords();
    assert.deepEqual(records.map((record) => record.type), ['usage']);
    const [entry] = await auditLog.readEntries({ action: 'billing.invoice_job_run' });
    assert.equal(entry?.metadata?.failureCode, 'billing_period_not_closed');
    assert.equal(entry?.metadata?.periodEnd, '2026-06-01T00:00:00.000Z');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('hosted production invoice job rejects dry-run Stripe metering', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-billing-job-'));
  try {
    const ledger = new FileBillingLedger(dir);
    await ledger.appendUsage(usage());
    await withServer(
      {
        billingLedger: ledger,
        billingAdminToken: 'secret-admin',
        billingMeteringEnv: { NODE_ENV: 'production' },
        stripeApiKey: 'sk_live_123456789012345678901234',
      },
      async (baseUrl) => {
        const response = await fetch(`${baseUrl}/v1/billing/jobs/invoice`, {
          method: 'POST',
          headers: {
            authorization: 'Bearer secret-admin',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            tenantId: 'tenant-job',
            tier: 'indie',
            period: {
              start: '2026-05-01T00:00:00.000Z',
              end: '2026-06-01T00:00:00.000Z',
            },
            submitStripe: true,
            dryRun: true,
          }),
        });
        assert.equal(response.status, 400);
        assert.deepEqual(await response.json(), {
          error: 'hosted_production_metering_not_live',
          reasons: ['dry_run_enabled'],
        });
      },
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('hosted production invoice job rejects non-live Stripe keys', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-billing-job-'));
  try {
    const ledger = new FileBillingLedger(dir);
    await ledger.appendUsage(usage());
    await withServer(
      {
        billingLedger: ledger,
        billingAdminToken: 'secret-admin',
        billingMeteringEnv: { NODE_ENV: 'production' },
        stripeApiKey: 'sk_test_123456789012345678901234',
      },
      async (baseUrl) => {
        const response = await fetch(`${baseUrl}/v1/billing/jobs/invoice`, {
          method: 'POST',
          headers: {
            authorization: 'Bearer secret-admin',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            tenantId: 'tenant-job',
            tier: 'indie',
            period: {
              start: '2026-05-01T00:00:00.000Z',
              end: '2026-06-01T00:00:00.000Z',
            },
            submitStripe: true,
            dryRun: false,
          }),
        });
        assert.equal(response.status, 400);
        assert.deepEqual(await response.json(), {
          error: 'hosted_production_metering_not_live',
          reasons: ['live_stripe_api_key_missing'],
        });
      },
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
