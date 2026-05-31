// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

// Runtime data-residency guard. Readiness reports prove that regional
// deployments exist; this guard prevents managed inference from entering the
// wrong regional deployment when hosted enforcement is enabled.

import type { AuthContext, DataResidencyRegion, TenantConfig } from '../types.js';
import { type TenantStore } from '../routers/tenants.js';

export type DataResidencyRuntimeMode = 'off' | 'audit' | 'strict';

export interface DataResidencyRuntimeDecision {
  mode: DataResidencyRuntimeMode;
  tenant: TenantConfig;
  expectedOrigin?: string;
  actualOrigin?: string;
  enforced: boolean;
  strictFailureCode?: DataResidencyRuntimeErrorCode;
  wouldRejectInStrict: boolean;
}

export type DataResidencyRuntimeErrorCode =
  | 'data_residency_region_not_configured'
  | 'data_residency_origin_unknown'
  | 'data_residency_region_mismatch';

export interface DataResidencyRuntimeErrorDetails {
  mode: DataResidencyRuntimeMode;
  tenantId: string;
  tenantRegion: DataResidencyRegion;
  expectedOrigin?: string;
  actualOrigin?: string;
}

export class DataResidencyRuntimeError extends Error {
  constructor(
    readonly status: number,
    readonly code: DataResidencyRuntimeErrorCode,
    message: string,
    readonly details: DataResidencyRuntimeErrorDetails,
  ) {
    super(message);
    this.name = 'DataResidencyRuntimeError';
  }
}

export function assertTenantRegionRuntime(options: {
  headers: Headers;
  context: AuthContext;
  tenantStore: TenantStore;
  env?: Record<string, string | undefined>;
}): DataResidencyRuntimeDecision {
  const env = options.env ?? process.env;
  const mode = dataResidencyRuntimeModeFromEnv(env);
  const tenant = options.tenantStore.getOrCreate(
    options.context.tenantId,
    options.context.tier,
    options.context.dataResidencyRegion ? { region: options.context.dataResidencyRegion } : {},
  );
  if (mode === 'off') return { mode, tenant, enforced: false, wouldRejectInStrict: false };

  const expectedOrigin = regionalOrigin(tenant.region, env);
  const actualOrigin = requestOrigin(options.headers, env);
  const details = {
    mode,
    tenantId: tenant.id,
    tenantRegion: tenant.region,
    expectedOrigin,
    actualOrigin,
  };
  if (!expectedOrigin) {
    const strictFailureCode = 'data_residency_region_not_configured';
    if (mode === 'strict') {
      throw new DataResidencyRuntimeError(
        503,
        strictFailureCode,
        `No regional Cloud URL is configured for tenant region ${tenant.region}.`,
        details,
      );
    }
    return { mode, tenant, actualOrigin, enforced: false, strictFailureCode, wouldRejectInStrict: true };
  }

  if (!actualOrigin) {
    const strictFailureCode = 'data_residency_origin_unknown';
    if (mode === 'strict') {
      throw new DataResidencyRuntimeError(
        409,
        strictFailureCode,
        'Cannot verify request origin for data-residency enforcement.',
        details,
      );
    }
    return { mode, tenant, expectedOrigin, enforced: false, strictFailureCode, wouldRejectInStrict: true };
  }

  const matched = normalizeOrigin(actualOrigin) === normalizeOrigin(expectedOrigin);
  if (!matched) {
    const strictFailureCode = 'data_residency_region_mismatch';
    if (mode === 'strict') {
      throw new DataResidencyRuntimeError(
        409,
        strictFailureCode,
        `Tenant ${tenant.id} must use ${expectedOrigin} for ${tenant.region} residency.`,
        details,
      );
    }
    return {
      mode,
      tenant,
      expectedOrigin,
      actualOrigin,
      enforced: false,
      strictFailureCode,
      wouldRejectInStrict: true,
    };
  }

  return {
    mode,
    tenant,
    expectedOrigin,
    actualOrigin,
    enforced: mode === 'strict',
    wouldRejectInStrict: false,
  };
}

export function dataResidencyRuntimeModeFromEnv(
  env: Record<string, string | undefined> = process.env,
): DataResidencyRuntimeMode {
  const value = (env.GREYBOX_DATA_RESIDENCY_ENFORCEMENT ?? '').trim().toLowerCase();
  if (['1', 'true', 'strict', 'enforce', 'enforced'].includes(value)) return 'strict';
  if (['audit', 'report', 'warn'].includes(value)) return 'audit';
  return 'off';
}

function regionalOrigin(
  region: DataResidencyRegion,
  env: Record<string, string | undefined>,
): string | undefined {
  const value = env[`GREYBOX_REGION_${region.toUpperCase()}_BASE_URL`]?.trim();
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.origin;
  } catch {
    return undefined;
  }
}

function requestOrigin(headers: Headers, env: Record<string, string | undefined>): string | undefined {
  const trustProxyHeaders = trustProxyHeadersFromEnv(env);
  const forwardedHost = trustProxyHeaders ? firstForwardedValue(headers.get('x-forwarded-host')) : undefined;
  const host = forwardedHost ?? headers.get('host')?.trim();
  if (!host) return undefined;
  const proto = trustProxyHeaders
    ? firstForwardedValue(headers.get('x-forwarded-proto'))
      ?? firstForwardedValue(headers.get('x-forwarded-protocol'))
      ?? 'https'
    : 'https';
  try {
    return new URL(`${proto}://${host}`).origin;
  } catch {
    return undefined;
  }
}

function trustProxyHeadersFromEnv(env: Record<string, string | undefined>): boolean {
  const value = (env.GREYBOX_TRUST_PROXY_HEADERS ?? '').trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(value);
}

function firstForwardedValue(value: string | null): string | undefined {
  return value?.split(',')[0]?.trim() || undefined;
}

function normalizeOrigin(origin: string): string {
  const url = new URL(origin);
  return `${url.protocol}//${url.host}`.toLowerCase();
}
