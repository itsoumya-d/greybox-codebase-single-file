import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  initDaemonTelemetry,
  resetDaemonTelemetryForTesting,
  telemetryConsentFromAppConfig,
  type SentryClientLike,
} from '../src/telemetry.js';

describe('daemon telemetry adapter', () => {
  beforeEach(() => {
    resetDaemonTelemetryForTesting();
  });

  afterEach(() => {
    resetDaemonTelemetryForTesting();
  });

  it('returns a no-op adapter when consent has not been granted', async () => {
    const adapter = await initDaemonTelemetry({
      installationId: 'inst_test',
      allowErrors: false,
      env: { AGDS_SENTRY_DSN: 'https://public@example.com/1' },
    });
    expect(adapter.enabled).toBe(false);
    expect(() => adapter.captureException(new Error('should not throw'))).not.toThrow();
  });

  it('returns a no-op adapter when DSN is unset', async () => {
    const adapter = await initDaemonTelemetry({
      installationId: 'inst_test',
      allowErrors: true,
      env: {},
    });
    expect(adapter.enabled).toBe(false);
  });

  it('returns a no-op when the SDK is not installed (loader returns undefined)', async () => {
    const adapter = await initDaemonTelemetry({
      installationId: 'inst_test',
      allowErrors: true,
      env: { AGDS_SENTRY_DSN: 'https://public@example.com/1' },
      loadSentry: async () => undefined,
    });
    expect(adapter.enabled).toBe(false);
  });

  it('forwards exceptions to the injected client when consent + DSN present', async () => {
    const calls: Array<{ kind: string; payload: unknown }> = [];
    const fakeClient: SentryClientLike = {
      captureException(error, tags) {
        calls.push({ kind: 'exception', payload: { error, tags } });
      },
      captureMessage(message, level) {
        calls.push({ kind: 'message', payload: { message, level } });
      },
      flush: async () => true,
    };
    const adapter = await initDaemonTelemetry({
      installationId: 'inst_test',
      allowErrors: true,
      env: { AGDS_SENTRY_DSN: 'https://public@example.com/1' },
      loadSentry: async () => fakeClient,
    });
    expect(adapter.enabled).toBe(true);
    adapter.captureException(new Error('boom'), { kind: 'unit_test' });
    adapter.captureMessage('hello', 'warning');
    expect(calls.length).toBe(2);
    expect(calls[0]!.kind).toBe('exception');
    expect(calls[1]!.kind).toBe('message');
    const messagePayload = calls[1]!.payload as { message: string; level: string };
    expect(messagePayload.message).toBe('hello');
    expect(messagePayload.level).toBe('warning');
  });

  it('scrubs known secrets from exception messages before forwarding', async () => {
    let captured: { error: unknown; tags?: Record<string, string> } | undefined;
    const fakeClient: SentryClientLike = {
      captureException(error, tags) {
        captured = { error, ...(tags ? { tags } : {}) };
      },
      captureMessage() {},
      flush: async () => true,
    };
    const adapter = await initDaemonTelemetry({
      installationId: 'inst_test',
      allowErrors: true,
      env: { AGDS_SENTRY_DSN: 'https://public@example.com/1' },
      loadSentry: async () => fakeClient,
    });
    expect(adapter.enabled).toBe(true);
    const leakyToken = 'sk-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    adapter.captureException(new Error(`request failed with token ${leakyToken}`));
    expect(captured).toBeDefined();
    const err = captured!.error as Error;
    expect(err.message).not.toContain(leakyToken);
    expect(err.message).toContain('[REDACTED');
  });

  it('flushes the client on shutdown', async () => {
    let flushed = false;
    const fakeClient: SentryClientLike = {
      captureException() {},
      captureMessage() {},
      flush: async () => {
        flushed = true;
        return true;
      },
    };
    const adapter = await initDaemonTelemetry({
      installationId: 'inst_test',
      allowErrors: true,
      env: { AGDS_SENTRY_DSN: 'https://public@example.com/1' },
      loadSentry: async () => fakeClient,
    });
    await adapter.shutdown(100);
    expect(flushed).toBe(true);
  });

  it('derives allowErrors from app-config telemetry prefs', () => {
    expect(telemetryConsentFromAppConfig({}).allowErrors).toBe(false);
    expect(
      telemetryConsentFromAppConfig({ telemetry: { metrics: false } }).allowErrors,
    ).toBe(false);
    expect(
      telemetryConsentFromAppConfig({ telemetry: { metrics: true } }).allowErrors,
    ).toBe(true);
    expect(
      telemetryConsentFromAppConfig({
        installationId: 'inst_123',
        telemetry: { content: true },
      }).installationId,
    ).toBe('inst_123');
  });
});
