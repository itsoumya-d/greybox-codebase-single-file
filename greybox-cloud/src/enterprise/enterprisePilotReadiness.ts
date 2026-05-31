// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import {
  buildCertificationRoadmapReport,
  type CertificationRoadmapReport,
} from './certificationRoadmap.js';
import {
  buildEnterpriseContractPacket,
  type EnterpriseContractPacket,
} from './contractPacket.js';
import {
  buildSecurityQuestionnaireReport,
  type SecurityQuestionnaireReport,
} from './securityQuestionnaire.js';
import {
  buildSupportSlaReadinessReport,
  type SupportSlaReadinessReport,
  type SupportSlaTicketInput,
} from './supportSlaReadiness.js';
import {
  buildEnterpriseTrustPacket,
  type EnterpriseTrustPacket,
  type EnterpriseTrustPacketOptions,
} from './trustPacket.js';

export type EnterprisePilotReadinessStatus = 'pass' | 'warn' | 'fail';

export interface EnterprisePilotReadinessCheck {
  id: string;
  label: string;
  status: EnterprisePilotReadinessStatus;
  owner: string;
  detail: string;
  evidence: string[];
  remediation?: string;
}

export interface EnterprisePilotReadinessReport {
  generatedAt: string;
  disclaimer: string;
  readyForPilot: boolean;
  target: {
    minimumAcvUsd: number;
    targetAverageAcvUsd: number;
    firstLogoTarget: number;
    supportedRegions: readonly string[];
  };
  summary: {
    checks: number;
    pass: number;
    warn: number;
    fail: number;
    blockers: number;
    warnings: number;
    contractDocumentsReady: number;
    questionnaireBlocked: number;
    openRisks: number;
    supportSlaStatus: SupportSlaStatus;
    encryptionStatus: EnterpriseTrustPacket['encryptionReadiness']['summary']['status'];
    certificationClaims: false;
  };
  checks: EnterprisePilotReadinessCheck[];
  contractPacket: EnterpriseContractPacket['summary'];
  questionnaire: SecurityQuestionnaireReport['summary'];
  supportSla: SupportSlaReadinessReport['summary'];
  trustPacket: EnterpriseTrustPacket['summary'];
  certificationRoadmap: CertificationRoadmapReport['summary'];
}

export interface EnterprisePilotReadinessOptions extends EnterpriseTrustPacketOptions {
  contractRoot?: string;
  contractPacket?: EnterpriseContractPacket;
  supportSlaReport?: SupportSlaReadinessReport;
  supportSlaTickets?: readonly SupportSlaTicketInput[];
  trustPacket?: EnterpriseTrustPacket;
}

type SupportSlaStatus = SupportSlaReadinessReport['summary']['status'];

export async function buildEnterprisePilotReadinessReport(
  options: EnterprisePilotReadinessOptions = {},
): Promise<EnterprisePilotReadinessReport> {
  const now = options.now ?? new Date();
  const trustPacket = options.trustPacket ?? await buildEnterpriseTrustPacket({
    ...options,
    now,
  });
  const contractPacket = options.contractPacket ?? buildEnterpriseContractPacket({
    root: options.contractRoot,
    now,
  });
  const questionnaire = await buildSecurityQuestionnaireReport({
    ...options,
    packet: trustPacket,
    contractPacket,
    contractRoot: options.contractRoot,
    now,
  });
  const certificationRoadmap = await buildCertificationRoadmapReport({
    ...options,
    trustPacket,
    now,
  });
  const supportSla = options.supportSlaReport ?? buildSupportSlaReadinessReport({
    tickets: options.supportSlaTickets,
    now,
  });
  const checks = pilotChecks({
    trustPacket,
    contractPacket,
    questionnaire,
    certificationRoadmap,
    supportSla,
  });
  const fail = checks.filter((check) => check.status === 'fail').length;
  const warn = checks.filter((check) => check.status === 'warn').length;
  return {
    generatedAt: now.toISOString(),
    disclaimer: 'Enterprise pilot readiness is internal go/no-go evidence only. It is not legal advice, a signed customer agreement, auditor assurance, SOC 2 or ISO 27001 certification, or proof of production deployment.',
    readyForPilot: fail === 0 && warn === 0,
    target: {
      minimumAcvUsd: 40_000,
      targetAverageAcvUsd: 60_000,
      firstLogoTarget: 5,
      supportedRegions: [...trustPacket.dataResidencyReadiness.supportedRegions],
    },
    summary: {
      checks: checks.length,
      pass: checks.filter((check) => check.status === 'pass').length,
      warn,
      fail,
      blockers: fail,
      warnings: warn,
      contractDocumentsReady: contractPacket.summary.readyToSign,
      questionnaireBlocked: questionnaire.summary.blocked,
      openRisks: trustPacket.summary.openRiskCount,
      supportSlaStatus: supportSla.summary.status,
      encryptionStatus: trustPacket.encryptionReadiness.summary.status,
      certificationClaims: false,
    },
    checks,
    contractPacket: contractPacket.summary,
    questionnaire: questionnaire.summary,
    supportSla: supportSla.summary,
    trustPacket: trustPacket.summary,
    certificationRoadmap: certificationRoadmap.summary,
  };
}

