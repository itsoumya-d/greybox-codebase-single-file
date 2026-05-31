// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

/**
 * Typed fetch wrapper around the marketplace API. Client components hit the
 * Next.js proxy at `/api/proxy/...` so the admin bearer token never lands in
 * the browser; only the proxy injects it from `MARKETPLACE_API_URL` +
 * `GREYBOX_MARKETPLACE_ADMIN_TOKEN` server-side.
 *
 * Shapes match `greybox-marketplace/src/types.ts` exactly. Mismatches here are
 * a contract bug and should be fixed in this file (never the backend) until
 * the @greybox/schema package lands.
 */

import type {
  Creator,
  CreatorPayoutReadinessSafe,
  CreatorTaxProfileRecordInput,
  CreatorTaxProfileRecordResult,
  ListingCategory,
  ListingDraft,
  ListingReview,
  ListingStatus,
  MarketplaceCatalogSearchResult,
  MarketplaceCheckoutPlan,
  MarketplaceCheckoutSessionResponse,
  MarketplaceCreatorStorefront,
  MarketplaceListing,
  MarketplaceReviewDashboard,
  MarketplaceStats,
  StripeConnectAccountStatusRecordInput,
  StripeConnectAccountStatusRecordResult,
  StripeConnectOnboardingLinkResult,
} from './marketplace-types';

export interface ApiError {
  code: string;
  message: string;
  status: number;
}

export interface ApiResult<T> {
  ok: boolean;
  status: number;
  body: T;
}

const PROXY_BASE = '/api/proxy';

function apiHeaders(extra: Record<string, string> = {}): HeadersInit {
  return {
    'Content-Type': 'application/json',
    ...extra,
  };
}

async function readBody<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (text.length === 0) return undefined as unknown as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

async function request<T>(
  method: 'GET' | 'POST',
  path: string,
  init: { body?: unknown; headers?: Record<string, string>; signal?: AbortSignal } = {},
): Promise<ApiResult<T>> {
  const url = `${PROXY_BASE}${path.startsWith('/') ? path : `/${path}`}`;
  const fetchInit: RequestInit = {
    method,
    headers: apiHeaders(init.headers),
  };
  if (init.body !== undefined) fetchInit.body = JSON.stringify(init.body);
  if (init.signal) fetchInit.signal = init.signal;
  const res = await fetch(url, fetchInit);
  const body = await readBody<T>(res);
  return { ok: res.ok, status: res.status, body };
}

export const api = {
  // ----- Public (no admin) ----------------------------------------------
  catalog(params: {
    query?: string;
    category?: ListingCategory;
    tag?: string;
    creatorId?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<ApiResult<{ catalog: MarketplaceCatalogSearchResult }>> {
    const search = new URLSearchParams();
    if (params.query) search.set('q', params.query);
    if (params.category) search.set('category', params.category);
    if (params.tag) search.set('tag', params.tag);
    if (params.creatorId) search.set('creatorId', params.creatorId);
    if (params.limit !== undefined) search.set('limit', String(params.limit));
    if (params.offset !== undefined) search.set('offset', String(params.offset));
    const suffix = search.size > 0 ? `?${search.toString()}` : '';
    return request('GET', `/v1/marketplace/catalog${suffix}`);
  },

  creatorStorefront(creatorId: string): Promise<ApiResult<{ storefront: MarketplaceCreatorStorefront }>> {
    return request('GET', `/v1/marketplace/creators/${encodeURIComponent(creatorId)}/storefront`);
  },

  publishedListings(): Promise<ApiResult<{ listings: MarketplaceListing[] }>> {
    return request('GET', '/v1/marketplace/listings?status=published');
  },

  // ----- Admin / creator (proxy adds bearer token) ----------------------
  stats(): Promise<ApiResult<{ stats: MarketplaceStats }>> {
    return request('GET', '/v1/marketplace/stats');
  },

  payoutReadiness(creatorId: string): Promise<ApiResult<{ readiness: CreatorPayoutReadinessSafe }>> {
    return request('GET', `/v1/marketplace/creators/${encodeURIComponent(creatorId)}/payout-readiness`);
  },

  upsertCreator(creator: Creator): Promise<ApiResult<{ creator: Creator }>> {
    return request('POST', '/v1/marketplace/creators', { body: creator });
  },

  stripeConnectOnboardingLink(
    creatorId: string,
    input: { returnUrl: string; refreshUrl: string },
  ): Promise<ApiResult<{ result: StripeConnectOnboardingLinkResult }>> {
    return request('POST', `/v1/marketplace/creators/${encodeURIComponent(creatorId)}/stripe-connect/onboarding-link`, {
      body: input,
    });
  },

  stripeConnectAccountStatus(
    creatorId: string,
    input: StripeConnectAccountStatusRecordInput,
  ): Promise<ApiResult<{ result: StripeConnectAccountStatusRecordResult }>> {
    return request('POST', `/v1/marketplace/creators/${encodeURIComponent(creatorId)}/stripe-connect/account-status`, {
      body: input,
    });
  },

  taxProfile(
    creatorId: string,
    input: CreatorTaxProfileRecordInput,
  ): Promise<ApiResult<{ result: CreatorTaxProfileRecordResult }>> {
    return request('POST', `/v1/marketplace/creators/${encodeURIComponent(creatorId)}/tax-profile`, {
      body: input,
    });
  },

  listings(filters: { status?: ListingStatus; category?: ListingCategory } = {}): Promise<ApiResult<{ listings: MarketplaceListing[] }>> {
    const search = new URLSearchParams();
    if (filters.status) search.set('status', filters.status);
    if (filters.category) search.set('category', filters.category);
    const suffix = search.size > 0 ? `?${search.toString()}` : '';
    return request('GET', `/v1/marketplace/listings${suffix}`);
  },

  submitListing(draft: ListingDraft): Promise<ApiResult<{ listing: MarketplaceListing; review: ListingReview }>> {
    return request('POST', '/v1/marketplace/listings', { body: draft });
  },

  checkoutSession(input: {
    listingId: string;
    buyerId: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<ApiResult<MarketplaceCheckoutSessionResponse>> {
    return request('POST', '/v1/marketplace/checkout/sessions', { body: input });
  },

  checkoutSessionPlan(input: {
    listingId: string;
    buyerId: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<ApiResult<{ plan: MarketplaceCheckoutPlan }>> {
    return request('POST', '/v1/marketplace/checkout/session-plan', { body: input });
  },

  reviewDashboard(limit?: number): Promise<ApiResult<{ dashboard: MarketplaceReviewDashboard }>> {
    const suffix = limit !== undefined ? `?limit=${limit}` : '';
    return request('GET', `/v1/marketplace/review-dashboard${suffix}`);
  },

  approveReview(reviewId: string, reviewerId: string): Promise<ApiResult<{ listing: MarketplaceListing }>> {
    return request('POST', `/v1/marketplace/reviews/${encodeURIComponent(reviewId)}/approve`, {
      body: { reviewerId },
    });
  },
};

export type Api = typeof api;
