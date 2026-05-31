---
name: playtest-benchmark-feasibility
description: |
  Simulate playtest issues, compare against genre leaders, estimate production feasibility, and scale designs for solo, indie, AA, and AAA teams.
triggers:
  - playtest simulation
  - genre benchmarking
  - feasibility
  - scope scaling
agds:
  mode: template
  surface: web
  scenario: production
  featured: 27
  preview:
    type: markdown
  craft:
    requires: [production-feasibility, genre-benchmarking, telemetry-analysis]
  game:
    rendering: static-html
  example_prompt: "Evaluate this MMO survival RPG concept for solo, indie, AA, and AAA scope; benchmark it against genre leaders; simulate playtest friction; and produce feasibility fixes."
---

# Playtest Benchmark Feasibility

Use this skill when the creator needs sober production judgment and iterative design critique.

## Workflow

1. Identify genre leaders and compare pacing, onboarding, readability, progression, replayability, and retention structures without copying IP.
2. Simulate player confusion, frustration, exploit discovery, drop-off, UI readability issues, pacing fatigue, and progression bottlenecks.
3. Estimate team size, timeline, asset load, networking complexity, optimization difficulty, QA burden, and live-service maintenance.
4. Provide solo, indie, AA, and AAA scaling variants that preserve the core fantasy.
5. Save structured outputs as `.systems.json` with metrics, risks, feasibility, benchmarks, and playtest questions.

## P0 Gates

- Feasibility advice reduces scope without killing the fantasy.
- Benchmarks use high-level design lessons, not cloned mechanics or content beats.
- Playtest risks produce concrete iteration steps.
