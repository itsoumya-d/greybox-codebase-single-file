// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';

import { publicProModuleListingMetadataFromEnvelope } from '../proModules/listingBoundary.js';
import { LiveStripeConnectProvider } from '../payouts/stripeConnect.js';
import { LiveStripeCheckoutClient, type StripeCheckoutClient } from '../checkout/stripeCheckout.js';
import { FileBackedMarketplaceStore } from '../store/fileMarketplaceStore.js';
import { enterMarketplaceAuditContext, FileMarketplaceAuditLog, InMemoryMarketplaceAuditLog } from '../store/auditLog.js';
import {
  productionDryRunBreakGlassAllowed,
  productionDryRunBreakGlassMessage,
  type ProductionDryRunEnv,
} from '../safety/productionDryRun.js';
import {
  assertHostedStripeSecretKey,
  assertHostedStripeWebhookSecret,
  stripeWebhookSignatureIsValid,
} from '../safety/stripeProduction.js';
import {
  InMemoryMarketplaceStore,
  marketplacePayoutReservePolicyFromEnv,
  type MarketplacePayoutReservePolicyEnv,
  type MarketplacePayoutReleaseInput,
  type MarketplaceStoreOptions,
} from '../store/marketplaceStore.js';
import { MarketplaceMetricsRegistry } from '../observability/metrics.js';
import type {
  Creator,
  CreatorTaxProfileProvider,
  CreatorTaxProfileRecordInput,
  ListingCategory,
  ListingDraft,
  ListingReview,
  ListingStatus,
  MarketplaceCreatorActivationTargets,
  MarketplaceCheckoutSessionResponse,
  MarketplaceEntitlementClaimInput,
  MarketplaceEventReceiptKind,
  MarketplaceLaunchReadinessTargets,
  MarketplacePlatformReadinessTargets,
  MarketplaceRiskReserveOptions,
  MarketplaceRiskEventDraft,
  MarketplaceRiskEventStatus,
  MarketplaceRiskEventType,
  StripeConnectAccountStatusRecordInput,
  StripeCheckoutCompletedEvent,
  TaxAddress,
} from '../types.js';

const MAX_BODY_BYTES = 128 * 1024;
const LISTING_CATEGORIES = new Set<ListingCategory>([
  'custom-art-bible',
  'custom-skill',
  'asset-pack',
  'template',
  'pro-module',
  'consulting-hour',
]);
const LISTING_STATUSES = new Set<ListingStatus>([
  'draft',
  'pending-auto-review',
  'pending-human-review',
  'published',
  'rejected',
  'suspended',
]);
const REVIEW_STATUSES = new Set<ListingReview['status']>([
  'passed',
  'human-required',
  'rejected',
]);
const EVENT_RECEIPT_KINDS = new Set<MarketplaceEventReceiptKind>([
  'checkout.session.completed',
  'payout',
  'refund',
  'dispute',
  'admin_refund',
]);
const RISK_EVENT_TYPES = new Set<MarketplaceRiskEventType>(['refund', 'dispute']);
const RISK_EVENT_STATUSES = new Set<MarketplaceRiskEventStatus>(['open', 'resolved', 'lost', 'won']);
const TAX_PROFILE_PROVIDERS = new Set<CreatorTaxProfileProvider>([
  'stripe-tax',
  'stripe-identity',
  'taxbit',
  'manual-review',
  'external',
]);
const HOSTED_MARKETPLACE_ADMIN_TOKEN_MIN_LENGTH = 32;
const HOSTED_MARKETPLACE_ADMIN_TOKEN_PLACEHOLDER_PATTERN =
  /(?:^test(?:[-_]|$)|example|sample|dummy|placeholder|changeme|change-me|replace-me|not-a-secret|dev-only)/iu;

export interface MarketplaceApiEnv extends MarketplacePayoutReservePolicyEnv, ProductionDryRunEnv {
  readonly NODE_ENV?: string;
  readonly STRIPE_SECRET_KEY?: string;
  readonly STRIPE_CONNECT_DRY_RUN?: string;
  readonly STRIPE_API_BASE?: string;
  readonly GREYBOX_MARKETPLACE_ADMIN_TOKEN?: string;
  readonly GREYBOX_MARKETPLACE_STRIPE_WEBHOOK_SECRET?: string;
  readonly GREYBOX_MARKETPLACE_STORE_FILE?: string;
  readonly GREYBOX_MARKETPLACE_AUDIT_LOG_PATH?: string;
  readonly GREYBOX_MARKETPLACE_PUBLIC_BASE_URL?: string;
}

export interface MarketplaceApiOptions extends MarketplaceStoreOptions {
  adminToken?: string;
  checkoutClient?: StripeCheckoutClient;
  persistencePath?: string;
  store?: InMemoryMarketplaceStore;
  metrics?: MarketplaceMetricsRegistry;
  allowMockPayoutsInProduction?: boolean;
  publicBaseUrl?: string;
  env?: MarketplaceApiEnv;
}

export interface StartedMarketplaceServer {
  server: Server;
  store: InMemoryMarketplaceStore;
  url: string;
}

const responseCorsOrigins = new WeakMap<ServerResponse, string>();

function responseCorsHeaders(res: ServerResponse): Record<string, string> {
  const allowedOrigin = responseCorsOrigins.get(res);
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'content-type, authorization, x-greybox-marketplace-token',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };
  if (!allowedOrigin) return headers;
  headers['Access-Control-Allow-Origin'] = allowedOrigin;
  if (allowedOrigin !== '*') headers.Vary = 'Origin';
  return headers;
}

function configureResponseCors(req: IncomingMessage, res: ServerResponse, hostedOrigin: string | undefined): void {
  if (!hostedOrigin) {
    responseCorsOrigins.set(res, '*');
    return;
  }
  const requestOrigin = marketplaceRequestOrigin(req);
  if (requestOrigin === hostedOrigin) responseCorsOrigins.set(res, hostedOrigin);
}

function marketplaceRequestOrigin(req: IncomingMessage): string | undefined {
  const origin = req.headers.origin;
  return typeof origin === 'string' ? origin.trim() : undefined;
}

function marketplaceStripeSignatureHeader(req: IncomingMessage): string | undefined {
  const signature = req.headers['stripe-signature'];
  return typeof signature === 'string' ? signature.trim() : undefined;
}

function sendCorsForbidden(res: ServerResponse): void {
  const encoded = JSON.stringify({
    error: {
      code: 'CORS_FORBIDDEN',
      message: 'marketplace origin is not allowed',
    },
  });
  res.writeHead(403, {
    ...responseCorsHeaders(res),
    'Content-Length': Buffer.byteLength(encoded).toString(),
    'Content-Type': 'application/json; charset=utf-8',
  });
  res.end(encoded);
}

function jsonResponse(res: ServerResponse, status: number, body: unknown): void {
  const encoded = JSON.stringify(body);
  res.writeHead(status, {
    ...responseCorsHeaders(res),
    'Content-Length': Buffer.byteLength(encoded).toString(),
    'Content-Type': 'application/json; charset=utf-8',
  });
  res.end(encoded);
}

function csvResponse(res: ServerResponse, status: number, body: string, filename: string): void {
  res.writeHead(status, {
    ...responseCorsHeaders(res),
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Content-Length': Buffer.byteLength(body).toString(),
    'Content-Type': 'text/csv; charset=utf-8',
  });
  res.end(body);
}

function noContent(res: ServerResponse): void {
  res.writeHead(204, {
    ...responseCorsHeaders(res),
  });
  res.end();
}

function notFound(res: ServerResponse): void {
  jsonResponse(res, 404, { error: { code: 'NOT_FOUND', message: 'marketplace route not found' } });
}

const REQUEST_ID_PREFIX = 'req_';
const REQUEST_ID_ALLOWED_CHARS = /^[A-Za-z0-9_.:-]{1,128}$/u;

function randomRequestId(): string {
  return `${REQUEST_ID_PREFIX}${randomBytes(8).toString('hex')}`;
}

function normaliseRequestId(value: string | string[] | undefined): string | undefined {
  if (!value) return undefined;
  const candidate = Array.isArray(value) ? value[0] : value;
  if (typeof candidate !== 'string') return undefined;
  const trimmed = candidate.trim();
  if (!trimmed || !REQUEST_ID_ALLOWED_CHARS.test(trimmed)) return undefined;
  return trimmed;
}

/**
 * Pull point-in-time counters from the store into the metrics registry so a
 * /metrics scrape exposes them as gauges. Counters that are already
 * incremented inline on mutation (orders.fulfilled, payout.queued, etc.) stay
 * where they are; this only covers the things the store keeps in-memory
 * without surfacing as Prometheus-shaped counters.
 */
function refreshStoreGauges(store: InMemoryMarketplaceStore, metrics: MarketplaceMetricsRegistry): void {
  // Open dispute count = critical for ops alerting. The dispute window is
  // 60 days for most card networks; we don't filter on time here since
  // every still-open event is by definition recent enough to matter.
  const disputeEvents = store.listRiskEvents({ type: 'dispute' });
  const refundEvents = store.listRiskEvents({ type: 'refund' });
  let openDisputes = 0;
  let lostDisputes = 0;
  let openRefunds = 0;
  for (const event of disputeEvents) {
    if (event.status === 'open') openDisputes += 1;
    else if (event.status === 'lost') lostDisputes += 1;
  }
  for (const event of refundEvents) {
    if (event.status === 'open') openRefunds += 1;
  }
  metrics.setGauge('risk.disputes_open', openDisputes);
  metrics.setGauge('risk.disputes_lost_lifetime', lostDisputes);
  metrics.setGauge('risk.refunds_open', openRefunds);
  metrics.setGauge('risk.disputes_lifetime', disputeEvents.length);
  metrics.setGauge('risk.refunds_lifetime', refundEvents.length);
  // Surface aggregate store stats so ops can chart organic growth. The
  // monthly stats endpoint already exposes these for the latest period;
  // duplicating into the metrics registry means Grafana doesn't have to
  // call a second admin-token-gated endpoint to plot them.
  const stats = store.stats();
  metrics.setGauge('gmv.cents.month_to_date', stats.gmvCents);
  metrics.setGauge('platform_revenue.cents.month_to_date', stats.platformRevenueCents);
  metrics.setGauge('creator_net.cents.month_to_date', stats.creatorNetCents);
  metrics.setGauge('orders.month_to_date', stats.orders);
  metrics.setGauge('active_creators_with_sales.month_to_date', stats.activeCreatorsWithSales);
  metrics.setGauge('published_listings', stats.publishedListings);
}

