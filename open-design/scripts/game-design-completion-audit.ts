import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");

const completionAuditPath = "docs/game-design-completion-audit.md";
const matrixPath = "docs/game-design-requirement-matrix.md";
const transformationAuditPath = "docs/game-design-transformation-audit.md";
const compatibilityManifestPath = "docs/game-design-compatibility-manifest.md";
const packageJsonPath = "package.json";

type MatrixRow = {
  area: string;
  evidence: string;
  number: number;
  status: string;
};

function readRepositoryFile(repositoryPath: string): string {
  return readFileSync(path.join(repoRoot, repositoryPath), "utf8");
}

function repositoryPath(...parts: string[]): string {
  return path.join(repoRoot, ...parts);
}

function directoryEntries(repositoryDirectory: string): string[] {
  const absoluteDirectory = repositoryPath(repositoryDirectory);
  if (!existsSync(absoluteDirectory)) return [];
  return readdirSync(absoluteDirectory, { withFileTypes: true })
    .filter((entry) => !entry.name.startsWith("."))
    .map((entry) => entry.name);
}

function countTopLevelFiles(repositoryDirectory: string, pattern: RegExp): number {
  const absoluteDirectory = repositoryPath(repositoryDirectory);
  if (!existsSync(absoluteDirectory)) return 0;
  return readdirSync(absoluteDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && pattern.test(entry.name))
    .length;
}

function countDirectoriesWithFile(repositoryDirectory: string, fileName: string): number {
  return directoryEntries(repositoryDirectory).filter((entry) =>
    existsSync(repositoryPath(repositoryDirectory, entry, fileName)),
  ).length;
}

function requireIncludes(body: string, expected: string, label: string, violations: string[]): void {
  if (!body.includes(expected)) {
    violations.push(`${label}: missing ${expected}`);
  }
}

function parseMatrixRows(body: string): MatrixRow[] {
  return body
    .split(/\r?\n/)
    .map((line) => {
      const match = line.match(/^\|\s*(\d+)\s*\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|$/);
      if (!match) return null;
      return {
        area: match[2]!.trim(),
        evidence: match[3]!.trim(),
        number: Number(match[1]!),
        status: match[4]!.trim(),
      };
    })
    .filter((row): row is MatrixRow => row != null);
}

function markdownSection(body: string, heading: string): string {
  const lines = body.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `## ${heading}`);
  if (start === -1) return "";
  const end = lines.findIndex((line, index) => index > start && line.startsWith("## "));
  return lines.slice(start + 1, end === -1 ? undefined : end).join("\n").trim();
}

function listItems(section: string): string[] {
  return section
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- ") || /^\d+\.\s+/.test(line));
}

function tableRows(section: string): string[] {
  return section
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|") && !/^\|\s*-+/.test(line))
    .slice(1);
}

function hasConcreteEvidence(evidence: string): boolean {
  return /`[^`]+`|tests?\/|\.test\.|\.ts\b|\.tsx\b|\.md\b|\.json\b|pnpm|apps\/|packages\/|docs\/|skills\/|craft\/|templates\/|prompt-templates\//.test(evidence);
}

function matrixEvidencePaths(evidence: string): string[] {
  return [...evidence.matchAll(/`([^`]+)`/g)]
    .map((match) => match[1] ?? "")
    .filter((value) => /^(?:apps|packages|docs|skills|craft|templates|prompt-templates|game-art-bibles|e2e|tools|scripts)\/|^(?:README\.md|package\.json)$/.test(value));
}

const completionAudit = readRepositoryFile(completionAuditPath);
const matrix = readRepositoryFile(matrixPath);
const transformationAudit = readRepositoryFile(transformationAuditPath);
const compatibilityManifest = readRepositoryFile(compatibilityManifestPath);
const daemonServer = readRepositoryFile("apps/daemon/src/server.ts");
const daemonDb = readRepositoryFile("apps/daemon/src/db.ts");
const projectContracts = readRepositoryFile("packages/contracts/src/api/projects.ts");
const gameStudioContracts = readRepositoryFile("packages/contracts/src/game-studio.ts");
const officialSystemPrompt = readRepositoryFile("packages/contracts/src/prompts/official-system.ts");
const combatCameraSystemTemplate = readRepositoryFile("templates/combat-camera.systems.json");
const studioOrchestration = readRepositoryFile("apps/daemon/src/game-studio-orchestration.ts");
const artifactLint = readRepositoryFile("apps/daemon/src/lint-artifact.ts");
const newProjectPanel = readRepositoryFile("apps/web/src/components/NewProjectPanel.tsx");
const newProjectPanelTest = readRepositoryFile("apps/web/tests/components/NewProjectPanel.test.tsx");
const englishLocale = readRepositoryFile("apps/web/src/i18n/locales/en.ts");
const discoveryPrompt = readRepositoryFile("packages/contracts/src/prompts/discovery.ts");
const packageJson = JSON.parse(readRepositoryFile(packageJsonPath)) as { scripts?: Record<string, string> };
const violations: string[] = [];

