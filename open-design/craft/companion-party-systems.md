# Companion And Party Systems

Companion and party systems combine narrative attachment with playable tactical identity. Use this guide when a game needs companion personalities, relationship progression, loyalty, betrayal, squad commands, party composition, tactical synergy, dialogue reactions, or party balance.

## What To Produce

- Party promise: why companions matter in play, story, exploration, combat, or social identity.
- Companion roster: role, silhouette, combat style, utility verb, personality, motive, conflict, and onboarding complexity.
- Relationship model: trust, loyalty, approval, rivalry, romance, mentorship, duty, betrayal risk, or faction allegiance.
- Tactical model: squad commands, party slots, role limits, combo skills, positioning rules, cooldown sharing, revival, and fail states.
- Narrative reactivity: banter, quest reactions, world-state comments, morality responses, personal quests, and branch merge points.
- Production constraints: companion count, VO load, animation set, AI behavior budget, localization, QA matrix, and save-state complexity.

## Design Rules

- Give every companion both a gameplay reason and a narrative reason to exist. A companion who is only a stat buff becomes loadout clutter.
- Make party composition a choice with tradeoffs, not a solved equation. Roles should overlap enough to prevent mandatory picks.
- Keep loyalty readable. Players should understand why approval changes, when a companion may leave, and how to recover trust.
- Put companion AI under player trust. Commands, stance settings, target priority, and retreat/rescue logic prevent surprise failure.
- Merge expensive branches. Emotional consequences can differ while quest routing, locations, and cinematics converge.
- Protect accessibility. Squad commands need readable prompts, pause/slow options when appropriate, remappable input, and subtitle/VO clarity.

## Party Balance Levers

| Lever | Use | Watch For |
|---|---|---|
| Party slots | Controls complexity and role pressure | Mandatory meta compositions |
| Role overlap | Prevents lock-in | Loss of identity if too broad |
| Combo skills | Creates tactical expression | Burst exploits, unreadable VFX |
| Loyalty perks | Connects story to play | Punishing roleplay choices |
| AI stances | Improves player trust | Too many hidden behaviors |
| Personal quests | Builds attachment | Branch explosion and VO load |
| Rivalry/betrayal | Adds drama | Frustration if stakes are unclear |

## Production Budgeting

- Companion roster size multiplies writing, VO, animation, banter, romance/friendship variants, quest reactivity, QA, and localization.
- Combat companions need behavior trees, target selection, navmesh edge cases, revive logic, friendly-fire rules, and difficulty scaling.
- Narrative companions need state variables, approval history, personal quest gates, scene participation rules, and branch fallback lines.
- Co-op games need a clear rule for whether companions vanish, become NPC support, or stay as private party members.

## Anti-Patterns

- Companion approval that changes without clear motive, readable feedback, or recovery path.
- Party members that solve puzzles or combat before the player understands the mechanic.
- Mandatory healer/tank/support picks that collapse build diversity.
- Personal quests that permanently remove a crucial gameplay role without a replacement plan.
- Banter frequency that interrupts stealth, horror tension, tutorials, or accessibility needs.

## Agent Checklist

- What does each companion let the player do that no other party member does?
- How do relationships change through play, not only dialogue?
- Which party compositions are viable, expressive, and readable?
- How does squad AI preserve player trust and counterplay?
- What content budget keeps companion reactivity feasible?
