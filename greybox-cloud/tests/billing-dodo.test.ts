// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';

import {
  DodoBillingError,
  SUPPORTED_DODO_CURRENCIES,
  buildDodoCheckoutBody,
  createDodoCheckout,
  getDodoCustomerPortal,
  handleDodoWebhook,
  verifyDodoWebhookSignature,
  dodoProductIdFromEnv,
} from '../src/routers/billing-dodo.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWebhookSig(rawBody: string, secret: string): string {
  return createHmac('sha256', secret).update(rawBody).digest('hex');
}

const TEST_SECRET = 'test-dodo-webhook-secret-32-chars';

// ---------------------------------------------------------------------------
// verifyDodoWebhookSignature
// ---------------------------------------------------------------------------

test('verifyDodoWebhookSignature accepts a valid HMAC-SHA256 signature', () => {
  const rawBody = JSON.stringify({ type: 'payment.succeeded', id: 'evt_001' });
  const sig = makeWebhookSig(rawBody, TEST_SECRET);
  assert.doesNotThrow(() =>
    verifyDodoWebhookSignature({ rawBody, signatureHeader: sig, webhookSecret: TEST_SECRET }),
  );
});

test('verifyDodoWebhookSignature rejects an invalid signature', () => {
  const rawBody = JSON.stringify({ type: 'payment.succeeded', id: 'evt_001' });
  assert.throws(
    () => verifyDodoWebhookSignature({ rawBody, signatureHeader: 'badhex00', webhookSecret: TEST_SECRET }),
    (err: unknown) => err instanceof DodoBillingError && err.code === 'dodo_webhook_signature_invalid' && err.status === 400,
  );
});

test('verifyDodoWebhookSignature rejects a missing Dodo-Signature header', () => {
  const rawBody = '{}';
  assert.throws(
    () => verifyDodoWebhookSignature({ rawBody, signatureHeader: undefined, webhookSecret: TEST_SECRET }),
    (err: unknown) => err instanceof DodoBillingError && err.code === 'dodo_webhook_signature_missing',
  );
});

test('verifyDodoWebhookSignature strips sha256= prefix before comparison', () => {
  const rawBody = JSON.stringify({ type: 'subscription.active', id: 'evt_002' });
  const sig = makeWebhookSig(rawBody, TEST_SECRET);
  // Prepend the sha256= prefix — the implementation should strip it and still verify
  assert.doesNotThrow(() =>
    verifyDodoWebhookSignature({ rawBody, signatureHeader: `sha256=${sig}`, webhookSecret: TEST_SECRET }),
  );
});

test('verifyDodoWebhookSignature rejects an empty webhook secret', () => {
  assert.throws(
    () => verifyDodoWebhookSignature({ rawBody: '{}', signatureHeader: 'abc', webhookSecret: '' }),
    (err: unknown) => err instanceof DodoBillingError && err.code === 'dodo_webhook_secret_missing',
  );
});

// ---------------------------------------------------------------------------
// createDodoCheckout (dry-run)
// ---------------------------------------------------------------------------

test('createDodoCheckout returns a dry-run result when DODO_API_KEY is absent', async () => {
  const result = await createDodoCheckout(
    { tenantId: 'tenant-dd-1', tier: 'indie', productId: 'prod_indie_test' },
    { apiKey: undefined },
  );
  assert.equal(result.dryRun, true);
  assert.ok(result.checkoutUrl.includes('dryrun'));
  assert.ok(result.sessionId.includes('dryrun'));
  assert.equal(result.tier, 'indie');
});

test('createDodoCheckout uses the mock fetch when provided', async () => {
  const mockFetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      checkout_url: 'https://checkout.dodopayments.com/session/sess_live001',
      id: 'sess_live001',
    }),
  });
  const result = await createDodoCheckout(
    { tenantId: 'tenant-dd-2', tier: 'studio', productId: 'prod_studio_test' },
    { apiKey: 'dodo_test_key', fetchFn: mockFetch as never },
  );
  assert.equal(result.dryRun, false);
  assert.equal(result.sessionId, 'sess_live001');
  assert.equal(result.tier, 'studio');
});

// ---------------------------------------------------------------------------
// getDodoCustomerPortal (dry-run)
// ---------------------------------------------------------------------------

test('getDodoCustomerPortal returns a dry-run result when DODO_API_KEY is absent', async () => {
  const result = await getDodoCustomerPortal(
    { tenantId: 'tenant-dd-3' },
    { apiKey: undefined },
  );
  assert.equal(result.dryRun, true);
  assert.ok(result.portalUrl.includes('dryrun'));
  assert.equal(result.tenantId, 'tenant-dd-3');
});

