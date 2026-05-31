# Narrative Simulation

Use when a game needs branching narrative to behave like a living system: reactive dialogue, player morality, faction reactions, companion consequences, procedural narrative fragments, emergent story events, cinematic pacing, and continuity across repeated revisions.

## What To Produce

- Simulation promise: authored branching drama, reactive open-world story, procedural quest fragments, companion-led reactivity, faction politics, morality pressure, or emergent world rumors.
- State model: quest flags, reputation values, morality stance, faction memory, companion trust, world-state changes, hidden knowledge, and irreversible consequences.
- Continuity ledger: facts that must stay true across branches, dialogue, codex entries, cinematics, quests, faction maps, and later revisions.
- Reactive dialogue rules: player intents, NPC motive filters, relationship tone, faction standing, recent actions, refusal handling, and fail-forward lines.
- Procedural narrative grammar: reusable hooks, motives, locations, constraints, reward logic, cooldowns, contradiction checks, and authored fallback beats.
- Production limits: voiced-line budget, localization, branch merge policy, cinematic cost, QA matrix, save migration, and accessibility needs.

## Simulation Rules

- Separate facts, rumors, beliefs, and lies. The system must know which characters know which truth.
- Every variable needs ownership, range, player-visible feedback, and branch impact.
- Dynamic faction reactions should be motivated by ideology, territory, resources, leadership, and prior player actions.
- Reactive dialogue should express player intent and NPC motive, not random flavor.
- Procedural narrative fragments need hard constraints so generated beats cannot contradict lore, deaths, faction status, geography, or quest state.
- Emotional consequences can persist even when production routes merge. Preserve changed tone, banter, rewards, codex text, and faction support.
- Cinematic pacing should account for skipped scenes, repeated failures, subtitles, reduced motion, and player control return.

## Continuity Tools

| Tool | Use | Watch For |
|---|---|---|
| Fact ledger | Canonical world truth | Duplicate contradictory lore |
| Knowledge graph | Who knows what | NPCs revealing impossible information |
| Morality vector | Tracks player values | Hidden moral math feeling unfair |
| Faction memory | Sustains political consequence | Unrecoverable reputation spirals |
| Branch merge rules | Controls production cost | Emotional sameness after choices |
| Procedural grammar | Adds variety | Randomness that breaks continuity |
| Companion reaction map | Personalizes consequences | Approval spam or unclear motives |

## Production Budgeting

- Branch count multiplies writing, VO, cinematic staging, localization, QA, save compatibility, and accessibility review.
- Procedural story systems need authored validation: contradiction tests, cooldowns, seed replay, faction-state fixtures, and fallback lines.
- Reactive dialogue needs priority order so critical quest lines beat banter, tutorial lines, and ambient flavor.
- Morality and reputation need recovery paths unless permanent consequence is the explicit player fantasy.
- Telemetry should track skipped scenes, dialogue exits, branch distribution, faction hostility spikes, companion departures, and unresolved quest states.

## Anti-Patterns

- Characters forgetting major player choices because the quest merged too aggressively.
- Moral choices that are secretly binary while pretending to be nuanced.
- Procedural rumors that mention dead NPCs, unreachable places, or impossible faction alliances.
- Companion reactions that punish player expression without clear motive or recovery.
- Branches that add expensive cinematics but no new player decision, emotion, or world-state consequence.

## Agent Checklist

- What facts, beliefs, rumors, and lies must remain consistent?
- Which variables drive dialogue, faction reactions, companion behavior, and cinematic beats?
- Where do branches merge, and what emotional consequences persist after the merge?
- How are procedural narrative fragments constrained, validated, and replayed?
- What budget keeps reactivity shippable for the declared team and localization plan?
