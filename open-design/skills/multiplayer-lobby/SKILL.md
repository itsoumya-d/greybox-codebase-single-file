---
name: multiplayer-lobby
description: |
  Multiplayer lobby and social systems module for matchmaking, party flow, ranked queues, clans, spectator overlays, ready checks, loadouts, and competitive readability.
triggers:
  - multiplayer lobby
  - matchmaking ui
  - ranked queue
  - clan system
agds:
  mode: template
  surface: web
  scenario: multiplayer
  featured: 17
  preview:
    type: markdown
  craft:
    requires: [multiplayer-balancing, controller-keyboard-input, hud-readability, accessibility-for-games]
  game:
    genre: multiplayer
    input: keyboard/mouse/gamepad/touch
    rendering: static-html
  example_prompt: "Design a multiplayer lobby for a 5v5 tactical hero shooter: party invite, role queue, ranked tiers, loadouts, ready check, map vote, clan panel, spectator mode, and social safety states."
---

# Multiplayer Lobby

Design multiplayer entry flow so groups, solo players, competitors, and spectators understand what will happen next.

## Workflow

1. Lock match structure: player count, teams, mode, party size, ranked/casual, crossplay, region, and expected wait.
2. Map flow: sign-in/state gate if needed, party, invites, queue, ready check, role/loadout, map vote, loading, post-match.
3. Define matchmaking inputs: MMR, rank, role, party size, latency, region, platform, avoid list, and new-player protection.
4. Design lobby UI: player cards, ready states, voice/chat indicators, loadouts, bans/picks, rank clarity, and party ownership.
5. Add social systems: friends, clans, requests, moderation, block/report, spectator, replay, and privacy.
6. Specify competitive readability: rank delta, queue restrictions, fairness warnings, reconnect, dodge penalties, and AFK states.
7. End with state matrix, edge cases, telemetry, and accessibility/social safety checks.

## P0 Gates

- Every player can tell current party, queue, readiness, and next action.
- Matchmaking fairness rules are explicit.
- Social safety and privacy states exist.
- Ranked flow explains restrictions and consequences.
- Reconnect, cancellation, and timeout edge cases are covered.
