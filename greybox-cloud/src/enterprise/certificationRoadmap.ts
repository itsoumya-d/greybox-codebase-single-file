// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import type { EnterpriseTrustPacketOptions } from './trustPacket.js';
import {
  buildEnterpriseTrustPacket,
  type EnterpriseTrustPacket,
} from './trustPacket.js';

export type CertificationMilestoneStatus = 'ready' | 'on-track' | 'at-risk' | 'blocked';
export type CertificationEvidenceStatus = 'pass' | 'warn' | 'fail';

export interface CertificationEvidenceItem {
  id: string;
  label: string;
  status: CertificationEvidenceStatus;
  detail: string;
  references: string[];
}

export interface CertificationMilestone {
  id:
    | 'gdpr-readiness'
    | 'ccpa-coppa-dpdpa-readiness'
    | 'soc2-type-i'
    | 'soc2-type-ii'
    | 'iso-27001';
  title: string;
  targetMonth: number;
  dueBy: string;
  approxCostUsd: number;
  owner: string;
  status: CertificationMilestoneStatus;
  frameworks: string[];
  evidence: CertificationEvidenceItem[];
  blockers: string[];
  nextAction: string;
}

export interface CertificationRoadmapIssue {
  milestoneId: CertificationMilestone['id'];
  severity: 'warning' | 'error';
  detail: string;
  remediation: string;
}

export interface CertificationRoadmapReport {
  generatedAt: string;
  startAt: string;
  disclaimer: string;
  certificationClaims: false;
  summary: {
    milestones: number;
    ready: number;
    onTrack: number;
    atRisk: number;
    blocked: number;
    totalApproxCostUsd: number;
    monthsElapsed: number;
    nextDueMilestoneId?: CertificationMilestone['id'];
    nextDueBy?: string;
  };
  milestones: CertificationMilestone[];
  issues: CertificationRoadmapIssue[];
}

export interface CertificationRoadmapOptions extends EnterpriseTrustPacketOptions {
  startAt?: Date;
  trustPacket?: EnterpriseTrustPacket;
}

interface MilestoneDraft {
  id: CertificationMilestone['id'];
  title: string;
  targetMonth: number;
  approxCostUsd: number;
  owner: string;
  frameworks: string[];
  nextAction: string;
  evidence: CertificationEvidenceItem[];
}

export async function buildCertificationRoadmapReport(
  options: CertificationRoadmapOptions = {},
): Promise<CertificationRoadmapReport> {
  const now = options.now ?? new Date();
  const startAt = options.startAt ?? new Date('2026-05-17T00:00:00.000Z');
  const trustPacket = options.trustPacket ?? await buildEnterpriseTrustPacket(options);
  const drafts = certificationMilestoneDrafts(trustPacket);
  const monthsElapsed = elapsedWholeMonths(startAt, now);
  const milestones = drafts.map((draft) => finalizeMilestone(draft, startAt, monthsElapsed));
  const nextDue = milestones
    .filter((milestone) => milestone.status !== 'ready')
    .sort((a, b) => a.targetMonth - b.targetMonth)[0];
  const summary = {
    milestones: milestones.length,
    ready: milestones.filter((milestone) => milestone.status === 'ready').length,
    onTrack: milestones.filter((milestone) => milestone.status === 'on-track').length,
    atRisk: milestones.filter((milestone) => milestone.status === 'at-risk').length,
    blocked: milestones.filter((milestone) => milestone.status === 'blocked').length,
    totalApproxCostUsd: milestones.reduce((total, milestone) => total + milestone.approxCostUsd, 0),
    monthsElapsed,
    ...(nextDue ? { nextDueMilestoneId: nextDue.id, nextDueBy: nextDue.dueBy } : {}),
  };
  return {
    generatedAt: now.toISOString(),
    startAt: startAt.toISOString(),
    disclaimer: 'Certification roadmap is readiness evidence only. It is not a SOC 2 report, ISO 27001 certificate, legal opinion, auditor selection, regulator filing, or proof that any certification has been achieved.',
    certificationClaims: false,
    summary,
    milestones,
    issues: certificationIssues(milestones),
  };
}

