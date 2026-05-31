// SPDX-License-Identifier: Apache-2.0

import type {
  MarketplaceListingCategory,
  MarketplaceListingsResponse,
  MarketplaceListingStatus,
  MarketplaceListingSummary,
  MarketplaceOrderSummary,
  MarketplacePurchaseRequest,
  MarketplacePurchaseResponse,
  MarketplaceStatsSummary,
  MarketplaceStatusResponse,
} from '@ai-game-design-studio/contracts/api/marketplace';

const MARKETPLACE_URL_ENV = 'AGDS_MARKETPLACE_URL';
const MARKETPLACE_TOKEN_ENV = 'AGDS_MARKETPLACE_TOKEN';
const MARKETPLACE_CHECKOUT_URL_ENV = 'AGDS_MARKETPLACE_CHECKOUT_URL';
const MARKETPLACE_CHECKOUT_SUCCESS_URL_ENV = 'AGDS_MARKETPLACE_CHECKOUT_SUCCESS_URL';
const MARKETPLACE_CHECKOUT_CANCEL_URL_ENV = 'AGDS_MARKETPLACE_CHECKOUT_CANCEL_URL';
const MARKETPLACE_TIMEOUT_MS = 2_500;

const LISTING_CATEGORIES = new Set<MarketplaceListingCategory>([
  'custom-art-bible',
  'custom-skill',
  'asset-pack',
  'template',
  'consulting-hour',
]);

const LISTING_STATUSES = new Set<MarketplaceListingStatus>([
  'draft',
  'pending-auto-review',
  'pending-human-review',
  'published',
  'rejected',
  'suspended',
]);

export interface MarketplaceProxyEnv {
  AGDS_MARKETPLACE_CHECKOUT_CANCEL_URL?: string;
  AGDS_MARKETPLACE_CHECKOUT_SUCCESS_URL?: string;
  AGDS_MARKETPLACE_CHECKOUT_URL?: string;
  AGDS_MARKETPLACE_URL?: string;
  AGDS_MARKETPLACE_TOKEN?: string;
}

export interface MarketplaceListingQuery {
  category?: MarketplaceListingCategory;
  status?: MarketplaceListingStatus;
}

function cleanEnvValue(value: string | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function resolveMarketplaceBaseUrl(env: MarketplaceProxyEnv = process.env): URL | null {
  const raw = cleanEnvValue(env[MARKETPLACE_URL_ENV]);
  if (!raw) return null;
  const url = new URL(raw);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`${MARKETPLACE_URL_ENV} must be an http(s) URL`);
  }
  url.pathname = url.pathname.replace(/\/+$/u, '');
  url.search = '';
  url.hash = '';
  return url;
}

