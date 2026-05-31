// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import type {
  Creator,
  CreatorPayoutReadiness,
  CreatorPayoutRequirement,
  MarketplaceOrder,
  PayoutInstruction,
  StripeConnectAccountLinkSummary,
  StripeConnectAccountCreateRequest,
  StripeConnectAccountLinkRequest,
  StripeConnectAccountSummary,
  StripeConnectOnboardingPlan,
  StripeConnectTransferRequest,
} from '../types.js';
import { normalizeStripeApiBase } from '../stripeApiBase.js';

const BEARER_TOKEN_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}(?=$|[^A-Za-z0-9._~+/=-])/giu;
const STRIPE_SECRET_PATTERN = /\b(?:Bearer\s+)?(?:sk|rk)_(?:live|test)_[A-Za-z0-9_]+\b|\bwhsec_[A-Za-z0-9_]+\b/giu;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu;
const IP_ADDRESS_PATTERN = /\b(?:\d{1,3}\.){3}\d{1,3}\b/gu;
const CARD_LIKE_PATTERN = /\b(?:\d[ -]*?){13,19}\b/gu;
const PHONE_PATTERN = /\+?\b(?:\d[\s().-]?){7,}\d\b/gu;
const STRIPE_OBJECT_ID_PATTERN = /\b(?:acct|ch|cs|cus|dp|evt|pi|re|taxcalc|tr|txr)_[A-Za-z0-9_]+\b/gu;

export interface PayoutProvider {
  createTransfer(order: MarketplaceOrder, creator: Creator): Promise<PayoutInstruction>;
  /**
   * Initiate a Stripe refund for the order. Optional on the interface so
   * legacy provider implementations don't break; production code paths that
   * call store.refundOrder() will fail closed with a clear error if the
   * configured provider does not implement createRefund().
   */
  createRefund?(input: RefundProviderInput): Promise<RefundProviderResult>;
}

export interface StripeConnectOnboardingProvider {
  createAccount(creator: Creator): Promise<StripeConnectAccountSummary>;
  createAccountLink(
    creator: Creator,
    input: { returnUrl: string; refreshUrl: string },
  ): Promise<StripeConnectAccountLinkSummary>;
}

export interface RefundProviderInput {
  readonly orderId: string;
  readonly stripePaymentIntentId: string;
  readonly amountCents: number;
  readonly currency: string;
  readonly reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer';
}

export interface RefundProviderResult {
  readonly stripeRefundId: string;
  readonly status: 'queued' | 'succeeded' | 'pending' | 'blocked';
  readonly reason?: string;
}

/**
 * Build the Stripe Refund Create request body. Mirrors
 * buildStripeConnectTransferRequest() in shape: a structured request object
 * the provider can submit. Use {amount} (cents) for partial refunds; omit
 * for full.
 */
export function buildStripeRefundRequest(input: RefundProviderInput): {
  readonly method: 'POST';
  readonly endpoint: '/v1/refunds';
  readonly idempotencyKey: string;
  readonly body: Record<string, unknown>;
} {
  if (!input.stripePaymentIntentId) {
    throw new Error('stripePaymentIntentId is required to build a refund request');
  }
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new Error('refund amountCents must be a positive integer');
  }
  return {
    method: 'POST',
    endpoint: '/v1/refunds',
    idempotencyKey: `greybox-refund-${input.orderId}-${input.amountCents}`,
    body: {
      payment_intent: input.stripePaymentIntentId,
      amount: input.amountCents,
      ...(input.reason ? { reason: input.reason } : {}),
      metadata: {
        greybox_order_id: input.orderId,
      },
    },
  };
}

