# Game Camera Systems

Use when designing first-person, third-person, top-down, isometric, side-scroller, racing, cinematic, or VR-friendly cameras.

## Principles

- Camera is part of game feel: it defines scale, threat, navigation, aim, speed, and emotion.
- State camera rules for exploration, combat, aiming, dialogue, inventory, traversal, cutscene, and failure.
- Camera motion needs acceleration, damping, collision avoidance, occlusion handling, and shake limits.
- UI placement must respect camera center, aim reticle, character silhouette, and danger zones.
- VR and comfort-sensitive cameras require reduced acceleration, snap/comfort turns, and motion options.

## Checklist

- Camera mode, height, angle, FOV, follow lag, and constraints are stated.
- Obstruction and wall-collision behavior are defined.
- Combat camera protects target, player, and hazard readability.
- Camera shake and effects have reduced-motion alternatives.
- Mobile, ultrawide, handheld, and couch-display framing are considered when relevant.