function marketplaceHeaders(
  env: MarketplaceProxyEnv,
  extra: Record<string, string> = {},
): Record<string, string> {
  const token = cleanEnvValue(env[MARKETPLACE_TOKEN_ENV]);
  return {
    ...extra,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function marketplaceUrl(baseUrl: URL, pathname: string): string {
  const next = new URL(baseUrl.toString());
  const [pathPart = '', query = ''] = pathname.split('?', 2);
  next.pathname = `${next.pathname}/${pathPart.replace(/^\/+/u, '')}`.replace(/\/{2,}/gu, '/');
  next.search = query ? `?${query}` : '';
  return next.toString();
}

async function fetchJson<T>(
  baseUrl: URL,
  pathname: string,
  env: MarketplaceProxyEnv,
  init: {
    body?: string;
    headers?: Record<string, string>;
    method?: string;
  } = {},
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MARKETPLACE_TIMEOUT_MS);
  try {
    const requestInit: RequestInit = {
      headers: marketplaceHeaders(env, init.headers),
      signal: controller.signal,
    };
    if (init.body !== undefined) requestInit.body = init.body;
    if (init.method !== undefined) requestInit.method = init.method;
    const response = await fetch(marketplaceUrl(baseUrl, pathname), requestInit);
    if (!response.ok) {
      throw new Error(`marketplace ${response.status}`);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

function errorResponse(error: unknown): Pick<MarketplaceStatusResponse, 'status' | 'error'> {
  return {
    status: 'error',
    error: error instanceof Error ? error.message : String(error),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function sanitizeCheckoutUrl(value: unknown): string | undefined {
  const raw = stringValue(value);
  if (!raw) return undefined;
  const url = new URL(raw);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('marketplace checkout URL must be an http(s) URL');
  }
  url.hash = '';
  return url.toString();
}

function configuredMarketplaceCheckoutUrl(
  input: MarketplacePurchaseRequest,
  env: MarketplaceProxyEnv,
): string | undefined {
  const raw = cleanEnvValue(env[MARKETPLACE_CHECKOUT_URL_ENV]);
  if (!raw) return undefined;
  const url = new URL(raw);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`${MARKETPLACE_CHECKOUT_URL_ENV} must be an http(s) URL`);
  }
  url.hash = '';
  url.searchParams.set('buyerId', input.buyerId);
  url.searchParams.set('listingId', input.listingId);
  return url.toString();
}

function configuredMarketplaceCheckoutSessionUrls(
  env: MarketplaceProxyEnv,
): { successUrl: string; cancelUrl: string } | undefined {
  const successUrl = cleanEnvValue(env[MARKETPLACE_CHECKOUT_SUCCESS_URL_ENV]);
  const cancelUrl = cleanEnvValue(env[MARKETPLACE_CHECKOUT_CANCEL_URL_ENV]);
  if (!successUrl && !cancelUrl) return undefined;
  if (!successUrl || !cancelUrl) {
    throw new Error(
      `${MARKETPLACE_CHECKOUT_SUCCESS_URL_ENV} and ${MARKETPLACE_CHECKOUT_CANCEL_URL_ENV} must be configured together`,
    );
  }
  const sanitizedSuccessUrl = sanitizeCheckoutUrl(successUrl);
  const sanitizedCancelUrl = sanitizeCheckoutUrl(cancelUrl);
  if (!sanitizedSuccessUrl || !sanitizedCancelUrl) {
    throw new Error(
      `${MARKETPLACE_CHECKOUT_SUCCESS_URL_ENV} and ${MARKETPLACE_CHECKOUT_CANCEL_URL_ENV} must be http(s) URLs`,
    );
  }
  return {
    successUrl: sanitizedSuccessUrl,
    cancelUrl: sanitizedCancelUrl,
  };
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function sanitizeStats(value: unknown): MarketplaceStatsSummary | undefined {
  if (!isRecord(value)) return undefined;
  const stats = {
    gmvCents: numberValue(value.gmvCents),
    platformRevenueCents: numberValue(value.platformRevenueCents),
    creatorNetCents: numberValue(value.creatorNetCents),
    orders: numberValue(value.orders),
    activeCreatorsWithSales: numberValue(value.activeCreatorsWithSales),
    publishedListings: numberValue(value.publishedListings),
  };
  if (Object.values(stats).some((entry) => entry == null)) return undefined;
  return stats as MarketplaceStatsSummary;
}

function sanitizeListing(value: unknown): MarketplaceListingSummary | null {
  if (!isRecord(value)) return null;
  const category = stringValue(value.category);
  const status = stringValue(value.status);
  const currency = stringValue(value.currency);
  const priceCents = numberValue(value.priceCents);
  const createdAt = numberValue(value.createdAt);
  const updatedAt = numberValue(value.updatedAt);
  if (
    !category
    || !LISTING_CATEGORIES.has(category as MarketplaceListingCategory)
    || !status
    || !LISTING_STATUSES.has(status as MarketplaceListingStatus)
    || currency !== 'usd'
    || priceCents == null
    || createdAt == null
    || updatedAt == null
  ) {
    return null;
  }
  const id = stringValue(value.id);
  const creatorId = stringValue(value.creatorId);
  const title = stringValue(value.title);
  const description = stringValue(value.description);
  if (!id || !creatorId || !title || !description) return null;
  const tags = Array.isArray(value.tags)
    ? value.tags.flatMap((tag) => {
      const next = stringValue(tag);
      return next ? [next] : [];
    })
    : [];
  const publishedAt = numberValue(value.publishedAt);
  return {
    id,
    creatorId,
    title,
    description,
    category: category as MarketplaceListingCategory,
    priceCents,
    currency: 'usd',
    tags,
    status: status as MarketplaceListingStatus,
    createdAt,
    updatedAt,
    ...(publishedAt == null ? {} : { publishedAt }),
  };
}

function sanitizeOrder(value: unknown): MarketplaceOrderSummary | null {
  if (!isRecord(value)) return null;
  const id = stringValue(value.id);
  const buyerId = stringValue(value.buyerId);
  const creatorId = stringValue(value.creatorId);
  const listingId = stringValue(value.listingId);
  const currency = stringValue(value.currency);
  const grossCents = numberValue(value.grossCents);
  const platformFeeCents = numberValue(value.platformFeeCents);
  const creatorNetCents = numberValue(value.creatorNetCents);
  const createdAt = numberValue(value.createdAt);
  if (
    !id
    || !buyerId
    || !creatorId
    || !listingId
    || currency !== 'usd'
    || grossCents == null
    || platformFeeCents == null
    || creatorNetCents == null
    || createdAt == null
  ) {
    return null;
  }
  const payoutId = stringValue(value.payoutId);
  const taxRecordId = stringValue(value.taxRecordId);
  return {
    id,
    buyerId,
    creatorId,
    listingId,
    grossCents,
    platformFeeCents,
    creatorNetCents,
    currency: 'usd',
    createdAt,
    ...(payoutId ? { payoutId } : {}),
    ...(taxRecordId ? { taxRecordId } : {}),
  };
}

function sanitizeCheckoutSession(value: unknown): { id?: string; url: string } | null {
  if (!isRecord(value)) return null;
  const url = sanitizeCheckoutUrl(value.url);
  if (!url) return null;
  const id = stringValue(value.id) ?? undefined;
  return {
    ...(id ? { id } : {}),
    url,
  };
}

export function parseMarketplaceListingQuery(input: {
  category?: unknown;
  status?: unknown;
}): MarketplaceListingQuery {
  const category = stringValue(input.category);
  const status = stringValue(input.status);
  if (category && !LISTING_CATEGORIES.has(category as MarketplaceListingCategory)) {
    throw new Error('unsupported marketplace category');
  }
  if (status && !LISTING_STATUSES.has(status as MarketplaceListingStatus)) {
    throw new Error('unsupported marketplace status');
  }
  return {
    ...(category ? { category: category as MarketplaceListingCategory } : {}),
    ...(status ? { status: status as MarketplaceListingStatus } : {}),
  };
}

export function parseMarketplacePurchaseRequest(input: unknown): MarketplacePurchaseRequest {
  if (!isRecord(input)) throw new Error('marketplace purchase body must be an object');
  const listingId = stringValue(input.listingId);
  const buyerId = stringValue(input.buyerId);
  if (!listingId) throw new Error('listingId is required');
  if (!buyerId) throw new Error('buyerId is required');
  return { listingId, buyerId };
}

export async function readMarketplaceStatus(
  env: MarketplaceProxyEnv = process.env,
): Promise<MarketplaceStatusResponse> {
  let baseUrl: URL | null = null;
  try {
    baseUrl = resolveMarketplaceBaseUrl(env);
  } catch (error) {
    return { configured: true, ...errorResponse(error) };
  }
  if (!baseUrl) {
    return { configured: false, status: 'unconfigured' };
  }

  try {
    const [health, stats] = await Promise.all([
      fetchJson<{ service?: unknown }>(baseUrl, '/health', env),
      fetchJson<{ stats?: unknown }>(baseUrl, '/v1/marketplace/stats', env),
    ]);
    const service = stringValue(health.service);
    const sanitizedStats = sanitizeStats(stats.stats);
    return {
      configured: true,
      status: 'online',
      ...(service ? { service } : {}),
      ...(sanitizedStats ? { stats: sanitizedStats } : {}),
    };
  } catch (error) {
    return { configured: true, ...errorResponse(error) };
  }
}

export async function listMarketplaceListings(
  query: MarketplaceListingQuery = {},
  env: MarketplaceProxyEnv = process.env,
): Promise<MarketplaceListingsResponse> {
  let baseUrl: URL | null = null;
  try {
    baseUrl = resolveMarketplaceBaseUrl(env);
  } catch (error) {
    return { configured: true, listings: [], ...errorResponse(error) };
  }
  if (!baseUrl) {
    return { configured: false, status: 'unconfigured', listings: [] };
  }

  const params = new URLSearchParams();
  if (query.status) params.set('status', query.status);
  if (query.category) params.set('category', query.category);
  const suffix = params.toString() ? `?${params.toString()}` : '';
  try {
    const body = await fetchJson<{ listings?: unknown }>(
      baseUrl,
      `/v1/marketplace/listings${suffix}`,
      env,
    );
    const listings = Array.isArray(body.listings)
      ? body.listings.flatMap((listing) => {
        const sanitized = sanitizeListing(listing);
        return sanitized ? [sanitized] : [];
      })
      : [];
    return {
      configured: true,
      status: 'online',
      listings,
    };
  } catch (error) {
    return { configured: true, listings: [], ...errorResponse(error) };
  }
}

export async function purchaseMarketplaceListing(
  input: MarketplacePurchaseRequest,
  env: MarketplaceProxyEnv = process.env,
): Promise<MarketplacePurchaseResponse> {
  let baseUrl: URL | null = null;
  try {
    baseUrl = resolveMarketplaceBaseUrl(env);
  } catch (error) {
    return { configured: true, ...errorResponse(error) };
  }
  if (!baseUrl) {
    return {
      configured: false,
      status: 'unconfigured',
      error: 'marketplace service is not configured',
    };
  }
  let fallbackCheckoutUrl: string | undefined;
  let checkoutSessionUrls: { successUrl: string; cancelUrl: string } | undefined;
  try {
    fallbackCheckoutUrl = configuredMarketplaceCheckoutUrl(input, env);
    checkoutSessionUrls = configuredMarketplaceCheckoutSessionUrls(env);
  } catch (error) {
    return { configured: true, ...errorResponse(error) };
  }
  if (!cleanEnvValue(env[MARKETPLACE_TOKEN_ENV])) {
    if (fallbackCheckoutUrl) {
      return {
        configured: true,
        status: 'online',
        checkoutUrl: fallbackCheckoutUrl,
        nextAction: 'checkout',
      };
    }
    return {
      configured: true,
      status: 'error',
      error: `${MARKETPLACE_TOKEN_ENV} is required for marketplace purchases`,
    };
  }

  try {
    if (checkoutSessionUrls) {
      const body = await fetchJson<{ checkout?: unknown }>(
        baseUrl,
        '/v1/marketplace/checkout/sessions',
        env,
        {
          body: JSON.stringify({
            ...input,
            ...checkoutSessionUrls,
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        },
      );
      const checkout = sanitizeCheckoutSession(body.checkout);
      if (!checkout) throw new Error('marketplace checkout session response was invalid');
      return {
        configured: true,
        status: 'online',
        ...(checkout.id ? { checkoutSessionId: checkout.id } : {}),
        checkoutUrl: checkout.url,
        nextAction: 'checkout',
      };
    }
    const body = await fetchJson<{ order?: unknown }>(
      baseUrl,
      '/v1/marketplace/orders',
      env,
      {
        body: JSON.stringify(input),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      },
    );
    const order = sanitizeOrder(body.order);
    const upstreamCheckoutUrl = sanitizeCheckoutUrl((body as { checkoutUrl?: unknown }).checkoutUrl);
    const checkoutUrl = upstreamCheckoutUrl ?? fallbackCheckoutUrl;
    if (!order && !checkoutUrl) throw new Error('marketplace order response was invalid');
    return {
      configured: true,
      status: 'online',
      ...(order ? { order } : {}),
      ...(checkoutUrl ? { checkoutUrl } : {}),
      nextAction: checkoutUrl ? 'checkout' : 'order-created',
    };
  } catch (error) {
    return { configured: true, ...errorResponse(error) };
  }
}