export function creatorPayoutReadiness(creator: Creator): CreatorPayoutReadiness {
  const requirements: CreatorPayoutRequirement[] = [];
  if (!creator.active) {
    requirements.push({
      code: 'creator_active_required',
      severity: 'required',
      message: 'Creator must be active before marketplace payouts are enabled.',
    });
  }
  if (!creator.stripeConnectAccountId) {
    requirements.push({
      code: 'stripe_connect_account_required',
      severity: 'required',
      message: 'Creator needs a Stripe Connect Express account before payouts can be sent.',
    });
  } else if (creator.stripeConnectOnboardingComplete === false || creator.stripeConnectTransfersEnabled === false) {
    requirements.push({
      code: 'stripe_connect_onboarding_required',
      severity: 'required',
      message: 'Creator must complete Stripe Connect onboarding and transfers must be enabled before payouts are released.',
    });
  }
  if (!creator.taxProfileId) {
    requirements.push({
      code: 'tax_profile_required',
      severity: 'required',
      message: 'Creator tax profile must be collected before payouts are released.',
    });
  }
  const canReceivePayouts = requirements.length === 0;
  const nextAction = !canReceivePayouts ? nextPayoutAction(requirements) : undefined;
  return {
    creatorId: creator.id,
    status: canReceivePayouts ? 'ready' : creator.active ? 'needs-onboarding' : 'blocked',
    canReceivePayouts,
    ...(creator.stripeConnectAccountId ? { stripeConnectAccountId: creator.stripeConnectAccountId } : {}),
    requirements,
    ...(nextAction ? { nextAction } : {}),
  };
}

export function buildStripeConnectAccountCreateRequest(creator: Creator): StripeConnectAccountCreateRequest {
  return {
    method: 'POST',
    endpoint: '/v1/accounts',
    idempotencyKey: `greybox-connect-account-${creator.id}`,
    body: {
      type: 'express',
      country: creator.country.toUpperCase(),
      ...(creator.email ? { email: creator.email } : {}),
      capabilities: {
        transfers: { requested: true },
      },
      business_profile: {
        product_description: 'Greybox Studio creator marketplace sales.',
      },
      metadata: {
        greybox_creator_id: creator.id,
      },
    },
  };
}

export function buildStripeConnectAccountLinkRequest(
  creator: Creator,
  input: { returnUrl: string; refreshUrl: string },
): StripeConnectAccountLinkRequest {
  if (!creator.stripeConnectAccountId) throw new Error('stripeConnectAccountId is required before creating an onboarding link');
  const urls = normalizeStripeConnectOnboardingUrls(input);
  return {
    method: 'POST',
    endpoint: '/v1/account_links',
    idempotencyKey: `greybox-connect-onboarding-${creator.id}-${creator.stripeConnectAccountId}`,
    body: {
      account: creator.stripeConnectAccountId,
      type: 'account_onboarding',
      refresh_url: urls.refreshUrl,
      return_url: urls.returnUrl,
    },
  };
}

export function buildStripeConnectTransferRequest(
  order: MarketplaceOrder,
  creator: Creator,
): StripeConnectTransferRequest {
  if (!creator.stripeConnectAccountId) throw new Error('stripeConnectAccountId is required before creating a transfer');
  return {
    method: 'POST',
    endpoint: '/v1/transfers',
    idempotencyKey: `greybox-transfer-${order.id}`,
    body: {
      amount: order.creatorNetCents,
      currency: order.currency,
      destination: creator.stripeConnectAccountId,
      transfer_group: `greybox-order-${order.id}`,
      metadata: {
        greybox_order_id: order.id,
        greybox_creator_id: creator.id,
        greybox_listing_id: order.listingId,
      },
    },
  };
}

export function buildStripeConnectOnboardingPlan(
  creator: Creator,
  input: { returnUrl: string; refreshUrl: string },
): StripeConnectOnboardingPlan {
  const urls = normalizeStripeConnectOnboardingUrls(input);
  const readiness = creatorPayoutReadiness(creator);
  return {
    creatorId: creator.id,
    readiness,
    ...(!creator.stripeConnectAccountId ? { accountCreateRequest: buildStripeConnectAccountCreateRequest(creator) } : {}),
    ...(creator.stripeConnectAccountId && !readiness.canReceivePayouts
      ? { accountLinkRequest: buildStripeConnectAccountLinkRequest(creator, urls) }
      : {}),
  };
}

