// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import {
  buildSupportSlaReadinessReport,
  type SupportSlaReadinessReport,
  type SupportSlaTicketInput,
} from './supportSlaReadiness.js';
import type { EnterpriseContractPacket } from './contractPacket.js';
import type { TrustControlReport } from './trustControls.js';

export type EnterpriseLogoExpansionStatus = 'pass' | 'warn' | 'fail';

export interface EnterpriseLogoMetricInput {
  workosSsoLive?: boolean;
  scimLive?: boolean;
  auditExportLive?: boolean;
  onPremBundleLive?: boolean;
  privateNetworkingLive?: boolean;
  dataResidencyLive?: boolean;
  dpaMsaReady?: boolean;
  signedEnterpriseLogos?: number;
  activeEnterpriseLogos?: number;
  qualifiedPipelineAccounts?: number;
  pilotsInProgress?: number;
  averageAcvUsd?: number;
  enterpriseArrUsd?: number;
  netRevenueRetention?: number;
  expansionArrUsd?: number;
  churnedEnterpriseLogos?: number;
  securityReviewsPassed?: number;
  procurementPacketsSent?: number;
  ssoEnabledLogos?: number;
  scimEnabledLogos?: number;
  auditExportEnabledLogos?: number;
  onPremEnabledLogos?: number;
  privateNetworkEnabledLogos?: number;
  dataResidencyEnabledLogos?: number;
  csmAssignedLogos?: number;
  qbrsCompletedThisQuarter?: number;
  renewalRiskLogos?: number;
  referenceableLogos?: number;
  caseStudyApprovedLogos?: number;
}

export interface EnterpriseLogoMetrics {
  workosSsoLive: boolean;
  scimLive: boolean;
  auditExportLive: boolean;
  onPremBundleLive: boolean;
  privateNetworkingLive: boolean;
  dataResidencyLive: boolean;
  dpaMsaReady: boolean;
  signedEnterpriseLogos: number;
  activeEnterpriseLogos: number;
  qualifiedPipelineAccounts: number;
  pilotsInProgress: number;
  averageAcvUsd: number;
  enterpriseArrUsd: number;
  netRevenueRetention: number;
  expansionArrUsd: number;
  churnedEnterpriseLogos: number;
  securityReviewsPassed: number;
  procurementPacketsSent: number;
  ssoEnabledLogos: number;
  scimEnabledLogos: number;
  auditExportEnabledLogos: number;
  onPremEnabledLogos: number;
  privateNetworkEnabledLogos: number;
  dataResidencyEnabledLogos: number;
  csmAssignedLogos: number;
  qbrsCompletedThisQuarter: number;
  renewalRiskLogos: number;
  referenceableLogos: number;
  caseStudyApprovedLogos: number;
}

export interface EnterpriseLogoExpansionCheck {
  id: string;
  label: string;
  status: EnterpriseLogoExpansionStatus;
  current: string;
  target: string;
  owner: string;
  detail: string;
  evidence: string[];
  remediation?: string;
}

export interface EnterpriseLogoExpansionReport {
  generatedAt: string;
  disclaimer: string;
  targets: {
    firstEnterpriseLogos: number;
    missionEnterpriseLogos: number;
    targetAverageAcvUsd: number;
    minimumAcvUsd: number;
    targetNrr: number;
    pipelineCoverageMultiple: number;
    maxRenewalRiskRatio: number;
  };
  metrics: EnterpriseLogoMetrics;
  summary: {
    status: EnterpriseLogoExpansionStatus;
    checks: number;
    pass: number;
    warn: number;
    fail: number;
    firstFiveLogosSecured: boolean;
    readyFor50LogoScale: boolean;
    missionEnterpriseGate: boolean;
    logoGapToMission: number;
    estimatedEnterpriseArrUsd: number;
    pipelineCoverageRatio: number;
    supportSlaStatus: EnterpriseLogoExpansionStatus;
    trustControlProofStatus: EnterpriseLogoExpansionStatus | 'missing';
    contractPacketStatus: EnterpriseLogoExpansionStatus | 'missing';
    enterpriseControlProofReady: boolean;
    contractPacketReady: boolean;
  };
  checks: EnterpriseLogoExpansionCheck[];
  supportSla: SupportSlaReadinessReport['summary'];
  trustControls?: TrustControlReport['summary'];
  contractPacket?: EnterpriseContractPacket['summary'];
}

const missionEnterpriseLogos = 50;
const firstEnterpriseLogos = 5;

