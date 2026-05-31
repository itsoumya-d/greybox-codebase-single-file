import { z } from 'zod';
import { GAME_ENTITY_TYPES } from './api/projects.js';

export type GameStudioAgentId =
  | 'game-director'
  | 'gameplay-mechanics'
  | 'level-design'
  | 'narrative-design'
  | 'economy-progression'
  | 'multiplayer-systems'
  | 'game-ui-hud'
  | 'art-direction'
  | 'audio-direction'
  | 'live-ops'
  | 'technical-game-systems'
  | 'accessibility-design'
  | 'production-planning';

export interface GameStudioAgentRole {
  id: GameStudioAgentId;
  title: string;
  responsibilities: string[];
}

export interface GameStudioCollaborationHandoff {
  id: string;
  from: GameStudioAgentId;
  to: GameStudioAgentId;
  coordinates: string[];
  resolves: string;
}

export const GAME_STUDIO_AGENTS: readonly GameStudioAgentRole[] = [
  {
    id: 'game-director',
    title: 'Game Director',
    responsibilities: ['vision', 'pillars', 'emotional target', 'genre promise', 'scope control', 'production coherence'],
  },
  {
    id: 'gameplay-mechanics',
    title: 'Gameplay Mechanics Designer',
    responsibilities: ['core verbs', 'combat', 'movement', 'game feel', 'risk/reward', 'difficulty curves'],
  },
  {
    id: 'level-design',
    title: 'Level Designer',
    responsibilities: ['spatial flow', 'encounters', 'spawn logic', 'traversal', 'sightlines', 'environmental storytelling'],
  },
  {
    id: 'narrative-design',
    title: 'Narrative Designer',
    responsibilities: ['lore', 'factions', 'quests', 'dialogue', 'branching choices', 'cinematic pacing'],
  },
  {
    id: 'economy-progression',
    title: 'Economy & Progression Designer',
    responsibilities: ['XP', 'currencies', 'loot', 'crafting', 'rarity', 'ethical monetization', 'reward cadence'],
  },
  {
    id: 'multiplayer-systems',
    title: 'Multiplayer Systems Designer',
    responsibilities: ['matchmaking', 'co-op/PvP', 'ranked health', 'latency-aware mechanics', 'social systems', 'spectator clarity'],
  },
  {
    id: 'game-ui-hud',
    title: 'Game UI/HUD Designer',
    responsibilities: ['HUD zones', 'inventory', 'minimap', 'cooldowns', 'controller/touch flow', 'combat readability'],
  },
  {
    id: 'art-direction',
    title: 'Art Director',
    responsibilities: ['visual identity', 'silhouette', 'lighting', 'VFX language', 'materials', 'color scripting'],
  },
  {
    id: 'audio-direction',
    title: 'Audio Director',
    responsibilities: ['adaptive music', 'combat SFX', 'soundscape', 'UI sounds', 'voice direction', 'emotional pacing'],
  },
  {
    id: 'live-ops',
    title: 'Live Ops Strategist',
    responsibilities: ['events', 'seasons', 'retention', 'analytics concepts', 'content rotation', 'community health'],
  },
  {
    id: 'technical-game-systems',
    title: 'Technical Game Systems Designer',
    responsibilities: ['engine fit', 'rendering budgets', 'memory/GPU constraints', 'networking', 'save systems', 'procedural systems'],
  },
  {
    id: 'accessibility-design',
    title: 'Accessibility Designer',
    responsibilities: ['readable HUD scaling', 'colorblind-safe feedback', 'subtitles/captions', 'remappable input', 'assist modes', 'cognitive load'],
  },
  {
    id: 'production-planning',
    title: 'Game Producer',
    responsibilities: ['milestones', 'team scale', 'asset budget', 'QA scope', 'vertical slice planning', 'dependency risk'],
  },
];

