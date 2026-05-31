// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import type {
  ObservedIssue,
  PlaytestReport,
  TuningSuggestion,
  TuningSuggestionKind,
} from '../types.js';

function kindForIssue(issue: ObservedIssue): TuningSuggestionKind {
  if (issue.kind === 'readability') return 'hud-scale';
  if (issue.kind === 'balance') return 'enemy-hp';
  if (issue.kind === 'softlock') return 'checkpoint';
  if (issue.kind === 'collision' || issue.kind === 'layout') return 'level-layout';
  if (issue.kind === 'unused-content') return 'level-layout';
  return 'readability';
}

function diffForIssue(issue: ObservedIssue): Record<string, unknown> {
  if (issue.kind === 'readability') {
    return { op: 'set', path: '/hud/lowHealthScale', value: 0.86 };
  }
  if (issue.kind === 'balance') {
    return { op: 'set', path: `/actors/${issue.targetId ?? 'boss'}/health`, value: 2 };
  }
  if (issue.kind === 'softlock') {
    return { op: 'move', path: '/checkpoints/checkpoint-a', after: '/doors/boss-door/open-trigger' };
  }
  if (issue.kind === 'unused-content') {
    return { op: 'set', path: `/level/content/${issue.targetId ?? 'optional-route'}/signposting`, value: 'increase' };
  }
  return { op: 'set', path: `/level/collision/${issue.targetId ?? 'unknown'}/debugVisible`, value: true };
}

export function suggestionsForIssues(issues: ObservedIssue[]): TuningSuggestion[] {
  return issues.slice(0, 8).map((issue, index) => ({
    id: `suggestion-${index + 1}-${issue.id}`,
    kind: kindForIssue(issue),
    title: `Tune ${issue.targetId ?? issue.kind}`,
    rationale: `${issue.title}. Evidence: ${issue.evidence[0] ?? 'playtest issue observed'}`,
    diff: diffForIssue(issue),
    confidence: issue.severity === 'critical' ? 0.94 : issue.severity === 'high' ? 0.86 : 0.72,
    status: 'proposed',
  }));
}

export function recordHumanDecision(
  report: PlaytestReport,
  suggestionId: string,
  decision: 'accepted' | 'rejected',
  decidedBy: string,
  decidedAt = Date.now(),
): PlaytestReport {
  return {
    ...report,
    suggestions: report.suggestions.map((suggestion) =>
      suggestion.id === suggestionId
        ? { ...suggestion, status: decision, decidedBy, decidedAt }
        : suggestion,
    ),
  };
}
