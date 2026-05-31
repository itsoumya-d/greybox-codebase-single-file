// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import test from 'node:test';
import { createGreyboxCloudServer } from '../src/server.js';
import {
  HostedProductionPublicBaseUrlError,
  assertHostedProductionPublicBaseUrl,
  normalizePublicBaseUrl,
  unverifiedPublicBaseUrlExplicitlyAllowed,
} from '../src/security/publicBaseUrlProdSafety.js';

const readyHostedEnv = {
  NODE_ENV: 'production',
  GREYBOX_PUBLIC_BASE_URL: 'https://cloud.greybox.studio',
};

function validBreakGlassEnv() {
  return {
    NODE_ENV: 'production',
    GREYBOX_CLOUD_ALLOW_UNVERIFIED_PUBLIC_BASE_URL: '1',
    GREYBOX_CLOUD_ALLOW_UNVERIFIED_PUBLIC_BASE_URL_REASON: 'temporary identity provider cutover',
    GREYBOX_CLOUD_ALLOW_UNVERIFIED_PUBLIC_BASE_URL_NOW: '2026-05-25T12:00:00.000Z',
    GREYBOX_CLOUD_ALLOW_UNVERIFIED_PUBLIC_BASE_URL_EXPIRES_AT: '2026-05-25T18:00:00.000Z',
  };
}

test('hosted production public base URL guard accepts canonical HTTPS origins', () => {
  assert.doesNotThrow(() => assertHostedProductionPublicBaseUrl({ env: readyHostedEnv }));
  assert.doesNotThrow(() => assertHostedProductionPublicBaseUrl({
    env: { NODE_ENV: 'production' },
    publicBaseUrl: 'https://cloud-eu.greybox.studio/',
  }));
});

test('hosted production public base URL guard rejects missing or unsafe origins', () => {
  for (const publicBaseUrl of [
    undefined,
    'http://cloud.greybox.studio',
    'https://user:pass@cloud.greybox.studio',
    'https://cloud.greybox.studio/scim',
    'https://cloud.greybox.studio?token=secret',
    'https://localhost:8787',
    'https://127.0.0.1:8787',
    'https://10.0.0.5',
  ]) {
    assert.throws(
      () => assertHostedProductionPublicBaseUrl({ env: { NODE_ENV: 'production' }, publicBaseUrl }),
      HostedProductionPublicBaseUrlError,
    );
  }
});

test('public base URL normalization is origin-only and supports local rehearsals explicitly', () => {
  assert.equal(normalizePublicBaseUrl('https://cloud.greybox.studio/'), 'https://cloud.greybox.studio');
  assert.equal(normalizePublicBaseUrl('https://cloud.greybox.studio/path'), undefined);
  assert.equal(normalizePublicBaseUrl('https://user:pass@cloud.greybox.studio'), undefined);
  assert.equal(normalizePublicBaseUrl('http://cloud.greybox.studio'), undefined);
  assert.equal(normalizePublicBaseUrl('http://localhost:8787', { allowLocalHttp: true }), 'http://localhost:8787');
  assert.equal(normalizePublicBaseUrl('http://127.0.0.1:8787', { allowLocalHttp: true }), 'http://127.0.0.1:8787');
});

test('hosted production public base URL guard is disabled for local, on-prem, and explicit break-glass', () => {
  assert.doesNotThrow(() => assertHostedProductionPublicBaseUrl({
    env: { NODE_ENV: 'development' },
  }));
  assert.doesNotThrow(() => assertHostedProductionPublicBaseUrl({
    env: { NODE_ENV: 'production', GREYBOX_DEPLOYMENT_MODE: 'on-prem' },
  }));
  assert.doesNotThrow(() => assertHostedProductionPublicBaseUrl({
    env: validBreakGlassEnv(),
  }));

  assert.equal(unverifiedPublicBaseUrlExplicitlyAllowed(validBreakGlassEnv()), true);
  assert.equal(unverifiedPublicBaseUrlExplicitlyAllowed({
    GREYBOX_CLOUD_ALLOW_UNVERIFIED_PUBLIC_BASE_URL: '1',
  }), false);
});

test('server boot wires the hosted production public base URL guard', () => {
  assert.throws(
    () => createGreyboxCloudServer({
      publicBaseUrlEnv: { NODE_ENV: 'production' },
    }),
    HostedProductionPublicBaseUrlError,
  );

  const server = createGreyboxCloudServer({
    publicBaseUrlEnv: { NODE_ENV: 'production' },
    publicBaseUrl: 'https://cloud.greybox.studio',
  });
  assert.ok(server);
});
