// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync } from 'node:crypto';
import test from 'node:test';

import {
  buildProModuleReleaseReadinessReport,
  proModuleCatalog,
} from '../src/index.js';
import type { ProModuleFile } from '../src/index.js';

function withBody(file: ProModuleFile, body: string): ProModuleFile {
  return {
    ...file,
    body,
    digestSha256: createHash('sha256').update(body).digest('hex'),
  };
}

test('release readiness proves all twelve paid modules can ship on cadence', () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const report = buildProModuleReleaseReadinessReport({
    now: 1_000,
    bundleVerification: {
      privateKey,
      keyId: 'greybox-release-test',
      publicKeys: { 'greybox-release-test': publicKey },
      licenseSecret: 'release-readiness-license-secret',
      nonceForModule: (_module, index) => Buffer.alloc(12, index + 1),
    },
  });

  assert.equal(report.ready, true);
  assert.equal(report.generatedAt, 1_000);
  assert.deepEqual(report.summary, {
    totalModules: 12,
    alphaReadyModules: 12,
    launchModulesScheduled: 5,
    yearOneModulesScheduled: 12,
    cumulativeLaunchPriceUsd: 355,
    cumulativeYearOnePriceUsd: 1188,
    monthlyRecurringUsd: 29,
    latestLaunchShipWeek: 10,
    latestYearOneShipWeek: 24,
    engineExportModules: 3,
  });
  assert.equal(report.schedule.length, 12);
  assert.ok(report.schedule.every((item) => item.bundleVerified));
  assert.ok(report.schedule.every((item) => item.payloadClassesComplete));
  assert.ok(report.schedule.every((item) => item.payloadContractsComplete));
  assert.ok(report.schedule.every((item) => item.disclosureContractsComplete));
  assert.deepEqual(report.schedule.slice(0, 5).map((item) => [item.moduleId, item.shipWeek]), [
    ['soulslike-combat-pack', 2],
    ['hero-shooter-toolkit', 4],
    ['cozy-sim-pack', 6],
    ['hyper-casual-mobile-pack', 8],
    ['roguelike-generator-pro', 10],
  ]);
  assert.deepEqual(report.schedule.slice(-3).map((item) => [item.moduleId, item.shipWeek]), [
    ['unity-full-prefab-export-pro', 20],
    ['unreal-blueprint-export-pro', 22],
    ['godot-scene-tree-export-pro', 24],
  ]);
  assert.deepEqual(report.checks.map((check) => [check.id, check.status]), [
    ['catalog-health', 'pass'],
    ['year-one-module-count', 'pass'],
    ['month-12-module-count', 'pass'],
    ['release-cadence', 'pass'],
    ['engine-companions', 'pass'],
    ['public-listings', 'pass'],
    ['bundle-verification', 'pass'],
  ]);
  assert.deepEqual(report.issues, []);

  const serialized = JSON.stringify(report);
  assert.equal(serialized.includes('Proprietary and confidential'), false);
  assert.equal(serialized.includes('encryptedPayload'), false);
  assert.equal(serialized.includes('release-readiness-license-secret'), false);
});

test('release readiness blocks modules without engine target field contracts', () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const [first, ...rest] = proModuleCatalog;
  assert.ok(first);
  const brokenCatalog = [{
    ...first,
    files: first.files.map((file) => (
      file.path.startsWith('engine-targets/')
        ? {
            ...file,
            body: JSON.stringify({
              schemaVersion: 'greybox.pro.engine-target/v1',
              targetEngines: ['unity'],
              designerReviewRequired: true,
              supportedValueTypes: ['int', 'float', 'string', 'Color', 'Vector3'],
              tuningFields: ['enemyHealth'],
            }),
          }
        : file
    )),
  }, ...rest];

  const report = buildProModuleReleaseReadinessReport({
    catalog: brokenCatalog,
    now: 1_400,
    bundleVerification: {
      privateKey,
      keyId: 'greybox-release-test',
      publicKeys: { 'greybox-release-test': publicKey },
      licenseSecret: 'release-readiness-license-secret',
      nonceForModule: (_module, index) => Buffer.alloc(12, index + 1),
    },
  });

  assert.equal(report.ready, false);
  assert.ok(report.issues.some((issue) => (
    issue.code === 'engine_target_contract_missing'
    && issue.moduleId === 'soulslike-combat-pack'
  )));
  assert.equal(report.checks.find((check) => check.id === 'catalog-health')?.status, 'fail');
});

