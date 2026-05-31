// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import Link from 'next/link';
import type { MarketplaceCatalogListing } from '@/lib/marketplace-types';
import { formatCurrencyCents } from '@/lib/format';

export function ListingCard({ listing }: { listing: MarketplaceCatalogListing }) {
  return (
    <Link
      href={`/listings/${encodeURIComponent(listing.id)}`}
      className="gb-listing-card"
      style={{ color: 'inherit', textDecoration: 'none' }}
      data-testid="listing-card"
      data-listing-id={listing.id}
    >
      <div
        aria-hidden
        style={{
          height: 140,
          background: `linear-gradient(135deg, #2c3556 0%, #3b4882 100%)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 24,
          fontWeight: 700,
          color: 'rgba(255,255,255,0.9)',
        }}
      >
        {categoryLabel(listing.category)}
      </div>
      <div className="gb-listing-card-body">
        <div className="gb-listing-card-title">{listing.title}</div>
        <div className="gb-listing-card-creator">by {listing.creator.displayName}</div>
        <div className="gb-row" style={{ gap: 8 }}>
          <span className="gb-badge">{listing.category}</span>
          {listing.salesCount > 0 && (
            <span className="gb-badge gb-badge-accent">{listing.salesCount} sales</span>
          )}
        </div>
        <div className="gb-listing-card-price">{formatCurrencyCents(listing.priceCents, listing.currency)}</div>
      </div>
    </Link>
  );
}

function categoryLabel(category: MarketplaceCatalogListing['category']): string {
  switch (category) {
    case 'asset-pack':
      return 'Asset pack';
    case 'template':
      return 'Template';
    case 'custom-art-bible':
      return 'Art bible';
    case 'custom-skill':
      return 'Skill';
    case 'pro-module':
      return 'Pro module';
    case 'consulting-hour':
      return 'Consulting';
    default:
      return category;
  }
}
