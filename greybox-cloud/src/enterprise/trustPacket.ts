// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import type { BillingLedger } from '../metering/billingLedger.js';
import type { WorkOsJwtVerifier } from '../routers/workos-auth.js';
import type { PersistenceKind } from '../security/persistenceProdSafety.js';
import type { AuditLog } from './auditLog.js';
import {
  buildDataResidencyReadinessReport,
  type DataResidencyReadinessReport,
} from './dataResidencyReadiness.js';
import {
  buildEncryptionReadinessReport,
  type EncryptionReadinessReport,
} from './encryptionReadiness.js';
import type { SecurityIncidentStore } from './incidents.js';
import type { ModelTrainingConsentStore } from './modelTrainingConsent.js';
import {
  buildPrivacyDisclosureReport,
  type PrivacyDisclosureReport,
} from './privacyDisclosures.js';
import {
  buildPrivacyGovernanceReport,
  type PrivacyGovernanceReport,
} from './privacyGovernance.js';
import {
  buildPrivateNetworkReadinessReport,
  type PrivateNetworkReadinessReport,
} from './privateNetworkReadiness.js';
import type { PrivacyRequestStore } from './privacyRequests.js';
import { defaultRetentionPolicies, type LegalHoldStore } from './retention.js';
import type { ScimUserStore } from './scim.js';
import {
  buildSubprocessorRegistry,
  type SubprocessorRecord,
  type SubprocessorRegistry,
} from './subprocessors.js';
import {
  buildTrustControlReport,
  type TrustControlReport,
} from './trustControls.js';

export interface TrustPacketDocument {
  id: string;
  title: string;
  path: string;
  status: 'template' | 'readiness-evidence' | 'counsel-review-required';
}

export interface TrustPacketRisk {
  id: string;
  severity: 'low' | 'medium' | 'high';
  owner: string;
  detail: string;
}

export interface EnterpriseTrustPacket {
  generatedAt: string;
  disclaimer: string;
  summary: {
    controlsImplemented: number;
    controlsPartial: number;
    controlsMissing: number;
    subprocessorCount: number;
    disclosuresNeedingCounsel: number;
    pendingDpiaReviews: number;
    dataResidencyReadyRegions: number;
    encryptionStatus: EncryptionReadinessReport['summary']['status'];
    privateNetworkProfiles: number;
    dpoAppointed: boolean;
    documentCount: number;
    openRiskCount: number;
  };
  documents: TrustPacketDocument[];
  risks: TrustPacketRisk[];
  trustControls: TrustControlReport;
  subprocessors: SubprocessorRegistry;
  privacyDisclosures: PrivacyDisclosureReport;
  privacyGovernance: PrivacyGovernanceReport;
  dataResidencyReadiness: DataResidencyReadinessReport;
  encryptionReadiness: EncryptionReadinessReport;
  privateNetworkReadiness: PrivateNetworkReadinessReport;
  retentionPolicies: typeof defaultRetentionPolicies;
}

export interface EnterpriseTrustPacketOptions {
  tenantStorePersistence?: PersistenceKind;
  auditLog?: AuditLog;
  auditLogPersistence?: PersistenceKind;
  billingLedger?: BillingLedger;
  billingLedgerPersistence?: PersistenceKind;
  scimStore?: ScimUserStore;
  scimStorePersistence?: PersistenceKind;
  privacyRequestStore?: PrivacyRequestStore;
  privacyRequestStorePersistence?: PersistenceKind;
  incidentStore?: SecurityIncidentStore;
  incidentStorePersistence?: PersistenceKind;
  modelTrainingConsentStore?: ModelTrainingConsentStore;
  modelTrainingConsentStorePersistence?: PersistenceKind;
  legalHoldStore?: LegalHoldStore;
  legalHoldStorePersistence?: PersistenceKind;
  subprocessorRecords?: SubprocessorRecord[];
  privacyGovernanceEnv?: Record<string, string | undefined>;
  privacyDisclosureEnv?: Record<string, string | undefined>;
  dataResidencyEnv?: Record<string, string | undefined>;
  encryptionEnv?: Record<string, string | undefined>;
  privateNetworkEnv?: Record<string, string | undefined>;
  workosVerifier?: Pick<WorkOsJwtVerifier, 'verify'>;
  trustControlReport?: TrustControlReport;
  offlineLicenseConfigured?: boolean;
  onPremReadinessConfigured?: boolean;
  now?: Date;
}

