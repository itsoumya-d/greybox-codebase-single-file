// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { createHash, randomBytes } from 'node:crypto';

import {
  buildStripeRefundRequest,
  buildStripeConnectOnboardingPlan,
  creatorPayoutReadiness,
  MockStripeConnectProvider,
  type PayoutProvider,
  type RefundProviderResult,
  type StripeConnectOnboardingProvider,
} from '../payouts/stripeConnect.js';
import { assertPriceAllowed, splitOrder } from '../pricing/takeRate.js';
import { publicProModuleListingMetadataFromEnvelope } from '../proModules/listingBoundary.js';
import { createListingReview } from '../review/queue.js';
import { buildMarketplaceTaxPreview, createTaxRecord } from '../tax/taxCompliance.js';
import type {
  MarketplaceAuditAction,
  MarketplaceAuditLog,
  MarketplaceAuditRecord,
} from './auditLog.js';
import { payoutAuditAction } from './auditLog.js';
import {
  buildMarketplaceCheckoutPlan,
  stripeCheckoutFulfillmentFromEvent,
  stripeCheckoutOrderId,
  stripeCheckoutPayoutId,
  stripeCheckoutReferenceFor,
} from '../checkout/stripeCheckout.js';
import type {
  Creator,
  ListingDraft,
  ListingStatus,
  MarketplaceClock,
  MarketplaceCreatorActivationCreator,
  MarketplaceCreatorActivationReport,
  MarketplaceCreatorActivationShortfall,
  MarketplaceCreatorActivationTargets,
  MarketplaceEntitlement,
  MarketplaceEntitlementClaimInput,
  MarketplaceGrowthProgress,
  MarketplaceGrowthTargets,
  MarketplaceLaunchReadinessCheck,
  MarketplaceLaunchReadinessIssue,
  MarketplaceLaunchReadinessReport,
  MarketplaceLaunchReadinessTargets,
  MarketplaceListing,
  MarketplaceOrder,
  MarketplacePlatformReadinessCheck,
  MarketplacePlatformReadinessIssue,
  MarketplacePlatformReadinessReport,
  MarketplacePlatformReadinessTargets,
  MarketplacePlatformSeller,
  MarketplacePayoutReleaseResult,
  MarketplacePurchaseResult,
  MarketplaceReconciliationCheck,
  MarketplaceReconciliationIssue,
  MarketplaceReconciliationReport,
  MarketplaceReviewDashboard,
  MarketplaceReviewDashboardItem,
  MarketplaceRiskReserveCheck,
  MarketplaceRiskReserveIssue,
  MarketplaceRiskReserveOptions,
  MarketplaceRiskReserveReport,
  MarketplaceRiskEvent,
  MarketplaceRiskEventDraft,
  MarketplaceRiskEventStatus,
  MarketplaceRiskEventType,
  MarketplaceEventReceipt,
  MarketplaceEventReceiptKind,
  MarketplaceEventReceiptSource,
  MarketplaceSettlementLine,
  MarketplaceSettlementPeriod,
  MarketplaceSettlementReport,
  MarketplaceStats,
  MarketplaceStatsPeriod,
  MarketplaceStoreSnapshot,
  MarketplaceTaxComplianceIssue,
  MarketplaceTaxComplianceOptions,
  MarketplaceTaxComplianceReport,
  MarketplaceTaxPreview,
  PayoutInstruction,
  TaxAddress,
  CreatorPayoutReadiness,
  MarketplaceCatalogListing,
  MarketplaceCatalogSearchOptions,
  MarketplaceCatalogSearchResult,
  MarketplaceBusinessModelProofExport,
  MarketplaceCreatorStorefront,
  MarketplaceCreatorStorefrontListing,
  CreatorTaxProfileRecordInput,
  CreatorTaxProfileRecordResult,
  StripeConnectAccountStatusRecordInput,
  StripeConnectAccountStatusRecordResult,
  StripeConnectOnboardingPlan,
  StripeConnectOnboardingLinkResult,
  TaxRecord,
  ListingReview,
  ReviewSeverity,
  ListingCategory,
  MarketplaceCheckoutPlan,
  MarketplaceCheckoutFulfillment,
  MarketplaceCheckoutFulfillmentResult,
  StripeCheckoutCompletedEvent,
} from '../types.js';

export interface MarketplacePayoutReservePolicyEnv {
  readonly GREYBOX_MARKETPLACE_PAYOUT_RESERVE_MODE?: string;
  readonly GREYBOX_MARKETPLACE_AVAILABLE_RESERVE_CENTS?: string;
  readonly GREYBOX_MARKETPLACE_REPORTED_REFUNDS_CENTS?: string;
  readonly GREYBOX_MARKETPLACE_REPORTED_DISPUTE_CENTS?: string;
  readonly GREYBOX_MARKETPLACE_MINIMUM_RESERVE_BPS?: string;
  readonly GREYBOX_MARKETPLACE_MINIMUM_RESERVE_CENTS?: string;
  readonly GREYBOX_MARKETPLACE_MAXIMUM_REFUND_RATE_BPS?: string;
  readonly GREYBOX_MARKETPLACE_MAXIMUM_DISPUTE_RATE_BPS?: string;
  readonly GREYBOX_MARKETPLACE_MAXIMUM_UNRESERVED_PAYOUT_EXPOSURE_BPS?: string;
}

export interface MarketplacePayoutReservePolicy extends MarketplaceRiskReserveOptions {
  /**
   * audit records reserve health in readiness reports without changing payout
   * behavior. enforce blocks new payout release when the prospective order
   * would violate configured reserve limits.
   */
  mode?: 'audit' | 'enforce';
}

export interface MarketplacePayoutReleaseInput extends MarketplaceRiskReserveOptions {
  orderId: string;
  actorId?: string;
  actorType?: 'admin' | 'system';
}

export interface MarketplaceStoreOptions {
  clock?: MarketplaceClock;
  payoutProvider?: PayoutProvider;
  stripeConnectOnboardingProvider?: StripeConnectOnboardingProvider;
  payoutReservePolicy?: MarketplacePayoutReservePolicy;
  auditLog?: MarketplaceAuditLog;
  /**
   * Operator-asserted override that allows the store to fall back to the
   * MockStripeConnectProvider in production. Default false: production
   * requires an explicit payoutProvider so no real money is ever moved by
   * accident through the mock implementation.
   */
  allowMockPayoutsInProduction?: boolean;
  /** Env override for unit testing the guard. */
  env?: { readonly NODE_ENV?: string };
}

const ENTITLEMENT_LOOKUP_KEY_PATTERN = /^gbx_ent_[A-Za-z0-9_-]{32}$/u;
const PRO_MODULE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,80}[a-z0-9]$/u;
const PRO_MODULE_SKU_PATTERN = /^gbpro\.[a-z0-9][a-z0-9-]{1,80}[a-z0-9]$/u;
const PRO_MODULE_GRANT_KEY_PATTERN = /^pro-module:[a-z0-9][a-z0-9-]{1,80}[a-z0-9]$/u;
const STRIPE_TRANSFER_ID_PATTERN = /^tr_[A-Za-z0-9_]+$/u;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu;

export class InMemoryMarketplaceStore {
  private readonly creators = new Map<string, Creator>();
  private readonly listings = new Map<string, MarketplaceListing>();
  private readonly reviews = new Map<string, ListingReview>();
  private readonly orders = new Map<string, MarketplaceOrder>();
  private readonly entitlements = new Map<string, MarketplaceEntitlement>();
  private readonly payouts = new Map<string, PayoutInstruction>();
  private readonly taxRecords = new Map<string, TaxRecord>();
  private readonly riskEvents = new Map<string, MarketplaceRiskEvent>();
  private readonly eventReceipts = new Map<string, MarketplaceEventReceipt>();
  private listingSeq = 0;
  private orderSeq = 0;
  private entitlementSeq = 0;
  private riskEventSeq = 0;
  private readonly payoutProvider: PayoutProvider;
  private readonly stripeConnectOnboardingProvider: StripeConnectOnboardingProvider | undefined;
  private readonly payoutReservePolicy: MarketplacePayoutReservePolicy | undefined;

  constructor(private readonly options: MarketplaceStoreOptions = {}) {
    this.payoutReservePolicy = options.payoutReservePolicy
      ? normalizePayoutReservePolicy(options.payoutReservePolicy)
      : undefined;
    const env = options.env ?? process.env;
    const isProduction = (env.NODE_ENV ?? '').toLowerCase() === 'production';
    if (options.payoutProvider) {
      this.payoutProvider = options.payoutProvider;
    } else if (isProduction && options.allowMockPayoutsInProduction !== true) {
      throw new Error(
        'InMemoryMarketplaceStore requires a payoutProvider in NODE_ENV=production. ' +
        'Wire LiveStripeConnectProvider (or another PayoutProvider implementation) ' +
        'via MarketplaceStoreOptions.payoutProvider. Pass ' +
        'allowMockPayoutsInProduction:true only for controlled tests.',
      );
    } else {
      this.payoutProvider = new MockStripeConnectProvider(
        isProduction && options.allowMockPayoutsInProduction === true
          ? { allowInProduction: true, env }
          : { env },
      );
    }
    this.stripeConnectOnboardingProvider = options.stripeConnectOnboardingProvider
      ?? stripeConnectOnboardingProviderFrom(this.payoutProvider);
  }

  snapshot(): MarketplaceStoreSnapshot {
    return {
      schemaVersion: 1,
      savedAt: this.now(),
      sequences: {
        listingSeq: this.listingSeq,
        orderSeq: this.orderSeq,
        entitlementSeq: this.entitlementSeq,
        riskEventSeq: this.riskEventSeq,
      },
      creators: sortedValues(this.creators),
      listings: sortedValues(this.listings),
      reviews: sortedValues(this.reviews),
      orders: sortedValues(this.orders),
      entitlements: sortedValues(this.entitlements),
      payouts: sortedValues(this.payouts),
      taxRecords: sortedValues(this.taxRecords),
      riskEvents: sortedValues(this.riskEvents),
      eventReceipts: sortedValues(this.eventReceipts),
    };
  }

  restoreSnapshot(snapshot: MarketplaceStoreSnapshot, options: { audit?: boolean } = {}): this {
    if (snapshot.schemaVersion !== 1) throw new Error('unsupported marketplace snapshot schema');
    this.creators.clear();
    this.listings.clear();
    this.reviews.clear();
    this.orders.clear();
    this.entitlements.clear();
    this.payouts.clear();
    this.taxRecords.clear();
    this.riskEvents.clear();
    this.eventReceipts.clear();
    for (const creator of snapshot.creators) this.creators.set(creator.id, clone(creator));
    for (const listing of snapshot.listings) this.listings.set(listing.id, clone(listing));
    for (const review of snapshot.reviews) this.reviews.set(review.id, clone(review));
    for (const order of snapshot.orders) this.orders.set(order.id, clone(order));
    for (const entitlement of snapshot.entitlements) this.entitlements.set(entitlement.id, clone(entitlement));
    for (const payout of snapshot.payouts) this.payouts.set(payout.id, clone(payout));
    for (const taxRecord of snapshot.taxRecords) this.taxRecords.set(taxRecord.id, clone(taxRecord));
    for (const riskEvent of snapshot.riskEvents ?? []) this.riskEvents.set(riskEvent.id, clone(riskEvent));
    for (const receipt of snapshot.eventReceipts ?? []) this.eventReceipts.set(receipt.id, clone(receipt));
    this.listingSeq = snapshot.sequences.listingSeq;
    this.orderSeq = snapshot.sequences.orderSeq;
    this.entitlementSeq = snapshot.sequences.entitlementSeq;
    this.riskEventSeq = snapshot.sequences.riskEventSeq ?? inferRiskEventSeq(snapshot.riskEvents ?? []);
    if (options.audit !== false) {
      this.audit('snapshot.imported', {
        actorId: 'system',
        actorType: 'system',
        entityType: 'snapshot',
        entityId: 'marketplace-store',
        metadata: {
          creators: snapshot.creators.length,
          listings: snapshot.listings.length,
          orders: snapshot.orders.length,
          payouts: snapshot.payouts.length,
          riskEvents: snapshot.riskEvents?.length ?? 0,
          eventReceipts: snapshot.eventReceipts?.length ?? 0,
        },
      });
    }
    return this;
  }

  upsertCreator(creator: Creator): Creator {
    const existing = this.creators.get(creator.id);
    this.creators.set(creator.id, creator);
    this.audit(existing ? 'creator.updated' : 'creator.registered', {
      actorId: 'system',
      actorType: 'system',
      entityType: 'creator',
      entityId: creator.id,
      metadata: {
        active: creator.active,
        country: creator.country,
      },
    });
    return creator;
  }

  creator(id: string): Creator | undefined {
    return this.creators.get(id);
  }

  order(id: string): MarketplaceOrder | undefined {
    const order = this.orders.get(id);
    return order ? clone(order) : undefined;
  }

  orderByStripePaymentIntent(paymentIntentId: string): MarketplaceOrder | undefined {
    const trimmed = paymentIntentId.trim();
    if (!trimmed) return undefined;
    for (const order of this.orders.values()) {
      if (order.stripePaymentIntentId === trimmed) return clone(order);
    }
    return undefined;
  }

  payoutReadiness(creatorId: string): CreatorPayoutReadiness {
    const creator = this.creators.get(creatorId);
    if (!creator) throw new Error('creator not found');
    return creatorPayoutReadiness(creator);
  }

  stripeConnectOnboardingPlan(
    creatorId: string,
    input: { returnUrl: string; refreshUrl: string },
  ): StripeConnectOnboardingPlan {
    const creator = this.creators.get(creatorId);
    if (!creator) throw new Error('creator not found');
    return buildStripeConnectOnboardingPlan(creator, input);
  }

  async createStripeConnectOnboardingLink(
    creatorId: string,
    input: { returnUrl: string; refreshUrl: string },
  ): Promise<StripeConnectOnboardingLinkResult> {
    const provider = this.stripeConnectOnboardingProvider;
    if (!provider) {
      throw new Error('Stripe Connect onboarding provider is not configured');
    }
    let creator = this.creators.get(creatorId);
    if (!creator) throw new Error('creator not found');
    if (!creator.active) throw new Error('active creator required');

    const account = !creator.stripeConnectAccountId
      ? await provider.createAccount(creator)
      : undefined;
    if (account) {
      creator = {
        ...creator,
        stripeConnectAccountId: account.stripeConnectAccountId,
        stripeConnectOnboardingComplete: account.onboardingComplete ?? false,
        stripeConnectTransfersEnabled: account.transfersEnabled ?? false,
        ...(account.disabledReason ? { stripeConnectDisabledReason: account.disabledReason } : {}),
        stripeConnectStatusSyncedAt: this.now(),
      };
      this.creators.set(creator.id, creator);
      this.audit('creator.stripe_connect_account_created', {
        actorId: 'system',
        actorType: 'system',
        entityType: 'creator',
        entityId: creator.id,
        metadata: {
          stripeConnectAccountPresent: true,
          livemode: account.livemode ?? false,
          onboardingComplete: creator.stripeConnectOnboardingComplete === true,
          transfersEnabled: creator.stripeConnectTransfersEnabled === true,
          hasDisabledReason: Boolean(creator.stripeConnectDisabledReason),
        },
      });
    }

    const accountLink = await provider.createAccountLink(creator, input);
    const plan = buildStripeConnectOnboardingPlan(creator, input);
    this.audit('creator.stripe_connect_onboarding_link.created', {
      actorId: 'system',
      actorType: 'system',
      entityType: 'creator',
      entityId: creator.id,
      metadata: {
        accountCreated: Boolean(account),
        readinessStatus: plan.readiness.status,
        requirements: plan.readiness.requirements.map((requirement) => requirement.code),
        hasTaxProfile: Boolean(creator.taxProfileId),
      },
    });

    return {
      creator: stripeConnectOnboardingCreatorSummary(creator),
      plan,
      ...(account ? { account } : {}),
      accountLink,
    };
  }

  recordCreatorTaxProfile(
    creatorId: string,
    input: CreatorTaxProfileRecordInput,
  ): CreatorTaxProfileRecordResult {
    const creator = this.creators.get(creatorId);
    if (!creator) throw new Error('creator not found');
    if (!creator.active) throw new Error('active creator required');
    const taxProfileId = normalizeTaxProfileId(input.taxProfileId);
    const provider = normalizeTaxProfileProvider(input.provider);
    const collectedAt = normalizeTaxProfileCollectedAt(input.collectedAt ?? this.now());
    const country = normalizeTaxProfileCountry(input.country ?? creator.country);
    const wasPresent = Boolean(creator.taxProfileId);
    const next: Creator = {
      ...creator,
      taxProfileId,
      taxProfileProvider: provider,
      taxProfileCollectedAt: collectedAt,
    };
    this.creators.set(next.id, next);
    const readiness = creatorPayoutReadiness(next);
    this.audit('creator.tax_profile.recorded', {
      actorId: input.actorId ?? 'system',
      actorType: input.actorType ?? 'admin',
      entityType: 'creator',
      entityId: next.id,
      metadata: {
        provider,
        country,
        collectedAt,
        referencePresent: true,
        replacedExistingReference: wasPresent,
        readinessStatus: readiness.status,
        requirements: readiness.requirements.map((requirement) => requirement.code),
      },
    });
    return {
      creator: stripeConnectOnboardingCreatorSummary(next),
      readiness: safeCreatorPayoutReadiness(readiness, true),
      taxProfile: {
        referencePresent: true,
        provider,
        country,
        collectedAt,
      },
    };
  }

  recordStripeConnectAccountStatus(
    creatorId: string,
    input: StripeConnectAccountStatusRecordInput,
  ): StripeConnectAccountStatusRecordResult {
    const creator = this.creators.get(creatorId);
    if (!creator) throw new Error('creator not found');
    if (!creator.active) throw new Error('active creator required');
    if (!creator.stripeConnectAccountId) throw new Error('Stripe Connect account required before recording account status');
    const syncedAt = normalizeStripeConnectStatusSyncedAt(input.syncedAt ?? this.now());
    const disabledReason = normalizeStripeConnectDisabledReason(input.disabledReason);
    const baseNext: Creator = {
      ...creator,
      stripeConnectOnboardingComplete: input.onboardingComplete,
      stripeConnectTransfersEnabled: input.transfersEnabled,
      stripeConnectStatusSyncedAt: syncedAt,
    };
    if (!disabledReason) delete baseNext.stripeConnectDisabledReason;
    const next: Creator = disabledReason
      ? { ...baseNext, stripeConnectDisabledReason: disabledReason }
      : baseNext;
    this.creators.set(next.id, next);
    const readiness = creatorPayoutReadiness(next);
    this.audit('creator.stripe_connect_status.updated', {
      actorId: input.actorId ?? 'system',
      actorType: input.actorType ?? 'system',
      entityType: 'creator',
      entityId: next.id,
      metadata: {
        onboardingComplete: next.stripeConnectOnboardingComplete === true,
        transfersEnabled: next.stripeConnectTransfersEnabled === true,
        hasDisabledReason: Boolean(next.stripeConnectDisabledReason),
        syncedAt,
        readinessStatus: readiness.status,
        requirements: readiness.requirements.map((requirement) => requirement.code),
      },
    });
    return {
      creator: stripeConnectOnboardingCreatorSummary(next),
      readiness: safeCreatorPayoutReadiness(readiness, Boolean(next.taxProfileId)),
      accountStatus: {
        onboardingComplete: next.stripeConnectOnboardingComplete === true,
        transfersEnabled: next.stripeConnectTransfersEnabled === true,
        ...(next.stripeConnectDisabledReason ? { disabledReason: next.stripeConnectDisabledReason } : {}),
        syncedAt,
      },
    };
  }

  submitListing(draft: ListingDraft, context: {
    creatorRankByGmv?: number;
    creatorCount?: number;
  } = {}): { listing: MarketplaceListing; review: ListingReview } {
    const creator = this.creators.get(draft.creatorId);
    if (!creator?.active) throw new Error('active creator required');
    assertPriceAllowed(draft.category, draft.priceCents);
    const proModule = draft.proModule
      ? publicProModuleListingMetadataFromEnvelope(draft.proModule)
      : undefined;
    if (draft.category === 'pro-module' && !proModule) {
      throw new Error('pro-module listings require signed public bundle metadata');
    }
    if (draft.category !== 'pro-module' && proModule) {
      throw new Error('Pro module metadata is only allowed on pro-module listings');
    }
    const now = this.now();
    const listing: MarketplaceListing = {
      id: `listing-${++this.listingSeq}`,
      creatorId: draft.creatorId,
      title: draft.title.trim(),
      description: draft.description.trim(),
      category: draft.category,
      priceCents: draft.priceCents,
      currency: draft.currency ?? 'usd',
      licenseSummary: draft.licenseSummary.trim(),
      tags: draft.tags ?? [],
      status: 'pending-auto-review',
      createdAt: now,
      updatedAt: now,
      ...(proModule ? { proModule } : {}),
    };
    const review = createListingReview(listing, draft, {
      now,
      ...this.creatorReviewContext(creator.id, context),
    });
    const status: ListingStatus = review.status === 'passed'
      ? 'published'
      : review.status === 'rejected'
        ? 'rejected'
        : 'pending-human-review';
    const nextListing: MarketplaceListing = {
      ...listing,
      status,
      reviewId: review.id,
      updatedAt: now,
      ...(status === 'published' ? { publishedAt: now } : {}),
    };
    this.listings.set(nextListing.id, nextListing);
    this.reviews.set(review.id, review);
    this.audit('listing.created', {
      actorId: creator.id,
      actorType: 'creator',
      entityType: 'listing',
      entityId: nextListing.id,
      metadata: {
        category: nextListing.category,
        priceCents: nextListing.priceCents,
        status: nextListing.status,
      },
    });
    this.audit('review.submitted', {
      actorId: 'system',
      actorType: 'system',
      entityType: 'review',
      entityId: review.id,
      metadata: {
        listingId: nextListing.id,
        status: review.status,
        humanReviewRequired: review.humanReviewRequired,
      },
    });
    if (nextListing.status === 'published') {
      this.audit('listing.published', {
        actorId: 'system',
        actorType: 'system',
        entityType: 'listing',
        entityId: nextListing.id,
        metadata: { reviewId: review.id },
      });
    }
    return { listing: nextListing, review };
  }

  approveReview(reviewId: string, reviewerId: string): MarketplaceListing {
    const review = this.reviews.get(reviewId);
    if (!review) throw new Error('review not found');
    if (review.status === 'rejected') {
      throw new Error('rejected listing reviews cannot be approved; creator must resubmit a clean listing');
    }
    const listing = this.listings.get(review.listingId);
    if (!listing) throw new Error('listing not found');
    const now = this.now();
    this.reviews.set(reviewId, {
      ...review,
      status: 'passed',
      humanReviewRequired: false,
      reviewerId,
      decisionAt: now,
    });
    const next = {
      ...listing,
      status: 'published' as const,
      updatedAt: now,
      publishedAt: listing.publishedAt ?? now,
    };
    this.listings.set(next.id, next);
    this.audit('listing.published', {
      actorId: reviewerId,
      actorType: 'admin',
      entityType: 'listing',
      entityId: next.id,
      metadata: { reviewId },
    });
    return next;
  }