for (const repositoryPath of [
  completionAuditPath,
  matrixPath,
  transformationAuditPath,
  compatibilityManifestPath,
  "packages/contracts/src/game-studio.ts",
  "packages/contracts/src/api/projects.ts",
  "apps/daemon/src/db.ts",
  "apps/web/src/components/NewProjectPanel.tsx",
  "apps/web/src/components/GameStudioDocumentEditor.tsx",
  "apps/daemon/tests/game-schema.test.ts",
  "apps/daemon/tests/prompt-templates.test.ts",
  "apps/web/tests/components/NewProjectPanel.test.tsx",
  "apps/web/tests/components/GameStudioDocumentEditor.render.test.tsx",
]) {
  if (!existsSync(path.join(repoRoot, repositoryPath))) {
    violations.push(`missing required evidence file: ${repositoryPath}`);
  }
}

const requiredSkillDirs = [
  "playable-game-prototype",
  "game-design-document",
  "game-hud-system",
  "inventory-crafting",
  "multiplayer-lobby",
  "game-adaptive-design-scaling",
  "game-community-modding",
  "game-companion-party-systems",
  "game-difficulty-director",
  "game-dungeon-raid-architecture",
  "level-design-board",
  "narrative-branching",
  "game-viewport-scene",
  "node-logic-graph",
  "behavior-tree-design",
  "game-narrative-simulation",
  "procedural-generation",
  "encounter-design",
  "combat-system",
  "economy-progression",
  "survival-module",
  "rpg-systems",
  "mobile-game-ui",
  "desktop-game-ui",
  "game-art-bible",
  "game-key-art",
  "game-trailer-motion",
  "game-audio-kit",
  "playtest-benchmark-feasibility",
  "final-studio-package",
  "open-world-survival-stealth-vehicle",
];

const requiredTemplateFiles = [
  "gameplay-encounter.gameview.json",
  "gameplay-logic.nodegraph.json",
  "enemy-captain.btree.json",
  "combat-camera.systems.json",
  "game-design-document.html",
  "combat-spec.html",
  "economy-balance-sheet.html",
  "level-flowchart.html",
  "narrative-tree.html",
  "live-ops-calendar.html",
  "mobile-idle-rpg.html",
  "tactical-rpg-battle.html",
  "extraction-shooter-ui.html",
  "horror-survival-hud.html",
  "racing-simulator-ui.html",
];

const requiredAgentIds = [
  "game-director",
  "gameplay-mechanics",
  "level-design",
  "narrative-design",
  "economy-progression",
  "multiplayer-systems",
  "game-ui-hud",
  "art-direction",
  "audio-direction",
  "live-ops",
  "technical-game-systems",
  "accessibility-design",
  "production-planning",
];

const requiredStudioHandoffIds = [
  "gameplay-to-hud-readability",
  "narrative-to-level-storytelling",
  "economy-to-gameplay-progression",
  "technical-to-art-performance",
  "multiplayer-to-level-fairness",
  "liveops-to-economy-retention",
  "audio-to-gameplay-feedback",
  "director-to-production-scope",
  "accessibility-to-hud-inclusive-readability",
  "producer-to-director-scope-lock",
];

const requiredDebateCheckpointIds = [
  "mechanic-readability-feasibility",
  "world-story-level-coherence",
  "progression-retention-ethics",
  "production-scale-lock",
];

const requiredImagePromptFiles = [
  "anime-fighting-game-elemental-duel-key-art.json",
  "biome-palette-world-map.json",
  "character-class-silhouette-sheet.json",
  "extraction-shooter-tactical-map.json",
  "fantasy-mmo-raid-hud.json",
  "game-ui-sci-fi-combat-hud.json",
  "horror-survival-safe-room-key-art.json",
  "mobile-idle-rpg-progression-tree.json",
  "multiplayer-lobby-hud-concept.json",
  "narrative-dialogue-branch-ui.json",
  "open-world-rpg-environment-concept.json",
  "pixel-art-metroidvania-tilemap.json",
  "roguelike-dungeon-loot-table-board.json",
  "soulslike-boss-concept-sheet.json",
  "strategy-city-builder-resource-overlay.json",
  "tactical-rpg-grid-encounter-board.json",
  "weapon-system-concept-board.json",
];

const requiredVideoPromptFiles = [
  "anime-action-rpg-elemental-duel-trailer.json",
  "arcade-street-racing-boost-trailer.json",
  "boss-fight-phase-breakdown-motion.json",
  "co-op-survival-season-event.json",
  "cyberpunk-fps-game-trailer.json",
  "dragon-rider-traversal-cutscene.json",
  "enemy-hunched-creature-locomotion-study.json",
  "extraction-shooter-risk-reward-trailer.json",
  "fantasy-rpg-dragon-rescue-cutscene.json",
  "game-hud-feedback-motion-study.json",
  "hero-squad-character-select-motion.json",
  "horror-puzzle-tension-sequence.json",
  "live-ops-season-roadmap-motion.json",
  "martial-arts-combat-combo-motion-sheet.json",
  "metroidvania-ability-unlock-sequence.json",
  "mmo-raid-mechanic-explainer.json",
  "mobile-idle-rpg-reward-loop.json",
  "mythic-kingdom-open-world-fpv-traversal.json",
  "rhythm-action-sword-dance-combo.json",
  "tactical-rpg-turn-flow-trailer.json",
];

