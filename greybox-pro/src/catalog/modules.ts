// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { createHash } from 'node:crypto';

import type {
  ProModuleCategory,
  ProModuleDefinition,
  ProModuleFile,
  ProModuleManifest,
  ProModulePrice,
  ProModulePublicListing,
} from '../types.js';

interface ProModuleSpec {
  order: number;
  id: string;
  name: string;
  price: ProModulePrice;
  audience: string;
  category: ProModuleCategory;
  status: ProModuleDefinition['status'];
  positioning: string;
  primaryLoop: string;
  engineTarget: 'unity' | 'unreal' | 'godot' | 'multi-engine';
  workflow: string[];
  telemetrySignals: string[];
  qaGates: string[];
  tuningFields: string[];
  authored?: ProModuleAuthoredContent;
}

interface ProModuleAuthoredContent {
  skillRecipes: string[];
  artDirection: string[];
  unityObjects: string[];
  playbookSteps: string[];
  referenceEncounter: {
    id: string;
    name: string;
    beats: string[];
  };
  tuningDefaults: Record<string, number | string>;
}

type EngineName = 'unity' | 'unreal' | 'godot';
type RoundTripValueType = 'int' | 'float' | 'string' | 'Color' | 'Vector3';

const ROUND_TRIP_VALUE_TYPES: readonly RoundTripValueType[] = ['int', 'float', 'string', 'Color', 'Vector3'];
const SAFE_ID_RE = /^[a-z0-9][a-z0-9-]{0,79}$/u;
const SAFE_ENTRY_RE = /^[a-zA-Z0-9._/-]{1,240}$/u;
const SEMVERISH_RE = /^[0-9]+(?:\.[0-9]+){0,2}(?:[-+][a-zA-Z0-9.-]+)?$/u;
const SHA256_RE = /^[a-f0-9]{64}$/u;

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function file(path: string, mediaType: ProModuleFile['mediaType'], body: string): ProModuleFile {
  return {
    path,
    mediaType,
    body,
    digestSha256: sha256(body),
  };
}

function skillMarkdown(spec: ProModuleSpec): string {
  return [
    '<!-- Proprietary and confidential. Copyright (c) 2026 Greybox Studio. -->',
    `# ${spec.name}`,
    '',
    `Audience: ${spec.audience}`,
    `Loop: ${spec.primaryLoop}`,
    '',
    'Use this closed-core skill for AI-assisted design work only when a licensed Greybox Pro key is present.',
    'Preserve human designer authorship, avoid IP imitation, and emit engine-ready deltas with explicit review notes.',
    '',
    '## Outputs',
    '- One production brief with pillars, readability rules, pacing notes, and failure states.',
    '- One engine export plan with prefab, blueprint, or scene-tree implications.',
    '- One QA checklist focused on shipped-game risks, not prototype theatrics.',
    '',
    '## Workflow',
    ...spec.workflow.map((step, index) => `${index + 1}. ${step}`),
    '',
    '## Designer Review Gates',
    ...spec.qaGates.map((gate) => `- ${gate}`),
    ...authoredMarkdownSection('Paid Pack Recipes', spec.authored?.skillRecipes),
  ].join('\n');
}

function artBibleMarkdown(spec: ProModuleSpec): string {
  return [
    '<!-- Proprietary and confidential. Copyright (c) 2026 Greybox Studio. -->',
    `# ${spec.name} Art Bible`,
    '',
    `Positioning: ${spec.positioning}`,
    '',
    '## Visual Pillars',
    '- Readability before ornament.',
    '- Clear silhouette language for interactive and non-interactive objects.',
    '- Camera-safe contrast for capture, streaming, and store-page clips.',
    '',
    '## Interaction Feel',
    `- Tune the core loop around ${spec.primaryLoop.toLowerCase()}.`,
    '- Prefer designer-controlled accept/reject diffs over unattended generation.',
    '',
    '## Tuning Vocabulary',
    ...spec.tuningFields.map((field) => `- ${field}`),
    ...authoredMarkdownSection('Closed-Core Art Direction', spec.authored?.artDirection),
  ].join('\n');
}

function engineTargetJson(spec: ProModuleSpec): string {
  const targetEngines = enginesFor(spec.engineTarget);
  return JSON.stringify({
    schemaVersion: 'greybox.pro.engine-target/v1',
    id: `${spec.id}-${spec.engineTarget}-target`,
    moduleId: spec.id,
    engine: spec.engineTarget,
    targetEngines,
    aiDisclosure: 'AI-assisted',
    humanDesignerCreditRequired: true,
    designerReviewRequired: true,
    exports: ['skill', 'artBible', 'engineTarget'],
    supportedValueTypes: ROUND_TRIP_VALUE_TYPES,
    roundTripSafeFields: spec.tuningFields,
    tuningFields: spec.tuningFields,
    fieldContracts: spec.tuningFields.map((fieldName) => ({
      field: fieldName,
      designerLabel: designerLabel(fieldName),
      valueType: tuningValueType(fieldName),
      reviewRequired: true,
      conflictPolicy: 'designer-review',
      mergeStrategy: 'three-way-last-synced-base',
      webArtifactPath: `proModules.${spec.id}.tuning.${fieldName}`,
      engineBindings: Object.fromEntries(
        targetEngines.map((engine) => [engine, engineBinding(spec, fieldName, engine)]),
      ),
      acceptanceCriteria: [
        'Designer accepts or rejects the diff before export.',
        'Runtime value remains editable in the target engine inspector.',
        'Greybox source stamp keeps the field eligible for round-trip merge.',
      ],
    })),
    reviewWorkflow: {
      acceptAction: 'mount-reviewed-diff',
      rejectAction: 'discard-proposed-diff',
      conflictUi: 'show-base-web-engine-values',
      timeoutMinutes: 120,
    },
    proprietaryPayload: spec.authored ? {
      referenceEncounter: spec.authored.referenceEncounter,
      unityObjects: spec.authored.unityObjects,
      tuningDefaults: spec.authored.tuningDefaults,
      prefabProfile: `Greybox/Pro/${pascalCase(moduleNamespace(spec.id))}/${pascalCase(spec.authored.referenceEncounter.id)}.prefab`,
    } : undefined,
    qaGates: spec.qaGates,
  }, null, 2);
}

function authoredMarkdownSection(title: string, lines: readonly string[] | undefined): string[] {
  if (!lines?.length) return [];
  return [
    '',
    `## ${title}`,
    ...lines.map((line) => `- ${line}`),
  ];
}

function enginesFor(engineTarget: ProModuleSpec['engineTarget']): readonly EngineName[] {
  if (engineTarget === 'multi-engine') return ['unity', 'unreal', 'godot'];
  return [engineTarget];
}

function designerLabel(fieldName: string): string {
  return fieldName
    .replace(/([a-z0-9])([A-Z])/gu, '$1 $2')
    .replace(/^./u, (character) => character.toUpperCase());
}

function tuningValueType(fieldName: string): RoundTripValueType {
  const lower = fieldName.toLowerCase();
  if (/(position|offset|anchor|padding)/u.test(lower)) return 'Vector3';
  if (/(color|colour|tint|palette)/u.test(lower)) return 'Color';
  if (/(classname|class|name|path|uid|preset|variant|group|signal|row|material|resource)/u.test(lower)) {
    return 'string';
  }
  if (/(count|every|runs|health|damage|budget|threshold|xp|price|cost|grant|score|severity|interval)/u.test(lower)) {
    return 'int';
  }
  return 'float';
}

function engineBinding(
  spec: ProModuleSpec,
  fieldName: string,
  engine: EngineName,
): Record<string, string | boolean> {
  const pascalField = pascalCase(fieldName);
  const sourceStamp = `gbpro:${spec.id}:${fieldName}`;
  if (engine === 'unity') {
    return {
      component: 'GreyboxProTuningProfile',
      serializedProperty: fieldName,
      prefabMetadataKey: sourceStamp,
      addressablesLabel: `gbpro-${spec.id}`,
      inspectorEditable: true,
    };
  }
  if (engine === 'unreal') {
    return {
      assetType: 'UGreyboxProTuningProfile',
      blueprintVariable: pascalField,
      metadataKey: sourceStamp,
      contentFolder: `/Game/Greybox/Pro/${pascalCase(spec.id)}`,
      detailsPanelEditable: true,
    };
  }
  return {
    resourceType: 'GreyboxProTuningProfile',
    exportedProperty: fieldName,
    nodePath: '%GreyboxProTuningProfile',
    metadataKey: sourceStamp,
    inspectorEditable: true,
  };
}

