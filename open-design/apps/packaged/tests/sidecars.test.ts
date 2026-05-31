/**
 * Regression coverage for the AGDS_LEGACY_DATA_DIR migration-aware
 * daemon status timeout in apps/packaged/src/sidecars.ts.
 *
 * Background: when the user is recovering 0.3.x `.od/` data via
 * AGDS_LEGACY_DATA_DIR, apps/daemon/src/legacy-data-migrator.ts runs a
 * synchronous payload copy at module import time, before the daemon
 * sidecar can answer status. With the default 35-second status budget
 * a multi-GB legacy `.od/projects` or `.od/artifacts` tree can hit the
 * timeout while staging is still copying, after which the parent tears
 * the child down mid-promotion and can leave dataDir half-promoted
 * even with the in-process rollback.
 *
 * @see apps/packaged/src/sidecars.ts
 * @see apps/daemon/src/legacy-data-migrator.ts
 * @see https://github.com/ai-game-design-studio/ai-game-design-studio/issues/710
 */
import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  buildPackagedDaemonSpawnEnv,
  resolveDaemonStatusTimeoutMs,
  resolvePackagedChildBaseEnv,
  resolvePackagedPathEnv,
  waitForStatus,
} from '../src/sidecars.js';
import type { PackagedNamespacePaths } from '../src/paths.js';

describe('resolveDaemonStatusTimeoutMs', () => {
  it('uses the default 35-second budget for normal cold boots', () => {
    expect(resolveDaemonStatusTimeoutMs({})).toBe(35_000);
  });

  it('treats an empty AGDS_LEGACY_DATA_DIR as unset', () => {
    expect(resolveDaemonStatusTimeoutMs({ AGDS_LEGACY_DATA_DIR: '' })).toBe(35_000);
  });

  it('extends the budget to 30 minutes when AGDS_LEGACY_DATA_DIR is set', () => {
    // The packaged sidecar must give the daemon a long-enough window to
    // sync-copy a multi-GB legacy `.od/` payload. Anything below ~10
    // minutes was historically observed to time out on real installs.
    const value = resolveDaemonStatusTimeoutMs({
      AGDS_LEGACY_DATA_DIR: '/path/to/old/.od',
    });
    expect(value).toBeGreaterThanOrEqual(10 * 60 * 1000);
    expect(value).toBe(30 * 60 * 1000);
  });

  it('ignores deprecated OD_LEGACY_DATA_DIR timeout aliases', () => {
    expect(resolveDaemonStatusTimeoutMs({ OD_LEGACY_DATA_DIR: '/path/to/old/.od' })).toBe(
      35_000,
    );
  });

  it('uses the default budget when AGDS_LEGACY_DATA_DIR is blank even if OD_LEGACY_DATA_DIR is set', () => {
    expect(resolveDaemonStatusTimeoutMs({
      AGDS_LEGACY_DATA_DIR: ' ',
      OD_LEGACY_DATA_DIR: '/path/to/old/.od',
    })).toBe(35_000);
  });

  it('falls back to process.env when called with no argument', () => {
    const originalAgds = process.env.AGDS_LEGACY_DATA_DIR;
    const originalOd = process.env.OD_LEGACY_DATA_DIR;
    try {
      delete process.env.AGDS_LEGACY_DATA_DIR;
      delete process.env.OD_LEGACY_DATA_DIR;
      expect(resolveDaemonStatusTimeoutMs()).toBe(35_000);
      process.env.OD_LEGACY_DATA_DIR = '/some/legacy/path';
      expect(resolveDaemonStatusTimeoutMs()).toBe(35_000);
      process.env.AGDS_LEGACY_DATA_DIR = '/some/legacy/path';
      expect(resolveDaemonStatusTimeoutMs()).toBe(30 * 60 * 1000);
    } finally {
      if (originalAgds == null) delete process.env.AGDS_LEGACY_DATA_DIR;
      else process.env.AGDS_LEGACY_DATA_DIR = originalAgds;
      if (originalOd == null) delete process.env.OD_LEGACY_DATA_DIR;
      else process.env.OD_LEGACY_DATA_DIR = originalOd;
    }
  });
});

describe('packaged child Vite+ environment forwarding', () => {
  it('keeps VP_HOME in the packaged child base env without forwarding unrelated variables', () => {
    const env = resolvePackagedChildBaseEnv({
      HOME: '/Users/tester',
      LANG: 'en_US.UTF-8',
      RANDOM_INTERNAL_FLAG: 'drop-me',
      VP_HOME: '/Users/tester/.custom-vite-plus',
    });

    expect(env).toMatchObject({
      HOME: '/Users/tester',
      LANG: 'en_US.UTF-8',
      VP_HOME: '/Users/tester/.custom-vite-plus',
    });
    expect(env.RANDOM_INTERNAL_FLAG).toBeUndefined();
  });

  it('adds custom VP_HOME/bin to the packaged PATH builder', () => {
    const vpHome = mkdtempSync(join(tmpdir(), 'agds-packaged-vp-home-'));
    const originalVpHome = process.env.VP_HOME;
    try {
      process.env.VP_HOME = vpHome;
      const pathEntries = resolvePackagedPathEnv('/usr/bin').split(delimiter);

      expect(pathEntries).toContain('/usr/bin');
      expect(pathEntries).toContain(join(vpHome, 'bin'));
    } finally {
      if (originalVpHome == null) delete process.env.VP_HOME;
      else process.env.VP_HOME = originalVpHome;
      rmSync(vpHome, { recursive: true, force: true });
    }
  });
});

