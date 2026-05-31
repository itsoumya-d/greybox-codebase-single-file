import { mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import * as gameStudioContracts from '@ai-game-design-studio/contracts';
import { describe, expect, it } from 'vitest';

import { SKILLS_CWD_ALIAS } from '../src/cwd-aliases.js';
import { parseFrontmatter } from '../src/frontmatter.js';
import { listSkills, resolveSkillId } from '../src/skills.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../..');
const skillsRoot = path.join(repoRoot, 'skills');
const craftRoot = path.join(repoRoot, 'craft');
const liveArtifactRoot = path.join(skillsRoot, 'live-artifact');

type SkillCatalogEntry = {
  id: string;
  name: string;
  mode: string;
  previewType: string;
  triggers: string[];
  body: string;
  scenario: string;
  featured: number | null;
  defaultFor: string[];
  craftRequires: string[];
  game?: {
    rendering?: string;
    input?: string;
    platform?: string;
  } | null;
};

type GameSkillFrontmatterParseResult =
  | { success: true; data: { name: string } }
  | { success: false; error: { issues: Array<{ message: string }> } };

const gameSkillFrontmatterSchema = (
  gameStudioContracts as unknown as {
    gameSkillFrontmatterSchema: {
      safeParse(value: unknown): GameSkillFrontmatterParseResult;
    };
  }
).gameSkillFrontmatterSchema;

const skillBodyQualityGates = [
  {
    name: 'game-studio identity',
    patterns: [/\bgame\b/i, /\bgames\b/i, /\bplayer\b/i, /\bplayable\b/i, /\bstudio\b/i],
  },
  {
    name: 'game-design domain',
    patterns: [
      /\bHUD\b/i,
      /\bcombat\b/i,
      /\blevel\b/i,
      /\bencounter\b/i,
      /\bboss\b/i,
      /\bquest\b/i,
      /\bnarrative\b/i,
      /\bdialogue\b/i,
      /\beconomy\b/i,
      /\bprogression\b/i,
      /\bworld\b/i,
      /\bcamera\b/i,
      /\banimation\b/i,
      /\bVFX\b/i,
      /\baudio\b/i,
      /\bAI\b/i,
      /\bfaction\b/i,
      /\bmultiplayer\b/i,
      /\blive ops\b/i,
      /\binventory\b/i,
      /\bcrafting\b/i,
      /\bprototype\b/i,
      /\bGDD\b/i,
    ],
  },
  {
    name: 'production-quality guidance',
    patterns: [
      /\baccessibility\b/i,
      /\breadability\b/i,
      /\bcounterplay\b/i,
      /\bplaytest\b/i,
      /\btuning\b/i,
      /\bproduction\b/i,
      /\bscope\b/i,
      /\bperformance\b/i,
      /\bfeasibility\b/i,
      /\bresponsive\b/i,
      /\bcontrols?\b/i,
      /\btelemetry\b/i,
      /\bethic/i,
      /\bscore\b/i,
      /\bevidence\b/i,
      /\bP0 Gates\b/i,
      /\bQA\b/i,
    ],
  },
] as const;

const legacySkillBodyPattern =
  /\b(SaaS|pricing cards?|admin panels?|e-commerce|customer journey|landing page|website builder|app designer|dashboard generator|CRM|UI\/UX|user flows?|mobile app|web app|screen generator|site builder|app builder)\b/i;

const legacySkillReferencePattern =
  /\b(page\/database|topic\/page\/database|Notion page\/database|where is the Notion data source|player's request|generic source question)\b/i;

function fresh(): string {
  return mkdtempSync(path.join(tmpdir(), 'agds-skills-'));
}

function listCraftDocumentSlugs(): Set<string> {
  return new Set(
    readdirSync(craftRoot)
      .filter((file) => file.endsWith('.md') && file !== 'README.md')
      .map((file) => file.replace(/\.md$/, '')),
  );
}

function collectMarkdownFiles(root: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root)) {
    const file = path.join(root, entry);
    const stat = statSync(file);
    if (stat.isDirectory()) files.push(...collectMarkdownFiles(file));
    else if (stat.isFile() && file.endsWith('.md')) files.push(file);
  }
  return files;
}

