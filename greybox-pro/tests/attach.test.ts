// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildProModuleAttachReport,
  proModuleAttachMarkdown,
  type ProModuleAttachSnapshot,
  type ProModuleCustomerPlan,
} from '../src/index.js';

function snapshot(input: {
  id: string;
  customerId: string;
  plan: ProModuleCustomerPlan;
  moduleIds?: string[];
  proArrCents?: number;
  totalArrCents?: number;
  expansionArrCents?: number;
  active?: boolean;
  observedAt?: number;
  churnedAt?: number;
}): ProModuleAttachSnapshot {
  return {
    id: input.id,
    customerId: input.customerId,
    plan: input.plan,
    observedAt: input.observedAt ?? Date.UTC(2026, 4, 18),
    active: input.active ?? true,
    moduleIds: input.moduleIds ?? [],
    proArrCents: input.proArrCents ?? 0,
    totalArrCents: input.totalArrCents ?? 120_000,
    ...(input.expansionArrCents !== undefined ? { expansionArrCents: input.expansionArrCents } : {}),
    ...(input.churnedAt !== undefined ? { churnedAt: input.churnedAt } : {}),
  };
}

test('Pro attach report proves expansion readiness without leaking customer ids', () => {
  const snapshots = [
    snapshot({
      id: 'snap-1',
      customerId: 'studio-a@example.com',
      plan: 'studio',
      moduleIds: ['soulslike-combat-pack', 'unity-full-prefab-export-pro'],
      proArrCents: 240_000,
      totalArrCents: 1_200_000,
      expansionArrCents: 100_000,
    }),
    snapshot({
      id: 'snap-2',
      customerId: 'studio-b@example.com',
      plan: 'studio',
      moduleIds: ['hero-shooter-toolkit', 'unity-full-prefab-export-pro'],
      proArrCents: 240_000,
      totalArrCents: 1_200_000,
      expansionArrCents: 100_000,
    }),
    snapshot({
      id: 'snap-3',
      customerId: 'enterprise-a@example.com',
      plan: 'enterprise',
      moduleIds: ['live-ops-pro', 'monetization-simulator', 'console-submission-checklist'],
      proArrCents: 360_000,
      totalArrCents: 4_000_000,
      expansionArrCents: 200_000,
    }),
    snapshot({
      id: 'snap-4',
      customerId: 'indie-a@example.com',
      plan: 'indie',
      moduleIds: ['cozy-sim-pack'],
      proArrCents: 120_000,
      totalArrCents: 348_000,
      expansionArrCents: 50_000,
    }),
    snapshot({ id: 'snap-5', customerId: 'indie-b@example.com', plan: 'indie' }),
    snapshot({ id: 'snap-6', customerId: 'indie-c@example.com', plan: 'indie' }),
  ];

  const report = buildProModuleAttachReport({
    snapshots,
    generatedAt: Date.UTC(2026, 4, 18),
    targets: {
      minModulesWithActiveCustomers: 5,
      minExpansionArrCents: 450_000,
    },
  });

  assert.equal(report.ready, true);
  assert.equal(report.period.label, '2026-05');
  assert.deepEqual(report.summary, {
    paidCustomers: 6,
    attachedCustomers: 4,
    attachRateBps: 6_666,
    multiModuleCustomers: 3,
    multiModuleAttachRateBps: 5_000,
    studioEnterpriseCustomers: 3,
    studioEnterpriseAttachedCustomers: 3,
    studioEnterpriseAttachRateBps: 10_000,
    activeProArrCents: 960_000,
    expansionArrCents: 450_000,
    churnedProCustomers: 0,
    churnedProCustomerRateBps: 0,
    modulesWithActiveCustomers: 7,
  });
  assert.deepEqual(report.shortfalls, []);
  assert.match(proModuleAttachMarkdown(report), /Ready: yes/u);
  assert.equal(JSON.stringify(report).includes('studio-a@example.com'), false);
});

test('Pro attach report fails closed on weak attach, breadth, expansion, and churn', () => {
  const report = buildProModuleAttachReport({
    snapshots: [
      snapshot({
        id: 'snap-1',
        customerId: 'studio-a',
        plan: 'studio',
        moduleIds: ['soulslike-combat-pack'],
        proArrCents: 120_000,
        totalArrCents: 1_200_000,
        expansionArrCents: 10_000,
      }),
      snapshot({ id: 'snap-2', customerId: 'studio-b', plan: 'studio' }),
      snapshot({ id: 'snap-3', customerId: 'indie-a', plan: 'indie' }),
      snapshot({
        id: 'snap-4',
        customerId: 'churned-a',
        plan: 'studio',
        active: false,
        moduleIds: ['hero-shooter-toolkit'],
        proArrCents: 0,
        totalArrCents: 0,
        churnedAt: Date.UTC(2026, 4, 17),
      }),
    ],
    generatedAt: Date.UTC(2026, 4, 18),
  });

  assert.equal(report.ready, false);
  assert.deepEqual(report.shortfalls.map((shortfall) => shortfall.code).sort(), [
    'attach_rate_shortfall',
    'expansion_arr_shortfall',
    'module_breadth_shortfall',
    'multi_module_shortfall',
    'pro_churn_too_high',
    'studio_enterprise_attach_shortfall',
  ]);
});

test('Pro attach report uses the latest customer snapshot in the current UTC month', () => {
  const report = buildProModuleAttachReport({
    snapshots: [
      snapshot({
        id: 'stale-month',
        customerId: 'customer-a',
        plan: 'studio',
        moduleIds: ['hero-shooter-toolkit'],
        proArrCents: 120_000,
        totalArrCents: 1_200_000,
        observedAt: Date.UTC(2026, 3, 18),
      }),
      snapshot({
        id: 'early-current',
        customerId: 'customer-a',
        plan: 'studio',
        moduleIds: ['soulslike-combat-pack'],
        proArrCents: 120_000,
        totalArrCents: 1_200_000,
        observedAt: Date.UTC(2026, 4, 1),
      }),
      snapshot({
        id: 'latest-current',
        customerId: 'customer-a',
        plan: 'studio',
        moduleIds: ['soulslike-combat-pack', 'unity-full-prefab-export-pro'],
        proArrCents: 240_000,
        totalArrCents: 1_200_000,
        observedAt: Date.UTC(2026, 4, 18),
      }),
    ],
    generatedAt: Date.UTC(2026, 4, 18),
    targets: {
      minAttachRateBps: 10_000,
      minMultiModuleAttachRateBps: 10_000,
      minStudioEnterpriseAttachRateBps: 10_000,
      minModulesWithActiveCustomers: 2,
      minExpansionArrCents: 0,
    },
  });

  assert.equal(report.ready, true);
  assert.equal(report.summary.paidCustomers, 1);
  assert.equal(report.summary.attachedCustomers, 1);
  assert.deepEqual(report.modules.map((module) => module.moduleId), [
    'soulslike-combat-pack',
    'unity-full-prefab-export-pro',
  ]);
});

test('Pro attach report rejects malformed snapshots and targets', () => {
  assert.throws(() => buildProModuleAttachReport({
    snapshots: [
      snapshot({
        id: 'bad-snap',
        customerId: 'customer-a',
        plan: 'studio',
        moduleIds: ['soulslike-combat-pack'],
        proArrCents: -1,
        totalArrCents: 120_000,
      }),
    ],
  }), /proArrCents/u);

  assert.throws(() => buildProModuleAttachReport({
    snapshots: [],
    targets: { minAttachRateBps: 10_001 },
  }), /minAttachRateBps/u);
});
