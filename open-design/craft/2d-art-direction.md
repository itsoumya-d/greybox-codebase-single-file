# 2D Art Direction

2D game visuals need readable silhouettes, scale, and sprite-state planning.

## Rules

- Define shape language for player, enemies, pickups, hazards, props, and environment.
- Use contrast and silhouette before decorative detail.
- For sprite work, name required states: idle, move, attack, hit, collect, death, victory, or brief-specific actions.
- Keep iconography consistent across HUD, inventory, and world pickups.
- Use `image-rendering: pixelated` only for intentional pixel art.

## Production Notes

- State the sprite budget: approximate frame count, atlas size, tile size, and which states can ship as placeholders.
- Protect gameplay readability before polish; a crisp hazard silhouette beats a detailed but ambiguous prop.
- Check animation workload against team scope. A solo-dev concept should reuse rigs, palette swaps, and modular VFX before requesting bespoke state sheets.
- Include accessibility variants for rarity, damage, interactable, and faction cues so colorblind players can still parse the scene.

## Review Questions

- Can the player separate friendly, enemy, interactable, hazard, and reward at a glance?
- Are UI icons and world objects part of the same visual language?
- Can the art direction survive a playtest camera zoom, HUD overlay, and low-end device texture budget?
