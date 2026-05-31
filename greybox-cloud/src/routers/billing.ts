// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { createHmac, timingSafeEqual } from 'node:crypto';

import { sanitizeStripeOperationalText } from '../security/stripeRedaction.js';
import type { PlanTier, ProviderName, UsageEvent } from '../types.js';

export interface BillingRollup {
  tenantId: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface BillingPeriod {
  start: string;
  end: string;
}

export interface PlanMeteringConfig {
  tier: PlanTier;
  monthlyBaseUsd: number;
  minimumSeats: number;
  includedInputTokens: number;
  includedOutputTokens: number;
  inputOverageUsdPer1K: number;
  outputOverageUsdPer1K: number;
  /** Monthly 3D character generation limit. null = unlimited (enterprise). */
  monthlyCharacterGenerations: number | null;
}

export interface InvoiceInput {
  tenantId: string;
  tier: PlanTier;
  period: BillingPeriod;
  events: UsageEvent[];
  seatCount?: number;
  enterprisePeriodBaseUsd?: number;
  enterpriseIncludedInputTokens?: number;
  enterpriseIncludedOutputTokens?: number;
  enterpriseInputOverageUsdPer1K?: number;
  enterpriseOutputOverageUsdPer1K?: number;
}

export interface BillingInvoice {
  tenantId: string;
  tier: PlanTier;
  period: BillingPeriod;
  seatCount: number;
  baseUsd: number;
  includedInputTokens: number;
  includedOutputTokens: number;
  inputTokens: number;
  outputTokens: number;
  billableInputTokens: number;
  billableOutputTokens: number;
  inputOverageUsd: number;
  outputOverageUsd: number;
  providerCostUsd: number;
  totalUsd: number;
  grossMarginUsd: number;
  grossMarginPct: number;
}

export interface StripeMeterPayloadConfig {
  customerKey: string;
  valueKey: string;
}

export interface StripeBillingIdentity {
  stripeCustomerId: string;
  meterPayload: StripeMeterPayloadConfig;
}

export interface StripeMeterEventEvidence {
  payloadConfig: StripeMeterPayloadConfig;
  payloadKeys: string[];
  customerMappingPresent: boolean;
  valueKeyPresent: boolean;
  timestampFormat: 'unix_seconds';
  source: 'internal-dry-run' | 'stripe-live';
}

export interface StripeMeterEvent {
  eventName: 'greybox.input_tokens.overage' | 'greybox.output_tokens.overage';
  identifier: string;
  timestamp: string;
  payload: {
    tenant_id?: string;
    period_start?: string;
    period_end?: string;
    quantity?: number;
    stripe_customer_id?: string;
    value?: number | string;
    [key: string]: string | number | undefined;
  };
  evidence?: StripeMeterEventEvidence;
}

export interface ProviderInvoiceLine {
  provider: ProviderName;
  model?: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface StripeReportedUsage {
  eventName: StripeMeterEvent['eventName'];
  tenantId: string;
  quantity: number;
}

export interface AuditDiscrepancy {
  key: string;
  expected: number;
  actual: number;
  delta: number;
}

export interface AuditResult {
  ok: boolean;
  discrepancies: AuditDiscrepancy[];
}

export type MarketplaceCheckoutFulfillmentFetch = (
  url: string,
  init: {
    method: 'POST';
    headers: Record<string, string>;
    body: string;
  },
) => Promise<Pick<Response, 'ok' | 'status' | 'json'>>;

export interface StripeWebhookHandleOptions {
  rawBody: string;
  signatureHeader?: string | null;
  webhookSecret?: string;
  marketplaceUrl?: string;
  marketplaceAdminToken?: string;
  fetchFn?: MarketplaceCheckoutFulfillmentFetch;
  requestId?: string;
  now?: () => number;
  signatureToleranceSeconds?: number;
}

export interface StripeWebhookHandleResult {
  ok: true;
  received: true;
  verified: true;
  eventId: string;
  eventType: string;
  stripeObjectId?: string;
  forwarded: boolean;
  marketplaceStatus?: number;
  idempotent?: boolean;
}

export type CheckoutReadinessStatus = 'pass' | 'warn' | 'fail';

export interface CheckoutReadinessCheck {
  id: string;
  label: string;
  status: CheckoutReadinessStatus;
  detail: string;
  remediation?: string;
}

export interface CheckoutReadinessReport {
  ready: boolean;
  generatedAt: string;
  webhookEndpoint: '/v1/billing/webhook';
  requiredStripeEvent: 'checkout.session.completed';
  requiredStripeEvents: readonly string[];
  marketplaceFulfillmentPath?: string;
  marketplaceForwardingRoutes: readonly CheckoutMarketplaceForwardingRoute[];
  summary: {
    passed: number;
    warnings: number;
    failed: number;
  };
  checks: CheckoutReadinessCheck[];
}

export interface CheckoutMarketplaceForwardingRoute {
  eventType: string;
  path: string;
  url?: string;
}

export interface CheckoutReadinessOptions {
  stripeWebhookSecret?: string;
  stripeWebhookEvents?: readonly string[];
  requireStripeWebhookEvents?: boolean;
  marketplaceUrl?: string;
  marketplaceAdminToken?: string;
  auditLogConfigured?: boolean;
  now?: Date;
}

export class BillingWebhookError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message = code,
  ) {
    super(message);
    this.name = 'BillingWebhookError';
  }
}