export const GAME_STUDIO_COLLABORATION_HANDOFFS: readonly GameStudioCollaborationHandoff[] = [
  {
    id: 'gameplay-to-hud-readability',
    from: 'gameplay-mechanics',
    to: 'game-ui-hud',
    coordinates: ['combat feedback', 'resource visibility', 'input timing', 'target clarity', 'accessibility states'],
    resolves: 'Make mechanics readable at gameplay speed before polishing the interface.',
  },
  {
    id: 'narrative-to-level-storytelling',
    from: 'narrative-design',
    to: 'level-design',
    coordinates: ['quest pacing', 'environmental reveals', 'faction territory', 'cinematic blocking', 'exploration rewards'],
    resolves: 'Turn story beats into playable spaces instead of detached lore pages.',
  },
  {
    id: 'economy-to-gameplay-progression',
    from: 'economy-progression',
    to: 'gameplay-mechanics',
    coordinates: ['reward cadence', 'build diversity', 'difficulty curve', 'loot pressure', 'anti-grind pacing'],
    resolves: 'Keep progression rewards tied to mastery, risk, and meaningful player choices.',
  },
  {
    id: 'technical-to-art-performance',
    from: 'technical-game-systems',
    to: 'art-direction',
    coordinates: ['rendering budgets', 'texture density', 'VFX cost', 'lighting mode', 'platform constraints'],
    resolves: 'Preserve art direction inside believable engine and device budgets.',
  },
  {
    id: 'multiplayer-to-level-fairness',
    from: 'multiplayer-systems',
    to: 'level-design',
    coordinates: ['spawn fairness', 'sightlines', 'role lanes', 'spectator clarity', 'anti-cheese routes'],
    resolves: 'Make competitive/co-op spaces readable, fair, and resistant to dominant exploits.',
  },
  {
    id: 'liveops-to-economy-retention',
    from: 'live-ops',
    to: 'economy-progression',
    coordinates: ['seasonal rewards', 'currency sinks', 'catch-up paths', 'burnout prevention', 'ethical monetization'],
    resolves: 'Design long-term engagement without pay-to-win pressure or manipulative retention traps.',
  },
  {
    id: 'audio-to-gameplay-feedback',
    from: 'audio-direction',
    to: 'gameplay-mechanics',
    coordinates: ['hit confirmation', 'danger tells', 'adaptive intensity', 'UI cues', 'accessibility alternatives'],
    resolves: 'Use sound as gameplay feedback, not only atmosphere.',
  },
  {
    id: 'director-to-production-scope',
    from: 'game-director',
    to: 'technical-game-systems',
    coordinates: ['genre promise', 'pillar protection', 'scope cuts', 'milestones', 'vertical-slice feasibility'],
    resolves: 'Cut or scale ideas that threaten production coherence while preserving the core fantasy.',
  },
  {
    id: 'accessibility-to-hud-inclusive-readability',
    from: 'accessibility-design',
    to: 'game-ui-hud',
    coordinates: ['HUD scaling', 'colorblind feedback', 'input remapping', 'subtitle/caption state', 'motor assists'],
    resolves: 'Make accessibility part of the player experience instead of a late compliance pass.',
  },
  {
    id: 'producer-to-director-scope-lock',
    from: 'production-planning',
    to: 'game-director',
    coordinates: ['milestone scope', 'team size', 'asset load', 'QA burden', 'vertical-slice cuts'],
    resolves: 'Scale concepts into solo, indie, AA, or AAA versions without losing the fantasy.',
  },
] as const;

export interface GameStudioDebateCheckpoint {
  id: string;
  chair: GameStudioAgentId;
  challengers: readonly GameStudioAgentId[];
  question: string;
  decisionRule: string;
  evidence: readonly string[];
}

export const GAME_STUDIO_DEBATE_CHECKPOINTS: readonly GameStudioDebateCheckpoint[] = [
  {
    id: 'mechanic-readability-feasibility',
    chair: 'game-director',
    challengers: ['gameplay-mechanics', 'game-ui-hud', 'accessibility-design', 'technical-game-systems'],
    question: 'Can the player understand and execute the core mechanic at gameplay speed on the target platforms?',
    decisionRule: 'Ship the simplest mechanic/HUD/input variant that preserves mastery, readability, accessibility, and performance.',
    evidence: ['core loop', 'input model', 'HUD state', 'assist modes', 'performance budget'],
  },
  {
    id: 'world-story-level-coherence',
    chair: 'narrative-design',
    challengers: ['level-design', 'art-direction', 'audio-direction', 'game-director'],
    question: 'Do the space, story beat, art language, and audio mood reinforce the same player emotion?',
    decisionRule: 'Revise the level beat or narrative framing when lore, composition, or sound pulls the scene away from the game pillars.',
    evidence: ['quest beat', 'spatial route', 'lighting mood', 'soundscape cue', 'environmental storytelling'],
  },
  {
    id: 'progression-retention-ethics',
    chair: 'economy-progression',
    challengers: ['live-ops', 'gameplay-mechanics', 'multiplayer-systems', 'accessibility-design'],
    question: 'Does progression motivate return play without grind walls, pay-to-win pressure, or exclusionary difficulty?',
    decisionRule: 'Prefer trust-building reward cadence, catch-up paths, and mastery rewards over coercive retention loops.',
    evidence: ['reward cadence', 'currency sinks', 'season plan', 'fairness risk', 'assist path'],
  },
  {
    id: 'production-scale-lock',
    chair: 'production-planning',
    challengers: ['technical-game-systems', 'art-direction', 'live-ops', 'game-director'],
    question: 'Is the concept scaled to the stated team, timeline, engine, content pipeline, and launch plan?',
    decisionRule: 'Name solo, indie, AA, and AAA variants when scope is ambiguous, then select the smallest version that fulfills the fantasy.',
    evidence: ['team size', 'milestone', 'engine constraints', 'asset budget', 'QA risk'],
  },
] as const;

