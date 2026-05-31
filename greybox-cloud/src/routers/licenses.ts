// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { createHash, timingSafeEqual } from 'node:crypto';
import type { AuthContext, PlanTier } from '../types.js';
import {
  isSignedLicenseToken,
  parseSignedLicenseToken,
  SignedLicenseTokenError,
  type SignedLicenseKeyRegistry,
} from './signedLicenseToken.js';

export type UnityLicenseTier = 'free-personal' | 'indie' | 'pro' | 'studio';
export type LicenseRecordStatus = 'active' | 'suspended' | 'revoked';

export interface LicenseValidationResponse {
  valid: true;
  status: 'active';
  tier: UnityLicenseTier;
  plan: PlanTier | 'pro';
  licenseHash: string;
  expiresAt?: string;
  features: {
    import: true;
    roundTripSync: boolean;
    mcpBridge: boolean;
    watermark: boolean;
    maxProjects: number | null;
    priorityQueue: boolean;
    sso: boolean;
    customSkillPacks: boolean;
    seatLimit: number | null;
    siteLicense: boolean;
  };
}

export interface LicenseRecord {
  tokenHash: string;
  tier: UnityLicenseTier;
  plan?: PlanTier | 'pro';
  status?: LicenseRecordStatus;
  expiresAt?: string;
  features?: Partial<LicenseValidationResponse['features']>;
}

export interface LicenseRecordStore {
  list(): Promise<readonly LicenseRecord[]>;
}

export interface LicenseValidationOptions {
  records?: readonly LicenseRecord[];
  now?: Date;
  allowPrefixFallback?: boolean;
  signingKeys?: SignedLicenseKeyRegistry;
  failClosed?: boolean;
}

export class LicenseValidationError extends Error {
  readonly status = 401;

  constructor(message = 'invalid_license') {
    super(message);
    this.name = 'LicenseValidationError';
  }
}

const prefixTiers: Array<[RegExp, UnityLicenseTier, PlanTier | 'pro']> = [
  [/^(gbx|greybox)_(free|personal)_/iu, 'free-personal', 'free'],
  [/^(gbx|greybox)_indie_/iu, 'indie', 'indie'],
  [/^(gbx|greybox)_(pro|professional)_/iu, 'pro', 'pro'],
  [/^(gbx|greybox)_(studio|site|enterprise)_/iu, 'studio', 'enterprise'],
];

export function licenseTokenFromHeaders(headers: Headers): string {
  return headers.get('authorization')?.match(/^Bearer\s+(.+)$/iu)?.[1]?.trim() ?? '';
}

export function tierFromLicenseToken(token: string): { tier: UnityLicenseTier; plan: PlanTier | 'pro' } | undefined {
  for (const [pattern, tier, plan] of prefixTiers) {
    if (pattern.test(token)) return { tier, plan };
  }
  return undefined;
}

export function licenseHash(token: string, length = 16): string {
  return createHash('sha256').update(token).digest('hex').slice(0, length);
}

export function parseUnityLicenseTier(value: unknown): UnityLicenseTier | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase().replaceAll('_', '-');
  if (normalized === 'free' || normalized === 'personal' || normalized === 'free-personal') return 'free-personal';
  if (normalized === 'indie') return 'indie';
  if (normalized === 'pro' || normalized === 'professional') return 'pro';
  if (normalized === 'studio' || normalized === 'site' || normalized === 'site-license' || normalized === 'enterprise') return 'studio';
  return undefined;
}

export function isLicensePlanCompatibleWithTier(tier: UnityLicenseTier, plan: PlanTier | 'pro'): boolean {
  if (tier === 'free-personal') return plan === 'free';
  if (tier === 'indie') return plan === 'indie';
  if (tier === 'pro') return plan === 'pro';
  return plan === 'studio' || plan === 'enterprise';
}

export function licenseRecordsFromEnv(env: { GREYBOX_LICENSE_RECORDS_JSON?: string } = process.env): LicenseRecord[] {
  const raw = env.GREYBOX_LICENSE_RECORDS_JSON?.trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item): LicenseRecord[] => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
      const record = item as Record<string, unknown>;
      const tokenHash = typeof record.tokenHash === 'string' ? normalizeLicenseHash(record.tokenHash) : undefined;
      const tier = parseUnityLicenseTier(record.tier);
      if (!tokenHash || !tier) return [];
      const plan = parseLicensePlan(record.plan);
      const status = parseLicenseRecordStatus(record.status);
      const expiresAt = typeof record.expiresAt === 'string' && record.expiresAt.trim() ? record.expiresAt.trim() : undefined;
      const features = parseLicenseFeatures(record.features);
      return [{
        tokenHash,
        tier,
        ...(plan ? { plan } : {}),
        ...(status ? { status } : {}),
        ...(expiresAt ? { expiresAt } : {}),
        ...(features ? { features } : {}),
      }];
    });
  } catch {
    return [];
  }
}

export function unityTierFromAuthContext(context: AuthContext): UnityLicenseTier {
  if (context.tier === 'free') return 'free-personal';
  if (context.tier === 'indie') return 'indie';
  return 'studio';
}

function planFromUnityTier(tier: UnityLicenseTier): PlanTier | 'pro' {
  switch (tier) {
    case 'free-personal':
      return 'free';
    case 'indie':
      return 'indie';
    case 'pro':
      return 'pro';
    case 'studio':
      return 'studio';
  }
}

