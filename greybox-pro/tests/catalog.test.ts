// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertCatalogHealthy,
  launchReadyModules,
  proModuleCatalog,
  publicCatalog,
} from '../src/index.js';
import type { ProModuleDefinition } from '../src/index.js';

interface EngineTargetFieldContract {
  field: string;
  valueType: string;
  reviewRequired: boolean;
  conflictPolicy: string;
  mergeStrategy: string;
  webArtifactPath: string;
  engineBindings: Record<string, Record<string, unknown>>;
  acceptanceCriteria: string[];
}

interface EngineTargetPayload {
  schemaVersion: string;
  moduleId: string;
  engine: string;
  targetEngines: string[];
  designerReviewRequired: boolean;
  supportedValueTypes: string[];
  roundTripSafeFields: string[];
  tuningFields: string[];
  fieldContracts: EngineTargetFieldContract[];
  proprietaryPayload?: {
    referenceEncounter?: {
      id: string;
      name: string;
      beats: string[];
    };
    unityObjects?: string[];
    tuningDefaults?: Record<string, number | string>;
    prefabProfile?: string;
  };
  reviewWorkflow: {
    acceptAction: string;
    rejectAction: string;
    conflictUi: string;
    timeoutMinutes: number;
  };
}

test('year-one pro catalog includes the full ordered module ship list', () => {
  assert.deepEqual(
    proModuleCatalog.map((module) => module.manifest.name),
    [
      'Soulslike Combat Pack',
      'Hero Shooter Toolkit',
      'Cozy Sim Pack',
      'Hyper-Casual Mobile Pack',
      'Roguelike Generator Pro',
      'Live-Ops Pro',
      'Monetization Simulator',
      'Steam Next Fest Planner',
      'Console Submission Checklist',
      'Unity Full Prefab Export Pro',
      'Unreal Blueprint Export Pro',
      'Godot Scene Tree Export Pro',
    ],
  );
});

test('all twelve pro modules are alpha-ready with launch prices from the operating brief', () => {
  const ready = launchReadyModules();
  assert.equal(ready.length, 12);
  assert.deepEqual(
    ready.map((module) => [module.manifest.id, module.price.oneTimeUsd]),
    [
      ['soulslike-combat-pack', 79],
      ['hero-shooter-toolkit', 99],
      ['cozy-sim-pack', 59],
      ['hyper-casual-mobile-pack', 49],
      ['roguelike-generator-pro', 69],
      ['live-ops-pro', 199],
      ['monetization-simulator', 129],
      ['steam-next-fest-planner', 79],
      ['console-submission-checklist', 149],
      ['unity-full-prefab-export-pro', 99],
      ['unreal-blueprint-export-pro', 99],
      ['godot-scene-tree-export-pro', 79],
    ],
  );
});

test('catalog manifests mount closed payload files without digest drift', () => {
  assert.doesNotThrow(() => assertCatalogHealthy());
  for (const module of proModuleCatalog) {
    assert.equal(module.manifest.licenseTier, 'pro');
    assert.equal(module.files.length, 5);
    assert.ok(module.manifest.mounts.skills?.length);
    assert.ok(module.manifest.mounts.gameArtBibles?.length);
    assert.ok(module.manifest.mounts.engineTargets?.length);
    assert.ok(module.files.some((file) => file.path.endsWith('/PLAYBOOK.md')));
    assert.ok(module.files.some((file) => file.path.endsWith('/signals.json')));
  }
});

test('catalog health rejects daemon-incompatible paths, mounts, and digest drift', () => {
  const first = proModuleCatalog[0];
  assert.ok(first);
  const firstSkills = first.manifest.mounts.skills;
  assert.ok(firstSkills);

  const unsafeFilePath: ProModuleDefinition = {
    ...first,
    files: first.files.map((file, index) => (
      index === 0 ? { ...file, path: '../skills/leak.md' } : file
    )),
  };
  assert.throws(() => assertCatalogHealthy([unsafeFilePath]), /unsafe file path \.\.\/skills\/leak\.md/u);

  const dotSegmentFilePath: ProModuleDefinition = {
    ...first,
    files: first.files.map((file, index) => (
      index === 0 ? { ...file, path: 'skills/./leak.md' } : file
    )),
  };
  assert.throws(() => assertCatalogHealthy([dotSegmentFilePath]), /unsafe file path skills\/\.\/leak\.md/u);

  const unsafeMountEntry: ProModuleDefinition = {
    ...first,
    manifest: {
      ...first.manifest,
      mounts: {
        ...first.manifest.mounts,
        skills: firstSkills.map((mount, index) => (
          index === 0 ? { ...mount, entry: '../skills/leak.md' } : mount
        )),
      },
    },
  };
  assert.throws(() => assertCatalogHealthy([unsafeMountEntry]), /unsafe mount entry \.\.\/skills\/leak\.md/u);

  const digestDrift: ProModuleDefinition = {
    ...first,
    files: first.files.map((file, index) => (
      index === 0 ? { ...file, body: `${file.body}\nDrift after digest generation.` } : file
    )),
  };
  assert.throws(() => assertCatalogHealthy([digestDrift]), /file body digest mismatch/u);
});

