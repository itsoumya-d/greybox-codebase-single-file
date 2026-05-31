---
name: live-ops-calendar
description: |
  Live-ops calendar module for seasons, events, content rotation, battle pass beats, retention loops, economy pressure, community moments, telemetry, and ethical engagement.
triggers:
  - live ops calendar
  - seasonal event
  - content rotation
  - retention plan
agds:
  mode: template
  surface: web
  scenario: liveops
  featured: 20
  preview:
    type: markdown
  craft:
    requires: [mobile-game-retention, game-economy-balancing, emotional-pacing-design]
  game:
    genre: live-ops
    rendering: static-html
    platform: live service game
  example_prompt: "Build a 12-week live-ops calendar for a mobile action RPG: season premise, event cadence, battle pass beats, economy sinks, community challenges, shop limits, telemetry, and anti-burnout guardrails."
---

# Live Ops Calendar

Plan live content as healthy player rhythm, production cadence, and economy control.

## Workflow

1. Lock live model: seasonal, weekly, daily, event-driven, community-driven, premium updates, or no monetization.
2. Define calendar structure: season length, beats, patch windows, content drops, event starts, downtime, and recovery weeks.
3. Design events: premise, activity, reward, eligibility, difficulty, social hook, and replay target.
4. Add economy plan: sources, sinks, boosts, shop rotations, battle pass, free track, paid track, and inflation checks.
5. Add player health: burnout limits, catch-up, missed-day recovery, clear odds, spending caps, and notification ethics.
6. Add production plan: asset dependencies, QA dates, localization, community comms, telemetry, and rollback criteria.
7. End with calendar table, reward table, KPI watchlist, and risks.

## P0 Gates

- Calendar has rest weeks and catch-up paths.
- Rewards do not require coercive daily behavior.
- Economy sinks/sources are visible by week.
- Production dependencies and QA windows are explicit.
- Telemetry distinguishes engagement from unhealthy pressure.
