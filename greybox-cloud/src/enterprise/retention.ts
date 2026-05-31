// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { randomBytes } from 'node:crypto';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

export type RetentionDataset =
  | 'project-artifacts'
  | 'scim-users'
  | 'billing-ledger'
  | 'audit-log'
  | 'privacy-requests'
  | 'security-incidents'
  | 'model-training-consents'
  | 'support-records';
export type RetentionBasis =
  | 'customer-instruction'
  | 'tax-accounting'
  | 'security-audit'
  | 'privacy-compliance'
  | 'legal-hold'
  | 'abuse-prevention';
export type RetentionAction = 'delete' | 'anonymize' | 'retain' | 'review';
export type LegalHoldStatus = 'active' | 'released';

export interface RetentionPolicy {
  dataset: RetentionDataset;
  defaultAction: RetentionAction;
  retentionDays: number;
  basis: RetentionBasis;
  description: string;
}

export interface LegalHoldRecord {
  id: string;
  schemaVersion: 1;
  tenantId: string;
  title: string;
  reason: string;
  status: LegalHoldStatus;
  datasets: RetentionDataset[];
  projectIds: string[];
  userIds: string[];
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
  releasedAt?: string;
  timeline: Array<{
    at: string;
    actorId: string;
    status: LegalHoldStatus;
    note?: string;
  }>;
}

export interface RetentionReport {
  tenantId: string;
  generatedAt: string;
  policies: RetentionPolicy[];
  activeLegalHolds: LegalHoldRecord[];
  deletionBlocked: boolean;
  notes: string[];
}

export interface LegalHoldFilter {
  tenantId?: string;
  status?: LegalHoldStatus;
  dataset?: RetentionDataset;
}

export interface LegalHoldUpdate {
  status?: LegalHoldStatus;
  note?: string;
  expiresAt?: string;
}

export interface LegalHoldStore {
  create(input: unknown, actorId: string, now?: Date): Promise<LegalHoldRecord>;
  list(filter?: LegalHoldFilter): Promise<LegalHoldRecord[]>;
  get(id: string): Promise<LegalHoldRecord | undefined>;
  update(id: string, input: unknown, actorId: string, now?: Date): Promise<LegalHoldRecord>;
}

export class RetentionError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code);
    this.name = 'RetentionError';
  }
}

const legalHoldStatuses = new Set<LegalHoldStatus>(['active', 'released']);
const datasets = new Set<RetentionDataset>([
  'project-artifacts',
  'scim-users',
  'billing-ledger',
  'audit-log',
  'privacy-requests',
  'security-incidents',
  'model-training-consents',
  'support-records',
]);

export const defaultRetentionPolicies: RetentionPolicy[] = [
  {
    dataset: 'project-artifacts',
    defaultAction: 'delete',
    retentionDays: 30,
    basis: 'customer-instruction',
    description: 'Delete or return customer project artifacts within 30 days after termination or verified deletion request unless a legal hold applies.',
  },
  {
    dataset: 'scim-users',
    defaultAction: 'anonymize',
    retentionDays: 30,
    basis: 'customer-instruction',
    description: 'Deactivate through the customer identity source of truth, then delete or anonymize local SCIM records after a short operational window.',
  },
  {
    dataset: 'billing-ledger',
    defaultAction: 'retain',
    retentionDays: 2_555,
    basis: 'tax-accounting',
    description: 'Retain invoices, usage ledgers, tax evidence, and dispute metadata for accounting and statutory obligations.',
  },
  {
    dataset: 'audit-log',
    defaultAction: 'retain',
    retentionDays: 730,
    basis: 'security-audit',
    description: 'Retain hash-chained audit logs for security investigations, enterprise audit, and abuse prevention.',
  },
  {
    dataset: 'privacy-requests',
    defaultAction: 'retain',
    retentionDays: 1_095,
    basis: 'privacy-compliance',
    description: 'Retain privacy request evidence, due dates, and response notes for compliance defense.',
  },
  {
    dataset: 'security-incidents',
    defaultAction: 'retain',
    retentionDays: 1_095,
    basis: 'security-audit',
    description: 'Retain incident timelines, containment evidence, and breach-decision notes for security review.',
  },
  {
    dataset: 'model-training-consents',
    defaultAction: 'retain',
    retentionDays: 1_095,
    basis: 'privacy-compliance',
    description: 'Retain consent, opt-out, and revocation evidence for Greybox Native training eligibility audits.',
  },
  {
    dataset: 'support-records',
    defaultAction: 'review',
    retentionDays: 365,
    basis: 'abuse-prevention',
    description: 'Review support records for deletion or anonymization after the support window unless legal, security, or billing exceptions apply.',
  },
];

