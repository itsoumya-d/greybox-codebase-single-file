// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

export type PrivacyJurisdiction = 'gdpr' | 'ccpa' | 'coppa' | 'dpdpa' | 'other';
export type PrivacyRequestType =
  | 'access'
  | 'export'
  | 'delete'
  | 'correct'
  | 'opt-out-sale-share'
  | 'model-training-opt-out'
  | 'parental-review'
  | 'parental-delete'
  | 'grievance';
export type PrivacySubjectType = 'adult' | 'child' | 'parent-guardian' | 'authorized-agent';
export type PrivacyRequestStatus =
  | 'received'
  | 'identity-verification'
  | 'in-progress'
  | 'extended'
  | 'fulfilled'
  | 'denied'
  | 'cancelled';

export interface PrivacyDeadline {
  dueAt: string;
  extensionDueAt?: string;
  basis: 'gdpr-article-12' | 'ccpa-45-day' | 'coppa-operational-sla' | 'dpdpa-operational-sla' | 'default-operational-sla';
}

export interface PrivacyRequestTimelineEvent {
  at: string;
  actorId: string;
  status: PrivacyRequestStatus;
  note?: string;
}

export interface PrivacyRequestRecord {
  id: string;
  schemaVersion: 1;
  tenantId: string;
  jurisdiction: PrivacyJurisdiction;
  requestType: PrivacyRequestType;
  subjectType: PrivacySubjectType;
  status: PrivacyRequestStatus;
  contactEmail: string;
  subjectEmail?: string;
  parentEmail?: string;
  country?: string;
  region?: string;
  createdAt: string;
  updatedAt: string;
  dueAt: string;
  extensionDueAt?: string;
  deadlineBasis: PrivacyDeadline['basis'];
  accessTokenHash: string;
  intakeSource: 'public-api' | 'admin-api';
  notes?: string;
  timeline: PrivacyRequestTimelineEvent[];
}

export interface PrivacyRequestCreateResult {
  request: PrivacyRequestRecord;
  accessToken: string;
}

export interface PrivacyRequestPublicView {
  id: string;
  tenantId: string;
  jurisdiction: PrivacyJurisdiction;
  requestType: PrivacyRequestType;
  subjectType: PrivacySubjectType;
  status: PrivacyRequestStatus;
  contactEmail: string;
  subjectEmail?: string;
  createdAt: string;
  updatedAt: string;
  dueAt: string;
  extensionDueAt?: string;
  deadlineBasis: PrivacyDeadline['basis'];
}

export interface PrivacyRequestAdminView extends PrivacyRequestPublicView {
  parentEmail?: string;
  country?: string;
  region?: string;
  notes?: string;
  timeline: PrivacyRequestTimelineEvent[];
}

export interface PrivacyRequestFilter {
  tenantId?: string;
  status?: PrivacyRequestStatus;
  jurisdiction?: PrivacyJurisdiction;
}

export interface PrivacyRequestStatusUpdate {
  status: PrivacyRequestStatus;
  note?: string;
}

export class PrivacyRequestError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code);
    this.name = 'PrivacyRequestError';
  }
}

export interface PrivacyRequestStore {
  create(input: unknown, now?: Date): Promise<PrivacyRequestCreateResult>;
  list(filter?: PrivacyRequestFilter): Promise<PrivacyRequestRecord[]>;
  get(id: string): Promise<PrivacyRequestRecord | undefined>;
  updateStatus(
    id: string,
    update: PrivacyRequestStatusUpdate,
    actorId: string,
    now?: Date,
  ): Promise<PrivacyRequestRecord>;
}

const jurisdictions = new Set<PrivacyJurisdiction>(['gdpr', 'ccpa', 'coppa', 'dpdpa', 'other']);
const requestTypes = new Set<PrivacyRequestType>([
  'access',
  'export',
  'delete',
  'correct',
  'opt-out-sale-share',
  'model-training-opt-out',
  'parental-review',
  'parental-delete',
  'grievance',
]);
const subjectTypes = new Set<PrivacySubjectType>(['adult', 'child', 'parent-guardian', 'authorized-agent']);
const statuses = new Set<PrivacyRequestStatus>([
  'received',
  'identity-verification',
  'in-progress',
  'extended',
  'fulfilled',
  'denied',
  'cancelled',
]);

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