test('release readiness blocks engine targets with value-type-only round-trip safe fields', () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const [first, ...rest] = proModuleCatalog;
  assert.ok(first);
  const brokenCatalog = [{
    ...first,
    files: first.files.map((file) => {
      if (!file.path.startsWith('engine-targets/')) return file;
      const payload = JSON.parse(file.body) as Record<string, unknown>;
      return {
        ...file,
        body: JSON.stringify({
          ...payload,
          roundTripSafeFields: ['int', 'float', 'string', 'Color', 'Vector3'],
        }),
      };
    }),
  }, ...rest];

  const report = buildProModuleReleaseReadinessReport({
    catalog: brokenCatalog,
    now: 1_450,
    bundleVerification: {
      privateKey,
      keyId: 'greybox-release-test',
      publicKeys: { 'greybox-release-test': publicKey },
      licenseSecret: 'release-readiness-license-secret',
      nonceForModule: (_module, index) => Buffer.alloc(12, index + 1),
    },
  });

  assert.equal(report.ready, false);
  assert.ok(report.issues.some((issue) => (
    issue.code === 'engine_target_contract_missing'
    && issue.moduleId === 'soulslike-combat-pack'
    && issue.detail.includes('does not declare every tuning field as round-trip safe')
  )));
});

test('release readiness blocks engine targets whose safe-field contracts drift from tuning fields', () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const [first, ...rest] = proModuleCatalog;
  assert.ok(first);
  const brokenCatalog = [{
    ...first,
    files: first.files.map((file) => {
      if (!file.path.startsWith('engine-targets/')) return file;
      const payload = JSON.parse(file.body) as {
        tuningFields: string[];
        fieldContracts: Array<Record<string, unknown>>;
      } & Record<string, unknown>;
      const [firstContract, secondContract, ...remainingContracts] = payload.fieldContracts;
      assert.ok(firstContract);
      assert.ok(secondContract);
      return {
        ...file,
        body: JSON.stringify({
          ...payload,
          roundTripSafeFields: [...payload.tuningFields, 'unreviewedEconomyBypass'],
          fieldContracts: [
            firstContract,
            { ...secondContract, field: firstContract.field },
            ...remainingContracts,
          ],
        }),
      };
    }),
  }, ...rest];

  const report = buildProModuleReleaseReadinessReport({
    catalog: brokenCatalog,
    now: 1_475,
    bundleVerification: {
      privateKey,
      keyId: 'greybox-release-test',
      publicKeys: { 'greybox-release-test': publicKey },
      licenseSecret: 'release-readiness-license-secret',
      nonceForModule: (_module, index) => Buffer.alloc(12, index + 1),
    },
  });

  assert.equal(report.ready, false);
  assert.ok(report.issues.some((issue) => (
    issue.code === 'engine_target_contract_missing'
    && issue.moduleId === 'soulslike-combat-pack'
    && issue.detail.includes('round-trip safe fields must exactly match tuning fields')
    && issue.detail.includes('extra: unreviewedEconomyBypass')
  )));
  assert.ok(report.issues.some((issue) => (
    issue.code === 'engine_target_contract_missing'
    && issue.moduleId === 'soulslike-combat-pack'
    && issue.detail.includes('field contracts must exactly match tuning fields')
    && issue.detail.includes('missing: poiseDamage')
    && issue.detail.includes('duplicate: enemyHealth')
  )));
});

test('release readiness blocks shallow proprietary module payloads', () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const [first, ...rest] = proModuleCatalog;
  assert.ok(first);
  const brokenCatalog = [{
    ...first,
    files: first.files.map((file) => {
      if (!file.path.startsWith('engine-targets/')) return file;
      const payload = JSON.parse(file.body) as {
        proprietaryPayload: {
          referenceEncounter: { beats: string[] };
          unityObjects: string[];
          tuningDefaults: Record<string, unknown>;
        };
      } & Record<string, unknown>;
      return withBody(file, JSON.stringify({
        ...payload,
        proprietaryPayload: {
          ...payload.proprietaryPayload,
          referenceEncounter: {
            ...payload.proprietaryPayload.referenceEncounter,
            beats: ['Only one beat is not enough for a paid alpha module.'],
          },
          unityObjects: ['GreyboxBossEncounterProfile only'],
          tuningDefaults: {
            enemyHealth: payload.proprietaryPayload.tuningDefaults.enemyHealth,
            extraUnreviewedDefault: 999,
          },
        },
      }));
    }),
  }, ...rest];

  const report = buildProModuleReleaseReadinessReport({
    catalog: brokenCatalog,
    now: 1_476,
    bundleVerification: {
      privateKey,
      keyId: 'greybox-release-test',
      publicKeys: { 'greybox-release-test': publicKey },
      licenseSecret: 'release-readiness-license-secret',
      nonceForModule: (_module, index) => Buffer.alloc(12, index + 1),
    },
  });

  assert.equal(report.ready, false);
  const issue = report.issues.find((candidate) => (
    candidate.code === 'payload_class_missing'
    && candidate.moduleId === 'soulslike-combat-pack'
    && candidate.detail.includes('incomplete authored payload depth')
  ));
  assert.ok(issue);
  assert.match(issue.detail, /at least four beats/u);
  assert.match(issue.detail, /at least four engine object/u);
  assert.match(issue.detail, /tuning defaults must exactly match tuning fields/u);
  assert.match(issue.detail, /missing: poiseDamage, staminaCost, dodgeInvulnerabilitySeconds, lockOnCameraOffset/u);
  assert.match(issue.detail, /extra: extraUnreviewedDefault/u);
});

