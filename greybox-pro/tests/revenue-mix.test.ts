// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildProModuleRevenueMixReport,
  proRevenueMixMarkdown,
  type ProModuleRevenueRecord,
} from '../src/index.js';

function record(input: {
  id: string;
  moduleId: string;
  customerId: string;
  amountCents: number;
  arrContributionCents: number;
  occurredAt?: number;
}): ProModuleRevenueRecord {
  return {
    id: input.id,
    moduleId: input.moduleId,
    customerId: input.customerId,
    source: 'direct-pack',
    occurredAt: input.occurredAt ?? Date.UTC(2026, 4, 18),
    amountCents: input.amountCents,
    arrContributionCents: input.arrContributionCents,
  };
}

test('Pro revenue mix report proves the 30 percent ARR target without leaking customers', () => {
  const records = [
    record({ id: 'order-1', moduleId: 'soulslike-combat-pack', customerId: 'customer-a@example.com', amountCents: 7_900, arrContributionCents: 120_000 }),
    record({ id: 'order-2', moduleId: 'hero-shooter-toolkit', customerId: 'customer-b@example.com', amountCents: 9_900, arrContributionCents: 120_000 }),
    record({ id: 'order-3', moduleId: 'cozy-sim-pack', customerId: 'customer-c@example.com', amountCents: 5_900, arrContributionCents: 120_000 }),
    record({ id: 'order-4', moduleId: 'live-ops-pro', customerId: 'customer-d@example.com', amountCents: 19_900, arrContributionCents: 180_000 }),
    record({ id: 'order-5', moduleId: 'unity-full-prefab-export-pro', customerId: 'customer-e@example.com', amountCents: 9_900, arrContributionCents: 120_000 }),
  ];

  const report = buildProModuleRevenueMixReport({
    records,
    totalArrCents: 2_000_000,
    generatedAt: Date.UTC(2026, 4, 18),
    targets: {
      minPayingCustomers: 5,
    },
  });

  assert.equal(report.ready, true);
  assert.equal(report.period.label, '2026-05');
  assert.deepEqual(report.summary, {
    totalArrCents: 2_000_000,
    proArrContributionCents: 660_000,
    proRevenueShareBps: 3_300,
    revenueCents: 53_500,
    orders: 5,
    modulesWithRevenue: 5,
    payingCustomers: 5,
    topModuleProRevenueShareBps: 2_727,
    topCustomerProRevenueShareBps: 2_727,
  });
  assert.deepEqual(report.modules.map((module) => [module.moduleId, module.name, module.payingCustomers]), [
    ['live-ops-pro', 'Live-Ops Pro', 1],
    ['hero-shooter-toolkit', 'Hero Shooter Toolkit', 1],
    ['unity-full-prefab-export-pro', 'Unity Full Prefab Export Pro', 1],
    ['soulslike-combat-pack', 'Soulslike Combat Pack', 1],
    ['cozy-sim-pack', 'Cozy Sim Pack', 1],
  ]);
  assert.deepEqual(report.shortfalls, []);
  assert.match(proRevenueMixMarkdown(report), /Ready: yes/u);
  const serialized = JSON.stringify(report);
  assert.equal(serialized.includes('customer-a@example.com'), false);
});

test('Pro revenue mix report fails closed below revenue share and breadth targets', () => {
  const report = buildProModuleRevenueMixReport({
    records: [
      record({ id: 'order-1', moduleId: 'soulslike-combat-pack', customerId: 'customer-a', amountCents: 7_900, arrContributionCents: 60_000 }),
    ],
    totalArrCents: 2_000_000,
    generatedAt: Date.UTC(2026, 4, 18),
  });

  assert.equal(report.ready, false);
  assert.deepEqual(report.shortfalls.map((shortfall) => shortfall.code).sort(), [
    'customer_concentration_too_high',
    'module_concentration_too_high',
    'module_revenue_shortfall',
    'paying_customer_shortfall',
    'pro_revenue_share_shortfall',
  ]);
});

test('Pro revenue mix report rejects whale-dependent module revenue', () => {
  const report = buildProModuleRevenueMixReport({
    records: [
      record({ id: 'order-1', moduleId: 'soulslike-combat-pack', customerId: 'whale-studio', amountCents: 7_900, arrContributionCents: 220_000 }),
      record({ id: 'order-2', moduleId: 'hero-shooter-toolkit', customerId: 'customer-b', amountCents: 9_900, arrContributionCents: 45_000 }),
      record({ id: 'order-3', moduleId: 'cozy-sim-pack', customerId: 'customer-c', amountCents: 5_900, arrContributionCents: 45_000 }),
      record({ id: 'order-4', moduleId: 'live-ops-pro', customerId: 'customer-d', amountCents: 19_900, arrContributionCents: 45_000 }),
      record({ id: 'order-5', moduleId: 'unity-full-prefab-export-pro', customerId: 'customer-e', amountCents: 9_900, arrContributionCents: 45_000 }),
    ],
    totalArrCents: 1_000_000,
    generatedAt: Date.UTC(2026, 4, 18),
    targets: {
      minPayingCustomers: 5,
    },
  });

  assert.equal(report.ready, false);
  assert.equal(report.summary.proRevenueShareBps, 4_000);
  assert.equal(report.summary.modulesWithRevenue, 5);
  assert.equal(report.summary.payingCustomers, 5);
  assert.equal(report.summary.topModuleProRevenueShareBps, 5_500);
  assert.equal(report.summary.topCustomerProRevenueShareBps, 5_500);
  assert.deepEqual(report.shortfalls.map((shortfall) => shortfall.code).sort(), [
    'customer_concentration_too_high',
    'module_concentration_too_high',
  ]);
});

test('Pro revenue mix report scopes records to the current UTC month', () => {
  const report = buildProModuleRevenueMixReport({
    records: [
      record({
        id: 'current-order',
        moduleId: 'soulslike-combat-pack',
        customerId: 'current-customer',
        amountCents: 7_900,
        arrContributionCents: 120_000,
        occurredAt: Date.UTC(2026, 4, 18),
      }),
      record({
        id: 'stale-order',
        moduleId: 'hero-shooter-toolkit',
        customerId: 'stale-customer',
        amountCents: 9_900,
        arrContributionCents: 120_000,
        occurredAt: Date.UTC(2026, 3, 18),
      }),
    ],
    totalArrCents: 300_000,
    generatedAt: Date.UTC(2026, 4, 18),
    targets: {
      minModulesWithRevenue: 1,
      minPayingCustomers: 1,
    },
  });

  assert.equal(report.summary.orders, 1);
  assert.deepEqual(report.modules.map((module) => module.moduleId), ['soulslike-combat-pack']);
});

test('Pro revenue mix report rejects malformed revenue inputs', () => {
  assert.throws(() => buildProModuleRevenueMixReport({
    records: [
      record({
        id: 'bad-order',
        moduleId: 'soulslike-combat-pack',
        customerId: 'customer-a',
        amountCents: -1,
        arrContributionCents: 120_000,
      }),
    ],
    totalArrCents: 1_000_000,
  }), /amountCents/u);
  assert.throws(() => buildProModuleRevenueMixReport({
    records: [],
    totalArrCents: 1_000_000,
    targets: { proRevenueShareBps: 10_001 },
  }), /proRevenueShareBps/u);
  assert.throws(() => buildProModuleRevenueMixReport({
    records: [],
    totalArrCents: 1_000_000,
    targets: { maxSingleCustomerProRevenueShareBps: 10_001 },
  }), /maxSingleCustomerProRevenueShareBps/u);
});
