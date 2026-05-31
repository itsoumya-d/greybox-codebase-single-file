# Fantasy RPG
> Category: Game Art Direction
> Parchment, inventory, spell, quest, party, faction, and boss UI for fantasy role-playing games.

## 1. Art Direction & Atmosphere

Fantasy RPG should feel handcrafted, storied, and readable: parchment records, engraved metal, worn leather, candlelit panels, rune glows, faction seals, and clear adventuring utility. It supports party RPGs, action RPGs, tactical RPGs, dungeon crawlers, survival fantasy, and narrative quest systems.

The art direction must balance ornament with usability. The player may manage stats, equipment, quests, dialogue choices, maps, spell cooldowns, and party state. Decoration should frame decisions, not compete with numbers or combat warnings.

## 2. Color Palette & Semantic Roles

Core palette:

- Dungeon umber: `oklch(18% 0.04 65)` for deep backgrounds.
- Tavern shadow: `oklch(25% 0.045 70)` for panel depth.
- Parchment: `oklch(88% 0.055 82)` for readable surfaces.
- Old ink: `oklch(23% 0.035 65)` for body text.
- Bronze: `oklch(61% 0.11 72)` for borders and dividers.
- Candle gold: `oklch(82% 0.13 82)` for quest focus and warm highlights.
- Rune blue: `oklch(74% 0.16 240)` for mana, magic, and selected spell.
- Blood red: `oklch(50% 0.18 30)` for damage, danger, and curse.
- Healing green: `oklch(70% 0.14 145)` for restoration and nature.

Gameplay tokens:

- Health: deep red with clear fill and numeric support.
- Mana/spirit: rune blue or violet; never the same as quest highlight.
- Stamina: amber-gold or muted green depending on combat model.
- Quest active: candle gold marker with scroll or compass icon.
- Dialogue choice: parchment row, ink text, selected bronze/rune outline.
- Rare loot: cool blue frame; epic: violet; legendary: gold; cursed: black-red rune crackle.
- Factions: unique seal shapes plus palette accents.

Use iconography and frame shape for rarity and faction, not color alone.

## 3. Typography Rules

Use a fantasy display face only for major titles, chapter headers, faction names, and boss introductions. Use a highly readable serif or humanist sans for stats, inventory, dialogue, quest text, and tooltips.

Rules:

- Body text must remain comfortable in parchment panels.
- Numeric stats use tabular figures where possible.
- Dialogue should have generous line height and clear speaker names.
- Spell names may be ornate; cooldown numbers may not.
- Avoid all caps for long quest text.

If a decorative font reduces readability, reserve it for seals and headings.

## 4. HUD Density & Layout

Fantasy RPG screens often carry multiple systems. Separate modes:

- Exploration: compact health/resource, quest tracker, minimap or compass, interact prompt.
- Combat: health, stamina/mana, skill slots, status effects, enemy/boss bars, party health.
- Inventory: grid, item detail, comparison, rarity, equipment slots, sort/filter.
- Quest log: region/faction filters, objectives, rewards, branching consequences.
- Dialogue: speaker, choices, reputation/check indicators, history access.
- Map: discovered landmarks, fog, quest layers, fast travel, danger level.

Use stable slot sizes for inventory and ability bars. A new item name cannot push the equipment grid or party panel out of alignment.

## 5. Gameplay Module Styling

- Panels: parchment fill, dark outer shadow, bronze or leather edge.
- Buttons: carved wood, metal tab, or parchment strip with clear selected state.
- Inventory slots: square grid with rarity frame, stack count, durability cue.
- Quest cards: scroll-like rows with objective icon, region, faction, reward.
- Skill slots: circular or square runic frames with cooldown sweep and keybind.
- Boss bars: wide engraved plate with phase markers and status icons.
- Dialogue choices: clean rows; show locked checks without revealing all hidden math.
- Faction meters: seal, reputation band, current standing, next consequence.

Ornament belongs on edges, seals, and milestones. Keep interiors calm.

## 6. Motion, Game Feel & Feedback

Fantasy motion should feel tactile and magical.

- Menu open: parchment unfold or soft slide, under 220 ms.
- Inventory move: item lift, shadow, snap into slot.
- Spell ready: rune pulse, subtle audio shimmer.
- Cooldown complete: small ring flare, not a full-screen effect.
- Quest update: wax-seal tick or map-pin glow.
- Level up: gold light, stat reveal, player-controlled continue.
- Damage: red edge or floating value with readable enemy reaction.
- Parry/block: metal spark, distinct sound, short hitstop.

Reduced motion should replace unfurling and particles with opacity, outline, and clear text state changes.

## 7. VFX, Materials & Shader Direction

Materials:

- Parchment, vellum, aged ink, leather straps.
- Bronze, iron, silver, gold, enamel, gemstone accents.
- Candlelight, fog, dust motes, magic glyphs.
- Wood grain and cloth for town or cozy RPG contexts.

Magic VFX should have schools:

- Fire: ember particles, orange heat distortion.
- Frost: crystalline edges, cyan-white crackle.
- Arcane: violet/blue glyph geometry.
- Nature: green-gold leaf or root motifs.
- Necrotic/curse: black-red smoke, broken runes.
- Holy: warm white-gold rays and clean chime.

Do not let spell VFX obscure enemy tells or ground danger.

## 8. Audio Direction Tokens

- Inventory hover: soft leather/wood tick.
- Equip: metal clasp or cloth rustle by item type.
- Quest accepted: parchment stamp and short motif.
- Dialogue choice: ink mark or low chime.
- Spell ready: school-specific shimmer.
- Rare loot: restrained chime; legendary: warm flourish.
- Low health: heartbeat or muffled danger layer with accessibility toggle.
- Boss phase: musical stem shift and roar/chant cue.

Audio should support world texture. Avoid synthetic UI bleeps unless the setting is magical-tech.

## 9. Do's and Don'ts

Do:

- Use ornament to create hierarchy and world identity.
- Keep stats, cooldowns, and inventory labels plain enough to scan.
- Give each faction a seal, palette, and relationship state.
- Show item comparisons with tradeoffs, not only green arrows.
- Treat dialogue checks and quest consequences as first-class UI states.

Do not:

- Overdecorate every border until nothing feels important.
- Use parchment texture behind tiny low-contrast text.
- Hide combat-critical information in lore styling.
- Make all magical effects blue-purple.
- Let inventory grids resize with item names or rarity labels.

## 10. Agent Prompt Guide

When using Fantasy RPG, include party role, quest context, inventory/equipment state, faction reputation, and combat readiness. Define health, mana, stamina, rarity, quest, and faction tokens. Favor tactile panels, readable stat layouts, and magic VFX that reinforce mechanic schools without hiding gameplay.
