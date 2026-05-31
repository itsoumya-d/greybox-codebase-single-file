// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import type http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { FileAuditLog } from '../src/enterprise/auditLog.js';
import {
  licenseHash,
  licenseRecordsFromEnv,
  validateLicenseToken,
  type LicenseRecord,
  type LicenseRecordStore,
} from '../src/routers/licenses.js';
import { createGreyboxCloudServer } from '../src/server.js';

async function withServer<T>(
  run: (baseUrl: string, server: http.Server) => Promise<T>,
  options: Parameters<typeof createGreyboxCloudServer>[0] = {},
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

test('license validation returns Pro capabilities without echoing the key', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/licenses/validate`, {
      method: 'POST',
      headers: { authorization: 'Bearer gbx_pro_test_123' },
    });

    assert.equal(response.status, 200);
    const json = await response.json() as {
      valid: boolean;
      tier: string;
      plan: string;
      licenseHash: string;
      features: {
        import: boolean;
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
    };
    assert.equal(json.valid, true);
    assert.equal(json.tier, 'pro');
    assert.equal(json.plan, 'pro');
    assert.equal(json.licenseHash.length, 16);
    assert.notEqual(json.licenseHash, 'gbx_pro_test_123');
    assert.deepEqual(json.features, {
      import: true,
      roundTripSync: true,
      mcpBridge: true,
      watermark: false,
      maxProjects: null,
      priorityQueue: true,
      sso: false,
      customSkillPacks: false,
      seatLimit: 1,
      siteLicense: false,
    });
  });
});

test('license validation records a sanitized audit entry without the raw key', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-license-audit-'));
  try {
    const auditLog = new FileAuditLog(dir);
    await withServer(async (baseUrl) => {
      const token = 'gbx_pro_entitlement_audit_123';
      const response = await fetch(`${baseUrl}/v1/licenses/validate`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'user-agent': 'UnityEditor/2022.3 GreyboxStudio',
          'x-request-id': 'req_license-audit-123',
        },
      });

      assert.equal(response.status, 200);
      assert.equal(response.headers.get('x-request-id'), 'req_license-audit-123');
      const license = await response.json() as { licenseHash: string };
      const [entry] = await auditLog.readEntries({ action: 'license.validated' });
      assert.equal(entry?.tenantId, `license:${license.licenseHash}`);
      assert.equal(entry?.actorId, `license:${license.licenseHash}`);
      assert.equal(entry?.targetType, 'license');
      assert.equal(entry?.targetId, license.licenseHash);
      assert.equal((entry?.metadata as { route?: string } | undefined)?.route, '/v1/licenses/validate');
      assert.equal((entry?.metadata as { roundTripSync?: boolean } | undefined)?.roundTripSync, true);
      assert.equal((entry?.metadata as { priorityQueue?: boolean } | undefined)?.priorityQueue, true);
      assert.equal((entry?.metadata as { siteLicense?: boolean } | undefined)?.siteLicense, false);
      assert.equal((entry?.metadata as { requestId?: string } | undefined)?.requestId, 'req_license-audit-123');
      assert.doesNotMatch(JSON.stringify(entry), /gbx_pro_entitlement_audit_123/u);
    }, { auditLog });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('license validation keeps Indie one-way import only', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/licenses/validate`, {
      method: 'POST',
      headers: { authorization: 'Bearer greybox_indie_test_123' },
    });

    assert.equal(response.status, 200);
    const json = await response.json() as {
      tier: string;
      plan: string;
      features: {
        import: boolean;
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
    };
    assert.equal(json.tier, 'indie');
    assert.equal(json.plan, 'indie');
    assert.deepEqual(json.features, {
      import: true,
      roundTripSync: false,
      mcpBridge: false,
      watermark: false,
      maxProjects: null,
      priorityQueue: false,
      sso: false,
      customSkillPacks: false,
      seatLimit: 1,
      siteLicense: false,
    });
  });
});

test('license validation maps site and enterprise keys to Studio site-license entitlements', async () => {
  await withServer(async (baseUrl) => {
    for (const token of ['gbx_studio_test_123', 'gbx_enterprise_test_123', 'greybox_site_test_123']) {
      const response = await fetch(`${baseUrl}/v1/licenses/validate`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
      });
      assert.equal(response.status, 200);
      const json = await response.json() as {
        tier: string;
        plan: string;
        features: {
          roundTripSync: boolean;
          mcpBridge: boolean;
          priorityQueue: boolean;
          sso: boolean;
          customSkillPacks: boolean;
          seatLimit: number | null;
          siteLicense: boolean;
        };
      };
      assert.equal(json.tier, 'studio');
      assert.equal(json.plan, 'enterprise');
      assert.equal(json.features.roundTripSync, true);
      assert.equal(json.features.mcpBridge, true);
      assert.equal(json.features.priorityQueue, true);
      assert.equal(json.features.sso, true);
      assert.equal(json.features.customSkillPacks, true);
      assert.equal(json.features.seatLimit, 25);
      assert.equal(json.features.siteLicense, true);
    }
  });
});

