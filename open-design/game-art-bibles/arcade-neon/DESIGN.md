# Arcade Neon
> Category: Game Art Direction
> Electric arcade cabinets, rhythm-action feedback, glowing HUDs, combo meters, and high-contrast score-chasing game UI.

## 1. Art Direction & Atmosphere

Arcade Neon is loud, immediate, and legible under speed. It should feel like a premium cabinet screen: black glass, saturated tubes, bright scoring bursts, hard silhouettes, and motion that snaps into place. The style works for arena shooters, rhythm games, racing, twin-stick action, score attack, party games, and futuristic sports.

The background can be dark, but the game state cannot be muddy. Use darkness as contrast for readable lanes, targets, projectiles, beats, and combo moments. Avoid generic purple-blue gradients that have no gameplay meaning; every glow should identify a lane, faction, pickup, hazard, rarity, cooldown, or score event.

## 2. Color Palette & Semantic Roles

Core palette:

- Void glass: `oklch(10% 0.025 260)` for deep playfield backgrounds.
- Cabinet black: `oklch(15% 0.035 260)` for panels and HUD rails.
- Electric cyan: `oklch(82% 0.22 205)` for player energy, selection, and primary action.
- Hot magenta: `oklch(72% 0.26 335)` for combo, rhythm, and special charge.
- Acid green: `oklch(86% 0.23 140)` for valid pickups, speed boosts, and perfect timing.
- Warning amber: `oklch(82% 0.18 70)` for caution, near-overheat, and timed objectives.
- Danger red: `oklch(62% 0.25 25)` for lethal hazards and enemy burst states.

Gameplay tokens:

- Player and ally: cyan with crisp white core.
- Enemy: red or orange outlines with distinct angular shapes.
- Neutral interactable: green with rounded icon shape.
- Combo and score: magenta, white, and cyan pulses.
- Perfect timing: green-white flash and clean sound.
- Cooldown: desaturated cyan ring filling clockwise.
- Overheat or fail risk: amber pulse that accelerates before turning red.
- Legendary or jackpot: gold-white with prismatic edge, used rarely.

Never communicate enemy versus ally only with red/green. Pair color with shape, outline style, icon, and motion direction.

## 3. Typography Rules

Use square, extended, or techno display faces for score, round labels, and mode titles. Use a compact readable sans for objective text, settings, accessibility, and longer labels. Numbers should be tabular and large enough to read while moving.

Text hierarchy:

- Score and timer are highest priority during arcade modes.
- Combo multiplier can be oversized only when it does not cover threats.
- Objective callouts should be short: "CAPTURE", "BOOST READY", "FINAL LAP".
- Avoid paragraph copy during gameplay; move rules and summaries to pause/result screens.

Use all caps sparingly for rhythm and command energy. Do not use condensed fonts for small resource labels.

## 4. HUD Density & Layout

Arcade Neon supports dense HUDs, but the playfield must remain clean.

- Top center: timer, wave, lap, beat, or round state.
- Top corners: score, rank, team score, lives, or player count.
- Bottom center: boost, super, weapon heat, rhythm lane, or special meter.
- Bottom corners: ammo, ability cooldowns, mini loadout.
- Edge flashes: damage direction, ring-out warning, near miss, off-screen threat.

Use stable dimensions for score boxes and meters so digit changes do not resize the HUD. Keep the center reticle, hit lane, or driving line unobstructed.

## 5. Gameplay Module Styling

- Buttons: dark glass base, bright outline, 1-2px inner highlight, fast hover bloom.
- Score plates: hard rectangles or clipped octagons with glow only on active states.
- Progress bars: neon core with darker track and tick marks.
- Combo meters: stacked segments, multiplier badge, decay warning.
- Leaderboards: compact rows, player color chips, rank icons, last-score movement.
- Pickups: simple icon silhouette with outer ring and rarity pulse.
- Warnings: animated border or lane marker before screen-wide flash.

Cards should be limited to result rows, upgrade choices, and repeated store items. Do not nest cards inside glowing cards.

## 6. Motion, Game Feel & Feedback

Arcade motion is fast, precise, and rhythmic.

- Button hover: 80-120 ms.
- Selection snap: 100-160 ms with overshoot under 4 px.
- Score increment: count quickly, then snap to final value.
- Combo gain: small punch scale and magenta pulse.
- Combo decay: amber flicker, shrinking ring, lower-pitched warning.
- Hitstop: light and medium profiles; reserve heavy for finisher or boss break.
- Camera shake: directional, brief, and intensity-scaled.

Reduced motion mode should preserve state changes through opacity, outline, number, and audio alternatives.

## 7. VFX, Materials & Shader Direction

Use emissive lines, bloom edges, scanline texture, chromatic fringe, and hard-edged particle trails. Bloom must not wash out icons or numbers. Reserve heavy glitch for damage, overload, teleport, or boss interference.

Scene materials:

- Black glass and polished plastic for cabinets, menus, and vehicles.
- Neon tube outlines for routes, gates, arenas, pickups, and scoring zones.
- Thin wireframe grids for depth and speed.
- Pixel bursts, vector sparks, and afterimages for hits.

Avoid smoky cinematic particles that obscure projectiles. Arcade VFX should be graphical and readable.

## 8. Audio Direction Tokens

- UI select: short bright blip.
- Confirm: two-tone upward chirp.
- Error: low clipped buzz, never too harsh.
- Combo gain: rising arpeggio or stacked ticks.
- Combo break: short drop sound with silence after.
- Perfect: clean bell or laser ping.
- Jackpot/legendary: brief flourish with controlled tail.
- Danger: tempo-synced pulse that accelerates.

Match audio intensity to gameplay intensity. Do not let menu sounds compete with music gameplay.

## 9. Do's and Don'ts

Do:

- Tie every glow color to a gameplay token.
- Keep projectiles and hazards brighter or more shaped than decoration.
- Use black space to improve speed readability.
- Make combo and score feedback joyful but brief.
- Offer reduced bloom, reduced flash, and screen shake sliders.

Do not:

- Fill the background with decorative orbs or unrelated gradients.
- Use neon text for long copy.
- Hide enemy shots inside same-color VFX.
- Shake the camera on every small collision.
- Let glow effects blur HUD numbers.

## 10. Agent Prompt Guide

When using Arcade Neon, always specify the scoring verb, combo rule, fail condition, and timing feedback. Include semantic color assignments for player, enemy, pickups, hazards, perfect timing, cooldowns, and score bursts. Prefer playable, high-contrast compositions with stable HUD zones, strong silhouettes, and fast result screens.
