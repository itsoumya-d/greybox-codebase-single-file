// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import test from 'node:test';

import { HttpRateLimiter, httpRateLimiterFromEnv } from '../src/security/httpRateLimit.js';
import {
  assertHostedProductionRateLimit,
  HostedProductionRateLimitError,
  unverifiedRateLimitExplicitlyAllowed,
} from '../src/security/rateLimitProdSafety.js';
import { createGreyboxCloudServer } from '../src/server.js';

const hostedEnv = { NODE_ENV: 'production' };

function validBreakGlassEnv() {
  return {
    GREYBOX_CLOUD_ALLOW_UNVERIFIED_RATE_LIMIT: '1',
    GREYBOX_CLOUD_ALLOW_UNVERIFIED_RATE_LIMIT_REASON: 'temporary hosted rate-limit provider cutover',
    GREYBOX_CLOUD_ALLOW_UNVERIFIED_RATE_LIMIT_NOW: '2026-05-25T00:00:00.000Z',
    GREYBOX_CLOUD_ALLOW_UNVERIFIED_RATE_LIMIT_EXPIRES_AT: '2026-05-25T08:00:00.000Z',
  };
}

test('hosted production rate-limit guard requires a limiter', () => {
  assert.throws(
    () => assertHostedProductionRateLimit({ env: hostedEnv }),
    (error) => {
      assert.ok(error instanceof HostedProductionRateLimitError);
      assert.equal(error.code, 'hosted_production_rate_limit_not_configured');
      return true;
    },
  );

  const envLimiter = httpRateLimiterFromEnv({
    GREYBOX_CLOUD_HTTP_RATE_LIMIT_BURST: '120',
    GREYBOX_CLOUD_HTTP_RATE_LIMIT_PER_SECOND: '2',
  });
  assert.doesNotThrow(() => assertHostedProductionRateLimit({ env: hostedEnv, rateLimiter: envLimiter }));

  assert.doesNotThrow(() => assertHostedProductionRateLimit({
    env: hostedEnv,
    rateLimiter: new HttpRateLimiter({ capacity: 60, refillPerSecond: 1 }),
  }));
});

test('hosted production rate-limit guard allows local and on-prem pilots', () => {
  assert.doesNotThrow(() => assertHostedProductionRateLimit({
    env: { NODE_ENV: 'development' },
  }));
  assert.doesNotThrow(() => assertHostedProductionRateLimit({
    env: { NODE_ENV: 'production', GREYBOX_DEPLOYMENT_MODE: 'on-prem' },
  }));
});

test('hosted production rate-limit break-glass must be reasoned and time-bound', () => {
  assert.equal(unverifiedRateLimitExplicitlyAllowed({
    ...hostedEnv,
    ...validBreakGlassEnv(),
  }), true);
  assert.equal(unverifiedRateLimitExplicitlyAllowed({
    ...hostedEnv,
    GREYBOX_CLOUD_ALLOW_UNVERIFIED_RATE_LIMIT: '1',
    GREYBOX_CLOUD_ALLOW_UNVERIFIED_RATE_LIMIT_REASON: 'short',
    GREYBOX_CLOUD_ALLOW_UNVERIFIED_RATE_LIMIT_NOW: '2026-05-25T00:00:00.000Z',
    GREYBOX_CLOUD_ALLOW_UNVERIFIED_RATE_LIMIT_EXPIRES_AT: '2026-05-25T08:00:00.000Z',
  }), false);
  assert.equal(unverifiedRateLimitExplicitlyAllowed({
    ...hostedEnv,
    ...validBreakGlassEnv(),
    GREYBOX_CLOUD_ALLOW_UNVERIFIED_RATE_LIMIT_EXPIRES_AT: '2026-05-27T00:00:00.000Z',
  }), false);
});

test('server boot wires hosted production rate-limit guard', () => {
  assert.throws(
    () => createGreyboxCloudServer({
      rateLimitEnv: { NODE_ENV: 'production' },
    }),
    HostedProductionRateLimitError,
  );
  assert.doesNotThrow(() => createGreyboxCloudServer({
    rateLimitEnv: {
      NODE_ENV: 'production',
      GREYBOX_CLOUD_HTTP_RATE_LIMIT_BURST: '120',
      GREYBOX_CLOUD_HTTP_RATE_LIMIT_PER_SECOND: '2',
    },
  }));
});
