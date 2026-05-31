// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import type http from 'node:http';
import test from 'node:test';
import {
  buildEncryptionReadinessReport,
  encryptionEvidenceFromEnv,
  requiredEncryptionDatasets,
} from '../src/enterprise/encryptionReadiness.js';
import { buildSecurityQuestionnaireReport } from '../src/enterprise/securityQuestionnaire.js';
import { createGreyboxCloudServer } from '../src/server.js';

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

function readyEnv(): Record<string, string> {
  return {
    GREYBOX_ENCRYPTION_EVIDENCE_JSON: JSON.stringify({
      kmsProvider: 'aws-kms',
      customerManagedKeys: true,
      keyRotationDays: 90,
      regions: {
        us: { keyConfigured: true, sourceHash: 'a'.repeat(64), lastVerifiedAt: '2026-05-18T00:00:00.000Z', rawKeyId: 'do-not-return' },
        eu: { keyConfigured: true, sourceHash: 'b'.repeat(64), lastVerifiedAt: '2026-05-18T00:00:00.000Z' },
        in: { keyConfigured: true, sourceHash: 'c'.repeat(64), lastVerifiedAt: '2026-05-18T00:00:00.000Z' },
      },
      storage: requiredEncryptionDatasets.map((dataset) => ({
        dataset,
        encrypted: true,
        regions: ['us', 'eu', 'in'],
        algorithm: 'AES-256-GCM',
        lastVerifiedAt: '2026-05-18T00:00:00.000Z',
        keyMaterial: 'do-not-return',
      })),
      transit: {
        tlsMinVersion: '1.3',
        hstsEnabled: true,
        lastVerifiedAt: '2026-05-18T00:00:00.000Z',
      },
      backups: {
        encrypted: true,
        regions: ['us', 'eu', 'in'],
        lastVerifiedAt: '2026-05-18T00:00:00.000Z',
      },
      secrets: {
        manager: 'aws-secrets-manager',
        rotationDays: 90,
        lastVerifiedAt: '2026-05-18T00:00:00.000Z',
        secret: 'do-not-return',
      },
    }),
  };
}

test('encryption readiness passes with KMS, storage, TLS, backup, and secret evidence', () => {
  const report = buildEncryptionReadinessReport({
    env: readyEnv(),
    now: new Date('2026-05-18T00:00:00.000Z'),
  });

  assert.equal(report.generatedAt, '2026-05-18T00:00:00.000Z');
  assert.equal(report.summary.status, 'pass');
  assert.equal(report.summary.kmsProvider, 'aws-kms');
  assert.equal(report.summary.regionsWithKeys, 3);
  assert.equal(report.summary.regionsWithKmsExportProof, 3);
  assert.equal(report.summary.kmsExportEvidenceReady, true);
  assert.equal(report.summary.encryptedDatasets, requiredEncryptionDatasets.length);
  assert.deepEqual(report.summary.missingDatasets, []);
  assert.equal(report.summary.tlsReady, true);
  assert.equal(report.summary.backupsEncrypted, true);
  assert.equal(report.summary.secretManagerConfigured, true);
});

test('encryption readiness fails closed without valid production evidence', () => {
  const missing = buildEncryptionReadinessReport();
  assert.equal(missing.summary.status, 'fail');
  assert.equal(missing.checks.find((check) => check.id === 'encryption-evidence-configured')?.status, 'fail');

  const invalid = buildEncryptionReadinessReport({
    env: { GREYBOX_ENCRYPTION_EVIDENCE_JSON: '{nope' },
  });
  assert.equal(invalid.summary.status, 'fail');

  const partial = buildEncryptionReadinessReport({
    env: {
      GREYBOX_ENCRYPTION_EVIDENCE_JSON: JSON.stringify({
        kmsProvider: 'aws-kms',
        keyRotationDays: 400,
        regions: { us: { keyConfigured: true, sourceHash: 'd'.repeat(64) } },
        storage: [{
          dataset: 'audit-log',
          encrypted: true,
          regions: ['us'],
          algorithm: 'AES-256-GCM',
        }],
        transit: { tlsMinVersion: '1.1', hstsEnabled: false },
        backups: { encrypted: false, regions: ['us'] },
        secrets: { manager: 'aws-secrets-manager', rotationDays: 500 },
      }),
    },
  });
  assert.equal(partial.summary.status, 'fail');
  assert.ok(partial.summary.missingDatasets.includes('billing-ledger'));
  assert.equal(partial.summary.regionsWithKeys, 1);
  assert.equal(partial.summary.regionsWithKmsExportProof, 1);
});

