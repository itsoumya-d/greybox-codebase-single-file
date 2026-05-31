// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { createHmac, timingSafeEqual } from 'node:crypto';

import type { PlanTier } from '../types.js';

// ---------------------------------------------------------------------------
// Error class (mirrors BillingWebhookError pattern from billing.ts)
// ---------------------------------------------------------------------------

export class RazorpayBillingError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message = code,
  ) {
    super(message);
    this.name = 'RazorpayBillingError';
  }
}

// ---------------------------------------------------------------------------
// Public response shapes
// ---------------------------------------------------------------------------

export interface RazorpayCreateSubscriptionResult {
  subscriptionId: string;
  shortUrl: string;
  amount: number;
  currency: string;
  tier: 'indie' | 'studio';
  dryRun: boolean;
}

export interface RazorpayVerifyPaymentResult {
  ok: true;
  verified: true;
  subscriptionId: string;
  paymentId: string;
  tenantId: string;
  tier: 'indie' | 'studio';
}

export interface RazorpaySubscriptionStatusResult {
  tenantId: string;
  subscriptionId: string | null;
  status: string | null;
  tier: PlanTier;
  provider: 'razorpay';
}

export interface RazorpayWebhookHandleResult {
  ok: true;
  received: true;
  verified: true;
  eventId: string;
  eventType: string;
  subscriptionId?: string;
  tenantId?: string;
}

// ---------------------------------------------------------------------------
// Internal API call helpers
// ---------------------------------------------------------------------------

const RAZORPAY_BASE_URL = 'https://api.razorpay.com/v1';

// Plan amounts in paise (INR). GST-inclusive at 18%. Used only for
// metadata/display; the actual billing amount is set on the Razorpay plan
// object in the dashboard and must match these values.
const PLAN_AMOUNT_PAISE: Record<'indie' | 'studio', number> = {
  indie: 1_999_00,  // ₹1999/mo GST-inclusive
  studio: 4_999_00, // ₹4999/mo GST-inclusive
};

export interface RazorpayApiConfig {
  keyId?: string;
  keySecret?: string;
  fetchFn?: RazorpayFetch;
}

export type RazorpayFetch = (
  url: string,
  init: {
    method: 'POST' | 'GET';
    headers: Record<string, string>;
    body?: string;
  },
) => Promise<Pick<Response, 'ok' | 'status' | 'json'>>;

function razorpayBasicAuth(keyId: string, keySecret: string): string {
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`;
}

async function razorpayPost(
  path: string,
  body: Record<string, unknown>,
  config: RazorpayApiConfig,
): Promise<Record<string, unknown>> {
  const keyId = config.keyId?.trim();
  const keySecret = config.keySecret?.trim();
  if (!keyId || !keySecret) {
    throw new RazorpayBillingError('razorpay_credentials_missing', 503, 'Razorpay credentials are not configured');
  }
  const fetchFn = config.fetchFn ?? (fetch as unknown as RazorpayFetch);
  const url = `${RAZORPAY_BASE_URL}${path}`;
  const response = await fetchFn(url, {
    method: 'POST',
    headers: {
      authorization: razorpayBasicAuth(keyId, keySecret),
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new RazorpayBillingError(
      `razorpay_api_${response.status}`,
      502,
      `Razorpay API returned status ${response.status}`,
    );
  }
  return (await response.json()) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Create subscription
// ---------------------------------------------------------------------------

export interface RazorpayCreateSubscriptionInput {
  tenantId: string;
  tier: 'indie' | 'studio';
  planId: string;
  customerEmail?: string;
  customerContact?: string;
  totalBillingCycles?: number;
}

export function buildRazorpaySubscriptionBody(input: RazorpayCreateSubscriptionInput): Record<string, unknown> {
  if (!input.planId) throw new RazorpayBillingError('razorpay_plan_id_missing', 503, 'Razorpay plan id is not configured');
  if (!input.tenantId) throw new RazorpayBillingError('razorpay_tenant_id_missing', 400, 'tenantId is required');

  const body: Record<string, unknown> = {
    plan_id: input.planId,
    total_count: input.totalBillingCycles ?? 120, // 10 years max; Razorpay requires a finite count
    quantity: 1,
    notes: {
      greybox_tenant_id: input.tenantId,
      greybox_plan_tier: input.tier,
      gst_included: 'true',
      gst_rate: '18%',
      country: 'IN',
    },
  };
  if (input.customerEmail || input.customerContact) {
    body.notify_info = {
      ...(input.customerEmail ? { notify_email: input.customerEmail } : {}),
      ...(input.customerContact ? { notify_phone: input.customerContact } : {}),
    };
  }
  return body;
}

export async function createRazorpaySubscription(
  input: RazorpayCreateSubscriptionInput,
  config: RazorpayApiConfig,
): Promise<RazorpayCreateSubscriptionResult> {
  const keyId = config.keyId?.trim();
  const keySecret = config.keySecret?.trim();

  // Dry-run when credentials not configured
  if (!keyId || !keySecret) {
    return {
      subscriptionId: `sub_dryrun_${input.tenantId}_${input.tier}`,
      shortUrl: `https://rzp.io/dryrun/${input.tenantId}`,
      amount: PLAN_AMOUNT_PAISE[input.tier],
      currency: 'INR',
      tier: input.tier,
      dryRun: true,
    };
  }

  const body = buildRazorpaySubscriptionBody(input);
  const result = await razorpayPost('/subscriptions', body, config);

  const subscriptionId = typeof result.id === 'string' ? result.id.trim() : '';
  const shortUrl = typeof result.short_url === 'string' ? result.short_url.trim() : '';
  if (!subscriptionId) {
    throw new RazorpayBillingError('razorpay_malformed_response', 502, 'Razorpay response was missing subscription id');
  }

  return {
    subscriptionId,
    shortUrl: shortUrl || `https://rzp.io/s/${subscriptionId}`,
    amount: PLAN_AMOUNT_PAISE[input.tier],
    currency: 'INR',
    tier: input.tier,
    dryRun: false,
  };
}

