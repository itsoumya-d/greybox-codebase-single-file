---
name: combat-system
description: |
  Combat design module for attacks, stamina, parry, dodge, damage scaling, weapon archetypes, hit reactions, elemental rules, enemy pressure, and game-feel timing.
triggers:
  - combat system
  - weapon archetypes
  - parry
  - damage scaling
agds:
  mode: template
  surface: web
  scenario: combat
  featured: 11
  preview:
    type: markdown
  craft:
    requires: [combat-system-architecture, game-feel, controller-keyboard-input, accessibility-for-games]
  game:
    genre: action combat
    input: keyboard/mouse/gamepad/touch
    rendering: static-html
  example_prompt: "Design a stamina-based melee combat system with light/heavy attacks, dodge, parry, posture break, 6 weapon archetypes, enemy tells, elemental interactions, and hit feedback timings."
---

# Combat System

Design combat as readable player verbs, enemy pressure, timing windows, and feedback loops rather than a pile of damage numbers.

## Workflow

1. Define combat promise: power fantasy, lethality, pace, camera, input device, and intended skill expression.
2. List player verbs: move, aim/face, attack, block, parry, dodge, cancel, cast, use item, execute, recover.
3. Specify timing: startup, active, recovery, i-frames, hitstop, stun, knockback, camera shake, audio layers, and haptics.
4. Build resources: health, stamina/posture, ammo/mana, cooldowns, guard, status meters, and recovery rules.
5. Define weapon/ability archetypes with range, commitment, crowd control, counters, and upgrade paths.
6. Create enemy pressure: tells, roles, group composition, spacing, interrupts, armor, weak points, and phase escalation.
7. Add damage and scaling formulas with caps, floors, armor/resistance, criticals, elemental/status interactions, and difficulty modifiers.
8. End with tuning tables, playtest scenarios, accessibility assists, and fail-state recovery.

## P0 Gates

- Every powerful action has commitment, counterplay, or resource cost.
- Enemy tells are readable before damage lands.
- Hit feedback distinguishes light hit, heavy hit, block, parry, crit, immune, and defeat.
- Scaling avoids one-shot cliffs and sponge enemies.
- Accessibility assists preserve player agency and combat readability.
