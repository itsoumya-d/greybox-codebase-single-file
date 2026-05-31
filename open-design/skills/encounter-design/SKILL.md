---
name: encounter-design
description: |
  Encounter and boss design module for waves, arenas, stealth pockets, puzzles, ambushes, multi-phase fights, escalation, recovery windows, and pacing beats.
triggers:
  - encounter design
  - boss fight
  - combat arena
  - enemy waves
agds:
  mode: template
  surface: web
  scenario: encounter
  featured: 14
  preview:
    type: markdown
  craft:
    requires: [level-design-patterns, boss-design-frameworks, combat-system-architecture, emotional-pacing-design]
  game:
    genre: encounter design
    rendering: static-html
    platform: level/boss design
  example_prompt: "Design three encounters and one boss for a tactical sci-fi mission: arena map, enemy roles, objectives, spawn timing, cover, hazards, phase changes, rewards, and failure recovery."
---

# Encounter Design

Turn mechanics into memorable, readable challenges with a beginning, middle, climax, and recovery.

## Workflow

1. Lock encounter role: tutorial, mastery check, pressure spike, puzzle, stealth, spectacle, boss, or resource drain.
2. Define player goal, failure condition, reward, optional objective, and expected duration.
3. Map arena/spatial logic: spawn, cover, sightlines, chokepoints, flanks, verticality, hazards, safe pockets, and exits.
4. Choose enemy/obstacle roles: pressure, control, sniper, tank, swarm, support, trap, objective guard, or boss limb/phase.
5. Script pacing beats: intro read, first pressure, twist, escalation, recovery, climax, resolution.
6. For bosses, define phases, tells, arena changes, recovery windows, mechanic teaching, and accessibility assists.
7. Specify tuning levers: enemy count, spawn delay, health, aggression, hazard timing, ammo/resources, checkpoint distance.
8. End with encounter cards and a playtest checklist.

## P0 Gates

- The player can understand the objective and primary threat quickly.
- The encounter teaches or tests a named mechanic.
- Every phase or wave changes decisions, not just enemy count.
- Recovery windows exist after pressure spikes.
- Rewards and checkpoints match encounter difficulty.