// ---------------------------------------------------------------------------
// Verify payment signature
// ---------------------------------------------------------------------------

export interface RazorpayVerifyPaymentInput {
  tenantId: string;
  tier: 'indie' | 'studio';
  razorpay_payment_id: string;
  razorpay_subscription_id: string;
  razorpay_signature: string;
  keySecret?: string;
}

/**
 * Verifies the Razorpay payment signature after hosted checkout.
 * Razorpay signs: HMAC-SHA256(payment_id + "|" + subscription_id, key_secret)
 */
export function verifyRazorpayPaymentSignature(input: {
  paymentId: string;
  subscriptionId: string;
  signature: string;
  keySecret: string;
}): void {
  const secret = input.keySecret.trim();
  if (!secret) {
    throw new RazorpayBillingError('razorpay_key_secret_missing', 503, 'Razorpay key secret is not configured');
  }
  const signedPayload = `${input.paymentId}|${input.subscriptionId}`;
  const expected = createHmac('sha256', secret).update(signedPayload).digest('hex');
  const actual = input.signature.toLowerCase();
  const hexRe = /^[0-9a-f]{64}$/i;
  if (!hexRe.test(actual)) {
    throw new RazorpayBillingError('razorpay_signature_invalid', 400, 'Razorpay payment signature verification failed');
  }
  const expectedBuf = Buffer.from(expected, 'hex');
  const actualBuf = Buffer.from(actual, 'hex');
  if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) {
    throw new RazorpayBillingError('razorpay_signature_invalid', 400, 'Razorpay payment signature verification failed');
  }
}

export function processRazorpayVerifyPayment(
  input: RazorpayVerifyPaymentInput,
): RazorpayVerifyPaymentResult {
  if (!input.razorpay_payment_id || !input.razorpay_subscription_id || !input.razorpay_signature) {
    throw new RazorpayBillingError('razorpay_verify_fields_missing', 400, 'razorpay_payment_id, razorpay_subscription_id, and razorpay_signature are required');
  }
  const keySecret = input.keySecret?.trim();
  if (!keySecret) {
    throw new RazorpayBillingError('razorpay_key_secret_missing', 503, 'Razorpay key secret is not configured');
  }
  verifyRazorpayPaymentSignature({
    paymentId: input.razorpay_payment_id,
    subscriptionId: input.razorpay_subscription_id,
    signature: input.razorpay_signature,
    keySecret,
  });
  return {
    ok: true,
    verified: true,
    subscriptionId: input.razorpay_subscription_id,
    paymentId: input.razorpay_payment_id,
    tenantId: input.tenantId,
    tier: input.tier,
  };
}