function pascalCase(value: string): string {
  return value
    .split(/[^a-z0-9]+|(?=[A-Z])/u)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

function moduleNamespace(moduleId: string): string {
  return moduleId.replace(/-(pack|pro|toolkit|checklist|planner|simulator)$/u, '');
}

function playbookMarkdown(spec: ProModuleSpec): string {
  return [
    '<!-- Proprietary and confidential. Copyright (c) 2026 Greybox Studio. -->',
    `# ${spec.name} Production Playbook`,
    '',
    `This paid pack turns ${spec.primaryLoop.toLowerCase()} into reviewable engine deltas.`,
    '',
    '## Sprint Shape',
    '- Day 1: capture pillars, blockers, reference constraints, and target engine version.',
    '- Day 2: generate the first pass of artifacts and run the QA gates below.',
    '- Day 3: accept only reviewed diffs, export to engine, and record telemetry hooks.',
    '',
    '## QA Gates',
    ...spec.qaGates.map((gate) => `- ${gate}`),
    '',
    '## Round-Trip Fields',
    ...spec.tuningFields.map((field) => `- ${field}`),
    ...authoredMarkdownSection('Reference Encounter Beats', spec.authored?.referenceEncounter.beats),
    ...authoredMarkdownSection('Engine Implementation Steps', spec.authored?.playbookSteps),
  ].join('\n');
}

function telemetryJson(spec: ProModuleSpec): string {
  return JSON.stringify({
    moduleId: spec.id,
    aiDisclosure: 'AI-assisted',
    noTrainingWithoutOptIn: true,
    northStarContribution: 'weekly_active_designer_engine_shipments',
    signals: spec.telemetrySignals.map((signal) => ({
      id: signal.toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, ''),
      label: signal,
      privacy: 'aggregate-only',
    })),
    dashboards: [
      'activation-to-engine-export',
      'module-retention-cohort',
      'accepted-tuning-diffs',
    ],
  }, null, 2);
}

function createModule(spec: ProModuleSpec): ProModuleDefinition {
  const skillId = spec.id.replace(/-pack|-pro|-toolkit|-checklist|-planner|-simulator/u, '');
  const skillPath = `skills/${skillId}/SKILL.md`;
  const artBiblePath = `game-art-bibles/${spec.id}/DESIGN.md`;
  const engineTargetPath = `engine-targets/${spec.id}/${spec.engineTarget}.json`;
  const playbookPath = `playbooks/${spec.id}/PLAYBOOK.md`;
  const telemetryPath = `telemetry/${spec.id}/signals.json`;
  const files = [
    file(skillPath, 'text/markdown', skillMarkdown(spec)),
    file(artBiblePath, 'text/markdown', artBibleMarkdown(spec)),
    file(engineTargetPath, 'application/json', engineTargetJson(spec)),
    file(playbookPath, 'text/markdown', playbookMarkdown(spec)),
    file(telemetryPath, 'application/json', telemetryJson(spec)),
  ];
  const [skillFile, artBibleFile, engineTargetFile] = files;
  if (!skillFile || !artBibleFile || !engineTargetFile) {
    throw new Error(`module ${spec.id} did not generate all required mounts`);
  }

  const manifest: ProModuleManifest = {
    id: spec.id,
    name: spec.name,
    version: '0.1.0',
    description: spec.positioning,
    licenseTier: 'pro',
    minAgdsVersion: '0.1.0',
    mounts: {
      skills: [{
        kind: 'skill',
        id: skillId,
        title: spec.name,
        entry: skillFile.path,
        digestSha256: skillFile.digestSha256,
      }],
      gameArtBibles: [{
        kind: 'game-art-bible',
        id: `${spec.id}-art-bible`,
        title: `${spec.name} Art Bible`,
        entry: artBibleFile.path,
        digestSha256: artBibleFile.digestSha256,
      }],
      engineTargets: [{
        kind: 'engine-target',
        id: `${spec.id}-${spec.engineTarget}-target`,
        title: `${spec.name} ${spec.engineTarget} Target`,
        entry: engineTargetFile.path,
        digestSha256: engineTargetFile.digestSha256,
      }],
    },
  };

  return {
    order: spec.order,
    category: spec.category,
    price: spec.price,
    audience: spec.audience,
    status: spec.status,
    targetShipWindowWeeks: spec.status === 'alpha-ready' ? 2 : 4,
    manifest,
    files,
    positioning: spec.positioning,
  };
}

