// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { appendFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

export type SecurityIncidentSeverity = 'sev1' | 'sev2' | 'sev3' | 'sev4';
export type SecurityIncidentStatus =
  | 'triage'
  | 'contained'
  | 'eradicated'
  | 'recovered'
  | 'closed'
  | 'false-positive';
export type SecurityIncidentCategory =
  | 'availability'
  | 'data-breach'
  | 'model-abuse'
  | 'billing-integrity'
  | 'third-party'
  | 'vulnerability'
  | 'other';
export type GdprRiskAssessment = 'not-assessed' | 'unlikely' | 'likely' | 'high';
export type SecurityIncidentTaskStatus = 'open' | 'done' | 'not-applicable';

export interface SecurityIncidentRegulatoryClock {
  jurisdiction: 'gdpr';
  type: 'supervisory-authority-notice';
  basis: 'gdpr-article-33-72-hour';
  dueAt: string;
  status: 'pending' | 'sent' | 'not-required' | 'overdue';
  note: string;
}

export interface SecurityIncidentTask {
  id: string;
  title: string;
  status: SecurityIncidentTaskStatus;
  owner?: string;
  dueAt?: string;
}

export interface SecurityIncidentTimelineEvent {
  at: string;
  actorId: string;
  action: 'created' | 'updated';
  note?: string;
}

export interface SecurityIncidentRecord {
  id: string;
  schemaVersion: 1;
  tenantId: string;
  title: string;
  summary?: string;
  severity: SecurityIncidentSeverity;
  status: SecurityIncidentStatus;
  category: SecurityIncidentCategory;
  detectedAt: string;
  awareAt: string;
  createdAt: string;
  updatedAt: string;
  personalDataBreach: boolean;
  gdprRiskAssessment: GdprRiskAssessment;
  dataSubjectNoticeRequired: boolean;
  affectedTenantIds: string[];
  dataCategories: string[];
  regulatoryClocks: SecurityIncidentRegulatoryClock[];
  containmentTasks: SecurityIncidentTask[];
  timeline: SecurityIncidentTimelineEvent[];
}

export interface SecurityIncidentFilter {
  tenantId?: string;
  status?: SecurityIncidentStatus;
  severity?: SecurityIncidentSeverity;
}

export interface SecurityIncidentUpdate {
  title?: string;
  summary?: string;
  severity?: SecurityIncidentSeverity;
  status?: SecurityIncidentStatus;
  category?: SecurityIncidentCategory;
  personalDataBreach?: boolean;
  gdprRiskAssessment?: GdprRiskAssessment;
  affectedTenantIds?: string[];
  dataCategories?: string[];
  containmentTasks?: SecurityIncidentTask[];
  note?: string;
}

export interface SecurityIncidentStore {
  create(input: unknown, actorId: string, now?: Date): Promise<SecurityIncidentRecord>;
  list(filter?: SecurityIncidentFilter): Promise<SecurityIncidentRecord[]>;
  get(id: string): Promise<SecurityIncidentRecord | undefined>;
  update(id: string, input: unknown, actorId: string, now?: Date): Promise<SecurityIncidentRecord>;
}

export class SecurityIncidentError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code);
    this.name = 'SecurityIncidentError';
  }
}

const severities = new Set<SecurityIncidentSeverity>(['sev1', 'sev2', 'sev3', 'sev4']);
const statuses = new Set<SecurityIncidentStatus>([
  'triage',
  'contained',
  'eradicated',
  'recovered',
  'closed',
  'false-positive',
]);
const categories = new Set<SecurityIncidentCategory>([
  'availability',
  'data-breach',
  'model-abuse',
  'billing-integrity',
  'third-party',
  'vulnerability',
  'other',
]);
const gdprRiskAssessments = new Set<GdprRiskAssessment>(['not-assessed', 'unlikely', 'likely', 'high']);
const taskStatuses = new Set<SecurityIncidentTaskStatus>(['open', 'done', 'not-applicable']);

export class FileSecurityIncidentStore implements SecurityIncidentStore {
  constructor(private readonly rootDir: string, private readonly filename = 'security-incidents.jsonl') {}

  private get filePath(): string {
    return path.join(this.rootDir, this.filename);
  }

  async create(input: unknown, actorId: string, now = new Date()): Promise<SecurityIncidentRecord> {
    const record = securityIncidentRecordFromInput(input, actorId, now);
    await this.append(record);
    return record;
  }

