# Game Craft References

Game-art-bible-agnostic craft knowledge. Each file is a dense rulebook on one production dimension: game feel, HUD readability, touch controls, controller/keyboard input, 2D art direction, 3D scene composition, combat, progression, economy, procedural generation, live-ops, accessibility, responsive game layouts, color, typography, state coverage, and anti-slop.

Skills opt into only the references they need; the daemon injects those sections above the active skill body. The game art bible decides *which* tokens to use; craft files decide *how* to use them for player clarity and production quality.

## Three Axes

| Axis | Scope | Example |
|---|---|---|
| `skills/` | Game artifact shape | `playable-game-prototype`, `game-hud-system`, `level-design-board` |
| `game-art-bibles/` | Game art bible and token language | `arcade-neon`, `fantasy-rpg`, `sci-fi-tactical` |
| `craft/` | Universal game craft rules | hit feedback, HUD readability, touch reach, colorblind-safe feedback |

## How A Skill Opts In

Add an `agds.craft.requires` array to the skill frontmatter:

```yaml
agds:
  craft:
    requires: [game-feel, hud-readability, controller-keyboard-input]
```

Use focused stacks:

```yaml
agds:
  craft:
    requires: [touch-controls, responsive-game-layouts, accessibility-for-games]
```

Allowed values match file names in this directory without `.md`. Unknown values fail the guard, so every skill preflight must resolve to a concrete game-production craft file before it ships.

## Files

