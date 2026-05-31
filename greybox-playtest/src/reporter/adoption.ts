// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { createHash } from 'node:crypto';

import type {
  PlaytestAdoptionReport,
  PlaytestAdoptionShortfall,
  PlaytestAdoptionTargets,
  PlaytestBenchmarkReport,
  PlaytestStudioPlan,
  PlaytestStudioUsageRecord,
} from '../types.js';

const DEFAULT_ADOPTION_TARGETS: PlaytestAdoptionTargets = {
  activeStudios: 100,
  payingStudios: 100,
  reports: 100,
  acceptedSuggestionStudios: 20,
  minReportsPerPayingStudio: 1,
};

const planRank: Record<PlaytestStudioPlan, number> = {
  free: 0,
  indie: 1,
  studio: 2,
  enterprise: 3,
};

export interface PlaytestUsageRecordFromBenchmarkInput {
  benchmark: PlaytestBenchmarkReport;
  studioId?: string;
  studioExternalId?: string;
  plan: PlaytestStudioPlan;
  billed?: boolean;
  runAt?: number;
}

export interface PlaytestAdoptionReportOptions {
  generatedAt?: number;
  period?: PlaytestAdoptionReport['period'];
  targets?: Partial<PlaytestAdoptionTargets>;
}

export function playtestStudioIdFromExternal(externalId: string): string {
  const normalized = externalId.trim().toLowerCase();
  if (!normalized) throw new Error('studio external id is required');
  return `studio_${createHash('sha256').update(normalized).digest('hex').slice(0, 16)}`;
}

export function usageRecordFromBenchmark(
  input: PlaytestUsageRecordFromBenchmarkInput,
): PlaytestStudioUsageRecord {
  const studioId = input.studioId?.trim()
    || (input.studioExternalId ? playtestStudioIdFromExternal(input.studioExternalId) : undefined);
  if (!studioId) throw new Error('studioId or studioExternalId is required');
  const billed = input.billed ?? input.plan !== 'free';
  return {
    id: `usage_${createHash('sha256').update(`${studioId}:${input.benchmark.reportId}`).digest('hex').slice(0, 16)}`,
    studioId,
    plan: input.plan,
    reportId: input.benchmark.reportId,
    artifactId: input.benchmark.artifactId,
    artifactTitle: input.benchmark.artifactTitle,
    runAt: input.runAt ?? input.benchmark.generatedAt,
    billed,
    personasRun: input.benchmark.summary.personasRun,
    completedRuns: input.benchmark.summary.completedRuns,
    seededBugsIdentified: input.benchmark.summary.seededBugsIdentified,
    tuningSuggestions: input.benchmark.summary.tuningSuggestions,
    acceptedSuggestions: Math.max(
      input.benchmark.acceptedSuggestionIds.length,
      input.benchmark.summary.humanAcceptedSuggestions,
    ),
  };
}

export function buildPlaytestAdoptionReport(
  records: PlaytestStudioUsageRecord[],
  options: PlaytestAdoptionReportOptions = {},
): PlaytestAdoptionReport {
  const generatedAt = options.generatedAt ?? Date.now();
  const period = options.period ?? currentUtcMonthPeriod(generatedAt);
  const targets = adoptionTargets(options.targets ?? {});
  const scoped = records
    .filter((record) => record.runAt >= period.from && record.runAt < period.to)
    .sort((left, right) => left.runAt - right.runAt || left.id.localeCompare(right.id));
  const studios = studioSummaries(scoped);
  const payingStudiosBelowUsageMinimum = studios
    .filter((studio) => studio.paying && studio.reports < targets.minReportsPerPayingStudio)
    .length;
  const summary = {
    activeStudios: studios.length,
    payingStudios: studios.filter((studio) => studio.paying).length,
    reports: scoped.length,
    personasRun: sum(scoped, 'personasRun'),
    completedRuns: sum(scoped, 'completedRuns'),
    seededBugsIdentified: sum(scoped, 'seededBugsIdentified'),
    tuningSuggestions: sum(scoped, 'tuningSuggestions'),
    acceptedSuggestionStudios: studios.filter((studio) => studio.acceptedSuggestions > 0).length,
    acceptedSuggestions: sum(scoped, 'acceptedSuggestions'),
    payingStudiosBelowUsageMinimum,
  };
  const shortfalls = adoptionShortfalls(summary, targets, records);
  return {
    readyForProductionProof: shortfalls.length === 0,
    generatedAt,
    period,
    targets,
    summary,
    studios,
    shortfalls,
  };
}

export function playtestAdoptionMarkdown(report: PlaytestAdoptionReport): string {
  const lines = [
    '# Greybox Playtest Adoption Proof',
    '',
    `- Ready: ${report.readyForProductionProof ? 'yes' : 'no'}`,
    `- Period: ${report.period.label}`,
    `- Active studios: ${report.summary.activeStudios}/${report.targets.activeStudios}`,
    `- Paying studios: ${report.summary.payingStudios}/${report.targets.payingStudios}`,
    `- Reports: ${report.summary.reports}/${report.targets.reports}`,
    `- Accepted-suggestion studios: ${report.summary.acceptedSuggestionStudios}/${report.targets.acceptedSuggestionStudios}`,
    '',
    '## Shortfalls',
    ...(
      report.shortfalls.length > 0
        ? report.shortfalls.map((shortfall) => `- [${shortfall.severity}] ${shortfall.code}: ${shortfall.detail}`)
        : ['- none']
    ),
    '',
    '## Top Studios',
    ...report.studios.slice(0, 10).map((studio, index) =>
      `- Studio ${String(index + 1).padStart(2, '0')} (${studio.plan}): ${studio.reports} report(s), ${studio.acceptedSuggestions} accepted suggestion(s)`,
    ),
  ];
  return `${lines.join('\n')}\n`;
}

