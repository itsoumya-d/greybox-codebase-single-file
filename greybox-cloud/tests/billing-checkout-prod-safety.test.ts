// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  REQUIRED_MARKETPLACE_STRIPE_EVENTS,
} from '../src/routers/billing.js';
import {
  HostedProductionCheckoutError,
  assertHostedProductionCheckoutReady,
  unverifiedCheckoutExplicitlyAllowed,
} from '../src/security/billingCheckoutProdSafety.js';
import { createGreyboxCloudServer } from '../src/server.js';
import type { AuditLog } from '../src/enterprise/auditLog.js';

const readyCheckout = {
  stripeWebhookSecret: 'whsec_ready_0123456789abcdef',
  stripeWebhookEvents: [...REQUIRED_MARKETPLACE_STRIPE_EVENTS],
  marketplaceUrl: 'https://marketplace.greybox.studio/',
  marketplaceAdminToken: 'marketplace-admin-0123456789abcdef',
  auditLogConfigured: true,
};

const memoryAuditLog: AuditLog = {
  append: async () => {},
  readEntries: async () => [],
  verify: async () => ({ valid: true, checked: 0 }),
};

function validBreakGlassEnv(): Record<string, string> {
  return {
    GREYBOX_CLOUD_ALLOW_UNVERIFIED_CHECKOUT: '1',
    GREYBOX_CLOUD_ALLOW_UNVERIFIED_CHECKOUT_REASON: 'Incident INC-1234 checkout evidence outage',
    GREYBOX_CLOUD_ALLOW_UNVERIFIED_CHECKOUT_EXPIRES_AT: '2026-05-23T12:00:00.000Z',
    GREYBOX_CLOUD_ALLOW_UNVERIFIED_CHECKOUT_NOW: '2026-05-23T00:00:00.000Z',
  };
}

test('hosted production checkout guard accepts verified Stripe and marketplace wiring', () => {
  assert.doesNotThrow(() => assertHostedProductionCheckoutReady({
    env: { NODE_ENV: 'production' },
    ...readyCheckout,
    now: new Date('2026-05-20T00:00:00.000Z'),
  }));
});

test('hosted production checkout guard rejects missing or placeholder checkout wiring', () => {
  assert.throws(
    () => assertHostedProductionCheckoutReady({
      env: { NODE_ENV: 'production' },
      stripeWebhookSecret: 'replace-with-long-random-token',
      marketplaceUrl: 'http://marketplace.greybox.studio',
      marketplaceAdminToken: 'token',
      auditLogConfigured: false,
    }),
    (error) => {
      assert.ok(error instanceof HostedProductionCheckoutError);
      assert.equal(error.code, 'hosted_production_checkout_not_verified');
      assert.equal(error.report.ready, false);
      assert.deepEqual(error.unsafeChecks.map((check) => check.id), [
        'stripe-webhook-secret',
        'stripe-webhook-events',
        'marketplace-url',
        'marketplace-admin-token',
        'checkout-audit-log',
      ]);
      assert.match(error.message, /stripe-webhook-secret=fail/u);
      assert.match(error.message, /stripe-webhook-events=fail/u);
      assert.match(error.message, /marketplace-admin-token=fail/u);
      assert.doesNotMatch(error.message, /replace-with-long-random-token/u);
      return true;
    },
  );
});

test('hosted production checkout guard is disabled for local, on-prem, and explicit break-glass', () => {
  assert.doesNotThrow(() => assertHostedProductionCheckoutReady({
    env: { NODE_ENV: 'development' },
  }));
  assert.doesNotThrow(() => assertHostedProductionCheckoutReady({
    env: { NODE_ENV: 'production', GREYBOX_DEPLOYMENT_MODE: 'on-prem' },
  }));
  assert.doesNotThrow(() => assertHostedProductionCheckoutReady({
    env: {
      NODE_ENV: 'production',
      ...validBreakGlassEnv(),
    },
  }));
});

test('checkout break-glass must be exact, reasoned, and time-bound', () => {
  assert.equal(unverifiedCheckoutExplicitlyAllowed(validBreakGlassEnv()), true);
  assert.equal(unverifiedCheckoutExplicitlyAllowed({ GREYBOX_CLOUD_ALLOW_UNVERIFIED_CHECKOUT: '1' }), false);
  assert.equal(unverifiedCheckoutExplicitlyAllowed({ GREYBOX_CLOUD_ALLOW_UNVERIFIED_CHECKOUT: 'true' }), false);
  assert.equal(unverifiedCheckoutExplicitlyAllowed({ GREYBOX_CLOUD_ALLOW_UNVERIFIED_CHECKOUT: ' 1 ' }), false);
  assert.equal(unverifiedCheckoutExplicitlyAllowed({
    ...validBreakGlassEnv(),
    GREYBOX_CLOUD_ALLOW_UNVERIFIED_CHECKOUT_REASON: 'test',
  }), false);
  assert.equal(unverifiedCheckoutExplicitlyAllowed({
    ...validBreakGlassEnv(),
    GREYBOX_CLOUD_ALLOW_UNVERIFIED_CHECKOUT_EXPIRES_AT: '2026-05-25T00:00:00.000Z',
  }), false);
});

test('hosted production checkout guard rejects partial Stripe event subscriptions', () => {
  assert.throws(
    () => assertHostedProductionCheckoutReady({
      env: { NODE_ENV: 'production' },
      ...readyCheckout,
      stripeWebhookEvents: ['checkout.session.completed'],
    }),
    (error) => {
      assert.ok(error instanceof HostedProductionCheckoutError);
      assert.equal(error.report.ready, false);
      assert.deepEqual(error.unsafeChecks.map((check) => check.id), ['stripe-webhook-events']);
      assert.match(error.message, /stripe-webhook-events=fail/u);
      assert.doesNotMatch(error.message, /whsec_ready_0123456789abcdef/u);
      return true;
    },
  );
});

test('server boot wires the hosted production checkout guard', () => {
  assert.throws(
    () => createGreyboxCloudServer({
      billingCheckoutEnv: { NODE_ENV: 'production' },
    }),
    HostedProductionCheckoutError,
  );
  const server = createGreyboxCloudServer({
    billingCheckoutEnv: { NODE_ENV: 'production' },
    stripeWebhookSecret: readyCheckout.stripeWebhookSecret,
    stripeWebhookEvents: readyCheckout.stripeWebhookEvents,
    marketplaceUrl: readyCheckout.marketplaceUrl,
    marketplaceAdminToken: readyCheckout.marketplaceAdminToken,
    auditLog: memoryAuditLog,
  });
  assert.ok(server);
});