  async purchaseListing(input: {
    listingId: string;
    buyerId: string;
    buyerTaxAddress?: TaxAddress;
    stripeTaxCalculationId?: string;
    stripeTaxTransactionId?: string;
    taxAmountCents?: number;
  }): Promise<MarketplacePurchaseResult> {
    const listing = this.listings.get(input.listingId);
    if (!listing || listing.status !== 'published') throw new Error('published listing required');
    const creator = this.creators.get(listing.creatorId);
    if (!creator) throw new Error('creator not found');
    const order = splitOrder({
      orderId: `order-${++this.orderSeq}`,
      buyerId: input.buyerId,
      creatorId: creator.id,
      listingId: listing.id,
      grossCents: listing.priceCents,
      creatorMonthlyGmvCents: creator.monthlyGmvCents,
      createdAt: this.now(),
    });
    const taxRecord = createTaxRecord(order, creator, {
      listing,
      ...(input.buyerTaxAddress ? { buyerTaxAddress: input.buyerTaxAddress } : {}),
      ...(input.stripeTaxCalculationId ? { stripeTaxCalculationId: input.stripeTaxCalculationId } : {}),
      ...(input.stripeTaxTransactionId ? { stripeTaxTransactionId: input.stripeTaxTransactionId } : {}),
      ...(input.taxAmountCents !== undefined ? { taxAmountCents: input.taxAmountCents } : {}),
    });
    const payout = this.reserveBlockedPayout(order, creator, 'manual-transfer')
      ?? await this.payoutProvider.createTransfer(order, creator);
    const finalOrder: MarketplaceOrder = {
      ...order,
      payoutId: payout.id,
      taxRecordId: taxRecord.id,
    };
    const entitlement = this.createEntitlement(finalOrder, listing);
    this.orders.set(finalOrder.id, finalOrder);
    if (entitlement) this.entitlements.set(entitlement.id, entitlement);
    this.payouts.set(payout.id, payout);
    this.taxRecords.set(taxRecord.id, taxRecord);
    this.creators.set(creator.id, {
      ...creator,
      monthlyGmvCents: creator.monthlyGmvCents + order.grossCents,
      lifetimeGmvCents: creator.lifetimeGmvCents + order.grossCents,
    });
    this.recordPayoutReceiptIfSettlementReady(finalOrder, payout);
    this.auditOrderMutation(finalOrder, payout, entitlement, 'buyer');
    return {
      order: finalOrder,
      payout,
      taxRecord,
      ...(entitlement ? { entitlement } : {}),
    };
  }

  async releaseBlockedPayout(input: MarketplacePayoutReleaseInput): Promise<MarketplacePayoutReleaseResult> {
    const order = this.orders.get(input.orderId);
    if (!order) throw new Error('order not found');
    if (!order.payoutId) throw new Error('order does not reference a payout');
    const previousPayout = this.payouts.get(order.payoutId);
    if (!previousPayout) throw new Error('payout not found');
    if (previousPayout.status !== 'blocked') {
      const reservePayout = this.findRiskReserveBlockedPayoutForOrder(order, previousPayout);
      if (reservePayout) {
        this.recordPayoutReceiptIfSettlementReady(order, previousPayout);
        return {
          order,
          payout: previousPayout,
          previousPayout: reservePayout,
          released: true,
          idempotent: true,
        };
      }
      throw new Error('payout is not blocked');
    }
    if (!isRiskReserveBlockedPayout(previousPayout)) {
      throw new Error('payout is not blocked by marketplace reserve');
    }

    const openPayoutRisk = this.openPayoutRiskEventForOrder(order.id);
    if (openPayoutRisk) {
      return {
        order,
        payout: previousPayout,
        previousPayout,
        released: false,
        idempotent: false,
        releaseBlocker: payoutReleaseBlockerFromRiskEvent(openPayoutRisk),
      };
    }

    const report = this.buildRiskReserveReport(riskReserveOptionsFromPayoutReleaseInput(input));
    if (!report.ready) {
      return {
        order,
        payout: previousPayout,
        previousPayout,
        released: false,
        idempotent: false,
        riskReserveReport: report,
      };
    }

    const creator = this.creators.get(order.creatorId);
    if (!creator) throw new Error('creator not found');
    const payout = previousPayout.delivery === 'checkout-destination-charge'
      ? this.releaseCheckoutDestinationChargePayout(order, creator)
      : await this.payoutProvider.createTransfer(order, creator);
    const nextOrder = {
      ...order,
      payoutId: payout.id,
    };
    this.orders.set(nextOrder.id, nextOrder);
    this.payouts.set(payout.id, payout);
    this.recordPayoutReceiptIfSettlementReady(nextOrder, payout);
    this.audit(payoutAuditAction(payout), {
      actorId: input.actorId ?? 'system',
      actorType: input.actorType ?? 'system',
      entityType: 'payout',
      entityId: payout.id,
      metadata: {
        orderId: nextOrder.id,
        creatorId: payout.creatorId,
        amountCents: payout.amountCents,
        status: payout.status,
        releasedFromPayoutId: previousPayout.id,
        ...(payout.delivery ? { delivery: payout.delivery } : {}),
      },
    });
    return {
      order: nextOrder,
      payout,
      previousPayout,
      released: payout.status !== 'blocked',
      idempotent: false,
      riskReserveReport: report,
    };
  }

  private openPayoutRiskEventForOrder(orderId: string): MarketplaceRiskEvent | undefined {
    return [...this.riskEvents.values()]
      .filter((event) => (
        event.orderId === orderId
        && event.status === 'open'
        && (
          event.type === 'dispute'
          || (event.type === 'refund' && refundRiskEventCountsAgainstOrder(event))
        )
      ))
      .sort((a, b) => (
        payoutRiskEventPriority(a) - payoutRiskEventPriority(b)
        || b.updatedAt - a.updatedAt
        || a.id.localeCompare(b.id)
      ))
      .at(0);
  }

  private findRiskReserveBlockedPayoutForOrder(
    order: MarketplaceOrder,
    currentPayout: PayoutInstruction,
  ): PayoutInstruction | undefined {
    return [...this.payouts.values()].find((payout) => (
      payout.id !== currentPayout.id
      && payout.orderId === order.id
      && payout.amountCents === currentPayout.amountCents
      && payout.currency === currentPayout.currency
      && payout.status === 'blocked'
      && isRiskReserveBlockedPayout(payout)
    ));
  }

  taxPreview(input: {
    listingId: string;
    buyerId: string;
    buyerTaxAddress?: TaxAddress;
  }): MarketplaceTaxPreview {
    const listing = this.listings.get(input.listingId);
    if (!listing || listing.status !== 'published') throw new Error('published listing required');
    return buildMarketplaceTaxPreview({
      listing,
      buyerId: input.buyerId,
      ...(input.buyerTaxAddress ? { buyerTaxAddress: input.buyerTaxAddress } : {}),
    });
  }

  checkoutPlan(input: {
    listingId: string;
    buyerId: string;
    successUrl: string;
    cancelUrl: string;
  }): MarketplaceCheckoutPlan {
    const listing = this.listings.get(input.listingId);
    if (!listing) throw new Error('listing not found');
    const creator = this.creators.get(listing.creatorId);
    if (!creator) throw new Error('creator not found');
    return buildMarketplaceCheckoutPlan({
      listing,
      creator,
      buyerId: input.buyerId,
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
      now: this.now(),
    });
  }

  async fulfillCheckoutSession(event: StripeCheckoutCompletedEvent): Promise<MarketplaceCheckoutFulfillmentResult> {
    const fulfillment = stripeCheckoutFulfillmentFromEvent(event);
    const orderId = stripeCheckoutOrderId(fulfillment.stripeCheckoutSessionId);
    const existing = this.orders.get(orderId);
    if (existing) {
      this.assertCheckoutReplayMatchesOrder(existing, fulfillment);
      this.recordEventReceipt({
        kind: 'checkout.session.completed',
        source: 'stripe_object',
        receiptKey: fulfillment.stripeCheckoutSessionId,
        orderId: existing.id,
        stripeEventId: fulfillment.stripeEventId,
        stripeCheckoutSessionId: fulfillment.stripeCheckoutSessionId,
        ...(fulfillment.stripePaymentIntentId ? { stripePaymentIntentId: fulfillment.stripePaymentIntentId } : {}),
        amountCents: existing.grossCents,
        status: 'replayed',
      });
      const existingPayout = existing.payoutId ? this.payouts.get(existing.payoutId) : undefined;
      if (existingPayout) this.recordPayoutReceiptIfSettlementReady(existing, existingPayout, fulfillment.stripeEventId);
      return this.checkoutResultForOrder(existing, fulfillment, true);
    }
    const listing = this.listings.get(fulfillment.listingId);
    if (!listing || listing.status !== 'published') throw new Error('published listing required');
    if (listing.creatorId !== fulfillment.creatorId) throw new Error('Checkout metadata creator does not match listing');
    if (listing.currency !== fulfillment.currency) throw new Error('Checkout currency does not match listing');
    if (listing.priceCents !== fulfillment.amountSubtotalCents) throw new Error('Checkout subtotal does not match listing price');
    if (fulfillment.amountTotalCents !== undefined && fulfillment.amountTotalCents < fulfillment.amountSubtotalCents) {
      throw new Error('Checkout total cannot be lower than subtotal');
    }
    if (fulfillment.checkoutReference !== stripeCheckoutReferenceFor(listing.id, fulfillment.buyerId)) {
      throw new Error('Checkout client reference does not match listing and buyer');
    }
    const creator = this.creators.get(listing.creatorId);
    if (!creator) throw new Error('creator not found');
    this.assertCheckoutTaxLiabilityMatchesCreator(fulfillment, creator);
    const order = splitOrder({
      orderId,
      buyerId: fulfillment.buyerId,
      creatorId: creator.id,
      listingId: listing.id,
      grossCents: listing.priceCents,
      creatorMonthlyGmvCents: creator.monthlyGmvCents,
      createdAt: this.now(),
    });
    const payout = this.checkoutDestinationChargePayout({
      ...order,
      stripeCheckoutSessionId: fulfillment.stripeCheckoutSessionId,
      ...(fulfillment.stripePaymentIntentId ? { stripePaymentIntentId: fulfillment.stripePaymentIntentId } : {}),
    }, creator, fulfillment);
    const taxRecord = createTaxRecord(order, creator, {
      listing,
      ...(fulfillment.buyerTaxAddress ? { buyerTaxAddress: fulfillment.buyerTaxAddress } : {}),
      ...(fulfillment.taxAmountCents !== undefined ? { taxAmountCents: fulfillment.taxAmountCents } : {}),
      stripeCheckoutSessionId: fulfillment.stripeCheckoutSessionId,
      ...(fulfillment.stripePaymentIntentId ? { stripePaymentIntentId: fulfillment.stripePaymentIntentId } : {}),
      ...(fulfillment.automaticTaxStatus ? { stripeAutomaticTaxStatus: fulfillment.automaticTaxStatus } : {}),
      ...(fulfillment.automaticTaxLiabilityType ? { stripeTaxLiabilityType: fulfillment.automaticTaxLiabilityType } : {}),
      ...(fulfillment.automaticTaxLiabilityAccount ? { stripeTaxLiabilityAccount: fulfillment.automaticTaxLiabilityAccount } : {}),
    });
    const finalOrder: MarketplaceOrder = {
      ...order,
      payoutId: payout.id,
      taxRecordId: taxRecord.id,
      stripeCheckoutSessionId: fulfillment.stripeCheckoutSessionId,
      ...(fulfillment.stripePaymentIntentId ? { stripePaymentIntentId: fulfillment.stripePaymentIntentId } : {}),
    };
    const entitlement = this.createEntitlement(finalOrder, listing);
    this.orders.set(finalOrder.id, finalOrder);
    if (entitlement) this.entitlements.set(entitlement.id, entitlement);
    this.payouts.set(payout.id, payout);
    this.taxRecords.set(taxRecord.id, taxRecord);
    this.creators.set(creator.id, {
      ...creator,
      monthlyGmvCents: creator.monthlyGmvCents + order.grossCents,
      lifetimeGmvCents: creator.lifetimeGmvCents + order.grossCents,
    });
    this.recordEventReceipt({
      kind: 'checkout.session.completed',
      source: 'stripe_object',
      receiptKey: fulfillment.stripeCheckoutSessionId,
      orderId: finalOrder.id,
      stripeEventId: fulfillment.stripeEventId,
      stripeCheckoutSessionId: fulfillment.stripeCheckoutSessionId,
      ...(fulfillment.stripePaymentIntentId ? { stripePaymentIntentId: fulfillment.stripePaymentIntentId } : {}),
      amountCents: finalOrder.grossCents,
      status: 'fulfilled',
    });
    this.recordPayoutReceiptIfSettlementReady(finalOrder, payout, fulfillment.stripeEventId);
    this.auditOrderMutation(finalOrder, payout, entitlement, 'webhook', {
      source: 'stripe-checkout',
      hasStripeCheckoutSession: true,
      hasStripePaymentIntent: Boolean(fulfillment.stripePaymentIntentId),
    });
    return {
      order: finalOrder,
      payout,
      taxRecord,
      ...(entitlement ? { entitlement } : {}),
      stripeEventId: fulfillment.stripeEventId,
      stripeCheckoutSessionId: fulfillment.stripeCheckoutSessionId,
      ...(fulfillment.stripePaymentIntentId ? { stripePaymentIntentId: fulfillment.stripePaymentIntentId } : {}),
      idempotent: false,
    };
  }

  stats(period?: MarketplaceStatsPeriod): MarketplaceStats {
    const orders = this.ordersInPeriod(period ?? {});
    const activeCreatorsWithSales = new Set(orders.map((order) => order.creatorId)).size;
    return {
      ...(period ? { period } : {}),
      gmvCents: orders.reduce((sum, order) => sum + order.grossCents, 0),
      platformRevenueCents: orders.reduce((sum, order) => sum + order.platformFeeCents, 0),
      creatorNetCents: orders.reduce((sum, order) => sum + order.creatorNetCents, 0),
      orders: orders.length,
      activeCreatorsWithSales,
      publishedListings: [...this.listings.values()].filter((listing) => listing.status === 'published').length,
    };
  }

  growthProgress(targets: MarketplaceGrowthTargets = {
    monthlyGmvCents: 2_500_000,
    activeCreatorsWithSales: 50,
  }): MarketplaceGrowthProgress {
    const period = currentUtcMonthPeriod(this.now());
    const stats = this.stats(period);
    const monthlyGmvProgress = targets.monthlyGmvCents > 0
      ? Math.min(1, stats.gmvCents / targets.monthlyGmvCents)
      : 1;
    const activeCreatorProgress = targets.activeCreatorsWithSales > 0
      ? Math.min(1, stats.activeCreatorsWithSales / targets.activeCreatorsWithSales)
      : 1;
    const shortfalls: string[] = [];
    if (stats.gmvCents < targets.monthlyGmvCents) {
      shortfalls.push(`monthly GMV needs ${targets.monthlyGmvCents - stats.gmvCents} more cents`);
    }
    if (stats.activeCreatorsWithSales < targets.activeCreatorsWithSales) {
      shortfalls.push(`creator supply needs ${targets.activeCreatorsWithSales - stats.activeCreatorsWithSales} more sellers with a sale`);
    }
    return {
      targets,
      period,
      stats,
      monthlyGmvProgress,
      activeCreatorProgress,
      achieved: shortfalls.length === 0,
      shortfalls,
    };
  }

  creatorActivationReport(
    targetOverrides: Partial<MarketplaceCreatorActivationTargets> = {},
  ): MarketplaceCreatorActivationReport {
    const targets = creatorActivationTargets(targetOverrides);
    const period = currentUtcMonthPeriod(this.now());
    const orders = this.ordersInPeriod(period);
    const ordersByCreator = ordersByCreatorId(orders);
    const publishedListingsByCreator = new Map<string, number>();
    const pendingHumanReviewsByCreator = new Map<string, number>();

    for (const listing of this.listings.values()) {
      if (listing.status === 'published') {
        increment(publishedListingsByCreator, listing.creatorId);
      }
    }
    for (const review of this.reviews.values()) {
      if (review.status !== 'human-required' || !review.humanReviewRequired) continue;
      const listing = this.listings.get(review.listingId);
      if (listing) increment(pendingHumanReviewsByCreator, listing.creatorId);
    }

    const creators = [...this.creators.values()]
      .map((creator) => creatorActivationCreator({
        creator,
        orders: ordersByCreator.get(creator.id) ?? [],
        publishedListings: publishedListingsByCreator.get(creator.id) ?? 0,
        pendingHumanReviews: pendingHumanReviewsByCreator.get(creator.id) ?? 0,
      }))
      .sort(creatorActivationSort);
    const sellingCreators = creators.filter((creator) => creator.orders > 0).length;
    const repeatSellers = creators.filter((creator) => creator.orders >= targets.repeatSellerMinimumOrders).length;
    const payoutBlockedCreators = creators
      .filter((creator) => creator.orders > 0 && creator.payoutStatus !== 'ready').length;
    const summary = {
      totalCreators: creators.length,
      activeCreators: creators.filter((creator) => creator.active).length,
      inactiveCreators: creators.filter((creator) => !creator.active).length,
      sellingCreators,
      repeatSellers,
      gmvCents: sum(creators, 'grossCents'),
      platformRevenueCents: sum(creators, 'platformFeeCents'),
      creatorNetCents: sum(creators, 'creatorNetCents'),
      orders: orders.length,
      publishedListings: [...this.listings.values()].filter((listing) => listing.status === 'published').length,
      pendingHumanReviews: [...pendingHumanReviewsByCreator.values()].reduce((total, count) => total + count, 0),
      payoutReadyCreators: creators.filter((creator) => creator.active && creator.payoutStatus === 'ready').length,
      payoutBlockedCreators,
    };
    const shortfalls = creatorActivationShortfalls(summary, targets);
    return {
      achieved: shortfalls.length === 0,
      generatedAt: this.now(),
      period,
      targets,
      summary,
      creators,
      topCreators: creators.filter((creator) => creator.orders > 0).slice(0, 10),
      shortfalls,
    };
  }

  platformReadiness(
    targetOverrides: Partial<MarketplacePlatformReadinessTargets> = {},
  ): MarketplacePlatformReadinessReport {
    const targets = platformReadinessTargets(targetOverrides);
    const period = currentUtcMonthPeriod(this.now());
    const orders = this.ordersInPeriod(period);
    const ordersByCreator = ordersByCreatorId(orders);
    const publishedListingsByCreator = new Map<string, number>();
    const pendingHumanReviewsByCreator = new Map<string, number>();

    for (const listing of this.listings.values()) {
      if (listing.status === 'published') {
        increment(publishedListingsByCreator, listing.creatorId);
      }
    }
    for (const review of this.reviews.values()) {
      if (review.status !== 'human-required' || !review.humanReviewRequired) continue;
      const listing = this.listings.get(review.listingId);
      if (listing) increment(pendingHumanReviewsByCreator, listing.creatorId);
    }

    const totalGmvCents = orders.reduce((total, order) => total + order.grossCents, 0);
    const uniqueBuyers = new Set(orders.map((order) => order.buyerId)).size;
    const topBuyerGmvShareBps = buyerGmvConcentrationBps(orders, totalGmvCents);
    const sellers = [...this.creators.values()]
      .flatMap((creator) => {
        const creatorOrders = ordersByCreator.get(creator.id) ?? [];
        if (creatorOrders.length === 0) return [];
        return [platformSeller({
          creator,
          orders: creatorOrders,
          totalGmvCents,
          publishedListings: publishedListingsByCreator.get(creator.id) ?? 0,
          pendingHumanReviews: pendingHumanReviewsByCreator.get(creator.id) ?? 0,
        })];
      })
      .sort(platformSellerSort);
    const reconciliation = this.reconciliationReport(period);
    const settlement = this.settlementReport({ from: period.from, to: period.to });
    const taxCompliance = this.taxComplianceReport({ from: period.from, to: period.to });
    const riskReserve = this.riskReserveReport(riskReserveOptionsFromPlatformTargets(targets, period));
    const platformRevenueCents = sum(sellers, 'platformFeeCents');
    const checkoutGmvCents = orders
      .filter((order) => Boolean(order.stripeCheckoutSessionId))
      .reduce((total, order) => total + order.grossCents, 0);
    const directGmvCents = totalGmvCents - checkoutGmvCents;
    const settlementPayoutShareBps = settlement.summary.payoutCents > 0
      ? Math.round((settlement.summary.settledPayoutCents / settlement.summary.payoutCents) * 10_000)
      : 0;
    const settlementReady = settlement.summary.orders === 0
      ? targets.monthlyGmvCents === 0
      : settlement.summary.blockedPayouts <= targets.maximumBlockedPayouts
        && settlementPayoutShareBps >= targets.minimumSettledPayoutShareBps;
    const summary = {
      gmvCents: totalGmvCents,
      platformRevenueCents,
      creatorNetCents: sum(sellers, 'creatorNetCents'),
      orders: orders.length,
      uniqueBuyers,
      checkoutOrders: reconciliation.summary.checkoutOrders,
      directOrders: reconciliation.summary.directOrders,
      checkoutGmvCents,
      directGmvCents,
      activeSellers: sellers.filter((seller) => seller.active).length,
      repeatSellers: sellers.filter((seller) => seller.orders >= targets.repeatSellerMinimumOrders).length,
      publishedListings: [...this.listings.values()].filter((listing) => listing.status === 'published').length,
      pendingHumanReviews: [...pendingHumanReviewsByCreator.values()].reduce((total, count) => total + count, 0),
      blockedPayouts: reconciliation.summary.blockedPayouts,
      taxComplianceIssues: taxCompliance.issues.length,
      reconciliationReady: reconciliation.ready,
      reconciliationIssues: reconciliation.issues.length,
      topCreatorGmvShareBps: sellers[0]?.gmvShareBps ?? 0,
      topBuyerGmvShareBps,
      platformTakeRateBps: totalGmvCents > 0 ? Math.round((platformRevenueCents / totalGmvCents) * 10_000) : 0,
      checkoutOrderShareBps: orders.length > 0 ? Math.round((reconciliation.summary.checkoutOrders / orders.length) * 10_000) : 0,
      checkoutGmvShareBps: totalGmvCents > 0 ? Math.round((checkoutGmvCents / totalGmvCents) * 10_000) : 0,
      settledPayoutCents: settlement.summary.settledPayoutCents,
      queuedPayoutCents: settlement.summary.queuedPayoutCents,
      settlementPayoutShareBps,
      settlementReady,
      riskReserveReady: riskReserve.ready,
      riskReserveIssues: riskReserve.issues.length,
      availableReserveCents: riskReserve.summary.availableReserveCents,
      requiredReserveCents: riskReserve.summary.requiredReserveCents,
      reserveShortfallCents: riskReserve.summary.reserveShortfallCents,
      refundRateBps: riskReserve.summary.refundRateBps,
      disputeRateBps: riskReserve.summary.disputeRateBps,
    };
    const issues = platformReadinessIssues(summary, targets, sellers[0], riskReserve.issues);
    const checks = platformReadinessChecks(issues, summary, targets);
    return {
      ready: checks.every((check) => check.status !== 'fail'),
      generatedAt: this.now(),
      period,
      targets,
      summary,
      sellers,
      topSellers: sellers.slice(0, 10),
      checks,
      issues,
    };
  }