// ---------------------------------------------------------------------------
// Webhook verification and handling
// ---------------------------------------------------------------------------

/**
 * Verifies a Razorpay webhook HMAC-SHA256 signature.
 * Razorpay sends the signature in the X-Razorpay-Signature header.
 * The signed payload is the raw request body.
 */
export function verifyRazorpayWebhookSignature(input: {
  rawBody: string;
  signatureHeader?: string | null;
  webhookSecret: string;
}): void {
  const secret = input.webhookSecret.trim();
  if (!secret) {
    throw new RazorpayBillingError('razorpay_webhook_secret_missing', 503, 'Razorpay webhook secret is not configured');
  }
  const signature = input.signatureHeader?.trim();
  if (!signature) {
    throw new RazorpayBillingError('razorpay_webhook_signature_missing', 400, 'X-Razorpay-Signature header is required');
  }
  const hexRe = /^[0-9a-f]{64}$/i;
  if (!hexRe.test(signature)) {
    throw new RazorpayBillingError('razorpay_webhook_signature_invalid', 400, 'Razorpay webhook signature verification failed');
  }
  const expected = createHmac('sha256', secret).update(input.rawBody).digest('hex');
  const expectedBuf = Buffer.from(expected, 'hex');
  const actualBuf = Buffer.from(signature.toLowerCase(), 'hex');
  if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) {
    throw new RazorpayBillingError('razorpay_webhook_signature_invalid', 400, 'Razorpay webhook signature verification failed');
  }
}

export type RazorpayWebhookEventType =
  | 'subscription.charged'
  | 'subscription.halted'
  | 'subscription.cancelled'
  | string;

export interface RazorpayWebhookHandleOptions {
  rawBody: string;
  signatureHeader?: string | null;
  webhookSecret?: string;
  requestId?: string;
}

function parseRazorpayWebhookEvent(rawBody: string): {
  eventId: string;
  eventType: RazorpayWebhookEventType;
  subscriptionId?: string;
  tenantId?: string;
  tier?: string;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw new RazorpayBillingError('razorpay_webhook_payload_invalid', 400, 'Razorpay webhook payload must be valid JSON');
  }
  if (!isRecord(parsed)) {
    throw new RazorpayBillingError('razorpay_webhook_payload_invalid', 400, 'Razorpay webhook payload must be an object');
  }
  const eventId = typeof parsed.event === 'string' && typeof parsed.created_at === 'number'
    ? `${parsed.event}:${parsed.created_at}`
    : typeof parsed.payload === 'object' && isRecord(parsed.payload)
      ? JSON.stringify(parsed.event)
      : 'unknown';
  const eventType = typeof parsed.event === 'string' ? parsed.event.trim() : '';
  if (!eventType) {
    throw new RazorpayBillingError('razorpay_webhook_event_invalid', 400, 'Razorpay webhook event type is required');
  }

  // Extract subscription id from nested payload
  let subscriptionId: string | undefined;
  let tenantId: string | undefined;
  let tier: string | undefined;
  if (isRecord(parsed.payload)) {
    const subPayload = parsed.payload.subscription;
    if (isRecord(subPayload) && isRecord(subPayload.entity)) {
      const entity = subPayload.entity;
      subscriptionId = typeof entity.id === 'string' ? entity.id.trim() : undefined;
      const notes = isRecord(entity.notes) ? entity.notes : {};
      tenantId = typeof notes.greybox_tenant_id === 'string' ? notes.greybox_tenant_id.trim() : undefined;
      const VALID_TIERS = new Set(['indie', 'studio']);
      const rawTier = typeof notes.greybox_plan_tier === 'string' ? notes.greybox_plan_tier.trim() : undefined;
      tier = rawTier && VALID_TIERS.has(rawTier) ? rawTier : undefined;
    }
  }

  return { eventId, eventType, subscriptionId, tenantId, tier };
}

