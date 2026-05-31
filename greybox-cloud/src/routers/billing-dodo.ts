// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { createHmac, timingSafeEqual } from 'node:crypto';

import type { PlanTier } from '../types.js';

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class DodoBillingError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message = code,
  ) {
    super(message);
    this.name = 'DodoBillingError';
  }
}

// ---------------------------------------------------------------------------
// Public response shapes
// ---------------------------------------------------------------------------

export interface DodoCreateCheckoutResult {
  checkoutUrl: string;
  sessionId: string;
  tier: 'indie' | 'studio';
  dryRun: boolean;
}

export interface DodoCustomerPortalResult {
  portalUrl: string;
  tenantId: string;
  dryRun: boolean;
}

export interface DodoWebhookHandleResult {
  ok: true;
  received: true;
  verified: true;
  eventId: string;
  eventType: string;
  subscriptionId?: string;
  tenantId?: string;
  tier?: string;
}

export const SUPPORTED_DODO_CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD'] as const;
export type DodoCurrency = (typeof SUPPORTED_DODO_CURRENCIES)[number];

// ---------------------------------------------------------------------------
// Dodo API helpers
// ---------------------------------------------------------------------------

const DODO_BASE_URL = 'https://api.dodopayments.com';

export type DodoFetch = (
  url: string,
  init: {
    method: 'POST' | 'GET';
    headers: Record<string, string>;
    body?: string;
  },
) => Promise<Pick<Response, 'ok' | 'status' | 'json'>>;

export interface DodoApiConfig {
  apiKey?: string;
  fetchFn?: DodoFetch;
}

async function dodoPost(
  path: string,
  body: Record<string, unknown>,
  config: DodoApiConfig,
): Promise<Record<string, unknown>> {
  const apiKey = config.apiKey?.trim();
  if (!apiKey) {
    throw new DodoBillingError('dodo_api_key_missing', 503, 'Dodo Payments API key is not configured');
  }
  const fetchFn = config.fetchFn ?? (fetch as unknown as DodoFetch);
  const url = `${DODO_BASE_URL}${path}`;
  const response = await fetchFn(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new DodoBillingError(
      `dodo_api_${response.status}`,
      502,
      `Dodo Payments API returned status ${response.status}`,
    );
  }
  return (await response.json()) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Create checkout session
// ---------------------------------------------------------------------------

export interface DodoCreateCheckoutInput {
  tenantId: string;
  tier: 'indie' | 'studio';
  productId: string;
  currency?: string;
  successUrl?: string;
  cancelUrl?: string;
  customerEmail?: string;
}

export function buildDodoCheckoutBody(input: DodoCreateCheckoutInput): Record<string, unknown> {
  if (!input.productId) {
    throw new DodoBillingError('dodo_product_id_missing', 503, 'Dodo product id is not configured');
  }
  if (!input.tenantId) {
    throw new DodoBillingError('dodo_tenant_id_missing', 400, 'tenantId is required');
  }
  const rawCurrency = input.currency?.trim().toUpperCase();
  const currency: DodoCurrency = (rawCurrency && (SUPPORTED_DODO_CURRENCIES as readonly string[]).includes(rawCurrency))
    ? rawCurrency as DodoCurrency
    : 'USD';
  return {
    product_id: input.productId,
    quantity: 1,
    currency,
    metadata: {
      greybox_tenant_id: input.tenantId,
      greybox_plan_tier: input.tier,
    },
    ...(input.successUrl ? { success_url: input.successUrl } : {}),
    ...(input.cancelUrl ? { cancel_url: input.cancelUrl } : {}),
    ...(input.customerEmail ? { customer_email: input.customerEmail } : {}),
    // Dodo handles tax/VAT globally as Merchant of Record
    tax_inclusive: true,
  };
}

export async function createDodoCheckout(
  input: DodoCreateCheckoutInput,
  config: DodoApiConfig,
): Promise<DodoCreateCheckoutResult> {
  const apiKey = config.apiKey?.trim();

  // Dry-run when credentials not configured
  if (!apiKey) {
    return {
      checkoutUrl: `https://checkout.dodopayments.com/dryrun/${input.tenantId}`,
      sessionId: `dodo_dryrun_${input.tenantId}_${input.tier}`,
      tier: input.tier,
      dryRun: true,
    };
  }

  const body = buildDodoCheckoutBody(input);
  const result = await dodoPost('/payments/checkout', body, config);

  const checkoutUrl = typeof result.checkout_url === 'string' ? result.checkout_url.trim() : '';
  const sessionId = typeof result.id === 'string' ? result.id.trim() : '';

  if (!checkoutUrl || !sessionId) {
    throw new DodoBillingError('dodo_malformed_response', 502, 'Dodo Payments response was missing checkout_url or id');
  }

  return {
    checkoutUrl,
    sessionId,
    tier: input.tier,
    dryRun: false,
  };
}

// ---------------------------------------------------------------------------
// Customer portal
// ---------------------------------------------------------------------------

export interface DodoCustomerPortalInput {
  tenantId: string;
  customerId?: string;
  returnUrl?: string;
}

export async function getDodoCustomerPortal(
  input: DodoCustomerPortalInput,
  config: DodoApiConfig,
): Promise<DodoCustomerPortalResult> {
  const apiKey = config.apiKey?.trim();

  // Dry-run when credentials not configured
  if (!apiKey) {
    return {
      portalUrl: `https://billing.dodopayments.com/dryrun/${input.tenantId}`,
      tenantId: input.tenantId,
      dryRun: true,
    };
  }

  const body: Record<string, unknown> = {
    metadata: { greybox_tenant_id: input.tenantId },
    ...(input.customerId ? { customer_id: input.customerId } : {}),
    ...(input.returnUrl ? { return_url: input.returnUrl } : {}),
  };
  const result = await dodoPost('/billing/portal', body, config);

  const portalUrl = typeof result.portal_url === 'string' ? result.portal_url.trim() : '';
  if (!portalUrl) {
    throw new DodoBillingError('dodo_malformed_response', 502, 'Dodo Payments portal response was missing portal_url');
  }

  return {
    portalUrl,
    tenantId: input.tenantId,
    dryRun: false,
  };
}

// ---------------------------------------------------------------------------
// Webhook verification and handling
// ---------------------------------------------------------------------------

/**
 * Verifies a Dodo Payments webhook HMAC-SHA256 signature.
 * Dodo sends the signature in the Dodo-Signature header.
 * The signed payload is the raw request body.
 */
export function verifyDodoWebhookSignature(input: {
  rawBody: string;
  signatureHeader?: string | null;
  webhookSecret: string;
}): void {
  const secret = input.webhookSecret.trim();
  if (!secret) {
    throw new DodoBillingError('dodo_webhook_secret_missing', 503, 'Dodo webhook secret is not configured');
  }
  const signature = input.signatureHeader?.trim();
  if (!signature) {
    throw new DodoBillingError('dodo_webhook_signature_missing', 400, 'Dodo-Signature header is required');
  }
  // Dodo may prefix the header value with "sha256=" — strip it
  const rawHex = signature.startsWith('sha256=') ? signature.slice(7) : signature;
  const hexRe = /^[0-9a-f]{64}$/i;
  if (!hexRe.test(rawHex)) {
    throw new DodoBillingError('dodo_webhook_signature_invalid', 400, 'Dodo webhook signature verification failed');
  }
  const expected = createHmac('sha256', secret).update(input.rawBody).digest('hex');
  const expectedBuf = Buffer.from(expected, 'hex');
  const actualBuf = Buffer.from(rawHex.toLowerCase(), 'hex');
  if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) {
    throw new DodoBillingError('dodo_webhook_signature_invalid', 400, 'Dodo webhook signature verification failed');
  }
}

