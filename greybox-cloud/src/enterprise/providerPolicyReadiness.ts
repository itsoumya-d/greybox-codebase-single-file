// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { providerPolicyFromEnv, type ProviderPolicyConfig } from '../providers/selector.js';
import { DATA_RESIDENCY_REGIONS } from '../routers/tenants.js';
import type { DataResidencyRegion, ProviderName } from '../types.js';

export type ProviderPolicyReadinessStatus = 'pass' | 'warn' | 'fail';

export interface ProviderDpaEvidence {
  provider: ProviderName;
  status: 'signed' | 'planned' | 'missing';
  regions: DataResidencyRegion[];
  transferBasis: 'same-region' | 'dpa' | 'sccs' | 'customer-configured' | 'missing';
  effectiveAt?: string;
}

export interface ProviderPolicyCheck {
  id: string;
  label: string;
  status: ProviderPolicyReadinessStatus;
  detail: string;
  remediation?: string;
}

export interface RegionProviderPolicySummary {
  region: DataResidencyRegion;
  allowedProviders: ProviderName[];
  providersWithSignedDpa: ProviderName[];
  providersMissingDpa: ProviderName[];
}

export interface ProviderPolicyReadinessReport {
  generatedAt: string;
  disclaimer: string;
  summary: {
    status: ProviderPolicyReadinessStatus;
    policyConfigured: boolean;
    tenantPolicies: number;
    regionsWithExplicitProviderPolicy: number;
    allowedProviders: ProviderName[];
    providersWithSignedDpa: ProviderName[];
    providersMissingDpa: ProviderName[];
  };
  checks: ProviderPolicyCheck[];
  regions: RegionProviderPolicySummary[];
  dpaEvidence: ProviderDpaEvidence[];
}

export interface ProviderPolicyReadinessOptions {
  env?: Record<string, string | undefined>;
  now?: Date;
}

const providerNames: ProviderName[] = ['anthropic', 'openai', 'bedrock', 'greybox-native'];
const transferBasis = new Set<ProviderDpaEvidence['transferBasis']>([
  'same-region',
  'dpa',
  'sccs',
  'customer-configured',
  'missing',
]);

export function buildProviderPolicyReadinessReport(
  options: ProviderPolicyReadinessOptions = {},
): ProviderPolicyReadinessReport {
  const env = options.env ?? process.env;
  const policy = providerPolicyFromEnv(env);
  const dpaEvidence = providerDpaEvidenceFromEnv(env);
  const allowed = effectiveAllowedProviders(policy);
  const regions = DATA_RESIDENCY_REGIONS.map((region) => regionSummary(region, policy, dpaEvidence));
  const providersMissingDpa = providersMissingDpaByRegion(allowed, regions, dpaEvidence);
  const providersWithSignedDpa = allowed.filter((provider) => !providersMissingDpa.includes(provider));
  const checks = [
    policyConfiguredCheck(env, policy),
    regionCoverageCheck(policy),
    dpaCoverageCheck(allowed, providersMissingDpa, regions),
    tenantOverrideCheck(policy),
  ];
  const status = checks.some((check) => check.status === 'fail')
    ? 'fail'
    : checks.some((check) => check.status === 'warn')
      ? 'warn'
      : 'pass';
  return {
    generatedAt: (options.now ?? new Date()).toISOString(),
    disclaimer: 'Provider policy readiness is internal enterprise evidence only. Customer order forms, DPAs, provider portals, and production routing logs remain authoritative.',
    summary: {
      status,
      policyConfigured: Boolean(env.GREYBOX_PROVIDER_POLICY_JSON?.trim()),
      tenantPolicies: Object.keys(policy.tenants ?? {}).length,
      regionsWithExplicitProviderPolicy: DATA_RESIDENCY_REGIONS
        .filter((region) => Boolean(policy.regionAllowedProviders?.[region]?.length)).length,
      allowedProviders: allowed,
      providersWithSignedDpa,
      providersMissingDpa,
    },
    checks,
    regions,
    dpaEvidence,
  };
}

export function providerDpaEvidenceFromEnv(
  env: Record<string, string | undefined> = process.env,
): ProviderDpaEvidence[] {
  const raw = env.GREYBOX_PROVIDER_DPA_JSON;
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!isRecord(parsed)) return [];
    return providerNames
      .map((provider) => providerDpaEvidence(provider, parsed[provider]))
      .filter((evidence): evidence is ProviderDpaEvidence => Boolean(evidence));
  } catch {
    return [];
  }
}

