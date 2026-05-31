// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';

import {
  RazorpayBillingError,
  buildRazorpaySubscriptionBody,
  buildRazorpayPortalUrl,
  createRazorpaySubscription,
  getRazorpaySubscriptionLive,
  handleRazorpayWebhook,
  processRazorpayVerifyPayment,
  verifyRazorpayPaymentSignature,
  verifyRazorpayWebhookSignature,
  buildRazorpaySubscriptionStatus,
  razorpayPlanIdFromEnv,
} from '../src/routers/billing-razorpay.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWebhookSig(rawBody: string, secret: string): string {
  return createHmac('sha256', secret).update(rawBody).digest('hex');
}

function makePaymentSig(paymentId: string, subscriptionId: string, secret: string): string {
  return createHmac('sha256', secret).update(`${paymentId}|${subscriptionId}`).digest('hex');
}

const TEST_SECRET = 'test-webhook-secret-32-chars-longg';
const TEST_PAYMENT_SECRET = 'test-key-secret-32-chars-longgggg';

// ---------------------------------------------------------------------------
// verifyRazorpayWebhookSignature
// ---------------------------------------------------------------------------

test('verifyRazorpayWebhookSignature accepts a valid HMAC-SHA256 signature', () => {
  const rawBody = JSON.stringify({ event: 'subscription.charged', created_at: 1234567890 });
  const sig = makeWebhookSig(rawBody, TEST_SECRET);
  assert.doesNotThrow(() =>
    verifyRazorpayWebhookSignature({ rawBody, signatureHeader: sig, webhookSecret: TEST_SECRET }),
  );
});

test('verifyRazorpayWebhookSignature rejects an invalid signature', () => {
  const rawBody = JSON.stringify({ event: 'subscription.charged', created_at: 1234567890 });
  assert.throws(
    () => verifyRazorpayWebhookSignature({ rawBody, signatureHeader: 'badhex00', webhookSecret: TEST_SECRET }),
    (err: unknown) => err instanceof RazorpayBillingError && err.code === 'razorpay_webhook_signature_invalid' && err.status === 400,
  );
});

test('verifyRazorpayWebhookSignature rejects a missing signature header', () => {
  const rawBody = '{}';
  assert.throws(
    () => verifyRazorpayWebhookSignature({ rawBody, signatureHeader: undefined, webhookSecret: TEST_SECRET }),
    (err: unknown) => err instanceof RazorpayBillingError && err.code === 'razorpay_webhook_signature_missing',
  );
});

test('verifyRazorpayWebhookSignature rejects an empty webhook secret', () => {
  assert.throws(
    () => verifyRazorpayWebhookSignature({ rawBody: '{}', signatureHeader: 'abc', webhookSecret: '' }),
    (err: unknown) => err instanceof RazorpayBillingError && err.code === 'razorpay_webhook_secret_missing',
  );
});

// ---------------------------------------------------------------------------
// verifyRazorpayPaymentSignature
// ---------------------------------------------------------------------------

test('verifyRazorpayPaymentSignature accepts a valid payment signature', () => {
  const paymentId = 'pay_abc123';
  const subscriptionId = 'sub_xyz789';
  const sig = makePaymentSig(paymentId, subscriptionId, TEST_PAYMENT_SECRET);
  assert.doesNotThrow(() =>
    verifyRazorpayPaymentSignature({ paymentId, subscriptionId, signature: sig, keySecret: TEST_PAYMENT_SECRET }),
  );
});

test('verifyRazorpayPaymentSignature rejects an invalid signature', () => {
  assert.throws(
    () =>
      verifyRazorpayPaymentSignature({
        paymentId: 'pay_abc123',
        subscriptionId: 'sub_xyz789',
        signature: 'a'.repeat(64),
        keySecret: TEST_PAYMENT_SECRET,
      }),
    (err: unknown) => err instanceof RazorpayBillingError && err.code === 'razorpay_signature_invalid',
  );
});

// ---------------------------------------------------------------------------
// processRazorpayVerifyPayment
// ---------------------------------------------------------------------------

