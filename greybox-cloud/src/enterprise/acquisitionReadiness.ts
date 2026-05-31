// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import type {
  EnterpriseLogoExpansionReport,
  EnterpriseLogoExpansionStatus,
} from './enterpriseLogoExpansion.js';
import type {
  CommercialCreditReport,
  CommercialCreditStatus,
} from './commercialCredits.js';
import type {
  StrategicOutreachReport,
  StrategicOutreachStatus,
} from './strategicOutreach.js';
import type {
  UnityPluginAdoptionReport,
  UnityPluginAdoptionStatus,
} from './unityPluginAdoption.js';
import type {
  BusinessModelProofReport,
  BusinessModelProofStatus,
} from './businessModelProof.js';
import type {
  EngineExpansionReadinessReport,
  EngineExpansionStatus,
} from './engineExpansionReadiness.js';
import type {
  CertificationMilestone,
  CertificationRoadmapReport,
} from './certificationRoadmap.js';
import type {
  SalesMotionReadinessReport,
  SalesMotionReadinessStatus,
} from './salesMotionReadiness.js';
import type { NorthStarReport } from '../analytics/northStar.js';

export type AcquisitionReadinessStatus = 'pass' | 'warn' | 'fail';
export type Iso27001Status = 'not-started' | 'planned' | 'in-progress' | 'achieved';

export interface AcquisitionReadinessMetricInput {
  arrUsd?: number;
  yoyGrowthRate?: number;
  nrr?: number;
  weeklyActiveDesignersShippingToEngines?: number;
  unityVerifiedSolution?: boolean;
  shippedCommercialGameCredits?: number;
  enterpriseLogos?: number;
  soc2Type2Achieved?: boolean;
  iso27001Status?: Iso27001Status;
  cleanCapTable?: boolean;
  strategicConversations?: number;
  termSheetValuationUsd?: number;
  seriesBPostMoneyUsd?: number;
  managedInferenceArrUsd?: number;
  proModuleRevenueShare?: number;
  marketplaceGmvMonthlyUsd?: number;
  payingUnityPluginCustomers?: number;
  activePlaytestStudios?: number;
}

export interface AcquisitionReadinessMetrics {
  arrUsd: number;
  yoyGrowthRate: number;
  nrr: number;
  weeklyActiveDesignersShippingToEngines: number;
  unityVerifiedSolution: boolean;
  shippedCommercialGameCredits: number;
  enterpriseLogos: number;
  soc2Type2Achieved: boolean;
  iso27001Status: Iso27001Status;
  cleanCapTable: boolean;
  strategicConversations: number;
  termSheetValuationUsd: number;
  seriesBPostMoneyUsd: number;
  managedInferenceArrUsd: number;
  proModuleRevenueShare: number;
  marketplaceGmvMonthlyUsd: number;
  payingUnityPluginCustomers: number;
  activePlaytestStudios: number;
}

export interface AcquisitionReadinessCheck {
  id: string;
  label: string;
  status: AcquisitionReadinessStatus;
  current: string;
  target: string;
  owner: string;
  detail: string;
  evidence: string[];
  remediation?: string;
}

export interface AcquisitionReadinessReport {
  generatedAt: string;
  disclaimer: string;
  targetValuationBandUsd: {
    low: number;
    high: number;
  };
  targetAcquirers: string[];
  metrics: AcquisitionReadinessMetrics;
  summary: {
    checks: number;
    pass: number;
    warn: number;
    fail: number;
    readyForStrategicProcess: boolean;
    exitOutcomeSecured: boolean;
    missionCompleteCandidate: boolean;
    acquisitionPitchChecksPassed: number;
    acquisitionPitchChecks: number;
    salesMotionStatus: SalesMotionReadinessStatus | 'fail';
    revenueEvidenceReady: boolean;
    enterpriseLogoExpansionStatus: EnterpriseLogoExpansionStatus;
    enterpriseLogoScaleReady: boolean;
    nrrExpansionEvidenceReady: boolean;
    commercialCreditStatus: CommercialCreditStatus;
    commercialCreditNarrativeReady: boolean;
    strategicOutreachStatus: StrategicOutreachStatus;
    strategicConversationEvidenceReady: boolean;
    valuationOutcomeEvidenceReady: boolean;
    trustCertificationEvidenceReady: boolean;
    northStarEngineShippingReady: boolean;
    unityAdoptionStatus: UnityPluginAdoptionStatus;
    unityPluginAcquisitionReady: boolean;
    businessModelProofStatus: BusinessModelProofStatus;
    managedInferenceReady: boolean;
    proModuleRevenueReady: boolean;
    marketplaceGmvReady: boolean;
    playtestAdoptionReady: boolean;
    engineExpansionStatus: EngineExpansionStatus;
    triEngineAcquisitionReady: boolean;
  };
  checks: AcquisitionReadinessCheck[];
  salesMotion?: SalesMotionReadinessReport['summary'];
  enterpriseLogoExpansion?: EnterpriseLogoExpansionReport['summary'];
  commercialCredits?: CommercialCreditReport['summary'];
  strategicOutreach?: StrategicOutreachReport['summary'];
  certificationRoadmap?: CertificationRoadmapReport['summary'];
  northStar?: NorthStarReport['summary'];
  unityAdoption?: UnityPluginAdoptionReport['summary'];
  businessModelProof?: BusinessModelProofReport['summary'];
  engineExpansion?: EngineExpansionReadinessReport['summary'];
  pitch: string;
}

const ACQUISITION_PITCH_CHECK_IDS = new Set([
  'arr-run-rate',
  'yoy-growth',
  'nrr',
  'weekly-active-engine-designers',
  'unity-verified-solution',
  'commercial-game-credits',
  'enterprise-logos',
  'trust-certifications',
  'clean-cap-table',
  'strategic-conversations',
  'tri-engine-runtime-proof',
]);

const isoStatuses = new Set<Iso27001Status>(['not-started', 'planned', 'in-progress', 'achieved']);

export function acquisitionMetricsFromEnv(
  env: Record<string, string | undefined> = process.env,
): AcquisitionReadinessMetricInput {
  return parseAcquisitionMetricsJson(env.GREYBOX_ACQUISITION_METRICS_JSON);
}

export function parseAcquisitionMetricsJson(value: string | undefined): AcquisitionReadinessMetricInput {
  if (!value?.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? parsed as AcquisitionReadinessMetricInput : {};
  } catch {
    return {};
  }
}

