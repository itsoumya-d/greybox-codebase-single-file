// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { personasForAlpha } from '../personas/index.js';
import {
  buildPlaytestAdoptionReport,
  type PlaytestAdoptionReportOptions,
} from './adoption.js';
import { buildPlaytestBusinessModelProofExport } from './businessProof.js';
import {
  buildPlaytestQaSavingsReport,
  type PlaytestQaSavingsOptions,
} from './qaSavings.js';
import { buildPlaytestRegressionReport } from './regression.js';
import type {
  ObservedIssue,
  PlaytestBusinessModelProofExport,
  PlaytestQaSavingsTargets,
  PlaytestRegressionReport,
  PlaytestReport,
  PlaytestStudioUsageRecord,
  TuningSuggestion,
} from '../types.js';

export const PLAYTEST_BUSINESS_PROOF_REHEARSAL_SCHEMA_VERSION =
  'greybox.playtest.business-proof-rehearsal/v1';

const DEFAULT_GENERATED_AT = Date.UTC(2026, 4, 18, 7);
const DEFAULT_RECORD_COUNT = 350;
const DEFAULT_PAYING_STUDIO_COUNT = 100;
const DEFAULT_ACCEPTED_SUGGESTION_STUDIOS = 24;

export interface PlaytestBusinessProofRehearsalOptions {
  generatedAt?: number;
  recordCount?: number;
  payingStudioCount?: number;
  acceptedSuggestionStudios?: number;
  personasInProduction?: number;
  regressionReady?: boolean;
  unsafeSourceRecord?: boolean;
  adoptionTargets?: PlaytestAdoptionReportOptions['targets'];
  qaTargets?: PlaytestQaSavingsOptions['targets'];
}

export interface PlaytestBusinessProofRehearsalReport {
  schemaVersion: typeof PLAYTEST_BUSINESS_PROOF_REHEARSAL_SCHEMA_VERSION;
  generatedAt: number;
  ready: boolean;
  proof: PlaytestBusinessModelProofExport;
  cloudHandoff: {
    envVar: 'GREYBOX_BUSINESS_MODEL_PROOF_JSON';
    value: string;
  };
  source: {
    adoption: {
      ready: boolean;
      periodLabel: string;
      activeStudios: number;
      payingStudios: number;
      reports: number;
      acceptedSuggestionStudios: number;
      acceptedSuggestions: number;
      shortfalls: Array<{ code: string; severity: string; detail: string }>;
    };
    qaSavings: {
      ready: boolean;
      annualizedSavingsUsd: number;
      replacementBps: number;
      payingStudios: number;
      reports: number;
      acceptedSuggestionStudios: number;
      shortfalls: Array<{ code: string; severity: string; detail: string }>;
    };
    regression: {
      ready: boolean;
      resolvedSeededBugs: number;
      persistentSeededBugs: number;
      newCriticalIssues: number;
      acceptedSuggestionsApplied: number;
      shortfalls: Array<{ code: string; severity: string; detail: string }>;
    };
    personas: {
      inProduction: number;
      required: number;
      ready: boolean;
    };
  };
  warnings: string[];
  disclaimer: string;
}

