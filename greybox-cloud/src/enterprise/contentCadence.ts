// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

export type ContentChannel =
  | 'tutorial'
  | 'social'
  | 'livestream'
  | 'newsletter'
  | 'changelog'
  | 'gdc-talk'
  | 'jam-sponsorship';
export type ContentStatus = 'draft' | 'scheduled' | 'published' | 'submitted' | 'accepted' | 'active';
export type ContentEngineFocus = 'Unity' | 'Unreal' | 'Godot' | 'Multi';
export type ContentEvidenceType =
  | 'cms-entry'
  | 'public-url'
  | 'analytics-snapshot'
  | 'stream-archive'
  | 'newsletter-archive'
  | 'submission-receipt'
  | 'sponsorship-invoice';
export type ContentCadenceStatus = 'pass' | 'warn' | 'fail';

export interface ContentCadenceEvidenceInput {
  type?: ContentEvidenceType;
  capturedAt?: string;
  sourceHash?: string;
  sourceUrl?: string;
}

export interface ContentCadenceRecordInput {
  contentSlug?: string;
  channel?: ContentChannel;
  status?: ContentStatus;
  engineFocus?: ContentEngineFocus;
  publishedAt?: string;
  organicSignupsAttributed?: number;
  evidence?: readonly ContentCadenceEvidenceInput[];
}

interface ContentCadenceEvidence {
  type: ContentEvidenceType;
  capturedAt: string;
  sourceHash: string;
  sourceUrl?: string;
}

interface ContentCadenceRecord {
  contentSlug: string;
  channel: ContentChannel;
  status: ContentStatus;
  engineFocus: ContentEngineFocus;
  publishedAt: string;
  organicSignupsAttributed: number;
  evidence: ContentCadenceEvidence[];
}

export interface ContentCadenceCheck {
  id: string;
  label: string;
  status: ContentCadenceStatus;
  current: string;
  target: string;
  owner: string;
  detail: string;
  evidence: string[];
  remediation?: string;
}

export interface ContentCadenceReport {
  generatedAt: string;
  disclaimer: string;
  week: {
    startsAt: string;
    endsAt: string;
  };
  targets: {
    tutorials: number;
    socialPosts: number;
    livestreams: number;
    newsletters: number;
    changelogPosts: number;
    organicSignupsWeekly: number;
    gdcTalksSubmitted: number;
    jamSponsorshipsActive: number;
  };
  summary: {
    status: ContentCadenceStatus;
    checks: number;
    pass: number;
    warn: number;
    fail: number;
    tutorialsThisWeek: number;
    socialPostsThisWeek: number;
    livestreamsThisWeek: number;
    newslettersThisWeek: number;
    changelogPostsThisWeek: number;
    organicSignupsAttributed: number;
    gdcTalksSubmitted: number;
    jamSponsorshipsActive: number;
    publicArchives: number;
    evidenceItems: number;
    weeklyCadenceComplete: boolean;
    organicSignupTargetMet: boolean;
    eventDistributionReady: boolean;
    contentEngineReady: boolean;
  };
  records: Array<{
    contentSlug: string;
    channel: ContentChannel;
    status: ContentStatus;
    engineFocus: ContentEngineFocus;
    publishedAt: string;
    inCurrentWeek: boolean;
    organicSignupsAttributed: number;
    evidenceItems: number;
    publicHosts: string[];
  }>;
  checks: ContentCadenceCheck[];
}

const CHANNELS = new Set<ContentChannel>([
  'tutorial',
  'social',
  'livestream',
  'newsletter',
  'changelog',
  'gdc-talk',
  'jam-sponsorship',
]);
const STATUSES = new Set<ContentStatus>(['draft', 'scheduled', 'published', 'submitted', 'accepted', 'active']);
const ENGINES = new Set<ContentEngineFocus>(['Unity', 'Unreal', 'Godot', 'Multi']);
const EVIDENCE_TYPES = new Set<ContentEvidenceType>([
  'cms-entry',
  'public-url',
  'analytics-snapshot',
  'stream-archive',
  'newsletter-archive',
  'submission-receipt',
  'sponsorship-invoice',
]);
const WEEKLY_CHANNELS = new Set<ContentChannel>(['tutorial', 'social', 'livestream', 'newsletter', 'changelog']);
const COUNTED_WEEKLY_STATUSES = new Set<ContentStatus>(['published', 'active']);

