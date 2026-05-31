// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { pathToFileURL } from 'node:url';
import type { Server } from 'node:http';
import { startMarketplaceServer } from '../api/server.js';
import { stripeWebhookSignatureHeader } from '../safety/stripeProduction.js';
import type {
  MarketplaceCheckoutFulfillmentResult,
  MarketplaceCheckoutPlan,
  MarketplaceListing,
  MarketplaceRiskEvent,
  MarketplaceRiskReserveReport,
} from '../types.js';

const ADMIN_TOKEN = 'gb_mkt_rehearsal_admin_0123456789abcdef0123456789';
const WEBHOOK_SECRET = 'whsec_greyboxMarketplaceRehearsal0123456789abcdef';
const REHEARSAL_NOW_MS = Date.parse('2026-05-25T12:00:00.000Z');

export interface StripeWebhookRehearsalCheck {
  id: string;
  status: 'pass' | 'fail';
  detail: string;
}

export interface StripeWebhookRehearsalReport {
  generatedAt: string;
  ok: boolean;
  summary: {
    checkoutFulfilled: boolean;
    badSignatureRejected: boolean;
    disputeWebhookAccepted: boolean;
    disputeReplayIdempotent: boolean;
    disputeCloseWebhookAccepted: boolean;
    disputeCloseUpdatesExisting: boolean;
    refundWebhookAccepted: boolean;
    refundReplayIdempotent: boolean;
    wrongRouteIgnored: boolean;
    riskReserveReady: boolean;
    wonDisputeExcludedFromReserve: boolean;
    refundIncludedInReserve: boolean;
    riskEventsForOrder: number;
    stripeDisputeEvents: number;
    stripeRefundEvents: number;
    ignoredStripeEvents: number;
  };
  checks: StripeWebhookRehearsalCheck[];
}

interface ApiResult<T> {
  status: number;
  body: T;
}

interface ListingResponse {
  listing: MarketplaceListing;
}

interface CheckoutPlanResponse {
  plan: MarketplaceCheckoutPlan;
}

interface CheckoutFulfillmentResponse {
  result: MarketplaceCheckoutFulfillmentResult;
}

interface RiskEventResponse {
  riskEvent: MarketplaceRiskEvent;
}

interface RiskEventsResponse {
  riskEvents: MarketplaceRiskEvent[];
}

interface RiskReserveResponse {
  report: MarketplaceRiskReserveReport;
}

