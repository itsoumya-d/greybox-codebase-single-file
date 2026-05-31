---
name: survival-module
description: |
  Survival and extraction-loop module for hunger, thirst, shelter, weather, crafting, durability, risk/reward, scavenging, base safety, and pressure pacing.
triggers:
  - survival system
  - extraction loop
  - hunger thirst
  - crafting durability
agds:
  mode: template
  surface: web
  scenario: survival
  featured: 12
  preview:
    type: markdown
  craft:
    requires: [gameplay-loop-design, game-economy-balancing, emotional-pacing-design, accessibility-for-games]
  game:
    genre: survival
    rendering: static-html
    platform: desktop/mobile/console
  example_prompt: "Design a survival module for a frozen coastline extraction game: warmth, hunger, thirst, shelter, weather, crafting, durability, injuries, scavenging routes, and safehouse upgrades."
---

# Survival Module

Build survival pressure as a meaningful decision engine, not a maintenance chore.

## Workflow

1. Identify the survival fantasy: isolation, mastery, horror, cozy homestead, extraction pressure, or social cooperation.
2. Define survival meters with purpose, warning thresholds, recovery paths, and fail-forward outcomes.
3. Map the resource loop: scavenge, craft, travel, risk, extract/shelter, upgrade, and plan next run.
4. Design environmental systems: weather, temperature, day/night, noise, visibility, disease/injury, terrain, and shelter.
5. Specify crafting: recipes, discovery, stations, tools, durability, repair, inventory pressure, and recipe unlocks.
6. Balance risk/reward: route danger, loot density, extraction windows, rescue mechanics, base safety, and loss rules.
7. Add player experience rules: meter readability, warning language, inventory affordances, accessibility, pause/safe modes, and onboarding.
8. End with tuning levers, example run timeline, and data tables for resources and recipes.

## P0 Gates

- Meters create decisions rather than constant busywork.
- Every failure has readable warning and at least one recovery option.
- Crafting recipes create a progression ladder, not a random purchase list.
- Resource scarcity supports the emotional target.
- Extraction/loss rules are fair, legible, and testable.