  businessModelProof(
    targetOverrides: Partial<MarketplacePlatformReadinessTargets> = {},
  ): MarketplaceBusinessModelProofExport {
    const report = this.platformReadiness(targetOverrides);
    return {
      marketplace: {
        monthlyGmvUsd: Number((report.summary.gmvCents / 100).toFixed(2)),
        activeSellers: report.summary.activeSellers,
        uniqueBuyers: report.summary.uniqueBuyers,
        topCreatorGmvShareBps: report.summary.topCreatorGmvShareBps,
        topBuyerGmvShareBps: report.summary.topBuyerGmvShareBps,
        platformReady: report.ready,
        sourceBusinessModelReady: report.ready,
        checkoutOrderShareBps: report.summary.checkoutOrderShareBps,
        checkoutGmvShareBps: report.summary.checkoutGmvShareBps,
        settlementReady: report.summary.settlementReady,
        settlementPayoutShareBps: report.summary.settlementPayoutShareBps,
        payoutBlockers: report.summary.blockedPayouts,
        taxBlockers: report.summary.taxComplianceIssues,
        reconciliationReady: report.summary.reconciliationReady,
        reconciliationIssues: report.summary.reconciliationIssues,
        riskReserveReady: report.summary.riskReserveReady,
        reserveShortfallCents: report.summary.reserveShortfallCents,
      },
      source: {
        report: 'marketplace-platform-readiness',
        generatedAt: report.generatedAt,
        period: report.period,
        platformReady: report.ready,
        checkoutAttributionReady: report.summary.checkoutOrderShareBps >= report.targets.minimumCheckoutOrderShareBps
          && report.summary.checkoutGmvShareBps >= report.targets.minimumCheckoutGmvShareBps,
        reconciliationReady: report.summary.reconciliationReady,
        settlementReady: report.summary.settlementReady,
        riskReserveReady: report.summary.riskReserveReady,
        taxReady: report.summary.taxComplianceIssues === 0,
        payoutReady: report.summary.blockedPayouts === 0,
        businessModelReady: report.ready,
      },
      disclaimer: 'Marketplace business-model proof is sanitized aggregate evidence for GREYBOX_BUSINESS_MODEL_PROOF_JSON. It excludes creator names, buyer ids, tax identifiers, Stripe accounts, order ids, payout ids, tax record ids, admin tokens, and bundle payloads.',
    };
  }

  launchReadiness(targetOverrides: Partial<MarketplaceLaunchReadinessTargets> = {}): MarketplaceLaunchReadinessReport {
    const targets = launchReadinessTargets(targetOverrides);
    const growth = this.growthProgress({
      monthlyGmvCents: targets.monthlyGmvCents,
      activeCreatorsWithSales: targets.activeCreatorsWithSales,
    });
    const reconciliation = this.reconciliationReport();
    const taxCompliance = this.taxComplianceReport();
    const summary = {
      publishedListings: this.listListings({ status: 'published' }).length,
      pendingHumanReviews: this.listReviews({ status: 'human-required', humanReviewRequired: true }).length,
      rejectedListings: this.listListings({ status: 'rejected' }).length,
      blockedPayouts: reconciliation.summary.blockedPayouts,
      taxComplianceIssues: taxCompliance.issues.length,
      activeCreatorsWithSales: growth.stats.activeCreatorsWithSales,
      gmvCents: growth.stats.gmvCents,
    };
    const issues: MarketplaceLaunchReadinessIssue[] = [];

    if (!growth.achieved) {
      issues.push({
        code: 'growth_target_not_met',
        severity: 'error',
        referenceType: 'stats',
        referenceId: 'launch-targets',
        detail: growth.shortfalls.join('; '),
        remediation: 'Keep recruiting creators and driving paid sales before public marketplace launch.',
      });
    }
    if (summary.publishedListings < targets.minimumPublishedListings) {
      issues.push({
        code: 'published_listing_shortfall',
        severity: 'error',
        referenceType: 'listing',
        referenceId: 'published-listings',
        detail: `Published catalog needs ${targets.minimumPublishedListings - summary.publishedListings} more listing(s).`,
        remediation: 'Approve qualified creator supply or seed first-party templates before launch.',
      });
    }
    if (summary.pendingHumanReviews > targets.maximumPendingHumanReviews) {
      issues.push({
        code: 'human_review_backlog',
        severity: 'error',
        referenceType: 'review',
        referenceId: 'human-review-queue',
        detail: `${summary.pendingHumanReviews} listing review(s) are waiting for a human decision.`,
        remediation: 'Clear top-GMV and flagged listing reviews before launch day traffic.',
      });
    }
    if (summary.blockedPayouts > targets.maximumBlockedPayouts) {
      issues.push({
        code: 'blocked_payouts',
        severity: 'error',
        referenceType: 'payout',
        referenceId: 'blocked-payouts',
        detail: `${summary.blockedPayouts} payout(s) are blocked by creator onboarding or tax profile work.`,
        remediation: 'Complete Stripe Connect and tax-profile onboarding before opening paid traffic.',
      });
    }
    if (summary.taxComplianceIssues > targets.maximumTaxComplianceIssues) {
      issues.push({
        code: 'tax_compliance_issues',
        severity: 'error',
        referenceType: 'tax-compliance',
        referenceId: 'tax-compliance-issues',
        detail: `${summary.taxComplianceIssues} tax compliance issue(s) need finance review.`,
        remediation: 'Resolve missing tax profiles, buyer-country gaps, or Stripe Tax evidence before launch.',
      });
    }

    const checks = launchReadinessChecks(issues, summary, targets);
    return {
      ready: checks.every((check) => check.status !== 'fail'),
      generatedAt: this.now(),
      targets,
      summary,
      growth,
      checks,
      issues,
    };
  }

  reconciliationReport(period: {
    from?: number;
    to?: number;
  } = {}): MarketplaceReconciliationReport {
    const orders = this.ordersInPeriod(period);
    const orderIds = new Set(orders.map((order) => order.id));
    const entitlements = [...this.entitlements.values()].filter((entitlement) => orderIds.has(entitlement.orderId));
    const issues: MarketplaceReconciliationIssue[] = [];

    for (const order of orders) {
      this.reconcileOrder(order, issues);
    }

    const summary = {
      orders: orders.length,
      checkoutOrders: orders.filter((order) => Boolean(order.stripeCheckoutSessionId)).length,
      directOrders: orders.filter((order) => !order.stripeCheckoutSessionId).length,
      gmvCents: orders.reduce((sum, order) => sum + order.grossCents, 0),
      platformRevenueCents: orders.reduce((sum, order) => sum + order.platformFeeCents, 0),
      creatorNetCents: orders.reduce((sum, order) => sum + order.creatorNetCents, 0),
      payoutCents: orders.reduce((sum, order) => {
        const payout = order.payoutId ? this.payouts.get(order.payoutId) : undefined;
        return sum + (payout?.amountCents ?? 0);
      }, 0),
      blockedPayouts: orders.filter((order) => {
        const payout = order.payoutId ? this.payouts.get(order.payoutId) : undefined;
        return payout?.status === 'blocked';
      }).length,
      taxAmountCents: orders.reduce((sum, order) => {
        const taxRecord = order.taxRecordId ? this.taxRecords.get(order.taxRecordId) : undefined;
        return sum + (taxRecord?.taxAmountCents ?? 0);
      }, 0),
      entitlementsIssued: entitlements.length,
      entitlementsClaimed: entitlements.filter((entitlement) => Boolean(entitlement.activation.licenseHash)).length,
      creatorsWithSales: new Set(orders.map((order) => order.creatorId)).size,
    };
    const checks = reconciliationChecks(issues, summary);
    return {
      ready: checks.every((check) => check.status !== 'fail'),
      generatedAt: this.now(),
      ...(period.from !== undefined || period.to !== undefined ? { period } : {}),
      summary,
      checks,
      issues,
    };
  }

  settlementReport(filter: MarketplaceSettlementPeriod & {
    creatorId?: string;
  } = {}): MarketplaceSettlementReport {
    const orders = this.ordersInPeriod(filter)
      .filter((order) => !filter.creatorId || order.creatorId === filter.creatorId);
    const lines = orders.map((order) => this.settlementLine(order));
    const creators = settlementCreators(lines, this.creators);
    return {
      generatedAt: this.now(),
      ...(filter.from !== undefined || filter.to !== undefined
        ? { period: { ...(filter.from !== undefined ? { from: filter.from } : {}), ...(filter.to !== undefined ? { to: filter.to } : {}) } }
        : {}),
      ...(filter.creatorId ? { creatorId: filter.creatorId } : {}),
      summary: {
        orders: lines.length,
        creators: creators.length,
        grossCents: sum(lines, 'grossCents'),
        platformFeeCents: sum(lines, 'platformFeeCents'),
        creatorNetCents: sum(lines, 'creatorNetCents'),
        payoutCents: sum(lines, 'payoutCents'),
        settledPayoutCents: sumPayoutCentsBySettlementStatus(lines, 'settled'),
        queuedPayoutCents: sumPayoutCentsBySettlementStatus(lines, 'queued'),
        blockedPayouts: lines.filter((line) => line.payoutSettlementStatus === 'blocked').length,
        taxAmountCents: sum(lines, 'taxAmountCents'),
      },
      creators,
      lines,
    };
  }

  settlementCsv(filter: MarketplaceSettlementPeriod & {
    creatorId?: string;
  } = {}): string {
    return settlementReportToCsv(this.settlementReport(filter));
  }

  taxComplianceReport(options: MarketplaceTaxComplianceOptions = {}): MarketplaceTaxComplianceReport {
    const thresholdCents = taxComplianceThreshold(options);
    const period = taxCompliancePeriod(options);
    const orders = this.ordersInPeriod(period)
      .filter((order) => !options.creatorId || order.creatorId === options.creatorId);
    const lines = orders.map((order) => this.settlementLine(order));
    const creators = taxComplianceCreators(lines, this.creators, thresholdCents);
    const buyerCountries = taxComplianceBuyerCountries(orders, this.taxRecords);
    const issues = taxComplianceIssues(orders, creators, this.taxRecords);
    return {
      generatedAt: this.now(),
      ...(hasTaxCompliancePeriod(period) ? { period } : {}),
      ...(options.creatorId ? { creatorId: options.creatorId } : {}),
      operationalThresholds: {
        us1099KGrossThresholdCents: thresholdCents,
      },
      summary: {
        orders: lines.length,
        creators: creators.length,
        reportable1099KCreators: creators.filter((creator) => creator.reportable1099K).length,
        grossCents: sum(lines, 'grossCents'),
        platformFeeCents: sum(lines, 'platformFeeCents'),
        creatorNetCents: sum(lines, 'creatorNetCents'),
        payoutCents: sum(lines, 'payoutCents'),
        taxAmountCents: sum(lines, 'taxAmountCents'),
        missingTaxProfiles: creators.filter((creator) => creator.missingTaxProfile).length,
        missingStripeConnectAccounts: creators.filter((creator) => creator.missingStripeConnectAccount).length,
        buyerCountries: buyerCountries.length,
      },
      creators,
      buyerCountries,
      issues,
    };
  }

  taxComplianceCsv(options: MarketplaceTaxComplianceOptions = {}): string {
    return taxComplianceReportToCsv(this.taxComplianceReport(options));
  }

  recordRiskEvent(draft: MarketplaceRiskEventDraft): MarketplaceRiskEvent {
    const order = this.orders.get(draft.orderId);
    if (!order) throw new Error('order not found');
    if (!isRiskEventType(draft.type)) throw new Error('risk event type must be refund or dispute');
    const requestedStatus = draft.status;
    const status = draft.status ?? 'open';
    if (!isRiskEventStatus(status)) throw new Error('risk event status is not supported');
    if (!Number.isInteger(draft.amountCents) || draft.amountCents <= 0) {
      throw new Error('risk event amountCents must be a positive integer');
    }
    if (draft.amountCents > order.grossCents) {
      throw new Error('risk event amount cannot exceed order gross');
    }
    if (draft.type === 'refund' && draft.stripeDisputeId) {
      throw new Error('refund risk events cannot include stripeDisputeId');
    }
    if (draft.type === 'dispute' && draft.stripeRefundId) {
      throw new Error('dispute risk events cannot include stripeRefundId');
    }
    if (draft.refundBlocked && draft.type !== 'refund') {
      throw new Error('refundBlocked can only be set on refund risk events');
    }
    const reason = sanitizeRiskEventReason(draft.reason);
    const existing = this.findExistingStripeRiskEvent(draft);
    if (existing) {
      if (existing.type !== draft.type || existing.orderId !== order.id || existing.amountCents !== draft.amountCents) {
        throw new Error('risk event stripe id replay mismatch');
      }
      const nextStatus = nextStripeRiskEventStatus(existing.status, requestedStatus);
      const next: MarketplaceRiskEvent = {
        ...existing,
        ...(nextStatus !== existing.status ? { status: nextStatus } : {}),
        ...(reason && reason !== existing.reason ? { reason } : {}),
      };
      const changed = next.status !== existing.status || next.reason !== existing.reason;
      if (changed) {
        const updated = { ...next, updatedAt: this.now() };
        this.riskEvents.set(updated.id, updated);
        this.recordReceiptForRiskEvent(updated, draft.stripeEventId);
        this.audit('risk_event.resolved', {
          actorId: 'system',
          actorType: 'system',
          entityType: 'risk_event',
          entityId: updated.id,
          metadata: {
            type: updated.type,
            orderId: updated.orderId,
            amountCents: updated.amountCents,
            previousStatus: existing.status,
            status: updated.status,
          },
        });
        this.revokeEntitlementsForRiskEvent(order, updated);
        return clone(updated);
      }
      this.recordReceiptForRiskEvent(existing, draft.stripeEventId);
      this.revokeEntitlementsForRiskEvent(order, existing);
      return clone(existing);
    }
    if (draft.type === 'refund' && refundRiskEventCountsAgainstOrder({ status, stripeRefundId: draft.stripeRefundId })) {
      const activeRefundCents = this.refundedCentsForOrder(order.id);
      if (activeRefundCents + draft.amountCents > order.grossCents) {
        throw new Error('cumulative refund amount cannot exceed order gross');
      }
    }
    const now = this.now();
    const event: MarketplaceRiskEvent = {
      id: `risk-${++this.riskEventSeq}`,
      type: draft.type,
      orderId: order.id,
      creatorId: order.creatorId,
      listingId: order.listingId,
      amountCents: draft.amountCents,
      currency: order.currency,
      status,
      ...(reason ? { reason } : {}),
      ...(draft.stripeRefundId ? { stripeRefundId: draft.stripeRefundId } : {}),
      ...(draft.stripeDisputeId ? { stripeDisputeId: draft.stripeDisputeId } : {}),
      ...(draft.refundBlocked ? { refundBlocked: true } : {}),
      createdAt: now,
      updatedAt: now,
    };
    this.riskEvents.set(event.id, event);
    this.recordReceiptForRiskEvent(event, draft.stripeEventId);
    this.audit('risk_event.recorded', {
      actorId: 'system',
      actorType: 'system',
      entityType: 'risk_event',
      entityId: event.id,
      metadata: {
        type: event.type,
        orderId: event.orderId,
        amountCents: event.amountCents,
        status: event.status,
      },
    });
    this.revokeEntitlementsForRiskEvent(order, event);
    return clone(event);
  }

  recordIgnoredStripeEvent(input: {
    route: 'dispute' | 'refund' | 'unknown';
    reason: 'wrong_stripe_event_route' | 'unmatched_stripe_event';
    eventType?: string;
    stripeEventId?: string;
    hasPaymentIntent?: boolean;
    hasMetadataOrderId?: boolean;
    amountCents?: number;
  }): void {
    if (input.amountCents !== undefined && (!Number.isInteger(input.amountCents) || input.amountCents <= 0)) {
      throw new Error('ignored stripe event amountCents must be a positive integer');
    }
    const entityId = input.stripeEventId
      ? auditHash('stripe_event', input.stripeEventId)
      : auditHash('stripe_event', `${input.route}:${input.reason}:${input.eventType ?? 'unknown'}:${this.now()}`);
    this.audit('stripe_event.ignored', {
      actorId: 'webhook:stripe-risk',
      actorType: 'webhook',
      entityType: 'stripe_event',
      entityId,
      metadata: {
        route: input.route,
        reason: input.reason,
        ...(input.eventType ? { eventType: input.eventType } : {}),
        hasPaymentIntent: Boolean(input.hasPaymentIntent),
        hasMetadataOrderId: Boolean(input.hasMetadataOrderId),
        ...(input.amountCents ? { amountCents: input.amountCents } : {}),
      },
    });
  }

