// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

export type CodingAgentPartner = 'Anthropic' | 'OpenAI' | 'Cursor' | 'Cognition' | 'Google' | 'Other';
export type CodingAgentPartnershipStage =
  | 'targeted'
  | 'intro'
  | 'proposal'
  | 'scheduled'
  | 'announced'
  | 'live'
  | 'declined'
  | 'stalled';
export type CodingAgentIntegrationStatus = 'not-started' | 'wired' | 'validated';
export type CodingAgentEvidenceType =
  | 'intro-digest'
  | 'integration-doc'
  | 'webinar-page'
  | 'announcement-url'
  | 'signed-plan'
  | 'listing-url'
  | 'co-sell-digest';
export type CodingAgentPartnershipStatus = 'pass' | 'warn' | 'fail';

export interface CodingAgentPartnershipEvidenceInput {
  type?: CodingAgentEvidenceType;
  capturedAt?: string;
  sourceHash?: string;
  sourceUrl?: string;
}

export interface CodingAgentPartnershipRecordInput {
  campaignSlug?: string;
  partner?: CodingAgentPartner;
  stage?: CodingAgentPartnershipStage;
  integrationStatus?: CodingAgentIntegrationStatus;
  mcpBridgeValidated?: boolean;
  coMarketingPublic?: boolean;
  initiatedAt?: string;
  lastActivityAt?: string;
  announcedAt?: string;
  evidence?: readonly CodingAgentPartnershipEvidenceInput[];
}

interface CodingAgentPartnershipEvidence {
  type: CodingAgentEvidenceType;
  capturedAt: string;
  sourceHash: string;
  sourceUrl?: string;
}

interface CodingAgentPartnershipRecord {
  campaignSlug: string;
  partner: CodingAgentPartner;
  stage: CodingAgentPartnershipStage;
  integrationStatus: CodingAgentIntegrationStatus;
  mcpBridgeValidated: boolean;
  coMarketingPublic: boolean;
  initiatedAt: string;
  lastActivityAt: string;
  announcedAt?: string;
  evidence: CodingAgentPartnershipEvidence[];
}

export interface CodingAgentPartnershipCheck {
  id: string;
  label: string;
  status: CodingAgentPartnershipStatus;
  current: string;
  target: string;
  owner: string;
  detail: string;
  evidence: string[];
  remediation?: string;
}

export interface CodingAgentPartnershipReport {
  generatedAt: string;
  disclaimer: string;
  targets: {
    anchorCoMarketingAnnouncements: number;
    cliPartnerPipeline: number;
    validatedCliIntegrations: number;
    maxStaleDays: number;
  };
  summary: {
    status: CodingAgentPartnershipStatus;
    checks: number;
    pass: number;
    warn: number;
    fail: number;
    partnerPipeline: number;
    priorityPartnersActive: number;
    anchorCoMarketingAnnouncements: number;
    validatedCliIntegrations: number;
    mcpBridgeValidatedPartners: number;
    publicAnnouncements: number;
    evidenceItems: number;
    distributionRequirementMet: boolean;
    acquisitionChannelReady: boolean;
  };
  partnerships: Array<{
    campaignSlug: string;
    partner: CodingAgentPartner;
    stage: CodingAgentPartnershipStage;
    integrationStatus: CodingAgentIntegrationStatus;
    mcpBridgeValidated: boolean;
    coMarketingPublic: boolean;
    initiatedAt: string;
    lastActivityAt: string;
    announcedAt?: string;
    staleDays: number;
    evidenceItems: number;
    publicHosts: string[];
  }>;
  checks: CodingAgentPartnershipCheck[];
}

