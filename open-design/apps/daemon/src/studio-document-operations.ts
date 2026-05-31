import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  ProjectStudioDocumentOperation,
  ProjectStudioDocumentOperationRequest,
  ProjectStudioDocumentOperationResult,
  ProjectStudioDocumentOperationType,
} from '@ai-game-design-studio/contracts/api/projects';

type AppliedOperationLog = {
  revision: number;
  applied: Record<string, {
    actorId: string;
    lamport: number;
    path: string;
    type: ProjectStudioDocumentOperationType;
    appliedAt: number;
  }>;
};

export type NormalizedStudioDocumentOperationRequest = ProjectStudioDocumentOperationRequest & {
  operations: ProjectStudioDocumentOperation[];
};

type NormalizeResult =
  | { ok: true; request: NormalizedStudioDocumentOperationRequest }
  | { ok: false; error: string };

export type StudioDocumentOperationApplyResult = {
  content: string;
  log: AppliedOperationLog;
  revision: number;
  appliedOperations: ProjectStudioDocumentOperationResult[];
  skippedOperations: ProjectStudioDocumentOperationResult[];
};

type DraftOperationState = AppliedOperationLog & {
  content: string;
};

export type StudioDocumentDraftOperationApplyResult = {
  content: string;
  state: DraftOperationState;
  revision: number;
  appliedOperations: ProjectStudioDocumentOperationResult[];
  skippedOperations: ProjectStudioDocumentOperationResult[];
};

const MAX_OPERATIONS = 100;
const VALID_OPERATION_TYPES = new Set<ProjectStudioDocumentOperationType>([
  'json-set',
  'json-delete',
  'json-array-append',
  'text-splice',
]);
const MAX_TEXT_SPLICE_INSERT = 20_000;
const MAX_TEXT_SPLICE_DELETE = 20_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cleanString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const clean = value.replace(/\0/g, '').trim();
  return clean ? clean.slice(0, maxLength) : undefined;
}

function cleanNumber(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return undefined;
  return Math.trunc(n);
}

function cleanText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  return value.replace(/\0/g, '').slice(0, maxLength);
}

function cleanPath(value: unknown): Array<string | number> | undefined {
  if (!Array.isArray(value)) return undefined;
  const pathParts: Array<string | number> = [];
  for (const part of value) {
    if (typeof part === 'number' && Number.isInteger(part) && part >= 0) {
      pathParts.push(part);
      continue;
    }
    if (typeof part === 'string') {
      const clean = part.replace(/\0/g, '').trim();
      if (!clean || clean === '__proto__' || clean === 'prototype' || clean === 'constructor') return undefined;
      pathParts.push(clean.slice(0, 120));
      continue;
    }
    return undefined;
  }
  return pathParts.length > 0 ? pathParts : undefined;
}

export function normalizeStudioDocumentOperationRequest(input: unknown): NormalizeResult {
  if (!isRecord(input)) return { ok: false, error: 'request body must be an object' };
  const fileName = cleanString(input.fileName, 240);
  if (!fileName) return { ok: false, error: 'fileName is required' };
  if (!Array.isArray(input.operations)) return { ok: false, error: 'operations must be an array' };
  const operations: ProjectStudioDocumentOperation[] = [];
  for (const raw of input.operations.slice(0, MAX_OPERATIONS)) {
    if (!isRecord(raw)) return { ok: false, error: 'operation must be an object' };
    const id = cleanString(raw.id, 120);
    const actorId = cleanString(raw.actorId, 120);
    const type = cleanString(raw.type, 64) as ProjectStudioDocumentOperationType | undefined;
    const operationPath = cleanPath(raw.path);
    if (!id || !actorId || !type || !VALID_OPERATION_TYPES.has(type) || !operationPath) {
      return { ok: false, error: 'operation requires id, actorId, supported type, and non-empty path' };
    }
    const lamport = cleanNumber(raw.lamport);
    const createdAt = cleanNumber(raw.createdAt);
    operations.push({
      id,
      actorId,
      type,
      path: operationPath,
      ...(Object.prototype.hasOwnProperty.call(raw, 'value') ? { value: raw.value } : {}),
      ...(lamport === undefined ? {} : { lamport }),
      ...(createdAt === undefined ? {} : { createdAt }),
    });
  }
  if (input.operations.length > MAX_OPERATIONS) {
    return { ok: false, error: `operations is limited to ${MAX_OPERATIONS} entries` };
  }
  const baseRevision = cleanNumber(input.baseRevision);
  return {
    ok: true,
    request: {
      fileName,
      ...(baseRevision === undefined ? {} : { baseRevision }),
      operations,
    },
  };
}