export function renderGameStudioCollaborationHandoffs(): string {
  const roleTitles = new Map(GAME_STUDIO_AGENTS.map((agent) => [agent.id, agent.title]));
  const lines = [
    '## Studio collaboration handoffs',
    'During the silent studio pass, reconcile these discipline pairs before producing the integrated answer. If two roles conflict, the Game Director resolves the tradeoff by protecting the gameplay pillars, player clarity, accessibility, and production feasibility.',
    '',
  ];
  for (const handoff of GAME_STUDIO_COLLABORATION_HANDOFFS) {
    const from = roleTitles.get(handoff.from) ?? handoff.from;
    const to = roleTitles.get(handoff.to) ?? handoff.to;
    lines.push(
      `- **${from} -> ${to}**: coordinate ${handoff.coordinates.join(', ')}. ${handoff.resolves}`,
    );
  }
  lines.push('');
  lines.push('## Studio debate checkpoints');
  lines.push('Run these internal debates before the final answer. Record the winning tradeoff in the artifact when it affects scope, accessibility, monetization, multiplayer fairness, or production feasibility.');
  lines.push('');
  for (const checkpoint of GAME_STUDIO_DEBATE_CHECKPOINTS) {
    const chair = roleTitles.get(checkpoint.chair) ?? checkpoint.chair;
    const challengers = checkpoint.challengers.map((id) => roleTitles.get(id) ?? id).join(', ');
    lines.push(
      `- **${chair} chairs ${checkpoint.id}** with ${challengers}: ${checkpoint.question} Decision rule: ${checkpoint.decisionRule} Evidence: ${checkpoint.evidence.join(', ')}.`,
    );
  }
  return lines.join('\n');
}

export const GAME_SCHEMA_TABLES = [
  'game_world',
  'faction',
  'enemy_type',
  'item_rarity',
  'skill_tree',
  'progression_curve',
  'quest_arc',
  'gameplay_loop',
  'biome',
  'combat_style',
  'character_class',
  'crafting_recipe',
  'loot_table',
  'weapon_system',
  'mission_flow',
  'dungeon_layout',
  'dialogue_branch',
  'boss_phase',
  'economy_system',
  'multiplayer_mode',
] as const;

export type GameSchemaTable = (typeof GAME_SCHEMA_TABLES)[number];

export const GAME_EVALUATION_AXES = [
  'gameplay_depth',
  'game_feel_quality',
  'retention_health',
  'ethical_engagement',
  'monetization_fairness',
  'pacing_quality',
  'frustration_points',
  'onboarding_clarity',
  'accessibility_coverage',
  'progression_smoothness',
  'visual_readability',
  'spatial_readability',
  'narrative_cohesion',
  'narrative_simulation_continuity',
  'quest_mission_structure',
  'encounter_design',
  'dungeon_raid_architecture',
  'open_world_simulation',
  'survival_pressure',
  'stealth_fairness',
  'traversal_vehicle_design',
  'camera_animation_vfx',
  'lighting_atmosphere',
  'audio_direction',
  'asset_pipeline_awareness',
  'telemetry_playtest',
  'genre_benchmarking',
  'adaptive_design_scaling',
  'replayability',
  'multiplayer_health',
  'community_modding_ecosystem',
  'difficulty_director_adaptation',
  'companion_party_systems',
  'competitive_fairness',
  'balance_quality',
  'technical_plausibility',
  'production_feasibility',
  'live_ops_sustainability',
] as const;

export type GameEvaluationAxis = (typeof GAME_EVALUATION_AXES)[number];
export type GameEvaluationFindingSeverity = 'pass' | 'warning' | 'fail';

export interface GameEvaluationFinding {
  axis: GameEvaluationAxis | 'legacy_identity' | 'coverage';
  severity: GameEvaluationFindingSeverity;
  message: string;
  evidence?: string[];
}

export interface GameStudioArtifactEvaluationOptions {
  minimumCoveredAxes?: number;
  requiredAxes?: readonly GameEvaluationAxis[];
}

export interface GameStudioArtifactEvaluation {
  axisCoverage: Record<GameEvaluationAxis, boolean>;
  coveredAxes: GameEvaluationAxis[];
  findings: GameEvaluationFinding[];
  passed: boolean;
  score: number;
  summary: string;
}