const moduleSpecs: ProModuleSpec[] = [
  {
    order: 1,
    id: 'soulslike-combat-pack',
    name: 'Soulslike Combat Pack',
    price: { currency: 'USD', oneTimeUsd: 79 },
    audience: 'Action-RPG indies',
    category: 'combat',
    status: 'alpha-ready',
    positioning: 'Stamina, boss readability, dodge timing, lock-on HUD, and encounter cadence for action-RPG vertical slices.',
    primaryLoop: 'read attack tells, commit, recover, and learn',
    engineTarget: 'unity',
    workflow: [
      'Convert boss phases into readable tells, stamina costs, punish windows, and recovery notes.',
      'Generate lock-on HUD, hit reaction, checkpoint, and encounter pacing deltas for Unity prefabs.',
      'Run the QA gates before exporting any combat tuning into the shipped scene.',
    ],
    telemetrySignals: ['death-by-phase', 'stamina-empty-rate', 'boss-retry-depth', 'parry-window-acceptance'],
    qaGates: ['Every lethal attack has a readable windup.', 'Camera lock stays stable during dodge recovery.', 'Checkpoint distance supports fast retry without trivializing mastery.'],
    tuningFields: ['enemyHealth', 'poiseDamage', 'staminaCost', 'dodgeInvulnerabilitySeconds', 'lockOnCameraOffset'],
    authored: {
      skillRecipes: [
        'Punish Window Ladder: light punish at 0.55s recovery, heavy punish at 0.95s recovery, flask-safe punish only after phase-break stagger.',
        'Tell Budget: every lethal attack needs silhouette windup 0.42s minimum, audio edge 0.18s before active frames, and one non-damaging rehearsal in phase one.',
        'Stamina Arc: opening combo costs 38 percent of base stamina, panic roll costs 22 percent, perfect dodge refunds one light attack only after designer approval.',
        'Retry Contract: checkpoint-to-boss-door target is 14-22 seconds with no required trash encounter on repeat attempts.',
      ],
      artDirection: [
        'Boss weak points use warm ember accents only during recoverable states; neutral armor stays ash graphite to preserve tell contrast.',
        'Lock-on reticle sits below the head mass, not over the face, and changes thickness during unblockable windup.',
        'Dodge feedback uses one frame of cyan edge light on the player silhouette followed by a low-saturation afterimage under 220 ms.',
        'Hit sparks are directional: orange for player damage, white for perfect parry, muted red for blocked stamina damage.',
      ],
      unityObjects: [
        'GreyboxBossEncounterProfile ScriptableObject with phase table, stamina budgets, punish windows, and checkpoint id.',
        'GreyboxLockOnHud prefab with reticle, distance tick, unblockable pulse, and camera offset binding.',
        'GreyboxStaminaTuning MonoBehaviour on the player prefab with inspector fields mapped to round-trip contracts.',
        'GreyboxBossArenaMarker empty objects for entrance, fog gate, checkpoint, spawn point, and safe flask zones.',
      ],
      playbookSteps: [
        'Create the Sentinel of Ash reference encounter in a clean Unity 2022.3 scene before authoring a customer boss.',
        'Tune enemyHealth and poiseDamage first, then staminaCost, then dodgeInvulnerabilitySeconds, then lockOnCameraOffset.',
        'Run three test passes: first-read clarity, five-death mastery, and no-hit expert route.',
        'Export accepted diffs only after the designer signs off on readable windup, retry distance, and camera stability.',
      ],
      referenceEncounter: {
        id: 'sentinel-of-ash',
        name: 'Sentinel of Ash',
        beats: [
          'Phase 1 teaches horizontal sweep, delayed overhead, and safe flask spacing without lethal mixups.',
          'Phase 2 adds ember lunge only after a clear kneel-and-ignite transition beat.',
          'Phase break staggers at 55 percent health and guarantees one heavy punish window.',
          'Arena has one pillar used for camera stress, not cheese protection.',
        ],
      },
      tuningDefaults: {
        enemyHealth: 1250,
        poiseDamage: 34,
        staminaCost: 18,
        dodgeInvulnerabilitySeconds: 0.28,
        lockOnCameraOffset: '0,1.4,-4.8',
      },
    },
  },
  {
    order: 2,
    id: 'hero-shooter-toolkit',
    name: 'Hero Shooter Toolkit',
    price: { currency: 'USD', oneTimeUsd: 99 },
    audience: 'Multiplayer shooter teams',
    category: 'shooter',
    status: 'alpha-ready',
    positioning: 'Ability readability, team role kits, cooldown surfacing, and scoreboard clarity for hero shooter prototypes.',
    primaryLoop: 'choose role, combine abilities, rotate objective, and counter-pick',
    engineTarget: 'unity',
    workflow: [
      'Map each hero to role, counterplay, ability silhouette, cooldown surface, and objective contribution.',
      'Generate kit cards, HUD cooldown groups, scoreboard fields, and ability prefab deltas.',
      'Reject abilities that cannot be understood from silhouette, sound, and HUD state in under one second.',
    ],
    telemetrySignals: ['ability-readability-fail', 'role-pick-spread', 'objective-rotation-delay', 'cooldown-misread'],
    qaGates: ['Every ultimate has a distinct warning layer.', 'Scoreboard clarifies team contribution without shaming support play.', 'Cooldowns remain readable at streaming resolution.'],
    tuningFields: ['cooldownSeconds', 'ultimateChargeRate', 'areaRadius', 'teamAuraStrength', 'objectiveContestWeight'],
    authored: {
      skillRecipes: [
        'Role Triangle Matrix: each hero must declare anchor, pressure, sustain, or disrupt as a primary job and one counter-job they intentionally lose.',
        'One-Second Read Test: silhouette plus first sound cue must explain damage shape, travel speed, and danger radius before the ability lands.',
        'Cooldown Surface Rule: every player-facing cooldown appears in HUD, character animation, or world decal; hidden cooldowns are only allowed for passive team auras.',
        'Objective Rotation Script: generate one rotation callout per lane, with support-safe language that credits healing, space-making, and peel.',
      ],
      artDirection: [
        'Friendly support effects use focus-cyan cores with low-opacity rings; enemy denial effects use spark-orange edges with hard outer silhouettes.',
        'Ultimates reserve full-screen color shifts for 420 ms maximum and must leave objective markers readable at 720p stream capture.',
        'Role icons use triangle for damage, shield for anchor, plus for sustain, and split-arrow for disrupt across kit cards and scoreboard.',
        'Ability decals show danger radius first, decorative particles second, and never hide payload or capture-point outlines.',
      ],
      unityObjects: [
        'GreyboxHeroKitProfile ScriptableObject with role, counters, ability cooldowns, ultimate economy, and objective contribution weights.',
        'GreyboxCooldownHudGroup prefab with primary, movement, utility, and ultimate slots mapped to ability ids.',
        'GreyboxAbilityReadabilityProbe MonoBehaviour for measuring warning lead time, radius visibility, and streamer-resolution contrast.',
        'GreyboxObjectiveRotationMarker objects for lane entry, off-angle pressure, support fallback, and overtime contest positions.',
      ],
      playbookSteps: [
        'Build the Neon Relay reference arena with one payload lane, two off-angles, and one support-safe fallback route.',
        'Author three starter heroes: Anchor tank, Burst damage, and Sustain support before adding disrupt or flank kits.',
        'Tune cooldownSeconds and areaRadius first, then ultimateChargeRate, then teamAuraStrength, then objectiveContestWeight.',
        'Run readability passes at native resolution and 1280x720 stream capture before approving kit deltas.',
      ],
      referenceEncounter: {
        id: 'neon-relay',
        name: 'Neon Relay',
        beats: [
          'Opening lane teaches payload pressure with low verticality and two clean cover resets.',
          'Midpoint introduces one off-angle that damage can use but support can safely decline.',
          'Final bend creates a 12-second overtime contest window with visible tank peel routes.',
          'Reference kits include Anchor Bastion, Volt Runner, and Luma Medic for role-spread testing.',
        ],
      },
      tuningDefaults: {
        cooldownSeconds: 9,
        ultimateChargeRate: 0.82,
        areaRadius: 6.5,
        teamAuraStrength: 0.18,
        objectiveContestWeight: 1.35,
      },
    },
  },
  {
    order: 3,
    id: 'cozy-sim-pack',
    name: 'Cozy Sim Pack',
    price: { currency: 'USD', oneTimeUsd: 59 },
    audience: 'Casual mobile / Switch',
    category: 'cozy-sim',
    status: 'alpha-ready',
    positioning: 'Routine design, collection readability, low-friction HUDs, and gentle pacing for cozy sim slices.',
    primaryLoop: 'tend, collect, decorate, gift, and return tomorrow',
    engineTarget: 'unity',
    workflow: [
      'Turn routines into low-pressure tasks with visible progress, soft failure, and return hooks.',
      'Generate collection boards, NPC gift notes, decoration budgets, and gentle HUD states.',
      'Validate that every loop can pause cleanly for handheld and family-play sessions.',
    ],
    telemetrySignals: ['daily-return-rate', 'decoration-session-length', 'gift-success-rate', 'inventory-friction'],
    qaGates: ['No task punishes missed days harshly.', 'Inventory actions fit controller and touch input.', 'Decoration previews preserve cozy readability.'],
    tuningFields: ['cropGrowthMinutes', 'giftAffinityDelta', 'decorationBudget', 'dailyEnergyCost', 'collectionRarityWeight'],
    authored: {
      skillRecipes: [
        'Gentle Day Loop: morning care task, midday social choice, evening decoration beat, and one optional return hook without punishment.',
        'Soft-Fail Ledger: missed crops pause at wilted-but-recoverable state for 48 in-game hours before any yield penalty applies.',
        'Gift Affinity Ladder: loved gift grants 12 points, liked gift grants 6, neutral gift grants 1, disliked gift never reduces friendship below the prior heart.',
        'Handheld Session Budget: every core loop must produce visible progress inside 7 minutes with pause-safe save points after each task cluster.',
      ],
      artDirection: [
        'Interactable crops use two-frame leaf bounce and paper-colored outline only on focus; non-interactive foliage stays unoutlined.',
        'NPC gift reactions use face, posture, and small icon bursts instead of loud reward flashes.',
        'Decoration previews reserve focus-cyan for valid placement and pause-yellow for soft constraints; crit-red is only for blocked placement.',
        'Collection board cards use large silhouettes, rarity pips, and one-line memory notes readable on Switch handheld distance.',
      ],
      unityObjects: [
        'GreyboxRoutineBoard ScriptableObject with daily task clusters, pause points, return hooks, and soft-fail windows.',
        'GreyboxGiftAffinityTable ScriptableObject with NPC preferences, heart thresholds, and non-punitive disliked-gift rules.',
        'GreyboxDecorationBudget MonoBehaviour with grid footprint, comfort score, placement preview state, and controller focus target.',
        'GreyboxCollectionBoard prefab with rarity filters, discovered silhouettes, and touch/controller navigation bindings.',
      ],
      playbookSteps: [
        'Build the Mossbell Morning reference slice with one garden bed, two NPCs, one decoration corner, and one collection board.',
        'Tune cropGrowthMinutes and dailyEnergyCost first, then giftAffinityDelta, then decorationBudget, then collectionRarityWeight.',
        'Run three player passes: five-minute handheld session, missed-day recovery, and controller-only decoration placement.',
        'Approve exports only when every routine can pause cleanly and missed days create curiosity instead of shame.',
      ],
      referenceEncounter: {
        id: 'mossbell-morning',
        name: 'Mossbell Morning',
        beats: [
          'Player waters three moonleaf sprouts, collects dew, and sees one crop pause point within the first minute.',
          'NPC Mira accepts a shell gift, shows a small posture reaction, and updates the memory note without pressure.',
          'Decoration corner teaches valid, soft-constrained, and blocked placement states with controller focus.',
          'Collection board reveals one common silhouette and one mystery slot as the return hook.',
        ],
      },
      tuningDefaults: {
        cropGrowthMinutes: 18,
        giftAffinityDelta: 6,
        decorationBudget: 24,
        dailyEnergyCost: 3,
        collectionRarityWeight: 0.42,
      },
    },
  },
  {
    order: 4,
    id: 'hyper-casual-mobile-pack',
    name: 'Hyper-Casual Mobile Pack',
    price: { currency: 'USD', oneTimeUsd: 49 },
    audience: 'Ad-monetized mobile',
    category: 'mobile',
    status: 'alpha-ready',
    positioning: 'One-thumb readability, fail-fast loops, ad break pacing, and lightweight level variants for mobile tests.',
    primaryLoop: 'tap, react, fail quickly, retry, and chase a new best',
    engineTarget: 'unity',
    workflow: [
      'Compress the mechanic into one-thumb input, one loss condition, and one score chase.',
      'Generate level variant rules, ad break pacing, haptic moments, and fail-state copy.',
      'Validate first-session clarity before adding any monetization surface.',
    ],
    telemetrySignals: ['first-run-completion', 'retry-within-ten-seconds', 'ad-break-dropoff', 'input-error-rate'],
    qaGates: ['The first interaction is obvious without tutorial text.', 'Ad prompts never interrupt an active attempt.', 'Failure reason is visible within one frame of loss.'],
    tuningFields: ['levelSpeed', 'obstacleSpacing', 'tapWindowMs', 'rewardMultiplier', 'interstitialEveryRuns'],
    authored: {
      skillRecipes: [
        'Three-Second Clarity: first hazard, safe lane, score target, and tap affordance must all be readable before the third second of play.',
        'One-Thumb Timing Ladder: first tap window is 220 ms, second is 180 ms, mastery window is 140 ms; never shrink below 120 ms on 60 Hz mobile.',
        'Ad-Safe Break Rule: interstitial prompts appear only after loss summary and never before retry intent is visible.',
        'Retry Pulse: failed attempts surface one cause, one score delta, and one tap-to-retry affordance within 700 ms.',
      ],
      artDirection: [
        'Primary input lane uses paper-bright contrast against graphite rails; obstacles use spark-orange only on the active collision edge.',
        'Reward bursts stay below 40 percent screen height and never cover the next obstacle spawn lane.',
        'Haptic moments are paired with single-frame scale feedback so muted devices still read success and failure.',
        'Ad prompts use neutral paper panels with explicit close affordance and no fake gameplay buttons.',
      ],
      unityObjects: [
        'GreyboxOneThumbLevelProfile ScriptableObject with speed curve, obstacle spacing bands, tap windows, and fail-state copy.',
        'GreyboxMobileSpawnLane prefab with deterministic lane seed, safe first obstacle, and retry-safe reset marker.',
        'GreyboxScorePulseHud prefab with best-score delta, reward multiplier, and tap-to-retry state.',
        'GreyboxAdBreakPolicy MonoBehaviour with post-loss trigger, interstitial cadence, cooldown, and explicit opt-out labels.',
      ],
      playbookSteps: [
        'Build the Glass Dash reference slice with one lane, three obstacle types, one score pickup, and one post-loss ad-safe prompt.',
        'Tune levelSpeed and obstacleSpacing first, then tapWindowMs, then rewardMultiplier, then interstitialEveryRuns.',
        'Run three sessions: first-run no-text clarity, ten-run retry loop, and ad-break drop-off inspection.',
        'Approve only if the first loss reason is visible in one frame and retry can happen within 1.2 seconds.',
      ],
      referenceEncounter: {
        id: 'glass-dash',
        name: 'Glass Dash',
        beats: [
          'Run starts with one safe lane, one glowing tap pad, and a non-lethal rehearsal obstacle.',
          'Second obstacle introduces timing pressure without changing input vocabulary.',
          'First loss freezes the cause marker for 500 ms before score and retry appear.',
          'Ad prompt appears after every fifth completed run or third loss, never during active motion.',
        ],
      },
      tuningDefaults: {
        levelSpeed: 7.5,
        obstacleSpacing: 4.25,
        tapWindowMs: 180,
        rewardMultiplier: 1.6,
        interstitialEveryRuns: 5,
      },
    },
  },
  {
    order: 5,
    id: 'roguelike-generator-pro',
    name: 'Roguelike Generator Pro',
    price: { currency: 'USD', oneTimeUsd: 69 },
    audience: 'Roguelike indies',
    category: 'roguelike',
    status: 'alpha-ready',
    positioning: 'Run pacing, room grammar, item rarity, enemy mix, and discovery beats for roguelike content systems.',
    primaryLoop: 'enter room, read threat, spend risk, collect upgrade, and route forward',
    engineTarget: 'unity',
    workflow: [
      'Define room grammar, reward pacing, enemy mix, item rarity, and route risk.',
      'Generate weighted room tables, encounter tags, loot budgets, and run summary artifacts.',
      'Stress-test seed diversity before accepting procedural output into a playable build.',
    ],
    telemetrySignals: ['room-clear-rate', 'seed-repeat-risk', 'upgrade-pick-spread', 'boss-entry-power'],
    qaGates: ['Every room seed has a readable escape plan.', 'Rarity curves avoid dead-run spirals.', 'Enemy mixes preserve counterplay at low health.'],
    tuningFields: ['roomThreatScore', 'itemRarityWeight', 'enemySpawnBudget', 'shopPriceScale', 'bossDoorThreshold'],
    authored: {
      skillRecipes: [
        'Room Grammar Matrix: every room declares entrance pressure, exit visibility, cover density, reward promise, and one escape route before enemy placement.',
        'Threat Budget Curve: floor one targets 24-32 threat, floor two targets 36-48, and miniboss rooms may spike only after a safe-shop or heal room.',
        'Loot Tension Ladder: common loot solves immediate survival, rare loot changes routing, legendary loot creates one build-around risk with a visible tradeoff.',
        'Seed Diversity Check: reject seeds when three consecutive rooms share the same silhouette, enemy family, or reward class.',
      ],
      artDirection: [
        'Room exits use consistent north/east/south/west silhouettes with spark-orange rim only on unlocked boss-door progress.',
        'Hazards reserve crit-red edges; pickups reserve loop-green cores; shop affordances use paper panels with stable price tags.',
        'Low-health readability dims decorative floor clutter first and keeps enemy telegraphs, exit arrows, and healing pickups at full contrast.',
        'Miniboss rooms introduce one signature tell color that never appears on normal hazards in the same biome.',
      ],
      unityObjects: [
        'GreyboxRoomGrammarTable ScriptableObject with room tags, entrance pressure, exit visibility, cover density, and reward promise weights.',
        'GreyboxLootBudgetProfile ScriptableObject with rarity curves, tradeoff notes, shop price scale, and run-depth modifiers.',
        'GreyboxSeedDiversityProbe MonoBehaviour for detecting repeated silhouettes, enemy families, reward classes, and dead-run spirals.',
        'GreyboxRunSummaryHud prefab with room clear rate, upgrade picks, boss-door threshold, and route-forward prompts.',
      ],
      playbookSteps: [
        'Build the Ember Vault reference run with eight rooms, one shop, two risk-reward branches, and one readable miniboss gate.',
        'Tune roomThreatScore and enemySpawnBudget first, then itemRarityWeight, then shopPriceScale, then bossDoorThreshold.',
        'Run seed sweeps for ten seeds and reject any route with repeated room silhouettes, dead-run economy, or no low-health escape plan.',
        'Approve exported tables only after the designer reviews floor pacing, rarity curve, and boss-entry power for three build archetypes.',
      ],
      referenceEncounter: {
        id: 'ember-vault',
        name: 'Ember Vault',
        beats: [
          'First room teaches two enemy families and one safe exit before introducing branching risk.',
          'Third room offers a visible rare pickup behind a hazard lane with a clear retreat path.',
          'Shop appears before the miniboss gate and exposes price pressure without forcing a purchase.',
          'Boss door opens after three ember keys and warns when the current build is below target power.',
        ],
      },
      tuningDefaults: {
        roomThreatScore: 42,
        itemRarityWeight: 0.32,
        enemySpawnBudget: 12,
        shopPriceScale: 1.15,
        bossDoorThreshold: 3,
      },
    },
  },
  {
    order: 6,
    id: 'live-ops-pro',
    name: 'Live-Ops Pro',
    price: { currency: 'USD', oneTimeUsd: 199, monthlyUsd: 29 },
    audience: 'Mobile / live service',
    category: 'live-ops',
    status: 'alpha-ready',
    positioning: 'Event calendar, economy sinks, reactivation beats, and experiment briefs for live-service teams.',
    primaryLoop: 'return, claim, complete event, spend, and share progress',
    engineTarget: 'multi-engine',
    workflow: [
      'Convert season goals into event calendars, reward lanes, economy sinks, and experiment hypotheses.',
      'Generate live-ops briefs, calendar payloads, push-safe copy, and retention-risk notes.',
      'Require designer sign-off on every monetized or time-limited mechanic.',
    ],
    telemetrySignals: ['event-join-rate', 'day-three-event-retention', 'sink-source-balance', 'reward-claim-delay'],
    qaGates: ['Event copy states deadlines honestly.', 'Reward tracks avoid pay-to-win escalation.', 'Economy sinks have rollback plans.'],
    tuningFields: ['eventDurationHours', 'rewardTrackXp', 'sinkCost', 'reactivationGrant', 'experimentHoldoutPercent'],
    authored: {
      skillRecipes: [
        'Event Spine: one headline fantasy, one daily ritual, one catch-up path, and one honest end-state reward per event.',
        'Economy Sink Ledger: every sink declares source coverage, rollback lever, whale/non-whale impact, and post-event cleanup.',
        'Reactivation Ladder: day-7 dormant players receive low-pressure return grants, day-30 dormant players receive orientation before offers.',
        'Experiment Safety Rule: holdout groups must preserve core rewards, publish one success metric, and block monetized copy until review.',
      ],
      artDirection: [
        'Event hubs use spark-orange only for active deadline edges; claimed rewards collapse to ash outlines to reduce FOMO pressure.',
        'Reward tracks keep premium and free lanes visually parallel, with price language outside the collectible reward cards.',
        'Reactivation panels use progress restoration copy and player-owned screenshots before any store or bundle surface.',
        'Experiment badges use focus-cyan analyst chips visible only to the team, never to players in production builds.',
      ],
      unityObjects: [
        'GreyboxEventCalendar ScriptableObject with event windows, daily rituals, catch-up beats, and rollback identifiers.',
        'GreyboxRewardTrackProfile ScriptableObject with free/premium lanes, XP thresholds, claim states, and honest deadline copy.',
        'GreyboxEconomySinkLedger MonoBehaviour with source coverage, sink cost, rollback levers, and segment impact notes.',
        'GreyboxExperimentHoldoutProfile ScriptableObject with hypothesis, metrics, holdout percent, and monetization review gate.',
      ],
      playbookSteps: [
        'Build the Skyfall Festival reference event with a 72-hour window, three rituals, one catch-up grant, and one cosmetic reward track.',
        'Tune eventDurationHours and rewardTrackXp first, then sinkCost, then reactivationGrant, then experimentHoldoutPercent.',
        'Run three operator passes: new active player, day-7 dormant player, and non-payer returning after the event midpoint.',
        'Approve only after the designer signs off on deadline clarity, sink rollback, and no pay-to-win escalation.',
      ],
      referenceEncounter: {
        id: 'skyfall-festival',
        name: 'Skyfall Festival',
        beats: [
          'Opening beat grants one ritual immediately and shows the event deadline without blocking the core lobby.',
          'Midpoint beat offers catch-up XP through play, not purchase pressure.',
          'Final-day beat surfaces unclaimed rewards, rollback plan, and a soft next-event teaser.',
          'Post-event cleanup converts spare tokens into low-value cosmetics or currency without creating debt.',
        ],
      },
      tuningDefaults: {
        eventDurationHours: 72,
        rewardTrackXp: 1200,
        sinkCost: 450,
        reactivationGrant: 250,
        experimentHoldoutPercent: 10,
      },
    },
  },
  {
    order: 7,
    id: 'monetization-simulator',
    name: 'Monetization Simulator',
    price: { currency: 'USD', oneTimeUsd: 129 },
    audience: 'F2P teams',
    category: 'monetization',
    status: 'alpha-ready',
    positioning: 'Ethical economy modeling, purchase path review, and retention-sensitive monetization scenarios.',
    primaryLoop: 'earn, choose spend, compare value, and preserve trust',
    engineTarget: 'multi-engine',
    workflow: [
      'Model currency sources, sinks, offers, and progression pressure with explicit trust checks.',
      'Generate economy scenarios, payer/non-payer impact notes, and price sensitivity ranges.',
      'Block outputs that rely on deception, urgency tricks, or child-targeted pressure.',
    ],
    telemetrySignals: ['currency-inflation-rate', 'purchase-path-abandon', 'non-payer-progression-gap', 'offer-fatigue'],
    qaGates: ['Every offer can be declined without blocking core fun.', 'No dark-pattern timer or misleading discount copy ships.', 'Child-directed content disables purchase pressure.'],
    tuningFields: ['softCurrencyEarnRate', 'premiumPriceUsd', 'offerCooldownHours', 'battlePassXpRate', 'nonPayerCatchupGrant'],
    authored: {
      skillRecipes: [
        'Trust Floor Model: non-payers must keep a viable progression route, one cosmetic-only upsell limit, and no core power lockout.',
        'Offer Pressure Audit: reject fake countdowns, misleading discounts, forced bundles, and any prompt that hides gameplay progress.',
        'Price Sensitivity Grid: compare $1.99, $4.99, and $9.99 scenarios against churn risk, session intent, and regional affordability notes.',
        'Child-Safe Mode: child-directed projects disable purchase prompts, scarcity copy, and personalized pressure by default.',
      ],
      artDirection: [
        'Purchase surfaces use neutral paper panels, explicit close controls, and equal visual weight for decline and inspect actions.',
        'Currency icons keep soft and premium currencies visually distinct without making paid currency look like mandatory power.',
        'Price comparison rows show actual contents first, savings language second, and never use pulsing urgency effects.',
        'Child-directed mode replaces store cards with guardian-gated informational rows and no reward animation.',
      ],
      unityObjects: [
        'GreyboxEconomyScenarioProfile ScriptableObject with sources, sinks, offer cohorts, non-payer catch-up, and trust guardrails.',
        'GreyboxOfferReviewPanel prefab with decline, inspect, price details, cooldown state, and designer review metadata.',
        'GreyboxTrustGuard MonoBehaviour that blocks fake scarcity, child-directed pressure, and core-power purchase gates.',
        'GreyboxPriceSensitivityTable ScriptableObject with regional price bands, churn-risk notes, and revenue scenario outputs.',
      ],
      playbookSteps: [
        'Build the Solar Foundry Offer Lab scenario with one soft-currency loop, one cosmetic bundle, and one non-payer catch-up grant.',
        'Tune softCurrencyEarnRate and nonPayerCatchupGrant first, then premiumPriceUsd, then offerCooldownHours, then battlePassXpRate.',
        'Run three reviews: payer convenience, non-payer progression, and child-directed compliance mode.',
        'Approve only when every offer can be declined cleanly and no core loop depends on a purchase.',
      ],
      referenceEncounter: {
        id: 'solar-foundry-offer-lab',
        name: 'Solar Foundry Offer Lab',
        beats: [
          'Player earns soft currency through a normal mission before seeing any offer surface.',
          'Cosmetic starter bundle appears after mission summary with equal decline and inspect affordances.',
          'Non-payer route grants catch-up currency after repeated failed upgrades without shame copy.',
          'Child-directed mode removes price prompts and records the gate in the compliance audit trail.',
        ],
      },
      tuningDefaults: {
        softCurrencyEarnRate: 85,
        premiumPriceUsd: 4.99,
        offerCooldownHours: 24,
        battlePassXpRate: 1,
        nonPayerCatchupGrant: 300,
      },
    },
  },
  {
    order: 8,
    id: 'steam-next-fest-planner',
    name: 'Steam Next Fest Planner',
    price: { currency: 'USD', oneTimeUsd: 79 },
    audience: 'Indies preparing launches',
    category: 'launch',
    status: 'alpha-ready',
    positioning: 'Demo scope, capsule beats, trailer capture moments, and wishlisting loops for Next Fest campaigns.',
    primaryLoop: 'discover, download, learn hook, wishlist, and follow',
    engineTarget: 'multi-engine',
    workflow: [
      'Choose a demo promise, tutorial ceiling, capture moments, and wishlist call-to-action.',
      'Generate launch checklist, Steam page beats, trailer shot list, and streamer-friendly risk notes.',
      'Ensure the demo ends with honest momentum instead of content misrepresentation.',
    ],
    telemetrySignals: ['demo-start-rate', 'tutorial-dropoff', 'wishlist-after-session', 'trailer-beat-clickthrough'],
    qaGates: ['The demo teaches the hook in the first three minutes.', 'Wishlist prompts never obscure gameplay.', 'Trailer shots are reproducible in-game.'],
    tuningFields: ['demoMinutes', 'tutorialStepCount', 'captureMomentPriority', 'wishlistPromptDelay', 'bossTeaseIntensity'],
    authored: {
      skillRecipes: [
        'Demo Promise Ladder: state the store-page promise, prove it in minute one, deepen it by minute five, and end before repetition appears.',
        'First-Three-Minute Hook: one playable verb, one readable failure state, one reward beat, and one screenshot-worthy moment before tutorial fatigue.',
        'Streamer Capture Map: generate five reproducible clips with camera-safe UI, no spoiler dependency, and one short-form-friendly payoff.',
        'Wishlist CTA Honesty: prompt only after player agency, never during combat or failure, and pair wishlist copy with what ships next.',
      ],
      artDirection: [
        'Demo end cards use the game key art, a visible wishlist action, and one honest next-build promise without oversized hype copy.',
        'Tutorial overlays use paper strips outside the playfield and retire permanently once the input is demonstrated.',
        'Trailer capture markers reserve spark-orange for camera beats and focus-cyan for streamer-safe objective beats.',
        'Boss tease silhouettes stay readable but incomplete, showing mechanic shape without misrepresenting shipped content.',
      ],
      unityObjects: [
        'GreyboxDemoScopeProfile ScriptableObject with demo promise, minute budget, tutorial ceiling, and end-card copy.',
        'GreyboxWishlistPromptReview prefab with trigger conditions, post-session placement, decline state, and localization notes.',
        'GreyboxTrailerCaptureBoard ScriptableObject with shot ids, camera beats, reproducibility notes, and store-page usage.',
        'GreyboxStreamerMomentMarker MonoBehaviour for clip-safe set pieces, spoiler gates, and HUD-safe capture positions.',
      ],
      playbookSteps: [
        'Build the Clockwork Harbor Demo with a 22-minute target, one tutorial lane, two optional rooms, and one boss tease.',
        'Tune demoMinutes and tutorialStepCount first, then captureMomentPriority, then wishlistPromptDelay, then bossTeaseIntensity.',
        'Run three passes: fresh player hook, streamer capture route, and store-page truth check against screenshots and trailer beats.',
        'Approve only when the demo teaches the hook fast and every wishlist prompt appears after real agency.',
      ],
      referenceEncounter: {
        id: 'clockwork-harbor-demo',
        name: 'Clockwork Harbor Demo',
        beats: [
          'Minute one proves the movement hook with a safe jump, a readable fail state, and one small reward.',
          'Minute five opens an optional side room that demonstrates depth without bloating the tutorial.',
          'Final route reveals the boss silhouette, one mechanic tell, and a hard stop before overpromising content.',
          'End card offers wishlist, follow, and feedback actions after the score summary and save confirmation.',
        ],
      },
      tuningDefaults: {
        demoMinutes: 22,
        tutorialStepCount: 5,
        captureMomentPriority: 8,
        wishlistPromptDelay: 18,
        bossTeaseIntensity: 0.7,
      },
    },
  },
  {
    order: 9,
    id: 'console-submission-checklist',
    name: 'Console Submission Checklist',
    price: { currency: 'USD', oneTimeUsd: 149 },
    audience: 'Indies porting to Switch / PS / Xbox',
    category: 'compliance',
    status: 'alpha-ready',
    positioning: 'Submission readiness, save behavior, controller states, and platform-specific UX risk checks.',
    primaryLoop: 'verify requirement, inspect edge case, fix, and document',
    engineTarget: 'multi-engine',
    workflow: [
      'Translate platform submission risk into controller, save, suspend, network, and accessibility checks.',
      'Generate evidence logs, reproduction notes, and owner assignments without exposing confidential TRC text.',
      'Keep platform-specific language generic until licensed documentation is attached by the studio.',
    ],
    telemetrySignals: ['submission-risk-count', 'controller-disconnect-fail', 'save-resume-fail', 'accessibility-exception-count'],
    qaGates: ['No confidential platform requirement text is embedded in generated output.', 'Controller disconnect and suspend/resume are tested.', 'Save corruption scenarios have recovery notes.'],
    tuningFields: ['autosaveIntervalSeconds', 'controllerReconnectGraceSeconds', 'suspendResumeBudgetMs', 'safeAreaPadding', 'platformRiskSeverity'],
    authored: {
      skillRecipes: [
        'Evidence Packet Builder: produce repro steps, owner, platform family, expected behavior, observed risk, and screenshot slot without copying confidential TRC text.',
        'Suspend Resume Matrix: test active gameplay, menu, loading, network retry, and save write boundaries for each target console.',
        'Controller Recovery Script: disconnect, reconnect, profile switch, and low-battery states must preserve player intent and focus.',
        'Safe Area Sweep: verify HUD, subtitles, prompts, and storefront links against conservative platform-safe margins.',
      ],
      artDirection: [
        'Compliance evidence screens use plain numbered rows, timestamps, and owner chips instead of marketing styling.',
        'Controller disconnect prompts reserve crit-red for destructive risk only; normal reconnect guidance uses paper panels and focus-cyan focus rings.',
        'Safe-area overlays show device bounds, platform family, and screenshot scale without hiding the underlying HUD.',
        'Accessibility exceptions require pause-yellow review badges and never use pass-colored states until evidence is attached.',
      ],
      unityObjects: [
        'GreyboxSubmissionEvidenceLog ScriptableObject with requirement family, owner, repro steps, screenshots, and generic platform notes.',
        'GreyboxSuspendResumeProbe MonoBehaviour with scene state, save boundary, network state, and timing budget fields.',
        'GreyboxControllerRecoveryPanel prefab with disconnect reason, reconnect guidance, focus restore, and profile-switch state.',
        'GreyboxSafeAreaAuditOverlay prefab with margin presets, subtitle bounds, HUD anchors, and screenshot export markers.',
      ],
      playbookSteps: [
        'Build the Platform Cert Lab with one gameplay scene, one menu scene, one loading gate, one save boundary, and one controller panel.',
        'Tune autosaveIntervalSeconds and suspendResumeBudgetMs first, then controllerReconnectGraceSeconds, then safeAreaPadding, then platformRiskSeverity.',
        'Run three passes: suspend during save, controller disconnect during menu navigation, and safe-area screenshot review.',
        'Approve only after evidence logs stay generic and no confidential platform text is embedded in generated artifacts.',
      ],
      referenceEncounter: {
        id: 'platform-cert-lab',
        name: 'Platform Cert Lab',
        beats: [
          'Gameplay scene records a save-safe pause point before suspend and verifies resume state.',
          'Controller panel restores focus after disconnect without accepting accidental destructive input.',
          'Safe-area overlay captures HUD, subtitles, and prompt bounds at conservative margins.',
          'Evidence log exports owner, repro steps, generic risk family, and screenshot references only.',
        ],
      },
      tuningDefaults: {
        autosaveIntervalSeconds: 90,
        controllerReconnectGraceSeconds: 12,
        suspendResumeBudgetMs: 2500,
        safeAreaPadding: '0.08,0.08,0',
        platformRiskSeverity: 2,
      },
    },
  },
  {
    order: 10,
    id: 'unity-full-prefab-export-pro',
    name: 'Unity Full Prefab Export Pro',
    price: { currency: 'USD', oneTimeUsd: 99 },
    audience: 'Unity teams',
    category: 'engine-export',
    status: 'alpha-ready',
    positioning: 'Full prefab export, material assignment, Addressables tags, and round-trip metadata for Unity teams.',
    primaryLoop: 'design, export prefab, inspect scene, tweak, and sync back',
    engineTarget: 'unity',
    workflow: [
      'Map gameview nodes to prefab hierarchy, materials, scripts, Addressables labels, and Greybox source stamps.',
      'Generate import plans that preserve stable ids for round-trip merge.',
      'Validate exported prefabs in the Unity Editor before marking the package release-ready.',
    ],
    telemetrySignals: ['prefab-import-success', 'round-trip-conflict-rate', 'addressables-label-coverage', 'material-assignment-miss'],
    qaGates: ['Every generated object has a Greybox source stamp.', 'Materials resolve for URP/HDRP fallback.', 'Addressables labels do not duplicate stale entries.'],
    tuningFields: ['prefabScale', 'materialVariant', 'addressableGroup', 'spawnPointPosition', 'uiCanvasSortOrder'],
    authored: {
      skillRecipes: [
        'Stable Prefab Tree: every node receives source id, local transform, display name, material binding, and round-trip stamp before export.',
        'Material Fallback Pass: generate URP, HDRP, and built-in fallback notes from the active art bible without hardcoding project shaders.',
        'Addressables Hygiene Rule: one deterministic group per Greybox export, no duplicate stale labels, and one rollback manifest per import.',
        'Scene Placement Review: spawn points, cameras, canvases, and authored empties require designer acceptance before sync-back.',
      ],
      artDirection: [
        'Prefab review panels show hierarchy depth, material confidence, and missing-script warnings in compact inspector rows.',
        'Generated material swatches display albedo, emission, surface type, and art-bible source token side by side.',
        'Addressables labels use graphite chips with spark-orange conflict badges only when stale imports are detected.',
        'Spawn point markers use focus-cyan axes and fixed-size handles so they stay readable in dense scenes.',
      ],
      unityObjects: [
        'GreyboxPrefabExportProfile ScriptableObject with stable ids, source stamps, transform policy, and rollback manifest id.',
        'GreyboxMaterialVariantTable ScriptableObject with URP, HDRP, built-in fallback, and art-bible token references.',
        'GreyboxAddressablesExportPlan ScriptableObject with group name, labels, stale-label cleanup, and rollback notes.',
        'GreyboxPrefabReviewWindow data asset with conflict list, accepted diffs, rejected diffs, and sync-back eligibility.',
      ],
      playbookSteps: [
        'Build the Harbor Prefab Export sample with terrain blockout, spawn point, HUD canvas, material variants, and two Addressables groups.',
        'Tune prefabScale and spawnPointPosition first, then materialVariant, then addressableGroup, then uiCanvasSortOrder.',
        'Run three import passes: clean project, stale label project, and round-trip moved spawn point.',
        'Approve only when every exported GameObject has a source stamp and material fallback evidence.',
      ],
      referenceEncounter: {
        id: 'harbor-prefab-export',
        name: 'Harbor Prefab Export',
        beats: [
          'Root prefab creates terrain, props, spawn point, and UI canvas with stable Greybox ids.',
          'Material table resolves one URP material, one HDRP fallback, and one built-in fallback.',
          'Addressables plan labels gameplay, UI, and material assets without duplicate stale labels.',
          'Round-trip review moves the spawn point and keeps the source stamp intact.',
        ],
      },
      tuningDefaults: {
        prefabScale: 1,
        materialVariant: 'URP_Default',
        addressableGroup: 'GreyboxGenerated',
        spawnPointPosition: '0,1,0',
        uiCanvasSortOrder: 10,
      },
    },
  },
  {
    order: 11,
    id: 'unreal-blueprint-export-pro',
    name: 'Unreal Blueprint Export Pro',
    price: { currency: 'USD', oneTimeUsd: 99 },
    audience: 'Unreal teams',
    category: 'engine-export',
    status: 'alpha-ready',
    positioning: 'Blueprint graph export, widget mapping, data assets, and content browser organization for Unreal teams.',
    primaryLoop: 'design, export blueprint, test PIE, tweak, and sync back',
    engineTarget: 'unreal',
    workflow: [
      'Map design artifacts to Blueprint classes, widgets, data assets, and content folders.',
      'Generate graph notes with pins, variables, and designer-editable defaults.',
      'Validate in Play-In-Editor before accepting round-trip diffs.',
    ],
    telemetrySignals: ['blueprint-compile-fail', 'pie-smoke-pass', 'widget-binding-miss', 'data-asset-drift'],
    qaGates: ['Blueprint variable names are stable and designer-readable.', 'UMG widget bindings survive refresh.', 'Content paths follow studio folder hygiene.'],
    tuningFields: ['blueprintClassName', 'exposedVariableDefault', 'widgetAnchor', 'dataAssetRowName', 'collisionPreset'],
    authored: {
      skillRecipes: [
        'Blueprint Contract Card: define parent class, exposed variables, default values, component graph, and compile gate before export.',
        'UMG Binding Map: every widget binding declares source field, fallback text, anchor, and designer-editable flag.',
        'Data Asset Drift Check: compare Greybox source row, Unreal data asset row, and last synced hash before accepting edits.',
        'PIE Smoke Script: run Play-In-Editor with spawn, interact, widget update, and teardown checks before release.',
      ],
      artDirection: [
        'Blueprint review notes use compact graph cards with pin names, variable defaults, and compile status visible at a glance.',
        'UMG anchor previews use focus-cyan bounds and paper labels so widget drift is obvious without opening the full graph.',
        'Content browser paths reserve spark-orange warning chips for misplaced assets outside the approved Greybox folder.',
        'Data-table row diffs use green accepted, yellow review, and red blocking states with no decorative gradients.',
      ],
      unityObjects: [
        'GreyboxBlueprintExportProfile data asset with parent class, exposed variables, component graph, and compile gate.',
        'GreyboxUMGBindingMap data asset with widget anchors, source fields, fallback copy, and designer-editable flags.',
        'GreyboxDataAssetDriftReport with row name, source hash, asset hash, and last synced timestamp.',
        'GreyboxPIESmokePlan with spawn map, interaction target, widget assertion, and teardown command.',
      ],
      playbookSteps: [
        'Build the Boss Door Blueprint sample with one Actor class, one UMG prompt, one data asset row, and one collision preset.',
        'Tune blueprintClassName and exposedVariableDefault first, then widgetAnchor, then dataAssetRowName, then collisionPreset.',
        'Run three passes: Blueprint compile, UMG binding refresh, and PIE interaction smoke.',
        'Approve only when content paths are stable and designer-editable defaults survive refresh.',
      ],
      referenceEncounter: {
        id: 'boss-door-blueprint',
        name: 'Boss Door Blueprint',
        beats: [
          'Actor Blueprint exposes required key count, door state, prompt text, and collision preset.',
          'UMG prompt updates after key pickup and stays anchored at the interaction target.',
          'Data asset row stores lock tuning and survives a Greybox source refresh.',
          'PIE smoke opens the door, updates the prompt, and tears down without compile warnings.',
        ],
      },
      tuningDefaults: {
        blueprintClassName: 'BP_GreyboxBossDoor',
        exposedVariableDefault: 'Requires 3 keys',
        widgetAnchor: '0.5,0.82,0',
        dataAssetRowName: 'BossDoor_Default',
        collisionPreset: 'GreyboxInteractable',
      },
    },
  },
  {
    order: 12,
    id: 'godot-scene-tree-export-pro',
    name: 'Godot Scene Tree Export Pro',
    price: { currency: 'USD', oneTimeUsd: 79 },
    audience: 'Godot teams',
    category: 'engine-export',
    status: 'alpha-ready',
    positioning: 'Scene tree export, resource assignment, signal notes, and Godot-native folder hygiene.',
    primaryLoop: 'design, export scene, run, tweak, and sync back',
    engineTarget: 'godot',
    workflow: [
      'Map artifacts to Godot scene nodes, resources, signals, scripts, and export folders.',
      'Generate scene-tree diffs with stable node paths and designer-facing inspector notes.',
      'Validate run-scene behavior before accepting sync-back edits.',
    ],
    telemetrySignals: ['scene-run-pass', 'signal-binding-miss', 'resource-path-drift', 'node-path-conflict'],
    qaGates: ['Node names stay stable across export refresh.', 'Signals are documented before script binding.', 'Resource paths avoid engine-import churn.'],
    tuningFields: ['nodePath', 'signalName', 'resourceUid', 'collisionLayer', 'exportPreset'],
    authored: {
      skillRecipes: [
        'Scene Tree Contract: every exported node declares path, owner, resource uid, signal surface, and refresh policy.',
        'Signal Binding Ledger: document signal name, emitter path, receiver path, argument shape, and designer-facing intent.',
        'Resource Path Hygiene: generated resources use stable uid notes and avoid churn-prone import folders.',
        'Run Scene Smoke: open scene, emit one signal, resolve one resource, and verify collision layer before accepting export.',
      ],
      artDirection: [
        'Scene-tree previews use indentation, node icons, and stable path chips instead of large decorative cards.',
        'Signal notes use focus-cyan connector lines and compact argument labels that fit in the inspector panel.',
        'Resource previews show uid, path, type, and drift state in a single row for quick Godot review.',
        'Collision layer warnings use crit-red only when runtime behavior changes, not for naming cleanup.',
      ],
      unityObjects: [
        'GreyboxGodotSceneProfile resource with root node, node paths, ownership, resource uid notes, and export preset.',
        'GreyboxSignalBindingLedger resource with emitter path, receiver path, signal name, arguments, and review state.',
        'GreyboxResourcePathAudit resource with uid, source path, imported path, drift state, and cleanup guidance.',
        'GreyboxRunSceneSmokePlan resource with scene path, signal assertion, collision assertion, and resource assertion.',
      ],
      playbookSteps: [
        'Build the Signal Garden Scene with one root, three child nodes, one signal, one resource, and one collision layer check.',
        'Tune nodePath and signalName first, then resourceUid, then collisionLayer, then exportPreset.',
        'Run three passes: scene refresh, signal emission, and resource-path drift check.',
        'Approve only when node paths stay stable and run-scene smoke passes without signal loss.',
      ],
      referenceEncounter: {
        id: 'signal-garden-scene',
        name: 'Signal Garden Scene',
        beats: [
          'Root scene creates PlayerStart, Pickup, Door, and HUDPrompt nodes with stable exported paths.',
          'Pickup emits collected signal with one argument and HUDPrompt receives it without script regeneration.',
          'Resource uid remains stable after export refresh and avoids import-folder churn.',
          'Run-scene smoke verifies the collision layer and signal path before accepting the export.',
        ],
      },
      tuningDefaults: {
        nodePath: 'World/Pickup',
        signalName: 'collected',
        resourceUid: 'uid://greybox-signal-garden',
        collisionLayer: 2,
        exportPreset: 'godot-4-scene',
      },
    },
  },
];

