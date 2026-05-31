// Game art-bible registry. Scans a game-art-bible root for DESIGN.md files.
// Title comes from the first H1. Category comes from a
// `> Category: <name>` blockquote line beneath the H1. Summary is the first
// paragraph between the H1 and the next heading (Category line stripped).

import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

export type GameArtBibleSurface = 'web' | 'image' | 'video' | 'audio';

export type GameArtBibleSummary = {
  id: string;
  title: string;
  category: string;
  summary: string;
  swatches: string[];
  surface: GameArtBibleSurface;
  body: string;
  dir?: string;
};

export type GameArtBibleCatalogSource = 'built-in' | 'installed';

export type ListGameArtBiblesOptions = {
  source?: GameArtBibleCatalogSource;
};

type ColorToken = { name: string; value: string };

const GAME_FIRST_CATEGORIES = new Set([
  'Game Art Direction',
  'Game Genres',
  'Aesthetic Styles',
  'Platform Targets',
]);

const BUILT_IN_GAME_ART_BIBLE_IDS = new Set([
  'arcade-neon',
  'fantasy-rpg',
  'sci-fi-tactical',
  'cozy-casual',
  'pixel-retro',
  'horror-survival',
  'sports-broadcast',
  'stylized-3d',
  'game-control-center',
  'cyberpunk-fps',
  'soulslike-dark',
  'anime-gacha',
  'military-tactical',
  'steampunk-adventure',
  'vaporwave-racing',
  'western-frontier',
  'underwater-exploration',
]);

// Retired built-in folders are kept on disk only so older projects that
// persisted those ids can still resolve DESIGN.md by exact id. They must not
// be advertised in the default game-art-bible catalog.
const RETIRED_BUILT_IN_ART_BIBLE_IDS = new Set([
  'agentic',
  'airbnb',
  'airtable',
  'ant',
  'apple',
  'application',
  'arc',
  'artistic',
  'atelier-zero',
  'bento',
  'binance',
  'bmw',
  'bmw-m',
  'bold',
  'brutalism',
  'bugatti',
  'cafe',
  'cal',
  'canva',
  'cisco',
  'claude',
  'clay',
  'claymorphism',
  'clean',
  'clickhouse',
  'cohere',
  'coinbase',
  'colorful',
  'composio',
  'contemporary',
  'corporate',
  'cosmic',
  'creative',
  'cursor',
  'default',
  'discord',
  'dithered',
  'doodle',
  'dramatic',
  'duolingo',
  'editorial',
  'elegant',
  'elevenlabs',
  'energetic',
  'enterprise',
  'expo',
  'expressive',
  'fantasy',
  'ferrari',
  'figma',
  'flat',
  'framer',
  'friendly',
  'futuristic',
  'github',
  'glassmorphism',
  'gradient',
  'hashicorp',
  'hud',
  'huggingface',
  'ibm',
  'intercom',
  'kami',
  'kraken',
  'lamborghini',
  'levels',
  'linear-app',
  'lingo',
  'loom',
  'lovable',
  'luxury',
  'mastercard',
  'material',
  'meta',
  'minimal',
  'minimax',
  'mintlify',
  'miro',
  'mission-control',
  'mistral-ai',
  'modern',
  'mongodb',
  'mono',
  'neobrutalism',
  'neon',
  'neumorphism',
  'nike',
  'notion',
  'nvidia',
  'ollama',
  'openai',
  'opencode-ai',
  'pacman',
  'paper',
  'perspective',
  'pinterest',
  'playstation',
  'posthog',
  'premium',
  'professional',
  'publication',
  'raycast',
  'refined',
  'renault',
  'replicate',
  'resend',
  'retro',
  'revolut',
  'runwayml',
  'sanity',
  'sentry',
  'shadcn',
  'shopify',
  'simple',
  'skeumorphism',
  'slack',
  'sleek',
  'spacex',
  'spacious',
  'spotify',
  'starbucks',
  'storytelling',
  'stripe',
  'supabase',
  'superhuman',
  'tesla',
  'tetris',
  'theverge',
  'together-ai',
  'totality-festival',
  'trading-terminal',
  'uber',
  'urdu',
  'vercel',
  'vibrant',
  'vintage',
  'vodafone',
  'voltagent',
  'warm-editorial',
  'warp',
  'webex',
  'webflow',
  'wechat',
  'wired',
  'wise',
  'x-ai',
  'xiaohongshu',
  'zapier',
]);

