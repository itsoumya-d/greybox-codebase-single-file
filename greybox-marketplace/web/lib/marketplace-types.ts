// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

/**
 * Frontend-facing slice of `greybox-marketplace/src/types.ts`.
 *
 * The backend types file is ESM-NodeNext and pulls in Node-only modules
 * transitively. Rather than couple the web app to that compilation graph we
 * mirror the wire-level shapes here. Anything new the UI needs MUST be added
 * to this file with exactly the field names + optionality the backend emits.
 *
 * Keep in sync with the source in `greybox-marketplace/src/types.ts`. When the
 * canonical @greybox/schema package lands, delete this file and import from
 * there.
 */

export type ListingCategory =
  | 'custom-art-bible'
  | 'custom-skill'
  | 'asset-pack'
  | 'template'
  | 'pro-module'
  | 'consulting-hour';

export type Currency = 'usd';

export type ListingStatus =
  | 'draft'
  | 'pending-auto-review'
  | 'pending-human-review'
  | 'published'
  | 'rejected'
  | 'suspended';

export type CreatorTaxProfileProvider =
  | 'stripe-tax'
  | 'stripe-identity'
  | 'taxbit'
  | 'manual-review'
  | 'external';

export interface Creator {
  id: string;
  displayName: string;
  country: string;
  email?: string;
  stripeConnectAccountId?: string;
  stripeConnectOnboardingComplete?: boolean;
  stripeConnectTransfersEnabled?: boolean;
  stripeConnectDisabledReason?: string;
  stripeConnectStatusSyncedAt?: number;
  taxProfileId?: string;
  taxProfileProvider?: CreatorTaxProfileProvider;
  taxProfileCollectedAt?: number;
  monthlyGmvCents: number;
  lifetimeGmvCents: number;
  active: boolean;
}

export type CreatorPayoutReadinessStatus = 'ready' | 'needs-onboarding' | 'blocked';

export interface CreatorPayoutRequirement {
  code:
    | 'creator_active_required'
    | 'stripe_connect_account_required'
    | 'stripe_connect_onboarding_required'
    | 'tax_profile_required';
  severity: 'required' | 'warning';
  message: string;
}

export interface CreatorPayoutReadinessSafe {
  creatorId: string;
  status: CreatorPayoutReadinessStatus;
  canReceivePayouts: boolean;
  stripeConnectAccountId?: string;
  hasTaxProfile: boolean;
  requirements: CreatorPayoutRequirement[];
  nextAction?:
    | 'create_stripe_connect_account'
    | 'complete_stripe_connect_onboarding'
    | 'collect_tax_profile';
}

export interface StripeConnectAccountStatusRecordInput {
  onboardingComplete: boolean;
  transfersEnabled: boolean;
  disabledReason?: string;
  syncedAt?: number;
  actorId?: string;
  actorType?: 'admin' | 'system' | 'webhook';
}

export interface StripeConnectAccountSummary {
  stripeConnectAccountId: string;
  livemode?: boolean;
  onboardingComplete?: boolean;
  transfersEnabled?: boolean;
  disabledReason?: string;
}

export interface StripeConnectAccountLinkSummary {
  url: string;
  expiresAt?: number;
}

export interface StripeConnectOnboardingCreatorSummary {
  id: string;
  displayName: string;
  country: string;
  active: boolean;
  stripeConnectAccountId?: string;
  stripeConnectOnboardingComplete?: boolean;
  stripeConnectTransfersEnabled?: boolean;
  hasTaxProfile: boolean;
}

export interface StripeConnectOnboardingLinkResult {
  creator: StripeConnectOnboardingCreatorSummary;
  plan: {
    creatorId: string;
    readiness: CreatorPayoutReadinessSafe;
  };
  account?: StripeConnectAccountSummary;
  accountLink: StripeConnectAccountLinkSummary;
}

export interface StripeConnectAccountStatusRecordResult {
  creator: StripeConnectOnboardingCreatorSummary;
  readiness: CreatorPayoutReadinessSafe;
  accountStatus: {
    onboardingComplete: boolean;
    transfersEnabled: boolean;
    disabledReason?: string;
    syncedAt: number;
  };
}

export interface CreatorTaxProfileRecordInput {
  taxProfileId: string;
  provider?: CreatorTaxProfileProvider;
  collectedAt?: number;
  country?: string;
  actorId?: string;
  actorType?: 'admin' | 'system';
}

