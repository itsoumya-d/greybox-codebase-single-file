# Touch Controls

Mobile game controls must be thumb-friendly and forgiving.

## Rules

- Primary actions should be at least 44px, preferably 56px or larger for fast play.
- Keep movement and action zones separated enough to avoid accidental taps.
- Respect safe areas, notches, home indicators, and landscape thumb reach.
- Show pressed, disabled, cooldown, and unavailable states.
- Avoid tiny text buttons for gameplay-critical actions; use clear buttons, gestures, joysticks, cards, or drag zones.

## Production Notes

- Specify portrait and landscape control maps separately when the game supports both.
- Include haptic, audio, and visual feedback plans for high-frequency actions so touch input feels intentional.
- Budget battery and thermal constraints for effects tied to repeated taps, gestures, and continuous virtual-stick motion.
- Playtest with one thumb, two thumbs, left-handed reach, and interrupted sessions; mobile failure often comes from grip, not rules.

## Review Questions

- Can a player hold the device naturally and reach the controls?
- Can the player pause or recover from mistakes?
- Do controls remain visible without blocking the playfield?
- Are gesture alternatives available for motor accessibility and controller/cloud-streaming variants?
