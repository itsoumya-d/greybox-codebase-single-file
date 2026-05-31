// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

export type ProcessingRole = 'controller' | 'processor' | 'joint-controller';
export type RopaLegalBasis =
  | 'consent'
  | 'contract'
  | 'legal-obligation'
  | 'legitimate-interests'
  | 'processor-instructions';
export type DpiaStatus = 'draft' | 'review-needed' | 'approved' | 'not-required';
export type DpiaRiskLevel = 'low' | 'medium' | 'high';

export interface GdprArticleReference {
  id: 'gdpr-article-30' | 'gdpr-article-35' | 'gdpr-article-37';
  article: string;
  label: string;
  url: string;
}

export interface RopaRecord {
  id: string;
  schemaVersion: 1;
  name: string;
  role: ProcessingRole;
  owner: string;
  purposes: string[];
  legalBases: RopaLegalBasis[];
  dataSubjects: string[];
  personalDataCategories: string[];
  specialCategoryDataCategories: string[];
  recipients: string[];
  subprocessorIds: string[];
  regions: string[];
  internationalTransfers: string[];
  retentionPolicy: string;
  securityMeasures: string[];
  systems: string[];
  lastReviewedAt: string;
}

export interface DpiaRisk {
  id: string;
  description: string;
  likelihood: DpiaRiskLevel;
  impact: DpiaRiskLevel;
  mitigation: string;
  residualRisk: DpiaRiskLevel;
}

export interface DpiaAssessment {
  id: string;
  schemaVersion: 1;
  processingActivityId: string;
  title: string;
  status: DpiaStatus;
  highRisk: boolean;
  residualRisk: DpiaRiskLevel;
  necessityAndProportionality: string;
  safeguards: string[];
  risks: DpiaRisk[];
  dpoConsulted: boolean;
  requiresPriorConsultation: boolean;
  reviewer?: string;
  reviewedAt?: string;
  nextReviewAt: string;
}

export interface DpoAppointment {
  appointed: boolean;
  name?: string;
  email?: string;
  region?: string;
  appointedAt?: string;
  supervisoryAuthorityNotified: boolean;
  publicationChannel: string;
  tasks: string[];
  note: string;
}

export interface PrivacyGovernanceReport {
  generatedAt: string;
  disclaimer: string;
  articleReferences: GdprArticleReference[];
  summary: {
    ropaRecordCount: number;
    dpiaAssessmentCount: number;
    highRiskDpiaCount: number;
    pendingDpiaCount: number;
    dpoAppointed: boolean;
  };
  ropaRecords: RopaRecord[];
  dpiaAssessments: DpiaAssessment[];
  dpo: DpoAppointment;
}

export interface PrivacyGovernanceOptions {
  env?: Record<string, string | undefined>;
  now?: Date;
  ropaRecords?: RopaRecord[];
  dpiaAssessments?: DpiaAssessment[];
  dpo?: DpoAppointment;
}

export class PrivacyGovernanceError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code);
    this.name = 'PrivacyGovernanceError';
  }
}

const defaultReviewedAt = '2026-05-17T00:00:00.000Z';
const eurLexGdprUrl = 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32016R0679';

export const gdprArticleReferences: GdprArticleReference[] = [
  {
    id: 'gdpr-article-30',
    article: 'Article 30',
    label: 'Records of processing activities',
    url: eurLexGdprUrl,
  },
  {
    id: 'gdpr-article-35',
    article: 'Article 35',
    label: 'Data protection impact assessment',
    url: eurLexGdprUrl,
  },
  {
    id: 'gdpr-article-37',
    article: 'Article 37',
    label: 'Designation of the data protection officer',
    url: eurLexGdprUrl,
  },
];

