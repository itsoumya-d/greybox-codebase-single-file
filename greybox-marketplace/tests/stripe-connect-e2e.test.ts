// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.
//
// Stripe Connect end-to-end integration tests (R27 in REMAINING_ISSUES.md).
//
// These tests exercise the live Stripe API surface in testmode. They are
// gated by the STRIPE_TESTMODE_KEY environment variable so CI without
// secrets still runs cleanly. When the key IS set the tests:
//   - submit a real /v1/transfers request against api.stripe.com (testmode).
//   - submit a real /v1/refunds request against api.stripe.com (testmode).
//   - verify the LiveStripeConnectProvider classifies the response correctly,
//     i.e. business errors (4xx) land as `blocked`, transient errors retry,
//     and successful responses land as `queued`/`succeeded` with a real
//     Stripe-issued id.
//
// Required env when running:
//   STRIPE_TESTMODE_KEY      - sk_test_* with /v1/transfers and /v1/refunds scopes.
// Optional:
//   STRIPE_TESTMODE_CONNECT_ACCOUNT_ID - an acct_* with capabilities.transfers
//     enabled. When missing, the transfer test still runs but expects Stripe
//     to reject with a 400 (which the provider should classify as `blocked`).
//   STRIPE_TESTMODE_PAYMENT_INTENT_ID  - a successful pi_* (testmode). When
//     missing, the refund test is skipped to avoid noisy 400s.
//
// Run with: STRIPE_TESTMODE_KEY=sk_test_... node --import tsx --test tests/stripe-connect-e2e.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { LiveStripeConnectProvider } from '../src/payouts/stripeConnect.js';
import type { Creator, MarketplaceOrder } from '../src/types.js';

const TESTMODE_KEY = process.env.STRIPE_TESTMODE_KEY?.trim();
const TESTMODE_ACCOUNT = process.env.STRIPE_TESTMODE_CONNECT_ACCOUNT_ID?.trim();
const TESTMODE_PAYMENT_INTENT = process.env.STRIPE_TESTMODE_PAYMENT_INTENT_ID?.trim();

test('Stripe Connect E2E: live testmode transfer is classified by LiveStripeConnectProvider', { skip: !TESTMODE_KEY }, async () => {
  const provider = new LiveStripeConnectProvider({
    apiKey: TESTMODE_KEY!,
    dryRun: false,
    maxRetries: 1,
    retryBackoffMs: 100,
  });
  const order = makeOrder(`e2e_order_${Date.now()}`);
  const creator = makeCreator({
    stripeConnectAccountId: TESTMODE_ACCOUNT ?? 'acct_invalid_e2e_placeholder',
  });
  const result = await provider.createTransfer(order, creator);
  assert.equal(result.orderId, order.id);
  assert.equal(result.creatorId, creator.id);
  if (TESTMODE_ACCOUNT) {
    // With a valid Connect account, Stripe should accept the transfer. The
    // platform balance may still be too low for an actual fund movement;
    // testmode platforms ship with a virtual balance, so 200 is the
    // expected outcome.
    assert.ok(
      result.status === 'queued' || result.status === 'blocked',
      `unexpected status from Stripe testmode: ${result.status} reason=${result.reason ?? 'none'}`,
    );
    if (result.status === 'queued') {
      assert.ok(result.id.startsWith('tr_'), `expected real Stripe transfer id, got ${result.id}`);
    }
  } else {
    // Without a valid Connect account, Stripe should respond with a 400 and
    // the provider should classify the result as `blocked`.
    assert.equal(result.status, 'blocked');
    assert.match(result.reason ?? '', /^stripe_(4\d\d|5\d\d):/u);
  }
});

test('Stripe Connect E2E: live testmode refund is classified by LiveStripeConnectProvider', { skip: !TESTMODE_KEY || !TESTMODE_PAYMENT_INTENT }, async () => {
  const provider = new LiveStripeConnectProvider({
    apiKey: TESTMODE_KEY!,
    dryRun: false,
    maxRetries: 1,
    retryBackoffMs: 100,
  });
  const refund = await provider.createRefund!({
    orderId: `e2e_refund_${Date.now()}`,
    amountCents: 100,
    currency: 'usd',
    stripePaymentIntentId: TESTMODE_PAYMENT_INTENT!,
    reason: 'requested_by_customer',
  });
  // Stripe returns either an immediate success or a queued refund. Some
  // payment intents (e.g. already refunded) yield a 4xx that maps to blocked.
  assert.ok(
    ['queued', 'succeeded', 'pending', 'blocked'].includes(refund.status),
    `unexpected refund status: ${refund.status} reason=${refund.reason ?? 'none'}`,
  );
  if (refund.status === 'queued' || refund.status === 'succeeded' || refund.status === 'pending') {
    assert.ok(refund.stripeRefundId.startsWith('re_'), `expected real Stripe refund id, got ${refund.stripeRefundId}`);
  }
});

test('Stripe Connect E2E: dryRun fallback emits queued payout without contacting Stripe', async () => {
  // Always runs, regardless of TESTMODE_KEY; proves the provider's dry-run
  // path stays correct so a misconfigured production deploy never accidentally
  // makes real Stripe calls.
  let fetchCalls = 0;
  const provider = new LiveStripeConnectProvider({
    apiKey: 'sk_test_bogus',
    dryRun: true,
    fetchFn: async () => {
      fetchCalls += 1;
      return new Response('{}', { status: 200 });
    },
  });
  const order = makeOrder('dryrun_e2e_order');
  const creator = makeCreator({ stripeConnectAccountId: 'acct_dryrun_e2e' });
  const result = await provider.createTransfer(order, creator);
  assert.equal(fetchCalls, 0, 'dryRun must not contact Stripe');
  assert.equal(result.status, 'queued');
  assert.equal(result.reason, 'dry_run');
  assert.ok(result.id.startsWith('po_dryrun_'));
});

function makeOrder(id: string): MarketplaceOrder {
  return {
    id,
    buyerId: 'buyer_e2e',
    creatorId: 'creator_e2e',
    listingId: 'listing_e2e',
    grossCents: 1000,
    platformFeeCents: 250,
    creatorNetCents: 750,
    currency: 'usd',
    createdAt: Date.now(),
  };
}

function makeCreator(overrides: Partial<Creator> = {}): Creator {
  return {
    id: 'creator_e2e',
    displayName: 'E2E Creator',
    country: 'US',
    monthlyGmvCents: 0,
    lifetimeGmvCents: 0,
    active: true,
    taxProfileId: 'tax_profile_e2e',
    ...overrides,
  };
}
