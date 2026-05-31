'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type ThemeMode = 'light' | 'dark' | 'system';

export const THEME_STORAGE_KEY = 'greybox-theme';

export interface ThemeContextValue {
  /** The user's stored preference: light/dark/system. */
  theme: ThemeMode;
  /** The effective theme after resolving system: always light or dark. */
  resolved: 'light' | 'dark';
  /** Set the theme preference. */
  setTheme: (next: ThemeMode) => void;
  /** Convenience cycle: light → dark → system → light. */
  cycle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const VALID_MODES: readonly ThemeMode[] = ['light', 'dark', 'system'];

function isValidTheme(value: unknown): value is ThemeMode {
  return typeof value === 'string' && VALID_MODES.includes(value as ThemeMode);
}

/**
 * Read the saved theme preference from localStorage. The lookup is wrapped
 * in try/catch because the underlying store can throw in private mode and
 * because the constructor of a defective `localStorage` polyfill can throw
 * when used inside an SSR shim. We default to "system" so the choice
 * follows the OS preference until the creator opts in.
 */
function readStoredTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'system';
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (raw && isValidTheme(raw)) return raw;
  } catch {
    // localStorage may be unavailable (Safari private mode, locked-down
    // origin policy in older Electron). Fall back to system.
  }
  return 'system';
}

function persistTheme(value: ThemeMode): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, value);
  } catch {
    // Best effort; not catastrophic if it fails.
  }
}

function readSystemPreference(): 'light' | 'dark' {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'dark';
  }
  try {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

function applyThemeToDocument(theme: ThemeMode): 'light' | 'dark' {
  const resolved: 'light' | 'dark' = theme === 'system' ? readSystemPreference() : theme;
  if (typeof document === 'undefined') return resolved;
  const root = document.documentElement;
  if (theme === 'system') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', theme);
  }
  return resolved;
}

export interface ThemeProviderProps {
  children: ReactNode;
  /** Override the initial theme — primarily for tests. */
  initialTheme?: ThemeMode;
}

export function ThemeProvider({ children, initialTheme }: ThemeProviderProps) {
  const [theme, setThemeState] = useState<ThemeMode>(() => initialTheme ?? readStoredTheme());
  const [resolved, setResolved] = useState<'light' | 'dark'>(() => applyThemeToDocument(initialTheme ?? readStoredTheme()));

  // Apply the chosen theme to <html data-theme="..."> and persist it.
  useEffect(() => {
    const next = applyThemeToDocument(theme);
    setResolved(next);
    persistTheme(theme);
  }, [theme]);

  // Honor live system-preference changes when theme=='system'.
  useEffect(() => {
    if (theme !== 'system') return;
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia('(prefers-color-scheme: light)');
    const handler = () => setResolved(mql.matches ? 'light' : 'dark');
    handler();
    // matchMedia.addEventListener is the modern API; addListener is the
    // older Safari-on-iOS-13 fallback.
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', handler);
      return () => mql.removeEventListener('change', handler);
    }
    if (typeof mql.addListener === 'function') {
      mql.addListener(handler);
      return () => mql.removeListener(handler);
    }
    return undefined;
  }, [theme]);

  const setTheme = useCallback((next: ThemeMode) => {
    if (!isValidTheme(next)) return;
    setThemeState(next);
  }, []);

  const cycle = useCallback(() => {
    setThemeState((prev) => {
      // Cycle order matches the user-facing button copy: light → dark → system → light
      if (prev === 'light') return 'dark';
      if (prev === 'dark') return 'system';
      return 'light';
    });
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, resolved, setTheme, cycle }),
    [theme, resolved, setTheme, cycle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be called inside a <ThemeProvider>');
  }
  return ctx;
}
