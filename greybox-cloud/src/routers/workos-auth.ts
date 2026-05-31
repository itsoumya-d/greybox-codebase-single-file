// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { createHash, createPublicKey, createVerify, type JsonWebKey, type KeyObject } from 'node:crypto';

export interface JsonWebKeySet {
  keys: JsonWebKey[];
}

export interface WorkOsClaims {
  sub: string;
  iss?: string;
  aud?: string | string[];
  exp?: number;
  nbf?: number;
  email?: string;
  org_id?: string;
  organization_id?: string;
  roles?: string[];
  role?: string;
  permissions?: string[];
  groups?: unknown[];
  group_names?: unknown[];
  group_ids?: unknown[];
  directory_groups?: unknown[];
  tier?: string;
  [key: string]: unknown;
}

export interface WorkOsJwtVerifierOptions {
  issuer?: string;
  audience?: string;
  jwks?: JsonWebKeySet;
  jwksUrl?: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export class WorkOsAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkOsAuthError';
  }
}

function base64UrlDecode(input: string): Buffer {
  const normalized = input.replace(/-/gu, '+').replace(/_/gu, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return Buffer.from(padded, 'base64');
}

function parseJwt(token: string): { header: Record<string, unknown>; payload: WorkOsClaims; signingInput: string; signature: Buffer } {
  const [headerPart, payloadPart, signaturePart] = token.split('.');
  if (!headerPart || !payloadPart || !signaturePart) throw new WorkOsAuthError('Bearer token must be a JWT');
  const header = JSON.parse(base64UrlDecode(headerPart).toString('utf8')) as Record<string, unknown>;
  const payload = JSON.parse(base64UrlDecode(payloadPart).toString('utf8')) as WorkOsClaims;
  return {
    header,
    payload,
    signingInput: `${headerPart}.${payloadPart}`,
    signature: base64UrlDecode(signaturePart),
  };
}

function audienceMatches(actual: string | string[] | undefined, expected: string): boolean {
  if (typeof actual === 'string') return actual === expected;
  if (Array.isArray(actual)) return actual.includes(expected);
  return false;
}

function jwkThumbprint(jwk: JsonWebKey): string {
  return createHash('sha256').update(JSON.stringify({
    e: jwk.e,
    kty: jwk.kty,
    n: jwk.n,
  })).digest('base64url');
}

export class WorkOsJwtVerifier {
  private jwks: JsonWebKeySet | undefined;

  constructor(private readonly options: WorkOsJwtVerifierOptions) {
    this.jwks = options.jwks;
  }

  async verify(token: string): Promise<WorkOsClaims> {
    const parsed = parseJwt(token);
    if (parsed.header.alg !== 'RS256') throw new WorkOsAuthError('Only RS256 WorkOS JWTs are accepted');
    const key = await this.publicKeyFor(parsed.header);
    const ok = createVerify('RSA-SHA256')
      .update(parsed.signingInput)
      .end()
      .verify(key, parsed.signature);
    if (!ok) throw new WorkOsAuthError('JWT signature verification failed');

    const now = Math.floor((this.options.now?.() ?? Date.now()) / 1_000);
    if (this.options.issuer && parsed.payload.iss !== this.options.issuer) {
      throw new WorkOsAuthError('JWT issuer mismatch');
    }
    if (this.options.audience && !audienceMatches(parsed.payload.aud, this.options.audience)) {
      throw new WorkOsAuthError('JWT audience mismatch');
    }
    if (typeof parsed.payload.exp === 'number' && parsed.payload.exp <= now) {
      throw new WorkOsAuthError('JWT has expired');
    }
    if (typeof parsed.payload.nbf === 'number' && parsed.payload.nbf > now) {
      throw new WorkOsAuthError('JWT is not active yet');
    }
    if (!parsed.payload.sub) throw new WorkOsAuthError('JWT subject is required');
    return parsed.payload;
  }

  private async publicKeyFor(header: Record<string, unknown>): Promise<KeyObject> {
    const jwks = await this.loadJwks();
    const kid = typeof header.kid === 'string' ? header.kid : '';
    const jwk = jwks.keys.find((key) => key.kid === kid) ?? (
      kid ? undefined : jwks.keys[0]
    );
    if (!jwk) throw new WorkOsAuthError('JWT signing key not found');
    return createPublicKey({ key: jwk, format: 'jwk' });
  }

  private async loadJwks(): Promise<JsonWebKeySet> {
    if (this.jwks) return this.jwks;
    if (!this.options.jwksUrl) throw new WorkOsAuthError('WorkOS JWKS is not configured');
    const response = await (this.options.fetchImpl ?? fetch)(this.options.jwksUrl);
    if (!response.ok) throw new WorkOsAuthError(`Unable to fetch WorkOS JWKS: ${response.status}`);
    this.jwks = await response.json() as JsonWebKeySet;
    return this.jwks;
  }
}

export function organizationIdFromClaims(claims: WorkOsClaims): string | undefined {
  return typeof claims.org_id === 'string'
    ? claims.org_id
    : typeof claims.organization_id === 'string'
      ? claims.organization_id
      : undefined;
}

export function rolesFromClaims(claims: WorkOsClaims): string[] {
  const roles = new Set<string>();
  if (Array.isArray(claims.roles)) {
    for (const role of claims.roles) if (typeof role === 'string' && role.trim()) roles.add(role.trim());
  }
  if (typeof claims.role === 'string' && claims.role.trim()) roles.add(claims.role.trim());
  if (Array.isArray(claims.permissions)) {
    for (const permission of claims.permissions) if (typeof permission === 'string' && permission.trim()) roles.add(permission.trim());
  }
  return [...roles];
}

export function groupsFromClaims(claims: WorkOsClaims): string[] {
  const groups = new Set<string>();
  collectGroupValues(groups, claims.groups);
  collectGroupValues(groups, claims.group_names);
  collectGroupValues(groups, claims.group_ids);
  collectGroupValues(groups, claims.directory_groups);
  collectGroupValues(groups, claims['https://greybox.studio/groups']);
  collectGroupValues(groups, claims['https://greybox.ai/groups']);
  return [...groups];
}

function collectGroupValues(groups: Set<string>, value: unknown): void {
  if (!Array.isArray(value)) return;
  for (const entry of value) {
    if (typeof entry === 'string' && entry.trim()) {
      groups.add(entry.trim());
      continue;
    }
    if (entry && typeof entry === 'object') {
      const record = entry as Record<string, unknown>;
      for (const key of ['name', 'slug', 'id'] as const) {
        if (typeof record[key] === 'string' && record[key].trim()) groups.add(record[key].trim());
      }
    }
  }
}

export function workOsKeyFingerprint(jwk: JsonWebKey): string {
  return jwkThumbprint(jwk);
}
