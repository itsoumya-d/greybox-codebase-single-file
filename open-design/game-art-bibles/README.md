# Game Art Bibles

Each subfolder contains a game-native `DESIGN.md` art bible. The picker reads these as game systems frameworks for playable scenes, HUD readability, level flow, genre identity, accessibility, and production planning.

Every bundled file has been rewritten around game design tokens:

- rarity colors
- faction palettes
- biome palettes
- danger, healing, objective, and status colors
- combat feedback timings
- camera and motion notes
- HUD and inventory modules
- level, encounter, narrative, economy, and live-ops deliverables
- engine-aware production constraints

Retired compatibility folders live under `.retired/` so existing projects keep resolving by exact id without advertising those bibles in the default picker. Add a new game-native folder at `game-art-bibles/<id>/DESIGN.md`, include a top-level `#` title and `> Category: ...`, and it will appear after refresh.