const PARTNERS = new Set<CodingAgentPartner>(['Anthropic', 'OpenAI', 'Cursor', 'Cognition', 'Google', 'Other']);
const ANCHOR_PARTNERS = new Set<CodingAgentPartner>(['Anthropic', 'OpenAI']);
const PRIORITY_PARTNERS = new Set<CodingAgentPartner>(['Anthropic', 'OpenAI', 'Cursor', 'Cognition']);
const STAGES = new Set<CodingAgentPartnershipStage>([
  'targeted',
  'intro',
  'proposal',
  'scheduled',
  'announced',
  'live',
  'declined',
  'stalled',
]);
const ACTIVE_STAGES = new Set<CodingAgentPartnershipStage>(['intro', 'proposal', 'scheduled', 'announced', 'live']);
const PUBLIC_STAGES = new Set<CodingAgentPartnershipStage>(['announced', 'live']);
const INTEGRATION_STATUSES = new Set<CodingAgentIntegrationStatus>(['not-started', 'wired', 'validated']);
const EVIDENCE_TYPES = new Set<CodingAgentEvidenceType>([
  'intro-digest',
  'integration-doc',
  'webinar-page',
  'announcement-url',
  'signed-plan',
  'listing-url',
  'co-sell-digest',
]);
const PUBLIC_ANNOUNCEMENT_EVIDENCE = new Set<CodingAgentEvidenceType>(['announcement-url', 'webinar-page', 'listing-url']);

export function codingAgentPartnershipRecordsFromEnv(
  env: Record<string, string | undefined> = process.env,
): CodingAgentPartnershipRecordInput[] {
  const raw = env.GREYBOX_CODING_AGENT_PARTNERSHIPS_JSON;
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((value) => {
      if (!isRecord(value)) return [];
      const record = partnershipRecordFromRecord(value);
      return record ? [record] : [];
    });
  } catch {
    return [];
  }
}

export function buildCodingAgentPartnershipReport(options: {
  records?: readonly CodingAgentPartnershipRecordInput[];
  now?: Date;
} = {}): CodingAgentPartnershipReport {
  const now = options.now ?? new Date();
  const records = normalizeRecords(options.records ?? codingAgentPartnershipRecordsFromEnv(), now);
  const activeRecords = records.filter((record) => ACTIVE_STAGES.has(record.stage));
  const partnerPipeline = new Set(activeRecords.map((record) => record.partner)).size;
  const priorityPartnersActive = new Set(activeRecords
    .filter((record) => PRIORITY_PARTNERS.has(record.partner))
    .map((record) => record.partner)).size;
  const anchorCoMarketingAnnouncements = records.filter(isAnchorPublicAnnouncement).length;
  const validatedCliIntegrations = records.filter((record) => record.integrationStatus === 'validated').length;
  const mcpBridgeValidatedPartners = new Set(records
    .filter((record) => record.mcpBridgeValidated)
    .map((record) => record.partner)).size;
  const publicAnnouncements = records.reduce((sum, record) => {
    return sum + record.evidence.filter((item) => PUBLIC_ANNOUNCEMENT_EVIDENCE.has(item.type) && item.sourceUrl).length;
  }, 0);
  const evidenceItems = records.reduce((sum, record) => sum + record.evidence.length, 0);
  const summary = {
    partnerPipeline,
    priorityPartnersActive,
    anchorCoMarketingAnnouncements,
    validatedCliIntegrations,
    mcpBridgeValidatedPartners,
    publicAnnouncements,
    evidenceItems,
  };
  const checks = buildChecks(records, summary, now);
  const pass = checks.filter((check) => check.status === 'pass').length;
  const warn = checks.filter((check) => check.status === 'warn').length;
  const fail = checks.filter((check) => check.status === 'fail').length;
  const distributionRequirementMet = anchorCoMarketingAnnouncements >= 1 && partnerPipeline >= 3;
  const acquisitionChannelReady = distributionRequirementMet
    && priorityPartnersActive >= 3
    && validatedCliIntegrations >= 3
    && mcpBridgeValidatedPartners >= 3;
  return {
    generatedAt: now.toISOString(),
    disclaimer: 'Coding-agent partnership readiness is internal operating evidence only. Partner announcements, webinar pages, signed plans, integration listings, and co-sell approvals remain authoritative. Do not include private identifiers, private partner notes, credentials, raw meeting records, contracts, or unpublished roadmap material.',
    targets: {
      anchorCoMarketingAnnouncements: 1,
      cliPartnerPipeline: 3,
      validatedCliIntegrations: 3,
      maxStaleDays: 60,
    },
    summary: {
      status: fail > 0 ? 'fail' : warn > 0 ? 'warn' : 'pass',
      checks: checks.length,
      pass,
      warn,
      fail,
      ...summary,
      distributionRequirementMet,
      acquisitionChannelReady,
    },
    partnerships: records.map((record) => ({
      campaignSlug: record.campaignSlug,
      partner: record.partner,
      stage: record.stage,
      integrationStatus: record.integrationStatus,
      mcpBridgeValidated: record.mcpBridgeValidated,
      coMarketingPublic: record.coMarketingPublic,
      initiatedAt: record.initiatedAt,
      lastActivityAt: record.lastActivityAt,
      ...(record.announcedAt ? { announcedAt: record.announcedAt } : {}),
      staleDays: staleDays(record.lastActivityAt, now),
      evidenceItems: record.evidence.length,
      publicHosts: [...new Set(record.evidence.flatMap((item) => {
        return item.sourceUrl ? [new URL(item.sourceUrl).host] : [];
      }))].sort(),
    })),
    checks,
  };
}

