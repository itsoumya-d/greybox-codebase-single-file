# Stylized 3D
> Category: Game Art Direction
> Readable 3D worlds, character-forward adventure UI, sculpted materials, expressive silhouettes, and full-scene game presentation.

## 1. Art Direction & Atmosphere

Stylized 3D is polished, readable, and expressive. It uses simplified forms, clear silhouettes, controlled detail, appealing proportions, authored lighting, and strong material language. It supports action-adventure, platformers, creature games, fantasy exploration, third-person RPGs, cozy 3D, arena combat, and family-friendly titles.

Stylization is not lack of detail. It is selection. The scene should emphasize interaction, character, route, danger, and mood while removing noise that does not help play.

## 2. Color Palette & Semantic Roles

Core palette depends on world theme, but use semantic separation:

- Player/hero: highest silhouette contrast and accent.
- Ally: softer related palette, rounded shapes.
- Enemy: hotter or sharper palette, angular shapes.
- Interactable: consistent highlight, outline, sparkle, or icon.
- Main path: lighting, warm/cool contrast, shape rhythm, or prop direction.
- Danger: saturated warm warning or clear material hazard.
- Healing/safe: green, gold, or soft blue with calm motion.
- Rare/magical: distinct material shimmer or rim, not generic bloom.

Example flexible palette:

- Sky: `oklch(82% 0.08 225)`
- Grass: `oklch(68% 0.13 145)`
- Warm stone: `oklch(70% 0.06 75)`
- Hero blue: `oklch(58% 0.15 250)`
- Treasure gold: `oklch(80% 0.15 85)`
- Danger coral: `oklch(63% 0.17 28)`
- Shadow violet: `oklch(30% 0.07 285)`

Avoid one-note palettes. Stylized 3D should use color to separate depth, route, characters, and gameplay state.

## 3. Typography Rules

Use friendly, readable display typography for titles and large labels. Use clean sans-serif for HUD, prompts, settings, subtitles, and inventory. Text often appears over 3D scenes, so contrast backing, stroke, or shadow must be consistent.

Rules:

- Interaction prompts must be readable against bright and dark backgrounds.
- Subtitle style needs speaker labels, background, and size options.
- HUD numerals must remain stable during camera motion.
- Avoid overly whimsical fonts for combat-critical information.

## 4. HUD Density & Layout

Stylized 3D often needs a light HUD over a rich world.

- Top-left: health, companion state, quest hint, or party status.
- Top-right: minimap, compass, collectible tracker, objective.
- Bottom center: contextual prompts, ability bar, mount/vehicle controls.
- Bottom corners: inventory quick slots, camera/lock state, special meter.
- Pause: map, quests, inventory, skills, settings.
- Photo/inspection mode: hide HUD, preserve controls.

Leave room for camera framing. Do not cover the player character, reticle, ledges, target lock, or traversal landing zone.

## 5. Gameplay Module Styling

- Panels: soft beveled slabs, painted edges, subtle shadows, 6-8px radius unless system requires more.
- Buttons: icon plus short text, clear focus ring for controller.
- Ability slots: sculpted frames, cooldown sweep, readable keybind.
- Quest tracker: small line, icon, distance if needed.
- Inventory: object thumbnails, rarity frame, comparison, sort/filter.
- Map: illustrated region shapes with landmarks and route icons.
- Dialogue: character portrait or 3D bust, speaker name, choice rows.

Avoid putting UI cards inside other cards. Use full-width bands or unframed layouts for large sections.

## 6. Motion, Game Feel & Feedback

Motion should feel animated, snappy, and characterful.

- Button focus: small scale or color shift, under 140 ms.
- Ability ready: rim pulse, brief sound.
- Hit reaction: pose change, impact spark, health change, short hitstop.
- Jump/land: squash, dust puff, camera ease.
- Pickup: object arc, sparkle, counter update.
- Quest update: small banner, no center-screen blockage during action.
- Camera transitions: eased but controllable, no sudden nausea.

Use animation principles but preserve input responsiveness. A beautiful animation that delays control will make the game feel worse.

## 7. 3D Materials, Lighting & Scene Composition

Materials:

- Albedo-forward color with simplified roughness.
- Hand-painted or procedural texture accents.
- Soft rim lights for characters and interactables.
- Clear material families: wood, stone, cloth, metal, magic, foliage, water.
- Limited noisy normal maps; prefer readable forms.

Scene composition:

- Strong landmarks visible from common camera angles.
- Interactable silhouettes separated from background.
- Danger materials distinct from decorative warm colors.
- Traversal affordances highlighted through shape and lighting.
- Foreground occluders fade, cut away, or camera-correct.
- Enemy silhouettes readable at expected combat distance.

For 3D previews, the primary scene should be full-bleed or unframed, not a tiny card.

## 8. VFX & Audio Direction

VFX:

- Soft particles, stylized impact stars, dust puffs, ribbons, magic arcs.
- Use shape language by source: nature leaves, fire embers, ice shards, tech squares.
- Keep VFX near source and duration short for combat clarity.
- Use outline or rim for interactables, not constant sparkle spam.

Audio:

- UI: soft wooden, cloth, glass, or magic tones by world.
- Movement: footstep material variety.
- Pickup: short satisfying motif by item class.
- Ability: school or character-specific identity.
- Damage: clear hit confirmation without harshness.
- Quest: warm confirmation.

## 9. Do's and Don'ts

Do:

- Use silhouette, value, and color to communicate role.
- Keep the world charming but navigable.
- Reserve detail for focal objects and characters.
- Provide camera, motion, subtitle, and colorblind options.
- Test HUD readability across bright sky, dark cave, and busy foliage.

Do not:

- Hide interactables in noisy grass or props.
- Use excessive bloom that erases shape.
- Let camera occlusion cause unfair damage or missed jumps.
- Make UI panels feel like generic web cards.
- Use cute animation that delays input.
- Build a 3D scene in a framed preview when the scene is the game experience.

## 10. Agent Prompt Guide

When using Stylized 3D, specify camera type, traversal verbs, interaction highlight, character silhouette rules, material families, lighting intent, HUD zones, and comfort settings. Favor clear 3D composition, playful but disciplined UI, and feedback that preserves control and readability.
