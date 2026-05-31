# Game Design Modes

**Parent:** [`spec.md`](spec.md) · **Siblings:** [`architecture.md`](architecture.md) · [`skills-protocol.md`](skills-protocol.md) · [`agent-adapters.md`](agent-adapters.md)

AI Game Design Studio exposes modes that map to professional game-studio deliverables. Modes are not arbitrary UI tabs; each one changes the expected reasoning, default skill, export path, and self-check rubric.

| Mode | What you get | Default skill | Primary question |
|---|---|---|---|
| **Playable Concept** | A playable HTML game loop, HUD, input, feedback, and win/fail/progress states | `playable-game-prototype` | "Can the player do the core verb yet?" |
| **Mobile Game Flow** | Portrait/landscape game-screen journey with touch controls, menu, gameplay, pause, results, and progression | `mobile-game-flow` | "Does this work in the player's hand?" |
| **Desktop Game UI** | Main menu, HUD, inventory, map, settings, loadout, quest, scoreboard, or lobby screens | `desktop-game-ui` | "Can a keyboard/mouse or controller player read and act?" |
| **HUD System** | Resource bars, minimap, quest tracker, cooldowns, boss bars, combat feedback, and accessibility states | `game-hud-system` | "Is gameplay-critical state readable at speed?" |
| **Level Design Board** | Map, objective path, encounter beats, hazards, pickups, gates, spawns, pacing, and camera notes | `level-design-board` | "How does the level play?" |
| **Game Pitch / GDD Deck** | Multi-slide pitch, GDD, vertical-slice plan, production roadmap, or systems presentation | `game-pitch-deck` | "Can a team understand and build this game?" |
| **Game Art Bible** | `DESIGN.md`-style game art direction, tokens, UI posture, mood, and sample preview | `game-art-bible` | "What visual rules keep the game coherent?" |
| **Game Asset Image** | Key art, concept art, HUD sheet, character/weapon/prop sheet, map, splash, or loading image prompt | `game-key-art` | "What should the asset communicate before production?" |
| **Game Trailer / Motion** | Trailer beat sheet, title reveal, HUD motion, gameplay callouts, progression animation, or HyperFrames render | `game-trailer-motion` | "What motion sells the fantasy and mechanic?" |
| **Game Audio Kit** | Adaptive music, ambient soundscape, combat SFX, UI cues, voice-over, or trailer audio prompt | `game-audio-kit` | "What does the game feel like when heard?" |
| **Live Game Artifact** | Live-ops console, balance telemetry, economy tuning board, event calendar, QA tracker, or production status | `live-artifact` | "What game data should remain refreshable?" |

Modes compose: Game Art Bible first, then playable concept or HUD, then level board, then pitch/GDD, then asset/trailer/audio. A good project can move through all of them without changing game identity.

## Playable Concept

Purpose: prove the loop. The artifact should include input, a visible objective, resources/progress, feedback, pause/restart, and success/failure/progress states.

The agent must reason about genre, player fantasy, controls, camera, core loop, game feel, difficulty, accessibility, and platform constraints before writing HTML. A greybox with a real loop is preferred over a polished static mockup.

Expected outputs:
- `index.html` with a playable or stateful loop.
- Optional supporting JS/CSS/assets if the skill seed calls for it.
- A small tuning panel when it helps playtesting.

P0 failures:
- The player cannot act.
- HUD does not show objective/resources/progress.
- Feedback is decorative instead of tied to input.
- Mobile touch or desktop keyboard/controller path is missing when requested.

## Game UI / HUD Modes

Purpose: design game screens players actually use. This includes main menus, pause, settings, inventories, crafting, loadouts, maps, quest logs, dialogue, lobbies, scoreboards, spectator overlays, and combat HUDs.

The agent must preserve action space, stable HUD zones, tabular numerics, focus/selection states, input hints, colorblind-safe feedback, readable scaling, and pause accessibility.

Do not use generic business tables, sales cards, back-office sidebars, account-gate interactions, or business control boards. If a data-heavy surface is needed, frame it as a game control center, live-ops view, telemetry console, economy tuner, or production board.

## Level Design Board

Purpose: show how a scene or level plays. A level board must include spatial flow, objective path, player spawn, enemy spawns, hazards, traversal routes, cover, chokepoints, sightlines, stealth routes, checkpoints, hidden areas, rewards, scripted events, and pacing beats when relevant.

The board is not decorative cartography. It should answer:
- Where does the player learn, choose, fail, recover, and win?
- What is optional versus critical path?
- Where are pressure windows and recovery windows?
- How do camera, verticality, visibility, and encounter composition support the fantasy?

## Game Pitch / GDD Deck

Purpose: align a team or stakeholder around the game. Decks should cover fantasy, audience, pillars, genre fit, references, core loop, meta loop, controls, platform, systems, levels/scenes, UI/HUD, art direction, audio direction, production scope, roadmap, risks, and next milestone.

The deck framework owns navigation, scaling, counter, keyboard support, and print/PDF behavior. Skills fill content; they do not reinvent the framework.

## Game Art Bible

Purpose: create a reusable game art direction. A game art bible is a `DESIGN.md` file that downstream skills consume as authoritative context.

It should include:
- art direction, camera and composition posture;
- faction, biome, danger, rarity, healing, objective, and status-effect color roles;
- typography for title, HUD, body, lore, numbers, and controller hints;
- HUD/menu/gameplay-module patterns;
- motion tokens such as hitstop, recoil, shake, transition, loot-drop, and boss-intro profiles when useful;
- audio tokens such as combat intensity, ambient zone, rarity cue, and danger alert language when useful;
- do/don't rules that protect genre identity and player readability.

## Media Modes

Image, video, and audio modes generate game assets, not generic promotional media.

Image priorities:
- concept art, key art, game splash screens, environments, characters, weapons, props, bosses, maps, UI mockups, HUD sheets, progression trees, tactical overlays, and loading screens.

Video priorities:
- game trailer beats, cinematic shots, gameplay callouts, title reveals, HUD motion, boss intro, ability showcase, progression animation, and live-ops announcement motion.

Audio priorities:
- adaptive music layers, ambient zones, combat SFX, UI cues, rarity audio, voice-over direction, trailer stingers, and accessibility alternatives.

## Live Game Artifacts

Purpose: data-backed artifacts that stay useful after first render.

Good live game artifacts include:
- live-ops event calendar;
- economy sink/source monitor;
- loot-table tuning board;
- PvP balance snapshot;
- quest-production tracker;
- bug/QA triage board;
- retention cohort mock;
- build milestone status;
- content dependency map.

They must be honest about data provenance. If connector data is unavailable, label sample values as seeded and do not imply live sync.
