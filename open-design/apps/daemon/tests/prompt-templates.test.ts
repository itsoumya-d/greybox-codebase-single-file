import { readdirSync } from 'node:fs';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { listPromptTemplates, readPromptTemplate } from '../src/prompt-templates.js';

const PROMPT_TEMPLATES_ROOT = path.resolve(process.cwd(), '..', '..', 'prompt-templates');
const PROMPT_TEMPLATE_ASSETS_ROOT = path.resolve(process.cwd(), '..', '..', 'assets', 'prompt-templates');
const PROMPT_TEMPLATE_SURFACES = ['image', 'video'] as const;
const LOCAL_PROMPT_TEMPLATE_ASSET_PREFIX = '/assets/prompt-templates/';
const EXPLICIT_GAME_PROMPT_RE =
  /\b(game|gameplay|player|playable|in-engine|game-world|game ui|game trailer|game design|game studio|gdd|hud|hud-safe|rpg|mmo|fps|arpg|boss|combat|quest|loot|sprite|level|cutscene|encounter|raid|faction|economy|progression|live-ops|pvp|pve|pvpve|co-op|multiplayer|controller|touch|mobile|pixel|ability|vfx|biome|world map|minimap|skill tree|inventory|crafting|dialogue|branching|turn-based|tactical|strategy|shooter|platformer|metroidvania|survival|horror|dungeon|telegraph|cooldown|checkpoint|spawn|damage|health|stamina|enemy|npc|retention|reward-loop|vertical slice|game art|art bible|character-select|open-world|level-design|action-rpg|fighting-game|rhythm-action|survival-horror|game-feel|motion-study|racing game|action game|hero battler)\b/i;
const PRODUCTION_READY_PROMPT_RE =
  /\b(accessibility|readability|performance|budget|scope|production|playtest|telemetry|constraint|QA|testing|platform|responsive|risk|ethical|counterplay|balance|comfort|clarity|legibility|safe|review|reference|prototype|vertical slice|in-engine|implementation|optimization|controller|touch|mobile)\b/i;
const DESIGN_DELIVERABLE_PROMPT_RE =
  /\b(board|sheet|map|HUD|key art|concept|trailer|cutscene|storyboard|motion|study|wireframe|overlay|interface|screen|scene|sequence|breakdown|mockup|document|guide|spec|layout|diorama|timeline|tree|chart|menu|splash|screenshot|thumbnail)\b/i;
const GENERIC_MEDIA_DRIFT_RE =
  /\b(saas|startup|e-commerce|website|landing page|pricing card|admin panel|crm|notion team|product promo|product reveal|brand sizzle|brand logo|social media post|fashion editorial|profile avatar|beauty shot|top-tier beauty|luxury white background|corporate dashboard|app showcase|website-to-video|screen generator|app builder|site builder)\b/i;
const MIN_PROMPT_TEMPLATE_PROMPT_LENGTH = 220;
const MIN_PROMPT_TEMPLATE_SUMMARY_LENGTH = 60;

function promptTemplateFiles(): string[] {
  const files: string[] = [];
  for (const surface of PROMPT_TEMPLATE_SURFACES) {
    const dir = path.join(PROMPT_TEMPLATES_ROOT, surface);
    for (const name of readdirSync(dir).sort()) {
      if (name.endsWith('.json')) files.push(`${surface}/${name}`);
    }
  }
  return files;
}

