// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import test from 'node:test';

import { formatCurrencyCents, formatNumber, formatPercentBps, formatRelativeMs, formatTimestamp } from '../lib/format';

test('formatCurrencyCents renders USD with two decimals', () => {
  assert.equal(formatCurrencyCents(2900), '$29.00');
  assert.equal(formatCurrencyCents(0), '$0.00');
  assert.equal(formatCurrencyCents(99_99), '$99.99');
});

test('formatCurrencyCents returns em-dash for non-finite', () => {
  assert.equal(formatCurrencyCents(Number.NaN), '—');
});

test('formatNumber renders with thousands separators', () => {
  assert.equal(formatNumber(12_345), '12,345');
});

test('formatPercentBps converts basis points to percent', () => {
  assert.equal(formatPercentBps(700), '7.00%');
  assert.equal(formatPercentBps(0), '0.00%');
});

test('formatTimestamp handles undefined gracefully', () => {
  assert.equal(formatTimestamp(undefined), '—');
});

test('formatRelativeMs buckets to minutes / hours / days', () => {
  assert.equal(formatRelativeMs(45_000), '0m');
  assert.equal(formatRelativeMs(5 * 60_000), '5m');
  assert.equal(formatRelativeMs(2 * 60 * 60_000), '2h');
  assert.equal(formatRelativeMs(3 * 24 * 60 * 60_000), '3d');
});