export function buildAcquisitionReadinessReport(options: {
  metrics?: AcquisitionReadinessMetricInput;
  salesMotionReadinessReport?: SalesMotionReadinessReport;
  enterpriseLogoExpansionReport?: EnterpriseLogoExpansionReport;
  commercialCreditReport?: CommercialCreditReport;
  strategicOutreachReport?: StrategicOutreachReport;
  certificationRoadmapReport?: CertificationRoadmapReport;
  northStarReport?: NorthStarReport;
  unityAdoptionReport?: UnityPluginAdoptionReport;
  businessModelProofReport?: BusinessModelProofReport;
  engineExpansionReport?: EngineExpansionReadinessReport;
  now?: Date;
} = {}): AcquisitionReadinessReport {
  const now = options.now ?? new Date();
  const salesMotion = options.salesMotionReadinessReport;
  const enterpriseLogoExpansion = options.enterpriseLogoExpansionReport;
  const commercialCredits = options.commercialCreditReport;
  const strategicOutreach = options.strategicOutreachReport;
  const certificationRoadmap = options.certificationRoadmapReport;
  const northStar = options.northStarReport;
  const unityAdoption = options.unityAdoptionReport;
  const businessModelProof = options.businessModelProofReport;
  const engineExpansion = options.engineExpansionReport;
  const metrics = withEvidenceReports(normalizeMetrics(options.metrics ?? {}), {
    salesMotion,
    enterpriseLogoExpansion,
    commercialCredits,
    strategicOutreach,
    northStar,
    unityAdoption,
    businessModelProof,
  });
  const checks = buildChecks(metrics, {
    salesMotion,
    enterpriseLogoExpansion,
    commercialCredits,
    strategicOutreach,
    certificationRoadmap,
    northStar,
    unityAdoption,
    businessModelProof,
    engineExpansion,
  });
  const acquisitionChecks = checks.filter((check) => ACQUISITION_PITCH_CHECK_IDS.has(check.id));
  const pass = checks.filter((check) => check.status === 'pass').length;
  const warn = checks.filter((check) => check.status === 'warn').length;
  const fail = checks.filter((check) => check.status === 'fail').length;
  const acquisitionPitchChecksPassed = acquisitionChecks.filter((check) => check.status === 'pass').length;
  const readyForStrategicProcess = acquisitionChecks.every((check) => check.status === 'pass');
  const exitOutcomeSecured = checks.find((check) => check.id === 'valuation-event')?.status === 'pass';
  return {
    generatedAt: now.toISOString(),
    disclaimer: 'Acquisition readiness is internal operating evidence only. It is not investment advice, a valuation guarantee, buyer diligence, legal advice, or a certification claim.',
    targetValuationBandUsd: {
      low: 200_000_000,
      high: 500_000_000,
    },
    targetAcquirers: ['Unity', 'Roblox', 'Epic', 'Krafton', 'Tencent', 'Adobe'],
    metrics,
    summary: {
      checks: checks.length,
      pass,
      warn,
      fail,
      readyForStrategicProcess,
      exitOutcomeSecured,
      missionCompleteCandidate: readyForStrategicProcess
        && exitOutcomeSecured
        && metrics.arrUsd >= 10_000_000
        && checks.every((check) => check.status === 'pass'),
      acquisitionPitchChecksPassed,
      acquisitionPitchChecks: acquisitionChecks.length,
      salesMotionStatus: salesMotion?.summary.status ?? 'fail',
      revenueEvidenceReady: revenueEvidenceReady(metrics, salesMotion),
      enterpriseLogoExpansionStatus: enterpriseLogoExpansion?.summary.status ?? 'fail',
      enterpriseLogoScaleReady: enterpriseLogoScaleReady(metrics, enterpriseLogoExpansion),
      nrrExpansionEvidenceReady: nrrExpansionEvidenceReady(metrics, enterpriseLogoExpansion),
      commercialCreditStatus: commercialCredits?.summary.status ?? 'fail',
      commercialCreditNarrativeReady: commercialCredits?.summary.acquisitionNarrativeReady === true,
      strategicOutreachStatus: strategicOutreach?.summary.status ?? 'fail',
      strategicConversationEvidenceReady: strategicOutreach?.summary.conversationRequirementMet === true,
      valuationOutcomeEvidenceReady: valuationOutcomeEvidenceReady(metrics, strategicOutreach),
      trustCertificationEvidenceReady: trustCertificationEvidenceReady(metrics, certificationRoadmap),
      northStarEngineShippingReady: northStarEngineShippingReady(metrics, northStar),
      unityAdoptionStatus: unityAdoption?.summary.status ?? 'fail',
      unityPluginAcquisitionReady: unityAdoption?.summary.acquisitionPluginGate === true,
      businessModelProofStatus: businessModelProof?.summary.status ?? 'fail',
      managedInferenceReady: businessModelProof?.summary.managedInferenceReady === true,
      proModuleRevenueReady: businessModelProof?.summary.proModuleReady === true,
      marketplaceGmvReady: businessModelProof?.summary.marketplaceReady === true,
      playtestAdoptionReady: businessModelProof?.summary.playtestReady === true,
      engineExpansionStatus: engineExpansion?.summary.status ?? 'fail',
      triEngineAcquisitionReady: engineExpansion?.summary.triEngineAcquisitionGate === true,
    },
    checks,
    ...(salesMotion ? { salesMotion: salesMotion.summary } : {}),
    ...(enterpriseLogoExpansion ? { enterpriseLogoExpansion: enterpriseLogoExpansion.summary } : {}),
    ...(commercialCredits ? { commercialCredits: commercialCredits.summary } : {}),
    ...(strategicOutreach ? { strategicOutreach: strategicOutreach.summary } : {}),
    ...(certificationRoadmap ? { certificationRoadmap: certificationRoadmap.summary } : {}),
    ...(northStar ? { northStar: northStar.summary } : {}),
    ...(unityAdoption ? { unityAdoption: unityAdoption.summary } : {}),
    ...(businessModelProof ? { businessModelProof: businessModelProof.summary } : {}),
    ...(engineExpansion ? { engineExpansion: engineExpansion.summary } : {}),
    pitch: 'Greybox is the AI design layer that ships games to engines, with round-trip workflows across Unity, Unreal, and Godot plus autonomous playtesting and enterprise-ready trust controls.',
  };
}

export function formatAcquisitionReadinessMarkdown(report: AcquisitionReadinessReport): string {
  const lines = [
    '# Greybox Acquisition Readiness',
    '',
    `Generated: ${report.generatedAt}`,
    `Ready for strategic process: ${report.summary.readyForStrategicProcess ? 'yes' : 'no'}`,
    `Exit outcome secured: ${report.summary.exitOutcomeSecured ? 'yes' : 'no'}`,
    `Mission complete candidate: ${report.summary.missionCompleteCandidate ? 'yes' : 'no'}`,
    `Target valuation band: ${money(report.targetValuationBandUsd.low)}-${money(report.targetValuationBandUsd.high)}`,
    `Disclaimer: ${report.disclaimer}`,
    '',
    '## Summary',
    '',
    `- Checks: ${report.summary.checks}`,
    `- Pass: ${report.summary.pass}`,
    `- Warn: ${report.summary.warn}`,
    `- Fail: ${report.summary.fail}`,
    `- Acquisition pitch checks: ${report.summary.acquisitionPitchChecksPassed}/${report.summary.acquisitionPitchChecks}`,
    `- Sales motion status: ${report.summary.salesMotionStatus}`,
    `- Revenue evidence ready: ${report.summary.revenueEvidenceReady ? 'yes' : 'no'}`,
    `- Enterprise logo scale ready: ${report.summary.enterpriseLogoScaleReady ? 'yes' : 'no'}`,
    `- NRR expansion evidence ready: ${report.summary.nrrExpansionEvidenceReady ? 'yes' : 'no'}`,
    `- Enterprise logo expansion status: ${report.summary.enterpriseLogoExpansionStatus}`,
    `- Commercial credit narrative ready: ${report.summary.commercialCreditNarrativeReady ? 'yes' : 'no'}`,
    `- Strategic conversation evidence ready: ${report.summary.strategicConversationEvidenceReady ? 'yes' : 'no'}`,
    `- Valuation outcome evidence ready: ${report.summary.valuationOutcomeEvidenceReady ? 'yes' : 'no'}`,
    `- Trust certification evidence ready: ${report.summary.trustCertificationEvidenceReady ? 'yes' : 'no'}`,
    `- North Star engine shipping ready: ${report.summary.northStarEngineShippingReady ? 'yes' : 'no'}`,
    `- Unity plugin acquisition ready: ${report.summary.unityPluginAcquisitionReady ? 'yes' : 'no'}`,
    `- Business model proof status: ${report.summary.businessModelProofStatus}`,
    `- Managed inference proof ready: ${report.summary.managedInferenceReady ? 'yes' : 'no'}`,
    `- Pro module revenue proof ready: ${report.summary.proModuleRevenueReady ? 'yes' : 'no'}`,
    `- Marketplace GMV proof ready: ${report.summary.marketplaceGmvReady ? 'yes' : 'no'}`,
    `- Playtest adoption proof ready: ${report.summary.playtestAdoptionReady ? 'yes' : 'no'}`,
    `- Tri-engine acquisition proof ready: ${report.summary.triEngineAcquisitionReady ? 'yes' : 'no'}`,
    '',
    '## Checks',
    '',
    '| Check | Status | Current | Target | Owner |',
    '| --- | --- | --- | --- | --- |',
  ];
  for (const check of report.checks) {
    lines.push(`| ${escapeTableCell(check.label)} | ${check.status} | ${escapeTableCell(check.current)} | ${escapeTableCell(check.target)} | ${escapeTableCell(check.owner)} |`);
  }
  lines.push('', '## Pitch', '', report.pitch, '');
  return lines.join('\n');
}

