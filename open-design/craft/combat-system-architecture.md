# Combat System Architecture

Use when designing attacks, defense, damage, enemy pressure, weapon identity, and combat feel. Combat quality comes from readable commitments and satisfying consequences, not from a long list of verbs.

## What To Produce

- A combat loop with attack, defense, repositioning, resource, and recovery states.
- A timing model for player actions and enemy actions.
- Weapon or class archetypes with different risk profiles.
- Enemy roles with tells, threat ranges, counters, and group behavior.
- Damage, defense, status, and scaling formulas with tuning levers.
- Feedback rules for hit, crit, block, parry, immune, stagger, interrupt, defeat, and recovery.

## Timing Windows

Every action that affects combat should define these windows:

| Window | Meaning | Tuning Notes |
|---|---|---|
| Startup | Time before effect can connect | Makes actions readable and punishable |
| Active | Frames or seconds where hit/effect applies | Shorter active windows reward precision |
| Recovery | Time before next full action | Creates commitment and counterplay |
| Cancel | Allowed transition to dodge, block, chain, skill, or item | Controls skill ceiling and combo feel |
| Hitstop | Brief freeze on impact | Adds weight; keep readable and brief |
| Hitstun | Defender control loss after hit | Enables combos; too much removes agency |
| Blockstun | Defender delay after block | Makes blocking safe but not free |
| I-frames | Invulnerable frames | Must be teachable and consistent |
| Cooldown | Reuse delay for skill or item | Prevents spam; should match power fantasy |

Write timings in seconds for design docs and frames for implementation specs. When targeting 60 fps, 3 frames is 50 ms, 6 frames is 100 ms, and 12 frames is 200 ms.

## Action Commitment

Powerful actions need commitment. Commitment can be startup, recovery, stamina cost, ammo cost, positional lock, cooldown, visibility, sound, vulnerability, or opportunity cost.

Low-commitment actions should be weak, utility-focused, or setup-oriented. High-commitment actions should produce stronger payoffs, clearer spectacle, or strategic control.

The player should understand why they were punished:

- They attacked into a tell.
- They spent stamina too aggressively.
- They ignored spacing.
- They used the wrong damage type.
- They stayed in a danger zone after warning.

Opaque punishment reads as unfair, even when mathematically balanced.

## Weapon And Verb Archetypes

Give each archetype a distinct answer to range, timing, risk, and crowd control.

| Archetype | Strength | Weakness | Primary Decision |
|---|---|---|---|
| Fast melee | Pressure, interrupts, mobility | Low reach, low stagger | When to stay close |
| Heavy melee | Stagger, armor break, burst | Long recovery | When to commit |
| Ranged precision | Safety, weak-point damage | Ammo, aim, reload | When to expose for line of sight |
| Area control | Groups, zoning, denial | Friendly fire, cooldown | Where to place pressure |
| Shield/guard | Stability, rescue, parry | Low chase, resource drain | What to absorb or counter |
| Summon/trap | Preparation, delayed payoff | Setup time, vulnerability | How to shape space |

Avoid weapon sets where one option is simply better in every scenario. If a weapon has higher damage, it should lose on speed, noise, flexibility, cost, or safety.

## Enemy Roles

Encounters need roles, not random bags of attacks.

- Grunt: teaches fundamentals, creates rhythm, dies quickly.
- Bruiser: controls space, resists interruption, demands timing.
- Sniper: pressures positioning and line of sight.
- Flanker: punishes tunnel vision and static play.
- Defender: shields allies, changes target priority.
- Controller: applies zones, slows, pulls, disables, or separates.
- Summoner: creates urgency through adds or hazards.
- Elite: combines roles with stronger tells and larger rewards.
- Boss: tests multiple learned mechanics with escalation.

Group enemies so their pressures create decisions. Three flankers may feel chaotic; one bruiser, one sniper, and two grunts creates a readable priority puzzle.

## Damage And Scaling

Damage formulas should expose tuning levers and prevent runaway builds.

Common inputs:

