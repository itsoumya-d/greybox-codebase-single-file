---
name: game-art-bible
description: |
  Game art bible / game systems framework: visual identity, palette, typography, HUD tokens, shape language, characters, environments, props, FX, animation, and implementation prompt guide.
triggers:
  - art bible
  - game systems framework
  - visual identity
  - style guide
agds:
  mode: game-art-bible
  surface: web
  scenario: world
  featured: 1
  preview:
    type: markdown
  game_art_bible:
    requires: false
  craft:
    requires: [2d-art-direction, 3d-scene-composition, hud-readability, accessibility-for-games]
  game:
    rendering: static-html
  example_prompt: "Create a game art bible for a cozy sky-island exploration game: palette, typography, UI tokens, player/NPC shape language, island biomes, props, VFX, animation rules, and prompt guide."
---

# Game Art Bible

Produce a `DESIGN.md`-style art bible that downstream game skills can use.

## Required Sections

1. Game fantasy and pillars
2. Art direction and mood
3. Palette and token roles
4. Typography and UI text rules
5. HUD/menu gameplay module styling
6. Character, enemy, and NPC shape language
7. Environment, props, materials, and VFX
8. Motion, feedback, and game feel
9. Responsive/platform behavior
10. Agent prompt guide

## P0 Gates

- Tokens are concrete enough to bind into CSS.
- The style covers gameplay, menus, HUD, characters, environments, and FX.
- Do's/don'ts prevent non-game output.