function buildChecks(
  metrics: AcquisitionReadinessMetrics,
  evidence: {
    salesMotion: SalesMotionReadinessReport | undefined;
    enterpriseLogoExpansion: EnterpriseLogoExpansionReport | undefined;
    commercialCredits: CommercialCreditReport | undefined;
    strategicOutreach: StrategicOutreachReport | undefined;
    certificationRoadmap: CertificationRoadmapReport | undefined;
    northStar: NorthStarReport | undefined;
    unityAdoption: UnityPluginAdoptionReport | undefined;
    businessModelProof: BusinessModelProofReport | undefined;
    engineExpansion: EngineExpansionReadinessReport | undefined;
  },
): AcquisitionReadinessCheck[] {
  return [
    arrRunRateCheck(metrics, evidence.salesMotion),
    yoyGrowthCheck(metrics, evidence.salesMotion),
    nrrCheck(metrics, evidence.enterpriseLogoExpansion),
    weeklyActiveEngineDesignersCheck(metrics, evidence.northStar),
    unityVerifiedSolutionCheck(metrics, evidence.unityAdoption),
    commercialGameCreditsCheck(metrics, evidence.commercialCredits),
    enterpriseLogoCheck(metrics, evidence.enterpriseLogoExpansion),
    trustCertificationCheck(metrics, evidence.certificationRoadmap),
    booleanCheck({
      id: 'clean-cap-table',
      label: 'Clean cap table',
      value: metrics.cleanCapTable,
      target: 'No messy early dilution or unresolved equity claims',
      owner: 'Finance',
      detail: 'Strategic buyers and Series B investors need fast diligence with no avoidable cap-table drag.',
      evidence: ['cap table export', 'corporate counsel memo'],
      remediation: 'Do not raise VC before $1M ARR; clean up advisor grants and assignment paperwork early.',
    }),
    strategicConversationsCheck(metrics, evidence.strategicOutreach),
    managedInferenceArrCheck(metrics, evidence.businessModelProof),
    proModuleRevenueShareCheck(metrics, evidence.businessModelProof),
    marketplaceGmvCheck(metrics, evidence.businessModelProof),
    unityPluginCustomersCheck(metrics, evidence.unityAdoption),
    playtestStudioAdoptionCheck(metrics, evidence.businessModelProof),
    triEngineRuntimeProofCheck(evidence.engineExpansion),
    valuationEventCheck(metrics, evidence.strategicOutreach),
  ];
}

function arrRunRateCheck(
  metrics: AcquisitionReadinessMetrics,
  salesMotion: SalesMotionReadinessReport | undefined,
): AcquisitionReadinessCheck {
  if (!salesMotion) {
    return {
      id: 'arr-run-rate',
      label: 'ARR run rate',
      status: 'fail',
      current: `${money(metrics.arrUsd)} aggregate ARR, no sales-motion proof packet`,
      target: '$5M+ ARR for the acquisition pitch, $10M+ for mission complete',
      owner: 'Revenue',
      detail: 'Strategic process should wait until ARR is large enough to create buyer tension, and the ARR claim needs sales-motion evidence.',
      evidence: ['GET /v1/strategy/sales-motion-readiness', 'Stripe revenue dashboard', 'board KPI export'],
      remediation: 'Generate the sales-motion readiness packet before counting ARR in acquisition readiness.',
    };
  }
  const ready = revenueEvidenceReady(metrics, salesMotion);
  const status: AcquisitionReadinessStatus = ready
    ? 'pass'
    : metrics.arrUsd >= 1_000_000 && salesMotion.summary.revenueProofReady
      ? 'warn'
      : 'fail';
  return {
    id: 'arr-run-rate',
    label: 'ARR run rate',
    status,
    current: `${money(metrics.arrUsd)} acquisition ARR, ${money(salesMotion.metrics.arrUsd)} sales-motion ARR, proof ${salesMotion.summary.revenueProofReady ? 'ready' : 'blocked'}, status ${salesMotion.summary.status}`,
    target: '$5M+ ARR for the acquisition pitch, $10M+ for mission complete',
    owner: 'Revenue',
    detail: 'Strategic process should wait until ARR is large enough to create buyer tension and the sales-motion packet proves the revenue sources.',
    evidence: ['GET /v1/strategy/sales-motion-readiness', 'Stripe revenue dashboard', 'board KPI export'],
    ...(status === 'pass' ? {} : { remediation: 'Prioritize Studio/Enterprise expansion and managed inference, then clear the sales-motion revenue proof packet.' }),
  };
}

function yoyGrowthCheck(
  metrics: AcquisitionReadinessMetrics,
  salesMotion: SalesMotionReadinessReport | undefined,
): AcquisitionReadinessCheck {
  if (!salesMotion) {
    return {
      id: 'yoy-growth',
      label: 'Year-over-year growth',
      status: 'fail',
      current: `${percent(metrics.yoyGrowthRate)} aggregate YoY growth, no sales-motion proof packet`,
      target: '100%+ YoY growth with revenue source proof',
      owner: 'Revenue',
      detail: 'The pitch needs venture-scale growth, not just defensible technology, and growth must reconcile to the revenue packet.',
      evidence: ['GET /v1/strategy/sales-motion-readiness', 'Stripe cohort export', 'PostHog acquisition dashboard'],
      remediation: 'Generate the sales-motion readiness packet before counting YoY growth in acquisition readiness.',
    };
  }
  const proofReady = salesMotion.summary.revenueProofReady && salesMotion.summary.status !== 'fail';
  const status: AcquisitionReadinessStatus = metrics.yoyGrowthRate >= 1 && proofReady
    ? 'pass'
    : metrics.yoyGrowthRate >= 0.6 && proofReady
      ? 'warn'
      : 'fail';
  return {
    id: 'yoy-growth',
    label: 'Year-over-year growth',
    status,
    current: `${percent(metrics.yoyGrowthRate)} YoY growth, sales-motion ${salesMotion.summary.status}, revenue proof ${salesMotion.summary.revenueProofReady ? 'ready' : 'blocked'}`,
    target: '100%+ YoY growth with revenue source proof',
    owner: 'Revenue',
    detail: 'The pitch needs venture-scale growth, not just defensible technology, and growth should be counted only when the revenue packet is diligence-ready.',
    evidence: ['GET /v1/strategy/sales-motion-readiness', 'Stripe cohort export', 'PostHog acquisition dashboard'],
    ...(status === 'pass' ? {} : { remediation: 'Increase weekly activation into engine exports and tighten founder-led expansion loops while keeping the sales-motion packet current.' }),
  };
}

function weeklyActiveEngineDesignersCheck(
  metrics: AcquisitionReadinessMetrics,
  northStar: NorthStarReport | undefined,
): AcquisitionReadinessCheck {
  if (!northStar) {
    return {
      id: 'weekly-active-engine-designers',
      label: 'Weekly active engine shippers',
      status: 'fail',
      current: `${integer(metrics.weeklyActiveDesignersShippingToEngines)} aggregate designer(s), no North Star packet`,
      target: '30K+ Weekly Active Designers shipping to Unity, Unreal, or Godot',
      owner: 'Product Analytics',
      detail: 'The North Star must come from opt-in engine-export analytics, not a hand-entered counter.',
      evidence: ['GET /v1/strategy/north-star', 'PostHog North Star dashboard', 'daemon product analytics weekly report'],
      remediation: 'Generate the North Star packet from opt-in product analytics before acquisition outreach.',
    };
  }
  const ready = northStarEngineShippingReady(metrics, northStar);
  const status: AcquisitionReadinessStatus = ready
    ? 'pass'
    : metrics.weeklyActiveDesignersShippingToEngines >= 10_000
      ? 'warn'
      : 'fail';
  return {
    id: 'weekly-active-engine-designers',
    label: 'Weekly active engine shippers',
    status,
    current: `${integer(metrics.weeklyActiveDesignersShippingToEngines)} weekly active engine shipper(s), Unity ${northStar.engines.unity.exportingDesigners}, Unreal ${northStar.engines.unreal.exportingDesigners}, Godot ${northStar.engines.godot.exportingDesigners}`,
    target: '30K+ Weekly Active Designers shipping to Unity, Unreal, or Godot',
    owner: 'Product Analytics',
    detail: 'This is the North Star that proves Greybox sits between design intent and shipped engines.',
    evidence: ['GET /v1/strategy/north-star', 'PostHog North Star dashboard', 'daemon product analytics weekly report'],
    ...(status === 'pass' ? {} : { remediation: 'Instrument every engine export path and remove activation friction before acquisition outreach.' }),
  };
}