  async list(filter: SecurityIncidentFilter = {}): Promise<SecurityIncidentRecord[]> {
    return this.latestRecords()
      .then((records) => records
        .filter((record) => !filter.tenantId || record.tenantId === filter.tenantId)
        .filter((record) => !filter.status || record.status === filter.status)
        .filter((record) => !filter.severity || record.severity === filter.severity)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt)));
  }

  async get(id: string): Promise<SecurityIncidentRecord | undefined> {
    return (await this.latestRecords()).find((record) => record.id === id);
  }

  async update(
    id: string,
    input: unknown,
    actorId: string,
    now = new Date(),
  ): Promise<SecurityIncidentRecord> {
    const current = await this.get(id);
    if (!current) throw new SecurityIncidentError(404, 'security_incident_not_found');
    const next = securityIncidentRecordWithUpdate(current, input, actorId, now);
    await this.append(next);
    return next;
  }

  private async append(record: SecurityIncidentRecord): Promise<void> {
    await mkdir(this.rootDir, { recursive: true });
    await appendFile(this.filePath, `${JSON.stringify(record)}\n`, 'utf8');
  }

  private async latestRecords(): Promise<SecurityIncidentRecord[]> {
    let text = '';
    try {
      text = await readFile(this.filePath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
    const records = new Map<string, SecurityIncidentRecord>();
    for (const line of text.split('\n')) {
      const clean = line.trim();
      if (!clean) continue;
      const record = JSON.parse(clean) as SecurityIncidentRecord;
      records.set(record.id, record);
    }
    return [...records.values()];
  }
}

export function securityIncidentRecordFromInput(
  input: unknown,
  actorId: string,
  now = new Date(),
): SecurityIncidentRecord {
  const normalized = normalizeIncidentCreateInput(input, now);
  const createdAt = now.toISOString();
  return {
    id: securityIncidentId(now),
    schemaVersion: 1,
    tenantId: normalized.tenantId,
    title: normalized.title,
    ...(normalized.summary ? { summary: normalized.summary } : {}),
    severity: normalized.severity,
    status: normalized.status,
    category: normalized.category,
    detectedAt: normalized.detectedAt,
    awareAt: normalized.awareAt,
    createdAt,
    updatedAt: createdAt,
    personalDataBreach: normalized.personalDataBreach,
    gdprRiskAssessment: normalized.gdprRiskAssessment,
    dataSubjectNoticeRequired: dataSubjectNoticeRequired(
      normalized.personalDataBreach,
      normalized.gdprRiskAssessment,
    ),
    affectedTenantIds: normalized.affectedTenantIds,
    dataCategories: normalized.dataCategories,
    regulatoryClocks: incidentRegulatoryClocks({
      personalDataBreach: normalized.personalDataBreach,
      gdprRiskAssessment: normalized.gdprRiskAssessment,
      awareAt: normalized.awareAt,
      now,
    }),
    containmentTasks: normalized.containmentTasks,
    timeline: [{
      at: createdAt,
      actorId,
      action: 'created',
    }],
  };
}

export function securityIncidentRecordWithUpdate(
  current: SecurityIncidentRecord,
  input: unknown,
  actorId: string,
  now = new Date(),
): SecurityIncidentRecord {
  const normalized = normalizeIncidentUpdateInput(input);
  const nextPersonalDataBreach = normalized.personalDataBreach ?? current.personalDataBreach;
  const nextGdprRiskAssessment = normalized.gdprRiskAssessment ?? current.gdprRiskAssessment;
  const updatedAt = now.toISOString();
  return {
    ...current,
    ...(normalized.title ? { title: normalized.title } : {}),
    ...(normalized.summary !== undefined ? optionalText('summary', normalized.summary) : {}),
    ...(normalized.severity ? { severity: normalized.severity } : {}),
    ...(normalized.status ? { status: normalized.status } : {}),
    ...(normalized.category ? { category: normalized.category } : {}),
    personalDataBreach: nextPersonalDataBreach,
    gdprRiskAssessment: nextGdprRiskAssessment,
    dataSubjectNoticeRequired: dataSubjectNoticeRequired(nextPersonalDataBreach, nextGdprRiskAssessment),
    ...(normalized.affectedTenantIds ? { affectedTenantIds: normalized.affectedTenantIds } : {}),
    ...(normalized.dataCategories ? { dataCategories: normalized.dataCategories } : {}),
    ...(normalized.containmentTasks ? { containmentTasks: normalized.containmentTasks } : {}),
    regulatoryClocks: incidentRegulatoryClocks({
      personalDataBreach: nextPersonalDataBreach,
      gdprRiskAssessment: nextGdprRiskAssessment,
      awareAt: current.awareAt,
      now,
    }),
    updatedAt,
    timeline: [
      ...current.timeline,
      {
        at: updatedAt,
        actorId,
        action: 'updated',
        ...(normalized.note ? { note: normalized.note } : {}),
      },
    ],
  };
}

interface NormalizedIncidentCreateInput extends Required<Pick<
  SecurityIncidentRecord,
  | 'tenantId'
  | 'title'
  | 'severity'
  | 'status'
  | 'category'
  | 'detectedAt'
  | 'awareAt'
  | 'personalDataBreach'
  | 'gdprRiskAssessment'
  | 'affectedTenantIds'
  | 'dataCategories'
  | 'containmentTasks'
>> {
  summary?: string;
}

export function normalizeIncidentCreateInput(input: unknown, now = new Date()): NormalizedIncidentCreateInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new SecurityIncidentError(400, 'bad_security_incident');
  }
  const record = input as Record<string, unknown>;
  const tenantId = cleanToken(record.tenantId, '');
  if (!tenantId) throw new SecurityIncidentError(400, 'tenant_id_required');
  const personalDataBreach = record.personalDataBreach === true;
  const gdprRiskAssessment = normalizeGdprRiskAssessment(
    record.gdprRiskAssessment,
    personalDataBreach ? 'not-assessed' : 'unlikely',
  );
  return {
    tenantId,
    title: requiredText(record.title, 'title_required', 160),
    ...(typeof record.summary === 'string' ? { summary: cleanText(record.summary, 2_000) } : {}),
    severity: normalizeSeverity(record.severity, 'sev3'),
    status: normalizeStatus(record.status, 'triage'),
    category: normalizeCategory(record.category, personalDataBreach ? 'data-breach' : 'other'),
    detectedAt: normalizeDate(record.detectedAt, now, 'detected_at_invalid'),
    awareAt: normalizeDate(record.awareAt, now, 'aware_at_invalid'),
    personalDataBreach,
    gdprRiskAssessment,
    affectedTenantIds: cleanTokenList(record.affectedTenantIds),
    dataCategories: cleanTextList(record.dataCategories, 80),
    containmentTasks: normalizeTasks(record.containmentTasks),
  };
}