test('each alpha-ready module includes review gates and aggregate-only telemetry contracts', () => {
  for (const module of launchReadyModules()) {
    const skill = module.files.find((file) => file.path.endsWith('/SKILL.md'));
    const telemetry = module.files.find((file) => file.path.endsWith('/signals.json'));
    assert.match(skill?.body ?? '', /Designer Review Gates/u);
    assert.ok(telemetry);
    const contract = JSON.parse(telemetry.body) as {
      noTrainingWithoutOptIn?: boolean;
      signals?: Array<{ privacy?: string }>;
    };
    assert.equal(contract.noTrainingWithoutOptIn, true);
    assert.ok(contract.signals?.length);
    assert.ok(contract.signals.every((signal) => signal.privacy === 'aggregate-only'));
  }
});

test('engine target payloads expose typed reviewed round-trip contracts', () => {
  for (const module of launchReadyModules()) {
    const target = engineTargetPayloadFor(module);
    assert.equal(target.schemaVersion, 'greybox.pro.engine-target/v1');
    assert.equal(target.moduleId, module.manifest.id);
    assert.equal(target.designerReviewRequired, true);
    assert.deepEqual(target.supportedValueTypes, ['int', 'float', 'string', 'Color', 'Vector3']);
    assert.deepEqual(target.roundTripSafeFields, target.tuningFields);
    assert.deepEqual(target.fieldContracts.map((contract) => contract.field), target.tuningFields);
    assert.equal(target.reviewWorkflow.acceptAction, 'mount-reviewed-diff');
    assert.equal(target.reviewWorkflow.rejectAction, 'discard-proposed-diff');
    assert.equal(target.reviewWorkflow.conflictUi, 'show-base-web-engine-values');

    for (const contract of target.fieldContracts) {
      assert.ok(target.supportedValueTypes.includes(contract.valueType));
      assert.equal(contract.reviewRequired, true);
      assert.equal(contract.conflictPolicy, 'designer-review');
      assert.equal(contract.mergeStrategy, 'three-way-last-synced-base');
      assert.ok(contract.webArtifactPath.includes(module.manifest.id));
      assert.ok(target.roundTripSafeFields.includes(contract.field));
      assert.deepEqual(Object.keys(contract.engineBindings), target.targetEngines);
      assert.ok(contract.acceptanceCriteria.some((criterion) => criterion.includes('Designer accepts')));
    }
  }
});

test('soulslike combat exposes Unity-ready tuning knobs for the paid wedge', () => {
  const soulslike = proModuleCatalog.find((module) => module.manifest.id === 'soulslike-combat-pack');
  assert.ok(soulslike);
  const target = engineTargetPayloadFor(soulslike);

  assert.equal(target.engine, 'unity');
  assert.deepEqual(target.targetEngines, ['unity']);
  assert.deepEqual(target.fieldContracts.map((contract) => [contract.field, contract.valueType]), [
    ['enemyHealth', 'int'],
    ['poiseDamage', 'int'],
    ['staminaCost', 'int'],
    ['dodgeInvulnerabilitySeconds', 'float'],
    ['lockOnCameraOffset', 'Vector3'],
  ]);
  const enemyHealth = target.fieldContracts.find((contract) => contract.field === 'enemyHealth');
  assert.equal(enemyHealth?.engineBindings.unity?.component, 'GreyboxProTuningProfile');
  assert.equal(enemyHealth?.engineBindings.unity?.serializedProperty, 'enemyHealth');
  assert.equal(enemyHealth?.engineBindings.unity?.inspectorEditable, true);
});

