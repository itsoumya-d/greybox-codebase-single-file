# 3D Scene Composition

3D game design needs camera-safe composition and readable depth.

## Rules

- State the camera model: first-person, third-person, isometric, top-down, side-on, or fixed cinematic.
- Keep interactables, enemies, hazards, and objective markers visible against the environment.
- Separate materials by role: player, enemy, pickup, prop, terrain, VFX, UI.
- Avoid UI covering character, reticle, or forward path.
- For placeholder playable concepts, label 3D stand-ins with intended material, scale, and animation notes.

## Production Notes

- Name the performance budget: expected triangle density, lighting approach, shadow cost, VFX count, and target platform constraints.
- Use greybox proportions before decorative set dressing. If traversal width, cover height, or sightline distance is wrong, polish will hide the problem.
- Define collision and interaction zones separately from art meshes so level designers can tune playability without rebuilding every asset.
- Include camera-comfort checks for motion sickness, occlusion, and readability at mobile, desktop, and console viewing distances.

## Review Questions

- Does the composition guide attention to the next player action?
- Are depth, scale, and collision/interaction zones understandable?
- Can the scene be optimized into a vertical slice without losing the intended player route, threat read, or emotional beat?
