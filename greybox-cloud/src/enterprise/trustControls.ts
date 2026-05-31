// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import type { BillingLedger } from '../metering/billingLedger.js';
import type { WorkOsJwtVerifier } from '../routers/workos-auth.js';
import type { PersistenceKind } from '../security/persistenceProdSafety.js';
import { buildDataResidencyReadinessReport, type DataResidencyReadinessReport } from './dataResidencyReadiness.js';
import {
  buildEncryptionReadinessReport,
  type EncryptionReadinessReport,
} from './encryptionReadiness.js';
import type { AuditLog } from './auditLog.js';
import type { SecurityIncidentStore } from './incidents.js';
import type { ModelTrainingConsentStore } from './modelTrainingConsent.js';
import type { LegalHoldStore } from './retention.js';
import type { ScimUserStore } from './scim.js';
import type { PrivacyRequestStore } from './privacyRequests.js';
import { buildPrivacyDisclosureReport, type PrivacyDisclosureReport } from './privacyDisclosures.js';
import { buildPrivacyGovernanceReport, type PrivacyGovernanceReport } from './privacyGovernance.js';
import { buildPrivateNetworkReadinessReport, type PrivateNetworkReadinessReport } from './privateNetworkReadiness.js';
import { buildSubprocessorRegistry, type SubprocessorRecord } from './subprocessors.js';

export type TrustControlStatus = 'implemented' | 'partial' | 'missing';

export interface TrustControlEvidence {
  id: string;
  label: string;
  status: TrustControlStatus;
  detail: string;
  references?: string[];
}

export interface TrustControl {
  id: string;
  title: string;
  frameworks: string[];
  owner: string;
  status: TrustControlStatus;
  description: string;
  evidence: TrustControlEvidence[];
  nextAction?: string;
}

export interface TrustControlReport {
  generatedAt: string;
  disclaimer: string;
  summary: {
    implemented: number;
    partial: number;
    missing: number;
  };
  controls: TrustControl[];
}

export interface TrustControlOptions {
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
  privacyGovernanceReport?: PrivacyGovernanceReport;
  privacyDisclosureEnv?: Record<string, string | undefined>;
  privacyDisclosureReport?: PrivacyDisclosureReport;
  dataResidencyEnv?: Record<string, string | undefined>;
  dataResidencyReadinessReport?: DataResidencyReadinessReport;
  encryptionEnv?: Record<string, string | undefined>;
  encryptionReadinessReport?: EncryptionReadinessReport;
  privateNetworkEnv?: Record<string, string | undefined>;
  privateNetworkReadinessReport?: PrivateNetworkReadinessReport;
  workosVerifier?: Pick<WorkOsJwtVerifier, 'verify'>;
  offlineLicenseConfigured?: boolean;
  onPremReadinessConfigured?: boolean;
  now?: Date;
}

type EvidenceFactory = (options: TrustControlOptions) => Promise<TrustControlEvidence[]> | TrustControlEvidence[];

interface TrustControlDefinition {
  id: string;
  title: string;
  frameworks: string[];
  owner: string;
  description: string;
  nextAction: string;
  evidence: EvidenceFactory;
}

