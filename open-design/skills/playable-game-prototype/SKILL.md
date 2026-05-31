---
name: playable-game-prototype
description: |
  Playable HTML game concept with a real loop, input, HUD, feedback, and win/fail/progress state. Use for desktop games, mobile web games, arcade loops, roguelikes, platformers, puzzles, and quick gameplay experiments.
triggers:
  - playable game
  - playable concept
  - browser game
  - mobile web game
agds:
  mode: prototype
  surface: web
  scenario: gameplay
  featured: 1
  default_for: prototype
  preview:
    type: html
  craft:
    requires: [game-feel, hud-readability, controller-keyboard-input, touch-controls, responsive-game-layouts]
  game:
    rendering: canvas2d
    input: keyboard/touch
    platform: responsive web game
  example_prompt: "Build a playable mobile roguelike dungeon crawler concept: title/menu, top-down dungeon room, player movement, one enemy, pickups, health, timer, pause, win/fail states, and touch + keyboard controls."
---

# Playable Game Concept

Build a single self-contained `index.html` that the creator can immediately playtest or inspect.

## Workflow

1. Lock the game fantasy, target surface, camera, controls, and core loop.
2. Plan the state list before writing: `menu`, `playing`, `paused`, `success`, `failure`, plus any brief-specific state.
3. Implement a visible game loop with `requestAnimationFrame`, deterministic placeholder entities, input handling, collision/interaction feedback, and restart/pause controls.
4. Design the HUD first: health/resources, objective, score/timer, control hints, and feedback log must remain readable while the game is moving.
5. Use simple but intentional assets: CSS shapes, canvas sprites, tile grids, or labeled placeholders. If the brief asks for 3D, frame the 3D intent clearly and use 2D placeholders only as a named playable-concept stand-in.
6. Include responsive behavior for desktop and mobile; touch controls must be large and thumb-reachable.
7. Add a tiny tuning panel only when useful: speed, difficulty, UI scale, color intensity, or effects.
8. Self-check against the P0 gates below before emitting.

## P0 Gates

- The artifact is playable or at least stateful with real input.
- The core loop is visible within 10 seconds.
- HUD shows objective, resources/status, and feedback.
- Player action produces immediate visual response.
- Pause/restart and success/failure/progress states exist.
- Mobile layouts respect safe areas and touch targets.
- No non-game chrome unless the game fiction explicitly requires it.