function unityVerifiedSolutionCheck(
  metrics: AcquisitionReadinessMetrics,
  unityAdoption: UnityPluginAdoptionReport | undefined,
): AcquisitionReadinessCheck {
  if (!unityAdoption) {
    return {
      id: 'unity-verified-solution',
      label: 'Unity Verified Solution',
      status: 'fail',
      current: `${metrics.unityVerifiedSolution ? 'raw achieved' : 'not achieved'}, no Unity adoption packet`,
      target: 'Verified Solution status achieved with passing Unity quality/adoption evidence',
      owner: 'Partnerships',
      detail: 'Unity verification must be backed by the adoption, quality, and support evidence that makes engine-vendor diligence credible.',
      evidence: ['GET /v1/strategy/unity-plugin-adoption', 'Unity partner portal', 'Asset Store listing'],
      remediation: 'Generate the Unity adoption packet and complete Verified Solution evidence before counting this pitch gate.',
    };
  }
  const achieved = unityAdoption.metrics.unityVerifiedSolutionAchieved && unityAdoption.summary.readyForUnityV1Growth;
  const status: AcquisitionReadinessStatus = achieved
    ? 'pass'
    : unityAdoption.metrics.unityVerifiedSolutionApplied || unityAdoption.metrics.assetStoreLive
      ? 'warn'
      : 'fail';
  return {
    id: 'unity-verified-solution',
    label: 'Unity Verified Solution',
    status,
    current: unityAdoption.metrics.unityVerifiedSolutionAchieved
      ? `achieved, Unity v1 growth ready = ${unityAdoption.summary.readyForUnityV1Growth}`
      : unityAdoption.metrics.unityVerifiedSolutionApplied
        ? 'applied'
        : 'not applied',
    target: 'Verified Solution status achieved with passing Unity quality/adoption evidence',
    owner: 'Partnerships',
    detail: 'Unity verification makes Greybox strategically legible to engine vendors only when paired with paid adoption and low support risk.',
    evidence: ['GET /v1/strategy/unity-plugin-adoption', 'Unity partner portal', 'Asset Store listing'],
    ...(status === 'pass' ? {} : { remediation: 'Finish plugin validation, collect customer evidence, and submit or complete the Verified Solution packet.' }),
  };
}

function commercialGameCreditsCheck(
  metrics: AcquisitionReadinessMetrics,
  commercialCredits: CommercialCreditReport | undefined,
): AcquisitionReadinessCheck {
  if (!commercialCredits) {
    return {
      id: 'commercial-game-credits',
      label: 'Commercial game credits',
      status: 'fail',
      current: `${integer(metrics.shippedCommercialGameCredits)} aggregate credit(s), no credit packet`,
      target: '5+ shipped commercial games with public Greybox credit evidence',
      owner: 'Developer Relations',
      detail: 'Public game credits should be proven through store pages, credits captures, case studies, and human-designer credit hygiene.',
      evidence: ['GET /v1/strategy/commercial-credits', 'store proof', 'credits capture hash', 'customer approval digest'],
      remediation: 'Generate the commercial credit packet and clear the acquisition narrative gates before counting shipped-game proof.',
    };
  }
  const narrativeReady = commercialCredits.summary.acquisitionNarrativeReady
    && commercialCredits.summary.verifiedCommercialCredits >= 5;
  const status: AcquisitionReadinessStatus = narrativeReady
    ? 'pass'
    : commercialCredits.summary.verifiedCommercialCredits >= 3
      ? 'warn'
      : 'fail';
  return {
    id: 'commercial-game-credits',
    label: 'Commercial game credits',
    status,
    current: `${integer(metrics.shippedCommercialGameCredits)} verified credit(s), narrative ${narrativeReady ? 'ready' : 'blocked'}`,
    target: '5+ shipped commercial games with public Greybox credit evidence',
    owner: 'Developer Relations',
    detail: 'Public game credits turn usage into category evidence only when they are approved, cross-engine, and honest about AI assistance.',
    evidence: ['GET /v1/strategy/commercial-credits', 'store proof', 'credits capture hash', 'customer approval digest'],
    ...(status === 'pass' ? {} : { remediation: 'Secure enough verified public credits, human designer credits, generator metadata, engine spread, and an approved case study.' }),
  };
}

function enterpriseLogoCheck(
  metrics: AcquisitionReadinessMetrics,
  enterpriseLogoExpansion: EnterpriseLogoExpansionReport | undefined,
): AcquisitionReadinessCheck {
  if (!enterpriseLogoExpansion) {
    return {
      id: 'enterprise-logos',
      label: 'Enterprise logos',
      status: 'fail',
      current: `${integer(metrics.enterpriseLogos)} aggregate logo(s), no expansion packet`,
      target: '50+ enterprise logos with passing 5-to-50 expansion evidence',
      owner: 'Enterprise Sales',
      detail: 'Raw logo counts are not enough for acquisition diligence; the pitch needs repeatable ACV, procurement, adoption, customer-success, support, and reference evidence.',
      evidence: ['GET /v1/enterprise/logo-expansion-readiness', 'CRM export', 'signed order forms', 'support SLA export'],
      remediation: 'Generate the enterprise logo expansion packet and clear every 5-to-50 scale gate before strategic outreach.',
    };
  }

  const scaleReady = enterpriseLogoScaleReady(metrics, enterpriseLogoExpansion);
  const status: AcquisitionReadinessStatus = scaleReady
    ? 'pass'
    : enterpriseLogoExpansion.summary.firstFiveLogosSecured
      ? 'warn'
      : 'fail';
  return {
    id: 'enterprise-logos',
    label: 'Enterprise logos',
    status,
    current: `${integer(metrics.enterpriseLogos)} enterprise logo(s), scale ${enterpriseLogoExpansion.summary.readyFor50LogoScale ? 'ready' : 'blocked'}, support ${enterpriseLogoExpansion.summary.supportSlaStatus}`,
    target: '50+ enterprise logos with passing 5-to-50 expansion evidence',
    owner: 'Enterprise Sales',
    detail: 'Enterprise logos prove Greybox can survive security review, expand into studio workflows, and support high-ACV accounts repeatably.',
    evidence: ['GET /v1/enterprise/logo-expansion-readiness', 'CRM export', 'signed order forms', 'support SLA export'],
    ...(status === 'pass' ? {} : { remediation: 'Convert the first five lighthouse contracts, then clear the 50-logo expansion packet including support SLA scale evidence.' }),
  };
}