function effectiveAllowedProviders(policy: ProviderPolicyConfig): ProviderName[] {
  const allowed = new Set<ProviderName>(policy.allowedProviders ?? providerNames);
  for (const providers of Object.values(policy.regionAllowedProviders ?? {})) {
    for (const provider of providers ?? []) allowed.add(provider);
  }
  for (const tenant of Object.values(policy.tenants ?? {})) {
    for (const provider of tenant.allowedProviders ?? []) allowed.add(provider);
    for (const providers of Object.values(tenant.regionAllowedProviders ?? {})) {
      for (const provider of providers ?? []) allowed.add(provider);
    }
  }
  for (const blocked of policy.blockedProviders ?? []) allowed.delete(blocked);
  return providerNames.filter((provider) => allowed.has(provider));
}

function regionSummary(
  region: DataResidencyRegion,
  policy: ProviderPolicyConfig,
  dpaEvidence: ProviderDpaEvidence[],
): RegionProviderPolicySummary {
  const allowedProviders = policy.regionAllowedProviders?.[region]
    ?? policy.allowedProviders
    ?? providerNames.filter((provider) => !(policy.blockedProviders ?? []).includes(provider));
  return {
    region,
    allowedProviders,
    providersWithSignedDpa: allowedProviders.filter((provider) => dpaPasses(provider, dpaEvidence, region)),
    providersMissingDpa: allowedProviders.filter((provider) => !dpaPasses(provider, dpaEvidence, region)),
  };
}

function policyConfiguredCheck(
  env: Record<string, string | undefined>,
  policy: ProviderPolicyConfig,
): ProviderPolicyCheck {
  if (!env.GREYBOX_PROVIDER_POLICY_JSON?.trim()) {
    return {
      id: 'provider-policy-configured',
      label: 'Provider policy configured',
      status: 'warn',
      detail: 'No provider policy is configured; all supported providers remain eligible unless tenant settings block them.',
      remediation: 'Set GREYBOX_PROVIDER_POLICY_JSON before signing provider-specific enterprise commitments.',
    };
  }
  if (!validJson(env.GREYBOX_PROVIDER_POLICY_JSON)) {
    return {
      id: 'provider-policy-configured',
      label: 'Provider policy configured',
      status: 'fail',
      detail: 'Provider policy environment variable is present but contains invalid JSON.',
      remediation: 'Fix GREYBOX_PROVIDER_POLICY_JSON syntax and provider names.',
    };
  }
  const configured = policyHasExplicitRules(policy);
  return configured
    ? {
        id: 'provider-policy-configured',
        label: 'Provider policy configured',
        status: 'pass',
        detail: 'Provider routing policy is configured and parseable.',
      }
    : {
        id: 'provider-policy-configured',
        label: 'Provider policy configured',
        status: 'fail',
        detail: 'Provider policy environment variable is present but did not produce a usable policy.',
        remediation: 'Fix GREYBOX_PROVIDER_POLICY_JSON syntax and provider names.',
      };
}

function policyHasExplicitRules(policy: ProviderPolicyConfig): boolean {
  return Boolean(
    policy.allowedProviders?.length
      || policy.blockedProviders?.length
      || Object.keys(policy.regionAllowedProviders ?? {}).length
      || Object.keys(policy.tenants ?? {}).length,
  );
}

function validJson(value: string | undefined): boolean {
  try {
    JSON.parse(value ?? '');
    return true;
  } catch {
    return false;
  }
}

function regionCoverageCheck(policy: ProviderPolicyConfig): ProviderPolicyCheck {
  const configured = DATA_RESIDENCY_REGIONS
    .filter((region) => Boolean(policy.regionAllowedProviders?.[region]?.length));
  if (configured.length === DATA_RESIDENCY_REGIONS.length) {
    return {
      id: 'region-provider-policy',
      label: 'Region provider policy',
      status: 'pass',
      detail: 'Every supported region has an explicit provider allowlist.',
    };
  }
  return {
    id: 'region-provider-policy',
    label: 'Region provider policy',
    status: configured.length > 0 ? 'warn' : 'fail',
    detail: `${configured.length}/${DATA_RESIDENCY_REGIONS.length} supported regions have explicit provider allowlists.`,
    remediation: 'Add regionAllowedProviders for us, eu, and in before enterprise residency commitments.',
  };
}

