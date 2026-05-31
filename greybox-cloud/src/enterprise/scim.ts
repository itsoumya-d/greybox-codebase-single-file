// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { constantTimeEquals } from '../routers/admin-auth.js';
import type { AuditLog } from './auditLog.js';
import { auditId } from './auditLog.js';

const userSchema = 'urn:ietf:params:scim:schemas:core:2.0:User';
const listSchema = 'urn:ietf:params:scim:api:messages:2.0:ListResponse';
const errorSchema = 'urn:ietf:params:scim:api:messages:2.0:Error';

export interface ScimName {
  givenName?: string;
  familyName?: string;
  formatted?: string;
}

export interface ScimEmail {
  value: string;
  type?: string;
  primary?: boolean;
}

export interface ScimUser {
  schemas: [typeof userSchema];
  id: string;
  userName: string;
  externalId?: string;
  name?: ScimName;
  displayName?: string;
  emails?: ScimEmail[];
  active: boolean;
  meta: {
    resourceType: 'User';
    created: string;
    lastModified: string;
    location?: string;
  };
}

interface ScimListResponse<T> {
  schemas: [typeof listSchema];
  totalResults: number;
  startIndex: number;
  itemsPerPage: number;
  Resources: T[];
}

export class ScimError extends Error {
  constructor(readonly status: number, message: string, readonly scimType?: string) {
    super(message);
  }
}

/**
 * Pluggable persister for SCIM users. Mirrors the TenantSnapshotPersister
 * pattern: callers swap implementations to upgrade single-node file storage
 * to multi-node Postgres storage without touching the SCIM handler code.
 */
export interface ScimUserPersister {
  load(): Promise<ScimUser[]>;
  save(users: ScimUser[]): Promise<void>;
}

class FileScimUserPersister implements ScimUserPersister {
  constructor(private readonly rootDir: string, private readonly filename: string) {}

  private get filePath(): string {
    return path.join(this.rootDir, this.filename);
  }