/**
 * Build a child-process stand-in that satisfies the `watch.child`
 * shape `waitForStatus` consumes. We only use `once('exit')`,
 * `off('exit')`, and the synchronous `exitCode` / `signalCode`
 * fields, so an EventEmitter plus those two properties is enough.
 */
function fakeChild(): EventEmitter & {
  exitCode: number | null;
  signalCode: NodeJS.Signals | null;
  fireExit: (code: number | null, signal: NodeJS.Signals | null) => void;
} {
  const emitter = new EventEmitter() as EventEmitter & {
    exitCode: number | null;
    signalCode: NodeJS.Signals | null;
    fireExit: (code: number | null, signal: NodeJS.Signals | null) => void;
  };
  emitter.exitCode = null;
  emitter.signalCode = null;
  emitter.fireExit = (code, signal) => {
    emitter.exitCode = code;
    emitter.signalCode = signal;
    emitter.emit('exit', code, signal);
  };
  return emitter;
}

describe('buildPackagedDaemonSpawnEnv', () => {
  // PR #974 round-5 (lefarcen P2): the daemon's import-folder gate must
  // be ON when an Electron desktop is being started alongside the daemon
  // and OFF in headless packaged mode (daemon+web only, no shell.openPath
  // surface, no client to register a secret). Pin both branches against
  // a real pure-helper invocation so a future refactor can't silently
  // regress either side.
  function fakePaths(): PackagedNamespacePaths {
    return {
      cacheRoot: '/tmp/agds-pkg/cache',
      dataRoot: '/tmp/agds-pkg/data',
      desktopIdentityPath: '/tmp/agds-pkg/runtime/desktop-root.json',
      desktopLogPath: '/tmp/agds-pkg/logs/desktop/latest.log',
      desktopLogsRoot: '/tmp/agds-pkg/logs/desktop',
      electronSessionDataRoot: '/tmp/agds-pkg/user-data/session',
      electronUserDataRoot: '/tmp/agds-pkg/user-data',
      logsRoot: '/tmp/agds-pkg/logs',
      namespaceRoot: '/tmp/agds-pkg',
      resourceRoot: '/tmp/agds-pkg/resources',
      runtimeRoot: '/tmp/agds-pkg/runtime',
      webIdentityPath: '/tmp/agds-pkg/runtime/web-root.json',
    };
  }

  it('sets AGDS_REQUIRE_DESKTOP_AUTH=1 when requireDesktopAuth=true (Electron entry)', () => {
    const env = buildPackagedDaemonSpawnEnv(fakePaths(), {
      appVersion: '1.2.3',
      daemonCliEntry: null,
      legacyDataDir: null,
      requireDesktopAuth: true,
    });
    expect(env.AGDS_REQUIRE_DESKTOP_AUTH).toBe('1');
    expect(env.AGDS_DATA_DIR).toBe('/tmp/agds-pkg/data');
    expect(env.AGDS_RESOURCE_ROOT).toBe('/tmp/agds-pkg/resources');
    expect(env.AGDS_APP_VERSION).toBe('1.2.3');
    expect(env.AGDS_LEGACY_DATA_DIR).toBeUndefined();
    expect(env.OD_PORT).toBeUndefined();
    expect(env.OD_REQUIRE_DESKTOP_AUTH).toBeUndefined();
    expect(env.OD_DATA_DIR).toBeUndefined();
    expect(env.OD_RESOURCE_ROOT).toBeUndefined();
    expect(env.OD_APP_VERSION).toBeUndefined();
    expect(env.OD_LEGACY_DATA_DIR).toBeUndefined();
  });

  it('omits AGDS_REQUIRE_DESKTOP_AUTH entirely when requireDesktopAuth=false (headless)', () => {
    const env = buildPackagedDaemonSpawnEnv(fakePaths(), {
      appVersion: null,
      daemonCliEntry: null,
      legacyDataDir: null,
      requireDesktopAuth: false,
    });
    // Round-5 (lefarcen P2): MUST NOT set the env var, even to "0" —
    // the daemon's gate trigger is `process.env.AGDS_REQUIRE_DESKTOP_AUTH === '1'`,
    // so a literal "0" would behave the same as omitted today, but a
    // future code change to truthy-check the variable would silently
    // re-arm the gate. Omitted is the intent.
    expect('AGDS_REQUIRE_DESKTOP_AUTH' in env).toBe(false);
    expect('OD_REQUIRE_DESKTOP_AUTH' in env).toBe(false);
    expect(env.AGDS_DATA_DIR).toBe('/tmp/agds-pkg/data');
    expect(env.OD_PORT).toBeUndefined();
    expect(env.OD_DATA_DIR).toBeUndefined();
    expect(env.AGDS_APP_VERSION).toBeUndefined();
    expect(env.OD_APP_VERSION).toBeUndefined();
  });

  it('forwards AGDS_LEGACY_DATA_DIR only when set', () => {
    const withLegacy = buildPackagedDaemonSpawnEnv(fakePaths(), {
      appVersion: null,
      daemonCliEntry: null,
      legacyDataDir: '/old/.od',
      requireDesktopAuth: false,
    });
    expect(withLegacy.AGDS_LEGACY_DATA_DIR).toBe('/old/.od');
    expect(withLegacy.OD_LEGACY_DATA_DIR).toBeUndefined();

    const withEmptyLegacy = buildPackagedDaemonSpawnEnv(fakePaths(), {
      appVersion: null,
      daemonCliEntry: null,
      legacyDataDir: '',
      requireDesktopAuth: true,
    });
    // Empty string must NOT propagate — daemon treats "env set but
    // path invalid" as an error and refuses to start.
    expect('AGDS_LEGACY_DATA_DIR' in withEmptyLegacy).toBe(false);
    expect('OD_LEGACY_DATA_DIR' in withEmptyLegacy).toBe(false);
  });

  it('forwards daemonCliEntry through AGDS_DAEMON_CLI_PATH only when set', () => {
    const env = buildPackagedDaemonSpawnEnv(fakePaths(), {
      appVersion: null,
      daemonCliEntry: '/path/to/cli/dist/index.js',
      legacyDataDir: null,
      requireDesktopAuth: true,
    });
    expect(env.AGDS_DAEMON_CLI_PATH).toBe('/path/to/cli/dist/index.js');
    expect(env.OD_DAEMON_CLI_PATH).toBeUndefined();
  });
});

