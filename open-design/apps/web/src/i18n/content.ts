import type {
  GameArtBibleSummary,
  PromptTemplateSummary,
  SkillSummary,
} from '../types';
import type { Locale } from './types';

type LocalizedSkillCopy = { description?: string; examplePrompt?: string };
type LocalizedPromptTemplateCopy = Partial<Pick<PromptTemplateSummary, 'summary' | 'title'>>;
type LocalizedContentIds = {
  skills: string[];
  gameArtBibles: string[];
  gameArtBibleCategories: string[];
  promptTemplates: string[];
  promptTemplateCategories: string[];
  promptTemplateTags: string[];
};
type LocalizedContentBundle = {
  skillCopy: Record<string, LocalizedSkillCopy>;
  skillIdsWithEnFallback: readonly string[];
  gameArtBibleSummaries: Record<string, string>;
  gameArtBibleCategories: Record<string, string>;
  gameArtBibleIdsWithEnFallback: readonly string[];
  promptTemplateCategories: Record<string, string>;
  promptTemplateIdsWithEnFallback: readonly string[];
  promptTemplateTags: Record<string, string>;
  promptTemplateCopy: Record<string, LocalizedPromptTemplateCopy>;
};

const GAME_SKILL_COPY: Record<string, LocalizedSkillCopy> = {
  'playable-game-prototype': {
    examplePrompt:
      'Build a playable roguelike dungeon concept with movement, combat, health, stamina, loot, enemies, pause, restart, win and fail states, and a short game-feel critique.',
    description:
      'Creates playable game concepts with input, core loop, HUD feedback, tuning states, accessibility notes, and production-aware critique.',
  },
  'mobile-game-flow': {
    examplePrompt:
      'Design a portrait mobile idle RPG flow: main menu, hero selection, battle HUD, upgrade path, rewards, daily quests, and one-thumb controls.',
    description:
      'Plans mobile game journeys with touch zones, session length, onboarding, rewards, retention health, and portrait or landscape adaptation.',
  },
  'desktop-game-ui': {
    examplePrompt:
      'Design a desktop HUD suite for a sci-fi extraction shooter: main menu, lobby, loadout, match HUD, map, inventory, results, and settings.',
    description:
      'Creates desktop and browser game interface systems for menus, HUDs, inventories, maps, quests, lobbies, overlays, and gameplay states.',
  },
  'game-hud-system': {
    examplePrompt:
      'Build a soulslike HUD system with health, stamina, mana, boss bar, lock-on, quick items, status effects, controller hints, and readability states.',
    description:
      'Specializes in combat readability, resource hierarchy, controller and touch prompts, accessibility, combat feedback, and stable gameplay layout zones.',
  },
  'level-design-board': {
    examplePrompt:
      'Plan a 3D horror level with spawn, objective route, optional loop, hiding spaces, enemy patrols, lighting mood, checkpoints, scares, and rewards.',
    description:
      'Creates level boards with layout, spawn systems, encounter beats, traversal, sightlines, hazards, checkpoints, hidden spaces, and pacing risks.',
  },
  'game-art-bible': {
    examplePrompt:
      'Create an art bible for a hand-painted fantasy RPG: factions, biomes, UI tokens, rarity colors, silhouettes, props, VFX, lighting, and anti-patterns.',
    description:
      'Defines game identity, visual rules, color roles, shape language, environments, characters, props, VFX, HUD tokens, and production constraints.',
  },
  'game-pitch-deck': {
    examplePrompt:
      'Create a studio pitch deck for a co-op survival game: fantasy, pillars, loop, audience, mechanics, level structure, progression, art direction, roadmap, and scope.',
    description:
      'Creates game pitch decks and GDD-style decks with pillars, loops, target players, mechanics, systems, roadmap, production plan, and risk analysis.',
  },
  'game-key-art': {
    examplePrompt:
      'Generate key-art prompts for a cyberpunk FPS: splash screen, hero silhouette, weapon board, city biome, boss concept, and HUD mockup.',
    description:
      'Writes image prompts for splash art, character sheets, environment concepts, weapons, props, bosses, icons, maps, and UI/HUD concepts.',
  },
  'game-trailer-motion': {
    examplePrompt:
      'Plan a 30-second trailer for a neon racer: title reveal, gameplay beats, boost VFX, rival shot, HUD punch-in, finish-line hit, and end card.',
    description:
      'Creates trailer beats, motion boards, HyperFrames briefs, HUD animation, ability showcases, boss intros, and live-ops stingers.',
  },
  'game-audio-kit': {
    examplePrompt:
      'Create an audio kit for a cozy adventure: main motif, day/night ambience, UI clicks, collectible SFX, quest complete, soft error tones, and victory jingle.',
    description:
      'Plans adaptive music, ambient zones, UI sounds, combat SFX, loot cues, voice-over direction, and emotional sound pacing.',
  },
  'sprite-animation': {
    examplePrompt:
      'Design a pixel sprite sheet for a metroidvania hero: idle, run, jump, dash, slash, hit, death, victory, and consistent pivot points.',
    description:
      'Creates sprite sheets, animation state lists, timing notes, pivot rules, contact sheets, and 2D asset QA for playable characters.',
  },
  critique: {
    examplePrompt:
      'Critique this playable game concept across core loop, game feel, HUD readability, difficulty, onboarding, accessibility, art cohesion, and production risk.',
    description:
      'Evaluates game designs for pacing, clarity, retention, balance, readability, accessibility, emotional impact, and feasibility.',
  },
  tweaks: {
    examplePrompt:
      'Add a game tuning panel for difficulty, game speed, camera shake, hit feedback, HUD scale, color mode, and particle intensity.',
    description:
      'Adds live tuning for gameplay parameters, HUD scale, camera feel, difficulty, palette, feedback, and VFX intensity.',
  },
  'live-artifact': {
    examplePrompt:
      'Create a live-ops control center for an arena game: season status, event rotation, class balance, matchmaking health, retention, economy sinks, and patch risks.',
    description:
      'Creates game-studio artifacts such as live-ops consoles, economy tuners, balance boards, telemetry mocks, and production trackers.',
  },
};

