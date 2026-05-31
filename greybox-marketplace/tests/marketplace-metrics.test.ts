// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MarketplaceMetricsRegistry } from '../src/observability/metrics.js';
import { startMarketplaceServer } from '../src/api/server.js';
import { InMemoryMarketplaceStore } from '../src/store/marketplaceStore.js';
import type { Creator, MarketplaceOrder, PayoutInstruction } from '../src/types.js';

test('MarketplaceMetricsRegistry counters, gauges and histograms round-trip', () => {
  const m = new MarketplaceMetricsRegistry();
  m.increment('orders.created');
  m.increment('orders.created');
  m.setGauge('queue.depth', 7);
  m.observe('order.value_cents', 2500, { bucketsOrderValueCents: true });
  m.observe('order.value_cents', 50_000);
  const snap = m.snapshot();
  assert.equal(snap['orders.created'], 2);
  assert.deepEqual(snap['queue.depth'], { gauge: 7 });
  const summary = snap['order.value_cents'] as { count: number; sum: number; min: number; max: number };
  assert.equal(summary.count, 2);
  assert.equal(summary.sum, 52_500);
  assert.equal(summary.min, 2500);
  assert.equal(summary.max, 50_000);
});

test('MarketplaceMetricsRegistry.prometheusText namespaces with greybox_marketplace prefix', () => {
  const m = new MarketplaceMetricsRegistry();
  m.increment('orders.refunded');
  m.setGauge('reserve_cents', 12_345);
  const text = m.prometheusText();
  assert.match(text, /# TYPE greybox_marketplace_orders_refunded counter\ngreybox_marketplace_orders_refunded 1/u);
  assert.match(text, /# TYPE greybox_marketplace_reserve_cents gauge\ngreybox_marketplace_reserve_cents 12345/u);
});

test('GET /metrics returns Prometheus text when Accept: text/plain is set', async () => {
  const store = new InMemoryMarketplaceStore({ payoutProvider: makeNoopPayoutProvider() });
  const started = await startMarketplaceServer({ store, allowMockPayoutsInProduction: true });
  try {
    const r = await fetch(`${started.url}/metrics`, { headers: { accept: 'text/plain' } });
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type') ?? '', /text\/plain/u);
    assert.match(r.headers.get('content-type') ?? '', /version=0\.0\.4/u);
  } finally {
    await new Promise<void>((resolve) => started.server.close(() => resolve()));
  }
});

test('GET /metrics returns JSON snapshot by default', async () => {
  const store = new InMemoryMarketplaceStore({ payoutProvider: makeNoopPayoutProvider() });
  const started = await startMarketplaceServer({ store, allowMockPayoutsInProduction: true });
  try {
    const r = await fetch(`${started.url}/metrics`);
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type') ?? '', /application\/json/u);
    const body = await r.json();
    assert.equal(typeof body, 'object');
  } finally {
    await new Promise<void>((resolve) => started.server.close(() => resolve()));
  }
});

test('GET /metrics requires admin token when configured', async () => {
  const store = new InMemoryMarketplaceStore({ payoutProvider: makeNoopPayoutProvider() });
  const started = await startMarketplaceServer({
    store,
    adminToken: 'metrics-secret',
    allowMockPayoutsInProduction: true,
  });
  try {
    const denied = await fetch(`${started.url}/metrics`);
    assert.equal(denied.status, 401);
    const allowed = await fetch(`${started.url}/metrics`, {
      headers: { authorization: 'Bearer metrics-secret' },
    });
    assert.equal(allowed.status, 200);
  } finally {
    await new Promise<void>((resolve) => started.server.close(() => resolve()));
  }
});

test('GET /healthz returns 200 with status=live', async () => {
  const store = new InMemoryMarketplaceStore({ payoutProvider: makeNoopPayoutProvider() });
  const started = await startMarketplaceServer({ store, allowMockPayoutsInProduction: true });
  try {
    const r = await fetch(`${started.url}/healthz`);
    assert.equal(r.status, 200);
    const body = (await r.json()) as { ok: boolean; status: string };
    assert.equal(body.ok, true);
    assert.equal(body.status, 'live');
  } finally {
    await new Promise<void>((resolve) => started.server.close(() => resolve()));
  }
});

test('GET /readyz returns 200 when the store is reachable', async () => {
  const store = new InMemoryMarketplaceStore({ payoutProvider: makeNoopPayoutProvider() });
  const started = await startMarketplaceServer({ store, allowMockPayoutsInProduction: true });
  try {
    const r = await fetch(`${started.url}/readyz`);
    assert.equal(r.status, 200);
    const body = (await r.json()) as { ok: boolean; status: string; checks: { store: string } };
    assert.equal(body.ok, true);
    assert.equal(body.status, 'ready');
    assert.equal(body.checks.store, 'ok');
  } finally {
    await new Promise<void>((resolve) => started.server.close(() => resolve()));
  }
});

test('GET /metrics surfaces open-dispute gauge sampled from store', async () => {
  const store = new InMemoryMarketplaceStore({ payoutProvider: makeQueuedPayoutProvider() });
  store.upsertCreator({
    id: 'creator_metrics_alpha',
    displayName: 'Alpha Studios',
    country: 'US',
    monthlyGmvCents: 0,
    lifetimeGmvCents: 0,
    active: true,
    stripeConnectAccountId: 'acct_metrics_alpha',
    taxProfileId: 'tax_metrics_alpha',
  });
  const { listing } = store.submitListing({
    creatorId: 'creator_metrics_alpha',
    title: 'Metrics Combat Template',
    description: 'AI-assisted combat template used to prove marketplace operational gauges.',
    category: 'template',
    priceCents: 5_000,
    licenseSummary: 'Internal metrics test license.',
    tags: ['metrics'],
  });
  const purchase = await store.purchaseListing({
    listingId: listing.id,
    buyerId: 'metrics-buyer',
  });
  store.recordRiskEvent({
    type: 'dispute',
    orderId: purchase.order.id,
    amountCents: 2_500,
    status: 'open',
    reason: 'metrics gauge proof',
  });
  const started = await startMarketplaceServer({ store, allowMockPayoutsInProduction: true });
  try {
    const r = await fetch(`${started.url}/metrics?format=prometheus`);
    assert.equal(r.status, 200);
    const text = await r.text();
    assert.match(text, /greybox_marketplace_risk_disputes_open 1/u);
    assert.match(text, /greybox_marketplace_orders_month_to_date 1/u);
    assert.match(text, /greybox_marketplace_gmv_cents_month_to_date 5000/u);
  } finally {
    await new Promise<void>((resolve) => started.server.close(() => resolve()));
  }
});

function makeNoopPayoutProvider(): { createTransfer: () => Promise<never> } {
  return {
    createTransfer: async () => {
      throw new Error('createTransfer not used in metrics tests');
    },
  };
}

function makeQueuedPayoutProvider(): { createTransfer: (order: MarketplaceOrder, creator: Creator) => Promise<PayoutInstruction> } {
  return {
    createTransfer: async (order, creator) => ({
      id: `po_metrics_${order.id}`,
      orderId: order.id,
      creatorId: creator.id,
      stripeConnectAccountId: creator.stripeConnectAccountId ?? 'acct_metrics_missing',
      amountCents: order.creatorNetCents,
      currency: order.currency,
      status: 'queued',
      reason: 'metrics_test',
      delivery: 'manual-transfer',
    }),
  };
}