test('soulslike combat pack carries authored closed-core production content', () => {
  const soulslike = proModuleCatalog.find((module) => module.manifest.id === 'soulslike-combat-pack');
  assert.ok(soulslike);
  const skill = fileBody(soulslike, '/SKILL.md');
  const artBible = fileBody(soulslike, '/DESIGN.md');
  const playbook = fileBody(soulslike, '/PLAYBOOK.md');
  const target = engineTargetPayloadFor(soulslike);

  assert.match(skill, /Punish Window Ladder/u);
  assert.match(skill, /windup 0\.42s minimum/u);
  assert.match(skill, /checkpoint-to-boss-door target is 14-22 seconds/u);
  assert.match(artBible, /Lock-on reticle sits below the head mass/u);
  assert.match(artBible, /white for perfect parry/u);
  assert.match(playbook, /Sentinel of Ash reference encounter/u);
  assert.match(playbook, /first-read clarity, five-death mastery, and no-hit expert route/u);
  assert.equal(target.proprietaryPayload?.referenceEncounter?.id, 'sentinel-of-ash');
  assert.equal(target.proprietaryPayload?.referenceEncounter?.name, 'Sentinel of Ash');
  assert.deepEqual(target.proprietaryPayload?.tuningDefaults, {
    enemyHealth: 1250,
    poiseDamage: 34,
    staminaCost: 18,
    dodgeInvulnerabilitySeconds: 0.28,
    lockOnCameraOffset: '0,1.4,-4.8',
  });
  assert.ok(target.proprietaryPayload?.unityObjects?.some((item) => item.includes('GreyboxBossEncounterProfile')));
  assert.equal(target.proprietaryPayload?.prefabProfile, 'Greybox/Pro/SoulslikeCombat/SentinelOfAsh.prefab');
});

test('hero shooter toolkit carries authored closed-core kit and arena content', () => {
  const heroShooter = proModuleCatalog.find((module) => module.manifest.id === 'hero-shooter-toolkit');
  assert.ok(heroShooter);
  const skill = fileBody(heroShooter, '/SKILL.md');
  const artBible = fileBody(heroShooter, '/DESIGN.md');
  const playbook = fileBody(heroShooter, '/PLAYBOOK.md');
  const target = engineTargetPayloadFor(heroShooter);

  assert.match(skill, /Role Triangle Matrix/u);
  assert.match(skill, /One-Second Read Test/u);
  assert.match(skill, /support-safe language/u);
  assert.match(artBible, /Friendly support effects use focus-cyan cores/u);
  assert.match(artBible, /Role icons use triangle for damage/u);
  assert.match(playbook, /Neon Relay reference arena/u);
  assert.match(playbook, /1280x720 stream capture/u);
  assert.equal(target.proprietaryPayload?.referenceEncounter?.id, 'neon-relay');
  assert.equal(target.proprietaryPayload?.referenceEncounter?.name, 'Neon Relay');
  assert.deepEqual(target.proprietaryPayload?.tuningDefaults, {
    cooldownSeconds: 9,
    ultimateChargeRate: 0.82,
    areaRadius: 6.5,
    teamAuraStrength: 0.18,
    objectiveContestWeight: 1.35,
  });
  assert.ok(target.proprietaryPayload?.unityObjects?.some((item) => item.includes('GreyboxHeroKitProfile')));
  assert.ok(target.proprietaryPayload?.unityObjects?.some((item) => item.includes('GreyboxCooldownHudGroup')));
  assert.equal(target.proprietaryPayload?.prefabProfile, 'Greybox/Pro/HeroShooter/NeonRelay.prefab');
});