test('license registry validates hashed paid records and feature overrides', () => {
  const token = 'gbx_pro_registry_123';
  const expiresAt = '2027-05-17T00:00:00.000Z';
  const record: LicenseRecord = {
    tokenHash: licenseHash(token, 64),
    tier: 'pro',
    plan: 'pro',
    expiresAt,
    features: {
      priorityQueue: false,
      seatLimit: 4,
    },
  };

  const license = validateLicenseToken(token, {
    records: [record],
    now: new Date('2026-05-17T00:00:00.000Z'),
  });

  assert.equal(license.valid, true);
  assert.equal(license.status, 'active');
  assert.equal(license.tier, 'pro');
  assert.equal(license.expiresAt, expiresAt);
  assert.equal(license.licenseHash, licenseHash(token));
  assert.equal(license.features.roundTripSync, true);
  assert.equal(license.features.mcpBridge, true);
  assert.equal(license.features.priorityQueue, false);
  assert.equal(license.features.seatLimit, 4);
  assert.doesNotMatch(JSON.stringify(license), /gbx_pro_registry_123/u);
});

test('license registry matches normalized hashes and ignores malformed hash bait', () => {
  const token = 'gbx_pro_registry_hash_match_123';
  const fullHash = licenseHash(token, 64);
  const records: LicenseRecord[] = [
    { tokenHash: `${fullHash}ff`, tier: 'studio' },
    { tokenHash: fullHash.toUpperCase(), tier: 'pro', features: { priorityQueue: false } },
  ];

  const license = validateLicenseToken(token, { records });
  assert.equal(license.tier, 'pro');
  assert.equal(license.licenseHash, licenseHash(token));
  assert.equal(license.features.priorityQueue, false);
  assert.doesNotMatch(JSON.stringify(license), /gbx_pro_registry_hash_match_123/u);
});

test('license registry parses sanitized records from environment JSON', () => {
  const token = 'gbx_studio_env_registry_123';
  const records = licenseRecordsFromEnv({
    GREYBOX_LICENSE_RECORDS_JSON: JSON.stringify([
      {
        tokenHash: licenseHash(token, 64),
        tier: 'studio',
        plan: 'enterprise',
        status: 'active',
        expiresAt: '2027-05-17T00:00:00.000Z',
        features: {
          seatLimit: 18,
          customSkillPacks: true,
        },
      },
      {
        tokenHash: 'not-a-hash',
        tier: 'pro',
      },
    ]),
  });

  assert.equal(records.length, 1);
  assert.equal(records[0]?.tokenHash, licenseHash(token, 64));
  assert.equal(records[0]?.tier, 'studio');
  assert.equal(records[0]?.plan, 'enterprise');
  assert.equal(records[0]?.features?.seatLimit, 18);
});

test('license registry rejects revoked, suspended, expired, and unregistered tokens', () => {
  const activeToken = 'gbx_pro_registry_active_123';
  const revokedToken = 'gbx_pro_registry_revoked_123';
  const suspendedToken = 'gbx_pro_registry_suspended_123';
  const expiredToken = 'gbx_pro_registry_expired_123';
  const records: LicenseRecord[] = [
    { tokenHash: licenseHash(activeToken, 64), tier: 'pro' },
    { tokenHash: licenseHash(revokedToken, 64), tier: 'pro', status: 'revoked' },
    { tokenHash: licenseHash(suspendedToken, 64), tier: 'pro', status: 'suspended' },
    { tokenHash: licenseHash(expiredToken, 64), tier: 'pro', expiresAt: '2026-01-01T00:00:00.000Z' },
  ];

  assert.equal(validateLicenseToken(activeToken, { records }).tier, 'pro');
  assert.throws(() => validateLicenseToken(revokedToken, { records }), /license_revoked/u);
  assert.throws(() => validateLicenseToken(suspendedToken, { records }), /license_suspended/u);
  assert.throws(
    () => validateLicenseToken(expiredToken, {
      records,
      now: new Date('2026-05-17T00:00:00.000Z'),
    }),
    /license_expired/u,
  );
  assert.throws(() => validateLicenseToken('gbx_pro_unregistered_123', { records }), /invalid_license/u);
});

