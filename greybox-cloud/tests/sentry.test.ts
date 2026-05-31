// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { createSentryAdapter, sanitizeSentryEvent } from '../src/observability/sentry.js';

describe('Sentry adapter', () => {
  it('returns a no-op adapter when DSN is missing', async () => {
    const adapter = await createSentryAdapter();
    assert.equal(adapter.enabled, false);
    // Calling any method must not throw.
    adapter.captureException(new Error('test'));
    adapter.captureMessage('hello', 'info');
    assert.equal(await adapter.flush(), true);
  });

  it('returns a no-op adapter when DSN is whitespace', async () => {
    const adapter = await createSentryAdapter({ dsn: '   ' });
    assert.equal(adapter.enabled, false);
  });

  it('returns a no-op adapter when @sentry/node is not installed (graceful degrade)', async () => {
    // The SDK is intentionally not a hard dependency; this verifies the
    // adapter never crashes the process when telemetry is misconfigured.
    const adapter = await createSentryAdapter({ dsn: 'https://example@sentry.io/1' });
    // We do not assert enabled here: if @sentry/node happens to be installed in
    // this dev env, enabled may be true. We only assert no exception thrown.
    assert.ok(typeof adapter.captureException === 'function');
  });

  it('redacts PII and secrets across Sentry events before transport', () => {
    const sanitized = sanitizeSentryEvent({
      message: 'checkout failed for designer@example.com with card 4242 4242 4242 4242',
      request: {
        data: { prompt: 'ship key sk_live_customersecret and phone +1 415 555 1212' },
        headers: {
          authorization: 'Bearer gbx_pro_super_secret_license_12345',
          'x-forwarded-for': '203.0.113.42',
        },
        query_string: 'customer=cus_live_123&email=designer@example.com',
      },
      user: {
        email: 'designer@example.com',
        ip_address: '2001:db8::1',
      },
      breadcrumbs: [
        {
          message: 'Stripe event evt_secretpayload for designer@example.com',
          data: { license: 'gbx_enterprise_secret_license_123456' },
        },
      ],
    });

    const json = JSON.stringify(sanitized);
    assert.equal(sanitized.request?.data, '[scrubbed]');
    assert.doesNotMatch(json, /designer@example\.com|4242 4242|gbx_(?:pro|enterprise)_|203\.0\.113\.42|2001:db8::1|evt_secretpayload/u);
    assert.match(json, /\[REDACTED_EMAIL\]|\[REDACTED_SECRET\]|\[REDACTED_IP\]|\[REDACTED_CARD\]|\[REDACTED_STRIPE_ID\]/u);
  });

  it('can retain redacted request body shape for controlled debugging', () => {
    const sanitized = sanitizeSentryEvent({
      request: {
        data: {
          email: 'designer@example.com',
          license: 'gbx_studio_secret_license_123456',
        },
      },
    }, { scrubRequestBodies: false });

    assert.deepEqual(sanitized.request?.data, {
      email: '[REDACTED_EMAIL]',
      license: '[REDACTED_SECRET]',
    });
  });
});
