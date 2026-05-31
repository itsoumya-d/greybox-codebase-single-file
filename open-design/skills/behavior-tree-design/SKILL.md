---
name: behavior-tree-design
description: |
  Design .btree.json behavior trees for enemies, bosses, companions, stealth detection, NPC schedules, and faction behavior.
triggers:
  - behavior tree
  - enemy AI
  - boss logic
  - stealth detection
agds:
  mode: template
  surface: web
  scenario: ai
  featured: 22
  preview:
    type: markdown
  craft:
    requires: [encounter-design, boss-design-frameworks, accessibility-for-games]
  game:
    rendering: static-html
  example_prompt: "Create a .btree.json boss behavior tree for a three-phase frost knight with readable tells, co-op counterplay, arena hazards, and adaptive difficulty."
---

# Behavior Tree Design

Use behavior trees when the artifact must explain AI state, priority, counterplay, and readable transitions.

## Workflow

1. Define the AI owner and behavior type: enemy-ai, npc-schedule, boss-logic, companion, stealth, or faction.
2. Create a root, selector/sequence structure, conditions, actions, decorators, cooldowns, and transitions.
3. For each damaging or disruptive action, specify telegraph, recovery, and player counterplay.
4. Add difficulty notes that adjust timing and composition without hiding tells.
5. Add accessibility notes for audio, subtitles, color-independent feedback, and motion comfort.
6. Save the deliverable as `name.btree.json` with `kind: "behavior-tree"`.

## P0 Gates

- The player can read why the AI changed state.
- Every high-pressure action has counterplay.
- Cooldowns prevent spam and cheap deaths.
- Boss or elite behavior escalates with learning, not surprise punishment.
