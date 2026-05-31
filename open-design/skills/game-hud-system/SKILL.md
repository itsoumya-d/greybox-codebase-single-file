---
name: game-hud-system
description: |
  Game HUD system for health, stamina, ammo, minimap, quests, cooldowns, timers, buffs, combat feedback, touch controls, and readability states.
triggers:
  - HUD
  - gameplay interface kit
  - minimap
  - cooldowns
agds:
  mode: prototype
  surface: web
  scenario: hud
  featured: 4
  preview:
    type: html
  craft:
    requires: [hud-readability, touch-controls, controller-keyboard-input, accessibility-for-games]
  game:
    rendering: dom
  example_prompt: "Create a fantasy action RPG HUD kit with health/stamina/mana, skill cooldowns, minimap, quest tracker, boss bar, inventory quick slots, damage feedback, and mobile touch-control variant."
---

# Game HUD System

Produce an HTML HUD kit with multiple gameplay states and readable hierarchy.

## Requirements

- Show normal, danger/low-resource, selected/targeted, cooldown, paused, and boss/encounter states when relevant.
- Anchor HUD zones so action remains visible.
- Include both desktop and mobile/touch variants if the brief mentions both.
- Use icons, labels, color, and shape consistently.
- Avoid decorative HUD clutter that does not help play.

## P0 Gates

- Health/resources/objective are readable immediately.
- Interactables, hazards, cooldowns, and target states are visually distinct.
- HUD does not cover the main action zone.
- Touch controls, if present, are large and separated from status readouts.
