---
name: rpg-systems
description: |
  RPG systems design module for classes, stats, perks, skill trees, equipment, dialogue checks, factions, quests, and character growth. Use when the creator needs a role-playing ruleset, progression model, or GDD-ready RPG spec.
triggers:
  - rpg system
  - skill tree
  - character classes
  - faction reputation
agds:
  mode: template
  surface: web
  scenario: rpg
  featured: 10
  preview:
    type: markdown
  craft:
    requires: [player-progression-systems, game-economy-balancing, narrative-branching-design]
  game:
    genre: rpg
    rendering: static-html
    platform: cross-platform game design
  example_prompt: "Design the RPG systems for a dark-fantasy party game: 5 classes, stat growth, perk trees, equipment rarities, dialogue checks, faction reputation, and a first-act progression curve."
---

# RPG Systems

Create a coherent RPG ruleset that can survive implementation, balance passes, and content expansion.

## Workflow

1. Lock the player fantasy, camera, combat style, party model, and expected campaign/session length.
2. Define 3-5 design pillars and reject mechanics that fight them.
3. Build the stat model: primary stats, derived stats, caps, scaling rules, and respec policy.
4. Define classes/archetypes with verbs, role, weakness, signature resource, and onboarding difficulty.
5. Create progression: XP curve, unlock cadence, skill-tree shape, perk tiers, and mastery or prestige layer.
6. Design equipment: slots, rarity language, affixes, crafting hooks, upgrade rules, and anti-bloat constraints.
7. Specify checks: dialogue, exploration, faction reputation, morality/ethics, companion reactions, and failure-forward outcomes.
8. End with a balance table and production notes: content count, data schema hints, test cases, and scope risks.

## P0 Gates

- Every stat has a gameplay purpose and at least one counter-pressure.
- Classes are differentiated by verbs, not only numeric bonuses.
- Progression rewards arrive at a readable cadence without mandatory grind.
- Equipment and loot do not invalidate class identity.
- Dialogue/faction checks create consequences without dead-ending the player.
- The spec names implementation risks and balancing levers.
