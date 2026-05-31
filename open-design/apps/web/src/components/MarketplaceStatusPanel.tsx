// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from 'react';

import {
  fetchMarketplaceListings,
  fetchMarketplaceStatus,
  purchaseMarketplaceListing,
} from '../providers/registry';
import type {
  MarketplaceListingSummary,
  MarketplaceStatusResponse,
} from '../types';

interface MarketplaceStatusPanelProps {
  buyerId: string;
  visible: boolean;
}

type MarketplacePanelState =
  | { status: 'idle' | 'loading' }
  | {
    status: 'ready';
    marketplace: MarketplaceStatusResponse;
    listings: MarketplaceListingSummary[];
  }
  | { status: 'error'; message: string };

type MarketplacePurchaseState =
  | { status: 'idle' }
  | { status: 'pending'; listingId: string }
  | {
    status: 'success';
    listingId: string;
    checkoutUrl?: string;
    orderId?: string;
  }
  | { status: 'error'; listingId: string; message: string };

function money(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    currency: 'USD',
    maximumFractionDigits: 0,
    style: 'currency',
  }).format(cents / 100);
}

function categoryLabel(category: string): string {
  return category
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function MarketplaceStatusPanel({ buyerId, visible }: MarketplaceStatusPanelProps) {
  const [state, setState] = useState<MarketplacePanelState>({ status: visible ? 'loading' : 'idle' });
  const [purchaseState, setPurchaseState] = useState<MarketplacePurchaseState>({ status: 'idle' });

  useEffect(() => {
    if (!visible) {
      setState({ status: 'idle' });
      setPurchaseState({ status: 'idle' });
      return;
    }
    let cancelled = false;
    setState({ status: 'loading' });
    void (async () => {
      const marketplace = await fetchMarketplaceStatus();
      const listings = marketplace.status === 'online'
        ? (await fetchMarketplaceListings()).listings
        : [];
      if (cancelled) return;
      if (marketplace.status === 'error') {
        setState({
          status: 'error',
          message: marketplace.error ?? 'Marketplace unavailable',
        });
        return;
      }
      setState({ status: 'ready', marketplace, listings });
    })();
    return () => {
      cancelled = true;
    };
  }, [visible]);

  if (!visible) return null;

  async function handlePurchase(listing: MarketplaceListingSummary): Promise<void> {
    setPurchaseState({ status: 'pending', listingId: listing.id });
    const response = await purchaseMarketplaceListing({
      buyerId,
      listingId: listing.id,
    });
    if (response.status === 'online' && (response.order || response.checkoutUrl)) {
      setPurchaseState({
        status: 'success',
        listingId: listing.id,
        ...(response.checkoutUrl ? { checkoutUrl: response.checkoutUrl } : {}),
        ...(response.order ? { orderId: response.order.id } : {}),
      });
      return;
    }
    setPurchaseState({
      status: 'error',
      listingId: listing.id,
      message: response.error ?? 'Marketplace purchase failed',
    });
  }

  return (
    <section className="marketplace-status-panel" aria-label="Greybox marketplace">
      <div className="marketplace-status-header">
        <div>
          <span className="marketplace-status-eyebrow">Creator Marketplace</span>
          <h2>Marketplace Supply</h2>
        </div>
        {state.status === 'ready' && state.marketplace.status === 'online' ? (
          <span className="marketplace-status-pill">online</span>
        ) : null}
      </div>

      {state.status === 'loading' ? (
        <p className="marketplace-status-empty">Checking creator marketplace...</p>
      ) : null}

      {state.status === 'error' ? (
        <p className="marketplace-status-error">{state.message}</p>
      ) : null}

      {state.status === 'ready' && state.marketplace.status === 'unconfigured' ? (
        <p className="marketplace-status-empty">
          Closed-core marketplace is not connected yet. Configure the marketplace service to surface creator packs here.
        </p>
      ) : null}

      {state.status === 'ready' && state.marketplace.status === 'online' ? (
        <>
          <div className="marketplace-status-stats">
            <span>
              <strong>{money(state.marketplace.stats?.gmvCents ?? 0)}</strong>
              GMV
            </span>
            <span>
              <strong>{state.marketplace.stats?.activeCreatorsWithSales ?? 0}</strong>
              creators with sales
            </span>
            <span>
              <strong>{state.marketplace.stats?.publishedListings ?? state.listings.length}</strong>
              published listings
            </span>
          </div>

          {state.listings.length > 0 ? (
            <div className="marketplace-listing-strip">
              {state.listings.slice(0, 3).map((listing) => {
                const listingPurchaseState = purchaseState.status !== 'idle' && purchaseState.listingId === listing.id
                  ? purchaseState
                  : null;
                return (
                  <article key={listing.id} className="marketplace-listing-summary">
                    <span>{categoryLabel(listing.category)}</span>
                    <strong>{listing.title}</strong>
                    <small>{money(listing.priceCents)}</small>
                    <button
                      type="button"
                      onClick={() => { void handlePurchase(listing); }}
                      disabled={purchaseState.status === 'pending'}
                    >
                      {listingPurchaseState?.status === 'pending' ? 'Starting...' : 'Start purchase'}
                    </button>
                    {listingPurchaseState?.status === 'success' ? (
                      listingPurchaseState.checkoutUrl ? (
                        <a
                          className="marketplace-purchase-state"
                          href={listingPurchaseState.checkoutUrl}
                          rel="noreferrer"
                          target="_blank"
                        >
                          Open checkout
                        </a>
                      ) : (
                        <em className="marketplace-purchase-state">Order {listingPurchaseState.orderId} queued</em>
                      )
                    ) : null}
                    {listingPurchaseState?.status === 'error' ? (
                      <em className="marketplace-purchase-state error">{listingPurchaseState.message}</em>
                    ) : null}
                  </article>
                );
              })}
            </div>
          ) : (
            <p className="marketplace-status-empty">
              Marketplace is online, but no published creator packs are available yet.
            </p>
          )}
        </>
      ) : null}
    </section>
  );
}
