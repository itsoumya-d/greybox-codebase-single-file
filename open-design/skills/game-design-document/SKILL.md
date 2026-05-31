---
name: game-design-document
description: |
  Full Game Design Document generator for pillars, fantasy, audience, loop, mechanics, content, player experience, art/audio, production plan, risks, monetization, accessibility, and milestones.
triggers:
  - game design document
  - gdd
  - full game spec
  - vertical slice plan
agds:
  mode: deck
  surface: web
  scenario: gdd
  featured: 19
  preview:
    type: markdown
  craft:
    requires: [gameplay-loop-design, player-progression-systems, level-design-patterns, accessibility-for-games]
  game:
    genre: gdd
    rendering: static-html
    platform: production planning
  example_prompt: "Create a full GDD deck for a cozy tactical roguelite: overview, pillars, core loop, combat, progression, levels, narrative, UI, art/audio, production scope, risks, and vertical-slice milestones."
---

# Game Design Document

Generate a production-facing GDD or pitch/GDD deck with enough specificity for design review and vertical-slice planning.

## Workflow

1. Lock the concept: title, genre, platform, audience, fantasy, emotional target, and constraints.
2. Define pillars and player promise with clear non-goals.
3. Specify core loop, meta loop, session structure, win/fail/progress states, and onboarding.
4. Cover mechanics: movement, camera, combat/interaction, resources, progression, economy, content systems, and accessibility.
5. Cover content: levels/biomes, enemies, bosses, items, quests, narrative, art direction, audio, UI/HUD, and live-ops if relevant.
6. Add production reality: team, scope, MVP/vertical slice, milestones, risks, dependencies, tooling, QA, and telemetry.
7. End with open questions and next milestone recommendations.

## P0 Gates

- The GDD names what is in scope and out of scope.
- Loops and mechanics are concrete enough to make playable.
- Content counts are realistic for the stated team and timeline.
- Accessibility, platform constraints, and production risks are included.
- Monetization, if present, is ethical and transparent.
