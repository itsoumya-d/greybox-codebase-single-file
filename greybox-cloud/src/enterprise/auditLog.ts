// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { createHash, createHmac } from 'node:crypto';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

export type AuditAction =
  | 'billing.checkout_fulfilled'
  | 'billing.checkout_session_created'
  | 'billing.invoice_job_run'
  | 'billing.marketplace_stripe_event_forwarded'
  | 'billing.marketplace_report_exported'
  | 'data_residency.runtime_checked'
  | 'inference.completed'
  | 'license.validated'
  | 'model_training.consent_recorded'
  | 'pro_module.bundle_download_issued'
  | 'pro_module.secret_issued'
  | 'retention.legal_hold_created'
  | 'retention.legal_hold_updated'
  | 'security.incident_opened'
  | 'security.incident_updated'
  | 'scim.user_created'
  | 'scim.user_replaced'
  | 'scim.user_patched'
  | 'scim.user_deactivated';

export interface AuditLogEntry {
  id: string;
  schemaVersion?: 1;
  sequence?: number;
  tenantId: string;
  actorId: string;
  actorType: 'system' | 'user' | 'admin' | 'scim';
  action: AuditAction;
  targetType: string;
  targetId: string;
  createdAt: string;
  ip?: string;
  userAgent?: string;
  projectId?: string;
  metadata?: Record<string, unknown>;
  previousHash?: string | null;
  hash?: string;
  sealAlgorithm?: 'hmac-sha256';
  sealKeyId?: string;
  sealSignature?: string;
}

export interface AuditLogFilter {
  tenantId?: string;
  action?: AuditAction;
  since?: string;
  until?: string;
}

export interface AuditChainVerification {
  valid: boolean;
  checked: number;
  matching?: number;
  brokenAt?: number;
  reason?:
    | 'hash_mismatch'
    | 'previous_hash_mismatch'
    | 'unsealed_entry_after_sealed_entry'
    | 'missing_seal_signature'
    | 'seal_signature_mismatch';
  expectedHash?: string | null;
  actualHash?: string | null;
  sealChecked?: number;
  sealKeyId?: string;
}

export interface AuditSealOptions {
  keyId: string;
  secret: string;
}

export interface FileAuditLogOptions {
  seal?: AuditSealOptions;
}

/**
 * Wire-shared interface satisfied by both FileAuditLog and PostgresAuditLog.
 * Callers depend on this, not the concrete class, so deployments can swap
 * file-based persistence for Postgres-backed persistence without code changes.
 */
export interface AuditLog {
  append(entry: AuditLogEntry): Promise<void>;
  readEntries(filter?: AuditLogFilter): Promise<AuditLogEntry[]>;
  verify(filter?: AuditLogFilter): Promise<AuditChainVerification>;
}

export class FileAuditLog implements AuditLog {
  private appendQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly rootDir: string,
    private readonly filename = 'audit-log.jsonl',
    private readonly options: FileAuditLogOptions = {},
  ) {}

  private get filePath(): string {
    return path.join(this.rootDir, this.filename);
  }

  async append(entry: AuditLogEntry): Promise<void> {
    const write = this.appendQueue.then(() => this.appendSerial(entry));
    this.appendQueue = write.catch(() => undefined);
    await write;
  }

  private async appendSerial(entry: AuditLogEntry): Promise<void> {
    await mkdir(this.rootDir, { recursive: true });
    await appendFile(this.filePath, `${JSON.stringify(this.sealEntry(entry, await this.readAllEntries()))}\n`, 'utf8');
  }

  async readEntries(filter: AuditLogFilter = {}): Promise<AuditLogEntry[]> {
    return filterAuditEntries(await this.readAllEntries(), filter);
  }

  async verify(filter: AuditLogFilter = {}): Promise<AuditChainVerification> {
    const entries = await this.readAllEntries();
    return {
      ...verifyAuditChain(entries, this.options.seal),
      matching: filterAuditEntries(entries, filter).length,
    };
  }

  private async readAllEntries(): Promise<AuditLogEntry[]> {
    let text = '';
    try {
      text = await readFile(this.filePath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }

    return text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as AuditLogEntry);
  }

  private sealEntry(entry: AuditLogEntry, previousEntries: AuditLogEntry[]): AuditLogEntry {
    const safeEntry = sanitizeAuditLogEntry(entry);
    let previousHash: string | null = null;
    for (let index = previousEntries.length - 1; index >= 0; index -= 1) {
      const candidate = previousEntries[index];
      if (candidate?.hash) {
        previousHash = candidate.hash;
        break;
      }
    }
    const sealed: AuditLogEntry = {
      ...safeEntry,
      schemaVersion: 1,
      sequence: previousEntries.length + 1,
      previousHash,
      hash: undefined,
    };
    const hashed = {
      ...sealed,
      hash: hashAuditEntry(sealed),
    };
    return this.options.seal ? sealAuditEntry(hashed, this.options.seal) : hashed;
  }
}