function adoptionTargets(overrides: Partial<PlaytestAdoptionTargets>): PlaytestAdoptionTargets {
  const targets = { ...DEFAULT_ADOPTION_TARGETS, ...overrides };
  for (const [key, value] of Object.entries(targets)) {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`${key} must be a non-negative integer`);
    }
  }
  return targets;
}

function currentUtcMonthPeriod(timestamp: number): PlaytestAdoptionReport['period'] {
  const date = new Date(timestamp);
  const from = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
  const to = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
  return {
    from,
    to,
    label: new Date(from).toISOString().slice(0, 7),
  };
}

function studioSummaries(records: PlaytestStudioUsageRecord[]): PlaytestAdoptionReport['studios'] {
  const byStudio = new Map<string, PlaytestAdoptionReport['studios'][number]>();
  for (const record of records) {
    const current = byStudio.get(record.studioId) ?? {
      studioId: record.studioId,
      plan: record.plan,
      paying: false,
      reports: 0,
      personasRun: 0,
      completedRuns: 0,
      seededBugsIdentified: 0,
      tuningSuggestions: 0,
      acceptedSuggestions: 0,
      lastRunAt: record.runAt,
    };
    current.plan = higherPlan(current.plan, record.plan);
    current.paying = current.paying || isPayingRecord(record);
    current.reports += 1;
    current.personasRun += record.personasRun;
    current.completedRuns += record.completedRuns;
    current.seededBugsIdentified += record.seededBugsIdentified;
    current.tuningSuggestions += record.tuningSuggestions;
    current.acceptedSuggestions += record.acceptedSuggestions;
    current.lastRunAt = Math.max(current.lastRunAt, record.runAt);
    byStudio.set(record.studioId, current);
  }
  return [...byStudio.values()].sort((left, right) => (
    Number(right.paying) - Number(left.paying)
    || right.reports - left.reports
    || right.acceptedSuggestions - left.acceptedSuggestions
    || right.lastRunAt - left.lastRunAt
    || left.studioId.localeCompare(right.studioId)
  ));
}

function adoptionShortfalls(
  summary: PlaytestAdoptionReport['summary'],
  targets: PlaytestAdoptionTargets,
  sourceRecords: PlaytestStudioUsageRecord[],
): PlaytestAdoptionShortfall[] {
  const shortfalls: PlaytestAdoptionShortfall[] = [];
  if (summary.activeStudios < targets.activeStudios) {
    shortfalls.push({
      code: 'active_studio_shortfall',
      severity: 'warning',
      detail: `Need ${targets.activeStudios - summary.activeStudios} more active studio(s) in the period.`,
      remediation: 'Recruit more design partners before using adoption as production proof.',
    });
  }
  if (summary.payingStudios < targets.payingStudios) {
    shortfalls.push({
      code: 'paying_studio_shortfall',
      severity: 'error',
      detail: `Need ${targets.payingStudios - summary.payingStudios} more paying studio(s).`,
      remediation: 'Convert playtest pilots into paid Studio or Enterprise contracts.',
    });
  }
  if (summary.reports < targets.reports) {
    shortfalls.push({
      code: 'report_shortfall',
      severity: 'warning',
      detail: `Need ${targets.reports - summary.reports} more playtest report(s).`,
      remediation: 'Schedule recurring synthetic playtest runs for every active studio.',
    });
  }
  if (summary.acceptedSuggestionStudios < targets.acceptedSuggestionStudios) {
    shortfalls.push({
      code: 'accepted_suggestion_studio_shortfall',
      severity: 'error',
      detail: `Need ${targets.acceptedSuggestionStudios - summary.acceptedSuggestionStudios} more studio(s) with accepted tuner suggestions.`,
      remediation: 'Run human review sessions and record consented accepted/rejected tuner decisions.',
    });
  }
  if (summary.payingStudiosBelowUsageMinimum > 0) {
    shortfalls.push({
      code: 'paying_studio_usage_shortfall',
      severity: 'warning',
      detail: `${summary.payingStudiosBelowUsageMinimum} paying studio(s) are below the minimum report count.`,
      remediation: 'Trigger onboarding follow-up for paid studios that have not completed their first loop.',
    });
  }
  if (piiDetected(sourceRecords)) {
    shortfalls.push({
      code: 'pii_evidence_leak',
      severity: 'error',
      detail: 'Adoption source records contain email, phone, or IP-address material.',
      remediation: 'Hash studio identifiers and strip direct contact material before building production proof.',
    });
  }
  return shortfalls;
}

function isPayingRecord(record: PlaytestStudioUsageRecord): boolean {
  return record.billed && record.plan !== 'free';
}

function higherPlan(left: PlaytestStudioPlan, right: PlaytestStudioPlan): PlaytestStudioPlan {
  return planRank[right] > planRank[left] ? right : left;
}

function sum<T extends Record<K, number>, K extends keyof T>(items: T[], key: K): number {
  return items.reduce((total, item) => total + item[key], 0);
}

function piiDetected(value: unknown): boolean {
  return collectStrings(value).some((item) => (
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu.test(item)
    || /\+?\d[\d ().-]{7,}\d/u.test(item)
    || /\b(?:\d{1,3}\.){3}\d{1,3}\b/u.test(item)
  ));
}

function collectStrings(value: unknown, key = ''): string[] {
  if (/^(id|reportId|artifactId|.*Hash|.*Sha256|generatedAt|runAt)$/u.test(key)) return [];
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap((item) => collectStrings(item));
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([childKey, child]) => collectStrings(child, childKey));
  }
  return [];
}
