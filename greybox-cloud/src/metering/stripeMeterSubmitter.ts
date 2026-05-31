// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import type { StripeMeterEvent } from '../routers/billing.js';
import { sanitizeStripeOperationalText } from '../security/stripeRedaction.js';
import type { BillingLedger, BillingLedgerRecord } from './billingLedger.js';

export interface StripeMeterSubmitterOptions {
  apiKey?: string;
  dryRun?: boolean;
  endpoint?: string;
  fetchImpl?: typeof fetch;
  ledger?: BillingLedger;
  maxAttempts?: number;
  retryBackoffMs?: number;
  sleepMs?: (ms: number) => Promise<void>;
}

export interface StripeMeterSubmission {
  event: StripeMeterEvent;
  status: 'dry-run' | 'submitted' | 'failed';
  stripeRequestId?: string;
  error?: string;
}

function encodeStripeMeterEvent(event: StripeMeterEvent): URLSearchParams {
  const params = new URLSearchParams();
  params.set('event_name', event.eventName);
  params.set('identifier', event.identifier);
  params.set('timestamp', stripeTimestampSeconds(event.timestamp));
  for (const [key, value] of Object.entries(event.payload)) {
    if (value === undefined) continue;
    params.set(`payload[${key}]`, String(value));
  }
  return params;
}

function stripeTimestampSeconds(timestamp: string): string {
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) return timestamp;
  return String(Math.floor(parsed / 1_000));
}

function isRetryableStripeStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

function sanitizedStripeMeterError(message: string): string {
  return sanitizeStripeOperationalText(message, 'Stripe meter submission failed');
}

/**
 * Resolve the dryRun flag based on environment and API key.
 *
 * Rules (in priority order):
 *  1. Caller-supplied `options.dryRun` wins when explicitly provided.
 *  2. GREYBOX_STRIPE_METERING_ENABLED=true + sk_live_ key → live mode (escape hatch for staging).
 *  3. NODE_ENV=production + sk_live_ key → live mode (dryRun=false).
 *  4. NODE_ENV=production + no key → warn but stay dry (safe default).
 *  5. All other cases (dev/test, test key) → dryRun=true.
 */
function resolveDryRun(options: StripeMeterSubmitterOptions): boolean {
  // Explicit override always wins.
  if (options.dryRun !== undefined) return options.dryRun;

  // GREYBOX_STRIPE_METERING_ENABLED=true explicitly enables live metering
  // regardless of NODE_ENV (escape hatch for staging environments).
  if (process.env.GREYBOX_STRIPE_METERING_ENABLED === 'true') {
    // Still require a live key; refuse silently (warn, stay dry) without one.
    const apiKey = options.apiKey;
    if (!apiKey || !apiKey.startsWith('sk_live_')) {
      // eslint-disable-next-line no-console
      console.warn('[StripeMeterSubmitter] GREYBOX_STRIPE_METERING_ENABLED=true but no live key (sk_live_*) — staying in dry-run mode');
      return true;
    }
    return false;
  }

  const isProduction = process.env.NODE_ENV === 'production';
  const apiKey = options.apiKey;

  if (isProduction) {
    if (!apiKey) {
      // eslint-disable-next-line no-console
      console.warn('[StripeMeterSubmitter] NODE_ENV=production but no STRIPE_API_KEY — staying in dry-run mode');
      return true;
    }
    if (apiKey.startsWith('sk_live_')) {
      return false;
    }
    // Production env but non-live key (test key) — stay dry and warn.
    // eslint-disable-next-line no-console
    console.warn('[StripeMeterSubmitter] NODE_ENV=production but STRIPE_API_KEY is not a live key (sk_live_*) — staying in dry-run mode');
    return true;
  }

  // Non-production: always dry-run regardless of key.
  return true;
}

export class StripeMeterSubmitter {
  private readonly dryRun: boolean;
  private readonly endpoint: string;
  private readonly fetchImpl: typeof fetch;
  private readonly maxAttempts: number;
  private readonly retryBackoffMs: number;
  private readonly sleepMs: (ms: number) => Promise<void>;

  constructor(private readonly options: StripeMeterSubmitterOptions) {
    this.dryRun = resolveDryRun(options);
    this.endpoint = options.endpoint ?? 'https://api.stripe.com/v1/billing/meter_events';
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.maxAttempts = normalizedAttemptCount(options.maxAttempts);
    this.retryBackoffMs = normalizedBackoffMs(options.retryBackoffMs);
    this.sleepMs = options.sleepMs ?? defaultSleep;
  }

  async submit(events: StripeMeterEvent[]): Promise<StripeMeterSubmission[]> {
    const submissions: StripeMeterSubmission[] = [];
    for (const event of events) {
      const submission = await this.submitOne(event);
      submissions.push(submission);
    }
    return submissions;
  }

