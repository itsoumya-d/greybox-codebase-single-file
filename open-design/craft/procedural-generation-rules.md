# Procedural Generation Rules

Use when designing procedural dungeons, maps, biomes, encounters, loot, quests, enemy variants, events, or terrain. Procedural generation is authored possibility, not a substitute for design.

## What To Produce

- Generation goals: variety, replayability, personalization, production scale, mystery, or challenge.
- Content grammar: rooms, nodes, biomes, encounters, rewards, hazards, and connectors.
- Constraints and validation rules.
- Seed policy and reproducibility plan.
- Difficulty, pacing, and fairness controls.
- Debug views and designer override hooks.
- Content budget and authored anchor list.

## Authored Grammar

Define the parts and how they can connect.

```text
Dungeon grammar:
  start -> teach room -> branch hub -> risk room -> reward room -> gate -> boss
  optional: secret, shop, shrine, lore, challenge
  connectors: corridor, lift, locked door, hazard tunnel
  validation: critical path 8-14 rooms, at least 2 recovery nodes, no key behind its own lock
```

Procedural content needs authored rules. A generator without grammar creates noise; a generator with grammar creates surprise inside a designed language.

## Seeds And Reproducibility

Every generator should support reproducible seeds.

- Store seed, version, content tables, and player-facing modifiers.
- Make daily/weekly seeds shareable if competition or community discussion matters.
- Include a debug seed list: easy, average, hard, weird, near-failure, performance stress.
- Version generators so old saves do not break when tables change.

Reproducibility turns bugs into solvable cases and lets designers compare tuning changes.

## Constraint Solving

Constraints protect fairness and pacing.

Common constraints:

- Critical path length range.
- Required ability gates after ability acquisition.
- Enemy difficulty budget by room.
- Reward spacing.
- Safe room interval.
- Biome transition rules.
- No impossible jumps, locked loops, or unreachable pickups.
- Boss prerequisites.
- Performance limits for enemies, lights, particles, and physics objects.

Use validators after generation. The generator can be creative; the validator must be strict.

## Pacing Control

Randomness should not randomize emotional pacing blindly.

Use a pacing budget:

| Beat Type | Budget Role |
|---|---|
| Teach | Introduces one mechanic or variant |
| Pressure | Combat, timer, hazard, scarcity |
| Recovery | Shop, camp, quiet room, safe route |
| Reward | Loot, lore, shortcut, upgrade |
| Twist | Rare modifier, surprise, elite, event |
| Climax | Boss, extraction, escape, final puzzle |

Prevent impossible spikes by limiting how many pressure beats can appear in sequence. Prevent boredom by limiting recovery or empty beats in sequence.

## Difficulty Budgets

Assign generation costs to content.

```text
room_budget = base_by_depth + player_power_adjustment
grunt = 1
sniper = 3
elite = 6
hazard_floor = 2
healing_pickup = -2
cover = -1
```

Budgets are not perfect, but they make procedural difficulty tunable. Use playtest data to adjust weights.

## Biome Generation

Biomes need identity and gameplay implications.

- Forest: concealment, vertical roots, poison, ambush.
- Desert: heat, sightlines, scarce water, mirage.
- Ice: sliding, brittle surfaces, visibility, cold.
- Volcano: timing hazards, lava, heat vents, pressure.
- City: routes, rooftops, civilians, cover, signage.
- Space: vacuum, doors, oxygen, low gravity.
- Underwater: currents, oxygen, light falloff, creature silhouettes.

Do not make biomes palette swaps. Give each biome at least one mechanical rule, one hazard, one resource pattern, and one audio identity.

## Procedural Loot

Random loot needs bounded meaning.

- Use item families with clear affix pools.
- Keep affixes compatible with item role.
- Avoid impossible or useless combinations.
- Weight drops toward player goals without becoming predictable.
- Include deterministic rewards for major milestones.
- Provide salvage, reroll, or target farming.

Procedural loot fails when players cannot tell what is valuable or cannot pursue what they want.

## Procedural Quests And Narrative

Quest generation needs narrative grammar.

```text
faction wants objective because motive, opposed by rival, complicated by twist.
```

Track variables:

- Faction relationships.
- Location state.
- NPC availability.
- Consequences and memory.
- Tone and stakes.
- Reward type.

Never generate a quest that contradicts established world facts unless the contradiction is a deliberate mystery.

## Validation And Debugging

Build validation outputs:

- Map graph view.
- Critical path length.
- Resource curve.
- Encounter difficulty curve.
- Reward distribution.
- Unreachable content report.
- Softlock report.
- Performance estimate.
- Screenshot or thumbnail sheet per seed.

If designers cannot inspect the generator, they cannot tune it.

## Anti-Patterns

- Random rooms stitched together with no pacing grammar.
- Key-lock logic that can softlock.
- Biomes that only change color.
- Rare unfair seeds excused as "just RNG."
- Procedural quests that ignore faction, location, or character memory.
- Loot affixes that create mathematically dead items.
- Generator changes that break old saves because seed versioning was ignored.

## Agent Checklist

- What is authored and what is procedural?
- Are generation constraints explicit and validated?
- Can a seed be reproduced and debugged?
- Is pacing controlled through beat budgets?
- Do generated biomes change gameplay?
- Are rewards and difficulty bounded for fairness?
- What debug view would reveal a bad seed quickly?
