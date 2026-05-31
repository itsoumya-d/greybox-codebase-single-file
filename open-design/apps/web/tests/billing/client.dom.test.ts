// SPDX-License-Identifier: Apache-2.0
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  billingReturnUrls,
  createCheckoutSession,
  createPortalSession,
  fetchBillingGeo,
  fetchBillingMe,
  resolveProvider,
  type CheckoutSessionResponse,
} from '../../src/billing/client';
import { BILLING_PLANS, planPriceLabel, uiTierToCloudTier } from '../../src/billing/plans';

interface FakeFetchCall {
  url: string;
  init?: RequestInit;
}

function fakeFetch(
  responder: (url: string, init?: RequestInit) => {
    status?: number;
    ok?: boolean;
    body?: unknown;
  },
): { calls: FakeFetchCall[]; fetch: typeof fetch } {
  const calls: FakeFetchCall[] = [];
  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    calls.push({ url, init });
    const response = responder(url, init);
    const status = response.status ?? 200;
    const ok = response.ok ?? (status >= 200 && status < 300);
    const text = JSON.stringify(response.body ?? {});
    return {
      ok,
      status,
      json: async () => JSON.parse(text),
      text: async () => text,
    } as Response;
  }) as typeof fetch;
  return { calls, fetch: fn };
}

