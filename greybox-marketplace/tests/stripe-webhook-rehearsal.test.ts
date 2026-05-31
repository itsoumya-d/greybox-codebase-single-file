// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import test from 'node:test';
import { runStripeWebhookRehearsal } from '../src/cli/stripeWebhookRehearsal.js';

test('Stripe webhook rehearsal proves signed refund and dispute handling without leaking secrets', async () => {
  const report = await runStripeWebhookRehearsal({
    nowMs: Date.parse('2026-05-25T12:00:00.000Z'),
  });

  assert.equal(report.generatedAt, '2026-05-25T12:00:00.000Z');
  assert.equal(report.ok, true);
  assert.equal(report.summary.checkoutFulfilled, true);
  assert.equal(report.summary.badSignatureRejected, true);
  assert.equal(report.summary.disputeWebhookAccepted, true);
  assert.equal(report.summary.disputeReplayIdempotent, true);
  assert.equal(report.summary.disputeCloseWebhookAccepted, true);
  assert.equal(report.summary.disputeCloseUpdatesExisting, true);
  assert.equal(report.summary.refundWebhookAccepted, true);
  assert.equal(report.summary.refundReplayIdempotent, true);
  assert.equal(report.summary.wrongRouteIgnored, true);
  assert.equal(report.summary.riskReserveReady, true);
  assert.equal(report.summary.wonDisputeExcludedFromReserve, true);
  assert.equal(report.summary.refundIncludedInReserve, true);
  assert.equal(report.summary.riskEventsForOrder, 2);
  assert.equal(report.summary.stripeDisputeEvents, 3);
  assert.equal(report.summary.stripeRefundEvents, 2);
  assert.equal(report.summary.ignoredStripeEvents, 1);
  assert.ok(report.checks.length >= 10);
  assert.deepEqual([...new Set(report.checks.map((check) => check.status))], ['pass']);

  const serialized = JSON.stringify(report);
  assert.doesNotMatch(
    serialized,
    /gb_mkt_|whsec_|pi_|cs_|ch_|dp_|re_|acct_|buyer-rehearsal|creator-rehearsal/u,
  );
});
