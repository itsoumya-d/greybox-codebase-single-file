---
name: mobile-game-ui
description: |
  Mobile game UI module for touch controls, portrait/landscape layouts, idle/session loops, gacha or shop surfaces when requested, safe areas, haptics, thumb reach, and battery-aware readability.
triggers:
  - mobile game ui
  - touch controls
  - portrait game
  - gacha ui
agds:
  mode: prototype
  surface: web
  scenario: mobile
  featured: 18
  preview:
    type: markdown
  craft:
    requires: [touch-controls, mobile-game-retention, hud-readability, responsive-game-layouts, accessibility-for-games]
  game:
    genre: mobile game
    input: touch
    rendering: dom
    platform: mobile
  example_prompt: "Design a mobile portrait idle RPG UI: town hub, combat summary, bottom navigation, upgrade loop, inventory, summon banner, daily quests, safe areas, and one-thumb controls."
---

# Mobile Game UI

Create mobile game interfaces that respect fingers, sessions, attention, safe areas, and production constraints.

## Workflow

1. Lock orientation, session length, player posture, network assumptions, and monetization boundaries.
2. Define navigation model: hub, gameplay, upgrades, inventory, quests, events, shop/summon if requested, settings, results.
3. Place controls with thumb reach, 44px minimum targets, safe-area padding, pause access, and reachable primary action.
4. Design HUD state: health/resources, objective, cooldowns, rewards, notifications, and compact combat feedback.
5. Add session loops: daily/weekly goals, offline rewards, idle timers, stamina/energy if requested, and burnout prevention.
6. Specify haptics/audio, reduced motion, colorblind feedback, scalable UI, and interruption handling.
7. End with portrait/landscape notes, state matrix, and implementation-ready dimensions.

## P0 Gates

- Touch targets are reachable and large enough.
- Critical gameplay UI does not hide under notches, home indicators, or thumbs.
- The loop can be completed in the target session length.
- Notifications/reward prompts are not manipulative.
- Accessibility and reduced-motion states are explicit.