export class FilePrivacyRequestStore implements PrivacyRequestStore {
  constructor(private readonly rootDir: string, private readonly filename = 'privacy-requests.jsonl') {}

  private get filePath(): string {
    return path.join(this.rootDir, this.filename);
  }

  async create(input: unknown, now = new Date()): Promise<PrivacyRequestCreateResult> {
    const result = privacyRequestCreateResultFromInput(input, now);
    await this.append(result.request);
    return result;
  }

  async list(filter: PrivacyRequestFilter = {}): Promise<PrivacyRequestRecord[]> {
    return this.latestRecords()
      .then((records) => records
        .filter((record) => !filter.tenantId || record.tenantId === filter.tenantId)
        .filter((record) => !filter.status || record.status === filter.status)
        .filter((record) => !filter.jurisdiction || record.jurisdiction === filter.jurisdiction)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt)));
  }

  async get(id: string): Promise<PrivacyRequestRecord | undefined> {
    return (await this.latestRecords()).find((record) => record.id === id);
  }

  async updateStatus(
    id: string,
    update: PrivacyRequestStatusUpdate,
    actorId: string,
    now = new Date(),
  ): Promise<PrivacyRequestRecord> {
    const current = await this.get(id);
    if (!current) throw new PrivacyRequestError(404, 'privacy_request_not_found');
    const next = privacyRequestRecordWithStatusUpdate(current, update, actorId, now);
    await this.append(next);
    return next;
  }

  private async append(record: PrivacyRequestRecord): Promise<void> {
    await mkdir(this.rootDir, { recursive: true });
    await appendFile(this.filePath, `${JSON.stringify(record)}\n`, 'utf8');
  }

  private async latestRecords(): Promise<PrivacyRequestRecord[]> {
    let text = '';
    try {
      text = await readFile(this.filePath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
    const records = new Map<string, PrivacyRequestRecord>();
    for (const line of text.split('\n')) {
      const clean = line.trim();
      if (!clean) continue;
      const record = JSON.parse(clean) as PrivacyRequestRecord;
      records.set(record.id, record);
    }
    return [...records.values()];
  }
}

interface NormalizedPrivacyRequestInput {
  tenantId: string;
  jurisdiction: PrivacyJurisdiction;
  requestType: PrivacyRequestType;
  subjectType: PrivacySubjectType;
  contactEmail: string;
  subjectEmail?: string;
  parentEmail?: string;
  country?: string;
  region?: string;
  notes?: string;
}

export function normalizePrivacyRequestInput(input: unknown): NormalizedPrivacyRequestInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new PrivacyRequestError(400, 'bad_privacy_request');
  }
  const record = input as Record<string, unknown>;
  const tenantId = cleanToken(record.tenantId, 'public');
  const jurisdiction = normalizeJurisdiction(record.jurisdiction, record.country, record.region);
  const requestType = normalizeRequestType(record.requestType);
  const subjectType = normalizeSubjectType(record.subjectType, requestType);
  const contactEmail = normalizeEmail(record.contactEmail, 'contactEmail');
  const subjectEmail = record.subjectEmail === undefined ? undefined : normalizeEmail(record.subjectEmail, 'subjectEmail');
  const parentEmail = record.parentEmail === undefined ? undefined : normalizeEmail(record.parentEmail, 'parentEmail');
  if ((requestType === 'parental-review' || requestType === 'parental-delete' || subjectType === 'child') && !parentEmail) {
    throw new PrivacyRequestError(400, 'parent_email_required');
  }
  return {
    tenantId,
    jurisdiction,
    requestType,
    subjectType,
    contactEmail,
    ...(subjectEmail ? { subjectEmail } : {}),
    ...(parentEmail ? { parentEmail } : {}),
    ...(typeof record.country === 'string' ? { country: cleanText(record.country, 80) } : {}),
    ...(typeof record.region === 'string' ? { region: cleanText(record.region, 80) } : {}),
    ...(typeof record.notes === 'string' ? { notes: cleanText(record.notes, 2_000) } : {}),
  };
}