export async function buildEnterpriseTrustPacket(
  options: EnterpriseTrustPacketOptions = {},
): Promise<EnterpriseTrustPacket> {
  const now = options.now ?? new Date();
  const privacyDisclosures = buildPrivacyDisclosureReport({
    env: options.privacyDisclosureEnv,
    now,
  });
  const privacyGovernance = buildPrivacyGovernanceReport({
    env: options.privacyGovernanceEnv,
    now,
  });
  const subprocessors = buildSubprocessorRegistry({
    records: options.subprocessorRecords,
    now,
  });
  const dataResidencyReadiness = buildDataResidencyReadinessReport({
    env: options.dataResidencyEnv,
    now,
  });
  const encryptionReadiness = buildEncryptionReadinessReport({
    env: options.encryptionEnv,
    now,
  });
  const privateNetworkReadiness = buildPrivateNetworkReadinessReport({
    env: options.privateNetworkEnv,
    now,
  });
  const trustControls = options.trustControlReport ?? await buildTrustControlReport({
    ...(options.tenantStorePersistence ? { tenantStorePersistence: options.tenantStorePersistence } : {}),
    auditLog: options.auditLog,
    ...(options.auditLogPersistence ? { auditLogPersistence: options.auditLogPersistence } : {}),
    billingLedger: options.billingLedger,
    ...(options.billingLedgerPersistence ? { billingLedgerPersistence: options.billingLedgerPersistence } : {}),
    scimStore: options.scimStore,
    ...(options.scimStorePersistence ? { scimStorePersistence: options.scimStorePersistence } : {}),
    privacyRequestStore: options.privacyRequestStore,
    ...(options.privacyRequestStorePersistence ? { privacyRequestStorePersistence: options.privacyRequestStorePersistence } : {}),
    incidentStore: options.incidentStore,
    ...(options.incidentStorePersistence ? { incidentStorePersistence: options.incidentStorePersistence } : {}),
    modelTrainingConsentStore: options.modelTrainingConsentStore,
    ...(options.modelTrainingConsentStorePersistence ? { modelTrainingConsentStorePersistence: options.modelTrainingConsentStorePersistence } : {}),
    legalHoldStore: options.legalHoldStore,
    ...(options.legalHoldStorePersistence ? { legalHoldStorePersistence: options.legalHoldStorePersistence } : {}),
    subprocessorRecords: options.subprocessorRecords,
    privacyDisclosureReport: privacyDisclosures,
    privacyGovernanceReport: privacyGovernance,
    dataResidencyReadinessReport: dataResidencyReadiness,
    encryptionReadinessReport: encryptionReadiness,
    privateNetworkReadinessReport: privateNetworkReadiness,
    workosVerifier: options.workosVerifier,
    offlineLicenseConfigured: options.offlineLicenseConfigured,
    onPremReadinessConfigured: options.onPremReadinessConfigured,
    now,
  });
  const risks = trustPacketRisks({
    trustControls,
    privacyDisclosures,
    privacyGovernance,
    dataResidencyReadiness,
    encryptionReadiness,
    privateNetworkReadiness,
  });
  return {
    generatedAt: now.toISOString(),
    disclaimer: 'Enterprise trust packet is readiness evidence only. It is not a SOC 2 report, ISO 27001 certificate, penetration test, legal opinion, or regulator filing.',
    summary: {
      controlsImplemented: trustControls.summary.implemented,
      controlsPartial: trustControls.summary.partial,
      controlsMissing: trustControls.summary.missing,
      subprocessorCount: subprocessors.records.length,
      disclosuresNeedingCounsel: privacyDisclosures.summary.needsCounsel,
      pendingDpiaReviews: privacyGovernance.summary.pendingDpiaCount,
      dataResidencyReadyRegions: dataResidencyReadiness.summary.readyRegions,
      encryptionStatus: encryptionReadiness.summary.status,
      privateNetworkProfiles: privateNetworkReadiness.summary.profiles,
      dpoAppointed: privacyGovernance.summary.dpoAppointed,
      documentCount: trustPacketDocuments.length,
      openRiskCount: risks.length,
    },
    documents: trustPacketDocuments,
    risks,
    trustControls,
    subprocessors,
    privacyDisclosures,
    privacyGovernance,
    dataResidencyReadiness,
    encryptionReadiness,
    privateNetworkReadiness,
    retentionPolicies: defaultRetentionPolicies,
  };
}

