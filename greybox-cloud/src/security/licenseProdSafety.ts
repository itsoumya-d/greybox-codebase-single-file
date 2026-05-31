// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

/**
 * Production-only safety enforcement around license validation options.
 *
 * The license validator (see ../routers/licenses.ts) already fails closed when
 * any signed record or signing-key registry is configured. This module adds the
 * production-environment guard the platform must always apply: when running
 * with NODE_ENV=production we refuse to accept prefix-only license tokens
 * (e.g. "gbx_pro_*") unless an operator has *explicitly* enabled the legacy
 * fallback via a time-bound GREYBOX_CLOUD_ALLOW_PREFIX_FALLBACK break-glass.
 * The intent is to make the safe default impossible to bypass by accident.
 */

import type { LicenseValidationOptions } from '../routers/licenses.js';
import { timeBoundBreakGlassAllowed } from './timeBoundBreakGlass.js';

export type ProductionEnv = {
  readonly NODE_ENV?: string;
  readonly GREYBOX_CLOUD_ALLOW_PREFIX_FALLBACK?: string;
  readonly GREYBOX_CLOUD_ALLOW_PREFIX_FALLBACK_REASON?: string;
  readonly GREYBOX_CLOUD_ALLOW_PREFIX_FALLBACK_EXPIRES_AT?: string;
  readonly GREYBOX_CLOUD_ALLOW_PREFIX_FALLBACK_NOW?: string;
};

/** Returns true when the runtime is configured as production. */
export function isProductionEnv(env: ProductionEnv = process.env): boolean {
  return (env.NODE_ENV ?? '').toLowerCase() === 'production';
}

/**
 * Returns true when the operator has explicitly opted into the legacy
 * prefix-matching fallback. The override is only accepted when it is literal,
 * reasoned, and expires quickly to keep accidental enablement out of bounds.
 */
export function legacyPrefixFallbackExplicitlyEnabled(env: ProductionEnv = process.env): boolean {
  return timeBoundBreakGlassAllowed(env, { flagKey: 'GREYBOX_CLOUD_ALLOW_PREFIX_FALLBACK' });
}

/**
 * Wraps caller-supplied LicenseValidationOptions and returns a hardened copy
 * that is safe to pass to validateLicenseToken() in production. In production
 * the only way to allow the prefix fallback is to set the explicit env var;
 * otherwise we force allowPrefixFallback to false regardless of what callers
 * passed in (including the implicit default of undefined which, in some code
 * paths upstream, has been interpreted as "open").
 */
export function hardenLicenseOptionsForProd<T extends LicenseValidationOptions>(
  options: T,
  env: ProductionEnv = process.env,
): T {
  if (!isProductionEnv(env)) return options;
  if (legacyPrefixFallbackExplicitlyEnabled(env)) return options;
  return { ...options, allowPrefixFallback: false };
}
