// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import {
  buildCheckoutReadinessReport,
  type CheckoutReadinessCheck,
  type CheckoutReadinessOptions,
  type CheckoutReadinessReport,
} from '../routers/billing.js';
import { isHostedProductionEnv, type HostedProductionPersistenceEnv } from './persistenceProdSafety.js';
import { timeBoundBreakGlassAllowed } from './timeBoundBreakGlass.js';

export interface HostedProductionCheckoutEnv extends HostedProductionPersistenceEnv {
  readonly GREYBOX_CLOUD_ALLOW_UNVERIFIED_CHECKOUT?: string;
  readonly GREYBOX_CLOUD_ALLOW_UNVERIFIED_CHECKOUT_REASON?: string;
  readonly GREYBOX_CLOUD_ALLOW_UNVERIFIED_CHECKOUT_EXPIRES_AT?: string;
  readonly GREYBOX_CLOUD_ALLOW_UNVERIFIED_CHECKOUT_NOW?: string;
}

export interface HostedProductionCheckoutOptions extends CheckoutReadinessOptions {
  readonly env?: HostedProductionCheckoutEnv;
}

export class HostedProductionCheckoutError extends Error {
  readonly code = 'hosted_production_checkout_not_verified';

  constructor(
    readonly report: CheckoutReadinessReport,
    readonly unsafeChecks: readonly CheckoutReadinessCheck[],
  ) {
    super(formatCheckoutMessage(report, unsafeChecks));
    this.name = 'HostedProductionCheckoutError';
  }
}

export function unverifiedCheckoutExplicitlyAllowed(
  env: HostedProductionCheckoutEnv = process.env,
): boolean {
  return timeBoundBreakGlassAllowed(env, { flagKey: 'GREYBOX_CLOUD_ALLOW_UNVERIFIED_CHECKOUT' });
}

export function assertHostedProductionCheckoutReady(
  options: HostedProductionCheckoutOptions = {},
): void {
  const env = options.env ?? process.env;
  if (!isHostedProductionEnv(env)) return;
  if (unverifiedCheckoutExplicitlyAllowed(env)) return;
  const report = buildCheckoutReadinessReport({
    ...options,
    requireStripeWebhookEvents: true,
  });
  if (report.ready) return;
  throw new HostedProductionCheckoutError(
    report,
    report.checks.filter((check) => check.status !== 'pass'),
  );
}

function formatCheckoutMessage(
  report: CheckoutReadinessReport,
  unsafeChecks: readonly CheckoutReadinessCheck[],
): string {
  const checks = unsafeChecks
    .map((check) => `${check.id}=${check.status}`)
    .join(', ');
  return [
    'Hosted production requires verified Stripe Checkout and marketplace fulfillment wiring.',
    `Checkout ready=${report.ready}; failed=${report.summary.failed}.`,
    `Unsafe checkout checks: ${checks}.`,
    'Configure STRIPE_WEBHOOK_SECRET, GREYBOX_MARKETPLACE_URL, GREYBOX_MARKETPLACE_ADMIN_TOKEN, and an audit log, set GREYBOX_DEPLOYMENT_MODE=on-prem for an offline bundle, or use a time-bound GREYBOX_CLOUD_ALLOW_UNVERIFIED_CHECKOUT break-glass with reason and expiry.',
  ].join(' ');
}
