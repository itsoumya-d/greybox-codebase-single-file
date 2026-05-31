// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildProModuleBetaValidationReport,
  proModuleBetaValidationMarkdown,
  proModuleCatalog,
  type ProModuleBetaValidationRecord,
  type ProModuleRoundTripValueType,
} from '../src/index.js';

const VALUE_TYPES: ProModuleRoundTripValueType[] = ['int', 'float', 'string', 'Color', 'Vector3'];

function record(input: {
  id: string;
  moduleId: string;
  partner: string;
  observedAt?: number;
  valueTypes?: ProModuleRoundTripValueType[];
  artifactExported?: boolean;
  designerReviewed?: boolean;
  acceptedDiffs?: number;
  rejectedDiffs?: number;
  openCriticalIssues?: number;
}): ProModuleBetaValidationRecord {
  return {
    id: input.id,
    moduleId: input.moduleId,
    designPartnerId: input.partner,
    observedAt: input.observedAt ?? Date.UTC(2026, 4, 18),
    engine: 'unity',
    artifactExported: input.artifactExported ?? true,
    designerReviewed: input.designerReviewed ?? true,
    acceptedDiffs: input.acceptedDiffs ?? 3,
    rejectedDiffs: input.rejectedDiffs ?? 1,
    openCriticalIssues: input.openCriticalIssues ?? 0,
    roundTripValueTypes: input.valueTypes ?? VALUE_TYPES,
  };
}

function readyRecords(): ProModuleBetaValidationRecord[] {
  return proModuleCatalog.slice(0, 5).flatMap((module, index) => [
    record({
      id: `beta-${index + 1}-a`,
      moduleId: module.manifest.id,
      partner: `partner-${index + 1}-a@example.com`,
    }),
    record({
      id: `beta-${index + 1}-b`,
      moduleId: module.manifest.id,
      partner: `partner-${index + 1}-b@example.com`,
    }),
  ]);
}

test('Pro beta validation proves first-wave modules reached reviewed engine outcomes', () => {
  const report = buildProModuleBetaValidationReport({
    records: readyRecords(),
    generatedAt: Date.UTC(2026, 4, 18),
  });

  assert.equal(report.ready, true);
  assert.equal(report.period.label, '2026-05');
  assert.deepEqual(report.summary, {
    launchModulesEvaluated: 5,
    launchModulesReady: 5,
    designPartners: 10,
    reviewedExports: 10,
    acceptedDiffs: 30,
    rejectedDiffs: 10,
    acceptedDiffRateBps: 7_500,
    modulesWithRoundTripCoverage: 5,
    openCriticalIssues: 0,
  });
  assert.deepEqual(report.modules.map((module) => [module.moduleId, module.designPartners, module.reviewedExports, module.ready]), [
    ['soulslike-combat-pack', 2, 2, true],
    ['hero-shooter-toolkit', 2, 2, true],
    ['cozy-sim-pack', 2, 2, true],
    ['hyper-casual-mobile-pack', 2, 2, true],
    ['roguelike-generator-pro', 2, 2, true],
  ]);
  assert.deepEqual(report.shortfalls, []);
  assert.match(proModuleBetaValidationMarkdown(report), /Ready: yes/u);
  const serialized = JSON.stringify(report);
  assert.doesNotMatch(serialized, /partner-1-a@example\.com|partner-5-b@example\.com/u);
});

test('Pro beta validation fails closed without partner breadth and field coverage', () => {
  const [first, second, ...rest] = proModuleCatalog;
  assert.ok(first);
  assert.ok(second);
  const records = [
    record({
      id: 'beta-first-only',
      moduleId: first.manifest.id,
      partner: 'partner-a',
      valueTypes: ['int', 'float'],
      acceptedDiffs: 1,
      rejectedDiffs: 4,
    }),
    record({
      id: 'beta-second-critical',
      moduleId: second.manifest.id,
      partner: 'partner-b',
      openCriticalIssues: 1,
    }),
    ...rest.slice(0, 3).flatMap((module, index) => [
      record({
        id: `beta-${index}-a`,
        moduleId: module.manifest.id,
        partner: `partner-${index}-a`,
      }),
      record({
        id: `beta-${index}-b`,
        moduleId: module.manifest.id,
        partner: `partner-${index}-b`,
      }),
    ]),
  ];

  const report = buildProModuleBetaValidationReport({
    records,
    generatedAt: Date.UTC(2026, 4, 18),
  });

  assert.equal(report.ready, false);
  assert.equal(report.modules[0]?.ready, false);
  assert.equal(report.modules[1]?.ready, false);
  assert.ok(report.shortfalls.some((shortfall) => (
    shortfall.code === 'design_partner_shortfall'
    && shortfall.moduleId === 'soulslike-combat-pack'
  )));
  assert.ok(report.shortfalls.some((shortfall) => (
    shortfall.code === 'reviewed_export_shortfall'
    && shortfall.moduleId === 'soulslike-combat-pack'
  )));
  assert.ok(report.shortfalls.some((shortfall) => (
    shortfall.code === 'round_trip_field_coverage_missing'
    && shortfall.moduleId === 'soulslike-combat-pack'
    && shortfall.detail.includes('string, Color, Vector3')
  )));
  assert.ok(report.shortfalls.some((shortfall) => (
    shortfall.code === 'accepted_diff_rate_shortfall'
    && shortfall.moduleId === 'soulslike-combat-pack'
  )));
  assert.ok(report.shortfalls.some((shortfall) => (
    shortfall.code === 'critical_issue_open'
    && shortfall.moduleId === 'hero-shooter-toolkit'
  )));
});

test('Pro beta validation scopes evidence to the current UTC month', () => {
  const records = [
    ...readyRecords(),
    record({
      id: 'stale-critical',
      moduleId: 'soulslike-combat-pack',
      partner: 'stale-partner',
      observedAt: Date.UTC(2026, 3, 18),
      openCriticalIssues: 99,
    }),
  ];

  const report = buildProModuleBetaValidationReport({
    records,
    generatedAt: Date.UTC(2026, 4, 18),
  });

  assert.equal(report.ready, true);
  assert.equal(report.summary.openCriticalIssues, 0);
});

test('Pro beta validation rejects malformed evidence inputs', () => {
  assert.throws(() => buildProModuleBetaValidationReport({
    records: [
      record({
        id: 'bad-negative',
        moduleId: 'soulslike-combat-pack',
        partner: 'partner-a',
        acceptedDiffs: -1,
      }),
    ],
  }), /acceptedDiffs/u);
  assert.throws(() => buildProModuleBetaValidationReport({
    records: readyRecords(),
    targets: { minAcceptedDiffRateBps: 10_001 },
  }), /minAcceptedDiffRateBps/u);
  assert.throws(() => buildProModuleBetaValidationReport({
    records: [
      {
        ...record({
          id: 'bad-value-type',
          moduleId: 'soulslike-combat-pack',
          partner: 'partner-a',
        }),
        roundTripValueTypes: ['Quaternion' as ProModuleRoundTripValueType],
      },
    ],
  }), /unsupported round-trip value type/u);
});
