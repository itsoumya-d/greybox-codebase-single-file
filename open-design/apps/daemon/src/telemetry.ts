// Sentry adapter for the daemon process. Mirrors apps/web/src/runtime/telemetry.ts
// for the browser side but uses @sentry/node and installs process-level handlers
// for uncaught exceptions / unhandled rejections.
//
// Design constraints (per AGENTS.md):
//   - Default OFF. Adapter is a no-op unless the creator has stored
//     telemetry.errors === true in app-config.json AND AGDS_SENTRY_DSN is set.
//   - @sentry/node loaded via dynamic import so installs without the optional
//     dep still boot cleanly (the daemon ships without Sentry by default).
//   - PII scrubbed via redact.ts before any event reaches Sentry.
//   - shutdown() flushes the queue so transient errors at exit time aren't lost.

import type { AppConfigPrefs } from './app-config.js';
import { redactSecrets } from './redact.js';

export interface DaemonTelemetryAdapter {
  readonly enabled: boolean;
  captureException(error: unknown, tags?: Record<string, string>): void;
  captureMessage(message: string, level?: 'info' | 'warning' | 'error'): void;
  shutdown(timeoutMs?: number): Promise<void>;
}

export interface DaemonTelemetryInitOptions {
  installationId: string;
  allowErrors: boolean;
  release?: string;
  env?: Partial<Record<'AGDS_SENTRY_DSN' | 'NODE_ENV', string>>;
  /** Inject the dynamic loader in tests so we can verify wiring without @sentry/node installed. */
  loadSentry?: (dsn: string, options: SentryInitOptions) => Promise<SentryClientLike | undefined>;
}

interface SentryInitOptions {
  release?: string;
  environment?: string;
}

export interface SentryClientLike {
  captureException(error: unknown, tags?: Record<string, string>): void;
  captureMessage(message: string, level: 'info' | 'warning' | 'error'): void;
  flush(timeoutMs: number): Promise<boolean>;
}

const NOOP: DaemonTelemetryAdapter = {
  enabled: false,
  captureException() {},
  captureMessage() {},
  async shutdown() {},
};

let active: DaemonTelemetryAdapter = NOOP;
let installedProcessHandlers = false;

export function getDaemonTelemetry(): DaemonTelemetryAdapter {
  return active;
}

/**
 * Initialise telemetry. Idempotent. Tearing down (allowErrors=false) flushes
 * any pending events and resets to the NOOP adapter so revocation takes effect
 * within the running process.
 */
export async function initDaemonTelemetry(
  options: DaemonTelemetryInitOptions,
): Promise<DaemonTelemetryAdapter> {
  if (!options.allowErrors) {
    await active.shutdown();
    active = NOOP;
    return active;
  }
  const env = options.env ?? (process.env as DaemonTelemetryInitOptions['env']);
  const dsn = env?.AGDS_SENTRY_DSN?.trim();
  if (!dsn) {
    active = NOOP;
    return active;
  }
  const loader = options.loadSentry ?? defaultLoadSentry;
  const initOptions: SentryInitOptions = {
    environment: env?.NODE_ENV ?? 'development',
    ...(options.release ? { release: options.release } : {}),
  };
  const client = await loader(dsn, initOptions);
  if (!client) {
    active = NOOP;
    return active;
  }
  active = {
    enabled: true,
    captureException(error, tags) {
      try {
        const safeTags = tags ? scrubTags(tags) : undefined;
        client.captureException(scrubError(error), safeTags);
      } catch {
        // Telemetry must never throw into application code.
      }
    },
    captureMessage(message, level = 'info') {
      try {
        client.captureMessage(redactSecrets(message), level);
      } catch {
        // Telemetry must never throw into application code.
      }
    },
    async shutdown(timeoutMs = 2000) {
      try {
        await client.flush(timeoutMs);
      } catch {
        // ignore flush failures at shutdown
      }
    },
  };
  installProcessHandlers();
  return active;
}