- Base weapon or ability damage.
- Stat scaling coefficient.
- Enemy defense, armor, shield, posture, or resistance.
- Multipliers from crit, weak point, status, stealth, combo, range, or condition.
- Floors and caps to prevent zero-damage or one-shot collapse.

Use soft caps before hard caps when possible. A soft cap lets investment keep meaning while reducing runaway returns.

Example structure:

```text
raw_damage = base + stat * coefficient
mitigated = raw_damage * (100 / (100 + defense))
final = clamp(mitigated * situational_multipliers, min_damage, max_damage)
```

Do not hide all math from players. They do not need every coefficient, but they need enough to make build choices confidently.

## Defense Systems

Defense should be an active design space, not only health.

- Dodge rewards timing and positioning.
- Block rewards facing, stamina management, and anticipation.
- Parry rewards timing mastery and enemy knowledge.
- Armor rewards preparation and build planning.
- Resistance rewards encounter reading and equipment choice.
- Posture rewards sustained pressure and risk.
- Shields create a recoverable buffer but can make chip damage feel meaningless if overused.

Each defense needs a failure mode. Infinite dodge, infinite block, and passive armor stacking flatten combat.

## Status Effects

Status effects are combat verbs. Each should have a purpose.

| Status | Purpose | Counterplay |
|---|---|---|
| Burn | Damage over time, panic pressure | Roll, cleanse, water, wait |
| Poison | Long pressure, resource drain | Antidote, rest, immunity build |
| Freeze | Crowd control, burst setup | Warm zone, break action, resistance |
| Shock | Interrupts, chain damage | Grounding, spacing, cooldown awareness |
| Bleed | Rewards repeated hits | Bandage, armor, stop aggression |
| Stun | Creates burst window | Diminishing returns, strong tell |
| Curse | Changes rules or risk | Quest, shrine, rare cleanse |

Diminishing returns are essential when status removes agency, especially in multiplayer.

## Feedback Rules

Combat feedback must tell the truth at gameplay speed.

- Hit: immediate sound, flash, number or health movement, reaction.
- Crit: sharper audio, distinct color, stronger but brief effect.
- Block: muted impact, angle or shield cue, reduced damage.
- Parry: bright timing cue, clean sound, enemy recoil, punish window.
- Immune: clear "wrong tool" language, no misleading damage effect.
- Stagger: body pose, posture break, window duration.
- Interrupt: canceled animation and readable cause.
- Defeat: release of tension, loot/readiness signal, threat removed.

Feedback should scale with importance. If every hit shakes the camera like a boss finisher, players lose state clarity.

## Difficulty And Fairness

Do not scale difficulty only by increasing health and damage. Use:

- New enemy combinations.
- Faster but still readable tells.
- Additional arena hazards.
- Resource scarcity.
- Objective pressure.
- Smarter target selection.
- More complex phase sequencing.

Fair combat gives the player enough information to blame a decision, not the interface.

## Accessibility

Combat accessibility can preserve mastery while widening access:

- Timing assist or wider parry windows.
- Reduced camera shake and flash.
- Input buffering and hold/toggle options.
- Auto-target strength settings.
- Color-independent status cues.
- Subtitles and visual threat indicators.
- Difficulty sliders for enemy aggression, damage taken, resource pressure, and timing windows.

Avoid assists that conceal the combat language. A parry assist should still teach when the parry happened.

## Anti-Patterns

- Enemies with no tell before high-damage attacks.
- Long hitstun chains where the player cannot learn or recover.
- Damage formulas where one stat dominates every build.
- Weapons with different skins but identical spacing, timing, and risk.
- Bosses that become difficult only through health inflation.
- Effects that hide enemies, projectiles, or ground danger.
- Critical feedback and normal feedback that look nearly identical.

## Agent Checklist

- Are startup, active, recovery, cancel, hitstop, and cooldown windows defined?
- Does every powerful action have cost or counterplay?
- Are enemy roles readable before they punish the player?
- Can the player identify hit, block, parry, crit, immune, and stagger instantly?
- Do formulas have caps, floors, and tuning levers?
- Does difficulty introduce new decisions rather than only larger numbers?
- Are timing, flash, and input demands adjustable for accessibility?
