// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { createHash } from 'node:crypto';
import { creatorPayoutReadiness } from '../payouts/stripeConnect.js';
import { splitOrder } from '../pricing/takeRate.js';
import { normalizeStripeApiBase } from '../stripeApiBase.js';
import { stripeTaxCodeForCategory } from '../tax/taxCompliance.js';
import type {
  Creator,
  MarketplaceCheckoutEntitlementPreview,
  MarketplaceCheckoutFulfillment,
  MarketplaceCheckoutPlan,
  MarketplaceCheckoutRequirement,
  MarketplaceListing,
  MarketplaceOrder,
  StripeCheckoutCompletedEvent,
  StripeCheckoutCompletedSession,
  StripeCheckoutMetadata,
  StripeCheckoutSessionSummary,
  StripeCheckoutSessionRequest,
  TaxAddress,
} from '../types.js';

const BEARER_TOKEN_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}(?=$|[^A-Za-z0-9._~+/=-])/giu;
const STRIPE_SECRET_PATTERN = /\b(?:Bearer\s+)?(?:sk|rk)_(?:live|test)_[A-Za-z0-9_]+\b|\bwhsec_[A-Za-z0-9_]+\b/giu;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu;
const IP_ADDRESS_PATTERN = /\b(?:\d{1,3}\.){3}\d{1,3}\b/gu;
const CARD_LIKE_PATTERN = /\b(?:\d[ -]*?){13,19}\b/gu;
const PHONE_PATTERN = /\+?\b(?:\d[\s().-]?){7,}\d\b/gu;
const STRIPE_OBJECT_ID_PATTERN = /\b(?:acct|ch|cs|cus|dp|evt|pi|re|taxcalc|tr|txr)_[A-Za-z0-9_]+\b/gu;

export interface MarketplaceCheckoutPlanInput {
  listing: MarketplaceListing;
  creator: Creator;
  buyerId: string;
  successUrl: string;
  cancelUrl: string;
  now?: number;
}

export interface StripeCheckoutClient {
  createSession(request: StripeCheckoutSessionRequest): Promise<StripeCheckoutSessionSummary>;
}

export interface LiveStripeCheckoutClientOptions {
  apiKey?: string;
  fetchFn?: typeof fetch;
  stripeApiBase?: string;
}

export class LiveStripeCheckoutClient implements StripeCheckoutClient {
  private readonly fetchFn: typeof fetch;
  private readonly stripeApiBase: string;

  constructor(private readonly options: LiveStripeCheckoutClientOptions = {}) {
    this.fetchFn = options.fetchFn ?? fetch;
    this.stripeApiBase = normalizeStripeApiBase(options.stripeApiBase, {
      allowNonStripeHost: Boolean(options.fetchFn),
    });
  }

  async createSession(request: StripeCheckoutSessionRequest): Promise<StripeCheckoutSessionSummary> {
    const apiKey = this.options.apiKey?.trim();
    if (!apiKey) throw new Error('STRIPE_SECRET_KEY is required to create Checkout Sessions');
    const response = await this.fetchFn(`${this.stripeApiBase}${request.endpoint}`, {
      body: encodeStripeForm(request.body),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Idempotency-Key': request.idempotencyKey,
        'Stripe-Version': '2024-11-20.acacia',
      },
      method: request.method,
    }).catch((error: unknown) => {
      throw new Error(stripeCheckoutTransportErrorReason('stripe_checkout_transport_error', error));
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(stripeCheckoutResponseErrorReason(response.status, text));
    }
    return sanitizeStripeCheckoutSession(await response.json());
  }
}

