# Game Design Tokens

Use when a skill needs a shared semantic vocabulary for game UI, feedback, motion, audio, and systemic meaning. Tokens should describe gameplay purpose first and visual implementation second.

## Token Principles

- A token must answer what state it communicates to the player.
- Do not reuse one color for unrelated meanings such as poison, rare loot, and ally health.
- Pair color with icon, shape, motion, text, or sound so feedback is not color-only.
- Keep combat, economy, faction, biome, and accessibility meanings separate.
- Define reduced-motion and reduced-flash alternatives for intense feedback.
- Treat tokens as contracts across HUD, menus, VFX, audio, and documentation.

## Visual Tokens

### Rarity Colors

| Token | Meaning | Usage |
|---|---|---|
| `rarity.common` | Baseline, abundant, safe | Gray/iron frames, simple sound |
| `rarity.uncommon` | Slightly special, early build hint | Green frame, small glint |
| `rarity.rare` | Strong role, desirable | Blue or cyan frame, sharper pickup cue |
| `rarity.epic` | Build-defining or high-value | Purple/magenta frame, longer reveal |
| `rarity.legendary` | Unique behavior or story | Gold/orange frame, signature audio |
| `rarity.mythic` | Prestige, seasonal, aspirational | Red-gold, prismatic, or bespoke treatment |

Rarity color must never be the only indicator. Use frame shape, icon tier, item name treatment, and audio profile.

### Faction Palettes

| Token | Meaning |
|---|---|
| `faction.player` | Player-owned, controllable, selected |
| `faction.ally` | Friendly AI or teammate |
| `faction.neutral` | Non-hostile, interactable, civilian |
| `faction.enemy` | Hostile but standard |
| `faction.elite` | Higher threat within enemy faction |
| `faction.boss` | Major threat, encounter anchor |
| `faction.corrupted` | Altered, cursed, infected, rogue |
| `faction.hidden` | Unknown, stealth, unrevealed |

Faction palettes must respect colorblind readability. Player versus enemy cannot rely only on red versus green.

### Biome Palettes

Biome tokens carry mood and mechanical implication:

- `biome.forest`: growth, concealment, poison, vertical roots.
- `biome.desert`: heat, scarcity, glare, long sightlines.
- `biome.ocean`: pressure, currents, oxygen, blue-green depth.
- `biome.volcano`: heat, timing hazards, lava, black rock, orange danger.
- `biome.ice`: cold, brittleness, sliding, cyan-white contrast.
- `biome.space`: vacuum, low gravity, stark lighting, warning reds.
- `biome.urban`: signage, lanes, cover, crowds, artificial light.
- `biome.dungeon`: darkness, gates, traps, hidden rewards.

Each biome token should specify at least one gameplay rule.

### Danger And Health Tokens

| Token | Meaning |
|---|---|
| `danger.safe` | No immediate threat, interactable or valid |
| `danger.caution` | Possible risk, warning, patrol, unstable |
| `danger.danger` | Active threat or damage zone |
| `danger.critical` | Near-death, urgent resource, imminent failure |
| `danger.deadly` | Lethal or boss-level warning |
| `health.heal` | Restore, safe recovery |
| `health.shield` | Temporary or preventative protection |
| `health.armor` | Mitigation or durability |

Critical states should combine color, motion, audio, and layout priority.

### Combat Feedback Tokens

| Token | Meaning |
|---|---|
| `combat.hit` | Valid normal hit |
| `combat.crit` | High-value hit |
| `combat.block` | Damage reduced or absorbed |
| `combat.parry` | Perfect defense and counter window |
| `combat.immune` | Wrong tool or protected target |
| `combat.stagger` | Posture or balance broken |
| `combat.interrupt` | Cast, charge, or action canceled |
| `combat.heal` | Recovery event |
| `combat.buff` | Positive temporary modifier |
| `combat.debuff` | Negative temporary modifier |

Combat tokens should match audio and hit reaction. A crit that only changes number color will feel weak.

### Status Effect Tokens

- `status.poison`: damage over time, sickness, green but not ally-green.
- `status.burn`: fire damage, panic, orange/red with heat distortion.
- `status.freeze`: slow or stop, cyan-white, crystallized shapes.
- `status.stun`: agency loss, yellow/white burst, short pulse.
- `status.bleed`: continuing physical damage, dark red, droplet or slash.
- `status.curse`: rule corruption, violet/black, rune distortion.
- `status.shock`: interrupt, chain, electric blue/white.
- `status.stealth`: hidden, low alpha, quiet audio.