  /**
   * Initiate a refund for an order through the configured payout provider and
   * record the result as a 'refund' risk event. The provider call is the only
   * side effect that touches Stripe; if the provider rejects (no createRefund
   * implementation, missing payment intent, validation failure), the store
   * fails closed without recording a risk event so reconciliation is honest.
   *
   * Idempotency: the Stripe Idempotency-Key built by buildStripeRefundRequest
   * keys on `${orderId}-${amountCents}`, so re-issuing the same refund returns
   * the original refund id. Callers should ensure the same parameters are
   * passed on retries.
   */
  async refundOrder(input: {
    orderId: string;
    amountCents: number;
    reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer';
    actorId?: string;
    actorType?: MarketplaceAuditRecord['actorType'];
  }): Promise<{ riskEvent: MarketplaceRiskEvent; refund: { stripeRefundId: string; status: 'queued' | 'succeeded' | 'pending' | 'blocked'; reason?: string } }> {
    const order = this.orders.get(input.orderId);
    if (!order) throw new Error('order not found');
    if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
      throw new Error('refund amountCents must be a positive integer');
    }
    if (input.amountCents > order.grossCents) {
      throw new Error('refund amount cannot exceed order gross');
    }
    const existingRefund = this.findExistingRefundRiskEvent(order.id, input.amountCents);
    if (existingRefund) {
      const refund = refundResultFromRiskEvent(existingRefund);
      this.recordAdminRefundReceipt(order, input.amountCents, refund, existingRefund);
      if (refund.status !== 'blocked' && this.isOrderAccessReversed(order)) {
        this.revokeEntitlementsForOrder(order, {
          actorId: input.actorId ?? 'system',
          actorType: input.actorType ?? 'admin',
          riskEventId: existingRefund.id,
          stripeRefundId: refund.stripeRefundId,
          refundStatus: refund.status,
        });
      }
      return {
        riskEvent: clone(existingRefund),
        refund,
      };
    }
    const activeRefundCents = this.refundedCentsForOrder(order.id);
    if (activeRefundCents + input.amountCents > order.grossCents) {
      throw new Error('cumulative refund amount cannot exceed order gross');
    }
    if (!order.stripePaymentIntentId) {
      throw new Error('order is missing stripePaymentIntentId; refund cannot be initiated');
    }
    if (typeof this.payoutProvider.createRefund !== 'function') {
      throw new Error('configured payoutProvider does not implement createRefund');
    }
    const refundRequest = buildStripeRefundRequest({
      orderId: order.id,
      stripePaymentIntentId: order.stripePaymentIntentId,
      amountCents: input.amountCents,
      currency: order.currency,
      ...(input.reason ? { reason: input.reason } : {}),
    });
    const refund = await this.payoutProvider.createRefund({
      orderId: order.id,
      stripePaymentIntentId: order.stripePaymentIntentId,
      amountCents: input.amountCents,
      currency: order.currency,
      ...(input.reason ? { reason: input.reason } : {}),
    });
    const riskStatus: MarketplaceRiskEventStatus = refund.status === 'blocked' ? 'open'
      : refund.status === 'succeeded' ? 'resolved' : 'open';
    const draft: MarketplaceRiskEventDraft = {
      type: 'refund',
      orderId: order.id,
      amountCents: input.amountCents,
      status: riskStatus,
      stripeRefundId: refund.stripeRefundId,
      ...(refund.status === 'blocked' ? { refundBlocked: true } : {}),
      ...(refund.reason ? { reason: refund.reason } : input.reason ? { reason: input.reason } : {}),
    };
    const riskEvent = this.recordRiskEvent(draft);
    this.recordAdminRefundReceipt(order, input.amountCents, refund, riskEvent, refundRequest.idempotencyKey);
    this.audit('order.refunded', {
      actorId: input.actorId ?? 'system',
      actorType: input.actorType ?? 'admin',
      entityType: 'order',
      entityId: order.id,
      metadata: {
        amountCents: input.amountCents,
        currency: order.currency,
        hasStripeRefundEvidence: Boolean(refund.stripeRefundId),
        refundStatus: refund.status,
        riskEventId: riskEvent.id,
      },
    });
    if (refund.status !== 'blocked' && this.isOrderAccessReversed(order)) {
      this.revokeEntitlementsForOrder(order, {
        actorId: input.actorId ?? 'system',
        actorType: input.actorType ?? 'admin',
        riskEventId: riskEvent.id,
        stripeRefundId: refund.stripeRefundId,
        refundStatus: refund.status,
      });
    }
    return { riskEvent, refund };
  }

  private findExistingRefundRiskEvent(orderId: string, amountCents: number): MarketplaceRiskEvent | undefined {
    return [...this.riskEvents.values()].find((event) => (
      event.orderId === orderId
      && event.type === 'refund'
      && event.amountCents === amountCents
      && event.status !== 'lost'
      && Boolean(event.stripeRefundId)
    ));
  }

  private refundedCentsForOrder(orderId: string): number {
    return [...this.riskEvents.values()]
      .filter((event) => event.orderId === orderId && event.type === 'refund')
      .filter(refundRiskEventCountsAgainstOrder)
      .reduce((sum, event) => sum + event.amountCents, 0);
  }

  private accessReversalCentsForOrder(orderId: string): number {
    return [...this.riskEvents.values()]
      .filter((event) => event.orderId === orderId)
      .filter((event) => (
        (event.type === 'refund' && refundRiskEventCountsAgainstOrder(event))
        || (event.type === 'dispute' && event.status === 'lost')
      ))
      .reduce((sum, event) => sum + event.amountCents, 0);
  }

  private isOrderAccessReversed(order: MarketplaceOrder): boolean {
    return this.accessReversalCentsForOrder(order.id) >= order.grossCents;
  }

  private revokeEntitlementsForOrder(
    order: MarketplaceOrder,
    input: {
      actorId: string;
      actorType: MarketplaceAuditRecord['actorType'];
      riskEventId: string;
      stripeRefundId?: string;
      stripeDisputeId?: string;
      refundStatus?: RefundProviderResult['status'];
      reversalReason?: 'full-refund' | 'lost-dispute';
    },
  ): MarketplaceEntitlement[] {
    const revoked: MarketplaceEntitlement[] = [];
    for (const entitlement of this.entitlements.values()) {
      if (entitlement.orderId !== order.id || entitlement.status !== 'active') continue;
      const next: MarketplaceEntitlement = {
        ...entitlement,
        status: 'revoked',
      };
      this.entitlements.set(next.id, next);
      revoked.push(next);
      this.audit('entitlement.revoked', {
        actorId: input.actorId,
        actorType: input.actorType,
        entityType: 'entitlement',
        entityId: next.id,
        metadata: {
          orderId: order.id,
          listingId: order.listingId,
          reason: input.reversalReason ?? 'full-refund',
          refundedCents: this.refundedCentsForOrder(order.id),
          reversedCents: this.accessReversalCentsForOrder(order.id),
          grossCents: order.grossCents,
          currency: order.currency,
          riskEventId: input.riskEventId,
          hasStripeRefundEvidence: Boolean(input.stripeRefundId),
          hasStripeDisputeEvidence: Boolean(input.stripeDisputeId),
          ...(input.refundStatus ? { refundStatus: input.refundStatus } : {}),
          moduleId: next.proModule?.moduleId,
        },
      });
    }
    return revoked;
  }

  private revokeEntitlementsForRiskEvent(
    order: MarketplaceOrder,
    event: MarketplaceRiskEvent,
  ): void {
    if (event.type === 'refund') {
      if (event.status !== 'open' && event.status !== 'resolved') return;
      if (isBlockedRefundRiskEvent(event)) return;
    } else if (event.type === 'dispute') {
      if (event.status !== 'lost') return;
    } else {
      return;
    }
    if (!this.isOrderAccessReversed(order)) return;
    this.revokeEntitlementsForOrder(order, {
      actorId: 'system',
      actorType: 'system',
      riskEventId: event.id,
      ...(event.stripeRefundId ? { stripeRefundId: event.stripeRefundId } : {}),
      ...(event.stripeDisputeId ? { stripeDisputeId: event.stripeDisputeId } : {}),
      ...(event.type === 'refund' ? {
        refundStatus: event.status === 'resolved' ? 'succeeded' : 'pending',
        reversalReason: 'full-refund' as const,
      } : {
        reversalReason: 'lost-dispute' as const,
      }),
    });
  }

  listRiskEvents(filters: {
    type?: MarketplaceRiskEventType;
    orderId?: string;
    from?: number;
    to?: number;
  } = {}): MarketplaceRiskEvent[] {
    return [...this.riskEvents.values()]
      .filter((event) => !filters.type || event.type === filters.type)
      .filter((event) => !filters.orderId || event.orderId === filters.orderId)
      .filter((event) => filters.from === undefined || event.createdAt >= filters.from)
      .filter((event) => filters.to === undefined || event.createdAt < filters.to)
      .sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id))
      .map((event) => clone(event));
  }

  listEventReceipts(filters: {
    kind?: MarketplaceEventReceiptKind;
    orderId?: string;
    from?: number;
    to?: number;
  } = {}): MarketplaceEventReceipt[] {
    return [...this.eventReceipts.values()]
      .filter((receipt) => !filters.kind || receipt.kind === filters.kind)
      .filter((receipt) => !filters.orderId || receipt.orderId === filters.orderId)
      .filter((receipt) => filters.from === undefined || receipt.createdAt >= filters.from)
      .filter((receipt) => filters.to === undefined || receipt.createdAt < filters.to)
      .sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id))
      .map((receipt) => clone(receipt));
  }

  private findExistingStripeRiskEvent(draft: MarketplaceRiskEventDraft): MarketplaceRiskEvent | undefined {
    if (draft.stripeRefundId) {
      return [...this.riskEvents.values()].find((event) => event.stripeRefundId === draft.stripeRefundId);
    }
    if (draft.stripeDisputeId) {
      return [...this.riskEvents.values()].find((event) => event.stripeDisputeId === draft.stripeDisputeId);
    }
    return undefined;
  }

  riskReserveReport(options: MarketplaceRiskReserveOptions = {}): MarketplaceRiskReserveReport {
    return this.buildRiskReserveReport(options);
  }

  private buildRiskReserveReport(
    options: MarketplaceRiskReserveOptions,
    additionalOrders: MarketplaceOrder[] = [],
  ): MarketplaceRiskReserveReport {
    const assumptions = riskReserveAssumptions(options);
    const period = riskReservePeriod(options);
    const orders = [
      ...this.ordersInPeriod(period),
      ...additionalOrders
        .filter((order) => orderWithinPeriod(order, period))
        .filter((order) => !this.orders.has(order.id)),
    ];
    const orderIds = new Set(orders.map((order) => order.id));
    const recordedRisk = this.listRiskEvents(period)
      .filter((event) => orderIds.has(event.orderId) && event.status !== 'won');
    const recordedRefundsCents = recordedRisk
      .filter((event) => event.type === 'refund')
      .filter(refundRiskEventCountsAgainstOrder)
      .reduce((total, event) => total + event.amountCents, 0);
    const recordedDisputeCents = recordedRisk
      .filter((event) => event.type === 'dispute')
      .reduce((total, event) => total + event.amountCents, 0);
    const effectiveRefundsCents = assumptions.reportedRefundsCents + recordedRefundsCents;
    const effectiveDisputeCents = assumptions.reportedDisputeCents + recordedDisputeCents;
    const lines = orders.map((order) => this.settlementLine(order));
    const gmvCents = sum(lines, 'grossCents');
    const creatorNetCents = sum(lines, 'creatorNetCents');
    const queuedOrSentPayoutCents = lines
      .filter((line) => line.payoutStatus === 'queued' || line.payoutStatus === 'sent')
      .reduce((total, line) => total + line.payoutCents, 0);
    const manualTransferOrders = lines.filter((line) => line.payoutDelivery !== 'checkout-destination-charge').length;
    const requiredReserveCents = requiredRiskReserveCents({
      gmvCents,
      reportedRefundsCents: effectiveRefundsCents,
      reportedDisputeCents: effectiveDisputeCents,
      minimumReserveBps: assumptions.minimumReserveBps,
      minimumReserveCents: assumptions.minimumReserveCents,
    });
    const reserveShortfallCents = Math.max(0, requiredReserveCents - assumptions.availableReserveCents);
    const summary: MarketplaceRiskReserveReport['summary'] = {
      orders: lines.length,
      checkoutOrders: lines.filter((line) => Boolean(line.stripeCheckoutSessionId)).length,
      directOrders: lines.filter((line) => !line.stripeCheckoutSessionId).length,
      gmvCents,
      creatorNetCents,
      queuedOrSentPayoutCents,
      availableReserveCents: assumptions.availableReserveCents,
      requiredReserveCents,
      reserveShortfallCents,
      reserveCoverageBps: requiredReserveCents > 0
        ? Math.floor((assumptions.availableReserveCents / requiredReserveCents) * 10_000)
        : 10_000,
      recordedRefundsCents,
      recordedDisputeCents,
      reportedRefundsCents: effectiveRefundsCents,
      reportedDisputeCents: effectiveDisputeCents,
      refundRateBps: gmvCents > 0 ? Math.round((effectiveRefundsCents / gmvCents) * 10_000) : 0,
      disputeRateBps: gmvCents > 0 ? Math.round((effectiveDisputeCents / gmvCents) * 10_000) : 0,
      manualTransferOrders,
    };
    const issues = riskReserveIssues(summary, assumptions);
    const checks = riskReserveChecks(issues, summary, assumptions);
    return {
      ready: checks.every((check) => check.status !== 'fail'),
      generatedAt: this.now(),
      ...(hasRiskReservePeriod(period) ? { period } : {}),
      assumptions,
      summary,
      checks,
      issues,
    };
  }

  private reserveBlockingIssueForOrder(order: MarketplaceOrder): MarketplaceRiskReserveIssue | undefined {
    if (this.payoutReservePolicy?.mode !== 'enforce') return undefined;
    const report = this.buildRiskReserveReport(riskReserveOptionsFromPayoutPolicy(this.payoutReservePolicy), [order]);
    return report.issues.find((issue) => issue.severity === 'error');
  }

  private reserveBlockedPayout(
    order: MarketplaceOrder,
    creator: Creator,
    delivery: NonNullable<PayoutInstruction['delivery']>,
    checkout?: {
      stripeCheckoutSessionId?: string;
      stripePaymentIntentId?: string;
    },
  ): PayoutInstruction | undefined {
    const issue = this.reserveBlockingIssueForOrder(order);
    if (!issue) return undefined;
    return {
      id: `payout-reserve-blocked-${order.id}`,
      orderId: order.id,
      creatorId: creator.id,
      stripeConnectAccountId: creator.stripeConnectAccountId ?? '',
      amountCents: order.creatorNetCents,
      currency: order.currency,
      status: 'blocked',
      reason: `risk_reserve_${issue.code}`,
      delivery,
      ...(checkout?.stripeCheckoutSessionId ? { stripeCheckoutSessionId: checkout.stripeCheckoutSessionId } : {}),
      ...(checkout?.stripePaymentIntentId ? { stripePaymentIntentId: checkout.stripePaymentIntentId } : {}),
    };
  }

  listListings(filters: {
    status?: ListingStatus;
    category?: ListingCategory;
  } = {}): MarketplaceListing[] {
    return [...this.listings.values()]
      .filter((listing) => !filters.status || listing.status === filters.status)
      .filter((listing) => !filters.category || listing.category === filters.category)
      .sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
  }

  catalogSearch(options: MarketplaceCatalogSearchOptions = {}): MarketplaceCatalogSearchResult {
    const query = normalizedCatalogQuery(options.query);
    const tag = normalizedCatalogTag(options.tag);
    const limit = normalizedCatalogLimit(options.limit);
    const offset = normalizedCatalogOffset(options.offset);
    const queryScoped = this.publishedCatalogRows(query)
      .filter((row) => !options.creatorId || row.creator.id === options.creatorId);
    const categoryScoped = queryScoped
      .filter((row) => !options.category || row.listing.category === options.category);
    const filtered = categoryScoped
      .filter((row) => !tag || row.listing.tags.some((listingTag) => listingTag.toLowerCase() === tag));
    const listings = filtered
      .sort((left, right) => (
        right.score - left.score
        || right.salesCount - left.salesCount
        || (right.listing.publishedAt ?? right.listing.updatedAt) - (left.listing.publishedAt ?? left.listing.updatedAt)
        || left.listing.id.localeCompare(right.listing.id)
      ))
      .slice(offset, offset + limit)
      .map(catalogListingFromRow);
    return {
      ...(query ? { query } : {}),
      ...(options.category ? { category: options.category } : {}),
      ...(tag ? { tag } : {}),
      ...(options.creatorId ? { creatorId: options.creatorId } : {}),
      total: filtered.length,
      offset,
      limit,
      facets: {
        categories: catalogFacet(categoryScoped.map((row) => row.listing.category)),
        tags: catalogFacet(categoryScoped.flatMap((row) => row.listing.tags.map((item) => item.toLowerCase()))),
      },
      listings,
    };
  }

  listReviews(filters: {
    status?: ListingReview['status'];
    humanReviewRequired?: boolean;
  } = {}): ListingReview[] {
    return [...this.reviews.values()]
      .filter((review) => !filters.status || review.status === filters.status)
      .filter((review) => filters.humanReviewRequired === undefined || review.humanReviewRequired === filters.humanReviewRequired)
      .sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id));
  }

  reviewDashboard(options: { limit?: number } = {}): MarketplaceReviewDashboard {
    const generatedAt = this.now();
    const allReviews = [...this.reviews.values()];
    const dashboardItems = allReviews
      .map((review) => reviewDashboardItem(review, this.listings.get(review.listingId), generatedAt))
      .filter((item): item is MarketplaceReviewDashboardItem => Boolean(item));
    const allPending = dashboardItems
      .filter((item) => item.status === 'human-required' && item.humanReviewRequired)
      .sort(reviewDashboardItemSort);
    const pending = allPending.slice(0, normalizedReviewDashboardLimit(options.limit));
    const pendingAges = allPending.map((item) => item.ageMs);
    return {
      generatedAt,
      summary: {
        totalReviews: allReviews.length,
        pendingHumanReviews: allPending.length,
        rejectedReviews: allReviews.filter((review) => review.status === 'rejected').length,
        passedReviews: allReviews.filter((review) => review.status === 'passed').length,
        criticalFlags: allReviews.reduce((total, review) => total + review.flags.filter((flag) => flag.severity === 'critical').length, 0),
        highFlags: allReviews.reduce((total, review) => total + review.flags.filter((flag) => flag.severity === 'high').length, 0),
        flaglessHumanReviews: dashboardItems.filter((item) => item.humanReviewRequired && item.flagCount === 0).length,
        oldestPendingAgeMs: pendingAges.length > 0 ? Math.max(...pendingAges) : 0,
      },
      reviews: pending,
    };
  }

  creatorStorefront(creatorId: string): MarketplaceCreatorStorefront {
    const creator = this.creators.get(creatorId);
    if (!creator?.active) throw new Error('active creator not found');
    const listings = [...this.listings.values()]
      .filter((listing) => listing.creatorId === creator.id && listing.status === 'published')
      .sort((left, right) => (right.publishedAt ?? right.updatedAt) - (left.publishedAt ?? left.updatedAt) || left.id.localeCompare(right.id))
      .map(publicStorefrontListing);
    const priceRangeCents = publishedPriceRange(listings);
    return {
      creator: {
        id: creator.id,
        displayName: creator.displayName,
        country: creator.country,
      },
      stats: {
        publishedListings: listings.length,
        salesCount: [...this.orders.values()].filter((order) => order.creatorId === creator.id).length,
        categories: [...new Set(listings.map((listing) => listing.category))].sort(),
        ...(priceRangeCents ? { priceRangeCents } : {}),
      },
      listings,
    };
  }

  private publishedCatalogRows(query: string): CatalogRow[] {
    const rows: CatalogRow[] = [];
    for (const listing of this.listings.values()) {
      if (listing.status !== 'published') continue;
      const creator = this.creators.get(listing.creatorId);
      if (!creator?.active) continue;
      const score = catalogScore(listing, creator, query);
      if (query && score <= 0) continue;
      rows.push({
        listing,
        creator,
        score,
        salesCount: [...this.orders.values()].filter((order) => order.listingId === listing.id).length,
      });
    }
    return rows;
  }

  review(id: string): ListingReview | undefined {
    return this.reviews.get(id);
  }

  listing(id: string): MarketplaceListing | undefined {
    return this.listings.get(id);
  }

  entitlement(id: string): MarketplaceEntitlement | undefined {
    return this.entitlements.get(id);
  }

  listEntitlements(filters: {
    buyerId?: string;
    listingId?: string;
    lookupKey?: string;
  } = {}): MarketplaceEntitlement[] {
    return [...this.entitlements.values()]
      .filter((entitlement) => !filters.buyerId || entitlement.buyerId === filters.buyerId)
      .filter((entitlement) => !filters.listingId || entitlement.listingId === filters.listingId)
      .filter((entitlement) => !filters.lookupKey || entitlement.activation.lookupKey === filters.lookupKey)
      .sort((a, b) => b.issuedAt - a.issuedAt || a.id.localeCompare(b.id));
  }

  claimEntitlement(input: MarketplaceEntitlementClaimInput): MarketplaceEntitlement {
    if (!ENTITLEMENT_LOOKUP_KEY_PATTERN.test(input.lookupKey)) {
      throw new Error('lookupKey must be a Greybox entitlement lookup key');
    }
    if (!/^[a-f0-9]{16}$/iu.test(input.licenseHash)) throw new Error('licenseHash must be a short license hash');
    if (!input.moduleId && !input.entitlementSku && !input.entitlementGrantKey) {
      throw new Error('entitlement claim must include a Pro module id, SKU, or grant key');
    }
    if (input.moduleId !== undefined && !PRO_MODULE_ID_PATTERN.test(input.moduleId)) {
      throw new Error('moduleId must be a safe Pro module id');
    }
    if (input.entitlementSku !== undefined && !PRO_MODULE_SKU_PATTERN.test(input.entitlementSku)) {
      throw new Error('entitlementSku must be a Greybox Pro module SKU');
    }
    if (input.entitlementGrantKey !== undefined && !PRO_MODULE_GRANT_KEY_PATTERN.test(input.entitlementGrantKey)) {
      throw new Error('entitlementGrantKey must be a Greybox Pro module grant key');
    }
    const entitlement = [...this.entitlements.values()].find((item) => item.activation.lookupKey === input.lookupKey);
    if (!entitlement || entitlement.status !== 'active') throw new Error('active entitlement not found');
    if (
      !entitlement.proModule
      || (input.moduleId !== undefined && entitlement.proModule.moduleId !== input.moduleId)
      || (input.entitlementSku !== undefined && entitlement.proModule.entitlementSku !== input.entitlementSku)
      || (input.entitlementGrantKey !== undefined && entitlement.proModule.entitlementGrantKey !== input.entitlementGrantKey)
    ) {
      throw new Error('entitlement does not include requested Pro module');
    }
    if (entitlement.activation.licenseHash && entitlement.activation.licenseHash !== input.licenseHash.toLowerCase()) {
      throw new Error('entitlement is already claimed by another license');
    }
    const normalizedLicenseHash = input.licenseHash.toLowerCase();
    const wasAlreadyClaimed = entitlement.activation.licenseHash === normalizedLicenseHash;
    const claimed: MarketplaceEntitlement = {
      ...entitlement,
      activation: {
        ...entitlement.activation,
        licenseHash: normalizedLicenseHash,
        claimedAt: entitlement.activation.claimedAt ?? this.now(),
      },
    };
    this.entitlements.set(claimed.id, claimed);
    if (!wasAlreadyClaimed) {
      this.audit('entitlement.claimed', {
        actorId: 'system',
        actorType: 'system',
        entityType: 'entitlement',
        entityId: claimed.id,
        metadata: {
          orderId: claimed.orderId,
          moduleId: claimed.proModule?.moduleId,
          entitlementSku: claimed.proModule?.entitlementSku,
          entitlementGrantKey: claimed.proModule?.entitlementGrantKey,
        },
      });
    }
    return claimed;
  }

  auditRecords(filters?: {
    action?: MarketplaceAuditAction;
    actorId?: string;
    entityId?: string;
    since?: string;
  }): readonly MarketplaceAuditRecord[] {
    return this.options.auditLog?.list(filters) ?? [];
  }

  verifyAuditLog(): { valid: true } | { valid: false; brokenAt: string } {
    return this.options.auditLog?.verifyChain() ?? { valid: true };
  }

  private now(): number {
    return this.options.clock?.now() ?? Date.now();
  }

  private audit(action: MarketplaceAuditAction, input: {
    actorId: string;
    actorType: MarketplaceAuditRecord['actorType'];
    entityType: string;
    entityId: string;
    metadata?: Record<string, unknown>;
  }): void {
    this.options.auditLog?.append({ action, ...input });
  }

  private auditOrderMutation(
    order: MarketplaceOrder,
    payout: PayoutInstruction,
    entitlement: MarketplaceEntitlement | undefined,
    actorType: 'buyer' | 'webhook',
    metadata: Record<string, unknown> = {},
  ): void {
    this.audit('order.recorded', {
      actorId: actorType === 'buyer'
        ? auditActorId('buyer', order.buyerId)
        : 'webhook:stripe-checkout',
      actorType,
      entityType: 'order',
      entityId: order.id,
      metadata: {
        creatorId: order.creatorId,
        listingId: order.listingId,
        grossCents: order.grossCents,
        platformFeeCents: order.platformFeeCents,
        creatorNetCents: order.creatorNetCents,
        ...metadata,
      },
    });
    this.audit(payoutAuditAction(payout), {
      actorId: 'system',
      actorType: 'system',
      entityType: 'payout',
      entityId: payout.id,
      metadata: {
        orderId: order.id,
        creatorId: payout.creatorId,
        amountCents: payout.amountCents,
        status: payout.status,
        ...(payout.delivery ? { delivery: payout.delivery } : {}),
      },
    });
    if (entitlement) {
      this.audit('entitlement.granted', {
        actorId: 'system',
        actorType: 'system',
        entityType: 'entitlement',
        entityId: entitlement.id,
        metadata: {
          orderId: order.id,
          creatorId: entitlement.creatorId,
          listingId: entitlement.listingId,
          moduleId: entitlement.proModule?.moduleId,
        },
      });
    }
  }

  private creatorReviewContext(
    creatorId: string,
    explicit: { creatorRankByGmv?: number; creatorCount?: number },
  ): { listingRankByCreatorGmv?: number; creatorCount?: number } {
    if (explicit.creatorRankByGmv && explicit.creatorCount) {
      return {
        listingRankByCreatorGmv: explicit.creatorRankByGmv,
        creatorCount: explicit.creatorCount,
      };
    }
    const activeCreators = [...this.creators.values()].filter((creator) => creator.active);
    if (activeCreators.length < 10) return {};
    const ranked = activeCreators.sort((a, b) => (
      b.monthlyGmvCents - a.monthlyGmvCents
      || b.lifetimeGmvCents - a.lifetimeGmvCents
      || a.id.localeCompare(b.id)
    ));
    const index = ranked.findIndex((creator) => creator.id === creatorId);
    if (index === -1) return {};
    return {
      listingRankByCreatorGmv: index + 1,
      creatorCount: ranked.length,
    };
  }

  private createEntitlement(order: MarketplaceOrder, listing: MarketplaceListing): MarketplaceEntitlement | undefined {
    if (!listing.proModule) return undefined;
    const id = `entitlement-${++this.entitlementSeq}`;
    return {
      id,
      buyerId: order.buyerId,
      creatorId: order.creatorId,
      listingId: order.listingId,
      orderId: order.id,
      category: listing.category,
      status: 'active',
      issuedAt: order.createdAt,
      proModule: {
        moduleId: listing.proModule.manifest.id,
        moduleName: listing.proModule.manifest.name,
        moduleVersion: listing.proModule.manifest.version,
        payloadSha256: listing.proModule.payloadSha256,
        signatureKeyId: listing.proModule.signature.keyId,
        mountCount: listing.proModule.mountCount,
        entitlementSku: listing.proModule.entitlement.sku,
        entitlementGrantKey: listing.proModule.entitlement.grantKey,
        entitlementLicenseTier: listing.proModule.entitlement.licenseTier,
      },
      activation: {
        kind: 'greybox-license',
        lookupKey: this.createEntitlementLookupKey(),
      },
    };
  }

  private createEntitlementLookupKey(): string {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const lookupKey = `gbx_ent_${randomBytes(24).toString('base64url')}`;
      if (![...this.entitlements.values()].some((entitlement) => entitlement.activation.lookupKey === lookupKey)) {
        return lookupKey;
      }
    }
    throw new Error('could not allocate a unique entitlement lookup key');
  }

  private checkoutDestinationChargePayout(
    order: MarketplaceOrder,
    creator: Creator,
    fulfillment: {
      stripeCheckoutSessionId: string;
      stripePaymentIntentId?: string;
    },
  ): PayoutInstruction {
    const stripeConnectAccountId = creator.stripeConnectAccountId;
    const reserveBlocked = this.reserveBlockedPayout(order, creator, 'checkout-destination-charge', fulfillment);
    if (reserveBlocked) return reserveBlocked;
    return {
      id: stripeCheckoutPayoutId(fulfillment.stripeCheckoutSessionId),
      orderId: order.id,
      creatorId: creator.id,
      stripeConnectAccountId: stripeConnectAccountId ?? '',
      amountCents: order.creatorNetCents,
      currency: order.currency,
      status: stripeConnectAccountId ? 'sent' : 'blocked',
      delivery: 'checkout-destination-charge',
      stripeCheckoutSessionId: fulfillment.stripeCheckoutSessionId,
      ...(fulfillment.stripePaymentIntentId ? { stripePaymentIntentId: fulfillment.stripePaymentIntentId } : {}),
      ...(!stripeConnectAccountId ? { reason: 'stripe_connect_account_required' } : {}),
    };
  }

  private releaseCheckoutDestinationChargePayout(
    order: MarketplaceOrder,
    creator: Creator,
  ): PayoutInstruction {
    if (!order.stripeCheckoutSessionId) {
      throw new Error('Checkout destination-charge payout release requires a Checkout session id');
    }
    const stripeConnectAccountId = creator.stripeConnectAccountId;
    return {
      id: stripeCheckoutPayoutId(order.stripeCheckoutSessionId),
      orderId: order.id,
      creatorId: creator.id,
      stripeConnectAccountId: stripeConnectAccountId ?? '',
      amountCents: order.creatorNetCents,
      currency: order.currency,
      status: stripeConnectAccountId ? 'sent' : 'blocked',
      delivery: 'checkout-destination-charge',
      stripeCheckoutSessionId: order.stripeCheckoutSessionId,
      ...(order.stripePaymentIntentId ? { stripePaymentIntentId: order.stripePaymentIntentId } : {}),
      ...(!stripeConnectAccountId ? { reason: 'stripe_connect_account_required' } : {}),
    };
  }

  private checkoutResultForOrder(
    order: MarketplaceOrder,
    fulfillment: {
      stripeEventId: string;
      stripeCheckoutSessionId: string;
      stripePaymentIntentId?: string;
    },
    idempotent: boolean,
  ): MarketplaceCheckoutFulfillmentResult {
    const payout = order.payoutId ? this.payouts.get(order.payoutId) : undefined;
    const taxRecord = order.taxRecordId ? this.taxRecords.get(order.taxRecordId) : undefined;
    if (!payout || !taxRecord) throw new Error('stored Checkout order is missing payout or tax record');
    const entitlement = [...this.entitlements.values()].find((item) => item.orderId === order.id);
    return {
      order,
      payout,
      taxRecord,
      ...(entitlement ? { entitlement } : {}),
      stripeEventId: fulfillment.stripeEventId,
      stripeCheckoutSessionId: fulfillment.stripeCheckoutSessionId,
      ...(fulfillment.stripePaymentIntentId ? { stripePaymentIntentId: fulfillment.stripePaymentIntentId } : {}),
      idempotent,
    };
  }

  private recordPayoutReceiptIfSettlementReady(
    order: MarketplaceOrder,
    payout: PayoutInstruction,
    stripeEventId?: string,
  ): MarketplaceEventReceipt | undefined {
    if (!this.payoutSettlementIntegrityMatches(order, payout)) return undefined;
    if (payout.status === 'blocked') return undefined;
    if (payout.delivery === 'checkout-destination-charge') {
      if (!payout.stripeCheckoutSessionId || payout.stripeCheckoutSessionId !== order.stripeCheckoutSessionId) {
        return undefined;
      }
      return this.recordEventReceipt({
        kind: 'payout',
        source: 'stripe_object',
        receiptKey: payout.stripeCheckoutSessionId,
        orderId: order.id,
        payoutId: payout.id,
        ...(stripeEventId ? { stripeEventId } : {}),
        stripeCheckoutSessionId: payout.stripeCheckoutSessionId,
        ...(payout.stripePaymentIntentId ? { stripePaymentIntentId: payout.stripePaymentIntentId } : {}),
        amountCents: payout.amountCents,
        status: 'settled',
      });
    }
    if (!STRIPE_TRANSFER_ID_PATTERN.test(payout.id)) return undefined;
    return this.recordEventReceipt({
      kind: 'payout',
      source: 'stripe_object',
      receiptKey: payout.id,
      orderId: order.id,
      payoutId: payout.id,
      stripeTransferId: payout.id,
      ...(payout.stripeTransferBalanceTransactionId
        ? { stripeTransferBalanceTransactionId: payout.stripeTransferBalanceTransactionId }
        : {}),
      amountCents: payout.amountCents,
      status: 'settled',
    });
  }

  private payoutSettlementIntegrityMatches(order: MarketplaceOrder, payout: PayoutInstruction): boolean {
    return order.payoutId === payout.id
      && payout.orderId === order.id
      && payout.creatorId === order.creatorId
      && payout.amountCents === order.creatorNetCents
      && payout.currency === order.currency;
  }

  private recordReceiptForRiskEvent(event: MarketplaceRiskEvent, stripeEventId?: string): void {
    if (event.type === 'refund' && event.stripeRefundId) {
      this.recordEventReceipt({
        kind: 'refund',
        source: 'stripe_object',
        receiptKey: event.stripeRefundId,
        orderId: event.orderId,
        riskEventId: event.id,
        ...(stripeEventId ? { stripeEventId } : {}),
        stripeRefundId: event.stripeRefundId,
        amountCents: event.amountCents,
        status: event.status,
      });
      if (stripeEventId) {
        this.recordEventReceipt({
          kind: 'refund',
          source: 'stripe_event',
          receiptKey: stripeEventId,
          orderId: event.orderId,
          riskEventId: event.id,
          stripeEventId,
          stripeRefundId: event.stripeRefundId,
          amountCents: event.amountCents,
          status: event.status,
        });
      }
    } else if (event.type === 'dispute' && event.stripeDisputeId) {
      this.recordEventReceipt({
        kind: 'dispute',
        source: 'stripe_object',
        receiptKey: event.stripeDisputeId,
        orderId: event.orderId,
        riskEventId: event.id,
        ...(stripeEventId ? { stripeEventId } : {}),
        stripeDisputeId: event.stripeDisputeId,
        amountCents: event.amountCents,
        status: event.status,
      });
      if (stripeEventId) {
        this.recordEventReceipt({
          kind: 'dispute',
          source: 'stripe_event',
          receiptKey: stripeEventId,
          orderId: event.orderId,
          riskEventId: event.id,
          stripeEventId,
          stripeDisputeId: event.stripeDisputeId,
          amountCents: event.amountCents,
          status: event.status,
        });
      }
    }
  }

  private recordAdminRefundReceipt(
    order: MarketplaceOrder,
    amountCents: number,
    refund: RefundProviderResult,
    riskEvent: MarketplaceRiskEvent,
    idempotencyKey = marketplaceRefundIdempotencyKey(order.id, amountCents),
  ): void {
    this.recordEventReceipt({
      kind: 'admin_refund',
      source: 'idempotency_key',
      receiptKey: idempotencyKey,
      orderId: order.id,
      riskEventId: riskEvent.id,
      stripeRefundId: refund.stripeRefundId,
      ...(order.stripePaymentIntentId ? { stripePaymentIntentId: order.stripePaymentIntentId } : {}),
      amountCents,
      status: refund.status,
    });
  }

  private recordEventReceipt(input: {
    kind: MarketplaceEventReceiptKind;
    source: MarketplaceEventReceiptSource;
    receiptKey: string;
    orderId?: string;
    payoutId?: string;
    riskEventId?: string;
    stripeEventId?: string;
    stripeTransferId?: string;
    stripeTransferBalanceTransactionId?: string;
    stripeCheckoutSessionId?: string;
    stripePaymentIntentId?: string;
    stripeRefundId?: string;
    stripeDisputeId?: string;
    amountCents?: number;
    status?: string;
  }): MarketplaceEventReceipt {
    const receiptKey = input.receiptKey.trim();
    if (!receiptKey) throw new Error('event receipt key is required');
    const id = marketplaceEventReceiptId(input.kind, input.source, receiptKey);
    const existing = this.eventReceipts.get(id);
    const now = this.now();
    const next: MarketplaceEventReceipt = {
      ...(existing ?? {
        id,
        kind: input.kind,
        source: input.source,
        receiptKey,
        replayCount: 0,
        createdAt: now,
      }),
      ...(input.orderId ? { orderId: input.orderId } : {}),
      ...(input.payoutId ? { payoutId: input.payoutId } : {}),
      ...(input.riskEventId ? { riskEventId: input.riskEventId } : {}),
      ...(input.stripeEventId && !existing?.stripeEventId ? { stripeEventId: input.stripeEventId } : {}),
      ...(input.stripeEventId ? { lastStripeEventId: input.stripeEventId } : {}),
      ...(input.stripeTransferId ? { stripeTransferId: input.stripeTransferId } : {}),
      ...(input.stripeTransferBalanceTransactionId ? { stripeTransferBalanceTransactionId: input.stripeTransferBalanceTransactionId } : {}),
      ...(input.stripeCheckoutSessionId ? { stripeCheckoutSessionId: input.stripeCheckoutSessionId } : {}),
      ...(input.stripePaymentIntentId ? { stripePaymentIntentId: input.stripePaymentIntentId } : {}),
      ...(input.stripeRefundId ? { stripeRefundId: input.stripeRefundId } : {}),
      ...(input.stripeDisputeId ? { stripeDisputeId: input.stripeDisputeId } : {}),
      ...(input.amountCents !== undefined ? { amountCents: input.amountCents } : {}),
      ...(input.status ? { status: input.status } : {}),
      replayCount: existing ? existing.replayCount + 1 : 0,
      updatedAt: now,
    };
    this.eventReceipts.set(next.id, next);
    return clone(next);
  }

  private assertCheckoutReplayMatchesOrder(
    order: MarketplaceOrder,
    fulfillment: MarketplaceCheckoutFulfillment,
  ): void {
    const taxRecord = order.taxRecordId ? this.taxRecords.get(order.taxRecordId) : undefined;
    const mismatches = [
      order.stripeCheckoutSessionId !== fulfillment.stripeCheckoutSessionId,
      order.listingId !== fulfillment.listingId,
      order.creatorId !== fulfillment.creatorId,
      order.buyerId !== fulfillment.buyerId,
      order.currency !== fulfillment.currency,
      order.grossCents !== fulfillment.amountSubtotalCents,
      fulfillment.checkoutReference !== stripeCheckoutReferenceFor(order.listingId, order.buyerId),
      order.stripePaymentIntentId !== fulfillment.stripePaymentIntentId,
      taxRecord?.taxAmountCents !== fulfillment.taxAmountCents,
      taxRecord?.buyerCountry !== fulfillment.buyerTaxAddress?.country,
      taxRecord?.buyerPostalCode !== fulfillment.buyerTaxAddress?.postalCode,
      taxRecord?.stripeTaxLiabilityType !== fulfillment.automaticTaxLiabilityType,
      taxRecord?.stripeTaxLiabilityAccount !== fulfillment.automaticTaxLiabilityAccount,
    ];
    if (mismatches.some(Boolean)) {
      throw new Error('Checkout Session replay does not match stored order');
    }
  }

  private assertCheckoutTaxLiabilityMatchesCreator(
    fulfillment: MarketplaceCheckoutFulfillment,
    creator: Creator,
  ): void {
    if (fulfillment.automaticTaxStatus !== 'complete') return;
    if (fulfillment.automaticTaxLiabilityType !== 'account') {
      throw new Error('Checkout tax liability must be connected-account delegated');
    }
    if (!creator.stripeConnectAccountId || fulfillment.automaticTaxLiabilityAccount !== creator.stripeConnectAccountId) {
      throw new Error('Checkout tax liability account does not match the creator Stripe Connect account');
    }
  }

  private ordersInPeriod(period: {
    from?: number;
    to?: number;
  }): MarketplaceOrder[] {
    return [...this.orders.values()]
      .filter((order) => period.from === undefined || order.createdAt >= period.from)
      .filter((order) => period.to === undefined || order.createdAt < period.to)
      .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  }

  private settlementLine(order: MarketplaceOrder): MarketplaceSettlementLine {
    const creator = this.creators.get(order.creatorId);
    const listing = this.listings.get(order.listingId);
    const payout = order.payoutId ? this.payouts.get(order.payoutId) : undefined;
    const taxRecord = order.taxRecordId ? this.taxRecords.get(order.taxRecordId) : undefined;
    const payoutEvidence = payout ? this.payoutSettlementEvidence(order, payout) : undefined;
    const payoutSettlementStatus = payout?.status === 'blocked'
      ? 'blocked'
      : payoutEvidence
        ? 'settled'
        : 'queued';
    return {
      orderId: order.id,
      creatorId: order.creatorId,
      ...(creator?.displayName ? { creatorDisplayName: creator.displayName } : {}),
      listingId: order.listingId,
      ...(listing?.title ? { listingTitle: listing.title } : {}),
      ...(listing?.category ? { category: listing.category } : {}),
      buyerId: settlementBuyerId(order.buyerId),
      createdAt: order.createdAt,
      currency: order.currency,
      grossCents: order.grossCents,
      platformFeeCents: order.platformFeeCents,
      creatorNetCents: order.creatorNetCents,
      ...(payout?.id ? { payoutId: payout.id } : {}),
      ...(payout?.status ? { payoutStatus: payout.status } : {}),
      ...(payout?.delivery ? { payoutDelivery: payout.delivery } : {}),
      payoutCents: payout?.amountCents ?? 0,
      payoutSettlementStatus,
      ...(payoutEvidence?.kind ? { payoutEvidenceKind: payoutEvidence.kind } : {}),
      ...(payoutEvidence?.receiptId ? { payoutEvidenceReceiptId: payoutEvidence.receiptId } : {}),
      ...(payoutEvidence?.stripeTransferId ? { stripeTransferId: payoutEvidence.stripeTransferId } : {}),
      ...(payoutEvidence?.stripeTransferBalanceTransactionId
        ? { stripeTransferBalanceTransactionId: payoutEvidence.stripeTransferBalanceTransactionId }
        : {}),
      ...(taxRecord?.id ? { taxRecordId: taxRecord.id } : {}),
      taxAmountCents: taxRecord?.taxAmountCents ?? 0,
      ...(taxRecord?.stripeTaxCalculationId ? { stripeTaxCalculationId: taxRecord.stripeTaxCalculationId } : {}),
      ...(taxRecord?.stripeTaxTransactionId ? { stripeTaxTransactionId: taxRecord.stripeTaxTransactionId } : {}),
      ...(order.stripeCheckoutSessionId ? { stripeCheckoutSessionId: order.stripeCheckoutSessionId } : {}),
      ...(order.stripePaymentIntentId ? { stripePaymentIntentId: order.stripePaymentIntentId } : {}),
    };
  }

  private payoutSettlementEvidence(
    order: MarketplaceOrder,
    payout: PayoutInstruction,
  ): {
    kind: NonNullable<MarketplaceSettlementLine['payoutEvidenceKind']>;
    receiptId: string;
    stripeTransferId?: string;
    stripeTransferBalanceTransactionId?: string;
  } | undefined {
    if (!this.payoutSettlementIntegrityMatches(order, payout)) return undefined;
    if (payout.status === 'blocked') return undefined;
    if (payout.delivery === 'checkout-destination-charge') {
      if (!payout.stripeCheckoutSessionId || payout.stripeCheckoutSessionId !== order.stripeCheckoutSessionId) {
        return undefined;
      }
      const receipt = this.eventReceipts.get(marketplaceEventReceiptId(
        'payout',
        'stripe_object',
        payout.stripeCheckoutSessionId,
      ));
      if (!receipt || receipt.payoutId !== payout.id || receipt.orderId !== order.id) return undefined;
      return {
        kind: 'checkout_destination_charge',
        receiptId: receipt.id,
      };
    }
    if (!STRIPE_TRANSFER_ID_PATTERN.test(payout.id)) return undefined;
    const receipt = this.eventReceipts.get(marketplaceEventReceiptId('payout', 'stripe_object', payout.id));
    if (
      !receipt
      || receipt.payoutId !== payout.id
      || receipt.orderId !== order.id
      || receipt.stripeTransferId !== payout.id
      || receipt.amountCents !== payout.amountCents
    ) {
      return undefined;
    }
    return {
      kind: 'stripe_transfer',
      receiptId: receipt.id,
      stripeTransferId: receipt.stripeTransferId,
      ...(receipt.stripeTransferBalanceTransactionId
        ? { stripeTransferBalanceTransactionId: receipt.stripeTransferBalanceTransactionId }
        : {}),
    };
  }

  private reconcileOrder(order: MarketplaceOrder, issues: MarketplaceReconciliationIssue[]): void {
    if (order.platformFeeCents + order.creatorNetCents !== order.grossCents) {
      issues.push({
        code: 'order_split_mismatch',
        severity: 'error',
        referenceType: 'order',
        referenceId: order.id,
        detail: 'Platform fee plus creator net does not equal gross order amount.',
        remediation: 'Recompute the order split before settlement.',
      });
    }

    const creator = this.creators.get(order.creatorId);
    if (!creator) {
      issues.push({
        code: 'creator_missing',
        severity: 'error',
        referenceType: 'creator',
        referenceId: order.creatorId,
        detail: 'Order references a creator that is no longer present.',
        remediation: 'Restore the creator ledger record before payout or tax review.',
      });
    }

    const listing = this.listings.get(order.listingId);
    if (!listing) {
      issues.push({
        code: 'listing_missing',
        severity: 'error',
        referenceType: 'listing',
        referenceId: order.listingId,
        detail: 'Order references a listing that is no longer present.',
        remediation: 'Restore the listing snapshot before customer support or tax review.',
      });
    }

    this.reconcilePayout(order, issues);
    this.reconcileTaxRecord(order, issues);
    if (order.stripeCheckoutSessionId) this.reconcileCheckoutOrder(order, issues);
    this.reconcileEntitlement(order, listing, issues);
  }

  private reconcilePayout(order: MarketplaceOrder, issues: MarketplaceReconciliationIssue[]): void {
    if (!order.payoutId) {
      issues.push({
        code: 'payout_missing',
        severity: 'error',
        referenceType: 'order',
        referenceId: order.id,
        detail: 'Order does not reference a payout instruction.',
        remediation: 'Create a Stripe Connect payout instruction or explicit blocked-payout record.',
      });
      return;
    }
    const payout = this.payouts.get(order.payoutId);
    if (!payout) {
      issues.push({
        code: 'payout_record_missing',
        severity: 'error',
        referenceType: 'payout',
        referenceId: order.payoutId,
        detail: 'Order payout id is not present in the payout ledger.',
        remediation: 'Recover the payout record before settlement.',
      });
      return;
    }
    if (payout.orderId !== order.id) {
      issues.push({
        code: 'payout_order_mismatch',
        severity: 'error',
        referenceType: 'payout',
        referenceId: payout.id,
        detail: 'Payout order id does not match the order that references it.',
        remediation: 'Do not release payout until the order and payout records agree.',
      });
    }
    if (payout.amountCents !== order.creatorNetCents) {
      issues.push({
        code: 'payout_amount_mismatch',
        severity: 'error',
        referenceType: 'payout',
        referenceId: payout.id,
        detail: 'Payout amount does not equal creator net amount.',
        remediation: 'Regenerate the payout instruction from the stored order split.',
      });
    }
    if (payout.status === 'blocked') {
      issues.push({
        code: 'payout_blocked',
        severity: 'warning',
        referenceType: 'payout',
        referenceId: payout.id,
        detail: payout.reason ?? 'Payout is blocked.',
        remediation: 'Complete creator onboarding and tax profile collection before release.',
      });
    }
  }

  private reconcileTaxRecord(order: MarketplaceOrder, issues: MarketplaceReconciliationIssue[]): void {
    if (!order.taxRecordId) {
      issues.push({
        code: 'tax_record_missing',
        severity: 'error',
        referenceType: 'order',
        referenceId: order.id,
        detail: 'Order does not reference tax evidence.',
        remediation: 'Attach Stripe Tax or delegated tax evidence before closing the order.',
      });
      return;
    }
    const taxRecord = this.taxRecords.get(order.taxRecordId);
    if (!taxRecord) {
      issues.push({
        code: 'tax_record_not_found',
        severity: 'error',
        referenceType: 'tax-record',
        referenceId: order.taxRecordId,
        detail: 'Order tax record id is not present in the tax ledger.',
        remediation: 'Recover the tax record before tax reporting.',
      });
      return;
    }
    if (taxRecord.orderId !== order.id || taxRecord.creatorId !== order.creatorId || taxRecord.grossCents !== order.grossCents) {
      issues.push({
        code: 'tax_record_mismatch',
        severity: 'error',
        referenceType: 'tax-record',
        referenceId: taxRecord.id,
        detail: 'Tax record does not match order, creator, or gross amount.',
        remediation: 'Regenerate tax evidence from the stored order snapshot.',
      });
    }
    if (order.stripeCheckoutSessionId && taxRecord.stripeAutomaticTaxStatus !== 'complete') {
      issues.push({
        code: 'checkout_tax_incomplete',
        severity: 'error',
        referenceType: 'tax-record',
        referenceId: taxRecord.id,
        detail: 'Checkout order is missing completed automatic-tax evidence.',
        remediation: 'Reject or replay the Stripe Checkout event after automatic tax is complete.',
      });
    }
  }

  private reconcileCheckoutOrder(order: MarketplaceOrder, issues: MarketplaceReconciliationIssue[]): void {
    const payout = order.payoutId ? this.payouts.get(order.payoutId) : undefined;
    const taxRecord = order.taxRecordId ? this.taxRecords.get(order.taxRecordId) : undefined;
    if (payout?.delivery !== 'checkout-destination-charge') {
      issues.push({
        code: 'checkout_payout_delivery_mismatch',
        severity: 'error',
        referenceType: 'payout',
        referenceId: payout?.id ?? order.id,
        detail: 'Checkout order payout is not marked as a destination charge.',
        remediation: 'Ensure Checkout fulfillment records Stripe destination-charge delivery.',
      });
    }
    if (payout?.stripeCheckoutSessionId !== order.stripeCheckoutSessionId) {
      issues.push({
        code: 'checkout_payout_session_mismatch',
        severity: 'error',
        referenceType: 'payout',
        referenceId: payout?.id ?? order.id,
        detail: 'Payout Checkout Session id does not match the order.',
        remediation: 'Reconcile the payout record against the Stripe Checkout Session.',
      });
    }
    if (taxRecord?.stripeCheckoutSessionId !== order.stripeCheckoutSessionId) {
      issues.push({
        code: 'checkout_tax_session_mismatch',
        severity: 'error',
        referenceType: 'tax-record',
        referenceId: taxRecord?.id ?? order.id,
        detail: 'Tax record Checkout Session id does not match the order.',
        remediation: 'Reconcile tax evidence against the Stripe Checkout Session.',
      });
    }
    if (taxRecord?.stripeTaxLiabilityType !== 'account' || taxRecord?.stripeTaxLiabilityAccount !== payout?.stripeConnectAccountId) {
      issues.push({
        code: 'checkout_tax_liability_mismatch',
        severity: 'error',
        referenceType: 'tax-record',
        referenceId: taxRecord?.id ?? order.id,
        detail: 'Checkout tax liability is not delegated to the payout Stripe Connect account.',
        remediation: 'Replay or reject the Stripe Checkout event until automatic-tax liability matches the creator account.',
      });
    }
  }

  private reconcileEntitlement(
    order: MarketplaceOrder,
    listing: MarketplaceListing | undefined,
    issues: MarketplaceReconciliationIssue[],
  ): void {
    const orderEntitlements = [...this.entitlements.values()].filter((entitlement) => entitlement.orderId === order.id);
    if (listing?.proModule) {
      const accessReversed = this.isOrderAccessReversed(order);
      if (orderEntitlements.length !== 1) {
        issues.push({
          code: 'pro_module_entitlement_count_mismatch',
          severity: 'error',
          referenceType: 'order',
          referenceId: order.id,
          detail: accessReversed
            ? 'Payment-reversed Pro module order must retain exactly one revoked entitlement for audit history.'
            : 'Pro module order must have exactly one active entitlement.',
          remediation: accessReversed
            ? 'Restore the revoked entitlement record from the reversal audit trail.'
            : 'Issue or deduplicate the Pro module entitlement before cloud activation.',
        });
        return;
      }
      const [entitlement] = orderEntitlements;
      const expectedStatus: MarketplaceEntitlement['status'] = accessReversed ? 'revoked' : 'active';
      if (!entitlement || entitlement.status !== expectedStatus || entitlement.proModule?.moduleId !== listing.proModule.manifest.id) {
        issues.push({
          code: 'pro_module_entitlement_mismatch',
          severity: 'error',
          referenceType: 'entitlement',
          referenceId: entitlement?.id ?? order.id,
          detail: accessReversed
            ? 'Payment-reversed Pro module entitlement must be revoked and point at the signed module.'
            : 'Pro module entitlement is missing, revoked, or points at the wrong module.',
          remediation: accessReversed
            ? 'Revoke the entitlement generated for this payment-reversed order without deleting its audit record.'
            : 'Regenerate entitlement metadata from the signed listing manifest.',
        });
      }
    } else if (orderEntitlements.length > 0) {
      issues.push({
        code: 'unexpected_entitlement',
        severity: 'warning',
        referenceType: 'order',
        referenceId: order.id,
        detail: 'Non-Pro-module order has entitlement records attached.',
        remediation: 'Review entitlement issuance rules for this listing category.',
      });
    }
  }
}