export function contentCadenceRecordsFromEnv(
  env: Record<string, string | undefined> = process.env,
): ContentCadenceRecordInput[] {
  const raw = env.GREYBOX_CONTENT_CADENCE_JSON;
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((value) => {
      if (!isRecord(value)) return [];
      const record = contentRecordFromRecord(value);
      return record ? [record] : [];
    });
  } catch {
    return [];
  }
}

export function buildContentCadenceReport(options: {
  records?: readonly ContentCadenceRecordInput[];
  now?: Date;
} = {}): ContentCadenceReport {
  const now = options.now ?? new Date();
  const weekStart = startOfUtcWeek(now);
  const weekEnd = new Date(weekStart.getTime() + 7 * 86_400_000);
  const records = normalizeRecords(options.records ?? contentCadenceRecordsFromEnv(), now);
  const weeklyRecords = records.filter((record) => isCountedWeeklyRecord(record, weekStart, weekEnd));
  const tutorialsThisWeek = countWeekly(weeklyRecords, 'tutorial');
  const socialPostsThisWeek = countWeekly(weeklyRecords, 'social');
  const livestreamsThisWeek = countWeekly(weeklyRecords, 'livestream');
  const newslettersThisWeek = countWeekly(weeklyRecords, 'newsletter');
  const changelogPostsThisWeek = countWeekly(weeklyRecords, 'changelog');
  const organicSignupsAttributed = weeklyRecords.reduce((sum, record) => sum + record.organicSignupsAttributed, 0);
  const gdcTalksSubmitted = records.filter((record) => record.channel === 'gdc-talk'
    && (record.status === 'submitted' || record.status === 'accepted')).length;
  const jamSponsorshipsActive = records.filter((record) => record.channel === 'jam-sponsorship' && record.status === 'active').length;
  const publicArchives = records.reduce((sum, record) => sum + record.evidence.filter((item) => item.sourceUrl).length, 0);
  const evidenceItems = records.reduce((sum, record) => sum + record.evidence.length, 0);
  const summaryBase = {
    tutorialsThisWeek,
    socialPostsThisWeek,
    livestreamsThisWeek,
    newslettersThisWeek,
    changelogPostsThisWeek,
    organicSignupsAttributed,
    gdcTalksSubmitted,
    jamSponsorshipsActive,
    publicArchives,
    evidenceItems,
  };
  const checks = buildChecks(records, weeklyRecords, summaryBase);
  const pass = checks.filter((check) => check.status === 'pass').length;
  const warn = checks.filter((check) => check.status === 'warn').length;
  const fail = checks.filter((check) => check.status === 'fail').length;
  const weeklyCadenceComplete = tutorialsThisWeek >= 1
    && socialPostsThisWeek >= 2
    && livestreamsThisWeek >= 1
    && newslettersThisWeek >= 1
    && changelogPostsThisWeek >= 1;
  const organicSignupTargetMet = organicSignupsAttributed >= 200;
  const eventDistributionReady = gdcTalksSubmitted >= 1 && jamSponsorshipsActive >= 2;
  return {
    generatedAt: now.toISOString(),
    disclaimer: 'Content cadence readiness is internal operating evidence only. Public posts, stream archives, newsletter archives, submission receipts, sponsorship invoices, and analytics exports remain authoritative. Do not include credentials, nonpublic draft files, private customer material, unreviewed copy, or unpublished roadmap material.',
    week: {
      startsAt: weekStart.toISOString(),
      endsAt: weekEnd.toISOString(),
    },
    targets: {
      tutorials: 1,
      socialPosts: 2,
      livestreams: 1,
      newsletters: 1,
      changelogPosts: 1,
      organicSignupsWeekly: 200,
      gdcTalksSubmitted: 1,
      jamSponsorshipsActive: 2,
    },
    summary: {
      status: fail > 0 ? 'fail' : warn > 0 ? 'warn' : 'pass',
      checks: checks.length,
      pass,
      warn,
      fail,
      ...summaryBase,
      weeklyCadenceComplete,
      organicSignupTargetMet,
      eventDistributionReady,
      contentEngineReady: weeklyCadenceComplete && organicSignupTargetMet && eventDistributionReady,
    },
    records: records.map((record) => ({
      contentSlug: record.contentSlug,
      channel: record.channel,
      status: record.status,
      engineFocus: record.engineFocus,
      publishedAt: record.publishedAt,
      inCurrentWeek: isCountedWeeklyRecord(record, weekStart, weekEnd),
      organicSignupsAttributed: record.organicSignupsAttributed,
      evidenceItems: record.evidence.length,
      publicHosts: [...new Set(record.evidence.flatMap((item) => {
        return item.sourceUrl ? [new URL(item.sourceUrl).host] : [];
      }))].sort(),
    })),
    checks,
  };
}

