// Game prompt template registry. Mirrors game-art-bibles.js: scans
// <projectRoot>/prompt-templates/{image,video}/*.json on every list call
// and returns parsed game-native entries with light validation.
//
// Each JSON file is hand-curated for concept art, HUD boards, trailers,
// level layouts, encounter explainers, or live-ops motion boards. The
// `source` block keeps attribution attached in the gallery and system prompt.

import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const SUPPORTED_SURFACES = ['image', 'video'] as const;
type PromptTemplateSurface = (typeof SUPPORTED_SURFACES)[number];
type JsonRecord = Record<string, unknown>;

const GAME_TEMPLATE_RE =
  /\b(game|gameplay|player|playable|in-engine|game-world|game ui|game trailer|game design|game studio|gdd|hud|hud-safe|rpg|mmo|fps|arpg|boss|combat|quest|loot|sprite|level|cutscene|encounter|raid|faction|economy|progression|live-ops|pvp|pve|pvpve|co-op|multiplayer|controller|touch|mobile|pixel|ability|vfx|biome|world map|minimap|skill tree|inventory|crafting|dialogue|branching|turn-based|tactical|strategy|shooter|platformer|metroidvania|survival|horror|dungeon|telegraph|cooldown|checkpoint|spawn|damage|health|stamina|enemy|npc|retention|reward-loop|vertical slice|game art|art bible|character-select|open-world|level-design|action-rpg|fighting-game|rhythm-action|survival-horror|game-feel|motion-study|racing game|action game|hero battler)\b/i;

const LEGACY_NON_GAME_TEMPLATE_RE =
  /\b(e-commerce|notion-team|profile-avatar|social-media-post|illustrated-city-food-map|illustration-crayon|momotaro-explainer|infographic-otaku|vr-headset-exploded-view|hyperframes-(app|brand|data|flight|logo|money|product|saas|social|tiktok|website)|cinematic-birthday|3d-animated-boy|a-decade-of-refinement|animation-transfer|beat-synced-outfit|forbidden-city-cat|hollywood-haute-couture|modern-rural|nightclub-flyer|seedance-2-0|traditional-dance|viral-k-pop|vintage-disney|toaster-rocket|cinematic-music-podcast|cinematic-marine-biologist|cinematic-emotional-face|cinematic-route-navigation-guide|luxury-supercar|cinematic-east-asian-woman-hand-dance|ancient-indian-kingdom-fpv-video|hunched-character-animation|sequence-and-movement-instruction-for-martial-arts-video)\b/i;

const RETIRED_IMPORTED_TEMPLATE_RE =
  /\b(anime-martial-arts-battle-illustration|ancient-guardian-dragon-rescue|ancient-indian-kingdom-fpv-video|character-intro-motion-graphics-sequence|cinematic-dragon-interaction-flight|cinematic-east-asian-woman-hand-dance|cinematic-street-racing-sequence-for-seedance-2|cinematic-vampire-alley-fight-sequence|crimson-horizon-sci-fi-cinematic-sequence|hunched-character-animation|live-action-anime-adaptation-water-vs-thunder-breathing-duel|magical-academy-storyboard-sequence|retro-hk-wuxia-film-aesthetic|sequence-and-movement-instruction-for-martial-arts-video|soul-switching-mirror-magic-sequence|wasteland-factory-chase)\b/i;

const RETIRED_PRICING_TILE_TERM = String.raw`pricing\s+card`;
const RETIRED_ADMIN_TOOL_TERM = String.raw`admin\s+panel`;
const NON_GAME_DRIFT_RE = new RegExp(
  String.raw`\b(saas|startup|e-commerce|website|landing page|${RETIRED_PRICING_TILE_TERM}|${RETIRED_ADMIN_TOOL_TERM}|crm|notion team|product promo|product reveal|brand sizzle|brand logo|social media post|fashion editorial|profile avatar|beauty shot|top-tier beauty|luxury white background|corporate dashboard)\b`,
  'i',
);

const TEMPLATE_ID_ALIASES: Record<PromptTemplateSurface, Record<string, string>> = {
  image: {
    // Intentionally empty: retired non-game image template ids fail closed.
  },
  video: {
    // Intentionally empty: retired non-game video template ids fail closed.
  },
};