function nrrCheck(
  metrics: AcquisitionReadinessMetrics,
  enterpriseLogoExpansion: EnterpriseLogoExpansionReport | undefined,
): AcquisitionReadinessCheck {
  if (!enterpriseLogoExpansion) {
    return {
      id: 'nrr',
      label: 'Net revenue retention',
      status: 'fail',
      current: `${percent(metrics.nrr)} aggregate NRR, no enterprise expansion packet`,
      target: '120%+ NRR backed by enterprise expansion, expansion ARR, and low churn evidence',
      owner: 'Revenue Operations',
      detail: 'NRR must come from a revenue-retention proof packet, not a hand-entered acquisition metric.',
      evidence: ['GET /v1/enterprise/logo-expansion-readiness', 'Stripe NRR cohort report', 'CS renewal ledger', 'seat/module expansion invoices'],
      remediation: 'Generate the enterprise logo expansion packet before counting NRR in acquisition readiness.',
    };
  }
  const nrrExpansion = enterpriseLogoExpansion.checks.find((check) => check.id === 'nrr-expansion');
  const ready = nrrExpansionEvidenceReady(metrics, enterpriseLogoExpansion);
  const status: AcquisitionReadinessStatus = ready
    ? 'pass'
    : enterpriseLogoExpansion.metrics.netRevenueRetention >= 1.1 || metrics.nrr >= 1.1
      ? 'warn'
      : 'fail';
  return {
    id: 'nrr',
    label: 'Net revenue retention',
    status,
    current: `${percent(metrics.nrr)} acquisition NRR, ${percent(enterpriseLogoExpansion.metrics.netRevenueRetention)} enterprise NRR, ${money(enterpriseLogoExpansion.metrics.expansionArrUsd)} expansion ARR, ${enterpriseLogoExpansion.metrics.churnedEnterpriseLogos} churned, proof ${nrrExpansion?.status ?? 'missing'}`,
    target: '120%+ NRR backed by enterprise expansion, expansion ARR, and low churn evidence',
    owner: 'Revenue Operations',
    detail: 'Expansion is the cleanest proof that Greybox is becoming a system of record for game design teams.',
    evidence: ['GET /v1/enterprise/logo-expansion-readiness', 'Stripe NRR cohort report', 'CS renewal ledger', 'seat/module expansion invoices'],
    ...(status === 'pass' ? {} : { remediation: 'Package Pro modules, round-trip sync, and playtest usage into Studio and Enterprise expansion motions.' }),
  };
}

function strategicConversationsCheck(
  metrics: AcquisitionReadinessMetrics,
  strategicOutreach: StrategicOutreachReport | undefined,
): AcquisitionReadinessCheck {
  if (!strategicOutreach) {
    return {
      id: 'strategic-conversations',
      label: 'Strategic conversations',
      status: 'fail',
      current: `${integer(metrics.strategicConversations)} aggregate conversation(s), no outreach packet`,
      target: '2+ active strategic-buyer conversations with sanitized evidence',
      owner: 'Founder',
      detail: 'Multiple credible conversations create buyer tension only when there is sanitized proof for each active target.',
      evidence: ['GET /v1/strategy/strategic-outreach', 'hashed intro evidence', 'board note digest'],
      remediation: 'Generate the strategic outreach packet and record evidence for at least two target-acquirer conversations.',
    };
  }
  const ready = strategicOutreach.summary.conversationRequirementMet;
  const status: AcquisitionReadinessStatus = ready
    ? 'pass'
    : strategicOutreach.summary.initiatedTargetConversations >= 1
      ? 'warn'
      : 'fail';
  return {
    id: 'strategic-conversations',
    label: 'Strategic conversations',
    status,
    current: `${integer(metrics.strategicConversations)} target conversation(s), ${strategicOutreach.summary.evidenceItems} evidence item(s)`,
    target: '2+ active strategic-buyer conversations with sanitized evidence',
    owner: 'Founder',
    detail: 'Strategic outreach should be sequenced after the pitch checks pass and counted only when each active conversation has evidence.',
    evidence: ['GET /v1/strategy/strategic-outreach', 'hashed intro evidence', 'board note digest'],
    ...(status === 'pass' ? {} : { remediation: 'Sequence Unity, Roblox, Epic, Krafton, Tencent, and Adobe outreach, then hash at least one evidence item per active conversation.' }),
  };
}

function managedInferenceArrCheck(
  metrics: AcquisitionReadinessMetrics,
  businessModelProof: BusinessModelProofReport | undefined,
): AcquisitionReadinessCheck {
  if (!businessModelProof) {
    return {
      id: 'managed-inference-arr',
      label: 'Managed inference ARR',
      status: 'fail',
      current: `${money(metrics.managedInferenceArrUsd)} aggregate ARR, no business-model proof packet`,
      target: '$1M+ ARR from managed inference with audited billing and provider reconciliation',
      owner: 'Cloud',
      detail: 'Managed inference must be proven through metered billing and provider reconciliation, not a hand-entered ARR counter.',
      evidence: ['GET /v1/strategy/business-model-proof', 'Stripe Metered Billing export', 'provider reconciliation report'],
      remediation: 'Generate the business-model proof packet before counting managed inference revenue in acquisition readiness.',
    };
  }
  const ready = businessModelProof.summary.managedInferenceReady && metrics.managedInferenceArrUsd >= 1_000_000;
  const status: AcquisitionReadinessStatus = ready
    ? 'pass'
    : metrics.managedInferenceArrUsd >= 100_000
      ? 'warn'
      : 'fail';
  return {
    id: 'managed-inference-arr',
    label: 'Managed inference ARR',
    status,
    current: `${money(metrics.managedInferenceArrUsd)} managed inference ARR, proof ${businessModelProof.summary.managedInferenceReady ? 'ready' : 'blocked'}`,
    target: '$1M+ ARR from managed inference with audited billing and provider reconciliation',
    owner: 'Cloud',
    detail: 'Managed inference is the margin layer and the future Greybox Native data flywheel only when billing proof is clean.',
    evidence: ['GET /v1/strategy/business-model-proof', 'Stripe Metered Billing export', 'provider reconciliation report'],
    ...(status === 'pass' ? {} : { remediation: 'Reconcile provider invoices to Stripe meter events and push BYOK users into managed inference with clear trust controls.' }),
  };
}

function proModuleRevenueShareCheck(
  metrics: AcquisitionReadinessMetrics,
  businessModelProof: BusinessModelProofReport | undefined,
): AcquisitionReadinessCheck {
  if (!businessModelProof) {
    return {
      id: 'pro-module-revenue-share',
      label: 'Pro module revenue share',
      status: 'fail',
      current: `${percent(metrics.proModuleRevenueShare)} aggregate revenue share, no business-model proof packet`,
      target: '30%+ of ARR from signed Pro modules with loader enforcement',
      owner: 'Pro Modules',
      detail: 'Closed-source Pro modules should be counted only from signed bundle and entitlement evidence.',
      evidence: ['GET /v1/strategy/business-model-proof', 'Pro revenue mix report', 'module sales ledger'],
      remediation: 'Generate the business-model proof packet before counting Pro module revenue share in acquisition readiness.',
    };
  }
  const ready = businessModelProof.summary.proModuleReady && metrics.proModuleRevenueShare >= 0.3;
  const status: AcquisitionReadinessStatus = ready
    ? 'pass'
    : metrics.proModuleRevenueShare >= 0.15
      ? 'warn'
      : 'fail';
  return {
    id: 'pro-module-revenue-share',
    label: 'Pro module revenue share',
    status,
    current: `${percent(metrics.proModuleRevenueShare)} of ARR, proof ${businessModelProof.summary.proModuleReady ? 'ready' : 'blocked'}`,
    target: '30%+ of ARR from signed Pro modules with loader enforcement',
    owner: 'Pro Modules',
    detail: 'Closed-source Pro modules create differentiated margin beyond the open-core trust layer only when revenue mix and bundle enforcement are proven.',
    evidence: ['GET /v1/strategy/business-model-proof', 'Pro revenue mix report', 'module sales ledger'],
    ...(status === 'pass' ? {} : { remediation: 'Ship vertical packs every 2-4 weeks and keep loader signature enforcement in the purchase path.' }),
  };
}