export type DodoWebhookEventType =
  | 'payment.succeeded'
  | 'subscription.active'
  | 'subscription.cancelled'
  | 'subscription.renewed'
  | string;

export interface DodoWebhookHandleOptions {
  rawBody: string;
  signatureHeader?: string | null;
  webhookSecret?: string;
  requestId?: string;
}

function parseDodoWebhookEvent(rawBody: string): {
  eventId: string;
  eventType: DodoWebhookEventType;
  subscriptionId?: string;
  tenantId?: string;
  tier?: string;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw new DodoBillingError('dodo_webhook_payload_invalid', 400, 'Dodo webhook payload must be valid JSON');
  }
  if (!isRecord(parsed)) {
    throw new DodoBillingError('dodo_webhook_payload_invalid', 400, 'Dodo webhook payload must be an object');
  }
  const eventId = typeof parsed.id === 'string' ? parsed.id.trim() : '';
  const eventType = typeof parsed.type === 'string' ? parsed.type.trim()
    : typeof parsed.event_type === 'string' ? parsed.event_type.trim()
    : '';
  if (!eventType) {
    throw new DodoBillingError('dodo_webhook_event_invalid', 400, 'Dodo webhook event type is required');
  }

  // Extract subscription/tenant from nested data
  let subscriptionId: string | undefined;
  let tenantId: string | undefined;
  let tier: string | undefined;
  const data = isRecord(parsed.data) ? parsed.data : (isRecord(parsed.payload) ? parsed.payload : undefined);
  if (data) {
    subscriptionId = typeof data.subscription_id === 'string' ? data.subscription_id.trim()
      : typeof data.id === 'string' ? data.id.trim()
      : undefined;
    const metadata = isRecord(data.metadata) ? data.metadata : {};
    tenantId = typeof metadata.greybox_tenant_id === 'string' ? metadata.greybox_tenant_id.trim() : undefined;
    const VALID_TIERS = new Set(['indie', 'studio']);
    const rawTier = typeof metadata.greybox_plan_tier === 'string' ? metadata.greybox_plan_tier.trim() : undefined;
    tier = rawTier && VALID_TIERS.has(rawTier) ? rawTier : undefined;
  }

  return { eventId: eventId || eventType, eventType, subscriptionId, tenantId, tier };
}

export async function handleDodoWebhook(
  options: DodoWebhookHandleOptions,
): Promise<DodoWebhookHandleResult> {
  const secret = options.webhookSecret?.trim();
  if (!secret) {
    throw new DodoBillingError('dodo_webhook_secret_missing', 503, 'Dodo webhook secret is not configured');
  }
  verifyDodoWebhookSignature({
    rawBody: options.rawBody,
    signatureHeader: options.signatureHeader,
    webhookSecret: secret,
  });
  const event = parseDodoWebhookEvent(options.rawBody);
  return {
    ok: true,
    received: true,
    verified: true,
    eventId: event.eventId,
    eventType: event.eventType,
    ...(event.subscriptionId ? { subscriptionId: event.subscriptionId } : {}),
    ...(event.tenantId ? { tenantId: event.tenantId } : {}),
    ...(event.tier ? { tier: event.tier } : {}),
  };
}

// ---------------------------------------------------------------------------
// Env helpers
// ---------------------------------------------------------------------------

export function dodoProductIdFromEnv(
  tier: 'indie' | 'studio',
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  return tier === 'indie' ? env.DODO_PRODUCT_INDIE?.trim() : env.DODO_PRODUCT_STUDIO?.trim();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
