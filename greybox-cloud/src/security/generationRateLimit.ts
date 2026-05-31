// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

/**
 * Stricter per-tenant rate limiter for AI generation endpoints.
 *
 * Applied to:
 *   POST /v1/characters/*  (character generation jobs)
 *   POST /v1/inference      (managed inference)
 *
 * Default limits: 10 req/min with a burst of 3 tokens.
 * Override via env:
 *   GREYBOX_GENERATION_RATE_LIMIT_BURST      (default: 3)
 *   GREYBOX_GENERATION_RATE_LIMIT_PER_SECOND (default: 0.1667 = 10/min)
 */

import { HttpRateLimiter, type HttpRateLimitDecision } from './httpRateLimit.js';

const DEFAULT_BURST = 3;
const DEFAULT_PER_SECOND = 10 / 60; // 10 per minute

let _limiter: HttpRateLimiter | undefined;

function getGenerationLimiter(): HttpRateLimiter {
  if (!_limiter) {
    const burst = parsePositiveInt(process.env.GREYBOX_GENERATION_RATE_LIMIT_BURST) ?? DEFAULT_BURST;
    const perSecond = parsePositiveFloat(process.env.GREYBOX_GENERATION_RATE_LIMIT_PER_SECOND) ?? DEFAULT_PER_SECOND;
    _limiter = new HttpRateLimiter({ capacity: burst, refillPerSecond: perSecond });
  }
  return _limiter;
}

/**
 * Reserve one token from the generation rate limiter for the given tenant.
 * Returns a decision object; callers should call `sendRateLimited` when `!allowed`.
 */
export function reserveGenerationQuota(tenantId: string): HttpRateLimitDecision {
  return getGenerationLimiter().reserve(`gen:${tenantId}`);
}

/**
 * Replace the singleton limiter — for tests only.
 */
export function setGenerationRateLimiterForTesting(limiter: HttpRateLimiter): void {
  _limiter = limiter;
}

export function resetGenerationRateLimiterForTesting(): void {
  _limiter = undefined;
}

function parsePositiveInt(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function parsePositiveFloat(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}
