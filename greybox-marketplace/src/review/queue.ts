// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { critiqueListingDraft } from './critique.js';
import type { ListingDraft, ListingReview, MarketplaceListing, ReviewFlag } from '../types.js';

export interface ReviewContext {
  listingRankByCreatorGmv?: number;
  creatorCount?: number;
  now: number;
}

function highSeverity(flags: ReviewFlag[]): boolean {
  return flags.some((flag) => flag.severity === 'high' || flag.severity === 'critical');
}

export function topGmvHumanReviewRequired(context: ReviewContext): boolean {
  if (!context.listingRankByCreatorGmv || !context.creatorCount) return false;
  const threshold = Math.max(1, Math.ceil(context.creatorCount * 0.1));
  return context.listingRankByCreatorGmv <= threshold;
}

export function createListingReview(
  listing: MarketplaceListing,
  draft: ListingDraft,
  context: ReviewContext,
): ListingReview {
  const flags = critiqueListingDraft(draft);
  const humanReviewRequired = highSeverity(flags) || topGmvHumanReviewRequired(context);
  return {
    id: `review-${listing.id}`,
    listingId: listing.id,
    status: flags.some((flag) => flag.severity === 'critical') ? 'rejected' : humanReviewRequired ? 'human-required' : 'passed',
    flags,
    humanReviewRequired,
    createdAt: context.now,
  };
}
