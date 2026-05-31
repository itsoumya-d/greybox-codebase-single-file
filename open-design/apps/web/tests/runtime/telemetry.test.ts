import { afterEach, describe, expect, it } from 'vitest';

import { getTelemetry, initTelemetry } from '../../src/runtime/telemetry';

const originalWindow = globalThis.window;

afterEach(() => {
  if (originalWindow === undefined) {
    delete (globalThis as { window?: typeof window }).window;
  } else {
    globalThis.window = originalWindow;
  }
});

describe('telemetry adapter', () => {
  it('is a no-op when window is undefined (SSR build)', async () => {
    delete (globalThis as { window?: typeof window }).window;
    const adapter = await initTelemetry({
      installationId: 'inst-1',
      allowMetrics: true,
      allowErrors: true,
      env: { NEXT_PUBLIC_SENTRY_DSN: 'https://example/1', NEXT_PUBLIC_POSTHOG_KEY: 'phc_test' },
    });
    expect(adapter.enabled).toBe(false);
  });

  it('is a no-op when both consent toggles are off', async () => {
    globalThis.window = { document: {} } as unknown as Window & typeof globalThis;
    const adapter = await initTelemetry({
      installationId: 'inst-1',
      allowMetrics: false,
      allowErrors: false,
      env: { NEXT_PUBLIC_SENTRY_DSN: 'https://example/1', NEXT_PUBLIC_POSTHOG_KEY: 'phc_test' },
    });
    expect(adapter.enabled).toBe(false);
    expect(getTelemetry().enabled).toBe(false);
  });

  it('is a no-op when consent is given but no env vars are set', async () => {
    globalThis.window = { document: {} } as unknown as Window & typeof globalThis;
    const adapter = await initTelemetry({
      installationId: 'inst-1',
      allowMetrics: true,
      allowErrors: true,
      env: {},
    });
    expect(adapter.enabled).toBe(false);
  });

  it('does not throw when sentry/posthog SDK modules are absent', async () => {
    globalThis.window = { document: {} } as unknown as Window & typeof globalThis;
    const adapter = await initTelemetry({
      installationId: 'inst-1',
      allowMetrics: true,
      allowErrors: true,
      env: { NEXT_PUBLIC_SENTRY_DSN: 'https://example/1', NEXT_PUBLIC_POSTHOG_KEY: 'phc_test' },
    });
    // SDKs are optional peers; in test env they shouldn't be installed and we
    // should fall back to NOOP without throwing.
    expect(adapter.enabled).toBe(false);
    expect(() => adapter.captureException(new Error('x'))).not.toThrow();
    expect(() => adapter.captureEvent('x', { foo: 1 })).not.toThrow();
    await expect(adapter.shutdown()).resolves.toBeUndefined();
  });
});
