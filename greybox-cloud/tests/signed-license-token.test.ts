// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import { generateKeyPairSync, sign as cryptoSign, type KeyObject } from 'node:crypto';
import test from 'node:test';
import { canonicalLicensePayload } from '../src/enterprise/offlineLicense.js';
import { validateLicenseToken } from '../src/routers/licenses.js';
import {
  SIGNED_LICENSE_TOKEN_PREFIX,
  isSignedLicenseToken,
  parseSignedLicenseToken,
  signedLicenseKeysFromEnv,
  type SignedLicenseTokenPayload,
} from '../src/routers/signedLicenseToken.js';

function makeKeyPair(): { privateKey: KeyObject; publicKeyPem: string } {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return {
    privateKey,
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  };
}

function makeSignedToken(payload: SignedLicenseTokenPayload, privateKey: KeyObject): string {
  const canonical = Buffer.from(canonicalLicensePayload(payload), 'utf8');
  const sig = cryptoSign(null, canonical, privateKey);
  const payloadEncoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sigEncoded = sig.toString('base64url');
  return `${SIGNED_LICENSE_TOKEN_PREFIX}${payloadEncoded}.${sigEncoded}`;
}

test('signed license token is recognized by prefix and verifies with the matching key', () => {
  const { privateKey, publicKeyPem } = makeKeyPair();
  const payload: SignedLicenseTokenPayload = {
    licenseId: 'lic-001',
    tier: 'pro',
    plan: 'pro',
    publicKeyId: 'k1',
    issuedAt: '2026-01-01T00:00:00.000Z',
    expiresAt: '2027-01-01T00:00:00.000Z',
  };
  const token = makeSignedToken(payload, privateKey);
  const keys = new Map([['k1', publicKeyPem]]);

  assert.equal(isSignedLicenseToken(token), true);
  const license = parseSignedLicenseToken(token, keys, new Date('2026-06-01T00:00:00.000Z'));
  assert.equal(license.tier, 'pro');
  assert.equal(license.plan, 'pro');
  assert.equal(license.valid, true);
  assert.equal(license.expiresAt, payload.expiresAt);
  assert.equal(license.features.roundTripSync, true);
  assert.equal(license.features.mcpBridge, true);
});

test('signed license token rejects a token signed with a different key', () => {
  const real = makeKeyPair();
  const decoy = makeKeyPair();
  const payload: SignedLicenseTokenPayload = {
    licenseId: 'lic-002',
    tier: 'studio',
    plan: 'enterprise',
    publicKeyId: 'k1',
    issuedAt: '2026-01-01T00:00:00.000Z',
    expiresAt: '2027-01-01T00:00:00.000Z',
  };
  const token = makeSignedToken(payload, decoy.privateKey);
  const keys = new Map([['k1', real.publicKeyPem]]);

  assert.throws(
    () => parseSignedLicenseToken(token, keys, new Date('2026-06-01T00:00:00.000Z')),
    /signed_license_bad_signature/u,
  );
});

test('signed license token rejects an expired token', () => {
  const { privateKey, publicKeyPem } = makeKeyPair();
  const payload: SignedLicenseTokenPayload = {
    licenseId: 'lic-003',
    tier: 'indie',
    plan: 'indie',
    publicKeyId: 'k1',
    issuedAt: '2025-01-01T00:00:00.000Z',
    expiresAt: '2025-12-31T00:00:00.000Z',
  };
  const token = makeSignedToken(payload, privateKey);
  const keys = new Map([['k1', publicKeyPem]]);

  assert.throws(
    () => parseSignedLicenseToken(token, keys, new Date('2026-06-01T00:00:00.000Z')),
    /signed_license_expired/u,
  );
});

test('signed license token rejects when keyId is unknown to the registry', () => {
  const { privateKey, publicKeyPem } = makeKeyPair();
  const payload: SignedLicenseTokenPayload = {
    licenseId: 'lic-004',
    tier: 'pro',
    plan: 'pro',
    publicKeyId: 'k-rotated-out',
    issuedAt: '2026-01-01T00:00:00.000Z',
    expiresAt: '2027-01-01T00:00:00.000Z',
  };
  const token = makeSignedToken(payload, privateKey);
  const keys = new Map([['k1-current', publicKeyPem]]);

  assert.throws(
    () => parseSignedLicenseToken(token, keys, new Date('2026-06-01T00:00:00.000Z')),
    /signed_license_unknown_key/u,
  );
});

