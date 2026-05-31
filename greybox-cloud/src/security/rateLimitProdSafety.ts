// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import type { HttpRateLimiter } from './httpRateLimit.js';
import { isHostedProductionEnv, type HostedProductionPersistenceEnv } from './persistenceProdSafety.js';
import { timeBoundBreakGlassAllowed } from './timeBoundBreakGlass.js';

export interface HostedProductionRateLimitEnv extends HostedProductionPersistenceEnv {
  readonly GREYBOX_CLOUD_ALLOW_UNVERIFIED_RATE_LIMIT?: string;
  readonly GREYBOX_CLOUD_ALLOW_UNVERIFIED_RATE_LIMIT_REASON?: string;
  readonly GREYBOX_CLOUD_ALLOW_UNVERIFIED_RATE_LIMIT_EXPIRES_AT?: string;
  readonly GREYBOX_CLOUD_ALLOW_UNVERIFIED_RATE_LIMIT_NOW?: string;
}

export interface HostedProductionRateLimitOptions {
  readonly env?: HostedProductionRateLimitEnv;
  readonly rateLimiter?: HttpRateLimiter;
}

export class HostedProductionRateLimitError extends Error {
  readonly code = 'hosted_production_rate_limit_not_configured';

  constructor() {
    super([
      'Hosted production requires a global HTTP rate limiter.',
      'Configure GREYBOX_CLOUD_HTTP_RATE_LIMIT_BURST and GREYBOX_CLOUD_HTTP_RATE_LIMIT_PER_SECOND, inject a production limiter, set GREYBOX_DEPLOYMENT_MODE=on-prem for an offline bundle, or use a time-bound GREYBOX_CLOUD_ALLOW_UNVERIFIED_RATE_LIMIT break-glass with reason and expiry.',
    ].join(' '));
    this.name = 'HostedProductionRateLimitError';
  }
}

export function unverifiedRateLimitExplicitlyAllowed(
  env: HostedProductionRateLimitEnv = process.env,
): boolean {
  return timeBoundBreakGlassAllowed(env, { flagKey: 'GREYBOX_CLOUD_ALLOW_UNVERIFIED_RATE_LIMIT' });
}

export function assertHostedProductionRateLimit({
  env = process.env,
  rateLimiter,
}: HostedProductionRateLimitOptions): void {
  if (!isHostedProductionEnv(env)) return;
  if (unverifiedRateLimitExplicitlyAllowed(env)) return;
  if (rateLimiter) return;
  throw new HostedProductionRateLimitError();
}