test('cozy sim pack carries authored closed-core routine and decoration content', () => {
  const cozy = proModuleCatalog.find((module) => module.manifest.id === 'cozy-sim-pack');
  assert.ok(cozy);
  const skill = fileBody(cozy, '/SKILL.md');
  const artBible = fileBody(cozy, '/DESIGN.md');
  const playbook = fileBody(cozy, '/PLAYBOOK.md');
  const target = engineTargetPayloadFor(cozy);

  assert.match(skill, /Gentle Day Loop/u);
  assert.match(skill, /Soft-Fail Ledger/u);
  assert.match(skill, /visible progress inside 7 minutes/u);
  assert.match(artBible, /NPC gift reactions use face, posture/u);
  assert.match(artBible, /Collection board cards use large silhouettes/u);
  assert.match(playbook, /Mossbell Morning reference slice/u);
  assert.match(playbook, /controller-only decoration placement/u);
  assert.equal(target.proprietaryPayload?.referenceEncounter?.id, 'mossbell-morning');
  assert.equal(target.proprietaryPayload?.referenceEncounter?.name, 'Mossbell Morning');
  assert.deepEqual(target.proprietaryPayload?.tuningDefaults, {
    cropGrowthMinutes: 18,
    giftAffinityDelta: 6,
    decorationBudget: 24,
    dailyEnergyCost: 3,
    collectionRarityWeight: 0.42,
  });
  assert.ok(target.proprietaryPayload?.unityObjects?.some((item) => item.includes('GreyboxRoutineBoard')));
  assert.ok(target.proprietaryPayload?.unityObjects?.some((item) => item.includes('GreyboxGiftAffinityTable')));
  assert.equal(target.proprietaryPayload?.prefabProfile, 'Greybox/Pro/CozySim/MossbellMorning.prefab');
});

test('hyper-casual mobile pack carries authored closed-core mobile loop content', () => {
  const hyperCasual = proModuleCatalog.find((module) => module.manifest.id === 'hyper-casual-mobile-pack');
  assert.ok(hyperCasual);
  const skill = fileBody(hyperCasual, '/SKILL.md');
  const artBible = fileBody(hyperCasual, '/DESIGN.md');
  const playbook = fileBody(hyperCasual, '/PLAYBOOK.md');
  const target = engineTargetPayloadFor(hyperCasual);

  assert.match(skill, /Three-Second Clarity/u);
  assert.match(skill, /One-Thumb Timing Ladder/u);
  assert.match(skill, /Ad-Safe Break Rule/u);
  assert.match(artBible, /Reward bursts stay below 40 percent screen height/u);
  assert.match(artBible, /no fake gameplay buttons/u);
  assert.match(playbook, /Glass Dash reference slice/u);
  assert.match(playbook, /retry can happen within 1\.2 seconds/u);
  assert.equal(target.proprietaryPayload?.referenceEncounter?.id, 'glass-dash');
  assert.equal(target.proprietaryPayload?.referenceEncounter?.name, 'Glass Dash');
  assert.deepEqual(target.proprietaryPayload?.tuningDefaults, {
    levelSpeed: 7.5,
    obstacleSpacing: 4.25,
    tapWindowMs: 180,
    rewardMultiplier: 1.6,
    interstitialEveryRuns: 5,
  });
  assert.ok(target.proprietaryPayload?.unityObjects?.some((item) => item.includes('GreyboxOneThumbLevelProfile')));
  assert.ok(target.proprietaryPayload?.unityObjects?.some((item) => item.includes('GreyboxAdBreakPolicy')));
  assert.equal(target.proprietaryPayload?.prefabProfile, 'Greybox/Pro/HyperCasualMobile/GlassDash.prefab');
});

test('roguelike generator pro carries authored closed-core procedural run content', () => {
  const roguelike = proModuleCatalog.find((module) => module.manifest.id === 'roguelike-generator-pro');
  assert.ok(roguelike);
  const skill = fileBody(roguelike, '/SKILL.md');
  const artBible = fileBody(roguelike, '/DESIGN.md');
  const playbook = fileBody(roguelike, '/PLAYBOOK.md');
  const target = engineTargetPayloadFor(roguelike);

  assert.match(skill, /Room Grammar Matrix/u);
  assert.match(skill, /Threat Budget Curve/u);
  assert.match(skill, /Seed Diversity Check/u);
  assert.match(artBible, /Room exits use consistent north\/east\/south\/west silhouettes/u);
  assert.match(artBible, /Miniboss rooms introduce one signature tell color/u);
  assert.match(playbook, /Ember Vault reference run/u);
  assert.match(playbook, /three build archetypes/u);
  assert.equal(target.proprietaryPayload?.referenceEncounter?.id, 'ember-vault');
  assert.equal(target.proprietaryPayload?.referenceEncounter?.name, 'Ember Vault');
  assert.deepEqual(target.proprietaryPayload?.tuningDefaults, {
    roomThreatScore: 42,
    itemRarityWeight: 0.32,
    enemySpawnBudget: 12,
    shopPriceScale: 1.15,
    bossDoorThreshold: 3,
  });
  assert.ok(target.proprietaryPayload?.unityObjects?.some((item) => item.includes('GreyboxRoomGrammarTable')));
  assert.ok(target.proprietaryPayload?.unityObjects?.some((item) => item.includes('GreyboxSeedDiversityProbe')));
  assert.equal(target.proprietaryPayload?.prefabProfile, 'Greybox/Pro/RoguelikeGenerator/EmberVault.prefab');
});