function marketplaceGmvCheck(
  metrics: AcquisitionReadinessMetrics,
  businessModelProof: BusinessModelProofReport | undefined,
): AcquisitionReadinessCheck {
  if (!businessModelProof) {
    return {
      id: 'marketplace-gmv',
      label: 'Marketplace GMV',
      status: 'fail',
      current: `${money(metrics.marketplaceGmvMonthlyUsd)} aggregate GMV/month, no business-model proof packet`,
      target: '$250K+ GMV/month with 200+ active sellers and clean payout/tax evidence',
      owner: 'Marketplace',
      detail: 'Marketplace liquidity should be counted only from checkout, payout, and tax-compliance evidence.',
      evidence: ['GET /v1/strategy/business-model-proof', 'Stripe Connect payout report', 'marketplace creator activation ledger'],
      remediation: 'Generate the business-model proof packet before counting marketplace GMV in acquisition readiness.',
    };
  }
  const reserveBlocked = businessModelProof.summary.marketplaceRiskReserveReady === false
    || businessModelProof.summary.marketplaceReserveShortfallCents > 0;
  const ready = businessModelProof.summary.marketplaceReady && metrics.marketplaceGmvMonthlyUsd >= 250_000;
  const status: AcquisitionReadinessStatus = ready
    ? 'pass'
    : metrics.marketplaceGmvMonthlyUsd >= 250_000 && reserveBlocked
      ? 'fail'
      : metrics.marketplaceGmvMonthlyUsd >= 25_000
      ? 'warn'
      : 'fail';
  return {
    id: 'marketplace-gmv',
    label: 'Marketplace GMV',
    status,
    current: `${money(metrics.marketplaceGmvMonthlyUsd)} GMV/month, proof ${businessModelProof.summary.marketplaceReady ? 'ready' : 'blocked'}, reserve ${businessModelProof.summary.marketplaceRiskReserveReady ? 'ready' : 'blocked'}`,
    target: '$250K+ GMV/month with 200+ active sellers and clean payout/tax/reserve evidence',
    owner: 'Marketplace',
    detail: 'Marketplace liquidity gives Greybox a platform multiple only when checkout attribution, creator supply, payouts, tax flows, and reserves are proven.',
    evidence: ['GET /v1/strategy/business-model-proof', 'Stripe Connect payout report', 'marketplace creator activation ledger', 'risk reserve report'],
    ...(status === 'pass' ? {} : { remediation: 'Recruit creator supply and clear payout, tax, or reserve blockers before scaling marketplace demand.' }),
  };
}

function unityPluginCustomersCheck(
  metrics: AcquisitionReadinessMetrics,
  unityAdoption: UnityPluginAdoptionReport | undefined,
): AcquisitionReadinessCheck {
  if (!unityAdoption) {
    return {
      id: 'unity-plugin-customers',
      label: 'Unity plugin paying customers',
      status: 'fail',
      current: `${integer(metrics.payingUnityPluginCustomers)} aggregate paying customer(s), no Unity adoption packet`,
      target: '1,000+ paying Unity plugin customers with live adoption evidence',
      owner: 'Unity Plugin',
      detail: 'Unity adoption is the wedge that makes engine-vendor acquisition plausible, so the customer count needs license or sales evidence.',
      evidence: ['GET /v1/strategy/unity-plugin-adoption', 'Asset Store sales export', 'license validation logs'],
      remediation: 'Generate the Unity adoption packet and prove paid customer scale before counting this pitch gate.',
    };
  }
  const ready = unityAdoption.summary.acquisitionPluginGate && metrics.payingUnityPluginCustomers >= 1_000;
  const status: AcquisitionReadinessStatus = ready
    ? 'pass'
    : metrics.payingUnityPluginCustomers >= 100 || unityAdoption.summary.readyForUnrealExpansion
      ? 'warn'
      : 'fail';
  return {
    id: 'unity-plugin-customers',
    label: 'Unity plugin paying customers',
    status,
    current: `${integer(metrics.payingUnityPluginCustomers)} paying customer(s), acquisition gate ${unityAdoption.summary.acquisitionPluginGate ? 'ready' : 'blocked'}`,
    target: '1,000+ paying Unity plugin customers with live adoption evidence',
    owner: 'Unity Plugin',
    detail: 'A thousand paid Unity plugin customers makes engine-vendor strategic interest credible.',
    evidence: ['GET /v1/strategy/unity-plugin-adoption', 'Asset Store sales export', 'license validation logs'],
    ...(status === 'pass' ? {} : { remediation: 'Finish round-trip reliability, MCP bridge validation, and sample project onboarding.' }),
  };
}

function playtestStudioAdoptionCheck(
  metrics: AcquisitionReadinessMetrics,
  businessModelProof: BusinessModelProofReport | undefined,
): AcquisitionReadinessCheck {
  if (!businessModelProof) {
    return {
      id: 'playtest-studio-adoption',
      label: 'Agentic playtest adoption',
      status: 'fail',
      current: `${integer(metrics.activePlaytestStudios)} aggregate studio(s), no business-model proof packet`,
      target: '100+ paying studios using playtest agents with production persona, tuner, and $500K+ QA-savings evidence',
      owner: 'Playtest',
      detail: 'Agentic playtest adoption should be counted only from paid studio usage, accepted tuner evidence, and material QA-savings proof.',
      evidence: ['GET /v1/strategy/business-model-proof', 'playtest adoption report', 'studio usage ledger', 'QA savings report'],
      remediation: 'Generate the business-model proof packet before counting agentic playtest adoption in acquisition readiness.',
    };
  }
  const ready = businessModelProof.summary.playtestReady && metrics.activePlaytestStudios >= 100;
  const status: AcquisitionReadinessStatus = ready
    ? 'pass'
    : metrics.activePlaytestStudios >= 20
      ? 'warn'
      : 'fail';
  return {
    id: 'playtest-studio-adoption',
    label: 'Agentic playtest adoption',
    status,
    current: `${integer(metrics.activePlaytestStudios)} paying studio(s), ${money(businessModelProof.summary.playtestQaSavingsUsd)} QA savings, proof ${businessModelProof.summary.playtestReady ? 'ready' : 'blocked'}`,
    target: '100+ paying studios using playtest agents with production persona, tuner, and $500K+ QA-savings evidence',
    owner: 'Playtest',
    detail: 'Autonomous playtesting turns Greybox from an editor plugin into a QA budget line only when paid studios repeatedly use it and the loop proves budget replacement.',
    evidence: ['GET /v1/strategy/business-model-proof', 'playtest adoption report', 'studio usage ledger', 'QA savings report'],
    ...(status === 'pass' ? {} : { remediation: 'Run design-partner loops until persona reports and tuner suggestions are accepted in paid workflows.' }),
  };
}

function triEngineRuntimeProofCheck(
  engineExpansion: EngineExpansionReadinessReport | undefined,
): AcquisitionReadinessCheck {
  if (!engineExpansion) {
    return {
      id: 'tri-engine-runtime-proof',
      label: 'Tri-engine runtime proof',
      status: 'fail',
      current: 'no engine-expansion proof packet',
      target: 'Unity, Unreal, and Godot runtime gates proven with source-ready plugin packets',
      owner: 'Engine Platform',
      detail: 'The acquisition pitch claims Greybox round-trips to all three engines, so the strategic process must consume the engine-expansion packet directly.',
      evidence: ['GET /v1/strategy/engine-expansion-readiness', 'Unreal release readiness cloudMetrics', 'Godot release readiness cloudMetrics'],
      remediation: 'Generate the engine-expansion packet with Unity adoption, Unreal runtime, Godot community, and open-core API safety gates before strategic outreach.',
    };
  }
  const ready = engineExpansion.summary.triEngineAcquisitionGate;
  const partial = engineExpansion.summary.unrealV1Gate || engineExpansion.summary.godotCommunityGate;
  const status: AcquisitionReadinessStatus = ready ? 'pass' : partial ? 'warn' : 'fail';
  return {
    id: 'tri-engine-runtime-proof',
    label: 'Tri-engine runtime proof',
    status,
    current: `Unreal v1 ${engineExpansion.summary.unrealV1Gate ? 'ready' : 'blocked'}, Godot ${engineExpansion.summary.godotCommunityGate ? 'ready' : 'blocked'}, tri-engine ${ready ? 'ready' : 'blocked'}`,
    target: 'Unity, Unreal, and Godot runtime gates proven with source-ready plugin packets',
    owner: 'Engine Platform',
    detail: 'This protects the $200M-$500M narrative from claiming cross-engine defensibility before Unreal and Godot are actually proven.',
    evidence: ['GET /v1/strategy/engine-expansion-readiness', 'Unreal release readiness cloudMetrics', 'Godot release readiness cloudMetrics'],
    ...(status === 'pass' ? {} : { remediation: 'Clear Unity Verified Solution, Unreal runtime/Marketplace, Godot Asset Library, and open-core API safety gates in the engine-expansion packet.' }),
  };
}

