// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { redactPii } from '../safety/piiRedactor.js';

/**
 * Sentry adapter for greybox-cloud.
 *
 * Designed as a zero-cost no-op when SENTRY_DSN is absent: this lets local
 * dev, CI, and self-hosted operators run the daemon without pulling Sentry as
 * a hard dependency. When a DSN is supplied, the adapter dynamically loads
 * the official @sentry/node SDK at boot and forwards errors to it.
 *
 * Wiring (in src/index.ts or wherever the HTTP server is created):
 *
 *   const sentry = await createSentryAdapter({
 *     dsn: process.env.SENTRY_DSN,
 *     environment: process.env.NODE_ENV ?? 'development',
 *     release: process.env.GREYBOX_CLOUD_VERSION,
 *   });
 *   process.on('uncaughtException', (err) => sentry.captureException(err));
 *   process.on('unhandledRejection', (err) => sentry.captureException(err));
 *
 * Why dynamic load: Sentry SDK is an optional dependency. By importing it via
 * dynamic import we avoid pulling the package into a runtime that didn't ask
 * for telemetry, while keeping the contract identical for callers.
 */

export interface SentryAdapter {
  enabled: boolean;
  captureException(error: unknown, tags?: Record<string, string>): void;
  captureMessage(message: string, level?: 'fatal' | 'error' | 'warning' | 'info', tags?: Record<string, string>): void;
  flush(timeoutMs?: number): Promise<boolean>;
}

export interface SentryAdapterOptions {
  dsn?: string;
  environment?: string;
  release?: string;
  /**
   * Trace sample rate (0.0-1.0). Default 0 (errors only). Raise to 0.1 in
   * staging to capture a sample of perf traces.
   */
  tracesSampleRate?: number;
  /** Strip the request body from breadcrumbs (default true for PII safety). */
  scrubRequestBodies?: boolean;
}

export interface SentrySanitizerOptions {
  scrubRequestBodies?: boolean;
}

const NOOP_ADAPTER: SentryAdapter = {
  enabled: false,
  captureException() {},
  captureMessage() {},
  async flush() { return true; },
};

export function sanitizeSentryEvent<T extends Record<string, unknown>>(
  event: T,
  options: SentrySanitizerOptions = {},
): T {
  const sanitized = redactPii(event) as T;
  const request = sanitized['request'];
  if (options.scrubRequestBodies !== false && isRecord(request) && 'data' in request) {
    return {
      ...sanitized,
      request: {
        ...request,
        data: '[scrubbed]',
      },
    } as T;
  }
  return sanitized;
}

export async function createSentryAdapter(options: SentryAdapterOptions = {}): Promise<SentryAdapter> {
  const dsn = options.dsn?.trim();
  if (!dsn) return NOOP_ADAPTER;
  try {
    // Dynamic import keeps @sentry/node optional. The module specifier is built
    // from a string variable so tsc treats this as a runtime resolution; the
    // package may not be installed in dev / self-hosted builds.
    const moduleName: string = '@sentry/node';
    // @ts-ignore - optional peer dependency; resolves in some build environments and not others.
    const sentryModule = (await import(moduleName).catch(() => undefined)) as {
      init: (opts: Record<string, unknown>) => void;
      withScope: (fn: (scope: { setTags: (t: Record<string, string>) => void }) => void) => void;
      captureException: (error: unknown) => void;
      captureMessage: (message: string, level: string) => void;
      flush: (ms: number) => Promise<boolean>;
    } | undefined;
    const sentry = sentryModule;
    if (!sentry) {
      // SDK isn't installed; keep platform usable in dev. Log once to stderr
      // so operators see why telemetry isn't initialising.
      // eslint-disable-next-line no-console
      console.warn('[greybox-cloud] SENTRY_DSN set but @sentry/node is not installed; telemetry disabled.');
      return NOOP_ADAPTER;
    }
    sentry.init({
      dsn,
      environment: options.environment ?? process.env.NODE_ENV ?? 'development',
      release: options.release ?? process.env.GREYBOX_CLOUD_VERSION,
      tracesSampleRate: options.tracesSampleRate ?? 0,
      beforeSend: (event: Record<string, unknown>) => sanitizeSentryEvent(event, {
        scrubRequestBodies: options.scrubRequestBodies,
      }),
    });
    return {
      enabled: true,
      captureException(error: unknown, tags?: Record<string, string>) {
        sentry.withScope((scope: { setTags: (t: Record<string, string>) => void }) => {
          if (tags) scope.setTags(tags);
          sentry.captureException(error);
        });
      },
      captureMessage(message: string, level: 'fatal' | 'error' | 'warning' | 'info' = 'info', tags?: Record<string, string>) {
        sentry.withScope((scope: { setTags: (t: Record<string, string>) => void }) => {
          if (tags) scope.setTags(tags);
          sentry.captureMessage(message, level);
        });
      },
      flush: (timeoutMs = 2000) => sentry.flush(timeoutMs),
    };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('[greybox-cloud] Failed to initialise Sentry, falling back to noop adapter:', error);
    return NOOP_ADAPTER;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
