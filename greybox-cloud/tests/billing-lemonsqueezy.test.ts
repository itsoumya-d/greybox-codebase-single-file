// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';

import {
  LemonSqueezyBillingError,
  createLemonSqueezyCheckout,
  getLemonSqueezyCustomerPortalUrl,
  handleLemonSqueezyWebhook,
  lemonSqueezyVariantIdFromEnv,
  verifyLemonSqueezyWebhookSignature,
} from '../src/routers/billing-lemonsqueezy.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWebhookSig(rawBody: string, secret: string): string {
  return createHmac('sha256', secret).update(rawBody).digest('hex');
}

const TEST_SECRET = 'test-ls-webhook-secret-32-chars!!';

// ---------------------------------------------------------------------------
// verifyLemonSqueezyWebhookSignature
// ---------------------------------------------------------------------------

test('verifyLemonSqueezyWebhookSignature accepts a valid HMAC-SHA256 signature', () => {
  const rawBody = JSON.stringify({ meta: { event_name: 'subscription_created' }, data: { id: 'sub_001' } });
  const sig = makeWebhookSig(rawBody, TEST_SECRET);
  assert.doesNotThrow(() =>
    verifyLemonSqueezyWebhookSignature({ rawBody, signatureHeader: sig, webhookSecret: TEST_SECRET }),
  );
});

test('verifyLemonSqueezyWebhookSignature rejects an invalid signature', () => {
  const rawBody = JSON.stringify({ meta: { event_name: 'subscription_created' }, data: { id: 'sub_001' } });
  const badSig = 'a'.repeat(64); // wrong but valid hex length
  assert.throws(
    () => verifyLemonSqueezyWebhookSignature({ rawBody, signatureHeader: badSig, webhookSecret: TEST_SECRET }),
    (err: unknown) => err instanceof LemonSqueezyBillingError && err.code === 'ls_webhook_signature_invalid' && err.status === 400,
  );
});

test('verifyLemonSqueezyWebhookSignature rejects a missing X-Signature header', () => {
  const rawBody = '{}';
  assert.throws(
    () => verifyLemonSqueezyWebhookSignature({ rawBody, signatureHeader: undefined, webhookSecret: TEST_SECRET }),
    (err: unknown) => err instanceof LemonSqueezyBillingError && err.code === 'ls_webhook_signature_missing' && err.status === 400,
  );
});

test('verifyLemonSqueezyWebhookSignature rejects an empty webhook secret', () => {
  assert.throws(
    () => verifyLemonSqueezyWebhookSignature({ rawBody: '{}', signatureHeader: 'abc', webhookSecret: '' }),
    (err: unknown) => err instanceof LemonSqueezyBillingError && err.code === 'ls_webhook_secret_missing' && err.status === 503,
  );
});

// ---------------------------------------------------------------------------
// handleLemonSqueezyWebhook
// ---------------------------------------------------------------------------

function subscriptionCreatedBody(subscriptionId = 'sub_ls_001', tenantId = 'tenant-ls-1'): string {
  return JSON.stringify({
    meta: {
      event_name: 'subscription_created',
      custom_data: {
        greybox_tenant_id: tenantId,
        greybox_plan_tier: 'indie',
      },
    },
    data: {
      id: subscriptionId,
    },
  });
}

test('handleLemonSqueezyWebhook accepts a valid webhook and returns correct shape', async () => {
  const rawBody = subscriptionCreatedBody();
  const sig = makeWebhookSig(rawBody, TEST_SECRET);
  const result = await handleLemonSqueezyWebhook({
    rawBody,
    signatureHeader: sig,
    webhookSecret: TEST_SECRET,
  });
  assert.equal(result.ok, true);
  assert.equal(result.received, true);
  assert.equal(result.verified, true);
  assert.equal(result.eventType, 'subscription_created');
  assert.equal(result.subscriptionId, 'sub_ls_001');
  assert.equal(result.tenantId, 'tenant-ls-1');
});

test('handleLemonSqueezyWebhook parses eventId as eventType:subscriptionId', async () => {
  const rawBody = subscriptionCreatedBody('sub_ls_002', 'tenant-ls-2');
  const sig = makeWebhookSig(rawBody, TEST_SECRET);
  const result = await handleLemonSqueezyWebhook({
    rawBody,
    signatureHeader: sig,
    webhookSecret: TEST_SECRET,
  });
  assert.equal(result.eventId, 'subscription_created:sub_ls_002');
});

test('handleLemonSqueezyWebhook rejects an invalid signature', async () => {
  const rawBody = subscriptionCreatedBody();
  await assert.rejects(
    () => handleLemonSqueezyWebhook({ rawBody, signatureHeader: 'bad', webhookSecret: TEST_SECRET }),
    (err: unknown) => err instanceof LemonSqueezyBillingError && err.code === 'ls_webhook_signature_invalid',
  );
});

test('handleLemonSqueezyWebhook throws 503 when webhook secret is missing', async () => {
  const rawBody = subscriptionCreatedBody();
  const sig = makeWebhookSig(rawBody, TEST_SECRET);
  await assert.rejects(
    () => handleLemonSqueezyWebhook({ rawBody, signatureHeader: sig, webhookSecret: '' }),
    (err: unknown) => err instanceof LemonSqueezyBillingError && err.code === 'ls_webhook_secret_missing' && err.status === 503,
  );
});

test('handleLemonSqueezyWebhook is idempotent: re-processing same raw body produces same result', async () => {
  const rawBody = subscriptionCreatedBody('sub_ls_003', 'tenant-ls-3');
  const sig = makeWebhookSig(rawBody, TEST_SECRET);
  const opts = { rawBody, signatureHeader: sig, webhookSecret: TEST_SECRET };
  const first = await handleLemonSqueezyWebhook(opts);
  const second = await handleLemonSqueezyWebhook(opts);
  assert.deepEqual(first, second);
});