export const proModuleCatalog: readonly ProModuleDefinition[] = moduleSpecs.map(createModule);

export function getProModule(id: string): ProModuleDefinition | undefined {
  return proModuleCatalog.find((module) => module.manifest.id === id);
}

export function launchReadyModules(): readonly ProModuleDefinition[] {
  return proModuleCatalog.filter((module) => module.status === 'alpha-ready');
}

export function publicCatalog(catalog: readonly ProModuleDefinition[] = proModuleCatalog): readonly ProModulePublicListing[] {
  return catalog.map((module) => ({
    id: module.manifest.id,
    name: module.manifest.name,
    version: module.manifest.version,
    category: module.category,
    price: module.price,
    audience: module.audience,
    status: module.status,
    mountCount: Object.values(module.manifest.mounts).reduce((count, mounts) => count + (mounts?.length ?? 0), 0),
  }));
}

export function assertCatalogHealthy(catalog: readonly ProModuleDefinition[] = proModuleCatalog): void {
  const ids = new Set<string>();
  for (const module of catalog) {
    assertSafeModuleManifest(module);
    if (ids.has(module.manifest.id)) throw new Error(`duplicate module id: ${module.manifest.id}`);
    ids.add(module.manifest.id);
    const filePaths = new Set<string>();
    for (const moduleFile of module.files) {
      if (!isSafeEntry(moduleFile.path)) throw new Error(`unsafe file path ${moduleFile.path} for ${module.manifest.id}`);
      if (filePaths.has(moduleFile.path)) throw new Error(`duplicate file path ${moduleFile.path} for ${module.manifest.id}`);
      filePaths.add(moduleFile.path);
      if (!SHA256_RE.test(moduleFile.digestSha256)) {
        throw new Error(`invalid file digest for ${module.manifest.id}:${moduleFile.path}`);
      }
      if (moduleFile.digestSha256 !== sha256(moduleFile.body)) {
        throw new Error(`file body digest mismatch for ${module.manifest.id}:${moduleFile.path}`);
      }
    }
    for (const mounts of Object.values(module.manifest.mounts)) {
      for (const mount of mounts ?? []) {
        if (!SAFE_ID_RE.test(mount.id)) throw new Error(`unsafe mount id ${mount.id} for ${module.manifest.id}`);
        if (!mount.entry || !isSafeEntry(mount.entry)) {
          throw new Error(`unsafe mount entry ${mount.entry ?? '<empty>'} for ${module.manifest.id}`);
        }
        if (!mount.digestSha256 || !SHA256_RE.test(mount.digestSha256)) {
          throw new Error(`invalid mount digest for ${module.manifest.id}:${mount.entry}`);
        }
        const mountedFile = module.files.find((candidate) => candidate.path === mount.entry);
        if (!mountedFile) throw new Error(`missing file ${mount.entry} for ${module.manifest.id}`);
        if (mount.digestSha256 !== mountedFile.digestSha256) {
          throw new Error(`digest mismatch for ${module.manifest.id}:${mount.entry}`);
        }
      }
    }
  }
}

function assertSafeModuleManifest(module: ProModuleDefinition): void {
  if (!SAFE_ID_RE.test(module.manifest.id)) throw new Error(`unsafe module id ${module.manifest.id}`);
  if (!module.manifest.name.trim()) throw new Error(`module ${module.manifest.id} is missing a display name`);
  if (!SEMVERISH_RE.test(module.manifest.version)) {
    throw new Error(`unsafe module version ${module.manifest.version} for ${module.manifest.id}`);
  }
  if (module.manifest.minAgdsVersion && !SEMVERISH_RE.test(module.manifest.minAgdsVersion)) {
    throw new Error(`unsafe minAgdsVersion ${module.manifest.minAgdsVersion} for ${module.manifest.id}`);
  }
}

function isSafeEntry(value: string): boolean {
  if (!SAFE_ENTRY_RE.test(value)) return false;
  if (value.startsWith('/') || value.includes('\\')) return false;
  return !value.split('/').some((part) => part === '..' || part === '.' || part === '');
}