export function formatCodingAgentPartnershipMarkdown(report: CodingAgentPartnershipReport): string {
  const lines = [
    '# Greybox Coding-Agent Partnership Readiness',
    '',
    `Generated: ${report.generatedAt}`,
    `Status: ${report.summary.status}`,
    `Distribution requirement met: ${report.summary.distributionRequirementMet ? 'yes' : 'no'}`,
    `Acquisition channel ready: ${report.summary.acquisitionChannelReady ? 'yes' : 'no'}`,
    `Disclaimer: ${report.disclaimer}`,
    '',
    '## Summary',
    '',
    `- Anchor co-marketing announcements: ${report.summary.anchorCoMarketingAnnouncements}/${report.targets.anchorCoMarketingAnnouncements}`,
    `- CLI partner pipeline: ${report.summary.partnerPipeline}/${report.targets.cliPartnerPipeline}`,
    `- Priority partners active: ${report.summary.priorityPartnersActive}`,
    `- Validated CLI integrations: ${report.summary.validatedCliIntegrations}/${report.targets.validatedCliIntegrations}`,
    `- MCP bridge validated partners: ${report.summary.mcpBridgeValidatedPartners}`,
    `- Public announcements/listings: ${report.summary.publicAnnouncements}`,
    '',
    '## Partnerships',
    '',
    '| Campaign | Partner | Stage | Integration | MCP | Evidence | Public hosts |',
    '| --- | --- | --- | --- | --- | ---: | --- |',
  ];
  for (const partnership of report.partnerships) {
    lines.push(`| ${partnership.campaignSlug} | ${partnership.partner} | ${partnership.stage} | ${partnership.integrationStatus} | ${partnership.mcpBridgeValidated ? 'yes' : 'no'} | ${partnership.evidenceItems} | ${escapeTableCell(partnership.publicHosts.join(', ') || '-')} |`);
  }
  lines.push(
    '',
    '## Checks',
    '',
    '| Check | Status | Current | Target | Owner |',
    '| --- | --- | --- | --- | --- |',
  );
  for (const check of report.checks) {
    lines.push(`| ${escapeTableCell(check.label)} | ${check.status} | ${escapeTableCell(check.current)} | ${escapeTableCell(check.target)} | ${escapeTableCell(check.owner)} |`);
  }
  lines.push('');
  return lines.join('\n');
}

function partnershipRecordFromRecord(record: Record<string, unknown>): CodingAgentPartnershipRecordInput | undefined {
  const campaignSlug = optionalSlug(record.campaignSlug);
  const partner = optionalPartner(record.partner);
  const stage = optionalStage(record.stage);
  const integrationStatus = optionalIntegrationStatus(record.integrationStatus);
  const initiatedAt = optionalIsoDate(record.initiatedAt);
  const lastActivityAt = optionalIsoDate(record.lastActivityAt);
  if (!campaignSlug || !partner || !stage || !integrationStatus || !initiatedAt || !lastActivityAt) return undefined;
  return {
    campaignSlug,
    partner,
    stage,
    integrationStatus,
    ...optionalBoolField('mcpBridgeValidated', record.mcpBridgeValidated),
    ...optionalBoolField('coMarketingPublic', record.coMarketingPublic),
    initiatedAt,
    lastActivityAt,
    ...optionalIsoDateField('announcedAt', record.announcedAt),
    evidence: Array.isArray(record.evidence)
      ? record.evidence.flatMap((item) => isRecord(item) ? evidenceFromRecord(item) : [])
      : [],
  };
}

