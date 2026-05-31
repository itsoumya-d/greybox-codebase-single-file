// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

export type EnginePartner = 'Unity' | 'Epic' | 'Godot';
export type EnginePartnershipProgram = 'unity-verified-solution' | 'epic-megagrant' | 'godot-sponsorship';
export type EnginePartnershipStage = 'planned' | 'applied' | 'under-review' | 'approved' | 'active' | 'rejected' | 'expired';
export type EnginePartnershipEvidenceType =
  | 'application-receipt'
  | 'portal-status'
  | 'approval-notice'
  | 'award-notice'
  | 'sponsorship-invoice'
  | 'payment-receipt'
  | 'public-listing';
export type EnginePartnershipStatus = 'pass' | 'warn' | 'fail';

export interface EnginePartnershipEvidenceInput {
  type?: EnginePartnershipEvidenceType;
  capturedAt?: string;
  sourceHash?: string;
  sourceUrl?: string;
}

export interface EnginePartnershipRecordInput {
  partner?: EnginePartner;
  program?: EnginePartnershipProgram;
  stage?: EnginePartnershipStage;
  submittedAt?: string;
  lastActivityAt?: string;
  expiresAt?: string;
  evidence?: readonly EnginePartnershipEvidenceInput[];
}

interface EnginePartnershipEvidence {
  type: EnginePartnershipEvidenceType;
  capturedAt: string;
  sourceHash: string;
  sourceUrl?: string;
}

interface EnginePartnershipRecord {
  partner: EnginePartner;
  program: EnginePartnershipProgram;
  stage: EnginePartnershipStage;
  submittedAt: string;
  lastActivityAt: string;
  expiresAt?: string;
  evidence: EnginePartnershipEvidence[];
}

export interface EnginePartnershipCheck {
  id: string;
  label: string;
  status: EnginePartnershipStatus;
  current: string;
  target: string;
  owner: string;
  detail: string;
  evidence: string[];
  remediation?: string;
}

export interface EnginePartnershipReport {
  generatedAt: string;
  disclaimer: string;
  targets: {
    requiredPrograms: EnginePartnershipProgram[];
    maxStaleDays: number;
  };
  summary: {
    status: EnginePartnershipStatus;
    checks: number;
    pass: number;
    warn: number;
    fail: number;
    appliedPrograms: number;
    achievedPrograms: number;
    activePrograms: number;
    evidenceItems: number;
    publicListings: number;
    unityVerifiedApplied: boolean;
    unityVerifiedAchieved: boolean;
    epicMegaGrantApplied: boolean;
    epicMegaGrantLanded: boolean;
    godotSponsorshipActive: boolean;
    engineVendorStrategicInterest: boolean;
  };
  programs: Array<{
    partner: EnginePartner;
    program: EnginePartnershipProgram;
    stage: EnginePartnershipStage;
    submittedAt: string;
    lastActivityAt: string;
    expiresAt?: string;
    staleDays: number;
    evidenceItems: number;
    publicHosts: string[];
  }>;
  checks: EnginePartnershipCheck[];
}

const PROGRAMS: EnginePartnershipProgram[] = [
  'unity-verified-solution',
  'epic-megagrant',
  'godot-sponsorship',
];
const PARTNERS = new Set<EnginePartner>(['Unity', 'Epic', 'Godot']);
const PROGRAM_SET = new Set<EnginePartnershipProgram>(PROGRAMS);
const STAGES = new Set<EnginePartnershipStage>([
  'planned',
  'applied',
  'under-review',
  'approved',
  'active',
  'rejected',
  'expired',
]);
const EVIDENCE_TYPES = new Set<EnginePartnershipEvidenceType>([
  'application-receipt',
  'portal-status',
  'approval-notice',
  'award-notice',
  'sponsorship-invoice',
  'payment-receipt',
  'public-listing',
]);
const PROGRAM_PARTNERS: Record<EnginePartnershipProgram, EnginePartner> = {
  'unity-verified-solution': 'Unity',
  'epic-megagrant': 'Epic',
  'godot-sponsorship': 'Godot',
};
const ACHIEVED_STAGES = new Set<EnginePartnershipStage>(['approved', 'active']);
const APPLIED_STAGES = new Set<EnginePartnershipStage>(['applied', 'under-review', 'approved', 'active']);

