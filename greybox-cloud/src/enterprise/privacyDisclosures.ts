// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

export type PrivacyDisclosureJurisdiction = 'ccpa-cpra' | 'coppa' | 'india-dpdpa';
export type PrivacyDisclosureStatus = 'ready' | 'needs-counsel' | 'not-applicable';

export interface PrivacyDisclosureSource {
  id: string;
  label: string;
  url: string;
}

export interface PrivacyDisclosureRequirement {
  id: string;
  label: string;
  sourceIds: string[];
  status: PrivacyDisclosureStatus;
  implementation: string;
}

export interface PrivacyDisclosure {
  id: string;
  jurisdiction: PrivacyDisclosureJurisdiction;
  label: string;
  audience: string;
  routeHint: string;
  status: PrivacyDisclosureStatus;
  owner: string;
  lastReviewedAt: string;
  requirements: PrivacyDisclosureRequirement[];
}

export interface PrivacyDisclosureReport {
  generatedAt: string;
  disclaimer: string;
  policySettings: PrivacyPolicySettings;
  sources: PrivacyDisclosureSource[];
  summary: {
    disclosures: number;
    ready: number;
    needsCounsel: number;
    notApplicable: number;
  };
  disclosures: PrivacyDisclosure[];
}

export interface PrivacyPolicySettings {
  companyName: string;
  privacyPolicyUrl: string;
  privacyContactEmail: string;
  rightsRequestUrl: string;
  childrenPrivacyContactEmail: string;
  grievanceEmail: string;
  sellsOrSharesPersonalInformation: boolean;
  usesSensitivePersonalInformationForLimitablePurposes: boolean;
  serviceDirectedToChildren: boolean;
  collectsChildPersonalInformation: boolean;
  supportsSchoolUse: boolean;
  lastUpdatedAt: string;
}

export interface PrivacyDisclosureOptions {
  env?: Record<string, string | undefined>;
  now?: Date;
  disclosures?: PrivacyDisclosure[];
  filter?: {
    jurisdiction?: PrivacyDisclosureJurisdiction;
  };
}

export class PrivacyDisclosureError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code);
    this.name = 'PrivacyDisclosureError';
  }
}

const defaultReviewedAt = '2026-05-17T00:00:00.000Z';

const jurisdictions = new Set<PrivacyDisclosureJurisdiction>(['ccpa-cpra', 'coppa', 'india-dpdpa']);
const statuses = new Set<PrivacyDisclosureStatus>(['ready', 'needs-counsel', 'not-applicable']);

export const privacyDisclosureSources: PrivacyDisclosureSource[] = [
  {
    id: 'ca-oag-ccpa-required-notices',
    label: 'California Attorney General CCPA required notices',
    url: 'https://oag.ca.gov/privacy/ccpa',
  },
  {
    id: 'cppa-ccpa-regulations-2026',
    label: 'California Privacy Protection Agency CCPA regulations effective January 1, 2026',
    url: 'https://cppa.ca.gov/regulations/',
  },
  {
    id: 'ftc-coppa-faq',
    label: 'FTC COPPA compliance FAQ',
    url: 'https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions',
  },
  {
    id: 'meity-dpdpa-2023',
    label: 'India Digital Personal Data Protection Act, 2023',
    url: 'https://www.meity.gov.in/static/uploads/2024/02/Digital-Personal-Data-Protection-Act-2023.pdf',
  },
];

export function buildPrivacyDisclosureReport(options: PrivacyDisclosureOptions = {}): PrivacyDisclosureReport {
  const env = options.env ?? process.env;
  const now = options.now ?? new Date();
  const settings = privacyPolicySettingsFromEnv(env, now);
  const override = privacyDisclosuresFromEnv(env);
  const disclosures = (options.disclosures ?? override ?? defaultPrivacyDisclosures(settings))
    .map(normalizeDisclosure)
    .filter((disclosure) => !options.filter?.jurisdiction || disclosure.jurisdiction === options.filter.jurisdiction);
  return {
    generatedAt: now.toISOString(),
    disclaimer: 'Privacy disclosure readiness evidence only. Counsel-approved public privacy policy, notices, and local law remain authoritative.',
    policySettings: settings,
    sources: privacyDisclosureSources,
    summary: {
      disclosures: disclosures.length,
      ready: disclosures.filter((disclosure) => disclosure.status === 'ready').length,
      needsCounsel: disclosures.filter((disclosure) => disclosure.status === 'needs-counsel').length,
      notApplicable: disclosures.filter((disclosure) => disclosure.status === 'not-applicable').length,
    },
    disclosures,
  };
}

