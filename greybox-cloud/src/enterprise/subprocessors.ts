// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

export type SubprocessorStatus = 'active' | 'planned' | 'deprecated';
export type SubprocessorPurpose =
  | 'hosting'
  | 'authentication'
  | 'billing'
  | 'managed-inference'
  | 'observability'
  | 'analytics'
  | 'support'
  | 'playtesting';
export type TransferMechanism =
  | 'same-region'
  | 'sccs'
  | 'uk-idta'
  | 'dpa'
  | 'customer-configured'
  | 'not-applicable';

export interface SubprocessorRecord {
  id: string;
  name: string;
  status: SubprocessorStatus;
  purposes: SubprocessorPurpose[];
  dataCategories: string[];
  regions: string[];
  transferMechanisms: TransferMechanism[];
  usedForPlans: Array<'free' | 'indie' | 'studio' | 'enterprise' | 'on-prem'>;
  customerConfigurable: boolean;
  effectiveAt: string;
  lastReviewedAt: string;
  privacyUrl?: string;
  notes?: string;
}

export interface SubprocessorRegistry {
  generatedAt: string;
  noticePeriodDays: number;
  disclaimer: string;
  records: SubprocessorRecord[];
}

export interface SubprocessorFilter {
  status?: SubprocessorStatus;
  purpose?: SubprocessorPurpose;
  region?: string;
}

const statuses = new Set<SubprocessorStatus>(['active', 'planned', 'deprecated']);
const purposes = new Set<SubprocessorPurpose>([
  'hosting',
  'authentication',
  'billing',
  'managed-inference',
  'observability',
  'analytics',
  'support',
  'playtesting',
]);
const transferMechanisms = new Set<TransferMechanism>([
  'same-region',
  'sccs',
  'uk-idta',
  'dpa',
  'customer-configured',
  'not-applicable',
]);
const planScopes = new Set<SubprocessorRecord['usedForPlans'][number]>([
  'free',
  'indie',
  'studio',
  'enterprise',
  'on-prem',
]);

const defaultReviewedAt = '2026-05-17T00:00:00.000Z';