export const PLAN_METERING: Record<PlanTier, PlanMeteringConfig> = {
  free: {
    tier: 'free',
    monthlyBaseUsd: 0,
    minimumSeats: 1,
    includedInputTokens: 0,
    includedOutputTokens: 0,
    inputOverageUsdPer1K: 0,
    outputOverageUsdPer1K: 0,
    monthlyCharacterGenerations: 0,
  },
  indie: {
    tier: 'indie',
    monthlyBaseUsd: 29,
    minimumSeats: 1,
    includedInputTokens: 1_000_000,
    includedOutputTokens: 200_000,
    inputOverageUsdPer1K: 0.05,
    outputOverageUsdPer1K: 0.20,
    monthlyCharacterGenerations: 5,
  },
  studio: {
    tier: 'studio',
    monthlyBaseUsd: 79,
    minimumSeats: 5,
    includedInputTokens: 5_000_000,
    includedOutputTokens: 1_000_000,
    inputOverageUsdPer1K: 0.04,
    outputOverageUsdPer1K: 0.18,
    monthlyCharacterGenerations: 50,
  },
  enterprise: {
    tier: 'enterprise',
    monthlyBaseUsd: 0,
    minimumSeats: 1,
    includedInputTokens: 0,
    includedOutputTokens: 0,
    inputOverageUsdPer1K: 0,
    outputOverageUsdPer1K: 0,
    monthlyCharacterGenerations: null, // unlimited, metered billing
  },
};

export const DEFAULT_STRIPE_METER_PAYLOAD_CONFIG: StripeMeterPayloadConfig = {
  customerKey: 'stripe_customer_id',
  valueKey: 'value',
};

const internalMeterPayloadConfig: StripeMeterPayloadConfig = {
  customerKey: 'tenant_id',
  valueKey: 'quantity',
};

const placeholderCredentialPattern = /(?:replace|changeme|example|sample|dummy|random-token|secret|token)$/iu;
const marketplaceAdminTokenPlaceholderPattern =
  /(?:^test(?:[-_]|$)|example|sample|dummy|placeholder|changeme|change-me|replace-me|not-a-secret|dev-only)/iu;
const marketplaceAdminTokenMinLength = 32;

function roundUsd(value: number): number {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}

function inPeriod(event: UsageEvent, period: BillingPeriod): boolean {
  const at = Date.parse(event.createdAt);
  return at >= Date.parse(period.start) && at < Date.parse(period.end);
}

export function rollupUsage(events: UsageEvent[]): BillingRollup[] {
  const rollups = new Map<string, BillingRollup>();
  for (const event of events) {
    const current = rollups.get(event.tenantId) ?? { tenantId: event.tenantId, inputTokens: 0, outputTokens: 0, costUsd: 0 };
    current.inputTokens += event.inputTokens;
    current.outputTokens += event.outputTokens;
    current.costUsd = roundUsd(current.costUsd + event.inputCostUsd + event.outputCostUsd);
    rollups.set(event.tenantId, current);
  }
  return [...rollups.values()];
}

function effectivePlan(input: InvoiceInput): PlanMeteringConfig {
  const base = PLAN_METERING[input.tier];
  if (input.tier !== 'enterprise') return base;
  return {
    ...base,
    monthlyBaseUsd: input.enterprisePeriodBaseUsd ?? base.monthlyBaseUsd,
    includedInputTokens: input.enterpriseIncludedInputTokens ?? base.includedInputTokens,
    includedOutputTokens: input.enterpriseIncludedOutputTokens ?? base.includedOutputTokens,
    inputOverageUsdPer1K: input.enterpriseInputOverageUsdPer1K ?? base.inputOverageUsdPer1K,
    outputOverageUsdPer1K: input.enterpriseOutputOverageUsdPer1K ?? base.outputOverageUsdPer1K,
  };
}

function usageEventFingerprint(event: UsageEvent): string {
  return JSON.stringify({
    id: event.id,
    tenantId: event.tenantId,
    userId: event.userId,
    projectId: event.projectId,
    provider: event.provider,
    model: event.model ?? null,
    inputTokens: event.inputTokens,
    outputTokens: event.outputTokens,
    inputCostUsd: event.inputCostUsd,
    outputCostUsd: event.outputCostUsd,
    createdAt: event.createdAt,
  });
}

function uniqueUsageEvents(events: UsageEvent[]): UsageEvent[] {
  const seen = new Map<string, { event: UsageEvent; fingerprint: string }>();
  for (const event of events) {
    const prior = seen.get(event.id);
    const fingerprint = usageEventFingerprint(event);
    if (!prior) {
      seen.set(event.id, { event, fingerprint });
      continue;
    }
    if (prior.fingerprint !== fingerprint) {
      throw new Error(`duplicate usage event id has conflicting payload: ${event.id}`);
    }
  }
  return [...seen.values()].map((entry) => entry.event);
}

export function createBillingInvoice(input: InvoiceInput): BillingInvoice {
  const plan = effectivePlan(input);
  const seatCount = Math.max(plan.minimumSeats, input.seatCount ?? 1);
  const events = uniqueUsageEvents(input.events.filter((event) => event.tenantId === input.tenantId && inPeriod(event, input.period)));
  const inputTokens = events.reduce((sum, event) => sum + event.inputTokens, 0);
  const outputTokens = events.reduce((sum, event) => sum + event.outputTokens, 0);
  const providerCostUsd = roundUsd(events.reduce((sum, event) => sum + event.inputCostUsd + event.outputCostUsd, 0));
  const billableInputTokens = Math.max(0, inputTokens - plan.includedInputTokens);
  const billableOutputTokens = Math.max(0, outputTokens - plan.includedOutputTokens);
  const inputOverageUsd = roundUsd((billableInputTokens / 1_000) * plan.inputOverageUsdPer1K);
  const outputOverageUsd = roundUsd((billableOutputTokens / 1_000) * plan.outputOverageUsdPer1K);
  const baseUsd = roundUsd(plan.monthlyBaseUsd * seatCount);
  const totalUsd = roundUsd(baseUsd + inputOverageUsd + outputOverageUsd);
  const grossMarginUsd = roundUsd(totalUsd - providerCostUsd);
  const grossMarginPct = totalUsd > 0 ? roundUsd(grossMarginUsd / totalUsd) : 0;

  return {
    tenantId: input.tenantId,
    tier: input.tier,
    period: input.period,
    seatCount,
    baseUsd,
    includedInputTokens: plan.includedInputTokens,
    includedOutputTokens: plan.includedOutputTokens,
    inputTokens,
    outputTokens,
    billableInputTokens,
    billableOutputTokens,
    inputOverageUsd,
    outputOverageUsd,
    providerCostUsd,
    totalUsd,
    grossMarginUsd,
    grossMarginPct,
  };
}