const requiredWebComponents = [
  "apps/web/src/components/StudioChromeHeader.tsx",
  "apps/web/src/components/StudioModeStrip.tsx",
  "apps/web/src/components/GameStudioDocumentEditor.tsx",
  "apps/web/src/components/GameTelemetryBoard.tsx",
  "apps/web/src/components/GameFilesPanel.tsx",
  "apps/web/src/components/GameProjectsTab.tsx",
  "apps/web/src/components/GameArtBiblesTab.tsx",
  "apps/web/src/components/GameArtBiblePreviewModal.tsx",
  "apps/web/src/components/FinalizeGamePackageButton.tsx",
];

const requiredDaemonModules = [
  "apps/daemon/src/game-studio-orchestration.ts",
  "apps/daemon/src/game-playtest-simulation.ts",
  "apps/daemon/src/game-world-simulation.ts",
  "apps/daemon/src/game-autonomous-iteration.ts",
  "apps/daemon/src/game-balance-loop.ts",
  "apps/daemon/src/game-engine-runtime.ts",
  "apps/daemon/src/game-telemetry.ts",
  "apps/daemon/src/finalize-game-package.ts",
  "apps/daemon/src/game-art-bibles.ts",
  "apps/daemon/src/studio-document-operations.ts",
];

const requiredServerRouteFragments = [
  "/game-telemetry",
  "/game-telemetry/insights",
  "/playtest-simulation",
  "/runtime-playtest",
  "/runtime-playtest/browser",
  "/gameview-runtime",
  "/world-simulation",
  "/world-simulation/loop",
  "/autonomous-iteration",
  "/autonomous-iteration/loop",
  "/studio-orchestration",
  "/studio-orchestration/execute",
  "/studio-document-operations",
  "/studio-document-draft-operations",
  "/presence",
  "/api/game-art-bibles",
];

const requiredGameEntityTypes = [
  "game_world",
  "faction",
  "enemy_type",
  "item_rarity",
  "skill_tree",
  "progression_curve",
  "quest_arc",
  "gameplay_loop",
  "biome",
  "combat_style",
  "character_class",
  "crafting_recipe",
  "loot_table",
  "weapon_system",
  "mission_flow",
  "dungeon_layout",
  "dialogue_branch",
  "boss_phase",
  "economy_system",
  "multiplayer_mode",
];

const requiredGameDesignTokenFamilies = [
  "rarity_colors",
  "faction_palettes",
  "biome_palettes",
  "danger_level_colors",
  "combat_feedback_colors",
  "healing_feedback_colors",
  "status_effect_colors",
  "cinematic_lighting_presets",
  "atmospheric_density_profiles",
  "hitstop_profiles",
  "dodge_timings",
  "recoil_profiles",
  "camera_shake_patterns",
  "ui_transition_styles",
  "combat_feedback_timings",
  "boss_intro_sequences",
  "loot_drop_animation_profiles",
  "combat_intensity_layers",
  "ambient_zone_profiles",
  "rarity_audio_cues",
  "emotional_music_states",
  "danger_alert_profiles",
];

const requiredGameEvaluationAxes = [
  "gameplay_depth",
  "game_feel_quality",
  "retention_health",
  "ethical_engagement",
  "monetization_fairness",
  "pacing_quality",
  "frustration_points",
  "onboarding_clarity",
  "accessibility_coverage",
  "progression_smoothness",
  "visual_readability",
  "spatial_readability",
  "narrative_cohesion",
  "narrative_simulation_continuity",
  "quest_mission_structure",
  "encounter_design",
  "dungeon_raid_architecture",
  "open_world_simulation",
  "survival_pressure",
  "stealth_fairness",
  "traversal_vehicle_design",
  "camera_animation_vfx",
  "lighting_atmosphere",
  "audio_direction",
  "asset_pipeline_awareness",
  "telemetry_playtest",
  "genre_benchmarking",
  "adaptive_design_scaling",
  "replayability",
  "multiplayer_health",
  "community_modding_ecosystem",
  "difficulty_director_adaptation",
  "companion_party_systems",
  "competitive_fairness",
  "balance_quality",
  "technical_plausibility",
  "production_feasibility",
  "live_ops_sustainability",
];

