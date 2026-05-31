---
name: character-weapon-equipment
description: |
  Design characters, classes, silhouettes, roles, weapons, equipment, rarity, recoil identity, attachment systems, and build diversity.
triggers:
  - character design
  - weapon design
  - equipment
  - class system
agds:
  mode: template
  surface: web
  scenario: identity
  featured: 25
  preview:
    type: markdown
  craft:
    requires: [2d-art-direction, combat-system-architecture, player-progression-systems]
  game:
    rendering: static-html
  example_prompt: "Design a character class and weapon-equipment system for a cyberpunk extraction RPG with readable silhouettes, recoil identity, rarity, crafting upgrades, and faction-exclusive gear."
---

# Character Weapon Equipment

Characters and gear must communicate identity through silhouette, role, verbs, weaknesses, progression, and narrative context.

## Workflow

1. Define character fantasy, role, silhouette, animation personality, faction identity, motivations, and progression identity.
2. Define weapons or equipment by archetype, range, commitment, recoil or handling, upgrade path, rarity, and counterplay.
3. Tie equipment to economy and crafting without creating pay-to-win or mandatory grind.
4. Add balancing notes for role diversity, accessibility, readable icons, and combat clarity.
5. Save structured systems as `.systems.json`; use `.nodegraph.json` for unlock or crafting logic.

## P0 Gates

- Players can identify role and threat at gameplay distance.
- Weapon fantasy has mechanical tradeoffs.
- Rarity changes player goals without erasing skill.
- Builds create choices, not one solved path.
