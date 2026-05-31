# Top-Down Roguelike Sample

AI-assisted sample set. Human designer credit: Mira Designer.

Import the four Greybox artifact files in this folder into a Unity 2D project:

- `roguelike.gameview` builds the scene markers for hero, exits, threats, and loot.
- `roguelike.design` imports palette tokens for dungeon, enemy, item, and readability passes.
- `roguelike.gbhud` imports the compact run HUD.
- `roguelike.levelboard` builds room, encounter, and tilemap markers for pacing review.

The sample is tuned for fast encounter iteration: adjust room order, enemy count,
or exit placement and round-trip the structural diff back to Greybox.