export function buildStripeMeterEvents(
  invoice: BillingInvoice,
  options: { billingIdentity?: StripeBillingIdentity } = {},
): StripeMeterEvent[] {
  if (invoice.tier === 'free') return [];
  const payloadConfig = options.billingIdentity?.meterPayload ?? internalMeterPayloadConfig;
  const basePayload: StripeMeterEvent['payload'] = {
    period_start: invoice.period.start,
    period_end: invoice.period.end,
  };
  if (options.billingIdentity) {
    basePayload[payloadConfig.customerKey] = options.billingIdentity.stripeCustomerId;
  } else {
    basePayload[payloadConfig.customerKey] = invoice.tenantId;
  }
  const events: StripeMeterEvent[] = [];
  if (invoice.billableInputTokens > 0) {
    events.push(stripeMeterEventWithEvidence({
      eventName: 'greybox.input_tokens.overage',
      identifier: `${invoice.tenantId}:${invoice.period.start}:input`,
      timestamp: invoice.period.end,
      payload: { ...basePayload, [payloadConfig.valueKey]: invoice.billableInputTokens },
    }, payloadConfig, Boolean(options.billingIdentity)));
  }
  if (invoice.billableOutputTokens > 0) {
    events.push(stripeMeterEventWithEvidence({
      eventName: 'greybox.output_tokens.overage',
      identifier: `${invoice.tenantId}:${invoice.period.start}:output`,
      timestamp: invoice.period.end,
      payload: { ...basePayload, [payloadConfig.valueKey]: invoice.billableOutputTokens },
    }, payloadConfig, Boolean(options.billingIdentity)));
  }
  return events;
}

function stripeMeterEventWithEvidence(
  event: Omit<StripeMeterEvent, 'evidence'>,
  payloadConfig: StripeMeterPayloadConfig,
  live: boolean,
): StripeMeterEvent {
  const payloadKeys = Object.keys(event.payload).sort();
  return {
    ...event,
    evidence: {
      payloadConfig,
      payloadKeys,
      customerMappingPresent: event.payload[payloadConfig.customerKey] !== undefined,
      valueKeyPresent: event.payload[payloadConfig.valueKey] !== undefined,
      timestampFormat: 'unix_seconds',
      source: live ? 'stripe-live' : 'internal-dry-run',
    },
  };
}

function providerLineKey(provider: ProviderName, model?: string): string {
  return `${provider}:${model ?? '*'}`;
}

function addDiscrepancy(
  discrepancies: AuditDiscrepancy[],
  key: string,
  expected: number,
  actual: number,
  tolerance: number,
): void {
  const delta = roundUsd(actual - expected);
  if (Math.abs(delta) <= tolerance) return;
  discrepancies.push({ key, expected, actual, delta });
}

export function auditProviderInvoice(
  events: UsageEvent[],
  providerLines: ProviderInvoiceLine[],
  options: { toleranceTokens?: number; toleranceUsd?: number } = {},
): AuditResult {
  const toleranceTokens = options.toleranceTokens ?? 0;
  const toleranceUsd = options.toleranceUsd ?? 0.01;
  const expected = new Map<string, ProviderInvoiceLine>();
  for (const event of events) {
    const key = providerLineKey(event.provider, event.model);
    const current = expected.get(key) ?? {
      provider: event.provider,
      model: event.model,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
    };
    current.inputTokens += event.inputTokens;
    current.outputTokens += event.outputTokens;
    current.costUsd = roundUsd(current.costUsd + event.inputCostUsd + event.outputCostUsd);
    expected.set(key, current);
  }

  const actual = new Map<string, ProviderInvoiceLine>();
  for (const line of providerLines) {
    actual.set(providerLineKey(line.provider, line.model), line);
  }

  const discrepancies: AuditDiscrepancy[] = [];
  const keys = new Set([...expected.keys(), ...actual.keys()]);
  for (const key of keys) {
    const expectedLine = expected.get(key) ?? { inputTokens: 0, outputTokens: 0, costUsd: 0 };
    const actualLine = actual.get(key) ?? { inputTokens: 0, outputTokens: 0, costUsd: 0 };
    addDiscrepancy(discrepancies, `${key}.inputTokens`, expectedLine.inputTokens, actualLine.inputTokens, toleranceTokens);
    addDiscrepancy(discrepancies, `${key}.outputTokens`, expectedLine.outputTokens, actualLine.outputTokens, toleranceTokens);
    addDiscrepancy(discrepancies, `${key}.costUsd`, expectedLine.costUsd, actualLine.costUsd, toleranceUsd);
  }
  return { ok: discrepancies.length === 0, discrepancies };
}

export function auditStripeMeters(
  invoice: BillingInvoice,
  reportedUsage: StripeReportedUsage[],
  toleranceTokens = 0,
): AuditResult {
  const expected = new Map<StripeMeterEvent['eventName'], number>();
  for (const event of buildStripeMeterEvents(invoice)) {
    expected.set(event.eventName, (expected.get(event.eventName) ?? 0) + Number(event.payload.quantity ?? 0));
  }
  const actual = new Map<StripeMeterEvent['eventName'], number>();
  for (const usage of reportedUsage) {
    if (usage.tenantId !== invoice.tenantId) continue;
    actual.set(usage.eventName, (actual.get(usage.eventName) ?? 0) + usage.quantity);
  }

  const discrepancies: AuditDiscrepancy[] = [];
  const keys = new Set([...expected.keys(), ...actual.keys()]);
  for (const key of keys) {
    addDiscrepancy(discrepancies, key, expected.get(key) ?? 0, actual.get(key) ?? 0, toleranceTokens);
  }
  return { ok: discrepancies.length === 0, discrepancies };
}

