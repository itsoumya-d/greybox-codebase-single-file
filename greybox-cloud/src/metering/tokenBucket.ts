// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import type { PlanTier } from '../types.js';

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

const tierCapacity: Record<PlanTier, number> = {
  free: 0,
  indie: 80_000,
  studio: 300_000,
  enterprise: 1_500_000,
};

const refillPerMinute: Record<PlanTier, number> = {
  free: 0,
  indie: 20_000,
  studio: 80_000,
  enterprise: 400_000,
};

interface BucketState {
  tokens: number;
  updatedAt: number;
}

export class TokenBucketLimiter {
  private readonly buckets = new Map<string, BucketState>();

  reserve(key: string, tier: PlanTier, requestedTokens: number, now = Date.now()): RateLimitDecision {
    const capacity = tierCapacity[tier];
    const refillRate = refillPerMinute[tier];
    const existing = this.buckets.get(key) ?? { tokens: capacity, updatedAt: now };
    const elapsedMinutes = Math.max(0, (now - existing.updatedAt) / 60_000);
    const tokens = Math.min(capacity, existing.tokens + elapsedMinutes * refillRate);
    const allowed = requestedTokens <= tokens;
    const nextTokens = allowed ? tokens - requestedTokens : tokens;
    this.buckets.set(key, { tokens: nextTokens, updatedAt: now });

    const shortfall = Math.max(0, requestedTokens - nextTokens);
    const resetAt = refillRate > 0 ? now + Math.ceil((shortfall / refillRate) * 60_000) : Number.POSITIVE_INFINITY;
    return { allowed, remaining: Math.floor(nextTokens), resetAt };
  }
}
