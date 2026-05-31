---
name: game-dungeon-raid-architecture
description: |
  Dungeon and raid architecture module for dungeon progression, raid wings, encounter sequencing, checkpoint logic, puzzle integration, boss pacing, reward escalation, role coordination, wipe recovery, and production budgets.
triggers:
  - dungeon architecture
  - raid design
  - dungeon progression
  - raid encounter
agds:
  mode: template
  surface: web
  scenario: level-design
  featured: 32
  preview:
    type: markdown
  craft:
    requires: [dungeon-raid-architecture, level-design-patterns, encounter-design, boss-design-frameworks, multiplayer-balancing, accessibility-for-games]
  game:
    genre: dungeon raid
    rendering: static-html
    platform: cross-platform game
  example_prompt: "Design a raid dungeon for a co-op action RPG: three wings, encounter sequencing, puzzle integration, checkpoint logic, boss pacing, reward escalation, role coordination, accessibility, telemetry, and production scope."
---

# Game Dungeon Raid Architecture

Use this skill when a game needs a dungeon, raid wing, expedition, puzzle temple, boss ladder, or co-op endgame route with coherent pacing and shippable production scope.

## Workflow

1. Define the run promise: solo mastery, co-op raid, roguelike floor, survival expedition, MMO wing, extraction lair, or puzzle gauntlet.
2. Build the macro path: entrance, teaching room, branch, escalation room, relief room, traversal twist, mini-boss, boss arena, exit, and optional secret route.
3. Sequence encounters: enemy composition, arena function, hazards, puzzle interactions, mechanic introductions, pressure windows, recovery windows, checkpoint logic, and fail states.
4. Design raid coordination: party size, role expectations, revive rules, wipe recovery, callouts, latency assumptions, accessibility assists, and late-join behavior.
5. Plan rewards: keys, relics, crafting drops, cosmetics, faction reputation, weekly lockouts, catch-up currency, and anti-farm safeguards.
6. Add production constraints: room count, art-kit reuse, boss count, scripted moments, networking risk, QA matrix, telemetry events, localization, and patch burden.
7. End with a dungeon flow table, raid role matrix, checkpoint map, reward ladder, pacing curve, risk register, and playtest questions.

## P0 Gates

- The dungeon or raid has a clear teach, vary, test, relief, and payoff structure.
- Encounter sequencing names the mechanic introduced, the pressure applied, and the recovery window after each beat.
- Checkpoint logic respects mastery, accessibility, wipe recovery, and exploit prevention.
- Raid role coordination is readable, inclusive, and does not force one brittle party composition.
- Reward escalation motivates completion without loot inflation, mandatory grind, or pay-to-win pressure.
- Production budget covers room count, boss count, scripting, art-kit reuse, network risk, QA, telemetry, and live-balance patching.
