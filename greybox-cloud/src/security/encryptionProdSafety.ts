// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import {
  buildEncryptionReadinessReport,
  type EncryptionReadinessCheck,
  type EncryptionReadinessReport,
} from '../enterprise/encryptionReadiness.js';
import { isHostedProductionEnv, type HostedProductionPersistenceEnv } from './persistenceProdSafety.js';
import { timeBoundBreakGlassAllowed } from './timeBoundBreakGlass.js';

export interface HostedProductionEncryptionEnv extends HostedProductionPersistenceEnv {
  readonly GREYBOX_CLOUD_ALLOW_UNVERIFIED_ENCRYPTION?: string;
  readonly GREYBOX_CLOUD_ALLOW_UNVERIFIED_ENCRYPTION_REASON?: string;
  readonly GREYBOX_CLOUD_ALLOW_UNVERIFIED_ENCRYPTION_EXPIRES_AT?: string;
  readonly GREYBOX_CLOUD_ALLOW_UNVERIFIED_ENCRYPTION_NOW?: string;
  readonly GREYBOX_ENCRYPTION_EVIDENCE_JSON?: string;
}

export interface HostedProductionEncryptionOptions {
  readonly env?: HostedProductionEncryptionEnv;
  readonly now?: Date;
}

export class HostedProductionEncryptionError extends Error {
  readonly code = 'hosted_production_encryption_not_verified';

  constructor(
    readonly report: EncryptionReadinessReport,
    readonly unsafeChecks: readonly EncryptionReadinessCheck[],
  ) {
    super(formatEncryptionMessage(report, unsafeChecks));
    this.name = 'HostedProductionEncryptionError';
  }
}

export function unverifiedEncryptionExplicitlyAllowed(
  env: HostedProductionEncryptionEnv = process.env,
): boolean {
  return timeBoundBreakGlassAllowed(env, { flagKey: 'GREYBOX_CLOUD_ALLOW_UNVERIFIED_ENCRYPTION' });
}

export function assertHostedProductionEncryption(
  options: HostedProductionEncryptionOptions = {},
): void {
  const env = options.env ?? process.env;
  if (!isHostedProductionEnv(env)) return;
  if (unverifiedEncryptionExplicitlyAllowed(env)) return;
  const report = buildEncryptionReadinessReport({
    env: { ...env },
    ...(options.now ? { now: options.now } : {}),
  });
  if (report.summary.status === 'pass') return;
  throw new HostedProductionEncryptionError(
    report,
    report.checks.filter((check) => check.status !== 'pass'),
  );
}

function formatEncryptionMessage(
  report: EncryptionReadinessReport,
  unsafeChecks: readonly EncryptionReadinessCheck[],
): string {
  const checks = unsafeChecks
    .map((check) => `${check.id}=${check.status}`)
    .join(', ');
  return [
    'Hosted production requires verified encryption/KMS evidence.',
    `Encryption status=${report.summary.status}.`,
    `Unsafe encryption checks: ${checks}.`,
    'Configure GREYBOX_ENCRYPTION_EVIDENCE_JSON, set GREYBOX_DEPLOYMENT_MODE=on-prem for an offline bundle, or use a time-bound GREYBOX_CLOUD_ALLOW_UNVERIFIED_ENCRYPTION break-glass with reason and expiry.',
  ].join(' ');
}
