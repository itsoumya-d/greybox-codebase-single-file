# Player Progression Systems

Use when designing XP, levels, unlocks, skill trees, mastery, prestige, gear score, reputation, collections, and long-term player growth. Progression is not merely accumulation; it is the player's changing relationship to the game.

## What To Produce

- Progression fantasy: what the player becomes over time.
- Growth axes: power, options, mastery, identity, social status, story, collection, territory, or knowledge.
- Unlock cadence by session, chapter, level band, or season.
- XP or reward curve with target time-to-level.
- Build planning model: classes, perks, trees, gear, respecs, and constraints.
- Catch-up, alt-character, and late-entry support.
- Endgame and prestige plan.

## Growth Axes

Use multiple growth axes so progression does not collapse into raw power.

| Axis | Player Feeling | Good For |
|---|---|---|
| Power | "I hit harder and survive more." | RPGs, action, live service |
| Options | "I can solve problems differently." | Immersive sims, tactics, roguelikes |
| Mastery | "I understand and execute better." | Fighting, racing, soulslike, strategy |
| Identity | "This build expresses me." | RPGs, cosmetics, class games |
| Access | "New spaces and stories open." | Metroidvania, adventure, open world |
| Social | "Others recognize my role or rank." | Multiplayer, guilds, ranked |
| Collection | "My library, town, team, or museum grows." | Cozy, gacha, sports, creature games |

Power growth without option growth becomes treadmill. Option growth without clarity becomes paralysis. Mastery growth without visible progress can feel invisible to less competitive players.

## XP And Level Curves

Tune XP curves by time, not only points.

```text
target_time_to_level:
  levels 1-5: 5-12 minutes each
  levels 6-15: 20-45 minutes each
  levels 16-30: 1-2 sessions each
  late game: milestone or mastery based
```

Use early levels to teach and affirm. Use mid-game levels to branch identity. Use late-game levels to refine, specialize, or prestige.

Curve types:

- Linear: clear and forgiving, good for early progression.
- Polynomial: common RPG curve, grows steadily.
- Milestone: story, boss, quest, or chapter gates.
- Skill-based: ranked or mastery progression.
- Hybrid: XP for general growth, milestones for major unlocks.

Avoid dead levels. If a level cannot grant a perk, it can grant a point toward a visible choice, a cosmetic, a lore entry, a stat choice, or a new objective.

## Unlock Cadence

Unlocks should arrive before repetition turns stale.

- First 10 minutes: one new verb or modifier.
- First hour: build direction becomes visible.
- Early mid-game: player commits to a style but can still recover.
- Mid-game: systems combine and reveal depth.
- Late-game: specialization, mastery, prestige, or social goals.

Do not unlock every system at once. Progression is a teaching schedule.

## Skill Trees

Skill trees should be readable maps of identity.

Strong trees have:

- Clear branches with distinct player fantasies.
- Early low-risk choices.
- Later build-defining nodes.
- Cross-branch synergies.
- Previewable outcomes.
- Respec rules that respect experimentation.
- Few mandatory boring nodes.

Weak trees force players through tiny stat nodes before reaching interesting decisions. If a node only says "+2 percent damage", combine it with a visible behavior change or remove it.

## Classes And Builds

Classes should express different decision patterns.

| Role | Primary Question | Tuning Need |
|---|---|---|
| Tank | What should I absorb or redirect? | Threat, mitigation, control |
| Striker | When can I safely burst? | Risk, uptime, target access |
| Controller | Where should pressure exist? | Area rules, cooldowns |
| Support | Who needs help and when? | Clarity, agency, contribution credit |
| Summoner | What should act independently? | AI clarity, performance, balance |
| Hybrid | Which mode fits this moment? | Avoid best-at-everything collapse |

Builds need meaningful tradeoffs. If every optimal build chooses the same damage, defense, and utility nodes, the tree is pretending to branch.

## Gear Progression

Gear should support identity, not constantly invalidate player attachment.

- Use clear item roles: starter, sidegrade, upgrade, build-around, prestige, cosmetic.
- Let players compare tradeoffs beyond green up arrows.
- Avoid replacing favorite gear every few minutes unless the genre expects loot churn.
- Provide upgrade paths, transmog, crafting, or infusions for attachment.
- Cap or normalize gear where multiplayer fairness requires it.

Gear score can guide readiness, but it should not hide the interesting stats.

## Mastery And Prestige

Mastery systems reward understanding.

- Grade systems: level clear rank, combat style, stealth rating.
- Challenges: optional constraints, speed, no-damage, puzzle variants.
- Badges: social proof without mandatory power.
- Prestige: reset for status or alternate growth; must be transparent.
- Seasonal mastery: finite goals with catch-up.

Prestige should never surprise-remove value. Players must understand what resets, what stays, and why it is worth doing.

## Catch-Up And Respec

Healthy progression lets players recover from ignorance.

- Early respecs should be cheap or free.
- Late respecs can have cost but should not be punitive.
- New players joining friends need catch-up paths.
- Returning players need reorientation and partial currency recovery.
- Alts should inherit account knowledge, cosmetics, or convenience where appropriate.

Permanent choices are powerful only when players can understand consequences. If consequences are opaque, permanence becomes resentment.

## Anti-Patterns

- Dead levels with no visible change.
- Skill trees made of small passive stats and no playstyle shifts.
- Early irreversible choices before the player understands the game.
- Endgame that erases build diversity through one dominant stat.
- Gear churn that makes rewards feel disposable.
- Prestige systems that reset progress without clear value.
- Catch-up mechanics that make veteran effort feel pointless.

## Agent Checklist

- What fantasy of growth does the system deliver?
- Does progression add decisions, identity, mastery, or access beyond numeric power?
- Is time-to-level tuned by expected session length?
- Are unlocks paced as a teaching schedule?
- Can players experiment and recover from early mistakes?
- Does endgame offer mastery or expression instead of endless inflation?
