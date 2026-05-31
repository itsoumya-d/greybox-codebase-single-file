import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { composeSystemPrompt } from '../../src/prompts/system.js';
import { OFFICIAL_DESIGNER_PROMPT } from '../../src/prompts/official-system.js';
import { DISCOVERY_AND_PHILOSOPHY } from '../../src/prompts/discovery.js';
import { DESIGN_DIRECTIONS, renderDirectionFormBody } from '../../src/prompts/directions.js';
import { BASE_SYSTEM_PROMPT as SHARED_BASE_SYSTEM_PROMPT } from '@ai-game-design-studio/contracts/prompts/system';
import { DISCOVERY_AND_PHILOSOPHY as SHARED_DISCOVERY_AND_PHILOSOPHY } from '@ai-game-design-studio/contracts/prompts/discovery';
import {
  DESIGN_DIRECTIONS as SHARED_DESIGN_DIRECTIONS,
  renderDirectionFormBody as renderSharedDirectionFormBody,
} from '@ai-game-design-studio/contracts/prompts/directions';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../../..');
const liveArtifactRoot = path.join(repoRoot, 'skills/live-artifact');
const liveArtifactSkillPath = path.join(repoRoot, 'skills/live-artifact/SKILL.md');
const liveArtifactSkillMarkdown = readFileSync(liveArtifactSkillPath, 'utf8');
const liveArtifactSkillBody = [
  `> **Skill root (absolute):** \`${liveArtifactRoot}\``,
  '>',
  '> This skill ships side files alongside `SKILL.md`. When the workflow',
  '> below references side files such as `references/artifact-schema.md`, resolve',
  '> them against the skill root above and open them via their full absolute path.',
  '>',
  '> Known side files in this skill: `references/artifact-schema.md`, `references/connector-policy.md`, `references/refresh-contract.md`.',
  '',
  '',
  liveArtifactSkillMarkdown.replace(/^---[\s\S]*?---\n\n/, '').trim(),
].join('\n');

