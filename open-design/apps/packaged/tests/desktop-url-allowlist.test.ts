/**
 * Regression coverage for the URL-policy helpers re-exported from
 * `@ai-game-design-studio/desktop/main`. The helpers are part of the security
 * boundary for child-window navigation (see `setWindowOpenHandler`
 * in `apps/desktop/src/main/runtime.ts`); the packaged workspace
 * hosts the test because `apps/desktop` itself has no vitest setup
 * yet — adding one is more scope than #911 needs.
 *
 * @see https://github.com/ai-game-design-studio/ai-game-design-studio/issues/911
 */

// Mock electron at import time — `runtime.ts` pulls `BrowserWindow`,
// `dialog`, `ipcMain`, and `shell` from it at top level. None of those
// surfaces are exercised by the pure URL helpers we want to test, so a
// minimal stub is enough to keep the import clean in a non-Electron
// vitest environment.
import { vi } from 'vitest';

vi.mock('electron', () => ({
  BrowserWindow: class {},
  dialog: { showOpenDialog: vi.fn() },
  ipcMain: { handle: vi.fn(), removeHandler: vi.fn() },
  shell: { openExternal: vi.fn() },
  app: { whenReady: vi.fn() },
}));

import { describe, expect, it } from 'vitest';

import {
  isAllowedChildWindowUrl,
  isHttpUrl,
  resolveDesktopStatusUrl,
} from '@ai-game-design-studio/desktop/main';

describe('isHttpUrl', () => {
  it('matches http and https protocols', () => {
    expect(isHttpUrl('http://127.0.0.1:1234/api/x')).toBe(true);
    expect(isHttpUrl('https://example.com')).toBe(true);
  });

  it('rejects non-http schemes', () => {
    expect(isHttpUrl('agds://app/foo')).toBe(false);
    expect(isHttpUrl('od://app/foo')).toBe(false);
    expect(isHttpUrl('file:///etc/passwd')).toBe(false);
    expect(isHttpUrl('blob:http://x/abc')).toBe(false);
    expect(isHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isHttpUrl('data:text/html,foo')).toBe(false);
  });

  it('rejects malformed URLs', () => {
    expect(isHttpUrl('not a url')).toBe(false);
    expect(isHttpUrl('')).toBe(false);
  });
});

describe('isAllowedChildWindowUrl (issue #911)', () => {
  it('allows the packaged agds:// scheme so live game artifact previews open in a child BrowserWindow', () => {
    // The flagship #911 case: the Orbit panel's "Open artifact"
    // button is an `<a target="_blank" href="/api/live-artifacts/.../preview?projectId=...">`.
    // In packaged builds the renderer lives at `agds://app/`, so that
    // relative href resolves to `agds://app/api/live-artifacts/.../preview?projectId=...`
    // by the time `setWindowOpenHandler` sees it.
    expect(isAllowedChildWindowUrl('agds://app/api/live-artifacts/abc/preview?projectId=p1')).toBe(true);
    expect(isAllowedChildWindowUrl('agds://app/')).toBe(true);
  });

  it('rejects the retired od:// packaged scheme', () => {
    expect(isAllowedChildWindowUrl('od://app/api/live-artifacts/abc/preview?projectId=p1')).toBe(false);
    expect(isAllowedChildWindowUrl('od://app/')).toBe(false);
  });

  it('continues to allow blob: URLs (existing behaviour)', () => {
    // In-renderer generated downloads / object URLs need a child
    // window so the user can land on the file. Pinned to guard
    // against an accidental regression that drops this case.
    expect(isAllowedChildWindowUrl('blob:http://127.0.0.1:1234/abc-uuid')).toBe(true);
  });

  it('does NOT allow http(s) URLs — those route to shell.openExternal in the same handler', () => {
    // The `setWindowOpenHandler` body checks `isHttpUrl` separately
    // and opens those in the user's default browser instead of a
    // child window. Routing http:// through the child-window allow
    // path would pop a stripped-down BrowserWindow with no app
    // chrome, which is worse than `shell.openExternal`.
    expect(isAllowedChildWindowUrl('http://example.com')).toBe(false);
    expect(isAllowedChildWindowUrl('https://example.com')).toBe(false);
    expect(isAllowedChildWindowUrl('http://127.0.0.1:17579/api/foo')).toBe(false);
  });

  it('does NOT allow potentially dangerous schemes', () => {
    // Security boundary: keep the allowlist narrow. `file://` could
    // be used to pop OS-level files, `javascript:` is an execution
    // vector, `data:` lets attackers craft inline pages.
    expect(isAllowedChildWindowUrl('file:///etc/passwd')).toBe(false);
    expect(isAllowedChildWindowUrl('javascript:alert(1)')).toBe(false);
    expect(isAllowedChildWindowUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
  });

  it('returns false for malformed URLs without throwing', () => {
    expect(isAllowedChildWindowUrl('not a url')).toBe(false);
    expect(isAllowedChildWindowUrl('')).toBe(false);
  });
});

describe('resolveDesktopStatusUrl', () => {
  it('reports the pending URL while navigation is in flight', () => {
    expect(resolveDesktopStatusUrl(null, 'agds://app/')).toBe('agds://app/');
    expect(resolveDesktopStatusUrl('http://127.0.0.1:3000/', 'agds://app/')).toBe('agds://app/');
  });

  it('falls back to the last successful URL when no navigation is pending', () => {
    expect(resolveDesktopStatusUrl('agds://app/', null)).toBe('agds://app/');
    expect(resolveDesktopStatusUrl(null, null)).toBe(null);
  });
});