export function buildCheckoutReadinessReport(options: CheckoutReadinessOptions): CheckoutReadinessReport {
  const marketplaceUrl = cleanMarketplaceUrl(options.marketplaceUrl);
  const checks = [
    stripeWebhookSecretCheck(options.stripeWebhookSecret),
    stripeWebhookEventsCheck(options.stripeWebhookEvents, options.requireStripeWebhookEvents ?? false),
    marketplaceUrlCheck(options.marketplaceUrl),
    marketplaceAdminTokenCheck(options.marketplaceAdminToken),
    auditLogCheck(options.auditLogConfigured ?? false),
  ];
  const passed = checks.filter((check) => check.status === 'pass').length;
  const warnings = checks.filter((check) => check.status === 'warn').length;
  const failed = checks.filter((check) => check.status === 'fail').length;
  return {
    ready: failed === 0,
    generatedAt: (options.now ?? new Date()).toISOString(),
    webhookEndpoint: '/v1/billing/webhook',
    requiredStripeEvent: 'checkout.session.completed',
    requiredStripeEvents: REQUIRED_MARKETPLACE_STRIPE_EVENTS,
    ...(marketplaceUrl ? { marketplaceFulfillmentPath: `${marketplaceUrl}/v1/marketplace/checkout/fulfill` } : {}),
    marketplaceForwardingRoutes: marketplaceForwardingRoutes(marketplaceUrl),
    summary: { passed, warnings, failed },
    checks,
  };
}

/**
 * Stripe webhook event routing table. Maps an event type to the marketplace
 * endpoint path the raw event body should be POSTed to. Anything not on the
 * map is acknowledged-but-not-forwarded; operators should narrow their
 * Stripe webhook subscription to match.
 */
export const MARKETPLACE_STRIPE_EVENT_ROUTES = {
  'checkout.session.completed': '/v1/marketplace/checkout/fulfill',
  'charge.dispute.created': '/v1/marketplace/stripe-events/dispute',
  'charge.dispute.closed': '/v1/marketplace/stripe-events/dispute',
  'charge.refunded': '/v1/marketplace/stripe-events/refund',
} as const;

export const REQUIRED_MARKETPLACE_STRIPE_EVENTS = Object.freeze(
  Object.keys(MARKETPLACE_STRIPE_EVENT_ROUTES),
);

const STRIPE_EVENT_ROUTES: Record<string, string> = MARKETPLACE_STRIPE_EVENT_ROUTES;

export async function handleStripeWebhook(options: StripeWebhookHandleOptions): Promise<StripeWebhookHandleResult> {
  const secret = options.webhookSecret?.trim();
  if (!secret) throw new BillingWebhookError('stripe_webhook_secret_missing', 503, 'Stripe webhook secret is not configured');
  verifyStripeWebhookSignature({
    rawBody: options.rawBody,
    signatureHeader: options.signatureHeader,
    secret,
    now: options.now,
    toleranceSeconds: options.signatureToleranceSeconds,
  });
  const event = parseStripeWebhookEvent(options.rawBody);
  const route = STRIPE_EVENT_ROUTES[event.type];
  if (!route) {
    return {
      ok: true,
      received: true,
    verified: true,
    eventId: event.id,
    eventType: event.type,
    ...(event.stripeObjectId ? { stripeObjectId: event.stripeObjectId } : {}),
    forwarded: false,
  };
  }
  const marketplaceUrl = cleanMarketplaceUrl(options.marketplaceUrl);
  const marketplaceAdminToken = options.marketplaceAdminToken?.trim();
  if (!marketplaceUrl || !marketplaceAdminToken) {
    throw new BillingWebhookError('marketplace_forwarding_not_configured', 503, 'Marketplace fulfillment forwarding is not configured');
  }
  const response = await (options.fetchFn ?? fetch)(`${marketplaceUrl}${route}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${marketplaceAdminToken}`,
      'content-type': 'application/json',
      ...webhookForwardStripeSignatureHeader(options.signatureHeader),
      ...webhookForwardRequestIdHeader(options.requestId),
    },
    body: options.rawBody,
  });
  if (!response.ok) {
    throw new BillingWebhookError('marketplace_forward_failed', 502, `Marketplace fulfillment failed with status ${response.status}`);
  }
  const json = await response.json();
  const idempotent = marketplaceFulfillmentIdempotent(json);
  return {
    ok: true,
    received: true,
    verified: true,
    eventId: event.id,
    eventType: event.type,
    ...(event.stripeObjectId ? { stripeObjectId: event.stripeObjectId } : {}),
    forwarded: true,
    marketplaceStatus: response.status,
    ...(idempotent !== undefined ? { idempotent } : {}),
  };
}

export interface BillingCheckoutSessionInput {
  /** Tenant requesting the subscription, embedded in metadata. */
  tenantId: string;
  /** PlanTier the tenant wants to subscribe to. */
  tier: 'indie' | 'studio';
  /** Seats; clamped to plan's minimumSeats and 1000 ceiling. */
  seats?: number;
  /** Where Stripe returns the customer on success. */
  successUrl: string;
  /** Where Stripe returns the customer on cancel. */
  cancelUrl: string;
  /** Optional Stripe customer id when known. */
  customerId?: string;
  /** Optional buyer email for tax / receipt. */
  customerEmail?: string;
  /**
   * Stripe price id to use for the subscription line. Required because the
   * cloud doesn't ship pre-baked test prices. The operator wires them up in
   * Stripe and supplies the id at boot time via env.
   */
  priceId: string;
}

