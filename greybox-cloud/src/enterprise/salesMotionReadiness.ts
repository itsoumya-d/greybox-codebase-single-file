// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import type { BusinessModelProofReport, BusinessModelProofStatus } from './businessModelProof.js';
import type { EnterpriseLogoExpansionReport, EnterpriseLogoExpansionStatus } from './enterpriseLogoExpansion.js';
import type { UnityPluginAdoptionReport, UnityPluginAdoptionStatus } from './unityPluginAdoption.js';

export type SalesMotionReadinessStatus = 'pass' | 'warn' | 'fail';

export interface SalesMotionMetricInput {
  monthSinceLaunch?: number;
  arrUsd?: number;
  indiePayingCustomers?: number;
  studioPayingCustomers?: number;
  founderOnboardedIndieCustomers?: number;
  founderOnboardedStudioCustomers?: number;
  enterpriseAccounts?: number;
  topEnterpriseAccountsFounderOwned?: number;
  firstAeHired?: boolean;
  salesTeamHeadcount?: number;
  accountsAbove40kAcv?: number;
  csmCovered40kAccounts?: number;
  qualifiedPipelineArrUsd?: number;
  vcRaisedUsd?: number;
  vcRaisedBeforeOneMillionArr?: boolean;
}

export interface SalesMotionMetrics {
  monthSinceLaunch: number;
  arrUsd: number;
  indiePayingCustomers: number;
  studioPayingCustomers: number;
  founderOnboardedIndieCustomers: number;
  founderOnboardedStudioCustomers: number;
  enterpriseAccounts: number;
  topEnterpriseAccountsFounderOwned: number;
  firstAeHired: boolean;
  salesTeamHeadcount: number;
  accountsAbove40kAcv: number;
  csmCovered40kAccounts: number;
  qualifiedPipelineArrUsd: number;
  vcRaisedUsd: number;
  vcRaisedBeforeOneMillionArr: boolean;
}

export interface SalesMotionReadinessCheck {
  id: string;
  label: string;
  status: SalesMotionReadinessStatus;
  current: string;
  target: string;
  owner: string;
  detail: string;
  evidence: string[];
  remediation?: string;
}

export interface SalesMotionReadinessReport {
  generatedAt: string;
  disclaimer: string;
  targets: {
    month6ArrUsd: number;
    month12ArrUsd: number;
    month24ArrUsd: number;
    month36ArrUsd: number;
    pipelineCoverageMultiple: number;
    founderOwnedEnterpriseAccounts: number;
  };
  metrics: SalesMotionMetrics;
  summary: {
    status: SalesMotionReadinessStatus;
    checks: number;
    pass: number;
    warn: number;
    fail: number;
    currentRevenueTargetUsd: number;
    nextRevenueTargetUsd: number;
    nextRevenueGapUsd: number;
    pipelineCoverageRatio: number;
    paidSelfServeCustomers: number;
    founderOnboardedSelfServeCustomers: number;
    founderOnboardingCoverage: number;
    noVcBeforePmf: boolean;
    businessModelProofStatus: BusinessModelProofStatus | 'missing';
    unityAdoptionStatus: UnityPluginAdoptionStatus | 'missing';
    enterpriseLogoExpansionStatus: EnterpriseLogoExpansionStatus | 'missing';
    revenueProofReady: boolean;
    unityPluginSalesProofReady: boolean;
    enterpriseAccountProofReady: boolean;
    readyForNextRevenueMilestone: boolean;
  };
  checks: SalesMotionReadinessCheck[];
  businessModelProof?: BusinessModelProofReport['summary'];
  unityAdoption?: UnityPluginAdoptionReport['summary'];
  enterpriseLogoExpansion?: EnterpriseLogoExpansionReport['summary'];
}

const month6ArrUsd = 100_000;
const month12ArrUsd = 1_000_000;
const month24ArrUsd = 5_000_000;
const month36ArrUsd = 10_000_000;
const pipelineCoverageMultiple = 3;
const founderOwnedEnterpriseAccounts = 5;

