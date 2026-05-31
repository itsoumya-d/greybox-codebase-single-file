# Game Economy Balancing

Use when designing currencies, loot, crafting, upgrade costs, shops, drops, scarcity, monetization, and long-term value. Economy design is the control of attention and desire through sources, sinks, gates, and tradeoffs.

## What To Produce

- Currency list with purpose, source, sink, cap, exchange rules, and spend priority.
- Reward table by activity, time, risk, and player level.
- Cost curves for upgrades, crafting, repairs, cosmetics, and unlocks.
- Loot table with rarity odds, pity rules if any, duplicate handling, and transparency notes.
- Inflation and hoarding controls.
- Monetization ethics and pay-to-win risk assessment.
- Economy health metrics for live tuning.

## Currency Roles

Each currency needs a distinct reason to exist.

| Currency Type | Purpose | Risk |
|---|---|---|
| Soft currency | Frequent upgrades, shops, repairs | Inflation, hoarding |
| Premium currency | Paid or rare high-value spends | Trust loss if opaque |
| Crafting material | Item recipes and upgrade paths | Inventory clutter |
| Time-gated token | Pace progression or live events | Obligation pressure |
| Social currency | Guild, clan, reputation, trade | Exploits, boosting |
| Skill currency | Earned through mastery, ranked, raids | Exclusion, frustration |

Do not add currencies because a screen feels empty. Add a currency only when it creates a different decision.

## Sources And Sinks

Every source needs a sink. Every sink needs emotional justification.

Sources:

- Completing levels, quests, matches, raids, or contracts.
- Selling items or converting materials.
- Daily or weekly goals.
- Exploration and secrets.
- Social contribution.
- Live events.
- Direct purchase, if monetized.

Sinks:

- Upgrades, crafting, repair, rerolling, respecs.
- Cosmetics, housing, collection, personalization.
- Entry fees, travel, convenience, auction taxes.
- Guild contribution and community goals.
- Seasonal progression.

Healthy sinks are desirable and optional enough to preserve agency. Mandatory repair taxes can support survival pressure, but they become irritating if they only delay fun.

## Cost Curves

Cost curves should express pacing goals.

- Linear: predictable, good for early onboarding.
- Exponential: strong long-term gate, dangerous if too steep.
- Step curve: unlock tiers, chapters, ranks, or equipment grades.
- Soft cap: lets investment continue with diminishing returns.
- Parallel cost: requires multiple resources to prevent one farming route dominating.

Example upgrade curve:

```text
cost(level) = base_cost * level^1.65
time_to_upgrade_target:
  early: 5-12 minutes
  mid: 20-45 minutes
  late: 1-3 sessions
```

Tune by time-to-afford, not only by numeric cost. A 10,000 gold upgrade means different things if a quest pays 50 or 5,000.

## Loot Tables

Loot should support build goals, surprise, and fairness.

Define:

- Drop source and eligible item pool.
- Rarity odds.
- Level band or power range.
- Duplicate rules.
- Bad luck protection.
- Target farming paths.
- Trade, dismantle, or pity conversion.
- UI transparency.

Randomness is strongest when players can influence it. Use bosses, biomes, factions, crafting, vendors, or quests to narrow pools.

## Rarity And Value

Rarity should change more than color.

- Common: baseline utility, crafting input, early readability.
- Uncommon: small modifier or build hint.
- Rare: clear role, stronger stat identity.
- Epic: build-defining interaction.
- Legendary: unique behavior, story, or visual identity.
- Mythic: aspirational, limited, or prestige; must not break fairness.

Avoid rarity inflation. If players receive legendary items constantly, legendary becomes a color rather than a promise.

## Crafting Economy

Crafting works when players can plan.

- Recipes should show required inputs and likely outputs.
- Rare materials need understandable sources.
- Failure or random rolls need pity, preview, or refund logic.
- Durability and repair should reinforce the game fantasy, not create busywork.
- Salvage should turn duplicates into forward progress.
- Crafting stations, NPCs, or biomes can create meaningful routes.

In survival games, crafting is often the core loop. In RPGs, crafting is build expression. In cozy games, crafting is ritual and collection. Tune friction to the genre.

## Monetization Fairness

If monetization exists, evaluate trust first.

- Show real probabilities where randomized purchases exist.
- Separate cosmetic value from competitive power.
- Avoid dark patterns, disguised prices, and pressure timers.
- Provide spending limits or parental controls where appropriate.
- Keep free progression dignified and complete.
- Never sell relief from intentionally painful design.
- Make battle pass progress transparent and realistically finishable.

Pay-to-win risk rises when money buys power, bypasses matchmaking integrity, or turns social competition into spending competition.

## Economy Health Metrics

Track:

- Currency earned per session.
- Currency spent per session.
- Balance distribution across player cohorts.
- Time-to-upgrade by level band.
- Loot acquisition by rarity.
- Duplicate frustration rate.
- Drop-to-use conversion.
- Store conversion, refund, and complaint signals.
- Churn around gates, repairs, and event deadlines.

Metrics diagnose symptoms; they do not replace playtesting. A high sink rate may mean healthy demand or predatory pressure depending on player sentiment.

## Anti-Patterns

- Multiple currencies with overlapping purpose.
- Upgrade costs tuned from spreadsheets but not session length.
- Loot pools so wide that target farming feels hopeless.
- Duplicates that produce no value.
- Late-game hoarding because sinks stop mattering.
- Monetization that sells solutions to avoidable frustration.
- Event currencies that expire before normal players can use them.

## Agent Checklist

- Does every currency have a source, sink, cap, and player-facing purpose?
- Are costs expressed in expected play time as well as numbers?
- Can players pursue desired loot through skill or choice, not only luck?
- Do duplicates convert into meaningful progress?
- Are monetized systems transparent, optional, and non-exploitative?
- What economy metric would reveal inflation, hoarding, or burnout?