export function buildMarketplaceCheckoutPlan(input: MarketplaceCheckoutPlanInput): MarketplaceCheckoutPlan {
  const successUrl = assertHttpUrl(input.successUrl, 'successUrl');
  const cancelUrl = assertHttpUrl(input.cancelUrl, 'cancelUrl');
  const orderPreview = checkoutOrderPreview(input);
  const requirements = checkoutRequirements(input.listing, input.creator);
  const entitlementPreview = checkoutEntitlementPreview(input.listing, input.buyerId);
  const readiness = {
    status: requirements.length === 0 ? 'ready' as const : 'blocked' as const,
    requirements,
  };
  const plan: MarketplaceCheckoutPlan = {
    listingId: input.listing.id,
    buyerId: input.buyerId,
    creatorId: input.creator.id,
    orderPreview,
    readiness,
    ...(entitlementPreview ? { entitlementPreview } : {}),
  };
  if (readiness.status !== 'ready' || !input.creator.stripeConnectAccountId) return plan;
  return {
    ...plan,
    checkoutSessionRequest: buildStripeCheckoutSessionRequest({
      listing: input.listing,
      creator: input.creator,
      buyerId: input.buyerId,
      successUrl,
      cancelUrl,
      orderPreview,
    }),
  };
}

function encodeStripeForm(value: unknown): URLSearchParams {
  const params = new URLSearchParams();
  appendStripeFormValue(params, '', value);
  return params;
}

function appendStripeFormValue(params: URLSearchParams, key: string, value: unknown): void {
  if (value === undefined || value === null) return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      appendStripeFormValue(params, `${key}[${index}]`, entry);
    });
    return;
  }
  if (typeof value === 'object') {
    for (const [childKey, childValue] of Object.entries(value)) {
      appendStripeFormValue(params, key ? `${key}[${childKey}]` : childKey, childValue);
    }
    return;
  }
  params.set(key, String(value));
}

function sanitizeStripeCheckoutSession(value: unknown): StripeCheckoutSessionSummary {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Stripe Checkout Session response must be an object');
  }
  const record = value as Record<string, unknown>;
  const id = typeof record.id === 'string' ? record.id.trim() : '';
  const rawUrl = typeof record.url === 'string' ? record.url.trim() : '';
  if (!id) throw new Error('Stripe Checkout Session response is missing id');
  if (!/^cs_(?:test|live)_[A-Za-z0-9_]+$/u.test(id)) {
    throw new Error('Stripe Checkout Session response id must be a Checkout Session id');
  }
  if (!rawUrl) throw new Error('Stripe Checkout Session response is missing url');
  const url = requireStripeCheckoutSessionUrl(rawUrl);
  const livemode = typeof record.livemode === 'boolean' ? record.livemode : undefined;
  const expiresAt = typeof record.expires_at === 'number' && Number.isFinite(record.expires_at)
    ? record.expires_at
    : undefined;
  const paymentStatus = typeof record.payment_status === 'string' && record.payment_status.trim().length > 0
    ? record.payment_status.trim()
    : undefined;
  return {
    id,
    url: url.toString(),
    ...(livemode === undefined ? {} : { livemode }),
    ...(expiresAt === undefined ? {} : { expiresAt }),
    ...(paymentStatus ? { paymentStatus } : {}),
  };
}

export function buildStripeCheckoutSessionRequest(input: {
  listing: MarketplaceListing;
  creator: Creator;
  buyerId: string;
  successUrl: string;
  cancelUrl: string;
  orderPreview?: MarketplaceOrder;
}): StripeCheckoutSessionRequest {
  const stripeConnectAccountId = input.creator.stripeConnectAccountId;
  if (!stripeConnectAccountId) throw new Error('stripeConnectAccountId is required before creating a Checkout Session');
  const successUrl = assertHttpUrl(input.successUrl, 'successUrl');
  const cancelUrl = assertHttpUrl(input.cancelUrl, 'cancelUrl');
  const orderPreview = input.orderPreview ?? checkoutOrderPreview(input);
  const checkoutReference = stripeCheckoutReferenceFor(input.listing.id, input.buyerId);
  const metadata = checkoutMetadata({
    listing: input.listing,
    creator: input.creator,
    buyerId: input.buyerId,
    checkoutReference,
  });
  return {
    method: 'POST',
    endpoint: '/v1/checkout/sessions',
    idempotencyKey: `greybox-checkout-${stableStripeKey(checkoutReference)}-${input.listing.updatedAt}`,
    body: {
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: checkoutReference,
      billing_address_collection: 'auto',
      automatic_tax: {
        enabled: true,
        liability: {
          type: 'account',
          account: stripeConnectAccountId,
        },
      },
      line_items: [{
        quantity: 1,
        price_data: {
          currency: input.listing.currency,
          unit_amount: input.listing.priceCents,
          tax_behavior: 'exclusive',
          product_data: {
            name: input.listing.title,
            description: input.listing.description,
            tax_code: stripeTaxCodeForCategory(input.listing.category),
            metadata,
          },
        },
        metadata,
      }],
      metadata,
      payment_intent_data: {
        application_fee_amount: orderPreview.platformFeeCents,
        on_behalf_of: stripeConnectAccountId,
        transfer_data: {
          destination: stripeConnectAccountId,
        },
        metadata,
      },
    },
  };
}