export const GAME_EVALUATION_AXIS_PATTERNS: Readonly<Record<GameEvaluationAxis, readonly RegExp[]>> = {
  gameplay_depth: [/\b(core loop|gameplay loop|combat loop|mechanic|core verbs?|skill expression|player verbs?)\b/i],
  game_feel_quality: [/\b(game feel|hitstop|responsiveness|input timing|camera shake|haptics?|impact feedback|control response)\b/i],
  retention_health: [/\b(retention|engagement|session length|daily|weekly|D7|D30|burnout|return motivation)\b/i],
  ethical_engagement: [/\b(ethical|anti-burnout|healthy engagement|dark patterns?|player trust|non[- ]coercive)\b/i],
  monetization_fairness: [/\b(monetization|premium|cosmetic|battle pass|DLC|pay-to-win|purchase fairness|store odds)\b/i],
  pacing_quality: [/\b(pacing|cadence|tension|recovery window|escalation|difficulty curve|pressure window)\b/i],
  frustration_points: [/\b(frustration|confusion|friction|fail[- ]state|readable failure|recovery path|frustration point)\b/i],
  onboarding_clarity: [/\b(onboarding|tutorial|teach|tutorialization|first session|new player|first-time player)\b/i],
  accessibility_coverage: [/\b(accessibility|subtitle|colorblind|remappable|reduced motion|contrast|assist mode|readable HUD)\b/i],
  progression_smoothness: [/\b(progression|XP|unlock cadence|level curve|reward cadence|upgrade path|prestige|skill tree)\b/i],
  visual_readability: [/\b(visual readability|HUD|silhouette|contrast|visual hierarchy|VFX readability|UI readability)\b/i],
  spatial_readability: [/\b(spatial|level layout|sightlines?|cover|chokepoints?|route|spawn logic|verticality|traversal)\b/i],
  narrative_cohesion: [/\b(narrative|story arc|lore|quest|faction|dialogue|character arc|worldbuilding)\b/i],
  narrative_simulation_continuity: [/\b(narrative simulation|reactive dialogue|morality system|morality stance|dynamic faction reactions?|emergent storytelling|procedural narrative fragments?|continuity ledger|branch merge rules?|emotional consequences|knowledge graph)\b/i],
  quest_mission_structure: [/\b(quest chain|mission flow|objective chain|branching quest|escort mission|stealth mission|boss hunt|raid objective|fail[- ]forward|world[- ]state change)\b/i],
  encounter_design: [/\b(encounter design|enemy composition|boss phase|arena mechanics?|ambush|wave composition|pressure window|recovery window|mechanic escalation|raid mechanic)\b/i],
  dungeon_raid_architecture: [/\b(dungeon progression|dungeon layout|raid wing|raid architecture|encounter sequencing|checkpoint logic|raid role coordination|role coordination|reward escalation|wipe recovery|boss ladder|puzzle integration)\b/i],
  open_world_simulation: [/\b(open world|faction territory|region density|dynamic event|world persistence|ecosystem|weather system|biome transition|roaming encounter|exploration reward)\b/i],
  survival_pressure: [/\b(survival|hunger|thirst|shelter|body temperature|infection|durability|inventory pressure|scarcity|extraction pressure)\b/i],
  stealth_fairness: [/\b(stealth|visibility cone|sound propagation|AI alert|patrol route|distraction|camouflage|detection recovery|stealth takedown)\b/i],
  traversal_vehicle_design: [/\b(traversal|parkour|climbing|grappling hook|wall running|mounts?|vehicles?|racing physics|vehicle combat|zero[- ]gravity)\b/i],
  camera_animation_vfx: [/\b(camera|cinematic camera|kill cam|animation state machine|blend space|animation cancel|motion matching|IK|VFX|particle|impact effect)\b/i],
  lighting_atmosphere: [/\b(lighting|atmosphere|mood lighting|color script|stealth shadows|horror visibility|danger signaling|environmental mood|cinematic composition)\b/i],
  audio_direction: [/\b(audio|soundtrack|adaptive music|soundscape|combat SFX|UI sounds?|voice[- ]over|danger cue|audio accessibility)\b/i],
  asset_pipeline_awareness: [/\b(asset pipeline|sprite sheet|tilemap|parallax|retopology|texture baking|shader|LOD|rigging|animation memory)\b/i],
  telemetry_playtest: [/\b(telemetry|playtest|heatmap|drop[- ]off|retention curve|engagement spike|frustration analysis|progression bottleneck|exploit discovery)\b/i],
  genre_benchmarking: [/\b(genre benchmark(?:ing)?|benchmark|genre promise|soulslike|extraction shooter|MOBA|hero shooter|roguelike|metroidvania|gacha|city builder)\b/i],
  adaptive_design_scaling: [/\b(adaptive design scaling|scope scaling|solo, indie, AA, and AAA|solo\/indie\/AA\/AAA|smallest shippable version|scale ladder|cutline matrix|production gates?|core fantasy preserved|preserve the core fantasy)\b/i],
  replayability: [/\b(replayability|replayable|procedural|randomness|seed|run modifier|variety|new game plus)\b/i],
  multiplayer_health: [/\b(multiplayer|co-op|PvP|matchmaking|guild|clan|social hub|lobby|latency)\b/i],
  community_modding_ecosystem: [/\b(community|UGC|user[- ]generated|modding|mod tools?|creator ecosystem|creator rewards?|replay sharing|screenshot mode|guild showcase|moderation|curation)\b/i],
  difficulty_director_adaptation: [/\b(difficulty director|adaptive difficulty|AI director|intensity curve|spawn scaling|resource balancing|player skill analysis|pacing correction|assist systems?|adaptive tutorial|dynamic difficulty)\b/i],
  companion_party_systems: [/\b(companion systems?|companions?|companion AI|party composition|party roles?|party slots?|squad commands?|relationship progression|loyalty|betrayal|approval|rivalry|banter|tactical synergy)\b/i],
  competitive_fairness: [/\b(competitive|ranked|fairness|anti-cheese|esports|spectator|counterplay|map balance)\b/i],
  balance_quality: [/\b(balance|balancing|tuning|damage scaling|economy health|loot odds|difficulty tuning|balance metrics)\b/i],
  technical_plausibility: [/\b(engine|performance|memory|GPU|networking|save system|WebGL|Unity|Unreal|Godot|platform constraints?)\b/i],
  production_feasibility: [/\b(production|scope|team size|timeline|milestone|vertical slice|asset budget|QA|feasibility)\b/i],
  live_ops_sustainability: [/\b(live ops|live[- ]ops|season|seasonal|event cadence|content rotation|patch cycle|community health|roadmap)\b/i],
} as const;