interface PromptTemplate {
  id: string;
  surface: PromptTemplateSurface;
  title: string;
  summary: string;
  category: string;
  tags: string[];
  model?: string;
  aspect?: string;
  prompt: string;
  previewImageUrl?: string;
  previewVideoUrl?: string;
  source: { repo: string; license: string; author?: string; url?: string };
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object';
}

export async function listPromptTemplates(root: string): Promise<PromptTemplate[]> {
  const out: PromptTemplate[] = [];
  for (const surface of SUPPORTED_SURFACES) {
    const dir = path.join(root, surface);
    let entries = [];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (!entry.name.endsWith('.json')) continue;
      const filePath = path.join(dir, entry.name);
      try {
        const stats = await stat(filePath);
        if (!stats.isFile()) continue;
        const raw = await readFile(filePath, 'utf8');
        const parsed = JSON.parse(raw);
        const validated = validateTemplate(parsed, surface, entry.name);
        if (validated) out.push(validated);
      } catch (err) {
        console.warn(`prompt-templates: failed ${filePath}`, err);
      }
    }
  }
  // Stable order: same surface group together, alpha by title within surface.
  out.sort((a, b) => {
    if (a.surface !== b.surface) {
      return a.surface === 'image' ? -1 : 1;
    }
    return a.title.localeCompare(b.title);
  });
  return out;
}

export async function readPromptTemplate(root: string, surface: string, id: string): Promise<PromptTemplate | null> {
  if (!isPromptTemplateSurface(surface)) return null;
  const resolvedId = TEMPLATE_ID_ALIASES[surface][id] ?? id;
  const filePath = path.join(root, surface, `${resolvedId}.json`);
  try {
    const raw = await readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return validateTemplate(parsed, surface, `${resolvedId}.json`);
  } catch {
    return null;
  }
}

function isPromptTemplateSurface(surface: string): surface is PromptTemplateSurface {
  return (SUPPORTED_SURFACES as readonly string[]).includes(surface);
}

function validateTemplate(raw: unknown, expectedSurface: PromptTemplateSurface, fileName: string): PromptTemplate | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.id !== 'string' || !raw.id) {
    console.warn(`prompt-templates: ${fileName} missing id`);
    return null;
  }
  if (raw.surface !== expectedSurface) {
    console.warn(
      `prompt-templates: ${fileName} surface=${raw.surface} ≠ folder=${expectedSurface}`,
    );
    return null;
  }
  if (typeof raw.title !== 'string' || !raw.title.trim()) return null;
  if (typeof raw.prompt !== 'string' || raw.prompt.trim().length < 20) {
    console.warn(`prompt-templates: ${fileName} prompt too short`);
    return null;
  }
  const source = isRecord(raw.source) ? raw.source : null;
  if (!source || typeof source.repo !== 'string' || typeof source.license !== 'string') {
    console.warn(`prompt-templates: ${fileName} missing source.repo / license`);
    return null;
  }
  const template: PromptTemplate = {
    id: raw.id,
    surface: expectedSurface,
    title: raw.title.trim(),
    summary: typeof raw.summary === 'string' ? raw.summary.trim() : '',
    category: typeof raw.category === 'string' ? raw.category : 'General',
    tags: Array.isArray(raw.tags) ? raw.tags.filter((t): t is string => typeof t === 'string') : [],
    prompt: raw.prompt.trim(),
    source: {
      repo: source.repo,
      license: source.license,
    },
  };
  if (typeof raw.model === 'string') template.model = raw.model;
  if (typeof raw.aspect === 'string') template.aspect = raw.aspect;
  if (typeof raw.previewImageUrl === 'string') template.previewImageUrl = raw.previewImageUrl;
  if (typeof raw.previewVideoUrl === 'string') template.previewVideoUrl = raw.previewVideoUrl;
  if (typeof source.author === 'string') template.source.author = source.author;
  if (typeof source.url === 'string') template.source.url = source.url;
  return isGamePromptTemplate(template) ? template : null;
}

function isGamePromptTemplate(template: PromptTemplate): boolean {
  const haystack = [
    template.id,
    template.title,
    template.summary,
    template.category,
    template.tags.join(' '),
    template.prompt.slice(0, 2000),
  ].join(' ');
  return (
    GAME_TEMPLATE_RE.test(haystack) &&
    !LEGACY_NON_GAME_TEMPLATE_RE.test(haystack) &&
    !RETIRED_IMPORTED_TEMPLATE_RE.test(haystack) &&
    !NON_GAME_DRIFT_RE.test(haystack)
  );
}
