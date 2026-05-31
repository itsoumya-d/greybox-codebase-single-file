// SPDX-License-Identifier: Apache-2.0

import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { validateGameStudioArtifactProjectFile, validateGameStudioProjectFile } from './projects.js';

export const GAME_PROJECT_INIT_TEMPLATES = [
  '2d-platformer',
  'top-down-roguelike',
  'mobile-idle',
  'blank',
] as const;

export type GameProjectInitTemplate = (typeof GAME_PROJECT_INIT_TEMPLATES)[number];

export interface InitGameProjectOptions {
  cwd?: string;
  targetDir?: string;
  name?: string;
  template?: string;
  designer?: string;
  force?: boolean;
}

export interface InitGameProjectResult {
  targetDir: string;
  name: string;
  template: GameProjectInitTemplate;
  designer: string;
  created: string[];
  nextSteps: string[];
}

interface TemplateDefinition {
  genre: string;
  camera: string;
  pillars: string[];
  coreLoop: string;
  visualLanguage: string;
  hud: string;
  encounterObjective: string;
  spawnNotes: string;
  threatNotes: string;
  rewardNotes: string;
}

const TEMPLATE_DEFINITIONS: Record<GameProjectInitTemplate, TemplateDefinition> = {
  '2d-platformer': {
    genre: '2D action platformer',
    camera: 'side-on camera with readable jump arcs and stable combat framing',
    pillars: ['Readable movement mastery', 'Short encounter loops', 'Secrets that reward observation'],
    coreLoop: 'Scout the route, execute a movement challenge, read enemy tells, claim a shortcut or hidden reward.',
    visualLanguage: 'Chunky silhouettes, high-contrast hazards, warm reward glows, and cool safe-route materials.',
    hud: 'Compact top-left health/stamina, small objective chip, input prompts near interactables only.',
    encounterObjective: 'Teach jump timing, enemy spacing, and a safe recovery platform before the reward commit.',
    spawnNotes: 'Spawn faces the first platform, hazard color, and objective silhouette.',
    threatNotes: 'Two low-threat patrols teach spacing without overlapping the first jump read.',
    rewardNotes: 'Optional cache sits above the critical path so mastery feels visible but not mandatory.',
  },
  'top-down-roguelike': {
    genre: 'top-down roguelike',
    camera: 'top-down camera with room-scale readability and clear projectile lanes',
    pillars: ['Fair pressure', 'Build discovery', 'Fast restart clarity'],
    coreLoop: 'Enter a room, parse threat lanes, spend cooldowns, loot a modifier, and choose the next risk.',
    visualLanguage: 'Crisp floor zones, shape-coded enemy roles, saturated loot rarity, and strong danger outlines.',
    hud: 'Bottom-center ability bar, compact minimap, readable cooldown rings, and inventory count chips.',
    encounterObjective: 'Teach dodge windows, projectile lanes, and a risk/reward chest before the exit door.',
    spawnNotes: 'Spawn gives a full-room read before enemies activate.',
    threatNotes: 'One charger and one ranged unit create crossing pressure with obvious counterplay.',
    rewardNotes: 'Chest offers a minor build choice and leaves the exit visible.',
  },
  'mobile-idle': {
    genre: 'mobile idle RPG',
    camera: 'portrait-friendly scene camera with large tap targets and low occlusion',
    pillars: ['One-thumb clarity', 'Reward cadence', 'Ethical progression'],
    coreLoop: 'Collect idle rewards, upgrade a visible system, start a short battle, and return to a clearer goal.',
    visualLanguage: 'Large silhouettes, rarity swatches, soft progress glow, and high-contrast callouts.',
    hud: 'Thumb-zone primary action, top resource row, bottom tabs, and no blocking modal over live progress.',
    encounterObjective: 'Teach upgrade impact, reward timing, and the next return goal in one short loop.',
    spawnNotes: 'Hero starts centered with upgrade feedback visible.',
    threatNotes: 'Low-pressure enemy wave proves the upgrade without forcing precision input.',
    rewardNotes: 'Reward burst points toward the next upgrade path without deceptive urgency.',
  },
  blank: {
    genre: 'game prototype',
    camera: 'camera plan to be defined during the first Greybox pass',
    pillars: ['Readable player intent', 'Fast playable validation', 'Production scope control'],
    coreLoop: 'Define the player verb, surface the feedback, test the fail state, and tune one value at a time.',
    visualLanguage: 'Neutral blockout palette with semantic colors for danger, reward, objective, and interactable states.',
    hud: 'Only the state needed to play the first loop; no decorative chrome before the verb is proven.',
    encounterObjective: 'Prove the core verb with one spawn, one obstacle, one threat, and one reward.',
    spawnNotes: 'Spawn should face the first readable objective.',
    threatNotes: 'Threat placeholder exists only to test counterplay and pacing.',
    rewardNotes: 'Reward placeholder closes the loop and gives the next tuning question.',
  },
};