function writeSkill(
  root: string,
  folder: string,
  options: {
    name?: string;
    description?: string;
    body?: string;
    withAttachments?: boolean;
    metadataLines?: string[];
  } = {},
) {
  const dir = path.join(root, folder);
  mkdirSync(dir, { recursive: true });
  const fm = [
    '---',
    `name: ${options.name ?? folder}`,
    `description: ${options.description ?? 'A test skill.'}`,
    ...(options.metadataLines ?? []),
    '---',
    '',
    options.body ?? '# Test skill body',
    '',
  ].join('\n');
  writeFileSync(path.join(dir, 'SKILL.md'), fm);
  if (options.withAttachments) {
    mkdirSync(path.join(dir, 'assets'), { recursive: true });
    writeFileSync(
      path.join(dir, 'assets', 'template.html'),
      '<html><body>seed</body></html>',
    );
  }
}

describe('listSkills', () => {
  it('prefers canonical game-art-bible frontmatter over the deprecated design-system alias', async () => {
    const root = fresh();
    writeSkill(root, 'orbit-style', {
      metadataLines: [
        'agds:',
        '  game_art_bible:',
        '    requires: false',
        '  design_system:',
        '    requires: true',
      ],
    });

    const skills = await listSkills(root);
    expect(skills).toHaveLength(1);
    expect(skills[0]?.gameArtBibleRequired).toBe(false);
    expect('designSystemRequired' in skills[0]!).toBe(false);
  });

  it('keeps deprecated od frontmatter readable for local compatibility shims', async () => {
    const root = fresh();
    writeSkill(root, 'legacy-local', {
      metadataLines: [
        'od:',
        '  mode: deck',
        '  scenario: pitch',
        '  craft:',
        '    requires: [game-feel]',
      ],
    });

    const skills = await listSkills(root);
    expect(skills).toHaveLength(1);
    expect(skills[0]?.mode).toBe('deck');
    expect(skills[0]?.scenario).toBe('pitch');
    expect(skills[0]?.craftRequires).toEqual(['game-feel']);
  });

  it('validates every on-disk game skill frontmatter and exposes it in the catalog', async () => {
    const failures: Array<{ file: string; issues: string[] }> = [];
    const expectedIds: string[] = [];

    for (const entry of readdirSync(skillsRoot).sort()) {
      const file = path.join(skillsRoot, entry, 'SKILL.md');
      try {
        if (!statSync(file).isFile()) continue;
      } catch {
        continue;
      }

      const raw = readFileSync(file, 'utf8');
      const { data } = parseFrontmatter(raw);
      const result = gameSkillFrontmatterSchema.safeParse(data);
      if (!result.success) {
        failures.push({
          file,
          issues: result.error.issues.map((issue) => issue.message),
        });
        continue;
      }
      expectedIds.push(result.data.name);
    }

    const skills = await listSkills(skillsRoot);
    const visibleIds = new Set(skills.map((skill) => skill.id));

    expect(expectedIds.length).toBeGreaterThan(0);
    expect(failures).toEqual([]);
    expect(expectedIds.filter((id) => !visibleIds.has(id))).toEqual([]);
  });

  it('resolves every skill craft preflight to an on-disk game-production craft guide', async () => {
    const craftSlugs = listCraftDocumentSlugs();
    const skills = (await listSkills(skillsRoot)) as SkillCatalogEntry[];
    const requiredSlugs = new Set(skills.flatMap((skill) => skill.craftRequires));
    const missing = skills.flatMap((skill) =>
      skill.craftRequires
        .filter((requirement) => !craftSlugs.has(requirement))
        .map((requirement) => `${skill.id} -> craft/${requirement}.md`),
    );

    expect(requiredSlugs.size).toBeGreaterThan(0);
    expect(missing).toEqual([]);
  });

  it('keeps every on-disk skill body game-studio native and production-oriented', () => {
    const failures: Array<{ file: string; issues: string[] }> = [];
    let checked = 0;

    for (const entry of readdirSync(skillsRoot).sort()) {
      const file = path.join(skillsRoot, entry, 'SKILL.md');
      try {
        if (!statSync(file).isFile()) continue;
      } catch {
        continue;
      }
      checked += 1;
      const raw = readFileSync(file, 'utf8');
      const { body } = parseFrontmatter(raw);
      const issues: string[] = [];

      if (legacySkillBodyPattern.test(body)) {
        issues.push('contains legacy non-game builder skill language');
      }
      for (const gate of skillBodyQualityGates) {
        if (!gate.patterns.some((pattern) => pattern.test(body))) {
          issues.push(`missing ${gate.name}`);
        }
      }
      if (!/##\s+P0 Gates/i.test(body) && !/##\s+Output contract/i.test(body) && !/##\s+What you produce/i.test(body)) {
        issues.push('missing explicit output or P0 gate section');
      }
      if (issues.length > 0) failures.push({ file, issues });
    }

    expect(checked).toBeGreaterThan(0);
    expect(failures).toEqual([]);
  });

  it('keeps skill side references in game-production source language', () => {
    const failures = collectMarkdownFiles(skillsRoot)
      .filter((file) => legacySkillReferencePattern.test(readFileSync(file, 'utf8')))
      .map((file) => path.relative(repoRoot, file));

    expect(failures).toEqual([]);
  });

  it('includes the built-in live-artifact skill catalog entry', async () => {
    const skills = await listSkills(skillsRoot);
    const skill = skills.find((entry: { id: string }) => entry.id === 'live-artifact');

    if (!skill) throw new Error('live-artifact skill not found');
    expect(skill).toMatchObject({
      id: 'live-artifact',
      name: 'live-artifact',
      mode: 'prototype',
      previewType: 'html',
    });
    expect(skill.triggers.length).toBeGreaterThan(0);
    expect(skill.body).toContain(`> **Skill root (absolute fallback):** \`${liveArtifactRoot}\``);
    expect(skill.body).toContain(`${SKILLS_CWD_ALIAS}/live-artifact/`);
    expect(skill.body).toContain('references/artifact-schema.md');
    expect(skill.body).toContain('references/connector-policy.md');
    expect(skill.body).toContain('references/refresh-contract.md');
    expect(skill.body).toContain(`${SKILLS_CWD_ALIAS}/live-artifact/references/artifact-schema.md`);
    expect(skill.body).not.toContain(`${SKILLS_CWD_ALIAS}/live-artifact/assets/template.html`);
    expect(skill.body).not.toContain(`${SKILLS_CWD_ALIAS}/live-artifact/references/layouts.md`);
    expect(skill.body).toContain('"$AGDS_NODE_BIN" "$AGDS_BIN" tools live-artifacts create --input artifact.json');
    expect(skill.body).toContain('do not ask “where should the data come from?” before checking daemon connector tools');
    expect(skill.body).toContain('notion.notion_search');
    expect(skill.body).toContain('`AGDS_DAEMON_URL`');
    expect(skill.body).toContain('`AGDS_TOOL_TOKEN`');
  });

  it('keeps retired research and business skill ids out of the game-first catalog', async () => {
    const skills = await listSkills(skillsRoot);
    const byId = new Map(
      (skills as SkillCatalogEntry[]).map((skill) => [skill.id, skill]),
    );
    expect(byId.has('dcf-valuation')).toBe(false);
    expect(byId.has('x-research')).toBe(false);
    expect(byId.has('last30days')).toBe(false);
    expect(byId.has('dexter-financial-research')).toBe(false);
    expect(byId.has('last30days-research')).toBe(false);
    expect(resolveSkillId('dcf-valuation')).toBe('dcf-valuation');
    expect(resolveSkillId('x-research')).toBe('x-research');
    expect(resolveSkillId('last30days')).toBe('last30days');
  });

  it('promotes game-first defaults without remapping retired non-game ids', async () => {
    const skills = await listSkills(skillsRoot);
    const byId = new Map(
      (skills as SkillCatalogEntry[]).map((skill) => [skill.id, skill]),
    );

    const playable = byId.get('playable-game-prototype');
    if (!playable) throw new Error('playable-game-prototype skill not found');
    expect(playable).toMatchObject({
      id: 'playable-game-prototype',
      mode: 'prototype',
      scenario: 'gameplay',
      previewType: 'html',
      featured: 1,
      defaultFor: ['prototype'],
      game: {
        rendering: 'canvas2d',
        input: 'keyboard/touch',
        platform: 'responsive web game',
      },
    });
    expect(playable.craftRequires).toContain('game-feel');
    expect(playable.body).toContain('No non-game chrome');

    const keyArt = byId.get('game-key-art');
    if (!keyArt) throw new Error('game-key-art skill not found');
    expect(keyArt).toMatchObject({
      mode: 'image',
      scenario: 'asset',
      defaultFor: ['image'],
    });

    expect(byId.has('saas-landing')).toBe(false);
    expect(byId.has('dashboard')).toBe(false);
    expect(resolveSkillId('saas-landing')).toBe('saas-landing');
    expect(resolveSkillId('dashboard')).toBe('dashboard');
  });

  it('includes advanced game-system skills in the game-first catalog', async () => {
    const skills = await listSkills(skillsRoot);
    const byId = new Map(
      (skills as SkillCatalogEntry[]).map((skill) => [skill.id, skill]),
    );

    expect(byId.get('combat-system')).toMatchObject({
      mode: 'template',
      scenario: 'combat',
      previewType: 'markdown',
    });
    expect(byId.get('rpg-systems')).toMatchObject({
      mode: 'template',
      scenario: 'rpg',
    });
    expect(byId.get('game-design-document')).toMatchObject({
      mode: 'deck',
      scenario: 'gdd',
      previewType: 'markdown',
    });
    expect(byId.get('procedural-generation')?.craftRequires).toContain(
      'procedural-generation-rules',
    );
  });
});