test('processRazorpayVerifyPayment returns verified result on valid signature', () => {
  const paymentId = 'pay_test001';
  const subscriptionId = 'sub_test001';
  const sig = makePaymentSig(paymentId, subscriptionId, TEST_PAYMENT_SECRET);
  const result = processRazorpayVerifyPayment({
    tenantId: 'tenant-in-1',
    tier: 'indie',
    razorpay_payment_id: paymentId,
    razorpay_subscription_id: subscriptionId,
    razorpay_signature: sig,
    keySecret: TEST_PAYMENT_SECRET,
  });
  assert.equal(result.ok, true);
  assert.equal(result.verified, true);
  assert.equal(result.tenantId, 'tenant-in-1');
  assert.equal(result.tier, 'indie');
  assert.equal(result.paymentId, paymentId);
  assert.equal(result.subscriptionId, subscriptionId);
});

test('processRazorpayVerifyPayment rejects missing fields', () => {
  assert.throws(
    () =>
      processRazorpayVerifyPayment({
        tenantId: 'tenant-in-1',
        tier: 'indie',
        razorpay_payment_id: '',
        razorpay_subscription_id: '',
        razorpay_signature: '',
        keySecret: TEST_PAYMENT_SECRET,
      }),
    (err: unknown) => err instanceof RazorpayBillingError && err.code === 'razorpay_verify_fields_missing',
  );
});

// ---------------------------------------------------------------------------
// handleRazorpayWebhook
// ---------------------------------------------------------------------------

function subscriptionChargedBody(subscriptionId = 'sub_001', tenantId = 'tenant-in-2'): string {
  return JSON.stringify({
    event: 'subscription.charged',
    created_at: Math.floor(Date.now() / 1000) - 30,
    payload: {
      subscription: {
        entity: {
          id: subscriptionId,
          notes: {
            greybox_tenant_id: tenantId,
            greybox_plan_tier: 'indie',
          },
        },
      },
    },
  });
}

test('handleRazorpayWebhook accepts a valid webhook and returns correct shape', async () => {
  const rawBody = subscriptionChargedBody();
  const sig = makeWebhookSig(rawBody, TEST_SECRET);
  const result = await handleRazorpayWebhook({
    rawBody,
    signatureHeader: sig,
    webhookSecret: TEST_SECRET,
  });
  assert.equal(result.ok, true);
  assert.equal(result.received, true);
  assert.equal(result.verified, true);
  assert.equal(result.eventType, 'subscription.charged');
  assert.equal(result.subscriptionId, 'sub_001');
});

test('handleRazorpayWebhook rejects an invalid signature', async () => {
  const rawBody = subscriptionChargedBody();
  await assert.rejects(
    () => handleRazorpayWebhook({ rawBody, signatureHeader: 'bad', webhookSecret: TEST_SECRET }),
    (err: unknown) => err instanceof RazorpayBillingError && err.code === 'razorpay_webhook_signature_invalid',
  );
});

test('handleRazorpayWebhook throws when webhook secret is missing', async () => {
  const rawBody = subscriptionChargedBody();
  const sig = makeWebhookSig(rawBody, TEST_SECRET);
  await assert.rejects(
    () => handleRazorpayWebhook({ rawBody, signatureHeader: sig, webhookSecret: '' }),
    (err: unknown) => err instanceof RazorpayBillingError && err.code === 'razorpay_webhook_secret_missing',
  );
});

test('handleRazorpayWebhook is idempotent: re-processing same raw body produces same result', async () => {
  const rawBody = subscriptionChargedBody('sub_002', 'tenant-in-3');
  const sig = makeWebhookSig(rawBody, TEST_SECRET);
  const opts = { rawBody, signatureHeader: sig, webhookSecret: TEST_SECRET };
  const first = await handleRazorpayWebhook(opts);
  const second = await handleRazorpayWebhook(opts);
  assert.deepEqual(first, second);
});

// ---------------------------------------------------------------------------
// buildRazorpaySubscriptionBody
// ---------------------------------------------------------------------------

test('buildRazorpaySubscriptionBody includes required Razorpay fields', () => {
  const body = buildRazorpaySubscriptionBody({
    tenantId: 'tenant-in-4',
    tier: 'studio',
    planId: 'plan_studio_test',
  });
  assert.equal(body.plan_id, 'plan_studio_test');
  assert.ok(typeof body.total_count === 'number' && (body.total_count as number) > 0);
  assert.equal((body.notes as Record<string, string>).greybox_tenant_id, 'tenant-in-4');
  assert.equal((body.notes as Record<string, string>).greybox_plan_tier, 'studio');
});

