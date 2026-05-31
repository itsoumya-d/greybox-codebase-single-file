/**
 * Coverage for the opt-in Electron Sentry adapter
 * (`apps/desktop/src/main/telemetry.ts`). The packaged workspace hosts the
 * test because `apps/desktop` itself has no vitest setup. The adapter is
 * pure-JS apart from an optional `@sentry/electron/main` dynamic import that
 * we inject via the `loadSentry` test hook.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: { whenReady: vi.fn() },
}));

import {
  initDesktopTelemetry,
  readDesktopTelemetryConsent,
  resetDesktopTelemetryForTesting,
  type DesktopSentryClient,
} from '../../desktop/src/main/telemetry.js';

describe('desktop telemetry adapter', () => {
  beforeEach(() => {
    resetDesktopTelemetryForTesting();
  });
  afterEach(() => {
    resetDesktopTelemetryForTesting();
  });

  it('returns a no-op when consent has not been granted', async () => {
    const adapter = await initDesktopTelemetry({
      installationId: 'inst_test',
      allowErrors: false,
      env: { AGDS_SENTRY_DSN: 'https://public@example.com/1' },
    });
    expect(adapter.enabled).toBe(false);
  });

  it('returns a no-op when the DSN is missing', async () => {
    const adapter = await initDesktopTelemetry({
      installationId: 'inst_test',
      allowErrors: true,
      env: {},
    });
    expect(adapter.enabled).toBe(false);
  });

  it('returns a no-op when the optional @sentry/electron dep is not installed', async () => {
    const adapter = await initDesktopTelemetry({
      installationId: 'inst_test',
      allowErrors: true,
      env: { AGDS_SENTRY_DSN: 'https://public@example.com/1' },
      loadSentry: async () => undefined,
    });
    expect(adapter.enabled).toBe(false);
  });

  it('forwards exceptions to the injected client when consent + DSN present', async () => {
    const captured: Array<{ kind: 'exception'; payload: unknown }> = [];
    const fakeClient: DesktopSentryClient = {
      captureException(error, tags) {
        captured.push({ kind: 'exception', payload: { error, tags } });
      },
      flush: async () => true,
    };
    const adapter = await initDesktopTelemetry({
      installationId: 'inst_test',
      allowErrors: true,
      env: { AGDS_SENTRY_DSN: 'https://public@example.com/1' },
      loadSentry: async () => fakeClient,
    });
    expect(adapter.enabled).toBe(true);
    adapter.captureException(new Error('boom'), { kind: 'test' });
    expect(captured.length).toBe(1);
  });

  it('flushes the client on shutdown', async () => {
    let flushed = false;
    const fakeClient: DesktopSentryClient = {
      captureException() {},
      flush: async () => {
        flushed = true;
        return true;
      },
    };
    const adapter = await initDesktopTelemetry({
      installationId: 'inst_test',
      allowErrors: true,
      env: { AGDS_SENTRY_DSN: 'https://public@example.com/1' },
      loadSentry: async () => fakeClient,
    });
    await adapter.shutdown(100);
    expect(flushed).toBe(true);
  });
});

describe('readDesktopTelemetryConsent', () => {
  it('returns allowErrors=true when daemon reports telemetry.metrics === true', async () => {
    const fakeFetch: typeof fetch = async () =>
      new Response(JSON.stringify({ installationId: 'inst_abc', telemetry: { metrics: true } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    const consent = await readDesktopTelemetryConsent('http://127.0.0.1:7456', fakeFetch);
    expect(consent.allowErrors).toBe(true);
    expect(consent.installationId).toBe('inst_abc');
  });

  it('returns allowErrors=false when daemon reports no consent', async () => {
    const fakeFetch: typeof fetch = async () =>
      new Response(JSON.stringify({ installationId: 'inst_abc', telemetry: { metrics: false } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    const consent = await readDesktopTelemetryConsent('http://127.0.0.1:7456', fakeFetch);
    expect(consent.allowErrors).toBe(false);
  });

  it('returns allowErrors=false when the daemon is unreachable', async () => {
    const fakeFetch: typeof fetch = async () => {
      throw new Error('ECONNREFUSED');
    };
    const consent = await readDesktopTelemetryConsent('http://127.0.0.1:7456', fakeFetch);
    expect(consent.allowErrors).toBe(false);
    expect(consent.installationId).toBe('anonymous');
  });

  it('returns allowErrors=false when the daemon responds with non-2xx', async () => {
    const fakeFetch: typeof fetch = async () => new Response('not found', { status: 404 });
    const consent = await readDesktopTelemetryConsent('http://127.0.0.1:7456', fakeFetch);
    expect(consent.allowErrors).toBe(false);
  });
});
