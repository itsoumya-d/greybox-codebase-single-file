// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { notFound } from 'next/navigation';
import { serverFetch } from '@/lib/server-api';
import { formatCurrencyCents, formatTimestamp } from '@/lib/format';
import { BuyButton } from '@/components/BuyButton';
import type { MarketplaceListing } from '@/lib/marketplace-types';

interface PageProps {
  params: Promise<{ id: string }>;
}

export const dynamic = 'force-dynamic';

export default async function ListingDetailPage({ params }: PageProps) {
  const { id } = await params;
  // Public catalog returns a slice but lacks `description` length cap; pull
  // the published listing record for the full description + license summary.
  const result = await serverFetch<{ listings?: MarketplaceListing[] }>('/v1/marketplace/listings?status=published');
  const listing = result.ok ? result.body.listings?.find((l) => l.id === id) : undefined;
  if (!listing) notFound();

  return (
    <div className="gb-page">
      <div className="gb-row" style={{ marginBottom: 16, fontSize: 13 }}>
        <a href="/" className="gb-muted">← Back to catalog</a>
      </div>
      <div className="gb-grid" style={{ gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: 32 }}>
        <article>
          <div
            aria-hidden
            style={{
              height: 320,
              borderRadius: 'var(--gb-radius-lg)',
              background: 'linear-gradient(135deg, #2c3556 0%, #3b4882 100%)',
              marginBottom: 24,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 36,
              fontWeight: 700,
              color: 'rgba(255,255,255,0.85)',
            }}
          >
            {listing.category}
          </div>

          <h1 style={{ margin: 0, fontSize: 28 }}>{listing.title}</h1>
          <p className="gb-muted" style={{ marginTop: 4 }}>
            Listing <code>{listing.id}</code> · Published {formatTimestamp(listing.publishedAt)}
          </p>

          <div className="gb-row" style={{ marginTop: 16, gap: 8 }}>
            <span className="gb-badge">{listing.category}</span>
            {listing.tags.map((tag) => (
              <span className="gb-badge" key={tag}>
                #{tag}
              </span>
            ))}
          </div>

          <section style={{ marginTop: 24 }}>
            <h2>About this listing</h2>
            <p style={{ whiteSpace: 'pre-wrap' }} data-testid="listing-description">{listing.description}</p>
          </section>

          <section style={{ marginTop: 24 }}>
            <h2>License</h2>
            <p>{listing.licenseSummary}</p>
          </section>
        </article>

        <aside>
          <div className="gb-card" style={{ position: 'sticky', top: 24 }}>
            <div className="gb-kpi">
              <span className="gb-kpi-label">Price</span>
              <span className="gb-kpi-value" data-testid="listing-price">
                {formatCurrencyCents(listing.priceCents, listing.currency)}
              </span>
            </div>
            <BuyButton listingId={listing.id} />
            <p className="gb-muted" style={{ fontSize: 12, marginTop: 12, marginBottom: 0 }}>
              Payments are processed by Stripe with tax + Connect destination split applied automatically.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
