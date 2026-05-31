// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

/**
 * Server-side fetch helper used by Server Components and the proxy route.
 *
 * Reads `MARKETPLACE_API_URL` (default `http://127.0.0.1:8181`, matching
 * `greybox-marketplace/.env.example` PORT=8181) and `GREYBOX_MARKETPLACE_ADMIN_TOKEN`
 * to talk to the marketplace API directly. Never imported from a "use client"
 * module.
 */

import type { ListingCategory, MarketplaceCatalogSearchResult, MarketplaceCreatorStorefront } from './marketplace-types';

export interface ServerApiConfig {
  baseUrl: string;
  adminToken?: string;
}

export function readServerApiConfig(): ServerApiConfig {
  const baseUrl = (process.env.MARKETPLACE_API_URL ?? 'http://127.0.0.1:8181').replace(/\/$/u, '');
  const adminToken = process.env.GREYBOX_MARKETPLACE_ADMIN_TOKEN;
  return adminToken ? { baseUrl, adminToken } : { baseUrl };
}

export interface ServerFetchOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  admin?: boolean;
  signal?: AbortSignal;
  cache?: RequestCache;
  revalidate?: number;
}

export async function serverFetch<T>(
  path: string,
  options: ServerFetchOptions = {},
): Promise<{ ok: boolean; status: number; body: T }> {
  const config = readServerApiConfig();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.admin && config.adminToken) {
    headers.Authorization = `Bearer ${config.adminToken}`;
  }
  const init: RequestInit & { next?: { revalidate?: number } } = {
    method: options.method ?? 'GET',
    headers,
  };
  if (options.body !== undefined) init.body = JSON.stringify(options.body);
  if (options.signal) init.signal = options.signal;
  if (options.cache) init.cache = options.cache;
  if (options.revalidate !== undefined) init.next = { revalidate: options.revalidate };
  const url = `${config.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  try {
    const res = await fetch(url, init);
    const text = await res.text();
    let body: unknown;
    try {
      body = text.length > 0 ? JSON.parse(text) : undefined;
    } catch {
      body = text;
    }
    return { ok: res.ok, status: res.status, body: body as T };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      body: { error: { code: 'UPSTREAM_UNREACHABLE', message: err instanceof Error ? err.message : 'unreachable' } } as T,
    };
  }
}

/**
 * Public catalog: never sent the admin token; safe for SSR.
 */
export async function fetchPublicCatalog(params: {
  query?: string;
  category?: ListingCategory;
  tag?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<MarketplaceCatalogSearchResult | undefined> {
  const search = new URLSearchParams();
  if (params.query) search.set('q', params.query);
  if (params.category) search.set('category', params.category);
  if (params.tag) search.set('tag', params.tag);
  if (params.limit !== undefined) search.set('limit', String(params.limit));
  if (params.offset !== undefined) search.set('offset', String(params.offset));
  const suffix = search.size > 0 ? `?${search.toString()}` : '';
  const result = await serverFetch<{ catalog?: MarketplaceCatalogSearchResult }>(`/v1/marketplace/catalog${suffix}`, {
    revalidate: 30,
  });
  return result.ok ? result.body.catalog : undefined;
}

export async function fetchCreatorStorefront(creatorId: string): Promise<MarketplaceCreatorStorefront | undefined> {
  const result = await serverFetch<{ storefront?: MarketplaceCreatorStorefront }>(
    `/v1/marketplace/creators/${encodeURIComponent(creatorId)}/storefront`,
    { revalidate: 30 },
  );
  return result.ok ? result.body.storefront : undefined;
}
