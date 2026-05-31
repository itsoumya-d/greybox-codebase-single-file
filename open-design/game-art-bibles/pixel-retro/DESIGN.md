# Pixel Retro
> Category: Game Art Direction
> Sprite-based platformers, RPGs, arcade adventures, retro menus, tilemaps, readable pixels, and nostalgic low-resolution game UI.

## 1. Art Direction & Atmosphere

Pixel Retro should feel intentional, not merely low fidelity. It uses constrained resolution, hard edges, limited palettes, tile logic, sprite silhouettes, chunky icons, and crisp feedback. It supports platformers, roguelikes, JRPG-inspired menus, creature collectors, tactics, arcade games, and small-scope indie playable concepts.

The rule is consistency. Pixel size, outline weight, camera scale, animation timing, and UI borders should share a grid. Avoid mixing blurred raster art, smooth vector icons, and high-resolution gradients unless the contrast is intentionally framed as a modern overlay.

## 2. Color Palette & Semantic Roles

Pixel palettes should be small and named by purpose.

Core palette example:

- Ink: `oklch(13% 0.035 260)` for outlines and deep shadow.
- Night blue: `oklch(24% 0.08 260)` for background depth.
- Bone: `oklch(88% 0.04 80)` for text and highlight.
- Grass: `oklch(68% 0.14 145)` for safe terrain and health.
- Coin gold: `oklch(82% 0.15 85)` for rewards and interactables.
- Damage red: `oklch(58% 0.18 30)` for harm and enemy warning.
- Magic violet: `oklch(62% 0.16 300)` for special power.
- Water cyan: `oklch(76% 0.13 215)` for water, ice, and cool UI.

Gameplay tokens:

- Player: highest-contrast outline and unique silhouette.
- Enemy: red/orange accents plus angular or aggressive silhouette.
- Collectible: gold or bright bone with sparkle frame.
- Exit/goal: cyan or gold with animated tile edge.
- Damage: red flash, knockback, and invulnerability blink.
- Secret: off-palette hint, suspicious tile, or audio cue.
- Rare item: palette shift plus frame pattern; no smooth glow.

Limit simultaneous colors on a sprite. Readability comes from shape and contrast more than hue count.

## 3. Typography Rules

Use bitmap or pixel-inspired fonts only when they remain readable at target scale. Avoid tiny 1x pixel fonts on modern high-DPI screens. Body text for dialogue, settings, and tooltips can use a crisp sans that aligns with pixel rhythm.

Rules:

- Use integer scaling for pixel fonts and UI frames.
- Use tabular digits for HP, ammo, score, and timers.
- Keep dialogue lines short.
- Avoid subpixel letter spacing and blurred transforms.
- Do not use faux-pixel fonts for long GDD-style documents.

Pixel text must snap cleanly. A blurry pixel font breaks the art direction immediately.

## 4. HUD Density & Layout

Pixel UI should be compact and stable.

- Top-left: hearts/HP, lives, or character portrait.
- Top-right: currency, key items, timer, score.
- Bottom: action bar, dialogue, item row, or boss message.
- Center: avoid large overlays during platforming or bullet patterns.
- Pause/menu: tile-framed panels, clear tabs, simple selector.
- Inventory: grid slots with pixel icons, stack count, rarity border.

Use borders in 1x/2x pixel increments. Keep icons aligned to an 8px or 16px base grid.

## 5. Gameplay Module Styling

- Windows: 1-3 pixel border, darker outer edge, light inner edge.
- Buttons: rectangular pixel plates with selected outline or arrow cursor.
- Dialogue: portrait, name plate, text box, input prompt.
- Health: hearts, bars, pips, or small portrait states.
- Ability slots: square tile with cooldown wipe or dimmed state.
- Maps: tile-based rooms, doors, discovered/undiscovered states.
- Shops: item icon, price, owned count, short description.

Use animated cursor arrows, blinking carets, and small tile flips for charm, but do not animate every control.

## 6. Motion, Game Feel & Feedback

Pixel animation is about frame economy.

- Idle: 2-6 frames, low amplitude.
- Walk/run: clear contact frames.
- Attack: anticipation, active hit frame, recovery.
- Jump: squash/launch, apex, landing if style supports it.
- Hit: 1-frame flash, knockback, brief invulnerability blink.
- Pickup: icon pop or sparkle, sound, counter update.
- Menu select: cursor snap and short tick.
- Screen transition: wipe, tile dissolve, shutter, or palette fade.

Do not interpolate sprites smoothly if the rest of the game uses frame-stepped animation. If using modern smooth camera, keep sprite scale integer and avoid shimmering.

## 7. VFX, Materials & Tile Direction

VFX should be pixel-native:

- 1-bit or low-color spark particles.
- Tile cracks, dust puffs, star pops.
- Palette swaps for status effects.
- Simple slash arcs and impact bursts.
- Dithered shadows and gradients where appropriate.
- Water, lava, poison, and magic with tiled animation cycles.

Tilemaps need rule clarity: walkable, wall, hazard, ladder, platform, door, secret, breakable, one-way. Use tile shape and edge treatment to distinguish function.

## 8. Audio Direction Tokens

- Menu select: short blip.
- Confirm: brighter arpeggio.
- Error: low square-wave tick.
- Jump: simple pitch-up sound.
- Damage: crunchy noise plus brief silence.
- Pickup: coin, gem, or soft chime by rarity.
- Secret found: short motif.
- Boss intro: low pulse with limited channels.

Retro audio can be chiptune-inspired without being harsh. Mix for long sessions.

## 9. Do's and Don'ts

Do:

- Define pixel scale, tile size, and sprite outline rules.
- Keep palettes constrained and semantic.
- Use shape for enemy, ally, item, and hazard distinction.
- Make hitboxes feel aligned with sprites.
- Provide modern accessibility settings even with retro visuals.

Do not:

- Mix blurred images with crisp pixel sprites.
- Resize sprites at non-integer scales.
- Use dense pixel fonts for long paragraphs.
- Add modern bloom and gradients over every element.
- Hide hazards in decorative tile noise.
- Treat retro as an excuse for missing state coverage.

## 10. Agent Prompt Guide

When using Pixel Retro, specify base resolution, tile size, sprite scale, palette count, camera style, HUD slot grid, animation frame counts, and state feedback. Favor crisp silhouettes, constrained colors, meaningful tile rules, and modern usability wrapped in retro presentation.