export function normalizeIncidentUpdateInput(input: unknown): SecurityIncidentUpdate {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new SecurityIncidentError(400, 'bad_security_incident_update');
  }
  const record = input as Record<string, unknown>;
  return {
    ...(record.title !== undefined ? { title: requiredText(record.title, 'title_required', 160) } : {}),
    ...(record.summary !== undefined ? { summary: cleanText(record.summary, 2_000) } : {}),
    ...(record.severity !== undefined ? { severity: normalizeSeverity(record.severity) } : {}),
    ...(record.status !== undefined ? { status: normalizeStatus(record.status) } : {}),
    ...(record.category !== undefined ? { category: normalizeCategory(record.category) } : {}),
    ...(record.personalDataBreach !== undefined ? { personalDataBreach: record.personalDataBreach === true } : {}),
    ...(record.gdprRiskAssessment !== undefined ? {
      gdprRiskAssessment: normalizeGdprRiskAssessment(record.gdprRiskAssessment),
    } : {}),
    ...(record.affectedTenantIds !== undefined ? { affectedTenantIds: cleanTokenList(record.affectedTenantIds) } : {}),
    ...(record.dataCategories !== undefined ? { dataCategories: cleanTextList(record.dataCategories, 80) } : {}),
    ...(record.containmentTasks !== undefined ? { containmentTasks: normalizeTasks(record.containmentTasks) } : {}),
    ...(typeof record.note === 'string' ? { note: cleanText(record.note, 600) } : {}),
  };
}

export function incidentRegulatoryClocks(options: {
  personalDataBreach: boolean;
  gdprRiskAssessment: GdprRiskAssessment;
  awareAt: string;
  now?: Date;
}): SecurityIncidentRegulatoryClock[] {
  if (!options.personalDataBreach || options.gdprRiskAssessment === 'unlikely') return [];
  const dueAt = addHours(new Date(options.awareAt), 72).toISOString();
  const nowMs = (options.now ?? new Date()).getTime();
  return [{
    jurisdiction: 'gdpr',
    type: 'supervisory-authority-notice',
    basis: 'gdpr-article-33-72-hour',
    dueAt,
    status: nowMs > Date.parse(dueAt) ? 'overdue' : 'pending',
    note: 'Operational timer starts from awareness unless counsel documents the breach is unlikely to risk rights and freedoms.',
  }];
}

function dataSubjectNoticeRequired(personalDataBreach: boolean, gdprRiskAssessment: GdprRiskAssessment): boolean {
  return personalDataBreach && gdprRiskAssessment === 'high';
}