export function auditSealOptionsFromEnv(env: Record<string, string | undefined> = process.env): AuditSealOptions | undefined {
  const secret = env.GREYBOX_AUDIT_SEAL_KEY?.trim();
  if (!secret) return undefined;
  const keyId = env.GREYBOX_AUDIT_SEAL_KEY_ID?.trim() || 'default';
  if (!/^[A-Za-z0-9._:-]{1,80}$/u.test(keyId)) return undefined;
  return { keyId, secret };
}

const bearerTokenPattern = /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}(?=$|[^A-Za-z0-9._~+/=-])/giu;
const providerSecretPattern = /\b(?:Bearer\s+)?(?:sk|rk)_(?:live|test)_[A-Za-z0-9_]+\b|\bwhsec_[A-Za-z0-9_]+\b|\banthropic_[A-Za-z0-9_]+\b/giu;
const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu;
const ipAddressPattern = /\b(?:\d{1,3}\.){3}\d{1,3}\b/gu;
const cardLikePattern = /\b(?:\d[ -]*?){13,19}\b/gu;
const phonePattern = /\+?\d(?:[\s().-]*\d){7,}/gu;
const absolutePathPattern = /(?:(?:[A-Za-z]:\\|\/Users\/|\/private\/|\/var\/|\/tmp\/)[^\s"']+)/gu;
const sensitiveMetadataKeyPattern = /(?:secret|token|password|credential|licensekey|licensehash|lookupkey|taxprofileid|rawkey|apikey|authorization)/iu;
const phoneMetadataKeyPattern = /(?:phone|mobile|telephone|contactnumber)/iu;

export function sanitizeAuditLogEntry(entry: AuditLogEntry): AuditLogEntry {
  const safe: AuditLogEntry = {
    ...entry,
    actorId: sanitizeAuditScalarString(entry.actorId),
    targetId: sanitizeAuditScalarString(entry.targetId),
    ...(entry.ip ? { ip: sanitizeAuditScalarString(entry.ip) } : {}),
    ...(entry.userAgent ? { userAgent: sanitizeAuditScalarString(entry.userAgent) } : {}),
    ...(entry.projectId ? { projectId: sanitizeAuditScalarString(entry.projectId) } : {}),
    ...(entry.metadata ? { metadata: sanitizeAuditMetadataObject(entry.metadata) } : {}),
  };
  return safe;
}

function sanitizeAuditScalarString<T>(value: T): T {
  return (typeof value === 'string' ? sanitizeAuditString(value) : value) as T;
}

function sanitizeAuditMetadataObject(metadata: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => [key, sanitizeAuditMetadataValue(value, key)]),
  );
}

function sanitizeAuditMetadataValue(value: unknown, key = '', depth = 0): unknown {
  if (depth > 8) return '[redacted-depth-limit]';
  if (typeof value === 'string') {
    if (sensitiveMetadataKeyPattern.test(key)) return '[redacted-reference]';
    return sanitizeAuditString(value, { redactPhone: phoneMetadataKeyPattern.test(key) });
  }
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => sanitizeAuditMetadataValue(item, key, depth + 1));
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([childKey, childValue]) => [
      childKey,
      sanitizeAuditMetadataValue(childValue, childKey, depth + 1),
    ]),
  );
}

function sanitizeAuditString(value: string, options: { redactPhone?: boolean } = {}): string {
  const sanitized = value
    .replace(bearerTokenPattern, '[redacted-secret]')
    .replace(providerSecretPattern, '[redacted-secret]')
    .replace(emailPattern, '[redacted-email]')
    .replace(cardLikePattern, '[redacted-card]')
    .replace(ipAddressPattern, '[redacted-ip]')
    .replace(absolutePathPattern, '[redacted-path]');
  return options.redactPhone ? sanitized.replace(phonePattern, '[redacted-phone]') : sanitized;
}

const csvColumns: Array<keyof AuditLogEntry | 'metadataJson'> = [
  'id',
  'schemaVersion',
  'sequence',
  'createdAt',
  'tenantId',
  'actorType',
  'actorId',
  'action',
  'targetType',
  'targetId',
  'projectId',
  'ip',
  'userAgent',
  'metadataJson',
  'previousHash',
  'hash',
];