function badRequest(res: ServerResponse, error: unknown): void {
  const status = error instanceof MarketplaceHttpError ? error.status : 400;
  jsonResponse(res, status, {
    error: {
      code: error instanceof MarketplaceHttpError ? error.code : 'BAD_REQUEST',
      message: error instanceof Error ? error.message : String(error),
    },
  });
}

class MarketplaceHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requiredString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${key} is required`);
  }
  return value.trim();
}

function optionalString(input: Record<string, unknown>, key: string): string | undefined {
  const value = input[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new Error(`${key} must be a string`);
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function optionalNumber(input: Record<string, unknown>, key: string, fallback: number): number {
  const value = input[key];
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${key} must be a finite number`);
  return value;
}

function optionalQueryNumber(params: URLSearchParams, key: string): number | undefined {
  const value = params.get(key);
  if (value === null || value.trim().length === 0) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${key} must be a finite number`);
  return parsed;
}

function optionalQueryNonNegativeInteger(params: URLSearchParams, key: string): number | undefined {
  const value = optionalQueryNumber(params, key);
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || value < 0) throw new Error(`${key} must be a non-negative integer`);
  return value;
}

function optionalBodyNonNegativeInteger(input: Record<string, unknown>, key: string): number | undefined {
  const value = input[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(`${key} must be a non-negative integer`);
  }
  return value;
}

function optionalBoolean(input: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const value = input[key];
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') throw new Error(`${key} must be a boolean`);
  return value;
}

function requiredBoolean(input: Record<string, unknown>, key: string): boolean {
  const value = input[key];
  if (typeof value !== 'boolean') throw new Error(`${key} must be a boolean`);
  return value;
}

function readStringArray(input: Record<string, unknown>, key: string): string[] | undefined {
  const value = input[key];
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error(`${key} must be an array`);
  return value.flatMap((entry) => {
    if (typeof entry !== 'string') return [];
    const trimmed = entry.trim();
    return trimmed.length > 0 ? [trimmed] : [];
  });
}

async function readBodyText(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new Error('request body too large');
    chunks.push(buffer);
  }
  return chunks.length === 0 ? '' : Buffer.concat(chunks).toString('utf8');
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const raw = await readBodyText(req);
  if (!raw) return {};
  return JSON.parse(raw);
}

async function readJsonWithRawBody(req: IncomingMessage): Promise<{ body: unknown; rawBody: string }> {
  const rawBody = await readBodyText(req);
  return {
    body: rawBody ? JSON.parse(rawBody) : {},
    rawBody,
  };
}

function creatorFromBody(body: unknown): Creator {
  if (!isRecord(body)) throw new Error('creator body must be an object');
  const email = optionalString(body, 'email');
  const stripeConnectAccountId = optionalString(body, 'stripeConnectAccountId');
  const taxProfileId = optionalString(body, 'taxProfileId');
  return {
    id: requiredString(body, 'id'),
    displayName: requiredString(body, 'displayName'),
    country: requiredString(body, 'country'),
    ...(email ? { email } : {}),
    monthlyGmvCents: optionalNumber(body, 'monthlyGmvCents', 0),
    lifetimeGmvCents: optionalNumber(body, 'lifetimeGmvCents', 0),
    active: optionalBoolean(body, 'active', true),
    ...(stripeConnectAccountId ? { stripeConnectAccountId } : {}),
    ...(taxProfileId ? { taxProfileId } : {}),
  };
}

function listingDraftFromBody(body: unknown): {
  draft: ListingDraft;
  creatorRankByGmv?: number;
  creatorCount?: number;
} {
  if (!isRecord(body)) throw new Error('listing body must be an object');
  const category = requiredString(body, 'category');
  const priceCents = optionalNumber(body, 'priceCents', Number.NaN);
  const currency = optionalString(body, 'currency');
  const tags = readStringArray(body, 'tags');
  const proModule = body.proModule === undefined
    ? undefined
    : publicProModuleListingMetadataFromEnvelope(body.proModule);
  if (!LISTING_CATEGORIES.has(category as ListingCategory)) throw new Error('category is not supported');
  if (!Number.isInteger(priceCents)) throw new Error('priceCents must be an integer');
  if (currency && currency !== 'usd') throw new Error('currency is not supported');
  const draft: ListingDraft = {
    creatorId: requiredString(body, 'creatorId'),
    title: requiredString(body, 'title'),
    description: requiredString(body, 'description'),
    category: category as ListingCategory,
    priceCents,
    licenseSummary: requiredString(body, 'licenseSummary'),
    ...(currency ? { currency: 'usd' } : {}),
    ...(tags ? { tags } : {}),
    ...(proModule ? { proModule } : {}),
  };
  const creatorRankByGmv = optionalNumber(body, 'creatorRankByGmv', 0);
  const creatorCount = optionalNumber(body, 'creatorCount', 0);
  return {
    draft,
    ...(creatorRankByGmv > 0 ? { creatorRankByGmv } : {}),
    ...(creatorCount > 0 ? { creatorCount } : {}),
  };
}

function orderFromBody(body: unknown): {
  listingId: string;
  buyerId: string;
  buyerTaxAddress?: TaxAddress;
  stripeTaxCalculationId?: string;
  stripeTaxTransactionId?: string;
  taxAmountCents?: number;
} {
  if (!isRecord(body)) throw new Error('order body must be an object');
  const buyerTaxAddress = body.buyerTaxAddress === undefined ? undefined : taxAddressFromBody(body.buyerTaxAddress);
  const stripeTaxCalculationId = optionalString(body, 'stripeTaxCalculationId');
  const stripeTaxTransactionId = optionalString(body, 'stripeTaxTransactionId');
  const taxAmountCents = optionalNumber(body, 'taxAmountCents', Number.NaN);
  return {
    listingId: requiredString(body, 'listingId'),
    buyerId: requiredString(body, 'buyerId'),
    ...(buyerTaxAddress ? { buyerTaxAddress } : {}),
    ...(stripeTaxCalculationId ? { stripeTaxCalculationId } : {}),
    ...(stripeTaxTransactionId ? { stripeTaxTransactionId } : {}),
    ...(Number.isFinite(taxAmountCents) ? { taxAmountCents } : {}),
  };
}

function taxPreviewFromBody(body: unknown): { listingId: string; buyerId: string; buyerTaxAddress?: TaxAddress } {
  if (!isRecord(body)) throw new Error('tax preview body must be an object');
  const buyerTaxAddress = body.buyerTaxAddress === undefined ? undefined : taxAddressFromBody(body.buyerTaxAddress);
  return {
    listingId: requiredString(body, 'listingId'),
    buyerId: requiredString(body, 'buyerId'),
    ...(buyerTaxAddress ? { buyerTaxAddress } : {}),
  };
}

function checkoutPlanFromBody(body: unknown, allowedRedirectOrigin?: string): {
  listingId: string;
  buyerId: string;
  successUrl: string;
  cancelUrl: string;
} {
  if (!isRecord(body)) throw new Error('checkout plan body must be an object');
  const successUrl = httpUrlFromBody(body, 'successUrl');
  const cancelUrl = httpUrlFromBody(body, 'cancelUrl');
  assertAllowedMarketplaceRedirectOrigin(successUrl, 'successUrl', allowedRedirectOrigin);
  assertAllowedMarketplaceRedirectOrigin(cancelUrl, 'cancelUrl', allowedRedirectOrigin);
  return {
    listingId: requiredString(body, 'listingId'),
    buyerId: requiredString(body, 'buyerId'),
    successUrl,
    cancelUrl,
  };
}

function checkoutCompletedEventFromBody(body: unknown): StripeCheckoutCompletedEvent {
  if (!isRecord(body)) throw new Error('Checkout fulfillment body must be a Stripe event object');
  requiredString(body, 'id');
  if (requiredString(body, 'type') !== 'checkout.session.completed') {
    throw new Error('event type must be checkout.session.completed');
  }
  const data = body.data;
  if (!isRecord(data)) throw new Error('event data must be an object');
  const object = data.object;
  if (!isRecord(object)) throw new Error('event data.object must be a Checkout Session');
  if (requiredString(object, 'id').length === 0) throw new Error('Checkout Session id is required');
  if (requiredString(object, 'object') !== 'checkout.session') throw new Error('event data.object must be a Checkout Session');
  return body as unknown as StripeCheckoutCompletedEvent;
}

function taxAddressFromBody(body: unknown): TaxAddress {
  if (!isRecord(body)) throw new Error('buyerTaxAddress must be an object');
  const country = requiredString(body, 'country').toUpperCase();
  if (!/^[A-Z]{2}$/u.test(country)) throw new Error('buyerTaxAddress.country must be an ISO 3166-1 alpha-2 country code');
  const postalCode = optionalString(body, 'postalCode');
  const state = optionalString(body, 'state');
  const city = optionalString(body, 'city');
  const line1 = optionalString(body, 'line1');
  const line2 = optionalString(body, 'line2');
  return {
    country,
    ...(postalCode ? { postalCode } : {}),
    ...(state ? { state } : {}),
    ...(city ? { city } : {}),
    ...(line1 ? { line1 } : {}),
    ...(line2 ? { line2 } : {}),
  };
}

function reviewerFromBody(body: unknown): { reviewerId: string } {
  if (!isRecord(body)) throw new Error('review approval body must be an object');
  return { reviewerId: requiredString(body, 'reviewerId') };
}

function entitlementClaimFromBody(body: unknown): MarketplaceEntitlementClaimInput {
  if (!isRecord(body)) throw new Error('entitlement claim body must be an object');
  const moduleId = optionalString(body, 'moduleId');
  const entitlementSku = optionalString(body, 'entitlementSku');
  const entitlementGrantKey = optionalString(body, 'entitlementGrantKey');
  if (!moduleId && !entitlementSku && !entitlementGrantKey) {
    throw new Error('entitlement claim must include moduleId, entitlementSku, or entitlementGrantKey');
  }
  return {
    lookupKey: requiredString(body, 'lookupKey'),
    licenseHash: requiredString(body, 'licenseHash'),
    ...(moduleId ? { moduleId } : {}),
    ...(entitlementSku ? { entitlementSku } : {}),
    ...(entitlementGrantKey ? { entitlementGrantKey } : {}),
  };
}

function riskEventFromBody(body: unknown): MarketplaceRiskEventDraft {
  if (!isRecord(body)) throw new Error('risk event body must be an object');
  const type = requiredString(body, 'type');
  if (!RISK_EVENT_TYPES.has(type as MarketplaceRiskEventType)) throw new Error('risk event type is not supported');
  const status = optionalString(body, 'status');
  if (status && !RISK_EVENT_STATUSES.has(status as MarketplaceRiskEventStatus)) {
    throw new Error('risk event status is not supported');
  }
  const amountCents = optionalNumber(body, 'amountCents', Number.NaN);
  if (!Number.isInteger(amountCents)) throw new Error('amountCents must be an integer');
  const reason = optionalString(body, 'reason');
  const stripeEventId = optionalString(body, 'stripeEventId');
  const stripeRefundId = optionalString(body, 'stripeRefundId');
  const stripeDisputeId = optionalString(body, 'stripeDisputeId');
  const refundBlocked = optionalBoolean(body, 'refundBlocked', false);
  return {
    type: type as MarketplaceRiskEventType,
    orderId: requiredString(body, 'orderId'),
    amountCents,
    ...(status ? { status: status as MarketplaceRiskEventStatus } : {}),
    ...(reason ? { reason } : {}),
    ...(stripeEventId ? { stripeEventId } : {}),
    ...(stripeRefundId ? { stripeRefundId } : {}),
    ...(stripeDisputeId ? { stripeDisputeId } : {}),
    ...(refundBlocked ? { refundBlocked } : {}),
  };
}

function refundFromBody(orderId: string, body: unknown): {
  orderId: string;
  amountCents: number;
  reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer';
  actorId?: string;
  actorType?: 'admin' | 'system';
} {
  if (!isRecord(body)) throw new Error('refund body must be an object');
  const amountCents = optionalNumber(body, 'amountCents', Number.NaN);
  if (!Number.isInteger(amountCents)) throw new Error('amountCents must be an integer');
  const rawReason = optionalString(body, 'reason');
  if (rawReason && rawReason !== 'duplicate' && rawReason !== 'fraudulent' && rawReason !== 'requested_by_customer') {
    throw new Error('refund reason is not supported');
  }
  const reason = rawReason as 'duplicate' | 'fraudulent' | 'requested_by_customer' | undefined;
  const actorId = optionalString(body, 'actorId');
  const rawActorType = optionalString(body, 'actorType');
  if (rawActorType && rawActorType !== 'admin' && rawActorType !== 'system') {
    throw new Error('refund actorType must be admin or system');
  }
  const actorType = rawActorType as 'admin' | 'system' | undefined;
  return {
    orderId,
    amountCents,
    ...(reason ? { reason } : {}),
    ...(actorId ? { actorId } : {}),
    ...(actorType ? { actorType } : {}),
  };
}

function payoutReleaseFromBody(orderId: string, body: unknown): MarketplacePayoutReleaseInput {
  if (!isRecord(body)) throw new Error('payout release body must be an object');
  const actorId = optionalString(body, 'actorId');
  const rawActorType = optionalString(body, 'actorType');
  if (rawActorType && rawActorType !== 'admin' && rawActorType !== 'system') {
    throw new Error('payout release actorType must be admin or system');
  }
  const actorType = rawActorType as 'admin' | 'system' | undefined;
  const from = optionalBodyNonNegativeInteger(body, 'from');
  const to = optionalBodyNonNegativeInteger(body, 'to');
  const availableReserveCents = optionalBodyNonNegativeInteger(body, 'availableReserveCents');
  const reportedRefundsCents = optionalBodyNonNegativeInteger(body, 'reportedRefundsCents');
  const reportedDisputeCents = optionalBodyNonNegativeInteger(body, 'reportedDisputeCents');
  const minimumReserveBps = optionalBodyNonNegativeInteger(body, 'minimumReserveBps');
  const minimumReserveCents = optionalBodyNonNegativeInteger(body, 'minimumReserveCents');
  const maximumRefundRateBps = optionalBodyNonNegativeInteger(body, 'maximumRefundRateBps');
  const maximumDisputeRateBps = optionalBodyNonNegativeInteger(body, 'maximumDisputeRateBps');
  const maximumUnreservedPayoutExposureBps = optionalBodyNonNegativeInteger(
    body,
    'maximumUnreservedPayoutExposureBps',
  );
  return {
    orderId,
    ...(from !== undefined ? { from } : {}),
    ...(to !== undefined ? { to } : {}),
    ...(availableReserveCents !== undefined ? { availableReserveCents } : {}),
    ...(reportedRefundsCents !== undefined ? { reportedRefundsCents } : {}),
    ...(reportedDisputeCents !== undefined ? { reportedDisputeCents } : {}),
    ...(minimumReserveBps !== undefined ? { minimumReserveBps } : {}),
    ...(minimumReserveCents !== undefined ? { minimumReserveCents } : {}),
    ...(maximumRefundRateBps !== undefined ? { maximumRefundRateBps } : {}),
    ...(maximumDisputeRateBps !== undefined ? { maximumDisputeRateBps } : {}),
    ...(maximumUnreservedPayoutExposureBps !== undefined ? { maximumUnreservedPayoutExposureBps } : {}),
    ...(actorId ? { actorId } : {}),
    ...(actorType ? { actorType } : {}),
  };
}

/**
 * Translate a raw Stripe `charge.dispute.created` / `charge.dispute.closed` /
 * `charge.refunded` webhook event into a MarketplaceRiskEventDraft. Returns
 * undefined if the event payload doesn't contain enough information to identify
 * the originating marketplace order (which happens for legitimate Stripe events
 * that target non-marketplace charges, such as subscription payment refunds).
 *
 * Resolution rules:
 *   - Look up the order by `payment_intent` first (most stable).
 *   - Fall back to `metadata.greybox_order_id` if Stripe ever omits the PI.
 *   - For disputes: type='dispute', status mapped from Stripe's dispute.status.
 *   - For refunds: type='refund', status='resolved', stripeRefundId from the newest charge.refunds entry.
 */
function stripeEventToRiskEventDraft(
  event: unknown,
  store: InMemoryMarketplaceStore,
): MarketplaceRiskEventDraft | undefined {
  if (!isRecord(event)) return undefined;
  const data = isRecord(event.data) ? event.data : undefined;
  const object = data && isRecord(data.object) ? data.object : undefined;
  if (!object) return undefined;
  const type = typeof event.type === 'string' ? event.type : '';
  const paymentIntent = typeof object.payment_intent === 'string' ? object.payment_intent : undefined;
  const metadata = isRecord(object.metadata) ? object.metadata : undefined;
  const metadataOrderId = metadata && typeof metadata.greybox_order_id === 'string' ? metadata.greybox_order_id : undefined;
  const order = resolveOrderForStripeEvent(store, {
    ...(paymentIntent ? { paymentIntentId: paymentIntent } : {}),
    ...(metadataOrderId ? { orderIdFromMetadata: metadataOrderId } : {}),
  });
  if (!order) return undefined;

  if (type === 'charge.dispute.created' || type === 'charge.dispute.closed') {
    const amount = Number(object.amount ?? 0);
    if (!Number.isInteger(amount) || amount <= 0) return undefined;
    const disputeId = typeof object.id === 'string' ? object.id : undefined;
    if (!disputeId) return undefined;
    const stripeStatus = typeof object.status === 'string' ? object.status : '';
    // Map Stripe dispute.status onto the marketplace risk-event status.
    let status: MarketplaceRiskEventStatus = 'open';
    if (stripeStatus === 'won' || stripeStatus === 'warning_closed') status = 'won';
    else if (stripeStatus === 'lost' || stripeStatus === 'charge_refunded') status = 'lost';
    return {
      type: 'dispute',
      orderId: order.id,
      amountCents: Math.min(amount, order.grossCents),
      status,
      ...(typeof event.id === 'string' ? { stripeEventId: event.id } : {}),
      stripeDisputeId: disputeId,
    };
  }
  if (type === 'charge.refunded') {
    const refunds = isRecord(object.refunds) ? object.refunds : undefined;
    const data = refunds && Array.isArray(refunds.data) ? refunds.data : [];
    const latest = newestStripeRefund(data);
    if (!isRecord(latest)) return undefined;
    const refundId = typeof latest.id === 'string' ? latest.id : undefined;
    const amount = Number(latest.amount ?? 0);
    if (!refundId || !Number.isInteger(amount) || amount <= 0) return undefined;
    return {
      type: 'refund',
      orderId: order.id,
      amountCents: Math.min(amount, order.grossCents),
      status: 'resolved',
      ...(typeof event.id === 'string' ? { stripeEventId: event.id } : {}),
      stripeRefundId: refundId,
    };
  }
  return undefined;
}

function stripeEventMatchesScopedRiskRoute(path: string, event: unknown): boolean {
  if (!isRecord(event) || typeof event.type !== 'string') return false;
  if (path === '/v1/marketplace/stripe-events/dispute') {
    return event.type === 'charge.dispute.created' || event.type === 'charge.dispute.closed';
  }
  if (path === '/v1/marketplace/stripe-events/refund') {
    return event.type === 'charge.refunded';
  }
  return false;
}

function ignoredStripeEventAuditInput(
  path: string,
  event: unknown,
  reason: 'wrong_stripe_event_route' | 'unmatched_stripe_event',
): Parameters<InMemoryMarketplaceStore['recordIgnoredStripeEvent']>[0] {
  const route = path === '/v1/marketplace/stripe-events/dispute'
    ? 'dispute'
    : path === '/v1/marketplace/stripe-events/refund'
      ? 'refund'
      : 'unknown';
  const data = isRecord(event) && isRecord(event.data) ? event.data : undefined;
  const object = data && isRecord(data.object) ? data.object : undefined;
  const metadata = object && isRecord(object.metadata) ? object.metadata : undefined;
  const refunds = object && isRecord(object.refunds) ? object.refunds : undefined;
  const directAmount = Number(object?.amount);
  let amountCents = Number.isInteger(directAmount) && directAmount > 0 ? directAmount : undefined;
  if (!amountCents && refunds) {
    const refundData = Array.isArray(refunds.data) ? refunds.data : [];
    const latestRefund = newestStripeRefund(refundData);
    const refundAmount = Number(latestRefund?.amount);
    amountCents = Number.isInteger(refundAmount) && refundAmount > 0 ? refundAmount : undefined;
  }
  return {
    route,
    reason,
    ...(isRecord(event) && typeof event.type === 'string' ? { eventType: event.type } : {}),
    ...(isRecord(event) && typeof event.id === 'string' ? { stripeEventId: event.id } : {}),
    hasPaymentIntent: typeof object?.payment_intent === 'string',
    hasMetadataOrderId: typeof metadata?.greybox_order_id === 'string',
    ...(amountCents ? { amountCents } : {}),
  };
}

function newestStripeRefund(data: unknown[]): Record<string, unknown> | undefined {
  let fallback: Record<string, unknown> | undefined;
  let newest: Record<string, unknown> | undefined;
  let newestCreated = Number.NEGATIVE_INFINITY;
  for (const item of data) {
    if (!isRecord(item)) continue;
    fallback = item;
    const created = Number(item.created);
    if (Number.isFinite(created) && created >= newestCreated) {
      newest = item;
      newestCreated = created;
    }
  }
  return newest ?? fallback;
}

function resolveOrderForStripeEvent(
  store: InMemoryMarketplaceStore,
  lookup: { paymentIntentId?: string; orderIdFromMetadata?: string },
): { id: string; grossCents: number } | undefined {
  if (lookup.paymentIntentId) {
    const fromPaymentIntent = store.orderByStripePaymentIntent(lookup.paymentIntentId);
    if (fromPaymentIntent) {
      const fromMetadata = lookup.orderIdFromMetadata ? store.order(lookup.orderIdFromMetadata) : undefined;
      if (fromMetadata && fromMetadata.id !== fromPaymentIntent.id) return undefined;
      return { id: fromPaymentIntent.id, grossCents: fromPaymentIntent.grossCents };
    }
  }
  if (lookup.orderIdFromMetadata) {
    const fromMetadata = store.order(lookup.orderIdFromMetadata);
    if (fromMetadata) return { id: fromMetadata.id, grossCents: fromMetadata.grossCents };
  }
  return undefined;
}

function launchReadinessTargetsFromQuery(params: URLSearchParams): Partial<MarketplaceLaunchReadinessTargets> {
  const monthlyGmvCents = optionalQueryNonNegativeInteger(params, 'monthlyGmvCents');
  const activeCreatorsWithSales = optionalQueryNonNegativeInteger(params, 'activeCreatorsWithSales');
  const minimumPublishedListings = optionalQueryNonNegativeInteger(params, 'minimumPublishedListings');
  const maximumPendingHumanReviews = optionalQueryNonNegativeInteger(params, 'maximumPendingHumanReviews');
  const maximumBlockedPayouts = optionalQueryNonNegativeInteger(params, 'maximumBlockedPayouts');
  const maximumTaxComplianceIssues = optionalQueryNonNegativeInteger(params, 'maximumTaxComplianceIssues');
  return {
    ...(monthlyGmvCents !== undefined ? { monthlyGmvCents } : {}),
    ...(activeCreatorsWithSales !== undefined ? { activeCreatorsWithSales } : {}),
    ...(minimumPublishedListings !== undefined ? { minimumPublishedListings } : {}),
    ...(maximumPendingHumanReviews !== undefined ? { maximumPendingHumanReviews } : {}),
    ...(maximumBlockedPayouts !== undefined ? { maximumBlockedPayouts } : {}),
    ...(maximumTaxComplianceIssues !== undefined ? { maximumTaxComplianceIssues } : {}),
  };
}

function creatorActivationTargetsFromQuery(params: URLSearchParams): Partial<MarketplaceCreatorActivationTargets> {
  const monthlyGmvCents = optionalQueryNonNegativeInteger(params, 'monthlyGmvCents');
  const activeCreatorsWithSales = optionalQueryNonNegativeInteger(params, 'activeCreatorsWithSales');
  const minimumActiveCreators = optionalQueryNonNegativeInteger(params, 'minimumActiveCreators');
  const repeatSellers = optionalQueryNonNegativeInteger(params, 'repeatSellers');
  const repeatSellerMinimumOrders = optionalQueryNonNegativeInteger(params, 'repeatSellerMinimumOrders');
  return {
    ...(monthlyGmvCents !== undefined ? { monthlyGmvCents } : {}),
    ...(activeCreatorsWithSales !== undefined ? { activeCreatorsWithSales } : {}),
    ...(minimumActiveCreators !== undefined ? { minimumActiveCreators } : {}),
    ...(repeatSellers !== undefined ? { repeatSellers } : {}),
    ...(repeatSellerMinimumOrders !== undefined ? { repeatSellerMinimumOrders } : {}),
  };
}

function platformReadinessTargetsFromQuery(params: URLSearchParams): Partial<MarketplacePlatformReadinessTargets> {
  const monthlyGmvCents = optionalQueryNonNegativeInteger(params, 'monthlyGmvCents');
  const activeCreatorsWithSales = optionalQueryNonNegativeInteger(params, 'activeCreatorsWithSales')
    ?? optionalQueryNonNegativeInteger(params, 'activeSellers');
  const minimumUniqueBuyers = optionalQueryNonNegativeInteger(params, 'minimumUniqueBuyers')
    ?? optionalQueryNonNegativeInteger(params, 'uniqueBuyers');
  const minimumPublishedListings = optionalQueryNonNegativeInteger(params, 'minimumPublishedListings');
  const repeatSellers = optionalQueryNonNegativeInteger(params, 'repeatSellers');
  const repeatSellerMinimumOrders = optionalQueryNonNegativeInteger(params, 'repeatSellerMinimumOrders');
  const maximumTopCreatorGmvShareBps = optionalQueryNonNegativeInteger(params, 'maximumTopCreatorGmvShareBps');
  const maximumTopBuyerGmvShareBps = optionalQueryNonNegativeInteger(params, 'maximumTopBuyerGmvShareBps');
  const minimumPlatformTakeRateBps = optionalQueryNonNegativeInteger(params, 'minimumPlatformTakeRateBps');
  const minimumCheckoutOrderShareBps = optionalQueryNonNegativeInteger(params, 'minimumCheckoutOrderShareBps');
  const minimumCheckoutGmvShareBps = optionalQueryNonNegativeInteger(params, 'minimumCheckoutGmvShareBps');
  const minimumSettledPayoutShareBps = optionalQueryNonNegativeInteger(params, 'minimumSettledPayoutShareBps');
  const maximumPendingHumanReviews = optionalQueryNonNegativeInteger(params, 'maximumPendingHumanReviews');
  const maximumBlockedPayouts = optionalQueryNonNegativeInteger(params, 'maximumBlockedPayouts');
  const maximumTaxComplianceIssues = optionalQueryNonNegativeInteger(params, 'maximumTaxComplianceIssues');
  const availableReserveCents = optionalQueryNonNegativeInteger(params, 'availableReserveCents');
  const reportedRefundsCents = optionalQueryNonNegativeInteger(params, 'reportedRefundsCents');
  const reportedDisputeCents = optionalQueryNonNegativeInteger(params, 'reportedDisputeCents');
  const minimumReserveBps = optionalQueryNonNegativeInteger(params, 'minimumReserveBps');
  const minimumReserveCents = optionalQueryNonNegativeInteger(params, 'minimumReserveCents');
  const maximumRefundRateBps = optionalQueryNonNegativeInteger(params, 'maximumRefundRateBps');
  const maximumDisputeRateBps = optionalQueryNonNegativeInteger(params, 'maximumDisputeRateBps');
  const maximumUnreservedPayoutExposureBps = optionalQueryNonNegativeInteger(params, 'maximumUnreservedPayoutExposureBps');
  return {
    ...(monthlyGmvCents !== undefined ? { monthlyGmvCents } : {}),
    ...(activeCreatorsWithSales !== undefined ? { activeCreatorsWithSales } : {}),
    ...(minimumUniqueBuyers !== undefined ? { minimumUniqueBuyers } : {}),
    ...(minimumPublishedListings !== undefined ? { minimumPublishedListings } : {}),
    ...(repeatSellers !== undefined ? { repeatSellers } : {}),
    ...(repeatSellerMinimumOrders !== undefined ? { repeatSellerMinimumOrders } : {}),
    ...(maximumTopCreatorGmvShareBps !== undefined ? { maximumTopCreatorGmvShareBps } : {}),
    ...(maximumTopBuyerGmvShareBps !== undefined ? { maximumTopBuyerGmvShareBps } : {}),
    ...(minimumPlatformTakeRateBps !== undefined ? { minimumPlatformTakeRateBps } : {}),
    ...(minimumCheckoutOrderShareBps !== undefined ? { minimumCheckoutOrderShareBps } : {}),
    ...(minimumCheckoutGmvShareBps !== undefined ? { minimumCheckoutGmvShareBps } : {}),
    ...(minimumSettledPayoutShareBps !== undefined ? { minimumSettledPayoutShareBps } : {}),
    ...(maximumPendingHumanReviews !== undefined ? { maximumPendingHumanReviews } : {}),
    ...(maximumBlockedPayouts !== undefined ? { maximumBlockedPayouts } : {}),
    ...(maximumTaxComplianceIssues !== undefined ? { maximumTaxComplianceIssues } : {}),
    ...(availableReserveCents !== undefined ? { availableReserveCents } : {}),
    ...(reportedRefundsCents !== undefined ? { reportedRefundsCents } : {}),
    ...(reportedDisputeCents !== undefined ? { reportedDisputeCents } : {}),
    ...(minimumReserveBps !== undefined ? { minimumReserveBps } : {}),
    ...(minimumReserveCents !== undefined ? { minimumReserveCents } : {}),
    ...(maximumRefundRateBps !== undefined ? { maximumRefundRateBps } : {}),
    ...(maximumDisputeRateBps !== undefined ? { maximumDisputeRateBps } : {}),
    ...(maximumUnreservedPayoutExposureBps !== undefined ? { maximumUnreservedPayoutExposureBps } : {}),
  };
}

function riskReserveOptionsFromQuery(params: URLSearchParams): MarketplaceRiskReserveOptions {
  const from = optionalQueryNonNegativeInteger(params, 'from');
  const to = optionalQueryNonNegativeInteger(params, 'to');
  const availableReserveCents = optionalQueryNonNegativeInteger(params, 'availableReserveCents');
  const reportedRefundsCents = optionalQueryNonNegativeInteger(params, 'reportedRefundsCents');
  const reportedDisputeCents = optionalQueryNonNegativeInteger(params, 'reportedDisputeCents');
  const minimumReserveBps = optionalQueryNonNegativeInteger(params, 'minimumReserveBps');
  const minimumReserveCents = optionalQueryNonNegativeInteger(params, 'minimumReserveCents');
  const maximumRefundRateBps = optionalQueryNonNegativeInteger(params, 'maximumRefundRateBps');
  const maximumDisputeRateBps = optionalQueryNonNegativeInteger(params, 'maximumDisputeRateBps');
  const maximumUnreservedPayoutExposureBps = optionalQueryNonNegativeInteger(params, 'maximumUnreservedPayoutExposureBps');
  return {
    ...(from !== undefined ? { from } : {}),
    ...(to !== undefined ? { to } : {}),
    ...(availableReserveCents !== undefined ? { availableReserveCents } : {}),
    ...(reportedRefundsCents !== undefined ? { reportedRefundsCents } : {}),
    ...(reportedDisputeCents !== undefined ? { reportedDisputeCents } : {}),
    ...(minimumReserveBps !== undefined ? { minimumReserveBps } : {}),
    ...(minimumReserveCents !== undefined ? { minimumReserveCents } : {}),
    ...(maximumRefundRateBps !== undefined ? { maximumRefundRateBps } : {}),
    ...(maximumDisputeRateBps !== undefined ? { maximumDisputeRateBps } : {}),
    ...(maximumUnreservedPayoutExposureBps !== undefined ? { maximumUnreservedPayoutExposureBps } : {}),
  };
}

function onboardingUrlsFromBody(
  body: unknown,
  allowedRedirectOrigin?: string,
): { returnUrl: string; refreshUrl: string } {
  if (!isRecord(body)) throw new Error('onboarding body must be an object');
  const returnUrl = httpUrlFromBody(body, 'returnUrl');
  const refreshUrl = httpUrlFromBody(body, 'refreshUrl');
  assertAllowedMarketplaceRedirectOrigin(returnUrl, 'returnUrl', allowedRedirectOrigin);
  assertAllowedMarketplaceRedirectOrigin(refreshUrl, 'refreshUrl', allowedRedirectOrigin);
  return {
    returnUrl,
    refreshUrl,
  };
}

function taxProfileRecordFromBody(body: unknown): CreatorTaxProfileRecordInput {
  if (!isRecord(body)) throw new Error('tax profile body must be an object');
  const provider = optionalString(body, 'provider');
  if (provider && !TAX_PROFILE_PROVIDERS.has(provider as CreatorTaxProfileProvider)) {
    throw new Error('tax profile provider is not supported');
  }
  const country = optionalString(body, 'country');
  const collectedAt = optionalBodyNonNegativeInteger(body, 'collectedAt');
  if (collectedAt === 0) throw new Error('collectedAt must be a positive integer timestamp');
  const actorId = optionalString(body, 'actorId');
  const rawActorType = optionalString(body, 'actorType');
  if (rawActorType && rawActorType !== 'admin' && rawActorType !== 'system') {
    throw new Error('tax profile actorType must be admin or system');
  }
  const actorType = rawActorType as 'admin' | 'system' | undefined;
  return {
    taxProfileId: requiredString(body, 'taxProfileId'),
    ...(provider ? { provider: provider as CreatorTaxProfileProvider } : {}),
    ...(country ? { country } : {}),
    ...(collectedAt !== undefined ? { collectedAt } : {}),
    ...(actorId ? { actorId } : {}),
    ...(actorType ? { actorType } : {}),
  };
}

function stripeConnectAccountStatusFromBody(body: unknown): StripeConnectAccountStatusRecordInput {
  if (!isRecord(body)) throw new Error('Stripe Connect account status body must be an object');
  const disabledReason = optionalString(body, 'disabledReason');
  const syncedAt = optionalBodyNonNegativeInteger(body, 'syncedAt');
  if (syncedAt === 0) throw new Error('syncedAt must be a positive integer timestamp');
  const actorId = optionalString(body, 'actorId');
  const rawActorType = optionalString(body, 'actorType');
  if (rawActorType && rawActorType !== 'admin' && rawActorType !== 'system' && rawActorType !== 'webhook') {
    throw new Error('Stripe Connect status actorType must be admin, system, or webhook');
  }
  const actorType = rawActorType as 'admin' | 'system' | 'webhook' | undefined;
  return {
    onboardingComplete: requiredBoolean(body, 'onboardingComplete'),
    transfersEnabled: requiredBoolean(body, 'transfersEnabled'),
    ...(disabledReason ? { disabledReason } : {}),
    ...(syncedAt !== undefined ? { syncedAt } : {}),
    ...(actorId ? { actorId } : {}),
    ...(actorType ? { actorType } : {}),
  };
}

function httpUrlFromBody(body: Record<string, unknown>, key: string): string {
  const value = requiredString(body, key);
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${key} must be an http(s) URL`);
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`${key} must be an http(s) URL`);
  }
  return value;
}

