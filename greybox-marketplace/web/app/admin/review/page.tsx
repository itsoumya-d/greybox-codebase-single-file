// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { serverFetch } from '@/lib/server-api';
import { AdminReviewQueue } from './AdminReviewQueue';
import type { MarketplaceReviewDashboard, MarketplaceListing } from '@/lib/marketplace-types';

export const dynamic = 'force-dynamic';

export default async function AdminReviewPage() {
  const [dashboardRes, listingsRes] = await Promise.all([
    serverFetch<{ dashboard: MarketplaceReviewDashboard }>('/v1/marketplace/review-dashboard?limit=50', { admin: true }),
    serverFetch<{ listings: MarketplaceListing[] }>('/v1/marketplace/listings', { admin: true }),
  ]);

  const dashboard = dashboardRes.ok ? dashboardRes.body.dashboard : undefined;
  const listings = listingsRes.ok ? listingsRes.body.listings ?? [] : [];

  return (
    <div className="gb-page">
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>Review queue</h1>
        <p className="gb-muted">Pending listings awaiting approval, rejection, or change requests.</p>
      </header>
      <AdminReviewQueue dashboard={dashboard} listings={listings} />
    </div>
  );
}