export function privacyRequestCreateResultFromInput(input: unknown, now = new Date()): PrivacyRequestCreateResult {
  const normalized = normalizePrivacyRequestInput(input);
  const accessToken = randomBytes(24).toString('base64url');
  const createdAt = now.toISOString();
  const deadline = privacyDeadline(normalized.jurisdiction, now);
  return {
    accessToken,
    request: {
      id: privacyRequestId(now),
      schemaVersion: 1,
      tenantId: normalized.tenantId,
      jurisdiction: normalized.jurisdiction,
      requestType: normalized.requestType,
      subjectType: normalized.subjectType,
      status: 'received',
      contactEmail: normalized.contactEmail,
      ...(normalized.subjectEmail ? { subjectEmail: normalized.subjectEmail } : {}),
      ...(normalized.parentEmail ? { parentEmail: normalized.parentEmail } : {}),
      ...(normalized.country ? { country: normalized.country } : {}),
      ...(normalized.region ? { region: normalized.region } : {}),
      createdAt,
      updatedAt: createdAt,
      dueAt: deadline.dueAt,
      ...(deadline.extensionDueAt ? { extensionDueAt: deadline.extensionDueAt } : {}),
      deadlineBasis: deadline.basis,
      accessTokenHash: hashPrivacyAccessToken(accessToken),
      intakeSource: 'public-api',
      ...(normalized.notes ? { notes: normalized.notes } : {}),
      timeline: [{
        at: createdAt,
        actorId: 'requester',
        status: 'received',
      }],
    },
  };
}

export function normalizePrivacyStatusUpdate(input: unknown): PrivacyRequestStatusUpdate {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new PrivacyRequestError(400, 'bad_privacy_status_update');
  }
  const record = input as Record<string, unknown>;
  const status = typeof record.status === 'string' && statuses.has(record.status as PrivacyRequestStatus)
    ? record.status as PrivacyRequestStatus
    : undefined;
  if (!status) throw new PrivacyRequestError(400, 'bad_privacy_request_status');
  return {
    status,
    ...(typeof record.note === 'string' ? { note: cleanText(record.note, 600) } : {}),
  };
}

export function privacyRequestRecordWithStatusUpdate(
  current: PrivacyRequestRecord,
  update: PrivacyRequestStatusUpdate,
  actorId: string,
  now = new Date(),
): PrivacyRequestRecord {
  if (!statuses.has(update.status)) throw new PrivacyRequestError(400, 'bad_privacy_request_status');
  const updatedAt = now.toISOString();
  return {
    ...current,
    status: update.status,
    updatedAt,
    timeline: [
      ...current.timeline,
      {
        at: updatedAt,
        actorId,
        status: update.status,
        ...(update.note ? { note: cleanText(update.note, 600) } : {}),
      },
    ],
  };
}

export function privacyDeadline(jurisdiction: PrivacyJurisdiction, now = new Date()): PrivacyDeadline {
  switch (jurisdiction) {
    case 'gdpr':
      return {
        dueAt: addCalendarMonths(now, 1).toISOString(),
        extensionDueAt: addCalendarMonths(now, 3).toISOString(),
        basis: 'gdpr-article-12',
      };
    case 'ccpa':
      return {
        dueAt: addDays(now, 45).toISOString(),
        extensionDueAt: addDays(now, 90).toISOString(),
        basis: 'ccpa-45-day',
      };
    case 'coppa':
      return {
        dueAt: addDays(now, 30).toISOString(),
        basis: 'coppa-operational-sla',
      };
    case 'dpdpa':
      return {
        dueAt: addDays(now, 30).toISOString(),
        basis: 'dpdpa-operational-sla',
      };
    case 'other':
      return {
        dueAt: addDays(now, 30).toISOString(),
        basis: 'default-operational-sla',
      };
  }
}

export function publicPrivacyRequestView(record: PrivacyRequestRecord): PrivacyRequestPublicView {
  return {
    id: record.id,
    tenantId: record.tenantId,
    jurisdiction: record.jurisdiction,
    requestType: record.requestType,
    subjectType: record.subjectType,
    status: record.status,
    contactEmail: maskEmail(record.contactEmail),
    ...(record.subjectEmail ? { subjectEmail: maskEmail(record.subjectEmail) } : {}),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    dueAt: record.dueAt,
    ...(record.extensionDueAt ? { extensionDueAt: record.extensionDueAt } : {}),
    deadlineBasis: record.deadlineBasis,
  };
}