function evidenceFromRecord(record: Record<string, unknown>): CodingAgentPartnershipEvidenceInput[] {
  const type = optionalEvidenceType(record.type);
  const capturedAt = optionalIsoDate(record.capturedAt);
  const sourceHash = optionalSourceHash(record.sourceHash);
  if (!type || !capturedAt || !sourceHash) return [];
  return [{
    type,
    capturedAt,
    sourceHash,
    ...optionalUrlField('sourceUrl', record.sourceUrl),
  }];
}

function normalizeRecords(
  records: readonly CodingAgentPartnershipRecordInput[],
  now: Date,
): CodingAgentPartnershipRecord[] {
  return records
    .map((record) => normalizeRecord(record, now))
    .sort((left, right) => left.partner.localeCompare(right.partner) || left.campaignSlug.localeCompare(right.campaignSlug));
}

function normalizeRecord(record: CodingAgentPartnershipRecordInput, now: Date): CodingAgentPartnershipRecord {
  const campaignSlug = normalizeSlug(record.campaignSlug);
  if (!record.partner || !PARTNERS.has(record.partner)) throw new Error('coding-agent partnership partner is invalid');
  if (!record.stage || !STAGES.has(record.stage)) throw new Error('coding-agent partnership stage is invalid');
  if (!record.integrationStatus || !INTEGRATION_STATUSES.has(record.integrationStatus)) {
    throw new Error('coding-agent partnership integrationStatus is invalid');
  }
  const initiatedAt = normalizeIsoDate(record.initiatedAt, 'initiatedAt');
  const lastActivityAt = normalizeIsoDate(record.lastActivityAt, 'lastActivityAt');
  if (Date.parse(initiatedAt) > now.getTime()) throw new Error('coding-agent partnership initiatedAt cannot be in the future');
  if (Date.parse(lastActivityAt) > now.getTime()) throw new Error('coding-agent partnership lastActivityAt cannot be in the future');
  if (Date.parse(lastActivityAt) < Date.parse(initiatedAt)) {
    throw new Error('coding-agent partnership lastActivityAt cannot precede initiatedAt');
  }
  const announcedAt = record.announcedAt ? normalizeIsoDate(record.announcedAt, 'announcedAt') : undefined;
  if (announcedAt && Date.parse(announcedAt) > now.getTime()) {
    throw new Error('coding-agent partnership announcedAt cannot be in the future');
  }
  if (announcedAt && !PUBLIC_STAGES.has(record.stage)) {
    throw new Error('coding-agent partnership announcedAt requires announced or live stage');
  }
  return {
    campaignSlug,
    partner: record.partner,
    stage: record.stage,
    integrationStatus: record.integrationStatus,
    mcpBridgeValidated: record.mcpBridgeValidated === true,
    coMarketingPublic: record.coMarketingPublic === true,
    initiatedAt,
    lastActivityAt,
    ...(announcedAt ? { announcedAt } : {}),
    evidence: (record.evidence ?? []).map((evidence) => normalizeEvidence(evidence, now)),
  };
}

function normalizeEvidence(evidence: CodingAgentPartnershipEvidenceInput, now: Date): CodingAgentPartnershipEvidence {
  if (!evidence.type || !EVIDENCE_TYPES.has(evidence.type)) throw new Error('coding-agent partnership evidence type is invalid');
  const capturedAt = normalizeIsoDate(evidence.capturedAt, 'evidence.capturedAt');
  if (Date.parse(capturedAt) > now.getTime()) {
    throw new Error('coding-agent partnership evidence capturedAt cannot be in the future');
  }
  if (!evidence.sourceHash || !/^[a-f0-9]{64}$/iu.test(evidence.sourceHash)) {
    throw new Error('coding-agent partnership evidence sourceHash must be a SHA-256 hex digest');
  }
  return {
    type: evidence.type,
    capturedAt,
    sourceHash: evidence.sourceHash.toLowerCase(),
    ...(evidence.sourceUrl ? { sourceUrl: normalizePublicUrl(evidence.sourceUrl) } : {}),
  };
}

