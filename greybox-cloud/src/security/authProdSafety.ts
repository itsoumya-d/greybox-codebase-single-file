// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { isHostedProductionEnv, type HostedProductionPersistenceEnv } from './persistenceProdSafety.js';
import { timeBoundBreakGlassAllowed } from './timeBoundBreakGlass.js';

export interface HostedProductionAuthEnv extends HostedProductionPersistenceEnv {
  readonly WORKOS_JWKS_URL?: string;
  readonly WORKOS_ISSUER?: string;
  readonly GREYBOX_AUTH_AUDIENCE?: string;
  readonly GREYBOX_CLOUD_ALLOW_UNVERIFIED_AUTH?: string;
  readonly GREYBOX_CLOUD_ALLOW_UNVERIFIED_AUTH_REASON?: string;
  readonly GREYBOX_CLOUD_ALLOW_UNVERIFIED_AUTH_EXPIRES_AT?: string;
  readonly GREYBOX_CLOUD_ALLOW_UNVERIFIED_AUTH_NOW?: string;
}

export interface HostedProductionAuthOptions {
  readonly env?: HostedProductionAuthEnv;
  readonly workosVerifierConfigured: boolean;
  readonly workosVerifierSource?: 'env' | 'injected';
}

export class HostedProductionAuthError extends Error {
  readonly code = 'hosted_production_auth_not_verified';

  constructor(readonly issues: readonly string[] = ['workos_verification_not_configured']) {
    super([
      'Hosted production requires verified WorkOS authentication.',
      `Auth issues: ${issues.join(', ')}.`,
      'Configure WORKOS_JWKS_URL with issuer/audience validation, set GREYBOX_DEPLOYMENT_MODE=on-prem for an offline bundle, or use a time-bound GREYBOX_CLOUD_ALLOW_UNVERIFIED_AUTH break-glass with reason and expiry.',
    ].join(' '));
    this.name = 'HostedProductionAuthError';
  }
}

export function authBreakGlassAllowed(env: HostedProductionAuthEnv = process.env): boolean {
  return timeBoundBreakGlassAllowed(env, { flagKey: 'GREYBOX_CLOUD_ALLOW_UNVERIFIED_AUTH' });
}

export function hostedProductionWorkOsJwksUrlVerified(value: string | undefined): boolean {
  if (!value?.trim()) return false;
  try {
    const url = new URL(value.trim());
    const hostname = url.hostname.replace(/^\[|\]$/gu, '').toLowerCase();
    const loopback = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
    return url.protocol === 'https:' && !url.username && !url.password && !loopback;
  } catch {
    return false;
  }
}

export function assertHostedProductionAuth({
  env = process.env,
  workosVerifierConfigured,
  workosVerifierSource,
}: HostedProductionAuthOptions): void {
  if (!isHostedProductionEnv(env)) return;
  if (authBreakGlassAllowed(env)) return;
  if (!workosVerifierConfigured) throw new HostedProductionAuthError();
  if (workosVerifierSource === 'env' && !hostedProductionWorkOsJwksUrlVerified(env.WORKOS_JWKS_URL)) {
    throw new HostedProductionAuthError(['workos_jwks_url_not_https_hosted']);
  }
}
