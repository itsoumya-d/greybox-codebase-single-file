import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  behaviorTreeDocumentSchema,
  evaluateGameStudioArtifactText,
  gameArtBibleMarkdownSchema,
  gameDesignTokensSchema,
  gameMemoryEntitySchema,
  gameNodeGraphDocumentSchema,
  gameSkillFrontmatterSchema,
  GAME_DESIGN_AUDIO_TOKEN_FAMILIES,
  GAME_DESIGN_MOTION_TOKEN_FAMILIES,
  GAME_DESIGN_TOKEN_FAMILIES,
  GAME_DESIGN_VISUAL_TOKEN_FAMILIES,
  GAME_EVALUATION_AXES,
  GAME_STUDIO_AGENTS,
  GAME_STUDIO_COLLABORATION_HANDOFFS,
  GAME_STUDIO_DEBATE_CHECKPOINTS,
  gameStudioDocumentSchema,
  gameSystemSpecDocumentSchema,
  gameViewportDocumentSchema,
  renderGameStudioCollaborationHandoffs,
} from '../src/game-studio';
import {
  GAME_DESIGN_METADATA_ENTITY_TYPE_MAP,
  GAME_ENTITY_TYPES,
} from '../src/api/projects';
import { composeSystemPrompt } from '../src/prompts/system';

const packageRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(packageRoot, '../../..');

function readJson(name: string): unknown {
  return JSON.parse(readFileSync(join(repoRoot, 'templates', name), 'utf8'));
}

function collectDesignMarkdownFiles(root: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(root).sort()) {
    const file = join(root, name);
    const stats = statSync(file);
    if (stats.isDirectory()) {
      out.push(...collectDesignMarkdownFiles(file));
      continue;
    }
    if (stats.isFile() && name === 'DESIGN.md') {
      out.push(file);
    }
  }
  return out;
}

const gameTemplateLanguagePattern =
  /\b(game|player|gameplay|HUD|quest|combat|level|boss|RPG|survival|shooter|inventory|crafting|skill tree|world|mission|encounter|economy|live ops|narrative|dialogue|stamina|health|mana|ammo|minimap|racing|visual novel|city builder|roguelike|tactical)\b/i;

const legacyTemplateLanguagePattern =
  /\b(SaaS|pricing cards?|admin panels?|e-commerce|customer journey|landing page|website builder|app designer|dashboard generator|CRM)\b/i;

const requiredGameStudioAgentIds = [
  'game-director',
  'gameplay-mechanics',
  'level-design',
  'narrative-design',
  'economy-progression',
  'multiplayer-systems',
  'game-ui-hud',
  'art-direction',
  'audio-direction',
  'live-ops',
  'technical-game-systems',
  'accessibility-design',
  'production-planning',
] as const;

const requiredStudioHandoffIds = [
  'gameplay-to-hud-readability',
  'narrative-to-level-storytelling',
  'economy-to-gameplay-progression',
  'technical-to-art-performance',
] as const;

