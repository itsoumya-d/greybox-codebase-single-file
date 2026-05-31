# References

**Parent:** [`spec.md`](spec.md)

This file tracks external projects and production traditions that shape AI Game Design Studio. Each reference is included because it strengthens the platform as a game-design operating system, not because the studio is trying to clone another interface.

---

## Primary References

### Game Engine Editors

- **Unreal Engine** — reference for viewport-first workflows, Blueprint-style logic, cinematic sequencing, production-grade lighting language, and engine-aware constraints such as Nanite/Lumen-style budget thinking.
- **Unity** — reference for cross-platform game production, componentized scenes, inspector-driven editing, prefabs, mobile optimization, and rapid iteration loops.
- **Godot** — reference for indie-friendly scope, lightweight scene trees, open-source workflows, and approachable scripting.
- **Blender / Houdini** — reference for scene hierarchy, node graphs, procedural thinking, animation/VFX previews, and production-tool density.

### Game Design Documentation

- **Game Design Document practice** — reference for pillars, fantasy, gameplay loops, controls, camera, progression, encounters, onboarding, accessibility, production risks, and milestone planning.
- **Level design blockout practice** — reference for traversal routes, sightlines, encounter pacing, chokepoints, verticality, objectives, checkpoints, and environmental storytelling.
- **Systems design spreadsheets** — reference for economy curves, damage scaling, loot tables, rarity pacing, live-ops calendars, and difficulty tuning.
- **Narrative design bibles** — reference for lore consistency, factions, quest arcs, branching dialogue, companion relationships, and cinematic beats.

### Game UI and Player Experience

- **Console and PC game HUD conventions** — reference for health, stamina, ammo, minimaps, ability cooldowns, boss bars, quest trackers, inventory, radial menus, controller navigation, and readable combat feedback.
- **Mobile game control patterns** — reference for one-thumb layouts, touch controls, session pacing, battery-conscious rendering, safe areas, haptics, and portrait/landscape adaptation.
- **Competitive game readability** — reference for spectator clarity, role clarity, color-safe feedback, reticle readability, scoreboards, ranked flows, and anti-frustration systems.

### Local Agent Architecture

- [**`multica-ai/multica`**][multica] — reference for detecting local coding agents, separating a privileged local daemon from a browser client, streaming work progress, and treating agents as teammates.
- [**`farion1231/cc-switch`**][ccsw] — reference for multi-agent local configuration, skill-folder organization, and coexisting with existing CLI tools without taking over their config.
- [**`OpenCoworkAI/open-codesign`**][ocod] — reference for artifact streaming, iframe preview, live tool progress, interruptible generation, and multi-format export patterns. AI Game Design Studio adapts those interaction ideas into game-native prompts, skills, schemas, and workspace surfaces.

### Portable Skill and Art-Bible Formats

- [Claude Code skills][skill] — source of the `SKILL.md` folder convention used by the game skill registry.
- [`VoltAgent/awesome-design-md`][acd2] — source of the portable `DESIGN.md` idea; AI Game Design Studio retunes this into game art bibles for genres, biomes, HUDs, rarity colors, lighting, materials, shape language, VFX, and accessibility rules.

---

## Differentiation Matrix

| Dimension | AI Game Design Studio |
|---|---|
| Core domain | Game design, game systems, worlds, scenes, HUDs, art direction, production packaging |
| Runtime model | Browser studio + local Node daemon |
| Agent model | Delegates to existing coding-agent CLIs and BYOK providers |
| Default workflow | Prompt → discovery brief → genre analysis → pillars → loop → scene/world/system plan → artifact |
| Durable memory | SQLite project metadata plus normalized `game_entities` |
| Visual surface | Viewport-first studio shell with file workspace, previews, game document renderers, node graphs, behavior trees, world maps, and production boards |
| Skill format | File-based `SKILL.md` folders with game-native frontmatter and references |
| Art direction | `DESIGN.md` game art bibles, not generic visual-identity presets |
| Export targets | Playable concepts, GDDs, level boards, HUD specs, economy sheets, narrative trees, production packages, key art prompts, trailers, and audio kits |

---

## What We Deliberately Avoid

- Generic business artifact defaults.
- Non-game template catalogs.
- Prompt language that optimizes for web pages instead of playable scenes.
- Bundled model routing that competes with the creator's existing coding agent.
- Hidden production assumptions that make solo or indie scope impossible.
- Player-hostile monetization or retention patterns.

---

## Living References

When a new adapter, production workflow, engine pattern, or game-design framework enters the platform, add it here with the same standard: explain how it improves game-design capability, what we borrow, and what we deliberately leave out.

[acd2]: https://github.com/VoltAgent/awesome-design-md
[ccsw]: https://github.com/farion1231/cc-switch
[multica]: https://github.com/multica-ai/multica
[ocod]: https://github.com/OpenCoworkAI/open-codesign
[skill]: https://docs.anthropic.com/en/docs/claude-code/skills
