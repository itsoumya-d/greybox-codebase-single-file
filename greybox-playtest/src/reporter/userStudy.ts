// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { createHash } from 'node:crypto';
import type {
  PlaytestReport,
  TuningSuggestion,
  UserStudyAcceptanceReport,
  UserStudyDecisionRecord,
  UserStudyParticipantRole,
} from '../types.js';
import { recordHumanDecision } from '../tuner/balanceTuner.js';
import { redactPlaytestText } from '../privacy/redaction.js';

export interface UserStudyDecisionInput {
  studyId: string;
  suggestionId: string;
  participantExternalId: string;
  participantRole: UserStudyParticipantRole;
  decision: 'accepted' | 'rejected';
  decidedAt: number;
  consentConfirmed: boolean;
  notes?: string;
}

export function recordUserStudyDecision(
  report: PlaytestReport,
  input: UserStudyDecisionInput,
): UserStudyDecisionRecord {
  const suggestion = report.suggestions.find((item) => item.id === input.suggestionId);
  if (!suggestion) throw new Error(`Unknown tuning suggestion: ${input.suggestionId}`);
  if (!input.consentConfirmed) throw new Error('User-study decision requires explicit participant consent.');
  if (!input.participantExternalId.trim()) throw new Error('participantExternalId is required.');

  const participantHash = hashStable(`${input.studyId}:${input.participantExternalId.trim().toLowerCase()}`);
  return {
    id: `study-decision-${input.studyId}-${input.suggestionId}-${participantHash.slice(0, 12)}`,
    studyId: input.studyId,
    reportId: report.id,
    artifactId: report.artifactId,
    suggestionId: suggestion.id,
    suggestionKind: suggestion.kind,
    suggestionTitle: suggestion.title,
    suggestionDiffSha256: suggestionDiffHash(suggestion),
    participantHash,
    participantRole: input.participantRole,
    decision: input.decision,
    decidedAt: input.decidedAt,
    consentConfirmed: true,
    ...(input.notes ? { notes: sanitizeStudyNotes(input.notes) } : {}),
  };
}

export function buildUserStudyAcceptanceReport(options: {
  report: PlaytestReport;
  decisions: UserStudyDecisionRecord[];
  studyId: string;
  generatedAt: number;
  requiredHumanAccepted?: number;
}): UserStudyAcceptanceReport {
  const scoped = options.decisions
    .filter((decision) => decision.studyId === options.studyId && decision.reportId === options.report.id)
    .sort((a, b) => a.decidedAt - b.decidedAt || a.id.localeCompare(b.id));
  const accepted = scoped.filter((decision) => decision.decision === 'accepted');
  const rejected = scoped.filter((decision) => decision.decision === 'rejected');
  const participants = new Set(scoped.map((decision) => decision.participantHash));
  const acceptedByHumanPlaytester = accepted.filter((decision) => decision.participantRole === 'human-playtester').length;
  const requiredHumanAccepted = options.requiredHumanAccepted ?? 1;

  return {
    id: `study-${options.studyId}-${options.report.artifactId}-${options.generatedAt}`,
    studyId: options.studyId,
    reportId: options.report.id,
    artifactId: options.report.artifactId,
    generatedAt: options.generatedAt,
    summary: {
      decisions: scoped.length,
      participants: participants.size,
      accepted: accepted.length,
      rejected: rejected.length,
      acceptanceRate: scoped.length === 0 ? 0 : accepted.length / scoped.length,
      acceptedByHumanPlaytester,
      targetMet: acceptedByHumanPlaytester >= requiredHumanAccepted,
    },
    acceptedSuggestionIds: uniqueSorted(accepted.map((decision) => decision.suggestionId)),
    rejectedSuggestionIds: uniqueSorted(rejected.map((decision) => decision.suggestionId)),
    decisions: scoped,
  };
}

export function applyUserStudyDecisions(
  report: PlaytestReport,
  decisions: UserStudyDecisionRecord[],
): PlaytestReport {
  return decisions
    .filter((decision) => decision.reportId === report.id)
    .sort((a, b) => a.decidedAt - b.decidedAt)
    .reduce((current, decision) => recordHumanDecision(
      current,
      decision.suggestionId,
      decision.decision,
      `participant:${decision.participantHash.slice(0, 12)}`,
      decision.decidedAt,
    ), report);
}

export function userStudyAcceptanceMarkdown(report: UserStudyAcceptanceReport): string {
  const lines = [
    `# User Study ${report.studyId} Acceptance Evidence`,
    '',
    `- Decisions: ${report.summary.decisions}`,
    `- Participants: ${report.summary.participants}`,
    `- Accepted: ${report.summary.accepted}`,
    `- Rejected: ${report.summary.rejected}`,
    `- Human playtester accepted suggestions: ${report.summary.acceptedByHumanPlaytester}`,
    `- Target met: ${report.summary.targetMet ? 'yes' : 'no'}`,
    '',
    '## Accepted Suggestions',
    ...report.acceptedSuggestionIds.map((id) => `- ${id}`),
  ];
  return `${lines.join('\n')}\n`;
}

function suggestionDiffHash(suggestion: TuningSuggestion): string {
  return hashStable(stableJson(suggestion.diff));
}

function hashStable(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sanitizeStudyNotes(value: string): string {
  return redactPlaytestText(value).slice(0, 280);
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}
