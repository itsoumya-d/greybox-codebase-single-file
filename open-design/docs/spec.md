# AI Game Design Studio — Studio Spec

**Status:** Game-platform refactor · 2026-05-11
**Scope:** Studio definition, core workflows, game-domain schemas, agent responsibilities, and non-goals.

Other docs:
- Architecture → [`architecture.md`](architecture.md)
- Skills protocol → [`skills-protocol.md`](skills-protocol.md)
- Agent adapters → [`agent-adapters.md`](agent-adapters.md)
- Modes → [`modes.md`](modes.md)
- References & credits → [`references.md`](references.md)
- Roadmap → [`roadmap.md`](roadmap.md)

## Studio In One Sentence

> A local-first AI game design studio that turns natural-language game briefs into playable concepts, game systems, level boards, HUDs, art bibles, pitch/GDD decks, media prompts, live-ops artifacts, and production plans by orchestrating the coding agent already installed on the creator's machine.

AI Game Design Studio rejects the legacy non-game builder identity. It is a game-design operating system for mobile, desktop, browser, 2D, 3D, multiplayer, narrative, casual, competitive, live-service, indie, and stylized or realistic game worlds.

## Core Bets

| # | Bet | Consequence |
|---|---|---|
| 1 | **Game design is the studio identity** | Every prompt, skill, template, and UI label must speak in game terms: player, scene, level, gameplay loop, HUD, art bible, game systems, world, encounter, progression. |
| 2 | **The agent behaves like a studio** | The prompt stack coordinates game director, mechanics, level, narrative, economy, multiplayer, UI/HUD, art, audio, live-ops, and technical game systems perspectives. |
| 3 | **Playable beats static** | A greybox with input, feedback, and a visible loop is better than a polished but non-playable mockup. |
| 4 | **Game art bibles are durable context** | `DESIGN.md` files carry game identity, palette, HUD posture, motion/audio tokens, and do/don't rules across every artifact. |
| 5 | **Skills are game production recipes** | A skill is a reusable workflow for a game artifact, not a generic business template. |
| 6 | **Local-first agent runtime** | Creators keep their files, keys, and chosen coding agent. The daemon brokers project files, skills, previews, and exports. |

## Target Creators

- Indie and solo game developers who need help shaping playable concepts, GDDs, HUDs, levels, and production plans.
- Game designers who want fast concept iteration without losing genre, player fantasy, or balance logic.
- Narrative designers and worldbuilders who need lore, factions, quest arcs, dialogue branches, and consistency memory.
- UI/HUD designers who need game-specific readability across touch, controller, keyboard/mouse, ultrawide, and accessibility states.
- Technical designers who need engine-aware systems specs for Unity, Unreal, Godot, custom engines, and WebGL.
- Live-ops and systems teams planning retention, economy health, event cadence, content rotation, and ethical monetization.

## Primary Scenarios

### S1 — Playable Concept
Creator asks for a mobile roguelike. AI Game Design Studio asks for genre, camera, platform, loop, controls, art direction, and constraints. The agent produces a playable HTML concept with menu, gameplay, HUD, pickup/enemy interactions, pause, win/fail states, and touch/keyboard input.

### S2 — Game Systems Package
Creator asks for "survival + extraction shooter with light RPG progression." AI Game Design Studio evaluates the fusion, defines pillars, core/meta loop, combat module, extraction economy, loot pressure, progression, risk/reward, multiplayer fairness, and production risks.

### S3 — Level / Encounter Board
Creator asks for a boss arena. AI Game Design Studio produces a spatial board with player spawn, boss phases, cover, hazards, safe windows, pressure windows, rewards, checkpoints, camera notes, readability notes, and iteration risks.

### S4 — Game Pitch / GDD Deck
Creator asks for an investor or internal pre-production deck. AI Game Design Studio routes to `game-pitch-deck` and covers fantasy, audience, pillars, loop, systems, market fit, art direction, production scope, roadmap, team risks, and vertical slice.

### S5 — Game Art Bible
Creator uploads references or chooses a style. AI Game Design Studio produces a reusable game art bible with palette, typography, HUD density, faction/biome/rarity colors, material and lighting posture, VFX language, motion/audio tokens, and agent prompt rules.

### S6 — Live Game Artifact
Creator asks for a balance tracker, live-ops calendar, loot table tuner, QA status board, or economy report. AI Game Design Studio creates a refreshable artifact with honest data provenance and connector-aware sourcing.

## Game-Domain Data Model

Project metadata can preserve game memory across turns:

- `gameWorld`
- `faction`
- `enemyType`
- `itemRarity`
- `skillTree`
- `progressionCurve`
- `questArc`
- `gameplayLoop`
- `biome`
- `combatStyle`
- `characterClass`
- `craftingRecipe`
- `lootTable`
- `weaponSystem`
- `missionFlow`
- `dungeonLayout`
- `dialogueBranch`
- `bossPhase`
- `economySystem`
- `multiplayerMode`
- `liveOpsPlan`
- `accessibilityRequirement`
- `technicalConstraint`

The schema is intentionally metadata-first: every agent turn can read and preserve this state without requiring a heavyweight game database before the studio has editors for each entity.

## High-Level Modules

```text
Studio frontend
  chat · game project list · examples · art bibles · file workspace · preview · exports
        │
        ▼
Local daemon
  agent detection · game skill registry · game art bible resolver · craft injection
  project store · live game artifacts · media dispatcher · artifact previews
        │
        ▼
Creator's coding agent CLI / BYOK API
  reads skills + project files · writes playable/game-design artifacts
```

## Non-Goals

- Legacy generic non-game business, storefront, account-gate, or back-office generation.
- Recreating copyrighted game UI, maps, branded characters, or proprietary art direction.
- Replacing Unity, Unreal, Godot, Blender, FMOD/Wwise, Jira, or a source-control workflow.
- Shipping manipulative monetization or engagement loops by default.
- Pretending seeded/sample live-artifact data is connected to real telemetry.

## Success Criteria

- A creator can create a playable game concept in under 5 minutes from a one-line brief.
- The default catalog exposes game-native skills, not generic non-game builder skills.
- The base prompt always reasons about gameplay loop, player experience, platform, accessibility, game feel, and production feasibility.
- A game art bible can drive consistent HUDs, levels, decks, key art, and trailer/audio prompts across a project.
- Legacy non-game skill ids resolve to game-native replacements rather than surfacing as selectable workflows.
- Outputs feel like pre-production material from a professional game studio, not generic interface mockups.
