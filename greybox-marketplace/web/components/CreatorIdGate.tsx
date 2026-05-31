// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { formatCurrencyCents, formatNumber, formatTimestamp } from '@/lib/format';
import type { MarketplaceListing, MarketplaceStats, CreatorPayoutReadinessSafe } from '@/lib/marketplace-types';

interface CreatorIdGateProps {
  stats: MarketplaceStats | undefined;
  listings: MarketplaceListing[];
}

export function CreatorIdGate({ stats, listings }: CreatorIdGateProps) {
  const [creatorId, setCreatorId] = useState<string>('');
  const [hydrated, setHydrated] = useState(false);
  const [readiness, setReadiness] = useState<CreatorPayoutReadinessSafe | undefined>();
  const [pending, setPending] = useState<MarketplaceListing[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('gb_onboarding_state');
      if (raw) {
        const parsed = JSON.parse(raw) as { creatorId?: string };
        if (parsed.creatorId) setCreatorId(parsed.creatorId);
      }
    } catch {
      // ignore
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!creatorId) return;
    let cancelled = false;
    Promise.all([
      api.payoutReadiness(creatorId),
      api.listings({}),
    ]).then(([readinessRes, listingsRes]) => {
      if (cancelled) return;
      if (readinessRes.ok) setReadiness(readinessRes.body.readiness);
      if (listingsRes.ok) {
        setPending(
          listingsRes.body.listings.filter(
            (l) => l.creatorId === creatorId && (l.status === 'pending-human-review' || l.status === 'pending-auto-review'),
          ),
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [creatorId]);

  const myListings = useMemo(
    () => (creatorId ? listings.filter((l) => l.creatorId === creatorId) : []),
    [creatorId, listings],
  );

  if (!hydrated) return <p className="gb-muted">Loading…</p>;

  if (!creatorId) {
    return (
      <div className="gb-card">
        <p style={{ marginTop: 0 }}>
          We need a creator ID to slice the dashboard for you. Complete creator onboarding first.
        </p>
        <a href="/creator/onboard" className="gb-button">Onboard now</a>
        <form
          style={{ marginTop: 16 }}
          onSubmit={(e) => {
            e.preventDefault();
            const id = (e.currentTarget.elements.namedItem('creatorId') as HTMLInputElement | null)?.value.trim();
            if (id) {
              setCreatorId(id);
              localStorage.setItem('gb_onboarding_state', JSON.stringify({ creatorId: id }));
            }
          }}
        >
          <label htmlFor="creatorId">…or enter a known creator ID</label>
          <input id="creatorId" name="creatorId" placeholder="creator-..." />
          <button type="submit" style={{ marginTop: 12 }}>Load</button>
        </form>
      </div>
    );
  }

  return (
    <>
      <div className="gb-grid gb-grid-cards" data-testid="kpi-cards" style={{ marginBottom: 24 }}>
        <div className="gb-card">
          <div className="gb-kpi">
            <span className="gb-kpi-label">30-day GMV (platform)</span>
            <span className="gb-kpi-value">
              {stats ? formatCurrencyCents(stats.gmvCents) : '—'}
            </span>
          </div>
        </div>
        <div className="gb-card">
          <div className="gb-kpi">
            <span className="gb-kpi-label">Platform fee earned</span>
            <span className="gb-kpi-value">
              {stats ? formatCurrencyCents(stats.platformRevenueCents) : '—'}
            </span>
          </div>
        </div>
        <div className="gb-card">
          <div className="gb-kpi">
            <span className="gb-kpi-label">Active listings (you)</span>
            <span className="gb-kpi-value" data-testid="active-listings-kpi">{formatNumber(myListings.length)}</span>
          </div>
        </div>
        <div className="gb-card">
          <div className="gb-kpi">
            <span className="gb-kpi-label">Pending review (you)</span>
            <span className="gb-kpi-value">{formatNumber(pending.length)}</span>
          </div>
        </div>
      </div>

      <section className="gb-card" style={{ marginBottom: 24 }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0 }}>Payout readiness</h2>
          <span
            className={`gb-badge ${
              readiness?.status === 'ready'
                ? 'gb-badge-positive'
                : readiness?.status === 'needs-onboarding'
                ? 'gb-badge-warning'
                : 'gb-badge-danger'
            }`}
            data-testid="readiness-badge"
          >
            {readiness?.status ?? 'unknown'}
          </span>
        </header>
        {readiness ? (
          <ul style={{ paddingLeft: 18, margin: 0 }}>
            {readiness.requirements.map((r) => (
              <li key={r.code} style={{ marginBottom: 4 }}>
                <strong className={r.severity === 'required' ? 'gb-badge-danger' : 'gb-muted'} style={{ marginRight: 8 }}>
                  {r.severity}
                </strong>
                {r.message}
              </li>
            ))}
            {readiness.requirements.length === 0 && (
              <li className="gb-muted">All clear. Payouts are flowing.</li>
            )}
          </ul>
        ) : (
          <p className="gb-muted" style={{ margin: 0 }}>Checking…</p>
        )}
        <div className="gb-sticky-actions">
          <a href="/creator/payouts" className="gb-button-secondary gb-button">View payouts</a>
        </div>
      </section>

      <section className="gb-card">
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0 }}>My listings</h2>
          <a href="/creator/listings" className="gb-muted" style={{ fontSize: 13 }}>See all →</a>
        </header>
        {myListings.length === 0 && pending.length === 0 ? (
          <p className="gb-muted">No listings yet. <a href="/creator/listings/new">Create your first listing.</a></p>
        ) : (
          <table className="gb-table" data-testid="listings-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Status</th>
                <th>Category</th>
                <th>Price</th>
                <th>Last update</th>
                <th>Sparkline</th>
              </tr>
            </thead>
            <tbody>
              {[...myListings, ...pending].map((listing) => (
                <tr key={listing.id} data-testid={`listing-row-${listing.id}`}>
                  <td>{listing.title}</td>
                  <td><StatusBadge status={listing.status} /></td>
                  <td>{listing.category}</td>
                  <td>{formatCurrencyCents(listing.priceCents, listing.currency)}</td>
                  <td>{formatTimestamp(listing.updatedAt)}</td>
                  <td><Sparkline seed={listing.id} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}

function StatusBadge({ status }: { status: MarketplaceListing['status'] }) {
  const klass =
    status === 'published'
      ? 'gb-badge-positive'
      : status === 'rejected' || status === 'suspended'
      ? 'gb-badge-danger'
      : 'gb-badge-warning';
  return <span className={`gb-badge ${klass}`}>{status}</span>;
}

function Sparkline({ seed }: { seed: string }) {
  // Deterministic synthetic 7-day sparkline keyed on listingId. Once the
  // marketplace exposes per-listing daily orders, swap this for real data.
  const points = useMemo(() => {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
    return Array.from({ length: 7 }, (_, i) => {
      const next = Math.abs(Math.sin((hash + i * 73) / 5));
      return Math.round(next * 30);
    });
  }, [seed]);
  const max = Math.max(...points, 1);
  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${i * 10},${30 - (p / max) * 28}`)
    .join(' ');
  return (
    <svg className="gb-spark" viewBox="0 0 60 30" width={60} height={28} role="img" aria-label="7-day sales sparkline">
      <path d={path} fill="none" stroke="var(--gb-accent)" strokeWidth="2" />
    </svg>
  );
}
