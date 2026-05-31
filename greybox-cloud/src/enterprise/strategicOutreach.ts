// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

export type StrategicAcquirer = 'Unity' | 'Roblox' | 'Epic' | 'Krafton' | 'Tencent' | 'Adobe';
export type StrategicOutreachStage =
  | 'warm-intro'
  | 'intro-scheduled'
  | 'intro-completed'
  | 'nda-signed'
  | 'diligence'
  | 'term-sheet'
  | 'closed-lost';
export type StrategicEvidenceType =
  | 'founder-intro'
  | 'partner-channel'
  | 'nda'
  | 'diligence-request'
  | 'board-note'
  | 'term-sheet';
export type StrategicOutreachStatus = 'pass' | 'warn' | 'fail';

export interface StrategicOutreachEvidenceInput {
  type?: StrategicEvidenceType;
  capturedAt?: string;
  sourceHash?: string;
}

export interface StrategicOutreachRecordInput {
  acquirer?: StrategicAcquirer;
  stage?: StrategicOutreachStage;
  initiatedAt?: string;
  lastActivityAt?: string;
  evidence?: readonly StrategicOutreachEvidenceInput[];
  valuationUsd?: number;
}

export interface StrategicOutreachRecord {
  acquirer: StrategicAcquirer;
  stage: StrategicOutreachStage;
  initiatedAt: string;
  lastActivityAt: string;
  evidence: StrategicOutreachEvidenceInput[];
  valuationUsd: number;
}

export interface StrategicOutreachCheck {
  id: string;
  label: string;
  status: StrategicOutreachStatus;
  current: string;
  target: string;
  owner: string;
  detail: string;
  evidence: string[];
  remediation?: string;
}

export interface StrategicOutreachReport {
  generatedAt: string;
  disclaimer: string;
  targetAcquirers: StrategicAcquirer[];
  targets: {
    initiatedConversations: number;
    evidencePerConversation: number;
    maxStaleDays: number;
    targetValuationUsd: number;
  };
  summary: {
    status: StrategicOutreachStatus;
    checks: number;
    pass: number;
    warn: number;
    fail: number;
    initiatedTargetConversations: number;
    activeTargetConversations: number;
    advancedConversations: number;
    termSheetConversations: number;
    evidenceItems: number;
    highestValuationUsd: number;
    conversationRequirementMet: boolean;
    exitOutcomeEvidence: boolean;
  };
  conversations: Array<{
    acquirer: StrategicAcquirer;
    stage: StrategicOutreachStage;
    initiatedAt: string;
    lastActivityAt: string;
    evidenceItems: number;
    staleDays: number;
    valuationBand?: '$200M+';
  }>;
  checks: StrategicOutreachCheck[];
}

const TARGET_ACQUIRERS: StrategicAcquirer[] = ['Unity', 'Roblox', 'Epic', 'Krafton', 'Tencent', 'Adobe'];
const ACQUIRERS = new Set<StrategicAcquirer>(TARGET_ACQUIRERS);
const STAGES = new Set<StrategicOutreachStage>([
  'warm-intro',
  'intro-scheduled',
  'intro-completed',
  'nda-signed',
  'diligence',
  'term-sheet',
  'closed-lost',
]);
const ADVANCED_STAGES = new Set<StrategicOutreachStage>(['nda-signed', 'diligence', 'term-sheet']);
const EVIDENCE_TYPES = new Set<StrategicEvidenceType>([
  'founder-intro',
  'partner-channel',
  'nda',
  'diligence-request',
  'board-note',
  'term-sheet',
]);

export function strategicOutreachRecordsFromEnv(
  env: Record<string, string | undefined> = process.env,
): StrategicOutreachRecordInput[] {
  const raw = env.GREYBOX_STRATEGIC_OUTREACH_JSON;
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((value) => {
      if (!isRecord(value)) return [];
      const record = outreachRecordFromRecord(value);
      return record ? [record] : [];
    });
  } catch {
    return [];
  }
}