test('live-ops pro carries authored closed-core event and economy content', () => {
  const liveOps = proModuleCatalog.find((module) => module.manifest.id === 'live-ops-pro');
  assert.ok(liveOps);
  const skill = fileBody(liveOps, '/SKILL.md');
  const artBible = fileBody(liveOps, '/DESIGN.md');
  const playbook = fileBody(liveOps, '/PLAYBOOK.md');
  const target = engineTargetPayloadFor(liveOps);

  assert.match(skill, /Event Spine/u);
  assert.match(skill, /Economy Sink Ledger/u);
  assert.match(skill, /Experiment Safety Rule/u);
  assert.match(artBible, /Reward tracks keep premium and free lanes visually parallel/u);
  assert.match(artBible, /Experiment badges use focus-cyan analyst chips/u);
  assert.match(playbook, /Skyfall Festival reference event/u);
  assert.match(playbook, /no pay-to-win escalation/u);
  assert.equal(target.proprietaryPayload?.referenceEncounter?.id, 'skyfall-festival');
  assert.equal(target.proprietaryPayload?.referenceEncounter?.name, 'Skyfall Festival');
  assert.deepEqual(target.proprietaryPayload?.tuningDefaults, {
    eventDurationHours: 72,
    rewardTrackXp: 1200,
    sinkCost: 450,
    reactivationGrant: 250,
    experimentHoldoutPercent: 10,
  });
  assert.ok(target.proprietaryPayload?.unityObjects?.some((item) => item.includes('GreyboxEventCalendar')));
  assert.ok(target.proprietaryPayload?.unityObjects?.some((item) => item.includes('GreyboxExperimentHoldoutProfile')));
  assert.equal(target.proprietaryPayload?.prefabProfile, 'Greybox/Pro/LiveOps/SkyfallFestival.prefab');
});

test('monetization simulator carries authored closed-core trust and economy scenarios', () => {
  const monetization = proModuleCatalog.find((module) => module.manifest.id === 'monetization-simulator');
  assert.ok(monetization);
  const skill = fileBody(monetization, '/SKILL.md');
  const artBible = fileBody(monetization, '/DESIGN.md');
  const playbook = fileBody(monetization, '/PLAYBOOK.md');
  const target = engineTargetPayloadFor(monetization);

  assert.match(skill, /Trust Floor Model/u);
  assert.match(skill, /Offer Pressure Audit/u);
  assert.match(skill, /Child-Safe Mode/u);
  assert.match(artBible, /equal visual weight for decline and inspect actions/u);
  assert.match(artBible, /guardian-gated informational rows/u);
  assert.match(playbook, /Solar Foundry Offer Lab scenario/u);
  assert.match(playbook, /no core loop depends on a purchase/u);
  assert.equal(target.proprietaryPayload?.referenceEncounter?.id, 'solar-foundry-offer-lab');
  assert.equal(target.proprietaryPayload?.referenceEncounter?.name, 'Solar Foundry Offer Lab');
  assert.deepEqual(target.proprietaryPayload?.tuningDefaults, {
    softCurrencyEarnRate: 85,
    premiumPriceUsd: 4.99,
    offerCooldownHours: 24,
    battlePassXpRate: 1,
    nonPayerCatchupGrant: 300,
  });
  assert.ok(target.proprietaryPayload?.unityObjects?.some((item) => item.includes('GreyboxEconomyScenarioProfile')));
  assert.ok(target.proprietaryPayload?.unityObjects?.some((item) => item.includes('GreyboxTrustGuard')));
  assert.equal(target.proprietaryPayload?.prefabProfile, 'Greybox/Pro/Monetization/SolarFoundryOfferLab.prefab');
});