export function enterpriseLogoMetricsFromEnv(
  env: Record<string, string | undefined> = process.env,
): EnterpriseLogoMetricInput {
  const raw = env.GREYBOX_ENTERPRISE_LOGO_METRICS_JSON;
  if (!raw?.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!isRecord(parsed)) return {};
    return {
      ...optionalBool('workosSsoLive', parsed.workosSsoLive),
      ...optionalBool('scimLive', parsed.scimLive),
      ...optionalBool('auditExportLive', parsed.auditExportLive),
      ...optionalBool('onPremBundleLive', parsed.onPremBundleLive),
      ...optionalBool('privateNetworkingLive', parsed.privateNetworkingLive),
      ...optionalBool('dataResidencyLive', parsed.dataResidencyLive),
      ...optionalBool('dpaMsaReady', parsed.dpaMsaReady),
      ...optionalNumber('signedEnterpriseLogos', parsed.signedEnterpriseLogos),
      ...optionalNumber('activeEnterpriseLogos', parsed.activeEnterpriseLogos),
      ...optionalNumber('qualifiedPipelineAccounts', parsed.qualifiedPipelineAccounts),
      ...optionalNumber('pilotsInProgress', parsed.pilotsInProgress),
      ...optionalNumber('averageAcvUsd', parsed.averageAcvUsd),
      ...optionalNumber('enterpriseArrUsd', parsed.enterpriseArrUsd),
      ...optionalNumber('netRevenueRetention', parsed.netRevenueRetention),
      ...optionalNumber('expansionArrUsd', parsed.expansionArrUsd),
      ...optionalNumber('churnedEnterpriseLogos', parsed.churnedEnterpriseLogos),
      ...optionalNumber('securityReviewsPassed', parsed.securityReviewsPassed),
      ...optionalNumber('procurementPacketsSent', parsed.procurementPacketsSent),
      ...optionalNumber('ssoEnabledLogos', parsed.ssoEnabledLogos),
      ...optionalNumber('scimEnabledLogos', parsed.scimEnabledLogos),
      ...optionalNumber('auditExportEnabledLogos', parsed.auditExportEnabledLogos),
      ...optionalNumber('onPremEnabledLogos', parsed.onPremEnabledLogos),
      ...optionalNumber('privateNetworkEnabledLogos', parsed.privateNetworkEnabledLogos),
      ...optionalNumber('dataResidencyEnabledLogos', parsed.dataResidencyEnabledLogos),
      ...optionalNumber('csmAssignedLogos', parsed.csmAssignedLogos),
      ...optionalNumber('qbrsCompletedThisQuarter', parsed.qbrsCompletedThisQuarter),
      ...optionalNumber('renewalRiskLogos', parsed.renewalRiskLogos),
      ...optionalNumber('referenceableLogos', parsed.referenceableLogos),
      ...optionalNumber('caseStudyApprovedLogos', parsed.caseStudyApprovedLogos),
    };
  } catch {
    return {};
  }
}