export function formatContentCadenceMarkdown(report: ContentCadenceReport): string {
  const lines = [
    '# Greybox Content Cadence Readiness',
    '',
    `Generated: ${report.generatedAt}`,
    `Week: ${report.week.startsAt} to ${report.week.endsAt}`,
    `Status: ${report.summary.status}`,
    `Content engine ready: ${report.summary.contentEngineReady ? 'yes' : 'no'}`,
    `Disclaimer: ${report.disclaimer}`,
    '',
    '## Summary',
    '',
    `- Tutorials: ${report.summary.tutorialsThisWeek}/${report.targets.tutorials}`,
    `- Social posts: ${report.summary.socialPostsThisWeek}/${report.targets.socialPosts}`,
    `- Livestreams: ${report.summary.livestreamsThisWeek}/${report.targets.livestreams}`,
    `- Newsletters: ${report.summary.newslettersThisWeek}/${report.targets.newsletters}`,
    `- Changelog posts: ${report.summary.changelogPostsThisWeek}/${report.targets.changelogPosts}`,
    `- Organic signups attributed: ${report.summary.organicSignupsAttributed}/${report.targets.organicSignupsWeekly}`,
    `- GDC talks submitted: ${report.summary.gdcTalksSubmitted}/${report.targets.gdcTalksSubmitted}`,
    `- Jam sponsorships active: ${report.summary.jamSponsorshipsActive}/${report.targets.jamSponsorshipsActive}`,
    '',
    '## Records',
    '',
    '| Content | Channel | Status | Engine | This week | Signups | Evidence | Public hosts |',
    '| --- | --- | --- | --- | --- | ---: | ---: | --- |',
  ];
  for (const record of report.records) {
    lines.push(`| ${record.contentSlug} | ${record.channel} | ${record.status} | ${record.engineFocus} | ${record.inCurrentWeek ? 'yes' : 'no'} | ${record.organicSignupsAttributed} | ${record.evidenceItems} | ${escapeTableCell(record.publicHosts.join(', ') || '-')} |`);
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

function contentRecordFromRecord(record: Record<string, unknown>): ContentCadenceRecordInput | undefined {
  const contentSlug = optionalSlug(record.contentSlug);
  const channel = optionalChannel(record.channel);
  const status = optionalStatus(record.status);
  const engineFocus = optionalEngine(record.engineFocus);
  const publishedAt = optionalIsoDate(record.publishedAt);
  if (!contentSlug || !channel || !status || !engineFocus || !publishedAt) return undefined;
  return {
    contentSlug,
    channel,
    status,
    engineFocus,
    publishedAt,
    ...optionalNumberField('organicSignupsAttributed', record.organicSignupsAttributed),
    evidence: Array.isArray(record.evidence)
      ? record.evidence.flatMap((item) => isRecord(item) ? evidenceFromRecord(item) : [])
      : [],
  };
}

function evidenceFromRecord(record: Record<string, unknown>): ContentCadenceEvidenceInput[] {
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

function normalizeRecords(records: readonly ContentCadenceRecordInput[], now: Date): ContentCadenceRecord[] {
  return records
    .map((record) => normalizeRecord(record, now))
    .sort((left, right) => left.publishedAt.localeCompare(right.publishedAt) || left.contentSlug.localeCompare(right.contentSlug));
}

function normalizeRecord(record: ContentCadenceRecordInput, now: Date): ContentCadenceRecord {
  const contentSlug = normalizeSlug(record.contentSlug);
  if (!record.channel || !CHANNELS.has(record.channel)) throw new Error('content cadence channel is invalid');
  if (!record.status || !STATUSES.has(record.status)) throw new Error('content cadence status is invalid');
  if (!record.engineFocus || !ENGINES.has(record.engineFocus)) throw new Error('content cadence engineFocus is invalid');
  const publishedAt = normalizeIsoDate(record.publishedAt, 'publishedAt');
  if (Date.parse(publishedAt) > now.getTime()) throw new Error('content cadence publishedAt cannot be in the future');
  if (record.organicSignupsAttributed !== undefined
    && (!Number.isInteger(record.organicSignupsAttributed) || record.organicSignupsAttributed < 0)) {
    throw new Error('content cadence organicSignupsAttributed must be a non-negative integer');
  }
  return {
    contentSlug,
    channel: record.channel,
    status: record.status,
    engineFocus: record.engineFocus,
    publishedAt,
    organicSignupsAttributed: record.organicSignupsAttributed ?? 0,
    evidence: (record.evidence ?? []).map((evidence) => normalizeEvidence(evidence, now)),
  };
}

function normalizeEvidence(evidence: ContentCadenceEvidenceInput, now: Date): ContentCadenceEvidence {
  if (!evidence.type || !EVIDENCE_TYPES.has(evidence.type)) throw new Error('content cadence evidence type is invalid');
  const capturedAt = normalizeIsoDate(evidence.capturedAt, 'evidence.capturedAt');
  if (Date.parse(capturedAt) > now.getTime()) throw new Error('content cadence evidence capturedAt cannot be in the future');
  if (!evidence.sourceHash || !/^[a-f0-9]{64}$/iu.test(evidence.sourceHash)) {
    throw new Error('content cadence evidence sourceHash must be a SHA-256 hex digest');
  }
  return {
    type: evidence.type,
    capturedAt,
    sourceHash: evidence.sourceHash.toLowerCase(),
    ...(evidence.sourceUrl ? { sourceUrl: normalizePublicUrl(evidence.sourceUrl) } : {}),
  };
}

function buildChecks(
  records: readonly ContentCadenceRecord[],
  weeklyRecords: readonly ContentCadenceRecord[],
  summary: {
    tutorialsThisWeek: number;
    socialPostsThisWeek: number;
    livestreamsThisWeek: number;
    newslettersThisWeek: number;
    changelogPostsThisWeek: number;
    organicSignupsAttributed: number;
    gdcTalksSubmitted: number;
    jamSponsorshipsActive: number;
  },
): ContentCadenceCheck[] {
  const countedRecords = records.filter((record) => {
    return weeklyRecords.includes(record)
      || record.channel === 'gdc-talk'
      || (record.channel === 'jam-sponsorship' && record.status === 'active');
  });
  const missingEvidence = countedRecords.filter((record) => record.evidence.length < 1);
  const publicArchives = countedRecords.filter((record) => record.evidence.some((item) => item.sourceUrl)).length;
  const weeklyPassed = [
    summary.tutorialsThisWeek >= 1,
    summary.socialPostsThisWeek >= 2,
    summary.livestreamsThisWeek >= 1,
    summary.newslettersThisWeek >= 1,
    summary.changelogPostsThisWeek >= 1,
  ].filter(Boolean).length;
  return [
    {
      id: 'weekly-content-cadence',
      label: 'Weekly content cadence',
      status: weeklyPassed === 5 ? 'pass' : weeklyPassed >= 3 ? 'warn' : 'fail',
      current: `${summary.tutorialsThisWeek} tutorials, ${summary.socialPostsThisWeek} social, ${summary.livestreamsThisWeek} livestreams, ${summary.newslettersThisWeek} newsletters, ${summary.changelogPostsThisWeek} changelogs`,
      target: '1 tutorial, 2 social posts, 1 livestream, 1 newsletter, and 1 changelog weekly',
      owner: 'Content',
      detail: 'The Monday-Friday content engine turns shipped product proof into repeatable creator demand.',
      evidence: ['blog CMS digest', 'social archive digest', 'stream archive', 'newsletter archive', 'release notes'],
      remediation: 'Backfill the missing weekly channel before scaling paid distribution.',
    },
    {
      id: 'organic-signup-attribution',
      label: 'Organic signup attribution',
      status: summary.organicSignupsAttributed >= 200 ? 'pass' : summary.organicSignupsAttributed >= 50 ? 'warn' : 'fail',
      current: `${summary.organicSignupsAttributed} attributed organic signup(s)`,
      target: '200+ organic-search free signups per week attributed to content',
      owner: 'Growth',
      detail: 'Organic signup evidence connects the publishing engine to the ARR path.',
      evidence: ['PostHog attribution export', 'Search Console digest', 'signup source report'],
      remediation: 'Increase tutorial SEO pages and sample-export CTAs until organic activation is visible.',
    },
    {
      id: 'public-archive-evidence',
      label: 'Public archive evidence',
      status: missingEvidence.length === 0 && publicArchives >= countedRecords.length && countedRecords.length > 0 ? 'pass' : 'fail',
      current: `${missingEvidence.length} counted record(s) missing evidence, ${publicArchives}/${countedRecords.length} with public archive hosts`,
      target: 'Every counted content or event record has hashed evidence and a public archive host',
      owner: 'Content Operations',
      detail: 'Published GTM proof needs durable public archives without storing unpublished copy.',
      evidence: ['public URL digest', 'archive host list'],
      remediation: 'Attach a public archive URL and SHA-256 digest to each counted record.',
    },
    {
      id: 'events-and-jams',
      label: 'Events and game jams',
      status: summary.gdcTalksSubmitted >= 1 && summary.jamSponsorshipsActive >= 2
        ? 'pass'
        : summary.gdcTalksSubmitted >= 1 || summary.jamSponsorshipsActive >= 1
          ? 'warn'
          : 'fail',
      current: `${summary.gdcTalksSubmitted} GDC talk(s), ${summary.jamSponsorshipsActive} active jam sponsorship(s)`,
      target: '1+ GDC talk submitted and 2+ active game-jam sponsorships',
      owner: 'Developer Relations',
      detail: 'Community events make Greybox visible where indie games and future studio employees are made.',
      evidence: ['GDC receipt digest', 'jam sponsorship invoice', 'event landing page'],
      remediation: 'Submit the Unity round-trip talk and sponsor two high-signal game jams.',
    },
  ];
}

function isCountedWeeklyRecord(record: ContentCadenceRecord, weekStart: Date, weekEnd: Date): boolean {
  const published = Date.parse(record.publishedAt);
  return WEEKLY_CHANNELS.has(record.channel)
    && COUNTED_WEEKLY_STATUSES.has(record.status)
    && published >= weekStart.getTime()
    && published < weekEnd.getTime();
}

function countWeekly(records: readonly ContentCadenceRecord[], channel: ContentChannel): number {
  return records.filter((record) => record.channel === channel).length;
}

function startOfUtcWeek(now: Date): Date {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = date.getUTCDay();
  const daysSinceMonday = (day + 6) % 7;
  date.setUTCDate(date.getUTCDate() - daysSinceMonday);
  return date;
}

function normalizeSlug(value: string | undefined): string {
  if (!value || !/^[a-z0-9][a-z0-9-]{1,72}[a-z0-9]$/u.test(value)) {
    throw new Error('content cadence contentSlug must be a lowercase URL-safe slug');
  }
  return value;
}

function normalizeIsoDate(value: string | undefined, label: string): string {
  if (!value || Number.isNaN(Date.parse(value))) throw new Error(`content cadence ${label} must be an ISO timestamp`);
  return new Date(value).toISOString();
}

function normalizePublicUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('content cadence sourceUrl must be a valid HTTPS URL');
  }
  if (url.protocol !== 'https:' || url.username || url.password || !url.hostname.includes('.')) {
    throw new Error('content cadence sourceUrl must be a public HTTPS URL');
  }
  url.hash = '';
  return url.toString();
}

function optionalSlug(value: unknown): string | undefined {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9-]{1,72}[a-z0-9]$/u.test(value) ? value : undefined;
}

function optionalChannel(value: unknown): ContentChannel | undefined {
  return typeof value === 'string' && CHANNELS.has(value as ContentChannel) ? value as ContentChannel : undefined;
}

function optionalStatus(value: unknown): ContentStatus | undefined {
  return typeof value === 'string' && STATUSES.has(value as ContentStatus) ? value as ContentStatus : undefined;
}

function optionalEngine(value: unknown): ContentEngineFocus | undefined {
  return typeof value === 'string' && ENGINES.has(value as ContentEngineFocus) ? value as ContentEngineFocus : undefined;
}

function optionalEvidenceType(value: unknown): ContentEvidenceType | undefined {
  return typeof value === 'string' && EVIDENCE_TYPES.has(value as ContentEvidenceType)
    ? value as ContentEvidenceType
    : undefined;
}

function optionalIsoDate(value: unknown): string | undefined {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString() : undefined;
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

function optionalNumberField(field: string, value: unknown): Record<string, number> {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? { [field]: value } : {};
}

function escapeTableCell(value: string): string {
  return value.replaceAll('|', '\\|').replaceAll('\n', '<br>');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
