// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatCurrencyCents, formatTimestamp } from '@/lib/format';
import type { ListingStatus, MarketplaceListing } from '@/lib/marketplace-types';

interface Props {
  listings: MarketplaceListing[];
}

const STATUS_FILTERS: { value: ListingStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'published', label: 'Published' },
  { value: 'pending-human-review', label: 'Pending human review' },
  { value: 'pending-auto-review', label: 'Pending auto review' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'draft', label: 'Draft' },
  { value: 'suspended', label: 'Suspended' },
];

export function CreatorListingsTable({ listings }: Props) {
  const [creatorId, setCreatorId] = useState<string>('');
  const [filter, setFilter] = useState<(typeof STATUS_FILTERS)[number]['value']>('all');

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
  }, []);

  const filtered = useMemo(
    () =>
      listings
        .filter((l) => (creatorId ? l.creatorId === creatorId : true))
        .filter((l) => (filter === 'all' ? true : l.status === filter)),
    [creatorId, filter, listings],
  );

  return (
    <>
      <div className="gb-filters" role="group" aria-label="Filter by status">
        {STATUS_FILTERS.map((s) => (
          <button
            type="button"
            key={s.value}
            className={`gb-chip ${filter === s.value ? 'gb-chip-active' : ''}`}
            onClick={() => setFilter(s.value)}
          >
            {s.label}
          </button>
        ))}
      </div>
      {!creatorId && (
        <div className="gb-card" style={{ marginBottom: 16 }}>
          <p style={{ margin: 0 }} className="gb-muted">
            No creator ID set — showing all creators. <a href="/creator/onboard">Onboard</a> to filter to yours.
          </p>
        </div>
      )}
      {filtered.length === 0 ? (
        <div className="gb-card">
          <p style={{ margin: 0 }} className="gb-muted">
            No listings match this filter.
          </p>
        </div>
      ) : (
        <table className="gb-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Status</th>
              <th>Category</th>
              <th>Price</th>
              <th>Created</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((listing) => (
              <tr key={listing.id}>
                <td>{listing.title}</td>
                <td>
                  <span
                    className={`gb-badge ${
                      listing.status === 'published'
                        ? 'gb-badge-positive'
                        : listing.status === 'rejected' || listing.status === 'suspended'
                        ? 'gb-badge-danger'
                        : 'gb-badge-warning'
                    }`}
                  >
                    {listing.status}
                  </span>
                </td>
                <td>{listing.category}</td>
                <td>{formatCurrencyCents(listing.priceCents, listing.currency)}</td>
                <td>{formatTimestamp(listing.createdAt)}</td>
                <td>{formatTimestamp(listing.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
