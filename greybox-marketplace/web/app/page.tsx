// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { Suspense } from 'react';
import { fetchPublicCatalog } from '@/lib/server-api';
import type { ListingCategory } from '@/lib/marketplace-types';
import { ListingCard } from '@/components/ListingCard';
import { CatalogFilters } from '@/components/CatalogFilters';

interface PageProps {
  searchParams: Promise<{ q?: string; category?: string; tag?: string; offset?: string }>;
}

const VALID_CATEGORIES: ListingCategory[] = [
  'template',
  'asset-pack',
  'custom-skill',
  'custom-art-bible',
  'pro-module',
  'consulting-hour',
];

export const dynamic = 'force-dynamic';

export default async function CatalogPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const query = params.q?.trim();
  const category = params.category && VALID_CATEGORIES.includes(params.category as ListingCategory)
    ? (params.category as ListingCategory)
    : undefined;
  const tag = params.tag?.trim() || undefined;
  const offset = params.offset ? Math.max(0, parseInt(params.offset, 10) || 0) : 0;

  const catalog = await fetchPublicCatalog({
    query: query || undefined,
    category,
    tag,
    limit: 24,
    offset,
  });

  return (
    <div className="gb-page">
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 32 }}>Greybox Marketplace</h1>
        <p className="gb-muted" style={{ marginTop: 4 }}>
          Templates, art bibles, asset packs, skills, and pro modules from independent game design teams.
        </p>
      </header>

      <Suspense>
        <CatalogFilters
          initialQuery={query ?? ''}
          initialCategory={category}
          initialTag={tag}
          tagFacets={catalog?.facets.tags ?? []}
        />
      </Suspense>

      {!catalog && (
        <div className="gb-error">
          Could not reach the marketplace API. Set <code>MARKETPLACE_API_URL</code> and try again.
        </div>
      )}

      {catalog && catalog.listings.length === 0 && (
        <div className="gb-card" data-testid="catalog-empty">
          <p style={{ margin: 0 }}>No listings match those filters yet.</p>
        </div>
      )}

      {catalog && catalog.listings.length > 0 && (
        <>
          <p className="gb-muted" style={{ marginBottom: 16 }} data-testid="catalog-count">
            Showing {catalog.listings.length} of {catalog.total} listings
          </p>
          <div className="gb-grid gb-grid-cards" data-testid="catalog-grid">
            {catalog.listings.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
