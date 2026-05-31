// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

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

export type CreatorTaxProfileProvider = 'stripe-tax' | 'stripe-identity' | 'taxbit' | 'manual-review' | 'external';

export interface ListingDraft {
  creatorId: string;
  title: string;
  description: string;
  category: ListingCategory;
  priceCents: number;
  currency?: Currency;
  licenseSummary: string;
  tags?: string[];
  proModule?: ProModuleListingMetadata;
}

export type ProModuleMountKind = 'skill' | 'game-art-bible' | 'engine-target';

export interface ProModuleListingMount {
  kind: ProModuleMountKind;
  id: string;
  title?: string;
  description?: string;
  digestSha256?: string;
}

export interface ProModuleListingManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  licenseTier?: string;
  minAgdsVersion?: string;
  mounts: {
    skills?: ProModuleListingMount[];
    gameArtBibles?: ProModuleListingMount[];
    engineTargets?: ProModuleListingMount[];
  };
}

export interface ProModuleListingSignature {
  algorithm: 'ed25519';
  keyId: string;
}

export interface ProModuleListingEntitlement {
  sku: string;
  licenseTier: string;
  grantKey: string;
}

export interface ProModuleListingMetadata {
  format: 'agds-pro-module-bundle/v1';
  manifest: ProModuleListingManifest;
  payloadSha256: string;
  signature: ProModuleListingSignature;
  mountCount: number;
  entitlement: ProModuleListingEntitlement;
}

export interface MarketplaceListing extends Required<Omit<ListingDraft, 'tags' | 'currency' | 'proModule'>> {
  id: string;
  currency: Currency;
  tags: string[];
  status: ListingStatus;
  createdAt: number;
  updatedAt: number;
  publishedAt?: number;
  reviewId?: string;
  proModule?: ProModuleListingMetadata;
}

export interface MarketplaceCreatorStorefrontListing {
  id: string;
  title: string;
  description: string;
  category: ListingCategory;
  priceCents: number;
  currency: Currency;
  licenseSummary: string;
  tags: string[];
  publishedAt?: number;
  proModule?: ProModuleListingMetadata;
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
  listings: MarketplaceCreatorStorefrontListing[];
}

export interface MarketplaceCatalogListing extends MarketplaceCreatorStorefrontListing {
  creator: {
    id: string;
    displayName: string;
    country: string;
  };
  score: number;
  salesCount: number;
}

export interface MarketplaceCatalogSearchOptions {
  query?: string;
  category?: ListingCategory;
  tag?: string;
  creatorId?: string;
  limit?: number;
  offset?: number;
}

