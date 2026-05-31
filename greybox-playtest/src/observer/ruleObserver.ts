// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import type {
  ObservedIssue,
  PersonaRunTrace,
  PlayableArtifact,
  PlaytestObserver,
  SeededBug,
  Severity,
} from '../types.js';

function severityRank(severity: Severity): number {
  return { low: 1, medium: 2, high: 3, critical: 4 }[severity];
}

function issueForBug(bug: SeededBug, traces: PersonaRunTrace[]): ObservedIssue | null {
  const affected = traces.filter((trace) => trace.metrics.bugsObserved.includes(bug.id));
  if (affected.length === 0) return null;
  return {
    id: `issue-${bug.id}`,
    bugId: bug.id,
    kind: bug.kind,
    severity: bug.severity,
    title: bug.label,
    targetId: bug.targetId,
    affectedPersonas: affected.map((trace) => trace.persona.id),
    evidence: affected.flatMap((trace) =>
      trace.events
        .filter((event) => event.metadata?.bugId === bug.id)
        .map((event) => `${trace.persona.name}: ${event.message}`),
    ),
  };
}

export class RuleBasedPlaytestObserver implements PlaytestObserver {
  inspect(artifact: PlayableArtifact, traces: PersonaRunTrace[]): ObservedIssue[] {
    const bugIssues = artifact.seededBugs
      .map((bug) => issueForBug(bug, traces))
      .filter((issue): issue is ObservedIssue => Boolean(issue));

    const unused = new Map<string, string[]>();
    for (const trace of traces) {
      for (const contentId of trace.metrics.unusedContentIds) {
        const list = unused.get(contentId) ?? [];
        list.push(trace.persona.id);
        unused.set(contentId, list);
      }
    }
    const unusedIssues: ObservedIssue[] = [...unused.entries()]
      .filter(([, personas]) => personas.length >= Math.max(2, Math.ceil(traces.length * 0.25)))
      .map(([contentId, personas]) => ({
        id: `issue-unused-${contentId}`,
        kind: 'unused-content',
        severity: personas.length > traces.length / 2 ? 'medium' : 'low',
        title: `Content node ${contentId} is being missed by playtesters`,
        targetId: contentId,
        affectedPersonas: personas,
        evidence: [`${personas.length}/${traces.length} personas skipped ${contentId}.`],
      }));

    const frictionIssues: ObservedIssue[] = traces
      .filter((trace) => trace.metrics.frustrationMoments >= 2 || trace.metrics.deaths >= 3)
      .map((trace) => ({
        id: `issue-friction-${trace.persona.id}`,
        kind: 'friction',
        severity: trace.metrics.deaths >= 3 ? 'high' : 'medium',
        title: `${trace.persona.name} hit repeated friction`,
        affectedPersonas: [trace.persona.id],
        evidence: [
          `${trace.metrics.deaths} deaths, ${trace.metrics.frustrationMoments} frustration moments.`,
        ],
      }));

    return [...bugIssues, ...unusedIssues, ...frictionIssues]
      .sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
  }
}