export function adminPrivacyRequestView(record: PrivacyRequestRecord): PrivacyRequestAdminView {
  return {
    ...publicPrivacyRequestView(record),
    contactEmail: record.contactEmail,
    ...(record.subjectEmail ? { subjectEmail: record.subjectEmail } : {}),
    ...(record.parentEmail ? { parentEmail: record.parentEmail } : {}),
    ...(record.country ? { country: record.country } : {}),
    ...(record.region ? { region: record.region } : {}),
    ...(record.notes ? { notes: record.notes } : {}),
    timeline: record.timeline,
  };
}

export function hashPrivacyAccessToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function privacyRequestAuthorized(record: PrivacyRequestRecord, accessToken: string): boolean {
  const supplied = Buffer.from(hashPrivacyAccessToken(accessToken));
  const expected = Buffer.from(record.accessTokenHash);
  if (supplied.length !== expected.length) return false;
  return timingSafeEqual(supplied, expected);
}

function privacyRequestId(now = new Date()): string {
  return `prv_${now.getTime().toString(36)}_${randomBytes(6).toString('base64url')}`;
}

function normalizeJurisdiction(jurisdiction: unknown, country: unknown, region: unknown): PrivacyJurisdiction {
  if (typeof jurisdiction === 'string' && jurisdictions.has(jurisdiction.toLowerCase() as PrivacyJurisdiction)) {
    return jurisdiction.toLowerCase() as PrivacyJurisdiction;
  }
  const countryText = typeof country === 'string' ? country.toLowerCase() : '';
  const regionText = typeof region === 'string' ? region.toLowerCase() : '';
  if (['california', 'ca'].includes(regionText) || ['us-ca', 'california'].includes(countryText)) return 'ccpa';
  if (['india', 'in'].includes(countryText)) return 'dpdpa';
  if (['eu', 'eea', 'european-union'].includes(regionText) || ['fr', 'de', 'es', 'it', 'nl', 'ie', 'se', 'pl'].includes(countryText)) return 'gdpr';
  return 'other';
}

function normalizeRequestType(value: unknown): PrivacyRequestType {
  if (typeof value !== 'string') throw new PrivacyRequestError(400, 'bad_privacy_request_type');
  const clean = value.trim().toLowerCase();
  if (!requestTypes.has(clean as PrivacyRequestType)) {
    throw new PrivacyRequestError(400, 'bad_privacy_request_type');
  }
  return clean as PrivacyRequestType;
}

function normalizeSubjectType(value: unknown, requestType: PrivacyRequestType): PrivacySubjectType {
  if (requestType === 'parental-review' || requestType === 'parental-delete') return 'parent-guardian';
  if (value === undefined) return 'adult';
  if (typeof value !== 'string') throw new PrivacyRequestError(400, 'bad_privacy_subject_type');
  const clean = value.trim().toLowerCase();
  if (!subjectTypes.has(clean as PrivacySubjectType)) {
    throw new PrivacyRequestError(400, 'bad_privacy_subject_type');
  }
  return clean as PrivacySubjectType;
}

function normalizeEmail(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new PrivacyRequestError(400, `${field}_required`);
  const clean = value.trim().toLowerCase();
  if (!emailPattern.test(clean) || clean.length > 320) throw new PrivacyRequestError(400, `${field}_invalid`);
  return clean;
}

function cleanText(value: unknown, maxLength: number): string {
  return String(value).replace(/\s+/gu, ' ').trim().slice(0, maxLength);
}

function cleanToken(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const clean = value.trim();
  return /^[A-Za-z0-9:._-]{1,120}$/u.test(clean) ? clean : fallback;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

function addCalendarMonths(date: Date, months: number): Date {
  const next = new Date(date.getTime());
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  const visibleLocal = local.length <= 2 ? `${local[0] ?? ''}*` : `${local.slice(0, 2)}***`;
  const [domainName = '', ...domainRest] = domain.split('.');
  const visibleDomain = domainName ? `${domainName[0]}***` : '***';
  return `${visibleLocal}@${[visibleDomain, ...domainRest].filter(Boolean).join('.')}`;
}