export function buildStrategicOutreachReport(options: {
  records?: readonly StrategicOutreachRecordInput[];
  now?: Date;
} = {}): StrategicOutreachReport {
  const now = options.now ?? new Date();
  const records = normalizeRecords(options.records ?? strategicOutreachRecordsFromEnv(), now);
  const conversations = records.map((record) => ({
    acquirer: record.acquirer,
    stage: record.stage,
    initiatedAt: record.initiatedAt,
    lastActivityAt: record.lastActivityAt,
    evidenceItems: record.evidence.length,
    staleDays: staleDays(record.lastActivityAt, now),
    ...(record.valuationUsd >= 200_000_000 ? { valuationBand: '$200M+' as const } : {}),
  }));
  const initiatedTargetConversations = new Set(records
    .filter((record) => record.stage !== 'closed-lost')
    .map((record) => record.acquirer)).size;
  const activeTargetConversations = records.filter((record) => record.stage !== 'closed-lost').length;
  const advancedConversations = records.filter((record) => ADVANCED_STAGES.has(record.stage)).length;
  const termSheetConversations = records.filter((record) => record.stage === 'term-sheet').length;
  const evidenceItems = records.reduce((sum, record) => sum + record.evidence.length, 0);
  const highestValuationUsd = Math.max(0, ...records.map((record) => record.valuationUsd));
  const checks = buildChecks(records, {
    initiatedTargetConversations,
    activeTargetConversations,
    advancedConversations,
    termSheetConversations,
    evidenceItems,
    highestValuationUsd,
  }, now);
  const pass = checks.filter((check) => check.status === 'pass').length;
  const warn = checks.filter((check) => check.status === 'warn').length;
  const fail = checks.filter((check) => check.status === 'fail').length;
  return {
    generatedAt: now.toISOString(),
    disclaimer: 'Strategic outreach readiness is internal operating evidence only. It is not legal advice, investment advice, a valuation guarantee, or proof of buyer intent. Keep this payload limited to sanitized buyer, stage, timestamp, valuation, and evidence-count fields.',
    targetAcquirers: TARGET_ACQUIRERS,
    targets: {
      initiatedConversations: 2,
      evidencePerConversation: 1,
      maxStaleDays: 60,
      targetValuationUsd: 200_000_000,
    },
    summary: {
      status: fail > 0 ? 'fail' : warn > 0 ? 'warn' : 'pass',
      checks: checks.length,
      pass,
      warn,
      fail,
      initiatedTargetConversations,
      activeTargetConversations,
      advancedConversations,
      termSheetConversations,
      evidenceItems,
      highestValuationUsd,
      conversationRequirementMet: initiatedTargetConversations >= 2
        && records.filter((record) => record.stage !== 'closed-lost').every((record) => record.evidence.length >= 1),
      exitOutcomeEvidence: highestValuationUsd >= 200_000_000 && termSheetConversations >= 1,
    },
    conversations,
    checks,
  };
}

