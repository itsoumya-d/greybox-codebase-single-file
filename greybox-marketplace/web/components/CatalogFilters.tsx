// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import type { ListingCategory, MarketplaceCatalogFacet } from '@/lib/marketplace-types';

const CATEGORIES: { value: ListingCategory; label: string }[] = [
  { value: 'template', label: 'Templates' },
  { value: 'asset-pack', label: 'Asset packs' },
  { value: 'custom-skill', label: 'Skills' },
  { value: 'custom-art-bible', label: 'Art bibles' },
  { value: 'pro-module', label: 'Pro modules' },
  { value: 'consulting-hour', label: 'Consulting' },
];

interface CatalogFiltersProps {
  initialQuery?: string;
  initialCategory?: ListingCategory;
  initialTag?: string;
  tagFacets: MarketplaceCatalogFacet[];
}

export function CatalogFilters({ initialQuery = '', initialCategory, initialTag, tagFacets }: CatalogFiltersProps) {
  const router = useRouter();
  const params = useSearchParams();
  const [query, setQuery] = useState(initialQuery);

  function push(updates: Record<string, string | undefined>): void {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === undefined || value === '') next.delete(key);
      else next.set(key, value);
    }
    const qs = next.toString();
    router.push(qs ? `/?${qs}` : '/');
  }

  return (
    <div className="gb-col" style={{ marginBottom: 24 }}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          push({ q: query || undefined });
        }}
      >
        <input
          type="search"
          placeholder="Search listings..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search listings"
          data-testid="catalog-search"
        />
      </form>
      <div className="gb-filters" role="group" aria-label="Filter by category">
        <button
          type="button"
          className={`gb-chip ${!initialCategory ? 'gb-chip-active' : ''}`}
          onClick={() => push({ category: undefined })}
        >
          All
        </button>
        {CATEGORIES.map((c) => (
          <button
            type="button"
            key={c.value}
            className={`gb-chip ${initialCategory === c.value ? 'gb-chip-active' : ''}`}
            onClick={() => push({ category: c.value })}
            data-testid={`category-chip-${c.value}`}
          >
            {c.label}
          </button>
        ))}
      </div>
      {tagFacets.length > 0 && (
        <div className="gb-filters" role="group" aria-label="Filter by tag">
          {tagFacets.slice(0, 10).map((tag) => (
            <button
              type="button"
              key={tag.value}
              className={`gb-chip ${initialTag === tag.value ? 'gb-chip-active' : ''}`}
              onClick={() => push({ tag: initialTag === tag.value ? undefined : tag.value })}
            >
              #{tag.value} <span style={{ opacity: 0.6, marginLeft: 4 }}>{tag.count}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
