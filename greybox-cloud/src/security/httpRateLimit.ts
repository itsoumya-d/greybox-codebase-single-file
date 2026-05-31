// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import type { IncomingMessage, ServerResponse } from 'node:http';

export interface HttpRateLimitDecision {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  /** Bucket capacity, surfaced so callers can emit X-RateLimit-Limit. */
  limit: number;
}

export interface HttpRateLimiterOptions {
  capacity: number;
  refillPerSecond: number;
  now?: () => number;
}

interface BucketState {
  tokens: number;
  updatedAt: number;
}

export class HttpRateLimiter {
  private readonly buckets = new Map<string, BucketState>();
  private readonly capacity: number;
  private readonly refillPerSecond: number;
  private readonly now: () => number;
  private lastEvictedAt = 0;

  constructor(options: HttpRateLimiterOptions) {
    if (options.capacity <= 0) throw new Error('HttpRateLimiter capacity must be > 0');
    if (options.refillPerSecond <= 0) throw new Error('HttpRateLimiter refillPerSecond must be > 0');
    this.capacity = options.capacity;
    this.refillPerSecond = options.refillPerSecond;
    this.now = options.now ?? Date.now;
  }

  reserve(key: string): HttpRateLimitDecision {
    const now = this.now();
    const existing = this.buckets.get(key) ?? { tokens: this.capacity, updatedAt: now };
    const elapsedSeconds = Math.max(0, (now - existing.updatedAt) / 1000);
    const tokens = Math.min(this.capacity, existing.tokens + elapsedSeconds * this.refillPerSecond);
    const allowed = tokens >= 1;
    const nextTokens = allowed ? tokens - 1 : tokens;
    this.buckets.set(key, { tokens: nextTokens, updatedAt: now });

    // Evict fully-refilled buckets to prevent unbounded memory growth.
    // A bucket is fully refilled once (capacity / refillPerSecond) seconds have passed.
    const refillWindowMs = (this.capacity / this.refillPerSecond) * 1000;
    if (this.buckets.size > 5000 || now - this.lastEvictedAt > 60_000) {
      const staleThreshold = now - refillWindowMs;
      for (const [k, v] of this.buckets) {
        if (v.updatedAt < staleThreshold) this.buckets.delete(k);
      }
      this.lastEvictedAt = now;
    }

    const shortfall = allowed ? 0 : 1 - nextTokens;
    const resetAt = allowed ? now : now + Math.ceil((shortfall / this.refillPerSecond) * 1000);
    return { allowed, remaining: Math.floor(nextTokens), resetAt, limit: this.capacity };
  }
}

export function httpRateLimiterFromEnv(env: NodeJS.ProcessEnv = process.env): HttpRateLimiter | undefined {
  const capacity = parsePositiveInt(env.GREYBOX_CLOUD_HTTP_RATE_LIMIT_BURST);
  const refillPerSecond = parsePositiveFloat(env.GREYBOX_CLOUD_HTTP_RATE_LIMIT_PER_SECOND);
  if (!capacity || !refillPerSecond) return undefined;
  return new HttpRateLimiter({ capacity, refillPerSecond });
}

export function clientKey(request: IncomingMessage): string {
  const forwarded = (request.headers['x-forwarded-for'] ?? '').toString().split(',')[0]?.trim();
  if (forwarded) return forwarded;
  const remote = request.socket.remoteAddress;
  return remote ?? 'unknown';
}

export function sendRateLimited(response: ServerResponse, decision: HttpRateLimitDecision): void {
  const retryAfterSeconds = Math.max(1, Math.ceil((decision.resetAt - Date.now()) / 1000));
  response.writeHead(429, {
    'content-type': 'application/json; charset=utf-8',
    'retry-after': String(retryAfterSeconds),
    'x-greybox-ratelimit-limit': String(decision.limit),
    'x-greybox-ratelimit-remaining': String(decision.remaining),
  });
  response.end(JSON.stringify({ error: 'rate_limited', retryAfterSeconds }));
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