test('buildRazorpaySubscriptionBody throws when planId is missing', () => {
  assert.throws(
    () => buildRazorpaySubscriptionBody({ tenantId: 'tenant-in-5', tier: 'indie', planId: '' }),
    (err: unknown) => err instanceof RazorpayBillingError && err.code === 'razorpay_plan_id_missing',
  );
});

// ---------------------------------------------------------------------------
// createRazorpaySubscription (dry-run)
// ---------------------------------------------------------------------------

test('createRazorpaySubscription returns a dry-run result when credentials are absent', async () => {
  const result = await createRazorpaySubscription(
    { tenantId: 'tenant-in-6', tier: 'indie', planId: 'plan_indie_test' },
    { keyId: undefined, keySecret: undefined },
  );
  assert.equal(result.dryRun, true);
  assert.ok(result.subscriptionId.includes('dryrun'));
  assert.equal(result.tier, 'indie');
  assert.ok(result.amount > 0);
  assert.equal(result.currency, 'INR');
});

test('createRazorpaySubscription uses the mock fetch when provided', async () => {
  const mockFetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ id: 'sub_live_test001', short_url: 'https://rzp.io/s/sub_live_test001' }),
  });
  const result = await createRazorpaySubscription(
    { tenantId: 'tenant-in-7', tier: 'studio', planId: 'plan_studio_test' },
    { keyId: 'rzp_test_key', keySecret: 'rzp_test_secret', fetchFn: mockFetch as never },
  );
  assert.equal(result.dryRun, false);
  assert.equal(result.subscriptionId, 'sub_live_test001');
  assert.equal(result.tier, 'studio');
});

// ---------------------------------------------------------------------------
// buildRazorpaySubscriptionStatus
// ---------------------------------------------------------------------------

test('buildRazorpaySubscriptionStatus returns null when no subscriptionId is present', () => {
  const status = buildRazorpaySubscriptionStatus({ tenantId: 'tenant-in-8', tier: 'free' });
  assert.equal(status.subscriptionId, null);
  assert.equal(status.status, null);
  assert.equal(status.provider, 'razorpay');
});

test('buildRazorpaySubscriptionStatus returns active when subscriptionId is set', () => {
  const status = buildRazorpaySubscriptionStatus({
    tenantId: 'tenant-in-9',
    tier: 'indie',
    subscriptionId: 'sub_abc',
  });
  assert.equal(status.subscriptionId, 'sub_abc');
  assert.equal(status.status, 'active');
});

// ---------------------------------------------------------------------------
// razorpayPlanIdFromEnv
// ---------------------------------------------------------------------------

test('razorpayPlanIdFromEnv reads RAZORPAY_PLAN_INDIE from env', () => {
  assert.equal(razorpayPlanIdFromEnv('indie', { RAZORPAY_PLAN_INDIE: 'plan_indie_test' }), 'plan_indie_test');
});

test('razorpayPlanIdFromEnv reads RAZORPAY_PLAN_STUDIO from env', () => {
  assert.equal(razorpayPlanIdFromEnv('studio', { RAZORPAY_PLAN_STUDIO: 'plan_studio_test' }), 'plan_studio_test');
});

test('razorpayPlanIdFromEnv returns undefined when env var is absent', () => {
  assert.equal(razorpayPlanIdFromEnv('indie', {}), undefined);
});

// ---------------------------------------------------------------------------
// handleRazorpayWebhook — replay protection
// ---------------------------------------------------------------------------

function makeStaleWebhookBody(subscriptionId = 'sub_001', tenantId = 'tenant-in-2'): string {
  // created_at is well over 5 minutes in the past
  const staleTs = Math.floor(Date.now() / 1000) - 600;
  return JSON.stringify({
    event: 'subscription.charged',
    created_at: staleTs,
    payload: {
      subscription: {
        entity: {
          id: subscriptionId,
          notes: {
            greybox_tenant_id: tenantId,
            greybox_plan_tier: 'indie',
          },
        },
      },
    },
  });
}