| File | Section name | When to require |
|---|---|---|
| `game-feel.md` | `game-feel` | Playable concepts, combat, traversal, hit feedback, input response |
| `hud-readability.md` | `hud-readability` | HUDs, combat overlays, resources, minimaps, cooldowns, objectives |
| `touch-controls.md` | `touch-controls` | Mobile games, portrait/landscape control schemes, one-thumb play |
| `controller-keyboard-input.md` | `controller-keyboard-input` | Desktop/console UI, focus states, remappable controls, gamepad prompts |
| `responsive-game-layouts.md` | `responsive-game-layouts` | Cross-platform game screens, multi-device galleries, adaptive HUDs |
| `accessibility-for-games.md` | `accessibility-for-games` | Subtitles, colorblind safety, HUD scale, assists, motor/cognitive access |
| `gameplay-loop-design.md` | `gameplay-loop-design` | Core/meta loops, reward cadence, onboarding, retention, risk/reward |
| `combat-system-architecture.md` | `combat-system-architecture` | Attack timing, damage scaling, stamina/posture, enemy pressure, hit reactions |
| `level-design-patterns.md` | `level-design-patterns` | Spatial flow, sightlines, cover, objectives, encounter placement, traversal |
| `boss-design-frameworks.md` | `boss-design-frameworks` | Multi-phase bosses, tells, arena changes, recovery windows, mechanic exams |
| `encounter-design.md` | `encounter-design` | Enemy composition, arena pressure, counterplay, recovery windows, encounter telemetry |
| `dungeon-raid-architecture.md` | `dungeon-raid-architecture` | Dungeon progressions, raid wings, checkpoint logic, role coordination, reward escalation |
| `game-difficulty-director.md` | `game-difficulty-director` | Adaptive intensity, spawn/resource pressure, assists, difficulty telemetry |
| `emotional-pacing-design.md` | `emotional-pacing-design` | Tension/release, fear, mastery, attachment, relief, audio/UI support |
| `game-economy-balancing.md` | `game-economy-balancing` | Currency sinks/sources, loot odds, crafting demand, monetization ethics |
| `player-progression-systems.md` | `player-progression-systems` | XP curves, unlock cadence, skill trees, mastery, prestige, respecs |
| `multiplayer-balancing.md` | `multiplayer-balancing` | Matchmaking, roles, ranked fairness, map balance, social safety |
| `community-modding.md` | `community-modding` | UGC pipelines, mod tools, creator ecosystems, community events, moderation |
| `companion-party-systems.md` | `companion-party-systems` | Companion identity, loyalty, betrayal, squad commands, party composition, tactical synergy |
| `environmental-storytelling.md` | `environmental-storytelling` | Props, lighting, world rules, faction clues, optional discovery |
| `procedural-generation-rules.md` | `procedural-generation-rules` | Seeds, constraints, validation, fairness, content budgets, anti-exploit |
| `quest-structure-systems.md` | `quest-structure-systems` | Objective chains, branches, rewards, world-state changes, quest production dependencies |
| `mobile-game-retention.md` | `mobile-game-retention` | Short sessions, idle loops, daily/weekly goals, notifications, burnout prevention |
| `live-service-content-strategy.md` | `live-service-content-strategy` | Seasonal cadence, live events, reward tracks, healthy retention, maintenance load |
| `controller-ui-guidelines.md` | `controller-ui-guidelines` | Console/TV focus order, controller prompts, remapping, couch-distance scale |
| `game-camera-systems.md` | `game-camera-systems` | First/third/top-down/isometric cameras, occlusion, shake, comfort options |
| `animation-systems.md` | `animation-systems` | State machines, cancel windows, blend timing, clip budgets, responsiveness |
| `vfx-design.md` | `vfx-design` | Combat VFX language, status readability, effect hierarchy, performance budgets |
| `lighting-atmosphere.md` | `lighting-atmosphere` | Mood lighting, visibility, objective/danger signaling, platform lighting budgets |
| `narrative-branching-design.md` | `narrative-branching-design` | Dialogue trees, variables, quest branches, fail-forward, production merge points |
| `narrative-simulation.md` | `narrative-simulation` | Reactive dialogue, morality, faction reactions, procedural narrative fragments, continuity ledgers |
| `open-world-systems.md` | `open-world-systems` | Region density, traversal routes, faction territories, world-state simulation |
| `survival-systems.md` | `survival-systems` | Needs pressure, scarcity, shelter, crafting, inventory pressure, relief valves |
| `stealth-design.md` | `stealth-design` | Visibility, sound, AI alert states, patrols, recovery routes, stealth fairness |
| `traversal-vehicles.md` | `traversal-vehicles` | Movement verbs, vehicle roles, camera, physics, route design, accessibility |
| `genre-benchmarking.md` | `genre-benchmarking` | Genre promises, benchmark lessons, differentiation, feasible adaptation |
| `adaptive-design-scaling.md` | `adaptive-design-scaling` | Solo, indie, AA, and AAA scope variants that preserve the core fantasy |
| `production-feasibility.md` | `production-feasibility` | Team scale, milestone plans, asset budgets, vertical-slice cutlines, risk cuts |
| `telemetry-analysis.md` | `telemetry-analysis` | Drop-off, heatmaps, economy flow, session data, privacy and design responses |
| `game-design-document.md` | `game-design-document` | GDD structure, pillars, loops, systems, production scope, open decisions |
| `game-design-tokens.md` | `game-design-tokens` | Semantic game tokens for rarity, faction, biome, combat feedback, motion, camera, and audio |
| `2d-art-direction.md` | `2d-art-direction` | Sprite, tilemap, pixel art, parallax, VFX layering, 2D readability |
| `3d-scene-composition.md` | `3d-scene-composition` | Camera, depth, verticality, lighting, materials, traversal framing |
| `anti-ai-slop.md` | `anti-ai-slop` | Any visual artifact; catches generic AI aesthetics and fake polish |
| `color.md` | `color` | Palette extension, semantic feedback, rarity/danger/healing roles |
| `typography.md` | `typography` | HUD labels, menus, decks, lore, numeric readouts |
| `typography-hierarchy.md` | `typography-hierarchy` | Game pitch decks, GDDs, level boards, authored screen hierarchy |
| `typography-hierarchy-editorial.md` | `typography-hierarchy-editorial` | Long-form GDDs, lore docs, art bibles, pitch narratives |
| `animation-discipline.md` | `animation-discipline` | UI motion, transitions, feedback timing, non-distracting animation |
| `state-coverage.md` | `state-coverage` | Menus, inventories, HUD states, errors, loading, empty, win/fail |
| `accessibility-baseline.md` | `accessibility-baseline` | Generic interactive accessibility where game-specific guidance is not enough |
| `rtl-and-bidi.md` | `rtl-and-bidi` | Localized game UI, subtitles, dialogue, lore, player names |
| `interaction-system-validation.md` | `interaction-system-validation` | Only when a game surface includes account, server, matchmaking, or settings interaction systems |
| `player-experience-heuristics.md` | `player-experience-heuristics` | Cognitive-load decisions for menus, onboarding, tutorials, inventories, and choices |

## Enforcement Levels

- **Auto-checked:** rules wired into `apps/daemon/src/lint-artifact.ts`.
- **Guidance:** rules read by the agent and reviewers.

Most game craft is guidance because game feel, encounter pacing, and readability require judgment. Promote a rule into the linter only when it can be checked reliably without punishing valid genre choices.

## Attribution

Some foundational craft material is adapted from the MIT-licensed [refero_skill](https://github.com/referodesign/refero_skill) project, with changes for game-design artifacts and AI Game Design Studio's token language.