function assertAllowedMarketplaceRedirectOrigin(value: string, key: string, allowedOrigin: string | undefined): void {
  if (!allowedOrigin) return;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${key} must be an http(s) URL`);
  }
  if (parsed.origin !== allowedOrigin) {
    throw new Error(`${key} must use the GREYBOX_MARKETPLACE_PUBLIC_BASE_URL origin in production`);
  }
}

function normalizeMarketplacePublicBaseUrl(value: string | undefined, allowLocalHttp = false): string | undefined {
  const clean = value?.trim();
  if (!clean) return undefined;
  let url: URL;
  try {
    url = new URL(clean);
  } catch {
    return undefined;
  }
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return undefined;
  if (url.protocol === 'https:') return url.origin;
  if (allowLocalHttp && url.protocol === 'http:' && isLoopbackHost(url.hostname)) return url.origin;
  return undefined;
}

function isHostedMarketplacePublicOrigin(origin: string): boolean {
  const url = new URL(origin);
  return url.protocol === 'https:'
    && !isLoopbackHost(url.hostname)
    && isIP(url.hostname) === 0
    && url.hostname.includes('.');
}

function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().replace(/^\[|\]$/gu, '').toLowerCase();
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1';
}

function marketplaceTokenFromHeaders(req: IncomingMessage): string | undefined {
  const explicit = req.headers['x-greybox-marketplace-token'];
  if (typeof explicit === 'string' && explicit.trim().length > 0) return explicit.trim();
  const authorization = req.headers.authorization;
  if (!authorization?.startsWith('Bearer ')) return undefined;
  const token = authorization.slice('Bearer '.length).trim();
  return token.length > 0 ? token : undefined;
}

function marketplaceTokenDigest(token: string): Buffer {
  return createHash('sha256').update(token, 'utf8').digest();
}

function marketplaceTokenMatches(candidate: string | undefined, expected: string): boolean {
  if (!candidate) return false;
  return timingSafeEqual(marketplaceTokenDigest(candidate), marketplaceTokenDigest(expected));
}

function requireAdmin(req: IncomingMessage, adminToken: string | undefined): void {
  if (!adminToken) {
    throw new MarketplaceHttpError(503, 'MARKETPLACE_ADMIN_TOKEN_MISSING', 'marketplace admin token is not configured');
  }
  if (!marketplaceTokenMatches(marketplaceTokenFromHeaders(req), adminToken)) {
    throw new MarketplaceHttpError(401, 'UNAUTHORIZED', 'valid marketplace admin token required');
  }
}

function marketplaceEnv(options: MarketplaceApiOptions): MarketplaceApiEnv {
  return options.env ?? process.env;
}

function optionalEnvString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function resolvedAdminToken(options: MarketplaceApiOptions, env: MarketplaceApiEnv): string | undefined {
  return optionalEnvString(options.adminToken) ?? optionalEnvString(env.GREYBOX_MARKETPLACE_ADMIN_TOKEN);
}

function isHostedMarketplaceAdminTokenPlaceholder(token: string): boolean {
  const normalized = token.trim().toLowerCase();
  return normalized === 'marketplace-admin-token'
    || normalized === 'greybox-marketplace-admin-token'
    || HOSTED_MARKETPLACE_ADMIN_TOKEN_PLACEHOLDER_PATTERN.test(normalized);
}

function assertMarketplaceProductionSafety(input: {
  env: MarketplaceApiEnv;
  adminToken?: string;
  options: MarketplaceApiOptions;
  persistencePath?: string;
  auditPath?: string;
}): void {
  const isProduction = (input.env.NODE_ENV ?? '').toLowerCase() === 'production';
  if (!isProduction) return;

  if (
    !input.adminToken
    || input.adminToken.length < HOSTED_MARKETPLACE_ADMIN_TOKEN_MIN_LENGTH
    || isHostedMarketplaceAdminTokenPlaceholder(input.adminToken)
  ) {
    throw new Error(
      'createMarketplaceApi refused to start in NODE_ENV=production without ' +
      'GREYBOX_MARKETPLACE_ADMIN_TOKEN (or options.adminToken) of at least 32 non-placeholder characters.',
    );
  }

  if (!input.options.store && !input.persistencePath) {
    throw new Error(
      'createMarketplaceApi refused to start in NODE_ENV=production without ' +
      'GREYBOX_MARKETPLACE_STORE_FILE or an explicitly supplied durable store.',
    );
  }

  if (!input.options.store && !input.options.auditLog && !input.auditPath) {
    throw new Error(
      'createMarketplaceApi refused to start in NODE_ENV=production without ' +
      'GREYBOX_MARKETPLACE_AUDIT_LOG_PATH or an explicitly supplied auditLog.',
    );
  }

  const stripeSecretKey = optionalEnvString(input.env.STRIPE_SECRET_KEY);
  if (stripeSecretKey) assertHostedStripeSecretKey('createMarketplaceApi', stripeSecretKey);
  assertHostedStripeWebhookSecret(
    'createMarketplaceApi',
    optionalEnvString(input.env.GREYBOX_MARKETPLACE_STRIPE_WEBHOOK_SECRET),
  );

  if (!input.options.checkoutClient && !stripeSecretKey) {
    throw new Error(
      'createMarketplaceApi refused to start in NODE_ENV=production without ' +
      'STRIPE_SECRET_KEY or an explicitly supplied checkoutClient.',
    );
  }

  const dryRunMode = input.env.STRIPE_CONNECT_DRY_RUN;
  if (stripeSecretKey && dryRunMode !== '0' && dryRunMode !== '1') {
    throw new Error(
      'createMarketplaceApi refused to start in NODE_ENV=production without explicit ' +
      'STRIPE_CONNECT_DRY_RUN=0 or STRIPE_CONNECT_DRY_RUN=1.',
    );
  }
  if (dryRunMode === '1' && !productionDryRunBreakGlassAllowed(input.env)) {
    throw new Error(productionDryRunBreakGlassMessage('createMarketplaceApi'));
  }

  const publicBaseUrl = normalizeMarketplacePublicBaseUrl(
    input.options.publicBaseUrl ?? input.env.GREYBOX_MARKETPLACE_PUBLIC_BASE_URL,
  );
  if (!publicBaseUrl || !isHostedMarketplacePublicOrigin(publicBaseUrl)) {
    throw new Error(
      'createMarketplaceApi refused to start in NODE_ENV=production without ' +
      'GREYBOX_MARKETPLACE_PUBLIC_BASE_URL set to the canonical hosted HTTPS marketplace origin.',
    );
  }
}

export function createMarketplaceApi(options: MarketplaceApiOptions = {}) {
  const env = marketplaceEnv(options);
  const adminToken = resolvedAdminToken(options, env);
  const persistencePath = options.persistencePath ?? optionalEnvString(env.GREYBOX_MARKETPLACE_STORE_FILE);
  const auditPath = optionalEnvString(env.GREYBOX_MARKETPLACE_AUDIT_LOG_PATH);
  assertMarketplaceProductionSafety({
    env,
    options,
    ...(adminToken ? { adminToken } : {}),
    ...(persistencePath ? { persistencePath } : {}),
    ...(auditPath ? { auditPath } : {}),
  });

  const store = options.store ?? marketplaceStoreFromOptions(options, env, persistencePath, auditPath);
  const metrics = options.metrics ?? new MarketplaceMetricsRegistry();
  const stripeSecretKey = optionalEnvString(env.STRIPE_SECRET_KEY);
  const stripeApiBase = optionalEnvString(env.STRIPE_API_BASE);
  const stripeWebhookSecret = optionalEnvString(env.GREYBOX_MARKETPLACE_STRIPE_WEBHOOK_SECRET);
  const publicBaseUrl = normalizeMarketplacePublicBaseUrl(
    options.publicBaseUrl ?? env.GREYBOX_MARKETPLACE_PUBLIC_BASE_URL,
    true,
  );
  const hostedProduction = (env.NODE_ENV ?? '').toLowerCase() === 'production';
  const allowedRedirectOrigin = hostedProduction ? publicBaseUrl : undefined;
  const checkoutClient = options.checkoutClient
    ?? (stripeSecretKey
      ? new LiveStripeCheckoutClient({
          apiKey: stripeSecretKey,
          ...(stripeApiBase ? { stripeApiBase } : {}),
        })
      : undefined);

  return {
    store,
    metrics,
    async handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
      // Request ID propagation: same shape and rules as greybox-cloud so the
      // two services emit traceable IDs into a unified log pipeline.
      const requestId = normaliseRequestId(req.headers['x-request-id']) ?? randomRequestId();
      res.setHeader('X-Request-ID', requestId);
      configureResponseCors(req, res, allowedRedirectOrigin);
      enterMarketplaceAuditContext({ requestId });
      if (req.method === 'OPTIONS') {
        if (allowedRedirectOrigin && marketplaceRequestOrigin(req) !== allowedRedirectOrigin) {
          sendCorsForbidden(res);
          return;
        }
        noContent(res);
        return;
      }

      const url = new URL(req.url ?? '/', 'http://greybox-marketplace.local');
      const path = url.pathname;

      try {
        if (req.method === 'GET' && path === '/health') {
          jsonResponse(res, 200, { ok: true, service: 'greybox-marketplace' });
          return;
        }
        if (req.method === 'GET' && path === '/healthz') {
          jsonResponse(res, 200, { ok: true, status: 'live' });
          return;
        }
        if (req.method === 'GET' && path === '/readyz') {
          // Readiness probe: store reachable + payout provider initialised.
          // Failures return 503 so the load balancer can rotate this replica
          // out without restarting the pod.
          try {
            store.stats();
            jsonResponse(res, 200, { ok: true, status: 'ready', checks: { store: 'ok' } });
          } catch (err) {
            jsonResponse(res, 503, {
              ok: false,
              status: 'degraded',
              checks: { store: err instanceof Error ? err.message : 'unknown' },
            });
          }
          return;
        }
        if (req.method === 'GET' && path === '/metrics') {
          if (adminToken) requireAdmin(req, adminToken);
          // Sample stateful gauges before each scrape so ops dashboards
          // always see the freshest figures. Cheap: store.listRiskEvents()
          // is O(N) over an in-memory map, dominated by ledger size which
          // we expect in low thousands at GA scale.
          refreshStoreGauges(store, metrics);
          const accept = req.headers.accept ?? '';
          const formatQuery = url.searchParams.get('format')?.toLowerCase();
          const wantsPrometheus =
            formatQuery === 'prometheus'
            || accept.includes('text/plain')
            || accept.includes('application/openmetrics-text');
          if (wantsPrometheus) {
            const body = metrics.prometheusText();
            res.writeHead(200, {
              ...responseCorsHeaders(res),
              'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
              'Content-Length': Buffer.byteLength(body).toString(),
            });
            res.end(body);
            return;
          }
          jsonResponse(res, 200, metrics.snapshot());
          return;
        }
        if (req.method === 'GET' && path === '/v1/marketplace/stats') {
          requireAdmin(req, adminToken);
          jsonResponse(res, 200, { stats: store.stats() });
          return;
        }
        if (req.method === 'GET' && path === '/v1/marketplace/growth-targets') {
          requireAdmin(req, adminToken);
          jsonResponse(res, 200, { progress: store.growthProgress() });
          return;
        }
        if (req.method === 'GET' && path === '/v1/marketplace/creator-activation') {
          requireAdmin(req, adminToken);
          jsonResponse(res, 200, {
            report: store.creatorActivationReport(creatorActivationTargetsFromQuery(url.searchParams)),
          });
          return;
        }
        if (req.method === 'GET' && path === '/v1/marketplace/platform-readiness') {
          requireAdmin(req, adminToken);
          jsonResponse(res, 200, {
            report: store.platformReadiness(platformReadinessTargetsFromQuery(url.searchParams)),
          });
          return;
        }
        if (req.method === 'GET' && path === '/v1/marketplace/business-model-proof') {
          requireAdmin(req, adminToken);
          jsonResponse(res, 200, store.businessModelProof(platformReadinessTargetsFromQuery(url.searchParams)));
          return;
        }
        if (req.method === 'GET' && path === '/v1/marketplace/launch-readiness') {
          requireAdmin(req, adminToken);
          jsonResponse(res, 200, { report: store.launchReadiness(launchReadinessTargetsFromQuery(url.searchParams)) });
          return;
        }
        if (req.method === 'GET' && path === '/v1/marketplace/reconciliation') {
          requireAdmin(req, adminToken);
          const from = optionalQueryNumber(url.searchParams, 'from');
          const to = optionalQueryNumber(url.searchParams, 'to');
          jsonResponse(res, 200, {
            report: store.reconciliationReport({
              ...(from !== undefined ? { from } : {}),
              ...(to !== undefined ? { to } : {}),
            }),
          });
          return;
        }
        if (req.method === 'GET' && path === '/v1/marketplace/settlements') {
          requireAdmin(req, adminToken);
          const from = optionalQueryNumber(url.searchParams, 'from');
          const to = optionalQueryNumber(url.searchParams, 'to');
          const creatorId = url.searchParams.get('creatorId') ?? undefined;
          const filter = {
            ...(from !== undefined ? { from } : {}),
            ...(to !== undefined ? { to } : {}),
            ...(creatorId ? { creatorId } : {}),
          };
          const format = url.searchParams.get('format') ?? 'json';
          if (format === 'csv') {
            csvResponse(res, 200, store.settlementCsv(filter), 'greybox-marketplace-settlements.csv');
            return;
          }
          if (format !== 'json') throw new Error('format must be json or csv');
          jsonResponse(res, 200, { report: store.settlementReport(filter) });
          return;
        }
        if (req.method === 'GET' && path === '/v1/marketplace/tax-compliance') {
          requireAdmin(req, adminToken);
          const from = optionalQueryNumber(url.searchParams, 'from');
          const to = optionalQueryNumber(url.searchParams, 'to');
          const year = optionalQueryNumber(url.searchParams, 'year');
          const thresholdCents = optionalQueryNumber(url.searchParams, 'thresholdCents');
          if (year !== undefined && !Number.isInteger(year)) throw new Error('year must be an integer');
          if (thresholdCents !== undefined && !Number.isInteger(thresholdCents)) {
            throw new Error('thresholdCents must be an integer');
          }
          const creatorId = url.searchParams.get('creatorId') ?? undefined;
          const filter = {
            ...(from !== undefined ? { from } : {}),
            ...(to !== undefined ? { to } : {}),
            ...(year !== undefined ? { year } : {}),
            ...(thresholdCents !== undefined ? { us1099KGrossThresholdCents: thresholdCents } : {}),
            ...(creatorId ? { creatorId } : {}),
          };
          const format = url.searchParams.get('format') ?? 'json';
          if (format === 'csv') {
            csvResponse(res, 200, store.taxComplianceCsv(filter), 'greybox-marketplace-tax-compliance.csv');
            return;
          }
          if (format !== 'json') throw new Error('format must be json or csv');
          jsonResponse(res, 200, { report: store.taxComplianceReport(filter) });
          return;
        }
        if (req.method === 'GET' && path === '/v1/marketplace/risk-reserve') {
          requireAdmin(req, adminToken);
          jsonResponse(res, 200, { report: store.riskReserveReport(riskReserveOptionsFromQuery(url.searchParams)) });
          return;
        }
        if (req.method === 'GET' && path === '/v1/marketplace/risk-events') {
          requireAdmin(req, adminToken);
          const type = url.searchParams.get('type') ?? undefined;
          if (type && !RISK_EVENT_TYPES.has(type as MarketplaceRiskEventType)) throw new Error('risk event type is not supported');
          const orderId = url.searchParams.get('orderId') ?? undefined;
          const from = optionalQueryNumber(url.searchParams, 'from');
          const to = optionalQueryNumber(url.searchParams, 'to');
          jsonResponse(res, 200, {
            riskEvents: store.listRiskEvents({
              ...(type ? { type: type as MarketplaceRiskEventType } : {}),
              ...(orderId ? { orderId } : {}),
              ...(from !== undefined ? { from } : {}),
              ...(to !== undefined ? { to } : {}),
            }),
          });
          return;
        }
        if (req.method === 'GET' && path === '/v1/marketplace/event-receipts') {
          requireAdmin(req, adminToken);
          const kind = url.searchParams.get('kind') ?? undefined;
          if (kind && !EVENT_RECEIPT_KINDS.has(kind as MarketplaceEventReceiptKind)) {
            throw new Error('event receipt kind is not supported');
          }
          const orderId = url.searchParams.get('orderId') ?? undefined;
          const from = optionalQueryNumber(url.searchParams, 'from');
          const to = optionalQueryNumber(url.searchParams, 'to');
          jsonResponse(res, 200, {
            eventReceipts: store.listEventReceipts({
              ...(kind ? { kind: kind as MarketplaceEventReceiptKind } : {}),
              ...(orderId ? { orderId } : {}),
              ...(from !== undefined ? { from } : {}),
              ...(to !== undefined ? { to } : {}),
            }),
          });
          return;
        }
        if (req.method === 'GET' && path === '/v1/marketplace/catalog') {
          const category = url.searchParams.get('category') ?? undefined;
          if (category && !LISTING_CATEGORIES.has(category as ListingCategory)) throw new Error('category is not supported');
          const limit = optionalQueryNumber(url.searchParams, 'limit');
          const offset = optionalQueryNumber(url.searchParams, 'offset');
          const query = url.searchParams.get('q') ?? url.searchParams.get('query') ?? undefined;
          const tag = url.searchParams.get('tag') ?? undefined;
          const creatorId = url.searchParams.get('creatorId') ?? undefined;
          jsonResponse(res, 200, {
            catalog: store.catalogSearch({
              ...(query ? { query } : {}),
              ...(category ? { category: category as ListingCategory } : {}),
              ...(tag ? { tag } : {}),
              ...(creatorId ? { creatorId } : {}),
              ...(limit !== undefined ? { limit } : {}),
              ...(offset !== undefined ? { offset } : {}),
            }),
          });
          return;
        }
        if (req.method === 'GET' && path === '/v1/marketplace/listings') {
          const status = url.searchParams.get('status');
          const category = url.searchParams.get('category');
          if (status && !LISTING_STATUSES.has(status as ListingStatus)) throw new Error('status is not supported');
          if (category && !LISTING_CATEGORIES.has(category as ListingCategory)) throw new Error('category is not supported');
          if (status !== 'published') requireAdmin(req, adminToken);
          jsonResponse(res, 200, {
            listings: store.listListings({
              ...(status ? { status: status as ListingStatus } : {}),
              ...(category ? { category: category as ListingCategory } : {}),
            }),
          });
          return;
        }
        if (req.method === 'GET' && path === '/v1/marketplace/review-dashboard') {
          requireAdmin(req, adminToken);
          const limit = optionalQueryNumber(url.searchParams, 'limit');
          const dashboard = store.reviewDashboard({
            ...(limit !== undefined ? { limit } : {}),
          });
          jsonResponse(res, 200, {
            dashboard,
          });
          return;
        }
        if (req.method === 'GET' && path === '/v1/marketplace/reviews') {
          requireAdmin(req, adminToken);
          const status = url.searchParams.get('status');
          const humanReviewRequired = url.searchParams.get('humanReviewRequired');
          if (status && !REVIEW_STATUSES.has(status as ListingReview['status'])) throw new Error('status is not supported');
          jsonResponse(res, 200, {
            reviews: store.listReviews({
              ...(status ? { status: status as ListingReview['status'] } : {}),
              ...(humanReviewRequired === 'true' ? { humanReviewRequired: true } : {}),
              ...(humanReviewRequired === 'false' ? { humanReviewRequired: false } : {}),
            }),
          });
          return;
        }
        if (req.method === 'GET' && path === '/v1/marketplace/entitlements') {
          requireAdmin(req, adminToken);
          const buyerId = url.searchParams.get('buyerId') ?? undefined;
          const listingId = url.searchParams.get('listingId') ?? undefined;
          const lookupKey = url.searchParams.get('lookupKey') ?? undefined;
          jsonResponse(res, 200, {
            entitlements: store.listEntitlements({
              ...(buyerId ? { buyerId } : {}),
              ...(listingId ? { listingId } : {}),
              ...(lookupKey ? { lookupKey } : {}),
            }),
          });
          return;
        }
        const creatorStorefront = path.match(/^\/v1\/marketplace\/creators\/([^/]+)\/storefront$/u);
        if (req.method === 'GET' && creatorStorefront?.[1]) {
          jsonResponse(res, 200, {
            storefront: store.creatorStorefront(decodeURIComponent(creatorStorefront[1])),
          });
          return;
        }
        const payoutReadiness = path.match(/^\/v1\/marketplace\/creators\/([^/]+)\/payout-readiness$/u);
        if (req.method === 'GET' && payoutReadiness?.[1]) {
          requireAdmin(req, adminToken);
          jsonResponse(res, 200, {
            readiness: store.payoutReadiness(decodeURIComponent(payoutReadiness[1])),
          });
          return;
        }
        if (req.method === 'POST' && path === '/v1/marketplace/creators') {
          requireAdmin(req, adminToken);
          const creator = store.upsertCreator(creatorFromBody(await readJson(req)));
          jsonResponse(res, 201, { creator });
          return;
        }
        const onboardingPlan = path.match(/^\/v1\/marketplace\/creators\/([^/]+)\/stripe-connect\/onboarding-plan$/u);
        if (req.method === 'POST' && onboardingPlan?.[1]) {
          requireAdmin(req, adminToken);
          jsonResponse(res, 200, {
            plan: store.stripeConnectOnboardingPlan(
              decodeURIComponent(onboardingPlan[1]),
              onboardingUrlsFromBody(await readJson(req), allowedRedirectOrigin),
            ),
          });
          return;
        }
        const onboardingLink = path.match(/^\/v1\/marketplace\/creators\/([^/]+)\/stripe-connect\/onboarding-link$/u);
        if (req.method === 'POST' && onboardingLink?.[1]) {
          requireAdmin(req, adminToken);
          const result = await store.createStripeConnectOnboardingLink(
            decodeURIComponent(onboardingLink[1]),
            onboardingUrlsFromBody(await readJson(req), allowedRedirectOrigin),
          );
          metrics.increment(result.account ? 'stripe_connect.account_created' : 'stripe_connect.account_reused');
          metrics.increment('stripe_connect.onboarding_link_created');
          jsonResponse(res, 201, { result });
          return;
        }
        const accountStatus = path.match(/^\/v1\/marketplace\/creators\/([^/]+)\/stripe-connect\/account-status$/u);
        if (req.method === 'POST' && accountStatus?.[1]) {
          requireAdmin(req, adminToken);
          const result = store.recordStripeConnectAccountStatus(
            decodeURIComponent(accountStatus[1]),
            stripeConnectAccountStatusFromBody(await readJson(req)),
          );
          metrics.increment(result.readiness.status === 'ready'
            ? 'stripe_connect.account_ready'
            : 'stripe_connect.account_not_ready');
          jsonResponse(res, 200, { result });
          return;
        }
        const taxProfile = path.match(/^\/v1\/marketplace\/creators\/([^/]+)\/tax-profile$/u);
        if (req.method === 'POST' && taxProfile?.[1]) {
          requireAdmin(req, adminToken);
          const result = store.recordCreatorTaxProfile(
            decodeURIComponent(taxProfile[1]),
            taxProfileRecordFromBody(await readJson(req)),
          );
          metrics.increment('creator.tax_profile_recorded');
          jsonResponse(res, 200, { result });
          return;
        }
        if (req.method === 'POST' && path === '/v1/marketplace/listings') {
          requireAdmin(req, adminToken);
          const { draft, creatorRankByGmv, creatorCount } = listingDraftFromBody(await readJson(req));
          const result = store.submitListing(draft, {
            ...(creatorRankByGmv ? { creatorRankByGmv } : {}),
            ...(creatorCount ? { creatorCount } : {}),
          });
          jsonResponse(res, 201, result);
          return;
        }
        if (req.method === 'POST' && path === '/v1/marketplace/orders') {
          requireAdmin(req, adminToken);
          jsonResponse(res, 201, await store.purchaseListing(orderFromBody(await readJson(req))));
          return;
        }
        if (req.method === 'POST' && path === '/v1/marketplace/tax/preview') {
          requireAdmin(req, adminToken);
          jsonResponse(res, 200, { preview: store.taxPreview(taxPreviewFromBody(await readJson(req))) });
          return;
        }
        if (req.method === 'POST' && path === '/v1/marketplace/checkout/session-plan') {
          requireAdmin(req, adminToken);
          jsonResponse(res, 200, {
            plan: store.checkoutPlan(checkoutPlanFromBody(await readJson(req), allowedRedirectOrigin)),
          });
          return;
        }
        if (req.method === 'POST' && path === '/v1/marketplace/checkout/sessions') {
          requireAdmin(req, adminToken);
          const plan = store.checkoutPlan(checkoutPlanFromBody(await readJson(req), allowedRedirectOrigin));
          if (plan.readiness.status !== 'ready' || !plan.checkoutSessionRequest) {
            jsonResponse(res, 409, {
              error: {
                code: 'CHECKOUT_NOT_READY',
                message: 'marketplace checkout is not ready for this listing',
              },
              plan,
            });
            return;
          }
          if (!checkoutClient) {
            throw new MarketplaceHttpError(
              503,
              'STRIPE_CHECKOUT_NOT_CONFIGURED',
              'STRIPE_SECRET_KEY is required to create Checkout Sessions',
            );
          }
          const checkout = await checkoutClient.createSession(plan.checkoutSessionRequest);
          metrics.increment('checkout.session_created');
          const response: MarketplaceCheckoutSessionResponse = { plan, checkout };
          jsonResponse(res, 201, response);
          return;
        }
        if (req.method === 'POST' && path === '/v1/marketplace/checkout/fulfill') {
          requireAdmin(req, adminToken);
          const result = await store.fulfillCheckoutSession(checkoutCompletedEventFromBody(await readJson(req)));
          if (!result.idempotent) {
            metrics.increment('orders.fulfilled');
            metrics.observe('order.value_cents', result.order.grossCents, { bucketsOrderValueCents: true });
            metrics.observe('order.creator_net_cents', result.order.creatorNetCents, { bucketsOrderValueCents: true });
            metrics.increment(`payout.${result.payout.status}`);
          }
          jsonResponse(res, result.idempotent ? 200 : 201, { result });
          return;
        }
        if (req.method === 'POST' && path === '/v1/marketplace/entitlements/claim') {
          requireAdmin(req, adminToken);
          const entitlement = store.claimEntitlement(entitlementClaimFromBody(await readJson(req)));
          metrics.increment('entitlements.claimed');
          jsonResponse(res, 200, { entitlement });
          return;
        }
        if (req.method === 'POST' && path === '/v1/marketplace/risk-events') {
          requireAdmin(req, adminToken);
          const event = store.recordRiskEvent(riskEventFromBody(await readJson(req)));
          metrics.increment(`risk_event.${event.type}.${event.status}`);
          jsonResponse(res, 201, { riskEvent: event });
          return;
        }
        const orderPayoutRelease = path.match(/^\/v1\/marketplace\/orders\/([^/]+)\/payout-release$/u);
        if (req.method === 'POST' && orderPayoutRelease?.[1]) {
          requireAdmin(req, adminToken);
          const result = await store.releaseBlockedPayout(
            payoutReleaseFromBody(decodeURIComponent(orderPayoutRelease[1]), await readJson(req)),
          );
          if (!result.idempotent) {
            metrics.increment(result.released ? `payout.${result.payout.status}` : 'payout.release_held');
          }
          jsonResponse(res, result.released ? 200 : 409, { result });
          return;
        }
        // Stripe dispute/refund webhooks land here via greybox-cloud forwarding.
        // The body is the raw Stripe event; we translate it into a marketplace
        // risk event so the audit chain and reserve calculations stay accurate.
        if (req.method === 'POST' && (path === '/v1/marketplace/stripe-events/dispute' || path === '/v1/marketplace/stripe-events/refund')) {
          requireAdmin(req, adminToken);
          const { body: event, rawBody } = await readJsonWithRawBody(req);
          if (
            stripeWebhookSecret
            && !stripeWebhookSignatureIsValid({
              payload: rawBody,
              secret: stripeWebhookSecret,
              signatureHeader: marketplaceStripeSignatureHeader(req),
              ...(options.clock ? { nowMs: options.clock.now() } : {}),
            })
          ) {
            throw new MarketplaceHttpError(
              401,
              'STRIPE_WEBHOOK_SIGNATURE_INVALID',
              'valid Stripe webhook signature required',
            );
          }
          if (!stripeEventMatchesScopedRiskRoute(path, event)) {
            metrics.increment('stripe_event.ignored');
            metrics.increment('stripe_event.ignored.wrong_stripe_event_route');
            store.recordIgnoredStripeEvent(ignoredStripeEventAuditInput(path, event, 'wrong_stripe_event_route'));
            jsonResponse(res, 202, { ok: true, ignored: true, reason: 'wrong_stripe_event_route' });
            return;
          }
          const draft = stripeEventToRiskEventDraft(event, store);
          if (!draft) {
            metrics.increment('stripe_event.ignored');
            metrics.increment('stripe_event.ignored.unmatched_stripe_event');
            store.recordIgnoredStripeEvent(ignoredStripeEventAuditInput(path, event, 'unmatched_stripe_event'));
            jsonResponse(res, 202, { ok: true, ignored: true, reason: 'unmatched_stripe_event' });
            return;
          }
          const riskEvent = store.recordRiskEvent(draft);
          metrics.increment(`stripe_event.${draft.type}`);
          metrics.increment(`risk_event.${riskEvent.type}.${riskEvent.status}`);
          jsonResponse(res, 201, { riskEvent });
          return;
        }
        const orderRefund = path.match(/^\/v1\/marketplace\/orders\/([^/]+)\/refund$/u);
        if (req.method === 'POST' && orderRefund?.[1]) {
          requireAdmin(req, adminToken);
          const result = await store.refundOrder(
            refundFromBody(decodeURIComponent(orderRefund[1]), await readJson(req)),
          );
          jsonResponse(res, result.refund.status === 'blocked' ? 409 : 201, result);
          return;
        }
        const reviewApprove = path.match(/^\/v1\/marketplace\/reviews\/([^/]+)\/approve$/u);
        if (req.method === 'POST' && reviewApprove?.[1]) {
          requireAdmin(req, adminToken);
          const { reviewerId } = reviewerFromBody(await readJson(req));
          jsonResponse(res, 200, { listing: store.approveReview(decodeURIComponent(reviewApprove[1]), reviewerId) });
          return;
        }
        notFound(res);
      } catch (error) {
        badRequest(res, error);
      }
    },
  };
}

function marketplaceStoreFromOptions(
  options: MarketplaceApiOptions,
  env: MarketplaceApiEnv,
  persistencePath: string | undefined,
  auditPath: string | undefined,
): InMemoryMarketplaceStore {
  const isProduction = (env.NODE_ENV ?? '').toLowerCase() === 'production';
  // Default payoutProvider to LiveStripeConnectProvider when STRIPE_SECRET_KEY is
  // configured. Dry-run by default unless the operator explicitly opts in by
  // setting STRIPE_CONNECT_DRY_RUN=0. Keeps prod boot honest: no money moves
  // unless the env signals both that we have a key AND want it live.
  const stripeSecretKey = optionalEnvString(env.STRIPE_SECRET_KEY);
  const stripeApiBase = optionalEnvString(env.STRIPE_API_BASE);
  const payoutProvider = options.payoutProvider
    ?? (stripeSecretKey
      ? new LiveStripeConnectProvider({
          apiKey: stripeSecretKey,
          dryRun: env.STRIPE_CONNECT_DRY_RUN !== '0',
          ...(stripeApiBase ? { stripeApiBase } : {}),
        })
      : undefined);
  // Default auditLog to FileMarketplaceAuditLog when a path is configured so the
  // hash-chained compliance log lands on disk for DD / incident forensics. In
  // dev with no path, fall back to in-memory so verifyAuditLog() works.
  const auditLog = options.auditLog
    ?? (auditPath ? new FileMarketplaceAuditLog(auditPath) : new InMemoryMarketplaceAuditLog());
  const payoutReservePolicy = options.payoutReservePolicy ?? marketplacePayoutReservePolicyFromEnv(env);
  const storeOptions: MarketplaceStoreOptions = {
    ...(options.clock ? { clock: options.clock } : {}),
    ...(payoutProvider ? { payoutProvider } : {}),
    ...(payoutReservePolicy ? { payoutReservePolicy } : {}),
    env,
    auditLog,
  };
  if (isProduction && !payoutProvider && !options.allowMockPayoutsInProduction) {
    // Surface a clearer error than the store's generic guard so operators see
    // the right env vars to set when bringing up a production deploy.
    throw new Error(
      'createMarketplaceApi refused to start in NODE_ENV=production without a payoutProvider. ' +
      'Set STRIPE_SECRET_KEY (recommended) or pass an explicit payoutProvider.',
    );
  }
  return persistencePath
    ? new FileBackedMarketplaceStore({ ...storeOptions, snapshotPath: persistencePath })
    : new InMemoryMarketplaceStore(storeOptions);
}

export async function startMarketplaceServer(options: MarketplaceApiOptions & {
  host?: string;
  port?: number;
} = {}): Promise<StartedMarketplaceServer> {
  const api = createMarketplaceApi(options);
  const server = createServer((req, res) => {
    void api.handler(req, res);
  });
  await new Promise<void>((resolve) => {
    server.listen(options.port ?? 0, options.host ?? '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('marketplace server did not bind to a TCP port');
  return {
    server,
    store: api.store,
    url: `http://${address.address}:${address.port}`,
  };
}
