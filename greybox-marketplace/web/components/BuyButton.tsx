// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

'use client';

import { useState } from 'react';
import { api } from '@/lib/api';

interface BuyButtonProps {
  listingId: string;
}

export function BuyButton({ listingId }: BuyButtonProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  async function handleBuy() {
    setBusy(true);
    setError(undefined);
    try {
      const origin = window.location.origin;
      const result = await api.checkoutSession({
        listingId,
        buyerId: localStorage.getItem('gb_buyer_id') ?? `buyer-${crypto.randomUUID().slice(0, 8)}`,
        successUrl: `${origin}/listings/${encodeURIComponent(listingId)}?checkout=success`,
        cancelUrl: `${origin}/listings/${encodeURIComponent(listingId)}?checkout=cancel`,
      });
      if (!result.ok) {
        const body = result.body as { error?: { message?: string } } | undefined;
        setError(body?.error?.message ?? `Checkout failed (${result.status})`);
        return;
      }
      const url = result.body.checkout?.url;
      if (!url) {
        setError('Marketplace did not return a Stripe Checkout URL.');
        return;
      }
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'unknown error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleBuy}
        disabled={busy}
        data-testid="buy-button"
        style={{ width: '100%', marginTop: 16, fontSize: 15, padding: '12px 16px' }}
      >
        {busy ? 'Starting checkout…' : 'Buy with Stripe'}
      </button>
      {error && (
        <div className="gb-error" role="alert" style={{ marginTop: 12 }} data-testid="buy-error">
          {error}
        </div>
      )}
    </>
  );
}
