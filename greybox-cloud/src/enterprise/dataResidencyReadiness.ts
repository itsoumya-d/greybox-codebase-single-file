// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import type { DataResidencyRegion } from '../types.js';
import { DATA_RESIDENCY_REGIONS } from '../routers/tenants.js';
import { dataResidencyRuntimeModeFromEnv } from './dataResidencyRuntime.js';

export type DataResidencyCheckStatus = 'pass' | 'warn' | 'fail';

export interface DataResidencyReadinessCheck {
  id: string;
  label: string;
  status: DataResidencyCheckStatus;
  detail: string;
  remediation?: string;
}

export interface DataResidencyRegionReadiness {
  region: DataResidencyRegion;
  label: string;
  status: DataResidencyCheckStatus;
  checks: DataResidencyReadinessCheck[];
}

export interface DataResidencyReadinessReport {
  generatedAt: string;
  disclaimer: string;
  supportedRegions: readonly DataResidencyRegion[];
  summary: {
    readyRegions: number;
    warningRegions: number;
    blockedRegions: number;
  };
  regions: DataResidencyRegionReadiness[];
}

export interface DataResidencyReadinessOptions {
  env?: Record<string, string | undefined>;
  now?: Date;
}

const labels: Record<DataResidencyRegion, string> = {
  us: 'United States',
  eu: 'European Union / EEA',
  in: 'India',
};

const transferBasis = new Set(['same-region', 'dpa', 'sccs', 'customer-configured']);
const providerEgress = new Set(['local', 'customer-selected', 'cross-region-disclosed', 'cross-region-undisclosed']);
const backupBoundary = new Set(['local', 'cross-region-disclosed', 'cross-region-undisclosed']);

export function buildDataResidencyReadinessReport(
  options: DataResidencyReadinessOptions = {},
): DataResidencyReadinessReport {
  const env = options.env ?? process.env;
  const regions = DATA_RESIDENCY_REGIONS.map((region) => regionReadiness(region, env));
  return {
    generatedAt: (options.now ?? new Date()).toISOString(),
    disclaimer: 'Data residency readiness evidence only. Customer order forms, production architecture diagrams, and counsel-approved transfer terms remain authoritative.',
    supportedRegions: DATA_RESIDENCY_REGIONS,
    summary: {
      readyRegions: regions.filter((region) => region.status === 'pass').length,
      warningRegions: regions.filter((region) => region.status === 'warn').length,
      blockedRegions: regions.filter((region) => region.status === 'fail').length,
    },
    regions,
  };
}

function regionReadiness(
  region: DataResidencyRegion,
  env: Record<string, string | undefined>,
): DataResidencyRegionReadiness {
  const checks = [
    deploymentCheck(region, env),
    runtimeEnforcementCheck(region, env),
    storageBoundaryCheck(region, env),
    providerEgressCheck(region, env),
    transferBasisCheck(region, env),
    backupBoundaryCheck(region, env),
  ];
  return {
    region,
    label: labels[region],
    status: aggregateStatus(checks),
    checks,
  };
}

function deploymentCheck(
  region: DataResidencyRegion,
  env: Record<string, string | undefined>,
): DataResidencyReadinessCheck {
  const url = envValue(region, env, 'BASE_URL');
  if (isHttpsUrl(url)) {
    return {
      id: 'regional-deployment-url',
      label: 'Regional deployment URL',
      status: 'pass',
      detail: `Configured for ${labels[region]}.`,
    };
  }
  return {
    id: 'regional-deployment-url',
    label: 'Regional deployment URL',
    status: 'warn',
    detail: 'No HTTPS regional deployment URL is configured.',
    remediation: `Set ${envKey(region, 'BASE_URL')} to the region-local Greybox Cloud URL.`,
  };
}

function runtimeEnforcementCheck(
  region: DataResidencyRegion,
  env: Record<string, string | undefined>,
): DataResidencyReadinessCheck {
  const mode = dataResidencyRuntimeModeFromEnv(env);
  const url = envValue(region, env, 'BASE_URL');
  if (mode === 'strict' && isHttpsUrl(url)) {
    return {
      id: 'runtime-region-enforcement',
      label: 'Runtime regional enforcement',
      status: 'pass',
      detail: `Strict managed-inference routing is active for ${labels[region]}.`,
    };
  }
  if (mode === 'strict') {
    return {
      id: 'runtime-region-enforcement',
      label: 'Runtime regional enforcement',
      status: 'warn',
      detail: 'Strict enforcement is enabled, but this region has no valid HTTPS endpoint.',
      remediation: `Set ${envKey(region, 'BASE_URL')} to the region-local Greybox Cloud URL.`,
    };
  }
  return {
    id: 'runtime-region-enforcement',
    label: 'Runtime regional enforcement',
    status: 'warn',
    detail: `Runtime enforcement is ${mode}.`,
    remediation: 'Set GREYBOX_DATA_RESIDENCY_ENFORCEMENT=strict before signing hosted residency commitments.',
  };
}