function certificationMilestoneDrafts(packet: EnterpriseTrustPacket): MilestoneDraft[] {
  const control = (id: string) => packet.trustControls.controls.find((item) => item.id === id);
  const implemented = (id: string) => control(id)?.status === 'implemented';
  const partialOrBetter = (id: string) => {
    const status = control(id)?.status;
    return status === 'implemented' || status === 'partial';
  };
  const allResidencyRegionsReady = packet.dataResidencyReadiness.summary.readyRegions
    === packet.dataResidencyReadiness.supportedRegions.length;
  const privateNetworkClean = packet.privateNetworkReadiness.summary.profiles > 0
    && packet.privateNetworkReadiness.summary.failed === 0
    && packet.privateNetworkReadiness.summary.warnings === 0;

  return [
    {
      id: 'gdpr-readiness',
      title: 'GDPR readiness: ROPA, DPIA, DPO, and processor assistance',
      targetMonth: 6,
      approxCostUsd: 5_000,
      owner: 'Privacy Operations',
      frameworks: ['GDPR Article 30', 'GDPR Article 35', 'GDPR Article 37'],
      nextAction: 'Complete DPIA reviews, configure DPO appointment evidence, and have counsel approve the ROPA/DPIA/DPO packet.',
      evidence: [
        evidence({
          id: 'ropa-records',
          label: 'ROPA records',
          pass: packet.privacyGovernance.summary.ropaRecordCount > 0,
          detail: `${packet.privacyGovernance.summary.ropaRecordCount} ROPA record(s) are present.`,
          references: ['legal/PRIVACY_GOVERNANCE.md', 'tests/privacy-governance.test.ts'],
        }),
        evidence({
          id: 'dpia-reviews',
          label: 'DPIA review status',
          pass: packet.privacyGovernance.summary.pendingDpiaCount === 0,
          warn: packet.privacyGovernance.summary.dpiaAssessmentCount > 0,
          detail: `${packet.privacyGovernance.summary.pendingDpiaCount} DPIA assessment(s) still need review.`,
          references: ['legal/PRIVACY_GOVERNANCE.md', 'tests/privacy-governance.test.ts'],
        }),
        evidence({
          id: 'dpo-appointment',
          label: 'DPO appointment',
          pass: packet.privacyGovernance.summary.dpoAppointed,
          detail: packet.privacyGovernance.summary.dpoAppointed
            ? 'DPO appointment evidence is configured.'
            : 'DPO appointment evidence is not fully configured.',
          references: ['OPERATIONS.md', 'tests/privacy-governance.test.ts'],
        }),
        evidence({
          id: 'privacy-rights-workflow',
          label: 'Privacy rights workflow',
          pass: partialOrBetter('GBX-PRI-001'),
          detail: `${control('GBX-PRI-001')?.status ?? 'missing'} privacy-rights evidence.`,
          references: ['legal/PRIVACY_RIGHTS.md', 'tests/privacy-requests.test.ts'],
        }),
      ],
    },
    {
      id: 'ccpa-coppa-dpdpa-readiness',
      title: 'CCPA/CPRA, COPPA, and India DPDPA launch disclosures',
      targetMonth: 6,
      approxCostUsd: 0,
      owner: 'Privacy Operations',
      frameworks: ['CCPA/CPRA', 'COPPA', 'India DPDPA'],
      nextAction: 'Have counsel approve the public notices, child-directed gates, and India grievance/contact settings before launch.',
      evidence: [
        evidence({
          id: 'disclosure-coverage',
          label: 'Disclosure coverage',
          pass: packet.privacyDisclosures.summary.disclosures >= 3,
          detail: `${packet.privacyDisclosures.summary.disclosures} disclosure jurisdiction(s) are tracked.`,
          references: ['legal/PRIVACY_DISCLOSURES.md', 'tests/privacy-disclosures.test.ts'],
        }),
        evidence({
          id: 'counsel-review',
          label: 'Counsel review queue',
          pass: packet.privacyDisclosures.summary.needsCounsel === 0,
          warn: packet.privacyDisclosures.summary.disclosures > 0,
          detail: `${packet.privacyDisclosures.summary.needsCounsel} disclosure checklist(s) still need counsel-approved public copy.`,
          references: ['legal/PRIVACY_DISCLOSURES.md', 'tests/privacy-disclosures.test.ts'],
        }),
        evidence({
          id: 'public-disclosure-route',
          label: 'Public disclosure route',
          pass: implemented('GBX-PRI-005') || partialOrBetter('GBX-PRI-005'),
          detail: `${control('GBX-PRI-005')?.status ?? 'missing'} public-disclosure evidence.`,
          references: ['README.md', 'tests/privacy-disclosures.test.ts'],
        }),
      ],
    },
    {
      id: 'soc2-type-i',
      title: 'SOC 2 Type I readiness',
      targetMonth: 12,
      approxCostUsd: 25_000,
      owner: 'Security Engineering',
      frameworks: ['SOC 2 Security', 'SOC 2 Availability', 'SOC 2 Processing Integrity', 'SOC 2 Confidentiality', 'SOC 2 Privacy'],
      nextAction: 'Select Vanta/Drata or auditor, export control evidence, and remediate partial runtime evidence before Type I review.',
      evidence: [
        evidence({
          id: 'trust-controls-present',
          label: 'Trust control map',
          pass: packet.trustControls.summary.missing === 0,
          warn: packet.trustControls.summary.partial > 0,
          detail: `${packet.trustControls.summary.implemented} implemented, ${packet.trustControls.summary.partial} partial, ${packet.trustControls.summary.missing} missing trust controls.`,
          references: ['legal/TRUST_CONTROLS.md', 'tests/trust-controls.test.ts'],
        }),
        evidence({
          id: 'identity-audit-incidents',
          label: 'Core security controls',
          pass: implemented('GBX-SEC-001') && implemented('GBX-SEC-002') && implemented('GBX-SEC-003'),
          warn: partialOrBetter('GBX-SEC-001') && partialOrBetter('GBX-SEC-002') && partialOrBetter('GBX-SEC-003'),
          detail: 'Identity, audit logging, and incident response controls are required for the first auditor packet.',
          references: ['tests/auth.test.ts', 'tests/audit-log.test.ts', 'tests/incidents.test.ts'],
        }),
        evidence({
          id: 'billing-ai-minimization',
          label: 'Processing integrity and privacy controls',
          pass: implemented('GBX-BIL-001') && implemented('GBX-AI-001'),
          warn: partialOrBetter('GBX-BIL-001') && partialOrBetter('GBX-AI-001'),
          detail: 'Billing reconciliation and AI log-minimization evidence are required for SOC 2 processing integrity/privacy.',
          references: ['tests/billing.test.ts', 'tests/pii-redactor.test.ts'],
        }),
      ],
    },
    {
      id: 'soc2-type-ii',
      title: 'SOC 2 Type II readiness',
      targetMonth: 18,
      approxCostUsd: 40_000,
      owner: 'Security Engineering',
      frameworks: ['SOC 2 Type II observation period', 'SOC 2 Security', 'SOC 2 Privacy'],
      nextAction: 'Run the control set continuously, collect operating evidence, complete a tabletop, and start the Type II observation window with the selected auditor.',
      evidence: [
        evidence({
          id: 'type-i-foundation',
          label: 'Type I control foundation',
          pass: packet.trustControls.summary.missing === 0 && packet.trustControls.summary.partial === 0,
          warn: packet.trustControls.summary.missing === 0,
          detail: `${packet.trustControls.summary.partial} trust control(s) still require production evidence before Type II.`,
          references: ['legal/TRUST_CONTROLS.md', 'tests/trust-controls.test.ts'],
        }),
        evidence({
          id: 'operating-evidence-ledgers',
          label: 'Operating evidence ledgers',
          pass: implemented('GBX-SEC-002') && implemented('GBX-SEC-003') && implemented('GBX-PRI-003') && implemented('GBX-BIL-001'),
          warn: partialOrBetter('GBX-SEC-002') && partialOrBetter('GBX-SEC-003') && partialOrBetter('GBX-PRI-003') && partialOrBetter('GBX-BIL-001'),
          detail: 'Audit, incident, retention/legal-hold, and billing ledgers must be durable for the observation window.',
          references: ['tests/audit-log.test.ts', 'tests/incidents.test.ts', 'tests/retention.test.ts', 'tests/billing-jobs.test.ts'],
        }),
        evidence({
          id: 'auditor-caveat',
          label: 'Auditor engagement caveat',
          pass: false,
          warn: true,
          detail: 'No SOC 2 auditor report is present in the repository; this packet is preparation evidence only.',
          references: ['legal/TRUST_CONTROLS.md'],
        }),
      ],
    },
    {
      id: 'iso-27001',
      title: 'ISO 27001 readiness',
      targetMonth: 24,
      approxCostUsd: 60_000,
      owner: 'Security Engineering',
      frameworks: ['ISO/IEC 27001:2022 ISMS readiness'],
      nextAction: 'Formalize the ISMS scope, risk register, internal audit, management review, and certification-body engagement.',
      evidence: [
        evidence({
          id: 'isms-control-map',
          label: 'ISMS control map',
          pass: packet.trustControls.summary.missing === 0 && packet.trustControls.summary.partial === 0,
          warn: packet.trustControls.summary.missing === 0,
          detail: `${packet.trustControls.summary.partial} trust control(s) still require production evidence before ISO certification work.`,
          references: ['legal/TRUST_CONTROLS.md', 'tests/trust-controls.test.ts'],
        }),
        evidence({
          id: 'supplier-and-residency',
          label: 'Supplier, residency, and network evidence',
          pass: packet.subprocessors.records.length > 0 && allResidencyRegionsReady && privateNetworkClean,
          warn: packet.subprocessors.records.length > 0 && packet.dataResidencyReadiness.summary.blockedRegions === 0 && packet.privateNetworkReadiness.summary.failed === 0,
          detail: `${packet.dataResidencyReadiness.summary.readyRegions}/${packet.dataResidencyReadiness.supportedRegions.length} regions ready; ${packet.privateNetworkReadiness.summary.profiles} private-network profile(s).`,
          references: ['legal/SUBPROCESSORS.md', 'legal/DATA_RESIDENCY.md', 'legal/PRIVATE_NETWORKING.md'],
        }),
        evidence({
          id: 'certification-body-caveat',
          label: 'Certification body caveat',
          pass: false,
          warn: true,
          detail: 'No ISO 27001 certification body evidence is present in the repository; this packet is preparation evidence only.',
          references: ['legal/TRUST_CONTROLS.md'],
        }),
      ],
    },
  ];
}