const GAME_SKILL_IDS_WITH_EN_FALLBACK = [
  'behavior-tree-design',
  'camera-animation-vfx-lighting',
  'character-weapon-equipment',
  'combat-system',
  'critique',
  'desktop-game-ui',
  'dynamic-event-system',
  'economy-progression',
  'encounter-design',
  'final-studio-package',
  'game-art-bible',
  'game-audio-kit',
  'game-design-document',
  'game-hud-system',
  'game-key-art',
  'game-pitch-deck',
  'game-trailer-motion',
  'game-viewport-scene',
  'inventory-crafting',
  'level-design-board',
  'live-artifact',
  'live-ops-calendar',
  'mobile-game-flow',
  'mobile-game-ui',
  'multiplayer-lobby',
  'narrative-branching',
  'node-logic-graph',
  'open-world-survival-stealth-vehicle',
  'playable-game-prototype',
  'playtest-benchmark-feasibility',
  'procedural-generation',
  'rpg-systems',
  'sprite-animation',
  'survival-module',
  'tweaks',
] as const;

const GAME_ART_BIBLE_SUMMARIES: Record<string, string> = {
  'anime-gacha':
    'Anime gacha art bible for character banners, rarity feedback, party screens, battle readability, and collection fantasy.',
  'arcade-neon':
    'Arcade neon direction for bold feedback color, punchy HUD states, fast readability, and kinetic action silhouettes.',
  'cozy-casual':
    'Cozy casual art bible for soft onboarding, friendly resources, touch-first menus, gentle rewards, and low-friction sessions.',
  'cyberpunk-fps':
    'Cyberpunk FPS direction for readable weapon HUDs, neon city lighting, squad tech, threat color, and tactical contrast.',
  'fantasy-rpg':
    'Fantasy RPG direction for magic, factions, rarity colors, biome palettes, quest readability, and progression fantasy.',
  'game-control-center':
    'Game control-center direction for HUD-heavy systems, live-ops views, telemetry boards, economy tuning, and production planning.',
  'horror-survival':
    'Horror survival direction for limited visibility, safe-room contrast, subtitle clarity, resource pressure, and tension pacing.',
  'military-tactical':
    'Military tactical direction for squad roles, equipment clarity, command overlays, suppression warnings, and map readability.',
  'pixel-retro':
    'Pixel retro direction for tilemaps, sprite timing, limited palettes, chunky HUD feedback, and nostalgic readability.',
  'sci-fi-tactical':
    'Sci-fi tactical art bible for command UI, squad telemetry, minimaps, shields, objectives, and crisp combat signals.',
  'soulslike-dark':
    'Soulslike dark direction for stamina pressure, boss warnings, death-state readability, gothic mood, and fair telegraphs.',
  'sports-broadcast':
    'Sports broadcast direction for scoreboard clarity, replay overlays, spectator readability, ranked moments, and motion graphics.',
  'steampunk-adventure':
    'Steampunk adventure direction for brass machinery, traversal tools, quest props, readable contraptions, and expedition fantasy.',
  'stylized-3d':
    'Stylized 3D direction for sculpted silhouettes, readable materials, expressive lighting, camera-safe shapes, and broad platform support.',
  'underwater-exploration':
    'Underwater exploration direction for depth cues, oxygen states, bioluminescent landmarks, traversal readability, and discovery pacing.',
  'vaporwave-racing':
    'Vaporwave racing direction for speed HUDs, neon track language, drift feedback, rival readability, and music-synced motion.',
  'western-frontier':
    'Western frontier direction for dust, bounty boards, weapon silhouettes, settlement mood, and readable duel tension.',
};

