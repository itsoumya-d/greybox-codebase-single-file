---
name: final-studio-package
description: |
  Export complete studio-ready packages: GDDs, gameplay bibles, mechanic specs, level maps, narrative trees, HUD boards, concept systems, milestones, and sprint breakdowns.
triggers:
  - final package
  - studio package
  - production package
  - game design bible
agds:
  mode: template
  surface: web
  scenario: package
  featured: 28
  preview:
    type: markdown
  craft:
    requires: [game-design-document, level-design-patterns, production-feasibility, accessibility-for-games]
  game:
    rendering: static-html
  example_prompt: "Package this game concept into a studio-ready vertical-slice bundle with GDD, core loop, level map, combat spec, narrative tree, HUD board, art direction, accessibility, roadmap, risks, and sprint tasks."
---

# Final Studio Package

Use this skill to consolidate scattered design work into a production-ready bundle a team could review, estimate, and build from.

## Workflow

1. Write an executive vision: fantasy, audience, pillars, platform, art direction, and scope.
2. Package systems: core loop, combat/movement, progression, economy, enemies, quests, narrative, multiplayer or live ops when relevant.
3. Package editor artifacts: `.gameview.json`, `.nodegraph.json`, `.btree.json`, and `.systems.json` for surfaces that need ongoing tuning.
4. Add production plan: vertical slice, milestones, sprint-ready tasks, dependencies, asset budget, risks, QA, telemetry, and launch path.
5. Add accessibility plan and ethical monetization stance.
6. End with a concise next-milestone checklist.

## P0 Gates

- The package is coherent across mechanics, world, UI, art, audio, tech, and production.
- Risks have mitigations and owners.
- Scope is realistic for the declared team scale.
- No generic business or app-builder framing remains.
