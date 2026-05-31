// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

export type PrivateNetworkProvider = 'aws' | 'azure';
export type PrivateNetworkStatus = 'pass' | 'warn' | 'fail';

export interface PrivateNetworkCheck {
  id: string;
  label: string;
  status: PrivateNetworkStatus;
  detail: string;
  remediation?: string;
}

export interface PrivateNetworkProfile {
  id: string;
  provider: PrivateNetworkProvider;
  customerName: string;
  region: string;
  status: PrivateNetworkStatus;
  connectionId?: string;
  customerNetworkId?: string;
  greyboxNetworkId?: string;
  customerCidr?: string;
  greyboxCidr?: string;
  lastValidatedAt?: string;
  checks: PrivateNetworkCheck[];
}

export interface PrivateNetworkReadinessReport {
  generatedAt: string;
  disclaimer: string;
  sourceReferences: Array<{ id: string; label: string; url: string }>;
  summary: {
    profiles: number;
    passed: number;
    warnings: number;
    failed: number;
  };
  profiles: PrivateNetworkProfile[];
}

export interface PrivateNetworkReadinessOptions {
  env?: Record<string, string | undefined>;
  now?: Date;
  profiles?: PrivateNetworkProfile[];
  filter?: {
    provider?: PrivateNetworkProvider;
    status?: PrivateNetworkStatus;
  };
}

export class PrivateNetworkReadinessError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code);
    this.name = 'PrivateNetworkReadinessError';
  }
}

const providers = new Set<PrivateNetworkProvider>(['aws', 'azure']);
const statuses = new Set<PrivateNetworkStatus>(['pass', 'warn', 'fail']);

export const privateNetworkSourceReferences = [
  {
    id: 'aws-vpc-peering',
    label: 'AWS VPC peering connections',
    url: 'https://docs.aws.amazon.com/vpc/latest/peering/working-with-vpc-peering.html',
  },
  {
    id: 'aws-vpc-peering-basics',
    label: 'AWS VPC peering route and security-group requirements',
    url: 'https://docs.aws.amazon.com/vpc/latest/peering/vpc-peering-basics.html',
  },
  {
    id: 'azure-vnet-peering',
    label: 'Azure virtual network peering',
    url: 'https://learn.microsoft.com/en-us/azure/virtual-network/virtual-network-peering-overview',
  },
  {
    id: 'azure-vnet-manage-peering',
    label: 'Azure virtual network peering setup and constraints',
    url: 'https://learn.microsoft.com/en-us/azure/virtual-network/virtual-network-manage-peering',
  },
];

export function buildPrivateNetworkReadinessReport(
  options: PrivateNetworkReadinessOptions = {},
): PrivateNetworkReadinessReport {
  const env = options.env ?? process.env;
  const configuredProfiles = options.profiles ?? privateNetworkProfilesFromEnv(env) ?? defaultProfilesFromEnv(env);
  const profiles = configuredProfiles
    .map(normalizeProfile)
    .filter((profile) => !options.filter?.provider || profile.provider === options.filter.provider)
    .filter((profile) => !options.filter?.status || profile.status === options.filter.status)
    .sort((left, right) => left.provider.localeCompare(right.provider) || left.customerName.localeCompare(right.customerName));
  return {
    generatedAt: (options.now ?? new Date()).toISOString(),
    disclaimer: 'Private-network readiness evidence only. Cloud provider consoles, customer network approvals, and production packet tests remain authoritative.',
    sourceReferences: privateNetworkSourceReferences,
    summary: {
      profiles: profiles.length,
      passed: profiles.filter((profile) => profile.status === 'pass').length,
      warnings: profiles.filter((profile) => profile.status === 'warn').length,
      failed: profiles.filter((profile) => profile.status === 'fail').length,
    },
    profiles,
  };
}

export function privateNetworkProfilesFromEnv(
  env: Record<string, string | undefined>,
): PrivateNetworkProfile[] | undefined {
  const raw = env.GREYBOX_PRIVATE_NETWORKS_JSON;
  if (!raw?.trim()) return undefined;
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new PrivateNetworkReadinessError(400, 'GREYBOX_PRIVATE_NETWORKS_JSON_must_be_array');
  }
  return parsed.map(normalizeProfile);
}