test('license registry rejects mismatched tier and plan records', () => {
  const token = 'gbx_indie_bad_plan_registry_123';

  assert.throws(
    () => validateLicenseToken(token, {
      records: [{
        tokenHash: licenseHash(token, 64),
        tier: 'indie',
        plan: 'enterprise',
      }],
    }),
    /invalid_license_record/u,
  );
});

test('license registry fails closed on duplicate matching records', () => {
  const token = 'gbx_pro_duplicate_registry_123';
  const records: LicenseRecord[] = [
    { tokenHash: licenseHash(token, 64), tier: 'pro', status: 'active' },
    { tokenHash: licenseHash(token), tier: 'pro', status: 'revoked' },
  ];

  assert.throws(
    () => validateLicenseToken(token, { records }),
    /duplicate_license_record/u,
  );
});

test('license validation endpoint fails closed when a registry is configured', async () => {
  const token = 'gbx_studio_registry_route_123';
  await withServer(async (baseUrl) => {
    const accepted = await fetch(`${baseUrl}/v1/licenses/validate`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(accepted.status, 200);
    const json = await accepted.json() as {
      tier: string;
      plan: string;
      licenseHash: string;
      features: { seatLimit: number | null; siteLicense: boolean };
    };
    assert.equal(json.tier, 'studio');
    assert.equal(json.plan, 'enterprise');
    assert.equal(json.licenseHash, licenseHash(token));
    assert.equal(json.features.seatLimit, 12);
    assert.equal(json.features.siteLicense, true);

    const denied = await fetch(`${baseUrl}/v1/licenses/validate`, {
      method: 'POST',
      headers: { authorization: 'Bearer gbx_pro_prefix_only_123' },
    });
    assert.equal(denied.status, 401);
    assert.deepEqual(await denied.json(), { error: 'invalid_license' });
  }, {
    licenseRecords: [{
      tokenHash: licenseHash(token, 64),
      tier: 'studio',
      plan: 'enterprise',
      features: { seatLimit: 12 },
    }],
  });
});

test('license validation endpoint reads the durable license record store each request', async () => {
  const token = 'gbx_pro_durable_store_123';
  let calls = 0;
  let records: readonly LicenseRecord[] = [{
    tokenHash: licenseHash(token, 64),
    tier: 'pro',
    plan: 'pro',
    features: { priorityQueue: false },
  }];
  const licenseRecordStore: LicenseRecordStore = {
    async list() {
      calls += 1;
      return records;
    },
  };

  await withServer(async (baseUrl) => {
    const accepted = await fetch(`${baseUrl}/v1/licenses/validate`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(accepted.status, 200);
    const json = await accepted.json() as { tier: string; features: { priorityQueue: boolean } };
    assert.equal(json.tier, 'pro');
    assert.equal(json.features.priorityQueue, false);

    records = [{ tokenHash: licenseHash(token, 64), tier: 'pro', status: 'revoked' }];
    const revoked = await fetch(`${baseUrl}/v1/licenses/validate`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(revoked.status, 401);
    assert.deepEqual(await revoked.json(), { error: 'license_revoked' });

    records = [];
    const prefixOnly = await fetch(`${baseUrl}/v1/licenses/validate`, {
      method: 'POST',
      headers: { authorization: 'Bearer gbx_pro_prefix_only_123' },
    });
    assert.equal(prefixOnly.status, 401);
    assert.deepEqual(await prefixOnly.json(), { error: 'invalid_license' });
  }, { licenseRecordStore });

  assert.equal(calls, 3);
});

test('revoked registry licenses cannot fetch Pro module decryption secrets', async () => {
  const token = 'gbx_pro_revoked_module_secret_123';
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/pro-modules/license-secret`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ moduleId: 'soulslike-combat-pack' }),
    });

    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: 'license_revoked' });
  }, {
    proModuleSecretMasterKey: 'a'.repeat(32),
    licenseRecords: [{
      tokenHash: licenseHash(token, 64),
      tier: 'pro',
      status: 'revoked',
    }],
  });
});

test('license validation rejects missing or unknown license tokens', async () => {
  await withServer(async (baseUrl) => {
    const missing = await fetch(`${baseUrl}/v1/licenses/validate`, { method: 'POST' });
    assert.equal(missing.status, 401);
    assert.deepEqual(await missing.json(), { error: 'license_required' });

    const unknown = await fetch(`${baseUrl}/v1/licenses/validate`, {
      method: 'POST',
      headers: { authorization: 'Bearer unrecognized_token' },
    });
    assert.equal(unknown.status, 401);
    assert.deepEqual(await unknown.json(), { error: 'invalid_license' });
  });
});