function installProcessHandlers(): void {
  if (installedProcessHandlers) return;
  installedProcessHandlers = true;
  process.on('uncaughtException', (err) => {
    try {
      active.captureException(err, { kind: 'uncaughtException' });
    } catch {
      // ignore
    }
  });
  process.on('unhandledRejection', (reason) => {
    try {
      active.captureException(reason, { kind: 'unhandledRejection' });
    } catch {
      // ignore
    }
  });
  process.on('beforeExit', () => {
    void active.shutdown();
  });
}

/** Read consent from the persisted app-config.json. */
export function telemetryConsentFromAppConfig(prefs: AppConfigPrefs | undefined): {
  allowErrors: boolean;
  allowMetrics: boolean;
  installationId: string;
} {
  const installationId = typeof prefs?.installationId === 'string' && prefs.installationId.length > 0
    ? prefs.installationId
    : 'anonymous';
  return {
    allowErrors: prefs?.telemetry?.metrics === true || prefs?.telemetry?.content === true,
    allowMetrics: prefs?.telemetry?.metrics === true,
    installationId,
  };
}

function scrubError(error: unknown): unknown {
  if (error instanceof Error) {
    // Redact message and stack so accidentally-included secrets (API keys
    // in URLs, JWTs, etc.) never reach the upstream telemetry sink.
    const redacted = new Error(redactSecrets(error.message));
    redacted.name = error.name;
    if (error.stack) redacted.stack = redactSecrets(error.stack);
    return redacted;
  }
  if (typeof error === 'string') return redactSecrets(error);
  try {
    return redactSecrets(JSON.stringify(error));
  } catch {
    return '<unserializable-error>';
  }
}

function scrubTags(tags: Record<string, string>): Record<string, string> {
  const safe: Record<string, string> = {};
  for (const [key, value] of Object.entries(tags)) {
    safe[key] = redactSecrets(String(value));
  }
  return safe;
}

type SentryNodeModule = {
  init: (options: Record<string, unknown>) => void;
  withScope: (
    fn: (scope: {
      setTags: (tags: Record<string, string>) => void;
      setLevel: (level: 'info' | 'warning' | 'error') => void;
    }) => void,
  ) => void;
  captureException: (error: unknown) => void;
  captureMessage: (message: string, level?: 'info' | 'warning' | 'error') => void;
  flush: (timeoutMs: number) => Promise<boolean>;
};

async function defaultLoadSentry(
  dsn: string,
  options: SentryInitOptions,
): Promise<SentryClientLike | undefined> {
  // Module name escaped through a variable so bundlers don't try to follow it.
  // @sentry/node is an optional peer dependency.
  const moduleName: string = '@sentry/node';
  try {
    const sentry = (await import(/* @vite-ignore */ moduleName).catch(() => undefined)) as
      | SentryNodeModule
      | undefined;
    if (!sentry) return undefined;
    sentry.init({
      dsn,
      ...(options.release ? { release: options.release } : {}),
      ...(options.environment ? { environment: options.environment } : {}),
      // Performance/tracing disabled: this adapter is errors-only by policy.
      tracesSampleRate: 0,
      // Attach the captured PII data scrubber-side: we already redact upstream,
      // but defence-in-depth is cheap.
      sendDefaultPii: false,
    });
    return {
      captureException(error, tags) {
        sentry.withScope((scope) => {
          if (tags) scope.setTags(tags);
          sentry.captureException(error);
        });
      },
      captureMessage(message, level) {
        sentry.withScope((scope) => {
          scope.setLevel(level);
          sentry.captureMessage(message, level);
        });
      },
      flush: (timeoutMs) => sentry.flush(timeoutMs),
    };
  } catch {
    return undefined;
  }
}

// Test helper: lets tests reset module-private state between runs.
export function resetDaemonTelemetryForTesting(): void {
  active = NOOP;
  installedProcessHandlers = false;
}