  private async submitOne(event: StripeMeterEvent): Promise<StripeMeterSubmission> {
    const existing = await this.previousSuccessfulSubmission(event);
    if (existing) return existing;

    if (this.dryRun) {
      // eslint-disable-next-line no-console
      console.info('[StripeMeterSubmitter] dry-run: would submit meter event', {
        eventName: event.eventName,
        identifier: event.identifier,
        payloadKeys: Object.keys(event.payload),
      });
      const submission: StripeMeterSubmission = { event, status: 'dry-run' };
      await this.options.ledger?.appendStripeMeterEvent(event, { dryRun: true });
      return submission;
    }

    if (!this.options.apiKey) {
      const error = 'Stripe API key is required when dryRun=false';
      await this.options.ledger?.appendStripeMeterEvent(event, { dryRun: false, error });
      return { event, status: 'failed', error };
    }

    const evidenceError = livePayloadEvidenceError(event);
    if (evidenceError) {
      await this.options.ledger?.appendStripeMeterEvent(event, { dryRun: false, error: evidenceError });
      return { event, status: 'failed', error: evidenceError };
    }

    let lastError = '';
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      try {
        const response = await this.fetchImpl(this.endpoint, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${this.options.apiKey}`,
            'content-type': 'application/x-www-form-urlencoded',
            'idempotency-key': event.identifier,
          },
          body: encodeStripeMeterEvent(event),
        });
        const stripeRequestId = response.headers.get('request-id') ?? undefined;
        if (!response.ok) {
          const error = sanitizedStripeMeterError(
            await response.text().catch(() => `Stripe returned ${response.status}`),
          );
          lastError = error;
          if (attempt < this.maxAttempts && isRetryableStripeStatus(response.status)) {
            await this.sleepBeforeRetry(attempt);
            continue;
          }
          await this.options.ledger?.appendStripeMeterEvent(event, {
            dryRun: false,
            stripeRequestId,
            error,
          });
          return { event, status: 'failed', stripeRequestId, error };
        }
        await this.options.ledger?.appendStripeMeterEvent(event, {
          dryRun: false,
          stripeRequestId,
        });
        return { event, status: 'submitted', ...(stripeRequestId ? { stripeRequestId } : {}) };
      } catch (error) {
        lastError = sanitizedStripeMeterError(error instanceof Error ? error.message : String(error));
        if (attempt < this.maxAttempts) {
          await this.sleepBeforeRetry(attempt);
          continue;
        }
        await this.options.ledger?.appendStripeMeterEvent(event, {
          dryRun: false,
          error: lastError,
        });
      }
    }
    return { event, status: 'failed', error: lastError };
  }

  private async sleepBeforeRetry(attempt: number): Promise<void> {
    const delayMs = this.retryBackoffMs * 2 ** Math.max(0, attempt - 1);
    if (delayMs > 0) await this.sleepMs(delayMs);
  }

  private async previousSuccessfulSubmission(event: StripeMeterEvent): Promise<StripeMeterSubmission | undefined> {
    if (!this.options.ledger) return undefined;
    const records = await this.options.ledger.readRecords();
    const successful = records
      .filter((record): record is StripeMeterLedgerRecord =>
        record.type === 'stripe-meter-event' && record.id === event.identifier)
      .filter((record) => !record.error);
    const prior = successful.find((record) => !record.dryRun)
      ?? (this.dryRun ? successful.find((record) => record.dryRun) : undefined);
    if (!prior) return undefined;
    return {
      event,
      status: prior.dryRun ? 'dry-run' : 'submitted',
      ...(prior.stripeRequestId ? { stripeRequestId: prior.stripeRequestId } : {}),
    };
  }
}

type StripeMeterLedgerRecord = Extract<BillingLedgerRecord, { type: 'stripe-meter-event' }>;

function livePayloadEvidenceError(event: StripeMeterEvent): string | undefined {
  const evidence = event.evidence;
  if (!evidence || evidence.source !== 'stripe-live') {
    return 'Stripe live meter event requires billing identity evidence';
  }
  if (!evidence.customerMappingPresent || !evidence.valueKeyPresent) {
    return 'Stripe live meter event requires configured customer and value payload keys';
  }
  if (event.payload[evidence.payloadConfig.customerKey] === undefined
    || event.payload[evidence.payloadConfig.valueKey] === undefined) {
    return 'Stripe live meter event payload does not match billing identity evidence';
  }
  return undefined;
}

function normalizedAttemptCount(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 5;
  return Math.max(1, Math.min(8, Math.trunc(value)));
}

function normalizedBackoffMs(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 250;
  return Math.max(0, Math.trunc(value));
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