export const defaultSubprocessors: SubprocessorRecord[] = [
  {
    id: 'aws-bedrock',
    name: 'Amazon Web Services / Bedrock',
    status: 'planned',
    purposes: ['hosting', 'managed-inference'],
    dataCategories: ['account metadata', 'project prompts when enabled', 'usage metadata'],
    regions: ['us', 'eu', 'in', 'customer-selected'],
    transferMechanisms: ['same-region', 'dpa', 'customer-configured'],
    usedForPlans: ['studio', 'enterprise', 'on-prem'],
    customerConfigurable: true,
    effectiveAt: defaultReviewedAt,
    lastReviewedAt: defaultReviewedAt,
    privacyUrl: 'https://aws.amazon.com/privacy/',
    notes: 'Customer region and provider policy decide whether Bedrock is used.',
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    status: 'planned',
    purposes: ['managed-inference'],
    dataCategories: ['project prompts when enabled', 'usage metadata'],
    regions: ['us', 'customer-selected'],
    transferMechanisms: ['dpa', 'customer-configured'],
    usedForPlans: ['indie', 'studio', 'enterprise'],
    customerConfigurable: true,
    effectiveAt: defaultReviewedAt,
    lastReviewedAt: defaultReviewedAt,
    privacyUrl: 'https://www.anthropic.com/privacy',
    notes: 'Managed inference routes here only when selected by tier, project, or failover policy.',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    status: 'planned',
    purposes: ['managed-inference'],
    dataCategories: ['project prompts when enabled', 'usage metadata'],
    regions: ['us', 'customer-selected'],
    transferMechanisms: ['dpa', 'customer-configured'],
    usedForPlans: ['indie', 'studio', 'enterprise'],
    customerConfigurable: true,
    effectiveAt: defaultReviewedAt,
    lastReviewedAt: defaultReviewedAt,
    privacyUrl: 'https://openai.com/policies/privacy-policy',
    notes: 'Managed inference routes here for low-cost chat, fallback, or customer-selected models.',
  },
  {
    id: 'stripe',
    name: 'Stripe',
    status: 'planned',
    purposes: ['billing'],
    dataCategories: ['account identifiers', 'billing metadata', 'tax metadata', 'payment events'],
    regions: ['us', 'eu', 'global'],
    transferMechanisms: ['dpa', 'sccs'],
    usedForPlans: ['indie', 'studio', 'enterprise'],
    customerConfigurable: false,
    effectiveAt: defaultReviewedAt,
    lastReviewedAt: defaultReviewedAt,
    privacyUrl: 'https://stripe.com/privacy',
    notes: 'Billing ledger and meter submissions are dry-run first until Stripe credentials are configured.',
  },
  {
    id: 'workos',
    name: 'WorkOS',
    status: 'planned',
    purposes: ['authentication'],
    dataCategories: ['account identifiers', 'organization membership', 'SSO and SCIM metadata'],
    regions: ['us', 'eu', 'global'],
    transferMechanisms: ['dpa', 'sccs'],
    usedForPlans: ['studio', 'enterprise'],
    customerConfigurable: false,
    effectiveAt: defaultReviewedAt,
    lastReviewedAt: defaultReviewedAt,
    privacyUrl: 'https://workos.com/privacy',
    notes: 'Used for enterprise SSO, SCIM, and organization-to-tenant isolation when configured.',
  },
  {
    id: 'langfuse',
    name: 'Langfuse',
    status: 'planned',
    purposes: ['observability'],
    dataCategories: ['redacted inference metadata', 'usage metadata', 'trace identifiers'],
    regions: ['us', 'eu', 'self-hosted'],
    transferMechanisms: ['dpa', 'same-region', 'customer-configured'],
    usedForPlans: ['studio', 'enterprise', 'on-prem'],
    customerConfigurable: true,
    effectiveAt: defaultReviewedAt,
    lastReviewedAt: defaultReviewedAt,
    privacyUrl: 'https://langfuse.com/privacy',
    notes: 'PII redaction and audit minimization run before observability emission.',
  },
  {
    id: 'posthog',
    name: 'PostHog',
    status: 'planned',
    purposes: ['analytics'],
    dataCategories: ['aggregate product analytics', 'feature flag metadata'],
    regions: ['self-hosted', 'us', 'eu'],
    transferMechanisms: ['same-region', 'dpa', 'customer-configured'],
    usedForPlans: ['free', 'indie', 'studio', 'enterprise'],
    customerConfigurable: true,
    effectiveAt: defaultReviewedAt,
    lastReviewedAt: defaultReviewedAt,
    privacyUrl: 'https://posthog.com/privacy',
    notes: 'Telemetry remains opt-in and aggregate-only for product analytics.',
  },
  {
    id: 'fly-io',
    name: 'Fly.io',
    status: 'planned',
    purposes: ['hosting'],
    dataCategories: ['account metadata', 'runtime logs with PII redaction', 'usage metadata'],
    regions: ['us', 'eu', 'in'],
    transferMechanisms: ['same-region', 'dpa'],
    usedForPlans: ['free', 'indie', 'studio', 'enterprise'],
    customerConfigurable: false,
    effectiveAt: defaultReviewedAt,
    lastReviewedAt: defaultReviewedAt,
    privacyUrl: 'https://fly.io/legal/privacy-policy/',
    notes: 'Deployment target may be replaced by AWS for enterprise region requirements.',
  },
  {
    id: 'modal',
    name: 'Modal',
    status: 'planned',
    purposes: ['managed-inference', 'playtesting'],
    dataCategories: ['opted-in training artifacts', 'synthetic playtest telemetry', 'usage metadata'],
    regions: ['us', 'customer-selected'],
    transferMechanisms: ['dpa', 'customer-configured'],
    usedForPlans: ['studio', 'enterprise'],
    customerConfigurable: true,
    effectiveAt: defaultReviewedAt,
    lastReviewedAt: defaultReviewedAt,
    privacyUrl: 'https://modal.com/privacy',
    notes: 'Only eligible for Greybox Native jobs with separate explicit model-training consent.',
  },
  {
    id: 'replicate',
    name: 'Replicate',
    status: 'planned',
    purposes: ['managed-inference', 'playtesting'],
    dataCategories: ['opted-in training artifacts', 'synthetic playtest media', 'usage metadata'],
    regions: ['us', 'customer-selected'],
    transferMechanisms: ['dpa', 'customer-configured'],
    usedForPlans: ['studio', 'enterprise'],
    customerConfigurable: true,
    effectiveAt: defaultReviewedAt,
    lastReviewedAt: defaultReviewedAt,
    privacyUrl: 'https://replicate.com/privacy',
    notes: 'Optional GPU provider for Greybox Native and vision playtest workloads.',
  },
];