export interface BillingCheckoutSessionRequest {
  readonly method: 'POST';
  readonly endpoint: '/v1/checkout/sessions';
  readonly idempotencyKey: string;
  readonly body: Record<string, unknown>;
}

/**
 * Build a Stripe Checkout request body for a new subscription. Pure
 * builder; the LiveStripeCheckoutClient (below) submits the request.
 * Kept separate so tests can assert the shape without touching network.
 */
export function buildBillingCheckoutSessionRequest(input: BillingCheckoutSessionInput): BillingCheckoutSessionRequest {
  if (!input.priceId) throw new Error('priceId is required to build a Stripe Checkout subscription request');
  if (!input.tenantId) throw new Error('tenantId is required to build a Stripe Checkout subscription request');
  if (!input.successUrl || !input.cancelUrl) throw new Error('successUrl and cancelUrl are required');
  assertHttpReturnUrl(input.successUrl, 'successUrl');
  assertHttpReturnUrl(input.cancelUrl, 'cancelUrl');
  const plan = PLAN_METERING[input.tier];
  const seats = Math.max(plan.minimumSeats, Math.min(1000, input.seats ?? plan.minimumSeats));
  return {
    method: 'POST',
    endpoint: '/v1/checkout/sessions',
    idempotencyKey: `greybox-billing-checkout-${input.tenantId}-${input.tier}-${seats}`,
    body: {
      mode: 'subscription',
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      ...(input.customerId ? { customer: input.customerId } : {}),
      ...(input.customerEmail && !input.customerId ? { customer_email: input.customerEmail } : {}),
      client_reference_id: `greybox-tenant-${input.tenantId}`,
      line_items: [{ price: input.priceId, quantity: seats }],
      allow_promotion_codes: true,
      metadata: {
        greybox_tenant_id: input.tenantId,
        greybox_plan_tier: input.tier,
        greybox_seats: String(seats),
      },
      subscription_data: {
        metadata: {
          greybox_tenant_id: input.tenantId,
          greybox_plan_tier: input.tier,
          greybox_seats: String(seats),
        },
      },
    },
  };
}

export interface BillingPortalSessionInput {
  tenantId: string;
  customerId: string;
  returnUrl: string;
}

export interface BillingPortalSessionRequest {
  readonly method: 'POST';
  readonly endpoint: '/v1/billing_portal/sessions';
  readonly idempotencyKey: string;
  readonly body: Record<string, unknown>;
}

export function buildBillingPortalSessionRequest(input: BillingPortalSessionInput): BillingPortalSessionRequest {
  if (!input.customerId) throw new Error('customerId is required to build a Stripe Billing Portal session');
  if (!input.returnUrl) throw new Error('returnUrl is required to build a Stripe Billing Portal session');
  assertHttpReturnUrl(input.returnUrl, 'returnUrl');
  return {
    method: 'POST',
    endpoint: '/v1/billing_portal/sessions',
    idempotencyKey: `greybox-billing-portal-${input.tenantId}-${input.customerId}`,
    body: {
      customer: input.customerId,
      return_url: input.returnUrl,
    },
  };
}

export type BillingFetch = (
  url: string,
  init: {
    method: 'POST';
    headers: Record<string, string>;
    body: string;
  },
) => Promise<Pick<Response, 'ok' | 'status' | 'json' | 'text'>>;

export interface BillingApiClientOptions {
  apiKey?: string;
  fetchFn?: BillingFetch;
  stripeApiBase?: string;
  maxRetries?: number;
  retryBackoffMs?: number;
}

export interface BillingApiResult {
  /** Stripe object id (`cs_*` for checkout, `bps_*` for portal). */
  id: string;
  /** Hosted URL Stripe issues for the session. */
  url: string;
  /** True when the call was a dry run because no apiKey was configured. */
  dryRun: boolean;
}

/**
 * Thin Stripe client for the two billing surfaces the cloud actually owns
 * (subscription checkout + customer portal). Reuses the same retry/dry-run
 * pattern as LiveStripeConnectProvider in the marketplace so operators have
 * one mental model for "what happens with no API key".
 */
export class LiveBillingApiClient {
  private readonly apiKey: string | undefined;
  private readonly fetchFn: BillingFetch;
  private readonly stripeApiBase: string;
  private readonly maxRetries: number;
  private readonly retryBackoffMs: number;

  constructor(options: BillingApiClientOptions = {}) {
    this.apiKey = options.apiKey;
    this.fetchFn = options.fetchFn ?? (fetch as unknown as BillingFetch);
    this.stripeApiBase = normalizeStripeApiBase(options.stripeApiBase, {
      allowNonStripeHost: Boolean(options.fetchFn),
    });
    this.maxRetries = options.maxRetries ?? 3;
    this.retryBackoffMs = options.retryBackoffMs ?? 250;
  }

  createCheckoutSession(input: BillingCheckoutSessionInput): Promise<BillingApiResult> {
    return this.submit(buildBillingCheckoutSessionRequest(input));
  }

  createPortalSession(input: BillingPortalSessionInput): Promise<BillingApiResult> {
    return this.submit(buildBillingPortalSessionRequest(input));
  }

