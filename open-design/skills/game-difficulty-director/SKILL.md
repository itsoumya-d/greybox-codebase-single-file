---
name: game-difficulty-director
description: |
  Adaptive game difficulty director module for intensity curves, spawn scaling, resource pressure, player-skill analysis, assist systems, tutorial pacing, and trustworthy AI director behavior.
triggers:
  - difficulty director
  - adaptive difficulty
  - AI director
  - intensity curve
agds:
  mode: template
  surface: web
  scenario: systems
  featured: 30
  preview:
    type: markdown
  craft:
    requires: [game-difficulty-director, telemetry-analysis, encounter-design, accessibility-for-games]
  game:
    genre: systems
    rendering: static-html
    platform: cross-platform game
  example_prompt: "Design a difficulty director for a co-op horror survival game: intensity curve, adaptive enemy spawns, resource relief, safe-room pacing, skill signals, assist options, and telemetry."
---

# Game Difficulty Director

Use this skill when a game needs dynamic pressure control that protects flow, fairness, accessibility, and genre emotion without hiding rule changes from the player.

## Workflow

1. Define the director promise: maintain flow, preserve horror dread, support onboarding, tune co-op pressure, reduce frustration, or protect mastery.
2. Select observed signals: deaths, retries, health, ammo, accuracy, objective failures, route stalls, idle time, damage spikes, party spread, assist settings, and telemetry heatmaps.
3. Define adjustment levers: enemy aggression, spawn cadence, elite mix, resource drops, checkpoint spacing, hint timing, tutorial reminders, safe-zone length, and recovery windows.
4. Build an intensity curve: baseline, rise, peak, relief, cooldown, escalation, boss/ambush exceptions, and anti-stack rules.
5. Add trust constraints: never hide enemy tells, never manipulate ranked/PvP truth, never invalidate earned skill, and communicate assists respectfully.
6. Add accessibility and opt-in assists: remappable inputs, reduced motion, readable HUD scaling, colorblind feedback, subtitle cues, aim/motor assists, and cognitive hint pacing.
7. End with state table, tuning values, telemetry events, failure modes, and playtest questions.

## P0 Gates

- The director names the signals it observes and the fairness signals it refuses to use.
- Every adaptive lever preserves player-readable rules and counterplay.
- Intensity has planned peaks, recovery windows, and anti-stack cooldowns.
- Assists are respectful, accessible, and opt-in where player identity is at stake.
- Telemetry can prove whether the director improves flow, retention, and frustration without masking broken encounter design.
