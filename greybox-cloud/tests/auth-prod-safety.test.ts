// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertHostedProductionAuth,
  authBreakGlassAllowed,
  HostedProductionAuthError,
  hostedProductionWorkOsJwksUrlVerified,
} from '../src/security/authProdSafety.js';
import { createGreyboxCloudServer } from '../src/server.js';

const hostedEnv = {
  NODE_ENV: 'production',
  WORKOS_JWKS_URL: undefined,
  WORKOS_ISSUER: undefined,
  GREYBOX_AUTH_AUDIENCE: undefined,
};
const strongScimToken = 'scim-hosted-token-0123456789abcdef';

function validBreakGlassEnv() {
  return {
    GREYBOX_CLOUD_ALLOW_UNVERIFIED_AUTH: '1',
    GREYBOX_CLOUD_ALLOW_UNVERIFIED_AUTH_REASON: 'temporary hosted auth cutover rehearsal',
    GREYBOX_CLOUD_ALLOW_UNVERIFIED_AUTH_NOW: '2026-05-25T00:00:00.000Z',
    GREYBOX_CLOUD_ALLOW_UNVERIFIED_AUTH_EXPIRES_AT: '2026-05-25T08:00:00.000Z',
  };
}

test('hosted production auth guard requires WorkOS verification', () => {
  assert.throws(
    () => assertHostedProductionAuth({
      env: hostedEnv,
      workosVerifierConfigured: false,
    }),
    (error) => {
      assert.ok(error instanceof HostedProductionAuthError);
      assert.equal(error.code, 'hosted_production_auth_not_verified');
      assert.match(error.message, /Hosted production requires verified WorkOS authentication/u);
      return true;
    },
  );

  assert.doesNotThrow(() => assertHostedProductionAuth({
    env: hostedEnv,
    workosVerifierConfigured: true,
  }));
});

test('hosted production auth guard requires hosted HTTPS WorkOS JWKS for env verifier', () => {
  assert.equal(hostedProductionWorkOsJwksUrlVerified('https://api.workos.test/jwks'), true);
  assert.equal(hostedProductionWorkOsJwksUrlVerified('http://api.workos.test/jwks'), false);
  assert.equal(hostedProductionWorkOsJwksUrlVerified('https://localhost:8787/jwks'), false);
  assert.equal(hostedProductionWorkOsJwksUrlVerified('https://user:pass@api.workos.test/jwks'), false);

  assert.throws(
    () => assertHostedProductionAuth({
      env: {
        ...hostedEnv,
        WORKOS_JWKS_URL: 'http://api.workos.test/jwks',
        WORKOS_ISSUER: 'https://api.workos.test',
        GREYBOX_AUTH_AUDIENCE: 'greybox-cloud',
      },
      workosVerifierConfigured: true,
      workosVerifierSource: 'env',
    }),
    (error) => {
      assert.ok(error instanceof HostedProductionAuthError);
      assert.deepEqual(error.issues, ['workos_jwks_url_not_https_hosted']);
      assert.doesNotMatch(error.message, /http:\/\/api\.workos/u);
      return true;
    },
  );

  assert.doesNotThrow(() => assertHostedProductionAuth({
    env: {
      ...hostedEnv,
      WORKOS_JWKS_URL: 'http://api.workos.test/jwks',
    },
    workosVerifierConfigured: true,
    workosVerifierSource: 'injected',
  }));
});

test('hosted production auth guard is disabled for local, on-prem, and break-glass', () => {
  assert.doesNotThrow(() => assertHostedProductionAuth({
    env: { NODE_ENV: 'development' },
    workosVerifierConfigured: false,
  }));
  assert.doesNotThrow(() => assertHostedProductionAuth({
    env: { NODE_ENV: 'production', GREYBOX_DEPLOYMENT_MODE: 'on-prem' },
    workosVerifierConfigured: false,
  }));
  assert.equal(authBreakGlassAllowed({
    ...hostedEnv,
    ...validBreakGlassEnv(),
  }), true);
  assert.doesNotThrow(() => assertHostedProductionAuth({
    env: { ...hostedEnv, ...validBreakGlassEnv() },
    workosVerifierConfigured: false,
  }));
});

test('hosted production auth break-glass must be reasoned and time-bound', () => {
  assert.equal(authBreakGlassAllowed({
    ...hostedEnv,
    GREYBOX_CLOUD_ALLOW_UNVERIFIED_AUTH: '1',
    GREYBOX_CLOUD_ALLOW_UNVERIFIED_AUTH_REASON: 'short',
    GREYBOX_CLOUD_ALLOW_UNVERIFIED_AUTH_NOW: '2026-05-25T00:00:00.000Z',
    GREYBOX_CLOUD_ALLOW_UNVERIFIED_AUTH_EXPIRES_AT: '2026-05-25T08:00:00.000Z',
  }), false);
  assert.equal(authBreakGlassAllowed({
    ...hostedEnv,
    ...validBreakGlassEnv(),
    GREYBOX_CLOUD_ALLOW_UNVERIFIED_AUTH_EXPIRES_AT: '2026-05-27T00:00:00.000Z',
  }), false);
});

test('server boot wires the hosted production auth guard', () => {
  assert.throws(
    () => createGreyboxCloudServer({ authEnv: hostedEnv }),
    (error) => {
      assert.ok(error instanceof HostedProductionAuthError);
      assert.equal(error.code, 'hosted_production_auth_not_verified');
      return true;
    },
  );

  assert.throws(
    () => createGreyboxCloudServer({
      authEnv: {
        ...hostedEnv,
        WORKOS_JWKS_URL: 'https://api.workos.test/jwks',
      },
    }),
    HostedProductionAuthError,
  );

  assert.throws(
    () => createGreyboxCloudServer({
      authEnv: {
        NODE_ENV: 'production',
        WORKOS_JWKS_URL: 'http://api.workos.test/jwks',
        WORKOS_ISSUER: 'https://api.workos.test',
        GREYBOX_AUTH_AUDIENCE: 'greybox-cloud',
      },
    }),
    HostedProductionAuthError,
  );

  assert.doesNotThrow(() => createGreyboxCloudServer({
    authEnv: hostedEnv,
    scimToken: strongScimToken,
    workosVerifier: {
      async verify() {
        throw new Error('not used during boot');
      },
    },
  }));

  assert.doesNotThrow(() => createGreyboxCloudServer({
    authEnv: {
      NODE_ENV: 'production',
      WORKOS_JWKS_URL: 'https://api.workos.test/jwks',
      WORKOS_ISSUER: 'https://api.workos.test',
      GREYBOX_AUTH_AUDIENCE: 'greybox-cloud',
    },
    scimToken: strongScimToken,
  }));
});