export function formatEnterpriseTrustPacketMarkdown(packet: EnterpriseTrustPacket): string {
  const lines = [
    '# Greybox Enterprise Trust Packet',
    '',
    `Generated: ${packet.generatedAt}`,
    '',
    packet.disclaimer,
    '',
    '## Summary',
    '',
    `- Trust controls: ${packet.summary.controlsImplemented} implemented, ${packet.summary.controlsPartial} partial, ${packet.summary.controlsMissing} missing.`,
    `- Documents indexed: ${packet.summary.documentCount}.`,
    `- Subprocessors disclosed: ${packet.summary.subprocessorCount}.`,
    `- Privacy disclosures needing counsel: ${packet.summary.disclosuresNeedingCounsel}.`,
    `- Pending DPIA reviews: ${packet.summary.pendingDpiaReviews}.`,
    `- Data residency ready regions: ${packet.summary.dataResidencyReadyRegions}/${packet.dataResidencyReadiness.supportedRegions.length}.`,
    `- Encryption readiness: ${packet.summary.encryptionStatus}.`,
    `- Private network profiles: ${packet.summary.privateNetworkProfiles}.`,
    `- DPO appointed: ${packet.summary.dpoAppointed ? 'yes' : 'no'}.`,
    `- Open risks: ${packet.summary.openRiskCount}.`,
    '',
    '## Open Risks',
    '',
    ...riskLines(packet.risks),
    '',
    '## Document Index',
    '',
    ...packet.documents.map((document) => `- ${document.title} (${document.status}) - ${document.path}`),
    '',
    '## Control Evidence',
    '',
    ...packet.trustControls.controls.map((control) => `- ${control.id}: ${control.status} - ${control.title}`),
    '',
    '## Subprocessors',
    '',
    ...packet.subprocessors.records.map((record) => `- ${record.name}: ${record.status}; ${record.purposes.join(', ')}; regions ${record.regions.join(', ')}`),
    '',
    '## Data Residency',
    '',
    ...packet.dataResidencyReadiness.regions.map((region) => `- ${region.region}: ${region.status} - ${region.label}`),
    '',
    '## Encryption',
    '',
    ...packet.encryptionReadiness.checks.map((check) => `- ${check.id}: ${check.status} - ${check.label}`),
    '',
    '## Private Networking',
    '',
    ...privateNetworkLines(packet.privateNetworkReadiness),
    '',
  ];
  return `${lines.join('\n')}\n`;
}

export const trustPacketDocuments: TrustPacketDocument[] = [
  {
    id: 'order-form-template',
    title: 'Enterprise Order Form template',
    path: 'legal/ORDER_FORM_TEMPLATE.md',
    status: 'template',
  },
  {
    id: 'msa-template',
    title: 'Master Services Agreement template',
    path: 'legal/MSA_TEMPLATE.md',
    status: 'template',
  },
  {
    id: 'dpa-template',
    title: 'Data Processing Addendum template',
    path: 'legal/DPA_TEMPLATE.md',
    status: 'template',
  },
  {
    id: 'data-residency',
    title: 'Data residency controls',
    path: 'legal/DATA_RESIDENCY.md',
    status: 'readiness-evidence',
  },
  {
    id: 'encryption-readiness',
    title: 'Encryption and KMS readiness',
    path: 'legal/ENCRYPTION_READINESS.md',
    status: 'readiness-evidence',
  },
  {
    id: 'private-networking',
    title: 'AWS/Azure private network readiness',
    path: 'legal/PRIVATE_NETWORKING.md',
    status: 'readiness-evidence',
  },
  {
    id: 'privacy-disclosures',
    title: 'CCPA/COPPA/DPDPA disclosure readiness',
    path: 'legal/PRIVACY_DISCLOSURES.md',
    status: 'counsel-review-required',
  },
  {
    id: 'privacy-governance',
    title: 'ROPA, DPIA, and DPO readiness',
    path: 'legal/PRIVACY_GOVERNANCE.md',
    status: 'counsel-review-required',
  },
  {
    id: 'privacy-rights',
    title: 'Privacy rights workflow',
    path: 'legal/PRIVACY_RIGHTS.md',
    status: 'readiness-evidence',
  },
  {
    id: 'retention',
    title: 'Retention and legal holds',
    path: 'legal/RETENTION.md',
    status: 'counsel-review-required',
  },
  {
    id: 'subprocessors',
    title: 'Subprocessor registry',
    path: 'legal/SUBPROCESSORS.md',
    status: 'counsel-review-required',
  },
  {
    id: 'incident-response',
    title: 'Security incident response',
    path: 'legal/INCIDENT_RESPONSE.md',
    status: 'readiness-evidence',
  },
  {
    id: 'trust-controls',
    title: 'Trust controls evidence map',
    path: 'legal/TRUST_CONTROLS.md',
    status: 'readiness-evidence',
  },
  {
    id: 'certification-roadmap',
    title: 'Certification roadmap evidence',
    path: 'legal/CERTIFICATION_ROADMAP.md',
    status: 'readiness-evidence',
  },
  {
    id: 'security-questionnaire',
    title: 'Generated security questionnaire',
    path: 'legal/SECURITY_QUESTIONNAIRE.md',
    status: 'readiness-evidence',
  },
];

