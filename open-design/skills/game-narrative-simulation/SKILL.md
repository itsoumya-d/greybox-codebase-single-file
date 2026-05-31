---
name: game-narrative-simulation
description: |
  Narrative simulation module for reactive dialogue, morality systems, dynamic faction reactions, emergent storytelling, procedural narrative fragments, companion consequences, continuity ledgers, branch merge rules, and production budgets.
triggers:
  - narrative simulation
  - reactive dialogue
  - morality system
  - dynamic faction reactions
agds:
  mode: template
  surface: web
  scenario: narrative
  featured: 33
  preview:
    type: markdown
  craft:
    requires: [narrative-simulation, narrative-branching-design, environmental-storytelling, emotional-pacing-design, companion-party-systems]
  game:
    genre: narrative game
    rendering: static-html
    platform: cross-platform game
  example_prompt: "Design narrative simulation for a faction RPG: reactive dialogue, morality stance, dynamic faction reactions, companion consequences, procedural narrative fragments, continuity ledger, branch merge rules, and production budget."
---

# Game Narrative Simulation

Use this skill when story needs to respond to player action across quests, factions, companions, cinematics, procedural events, and long-term continuity.

## Workflow

1. Define the simulation promise: reactive faction politics, morality pressure, emergent rumors, companion-led consequences, procedural quests, or cinematic branching.
2. Build the state model: quest flags, faction standing, morality vector, companion trust, hidden knowledge, world-state changes, dead/alive status, and irreversible consequences.
3. Create a continuity ledger: canonical facts, character beliefs, rumors, lies, unresolved mysteries, branch outcomes, and protected world rules.
4. Design reactive dialogue: player intents, NPC motive filters, relationship tone, recent action references, refusal paths, fail-forward lines, and priority order.
5. Design dynamic faction reactions: territory changes, resource pressure, hostility thresholds, diplomacy options, reputation recovery, faction-exclusive rewards, and world-state broadcasts.
6. Add procedural narrative fragments: hook grammar, motive pools, allowed locations, contradiction checks, cooldowns, seed replay, reward logic, and authored fallback beats.
7. End with continuity table, variable schema, reaction matrix, procedural grammar, branch merge plan, telemetry events, localization/VO budget, and QA risks.

## P0 Gates

- Facts, rumors, beliefs, and lies are separated so continuity remains inspectable.
- Reactive dialogue is driven by named variables and character motives, not random flavor.
- Dynamic faction reactions have readable causes, player feedback, recovery paths, and lore-consistent limits.
- Procedural narrative fragments cannot contradict deaths, geography, faction state, quest state, or protected world rules.
- Branch merge rules preserve emotional consequences even when production routes converge.
- Production budget covers writing, VO, localization, cinematic staging, save migration, accessibility, and QA complexity.
