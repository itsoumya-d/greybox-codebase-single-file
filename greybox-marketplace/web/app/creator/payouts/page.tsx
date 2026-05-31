// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { CreatorPayouts } from './CreatorPayouts';

export const dynamic = 'force-dynamic';

export default function CreatorPayoutsPage() {
  return (
    <div className="gb-page">
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>Payouts</h1>
        <p className="gb-muted">Stripe Connect status, payout history, and verification recheck.</p>
      </header>
      <CreatorPayouts />
    </div>
  );
}