export function privacyDisclosuresFromEnv(env: Record<string, string | undefined>): PrivacyDisclosure[] | undefined {
  const raw = env.GREYBOX_PRIVACY_DISCLOSURES_JSON;
  if (!raw?.trim()) return undefined;
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new PrivacyDisclosureError(400, 'GREYBOX_PRIVACY_DISCLOSURES_JSON_must_be_array');
  }
  return parsed.map(normalizeDisclosure);
}

export function privacyPolicySettingsFromEnv(
  env: Record<string, string | undefined>,
  now = new Date(),
): PrivacyPolicySettings {
  const privacyContactEmail = cleanEmail(env.GREYBOX_PRIVACY_CONTACT_EMAIL, 'privacy@greybox.studio');
  return {
    companyName: cleanText(env.GREYBOX_LEGAL_NAME, 'Greybox Studio', 120),
    privacyPolicyUrl: cleanUrl(env.GREYBOX_PRIVACY_POLICY_URL, 'https://greybox.studio/privacy'),
    privacyContactEmail,
    rightsRequestUrl: cleanUrl(env.GREYBOX_PRIVACY_RIGHTS_URL, 'https://cloud.greybox.studio/v1/privacy/requests'),
    childrenPrivacyContactEmail: cleanEmail(env.GREYBOX_CHILDREN_PRIVACY_CONTACT_EMAIL, privacyContactEmail),
    grievanceEmail: cleanEmail(env.GREYBOX_GRIEVANCE_EMAIL, privacyContactEmail),
    sellsOrSharesPersonalInformation: envFlag(env.GREYBOX_CCPA_SELLS_OR_SHARES_PERSONAL_INFORMATION),
    usesSensitivePersonalInformationForLimitablePurposes: envFlag(env.GREYBOX_CCPA_LIMITABLE_SENSITIVE_PI),
    serviceDirectedToChildren: envFlag(env.GREYBOX_SERVICE_DIRECTED_TO_CHILDREN),
    collectsChildPersonalInformation: envFlag(env.GREYBOX_COLLECTS_CHILD_PERSONAL_INFORMATION),
    supportsSchoolUse: envFlag(env.GREYBOX_SUPPORTS_SCHOOL_USE),
    lastUpdatedAt: cleanDate(env.GREYBOX_PRIVACY_POLICY_LAST_UPDATED_AT, now.toISOString()),
  };
}

