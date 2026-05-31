// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import {
  buildDataResidencyReadinessReport,
  type DataResidencyReadinessCheck,
  type DataResidencyReadinessReport,
} from '../enterprise/dataResidencyReadiness.js';
import { isHostedProductionEnv, type HostedProductionPersistenceEnv } from './persistenceProdSafety.js';
import { timeBoundBreakGlassAllowed } from './timeBoundBreakGlass.js';
import type { DataResidencyRegion } from '../types.js';

export interface HostedProductionDataResidencyEnv extends HostedProductionPersistenceEnv {
  readonly GREYBOX_CLOUD_ALLOW_UNVERIFIED_DATA_RESIDENCY?: string;
  readonly GREYBOX_CLOUD_ALLOW_UNVERIFIED_DATA_RESIDENCY_REASON?: string;
  readonly GREYBOX_CLOUD_ALLOW_UNVERIFIED_DATA_RESIDENCY_EXPIRES_AT?: string;
  readonly GREYBOX_CLOUD_ALLOW_UNVERIFIED_DATA_RESIDENCY_NOW?: string;
  readonly GREYBOX_DATA_RESIDENCY_ENFORCEMENT?: string;
}

export interface HostedProductionDataResidencyOptions {
  readonly env?: HostedProductionDataResidencyEnv;
  readonly now?: Date;
}

export interface UnsafeDataResidencyCheck {
  readonly region: DataResidencyRegion;
  readonly check: DataResidencyReadinessCheck;
}

export class HostedProductionDataResidencyError extends Error {
  readonly code = 'hosted_production_data_residency_not_verified';

  constructor(
    readonly report: DataResidencyReadinessReport,
    readonly unsafeChecks: readonly UnsafeDataResidencyCheck[],
  ) {
    super(formatDataResidencyMessage(report, unsafeChecks));
    this.name = 'HostedProductionDataResidencyError';
  }
}

export function unverifiedDataResidencyExplicitlyAllowed(
  env: HostedProductionDataResidencyEnv = process.env,
): boolean {
  return timeBoundBreakGlassAllowed(env, { flagKey: 'GREYBOX_CLOUD_ALLOW_UNVERIFIED_DATA_RESIDENCY' });
}

export function assertHostedProductionDataResidency(
  options: HostedProductionDataResidencyOptions = {},
): void {
  const env = options.env ?? process.env;
  if (!isHostedProductionEnv(env)) return;
  if (unverifiedDataResidencyExplicitlyAllowed(env)) return;
  const report = buildDataResidencyReadinessReport({
    env: { ...env },
    ...(options.now ? { now: options.now } : {}),
  });
  if (
    report.summary.readyRegions === report.supportedRegions.length
    && report.summary.warningRegions === 0
    && report.summary.blockedRegions === 0
  ) {
    return;
  }
  throw new HostedProductionDataResidencyError(report, unsafeDataResidencyChecks(report));
}

function unsafeDataResidencyChecks(report: DataResidencyReadinessReport): UnsafeDataResidencyCheck[] {
  return report.regions.flatMap((region) => (
    region.checks
      .filter((check) => check.status !== 'pass')
      .map((check) => ({ region: region.region, check }))
  ));
}

function formatDataResidencyMessage(
  report: DataResidencyReadinessReport,
  unsafeChecks: readonly UnsafeDataResidencyCheck[],
): string {
  const checks = unsafeChecks
    .map((item) => `${item.region}.${item.check.id}=${item.check.status}`)
    .join(', ');
  return [
    'Hosted production requires verified regional data-residency enforcement.',
    `Data residency ready=${report.summary.readyRegions}/${report.supportedRegions.length}; warnings=${report.summary.warningRegions}; blocked=${report.summary.blockedRegions}.`,
    `Unsafe data-residency checks: ${checks}.`,
    'Configure GREYBOX_DATA_RESIDENCY_ENFORCEMENT=strict plus GREYBOX_REGION_* evidence for every hosted region, set GREYBOX_DEPLOYMENT_MODE=on-prem for an offline bundle, or use a time-bound GREYBOX_CLOUD_ALLOW_UNVERIFIED_DATA_RESIDENCY break-glass with reason and expiry.',
  ].join(' ');
}
