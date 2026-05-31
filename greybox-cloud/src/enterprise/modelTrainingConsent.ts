// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { createHash, randomBytes } from 'node:crypto';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AuthContext } from '../types.js';
import { redactPiiText } from '../safety/piiRedactor.js';

export type ModelTrainingConsentStatus = 'opted-in' | 'opted-out' | 'revoked';
export type ModelTrainingConsentSource = 'settings-checkbox' | 'artifact-rating' | 'privacy-request' | 'admin-import';
export type ModelTrainingAllowedUse = 'greybox-native-training' | 'artifact-quality-finetuning';

export interface ModelTrainingConsentRecord {
  id: string;
  schemaVersion: 1;
  tenantId: string;
  userId: string;
  projectId: string;
  artifactId?: string;
  status: ModelTrainingConsentStatus;
  source: ModelTrainingConsentSource;
  consentTextHash?: string;
  consentText?: string;
  separateCheckboxAccepted: boolean;
  allowedUses: ModelTrainingAllowedUse[];
  dataCategories: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ModelTrainingConsentPublicView {
  id: string;
  tenantId: string;
  userId: string;
  projectId: string;
  artifactId?: string;
  status: ModelTrainingConsentStatus;
  source: ModelTrainingConsentSource;
  separateCheckboxAccepted: boolean;
  allowedUses: ModelTrainingAllowedUse[];
  dataCategories: string[];
  consentTextHash?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ModelTrainingConsentFilter {
  tenantId?: string;
  userId?: string;
  projectId?: string;
  artifactId?: string;
}

export class ModelTrainingConsentError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code);
    this.name = 'ModelTrainingConsentError';
  }
}

export interface ModelTrainingConsentStore {
  create(input: unknown, context: AuthContext, now?: Date): Promise<ModelTrainingConsentRecord>;
  list(filter?: ModelTrainingConsentFilter): Promise<ModelTrainingConsentRecord[]>;
  latest(filter: ModelTrainingConsentFilter): Promise<ModelTrainingConsentRecord | undefined>;
}

const statuses = new Set<ModelTrainingConsentStatus>(['opted-in', 'opted-out', 'revoked']);
const sources = new Set<ModelTrainingConsentSource>([
  'settings-checkbox',
  'artifact-rating',
  'privacy-request',
  'admin-import',
]);
const allowedUses = new Set<ModelTrainingAllowedUse>(['greybox-native-training', 'artifact-quality-finetuning']);

export class FileModelTrainingConsentStore implements ModelTrainingConsentStore {
  constructor(private readonly rootDir: string, private readonly filename = 'model-training-consents.jsonl') {}

  private get filePath(): string {
    return path.join(this.rootDir, this.filename);
  }

  async create(input: unknown, context: AuthContext, now = new Date()): Promise<ModelTrainingConsentRecord> {
    const record = modelTrainingConsentRecordFromInput(input, context, now);
    await this.append(record);
    return record;
  }

  async list(filter: ModelTrainingConsentFilter = {}): Promise<ModelTrainingConsentRecord[]> {
    return this.readRecords()
      .then((records) => records
        .filter((record) => !filter.tenantId || record.tenantId === filter.tenantId)
        .filter((record) => !filter.userId || record.userId === filter.userId)
        .filter((record) => !filter.projectId || record.projectId === filter.projectId)
        .filter((record) => !filter.artifactId || record.artifactId === filter.artifactId)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt)));
  }

  async latest(filter: ModelTrainingConsentFilter): Promise<ModelTrainingConsentRecord | undefined> {
    return (await this.list(filter))[0];
  }

  private async append(record: ModelTrainingConsentRecord): Promise<void> {
    await mkdir(this.rootDir, { recursive: true });
    await appendFile(this.filePath, `${JSON.stringify(record)}\n`, 'utf8');
  }

  private async readRecords(): Promise<ModelTrainingConsentRecord[]> {
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
      .map((line) => JSON.parse(line) as ModelTrainingConsentRecord);
  }
}

interface NormalizedModelTrainingConsentInput {
  projectId: string;
  artifactId?: string;
  status: ModelTrainingConsentStatus;
  source: ModelTrainingConsentSource;
  consentText?: string;
  separateCheckboxAccepted: boolean;
  allowedUses: ModelTrainingAllowedUse[];
  dataCategories: string[];
}

