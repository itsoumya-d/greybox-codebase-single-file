// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { DATA_RESIDENCY_REGIONS } from '../routers/tenants.js';
import type { DataResidencyRegion } from '../types.js';

export type EncryptionReadinessStatus = 'pass' | 'warn' | 'fail';
export type KmsProvider =
  | 'aws-kms'
  | 'gcp-kms'
  | 'azure-key-vault'
  | 'hashicorp-vault'
  | 'customer-managed'
  | 'none';

export type EncryptionDataset =
  | 'audit-log'
  | 'billing-ledger'
  | 'scim-store'
  | 'privacy-store'
  | 'incident-store'
  | 'legal-hold-store'
  | 'model-training-consent'
  | 'project-artifacts'
  | 'backups';

export interface RegionKeyEvidence {
  region: DataResidencyRegion;
  keyConfigured: boolean;
  sourceHash?: string;
  lastVerifiedAt?: string;
}

export interface StorageEncryptionEvidence {
  dataset: EncryptionDataset;
  encrypted: boolean;
  regions: DataResidencyRegion[];
  algorithm: string;
  lastVerifiedAt?: string;
}

export interface TransitEncryptionEvidence {
  tlsMinVersion: '1.0' | '1.1' | '1.2' | '1.3' | 'unknown';
  hstsEnabled: boolean;
  lastVerifiedAt?: string;
}

export interface BackupEncryptionEvidence {
  encrypted: boolean;
  regions: DataResidencyRegion[];
  lastVerifiedAt?: string;
}

export interface SecretManagerEvidence {
  manager: string;
  rotationDays?: number;
  lastVerifiedAt?: string;
}

export interface EncryptionEvidence {
  kmsProvider: KmsProvider;
  customerManagedKeys: boolean;
  keyRotationDays?: number;
  regions: RegionKeyEvidence[];
  storage: StorageEncryptionEvidence[];
  transit?: TransitEncryptionEvidence;
  backups?: BackupEncryptionEvidence;
  secrets?: SecretManagerEvidence;
}

export interface EncryptionReadinessCheck {
  id: string;
  label: string;
  status: EncryptionReadinessStatus;
  detail: string;
  remediation?: string;
}

export interface EncryptionReadinessReport {
  generatedAt: string;
  disclaimer: string;
  summary: {
    status: EncryptionReadinessStatus;
    evidenceConfigured: boolean;
    kmsProvider: KmsProvider | 'unconfigured';
    regionsWithKeys: number;
    regionsWithKmsExportProof: number;
    requiredRegions: number;
    kmsExportEvidenceReady: boolean;
    encryptedDatasets: number;
    requiredDatasets: number;
    missingDatasets: EncryptionDataset[];
    tlsReady: boolean;
    backupsEncrypted: boolean;
    secretManagerConfigured: boolean;
  };
  checks: EncryptionReadinessCheck[];
  regions: RegionKeyEvidence[];
  datasets: StorageEncryptionEvidence[];
  evidence?: EncryptionEvidence;
}

export interface EncryptionReadinessOptions {
  env?: Record<string, string | undefined>;
  now?: Date;
}

export const requiredEncryptionDatasets: readonly EncryptionDataset[] = [
  'audit-log',
  'billing-ledger',
  'scim-store',
  'privacy-store',
  'incident-store',
  'legal-hold-store',
  'model-training-consent',
  'project-artifacts',
  'backups',
] as const;

const kmsProviders = new Set<KmsProvider>([
  'aws-kms',
  'gcp-kms',
  'azure-key-vault',
  'hashicorp-vault',
  'customer-managed',
  'none',
]);
const strongAlgorithms = new Set(['aes-256-gcm', 'aes-256', 'aes-256-xts', 'managed-kms', 'envelope-encryption']);
const supportedSecretManagers = new Set([
  'aws-secrets-manager',
  'gcp-secret-manager',
  'azure-key-vault',
  'hashicorp-vault',
  'doppler',
  '1password',
  'customer-managed',
]);