const requiredOnboardingConcepts = [
  {
    label: "genre",
    metadataField: "genre",
    webFragments: ["newproj.gameGenre", "new-project-game-genre"],
    discoveryFragments: ['"id": "genre"', "Genre / player fantasy"],
  },
  {
    label: "single-player or multiplayer",
    metadataField: "playerMode",
    webFragments: ["newproj.gamePlayerMode", "GAME_PLAYER_MODE_OPTIONS", "single-player", "pvpve"],
    discoveryFragments: ['"id": "playerMode"', "Single-player or multiplayer?"],
  },
  {
    label: "platform",
    metadataField: "platforms",
    webFragments: ["newproj.gamePlatform", "GAME_PLATFORM_OPTIONS", "mobile portrait", "PC / desktop", "console", "responsive web game"],
    discoveryFragments: ['"id": "platform"', "Mobile portrait", "PC / desktop", "Console", "Responsive web game"],
  },
  {
    label: "art style",
    metadataField: "artStyle",
    webFragments: ["newproj.gameArtStyle", "newproj.gameArtStylePlaceholder"],
    discoveryFragments: ['"id": "artStyle"', "Art style"],
  },
  {
    label: "monetization",
    metadataField: "monetization",
    webFragments: ["newproj.gameMonetization", "GAME_MONETIZATION_OPTIONS", "ethical cosmetics", "ads with opt-in rewards"],
    discoveryFragments: ['"id": "monetization"', "Monetization / release model"],
  },
  {
    label: "competitive or casual",
    metadataField: "designEmphasis",
    webFragments: ["newproj.gameDesignFocus", "GAME_DESIGN_EMPHASIS_OPTIONS", "competitive / ranked", "casual / cozy"],
    discoveryFragments: ['"id": "emphasis"', "Competitive / ranked", "Casual / cozy"],
  },
  {
    label: "story-driven or systems-driven",
    metadataField: "designEmphasis",
    webFragments: ["newproj.gameDesignFocus", "story-driven", "systems-driven"],
    discoveryFragments: ['"id": "emphasis"', "Story-driven", "Systems-driven"],
  },
  {
    label: "2D or 3D",
    metadataField: "dimensionality",
    webFragments: ["newproj.gameDimensionality", "'2D'", "'3D'", "'2.5D'"],
    discoveryFragments: ['"id": "camera"', "Top-down 2D", "First-person 3D"],
  },
  {
    label: "session length",
    metadataField: "sessionLength",
    webFragments: ["newproj.gameSession", "GAME_SESSION_OPTIONS", "5-10 minutes", "60+ minutes"],
    discoveryFragments: ['"id": "session"', "Session length / audience age / emotional goal"],
  },
  {
    label: "audience age",
    metadataField: "audienceAge",
    webFragments: ["newproj.gameAudience", "newproj.gameAudiencePlaceholder"],
    discoveryFragments: ['"id": "session"', "audience age"],
  },
  {
    label: "core emotional goal",
    metadataField: "emotionalGoal",
    webFragments: ["newproj.gameEmotion", "newproj.gameEmotionPlaceholder"],
    discoveryFragments: ['"id": "session"', "emotional goal"],
  },
  {
    label: "gameplay inspirations",
    metadataField: "inspirations",
    webFragments: ["newproj.gameInspirations", "newproj.gameInspirationsPlaceholder"],
    discoveryFragments: ['"id": "inspirations"', "Gameplay inspirations"],
  },
];

const forbiddenOldOnboardingPhrases = [
  "what type of app",
  "what website pages",
  "website pages do you need",
  "what pages do you need",
];

const requiredCommunityModdingFragments = [
  { source: "project contracts", body: projectContracts, fragments: ["communitySystems?:", "moddingPipelines?:", "'community_system'", "'modding_pipeline'"] },
  { source: "game-community-modding skill", body: readRepositoryFile("skills/game-community-modding/SKILL.md"), fragments: ["UGC pipelines", "modding ecosystem", "moderation", "creator rewards", "compatibility rules"] },
  { source: "community-modding craft", body: readRepositoryFile("craft/community-modding.md"), fragments: ["UGC/modding scope", "Moderation and trust model", "Modding Scope Ladder", "Community Health Signals", "patch migration"] },
  { source: "craft README", body: readRepositoryFile("craft/README.md"), fragments: ["community-modding.md", "UGC pipelines", "creator ecosystems"] },
  { source: "game-studio evaluator", body: gameStudioContracts, fragments: ["'community_modding_ecosystem'", "creator ecosystem", "replay sharing"] },
];

const requiredDifficultyDirectorFragments = [
  { source: "project contracts", body: projectContracts, fragments: ["difficultyDirectors?:", "'difficulty_director'"] },
  { source: "game-difficulty-director skill", body: readRepositoryFile("skills/game-difficulty-director/SKILL.md"), fragments: ["Adaptive game difficulty director", "intensity curve", "spawn cadence", "resource drops", "assist options", "telemetry"] },
  { source: "game-difficulty-director craft", body: readRepositoryFile("craft/game-difficulty-director.md"), fragments: ["adaptive spawn systems", "enemy aggression scaling", "resource balancing", "player skill analysis", "pacing correction", "assist systems", "AI intensity curves"] },
  { source: "craft README", body: readRepositoryFile("craft/README.md"), fragments: ["game-difficulty-director.md", "Adaptive intensity", "difficulty telemetry"] },
  { source: "behavior-tree template", body: readRepositoryFile("templates/enemy-captain.btree.json"), fragments: ["dynamicDifficultyRules", "Delay support calls", "Reduce flank aggression"] },
  { source: "game-studio evaluator", body: gameStudioContracts, fragments: ["'difficulty_director_adaptation'", "AI director", "intensity curve"] },
];

const requiredCompanionPartyFragments = [
  { source: "project contracts", body: projectContracts, fragments: ["companionSystems?:", "'companion_system'"] },
  { source: "game-companion-party-systems skill", body: readRepositoryFile("skills/game-companion-party-systems/SKILL.md"), fragments: ["Companion and party systems module", "relationship progression", "loyalty", "betrayal", "squad command", "party composition", "production budgets"] },
  { source: "companion-party-systems craft", body: readRepositoryFile("craft/companion-party-systems.md"), fragments: ["Party promise", "Companion roster", "Relationship model", "Tactical model", "squad commands", "party composition", "Production constraints"] },
  { source: "craft README", body: readRepositoryFile("craft/README.md"), fragments: ["companion-party-systems.md", "Companion identity", "party composition", "tactical synergy"] },
  { source: "narrative tree template", body: readRepositoryFile("templates/narrative-tree.html"), fragments: ["companion reactions", "Quest result and companion reaction"] },
  { source: "game-studio evaluator", body: gameStudioContracts, fragments: ["'companion_party_systems'", "companion AI", "tactical synergy"] },
];

