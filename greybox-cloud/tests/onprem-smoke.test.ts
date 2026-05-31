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
  type OfflineLicenseFile,
  type OfflineLicensePayload,
} from '../src/enterprise/offlineLicense.js';
import { runOnPremSmoke } from '../src/enterprise/onPremSmoke.js';
import { createGreyboxCloudServer } from '../src/server.js';

const readyToken = 'audit-admin-0123456789abcdef';
const payload: OfflineLicensePayload = {
  licenseId: 'lic_smoke_123',
  tenantId: 'tenant_smoke_123',
  customerName: 'Smoke Test Studio',
  plan: 'enterprise',
  deployment: 'on-prem',
  seats: 25,
  features: ['managed-inference', 'scim', 'audit-log', 'round-trip-sync'],
  regions: ['offline'],
  issuedAt: '2026-05-01T00:00:00.000Z',
  expiresAt: '2099-05-01T00:00:00.000Z',
};

function signedLicense() {
  const keys = generateKeyPairSync('ed25519');
  const signature = sign(null, Buffer.from(canonicalLicensePayload(payload), 'utf8'), keys.privateKey).toString('base64');
  return {
    publicKeyPem: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    license: {
      algorithm: 'ed25519',
      payload,
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

test('on-prem smoke runner validates the live bundle without leaking secrets', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-onprem-smoke-'));
  try {
    const { license, publicKeyPem } = signedLicense();
    const licensePath = path.join(dir, 'license.greybox.json');
    const publicKeyPath = path.join(dir, 'greybox-license-public.pem');
    await writeFile(licensePath, `${JSON.stringify(license, null, 2)}\n`, 'utf8');
    await writeFile(publicKeyPath, publicKeyPem, 'utf8');

    const env = {
      GREYBOX_DEPLOYMENT_MODE: 'on-prem',
      GREYBOX_OFFLINE_LICENSE_FILE: licensePath,
      GREYBOX_OFFLINE_LICENSE_PUBLIC_KEY_FILE: publicKeyPath,
      GREYBOX_BILLING_LEDGER_DIR: path.join(dir, 'billing-ledger'),
      GREYBOX_AUDIT_LOG_DIR: path.join(dir, 'audit-log'),
      GREYBOX_SCIM_STORE_DIR: path.join(dir, 'scim'),
      GREYBOX_PRIVACY_REQUEST_DIR: path.join(dir, 'privacy-requests'),
      GREYBOX_SECURITY_INCIDENT_DIR: path.join(dir, 'security-incidents'),
      GREYBOX_MODEL_TRAINING_CONSENT_DIR: path.join(dir, 'model-training-consents'),
      GREYBOX_LEGAL_HOLD_DIR: path.join(dir, 'legal-holds'),
      GREYBOX_BILLING_ADMIN_TOKEN: 'billing-admin-0123456789abcdef',
      GREYBOX_AUDIT_ADMIN_TOKEN: readyToken,
      GREYBOX_AUDIT_SEAL_KEY: 'audit-seal-0123456789abcdef',
      GREYBOX_SCIM_TOKEN: 'scim-admin-0123456789abcdef',
      GREYBOX_DPO_NAME: 'Greybox Privacy Lead',
      GREYBOX_DPO_EMAIL: 'privacy@greybox.studio',
      GREYBOX_DPO_APPOINTED_AT: '2026-05-17T00:00:00.000Z',
      OPENAI_API_KEY: 'openai-configured-secret',
    };

    await withServer({
      auditAdminToken: readyToken,
      offlineLicensePath: licensePath,
      offlineLicensePublicKeyPath: publicKeyPath,
      onPremReadiness: {
        env,
        now: new Date('2026-05-17T00:00:00.000Z'),
      },
    }, async (baseUrl) => {
      const report = await runOnPremSmoke({
        baseUrl,
        auditAdminToken: readyToken,
        now: new Date('2026-05-17T00:00:00.000Z'),
        secretSamples: [
          env.GREYBOX_BILLING_ADMIN_TOKEN,
          env.GREYBOX_AUDIT_SEAL_KEY,
          env.GREYBOX_SCIM_TOKEN,
          env.OPENAI_API_KEY,
        ],
      });

      assert.equal(report.ok, true);
      assert.equal(report.license?.tenantId, 'tenant_smoke_123');
      assert.equal(report.readinessSummary?.failed, 0);
      assert.deepEqual(report.steps.map((step) => [step.id, step.status]), [
        ['offline-license', 'pass'],
        ['readiness-admin-gate', 'pass'],
        ['onprem-readiness', 'pass'],
        ['no-secret-leak', 'pass'],
      ]);
      const serialized = JSON.stringify(report);
      assert.doesNotMatch(serialized, /audit-admin-0123456789abcdef/u);
      assert.doesNotMatch(serialized, /audit-seal-0123456789abcdef/u);
      assert.doesNotMatch(serialized, /billing-admin-0123456789abcdef/u);
      assert.doesNotMatch(serialized, /openai-configured-secret/u);
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('on-prem smoke runner fails closed when readiness is not green', async () => {
  await withServer({
    auditAdminToken: readyToken,
    onPremReadiness: {
      env: {
        GREYBOX_BILLING_ADMIN_TOKEN: readyToken,
        GREYBOX_AUDIT_ADMIN_TOKEN: readyToken,
        GREYBOX_SCIM_TOKEN: readyToken,
      },
      probeWrites: false,
      now: new Date('2026-05-17T00:00:00.000Z'),
    },
  }, async (baseUrl) => {
    const report = await runOnPremSmoke({
      baseUrl,
      auditAdminToken: readyToken,
      now: new Date('2026-05-17T00:00:00.000Z'),
    });

    assert.equal(report.ok, false);
    assert.equal(report.steps.find((step) => step.id === 'offline-license')?.status, 'fail');
    assert.equal(report.steps.find((step) => step.id === 'onprem-readiness')?.status, 'fail');
    assert.equal(report.steps.find((step) => step.id === 'readiness-admin-gate')?.status, 'pass');
  });
});