test('getDodoCustomerPortal uses the mock fetch when provided', async () => {
  const mockFetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ portal_url: 'https://billing.dodopayments.com/portal/tenant-dd-4' }),
  });
  const result = await getDodoCustomerPortal(
    { tenantId: 'tenant-dd-4' },
    { apiKey: 'dodo_test_key', fetchFn: mockFetch as never },
  );
  assert.equal(result.dryRun, false);
  assert.ok(result.portalUrl.includes('tenant-dd-4'));
  assert.equal(result.tenantId, 'tenant-dd-4');
});

// ---------------------------------------------------------------------------
// handleDodoWebhook
// ---------------------------------------------------------------------------

function paymentSucceededBody(subscriptionId = 'sub_dodo_001', tenantId = 'tenant-dd-5'): string {
  return JSON.stringify({
    id: 'evt_dodo_001',
    type: 'payment.succeeded',
    data: {
      subscription_id: subscriptionId,
      metadata: {
        greybox_tenant_id: tenantId,
        greybox_plan_tier: 'indie',
      },
    },
  });
}

test('handleDodoWebhook accepts a valid webhook and returns correct shape', async () => {
  const rawBody = paymentSucceededBody();
  const sig = makeWebhookSig(rawBody, TEST_SECRET);
  const result = await handleDodoWebhook({
    rawBody,
    signatureHeader: sig,
    webhookSecret: TEST_SECRET,
  });
  assert.equal(result.ok, true);
  assert.equal(result.received, true);
  assert.equal(result.verified, true);
  assert.equal(result.eventType, 'payment.succeeded');
  assert.equal(result.subscriptionId, 'sub_dodo_001');
});

test('handleDodoWebhook rejects an invalid signature', async () => {
  const rawBody = paymentSucceededBody();
  await assert.rejects(
    () => handleDodoWebhook({ rawBody, signatureHeader: 'bad', webhookSecret: TEST_SECRET }),
    (err: unknown) => err instanceof DodoBillingError && err.code === 'dodo_webhook_signature_invalid',
  );
});

test('handleDodoWebhook throws 503 when webhook secret is missing', async () => {
  const rawBody = paymentSucceededBody();
  const sig = makeWebhookSig(rawBody, TEST_SECRET);
  await assert.rejects(
    () => handleDodoWebhook({ rawBody, signatureHeader: sig, webhookSecret: '' }),
    (err: unknown) => err instanceof DodoBillingError && err.code === 'dodo_webhook_secret_missing' && err.status === 503,
  );
});

test('handleDodoWebhook is idempotent: re-processing same raw body produces same result', async () => {
  const rawBody = paymentSucceededBody('sub_dodo_002', 'tenant-dd-6');
  const sig = makeWebhookSig(rawBody, TEST_SECRET);
  const opts = { rawBody, signatureHeader: sig, webhookSecret: TEST_SECRET };
  const first = await handleDodoWebhook(opts);
  const second = await handleDodoWebhook(opts);
  assert.deepEqual(first, second);
});

// ---------------------------------------------------------------------------
// dodoProductIdFromEnv
// ---------------------------------------------------------------------------

test('dodoProductIdFromEnv reads DODO_PRODUCT_INDIE from env', () => {
  assert.equal(dodoProductIdFromEnv('indie', { DODO_PRODUCT_INDIE: 'prod_indie_test' }), 'prod_indie_test');
});

test('dodoProductIdFromEnv reads DODO_PRODUCT_STUDIO from env', () => {
  assert.equal(dodoProductIdFromEnv('studio', { DODO_PRODUCT_STUDIO: 'prod_studio_test' }), 'prod_studio_test');
});

test('dodoProductIdFromEnv returns undefined when env var is absent', () => {
  assert.equal(dodoProductIdFromEnv('indie', {}), undefined);
});

// ---------------------------------------------------------------------------
// parseDodoWebhookEvent — field variant coverage via handleDodoWebhook
// ---------------------------------------------------------------------------

