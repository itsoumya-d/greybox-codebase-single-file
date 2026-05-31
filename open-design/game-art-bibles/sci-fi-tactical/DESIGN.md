# Sci-Fi Tactical
> Category: Game Art Direction
> Mission control, squad commands, grid tactics, alien telemetry, loadouts, and readable battlefield UI.

## 1. Art Direction & Atmosphere

Sci-Fi Tactical is a disciplined command interface. It should feel like a field computer connected to drones, squad armor, orbital sensors, and classified mission data. The tone is precise, analytical, and tense rather than decorative.

This art bible works for tactics games, extraction planning, squad RPGs, mech combat, stealth operations, strategy layers, and sci-fi survival. The player should trust the UI under pressure. Use restraint, strong hierarchy, and clear state language.

## 2. Color Palette & Semantic Roles

Core palette:

- Command black: `oklch(12% 0.025 245)` for background.
- Graphite panel: `oklch(20% 0.03 245)` for HUD surfaces.
- Sensor blue: `oklch(72% 0.13 230)` for player selection and scan data.
- Tactical cyan: `oklch(80% 0.15 205)` for valid movement and hover.
- Warning amber: `oklch(78% 0.16 75)` for overwatch, low ammo, unstable systems.
- Hostile red: `oklch(58% 0.22 28)` for enemies, alarms, lethal zones.
- Biohazard green: `oklch(72% 0.17 145)` for poison, alien growth, contamination.
- Disabled gray: `oklch(52% 0.025 245)` for jammed, offline, exhausted, unknown.

Gameplay tokens:

- Move range: cyan grid fill with thin outline.
- Attack range: red/orange line, cone, or radius.
- Cover: half/full shield icons with material class.
- Overwatch: amber arc and eye/reticle symbol.
- Suppression: striped red-amber zone.
- Scan/reveal: blue pulse expanding from source.
- Extraction: white-cyan beacon with countdown.
- Objective: amber diamond or mission marker distinct from danger.

Never make decorative scanlines stronger than tactical information.

## 3. Typography Rules

Use compact grotesk or technical sans-serif. Labels should be terse, uppercase where appropriate, and aligned to a grid. Use monospaced numerals for hit chance, ammo, turn count, timers, and coordinates.

Rules:

- Keep hit chance and damage ranges readable at a glance.
- Do not use tiny fake technical text as filler near important data.
- Tooltips should explain consequence, not lore first.
- Use consistent units for range, action points, cooldowns, and turns.
- Reserve red text for true danger or invalid action.

## 4. HUD Density & Layout

Sci-Fi Tactical can support dense information, but it must be layered.

- Battlefield center: grid, units, cover, path, threat zones.
- Bottom bar: selected unit, actions, ammo, AP, stance, cooldowns.
- Left panel: squad roster, health, status, turn order.
- Right panel: objective, enemy intel, selected target analysis.
- Top bar: turn, phase, alarm, extraction timer, resources.
- Overlay toggles: sightlines, noise, heat, hack range, cover, objectives.

Use mode-specific overlays so the player can inspect one tactical question at a time. Movement, attack, hack, stealth, and extraction views should not all shout simultaneously.

## 5. Gameplay Module Styling

- Panels: flat dark surfaces with fine borders and clipped corners.
- Buttons: rectangular command keys with icon, shortcut, AP/cooldown cost.
- Unit cards: portrait/silhouette, class, health, armor, status, morale.
- Ability tiles: icon, cost, ammo, cooldown, disabled reason.
- Tactical grid: thin lines, stronger valid cells, red hostile cells.
- Loadouts: equipment slots, weight/power draw, comparison, role tags.
- Mission report: compact rows for kills, injuries, loot, intel, consequences.

Avoid glossy sci-fi chrome. Matte field equipment reads more tactical and less generic.

## 6. Motion, Game Feel & Feedback

Motion should confirm state without delaying decisions.

- Selection: crisp outline and soft scan pulse.
- Path preview: animated direction ticks, no slow drawing.
- Confirm move: short route pulse, then unit acts.
- Invalid action: shake or red blink under 150 ms with reason.
- Hit result: damage number, armor shred, cover chip, suppression state.
- Enemy turn: readable focus camera, fast-forward option.
- Overwatch: amber tracking line before shot.
- Extraction timer: measured pulse, faster only near deadline.

Players must be able to disable or speed up repeated combat animations.

## 7. VFX, Materials & Shader Direction

VFX should read like instruments:

- Holographic grid, range cones, tactical arrows.
- Blue scan waves for revealed information.
- Red laser lines for enemy aim or overwatch.
- Amber warning hatches and striped danger masks.
- Shield hits as hex or planar impacts.
- Armor break as sparks and panel fragments.
- Alien effects as organic green/violet contamination with distinct texture.

Keep unit silhouettes and cover edges visible through VFX. Tactical games die when effects hide board state.

## 8. Audio Direction Tokens

- Unit select: radio click or suit ping.
- Move confirm: short command beep.
- Invalid: muted error tone plus text reason.
- Ammo low: dry mechanical warning.
- Overwatch trigger: lock-on chirp.
- Hit armor: metal impact; hit flesh/alien: different texture.
- Objective update: command channel cue.
- Extraction ready: beacon pulse with increasing urgency.

Voice barks should be short and varied. Repetition fatigue is a real production risk.

## 9. Do's and Don'ts

Do:

- Show why an action is valid, invalid, risky, or lethal.
- Use overlays to answer one tactical question at a time.
- Keep hit chance, damage, cover, AP, and line of sight unambiguous.
- Provide undo/confirm for movement before irreversible combat where genre allows.
- Include colorblind-safe patterns for cover, danger, and faction.

Do not:

- Hide core rules behind fake military jargon.
- Use tiny decorative telemetry that competes with real stats.
- Animate enemy turns so slowly that strategy becomes waiting.
- Make hit chance feel dishonest through unclear obstruction or range rules.
- Let red be used for both hostile and selected player states.

## 10. Agent Prompt Guide

When using Sci-Fi Tactical, include squad roles, action economy, cover rules, line of sight, hit chance philosophy, enemy intel, extraction or objective state, and mission consequences. Prioritize field clarity, command trust, and overlays that make tactical decisions inspectable.
