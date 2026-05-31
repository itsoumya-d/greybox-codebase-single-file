# Controller And Keyboard Input

Desktop and console-style playable concepts need explicit input affordances.

## Rules

- Show keyboard/gamepad hints near the relevant action, not only in a help screen.
- Provide focus, selected, hover, pressed, disabled, and rebound-unavailable states for menu controls.
- WASD/arrows, Space/Enter, Escape/P, and gamepad face-button hints should map to concrete game verbs.
- Avoid browser-only shortcuts as the only control model.
- Gamepad-style navigation should have one clear focused item at all times.

## Production Notes

- Define default bindings, remap rules, conflict behavior, and platform-specific prompt swaps before shipping a control screen.
- Keep input latency and repeat timing visible in playtest notes; menu focus that feels fine with a mouse may feel sluggish on a controller.
- Add accessibility options for hold/toggle, simplified inputs, vibration, aim assist, dead zones, and text-entry alternatives.
- Validate every critical loop with keyboard-only and controller-only QA so players can start, pause, recover, and complete objectives without a mouse.

## Review Questions

- Can the player start, pause, restart, and understand primary actions without reading prose?
- Are selected and focused states obvious?
- Do prompts stay accurate when controls are rebound or when the platform changes?