export function enginePartnershipRecordsFromEnv(
  env: Record<string, string | undefined> = process.env,
): EnginePartnershipRecordInput[] {
  const raw = env.GREYBOX_ENGINE_PARTNERSHIPS_JSON;
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

export function buildEnginePartnershipReport(options: {
  records?: readonly EnginePartnershipRecordInput[];
  now?: Date;
} = {}): EnginePartnershipReport {
  const now = options.now ?? new Date();
  const records = normalizeRecords(options.records ?? enginePartnershipRecordsFromEnv(), now);
  const latest = latestRecordByProgram(records);
  const appliedPrograms = PROGRAMS.filter((program) => {
    const record = latest.get(program);
    return record && APPLIED_STAGES.has(record.stage);
  }).length;
  const achievedPrograms = PROGRAMS.filter((program) => {
    const record = latest.get(program);
    return record && ACHIEVED_STAGES.has(record.stage);
  }).length;
  const activePrograms = PROGRAMS.filter((program) => latest.get(program)?.stage === 'active').length;
  const evidenceItems = records.reduce((sum, record) => sum + record.evidence.length, 0);
  const publicListings = records.reduce(
    (sum, record) => sum + record.evidence.filter((item) => item.type === 'public-listing' && item.sourceUrl).length,
    0,
  );
  const unity = latest.get('unity-verified-solution');
  const epic = latest.get('epic-megagrant');
  const godot = latest.get('godot-sponsorship');
  const summary = {
    appliedPrograms,
    achievedPrograms,
    activePrograms,
    evidenceItems,
    publicListings,
    unityVerifiedApplied: Boolean(unity && APPLIED_STAGES.has(unity.stage)),
    unityVerifiedAchieved: Boolean(unity && ACHIEVED_STAGES.has(unity.stage)),
    epicMegaGrantApplied: Boolean(epic && APPLIED_STAGES.has(epic.stage)),
    epicMegaGrantLanded: Boolean(epic && ACHIEVED_STAGES.has(epic.stage)),
    godotSponsorshipActive: godot?.stage === 'active' && !isExpired(godot, now),
  };
  const checks = buildChecks(records, latest, summary, now);
  const pass = checks.filter((check) => check.status === 'pass').length;
  const warn = checks.filter((check) => check.status === 'warn').length;
  const fail = checks.filter((check) => check.status === 'fail').length;
  const engineVendorStrategicInterest = summary.unityVerifiedAchieved
    && summary.epicMegaGrantLanded
    && summary.godotSponsorshipActive;
  return {
    generatedAt: now.toISOString(),
    disclaimer: 'Engine partnership readiness is internal operating evidence only. Unity, Epic, and Godot partner portals, award notices, sponsorship invoices, and public listings remain authoritative. Do not include contacts, private partner notes, credentials, contracts, or unpublished roadmap material.',
    targets: {
      requiredPrograms: PROGRAMS,
      maxStaleDays: 60,
    },
    summary: {
      status: fail > 0 ? 'fail' : warn > 0 ? 'warn' : 'pass',
      checks: checks.length,
      pass,
      warn,
      fail,
      ...summary,
      engineVendorStrategicInterest,
    },
    programs: records.map((record) => ({
      partner: record.partner,
      program: record.program,
      stage: record.stage,
      submittedAt: record.submittedAt,
      lastActivityAt: record.lastActivityAt,
      ...(record.expiresAt ? { expiresAt: record.expiresAt } : {}),
      staleDays: staleDays(record.lastActivityAt, now),
      evidenceItems: record.evidence.length,
      publicHosts: [...new Set(record.evidence.flatMap((item) => {
        return item.sourceUrl ? [new URL(item.sourceUrl).host] : [];
      }))].sort(),
    })),
    checks,
  };
}

export function formatEnginePartnershipMarkdown(report: EnginePartnershipReport): string {
  const lines = [
    '# Greybox Engine Partnership Readiness',
    '',
    `Generated: ${report.generatedAt}`,
    `Status: ${report.summary.status}`,
    `Engine-vendor strategic interest: ${report.summary.engineVendorStrategicInterest ? 'yes' : 'no'}`,
    `Disclaimer: ${report.disclaimer}`,
    '',
    '## Summary',
    '',
    `- Applied programs: ${report.summary.appliedPrograms}/3`,
    `- Achieved programs: ${report.summary.achievedPrograms}/3`,
    `- Active programs: ${report.summary.activePrograms}/3`,
    `- Evidence items: ${report.summary.evidenceItems}`,
    `- Public listings: ${report.summary.publicListings}`,
    '',
    '## Programs',
    '',
    '| Partner | Program | Stage | Stale days | Evidence | Public hosts |',
    '| --- | --- | --- | ---: | ---: | --- |',
  ];
  for (const program of report.programs) {
    lines.push(`| ${program.partner} | ${program.program} | ${program.stage} | ${program.staleDays} | ${program.evidenceItems} | ${escapeTableCell(program.publicHosts.join(', ') || '-')} |`);
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

function partnershipRecordFromRecord(record: Record<string, unknown>): EnginePartnershipRecordInput | undefined {
  const partner = optionalPartner(record.partner);
  const program = optionalProgram(record.program);
  const stage = optionalStage(record.stage);
  const submittedAt = optionalIsoDate(record.submittedAt);
  const lastActivityAt = optionalIsoDate(record.lastActivityAt);
  if (!partner || !program || !stage || !submittedAt || !lastActivityAt) return undefined;
  if (PROGRAM_PARTNERS[program] !== partner) return undefined;
  return {
    partner,
    program,
    stage,
    submittedAt,
    lastActivityAt,
    ...optionalIsoDateField('expiresAt', record.expiresAt),
    evidence: Array.isArray(record.evidence)
      ? record.evidence.flatMap((item) => isRecord(item) ? evidenceFromRecord(item) : [])
      : [],
  };
}

function evidenceFromRecord(record: Record<string, unknown>): EnginePartnershipEvidenceInput[] {
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
  records: readonly EnginePartnershipRecordInput[],
  now: Date,
): EnginePartnershipRecord[] {
  return records
    .map((record) => normalizeRecord(record, now))
    .sort((left, right) => left.program.localeCompare(right.program) || left.lastActivityAt.localeCompare(right.lastActivityAt));
}

function normalizeRecord(record: EnginePartnershipRecordInput, now: Date): EnginePartnershipRecord {
  if (!record.partner || !PARTNERS.has(record.partner)) throw new Error('engine partnership partner is invalid');
  if (!record.program || !PROGRAM_SET.has(record.program)) throw new Error('engine partnership program is invalid');
  if (PROGRAM_PARTNERS[record.program] !== record.partner) {
    throw new Error('engine partnership program does not match partner');
  }
  if (!record.stage || !STAGES.has(record.stage)) throw new Error('engine partnership stage is invalid');
  const submittedAt = normalizeIsoDate(record.submittedAt, 'submittedAt');
  const lastActivityAt = normalizeIsoDate(record.lastActivityAt, 'lastActivityAt');
  if (Date.parse(submittedAt) > now.getTime()) throw new Error('engine partnership submittedAt cannot be in the future');
  if (Date.parse(lastActivityAt) > now.getTime()) throw new Error('engine partnership lastActivityAt cannot be in the future');
  if (Date.parse(lastActivityAt) < Date.parse(submittedAt)) {
    throw new Error('engine partnership lastActivityAt cannot precede submittedAt');
  }
  const expiresAt = record.expiresAt ? normalizeIsoDate(record.expiresAt, 'expiresAt') : undefined;
  if (expiresAt && Date.parse(expiresAt) < Date.parse(submittedAt)) {
    throw new Error('engine partnership expiresAt cannot precede submittedAt');
  }
  return {
    partner: record.partner,
    program: record.program,
    stage: record.stage,
    submittedAt,
    lastActivityAt,
    ...(expiresAt ? { expiresAt } : {}),
    evidence: (record.evidence ?? []).map((evidence) => normalizeEvidence(evidence, now)),
  };
}

function normalizeEvidence(evidence: EnginePartnershipEvidenceInput, now: Date): EnginePartnershipEvidence {
  if (!evidence.type || !EVIDENCE_TYPES.has(evidence.type)) throw new Error('engine partnership evidence type is invalid');
  const capturedAt = normalizeIsoDate(evidence.capturedAt, 'evidence.capturedAt');
  if (Date.parse(capturedAt) > now.getTime()) throw new Error('engine partnership evidence capturedAt cannot be in the future');
  if (!evidence.sourceHash || !/^[a-f0-9]{64}$/iu.test(evidence.sourceHash)) {
    throw new Error('engine partnership evidence sourceHash must be a SHA-256 hex digest');
  }
  return {
    type: evidence.type,
    capturedAt,
    sourceHash: evidence.sourceHash.toLowerCase(),
    ...(evidence.sourceUrl ? { sourceUrl: normalizePublicUrl(evidence.sourceUrl) } : {}),
  };
}

function latestRecordByProgram(records: readonly EnginePartnershipRecord[]): Map<EnginePartnershipProgram, EnginePartnershipRecord> {
  const latest = new Map<EnginePartnershipProgram, EnginePartnershipRecord>();
  for (const record of records) {
    const existing = latest.get(record.program);
    if (!existing || Date.parse(record.lastActivityAt) >= Date.parse(existing.lastActivityAt)) {
      latest.set(record.program, record);
    }
  }
  return latest;
}

function buildChecks(
  records: readonly EnginePartnershipRecord[],
  latest: Map<EnginePartnershipProgram, EnginePartnershipRecord>,
  summary: {
    appliedPrograms: number;
    achievedPrograms: number;
    unityVerifiedAchieved: boolean;
    epicMegaGrantLanded: boolean;
    godotSponsorshipActive: boolean;
  },
  now: Date,
): EnginePartnershipCheck[] {
  const latestRecords = [...latest.values()];
  const missingEvidence = latestRecords.filter((record) => APPLIED_STAGES.has(record.stage) && record.evidence.length < 1);
  const staleRecords = latestRecords.filter((record) => APPLIED_STAGES.has(record.stage) && !ACHIEVED_STAGES.has(record.stage) && staleDays(record.lastActivityAt, now) > 60);
  const expiredActive = latestRecords.filter((record) => record.stage === 'active' && isExpired(record, now));
  return [
    {
      id: 'program-coverage',
      label: 'Program coverage',
      status: summary.appliedPrograms === 3 ? 'pass' : summary.appliedPrograms >= 2 ? 'warn' : 'fail',
      current: `${summary.appliedPrograms}/3 programs applied or active`,
      target: 'Unity Verified Solution, Epic MegaGrant, and Godot sponsorship all applied or active',
      owner: 'Partnerships',
      detail: 'All three engine-vendor paths should be in motion before Greybox claims a partnership flywheel.',
      evidence: ['Unity portal receipt', 'Epic MegaGrant application receipt', 'Godot sponsorship invoice'],
      remediation: 'File the missing program application or sponsorship and attach a hashed receipt.',
    },
    {
      id: 'engine-vendor-wins',
      label: 'Engine vendor wins',
      status: summary.unityVerifiedAchieved && summary.epicMegaGrantLanded && summary.godotSponsorshipActive
        ? 'pass'
        : summary.achievedPrograms >= 1
          ? 'warn'
          : 'fail',
      current: `${summary.achievedPrograms}/3 achieved, Godot active ${summary.godotSponsorshipActive ? 'yes' : 'no'}`,
      target: 'Unity Verified Solution achieved, Epic MegaGrant landed, and Godot sponsorship active',
      owner: 'Partnerships',
      detail: 'These external signals make Greybox strategically interesting to engine vendors.',
      evidence: ['Unity Verified Solution approval', 'Epic MegaGrant award notice', 'Godot sponsorship receipt'],
      remediation: 'Use Unity adoption, shipped-game credits, and open-core goodwill to convert applications into wins.',
    },
    {
      id: 'evidence-per-program',
      label: 'Evidence per active program',
      status: missingEvidence.length === 0 && latestRecords.length > 0 ? 'pass' : 'fail',
      current: `${missingEvidence.length} applied/active program(s) missing evidence`,
      target: '1+ sanitized evidence item per applied, approved, or active program',
      owner: 'Partnerships',
      detail: 'Partner claims need durable evidence without leaking private portal content.',
      evidence: ['hashed portal status', 'application receipt digest', 'public listing URL'],
      remediation: 'Attach one SHA-256 evidence digest to each applied or active program.',
    },
    {
      id: 'review-freshness',
      label: 'Review freshness',
      status: staleRecords.length === 0 ? 'pass' : 'warn',
      current: `${staleRecords.length} non-achieved program(s) stale for more than 60 days`,
      target: 'No in-review program stale for more than 60 days',
      owner: 'Partnerships',
      detail: 'A stale application should not be counted as live partnership momentum.',
      evidence: ['last activity timestamps', 'portal status digest'],
      remediation: 'Refresh stale portals, follow up with partner teams, or move rejected records out of the active path.',
    },
    {
      id: 'expiry-control',
      label: 'Sponsorship and approval expiry',
      status: expiredActive.length === 0 ? 'pass' : 'fail',
      current: `${expiredActive.length} active program(s) expired`,
      target: 'No active partnership or sponsorship past its expiry date',
      owner: 'Partnerships',
      detail: 'Expired sponsorships and approvals should not power strategic-readiness claims.',
      evidence: ['renewal receipt', 'sponsorship invoice', 'public listing timestamp'],
      remediation: 'Renew expired sponsorships or mark them expired until a fresh receipt exists.',
    },
  ];
}

function isExpired(record: EnginePartnershipRecord, now: Date): boolean {
  return Boolean(record.expiresAt && Date.parse(record.expiresAt) < now.getTime());
}

function staleDays(value: string, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - Date.parse(value)) / 86_400_000));
}

