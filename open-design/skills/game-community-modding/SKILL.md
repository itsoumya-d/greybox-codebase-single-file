---
name: game-community-modding
description: |
  Community and modding systems module for UGC pipelines, creator ecosystems, mod tools, guild/community events, replay sharing, screenshot modes, moderation, and creator-safe production planning.
triggers:
  - community systems
  - modding tools
  - UGC pipeline
  - creator ecosystem
agds:
  mode: template
  surface: web
  scenario: multiplayer
  featured: 29
  preview:
    type: markdown
  craft:
    requires: [community-modding, multiplayer-balancing, live-service-content-strategy, telemetry-analysis]
  game:
    genre: community
    rendering: static-html
    platform: cross-platform game
  example_prompt: "Design a community and modding ecosystem for a co-op survival game: UGC shelter blueprints, curated world events, guild showcases, replay sharing, moderation, creator rewards, compatibility rules, and telemetry."
---

# Community Modding

Use this skill when the game needs players to create, share, remix, spectate, organize, or sustain community activity beyond the authored campaign.

## Workflow

1. Define the community promise: cooperation, competition, expression, mentorship, creator economy, challenge sharing, or long-term world ownership.
2. Choose the creator surface: level editor, encounter builder, cosmetic kit, mod data tables, scripting SDK, replay/screenshot studio, guild tools, or event creator.
3. Scope the UGC pipeline: creation rules, validation, packaging, preview, publish states, tags, curation, featuring, takedowns, and patch migration.
4. Design discovery and social loops: playlists, guild/community hubs, creator profiles, ratings, follows, seasonal prompts, replay sharing, spectator beats, and safety defaults.
5. Add fairness and economy rules: no pay-to-win creator rewards, ranked/UGC separation, exploit prevention, revenue-share policy, and moderation ownership.
6. Add production constraints: engine support, asset budgets, memory/performance limits, platform policy, age rating, localization, support load, and QA plan.
7. End with a launch checklist, telemetry dashboard, moderation matrix, and compatibility policy.

## P0 Gates

- UGC/mod scope is explicit and feasible for the declared team size.
- Moderation, reporting, IP safety, and appeals are part of the shipped design.
- Creator rewards do not undermine economy health or competitive fairness.
- Player discovery, preview, filtering, and rollback are designed for safe consumption.
- Patch migration and compatibility rules protect saved content and creator trust.