const definitions: TrustControlDefinition[] = [
  {
    id: 'GBX-SEC-001',
    title: 'Tenant identity and access boundary',
    frameworks: ['SOC 2 Security', 'SOC 2 Confidentiality', 'ISO/IEC 27001 ISMS access control'],
    owner: 'Security Engineering',
    description: 'Enterprise access is scoped by tenant, WorkOS organization, role, and scope.',
    nextAction: 'Connect production WorkOS tenants and export IdP configuration evidence.',
    evidence: (options) => [
      {
        id: 'workos-verifier',
        label: 'WorkOS JWT verification',
        status: options.workosVerifier ? 'implemented' : 'partial',
        detail: options.workosVerifier
          ? 'WorkOS verifier is configured for this process.'
          : 'Code supports WorkOS verification; production JWKS/issuer/audience are not configured in this process.',
        references: ['tests/auth.test.ts', 'src/routers/workos-auth.ts'],
      },
      {
        id: 'tenant-store',
        label: 'Tenant mapping store',
        status: persistenceImplemented(options.tenantStorePersistence) ? 'implemented' : 'partial',
        detail: tenantStoreDetail(options.tenantStorePersistence),
        references: ['tests/auth.test.ts', 'src/routers/tenants.ts'],
      },
      {
        id: 'scim-store',
        label: 'SCIM provisioning store',
        status: scimStorePersistenceImplemented(options.scimStorePersistence) ? 'implemented' : 'partial',
        detail: scimStoreDetail(options.scimStorePersistence, Boolean(options.scimStore)),
        references: ['tests/scim.test.ts', 'src/enterprise/scim.ts'],
      },
    ],
  },
  {
    id: 'GBX-SEC-002',
    title: 'Tamper-evident audit logging',
    frameworks: ['SOC 2 Security', 'SOC 2 Processing Integrity', 'ISO/IEC 27001 logging and monitoring'],
    owner: 'Security Engineering',
    description: 'Security, billing, SCIM, inference, license, and entitlement actions are exportable with a hash chain.',
    nextAction: 'Ship audit log retention policy and wire production SIEM export.',
    evidence: async (options) => {
      if (!options.auditLog) {
        return [{
          id: 'audit-log-configured',
          label: 'Audit log configuration',
          status: 'partial',
          detail: 'Audit logging code exists but no audit log is configured for this process.',
          references: ['tests/audit-log.test.ts', 'src/enterprise/auditLog.ts'],
        }];
      }
      const verification = await options.auditLog.verify();
      const durable = persistenceImplemented(options.auditLogPersistence);
      const valid = verification.valid && durable;
      return [
        {
          id: 'audit-log-hash-chain',
          label: 'Audit hash-chain, seal, and durability verification',
          status: verification.valid ? (valid ? 'implemented' : 'partial') : 'missing',
          detail: auditLogDetail(verification, options.auditLogPersistence),
          references: ['tests/audit-log.test.ts', 'OPERATIONS.md'],
        },
      ];
    },
  },
  {
    id: 'GBX-SEC-003',
    title: 'Security incident response',
    frameworks: ['SOC 2 Security', 'SOC 2 Availability', 'ISO/IEC 27001 incident management', 'GDPR breach readiness'],
    owner: 'Security Engineering',
    description: 'Security incidents are tracked durably with containment tasks, regulatory timers, and sanitized audit events.',
    nextAction: 'Run a tabletop exercise and connect incident exports to the production SIEM.',
    evidence: async (options) => {
      if (!options.incidentStore) {
        return [{
          id: 'incident-store-configured',
          label: 'Incident response store',
          status: 'partial',
          detail: 'Incident response code exists but no durable incident store is configured for this process.',
          references: ['tests/incidents.test.ts', 'src/enterprise/incidents.ts'],
        }];
      }
      const incidents = await options.incidentStore.list();
      const openRegulatoryClocks = incidents.reduce(
        (count, incident) => count + incident.regulatoryClocks.filter((clock) => clock.status === 'pending').length,
        0,
      );
      return [{
        id: 'incident-response-ledger',
        label: 'Incident response ledger',
        status: persistenceImplemented(options.incidentStorePersistence) ? 'implemented' : 'partial',
        detail: durableStoreDetail({
          label: 'Incident store',
          persistence: options.incidentStorePersistence,
          durablePurpose: `tracking ${incidents.length} current incidents and ${openRegulatoryClocks} pending regulatory clocks`,
          readinessNoun: 'incident-response',
        }),
        references: ['tests/incidents.test.ts', 'OPERATIONS.md'],
      }];
    },
  },
  {
    id: 'GBX-SEC-004',
    title: 'Encryption and key management readiness',
    frameworks: ['SOC 2 Security', 'SOC 2 Confidentiality', 'ISO/IEC 27001 cryptography'],
    owner: 'Security Engineering',
    description: 'Encryption evidence tracks KMS provider, regional keys, encrypted stores, TLS/HSTS, backups, and secret rotation without exposing raw key material.',
    nextAction: 'Attach production KMS, storage, TLS, backup, and secret-manager evidence before customer-specific encryption claims.',
    evidence: (options) => {
      const report = options.encryptionReadinessReport ?? buildEncryptionReadinessReport({
        env: options.encryptionEnv,
        now: options.now,
      });
      return [{
        id: 'encryption-readiness',
        label: 'Encryption readiness report',
        status: report.summary.status === 'pass' ? 'implemented' : 'partial',
        detail: `Encryption readiness is ${report.summary.status}; ${report.summary.encryptedDatasets}/${report.summary.requiredDatasets} datasets complete, ${report.summary.regionsWithKeys}/${report.summary.requiredRegions} regions with key evidence.`,
        references: ['tests/encryption-readiness.test.ts', 'legal/ENCRYPTION_READINESS.md', 'GET /v1/enterprise/encryption-readiness'],
      }];
    },
  },
  {
    id: 'GBX-PRI-001',
    title: 'Privacy rights intake and fulfillment',
    frameworks: ['SOC 2 Privacy', 'GDPR/CCPA/COPPA/DPDPA readiness', 'ISO/IEC 27001 privacy support'],
    owner: 'Privacy Operations',
    description: 'Rights requests are captured durably, statused with hashed tokens, and fulfilled from account, billing, and audit evidence.',
    nextAction: 'Have counsel approve public privacy policy and final response templates.',
    evidence: async (options) => {
      if (!options.privacyRequestStore) {
        return [{
          id: 'privacy-store-configured',
          label: 'Privacy request store',
          status: 'partial',
          detail: 'Privacy workflow code exists but no durable privacy request store is configured for this process.',
          references: ['tests/privacy-requests.test.ts', 'legal/PRIVACY_RIGHTS.md'],
        }];
      }
      const requests = await options.privacyRequestStore.list();
      return [{
        id: 'privacy-request-ledger',
        label: 'Privacy request ledger',
        status: persistenceImplemented(options.privacyRequestStorePersistence) ? 'implemented' : 'partial',
        detail: durableStoreDetail({
          label: 'Privacy request store',
          persistence: options.privacyRequestStorePersistence,
          durablePurpose: `tracking ${requests.length} current request records`,
          readinessNoun: 'privacy-rights',
        }),
        references: ['tests/privacy-requests.test.ts', 'legal/PRIVACY_RIGHTS.md'],
      }];
    },
  },
  {
    id: 'GBX-PRI-002',
    title: 'Subprocessor disclosure',
    frameworks: ['SOC 2 Privacy', 'GDPR Article 28 readiness', 'ISO/IEC 27001 supplier relationships'],
    owner: 'Privacy Operations',
    description: 'Hosting, auth, billing, inference, observability, analytics, and GPU providers are listed with purpose, data categories, transfer mechanisms, and change notice.',
    nextAction: 'Replace planned defaults with counsel-approved production subprocessors before launch.',
    evidence: (options) => {
      const registry = buildSubprocessorRegistry({
        records: options.subprocessorRecords,
        now: options.now,
      });
      return [{
        id: 'subprocessor-registry',
        label: 'Subprocessor registry',
        status: registry.records.length > 0 && registry.noticePeriodDays >= 30 ? 'implemented' : 'partial',
        detail: `Registry discloses ${registry.records.length} subprocessors with ${registry.noticePeriodDays}-day change notice.`,
        references: ['tests/subprocessors.test.ts', 'legal/SUBPROCESSORS.md'],
      }];
    },
  },
  {
    id: 'GBX-PRI-003',
    title: 'Retention and legal holds',
    frameworks: ['SOC 2 Privacy', 'SOC 2 Security', 'GDPR erasure and processor-return readiness', 'ISO/IEC 27001 records management'],
    owner: 'Privacy Operations',
    description: 'Deletion exceptions are backed by default retention policies and a durable legal-hold ledger.',
    nextAction: 'Have counsel approve retention periods and map each production datastore to a deletion job.',
    evidence: async (options) => {
      if (!options.legalHoldStore) {
        return [{
          id: 'legal-hold-store-configured',
          label: 'Legal hold store',
          status: 'partial',
          detail: 'Retention policy code exists but no durable legal-hold store is configured for this process.',
          references: ['tests/retention.test.ts', 'legal/RETENTION.md'],
        }];
      }
      const activeHolds = await options.legalHoldStore.list({ status: 'active' });
      return [{
        id: 'legal-hold-ledger',
        label: 'Legal hold ledger',
        status: persistenceImplemented(options.legalHoldStorePersistence) ? 'implemented' : 'partial',
        detail: durableStoreDetail({
          label: 'Legal hold store',
          persistence: options.legalHoldStorePersistence,
          durablePurpose: `tracking ${activeHolds.length} active holds`,
          readinessNoun: 'retention/legal-hold',
        }),
        references: ['tests/retention.test.ts', 'legal/RETENTION.md'],
      }];
    },
  },
  {
    id: 'GBX-PRI-004',
    title: 'Privacy governance evidence',
    frameworks: ['SOC 2 Privacy', 'GDPR Articles 30/35/37 readiness', 'ISO/IEC 27001 privacy governance'],
    owner: 'Privacy Operations',
    description: 'ROPA records, DPIA assessments, and DPO appointment evidence are exposed for admin review without claiming certification.',
    nextAction: 'Have counsel approve the ROPA, complete DPIA reviews, and configure DPO appointment evidence before launch.',
    evidence: (options) => {
      const report = options.privacyGovernanceReport ?? buildPrivacyGovernanceReport({
        env: options.privacyGovernanceEnv,
        now: options.now,
      });
      const pendingDpiaCount = report.summary.pendingDpiaCount;
      return [
        {
          id: 'ropa-register',
          label: 'ROPA register',
          status: report.summary.ropaRecordCount > 0 ? 'implemented' : 'missing',
          detail: `ROPA register contains ${report.summary.ropaRecordCount} processing activities mapped to GDPR Article 30 evidence fields.`,
          references: ['tests/privacy-governance.test.ts', 'legal/PRIVACY_GOVERNANCE.md'],
        },
        {
          id: 'dpia-register',
          label: 'DPIA register',
          status: pendingDpiaCount === 0 ? 'implemented' : 'partial',
          detail: `DPIA register contains ${report.summary.dpiaAssessmentCount} assessments, including ${report.summary.highRiskDpiaCount} high-risk assessments and ${pendingDpiaCount} pending reviews.`,
          references: ['tests/privacy-governance.test.ts', 'legal/PRIVACY_GOVERNANCE.md'],
        },
        {
          id: 'dpo-appointment',
          label: 'DPO appointment evidence',
          status: report.dpo.appointed ? 'implemented' : 'partial',
          detail: report.dpo.appointed
            ? `DPO appointment is configured for ${report.dpo.region ?? 'global'} and contact publication is tracked.`
            : 'DPO appointment code exists, but GREYBOX_DPO_NAME, GREYBOX_DPO_EMAIL, and GREYBOX_DPO_APPOINTED_AT are not fully configured.',
          references: ['tests/privacy-governance.test.ts', 'OPERATIONS.md'],
        },
      ];
    },
  },
  {
    id: 'GBX-PRI-005',
    title: 'Privacy notices and child safeguards',
    frameworks: ['SOC 2 Privacy', 'CCPA/CPRA readiness', 'COPPA readiness', 'India DPDPA readiness'],
    owner: 'Privacy Operations',
    description: 'Public disclosure evidence tracks California notices, COPPA parent/school boundaries, and India DPDPA notice, grievance, and child safeguards.',
    nextAction: 'Have counsel approve public privacy policy copy, child-directed deployment gates, and California notice placement before launch.',
    evidence: (options) => {
      const report = options.privacyDisclosureReport ?? buildPrivacyDisclosureReport({
        env: options.privacyDisclosureEnv,
        now: options.now,
      });
      return [
        {
          id: 'privacy-disclosure-register',
          label: 'Privacy disclosure register',
          status: report.summary.needsCounsel === 0 ? 'implemented' : 'partial',
          detail: `Disclosure register covers ${report.summary.disclosures} jurisdictions with ${report.summary.needsCounsel} counsel-review items.`,
          references: ['tests/privacy-disclosures.test.ts', 'legal/PRIVACY_DISCLOSURES.md'],
        },
        {
          id: 'privacy-disclosure-public-route',
          label: 'Public disclosure route',
          status: 'implemented',
          detail: 'GET /v1/privacy/disclosures returns sanitized public disclosure readiness evidence without secrets or game IP.',
          references: ['tests/privacy-disclosures.test.ts', 'README.md'],
        },
      ];
    },
  },
  {
    id: 'GBX-PRI-006',
    title: 'Data residency operations',
    frameworks: ['SOC 2 Privacy', 'SOC 2 Confidentiality', 'GDPR transfer readiness', 'India DPDPA readiness'],
    owner: 'Enterprise Engineering',
    description: 'US, EU, and India residency readiness is tracked across regional deployments, stores, provider egress, transfer bases, and backups.',
    nextAction: 'Provision region-local storage and provider egress policies for all enterprise regions before signing residency commitments.',
    evidence: (options) => {
      const report = options.dataResidencyReadinessReport ?? buildDataResidencyReadinessReport({
        env: options.dataResidencyEnv,
        now: options.now,
      });
      return [{
        id: 'data-residency-readiness',
        label: 'Regional readiness matrix',
        status: report.summary.blockedRegions > 0
          ? 'missing'
          : report.summary.readyRegions === report.supportedRegions.length
            ? 'implemented'
            : 'partial',
        detail: `Residency matrix has ${report.summary.readyRegions}/${report.supportedRegions.length} ready regions, ${report.summary.warningRegions} warning regions, and ${report.summary.blockedRegions} blocked regions.`,
        references: ['tests/data-residency-readiness.test.ts', 'legal/DATA_RESIDENCY.md'],
      }];
    },
  },
  {
    id: 'GBX-BIL-001',
    title: 'Usage metering and billing reconciliation',
    frameworks: ['SOC 2 Processing Integrity', 'SOC 2 Availability', 'ISO/IEC 27001 operational logging'],
    owner: 'Revenue Systems',
    description: 'Managed inference usage, included-token application, invoices, and Stripe meter submissions are append-only and reconcilable.',
    nextAction: 'Reconcile live Stripe test-mode exports against provider invoices before production billing.',
    evidence: async (options) => {
      if (!options.billingLedger) {
        return [{
          id: 'billing-ledger-configured',
          label: 'Billing ledger configuration',
          status: 'partial',
          detail: 'Billing ledger code exists but no ledger is configured for this process.',
          references: ['tests/billing.test.ts', 'tests/billing-jobs.test.ts'],
        }];
      }
      const records = await options.billingLedger.readRecords();
      return [
        {
          id: 'billing-ledger-records',
          label: 'Append-only billing ledger',
          status: persistenceImplemented(options.billingLedgerPersistence) ? 'implemented' : 'partial',
          detail: durableStoreDetail({
            label: 'Billing ledger',
            persistence: options.billingLedgerPersistence,
            durablePurpose: `tracking ${records.length} records`,
            readinessNoun: 'billing reconciliation',
          }),
          references: ['tests/billing.test.ts', 'src/metering/billingLedger.ts'],
        },
        monthlyUsageReservationEvidence(options),
      ];
    },
  },
  {
    id: 'GBX-OPS-001',
    title: 'On-prem deployment readiness',
    frameworks: ['SOC 2 Availability', 'SOC 2 Confidentiality', 'ISO/IEC 27001 operations'],
    owner: 'Enterprise Engineering',
    description: 'On-prem deployments verify offline license, durable stores, rotated secrets, provider egress, and explicit deployment mode.',
    nextAction: 'Run the readiness report in a customer-like Docker environment with signed production license material.',
    evidence: (options) => [
      {
        id: 'offline-license-configured',
        label: 'Offline license configuration',
        status: options.offlineLicenseConfigured ? 'implemented' : 'partial',
        detail: options.offlineLicenseConfigured
          ? 'Offline license material is configured for this process.'
          : 'Offline license health code exists; license material is not configured for this process.',
        references: ['tests/offline-license.test.ts', 'src/enterprise/offlineLicense.ts'],
      },
      {
        id: 'onprem-readiness-route',
        label: 'On-prem readiness route',
        status: options.onPremReadinessConfigured ? 'implemented' : 'partial',
        detail: options.onPremReadinessConfigured
          ? 'On-prem readiness inputs are configured for this process.'
          : 'Readiness endpoint exists; process-level readiness inputs are not fully configured.',
        references: ['tests/onprem-readiness.test.ts', 'OPERATIONS.md'],
      },
    ],
  },
  {
    id: 'GBX-OPS-002',
    title: 'Private network access readiness',
    frameworks: ['SOC 2 Security', 'SOC 2 Confidentiality', 'ISO/IEC 27001 network security'],
    owner: 'Enterprise Engineering',
    description: 'AWS VPC peering and Azure VNet peering evidence is tracked before enterprise private-network commitments.',
    nextAction: 'Complete customer peering IDs, route/security changes, DNS needs, and reachability validation before enabling private endpoints.',
    evidence: (options) => {
      const report = options.privateNetworkReadinessReport ?? buildPrivateNetworkReadinessReport({
        env: options.privateNetworkEnv,
        now: options.now,
      });
      return [{
        id: 'private-network-readiness',
        label: 'Private network readiness register',
        status: report.summary.failed > 0
          ? 'missing'
          : report.summary.profiles > 0 && report.summary.warnings === 0
            ? 'implemented'
            : 'partial',
        detail: `Private-network register has ${report.summary.profiles} profiles, ${report.summary.passed} passing, ${report.summary.warnings} warning, and ${report.summary.failed} failed.`,
        references: ['tests/private-network-readiness.test.ts', 'legal/PRIVATE_NETWORKING.md'],
      }];
    },
  },
  {
    id: 'GBX-AI-001',
    title: 'AI safety and log minimization',
    frameworks: ['SOC 2 Confidentiality', 'SOC 2 Privacy', 'ISO/IEC 27001 secure processing'],
    owner: 'AI Platform',
    description: 'Managed inference applies PII redaction, prompt-injection checks, slop checks, explicit model-training consent, and audit minimization.',
    nextAction: 'Add production Langfuse retention settings and model-provider DPA evidence.',
    evidence: async (options) => {
      const consentEvidence: TrustControlEvidence = options.modelTrainingConsentStore
        ? {
          id: 'model-training-consent-store',
          label: 'Model-training consent ledger',
          status: persistenceImplemented(options.modelTrainingConsentStorePersistence) ? 'implemented' : 'partial',
          detail: durableStoreDetail({
            label: 'Model-training consent store',
            persistence: options.modelTrainingConsentStorePersistence,
            durablePurpose: `tracking ${(await options.modelTrainingConsentStore.list()).length} records`,
            readinessNoun: 'model-training consent',
          }),
          references: ['tests/model-training-consent.test.ts', 'src/enterprise/modelTrainingConsent.ts'],
        }
        : {
          id: 'model-training-consent-store',
          label: 'Model-training consent ledger',
          status: 'partial',
          detail: 'Consent ledger code exists but no durable consent store is configured for this process.',
          references: ['tests/model-training-consent.test.ts', 'src/enterprise/modelTrainingConsent.ts'],
        };
      return [
        {
          id: 'pii-redaction-regression',
          label: 'PII redaction regression suite',
          status: 'implemented',
          detail: 'PII redaction covers 100 mixed cases plus nested inference logs in automated tests.',
          references: ['tests/pii-redactor.test.ts', 'src/safety/piiRedactor.ts'],
        },
        {
          id: 'prompt-safety-regression',
          label: 'Prompt safety regression suite',
          status: 'implemented',
          detail: 'Prompt-injection and slop safety checks are covered by automated tests.',
          references: ['tests/safety.test.ts', 'src/safety/prompt-injection-firewall.ts'],
        },
        consentEvidence,
      ];
    },
  },
];

