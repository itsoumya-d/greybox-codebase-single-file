---
name: dynamic-event-system
description: |
  Plan world-scale dynamic events, seasonal changes, invasions, weather crises, faction wars, roaming bosses, and live world evolution.
triggers:
  - dynamic events
  - world events
  - faction war
  - seasonal world
agds:
  mode: template
  surface: web
  scenario: live-world
  featured: 23
  preview:
    type: markdown
  craft:
    requires: [live-service-content-strategy, open-world-systems, game-economy-balancing]
  game:
    rendering: static-html
  example_prompt: "Design a dynamic event system for an open-world survival RPG with storms, faction raids, supply shocks, world bosses, and seasonal recovery arcs."
---

# Dynamic Event System

Dynamic events should create believable game-world change, exploration motivation, cooperative pressure, and economy impact without exhausting players.

## Workflow

1. Define event families: invasion, weather catastrophe, faction conflict, economy shift, roaming encounter, seasonal change, social event, or world boss.
2. Specify trigger, warning phase, active phase, recovery phase, rewards, failure consequences, and reset rules.
3. Map event impact on exploration, progression, economy, retention, social play, and world fiction.
4. Add anti-burnout rules: catch-up paths, caps, repeat protection, and transparent timers.
5. Store dynamic event definitions inside `.gameview.json`, `.nodegraph.json`, or `.systems.json` as appropriate.

## P0 Gates

- Players can understand when an event starts, why it matters, and how to opt in.
- Economy rewards do not inflate permanent progression.
- The event creates variety without punishing missed sessions.
