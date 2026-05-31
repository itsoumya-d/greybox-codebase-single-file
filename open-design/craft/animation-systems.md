# Animation Systems

Animation design must protect responsiveness, readability, and production budget.

## What To Produce

- A state machine for locomotion, combat, hit reactions, interaction, death/fail, and victory or reward states.
- Transition rules for cancel windows, blend timing, input buffering, and priority overrides.
- A list of required clips or procedural systems, tagged by must-have, polish, and stretch.

## Design Rules

- Gameplay-critical anticipation must be readable before the damage or state change lands.
- Recovery frames should communicate when the player can act again.
- Animation cancel rules must be explicit; hidden cancels create balance and accessibility problems.
- Looping idle or ambient animations should never hide enemy tells, HUD warnings, or objective feedback.
- Reuse rigs, poses, and blend spaces when the fantasy survives it.

## Production Gates

- Name memory and content risks: clip count, rig count, blend tree complexity, mocap needs, and retargeting cost.
- Define fallback animation plans for playable concept, vertical slice, and launch.
- For mobile or WebGL, prefer fewer clips with stronger timing over a large animation library.

## Agent Checklist

- Include responsiveness notes.
- Include readability and accessibility notes.
- Include a clip budget or reuse plan.
- Include one playtest question about whether the player understood the action timing.