export function formatStrategicOutreachMarkdown(report: StrategicOutreachReport): string {
  const lines = [
    '# Greybox Strategic Outreach Readiness',
    '',
    `Generated: ${report.generatedAt}`,
    `Status: ${report.summary.status}`,
    `Conversation requirement met: ${report.summary.conversationRequirementMet ? 'yes' : 'no'}`,
    `Exit outcome evidence: ${report.summary.exitOutcomeEvidence ? 'yes' : 'no'}`,
    `Disclaimer: ${report.disclaimer}`,
    '',
    '## Summary',
    '',
    `- Target conversations: ${report.summary.initiatedTargetConversations}/${report.targets.initiatedConversations}`,
    `- Advanced conversations: ${report.summary.advancedConversations}`,
    `- Term-sheet conversations: ${report.summary.termSheetConversations}`,
    `- Evidence items: ${report.summary.evidenceItems}`,
    `- Highest valuation evidence: ${money(report.summary.highestValuationUsd)}`,
    '',
    '## Conversations',
    '',
    '| Acquirer | Stage | Evidence | Stale days | Valuation band |',
    '| --- | --- | ---: | ---: | --- |',
  ];
  for (const conversation of report.conversations) {
    lines.push(`| ${conversation.acquirer} | ${conversation.stage} | ${conversation.evidenceItems} | ${conversation.staleDays} | ${conversation.valuationBand ?? '-'} |`);
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

function outreachRecordFromRecord(record: Record<string, unknown>): StrategicOutreachRecordInput | undefined {
  const acquirer = optionalAcquirer(record.acquirer);
  const stage = optionalStage(record.stage);
  const initiatedAt = optionalIsoDate(record.initiatedAt);
  const lastActivityAt = optionalIsoDate(record.lastActivityAt);
  if (!acquirer || !stage || !initiatedAt || !lastActivityAt) return undefined;
  return {
    acquirer,
    stage,
    initiatedAt,
    lastActivityAt,
    evidence: Array.isArray(record.evidence)
      ? record.evidence.flatMap((item) => isRecord(item) ? evidenceFromRecord(item) : [])
      : [],
    ...(optionalValuation(record.valuationUsd) !== undefined ? { valuationUsd: optionalValuation(record.valuationUsd) } : {}),
  };
}

function evidenceFromRecord(record: Record<string, unknown>): StrategicOutreachEvidenceInput[] {
  const type = optionalEvidenceType(record.type);
  const capturedAt = optionalIsoDate(record.capturedAt);
  const sourceHash = optionalSourceHash(record.sourceHash);
  if (!type || !capturedAt || !sourceHash) return [];
  return [{
    type,
    capturedAt,
    sourceHash,
  }];
}

function normalizeRecords(records: readonly StrategicOutreachRecordInput[], now: Date): StrategicOutreachRecord[] {
  return records
    .map((record) => normalizeRecord(record, now))
    .sort((left, right) => left.acquirer.localeCompare(right.acquirer) || left.lastActivityAt.localeCompare(right.lastActivityAt));
}

function normalizeRecord(record: StrategicOutreachRecordInput, now: Date): StrategicOutreachRecord {
  if (!record.acquirer || !ACQUIRERS.has(record.acquirer)) throw new Error('strategic outreach acquirer must be a target acquirer');
  if (!record.stage || !STAGES.has(record.stage)) throw new Error('strategic outreach stage is invalid');
  const initiatedAt = normalizeIsoDate(record.initiatedAt, 'initiatedAt');
  const lastActivityAt = normalizeIsoDate(record.lastActivityAt, 'lastActivityAt');
  if (Date.parse(lastActivityAt) < Date.parse(initiatedAt)) {
    throw new Error('strategic outreach lastActivityAt cannot precede initiatedAt');
  }
  if (Date.parse(initiatedAt) > now.getTime()) throw new Error('strategic outreach initiatedAt cannot be in the future');
  if (Date.parse(lastActivityAt) > now.getTime()) throw new Error('strategic outreach lastActivityAt cannot be in the future');
  const valuationUsd = record.valuationUsd ?? 0;
  if (!Number.isInteger(valuationUsd) || valuationUsd < 0) {
    throw new Error('strategic outreach valuationUsd must be a non-negative integer');
  }
  if (valuationUsd > 0 && record.stage !== 'term-sheet') {
    throw new Error('strategic outreach valuationUsd requires term-sheet stage');
  }
  const evidence = (record.evidence ?? []).map(normalizeEvidence);
  return {
    acquirer: record.acquirer,
    stage: record.stage,
    initiatedAt,
    lastActivityAt,
    evidence,
    valuationUsd,
  };
}

function normalizeEvidence(evidence: StrategicOutreachEvidenceInput): StrategicOutreachEvidenceInput {
  if (!evidence.type || !EVIDENCE_TYPES.has(evidence.type)) throw new Error('strategic outreach evidence type is invalid');
  const capturedAt = normalizeIsoDate(evidence.capturedAt, 'evidence.capturedAt');
  if (!evidence.sourceHash || !/^[a-f0-9]{64}$/iu.test(evidence.sourceHash)) {
    throw new Error('strategic outreach evidence sourceHash must be a SHA-256 hex digest');
  }
  return {
    type: evidence.type,
    capturedAt,
    sourceHash: evidence.sourceHash.toLowerCase(),
  };
}

function buildChecks(
  records: readonly StrategicOutreachRecord[],
  summary: {
    initiatedTargetConversations: number;
    activeTargetConversations: number;
    advancedConversations: number;
    termSheetConversations: number;
    evidenceItems: number;
    highestValuationUsd: number;
  },
  now: Date,
): StrategicOutreachCheck[] {
  const stale = records.filter((record) => record.stage !== 'closed-lost' && staleDays(record.lastActivityAt, now) > 60);
  const missingEvidence = records.filter((record) => record.stage !== 'closed-lost' && record.evidence.length < 1);
  return [
    {
      id: 'target-conversations',
      label: 'Target acquirer conversations',
      status: summary.initiatedTargetConversations >= 2 ? 'pass' : 'fail',
      current: `${summary.initiatedTargetConversations} active target acquirer(s)`,
      target: '2+ active conversations with Unity, Roblox, Epic, Krafton, Tencent, or Adobe',
      owner: 'CEO',
      detail: 'The mission requires acquisition conversations with at least two named strategic buyers.',
      evidence: ['sanitized outreach ledger', 'board operating packet'],
      remediation: 'Prioritize warm introductions through Unity/Epic/Godot partner paths and founder-led customer references.',
    },
    {
      id: 'evidence-per-conversation',
      label: 'Evidence per conversation',
      status: missingEvidence.length === 0 && summary.activeTargetConversations > 0 ? 'pass' : 'fail',
      current: `${summary.evidenceItems} evidence item(s), ${missingEvidence.length} active conversation(s) missing evidence`,
      target: '1+ sanitized evidence item per active conversation',
      owner: 'CEO',
      detail: 'Each strategic conversation should have sanitized proof without exposing contacts or private notes.',
      evidence: ['hashed intro evidence', 'board note digest', 'NDA/diligence digest'],
      remediation: 'Record a sanitized source hash for every intro, partner channel, NDA, diligence request, board note, or term sheet.',
    },
    {
      id: 'freshness',
      label: 'Outreach freshness',
      status: stale.length === 0 ? 'pass' : 'warn',
      current: `${stale.length} stale active conversation(s)`,
      target: 'No active conversation stale for more than 60 days',
      owner: 'CEO',
      detail: 'Old conversations should not be counted as active strategic process evidence.',
      evidence: ['last activity timestamps'],
      remediation: 'Refresh buyer conversations or move inactive records to closed-lost.',
    },
    {
      id: 'advanced-stage',
      label: 'Advanced strategic stage',
      status: summary.advancedConversations > 0 ? 'pass' : 'warn',
      current: `${summary.advancedConversations} NDA/diligence/term-sheet conversation(s)`,
      target: '1+ advanced-stage strategic conversation before formal process',
      owner: 'CEO',
      detail: 'Advanced-stage evidence helps separate exploratory chats from real buyer pull.',
      evidence: ['NDA digest', 'diligence request digest', 'term-sheet digest'],
      remediation: 'Use Unity Verified Solution, enterprise logos, and shipped game credits to move at least one buyer past intro stage.',
    },
    {
      id: 'valuation-event',
      label: 'Valuation event',
      status: summary.highestValuationUsd >= 200_000_000 && summary.termSheetConversations > 0 ? 'pass' : 'warn',
      current: `${summary.termSheetConversations} term sheet(s), highest ${money(summary.highestValuationUsd)}`,
      target: '$200M+ term sheet or Series B valuation evidence',
      owner: 'CEO',
      detail: 'The final mission requires a $200M+ term sheet or financing outcome, not just conversations.',
      evidence: ['term-sheet digest', 'board approval packet'],
      remediation: 'Keep this gate warning until a sanitized $200M+ term-sheet or Series B evidence digest exists.',
    },
  ];
}

function normalizeIsoDate(value: string | undefined, label: string): string {
  if (!value || Number.isNaN(Date.parse(value))) throw new Error(`strategic outreach ${label} must be an ISO timestamp`);
  return new Date(value).toISOString();
}

function staleDays(value: string, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - Date.parse(value)) / 86_400_000));
}

function optionalAcquirer(value: unknown): StrategicAcquirer | undefined {
  return typeof value === 'string' && ACQUIRERS.has(value as StrategicAcquirer)
    ? value as StrategicAcquirer
    : undefined;
}

function optionalStage(value: unknown): StrategicOutreachStage | undefined {
  return typeof value === 'string' && STAGES.has(value as StrategicOutreachStage)
    ? value as StrategicOutreachStage
    : undefined;
}

function optionalEvidenceType(value: unknown): StrategicEvidenceType | undefined {
  return typeof value === 'string' && EVIDENCE_TYPES.has(value as StrategicEvidenceType)
    ? value as StrategicEvidenceType
    : undefined;
}

function optionalIsoDate(value: unknown): string | undefined {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString() : undefined;
}

function optionalValuation(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function optionalSourceHash(value: unknown): string | undefined {
  return typeof value === 'string' && /^[a-f0-9]{64}$/iu.test(value) ? value.toLowerCase() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function money(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toLocaleString('en-US', { maximumFractionDigits: 1 })}M`;
  return `$${value.toLocaleString('en-US')}`;
}

function escapeTableCell(value: string): string {
  return value.replaceAll('|', '\\|').replaceAll('\n', '<br>');
}