function makeFreshWebhookBody(subscriptionId = 'sub_001', tenantId = 'tenant-in-2'): string {
  const freshTs = Math.floor(Date.now() / 1000) - 30;
  return JSON.stringify({
    event: 'subscription.charged',
    created_at: freshTs,
    payload: {
      subscription: {
        entity: {
          id: subscriptionId,
          notes: {
            greybox_tenant_id: tenantId,
            greybox_plan_tier: 'indie',
          },
        },
      },
    },
  });
}

test('handleRazorpayWebhook rejects a stale webhook (replay protection)', async () => {
  const rawBody = makeStaleWebhookBody();
  const sig = makeWebhookSig(rawBody, TEST_SECRET);
  await assert.rejects(
    () => handleRazorpayWebhook({ rawBody, signatureHeader: sig, webhookSecret: TEST_SECRET }),
    (err: unknown) => err instanceof RazorpayBillingError && err.code === 'razorpay_webhook_replay' && err.status === 400,
  );
});

test('handleRazorpayWebhook accepts a fresh webhook (replay protection allows recent events)', async () => {
  const rawBody = makeFreshWebhookBody();
  const sig = makeWebhookSig(rawBody, TEST_SECRET);
  const result = await handleRazorpayWebhook({ rawBody, signatureHeader: sig, webhookSecret: TEST_SECRET });
  assert.equal(result.ok, true);
  assert.equal(result.verified, true);
});

// ---------------------------------------------------------------------------
// getRazorpaySubscriptionLive
// ---------------------------------------------------------------------------

test('getRazorpaySubscriptionLive throws razorpay_credentials_missing when credentials are absent', async () => {
  await assert.rejects(
    () => getRazorpaySubscriptionLive('sub_123', { keyId: undefined, keySecret: undefined }),
    (err: unknown) => err instanceof RazorpayBillingError && err.code === 'razorpay_credentials_missing' && err.status === 503,
  );
});

test('getRazorpaySubscriptionLive returns the live subscription when fetch succeeds', async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ id: 'sub_123', status: 'active' }) } as Response);
  try {
    const result = await getRazorpaySubscriptionLive('sub_123', { keyId: 'rzp_key', keySecret: 'rzp_secret' });
    assert.equal(result.id, 'sub_123');
    assert.equal(result.status, 'active');
  } finally {
    globalThis.fetch = origFetch;
  }
});

// ---------------------------------------------------------------------------
// buildRazorpaySubscriptionBody — GST notes
// ---------------------------------------------------------------------------

test('buildRazorpaySubscriptionBody includes GST metadata in notes', () => {
  const body = buildRazorpaySubscriptionBody({ tenantId: 'tenant-in-1', tier: 'indie', planId: 'plan_indie_test' });
  const notes = body.notes as Record<string, unknown>;
  assert.equal(notes.gst_included, 'true');
  assert.equal(notes.gst_rate, '18%');
  assert.equal(notes.country, 'IN');
  assert.equal(notes.greybox_tenant_id, 'tenant-in-1');
  assert.equal(notes.greybox_plan_tier, 'indie');
});

// ---------------------------------------------------------------------------
// buildRazorpayPortalUrl
// ---------------------------------------------------------------------------

test('buildRazorpayPortalUrl returns dry-run URL when keyId is absent', () => {
  const result = buildRazorpayPortalUrl({ tenantId: 'tenant-in-1' });
  assert.equal(result.dryRun, true);
  assert.ok(result.portalUrl.includes('tenant-in-1'));
  assert.equal(result.subscriptionId, null);
});

test('buildRazorpayPortalUrl returns subscription shortlink when keyId and subscriptionId are present', () => {
  const result = buildRazorpayPortalUrl({ tenantId: 'tenant-in-1', subscriptionId: 'sub_abc123', keyId: 'rzp_live_key' });
  assert.equal(result.dryRun, false);
  assert.ok(result.portalUrl.includes('sub_abc123'));
  assert.equal(result.subscriptionId, 'sub_abc123');
});

test('buildRazorpayPortalUrl returns fallback URL when keyId is set but subscriptionId is absent', () => {
  const result = buildRazorpayPortalUrl({ tenantId: 'tenant-in-1', keyId: 'rzp_live_key' });
  assert.equal(result.dryRun, false);
  assert.ok(result.portalUrl.startsWith('https://'));
  assert.equal(result.subscriptionId, null);
});
