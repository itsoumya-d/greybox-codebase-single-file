// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import type {
  ObservedIssue,
  PlaytestRegressionCheck,
  PlaytestRegressionIssue,
  PlaytestRegressionReport,
  PlaytestRegressionTargets,
  PlaytestReport,
} from '../types.js';

const DEFAULT_TARGETS: PlaytestRegressionTargets = {
  minResolvedSeededBugs: 1,
  maxNewCriticalIssues: 0,
  maxCompletionRegressionBps: 2_000,
  minAcceptedSuggestionsApplied: 1,
};

export interface PlaytestRegressionOptions {
  before: PlaytestReport;
  after: PlaytestReport;
  acceptedSuggestionIds?: string[];
  generatedAt?: number;
  targets?: Partial<PlaytestRegressionTargets>;
}

export function buildPlaytestRegressionReport(options: PlaytestRegressionOptions): PlaytestRegressionReport {
  if (options.before.artifactId !== options.after.artifactId) {
    throw new Error('regression reports must compare the same artifact');
  }
  const targets = regressionTargets(options.targets ?? {});
  const beforeSeededBugIds = seededBugIds(options.before.issues);
  const afterSeededBugIds = seededBugIds(options.after.issues);
  const resolvedSeededBugIds = beforeSeededBugIds.filter((id) => !afterSeededBugIds.includes(id));
  const persistentSeededBugIds = beforeSeededBugIds.filter((id) => afterSeededBugIds.includes(id));
  const beforeIssueIds = new Set(options.before.issues.map((issue) => issue.id));
  const newIssues = options.after.issues.filter((issue) => !beforeIssueIds.has(issue.id));
  const newCriticalIssues = newIssues.filter((issue) => issue.severity === 'critical').length;
  const completionRegressionBps = completionRegressionBpsFor(options.before, options.after);
  const acceptedSuggestionIds = acceptedSuggestions(options.before, options.after, options.acceptedSuggestionIds ?? []);
  const acceptedSuggestionsApplied = acceptedSuggestionIds.length;
  const issues = regressionIssues({
    targets,
    resolvedSeededBugs: resolvedSeededBugIds.length,
    newCriticalIssues,
    completionRegressionBps,
    acceptedSuggestionsApplied,
    before: options.before,
    after: options.after,
  });
  const checks = regressionChecks(issues, {
    resolvedSeededBugs: resolvedSeededBugIds.length,
    newCriticalIssues,
    completionRegressionBps,
    acceptedSuggestionsApplied,
  });
  const readyForRepeatLoop = checks.every((check) => check.status !== 'fail');
  return {
    readyForRepeatLoop,
    generatedAt: options.generatedAt ?? Date.now(),
    beforeReportId: options.before.id,
    afterReportId: options.after.id,
    artifactId: options.before.artifactId,
    artifactTitle: options.before.artifactTitle,
    targets,
    summary: {
      beforeSeededBugs: beforeSeededBugIds.length,
      afterSeededBugs: afterSeededBugIds.length,
      resolvedSeededBugs: resolvedSeededBugIds.length,
      persistentSeededBugs: persistentSeededBugIds.length,
      newIssueCount: newIssues.length,
      newCriticalIssues,
      beforeCompletedRuns: options.before.completedRuns,
      afterCompletedRuns: options.after.completedRuns,
      completionRegressionBps,
      acceptedSuggestionsApplied,
      targetMet: readyForRepeatLoop,
    },
    resolvedSeededBugIds,
    persistentSeededBugIds,
    newIssueIds: newIssues.map((issue) => issue.id).sort(),
    acceptedSuggestionIds,
    checks,
    issues,
  };
}

