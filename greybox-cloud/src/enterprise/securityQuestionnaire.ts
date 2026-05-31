// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { buildEnterpriseTrustPacket, type EnterpriseTrustPacket, type EnterpriseTrustPacketOptions } from './trustPacket.js';
import { buildEnterpriseContractPacket, type EnterpriseContractPacket } from './contractPacket.js';

export type QuestionnaireStatus = 'ready' | 'needs-review' | 'blocked';
export type QuestionnaireCategory =
  | 'company'
  | 'access'
  | 'audit'
  | 'privacy'
  | 'ai'
  | 'compliance'
  | 'residency'
  | 'network'
  | 'operations'
  | 'billing';

export interface SecurityQuestionnaireAnswer {
  id: string;
  category: QuestionnaireCategory;
  question: string;
  answer: string;
  status: QuestionnaireStatus;
  owner: string;
  evidence: string[];
}

export interface SecurityQuestionnaireReport {
  generatedAt: string;
  disclaimer: string;
  summary: {
    answers: number;
    ready: number;
    needsReview: number;
    blocked: number;
  };
  answers: SecurityQuestionnaireAnswer[];
}

export interface SecurityQuestionnaireOptions extends EnterpriseTrustPacketOptions {
  packet?: EnterpriseTrustPacket;
  contractPacket?: EnterpriseContractPacket;
  contractRoot?: string;
}

export async function buildSecurityQuestionnaireReport(
  options: SecurityQuestionnaireOptions = {},
): Promise<SecurityQuestionnaireReport> {
  const packet = options.packet ?? await buildEnterpriseTrustPacket(options);
  const contractPacket = options.contractPacket ?? buildEnterpriseContractPacket({
    root: options.contractRoot,
    now: options.now,
  });
  const answers = questionnaireAnswers(packet, contractPacket);
  return {
    generatedAt: packet.generatedAt,
    disclaimer: 'Security questionnaire answers are generated from Greybox readiness evidence. They are not legal advice, auditor assurance, production console exports, or customer-specific contract terms.',
    summary: {
      answers: answers.length,
      ready: answers.filter((answer) => answer.status === 'ready').length,
      needsReview: answers.filter((answer) => answer.status === 'needs-review').length,
      blocked: answers.filter((answer) => answer.status === 'blocked').length,
    },
    answers,
  };
}

export function exportSecurityQuestionnaireCsv(report: SecurityQuestionnaireReport): string {
  const header = ['id', 'category', 'status', 'owner', 'question', 'answer', 'evidence'].join(',');
  const rows = report.answers.map((answer) => [
    answer.id,
    answer.category,
    answer.status,
    answer.owner,
    answer.question,
    answer.answer,
    answer.evidence.join('; '),
  ].map(csvCell).join(','));
  return `${[header, ...rows].join('\n')}\n`;
}