export function salesMotionMetricsFromEnv(
  env: Record<string, string | undefined> = process.env,
): SalesMotionMetricInput {
  const raw = env.GREYBOX_SALES_MOTION_METRICS_JSON;
  if (!raw?.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!isRecord(parsed)) return {};
    return {
      ...optionalNumber('monthSinceLaunch', parsed.monthSinceLaunch),
      ...optionalNumber('arrUsd', parsed.arrUsd),
      ...optionalNumber('indiePayingCustomers', parsed.indiePayingCustomers),
      ...optionalNumber('studioPayingCustomers', parsed.studioPayingCustomers),
      ...optionalNumber('founderOnboardedIndieCustomers', parsed.founderOnboardedIndieCustomers),
      ...optionalNumber('founderOnboardedStudioCustomers', parsed.founderOnboardedStudioCustomers),
      ...optionalNumber('enterpriseAccounts', parsed.enterpriseAccounts),
      ...optionalNumber('topEnterpriseAccountsFounderOwned', parsed.topEnterpriseAccountsFounderOwned),
      ...optionalBool('firstAeHired', parsed.firstAeHired),
      ...optionalNumber('salesTeamHeadcount', parsed.salesTeamHeadcount),
      ...optionalNumber('accountsAbove40kAcv', parsed.accountsAbove40kAcv),
      ...optionalNumber('csmCovered40kAccounts', parsed.csmCovered40kAccounts),
      ...optionalNumber('qualifiedPipelineArrUsd', parsed.qualifiedPipelineArrUsd),
      ...optionalNumber('vcRaisedUsd', parsed.vcRaisedUsd),
      ...optionalBool('vcRaisedBeforeOneMillionArr', parsed.vcRaisedBeforeOneMillionArr),
    };
  } catch {
    return {};
  }
}

export function buildSalesMotionReadinessReport(options: {
  metrics?: SalesMotionMetricInput;
  businessModelProofReport?: BusinessModelProofReport;
  unityAdoptionReport?: UnityPluginAdoptionReport;
  enterpriseLogoExpansionReport?: EnterpriseLogoExpansionReport;
  now?: Date;
} = {}): SalesMotionReadinessReport {
  const evidence = {
    businessModelProofReport: options.businessModelProofReport,
    unityAdoptionReport: options.unityAdoptionReport,
    enterpriseLogoExpansionReport: options.enterpriseLogoExpansionReport,
  };
  const metrics = withEvidenceReports(normalizeMetrics(options.metrics ?? salesMotionMetricsFromEnv()), evidence);
  const checks = buildChecks(metrics, evidence);
  const pass = checks.filter((check) => check.status === 'pass').length;
  const warn = checks.filter((check) => check.status === 'warn').length;
  const fail = checks.filter((check) => check.status === 'fail').length;
  const paidSelfServeCustomers = metrics.indiePayingCustomers + metrics.studioPayingCustomers;
  const founderOnboardedSelfServeCustomers = metrics.founderOnboardedIndieCustomers
    + metrics.founderOnboardedStudioCustomers;
  const currentRevenueTargetUsd = currentRevenueTarget(metrics.monthSinceLaunch);
  const nextRevenueTargetUsd = nextRevenueTarget(metrics.monthSinceLaunch, metrics.arrUsd);
  const nextRevenueGapUsd = Math.max(0, nextRevenueTargetUsd - metrics.arrUsd);
  const pipelineCoverageRatio = nextRevenueGapUsd > 0
    ? metrics.qualifiedPipelineArrUsd / nextRevenueGapUsd
    : pipelineCoverageMultiple;
  return {
    generatedAt: (options.now ?? new Date()).toISOString(),
    disclaimer: 'Sales motion readiness is internal operating evidence only. Stripe revenue, CRM stage exports, onboarding notes, payroll records, board approvals, and financing documents remain authoritative. Do not include customer names, contacts, private deal notes, credentials, or investor term sheets in the metrics JSON.',
    targets: {
      month6ArrUsd,
      month12ArrUsd,
      month24ArrUsd,
      month36ArrUsd,
      pipelineCoverageMultiple,
      founderOwnedEnterpriseAccounts,
    },
    metrics,
    summary: {
      status: fail > 0 ? 'fail' : warn > 0 ? 'warn' : 'pass',
      checks: checks.length,
      pass,
      warn,
      fail,
      currentRevenueTargetUsd,
      nextRevenueTargetUsd,
      nextRevenueGapUsd,
      pipelineCoverageRatio,
      paidSelfServeCustomers,
      founderOnboardedSelfServeCustomers,
      founderOnboardingCoverage: paidSelfServeCustomers > 0
        ? founderOnboardedSelfServeCustomers / paidSelfServeCustomers
        : 1,
      noVcBeforePmf: !metrics.vcRaisedBeforeOneMillionArr && !(metrics.vcRaisedUsd > 0 && metrics.arrUsd < month12ArrUsd),
      businessModelProofStatus: evidence.businessModelProofReport?.summary.status ?? 'missing',
      unityAdoptionStatus: evidence.unityAdoptionReport?.summary.status ?? 'missing',
      enterpriseLogoExpansionStatus: evidence.enterpriseLogoExpansionReport?.summary.status ?? 'missing',
      revenueProofReady: revenueProofReady(evidence.businessModelProofReport),
      unityPluginSalesProofReady: unityPluginSalesProofReady(metrics, evidence.unityAdoptionReport),
      enterpriseAccountProofReady: enterpriseAccountProofReady(metrics, evidence.enterpriseLogoExpansionReport),
      readyForNextRevenueMilestone: checks.every((check) => check.status !== 'fail'),
    },
    checks,
    ...(evidence.businessModelProofReport ? { businessModelProof: evidence.businessModelProofReport.summary } : {}),
    ...(evidence.unityAdoptionReport ? { unityAdoption: evidence.unityAdoptionReport.summary } : {}),
    ...(evidence.enterpriseLogoExpansionReport ? { enterpriseLogoExpansion: evidence.enterpriseLogoExpansionReport.summary } : {}),
  };
}