export function buildEncryptionReadinessReport(
  options: EncryptionReadinessOptions = {},
): EncryptionReadinessReport {
  const env = options.env ?? process.env;
  const raw = env.GREYBOX_ENCRYPTION_EVIDENCE_JSON;
  const evidence = encryptionEvidenceFromEnv(env);
  const datasets = datasetEvidence(evidence);
  const checks = [
    evidenceJsonCheck(raw, evidence),
    kmsManagementCheck(evidence),
    regionKeyCoverageCheck(evidence),
    storageEncryptionCheck(datasets),
    transitEncryptionCheck(evidence),
    backupEncryptionCheck(evidence),
    secretManagementCheck(evidence),
  ];
  const status = aggregateStatus(checks);
  const missingDatasets = requiredEncryptionDatasets
    .filter((dataset) => !datasetReady(datasets.find((item) => item.dataset === dataset)));
  return {
    generatedAt: (options.now ?? new Date()).toISOString(),
    disclaimer: 'Encryption readiness is internal enterprise evidence only. Cloud-provider consoles, KMS policies, customer order forms, and auditor-reviewed control evidence remain authoritative.',
    summary: {
      status,
      evidenceConfigured: Boolean(raw?.trim()) && Boolean(evidence),
      kmsProvider: evidence?.kmsProvider ?? 'unconfigured',
      regionsWithKeys: evidence?.regions.filter((region) => region.keyConfigured).length ?? 0,
      regionsWithKmsExportProof: evidence?.regions.filter(regionKeyReady).length ?? 0,
      requiredRegions: DATA_RESIDENCY_REGIONS.length,
      kmsExportEvidenceReady: Boolean(evidence?.regions.every(regionKeyReady)),
      encryptedDatasets: requiredEncryptionDatasets.length - missingDatasets.length,
      requiredDatasets: requiredEncryptionDatasets.length,
      missingDatasets,
      tlsReady: transitReady(evidence?.transit),
      backupsEncrypted: backupsReady(evidence?.backups),
      secretManagerConfigured: secretManagerReady(evidence?.secrets),
    },
    checks,
    regions: evidence?.regions ?? DATA_RESIDENCY_REGIONS.map((region) => ({ region, keyConfigured: false })),
    datasets,
    ...(evidence ? { evidence } : {}),
  };
}

export function encryptionEvidenceFromEnv(
  env: Record<string, string | undefined> = process.env,
): EncryptionEvidence | undefined {
  const raw = env.GREYBOX_ENCRYPTION_EVIDENCE_JSON;
  if (!raw?.trim()) return undefined;
  try {
    const parsed = JSON.parse(raw);
    if (!isRecord(parsed)) return undefined;
    const kmsProvider = normalizeKmsProvider(parsed.kmsProvider);
    return {
      kmsProvider,
      customerManagedKeys: parsed.customerManagedKeys === true,
      ...positiveIntegerField('keyRotationDays', parsed.keyRotationDays),
      regions: regionKeyEvidence(parsed.regions),
      storage: storageEvidence(parsed.storage),
      ...optionalTransitEvidence(parsed.transit),
      ...optionalBackupEvidence(parsed.backups),
      ...optionalSecretManagerEvidence(parsed.secrets),
    };
  } catch {
    return undefined;
  }
}

function evidenceJsonCheck(
  raw: string | undefined,
  evidence: EncryptionEvidence | undefined,
): EncryptionReadinessCheck {
  if (!raw?.trim()) {
    return {
      id: 'encryption-evidence-configured',
      label: 'Encryption evidence configured',
      status: 'fail',
      detail: 'No encryption evidence packet is configured.',
      remediation: 'Set GREYBOX_ENCRYPTION_EVIDENCE_JSON from production KMS, storage, TLS, backup, and secret-manager evidence.',
    };
  }
  if (!evidence) {
    return {
      id: 'encryption-evidence-configured',
      label: 'Encryption evidence configured',
      status: 'fail',
      detail: 'Encryption evidence JSON is present but could not be parsed into a supported evidence packet.',
      remediation: 'Fix GREYBOX_ENCRYPTION_EVIDENCE_JSON syntax and supported enum values.',
    };
  }
  return {
    id: 'encryption-evidence-configured',
    label: 'Encryption evidence configured',
    status: 'pass',
    detail: 'Encryption evidence packet is present and sanitized.',
  };
}