function isAnchorPublicAnnouncement(record: CodingAgentPartnershipRecord): boolean {
  return ANCHOR_PARTNERS.has(record.partner)
    && PUBLIC_STAGES.has(record.stage)
    && record.coMarketingPublic
    && record.evidence.some((item) => PUBLIC_ANNOUNCEMENT_EVIDENCE.has(item.type) && item.sourceUrl);
}

function buildChecks(
  records: readonly CodingAgentPartnershipRecord[],
  summary: {
    partnerPipeline: number;
    priorityPartnersActive: number;
    anchorCoMarketingAnnouncements: number;
    validatedCliIntegrations: number;
    mcpBridgeValidatedPartners: number;
  },
  now: Date,
): CodingAgentPartnershipCheck[] {
  const activeRecords = records.filter((record) => ACTIVE_STAGES.has(record.stage));
  const missingEvidence = activeRecords.filter((record) => record.evidence.length < 1);
  const staleRecords = activeRecords.filter((record) => !PUBLIC_STAGES.has(record.stage) && staleDays(record.lastActivityAt, now) > 60);
  return [
    {
      id: 'anchor-co-marketing',
      label: 'Anchor co-marketing',
      status: summary.anchorCoMarketingAnnouncements >= 1
        ? 'pass'
        : records.some((record) => ANCHOR_PARTNERS.has(record.partner) && ACTIVE_STAGES.has(record.stage))
          ? 'warn'
          : 'fail',
      current: `${summary.anchorCoMarketingAnnouncements} public Anthropic/OpenAI announcement(s)`,
      target: '1+ co-marketing announcement with Anthropic or OpenAI',
      owner: 'Partnerships',
      detail: 'A public anchor announcement converts CLI integration work into distribution leverage.',
      evidence: ['partner announcement URL', 'webinar page', 'signed co-marketing plan'],
      remediation: 'Prioritize the Unity MCP bridge story with Anthropic or OpenAI before broad partner outreach.',
    },
    {
      id: 'cli-partner-pipeline',
      label: 'CLI partner pipeline',
      status: summary.partnerPipeline >= 3 ? 'pass' : summary.partnerPipeline >= 2 ? 'warn' : 'fail',
      current: `${summary.partnerPipeline} active partner(s), ${summary.priorityPartnersActive} priority partner(s)`,
      target: '3+ active coding-agent CLI partner motions, including Anthropic/OpenAI/Cursor priority paths',
      owner: 'Partnerships',
      detail: 'The brief calls for Greybox to convert CLI integrations into co-marketing relationships.',
      evidence: ['intro digest', 'webinar page', 'integration listing', 'co-sell digest'],
      remediation: 'Open or refresh Anthropic, OpenAI, Cursor, and Cognition partner motions.',
    },
    {
      id: 'validated-integrations',
      label: 'Validated CLI integrations',
      status: summary.validatedCliIntegrations >= 3 && summary.mcpBridgeValidatedPartners >= 3
        ? 'pass'
        : summary.validatedCliIntegrations >= 1
          ? 'warn'
          : 'fail',
      current: `${summary.validatedCliIntegrations} validated integration(s), ${summary.mcpBridgeValidatedPartners} MCP bridge partner(s)`,
      target: '3+ validated CLI integrations with MCP bridge proof',
      owner: 'Developer Relations',
      detail: 'Partner GTM should be backed by working CLI/MCP flows, not only relationship notes.',
      evidence: ['integration doc digest', 'MCP bridge validation capture', 'listing URL'],
      remediation: 'Validate Claude Code, Codex/OpenAI-compatible, and Cursor flows against the Unity MCP bridge.',
    },
    {
      id: 'evidence-per-partner',
      label: 'Evidence per active partner',
      status: missingEvidence.length === 0 && activeRecords.length > 0 ? 'pass' : 'fail',
      current: `${missingEvidence.length} active partner motion(s) missing evidence`,
      target: '1+ sanitized evidence item per active partner motion',
      owner: 'Partnerships',
      detail: 'Co-marketing claims need durable proof while avoiding private identifiers and private notes.',
      evidence: ['hashed intro digest', 'signed plan digest', 'public listing host'],
      remediation: 'Attach one SHA-256 evidence digest to each active partner motion.',
    },
    {
      id: 'freshness',
      label: 'Partner motion freshness',
      status: staleRecords.length === 0 ? 'pass' : 'warn',
      current: `${staleRecords.length} non-public active motion(s) stale for more than 60 days`,
      target: 'No active non-public partner motion stale for more than 60 days',
      owner: 'Partnerships',
      detail: 'Dormant conversations should not count as current channel momentum.',
      evidence: ['last activity timestamps'],
      remediation: 'Refresh stale partner motions, publish the announcement, or move them to stalled.',
    },
  ];
}