export function buildEnterpriseLogoExpansionReport(options: {
  metrics?: EnterpriseLogoMetricInput;
  trustControlReport?: TrustControlReport;
  contractPacket?: EnterpriseContractPacket;
  supportSlaReport?: SupportSlaReadinessReport;
  supportSlaTickets?: readonly SupportSlaTicketInput[];
  now?: Date;
} = {}): EnterpriseLogoExpansionReport {
  const now = options.now ?? new Date();
  const evidence = {
    trustControlReport: options.trustControlReport,
    contractPacket: options.contractPacket,
  };
  const metrics = withEvidenceReports(normalizeMetrics(options.metrics ?? enterpriseLogoMetricsFromEnv()), evidence);
  const supportSla = options.supportSlaReport ?? buildSupportSlaReadinessReport({
    tickets: options.supportSlaTickets,
    now,
  });
  const checks = buildChecks(metrics, supportSla, evidence);
  const pass = checks.filter((check) => check.status === 'pass').length;
  const warn = checks.filter((check) => check.status === 'warn').length;
  const fail = checks.filter((check) => check.status === 'fail').length;
  const firstFiveLogosSecured = metrics.activeEnterpriseLogos >= firstEnterpriseLogos
    && metrics.averageAcvUsd >= 60_000;
  const controlsReady = checks.find((check) => check.id === 'enterprise-tier-controls')?.status === 'pass';
  const pipelineReady = checks.find((check) => check.id === 'pipeline-coverage')?.status !== 'fail';
  const customerSuccessReady = checks.find((check) => check.id === 'customer-success')?.status !== 'fail';
  const procurementReady = checks.find((check) => check.id === 'security-procurement')?.status !== 'fail';
  const supportReady = checks.find((check) => check.id === 'support-sla-scale')?.status === 'pass';
  const missionEnterpriseGate = metrics.activeEnterpriseLogos >= missionEnterpriseLogos
    && metrics.averageAcvUsd >= 60_000
    && metrics.netRevenueRetention >= 1.2
    && controlsReady === true
    && checks.every((check) => check.status === 'pass');
  const estimatedEnterpriseArrUsd = Math.max(
    metrics.enterpriseArrUsd,
    metrics.activeEnterpriseLogos * metrics.averageAcvUsd,
  );
  return {
    generatedAt: now.toISOString(),
    disclaimer: 'Enterprise logo expansion readiness is internal operating evidence only. Signed order forms, CRM exports, audit logs, DPA/MSA packets, and customer-success records remain authoritative. Do not include customer names, contact data, deal notes, or game IP in the metrics JSON.',
    targets: {
      firstEnterpriseLogos,
      missionEnterpriseLogos,
      targetAverageAcvUsd: 60_000,
      minimumAcvUsd: 40_000,
      targetNrr: 1.2,
      pipelineCoverageMultiple: 3,
      maxRenewalRiskRatio: 0.1,
    },
    metrics,
    summary: {
      status: fail > 0 ? 'fail' : warn > 0 ? 'warn' : 'pass',
      checks: checks.length,
      pass,
      warn,
      fail,
      firstFiveLogosSecured,
      readyFor50LogoScale: firstFiveLogosSecured
        && controlsReady === true
        && pipelineReady === true
        && customerSuccessReady === true
        && procurementReady === true
        && supportReady === true,
      missionEnterpriseGate,
      logoGapToMission: Math.max(0, missionEnterpriseLogos - metrics.activeEnterpriseLogos),
      estimatedEnterpriseArrUsd,
      pipelineCoverageRatio: pipelineCoverageRatio(metrics),
      supportSlaStatus: supportSla.summary.status,
      trustControlProofStatus: trustControlProofStatus(options.trustControlReport),
      contractPacketStatus: contractPacketStatus(options.contractPacket),
      enterpriseControlProofReady: enterpriseControlProofReady(options.trustControlReport),
      contractPacketReady: contractPacketReady(options.contractPacket),
    },
    checks,
    supportSla: supportSla.summary,
    ...(options.trustControlReport ? { trustControls: options.trustControlReport.summary } : {}),
    ...(options.contractPacket ? { contractPacket: options.contractPacket.summary } : {}),
  };
}

