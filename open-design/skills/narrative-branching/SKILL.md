---
name: narrative-branching
description: |
  Narrative design module for dialogue trees, quest arcs, factions, morality, companions, lore codex, choice consequences, cinematic beats, and branching state.
triggers:
  - narrative branching
  - dialogue tree
  - quest arc
  - faction map
agds:
  mode: template
  surface: web
  scenario: narrative
  featured: 15
  preview:
    type: markdown
  craft:
    requires: [narrative-branching-design, environmental-storytelling, emotional-pacing-design]
  game:
    genre: narrative game
    rendering: static-html
    platform: branching story design
  example_prompt: "Design a branching quest arc for a cyberpunk detective RPG: 4 factions, 3 companions, dialogue checks, moral tradeoffs, fail-forward paths, lore codex entries, and ending variants."
---

# Narrative Branching

Design branching story so player choices create consequence without exploding production scope.

## Workflow

1. Lock the dramatic question, player role, tone, world rules, and emotional target.
2. Define factions, motivations, resources, relationships, and pressure points.
3. Build quest structure: hook, investigation/exploration, choice gates, complications, climax, aftermath.
4. Write branching logic: variables, flags, reputation, companion approval, moral stance, and fail-forward paths.
5. Draft dialogue tree beats: player intents, NPC goals, skill checks, hidden information, refusal paths, and state changes.
6. Add environmental storytelling: props, locations, overheard lines, logs, visual reveals, and spatial foreshadowing.
7. Control scope: merge branches where emotions differ but production assets can converge.
8. End with a node map, sample dialogue, variables table, and production notes.

## P0 Gates

- Choices are tied to motives, resources, or relationships.
- Failure creates a changed path, not a dead end.
- Branches track state with named variables and merge points.
- Faction and companion reactions are consistent with world rules.
- The spec marks expensive branches and cheaper alternatives.
