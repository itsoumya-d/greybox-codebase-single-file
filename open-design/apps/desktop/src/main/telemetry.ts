// Electron-side Sentry adapter. Mirrors the daemon and web telemetry
// adapters so the same opt-in consent model applies across all three
// processes in the open-design product.
//
// Design constraints (per AGENTS.md):
//   - Default OFF. Adapter is a no-op unless the creator has stored
//     telemetry consent in app-config.json AND AGDS_SENTRY_DSN is set.
//   - @sentry/electron loaded via dynamic import so installs without the
//     optional dep still boot cleanly.
//   - Privacy decision is read from the daemon's app-config.json via HTTP,
//     NOT directly from the filesystem, so consent flows through the same
//     Settings panel users already interact with.
//   - Bridges the main-process Sentry init into the renderer automatically;
//     @sentry/electron handles cross-process plumbing (crashpad, IPC).

export interface DesktopTelemetryAdapter {
  readonly enabled: boolean;
  captureException(error: unknown, tags?: Record<string, string>): void;
  shutdown(timeoutMs?: number): Promise<void>;
}

export interface DesktopTelemetryInitOptions {
  /** Anonymous installation id, used as the user id on captured events. */
  installationId: string;
  /** Has the creator opted in to error reporting? */
  allowErrors: boolean;
  /** Build-time release tag (commit sha or version). */
  release?: string;
  env?: Partial<Record<'AGDS_SENTRY_DSN' | 'NODE_ENV', string>>;
  /** Test injection: skip the real dynamic import and use this loader. */
  loadSentry?: (
    dsn: string,
    options: { release?: string; environment?: string; installationId: string },
  ) => Promise<DesktopSentryClient | undefined>;
}

export interface DesktopSentryClient {
  captureException(error: unknown, tags?: Record<string, string>): void;
  flush(timeoutMs: number): Promise<boolean>;
}

const NOOP: DesktopTelemetryAdapter = {
  enabled: false,
  captureException() {},
  async shutdown() {},
};

let active: DesktopTelemetryAdapter = NOOP;
let installedHandlers = false;

export function getDesktopTelemetry(): DesktopTelemetryAdapter {
  return active;
}

export async function initDesktopTelemetry(
  options: DesktopTelemetryInitOptions,
): Promise<DesktopTelemetryAdapter> {
  if (!options.allowErrors) {
    await active.shutdown();
    active = NOOP;
    return active;
  }
  const env = options.env ?? (process.env as DesktopTelemetryInitOptions['env']);
  const dsn = env?.AGDS_SENTRY_DSN?.trim();
  if (!dsn) {
    active = NOOP;
    return active;
  }
  const loader = options.loadSentry ?? defaultLoadSentry;
  const client = await loader(dsn, {
    installationId: options.installationId,
    ...(options.release ? { release: options.release } : {}),
    ...(env?.NODE_ENV ? { environment: env.NODE_ENV } : { environment: 'development' }),
  });
  if (!client) {
    active = NOOP;
    return active;
  }
  active = {
    enabled: true,
    captureException(error, tags) {
      try {
        client.captureException(error, tags);
      } catch {
        // Telemetry must never throw into the renderer or main loop.
      }
    },
    async shutdown(timeoutMs = 2000) {
      try {
        await client.flush(timeoutMs);
      } catch {
        // ignore at shutdown
      }
    },
  };
  installProcessHandlers();
  return active;
}

function installProcessHandlers(): void {
  if (installedHandlers) return;
  installedHandlers = true;
  process.on('uncaughtException', (err) => {
    try {
      active.captureException(err, { kind: 'uncaughtException', process: 'main' });
    } catch {
      // ignore
    }
  });
  process.on('unhandledRejection', (reason) => {
    try {
      active.captureException(reason, { kind: 'unhandledRejection', process: 'main' });
    } catch {
      // ignore
    }
  });
}

type SentryElectronModule = {
  init: (options: Record<string, unknown>) => void;
  withScope: (
    fn: (scope: {
      setTags: (tags: Record<string, string>) => void;
      setUser: (user: { id: string }) => void;
    }) => void,
  ) => void;
  captureException: (error: unknown) => void;
  flush: (timeoutMs: number) => Promise<boolean>;
};

async function defaultLoadSentry(
  dsn: string,
  options: { release?: string; environment?: string; installationId: string },
): Promise<DesktopSentryClient | undefined> {
  // Module name escaped through a variable so Electron's bundler doesn't try
  // to follow it. @sentry/electron is an optional peer dependency.
  const moduleName: string = '@sentry/electron/main';
  try {
    const sentry = (await import(/* @vite-ignore */ moduleName).catch(() => undefined)) as
      | SentryElectronModule
      | undefined;
    if (!sentry) return undefined;
    sentry.init({
      dsn,
      ...(options.release ? { release: options.release } : {}),
      ...(options.environment ? { environment: options.environment } : {}),
      // Errors-only by policy. The renderer-side @sentry/electron/renderer
      // initialises automatically when the main-process init runs.
      tracesSampleRate: 0,
      sendDefaultPii: false,
    });
    return {
      captureException(error, tags) {
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

/**
 * Fetch telemetry consent from the daemon over HTTP. Returns
 * `{ allowErrors: false, installationId: 'anonymous' }` on any failure so a
 * down daemon never accidentally activates telemetry.
 */
export async function readDesktopTelemetryConsent(
  daemonUrl: string,
  fetchFn: typeof fetch = fetch,
): Promise<{ allowErrors: boolean; installationId: string }> {
  try {
    const response = await fetchFn(`${daemonUrl.replace(/\/$/, '')}/api/app-config`, {
      method: 'GET',
      headers: { accept: 'application/json' },
    });
    if (!response.ok) return { allowErrors: false, installationId: 'anonymous' };
    const config = (await response.json()) as {
      telemetry?: { metrics?: boolean; content?: boolean };
      installationId?: string;
    };
    const allowErrors = config.telemetry?.metrics === true || config.telemetry?.content === true;
    return {
      allowErrors,
      installationId: config.installationId ?? 'anonymous',
    };
  } catch {
    return { allowErrors: false, installationId: 'anonymous' };
  }
}

// Test helper.
export function resetDesktopTelemetryForTesting(): void {
  active = NOOP;
  installedHandlers = false;
}
