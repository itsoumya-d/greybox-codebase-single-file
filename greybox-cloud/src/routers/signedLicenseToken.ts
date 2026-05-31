// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { createPublicKey, verify } from 'node:crypto';
import { canonicalLicensePayload } from '../enterprise/offlineLicense.js';
import {
  isLicensePlanCompatibleWithTier,
  licenseHash,
  licenseValidationResponse,
  type LicenseValidationResponse,
  type UnityLicenseTier,
} from './licenses.js';
import type { PlanTier } from '../types.js';

export const SIGNED_LICENSE_TOKEN_PREFIX = 'gbxv2.';

export interface SignedLicenseTokenPayload {
  licenseId: string;
  tier: UnityLicenseTier;
  plan: PlanTier | 'pro';
  publicKeyId: string;
  issuedAt: string;
  expiresAt: string;
  features?: Partial<LicenseValidationResponse['features']>;
}

export interface SignedLicenseKey {
  keyId: string;
  publicKeyPem: string;
}

export type SignedLicenseKeyRegistry = ReadonlyMap<string, string>;

export class SignedLicenseTokenError extends Error {
  readonly status = 401;
  constructor(readonly code: string) {
    super(code);
    this.name = 'SignedLicenseTokenError';
  }
}

const SAFE_KEY_ID_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/u;
const SAFE_LICENSE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const VALID_TIERS = new Set<UnityLicenseTier>(['free-personal', 'indie', 'pro', 'studio']);
const VALID_PLANS = new Set<string>(['free', 'indie', 'pro', 'studio', 'enterprise']);
const CLOCK_SKEW_MS = 5 * 60 * 1000;

export function isSignedLicenseToken(token: string): boolean {
  return token.startsWith(SIGNED_LICENSE_TOKEN_PREFIX);
}

export function signedLicenseKeysFromEnv(env: NodeJS.ProcessEnv = process.env): SignedLicenseKeyRegistry {
  const raw = env.GREYBOX_LICENSE_SIGNING_KEYS_JSON?.trim();
  if (!raw) return new Map();
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Map();
    const out = new Map<string, string>();
    for (const item of parsed) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      const record = item as Record<string, unknown>;
      const keyId = typeof record.keyId === 'string' ? record.keyId.trim() : '';
      const pem = typeof record.publicKeyPem === 'string' ? record.publicKeyPem.trim() : '';
      if (!SAFE_KEY_ID_RE.test(keyId) || !pem.includes('BEGIN PUBLIC KEY')) continue;
      out.set(keyId, pem);
    }
    return out;
  } catch {
    return new Map();
  }
}

export function parseSignedLicenseToken(
  token: string,
  keys: SignedLicenseKeyRegistry,
  now: Date = new Date(),
): LicenseValidationResponse {
  if (!isSignedLicenseToken(token)) {
    throw new SignedLicenseTokenError('not_signed_license_token');
  }
  if (keys.size === 0) {
    throw new SignedLicenseTokenError('signed_license_keys_not_configured');
  }
  const remainder = token.slice(SIGNED_LICENSE_TOKEN_PREFIX.length);
  const parts = remainder.split('.');
  if (parts.length !== 2) {
    throw new SignedLicenseTokenError('bad_signed_license_token');
  }
  const [payloadPart, sigPart] = parts as [string, string];
  let payloadBytes: Buffer;
  let signatureBytes: Buffer;
  try {
    payloadBytes = Buffer.from(payloadPart, 'base64url');
    signatureBytes = Buffer.from(sigPart, 'base64url');
  } catch {
    throw new SignedLicenseTokenError('bad_signed_license_encoding');
  }
  if (payloadBytes.byteLength === 0 || signatureBytes.byteLength !== 64) {
    throw new SignedLicenseTokenError('bad_signed_license_encoding');
  }
  let payload: SignedLicenseTokenPayload;
  try {
    payload = JSON.parse(payloadBytes.toString('utf8')) as SignedLicenseTokenPayload;
  } catch {
    throw new SignedLicenseTokenError('bad_signed_license_payload');
  }
  assertPayloadShape(payload);

  const publicKeyPem = keys.get(payload.publicKeyId);
  if (!publicKeyPem) {
    throw new SignedLicenseTokenError('signed_license_unknown_key');
  }
  const canonical = canonicalLicensePayload(payload);
  let key: ReturnType<typeof createPublicKey>;
  try {
    key = createPublicKey(publicKeyPem);
  } catch {
    throw new SignedLicenseTokenError('signed_license_bad_public_key');
  }
  const signatureValid = verify(null, Buffer.from(canonical, 'utf8'), key, signatureBytes);
  if (!signatureValid) {
    throw new SignedLicenseTokenError('signed_license_bad_signature');
  }

  const issuedAtMs = Date.parse(payload.issuedAt);
  const expiresAtMs = Date.parse(payload.expiresAt);
  if (!Number.isFinite(issuedAtMs) || !Number.isFinite(expiresAtMs)) {
    throw new SignedLicenseTokenError('signed_license_bad_dates');
  }
  const nowMs = now.getTime();
  if (issuedAtMs > nowMs + CLOCK_SKEW_MS) {
    throw new SignedLicenseTokenError('signed_license_not_yet_valid');
  }
  if (expiresAtMs <= nowMs) {
    throw new SignedLicenseTokenError('signed_license_expired');
  }
  if (expiresAtMs <= issuedAtMs) {
    throw new SignedLicenseTokenError('signed_license_bad_dates');
  }

  return licenseValidationResponse(payload.tier, payload.plan, token, {
    expiresAt: payload.expiresAt,
    ...(payload.features ? { features: payload.features } : {}),
  });
}

export function signedLicenseTokenHash(token: string): string {
  return licenseHash(token);
}

function assertPayloadShape(payload: SignedLicenseTokenPayload): void {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new SignedLicenseTokenError('signed_license_bad_payload');
  }
  if (typeof payload.licenseId !== 'string' || !SAFE_LICENSE_ID_RE.test(payload.licenseId)) {
    throw new SignedLicenseTokenError('signed_license_bad_license_id');
  }
  if (typeof payload.publicKeyId !== 'string' || !SAFE_KEY_ID_RE.test(payload.publicKeyId)) {
    throw new SignedLicenseTokenError('signed_license_bad_key_id');
  }
  if (typeof payload.tier !== 'string' || !VALID_TIERS.has(payload.tier as UnityLicenseTier)) {
    throw new SignedLicenseTokenError('signed_license_bad_tier');
  }
  if (typeof payload.plan !== 'string' || !VALID_PLANS.has(payload.plan)) {
    throw new SignedLicenseTokenError('signed_license_bad_plan');
  }
  if (!isLicensePlanCompatibleWithTier(payload.tier, payload.plan as PlanTier | 'pro')) {
    throw new SignedLicenseTokenError('signed_license_plan_tier_mismatch');
  }
  if (typeof payload.issuedAt !== 'string' || typeof payload.expiresAt !== 'string') {
    throw new SignedLicenseTokenError('signed_license_bad_dates');
  }
}