export interface MarketplaceCatalogFacet {
  value: string;
  count: number;
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

export type ReviewSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface ReviewFlag {
  id: string;
  severity: ReviewSeverity;
  reason: string;
  evidence: string;
}

export interface ListingReview {
  id: string;
  listingId: string;
  status: 'passed' | 'human-required' | 'rejected';
  flags: ReviewFlag[];
  humanReviewRequired: boolean;
  createdAt: number;
  reviewerId?: string;
  decisionAt?: number;
}

export interface MarketplaceReviewDashboardItem {
  reviewId: string;
  listingId: string;
  creatorId: string;
  title: string;
  category: ListingCategory;
  priceCents: number;
  currency: Currency;
  status: ListingReview['status'];
  humanReviewRequired: boolean;
  flagCount: number;
  flagIds: string[];
  highestSeverity?: ReviewSeverity;
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

export interface MarketplaceOrder {
  id: string;
  buyerId: string;
  creatorId: string;
  listingId: string;
  grossCents: number;
  platformFeeCents: number;
  creatorNetCents: number;
  currency: Currency;
  createdAt: number;
  payoutId?: string;
  taxRecordId?: string;
  stripeCheckoutSessionId?: string;
  stripePaymentIntentId?: string;
}

export interface MarketplaceEntitlement {
  id: string;
  buyerId: string;
  creatorId: string;
  listingId: string;
  orderId: string;
  category: ListingCategory;
  status: 'active' | 'revoked';
  issuedAt: number;
  proModule?: {
    moduleId: string;
    moduleName: string;
    moduleVersion: string;
    payloadSha256: string;
    signatureKeyId: string;
    mountCount: number;
    entitlementSku: string;
    entitlementGrantKey: string;
    entitlementLicenseTier: string;
  };
  activation: {
    kind: 'greybox-license';
    lookupKey: string;
    licenseHash?: string;
    claimedAt?: number;
  };
}

export interface MarketplaceEntitlementClaimInput {
  lookupKey: string;
  licenseHash: string;
  moduleId?: string;
  entitlementSku?: string;
  entitlementGrantKey?: string;
}

export interface MarketplacePurchaseResult {
  order: MarketplaceOrder;
  payout: PayoutInstruction;
  taxRecord: TaxRecord;
  entitlement?: MarketplaceEntitlement;
}

export interface MarketplacePayoutReleaseResult {
  order: MarketplaceOrder;
  payout: PayoutInstruction;
  previousPayout: PayoutInstruction;
  released: boolean;
  idempotent: boolean;
  releaseBlocker?: {
    code: 'open_dispute' | 'open_refund';
    riskEventId: string;
    amountCents: number;
    reason?: string;
  };
  riskReserveReport?: MarketplaceRiskReserveReport;
}

export interface TaxAddress {
  country: string;
  postalCode?: string;
  state?: string;
  city?: string;
  line1?: string;
  line2?: string;
}

export interface PayoutInstruction {
  id: string;
  orderId: string;
  creatorId: string;
  stripeConnectAccountId: string;
  amountCents: number;
  currency: Currency;
  status: 'queued' | 'sent' | 'blocked';
  reason?: string;
  delivery?: 'manual-transfer' | 'checkout-destination-charge';
  stripeTransferBalanceTransactionId?: string;
  stripeCheckoutSessionId?: string;
  stripePaymentIntentId?: string;
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

export interface CreatorPayoutReadiness {
  creatorId: string;
  status: CreatorPayoutReadinessStatus;
  canReceivePayouts: boolean;
  stripeConnectAccountId?: string;
  taxProfileId?: string;
  requirements: CreatorPayoutRequirement[];
  nextAction?: 'create_stripe_connect_account' | 'complete_stripe_connect_onboarding' | 'collect_tax_profile';
}

export type CreatorPayoutReadinessSafe = Omit<CreatorPayoutReadiness, 'taxProfileId'> & {
  hasTaxProfile: boolean;
};

export interface StripeConnectAccountCreateRequest {
  method: 'POST';
  endpoint: '/v1/accounts';
  idempotencyKey: string;
  body: {
    type: 'express';
    country: string;
    email?: string;
    capabilities: {
      transfers: { requested: true };
    };
    business_profile: {
      product_description: string;
    };
    metadata: {
      greybox_creator_id: string;
    };
  };
}

export interface StripeConnectAccountLinkRequest {
  method: 'POST';
  endpoint: '/v1/account_links';
  idempotencyKey: string;
  body: {
    account: string;
    type: 'account_onboarding';
    refresh_url: string;
    return_url: string;
  };
}

export interface StripeConnectTransferRequest {
  method: 'POST';
  endpoint: '/v1/transfers';
  idempotencyKey: string;
  body: {
    amount: number;
    currency: Currency;
    destination: string;
    transfer_group: string;
    metadata: {
      greybox_order_id: string;
      greybox_creator_id: string;
      greybox_listing_id: string;
    };
  };
}

export interface StripeConnectOnboardingPlan {
  creatorId: string;
  readiness: CreatorPayoutReadiness;
  accountCreateRequest?: StripeConnectAccountCreateRequest;
  accountLinkRequest?: StripeConnectAccountLinkRequest;
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

export interface StripeConnectAccountStatusRecordInput {
  onboardingComplete: boolean;
  transfersEnabled: boolean;
  disabledReason?: string;
  syncedAt?: number;
  actorId?: string;
  actorType?: 'admin' | 'system' | 'webhook';
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

export interface StripeConnectOnboardingLinkResult {
  creator: StripeConnectOnboardingCreatorSummary;
  plan: StripeConnectOnboardingPlan;
  account?: StripeConnectAccountSummary;
  accountLink: StripeConnectAccountLinkSummary;
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

export type MarketplaceCheckoutReadinessStatus = 'ready' | 'blocked';

export interface MarketplaceCheckoutRequirement {
  code:
    | 'published_listing_required'
    | 'creator_active_required'
    | 'stripe_connect_account_required'
    | 'stripe_connect_onboarding_required'
    | 'tax_profile_required';
  message: string;
}

export interface StripeCheckoutMetadata {
  greybox_checkout_reference: string;
  greybox_listing_id: string;
  greybox_creator_id: string;
  greybox_buyer_id: string;
  greybox_category: ListingCategory;
  greybox_pro_module_id?: string;
  greybox_pro_module_version?: string;
}

export interface StripeCheckoutSessionRequest {
  method: 'POST';
  endpoint: '/v1/checkout/sessions';
  idempotencyKey: string;
  body: {
    mode: 'payment';
    success_url: string;
    cancel_url: string;
    client_reference_id: string;
    billing_address_collection: 'auto' | 'required';
    automatic_tax: {
      enabled: true;
      liability: {
        type: 'account';
        account: string;
      };
    };
    line_items: Array<{
      quantity: 1;
      price_data: {
        currency: Currency;
        unit_amount: number;
        tax_behavior: 'exclusive';
        product_data: {
          name: string;
          description: string;
          tax_code: string;
          metadata: StripeCheckoutMetadata;
        };
      };
      metadata: StripeCheckoutMetadata;
    }>;
    metadata: StripeCheckoutMetadata;
    payment_intent_data: {
      application_fee_amount: number;
      on_behalf_of: string;
      transfer_data: {
        destination: string;
      };
      metadata: StripeCheckoutMetadata;
    };
  };
}

export interface MarketplaceCheckoutEntitlementPreview {
  buyerId: string;
  listingId: string;
  category: ListingCategory;
  willIssue: boolean;
  proModule?: {
    moduleId: string;
    moduleName: string;
    moduleVersion: string;
    payloadSha256: string;
    signatureKeyId: string;
    mountCount: number;
    entitlementSku: string;
    entitlementGrantKey: string;
    entitlementLicenseTier: string;
  };
}

export interface MarketplaceCheckoutPlan {
  listingId: string;
  buyerId: string;
  creatorId: string;
  orderPreview: MarketplaceOrder;
  readiness: {
    status: MarketplaceCheckoutReadinessStatus;
    requirements: MarketplaceCheckoutRequirement[];
  };
  checkoutSessionRequest?: StripeCheckoutSessionRequest;
  entitlementPreview?: MarketplaceCheckoutEntitlementPreview;
}

export interface StripeCheckoutSessionSummary {
  id: string;
  url: string;
  livemode?: boolean;
  expiresAt?: number;
  paymentStatus?: string;
}

export interface MarketplaceCheckoutSessionResponse {
  plan: MarketplaceCheckoutPlan;
  checkout: StripeCheckoutSessionSummary;
}

export interface StripeCheckoutCompletedEvent {
  id: string;
  type: 'checkout.session.completed';
  created?: number;
  data: {
    object: StripeCheckoutCompletedSession;
  };
}

export interface StripeCheckoutCompletedSession {
  id: string;
  object: 'checkout.session';
  mode?: string;
  payment_status?: string;
  client_reference_id?: string | null;
  currency?: string | null;
  amount_subtotal?: number | null;
  amount_total?: number | null;
  payment_intent?: string | { id?: string } | null;
  metadata?: Partial<Record<keyof StripeCheckoutMetadata, string>> | null;
  automatic_tax?: {
    enabled?: boolean;
    status?: 'complete' | 'failed' | 'requires_location_inputs' | string | null;
    liability?: {
      type?: 'account' | 'self' | string;
      account?: string | null;
    } | null;
  } | null;
  total_details?: {
    amount_tax?: number | null;
  } | null;
  customer_details?: {
    address?: {
      country?: string | null;
      postal_code?: string | null;
      state?: string | null;
      city?: string | null;
      line1?: string | null;
      line2?: string | null;
    } | null;
    email?: string | null;
  } | null;
}

export interface MarketplaceCheckoutFulfillment {
  stripeEventId: string;
  stripeCheckoutSessionId: string;
  stripePaymentIntentId?: string;
  checkoutReference: string;
  listingId: string;
  creatorId: string;
  buyerId: string;
  currency: Currency;
  amountSubtotalCents: number;
  amountTotalCents?: number;
  taxAmountCents?: number;
  buyerTaxAddress?: TaxAddress;
  automaticTaxStatus?: string;
  automaticTaxLiabilityType?: string;
  automaticTaxLiabilityAccount?: string;
}

export interface MarketplaceCheckoutFulfillmentResult extends MarketplacePurchaseResult {
  stripeEventId: string;
  stripeCheckoutSessionId: string;
  stripePaymentIntentId?: string;
  idempotent: boolean;
}

export interface TaxRecord {
  id: string;
  creatorId: string;
  orderId: string;
  listingId?: string;
  buyerId?: string;
  country: string;
  buyerCountry?: string;
  buyerPostalCode?: string;
  grossCents: number;
  platformFeeCents: number;
  stripeTaxDelegated: boolean;
  requiresTaxProfile: boolean;
  stripeTaxCode?: string;
  stripeTaxCalculationId?: string;
  stripeTaxTransactionId?: string;
  stripeCheckoutSessionId?: string;
  stripePaymentIntentId?: string;
  stripeAutomaticTaxStatus?: string;
  stripeTaxLiabilityType?: string;
  stripeTaxLiabilityAccount?: string;
  taxAmountCents?: number;
  calculationRequest?: StripeTaxCalculationRequest;
  transactionRequest?: StripeTaxTransactionCreateRequest;
  createdAt: number;
}

export interface StripeTaxCalculationRequest {
  method: 'POST';
  endpoint: '/v1/tax/calculations';
  idempotencyKey: string;
  body: {
    currency: Currency;
    customer_details: {
      address: {
        country: string;
        postal_code?: string;
        state?: string;
        city?: string;
        line1?: string;
        line2?: string;
      };
      address_source: 'billing' | 'shipping';
    };
    line_items: Array<{
      reference: string;
      amount: number;
      tax_behavior: 'exclusive' | 'inclusive';
      tax_code: string;
      metadata: {
        greybox_listing_id: string;
        greybox_creator_id: string;
        greybox_buyer_id: string;
        greybox_category: ListingCategory;
      };
    }>;
    metadata: {
      greybox_order_id: string;
      greybox_listing_id: string;
      greybox_creator_id: string;
      greybox_buyer_id: string;
    };
  };
}

export interface StripeTaxTransactionCreateRequest {
  method: 'POST';
  endpoint: '/v1/tax/transactions/create_from_calculation';
  idempotencyKey: string;
  body: {
    calculation: string;
    reference: string;
    metadata: {
      greybox_order_id: string;
      greybox_listing_id: string;
      greybox_creator_id: string;
      greybox_buyer_id: string;
    };
  };
}

export interface MarketplaceTaxPreview {
  listingId: string;
  buyerId: string;
  readiness: {
    status: 'ready' | 'needs-customer-address';
    requirements: string[];
  };
  calculationRequest?: StripeTaxCalculationRequest;
}

export interface MarketplaceStatsPeriod {
  from: number;
  to: number;
  label: string;
}

export interface MarketplaceStats {
  period?: MarketplaceStatsPeriod;
  gmvCents: number;
  platformRevenueCents: number;
  creatorNetCents: number;
  orders: number;
  activeCreatorsWithSales: number;
  publishedListings: number;
}

export interface MarketplaceGrowthTargets {
  monthlyGmvCents: number;
  activeCreatorsWithSales: number;
}

export interface MarketplaceGrowthProgress {
  targets: MarketplaceGrowthTargets;
  period: MarketplaceStatsPeriod;
  stats: MarketplaceStats;
  monthlyGmvProgress: number;
  activeCreatorProgress: number;
  achieved: boolean;
  shortfalls: string[];
}

export interface MarketplaceCreatorActivationTargets extends MarketplaceGrowthTargets {
  minimumActiveCreators: number;
  repeatSellers: number;
  repeatSellerMinimumOrders: number;
}

export interface MarketplaceCreatorActivationCreator {
  creatorId: string;
  displayName?: string;
  country?: string;
  active: boolean;
  orders: number;
  grossCents: number;
  platformFeeCents: number;
  creatorNetCents: number;
  firstSaleAt?: number;
  lastSaleAt?: number;
  publishedListings: number;
  pendingHumanReviews: number;
  payoutStatus: CreatorPayoutReadinessStatus;
  hasStripeConnectAccount: boolean;
  hasTaxProfile: boolean;
}

export interface MarketplaceCreatorActivationShortfall {
  code:
    | 'monthly_gmv_shortfall'
    | 'selling_creator_shortfall'
    | 'active_creator_shortfall'
    | 'repeat_seller_shortfall'
    | 'payout_blockers';
  severity: 'warning' | 'error';
  detail: string;
  remediation?: string;
}

export interface MarketplaceCreatorActivationReport {
  achieved: boolean;
  generatedAt: number;
  period: MarketplaceStatsPeriod;
  targets: MarketplaceCreatorActivationTargets;
  summary: {
    totalCreators: number;
    activeCreators: number;
    inactiveCreators: number;
    sellingCreators: number;
    repeatSellers: number;
    gmvCents: number;
    platformRevenueCents: number;
    creatorNetCents: number;
    orders: number;
    publishedListings: number;
    pendingHumanReviews: number;
    payoutReadyCreators: number;
    payoutBlockedCreators: number;
  };
  creators: MarketplaceCreatorActivationCreator[];
  topCreators: MarketplaceCreatorActivationCreator[];
  shortfalls: MarketplaceCreatorActivationShortfall[];
}

export interface MarketplaceLaunchReadinessTargets extends MarketplaceGrowthTargets {
  minimumPublishedListings: number;
  maximumPendingHumanReviews: number;
  maximumBlockedPayouts: number;
  maximumTaxComplianceIssues: number;
}

export type MarketplaceLaunchReadinessStatus = 'pass' | 'warn' | 'fail';

export interface MarketplaceLaunchReadinessCheck {
  id: string;
  label: string;
  status: MarketplaceLaunchReadinessStatus;
  detail: string;
}

export interface MarketplaceLaunchReadinessIssue {
  code:
    | 'growth_target_not_met'
    | 'published_listing_shortfall'
    | 'human_review_backlog'
    | 'blocked_payouts'
    | 'tax_compliance_issues';
  severity: 'warning' | 'error';
  referenceType: 'stats' | 'listing' | 'review' | 'payout' | 'tax-compliance';
  referenceId: string;
  detail: string;
  remediation?: string;
}

export interface MarketplaceLaunchReadinessReport {
  ready: boolean;
  generatedAt: number;
  targets: MarketplaceLaunchReadinessTargets;
  summary: {
    publishedListings: number;
    pendingHumanReviews: number;
    rejectedListings: number;
    blockedPayouts: number;
    taxComplianceIssues: number;
    activeCreatorsWithSales: number;
    gmvCents: number;
  };
  growth: MarketplaceGrowthProgress;
  checks: MarketplaceLaunchReadinessCheck[];
  issues: MarketplaceLaunchReadinessIssue[];
}

export interface MarketplacePlatformReadinessTargets extends MarketplaceGrowthTargets {
  minimumUniqueBuyers: number;
  minimumPublishedListings: number;
  repeatSellers: number;
  repeatSellerMinimumOrders: number;
  maximumTopCreatorGmvShareBps: number;
  maximumTopBuyerGmvShareBps: number;
  minimumPlatformTakeRateBps: number;
  minimumCheckoutOrderShareBps: number;
  minimumCheckoutGmvShareBps: number;
  minimumSettledPayoutShareBps: number;
  maximumPendingHumanReviews: number;
  maximumBlockedPayouts: number;
  maximumTaxComplianceIssues: number;
  availableReserveCents: number;
  reportedRefundsCents: number;
  reportedDisputeCents: number;
  minimumReserveBps: number;
  minimumReserveCents: number;
  maximumRefundRateBps: number;
  maximumDisputeRateBps: number;
  maximumUnreservedPayoutExposureBps: number;
}

export interface MarketplacePlatformSeller {
  creatorId: string;
  displayName?: string;
  country?: string;
  active: boolean;
  orders: number;
  grossCents: number;
  gmvShareBps: number;
  platformFeeCents: number;
  creatorNetCents: number;
  firstSaleAt?: number;
  lastSaleAt?: number;
  publishedListings: number;
  pendingHumanReviews: number;
  payoutStatus: CreatorPayoutReadinessStatus;
  hasTaxProfile: boolean;
}

export interface MarketplacePlatformReadinessCheck {
  id: string;
  label: string;
  status: MarketplaceLaunchReadinessStatus;
  detail: string;
}

export interface MarketplacePlatformReadinessIssue {
  code:
    | 'marketplace_gmv_shortfall'
    | 'active_seller_shortfall'
    | 'buyer_diversity_shortfall'
    | 'buyer_concentration'
    | 'published_listing_shortfall'
    | 'repeat_seller_shortfall'
    | 'creator_concentration'
    | 'take_rate_floor'
    | 'checkout_coverage_shortfall'
    | 'checkout_gmv_coverage_shortfall'
    | 'settlement_coverage_shortfall'
    | 'human_review_backlog'
    | 'blocked_payouts'
    | 'tax_compliance_issues'
    | 'reconciliation_not_ready'
    | 'risk_reserve_not_ready';
  severity: 'warning' | 'error';
  referenceType: 'stats' | 'creator' | 'buyer' | 'listing' | 'review' | 'order' | 'payout' | 'tax-compliance' | 'reconciliation' | 'settlement';
  referenceId: string;
  detail: string;
  remediation?: string;
}

export interface MarketplacePlatformReadinessReport {
  ready: boolean;
  generatedAt: number;
  period: MarketplaceStatsPeriod;
  targets: MarketplacePlatformReadinessTargets;
  summary: {
    gmvCents: number;
    platformRevenueCents: number;
    creatorNetCents: number;
    orders: number;
    uniqueBuyers: number;
    checkoutOrders: number;
    directOrders: number;
    checkoutGmvCents: number;
    directGmvCents: number;
    activeSellers: number;
    repeatSellers: number;
    publishedListings: number;
    pendingHumanReviews: number;
    blockedPayouts: number;
    taxComplianceIssues: number;
    reconciliationReady: boolean;
    reconciliationIssues: number;
    topCreatorGmvShareBps: number;
    topBuyerGmvShareBps: number;
    platformTakeRateBps: number;
    checkoutOrderShareBps: number;
    checkoutGmvShareBps: number;
    settledPayoutCents: number;
    queuedPayoutCents: number;
    settlementPayoutShareBps: number;
    settlementReady: boolean;
    riskReserveReady: boolean;
    riskReserveIssues: number;
    availableReserveCents: number;
    requiredReserveCents: number;
    reserveShortfallCents: number;
    refundRateBps: number;
    disputeRateBps: number;
  };
  sellers: MarketplacePlatformSeller[];
  topSellers: MarketplacePlatformSeller[];
  checks: MarketplacePlatformReadinessCheck[];
  issues: MarketplacePlatformReadinessIssue[];
}

export interface MarketplaceBusinessModelProofExport {
  marketplace: {
    monthlyGmvUsd: number;
    activeSellers: number;
    uniqueBuyers: number;
    topCreatorGmvShareBps: number;
    topBuyerGmvShareBps: number;
    platformReady: boolean;
    sourceBusinessModelReady: boolean;
    checkoutOrderShareBps: number;
    checkoutGmvShareBps: number;
    settlementReady: boolean;
    settlementPayoutShareBps: number;
    payoutBlockers: number;
    taxBlockers: number;
    reconciliationReady: boolean;
    reconciliationIssues: number;
    riskReserveReady: boolean;
    reserveShortfallCents: number;
  };
  source: {
    report: 'marketplace-platform-readiness';
    generatedAt: number;
    period: MarketplaceStatsPeriod;
    platformReady: boolean;
    checkoutAttributionReady: boolean;
    reconciliationReady: boolean;
    settlementReady: boolean;
    riskReserveReady: boolean;
    taxReady: boolean;
    payoutReady: boolean;
    businessModelReady: boolean;
  };
  disclaimer: string;
}

export type MarketplaceReconciliationStatus = 'pass' | 'warn' | 'fail';

export interface MarketplaceReconciliationCheck {
  id: string;
  label: string;
  status: MarketplaceReconciliationStatus;
  detail: string;
}

export interface MarketplaceReconciliationIssue {
  code: string;
  severity: 'warning' | 'error';
  referenceType: 'order' | 'payout' | 'tax-record' | 'entitlement' | 'creator' | 'listing' | 'stats';
  referenceId: string;
  detail: string;
  remediation?: string;
}

export interface MarketplaceReconciliationReport {
  ready: boolean;
  generatedAt: number;
  period?: {
    from?: number;
    to?: number;
  };
  summary: {
    orders: number;
    checkoutOrders: number;
    directOrders: number;
    gmvCents: number;
    platformRevenueCents: number;
    creatorNetCents: number;
    payoutCents: number;
    blockedPayouts: number;
    taxAmountCents: number;
    entitlementsIssued: number;
    entitlementsClaimed: number;
    creatorsWithSales: number;
  };
  checks: MarketplaceReconciliationCheck[];
  issues: MarketplaceReconciliationIssue[];
}

export interface MarketplaceSettlementPeriod {
  from?: number;
  to?: number;
}

export interface MarketplaceSettlementLine {
  orderId: string;
  creatorId: string;
  creatorDisplayName?: string;
  listingId: string;
  listingTitle?: string;
  category?: ListingCategory;
  buyerId: string;
  createdAt: number;
  currency: Currency;
  grossCents: number;
  platformFeeCents: number;
  creatorNetCents: number;
  payoutId?: string;
  payoutStatus?: PayoutInstruction['status'];
  payoutDelivery?: PayoutInstruction['delivery'];
  payoutCents: number;
  payoutSettlementStatus: 'settled' | 'queued' | 'blocked';
  payoutEvidenceKind?: 'stripe_transfer' | 'checkout_destination_charge';
  payoutEvidenceReceiptId?: string;
  stripeTransferId?: string;
  stripeTransferBalanceTransactionId?: string;
  taxRecordId?: string;
  taxAmountCents: number;
  stripeTaxCalculationId?: string;
  stripeTaxTransactionId?: string;
  stripeCheckoutSessionId?: string;
  stripePaymentIntentId?: string;
}

export interface MarketplaceCreatorSettlement {
  creatorId: string;
  displayName?: string;
  country?: string;
  hasStripeConnectAccount: boolean;
  hasTaxProfile: boolean;
  orders: number;
  grossCents: number;
  platformFeeCents: number;
  creatorNetCents: number;
  payoutCents: number;
  blockedPayouts: number;
  taxAmountCents: number;
}

export interface MarketplaceSettlementReport {
  generatedAt: number;
  period?: MarketplaceSettlementPeriod;
  creatorId?: string;
  summary: {
    orders: number;
    creators: number;
    grossCents: number;
    platformFeeCents: number;
    creatorNetCents: number;
    payoutCents: number;
    settledPayoutCents: number;
    queuedPayoutCents: number;
    blockedPayouts: number;
    taxAmountCents: number;
  };
  creators: MarketplaceCreatorSettlement[];
  lines: MarketplaceSettlementLine[];
}

export interface MarketplaceTaxCompliancePeriod {
  from?: number;
  to?: number;
  year?: number;
}

export interface MarketplaceTaxComplianceOptions extends MarketplaceTaxCompliancePeriod {
  creatorId?: string;
  us1099KGrossThresholdCents?: number;
}

export interface MarketplaceCreatorTaxSummary {
  creatorId: string;
  displayName?: string;
  country?: string;
  hasStripeConnectAccount: boolean;
  hasTaxProfile: boolean;
  orders: number;
  grossCents: number;
  platformFeeCents: number;
  creatorNetCents: number;
  payoutCents: number;
  taxAmountCents: number;
  reportable1099K: boolean;
  missingStripeConnectAccount: boolean;
  missingTaxProfile: boolean;
}

export interface MarketplaceBuyerTaxSummary {
  country: string;
  orders: number;
  grossCents: number;
  taxAmountCents: number;
}

export interface MarketplaceTaxComplianceIssue {
  code:
    | 'creator_tax_profile_missing'
    | 'creator_stripe_connect_account_missing'
    | 'buyer_tax_country_missing'
    | 'stripe_tax_evidence_missing';
  severity: 'warning' | 'error';
  referenceType: 'creator' | 'tax-record' | 'order';
  referenceId: string;
  detail: string;
  remediation?: string;
}

export interface MarketplaceTaxComplianceReport {
  generatedAt: number;
  period?: MarketplaceTaxCompliancePeriod;
  creatorId?: string;
  operationalThresholds: {
    us1099KGrossThresholdCents: number;
  };
  summary: {
    orders: number;
    creators: number;
    reportable1099KCreators: number;
    grossCents: number;
    platformFeeCents: number;
    creatorNetCents: number;
    payoutCents: number;
    taxAmountCents: number;
    missingTaxProfiles: number;
    missingStripeConnectAccounts: number;
    buyerCountries: number;
  };
  creators: MarketplaceCreatorTaxSummary[];
  buyerCountries: MarketplaceBuyerTaxSummary[];
  issues: MarketplaceTaxComplianceIssue[];
}

export interface MarketplaceRiskReserveOptions extends MarketplaceSettlementPeriod {
  availableReserveCents?: number;
  reportedRefundsCents?: number;
  reportedDisputeCents?: number;
  minimumReserveBps?: number;
  minimumReserveCents?: number;
  maximumRefundRateBps?: number;
  maximumDisputeRateBps?: number;
  maximumUnreservedPayoutExposureBps?: number;
}

export interface MarketplaceRiskReserveIssue {
  code:
    | 'reserve_shortfall'
    | 'refund_rate_high'
    | 'dispute_rate_high'
    | 'unreserved_payout_exposure'
    | 'manual_transfer_exposure';
  severity: 'warning' | 'error';
  referenceType: 'stats' | 'payout' | 'order';
  referenceId: string;
  detail: string;
  remediation?: string;
}

export interface MarketplaceRiskReserveCheck {
  id: string;
  label: string;
  status: 'pass' | 'warn' | 'fail';
  detail: string;
}

export interface MarketplaceRiskReserveReport {
  ready: boolean;
  generatedAt: number;
  period?: MarketplaceSettlementPeriod;
  assumptions: Required<Omit<MarketplaceRiskReserveOptions, 'from' | 'to'>>;
  summary: {
    orders: number;
    checkoutOrders: number;
    directOrders: number;
    gmvCents: number;
    creatorNetCents: number;
    queuedOrSentPayoutCents: number;
    availableReserveCents: number;
    requiredReserveCents: number;
    reserveShortfallCents: number;
    reserveCoverageBps: number;
    recordedRefundsCents: number;
    recordedDisputeCents: number;
    reportedRefundsCents: number;
    reportedDisputeCents: number;
    refundRateBps: number;
    disputeRateBps: number;
    manualTransferOrders: number;
  };
  checks: MarketplaceRiskReserveCheck[];
  issues: MarketplaceRiskReserveIssue[];
}

export type MarketplaceRiskEventType = 'refund' | 'dispute';

export type MarketplaceRiskEventStatus = 'open' | 'resolved' | 'lost' | 'won';

export interface MarketplaceRiskEvent {
  id: string;
  type: MarketplaceRiskEventType;
  orderId: string;
  creatorId: string;
  listingId: string;
  amountCents: number;
  currency: Currency;
  status: MarketplaceRiskEventStatus;
  reason?: string;
  stripeRefundId?: string;
  stripeDisputeId?: string;
  refundBlocked?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface MarketplaceRiskEventDraft {
  type: MarketplaceRiskEventType;
  orderId: string;
  amountCents: number;
  status?: MarketplaceRiskEventStatus;
  reason?: string;
  stripeEventId?: string;
  stripeRefundId?: string;
  stripeDisputeId?: string;
  refundBlocked?: boolean;
}

export type MarketplaceEventReceiptKind =
  | 'checkout.session.completed'
  | 'payout'
  | 'refund'
  | 'dispute'
  | 'admin_refund';

export type MarketplaceEventReceiptSource = 'stripe_event' | 'stripe_object' | 'idempotency_key';

export interface MarketplaceEventReceipt {
  id: string;
  kind: MarketplaceEventReceiptKind;
  source: MarketplaceEventReceiptSource;
  receiptKey: string;
  orderId?: string;
  payoutId?: string;
  riskEventId?: string;
  stripeEventId?: string;
  lastStripeEventId?: string;
  stripeTransferId?: string;
  stripeTransferBalanceTransactionId?: string;
  stripeCheckoutSessionId?: string;
  stripePaymentIntentId?: string;
  stripeRefundId?: string;
  stripeDisputeId?: string;
  amountCents?: number;
  status?: string;
  replayCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface MarketplaceStoreSnapshot {
  schemaVersion: 1;
  savedAt: number;
  sequences: {
    listingSeq: number;
    orderSeq: number;
    entitlementSeq: number;
    riskEventSeq?: number;
  };
  creators: Creator[];
  listings: MarketplaceListing[];
  reviews: ListingReview[];
  orders: MarketplaceOrder[];
  entitlements: MarketplaceEntitlement[];
  payouts: PayoutInstruction[];
  taxRecords: TaxRecord[];
  riskEvents?: MarketplaceRiskEvent[];
  eventReceipts?: MarketplaceEventReceipt[];
}

export interface MarketplaceClock {
  now(): number;
}