export function buildPlaytestBusinessProofRehearsal(
  options: PlaytestBusinessProofRehearsalOptions = {},
): PlaytestBusinessProofRehearsalReport {
  const generatedAt = normalizeTimestamp(options.generatedAt ?? DEFAULT_GENERATED_AT, 'generatedAt');
  const recordCount = normalizeNonNegativeInteger(options.recordCount ?? DEFAULT_RECORD_COUNT, 'recordCount');
  const payingStudioCount = normalizeNonNegativeInteger(
    options.payingStudioCount ?? DEFAULT_PAYING_STUDIO_COUNT,
    'payingStudioCount',
  );
  if (recordCount > 0 && payingStudioCount === 0) {
    throw new Error('payingStudioCount must be positive when recordCount is positive');
  }
  const acceptedSuggestionStudios = normalizeNonNegativeInteger(
    options.acceptedSuggestionStudios ?? DEFAULT_ACCEPTED_SUGGESTION_STUDIOS,
    'acceptedSuggestionStudios',
  );
  const requiredPersonas = personasForAlpha().length;
  const personasInProduction = normalizeNonNegativeInteger(
    options.personasInProduction ?? requiredPersonas,
    'personasInProduction',
  );
  const records = rehearsalUsageRecords({
    generatedAt,
    recordCount,
    payingStudioCount,
    acceptedSuggestionStudios,
    unsafeSourceRecord: options.unsafeSourceRecord === true,
  });
  const adoptionOptions: PlaytestAdoptionReportOptions = { generatedAt: generatedAt - 2 * 60 * 60 * 1_000 };
  if (options.adoptionTargets) adoptionOptions.targets = options.adoptionTargets;
  const adoptionReport = buildPlaytestAdoptionReport(records, adoptionOptions);

  const qaOptions: PlaytestQaSavingsOptions = {
    generatedAt: generatedAt - 60 * 60 * 1_000,
    targets: qaTargets(options.qaTargets),
  };
  const qaSavingsReport = buildPlaytestQaSavingsReport(records, qaOptions);
  const regressionReport = rehearsalRegressionReport({
    generatedAt: generatedAt - 30 * 60 * 1_000,
    readyForRepeatLoop: options.regressionReady !== false,
  });
  const proof = buildPlaytestBusinessModelProofExport({
    adoptionReport,
    qaSavingsReport,
    regressionReport,
    personasInProduction,
    generatedAt,
  });
  const ready = proof.source.businessModelReady;
  return {
    schemaVersion: PLAYTEST_BUSINESS_PROOF_REHEARSAL_SCHEMA_VERSION,
    generatedAt,
    ready,
    proof,
    cloudHandoff: {
      envVar: 'GREYBOX_BUSINESS_MODEL_PROOF_JSON',
      value: JSON.stringify(proof),
    },
    source: {
      adoption: {
        ready: adoptionReport.readyForProductionProof,
        periodLabel: adoptionReport.period.label,
        activeStudios: adoptionReport.summary.activeStudios,
        payingStudios: adoptionReport.summary.payingStudios,
        reports: adoptionReport.summary.reports,
        acceptedSuggestionStudios: adoptionReport.summary.acceptedSuggestionStudios,
        acceptedSuggestions: adoptionReport.summary.acceptedSuggestions,
        shortfalls: adoptionReport.shortfalls.map(safeShortfall),
      },
      qaSavings: {
        ready: qaSavingsReport.readyForQaBudgetProof,
        annualizedSavingsUsd: Number((qaSavingsReport.summary.annualizedSavingsCents / 100).toFixed(2)),
        replacementBps: qaSavingsReport.summary.replacementBps,
        payingStudios: qaSavingsReport.summary.payingStudios,
        reports: qaSavingsReport.summary.reports,
        acceptedSuggestionStudios: qaSavingsReport.summary.acceptedSuggestionStudios,
        shortfalls: qaSavingsReport.shortfalls.map(safeShortfall),
      },
      regression: {
        ready: regressionReport.readyForRepeatLoop,
        resolvedSeededBugs: regressionReport.summary.resolvedSeededBugs,
        persistentSeededBugs: regressionReport.summary.persistentSeededBugs,
        newCriticalIssues: regressionReport.summary.newCriticalIssues,
        acceptedSuggestionsApplied: regressionReport.summary.acceptedSuggestionsApplied,
        shortfalls: regressionReport.issues.map(safeShortfall),
      },
      personas: {
        inProduction: personasInProduction,
        required: requiredPersonas,
        ready: personasInProduction >= requiredPersonas,
      },
    },
    warnings: readinessWarnings(proof),
    disclaimer: 'Sanitized playtest business-proof rehearsal. It contains aggregate adoption, QA-savings, regression, and persona-readiness evidence only; raw studio identifiers, contacts, traces, screenshots, prompts, artifacts, and game IP are intentionally omitted.',
  };
}