export function formatEnterprisePilotReadinessMarkdown(report: EnterprisePilotReadinessReport): string {
  const lines = [
    '# Greybox Enterprise Pilot Readiness',
    '',
    `Generated: ${report.generatedAt}`,
    `Ready for pilot: ${report.readyForPilot ? 'yes' : 'no'}`,
    `Disclaimer: ${report.disclaimer}`,
    '',
    '## Target',
    '',
    `- First enterprise logos: ${report.target.firstLogoTarget}`,
    `- Minimum ACV: $${report.target.minimumAcvUsd.toLocaleString('en-US')}`,
    `- Target average ACV: $${report.target.targetAverageAcvUsd.toLocaleString('en-US')}`,
    `- Supported regions: ${report.target.supportedRegions.join(', ')}`,
    '',
    '## Summary',
    '',
    `- Checks: ${report.summary.checks}`,
    `- Pass: ${report.summary.pass}`,
    `- Warn: ${report.summary.warn}`,
    `- Fail: ${report.summary.fail}`,
    `- Contract templates ready: ${report.summary.contractDocumentsReady}`,
    `- Questionnaire blocked answers: ${report.summary.questionnaireBlocked}`,
    `- Open trust-packet risks: ${report.summary.openRisks}`,
    `- Support SLA status: ${report.summary.supportSlaStatus}`,
    `- Encryption readiness: ${report.summary.encryptionStatus}`,
    '',
    '## Checks',
    '',
    '| Check | Status | Owner | Detail |',
    '| --- | --- | --- | --- |',
  ];
  for (const check of report.checks) {
    lines.push(`| ${escapeTableCell(check.label)} | ${check.status} | ${escapeTableCell(check.owner)} | ${escapeTableCell(check.detail)} |`);
  }
  lines.push('');
  return lines.join('\n');
}