export function normalizeModelTrainingConsentInput(input: unknown): NormalizedModelTrainingConsentInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ModelTrainingConsentError(400, 'bad_model_training_consent');
  }
  const record = input as Record<string, unknown>;
  const status = normalizeStatus(record.status);
  const source = normalizeSource(record.source);
  const separateCheckboxAccepted = record.separateCheckboxAccepted === true;
  const consentText = typeof record.consentText === 'string' ? cleanText(record.consentText, 1_000) : undefined;
  if (status === 'opted-in') {
    if (!separateCheckboxAccepted) {
      throw new ModelTrainingConsentError(400, 'separate_checkbox_required');
    }
    if (!consentText || !/model\s+training|train(?:ing)?\s+greybox|greybox\s+native/iu.test(consentText)) {
      throw new ModelTrainingConsentError(400, 'explicit_model_training_consent_text_required');
    }
  }
  return {
    projectId: cleanToken(record.projectId, 'projectId'),
    ...(typeof record.artifactId === 'string' ? { artifactId: cleanToken(record.artifactId, 'artifactId') } : {}),
    status,
    source,
    ...(consentText ? { consentText } : {}),
    separateCheckboxAccepted,
    allowedUses: normalizeAllowedUses(record.allowedUses, status),
    dataCategories: normalizeDataCategories(record.dataCategories),
  };
}

export function modelTrainingConsentRecordFromInput(
  input: unknown,
  context: AuthContext,
  now = new Date(),
): ModelTrainingConsentRecord {
  const normalized = normalizeModelTrainingConsentInput(input);
  const createdAt = now.toISOString();
  return {
    id: modelTrainingConsentId(now),
    schemaVersion: 1,
    tenantId: context.tenantId,
    userId: context.userId,
    projectId: normalized.projectId,
    ...(normalized.artifactId ? { artifactId: normalized.artifactId } : {}),
    status: normalized.status,
    source: normalized.source,
    ...(normalized.consentText ? {
      consentTextHash: hashConsentText(normalized.consentText),
    } : {}),
    separateCheckboxAccepted: normalized.separateCheckboxAccepted,
    allowedUses: normalized.allowedUses,
    dataCategories: normalized.dataCategories,
    createdAt,
    updatedAt: createdAt,
  };
}

export function publicModelTrainingConsentView(
  record: ModelTrainingConsentRecord,
): ModelTrainingConsentPublicView {
  return {
    id: record.id,
    tenantId: record.tenantId,
    userId: record.userId,
    projectId: record.projectId,
    ...(record.artifactId ? { artifactId: record.artifactId } : {}),
    status: record.status,
    source: record.source,
    separateCheckboxAccepted: record.separateCheckboxAccepted,
    allowedUses: record.allowedUses,
    dataCategories: record.dataCategories,
    ...(record.consentTextHash ? { consentTextHash: record.consentTextHash } : {}),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export function hashConsentText(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function normalizeStatus(value: unknown): ModelTrainingConsentStatus {
  if (typeof value === 'string' && statuses.has(value.toLowerCase() as ModelTrainingConsentStatus)) {
    return value.toLowerCase() as ModelTrainingConsentStatus;
  }
  throw new ModelTrainingConsentError(400, 'bad_model_training_consent_status');
}

function normalizeSource(value: unknown): ModelTrainingConsentSource {
  if (typeof value === 'string' && sources.has(value.toLowerCase() as ModelTrainingConsentSource)) {
    return value.toLowerCase() as ModelTrainingConsentSource;
  }
  return 'settings-checkbox';
}

function normalizeAllowedUses(value: unknown, status: ModelTrainingConsentStatus): ModelTrainingAllowedUse[] {
  if (status !== 'opted-in') return [];
  if (!Array.isArray(value)) return ['greybox-native-training'];
  const normalized = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim().toLowerCase())
    .filter((item): item is ModelTrainingAllowedUse => allowedUses.has(item as ModelTrainingAllowedUse));
  const unique = [...new Set(normalized)].slice(0, 4);
  return unique.length > 0 ? unique : ['greybox-native-training'];
}

function normalizeDataCategories(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => cleanText(item, 80))
    .map((item) => redactPiiText(item))
    .filter(Boolean))].slice(0, 20);
}

function cleanToken(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new ModelTrainingConsentError(400, `${field}_required`);
  const clean = value.trim();
  if (!/^[A-Za-z0-9:._-]{1,160}$/u.test(clean)) {
    throw new ModelTrainingConsentError(400, `${field}_invalid`);
  }
  return clean;
}

function cleanText(value: unknown, maxLength: number): string {
  return String(value).replace(/\s+/gu, ' ').trim().slice(0, maxLength);
}

function modelTrainingConsentId(now = new Date()): string {
  return `mtc_${now.getTime().toString(36)}_${randomBytes(6).toString('base64url')}`;
}