export async function runStripeWebhookRehearsal(options: {
  nowMs?: number;
} = {}): Promise<StripeWebhookRehearsalReport> {
  const nowMs = options.nowMs ?? REHEARSAL_NOW_MS;
  const timestampSeconds = Math.floor(nowMs / 1000);
  const started = await startMarketplaceServer({
    adminToken: ADMIN_TOKEN,
    clock: { now: () => nowMs },
    env: { GREYBOX_MARKETPLACE_STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET },
  });
  try {
    await api<{ creator: unknown }>(started.url, '/v1/marketplace/creators', {
      method: 'POST',
      body: JSON.stringify({
        id: 'creator-rehearsal',
        displayName: 'Greybox Rehearsal Creator',
        country: 'US',
        stripeConnectAccountId: 'acct_rehearsal_creator',
        stripeConnectOnboardingComplete: true,
        stripeConnectTransfersEnabled: true,
        taxProfileId: 'tax_rehearsal_creator',
        monthlyGmvCents: 0,
        lifetimeGmvCents: 0,
        active: true,
      }),
    });

    const listing = await api<ListingResponse>(started.url, '/v1/marketplace/listings', {
      method: 'POST',
      body: JSON.stringify({
        creatorId: 'creator-rehearsal',
        title: 'Webhook Rehearsal Template',
        description: 'AI-assisted staging listing for signed refund and dispute webhook rehearsal.',
        category: 'template',
        priceCents: 4_900,
        licenseSummary: 'Commercial studio license.',
      }),
    });

    const plan = await api<CheckoutPlanResponse>(started.url, '/v1/marketplace/checkout/session-plan', {
      method: 'POST',
      body: JSON.stringify({
        listingId: listing.body.listing.id,
        buyerId: 'buyer-rehearsal',
        successUrl: 'https://greybox.studio/marketplace/success',
        cancelUrl: 'https://greybox.studio/marketplace/cancel',
      }),
    });
    const checkoutRequest = plan.body.plan.checkoutSessionRequest;
    if (!checkoutRequest) throw new Error('checkout plan did not produce a Stripe session request');

    const fulfillment = await api<CheckoutFulfillmentResponse>(started.url, '/v1/marketplace/checkout/fulfill', {
      method: 'POST',
      body: JSON.stringify({
        id: 'evt_checkout_rehearsal',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_rehearsal_marketplace',
            object: 'checkout.session',
            mode: 'payment',
            payment_status: 'paid',
            client_reference_id: checkoutRequest.body.metadata.greybox_checkout_reference,
            currency: 'usd',
            amount_subtotal: 4_900,
            amount_total: 4_900,
            payment_intent: 'pi_rehearsal_marketplace',
            metadata: checkoutRequest.body.metadata,
            automatic_tax: {
              enabled: true,
              status: 'complete',
              liability: { type: 'account', account: 'acct_rehearsal_creator' },
            },
            total_details: { amount_tax: 0 },
            customer_details: { address: { country: 'US', postal_code: '10001' } },
          },
        },
      }),
    });
    const order = fulfillment.body.result.order;

    const disputeEvent = {
      id: 'evt_rehearsal_dispute',
      type: 'charge.dispute.created',
      data: {
        object: {
          id: 'dp_rehearsal_marketplace',
          object: 'dispute',
          amount: order.grossCents,
          status: 'needs_response',
          payment_intent: 'pi_rehearsal_marketplace',
          metadata: { greybox_order_id: order.id },
        },
      },
    };
    const badSignature = await postSignedStripeEvent<{ error: unknown }>(
      started.url,
      '/v1/marketplace/stripe-events/dispute',
      disputeEvent,
      timestampSeconds,
      'whsec_wrongRehearsalSecret0123456789abcdef',
    );
    const dispute = await postSignedStripeEvent<RiskEventResponse>(
      started.url,
      '/v1/marketplace/stripe-events/dispute',
      disputeEvent,
      timestampSeconds,
    );
    const disputeReplay = await postSignedStripeEvent<RiskEventResponse>(
      started.url,
      '/v1/marketplace/stripe-events/dispute',
      disputeEvent,
      timestampSeconds,
    );
    const disputeClosed = await postSignedStripeEvent<RiskEventResponse>(
      started.url,
      '/v1/marketplace/stripe-events/dispute',
      {
        ...disputeEvent,
        id: 'evt_rehearsal_dispute_closed',
        type: 'charge.dispute.closed',
        data: {
          object: {
            ...disputeEvent.data.object,
            status: 'won',
          },
        },
      },
      timestampSeconds,
    );

    const refundEvent = {
      id: 'evt_rehearsal_refund',
      type: 'charge.refunded',
      data: {
        object: {
          id: 'ch_rehearsal_marketplace',
          object: 'charge',
          payment_intent: 'pi_rehearsal_marketplace',
          refunds: {
            data: [
              { id: 're_rehearsal_old', amount: 500, created: 1_700 },
              { id: 're_rehearsal_new', amount: 1_000, created: 1_800 },
            ],
          },
        },
      },
    };
    const refund = await postSignedStripeEvent<RiskEventResponse>(
      started.url,
      '/v1/marketplace/stripe-events/refund',
      refundEvent,
      timestampSeconds,
    );
    const refundReplay = await postSignedStripeEvent<RiskEventResponse>(
      started.url,
      '/v1/marketplace/stripe-events/refund',
      refundEvent,
      timestampSeconds,
    );
    const wrongRoute = await postSignedStripeEvent<{ ignored: boolean; reason: string }>(
      started.url,
      '/v1/marketplace/stripe-events/refund',
      disputeEvent,
      timestampSeconds,
    );
    const riskEvents = await api<RiskEventsResponse>(
      started.url,
      `/v1/marketplace/risk-events?orderId=${encodeURIComponent(order.id)}`,
    );
    const riskReserve = await api<RiskReserveResponse>(
      started.url,
      [
        '/v1/marketplace/risk-reserve',
        '?availableReserveCents=100000',
        '&minimumReserveCents=0',
        '&maximumRefundRateBps=10000',
        '&maximumDisputeRateBps=10000',
      ].join(''),
    );
    const metrics = await api<Record<string, unknown>>(started.url, '/metrics');

    return buildReport({
      nowMs,
      fulfillment,
      badSignature,
      dispute,
      disputeReplay,
      disputeClosed,
      refund,
      refundReplay,
      wrongRoute,
      riskEvents,
      riskReserve,
      metrics: metrics.body,
    });
  } finally {
    await closeServer(started.server);
  }
}