export const defaultRopaRecords: RopaRecord[] = [
  {
    id: 'managed-inference-routing',
    schemaVersion: 1,
    name: 'Managed inference routing and usage metering',
    role: 'processor',
    owner: 'AI Platform',
    purposes: ['AI-assisted game design responses', 'provider routing', 'usage metering', 'abuse prevention'],
    legalBases: ['processor-instructions', 'contract', 'legitimate-interests'],
    dataSubjects: ['customer designers', 'customer administrators', 'invited collaborators'],
    personalDataCategories: ['account identifiers', 'project prompts when enabled', 'usage metadata', 'redacted observability metadata'],
    specialCategoryDataCategories: [],
    recipients: ['configured model providers', 'Greybox operations staff under least privilege'],
    subprocessorIds: ['anthropic', 'openai', 'aws-bedrock', 'langfuse'],
    regions: ['us', 'eu', 'in', 'customer-selected'],
    internationalTransfers: ['same-region where configured', 'DPA/SCCs or customer provider choice for managed model egress'],
    retentionPolicy: 'Prompts and outputs are not stored in audit logs; usage records follow the billing/audit retention schedule.',
    securityMeasures: ['tenant isolation', 'PII redaction before observability', 'prompt-injection screening', 'hash-chained audit metadata'],
    systems: ['greybox-cloud', 'Langfuse bridge', 'billing ledger'],
    lastReviewedAt: defaultReviewedAt,
  },
  {
    id: 'enterprise-identity-scim',
    schemaVersion: 1,
    name: 'Enterprise SSO and SCIM provisioning',
    role: 'processor',
    owner: 'Security Engineering',
    purposes: ['authentication', 'authorization', 'tenant isolation', 'user provisioning and deactivation'],
    legalBases: ['processor-instructions', 'contract', 'legitimate-interests'],
    dataSubjects: ['customer users', 'customer administrators'],
    personalDataCategories: ['email', 'user id', 'organization membership', 'role and scope metadata', 'SCIM profile attributes'],
    specialCategoryDataCategories: [],
    recipients: ['customer identity provider', 'WorkOS when configured', 'Greybox security administrators'],
    subprocessorIds: ['workos'],
    regions: ['us', 'eu', 'customer-selected'],
    internationalTransfers: ['DPA/SCCs for WorkOS-managed identity metadata where applicable'],
    retentionPolicy: 'Active account metadata remains for the subscription term; deactivated user records follow account and audit retention.',
    securityMeasures: ['RS256 token verification', 'SCIM bearer-token isolation', 'least-privilege scopes', 'tenant-bound audit entries'],
    systems: ['greybox-cloud', 'SCIM store', 'tenant store'],
    lastReviewedAt: defaultReviewedAt,
  },
  {
    id: 'billing-metering-tax',
    schemaVersion: 1,
    name: 'Billing metering, invoices, and tax evidence',
    role: 'controller',
    owner: 'Revenue Systems',
    purposes: ['subscription billing', 'usage-based billing', 'tax compliance', 'revenue audit'],
    legalBases: ['contract', 'legal-obligation', 'legitimate-interests'],
    dataSubjects: ['customer billing contacts', 'customer administrators'],
    personalDataCategories: ['account identifiers', 'billing contact metadata', 'usage quantities', 'invoice and tax metadata'],
    specialCategoryDataCategories: [],
    recipients: ['Stripe', 'tax authorities where required', 'Greybox finance administrators'],
    subprocessorIds: ['stripe'],
    regions: ['us', 'eu', 'global'],
    internationalTransfers: ['Stripe DPA/SCCs where applicable'],
    retentionPolicy: 'Billing and tax records are retained according to finance and legal retention requirements.',
    securityMeasures: ['append-only billing ledger', 'dry-run meter reconciliation', 'admin-scoped invoice jobs', 'audit-log minimization'],
    systems: ['billing ledger', 'Stripe meter submitter', 'audit log'],
    lastReviewedAt: defaultReviewedAt,
  },
  {
    id: 'privacy-rights-operations',
    schemaVersion: 1,
    name: 'Privacy rights intake and fulfillment',
    role: 'controller',
    owner: 'Privacy Operations',
    purposes: ['data subject request intake', 'identity verification', 'fulfillment evidence', 'regulatory response support'],
    legalBases: ['legal-obligation', 'legitimate-interests'],
    dataSubjects: ['customer users', 'playtest participants supplied by customers', 'parents or guardians', 'authorized agents'],
    personalDataCategories: ['contact email', 'request details', 'jurisdiction', 'status timeline', 'fulfillment evidence'],
    specialCategoryDataCategories: [],
    recipients: ['Greybox privacy administrators', 'customer administrators where instructed', 'regulators where legally required'],
    subprocessorIds: [],
    regions: ['us', 'eu', 'in', 'tenant-selected'],
    internationalTransfers: ['same-region where configured'],
    retentionPolicy: 'Request evidence is retained as a privacy-compliance record and linked to retention exceptions.',
    securityMeasures: ['hashed requester tokens', 'admin-only update routes', 'fulfillment package minimization', 'legal-hold checks'],
    systems: ['privacy request store', 'privacy fulfillment package', 'legal hold store'],
    lastReviewedAt: defaultReviewedAt,
  },
  {
    id: 'product-analytics-opt-in',
    schemaVersion: 1,
    name: 'Opt-in product analytics and feature flags',
    role: 'controller',
    owner: 'Product Operations',
    purposes: ['activation analysis', 'retention analysis', 'feature flag rollout', 'weekly North Star reporting'],
    legalBases: ['consent', 'legitimate-interests'],
    dataSubjects: ['designers', 'workspace administrators'],
    personalDataCategories: ['pseudonymous user id', 'tenant id', 'aggregate feature usage', 'engine export counts'],
    specialCategoryDataCategories: [],
    recipients: ['PostHog when enabled', 'Greybox product administrators'],
    subprocessorIds: ['posthog'],
    regions: ['self-hosted', 'us', 'eu'],
    internationalTransfers: ['same-region or customer-configured analytics deployment'],
    retentionPolicy: 'Telemetry remains opt-in and aggregate; artifact content and designer names are excluded.',
    securityMeasures: ['telemetry preference gates', 'aggregate-only exports', 'artifact-content exclusion', 'feature-flag scoping'],
    systems: ['product analytics dashboards', 'PostHog export job'],
    lastReviewedAt: defaultReviewedAt,
  },
  {
    id: 'greybox-native-training-opt-in',
    schemaVersion: 1,
    name: 'Greybox Native model-training opt-in corpus',
    role: 'controller',
    owner: 'AI Platform',
    purposes: ['future small-model fine tuning', 'artifact quality improvement where explicitly opted in'],
    legalBases: ['consent'],
    dataSubjects: ['project creators', 'workspace collaborators whose artifacts are included by customer instruction'],
    personalDataCategories: ['opted-in project artifacts', 'artifact ratings', 'creator account identifiers', 'consent metadata'],
    specialCategoryDataCategories: [],
    recipients: ['Greybox AI Platform', 'Modal or Replicate when configured for training jobs'],
    subprocessorIds: ['modal', 'replicate'],
    regions: ['us', 'customer-selected'],
    internationalTransfers: ['customer-selected GPU provider DPA before launch'],
    retentionPolicy: 'No training use without separate explicit opt-in; revocation records are retained as compliance evidence.',
    securityMeasures: ['default opt-out', 'separate checkbox enforcement', 'consent-text hashing', 'project-scoped revocation lookup'],
    systems: ['model training consent store', 'Greybox Native training pipeline'],
    lastReviewedAt: defaultReviewedAt,
  },
  {
    id: 'agentic-playtest-loop',
    schemaVersion: 1,
    name: 'Agentic playtest loop and synthetic playtester reports',
    role: 'processor',
    owner: 'Playtest Platform',
    purposes: ['synthetic gameplay testing', 'bug report generation', 'balance suggestions', 'accepted tuner diffs'],
    legalBases: ['processor-instructions', 'contract', 'legitimate-interests'],
    dataSubjects: ['customer designers', 'playtest participants only when supplied by customer'],
    personalDataCategories: ['project metadata', 'synthetic playtest telemetry', 'optional customer-provided playtest feedback'],
    specialCategoryDataCategories: [],
    recipients: ['Greybox playtest workers', 'configured vision/model providers where enabled'],
    subprocessorIds: ['openai', 'anthropic', 'modal', 'replicate'],
    regions: ['us', 'eu', 'customer-selected'],
    internationalTransfers: ['customer provider selection and DPA/SCCs where applicable'],
    retentionPolicy: 'Synthetic reports follow project-artifact retention; user-study feedback follows customer instructions.',
    securityMeasures: ['bounded replay harness', 'report minimization', 'customer acceptance gate', 'tenant-scoped artifact access'],
    systems: ['greybox-playtest', 'playtest orchestration queue'],
    lastReviewedAt: defaultReviewedAt,
  },
];