test('release readiness blocks alpha-ready modules with shallow authored file substance', () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const [first, ...rest] = proModuleCatalog;
  assert.ok(first);
  const brokenCatalog = [{
    ...first,
    files: first.files.map((file) => {
      if (file.path.startsWith('skills/')) {
        return withBody(file, [
          '# Soulslike Combat Pack',
          '',
          'Use this closed-core skill for AI-assisted design work only when a licensed Greybox Pro key is present.',
          'Preserve human designer authorship.',
          '',
          '## Paid Pack Recipes',
          '- One generic recipe is not enough paid substance.',
        ].join('\n'));
      }
      if (file.path.startsWith('game-art-bibles/')) {
        return withBody(file, [
          '# Soulslike Combat Pack Art Bible',
          '',
          '## Closed-Core Art Direction',
          '- One generic art note is not enough paid substance.',
        ].join('\n'));
      }
      if (file.path.startsWith('playbooks/')) {
        return withBody(file, [
          '# Soulslike Combat Pack Production Playbook',
          '',
          '## Reference Encounter Beats',
          '- One reference beat cannot prove a paid combat module.',
          '',
          '## Engine Implementation Steps',
          '- One engine step leaves the implementation plan too shallow.',
        ].join('\n'));
      }
      if (file.path.startsWith('telemetry/')) {
        return withBody(file, JSON.stringify({
          moduleId: first.manifest.id,
          aiDisclosure: 'AI-assisted',
          noTrainingWithoutOptIn: true,
          signals: [{
            id: 'single-signal',
            label: 'Single signal',
            privacy: 'aggregate-only',
          }],
          dashboards: ['activation-to-engine-export'],
        }));
      }
      return file;
    }),
  }, ...rest];

  const report = buildProModuleReleaseReadinessReport({
    catalog: brokenCatalog,
    now: 1_477,
    bundleVerification: {
      privateKey,
      keyId: 'greybox-release-test',
      publicKeys: { 'greybox-release-test': publicKey },
      licenseSecret: 'release-readiness-license-secret',
      nonceForModule: (_module, index) => Buffer.alloc(12, index + 1),
    },
  });

  assert.equal(report.ready, false);
  const issue = report.issues.find((candidate) => (
    candidate.code === 'payload_class_missing'
    && candidate.moduleId === 'soulslike-combat-pack'
    && candidate.detail.includes('incomplete authored payload depth')
  ));
  assert.ok(issue);
  assert.match(issue.detail, /needs at least four paid pack recipes/u);
  assert.match(issue.detail, /needs at least four closed-core art direction notes/u);
  assert.match(issue.detail, /needs at least four reference encounter beats/u);
  assert.match(issue.detail, /needs at least four engine implementation steps/u);
  assert.match(issue.detail, /needs at least four aggregate telemetry signals/u);
  assert.match(issue.detail, /needs at least three telemetry dashboards/u);
  assert.equal(report.checks.find((check) => check.id === 'catalog-health')?.status, 'fail');
});

