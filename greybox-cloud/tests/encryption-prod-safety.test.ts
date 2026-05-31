// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import test from 'node:test';
import { requiredEncryptionDatasets } from '../src/enterprise/encryptionReadiness.js';
import {
  HostedProductionEncryptionError,
  assertHostedProductionEncryption,
  unverifiedEncryptionExplicitlyAllowed,
} from '../src/security/encryptionProdSafety.js';
import { createGreyboxCloudServer } from '../src/server.js';

function readyHostedEnv(): Record<string, string> {
  const regions = ['us', 'eu', 'in'];
  return {
    NODE_ENV: 'production',
    GREYBOX_ENCRYPTION_EVIDENCE_JSON: JSON.stringify({
      kmsProvider: 'aws-kms',
      customerManagedKeys: false,
      keyRotationDays: 90,
      regions: {
        us: { keyConfigured: true, sourceHash: 'a'.repeat(64), lastVerifiedAt: '2026-05-20T00:00:00.000Z' },
        eu: { keyConfigured: true, sourceHash: 'b'.repeat(64), lastVerifiedAt: '2026-05-20T00:00:00.000Z' },
        in: { keyConfigured: true, sourceHash: 'c'.repeat(64), lastVerifiedAt: '2026-05-20T00:00:00.000Z' },
      },
      storage: requiredEncryptionDatasets.map((dataset) => ({
        dataset,
        encrypted: true,
        regions,
        algorithm: 'aes-256-gcm',
        lastVerifiedAt: '2026-05-20T00:00:00.000Z',
      })),
      transit: {
        tlsMinVersion: '1.3',
        hstsEnabled: true,
        lastVerifiedAt: '2026-05-20T00:00:00.000Z',
      },
      backups: {
        encrypted: true,
        regions,
        lastVerifiedAt: '2026-05-20T00:00:00.000Z',
      },
      secrets: {
        manager: 'aws-secrets-manager',
        rotationDays: 90,
        lastVerifiedAt: '2026-05-20T00:00:00.000Z',
      },
    }),
  };
}

function warningHostedEnv(): Record<string, string> {
  const ready = readyHostedEnv();
  const evidence = JSON.parse(ready.GREYBOX_ENCRYPTION_EVIDENCE_JSON);
  evidence.keyRotationDays = 400;
  return {
    ...ready,
    GREYBOX_ENCRYPTION_EVIDENCE_JSON: JSON.stringify(evidence),
  };
}

function validBreakGlassEnv(): Record<string, string> {
  return {
    GREYBOX_CLOUD_ALLOW_UNVERIFIED_ENCRYPTION: '1',
    GREYBOX_CLOUD_ALLOW_UNVERIFIED_ENCRYPTION_REASON: 'Incident INC-1234 KMS evidence outage',
    GREYBOX_CLOUD_ALLOW_UNVERIFIED_ENCRYPTION_EXPIRES_AT: '2026-05-23T12:00:00.000Z',
    GREYBOX_CLOUD_ALLOW_UNVERIFIED_ENCRYPTION_NOW: '2026-05-23T00:00:00.000Z',
  };
}

test('hosted production encryption guard accepts verified encryption evidence', () => {
  assert.doesNotThrow(() => assertHostedProductionEncryption({
    env: readyHostedEnv(),
    now: new Date('2026-05-20T00:00:00.000Z'),
  }));
});

test('hosted production encryption guard rejects missing KMS and storage evidence', () => {
  assert.throws(
    () => assertHostedProductionEncryption({ env: { NODE_ENV: 'production' } }),
    (error) => {
      assert.ok(error instanceof HostedProductionEncryptionError);
      assert.equal(error.code, 'hosted_production_encryption_not_verified');
      assert.equal(error.report.summary.status, 'fail');
      assert.deepEqual(error.unsafeChecks.map((check) => check.id), [
        'encryption-evidence-configured',
        'kms-key-management',
        'regional-kms-coverage',
        'storage-encryption',
        'transit-encryption',
        'backup-encryption',
        'secret-management',
      ]);
      assert.match(error.message, /encryption-evidence-configured=fail/u);
      assert.match(error.message, /backup-encryption=warn/u);
      assert.doesNotMatch(error.message, /GREYBOX_ENCRYPTION_EVIDENCE_JSON=\{/u);
      return true;
    },
  );
});

test('hosted production encryption guard rejects readiness warnings', () => {
  assert.throws(
    () => assertHostedProductionEncryption({
      env: warningHostedEnv(),
      now: new Date('2026-05-20T00:00:00.000Z'),
    }),
    (error) => {
      assert.ok(error instanceof HostedProductionEncryptionError);
      assert.equal(error.report.summary.status, 'warn');
      assert.deepEqual(error.unsafeChecks.map((check) => check.id), ['kms-key-management']);
      assert.match(error.message, /Encryption status=warn/u);
      return true;
    },
  );
});

test('hosted production encryption guard is disabled for local, on-prem, and explicit break-glass', () => {
  assert.doesNotThrow(() => assertHostedProductionEncryption({
    env: { NODE_ENV: 'development' },
  }));
  assert.doesNotThrow(() => assertHostedProductionEncryption({
    env: { NODE_ENV: 'production', GREYBOX_DEPLOYMENT_MODE: 'on-prem' },
  }));
  assert.doesNotThrow(() => assertHostedProductionEncryption({
    env: {
      NODE_ENV: 'production',
      ...validBreakGlassEnv(),
    },
  }));
});

test('encryption break-glass must be exact, reasoned, and time-bound', () => {
  assert.equal(unverifiedEncryptionExplicitlyAllowed(validBreakGlassEnv()), true);
  assert.equal(unverifiedEncryptionExplicitlyAllowed({ GREYBOX_CLOUD_ALLOW_UNVERIFIED_ENCRYPTION: '1' }), false);
  assert.equal(unverifiedEncryptionExplicitlyAllowed({ GREYBOX_CLOUD_ALLOW_UNVERIFIED_ENCRYPTION: 'true' }), false);
  assert.equal(unverifiedEncryptionExplicitlyAllowed({ GREYBOX_CLOUD_ALLOW_UNVERIFIED_ENCRYPTION: ' 1 ' }), false);
  assert.equal(unverifiedEncryptionExplicitlyAllowed({
    ...validBreakGlassEnv(),
    GREYBOX_CLOUD_ALLOW_UNVERIFIED_ENCRYPTION_REASON: 'test',
  }), false);
  assert.equal(unverifiedEncryptionExplicitlyAllowed({
    ...validBreakGlassEnv(),
    GREYBOX_CLOUD_ALLOW_UNVERIFIED_ENCRYPTION_EXPIRES_AT: '2026-05-25T00:00:00.000Z',
  }), false);
});

test('server boot wires the hosted production encryption guard', () => {
  assert.throws(
    () => createGreyboxCloudServer({
      encryptionEnv: { NODE_ENV: 'production' },
    }),
    HostedProductionEncryptionError,
  );
  const server = createGreyboxCloudServer({
    encryptionEnv: readyHostedEnv(),
  });
  assert.ok(server);
});
