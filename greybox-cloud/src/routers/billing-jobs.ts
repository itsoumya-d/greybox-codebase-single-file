// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import type { BillingLedger } from '../metering/billingLedger.js';
import { StripeMeterSubmitter, type StripeMeterSubmission } from '../metering/stripeMeterSubmitter.js';
import { sanitizeStripeOperationalText } from '../security/stripeRedaction.js';
import {
  DEFAULT_STRIPE_METER_PAYLOAD_CONFIG,
  buildStripeMeterEvents,
  createBillingInvoice,
  type BillingInvoice,
  type BillingPeriod,
  type StripeBillingIdentity,
  type StripeMeterEvent,
  type StripeMeterPayloadConfig,
} from './billing.js';
import type { PlanTier, TenantConfig } from '../types.js';

export interface BillingInvoiceJobRequest {
  tenantId: string;
  tier: PlanTier;
  period: BillingPeriod;
  seatCount?: number;
  submitStripe?: boolean;
  dryRun?: boolean;
  enterprisePeriodBaseUsd?: number;
  enterpriseIncludedInputTokens?: number;
  enterpriseIncludedOutputTokens?: number;
  enterpriseInputOverageUsdPer1K?: number;
  enterpriseOutputOverageUsdPer1K?: number;
}

export interface BillingInvoiceJobResponse {
  invoice: BillingInvoice;
  meterEvents: StripeMeterEvent[];
  submissions: StripeMeterSubmission[];
  dryRun: boolean;
}

export interface BillingInvoiceJobFailure {
  identifier: string;
  eventName: string;
  error: string;
  stripeRequestId?: string;
}

export class BillingInvoiceJobError extends Error {
  readonly code = 'stripe_meter_submission_failed';
  readonly status = 502;

  constructor(readonly failures: readonly BillingInvoiceJobFailure[]) {
    super(`Stripe meter submission failed for ${failures.length} event${failures.length === 1 ? '' : 's'}`);
    this.name = 'BillingInvoiceJobError';
  }
}

export class BillingInvoicePeriodError extends Error {
  readonly code = 'billing_period_not_closed';
  readonly status = 409;

  constructor(
    readonly periodEnd: string,
    readonly now: string,
  ) {
    super(`Billing period ${periodEnd} is not closed yet`);
    this.name = 'BillingInvoicePeriodError';
  }
}

export class BillingInvoiceBillingIdentityError extends Error {
  readonly code = 'billing_identity_missing';
  readonly status = 409;

  constructor(
    readonly tenantId: string,
    readonly reasons: readonly string[],
  ) {
    super(`Live Stripe metering requires durable billing identity for tenant ${tenantId}`);
    this.name = 'BillingInvoiceBillingIdentityError';
  }
}

export interface BillingInvoiceJobDependencies {
  ledger: BillingLedger;
  stripeSubmitter?: StripeMeterSubmitter;
  stripeApiKey?: string;
  stripeEndpoint?: string;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  tenantStore?: {
    refreshFromPersister?: () => Promise<void>;
    get: (id: string) => TenantConfig | undefined;
  };
}

const tiers = new Set<PlanTier>(['free', 'indie', 'studio', 'enterprise']);
type TenantStripeMeterPayloadConfig = NonNullable<TenantConfig['billing']>['stripeMeterPayload'];

function assertString(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required`);
  return value.trim();
}

function optionalNumber(value: unknown, name: string): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a non-negative number`);
  }
  return value;
}

function parsePeriod(value: unknown): BillingPeriod {
  if (!value || typeof value !== 'object') throw new Error('period is required');
  const period = value as { start?: unknown; end?: unknown };
  const start = assertString(period.start, 'period.start');
  const end = assertString(period.end, 'period.end');
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs >= endMs) {
    throw new Error('period must contain valid ISO start and end timestamps');
  }
  return { start, end };
}

export function parseBillingInvoiceJobRequest(body: unknown): BillingInvoiceJobRequest {
  if (!body || typeof body !== 'object') throw new Error('request body is required');
  const input = body as Record<string, unknown>;
  const tier = assertString(input.tier, 'tier') as PlanTier;
  if (!tiers.has(tier)) throw new Error(`unsupported tier: ${tier}`);
  return {
    tenantId: assertString(input.tenantId, 'tenantId'),
    tier,
    period: parsePeriod(input.period),
    seatCount: optionalNumber(input.seatCount, 'seatCount'),
    submitStripe: input.submitStripe === true,
    dryRun: input.dryRun !== false,
    enterprisePeriodBaseUsd: optionalNumber(input.enterprisePeriodBaseUsd, 'enterprisePeriodBaseUsd'),
    enterpriseIncludedInputTokens: optionalNumber(input.enterpriseIncludedInputTokens, 'enterpriseIncludedInputTokens'),
    enterpriseIncludedOutputTokens: optionalNumber(input.enterpriseIncludedOutputTokens, 'enterpriseIncludedOutputTokens'),
    enterpriseInputOverageUsdPer1K: optionalNumber(input.enterpriseInputOverageUsdPer1K, 'enterpriseInputOverageUsdPer1K'),
    enterpriseOutputOverageUsdPer1K: optionalNumber(input.enterpriseOutputOverageUsdPer1K, 'enterpriseOutputOverageUsdPer1K'),
  };
}