export interface CreatorTaxProfileRecordResult {
  creator: StripeConnectOnboardingCreatorSummary;
  readiness: CreatorPayoutReadinessSafe;
  taxProfile: {
    referencePresent: true;
    provider: CreatorTaxProfileProvider;
    country: string;
    collectedAt: number;
  };
}

export interface ListingDraft {
  creatorId: string;
  title: string;
  description: string;
  category: ListingCategory;
  priceCents: number;
  currency?: Currency;
  licenseSummary: string;
  tags?: string[];
}

export interface MarketplaceListing {
  id: string;
  creatorId: string;
  title: string;
  description: string;
  category: ListingCategory;
  priceCents: number;
  currency: Currency;
  licenseSummary: string;
  tags: string[];
  status: ListingStatus;
  createdAt: number;
  updatedAt: number;
  publishedAt?: number;
  reviewId?: string;
}

export interface ListingReview {
  id: string;
  listingId: string;
  status: 'passed' | 'human-required' | 'rejected';
  flags: {
    id: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    reason: string;
    evidence: string;
  }[];
  humanReviewRequired: boolean;
  createdAt: number;
  reviewerId?: string;
  decisionAt?: number;
}

export interface MarketplaceCatalogFacet {
  value: string;
  count: number;
}

export interface MarketplaceCatalogListing {
  id: string;
  title: string;
  description: string;
  category: ListingCategory;
  priceCents: number;
  currency: Currency;
  licenseSummary: string;
  tags: string[];
  publishedAt?: number;
  creator: {
    id: string;
    displayName: string;
    country: string;
  };
  score: number;
  salesCount: number;
}

export interface MarketplaceCatalogSearchResult {
  query?: string;
  category?: ListingCategory;
  tag?: string;
  creatorId?: string;
  total: number;
  offset: number;
  limit: number;
  facets: {
    categories: MarketplaceCatalogFacet[];
    tags: MarketplaceCatalogFacet[];
  };
  listings: MarketplaceCatalogListing[];
}

export interface MarketplaceCreatorStorefront {
  creator: {
    id: string;
    displayName: string;
    country: string;
  };
  stats: {
    publishedListings: number;
    salesCount: number;
    categories: ListingCategory[];
    priceRangeCents?: {
      min: number;
      max: number;
    };
  };
  listings: {
    id: string;
    title: string;
    description: string;
    category: ListingCategory;
    priceCents: number;
    currency: Currency;
    licenseSummary: string;
    tags: string[];
    publishedAt?: number;
  }[];
}

export interface MarketplaceStats {
  period?: {
    from: number;
    to: number;
    label: string;
  };
  gmvCents: number;
  platformRevenueCents: number;
  creatorNetCents: number;
  orders: number;
  activeCreatorsWithSales: number;
  publishedListings: number;
}

export interface MarketplaceReviewDashboardItem {
  reviewId: string;
  listingId: string;
  creatorId: string;
  title: string;
  category: ListingCategory;
  priceCents: number;
  currency: Currency;
  status: 'passed' | 'human-required' | 'rejected';
  humanReviewRequired: boolean;
  flagCount: number;
  flagIds: string[];
  highestSeverity?: 'low' | 'medium' | 'high' | 'critical';
  createdAt: number;
  ageMs: number;
  recommendedAction: 'approve' | 'investigate' | 'reject';
}

export interface MarketplaceReviewDashboard {
  generatedAt: number;
  summary: {
    totalReviews: number;
    pendingHumanReviews: number;
    rejectedReviews: number;
    passedReviews: number;
    criticalFlags: number;
    highFlags: number;
    flaglessHumanReviews: number;
    oldestPendingAgeMs: number;
  };
  reviews: MarketplaceReviewDashboardItem[];
}

export interface MarketplaceCheckoutPlan {
  listingId: string;
  buyerId: string;
  creatorId: string;
  orderPreview: {
    id: string;
    buyerId: string;
    creatorId: string;
    listingId: string;
    grossCents: number;
    platformFeeCents: number;
    creatorNetCents: number;
    currency: Currency;
    createdAt: number;
  };
  readiness: {
    status: 'ready' | 'blocked';
    requirements: { code: string; message: string }[];
  };
}

export interface MarketplaceCheckoutSessionResponse {
  plan: MarketplaceCheckoutPlan;
  checkout: {
    id: string;
    url: string;
    livemode?: boolean;
    expiresAt?: number;
    paymentStatus?: string;
  };
}