export function formatSalesMotionReadinessMarkdown(report: SalesMotionReadinessReport): string {
  const lines = [
    '# Greybox Sales Motion Readiness',
    '',
    `Generated: ${report.generatedAt}`,
    `Status: ${report.summary.status}`,
    `Ready for next revenue milestone: ${report.summary.readyForNextRevenueMilestone ? 'yes' : 'no'}`,
    `Disclaimer: ${report.disclaimer}`,
    '',
    '## Summary',
    '',
    `- Month since launch: ${report.metrics.monthSinceLaunch}`,
    `- ARR: ${money(report.metrics.arrUsd)}`,
    `- Current milestone target: ${money(report.summary.currentRevenueTargetUsd)}`,
    `- Next milestone target: ${money(report.summary.nextRevenueTargetUsd)}`,
    `- Pipeline coverage: ${Number(report.summary.pipelineCoverageRatio.toFixed(2))}x`,
    `- Founder-led onboarding coverage: ${percent(report.summary.founderOnboardingCoverage)}`,
    `- No VC before $1M ARR: ${report.summary.noVcBeforePmf ? 'yes' : 'no'}`,
    `- Revenue proof ready: ${report.summary.revenueProofReady ? 'yes' : 'no'}`,
    `- Unity plugin sales proof ready: ${report.summary.unityPluginSalesProofReady ? 'yes' : 'no'}`,
    `- Enterprise account proof ready: ${report.summary.enterpriseAccountProofReady ? 'yes' : 'no'}`,
    '',
    '## Checks',
    '',
    '| Check | Status | Current | Target | Owner |',
    '| --- | --- | --- | --- | --- |',
  ];
  for (const check of report.checks) {
    lines.push(`| ${escapeTableCell(check.label)} | ${check.status} | ${escapeTableCell(check.current)} | ${escapeTableCell(check.target)} | ${escapeTableCell(check.owner)} |`);
  }
  lines.push('');
  return lines.join('\n');
}

type SalesMotionEvidenceReports = {
  businessModelProofReport: BusinessModelProofReport | undefined;
  unityAdoptionReport: UnityPluginAdoptionReport | undefined;
  enterpriseLogoExpansionReport: EnterpriseLogoExpansionReport | undefined;
};

function buildChecks(
  metrics: SalesMotionMetrics,
  evidence: SalesMotionEvidenceReports,
): SalesMotionReadinessCheck[] {
  return [
    revenueMilestoneCheck(metrics),
    revenueProofCheck(metrics, evidence.businessModelProofReport),
    unityPluginSalesProofCheck(metrics, evidence.unityAdoptionReport),
    founderLedOnboardingCheck(metrics),
    aeSequencingCheck(metrics),
    enterpriseAccountProofCheck(metrics, evidence.enterpriseLogoExpansionReport),
    enterpriseFounderOwnershipCheck(metrics),
    customerSuccessCoverageCheck(metrics),
    pipelineCoverageCheck(metrics),
    ventureDisciplineCheck(metrics),
  ];
}