function questionnaireAnswers(packet: EnterpriseTrustPacket, contractPacket: EnterpriseContractPacket): SecurityQuestionnaireAnswer[] {
  const control = (id: string) => packet.trustControls.controls.find((item) => item.id === id);
  const controlEvidence = (controlId: string, evidenceId: string) => control(controlId)?.evidence.find((item) => item.id === evidenceId);
  const implemented = (id: string) => control(id)?.status === 'implemented';
  const missing = (id: string) => control(id)?.status === 'missing';
  const statusForControl = (id: string): QuestionnaireStatus => {
    if (implemented(id)) return 'ready';
    if (missing(id)) return 'blocked';
    return 'needs-review';
  };
  const residencyReady = packet.dataResidencyReadiness.summary.readyRegions === packet.dataResidencyReadiness.supportedRegions.length;
  const privateNetworkReady = packet.privateNetworkReadiness.summary.profiles > 0
    && packet.privateNetworkReadiness.summary.failed === 0
    && packet.privateNetworkReadiness.summary.warnings === 0;
  const hasPrivateNetworkFailures = packet.privateNetworkReadiness.summary.failed > 0;
  const encryptionReady = packet.encryptionReadiness.summary.status === 'pass';
  const monthlyReservation = controlEvidence('GBX-BIL-001', 'monthly-usage-reservation-control');
  const monthlyReservationReady = monthlyReservation?.status === 'implemented';

  return [
    {
      id: 'company-product-summary',
      category: 'company',
      question: 'What is Greybox Studio?',
      answer: 'Greybox is an AI-assisted game-design and engine-export platform for Unity-first game teams, with managed inference, Pro modules, enterprise controls, and engine-plugin licensing surfaces under active development.',
      status: 'needs-review',
      owner: 'Product',
      evidence: ['README.md', 'legal/ENTERPRISE_TRUST_PACKET.md'],
    },
    {
      id: 'certifications-current-status',
      category: 'compliance',
      question: 'Is Greybox SOC 2 or ISO 27001 certified?',
      answer: 'No. The current packet is readiness evidence only and explicitly does not claim SOC 2, ISO 27001, auditor assurance, or certification. Auditor engagement and production evidence remain required before those claims can be made.',
      status: 'needs-review',
      owner: 'Security Engineering',
      evidence: ['legal/TRUST_CONTROLS.md', 'GET /v1/enterprise/trust-controls'],
    },
    {
      id: 'contracting-documents',
      category: 'compliance',
      question: 'Are MSA and DPA templates ready for enterprise contracting?',
      answer: contractPacket.summary.blocked === 0
        ? `Yes. The contract packet verifies ${contractPacket.summary.readyToSign} ready-to-sign templates, supporting evidence documents, SHA-256 hashes, order-form fields, and a signing checklist. Customer-specific legal review and order-form terms are still required.`
        : `No. The contract packet has ${contractPacket.summary.blockingIssues} blocking issues across the Order Form, MSA, DPA, and supporting evidence before customer contracting.`,
      status: contractPacket.summary.blocked === 0 ? 'ready' : 'blocked',
      owner: 'Revenue Operations',
      evidence: ['legal/MSA_TEMPLATE.md', 'legal/DPA_TEMPLATE.md', 'GET /v1/enterprise/contracts'],
    },
    {
      id: 'sso-scim',
      category: 'access',
      question: 'Does Greybox support SSO and SCIM?',
      answer: implemented('GBX-SEC-001')
        ? 'Yes. Enterprise access is scoped by tenant, WorkOS organization, role, and scope, with SCIM provisioning evidence configured.'
        : 'The code supports WorkOS JWT tenant isolation and SCIM provisioning, but production tenant evidence is not fully configured in this packet.',
      status: statusForControl('GBX-SEC-001'),
      owner: 'Security Engineering',
      evidence: ['tests/auth.test.ts', 'tests/scim.test.ts', 'src/routers/workos-auth.ts', 'src/enterprise/scim.ts'],
    },
    {
      id: 'audit-logging',
      category: 'audit',
      question: 'Does Greybox provide audit logs?',
      answer: implemented('GBX-SEC-002')
        ? 'Yes. Security, billing, SCIM, inference, license, and entitlement actions are exportable with a tamper-evident hash chain.'
        : 'Audit logging code exists, including CSV/Splunk exports and hash-chain verification, but production evidence is not fully configured in this packet.',
      status: statusForControl('GBX-SEC-002'),
      owner: 'Security Engineering',
      evidence: ['tests/audit-log.test.ts', 'GET /v1/audit-log/export', 'GET /v1/audit-log/verify'],
    },
    {
      id: 'incident-response',
      category: 'operations',
      question: 'Does Greybox have an incident response workflow?',
      answer: implemented('GBX-SEC-003')
        ? 'Yes. Security incidents are tracked with containment tasks, regulatory timers, GDPR breach clocks, and sanitized audit events.'
        : 'Incident response code exists, including GDPR breach-clock evidence, but a durable production store or tabletop evidence is still required.',
      status: statusForControl('GBX-SEC-003'),
      owner: 'Security Engineering',
      evidence: ['legal/INCIDENT_RESPONSE.md', 'tests/incidents.test.ts', 'GET /v1/enterprise/incidents'],
    },
    {
      id: 'privacy-rights',
      category: 'privacy',
      question: 'Can users exercise privacy rights such as access, deletion, correction, or opt-out?',
      answer: implemented('GBX-PRI-001')
        ? 'Yes. Rights requests are captured durably, statused with hashed requester tokens, and fulfilled from account, billing, audit, and retention evidence.'
        : 'Privacy rights workflows exist for GDPR, CCPA/CPRA, COPPA, DPDPA, and model-training opt-out, but production durable evidence is incomplete.',
      status: statusForControl('GBX-PRI-001'),
      owner: 'Privacy Operations',
      evidence: ['legal/PRIVACY_RIGHTS.md', 'tests/privacy-requests.test.ts', 'GET /v1/privacy/requests'],
    },
    {
      id: 'subprocessors',
      category: 'privacy',
      question: 'Does Greybox disclose subprocessors?',
      answer: `Yes. The current registry discloses ${packet.subprocessors.records.length} planned or active subprocessors with purposes, data categories, regions, transfer mechanisms, and a ${packet.subprocessors.noticePeriodDays}-day material-change notice.`,
      status: statusForControl('GBX-PRI-002'),
      owner: 'Privacy Operations',
      evidence: ['legal/SUBPROCESSORS.md', 'GET /v1/enterprise/subprocessors'],
    },
    {
      id: 'retention-deletion',
      category: 'privacy',
      question: 'How does Greybox handle retention, deletion, and legal holds?',
      answer: implemented('GBX-PRI-003')
        ? 'Default retention policies and a durable legal-hold ledger document deletion exceptions, retention bases, and active holds.'
        : 'Retention policies and legal-hold code exist, but counsel-approved periods and production deletion jobs remain required.',
      status: statusForControl('GBX-PRI-003'),
      owner: 'Privacy Operations',
      evidence: ['legal/RETENTION.md', 'tests/retention.test.ts', 'GET /v1/enterprise/retention-policies'],
    },
    {
      id: 'privacy-governance',
      category: 'privacy',
      question: 'Does Greybox maintain ROPA, DPIA, and DPO evidence?',
      answer: `Greybox exposes ROPA, DPIA, and DPO readiness evidence. Current packet has ${packet.privacyGovernance.summary.ropaRecordCount} ROPA records, ${packet.privacyGovernance.summary.pendingDpiaCount} pending DPIA reviews, and DPO appointed = ${packet.privacyGovernance.summary.dpoAppointed}.`,
      status: statusForControl('GBX-PRI-004'),
      owner: 'Privacy Operations',
      evidence: ['legal/PRIVACY_GOVERNANCE.md', 'GET /v1/enterprise/privacy-governance'],
    },
    {
      id: 'privacy-disclosures',
      category: 'privacy',
      question: 'Are CCPA/CPRA, COPPA, and India DPDPA disclosures prepared?',
      answer: `The disclosure register covers ${packet.privacyDisclosures.summary.disclosures} jurisdictions and currently has ${packet.privacyDisclosures.summary.needsCounsel} counsel-review items before public launch claims.`,
      status: statusForControl('GBX-PRI-005'),
      owner: 'Privacy Operations',
      evidence: ['legal/PRIVACY_DISCLOSURES.md', 'GET /v1/privacy/disclosures'],
    },
    {
      id: 'data-residency',
      category: 'residency',
      question: 'Does Greybox support data residency?',
      answer: `Greybox supports US, EU, and India tenant residency labels and a readiness matrix. ${packet.dataResidencyReadiness.summary.readyRegions}/${packet.dataResidencyReadiness.supportedRegions.length} regions are fully ready in this packet.`,
      status: residencyReady ? 'ready' : 'needs-review',
      owner: 'Enterprise Engineering',
      evidence: ['legal/DATA_RESIDENCY.md', 'GET /v1/enterprise/data-residency/readiness'],
    },
    {
      id: 'private-networking',
      category: 'network',
      question: 'Does Greybox support AWS VPC or Azure VNet private connectivity?',
      answer: `Greybox tracks AWS VPC peering and Azure VNet peering readiness. This packet has ${packet.privateNetworkReadiness.summary.profiles} private-network profiles, ${packet.privateNetworkReadiness.summary.passed} passing, ${packet.privateNetworkReadiness.summary.warnings} warning, and ${packet.privateNetworkReadiness.summary.failed} failed.`,
      status: hasPrivateNetworkFailures ? 'blocked' : privateNetworkReady ? 'ready' : 'needs-review',
      owner: 'Enterprise Engineering',
      evidence: ['legal/PRIVATE_NETWORKING.md', 'GET /v1/enterprise/private-network/readiness'],
    },
    {
      id: 'onprem',
      category: 'operations',
      question: 'Does Greybox support on-prem deployment?',
      answer: implemented('GBX-OPS-001')
        ? 'Yes. On-prem readiness checks verify signed offline license material, durable stores, rotated secrets, explicit deployment mode, and managed-inference egress.'
        : 'An on-prem Docker skeleton and readiness route exist, but production signed license material and customer-like install evidence are still required.',
      status: statusForControl('GBX-OPS-001'),
      owner: 'Enterprise Engineering',
      evidence: ['OPERATIONS.md', 'tests/onprem-readiness.test.ts', 'GET /v1/enterprise/onprem-readiness'],
    },
    {
      id: 'managed-inference-logging',
      category: 'ai',
      question: 'Does Greybox log prompts or outputs for managed inference?',
      answer: 'Audit and billing records intentionally store metadata such as route, project, provider, model, task, token counts, tier, and region. Prompt text, assistant output, game IP, raw API keys, and decryption secrets are excluded from audit entries.',
      status: statusForControl('GBX-AI-001'),
      owner: 'AI Platform',
      evidence: ['tests/inference.test.ts', 'tests/audit-log.test.ts', 'OPERATIONS.md'],
    },
    {
      id: 'model-training',
      category: 'ai',
      question: 'Does Greybox train models on customer data by default?',
      answer: 'No. Missing consent is treated as opted out. Future Greybox Native training requires a separate explicit opt-in checkbox and consent text; audit records keep only consent-state metadata and a consent-text hash.',
      status: statusForControl('GBX-AI-001'),
      owner: 'AI Platform',
      evidence: ['legal/MODEL_TRAINING_CONSENT.md', 'tests/model-training-consent.test.ts', 'GET /v1/model-training-consent'],
    },
    {
      id: 'pii-redaction',
      category: 'ai',
      question: 'Does Greybox minimize personal data in AI logs?',
      answer: 'Yes. PII redaction covers emails, phones, credit cards, IPv4/IPv6 addresses, and nested inference logs, backed by a 100-case regression suite.',
      status: statusForControl('GBX-AI-001'),
      owner: 'AI Platform',
      evidence: ['tests/pii-redactor.test.ts', 'src/safety/piiRedactor.ts'],
    },
    {
      id: 'billing-reconciliation',
      category: 'billing',
      question: 'Can managed-inference usage be reconciled for billing?',
      answer: implemented('GBX-BIL-001')
        ? 'Yes. Usage, included-token application, invoices, and Stripe meter submissions are append-only and reconcilable, with Postgres-backed monthly reservation controls configured for included-token classification.'
        : monthlyReservationReady
          ? 'Usage reservation controls are configured, but the full billing reconciliation control still needs ledger or Stripe evidence before a ready answer.'
          : `Billing ledger code exists, but production ledger, Stripe reconciliation, or Postgres-backed monthly reservation evidence is incomplete. ${monthlyReservation?.detail ?? 'No monthly reservation evidence is present in this packet.'}`,
      status: statusForControl('GBX-BIL-001'),
      owner: 'Revenue Systems',
      evidence: ['tests/billing.test.ts', 'tests/billing-jobs.test.ts', 'tests/billing-ledger-postgres.test.ts', 'src/metering/billingLedgerPostgres.ts'],
    },
    {
      id: 'encryption-production',
      category: 'compliance',
      question: 'Is production encryption evidence available?',
      answer: encryptionReady
        ? `Yes. The encryption readiness packet shows ${packet.encryptionReadiness.summary.encryptedDatasets}/${packet.encryptionReadiness.summary.requiredDatasets} required datasets complete, ${packet.encryptionReadiness.summary.regionsWithKeys}/${packet.encryptionReadiness.summary.requiredRegions} regions with KMS evidence, TLS/HSTS ready, encrypted backups, and supported secret management.`
        : `Not yet. Encryption readiness is ${packet.encryptionReadiness.summary.status}; production KMS configuration, storage encryption exports, TLS/HSTS, backup encryption, and key/secret rotation evidence must be attached before making customer-specific encryption claims.`,
      status: encryptionReady ? 'ready' : 'needs-review',
      owner: 'Security Engineering',
      evidence: ['legal/ENCRYPTION_READINESS.md', 'GET /v1/enterprise/encryption-readiness', 'legal/DPA_TEMPLATE.md'],
    },
  ];
}

function csvCell(value: unknown): string {
  const text = value === undefined || value === null ? '' : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}