test('signed license token supports key rotation by accepting multiple registered keyIds', () => {
  const previous = makeKeyPair();
  const current = makeKeyPair();
  const payloadOld: SignedLicenseTokenPayload = {
    licenseId: 'lic-old',
    tier: 'pro',
    plan: 'pro',
    publicKeyId: 'k1',
    issuedAt: '2026-01-01T00:00:00.000Z',
    expiresAt: '2027-01-01T00:00:00.000Z',
  };
  const payloadNew: SignedLicenseTokenPayload = {
    licenseId: 'lic-new',
    tier: 'studio',
    plan: 'enterprise',
    publicKeyId: 'k2',
    issuedAt: '2026-03-01T00:00:00.000Z',
    expiresAt: '2027-03-01T00:00:00.000Z',
  };
  const tokenOld = makeSignedToken(payloadOld, previous.privateKey);
  const tokenNew = makeSignedToken(payloadNew, current.privateKey);
  const keys = new Map([
    ['k1', previous.publicKeyPem],
    ['k2', current.publicKeyPem],
  ]);
  const now = new Date('2026-06-01T00:00:00.000Z');

  assert.equal(parseSignedLicenseToken(tokenOld, keys, now).tier, 'pro');
  assert.equal(parseSignedLicenseToken(tokenNew, keys, now).tier, 'studio');
});

test('signed license token rejects tampered payload', () => {
  const { privateKey, publicKeyPem } = makeKeyPair();
  const payload: SignedLicenseTokenPayload = {
    licenseId: 'lic-005',
    tier: 'indie',
    plan: 'indie',
    publicKeyId: 'k1',
    issuedAt: '2026-01-01T00:00:00.000Z',
    expiresAt: '2027-01-01T00:00:00.000Z',
  };
  const token = makeSignedToken(payload, privateKey);
  const tampered = (() => {
    const remainder = token.slice(SIGNED_LICENSE_TOKEN_PREFIX.length);
    const sigPart = remainder.split('.')[1];
    const upgraded: SignedLicenseTokenPayload = { ...payload, tier: 'studio', plan: 'enterprise' };
    const newPayload = Buffer.from(JSON.stringify(upgraded), 'utf8').toString('base64url');
    return `${SIGNED_LICENSE_TOKEN_PREFIX}${newPayload}.${sigPart}`;
  })();
  const keys = new Map([['k1', publicKeyPem]]);

  assert.throws(
    () => parseSignedLicenseToken(tampered, keys, new Date('2026-06-01T00:00:00.000Z')),
    /signed_license_bad_signature/u,
  );
});

test('signed license token rejects mismatched tier and plan claims', () => {
  const { privateKey, publicKeyPem } = makeKeyPair();
  const payload: SignedLicenseTokenPayload = {
    licenseId: 'lic-plan-mismatch',
    tier: 'indie',
    plan: 'enterprise',
    publicKeyId: 'k1',
    issuedAt: '2026-01-01T00:00:00.000Z',
    expiresAt: '2027-01-01T00:00:00.000Z',
  };
  const token = makeSignedToken(payload, privateKey);

  assert.throws(
    () => parseSignedLicenseToken(token, new Map([['k1', publicKeyPem]]), new Date('2026-06-01T00:00:00.000Z')),
    /signed_license_plan_tier_mismatch/u,
  );
});

test('validateLicenseToken dispatches to the signed path when token has gbxv2 prefix', () => {
  const { privateKey, publicKeyPem } = makeKeyPair();
  const payload: SignedLicenseTokenPayload = {
    licenseId: 'lic-dispatch-1',
    tier: 'pro',
    plan: 'pro',
    publicKeyId: 'k1',
    issuedAt: '2026-01-01T00:00:00.000Z',
    expiresAt: '2027-01-01T00:00:00.000Z',
  };
  const token = makeSignedToken(payload, privateKey);

  const license = validateLicenseToken(token, {
    signingKeys: new Map([['k1', publicKeyPem]]),
    now: new Date('2026-06-01T00:00:00.000Z'),
  });
  assert.equal(license.tier, 'pro');
  assert.equal(license.features.roundTripSync, true);
});

test('validateLicenseToken fails closed for prefix tokens when signing keys are configured', () => {
  const { publicKeyPem } = makeKeyPair();

  assert.throws(
    () => validateLicenseToken('gbx_pro_random_123', {
      signingKeys: new Map([['k1', publicKeyPem]]),
    }),
    /invalid_license/u,
  );
});

test('signed license keys are parsed from environment JSON, ignoring malformed entries', () => {
  const { publicKeyPem } = makeKeyPair();
  const keys = signedLicenseKeysFromEnv({
    GREYBOX_LICENSE_SIGNING_KEYS_JSON: JSON.stringify([
      { keyId: 'k1', publicKeyPem },
      { keyId: 'bad key id with spaces', publicKeyPem },
      { keyId: 'k2', publicKeyPem: 'not-a-pem' },
      { keyId: '', publicKeyPem },
    ]),
  });

  assert.equal(keys.size, 1);
  assert.equal(keys.get('k1'), publicKeyPem.trim());
});

test('signed license token rejects malformed encoding', () => {
  const { publicKeyPem } = makeKeyPair();
  const keys = new Map([['k1', publicKeyPem]]);

  assert.throws(
    () => parseSignedLicenseToken(`${SIGNED_LICENSE_TOKEN_PREFIX}not-base64.also-not`, keys),
    /bad_signed_license_/u,
  );
});