function withEvidenceReports(
  metrics: SalesMotionMetrics,
  evidence: SalesMotionEvidenceReports,
): SalesMotionMetrics {
  const businessModel = evidence.businessModelProofReport?.summary;
  const enterpriseExpansion = evidence.enterpriseLogoExpansionReport;
  const enterpriseMetrics = enterpriseExpansion?.metrics;
  const enterpriseSummary = enterpriseExpansion?.summary;
  const evidencedArr = (businessModel?.managedInferenceArrUsd ?? 0)
    + (enterpriseSummary?.estimatedEnterpriseArrUsd ?? 0);
  return normalizeMetrics({
    ...metrics,
    arrUsd: Math.max(metrics.arrUsd, evidencedArr),
    enterpriseAccounts: Math.max(metrics.enterpriseAccounts, enterpriseMetrics?.activeEnterpriseLogos ?? 0),
    accountsAbove40kAcv: Math.max(metrics.accountsAbove40kAcv, enterpriseMetrics?.activeEnterpriseLogos ?? 0),
    csmCovered40kAccounts: Math.max(metrics.csmCovered40kAccounts, enterpriseMetrics?.csmAssignedLogos ?? 0),
    qualifiedPipelineArrUsd: Math.max(
      metrics.qualifiedPipelineArrUsd,
      (enterpriseMetrics?.qualifiedPipelineAccounts ?? 0) * (enterpriseMetrics?.averageAcvUsd ?? 0),
    ),
  });
}

function revenueMilestoneCheck(metrics: SalesMotionMetrics): SalesMotionReadinessCheck {
  const target = currentRevenueTarget(metrics.monthSinceLaunch);
  const previous = previousRevenueTarget(metrics.monthSinceLaunch);
  const status: SalesMotionReadinessStatus = metrics.arrUsd >= target
    ? 'pass'
    : metrics.arrUsd >= Math.max(previous, Math.floor(target * 0.7))
      ? 'warn'
      : 'fail';
  return {
    id: 'revenue-milestone',
    label: 'ARR milestone',
    status,
    current: `${money(metrics.arrUsd)} at month ${metrics.monthSinceLaunch}`,
    target: `${money(target)} by current milestone; ${money(month36ArrUsd)} by month 36`,
    owner: 'Founder / Revenue',
    detail: 'The sales motion only compounds acquisition value if ARR stays on the $100K, $1M, $5M, and $10M path.',
    evidence: ['Stripe ARR dashboard', 'finance revenue rollup', 'weekly build-status KPI section'],
    ...(status === 'pass' ? {} : { remediation: 'Prioritize founder-led activation into paid Indie, Studio, and Enterprise expansion before adding new surface area.' }),
  };
}

function revenueProofCheck(
  metrics: SalesMotionMetrics,
  businessModelProof: BusinessModelProofReport | undefined,
): SalesMotionReadinessCheck {
  const proofRequired = metrics.monthSinceLaunch >= 12 || metrics.arrUsd >= month12ArrUsd;
  const proofRecommended = metrics.arrUsd >= month6ArrUsd;
  if (!businessModelProof) {
    const status: SalesMotionReadinessStatus = proofRequired
      ? 'fail'
      : proofRecommended
        ? 'warn'
        : 'pass';
    return {
      id: 'revenue-source-proof',
      label: 'Revenue source proof',
      status,
      current: `${money(metrics.arrUsd)} ARR, no business-model proof packet`,
      target: '$1M+ ARR claims backed by managed inference, Pro, marketplace, or playtest proof',
      owner: 'Revenue Operations',
      detail: 'Revenue milestone claims need source proof before they can support financing or strategic-buyer readiness.',
      evidence: ['GET /v1/strategy/business-model-proof', 'Stripe ARR dashboard', 'provider reconciliation', 'Pro and marketplace ledgers'],
      ...(status === 'pass' ? {} : { remediation: 'Generate the business-model proof packet before treating ARR milestone progress as diligence-ready.' }),
    };
  }
  const ready = revenueProofReady(businessModelProof);
  const status: SalesMotionReadinessStatus = ready
    ? 'pass'
    : businessModelProof.summary.warn > 0 || businessModelProof.summary.pass > 0
      ? 'warn'
      : 'fail';
  return {
    id: 'revenue-source-proof',
    label: 'Revenue source proof',
    status,
    current: `business model ${businessModelProof.summary.status}, managed inference ${money(businessModelProof.summary.managedInferenceArrUsd)}, Pro ${percent(businessModelProof.summary.proModuleRevenueShare)}, marketplace ${money(businessModelProof.summary.marketplaceMonthlyGmvUsd)}`,
    target: '$1M+ ARR claims backed by managed inference, Pro, marketplace, or playtest proof',
    owner: 'Revenue Operations',
    detail: 'Revenue milestone claims need source proof before they can support financing or strategic-buyer readiness.',
    evidence: ['GET /v1/strategy/business-model-proof', 'Stripe ARR dashboard', 'provider reconciliation', 'Pro and marketplace ledgers'],
    ...(status === 'pass' ? {} : { remediation: 'Attach billing, marketplace, Pro, or playtest evidence before counting revenue as diligence-ready.' }),
  };
}