const GAME_ART_BIBLE_CATEGORIES: Record<string, string> = {
  Starter: 'Starter',
  Arcade: 'Arcade',
  'Fantasy RPG': 'Fantasy RPG',
  'Sci-Fi Tactical': 'Sci-Fi Tactical',
  'Cozy Casual': 'Cozy Casual',
  'Pixel Retro': 'Pixel Retro',
  'Horror Survival': 'Horror Survival',
  'Sports Broadcast': 'Sports Broadcast',
  'Stylized 3D': 'Stylized 3D',
  Strategy: 'Strategy',
  Narrative: 'Narrative',
  Competitive: 'Competitive',
  'Mobile Casual': 'Mobile Casual',
  'Live Ops': 'Live Ops',
  'Game HUD': 'Game HUD',
  'Worldbuilding': 'Worldbuilding',
  'Combat Design': 'Combat Design',
  'Level Design': 'Level Design',
  'Art Direction': 'Art Direction',
  'Game Art Direction': 'Game Art Direction',
  'Production Planning': 'Production Planning',
};

const GAME_ART_BIBLE_IDS_WITH_EN_FALLBACK = [
  'anime-gacha',
  'arcade-neon',
  'cozy-casual',
  'cyberpunk-fps',
  'game-control-center',
  'fantasy-rpg',
  'horror-survival',
  'military-tactical',
  'pixel-retro',
  'sci-fi-tactical',
  'soulslike-dark',
  'sports-broadcast',
  'steampunk-adventure',
  'stylized-3d',
  'underwater-exploration',
  'vaporwave-racing',
  'western-frontier',
] as const;

const GAME_PROMPT_TEMPLATE_CATEGORIES: Record<string, string> = {
  Advertising: 'Game Campaign',
  Anime: 'Anime Game Direction',
  'Anime / Manga': 'Anime Game Direction',
  Cinematic: 'Cinematic Game Sequence',
  General: 'Game Concept',
  'Game UI': 'Game UI',
  'Motion Graphics': 'Game Motion Graphics',
  'VFX / Fantasy': 'Fantasy VFX',
  'World Design': 'World Design',
  'Level Design': 'Level Design',
  'Combat Design': 'Combat Design',
  'Strategy Interface': 'Strategy Interface',
  'Progression Systems': 'Progression Systems',
  '2D Level Design': '2D Level Design',
  'Horror Direction': 'Horror Direction',
  'Multiplayer UI': 'Multiplayer UI',
  'Game HUD': 'Game HUD',
  'Encounter Design': 'Encounter Design',
  'Economy Design': 'Economy Design',
  'Character Design': 'Character Design',
  'Combat Systems': 'Combat Systems',
  Worldbuilding: 'Worldbuilding',
  'Narrative UI': 'Narrative UI',
  'Game Trailer': 'Game Trailer',
  'Live Ops': 'Live Ops',
  'Mobile Game': 'Mobile Game',
  'Narrative Trailer': 'Narrative Trailer',
  'Raid Design': 'Raid Design',
  '2D Game Trailer': '2D Game Trailer',
  'World Progression': 'World Progression',
};