export class FileLegalHoldStore implements LegalHoldStore {
  constructor(private readonly rootDir: string, private readonly filename = 'legal-holds.jsonl') {}

  private get filePath(): string {
    return path.join(this.rootDir, this.filename);
  }

  async create(input: unknown, actorId: string, now = new Date()): Promise<LegalHoldRecord> {
    const hold = legalHoldRecordFromInput(input, actorId, now);
    await this.append(hold);
    return hold;
  }

  async list(filter: LegalHoldFilter = {}): Promise<LegalHoldRecord[]> {
    return this.latestRecords()
      .then((records) => records
        .filter((record) => !filter.tenantId || record.tenantId === filter.tenantId)
        .filter((record) => !filter.status || record.status === filter.status)
        .filter((record) => !filter.dataset || record.datasets.includes(filter.dataset))
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt)));
  }

  async get(id: string): Promise<LegalHoldRecord | undefined> {
    return (await this.latestRecords()).find((record) => record.id === id);
  }

  async update(id: string, input: unknown, actorId: string, now = new Date()): Promise<LegalHoldRecord> {
    const current = await this.get(id);
    if (!current) throw new RetentionError(404, 'legal_hold_not_found');
    const next = legalHoldRecordWithUpdate(current, input, actorId, now);
    await this.append(next);
    return next;
  }

  private async append(record: LegalHoldRecord): Promise<void> {
    await mkdir(this.rootDir, { recursive: true });
    await appendFile(this.filePath, `${JSON.stringify(record)}\n`, 'utf8');
  }

  private async latestRecords(): Promise<LegalHoldRecord[]> {
    let text = '';
    try {
      text = await readFile(this.filePath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
    const records = new Map<string, LegalHoldRecord>();
    for (const line of text.split('\n')) {
      const clean = line.trim();
      if (!clean) continue;
      const record = JSON.parse(clean) as LegalHoldRecord;
      records.set(record.id, record);
    }
    return [...records.values()];
  }
}

export function legalHoldRecordFromInput(
  input: unknown,
  actorId: string,
  now = new Date(),
): LegalHoldRecord {
  const normalized = normalizeLegalHoldInput(input);
  const createdAt = now.toISOString();
  return {
    id: legalHoldId(now),
    schemaVersion: 1,
    tenantId: normalized.tenantId,
    title: normalized.title,
    reason: normalized.reason,
    status: 'active',
    datasets: normalized.datasets,
    projectIds: normalized.projectIds,
    userIds: normalized.userIds,
    createdAt,
    updatedAt: createdAt,
    ...(normalized.expiresAt ? { expiresAt: normalized.expiresAt } : {}),
    timeline: [{
      at: createdAt,
      actorId,
      status: 'active',
    }],
  };
}

export function legalHoldRecordWithUpdate(
  current: LegalHoldRecord,
  input: unknown,
  actorId: string,
  now = new Date(),
): LegalHoldRecord {
  const update = normalizeLegalHoldUpdate(input);
  const updatedAt = now.toISOString();
  const nextStatus = update.status ?? current.status;
  return {
    ...current,
    status: nextStatus,
    updatedAt,
    ...(update.expiresAt ? { expiresAt: update.expiresAt } : {}),
    ...(nextStatus === 'released' ? { releasedAt: updatedAt } : {}),
    timeline: [
      ...current.timeline,
      {
        at: updatedAt,
        actorId,
        status: nextStatus,
        ...(update.note ? { note: update.note } : {}),
      },
    ],
  };
}

export async function buildRetentionReport(options: {
  tenantId: string;
  legalHoldStore?: LegalHoldStore;
  now?: Date;
}): Promise<RetentionReport> {
  const activeLegalHolds = await activeHolds(options.legalHoldStore, options.tenantId);
  return {
    tenantId: options.tenantId,
    generatedAt: (options.now ?? new Date()).toISOString(),
    policies: defaultRetentionPolicies,
    activeLegalHolds,
    deletionBlocked: activeLegalHolds.length > 0,
    notes: [
      'Project artifacts default to delete/return after 30 days unless a legal, billing, security, or abuse-prevention exception applies.',
      'Billing, audit, incident, privacy, and consent ledgers are retained as documented exceptions and should be minimized in access responses.',
      'Active legal holds block deletion of scoped datasets until released by counsel or security leadership.',
    ],
  };
}

async function activeHolds(store: LegalHoldStore | undefined, tenantId: string): Promise<LegalHoldRecord[]> {
  if (!store) return [];
  return store.list({ tenantId, status: 'active' });
}

function normalizeLegalHoldInput(input: unknown): {
  tenantId: string;
  title: string;
  reason: string;
  datasets: RetentionDataset[];
  projectIds: string[];
  userIds: string[];
  expiresAt?: string;
} {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new RetentionError(400, 'bad_legal_hold');
  }
  const record = input as Record<string, unknown>;
  const tenantId = cleanToken(record.tenantId, 'tenantId');
  const title = cleanText(record.title, 'title', 160);
  const reason = cleanText(record.reason, 'reason', 800);
  const normalizedDatasets = cleanDatasetList(record.datasets);
  return {
    tenantId,
    title,
    reason,
    datasets: normalizedDatasets.length > 0 ? normalizedDatasets : ['project-artifacts'],
    projectIds: cleanTokenList(record.projectIds),
    userIds: cleanTokenList(record.userIds),
    ...(typeof record.expiresAt === 'string' ? { expiresAt: cleanDate(record.expiresAt, 'expiresAt') } : {}),
  };
}

