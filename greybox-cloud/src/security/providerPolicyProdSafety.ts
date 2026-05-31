// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import {
  buildProviderPolicyReadinessReport,
  type ProviderPolicyCheck,
  type ProviderPolicyReadinessReport,
} from '../enterprise/providerPolicyReadiness.js';
import { isHostedProductionEnv, type HostedProductionPersistenceEnv } from './persistenceProdSafety.js';
import { timeBoundBreakGlassAllowed } from './timeBoundBreakGlass.js';

export interface HostedProductionProviderPolicyEnv extends HostedProductionPersistenceEnv {
  readonly GREYBOX_CLOUD_ALLOW_UNVERIFIED_PROVIDER_POLICY?: string;
  readonly GREYBOX_CLOUD_ALLOW_UNVERIFIED_PROVIDER_POLICY_REASON?: string;
  readonly GREYBOX_CLOUD_ALLOW_UNVERIFIED_PROVIDER_POLICY_EXPIRES_AT?: string;
  readonly GREYBOX_CLOUD_ALLOW_UNVERIFIED_PROVIDER_POLICY_NOW?: string;
  readonly GREYBOX_PROVIDER_POLICY_JSON?: string;
  readonly GREYBOX_PROVIDER_DPA_JSON?: string;
}

export interface HostedProductionProviderPolicyOptions {
  readonly env?: HostedProductionProviderPolicyEnv;
  readonly now?: Date;
}

export class HostedProductionProviderPolicyError extends Error {
  readonly code = 'hosted_production_provider_policy_not_verified';

  constructor(
    readonly report: ProviderPolicyReadinessReport,
    readonly unsafeChecks: readonly ProviderPolicyCheck[],
  ) {
    super(formatProviderPolicyMessage(report, unsafeChecks));
    this.name = 'HostedProductionProviderPolicyError';
  }
}

export function unverifiedProviderPolicyExplicitlyAllowed(
  env: HostedProductionProviderPolicyEnv = process.env,
): boolean {
  return timeBoundBreakGlassAllowed(env, { flagKey: 'GREYBOX_CLOUD_ALLOW_UNVERIFIED_PROVIDER_POLICY' });
}

export function assertHostedProductionProviderPolicy(
  options: HostedProductionProviderPolicyOptions = {},
): void {
  const env = options.env ?? process.env;
  if (!isHostedProductionEnv(env)) return;
  if (unverifiedProviderPolicyExplicitlyAllowed(env)) return;
  const report = buildProviderPolicyReadinessReport({ env: { ...env }, ...(options.now ? { now: options.now } : {}) });
  if (report.summary.status === 'pass') return;
  throw new HostedProductionProviderPolicyError(
    report,
    report.checks.filter((check) => check.status !== 'pass'),
  );
}

function formatProviderPolicyMessage(
  report: ProviderPolicyReadinessReport,
  unsafeChecks: readonly ProviderPolicyCheck[],
): string {
  const checks = unsafeChecks
    .map((check) => `${check.id}=${check.status}`)
    .join(', ');
  return [
    'Hosted production requires verified managed-inference provider routing.',
    `Provider policy status=${report.summary.status}.`,
    `Unsafe provider checks: ${checks}.`,
    'Configure GREYBOX_PROVIDER_POLICY_JSON and GREYBOX_PROVIDER_DPA_JSON, set GREYBOX_DEPLOYMENT_MODE=on-prem for an offline bundle, or use a time-bound GREYBOX_CLOUD_ALLOW_UNVERIFIED_PROVIDER_POLICY break-glass with reason and expiry.',
  ].join(' ');
}
