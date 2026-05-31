// SPDX-License-Identifier: Apache-2.0
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  THEME_STORAGE_KEY,
  ThemeProvider,
  useTheme,
} from '../../src/theme/ThemeProvider';
import { ThemeToggle } from '../../src/theme/ThemeToggle';

interface MqlState {
  matches: boolean;
  listeners: Array<(event: { matches: boolean }) => void>;
}

// The vitest setup stubs out window's storage; ensure the spec installs its
// own Storage shim before ThemeProvider mounts.
function createStorageStub(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (k) => (store.has(k) ? store.get(k)! : null),
    setItem: (k, v) => {
      store.set(k, v);
    },
    removeItem: (k) => {
      store.delete(k);
    },
    clear: () => {
      store.clear();
    },
    key: (i) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  } satisfies Storage;
}

function mockMatchMedia(initialLight: boolean): MqlState {
  const state: MqlState = { matches: initialLight, listeners: [] };
  function fakeMatchMedia(query: string) {
    if (query === '(prefers-color-scheme: light)') {
      return {
        matches: state.matches,
        media: query,
        addEventListener: (_evt: string, listener: (event: { matches: boolean }) => void) => {
          state.listeners.push(listener);
        },
        removeEventListener: (_evt: string, listener: (event: { matches: boolean }) => void) => {
          const index = state.listeners.indexOf(listener);
          if (index >= 0) state.listeners.splice(index, 1);
        },
        addListener: (listener: (event: { matches: boolean }) => void) => {
          state.listeners.push(listener);
        },
        removeListener: (listener: (event: { matches: boolean }) => void) => {
          const index = state.listeners.indexOf(listener);
          if (index >= 0) state.listeners.splice(index, 1);
        },
      };
    }
    return {
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
    };
  }
  // The provider calls window.matchMedia; stub it directly with our fake.
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: fakeMatchMedia,
    });
  }
  return state;
}

beforeEach(() => {
  vi.stubGlobal('localStorage', createStorageStub());
  document.documentElement.removeAttribute('data-theme');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ThemeProvider', () => {
  it('defaults to system when no storage key is set', () => {
    mockMatchMedia(false);
    const { result } = renderHook(() => useTheme(), {
      wrapper: ({ children }) => <ThemeProvider>{children}</ThemeProvider>,
    });
    expect(result.current.theme).toBe('system');
    expect(result.current.resolved).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBeNull();
  });

  it('restores the persisted theme on mount', () => {
    mockMatchMedia(false);
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    const { result } = renderHook(() => useTheme(), {
      wrapper: ({ children }) => <ThemeProvider>{children}</ThemeProvider>,
    });
    expect(result.current.theme).toBe('light');
    expect(result.current.resolved).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('cycles light -> dark -> system -> light and persists to localStorage', () => {
    mockMatchMedia(false);
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    const { result } = renderHook(() => useTheme(), {
      wrapper: ({ children }) => <ThemeProvider>{children}</ThemeProvider>,
    });
    expect(result.current.theme).toBe('light');
    act(() => {
      result.current.cycle();
    });
    expect(result.current.theme).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    act(() => {
      result.current.cycle();
    });
    expect(result.current.theme).toBe('system');
    expect(document.documentElement.getAttribute('data-theme')).toBeNull();
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('system');
    act(() => {
      result.current.cycle();
    });
    expect(result.current.theme).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('detects system light preference when no theme is set', () => {
    mockMatchMedia(true);
    const { result } = renderHook(() => useTheme(), {
      wrapper: ({ children }) => <ThemeProvider>{children}</ThemeProvider>,
    });
    expect(result.current.theme).toBe('system');
    expect(result.current.resolved).toBe('light');
  });

  it('ignores invalid stored values and falls back to system', () => {
    mockMatchMedia(false);
    localStorage.setItem(THEME_STORAGE_KEY, 'sepia');
    const { result } = renderHook(() => useTheme(), {
      wrapper: ({ children }) => <ThemeProvider>{children}</ThemeProvider>,
    });
    expect(result.current.theme).toBe('system');
  });
});

describe('ThemeToggle', () => {
  it('renders the current label and cycles on click', () => {
    mockMatchMedia(false);
    render(
      <ThemeProvider initialTheme='light'>
        <ThemeToggle />
      </ThemeProvider>,
    );
    const button = screen.getByRole('button');
    expect(button.getAttribute('data-theme-mode')).toBe('light');
    fireEvent.click(button);
    expect(button.getAttribute('data-theme-mode')).toBe('dark');
    fireEvent.click(button);
    expect(button.getAttribute('data-theme-mode')).toBe('system');
    fireEvent.click(button);
    expect(button.getAttribute('data-theme-mode')).toBe('light');
  });
});
