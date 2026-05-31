// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertHostedProductionScimToken,
  HostedProductionScimError,
  strongHostedScimToken,
  unverifiedScimExplicitlyAllowed,
} from '../src/security/scimProdSafety.js';
import { createGreyboxCloudServer } from '../src/server.js';

const hostedEnv = { NODE_ENV: 'production' };
const strongToken = 'scim-hosted-token-0123456789abcdef';

function validBreakGlassEnv() {
  return {
    GREYBOX_CLOUD_ALLOW_UNVERIFIED_SCIM: '1',
    GREYBOX_CLOUD_ALLOW_UNVERIFIED_SCIM_REASON: 'temporary SCIM identity-provider token rotation',
    GREYBOX_CLOUD_ALLOW_UNVERIFIED_SCIM_NOW: '2026-05-25T00:00:00.000Z',
    GREYBOX_CLOUD_ALLOW_UNVERIFIED_SCIM_EXPIRES_AT: '2026-05-25T08:00:00.000Z',
  };
}

function validAuthEnv() {
  return {
    ...hostedEnv,
    WORKOS_JWKS_URL: 'https://api.workos.test/jwks',
    WORKOS_ISSUER: 'https://api.workos.test',
    GREYBOX_AUTH_AUDIENCE: 'greybox-cloud',
  };
}

test('hosted SCIM token quality rejects missing, short, and placeholder tokens', () => {
  assert.equal(strongHostedScimToken(strongToken), true);
  assert.equal(strongHostedScimToken(undefined), false);
  assert.equal(strongHostedScimToken('short-scim-token'), false);
  assert.equal(strongHostedScimToken('replace-with-long-random-token'), false);
});

test('hosted production SCIM guard requires a strong token', () => {
  assert.throws(
    () => assertHostedProductionScimToken({ env: hostedEnv, token: 'replace-with-long-random-token' }),
    (error) => {
      assert.ok(error instanceof HostedProductionScimError);
      assert.equal(error.code, 'hosted_production_scim_not_verified');
      assert.doesNotMatch(error.message, /replace-with-long-random-token/u);
      return true;
    },
  );
  assert.doesNotThrow(() => assertHostedProductionScimToken({ env: hostedEnv, token: strongToken }));
});

test('hosted production SCIM guard is disabled for local, on-prem, and break-glass', () => {
  assert.doesNotThrow(() => assertHostedProductionScimToken({
    env: { NODE_ENV: 'development' },
    token: undefined,
  }));
  assert.doesNotThrow(() => assertHostedProductionScimToken({
    env: { NODE_ENV: 'production', GREYBOX_DEPLOYMENT_MODE: 'on-prem' },
    token: undefined,
  }));
  assert.equal(unverifiedScimExplicitlyAllowed({
    ...hostedEnv,
    ...validBreakGlassEnv(),
  }), true);
  assert.doesNotThrow(() => assertHostedProductionScimToken({
    env: { ...hostedEnv, ...validBreakGlassEnv() },
    token: undefined,
  }));
});

test('hosted production SCIM break-glass must be reasoned and time-bound', () => {
  assert.equal(unverifiedScimExplicitlyAllowed({
    ...hostedEnv,
    GREYBOX_CLOUD_ALLOW_UNVERIFIED_SCIM: '1',
    GREYBOX_CLOUD_ALLOW_UNVERIFIED_SCIM_REASON: 'short',
    GREYBOX_CLOUD_ALLOW_UNVERIFIED_SCIM_NOW: '2026-05-25T00:00:00.000Z',
    GREYBOX_CLOUD_ALLOW_UNVERIFIED_SCIM_EXPIRES_AT: '2026-05-25T08:00:00.000Z',
  }), false);
  assert.equal(unverifiedScimExplicitlyAllowed({
    ...hostedEnv,
    ...validBreakGlassEnv(),
    GREYBOX_CLOUD_ALLOW_UNVERIFIED_SCIM_EXPIRES_AT: '2026-05-27T00:00:00.000Z',
  }), false);
});

test('server boot wires hosted SCIM token guard', () => {
  assert.throws(
    () => createGreyboxCloudServer({
      authEnv: validAuthEnv(),
      scimToken: 'replace-with-long-random-token',
    }),
    HostedProductionScimError,
  );
  assert.doesNotThrow(() => createGreyboxCloudServer({
    authEnv: validAuthEnv(),
    scimToken: strongToken,
  }));
});
