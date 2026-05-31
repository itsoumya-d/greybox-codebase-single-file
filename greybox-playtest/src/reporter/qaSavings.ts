// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import type {
  PlaytestQaSavingsAssumptions,
  PlaytestQaSavingsReport,
  PlaytestQaSavingsShortfall,
  PlaytestQaSavingsTargets,
  PlaytestStudioPlan,
  PlaytestStudioUsageRecord,
} from '../types.js';

const DEFAULT_ASSUMPTIONS: PlaytestQaSavingsAssumptions = {
  qaHourlyCostCents: 9_000,
  manualRegressionMinutesPerPersona: 10,
  manualBugTriageMinutes: 20,
  manualTuningReviewMinutes: 30,
  automationCreditBps: 5_000,
};

const DEFAULT_TARGETS: PlaytestQaSavingsTargets = {
  annualQaBudgetCents: 50_000_000,
  targetReplacementBps: 3_000,
  minimumPayingStudios: 100,
  minimumReports: 100,
  minimumAcceptedSuggestionStudios: 20,
};

const planRank: Record<PlaytestStudioPlan, number> = {
  free: 0,
  indie: 1,
  studio: 2,
  enterprise: 3,
};

export interface PlaytestQaSavingsOptions {
  generatedAt?: number;
  period?: PlaytestQaSavingsReport['period'];
  assumptions?: Partial<PlaytestQaSavingsAssumptions>;
  targets?: Partial<PlaytestQaSavingsTargets>;
}

export function buildPlaytestQaSavingsReport(
  records: PlaytestStudioUsageRecord[],
  options: PlaytestQaSavingsOptions = {},
): PlaytestQaSavingsReport {
  const generatedAt = options.generatedAt ?? Date.now();
  const period = options.period ?? currentUtcMonthPeriod(generatedAt);
  const assumptions = qaSavingsAssumptions(options.assumptions ?? {});
  const targets = qaSavingsTargets(options.targets ?? {});
  const scoped = records
    .filter((record) => record.runAt >= period.from && record.runAt < period.to)
    .sort((left, right) => left.runAt - right.runAt || left.id.localeCompare(right.id));
  const paidScoped = scoped.filter(isPayingRecord);
  const studios = qaSavingsStudios(paidScoped, assumptions);
  const summary = {
    payingStudios: studios.filter((studio) => studio.paying).length,
    reports: paidScoped.length,
    acceptedSuggestionStudios: studios.filter((studio) => studio.acceptedSuggestions > 0).length,
    personasRun: sum(paidScoped, 'personasRun'),
    seededBugsIdentified: sum(paidScoped, 'seededBugsIdentified'),
    acceptedSuggestions: sum(paidScoped, 'acceptedSuggestions'),
    grossAvoidedMinutes: sum(studios, 'grossAvoidedMinutes'),
    creditedAvoidedMinutes: sum(studios, 'creditedAvoidedMinutes'),
    estimatedMonthlySavingsCents: sum(studios, 'estimatedSavingsCents'),
    annualizedSavingsCents: sum(studios, 'estimatedSavingsCents') * 12,
    replacementBps: 0,
    targetMet: false,
  };
  summary.replacementBps = targets.annualQaBudgetCents > 0
    ? Math.round((summary.annualizedSavingsCents / targets.annualQaBudgetCents) * 10_000)
    : 10_000;
  const shortfalls = qaSavingsShortfalls(summary, targets, records);
  summary.targetMet = shortfalls.length === 0;
  return {
    readyForQaBudgetProof: summary.targetMet,
    generatedAt,
    period,
    assumptions,
    targets,
    summary,
    studios,
    shortfalls,
  };
}

export function playtestQaSavingsMarkdown(report: PlaytestQaSavingsReport): string {
  const lines = [
    '# Greybox Playtest QA Savings Proof',
    '',
    `- Ready: ${report.readyForQaBudgetProof ? 'yes' : 'no'}`,
    `- Period: ${report.period.label}`,
    `- Paying studios: ${report.summary.payingStudios}/${report.targets.minimumPayingStudios}`,
    `- Reports: ${report.summary.reports}/${report.targets.minimumReports}`,
    `- Monthly savings: ${money(report.summary.estimatedMonthlySavingsCents)}`,
    `- Annualized savings: ${money(report.summary.annualizedSavingsCents)}`,
    `- QA budget replacement: ${bps(report.summary.replacementBps)} / ${bps(report.targets.targetReplacementBps)}`,
    '',
    '## Assumptions',
    `- QA hourly cost: ${money(report.assumptions.qaHourlyCostCents)}`,
    `- Automation credit: ${bps(report.assumptions.automationCreditBps)}`,
    `- Manual regression minutes per persona: ${report.assumptions.manualRegressionMinutesPerPersona}`,
    `- Manual triage minutes per bug: ${report.assumptions.manualBugTriageMinutes}`,
    `- Manual review minutes per accepted tuner suggestion: ${report.assumptions.manualTuningReviewMinutes}`,
    '',
    '## Shortfalls',
    ...(
      report.shortfalls.length > 0
        ? report.shortfalls.map((shortfall) => `- [${shortfall.severity}] ${shortfall.code}: ${shortfall.detail}`)
        : ['- none']
    ),
  ];
  return `${lines.join('\n')}\n`;
}

function qaSavingsAssumptions(overrides: Partial<PlaytestQaSavingsAssumptions>): PlaytestQaSavingsAssumptions {
  const assumptions = { ...DEFAULT_ASSUMPTIONS, ...overrides };
  for (const [key, value] of Object.entries(assumptions)) {
    if (!Number.isInteger(value) || value < 0) throw new Error(`${key} must be a non-negative integer`);
  }
  if (assumptions.automationCreditBps > 10_000) throw new Error('automationCreditBps must be between 0 and 10000');
  return assumptions;
}