const requiredDungeonRaidFragments = [
  { source: "project contracts", body: projectContracts, fragments: ["dungeonLayouts?:", "'dungeon_layout'"] },
  { source: "game-dungeon-raid-architecture skill", body: readRepositoryFile("skills/game-dungeon-raid-architecture/SKILL.md"), fragments: ["Dungeon and raid architecture module", "encounter sequencing", "checkpoint logic", "role coordination", "reward escalation", "wipe recovery", "production budgets"] },
  { source: "dungeon-raid-architecture craft", body: readRepositoryFile("craft/dungeon-raid-architecture.md"), fragments: ["Dungeon And Raid Architecture", "Encounter sequence", "Raid structure", "checkpoint logic", "raid role coordination", "reward escalation", "Production Budgeting"] },
  { source: "craft README", body: readRepositoryFile("craft/README.md"), fragments: ["dungeon-raid-architecture.md", "Dungeon progressions", "role coordination", "reward escalation"] },
  { source: "dungeon template", body: readRepositoryFile("templates/roguelike-dungeon-crawler.html"), fragments: ["Roguelike Dungeon Crawler Template", "Dungeon Room", "Goal: find the sigil key"] },
  { source: "live-ops template", body: readRepositoryFile("templates/live-ops-calendar.html"), fragments: ["Raid weekend"] },
  { source: "game-studio evaluator", body: gameStudioContracts, fragments: ["'dungeon_raid_architecture'", "checkpoint logic", "raid role coordination"] },
];

const requiredNarrativeSimulationFragments = [
  { source: "project contracts", body: projectContracts, fragments: ["questArcs?:", "dialogueBranches?:", "narrativeTrees?:", "factionMaps?:", "'dialogue_branch'", "'narrative_tree'"] },
  { source: "game-narrative-simulation skill", body: readRepositoryFile("skills/game-narrative-simulation/SKILL.md"), fragments: ["Narrative simulation module", "reactive dialogue", "morality", "dynamic faction reactions", "procedural narrative fragments", "continuity ledgers", "branch merge rules"] },
  { source: "narrative-simulation craft", body: readRepositoryFile("craft/narrative-simulation.md"), fragments: ["Narrative Simulation", "State model", "Continuity ledger", "Reactive dialogue rules", "Procedural narrative grammar", "emotional consequences"] },
  { source: "craft README", body: readRepositoryFile("craft/README.md"), fragments: ["narrative-simulation.md", "Reactive dialogue", "procedural narrative fragments", "continuity ledgers"] },
  { source: "narrative tree template", body: readRepositoryFile("templates/narrative-tree.html"), fragments: ["choice consequences", "faction variables", "companion reactions", "vote_weight calculated"] },
  { source: "game-studio evaluator", body: gameStudioContracts, fragments: ["'narrative_simulation_continuity'", "reactive dialogue", "continuity ledger"] },
];

const requiredAdaptiveScalingFragments = [
  { source: "project contracts", body: projectContracts, fragments: ["feasibilityEstimates?:", "scalingVariants?:", "'feasibility_estimate'", "'scaling_variant'"] },
  { source: "game-adaptive-design-scaling skill", body: readRepositoryFile("skills/game-adaptive-design-scaling/SKILL.md"), fragments: ["Adaptive design scaling module", "solo, indie, AA, and AAA", "preserving the core fantasy", "content budgets", "production gates", "smallest shippable version"] },
  { source: "adaptive-design-scaling craft", body: readRepositoryFile("craft/adaptive-design-scaling.md"), fragments: ["Adaptive Design Scaling", "Fantasy lock", "Scale ladder", "solo, indie, AA, and AAA", "Production Rules", "smallest complete version"] },
  { source: "craft README", body: readRepositoryFile("craft/README.md"), fragments: ["adaptive-design-scaling.md", "Solo, indie, AA, and AAA", "core fantasy"] },
  { source: "systems template", body: readRepositoryFile("templates/combat-camera.systems.json"), fragments: ['"scale": "solo"', '"scale": "indie"', '"scale": "AA"', '"scale": "AAA"'] },
  { source: "official system prompt", body: officialSystemPrompt, fragments: ["scaling_variant", "feasibility_estimate"] },
  { source: "game-studio evaluator", body: gameStudioContracts, fragments: ["'adaptive_design_scaling'", "scope scaling", "smallest shippable version"] },
];

const skillCount = countDirectoriesWithFile("skills", "SKILL.md");
const templateCount = countTopLevelFiles("templates", /\.(?:html|json)$/);
const imagePromptCount = countTopLevelFiles("prompt-templates/image", /\.json$/);
const videoPromptCount = countTopLevelFiles("prompt-templates/video", /\.json$/);
const artBibleCount = countDirectoriesWithFile("game-art-bibles", "DESIGN.md");

if (skillCount < 30) violations.push(`expected at least 30 game-studio skills, found ${skillCount}`);
if (templateCount < 20) violations.push(`expected at least 20 top-level game templates, found ${templateCount}`);
if (imagePromptCount < 20) violations.push(`expected at least 20 image game-media prompt templates, found ${imagePromptCount}`);
if (videoPromptCount < 25) violations.push(`expected at least 25 video game-media prompt templates, found ${videoPromptCount}`);
if (artBibleCount < 15) violations.push(`expected at least 15 visible game art bibles, found ${artBibleCount}`);

