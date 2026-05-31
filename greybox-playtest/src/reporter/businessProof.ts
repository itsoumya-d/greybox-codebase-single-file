// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { personasForAlpha } from '../personas/index.js';
import type {
  PlaytestAdoptionReport,
  PlaytestBusinessModelProofExport,
  PlaytestQaSavingsReport,
  PlaytestRegressionReport,
} from '../types.js';

export interface PlaytestBusinessModelProofOptions {
  adoptionReport: PlaytestAdoptionReport;
  qaSavingsReport?: PlaytestQaSavingsReport;
  regressionReport?: PlaytestRegressionReport;
  personasInProduction?: number;
  generatedAt?: number;
}

export function buildPlaytestBusinessModelProofExport(
  options: PlaytestBusinessModelProofOptions,
): PlaytestBusinessModelProofExport {
  const requiredPersonasInProduction = personasForAlpha().length;
  const requestedPersonas = options.personasInProduction;
  const personasInProduction = typeof requestedPersonas === 'number'
    && Number.isInteger(requestedPersonas)
    && requestedPersonas >= 0
    ? requestedPersonas
    : requiredPersonasInProduction;
  const generatedAt = typeof options.generatedAt === 'number'
    ? options.generatedAt
    : Math.max(
      options.adoptionReport.generatedAt,
      options.qaSavingsReport?.generatedAt ?? 0,
      options.regressionReport?.generatedAt ?? 0,
    );
  const adoptionReady = options.adoptionReport.readyForProductionProof;
  const qaSavingsReady = options.qaSavingsReport?.readyForQaBudgetProof === true;
  const regressionReady = options.regressionReport?.readyForRepeatLoop === true;
  const personaProductionReady = personasInProduction >= requiredPersonasInProduction;
  const businessModelReady = adoptionReady && qaSavingsReady && regressionReady && personaProductionReady;
  return {
    playtest: {
      activePayingStudios: businessModelReady ? options.adoptionReport.summary.payingStudios : 0,
      personasInProduction: businessModelReady ? personasInProduction : 0,
      acceptedTuningSuggestions: businessModelReady ? options.adoptionReport.summary.acceptedSuggestions : 0,
      completedRuns: businessModelReady ? options.adoptionReport.summary.completedRuns : 0,
      qaSavingsUsd: businessModelReady
        ? Number(((options.qaSavingsReport?.summary.annualizedSavingsCents ?? 0) / 100).toFixed(2))
        : 0,
      sourceBusinessModelReady: businessModelReady,
    },
    source: {
      reports: ['playtest-adoption', 'playtest-qa-savings', 'playtest-regression'],
      generatedAt,
      adoptionPeriod: options.adoptionReport.period,
      adoptionReady,
      qaSavingsReady,
      regressionReady,
      personaProductionReady,
      businessModelReady,
    },
    disclaimer: 'Playtest business-model proof is sanitized aggregate evidence for GREYBOX_BUSINESS_MODEL_PROOF_JSON. It requires adoption, QA-savings, and before/after regression proof, and excludes studio ids, external contacts, raw traces, screenshots, prompts, artifacts, and game IP.',
  };
}