Include countdown, stack count, and cleanse affordance when relevant.

## Motion Tokens

### Hitstop Profiles

| Token | Duration at 60 fps | Use |
|---|---:|---|
| `hitstop.light` | 2 frames | Small hits, rapid weapons |
| `hitstop.medium` | 4 frames | Standard melee, readable impact |
| `hitstop.heavy` | 6 frames | Heavy weapon, stagger |
| `hitstop.crit` | 8 frames | Critical hit or weak-point break |
| `hitstop.boss` | 10 frames | Major boss impact, use sparingly |

Always provide reduced-hitstop or reduced-motion settings for sensitive players.

### Dodge Timing Tokens

- `dodge.startup`: frames before invulnerability begins.
- `dodge.iframes`: invulnerable active frames.
- `dodge.travel`: movement distance and curve.
- `dodge.recovery`: frames before full control returns.
- `dodge.cancel`: which actions can transition into or out of dodge.

Show dodge truth through animation, sound, and stamina/resource feedback.

### Recoil Profiles

- `recoil.sidearm`: short kick, fast return.
- `recoil.rifle`: vertical climb, controllable pattern.
- `recoil.shotgun`: heavy kick, wide camera impulse.
- `recoil.sniper`: strong kick, slow return, scope disruption.
- `recoil.heavy`: dramatic impulse, movement penalty.
- `recoil.magic`: hand/camera bloom, rune pulse, cooldown shimmer.

Recoil should affect feel and readability without inducing discomfort.

### Camera Shake Patterns

- `shake.hit`: small directional impulse.
- `shake.crit`: brief high-frequency shake with flash alternative.
- `shake.explosion`: low-frequency falloff by distance.
- `shake.land`: vertical impulse based on fall or weight.
- `shake.ability`: stylized pulse tied to special action.
- `shake.cinematic`: authored moment, never required for aiming clarity.

All shake requires intensity slider and off setting.

### UI Transition Tokens

- `transition.menu`: fast, stable, low distraction.
- `transition.pause`: immediate, no decorative delay.
- `transition.death`: respectful pause, result, retry path.
- `transition.victory`: reward reveal, breathing room, next action.
- `transition.level_load`: progress, tip, world context, no fake interaction.
- `transition.matchmaking`: status, cancel option, latency/region clarity.

## Audio Tokens

### Combat Intensity Layers

- `music.ambient`: exploration, low threat.
- `music.suspense`: possible danger, stealth, mystery.
- `music.combat_light`: standard engagement.
- `music.combat_heavy`: elite pressure or multiple threats.
- `music.boss`: signature motif, phase-aware stems.
- `music.victory`: short release, not overpowering.
- `music.defeat`: clear but non-punitive.

Layer changes should be smooth unless a hard cut is intentional.

### Rarity Audio Cues

- `audio.rarity.common`: soft pickup.
- `audio.rarity.uncommon`: small sparkle.
- `audio.rarity.rare`: brighter chime.
- `audio.rarity.epic`: layered shimmer.
- `audio.rarity.legendary`: signature sting with short silence before it.
- `audio.rarity.mythic`: bespoke motif or voice-like texture.

Audio should reinforce rarity without becoming exhausting during frequent drops.

### Emotional Music States

- `emotion.calm`: safe, hub, crafting, pastoral.
- `emotion.tense`: threat implied, incomplete information.
- `emotion.triumphant`: victory, reveal, mastery.
- `emotion.melancholic`: loss, memory, reflection.
- `emotion.desperate`: low health, timer, chase.
- `emotion.mysterious`: unknown space, puzzle, lore.

## Agent Checklist

- Are visual tokens tied to gameplay meaning?
- Are combat, rarity, faction, biome, and status colors distinct enough?
- Is color paired with icon, shape, sound, or motion?
- Are hitstop, recoil, shake, and transitions defined with reduced-motion fallbacks?
- Do audio tokens reinforce state without spamming the player?
- Can a HUD, GDD, economy sheet, and playable concept all reuse the same token names?
