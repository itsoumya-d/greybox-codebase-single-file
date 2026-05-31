// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

'use client';

import { useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { formatCurrencyCents, formatRelativeMs } from '@/lib/format';
import type { MarketplaceReviewDashboard, MarketplaceListing, MarketplaceReviewDashboardItem } from '@/lib/marketplace-types';

interface Props {
  dashboard: MarketplaceReviewDashboard | undefined;
  listings: MarketplaceListing[];
}

export function AdminReviewQueue({ dashboard, listings }: Props) {
  const [reviewerId, setReviewerId] = useState('admin-reviewer');
  const [expanded, setExpanded] = useState<string | undefined>();
  const [actionState, setActionState] = useState<Record<string, { busy?: boolean; result?: string; error?: string }>>({});
  const [version, setVersion] = useState(0);

  const items = useMemo(() => dashboard?.reviews ?? [], [dashboard, version]);

  function listingFor(item: MarketplaceReviewDashboardItem): MarketplaceListing | undefined {
    return listings.find((l) => l.id === item.listingId);
  }

  function setState(reviewId: string, next: { busy?: boolean; result?: string; error?: string }) {
    setActionState((prev) => ({ ...prev, [reviewId]: { ...prev[reviewId], ...next } }));
  }

  async function approve(reviewId: string) {
    setState(reviewId, { busy: true, error: undefined });
    try {
      const result = await api.approveReview(reviewId, reviewerId.trim() || 'admin-reviewer');
      if (!result.ok) {
        setState(reviewId, { busy: false, error: extractError(result.body, `Approve failed (${result.status})`) });
        return;
      }
      setState(reviewId, { busy: false, result: `Approved listing ${result.body.listing.id}` });
      setVersion((v) => v + 1);
    } catch (err) {
      setState(reviewId, { busy: false, error: err instanceof Error ? err.message : 'unknown error' });
    }
  }

  function reject(reviewId: string) {
    // The backend exposes /reviews/:id/approve only; rejection lands via the
    // critique flow at submit time. Record a local note so the operator can
    // hand off via the audit log.
    setState(reviewId, {
      result: 'Rejection flagged locally. Use the audit pipeline to record the decision.',
    });
  }

  function requestChanges(reviewId: string) {
    const notes = window.prompt('What changes does the creator need to make?');
    if (!notes) return;
    setState(reviewId, {
      result: `Change request recorded: ${notes.slice(0, 80)}${notes.length > 80 ? '…' : ''}`,
    });
  }

  if (!dashboard) {
    return (
      <div className="gb-error">
        Could not load the review dashboard. Check <code>MARKETPLACE_API_URL</code> and{' '}
        <code>GREYBOX_MARKETPLACE_ADMIN_TOKEN</code>.
      </div>
    );
  }

  return (
    <>
      <div className="gb-grid gb-grid-cards" style={{ marginBottom: 24 }}>
        <div className="gb-card">
          <div className="gb-kpi">
            <span className="gb-kpi-label">Pending human</span>
            <span className="gb-kpi-value">{dashboard.summary.pendingHumanReviews}</span>
          </div>
        </div>
        <div className="gb-card">
          <div className="gb-kpi">
            <span className="gb-kpi-label">Critical flags</span>
            <span className="gb-kpi-value">{dashboard.summary.criticalFlags}</span>
          </div>
        </div>
        <div className="gb-card">
          <div className="gb-kpi">
            <span className="gb-kpi-label">High flags</span>
            <span className="gb-kpi-value">{dashboard.summary.highFlags}</span>
          </div>
        </div>
        <div className="gb-card">
          <div className="gb-kpi">
            <span className="gb-kpi-label">Oldest pending</span>
            <span className="gb-kpi-value">
              {formatRelativeMs(dashboard.summary.oldestPendingAgeMs)}
            </span>
          </div>
        </div>
      </div>

      <div className="gb-card" style={{ marginBottom: 24 }}>
        <label htmlFor="reviewerId">Reviewer ID (recorded on approval)</label>
        <input id="reviewerId" value={reviewerId} onChange={(e) => setReviewerId(e.target.value)} />
      </div>

      {items.length === 0 ? (
        <div className="gb-card">
          <p style={{ margin: 0 }} className="gb-muted">No reviews waiting. Take a break.</p>
        </div>
      ) : (
        <table className="gb-table" data-testid="admin-review-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Creator</th>
              <th>Category</th>
              <th>Price</th>
              <th>Status</th>
              <th>Age</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const open = expanded === item.reviewId;
              const action = actionState[item.reviewId] ?? {};
              const listing = listingFor(item);
              return (
                <>
                  <tr key={item.reviewId} data-testid={`review-row-${item.reviewId}`}>
                    <td>
                      <button
                        type="button"
                        className="gb-button-secondary gb-button"
                        style={{ padding: '4px 10px', fontSize: 13 }}
                        onClick={() => setExpanded(open ? undefined : item.reviewId)}
                      >
                        {open ? '▾' : '▸'} {item.title}
                      </button>
                    </td>
                    <td>{item.creatorId}</td>
                    <td>{item.category}</td>
                    <td>{formatCurrencyCents(item.priceCents, item.currency)}</td>
                    <td>
                      <span
                        className={`gb-badge ${
                          item.status === 'human-required' ? 'gb-badge-warning' : item.status === 'rejected' ? 'gb-badge-danger' : 'gb-badge-positive'
                        }`}
                      >
                        {item.status}
                      </span>
                    </td>
                    <td>{formatRelativeMs(item.ageMs)}</td>
                    <td>
                      <div className="gb-row" style={{ gap: 4 }}>
                        <button
                          type="button"
                          onClick={() => approve(item.reviewId)}
                          disabled={action.busy}
                          data-testid={`approve-${item.reviewId}`}
                          style={{ padding: '4px 10px', fontSize: 13 }}
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          className="gb-button-secondary"
                          onClick={() => requestChanges(item.reviewId)}
                          style={{ padding: '4px 10px', fontSize: 13 }}
                        >
                          Request changes
                        </button>
                        <button
                          type="button"
                          className="gb-button-danger gb-button"
                          onClick={() => reject(item.reviewId)}
                          style={{ padding: '4px 10px', fontSize: 13 }}
                        >
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                  {open && (
                    <tr>
                      <td colSpan={7} style={{ background: 'var(--gb-bg-elevated)' }}>
                        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                          {listing && (
                            <>
                              <div>
                                <h4 style={{ margin: 0 }}>Description</h4>
                                <p style={{ whiteSpace: 'pre-wrap' }}>{listing.description}</p>
                              </div>
                              <div>
                                <h4 style={{ margin: 0 }}>License</h4>
                                <p>{listing.licenseSummary}</p>
                              </div>
                              <div className="gb-row" style={{ gap: 4 }}>
                                {listing.tags.map((t) => (
                                  <span className="gb-badge" key={t}>#{t}</span>
                                ))}
                              </div>
                            </>
                          )}
                          {item.flagCount > 0 && (
                            <div>
                              <h4 style={{ margin: 0 }}>Flags ({item.flagCount})</h4>
                              <ul>
                                {item.flagIds.map((id) => (
                                  <li key={id}>{id}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {action.result && <div className="gb-success" role="status">{action.result}</div>}
                          {action.error && <div className="gb-error" role="alert">{action.error}</div>}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}

function extractError(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && 'error' in body) {
    const err = (body as { error?: { message?: string } }).error;
    if (err?.message) return err.message;
  }
  return fallback;
}