test('release readiness blocks AI-generated claims and missing human designer credit', () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const [first, ...rest] = proModuleCatalog;
  assert.ok(first);
  const brokenCatalog = [{
    ...first,
    files: first.files.map((file) => {
      if (file.path.startsWith('skills/')) {
        return withBody(file, file.body
          .replace('AI-assisted design work', 'AI-generated design work')
          .replace('human designer authorship', 'automated authorship'));
      }
      if (file.path.startsWith('engine-targets/')) {
        const payload = JSON.parse(file.body) as Record<string, unknown>;
        return withBody(file, JSON.stringify({
          ...payload,
          aiDisclosure: 'AI-generated',
          humanDesignerCreditRequired: false,
        }));
      }
      if (file.path.startsWith('telemetry/')) {
        const payload = JSON.parse(file.body) as Record<string, unknown>;
        return withBody(file, JSON.stringify({
          ...payload,
          noTrainingWithoutOptIn: false,
        }));
      }
      return file;
    }),
  }, ...rest];

  const report = buildProModuleReleaseReadinessReport({
    catalog: brokenCatalog,
    now: 1_480,
    bundleVerification: {
      privateKey,
      keyId: 'greybox-release-test',
      publicKeys: { 'greybox-release-test': publicKey },
      licenseSecret: 'release-readiness-license-secret',
      nonceForModule: (_module, index) => Buffer.alloc(12, index + 1),
    },
  });

  assert.equal(report.ready, false);
  assert.equal(report.schedule[0]?.disclosureContractsComplete, false);
  assert.ok(report.issues.some((issue) => (
    issue.code === 'ai_disclosure_contract_missing'
    && issue.moduleId === 'soulslike-combat-pack'
    && issue.detail.includes('uses banned AI-generated language')
    && issue.detail.includes('does not require human designer credit')
    && issue.detail.includes('does not require opt-in before training use')
  )));
  assert.equal(report.checks.find((check) => check.id === 'catalog-health')?.status, 'fail');
});

test('release readiness fails closed without bundle verification or enough launch modules', () => {
  const report = buildProModuleReleaseReadinessReport({
    now: 1_100,
    targets: {
      launchModuleCount: 13,
      yearOneModuleCount: 13,
      minModulesByMonth12: 13,
    },
  });

  assert.equal(report.ready, false);
  assert.deepEqual(report.issues.map((issue) => issue.code).sort(), [
    'bundle_verification_not_run',
    'launch_module_shortfall',
    'month12_shortfall',
    'year_one_module_shortfall',
  ]);
  assert.equal(report.checks.find((check) => check.id === 'bundle-verification')?.status, 'fail');
  assert.equal(report.checks.find((check) => check.id === 'month-12-module-count')?.status, 'fail');
  assert.equal(report.checks.find((check) => check.id === 'year-one-module-count')?.status, 'fail');
});

test('release readiness catches payload drift before a module is shipped', () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const [first, ...rest] = proModuleCatalog;
  assert.ok(first);
  const driftedCatalog = [{
    ...first,
    files: first.files.slice(0, 2),
  }, ...rest];

  const report = buildProModuleReleaseReadinessReport({
    catalog: driftedCatalog,
    now: 1_200,
    bundleVerification: {
      privateKey,
      keyId: 'greybox-release-test',
      publicKeys: { 'greybox-release-test': publicKey },
      licenseSecret: 'release-readiness-license-secret',
      nonceForModule: (_module, index) => Buffer.alloc(12, index + 1),
    },
  });

  assert.equal(report.ready, false);
  assert.ok(report.issues.some((issue) => issue.code === 'catalog_invalid' && issue.moduleId === undefined));
  assert.ok(report.issues.some((issue) => issue.code === 'payload_file_shortfall' && issue.moduleId === 'soulslike-combat-pack'));
  assert.ok(report.issues.some((issue) => issue.code === 'payload_class_missing' && issue.moduleId === 'soulslike-combat-pack'));
  assert.equal(report.checks.find((check) => check.id === 'catalog-health')?.status, 'fail');
});

test('release readiness blocks the train if an engine export companion drops out', () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const catalogWithoutGodot = proModuleCatalog.filter((module) => module.manifest.id !== 'godot-scene-tree-export-pro');

  const report = buildProModuleReleaseReadinessReport({
    catalog: catalogWithoutGodot,
    now: 1_300,
    bundleVerification: {
      privateKey,
      keyId: 'greybox-release-test',
      publicKeys: { 'greybox-release-test': publicKey },
      licenseSecret: 'release-readiness-license-secret',
      nonceForModule: (_module, index) => Buffer.alloc(12, index + 1),
    },
  });

  assert.equal(report.ready, false);
  assert.ok(report.issues.some((issue) => issue.code === 'year_one_module_shortfall'));
  assert.ok(report.issues.some((issue) => issue.code === 'engine_companion_missing' && issue.moduleId === 'godot-scene-tree-export-pro'));
  assert.equal(report.checks.find((check) => check.id === 'engine-companions')?.status, 'fail');
});
