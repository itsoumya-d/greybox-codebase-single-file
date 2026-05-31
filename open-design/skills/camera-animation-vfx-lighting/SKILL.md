---
name: camera-animation-vfx-lighting
description: |
  Design camera systems, animation state machines, VFX readability, combat feedback, lighting mood, and atmospheric direction.
triggers:
  - camera system
  - animation system
  - vfx
  - lighting
agds:
  mode: template
  surface: web
  scenario: art-tech
  featured: 24
  preview:
    type: markdown
  craft:
    requires: [game-camera-systems, animation-systems, vfx-design, lighting-atmosphere]
  game:
    rendering: static-html
  example_prompt: "Create a .systems.json camera, animation, VFX, and lighting spec for a third-person melee game with lock-on, reduced motion, hitstop, readable magic effects, and horror mood lighting."
---

# Camera Animation VFX Lighting

Use this skill for game systems where presentation affects player agency and playability: camera comfort, animation responsiveness, VFX hierarchy, and lighting readability.

## Workflow

1. Define camera mode, target distance, framing rules, occlusion handling, motion sickness constraints, and input model.
2. Specify animation states, anticipation, active/recovery timing, cancel rules, IK or motion matching needs, and memory budget.
3. Define VFX language for damage, healing, status, objective, boss phase, environment, and UI effects.
4. Define lighting mood, danger signaling, stealth shadows, color scripting, biome atmosphere, and readability limits.
5. Save as `.systems.json` when the result is a spec; use `.gameview.json` when spatial camera blocking matters.

## P0 Gates

- Camera never hides critical threats by default.
- Combat VFX clarifies priority instead of flooding the playfield.
- Animation polish does not damage responsiveness.
- Reduced motion and readable alternatives are included.
