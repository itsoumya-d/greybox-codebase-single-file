// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import type { CorsPolicy } from './cors.js';
import { isHostedProductionEnv, type HostedProductionPersistenceEnv } from './persistenceProdSafety.js';
import { timeBoundBreakGlassAllowed } from './timeBoundBreakGlass.js';

export interface HostedProductionCorsEnv extends HostedProductionPersistenceEnv {
  readonly GREYBOX_CLOUD_ALLOW_UNVERIFIED_CORS?: string;
  readonly GREYBOX_CLOUD_ALLOW_UNVERIFIED_CORS_REASON?: string;
  readonly GREYBOX_CLOUD_ALLOW_UNVERIFIED_CORS_EXPIRES_AT?: string;
  readonly GREYBOX_CLOUD_ALLOW_UNVERIFIED_CORS_NOW?: string;
}

export interface HostedProductionCorsOptions {
  readonly env?: HostedProductionCorsEnv;
  readonly policy?: CorsPolicy;
}

export class HostedProductionCorsError extends Error {
  readonly code = 'hosted_production_cors_not_verified';

  constructor(readonly unsafeOrigins: readonly string[]) {
    super([
      'Hosted production CORS origins must be explicit HTTPS origins.',
      `Unsafe origins: ${unsafeOrigins.join(', ') || 'none'}.`,
      'Configure GREYBOX_CLOUD_ALLOWED_ORIGINS with only HTTPS origins, set GREYBOX_DEPLOYMENT_MODE=on-prem for an offline bundle, or use a time-bound GREYBOX_CLOUD_ALLOW_UNVERIFIED_CORS break-glass with reason and expiry.',
    ].join(' '));
    this.name = 'HostedProductionCorsError';
  }
}

export function unverifiedCorsExplicitlyAllowed(env: HostedProductionCorsEnv = process.env): boolean {
  return timeBoundBreakGlassAllowed(env, { flagKey: 'GREYBOX_CLOUD_ALLOW_UNVERIFIED_CORS' });
}

export function unsafeHostedCorsOrigins(policy: CorsPolicy | undefined): string[] {
  if (!policy) return [];
  return [...policy.allowedOrigins].filter((origin) => origin === '*' || !origin.startsWith('https://'));
}

export function assertHostedProductionCors({
  env = process.env,
  policy,
}: HostedProductionCorsOptions): void {
  if (!isHostedProductionEnv(env)) return;
  if (unverifiedCorsExplicitlyAllowed(env)) return;
  const unsafeOrigins = unsafeHostedCorsOrigins(policy);
  if (unsafeOrigins.length > 0) throw new HostedProductionCorsError(unsafeOrigins);
}
