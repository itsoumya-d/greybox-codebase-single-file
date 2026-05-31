// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import type {
  PlaytestBenchmarkCheck,
  PlaytestBenchmarkIssue,
  PlaytestBenchmarkReport,
  PlaytestBenchmarkTargets,
  PlaytestReport,
  UserStudyAcceptanceReport,
} from '../types.js';

const DEFAULT_BENCHMARK_TARGETS: PlaytestBenchmarkTargets = {
  minPersonasRun: 10,
  minCompletedRuns: 5,
  minDurationMs: 10 * 60 * 1_000,
  minSeededBugsIdentified: 3,
  minTuningSuggestions: 1,
  minHumanAcceptedSuggestions: 1,
};

export interface PlaytestBenchmarkOptions {
  report: PlaytestReport;
  acceptanceReport?: UserStudyAcceptanceReport;
  generatedAt?: number;
  targets?: Partial<PlaytestBenchmarkTargets>;
}

export function buildPlaytestBenchmarkReport(options: PlaytestBenchmarkOptions): PlaytestBenchmarkReport {
  const targets = benchmarkTargets(options.targets ?? {});
  const issues: PlaytestBenchmarkIssue[] = [];
  const report = options.report;
  const detectedSeededBugIds = uniqueSorted(report.issues.flatMap((issue) => issue.bugId ? [issue.bugId] : []));
  const completedPersonaIds = uniqueSorted(report.runs
    .filter((run) => run.completed)
    .map((run) => run.persona.id));
  const acceptedSuggestionIds = acceptedSuggestions(report, options.acceptanceReport);
  const humanAcceptedSuggestions = options.acceptanceReport?.summary.acceptedByHumanPlaytester ?? 0;

  if (report.personasRun < targets.minPersonasRun) {
    issues.push({
      code: 'persona_shortfall',
      severity: 'error',
      detail: `Benchmark needs ${targets.minPersonasRun - report.personasRun} more persona run(s).`,
      remediation: 'Run the full alpha persona set before using the benchmark externally.',
    });
  }
  if (report.durationMs < targets.minDurationMs) {
    issues.push({
      code: 'duration_shortfall',
      severity: 'error',
      detail: `Benchmark duration is ${report.durationMs}ms, below ${targets.minDurationMs}ms.`,
      remediation: 'Run the sample for the full 10-minute target slice.',
    });
  }
  if (report.completedRuns < targets.minCompletedRuns) {
    issues.push({
      code: 'completion_shortfall',
      severity: 'error',
      detail: `Benchmark needs ${targets.minCompletedRuns - report.completedRuns} more completed persona run(s).`,
      remediation: 'Tune the sample or runner plan until at least five personas complete the slice.',
    });
  }
  if (detectedSeededBugIds.length < targets.minSeededBugsIdentified) {
    issues.push({
      code: 'seeded_bug_shortfall',
      severity: 'error',
      detail: `Benchmark identified ${detectedSeededBugIds.length} seeded bug(s), below ${targets.minSeededBugsIdentified}.`,
      remediation: 'Improve observer rules or persona coverage until at least three seeded bugs are found.',
    });
  }
  if (report.suggestions.length < targets.minTuningSuggestions) {
    issues.push({
      code: 'tuner_suggestion_shortfall',
      severity: 'error',
      detail: `Benchmark produced ${report.suggestions.length} tuning suggestion(s), below ${targets.minTuningSuggestions}.`,
      remediation: 'Ensure observed issues produce reviewable tuner diffs.',
    });
  }
  if (humanAcceptedSuggestions < targets.minHumanAcceptedSuggestions) {
    issues.push({
      code: 'human_acceptance_missing',
      severity: 'error',
      detail: `Benchmark has ${humanAcceptedSuggestions} human-playtester accepted suggestion(s), below ${targets.minHumanAcceptedSuggestions}.`,
      remediation: 'Collect consented human playtester acceptance evidence for at least one tuner suggestion.',
    });
  }
  if (options.acceptanceReport && piiDetected(options.acceptanceReport)) {
    issues.push({
      code: 'pii_evidence_leak',
      severity: 'error',
      detail: 'Benchmark acceptance evidence contains email, phone, or obvious IP-address material.',
      remediation: 'Regenerate acceptance evidence through the privacy-preserving user-study recorder.',
    });
  }

  const checks = benchmarkChecks(issues, {
    personasRun: report.personasRun,
    completedRuns: report.completedRuns,
    durationMs: report.durationMs,
    seededBugsIdentified: detectedSeededBugIds.length,
    tuningSuggestions: report.suggestions.length,
    humanAcceptedSuggestions,
  }, targets);
  const ready = checks.every((check) => check.status !== 'fail');

  return {
    ready,
    generatedAt: options.generatedAt ?? Date.now(),
    reportId: report.id,
    artifactId: report.artifactId,
    artifactTitle: report.artifactTitle,
    targets,
    summary: {
      personasRun: report.personasRun,
      completedRuns: report.completedRuns,
      durationMs: report.durationMs,
      seededBugsIdentified: detectedSeededBugIds.length,
      tuningSuggestions: report.suggestions.length,
      humanAcceptedSuggestions,
      targetMet: ready,
    },
    completedPersonaIds,
    detectedSeededBugIds,
    acceptedSuggestionIds,
    checks,
    issues,
  };
}