function unityPluginSalesProofCheck(
  metrics: SalesMotionMetrics,
  unityAdoption: UnityPluginAdoptionReport | undefined,
): SalesMotionReadinessCheck {
  const paidSelfServe = metrics.indiePayingCustomers + metrics.studioPayingCustomers;
  const proofRequired = paidSelfServe > 0 || metrics.arrUsd >= month6ArrUsd;
  if (!unityAdoption) {
    const status: SalesMotionReadinessStatus = proofRequired ? 'fail' : 'pass';
    return {
      id: 'unity-plugin-sales-proof',
      label: 'Unity plugin sales proof',
      status,
      current: `${paidSelfServe} Indie+Studio paying customer(s), no Unity adoption packet`,
      target: 'Self-serve sales motion backed by Unity plugin paid adoption and source proof',
      owner: 'Revenue / Unity Plugin',
      detail: 'The Unity plugin is the paid wedge; sales readiness should not count self-serve demand without plugin adoption proof.',
      evidence: ['GET /v1/strategy/unity-plugin-adoption', 'Asset Store sales export', 'license validation logs'],
      ...(status === 'pass' ? {} : { remediation: 'Generate Unity adoption proof before counting self-serve customers in sales readiness.' }),
    };
  }
  const ready = unityPluginSalesProofReady(metrics, unityAdoption);
  const status: SalesMotionReadinessStatus = ready
    ? 'pass'
    : unityAdoption.metrics.payingCustomers > 0 && unityAdoption.metrics.sourceAdoptionReady
      ? 'warn'
      : 'fail';
  return {
    id: 'unity-plugin-sales-proof',
    label: 'Unity plugin sales proof',
    status,
    current: `${unityAdoption.metrics.payingCustomers} Unity paying customer(s), source ${unityAdoption.metrics.sourceAdoptionReady ? 'ready' : 'blocked'}, Unreal gate ${unityAdoption.summary.readyForUnrealExpansion ? 'ready' : 'blocked'}`,
    target: 'Self-serve sales motion backed by Unity plugin paid adoption and source proof',
    owner: 'Revenue / Unity Plugin',
    detail: 'The Unity plugin is the paid wedge; sales readiness should not count self-serve demand without plugin adoption proof.',
    evidence: ['GET /v1/strategy/unity-plugin-adoption', 'Asset Store sales export', 'license validation logs'],
    ...(status === 'pass' ? {} : { remediation: 'Convert more Unity plugin customers and keep the source adoption packet current.' }),
  };
}

function founderLedOnboardingCheck(metrics: SalesMotionMetrics): SalesMotionReadinessCheck {
  const paid = metrics.indiePayingCustomers + metrics.studioPayingCustomers;
  const onboarded = metrics.founderOnboardedIndieCustomers + metrics.founderOnboardedStudioCustomers;
  const requiredCoverage = metrics.monthSinceLaunch <= 6 ? 1 : 0.75;
  const coverage = paid > 0 ? onboarded / paid : 1;
  const status: SalesMotionReadinessStatus = coverage >= requiredCoverage
    ? 'pass'
    : coverage >= 0.5
      ? 'warn'
      : 'fail';
  return {
    id: 'founder-led-onboarding',
    label: 'Founder-led onboarding',
    status,
    current: `${onboarded}/${paid} Indie+Studio paying customer(s) founder-onboarded`,
    target: metrics.monthSinceLaunch <= 6
      ? '100% founder onboarding through month 6'
      : 'Founder loop remains close enough to preserve learning velocity',
    owner: 'Founder',
    detail: 'Before product-market fit, every paying Indie and Studio customer should teach the product what to build next.',
    evidence: ['onboarding call ledger', 'CRM aggregate export', 'customer success notes'],
    ...(status === 'pass' ? {} : { remediation: 'Schedule founder onboarding for every new Indie and Studio customer before delegating onboarding.' }),
  };
}

