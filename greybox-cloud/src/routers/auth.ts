// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { createHash } from 'node:crypto';
import type { AuthContext, DataResidencyRegion, PlanTier } from '../types.js';
import {
  defaultDataResidencyRegion,
  normalizeDataResidencyRegion,
  type TenantStore,
} from './tenants.js';
import {
  groupsFromClaims,
  organizationIdFromClaims,
  rolesFromClaims,
  WorkOsAuthError,
  WorkOsJwtVerifier,
  type WorkOsClaims,
} from './workos-auth.js';

const tiers = new Set<PlanTier>(['free', 'indie', 'studio', 'enterprise']);

export class AuthenticationError extends Error {
  readonly status = 401;

  constructor(message: string) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export interface AuthenticateOptions {
  workosVerifier?: Pick<WorkOsJwtVerifier, 'verify'>;
  tenantStore?: TenantStore;
  workosGroupRoleMap?: WorkOsGroupRoleMap;
  requireVerifiedWorkOs?: boolean;
}

export interface WorkOsGroupAccess {
  roles?: string[];
  scopes?: string[];
}

export type WorkOsGroupRoleMap = Record<string, WorkOsGroupAccess | string[]>;

function headerValue(headers: Headers, key: string): string | undefined {
  return headers.get(key) ?? undefined;
}

function bearerToken(headers: Headers): string {
  const authorization = headerValue(headers, 'authorization') ?? '';
  return authorization.match(/^Bearer\s+(.+)$/iu)?.[1]?.trim() ?? '';
}

function isJwt(token: string): boolean {
  return token.split('.').length === 3;
}

function tierFrom(value: unknown, fallback: PlanTier): PlanTier {
  return tiers.has(value as PlanTier) ? value as PlanTier : fallback;
}

function regionFromHeaders(headers: Headers): DataResidencyRegion {
  return normalizeDataResidencyRegion(
    headerValue(headers, 'x-greybox-region')
      ?? headerValue(headers, 'x-greybox-data-region')
      ?? headerValue(headers, 'x-greybox-data-residency'),
    defaultDataResidencyRegion(),
  );
}

export function dataResidencyRegionFromClaims(claims: WorkOsClaims): DataResidencyRegion {
  return normalizeDataResidencyRegion(
    claims.data_region
      ?? claims.dataResidencyRegion
      ?? claims.region
      ?? claims['https://greybox.studio/data-region']
      ?? claims['https://greybox.studio/data_residency']
      ?? claims['https://greybox.ai/data-region'],
    defaultDataResidencyRegion(),
  );
}

function normalizeGroupName(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_]+/gu, '-');
}

const defaultWorkOsGroupRoleMap: WorkOsGroupRoleMap = {
  'greybox-admins': {
    roles: ['admin'],
    scopes: ['audit:read', 'billing:read', 'billing:write', 'inference:write', 'scim:write'],
  },
  'greybox-billing-admins': {
    roles: ['billing-admin'],
    scopes: ['billing:read', 'billing:write'],
  },
  'greybox-designers': {
    roles: ['designer'],
    scopes: ['inference:write'],
  },
  'greybox-viewers': {
    roles: ['viewer'],
    scopes: ['project:read', 'inference:read'],
  },
};

export function parseWorkOsGroupRoleMap(value: string | undefined): WorkOsGroupRoleMap | undefined {
  if (!value?.trim()) return undefined;
  const parsed = JSON.parse(value) as WorkOsGroupRoleMap;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('GREYBOX_WORKOS_GROUP_ROLE_MAP must be a JSON object');
  }
  return parsed;
}

function groupAccessMap(overrides?: WorkOsGroupRoleMap): Map<string, WorkOsGroupAccess> {
  const map = new Map<string, WorkOsGroupAccess>();
  for (const [group, access] of Object.entries(defaultWorkOsGroupRoleMap)) {
    map.set(normalizeGroupName(group), Array.isArray(access) ? { roles: access } : access);
  }
  for (const [group, access] of Object.entries(overrides ?? {})) {
    const normalized = normalizeGroupName(group);
    const normalizedAccess = Array.isArray(access) ? { roles: access } : access;
    const existing = map.get(normalized) ?? {};
    map.set(normalized, {
      roles: [...(existing.roles ?? []), ...(normalizedAccess.roles ?? [])],
      scopes: [...(existing.scopes ?? []), ...(normalizedAccess.scopes ?? [])],
    });
  }
  return map;
}