export function playtestBenchmarkMarkdown(report: PlaytestBenchmarkReport): string {
  const lines = [
    `# ${report.artifactTitle} Benchmark Readiness`,
    '',
    `- Ready: ${report.ready ? 'yes' : 'no'}`,
    `- Personas run: ${report.summary.personasRun}`,
    `- Completed runs: ${report.summary.completedRuns}`,
    `- Seeded bugs identified: ${report.summary.seededBugsIdentified}`,
    `- Tuner suggestions: ${report.summary.tuningSuggestions}`,
    `- Human accepted suggestions: ${report.summary.humanAcceptedSuggestions}`,
    '',
    '## Checks',
    ...report.checks.map((check) => `- [${check.status}] ${check.label}: ${check.detail}`),
    '',
    '## Detected Seeded Bugs',
    ...report.detectedSeededBugIds.map((id) => `- ${id}`),
  ];
  return `${lines.join('\n')}\n`;
}

function benchmarkTargets(overrides: Partial<PlaytestBenchmarkTargets>): PlaytestBenchmarkTargets {
  const targets = { ...DEFAULT_BENCHMARK_TARGETS, ...overrides };
  for (const [key, value] of Object.entries(targets)) {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`${key} must be a non-negative integer`);
    }
  }
  return targets;
}

function acceptedSuggestions(
  report: PlaytestReport,
  acceptanceReport: UserStudyAcceptanceReport | undefined,
): string[] {
  const reportAccepted = report.suggestions
    .filter((suggestion) => suggestion.status === 'accepted')
    .map((suggestion) => suggestion.id);
  const studyAccepted = acceptanceReport?.reportId === report.id
    ? acceptanceReport.acceptedSuggestionIds
    : [];
  return uniqueSorted([...reportAccepted, ...studyAccepted]);
}

function benchmarkChecks(
  issues: PlaytestBenchmarkIssue[],
  summary: {
    personasRun: number;
    completedRuns: number;
    durationMs: number;
    seededBugsIdentified: number;
    tuningSuggestions: number;
    humanAcceptedSuggestions: number;
  },
  targets: PlaytestBenchmarkTargets,
): PlaytestBenchmarkCheck[] {
  return [
    issueCheck({
      id: 'persona-coverage',
      label: 'Persona coverage',
      issues,
      codes: ['persona_shortfall'],
      passDetail: `${summary.personasRun} persona run(s) cover the alpha archetype set.`,
    }),
    issueCheck({
      id: 'duration-and-completion',
      label: '10-minute completion target',
      issues,
      codes: ['duration_shortfall', 'completion_shortfall'],
      passDetail: `${summary.completedRuns} completed run(s) over ${summary.durationMs}ms meet the target.`,
    }),
    issueCheck({
      id: 'seeded-bug-detection',
      label: 'Seeded bug detection',
      issues,
      codes: ['seeded_bug_shortfall'],
      passDetail: `${summary.seededBugsIdentified} seeded bug(s) meet the target of ${targets.minSeededBugsIdentified}.`,
    }),
    issueCheck({
      id: 'tuner-output',
      label: 'Tuner output',
      issues,
      codes: ['tuner_suggestion_shortfall'],
      passDetail: `${summary.tuningSuggestions} tuner suggestion(s) are reviewable.`,
    }),
    issueCheck({
      id: 'human-acceptance',
      label: 'Human playtester acceptance',
      issues,
      codes: ['human_acceptance_missing', 'pii_evidence_leak'],
      passDetail: `${summary.humanAcceptedSuggestions} human-playtester accepted suggestion(s) with privacy-preserving evidence.`,
    }),
  ];
}

function issueCheck(input: {
  id: string;
  label: string;
  issues: PlaytestBenchmarkIssue[];
  codes: PlaytestBenchmarkIssue['code'][];
  passDetail: string;
}): PlaytestBenchmarkCheck {
  const matched = input.issues.filter((issue) => input.codes.includes(issue.code));
  const errors = matched.filter((issue) => issue.severity === 'error').length;
  const warnings = matched.filter((issue) => issue.severity === 'warning').length;
  if (errors > 0) {
    return {
      id: input.id,
      label: input.label,
      status: 'fail',
      detail: `${errors} benchmark blocker(s) require action.`,
    };
  }
  if (warnings > 0) {
    return {
      id: input.id,
      label: input.label,
      status: 'warn',
      detail: `${warnings} benchmark warning(s) require review.`,
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
  return collectEvidenceStrings(value).some((item) => (
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu.test(item)
    || /\+?\d[\d ().-]{7,}\d/u.test(item)
    || /\b(?:\d{1,3}\.){3}\d{1,3}\b/u.test(item)
  ));
}

function collectEvidenceStrings(value: unknown, key = ''): string[] {
  if (/^(id|.*Id|.*Hash|.*Sha256|generatedAt|decidedAt)$/u.test(key)) return [];
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap((item) => collectEvidenceStrings(item));
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([childKey, child]) => collectEvidenceStrings(child, childKey));
  }
  return [];
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}