export function playtestRegressionMarkdown(report: PlaytestRegressionReport): string {
  const lines = [
    '# Greybox Playtest Regression Proof',
    '',
    `- Ready: ${report.readyForRepeatLoop ? 'yes' : 'no'}`,
    `- Artifact: ${report.artifactTitle}`,
    `- Resolved seeded bugs: ${report.summary.resolvedSeededBugs}`,
    `- Persistent seeded bugs: ${report.summary.persistentSeededBugs}`,
    `- New critical issues: ${report.summary.newCriticalIssues}`,
    `- Completion regression: ${bps(report.summary.completionRegressionBps)}`,
    `- Accepted suggestions applied: ${report.summary.acceptedSuggestionsApplied}`,
    '',
    '## Checks',
    ...report.checks.map((check) => `- [${check.status}] ${check.label}: ${check.detail}`),
    '',
    '## Resolved Seeded Bugs',
    ...(
      report.resolvedSeededBugIds.length > 0
        ? report.resolvedSeededBugIds.map((id) => `- ${id}`)
        : ['- none']
    ),
  ];
  return `${lines.join('\n')}\n`;
}

function regressionTargets(overrides: Partial<PlaytestRegressionTargets>): PlaytestRegressionTargets {
  const targets = { ...DEFAULT_TARGETS, ...overrides };
  for (const [key, value] of Object.entries(targets)) {
    if (!Number.isInteger(value) || value < 0) throw new Error(`${key} must be a non-negative integer`);
  }
  if (targets.maxCompletionRegressionBps > 10_000) {
    throw new Error('maxCompletionRegressionBps must be between 0 and 10000');
  }
  return targets;
}

function seededBugIds(issues: ObservedIssue[]): string[] {
  return Array.from(new Set(issues
    .map((issue) => issue.bugId)
    .filter((bugId): bugId is string => Boolean(bugId))))
    .sort();
}

function acceptedSuggestions(
  before: PlaytestReport,
  after: PlaytestReport,
  explicitIds: string[],
): string[] {
  return Array.from(new Set([
    ...explicitIds,
    ...before.suggestions.filter((suggestion) => suggestion.status === 'accepted').map((suggestion) => suggestion.id),
    ...after.suggestions.filter((suggestion) => suggestion.status === 'accepted').map((suggestion) => suggestion.id),
  ].filter(Boolean))).sort();
}

function completionRegressionBpsFor(before: PlaytestReport, after: PlaytestReport): number {
  if (before.completedRuns <= 0) return 0;
  const lostRuns = Math.max(0, before.completedRuns - after.completedRuns);
  return Math.round((lostRuns / before.completedRuns) * 10_000);
}

function regressionIssues(input: {
  targets: PlaytestRegressionTargets;
  resolvedSeededBugs: number;
  newCriticalIssues: number;
  completionRegressionBps: number;
  acceptedSuggestionsApplied: number;
  before: PlaytestReport;
  after: PlaytestReport;
}): PlaytestRegressionIssue[] {
  const issues: PlaytestRegressionIssue[] = [];
  if (input.resolvedSeededBugs < input.targets.minResolvedSeededBugs) {
    issues.push({
      code: 'resolved_bug_shortfall',
      severity: 'error',
      detail: `Resolved ${input.resolvedSeededBugs} seeded bug(s), below the ${input.targets.minResolvedSeededBugs} target.`,
      remediation: 'Apply accepted tuner diffs and rerun the affected personas until at least one seeded bug clears.',
    });
  }
  if (input.newCriticalIssues > input.targets.maxNewCriticalIssues) {
    issues.push({
      code: 'new_critical_issue',
      severity: 'error',
      detail: `${input.newCriticalIssues} new critical issue(s) appeared after tuning.`,
      remediation: 'Reject or revise the tuner diff before presenting the fix loop as safe.',
    });
  }
  if (input.completionRegressionBps > input.targets.maxCompletionRegressionBps) {
    issues.push({
      code: 'completion_regression',
      severity: 'error',
      detail: `Completion regressed by ${input.completionRegressionBps} bps, above the ${input.targets.maxCompletionRegressionBps} bps limit.`,
      remediation: 'Compare before/after traces and revert tuning changes that reduce completion reliability.',
    });
  }
  if (input.acceptedSuggestionsApplied < input.targets.minAcceptedSuggestionsApplied) {
    issues.push({
      code: 'accepted_suggestion_shortfall',
      severity: 'error',
      detail: `${input.acceptedSuggestionsApplied} accepted suggestion(s) were linked to the rerun, below the ${input.targets.minAcceptedSuggestionsApplied} target.`,
      remediation: 'Attach accepted tuner suggestion ids to the rerun before claiming a closed playtest loop.',
    });
  }
  if (piiDetected([input.before.issues, input.after.issues])) {
    issues.push({
      code: 'pii_evidence_leak',
      severity: 'error',
      detail: 'Before/after issue evidence contains email, phone, or obvious IP-address material.',
      remediation: 'Regenerate regression evidence through the redacted reporter path.',
    });
  }
  return issues;
}

