// Browser-side helpers that talk to the daemon's /api/billing/* proxy.
// The daemon forwards to greybox-cloud/v1/billing/*; we never call Stripe
// from the browser. See apps/daemon/src/billing-proxy.ts for the cloud
// envelope.

import type { BillingTierId } from './plans';

export type BillingMeResponse =
  | {
      configured: false;
      status: 'unconfigured';
    }
  | {
      configured: true;
      status: 'ok';
      tier: 'free' | 'indie' | 'studio' | 'enterprise';
      seats?: number;
      customerId?: string;
      currentPeriodEnd?: number;
      cancelAtPeriodEnd?: boolean;
      includedInputTokens?: number;
      includedOutputTokens?: number;
      portalAvailable?: boolean;
    }
  | {
      configured: true;
      status: 'error';
      error: string;
    };

// All three providers (Stripe, Razorpay, Dodo) return a redirect URL from
// /api/billing/checkout. The daemon's forwardCheckoutSession routes to the
// correct cloud endpoint and always sanitises the response down to { url }.
export interface CheckoutSessionResponse {
  url: string;
  id?: string;
  dryRun?: boolean;
}

export interface PortalSessionResponse {
  url: string;
  id?: string;
  dryRun?: boolean;
}

export interface BillingGeoResponse {
  country: string;
}

export interface CheckoutSessionInput {
  tier: BillingTierId;
  seats?: number;
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string;
  customerId?: string;
  provider?: 'stripe' | 'razorpay' | 'dodo';
}

/**
 * Build absolute return URLs from the browser window. Used by the /billing
 * UI when invoking the daemon proxy so the creator returns to the right
 * landing page after checkout finishes.
 */
export function billingReturnUrls(origin?: string): {
  successUrl: string;
  cancelUrl: string;
} {
  const base = origin ?? (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');
  return {
    successUrl: `${base}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${base}/billing/cancel`,
  };
}

export async function fetchBillingGeo(
  fetchImpl: typeof fetch = fetch,
): Promise<BillingGeoResponse> {
  try {
    const response = await fetchImpl('/api/billing/geo', {
      method: 'GET',
      headers: { accept: 'application/json' },
    });
    if (!response.ok) return { country: 'US' };
    const data = (await response.json()) as { country?: unknown };
    const country =
      typeof data.country === 'string' && /^[A-Z]{2}$/u.test(data.country.trim().toUpperCase())
        ? data.country.trim().toUpperCase()
        : 'US';
    return { country };
  } catch {
    return { country: 'US' };
  }
}

/**
 * Resolve which payment provider to use for a given user country and plan tier.
 * India → Razorpay, Enterprise → Stripe (sales-assisted), everyone else → Dodo Payments.
 *
 * The enterprise guard is defensive: the BillingPage intercepts enterprise before
 * reaching createCheckoutSession, but keeping the guard here ensures this helper
 * stays correct if call-sites change.
 */
export function resolveProvider(
  country: string,
  tier: BillingTierId,
): 'razorpay' | 'dodo' | 'stripe' {
  if (tier === 'enterprise') return 'stripe';
  return country.toUpperCase() === 'IN' ? 'razorpay' : 'dodo';
}

async function readJsonErrorMessage(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as
      | { error?: { code?: string; message?: string } | string; message?: string }
      | undefined;
    if (!payload) return `request failed with status ${response.status}`;
    if (typeof payload.error === 'string') return payload.error;
    if (payload.error?.message) return payload.error.message;
    if (payload.error?.code) return payload.error.code;
    if (payload.message) return payload.message;
  } catch {
    // fall through to default message
  }
  return `request failed with status ${response.status}`;
}

export async function fetchBillingMe(
  fetchImpl: typeof fetch = fetch,
): Promise<BillingMeResponse> {
  try {
    const response = await fetchImpl('/api/billing/me', {
      method: 'GET',
      headers: { accept: 'application/json' },
    });
    if (!response.ok) {
      return {
        configured: true,
        status: 'error',
        error: await readJsonErrorMessage(response),
      };
    }
    return (await response.json()) as BillingMeResponse;
  } catch (error) {
    return {
      configured: true,
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function createCheckoutSession(
  input: CheckoutSessionInput,
  fetchImpl: typeof fetch = fetch,
): Promise<CheckoutSessionResponse> {
  const response = await fetchImpl('/api/billing/checkout', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(await readJsonErrorMessage(response));
  }
  return (await response.json()) as CheckoutSessionResponse;
}

export async function createPortalSession(
  customerId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PortalSessionResponse> {
  const returnUrl =
    typeof window !== 'undefined' ? `${window.location.origin}/billing` : 'http://localhost:3000/billing';
  const response = await fetchImpl('/api/billing/portal', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ customerId, returnUrl }),
  });
  if (!response.ok) {
    throw new Error(await readJsonErrorMessage(response));
  }
  return (await response.json()) as PortalSessionResponse;
}