const DEFAULT_LAUNCH_READINESS_TARGETS: MarketplaceLaunchReadinessTargets = {
  monthlyGmvCents: 2_500_000,
  activeCreatorsWithSales: 50,
  minimumPublishedListings: 50,
  maximumPendingHumanReviews: 0,
  maximumBlockedPayouts: 0,
  maximumTaxComplianceIssues: 0,
};

const DEFAULT_CREATOR_ACTIVATION_TARGETS: MarketplaceCreatorActivationTargets = {
  monthlyGmvCents: 2_500_000,
  activeCreatorsWithSales: 50,
  minimumActiveCreators: 50,
  repeatSellers: 10,
  repeatSellerMinimumOrders: 2,
};

const DEFAULT_PLATFORM_READINESS_TARGETS: MarketplacePlatformReadinessTargets = {
  monthlyGmvCents: 25_000_000,
  activeCreatorsWithSales: 200,
  minimumUniqueBuyers: 200,
  minimumPublishedListings: 200,
  repeatSellers: 50,
  repeatSellerMinimumOrders: 2,
  maximumTopCreatorGmvShareBps: 2_500,
  maximumTopBuyerGmvShareBps: 2_500,
  minimumPlatformTakeRateBps: 800,
  minimumCheckoutOrderShareBps: 9_000,
  minimumCheckoutGmvShareBps: 9_000,
  minimumSettledPayoutShareBps: 9_000,
  maximumPendingHumanReviews: 10,
  maximumBlockedPayouts: 0,
  maximumTaxComplianceIssues: 0,
  availableReserveCents: 0,
  reportedRefundsCents: 0,
  reportedDisputeCents: 0,
  minimumReserveBps: 500,
  minimumReserveCents: 100_000,
  maximumRefundRateBps: 1_000,
  maximumDisputeRateBps: 100,
  maximumUnreservedPayoutExposureBps: 2_000,
};

