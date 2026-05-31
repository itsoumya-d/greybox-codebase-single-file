'use client';

import { useTheme } from './ThemeProvider';

const GLYPHS: Record<'light' | 'dark' | 'system', string> = {
  light: '☀',
  dark: '☾',
  system: '⌬',
};

const LABELS: Record<'light' | 'dark' | 'system', string> = {
  light: 'Light',
  dark: 'Dark',
  system: 'System',
};

interface ThemeToggleProps {
  /** Render label text next to the glyph (defaults to true). */
  showLabel?: boolean;
  /** Optional className override; appended to the canonical .theme-toggle class. */
  className?: string;
}

export function ThemeToggle({ showLabel = true, className }: ThemeToggleProps) {
  const { theme, cycle } = useTheme();
  return (
    <button
      type='button'
      className={`theme-toggle${className ? ` ${className}` : ''}`}
      onClick={cycle}
      aria-label={`Switch theme (current: ${LABELS[theme]})`}
      data-theme-mode={theme}
    >
      <span className='theme-toggle__glyph' aria-hidden='true'>
        {GLYPHS[theme]}
      </span>
      {showLabel ? <span className='theme-toggle__label'>{LABELS[theme]}</span> : null}
    </button>
  );
}