function normalizeIsoDate(value: string | undefined, label: string): string {
  if (!value || Number.isNaN(Date.parse(value))) throw new Error(`engine partnership ${label} must be an ISO timestamp`);
  return new Date(value).toISOString();
}

function normalizePublicUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('engine partnership sourceUrl must be a valid HTTPS URL');
  }
  if (url.protocol !== 'https:' || url.username || url.password || !url.hostname.includes('.')) {
    throw new Error('engine partnership sourceUrl must be a public HTTPS URL');
  }
  url.hash = '';
  return url.toString();
}

function optionalPartner(value: unknown): EnginePartner | undefined {
  return typeof value === 'string' && PARTNERS.has(value as EnginePartner) ? value as EnginePartner : undefined;
}

function optionalProgram(value: unknown): EnginePartnershipProgram | undefined {
  return typeof value === 'string' && PROGRAM_SET.has(value as EnginePartnershipProgram)
    ? value as EnginePartnershipProgram
    : undefined;
}

function optionalStage(value: unknown): EnginePartnershipStage | undefined {
  return typeof value === 'string' && STAGES.has(value as EnginePartnershipStage)
    ? value as EnginePartnershipStage
    : undefined;
}

function optionalEvidenceType(value: unknown): EnginePartnershipEvidenceType | undefined {
  return typeof value === 'string' && EVIDENCE_TYPES.has(value as EnginePartnershipEvidenceType)
    ? value as EnginePartnershipEvidenceType
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

function escapeTableCell(value: string): string {
  return value.replaceAll('|', '\\|').replaceAll('\n', '<br>');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
