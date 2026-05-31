---
name: game-pitch-deck
description: |
  Game pitch or GDD slide deck covering player fantasy, core loop, target audience, genre, key screens, controls, art direction, systems, roadmap, and production scope.
triggers:
  - game pitch
  - GDD
  - pitch deck
  - game design document
agds:
  mode: deck
  surface: web
  scenario: pitch
  featured: 1
  default_for: deck
  preview:
    type: html
  craft:
    requires: [game-feel, hud-readability, 2d-art-direction, 3d-scene-composition]
  game:
    rendering: static-html
  example_prompt: "Create a 10-slide game pitch deck for a mobile roguelike dungeon crawler: fantasy, loop, audience, differentiators, core screens, systems, art direction, roadmap, risks, and ask."
---

# Game Pitch / GDD Deck

Create a fixed-canvas HTML deck for game pitches, GDDs, funding, internal greenlight, or production alignment.

## Required Deck Arc

- Title and one-sentence fantasy
- Genre, platform, audience, and session length
- Core loop and player verbs
- Key screens / gameplay flow
- HUD and control model
- Systems: progression, economy, enemies, levels, rewards
- Art direction and audio/motion cues
- Playable concept scope, roadmap, risks, and ask/next steps

## P0 Gates

- Every slide advances the game concept.
- The loop and player verbs are unambiguous.
- Screens are game screens, not generic non-game mockups.
- Art direction and platform constraints are explicit.
