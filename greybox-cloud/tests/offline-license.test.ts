// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import type http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  canonicalLicensePayload,
  verifyOfflineLicense,
  type OfflineLicenseFile,
  type OfflineLicensePayload,
} from '../src/enterprise/offlineLicense.js';
import { createGreyboxCloudServer } from '../src/server.js';

const payload: OfflineLicensePayload = {
  licenseId: 'lic_enterprise_123',
  tenantId: 'tenant_enterprise_123',
  customerName: 'Example Studio',
  plan: 'enterprise',
  deployment: 'on-prem',
  seats: 25,
  features: ['managed-inference', 'scim', 'audit-log', 'round-trip-sync'],
  regions: ['offline'],
  issuedAt: '2026-05-01T00:00:00.000Z',
  expiresAt: '2027-05-01T00:00:00.000Z',
};

function signedLicense(overrides: Partial<OfflineLicensePayload> = {}) {
  const keys = generateKeyPairSync('ed25519');
  const licensePayload = { ...payload, ...overrides };
  const signature = sign(null, Buffer.from(canonicalLicensePayload(licensePayload), 'utf8'), keys.privateKey).toString('base64');
  return {
    publicKeyPem: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    license: {
      algorithm: 'ed25519',
      payload: licensePayload,
      signature,
    } satisfies OfflineLicenseFile,
  };
}

async function withServer<T>(
  options: Parameters<typeof createGreyboxCloudServer>[0],
  run: (baseUrl: string, server: http.Server) => Promise<T>,
): Promise<T> {
  const server = createGreyboxCloudServer(options);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  try {
    return await run(`http://127.0.0.1:${address.port}`, server);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test('offline license verification accepts signed enterprise on-prem files', () => {
  const { license, publicKeyPem } = signedLicense();
  const verified = verifyOfflineLicense(license, publicKeyPem, new Date('2026-05-15T00:00:00.000Z'));
  assert.equal(verified.tenantId, 'tenant_enterprise_123');
  assert.equal(verified.seats, 25);
  assert.equal(verified.daysUntilExpiry, 351);
});

test('offline license verification rejects tampered or expired files', () => {
  const { license, publicKeyPem } = signedLicense();
  assert.throws(
    () => verifyOfflineLicense({ ...license, payload: { ...license.payload, seats: 99 } }, publicKeyPem, new Date('2026-05-15T00:00:00.000Z')),
    /signature is invalid/u,
  );

  const expired = signedLicense({ expiresAt: '2026-05-02T00:00:00.000Z' });
  assert.throws(
    () => verifyOfflineLicense(expired.license, expired.publicKeyPem, new Date('2026-05-15T00:00:00.000Z')),
    /has expired/u,
  );
});

test('offline license status endpoint reads license files for on-prem health checks', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-offline-license-'));
  try {
    const { license, publicKeyPem } = signedLicense({ expiresAt: '2099-05-01T00:00:00.000Z' });
    const licensePath = path.join(dir, 'license.greybox.json');
    await writeFile(licensePath, `${JSON.stringify(license, null, 2)}\n`, 'utf8');
    await withServer(
      {
        offlineLicensePath: licensePath,
        offlineLicensePublicKeyPem: publicKeyPem,
      },
      async (baseUrl) => {
        const response = await fetch(`${baseUrl}/v1/enterprise/offline-license`);
        assert.equal(response.status, 200);
        const json = await response.json() as { valid: boolean; license: { customerName: string; signature?: string } };
        assert.equal(json.valid, true);
        assert.equal(json.license.customerName, 'Example Studio');
        assert.equal(json.license.signature, undefined);
      },
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