const GAME_PROMPT_TEMPLATE_IDS_WITH_EN_FALLBACK = [
  'ancient-guardian-dragon-rescue',
  'ancient-indian-kingdom-fpv-video',
  'anime-martial-arts-battle-illustration',
  'biome-palette-world-map',
  'boss-fight-phase-breakdown-motion',
  'character-class-silhouette-sheet',
  'character-intro-motion-graphics-sequence',
  'cinematic-dragon-interaction-flight',
  'cinematic-east-asian-woman-hand-dance',
  'cinematic-street-racing-sequence-for-seedance-2',
  'cinematic-vampire-alley-fight-sequence',
  'co-op-survival-season-event',
  'crimson-horizon-sci-fi-cinematic-sequence',
  'cyberpunk-fps-game-trailer',
  'cyberpunk-game-trailer-script',
  'extraction-shooter-risk-reward-trailer',
  'extraction-shooter-tactical-map',
  'evolutionary-biome-progression-staircase',
  'fantasy-mmo-raid-hud',
  'game-hud-feedback-motion-study',
  'game-screenshot-anime-fighting-game-captain-ryuuga-vs-kaze-renshin',
  'game-screenshot-three-kingdoms-guanyu-slaying-yanliang',
  'game-screenshot-three-kingdoms-lyubu-yuanmen-archery',
  'game-screenshot-three-kingdoms-zhaoyun-cradle-escape',
  'game-ui-ancient-china-open-world-mmo-hud',
  'game-ui-sci-fi-combat-hud',
  'horror-puzzle-tension-sequence',
  'horror-survival-safe-room-key-art',
  'hunched-character-animation',
  'live-action-anime-adaptation-water-vs-thunder-breathing-duel',
  'live-ops-season-roadmap-motion',
  'magical-academy-storyboard-sequence',
  'metroidvania-ability-unlock-sequence',
  'mmo-raid-mechanic-explainer',
  'mobile-idle-rpg-progression-tree',
  'mobile-idle-rpg-reward-loop',
  'multiplayer-lobby-hud-concept',
  'narrative-dialogue-branch-ui',
  'neon-racer-trailer-beats',
  'open-world-rpg-environment-concept',
  'pixel-art-metroidvania-tilemap',
  'retro-hk-wuxia-film-aesthetic',
  'roguelike-dungeon-loot-table-board',
  'sequence-and-movement-instruction-for-martial-arts-video',
  'soul-switching-mirror-magic-sequence',
  'soulslike-boss-concept-sheet',
  'strategy-city-builder-resource-overlay',
  'tactical-rpg-grid-encounter-board',
  'tactical-rpg-turn-flow-trailer',
  'video-seedance-three-kingdoms-guanyu-slaying-yanliang',
  'video-seedance-three-kingdoms-lyubu-yuanmen-archery',
  'video-seedance-three-kingdoms-zhaoyun-cradle-escape',
  'wasteland-factory-chase',
  'weapon-system-concept-board',
] as const;