function defaultProfilesFromEnv(env: Record<string, string | undefined>): PrivateNetworkProfile[] {
  return [
    providerProfileFromEnv('aws', env),
    providerProfileFromEnv('azure', env),
  ].filter((profile): profile is PrivateNetworkProfile => Boolean(profile));
}

function providerProfileFromEnv(
  provider: PrivateNetworkProvider,
  env: Record<string, string | undefined>,
): PrivateNetworkProfile | undefined {
  const prefix = provider === 'aws' ? 'GREYBOX_AWS_VPC' : 'GREYBOX_AZURE_VNET';
  const connectionId = envValue(env, `${prefix}_PEERING_ID`);
  const customerNetworkId = envValue(env, `${prefix}_CUSTOMER_NETWORK_ID`);
  const greyboxNetworkId = envValue(env, `${prefix}_GREYBOX_NETWORK_ID`);
  const customerName = envValue(env, `${prefix}_CUSTOMER_NAME`);
  const anyConfigured = Boolean(connectionId || customerNetworkId || greyboxNetworkId || customerName);
  if (!anyConfigured) return undefined;
  const checks = provider === 'aws'
    ? awsChecks(env, prefix)
    : azureChecks(env, prefix);
  const status = aggregateStatus(checks);
  return {
    id: cleanToken(envValue(env, `${prefix}_PROFILE_ID`), `${provider}-private-network`),
    provider,
    customerName: cleanText(customerName, 'Enterprise customer', 120),
    region: cleanText(envValue(env, `${prefix}_REGION`), 'customer-selected', 80),
    status,
    ...(connectionId ? { connectionId: connectionId.slice(0, 160) } : {}),
    ...(customerNetworkId ? { customerNetworkId: customerNetworkId.slice(0, 200) } : {}),
    ...(greyboxNetworkId ? { greyboxNetworkId: greyboxNetworkId.slice(0, 200) } : {}),
    ...(envValue(env, `${prefix}_CUSTOMER_CIDR`) ? { customerCidr: envValue(env, `${prefix}_CUSTOMER_CIDR`)!.slice(0, 64) } : {}),
    ...(envValue(env, `${prefix}_GREYBOX_CIDR`) ? { greyboxCidr: envValue(env, `${prefix}_GREYBOX_CIDR`)!.slice(0, 64) } : {}),
    ...(cleanDate(envValue(env, `${prefix}_LAST_VALIDATED_AT`)) ? { lastValidatedAt: cleanDate(envValue(env, `${prefix}_LAST_VALIDATED_AT`)) } : {}),
    checks,
  };
}

function awsChecks(env: Record<string, string | undefined>, prefix: string): PrivateNetworkCheck[] {
  return [
    idCheck(envValue(env, `${prefix}_PEERING_ID`), /^pcx-[a-z0-9]+$/u, 'peering-id', 'AWS VPC peering connection', 'Set the accepted VPC peering connection id, for example pcx-abc123.'),
    requiredTextCheck(envValue(env, `${prefix}_CUSTOMER_NETWORK_ID`), /^vpc-[a-z0-9]+$/u, 'customer-vpc', 'Customer VPC id', 'Set the customer VPC id.'),
    requiredTextCheck(envValue(env, `${prefix}_GREYBOX_NETWORK_ID`), /^vpc-[a-z0-9]+$/u, 'greybox-vpc', 'Greybox VPC id', 'Set the Greybox VPC id.'),
    booleanCheck(envValue(env, `${prefix}_CIDR_NON_OVERLAP`), 'cidr-non-overlap', 'Non-overlapping CIDR blocks', 'Confirm requester and accepter VPC CIDR blocks do not overlap.'),
    booleanCheck(envValue(env, `${prefix}_ROUTES_UPDATED`), 'route-tables', 'Route tables updated', 'Add routes for peer CIDR ranges to the peering connection in both VPCs.'),
    booleanCheck(envValue(env, `${prefix}_SECURITY_RULES_SCOPED`), 'security-rules', 'Security groups scoped', 'Restrict security-group rules to the peer CIDR or peer security group where supported.'),
    optionalBooleanCheck(envValue(env, `${prefix}_DNS_ENABLED`), 'dns-resolution', 'DNS resolution', 'Enable DNS resolution for private hostnames where the customer requires it.'),
    validatedAtCheck(envValue(env, `${prefix}_LAST_VALIDATED_AT`), 'reachability-validation', 'Reachability validation', 'Record a successful reachability test timestamp after route and security-rule changes.'),
  ];
}