function trustCertificationCheck(
  metrics: AcquisitionReadinessMetrics,
  certificationRoadmap: CertificationRoadmapReport | undefined,
): AcquisitionReadinessCheck {
  if (!certificationRoadmap) {
    return {
      id: 'trust-certifications',
      label: 'SOC 2 Type II and ISO 27001 track',
      status: 'fail',
      current: `SOC 2 Type II ${metrics.soc2Type2Achieved ? 'raw achieved' : 'not achieved'}, ISO 27001 ${metrics.iso27001Status}, no certification roadmap packet`,
      target: 'SOC 2 Type II achieved with auditor evidence; ISO 27001 in progress or achieved with roadmap evidence',
      owner: 'Security',
      detail: 'Raw certification fields are not enough for enterprise or buyer diligence.',
      evidence: ['GET /v1/enterprise/certification-roadmap', 'SOC 2 audit report', 'ISO 27001 readiness plan', 'enterprise trust packet'],
      remediation: 'Generate the certification roadmap packet and attach auditor or certification-body evidence before counting this pitch gate.',
    };
  }

  const soc2Milestone = certificationMilestone(certificationRoadmap, 'soc2-type-ii');
  const isoMilestone = certificationMilestone(certificationRoadmap, 'iso-27001');
  const soc2Ready = soc2Type2EvidenceReady(metrics, certificationRoadmap);
  const isoReady = iso27001EvidenceReady(metrics, certificationRoadmap);
  const ready = soc2Ready && isoReady;
  const blocked = certificationRoadmap.summary.blocked > 0;
  const hasProgress = metrics.soc2Type2Achieved
    || metrics.iso27001Status === 'in-progress'
    || metrics.iso27001Status === 'achieved'
    || soc2Milestone?.status === 'on-track'
    || soc2Milestone?.status === 'ready'
    || isoMilestone?.status === 'on-track'
    || isoMilestone?.status === 'ready';
  const status: AcquisitionReadinessStatus = ready
    ? 'pass'
    : blocked || (metrics.soc2Type2Achieved && !soc2Ready)
      ? 'fail'
      : hasProgress
        ? 'warn'
        : 'fail';
  return {
    id: 'trust-certifications',
    label: 'SOC 2 Type II and ISO 27001 track',
    status,
    current: `SOC 2 Type II ${metrics.soc2Type2Achieved ? 'claimed' : 'not achieved'} (${soc2Milestone?.status ?? 'missing'} roadmap), ISO 27001 ${metrics.iso27001Status} (${isoMilestone?.status ?? 'missing'} roadmap), ${certificationRoadmap.summary.blocked} blocked milestone(s)`,
    target: 'SOC 2 Type II achieved with auditor evidence; ISO 27001 in progress or achieved with roadmap evidence',
    owner: 'Security',
    detail: 'Trust evidence is mandatory for enterprise logos and buyer diligence, so certification claims must reconcile to the roadmap packet rather than hand-entered fields.',
    evidence: ['GET /v1/enterprise/certification-roadmap', 'SOC 2 audit report', 'ISO 27001 readiness plan', 'enterprise trust packet'],
    ...(status === 'pass' ? {} : { remediation: 'Clear certification-roadmap blockers, attach SOC 2 Type II auditor evidence, and keep ISO 27001 progress evidence current.' }),
  };
}

function valuationEventCheck(
  metrics: AcquisitionReadinessMetrics,
  strategicOutreach: StrategicOutreachReport | undefined,
): AcquisitionReadinessCheck {
  if (!strategicOutreach) {
    const bestRawOutcome = Math.max(metrics.termSheetValuationUsd, metrics.seriesBPostMoneyUsd);
    return {
      id: 'valuation-event',
      label: '$200M+ term sheet or Series B',
      status: 'fail',
      current: `${bestRawOutcome > 0 ? money(bestRawOutcome) : 'none'} raw valuation, no strategic-outreach outcome packet`,
      target: '$200M+ acquisition term sheet or Series B post-money valuation backed by outcome evidence',
      owner: 'Founder',
      detail: 'The explicit outcome gate must be backed by sanitized term-sheet or financing evidence, not hand-entered valuation fields.',
      evidence: ['GET /v1/strategy/strategic-outreach', 'signed LOI or term sheet', 'Series B financing documents'],
      remediation: 'Record sanitized term-sheet or financing outcome evidence before marking the mission complete.',
    };
  }
  const bestOutcome = Math.max(metrics.termSheetValuationUsd, metrics.seriesBPostMoneyUsd);
  const evidenceReady = valuationOutcomeEvidenceReady(metrics, strategicOutreach);
  const status: AcquisitionReadinessStatus = evidenceReady
    ? 'pass'
    : bestOutcome >= 100_000_000 || strategicOutreach.summary.termSheetConversations > 0
      ? 'warn'
      : 'fail';
  return {
    id: 'valuation-event',
    label: '$200M+ term sheet or Series B',
    status,
    current: `${bestOutcome > 0 ? money(bestOutcome) : 'none'} best raw outcome, ${money(strategicOutreach.summary.highestValuationUsd)} evidenced strategic valuation, ${strategicOutreach.summary.termSheetConversations} term sheet(s), evidence ${strategicOutreach.summary.exitOutcomeEvidence ? 'ready' : 'blocked'}`,
    target: '$200M+ acquisition term sheet or Series B post-money valuation backed by outcome evidence',
    owner: 'Founder',
    detail: 'This is the explicit outcome gate; readiness without signed, sanitized outcome evidence is not mission complete.',
    evidence: ['GET /v1/strategy/strategic-outreach', 'signed LOI or term sheet', 'Series B financing documents'],
    ...(status === 'pass' ? {} : { remediation: 'Wait for the acquisition pitch checks to pass, then run a competitive strategic or financing process and record outcome evidence.' }),
  };
}

function withEvidenceReports(
  metrics: AcquisitionReadinessMetrics,
  evidence: {
    salesMotion: SalesMotionReadinessReport | undefined;
    enterpriseLogoExpansion: EnterpriseLogoExpansionReport | undefined;
    commercialCredits: CommercialCreditReport | undefined;
    strategicOutreach: StrategicOutreachReport | undefined;
    northStar: NorthStarReport | undefined;
    unityAdoption: UnityPluginAdoptionReport | undefined;
    businessModelProof: BusinessModelProofReport | undefined;
  },
): AcquisitionReadinessMetrics {
  return {
    ...metrics,
    arrUsd: Math.max(
      metrics.arrUsd,
      evidence.salesMotion?.metrics.arrUsd ?? 0,
    ),
    shippedCommercialGameCredits: Math.max(
      metrics.shippedCommercialGameCredits,
      evidence.commercialCredits?.summary.verifiedCommercialCredits ?? 0,
    ),
    enterpriseLogos: Math.max(
      metrics.enterpriseLogos,
      evidence.enterpriseLogoExpansion?.metrics.activeEnterpriseLogos ?? 0,
    ),
    nrr: Math.max(
      metrics.nrr,
      evidence.enterpriseLogoExpansion?.metrics.netRevenueRetention ?? 0,
    ),
    strategicConversations: Math.max(
      metrics.strategicConversations,
      evidence.strategicOutreach?.summary.initiatedTargetConversations ?? 0,
    ),
    termSheetValuationUsd: Math.max(
      metrics.termSheetValuationUsd,
      evidence.strategicOutreach?.summary.highestValuationUsd ?? 0,
    ),
    weeklyActiveDesignersShippingToEngines: Math.max(
      metrics.weeklyActiveDesignersShippingToEngines,
      evidence.northStar?.summary.weeklyActiveDesignersShippingToEngines ?? 0,
    ),
    unityVerifiedSolution: metrics.unityVerifiedSolution
      || evidence.unityAdoption?.metrics.unityVerifiedSolutionAchieved === true,
    payingUnityPluginCustomers: Math.max(
      metrics.payingUnityPluginCustomers,
      evidence.unityAdoption?.metrics.payingCustomers ?? 0,
    ),
    managedInferenceArrUsd: Math.max(
      metrics.managedInferenceArrUsd,
      evidence.businessModelProof?.summary.managedInferenceArrUsd ?? 0,
    ),
    proModuleRevenueShare: Math.max(
      metrics.proModuleRevenueShare,
      evidence.businessModelProof?.summary.proModuleRevenueShare ?? 0,
    ),
    marketplaceGmvMonthlyUsd: Math.max(
      metrics.marketplaceGmvMonthlyUsd,
      evidence.businessModelProof?.summary.marketplaceMonthlyGmvUsd ?? 0,
    ),
    activePlaytestStudios: Math.max(
      metrics.activePlaytestStudios,
      evidence.businessModelProof?.summary.playtestActiveStudios ?? 0,
    ),
  };
}