function buildReport(input: {
  nowMs: number;
  fulfillment: ApiResult<CheckoutFulfillmentResponse>;
  badSignature: ApiResult<{ error: unknown }>;
  dispute: ApiResult<RiskEventResponse>;
  disputeReplay: ApiResult<RiskEventResponse>;
  disputeClosed: ApiResult<RiskEventResponse>;
  refund: ApiResult<RiskEventResponse>;
  refundReplay: ApiResult<RiskEventResponse>;
  wrongRoute: ApiResult<{ ignored: boolean; reason: string }>;
  riskEvents: ApiResult<RiskEventsResponse>;
  riskReserve: ApiResult<RiskReserveResponse>;
  metrics: Record<string, unknown>;
}): StripeWebhookRehearsalReport {
  const checks: StripeWebhookRehearsalCheck[] = [
    passFail('checkout-fulfilled', input.fulfillment.status === 201, `HTTP ${input.fulfillment.status}`),
    passFail('bad-signature-rejected', input.badSignature.status === 401, `HTTP ${input.badSignature.status}`),
    passFail(
      'dispute-webhook-accepted',
      input.dispute.status === 201 && input.dispute.body.riskEvent.type === 'dispute',
      `HTTP ${input.dispute.status}`,
    ),
    passFail(
      'dispute-replay-idempotent',
      input.disputeReplay.status === 201
        && input.disputeReplay.body.riskEvent.id === input.dispute.body.riskEvent.id,
      `HTTP ${input.disputeReplay.status}`,
    ),
    passFail(
      'dispute-close-webhook-accepted',
      input.disputeClosed.status === 201
        && input.disputeClosed.body.riskEvent.type === 'dispute'
        && input.disputeClosed.body.riskEvent.status === 'won',
      `HTTP ${input.disputeClosed.status}`,
    ),
    passFail(
      'dispute-close-updates-existing',
      input.disputeClosed.status === 201
        && input.disputeClosed.body.riskEvent.id === input.dispute.body.riskEvent.id,
      `HTTP ${input.disputeClosed.status}`,
    ),
    passFail(
      'refund-webhook-accepted',
      input.refund.status === 201 && input.refund.body.riskEvent.type === 'refund',
      `HTTP ${input.refund.status}`,
    ),
    passFail(
      'refund-replay-idempotent',
      input.refundReplay.status === 201
        && input.refundReplay.body.riskEvent.id === input.refund.body.riskEvent.id,
      `HTTP ${input.refundReplay.status}`,
    ),
    passFail(
      'wrong-route-ignored',
      input.wrongRoute.status === 202
        && input.wrongRoute.body.ignored === true
        && input.wrongRoute.body.reason === 'wrong_stripe_event_route',
      `HTTP ${input.wrongRoute.status}`,
    ),
    passFail(
      'risk-reserve-after-webhooks',
      input.riskReserve.status === 200
        && input.riskReserve.body.report.ready === true
        && input.riskReserve.body.report.summary.recordedDisputeCents === 0
        && input.riskReserve.body.report.summary.recordedRefundsCents === 1_000,
      `HTTP ${input.riskReserve.status}`,
    ),
    passFail('risk-ledger-count', input.riskEvents.body.riskEvents.length === 2, `${input.riskEvents.body.riskEvents.length} risk event(s)`),
    passFail('metrics-count-dispute', metricValue(input.metrics, 'stripe_event.dispute') === 3, `${metricValue(input.metrics, 'stripe_event.dispute')}`),
    passFail('metrics-count-refund', metricValue(input.metrics, 'stripe_event.refund') === 2, `${metricValue(input.metrics, 'stripe_event.refund')}`),
    passFail('metrics-count-ignored', metricValue(input.metrics, 'stripe_event.ignored') === 1, `${metricValue(input.metrics, 'stripe_event.ignored')}`),
  ];
  return {
    generatedAt: new Date(input.nowMs).toISOString(),
    ok: checks.every((check) => check.status === 'pass'),
    summary: {
      checkoutFulfilled: input.fulfillment.status === 201,
      badSignatureRejected: input.badSignature.status === 401,
      disputeWebhookAccepted: input.dispute.status === 201,
      disputeReplayIdempotent: input.disputeReplay.body.riskEvent.id === input.dispute.body.riskEvent.id,
      disputeCloseWebhookAccepted: input.disputeClosed.status === 201,
      disputeCloseUpdatesExisting: input.disputeClosed.body.riskEvent.id === input.dispute.body.riskEvent.id,
      refundWebhookAccepted: input.refund.status === 201,
      refundReplayIdempotent: input.refundReplay.body.riskEvent.id === input.refund.body.riskEvent.id,
      wrongRouteIgnored: input.wrongRoute.status === 202 && input.wrongRoute.body.ignored === true,
      riskReserveReady: input.riskReserve.status === 200 && input.riskReserve.body.report.ready === true,
      wonDisputeExcludedFromReserve: input.riskReserve.body.report.summary.recordedDisputeCents === 0,
      refundIncludedInReserve: input.riskReserve.body.report.summary.recordedRefundsCents === 1_000,
      riskEventsForOrder: input.riskEvents.body.riskEvents.length,
      stripeDisputeEvents: metricValue(input.metrics, 'stripe_event.dispute'),
      stripeRefundEvents: metricValue(input.metrics, 'stripe_event.refund'),
      ignoredStripeEvents: metricValue(input.metrics, 'stripe_event.ignored'),
    },
    checks,
  };
}