export function stripeCheckoutFulfillmentFromEvent(event: StripeCheckoutCompletedEvent): MarketplaceCheckoutFulfillment {
  if (!event.id) throw new Error('event id is required');
  if (event.type !== 'checkout.session.completed') throw new Error('event type must be checkout.session.completed');
  const session = event.data.object;
  if (!session.id) throw new Error('Checkout Session id is required');
  if (session.object !== 'checkout.session') throw new Error('event object must be a Checkout Session');
  if (session.mode && session.mode !== 'payment') throw new Error('Checkout Session must be payment mode');
  if (session.payment_status !== 'paid') throw new Error('Checkout Session payment_status must be paid before fulfillment');
  const metadata = session.metadata;
  if (!metadata) throw new Error('Checkout Session metadata is required');
  const listingId = requiredMetadata(metadata, 'greybox_listing_id');
  const creatorId = requiredMetadata(metadata, 'greybox_creator_id');
  const buyerId = requiredMetadata(metadata, 'greybox_buyer_id');
  const checkoutReference = requiredMetadata(metadata, 'greybox_checkout_reference');
  const currency = session.currency?.toLowerCase();
  if (currency !== 'usd') throw new Error('Checkout Session currency must be usd');
  const amountSubtotalCents = finiteNonNegativeInteger(session.amount_subtotal, 'amount_subtotal');
  const amountTotalCents = optionalFiniteNonNegativeInteger(session.amount_total, 'amount_total');
  const taxAmountCents = optionalFiniteNonNegativeInteger(session.total_details?.amount_tax, 'total_details.amount_tax');
  if (
    amountTotalCents !== undefined
    && taxAmountCents !== undefined
    && amountTotalCents !== amountSubtotalCents + taxAmountCents
  ) {
    throw new Error('Checkout Session amount_total must equal amount_subtotal plus total_details.amount_tax');
  }
  const automaticTaxStatus = session.automatic_tax?.status ?? undefined;
  const automaticTaxLiabilityType = session.automatic_tax?.liability?.type ?? undefined;
  const automaticTaxLiabilityAccount = typeof session.automatic_tax?.liability?.account === 'string'
    ? session.automatic_tax.liability.account.trim()
    : undefined;
  if (session.automatic_tax?.enabled && automaticTaxStatus !== 'complete') {
    throw new Error('Checkout Session automatic tax must be complete before fulfillment');
  }
  if (session.automatic_tax?.enabled && (automaticTaxLiabilityType !== 'account' || !automaticTaxLiabilityAccount)) {
    throw new Error('Checkout Session automatic tax liability must be delegated to the creator account');
  }
  const stripePaymentIntentId = stripePaymentIntentIdFromSession(session);
  const buyerTaxAddress = buyerTaxAddressFromSession(session);
  return {
    stripeEventId: event.id,
    stripeCheckoutSessionId: session.id,
    ...(stripePaymentIntentId ? { stripePaymentIntentId } : {}),
    checkoutReference,
    listingId,
    creatorId,
    buyerId,
    currency,
    amountSubtotalCents,
    ...(amountTotalCents !== undefined ? { amountTotalCents } : {}),
    ...(taxAmountCents !== undefined ? { taxAmountCents } : {}),
    ...(buyerTaxAddress ? { buyerTaxAddress } : {}),
    ...(automaticTaxStatus ? { automaticTaxStatus } : {}),
    ...(automaticTaxLiabilityType ? { automaticTaxLiabilityType } : {}),
    ...(automaticTaxLiabilityAccount ? { automaticTaxLiabilityAccount } : {}),
  };
}