export function formatEnterpriseLogoExpansionMarkdown(report: EnterpriseLogoExpansionReport): string {
  const lines = [
    '# Greybox Enterprise Logo Expansion',
    '',
    `Generated: ${report.generatedAt}`,
    `Status: ${report.summary.status}`,
    `First five secured: ${report.summary.firstFiveLogosSecured ? 'yes' : 'no'}`,
    `Ready for 50-logo scale: ${report.summary.readyFor50LogoScale ? 'yes' : 'no'}`,
    `Mission enterprise gate: ${report.summary.missionEnterpriseGate ? 'yes' : 'no'}`,
    `Disclaimer: ${report.disclaimer}`,
    '',
    '## Summary',
    '',
    `- Active enterprise logos: ${report.metrics.activeEnterpriseLogos}`,
    `- Logo gap to mission: ${report.summary.logoGapToMission}`,
    `- Average ACV: ${money(report.metrics.averageAcvUsd)}`,
    `- Estimated enterprise ARR: ${money(report.summary.estimatedEnterpriseArrUsd)}`,
    `- NRR: ${percent(report.metrics.netRevenueRetention)}`,
    `- Qualified pipeline: ${report.metrics.qualifiedPipelineAccounts}`,
    `- Pipeline coverage: ${Number(report.summary.pipelineCoverageRatio.toFixed(2))}x`,
    `- Support SLA status: ${report.summary.supportSlaStatus}`,
    `- Enterprise control proof: ${report.summary.enterpriseControlProofReady ? 'ready' : report.summary.trustControlProofStatus}`,
    `- Contract packet: ${report.summary.contractPacketReady ? 'ready' : report.summary.contractPacketStatus}`,
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

function buildChecks(
  metrics: EnterpriseLogoMetrics,
  supportSla: SupportSlaReadinessReport,
  evidence: EnterpriseLogoEvidenceReports,
): EnterpriseLogoExpansionCheck[] {
  return [
    enterpriseTierControlsCheck(metrics, evidence),
    logoBaseCheck(metrics),
    acvQualityCheck(metrics),
    nrrExpansionCheck(metrics),
    pipelineCoverageCheck(metrics),
    securityProcurementCheck(metrics),
    enterpriseAdoptionCheck(metrics),
    deploymentDepthCheck(metrics),
    customerSuccessCheck(metrics),
    supportSlaScaleCheck(supportSla),
    referenceabilityCheck(metrics),
  ];
}

type EnterpriseLogoEvidenceReports = {
  trustControlReport: TrustControlReport | undefined;
  contractPacket: EnterpriseContractPacket | undefined;
};

function withEvidenceReports(
  metrics: EnterpriseLogoMetrics,
  evidence: EnterpriseLogoEvidenceReports,
): EnterpriseLogoMetrics {
  const trustControls = evidence.trustControlReport;
  const contract = evidence.contractPacket;
  if (!trustControls && !contract) return metrics;
  return normalizeMetrics({
    ...metrics,
    workosSsoLive: trustControls ? controlImplemented(trustControls, 'GBX-SEC-001') : metrics.workosSsoLive,
    scimLive: trustControls ? controlImplemented(trustControls, 'GBX-SEC-001') : metrics.scimLive,
    auditExportLive: trustControls ? controlImplemented(trustControls, 'GBX-SEC-002') : metrics.auditExportLive,
    onPremBundleLive: trustControls ? controlImplemented(trustControls, 'GBX-OPS-001') : metrics.onPremBundleLive,
    privateNetworkingLive: trustControls ? controlImplemented(trustControls, 'GBX-OPS-002') : metrics.privateNetworkingLive,
    dataResidencyLive: trustControls ? controlImplemented(trustControls, 'GBX-PRI-006') : metrics.dataResidencyLive,
    dpaMsaReady: contract ? contractPacketReady(contract) : metrics.dpaMsaReady,
  });
}

function enterpriseTierControlsCheck(
  metrics: EnterpriseLogoMetrics,
  evidence: EnterpriseLogoEvidenceReports,
): EnterpriseLogoExpansionCheck {
  const controls = [
    metrics.workosSsoLive,
    metrics.scimLive,
    metrics.auditExportLive,
    metrics.onPremBundleLive,
    metrics.privateNetworkingLive,
    metrics.dataResidencyLive,
    metrics.dpaMsaReady,
  ];
  const ready = controls.filter(Boolean).length;
  if (!evidence.trustControlReport || !evidence.contractPacket) {
    const missing = [
      evidence.trustControlReport ? undefined : 'trust-control packet',
      evidence.contractPacket ? undefined : 'contract packet',
    ].filter(Boolean).join(', ');
    return {
      id: 'enterprise-tier-controls',
      label: 'Enterprise tier controls',
      status: 'fail',
      current: `${ready}/${controls.length} raw live, missing ${missing}`,
      target: 'SSO, SCIM, audit export, on-prem bundle, private networking, data residency, and DPA/MSA live with proof packets',
      owner: 'Enterprise Engineering',
      detail: 'Enterprise control claims need trust-control and contract-packet evidence, not raw deployment booleans.',
      evidence: ['GET /v1/enterprise/trust-controls', 'GET /v1/enterprise/contracts', 'WorkOS tenant', 'SCIM store', 'audit export verification', 'on-prem smoke', 'private-network readiness', 'data-residency readiness', 'contract packet'],
      remediation: 'Generate trust-control and contract packets before counting enterprise controls as scale-ready.',
    };
  }
  const trustReady = enterpriseControlProofReady(evidence.trustControlReport);
  const contractReady = contractPacketReady(evidence.contractPacket);
  const status: EnterpriseLogoExpansionStatus = ready === controls.length && trustReady && contractReady
    ? 'pass'
    : ready >= 5 && evidence.contractPacket.summary.blocked === 0
      ? 'warn'
      : 'fail';
  return {
    id: 'enterprise-tier-controls',
    label: 'Enterprise tier controls',
    status,
    current: `${ready}/${controls.length} live, trust ${trustControlProofStatus(evidence.trustControlReport)}, contracts ${contractPacketStatus(evidence.contractPacket)}`,
    target: 'SSO, SCIM, audit export, on-prem bundle, private networking, data residency, and DPA/MSA live with proof packets',
    owner: 'Enterprise Engineering',
    detail: 'The 50-logo motion cannot scale if each buyer requires bespoke security, deployment, or legal work.',
    evidence: ['GET /v1/enterprise/trust-controls', 'GET /v1/enterprise/contracts', 'WorkOS tenant', 'SCIM store', 'audit export verification', 'on-prem smoke', 'private-network readiness', 'data-residency readiness', 'contract packet'],
    ...(status === 'pass' ? {} : { remediation: 'Close the remaining enterprise control-plane gaps before expanding beyond founder-led pilots.' }),
  };
}

function logoBaseCheck(metrics: EnterpriseLogoMetrics): EnterpriseLogoExpansionCheck {
  const status: EnterpriseLogoExpansionStatus = metrics.activeEnterpriseLogos >= 50
    ? 'pass'
    : metrics.activeEnterpriseLogos >= 5
      ? 'warn'
      : 'fail';
  return {
    id: 'enterprise-logo-base',
    label: 'Enterprise logo base',
    status,
    current: `${metrics.activeEnterpriseLogos} active, ${metrics.signedEnterpriseLogos} signed`,
    target: '5 lighthouse logos to start; 50+ enterprise logos for mission gate',
    owner: 'Enterprise Sales',
    detail: 'Enterprise logos are proof that Greybox survives procurement and becomes operational infrastructure.',
    evidence: ['signed order forms', 'CRM aggregate export', 'finance ARR report'],
    ...(status === 'pass' ? {} : { remediation: 'Convert the first five $40K+ pilots, then repeat the security-approved playbook.' }),
  };
}

function acvQualityCheck(metrics: EnterpriseLogoMetrics): EnterpriseLogoExpansionCheck {
  const status: EnterpriseLogoExpansionStatus = metrics.averageAcvUsd >= 60_000
    ? 'pass'
    : metrics.averageAcvUsd >= 40_000
      ? 'warn'
      : 'fail';
  return {
    id: 'acv-quality',
    label: 'ACV quality',
    status,
    current: `${money(metrics.averageAcvUsd)} average ACV, ${money(metrics.enterpriseArrUsd)} booked enterprise ARR`,
    target: '$60K average ACV, with $40K floor for Enterprise',
    owner: 'Revenue Operations',
    detail: 'The enterprise motion must create $40K-$200K budget-line contracts, not discounted seat bundles.',
    evidence: ['Stripe invoices', 'order forms', 'board revenue dashboard'],
    ...(status === 'pass' ? {} : { remediation: 'Anchor Enterprise on SSO, on-prem, data residency, playtest QA savings, and bundled Pro modules.' }),
  };
}

function nrrExpansionCheck(metrics: EnterpriseLogoMetrics): EnterpriseLogoExpansionCheck {
  const maxRisk = Math.max(1, Math.ceil(metrics.activeEnterpriseLogos * 0.1));
  const status: EnterpriseLogoExpansionStatus = metrics.netRevenueRetention >= 1.2
    && metrics.expansionArrUsd > 0
    && metrics.churnedEnterpriseLogos <= maxRisk
    ? 'pass'
    : metrics.netRevenueRetention >= 1.1
      ? 'warn'
      : 'fail';
  return {
    id: 'nrr-expansion',
    label: 'NRR and expansion',
    status,
    current: `${percent(metrics.netRevenueRetention)} NRR, ${money(metrics.expansionArrUsd)} expansion ARR, ${metrics.churnedEnterpriseLogos} churned`,
    target: '120%+ NRR with visible expansion ARR and low enterprise logo churn',
    owner: 'Customer Success',
    detail: 'Expansion proves Greybox is becoming a repeat workflow, not a pilot toy.',
    evidence: ['Stripe NRR cohort report', 'CS renewal ledger', 'seat/module expansion invoices'],
    ...(status === 'pass' ? {} : { remediation: 'Drive Studio-to-Enterprise expansion around round-trip sync, managed inference, Pro modules, and playtest agents.' }),
  };
}

function pipelineCoverageCheck(metrics: EnterpriseLogoMetrics): EnterpriseLogoExpansionCheck {
  const neededLogos = Math.max(0, missionEnterpriseLogos - metrics.activeEnterpriseLogos);
  const targetPipeline = neededLogos * 3;
  const status: EnterpriseLogoExpansionStatus = neededLogos === 0
    || (metrics.qualifiedPipelineAccounts >= targetPipeline && metrics.pilotsInProgress >= 5)
    ? 'pass'
    : metrics.qualifiedPipelineAccounts >= Math.ceil(targetPipeline / 2) || metrics.pilotsInProgress >= 3
      ? 'warn'
      : 'fail';
  return {
    id: 'pipeline-coverage',
    label: 'Pipeline coverage',
    status,
    current: `${metrics.qualifiedPipelineAccounts} qualified account(s), ${metrics.pilotsInProgress} pilot(s)`,
    target: `3x pipeline coverage for the ${neededLogos} remaining logo(s) to 50`,
    owner: 'Sales',
    detail: 'The 50-logo plan needs enough qualified demand to survive procurement slippage and long sales cycles.',
    evidence: ['CRM stage export', 'pilot roster', 'founder-led sales review'],
    ...(status === 'pass' ? {} : { remediation: 'Increase qualified studio pipeline before hiring beyond the first enterprise AE.' }),
  };
}

function securityProcurementCheck(metrics: EnterpriseLogoMetrics): EnterpriseLogoExpansionCheck {
  const needed = metrics.activeEnterpriseLogos > 0 ? metrics.activeEnterpriseLogos : firstEnterpriseLogos;
  const status: EnterpriseLogoExpansionStatus = metrics.securityReviewsPassed >= needed
    && metrics.procurementPacketsSent >= needed
    ? 'pass'
    : metrics.securityReviewsPassed >= firstEnterpriseLogos
      && metrics.procurementPacketsSent >= firstEnterpriseLogos
      ? 'warn'
      : 'fail';
  return {
    id: 'security-procurement',
    label: 'Security and procurement throughput',
    status,
    current: `${metrics.securityReviewsPassed} security review(s), ${metrics.procurementPacketsSent} packet(s)`,
    target: 'Every active enterprise logo has cleared security review and procurement packet delivery',
    owner: 'Security and Revenue Operations',
    detail: 'Repeatable procurement is the difference between bespoke pilots and a scalable enterprise product.',
    evidence: ['security questionnaire exports', 'contract packet hashes', 'procurement checklist'],
    ...(status === 'pass' ? {} : { remediation: 'Make the trust packet, questionnaire, DPA/MSA, and on-prem evidence reusable for every enterprise deal.' }),
  };
}

function enterpriseAdoptionCheck(metrics: EnterpriseLogoMetrics): EnterpriseLogoExpansionCheck {
  const active = Math.max(1, metrics.activeEnterpriseLogos);
  const ssoRatio = metrics.ssoEnabledLogos / active;
  const scimRatio = metrics.scimEnabledLogos / active;
  const auditRatio = metrics.auditExportEnabledLogos / active;
  const status: EnterpriseLogoExpansionStatus = metrics.activeEnterpriseLogos > 0
    && ssoRatio >= 0.8
    && scimRatio >= 0.6
    && auditRatio >= 0.8
    ? 'pass'
    : metrics.activeEnterpriseLogos > 0 && ssoRatio >= 0.5 && auditRatio >= 0.5
      ? 'warn'
      : 'fail';
  return {
    id: 'enterprise-adoption',
    label: 'Enterprise feature adoption',
    status,
    current: `${metrics.ssoEnabledLogos} SSO, ${metrics.scimEnabledLogos} SCIM, ${metrics.auditExportEnabledLogos} audit export`,
    target: '80%+ SSO, 60%+ SCIM, and 80%+ audit export adoption across active enterprise logos',
    owner: 'Enterprise Product',
    detail: 'Enterprise logos should use the controls that justify Enterprise pricing.',
    evidence: ['WorkOS organization export', 'SCIM user store', 'audit export usage report'],
    ...(status === 'pass' ? {} : { remediation: 'Make SSO, SCIM, and audit exports part of default Enterprise onboarding.' }),
  };
}

function deploymentDepthCheck(metrics: EnterpriseLogoMetrics): EnterpriseLogoExpansionCheck {
  const status: EnterpriseLogoExpansionStatus = metrics.onPremEnabledLogos >= 5
    && metrics.privateNetworkEnabledLogos >= 5
    && metrics.dataResidencyEnabledLogos >= 10
    ? 'pass'
    : metrics.onPremEnabledLogos > 0
      || metrics.privateNetworkEnabledLogos > 0
      || metrics.dataResidencyEnabledLogos > 0
      ? 'warn'
      : 'fail';
  return {
    id: 'deployment-depth',
    label: 'Deployment depth',
    status,
    current: `${metrics.onPremEnabledLogos} on-prem, ${metrics.privateNetworkEnabledLogos} private network, ${metrics.dataResidencyEnabledLogos} residency`,
    target: '5+ on-prem logos, 5+ private-network logos, and 10+ data-residency logos',
    owner: 'Enterprise Engineering',
    detail: 'Deep deployment modes defend Enterprise ACV and make strategic buyers care about the control plane.',
    evidence: ['on-prem smoke records', 'VPC/VNet readiness report', 'data residency deployment report'],
    ...(status === 'pass' ? {} : { remediation: 'Push high-ACV accounts into on-prem, VPC/VNet, and region-specific deployments where justified.' }),
  };
}

function customerSuccessCheck(metrics: EnterpriseLogoMetrics): EnterpriseLogoExpansionCheck {
  const active = Math.max(1, metrics.activeEnterpriseLogos);
  const renewalRiskLimit = Math.max(1, Math.ceil(metrics.activeEnterpriseLogos * 0.1));
  const status: EnterpriseLogoExpansionStatus = metrics.activeEnterpriseLogos > 0
    && metrics.csmAssignedLogos >= metrics.activeEnterpriseLogos
    && metrics.qbrsCompletedThisQuarter >= Math.min(metrics.activeEnterpriseLogos, 10)
    && metrics.renewalRiskLogos <= renewalRiskLimit
    ? 'pass'
    : metrics.activeEnterpriseLogos > 0 && metrics.csmAssignedLogos / active >= 0.8
      ? 'warn'
      : 'fail';
  return {
    id: 'customer-success',
    label: 'Customer success coverage',
    status,
    current: `${metrics.csmAssignedLogos} CSM-covered, ${metrics.qbrsCompletedThisQuarter} QBR(s), ${metrics.renewalRiskLogos} at risk`,
    target: 'All enterprise logos CSM-covered, 10+ QBRs/quarter, and <=10% renewal-risk logos',
    owner: 'Customer Success',
    detail: 'Enterprise NRR requires deliberate adoption management, not reactive support.',
    evidence: ['CSM account map', 'QBR log', 'renewal-risk register'],
    ...(status === 'pass' ? {} : { remediation: 'Assign named CSM ownership before adding more $40K+ ACV accounts.' }),
  };
}

function supportSlaScaleCheck(report: SupportSlaReadinessReport): EnterpriseLogoExpansionCheck {
  const status = supportSlaScaleStatus(report);
  return {
    id: 'support-sla-scale',
    label: 'Support SLA scale readiness',
    status,
    current: `${report.summary.totalTickets} ticket(s), ${report.summary.firstResponseCompliancePct}% first response, ${report.summary.resolutionCompliancePct}% resolution, ${report.summary.openUnityBlockers} Unity blocker(s), ${report.summary.enterpriseHighSeverityBreaches} enterprise breach(es)`,
    target: '10+ sanitized tickets, 95%+ first response, 90%+ resolution, 0 Unity blockers, and 0 Studio/Enterprise high-severity breaches',
    owner: 'Customer Success',
    detail: 'The 5-to-50 enterprise motion needs ticket-level support evidence before sales scales beyond founder-led coverage.',
    evidence: ['GET /v1/enterprise/support-sla-readiness', 'support queue export', 'CSM account map'],
    ...(status === 'pass' ? {} : { remediation: 'Clear SLA breaches, Unity blockers, missing Sev1 postmortems, ownership gaps, and missing ticket evidence before scaling enterprise logos.' }),
  };
}

function referenceabilityCheck(metrics: EnterpriseLogoMetrics): EnterpriseLogoExpansionCheck {
  const status: EnterpriseLogoExpansionStatus = metrics.referenceableLogos >= 10
    && metrics.caseStudyApprovedLogos >= 5
    ? 'pass'
    : metrics.referenceableLogos >= 3 || metrics.caseStudyApprovedLogos >= 1
      ? 'warn'
      : 'fail';
  return {
    id: 'referenceability',
    label: 'Referenceability',
    status,
    current: `${metrics.referenceableLogos} referenceable, ${metrics.caseStudyApprovedLogos} case-study approved`,
    target: '10+ referenceable enterprise logos and 5+ approved case studies',
    owner: 'Developer Relations',
    detail: 'Referenceable enterprise proof compresses sales cycles and strengthens strategic-buyer diligence.',
    evidence: ['reference consent ledger', 'case study approvals', 'customer quote release forms'],
    ...(status === 'pass' ? {} : { remediation: 'Bake reference and case-study rights into successful pilot closeout.' }),
  };
}

function supportSlaScaleStatus(report: SupportSlaReadinessReport): EnterpriseLogoExpansionStatus {
  if (!report.summary.readyForEnterprisePilots || !report.summary.readyForUnityVerifiedSolution) return 'fail';
  if (report.summary.status === 'warn') return 'warn';
  return report.summary.status;
}

function enterpriseControlProofReady(report: TrustControlReport | undefined): boolean {
  if (!report) return false;
  return controlImplemented(report, 'GBX-SEC-001')
    && controlImplemented(report, 'GBX-SEC-002')
    && controlImplemented(report, 'GBX-OPS-001')
    && controlImplemented(report, 'GBX-OPS-002')
    && controlImplemented(report, 'GBX-PRI-006');
}

function trustControlProofStatus(report: TrustControlReport | undefined): EnterpriseLogoExpansionStatus | 'missing' {
  if (!report) return 'missing';
  if (enterpriseControlProofReady(report)) return 'pass';
  if (report.summary.missing === 0 && report.summary.implemented >= 3) return 'warn';
  return 'fail';
}

function contractPacketReady(packet: EnterpriseContractPacket | undefined): boolean {
  if (!packet) return false;
  return packet.summary.blocked === 0
    && packet.summary.readyToSign >= 3
    && packet.summary.blockingIssues === 0;
}

function contractPacketStatus(packet: EnterpriseContractPacket | undefined): EnterpriseLogoExpansionStatus | 'missing' {
  if (!packet) return 'missing';
  if (contractPacketReady(packet)) return 'pass';
  return packet.summary.blocked === 0 ? 'warn' : 'fail';
}

function controlImplemented(report: TrustControlReport, id: string): boolean {
  return report.controls.some((control) => control.id === id && control.status === 'implemented');
}

function normalizeMetrics(input: EnterpriseLogoMetricInput): EnterpriseLogoMetrics {
  return {
    workosSsoLive: input.workosSsoLive === true,
    scimLive: input.scimLive === true,
    auditExportLive: input.auditExportLive === true,
    onPremBundleLive: input.onPremBundleLive === true,
    privateNetworkingLive: input.privateNetworkingLive === true,
    dataResidencyLive: input.dataResidencyLive === true,
    dpaMsaReady: input.dpaMsaReady === true,
    signedEnterpriseLogos: nonNegative(input.signedEnterpriseLogos),
    activeEnterpriseLogos: nonNegative(input.activeEnterpriseLogos),
    qualifiedPipelineAccounts: nonNegative(input.qualifiedPipelineAccounts),
    pilotsInProgress: nonNegative(input.pilotsInProgress),
    averageAcvUsd: nonNegative(input.averageAcvUsd),
    enterpriseArrUsd: nonNegative(input.enterpriseArrUsd),
    netRevenueRetention: nonNegative(input.netRevenueRetention),
    expansionArrUsd: nonNegative(input.expansionArrUsd),
    churnedEnterpriseLogos: nonNegative(input.churnedEnterpriseLogos),
    securityReviewsPassed: nonNegative(input.securityReviewsPassed),
    procurementPacketsSent: nonNegative(input.procurementPacketsSent),
    ssoEnabledLogos: nonNegative(input.ssoEnabledLogos),
    scimEnabledLogos: nonNegative(input.scimEnabledLogos),
    auditExportEnabledLogos: nonNegative(input.auditExportEnabledLogos),
    onPremEnabledLogos: nonNegative(input.onPremEnabledLogos),
    privateNetworkEnabledLogos: nonNegative(input.privateNetworkEnabledLogos),
    dataResidencyEnabledLogos: nonNegative(input.dataResidencyEnabledLogos),
    csmAssignedLogos: nonNegative(input.csmAssignedLogos),
    qbrsCompletedThisQuarter: nonNegative(input.qbrsCompletedThisQuarter),
    renewalRiskLogos: nonNegative(input.renewalRiskLogos),
    referenceableLogos: nonNegative(input.referenceableLogos),
    caseStudyApprovedLogos: nonNegative(input.caseStudyApprovedLogos),
  };
}

function pipelineCoverageRatio(metrics: EnterpriseLogoMetrics): number {
  const neededLogos = Math.max(0, missionEnterpriseLogos - metrics.activeEnterpriseLogos);
  if (neededLogos === 0) return 1;
  return metrics.qualifiedPipelineAccounts / (neededLogos * 3);
}

function optionalBool(key: keyof EnterpriseLogoMetricInput, value: unknown): Partial<EnterpriseLogoMetricInput> {
  return typeof value === 'boolean' ? { [key]: value } : {};
}

function optionalNumber(key: keyof EnterpriseLogoMetricInput, value: unknown): Partial<EnterpriseLogoMetricInput> {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? { [key]: value } : {};
}

function nonNegative(value: number | undefined): number {
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

function escapeTableCell(value: string): string {
  return value.replaceAll('|', '\\|').replaceAll('\n', '<br>');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