function pilotChecks(input: {
  trustPacket: EnterpriseTrustPacket;
  contractPacket: EnterpriseContractPacket;
  questionnaire: SecurityQuestionnaireReport;
  certificationRoadmap: CertificationRoadmapReport;
  supportSla: SupportSlaReadinessReport;
}): EnterprisePilotReadinessCheck[] {
  const controlStatus = (id: string) => input.trustPacket.trustControls.controls.find((control) => control.id === id)?.status;
  return [
    {
      id: 'contract-packet',
      label: 'Order form/MSA/DPA procurement packet',
      status: input.contractPacket.summary.blocked === 0 && input.contractPacket.summary.readyToSign >= 3 ? 'pass' : 'fail',
      owner: 'Revenue Operations',
      detail: input.contractPacket.summary.blocked === 0
        ? `${input.contractPacket.summary.readyToSign} ready-to-sign templates and ${input.contractPacket.summary.supportingEvidence} supporting evidence documents verified.`
        : `${input.contractPacket.summary.blockingIssues} contract packet blocker(s) remain.`,
      evidence: ['GET /v1/enterprise/contracts', 'legal/ORDER_FORM_TEMPLATE.md', 'legal/MSA_TEMPLATE.md', 'legal/DPA_TEMPLATE.md'],
      remediation: input.contractPacket.summary.blocked === 0 ? undefined : 'Resolve missing clauses, placeholders, or missing legal documents before customer signature.',
    },
    {
      id: 'security-questionnaire',
      label: 'Security questionnaire',
      status: input.questionnaire.summary.blocked > 0 ? 'fail' : input.questionnaire.summary.needsReview > 0 ? 'warn' : 'pass',
      owner: 'Security Engineering',
      detail: `${input.questionnaire.summary.ready} ready, ${input.questionnaire.summary.needsReview} needs-review, and ${input.questionnaire.summary.blocked} blocked answer(s).`,
      evidence: ['GET /v1/enterprise/security-questionnaire'],
      remediation: input.questionnaire.summary.blocked > 0 ? 'Clear blocked answers before sending a buyer questionnaire.' : undefined,
    },
    {
      id: 'support-sla',
      label: 'Support SLA and escalation readiness',
      status: supportSlaStatus(input.supportSla),
      owner: 'Customer Success',
      detail: `${input.supportSla.summary.firstResponseCompliancePct}% first response, ${input.supportSla.summary.resolutionCompliancePct}% resolution, ${input.supportSla.summary.enterpriseHighSeverityBreaches} Studio/Enterprise high-severity breach(es), ${input.supportSla.summary.openUnityBlockers} open Unity blocker(s).`,
      evidence: ['GET /v1/enterprise/support-sla-readiness', 'support queue export', 'customer success coverage plan'],
      remediation: input.supportSla.summary.readyForEnterprisePilots && input.supportSla.summary.readyForUnityVerifiedSolution
        ? undefined
        : 'Clear high-severity SLA breaches, Unity blockers, missing Sev1 postmortems, and ownership gaps before enterprise pilots.',
    },
    controlCheck({
      id: 'identity-access',
      label: 'SSO and SCIM tenant access',
      owner: 'Security Engineering',
      status: controlStatus('GBX-SEC-001'),
      passDetail: 'WorkOS tenant boundary and SCIM provisioning evidence are configured.',
      warnDetail: 'SSO/SCIM code exists but production tenant evidence is partial.',
      failDetail: 'SSO/SCIM evidence is missing.',
      evidence: ['tests/auth.test.ts', 'tests/scim.test.ts', 'GET /v1/auth/session'],
      remediation: 'Connect the production WorkOS tenant, SCIM token, and durable SCIM store.',
    }),
    controlCheck({
      id: 'audit-export',
      label: 'Audit export and hash-chain verification',
      owner: 'Security Engineering',
      status: controlStatus('GBX-SEC-002'),
      passDetail: 'Audit export and hash-chain verification evidence are configured.',
      warnDetail: 'Audit logging code exists but runtime evidence is partial.',
      failDetail: 'Audit logging evidence is missing or hash-chain verification failed.',
      evidence: ['GET /v1/audit-log/export', 'GET /v1/audit-log/verify'],
      remediation: 'Configure append-only audit logging and verify the hash chain before enterprise pilot.',
    }),
    {
      id: 'privacy-governance',
      label: 'Privacy rights, disclosures, ROPA/DPIA/DPO',
      status: privacyStatus(input.trustPacket),
      owner: 'Privacy Operations',
      detail: `${input.trustPacket.privacyDisclosures.summary.needsCounsel} disclosure item(s) need counsel, ${input.trustPacket.privacyGovernance.summary.pendingDpiaCount} DPIA review(s) pending, DPO appointed = ${input.trustPacket.privacyGovernance.summary.dpoAppointed}.`,
      evidence: ['GET /v1/privacy/disclosures', 'GET /v1/enterprise/privacy-governance', 'GET /v1/privacy/requests'],
      remediation: input.trustPacket.privacyDisclosures.summary.needsCounsel > 0 || input.trustPacket.privacyGovernance.summary.pendingDpiaCount > 0
        ? 'Complete counsel review for notices, DPIAs, and DPO evidence before public compliance claims.'
        : undefined,
    },
    controlCheck({
      id: 'ai-minimization',
      label: 'AI log minimization and training consent',
      owner: 'AI Platform',
      status: controlStatus('GBX-AI-001'),
      passDetail: 'PII redaction, prompt-safety checks, and model-training consent evidence are configured.',
      warnDetail: 'AI safety and consent code exists but durable consent or production retention evidence is partial.',
      failDetail: 'AI log-minimization evidence is missing.',
      evidence: ['tests/pii-redactor.test.ts', 'tests/model-training-consent.test.ts'],
      remediation: 'Configure durable consent records and production log-retention settings.',
    }),
    {
      id: 'data-residency',
      label: 'US/EU/India data residency readiness',
      status: residencyStatus(input.trustPacket),
      owner: 'Enterprise Engineering',
      detail: `${input.trustPacket.dataResidencyReadiness.summary.readyRegions}/${input.trustPacket.dataResidencyReadiness.supportedRegions.length} region(s) ready; ${input.trustPacket.dataResidencyReadiness.summary.blockedRegions} blocked.`,
      evidence: ['GET /v1/enterprise/data-residency/readiness', 'legal/DATA_RESIDENCY.md'],
      remediation: input.trustPacket.dataResidencyReadiness.summary.blockedRegions > 0 ? 'Provision region-local storage/provider egress/backups for blocked regions.' : undefined,
    },
    {
      id: 'encryption-kms',
      label: 'Production KMS and encryption evidence',
      status: encryptionPilotStatus(input.trustPacket),
      owner: 'Security Engineering',
      detail: encryptionPilotDetail(input.trustPacket),
      evidence: ['GET /v1/enterprise/encryption-readiness', 'legal/ENCRYPTION_READINESS.md', 'cloud-provider KMS/storage/TLS/backup evidence'],
      remediation: input.trustPacket.encryptionReadiness.summary.status === 'pass'
        ? undefined
        : 'Attach production KMS, storage-encryption, TLS/HSTS, backup-encryption, and secret-rotation evidence before enterprise pilots.',
    },
    controlCheck({
      id: 'onprem',
      label: 'On-prem Docker and offline license readiness',
      owner: 'Enterprise Engineering',
      status: controlStatus('GBX-OPS-001'),
      passDetail: 'On-prem readiness and offline-license evidence are configured.',
      warnDetail: 'On-prem code exists but signed license or customer-like install evidence is partial.',
      failDetail: 'On-prem readiness evidence is missing.',
      evidence: ['GET /v1/enterprise/onprem-readiness', 'pnpm onprem:smoke'],
      remediation: 'Run the on-prem smoke test against signed offline license material.',
    }),
    {
      id: 'private-networking',
      label: 'AWS/Azure private network readiness',
      status: privateNetworkStatus(input.trustPacket),
      owner: 'Enterprise Engineering',
      detail: `${input.trustPacket.privateNetworkReadiness.summary.profiles} profile(s), ${input.trustPacket.privateNetworkReadiness.summary.warnings} warning(s), ${input.trustPacket.privateNetworkReadiness.summary.failed} failed.`,
      evidence: ['GET /v1/enterprise/private-network/readiness', 'legal/PRIVATE_NETWORKING.md'],
      remediation: input.trustPacket.privateNetworkReadiness.summary.failed > 0 ? 'Resolve failed peering, CIDR, routing, DNS, or reachability checks.' : undefined,
    },
    {
      id: 'certification-roadmap',
      label: 'SOC 2 / ISO 27001 roadmap caveat',
      status: input.certificationRoadmap.summary.blocked > 0 ? 'fail' : input.certificationRoadmap.summary.atRisk > 0 ? 'warn' : 'pass',
      owner: 'Security Engineering',
      detail: `${input.certificationRoadmap.summary.ready} ready, ${input.certificationRoadmap.summary.onTrack} on-track, ${input.certificationRoadmap.summary.atRisk} at-risk, ${input.certificationRoadmap.summary.blocked} blocked milestone(s).`,
      evidence: ['GET /v1/enterprise/certification-roadmap', 'legal/CERTIFICATION_ROADMAP.md'],
      remediation: input.certificationRoadmap.summary.blocked > 0 ? 'Do not claim certification; resolve blocked roadmap milestones first.' : undefined,
    },
  ];
}

