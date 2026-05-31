---
name: game-trailer-motion
description: |
  Game trailer, motion, and HyperFrames planning skill for reveal shots, gameplay beats, UI motion, ability showcases, transitions, captions, and short promo clips.
triggers:
  - game trailer
  - gameplay trailer
  - ability showcase
  - motion design
agds:
  mode: video
  surface: video
  scenario: trailer
  featured: 1
  default_for: video
  preview:
    type: video
  craft:
    requires: [game-feel, 3d-scene-composition]
  game:
    rendering: static-html
  example_prompt: "Storyboard an 8-second trailer for a neon arcade racer: title pulse, launch boost, drift close-up, hazard dodge, score pop, finish-line flash, and end card."
---

# Game Trailer Motion

Design short video prompts and motion plans for game reveal clips.

## Requirements

- Structure the clip into timed beats with camera, subject, motion, UI overlays, and transition notes.
- Show actual gameplay fantasy: verbs, hazards, rewards, abilities, enemies, environments.
- Include HUD/title/caption guidance when needed.
- Keep shots inspectable; avoid vague cinematic atmosphere with no gameplay.

## P0 Gates

- The trailer communicates genre and player action.
- Every beat has motion, subject, and purpose.
- UI overlays support the game fantasy rather than covering it.
