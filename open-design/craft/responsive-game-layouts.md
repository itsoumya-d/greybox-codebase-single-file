# Responsive Game Layouts

Game layouts adapt by preserving playability, not by stacking marketing sections.

## Rules

- Preserve the playfield first; resize HUD and panels around it.
- Mobile portrait, mobile landscape, desktop, and tablet may need different HUD anchors.
- Keep fixed-format elements stable with aspect-ratio, grid tracks, or container-relative sizing.
- Avoid text overlapping the playfield, controls, or status bars.
- If showing multiple screens, label them as game states: menu, gameplay, pause, inventory, map, results.

## Production Notes

- Define target breakpoints by platform and input model, not marketing-device names.
- Reserve safe zones for notches, TV overscan, controller prompts, subtitles, and touch controls before placing decorative panels.
- Use browser screenshots and playtest capture to verify overflow, clipped labels, hidden controls, and text occlusion.
- Scope alternate layouts to the game fantasy: a mobile one-thumb HUD may need different interaction density than a desktop tactics board.

## P0 Checks

- The playfield remains visible at mobile and desktop sizes.
- Controls do not shift unpredictably during hover, score changes, or state changes.
- Critical objectives and failure recovery remain reachable on every supported viewport.