function mappedAccessForGroups(groups: string[], overrides?: WorkOsGroupRoleMap): Required<WorkOsGroupAccess> {
  const map = groupAccessMap(overrides);
  const roles = new Set<string>();
  const scopes = new Set<string>();
  for (const group of groups) {
    const access = map.get(normalizeGroupName(group));
    for (const role of access?.roles ?? []) if (role.trim()) roles.add(role.trim());
    for (const scope of access?.scopes ?? []) if (scope.trim()) scopes.add(scope.trim());
  }
  return { roles: [...roles], scopes: [...scopes] };
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => !!value))];
}

export function authenticate(headers: Headers): AuthContext {
  const authorization = headerValue(headers, 'authorization');
  const token = authorization?.replace(/^Bearer\s+/iu, '') || headerValue(headers, 'x-greybox-dev-token') || 'dev-token';
  const tierHeader = headerValue(headers, 'x-greybox-tier');
  const tier = tiers.has(tierHeader as PlanTier) ? tierHeader as PlanTier : 'indie';
  return {
    tenantId: headerValue(headers, 'x-greybox-tenant') ?? 'dev-tenant',
    userId: headerValue(headers, 'x-greybox-user') ?? 'dev-user',
    tier,
    tokenHash: createHash('sha256').update(token).digest('hex'),
    roles: (headerValue(headers, 'x-greybox-roles') ?? 'designer').split(',').map((role) => role.trim()).filter(Boolean),
    dataResidencyRegion: regionFromHeaders(headers),
    authProvider: token === 'dev-token' ? 'dev' : 'managed-token',
  };
}

export async function authenticateRequest(
  headers: Headers,
  options: AuthenticateOptions = {},
): Promise<AuthContext> {
  const token = bearerToken(headers);
  if (token && isJwt(token) && options.workosVerifier) {
    try {
      const claims = await options.workosVerifier.verify(token);
      await options.tenantStore?.refreshFromPersister();
      return authContextFromWorkOsClaims(claims, token, options);
    } catch (error) {
      if (error instanceof WorkOsAuthError) throw new AuthenticationError(error.message);
      throw error;
    }
  }
  if (options.requireVerifiedWorkOs) {
    throw new AuthenticationError('Verified WorkOS authentication is required');
  }
  return authenticate(headers);
}

function authContextFromWorkOsClaims(
  claims: WorkOsClaims,
  token: string,
  options: AuthenticateOptions,
): AuthContext {
  const organizationId = organizationIdFromClaims(claims);
  const tier = tierFrom(claims.tier, organizationId ? 'studio' : 'indie');
  const dataResidencyRegion = dataResidencyRegionFromClaims(claims);
  const tenant = organizationId
    ? options.tenantStore?.getOrCreateForOrganization(organizationId, tier, {
      region: dataResidencyRegion,
    })
    : undefined;
  const mappedAccess = mappedAccessForGroups(groupsFromClaims(claims), options.workosGroupRoleMap);
  const roles = uniqueStrings([...rolesFromClaims(claims), ...mappedAccess.roles]);
  const scopes = uniqueStrings([
    ...(Array.isArray(claims.permissions) ? claims.permissions.filter((scope): scope is string => typeof scope === 'string') : []),
    ...mappedAccess.scopes,
  ]);
  return {
    tenantId: tenant?.id ?? `workos:user:${claims.sub}`,
    userId: claims.sub,
    tier: tenant?.tier ?? tier,
    tokenHash: createHash('sha256').update(token).digest('hex'),
    roles: roles.length > 0 ? roles : ['designer'],
    dataResidencyRegion,
    authProvider: 'workos',
    ...(organizationId ? { organizationId } : {}),
    ...(typeof claims.email === 'string' ? { email: claims.email } : {}),
    ...(scopes.length > 0 ? { scopes } : {}),
  };
}

export function workOsGroupRoleMapFromEnv(): WorkOsGroupRoleMap | undefined {
  return parseWorkOsGroupRoleMap(process.env.GREYBOX_WORKOS_GROUP_ROLE_MAP);
}