function csvCell(value: unknown): string {
  const text = value === undefined || value === null ? '' : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export function exportAuditCsv(entries: AuditLogEntry[]): string {
  const header = csvColumns.join(',');
  const rows = entries.map((entry) => csvColumns.map((column) => {
    if (column === 'metadataJson') return csvCell(entry.metadata ? JSON.stringify(entry.metadata) : '');
    return csvCell(entry[column]);
  }).join(','));
  return `${[header, ...rows].join('\n')}\n`;
}

export function exportAuditSplunkJson(entries: AuditLogEntry[]): string {
  return entries.map((entry) => JSON.stringify({
    time: Math.floor(Date.parse(entry.createdAt) / 1000),
    sourcetype: 'greybox:audit',
    event: entry,
  })).join('\n') + (entries.length ? '\n' : '');
}

export function auditId(prefix: string, now = new Date()): string {
  return `${prefix}_${now.getTime().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function filterAuditEntries(entries: AuditLogEntry[], filter: AuditLogFilter): AuditLogEntry[] {
  const sinceMs = filter.since ? Date.parse(filter.since) : undefined;
  const untilMs = filter.until ? Date.parse(filter.until) : undefined;
  return entries
    .filter((entry) => !filter.tenantId || entry.tenantId === filter.tenantId)
    .filter((entry) => !filter.action || entry.action === filter.action)
    .filter((entry) => sinceMs === undefined || Date.parse(entry.createdAt) >= sinceMs)
    .filter((entry) => untilMs === undefined || Date.parse(entry.createdAt) < untilMs);
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .filter((key) => record[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(',')}}`;
}

export function hashAuditEntry(entry: AuditLogEntry): string {
  const hashable = { ...entry };
  delete hashable.hash;
  delete hashable.sealAlgorithm;
  delete hashable.sealKeyId;
  delete hashable.sealSignature;
  return createHash('sha256').update(stableJson(hashable)).digest('hex');
}

export function signAuditEntry(entry: AuditLogEntry, seal: AuditSealOptions): string {
  if (!entry.hash) throw new Error('cannot seal audit entry before hash is assigned');
  return createHmac('sha256', seal.secret)
    .update(`${entry.sequence ?? ''}.${entry.hash}`)
    .digest('hex');
}

export function sealAuditEntry(entry: AuditLogEntry, seal: AuditSealOptions): AuditLogEntry {
  return {
    ...entry,
    sealAlgorithm: 'hmac-sha256',
    sealKeyId: seal.keyId,
    sealSignature: signAuditEntry(entry, seal),
  };
}

export function verifyAuditChain(
  entries: AuditLogEntry[],
  seal?: AuditSealOptions,
): AuditChainVerification {
  let previousHash: string | null = null;
  let sealedStarted = false;
  let checked = 0;
  let sealChecked = 0;

  for (const [index, entry] of entries.entries()) {
    if (!entry.hash) {
      if (sealedStarted) {
        return {
          valid: false,
          checked,
          brokenAt: index,
          reason: 'unsealed_entry_after_sealed_entry',
          expectedHash: previousHash,
          actualHash: null,
        };
      }
      continue;
    }

    sealedStarted = true;
    const actualPreviousHash = entry.previousHash ?? null;
    if (actualPreviousHash !== previousHash) {
      return {
        valid: false,
        checked,
        brokenAt: index,
        reason: 'previous_hash_mismatch',
        expectedHash: previousHash,
        actualHash: actualPreviousHash,
      };
    }

    const expectedHash = hashAuditEntry(entry);
    if (entry.hash !== expectedHash) {
      return {
        valid: false,
        checked,
        sealChecked,
        ...(seal ? { sealKeyId: seal.keyId } : {}),
        brokenAt: index,
        reason: 'hash_mismatch',
        expectedHash,
        actualHash: entry.hash,
      };
    }

    if (seal) {
      if (entry.sealAlgorithm !== 'hmac-sha256' || entry.sealKeyId !== seal.keyId || !entry.sealSignature) {
        return {
          valid: false,
          checked,
          sealChecked,
          sealKeyId: seal.keyId,
          brokenAt: index,
          reason: 'missing_seal_signature',
          expectedHash: signAuditEntry(entry, seal),
          actualHash: entry.sealSignature ?? null,
        };
      }
      const expectedSignature = signAuditEntry(entry, seal);
      if (entry.sealSignature !== expectedSignature) {
        return {
          valid: false,
          checked,
          sealChecked,
          sealKeyId: seal.keyId,
          brokenAt: index,
          reason: 'seal_signature_mismatch',
          expectedHash: expectedSignature,
          actualHash: entry.sealSignature,
        };
      }
      sealChecked += 1;
    }

    previousHash = entry.hash;
    checked += 1;
  }

  return {
    valid: true,
    checked,
    ...(seal ? { sealChecked, sealKeyId: seal.keyId } : {}),
  };
}
