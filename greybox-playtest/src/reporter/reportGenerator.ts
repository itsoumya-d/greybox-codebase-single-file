// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import type {
  ObservedIssue,
  PersonaRunTrace,
  PlayableArtifact,
  PlaytestReport,
} from '../types.js';
import { suggestionsForIssues } from '../tuner/balanceTuner.js';
import { redactPlaytestText } from '../privacy/redaction.js';

export function generatePlaytestReport(options: {
  artifact: PlayableArtifact;
  traces: PersonaRunTrace[];
  issues: ObservedIssue[];
  generatedAt: number;
  durationMs: number;
}): PlaytestReport {
  const unusedContent = new Set<string>();
  let totalDeaths = 0;
  let frustrationMoments = 0;
  let completedRuns = 0;
  for (const trace of options.traces) {
    totalDeaths += trace.metrics.deaths;
    frustrationMoments += trace.metrics.frustrationMoments;
    if (trace.completed) completedRuns += 1;
    for (const contentId of trace.metrics.unusedContentIds) unusedContent.add(contentId);
  }

  return {
    id: `playtest-${options.artifact.id}-${options.generatedAt}`,
    artifactId: options.artifact.id,
    artifactTitle: options.artifact.title,
    generatedAt: options.generatedAt,
    durationMs: options.durationMs,
    personasRun: options.traces.length,
    completedRuns,
    totalDeaths,
    frustrationMoments,
    unusedContentIds: [...unusedContent].sort(),
    issues: options.issues,
    suggestions: suggestionsForIssues(options.issues),
    runs: options.traces,
  };
}

export function reportMarkdown(report: PlaytestReport): string {
  const lines = [
    `# ${redactPlaytestText(report.artifactTitle)} Playtest Report`,
    '',
    `- Personas run: ${report.personasRun}`,
    `- Completed runs: ${report.completedRuns}`,
    `- Deaths: ${report.totalDeaths}`,
    `- Frustration moments: ${report.frustrationMoments}`,
    `- Issues: ${report.issues.length}`,
    '',
    '## Persona Runs',
    ...report.runs.map((run) => {
      const completion = run.metrics.completionTimeMs !== undefined
        ? `completed in ${formatDuration(run.metrics.completionTimeMs)}`
        : 'not completed';
      const unused = run.metrics.unusedContentIds.length > 0
        ? run.metrics.unusedContentIds.map(redactPlaytestText).join(', ')
        : 'none';
      return `- ${redactPlaytestText(run.persona.name)}: ${completion}; deaths ${run.metrics.deaths}; frustration ${run.metrics.frustrationMoments}; unused ${unused}`;
    }),
    '',
    '## Unused Content',
    ...(report.unusedContentIds.length > 0
      ? report.unusedContentIds.map((contentId) => `- ${redactPlaytestText(contentId)}`)
      : ['- none']),
    '',
    '## Top Issues',
    ...report.issues.slice(0, 5).map((issue) =>
      `- [${issue.severity}] ${redactPlaytestText(issue.title)} (${issue.affectedPersonas.map(redactPlaytestText).join(', ')})`,
    ),
    '',
    '## Tuner Suggestions',
    ...report.suggestions.slice(0, 5).map((suggestion) =>
      `- ${redactPlaytestText(suggestion.title)}: ${redactPlaytestText(suggestion.rationale)}`,
    ),
  ];
  return `${lines.join('\n')}\n`;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
