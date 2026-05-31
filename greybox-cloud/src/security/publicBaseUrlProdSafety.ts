// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { isIP } from 'node:net';
import { isHostedProductionEnv, type HostedProductionPersistenceEnv } from './persistenceProdSafety.js';
import { timeBoundBreakGlassAllowed } from './timeBoundBreakGlass.js';

export interface HostedProductionPublicBaseUrlEnv extends HostedProductionPersistenceEnv {
  readonly GREYBOX_PUBLIC_BASE_URL?: string;
  readonly GREYBOX_CLOUD_ALLOW_UNVERIFIED_PUBLIC_BASE_URL?: string;
  readonly GREYBOX_CLOUD_ALLOW_UNVERIFIED_PUBLIC_BASE_URL_REASON?: string;
  readonly GREYBOX_CLOUD_ALLOW_UNVERIFIED_PUBLIC_BASE_URL_EXPIRES_AT?: string;
  readonly GREYBOX_CLOUD_ALLOW_UNVERIFIED_PUBLIC_BASE_URL_NOW?: string;
}

export interface PublicBaseUrlOptions {
  readonly env?: HostedProductionPublicBaseUrlEnv;
  readonly publicBaseUrl?: string;
}

export interface NormalizePublicBaseUrlOptions {
  readonly allowLocalHttp?: boolean;
}

export class HostedProductionPublicBaseUrlError extends Error {
  readonly code = 'hosted_production_public_base_url_not_verified';

  constructor(readonly reason: string) {
    super([
      'Hosted production requires a canonical HTTPS GREYBOX_PUBLIC_BASE_URL for SCIM metadata and identity-provider callbacks.',
      reason,
      'Set GREYBOX_PUBLIC_BASE_URL to the deployed Cloud origin, set GREYBOX_DEPLOYMENT_MODE=on-prem for an offline bundle, or use a time-bound GREYBOX_CLOUD_ALLOW_UNVERIFIED_PUBLIC_BASE_URL break-glass with reason and expiry.',
    ].join(' '));
    this.name = 'HostedProductionPublicBaseUrlError';
  }
}

export function normalizePublicBaseUrl(
  value: string | undefined,
  options: NormalizePublicBaseUrlOptions = {},
): string | undefined {
  const clean = value?.trim();
  if (!clean) return undefined;
  try {
    const url = new URL(clean);
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return undefined;
    if (url.protocol === 'https:') return url.origin;
    if (options.allowLocalHttp === true && url.protocol === 'http:' && isLoopbackHost(url.hostname)) {
      return url.origin;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export function unverifiedPublicBaseUrlExplicitlyAllowed(
  env: HostedProductionPublicBaseUrlEnv = process.env,
): boolean {
  return timeBoundBreakGlassAllowed(env, { flagKey: 'GREYBOX_CLOUD_ALLOW_UNVERIFIED_PUBLIC_BASE_URL' });
}

export function assertHostedProductionPublicBaseUrl(options: PublicBaseUrlOptions = {}): void {
  const env = options.env ?? process.env;
  if (!isHostedProductionEnv(env)) return;
  if (unverifiedPublicBaseUrlExplicitlyAllowed(env)) return;

  const rawBaseUrl = options.publicBaseUrl ?? env.GREYBOX_PUBLIC_BASE_URL;
  const normalized = normalizePublicBaseUrl(rawBaseUrl);
  if (normalized && isHostedPublicHttpsOrigin(normalized)) return;

  throw new HostedProductionPublicBaseUrlError(publicBaseUrlFailureReason(rawBaseUrl));
}

function publicBaseUrlFailureReason(value: string | undefined): string {
  if (!value?.trim()) return 'GREYBOX_PUBLIC_BASE_URL is missing.';
  const normalized = normalizePublicBaseUrl(value);
  if (!normalized) {
    return 'GREYBOX_PUBLIC_BASE_URL must be an absolute HTTPS origin without credentials, paths, query strings, or fragments.';
  }
  return 'GREYBOX_PUBLIC_BASE_URL must be a non-loopback hosted origin.';
}

function isHostedPublicHttpsOrigin(origin: string): boolean {
  const url = new URL(origin);
  return url.protocol === 'https:'
    && !isLoopbackHost(url.hostname)
    && isIP(url.hostname) === 0
    && url.hostname.includes('.');
}

function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().replace(/^\[|\]$/gu, '').toLowerCase();
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1';
}