describe('waitForStatus child-exit fast-fail', () => {
  // mrcfps round-7: when AGDS_LEGACY_DATA_DIR is set the daemon status
  // budget extends to 30 minutes for legitimate large-payload migrations.
  // But a daemon that throws LegacyMigrationError at startup (invalid
  // legacy dir, existing target payload, symlink, marker write failure)
  // exits before reporting status, and waiting the full 30 minutes makes
  // the packaged studio look hung. Racing the IPC polling against the
  // child's exit event surfaces the failure promptly with a pointer to
  // the daemon log.

  it('rejects within milliseconds when the child exits before status is ready', async () => {
    const child = fakeChild();
    const ipcPath = '/tmp/agds-test-no-such-ipc-' + Date.now();
    const logPath = '/tmp/agds-test-daemon.log';

    const startedAt = Date.now();
    const promise = waitForStatus<{ url: string | null }>(
      ipcPath,
      (status) => status.url != null,
      30 * 60 * 1000,
      { child, logPath },
    );

    // Simulate the daemon throwing in its startup migrator and exiting
    // immediately. With the old code, the wait would have blocked for
    // the full 30-minute budget; with the fix it must reject fast.
    setTimeout(() => child.fireExit(1, null), 50);

    let captured: unknown;
    try {
      await promise;
    } catch (err) {
      captured = err;
    }
    const elapsed = Date.now() - startedAt;

    expect(captured).toBeInstanceOf(Error);
    expect((captured as Error).message).toMatch(/daemon exited before reporting status/);
    expect((captured as Error).message).toContain('code=1');
    expect((captured as Error).message).toContain(logPath);

    // The whole point: don't sit through DAEMON_MIGRATION_STATUS_TIMEOUT_MS.
    // Allow generous slack for slow CI runners; the fix should bound this
    // to roughly the IPC poll cadence (150ms) plus a couple of timer ticks.
    expect(elapsed).toBeLessThan(2_000);
  });

  it('detects a child that exited synchronously before waitForStatus was entered', async () => {
    const child = fakeChild();
    // Pretend the daemon process already exited before we got here. The
    // 'exit' event has already fired and would not re-fire for a late
    // listener, so waitForStatus must read the synchronous exitCode /
    // signalCode fields to see the bad state.
    child.exitCode = 2;
    child.signalCode = null;

    const startedAt = Date.now();
    let captured: unknown;
    try {
      await waitForStatus<{ url: string | null }>(
        '/tmp/agds-test-no-such-ipc-pre-' + Date.now(),
        (status) => status.url != null,
        30 * 60 * 1000,
        { child, logPath: '/tmp/agds-test-daemon.log' },
      );
    } catch (err) {
      captured = err;
    }
    const elapsed = Date.now() - startedAt;

    expect(captured).toBeInstanceOf(Error);
    expect((captured as Error).message).toMatch(/daemon exited before reporting status/);
    expect((captured as Error).message).toContain('code=2');
    expect(elapsed).toBeLessThan(2_000);
  });
});
