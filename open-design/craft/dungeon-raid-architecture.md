# Dungeon And Raid Architecture

Use when designing dungeon progressions, raid wings, encounter chains, expedition routes, puzzle gauntlets, boss ladders, and checkpoint structures. Dungeon and raid architecture is not just a map order; it is a promise about pacing, teamwork, risk, recovery, mastery, and reward escalation.

## What To Produce

- Run promise: solo mastery dungeon, co-op raid, roguelike floor, MMO wing, puzzle temple, survival expedition, or extraction lair.
- Macro path: entrance, teaching room, branch, escalation, puzzle/rest beat, mini-boss, traversal twist, boss arena, exit, and optional secret route.
- Encounter sequence: enemy roles, arena shapes, mechanic introductions, pressure windows, recovery windows, fail states, and checkpoint logic.
- Raid structure: role coordination, phase assignments, revive rules, wipe recovery, voice/chat assumptions, spectator readability, and late-join rules.
- Reward ladder: keys, relics, crafting drops, cosmetics, reputation, unlocks, catch-up rewards, and anti-farm limits.
- Production plan: room count, boss count, mechanic budget, art-kit reuse, encounter scripting, QA matrix, telemetry events, and patch risk.

## Pacing Model

Design a dungeon or raid as a sequence of readable emotional beats:

1. Arrival: establish biome, objective, route language, and threat rules.
2. Teaching: introduce one mechanic with low punishment and clear feedback.
3. Variation: combine the mechanic with a second pressure such as timer, hazard, verticality, or enemy mix.
4. Relief: offer recovery, story clue, checkpoint, crafting station, shortcut, or optional reward.
5. Exam: test mastery through a mini-boss, puzzle lock, coordinated raid mechanic, or traversal challenge.
6. Payoff: boss, raid finale, extraction, faction reveal, or world-state change.

## Design Rules

- Put checkpoints after learning, not after pure luck. A wipe should return players to a useful mastery point.
- Teach raid mechanics in safe or low-pressure forms before full team coordination is required.
- Let dungeon branches express risk/reward: safer route, secret route, resource route, speed route, and lore route.
- Use room silhouettes. Players should read arena function from entrances, cover, verticality, hazards, and objective placement.
- Make recovery visible. Players need to know where they can heal, regroup, change loadout, revive, or abandon the run.
- Scale raid role coordination honestly. If a raid requires tank/healer/DPS or puzzle callers, name the communication assumptions.
- Reward mastery without making failed runs feel empty. Preserve knowledge, shortcuts, pity currency, or faction memory.

## Dungeon And Raid Levers

| Lever | Use | Watch For |
|---|---|---|
| Room count | Controls session length and content load | Fatigue, repeated layouts |
| Branch density | Adds replayability and agency | Lost critical path |
| Checkpoint spacing | Manages frustration and mastery | Exploit farming, wasted time |
| Mechanic layering | Builds depth | Overloaded readability |
| Raid roles | Creates social mastery | Mandatory composition lock |
| Shortcut unlocks | Rewards exploration | Sequence breaks |
| Reward escalation | Drives completion | Loot inflation |
| Wipe recovery | Protects motivation | Trivializing challenge |

## Production Budgeting

- A small indie dungeon should reuse art kits, limit bespoke scripted rooms, and ship one polished boss ladder before multiplying biomes.
- Raid content multiplies QA by party size, role composition, networking edge cases, revive states, accessibility assists, and live-balance patching.
- Procedural dungeons still need authored grammar, fairness validation, room tags, loot rules, and impossible-state rejection.
- Cinematic raid beats need fallback timing for wipes, reconnects, skipped dialogue, localization, and accessibility settings.
- Telemetry should track room deaths, wipe causes, party composition, checkpoint retries, abandoned routes, reward claims, and completion time.

## Anti-Patterns

- Long corpse runs that test patience more than skill.
- Puzzle locks that require one teammate to understand everything while others wait.
- Raid phases that add spectacle without changing player decisions.
- Reward tables that make early rooms optimal to farm and final bosses optional.
- Secret paths that hide mandatory progression without readable clues.
- Procedural rooms that break class abilities, co-op roles, or traversal readability.

## Agent Checklist

- What does this dungeon or raid teach, vary, test, and reward?
- Where are checkpoints, shortcuts, safe rooms, and wipe recovery points?
- How do encounter sequencing, boss pacing, and reward escalation create a complete arc?
- Which roles or builds are viable without one mandatory composition?
- What content budget keeps the dungeon or raid shippable for the declared team?