  private async submit(request: BillingCheckoutSessionRequest | BillingPortalSessionRequest): Promise<BillingApiResult> {
    if (!this.apiKey) {
      // Dry-run for staging / canary deploys without real Stripe keys.
      const id = `${request.endpoint.includes('billing_portal') ? 'bps_dryrun' : 'cs_dryrun'}_${request.idempotencyKey}`;
      return { id, url: `https://stripe.example/dryrun/${id}`, dryRun: true };
    }
    const body = stripeFormEncode(request.body as Record<string, unknown>);
    const url = `${this.stripeApiBase}${request.endpoint}`;
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Idempotency-Key': request.idempotencyKey,
      'Stripe-Version': '2024-11-20.acacia',
    };
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await this.fetchFn(url, { method: 'POST', headers, body });
        if (response.status >= 200 && response.status < 300) {
          const payload = (await response.json().catch(() => ({}))) as { id?: string; url?: string };
          const session = stripeBillingSessionResult(request, payload);
          return {
            ...session,
            dryRun: false,
          };
        }
        if (response.status < 500 && response.status !== 429) {
          const text = await response.text().catch(() => '');
          throw new BillingWebhookError(
            `stripe_${response.status}`,
            502,
            sanitizeStripeOperationalText(text, `stripe_${response.status}`),
          );
        }
        lastError = new Error(`stripe_transient_${response.status}`);
      } catch (error) {
        if (error instanceof BillingWebhookError) throw error;
        lastError = error;
      }
      if (attempt < this.maxRetries) {
        await new Promise((r) => setTimeout(r, this.retryBackoffMs * 2 ** attempt));
      }
    }
    throw new BillingWebhookError(
      'stripe_transport_exhausted',
      502,
      `stripe_transport_exhausted:${sanitizeStripeOperationalText((lastError as Error | undefined)?.message, 'unknown')}`,
    );
  }
}

function stripeFormEncode(body: Record<string, unknown>, prefix = ''): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(body)) {
    const formKey = prefix ? `${prefix}[${key}]` : key;
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      value.forEach((item, idx) => {
        if (item && typeof item === 'object') {
          parts.push(stripeFormEncode(item as Record<string, unknown>, `${formKey}[${idx}]`));
        } else {
          parts.push(`${encodeURIComponent(`${formKey}[${idx}]`)}=${encodeURIComponent(String(item))}`);
        }
      });
    } else if (typeof value === 'object') {
      parts.push(stripeFormEncode(value as Record<string, unknown>, formKey));
    } else {
      parts.push(`${encodeURIComponent(formKey)}=${encodeURIComponent(String(value))}`);
    }
  }
  return parts.filter((p) => p.length > 0).join('&');
}

