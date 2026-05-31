---
name: playable-game-prototype-example
description: |
  Minimal reference skill for a playable HTML game concept with loop, input, HUD,
  feedback, win/fail states, and game-design critique gates.
  Trigger keywords: "playable concept", "game loop", "arcade concept".
triggers:
  - "playable concept"
  - "game loop"
  - "arcade concept"
agds:
  mode: prototype
  platform: responsive-browser-game
  scenario: gameplay
  preview:
    type: html
    entry: index.html
    reload: debounce-100
  game_art_bible:
    requires: true
    sections: [color, typography, layout, gameplay-modules, motion]
  game:
    genres: [arcade, action, puzzle]
    supports: [keyboard, touch]
    deliverables: [playable-concept, hud, loop-spec, tuning-notes]
  inputs:
    - name: game_title
      type: string
      required: true
    - name: genre
      type: string
      required: true
    - name: session_length
      type: string
      default: "2-5 minutes"
    - name: control_scheme
      type: enum
      values: [keyboard, touch, hybrid]
      default: hybrid
  parameters:
    - name: difficulty
      type: number
      default: 0.45
      range: [0.1, 1.0]
    - name: feedback_intensity
      type: number
      default: 0.65
      range: [0.2, 1.0]
  outputs:
    primary: index.html
  capabilities_required:
    - file_write
---

# Playable Game Concept Example Skill

Produce a single-file playable HTML game concept. Agent, follow this workflow exactly.

## 1. Read Context

Before writing anything:
- Read the active `DESIGN.md` as the game art bible.
- Identify palette, typography, HUD posture, motion language, and anti-patterns.
- Translate the creator brief into genre, player fantasy, platform, camera, input model, and emotional goal.
- If a production constraint is missing, make a conservative game-design assumption and state it in a short in-artifact note.

## 2. Define The Game Loop

Required design decisions:
1. **Objective** — what the player is trying to accomplish in one session.
2. **Input** — keyboard, touch, or hybrid controls with visible prompts.
3. **Core loop** — perceive → decide → act → receive feedback → adjust.
4. **Challenge** — enemies, hazards, timer, puzzle pressure, resource pressure, or spatial constraint.
5. **Reward** — score, XP, loot, route unlock, combo, narrative beat, or mastery feedback.
6. **Failure and recovery** — damage, mistake, restart, checkpoint, or retry state.

## 3. Required Playable Systems

The artifact must include:
- an actual playable canvas or DOM game area;
- start, pause, restart, and end states;
- a HUD with at least two meaningful values such as health, score, stamina, timer, ammo, objective progress, combo, or cooldown;
- collision or interaction logic;
- immediate game-feel feedback through animation, sound placeholder labels, camera shake, hit flash, particles, or UI pulse;
- responsive behavior for desktop and mobile widths;
- accessibility basics: readable text, sufficient contrast, no color-only state, and keyboard controls when touch exists.

## 4. Write The File

Output a single self-contained `index.html` with:
- all CSS in a `<style>` block;
- all JS in a `<script>` block;
- no external runtime dependency;
- deterministic object positions or seeded randomness;
- comments only where they clarify non-obvious game logic;
- editable UI/gameplay regions tagged with `data-agds-id="<unique-slug>"`.

## 5. Self-Check

Before finishing, verify:
- [ ] The player can understand the objective in under five seconds.
- [ ] The game can be started, played, won or failed, paused, and restarted.
- [ ] Input feedback is immediate and readable.
- [ ] HUD values are stable and do not resize the playfield.
- [ ] Difficulty has a visible tuning variable or curve.
- [ ] The active game art bible is visible in color, type, shapes, and motion.
- [ ] The artifact avoids generic non-game chrome and behaves like a game.

## 6. Done

Write only `index.html`. The final artifact should feel like a tiny vertical-slice sketch: playable, readable, and tuned enough for a designer to critique.

---

## For Skill Authors

This is a minimal but complete game skill. Structure:

```text
playable-game-prototype-skill/
├── SKILL.md
└── assets/
    └── base.html    (optional starter template)
```

The `agds:` frontmatter lights up typed inputs, tuning parameters, preview metadata, catalog grouping, and default routing. The Markdown workflow below the frontmatter is the game-design contract the agent reads before writing files.

See [`../../skills-protocol.md`](../../skills-protocol.md) for the full protocol.
