# Game Studio Roadmap

**Parent:** [`spec.md`](spec.md) · **Siblings:** [`architecture.md`](architecture.md) · [`skills-protocol.md`](skills-protocol.md) · [`agent-adapters.md`](agent-adapters.md) · [`modes.md`](modes.md)

This roadmap tracks the migration from artifact generator to AI-native game design operating system. The north star is simple: every shipped workflow should help a designer plan, make playable concepts, balance, visualize, or produce a game.

---

## Phase 0 — Game Identity Lock

**Goal:** remove old generator assumptions and make the prompt stack behave like a compact game studio.

**Deliverables:**
- [x] Game-native `README.md`, [`docs/spec.md`](spec.md), [`docs/modes.md`](modes.md), and skill protocol docs.
- [x] Official prompts recast around Game Director, Gameplay Mechanics, Level Design, Narrative, Economy, Multiplayer, HUD, Art, Audio, Live Ops, and Technical Game Systems agents.
- [x] Game design metadata on project records for worlds, factions, loops, quests, enemies, items, skill trees, economies, missions, dungeons, dialogue, bosses, multiplayer modes, live-ops plans, accessibility, and technical constraints.
- [x] Featured skill catalog limited to game-native workflows, with legacy ids redirected for compatibility.
- [ ] Finish localized copy migration for non-English catalogs.
- [x] Add shared schemas for game skill frontmatter, game art bibles, game memory entities, and studio JSON documents.

**Exit criteria:** a new creator never sees generic non-game workflows in the default picker, prompt seed, or onboarding path.

---

## Phase 1 — Playable Game Design MVP

**Goal:** a solo designer can turn a brief into a playable concept, HUD, level board, pitch deck, art bible, and production checklist.

**Included:**
- Studio workspace with chat, file tree, sandboxed preview, export menu, skill picker, game art bible picker, and game-first discovery flow.
- Local daemon with game skill registry, artifact persistence, game metadata rendering, and prompt composition.
- Agent adapters for the most common coding CLIs plus OpenAI-compatible BYOK fallback.
- Core game skills:
  - `playable-game-prototype`
  - `mobile-game-flow`
  - `desktop-game-ui`
  - `game-hud-system`
  - `level-design-board`
  - `game-art-bible`
  - `game-pitch-deck`
  - `game-key-art`
  - `game-trailer-motion`
  - `game-audio-kit`
- Featured game art bibles:
  - Arcade Neon
  - Fantasy RPG
  - Sci-Fi Tactical
  - Cozy Casual
  - Pixel Retro
  - Horror Survival
  - Sports Broadcast
  - Stylized 3D

**Exit criteria:**
1. A creator can generate a playable HTML concept with input, game loop, HUD, feedback, failure/restart, and victory/progression state.
2. A creator can generate a GDD-style pitch deck covering fantasy, pillars, loop, audience, progression, art direction, production scope, and roadmap.
3. A creator can generate a level board with spawn points, encounter beats, traversal, hazards, rewards, checkpoints, camera notes, and pacing risks.
4. The output critique flags game feel, readability, onboarding, pacing, production feasibility, and accessibility issues.

---

## Phase 2 — Systems, Balance, And Worldbuilding

**Goal:** support deeper pre-production work for complete game systems rather than one-off screens.

**Scope:**
- Gameplay-loop analyzer for core loop, session loop, meta loop, replayability, and retention cadence.
- Encounter designer for ambushes, boss phases, stealth spaces, survival waves, co-op mechanics, and cinematic fights.
- Economy and progression planner with XP curves, rarity tiers, loot tables, currencies, crafting, battle pass structures, and inflation checks.
- Narrative system tools for quest arcs, factions, dialogue branches, lore consistency, morality systems, companions, and cinematic scene planning.
- 3D scene planning helpers for world scale, camera framing, traversal, verticality, sightlines, cover, chokepoints, hidden areas, and environmental storytelling density.
- Procedural generation briefs for dungeons, biomes, encounters, loot, quests, mutations, and dynamic events.

**Exit criteria:** a project can maintain coherent game memory across worlds, factions, loops, quests, economies, visual identity, and level structures.

---

## Phase 3 — Production Studio Layer

**Goal:** make the platform useful for teams moving from concept to vertical slice.

**Scope:**
- Milestone plans for playable concept, vertical slice, alpha, beta, launch, and live operations.
- Sprint-ready breakdowns for gameplay, level, art, audio, UI/HUD, narrative, tech, QA, and publishing tracks.
- Engine-aware output modes for Unreal Engine, Unity, Godot, custom engines, and WebGL.
- Asset pipeline planning for 3D sculpt/retopo/bake/LOD/rigging and 2D sprite/tilemap/parallax/VFX workflows.
- Export bundles for GDDs, combat specs, level docs, narrative trees, economy sheets, art direction guides, HUD boards, gameplay wireframes, concept collections, and live-ops roadmaps.

**Exit criteria:** the tool can generate a vertical-slice plan that is useful to designers, artists, engineers, producers, and QA.

---

## Phase 4 — Live Game Intelligence

**Goal:** support game tuning after a concept becomes a running project.

**Scope:**
- Live-ops event planning, seasonal calendars, content rotations, patch-note drafts, and retention strategy.
- Balance-review artifacts for damage curves, encounter pressure, economy sinks, class roles, matchmaking, and ranked health.
- Ethical monetization checks for gacha, battle passes, cosmetics, boosts, time gates, burnout risk, and player trust.
- Accessibility audits for subtitles, colorblind modes, HUD scaling, remappable controls, motor assists, cognitive load, and audio alternatives.

**Exit criteria:** the platform critiques live content with the same seriousness it brings to creative direction.

---

## Risk Register

| Risk | Impact | Mitigation |
|---|---|---|
| Legacy folders imply old behavior | contributors add non-game workflows | hide legacy ids from picker, route aliases to game skills, document compatibility clearly |
| Playable concepts become visual mockups only | weak game-studio identity | enforce input, feedback, state, objective, and restart gates in skill checklists |
| Game scope grows beyond indie feasibility | unusable plans | Game Director and Technical Game Systems prompts must call out scope, budgets, and production risk |
| Genre fusion becomes incoherent | shallow designs | require pillars, player fantasy, loop compatibility, and audience fit before adding mechanics |
| Live-ops planning becomes exploitative | trust loss | bake in ethical monetization, burnout prevention, and accessibility checks |

---

## Decision Log

- 2026-05-11 — Recast default identity as AI Game Design Studio. *Why:* the platform must generate game systems, not generic non-game surfaces.
- 2026-05-11 — Keep legacy skill folders as compatibility fallbacks but remove them from featured catalog. *Why:* old projects still open, new creators see game workflows.
- 2026-05-11 — Add `gameDesign` metadata to project records. *Why:* long-running projects need memory for loops, worlds, factions, economies, quests, and technical constraints.
- 2026-05-11 — Treat `DESIGN.md` as a game art bible. *Why:* game outputs need art direction, gameplay readability, feedback language, and mood consistency.