export function stripeCheckoutOrderId(sessionId: string): string {
  return `checkout-${hashedStripeKey(sessionId)}`;
}

export function stripeCheckoutPayoutId(sessionId: string): string {
  return `payout-${stripeCheckoutOrderId(sessionId)}`;
}

export function stripeCheckoutReferenceFor(listingId: string, buyerId: string): string {
  return `gbx_${stableStripeKey(`${listingId}_${buyerId}`)}`.slice(0, 200);
}

function checkoutOrderPreview(input: {
  listing: MarketplaceListing;
  creator: Creator;
  buyerId: string;
  now?: number;
}): MarketplaceOrder {
  return splitOrder({
    orderId: stripeCheckoutReferenceFor(input.listing.id, input.buyerId),
    buyerId: input.buyerId,
    creatorId: input.creator.id,
    listingId: input.listing.id,
    grossCents: input.listing.priceCents,
    creatorMonthlyGmvCents: input.creator.monthlyGmvCents,
    createdAt: input.now ?? 0,
  });
}

function checkoutRequirements(listing: MarketplaceListing, creator: Creator): MarketplaceCheckoutRequirement[] {
  const requirements: MarketplaceCheckoutRequirement[] = [];
  if (listing.status !== 'published') {
    requirements.push({
      code: 'published_listing_required',
      message: 'Listing must be published before a Checkout Session can be created.',
    });
  }
  for (const requirement of creatorPayoutReadiness(creator).requirements) {
    requirements.push({
      code: requirement.code,
      message: requirement.message,
    });
  }
  return requirements;
}

function checkoutEntitlementPreview(
  listing: MarketplaceListing,
  buyerId: string,
): MarketplaceCheckoutEntitlementPreview | undefined {
  if (!listing.proModule) return undefined;
  return {
    buyerId,
    listingId: listing.id,
    category: listing.category,
    willIssue: true,
    proModule: {
      moduleId: listing.proModule.manifest.id,
      moduleName: listing.proModule.manifest.name,
      moduleVersion: listing.proModule.manifest.version,
      payloadSha256: listing.proModule.payloadSha256,
      signatureKeyId: listing.proModule.signature.keyId,
      mountCount: listing.proModule.mountCount,
      entitlementSku: listing.proModule.entitlement.sku,
      entitlementGrantKey: listing.proModule.entitlement.grantKey,
      entitlementLicenseTier: listing.proModule.entitlement.licenseTier,
    },
  };
}

function checkoutMetadata(input: {
  listing: MarketplaceListing;
  creator: Creator;
  buyerId: string;
  checkoutReference: string;
}): StripeCheckoutMetadata {
  return {
    greybox_checkout_reference: input.checkoutReference,
    greybox_listing_id: input.listing.id,
    greybox_creator_id: input.creator.id,
    greybox_buyer_id: input.buyerId,
    greybox_category: input.listing.category,
    ...(input.listing.proModule?.manifest.id ? { greybox_pro_module_id: input.listing.proModule.manifest.id } : {}),
    ...(input.listing.proModule?.manifest.version ? { greybox_pro_module_version: input.listing.proModule.manifest.version } : {}),
  };
}

function stableStripeKey(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/gu, '_').slice(0, 160);
}