export type MockStripeConnectProviderOptions = {
  /**
   * Caller-asserted override that allows the mock provider to be instantiated
   * in a production runtime. Use only for tightly-scoped tests that explicitly
   * stub their own environment; never set this on a real payout path.
   */
  readonly allowInProduction?: boolean;
  /** Env override for unit testing the guard itself. */
  readonly env?: { readonly NODE_ENV?: string };
};

/**
 * Test-only payout provider. Throws when instantiated in production unless the
 * operator has explicitly opted in via `allowInProduction: true`. Production
 * deployments must wire a real Stripe Connect provider (see
 * LiveStripeConnectProvider) and propagate it through MarketplaceStoreOptions
 * so that calls to recordOrder() never fall back to this mock.
 */
export class MockStripeConnectProvider implements PayoutProvider, StripeConnectOnboardingProvider {
  constructor(options: MockStripeConnectProviderOptions = {}) {
    const env = options.env ?? process.env;
    const isProduction = (env.NODE_ENV ?? '').toLowerCase() === 'production';
    if (isProduction && options.allowInProduction !== true) {
      throw new Error(
        'MockStripeConnectProvider refused to instantiate in NODE_ENV=production. ' +
        'Wire a real PayoutProvider via MarketplaceStoreOptions.payoutProvider or ' +
        'pass allowInProduction:true if you are running a controlled test inside a ' +
        'production-flagged environment.',
      );
    }
  }

  async createTransfer(order: MarketplaceOrder, creator: Creator): Promise<PayoutInstruction> {
    const readiness = creatorPayoutReadiness(creator);
    const stripeConnectAccountId = creator.stripeConnectAccountId;
    if (!readiness.canReceivePayouts || !stripeConnectAccountId) {
      return {
        id: `payout-blocked-${order.id}`,
        orderId: order.id,
        creatorId: creator.id,
        stripeConnectAccountId: stripeConnectAccountId ?? '',
        amountCents: order.creatorNetCents,
        currency: order.currency,
        status: 'blocked',
        reason: readiness.requirements.map((requirement) => requirement.code).join(','),
      };
    }
    return {
      id: `po_${order.id}`,
      orderId: order.id,
      creatorId: creator.id,
      stripeConnectAccountId,
      amountCents: order.creatorNetCents,
      currency: order.currency,
      status: 'queued',
    };
  }

  async createRefund(input: RefundProviderInput): Promise<RefundProviderResult> {
    // Validate the request shape the same way the production builder does so
    // the mock catches contract violations before they reach Stripe.
    buildStripeRefundRequest(input);
    return {
      stripeRefundId: `re_mock_${input.orderId}_${input.amountCents}`,
      status: 'succeeded',
    };
  }

  async createAccount(creator: Creator): Promise<StripeConnectAccountSummary> {
    buildStripeConnectAccountCreateRequest(creator);
    return {
      stripeConnectAccountId: `acct_mock_${stableMockStripeKey(creator.id)}`,
      livemode: false,
      onboardingComplete: false,
      transfersEnabled: false,
    };
  }

  async createAccountLink(
    creator: Creator,
    input: { returnUrl: string; refreshUrl: string },
  ): Promise<StripeConnectAccountLinkSummary> {
    buildStripeConnectAccountLinkRequest(creator, input);
    return {
      url: `https://connect.stripe.com/setup/e/gbx_${stableMockStripeKey(`${creator.id}_${creator.stripeConnectAccountId ?? 'missing'}`)}`,
      expiresAt: Math.floor(Date.now() / 1000) + 1_800,
    };
  }
}

/**
 * Production payout provider. Submits real Stripe Connect transfer requests
 * built by buildStripeConnectTransferRequest() to the Stripe API and threads
 * the resulting transfer id back as a queued PayoutInstruction.
 *
 * The provider is intentionally minimal: it owns network access, retry policy
 * for transient 5xx/network errors, and idempotency-key reuse. All business
 * logic (readiness checks, currency selection, fee math) is computed upstream
 * by buildStripeConnectTransferRequest() so this class stays auditable.
 *
 * Wire it in MarketplaceStoreOptions.payoutProvider when starting the
 * marketplace service in production:
 *
 *   const store = new InMemoryMarketplaceStore({
 *     payoutProvider: new LiveStripeConnectProvider({
 *       apiKey: process.env.STRIPE_SECRET_KEY!,
 *     }),
 *   });
 *
 * Setting `dryRun: true` makes the provider return a synthetic queued instruction
 * without contacting Stripe - useful for canary deploys and shadow traffic.
 */