function aeSequencingCheck(metrics: SalesMotionMetrics): SalesMotionReadinessCheck {
  const prematureTeam = metrics.monthSinceLaunch < 6 && metrics.salesTeamHeadcount > 0;
  const needsAe = metrics.monthSinceLaunch >= 6 || metrics.arrUsd >= month6ArrUsd;
  const status: SalesMotionReadinessStatus = prematureTeam
    ? 'warn'
    : needsAe && !metrics.firstAeHired
      ? 'warn'
      : metrics.monthSinceLaunch >= 18 && (metrics.salesTeamHeadcount < 3 || metrics.salesTeamHeadcount > 5)
        ? 'warn'
        : 'pass';
  return {
    id: 'sales-hiring-sequence',
    label: 'Sales hiring sequence',
    status,
    current: `${metrics.salesTeamHeadcount} sales headcount, first AE hired: ${metrics.firstAeHired ? 'yes' : 'no'}`,
    target: 'Founder-led 0-6 months; first AE 6-18 months; 3-5 salespeople by months 18-36',
    owner: 'Founder / Revenue',
    detail: 'Hiring should follow validated demand instead of replacing founder learning too early.',
    evidence: ['hiring plan', 'payroll roster', 'CRM ownership report'],
    ...(status === 'pass' ? {} : { remediation: 'Keep founder-led sales until $100K ARR, then add one AE focused on Studio and Enterprise.' }),
  };
}

function enterpriseAccountProofCheck(
  metrics: SalesMotionMetrics,
  enterpriseLogoExpansion: EnterpriseLogoExpansionReport | undefined,
): SalesMotionReadinessCheck {
  const proofRequired = metrics.enterpriseAccounts > 0 || metrics.accountsAbove40kAcv > 0;
  if (!enterpriseLogoExpansion) {
    const status: SalesMotionReadinessStatus = proofRequired ? 'fail' : 'pass';
    return {
      id: 'enterprise-account-proof',
      label: 'Enterprise account proof',
      status,
      current: `${metrics.enterpriseAccounts} enterprise account(s), no enterprise-logo packet`,
      target: 'Enterprise account claims backed by the enterprise logo expansion packet',
      owner: 'Revenue / Customer Success',
      detail: 'Enterprise claims need signed-logo, ACV, control, and customer-success evidence before sales readiness can rely on them.',
      evidence: ['GET /v1/enterprise/logo-expansion-readiness', 'signed order forms', 'CRM aggregate export', 'customer-success account map'],
      ...(status === 'pass' ? {} : { remediation: 'Generate the enterprise logo expansion packet before counting enterprise accounts in sales readiness.' }),
    };
  }
  const ready = enterpriseAccountProofReady(metrics, enterpriseLogoExpansion);
  const status: SalesMotionReadinessStatus = ready
    ? 'pass'
    : enterpriseLogoExpansion.metrics.activeEnterpriseLogos > 0
      ? 'warn'
      : 'fail';
  return {
    id: 'enterprise-account-proof',
    label: 'Enterprise account proof',
    status,
    current: `${enterpriseLogoExpansion.metrics.activeEnterpriseLogos} active logo(s), first five ${enterpriseLogoExpansion.summary.firstFiveLogosSecured ? 'secured' : 'not secured'}, support ${enterpriseLogoExpansion.summary.supportSlaStatus}`,
    target: 'Enterprise account claims backed by the enterprise logo expansion packet',
    owner: 'Revenue / Customer Success',
    detail: 'Enterprise claims need signed-logo, ACV, control, and customer-success evidence before sales readiness can rely on them.',
    evidence: ['GET /v1/enterprise/logo-expansion-readiness', 'signed order forms', 'CRM aggregate export', 'customer-success account map'],
    ...(status === 'pass' ? {} : { remediation: 'Attach logo, ACV, CSM, and procurement evidence before counting enterprise sales readiness.' }),
  };
}

function enterpriseFounderOwnershipCheck(metrics: SalesMotionMetrics): SalesMotionReadinessCheck {
  const required = Math.min(founderOwnedEnterpriseAccounts, metrics.enterpriseAccounts);
  const status: SalesMotionReadinessStatus = metrics.topEnterpriseAccountsFounderOwned >= required
    ? 'pass'
    : metrics.topEnterpriseAccountsFounderOwned > 0
      ? 'warn'
      : 'fail';
  return {
    id: 'top-enterprise-founder-owned',
    label: 'Top enterprise account ownership',
    status,
    current: `${metrics.topEnterpriseAccountsFounderOwned}/${required} top enterprise account(s) founder-owned`,
    target: 'Founder owns the top five Enterprise accounts',
    owner: 'Founder',
    detail: 'The highest-ACV accounts teach pricing, procurement, and strategic-buyer language.',
    evidence: ['CRM account ownership export', 'founder enterprise meeting ledger'],
    ...(status === 'pass' ? {} : { remediation: 'Founder should directly own the top Enterprise accounts until the repeatable motion is proven.' }),
  };
}