test('handleLemonSqueezyWebhook rejects payload without meta.event_name', async () => {
  const rawBody = JSON.stringify({ meta: {}, data: { id: 'sub_ls_004' } });
  const sig = makeWebhookSig(rawBody, TEST_SECRET);
  await assert.rejects(
    () => handleLemonSqueezyWebhook({ rawBody, signatureHeader: sig, webhookSecret: TEST_SECRET }),
    (err: unknown) => err instanceof LemonSqueezyBillingError && err.code === 'ls_webhook_event_invalid',
  );
});

// ---------------------------------------------------------------------------
// createLemonSqueezyCheckout (dry-run and live)
// ---------------------------------------------------------------------------

test('createLemonSqueezyCheckout returns a dry-run result when API key is absent', async () => {
  const result = await createLemonSqueezyCheckout(
    {
      tenantId: 'tenant-ls-5',
      tier: 'indie',
      storeId: 'store_123',
      variantId: 'variant_indie_test',
    },
    { apiKey: undefined },
  );
  assert.equal(result.dryRun, true);
  assert.ok(result.checkoutUrl.includes('variant_indie_test'));
  assert.equal(result.variantId, 'variant_indie_test');
  assert.equal(result.tier, 'indie');
});

test('createLemonSqueezyCheckout uses the mock fetch when API key is provided', async () => {
  const mockFetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      data: {
        attributes: {
          url: 'https://checkout.lemonsqueezy.com/checkout/buy/variant_studio_test?checkout=live_001',
        },
      },
    }),
  });
  const result = await createLemonSqueezyCheckout(
    {
      tenantId: 'tenant-ls-6',
      tier: 'studio',
      storeId: 'store_123',
      variantId: 'variant_studio_test',
    },
    { apiKey: 'ls_test_key', fetchFn: mockFetch as never },
  );
  assert.equal(result.dryRun, false);
  assert.ok(result.checkoutUrl.includes('variant_studio_test'));
  assert.equal(result.variantId, 'variant_studio_test');
  assert.equal(result.tier, 'studio');
});

test('createLemonSqueezyCheckout throws when API returns missing checkout URL', async () => {
  const mockFetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ data: { attributes: {} } }),
  });
  await assert.rejects(
    () =>
      createLemonSqueezyCheckout(
        { tenantId: 'tenant-ls-7', tier: 'indie', storeId: 'store_123', variantId: 'variant_indie_test' },
        { apiKey: 'ls_test_key', fetchFn: mockFetch as never },
      ),
    (err: unknown) => err instanceof LemonSqueezyBillingError && err.code === 'ls_checkout_url_missing' && err.status === 502,
  );
});

test('createLemonSqueezyCheckout throws ls_api_error on non-ok response', async () => {
  const mockFetch = async () => ({
    ok: false,
    status: 422,
    text: async () => 'Unprocessable Entity',
    json: async () => ({}),
  });
  await assert.rejects(
    () =>
      createLemonSqueezyCheckout(
        { tenantId: 'tenant-ls-8', tier: 'studio', storeId: 'store_123', variantId: 'variant_studio_test' },
        { apiKey: 'ls_test_key', fetchFn: mockFetch as never },
      ),
    (err: unknown) => err instanceof LemonSqueezyBillingError && err.code === 'ls_api_error',
  );
});

// ---------------------------------------------------------------------------
// getLemonSqueezyCustomerPortalUrl
// ---------------------------------------------------------------------------

test('getLemonSqueezyCustomerPortalUrl returns correct URL with custom subdomain', () => {
  const result = getLemonSqueezyCustomerPortalUrl({
    tenantId: 'tenant-ls-9',
    storeSubdomain: 'greybox',
  });
  assert.equal(result.portalUrl, 'https://greybox.lemonsqueezy.com/billing');
  assert.equal(result.tenantId, 'tenant-ls-9');
  assert.equal(result.dryRun, false);
});

test('getLemonSqueezyCustomerPortalUrl sets dryRun true when no subdomain given', () => {
  const result = getLemonSqueezyCustomerPortalUrl({ tenantId: 'tenant-ls-10' });
  assert.equal(result.dryRun, true);
  assert.ok(result.portalUrl.includes('lemonsqueezy.com/billing'));
  assert.equal(result.tenantId, 'tenant-ls-10');
});

test('getLemonSqueezyCustomerPortalUrl uses app subdomain as default when none provided', () => {
  const result = getLemonSqueezyCustomerPortalUrl({ tenantId: 'tenant-ls-11' });
  assert.equal(result.portalUrl, 'https://app.lemonsqueezy.com/billing');
});

// ---------------------------------------------------------------------------
// lemonSqueezyVariantIdFromEnv
// ---------------------------------------------------------------------------

test('lemonSqueezyVariantIdFromEnv reads LEMON_SQUEEZY_VARIANT_ID_INDIE from env', () => {
  assert.equal(
    lemonSqueezyVariantIdFromEnv('indie', { LEMON_SQUEEZY_VARIANT_ID_INDIE: 'var_indie_test' }),
    'var_indie_test',
  );
});

test('lemonSqueezyVariantIdFromEnv reads LEMON_SQUEEZY_VARIANT_ID_STUDIO from env', () => {
  assert.equal(
    lemonSqueezyVariantIdFromEnv('studio', { LEMON_SQUEEZY_VARIANT_ID_STUDIO: 'var_studio_test' }),
    'var_studio_test',
  );
});

test('lemonSqueezyVariantIdFromEnv returns undefined when env var is absent', () => {
  assert.equal(lemonSqueezyVariantIdFromEnv('indie', {}), undefined);
});