function regressionChecks(
  issues: PlaytestRegressionIssue[],
  summary: {
    resolvedSeededBugs: number;
    newCriticalIssues: number;
    completionRegressionBps: number;
    acceptedSuggestionsApplied: number;
  },
): PlaytestRegressionCheck[] {
  return [
    issueCheck({
      id: 'bug-resolution',
      label: 'Seeded bug resolution',
      issues,
      codes: ['resolved_bug_shortfall'],
      passDetail: `${summary.resolvedSeededBugs} seeded bug(s) resolved after tuning.`,
    }),
    issueCheck({
      id: 'new-critical-safety',
      label: 'No new critical issues',
      issues,
      codes: ['new_critical_issue', 'pii_evidence_leak'],
      passDetail: `${summary.newCriticalIssues} new critical issue(s) and redacted evidence is clean.`,
    }),
    issueCheck({
      id: 'completion-regression',
      label: 'Completion regression',
      issues,
      codes: ['completion_regression'],
      passDetail: `${summary.completionRegressionBps} bps completion regression is within policy.`,
    }),
    issueCheck({
      id: 'accepted-suggestion-link',
      label: 'Accepted suggestion link',
      issues,
      codes: ['accepted_suggestion_shortfall'],
      passDetail: `${summary.acceptedSuggestionsApplied} accepted suggestion(s) linked to the rerun.`,
    }),
  ];
}

function issueCheck(input: {
  id: string;
  label: string;
  issues: PlaytestRegressionIssue[];
  codes: PlaytestRegressionIssue['code'][];
  passDetail: string;
}): PlaytestRegressionCheck {
  const matched = input.issues.filter((issue) => input.codes.includes(issue.code));
  const errors = matched.filter((issue) => issue.severity === 'error').length;
  const warnings = matched.filter((issue) => issue.severity === 'warning').length;
  if (errors > 0) {
    return {
      id: input.id,
      label: input.label,
      status: 'fail',
      detail: `${errors} regression blocker(s) require action.`,
    };
  }
  if (warnings > 0) {
    return {
      id: input.id,
      label: input.label,
      status: 'warn',
      detail: `${warnings} regression warning(s) require review.`,
    };
  }
  return {
    id: input.id,
    label: input.label,
    status: 'pass',
    detail: input.passDetail,
  };
}

function piiDetected(value: unknown): boolean {
  return collectStrings(value).some((item) => (
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu.test(item)
    || /\+?\d[\d ().-]{7,}\d/u.test(item)
    || /\b(?:\d{1,3}\.){3}\d{1,3}\b/u.test(item)
  ));
}

function collectStrings(value: unknown, key = ''): string[] {
  if (/^(id|bugId|targetId|artifactId|reportId|.*Hash|.*Sha256|generatedAt|decidedAt)$/u.test(key)) return [];
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap((item) => collectStrings(item));
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([childKey, child]) => collectStrings(child, childKey));
  }
  return [];
}

function bps(value: number): string {
  return `${Number((value / 100).toFixed(2))}%`;
}
