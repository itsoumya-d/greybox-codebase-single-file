---
name: level-design-board
description: |
  Level design board with map, encounter beats, traversal, hazards, pickups, gates, objectives, camera notes, pacing, and failure/success conditions.
triggers:
  - level design
  - map board
  - encounter design
  - arena layout
agds:
  mode: prototype
  surface: web
  scenario: level
  featured: 5
  preview:
    type: html
  craft:
    requires: [game-feel, responsive-game-layouts, accessibility-for-games]
  game:
    rendering: static-html
  example_prompt: "Design a top-down dungeon level board for a mobile roguelike: entrance, combat rooms, treasure risk/reward, boss arena, hazards, pickups, camera notes, and pacing beats."
---

# Level Design Board

Create an inspectable level-design artifact, not a decorative map.

## Requirements

- Show a map or spatial diagram with labeled beats.
- Include objective path, optional paths, gates/locks, hazards, enemies, pickups, checkpoints, and exit.
- Annotate pacing: tutorial, pressure, relief, reward, escalation, boss, recovery.
- Add camera/view notes and player affordances.
- Include failure/success conditions and at least one iteration note.

## P0 Gates

- The path and objective are understandable at a glance.
- Encounters and rewards are intentionally placed.
- Hazards, pickups, gates, and traversal affordances are distinct.
- The board explains how the level plays, not only how it looks.
