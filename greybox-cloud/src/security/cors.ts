// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import type { IncomingMessage, ServerResponse } from 'node:http';

export interface CorsPolicy {
  allowedOrigins: ReadonlySet<string>;
  allowedMethods: readonly string[];
  allowedHeaders: readonly string[];
  exposeHeaders: readonly string[];
  allowCredentials: boolean;
  maxAgeSeconds: number;
}

export class CorsPolicyConfigurationError extends Error {
  readonly code = 'cors_policy_configuration_error';

  constructor(message: string) {
    super(message);
    this.name = 'CorsPolicyConfigurationError';
  }
}

const DEFAULT_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];
const DEFAULT_HEADERS = ['authorization', 'content-type', 'x-greybox-tenant', 'x-greybox-mcp-token'];
const DEFAULT_EXPOSE = ['x-greybox-request-id'];

export function corsPolicyFromEnv(env: NodeJS.ProcessEnv = process.env): CorsPolicy | undefined {
  // Support both GREYBOX_CLOUD_ALLOWED_ORIGINS (canonical) and CORS_ALLOWED_ORIGINS (convenience alias).
  const rawOrigins = env.GREYBOX_CLOUD_ALLOWED_ORIGINS ?? env.CORS_ALLOWED_ORIGINS;
  if (!rawOrigins || rawOrigins.trim().length === 0) return undefined;
  const origins = rawOrigins
    .split(',')
    .map((value) => normalizeCorsOrigin(value))
    .filter((value): value is string => Boolean(value));
  if (origins.length === 0) return undefined;
  const credentials = (env.GREYBOX_CLOUD_ALLOW_CREDENTIALS ?? 'false').toLowerCase() === 'true';
  if (credentials && origins.includes('*')) {
    throw new CorsPolicyConfigurationError(
      'GREYBOX_CLOUD_ALLOW_CREDENTIALS=true cannot be used with wildcard GREYBOX_CLOUD_ALLOWED_ORIGINS.',
    );
  }
  return {
    allowedOrigins: new Set(origins),
    allowedMethods: DEFAULT_METHODS,
    allowedHeaders: DEFAULT_HEADERS,
    exposeHeaders: DEFAULT_EXPOSE,
    allowCredentials: credentials,
    maxAgeSeconds: 600,
  };
}

function normalizeCorsOrigin(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed === '*') return '*';
  try {
    const url = new URL(trimmed);
    if (!['https:', 'http:'].includes(url.protocol)) {
      throw new CorsPolicyConfigurationError(`Unsupported CORS origin protocol: ${trimmed}`);
    }
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
      throw new CorsPolicyConfigurationError(
        `CORS origin must be an origin without credentials, path, query, or fragment: ${trimmed}`,
      );
    }
    return url.origin;
  } catch (error) {
    if (error instanceof CorsPolicyConfigurationError) throw error;
    throw new CorsPolicyConfigurationError(`Invalid CORS origin: ${trimmed}`);
  }
}

export function isOriginAllowed(policy: CorsPolicy, origin: string | undefined): boolean {
  if (!origin) return false;
  if (policy.allowedOrigins.has('*')) return true;
  if (policy.allowedOrigins.has(origin)) return true;
  // In non-production environments automatically allow localhost and 127.0.0.1
  // on any port so developers don't have to enumerate every local dev server port.
  if (process.env.NODE_ENV !== 'production') {
    if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')
      || origin === 'http://localhost' || origin === 'http://127.0.0.1') {
      return true;
    }
  }
  return false;
}

export function applyCorsHeaders(response: ServerResponse, policy: CorsPolicy, origin: string | undefined): void {
  if (!isOriginAllowed(policy, origin)) return;
  if (origin) response.setHeader('access-control-allow-origin', origin);
  response.setHeader('vary', 'Origin');
  if (policy.allowCredentials) response.setHeader('access-control-allow-credentials', 'true');
  if (policy.exposeHeaders.length > 0) {
    response.setHeader('access-control-expose-headers', policy.exposeHeaders.join(', '));
  }
}

export function handleCorsPreflight(
  request: IncomingMessage,
  response: ServerResponse,
  policy: CorsPolicy,
): boolean {
  if (request.method !== 'OPTIONS') return false;
  const origin = request.headers.origin?.toString();
  if (!isOriginAllowed(policy, origin)) {
    response.writeHead(403, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ error: 'origin_not_allowed' }));
    return true;
  }
  applyCorsHeaders(response, policy, origin);
  response.setHeader('access-control-allow-methods', policy.allowedMethods.join(', '));
  response.setHeader('access-control-allow-headers', policy.allowedHeaders.join(', '));
  response.setHeader('access-control-max-age', String(policy.maxAgeSeconds));
  response.writeHead(204);
  response.end();
  return true;
}