test('steam next fest planner carries authored closed-core demo launch content', () => {
  const nextFest = proModuleCatalog.find((module) => module.manifest.id === 'steam-next-fest-planner');
  assert.ok(nextFest);
  const skill = fileBody(nextFest, '/SKILL.md');
  const artBible = fileBody(nextFest, '/DESIGN.md');
  const playbook = fileBody(nextFest, '/PLAYBOOK.md');
  const target = engineTargetPayloadFor(nextFest);

  assert.match(skill, /Demo Promise Ladder/u);
  assert.match(skill, /First-Three-Minute Hook/u);
  assert.match(skill, /Wishlist CTA Honesty/u);
  assert.match(artBible, /Demo end cards use the game key art/u);
  assert.match(artBible, /Boss tease silhouettes stay readable/u);
  assert.match(playbook, /Clockwork Harbor Demo/u);
  assert.match(playbook, /wishlist prompt appears after real agency/u);
  assert.equal(target.proprietaryPayload?.referenceEncounter?.id, 'clockwork-harbor-demo');
  assert.equal(target.proprietaryPayload?.referenceEncounter?.name, 'Clockwork Harbor Demo');
  assert.deepEqual(target.proprietaryPayload?.tuningDefaults, {
    demoMinutes: 22,
    tutorialStepCount: 5,
    captureMomentPriority: 8,
    wishlistPromptDelay: 18,
    bossTeaseIntensity: 0.7,
  });
  assert.ok(target.proprietaryPayload?.unityObjects?.some((item) => item.includes('GreyboxDemoScopeProfile')));
  assert.ok(target.proprietaryPayload?.unityObjects?.some((item) => item.includes('GreyboxTrailerCaptureBoard')));
  assert.equal(target.proprietaryPayload?.prefabProfile, 'Greybox/Pro/SteamNextFest/ClockworkHarborDemo.prefab');
});

test('console submission checklist carries authored closed-core compliance content', () => {
  const checklist = proModuleCatalog.find((module) => module.manifest.id === 'console-submission-checklist');
  assert.ok(checklist);
  const skill = fileBody(checklist, '/SKILL.md');
  const artBible = fileBody(checklist, '/DESIGN.md');
  const playbook = fileBody(checklist, '/PLAYBOOK.md');
  const target = engineTargetPayloadFor(checklist);

  assert.match(skill, /Evidence Packet Builder/u);
  assert.match(skill, /Suspend Resume Matrix/u);
  assert.match(skill, /Safe Area Sweep/u);
  assert.match(artBible, /Compliance evidence screens use plain numbered rows/u);
  assert.match(playbook, /Platform Cert Lab/u);
  assert.equal(target.proprietaryPayload?.referenceEncounter?.id, 'platform-cert-lab');
  assert.deepEqual(target.proprietaryPayload?.tuningDefaults, {
    autosaveIntervalSeconds: 90,
    controllerReconnectGraceSeconds: 12,
    suspendResumeBudgetMs: 2500,
    safeAreaPadding: '0.08,0.08,0',
    platformRiskSeverity: 2,
  });
  assert.ok(target.proprietaryPayload?.unityObjects?.some((item) => item.includes('GreyboxSubmissionEvidenceLog')));
  assert.equal(target.proprietaryPayload?.prefabProfile, 'Greybox/Pro/ConsoleSubmission/PlatformCertLab.prefab');
});

test('unity full prefab export pro carries authored closed-core export content', () => {
  const unityExport = proModuleCatalog.find((module) => module.manifest.id === 'unity-full-prefab-export-pro');
  assert.ok(unityExport);
  const skill = fileBody(unityExport, '/SKILL.md');
  const artBible = fileBody(unityExport, '/DESIGN.md');
  const playbook = fileBody(unityExport, '/PLAYBOOK.md');
  const target = engineTargetPayloadFor(unityExport);

  assert.match(skill, /Stable Prefab Tree/u);
  assert.match(skill, /Addressables Hygiene Rule/u);
  assert.match(artBible, /Generated material swatches display albedo/u);
  assert.match(playbook, /Harbor Prefab Export sample/u);
  assert.equal(target.proprietaryPayload?.referenceEncounter?.id, 'harbor-prefab-export');
  assert.deepEqual(target.proprietaryPayload?.tuningDefaults, {
    prefabScale: 1,
    materialVariant: 'URP_Default',
    addressableGroup: 'GreyboxGenerated',
    spawnPointPosition: '0,1,0',
    uiCanvasSortOrder: 10,
  });
  assert.ok(target.proprietaryPayload?.unityObjects?.some((item) => item.includes('GreyboxPrefabExportProfile')));
  assert.equal(target.proprietaryPayload?.prefabProfile, 'Greybox/Pro/UnityFullPrefabExport/HarborPrefabExport.prefab');
});

