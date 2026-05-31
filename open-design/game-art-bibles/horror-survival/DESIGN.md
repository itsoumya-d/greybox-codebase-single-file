# Horror Survival
> Category: Game Art Direction
> Scarce resources, dread, darkness, diegetic HUDs, inventory pressure, pursuit, safe rooms, and readable fear.

## 1. Art Direction & Atmosphere

Horror Survival is restrained, tactile, and threatening. It should create vulnerability through darkness, limited information, unsettling materials, scarce resources, and spatial uncertainty. The style supports survival horror, extraction horror, dark adventure, monster pursuit, psychological mystery, and resource-management tension.

The goal is fear with rules. Players can be frightened by what they do not know, but they must trust the interface and learn the danger language. Cheap visual confusion is not horror design; it is noise.

## 2. Color Palette & Semantic Roles

Core palette:

- Near black: `oklch(8% 0.02 250)` for darkness.
- Cold gray: `oklch(28% 0.025 250)` for concrete, metal, fog.
- Sick green: `oklch(55% 0.09 145)` for infection, chemical light, decay.
- Rust: `oklch(43% 0.11 45)` for blood-warm metal and age.
- Blood red: `oklch(42% 0.16 28)` for injury and lethal threat.
- Bone: `oklch(78% 0.035 75)` for readable text and medical labels.
- Sodium amber: `oklch(70% 0.13 75)` for lamps, safe room warmth, warnings.
- Cold blue: `oklch(58% 0.08 235)` for moonlight, monitors, locked tech.

Gameplay tokens:

- Health: muted red with physical state indicator, not arcade brightness.
- Stamina/breath: pale blue or bone, tied to audio and screen edge.
- Ammo/resource low: amber warning, count visible.
- Safe room: warm amber, stable audio, cleaner UI.
- Pursuit: red/black vignette, directional audio, controller pulse if available.
- Interactable: small focused glint or label, not glowing everywhere.
- Infection/curse: sick green with organic distortion.

Use darkness to frame attention, not to hide essential interaction prompts.

## 3. Typography Rules

Use plain, utilitarian type for survival information. Handwritten or distressed type belongs in notes, documents, maps, and environmental storytelling, not in core HUD stats.

Rules:

- Inventory labels and ammo counts must be readable under stress.
- Notes can use handwriting but need zoom or transcript.
- Warning text should be short and concrete.
- Avoid horror novelty fonts for menus.
- Subtitle readability is critical; provide speaker labels and contrast.

## 4. HUD Density & Layout

Horror HUDs should be minimal but complete.

- Exploration: little or no persistent HUD; show prompts near focus.
- Combat: ammo, health state, item quick slot, threat direction if genre allows.
- Inventory: limited grid, item size, combine/examine/use/drop, safe storage.
- Map: discovered rooms, locked doors, keys, blocked routes, save points.
- Pursuit: keep UI out of center; communicate danger through audio and edge states.
- Safe room: clearer management UI and storage.

Minimal HUD is not missing HUD. Players still need state clarity, especially for health, ammo, saves, and exits.

## 5. Gameplay Module Styling

- Inventory: worn case, grid slots, item rotation if used, condition labels.
- Health: ECG line, body silhouette, wound states, or medical wrist device.
- Documents: paper, tape, photo, terminal, cassette, evidence board.
- Map: hand-marked or facility schematic with locks and discovered states.
- Save UI: diegetic device or notebook, but with clear confirmation.
- Crafting: combine table, success preview, scarce input warnings.
- Door/lock prompts: key shape, code status, required item.

Use diegetic framing carefully. A diegetic UI can be immersive, but it still needs usability.

## 6. Motion, Game Feel & Feedback

Motion should create unease without fighting control.

- Menu transitions: slow enough to feel physical, fast enough to avoid frustration.
- Inventory inspect: object rotate, zoom, hotspot highlights.
- Damage: flinch, audio hit, health state update, brief control preservation.
- Low health: breathing/audio and subtle motion; provide intensity controls.
- Pursuit: camera pressure, footsteps, heartbeat, but avoid nausea.
- Pickup: quiet close-up or hand movement, not arcade burst.
- Save: clear completion state and relief cue.

Reduced motion and camera shake settings are mandatory for horror comfort.

## 7. VFX, Materials & Lighting

Materials:

- Wet concrete, rust, cracked tile, dirty glass, dust, mold, medical plastic.
- Flashlight cones, flicker, fog, volumetric darkness, broken monitors.
- Biological materials with readable boundaries, not vague sludge everywhere.

Lighting rules:

- Use strong value contrast for routes and threats.
- Let safe rooms have stable warmth.
- Use flicker to build tension, not to obscure controls.
- Reserve pure darkness for intentional fear with navigation support.
- Important objects need shape, reflection, sound, or focused light.

VFX should suggest contamination, breath, static, and threat without hiding interactables.

## 8. Audio Direction Tokens

- Safe room: stable low music or calm ambience.
- Pursuit: layered footsteps, breath, heartbeat, proximity cue.
- Inventory: case creak, fabric, metal, quiet clicks.
- Low ammo: dry trigger or magazine tick.
- Monster tell: distinct pre-attack sound.
- Locked door: clear mechanical refusal.
- Document pickup: paper rustle, small relief cue.
- Save: resolved tone with silence after.

Audio is navigation, warning, and emotion. Provide subtitle/visual alternatives for critical cues.

## 9. Do's and Don'ts

Do:

- Make resources scarce but understandable.
- Use safe rooms as emotional reset and planning space.
- Give monsters readable tells and rules.
- Keep inventory pressure clear and fair.
- Provide maps, notes, and transcripts that reduce confusion without removing dread.
- Support reduced motion, flash, and intensity controls.

Do not:

- Hide threats behind bad camera or unreadable darkness.
- Use gore as the only source of fear.
- Make interaction prompts invisible to preserve mood.
- Punish players for stopping unexpectedly.
- Let film grain, chromatic aberration, or blur destroy readability.
- Depend on jump scares as the main pacing tool.

## 10. Agent Prompt Guide

When using Horror Survival, include resource scarcity, safe-room rules, health/injury model, inventory limits, map/lock logic, monster tells, and comfort settings. Favor restrained UI, diegetic materials, clear state communication, and fear produced by rules rather than interface confusion.
