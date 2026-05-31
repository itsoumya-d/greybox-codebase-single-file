// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { isHostedProductionEnv, type HostedProductionPersistenceEnv } from './persistenceProdSafety.js';
import { timeBoundBreakGlassAllowed } from './timeBoundBreakGlass.js';

export interface HostedProductionScimEnv extends HostedProductionPersistenceEnv {
  readonly GREYBOX_CLOUD_ALLOW_UNVERIFIED_SCIM?: string;
  readonly GREYBOX_CLOUD_ALLOW_UNVERIFIED_SCIM_REASON?: string;
  readonly GREYBOX_CLOUD_ALLOW_UNVERIFIED_SCIM_EXPIRES_AT?: string;
  readonly GREYBOX_CLOUD_ALLOW_UNVERIFIED_SCIM_NOW?: string;
}

export interface HostedProductionScimOptions {
  readonly env?: HostedProductionScimEnv;
  readonly token?: string;
}

const minHostedScimTokenLength = 32;
const placeholderCredentialPattern = /(?:replace|changeme|example|sample|dummy|random-token|secret|token)$/iu;

export class HostedProductionScimError extends Error {
  readonly code = 'hosted_production_scim_not_verified';

  constructor() {
    super([
      'Hosted production requires a strong SCIM bearer token.',
      'Configure GREYBOX_SCIM_TOKEN with at least 32 non-placeholder characters, set GREYBOX_DEPLOYMENT_MODE=on-prem for an offline bundle, or use a time-bound GREYBOX_CLOUD_ALLOW_UNVERIFIED_SCIM break-glass with reason and expiry.',
    ].join(' '));
    this.name = 'HostedProductionScimError';
  }
}

export function unverifiedScimExplicitlyAllowed(env: HostedProductionScimEnv = process.env): boolean {
  return timeBoundBreakGlassAllowed(env, { flagKey: 'GREYBOX_CLOUD_ALLOW_UNVERIFIED_SCIM' });
}

export function strongHostedScimToken(token: string | undefined): boolean {
  const normalized = token?.trim() ?? '';
  return normalized.length >= minHostedScimTokenLength && !placeholderCredentialPattern.test(normalized);
}

export function assertHostedProductionScimToken({
  env = process.env,
  token,
}: HostedProductionScimOptions): void {
  if (!isHostedProductionEnv(env)) return;
  if (strongHostedScimToken(token)) return;
  if (unverifiedScimExplicitlyAllowed(env)) return;
  throw new HostedProductionScimError();
}
