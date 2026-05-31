# Game Difficulty Director

A difficulty director adjusts pressure while preserving trust. It is not rubber-banding, hidden damage manipulation, or punishment for success. Use this guide when a game needs adaptive spawn systems, enemy aggression scaling, resource balancing, player skill analysis, pacing correction, assist systems, adaptive tutorials, or AI intensity curves.

## What To Produce

- Director goal: sustain flow, protect horror tension, smooth onboarding, recover from frustration, or keep co-op intensity readable.
- Observed signals: deaths, damage taken, resource scarcity, objective failure, accuracy, route choice, idle time, repeated retries, party coordination, and accessibility assists.
- Adjustment levers: spawn timing, enemy mix, aggression, ammo/health drops, hint timing, checkpoint distance, puzzle clarity, AI director cooldowns, and recovery windows.
- Trust rules: never hide tells, never secretly change PvP outcomes, never erase earned mastery, and never reduce challenge in ways that feel patronizing.
- Telemetry plan: track trigger reason, applied adjustment, player response, completion, frustration, churn, and assist opt-in.

## Design Rules

- Adapt pressure, not truth. Player damage, hitboxes, phase rules, and competitive outcomes should remain explainable.
- Use visible recovery first: safe room, resource cache, tutorial hint, slower spawn cadence, clearer objective marker, or longer enemy recovery.
- Make intensity curves rhythmic. Plan peaks, valleys, quiet recovery, and escalation windows rather than continuously smoothing every spike.
- Separate onboarding assists from mastery assists. A first-session tutorial correction is different from a late-game boss intensity adjustment.
- Let players opt into stronger assists. Difficulty options, accessibility assists, and dynamic hints should respect player identity and pride.
- In co-op, adapt to the group without punishing the strongest player or making the weakest player feel exposed.

## Director Levers

| Lever | Use When | Risk |
|---|---|---|
| Spawn cadence | Waves overwhelm, boredom appears, traversal is too quiet | Obvious rubber-banding |
| Enemy aggression | Combat lacks pressure or becomes oppressive | Cheap deaths, readability loss |
| Resource drops | Scarcity is too high or trivial | Economy inflation, tension collapse |
| Hint timing | Players stall, miss affordances, or repeat failures | Spoiling discovery |
| Checkpoint spacing | Replays waste time after learning has happened | Removing stakes |
| Assist mode | Motor, cognitive, sensory, or difficulty needs arise | Stigma if framed poorly |
| Intensity cooldown | Too many hazards stack at once | Flat pacing if overused |

## Anti-Patterns

- Dynamic difficulty that secretly lowers enemy health after failure without communicating recovery logic.
- PvP or ranked systems that alter accuracy, damage, matchmaking, or resource truth mid-match.
- Directors that only react to death count and ignore confusion, resource depletion, or accessibility context.
- Hint systems that solve puzzles before the player has explored the possibility space.
- Horror pacing that removes all threat after failure and destroys dread.
- Difficulty options that shame players or bury assists in inaccessible menus.

## Agent Checklist

- What player signals are observed, and which are deliberately ignored for fairness?
- Which levers can the director adjust without breaking trust, economy, or genre fantasy?
- How does the intensity curve create peaks, valleys, recovery, and escalation?
- How are assists communicated, opted into, and remembered?
- What telemetry proves the director improved flow instead of hiding design problems?