function controlCheck(input: {
  id: string;
  label: string;
  owner: string;
  status: 'implemented' | 'partial' | 'missing' | undefined;
  passDetail: string;
  warnDetail: string;
  failDetail: string;
  evidence: string[];
  remediation: string;
}): EnterprisePilotReadinessCheck {
  if (input.status === 'implemented') {
    return {
      id: input.id,
      label: input.label,
      status: 'pass',
      owner: input.owner,
      detail: input.passDetail,
      evidence: input.evidence,
    };
  }
  if (input.status === 'partial') {
    return {
      id: input.id,
      label: input.label,
      status: 'warn',
      owner: input.owner,
      detail: input.warnDetail,
      evidence: input.evidence,
      remediation: input.remediation,
    };
  }
  return {
    id: input.id,
    label: input.label,
    status: 'fail',
    owner: input.owner,
    detail: input.failDetail,
    evidence: input.evidence,
    remediation: input.remediation,
  };
}

function privacyStatus(packet: EnterpriseTrustPacket): EnterprisePilotReadinessStatus {
  const rights = packet.trustControls.controls.find((control) => control.id === 'GBX-PRI-001')?.status;
  const governance = packet.trustControls.controls.find((control) => control.id === 'GBX-PRI-004')?.status;
  const disclosures = packet.trustControls.controls.find((control) => control.id === 'GBX-PRI-005')?.status;
  if ([rights, governance, disclosures].includes('missing')) return 'fail';
  if (
    [rights, governance, disclosures].includes('partial')
    || packet.privacyDisclosures.summary.needsCounsel > 0
    || packet.privacyGovernance.summary.pendingDpiaCount > 0
    || !packet.privacyGovernance.summary.dpoAppointed
  ) return 'warn';
  return 'pass';
}