describe('game studio shared schemas', () => {
  it('validates normalized game memory entities and rejects legacy product entities', () => {
    expect(gameMemoryEntitySchema.parse({
      id: 'faction_ember_court',
      type: 'faction',
      name: 'Ember Court',
      summary: 'Solar nobles with volcanic territory.',
      payload: { ideology: 'honor-bound expansion' },
    })).toMatchObject({ type: 'faction', name: 'Ember Court' });

    expect(gameMemoryEntitySchema.parse({
      id: 'survival_pressure',
      type: 'survival_system',
      name: 'Storm Hunger Pressure',
      summary: 'Hunger, shelter, storm exposure, and extraction scarcity.',
      payload: { reliefValve: 'safe rooms every 7 minutes' },
    })).toMatchObject({ type: 'survival_system', name: 'Storm Hunger Pressure' });

    expect(() => gameMemoryEntitySchema.parse({
      id: 'pricing_card',
      type: 'pricing_card',
      name: 'Pricing Card',
    })).toThrow();
  });

  it('keeps durable game-memory entity types broad enough for advanced game systems', () => {
    expect(GAME_ENTITY_TYPES).toEqual(expect.arrayContaining([
      'game_world',
      'faction',
      'gameplay_loop',
      'quest_arc',
      'mission_flow',
      'dungeon_layout',
      'dialogue_branch',
      'boss_phase',
      'economy_system',
      'multiplayer_mode',
      'live_ops_plan',
      'encounter_spec',
      'procedural_rule',
      'behavior_tree',
      'dynamic_event',
      'camera_system',
      'animation_system',
      'vfx_system',
      'lighting_system',
      'audio_system',
      'asset_pipeline',
      'open_world_region',
      'survival_system',
      'stealth_system',
      'vehicle_system',
      'telemetry_model',
      'genre_benchmark',
      'playtest_simulation',
      'community_system',
      'modding_pipeline',
      'difficulty_director',
      'companion_system',
    ]));
  });

  it('maps every game-design metadata entity collection to a durable memory type', () => {
    const entityTypes = new Set(GAME_ENTITY_TYPES);

    expect(GAME_DESIGN_METADATA_ENTITY_TYPE_MAP).toMatchObject({
      gameplayLoops: 'gameplay_loop',
      gameWorlds: 'game_world',
      telemetryModels: 'telemetry_model',
      genreBenchmarks: 'genre_benchmark',
      cameraSystems: 'camera_system',
      audioSystems: 'audio_system',
      assetPipelines: 'asset_pipeline',
      survivalSystems: 'survival_system',
      stealthSystems: 'stealth_system',
      vehicleSystems: 'vehicle_system',
      communitySystems: 'community_system',
      moddingPipelines: 'modding_pipeline',
      difficultyDirectors: 'difficulty_director',
      companionSystems: 'companion_system',
    });

    for (const entityType of Object.values(GAME_DESIGN_METADATA_ENTITY_TYPE_MAP)) {
      expect(entityTypes.has(entityType)).toBe(true);
    }
  });

  it('teaches every durable game-memory entity type in the core prompt', () => {
    const prompt = composeSystemPrompt({});

    for (const entityType of GAME_ENTITY_TYPES) {
      expect(prompt).toContain(`\`${entityType}\``);
    }
  });

  it('exports and teaches canonical game design token families', () => {
    const prompt = composeSystemPrompt({});

    expect(GAME_DESIGN_VISUAL_TOKEN_FAMILIES).toHaveLength(9);
    expect(GAME_DESIGN_MOTION_TOKEN_FAMILIES).toHaveLength(8);
    expect(GAME_DESIGN_AUDIO_TOKEN_FAMILIES).toHaveLength(5);
    expect(GAME_DESIGN_TOKEN_FAMILIES).toHaveLength(22);

    for (const tokenFamily of GAME_DESIGN_TOKEN_FAMILIES) {
      expect(prompt).toContain(`\`${tokenFamily}\``);
    }
  });

  it('validates canonical game-token families while keeping early specs readable', () => {
    const parsed = gameDesignTokensSchema.parse({
      rarity_colors: { legendary: '#ffb13b' },
      faction_palettes: { player: '#4ac7ff', enemy: '#ff4d55' },
      biome_palettes: { storm_foundry: '#293040' },
      danger_level_colors: { critical: '#ff2f3f' },
      combat_feedback_colors: { parry: '#f7f0a0' },
      healing_feedback_colors: { heal: '#42d37a' },
      status_effect_colors: { burn: '#ff6535' },
      cinematic_lighting_presets: { boss_intro: 'low-key amber rim light' },
      atmospheric_density_profiles: { fog_heavy: 'high contrast silhouettes' },
      hitstop_profiles: { heavy: 6 },
      dodge_timings: { iframes: 12 },
      recoil_profiles: { rifle: 'vertical climb with fast return' },
      camera_shake_patterns: { explosion: 'low-frequency distance falloff' },
      ui_transition_styles: { victory: 'reward reveal with breathing room' },
      combat_feedback_timings: { crit_flash_ms: 120 },
      boss_intro_sequences: { phase_one: 'silhouette reveal before control returns' },
      loot_drop_animation_profiles: { legendary: 'short silence, arc, then reveal' },
      combat_intensity_layers: { boss: 'phase-aware stems' },
      ambient_zone_profiles: { safe_room: 'low drones, no threat pulses' },
      rarity_audio_cues: { rare: 'bright chime' },
      emotional_music_states: { tense: 'sparse pulse with unresolved harmony' },
      danger_alert_profiles: { unblockable: 'rising stinger plus HUD pulse' },
      rarityColors: { rare: '#4ac7ff' },
      motionProfiles: { lightHitstopMs: 45 },
      audioCues: { parry: 'metal snap' },
    });

    for (const tokenFamily of GAME_DESIGN_TOKEN_FAMILIES) {
      expect(parsed[tokenFamily as keyof typeof parsed]).toBeDefined();
    }
    expect(parsed.motionProfiles?.lightHitstopMs).toBe(45);
  });

  it('validates game-native skill frontmatter contracts', () => {
    const parsed = gameSkillFrontmatterSchema.parse({
      name: 'combat-system',
      description: 'Combat design module for stamina, parry, weapon archetypes, and game-feel timing.',
      triggers: ['combat system', 'weapon archetypes'],
      agds: {
        mode: 'template',
        surface: 'web',
        scenario: 'combat',
        featured: 11,
        preview: { type: 'markdown' },
        craft: {
          requires: ['combat-system-architecture', 'game-feel'],
        },
        game: {
          genre: 'action combat',
          input: 'keyboard/mouse/gamepad/touch',
          rendering: 'static-html',
        },
        example_prompt: 'Design a stamina-based melee combat system.',
      },
    });

    expect(parsed.agds?.game?.genre).toBe('action combat');
  });

  it('keeps deprecated od skill metadata readable as a compatibility alias', () => {
    const parsed = gameSkillFrontmatterSchema.parse({
      name: 'legacy-local-skill',
      description: 'Legacy local skill with game-native metadata under the old key.',
      od: {
        mode: 'prototype',
        scenario: 'hud',
      },
    });

    expect(parsed.od?.scenario).toBe('hud');
  });

  it('strips deprecated design-system metadata from parsed skill contracts', () => {
    const parsed = gameSkillFrontmatterSchema.parse({
      name: 'legacy-art-bible-local-skill',
      description: 'Compatibility skill with the old art-bible requirement key.',
      agds: {
        game_art_bible: { requires: false },
        design_system: { requires: true },
      },
    });

    expect(parsed.agds?.game_art_bible?.requires).toBe(false);
    expect(parsed.agds).not.toHaveProperty('design_system');
  });

  it('defines cross-discipline studio handoffs using known game-studio roles', () => {
    const roleIds = new Set(GAME_STUDIO_AGENTS.map((agent) => agent.id));
    const handoffIds = new Set(GAME_STUDIO_COLLABORATION_HANDOFFS.map((handoff) => handoff.id));
    const checkpointIds = new Set(GAME_STUDIO_DEBATE_CHECKPOINTS.map((checkpoint) => checkpoint.id));
    const rendered = renderGameStudioCollaborationHandoffs();

    expect([...roleIds].sort()).toEqual([...requiredGameStudioAgentIds].sort());
    expect([...handoffIds]).toEqual(expect.arrayContaining([...requiredStudioHandoffIds]));
    expect(GAME_STUDIO_COLLABORATION_HANDOFFS.length).toBeGreaterThanOrEqual(6);
    expect(handoffIds.size).toBe(GAME_STUDIO_COLLABORATION_HANDOFFS.length);
    for (const handoff of GAME_STUDIO_COLLABORATION_HANDOFFS) {
      expect(roleIds.has(handoff.from)).toBe(true);
      expect(roleIds.has(handoff.to)).toBe(true);
      expect(handoff.coordinates.length).toBeGreaterThanOrEqual(3);
      expect(handoff.resolves).toMatch(/\.$/);
    }
    expect(GAME_STUDIO_DEBATE_CHECKPOINTS.length).toBeGreaterThanOrEqual(4);
    expect(checkpointIds.size).toBe(GAME_STUDIO_DEBATE_CHECKPOINTS.length);
    for (const checkpoint of GAME_STUDIO_DEBATE_CHECKPOINTS) {
      expect(roleIds.has(checkpoint.chair)).toBe(true);
      expect(checkpoint.challengers.length).toBeGreaterThanOrEqual(3);
      for (const challenger of checkpoint.challengers) {
        expect(roleIds.has(challenger)).toBe(true);
      }
      expect(checkpoint.evidence.length).toBeGreaterThanOrEqual(3);
      expect(checkpoint.decisionRule).toMatch(/\.$/);
    }
    expect(rendered).toContain('Gameplay Mechanics Designer -> Game UI/HUD Designer');
    expect(rendered).toContain('Narrative Designer -> Level Designer');
    expect(rendered).toContain('Technical Game Systems Designer -> Art Director');
    expect(rendered).toContain('Accessibility Designer -> Game UI/HUD Designer');
    expect(rendered).toContain('Game Producer -> Game Director');
    expect(rendered).toContain('Studio debate checkpoints');
    expect(rendered).toContain('production-scale-lock');
    expect(rendered).toContain('Game Director resolves the tradeoff');
    for (const agent of GAME_STUDIO_AGENTS) {
      expect(rendered).toContain(agent.title);
    }
  });

  it('keeps game evaluation axes aligned with studio-grade output quality', () => {
    expect(new Set(GAME_EVALUATION_AXES).size).toBe(GAME_EVALUATION_AXES.length);
    expect(GAME_EVALUATION_AXES).toEqual(expect.arrayContaining([
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
    ]));
  });

  it('scores game artifact text with deterministic studio evaluation coverage', () => {
    const body = `
      The core loop teaches combat verbs, readable hitstop, and responsive controls.
      Onboarding uses tutorial prompts, subtitle support, remappable controls, and reduced motion.
      Progression has reward cadence, unlock cadence, loot odds, and economy health tuning.
      The plan names retention, ethical monetization, battle pass fairness, pacing, frustration points, and burnout prevention.
      Level layout covers sightlines, traversal routes, spawn logic, and spatial readability.
      Narrative quests, reactive dialogue, morality stance, dynamic faction reactions, continuity ledger,
      branch merge rules, procedural narrative fragments, emotional consequences, multiplayer lobbies, UGC modding tools, creator rewards,
      moderation, replay sharing, difficulty director intensity curves, adaptive difficulty spawn scaling,
      companion AI, party composition, loyalty, betrayal, squad commands, and tactical synergy,
      resource balancing, player skill analysis, assist systems, ranked fairness, live ops seasons,
      Unreal performance budgets, QA milestones, team size, and vertical slice feasibility are included.
      Encounter design includes enemy composition, boss phase recovery windows, arena mechanics,
      dungeon progression, encounter sequencing, checkpoint logic, raid role coordination, and reward escalation.
      Open world faction territory uses dynamic events, biome transitions, and exploration rewards.
      Survival pressure tracks hunger, shelter, scarcity, durability, and inventory pressure.
      Stealth fairness includes visibility cones, sound propagation, AI alert states, and detection recovery.
      Camera, animation state machine, VFX impact effects, lighting atmosphere, adaptive music, sprite sheet,
      telemetry heatmaps, playtest drop-off, genre benchmarking against soulslike and roguelike references,
      adaptive design scaling, solo, indie, AA, and AAA scale ladder, cutline matrix, production gates,
      smallest shippable version, and preserved core fantasy are included.
    `;

    const result = evaluateGameStudioArtifactText(body, {
      minimumCoveredAxes: 10,
      requiredAxes: ['accessibility_coverage', 'production_feasibility', 'technical_plausibility'],
    });

    expect(result.passed).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(50);
    expect(result.axisCoverage.accessibility_coverage).toBe(true);
    expect(result.axisCoverage.companion_party_systems).toBe(true);
    expect(result.axisCoverage.dungeon_raid_architecture).toBe(true);
    expect(result.axisCoverage.narrative_simulation_continuity).toBe(true);
    expect(result.axisCoverage.adaptive_design_scaling).toBe(true);
    expect(result.axisCoverage.production_feasibility).toBe(true);
    expect(result.axisCoverage.technical_plausibility).toBe(true);
    expect(result.findings).toEqual([]);
  });

  it('detects advanced game-system evaluator axes for studio-grade specs', () => {
    const body = `
      The quest chain defines mission flow, fail-forward branches, and world-state changes.
      Encounter design names enemy composition, ambush escalation, boss phase recovery windows, and raid mechanics.
      Open world simulation maps faction territory, region density, roaming encounters, weather systems, and biome transitions.
      Survival pressure covers hunger, thirst, shelter, body temperature, infection, durability, scarcity, and extraction pressure.
      Stealth fairness documents visibility cones, sound propagation, AI alert states, patrol routes, distractions, and detection recovery.
      Traversal and vehicle design includes parkour, climbing, grappling hook routes, racing physics, and vehicle combat.
      Camera, animation state machine, blend spaces, VFX impact effects, lighting atmosphere, audio soundscape,
      sprite sheet and LOD asset pipeline, telemetry heatmaps, playtest retention curves, and genre benchmarking are included.
    `;

    const result = evaluateGameStudioArtifactText(body, {
      minimumCoveredAxes: 12,
      requiredAxes: [
        'quest_mission_structure',
        'encounter_design',
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
      ],
    });

    expect(result.passed).toBe(true);
    expect(result.coveredAxes).toEqual(expect.arrayContaining([
      'quest_mission_structure',
      'encounter_design',
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
    ]));
    expect(result.findings).toEqual([]);
  });

  it('fails deterministic evaluation when legacy builder surfaces appear', () => {
    const result = evaluateGameStudioArtifactText(
      'Create a SaaS landing page with CRM pricing cards and a customer journey dashboard generator.',
      {
        minimumCoveredAxes: 2,
        requiredAxes: ['gameplay_depth'],
      },
    );

    expect(result.passed).toBe(false);
    expect(result.findings.some((finding) => finding.axis === 'legacy_identity' && finding.severity === 'fail')).toBe(true);
    expect(result.findings.some((finding) => finding.message.includes('gameplay_depth'))).toBe(true);
  });

  it('evaluates the shipped GDD template against core studio quality axes', () => {
    const body = readFileSync(join(repoRoot, 'templates', 'game-design-document.html'), 'utf8');
    const result = evaluateGameStudioArtifactText(body, {
      minimumCoveredAxes: 6,
      requiredAxes: [
        'gameplay_depth',
        'progression_smoothness',
        'accessibility_coverage',
        'production_feasibility',
      ],
    });

    expect(result.passed).toBe(true);
    expect(result.coveredAxes).toEqual(expect.arrayContaining([
      'gameplay_depth',
      'progression_smoothness',
      'accessibility_coverage',
      'production_feasibility',
    ]));
  });

  it('validates game art bible markdown for game readability and production context', () => {
    const body = readFileSync(
      join(repoRoot, 'game-art-bibles', 'arcade-neon', 'DESIGN.md'),
      'utf8',
    );

    expect(gameArtBibleMarkdownSchema.safeParse(body).success).toBe(true);
    expect(gameArtBibleMarkdownSchema.safeParse('# Pretty Colors').success).toBe(false);
  });

  it('validates every visible and retired game art bible DESIGN.md in the repository', () => {
    const root = join(repoRoot, 'game-art-bibles');
    const failures: Array<{ file: string; issues: string[] }> = [];
    let checked = 0;

    for (const file of collectDesignMarkdownFiles(root)) {
      checked += 1;
      const body = readFileSync(file, 'utf8');
      const result = gameArtBibleMarkdownSchema.safeParse(body);
      if (!result.success) {
        failures.push({
          file,
          issues: result.error.issues.map((issue) => issue.message),
        });
      }
    }

    expect(checked).toBeGreaterThan(0);
    expect(failures).toEqual([]);
  });

  it('validates studio JSON document templates with shared schemas', () => {
    const viewport = readJson('gameplay-encounter.gameview.json');
    const nodeGraph = readJson('gameplay-logic.nodegraph.json');
    const behaviorTree = readJson('enemy-captain.btree.json');
    const gameSystem = readJson('combat-camera.systems.json');

    expect(gameViewportDocumentSchema.safeParse(viewport).success).toBe(true);
    expect(gameNodeGraphDocumentSchema.safeParse(nodeGraph).success).toBe(true);
    expect(behaviorTreeDocumentSchema.safeParse(behaviorTree).success).toBe(true);
    expect(gameSystemSpecDocumentSchema.safeParse(gameSystem).success).toBe(true);
    expect(gameStudioDocumentSchema.safeParse(viewport).success).toBe(true);
    expect(gameStudioDocumentSchema.safeParse(nodeGraph).success).toBe(true);
    expect(gameStudioDocumentSchema.safeParse(behaviorTree).success).toBe(true);
    expect(gameStudioDocumentSchema.safeParse(gameSystem).success).toBe(true);

    const nodeCategories = new Set(
      (nodeGraph as { nodes: Array<{ category: string }> }).nodes.map((node) => node.category),
    );
    expect([...nodeCategories]).toEqual(expect.arrayContaining([
      'quest-logic',
      'dialogue-system',
      'ai-behavior',
      'enemy-state',
      'combat-reaction',
      'environmental-trigger',
      'cutscene-sequencing',
      'economy-logic',
      'procedural-generation',
      'progression-system',
    ]));
    expect((nodeGraph as { collaborationNotes?: unknown[] }).collaborationNotes?.length).toBeGreaterThanOrEqual(3);

    const behaviorNodeNames = new Set(
      (behaviorTree as { nodes: Array<{ name: string }> }).nodes.map((node) => node.name),
    );
    expect([...behaviorNodeNames]).toEqual(expect.arrayContaining([
      'Hear Distraction',
      'Investigate Noise',
      'Coordinate Squad',
      'Boss Phase Gate',
      'Enraged Phase Pattern',
      'Preserve Survival Pressure',
      'Faction Retreat',
    ]));
    expect((behaviorTree as { readableTells?: unknown[] }).readableTells?.length).toBeGreaterThanOrEqual(3);
    expect((behaviorTree as { counterplayRules?: unknown[] }).counterplayRules?.length).toBeGreaterThanOrEqual(3);
    expect((behaviorTree as { dynamicDifficultyRules?: unknown[] }).dynamicDifficultyRules?.length).toBeGreaterThanOrEqual(3);

    expect((viewport as { spatialReads?: unknown[] }).spatialReads?.length).toBeGreaterThanOrEqual(1);
    expect((viewport as { worldSimulation?: unknown }).worldSimulation).toBeDefined();
    expect((viewport as { cameraPlan?: unknown[] }).cameraPlan?.length).toBeGreaterThanOrEqual(2);

    expect((gameSystem as { designTokens?: unknown }).designTokens).toBeDefined();
    expect((gameSystem as { production?: { scalingVariants?: unknown[] } }).production?.scalingVariants?.length).toBeGreaterThanOrEqual(4);
    expect((gameSystem as { telemetry?: unknown[] }).telemetry?.length).toBeGreaterThanOrEqual(2);
    expect((gameSystem as { platformAdaptation?: unknown[] }).platformAdaptation?.length).toBeGreaterThanOrEqual(3);
  });

  it('keeps every shipped HTML template game-native', () => {
    const root = join(repoRoot, 'templates');
    const failures: Array<{ file: string; reason: string }> = [];
    let checked = 0;

    for (const name of readdirSync(root).sort()) {
      if (!name.endsWith('.html')) continue;
      checked += 1;
      const file = join(root, name);
      const body = readFileSync(file, 'utf8');
      if (!gameTemplateLanguagePattern.test(body)) {
        failures.push({ file, reason: 'missing game/player/gameplay vocabulary' });
      }
      if (legacyTemplateLanguagePattern.test(body)) {
        failures.push({ file, reason: 'contains legacy non-game template vocabulary' });
      }
    }

    expect(checked).toBeGreaterThan(0);
    expect(failures).toEqual([]);
  });
});