export const defaultDpiaAssessments: DpiaAssessment[] = [
  {
    id: 'dpia-managed-inference',
    schemaVersion: 1,
    processingActivityId: 'managed-inference-routing',
    title: 'Managed inference routing DPIA',
    status: 'review-needed',
    highRisk: true,
    residualRisk: 'medium',
    necessityAndProportionality: 'Managed inference is optional, tier-gated, and limited to project tasks submitted by authenticated users.',
    safeguards: ['PII redaction', 'prompt-injection screening', 'provider failover without prompt persistence in audit logs', 'tenant-region labels'],
    risks: [
      {
        id: 'model-provider-exposure',
        description: 'Customer prompts may be routed to configured model providers.',
        likelihood: 'medium',
        impact: 'high',
        mitigation: 'BYOK remains available, provider choices are disclosed, and prompt content is excluded from audit logs.',
        residualRisk: 'medium',
      },
      {
        id: 'sensitive-content-in-prompts',
        description: 'Users may paste personal data or unreleased game IP into prompts.',
        likelihood: 'medium',
        impact: 'medium',
        mitigation: 'PII redaction protects logs and product copy forbids training without separate explicit opt-in.',
        residualRisk: 'medium',
      },
    ],
    dpoConsulted: false,
    requiresPriorConsultation: false,
    nextReviewAt: '2026-08-17T00:00:00.000Z',
  },
  {
    id: 'dpia-greybox-native-training',
    schemaVersion: 1,
    processingActivityId: 'greybox-native-training-opt-in',
    title: 'Greybox Native opt-in training DPIA',
    status: 'draft',
    highRisk: true,
    residualRisk: 'medium',
    necessityAndProportionality: 'Training is not enabled by default and requires a separate, project-scoped opt-in before any artifact enters the corpus.',
    safeguards: ['default opt-out', 'separate checkbox', 'revocation evidence', 'data-category allow list', 'subprocessor review before GPU jobs'],
    risks: [
      {
        id: 'consent-scope-drift',
        description: 'Training data could exceed the scope a creator intended.',
        likelihood: 'medium',
        impact: 'high',
        mitigation: 'Consent records are project-scoped and artifact-scoped when provided, with allowed-use labels and revocation tracking.',
        residualRisk: 'medium',
      },
    ],
    dpoConsulted: false,
    requiresPriorConsultation: false,
    nextReviewAt: '2026-08-17T00:00:00.000Z',
  },
  {
    id: 'dpia-agentic-playtest',
    schemaVersion: 1,
    processingActivityId: 'agentic-playtest-loop',
    title: 'Agentic playtest loop DPIA',
    status: 'review-needed',
    highRisk: false,
    residualRisk: 'low',
    necessityAndProportionality: 'Synthetic playtesting runs on customer artifacts to identify bugs and balance issues before human release.',
    safeguards: ['synthetic personas by default', 'customer acceptance gate for tuner diffs', 'tenant-scoped replay inputs', 'report minimization'],
    risks: [
      {
        id: 'user-study-feedback-overcollection',
        description: 'Future user studies may collect more feedback than necessary.',
        likelihood: 'low',
        impact: 'medium',
        mitigation: 'Default reports use synthetic personas; human-study fields must be customer-approved and minimized.',
        residualRisk: 'low',
      },
    ],
    dpoConsulted: false,
    requiresPriorConsultation: false,
    nextReviewAt: '2026-08-17T00:00:00.000Z',
  },
];