  async load(): Promise<ScimUser[]> {
    try {
      const text = await readFile(this.filePath, 'utf8');
      return JSON.parse(text) as ScimUser[];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
  }

  async save(users: ScimUser[]): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(users, null, 2)}\n`, 'utf8');
    await rename(temporaryPath, this.filePath);
  }
}

export interface ScimUserStoreOptions {
  rootDir?: string;
  filename?: string;
  persister?: ScimUserPersister;
}

export class ScimUserStore {
  private readonly users = new Map<string, ScimUser>();
  private loaded = false;
  private readonly persister: ScimUserPersister | undefined;

  /**
   * Constructable two ways:
   *   - new ScimUserStore(rootDir, filename)         // legacy positional API
   *   - new ScimUserStore({ persister })             // injected adapter
   * The positional API is kept so the existing server.ts boot path keeps
   * working unchanged.
   */
  constructor(rootDirOrOptions?: string | ScimUserStoreOptions, filename = 'scim-users.json') {
    if (typeof rootDirOrOptions === 'object' && rootDirOrOptions !== null) {
      const { persister, rootDir, filename: optFilename } = rootDirOrOptions;
      if (persister) {
        this.persister = persister;
      } else if (rootDir) {
        this.persister = new FileScimUserPersister(rootDir, optFilename ?? 'scim-users.json');
      }
    } else if (rootDirOrOptions) {
      this.persister = new FileScimUserPersister(rootDirOrOptions, filename);
    }
  }

  private async load(options: { refresh?: boolean } = {}): Promise<void> {
    if (this.loaded && options.refresh !== true) return;
    this.loaded = true;
    if (!this.persister) return;
    this.users.clear();
    for (const user of await this.persister.load()) this.users.set(user.id, user);
  }

  private async loadFresh(): Promise<void> {
    await this.load({ refresh: Boolean(this.persister) });
  }

  private async persist(): Promise<void> {
    if (!this.persister) return;
    await this.persister.save([...this.users.values()]);
  }

  async list(filter?: string, startIndex = 1, count = 100): Promise<ScimListResponse<ScimUser>> {
    await this.loadFresh();
    let users = [...this.users.values()];
    const userNameFilter = parseUserNameFilter(filter);
    if (userNameFilter) {
      users = users.filter((user) => user.userName.toLowerCase() === userNameFilter.toLowerCase());
    }
    const start = Math.max(0, startIndex - 1);
    const page = users.slice(start, start + count);
    return {
      schemas: [listSchema],
      totalResults: users.length,
      startIndex,
      itemsPerPage: page.length,
      Resources: page,
    };
  }

  async create(input: unknown, baseUrl: string): Promise<ScimUser> {
    await this.loadFresh();
    const userName = readString(input, 'userName');
    if (!userName) throw new ScimError(400, 'userName is required', 'invalidValue');
    this.ensureUniqueUserName(userName);
    const now = new Date().toISOString();
    const id = `scim_${randomUUID().replaceAll('-', '').slice(0, 20)}`;
    const user: ScimUser = {
      schemas: [userSchema],
      id,
      userName,
      externalId: readString(input, 'externalId'),
      name: readName(input),
      displayName: readString(input, 'displayName'),
      emails: readEmails(input),
      active: readBoolean(input, 'active') ?? true,
      meta: {
        resourceType: 'User',
        created: now,
        lastModified: now,
        location: `${baseUrl}/v1/scim/v2/Users/${id}`,
      },
    };
    this.users.set(user.id, user);
    await this.persist();
    return user;
  }

  async get(id: string): Promise<ScimUser> {
    await this.loadFresh();
    const user = this.users.get(id);
    if (!user) throw new ScimError(404, 'SCIM user not found');
    return user;
  }

  async replace(id: string, input: unknown, baseUrl: string): Promise<ScimUser> {
    const existing = await this.get(id);
    const userName = readString(input, 'userName') ?? existing.userName;
    this.ensureUniqueUserName(userName, id);
    const now = new Date().toISOString();
    const user: ScimUser = {
      schemas: [userSchema],
      id,
      userName,
      externalId: readString(input, 'externalId') ?? existing.externalId,
      name: readName(input) ?? existing.name,
      displayName: readString(input, 'displayName') ?? existing.displayName,
      emails: readEmails(input) ?? existing.emails,
      active: readBoolean(input, 'active') ?? existing.active,
      meta: {
        resourceType: 'User',
        created: existing.meta.created,
        lastModified: now,
        location: `${baseUrl}/v1/scim/v2/Users/${id}`,
      },
    };
    this.users.set(id, user);
    await this.persist();
    return user;
  }

  async patch(id: string, input: unknown): Promise<ScimUser> {
    const existing = await this.get(id);
    const user = structuredClone(existing) as ScimUser;
    const operations = readPatchOperations(input);
    for (const operation of operations) {
      applyPatchOperation(user, operation, (userName) => this.ensureUniqueUserName(userName, id));
    }
    user.meta.lastModified = new Date().toISOString();
    this.users.set(id, user);
    await this.persist();
    return user;
  }

  async deactivate(id: string): Promise<ScimUser> {
    const user = await this.get(id);
    user.active = false;
    user.meta.lastModified = new Date().toISOString();
    this.users.set(id, user);
    await this.persist();
    return user;
  }

  private ensureUniqueUserName(userName: string, exceptId?: string): void {
    const duplicate = [...this.users.values()].find((user) => (
      user.id !== exceptId && user.userName.toLowerCase() === userName.toLowerCase()
    ));
    if (duplicate) throw new ScimError(409, 'userName already exists', 'uniqueness');
  }
}

interface ScimRequest {
  method?: string;
  url: URL;
  headers: Headers;
  body: () => Promise<unknown>;
  baseUrl: string;
  ip?: string;
  userAgent?: string;
}

export interface ScimHandlerOptions {
  store: ScimUserStore;
  token?: string;
  tenantId: string;
  auditLog?: AuditLog;
}

export interface ScimResponse {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
}

export async function handleScimRequest(request: ScimRequest, options: ScimHandlerOptions): Promise<ScimResponse> {
  if (!isScimAuthorized(request.headers, options.token)) {
    return { status: 401, body: scimError('SCIM bearer token required', 401) };
  }

  const relativePath = request.url.pathname.slice('/v1/scim/v2'.length) || '/';
  try {
    if (request.method === 'GET' && relativePath === '/ServiceProviderConfig') {
      return { status: 200, body: serviceProviderConfig() };
    }
    if (request.method === 'GET' && relativePath === '/ResourceTypes') {
      return { status: 200, body: resourceTypes() };
    }
    if (request.method === 'GET' && relativePath === '/Schemas') {
      return { status: 200, body: schemas() };
    }
    if (request.method === 'GET' && relativePath === '/Users') {
      const filter = request.url.searchParams.get('filter') ?? undefined;
      const startIndex = Number(request.url.searchParams.get('startIndex') ?? 1);
      const count = Number(request.url.searchParams.get('count') ?? 100);
      return { status: 200, body: await options.store.list(filter, startIndex, count) };
    }
    if (request.method === 'POST' && relativePath === '/Users') {
      const user = await options.store.create(await request.body(), request.baseUrl);
      await appendScimAudit(options, request, 'scim.user_created', user);
      return { status: 201, body: user, headers: { location: user.meta.location ?? '' } };
    }

    const userMatch = relativePath.match(/^\/Users\/([^/]+)$/u);
    if (userMatch) {
      const id = decodeURIComponent(userMatch[1] ?? '');
      if (request.method === 'GET') {
        return { status: 200, body: await options.store.get(id) };
      }
      if (request.method === 'PUT') {
        const user = await options.store.replace(id, await request.body(), request.baseUrl);
        await appendScimAudit(options, request, 'scim.user_replaced', user);
        return { status: 200, body: user };
      }
      if (request.method === 'PATCH') {
        const user = await options.store.patch(id, await request.body());
        await appendScimAudit(options, request, 'scim.user_patched', user);
        return { status: 200, body: user };
      }
      if (request.method === 'DELETE') {
        const user = await options.store.deactivate(id);
        await appendScimAudit(options, request, 'scim.user_deactivated', user);
        return { status: 204 };
      }
    }
    return { status: 404, body: scimError('SCIM endpoint not found', 404) };
  } catch (error) {
    if (error instanceof ScimError) {
      return { status: error.status, body: scimError(error.message, error.status, error.scimType) };
    }
    throw error;
  }
}

function isScimAuthorized(headers: Headers, token: string | undefined): boolean {
  if (!token) return false;
  const authorization = headers.get('authorization') ?? '';
  const supplied = authorization.match(/^Bearer\s+(.+)$/iu)?.[1]?.trim() || headers.get('x-greybox-scim-token')?.trim() || '';
  return !!supplied && constantTimeEquals(supplied, token);
}

function scimError(detail: string, status: number, scimType?: string) {
  return {
    schemas: [errorSchema],
    status: String(status),
    detail,
    ...(scimType ? { scimType } : {}),
  };
}

function serviceProviderConfig() {
  return {
    schemas: ['urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig'],
    patch: { supported: true },
    bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
    filter: { supported: true, maxResults: 200 },
    changePassword: { supported: false },
    sort: { supported: false },
    etag: { supported: false },
    authenticationSchemes: [{
      type: 'oauthbearertoken',
      name: 'OAuth Bearer Token',
      description: 'Tenant-scoped Greybox SCIM bearer token.',
      primary: true,
    }],
  };
}

function resourceTypes() {
  return {
    schemas: [listSchema],
    totalResults: 1,
    startIndex: 1,
    itemsPerPage: 1,
    Resources: [{
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:ResourceType'],
      id: 'User',
      name: 'User',
      endpoint: '/Users',
      schema: userSchema,
    }],
  };
}

function schemas() {
  return {
    schemas: [listSchema],
    totalResults: 1,
    startIndex: 1,
    itemsPerPage: 1,
    Resources: [{
      id: userSchema,
      name: 'User',
      description: 'Greybox enterprise user account.',
      attributes: [
        { name: 'userName', type: 'string', required: true, uniqueness: 'server' },
        { name: 'active', type: 'boolean', required: false },
        { name: 'emails', type: 'complex', multiValued: true, required: false },
        { name: 'name', type: 'complex', required: false },
      ],
    }],
  };
}

async function appendScimAudit(
  options: ScimHandlerOptions,
  request: ScimRequest,
  action: 'scim.user_created' | 'scim.user_replaced' | 'scim.user_patched' | 'scim.user_deactivated',
  user: ScimUser,
): Promise<void> {
  await options.auditLog?.append({
    id: auditId('audit'),
    tenantId: options.tenantId,
    actorId: 'scim-provisioner',
    actorType: 'scim',
    action,
    targetType: 'user',
    targetId: user.id,
    createdAt: new Date().toISOString(),
    ip: request.ip,
    userAgent: request.userAgent,
    metadata: scimAuditMetadata(user),
  });
}

function scimAuditMetadata(user: ScimUser): Record<string, unknown> {
  return {
    userNameHash: scimSubjectHash(user.userName),
    ...(user.externalId ? { externalIdHash: scimSubjectHash(user.externalId) } : {}),
    emailHashes: (user.emails ?? []).map((email) => scimSubjectHash(email.value)),
    emailCount: user.emails?.length ?? 0,
    active: user.active,
  };
}

function scimSubjectHash(value: string): string {
  return createHash('sha256')
    .update(value.trim().toLowerCase())
    .digest('hex');
}

function parseUserNameFilter(filter: string | undefined): string | undefined {
  if (!filter) return undefined;
  return filter.match(/^userName\s+eq\s+"([^"]+)"$/iu)?.[1];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readString(input: unknown, key: string): string | undefined {
  if (!isRecord(input)) return undefined;
  const value = input[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readBoolean(input: unknown, key: string): boolean | undefined {
  if (!isRecord(input)) return undefined;
  const value = input[key];
  return typeof value === 'boolean' ? value : undefined;
}

function readName(input: unknown): ScimName | undefined {
  if (!isRecord(input) || !isRecord(input.name)) return undefined;
  const name: ScimName = {};
  if (typeof input.name.givenName === 'string') name.givenName = input.name.givenName;
  if (typeof input.name.familyName === 'string') name.familyName = input.name.familyName;
  if (typeof input.name.formatted === 'string') name.formatted = input.name.formatted;
  return Object.keys(name).length ? name : undefined;
}

function readEmails(input: unknown): ScimEmail[] | undefined {
  if (!isRecord(input) || !Array.isArray(input.emails)) return undefined;
  const emails = input.emails
    .filter(isRecord)
    .map((email) => ({
      value: typeof email.value === 'string' ? email.value : '',
      type: typeof email.type === 'string' ? email.type : undefined,
      primary: typeof email.primary === 'boolean' ? email.primary : undefined,
    }))
    .filter((email) => email.value);
  return emails.length ? emails : undefined;
}

interface PatchOperation {
  op: 'add' | 'replace' | 'remove';
  path?: string;
  value?: unknown;
}

function readPatchOperations(input: unknown): PatchOperation[] {
  if (!isRecord(input) || !Array.isArray(input.Operations)) {
    throw new ScimError(400, 'Patch request requires Operations', 'invalidSyntax');
  }
  return input.Operations.map((operation) => {
    if (!isRecord(operation)) throw new ScimError(400, 'Patch operation must be an object', 'invalidSyntax');
    const op = typeof operation.op === 'string' ? operation.op.toLowerCase() : '';
    if (op !== 'add' && op !== 'replace' && op !== 'remove') {
      throw new ScimError(400, 'Unsupported patch op', 'invalidSyntax');
    }
    return {
      op,
      path: typeof operation.path === 'string' ? operation.path : undefined,
      value: operation.value,
    };
  });
}

function applyPatchOperation(user: ScimUser, operation: PatchOperation, ensureUniqueUserName: (userName: string) => void): void {
  if (!operation.path && isRecord(operation.value)) {
    applyReplacementObject(user, operation.value, ensureUniqueUserName);
    return;
  }
  const pathName = operation.path?.toLowerCase();
  if (pathName === 'active') {
    user.active = Boolean(operation.value);
    return;
  }
  if (pathName === 'username') {
    if (typeof operation.value !== 'string' || !operation.value.trim()) {
      throw new ScimError(400, 'userName patch requires a string value', 'invalidValue');
    }
    ensureUniqueUserName(operation.value);
    user.userName = operation.value.trim();
    return;
  }
  if (pathName === 'displayname') {
    user.displayName = typeof operation.value === 'string' ? operation.value : undefined;
    return;
  }
  if (pathName === 'name' && isRecord(operation.value)) {
    user.name = readName({ name: operation.value });
    return;
  }
  if (pathName === 'emails' && Array.isArray(operation.value)) {
    user.emails = readEmails({ emails: operation.value });
    return;
  }
  if (operation.path === undefined && operation.value === undefined && operation.op === 'remove') return;
  throw new ScimError(400, `Unsupported patch path: ${operation.path ?? '<root>'}`, 'invalidPath');
}

function applyReplacementObject(user: ScimUser, value: Record<string, unknown>, ensureUniqueUserName: (userName: string) => void): void {
  if (typeof value.userName === 'string') {
    ensureUniqueUserName(value.userName);
    user.userName = value.userName;
  }
  if (typeof value.active === 'boolean') user.active = value.active;
  const displayName = readString(value, 'displayName');
  if (displayName) user.displayName = displayName;
  const name = readName(value);
  if (name) user.name = name;
  const emails = readEmails(value);
  if (emails) user.emails = emails;
}