const GAME_PROMPT_TEMPLATE_TAGS: Record<string, string> = {
  '3d-render': '3D render',
  accessibility: 'accessibility',
  action: 'action',
  'ancient-china': 'ancient China',
  anime: 'anime',
  arcade: 'arcade',
  archery: 'archery',
  arpg: 'ARPG',
  'art-direction': 'art direction',
  game: 'game',
  player: 'player',
  rpg: 'RPG',
  fps: 'FPS',
  mmo: 'MMO',
  hud: 'HUD',
  boss: 'boss',
  combat: 'combat',
  quest: 'quest',
  loot: 'loot',
  level: 'level',
  trailer: 'trailer',
  cinematic: 'cinematic',
  racing: 'racing',
  survival: 'survival',
  horror: 'horror',
  cyberpunk: 'cyberpunk',
  fantasy: 'fantasy',
  weapon: 'weapon',
  character: 'character',
  'character-sheet': 'character sheet',
  classes: 'classes',
  'city-builder': 'city builder',
  'co-op': 'co-op',
  combo: 'combo',
  'companion-to-image': 'companion image prompt',
  'concept-art': 'concept art',
  dialogue: 'dialogue',
  dungeon: 'dungeon',
  'elden-ring': 'Elden Ring benchmark',
  environment: 'environment',
  'escort-mission': 'escort mission',
  escort: 'escort',
  'extraction-shooter': 'extraction shooter',
  factions: 'factions',
  feedback: 'feedback',
  'fighting-game': 'fighting game',
  'game-cinematic': 'game cinematic',
  'game-feel': 'game feel',
  'game-ui': 'game UI',
  grid: 'grid',
  guanyu: 'Guan Yu',
  ability: 'ability',
  vfx: 'VFX',
  controller: 'controller',
  mobile: 'mobile',
  'pixel-art': 'pixel art',
  encounter: 'encounter',
  'hud-safe': 'HUD safe zones',
  isometric: 'isometric',
  'key-visual': 'key visual',
  'level-design': 'level design',
  lobby: 'lobby',
  lyubu: 'Lu Bu',
  map: 'map',
  matchmaking: 'matchmaking',
  mechanic: 'mechanic',
  biome: 'biome',
  raid: 'raid',
  'boss-fight': 'boss fight',
  cavalry: 'cavalry',
  faction: 'faction',
  economy: 'economy',
  progression: 'progression',
  'live-ops': 'live ops',
  world: 'world',
  pvpve: 'PvPvE',
  multiplayer: 'multiplayer',
  'tactical-rpg': 'tactical RPG',
  'idle-rpg': 'idle RPG',
  metroidvania: 'metroidvania',
  roguelike: 'roguelike',
  'mounted-combat': 'mounted combat',
  motion: 'motion',
  narrative: 'narrative',
  nature: 'nature',
  neon: 'neon',
  'open-world': 'open world',
  overlay: 'overlay',
  platformer: 'platformer',
  product: 'game experience',
  puzzle: 'puzzle',
  resource: 'resource',
  retention: 'retention',
  'reward-loop': 'reward loop',
  'risk-reward': 'risk/reward',
  roadmap: 'roadmap',
  'safe-room': 'safe room',
  'sci-fi': 'sci-fi',
  season: 'season',
  silhouette: 'silhouette',
  soulslike: 'soulslike',
  strategy: 'strategy',
  'street-fighter': 'fighting game benchmark',
  tactical: 'tactical',
  tekken: 'fighting game benchmark',
  tension: 'tension',
  'three-kingdoms': 'Three Kingdoms',
  tilemap: 'tilemap',
  'turn-based': 'turn-based',
  ui: 'UI',
  'unreal-engine-5': 'Unreal Engine 5',
  'vs-screen': 'versus screen',
  'world map': 'world map',
  'world-map': 'world map',
  wuxia: 'wuxia',
  zhaoyun: 'Zhao Yun',
};

const GAME_PROMPT_TEMPLATE_COPY: Record<string, LocalizedPromptTemplateCopy> = {};