function kmsManagementCheck(evidence: EncryptionEvidence | undefined): EncryptionReadinessCheck {
  if (!evidence || evidence.kmsProvider === 'none') {
    return {
      id: 'kms-key-management',
      label: 'KMS key management',
      status: 'fail',
      detail: 'No supported KMS provider is configured.',
      remediation: 'Configure AWS KMS, GCP KMS, Azure Key Vault, HashiCorp Vault, or a customer-managed KMS.',
    };
  }
  if (!evidence.keyRotationDays || evidence.keyRotationDays > 365) {
    return {
      id: 'kms-key-management',
      label: 'KMS key management',
      status: 'warn',
      detail: `KMS provider is ${evidence.kmsProvider}, but key rotation evidence is missing or slower than annual.`,
      remediation: 'Set keyRotationDays to 365 or lower after production rotation evidence is attached.',
    };
  }
  return {
    id: 'kms-key-management',
    label: 'KMS key management',
    status: 'pass',
    detail: `KMS provider is ${evidence.kmsProvider} with ${evidence.keyRotationDays}-day rotation evidence.`,
  };
}

function regionKeyCoverageCheck(evidence: EncryptionEvidence | undefined): EncryptionReadinessCheck {
  const configured = evidence?.regions.filter((region) => region.keyConfigured).length ?? 0;
  const exportProofs = evidence?.regions.filter(regionKeyReady).length ?? 0;
  if (exportProofs === DATA_RESIDENCY_REGIONS.length) {
    return {
      id: 'regional-kms-coverage',
      label: 'Regional KMS coverage',
      status: 'pass',
      detail: 'Every supported residency region has production KMS export evidence.',
    };
  }
  return {
    id: 'regional-kms-coverage',
    label: 'Regional KMS coverage',
    status: configured === 0 || exportProofs === 0 ? 'fail' : 'warn',
    detail: `${configured}/${DATA_RESIDENCY_REGIONS.length} supported regions have keys; ${exportProofs}/${DATA_RESIDENCY_REGIONS.length} have sanitized KMS export proof.`,
    remediation: 'Attach SHA-256 KMS export evidence for us, eu, and in before making regional encryption claims.',
  };
}

function storageEncryptionCheck(datasets: StorageEncryptionEvidence[]): EncryptionReadinessCheck {
  const missing = requiredEncryptionDatasets
    .filter((dataset) => !datasetReady(datasets.find((item) => item.dataset === dataset)));
  if (missing.length === 0) {
    return {
      id: 'storage-encryption',
      label: 'Storage encryption',
      status: 'pass',
      detail: 'Every required dataset has strong encryption evidence in all supported regions.',
    };
  }
  return {
    id: 'storage-encryption',
    label: 'Storage encryption',
    status: datasets.length === 0 ? 'fail' : 'warn',
    detail: `Missing complete encryption evidence for ${missing.join(', ')}.`,
    remediation: 'Attach encrypted=true, strong algorithm, and us/eu/in region evidence for every required dataset.',
  };
}

function transitEncryptionCheck(evidence: EncryptionEvidence | undefined): EncryptionReadinessCheck {
  const transit = evidence?.transit;
  if (!transit) {
    return {
      id: 'transit-encryption',
      label: 'Transit encryption',
      status: 'fail',
      detail: 'TLS and HSTS evidence is missing.',
      remediation: 'Attach TLS minimum version and HSTS evidence from the production ingress.',
    };
  }
  if (transitReady(transit)) {
    return {
      id: 'transit-encryption',
      label: 'Transit encryption',
      status: 'pass',
      detail: `TLS minimum version is ${transit.tlsMinVersion} and HSTS is enabled.`,
    };
  }
  return {
    id: 'transit-encryption',
    label: 'Transit encryption',
    status: tlsVersionReady(transit.tlsMinVersion) ? 'warn' : 'fail',
    detail: `TLS minimum version is ${transit.tlsMinVersion}; HSTS enabled = ${transit.hstsEnabled}.`,
    remediation: 'Require TLS 1.2 or later and enable HSTS before customer security review.',
  };
}

