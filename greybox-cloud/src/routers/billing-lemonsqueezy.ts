// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { createHmac, timingSafeEqual } from 'node:crypto';

import type { PlanTier } from '../types.js';

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class LemonSqueezyBillingError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message = code,
  ) {
    super(message);
    this.name = 'LemonSqueezyBillingError';
  }
}

// ---------------------------------------------------------------------------
// Public response shapes
// ---------------------------------------------------------------------------

export interface LemonSqueezyCreateCheckoutResult {
  checkoutUrl: string;
  variantId: string;
  tier: 'indie' | 'studio';
  dryRun: boolean;
}

export interface LemonSqueezyCustomerPortalResult {
  portalUrl: string;
  tenantId: string;
  dryRun: boolean;
}

export interface LemonSqueezyWebhookHandleResult {
  ok: true;
  received: true;
  verified: true;
  eventId: string;
  eventType: string;
  subscriptionId?: string;
  tenantId?: string;
}

// ---------------------------------------------------------------------------
// LemonSqueezy API helpers
// ---------------------------------------------------------------------------

const LS_BASE_URL = 'https://api.lemonsqueezy.com';

export type LemonSqueezyFetch = (
  url: string,
  init: { method: 'POST' | 'GET'; headers: Record<string, string>; body?: string },
) => Promise<Pick<Response, 'ok' | 'status' | 'json'>>;

export interface LemonSqueezyApiConfig {
  apiKey?: string;
  fetchFn?: LemonSqueezyFetch;
}

async function lsPost(
  path: string,
  body: Record<string, unknown>,
  config: LemonSqueezyApiConfig,
): Promise<Record<string, unknown>> {
  const apiKey = config.apiKey?.trim();
  if (!apiKey) {
    throw new LemonSqueezyBillingError('ls_api_key_missing', 503, 'LemonSqueezy API key is not configured');
  }
  const fetchFn = config.fetchFn ?? (fetch as unknown as LemonSqueezyFetch);
  const response = await fetchFn(`${LS_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/vnd.api+json',
      'Content-Type': 'application/vnd.api+json',
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await (response as Response).text?.().catch(() => '') ?? '';
    throw new LemonSqueezyBillingError('ls_api_error', response.status, `LemonSqueezy API error: ${text.slice(0, 200)}`);
  }
  return response.json() as Promise<Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// Create checkout session
// ---------------------------------------------------------------------------

export interface LemonSqueezyCreateCheckoutOptions {
  tenantId: string;
  tier: 'indie' | 'studio';
  storeId: string;
  variantId: string;
  successUrl?: string;
  cancelUrl?: string;
  customerEmail?: string;
}

export async function createLemonSqueezyCheckout(
  options: LemonSqueezyCreateCheckoutOptions,
  config: LemonSqueezyApiConfig,
): Promise<LemonSqueezyCreateCheckoutResult> {
  const apiKey = config.apiKey?.trim();
  if (!apiKey) {
    return {
      checkoutUrl: `https://app.lemonsqueezy.com/checkout/buy/${options.variantId}`,
      variantId: options.variantId,
      tier: options.tier,
      dryRun: true,
    };
  }

  const body: Record<string, unknown> = {
    data: {
      type: 'checkouts',
      attributes: {
        product_options: {
          redirect_url: options.successUrl ?? '',
        },
        checkout_data: {
          custom: {
            greybox_tenant_id: options.tenantId,
            greybox_plan_tier: options.tier,
          },
          ...(options.customerEmail ? { email: options.customerEmail } : {}),
        },
      },
      relationships: {
        store: {
          data: { type: 'stores', id: options.storeId },
        },
        variant: {
          data: { type: 'variants', id: options.variantId },
        },
      },
    },
  };

  const result = await lsPost('/v1/checkouts', body, config);
  const data = isRecord(result.data) ? result.data : {};
  const attrs = isRecord(data.attributes) ? data.attributes : {};
  const checkoutUrl = typeof attrs.url === 'string' ? attrs.url : '';
  if (!checkoutUrl) {
    throw new LemonSqueezyBillingError('ls_checkout_url_missing', 502, 'LemonSqueezy did not return a checkout URL');
  }
  return {
    checkoutUrl,
    variantId: options.variantId,
    tier: options.tier,
    dryRun: false,
  };
}

// ---------------------------------------------------------------------------
// Customer portal
// ---------------------------------------------------------------------------

export interface LemonSqueezyCustomerPortalOptions {
  tenantId: string;
  storeSubdomain?: string;
}