function normalizeLegalHoldUpdate(input: unknown): LegalHoldUpdate {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new RetentionError(400, 'bad_legal_hold_update');
  }
  const record = input as Record<string, unknown>;
  const status = typeof record.status === 'string' && legalHoldStatuses.has(record.status as LegalHoldStatus)
    ? record.status as LegalHoldStatus
    : undefined;
  return {
    ...(status ? { status } : {}),
    ...(typeof record.note === 'string' ? { note: cleanText(record.note, 'note', 600) } : {}),
    ...(typeof record.expiresAt === 'string' ? { expiresAt: cleanDate(record.expiresAt, 'expiresAt') } : {}),
  };
}

function cleanDatasetList(value: unknown): RetentionDataset[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim().toLowerCase())
    .filter((item): item is RetentionDataset => datasets.has(item as RetentionDataset)))];
}

function cleanTokenList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => /^[A-Za-z0-9:._-]{1,160}$/u.test(item)))].slice(0, 100);
}

function cleanToken(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new RetentionError(400, `${field}_required`);
  const clean = value.trim();
  if (!/^[A-Za-z0-9:._-]{1,160}$/u.test(clean)) throw new RetentionError(400, `${field}_invalid`);
  return clean;
}

function cleanText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string') throw new RetentionError(400, `${field}_required`);
  const clean = value.replace(/\s+/gu, ' ').trim().slice(0, maxLength);
  if (!clean) throw new RetentionError(400, `${field}_required`);
  return clean;
}

function cleanDate(value: string, field: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new RetentionError(400, `${field}_invalid`);
  return parsed.toISOString();
}

function legalHoldId(now = new Date()): string {
  return `hold_${now.getTime().toString(36)}_${randomBytes(6).toString('base64url')}`;
}
