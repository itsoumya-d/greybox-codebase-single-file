// SPDX-License-Identifier: Apache-2.0

export type MarketplaceListingCategory =
  | 'custom-art-bible'
  | 'custom-skill'
  | 'asset-pack'
  | 'template'
  | 'consulting-hour';

export type MarketplaceListingStatus =
  | 'draft'
  | 'pending-auto-review'
  | 'pending-human-review'
  | 'published'
  | 'rejected'
  | 'suspended';

export type MarketplaceBridgeStatus = 'unconfigured' | 'online' | 'error';

export interface MarketplaceStatsSummary {
  gmvCents: number;
  platformRevenueCents: number;
  creatorNetCents: number;
  orders: number;
  activeCreatorsWithSales: number;
  publishedListings: number;
}

export interface MarketplaceListingSummary {
  id: string;
  creatorId: string;
  title: string;
  description: string;
  category: MarketplaceListingCategory;
  priceCents: number;
  currency: 'usd';
  tags: string[];
  status: MarketplaceListingStatus;
  createdAt: number;
  updatedAt: number;
  publishedAt?: number;
}

export interface MarketplaceStatusResponse {
  configured: boolean;
  status: MarketplaceBridgeStatus;
  service?: string;
  stats?: MarketplaceStatsSummary;
  error?: string;
}

export interface MarketplaceListingsResponse {
  configured: boolean;
  status: MarketplaceBridgeStatus;
  listings: MarketplaceListingSummary[];
  error?: string;
}

export interface MarketplacePurchaseRequest {
  listingId: string;
  buyerId: string;
}

export type MarketplacePurchaseNextAction = 'checkout' | 'order-created';

export interface MarketplaceOrderSummary {
  id: string;
  buyerId: string;
  creatorId: string;
  listingId: string;
  grossCents: number;
  platformFeeCents: number;
  creatorNetCents: number;
  currency: 'usd';
  createdAt: number;
  payoutId?: string;
  taxRecordId?: string;
}

export interface MarketplacePurchaseResponse {
  configured: boolean;
  status: MarketplaceBridgeStatus;
  order?: MarketplaceOrderSummary;
  checkoutSessionId?: string;
  checkoutUrl?: string;
  nextAction?: MarketplacePurchaseNextAction;
  error?: string;
}