export type LiveStripeConnectProviderOptions = {
  /** Stripe secret key (sk_live_*). When absent, dryRun defaults to true. */
  readonly apiKey?: string;
  /** Skip the Stripe network call; emit a synthetic queued instruction. */
  readonly dryRun?: boolean;
  /** Override fetch for tests. */
  readonly fetchFn?: typeof fetch;
  /** Override the Stripe API base for tests; defaults to https://api.stripe.com */
  readonly stripeApiBase?: string;
  /** Number of retries on transient transport / 5xx errors. Default 3. */
  readonly maxRetries?: number;
  /** Minimum backoff between retries in ms. Default 250. */
  readonly retryBackoffMs?: number;
};

export class LiveStripeConnectProvider implements PayoutProvider, StripeConnectOnboardingProvider {
  private readonly apiKey: string | undefined;
  private readonly dryRun: boolean;
  private readonly fetchFn: typeof fetch;
  private readonly stripeApiBase: string;
  private readonly maxRetries: number;
  private readonly retryBackoffMs: number;

  constructor(options: LiveStripeConnectProviderOptions = {}) {
    this.apiKey = options.apiKey;
    // Mirror greybox-cloud's StripeMeterSubmitter contract: dryRun defaults to
    // !apiKey so misconfigured deployments never silently move money.
    this.dryRun = options.dryRun ?? !options.apiKey;
    this.fetchFn = options.fetchFn ?? fetch;
    this.stripeApiBase = normalizeStripeApiBase(options.stripeApiBase, {
      allowNonStripeHost: Boolean(options.fetchFn),
    });
    this.maxRetries = options.maxRetries ?? 3;
    this.retryBackoffMs = options.retryBackoffMs ?? 250;
  }

