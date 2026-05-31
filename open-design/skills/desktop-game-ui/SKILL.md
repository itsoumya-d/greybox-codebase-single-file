---
name: desktop-game-ui
description: |
  Desktop game UI shell with main menu, settings, HUD, inventory, map, quest, squad, loadout, or results panels for keyboard/mouse and gamepad games.
triggers:
  - desktop game UI
  - game menu
  - inventory
  - quest log
agds:
  mode: prototype
  surface: web
  platform: desktop
  scenario: menu
  featured: 3
  preview:
    type: html
  craft:
    requires: [hud-readability, controller-keyboard-input, accessibility-for-games]
  game:
    platform: desktop
    input: keyboard/mouse/gamepad
    rendering: dom
  example_prompt: "Design a desktop sci-fi extraction shooter UI shell with main menu, loadout, tactical HUD, inventory grid, map, mission objectives, pause/settings, and extraction results."
---

# Desktop Game UI

Design desktop game screens with gamepad/keyboard/mouse affordances and stable HUD zones.

## Requirements

- Include clear navigation between menu, gameplay/HUD, and at least one system panel.
- Use game-specific panels: loadout, inventory, map, quest log, skills, party, scoreboard, crafting, or settings.
- Preserve center action space for gameplay views.
- Add keyboard/gamepad hints where actions are available.
- Use tabular numerics for stats and resources.

## P0 Gates

- The UI supports game decisions, moment-to-moment readability, and player-facing systems.
- Critical state is readable at desktop distance.
- Navigation and focused/selected states are obvious.
- At least one gameplay-facing HUD state is included.