function qaSavingsTargets(overrides: Partial<PlaytestQaSavingsTargets>): PlaytestQaSavingsTargets {
  const targets = { ...DEFAULT_TARGETS, ...overrides };
  for (const [key, value] of Object.entries(targets)) {
    if (!Number.isInteger(value) || value < 0) throw new Error(`${key} must be a non-negative integer`);
  }
  if (targets.targetReplacementBps > 10_000) throw new Error('targetReplacementBps must be between 0 and 10000');
  return targets;
}

function qaSavingsStudios(
  records: PlaytestStudioUsageRecord[],
  assumptions: PlaytestQaSavingsAssumptions,
): PlaytestQaSavingsReport['studios'] {
  const byStudio = new Map<string, PlaytestQaSavingsReport['studios'][number]>();
  for (const record of records) {
    const current = byStudio.get(record.studioId) ?? {
      studioId: record.studioId,
      plan: record.plan,
      paying: false,
      reports: 0,
      personasRun: 0,
      seededBugsIdentified: 0,
      acceptedSuggestions: 0,
      grossAvoidedMinutes: 0,
      creditedAvoidedMinutes: 0,
      estimatedSavingsCents: 0,
    };
    current.plan = higherPlan(current.plan, record.plan);
    current.paying = current.paying || isPayingRecord(record);
    current.reports += 1;
    current.personasRun += record.personasRun;
    current.seededBugsIdentified += record.seededBugsIdentified;
    current.acceptedSuggestions += record.acceptedSuggestions;
    current.grossAvoidedMinutes += avoidedMinutes(record, assumptions);
    current.creditedAvoidedMinutes = Math.round((current.grossAvoidedMinutes * assumptions.automationCreditBps) / 10_000);
    current.estimatedSavingsCents = Math.round((current.creditedAvoidedMinutes / 60) * assumptions.qaHourlyCostCents);
    byStudio.set(record.studioId, current);
  }
  return [...byStudio.values()].sort((left, right) => (
    right.estimatedSavingsCents - left.estimatedSavingsCents
    || Number(right.paying) - Number(left.paying)
    || right.reports - left.reports
    || left.studioId.localeCompare(right.studioId)
  ));
}

function avoidedMinutes(
  record: PlaytestStudioUsageRecord,
  assumptions: PlaytestQaSavingsAssumptions,
): number {
  return (
    record.personasRun * assumptions.manualRegressionMinutesPerPersona
    + record.seededBugsIdentified * assumptions.manualBugTriageMinutes
    + record.acceptedSuggestions * assumptions.manualTuningReviewMinutes
  );
}

function qaSavingsShortfalls(
  summary: PlaytestQaSavingsReport['summary'],
  targets: PlaytestQaSavingsTargets,
  sourceRecords: PlaytestStudioUsageRecord[],
): PlaytestQaSavingsShortfall[] {
  const shortfalls: PlaytestQaSavingsShortfall[] = [];
  if (summary.replacementBps < targets.targetReplacementBps) {
    shortfalls.push({
      code: 'replacement_shortfall',
      severity: 'error',
      detail: `QA replacement is ${summary.replacementBps} bps, below the ${targets.targetReplacementBps} bps target.`,
      remediation: 'Increase paid playtest usage, accepted tuner suggestions, or verified savings evidence before using QA replacement in enterprise sales.',
    });
  }
  if (summary.payingStudios < targets.minimumPayingStudios) {
    shortfalls.push({
      code: 'paying_studio_shortfall',
      severity: 'error',
      detail: `Need ${targets.minimumPayingStudios - summary.payingStudios} more paying studio(s).`,
      remediation: 'Convert playtest pilots into paid Studio or Enterprise usage before claiming production replacement.',
    });
  }
  if (summary.reports < targets.minimumReports) {
    shortfalls.push({
      code: 'report_shortfall',
      severity: 'warning',
      detail: `Need ${targets.minimumReports - summary.reports} more playtest report(s).`,
      remediation: 'Run recurring persona suites for every paid playtest customer.',
    });
  }
  if (summary.acceptedSuggestionStudios < targets.minimumAcceptedSuggestionStudios) {
    shortfalls.push({
      code: 'accepted_suggestion_studio_shortfall',
      severity: 'error',
      detail: `Need ${targets.minimumAcceptedSuggestionStudios - summary.acceptedSuggestionStudios} more studio(s) with accepted tuner suggestions.`,
      remediation: 'Record consented human review decisions for tuner diffs after playtest sessions.',
    });
  }
  if (piiDetected(sourceRecords)) {
    shortfalls.push({
      code: 'pii_evidence_leak',
      severity: 'error',
      detail: 'QA savings source records contain email, phone, or IP-address material.',
      remediation: 'Hash studio identifiers and strip notes before building ROI evidence.',
    });
  }
  return shortfalls;
}

function currentUtcMonthPeriod(timestamp: number): PlaytestQaSavingsReport['period'] {
  const date = new Date(timestamp);
  const from = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
  const to = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
  return {
    from,
    to,
    label: new Date(from).toISOString().slice(0, 7),
  };
}

function higherPlan(left: PlaytestStudioPlan, right: PlaytestStudioPlan): PlaytestStudioPlan {
  return planRank[right] > planRank[left] ? right : left;
}

function isPayingRecord(record: PlaytestStudioUsageRecord): boolean {
  return record.billed && record.plan !== 'free';
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

function money(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function bps(value: number): string {
  return `${(value / 100).toFixed(value % 100 === 0 ? 0 : 2)}%`;
}

function sum<T extends Record<K, number>, K extends keyof T>(items: T[], key: K): number {
  return items.reduce((total, item) => total + item[key], 0);
}