describe('game-first prompt templates', () => {
  it('exposes every on-disk prompt template in the game-native registry', async () => {
    const files = promptTemplateFiles();
    const templates = await listPromptTemplates(PROMPT_TEMPLATES_ROOT);
    const visibleFiles = new Set(
      templates.map((template) => `${template.surface}/${template.id}.json`),
    );

    expect(files.length).toBeGreaterThan(0);
    expect(files.filter((file) => !visibleFiles.has(file))).toEqual([]);
  });

  it('lists game media prompts and hides non-game prompt families', async () => {
    const templates = await listPromptTemplates(PROMPT_TEMPLATES_ROOT);
    const ids = templates.map((template) => template.id);

    expect(ids).toContain('roguelike-dungeon-loot-table-board');
    expect(ids).toContain('game-ui-sci-fi-combat-hud');
    expect(ids).toContain('anime-fighting-game-elemental-duel-key-art');
    expect(ids).toContain('rhythm-action-sword-dance-combo');
    expect(ids).toContain('fantasy-rpg-dragon-rescue-cutscene');
    expect(ids).toContain('neon-racer-trailer-beats');
    expect(ids).not.toContain('e-commerce-live-stream-ui-mockup');
    expect(ids).not.toContain('notion-team-dashboard-live-artifact');
    expect(ids).not.toContain('hyperframes-saas-product-promo-30s');
    expect(ids).not.toContain('cinematic-east-asian-woman-hand-dance');
    expect(ids).not.toContain('ancient-indian-kingdom-fpv-video');
  });

  it('keeps every prompt template game-native, production-ready, and deliverable-focused', async () => {
    const templates = await listPromptTemplates(PROMPT_TEMPLATES_ROOT);
    const failures = templates.flatMap((template) => {
      const text = [
        template.id,
        template.title,
        template.summary,
        template.category,
        template.tags.join(' '),
        template.prompt,
      ].join(' ');
      const issues: string[] = [];

      if (template.prompt.length < MIN_PROMPT_TEMPLATE_PROMPT_LENGTH) {
        issues.push(`prompt too short: ${template.prompt.length} characters`);
      }
      if (template.summary.length < MIN_PROMPT_TEMPLATE_SUMMARY_LENGTH) {
        issues.push(`summary too short: ${template.summary.length} characters`);
      }
      if (!EXPLICIT_GAME_PROMPT_RE.test(text)) {
        issues.push('missing explicit game-design anchor');
      }
      if (!PRODUCTION_READY_PROMPT_RE.test(text)) {
        issues.push('missing production/readability reasoning');
      }
      if (!DESIGN_DELIVERABLE_PROMPT_RE.test(text)) {
        issues.push('missing concrete game-design deliverable language');
      }
      if (GENERIC_MEDIA_DRIFT_RE.test(text)) {
        issues.push('contains generic non-game media drift');
      }

      return issues.length > 0 ? [{ id: template.id, surface: template.surface, issues }] : [];
    });

    expect(failures).toEqual([]);
  });

  it('uses AGDS-first source attribution for first-party prompt templates', async () => {
    const templates = await listPromptTemplates(PROMPT_TEMPLATES_ROOT);
    const firstParty = templates.filter(
      (template) => template.source.repo === 'ai-game-design-studio/prompt-templates',
    );

    expect(firstParty.length).toBeGreaterThan(0);
    expect(
      templates.filter((template) => template.source.repo === 'nexu-io/open-design'),
    ).toEqual([]);
    expect(
      templates.filter((template) => template.source.url === 'https://github.com/nexu-io/open-design'),
    ).toEqual([]);
    expect(
      templates.filter((template) => /open-design/i.test(template.source.author ?? '')),
    ).toEqual([]);
  });

  it('uses local AGDS-served preview assets for first-party prompt-template media', async () => {
    const templates = await listPromptTemplates(PROMPT_TEMPLATES_ROOT);
    const stalePreviewUrls = templates.filter((template) =>
      [template.previewImageUrl, template.previewVideoUrl].some((url) =>
        typeof url === 'string' && url.includes('raw.githubusercontent.com/nexu-io/open-design'),
      ),
    );

    expect(stalePreviewUrls).toEqual([]);
    for (const template of templates) {
      for (const url of [template.previewImageUrl, template.previewVideoUrl]) {
        if (!url?.startsWith(LOCAL_PROMPT_TEMPLATE_ASSET_PREFIX)) continue;
        const assetPath = path.join(
          PROMPT_TEMPLATE_ASSETS_ROOT,
          url.slice(LOCAL_PROMPT_TEMPLATE_ASSET_PREFIX.length),
        );
        await expect(access(assetPath)).resolves.toBeUndefined();
      }
    }
  });

  it('does not resolve retired non-game prompt ids', async () => {
    const image = await readPromptTemplate(
      PROMPT_TEMPLATES_ROOT,
      'image',
      'e-commerce-live-stream-ui-mockup',
    );
    const video = await readPromptTemplate(
      PROMPT_TEMPLATES_ROOT,
      'video',
      'hyperframes-saas-product-promo-30s',
    );
    const retunedImage = await readPromptTemplate(
      PROMPT_TEMPLATES_ROOT,
      'image',
      'anime-martial-arts-battle-illustration',
    );
    const retunedVideo = await readPromptTemplate(
      PROMPT_TEMPLATES_ROOT,
      'video',
      'cinematic-east-asian-woman-hand-dance',
    );

    expect(image).toBeNull();
    expect(video).toBeNull();
    expect(retunedImage).toBeNull();
    expect(retunedVideo).toBeNull();
  });
});
