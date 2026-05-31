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
import { createGreyboxCloudServer } from '../src/server.js';

const payload: OfflineLicensePayload = {
  licenseId: 'lic_onprem_123',
  tenantId: 'tenant_onprem_123',
  customerName: 'On-Prem Studio',
  plan: 'enterprise',
  deployment: 'on-prem',
  seats: 25,
  features: ['managed-inference', 'scim', 'audit-log', 'round-trip-sync'],
  regions: ['offline'],
  issuedAt: '2026-05-01T00:00:00.000Z',
  expiresAt: '2099-05-01T00:00:00.000Z',
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

test('on-prem readiness endpoint validates license, durable stores, and rotated secrets', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-onprem-ready-'));
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
      GREYBOX_AUDIT_ADMIN_TOKEN: 'audit-admin-0123456789abcdef',
      GREYBOX_AUDIT_SEAL_KEY: 'audit-seal-0123456789abcdef',
      GREYBOX_SCIM_TOKEN: 'scim-admin-0123456789abcdef',
      GREYBOX_DPO_NAME: 'Greybox Privacy Lead',
      GREYBOX_DPO_EMAIL: 'privacy@greybox.studio',
      GREYBOX_DPO_APPOINTED_AT: '2026-05-17T00:00:00.000Z',
      ANTHROPIC_API_KEY: 'anthropic-configured',
    };

    await withServer({
      auditAdminToken: 'audit-admin-0123456789abcdef',
      onPremReadiness: {
        env,
        now: new Date('2026-05-17T00:00:00.000Z'),
      },
    }, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/v1/enterprise/onprem-readiness`, {
        headers: { authorization: 'Bearer audit-admin-0123456789abcdef' },
      });
      assert.equal(response.status, 200);
      const report = await response.json() as {
        ready: boolean;
        summary: { failed: number; warnings: number };
        license: { tenantId: string; customerName: string; daysUntilExpiry: number };
        checks: Array<{ id: string; status: string }>;
      };
      assert.equal(report.ready, true);
      assert.equal(report.summary.failed, 0);
      assert.equal(report.license.tenantId, 'tenant_onprem_123');
      assert.equal(report.license.customerName, 'On-Prem Studio');
      assert.ok(report.license.daysUntilExpiry > 1_000);
      assert.equal(report.checks.find((check) => check.id === 'greybox_billing_ledger_dir')?.status, 'pass');
      assert.equal(report.checks.find((check) => check.id === 'greybox_security_incident_dir')?.status, 'pass');
      assert.equal(report.checks.find((check) => check.id === 'greybox_model_training_consent_dir')?.status, 'pass');
      assert.equal(report.checks.find((check) => check.id === 'greybox_legal_hold_dir')?.status, 'pass');
      assert.equal(report.checks.find((check) => check.id === 'greybox_dpo_appointment')?.status, 'pass');
      assert.equal(report.checks.find((check) => check.id === 'managed_inference_egress')?.status, 'pass');

      const serialized = JSON.stringify(report);
      assert.doesNotMatch(serialized, /audit-admin-0123456789abcdef/u);
      assert.doesNotMatch(serialized, /audit-seal-0123456789abcdef/u);
      assert.doesNotMatch(serialized, /billing-admin-0123456789abcdef/u);
      assert.doesNotMatch(serialized, /scim-admin-0123456789abcdef/u);
      assert.doesNotMatch(serialized, /anthropic-configured/u);
      assert.doesNotMatch(serialized, /signature/u);
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('on-prem readiness endpoint is admin protected', async () => {
  await withServer({
    auditAdminToken: 'audit-admin-0123456789abcdef',
    onPremReadiness: { env: {}, probeWrites: false },
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/enterprise/onprem-readiness`);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: 'audit_admin_required' });
  });
});

test('on-prem readiness endpoint fails closed for missing license and placeholder secrets', async () => {
  await withServer({
    auditAdminToken: 'audit-admin-0123456789abcdef',
    onPremReadiness: {
      env: {
        GREYBOX_BILLING_ADMIN_TOKEN: 'replace-with-long-random-token',
        GREYBOX_AUDIT_ADMIN_TOKEN: 'replace-with-long-random-token',
        GREYBOX_AUDIT_SEAL_KEY: 'replace-with-long-random-token',
        GREYBOX_SCIM_TOKEN: 'replace-with-long-random-token',
      },
      probeWrites: false,
    },
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/enterprise/onprem-readiness`, {
      headers: { authorization: 'Bearer audit-admin-0123456789abcdef' },
    });
    assert.equal(response.status, 503);
    const report = await response.json() as {
      ready: boolean;
      summary: { failed: number };
      checks: Array<{ id: string; status: string; detail: string }>;
    };
    assert.equal(report.ready, false);
    assert.ok(report.summary.failed >= 4);
    assert.equal(report.checks.find((check) => check.id === 'offline-license')?.status, 'fail');
    assert.equal(report.checks.find((check) => check.id === 'greybox_scim_token')?.status, 'fail');
    assert.doesNotMatch(JSON.stringify(report), /replace-with-long-random-token/u);
  });
});

test('on-prem readiness treats Bedrock as configured only when region and credentials are present', async () => {
  await withServer({
    auditAdminToken: 'audit-admin-0123456789abcdef',
    onPremReadiness: {
      env: {
        AWS_REGION: 'us-east-1',
      },
      probeWrites: false,
    },
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/enterprise/onprem-readiness`, {
      headers: { authorization: 'Bearer audit-admin-0123456789abcdef' },
    });
    assert.equal(response.status, 503);
    const report = await response.json() as {
      checks: Array<{ id: string; status: string; detail: string }>;
    };
    const egress = report.checks.find((check) => check.id === 'managed_inference_egress');
    assert.equal(egress?.status, 'warn');
    assert.match(egress?.detail ?? '', /No managed inference provider/u);
  });

  await withServer({
    auditAdminToken: 'audit-admin-0123456789abcdef',
    onPremReadiness: {
      env: {
        AWS_REGION: 'us-east-1',
        AWS_ACCESS_KEY_ID: 'AKIAONPREMTEST',
        AWS_SECRET_ACCESS_KEY: 'bedrock-secret-do-not-leak',
      },
      probeWrites: false,
    },
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/enterprise/onprem-readiness`, {
      headers: { authorization: 'Bearer audit-admin-0123456789abcdef' },
    });
    assert.equal(response.status, 503);
    const report = await response.json() as {
      checks: Array<{ id: string; status: string }>;
    };
    assert.equal(report.checks.find((check) => check.id === 'managed_inference_egress')?.status, 'pass');
    assert.doesNotMatch(JSON.stringify(report), /bedrock-secret-do-not-leak/u);
  });
});