export async function handleRazorpayWebhook(
  options: RazorpayWebhookHandleOptions,
): Promise<RazorpayWebhookHandleResult> {
  const secret = options.webhookSecret?.trim();
  if (!secret) {
    throw new RazorpayBillingError('razorpay_webhook_secret_missing', 503, 'Razorpay webhook secret is not configured');
  }
  verifyRazorpayWebhookSignature({
    rawBody: options.rawBody,
    signatureHeader: options.signatureHeader,
    webhookSecret: secret,
  });
  // Replay protection: reject events older than 5 minutes
  try {
    const parsedTs = JSON.parse(options.rawBody) as { created_at?: unknown };
    if (typeof parsedTs.created_at === 'number' && Date.now() / 1000 - parsedTs.created_at > 300) {
      throw new RazorpayBillingError('razorpay_webhook_replay', 400, 'Webhook event timestamp is too old');
    }
  } catch (err) {
    if (err instanceof RazorpayBillingError) throw err;
    // If JSON.parse fails here, parseRazorpayWebhookEvent will handle the error below
  }
  const event = parseRazorpayWebhookEvent(options.rawBody);
  return {
    ok: true,
    received: true,
    verified: true,
    eventId: event.eventId,
    eventType: event.eventType,
    ...(event.subscriptionId ? { subscriptionId: event.subscriptionId } : {}),
    ...(event.tenantId ? { tenantId: event.tenantId } : {}),
  };
}

// ---------------------------------------------------------------------------
// Subscription status (informational)
// ---------------------------------------------------------------------------

export interface RazorpaySubscriptionStatusInput {
  tenantId: string;
  tier: PlanTier;
  subscriptionId?: string | null;
}

/**
 * Returns the locally-cached subscription status for a tenant.
 * NOTE: This reflects whether a subscription ID is stored locally, NOT the live
 * Razorpay subscription state. The status field should not be used for access control
 * without a live Razorpay API check.
 */
export function buildRazorpaySubscriptionStatus(
  input: RazorpaySubscriptionStatusInput,
): RazorpaySubscriptionStatusResult {
  return {
    tenantId: input.tenantId,
    subscriptionId: input.subscriptionId ?? null,
    status: input.subscriptionId ? 'active' : null,
    tier: input.tier,
    provider: 'razorpay',
  };
}

// ---------------------------------------------------------------------------
// Live subscription status (via Razorpay API)
// ---------------------------------------------------------------------------

export interface RazorpayLiveSubscriptionStatus {
  id: string;
  status: string;
  current_start?: number | null;
  current_end?: number | null;
  ended_at?: number | null;
}

export async function getRazorpaySubscriptionLive(
  subscriptionId: string,
  credentials: { keyId?: string; keySecret?: string },
): Promise<RazorpayLiveSubscriptionStatus> {
  const keyId = credentials.keyId?.trim();
  const keySecret = credentials.keySecret?.trim();
  if (!keyId || !keySecret) {
    throw new RazorpayBillingError('razorpay_credentials_missing', 503, 'Razorpay API credentials are not configured');
  }
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
  const resp = await fetch(`https://api.razorpay.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new RazorpayBillingError('razorpay_api_error', resp.status, `Razorpay API error: ${text.slice(0, 200)}`);
  }
  return resp.json() as Promise<RazorpayLiveSubscriptionStatus>;
}

// ---------------------------------------------------------------------------
// Portal URL
// ---------------------------------------------------------------------------

export interface RazorpayPortalUrlResult {
  portalUrl: string;
  subscriptionId: string | null;
  dryRun: boolean;
}

/**
 * Returns a URL where the customer can view/manage their Razorpay subscription.
 * Razorpay does not have a hosted billing portal; rzp.io/s/{id} is the
 * subscription management shortlink returned at subscription creation time.
 */
export function buildRazorpayPortalUrl(input: {
  tenantId: string;
  subscriptionId?: string | null;
  keyId?: string;
}): RazorpayPortalUrlResult {
  const keyId = input.keyId?.trim();
  const subscriptionId = input.subscriptionId?.trim() ?? null;
  if (!keyId) {
    return {
      portalUrl: `https://rzp.io/dryrun/${input.tenantId}`,
      subscriptionId,
      dryRun: true,
    };
  }
  const portalUrl = subscriptionId
    ? `https://rzp.io/s/${subscriptionId}`
    : 'https://dashboard.razorpay.com/app/subscriptions';
  return { portalUrl, subscriptionId, dryRun: false };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function razorpayPlanIdFromEnv(
  tier: 'indie' | 'studio',
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  return tier === 'indie' ? env.RAZORPAY_PLAN_INDIE?.trim() : env.RAZORPAY_PLAN_STUDIO?.trim();
}
