// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import test from 'node:test';

import { corsPolicyFromEnv } from '../src/security/cors.js';
import {
  assertHostedProductionCors,
  HostedProductionCorsError,
  unsafeHostedCorsOrigins,
  unverifiedCorsExplicitlyAllowed,
} from '../src/security/corsProdSafety.js';
import { createGreyboxCloudServer } from '../src/server.js';

const hostedEnv = { NODE_ENV: 'production' };

function validBreakGlassEnv() {
  return {
    GREYBOX_CLOUD_ALLOW_UNVERIFIED_CORS: '1',
    GREYBOX_CLOUD_ALLOW_UNVERIFIED_CORS_REASON: 'temporary hosted frontend origin cutover',
    GREYBOX_CLOUD_ALLOW_UNVERIFIED_CORS_NOW: '2026-05-25T00:00:00.000Z',
    GREYBOX_CLOUD_ALLOW_UNVERIFIED_CORS_EXPIRES_AT: '2026-05-25T08:00:00.000Z',
  };
}

test('hosted CORS guard accepts explicit HTTPS origins only', () => {
  const safe = corsPolicyFromEnv({
    GREYBOX_CLOUD_ALLOWED_ORIGINS: 'https://app.greybox.studio, https://staging.greybox.studio',
  });
  assert.doesNotThrow(() => assertHostedProductionCors({ env: hostedEnv, policy: safe }));

  const wildcard = corsPolicyFromEnv({ GREYBOX_CLOUD_ALLOWED_ORIGINS: '*' });
  assert.deepEqual(unsafeHostedCorsOrigins(wildcard), ['*']);
  assert.throws(
    () => assertHostedProductionCors({ env: hostedEnv, policy: wildcard }),
    (error) => {
      assert.ok(error instanceof HostedProductionCorsError);
      assert.equal(error.code, 'hosted_production_cors_not_verified');
      assert.deepEqual(error.unsafeOrigins, ['*']);
      return true;
    },
  );

  const http = corsPolicyFromEnv({ GREYBOX_CLOUD_ALLOWED_ORIGINS: 'http://localhost:8787' });
  assert.deepEqual(unsafeHostedCorsOrigins(http), ['http://localhost:8787']);
  assert.throws(() => assertHostedProductionCors({ env: hostedEnv, policy: http }), HostedProductionCorsError);
});

test('hosted CORS guard allows omitted policy and non-hosted local policy', () => {
  assert.doesNotThrow(() => assertHostedProductionCors({ env: hostedEnv, policy: undefined }));
  const localWildcard = corsPolicyFromEnv({ GREYBOX_CLOUD_ALLOWED_ORIGINS: '*' });
  assert.doesNotThrow(() => assertHostedProductionCors({
    env: { NODE_ENV: 'development' },
    policy: localWildcard,
  }));
  assert.doesNotThrow(() => assertHostedProductionCors({
    env: { NODE_ENV: 'production', GREYBOX_DEPLOYMENT_MODE: 'on-prem' },
    policy: localWildcard,
  }));
});

test('hosted CORS break-glass must be reasoned and time-bound', () => {
  assert.equal(unverifiedCorsExplicitlyAllowed({
    ...hostedEnv,
    ...validBreakGlassEnv(),
  }), true);
  assert.equal(unverifiedCorsExplicitlyAllowed({
    ...hostedEnv,
    GREYBOX_CLOUD_ALLOW_UNVERIFIED_CORS: '1',
    GREYBOX_CLOUD_ALLOW_UNVERIFIED_CORS_REASON: 'short',
    GREYBOX_CLOUD_ALLOW_UNVERIFIED_CORS_NOW: '2026-05-25T00:00:00.000Z',
    GREYBOX_CLOUD_ALLOW_UNVERIFIED_CORS_EXPIRES_AT: '2026-05-25T08:00:00.000Z',
  }), false);
  assert.equal(unverifiedCorsExplicitlyAllowed({
    ...hostedEnv,
    ...validBreakGlassEnv(),
    GREYBOX_CLOUD_ALLOW_UNVERIFIED_CORS_EXPIRES_AT: '2026-05-27T00:00:00.000Z',
  }), false);
});

test('server boot wires hosted CORS guard', () => {
  assert.throws(
    () => createGreyboxCloudServer({
      corsEnv: {
        NODE_ENV: 'production',
        GREYBOX_CLOUD_ALLOWED_ORIGINS: '*',
      },
    }),
    HostedProductionCorsError,
  );
  assert.doesNotThrow(() => createGreyboxCloudServer({
    corsEnv: {
      NODE_ENV: 'production',
      GREYBOX_CLOUD_ALLOWED_ORIGINS: 'https://app.greybox.studio',
    },
  }));
});