function evidence(input: {
  id: string;
  label: string;
  pass: boolean;
  warn?: boolean;
  detail: string;
  references: string[];
}): CertificationEvidenceItem {
  return {
    id: input.id,
    label: input.label,
    status: input.pass ? 'pass' : input.warn ? 'warn' : 'fail',
    detail: input.detail,
    references: input.references,
  };
}

function finalizeMilestone(
  draft: MilestoneDraft,
  startAt: Date,
  monthsElapsed: number,
): CertificationMilestone {
  const blockers = draft.evidence
    .filter((item) => item.status !== 'pass')
    .map((item) => `${item.label}: ${item.detail}`);
  return {
    ...draft,
    dueBy: addMonthsUtc(startAt, draft.targetMonth).toISOString(),
    status: milestoneStatus(draft, monthsElapsed),
    blockers,
  };
}

function milestoneStatus(draft: MilestoneDraft, monthsElapsed: number): CertificationMilestoneStatus {
  const failures = draft.evidence.filter((item) => item.status === 'fail').length;
  const warnings = draft.evidence.filter((item) => item.status === 'warn').length;
  if (failures === 0 && warnings === 0) return 'ready';
  if (monthsElapsed >= draft.targetMonth && failures > 0) return 'blocked';
  if (monthsElapsed >= draft.targetMonth) return 'at-risk';
  if (failures > 0 || warnings > 0) return 'at-risk';
  return 'on-track';
}

function certificationIssues(milestones: CertificationMilestone[]): CertificationRoadmapIssue[] {
  return milestones.flatMap((milestone) => milestone.blockers.map((blocker) => ({
    milestoneId: milestone.id,
    severity: milestone.status === 'blocked' ? 'error' as const : 'warning' as const,
    detail: blocker,
    remediation: milestone.nextAction,
  })));
}

function elapsedWholeMonths(startAt: Date, now: Date): number {
  const years = now.getUTCFullYear() - startAt.getUTCFullYear();
  const months = now.getUTCMonth() - startAt.getUTCMonth();
  const raw = years * 12 + months;
  return Math.max(0, now.getUTCDate() < startAt.getUTCDate() ? raw - 1 : raw);
}

function addMonthsUtc(startAt: Date, months: number): Date {
  const next = new Date(startAt.getTime());
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}