function azureChecks(env: Record<string, string | undefined>, prefix: string): PrivateNetworkCheck[] {
  return [
    idCheck(envValue(env, `${prefix}_PEERING_ID`), /^[A-Za-z0-9_.:/-]+$/u, 'peering-id', 'Azure VNet peering', 'Set the connected VNet peering id or name.'),
    requiredTextCheck(envValue(env, `${prefix}_CUSTOMER_NETWORK_ID`), /^\/subscriptions\/.+\/virtualNetworks\/.+$/iu, 'customer-vnet', 'Customer VNet resource id', 'Set the customer virtual network resource id.'),
    requiredTextCheck(envValue(env, `${prefix}_GREYBOX_NETWORK_ID`), /^\/subscriptions\/.+\/virtualNetworks\/.+$/iu, 'greybox-vnet', 'Greybox VNet resource id', 'Set the Greybox virtual network resource id.'),
    booleanCheck(envValue(env, `${prefix}_CIDR_NON_OVERLAP`), 'cidr-non-overlap', 'Non-overlapping address spaces', 'Confirm the customer and Greybox virtual networks have non-overlapping address spaces.'),
    booleanCheck(envValue(env, `${prefix}_BIDIRECTIONAL_CONNECTED`), 'bidirectional-peering', 'Bidirectional peering connected', 'Create both peering directions and confirm status is Connected.'),
    booleanCheck(envValue(env, `${prefix}_NSG_RULES_SCOPED`), 'network-security-groups', 'Network security groups scoped', 'Restrict NSG rules to required ports and peer address ranges.'),
    optionalBooleanCheck(envValue(env, `${prefix}_PRIVATE_DNS_CONFIGURED`), 'private-dns', 'Private DNS configured', 'Configure Azure Private DNS or custom DNS when private hostnames are required.'),
    validatedAtCheck(envValue(env, `${prefix}_LAST_VALIDATED_AT`), 'reachability-validation', 'Reachability validation', 'Record a successful private-IP reachability test timestamp.'),
  ];
}

function normalizeProfile(input: unknown): PrivateNetworkProfile {
  const record = objectInput(input, 'bad_private_network_profile');
  const provider = cleanEnum(record.provider, providers, 'aws');
  const checks = Array.isArray(record.checks) && record.checks.length > 0
    ? record.checks.map(normalizeCheck)
    : [];
  return {
    id: cleanToken(record.id, `${provider}-private-network`),
    provider,
    customerName: cleanText(record.customerName, 'Enterprise customer', 120),
    region: cleanText(record.region, 'customer-selected', 80),
    status: cleanEnum(record.status, statuses, aggregateStatus(checks)),
    ...(typeof record.connectionId === 'string' ? { connectionId: record.connectionId.trim().slice(0, 160) } : {}),
    ...(typeof record.customerNetworkId === 'string' ? { customerNetworkId: record.customerNetworkId.trim().slice(0, 200) } : {}),
    ...(typeof record.greyboxNetworkId === 'string' ? { greyboxNetworkId: record.greyboxNetworkId.trim().slice(0, 200) } : {}),
    ...(typeof record.customerCidr === 'string' ? { customerCidr: record.customerCidr.trim().slice(0, 64) } : {}),
    ...(typeof record.greyboxCidr === 'string' ? { greyboxCidr: record.greyboxCidr.trim().slice(0, 64) } : {}),
    ...(typeof record.lastValidatedAt === 'string' && cleanDate(record.lastValidatedAt)
      ? { lastValidatedAt: cleanDate(record.lastValidatedAt) }
      : {}),
    checks,
  };
}

