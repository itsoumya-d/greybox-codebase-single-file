---
name: game-adaptive-design-scaling
description: |
  Adaptive design scaling module for transforming oversized game concepts into solo, indie, AA, and AAA variants while preserving the core fantasy, production feasibility, player experience, and launch strategy.
triggers:
  - adaptive design scaling
  - scope scaling
  - solo indie AA AAA
  - feasible version
agds:
  mode: template
  surface: web
  scenario: production
  featured: 34
  preview:
    type: markdown
  craft:
    requires: [adaptive-design-scaling, production-feasibility, game-design-document, genre-benchmarking, telemetry-analysis]
  game:
    genre: production planning
    rendering: static-html
    platform: cross-platform game
  example_prompt: "Scale this open-world MMO survival concept into solo, indie, AA, and AAA versions: preserve the core fantasy, cut systems honestly, define content budgets, name production gates, and explain tradeoffs."
---

# Game Adaptive Design Scaling

Use this skill when a game concept is exciting but too large, too vague, or too risky for the declared team, engine, platform, or production timeline.

## Workflow

1. Lock the fantasy: player role, emotional goal, genre promise, core verbs, target audience, and platform.
2. Identify scope drivers: networking, open world, cinematics, VO, bespoke animation, AI complexity, procedural systems, live ops, asset count, platform certification, and QA.
3. Produce four variants: solo, indie, AA, and AAA. Each variant must include team shape, timeline, content count, systems kept, systems cut, systems deferred, and launch model.
4. Preserve the fantasy: explain how each smaller variant still delivers the same player promise through focused verbs, constraints, and content reuse.
5. Define production gates: prototype proof, vertical-slice exit criteria, content-pipeline proof, playtest threshold, performance budget, accessibility baseline, and stop/go risks.
6. Add business and trust rules: monetization fit, community promise, support burden, patch cadence, privacy/telemetry scope, and ethical engagement.
7. End with a scale ladder table, cutline matrix, risk register, validation gates, and recommended smallest shippable version.

## P0 Gates

- The core fantasy is preserved across solo, indie, AA, and AAA variants.
- Each variant names concrete content budgets, team assumptions, timeline, engine/platform constraints, and launch model.
- Cuts are explicit and do not remove the mechanic or emotion that makes the game worth building.
- Production gates define when to stop, continue, or scale up.
- Monetization, accessibility, telemetry, QA, and maintenance burden are scaled honestly.