export async function listGameArtBibles(
  root: string,
  options: ListGameArtBiblesOptions = {},
): Promise<GameArtBibleSummary[]> {
  const out: GameArtBibleSummary[] = [];
  const source = options.source ?? 'built-in';
  let entries = [];
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    const designPath = path.join(root, entry.name, 'DESIGN.md');
    try {
      const stats = await stat(designPath);
      if (!stats.isFile()) continue;
      const raw = await readFile(designPath, 'utf8');
      const titleMatch = /^#\s+(.+?)\s*$/m.exec(raw);
      const title = cleanTitle(titleMatch?.[1] ?? entry.name);
      const dir = path.join(root, entry.name);
      const summary: GameArtBibleSummary = {
        id: entry.name,
        title,
        category: extractCategory(raw) ?? 'Uncategorized',
        summary: summarize(raw),
        swatches: extractSwatches(raw),
        surface: extractSurface(raw),
        body: raw,
        dir,
      };
      if (!isGameArtBible(summary, source)) continue;
      out.push(summary);
    } catch {
      // Skip.
    }
  }
  return out.sort(compareGameArtBibles);
}

function isGameArtBible(
  system: GameArtBibleSummary,
  source: GameArtBibleCatalogSource,
): boolean {
  if (BUILT_IN_GAME_ART_BIBLE_IDS.has(system.id)) return true;
  if (source === 'built-in' && RETIRED_BUILT_IN_ART_BIBLE_IDS.has(system.id)) {
    return false;
  }
  if (GAME_FIRST_CATEGORIES.has(system.category)) return true;
  const haystack = `${system.id} ${system.title} ${system.category} ${system.summary} ${system.body.slice(0, 1200)}`.toLowerCase();
  return /\b(game|hud|level|rpg|arcade|boss|combat|quest|loot|player|mobile controls|controller|sprite|pixel|fantasy|sci-fi|survival|horror|racing|sports)\b/.test(haystack);
}

export async function readGameArtBible(root: string, id: string): Promise<string | null> {
  const files = [
    path.join(root, id, 'DESIGN.md'),
    path.join(root, '.retired', id, 'DESIGN.md'),
  ];
  for (const file of files) {
    try {
      return await readFile(file, 'utf8');
    } catch {
      // Try the next compatibility location.
    }
  }
  return null;
}