function customerSuccessCoverageCheck(metrics: SalesMotionMetrics): SalesMotionReadinessCheck {
  const status: SalesMotionReadinessStatus = metrics.accountsAbove40kAcv === 0
    || metrics.csmCovered40kAccounts >= metrics.accountsAbove40kAcv
    ? 'pass'
    : metrics.csmCovered40kAccounts > 0
      ? 'warn'
      : 'fail';
  return {
    id: 'csm-coverage',
    label: 'CSM coverage for $40K+ ACV',
    status,
    current: `${metrics.csmCovered40kAccounts}/${metrics.accountsAbove40kAcv} $40K+ ACV account(s) CSM-covered`,
    target: 'Named CSM coverage for every $40K+ ACV account',
    owner: 'Customer Success',
    detail: 'Enterprise ARR compounds through retention and expansion only when high-ACV accounts have named ownership.',
    evidence: ['CSM account map', 'QBR log', 'renewal risk register'],
    ...(status === 'pass' ? {} : { remediation: 'Assign named CSM ownership before adding more $40K+ ACV accounts.' }),
  };
}

function pipelineCoverageCheck(metrics: SalesMotionMetrics): SalesMotionReadinessCheck {
  const nextTarget = nextRevenueTarget(metrics.monthSinceLaunch, metrics.arrUsd);
  const gap = Math.max(0, nextTarget - metrics.arrUsd);
  const coverage = gap > 0 ? metrics.qualifiedPipelineArrUsd / gap : pipelineCoverageMultiple;
  const status: SalesMotionReadinessStatus = coverage >= pipelineCoverageMultiple
    ? 'pass'
    : coverage >= 1.5
      ? 'warn'
      : 'fail';
  return {
    id: 'qualified-pipeline-coverage',
    label: 'Qualified pipeline coverage',
    status,
    current: `${money(metrics.qualifiedPipelineArrUsd)} pipeline, ${Number(coverage.toFixed(2))}x coverage`,
    target: `3x qualified ARR pipeline coverage for the ${money(gap)} next-milestone gap`,
    owner: 'Revenue Operations',
    detail: 'The ARR plan needs enough qualified demand to survive slow studio procurement and long game production cycles.',
    evidence: ['CRM stage export', 'founder-led sales review', 'pipeline qualification rubric'],
    ...(status === 'pass' ? {} : { remediation: 'Build more qualified Studio and Enterprise pipeline before scaling spend or headcount.' }),
  };
}

function ventureDisciplineCheck(metrics: SalesMotionMetrics): SalesMotionReadinessCheck {
  const failed = metrics.vcRaisedBeforeOneMillionArr || (metrics.vcRaisedUsd > 0 && metrics.arrUsd < month12ArrUsd);
  return {
    id: 'vc-discipline',
    label: 'No VC before $1M ARR',
    status: failed ? 'fail' : 'pass',
    current: `${money(metrics.vcRaisedUsd)} VC raised, ARR ${money(metrics.arrUsd)}`,
    target: 'Bootstrap until $1M ARR so financing preserves strategic optionality',
    owner: 'Founder / Finance',
    detail: 'Dilution before product-market fit weakens exit optionality and strategic negotiation leverage.',
    evidence: ['cap table', 'board approvals', 'financing documents'],
    ...(failed ? { remediation: 'Do not pursue priced VC rounds before the $1M ARR leverage point; use customer revenue and grants instead.' } : {}),
  };
}

function currentRevenueTarget(monthSinceLaunch: number): number {
  if (monthSinceLaunch <= 6) return month6ArrUsd;
  if (monthSinceLaunch <= 12) return month12ArrUsd;
  if (monthSinceLaunch <= 24) return month24ArrUsd;
  return month36ArrUsd;
}

function previousRevenueTarget(monthSinceLaunch: number): number {
  if (monthSinceLaunch <= 6) return 0;
  if (monthSinceLaunch <= 12) return month6ArrUsd;
  if (monthSinceLaunch <= 24) return month12ArrUsd;
  return month24ArrUsd;
}

function nextRevenueTarget(monthSinceLaunch: number, arrUsd: number): number {
  if (arrUsd < month6ArrUsd || monthSinceLaunch < 6) return month6ArrUsd;
  if (arrUsd < month12ArrUsd || monthSinceLaunch < 12) return month12ArrUsd;
  if (arrUsd < month24ArrUsd || monthSinceLaunch < 24) return month24ArrUsd;
  return month36ArrUsd;
}