test('encryption evidence parser sanitizes key material and ignores unknown datasets', () => {
  assert.equal(encryptionEvidenceFromEnv({ GREYBOX_ENCRYPTION_EVIDENCE_JSON: 'nope' }), undefined);
  const evidence = encryptionEvidenceFromEnv({
    GREYBOX_ENCRYPTION_EVIDENCE_JSON: JSON.stringify({
      kmsProvider: 'hashicorp-vault',
      customerManagedKeys: true,
      keyRotationDays: 120,
      regions: {
        us: {
          keyConfigured: true,
          sourceHash: 'e'.repeat(64),
          lastVerifiedAt: '2026-05-18T00:00:00.000Z',
          rawKeyId: 'kms-key-123',
        },
      },
      storage: [
        {
          dataset: 'audit-log',
          encrypted: true,
          regions: ['us', 'unknown'],
          algorithm: 'managed-kms',
          keyMaterial: 'secret-key-material',
        },
        {
          dataset: 'not-a-dataset',
          encrypted: true,
          regions: ['us'],
          algorithm: 'AES-256-GCM',
        },
      ],
      secrets: { manager: 'hashicorp-vault', rotationDays: 90, secret: 'do-not-return' },
    }),
  });

  assert.ok(evidence);
  assert.equal(evidence.regions.find((region) => region.region === 'us')?.keyConfigured, true);
  assert.equal(evidence.regions.find((region) => region.region === 'us')?.sourceHash, 'e'.repeat(64));
  assert.deepEqual(evidence.storage, [{
    dataset: 'audit-log',
    encrypted: true,
    regions: ['us'],
    algorithm: 'managed-kms',
  }]);
  assert.doesNotMatch(JSON.stringify(evidence), /kms-key-123|secret-key-material|do-not-return/u);
});

test('encryption readiness blocks bare key flags without sanitized KMS export hashes', () => {
  const regions = ['us', 'eu', 'in'];
  const report = buildEncryptionReadinessReport({
    env: {
      GREYBOX_ENCRYPTION_EVIDENCE_JSON: JSON.stringify({
        kmsProvider: 'aws-kms',
        customerManagedKeys: true,
        keyRotationDays: 90,
        regions: {
          us: { keyConfigured: true },
          eu: { keyConfigured: true },
          in: { keyConfigured: true, sourceHash: 'not-a-sha' },
        },
        storage: requiredEncryptionDatasets.map((dataset) => ({
          dataset,
          encrypted: true,
          regions,
          algorithm: 'AES-256-GCM',
        })),
        transit: { tlsMinVersion: '1.3', hstsEnabled: true },
        backups: { encrypted: true, regions },
        secrets: { manager: 'aws-secrets-manager', rotationDays: 90 },
      }),
    },
  });

  assert.equal(report.summary.status, 'fail');
  assert.equal(report.summary.regionsWithKeys, 3);
  assert.equal(report.summary.regionsWithKmsExportProof, 0);
  assert.equal(report.summary.kmsExportEvidenceReady, false);
  assert.ok(report.checks.some((check) => (
    check.id === 'regional-kms-coverage'
    && check.status === 'fail'
    && check.detail.includes('sanitized KMS export proof')
  )));
});

test('encryption readiness endpoint is admin protected and sanitized', async () => {
  await withServer({
    auditAdminToken: 'encryption-admin-0123456789abcdef',
    encryptionEnv: readyEnv(),
  }, async (baseUrl) => {
    const denied = await fetch(`${baseUrl}/v1/enterprise/encryption-readiness`);
    assert.equal(denied.status, 401);

    const response = await fetch(`${baseUrl}/v1/enterprise/encryption-readiness`, {
      headers: { authorization: 'Bearer encryption-admin-0123456789abcdef' },
    });
    assert.equal(response.status, 200);
    const report = await response.json() as { summary: { status: string }; evidence: unknown };
    assert.equal(report.summary.status, 'pass');
    assert.doesNotMatch(JSON.stringify(report), /encryption-admin|do-not-return|keyMaterial|rawKeyId/u);
  });
});

test('security questionnaire upgrades encryption answer when readiness passes', async () => {
  const report = await buildSecurityQuestionnaireReport({
    encryptionEnv: readyEnv(),
    now: new Date('2026-05-18T00:00:00.000Z'),
  });
  const answer = report.answers.find((item) => item.id === 'encryption-production');
  assert.equal(answer?.status, 'ready');
  assert.match(answer?.answer ?? '', /Yes\./u);
  assert.match(answer?.evidence.join(' '), /encryption-readiness/u);
});
