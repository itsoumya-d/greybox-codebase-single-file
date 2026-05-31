// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  HostedProductionDataResidencyError,
  assertHostedProductionDataResidency,
  unverifiedDataResidencyExplicitlyAllowed,
} from '../src/security/dataResidencyProdSafety.js';
import { createGreyboxCloudServer } from '../src/server.js';

function readyHostedEnv(): Record<string, string> {
  const env: Record<string, string> = {
    NODE_ENV: 'production',
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

function validBreakGlassEnv(): Record<string, string> {
  return {
    GREYBOX_CLOUD_ALLOW_UNVERIFIED_DATA_RESIDENCY: '1',
    GREYBOX_CLOUD_ALLOW_UNVERIFIED_DATA_RESIDENCY_REASON: 'Incident INC-1234 regional evidence outage',
    GREYBOX_CLOUD_ALLOW_UNVERIFIED_DATA_RESIDENCY_EXPIRES_AT: '2026-05-23T12:00:00.000Z',
    GREYBOX_CLOUD_ALLOW_UNVERIFIED_DATA_RESIDENCY_NOW: '2026-05-23T00:00:00.000Z',
  };
}

test('hosted production data residency guard accepts strict verified regional evidence', () => {
  assert.doesNotThrow(() => assertHostedProductionDataResidency({
    env: readyHostedEnv(),
    now: new Date('2026-05-20T00:00:00.000Z'),
  }));
});

test('hosted production data residency guard rejects missing regional evidence', () => {
  assert.throws(
    () => assertHostedProductionDataResidency({ env: { NODE_ENV: 'production' } }),
    (error) => {
      assert.ok(error instanceof HostedProductionDataResidencyError);
      assert.equal(error.code, 'hosted_production_data_residency_not_verified');
      assert.equal(error.report.summary.readyRegions, 0);
      assert.equal(error.report.summary.warningRegions, 3);
      assert.equal(error.report.summary.blockedRegions, 0);
      assert.equal(error.unsafeChecks.length, 18);
      assert.deepEqual(error.unsafeChecks.slice(0, 3).map((item) => `${item.region}.${item.check.id}`), [
        'us.regional-deployment-url',
        'us.runtime-region-enforcement',
        'us.storage-boundary',
      ]);
      assert.match(error.message, /us.runtime-region-enforcement=warn/u);
      assert.doesNotMatch(error.message, /GREYBOX_REGION_US_BASE_URL=https/u);
      return true;
    },
  );
});

test('hosted production data residency guard rejects blocked regions', () => {
  const env = readyHostedEnv();
  env.GREYBOX_REGION_EU_STORAGE_BOUNDARY = 'cross-region';
  env.GREYBOX_REGION_IN_PROVIDER_EGRESS = 'cross-region-undisclosed';
  assert.throws(
    () => assertHostedProductionDataResidency({
      env,
      now: new Date('2026-05-20T00:00:00.000Z'),
    }),
    (error) => {
      assert.ok(error instanceof HostedProductionDataResidencyError);
      assert.equal(error.report.summary.readyRegions, 1);
      assert.equal(error.report.summary.blockedRegions, 2);
      assert.ok(error.unsafeChecks.some((item) => (
        item.region === 'eu'
        && item.check.id === 'storage-boundary'
        && item.check.status === 'fail'
      )));
      assert.ok(error.unsafeChecks.some((item) => (
        item.region === 'in'
        && item.check.id === 'provider-egress'
        && item.check.status === 'fail'
      )));
      return true;
    },
  );
});

test('hosted production data residency guard is disabled for local, on-prem, and explicit break-glass', () => {
  assert.doesNotThrow(() => assertHostedProductionDataResidency({
    env: { NODE_ENV: 'development' },
  }));
  assert.doesNotThrow(() => assertHostedProductionDataResidency({
    env: { NODE_ENV: 'production', GREYBOX_DEPLOYMENT_MODE: 'on-prem' },
  }));
  assert.doesNotThrow(() => assertHostedProductionDataResidency({
    env: {
      NODE_ENV: 'production',
      ...validBreakGlassEnv(),
    },
  }));
});

test('data residency break-glass must be exact, reasoned, and time-bound', () => {
  assert.equal(unverifiedDataResidencyExplicitlyAllowed(validBreakGlassEnv()), true);
  assert.equal(unverifiedDataResidencyExplicitlyAllowed({ GREYBOX_CLOUD_ALLOW_UNVERIFIED_DATA_RESIDENCY: '1' }), false);
  assert.equal(unverifiedDataResidencyExplicitlyAllowed({ GREYBOX_CLOUD_ALLOW_UNVERIFIED_DATA_RESIDENCY: 'true' }), false);
  assert.equal(unverifiedDataResidencyExplicitlyAllowed({ GREYBOX_CLOUD_ALLOW_UNVERIFIED_DATA_RESIDENCY: ' 1 ' }), false);
  assert.equal(unverifiedDataResidencyExplicitlyAllowed({
    ...validBreakGlassEnv(),
    GREYBOX_CLOUD_ALLOW_UNVERIFIED_DATA_RESIDENCY_REASON: 'test',
  }), false);
  assert.equal(unverifiedDataResidencyExplicitlyAllowed({
    ...validBreakGlassEnv(),
    GREYBOX_CLOUD_ALLOW_UNVERIFIED_DATA_RESIDENCY_EXPIRES_AT: '2026-05-25T00:00:00.000Z',
  }), false);
});

test('server boot wires the hosted production data residency guard', () => {
  assert.throws(
    () => createGreyboxCloudServer({
      dataResidencyEnv: { NODE_ENV: 'production' },
    }),
    HostedProductionDataResidencyError,
  );
  const server = createGreyboxCloudServer({
    dataResidencyEnv: readyHostedEnv(),
  });
  assert.ok(server);
});
