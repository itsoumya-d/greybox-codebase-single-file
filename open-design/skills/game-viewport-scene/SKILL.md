---
name: game-viewport-scene
description: |
  Build editable .gameview.json scene, level, narrative, and world-map viewport documents with spawn logic, routes, hazards, checkpoints, dynamic events, and spatial readability.
triggers:
  - game viewport
  - level viewport
  - scene layout
  - world map viewport
agds:
  mode: template
  surface: web
  scenario: viewport
  featured: 20
  preview:
    type: markdown
  craft:
    requires: [level-design-patterns, game-camera-systems, accessibility-for-games]
  game:
    rendering: static-html
  example_prompt: "Create a .gameview.json level viewport for a stealth-combat extraction mission with player spawn, patrols, sightlines, cover, hazards, hidden loot, extraction routes, and cinematic triggers."
---

# Game Viewport Scene

Use this skill when the best deliverable is an editable game planning surface rather than a static HTML mockup.

## Workflow

1. Pick the viewport surface: gameplay, level, narrative, or world-map.
2. Define the gameplay objective, camera, scale, and success/failure conditions.
3. Place player spawn, enemy spawns, NPCs, hazards, cover, checkpoints, rewards, interaction zones, hidden areas, dynamic events, and cinematic triggers.
4. Draw paths for critical route, optional route, stealth route, combat pressure, camera framing, and reward route.
5. Add pacing beats that state what the player learns, risks, recovers from, and earns.
6. Save the deliverable as `name.gameview.json` with `kind: "game-viewport"`.

## P0 Gates

- Every important spatial object has an id, type, coordinate, and note.
- The critical path is readable and not confused with optional or stealth paths.
- Enemy placement creates counterplay, not unavoidable damage.
- Accessibility notes cover color-independent objective and danger reads.