function backupEncryptionCheck(evidence: EncryptionEvidence | undefined): EncryptionReadinessCheck {
  if (backupsReady(evidence?.backups)) {
    return {
      id: 'backup-encryption',
      label: 'Backup encryption',
      status: 'pass',
      detail: 'Backups are encrypted across all supported regions.',
    };
  }
  return {
    id: 'backup-encryption',
    label: 'Backup encryption',
    status: evidence?.backups?.encrypted === false ? 'fail' : 'warn',
    detail: evidence?.backups
      ? `Backup encryption evidence covers ${evidence.backups.regions.length}/${DATA_RESIDENCY_REGIONS.length} regions.`
      : 'Backup encryption evidence is missing.',
    remediation: 'Attach encrypted backup evidence for us, eu, and in.',
  };
}

function secretManagementCheck(evidence: EncryptionEvidence | undefined): EncryptionReadinessCheck {
  const secrets = evidence?.secrets;
  if (!secrets || !supportedSecretManagers.has(secrets.manager.toLowerCase())) {
    return {
      id: 'secret-management',
      label: 'Secret management',
      status: 'fail',
      detail: 'No supported secret manager evidence is configured.',
      remediation: 'Attach secret-manager and rotation evidence without exposing raw secrets.',
    };
  }
  if (!secrets.rotationDays || secrets.rotationDays > 365) {
    return {
      id: 'secret-management',
      label: 'Secret management',
      status: 'warn',
      detail: `Secret manager is ${secrets.manager}, but rotation evidence is missing or slower than annual.`,
      remediation: 'Set secret rotation evidence to 365 days or lower.',
    };
  }
  return {
    id: 'secret-management',
    label: 'Secret management',
    status: secrets.rotationDays <= 180 ? 'pass' : 'warn',
    detail: `Secret manager is ${secrets.manager} with ${secrets.rotationDays}-day rotation evidence.`,
  };
}

function datasetEvidence(evidence: EncryptionEvidence | undefined): StorageEncryptionEvidence[] {
  return evidence?.storage ?? [];
}

function datasetReady(dataset: StorageEncryptionEvidence | undefined): boolean {
  if (!dataset?.encrypted || !strongAlgorithms.has(dataset.algorithm.toLowerCase())) return false;
  return DATA_RESIDENCY_REGIONS.every((region) => dataset.regions.includes(region));
}

function regionKeyReady(region: RegionKeyEvidence): boolean {
  return region.keyConfigured && Boolean(region.sourceHash);
}

function transitReady(transit: TransitEncryptionEvidence | undefined): boolean {
  return Boolean(transit && tlsVersionReady(transit.tlsMinVersion) && transit.hstsEnabled);
}

function tlsVersionReady(version: TransitEncryptionEvidence['tlsMinVersion']): boolean {
  return version === '1.2' || version === '1.3';
}

function backupsReady(backups: BackupEncryptionEvidence | undefined): boolean {
  return Boolean(
    backups?.encrypted
      && DATA_RESIDENCY_REGIONS.every((region) => backups.regions.includes(region)),
  );
}

function secretManagerReady(secrets: SecretManagerEvidence | undefined): boolean {
  return Boolean(
    secrets
      && supportedSecretManagers.has(secrets.manager.toLowerCase())
      && typeof secrets.rotationDays === 'number'
      && secrets.rotationDays <= 365,
  );
}

function normalizeKmsProvider(value: unknown): KmsProvider {
  const provider = typeof value === 'string' ? value.trim().toLowerCase() : 'none';
  return kmsProviders.has(provider as KmsProvider) ? provider as KmsProvider : 'none';
}