export function buildPrivacyGovernanceReport(options: PrivacyGovernanceOptions = {}): PrivacyGovernanceReport {
  const env = options.env ?? process.env;
  const override = privacyGovernanceFromEnv(env);
  const ropaRecords = (options.ropaRecords ?? override?.ropaRecords ?? defaultRopaRecords).map(normalizeRopaRecord);
  const dpiaAssessments = (options.dpiaAssessments ?? override?.dpiaAssessments ?? defaultDpiaAssessments)
    .map(normalizeDpiaAssessment);
  const dpo = normalizeDpoAppointment(options.dpo ?? override?.dpo ?? dpoAppointmentFromEnv(env));
  return {
    generatedAt: (options.now ?? new Date()).toISOString(),
    disclaimer: 'Privacy governance readiness evidence only. Counsel-approved policies, order forms, and regulator filings remain authoritative.',
    articleReferences: gdprArticleReferences,
    summary: {
      ropaRecordCount: ropaRecords.length,
      dpiaAssessmentCount: dpiaAssessments.length,
      highRiskDpiaCount: dpiaAssessments.filter((assessment) => assessment.highRisk).length,
      pendingDpiaCount: dpiaAssessments.filter((assessment) => assessment.status === 'draft' || assessment.status === 'review-needed').length,
      dpoAppointed: dpo.appointed,
    },
    ropaRecords,
    dpiaAssessments,
    dpo,
  };
}