export function playtestBusinessProofRehearsalMarkdown(
  report: PlaytestBusinessProofRehearsalReport,
): string {
  const lines = [
    '# Greybox Playtest Business Proof Rehearsal',
    '',
    `- Ready: ${report.ready ? 'yes' : 'no'}`,
    `- Schema: ${report.schemaVersion}`,
    `- Cloud env var: ${report.cloudHandoff.envVar}`,
    `- Generated at: ${new Date(report.generatedAt).toISOString()}`,
    '',
    '## Source Readiness',
    `- Adoption: ${report.source.adoption.ready ? 'ready' : 'blocked'} (${report.source.adoption.payingStudios} paying studios, ${report.source.adoption.reports} reports)`,
    `- QA savings: ${report.source.qaSavings.ready ? 'ready' : 'blocked'} ($${report.source.qaSavings.annualizedSavingsUsd.toLocaleString('en-US')} annualized, ${bps(report.source.qaSavings.replacementBps)} replacement)`,
    `- Regression: ${report.source.regression.ready ? 'ready' : 'blocked'} (${report.source.regression.resolvedSeededBugs} seeded bug(s) resolved)`,
    `- Personas: ${report.source.personas.ready ? 'ready' : 'blocked'} (${report.source.personas.inProduction}/${report.source.personas.required})`,
    '',
    '## Warnings',
    ...(report.warnings.length > 0 ? report.warnings.map((warning) => `- ${warning}`) : ['- none']),
    '',
    '## Cloud Proof',
    `- Active paying studios: ${report.proof.playtest.activePayingStudios}`,
    `- Personas in production: ${report.proof.playtest.personasInProduction}`,
    `- Accepted tuning suggestions: ${report.proof.playtest.acceptedTuningSuggestions}`,
    `- Completed runs: ${report.proof.playtest.completedRuns}`,
    `- QA savings: $${report.proof.playtest.qaSavingsUsd.toLocaleString('en-US')}`,
  ];
  return `${lines.join('\n')}\n`;
}

function rehearsalUsageRecords(input: {
  generatedAt: number;
  recordCount: number;
  payingStudioCount: number;
  acceptedSuggestionStudios: number;
  unsafeSourceRecord: boolean;
}): PlaytestStudioUsageRecord[] {
  const studioCount = Math.min(input.recordCount, input.payingStudioCount);
  return Array.from({ length: input.recordCount }, (_, index) => ({
    id: `usage-paid-${index}`,
    studioId: input.unsafeSourceRecord && index === 0
      ? 'qa-director@example.com'
      : `studio_paid_${index % studioCount}`,
    plan: index % 5 === 0 ? 'enterprise' : 'studio',
    reportId: `report-${index}`,
    artifactId: `artifact-${index}`,
    artifactTitle: `Paid Proof ${index}`,
    runAt: rehearsalRunAt(input.generatedAt, index),
    billed: true,
    personasRun: 10,
    completedRuns: 7,
    seededBugsIdentified: 3,
    tuningSuggestions: 2,
    acceptedSuggestions: index < input.acceptedSuggestionStudios ? 1 : 0,
  }));
}

function rehearsalRegressionReport(input: {
  generatedAt: number;
  readyForRepeatLoop: boolean;
}): PlaytestRegressionReport {
  const before = rehearsalPlaytestReport({
    id: 'playtest-regression-before',
    generatedAt: input.generatedAt - 10 * 60 * 1_000,
    completedRuns: 7,
    issues: seededRegressionIssues(),
    suggestionStatus: input.readyForRepeatLoop ? 'accepted' : 'proposed',
  });
  const after = rehearsalPlaytestReport({
    id: 'playtest-regression-after',
    generatedAt: input.generatedAt,
    completedRuns: input.readyForRepeatLoop ? 7 : 4,
    issues: input.readyForRepeatLoop
      ? seededRegressionIssues().filter((issue) => issue.bugId !== 'bug-hud-overlap')
      : seededRegressionIssues(),
    suggestionStatus: input.readyForRepeatLoop ? 'accepted' : 'proposed',
  });
  return buildPlaytestRegressionReport({
    before,
    after,
    acceptedSuggestionIds: input.readyForRepeatLoop ? ['suggestion-hud-scale'] : [],
    generatedAt: input.generatedAt,
  });
}