const LEGACY_EVALUATION_PATTERNS = [
  /\bSaaS\b/i,
  /\bCRM\b/i,
  /\bpricing cards?\b/i,
  /\blanding page\b/i,
  /\badmin panels?\b/i,
  /\be-commerce\b/i,
  /\bcustomer journey\b/i,
  /\bwebsite builder\b/i,
  /\bapp designer\b/i,
  /\bdashboard generator\b/i,
  new RegExp(String.raw`\bUI\/${['U', 'X'].join('')}\b`, 'i'),
] as const;

export function evaluateGameStudioArtifactText(
  text: string,
  options: GameStudioArtifactEvaluationOptions = {},
): GameStudioArtifactEvaluation {
  const minimumCoveredAxes = options.minimumCoveredAxes ?? 4;
  const axisCoverage = Object.fromEntries(
    GAME_EVALUATION_AXES.map((axis) => [
      axis,
      GAME_EVALUATION_AXIS_PATTERNS[axis].some((pattern) => pattern.test(text)),
    ]),
  ) as Record<GameEvaluationAxis, boolean>;
  const coveredAxes = GAME_EVALUATION_AXES.filter((axis) => axisCoverage[axis]);
  const findings: GameEvaluationFinding[] = [];
  const legacyEvidence = LEGACY_EVALUATION_PATTERNS
    .filter((pattern) => pattern.test(text))
    .map((pattern) => pattern.source);

  if (legacyEvidence.length > 0) {
    findings.push({
      axis: 'legacy_identity',
      severity: 'fail',
      message: 'Artifact text contains legacy non-game builder language.',
      evidence: legacyEvidence,
    });
  }

  const missingRequiredAxes = (options.requiredAxes ?? []).filter((axis) => !axisCoverage[axis]);
  if (missingRequiredAxes.length > 0) {
    findings.push({
      axis: 'coverage',
      severity: 'warning',
      message: `Missing required game evaluation axes: ${missingRequiredAxes.join(', ')}.`,
      evidence: missingRequiredAxes,
    });
  }

  if (coveredAxes.length < minimumCoveredAxes) {
    findings.push({
      axis: 'coverage',
      severity: 'warning',
      message: `Covers ${coveredAxes.length} game evaluation axes; expected at least ${minimumCoveredAxes}.`,
      evidence: coveredAxes,
    });
  }

  const rawScore = Math.round((coveredAxes.length / GAME_EVALUATION_AXES.length) * 100);
  const score = Math.max(0, rawScore - legacyEvidence.length * 25 - missingRequiredAxes.length * 5);
  const passed = findings.every((finding) => finding.severity !== 'fail') &&
    coveredAxes.length >= minimumCoveredAxes &&
    missingRequiredAxes.length === 0;

  return {
    axisCoverage,
    coveredAxes,
    findings,
    passed,
    score,
    summary: `${coveredAxes.length}/${GAME_EVALUATION_AXES.length} game evaluation axes covered; score ${score}/100.`,
  };
}

const gameIdSchema = z
  .string()
  .min(1)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, 'Use a stable game-studio id.');

const jsonObjectSchema = z.record(z.unknown());
const optionalStringArraySchema = z.array(z.string().min(1)).optional();
const legacyArtBibleMetadataKey = 'design_' + 'system';

export const gameEntityTypeSchema = z.enum(GAME_ENTITY_TYPES);

export const gameMemoryEntitySchema = z.object({
  id: gameIdSchema.optional(),
  type: gameEntityTypeSchema,
  name: z.string().min(1),
  summary: z.string().optional(),
  payload: jsonObjectSchema.optional(),
});

export const gameMemoryEntityLinkSchema = z.object({
  id: gameIdSchema.optional(),
  fromEntityId: gameIdSchema,
  toEntityId: gameIdSchema,
  relationship: z.string().min(1),
  payload: jsonObjectSchema.optional(),
});

const gameSkillMetadataBaseSchema = z.object({
  mode: z.enum(['prototype', 'deck', 'template', 'game-art-bible', 'image', 'video', 'audio']).optional(),
  surface: z.enum(['web', 'image', 'video', 'audio']).optional(),
  platform: z.string().min(1).optional(),
  scenario: z.string().min(1).optional(),
  featured: z.union([z.boolean(), z.number(), z.string()]).optional(),
  upstream: z.string().min(1).optional(),
  default_for: z.union([z.string().min(1), z.array(z.string().min(1))]).optional(),
  fidelity: z.enum(['wireframe', 'high-fidelity']).optional(),
  speaker_notes: z.union([z.boolean(), z.string()]).optional(),
  animations: z.union([z.boolean(), z.string()]).optional(),
  example_prompt: z.string().min(1).optional(),
  preview: z.object({
    type: z.enum(['html', 'markdown', 'image', 'video', 'audio', 'json']).or(z.string().min(1)),
  }).passthrough().optional(),
  craft: z.object({
    requires: z.array(z.string().min(1)),
  }).passthrough().optional(),
  game_art_bible: z.object({
    requires: z.boolean(),
  }).passthrough().optional(),
  game: z.object({
    genre: z.string().min(1).optional(),
    camera: z.string().min(1).optional(),
    input: z.string().min(1).optional(),
    platform: z.string().min(1).optional(),
    rendering: z.enum(['dom', 'canvas2d', 'threejs', 'phaser', 'static-html']).optional(),
  }).passthrough().optional(),
}).passthrough();

