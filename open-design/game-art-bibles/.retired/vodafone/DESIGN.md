# Game Art Bible for Vodafone

> Category: Game Art Direction
> A game-native systems framework for playable scenes, HUD readability, worldbuilding, player feedback, and production planning.

## 1. Game Vision & Player Fantasy

Use this framework to create game experiences, not generic interfaces. Every visual decision should clarify a player goal, a gameplay state, a world rule, or a production constraint.

Design priorities:

- Protect moment-to-moment readability during combat, traversal, dialogue, and inventory decisions.
- Express genre, camera, platform, and emotional target before decorative polish.
- Tie art direction to game pillars, player fantasy, risk and reward, and replayability.
- Keep mobile, desktop, controller, keyboard, mouse, and touch support visible in planning.

## 2. Gameplay Color Tokens

- **World Canvas** (`#101216`): Primary background for menus, level boards, HUD shadows, and cinematic negative space.
- **Player Ink** (`#f6f1e8`): Primary text and readable foreground over gameplay scenes.
- **Objective Accent** (`#f0a33a`): Current objective, interactable prompts, ready abilities, and positive progression beats.
- **Support Signal** (`#46d6a8`): Healing, ally states, safe routes, tutorial highlights, and recovery windows.
- **Rare Reward** (`#5da9ff`): Rare loot, magic energy, faction-special states, mastery unlocks, and celebration moments.
- **Danger Signal** (`#e85d75`): Enemy threat, low health, boss warnings, hazards, fail states, and high-risk choices.

Token rules:

- Rarity colors must remain distinguishable in colorblind-safe modes.
- Danger, healing, objective, and faction colors must never compete in the same HUD zone.
- Cinematic lighting may be expressive, but gameplay feedback must stay readable first.

## 3. Typography & Icon Language

- Display type is for title screens, boss intros, biome names, chapter breaks, and cinematic beats.
- HUD type must favor fast scanning, generous numerals, clear cooldown labels, and stable text bounds.
- Mono or tabular numerals are recommended for ammo, currency, DPS, timers, combo counts, and balance boards.
- Icons must communicate health, stamina, mana, ammo, quest, loot, map, party, danger, stealth, crafting, and settings without relying on text alone.

## 4. Gameplay Module Styling

Design these modules as first-class game surfaces:

- Main menu with game identity, save state, accessibility entry, platform control hints, and cinematic mood.
- Combat HUD with health, stamina, mana, ammo, cooldowns, boss bars, lock-on, status effects, and damage direction.
- Inventory and crafting with rarity, item comparison, equipment slots, sorting, capacity pressure, and readable touch targets.
- Level board with spawn points, objective route, encounter beats, hazards, checkpoints, secrets, and reward placement.
- Dialogue tree with branching choices, faction reputation, companion reactions, subtitles, and emotional tone.
- Live-ops control center with seasonal events, economy sinks, balance patches, retention health, and community beats.

## 5. Layout, Camera & Spatial Readability

- Show the player spawn, objective path, enemy pressure, recovery space, and rewards in any level or scene mockup.
- Use hierarchy for gameplay urgency: survival state first, objective second, optional systems third.
- Keep HUD away from high-action reticle zones, subtitle zones, and touch-control zones.
- Account for first-person, third-person, isometric, side-scrolling, top-down, and mobile portrait framing where relevant.
- Avoid layout shifts when numbers, cooldowns, loot names, or localized strings change.

## 6. Motion, Game Feel & Audio Tokens

- **Hit feedback:** 80-120 ms flash, brief impact scale, sound layer, and optional controller vibration.
- **Dodge timing:** expose anticipation, i-frame window, recovery, and stamina cost in combat specs.
- **Camera response:** use shake only for impact clarity; always provide reduced-motion fallback.
- **Loot reveal:** rarity glow, audio cue, readable label dwell, and skip-safe animation.
- **Danger pulse:** synchronized color, sound, and motion that remains readable without audio.
- **Boss intro:** silhouette reveal, health bar arrival, phase label, and player-control handoff.

## 7. Genre, Platform & Engine Constraints

Document assumptions for:

- Genre and fusion viability.
- 2D or 3D camera model.
- Mobile, desktop, browser, console, Steam Deck, or cloud target.
- Unreal, Unity, Godot, custom engine, or WebGL pipeline.
- Memory, draw calls, texture density, VFX budget, animation states, save systems, and networking needs.

## 8. Accessibility & Fairness

- Include colorblind-safe palettes, subtitle controls, readable HUD scale, remappable inputs, difficulty assists, and audio alternatives.
- Avoid monetization pressure that undermines player trust or competitive fairness.
- For competitive modes, protect role clarity, spectator readability, matchmaking health, anti-cheese checks, and input fairness.

## 9. Production Deliverables

Outputs using this framework should include whichever artifacts fit the brief:

- Game Design Document.
- Level flow and encounter map.
- Combat framework.
- Progression and economy sheet.
- Quest arc and dialogue branch.
- HUD wireframe and gameplay screen mockup.
- Art direction guide and concept art prompt pack.
- Technical constraint sheet.
- Accessibility plan.
- Live-ops roadmap and milestone breakdown.

## 10. Anti-Patterns

- Do not generate static non-game surfaces unless they are explicitly diegetic inside the game world.
- Do not hide gameplay behind decorative panels, vague copy, or unplayable presentation screens.
- Do not use generic business metrics when the design needs player goals, retention health, balance, or encounter tuning.
- Do not let art direction override combat clarity, tutorialization, or platform constraints.