function rehearsalPlaytestReport(input: {
  id: string;
  generatedAt: number;
  completedRuns: number;
  issues: ObservedIssue[];
  suggestionStatus: TuningSuggestion['status'];
}): PlaytestReport {
  return {
    id: input.id,
    artifactId: 'artifact-regression-proof',
    artifactTitle: 'Regression Proof Slice',
    generatedAt: input.generatedAt,
    durationMs: 10 * 60 * 1_000,
    personasRun: 10,
    completedRuns: input.completedRuns,
    totalDeaths: 6,
    frustrationMoments: 3,
    unusedContentIds: [],
    issues: input.issues,
    suggestions: [
      {
        id: 'suggestion-hud-scale',
        kind: 'hud-scale',
        title: 'Reserve prompt-safe HUD space',
        rationale: 'The low-health warning overlaps the jump prompt in the first playable slice.',
        diff: { hud: { lowHealthScale: 0.86 } },
        confidence: 0.88,
        status: input.suggestionStatus,
      },
    ],
    runs: [],
  };
}

function seededRegressionIssues(): ObservedIssue[] {
  return [
    {
      id: 'issue-invisible-spike-hitbox',
      bugId: 'bug-invisible-spike-hitbox',
      kind: 'collision',
      severity: 'high',
      title: 'Invisible spike hitbox clips the lower bridge',
      evidence: ['Unexpected death on lower bridge with no visible hazard.'],
      affectedPersonas: ['casual', 'explorer'],
      targetId: 'lower-bridge',
    },
    {
      id: 'issue-checkpoint-softlock',
      bugId: 'bug-checkpoint-softlock',
      kind: 'softlock',
      severity: 'critical',
      title: 'Checkpoint respawn can trap the player behind the boss door',
      evidence: ['Respawn loop occurs after checkpoint when the boss door stays closed.'],
      affectedPersonas: ['completionist', 'rage-quitter'],
      targetId: 'checkpoint-a',
    },
    {
      id: 'issue-hud-overlap',
      bugId: 'bug-hud-overlap',
      kind: 'readability',
      severity: 'medium',
      title: 'Low-health HUD overlaps the jump prompt',
      evidence: ['Low-health warning covers the jump prompt during tutorial pacing.'],
      affectedPersonas: ['casual', 'button-masher'],
      targetId: 'hud-low-health',
    },
  ];
}

function qaTargets(overrides: PlaytestQaSavingsOptions['targets']): Partial<PlaytestQaSavingsTargets> {
  return {
    annualQaBudgetCents: 50_000_000,
    targetReplacementBps: 3_000,
    ...(overrides ?? {}),
  };
}

function readinessWarnings(proof: PlaytestBusinessModelProofExport): string[] {
  const warnings: string[] = [];
  if (!proof.source.adoptionReady) warnings.push('adoption proof is not production-ready');
  if (!proof.source.qaSavingsReady) warnings.push('QA-savings proof is not budget-ready');
  if (!proof.source.regressionReady) warnings.push('before/after regression proof is not ready');
  if (!proof.source.personaProductionReady) warnings.push('not all alpha personas are production-ready');
  return warnings;
}

function safeShortfall(input: { code: string; severity: string; detail: string }): {
  code: string;
  severity: string;
  detail: string;
} {
  return {
    code: input.code,
    severity: input.severity,
    detail: input.detail,
  };
}

function rehearsalRunAt(generatedAt: number, index: number): number {
  const date = new Date(generatedAt);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 18, 1, index % 60);
}

function normalizeTimestamp(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} must be a non-negative timestamp`);
  return Math.floor(value);
}

function normalizeNonNegativeInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${label} must be a non-negative integer`);
  return value;
}

function bps(value: number): string {
  return `${(value / 100).toFixed(value % 100 === 0 ? 0 : 2)}%`;
}
