// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  InMemoryMarketplaceStore,
  type MarketplacePayoutReleaseInput,
  type MarketplaceStoreOptions,
} from './marketplaceStore.js';
import type {
  Creator,
  CreatorTaxProfileRecordInput,
  CreatorTaxProfileRecordResult,
  ListingDraft,
  ListingReview,
  MarketplaceCheckoutFulfillmentResult,
  MarketplaceEntitlement,
  MarketplaceEntitlementClaimInput,
  MarketplaceListing,
  MarketplacePayoutReleaseResult,
  MarketplacePurchaseResult,
  MarketplaceRiskEvent,
  MarketplaceRiskEventDraft,
  MarketplaceStoreSnapshot,
  StripeConnectOnboardingLinkResult,
  StripeCheckoutCompletedEvent,
  TaxAddress,
} from '../types.js';

export interface FileBackedMarketplaceStoreOptions extends MarketplaceStoreOptions {
  snapshotPath: string;
}

export class FileBackedMarketplaceStore extends InMemoryMarketplaceStore {
  private readonly snapshotPath: string;

  constructor(options: FileBackedMarketplaceStoreOptions) {
    super(options);
    this.snapshotPath = path.resolve(options.snapshotPath);
    this.loadIfPresent();
  }

  override upsertCreator(creator: Creator): Creator {
    this.loadIfPresent();
    const result = super.upsertCreator(creator);
    this.flush();
    return result;
  }

  override submitListing(draft: ListingDraft, context: {
    creatorRankByGmv?: number;
    creatorCount?: number;
  } = {}): { listing: MarketplaceListing; review: ListingReview } {
    this.loadIfPresent();
    const result = super.submitListing(draft, context);
    this.flush();
    return result;
  }

  override approveReview(reviewId: string, reviewerId: string): MarketplaceListing {
    this.loadIfPresent();
    const result = super.approveReview(reviewId, reviewerId);
    this.flush();
    return result;
  }

  override async createStripeConnectOnboardingLink(
    creatorId: string,
    input: { returnUrl: string; refreshUrl: string },
  ): Promise<StripeConnectOnboardingLinkResult> {
    this.loadIfPresent();
    const result = await super.createStripeConnectOnboardingLink(creatorId, input);
    this.flush();
    return result;
  }

  override recordCreatorTaxProfile(
    creatorId: string,
    input: CreatorTaxProfileRecordInput,
  ): CreatorTaxProfileRecordResult {
    this.loadIfPresent();
    const result = super.recordCreatorTaxProfile(creatorId, input);
    this.flush();
    return result;
  }

  override async purchaseListing(input: {
    listingId: string;
    buyerId: string;
    buyerTaxAddress?: TaxAddress;
    stripeTaxCalculationId?: string;
    stripeTaxTransactionId?: string;
    taxAmountCents?: number;
  }): Promise<MarketplacePurchaseResult> {
    this.loadIfPresent();
    const result = await super.purchaseListing(input);
    this.flush();
    return result;
  }

  override async fulfillCheckoutSession(event: StripeCheckoutCompletedEvent): Promise<MarketplaceCheckoutFulfillmentResult> {
    this.loadIfPresent();
    const result = await super.fulfillCheckoutSession(event);
    this.flush();
    return result;
  }

  override async releaseBlockedPayout(input: MarketplacePayoutReleaseInput): Promise<MarketplacePayoutReleaseResult> {
    this.loadIfPresent();
    const result = await super.releaseBlockedPayout(input);
    if (!result.idempotent && (result.released || result.payout.id !== result.previousPayout.id)) this.flush();
    return result;
  }

  override claimEntitlement(input: MarketplaceEntitlementClaimInput): MarketplaceEntitlement {
    this.loadIfPresent();
    const result = super.claimEntitlement(input);
    this.flush();
    return result;
  }

  override recordRiskEvent(draft: MarketplaceRiskEventDraft): MarketplaceRiskEvent {
    this.loadIfPresent();
    const result = super.recordRiskEvent(draft);
    this.flush();
    return result;
  }

  override async refundOrder(
    input: Parameters<InMemoryMarketplaceStore['refundOrder']>[0],
  ): Promise<Awaited<ReturnType<InMemoryMarketplaceStore['refundOrder']>>> {
    this.loadIfPresent();
    const result = await super.refundOrder(input);
    this.flush();
    return result;
  }

  flush(): void {
    mkdirSync(path.dirname(this.snapshotPath), { recursive: true });
    const temporaryPath = `${this.snapshotPath}.${process.pid}.tmp`;
    writeFileSync(temporaryPath, `${JSON.stringify(this.snapshot(), null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    renameSync(temporaryPath, this.snapshotPath);
  }

  private loadIfPresent(): void {
    if (!existsSync(this.snapshotPath)) return;
    const parsed = JSON.parse(readFileSync(this.snapshotPath, 'utf8')) as unknown;
    this.restoreSnapshot(assertSnapshot(parsed), { audit: false });
  }
}

function assertSnapshot(value: unknown): MarketplaceStoreSnapshot {
  if (!isRecord(value) || value.schemaVersion !== 1) {
    throw new Error('marketplace snapshot must use schemaVersion 1');
  }
  if (!isRecord(value.sequences)) throw new Error('marketplace snapshot sequences are required');
  for (const key of ['creators', 'listings', 'reviews', 'orders', 'entitlements', 'payouts', 'taxRecords'] as const) {
    if (!Array.isArray(value[key])) throw new Error(`marketplace snapshot ${key} must be an array`);
  }
  if (value.riskEvents !== undefined && !Array.isArray(value.riskEvents)) {
    throw new Error('marketplace snapshot riskEvents must be an array');
  }
  if (value.eventReceipts !== undefined && !Array.isArray(value.eventReceipts)) {
    throw new Error('marketplace snapshot eventReceipts must be an array');
  }
  return value as unknown as MarketplaceStoreSnapshot;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
