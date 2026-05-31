# Game Skills Protocol

**Parent:** [`spec.md`](spec.md) · **Siblings:** [`skills-contributing.md`](skills-contributing.md) · [`architecture.md`](architecture.md) · [`agent-adapters.md`](agent-adapters.md) · [`modes.md`](modes.md)

A **Skill** is the atomic unit of game-design capability in AI Game Design Studio. A skill is a folder with a `SKILL.md` manifest plus optional templates, layouts, checklists, examples, and references. The daemon reads the manifest, injects the active game art bible and craft references, and asks the agent to follow the skill workflow.

Skills must produce game-design artifacts: playable concepts, HUD systems, level boards, GDD decks, art bibles, key art prompts, trailer boards, audio kits, live-ops artifacts, economy specs, encounter breakdowns, or production plans. Generic non-game builder skills are treated as legacy redirects and should resolve to game-native replacements.

## Base Folder Shape

```text
skills/<skill-id>/
├── SKILL.md
├── example.html                 # required for HTML/JS previews
├── assets/
│   └── template.html            # optional seed copied or adapted by the agent
└── references/
    ├── layouts.md               # optional paste-ready game layouts/game screens/slides
    ├── gameplay-modules.md      # optional gameplay/HUD modules
    └── checklist.md             # P0/P1/P2 gates before shipping
```

## Frontmatter

```yaml
---
name: playable-game-prototype
description: |
  Playable HTML game concept with a real loop, input, HUD, feedback,
  and win/fail/progress state.
triggers:
  - playable game
  - playable concept
  - browser game

agds:
  mode: prototype                # prototype | deck | template | game-art-bible | image | video | audio
  surface: web                   # web | image | video | audio
  platform: mobile               # desktop | mobile
  scenario: gameplay             # gameplay | hud | menu | level | character | world | pitch | asset | audio | trailer | systems | live
  featured: 1
  default_for: prototype
  preview:
    type: html                   # html | jsx | markdown | image | video | audio
    entry: index.html
  game_art_bible:
    requires: true               # inject active game art bible / DESIGN.md
  craft:
    requires: [game-feel, hud-readability, touch-controls]
  game:
    genre: roguelike
    camera: top-down
    input: keyboard/touch
    platform: responsive web game
    rendering: canvas2d          # dom | canvas2d | threejs | phaser | static-html
  example_prompt: "Build a playable mobile roguelike dungeon crawler..."
---
```

## Required Game Semantics

Every game skill should make its domain explicit.

Playable skills define:
- genre and fantasy;
- camera/view;
- controls/input;
- core loop;
- state list;
- HUD zones;
- feedback and game-feel checks;
- success/failure/progress states.

HUD/menu skills define:
- player resources;
- objective hierarchy;
- combat or decision speed;
- input affordances;
- accessibility states;
- mobile/desktop/controller variants.

Level/encounter skills define:
- objective path;
- player and enemy spawns;
- traversal routes;
- hazards, cover, sightlines, gates, checkpoints, rewards;
- pressure/recovery pacing;
- camera and readability notes.

Pitch/GDD skills define:
- pillars;
- audience and fantasy;
- core loop and meta loop;
- progression/economy/narrative/multiplayer/art/audio/technical sections;
- production scope, roadmap, risks, and vertical slice.

Media skills define:
- asset type and use context;
- camera/lens/framing;
- silhouette/material/VFX/audio language;
- game-specific constraints and references;
- explicit avoidance of generic marketing.

## `agds.mode`

| Mode | Use for |
|---|---|
| `prototype` | Playable game concepts, HUD kits, menus, level boards, interactive game UI |
| `deck` | Game pitch decks, GDDs, production decks, system presentations |
| `template` | Reusable game templates the agent populates or adapts |
| `game-art-bible` | Game art bibles / `DESIGN.md` generation |
| `image` | Key art, concept art, HUD sheets, maps, item/weapon/character sheets |
| `video` | Trailer beats, gameplay callouts, title reveals, motion graphics |
| `audio` | Music, SFX, ambient zones, UI sounds, voice-over, trailer audio |

## `agds.scenario`

Use the game vocabulary below so filters stay coherent:

- `gameplay`
- `hud`
- `menu`
- `level`
- `character`
- `world`
- `pitch`
- `asset`
- `audio`
- `trailer`
- `systems`
- `live`

Legacy scenario names such as `marketing`, `finance`, `sales`, `dashboard`, `product`, and `operations` are compatibility aliases only. New skills should not use them.

## Game Art Bible Context

The active `DESIGN.md` is a game art bible. It can describe palette, typography, HUD density, faction/biome/rarity colors, motion tokens, audio tokens, HUD modules, level mood, material language, and do/don't rules.

When `agds.game_art_bible.requires: true`, the prompt composer injects the art bible above the skill body. Skills should bind its tokens before inventing new ones. If a new semantic token is needed, name it in game terms: `danger`, `healing`, `rarity_epic`, `faction_rebel`, `biome_swamp`, `cooldown_ready`, `objective_primary`, etc.

## Craft References

`agds.craft.requires` lists files under [`craft/`](../craft/). Use them to add universal game craft:

```yaml
agds:
  craft:
    requires: [game-feel, hud-readability, accessibility-for-games]
```

Craft references are injected between the art bible and the skill body. The art bible wins for token values; craft wins for player-readability and production-quality rules not covered by the art bible.

## Side Files

Skills with `assets/template.html` and `references/*.md` should instruct the agent to read files in this order:

1. `assets/template.html`
2. `references/layouts.md`
3. `references/gameplay-modules.md`
4. `references/checklist.md`

The daemon prepends a skill-root preamble so relative side-file paths resolve inside the active project. The seed template and checklist are load-bearing. Do not ask the agent to write a complex game artifact from scratch when a skill seed exists.

## P0 Checklist Requirements

Every game skill should ship a `references/checklist.md` or inline P0 section. P0 gates are hard blockers before artifact emission.

Examples:
- playable concept has input, loop, HUD, feedback, pause/restart, and win/fail/progress;
- HUD keeps health/resources/objective readable and does not cover action center;
- level board explains how the space plays, not only how it looks;
- GDD deck covers pillars, loop, systems, scope, risks, and next milestone;
- media prompt specifies asset use context, silhouette/framing, and game art direction.

## Retired Skill IDs

Legacy skill folders are removed from the repository. The daemon no longer
redirects removed app, web, business, or generic media skill ids into active
game skills; `SKILL_ID_ALIASES` is intentionally empty and guard-checked so
retired ids fail closed instead of becoming hidden generation modes.

Rules:
- Do not add new generic non-game builder skills.
- Do not surface legacy skills in the catalog.
- Do not reintroduce legacy folders on disk.
- Do not add skill-id redirects unless maintainers explicitly accept and
  document a narrow migration shim.
- Stored projects should move to canonical game skill ids; new projects must
  route through game skills.

## Merge Bar

A new skill is mergeable when:
- its name, description, triggers, example prompt, and body are game-specific;
- it has no non-game or default-business behavior;
- the example renders from disk and demonstrates the intended game artifact;
- the checklist has P0 gates tied to gameplay, player clarity, production feasibility, or game media quality;
- localization fallback ids are added where required;
- tests or snapshots are updated for any catalog behavior change.