beforeEach(() => {
  // Ensure window.location.origin is stable when constructing return URLs.
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: new URL('http://localhost:3000/billing'),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('billing plans', () => {
  it('exposes the canonical Free / Pro / Studio / Enterprise list', () => {
    expect(BILLING_PLANS.map((plan) => plan.id)).toEqual([
      'free',
      'indie',
      'studio',
      'enterprise',
    ]);
    expect(BILLING_PLANS.find((plan) => plan.id === 'indie')?.priceLabel).toBe('$19/mo');
    expect(BILLING_PLANS.find((plan) => plan.id === 'studio')?.priceLabel).toBe('$49/mo');
    expect(BILLING_PLANS.find((plan) => plan.id === 'enterprise')?.priceLabel).toBe('Custom');
  });

  it('maps the UI tier id to the cloud tier the daemon expects', () => {
    expect(uiTierToCloudTier('indie')).toBe('indie');
    expect(uiTierToCloudTier('studio')).toBe('studio');
    expect(uiTierToCloudTier('free')).toBeNull();
    expect(uiTierToCloudTier('enterprise')).toBeNull();
  });
});

describe('billingReturnUrls', () => {
  it('builds success/cancel URLs anchored to the current origin', () => {
    const result = billingReturnUrls();
    expect(result.successUrl).toBe('http://localhost:3000/billing/success?session_id={CHECKOUT_SESSION_ID}');
    expect(result.cancelUrl).toBe('http://localhost:3000/billing/cancel');
  });
});

describe('createCheckoutSession', () => {
  it('POSTs the request body to /api/billing/checkout and returns the cloud url', async () => {
    const { calls, fetch: fetchImpl } = fakeFetch(() => ({
      body: { url: 'https://checkout.stripe.com/c/pay/cs_test_x', id: 'cs_test_x' },
    }));
    const result = (await createCheckoutSession(
      {
        tier: 'studio',
        successUrl: 'http://localhost:3000/billing/success',
        cancelUrl: 'http://localhost:3000/billing/cancel',
      },
      fetchImpl,
    )) as CheckoutSessionResponse;
    expect(result.url).toBe('https://checkout.stripe.com/c/pay/cs_test_x');
    expect(calls).toHaveLength(1);
    const call = calls[0];
    if (!call) throw new Error('expected a fetch call');
    expect(call.url).toBe('/api/billing/checkout');
    expect(call.init?.method).toBe('POST');
    expect(JSON.parse(String(call.init?.body))).toMatchObject({
      tier: 'studio',
      successUrl: 'http://localhost:3000/billing/success',
      cancelUrl: 'http://localhost:3000/billing/cancel',
    });
  });

  it('throws when the daemon returns a non-2xx with a structured error', async () => {
    const { fetch: fetchImpl } = fakeFetch(() => ({
      status: 503,
      ok: false,
      body: { error: { code: 'STRIPE_PRICE_NOT_CONFIGURED', message: 'price missing' } },
    }));
    await expect(
      createCheckoutSession(
        {
          tier: 'studio',
          successUrl: 'http://localhost:3000/billing/success',
          cancelUrl: 'http://localhost:3000/billing/cancel',
        },
        fetchImpl,
      ),
    ).rejects.toThrow(/price missing/u);
  });
});

describe('createPortalSession', () => {
  it('POSTs the customer id and absolute return url', async () => {
    const { calls, fetch: fetchImpl } = fakeFetch(() => ({
      body: { url: 'https://billing.stripe.com/p/session/test_bps', id: 'bps_test_bps' },
    }));
    const result = await createPortalSession('cus_test_bps', fetchImpl);
    expect(result.url).toBe('https://billing.stripe.com/p/session/test_bps');
    expect(calls[0]?.url).toBe('/api/billing/portal');
    expect(JSON.parse(String(calls[0]?.init?.body))).toMatchObject({
      customerId: 'cus_test_bps',
      returnUrl: 'http://localhost:3000/billing',
    });
  });
});

describe('fetchBillingMe', () => {
  it('returns the cloud subscription snapshot', async () => {
    const { fetch: fetchImpl } = fakeFetch(() => ({
      body: {
        configured: true,
        status: 'ok',
        tier: 'studio',
        customerId: 'cus_test_bps',
        portalAvailable: true,
      },
    }));
    const result = await fetchBillingMe(fetchImpl);
    expect(result).toMatchObject({
      configured: true,
      status: 'ok',
      tier: 'studio',
      portalAvailable: true,
    });
  });

  it('surfaces an error result when the proxy responds with a non-2xx', async () => {
    const { fetch: fetchImpl } = fakeFetch(() => ({
      status: 500,
      ok: false,
      body: { error: 'upstream-error' },
    }));
    const result = await fetchBillingMe(fetchImpl);
    expect(result).toMatchObject({ configured: true, status: 'error' });
  });
});

describe('fetchBillingGeo', () => {
  it('returns the country from a valid geo response', async () => {
    const { fetch: fetchImpl } = fakeFetch(() => ({
      body: { country: 'IN' },
    }));
    const result = await fetchBillingGeo(fetchImpl);
    expect(result).toEqual({ country: 'IN' });
  });

  it('returns US when the response is non-ok (status 500)', async () => {
    const { fetch: fetchImpl } = fakeFetch(() => ({
      status: 500,
      ok: false,
      body: { error: 'internal error' },
    }));
    const result = await fetchBillingGeo(fetchImpl);
    expect(result).toEqual({ country: 'US' });
  });

  it('returns US when fetch throws', async () => {
    const throwingFetch = (async () => {
      throw new Error('network failure');
    }) as typeof fetch;
    const result = await fetchBillingGeo(throwingFetch);
    expect(result).toEqual({ country: 'US' });
  });

  it('returns US when response JSON has an invalid country field (non-2-letter string)', async () => {
    const { fetch: fetchImpl } = fakeFetch(() => ({
      body: { country: 'INVALID' },
    }));
    const result = await fetchBillingGeo(fetchImpl);
    expect(result).toEqual({ country: 'US' });
  });

  it('returns US when response JSON country field is a number', async () => {
    const { fetch: fetchImpl } = fakeFetch(() => ({
      body: { country: 42 },
    }));
    const result = await fetchBillingGeo(fetchImpl);
    expect(result).toEqual({ country: 'US' });
  });
});

describe('resolveProvider', () => {
  it('returns razorpay for India (IN)', () => {
    expect(resolveProvider('IN', 'indie')).toBe('razorpay');
  });

  it('returns razorpay for lowercase India country code', () => {
    expect(resolveProvider('in', 'studio')).toBe('razorpay');
  });

  it('returns dodo for US', () => {
    expect(resolveProvider('US', 'indie')).toBe('dodo');
  });

  it('returns dodo for other international countries', () => {
    expect(resolveProvider('DE', 'studio')).toBe('dodo');
  });

  it('returns stripe for enterprise regardless of India country', () => {
    expect(resolveProvider('IN', 'enterprise')).toBe('stripe');
  });

  it('returns stripe for enterprise regardless of US country', () => {
    expect(resolveProvider('US', 'enterprise')).toBe('stripe');
  });
});

describe('planPriceLabel', () => {
  const indiePlan = BILLING_PLANS.find((p) => p.id === 'indie');
  const studioPlan = BILLING_PLANS.find((p) => p.id === 'studio');
  const freePlan = BILLING_PLANS.find((p) => p.id === 'free');

  it('returns the INR label for indie plan when country is IN', () => {
    if (!indiePlan) throw new Error('indie plan not found');
    expect(planPriceLabel(indiePlan, 'IN')).toBe('₹1,999/mo');
  });

  it('returns the INR label for studio plan when country is IN', () => {
    if (!studioPlan) throw new Error('studio plan not found');
    expect(planPriceLabel(studioPlan, 'IN')).toBe('₹4,999/mo');
  });

  it('returns the USD label for indie plan when country is US', () => {
    if (!indiePlan) throw new Error('indie plan not found');
    expect(planPriceLabel(indiePlan, 'US')).toBe('$19/mo');
  });

  it('returns the default USD label for free plan even when country is IN', () => {
    if (!freePlan) throw new Error('free plan not found');
    expect(planPriceLabel(freePlan, 'IN')).toBe('$0');
  });
});