export function buildSubprocessorRegistry(options: {
  env?: Record<string, string | undefined>;
  now?: Date;
  records?: SubprocessorRecord[];
  filter?: SubprocessorFilter;
} = {}): SubprocessorRegistry {
  const records = options.records
    ?? subprocessorsFromEnv(options.env ?? process.env)
    ?? defaultSubprocessors;
  return {
    generatedAt: (options.now ?? new Date()).toISOString(),
    noticePeriodDays: 30,
    disclaimer: 'Subprocessor readiness evidence only. Production order forms and counsel-approved DPAs remain authoritative.',
    records: filterSubprocessors(records.map(normalizeSubprocessorRecord), options.filter ?? {}),
  };
}

export function subprocessorsFromEnv(env: Record<string, string | undefined>): SubprocessorRecord[] | undefined {
  const raw = env.GREYBOX_SUBPROCESSORS_JSON;
  if (!raw?.trim()) return undefined;
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) throw new Error('GREYBOX_SUBPROCESSORS_JSON must be a JSON array');
  return parsed.map(normalizeSubprocessorRecord);
}

function filterSubprocessors(records: SubprocessorRecord[], filter: SubprocessorFilter): SubprocessorRecord[] {
  const status = filter.status && statuses.has(filter.status) ? filter.status : undefined;
  const purpose = filter.purpose && purposes.has(filter.purpose) ? filter.purpose : undefined;
  const region = filter.region?.trim().toLowerCase();
  return records
    .filter((record) => !status || record.status === status)
    .filter((record) => !purpose || record.purposes.includes(purpose))
    .filter((record) => !region || record.regions.some((item) => item.toLowerCase() === region))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function normalizeSubprocessorRecord(input: unknown): SubprocessorRecord {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('bad_subprocessor_record');
  }
  const record = input as Record<string, unknown>;
  return {
    id: cleanToken(record.id, 'id'),
    name: cleanText(record.name, 'name', 120),
    status: cleanEnum(record.status, statuses, 'planned'),
    purposes: cleanEnumList(record.purposes, purposes),
    dataCategories: cleanStringList(record.dataCategories, 120),
    regions: cleanStringList(record.regions, 60),
    transferMechanisms: cleanEnumList(record.transferMechanisms, transferMechanisms),
    usedForPlans: cleanEnumList(record.usedForPlans, planScopes),
    customerConfigurable: record.customerConfigurable === true,
    effectiveAt: cleanDate(record.effectiveAt, defaultReviewedAt),
    lastReviewedAt: cleanDate(record.lastReviewedAt, defaultReviewedAt),
    ...(typeof record.privacyUrl === 'string' ? { privacyUrl: cleanUrl(record.privacyUrl) } : {}),
    ...(typeof record.notes === 'string' ? { notes: cleanText(record.notes, 'notes', 400) } : {}),
  };
}

function cleanEnum<T extends string>(value: unknown, allowed: Set<T>, fallback: T): T {
  if (typeof value === 'string' && allowed.has(value.trim().toLowerCase() as T)) {
    return value.trim().toLowerCase() as T;
  }
  return fallback;
}

function cleanEnumList<T extends string>(value: unknown, allowed: Set<T>): T[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim().toLowerCase())
    .filter((item): item is T => allowed.has(item as T)))];
}

function cleanStringList(value: unknown, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.replace(/\s+/gu, ' ').trim().slice(0, maxLength))
    .filter(Boolean))];
}

function cleanToken(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new Error(`${field}_required`);
  const clean = value.trim().toLowerCase();
  if (!/^[a-z0-9._-]{1,80}$/u.test(clean)) throw new Error(`${field}_invalid`);
  return clean;
}

function cleanText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string') throw new Error(`${field}_required`);
  const clean = value.replace(/\s+/gu, ' ').trim().slice(0, maxLength);
  if (!clean) throw new Error(`${field}_required`);
  return clean;
}

function cleanDate(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
}

function cleanUrl(value: string): string {
  try {
    const url = new URL(value);
    return url.toString();
  } catch {
    return 'https://greybox.studio/legal/subprocessors';
  }
}