function emptyOperationLog(): AppliedOperationLog {
  return { revision: 0, applied: {} };
}

function operationLogFile(projectDir: string, fileName: string): string {
  const encoded = Buffer.from(fileName).toString('base64url');
  return path.join(projectDir, '.agds/studio-document-operations', `${encoded}.json`);
}

function draftStateFile(projectDir: string, fileName: string): string {
  const encoded = Buffer.from(fileName).toString('base64url');
  return path.join(projectDir, '.agds/studio-document-drafts', `${encoded}.json`);
}

export async function readStudioDocumentOperationLog(projectDir: string, fileName: string): Promise<AppliedOperationLog> {
  try {
    const raw = await readFile(operationLogFile(projectDir, fileName), 'utf8');
    const parsed = JSON.parse(raw);
    if (!isRecord(parsed) || !isRecord(parsed.applied)) return emptyOperationLog();
    const revision = Math.max(0, cleanNumber(parsed.revision) ?? 0);
    return { revision, applied: parsed.applied as AppliedOperationLog['applied'] };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyOperationLog();
    throw error;
  }
}

export async function writeStudioDocumentOperationLog(
  projectDir: string,
  fileName: string,
  log: AppliedOperationLog,
): Promise<void> {
  const file = operationLogFile(projectDir, fileName);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(log, null, 2)}\n`, 'utf8');
}

export async function readStudioDocumentDraftState(
  projectDir: string,
  fileName: string,
  fallbackContent: string,
): Promise<DraftOperationState> {
  try {
    const raw = await readFile(draftStateFile(projectDir, fileName), 'utf8');
    const parsed = JSON.parse(raw);
    if (!isRecord(parsed) || typeof parsed.content !== 'string' || !isRecord(parsed.applied)) {
      return { ...emptyOperationLog(), content: fallbackContent };
    }
    return {
      revision: Math.max(0, cleanNumber(parsed.revision) ?? 0),
      applied: parsed.applied as DraftOperationState['applied'],
      content: parsed.content,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { ...emptyOperationLog(), content: fallbackContent };
    }
    throw error;
  }
}

export async function writeStudioDocumentDraftState(
  projectDir: string,
  fileName: string,
  state: DraftOperationState,
): Promise<void> {
  const file = draftStateFile(projectDir, fileName);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

function operationPathLabel(parts: Array<string | number>): string {
  return `/${parts.map((part) => String(part).replaceAll('/', '~1')).join('/')}`;
}

function sortedOperations(operations: ProjectStudioDocumentOperation[]): ProjectStudioDocumentOperation[] {
  return [...operations].sort((a, b) =>
    (a.lamport ?? a.createdAt ?? 0) - (b.lamport ?? b.createdAt ?? 0) ||
    a.actorId.localeCompare(b.actorId) ||
    a.id.localeCompare(b.id),
  );
}

function resultFor(
  operation: ProjectStudioDocumentOperation,
  status: ProjectStudioDocumentOperationResult['status'],
  reason?: string,
): ProjectStudioDocumentOperationResult {
  return {
    id: operation.id,
    actorId: operation.actorId,
    type: operation.type,
    path: operationPathLabel(operation.path),
    status,
    ...(reason ? { reason } : {}),
  };
}

function parentFor(root: unknown, parts: Array<string | number>): { parent: any; key: string | number } | undefined {
  let current: any = root;
  for (const part of parts.slice(0, -1)) {
    if (current === null || typeof current !== 'object') return undefined;
    current = current[part as keyof typeof current];
  }
  const key = parts.at(-1);
  return key === undefined ? undefined : { parent: current, key };
}

function valueIdentity(value: unknown): string | undefined {
  if (isRecord(value)) {
    const id = cleanString(value.id, 160);
    if (id) return `id:${id}`;
  }
  if (typeof value === 'string') return `string:${value}`;
  return undefined;
}

function textSpliceValue(value: unknown): { index: number; deleteCount: number; insertText: string } | undefined {
  if (!isRecord(value)) return undefined;
  const index = cleanNumber(value.index);
  const deleteCount = cleanNumber(value.deleteCount);
  const insertText = cleanText(value.insertText, MAX_TEXT_SPLICE_INSERT);
  if (index === undefined || index < 0) return undefined;
  if (deleteCount === undefined || deleteCount < 0 || deleteCount > MAX_TEXT_SPLICE_DELETE) return undefined;
  if (insertText === undefined) return undefined;
  return { index, deleteCount, insertText };
}

function applyTextSpliceOperation(
  content: string,
  operation: ProjectStudioDocumentOperation,
): { result: ProjectStudioDocumentOperationResult; content?: string; document?: unknown } {
  const value = textSpliceValue(operation.value);
  if (!value) return { result: resultFor(operation, 'conflict', 'text-splice requires index, deleteCount, and insertText') };
  if (value.index > content.length) return { result: resultFor(operation, 'conflict', 'text-splice index is outside the source document') };
  if (value.index + value.deleteCount > content.length) {
    return { result: resultFor(operation, 'conflict', 'text-splice delete range is outside the source document') };
  }
  const nextContent = `${content.slice(0, value.index)}${value.insertText}${content.slice(value.index + value.deleteCount)}`;
  try {
    const document = JSON.parse(nextContent);
    return { result: resultFor(operation, 'applied'), content: nextContent, document };
  } catch (error) {
    return {
      result: resultFor(operation, 'conflict', `text-splice leaves invalid JSON: ${(error as Error).message}`),
    };
  }
}

function applyDraftTextSpliceOperation(
  content: string,
  operation: ProjectStudioDocumentOperation,
): { result: ProjectStudioDocumentOperationResult; content?: string } {
  if (operation.type !== 'text-splice') {
    return { result: resultFor(operation, 'conflict', 'source draft operations only support text-splice') };
  }
  const value = textSpliceValue(operation.value);
  if (!value) return { result: resultFor(operation, 'conflict', 'text-splice requires index, deleteCount, and insertText') };
  if (value.index > content.length) return { result: resultFor(operation, 'conflict', 'text-splice index is outside the source draft') };
  if (value.index + value.deleteCount > content.length) {
    return { result: resultFor(operation, 'conflict', 'text-splice delete range is outside the source draft') };
  }
  return {
    result: resultFor(operation, 'applied'),
    content: `${content.slice(0, value.index)}${value.insertText}${content.slice(value.index + value.deleteCount)}`,
  };
}

function applyOperation(document: unknown, operation: ProjectStudioDocumentOperation): ProjectStudioDocumentOperationResult {
  const target = parentFor(document, operation.path);
  if (!target || target.parent === null || typeof target.parent !== 'object') {
    return resultFor(operation, 'conflict', 'target path parent does not exist');
  }
  if (operation.type === 'json-set') {
    target.parent[target.key] = operation.value;
    return resultFor(operation, 'applied');
  }
  if (operation.type === 'json-delete') {
    if (Array.isArray(target.parent) && typeof target.key === 'number') {
      if (target.key >= target.parent.length) return resultFor(operation, 'conflict', 'array index does not exist');
      target.parent.splice(target.key, 1);
      return resultFor(operation, 'applied');
    }
    if (!Object.prototype.hasOwnProperty.call(target.parent, target.key)) {
      return resultFor(operation, 'conflict', 'property does not exist');
    }
    delete target.parent[target.key];
    return resultFor(operation, 'applied');
  }
  const collection = target.parent[target.key];
  if (!Array.isArray(collection)) {
    return resultFor(operation, 'conflict', 'target is not an array');
  }
  const identity = valueIdentity(operation.value) ?? `operation:${operation.id}`;
  const alreadyPresent = collection.some((item) => valueIdentity(item) === identity);
  if (alreadyPresent) return resultFor(operation, 'duplicate', 'array item identity already exists');
  collection.push(operation.value);
  return resultFor(operation, 'applied');
}

export function applyStudioDocumentOperations(
  rawContent: string,
  request: NormalizedStudioDocumentOperationRequest,
  previousLog: AppliedOperationLog = emptyOperationLog(),
  now = Date.now(),
): StudioDocumentOperationApplyResult {
  let content = rawContent;
  let document = JSON.parse(content);
  const log: AppliedOperationLog = {
    revision: previousLog.revision,
    applied: { ...previousLog.applied },
  };
  const appliedOperations: ProjectStudioDocumentOperationResult[] = [];
  const skippedOperations: ProjectStudioDocumentOperationResult[] = [];

  for (const operation of sortedOperations(request.operations)) {
    if (log.applied[operation.id]) {
      skippedOperations.push(resultFor(operation, 'duplicate', 'operation already applied'));
      continue;
    }
    const textSplice = operation.type === 'text-splice'
      ? applyTextSpliceOperation(content, operation)
      : null;
    const result = textSplice ? textSplice.result : applyOperation(document, operation);
    if (result.status === 'applied') {
      if (textSplice) {
        content = textSplice.content ?? content;
        document = textSplice.document;
      } else {
        content = `${JSON.stringify(document, null, 2)}\n`;
      }
      log.revision += 1;
      log.applied[operation.id] = {
        actorId: operation.actorId,
        lamport: operation.lamport ?? operation.createdAt ?? now,
        path: result.path,
        type: operation.type,
        appliedAt: now,
      };
      appliedOperations.push(result);
    } else {
      skippedOperations.push(result);
    }
  }

  return {
    content,
    log,
    revision: log.revision,
    appliedOperations,
    skippedOperations,
  };
}

export function applyStudioDocumentDraftOperations(
  request: NormalizedStudioDocumentOperationRequest,
  previousState: DraftOperationState,
  now = Date.now(),
): StudioDocumentDraftOperationApplyResult {
  let content = previousState.content;
  const state: DraftOperationState = {
    revision: previousState.revision,
    content,
    applied: { ...previousState.applied },
  };
  const appliedOperations: ProjectStudioDocumentOperationResult[] = [];
  const skippedOperations: ProjectStudioDocumentOperationResult[] = [];

  for (const operation of sortedOperations(request.operations)) {
    if (state.applied[operation.id]) {
      skippedOperations.push(resultFor(operation, 'duplicate', 'draft operation already applied'));
      continue;
    }
    const draftSplice = applyDraftTextSpliceOperation(content, operation);
    const result = draftSplice.result;
    if (result.status === 'applied') {
      content = draftSplice.content ?? content;
      state.content = content;
      state.revision += 1;
      state.applied[operation.id] = {
        actorId: operation.actorId,
        lamport: operation.lamport ?? operation.createdAt ?? now,
        path: result.path,
        type: operation.type,
        appliedAt: now,
      };
      appliedOperations.push(result);
    } else {
      skippedOperations.push(result);
    }
  }

  return {
    content,
    state,
    revision: state.revision,
    appliedOperations,
    skippedOperations,
  };
}
