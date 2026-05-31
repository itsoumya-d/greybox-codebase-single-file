// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { timingSafeEqual } from 'node:crypto';
import { authBreakGlassAllowed, type HostedProductionAuthEnv } from '../security/authProdSafety.js';
import { isHostedProductionEnv } from '../security/persistenceProdSafety.js';

export function extractBearerToken(headers: Headers): string {
  const authorization = headers.get('authorization') ?? '';
  const bearer = authorization.match(/^Bearer\s+(.+)$/iu)?.[1];
  return bearer?.trim() || headers.get('x-greybox-billing-admin-token')?.trim() || '';
}

export function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function isBillingAdmin(
  headers: Headers,
  adminToken: string | undefined | null,
  env: HostedProductionAuthEnv = process.env,
): boolean {
  if (!adminToken) return false;
  if (isHostedProductionEnv(env) && !authBreakGlassAllowed(env)) return false;
  const supplied = extractBearerToken(headers);
  if (!supplied) return false;
  return constantTimeEquals(supplied, adminToken);
}