function defaultPrivacyDisclosures(settings: PrivacyPolicySettings): PrivacyDisclosure[] {
  return [
    {
      id: 'california-required-notices',
      jurisdiction: 'ccpa-cpra',
      label: 'California CCPA/CPRA required notices',
      audience: 'California consumers, customer administrators, and authorized agents',
      routeHint: '/privacy#california',
      status: 'needs-counsel',
      owner: 'Privacy Operations',
      lastReviewedAt: defaultReviewedAt,
      requirements: [
        {
          id: 'notice-at-collection',
          label: 'Notice at collection',
          sourceIds: ['ca-oag-ccpa-required-notices', 'cppa-ccpa-regulations-2026'],
          status: 'needs-counsel',
          implementation: 'Policy must list personal-information categories, purposes, sale/share status, retention period or criteria, and link directly at collection points.',
        },
        {
          id: 'privacy-policy-rights',
          label: 'Privacy policy and rights instructions',
          sourceIds: ['ca-oag-ccpa-required-notices', 'cppa-ccpa-regulations-2026'],
          status: 'needs-counsel',
          implementation: `Policy must explain know/access, delete, correct, opt-out, limit, non-discrimination, authorized-agent, verification, and contact flows. Rights intake defaults to ${settings.rightsRequestUrl}.`,
        },
        {
          id: 'do-not-sell-share',
          label: 'Do Not Sell or Share notice',
          sourceIds: ['ca-oag-ccpa-required-notices', 'cppa-ccpa-regulations-2026'],
          status: settings.sellsOrSharesPersonalInformation ? 'needs-counsel' : 'not-applicable',
          implementation: settings.sellsOrSharesPersonalInformation
            ? 'A conspicuous opt-out link and interactive request flow are required before sale/share launches.'
            : 'Greybox default policy states it does not sell or share personal information for cross-context behavioral advertising.',
        },
        {
          id: 'sensitive-pi-limit',
          label: 'Limit sensitive personal information notice',
          sourceIds: ['ca-oag-ccpa-required-notices', 'cppa-ccpa-regulations-2026'],
          status: settings.usesSensitivePersonalInformationForLimitablePurposes ? 'needs-counsel' : 'not-applicable',
          implementation: settings.usesSensitivePersonalInformationForLimitablePurposes
            ? 'A limit-use notice and request flow are required before limitable sensitive personal information use launches.'
            : 'Greybox default policy does not use sensitive personal information for limitable secondary purposes.',
        },
      ],
    },
    {
      id: 'coppa-parent-notice-consent',
      jurisdiction: 'coppa',
      label: 'COPPA parent notice and consent',
      audience: 'Parents, guardians, schools, and operators of child-directed deployments',
      routeHint: '/privacy#children',
      status: settings.serviceDirectedToChildren || settings.collectsChildPersonalInformation ? 'needs-counsel' : 'ready',
      owner: 'Privacy Operations',
      lastReviewedAt: defaultReviewedAt,
      requirements: [
        {
          id: 'children-privacy-policy',
          label: 'Children privacy policy section',
          sourceIds: ['ftc-coppa-faq'],
          status: 'ready',
          implementation: `Children privacy contact defaults to ${settings.childrenPrivacyContactEmail}; child-data collection stays disabled unless a customer deploys a child-directed flow.`,
        },
        {
          id: 'direct-parent-notice',
          label: 'Direct notice to parents',
          sourceIds: ['ftc-coppa-faq'],
          status: settings.collectsChildPersonalInformation ? 'needs-counsel' : 'not-applicable',
          implementation: settings.collectsChildPersonalInformation
            ? 'Before collecting child personal information, send direct notice describing collection, use, disclosure, consent method, privacy policy, and deletion if consent is not provided.'
            : 'No child personal information collection is enabled by default.',
        },
        {
          id: 'verifiable-parental-consent',
          label: 'Verifiable parental consent',
          sourceIds: ['ftc-coppa-faq'],
          status: settings.collectsChildPersonalInformation ? 'needs-counsel' : 'not-applicable',
          implementation: settings.collectsChildPersonalInformation
            ? 'Use a verifiable consent method reasonably designed to ensure the consenting person is the parent or guardian.'
            : 'Consent workflow remains dormant unless child personal information collection is enabled.',
        },
        {
          id: 'school-authorization',
          label: 'School authorization boundary',
          sourceIds: ['ftc-coppa-faq'],
          status: settings.supportsSchoolUse ? 'needs-counsel' : 'not-applicable',
          implementation: settings.supportsSchoolUse
            ? 'School consent may be used only for educational context and no other commercial purpose; schools receive parent-equivalent direct notice and review/delete paths.'
            : 'School authorization is not enabled in default commercial deployments.',
        },
      ],
    },
    {
      id: 'india-dpdpa-notice-rights',
      jurisdiction: 'india-dpdpa',
      label: 'India DPDPA notice, rights, and child safeguards',
      audience: 'Data Principals in India, parents or lawful guardians, and enterprise administrators',
      routeHint: '/privacy#india',
      status: 'needs-counsel',
      owner: 'Privacy Operations',
      lastReviewedAt: defaultReviewedAt,
      requirements: [
        {
          id: 'dpdpa-notice-and-language',
          label: 'Notice and language access',
          sourceIds: ['meity-dpdpa-2023'],
          status: 'needs-counsel',
          implementation: 'Notice must describe personal data, purposes, rights, complaint path, and access in English or an Eighth Schedule language where required.',
        },
        {
          id: 'dpdpa-contact-and-grievance',
          label: 'Contact and grievance redressal',
          sourceIds: ['meity-dpdpa-2023'],
          status: 'needs-counsel',
          implementation: `Publish DPO or authorized contact plus grievance email. Current configured contact: ${settings.grievanceEmail}.`,
        },
        {
          id: 'dpdpa-consent-withdrawal-erasure',
          label: 'Consent withdrawal and erasure',
          sourceIds: ['meity-dpdpa-2023'],
          status: 'ready',
          implementation: 'Privacy request and retention workflows support consent withdrawal, correction, erasure, retention exceptions, and processor deletion evidence.',
        },
        {
          id: 'dpdpa-child-guardrails',
          label: 'Child and guardian safeguards',
          sourceIds: ['meity-dpdpa-2023'],
          status: settings.collectsChildPersonalInformation ? 'needs-counsel' : 'ready',
          implementation: settings.collectsChildPersonalInformation
            ? 'Verifiable parent or lawful guardian consent is required; targeted advertising, behavioral monitoring, and harmful child processing are disallowed.'
            : 'Child collection is disabled by default; policy forbids child tracking, behavioral monitoring, and targeted advertising.',
        },
      ],
    },
  ];
}