export function privacyGovernanceFromEnv(env: Record<string, string | undefined>): PrivacyGovernanceOptions | undefined {
  const raw = env.GREYBOX_PRIVACY_GOVERNANCE_JSON;
  if (!raw?.trim()) return undefined;
  const parsed = parseJsonObject(raw, 'GREYBOX_PRIVACY_GOVERNANCE_JSON');
  return {
    ...(Array.isArray(parsed.ropaRecords) ? { ropaRecords: parsed.ropaRecords.map(normalizeRopaRecord) } : {}),
    ...(Array.isArray(parsed.dpiaAssessments) ? { dpiaAssessments: parsed.dpiaAssessments.map(normalizeDpiaAssessment) } : {}),
    ...(parsed.dpo && typeof parsed.dpo === 'object' && !Array.isArray(parsed.dpo)
      ? { dpo: normalizeDpoAppointment(parsed.dpo) }
      : {}),
  };
}

function dpoAppointmentFromEnv(env: Record<string, string | undefined>): DpoAppointment {
  const name = cleanOptionalText(env.GREYBOX_DPO_NAME, 120);
  const email = cleanOptionalEmail(env.GREYBOX_DPO_EMAIL);
  const appointedAt = cleanOptionalDate(env.GREYBOX_DPO_APPOINTED_AT);
  const region = cleanOptionalText(env.GREYBOX_DPO_REGION, 80);
  const supervisoryAuthorityNotified = env.GREYBOX_DPO_SUPERVISORY_AUTHORITY_NOTIFIED?.trim().toLowerCase() === 'true';
  const appointed = Boolean(name && email && appointedAt);
  return {
    appointed,
    ...(name ? { name } : {}),
    ...(email ? { email } : {}),
    ...(region ? { region } : {}),
    ...(appointedAt ? { appointedAt } : {}),
    supervisoryAuthorityNotified,
    publicationChannel: cleanOptionalText(env.GREYBOX_DPO_PUBLICATION_CHANNEL, 160)
      ?? 'Publish contact in privacy policy and enterprise trust packet before launch.',
    tasks: defaultDpoTasks,
    note: appointed
      ? 'DPO appointment evidence is configured for this deployment.'
      : 'No complete DPO appointment evidence is configured. Set GREYBOX_DPO_NAME, GREYBOX_DPO_EMAIL, and GREYBOX_DPO_APPOINTED_AT after counsel appoints the DPO.',
  };
}