export function normalizeInitTemplate(value: string | undefined): GameProjectInitTemplate {
  const normalized = String(value || '2d-platformer').trim().toLowerCase();
  if ((GAME_PROJECT_INIT_TEMPLATES as readonly string[]).includes(normalized)) {
    return normalized as GameProjectInitTemplate;
  }
  throw new Error(`unknown init template: ${value}. Expected one of ${GAME_PROJECT_INIT_TEMPLATES.join(', ')}`);
}

export async function initGameProject(options: InitGameProjectOptions = {}): Promise<InitGameProjectResult> {
  const cwd = path.resolve(options.cwd || process.cwd());
  const targetDir = path.resolve(cwd, options.targetDir || '.');
  const template = normalizeInitTemplate(options.template);
  const name = normalizeProjectName(options.name || inferProjectName(targetDir));
  const designer = normalizeDesignerName(options.designer);
  const definition = TEMPLATE_DEFINITIONS[template];
  const files = buildInitFiles({ name, template, designer, definition });

  await mkdir(targetDir, { recursive: true });
  if (!options.force) {
    for (const file of files) {
      if (await fileExists(path.join(targetDir, file.path))) {
        throw new Error(`${file.path} already exists. Re-run with --force to overwrite scaffold files.`);
      }
    }
  }

  const created: string[] = [];
  for (const file of files) {
    const target = path.join(targetDir, file.path);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, file.body, 'utf8');
    created.push(file.path);
  }

  return {
    targetDir,
    name,
    template,
    designer,
    created,
    nextSteps: [
      'Edit DESIGN.md and fill the project-specific blanks.',
      'Run agds from this repository or import the folder into the studio.',
      'Ask the agent for a playable vertical slice using gameplay-encounter.gameview.json as the first blockout.',
    ],
  };
}

function buildInitFiles(input: {
  name: string;
  template: GameProjectInitTemplate;
  designer: string;
  definition: TemplateDefinition;
}): Array<{ path: string; body: string }> {
  const designMd = renderDesignMd(input);
  validateGameStudioArtifactProjectFile('DESIGN.md', Buffer.from(designMd, 'utf8'));

  const gameview = `${JSON.stringify(renderGameViewport(input), null, 2)}\n`;
  validateGameStudioProjectFile('gameplay-encounter.gameview.json', Buffer.from(gameview, 'utf8'));
  validateGameStudioArtifactProjectFile('gameplay-encounter.gameview.json', Buffer.from(gameview, 'utf8'));

  const readme = renderReadme(input);
  validateGameStudioArtifactProjectFile('README.md', Buffer.from(readme, 'utf8'));

  return [
    { path: 'DESIGN.md', body: designMd },
    { path: 'gameplay-encounter.gameview.json', body: gameview },
    { path: 'README.md', body: readme },
  ];
}

export function renderDesignMd(input: {
  name: string;
  template: GameProjectInitTemplate;
  designer: string;
  definition: TemplateDefinition;
}): string {
  const { name, template, designer, definition } = input;
  return `# DESIGN.md

## Project Identity

- Name: ${name}
- Designer: ${designer}
- Genre: ${definition.genre}
- Template: ${template}
- Generator: agds init (AI-assisted scaffold; human designer owns final direction)

## Gameplay Pillars

${definition.pillars.map((pillar) => `- ${pillar}`).join('\n')}

## Core Loop

${definition.coreLoop}

## Player Verbs

- Move through the first readable space.
- Read one threat, objective, or economy signal.
- Make one clear risk/reward decision.
- Finish the loop with visible feedback and a next tuning question.

## Camera And Controls

- Camera: ${definition.camera}
- Input: keyboard/controller/touch mapping to be finalized during the first playable pass.
- Comfort: avoid surprise camera snaps, hidden collision, and critical feedback outside the player's focus.

## HUD And Feedback

${definition.hud}

Required feedback states: health, danger, reward, objective, interactable, cooldown, and fail/retry.

## Art Direction

${definition.visualLanguage}

Token placeholders:

- Danger: high-contrast warm accent with non-color shape support.
- Reward: bright value contrast plus motion or audio confirmation.
- Objective: persistent icon shape that remains readable at gameplay speed.
- Safe route: lower-saturation material or outline that does not compete with danger.

## Encounter Seed

- Objective: ${definition.encounterObjective}
- Spawn read: ${definition.spawnNotes}
- Threat read: ${definition.threatNotes}
- Reward read: ${definition.rewardNotes}

## Accessibility And Ethics

- Pair color signals with icons, shape, text, motion, or audio.
- Keep subtitles/captions available for critical audio cues.
- No deceptive urgency, dark-pattern progression, or training on player data without explicit opt-in.
- Credit human authors in shipped artifacts: \`<meta name="generator" content="Greybox + ${escapeHtmlAttribute(designer)}">\`.

## Production Notes

- Target first milestone: playable vertical slice, not a content-complete build.
- First tuning values to expose: player speed, fail-state timing, enemy health or obstacle pressure, reward cadence.
- Engine target: Unity, Unreal, or Godot after the blockout validates readability.
`;
}

