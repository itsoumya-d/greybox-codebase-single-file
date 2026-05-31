---
name: node-logic-graph
description: |
  Design .nodegraph.json gameplay logic, quest logic, dialogue, economy, event, procedural, and progression graphs.
triggers:
  - node graph
  - logic graph
  - quest graph
  - procedural graph
agds:
  mode: template
  surface: web
  scenario: systems
  featured: 21
  preview:
    type: markdown
  craft:
    requires: [procedural-generation-rules, quest-structure-systems, game-economy-balancing]
  game:
    rendering: static-html
  example_prompt: "Create a .nodegraph.json quest logic graph for a branching faction mission with stealth, combat, betrayal, reward, and world-state consequences."
---

# Node Logic Graph

Use node graphs for systems whose behavior depends on triggers, conditions, state transitions, rewards, or procedural routing.

## Workflow

1. Choose graph type: gameplay-logic, quest-logic, dialogue-logic, economy-logic, event-system, procedural-generation, or progression-system.
2. List player-visible inputs, conditions, state changes, actions, rewards, failure paths, and outputs.
3. Connect nodes with clear edge labels and conditions.
4. Add variables for tuning values that designers will adjust during playtests.
5. Note exploit risks, unclear states, and accessibility or readability constraints.
6. Save the deliverable as `name.nodegraph.json` with `kind: "node-graph"`.

## P0 Gates

- Every edge has an understandable reason to exist.
- Rewards and fail states are explicit.
- The graph avoids hidden player punishment.
- Tuning variables use concrete starting values.
