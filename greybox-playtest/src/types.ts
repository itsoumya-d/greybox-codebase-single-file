// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

export type PersonaInputStyle =
  | 'precision'
  | 'exploratory'
  | 'completionist'
  | 'chaotic'
  | 'stealth'
  | 'optimization'
  | 'casual';

export interface PlaytestPersona {
  id: string;
  name: string;
  description: string;
  primaryGoal: string;
  inputStyle: PersonaInputStyle;
  patience: number;
  riskTolerance: number;
  thoroughness: number;
  tags: string[];
}

export type SeededBugKind =
  | 'collision'
  | 'softlock'
  | 'readability'
  | 'balance'
  | 'progression'
  | 'layout';

export type Severity = 'low' | 'medium' | 'high' | 'critical';

export interface SeededBug {
  id: string;
  label: string;
  kind: SeededBugKind;
  severity: Severity;
  targetId: string;
  triggerAtMs: number;
  detectorHints: string[];
  suggestedFix: string;
}

export interface PlayableArtifact {
  id: string;
  title: string;
  engine: 'html-canvas' | 'phaser' | 'threejs' | 'unity-webgl' | 'custom';
  url?: string;
  html?: string;
  durationTargetMs: number;
  contentIds: string[];
  seededBugs: SeededBug[];
}

export type PlaytestEventType =
  | 'run-started'
  | 'input'
  | 'checkpoint'
  | 'death'
  | 'frustration'
  | 'bug-signal'
  | 'unused-content'
  | 'completion'
  | 'run-ended';

export interface PlaytestEvent {
  id: string;
  atMs: number;
  type: PlaytestEventType;
  message: string;
  targetId?: string;
  severity?: Severity;
  metadata?: Record<string, unknown>;
}

export interface PlaytestMetrics {
  inputs: number;
  deaths: number;
  frustrationMoments: number;
  completionTimeMs?: number;
  unusedContentIds: string[];
  bugsObserved: string[];
}

export interface PersonaRunTrace {
  artifactId: string;
  persona: PlaytestPersona;
  durationMs: number;
  completed: boolean;
  events: PlaytestEvent[];
  metrics: PlaytestMetrics;
}

export interface PlaytestRunRequest {
  artifact: PlayableArtifact;
  persona: PlaytestPersona;
  durationMs: number;
}

export interface PlaytestRunner {
  run(request: PlaytestRunRequest): Promise<PersonaRunTrace>;
}

export type PersonaInputActionType =
  | 'key'
  | 'click'
  | 'wait';

export interface PersonaInputAction {
  atMs: number;
  type: PersonaInputActionType;
  key?: string;
  x?: number;
  y?: number;
  durationMs?: number;
  label: string;
}

export interface ObservedIssue {
  id: string;
  bugId?: string;
  kind: SeededBugKind | 'friction' | 'unused-content';
  severity: Severity;
  title: string;
  evidence: string[];
  affectedPersonas: string[];
  targetId?: string;
}

export interface PlaytestObserver {
  inspect(artifact: PlayableArtifact, traces: PersonaRunTrace[]): ObservedIssue[] | Promise<ObservedIssue[]>;
}

export interface VisionFrameReference {
  id: string;
  artifactId: string;
  personaId: string;
  atMs: number;
  source: 'screenshot' | 'video-frame' | 'external';
  imageSha256?: string;
}

export interface VisionObservation {
  id: string;
  frame: VisionFrameReference;
  title: string;
  description: string;
  severity: Severity;
  confidence: number;
  kind?: SeededBugKind | 'friction' | 'unused-content';
  bugId?: string;
  targetId?: string;
  evidence: string[];
}

export interface VisionObservationProvider {
  inspect(artifact: PlayableArtifact, traces: PersonaRunTrace[]): VisionObservation[] | Promise<VisionObservation[]>;
}

export type TuningSuggestionKind =
  | 'hud-scale'
  | 'enemy-hp'
  | 'drop-rate'
  | 'level-layout'
  | 'checkpoint'
  | 'readability';

export interface TuningSuggestion {
  id: string;
  kind: TuningSuggestionKind;
  title: string;
  rationale: string;
  diff: Record<string, unknown>;
  confidence: number;
  status: 'proposed' | 'accepted' | 'rejected';
  decidedBy?: string;
  decidedAt?: number;
}

export type UserStudyParticipantRole =
  | 'human-playtester'
  | 'designer'
  | 'qa'
  | 'producer';

export interface UserStudyDecisionRecord {
  id: string;
  studyId: string;
  reportId: string;
  artifactId: string;
  suggestionId: string;
  suggestionKind: TuningSuggestionKind;
  suggestionTitle: string;
  suggestionDiffSha256: string;
  participantHash: string;
  participantRole: UserStudyParticipantRole;
  decision: 'accepted' | 'rejected';
  decidedAt: number;
  consentConfirmed: true;
  notes?: string;
}