for (const skillDir of requiredSkillDirs) {
  if (!existsSync(repositoryPath("skills", skillDir, "SKILL.md"))) {
    violations.push(`missing required game-studio skill: skills/${skillDir}/SKILL.md`);
  }
}

for (const templateFile of requiredTemplateFiles) {
  if (!existsSync(repositoryPath("templates", templateFile))) {
    violations.push(`missing required game template: templates/${templateFile}`);
  }
}

for (const agentId of requiredAgentIds) {
  if (!gameStudioContracts.includes(`id: '${agentId}'`)) {
    violations.push(`game-studio contracts missing required studio agent role: ${agentId}`);
  }
}

for (const handoffId of requiredStudioHandoffIds) {
  if (!gameStudioContracts.includes(`id: '${handoffId}'`)) {
    violations.push(`game-studio contracts missing required collaboration handoff: ${handoffId}`);
  }
}

for (const checkpointId of requiredDebateCheckpointIds) {
  if (!gameStudioContracts.includes(`id: '${checkpointId}'`)) {
    violations.push(`game-studio contracts missing required debate checkpoint: ${checkpointId}`);
  }
}

for (const requiredImport of [
  "GAME_STUDIO_AGENTS",
  "GAME_STUDIO_COLLABORATION_HANDOFFS",
  "GAME_STUDIO_DEBATE_CHECKPOINTS",
]) {
  if (!studioOrchestration.includes(requiredImport)) {
    violations.push(`studio orchestration missing required agent architecture import/use: ${requiredImport}`);
  }
}

for (const promptFile of requiredImagePromptFiles) {
  if (!existsSync(repositoryPath("prompt-templates", "image", promptFile))) {
    violations.push(`missing required image game-media prompt template: prompt-templates/image/${promptFile}`);
  }
}

for (const promptFile of requiredVideoPromptFiles) {
  if (!existsSync(repositoryPath("prompt-templates", "video", promptFile))) {
    violations.push(`missing required video game-media prompt template: prompt-templates/video/${promptFile}`);
  }
}

for (const repositoryFile of [...requiredWebComponents, ...requiredDaemonModules]) {
  if (!existsSync(repositoryPath(repositoryFile))) {
    violations.push(`missing required game-studio implementation file: ${repositoryFile}`);
  }
}

for (const routeFragment of requiredServerRouteFragments) {
  if (!daemonServer.includes(routeFragment)) {
    violations.push(`daemon server missing required game-studio route fragment: ${routeFragment}`);
  }
}

for (const entityType of requiredGameEntityTypes) {
  if (!projectContracts.includes(`'${entityType}'`)) {
    violations.push(`project contracts missing required game entity type: ${entityType}`);
  }
  if (!gameStudioContracts.includes(`'${entityType}'`)) {
    violations.push(`game-studio contracts missing required game entity type: ${entityType}`);
  }
  if (!daemonDb.includes(`CREATE TABLE IF NOT EXISTS ${entityType}`)) {
    violations.push(`daemon database missing required game entity table: ${entityType}`);
  }
  if (!daemonDb.includes(`idx_${entityType}_project`)) {
    violations.push(`daemon database missing required game entity project index: ${entityType}`);
  }
}

for (const tokenFamily of requiredGameDesignTokenFamilies) {
  if (!gameStudioContracts.includes(`'${tokenFamily}'`)) {
    violations.push(`game-studio contracts missing required game design token family: ${tokenFamily}`);
  }
  if (!officialSystemPrompt.includes(tokenFamily)) {
    violations.push(`official system prompt missing required game design token family: ${tokenFamily}`);
  }
  if (!combatCameraSystemTemplate.includes(`"${tokenFamily}"`)) {
    violations.push(`combat/camera system template missing required game design token family: ${tokenFamily}`);
  }
}

for (const axis of requiredGameEvaluationAxes) {
  if (!gameStudioContracts.includes(`'${axis}'`)) {
    violations.push(`game-studio contracts missing required evaluation axis: ${axis}`);
  }
  if (!gameStudioContracts.includes(`${axis}: [`)) {
    violations.push(`game-studio contracts missing pattern coverage for evaluation axis: ${axis}`);
  }
}

for (const lintRequirement of [
  "evaluateGameStudioArtifactText",
  "axisCoverage.accessibility_coverage",
  "axisCoverage.production_feasibility",
  "thin-game-evaluation-coverage",
]) {
  if (!artifactLint.includes(lintRequirement)) {
    violations.push(`artifact lint missing required game evaluation enforcement: ${lintRequirement}`);
  }
}

for (const concept of requiredOnboardingConcepts) {
  if (!projectContracts.includes(`${concept.metadataField}?:`)) {
    violations.push(`project metadata missing required onboarding field for ${concept.label}: ${concept.metadataField}`);
  }
  if (!newProjectPanel.includes(`${concept.metadataField}:`)) {
    violations.push(`New Project panel missing required onboarding metadata field for ${concept.label}: ${concept.metadataField}`);
  }
  if (!newProjectPanelTest.includes(`${concept.metadataField}:`)) {
    violations.push(`New Project panel test missing create-payload assertion for ${concept.label}: ${concept.metadataField}`);
  }
  for (const fragment of concept.webFragments) {
    const webSurface = `${newProjectPanel}\n${englishLocale}`;
    if (!webSurface.includes(fragment)) {
      violations.push(`New Project onboarding surface missing ${concept.label} fragment: ${fragment}`);
    }
  }
  for (const fragment of concept.discoveryFragments) {
    if (!discoveryPrompt.includes(fragment)) {
      violations.push(`discovery prompt missing ${concept.label} fragment: ${fragment}`);
    }
  }
}