const defaultDpoTasks = [
  'Inform and advise Greybox and relevant staff on data-protection obligations.',
  'Monitor privacy-control compliance, training, and audit readiness.',
  'Advise on DPIAs and monitor their performance.',
  'Cooperate with supervisory authorities.',
  'Act as contact point for supervisory authorities and data subjects.',
];

function normalizeRopaRecord(input: unknown): RopaRecord {
  const record = objectInput(input, 'bad_ropa_record');
  return {
    id: cleanToken(record.id, 'processing-activity'),
    schemaVersion: 1,
    name: cleanText(record.name, 'Processing activity', 160),
    role: cleanEnum(record.role, new Set<ProcessingRole>(['controller', 'processor', 'joint-controller']), 'processor'),
    owner: cleanText(record.owner, 'Privacy Operations', 120),
    purposes: cleanStringList(record.purposes, 160),
    legalBases: cleanEnumList(record.legalBases, new Set<RopaLegalBasis>([
      'consent',
      'contract',
      'legal-obligation',
      'legitimate-interests',
      'processor-instructions',
    ])),
    dataSubjects: cleanStringList(record.dataSubjects, 160),
    personalDataCategories: cleanStringList(record.personalDataCategories, 180),
    specialCategoryDataCategories: cleanStringList(record.specialCategoryDataCategories, 180, true),
    recipients: cleanStringList(record.recipients, 180),
    subprocessorIds: cleanStringList(record.subprocessorIds, 80, true),
    regions: cleanStringList(record.regions, 80),
    internationalTransfers: cleanStringList(record.internationalTransfers, 200),
    retentionPolicy: cleanText(record.retentionPolicy, 'See retention policy.', 360),
    securityMeasures: cleanStringList(record.securityMeasures, 180),
    systems: cleanStringList(record.systems, 120),
    lastReviewedAt: cleanDate(record.lastReviewedAt, defaultReviewedAt),
  };
}

function normalizeDpiaAssessment(input: unknown): DpiaAssessment {
  const record = objectInput(input, 'bad_dpia_assessment');
  return {
    id: cleanToken(record.id, 'dpia'),
    schemaVersion: 1,
    processingActivityId: cleanToken(record.processingActivityId, 'processing-activity'),
    title: cleanText(record.title, 'DPIA assessment', 180),
    status: cleanEnum(record.status, new Set<DpiaStatus>(['draft', 'review-needed', 'approved', 'not-required']), 'draft'),
    highRisk: record.highRisk === true,
    residualRisk: cleanEnum(record.residualRisk, riskLevels, 'medium'),
    necessityAndProportionality: cleanText(record.necessityAndProportionality, 'Pending counsel review.', 500),
    safeguards: cleanStringList(record.safeguards, 200),
    risks: cleanRiskList(record.risks),
    dpoConsulted: record.dpoConsulted === true,
    requiresPriorConsultation: record.requiresPriorConsultation === true,
    ...(typeof record.reviewer === 'string' ? { reviewer: cleanText(record.reviewer, 'Privacy Operations', 120) } : {}),
    ...(typeof record.reviewedAt === 'string' ? { reviewedAt: cleanDate(record.reviewedAt, defaultReviewedAt) } : {}),
    nextReviewAt: cleanDate(record.nextReviewAt, '2026-08-17T00:00:00.000Z'),
  };
}

