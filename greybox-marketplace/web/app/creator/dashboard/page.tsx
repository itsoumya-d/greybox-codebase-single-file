// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { serverFetch } from '@/lib/server-api';
import { formatCurrencyCents, formatNumber } from '@/lib/format';
import { CreatorIdGate } from '@/components/CreatorIdGate';
import type { MarketplaceListing, MarketplaceStats } from '@/lib/marketplace-types';

export const dynamic = 'force-dynamic';

export default async function CreatorDashboardPage() {
  // Admin stats give the platform-wide rollup; the creator dashboard slices
  // it client-side by ID. Server-side prefetch the global numbers and the
  // creator's own listings; the gate component fills in the per-creator KPIs.
  const [statsRes, listingsRes] = await Promise.all([
    serverFetch<{ stats: MarketplaceStats }>('/v1/marketplace/stats', { admin: true }),
    serverFetch<{ listings: MarketplaceListing[] }>('/v1/marketplace/listings?status=published', { admin: true }),
  ]);

  const stats = statsRes.ok ? statsRes.body.stats : undefined;
  const listings = listingsRes.ok ? listingsRes.body.listings ?? [] : [];

  return (
    <div className="gb-page">
      <header style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28 }}>Creator dashboard</h1>
          <p className="gb-muted" style={{ marginTop: 4 }}>Sales, payouts, and review queue at a glance.</p>
        </div>
        <a href="/creator/listings/new" className="gb-button">
          + New listing
        </a>
      </header>

      <CreatorIdGate stats={stats} listings={listings} />
    </div>
  );
}