const onboardingSourceForForbiddenPhrases = `${newProjectPanel}\n${englishLocale}\n${discoveryPrompt}`.toLowerCase();
for (const phrase of forbiddenOldOnboardingPhrases) {
  if (onboardingSourceForForbiddenPhrases.includes(phrase)) {
    violations.push(`game onboarding contains retired app/website brief phrase: ${phrase}`);
  }
}

for (const item of requiredCommunityModdingFragments) {
  for (const fragment of item.fragments) {
    if (!item.body.includes(fragment)) {
      violations.push(`community/modding inventory missing ${item.source} fragment: ${fragment}`);
    }
  }
}

for (const item of requiredDifficultyDirectorFragments) {
  for (const fragment of item.fragments) {
    if (!item.body.includes(fragment)) {
      violations.push(`difficulty-director inventory missing ${item.source} fragment: ${fragment}`);
    }
  }
}

for (const item of requiredCompanionPartyFragments) {
  for (const fragment of item.fragments) {
    if (!item.body.includes(fragment)) {
      violations.push(`companion/party inventory missing ${item.source} fragment: ${fragment}`);
    }
  }
}

for (const item of requiredDungeonRaidFragments) {
  for (const fragment of item.fragments) {
    if (!item.body.includes(fragment)) {
      violations.push(`dungeon/raid inventory missing ${item.source} fragment: ${fragment}`);
    }
  }
}

for (const item of requiredNarrativeSimulationFragments) {
  for (const fragment of item.fragments) {
    if (!item.body.includes(fragment)) {
      violations.push(`narrative-simulation inventory missing ${item.source} fragment: ${fragment}`);
    }
  }
}

for (const item of requiredAdaptiveScalingFragments) {
  for (const fragment of item.fragments) {
    if (!item.body.includes(fragment)) {
      violations.push(`adaptive-scaling inventory missing ${item.source} fragment: ${fragment}`);
    }
  }
}

for (const [scriptName, scriptValue] of Object.entries({
  "completion:audit": "tsx ./scripts/game-design-completion-audit.ts",
  "i18n:fallback-audit": "tsx ./scripts/i18n-fallback-audit.ts",
  "residual:language-audit": "tsx ./scripts/residual-language-audit.ts",
})) {
  if (packageJson.scripts?.[scriptName] !== scriptValue) {
    violations.push(`package.json scripts.${scriptName} must be ${scriptValue}`);
  }
}

const objectiveDeliverables = listItems(markdownSection(completionAudit, "Objective Deliverables"));
if (objectiveDeliverables.length < 7) {
  violations.push("completion audit must restate at least seven concrete objective deliverables");
}

for (const expected of [
  "Canonical identity",
  "Game-native intelligence",
  "Game-native content systems",
  "Game-native workspace",
  "Game-domain persistence",
  "Compatibility confinement",
  "Verification",
]) {
  if (!objectiveDeliverables.some((item) => item.includes(expected))) {
    violations.push(`completion audit objective deliverables missing ${expected}`);
  }
}

const artifactRows = tableRows(markdownSection(completionAudit, "Prompt-To-Artifact Checklist"));
if (artifactRows.length < 12) {
  violations.push("completion audit prompt-to-artifact checklist must cover at least twelve requirement groups");
}

for (const expected of [
  "Product identity and terminology",
  "Studio agent architecture",
  "Prompt engineering and discovery",
  "Onboarding and game metadata",
  "Game memory and schemas",
  "Game skills and craft docs",
  "Templates and media generation",
  "Studio document editing",
  "Viewport/runtime/playtest systems",
  "Export/final package systems",
  "Compatibility confinement",
  "Locale and visible copy",
]) {
  if (!artifactRows.some((row) => row.includes(expected))) {
    violations.push(`completion audit prompt-to-artifact checklist missing ${expected}`);
  }
}

const requiredCommands = listItems(markdownSection(completionAudit, "Required Commands"));
for (const command of [
  "pnpm completion:audit",
  "pnpm guard",
  "pnpm residual:language-audit",
  "pnpm i18n:fallback-audit",
  "pnpm typecheck",
  "tests/i18n-fallback-audit.test.ts",
  "tests/i18n/locales.test.ts",
  "tests/game-schema.test.ts",
  "tests/prompt-templates.test.ts",
  "tests/game-studio.test.ts",
  "tests/components/NewProjectPanel.test.tsx",
  "tests/components/GameStudioDocumentEditor.render.test.tsx",
  "tests/lib/parse-provenance.test.ts",
  "tests/lib/build-clipboard-prompt.test.ts",
  "pnpm --filter @ai-game-design-studio/daemon test",
  "pnpm --filter @ai-game-design-studio/web test",
  "pnpm --filter @ai-game-design-studio/contracts test",
  "pnpm --filter @ai-game-design-studio/tools-dev test",
  "pnpm --filter @ai-game-design-studio/tools-pack test",
  "pnpm --filter @ai-game-design-studio/e2e typecheck",
  "ui/game-studio-first-screen.test.ts",
  "ui/game-studio-documents.test.ts",
  "ui/game-template-render.test.ts",
  "ui/game-studio-collaboration.test.ts",
  "ui/game-studio-presence.test.ts",
  "ui/game-runtime-player-bot.test.ts",
  "pnpm tools-dev run web --namespace agds-smoke --daemon-port 17645 --web-port 17646",
  "desktop/mobile screenshot checks",
  "git diff --check",
]) {
  if (!requiredCommands.some((item) => item.includes(command))) {
    violations.push(`completion audit required commands missing ${command}`);
  }
}

