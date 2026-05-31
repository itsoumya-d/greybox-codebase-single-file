# Greybox Smoke - 2D Platformer Design

## Palette

| Token | Role | Hex |
|---|---|---|
| sky-night | Background | #181B26 |
| platform-stone | Platform tile | #6CA7FF |
| coin-gold | Collectible | #FFC669 |
| spike-warning | Hazard | #FF6B6B |
| player-suit | Runner main | #ECF0F7 |
| slime-mint | Enemy idle | #87C66B |

## Beats

1. Player spawns on `ground` platform with full health.
2. Slime patrol holds the centre platform. Coins arc above the ledge.
3. Reaching `exit` ends the run.

## Notes

This DESIGN.md drives the Greybox smoke test only. The schema version is
locked to `1.0.0` so the Unity-side `DesignProxyImporter` produces a
stable ScriptableObject palette and material set.