function persistenceImplemented(persistence: PersistenceKind | undefined): boolean {
  return persistence === 'postgres' || persistence === 'durable-injected';
}

function auditLogDetail(
  verification: Awaited<ReturnType<AuditLog['verify']>>,
  persistence: PersistenceKind | undefined,
): string {
  if (!verification.valid) return `Audit hash chain failed: ${verification.reason ?? 'unknown'}.`;
  const sealDetail = verification.sealKeyId
    ? ` HMAC seal ${verification.sealKeyId} verifies across ${verification.sealChecked ?? 0} entries.`
    : '';
  const base = `Audit hash chain verifies across ${verification.checked} sealed entries.${sealDetail}`;
  if (persistenceImplemented(persistence)) return `${base} Persistence is ${persistence}.`;
  return `${base} Persistence is ${persistence ?? 'unknown'}; configure Postgres or durable-injected storage before claiming production audit readiness.`;
}

function scimStorePersistenceImplemented(persistence: PersistenceKind | undefined): boolean {
  return persistenceImplemented(persistence);
}

function scimStoreDetail(persistence: PersistenceKind | undefined, configured: boolean): string {
  if (scimStorePersistenceImplemented(persistence)) {
    return `SCIM store uses ${persistence} persistence for provisioning and deactivation workflows.`;
  }
  if (!configured || !persistence || persistence === 'memory') {
    return 'SCIM code exists, but this process is using memory persistence; configure Postgres or durable-injected storage before claiming production SCIM readiness.';
  }
  if (persistence === 'file') {
    return 'File-backed SCIM storage is configured for local/on-prem pilots; hosted production still requires Postgres or durable-injected storage evidence.';
  }
  return `${persistence} SCIM storage is configured without durable backing proof; provide durable-injected evidence or switch to Postgres.`;
}

