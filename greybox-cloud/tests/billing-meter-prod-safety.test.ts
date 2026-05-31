// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  HostedProductionMeteringError,
  assertHostedProductionMeteringLive,
  dryRunMeteringExplicitlyAllowed,
} from '../src/security/billingMeterProdSafety.js';

const hostedEnv = { NODE_ENV: 'production' };

function validBreakGlassEnv(): Record<string, string> {
  return {
    GREYBOX_CLOUD_ALLOW_DRY_RUN_METERING: '1',
    GREYBOX_CLOUD_ALLOW_DRY_RUN_METERING_REASON: 'Incident INC-1234 Stripe metering outage rehearsal',
    GREYBOX_CLOUD_ALLOW_DRY_RUN_METERING_EXPIRES_AT: '2026-05-23T12:00:00.000Z',
    GREYBOX_CLOUD_ALLOW_DRY_RUN_METERING_NOW: '2026-05-23T00:00:00.000Z',
  };
}

test('hosted production metering accepts live Stripe submissions', () => {
  assert.doesNotThrow(() => assertHostedProductionMeteringLive({
    env: hostedEnv,
    submitStripe: true,
    dryRun: false,
    stripeApiKey: 'sk_live_123456789012345678901234',
  }));
  assert.doesNotThrow(() => assertHostedProductionMeteringLive({
    env: hostedEnv,
    submitStripe: true,
    dryRun: false,
    stripeApiKey: 'rk_live_123456789012345678901234',
  }));
});

test('hosted production metering rejects dry-run and non-live Stripe keys', () => {
  assert.throws(
    () => assertHostedProductionMeteringLive({
      env: hostedEnv,
      submitStripe: true,
      dryRun: true,
      stripeApiKey: 'sk_test_123456789012345678901234',
    }),
    (error) => {
      assert.ok(error instanceof HostedProductionMeteringError);
      assert.equal(error.code, 'hosted_production_metering_not_live');
      assert.deepEqual(error.reasons, ['dry_run_enabled', 'live_stripe_api_key_missing']);
      assert.match(error.message, /Hosted production Stripe metering/u);
      return true;
    },
  );
});

test('hosted production metering rejects missing Stripe API keys', () => {
  assert.throws(
    () => assertHostedProductionMeteringLive({
      env: hostedEnv,
      submitStripe: true,
      dryRun: false,
    }),
    (error) => {
      assert.ok(error instanceof HostedProductionMeteringError);
      assert.deepEqual(error.reasons, ['live_stripe_api_key_missing']);
      return true;
    },
  );
});

test('metering guard is inactive outside hosted live submission', () => {
  assert.doesNotThrow(() => assertHostedProductionMeteringLive({
    env: { NODE_ENV: 'development' },
    submitStripe: true,
    dryRun: true,
  }));
  assert.doesNotThrow(() => assertHostedProductionMeteringLive({
    env: { NODE_ENV: 'production', GREYBOX_DEPLOYMENT_MODE: 'on-prem' },
    submitStripe: true,
    dryRun: true,
  }));
  assert.doesNotThrow(() => assertHostedProductionMeteringLive({
    env: hostedEnv,
    submitStripe: false,
    dryRun: true,
  }));
});

test('dry-run metering break-glass must be exact, reasoned, and time-bound', () => {
  assert.equal(dryRunMeteringExplicitlyAllowed(validBreakGlassEnv()), true);
  assert.equal(dryRunMeteringExplicitlyAllowed({ GREYBOX_CLOUD_ALLOW_DRY_RUN_METERING: '1' }), false);
  assert.equal(dryRunMeteringExplicitlyAllowed({ GREYBOX_CLOUD_ALLOW_DRY_RUN_METERING: 'true' }), false);
  assert.equal(dryRunMeteringExplicitlyAllowed({ GREYBOX_CLOUD_ALLOW_DRY_RUN_METERING: ' 1 ' }), false);
  assert.equal(dryRunMeteringExplicitlyAllowed({
    ...validBreakGlassEnv(),
    GREYBOX_CLOUD_ALLOW_DRY_RUN_METERING_REASON: 'test',
  }), false);
  assert.equal(dryRunMeteringExplicitlyAllowed({
    ...validBreakGlassEnv(),
    GREYBOX_CLOUD_ALLOW_DRY_RUN_METERING_EXPIRES_AT: '2026-05-25T00:00:00.000Z',
  }), false);
  assert.doesNotThrow(() => assertHostedProductionMeteringLive({
    env: { NODE_ENV: 'production', ...validBreakGlassEnv() },
    submitStripe: true,
    dryRun: true,
    stripeApiKey: 'sk_test_123456789012345678901234',
  }));
});
