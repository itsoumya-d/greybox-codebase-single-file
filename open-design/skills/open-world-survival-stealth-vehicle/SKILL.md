---
name: open-world-survival-stealth-vehicle
description: |
  Design open-world regions, survival pressure, stealth systems, traversal, vehicles, sandbox interactions, and emergent gameplay.
triggers:
  - open world
  - survival system
  - stealth system
  - vehicle design
agds:
  mode: template
  surface: web
  scenario: world-systems
  featured: 26
  preview:
    type: markdown
  craft:
    requires: [open-world-systems, survival-systems, stealth-design, traversal-vehicles]
  game:
    rendering: static-html
  example_prompt: "Design an open-world survival stealth vehicle system for a desert sci-fi game with heat pressure, patrol visibility, sand bikes, resource routes, faction territory, and emergent ambushes."
---

# Open World Survival Stealth Vehicle

Use this skill for systemic worlds where travel, scarcity, visibility, and traversal vehicles shape the player's plan.

## Workflow

1. Define regions, biome identity, faction influence, resource distribution, travel time, and content density.
2. Design survival pressure such as hunger, thirst, temperature, infection, shelter, durability, or extraction risk.
3. Design stealth readability: visibility, sound propagation, alert states, patrol routes, distractions, camouflage, and recovery.
4. Design traversal and vehicles: handling fantasy, damage, customization, fuel/maintenance, combat use, and accessibility.
5. Add emergent interactions: physics, chain reactions, AI response, weather, faction conflict, and player creativity.
6. Use `.gameview.json` for maps, `.nodegraph.json` for systemic triggers, and `.systems.json` for tuning.

## P0 Gates

- Open-world density avoids fatigue and dead travel.
- Survival creates tension without maintenance overload.
- Stealth failure is explainable and recoverable.
- Vehicles expand choices without trivializing the world.
