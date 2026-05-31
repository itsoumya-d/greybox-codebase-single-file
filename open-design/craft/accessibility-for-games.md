# Accessibility For Games

Playable game concepts should expose inclusive controls and readable state by default.

## Rules

- Do not rely on color alone for damage, rarity, success, danger, or selection.
- Keep text legible under motion and on small screens.
- Include pause/restart and avoid trapping the player in failure states.
- Provide alternatives or clear labels for gestures, rapid taps, and hold actions.
- Avoid constant flashing; use short feedback bursts and respect reduced-motion when practical.

## Production Notes

- Treat accessibility as a core design constraint, not a late settings pass.
- Identify which assists affect balance, which affect presentation only, and which must be available before the first playable tutorial.
- Include subtitles, remappable controls, HUD scale, motion reduction, colorblind-safe feedback, and difficulty assists in QA plans.
- Playtest with failure, low health, noisy combat, and small-screen states; accessibility gaps usually appear under pressure.

## P0 Checks

- Critical state has shape/text/icon redundancy.
- The player can recover, pause, and understand what went wrong.
- Accessibility options do not invalidate the player fantasy; they make the same fantasy reachable by more players.