function renderReadme(input: {
  name: string;
  template: GameProjectInitTemplate;
  designer: string;
  definition: TemplateDefinition;
}): string {
  return `# ${input.name}

Game project scaffolded with \`agds init\`.

## Files

- \`DESIGN.md\` - durable game direction, pillars, HUD rules, accessibility notes, and production guardrails.
- \`gameplay-encounter.gameview.json\` - first blockout for engine export and playtest simulation.

## Next Steps

1. Fill the blanks in \`DESIGN.md\`.
2. Tune the entities and beats in \`gameplay-encounter.gameview.json\`.
3. Import the folder into AI Game Design Studio and ask for a playable vertical slice.
`;
}

function renderGameViewport(input: {
  name: string;
  definition: TemplateDefinition;
}) {
  const { name, definition } = input;
  return {
    version: 1,
    kind: 'game-viewport',
    surface: 'gameplay',
    title: `${name} - First Encounter Blockout`,
    objective: definition.encounterObjective,
    camera: definition.camera,
    scale: '1 unit = 1 meter',
    layers: [
      { id: 'terrain', name: 'Terrain and traversal', type: 'terrain', visible: true },
      { id: 'encounters', name: 'Threat and pressure', type: 'combat', visible: true },
      { id: 'rewards', name: 'Rewards and objectives', type: 'reward', visible: true },
    ],
    entities: [
      {
        id: 'player-spawn',
        name: 'Player Spawn',
        type: 'player-spawn',
        x: 96,
        y: 320,
        layerId: 'encounters',
        notes: definition.spawnNotes,
      },
      {
        id: 'first-threat',
        name: 'First Readable Threat',
        type: 'enemy-spawn',
        x: 470,
        y: 270,
        w: 64,
        h: 64,
        layerId: 'encounters',
        danger: 1,
        counterplay: 'Telegraph before pressure overlaps the route.',
        notes: definition.threatNotes,
      },
      {
        id: 'loop-reward',
        name: 'Loop Reward',
        type: 'reward',
        x: 780,
        y: 310,
        w: 72,
        h: 72,
        layerId: 'rewards',
        reward: 'A visible reward that closes the first loop.',
        notes: definition.rewardNotes,
      },
    ],
    terrainZones: [
      {
        id: 'safe-read-zone',
        name: 'Safe Read Zone',
        type: 'safe-zone',
        x: 60,
        y: 250,
        w: 180,
        h: 140,
        layerId: 'terrain',
        traversal: 'Give the player enough space to understand the verb before pressure starts.',
        notes: 'Do not spawn threats behind the player in the first ten seconds.',
      },
      {
        id: 'pressure-lane',
        name: 'Pressure Lane',
        type: 'pressure',
        x: 330,
        y: 220,
        w: 260,
        h: 150,
        layerId: 'terrain',
        traversal: 'The lane creates one clean risk/reward decision.',
        cover: 'Keep at least one recovery pocket visible.',
        notes: 'Tune this lane before adding new mechanics.',
      },
    ],
    paths: [
      {
        id: 'critical-path',
        name: 'Critical Path',
        type: 'objective',
        points: [
          { x: 110, y: 330 },
          { x: 300, y: 300 },
          { x: 520, y: 310 },
          { x: 805, y: 325 },
        ],
        notes: 'The player should understand this route within five seconds.',
      },
    ],
    beats: [
      {
        id: 'beat-read',
        name: 'Read',
        timing: '0:00-0:20',
        objective: 'Player sees the route, threat, and reward.',
      },
      {
        id: 'beat-execute',
        name: 'Execute',
        timing: '0:20-1:10',
        objective: 'Player uses the core verb under light pressure.',
      },
      {
        id: 'beat-reward',
        name: 'Reward',
        timing: '1:10-1:40',
        objective: 'Reward closes the loop and points to the next tuning question.',
      },
    ],
    spatialReads: [
      {
        id: 'first-sightline',
        name: 'First Sightline',
        sightline: 'The spawn frames the objective and the first pressure lane.',
        cover: 'Recovery space remains visible before and after the threat.',
        traversalRhythm: 'Read, commit, recover, reward.',
        tensionSpacing: 'No overlapping hazards before the player has proven the verb once.',
      },
    ],
    accessibilityNotes: [
      'Do not rely on color alone for danger, reward, or objective states.',
      'Keep the first fail state short and readable.',
    ],
  };
}

function normalizeProjectName(value: string): string {
  const compact = value.trim().replace(/\s+/g, ' ');
  return compact.length > 0 ? compact.slice(0, 80) : 'Untitled Game';
}

function normalizeDesignerName(value: string | undefined): string {
  const compact = String(value || '').trim().replace(/\s+/g, ' ');
  return compact.length > 0 ? compact.slice(0, 80) : 'Human Designer';
}

function inferProjectName(targetDir: string): string {
  const base = path.basename(targetDir);
  if (!base || base === '.' || base === path.sep) return 'Untitled Game';
  return titleCase(base.replace(/[-_]+/g, ' '));
}

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

async function fileExists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