  async createTransfer(order: MarketplaceOrder, creator: Creator): Promise<PayoutInstruction> {
    const readiness = creatorPayoutReadiness(creator);
    if (!readiness.canReceivePayouts || !creator.stripeConnectAccountId) {
      return {
        id: `payout-blocked-${order.id}`,
        orderId: order.id,
        creatorId: creator.id,
        stripeConnectAccountId: creator.stripeConnectAccountId ?? '',
        amountCents: order.creatorNetCents,
        currency: order.currency,
        status: 'blocked',
        reason: readiness.requirements.map((r) => r.code).join(','),
      };
    }
    const request = buildStripeConnectTransferRequest(order, creator);
    if (this.dryRun || !this.apiKey) {
      return {
        id: `po_dryrun_${order.id}`,
        orderId: order.id,
        creatorId: creator.id,
        stripeConnectAccountId: creator.stripeConnectAccountId,
        amountCents: order.creatorNetCents,
        currency: order.currency,
        status: 'queued',
        ...(this.dryRun && this.apiKey ? { reason: 'dry_run' } : { reason: 'no_api_key_dry_run' }),
      };
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
          const payload = (await response.json().catch(() => ({}))) as { id?: string; balance_transaction?: unknown };
          const transferId = stripeObjectId(payload.id, 'tr');
          if (!transferId) {
            return {
              id: `payout-failed-${order.id}`,
              orderId: order.id,
              creatorId: creator.id,
              stripeConnectAccountId: creator.stripeConnectAccountId,
              amountCents: order.creatorNetCents,
              currency: order.currency,
              status: 'blocked',
              reason: 'stripe_malformed_response:missing_transfer_id',
            };
          }
          const balanceTransactionId = stripeExpandableObjectId(payload.balance_transaction, 'txn');
          return {
            id: transferId,
            orderId: order.id,
            creatorId: creator.id,
            stripeConnectAccountId: creator.stripeConnectAccountId,
            amountCents: order.creatorNetCents,
              currency: order.currency,
              status: 'queued',
              delivery: 'manual-transfer',
              ...(balanceTransactionId ? { stripeTransferBalanceTransactionId: balanceTransactionId } : {}),
            };
          }
        // Stripe returns 4xx for non-retryable validation failures; 5xx and 429 are retryable.
        if (response.status < 500 && response.status !== 429) {
          const text = await response.text().catch(() => '');
          return {
            id: `payout-failed-${order.id}`,
            orderId: order.id,
            creatorId: creator.id,
            stripeConnectAccountId: creator.stripeConnectAccountId,
            amountCents: order.creatorNetCents,
            currency: order.currency,
            status: 'blocked',
            reason: stripeErrorReason(response.status, text),
          };
        }
        lastError = new Error(`stripe_transient_${response.status}`);
      } catch (error) {
        lastError = error;
      }
      if (attempt < this.maxRetries) {
        await sleep(this.retryBackoffMs * 2 ** attempt);
      }
    }
    return {
      id: `payout-failed-${order.id}`,
      orderId: order.id,
      creatorId: creator.id,
      stripeConnectAccountId: creator.stripeConnectAccountId,
      amountCents: order.creatorNetCents,
      currency: order.currency,
      status: 'blocked',
      reason: stripeTransportErrorReason('stripe_transport_exhausted', lastError),
    };
  }

  async createRefund(input: RefundProviderInput): Promise<RefundProviderResult> {
    const request = buildStripeRefundRequest(input);
    if (this.dryRun || !this.apiKey) {
      return {
        stripeRefundId: `re_dryrun_${input.orderId}_${input.amountCents}`,
        status: 'queued',
        ...(this.dryRun && this.apiKey ? { reason: 'dry_run' } : { reason: 'no_api_key_dry_run' }),
      };
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
          const payload = (await response.json().catch(() => ({}))) as { id?: string; status?: string };
          const refundId = stripeObjectId(payload.id, 're');
          if (!refundId) {
            return {
              stripeRefundId: `refund-failed-${input.orderId}`,
              status: 'blocked',
              reason: 'stripe_malformed_response:missing_refund_id',
            };
          }
          const status = (payload.status === 'succeeded' || payload.status === 'pending') ? payload.status : 'queued';
          return {
            stripeRefundId: refundId,
            status,
          };
        }
        if (response.status < 500 && response.status !== 429) {
          const text = await response.text().catch(() => '');
          return {
            stripeRefundId: `refund-failed-${input.orderId}`,
            status: 'blocked',
            reason: stripeErrorReason(response.status, text),
          };
        }
        lastError = new Error(`stripe_transient_${response.status}`);
      } catch (error) {
        lastError = error;
      }
      if (attempt < this.maxRetries) {
        await sleep(this.retryBackoffMs * 2 ** attempt);
      }
    }
    return {
      stripeRefundId: `refund-failed-${input.orderId}`,
      status: 'blocked',
      reason: stripeTransportErrorReason('stripe_transport_exhausted', lastError),
    };
  }

  async createAccount(creator: Creator): Promise<StripeConnectAccountSummary> {
    const request = buildStripeConnectAccountCreateRequest(creator);
    if (this.dryRun || !this.apiKey) {
      return {
        stripeConnectAccountId: `acct_dryrun_${stableMockStripeKey(creator.id)}`,
        livemode: false,
      };
    }
    const payload = await this.submitStripeRequest(
      request.endpoint,
      request.idempotencyKey,
      request.body,
      `connect_account_${creator.id}`,
    );
    const id = typeof payload.id === 'string' ? payload.id.trim() : '';
    if (!/^acct_[A-Za-z0-9_]+$/u.test(id)) {
      throw new Error('Stripe account create response is missing a valid account id');
    }
    const livemode = typeof payload.livemode === 'boolean' ? payload.livemode : undefined;
    const detailsSubmitted = typeof payload.details_submitted === 'boolean' ? payload.details_submitted : undefined;
    const payoutsEnabled = typeof payload.payouts_enabled === 'boolean' ? payload.payouts_enabled : undefined;
    const capabilities = isRecord(payload.capabilities) ? payload.capabilities : undefined;
    const transfersCapability = typeof capabilities?.transfers === 'string' ? capabilities.transfers : undefined;
    const requirements = isRecord(payload.requirements) ? payload.requirements : undefined;
    const disabledReason = typeof requirements?.disabled_reason === 'string'
      ? normalizeStripeStatusReason(requirements.disabled_reason)
      : undefined;
    const transfersEnabled = stripeTransfersEnabled({
      payoutsEnabled,
      transfersCapability,
    });
    return {
      stripeConnectAccountId: id,
      ...(livemode !== undefined ? { livemode } : {}),
      ...(detailsSubmitted !== undefined ? { onboardingComplete: detailsSubmitted } : {}),
      ...(transfersEnabled !== undefined ? { transfersEnabled } : {}),
      ...(disabledReason ? { disabledReason } : {}),
    };
  }

  async createAccountLink(
    creator: Creator,
    input: { returnUrl: string; refreshUrl: string },
  ): Promise<StripeConnectAccountLinkSummary> {
    const request = buildStripeConnectAccountLinkRequest(creator, input);
    if (this.dryRun || !this.apiKey) {
      return {
        url: `https://connect.stripe.com/setup/e/gbx_${stableMockStripeKey(`${creator.id}_${creator.stripeConnectAccountId ?? 'missing'}`)}`,
        expiresAt: Math.floor(Date.now() / 1000) + 1_800,
      };
    }
    const payload = await this.submitStripeRequest(
      request.endpoint,
      request.idempotencyKey,
      request.body,
      `connect_account_link_${creator.id}`,
    );
    const rawUrl = typeof payload.url === 'string' ? payload.url.trim() : '';
    if (!rawUrl) throw new Error('Stripe account link response is missing url');
    const url = requireStripeConnectAccountLinkUrl(rawUrl);
    const expiresAt = typeof payload.expires_at === 'number' && Number.isFinite(payload.expires_at)
      ? payload.expires_at
      : undefined;
    return {
      url,
      ...(expiresAt !== undefined ? { expiresAt } : {}),
    };
  }

  private async submitStripeRequest(
    endpoint: string,
    idempotencyKey: string,
    requestBody: Record<string, unknown>,
    operation: string,
  ): Promise<Record<string, unknown>> {
    const body = stripeFormEncode(requestBody);
    const url = `${this.stripeApiBase}${endpoint}`;
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Idempotency-Key': idempotencyKey,
      'Stripe-Version': '2024-11-20.acacia',
    };
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await this.fetchFn(url, { method: 'POST', headers, body });
        if (response.status >= 200 && response.status < 300) {
          return (await response.json().catch(() => ({}))) as Record<string, unknown>;
        }
        const text = await response.text().catch(() => '');
        if (response.status < 500 && response.status !== 429) {
          throw new NonRetryableStripeError(stripeErrorReason(response.status, text));
        }
        lastError = new Error(`stripe_transient_${response.status}:${sanitizeStripeErrorText(text).slice(0, 200)}`);
      } catch (error) {
        if (error instanceof NonRetryableStripeError) throw error;
        lastError = error;
      }
      if (attempt < this.maxRetries) {
        await sleep(this.retryBackoffMs * 2 ** attempt);
      }
    }
    throw new Error(stripeTransportErrorReason(`stripe_${operation}_transport_exhausted`, lastError));
  }
}