function regionKeyEvidence(value: unknown): RegionKeyEvidence[] {
  const regions = isRecord(value) ? value : {};
  return DATA_RESIDENCY_REGIONS.map((region) => {
    const item = isRecord(regions[region]) ? regions[region] : {};
    return {
      region,
      keyConfigured: item.keyConfigured === true,
      ...sha256Field('sourceHash', item.sourceHash ?? item.evidenceHash),
      ...isoDateField('lastVerifiedAt', item.lastVerifiedAt),
    };
  });
}

function storageEvidence(value: unknown): StorageEncryptionEvidence[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!isRecord(item)) return undefined;
      const dataset = normalizeDataset(item.dataset);
      if (!dataset) return undefined;
      const algorithm = typeof item.algorithm === 'string' ? item.algorithm.trim() : '';
      return {
        dataset,
        encrypted: item.encrypted === true,
        regions: cleanRegions(item.regions),
        algorithm,
        ...isoDateField('lastVerifiedAt', item.lastVerifiedAt),
      } satisfies StorageEncryptionEvidence;
    })
    .filter((item): item is StorageEncryptionEvidence => Boolean(item));
}

function optionalTransitEvidence(value: unknown): Pick<EncryptionEvidence, 'transit'> {
  if (!isRecord(value)) return {};
  const tlsMinVersion = normalizeTlsVersion(value.tlsMinVersion);
  return {
    transit: {
      tlsMinVersion,
      hstsEnabled: value.hstsEnabled === true,
      ...isoDateField('lastVerifiedAt', value.lastVerifiedAt),
    },
  };
}

function optionalBackupEvidence(value: unknown): Pick<EncryptionEvidence, 'backups'> {
  if (!isRecord(value)) return {};
  return {
    backups: {
      encrypted: value.encrypted === true,
      regions: cleanRegions(value.regions),
      ...isoDateField('lastVerifiedAt', value.lastVerifiedAt),
    },
  };
}

function optionalSecretManagerEvidence(value: unknown): Pick<EncryptionEvidence, 'secrets'> {
  if (!isRecord(value)) return {};
  const manager = typeof value.manager === 'string' ? value.manager.trim().toLowerCase() : '';
  return {
    secrets: {
      manager,
      ...positiveIntegerField('rotationDays', value.rotationDays),
      ...isoDateField('lastVerifiedAt', value.lastVerifiedAt),
    },
  };
}

function normalizeDataset(value: unknown): EncryptionDataset | undefined {
  const dataset = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return requiredEncryptionDatasets.includes(dataset as EncryptionDataset)
    ? dataset as EncryptionDataset
    : undefined;
}

function normalizeTlsVersion(value: unknown): TransitEncryptionEvidence['tlsMinVersion'] {
  return value === '1.0' || value === '1.1' || value === '1.2' || value === '1.3'
    ? value
    : 'unknown';
}

function cleanRegions(value: unknown): DataResidencyRegion[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is DataResidencyRegion => (
    DATA_RESIDENCY_REGIONS.includes(item as DataResidencyRegion)
  )))];
}

function positiveIntegerField(key: string, value: unknown): Record<string, number> {
  return Number.isInteger(value) && Number(value) > 0 ? { [key]: Number(value) } : {};
}

function isoDateField(key: string, value: unknown): Record<string, string> {
  if (typeof value !== 'string') return {};
  const time = Date.parse(value);
  return Number.isNaN(time) ? {} : { [key]: new Date(time).toISOString() };
}

function sha256Field(key: string, value: unknown): Record<string, string> {
  if (typeof value !== 'string') return {};
  const normalized = value.trim().toLowerCase();
  return /^[a-f0-9]{64}$/u.test(normalized) ? { [key]: normalized } : {};
}

function aggregateStatus(checks: EncryptionReadinessCheck[]): EncryptionReadinessStatus {
  if (checks.some((check) => check.status === 'fail')) return 'fail';
  if (checks.some((check) => check.status === 'warn')) return 'warn';
  return 'pass';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
