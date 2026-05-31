# Lighting And Atmosphere

Lighting should guide play, mood, and readability at the same time.

## What To Produce

- Lighting goals for safety, danger, objective focus, faction identity, biome mood, and cinematic beats.
- Color script notes for exploration, combat, recovery, boss phases, and narrative reveals.
- Visibility rules for stealth, horror, traversal, and fast combat.

## Design Rules

- Primary objectives and safe routes need readable contrast before decorative mood.
- Darkness must support tension without hiding required counterplay.
- Combat VFX, enemy tells, and damage feedback must remain visible in the lighting model.
- Biomes need atmosphere variation: fog, bounce color, exposure, silhouette contrast, and sky treatment.
- Cinematic lighting should never invalidate the gameplay camera.

## Production Gates

- State engine assumptions: baked lightmaps, dynamic lights, Lumen, URP/HDRP, Godot lighting, or WebGL constraints.
- Budget expensive lights, volumetrics, shadows, particles, and post effects by platform.
- Provide low-end fallback settings for mobile, browser, Steam Deck, and cloud streams.

## Agent Checklist

- Include mood plus readability.
- Include objective/danger signaling.
- Include platform performance constraints.
- Include accessibility notes for contrast, flashing, and motion.
