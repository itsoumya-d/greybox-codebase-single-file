// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { createHash } from 'node:crypto';

import type {
  ObservedIssue,
  PersonaRunTrace,
  PlayableArtifact,
  PlaytestObserver,
  SeededBugKind,
  Severity,
  VisionObservation,
  VisionObservationProvider,
} from '../types.js';
import { redactPlaytestText } from '../privacy/redaction.js';
import { RuleBasedPlaytestObserver } from './ruleObserver.js';

export interface VisionAugmentedObserverOptions {
  provider: VisionObservationProvider;
  baseline?: PlaytestObserver;
  minConfidence?: number;
}

const DEFAULT_MIN_CONFIDENCE = 0.55;

function severityRank(severity: Severity): number {
  return { low: 1, medium: 2, high: 3, critical: 4 }[severity];
}

function higherSeverity(left: Severity, right: Severity): Severity {
  return severityRank(left) >= severityRank(right) ? left : right;
}

function issueKey(issue: ObservedIssue): string {
  if (issue.bugId) return `bug:${issue.bugId}`;
  return `${issue.kind}:${issue.targetId ?? 'global'}:${issue.title.toLowerCase()}`;
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function seededKindFor(artifact: PlayableArtifact, bugId: string | undefined): SeededBugKind | undefined {
  return artifact.seededBugs.find((bug) => bug.id === bugId)?.kind;
}

function knownBugIdFor(artifact: PlayableArtifact, bugId: string | undefined): string | undefined {
  if (!bugId) return undefined;
  return artifact.seededBugs.some((bug) => bug.id === bugId) ? bugId : undefined;
}

function visionIssueId(observationId: string): string {
  return `vision-${createHash('sha256').update(observationId).digest('hex').slice(0, 16)}`;
}

function safeVisionPersonaId(personaId: string, knownPersonaIds: ReadonlySet<string>): string {
  if (knownPersonaIds.has(personaId)) return personaId;
  return `vision-persona-${createHash('sha256').update(personaId).digest('hex').slice(0, 12)}`;
}

function visionIssueFor(
  artifact: PlayableArtifact,
  observation: VisionObservation,
  knownPersonaIds: ReadonlySet<string>,
): ObservedIssue {
  const knownBugId = knownBugIdFor(artifact, observation.bugId);
  const seededKind = seededKindFor(artifact, knownBugId);
  const kind = observation.kind ?? seededKind ?? 'friction';
  const evidence = [
    redactPlaytestText(`Vision frame ${observation.frame.id} at ${observation.frame.atMs}ms (${observation.confidence.toFixed(2)} confidence).`),
    redactPlaytestText(observation.description),
    ...observation.evidence.map(redactPlaytestText),
  ];
  const issue: ObservedIssue = {
    id: visionIssueId(observation.id),
    kind,
    severity: observation.severity,
    title: redactPlaytestText(observation.title),
    affectedPersonas: [safeVisionPersonaId(observation.frame.personaId, knownPersonaIds)],
    evidence,
  };
  if (knownBugId) issue.bugId = knownBugId;
  if (observation.targetId) issue.targetId = redactPlaytestText(observation.targetId);
  return issue;
}

function mergeIssues(left: ObservedIssue, right: ObservedIssue): ObservedIssue {
  return {
    ...left,
    severity: higherSeverity(left.severity, right.severity),
    affectedPersonas: uniqueSorted([...left.affectedPersonas, ...right.affectedPersonas]),
    evidence: uniqueSorted([...left.evidence, ...right.evidence]),
  };
}

export class VisionAugmentedPlaytestObserver implements PlaytestObserver {
  private readonly baseline: PlaytestObserver;
  private readonly minConfidence: number;

  constructor(private readonly options: VisionAugmentedObserverOptions) {
    this.baseline = options.baseline ?? new RuleBasedPlaytestObserver();
    this.minConfidence = options.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
  }

  async inspect(artifact: PlayableArtifact, traces: PersonaRunTrace[]): Promise<ObservedIssue[]> {
    const baselineIssues = await this.baseline.inspect(artifact, traces);
    const observations = await this.options.provider.inspect(artifact, traces);
    const knownPersonaIds = new Set(traces.map((trace) => trace.persona.id));
    const byKey = new Map<string, ObservedIssue>();

    for (const issue of baselineIssues) byKey.set(issueKey(issue), issue);
    for (const observation of observations) {
      if (observation.confidence < this.minConfidence) continue;
      const issue = visionIssueFor(artifact, observation, knownPersonaIds);
      const key = issueKey(issue);
      const existing = byKey.get(key);
      byKey.set(key, existing ? mergeIssues(existing, issue) : issue);
    }

    return [...byKey.values()]
      .sort((left, right) => severityRank(right.severity) - severityRank(left.severity));
  }
}
