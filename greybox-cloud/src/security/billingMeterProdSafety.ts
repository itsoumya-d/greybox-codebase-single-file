// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { isHostedProductionEnv, type HostedProductionPersistenceEnv } from './persistenceProdSafety.js';
import { timeBoundBreakGlassAllowed } from './timeBoundBreakGlass.js';

export interface HostedProductionMeteringEnv extends HostedProductionPersistenceEnv {
  readonly GREYBOX_CLOUD_ALLOW_DRY_RUN_METERING?: string;
  readonly GREYBOX_CLOUD_ALLOW_DRY_RUN_METERING_REASON?: string;
  readonly GREYBOX_CLOUD_ALLOW_DRY_RUN_METERING_EXPIRES_AT?: string;
  readonly GREYBOX_CLOUD_ALLOW_DRY_RUN_METERING_NOW?: string;
}

export interface HostedProductionMeteringOptions {
  readonly env?: HostedProductionMeteringEnv;
  readonly submitStripe: boolean;
  readonly dryRun?: boolean;
  readonly stripeApiKey?: string;
}

export class HostedProductionMeteringError extends Error {
  readonly code = 'hosted_production_metering_not_live';
  readonly status = 400;

  constructor(readonly reasons: readonly string[]) {
    super(formatMeteringMessage(reasons));
    this.name = 'HostedProductionMeteringError';
  }
}

export function dryRunMeteringExplicitlyAllowed(
  env: HostedProductionMeteringEnv = process.env,
): boolean {
  return timeBoundBreakGlassAllowed(env, { flagKey: 'GREYBOX_CLOUD_ALLOW_DRY_RUN_METERING' });
}

export function assertHostedProductionMeteringLive(
  options: HostedProductionMeteringOptions,
): void {
  const env = options.env ?? process.env;
  if (!isHostedProductionEnv(env)) return;
  if (!options.submitStripe) return;
  if (dryRunMeteringExplicitlyAllowed(env)) return;

  const reasons: string[] = [];
  if (options.dryRun !== false) {
    reasons.push('dry_run_enabled');
  }
  if (!isLiveStripeSecretKey(options.stripeApiKey)) {
    reasons.push('live_stripe_api_key_missing');
  }
  if (reasons.length > 0) throw new HostedProductionMeteringError(reasons);
}

function isLiveStripeSecretKey(value: string | undefined): boolean {
  const key = value?.trim() ?? '';
  if (key.length < 24) return false;
  return key.startsWith('sk_live_') || key.startsWith('rk_live_');
}

function formatMeteringMessage(reasons: readonly string[]): string {
  return [
    'Hosted production Stripe metering must submit live meter events.',
    `Unsafe metering checks: ${reasons.join(', ')}.`,
    'Send dryRun=false with a live Stripe secret/restricted key, set GREYBOX_DEPLOYMENT_MODE=on-prem for an offline bundle, or use a time-bound GREYBOX_CLOUD_ALLOW_DRY_RUN_METERING break-glass with reason and expiry.',
  ].join(' ');
}