function revenueProofReady(businessModelProof: BusinessModelProofReport | undefined): boolean {
  return businessModelProof?.summary.acquisitionBusinessModelReady === true
    || businessModelProof?.summary.managedInferenceReady === true
    || businessModelProof?.summary.proModuleReady === true
    || businessModelProof?.summary.marketplaceReady === true
    || businessModelProof?.summary.playtestReady === true;
}

function unityPluginSalesProofReady(
  metrics: SalesMotionMetrics,
  unityAdoption: UnityPluginAdoptionReport | undefined,
): boolean {
  if (!unityAdoption) return false;
  const paidSelfServe = metrics.indiePayingCustomers + metrics.studioPayingCustomers;
  return unityAdoption.summary.readyForUnrealExpansion
    || (unityAdoption.metrics.sourceAdoptionReady
      && unityAdoption.metrics.payingCustomers >= Math.max(1, paidSelfServe));
}

function enterpriseAccountProofReady(
  metrics: SalesMotionMetrics,
  enterpriseLogoExpansion: EnterpriseLogoExpansionReport | undefined,
): boolean {
  if (!enterpriseLogoExpansion) return false;
  return enterpriseLogoExpansion.summary.firstFiveLogosSecured
    || enterpriseLogoExpansion.metrics.activeEnterpriseLogos >= Math.max(1, metrics.enterpriseAccounts);
}

function normalizeMetrics(input: SalesMotionMetricInput): SalesMotionMetrics {
  const metrics: SalesMotionMetrics = {
    monthSinceLaunch: nonNegative(input.monthSinceLaunch),
    arrUsd: nonNegative(input.arrUsd),
    indiePayingCustomers: nonNegative(input.indiePayingCustomers),
    studioPayingCustomers: nonNegative(input.studioPayingCustomers),
    founderOnboardedIndieCustomers: nonNegative(input.founderOnboardedIndieCustomers),
    founderOnboardedStudioCustomers: nonNegative(input.founderOnboardedStudioCustomers),
    enterpriseAccounts: nonNegative(input.enterpriseAccounts),
    topEnterpriseAccountsFounderOwned: nonNegative(input.topEnterpriseAccountsFounderOwned),
    firstAeHired: input.firstAeHired === true,
    salesTeamHeadcount: nonNegative(input.salesTeamHeadcount),
    accountsAbove40kAcv: nonNegative(input.accountsAbove40kAcv),
    csmCovered40kAccounts: nonNegative(input.csmCovered40kAccounts),
    qualifiedPipelineArrUsd: nonNegative(input.qualifiedPipelineArrUsd),
    vcRaisedUsd: nonNegative(input.vcRaisedUsd),
    vcRaisedBeforeOneMillionArr: input.vcRaisedBeforeOneMillionArr === true,
  };
  if (metrics.founderOnboardedIndieCustomers > metrics.indiePayingCustomers) {
    metrics.founderOnboardedIndieCustomers = metrics.indiePayingCustomers;
  }
  if (metrics.founderOnboardedStudioCustomers > metrics.studioPayingCustomers) {
    metrics.founderOnboardedStudioCustomers = metrics.studioPayingCustomers;
  }
  if (metrics.topEnterpriseAccountsFounderOwned > metrics.enterpriseAccounts) {
    metrics.topEnterpriseAccountsFounderOwned = metrics.enterpriseAccounts;
  }
  if (metrics.csmCovered40kAccounts > metrics.accountsAbove40kAcv) {
    metrics.csmCovered40kAccounts = metrics.accountsAbove40kAcv;
  }
  return metrics;
}

function optionalNumber(key: keyof SalesMotionMetricInput, value: unknown): Partial<SalesMotionMetricInput> {
  return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) && value >= 0
    ? { [key]: value }
    : {};
}

function optionalBool(key: keyof SalesMotionMetricInput, value: unknown): Partial<SalesMotionMetricInput> {
  return typeof value === 'boolean' ? { [key]: value } : {};
}

function nonNegative(value: number | undefined): number {
  return Number.isInteger(value) && value !== undefined && value >= 0 ? value : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function money(value: number): string {
  if (value >= 1_000_000) return `$${Number((value / 1_000_000).toFixed(2))}M`;
  if (value >= 1_000) return `$${Number((value / 1_000).toFixed(1))}K`;
  return `$${value}`;
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function escapeTableCell(value: string): string {
  return value.replace(/\|/gu, '\\|');
}