/**
 * SHA-256 derivation used when a Stripe identifier must produce a stable but
 * non-reversible key. Stripe session ids and payment intent ids are sensitive:
 * they should never appear in audit logs, public order ids, or any
 * downstream system that an end user can read, so identifiers derived from
 * them (order.id, payout.id) are hashed instead of merely sanitised.
 *
 * 16-char hex is enough to avoid collisions across the entire historical
 * Stripe corpus while keeping ids URL-safe.
 */
function hashedStripeKey(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

function assertHttpUrl(value: string, label: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be an absolute https URL`);
  }
  const host = parsed.hostname.replace(/^\[|\]$/gu, '').toLowerCase();
  const localHttpAllowed = parsed.protocol === 'http:' && ['localhost', '127.0.0.1', '::1'].includes(host);
  if (parsed.protocol !== 'https:' && !localHttpAllowed) {
    throw new Error(`${label} must be an absolute https URL`);
  }
  if (parsed.username || parsed.password) {
    throw new Error(`${label} must not include credentials`);
  }
  return value;
}

function requireStripeCheckoutSessionUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Stripe Checkout Session url must be a valid https URL');
  }
  if (url.protocol !== 'https:') {
    throw new Error('Stripe Checkout Session url must be a valid https URL');
  }
  if (url.username || url.password) {
    throw new Error('Stripe Checkout Session url must not include credentials');
  }
  if (url.hostname !== 'checkout.stripe.com') {
    throw new Error('Stripe Checkout Session url must be hosted on checkout.stripe.com');
  }
  return url;
}

function stripeCheckoutResponseErrorReason(status: number, text: string): string {
  const message = sanitizeStripeCheckoutErrorText(text).slice(0, 200) || 'no_error_body';
  return `Stripe Checkout returned ${status}:${message}`;
}

function stripeCheckoutTransportErrorReason(code: string, error: unknown): string {
  const raw = error instanceof Error
    ? error.message
    : typeof error === 'string'
      ? error
      : 'unknown';
  const message = sanitizeStripeCheckoutErrorText(raw || 'unknown').slice(0, 200) || 'unknown';
  return `${code}:${message}`;
}

function sanitizeStripeCheckoutErrorText(text: string): string {
  return text
    .replace(BEARER_TOKEN_PATTERN, '[redacted-secret]')
    .replace(STRIPE_SECRET_PATTERN, '[redacted-secret]')
    .replace(EMAIL_PATTERN, '[redacted-email]')
    .replace(IP_ADDRESS_PATTERN, '[redacted-ip]')
    .replace(CARD_LIKE_PATTERN, '[redacted-card]')
    .replace(PHONE_PATTERN, '[redacted-phone]')
    .replace(STRIPE_OBJECT_ID_PATTERN, '[redacted-stripe-id]');
}

function requiredMetadata(
  metadata: Partial<Record<keyof StripeCheckoutMetadata, string>>,
  key: keyof StripeCheckoutMetadata,
): string {
  const value = metadata[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Checkout Session metadata.${key} is required`);
  }
  return value.trim();
}

function finiteNonNegativeInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(`Checkout Session ${label} must be a non-negative integer`);
  }
  return value;
}

function optionalFiniteNonNegativeInteger(value: unknown, label: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  return finiteNonNegativeInteger(value, label);
}

function stripePaymentIntentIdFromSession(session: StripeCheckoutCompletedSession): string | undefined {
  if (typeof session.payment_intent === 'string') return session.payment_intent;
  if (typeof session.payment_intent?.id === 'string') return session.payment_intent.id;
  return undefined;
}

function buyerTaxAddressFromSession(session: StripeCheckoutCompletedSession): TaxAddress | undefined {
  const address = session.customer_details?.address;
  if (!address?.country) return undefined;
  const country = address.country.toUpperCase();
  return {
    country,
    ...(address.postal_code ? { postalCode: address.postal_code } : {}),
    ...(address.state ? { state: address.state } : {}),
    ...(address.city ? { city: address.city } : {}),
    ...(address.line1 ? { line1: address.line1 } : {}),
    ...(address.line2 ? { line2: address.line2 } : {}),
  };
}
