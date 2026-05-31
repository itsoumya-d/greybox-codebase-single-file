// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  constantTimeEquals,
  extractBearerToken,
  isBillingAdmin,
} from '../src/routers/admin-auth.js';

function validAuthBreakGlassEnv() {
  return {
    NODE_ENV: 'production',
    GREYBOX_CLOUD_ALLOW_UNVERIFIED_AUTH: '1',
    GREYBOX_CLOUD_ALLOW_UNVERIFIED_AUTH_REASON: 'temporary hosted admin-token cutover rehearsal',
    GREYBOX_CLOUD_ALLOW_UNVERIFIED_AUTH_NOW: '2026-05-25T00:00:00.000Z',
    GREYBOX_CLOUD_ALLOW_UNVERIFIED_AUTH_EXPIRES_AT: '2026-05-25T08:00:00.000Z',
  };
}

test('admin auth extracts bearer before legacy billing header', () => {
  assert.equal(extractBearerToken(new Headers({
    authorization: 'Bearer token-from-bearer',
    'x-greybox-billing-admin-token': 'token-from-header',
  })), 'token-from-bearer');
  assert.equal(extractBearerToken(new Headers({
    'x-greybox-billing-admin-token': 'token-from-header',
  })), 'token-from-header');
});

test('admin token comparison is exact and constant-time compatible', () => {
  assert.equal(constantTimeEquals('admin-secret', 'admin-secret'), true);
  assert.equal(constantTimeEquals('admin-secret', 'admin-secret '), false);
  assert.equal(constantTimeEquals('admin-secret', 'wrong-secret'), false);
});

test('hosted production rejects raw admin tokens without auth break-glass', () => {
  const headers = new Headers({ authorization: 'Bearer admin-secret' });
  assert.equal(isBillingAdmin(headers, 'admin-secret', { NODE_ENV: 'development' }), true);
  assert.equal(isBillingAdmin(headers, 'admin-secret', { NODE_ENV: 'production' }), false);
  assert.equal(isBillingAdmin(headers, 'admin-secret', {
    NODE_ENV: 'production',
    GREYBOX_DEPLOYMENT_MODE: 'on-prem',
  }), true);
  assert.equal(isBillingAdmin(headers, 'admin-secret', validAuthBreakGlassEnv()), true);
});