function tenantStoreDetail(persistence: PersistenceKind | undefined): string {
  if (persistenceImplemented(persistence)) {
    return `Tenant organization mappings use ${persistence} persistence for WorkOS tenant isolation.`;
  }
  return `Tenant organization mappings use ${persistence ?? 'unknown'} persistence; configure Postgres or durable-injected storage before claiming production tenant-isolation readiness.`;
}

function durableStoreDetail(options: {
  label: string;
  persistence: PersistenceKind | undefined;
  durablePurpose: string;
  readinessNoun: string;
}): string {
  if (persistenceImplemented(options.persistence)) {
    return `${options.label} uses ${options.persistence} persistence for ${options.durablePurpose}.`;
  }
  return `${options.label} is ${options.durablePurpose}, but persistence is ${options.persistence ?? 'unknown'}; configure Postgres or durable-injected storage before claiming production ${options.readinessNoun} readiness.`;
}

function monthlyUsageReservationEvidence(options: TrustControlOptions): TrustControlEvidence {
  const hasReservationPath = typeof options.billingLedger?.reserveMonthlyUsage === 'function';
  const postgresBacked = options.billingLedgerPersistence === 'postgres';
  if (hasReservationPath && postgresBacked) {
    return {
      id: 'monthly-usage-reservation-control',
      label: 'Monthly included-token reservation control',
      status: 'implemented',
      detail: 'Postgres billing ledger exposes lock-backed monthly usage reservation for included-token classification before appending usage records.',
      references: [
        'tests/billing-ledger-postgres.test.ts',
        'src/metering/billingLedgerPostgres.ts',
        'src/metering/monthlyUsage.ts',
      ],
    };
  }
  return {
    id: 'monthly-usage-reservation-control',
    label: 'Monthly included-token reservation control',
    status: 'partial',
    detail: hasReservationPath
      ? `Monthly usage reservation is exposed, but persistence is ${options.billingLedgerPersistence ?? 'unknown'}; use the Postgres ledger before claiming lock-backed monthly metering enforcement.`
      : `Billing ledger persistence is ${options.billingLedgerPersistence ?? 'unknown'} and does not expose lock-backed monthly usage reservation; included-token classification can be reconciled, but hosted multi-replica reservation enforcement is not configured.`,
    references: [
      'tests/billing-ledger-postgres.test.ts',
      'src/metering/billingLedgerPostgres.ts',
      'src/metering/monthlyUsage.ts',
    ],
  };
}

export async function buildTrustControlReport(options: TrustControlOptions = {}): Promise<TrustControlReport> {
  const controls = await Promise.all(definitions.map(async (definition) => {
    const evidence = await definition.evidence(options);
    const status = aggregateStatus(evidence);
    return {
      id: definition.id,
      title: definition.title,
      frameworks: definition.frameworks,
      owner: definition.owner,
      status,
      description: definition.description,
      evidence,
      ...(status === 'implemented' ? {} : { nextAction: definition.nextAction }),
    } satisfies TrustControl;
  }));
  return {
    generatedAt: (options.now ?? new Date()).toISOString(),
    disclaimer: 'Readiness evidence only. This is not a SOC 2, ISO 27001, legal, or auditor certification.',
    summary: {
      implemented: controls.filter((control) => control.status === 'implemented').length,
      partial: controls.filter((control) => control.status === 'partial').length,
      missing: controls.filter((control) => control.status === 'missing').length,
    },
    controls,
  };
}

function aggregateStatus(evidence: TrustControlEvidence[]): TrustControlStatus {
  if (evidence.some((item) => item.status === 'missing')) return 'missing';
  if (evidence.every((item) => item.status === 'implemented')) return 'implemented';
  return 'partial';
}