function stripeFormEncode(body: Record<string, unknown>, prefix = ''): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(body)) {
    const formKey = prefix ? `${prefix}[${key}]` : key;
    if (value === undefined || value === null) continue;
    if (typeof value === 'object' && !Array.isArray(value)) {
      parts.push(stripeFormEncode(value as Record<string, unknown>, formKey));
    } else {
      parts.push(`${encodeURIComponent(formKey)}=${encodeURIComponent(String(value))}`);
    }
  }
  return parts.filter((p) => p.length > 0).join('&');
}

function stripeErrorReason(status: number, text: string): string {
  return `stripe_${status}:${sanitizeStripeErrorText(text).slice(0, 200)}`;
}

function stripeTransportErrorReason(code: string, lastError: unknown): string {
  const raw = lastError instanceof Error
    ? lastError.message
    : typeof lastError === 'string'
      ? lastError
      : 'unknown';
  const message = sanitizeStripeErrorText(raw || 'unknown').slice(0, 200) || 'unknown';
  return `${code}:${message}`;
}

function stripeObjectId(value: unknown, prefix: 'tr' | 're'): string {
  const id = typeof value === 'string' ? value.trim() : '';
  return new RegExp(`^${prefix}_[A-Za-z0-9_]+$`, 'u').test(id) ? id : '';
}

