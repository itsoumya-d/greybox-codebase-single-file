// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { formatTimestamp } from '@/lib/format';
import type { CreatorPayoutReadinessSafe } from '@/lib/marketplace-types';

export function CreatorPayouts() {
  const [creatorId, setCreatorId] = useState('');
  const [readiness, setReadiness] = useState<CreatorPayoutReadinessSafe | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [lastCheckedAt, setLastCheckedAt] = useState<number | undefined>();

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

  useEffect(() => {
    if (creatorId) void recheck();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creatorId]);

  async function recheck() {
    setBusy(true);
    setError(undefined);
    try {
      const result = await api.payoutReadiness(creatorId);
      if (!result.ok) {
        setError(extractError(result.body, `Refresh failed (${result.status})`));
        return;
      }
      setReadiness(result.body.readiness);
      setLastCheckedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'unknown error');
    } finally {
      setBusy(false);
    }
  }

  if (!creatorId) {
    return (
      <div className="gb-card">
        <p style={{ marginTop: 0 }} className="gb-muted">Enter a creator ID to view payouts.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const id = (e.currentTarget.elements.namedItem('creatorId') as HTMLInputElement | null)?.value.trim();
            if (id) setCreatorId(id);
          }}
        >
          <label htmlFor="creatorId">Creator ID</label>
          <input id="creatorId" name="creatorId" placeholder="creator-..." />
          <button type="submit" style={{ marginTop: 12 }}>Load</button>
        </form>
      </div>
    );
  }

  return (
    <div className="gb-col">
      {error && <div className="gb-error">{error}</div>}
      <div className="gb-card">
        <div className="gb-row" style={{ justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ margin: 0 }}>Creator <code>{creatorId}</code></h2>
            <p className="gb-muted" style={{ marginBottom: 0 }}>
              Last checked {formatTimestamp(lastCheckedAt)}
            </p>
          </div>
          <button type="button" className="gb-button-secondary" onClick={recheck} disabled={busy}>
            {busy ? 'Refreshing…' : 'Re-check verification'}
          </button>
        </div>
      </div>
      <div className="gb-card">
        <h3 style={{ marginTop: 0 }}>Payout readiness</h3>
        {readiness ? (
          <>
            <p>
              Status:{' '}
              <span
                className={`gb-badge ${
                  readiness.status === 'ready'
                    ? 'gb-badge-positive'
                    : readiness.status === 'needs-onboarding'
                    ? 'gb-badge-warning'
                    : 'gb-badge-danger'
                }`}
              >
                {readiness.status}
              </span>
            </p>
            {readiness.stripeConnectAccountId && (
              <p>Stripe account: <code>{readiness.stripeConnectAccountId}</code></p>
            )}
            <p>Tax profile on file: {readiness.hasTaxProfile ? 'yes' : 'no'}</p>
            {readiness.requirements.length > 0 ? (
              <ul>
                {readiness.requirements.map((req) => (
                  <li key={req.code}>
                    <strong className={req.severity === 'required' ? 'gb-badge-danger' : 'gb-muted'} style={{ marginRight: 8 }}>
                      {req.severity}
                    </strong>
                    {req.message}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="gb-muted">All clear.</p>
            )}
          </>
        ) : (
          <p className="gb-muted">No data yet.</p>
        )}
      </div>
    </div>
  );
}

function extractError(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && 'error' in body) {
    const err = (body as { error?: { message?: string } }).error;
    if (err?.message) return err.message;
  }
  return fallback;
}
