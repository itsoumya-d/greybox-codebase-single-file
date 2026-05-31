// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { readFile } from 'node:fs/promises';
import { createPublicKey, verify } from 'node:crypto';

export interface OfflineLicensePayload {
  licenseId: string;
  tenantId: string;
  customerName: string;
  plan: 'enterprise';
  deployment: 'on-prem';
  seats: number;
  features: string[];
  regions: Array<'us' | 'eu' | 'in' | 'offline'>;
  issuedAt: string;
  expiresAt: string;
}

export interface OfflineLicenseFile {
  algorithm: 'ed25519';
  payload: OfflineLicensePayload;
  signature: string;
}

export interface ValidatedOfflineLicense extends OfflineLicensePayload {
  daysUntilExpiry: number;
}

export interface OfflineLicenseStatus {
  configured: boolean;
  valid: boolean;
  license?: ValidatedOfflineLicense;
  error?: string;
}

export interface OfflineLicenseLoadOptions {
  licensePath?: string;
  publicKeyPem?: string;
  publicKeyPath?: string;
  now?: Date;
}

export class OfflineLicenseError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

export function canonicalLicensePayload(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalLicensePayload(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${canonicalLicensePayload(entryValue)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function verifyOfflineLicense(
  licenseFile: OfflineLicenseFile,
  publicKeyPem: string,
  now = new Date(),
): ValidatedOfflineLicense {
  assertLicenseShape(licenseFile);
  const signature = Buffer.from(licenseFile.signature, 'base64');
  const signedBytes = Buffer.from(canonicalLicensePayload(licenseFile.payload), 'utf8');
  const key = createPublicKey(publicKeyPem);
  const signatureValid = verify(null, signedBytes, key, signature);
  if (!signatureValid) throw new OfflineLicenseError('offline_license_bad_signature', 'Offline license signature is invalid');

  const issuedAtMs = Date.parse(licenseFile.payload.issuedAt);
  const expiresAtMs = Date.parse(licenseFile.payload.expiresAt);
  const nowMs = now.getTime();
  if (!Number.isFinite(issuedAtMs) || !Number.isFinite(expiresAtMs)) {
    throw new OfflineLicenseError('offline_license_bad_dates', 'Offline license dates must be valid ISO timestamps');
  }
  if (issuedAtMs > nowMs + 5 * 60 * 1000) {
    throw new OfflineLicenseError('offline_license_not_yet_valid', 'Offline license is not valid yet');
  }
  if (expiresAtMs <= nowMs) {
    throw new OfflineLicenseError('offline_license_expired', 'Offline license has expired');
  }
  if (licenseFile.payload.seats < 1) {
    throw new OfflineLicenseError('offline_license_bad_seats', 'Offline license must include at least one seat');
  }
  return {
    ...licenseFile.payload,
    daysUntilExpiry: Math.ceil((expiresAtMs - nowMs) / 86_400_000),
  };
}

export async function loadOfflineLicenseStatus(options: OfflineLicenseLoadOptions): Promise<OfflineLicenseStatus> {
  if (!options.licensePath) {
    return { configured: false, valid: false, error: 'offline_license_not_configured' };
  }
  try {
    const [licenseText, publicKeyPem] = await Promise.all([
      readFile(options.licensePath, 'utf8'),
      loadPublicKey(options),
    ]);
    const license = verifyOfflineLicense(JSON.parse(licenseText) as OfflineLicenseFile, publicKeyPem, options.now);
    return { configured: true, valid: true, license };
  } catch (error) {
    return {
      configured: true,
      valid: false,
      error: error instanceof OfflineLicenseError ? error.code : error instanceof Error ? error.message : 'offline_license_unknown_error',
    };
  }
}

function assertLicenseShape(licenseFile: OfflineLicenseFile): void {
  if (!licenseFile || typeof licenseFile !== 'object') {
    throw new OfflineLicenseError('offline_license_bad_file', 'Offline license must be an object');
  }
  if (licenseFile.algorithm !== 'ed25519') {
    throw new OfflineLicenseError('offline_license_bad_algorithm', 'Offline license must use ed25519');
  }
  if (!licenseFile.signature) {
    throw new OfflineLicenseError('offline_license_missing_signature', 'Offline license signature is required');
  }
  const payload = licenseFile.payload;
  if (!payload || typeof payload !== 'object') {
    throw new OfflineLicenseError('offline_license_bad_payload', 'Offline license payload is required');
  }
  if (payload.plan !== 'enterprise' || payload.deployment !== 'on-prem') {
    throw new OfflineLicenseError('offline_license_wrong_plan', 'Offline license must be enterprise on-prem');
  }
  for (const field of ['licenseId', 'tenantId', 'customerName', 'issuedAt', 'expiresAt'] as const) {
    if (typeof payload[field] !== 'string' || !payload[field].trim()) {
      throw new OfflineLicenseError('offline_license_missing_field', `${field} is required`);
    }
  }
  if (!Array.isArray(payload.features) || !Array.isArray(payload.regions)) {
    throw new OfflineLicenseError('offline_license_bad_entitlements', 'features and regions must be arrays');
  }
}

async function loadPublicKey(options: OfflineLicenseLoadOptions): Promise<string> {
  if (options.publicKeyPem) return options.publicKeyPem;
  if (options.publicKeyPath) return readFile(options.publicKeyPath, 'utf8');
  throw new OfflineLicenseError('offline_license_public_key_not_configured', 'Offline license public key is not configured');
}