function storageBoundaryCheck(
  region: DataResidencyRegion,
  env: Record<string, string | undefined>,
): DataResidencyReadinessCheck {
  const boundary = envValue(region, env, 'STORAGE_BOUNDARY')?.toLowerCase();
  if (boundary === 'local') {
    return {
      id: 'storage-boundary',
      label: 'Region-local durable stores',
      status: 'pass',
      detail: 'Billing, audit, SCIM, privacy, incident, consent, and legal-hold stores are marked region-local.',
    };
  }
  if (boundary === 'cross-region') {
    return {
      id: 'storage-boundary',
      label: 'Region-local durable stores',
      status: 'fail',
      detail: 'Durable stores are marked cross-region without a residency exception.',
      remediation: `Move durable stores to ${labels[region]} or record a customer-approved exception.`,
    };
  }
  return {
    id: 'storage-boundary',
    label: 'Region-local durable stores',
    status: 'warn',
    detail: 'Storage boundary is not declared.',
    remediation: `Set ${envKey(region, 'STORAGE_BOUNDARY')}=local after region-local storage is provisioned.`,
  };
}

function providerEgressCheck(
  region: DataResidencyRegion,
  env: Record<string, string | undefined>,
): DataResidencyReadinessCheck {
  const egress = envValue(region, env, 'PROVIDER_EGRESS')?.toLowerCase();
  if (egress && providerEgress.has(egress)) {
    if (egress === 'cross-region-undisclosed') {
      return {
        id: 'provider-egress',
        label: 'Managed inference provider egress',
        status: 'fail',
        detail: 'Provider egress is cross-region and not disclosed.',
        remediation: 'Disclose the transfer basis in the subprocessor registry and customer order form before launch.',
      };
    }
    return {
      id: 'provider-egress',
      label: 'Managed inference provider egress',
      status: egress === 'cross-region-disclosed' ? 'warn' : 'pass',
      detail: `Provider egress policy is ${egress}.`,
    };
  }
  return {
    id: 'provider-egress',
    label: 'Managed inference provider egress',
    status: 'warn',
    detail: 'Provider egress policy is not declared.',
    remediation: `Set ${envKey(region, 'PROVIDER_EGRESS')} to local, customer-selected, or cross-region-disclosed.`,
  };
}

function transferBasisCheck(
  region: DataResidencyRegion,
  env: Record<string, string | undefined>,
): DataResidencyReadinessCheck {
  const basis = envValue(region, env, 'TRANSFER_BASIS')?.toLowerCase();
  if (basis && transferBasis.has(basis)) {
    return {
      id: 'transfer-basis',
      label: 'Transfer basis',
      status: 'pass',
      detail: `Transfer basis is ${basis}.`,
    };
  }
  return {
    id: 'transfer-basis',
    label: 'Transfer basis',
    status: 'warn',
    detail: 'No transfer basis is declared for subprocessors or cross-region processing.',
    remediation: `Set ${envKey(region, 'TRANSFER_BASIS')} to same-region, dpa, sccs, or customer-configured.`,
  };
}

function backupBoundaryCheck(
  region: DataResidencyRegion,
  env: Record<string, string | undefined>,
): DataResidencyReadinessCheck {
  const boundary = envValue(region, env, 'BACKUP_BOUNDARY')?.toLowerCase();
  if (boundary && backupBoundary.has(boundary)) {
    if (boundary === 'cross-region-undisclosed') {
      return {
        id: 'backup-boundary',
        label: 'Backup boundary',
        status: 'fail',
        detail: 'Backup boundary is cross-region and not disclosed.',
        remediation: 'Move backups in-region or document the transfer basis before production.',
      };
    }
    return {
      id: 'backup-boundary',
      label: 'Backup boundary',
      status: boundary === 'cross-region-disclosed' ? 'warn' : 'pass',
      detail: `Backup boundary is ${boundary}.`,
    };
  }
  return {
    id: 'backup-boundary',
    label: 'Backup boundary',
    status: 'warn',
    detail: 'Backup boundary is not declared.',
    remediation: `Set ${envKey(region, 'BACKUP_BOUNDARY')}=local after backup policy is provisioned.`,
  };
}

function aggregateStatus(checks: DataResidencyReadinessCheck[]): DataResidencyCheckStatus {
  if (checks.some((check) => check.status === 'fail')) return 'fail';
  if (checks.some((check) => check.status === 'warn')) return 'warn';
  return 'pass';
}

function envKey(region: DataResidencyRegion, suffix: string): string {
  return `GREYBOX_REGION_${region.toUpperCase()}_${suffix}`;
}

function envValue(
  region: DataResidencyRegion,
  env: Record<string, string | undefined>,
  suffix: string,
): string | undefined {
  return env[envKey(region, suffix)]?.trim();
}

function isHttpsUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}
