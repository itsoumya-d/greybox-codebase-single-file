// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { serverFetch } from '@/lib/server-api';
import { CreatorListingsTable } from './CreatorListingsTable';
import type { MarketplaceListing } from '@/lib/marketplace-types';

export const dynamic = 'force-dynamic';

export default async function CreatorListingsPage() {
  const result = await serverFetch<{ listings: MarketplaceListing[] }>('/v1/marketplace/listings', { admin: true });
  const listings = result.ok ? result.body.listings ?? [] : [];
  return (
    <div className="gb-page">
      <header style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ margin: 0 }}>My listings</h1>
          <p className="gb-muted">All listings across draft, pending, published, and rejected statuses.</p>
        </div>
        <a href="/creator/listings/new" className="gb-button">+ New listing</a>
      </header>
      <CreatorListingsTable listings={listings} />
    </div>
  );
}
