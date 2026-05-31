---
name: mobile-game-flow
description: |
  Mobile game screen flow for portrait or landscape games: home, level select, gameplay, pause, results, shop/upgrades, onboarding, and touch-control states.
triggers:
  - mobile game
  - game screen flow
  - touch controls
  - level select
agds:
  mode: prototype
  surface: web
  platform: mobile
  scenario: menu
  featured: 2
  preview:
    type: html
  craft:
    requires: [touch-controls, hud-readability, responsive-game-layouts, accessibility-for-games]
  game:
    platform: mobile
    input: touch
    rendering: dom
  example_prompt: "Design a portrait mobile puzzle RPG flow with home, level select, gameplay HUD, pause menu, victory results, upgrade shop, and thumb-friendly controls."
---

# Mobile Game Flow

Create a responsive HTML playable concept that shows the full mobile game journey, not a generic non-game surface.

## Requirements

- Use phone-sized frames or a responsive mobile viewport.
- Include at least four states unless the creator requests fewer: home/menu, gameplay, pause/settings, results/progression.
- Design touch controls as game controls: joystick, buttons, drag targets, cards, gestures, or large action zones.
- Keep player goals, resources, and progression readable in each state.
- Show monetization, shop, or upgrades only if relevant; do not turn the project into a generic non-game economy.

## P0 Gates

- Every screen is clearly a game screen.
- Gameplay state has HUD, controls, objective, feedback, and pause.
- Touch targets are large and reachable.
- Screen-to-screen navigation is visible.
- Success/failure/progression is represented.