test('parseDodoWebhookEvent handles event_type field variant (legacy)', async () => {
  const rawBody = JSON.stringify({
    id: 'evt_legacy_001',
    event_type: 'subscription.active',
    data: {
      id: 'sub_legacy_001',
      metadata: {
        greybox_tenant_id: 'tenant-dd-7',
        greybox_plan_tier: 'studio',
      },
    },
  });
  const sig = makeWebhookSig(rawBody, TEST_SECRET);
  const result = await handleDodoWebhook({ rawBody, signatureHeader: sig, webhookSecret: TEST_SECRET });
  assert.equal(result.eventType, 'subscription.active');
  assert.equal(result.subscriptionId, 'sub_legacy_001');
  assert.equal(result.tenantId, 'tenant-dd-7');
});

test('parseDodoWebhookEvent handles payload field variant (legacy)', async () => {
  const rawBody = JSON.stringify({
    id: 'evt_legacy_002',
    type: 'subscription.cancelled',
    payload: {
      subscription_id: 'sub_legacy_002',
      metadata: {
        greybox_tenant_id: 'tenant-dd-8',
        greybox_plan_tier: 'indie',
      },
    },
  });
  const sig = makeWebhookSig(rawBody, TEST_SECRET);
  const result = await handleDodoWebhook({ rawBody, signatureHeader: sig, webhookSecret: TEST_SECRET });
  assert.equal(result.eventType, 'subscription.cancelled');
  assert.equal(result.subscriptionId, 'sub_legacy_002');
  assert.equal(result.tenantId, 'tenant-dd-8');
});

// ---------------------------------------------------------------------------
// buildDodoCheckoutBody
// ---------------------------------------------------------------------------

test('buildDodoCheckoutBody includes required Dodo fields', () => {
  const body = buildDodoCheckoutBody({
    tenantId: 'tenant-dd-9',
    tier: 'studio',
    productId: 'prod_studio_test',
  });
  assert.equal(body.product_id, 'prod_studio_test');
  assert.equal(body.quantity, 1);
  assert.equal((body.metadata as Record<string, string>).greybox_tenant_id, 'tenant-dd-9');
  assert.equal((body.metadata as Record<string, string>).greybox_plan_tier, 'studio');
});

test('buildDodoCheckoutBody throws when productId is missing', () => {
  assert.throws(
    () => buildDodoCheckoutBody({ tenantId: 'tenant-dd-10', tier: 'indie', productId: '' }),
    (err: unknown) => err instanceof DodoBillingError && err.code === 'dodo_product_id_missing',
  );
});

test('buildDodoCheckoutBody defaults currency to USD when not provided', () => {
  const body = buildDodoCheckoutBody({ tenantId: 'tenant-dd-11', tier: 'indie', productId: 'prod_x' });
  assert.equal(body.currency, 'USD');
});

test('buildDodoCheckoutBody accepts supported currencies', () => {
  for (const currency of SUPPORTED_DODO_CURRENCIES) {
    const body = buildDodoCheckoutBody({ tenantId: 'tenant-dd-12', tier: 'indie', productId: 'prod_x', currency });
    assert.equal(body.currency, currency);
  }
});

test('buildDodoCheckoutBody falls back to USD for unsupported currency', () => {
  const body = buildDodoCheckoutBody({ tenantId: 'tenant-dd-13', tier: 'indie', productId: 'prod_x', currency: 'JPY' });
  assert.equal(body.currency, 'USD');
});

test('handleDodoWebhook returns tier extracted from metadata', async () => {
  const rawBody = JSON.stringify({
    id: 'evt_tier_001',
    type: 'payment.succeeded',
    data: {
      subscription_id: 'sub_tier_001',
      metadata: { greybox_tenant_id: 'tenant-dd-14', greybox_plan_tier: 'studio' },
    },
  });
  const sig = makeWebhookSig(rawBody, TEST_SECRET);
  const result = await handleDodoWebhook({ rawBody, signatureHeader: sig, webhookSecret: TEST_SECRET });
  assert.equal(result.tier, 'studio');
});

test('handleDodoWebhook parses subscription.renewed event type', async () => {
  const rawBody = JSON.stringify({
    id: 'evt_renew_001',
    type: 'subscription.renewed',
    data: {
      subscription_id: 'sub_renew_001',
      metadata: { greybox_tenant_id: 'tenant-dd-15', greybox_plan_tier: 'indie' },
    },
  });
  const sig = makeWebhookSig(rawBody, TEST_SECRET);
  const result = await handleDodoWebhook({ rawBody, signatureHeader: sig, webhookSecret: TEST_SECRET });
  assert.equal(result.eventType, 'subscription.renewed');
  assert.equal(result.subscriptionId, 'sub_renew_001');
});
