---
name: game-companion-party-systems
description: |
  Companion and party systems module for companion identity, relationship progression, loyalty, betrayal, squad command, tactical synergy, party composition, dialogue reactions, and production budgets.
triggers:
  - companion system
  - party system
  - squad command
  - loyalty system
agds:
  mode: template
  surface: web
  scenario: rpg
  featured: 31
  preview:
    type: markdown
  craft:
    requires: [companion-party-systems, narrative-branching-design, combat-system-architecture, accessibility-for-games]
  game:
    genre: party RPG
    rendering: static-html
    platform: cross-platform game
  example_prompt: "Design companion and party systems for a tactical RPG: four companions, loyalty arcs, squad commands, combo skills, betrayal risk, party composition, dialogue reactions, and VO/animation budget."
---

# Game Companion Party Systems

Use this skill when a game needs companions or party members who shape combat, exploration, dialogue, emotional attachment, and production scope.

## Workflow

1. Define the party fantasy: found family, tactical squad, romance drama, mentor crew, survival team, rebel cell, or rotating class roster.
2. Build companion identities: silhouette, role, strengths, weaknesses, utility verb, combat style, personality, motivation, faction ties, and onboarding complexity.
3. Design relationship progression: approval, loyalty, rivalry, trust recovery, betrayal risk, personal quests, affinity rewards, and fail-forward outcomes.
4. Design party composition: slot count, role limits, swap rules, synergy combos, support actions, revive logic, companion AI stances, and squad commands.
5. Add reactivity: banter rules, dialogue reactions, morality responses, quest branches, world-state comments, cinematic participation, and branch merge points.
6. Add balance and accessibility: viable party builds, readable command UI, pause/slow assists, subtitles, remappable controls, color-independent companion states, and AI trust rules.
7. End with companion roster table, party-role matrix, loyalty state machine, command list, production budget, telemetry, and QA risks.

## P0 Gates

- Every companion has a gameplay role, narrative motive, and readable weakness.
- Party composition creates tradeoffs without forcing one solved build.
- Loyalty and betrayal states have clear causes, feedback, and recovery paths.
- Squad commands and companion AI preserve player agency and accessibility.
- Production budget covers VO, animation, behavior, localization, branching, and QA complexity.