function createGameBundle(): LocalizedContentBundle {
  return {
    skillCopy: GAME_SKILL_COPY,
    skillIdsWithEnFallback: GAME_SKILL_IDS_WITH_EN_FALLBACK,
    gameArtBibleSummaries: GAME_ART_BIBLE_SUMMARIES,
    gameArtBibleCategories: GAME_ART_BIBLE_CATEGORIES,
    gameArtBibleIdsWithEnFallback: GAME_ART_BIBLE_IDS_WITH_EN_FALLBACK,
    promptTemplateCategories: GAME_PROMPT_TEMPLATE_CATEGORIES,
    promptTemplateIdsWithEnFallback: GAME_PROMPT_TEMPLATE_IDS_WITH_EN_FALLBACK,
    promptTemplateTags: GAME_PROMPT_TEMPLATE_TAGS,
    promptTemplateCopy: GAME_PROMPT_TEMPLATE_COPY,
  };
}

const LOCALIZED_CONTENT: Partial<Record<Locale, LocalizedContentBundle>> = {
  de: createGameBundle(),
  ru: createGameBundle(),
  fr: createGameBundle(),
};

function buildLocalizedContentIds(content: LocalizedContentBundle): LocalizedContentIds {
  const gameArtBibles = [
    ...Object.keys(content.gameArtBibleSummaries),
    ...content.gameArtBibleIdsWithEnFallback,
  ];
  const gameArtBibleCategories = Object.keys(content.gameArtBibleCategories);
  return {
    skills: [
      ...Object.keys(content.skillCopy),
      ...content.skillIdsWithEnFallback,
    ],
    gameArtBibles,
    gameArtBibleCategories,
    promptTemplates: [
      ...Object.keys(content.promptTemplateCopy),
      ...content.promptTemplateIdsWithEnFallback,
    ],
    promptTemplateCategories: Object.keys(content.promptTemplateCategories),
    promptTemplateTags: Object.keys(content.promptTemplateTags),
  };
}

export const LOCALIZED_CONTENT_IDS = {
  de: buildLocalizedContentIds(LOCALIZED_CONTENT.de!),
  ru: buildLocalizedContentIds(LOCALIZED_CONTENT.ru!),
  fr: buildLocalizedContentIds(LOCALIZED_CONTENT.fr!),
} satisfies Record<'de' | 'ru' | 'fr', LocalizedContentIds>;

export const GERMAN_CONTENT_IDS = LOCALIZED_CONTENT_IDS.de;
export const RUSSIAN_CONTENT_IDS = LOCALIZED_CONTENT_IDS.ru;
export const FRENCH_CONTENT_IDS = LOCALIZED_CONTENT_IDS.fr;

function getLocalizedContent(locale: Locale): LocalizedContentBundle | undefined {
  return LOCALIZED_CONTENT[locale];
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function localizeSkillPrompt(locale: Locale, skill: SkillSummary): string | undefined {
  const translated = getLocalizedContent(locale)?.skillCopy[skill.id]?.examplePrompt;
  if (translated) return translated;
  return skill.examplePrompt ? normalizeText(skill.examplePrompt) : undefined;
}

export function localizeSkillDescription(locale: Locale, skill: SkillSummary): string {
  const translated = getLocalizedContent(locale)?.skillCopy[skill.id]?.description;
  if (translated) return translated;
  return normalizeText(skill.description);
}

export function localizeGameArtBibleSummary(
  locale: Locale,
  system: GameArtBibleSummary,
): string {
  const translated = getLocalizedContent(locale)?.gameArtBibleSummaries[system.id];
  if (translated) return translated;
  return system.summary || system.category || '';
}

export function localizeGameArtBibleCategory(locale: Locale, category: string): string {
  return getLocalizedContent(locale)?.gameArtBibleCategories[category] ?? category;
}

export function localizePromptTemplateCategory(locale: Locale, category: string): string {
  return getLocalizedContent(locale)?.promptTemplateCategories[category] ?? category;
}

export function localizePromptTemplateSummary(
  locale: Locale,
  template: PromptTemplateSummary,
): PromptTemplateSummary {
  const content = getLocalizedContent(locale);
  if (!content) return template;
  const translated = content.promptTemplateCopy[template.id];
  const tags = template.tags?.map((tag) => content.promptTemplateTags[tag] ?? tag);
  return {
    ...template,
    title: translated?.title ?? template.title,
    summary: translated?.summary ?? template.summary,
    category: localizePromptTemplateCategory(locale, template.category || 'General'),
    tags,
  };
}