const openFindings = listItems(markdownSection(completionAudit, "Current Open Findings"));
for (const finding of [
  "Full native-language editorial review remains outside automated checks",
  "Broad final end-state claims remain subject to this checklist",
  "Compatibility aliases remain intentionally present only where documented",
]) {
  if (!openFindings.some((item) => item.includes(finding))) {
    violations.push(`completion audit open findings missing ${finding}`);
  }
}

const matrixRows = parseMatrixRows(matrix);
const matrixNumbers = matrixRows.map((row) => row.number);
const expectedMatrixNumbers = Array.from({ length: 100 }, (_, index) => index + 1);
if (JSON.stringify(matrixNumbers) !== JSON.stringify(expectedMatrixNumbers)) {
  violations.push("requirement matrix must contain rows 1 through 100 in order");
}

for (const row of matrixRows) {
  if (row.evidence.length < 20 || row.status.length < 7) {
    violations.push(`requirement matrix row ${row.number} has weak evidence/status text`);
  }
  if (!hasConcreteEvidence(row.evidence)) {
    violations.push(`requirement matrix row ${row.number} must cite concrete files, commands, tests, or artifact paths`);
  }
  const existingEvidencePaths = matrixEvidencePaths(row.evidence).filter((repositoryPath) =>
    existsSync(path.join(repoRoot, repositoryPath)),
  );
  if (existingEvidencePaths.length === 0) {
    violations.push(`requirement matrix row ${row.number} must cite at least one existing repository file or directory`);
  }
}

for (const requirement of [27, 69, 98, 99]) {
  const status = matrixRows.find((row) => row.number === requirement)?.status ?? "";
  if (!/\bnot complete\b/i.test(status)) {
    violations.push(`requirement ${requirement} must remain explicitly not complete until a final audit closes all findings`);
  }
}

for (const expected of [
  "game-design-completion-audit.md",
  "game-design-requirement-matrix.md",
  "game-design-compatibility-manifest.md",
]) {
  requireIncludes(transformationAudit, expected, transformationAuditPath, violations);
}

for (const expected of [
  "migration-only",
  "active prompts, visible UI copy, or first-class catalog entries",
  "guard",
]) {
  requireIncludes(compatibilityManifest, expected, compatibilityManifestPath, violations);
}

if (violations.length > 0) {
  console.error("# Game Design Completion Audit Check");
  console.error("");
  console.error("Completion audit verification failed:");
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exitCode = 1;
} else {
  console.log("# Game Design Completion Audit Check");
  console.log("");
  console.log(`Objective deliverables: ${objectiveDeliverables.length}`);
  console.log(`Prompt-to-artifact rows: ${artifactRows.length}`);
  console.log(`Required command rows: ${requiredCommands.length}`);
  console.log(`Requirement matrix rows: ${matrixRows.length}`);
  console.log(`Agent inventory: ${requiredAgentIds.length} studio roles, ${requiredStudioHandoffIds.length} collaboration handoffs, ${requiredDebateCheckpointIds.length} debate checkpoints`);
  console.log(`Surface inventory: ${skillCount} skills, ${templateCount} templates, ${imagePromptCount} image prompts, ${videoPromptCount} video prompts, ${artBibleCount} art bibles`);
  console.log(`Media prompt inventory: ${requiredImagePromptFiles.length} required image prompts and ${requiredVideoPromptFiles.length} required video prompts`);
  console.log(`Schema inventory: ${requiredGameEntityTypes.length} required game entity types in contracts and daemon DB tables`);
  console.log(`Game token inventory: ${requiredGameDesignTokenFamilies.length} required token families in contracts, prompt rules, and systems template`);
  console.log(`Evaluation inventory: ${requiredGameEvaluationAxes.length} studio-grade axes with artifact lint enforcement`);
  console.log(`Onboarding inventory: ${requiredOnboardingConcepts.length} required game-brief prompts with retired app/website onboarding copy blocked`);
  console.log("Community/modding inventory: skill, craft guide, memory schema, and evaluator axis verified");
  console.log("Difficulty-director inventory: skill, craft guide, memory schema, behavior-tree template, and evaluator axis verified");
  console.log("Companion/party inventory: skill, craft guide, memory schema, narrative template, and evaluator axis verified");
  console.log("Dungeon/raid inventory: skill, craft guide, memory schema, dungeon/live-ops templates, and evaluator axis verified");
  console.log("Narrative-simulation inventory: skill, craft guide, memory schema, narrative template, and evaluator axis verified");
  console.log("Adaptive-scaling inventory: skill, craft guide, memory schema, systems template, prompt memory ids, and evaluator axis verified");
  console.log("Completion audit verification passed: the final-review checklist is linked, concrete, and still records open findings.");
}