function revenueEvidenceReady(
  metrics: AcquisitionReadinessMetrics,
  salesMotion: SalesMotionReadinessReport | undefined,
): boolean {
  return Boolean(
    salesMotion
      && metrics.arrUsd >= 5_000_000
      && salesMotion.metrics.arrUsd >= 5_000_000
      && salesMotion.summary.status !== 'fail'
      && salesMotion.summary.revenueProofReady,
  );
}

function valuationOutcomeEvidenceReady(
  metrics: AcquisitionReadinessMetrics,
  strategicOutreach: StrategicOutreachReport | undefined,
): boolean {
  return Boolean(
    strategicOutreach
      && strategicOutreach.summary.exitOutcomeEvidence
      && strategicOutreach.summary.highestValuationUsd >= 200_000_000
      && Math.max(metrics.termSheetValuationUsd, strategicOutreach.summary.highestValuationUsd) >= 200_000_000,
  );
}

function northStarEngineShippingReady(
  metrics: AcquisitionReadinessMetrics,
  northStar: NorthStarReport | undefined,
): boolean {
  return Boolean(
    northStar
      && metrics.weeklyActiveDesignersShippingToEngines >= 30_000
      && northStar.summary.weeklyActiveDesignersShippingToEngines >= 30_000
      && northStar.engines.unity.exportingDesigners > 0
      && northStar.engines.unreal.exportingDesigners > 0
      && northStar.engines.godot.exportingDesigners > 0,
  );
}

function enterpriseLogoScaleReady(
  metrics: AcquisitionReadinessMetrics,
  enterpriseLogoExpansion: EnterpriseLogoExpansionReport | undefined,
): boolean {
  return Boolean(
    enterpriseLogoExpansion
      && metrics.enterpriseLogos >= 50
      && enterpriseLogoExpansion.summary.status === 'pass'
      && enterpriseLogoExpansion.summary.readyFor50LogoScale
      && enterpriseLogoExpansion.summary.missionEnterpriseGate,
  );
}

function nrrExpansionEvidenceReady(
  metrics: AcquisitionReadinessMetrics,
  enterpriseLogoExpansion: EnterpriseLogoExpansionReport | undefined,
): boolean {
  if (!enterpriseLogoExpansion) return false;
  const nrrExpansion = enterpriseLogoExpansion.checks.find((check) => check.id === 'nrr-expansion');
  return metrics.nrr >= 1.2
    && enterpriseLogoExpansion.metrics.netRevenueRetention >= 1.2
    && enterpriseLogoExpansion.metrics.expansionArrUsd > 0
    && nrrExpansion?.status === 'pass';
}

function trustCertificationEvidenceReady(
  metrics: AcquisitionReadinessMetrics,
  certificationRoadmap: CertificationRoadmapReport | undefined,
): boolean {
  return soc2Type2EvidenceReady(metrics, certificationRoadmap)
    && iso27001EvidenceReady(metrics, certificationRoadmap);
}

function soc2Type2EvidenceReady(
  metrics: AcquisitionReadinessMetrics,
  certificationRoadmap: CertificationRoadmapReport | undefined,
): boolean {
  const milestone = certificationRoadmap
    ? certificationMilestone(certificationRoadmap, 'soc2-type-ii')
    : undefined;
  return Boolean(
    metrics.soc2Type2Achieved
      && certificationRoadmap
      && certificationRoadmap.summary.blocked === 0
      && milestone?.status === 'ready'
      && milestone.blockers.length === 0
      && milestone.evidence.every((item) => item.status === 'pass'),
  );
}

function iso27001EvidenceReady(
  metrics: AcquisitionReadinessMetrics,
  certificationRoadmap: CertificationRoadmapReport | undefined,
): boolean {
  const milestone = certificationRoadmap
    ? certificationMilestone(certificationRoadmap, 'iso-27001')
    : undefined;
  const isoClaimed = metrics.iso27001Status === 'in-progress' || metrics.iso27001Status === 'achieved';
  return Boolean(
    isoClaimed
      && certificationRoadmap
      && certificationRoadmap.summary.blocked === 0
      && milestone
      && (milestone.status === 'ready' || milestone.status === 'on-track')
      && milestone.blockers.length === 0
      && milestone.evidence.every((item) => item.status !== 'fail'),
  );
}

function certificationMilestone(
  certificationRoadmap: CertificationRoadmapReport,
  id: CertificationMilestone['id'],
): CertificationMilestone | undefined {
  return certificationRoadmap.milestones.find((milestone) => milestone.id === id);
}

function thresholdCheck(input: {
  id: string;
  label: string;
  value: number;
  passAt: number;
  warnAt: number;
  current: string;
  target: string;
  owner: string;
  detail: string;
  evidence: string[];
  remediation: string;
}): AcquisitionReadinessCheck {
  return {
    id: input.id,
    label: input.label,
    status: input.value >= input.passAt ? 'pass' : input.value >= input.warnAt ? 'warn' : 'fail',
    current: input.current,
    target: input.target,
    owner: input.owner,
    detail: input.detail,
    evidence: input.evidence,
    ...(input.value >= input.passAt ? {} : { remediation: input.remediation }),
  };
}

function booleanCheck(input: {
  id: string;
  label: string;
  value: boolean;
  target: string;
  owner: string;
  detail: string;
  evidence: string[];
  remediation: string;
}): AcquisitionReadinessCheck {
  return {
    id: input.id,
    label: input.label,
    status: input.value ? 'pass' : 'fail',
    current: input.value ? 'yes' : 'no',
    target: input.target,
    owner: input.owner,
    detail: input.detail,
    evidence: input.evidence,
    ...(input.value ? {} : { remediation: input.remediation }),
  };
}

function normalizeMetrics(input: AcquisitionReadinessMetricInput): AcquisitionReadinessMetrics {
  return {
    arrUsd: nonNegative(input.arrUsd),
    yoyGrowthRate: nonNegative(input.yoyGrowthRate),
    nrr: nonNegative(input.nrr),
    weeklyActiveDesignersShippingToEngines: nonNegative(input.weeklyActiveDesignersShippingToEngines),
    unityVerifiedSolution: input.unityVerifiedSolution === true,
    shippedCommercialGameCredits: nonNegative(input.shippedCommercialGameCredits),
    enterpriseLogos: nonNegative(input.enterpriseLogos),
    soc2Type2Achieved: input.soc2Type2Achieved === true,
    iso27001Status: isoStatuses.has(input.iso27001Status as Iso27001Status)
      ? input.iso27001Status as Iso27001Status
      : 'not-started',
    cleanCapTable: input.cleanCapTable === true,
    strategicConversations: nonNegative(input.strategicConversations),
    termSheetValuationUsd: nonNegative(input.termSheetValuationUsd),
    seriesBPostMoneyUsd: nonNegative(input.seriesBPostMoneyUsd),
    managedInferenceArrUsd: nonNegative(input.managedInferenceArrUsd),
    proModuleRevenueShare: nonNegative(input.proModuleRevenueShare),
    marketplaceGmvMonthlyUsd: nonNegative(input.marketplaceGmvMonthlyUsd),
    payingUnityPluginCustomers: nonNegative(input.payingUnityPluginCustomers),
    activePlaytestStudios: nonNegative(input.activePlaytestStudios),
  };
}

function nonNegative(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

function money(value: number): string {
  if (value >= 1_000_000) return `$${Number((value / 1_000_000).toFixed(1)).toLocaleString('en-US')}M`;
  if (value >= 1_000) return `$${Math.round(value / 1_000).toLocaleString('en-US')}K`;
  return `$${Math.round(value).toLocaleString('en-US')}`;
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function integer(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}

function escapeTableCell(value: string): string {
  return value.replace(/\|/gu, '\\|').replace(/\n/gu, ' ');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
