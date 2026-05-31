// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import type { DataResidencyRegion, InferenceRequest, InferenceTask, PlanTier, ProviderCandidate, ProviderClient, ProviderName, TenantConfig } from '../types.js';

const defaultProviderByTask: Record<InferenceTask, ProviderName> = {
  design: 'anthropic',
  'cheap-chat': 'openai',
  playtest: 'anthropic',
  code: 'anthropic',
  vision: 'anthropic',
};

const providerNames = new Set<ProviderName>(['anthropic', 'openai', 'bedrock', 'greybox-native']);

export interface ProviderPolicyConfig {
  allowedProviders?: ProviderName[];
  blockedProviders?: ProviderName[];
  regionAllowedProviders?: Partial<Record<DataResidencyRegion, ProviderName[]>>;
  tenants?: Record<string, {
    allowedProviders?: ProviderName[];
    blockedProviders?: ProviderName[];
    regionAllowedProviders?: Partial<Record<DataResidencyRegion, ProviderName[]>>;
  }>;
}

function tierAllowsManagedInference(tier: PlanTier): boolean {
  return tier !== 'free';
}

function candidateScore(candidate: ProviderCandidate, preferred: ProviderName): number {
  const blendedCost = candidate.inputCostPer1K * 0.75 + candidate.outputCostPer1K * 0.25;
  const preferenceBonus = candidate.provider === preferred ? -1 : 0;
  const availabilityPenalty = candidate.available ? 0 : 100;
  return blendedCost + candidate.slaMs / 10_000 + preferenceBonus + availabilityPenalty;
}

export class ProviderSelector {
  constructor(
    private readonly providers: ProviderClient[],
    private readonly policy: ProviderPolicyConfig = providerPolicyFromEnv(),
  ) {}

  select(request: InferenceRequest, tenant: TenantConfig): ProviderClient[] {
    if (!tierAllowsManagedInference(tenant.tier)) return [];
    const task = request.task ?? 'design';
    const preferred = request.preferredProvider ?? tenant.preferredProvider ?? defaultProviderByTask[task];
    return this.providers
      .filter((provider) => provider.candidate.supports.includes(task))
      .filter((provider) => providerAllowedByPolicy(provider.candidate.provider, tenant, this.policy))
      .sort((a, b) => candidateScore(a.candidate, preferred) - candidateScore(b.candidate, preferred));
  }
}

export function providerPolicyFromEnv(
  env: Record<string, string | undefined> = process.env,
): ProviderPolicyConfig {
  const raw = env.GREYBOX_PROVIDER_POLICY_JSON;
  if (!raw?.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return normalizeProviderPolicy(parsed);
  } catch {
    return {};
  }
}

export function providerAllowedByPolicy(
  provider: ProviderName,
  tenant: Pick<TenantConfig, 'id' | 'region' | 'allowedProviders' | 'blockedProviders'>,
  policy: ProviderPolicyConfig,
): boolean {
  const tenantPolicy = policy.tenants?.[tenant.id];
  const allowed = tenant.allowedProviders ?? tenantPolicy?.allowedProviders ?? policy.allowedProviders;
  const blocked = new Set([
    ...(policy.blockedProviders ?? []),
    ...(tenantPolicy?.blockedProviders ?? []),
    ...(tenant.blockedProviders ?? []),
  ]);
  const regionAllowed = tenantPolicy?.regionAllowedProviders?.[tenant.region]
    ?? policy.regionAllowedProviders?.[tenant.region];
  if (blocked.has(provider)) return false;
  if (allowed && !allowed.includes(provider)) return false;
  if (regionAllowed && !regionAllowed.includes(provider)) return false;
  return true;
}

function normalizeProviderPolicy(input: unknown): ProviderPolicyConfig {
  if (!isRecord(input)) return {};
  const tenants = isRecord(input.tenants)
    ? Object.fromEntries(Object.entries(input.tenants)
      .filter(([, value]) => isRecord(value))
      .map(([tenantId, value]) => [tenantId, normalizeProviderPolicy(value)]))
    : undefined;
  return {
    ...optionalProviderList('allowedProviders', input.allowedProviders),
    ...optionalProviderList('blockedProviders', input.blockedProviders),
    ...optionalRegionPolicy(input.regionAllowedProviders),
    ...(tenants && Object.keys(tenants).length > 0 ? { tenants } : {}),
  };
}

function optionalProviderList(
  key: 'allowedProviders' | 'blockedProviders',
  value: unknown,
): Pick<ProviderPolicyConfig, 'allowedProviders' | 'blockedProviders'> {
  if (!Array.isArray(value)) return {};
  const providers = [...new Set(value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim().toLowerCase())
    .filter((item): item is ProviderName => providerNames.has(item as ProviderName)))];
  return providers.length > 0 ? { [key]: providers } : {};
}

function optionalRegionPolicy(value: unknown): Pick<ProviderPolicyConfig, 'regionAllowedProviders'> {
  if (!isRecord(value)) return {};
  const regions = Object.fromEntries(
    (['us', 'eu', 'in'] as const)
      .map((region) => [region, optionalProviderList('allowedProviders', value[region]).allowedProviders ?? []])
      .filter(([, providers]) => providers.length > 0),
  ) as Partial<Record<DataResidencyRegion, ProviderName[]>>;
  return Object.keys(regions).length > 0 ? { regionAllowedProviders: regions } : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