function passFail(id: string, passed: boolean, detail: string): StripeWebhookRehearsalCheck {
  return { id, status: passed ? 'pass' : 'fail', detail };
}

function metricValue(metrics: Record<string, unknown>, key: string): number {
  const value = metrics[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

async function postSignedStripeEvent<T>(
  baseUrl: string,
  path: string,
  event: unknown,
  timestampSeconds: number,
  signingSecret = WEBHOOK_SECRET,
): Promise<ApiResult<T>> {
  const body = JSON.stringify(event);
  return api<T>(baseUrl, path, {
    method: 'POST',
    headers: {
      'Stripe-Signature': stripeWebhookSignatureHeader({
        payload: body,
        secret: signingSecret,
        timestampSeconds,
      }),
    },
    body,
  });
}

async function api<T>(baseUrl: string, path: string, init: RequestInit = {}): Promise<ApiResult<T>> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${ADMIN_TOKEN}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
  return {
    status: response.status,
    body: await response.json() as T,
  };
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function isMain(): boolean {
  const entry = process.argv[1];
  return Boolean(entry && import.meta.url === pathToFileURL(entry).href);
}

if (isMain()) {
  runStripeWebhookRehearsal()
    .then((report) => {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      process.exitCode = report.ok ? 0 : 1;
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'unknown rehearsal failure';
      process.stderr.write(`${message}\n`);
      process.exitCode = 1;
    });
}