export interface UserStudyAcceptanceReport {
  id: string;
  studyId: string;
  reportId: string;
  artifactId: string;
  generatedAt: number;
  summary: {
    decisions: number;
    participants: number;
    accepted: number;
    rejected: number;
    acceptanceRate: number;
    acceptedByHumanPlaytester: number;
    targetMet: boolean;
  };
  acceptedSuggestionIds: string[];
  rejectedSuggestionIds: string[];
  decisions: UserStudyDecisionRecord[];
}

export interface PlaytestBenchmarkTargets {
  minPersonasRun: number;
  minCompletedRuns: number;
  minDurationMs: number;
  minSeededBugsIdentified: number;
  minTuningSuggestions: number;
  minHumanAcceptedSuggestions: number;
}

export type PlaytestBenchmarkStatus = 'pass' | 'warn' | 'fail';

export interface PlaytestBenchmarkCheck {
  id: string;
  label: string;
  status: PlaytestBenchmarkStatus;
  detail: string;
}

export interface PlaytestBenchmarkIssue {
  code:
    | 'persona_shortfall'
    | 'duration_shortfall'
    | 'completion_shortfall'
    | 'seeded_bug_shortfall'
    | 'tuner_suggestion_shortfall'
    | 'human_acceptance_missing'
    | 'pii_evidence_leak';
  severity: 'warning' | 'error';
  detail: string;
  remediation?: string;
}

export interface PlaytestBenchmarkReport {
  ready: boolean;
  generatedAt: number;
  reportId: string;
  artifactId: string;
  artifactTitle: string;
  targets: PlaytestBenchmarkTargets;
  summary: {
    personasRun: number;
    completedRuns: number;
    durationMs: number;
    seededBugsIdentified: number;
    tuningSuggestions: number;
    humanAcceptedSuggestions: number;
    targetMet: boolean;
  };
  completedPersonaIds: string[];
  detectedSeededBugIds: string[];
  acceptedSuggestionIds: string[];
  checks: PlaytestBenchmarkCheck[];
  issues: PlaytestBenchmarkIssue[];
}

export type PlaytestStudioPlan = 'free' | 'indie' | 'studio' | 'enterprise';

export interface PlaytestStudioUsageRecord {
  id: string;
  studioId: string;
  plan: PlaytestStudioPlan;
  reportId: string;
  artifactId: string;
  artifactTitle: string;
  runAt: number;
  billed: boolean;
  personasRun: number;
  completedRuns: number;
  seededBugsIdentified: number;
  tuningSuggestions: number;
  acceptedSuggestions: number;
}

export interface PlaytestAdoptionTargets {
  activeStudios: number;
  payingStudios: number;
  reports: number;
  acceptedSuggestionStudios: number;
  minReportsPerPayingStudio: number;
}

export interface PlaytestAdoptionStudioSummary {
  studioId: string;
  plan: PlaytestStudioPlan;
  paying: boolean;
  reports: number;
  personasRun: number;
  completedRuns: number;
  seededBugsIdentified: number;
  tuningSuggestions: number;
  acceptedSuggestions: number;
  lastRunAt: number;
}

export interface PlaytestAdoptionShortfall {
  code:
    | 'active_studio_shortfall'
    | 'paying_studio_shortfall'
    | 'report_shortfall'
    | 'accepted_suggestion_studio_shortfall'
    | 'paying_studio_usage_shortfall'
    | 'pii_evidence_leak';
  severity: 'warning' | 'error';
  detail: string;
  remediation?: string;
}

export interface PlaytestAdoptionReport {
  readyForProductionProof: boolean;
  generatedAt: number;
  period: {
    from: number;
    to: number;
    label: string;
  };
  targets: PlaytestAdoptionTargets;
  summary: {
    activeStudios: number;
    payingStudios: number;
    reports: number;
    personasRun: number;
    completedRuns: number;
    seededBugsIdentified: number;
    tuningSuggestions: number;
    acceptedSuggestionStudios: number;
    acceptedSuggestions: number;
    payingStudiosBelowUsageMinimum: number;
  };
  studios: PlaytestAdoptionStudioSummary[];
  shortfalls: PlaytestAdoptionShortfall[];
}

export interface PlaytestQaSavingsAssumptions {
  qaHourlyCostCents: number;
  manualRegressionMinutesPerPersona: number;
  manualBugTriageMinutes: number;
  manualTuningReviewMinutes: number;
  automationCreditBps: number;
}

