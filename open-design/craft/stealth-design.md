# Stealth Design

Stealth is fair when players can predict detection, manipulate information, and recover from mistakes.

## What To Produce

- Visibility model, sound model, AI alert states, patrol logic, distraction tools, fail states, and recovery routes.
- Readability rules for cones, shadows, noise, suspicion, alarm escalation, and safe cover.
- Encounter patterns for ghosting, social stealth, ambush, escape, infiltration, and mixed combat.

## Design Rules

- Detection must feel learnable, not arbitrary.
- AI state changes need clear feedback: unaware, suspicious, searching, alerted, combat, and cooldown.
- Recovery options should exist unless the fantasy is intentional one-hit failure.
- Stealth tools need tradeoffs: noise, time, resource cost, visibility, or social consequence.
- Level layouts should support multiple routes with different risk and reward profiles.

## Production Gates

- Budget navmesh complexity, line-of-sight checks, sound propagation, animation states, and AI debugging tools.
- Test for exploit loops such as infinite lure chains, door cheese, and unreliable cover edges.
- Provide low-vision and audio accessibility alternatives for stealth cues.

## Agent Checklist

- Include detection rules.
- Include AI alert transitions.
- Include route and recovery design.
- Include fairness and accessibility checks.
