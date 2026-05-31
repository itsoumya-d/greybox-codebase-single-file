// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import type { ListingCategory, MarketplaceOrder } from '../types.js';

export const CATEGORY_PRICE_BOUNDS_CENTS: Record<ListingCategory, { min: number; max: number }> = {
  'custom-art-bible': { min: 500, max: 5_000 },
  'custom-skill': { min: 1_000, max: 10_000 },
  'asset-pack': { min: 500, max: 20_000 },
  template: { min: 1_000, max: 8_000 },
  'pro-module': { min: 4_900, max: 20_000 },
  'consulting-hour': { min: 1_000, max: 50_000 },
};

export function assertPriceAllowed(category: ListingCategory, priceCents: number): void {
  const bounds = CATEGORY_PRICE_BOUNDS_CENTS[category];
  if (!Number.isInteger(priceCents)) throw new Error('priceCents must be an integer');
  if (priceCents < bounds.min || priceCents > bounds.max) {
    throw new Error(`${category} price must be between ${bounds.min} and ${bounds.max} cents`);
  }
}

export function takeRateForCreator(monthlyGmvCents: number): number {
  if (monthlyGmvCents < 1_000_000) return 0.15;
  if (monthlyGmvCents >= 5_000_000) return 0.08;
  const progress = (monthlyGmvCents - 1_000_000) / 4_000_000;
  return Number((0.15 - progress * 0.07).toFixed(4));
}

export function splitOrder(input: {
  orderId: string;
  buyerId: string;
  creatorId: string;
  listingId: string;
  grossCents: number;
  creatorMonthlyGmvCents: number;
  createdAt: number;
}): MarketplaceOrder {
  const takeRate = takeRateForCreator(input.creatorMonthlyGmvCents);
  const platformFeeCents = Math.round(input.grossCents * takeRate);
  return {
    id: input.orderId,
    buyerId: input.buyerId,
    creatorId: input.creatorId,
    listingId: input.listingId,
    grossCents: input.grossCents,
    platformFeeCents,
    creatorNetCents: input.grossCents - platformFeeCents,
    currency: 'usd',
    createdAt: input.createdAt,
  };
}
