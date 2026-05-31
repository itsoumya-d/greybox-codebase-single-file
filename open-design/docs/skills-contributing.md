# Contributing A Game Skill

**Parent:** [`spec.md`](spec.md) · **Siblings:** [`skills-protocol.md`](skills-protocol.md) · [`architecture.md`](architecture.md) · [`modes.md`](modes.md)

A skill is a reusable game-production recipe. It should help the agent create a specific kind of game artifact: playable concept, HUD system, mobile game flow, desktop game UI, level board, game pitch/GDD deck, art bible, key art, trailer motion, audio kit, live-ops board, economy/progression plan, encounter breakdown, or production roadmap.

Do not contribute generic non-game builder, business-report, storefront, account-gate, or back-office skills. Legacy ids are redirected for compatibility; new work must be game-native.

## Quick Path

```bash
git clone git@github.com:<your-username>/ai-game-design-studio.git
cd ai-game-design-studio
git checkout -b skill/<your-game-skill>
corepack enable
pnpm install
cp -r skills/playable-game-prototype skills/<your-game-skill>
# edit SKILL.md, example.html, assets/, references/
pnpm tools-dev run web
```

Open the printed web URL, create a project, run the skill's `example_prompt`, and verify the artifact renders and passes its checklist.

## What Fits

Good skills:
- "Playable top-down roguelike concept with HUD, enemies, pickups, pause, and win/fail."
- "Fantasy action RPG HUD kit with boss bar, cooldowns, minimap, quest tracker, and mobile touch variant."
- "Level design board for a stealth mission with sightlines, cover, patrol routes, hazards, rewards, and camera notes."
- "Game pitch deck covering pillars, loop, audience, systems, art direction, scope, roadmap, and risks."
- "Game art bible from references with palette, typography, HUD posture, faction/biome colors, motion/audio tokens."
- "Trailer motion board for a cyberpunk racer with shot beats, UI callouts, and title reveal."

Poor fits:
- forbidden legacy surfaces: generic marketing entries, docs surfaces, sales funnels, account gates, back-office tables, or purchase-finalization flows;
- one-off campaign or sponsor bundle;
- vendor SDK wrapper or API integration;
- static screenshot/video dumped into `assets/` with no generative workflow;
- a near-duplicate of an existing game skill.

## Folder Shape

```text
skills/<your-game-skill>/
├── SKILL.md
├── example.html
├── assets/
│   └── template.html
└── references/
    ├── layouts.md
    ├── gameplay-modules.md
    └── checklist.md
```

## Frontmatter Checklist

```yaml
---
name: your-game-skill
description: |
  One concrete paragraph: artifact type, game domain, platform, and what
  the output includes.
triggers:
  - "combat HUD"
  - "boss encounter"
  - "mobile idle RPG flow"

agds:
  mode: prototype
  surface: web
  platform: desktop
  scenario: hud
  featured: 6
  preview:
    type: html
    entry: example.html
  game_art_bible:
    requires: true
  craft:
    requires: [hud-readability, accessibility-for-games]
  game:
    genre: action RPG
    camera: third-person
    input: keyboard/mouse/gamepad
    platform: desktop
    rendering: dom
  example_prompt: "Create a third-person action RPG HUD..."
---
```

Use `scenario` values from the game vocabulary: `gameplay`, `hud`, `menu`, `level`, `character`, `world`, `pitch`, `asset`, `audio`, `trailer`, `systems`, `live`.

## Required Body Content

A strong `SKILL.md` body includes:
- when to use the skill;
- required game questions or assumptions;
- step-by-step workflow;
- expected files;
- game-specific gameplay modules, HUD states, and system states;
- P0 gates or a pointer to `references/checklist.md`;
- anti-slop rules;
- artifact handoff instructions only if the skill has special needs.

For playable/game UI skills, name concrete states: main menu, gameplay, pause, inventory, map, quest, dialogue, win/fail/results, settings, multiplayer lobby, scoreboard, loadout, live-ops event, etc.

For systems skills, name concrete systems: core loop, meta loop, XP, currency, loot table, rarity, crafting, skill tree, combat style, enemy archetype, boss phase, mission flow, quest arc, faction reputation, multiplayer mode, retention loop, accessibility plan.

## Example Quality Bar

`example.html` should:
- open directly from disk;
- look like a game artifact, not a business UI;
- contain real game labels, stats, verbs, resources, or spatial beats;
- avoid lorem ipsum, fake business metrics, generic emoji icons, purple-gradient sludge, and decorative cards with no gameplay role;
- show at least one meaningful state or interaction if the skill is interactive;
- remain readable on the target platform.

## Checklist Bar

`references/checklist.md` should include P0 gates that can fail the artifact:
- playable loop exists;
- HUD state is readable at speed;
- touch/controller/keyboard path works when requested;
- accessibility states are represented;
- level board explains objective path, encounters, hazards, and rewards;
- deck covers pillars, loop, systems, scope, and risks;
- art/media prompt names silhouette, material, camera, mood, and use context.

## i18n Coverage

Every committed skill id must be represented in localized content metadata or fallback arrays. Add the id to the fallback arrays for DE/FR/RU unless you are also adding full localized display copy.

Run:

```bash
pnpm --filter @ai-game-design-studio/web test
pnpm --filter @ai-game-design-studio/daemon test
```

## Review Rejections

Expect a revision request if:
- the skill can still be read as an old non-game builder workflow;
- it has no gameplay, player, level, HUD, art, audio, economy, narrative, or production reasoning;
- it lacks a P0 checklist;
- the example is a static mockup for an artifact that should be playable/stateful;
- the prompt encourages copied IP instead of original game direction;
- the output would create manipulative monetization by default.
