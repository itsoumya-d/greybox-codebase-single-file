/**
 * Browser-side telemetry adapter for greybox-cloud's Sentry and PostHog.
 *
 * Design constraints (per AGENTS.md):
 *   - Project-owned source stays TypeScript-first; no .js shims.
 *   - Default OFF. The adapter is a no-op until the creator has BOTH
 *     opted in via the Settings → Privacy panel AND the corresponding
 *     env var is configured at build time.
 *   - Both SDKs are loaded via dynamic import so creators who never opt
 *     in never pay the bundle cost — Next.js produces a separate chunk
 *     that is only fetched on consent.
 *   - Adapter never resolves with a real instance unless the SDK module
 *     actually loaded, so missing optional deps cannot break boot.
 *
 * Wire from App.tsx after the privacy decision has been resolved:
 *
 *   useEffect(() => {
 *     if (!config.privacyDecisionAt || !config.installationId) return;
 *     void initTelemetry({
 *       installationId: config.installationId,
 *       allowMetrics: config.telemetry?.metrics === true,
 *       release: process.env.NEXT_PUBLIC_GREYBOX_VERSION,
 *     });
 *   }, [config.installationId, config.privacyDecisionAt, config.telemetry?.metrics]);
 */

export interface TelemetryAdapter {
  readonly enabled: boolean;
  captureException(error: unknown, tags?: Record<string, string>): void;
  captureEvent(name: string, properties?: Record<string, unknown>): void;
  shutdown(): Promise<void>;
}

export interface TelemetryInitOptions {
  /** Anonymous installation id; passed as the user id to both SDKs. */
  installationId: string;
  /** Has the creator explicitly opted in to anonymous usage metrics? */
  allowMetrics: boolean;
  /** Has the creator opted in to capturing error stack traces (Sentry)? */
  allowErrors?: boolean;
  /** Build-time release tag (commit sha or version). */
  release?: string;
  /** Override environment vars for tests. */
  env?: Partial<Record<'NEXT_PUBLIC_SENTRY_DSN' | 'NEXT_PUBLIC_POSTHOG_KEY' | 'NEXT_PUBLIC_POSTHOG_HOST', string>>;
}

const NOOP: TelemetryAdapter = {
  enabled: false,
  captureException() {},
  captureEvent() {},
  async shutdown() {},
};

let active: TelemetryAdapter = NOOP;

export function getTelemetry(): TelemetryAdapter {
  return active;
}

/**
 * Initialise telemetry. Idempotent: subsequent calls with the same options
 * are no-ops. Calling with allowMetrics=false (the default state before
 * consent) immediately tears down any active adapter so revocation takes
 * effect within the running session.
 */
export async function initTelemetry(options: TelemetryInitOptions): Promise<TelemetryAdapter> {
  if (typeof window === 'undefined') return NOOP;
  if (!options.allowMetrics && options.allowErrors !== true) {
    await active.shutdown();
    active = NOOP;
    return NOOP;
  }
  const env = options.env ?? (process.env as unknown as TelemetryInitOptions['env']);
  const sentryDsn = env?.NEXT_PUBLIC_SENTRY_DSN?.trim();
  const posthogKey = env?.NEXT_PUBLIC_POSTHOG_KEY?.trim();
  const posthogHost = env?.NEXT_PUBLIC_POSTHOG_HOST?.trim() || 'https://us.i.posthog.com';

  const sentryClient = sentryDsn && options.allowErrors !== false ? await loadSentry(sentryDsn, options) : undefined;
  const posthogClient = posthogKey && options.allowMetrics ? await loadPosthog(posthogKey, posthogHost, options) : undefined;

  if (!sentryClient && !posthogClient) {
    active = NOOP;
    return active;
  }

  active = {
    enabled: true,
    captureException(error, tags) {
      try {
        sentryClient?.captureException(error, tags);
      } catch {
        // Telemetry must never throw into application code.
      }
    },
    captureEvent(name, properties) {
      try {
        posthogClient?.capture(name, properties);
      } catch {
        // Telemetry must never throw into application code.
      }
    },
    async shutdown() {
      const tasks: Promise<unknown>[] = [];
      if (sentryClient) tasks.push(sentryClient.flush(2000).catch(() => undefined));
      if (posthogClient) {
        try { posthogClient.opt_out_capturing(); } catch { /* ignore */ }
      }
      await Promise.all(tasks);
    },
  };
  return active;
}

type SentryBrowser = {
  init: (options: Record<string, unknown>) => void;
  withScope: (fn: (scope: { setTags: (tags: Record<string, string>) => void; setUser: (user: { id: string }) => void }) => void) => void;
  captureException: (error: unknown) => void;
  flush: (timeoutMs: number) => Promise<boolean>;
};

interface SentryClientLike {
  captureException(error: unknown, tags?: Record<string, string>): void;
  flush(timeoutMs: number): Promise<boolean>;
}

async function loadSentry(dsn: string, options: TelemetryInitOptions): Promise<SentryClientLike | undefined> {
  const moduleName: string = '@sentry/browser';
  try {
    // @ts-ignore — optional peer dependency.
    const sentry = (await import(/* webpackIgnore: true */ moduleName).catch(() => undefined)) as SentryBrowser | undefined;
    if (!sentry) return undefined;
    sentry.init({
      dsn,
      release: options.release,
      environment: process.env.NODE_ENV ?? 'development',
      tracesSampleRate: 0,
      // Replays are off by default — they capture content which violates the
      // "telemetry.content default off" policy in TelemetryConfig.
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,
    });
    return {
      captureException(error: unknown, tags?: Record<string, string>) {
        sentry.withScope((scope) => {
          scope.setUser({ id: options.installationId });
          if (tags) scope.setTags(tags);
          sentry.captureException(error);
        });
      },
      flush: (timeoutMs) => sentry.flush(timeoutMs),
    };
  } catch {
    return undefined;
  }
}

type PosthogBrowser = {
  init: (key: string, options: Record<string, unknown>) => unknown;
  identify: (id: string) => void;
  capture: (event: string, properties?: Record<string, unknown>) => void;
  opt_out_capturing: () => void;
};

interface PosthogClientLike {
  capture(event: string, properties?: Record<string, unknown>): void;
  opt_out_capturing(): void;
}

async function loadPosthog(key: string, host: string, options: TelemetryInitOptions): Promise<PosthogClientLike | undefined> {
  const moduleName: string = 'posthog-js';
  try {
    // @ts-ignore — optional peer dependency.
    const mod = (await import(/* webpackIgnore: true */ moduleName).catch(() => undefined)) as { default?: PosthogBrowser } | undefined;
    const ph = mod?.default;
    if (!ph) return undefined;
    ph.init(key, {
      api_host: host,
      // Privacy defaults: no auto IP geolocation, no automatic recording.
      ip: false,
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      disable_session_recording: true,
      // Persist in localStorage only; cookies require an EU cookie banner.
      persistence: 'localStorage',
      loaded: (client: unknown) => {
        try {
          (client as PosthogBrowser).identify(options.installationId);
        } catch {
          // ignore identify failures
        }
      },
    });
    return {
      capture: (event, properties) => ph.capture(event, properties),
      opt_out_capturing: () => ph.opt_out_capturing(),
    };
  } catch {
    return undefined;
  }
}