function dpaCoverageCheck(
  allowed: ProviderName[],
  providersMissingDpa: ProviderName[],
  regions: RegionProviderPolicySummary[],
): ProviderPolicyCheck {
  if (allowed.length === 0) {
    return {
      id: 'provider-dpa-coverage',
      label: 'Provider DPA coverage',
      status: 'fail',
      detail: 'No managed inference providers are eligible after policy filtering.',
      remediation: 'Allow at least one provider with signed DPA evidence.',
    };
  }
  if (providersMissingDpa.length === 0) {
    return {
      id: 'provider-dpa-coverage',
      label: 'Provider DPA coverage',
      status: 'pass',
      detail: 'All eligible managed inference providers have signed DPA evidence for their allowed regions.',
    };
  }
  return {
    id: 'provider-dpa-coverage',
    label: 'Provider DPA coverage',
    status: 'fail',
    detail: `Missing signed DPA evidence for ${dpaMissingDetail(providersMissingDpa, regions)}.`,
    remediation: 'Set GREYBOX_PROVIDER_DPA_JSON with signed provider DPA and region coverage evidence.',
  };
}

function providersMissingDpaByRegion(
  allowed: ProviderName[],
  regions: RegionProviderPolicySummary[],
  evidence: ProviderDpaEvidence[],
): ProviderName[] {
  return allowed.filter((provider) => {
    const explicitlyAllowedRegions = regions
      .filter((region) => region.allowedProviders.includes(provider))
      .map((region) => region.region);
    if (explicitlyAllowedRegions.length === 0) return !dpaPasses(provider, evidence);
    return explicitlyAllowedRegions.some((region) => !dpaPasses(provider, evidence, region));
  });
}

function dpaMissingDetail(
  providersMissingDpa: ProviderName[],
  regions: RegionProviderPolicySummary[],
): string {
  return providersMissingDpa
    .map((provider) => {
      const missingRegions = regions
        .filter((region) => region.providersMissingDpa.includes(provider))
        .map((region) => region.region);
      return missingRegions.length > 0 ? `${provider} in ${missingRegions.join('/')}` : provider;
    })
    .join(', ');
}

function tenantOverrideCheck(policy: ProviderPolicyConfig): ProviderPolicyCheck {
  const tenantCount = Object.keys(policy.tenants ?? {}).length;
  return {
    id: 'tenant-provider-overrides',
    label: 'Tenant provider overrides',
    status: tenantCount > 0 ? 'pass' : 'warn',
    detail: tenantCount > 0
      ? `${tenantCount} tenant-specific provider policy record(s) configured.`
      : 'No tenant-specific provider approvals or blocks are configured.',
    remediation: tenantCount > 0 ? undefined : 'Add tenants entries for enterprise customers with provider-specific order forms.',
  };
}

function providerDpaEvidence(provider: ProviderName, value: unknown): ProviderDpaEvidence | undefined {
  if (!isRecord(value)) return undefined;
  const status = value.status === 'signed' || value.status === 'planned' ? value.status : 'missing';
  const basis = typeof value.transferBasis === 'string' && transferBasis.has(value.transferBasis as ProviderDpaEvidence['transferBasis'])
    ? value.transferBasis as ProviderDpaEvidence['transferBasis']
    : 'missing';
  const regions = Array.isArray(value.regions)
    ? value.regions.filter((item): item is DataResidencyRegion => DATA_RESIDENCY_REGIONS.includes(item as DataResidencyRegion))
    : [];
  return {
    provider,
    status,
    regions: [...new Set(regions)],
    transferBasis: basis,
    ...(typeof value.effectiveAt === 'string' && !Number.isNaN(Date.parse(value.effectiveAt))
      ? { effectiveAt: value.effectiveAt }
      : {}),
  };
}

function dpaPasses(
  provider: ProviderName,
  evidence: ProviderDpaEvidence[],
  region?: DataResidencyRegion,
): boolean {
  const record = evidence.find((item) => item.provider === provider);
  if (!record || record.status !== 'signed' || record.transferBasis === 'missing') return false;
  return region ? record.regions.includes(region) : record.regions.length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
