// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import type http from 'node:http';
import test from 'node:test';
import { buildDataResidencyReadinessReport } from '../src/enterprise/dataResidencyReadiness.js';
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

function readyEnv() {
  const env: Record<string, string> = {
    GREYBOX_DATA_RESIDENCY_ENFORCEMENT: 'strict',
  };
  for (const region of ['US', 'EU', 'IN']) {
    env[`GREYBOX_REGION_${region}_BASE_URL`] = `https://cloud-${region.toLowerCase()}.greybox.studio`;
    env[`GREYBOX_REGION_${region}_STORAGE_BOUNDARY`] = 'local';
    env[`GREYBOX_REGION_${region}_PROVIDER_EGRESS`] = 'customer-selected';
    env[`GREYBOX_REGION_${region}_TRANSFER_BASIS`] = region === 'EU' ? 'sccs' : 'same-region';
    env[`GREYBOX_REGION_${region}_BACKUP_BOUNDARY`] = 'local';
  }
  return env;
}

test('data residency readiness reports warnings until region-local evidence is configured', () => {
  const report = buildDataResidencyReadinessReport({
    now: new Date('2026-05-17T00:00:00.000Z'),
    env: {},
  });

  assert.equal(report.generatedAt, '2026-05-17T00:00:00.000Z');
  assert.deepEqual([...report.supportedRegions], ['us', 'eu', 'in']);
  assert.equal(report.summary.readyRegions, 0);
  assert.equal(report.summary.warningRegions, 3);
  assert.equal(report.summary.blockedRegions, 0);
  assert.ok(report.regions.every((region) => region.status === 'warn'));
  assert.doesNotMatch(JSON.stringify(report), /API_KEY|SECRET|TOKEN/u);
});

test('data residency readiness passes when all regions have runtime enforcement and residency evidence', () => {
  const report = buildDataResidencyReadinessReport({ env: readyEnv() });

  assert.equal(report.summary.readyRegions, 3);
  assert.equal(report.summary.warningRegions, 0);
  assert.equal(report.summary.blockedRegions, 0);
  assert.ok(report.regions.every((region) => region.status === 'pass'));
});

test('data residency readiness does not pass hosted regions when runtime enforcement is off', () => {
  const env = readyEnv();
  delete env.GREYBOX_DATA_RESIDENCY_ENFORCEMENT;
  const report = buildDataResidencyReadinessReport({ env });

  assert.equal(report.summary.readyRegions, 0);
  assert.equal(report.summary.warningRegions, 3);
  assert.equal(report.summary.blockedRegions, 0);
  assert.ok(report.regions.every((region) => (
    region.checks.some((check) => (
      check.id === 'runtime-region-enforcement'
      && check.status === 'warn'
      && /strict/u.test(check.remediation ?? '')
    ))
  )));
});

test('data residency readiness blocks undisclosed cross-region storage or egress', () => {
  const env = readyEnv();
  env.GREYBOX_REGION_EU_STORAGE_BOUNDARY = 'cross-region';
  env.GREYBOX_REGION_IN_PROVIDER_EGRESS = 'cross-region-undisclosed';
  const report = buildDataResidencyReadinessReport({ env });

  assert.equal(report.summary.blockedRegions, 2);
  assert.equal(report.regions.find((region) => region.region === 'eu')?.status, 'fail');
  assert.equal(report.regions.find((region) => region.region === 'in')?.status, 'fail');
});

test('data residency readiness endpoint is admin protected and returns configured evidence', async () => {
  await withServer({
    auditAdminToken: 'residency-admin-0123456789abcdef',
    dataResidencyEnv: readyEnv(),
  }, async (baseUrl) => {
    const denied = await fetch(`${baseUrl}/v1/enterprise/data-residency/readiness`);
    assert.equal(denied.status, 401);
    assert.deepEqual(await denied.json(), { error: 'audit_admin_required' });

    const response = await fetch(`${baseUrl}/v1/enterprise/data-residency/readiness`, {
      headers: { authorization: 'Bearer residency-admin-0123456789abcdef' },
    });
    assert.equal(response.status, 200);
    const report = await response.json() as {
      summary: { readyRegions: number };
      regions: Array<{ region: string; status: string }>;
    };
    assert.equal(report.summary.readyRegions, 3);
    assert.equal(report.regions.find((region) => region.region === 'eu')?.status, 'pass');
  });
});