export function getLemonSqueezyCustomerPortalUrl(
  options: LemonSqueezyCustomerPortalOptions,
): LemonSqueezyCustomerPortalResult {
  const subdomain = options.storeSubdomain?.trim() || 'app';
  const portalUrl = `https://${subdomain}.lemonsqueezy.com/billing`;
  return {
    portalUrl,
    tenantId: options.tenantId,
    dryRun: !options.storeSubdomain,
  };
}

// ---------------------------------------------------------------------------
// Webhook verification and handling
// ---------------------------------------------------------------------------

/**
 * Verifies a LemonSqueezy webhook HMAC-SHA256 signature.
 * LemonSqueezy sends the signature in the X-Signature header.
 * The signed payload is the raw request body.
 */
export function verifyLemonSqueezyWebhookSignature(input: {
  rawBody: string;
  signatureHeader?: string | null;
  webhookSecret: string;
}): void {
  const secret = input.webhookSecret.trim();
  if (!secret) {
    throw new LemonSqueezyBillingError('ls_webhook_secret_missing', 503, 'LemonSqueezy webhook secret is not configured');
  }
  const signature = input.signatureHeader?.trim();
  if (!signature) {
    throw new LemonSqueezyBillingError('ls_webhook_signature_missing', 400, 'X-Signature header is required');
  }
  const expected = createHmac('sha256', secret).update(input.rawBody).digest('hex');
  const expectedBuf = Buffer.from(expected, 'hex');
  const actualBuf = Buffer.from(signature.toLowerCase(), 'hex');
  if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) {
    throw new LemonSqueezyBillingError('ls_webhook_signature_invalid', 400, 'LemonSqueezy webhook signature verification failed');
  }
}

export type LemonSqueezyWebhookEventType =
  | 'subscription_created'
  | 'subscription_updated'
  | 'subscription_payment_success'
  | 'subscription_cancelled'
  | string;

export interface LemonSqueezyWebhookHandleOptions {
  rawBody: string;
  signatureHeader?: string | null;
  webhookSecret?: string;
}

function parseLemonSqueezyWebhookEvent(rawBody: string): {
  eventId: string;
  eventType: LemonSqueezyWebhookEventType;
  subscriptionId?: string;
  tenantId?: string;
  tier?: string;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw new LemonSqueezyBillingError('ls_webhook_payload_invalid', 400, 'LemonSqueezy webhook payload must be valid JSON');
  }
  if (!isRecord(parsed)) {
    throw new LemonSqueezyBillingError('ls_webhook_payload_invalid', 400, 'LemonSqueezy webhook payload must be an object');
  }

  const meta = isRecord(parsed.meta) ? parsed.meta : {};
  const eventType = typeof meta.event_name === 'string' ? meta.event_name.trim() : '';
  if (!eventType) {
    throw new LemonSqueezyBillingError('ls_webhook_event_invalid', 400, 'LemonSqueezy webhook event_name is required');
  }

  const customData = isRecord(meta.custom_data) ? meta.custom_data : {};
  const tenantId = typeof customData.greybox_tenant_id === 'string' ? customData.greybox_tenant_id.trim() : undefined;
  const VALID_TIERS = new Set(['indie', 'studio']);
  const rawTier = typeof customData.greybox_plan_tier === 'string' ? customData.greybox_plan_tier.trim() : undefined;
  const tier = rawTier && VALID_TIERS.has(rawTier) ? rawTier : undefined;

  const data = isRecord(parsed.data) ? parsed.data : {};
  const subscriptionId = typeof data.id === 'string' ? data.id.trim() : undefined;
  const eventId = subscriptionId ? `${eventType}:${subscriptionId}` : eventType;

  return { eventId, eventType, subscriptionId, tenantId, tier };
}

export async function handleLemonSqueezyWebhook(
  options: LemonSqueezyWebhookHandleOptions,
): Promise<LemonSqueezyWebhookHandleResult> {
  const secret = options.webhookSecret?.trim();
  if (!secret) {
    throw new LemonSqueezyBillingError('ls_webhook_secret_missing', 503, 'LemonSqueezy webhook secret is not configured');
  }
  verifyLemonSqueezyWebhookSignature({
    rawBody: options.rawBody,
    signatureHeader: options.signatureHeader,
    webhookSecret: secret,
  });
  const event = parseLemonSqueezyWebhookEvent(options.rawBody);
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
// Env helpers
// ---------------------------------------------------------------------------

export function lemonSqueezyVariantIdFromEnv(
  tier: 'indie' | 'studio',
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  return tier === 'indie'
    ? env.LEMON_SQUEEZY_VARIANT_ID_INDIE?.trim()
    : env.LEMON_SQUEEZY_VARIANT_ID_STUDIO?.trim();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

// Silence unused import warning — PlanTier is used in consuming code via this module
void (undefined as unknown as PlanTier);