const DEFAULT_RISK_RESERVE_ASSUMPTIONS: Required<Omit<MarketplaceRiskReserveOptions, 'from' | 'to'>> = {
  availableReserveCents: 0,
  reportedRefundsCents: 0,
  reportedDisputeCents: 0,
  minimumReserveBps: 500,
  minimumReserveCents: 100_000,
  maximumRefundRateBps: 1_000,
  maximumDisputeRateBps: 100,
  maximumUnreservedPayoutExposureBps: 2_000,
};

export function marketplacePayoutReservePolicyFromEnv(
  env: MarketplacePayoutReservePolicyEnv,
): MarketplacePayoutReservePolicy | undefined {
  const mode = env.GREYBOX_MARKETPLACE_PAYOUT_RESERVE_MODE?.trim().toLowerCase();
  const policy: MarketplacePayoutReservePolicy = {
    ...(mode ? { mode: payoutReserveMode(mode) } : {}),
    ...reserveEnvNumber(env, 'GREYBOX_MARKETPLACE_AVAILABLE_RESERVE_CENTS', 'availableReserveCents'),
    ...reserveEnvNumber(env, 'GREYBOX_MARKETPLACE_REPORTED_REFUNDS_CENTS', 'reportedRefundsCents'),
    ...reserveEnvNumber(env, 'GREYBOX_MARKETPLACE_REPORTED_DISPUTE_CENTS', 'reportedDisputeCents'),
    ...reserveEnvNumber(env, 'GREYBOX_MARKETPLACE_MINIMUM_RESERVE_BPS', 'minimumReserveBps'),
    ...reserveEnvNumber(env, 'GREYBOX_MARKETPLACE_MINIMUM_RESERVE_CENTS', 'minimumReserveCents'),
    ...reserveEnvNumber(env, 'GREYBOX_MARKETPLACE_MAXIMUM_REFUND_RATE_BPS', 'maximumRefundRateBps'),
    ...reserveEnvNumber(env, 'GREYBOX_MARKETPLACE_MAXIMUM_DISPUTE_RATE_BPS', 'maximumDisputeRateBps'),
    ...reserveEnvNumber(
      env,
      'GREYBOX_MARKETPLACE_MAXIMUM_UNRESERVED_PAYOUT_EXPOSURE_BPS',
      'maximumUnreservedPayoutExposureBps',
    ),
  };
  return Object.keys(policy).length > 0 ? normalizePayoutReservePolicy(policy) : undefined;
}

function normalizePayoutReservePolicy(policy: MarketplacePayoutReservePolicy): MarketplacePayoutReservePolicy {
  const mode = policy.mode ?? 'audit';
  if (mode !== 'audit' && mode !== 'enforce') {
    throw new Error('payoutReservePolicy.mode must be audit or enforce');
  }
  riskReserveAssumptions(riskReserveOptionsFromPayoutPolicy(policy));
  return {
    ...policy,
    mode,
  };
}

function refundResultFromRiskEvent(event: MarketplaceRiskEvent): RefundProviderResult {
  const stripeRefundId = event.stripeRefundId;
  if (!stripeRefundId) throw new Error('refund risk event is missing stripeRefundId');
  if (isBlockedRefundRiskEvent(event)) {
    return {
      stripeRefundId,
      status: 'blocked',
      ...(event.reason ? { reason: event.reason } : {}),
    };
  }
  return {
    stripeRefundId,
    status: event.status === 'resolved' ? 'succeeded' : 'pending',
    ...(event.reason ? { reason: event.reason } : {}),
  };
}

function nextStripeRiskEventStatus(
  existing: MarketplaceRiskEventStatus,
  requested: MarketplaceRiskEventStatus | undefined,
): MarketplaceRiskEventStatus {
  if (!requested || requested === existing) return existing;
  if (requested === 'open' && existing !== 'open') return existing;
  if (existing !== 'open') throw new Error('risk event stripe status conflict');
  return requested;
}

function payoutReleaseBlockerFromRiskEvent(
  event: MarketplaceRiskEvent,
): NonNullable<MarketplacePayoutReleaseResult['releaseBlocker']> {
  return {
    code: event.type === 'refund' ? 'open_refund' : 'open_dispute',
    riskEventId: event.id,
    amountCents: event.amountCents,
    ...(event.reason ? { reason: event.reason } : {}),
  };
}

function payoutRiskEventPriority(event: MarketplaceRiskEvent): number {
  return event.type === 'dispute' ? 0 : 1;
}

function isBlockedRefundRiskEvent(event: MarketplaceRiskEvent): boolean {
  return event.refundBlocked === true || event.stripeRefundId?.startsWith('refund-failed-') === true;
}

function refundRiskEventCountsAgainstOrder(event: {
  status: MarketplaceRiskEventStatus;
  stripeRefundId?: string | undefined;
  refundBlocked?: boolean | undefined;
}): boolean {
  return event.status !== 'lost'
    && event.status !== 'won'
    && event.refundBlocked !== true
    && event.stripeRefundId?.startsWith('refund-failed-') !== true;
}

function riskReserveOptionsFromPayoutPolicy(policy: MarketplacePayoutReservePolicy): MarketplaceRiskReserveOptions {
  const { mode: _mode, ...options } = policy;
  return options;
}

function riskReserveOptionsFromPayoutReleaseInput(input: MarketplacePayoutReleaseInput): MarketplaceRiskReserveOptions {
  const { orderId: _orderId, actorId: _actorId, actorType: _actorType, ...options } = input;
  return options;
}

function isRiskReserveBlockedPayout(payout: PayoutInstruction): boolean {
  return payout.reason?.startsWith('risk_reserve_') === true;
}

function reserveEnvNumber<
  K extends Exclude<keyof MarketplaceRiskReserveOptions, 'from' | 'to'>,
