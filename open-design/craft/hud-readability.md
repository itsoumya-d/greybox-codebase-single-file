# HUD Readability

HUD design must survive motion, pressure, and small screens.

## Rules

- Anchor critical state in stable zones: health/resources, objective, timer/score, cooldowns, minimap, and warnings.
- Never cover the main action center unless the game is paused or intentionally modal.
- Use size, position, shape, icon, label, and motion together; do not rely on hue alone.
- Use tabular numerics for score, ammo, cooldowns, timers, and coordinates.
- Low-health, danger, selected target, and interact prompts must be visually distinct.

## Production Notes

- Define HUD priority by gameplay pressure: always-on survival state, combat warnings, temporary rewards, and noncritical flavor should not compete equally.
- Include platform variants for touch, keyboard/mouse, controller, ultrawide, and couch-distance play.
- Treat telemetry and playtest footage as readability evidence; missed prompts, late reactions, and repeated deaths usually indicate a HUD hierarchy problem.
- Budget animation and VFX on the HUD carefully so feedback helps the player read the game rather than covering the playfield.

## P0 Checks

- Health/resources are readable at a glance.
- Objective and next action are visible.
- Touch controls do not collide with HUD readouts.
- Colorblind-safe shape, text, or icon redundancy exists for damage, rarity, cooldown, and objective state.