function residencyStatus(packet: EnterpriseTrustPacket): EnterprisePilotReadinessStatus {
  if (packet.dataResidencyReadiness.summary.blockedRegions > 0) return 'fail';
  if (packet.dataResidencyReadiness.summary.readyRegions < packet.dataResidencyReadiness.supportedRegions.length) return 'warn';
  return 'pass';
}

function privateNetworkStatus(packet: EnterpriseTrustPacket): EnterprisePilotReadinessStatus {
  if (packet.privateNetworkReadiness.summary.failed > 0) return 'fail';
  if (packet.privateNetworkReadiness.summary.profiles === 0 || packet.privateNetworkReadiness.summary.warnings > 0) return 'warn';
  return 'pass';
}

function encryptionPilotStatus(packet: EnterpriseTrustPacket): EnterprisePilotReadinessStatus {
  const status = packet.encryptionReadiness.summary.status;
  if (status === 'fail') return 'fail';
  if (status === 'warn') return 'warn';
  return 'pass';
}

function encryptionPilotDetail(packet: EnterpriseTrustPacket): string {
  const summary = packet.encryptionReadiness.summary;
  return [
    `Encryption readiness is ${summary.status};`,
    `${summary.encryptedDatasets}/${summary.requiredDatasets} dataset(s),`,
    `${summary.regionsWithKeys}/${summary.requiredRegions} region key(s),`,
    `TLS ready = ${summary.tlsReady}, backups encrypted = ${summary.backupsEncrypted}.`,
  ].join(' ');
}

function supportSlaStatus(report: SupportSlaReadinessReport): EnterprisePilotReadinessStatus {
  if (!report.summary.readyForEnterprisePilots || !report.summary.readyForUnityVerifiedSolution) return 'fail';
  if (report.summary.status === 'warn') return 'warn';
  return report.summary.status;
}

function escapeTableCell(value: string): string {
  return value.replaceAll('|', '\\|').replaceAll('\n', '<br>');
}
