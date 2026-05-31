---
name: economy-progression
description: |
  Economy and progression module for XP, currencies, sinks/sources, crafting, loot, rarity, battle pass cadence, retention loops, and ethical monetization.
triggers:
  - game economy
  - progression curve
  - loot table
  - battle pass
agds:
  mode: template
  surface: web
  scenario: economy
  featured: 13
  preview:
    type: markdown
  craft:
    requires: [game-economy-balancing, player-progression-systems, mobile-game-retention]
  game:
    genre: economy/progression
    rendering: static-html
    platform: live game
  example_prompt: "Design an economy and progression model for a free-to-play co-op looter: XP curve, soft/hard currencies, loot rarity, crafting sinks, battle pass cadence, and monetization guardrails."
---

# Economy Progression

Design economy and progression as clear motivation, fair pacing, and sustainable balance.

## Workflow

1. Lock business model and ethics: premium, F2P, live-ops, cosmetic-only, battle pass, subscription, or no monetization.
2. Map sources and sinks for XP, soft currency, hard currency, crafting materials, energy, tickets, and rarity items.
3. Define progression curves: session rewards, level XP, unlock cadence, catch-up, soft caps, prestige, and endgame.
4. Build loot systems: drop tables, pity/safety valves, duplicate handling, rarity colors, affixes, and bad-luck protection.
5. Specify crafting/upgrades: recipes, material tiers, recycling, repair, fusion, reroll, and long-term sink pressure.
6. Model retention without dark patterns: daily/weekly loops, events, quests, social commitments, and burnout prevention.
7. Add telemetry hooks: economy health metrics, inflation signs, churn points, conversion risks, and exploit detection.
8. End with tables, formulas, sample player journeys, and balance levers.

## P0 Gates

- Every currency has named sources, sinks, caps, and failure modes.
- Progression rewards are understandable before purchase or grind.
- Monetization does not sell unclear odds, mandatory power, or coercive friction.
- Loot rules include duplicates and bad-luck outcomes.
- The spec includes metrics that reveal economy imbalance.
