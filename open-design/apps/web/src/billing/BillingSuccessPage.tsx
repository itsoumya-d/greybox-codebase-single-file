'use client';

import { useEffect, useState } from 'react';

function readSessionIdFromLocation(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const search = new URLSearchParams(window.location.search);
    const raw = search.get('session_id');
    if (!raw) return null;
    const trimmed = raw.trim();
    return trimmed.length > 0 && trimmed.length <= 200 ? trimmed : null;
  } catch {
    return null;
  }
}

export function BillingSuccessPage() {
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    setSessionId(readSessionIdFromLocation());
  }, []);

  return (
    <main className='billing-page billing-page--centered'>
      <div className='billing-card billing-card--success'>
        <span className='billing-card__icon' aria-hidden='true'>
          ✓
        </span>
        <h1 className='billing-card__title'>You&apos;re in. Welcome aboard.</h1>
        <p className='billing-card__body'>
          Your subscription is active. Cloud-managed token budgets, Pro modules, and engine
          packaging are unlocked for this installation.
        </p>
        {sessionId ? (
          <p className='billing-card__meta'>
            Stripe session: <code>{sessionId}</code>
          </p>
        ) : null}
        <div className='billing-card__actions'>
          <a className='billing-plan-action billing-plan-action--primary' href='/'>
            Go to your studio
          </a>
          <a className='billing-plan-action billing-plan-action--ghost' href='/billing'>
            View plans
          </a>
        </div>
      </div>
    </main>
  );
}