function stripeExpandableObjectId(value: unknown, prefix: 'txn'): string {
  if (typeof value === 'string') {
    const id = value.trim();
    return new RegExp(`^${prefix}_[A-Za-z0-9_]+$`, 'u').test(id) ? id : '';
  }
  if (isRecord(value)) return stripeExpandableObjectId(value.id, prefix);
  return '';
}

function normalizeStripeConnectOnboardingUrls(input: { returnUrl: string; refreshUrl: string }): { returnUrl: string; refreshUrl: string } {
  return {
    returnUrl: requireHttpsUrl(input.returnUrl, 'returnUrl'),
    refreshUrl: requireHttpsUrl(input.refreshUrl, 'refreshUrl'),
  };
}

function requireHttpsUrl(value: string, label: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be an https URL`);
  }
  if (url.protocol !== 'https:') {
    throw new Error(`${label} must be an https URL`);
  }
  if (url.username || url.password) {
    throw new Error(`${label} must not include credentials`);
  }
  return url.toString();
}

function requireStripeConnectAccountLinkUrl(value: string): string {
  const normalized = requireHttpsUrl(value, 'Stripe account link response url');
  const url = new URL(normalized);
  if (url.hostname !== 'connect.stripe.com') {
    throw new Error('Stripe account link response url must be hosted on connect.stripe.com');
  }
  return url.toString();
}

function sanitizeStripeErrorText(text: string): string {
  return text
    .replace(BEARER_TOKEN_PATTERN, '[redacted-secret]')
    .replace(STRIPE_SECRET_PATTERN, '[redacted-secret]')
    .replace(EMAIL_PATTERN, '[redacted-email]')
    .replace(IP_ADDRESS_PATTERN, '[redacted-ip]')
    .replace(CARD_LIKE_PATTERN, '[redacted-card]')
    .replace(PHONE_PATTERN, '[redacted-phone]')
    .replace(STRIPE_OBJECT_ID_PATTERN, '[redacted-stripe-id]');
}

function normalizeStripeStatusReason(value: string): string | undefined {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return undefined;
  return /^[a-z0-9_.:-]{1,80}$/u.test(trimmed) ? trimmed : 'redacted';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stripeTransfersEnabled(input: {
  payoutsEnabled: boolean | undefined;
  transfersCapability: string | undefined;
}): boolean | undefined {
  if (input.payoutsEnabled === undefined && input.transfersCapability === undefined) return undefined;
  if (input.transfersCapability !== undefined) {
    return input.transfersCapability === 'active' && input.payoutsEnabled !== false;
  }
  return input.payoutsEnabled;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class NonRetryableStripeError extends Error {}

function stableMockStripeKey(value: string): string {
  return value.replace(/[^A-Za-z0-9_]/gu, '_').slice(0, 48) || 'creator';
}

function nextPayoutAction(requirements: CreatorPayoutRequirement[]): CreatorPayoutReadiness['nextAction'] {
  if (requirements.some((requirement) => requirement.code === 'stripe_connect_account_required')) {
    return 'create_stripe_connect_account';
  }
  if (requirements.some((requirement) => requirement.code === 'stripe_connect_onboarding_required')) {
    return 'complete_stripe_connect_onboarding';
  }
  return 'collect_tax_profile';
}