>(
  env: MarketplacePayoutReservePolicyEnv,
  envKey: keyof MarketplacePayoutReservePolicyEnv,
  policyKey: K,
): Pick<MarketplaceRiskReserveOptions, K> | Record<string, never> {
  const raw = env[envKey];
  if (raw === undefined || raw.trim().length === 0) return {};
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${String(envKey)} must be a non-negative integer`);
  }
  return { [policyKey]: value } as Pick<MarketplaceRiskReserveOptions, K>;
}

function payoutReserveMode(value: string): 'audit' | 'enforce' {
  if (value === 'audit' || value === 'enforce') return value;
  throw new Error('GREYBOX_MARKETPLACE_PAYOUT_RESERVE_MODE must be audit or enforce');
}

function stripeConnectOnboardingProviderFrom(
  provider: PayoutProvider,
): StripeConnectOnboardingProvider | undefined {
  const candidate = provider as Partial<StripeConnectOnboardingProvider>;
  if (typeof candidate.createAccount === 'function' && typeof candidate.createAccountLink === 'function') {
    return candidate as StripeConnectOnboardingProvider;
  }
  return undefined;
}

function stripeConnectOnboardingCreatorSummary(creator: Creator): StripeConnectOnboardingLinkResult['creator'] {
  return {
    id: creator.id,
    displayName: creator.displayName,
    country: creator.country,
    active: creator.active,
    ...(creator.stripeConnectAccountId ? { stripeConnectAccountId: creator.stripeConnectAccountId } : {}),
    ...(creator.stripeConnectOnboardingComplete !== undefined ? { stripeConnectOnboardingComplete: creator.stripeConnectOnboardingComplete } : {}),
    ...(creator.stripeConnectTransfersEnabled !== undefined ? { stripeConnectTransfersEnabled: creator.stripeConnectTransfersEnabled } : {}),
    hasTaxProfile: Boolean(creator.taxProfileId),
  };
}

function safeCreatorPayoutReadiness(
  readiness: CreatorPayoutReadiness,
  hasTaxProfile: boolean,
): CreatorTaxProfileRecordResult['readiness'] {
  const { taxProfileId: _taxProfileId, ...safe } = readiness;
  return {
    ...safe,
    hasTaxProfile,
  };
}

function normalizeStripeConnectStatusSyncedAt(value: number): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error('Stripe Connect status syncedAt must be a positive integer timestamp');
  }
  return value;
}

function normalizeStripeConnectDisabledReason(value: string | undefined): string | undefined {
  const trimmed = value?.trim().toLowerCase();
  if (!trimmed) return undefined;
  if (!/^[a-z0-9_.:-]{1,80}$/u.test(trimmed)) {
    throw new Error('Stripe Connect disabledReason must be a safe Stripe status code');
  }
  return trimmed;
}

function normalizeTaxProfileId(value: string): string {
  const trimmed = value.trim();
  if (
    trimmed.length < 6
    || trimmed.length > 128
    || !/^[A-Za-z0-9_.:-]+$/u.test(trimmed)
    || trimmed.includes('@')
  ) {
    throw new Error('taxProfileId must be a provider reference id, not raw tax data');
  }
  return trimmed;
}

function normalizeTaxProfileProvider(
  value: CreatorTaxProfileRecordInput['provider'] | undefined,
): NonNullable<CreatorTaxProfileRecordInput['provider']> {
  const provider = value ?? 'manual-review';
  if (
    provider !== 'stripe-tax'
    && provider !== 'stripe-identity'
    && provider !== 'taxbit'
    && provider !== 'manual-review'
    && provider !== 'external'
  ) {
    throw new Error('tax profile provider is not supported');
  }
  return provider;
}

function normalizeTaxProfileCollectedAt(value: number): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error('tax profile collectedAt must be a positive integer timestamp');
  }
  return value;
}

function normalizeTaxProfileCountry(value: string): string {
  const country = value.trim().toUpperCase();
  if (!/^[A-Z]{2}$/u.test(country)) {
    throw new Error('tax profile country must be an ISO 3166-1 alpha-2 country code');
  }
  return country;
}

function launchReadinessTargets(
  overrides: Partial<MarketplaceLaunchReadinessTargets>,
): MarketplaceLaunchReadinessTargets {
  const targets = {
    ...DEFAULT_LAUNCH_READINESS_TARGETS,
    ...overrides,
  };
  for (const [key, value] of Object.entries(targets)) {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`${key} must be a non-negative integer`);
    }
  }
  return targets;
}

function creatorActivationTargets(
  overrides: Partial<MarketplaceCreatorActivationTargets>,
): MarketplaceCreatorActivationTargets {
  const targets = {
    ...DEFAULT_CREATOR_ACTIVATION_TARGETS,
    ...overrides,
  };
  for (const [key, value] of Object.entries(targets)) {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`${key} must be a non-negative integer`);
    }
  }
  if (targets.repeatSellerMinimumOrders < 1) {
    throw new Error('repeatSellerMinimumOrders must be a positive integer');
  }
  return targets;
}

function platformReadinessTargets(
  overrides: Partial<MarketplacePlatformReadinessTargets>,
): MarketplacePlatformReadinessTargets {
  const targets = {
    ...DEFAULT_PLATFORM_READINESS_TARGETS,
    ...overrides,
  };
  for (const [key, value] of Object.entries(targets)) {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`${key} must be a non-negative integer`);
    }
  }
  if (targets.repeatSellerMinimumOrders < 1) {
    throw new Error('repeatSellerMinimumOrders must be a positive integer');
  }
  if (targets.maximumTopCreatorGmvShareBps < 1 || targets.maximumTopCreatorGmvShareBps > 10_000) {
    throw new Error('maximumTopCreatorGmvShareBps must be between 1 and 10000');
  }
  if (targets.maximumTopBuyerGmvShareBps < 1 || targets.maximumTopBuyerGmvShareBps > 10_000) {
    throw new Error('maximumTopBuyerGmvShareBps must be between 1 and 10000');
  }
  if (targets.minimumPlatformTakeRateBps > 10_000) {
    throw new Error('minimumPlatformTakeRateBps must be between 0 and 10000');
  }
  if (targets.minimumCheckoutOrderShareBps > 10_000) {
    throw new Error('minimumCheckoutOrderShareBps must be between 0 and 10000');
  }
  if (targets.minimumCheckoutGmvShareBps > 10_000) {
    throw new Error('minimumCheckoutGmvShareBps must be between 0 and 10000');
  }
  if (targets.minimumSettledPayoutShareBps > 10_000) {
    throw new Error('minimumSettledPayoutShareBps must be between 0 and 10000');
  }
  return targets;
}

function riskReserveOptionsFromPlatformTargets(
  targets: MarketplacePlatformReadinessTargets,
  period: MarketplaceStatsPeriod,
): MarketplaceRiskReserveOptions {
  return {
    from: period.from,
    to: period.to,
    availableReserveCents: targets.availableReserveCents,
    reportedRefundsCents: targets.reportedRefundsCents,
    reportedDisputeCents: targets.reportedDisputeCents,
    minimumReserveBps: targets.minimumReserveBps,
    minimumReserveCents: targets.minimumReserveCents,
    maximumRefundRateBps: targets.maximumRefundRateBps,
    maximumDisputeRateBps: targets.maximumDisputeRateBps,
    maximumUnreservedPayoutExposureBps: targets.maximumUnreservedPayoutExposureBps,
  };
}

function riskReserveAssumptions(
  overrides: MarketplaceRiskReserveOptions,
): Required<Omit<MarketplaceRiskReserveOptions, 'from' | 'to'>> {
  const { from: _from, to: _to, ...assumptionOverrides } = overrides;
  const assumptions = {
    ...DEFAULT_RISK_RESERVE_ASSUMPTIONS,
    ...assumptionOverrides,
  };
  for (const [key, value] of Object.entries(assumptions)) {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`${key} must be a non-negative integer`);
    }
  }
  if (assumptions.minimumReserveBps > 10_000) throw new Error('minimumReserveBps must be between 0 and 10000');
  if (assumptions.maximumRefundRateBps > 10_000) throw new Error('maximumRefundRateBps must be between 0 and 10000');
  if (assumptions.maximumDisputeRateBps > 10_000) throw new Error('maximumDisputeRateBps must be between 0 and 10000');
  if (assumptions.maximumUnreservedPayoutExposureBps > 10_000) {
    throw new Error('maximumUnreservedPayoutExposureBps must be between 0 and 10000');
  }
  return assumptions;
}

function riskReservePeriod(options: MarketplaceRiskReserveOptions): MarketplaceSettlementPeriod {
  return {
    ...(options.from !== undefined ? { from: options.from } : {}),
    ...(options.to !== undefined ? { to: options.to } : {}),
  };
}

function hasRiskReservePeriod(period: MarketplaceSettlementPeriod): boolean {
  return period.from !== undefined || period.to !== undefined;
}

function orderWithinPeriod(order: MarketplaceOrder, period: MarketplaceSettlementPeriod): boolean {
  return (period.from === undefined || order.createdAt >= period.from)
    && (period.to === undefined || order.createdAt < period.to);
}

function isRiskEventType(value: unknown): value is MarketplaceRiskEventType {
  return value === 'refund' || value === 'dispute';
}

function isRiskEventStatus(value: unknown): value is MarketplaceRiskEventStatus {
  return value === 'open' || value === 'resolved' || value === 'lost' || value === 'won';
}

function sanitizeRiskEventReason(value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) return '';
  return trimmed
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{16,}(?=$|[^A-Za-z0-9._~+/=-])/giu, '[redacted-secret]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, '[redacted-email]')
    .replace(/(?<!\d)(?:\+\d{1,3}[\s.-]*)?(?:\(\d{3}\)|\d{3}[\s.-])[\s.-]*\d{3}[\s.-]\d{4}\b/gu, '[redacted-phone]')
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/gu, '[redacted-ip]')
    .replace(/\b(?:acct|ch|cs|cus|dp|evt|pi|re|taxcalc|tr|txr)_[A-Za-z0-9_]+\b/gu, '[redacted-stripe-id]')
    .replace(/\s+/gu, ' ')
    .slice(0, 280);
}

function inferRiskEventSeq(events: readonly MarketplaceRiskEvent[]): number {
  return events.reduce((max, event) => {
    const match = /^risk-(\d+)$/u.exec(event.id);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
}

function marketplaceEventReceiptId(
  kind: MarketplaceEventReceiptKind,
  source: MarketplaceEventReceiptSource,
  receiptKey: string,
): string {
  const digest = createHash('sha256')
    .update(`${kind}:${source}:${receiptKey}`)
    .digest('hex')
    .slice(0, 24);
  return `receipt-${digest}`;
}

function marketplaceRefundIdempotencyKey(orderId: string, amountCents: number): string {
  return `greybox-refund-${orderId}-${amountCents}`;
}

function requiredRiskReserveCents(input: {
  gmvCents: number;
  reportedRefundsCents: number;
  reportedDisputeCents: number;
  minimumReserveBps: number;
  minimumReserveCents: number;
}): number {
  const knownLossCents = input.reportedRefundsCents + input.reportedDisputeCents;
  if (input.gmvCents === 0 && knownLossCents === 0) return 0;
  return Math.max(
    input.minimumReserveCents,
    Math.ceil((input.gmvCents * input.minimumReserveBps) / 10_000),
    knownLossCents,
  );
}

function riskReserveIssues(
  summary: MarketplaceRiskReserveReport['summary'],
  assumptions: MarketplaceRiskReserveReport['assumptions'],
): MarketplaceRiskReserveIssue[] {
  const issues: MarketplaceRiskReserveIssue[] = [];
  if (summary.reserveShortfallCents > 0) {
    issues.push({
      code: 'reserve_shortfall',
      severity: 'error',
      referenceType: 'stats',
      referenceId: 'risk-reserve',
      detail: `Reserve is short by ${summary.reserveShortfallCents} cents against the configured marketplace risk policy.`,
      remediation: 'Hold more platform cash or lower release velocity before turning on higher-GMV paid traffic.',
    });
  }
  if (summary.refundRateBps > assumptions.maximumRefundRateBps) {
    issues.push({
      code: 'refund_rate_high',
      severity: 'error',
      referenceType: 'stats',
      referenceId: 'reported-refunds',
      detail: `Refund rate is ${summary.refundRateBps} bps, above the ${assumptions.maximumRefundRateBps} bps policy limit.`,
      remediation: 'Pause promotion for weak listings, review creator quality, and hold payouts until refund causes are resolved.',
    });
  }
  if (summary.disputeRateBps > assumptions.maximumDisputeRateBps) {
    issues.push({
      code: 'dispute_rate_high',
      severity: 'error',
      referenceType: 'stats',
      referenceId: 'reported-disputes',
      detail: `Dispute rate is ${summary.disputeRateBps} bps, above the ${assumptions.maximumDisputeRateBps} bps policy limit.`,
      remediation: 'Freeze affected listings and preserve Stripe dispute evidence before releasing creator payouts.',
    });
  }
  const payoutExposureBps = summary.gmvCents > 0
    ? Math.round((summary.queuedOrSentPayoutCents / summary.gmvCents) * 10_000)
    : 0;
  if (summary.reserveShortfallCents > 0 && payoutExposureBps > assumptions.maximumUnreservedPayoutExposureBps) {
    issues.push({
      code: 'unreserved_payout_exposure',
      severity: 'error',
      referenceType: 'payout',
      referenceId: 'queued-or-sent-payouts',
      detail: `${payoutExposureBps} bps of current GMV is queued or sent to creators while the reserve is underfunded.`,
      remediation: 'Delay payout release or increase the reserve before scaling paid marketplace volume.',
    });
  }
  if (summary.manualTransferOrders > 0) {
    issues.push({
      code: 'manual_transfer_exposure',
      severity: 'warning',
      referenceType: 'order',
      referenceId: 'direct-orders',
      detail: `${summary.manualTransferOrders} order(s) are not backed by Stripe Checkout destination-charge payout evidence.`,
      remediation: 'Move paid marketplace traffic through Stripe Checkout before public launch.',
    });
  }
  return issues;
}

function riskReserveChecks(
  issues: MarketplaceRiskReserveIssue[],
  summary: MarketplaceRiskReserveReport['summary'],
  assumptions: MarketplaceRiskReserveReport['assumptions'],
): MarketplaceRiskReserveCheck[] {
  return [
    riskReserveIssueCheck({
      id: 'reserve-coverage',
      label: 'Reserve coverage',
      issues,
      codes: ['reserve_shortfall'],
      passDetail: `${summary.availableReserveCents} cents reserve covers the ${summary.requiredReserveCents} cents requirement.`,
    }),
    riskReserveIssueCheck({
      id: 'refund-dispute-rate',
      label: 'Refund and dispute rates',
      issues,
      codes: ['refund_rate_high', 'dispute_rate_high'],
      passDetail: `${summary.refundRateBps} bps refund and ${summary.disputeRateBps} bps dispute rates are within policy.`,
    }),
    riskReserveIssueCheck({
      id: 'payout-exposure',
      label: 'Payout exposure',
      issues,
      codes: ['unreserved_payout_exposure', 'manual_transfer_exposure'],
      passDetail: `${summary.queuedOrSentPayoutCents} cents of payouts stay within the ${assumptions.maximumUnreservedPayoutExposureBps} bps exposure policy.`,
    }),
  ];
}

function riskReserveIssueCheck(input: {
  id: string;
  label: string;
  issues: MarketplaceRiskReserveIssue[];
  codes: MarketplaceRiskReserveIssue['code'][];
  passDetail: string;
}): MarketplaceRiskReserveCheck {
  const matched = input.issues.filter((issue) => input.codes.includes(issue.code));
  const errors = matched.filter((issue) => issue.severity === 'error').length;
  const warnings = matched.filter((issue) => issue.severity === 'warning').length;
  if (errors > 0) {
    return {
      id: input.id,
      label: input.label,
      status: 'fail',
      detail: `${errors} marketplace risk blocker(s) require action.`,
    };
  }
  if (warnings > 0) {
    return {
      id: input.id,
      label: input.label,
      status: 'warn',
      detail: `${warnings} marketplace risk warning(s) require review.`,
    };
  }
  return {
    id: input.id,
    label: input.label,
    status: 'pass',
    detail: input.passDetail,
  };
}

function currentUtcMonthPeriod(timestamp: number): MarketplaceStatsPeriod {
  const date = new Date(timestamp);
  const from = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
  const to = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
  return {
    from,
    to,
    label: new Date(from).toISOString().slice(0, 7),
  };
}

function ordersByCreatorId(orders: MarketplaceOrder[]): Map<string, MarketplaceOrder[]> {
  const byCreator = new Map<string, MarketplaceOrder[]>();
  for (const order of orders) {
    const current = byCreator.get(order.creatorId) ?? [];
    current.push(order);
    byCreator.set(order.creatorId, current);
  }
  return byCreator;
}

function buyerGmvConcentrationBps(orders: MarketplaceOrder[], totalGmvCents: number): number {
  if (totalGmvCents <= 0) return 0;
  const byBuyer = new Map<string, number>();
  for (const order of orders) {
    byBuyer.set(order.buyerId, (byBuyer.get(order.buyerId) ?? 0) + order.grossCents);
  }
  return Math.round((Math.max(0, ...byBuyer.values()) / totalGmvCents) * 10_000);
}

function creatorActivationCreator(input: {
  creator: Creator;
  orders: MarketplaceOrder[];
  publishedListings: number;
  pendingHumanReviews: number;
}): MarketplaceCreatorActivationCreator {
  const { creator, orders } = input;
  const firstSaleAt = orders[0]?.createdAt;
  const lastSaleAt = orders.length > 0 ? orders[orders.length - 1]?.createdAt : undefined;
  const payoutReadiness = creatorPayoutReadiness(creator);
  return {
    creatorId: creator.id,
    ...(creator.displayName ? { displayName: creator.displayName } : {}),
    ...(creator.country ? { country: creator.country } : {}),
    active: creator.active,
    orders: orders.length,
    grossCents: orders.reduce((total, order) => total + order.grossCents, 0),
    platformFeeCents: orders.reduce((total, order) => total + order.platformFeeCents, 0),
    creatorNetCents: orders.reduce((total, order) => total + order.creatorNetCents, 0),
    ...(firstSaleAt !== undefined ? { firstSaleAt } : {}),
    ...(lastSaleAt !== undefined ? { lastSaleAt } : {}),
    publishedListings: input.publishedListings,
    pendingHumanReviews: input.pendingHumanReviews,
    payoutStatus: payoutReadiness.status,
    hasStripeConnectAccount: Boolean(creator.stripeConnectAccountId),
    hasTaxProfile: Boolean(creator.taxProfileId),
  };
}

function creatorActivationSort(
  left: MarketplaceCreatorActivationCreator,
  right: MarketplaceCreatorActivationCreator,
): number {
  return (
    right.grossCents - left.grossCents
    || right.orders - left.orders
    || right.publishedListings - left.publishedListings
    || left.creatorId.localeCompare(right.creatorId)
  );
}

function creatorActivationShortfalls(
  summary: MarketplaceCreatorActivationReport['summary'],
  targets: MarketplaceCreatorActivationTargets,
): MarketplaceCreatorActivationShortfall[] {
  const shortfalls: MarketplaceCreatorActivationShortfall[] = [];
  if (summary.gmvCents < targets.monthlyGmvCents) {
    shortfalls.push({
      code: 'monthly_gmv_shortfall',
      severity: 'error',
      detail: `Current-month GMV needs ${targets.monthlyGmvCents - summary.gmvCents} more cents.`,
      remediation: 'Drive paid demand to creator supply before counting the marketplace launch milestone as met.',
    });
  }
  if (summary.sellingCreators < targets.activeCreatorsWithSales) {
    shortfalls.push({
      code: 'selling_creator_shortfall',
      severity: 'error',
      detail: `Creator supply needs ${targets.activeCreatorsWithSales - summary.sellingCreators} more creator(s) with a current-month sale.`,
      remediation: 'Recruit creators with launch-ready listings and route founder-led buyers to first purchases.',
    });
  }
  if (summary.activeCreators < targets.minimumActiveCreators) {
    shortfalls.push({
      code: 'active_creator_shortfall',
      severity: 'warning',
      detail: `Marketplace supply needs ${targets.minimumActiveCreators - summary.activeCreators} more active creator(s).`,
      remediation: 'Invite and activate more creators before opening broad marketplace traffic.',
    });
  }
  if (summary.repeatSellers < targets.repeatSellers) {
    shortfalls.push({
      code: 'repeat_seller_shortfall',
      severity: 'warning',
      detail: `Repeat-sale proof needs ${targets.repeatSellers - summary.repeatSellers} more creator(s) with at least ${targets.repeatSellerMinimumOrders} current-month order(s).`,
      remediation: 'Pair demand campaigns with listings that should earn a second purchase, not only a launch spike.',
    });
  }
  if (summary.payoutBlockedCreators > 0) {
    shortfalls.push({
      code: 'payout_blockers',
      severity: 'error',
      detail: `${summary.payoutBlockedCreators} selling creator(s) cannot receive payouts.`,
      remediation: 'Complete Stripe Connect onboarding and tax profile collection for every selling creator.',
    });
  }
  return shortfalls;
}

function platformSeller(input: {
  creator: Creator;
  orders: MarketplaceOrder[];
  totalGmvCents: number;
  publishedListings: number;
  pendingHumanReviews: number;
}): MarketplacePlatformSeller {
  const { creator, orders } = input;
  const grossCents = orders.reduce((total, order) => total + order.grossCents, 0);
  const firstSaleAt = orders[0]?.createdAt;
  const lastSaleAt = orders.length > 0 ? orders[orders.length - 1]?.createdAt : undefined;
  const payoutReadiness = creatorPayoutReadiness(creator);
  return {
    creatorId: creator.id,
    ...(creator.displayName ? { displayName: creator.displayName } : {}),
    ...(creator.country ? { country: creator.country } : {}),
    active: creator.active,
    orders: orders.length,
    grossCents,
    gmvShareBps: input.totalGmvCents > 0 ? Math.round((grossCents / input.totalGmvCents) * 10_000) : 0,
    platformFeeCents: orders.reduce((total, order) => total + order.platformFeeCents, 0),
    creatorNetCents: orders.reduce((total, order) => total + order.creatorNetCents, 0),
    ...(firstSaleAt !== undefined ? { firstSaleAt } : {}),
    ...(lastSaleAt !== undefined ? { lastSaleAt } : {}),
    publishedListings: input.publishedListings,
    pendingHumanReviews: input.pendingHumanReviews,
    payoutStatus: payoutReadiness.status,
    hasTaxProfile: Boolean(creator.taxProfileId),
  };
}

function platformSellerSort(left: MarketplacePlatformSeller, right: MarketplacePlatformSeller): number {
  return (
    right.grossCents - left.grossCents
    || right.orders - left.orders
    || right.publishedListings - left.publishedListings
    || left.creatorId.localeCompare(right.creatorId)
  );
}

function platformReadinessIssues(
  summary: MarketplacePlatformReadinessReport['summary'],
  targets: MarketplacePlatformReadinessTargets,
  topSeller: MarketplacePlatformSeller | undefined,
  riskReserveIssues: MarketplaceRiskReserveIssue[],
): MarketplacePlatformReadinessIssue[] {
  const issues: MarketplacePlatformReadinessIssue[] = [];
  if (summary.gmvCents < targets.monthlyGmvCents) {
    issues.push({
      code: 'marketplace_gmv_shortfall',
      severity: 'error',
      referenceType: 'stats',
      referenceId: 'current-month-gmv',
      detail: `Current-month GMV needs ${targets.monthlyGmvCents - summary.gmvCents} more cents.`,
      remediation: 'Keep creator demand campaigns running until the $250K/month marketplace milestone is visible in paid orders.',
    });
  }
  if (summary.activeSellers < targets.activeCreatorsWithSales) {
    issues.push({
      code: 'active_seller_shortfall',
      severity: 'error',
      referenceType: 'creator',
      referenceId: 'active-sellers',
      detail: `Marketplace needs ${targets.activeCreatorsWithSales - summary.activeSellers} more active seller(s) with a current-month sale.`,
      remediation: 'Recruit and activate more creators with launch-ready listings before claiming marketplace liquidity.',
    });
  }
  if (summary.uniqueBuyers < targets.minimumUniqueBuyers) {
    issues.push({
      code: 'buyer_diversity_shortfall',
      severity: 'error',
      referenceType: 'buyer',
      referenceId: 'unique-buyers',
      detail: `Marketplace needs ${targets.minimumUniqueBuyers - summary.uniqueBuyers} more unique buyer(s) in the current month.`,
      remediation: 'Broaden demand before using marketplace GMV as platform proof; one buyer should not be able to validate the entire supply side.',
    });
  }
  if (summary.topBuyerGmvShareBps > targets.maximumTopBuyerGmvShareBps) {
    issues.push({
      code: 'buyer_concentration',
      severity: 'warning',
      referenceType: 'buyer',
      referenceId: 'top-buyer',
      detail: `Top buyer contributes ${summary.topBuyerGmvShareBps} bps of GMV, above the ${targets.maximumTopBuyerGmvShareBps} bps concentration target.`,
      remediation: 'Broaden paid demand across more buyers before presenting marketplace GMV as platform-grade.',
    });
  }
  if (summary.publishedListings < targets.minimumPublishedListings) {
    issues.push({
      code: 'published_listing_shortfall',
      severity: 'error',
      referenceType: 'listing',
      referenceId: 'published-listings',
      detail: `Published catalog needs ${targets.minimumPublishedListings - summary.publishedListings} more listing(s).`,
      remediation: 'Approve qualified supply or seed first-party packs to keep demand from bottlenecking on catalog depth.',
    });
  }
  if (summary.repeatSellers < targets.repeatSellers) {
    issues.push({
      code: 'repeat_seller_shortfall',
      severity: 'warning',
      referenceType: 'creator',
      referenceId: 'repeat-sellers',
      detail: `Repeat-sale proof needs ${targets.repeatSellers - summary.repeatSellers} more seller(s) with at least ${targets.repeatSellerMinimumOrders} current-month orders.`,
      remediation: 'Drive second purchases for creator supply before treating GMV as durable marketplace liquidity.',
    });
  }
  if (summary.topCreatorGmvShareBps > targets.maximumTopCreatorGmvShareBps) {
    issues.push({
      code: 'creator_concentration',
      severity: 'warning',
      referenceType: 'creator',
      referenceId: topSeller?.creatorId ?? 'top-seller',
      detail: `Top seller contributes ${summary.topCreatorGmvShareBps} bps of GMV, above the ${targets.maximumTopCreatorGmvShareBps} bps concentration target.`,
      remediation: 'Broaden paid demand across more creators before presenting marketplace GMV as platform-grade.',
    });
  }
  if (summary.gmvCents > 0 && summary.platformTakeRateBps < targets.minimumPlatformTakeRateBps) {
    issues.push({
      code: 'take_rate_floor',
      severity: 'warning',
      referenceType: 'stats',
      referenceId: 'platform-take-rate',
      detail: `Weighted take rate is ${summary.platformTakeRateBps} bps, below the ${targets.minimumPlatformTakeRateBps} bps floor.`,
      remediation: 'Audit pricing, creator tiers, and checkout fee calculation before scaling paid acquisition.',
    });
  }
  if (summary.orders > 0 && summary.checkoutOrderShareBps < targets.minimumCheckoutOrderShareBps) {
    issues.push({
      code: 'checkout_coverage_shortfall',
      severity: 'error',
      referenceType: 'order',
      referenceId: 'checkout-coverage',
      detail: `${summary.checkoutOrderShareBps} bps of paid orders came through Checkout, below the ${targets.minimumCheckoutOrderShareBps} bps scale target.`,
      remediation: 'Move paid marketplace GMV through Stripe Checkout destination charges before counting it as platform-grade liquidity.',
    });
  }
  if (summary.gmvCents > 0 && summary.checkoutGmvShareBps < targets.minimumCheckoutGmvShareBps) {
    issues.push({
      code: 'checkout_gmv_coverage_shortfall',
      severity: 'error',
      referenceType: 'stats',
      referenceId: 'checkout-gmv-coverage',
      detail: `${summary.checkoutGmvShareBps} bps of paid GMV came through Checkout, below the ${targets.minimumCheckoutGmvShareBps} bps scale target.`,
      remediation: 'Route high-value paid marketplace orders through Stripe Checkout destination charges before presenting GMV as platform-grade.',
    });
  }
  if (summary.gmvCents > 0 && !summary.settlementReady) {
    issues.push({
      code: 'settlement_coverage_shortfall',
      severity: 'error',
      referenceType: 'settlement',
      referenceId: 'creator-payout-settlement',
      detail: `${summary.settlementPayoutShareBps} bps of creator payout value is settled, below the ${targets.minimumSettledPayoutShareBps} bps scale target.`,
      remediation: 'Settle creator payouts through Stripe Connect or destination charges before using marketplace GMV as platform-grade business proof.',
    });
  }
  if (summary.pendingHumanReviews > targets.maximumPendingHumanReviews) {
    issues.push({
      code: 'human_review_backlog',
      severity: 'error',
      referenceType: 'review',
      referenceId: 'human-review-queue',
      detail: `${summary.pendingHumanReviews} listing review(s) are waiting for a human decision.`,
      remediation: 'Clear flagged and top-GMV creator reviews before opening more buyer traffic.',
    });
  }
  if (summary.blockedPayouts > targets.maximumBlockedPayouts) {
    issues.push({
      code: 'blocked_payouts',
      severity: 'error',
      referenceType: 'payout',
      referenceId: 'blocked-payouts',
      detail: `${summary.blockedPayouts} payout(s) are blocked by creator onboarding or tax profile work.`,
      remediation: 'Complete Stripe Connect and tax-profile onboarding for selling creators before finance close.',
    });
  }
  if (summary.taxComplianceIssues > targets.maximumTaxComplianceIssues) {
    issues.push({
      code: 'tax_compliance_issues',
      severity: 'error',
      referenceType: 'tax-compliance',
      referenceId: 'tax-compliance-issues',
      detail: `${summary.taxComplianceIssues} tax compliance issue(s) need finance review.`,
      remediation: 'Resolve missing tax profiles, buyer-country gaps, and Stripe Tax evidence before scaling payouts.',
    });
  }
  if (!summary.reconciliationReady) {
    issues.push({
      code: 'reconciliation_not_ready',
      severity: 'error',
      referenceType: 'reconciliation',
      referenceId: 'marketplace-ledger',
      detail: `${summary.reconciliationIssues} reconciliation issue(s) require finance review before marketplace GMV can be used as business-model proof.`,
      remediation: 'Resolve order, payout, tax, Checkout, and entitlement ledger issues before exporting marketplace proof.',
    });
  }
  if (riskReserveIssues.length > 0) {
    const blocking = riskReserveIssues.filter((issue) => issue.severity === 'error');
    issues.push({
      code: 'risk_reserve_not_ready',
      severity: blocking.length > 0 ? 'error' : 'warning',
      referenceType: 'stats',
      referenceId: 'risk-reserve',
      detail: blocking.length > 0
        ? `${blocking.length} risk-reserve blocker(s): ${blocking.map((issue) => issue.code).join(', ')}.`
        : `${riskReserveIssues.length} risk-reserve warning(s): ${riskReserveIssues.map((issue) => issue.code).join(', ')}.`,
      remediation: blocking.length > 0
        ? 'Fund reserves, reduce refund/dispute exposure, or hold payouts before presenting marketplace GMV as scale-ready.'
        : 'Review reserve warnings before increasing marketplace traffic.',
    });
  }
  return issues;
}

function platformReadinessChecks(
  issues: MarketplacePlatformReadinessIssue[],
  summary: MarketplacePlatformReadinessReport['summary'],
  targets: MarketplacePlatformReadinessTargets,
): MarketplacePlatformReadinessCheck[] {
  return [
    platformIssueCheck({
      id: 'seller-liquidity',
      label: 'Seller and GMV liquidity',
      issues,
      codes: ['marketplace_gmv_shortfall', 'active_seller_shortfall'],
      passDetail: `${summary.activeSellers} active seller(s) and ${summary.gmvCents} cents GMV meet marketplace liquidity targets.`,
    }),
    platformIssueCheck({
      id: 'buyer-diversity',
      label: 'Buyer diversity',
      issues,
      codes: ['buyer_diversity_shortfall', 'buyer_concentration'],
      passDetail: `${summary.uniqueBuyers} unique buyer(s) and ${summary.topBuyerGmvShareBps} bps top-buyer share meet demand-diversity targets.`,
    }),
    platformIssueCheck({
      id: 'catalog-depth',
      label: 'Published catalog depth',
      issues,
      codes: ['published_listing_shortfall'],
      passDetail: `${summary.publishedListings} published listing(s) meet the minimum catalog depth of ${targets.minimumPublishedListings}.`,
    }),
    platformIssueCheck({
      id: 'repeat-seller-proof',
      label: 'Repeat seller proof',
      issues,
      codes: ['repeat_seller_shortfall'],
      passDetail: `${summary.repeatSellers} repeat seller(s) meet the repeat-sale target.`,
    }),
    platformIssueCheck({
      id: 'marketplace-quality',
      label: 'Concentration and take-rate quality',
      issues,
      codes: ['creator_concentration', 'take_rate_floor'],
      passDetail: `${summary.topCreatorGmvShareBps} bps top-seller share and ${summary.platformTakeRateBps} bps take rate are within targets.`,
    }),
    platformIssueCheck({
      id: 'checkout-coverage',
      label: 'Checkout coverage',
      issues,
      codes: ['checkout_coverage_shortfall', 'checkout_gmv_coverage_shortfall'],
      passDetail: `${summary.checkoutOrderShareBps} bps of paid orders and ${summary.checkoutGmvShareBps} bps of paid GMV use Checkout destination charges.`,
    }),
    platformIssueCheck({
      id: 'operations-health',
      label: 'Review, payout, tax, and ledger health',
      issues,
      codes: ['human_review_backlog', 'blocked_payouts', 'tax_compliance_issues', 'reconciliation_not_ready', 'settlement_coverage_shortfall'],
      passDetail: `${summary.pendingHumanReviews} pending reviews, ${summary.blockedPayouts} blocked payouts, ${summary.taxComplianceIssues} tax issue(s), ${summary.reconciliationIssues} reconciliation issue(s), and ${summary.settlementPayoutShareBps} bps settled payout value within targets.`,
    }),
    platformIssueCheck({
      id: 'risk-reserve',
      label: 'Risk reserve health',
      issues,
      codes: ['risk_reserve_not_ready'],
      passDetail: `${summary.availableReserveCents} cents reserve covers ${summary.requiredReserveCents} cents required reserve with ${summary.refundRateBps} bps refund and ${summary.disputeRateBps} bps dispute rates.`,
    }),
  ];
}

function platformIssueCheck(input: {
  id: string;
  label: string;
  issues: MarketplacePlatformReadinessIssue[];
  codes: MarketplacePlatformReadinessIssue['code'][];
  passDetail: string;
}): MarketplacePlatformReadinessCheck {
  const matched = input.issues.filter((issue) => input.codes.includes(issue.code));
  const errors = matched.filter((issue) => issue.severity === 'error').length;
  const warnings = matched.filter((issue) => issue.severity === 'warning').length;
  if (errors > 0) {
    return {
      id: input.id,
      label: input.label,
      status: 'fail',
      detail: `${errors} marketplace blocker(s) require action.`,
    };
  }
  if (warnings > 0) {
    return {
      id: input.id,
      label: input.label,
      status: 'warn',
      detail: `${warnings} marketplace warning(s) require review.`,
    };
  }
  return {
    id: input.id,
    label: input.label,
    status: 'pass',
    detail: input.passDetail,
  };
}

function launchReadinessChecks(
  issues: MarketplaceLaunchReadinessIssue[],
  summary: MarketplaceLaunchReadinessReport['summary'],
  targets: MarketplaceLaunchReadinessTargets,
): MarketplaceLaunchReadinessCheck[] {
  return [
    launchIssueCheck({
      id: 'growth-targets',
      label: 'Creator and GMV targets',
      issues,
      codes: ['growth_target_not_met'],
      passDetail: `${summary.gmvCents} cents GMV and ${summary.activeCreatorsWithSales} selling creator(s) meet launch targets.`,
    }),
    launchIssueCheck({
      id: 'catalog-depth',
      label: 'Published catalog depth',
      issues,
      codes: ['published_listing_shortfall'],
      passDetail: `${summary.publishedListings} published listing(s) meet the minimum catalog depth of ${targets.minimumPublishedListings}.`,
    }),
    launchIssueCheck({
      id: 'review-backlog',
      label: 'Human review backlog',
      issues,
      codes: ['human_review_backlog'],
      passDetail: `${summary.pendingHumanReviews} pending human review(s) within launch target.`,
    }),
    launchIssueCheck({
      id: 'payout-blockers',
      label: 'Payout blockers',
      issues,
      codes: ['blocked_payouts'],
      passDetail: `${summary.blockedPayouts} blocked payout(s) within launch target.`,
    }),
    launchIssueCheck({
      id: 'tax-readiness',
      label: 'Tax compliance readiness',
      issues,
      codes: ['tax_compliance_issues'],
      passDetail: `${summary.taxComplianceIssues} tax compliance issue(s) within launch target.`,
    }),
  ];
}

function launchIssueCheck(input: {
  id: string;
  label: string;
  issues: MarketplaceLaunchReadinessIssue[];
  codes: MarketplaceLaunchReadinessIssue['code'][];
  passDetail: string;
}): MarketplaceLaunchReadinessCheck {
  const matched = input.issues.filter((issue) => input.codes.includes(issue.code));
  const errors = matched.filter((issue) => issue.severity === 'error').length;
  const warnings = matched.filter((issue) => issue.severity === 'warning').length;
  if (errors > 0) {
    return {
      id: input.id,
      label: input.label,
      status: 'fail',
      detail: `${errors} launch blocker(s) require action.`,
    };
  }
  if (warnings > 0) {
    return {
      id: input.id,
      label: input.label,
      status: 'warn',
      detail: `${warnings} launch warning(s) require review.`,
    };
  }
  return {
    id: input.id,
    label: input.label,
    status: 'pass',
    detail: input.passDetail,
  };
}

function reconciliationChecks(
  issues: MarketplaceReconciliationIssue[],
  summary: MarketplaceReconciliationReport['summary'],
): MarketplaceReconciliationCheck[] {
  const checks: MarketplaceReconciliationCheck[] = [
    issueCheck({
      id: 'order-ledger',
      label: 'Order ledger totals',
      issues,
      codes: ['order_split_mismatch', 'creator_missing', 'listing_missing'],
      passDetail: `${summary.orders} orders have balanced splits and source records.`,
    }),
    issueCheck({
      id: 'payout-ledger',
      label: 'Payout ledger',
      issues,
      codes: ['payout_missing', 'payout_record_missing', 'payout_order_mismatch', 'payout_amount_mismatch', 'payout_blocked'],
      passDetail: `${summary.payoutCents} cents of creator payouts reconcile to order net.`,
      warnDetail: `${summary.blockedPayouts} payout(s) are blocked pending creator onboarding or tax profile work.`,
    }),
    issueCheck({
      id: 'tax-ledger',
      label: 'Tax evidence',
      issues,
      codes: ['tax_record_missing', 'tax_record_not_found', 'tax_record_mismatch', 'checkout_tax_incomplete', 'checkout_tax_session_mismatch'],
      passDetail: `${summary.taxAmountCents} cents of tax evidence reconcile to orders.`,
    }),
    issueCheck({
      id: 'checkout-ledger',
      label: 'Checkout fulfillment',
      issues,
      codes: ['checkout_payout_delivery_mismatch', 'checkout_payout_session_mismatch', 'checkout_tax_session_mismatch'],
      passDetail: `${summary.checkoutOrders} Checkout order(s) reconcile against payout and tax records.`,
    }),
    issueCheck({
      id: 'entitlement-ledger',
      label: 'Pro module entitlements',
      issues,
      codes: ['pro_module_entitlement_count_mismatch', 'pro_module_entitlement_mismatch', 'unexpected_entitlement'],
      passDetail: `${summary.entitlementsIssued} entitlement(s) reconcile to paid Pro module orders.`,
    }),
  ];
  return checks;
}

function issueCheck(input: {
  id: string;
  label: string;
  issues: MarketplaceReconciliationIssue[];
  codes: string[];
  passDetail: string;
  warnDetail?: string;
}): MarketplaceReconciliationCheck {
  const matched = input.issues.filter((issue) => input.codes.includes(issue.code));
  const errors = matched.filter((issue) => issue.severity === 'error').length;
  const warnings = matched.filter((issue) => issue.severity === 'warning').length;
  if (errors > 0) {
    return {
      id: input.id,
      label: input.label,
      status: 'fail',
      detail: `${errors} error(s) require reconciliation.`,
    };
  }
  if (warnings > 0) {
    return {
      id: input.id,
      label: input.label,
      status: 'warn',
      detail: input.warnDetail ?? `${warnings} warning(s) require review.`,
    };
  }
  return {
    id: input.id,
    label: input.label,
    status: 'pass',
    detail: input.passDetail,
  };
}

function settlementCreators(
  lines: MarketplaceSettlementLine[],
  creators: Map<string, Creator>,
): MarketplaceSettlementReport['creators'] {
  const byCreator = new Map<string, MarketplaceSettlementReport['creators'][number]>();
  for (const line of lines) {
    const creator = creators.get(line.creatorId);
    const current = byCreator.get(line.creatorId) ?? {
      creatorId: line.creatorId,
      ...(creator?.displayName ? { displayName: creator.displayName } : {}),
      ...(creator?.country ? { country: creator.country } : {}),
      hasStripeConnectAccount: Boolean(creator?.stripeConnectAccountId),
      hasTaxProfile: Boolean(creator?.taxProfileId),
      orders: 0,
      grossCents: 0,
      platformFeeCents: 0,
      creatorNetCents: 0,
      payoutCents: 0,
      blockedPayouts: 0,
      taxAmountCents: 0,
    };
    current.orders += 1;
    current.grossCents += line.grossCents;
    current.platformFeeCents += line.platformFeeCents;
    current.creatorNetCents += line.creatorNetCents;
    current.payoutCents += line.payoutCents;
    current.blockedPayouts += line.payoutStatus === 'blocked' ? 1 : 0;
    current.taxAmountCents += line.taxAmountCents;
    byCreator.set(line.creatorId, current);
  }
  return [...byCreator.values()].sort((left, right) => (
    right.grossCents - left.grossCents || left.creatorId.localeCompare(right.creatorId)
  ));
}

function settlementReportToCsv(report: MarketplaceSettlementReport): string {
  const rows = [
    [
      'order_id',
      'created_at',
      'creator_id',
      'creator_display_name',
      'listing_id',
      'listing_title',
      'category',
      'buyer_id',
      'currency',
      'gross_cents',
      'platform_fee_cents',
      'creator_net_cents',
      'payout_id',
      'payout_status',
      'payout_delivery',
      'payout_cents',
      'payout_settlement_status',
      'payout_evidence_kind',
      'payout_evidence_receipt_id',
      'stripe_transfer_id',
      'stripe_transfer_balance_transaction_id',
      'tax_record_id',
      'tax_amount_cents',
      'stripe_tax_calculation_id',
      'stripe_tax_transaction_id',
      'stripe_checkout_session_id',
      'stripe_payment_intent_id',
    ],
    ...report.lines.map((line) => [
      line.orderId,
      String(line.createdAt),
      line.creatorId,
      line.creatorDisplayName ?? '',
      line.listingId,
      line.listingTitle ?? '',
      line.category ?? '',
      line.buyerId,
      line.currency,
      String(line.grossCents),
      String(line.platformFeeCents),
      String(line.creatorNetCents),
      line.payoutId ?? '',
      line.payoutStatus ?? '',
      line.payoutDelivery ?? '',
      String(line.payoutCents),
      line.payoutSettlementStatus,
      line.payoutEvidenceKind ?? '',
      line.payoutEvidenceReceiptId ?? '',
      line.stripeTransferId ?? '',
      line.stripeTransferBalanceTransactionId ?? '',
      line.taxRecordId ?? '',
      String(line.taxAmountCents),
      line.stripeTaxCalculationId ?? '',
      line.stripeTaxTransactionId ?? '',
      line.stripeCheckoutSessionId ?? '',
      line.stripePaymentIntentId ?? '',
    ]),
  ];
  return `${rows.map((row) => row.map(csvCell).join(',')).join('\n')}\n`;
}

function settlementBuyerId(buyerId: string): string {
  return EMAIL_PATTERN.test(buyerId) ? auditHash('buyer', buyerId) : buyerId;
}

const DEFAULT_US_1099K_OPS_THRESHOLD_CENTS = 60_000;
const DEFAULT_CATALOG_LIMIT = 24;
const MAX_CATALOG_LIMIT = 100;
const DEFAULT_REVIEW_DASHBOARD_LIMIT = 25;
const MAX_REVIEW_DASHBOARD_LIMIT = 100;

interface CatalogRow {
  listing: MarketplaceListing;
  creator: Creator;
  score: number;
  salesCount: number;
}

function taxComplianceThreshold(options: MarketplaceTaxComplianceOptions): number {
  const threshold = options.us1099KGrossThresholdCents ?? DEFAULT_US_1099K_OPS_THRESHOLD_CENTS;
  if (!Number.isInteger(threshold) || threshold < 0) {
    throw new Error('us1099KGrossThresholdCents must be a non-negative integer');
  }
  return threshold;
}

function taxCompliancePeriod(options: MarketplaceTaxComplianceOptions): NonNullable<MarketplaceTaxComplianceReport['period']> {
  if (options.year !== undefined) {
    if (!Number.isInteger(options.year) || options.year < 1970 || options.year > 9999) {
      throw new Error('year must be an integer between 1970 and 9999');
    }
    return {
      year: options.year,
      from: Date.UTC(options.year, 0, 1),
      to: Date.UTC(options.year + 1, 0, 1),
    };
  }
  return {
    ...(options.from !== undefined ? { from: options.from } : {}),
    ...(options.to !== undefined ? { to: options.to } : {}),
  };
}

function hasTaxCompliancePeriod(period: MarketplaceTaxComplianceReport['period']): period is NonNullable<MarketplaceTaxComplianceReport['period']> {
  return Boolean(period && (period.from !== undefined || period.to !== undefined || period.year !== undefined));
}

function taxComplianceCreators(
  lines: MarketplaceSettlementLine[],
  creators: Map<string, Creator>,
  us1099KGrossThresholdCents: number,
): MarketplaceTaxComplianceReport['creators'] {
  const byCreator = new Map<string, MarketplaceTaxComplianceReport['creators'][number]>();
  for (const line of lines) {
    const creator = creators.get(line.creatorId);
    const current = byCreator.get(line.creatorId) ?? {
      creatorId: line.creatorId,
      ...(creator?.displayName ? { displayName: creator.displayName } : {}),
      ...(creator?.country ? { country: creator.country.toUpperCase() } : {}),
      hasStripeConnectAccount: Boolean(creator?.stripeConnectAccountId),
      hasTaxProfile: Boolean(creator?.taxProfileId),
      orders: 0,
      grossCents: 0,
      platformFeeCents: 0,
      creatorNetCents: 0,
      payoutCents: 0,
      taxAmountCents: 0,
      reportable1099K: false,
      missingStripeConnectAccount: false,
      missingTaxProfile: false,
    };
    current.orders += 1;
    current.grossCents += line.grossCents;
    current.platformFeeCents += line.platformFeeCents;
    current.creatorNetCents += line.creatorNetCents;
    current.payoutCents += line.payoutCents;
    current.taxAmountCents += line.taxAmountCents;
    byCreator.set(line.creatorId, current);
  }
  return [...byCreator.values()]
    .map((summary) => {
      const reportable1099K = summary.country === 'US' && summary.grossCents >= us1099KGrossThresholdCents;
      return {
        ...summary,
        reportable1099K,
        missingStripeConnectAccount: reportable1099K && !summary.hasStripeConnectAccount,
        missingTaxProfile: reportable1099K && !summary.hasTaxProfile,
      };
    })
    .sort((left, right) => (
      Number(right.reportable1099K) - Number(left.reportable1099K)
      || right.grossCents - left.grossCents
      || left.creatorId.localeCompare(right.creatorId)
    ));
}

function taxComplianceBuyerCountries(
  orders: MarketplaceOrder[],
  taxRecords: Map<string, TaxRecord>,
): MarketplaceTaxComplianceReport['buyerCountries'] {
  const byCountry = new Map<string, MarketplaceTaxComplianceReport['buyerCountries'][number]>();
  for (const order of orders) {
    const taxRecord = order.taxRecordId ? taxRecords.get(order.taxRecordId) : undefined;
    const country = taxRecord?.buyerCountry ?? 'UNKNOWN';
    const current = byCountry.get(country) ?? {
      country,
      orders: 0,
      grossCents: 0,
      taxAmountCents: 0,
    };
    current.orders += 1;
    current.grossCents += order.grossCents;
    current.taxAmountCents += taxRecord?.taxAmountCents ?? 0;
    byCountry.set(country, current);
  }
  return [...byCountry.values()].sort((left, right) => (
    (left.country === 'UNKNOWN' ? 1 : 0) - (right.country === 'UNKNOWN' ? 1 : 0)
    || left.country.localeCompare(right.country)
  ));
}

function taxComplianceIssues(
  orders: MarketplaceOrder[],
  creators: MarketplaceTaxComplianceReport['creators'],
  taxRecords: Map<string, TaxRecord>,
): MarketplaceTaxComplianceIssue[] {
  const issues: MarketplaceTaxComplianceIssue[] = [];
  for (const creator of creators) {
    if (creator.missingStripeConnectAccount) {
      issues.push({
        code: 'creator_stripe_connect_account_missing',
        severity: 'error',
        referenceType: 'creator',
        referenceId: creator.creatorId,
        detail: 'US creator crossed the configured 1099-K ops review threshold without a Stripe Connect account.',
        remediation: 'Complete Stripe Connect onboarding before year-end reporting export.',
      });
    }
    if (creator.missingTaxProfile) {
      issues.push({
        code: 'creator_tax_profile_missing',
        severity: 'error',
        referenceType: 'creator',
        referenceId: creator.creatorId,
        detail: 'US creator crossed the configured 1099-K ops review threshold without a collected tax profile.',
        remediation: 'Collect the creator tax profile before year-end reporting export.',
      });
    }
  }
  for (const order of orders) {
    const taxRecord = order.taxRecordId ? taxRecords.get(order.taxRecordId) : undefined;
    if (!taxRecord) {
      issues.push({
        code: 'stripe_tax_evidence_missing',
        severity: 'error',
        referenceType: 'order',
        referenceId: order.id,
        detail: 'Order is missing tax evidence.',
        remediation: 'Recover Stripe Tax or Checkout evidence before tax close.',
      });
      continue;
    }
    if (!taxRecord.buyerCountry) {
      issues.push({
        code: 'buyer_tax_country_missing',
        severity: 'warning',
        referenceType: 'tax-record',
        referenceId: taxRecord.id,
        detail: 'Tax record is missing buyer country for GST/VAT nexus summaries.',
        remediation: 'Collect billing country through Stripe Checkout or Stripe Tax before fulfillment.',
      });
    }
    const hasStripeEvidence = Boolean(
      taxRecord.stripeCheckoutSessionId
      || taxRecord.stripeTaxCalculationId
      || taxRecord.stripeTaxTransactionId
    );
    if (!hasStripeEvidence) {
      issues.push({
        code: 'stripe_tax_evidence_missing',
        severity: 'warning',
        referenceType: 'tax-record',
        referenceId: taxRecord.id,
        detail: 'Tax record has no Stripe Checkout, calculation, or transaction identifier.',
        remediation: 'Attach Stripe Tax evidence or reconcile this delegated-tax order manually.',
      });
    }
  }
  return issues.sort((left, right) => (
    left.referenceType.localeCompare(right.referenceType)
    || left.referenceId.localeCompare(right.referenceId)
    || left.code.localeCompare(right.code)
  ));
}

function taxComplianceReportToCsv(report: MarketplaceTaxComplianceReport): string {
  const rows = [
    [
      'record_type',
      'reference_type',
      'reference_id',
      'creator_id',
      'display_name',
      'country',
      'buyer_country',
      'orders',
      'gross_cents',
      'platform_fee_cents',
      'creator_net_cents',
      'payout_cents',
      'tax_amount_cents',
      'reportable_1099k',
      'missing_stripe_connect_account',
      'missing_tax_profile',
      'issue_code',
      'issue_severity',
      'detail',
    ],
    ...report.creators.map((creator) => [
      'creator',
      'creator',
      creator.creatorId,
      creator.creatorId,
      creator.displayName ?? '',
      creator.country ?? '',
      '',
      String(creator.orders),
      String(creator.grossCents),
      String(creator.platformFeeCents),
      String(creator.creatorNetCents),
      String(creator.payoutCents),
      String(creator.taxAmountCents),
      String(creator.reportable1099K),
      String(creator.missingStripeConnectAccount),
      String(creator.missingTaxProfile),
      '',
      '',
      '',
    ]),
    ...report.buyerCountries.map((country) => [
      'buyer_country',
      'tax-record',
      country.country,
      '',
      '',
      '',
      country.country,
      String(country.orders),
      String(country.grossCents),
      '',
      '',
      '',
      String(country.taxAmountCents),
      '',
      '',
      '',
      '',
      '',
      '',
    ]),
    ...report.issues.map((issue) => [
      'issue',
      issue.referenceType,
      issue.referenceId,
      issue.referenceType === 'creator' ? issue.referenceId : '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      issue.code,
      issue.severity,
      issue.detail,
    ]),
  ];
  return `${rows.map((row) => row.map(csvCell).join(',')).join('\n')}\n`;
}

function publicStorefrontListing(listing: MarketplaceListing): MarketplaceCreatorStorefrontListing {
  return {
    id: listing.id,
    title: listing.title,
    description: listing.description,
    category: listing.category,
    priceCents: listing.priceCents,
    currency: listing.currency,
    licenseSummary: listing.licenseSummary,
    tags: [...listing.tags],
    ...(listing.publishedAt ? { publishedAt: listing.publishedAt } : {}),
    ...(listing.proModule ? { proModule: listing.proModule } : {}),
  };
}

function catalogListingFromRow(row: CatalogRow): MarketplaceCatalogListing {
  return {
    ...publicStorefrontListing(row.listing),
    creator: {
      id: row.creator.id,
      displayName: row.creator.displayName,
      country: row.creator.country,
    },
    score: row.score,
    salesCount: row.salesCount,
  };
}

function reviewDashboardItem(
  review: ListingReview,
  listing: MarketplaceListing | undefined,
  generatedAt: number,
): MarketplaceReviewDashboardItem | undefined {
  if (!listing) return undefined;
  const highestSeverity = highestReviewSeverity(review.flags.map((flag) => flag.severity));
  return {
    reviewId: review.id,
    listingId: listing.id,
    creatorId: listing.creatorId,
    title: listing.title,
    category: listing.category,
    priceCents: listing.priceCents,
    currency: listing.currency,
    status: review.status,
    humanReviewRequired: review.humanReviewRequired,
    flagCount: review.flags.length,
    flagIds: review.flags.map((flag) => flag.id).sort(),
    ...(highestSeverity ? { highestSeverity } : {}),
    createdAt: review.createdAt,
    ageMs: Math.max(0, generatedAt - review.createdAt),
    recommendedAction: reviewRecommendedAction(highestSeverity, review.flags.length),
  };
}

function reviewDashboardItemSort(left: MarketplaceReviewDashboardItem, right: MarketplaceReviewDashboardItem): number {
  return reviewSeverityRank(right.highestSeverity) - reviewSeverityRank(left.highestSeverity)
    || right.priceCents - left.priceCents
    || left.createdAt - right.createdAt
    || left.reviewId.localeCompare(right.reviewId);
}

function reviewRecommendedAction(
  highestSeverity: ReviewSeverity | undefined,
  flagCount: number,
): MarketplaceReviewDashboardItem['recommendedAction'] {
  if (highestSeverity === 'critical') return 'reject';
  if (highestSeverity === 'high' || highestSeverity === 'medium' || flagCount > 0) return 'investigate';
  return 'approve';
}

function highestReviewSeverity(values: ReviewSeverity[]): ReviewSeverity | undefined {
  return values.sort((left, right) => reviewSeverityRank(right) - reviewSeverityRank(left))[0];
}

function reviewSeverityRank(value: ReviewSeverity | undefined): number {
  switch (value) {
    case 'critical': return 4;
    case 'high': return 3;
    case 'medium': return 2;
    case 'low': return 1;
    default: return 0;
  }
}

function publishedPriceRange(listings: MarketplaceCreatorStorefrontListing[]): MarketplaceCreatorStorefront['stats']['priceRangeCents'] {
  if (listings.length === 0) return undefined;
  const prices = listings.map((listing) => listing.priceCents);
  return {
    min: Math.min(...prices),
    max: Math.max(...prices),
  };
}

function normalizedCatalogQuery(query: string | undefined): string {
  return query?.trim().toLowerCase().replace(/\s+/gu, ' ') ?? '';
}

function normalizedCatalogTag(tag: string | undefined): string {
  return tag?.trim().toLowerCase() ?? '';
}

function normalizedCatalogLimit(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_CATALOG_LIMIT;
  if (!Number.isInteger(limit) || limit < 1) throw new Error('limit must be a positive integer');
  return Math.min(limit, MAX_CATALOG_LIMIT);
}

function normalizedReviewDashboardLimit(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_REVIEW_DASHBOARD_LIMIT;
  if (!Number.isInteger(limit) || limit < 1) throw new Error('limit must be a positive integer');
  return Math.min(limit, MAX_REVIEW_DASHBOARD_LIMIT);
}

function normalizedCatalogOffset(offset: number | undefined): number {
  if (offset === undefined) return 0;
  if (!Number.isInteger(offset) || offset < 0) throw new Error('offset must be a non-negative integer');
  return offset;
}

function catalogScore(listing: MarketplaceListing, creator: Creator, query: string): number {
  if (!query) return 0;
  const fields = {
    title: listing.title.toLowerCase(),
    description: listing.description.toLowerCase(),
    category: listing.category.toLowerCase(),
    creator: creator.displayName.toLowerCase(),
    tags: listing.tags.map((tag) => tag.toLowerCase()),
  };
  const haystack = [
    fields.title,
    fields.description,
    fields.category,
    fields.creator,
    ...fields.tags,
  ].join(' ');
  const terms = query.split(' ').filter(Boolean);
  if (!terms.every((term) => haystack.includes(term))) return 0;
  let score = 1;
  for (const term of terms) {
    if (fields.title.includes(term)) score += 6;
    if (fields.tags.some((tag) => tag.includes(term))) score += 5;
    if (fields.creator.includes(term)) score += 3;
    if (fields.category.includes(term)) score += 2;
    if (fields.description.includes(term)) score += 1;
  }
  return score;
}

function catalogFacet(values: string[]): MarketplaceCatalogSearchResult['facets']['tags'] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value));
}

function csvCell(value: string): string {
  return /[",\n\r]/u.test(value) ? `"${value.replace(/"/gu, '""')}"` : value;
}

function sum<T extends Record<K, number>, K extends keyof T>(items: T[], key: K): number {
  return items.reduce((total, item) => total + item[key], 0);
}

function sumPayoutCentsBySettlementStatus(
  lines: MarketplaceSettlementLine[],
  status: MarketplaceSettlementLine['payoutSettlementStatus'],
): number {
  return lines
    .filter((line) => line.payoutSettlementStatus === status)
    .reduce((total, line) => total + line.payoutCents, 0);
}

function increment(counts: Map<string, number>, key: string): void {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

function sortedValues<T extends { id: string }>(values: Map<string, T>): T[] {
  return [...values.values()]
    .map((value) => clone(value))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function auditActorId(kind: 'buyer', rawId: string): string {
  return auditHash(kind, rawId);
}

function auditHash(kind: string, rawId: string): string {
  return `${kind}:${createHash('sha256').update(rawId).digest('hex').slice(0, 16)}`;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