const gameSkillMetadataSchema = gameSkillMetadataBaseSchema.transform((value) => {
  const canonical = { ...value };
  delete (canonical as Record<string, unknown>)[legacyArtBibleMetadataKey];
  return canonical;
});

export const gameSkillFrontmatterSchema = z.object({
  name: gameIdSchema,
  description: z.string().min(1),
  triggers: z.array(z.string().min(1)).optional(),
  agds: gameSkillMetadataSchema.optional(),
  od: gameSkillMetadataSchema.optional(),
}).passthrough().superRefine((value, ctx) => {
  if (value.agds == null && value.od == null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['agds'],
      message: 'Add an agds skill metadata block.',
    });
  }
});

export const gameArtBibleMarkdownSchema = z.string().min(1).superRefine((body, ctx) => {
  const checks: Array<[RegExp, string]> = [
    [/#\s+\S+/, 'Add an H1 game art bible title.'],
    [/palette|color|colour|rarity|faction|biome/i, 'Describe palette or semantic game color tokens.'],
    [/HUD|readability|player|gameplay|combat|objective/i, 'Describe player-facing readability or HUD/gameplay rules.'],
    [/camera|lighting|mood|atmosphere|VFX|animation/i, 'Describe camera, lighting, mood, animation, or VFX direction.'],
    [/accessibility|colorblind|subtitle|contrast|input|controller|touch/i, 'Describe accessibility or platform/input constraints.'],
  ];
  for (const [pattern, message] of checks) {
    if (!pattern.test(body)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    }
  }
});

const pointSchema = z.object({ x: z.number(), y: z.number() });
const terrainSculptSampleSchema = pointSchema.extend({
  height: z.number(),
  radius: z.number().optional(),
});

export const gameViewportDocumentSchema = z.object({
  version: z.literal(1),
  kind: z.literal('game-viewport'),
  surface: z.string().min(1),
  title: z.string().min(1),
  objective: z.string().optional(),
  camera: z.string().optional(),
  scale: z.string().optional(),
  layers: z.array(z.object({
    id: gameIdSchema,
    name: z.string().min(1),
    type: z.string().optional(),
    visible: z.boolean().optional(),
    description: z.string().optional(),
  })).optional(),
  entities: z.array(z.object({
    id: gameIdSchema,
    name: z.string().min(1),
    type: z.string().min(1),
    x: z.number(),
    y: z.number(),
    w: z.number().optional(),
    h: z.number().optional(),
    layerId: z.string().optional(),
    faction: z.string().optional(),
    danger: z.number().optional(),
    objective: z.string().optional(),
    spawnRule: z.string().optional(),
    interaction: z.string().optional(),
    reward: z.string().optional(),
    counterplay: z.string().optional(),
    notes: z.string().optional(),
  })).optional(),
  terrainZones: z.array(z.object({
    id: gameIdSchema,
    name: z.string().min(1),
    shape: z.string().optional(),
    type: z.string().optional(),
    x: z.number(),
    y: z.number(),
    w: z.number(),
    h: z.number(),
    points: z.array(pointSchema).min(3).optional(),
    layerId: z.string().optional(),
    traversal: z.string().optional(),
    cover: z.string().optional(),
    mood: z.string().optional(),
    notes: z.string().optional(),
  })).optional(),
  terrainPaintStrokes: z.array(z.object({
    id: gameIdSchema,
    name: z.string().min(1),
    type: z.string().optional(),
    material: z.string().optional(),
    brushSize: z.number().optional(),
    opacity: z.number().optional(),
    layerId: z.string().optional(),
    points: z.array(pointSchema).min(2),
    notes: z.string().optional(),
  })).optional(),
  terrainSculptPatches: z.array(z.object({
    id: gameIdSchema,
    name: z.string().min(1),
    type: z.string().optional(),
    x: z.number(),
    y: z.number(),
    radius: z.number().optional(),
    height: z.number(),
    falloff: z.string().optional(),
    layerId: z.string().optional(),
    samples: z.array(terrainSculptSampleSchema).min(1).optional(),
    meshIntent: z.string().optional(),
    traversalImpact: z.string().optional(),
    notes: z.string().optional(),
  })).optional(),
  paths: z.array(z.object({
    id: gameIdSchema,
    name: z.string().min(1),
    type: z.string().optional(),
    points: z.array(pointSchema).min(1),
    notes: z.string().optional(),
  })).optional(),
  beats: z.array(z.object({
    id: gameIdSchema,
    name: z.string().min(1),
    timing: z.string().optional(),
    objective: z.string().optional(),
    tension: z.string().optional(),
    notes: z.string().optional(),
  })).optional(),
  dynamicEvents: z.array(z.object({
    id: gameIdSchema,
    name: z.string().min(1),
    trigger: z.string().optional(),
    impact: z.string().optional(),
  })).optional(),
  spatialReads: z.array(z.object({
    id: gameIdSchema,
    name: z.string().min(1),
    sightline: z.string().optional(),
    cover: z.string().optional(),
    chokepoint: z.string().optional(),
    stealthRoute: z.string().optional(),
    traversalRhythm: z.string().optional(),
    tensionSpacing: z.string().optional(),
  })).optional(),
  worldSimulation: z.object({
    ecosystem: z.string().optional(),
    npcSchedules: optionalStringArraySchema,
    factionTerritory: optionalStringArraySchema,
    weather: z.string().optional(),
    persistence: z.string().optional(),
    destruction: z.string().optional(),
    reactiveRules: optionalStringArraySchema,
  }).optional(),
  cameraPlan: z.array(z.object({
    id: gameIdSchema,
    mode: z.string().min(1),
    framing: z.string().min(1),
    x: z.number().optional(),
    y: z.number().optional(),
    targetX: z.number().optional(),
    targetY: z.number().optional(),
    comfort: z.string().optional(),
    readability: z.string().optional(),
  })).optional(),
  accessibilityNotes: optionalStringArraySchema,
}).passthrough();

const graphPortSchema = z.object({
  id: gameIdSchema,
  label: z.string().min(1),
  dataType: z.string().optional(),
});

export const gameNodeGraphDocumentSchema = z.object({
  version: z.literal(1),
  kind: z.literal('node-graph'),
  graphType: z.string().min(1),
  title: z.string().min(1),
  owner: z.string().optional(),
  nodes: z.array(z.object({
    id: gameIdSchema,
    title: z.string().min(1),
    category: z.string().min(1),
    x: z.number(),
    y: z.number(),
    description: z.string().optional(),
    inputs: z.array(graphPortSchema).optional(),
    outputs: z.array(graphPortSchema).optional(),
    tuning: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
  })),
  edges: z.array(z.object({
    id: gameIdSchema,
    from: gameIdSchema,
    to: gameIdSchema,
    label: z.string().optional(),
    condition: z.string().optional(),
  })),
  variables: z.array(z.object({
    id: gameIdSchema,
    name: z.string().min(1),
    value: z.union([z.string(), z.number(), z.boolean()]),
    notes: z.string().optional(),
  })).optional(),
  collaborationNotes: z.array(z.object({
    agent: z.string().min(1),
    concern: z.string().min(1),
    decision: z.string().optional(),
  })).optional(),
  critiqueNotes: optionalStringArraySchema,
}).passthrough();

export const behaviorTreeDocumentSchema = z.object({
  version: z.literal(1),
  kind: z.literal('behavior-tree'),
  title: z.string().min(1),
  owner: z.string().min(1),
  behaviorType: z.string().optional(),
  rootId: gameIdSchema,
  nodes: z.array(z.object({
    id: gameIdSchema,
    parentId: gameIdSchema.optional(),
    name: z.string().min(1),
    type: z.string().min(1),
    priority: z.number().optional(),
    condition: z.string().optional(),
    action: z.string().optional(),
    counterplay: z.string().optional(),
    readability: z.string().optional(),
    notes: z.string().optional(),
  })).min(1),
  transitions: z.array(z.object({
    id: gameIdSchema,
    from: gameIdSchema,
    to: gameIdSchema,
    trigger: z.string().min(1),
    cooldown: z.string().optional(),
  })).optional(),
  readableTells: optionalStringArraySchema,
  counterplayRules: optionalStringArraySchema,
  dynamicDifficultyRules: optionalStringArraySchema,
  difficultyNotes: optionalStringArraySchema,
  accessibilityNotes: optionalStringArraySchema,
}).passthrough();

export const GAME_DESIGN_VISUAL_TOKEN_FAMILIES = [
  'rarity_colors',
  'faction_palettes',
  'biome_palettes',
  'danger_level_colors',
  'combat_feedback_colors',
  'healing_feedback_colors',
  'status_effect_colors',
  'cinematic_lighting_presets',
  'atmospheric_density_profiles',
] as const;

export const GAME_DESIGN_MOTION_TOKEN_FAMILIES = [
  'hitstop_profiles',
  'dodge_timings',
  'recoil_profiles',
  'camera_shake_patterns',
  'ui_transition_styles',
  'combat_feedback_timings',
  'boss_intro_sequences',
  'loot_drop_animation_profiles',
] as const;

export const GAME_DESIGN_AUDIO_TOKEN_FAMILIES = [
  'combat_intensity_layers',
  'ambient_zone_profiles',
  'rarity_audio_cues',
  'emotional_music_states',
  'danger_alert_profiles',
] as const;

export const GAME_DESIGN_TOKEN_FAMILIES = [
  ...GAME_DESIGN_VISUAL_TOKEN_FAMILIES,
  ...GAME_DESIGN_MOTION_TOKEN_FAMILIES,
  ...GAME_DESIGN_AUDIO_TOKEN_FAMILIES,
] as const;

const visualTokenMapSchema = z.record(z.string());
const timingTokenMapSchema = z.record(z.union([z.string(), z.number()]));
const audioTokenMapSchema = z.record(z.string());

export const gameDesignTokensSchema = z.object({
  rarity_colors: visualTokenMapSchema.optional(),
  faction_palettes: visualTokenMapSchema.optional(),
  biome_palettes: visualTokenMapSchema.optional(),
  danger_level_colors: visualTokenMapSchema.optional(),
  combat_feedback_colors: visualTokenMapSchema.optional(),
  healing_feedback_colors: visualTokenMapSchema.optional(),
  status_effect_colors: visualTokenMapSchema.optional(),
  cinematic_lighting_presets: visualTokenMapSchema.optional(),
  atmospheric_density_profiles: visualTokenMapSchema.optional(),
  hitstop_profiles: timingTokenMapSchema.optional(),
  dodge_timings: timingTokenMapSchema.optional(),
  recoil_profiles: timingTokenMapSchema.optional(),
  camera_shake_patterns: timingTokenMapSchema.optional(),
  ui_transition_styles: timingTokenMapSchema.optional(),
  combat_feedback_timings: timingTokenMapSchema.optional(),
  boss_intro_sequences: timingTokenMapSchema.optional(),
  loot_drop_animation_profiles: timingTokenMapSchema.optional(),
  combat_intensity_layers: audioTokenMapSchema.optional(),
  ambient_zone_profiles: audioTokenMapSchema.optional(),
  rarity_audio_cues: audioTokenMapSchema.optional(),
  emotional_music_states: audioTokenMapSchema.optional(),
  danger_alert_profiles: audioTokenMapSchema.optional(),
  // Compatibility with early game-system specs; prefer the snake_case families above.
  rarityColors: visualTokenMapSchema.optional(),
  factionPalettes: visualTokenMapSchema.optional(),
  biomePalettes: visualTokenMapSchema.optional(),
  statusEffectColors: visualTokenMapSchema.optional(),
  motionProfiles: timingTokenMapSchema.optional(),
  audioCues: audioTokenMapSchema.optional(),
}).passthrough();

export const gameSystemSpecDocumentSchema = z.object({
  version: z.literal(1),
  kind: z.literal('game-system'),
  systemType: z.string().min(1),
  title: z.string().min(1),
  pillars: optionalStringArraySchema,
  metrics: z.array(z.object({
    id: gameIdSchema,
    label: z.string().min(1),
    target: z.union([z.string(), z.number()]),
    current: z.union([z.string(), z.number()]).optional(),
    risk: z.enum(['low', 'medium', 'high']).optional(),
  })).optional(),
  loops: z.array(z.object({
    id: gameIdSchema,
    name: z.string().min(1),
    cadence: z.string().optional(),
    steps: z.array(z.string().min(1)).min(1),
    reward: z.string().optional(),
  })).optional(),
  tuning: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
  designTokens: gameDesignTokensSchema.optional(),
  risks: z.array(z.object({
    id: gameIdSchema,
    label: z.string().min(1),
    severity: z.enum(['low', 'medium', 'high']),
    mitigation: z.string().min(1),
  })).optional(),
  benchmarks: z.array(z.object({
    id: gameIdSchema,
    game: z.string().min(1),
    lesson: z.string().min(1),
    caution: z.string().optional(),
  })).optional(),
  feasibility: z.object({
    teamSize: z.string().optional(),
    timeline: z.string().optional(),
    complexity: z.string().optional(),
    constraints: optionalStringArraySchema,
  }).optional(),
  production: z.object({
    milestone: z.string().optional(),
    assetBudget: z.string().optional(),
    qaFocus: optionalStringArraySchema,
    engineNotes: optionalStringArraySchema,
    scalingVariants: z.array(z.object({
      scale: z.string().min(1),
      tradeoff: z.string().min(1),
    })).optional(),
  }).optional(),
  telemetry: z.array(z.object({
    id: gameIdSchema,
    signal: z.string().min(1),
    designQuestion: z.string().min(1),
    action: z.string().optional(),
  })).optional(),
  iterationGoals: optionalStringArraySchema,
  ethics: optionalStringArraySchema,
  platformAdaptation: z.array(z.object({
    platform: z.string().min(1),
    input: z.string().optional(),
    performance: z.string().optional(),
    readability: z.string().optional(),
  })).optional(),
  accessibility: optionalStringArraySchema,
  playtestQuestions: optionalStringArraySchema,
}).passthrough();

export const gameStudioDocumentSchema = z.discriminatedUnion('kind', [
  gameViewportDocumentSchema,
  gameNodeGraphDocumentSchema,
  behaviorTreeDocumentSchema,
  gameSystemSpecDocumentSchema,
]);

export const GAME_STUDIO_DOCUMENT_SCHEMAS = {
  'game-viewport': gameViewportDocumentSchema,
  'node-graph': gameNodeGraphDocumentSchema,
  'behavior-tree': behaviorTreeDocumentSchema,
  'game-system': gameSystemSpecDocumentSchema,
} as const;

export type GameSkillFrontmatterContract = z.infer<typeof gameSkillFrontmatterSchema>;
export type GameMemoryEntityInputContract = z.infer<typeof gameMemoryEntitySchema>;
export type GameMemoryEntityLinkInputContract = z.infer<typeof gameMemoryEntityLinkSchema>;