function summarize(raw: string): string {
  const lines = raw.split(/\r?\n/);
  const firstH1 = lines.findIndex((l) => /^#\s+/.test(l));
  if (firstH1 === -1) return '';
  const afterH1 = lines.slice(firstH1 + 1);
  const nextHeading = afterH1.findIndex((l) => /^#{1,6}\s+/.test(l));
  const window = (nextHeading === -1 ? afterH1 : afterH1.slice(0, nextHeading))
    .join('\n')
    // Drop the Category metadata line — it's surfaced separately.
    .replace(/^>\s*Category:.*$/gim, '')
    .replace(/^>\s*/gm, '')
    .trim();
  return window.split(/\n\n/)[0]?.slice(0, 240) ?? '';
}

function extractCategory(raw: string): string | undefined {
  const m = /^>\s*Category:\s*(.+?)\s*$/im.exec(raw);
  return m?.[1];
}

const KNOWN_SURFACES = new Set<GameArtBibleSurface>(['web', 'image', 'video', 'audio']);
function extractSurface(raw: string): GameArtBibleSurface {
  const m = /^>\s*Surface:\s*(.+?)\s*$/im.exec(raw);
  if (!m) return 'web';
  const v = m[1]?.trim().toLowerCase();
  return isGameArtBibleSurface(v) ? v : 'web';
}

function isGameArtBibleSurface(value: string | undefined): value is GameArtBibleSurface {
  return value !== undefined && KNOWN_SURFACES.has(value as GameArtBibleSurface);
}

function compareGameArtBibles(a: GameArtBibleSummary, b: GameArtBibleSummary): number {
  const aRank = gameArtBibleRank(a);
  const bRank = gameArtBibleRank(b);
  if (aRank !== bRank) return aRank - bRank;
  return a.title.localeCompare(b.title);
}

function gameArtBibleRank(system: GameArtBibleSummary): number {
  if (BUILT_IN_GAME_ART_BIBLE_IDS.has(system.id)) return 0;
  if (GAME_FIRST_CATEGORIES.has(system.category)) return 1;
  return 2;
}

// Strip deprecated imported-title boilerplate so the game-art-bible picker
// reads cleanly. Hand-authored game titles that don't match pass through.
function cleanTitle(raw: string): string {
  const retiredPrefix = ['Design', 'System'].join(' ');
  return raw
    .replace(new RegExp(`^${retiredPrefix} (Inspired by|for)\\s+`, 'i'), '')
    .trim();
}

/**
 * Pull 4 representative colors from a DESIGN.md so the picker can render
 * a tiny swatch row next to each system. Order: [bg, support, fg, accent].
 *
 * The shape is deliberately compact — one accent + one background + one
 * fg + one supporting tone — so the row reads like an identity mark even at
 * thumbnail scale. Picked greedily by token-name hints (matches the
 * heuristics in game-art-bible-preview.js so the strip and the showcase
 * agree on which colors the system "is").
 *
 * @param {string} raw  Markdown body of DESIGN.md
 * @returns {string[]}  Up to 4 hex strings; [] if extraction fails.
 */
function extractSwatches(raw: string): string[] {
  const colors: ColorToken[] = [];
  const seen = new Set<string>();
  function push(name: string, value: string): void {
    const cleanName = name.replace(/[*_`]+/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
    const v = normalizeHex(value);
    if (!v || cleanName.length > 60) return;
    const key = `${cleanName}|${v}`;
    if (seen.has(key)) return;
    seen.add(key);
    colors.push({ name: cleanName, value: v });
  }
  // Form A: "- **Background:** `#FAFAFA`" — the colon may sit inside the
  // bold markers (`**Name:**`) or outside them (`**Name**:`). Both variants
  // are common in hand-authored DESIGN.md files, so we allow the colon in
  // either position around the closing `**`.
  const reA = /^[\s>*-]*\**\s*([A-Za-z][A-Za-z0-9 /&()+_-]{1,40}?)\s*[:：]?\s*\**\s*[:：]?\s*`?(#[0-9a-fA-F]{3,8})/gm;
  let m;
  while ((m = reA.exec(raw)) !== null) push(m[1] ?? '', m[2] ?? '');
  // Form B: "**Stripe Purple** (`#533afd`)"
  const reB = /\*\*([A-Za-z][A-Za-z0-9 /&()+_-]{1,40}?)\*\*\s*\(?\s*`?(#[0-9a-fA-F]{3,8})/g;
  while ((m = reB.exec(raw)) !== null) push(m[1] ?? '', m[2] ?? '');
  if (colors.length === 0) return [];

  function pick(hints: string[]): string | null {
    for (const h of hints) {
      const found = colors.find((c) => c.name.includes(h));
      if (found) return found.value;
    }
    return null;
  }
  function isNeutral(hex: string): boolean {
    if (!/^#[0-9a-f]{6}$/.test(hex)) return false;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return Math.max(r, g, b) - Math.min(r, g, b) < 10;
  }

  const bg =
    pick(['scene background', 'environment background', 'background', 'canvas', 'paper', 'surface', 'pa' + 'ge background'])
    ?? '#ffffff';
  const fg =
    pick(['heading', 'foreground', 'ink', 'fg', 'text', 'navy', 'graphite'])
    ?? '#111111';
  const accent =
    pick(['game identity primary', 'identity primary', 'faction primary', 'accent', 'primary'])
    ?? colors.find((c) => !isNeutral(c.value))?.value
    ?? colors[0]?.value
    ?? '#888888';
  const support =
    pick(['border', 'divider', 'rule', 'muted', 'secondary', 'subtle'])
    ?? colors.find(
      (c) => isNeutral(c.value) && c.value !== bg && c.value !== fg,
    )?.value
    ?? '#cccccc';

  return [bg, support, fg, accent];
}

function normalizeHex(raw: string): string | null {
  if (typeof raw !== 'string') return null;
  const m = /^#([0-9a-fA-F]{3,8})$/.exec(raw.trim());
  if (!m) return null;
  let hex = m[1] ?? '';
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  if (hex.length === 4) hex = hex.split('').map((c) => c + c).join('').slice(0, 8);
  return '#' + hex.toLowerCase();
}