function riskLines(risks: TrustPacketRisk[]): string[] {
  if (risks.length === 0) return ['- No open risks recorded in this packet.'];
  return risks.map((risk) => `- [${risk.severity}] ${risk.id} - ${risk.owner}: ${risk.detail}`);
}

function privateNetworkLines(report: PrivateNetworkReadinessReport): string[] {
  if (report.profiles.length === 0) {
    return ['- No AWS or Azure private-network profiles are configured.'];
  }
  return report.profiles.map((profile) => `- ${profile.provider}:${profile.id} ${profile.status} - ${profile.customerName} (${profile.region})`);
}

function trustPacketRisks(options: {
  trustControls: TrustControlReport;
  privacyDisclosures: PrivacyDisclosureReport;
  privacyGovernance: PrivacyGovernanceReport;
  dataResidencyReadiness?: DataResidencyReadinessReport;
  encryptionReadiness?: EncryptionReadinessReport;
  privateNetworkReadiness?: PrivateNetworkReadinessReport;
}): TrustPacketRisk[] {
  const risks: TrustPacketRisk[] = [];
  if (options.trustControls.summary.missing > 0) {
    risks.push({
      id: 'missing-trust-controls',
      severity: 'high',
      owner: 'Security Engineering',
      detail: `${options.trustControls.summary.missing} trust controls are missing runtime evidence.`,
    });
  }
  if (options.trustControls.summary.partial > 0) {
    risks.push({
      id: 'partial-trust-controls',
      severity: 'medium',
      owner: 'Security Engineering',
      detail: `${options.trustControls.summary.partial} trust controls still require production evidence or counsel approval.`,
    });
  }
  if (options.privacyDisclosures.summary.needsCounsel > 0) {
    risks.push({
      id: 'privacy-disclosures-counsel-review',
      severity: 'medium',
      owner: 'Privacy Operations',
      detail: `${options.privacyDisclosures.summary.needsCounsel} privacy disclosure checklists still require counsel-approved public copy.`,
    });
  }
  if (options.privacyGovernance.summary.pendingDpiaCount > 0) {
    risks.push({
      id: 'pending-dpia-reviews',
      severity: 'medium',
      owner: 'Privacy Operations',
      detail: `${options.privacyGovernance.summary.pendingDpiaCount} DPIA assessments are draft or review-needed.`,
    });
  }
  if (!options.privacyGovernance.summary.dpoAppointed) {
    risks.push({
      id: 'dpo-not-appointed',
      severity: 'medium',
      owner: 'Privacy Operations',
      detail: 'DPO appointment evidence is not fully configured for this deployment.',
    });
  }
  if (options.dataResidencyReadiness && options.dataResidencyReadiness.summary.readyRegions < options.dataResidencyReadiness.supportedRegions.length) {
    risks.push({
      id: 'data-residency-regions-not-ready',
      severity: options.dataResidencyReadiness.summary.blockedRegions > 0 ? 'high' : 'medium',
      owner: 'Enterprise Engineering',
      detail: `${options.dataResidencyReadiness.summary.readyRegions}/${options.dataResidencyReadiness.supportedRegions.length} residency regions are fully ready.`,
    });
  }
  if (options.encryptionReadiness && options.encryptionReadiness.summary.status !== 'pass') {
    risks.push({
      id: 'encryption-readiness-not-ready',
      severity: options.encryptionReadiness.summary.status === 'fail' ? 'high' : 'medium',
      owner: 'Security Engineering',
      detail: `Encryption readiness is ${options.encryptionReadiness.summary.status}; customer-specific encryption claims need complete KMS, storage, TLS, backup, and secret-manager evidence.`,
    });
  }
  if (options.privateNetworkReadiness && options.privateNetworkReadiness.summary.failed > 0) {
    risks.push({
      id: 'private-network-readiness-failed',
      severity: 'high',
      owner: 'Enterprise Engineering',
      detail: `${options.privateNetworkReadiness.summary.failed} private-network profiles have failed readiness checks.`,
    });
  } else if (options.privateNetworkReadiness && options.privateNetworkReadiness.summary.warnings > 0) {
    risks.push({
      id: 'private-network-readiness-warnings',
      severity: 'medium',
      owner: 'Enterprise Engineering',
      detail: `${options.privateNetworkReadiness.summary.warnings} private-network profiles still need configuration or reachability evidence.`,
    });
  } else if (options.privateNetworkReadiness && options.privateNetworkReadiness.summary.profiles === 0) {
    risks.push({
      id: 'private-network-not-configured',
      severity: 'medium',
      owner: 'Enterprise Engineering',
      detail: 'No AWS or Azure private-network profiles are configured for enterprise pilots.',
    });
  }
  return risks;
}