function normalizeSeverity(value: unknown, fallback?: SecurityIncidentSeverity): SecurityIncidentSeverity {
  if (value === undefined && fallback) return fallback;
  if (typeof value === 'string' && severities.has(value.toLowerCase() as SecurityIncidentSeverity)) {
    return value.toLowerCase() as SecurityIncidentSeverity;
  }
  throw new SecurityIncidentError(400, 'bad_incident_severity');
}

function normalizeStatus(value: unknown, fallback?: SecurityIncidentStatus): SecurityIncidentStatus {
  if (value === undefined && fallback) return fallback;
  if (typeof value === 'string' && statuses.has(value.toLowerCase() as SecurityIncidentStatus)) {
    return value.toLowerCase() as SecurityIncidentStatus;
  }
  throw new SecurityIncidentError(400, 'bad_incident_status');
}

function normalizeCategory(value: unknown, fallback?: SecurityIncidentCategory): SecurityIncidentCategory {
  if (value === undefined && fallback) return fallback;
  if (typeof value === 'string' && categories.has(value.toLowerCase() as SecurityIncidentCategory)) {
    return value.toLowerCase() as SecurityIncidentCategory;
  }
  throw new SecurityIncidentError(400, 'bad_incident_category');
}

function normalizeGdprRiskAssessment(value: unknown, fallback?: GdprRiskAssessment): GdprRiskAssessment {
  if (value === undefined && fallback) return fallback;
  if (typeof value === 'string' && gdprRiskAssessments.has(value.toLowerCase() as GdprRiskAssessment)) {
    return value.toLowerCase() as GdprRiskAssessment;
  }
  throw new SecurityIncidentError(400, 'bad_gdpr_risk_assessment');
}

function normalizeDate(value: unknown, fallback: Date, code: string): string {
  if (value === undefined) return fallback.toISOString();
  if (typeof value !== 'string') throw new SecurityIncidentError(400, code);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new SecurityIncidentError(400, code);
  return parsed.toISOString();
}

function normalizeTasks(value: unknown): SecurityIncidentTask[] {
  if (value === undefined) return defaultContainmentTasks();
  if (!Array.isArray(value)) throw new SecurityIncidentError(400, 'bad_incident_tasks');
  return value.slice(0, 20).map((task, index) => {
    if (!task || typeof task !== 'object' || Array.isArray(task)) {
      throw new SecurityIncidentError(400, 'bad_incident_task');
    }
    const record = task as Record<string, unknown>;
    const status = typeof record.status === 'string' && taskStatuses.has(record.status as SecurityIncidentTaskStatus)
      ? record.status as SecurityIncidentTaskStatus
      : 'open';
    return {
      id: cleanToken(record.id, `task-${index + 1}`),
      title: requiredText(record.title, 'incident_task_title_required', 140),
      status,
      ...(typeof record.owner === 'string' ? { owner: cleanText(record.owner, 80) } : {}),
      ...(typeof record.dueAt === 'string' ? { dueAt: normalizeDate(record.dueAt, new Date(), 'incident_task_due_at_invalid') } : {}),
    };
  });
}

function defaultContainmentTasks(): SecurityIncidentTask[] {
  return [
    { id: 'triage-impact', title: 'Triage affected tenants, systems, and data categories', status: 'open' },
    { id: 'contain-access', title: 'Contain unauthorized access or service degradation', status: 'open' },
    { id: 'preserve-evidence', title: 'Preserve logs and audit evidence for post-incident review', status: 'open' },
    { id: 'legal-review', title: 'Complete privacy and customer-notice legal review', status: 'open' },
  ];
}

function requiredText(value: unknown, code: string, maxLength: number): string {
  if (typeof value !== 'string') throw new SecurityIncidentError(400, code);
  const clean = cleanText(value, maxLength);
  if (!clean) throw new SecurityIncidentError(400, code);
  return clean;
}

function optionalText(field: 'summary', value: string): Pick<SecurityIncidentRecord, 'summary'> | Record<string, never> {
  const clean = cleanText(value, 2_000);
  return clean ? { [field]: clean } : {};
}

function cleanText(value: unknown, maxLength: number): string {
  return String(value).replace(/\s+/gu, ' ').trim().slice(0, maxLength);
}

function cleanToken(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const clean = value.trim();
  return /^[A-Za-z0-9:._-]{1,160}$/u.test(clean) ? clean : fallback;
}

function cleanTokenList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => cleanToken(item, '')).filter(Boolean))].slice(0, 100);
}

function cleanTextList(value: unknown, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .filter((item) => typeof item === 'string')
    .map((item) => cleanText(item, maxLength))
    .filter(Boolean))].slice(0, 100);
}

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 3_600_000);
}

function securityIncidentId(now = new Date()): string {
  return `inc_${now.getTime().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
