---
name: game-audio-kit
description: |
  Game audio prompt skill for music loops, UI sounds, ambience, combat hits, movement, pickups, victory/defeat, voice barks, and trailer stingers.
triggers:
  - game audio
  - SFX
  - music loop
  - ambience
agds:
  mode: audio
  surface: audio
  scenario: audio
  featured: 1
  default_for: audio
  preview:
    type: audio
  craft:
    requires: [game-feel]
  game:
    rendering: static-html
  example_prompt: "Create an audio kit prompt for a cozy mining game: 20s cave ambience loop, pickaxe hit, gem pickup, UI confirm/cancel, danger sting, victory jingle, and soft NPC bark."
---

# Game Audio Kit

Plan audio generations around game feedback and loop needs.

## Requirements

- Name each cue, duration, trigger, emotional role, and mix priority.
- Distinguish diegetic ambience, UI feedback, combat/action, reward, warning, victory/failure, and trailer music.
- Make loops loopable; describe tails, BPM, instrumentation, and intensity.
- Keep UI sounds short and non-fatiguing.

## P0 Gates

- Every cue maps to a player action, state, or game moment.
- Loops include duration and seamless-loop guidance.
- Feedback sounds communicate success, danger, selection, or reward clearly.
