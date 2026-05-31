---
name: procedural-generation
description: |
  Procedural generation module for dungeons, biomes, encounters, loot, quests, enemy mutations, fairness constraints, seed rules, and replayability.
triggers:
  - procedural generation
  - dungeon generator
  - biome generation
  - roguelike generation
agds:
  mode: template
  surface: web
  scenario: procedural
  featured: 16
  preview:
    type: markdown
  craft:
    requires: [procedural-generation-rules, level-design-patterns, game-economy-balancing]
  game:
    genre: procedural game
    rendering: static-html
    platform: replayable systems design
  example_prompt: "Design a procedural dungeon generator for a roguelike: room grammar, biome rules, encounter budgets, loot tables, fairness constraints, seed logic, and anti-exploit checks."
---

# Procedural Generation

Design procedural game content as a controlled authored system: variety inside fairness, pacing, and player readability.

## Workflow

1. Lock generated domain: rooms, overworld, quests, encounters, loot, enemies, biomes, puzzles, dialogue, or missions.
2. Define authored units: tiles, chunks, room templates, encounter cards, loot pools, quest fragments, and mutation rules.
3. Create generation grammar: seed, constraints, adjacency, budgets, tags, weights, prerequisites, locks, and exits.
4. Add pacing rules: safe starts, ramp, rest beats, spikes, rewards, navigation clarity, and no-unwinnable states.
5. Specify fairness: spawn distance, resource minimums, line-of-sight rules, escape paths, dead-end limits, and retries.
6. Design variety: biome palettes, enemy mutations, rare events, secrets, objective variants, and run modifiers.
7. Add debugging: seed replay, heatmaps, validation tests, exploit checks, and designer override hooks.
8. End with pseudocode, data tables, test seeds, and content budget.

## P0 Gates

- Generator can reject unfair output.
- Every random choice is constrained by pacing and readability.
- Seeds are reproducible for QA.
- Authored content units have tags and budgets.
- The spec includes failure cases and validation tests.