test('unreal blueprint export pro carries authored closed-core blueprint content', () => {
  const unrealExport = proModuleCatalog.find((module) => module.manifest.id === 'unreal-blueprint-export-pro');
  assert.ok(unrealExport);
  const skill = fileBody(unrealExport, '/SKILL.md');
  const artBible = fileBody(unrealExport, '/DESIGN.md');
  const playbook = fileBody(unrealExport, '/PLAYBOOK.md');
  const target = engineTargetPayloadFor(unrealExport);

  assert.match(skill, /Blueprint Contract Card/u);
  assert.match(skill, /PIE Smoke Script/u);
  assert.match(artBible, /UMG anchor previews use focus-cyan bounds/u);
  assert.match(playbook, /Boss Door Blueprint sample/u);
  assert.equal(target.proprietaryPayload?.referenceEncounter?.id, 'boss-door-blueprint');
  assert.deepEqual(target.proprietaryPayload?.tuningDefaults, {
    blueprintClassName: 'BP_GreyboxBossDoor',
    exposedVariableDefault: 'Requires 3 keys',
    widgetAnchor: '0.5,0.82,0',
    dataAssetRowName: 'BossDoor_Default',
    collisionPreset: 'GreyboxInteractable',
  });
  assert.ok(target.proprietaryPayload?.unityObjects?.some((item) => item.includes('GreyboxBlueprintExportProfile')));
  assert.equal(target.proprietaryPayload?.prefabProfile, 'Greybox/Pro/UnrealBlueprintExport/BossDoorBlueprint.prefab');
});

test('godot scene tree export pro carries authored closed-core scene content', () => {
  const godotExport = proModuleCatalog.find((module) => module.manifest.id === 'godot-scene-tree-export-pro');
  assert.ok(godotExport);
  const skill = fileBody(godotExport, '/SKILL.md');
  const artBible = fileBody(godotExport, '/DESIGN.md');
  const playbook = fileBody(godotExport, '/PLAYBOOK.md');
  const target = engineTargetPayloadFor(godotExport);

  assert.match(skill, /Scene Tree Contract/u);
  assert.match(skill, /Signal Binding Ledger/u);
  assert.match(artBible, /Scene-tree previews use indentation/u);
  assert.match(playbook, /Signal Garden Scene/u);
  assert.equal(target.proprietaryPayload?.referenceEncounter?.id, 'signal-garden-scene');
  assert.deepEqual(target.proprietaryPayload?.tuningDefaults, {
    nodePath: 'World/Pickup',
    signalName: 'collected',
    resourceUid: 'uid://greybox-signal-garden',
    collisionLayer: 2,
    exportPreset: 'godot-4-scene',
  });
  assert.ok(target.proprietaryPayload?.unityObjects?.some((item) => item.includes('GreyboxGodotSceneProfile')));
  assert.equal(target.proprietaryPayload?.prefabProfile, 'Greybox/Pro/GodotSceneTreeExport/SignalGardenScene.prefab');
});

test('multi-engine modules carry bindings for every engine companion path', () => {
  const liveOps = proModuleCatalog.find((module) => module.manifest.id === 'live-ops-pro');
  assert.ok(liveOps);
  const target = engineTargetPayloadFor(liveOps);

  assert.equal(target.engine, 'multi-engine');
  assert.deepEqual(target.targetEngines, ['unity', 'unreal', 'godot']);
  for (const contract of target.fieldContracts) {
    assert.ok(contract.engineBindings.unity);
    assert.ok(contract.engineBindings.unreal);
    assert.ok(contract.engineBindings.godot);
  }
});

test('public catalog exposes sellable metadata without proprietary payload bodies', () => {
  const catalog = publicCatalog();
  assert.equal(catalog.length, 12);
  assert.equal(catalog[0]?.name, 'Soulslike Combat Pack');
  assert.equal(catalog[0]?.mountCount, 3);
  assert.equal(JSON.stringify(catalog).includes('Proprietary and confidential'), false);
});

function engineTargetPayloadFor(module: ProModuleDefinition): EngineTargetPayload {
  const engineTargetFile = module.files.find((file) => file.path.startsWith('engine-targets/'));
  assert.ok(engineTargetFile);
  return JSON.parse(engineTargetFile.body) as EngineTargetPayload;
}

function fileBody(module: ProModuleDefinition, suffix: string): string {
  const file = module.files.find((candidate) => candidate.path.endsWith(suffix));
  assert.ok(file);
  return file.body;
}
