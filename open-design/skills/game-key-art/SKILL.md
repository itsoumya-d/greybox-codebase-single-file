---
name: game-key-art
description: |
  Game image prompt skill for key art, splash screens, characters, environments, icons, props, UI panels, sprite references, 2D/3D look-dev, and store capsules.
triggers:
  - key art
  - splash art
  - game asset
  - character concept
agds:
  mode: image
  surface: image
  scenario: asset
  featured: 1
  default_for: image
  preview:
    type: image
  craft:
    requires: [2d-art-direction, 3d-scene-composition]
  game:
    rendering: static-html
  example_prompt: "Generate key art prompts for a tactical sci-fi roguelite: hero silhouette, enemy drone, crashed facility environment, UI panel texture, ability icon set, and 16:9 splash composition."
---

# Game Key Art

Plan image generations as production references for a game.

## Requirements

- Name the asset type and use context: splash, character, prop, environment, icon, UI texture, sprite reference, store capsule.
- Specify camera, composition, silhouette, material, lighting, palette, and negative constraints.
- For UI assets, state transparency/background needs and safe crop.
- For 3D references, describe shape language, material roughness, scale cues, and render angle.

## P0 Gates

- Prompt is asset-specific and game-specific.
- It avoids generic poster/social-media language.
- It includes constraints needed for downstream use.
