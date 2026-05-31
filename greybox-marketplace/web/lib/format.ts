// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

/**
 * Formatting helpers. All currency is USD cents internally (`Currency = 'usd'`
 * in `src/types.ts`) so the conversions are simple; if more currencies land,
 * this is the only place that needs to change.
 */

import type { Currency } from './marketplace-types';

export function formatCurrencyCents(cents: number, currency: Currency = 'usd'): string {
  if (!Number.isFinite(cents)) return '—';
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    maximumFractionDigits: 2,
  });
  return formatter.format(cents / 100);
}

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('en-US').format(value);
}

export function formatPercentBps(bps: number): string {
  if (!Number.isFinite(bps)) return '—';
  return `${(bps / 100).toFixed(2)}%`;
}

export function formatTimestamp(ms: number | undefined): string {
  if (!ms || !Number.isFinite(ms)) return '—';
  return new Date(ms).toLocaleString();
}

export function formatRelativeMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}