describe('listSkills preamble', () => {
  it('emits both a cwd-relative skill root and an absolute fallback', async () => {
    const root = fresh();
    writeSkill(root, 'demo-skill', {
      withAttachments: true,
      body: 'Use `assets/template.html` to bootstrap.',
    });

    const skills = await listSkills(root);
    expect(skills).toHaveLength(1);
    const skill = skills[0];
    if (!skill) throw new Error('demo-skill not found');

    // The cwd-relative alias path is the primary one — that's what makes
    // the agent stay inside its working directory when reading skill
    // side files (issue #430).
    expect(skill.body).toContain(`${SKILLS_CWD_ALIAS}/demo-skill/`);
    expect(skill.body).toContain(
      `${SKILLS_CWD_ALIAS}/demo-skill/assets/template.html`,
    );

    // The absolute fallback is required for two cases the relative path
    // cannot serve:
    //   - calls without a project (cwd defaults to PROJECT_ROOT, where
    //     the absolute path is in fact an in-cwd path);
    //   - environments where `stageActiveSkill()` failed.
    // Claude/Copilot are additionally given `--add-dir` for that path.
    expect(skill.body).toContain(skill.dir);
    expect(skill.body).toMatch(/Skill root \(absolute fallback\)/);
    expect(skill.body).toMatch(/Skill root \(relative to project\)/);
  });

  it('mentions root-level example.html side files in the preamble', async () => {
    const root = fresh();
    writeSkill(root, 'orbit-style', {
      withAttachments: false,
      body: 'Open and mirror the shipped `example.html` before writing output.',
    });
    writeFileSync(path.join(root, 'orbit-style', 'example.html'), '<main>example</main>');

    const skills = await listSkills(root);
    expect(skills).toHaveLength(1);
    const skill = skills[0];
    if (!skill) throw new Error('orbit-style skill not found');

    expect(skill.body).toContain(`${SKILLS_CWD_ALIAS}/orbit-style/`);
    expect(skill.body).toContain(`${SKILLS_CWD_ALIAS}/orbit-style/example.html`);
    expect(skill.body).toContain('Known side files in this skill: `example.html`.');
  });

  it('uses the on-disk folder name in the alias path even when `name` differs', async () => {
    const root = fresh();
    writeSkill(root, 'game-deck-template', {
      name: 'custom-game-deck',
      withAttachments: true,
    });

    const skills = await listSkills(root);
    expect(skills).toHaveLength(1);
    const skill = skills[0];
    if (!skill) throw new Error('custom-game-deck skill not found');

    // `id`/`name` reflect the frontmatter value (used elsewhere as a stable
    // public id), but the on-disk alias path must use the actual folder
    // name — that is what the daemon-staged junction maps to.
    expect(skill.id).toBe('custom-game-deck');
    expect(skill.body).toContain(`${SKILLS_CWD_ALIAS}/game-deck-template/`);
    expect(skill.body).not.toContain(`${SKILLS_CWD_ALIAS}/custom-game-deck/`);
  });

  it('does not emit a preamble for skills without side files', async () => {
    const root = fresh();
    writeSkill(root, 'lone-skill', {
      withAttachments: false,
      body: 'Body without external files.',
    });

    const skills = await listSkills(root);
    expect(skills).toHaveLength(1);
    const skill = skills[0];
    if (!skill) throw new Error('lone-skill not found');

    expect(skill.body).not.toContain(SKILLS_CWD_ALIAS);
    expect(skill.body).not.toContain('Skill root');
    expect(skill.body).toContain('Body without external files.');
  });
});