function normalizeDisclosure(input: unknown): PrivacyDisclosure {
  const record = objectInput(input, 'bad_privacy_disclosure');
  const requirements = Array.isArray(record.requirements)
    ? record.requirements.map(normalizeRequirement)
    : [];
  const status = cleanEnum(record.status, statuses, aggregateRequirementStatus(requirements));
  return {
    id: cleanToken(record.id, 'privacy-disclosure'),
    jurisdiction: cleanEnum(record.jurisdiction, jurisdictions, 'ccpa-cpra'),
    label: cleanText(record.label, 'Privacy disclosure', 160),
    audience: cleanText(record.audience, 'Customers and users', 180),
    routeHint: cleanText(record.routeHint, '/privacy', 120),
    status,
    owner: cleanText(record.owner, 'Privacy Operations', 120),
    lastReviewedAt: cleanDate(record.lastReviewedAt, defaultReviewedAt),
    requirements,
  };
}

function normalizeRequirement(input: unknown): PrivacyDisclosureRequirement {
  const record = objectInput(input, 'bad_privacy_disclosure_requirement');
  return {
    id: cleanToken(record.id, 'requirement'),
    label: cleanText(record.label, 'Disclosure requirement', 180),
    sourceIds: cleanStringList(record.sourceIds, 100),
    status: cleanEnum(record.status, statuses, 'needs-counsel'),
    implementation: cleanText(record.implementation, 'Pending counsel review.', 500),
  };
}

function aggregateRequirementStatus(requirements: PrivacyDisclosureRequirement[]): PrivacyDisclosureStatus {
  if (requirements.length === 0) return 'needs-counsel';
  if (requirements.some((requirement) => requirement.status === 'needs-counsel')) return 'needs-counsel';
  if (requirements.every((requirement) => requirement.status === 'not-applicable')) return 'not-applicable';
  return 'ready';
}

function objectInput(input: unknown, code: string): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new PrivacyDisclosureError(400, code);
  }
  return input as Record<string, unknown>;
}

function envFlag(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === 'true';
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

function cleanStringList(value: unknown, maxLength: number): string[] {
  const clean = Array.isArray(value)
    ? value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.replace(/\s+/gu, ' ').trim().slice(0, maxLength))
      .filter(Boolean)
    : [];
  return clean.length > 0 ? [...new Set(clean)] : [];
}

function cleanEnum<T extends string>(value: unknown, allowed: Set<T>, fallback: T): T {
  return typeof value === 'string' && allowed.has(value as T) ? value as T : fallback;
}

function cleanDate(value: unknown, fallback: string): string {
  if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) {
    return new Date(value).toISOString();
  }
  return fallback;
}

function cleanEmail(value: unknown, fallback: string): string {
  const text = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(text) ? text.slice(0, 160) : fallback;
}

function cleanUrl(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol === 'https:') return parsed.toString();
  } catch {
    return fallback;
  }
  return fallback;
}