function assertHttpReturnUrl(value: string, field: string): void {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${field} must be an absolute https URL`);
  }
  const host = parsed.hostname.replace(/^\[|\]$/gu, '').toLowerCase();
  const localHttpAllowed = parsed.protocol === 'http:' && ['localhost', '127.0.0.1', '::1'].includes(host);
  if (parsed.protocol !== 'https:' && !localHttpAllowed) {
    throw new Error(`${field} must be an absolute https URL`);
  }
  if (parsed.username || parsed.password) {
    throw new Error(`${field} must not include credentials`);
  }
}

function normalizeStripeApiBase(
  value: string | undefined,
  options: { allowNonStripeHost?: boolean } = {},
): string {
  const raw = (value?.trim() || 'https://api.stripe.com').replace(/\/+$/u, '');
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('Stripe API base must be an absolute https URL');
  }
  if (url.protocol !== 'https:') {
    throw new Error('Stripe API base must be an absolute https URL');
  }
  if (url.username || url.password) {
    throw new Error('Stripe API base must not include credentials');
  }
  if (url.search || url.hash) {
    throw new Error('Stripe API base must not include query or fragment');
  }
  if (url.pathname !== '/' && url.pathname !== '') {
    throw new Error('Stripe API base must not include a path');
  }
  if (url.hostname !== 'api.stripe.com' && options.allowNonStripeHost !== true) {
    throw new Error('Stripe API base must be hosted on api.stripe.com');
  }
  return url.origin;
}

function stripeBillingSessionResult(
  request: BillingCheckoutSessionRequest | BillingPortalSessionRequest,
  payload: { id?: string; url?: string },
): Pick<BillingApiResult, 'id' | 'url'> {
  const kind = request.endpoint === '/v1/billing_portal/sessions' ? 'portal' : 'checkout';
  const id = typeof payload.id === 'string' ? payload.id.trim() : '';
  const rawUrl = typeof payload.url === 'string' ? payload.url.trim() : '';
  if (!id || !rawUrl) {
    throw new BillingWebhookError('stripe_malformed_response', 502, 'Stripe response was missing id or url');
  }
  const idPattern = kind === 'checkout'
    ? /^cs_(?:test|live)_[A-Za-z0-9_]+$/u
    : /^bps_(?:test|live)_[A-Za-z0-9_]+$/u;
  if (!idPattern.test(id)) {
    throw new BillingWebhookError(
      'stripe_malformed_response',
      502,
      kind === 'checkout'
        ? 'Stripe response id was not a Checkout Session id'
        : 'Stripe response id was not a Billing Portal Session id',
    );
  }
  const url = requireStripeBillingSessionUrl(rawUrl, kind);
  return { id, url: url.toString() };
}

function requireStripeBillingSessionUrl(value: string, kind: 'checkout' | 'portal'): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new BillingWebhookError('stripe_malformed_response', 502, 'Stripe response url must be a valid https URL');
  }
  if (url.protocol !== 'https:') {
    throw new BillingWebhookError('stripe_malformed_response', 502, 'Stripe response url must be a valid https URL');
  }
  if (url.username || url.password) {
    throw new BillingWebhookError('stripe_malformed_response', 502, 'Stripe response url must not include credentials');
  }
  const expectedHost = kind === 'checkout' ? 'checkout.stripe.com' : 'billing.stripe.com';
  if (url.hostname !== expectedHost) {
    throw new BillingWebhookError('stripe_malformed_response', 502, `Stripe response url must be hosted on ${expectedHost}`);
  }
  return url;
}

export function verifyStripeWebhookSignature(input: {
  rawBody: string;
  signatureHeader?: string | null;
  secret: string;
  now?: () => number;
  toleranceSeconds?: number;
}): void {
  const parsed = parseStripeSignatureHeader(input.signatureHeader);
  const nowSeconds = Math.floor((input.now?.() ?? Date.now()) / 1_000);
  const toleranceSeconds = input.toleranceSeconds ?? 300;
  if (Math.abs(nowSeconds - parsed.timestamp) > toleranceSeconds) {
    throw new BillingWebhookError('stripe_webhook_timestamp_outside_tolerance', 400, 'Stripe webhook timestamp is outside tolerance');
  }
  const signedPayload = `${parsed.timestamp}.${input.rawBody}`;
  const expected = createHmac('sha256', input.secret).update(signedPayload).digest('hex');
  if (!parsed.signatures.some((signature) => timingSafeHexEqual(expected, signature))) {
    throw new BillingWebhookError('stripe_webhook_signature_invalid', 400, 'Stripe webhook signature verification failed');
  }
}

function stripeWebhookSecretCheck(value: string | undefined): CheckoutReadinessCheck {
  const secret = value?.trim() ?? '';
  if (!secret) {
    return {
      id: 'stripe-webhook-secret',
      label: 'Stripe webhook secret',
      status: 'fail',
      detail: 'Not configured.',
      remediation: 'Set STRIPE_WEBHOOK_SECRET from the Stripe webhook endpoint secret.',
    };
  }
  if (!secret.startsWith('whsec_') || secret.length < 24 || placeholderCredentialPattern.test(secret)) {
    return {
      id: 'stripe-webhook-secret',
      label: 'Stripe webhook secret',
      status: 'fail',
      detail: 'Configured value does not look like a production Stripe webhook secret.',
      remediation: 'Rotate STRIPE_WEBHOOK_SECRET to the real whsec_ value for the deployed endpoint.',
    };
  }
  return {
    id: 'stripe-webhook-secret',
    label: 'Stripe webhook secret',
    status: 'pass',
    detail: 'Configured with a Stripe-style webhook secret.',
  };
}

function stripeWebhookEventsCheck(
  value: readonly string[] | undefined,
  strict: boolean,
): CheckoutReadinessCheck {
  const configured = normalizedStripeWebhookEvents(value);
  if (configured.length === 0) {
    return {
      id: 'stripe-webhook-events',
      label: 'Stripe webhook subscribed events',
      status: strict ? 'fail' : 'warn',
      detail: 'Subscribed Stripe event evidence is not configured.',
      remediation: 'Set GREYBOX_STRIPE_WEBHOOK_EVENTS to checkout.session.completed, charge.dispute.created, charge.dispute.closed, and charge.refunded before hosted Checkout cutover.',
    };
  }
  const configuredSet = new Set(configured);
  const missing = REQUIRED_MARKETPLACE_STRIPE_EVENTS.filter((eventType) => !configuredSet.has(eventType));
  if (missing.length > 0) {
    return {
      id: 'stripe-webhook-events',
      label: 'Stripe webhook subscribed events',
      status: 'fail',
      detail: `Missing required Marketplace event(s): ${missing.join(', ')}.`,
      remediation: 'Update the Stripe webhook endpoint subscription so refunds, disputes, and checkout completions all reach Greybox Cloud.',
    };
  }
  const extra = configured.filter((eventType) => !Object.hasOwn(STRIPE_EVENT_ROUTES, eventType));
  if (extra.length > 0) {
    return {
      id: 'stripe-webhook-events',
      label: 'Stripe webhook subscribed events',
      status: 'warn',
      detail: `Required Marketplace events are configured; unsupported extra event(s) will be acknowledged only: ${extra.join(', ')}.`,
      remediation: 'Narrow the Stripe webhook subscription to the required Marketplace event set to reduce webhook noise.',
    };
  }
  return {
    id: 'stripe-webhook-events',
    label: 'Stripe webhook subscribed events',
    status: 'pass',
    detail: 'Checkout, refund, and dispute events are subscribed for Marketplace forwarding.',
  };
}

function marketplaceForwardingRoutes(
  marketplaceUrl: string | undefined,
): CheckoutMarketplaceForwardingRoute[] {
  return Object.entries(STRIPE_EVENT_ROUTES).map(([eventType, path]) => ({
    eventType,
    path,
    ...(marketplaceUrl ? { url: `${marketplaceUrl}${path}` } : {}),
  }));
}

function webhookForwardRequestIdHeader(requestId: string | undefined): Record<string, string> {
  const value = requestId?.trim() ?? '';
  return /^[A-Za-z0-9_.:-]{1,128}$/u.test(value) ? { 'x-request-id': value } : {};
}

function webhookForwardStripeSignatureHeader(signatureHeader: string | null | undefined): Record<string, string> {
  const value = signatureHeader?.trim() ?? '';
  return value ? { 'stripe-signature': value } : {};
}

export function stripeWebhookEventsFromEnv(
  env: { readonly GREYBOX_STRIPE_WEBHOOK_EVENTS?: string } = process.env,
): string[] | undefined {
  const raw = env.GREYBOX_STRIPE_WEBHOOK_EVENTS?.trim();
  if (!raw) return undefined;
  return normalizedStripeWebhookEvents(raw.split(','));
}

function normalizedStripeWebhookEvents(value: readonly string[] | undefined): string[] {
  return [...new Set((value ?? [])
    .map((eventType) => eventType.trim())
    .filter(Boolean))]
    .sort();
}

function marketplaceUrlCheck(value: string | undefined): CheckoutReadinessCheck {
  const url = cleanMarketplaceUrl(value);
  if (!url) {
    return {
      id: 'marketplace-url',
      label: 'Marketplace fulfillment URL',
      status: 'fail',
      detail: 'Not configured or not an HTTP(S) URL.',
      remediation: 'Set GREYBOX_MARKETPLACE_URL to the deployed marketplace base URL.',
    };
  }
  const parsed = new URL(url);
  if (parsed.protocol === 'https:') {
    return {
      id: 'marketplace-url',
      label: 'Marketplace fulfillment URL',
      status: 'pass',
      detail: 'Configured with HTTPS.',
    };
  }
  if (['localhost', '127.0.0.1', '::1'].includes(parsed.hostname)) {
    return {
      id: 'marketplace-url',
      label: 'Marketplace fulfillment URL',
      status: 'warn',
      detail: 'Configured for a local rehearsal endpoint.',
      remediation: 'Use an HTTPS marketplace URL before hosted Stripe cutover.',
    };
  }
  return {
    id: 'marketplace-url',
    label: 'Marketplace fulfillment URL',
    status: 'fail',
    detail: 'Configured URL is not HTTPS.',
    remediation: 'Use HTTPS for GREYBOX_MARKETPLACE_URL before receiving Stripe webhooks.',
  };
}

function marketplaceAdminTokenCheck(value: string | undefined): CheckoutReadinessCheck {
  const token = value?.trim() ?? '';
  if (!token) {
    return {
      id: 'marketplace-admin-token',
      label: 'Marketplace admin token',
      status: 'fail',
      detail: 'Not configured.',
      remediation: 'Set GREYBOX_MARKETPLACE_ADMIN_TOKEN to a long random token accepted by marketplace fulfillment.',
    };
  }
  if (
    token.length < marketplaceAdminTokenMinLength
    || token === 'marketplace-admin-token'
    || token === 'greybox-marketplace-admin-token'
    || placeholderCredentialPattern.test(token)
    || marketplaceAdminTokenPlaceholderPattern.test(token)
  ) {
    return {
      id: 'marketplace-admin-token',
      label: 'Marketplace admin token',
      status: 'fail',
      detail: 'Configured value is too short or still looks like a placeholder.',
      remediation: 'Rotate GREYBOX_MARKETPLACE_ADMIN_TOKEN before hosted Checkout cutover.',
    };
  }
  return {
    id: 'marketplace-admin-token',
    label: 'Marketplace admin token',
    status: 'pass',
    detail: 'Configured with a non-placeholder value.',
  };
}

function auditLogCheck(configured: boolean): CheckoutReadinessCheck {
  if (configured) {
    return {
      id: 'checkout-audit-log',
      label: 'Checkout audit evidence',
      status: 'pass',
      detail: 'Hash-chained audit logging is configured for fulfilled sessions.',
    };
  }
  return {
    id: 'checkout-audit-log',
    label: 'Checkout audit evidence',
    status: 'fail',
    detail: 'Audit log is not configured.',
    remediation: 'Set GREYBOX_AUDIT_LOG_DIR, GREYBOX_AUDIT_LOG_PG_URL, or inject an AuditLog before enabling hosted Checkout webhooks.',
  };
}

function parseStripeSignatureHeader(header: string | null | undefined): { timestamp: number; signatures: string[] } {
  if (!header) throw new BillingWebhookError('stripe_signature_missing', 400, 'Stripe-Signature header is required');
  const fields = header.split(',').map((part) => part.trim()).filter(Boolean);
  const timestampField = fields.find((field) => field.startsWith('t='));
  const timestamp = Number(timestampField?.slice(2));
  if (!Number.isInteger(timestamp) || timestamp <= 0) {
    throw new BillingWebhookError('stripe_signature_timestamp_invalid', 400, 'Stripe-Signature timestamp is invalid');
  }
  const signatures = fields
    .filter((field) => field.startsWith('v1='))
    .map((field) => field.slice(3))
    .filter((signature) => /^[a-f0-9]{64}$/iu.test(signature));
  if (signatures.length === 0) {
    throw new BillingWebhookError('stripe_signature_missing_v1', 400, 'Stripe-Signature v1 signature is required');
  }
  return { timestamp, signatures };
}

function parseStripeWebhookEvent(rawBody: string): { id: string; type: string; stripeObjectId?: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw new BillingWebhookError('stripe_webhook_payload_invalid', 400, 'Stripe webhook payload must be valid JSON');
  }
  if (!isRecord(parsed)) throw new BillingWebhookError('stripe_webhook_payload_invalid', 400, 'Stripe webhook payload must be an object');
  const id = typeof parsed.id === 'string' ? parsed.id.trim() : '';
  const type = typeof parsed.type === 'string' ? parsed.type.trim() : '';
  if (!id || !type) throw new BillingWebhookError('stripe_webhook_event_invalid', 400, 'Stripe webhook id and type are required');
  const data = isRecord(parsed.data) ? parsed.data : undefined;
  const object = data && isRecord(data.object) ? data.object : undefined;
  const stripeObjectId = typeof object?.id === 'string' && object.id.trim().length > 0
    ? object.id.trim()
    : undefined;
  return {
    id,
    type,
    ...(stripeObjectId ? { stripeObjectId } : {}),
  };
}

function timingSafeHexEqual(expectedHex: string, actualHex: string): boolean {
  const expected = Buffer.from(expectedHex, 'hex');
  const actual = Buffer.from(actualHex, 'hex');
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

function marketplaceFulfillmentIdempotent(value: unknown): boolean | undefined {
  if (!isRecord(value) || !isRecord(value.result)) return undefined;
  return typeof value.result.idempotent === 'boolean' ? value.result.idempotent : undefined;
}

function cleanMarketplaceUrl(url: string | undefined): string | undefined {
  const clean = url?.trim();
  if (!clean) return undefined;
  try {
    const parsed = new URL(clean);
    const hostname = parsed.hostname.replace(/^\[|\]$/gu, '').toLowerCase();
    if (parsed.protocol !== 'https:' && !['localhost', '127.0.0.1', '::1'].includes(hostname)) {
      return undefined;
    }
    return parsed.toString().replace(/\/+$/u, '');
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
