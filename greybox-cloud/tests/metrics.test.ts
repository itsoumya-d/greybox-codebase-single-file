// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo, Server } from 'node:net';

import { MetricsRegistry } from '../src/observability/metrics.js';
import { createGreyboxCloudServer } from '../src/server.js';

test('MetricsRegistry.prometheusText renders counters with TYPE annotations', () => {
  const metrics = new MetricsRegistry();
  metrics.increment('inference.success.bedrock', 3);
  metrics.increment('inference.retry.openai');
  metrics.increment('inference.firewall_block');
  const text = metrics.prometheusText();
  // TYPE preceding metric line
  assert.match(text, /# TYPE greybox_inference_success_bedrock counter\ngreybox_inference_success_bedrock 3/u);
  assert.match(text, /# TYPE greybox_inference_retry_openai counter\ngreybox_inference_retry_openai 1/u);
  assert.match(text, /# TYPE greybox_inference_firewall_block counter\ngreybox_inference_firewall_block 1/u);
  // Trailing newline so scrapers don't choke on missing final \n.
  assert.ok(text.endsWith('\n'));
});

test('MetricsRegistry.prometheusText emits empty string when no counters have been recorded', () => {
  const metrics = new MetricsRegistry();
  assert.equal(metrics.prometheusText(), '');
});

test('MetricsRegistry.prometheusText sanitises metric names to the Prometheus charset', () => {
  const metrics = new MetricsRegistry();
  metrics.increment('weird.name-with*chars');
  const text = metrics.prometheusText();
  assert.match(text, /greybox_weird_name_with_chars 1/u);
});

test('MetricsRegistry.observe accumulates summary stats and rejects non-finite values', () => {
  const metrics = new MetricsRegistry();
  metrics.observe('inference.latency_ms.all', 80);
  metrics.observe('inference.latency_ms.all', 220);
  metrics.observe('inference.latency_ms.all', 1100);
  metrics.observe('inference.latency_ms.all', Number.NaN);
  const snap = metrics.snapshot()['inference.latency_ms.all'] as Record<string, unknown>;
  assert.equal(snap.count, 3);
  assert.equal(snap.sum, 1400);
  assert.equal(snap.min, 80);
  assert.equal(snap.max, 1100);
  // 80 <= 100, 220 <= 250, 1100 <= 2500: bucket counts are cumulative.
  const buckets = snap.buckets as Record<string, number>;
  assert.equal(buckets['100'], 1);
  assert.equal(buckets['250'], 2);
  assert.equal(buckets['2500'], 3);
});

test('MetricsRegistry.prometheusText renders gauges and histograms with correct TYPE annotations', () => {
  const metrics = new MetricsRegistry();
  metrics.setGauge('queue.depth', 42);
  metrics.observe('inference.cost_cents.all', 1.5, { bucketsCents: true });
  metrics.observe('inference.cost_cents.all', 12);
  const text = metrics.prometheusText();
  assert.match(text, /# TYPE greybox_queue_depth gauge\ngreybox_queue_depth 42/u);
  assert.match(text, /# TYPE greybox_inference_cost_cents_all histogram/u);
  assert.match(text, /greybox_inference_cost_cents_all_bucket\{le="2"\} 1/u);
  assert.match(text, /greybox_inference_cost_cents_all_bucket\{le="25"\} 2/u);
  assert.match(text, /greybox_inference_cost_cents_all_sum 13\.5/u);
  assert.match(text, /greybox_inference_cost_cents_all_count 2/u);
});

test('MetricsRegistry.setGauge rejects non-finite values', () => {
  const metrics = new MetricsRegistry();
  metrics.setGauge('valid', 5);
  metrics.setGauge('invalid_nan', Number.NaN);
  metrics.setGauge('invalid_inf', Number.POSITIVE_INFINITY);
  const text = metrics.prometheusText();
  assert.match(text, /greybox_valid 5/u);
  assert.doesNotMatch(text, /invalid_nan/u);
  assert.doesNotMatch(text, /invalid_inf/u);
});

test('MetricsRegistry.prometheusText prepends an underscore when sanitisation produces a leading digit', () => {
  const metrics = new MetricsRegistry();
  metrics.increment('123counter');
  const text = metrics.prometheusText('');
  assert.match(text, /_123counter 1/u);
});

test('GET /metrics with Accept: text/plain returns Prometheus exposition format', async () => {
  const { baseUrl, close } = await startTestServer();
  try {
    const response = await fetch(`${baseUrl}/metrics`, {
      headers: { accept: 'text/plain' },
    });
    assert.equal(response.status, 200);
    const contentType = response.headers.get('content-type') ?? '';
    assert.match(contentType, /text\/plain/u);
    assert.match(contentType, /version=0\.0\.4/u);
    const body = await response.text();
    // Even with no counters the response must succeed.
    assert.equal(typeof body, 'string');
  } finally {
    await close();
  }
});

test('GET /metrics with Accept: application/openmetrics-text returns Prometheus exposition format', async () => {
  const { baseUrl, close } = await startTestServer();
  try {
    const response = await fetch(`${baseUrl}/metrics`, {
      headers: { accept: 'application/openmetrics-text' },
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /text\/plain/u);
  } finally {
    await close();
  }
});

test('GET /metrics?format=prometheus forces the text format even without an Accept header', async () => {
  const { baseUrl, close } = await startTestServer();
  try {
    const response = await fetch(`${baseUrl}/metrics?format=prometheus`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /text\/plain/u);
  } finally {
    await close();
  }
});

test('GET /metrics with default Accept returns JSON snapshot (back-compat)', async () => {
  const { baseUrl, close } = await startTestServer();
  try {
    const response = await fetch(`${baseUrl}/metrics`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /application\/json/u);
    const json = await response.json();
    assert.equal(typeof json, 'object');
  } finally {
    await close();
  }
});

async function startTestServer(): Promise<{
  server: Server;
  baseUrl: string;
  close: () => Promise<void>;
}> {
  const server = createGreyboxCloudServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  return {
    server,
    baseUrl,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