export async function runBillingInvoiceJob(
  request: BillingInvoiceJobRequest,
  deps: BillingInvoiceJobDependencies,
): Promise<BillingInvoiceJobResponse> {
  const dryRun = request.dryRun ?? !deps.stripeApiKey;
  assertClosedPeriodForLiveMetering(request, dryRun, deps.now?.() ?? new Date());
  const events = await deps.ledger.readUsageEvents();
  const invoice = createBillingInvoice({ ...request, events });
  const liveBillingIdentity = await resolveLiveBillingIdentity(request, deps, dryRun);
  const meterEvents = buildStripeMeterEvents(invoice, liveBillingIdentity
    ? { billingIdentity: liveBillingIdentity }
    : {});
  await deps.ledger.appendInvoice(invoice);
  const submitter = deps.stripeSubmitter ?? new StripeMeterSubmitter({
    apiKey: deps.stripeApiKey,
    dryRun,
    endpoint: deps.stripeEndpoint,
    fetchImpl: deps.fetchImpl,
    ledger: deps.ledger,
  });
  const submissions = request.submitStripe ? await submitter.submit(meterEvents) : [];
  const failures = stripeMeterSubmissionFailures(submissions);
  if (failures.length > 0) throw new BillingInvoiceJobError(failures);
  return { invoice, meterEvents, submissions, dryRun };
}

function assertClosedPeriodForLiveMetering(
  request: BillingInvoiceJobRequest,
  dryRun: boolean,
  now: Date,
): void {
  if (request.submitStripe !== true || dryRun) return;
  const periodEndMs = Date.parse(request.period.end);
  const nowMs = now.getTime();
  if (!Number.isFinite(periodEndMs) || !Number.isFinite(nowMs)) return;
  if (periodEndMs > nowMs) {
    throw new BillingInvoicePeriodError(request.period.end, now.toISOString());
  }
}

async function resolveLiveBillingIdentity(
  request: BillingInvoiceJobRequest,
  deps: BillingInvoiceJobDependencies,
  dryRun: boolean,
): Promise<StripeBillingIdentity | undefined> {
  if (request.submitStripe !== true || dryRun) return undefined;
  await deps.tenantStore?.refreshFromPersister?.();
  const tenant = deps.tenantStore?.get(request.tenantId);
  const stripeCustomerId = tenant?.billing?.stripeCustomerId?.trim();
  const meterPayload = normalizeMeterPayloadConfig(tenant?.billing?.stripeMeterPayload);
  const reasons: string[] = [];
  if (!tenant) reasons.push('tenant_not_found');
  if (!stripeCustomerId) reasons.push('stripe_customer_id_missing');
  if (!meterPayload) reasons.push('stripe_meter_payload_config_invalid');
  if (reasons.length > 0 || !stripeCustomerId || !meterPayload) {
    throw new BillingInvoiceBillingIdentityError(request.tenantId, reasons);
  }
  return { stripeCustomerId, meterPayload };
}

function normalizeMeterPayloadConfig(config: TenantStripeMeterPayloadConfig): StripeMeterPayloadConfig | undefined {
  const customerKey = config?.customerKey?.trim() || DEFAULT_STRIPE_METER_PAYLOAD_CONFIG.customerKey;
  const valueKey = config?.valueKey?.trim() || DEFAULT_STRIPE_METER_PAYLOAD_CONFIG.valueKey;
  if (!stripePayloadKeyIsSafe(customerKey) || !stripePayloadKeyIsSafe(valueKey)) return undefined;
  return { customerKey, valueKey };
}

function stripePayloadKeyIsSafe(value: string): boolean {
  return /^[A-Za-z][A-Za-z0-9_]{0,99}$/u.test(value);
}

function stripeMeterSubmissionFailures(submissions: readonly StripeMeterSubmission[]): BillingInvoiceJobFailure[] {
  return submissions
    .filter((submission) => submission.status === 'failed')
    .map((submission) => ({
      identifier: submission.event.identifier,
      eventName: submission.event.eventName,
      error: sanitizeFailureMessage(submission.error),
      ...(submission.stripeRequestId ? { stripeRequestId: submission.stripeRequestId } : {}),
    }));
}

function sanitizeFailureMessage(message: string | undefined): string {
  return sanitizeStripeOperationalText(message, 'Stripe meter submission failed');
}
