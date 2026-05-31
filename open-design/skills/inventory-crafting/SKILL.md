---
name: inventory-crafting
description: |
  Inventory and crafting module for drag/drop, equipment, item categories, rarity visuals, recipes, stations, durability, storage, loadouts, loot sorting, and controller/touch support.
triggers:
  - inventory crafting
  - recipe system
  - equipment game screen
  - item rarity
agds:
  mode: template
  surface: web
  scenario: inventory
  featured: 21
  preview:
    type: markdown
  craft:
    requires: [game-economy-balancing, controller-keyboard-input, touch-controls, hud-readability, accessibility-for-games]
  game:
    genre: inventory/crafting
    input: keyboard/mouse/gamepad/touch
    rendering: static-html
  example_prompt: "Design an inventory and crafting system for a survival RPG: equipment slots, backpack grid, rarity visuals, recipes, workbench tiers, durability, storage, loadouts, sorting, and controller/touch player experience."
---

# Inventory Crafting

Design inventory and crafting as a readable decision surface with clear item purpose, rarity, and action cost.

## Workflow

1. Lock inventory model: grid, list, weight, slots, categories, equipment paper-doll, hotbar, stash, or loadouts.
2. Define item taxonomy: weapons, armor, consumables, materials, quest items, tools, keys, cosmetics, and junk/recycling.
3. Specify item data: rarity, stack size, durability, value, tags, affixes, restrictions, icon rules, and comparison stats.
4. Design crafting: stations, recipes, ingredients, discovery, previews, failure chance if any, upgrade path, repair, and recycling.
5. Add player interaction rules: drag/drop, quick equip, compare, filter, sort, split stack, craft max, pin recipe, favorite, lock item.
6. Cover input: mouse, keyboard shortcuts, gamepad focus, touch gestures, accessible alternatives, and confirmation patterns.
7. End with screens, data schema, recipe table, rarity tokens, and edge cases.

## P0 Gates

- Item categories and actions are understandable at a glance.
- Rarity colors are semantic and colorblind-safe.
- Crafting previews show cost, output, missing materials, and result.
- Controller/touch players can complete every core inventory action.
- Storage, overflow, full-inventory, and duplicate cases are covered.