export function validateLicenseToken(
  token: string,
  options: LicenseValidationOptions = {},
): LicenseValidationResponse {
  if (isSignedLicenseToken(token)) {
    try {
      return parseSignedLicenseToken(token, options.signingKeys ?? new Map(), options.now);
    } catch (error) {
      if (error instanceof SignedLicenseTokenError) {
        throw new LicenseValidationError(error.code);
      }
      throw error;
    }
  }
  const records = options.records ?? [];
  const matchedRecord = findLicenseRecord(token, records);
  if (matchedRecord) {
    return licenseValidationResponseFromRecord(matchedRecord, token, options.now ?? new Date());
  }
  const signingKeysConfigured = (options.signingKeys?.size ?? 0) > 0;
  const failClosed = records.length > 0 || signingKeysConfigured || options.failClosed === true;
  if (failClosed && options.allowPrefixFallback !== true) {
    throw new LicenseValidationError();
  }
  const parsed = tierFromLicenseToken(token);
  if (!parsed) throw new LicenseValidationError();
  return licenseValidationResponse(parsed.tier, parsed.plan, token);
}

export function licenseValidationResponse(
  tier: UnityLicenseTier,
  plan: PlanTier | 'pro' = planFromUnityTier(tier),
  token: string = tier,
  overrides: {
    features?: Partial<LicenseValidationResponse['features']>;
    expiresAt?: string;
  } = {},
): LicenseValidationResponse {
  const paidRoundTrip = tier === 'pro' || tier === 'studio';
  const studio = tier === 'studio';
  const baseFeatures: LicenseValidationResponse['features'] = {
    import: true,
    roundTripSync: paidRoundTrip,
    mcpBridge: paidRoundTrip,
    watermark: tier === 'free-personal',
    maxProjects: tier === 'free-personal' ? 3 : null,
    priorityQueue: paidRoundTrip,
    sso: studio,
    customSkillPacks: studio,
    seatLimit: studio ? 25 : 1,
    siteLicense: studio,
  };
  return {
    valid: true,
    status: 'active',
    tier,
    plan,
    licenseHash: licenseHash(token),
    ...(overrides.expiresAt ? { expiresAt: overrides.expiresAt } : {}),
    features: {
      ...baseFeatures,
      ...overrides.features,
    },
  };
}

function licenseValidationResponseFromRecord(
  record: LicenseRecord,
  token: string,
  now: Date,
): LicenseValidationResponse {
  const status = record.status ?? 'active';
  if (status !== 'active') {
    throw new LicenseValidationError(`license_${status}`);
  }
  if (record.expiresAt) {
    const expiresAtMs = Date.parse(record.expiresAt);
    if (!Number.isFinite(expiresAtMs)) throw new LicenseValidationError('invalid_license_record');
    if (expiresAtMs <= now.getTime()) throw new LicenseValidationError('license_expired');
  }
  const plan = record.plan ?? planFromUnityTier(record.tier);
  if (!isLicensePlanCompatibleWithTier(record.tier, plan)) {
    throw new LicenseValidationError('invalid_license_record');
  }
  return licenseValidationResponse(record.tier, plan, token, {
    ...(record.expiresAt ? { expiresAt: record.expiresAt } : {}),
    ...(record.features ? { features: record.features } : {}),
  });
}

function findLicenseRecord(token: string, records: readonly LicenseRecord[]): LicenseRecord | undefined {
  if (records.length === 0) return undefined;
  const full = licenseHash(token, 64);
  const short = licenseHash(token);
  const matches = records.filter((record) => {
    const clean = normalizeLicenseHash(record.tokenHash);
    return !!clean && (constantTimeHexEquals(clean, full) || constantTimeHexEquals(clean, short));
  });
  if (matches.length > 1) {
    throw new LicenseValidationError('duplicate_license_record');
  }
  return matches[0];
}

function constantTimeHexEquals(actual: string, expected: string): boolean {
  if (actual.length !== expected.length) return false;
  const actualBuffer = Buffer.from(actual, 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  if (actualBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(actualBuffer, expectedBuffer);
}

export function normalizeLicenseHash(value: string): string | undefined {
  const clean = value.trim().toLowerCase();
  if (/^[a-f0-9]{16}$/u.test(clean) || /^[a-f0-9]{64}$/u.test(clean)) return clean;
  return undefined;
}

export function parseLicensePlan(value: unknown): PlanTier | 'pro' | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'free' || normalized === 'indie' || normalized === 'studio' || normalized === 'enterprise' || normalized === 'pro') {
    return normalized;
  }
  return undefined;
}

export function parseLicenseRecordStatus(value: unknown): LicenseRecordStatus | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'active' || normalized === 'suspended' || normalized === 'revoked') return normalized;
  return undefined;
}

function parseLicenseFeatures(value: unknown): Partial<LicenseValidationResponse['features']> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const features: Partial<LicenseValidationResponse['features']> = {};
  setOptionalBool(features, record, 'roundTripSync');
  setOptionalBool(features, record, 'mcpBridge');
  setOptionalBool(features, record, 'watermark');
  setOptionalBool(features, record, 'priorityQueue');
  setOptionalBool(features, record, 'sso');
  setOptionalBool(features, record, 'customSkillPacks');
  setOptionalBool(features, record, 'siteLicense');
  setOptionalNumberOrNull(features, record, 'maxProjects');
  setOptionalNumberOrNull(features, record, 'seatLimit');
  return Object.keys(features).length > 0 ? features : undefined;
}

function setOptionalBool(
  target: Partial<LicenseValidationResponse['features']>,
  record: Record<string, unknown>,
  key: keyof LicenseValidationResponse['features'],
): void {
  if (typeof record[key] === 'boolean') target[key] = record[key] as never;
}

function setOptionalNumberOrNull(
  target: Partial<LicenseValidationResponse['features']>,
  record: Record<string, unknown>,
  key: 'maxProjects' | 'seatLimit',
): void {
  const value = record[key];
  if (value === null || (typeof value === 'number' && Number.isInteger(value) && value >= 0)) {
    target[key] = value;
  }
}