export interface PlaytestQaSavingsTargets {
  annualQaBudgetCents: number;
  targetReplacementBps: number;
  minimumPayingStudios: number;
  minimumReports: number;
  minimumAcceptedSuggestionStudios: number;
}

export interface PlaytestQaSavingsStudioSummary {
  studioId: string;
  plan: PlaytestStudioPlan;
  paying: boolean;
  reports: number;
  personasRun: number;
  seededBugsIdentified: number;
  acceptedSuggestions: number;
  grossAvoidedMinutes: number;
  creditedAvoidedMinutes: number;
  estimatedSavingsCents: number;
}

export interface PlaytestQaSavingsShortfall {
  code:
    | 'replacement_shortfall'
    | 'paying_studio_shortfall'
    | 'report_shortfall'
    | 'accepted_suggestion_studio_shortfall'
    | 'pii_evidence_leak';
  severity: 'warning' | 'error';
  detail: string;
  remediation?: string;
}

export interface PlaytestQaSavingsReport {
  readyForQaBudgetProof: boolean;
  generatedAt: number;
  period: {
    from: number;
    to: number;
    label: string;
  };
  assumptions: PlaytestQaSavingsAssumptions;
  targets: PlaytestQaSavingsTargets;
  summary: {
    payingStudios: number;
    reports: number;
    acceptedSuggestionStudios: number;
    personasRun: number;
    seededBugsIdentified: number;
    acceptedSuggestions: number;
    grossAvoidedMinutes: number;
    creditedAvoidedMinutes: number;
    estimatedMonthlySavingsCents: number;
    annualizedSavingsCents: number;
    replacementBps: number;
    targetMet: boolean;
  };
  studios: PlaytestQaSavingsStudioSummary[];
  shortfalls: PlaytestQaSavingsShortfall[];
}

export interface PlaytestBusinessModelProofExport {
  playtest: {
    activePayingStudios: number;
    personasInProduction: number;
    acceptedTuningSuggestions: number;
    completedRuns: number;
    qaSavingsUsd: number;
    sourceBusinessModelReady: boolean;
  };
  source: {
    reports: ['playtest-adoption', 'playtest-qa-savings', 'playtest-regression'];
    generatedAt: number;
    adoptionPeriod: PlaytestAdoptionReport['period'];
    adoptionReady: boolean;
    qaSavingsReady: boolean;
    regressionReady: boolean;
    personaProductionReady: boolean;
    businessModelReady: boolean;
  };
  disclaimer: string;
}

export interface PlaytestRegressionTargets {
  minResolvedSeededBugs: number;
  maxNewCriticalIssues: number;
  maxCompletionRegressionBps: number;
  minAcceptedSuggestionsApplied: number;
}

export interface PlaytestRegressionCheck {
  id: string;
  label: string;
  status: 'pass' | 'warn' | 'fail';
  detail: string;
}

export interface PlaytestRegressionIssue {
  code:
    | 'resolved_bug_shortfall'
    | 'new_critical_issue'
    | 'completion_regression'
    | 'accepted_suggestion_shortfall'
    | 'pii_evidence_leak';
  severity: 'warning' | 'error';
  detail: string;
  remediation?: string;
}

export interface PlaytestRegressionReport {
  readyForRepeatLoop: boolean;
  generatedAt: number;
  beforeReportId: string;
  afterReportId: string;
  artifactId: string;
  artifactTitle: string;
  targets: PlaytestRegressionTargets;
  summary: {
    beforeSeededBugs: number;
    afterSeededBugs: number;
    resolvedSeededBugs: number;
    persistentSeededBugs: number;
    newIssueCount: number;
    newCriticalIssues: number;
    beforeCompletedRuns: number;
    afterCompletedRuns: number;
    completionRegressionBps: number;
    acceptedSuggestionsApplied: number;
    targetMet: boolean;
  };
  resolvedSeededBugIds: string[];
  persistentSeededBugIds: string[];
  newIssueIds: string[];
  acceptedSuggestionIds: string[];
  checks: PlaytestRegressionCheck[];
  issues: PlaytestRegressionIssue[];
}

export interface PlaytestReport {
  id: string;
  artifactId: string;
  artifactTitle: string;
  generatedAt: number;
  durationMs: number;
  personasRun: number;
  completedRuns: number;
  totalDeaths: number;
  frustrationMoments: number;
  unusedContentIds: string[];
  issues: ObservedIssue[];
  suggestions: TuningSuggestion[];
  runs: PersonaRunTrace[];
}

export interface PlaytestLoopRequest {
  artifact: PlayableArtifact;
  personas: PlaytestPersona[];
  durationMs: number;
  runner?: PlaytestRunner;
  observer?: PlaytestObserver;
  now?: () => number;
  concurrency?: number;
}