describe('composeSystemPrompt', () => {
  it('uses the contract-owned AI Game Design Studio identity charter', () => {
    expect(OFFICIAL_DESIGNER_PROMPT).toBe(SHARED_BASE_SYSTEM_PROMPT);
    expect(OFFICIAL_DESIGNER_PROMPT).toContain('React gameplay modules + Babel (inline JSX)');
    expect(OFFICIAL_DESIGNER_PROMPT).toContain('React gameplay module');
    expect(OFFICIAL_DESIGNER_PROMPT).not.toContain('React component');
    expect(OFFICIAL_DESIGNER_PROMPT).not.toContain('component-slug');
    expect(OFFICIAL_DESIGNER_PROMPT).not.toContain('Export a default component');
    expect(OFFICIAL_DESIGNER_PROMPT).toContain('difficulty_director');
    expect(OFFICIAL_DESIGNER_PROMPT).toContain('companion_system');
  });

  it('uses the contract-owned discovery brief and art-direction library', () => {
    expect(DISCOVERY_AND_PHILOSOPHY).toBe(SHARED_DISCOVERY_AND_PHILOSOPHY);
    expect(DESIGN_DIRECTIONS).toBe(SHARED_DESIGN_DIRECTIONS);
    expect(renderDirectionFormBody()).toBe(renderSharedDirectionFormBody());
    expect(DISCOVERY_AND_PHILOSOPHY).toContain('"id": "playerMode"');
    expect(DISCOVERY_AND_PHILOSOPHY).toContain('"Cloud gaming"');
    expect(renderDirectionFormBody()).toContain('tactical-sci-fi-hud');
  });

  it('injects live-artifact skill guidance and metadata intent', () => {
    const prompt = composeSystemPrompt({
      skillName: 'live-artifact',
      skillMode: 'prototype',
      skillBody: liveArtifactSkillBody,
      metadata: {
        kind: 'prototype',
        intent: 'live-artifact',
      } as any,
    });

    expect(prompt).toContain('## Active skill — live-artifact');
    expect(prompt).toContain(`> **Skill root (absolute):** \`${liveArtifactRoot}\``);
    expect(prompt).not.toContain('**Pre-flight (do this before any other tool):** Read `assets/template.html`');
    expect(prompt).not.toContain('live-artifact/references/layouts.md');
    expect(prompt).not.toContain('live-artifact/assets/template.html');
    expect(prompt).toContain('`references/artifact-schema.md`');
    expect(prompt).toContain('`references/connector-policy.md`');
    expect(prompt).toContain('`references/refresh-contract.md`');
    expect(prompt).toContain('The wrapper reads injected `AGDS_NODE_BIN`, `AGDS_BIN`, `AGDS_DAEMON_URL`, and `AGDS_TOOL_TOKEN`');
    expect(prompt).toContain('Do not include or invent `projectId`; the daemon derives project/run scope from the token.');
    expect(prompt).toContain('"$AGDS_NODE_BIN" "$AGDS_BIN" tools live-artifacts create --input artifact.json');
    expect(prompt).toContain('if the creator names a connector/source (for example Notion)');
    expect(prompt).toContain('list connectors before asking where the game data comes from');
    expect(prompt).toContain('a connected `notion` connector plus a creator brief that names Notion is enough to start with `notion.notion_search`');
    expect(prompt).toContain('Prefer the `live-artifact` skill workflow when available');
    expect(prompt).toContain('The first output should be a game live-ops console');
  });

  it('injects canonical game-art-bible context', () => {
    const prompt = composeSystemPrompt({
      gameArtBibleTitle: 'Arcade Neon',
      gameArtBibleBody: '# Arcade Neon\nrarity colors, HUD pulse, combat feedback',
    });
    expect(prompt).toContain('## Active game art bible — Arcade Neon');
    expect(prompt).toContain('rarity colors, HUD pulse, combat feedback');
  });

  it('injects craft references between the game art bible and active skill', () => {
    const prompt = composeSystemPrompt({
      gameArtBibleTitle: 'Arcade Neon',
      gameArtBibleBody: '# Arcade Neon\nuse neon faction colors',
      craftSections: ['hud-readability', 'game-feel'],
      craftBody: '# HUD readability\nKeep combat feedback legible.',
      skillName: 'combat-system',
      skillBody: '# Combat system\nDesign stamina pressure.',
    });

    const artBibleIndex = prompt.indexOf('## Active game art bible — Arcade Neon');
    const craftIndex = prompt.indexOf('## Active game craft references — hud-readability, game-feel');
    const skillIndex = prompt.indexOf('## Active skill — combat-system');

    expect(artBibleIndex).toBeGreaterThanOrEqual(0);
    expect(craftIndex).toBeGreaterThan(artBibleIndex);
    expect(skillIndex).toBeGreaterThan(craftIndex);
    expect(prompt).toContain('Keep combat feedback legible.');
    expect(prompt).toContain('craft rules decide *how* to use them for player readability');
  });

  it('asks the required game-studio onboarding questions in the discovery brief', () => {
    const prompt = composeSystemPrompt({});

    expect(prompt).toContain('<question-form id="discovery" title="Game brief');
    expect(prompt).toContain('"id": "genre"');
    expect(prompt).toContain('"label": "Genre / player fantasy"');
    expect(prompt).toContain('"id": "playerMode"');
    expect(prompt).toContain('"label": "Single-player or multiplayer?"');
    expect(prompt).toContain('"PC / desktop"');
    expect(prompt).toContain('"Console"');
    expect(prompt).toContain('"Responsive web game"');
    expect(prompt).toContain('"Steam Deck"');
    expect(prompt).toContain('"Cloud gaming"');
    expect(prompt).toContain('"Camera / dimensionality"');
    expect(prompt).toContain('"Story-driven"');
    expect(prompt).toContain('"Systems-driven"');
    expect(prompt).toContain('"Competitive / ranked"');
    expect(prompt).toContain('"Casual / cozy"');
    expect(prompt).toContain('"Session length / audience age / emotional goal"');
    expect(prompt).toContain('"id": "artStyle"');
    expect(prompt).toContain('"id": "monetization"');
    expect(prompt).toContain('"Cosmetic-only"');
    expect(prompt).toContain('"Battle pass"');
    expect(prompt).toContain('"id": "inspirations"');
    expect(prompt).toContain('Hades combat');
    expect(prompt).not.toContain('What type of app');
    expect(prompt).not.toContain('website pages');
  });

  describe('artifact handoff no-emit clauses (#1143)', () => {
    it('drops the absolute "non-negotiable" framing in favor of conditional language', () => {
      const prompt = composeSystemPrompt({});
      expect(prompt).not.toContain('non-negotiable output rule');
    });

    it('includes the "When NOT to emit <artifact>" sub-section', () => {
      const prompt = composeSystemPrompt({});
      expect(prompt).toContain('When NOT to emit `<artifact>`');
    });

    it('forbids wrapping in-place-edit-only turns in an artifact block', () => {
      const prompt = composeSystemPrompt({});
      expect(prompt).toMatch(/in-place|Edit-only|already-existing/i);
      expect(prompt).toMatch(/do not (emit|wrap|send) (a |an )?`?<artifact/i);
    });

    it('forbids putting prose / summaries / paths inside an artifact block', () => {
      const prompt = composeSystemPrompt({});
      expect(prompt).toMatch(/complete `?<!doctype html>`?/i);
      expect(prompt).toMatch(/summar(y|ies)|prose|file path/i);
    });

    it('does not carry unconditional "Emit single <artifact>" / "emit a single <artifact>" lines anywhere in the composed prompt', () => {
      const prompt = composeSystemPrompt({});
      // Discovery layer used to carry hard-rule unconditional emit instructions
      // (plan template step 9, default arc Turn 3+ recap, deck workflow step 7).
      // Those must be conditional now — otherwise the no-emit exception in the
      // base prompt is overridden by the higher-priority discovery layer.
      expect(prompt).not.toMatch(/^- 9\.\s+Emit single <artifact>\s*$/m);
      expect(prompt).not.toMatch(/emit a single `?<artifact>`?\.\s*$/m);
      expect(prompt).not.toMatch(/^7\.\s+Emit single <artifact>\s*$/m);
    });

    it('declares artifact-emission conditionality at the dominant discovery layer', () => {
      const prompt = composeSystemPrompt({});
      // The base prompt's "When NOT to emit" section is at lower precedence than
      // DISCOVERY_AND_PHILOSOPHY, so the exception itself must be stated once at
      // the dominant layer (near RULE 3) — not only back-pointed.
      expect(prompt).toMatch(/only when this turn wrote a new canonical HTML/i);
      expect(prompt).toMatch(/only edited an existing HTML file/i);
    });

    it('also keeps deck-mode prompts free of the unconditional emit line (DECK_FRAMEWORK_DIRECTIVE only stacks for deck projects)', () => {
      // The plain composeSystemPrompt({}) call does NOT include
      // DECK_FRAMEWORK_DIRECTIVE; that directive only stacks when
      // `skillMode === 'deck'` or `metadata.kind === 'deck'`. So if
      // deck-framework.ts:327 ever regresses back to "Emit single <artifact>",
      // a no-args negative assertion is a false negative — exercise the deck
      // path explicitly here.
      const deckPrompt = composeSystemPrompt({ skillMode: 'deck' });
      expect(deckPrompt).not.toMatch(/^7\.\s+Emit single <artifact>\s*$/m);
      expect(deckPrompt).toMatch(/Emit single <artifact> if a new canonical deck HTML/i);
    });
  });

  it('teaches first-class game editor JSON documents and advanced studio reasoning', () => {
    const prompt = composeSystemPrompt({
      metadata: {
        kind: 'prototype',
        gameDesign: {
          editorSurfaces: ['gameplay-viewport', 'logic-graph', 'behavior-tree', 'production-board'],
          behaviorTrees: [{ name: 'Boss logic', notes: 'phase escalation and counterplay' }],
          telemetryModels: [{ name: 'Drop-off model', notes: 'onboarding confusion and retention' }],
          feasibilityEstimates: [{ name: 'Indie scope', notes: 'vertical slice staffing' }],
          genreBenchmarks: [{ name: 'Extraction benchmark', notes: 'risk and reward pressure' }],
        },
      } as any,
    });

    expect(prompt).toContain('.gameview.json');
    expect(prompt).toContain('.nodegraph.json');
    expect(prompt).toContain('.btree.json');
    expect(prompt).toContain('.systems.json');
    expect(prompt).toContain('behaviorTrees');
    expect(prompt).toContain('telemetryModels');
    expect(prompt).toContain('feasibilityEstimates');
    expect(prompt).toContain('genreBenchmarks');
    expect(prompt).toContain('survival_system');
    expect(prompt).toContain('stealth_system');
    expect(prompt).toContain('vehicle_system');
    expect(prompt).toContain('difficulty_director');
    expect(prompt).toContain('companion_system');
  });

  it('preserves complete game-design onboarding metadata in the studio prompt', () => {
    const prompt = composeSystemPrompt({
      metadata: {
        kind: 'prototype',
        gameDesign: {
          genre: 'co-op survival stealth extraction',
          playerMode: 'co-op',
          platforms: ['console', 'Steam Deck', 'cloud gaming'],
          dimensionality: '3D',
          camera: 'third-person',
          engine: 'unreal',
          inputModel: ['controller-first'],
          sessionLength: '15-30 minutes',
          audienceAge: 'teen co-op players',
          emotionalGoal: 'tension into mastery',
          monetization: 'ethical cosmetics',
          artStyle: 'stylized dark fantasy',
          inspirations: ['Hades', 'Remnant 2', 'Monster Hunter'],
          editorSurfaces: ['gameplay-viewport', 'level-viewport', 'behavior-tree', 'production-board'],
        },
      } as any,
    });

    expect(prompt).toContain('### Game design memory');
    expect(prompt).toContain('- **genre**: co-op survival stealth extraction');
    expect(prompt).toContain('- **playerMode**: co-op');
    expect(prompt).toContain('- **platforms**: console, Steam Deck, cloud gaming');
    expect(prompt).toContain('- **dimensionality**: 3D');
    expect(prompt).toContain('- **camera**: third-person');
    expect(prompt).toContain('- **engine**: unreal');
    expect(prompt).toContain('- **inputModel**: controller-first');
    expect(prompt).toContain('- **sessionLength**: 15-30 minutes');
    expect(prompt).toContain('- **audienceAge**: teen co-op players');
    expect(prompt).toContain('- **emotionalGoal**: tension into mastery');
    expect(prompt).toContain('- **monetization**: ethical cosmetics');
    expect(prompt).toContain('- **artStyle**: stylized dark fantasy');
    expect(prompt).toContain('- **inspirations**: Hades, Remnant 2, Monster Hunter');
    expect(prompt).toContain('- **editorSurfaces**: gameplay-viewport, level-viewport, behavior-tree, production-board');
  });

  it('preserves advanced durable game-system metadata collections in the studio prompt', () => {
    const prompt = composeSystemPrompt({
      metadata: {
        kind: 'prototype',
        gameDesign: {
          audioSystems: [{ name: 'Adaptive combat score', notes: 'intensity layers and danger stingers' }],
          assetPipelines: [{ name: 'Hero LOD budget', notes: 'retopology, bake targets, and texture memory' }],
          survivalSystems: [{ name: 'Storm hunger', notes: 'hunger, shelter, exposure, and relief valves' }],
          stealthSystems: [{ name: 'Readable stealth', notes: 'visibility cones, sound propagation, and alert recovery' }],
          vehicleSystems: [{ name: 'Wasteland rig', notes: 'vehicle combat, damage readability, and racing physics' }],
          communitySystems: [{ name: 'Guild expeditions', notes: 'shared goals, social hubs, and replay sharing' }],
          moddingPipelines: [{ name: 'Creator kit', notes: 'UGC validation, safe imports, and curated publishing' }],
          difficultyDirectors: [{ name: 'Intensity director', notes: 'adaptive spawns, resource correction, and recovery windows' }],
          companionSystems: [{ name: 'Loyalty squad', notes: 'party synergy, banter reactions, and betrayal thresholds' }],
        },
      } as any,
    });

    expect(prompt).toContain('- **audioSystems**: Adaptive combat score: intensity layers and danger stingers');
    expect(prompt).toContain('- **assetPipelines**: Hero LOD budget: retopology, bake targets, and texture memory');
    expect(prompt).toContain('- **survivalSystems**: Storm hunger: hunger, shelter, exposure, and relief valves');
    expect(prompt).toContain('- **stealthSystems**: Readable stealth: visibility cones, sound propagation, and alert recovery');
    expect(prompt).toContain('- **vehicleSystems**: Wasteland rig: vehicle combat, damage readability, and racing physics');
    expect(prompt).toContain('- **communitySystems**: Guild expeditions: shared goals, social hubs, and replay sharing');
    expect(prompt).toContain('- **moddingPipelines**: Creator kit: UGC validation, safe imports, and curated publishing');
    expect(prompt).toContain('- **difficultyDirectors**: Intensity director: adaptive spawns, resource correction, and recovery windows');
    expect(prompt).toContain('- **companionSystems**: Loyalty squad: party synergy, banter reactions, and betrayal thresholds');
  });

  it('preserves adaptive production-scaling metadata in the studio prompt', () => {
    const prompt = composeSystemPrompt({
      metadata: {
        kind: 'prototype',
        gameDesign: {
          feasibilityEstimates: [
            { name: 'Solo scope', notes: 'one arena, one enemy family, no networking' },
            { name: 'Indie scope', notes: 'vertical slice with a co-op prototype' },
            { name: 'AA scope', notes: 'three biomes, asynchronous events, outsourced art support' },
            { name: 'AAA scope', notes: 'open world, full live ops, cinematic pipeline' },
          ],
          scalingVariants: [
            { name: 'Solo variant', notes: 'preserve the extraction fantasy through a compact PvE loop' },
            { name: 'Indie variant', notes: 'add two-player co-op only after the loop is proven' },
            { name: 'AA variant', notes: 'expand to faction territory and seasonal events' },
            { name: 'AAA variant', notes: 'scale into cinematic open-world production with dedicated teams' },
          ],
        },
      } as any,
    });

    expect(prompt).toContain('solo, indie, AA, and AAA scale variants');
    expect(prompt).toContain('feasibilityEstimates');
    expect(prompt).toContain('Solo scope: one arena, one enemy family, no networking');
    expect(prompt).toContain('Indie scope: vertical slice with a co-op prototype');
    expect(prompt).toContain('AA scope: three biomes, asynchronous events, outsourced art support');
    expect(prompt).toContain('AAA scope: open world, full live ops, cinematic pipeline');
    expect(prompt).toContain('scalingVariants');
    expect(prompt).toContain('Solo variant: preserve the extraction fantasy through a compact PvE loop');
    expect(prompt).toContain('Indie variant: add two-player co-op only after the loop is proven');
    expect(prompt).toContain('AA variant: expand to faction territory and seasonal events');
    expect(prompt).toContain('AAA variant: scale into cinematic open-world production with dedicated teams');
  });

  it('injects non-Critique studio collaboration handoffs into normal generation prompts', () => {
    const prompt = composeSystemPrompt({});

    expect(prompt).toContain('## Studio collaboration handoffs');
    expect(prompt).toContain('Gameplay Mechanics Designer -> Game UI/HUD Designer');
    expect(prompt).toContain('Narrative Designer -> Level Designer');
    expect(prompt).toContain('Economy & Progression Designer -> Gameplay Mechanics Designer');
    expect(prompt).toContain('Technical Game Systems Designer -> Art Director');
    expect(prompt).toContain('Live Ops Strategist -> Economy & Progression Designer');
    expect(prompt).toContain('Accessibility Designer -> Game UI/HUD Designer');
    expect(prompt).toContain('Game Producer -> Game Director');
    expect(prompt).toContain('## Studio debate checkpoints');
    expect(prompt).toContain('production-scale-lock');
    expect(prompt).toContain('Game Director resolves the tradeoff');
  });

  it('injects durable game memory entities and links as source-of-truth context', () => {
    const prompt = composeSystemPrompt({
      gameMemory: {
        entities: [
          {
            id: 'faction_ember_court',
            projectId: 'project-1',
            type: 'faction',
            name: 'Ember Court',
            summary: 'Solar nobles who control volcanic districts.',
            payload: {
              ideology: 'honor-bound expansion',
              rewards: ['sun-forged armor', 'fire sigils'],
            },
            createdAt: 1,
            updatedAt: 2,
          },
          {
            id: 'biome_ash_delta',
            projectId: 'project-1',
            type: 'biome',
            name: 'Ash Delta',
            summary: 'Flooded lava flats with stealth routes and heat vents.',
            payload: { dangerLevel: 4 },
            createdAt: 1,
            updatedAt: 2,
          },
        ],
        links: [
          {
            id: 'link_ember_controls_delta',
            projectId: 'project-1',
            fromEntityId: 'faction_ember_court',
            toEntityId: 'biome_ash_delta',
            relationship: 'controls',
            payload: { conflict: 'rebel smugglers contest supply bridges' },
            createdAt: 1,
            updatedAt: 2,
          },
        ],
      } as any,
    });

    expect(prompt).toContain('## Persistent game memory');
    expect(prompt).toContain('durable game_entities rows');
    expect(prompt).toContain('**faction** `faction_ember_court`: Ember Court');
    expect(prompt).toContain('Solar nobles who control volcanic districts.');
    expect(prompt).toContain('ideology: honor-bound expansion');
    expect(prompt).toContain('`faction_ember_court` -> `biome_ash_delta` (controls)');
    expect(prompt).toContain('rebel smugglers contest supply bridges');
  });

  describe('connectedExternalMcp directive', () => {
    it('omits the directive when no servers are passed', () => {
      const prompt = composeSystemPrompt({});
      expect(prompt).not.toContain('External MCP servers — already authenticated');
      expect(prompt).not.toContain('mcp__<server>__authenticate');
    });

    it('omits the directive when an empty array is passed', () => {
      const prompt = composeSystemPrompt({ connectedExternalMcp: [] });
      expect(prompt).not.toContain('External MCP servers — already authenticated');
    });

    it('lists each connected server and forbids the synthetic auth tools', () => {
      const prompt = composeSystemPrompt({
        connectedExternalMcp: [
          { id: 'higgsfield-openclaw', label: 'Higgsfield (OpenClaw)' },
          { id: 'github' },
        ],
      });

      expect(prompt).toContain('## External MCP servers — already authenticated');
      expect(prompt).toContain('`higgsfield-openclaw`');
      expect(prompt).toContain('Higgsfield (OpenClaw)');
      expect(prompt).toContain('`github`');
      expect(prompt).toContain(
        '**Do NOT call any tool whose name matches `mcp__<server>__authenticate` or `mcp__<server>__complete_authentication`',
      );
      expect(prompt).toContain('localhost:<random>/callback');
      expect(prompt).toContain('Settings → External MCP');
    });

    it('skips entries with blank ids and emits no directive when nothing usable remains', () => {
      const prompt = composeSystemPrompt({
        connectedExternalMcp: [
          { id: '   ', label: 'blank' },
          { id: '', label: 'empty' },
        ] as any,
      });
      expect(prompt).not.toContain('External MCP servers — already authenticated');
    });

    it('does not duplicate the label when it equals the id', () => {
      const prompt = composeSystemPrompt({
        connectedExternalMcp: [{ id: 'github', label: 'github' }],
      });
      expect(prompt).toContain('- `github`\n');
      expect(prompt).not.toContain('- `github` (github)');
    });
  });
});