function normalizeSlug(value: string | undefined): string {
  if (!value || !/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/u.test(value)) {
    throw new Error('coding-agent partnership campaignSlug must be a lowercase URL-safe slug');
  }
  return value;
}

function normalizeIsoDate(value: string | undefined, label: string): string {
  if (!value || Number.isNaN(Date.parse(value))) throw new Error(`coding-agent partnership ${label} must be an ISO timestamp`);
  return new Date(value).toISOString();
}

function normalizePublicUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('coding-agent partnership sourceUrl must be a valid HTTPS URL');
  }
  if (url.protocol !== 'https:' || url.username || url.password || !url.hostname.includes('.')) {
    throw new Error('coding-agent partnership sourceUrl must be a public HTTPS URL');
  }
  url.hash = '';
  return url.toString();
}

function optionalSlug(value: unknown): string | undefined {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/u.test(value) ? value : undefined;
}

function optionalPartner(value: unknown): CodingAgentPartner | undefined {
  return typeof value === 'string' && PARTNERS.has(value as CodingAgentPartner) ? value as CodingAgentPartner : undefined;
}

function optionalStage(value: unknown): CodingAgentPartnershipStage | undefined {
  return typeof value === 'string' && STAGES.has(value as CodingAgentPartnershipStage)
    ? value as CodingAgentPartnershipStage
    : undefined;
}

function optionalIntegrationStatus(value: unknown): CodingAgentIntegrationStatus | undefined {
  return typeof value === 'string' && INTEGRATION_STATUSES.has(value as CodingAgentIntegrationStatus)
    ? value as CodingAgentIntegrationStatus
    : undefined;
}

function optionalEvidenceType(value: unknown): CodingAgentEvidenceType | undefined {
  return typeof value === 'string' && EVIDENCE_TYPES.has(value as CodingAgentEvidenceType)
    ? value as CodingAgentEvidenceType
    : undefined;
}

function optionalIsoDate(value: unknown): string | undefined {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString() : undefined;
}

function optionalIsoDateField(field: string, value: unknown): Record<string, string> {
  const date = optionalIsoDate(value);
  return date ? { [field]: date } : {};
}

function optionalSourceHash(value: unknown): string | undefined {
  return typeof value === 'string' && /^[a-f0-9]{64}$/iu.test(value) ? value.toLowerCase() : undefined;
}

function optionalUrlField(field: string, value: unknown): Record<string, string> {
  if (typeof value !== 'string') return {};
  try {
    return { [field]: normalizePublicUrl(value) };
  } catch {
    return {};
  }
}

function optionalBoolField(field: string, value: unknown): Record<string, boolean> {
  return typeof value === 'boolean' ? { [field]: value } : {};
}

function staleDays(value: string, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - Date.parse(value)) / 86_400_000));
}

function escapeTableCell(value: string): string {
  return value.replaceAll('|', '\\|').replaceAll('\n', '<br>');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