function normalizeCheck(input: unknown): PrivateNetworkCheck {
  const record = objectInput(input, 'bad_private_network_check');
  return {
    id: cleanToken(record.id, 'check'),
    label: cleanText(record.label, 'Network check', 120),
    status: cleanEnum(record.status, statuses, 'warn'),
    detail: cleanText(record.detail, 'Pending network evidence.', 260),
    ...(typeof record.remediation === 'string' ? { remediation: record.remediation.trim().slice(0, 260) } : {}),
  };
}

function idCheck(
  value: string | undefined,
  pattern: RegExp,
  id: string,
  label: string,
  remediation: string,
): PrivateNetworkCheck {
  if (!value) {
    return { id, label, status: 'warn', detail: 'Not configured.', remediation };
  }
  if (!pattern.test(value)) {
    return { id, label, status: 'fail', detail: 'Configured value does not match expected provider id shape.', remediation };
  }
  return { id, label, status: 'pass', detail: 'Configured.' };
}

function requiredTextCheck(
  value: string | undefined,
  pattern: RegExp,
  id: string,
  label: string,
  remediation: string,
): PrivateNetworkCheck {
  if (!value) return { id, label, status: 'warn', detail: 'Not configured.', remediation };
  if (!pattern.test(value)) return { id, label, status: 'fail', detail: 'Configured value does not match expected provider resource id shape.', remediation };
  return { id, label, status: 'pass', detail: 'Configured.' };
}

function booleanCheck(value: string | undefined, id: string, label: string, remediation: string): PrivateNetworkCheck {
  if (value?.trim().toLowerCase() === 'true') {
    return { id, label, status: 'pass', detail: 'Confirmed.' };
  }
  if (value?.trim().toLowerCase() === 'false') {
    return { id, label, status: 'fail', detail: 'Explicitly marked incomplete.', remediation };
  }
  return { id, label, status: 'warn', detail: 'Not confirmed.', remediation };
}

function optionalBooleanCheck(value: string | undefined, id: string, label: string, remediation: string): PrivateNetworkCheck {
  if (value?.trim().toLowerCase() === 'true') return { id, label, status: 'pass', detail: 'Confirmed.' };
  if (value?.trim().toLowerCase() === 'false') return { id, label, status: 'warn', detail: 'Not enabled for this profile.', remediation };
  return { id, label, status: 'warn', detail: 'Not declared.', remediation };
}

function validatedAtCheck(value: string | undefined, id: string, label: string, remediation: string): PrivateNetworkCheck {
  const validatedAt = cleanDate(value);
  if (validatedAt) return { id, label, status: 'pass', detail: `Validated at ${validatedAt}.` };
  return { id, label, status: 'warn', detail: 'No validation timestamp recorded.', remediation };
}

function aggregateStatus(checks: PrivateNetworkCheck[]): PrivateNetworkStatus {
  if (checks.length === 0) return 'warn';
  if (checks.some((check) => check.status === 'fail')) return 'fail';
  if (checks.some((check) => check.status === 'warn')) return 'warn';
  return 'pass';
}

function envValue(env: Record<string, string | undefined>, key: string): string | undefined {
  const value = env[key]?.trim();
  return value || undefined;
}

function objectInput(input: unknown, code: string): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new PrivateNetworkReadinessError(400, code);
  }
  return input as Record<string, unknown>;
}

function cleanEnum<T extends string>(value: unknown, allowed: Set<T>, fallback: T): T {
  return typeof value === 'string' && allowed.has(value as T) ? value as T : fallback;
}

function cleanToken(value: unknown, fallback: string): string {
  const text = typeof value === 'string' ? value.trim().toLowerCase() : fallback;
  const clean = text.replace(/[^a-z0-9:_-]+/gu, '-').replace(/^-+|-+$/gu, '').slice(0, 96);
  return clean || fallback;
}

function cleanText(value: unknown, fallback: string, maxLength: number): string {
  const text = typeof value === 'string' ? value.replace(/\s+/gu, ' ').trim() : '';
  return (text || fallback).slice(0, maxLength);
}

function cleanDate(value: unknown): string | undefined {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) return undefined;
  return new Date(value).toISOString();
}