function normalizeDpoAppointment(input: unknown): DpoAppointment {
  const record = objectInput(input, 'bad_dpo_appointment');
  const name = cleanOptionalText(record.name, 120);
  const email = cleanOptionalEmail(record.email);
  const appointedAt = cleanOptionalDate(record.appointedAt);
  const appointed = record.appointed === true && Boolean(name && email && appointedAt);
  return {
    appointed,
    ...(name ? { name } : {}),
    ...(email ? { email } : {}),
    ...(cleanOptionalText(record.region, 80) ? { region: cleanOptionalText(record.region, 80) } : {}),
    ...(appointedAt ? { appointedAt } : {}),
    supervisoryAuthorityNotified: record.supervisoryAuthorityNotified === true,
    publicationChannel: cleanText(record.publicationChannel, 'Publish contact in privacy policy and enterprise trust packet before launch.', 200),
    tasks: cleanStringList(record.tasks, 180, true).length > 0 ? cleanStringList(record.tasks, 180, true) : defaultDpoTasks,
    note: cleanText(
      record.note,
      appointed
        ? 'DPO appointment evidence is configured for this deployment.'
        : 'No complete DPO appointment evidence is configured.',
      300,
    ),
  };
}

const riskLevels = new Set<DpiaRiskLevel>(['low', 'medium', 'high']);

function cleanRiskList(value: unknown): DpiaRisk[] {
  const raw = Array.isArray(value) ? value : [];
  return raw
    .map((item, index) => {
      const record = objectInput(item, 'bad_dpia_risk');
      return {
        id: cleanToken(record.id, `risk-${index + 1}`),
        description: cleanText(record.description, 'Risk pending description.', 260),
        likelihood: cleanEnum(record.likelihood, riskLevels, 'medium'),
        impact: cleanEnum(record.impact, riskLevels, 'medium'),
        mitigation: cleanText(record.mitigation, 'Mitigation pending counsel review.', 360),
        residualRisk: cleanEnum(record.residualRisk, riskLevels, 'medium'),
      };
    });
}

function parseJsonObject(raw: string, name: string): Record<string, unknown> {
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new PrivacyGovernanceError(400, `${name}_must_be_object`);
  }
  return parsed as Record<string, unknown>;
}

function objectInput(input: unknown, code: string): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new PrivacyGovernanceError(400, code);
  }
  return input as Record<string, unknown>;
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

function cleanOptionalText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.replace(/\s+/gu, ' ').trim();
  return text ? text.slice(0, maxLength) : undefined;
}

function cleanStringList(value: unknown, maxLength: number, allowEmpty = false): string[] {
  const source = Array.isArray(value) ? value : [];
  const clean = source
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.replace(/\s+/gu, ' ').trim().slice(0, maxLength))
    .filter(Boolean);
  if (clean.length > 0 || allowEmpty) return [...new Set(clean)];
  return ['Pending counsel review.'];
}

function cleanEnum<T extends string>(value: unknown, allowed: Set<T>, fallback: T): T {
  return typeof value === 'string' && allowed.has(value as T) ? value as T : fallback;
}

function cleanEnumList<T extends string>(value: unknown, allowed: Set<T>): T[] {
  const clean = Array.isArray(value)
    ? value.filter((item): item is T => typeof item === 'string' && allowed.has(item as T))
    : [];
  return clean.length > 0 ? [...new Set(clean)] : [...allowed].slice(0, 1);
}

function cleanDate(value: unknown, fallback: string): string {
  if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) {
    return new Date(value).toISOString();
  }
  return fallback;
}

function cleanOptionalDate(value: unknown): string | undefined {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) return undefined;
  return new Date(value).toISOString();
}

function cleanOptionalEmail(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(text) ? text.slice(0, 160) : undefined;
}
