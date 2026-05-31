// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

/**
 * Policy: which marketplace paths are safe to expose to anonymous browsers.
 *
 * The proxy never sends the admin bearer token on any path that returns
 * `true` here, so the underlying marketplace can stay strict (any unknown
 * mutation returns 401). Public reads:
 *
 *   - GET /health, /healthz, /readyz
 *   - GET /v1/marketplace/catalog (storefront search)
 *   - GET /v1/marketplace/listings?status=published (also covered by catalog,
 *         but a stable filter is convenient for SSR)
 *   - GET /v1/marketplace/creators/:id/storefront
 */

const PUBLIC_EXACT = new Set<string>([
  '/health',
  '/healthz',
  '/readyz',
  '/v1/marketplace/catalog',
]);

export function isPublicPath(pathname: string, search: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  if (pathname.startsWith('/v1/marketplace/catalog')) return true;
  if (pathname.startsWith('/v1/marketplace/creators/') && pathname.endsWith('/storefront')) return true;
  if (pathname === '/v1/marketplace/listings') {
    const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
    return params.get('status') === 'published';
  }
  return false;
}
