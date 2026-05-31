# Game Feel

Playable game concepts must connect player input to immediate readable feedback.

## Rules

- Every primary action needs a visible response within one frame or one short CSS transition.
- Include at least one success/progress state and one fail/danger state when building playable concepts.
- Movement, collection, damage, cooldown, and selection states should differ by more than color alone.
- Keep restart/pause controls visible or discoverable.
- Tune placeholder numbers honestly: speed, damage, health, score, timer, and cooldown values can be simple, but they must support the loop.

## Production Notes

- Document response timing for input, hitstop, recoil, camera shake, cooldown feedback, and recovery windows.
- Tie each feedback layer to a player-readable purpose: confirm control, warn danger, reward mastery, or explain failure.
- Keep accessibility and comfort in the tuning plan. Shake, flash, vibration, and rapid motion need intensity limits and alternatives.
- Playtest game feel on target devices; touch latency, controller dead zones, browser frame pacing, and low-end hardware can change the perceived verb.

## Review Questions

- Can the player tell what they control?
- Can the player tell whether an action worked?
- Does the playable concept communicate the intended player verb within 10 seconds?
- Does the feedback scale under combat pressure without becoming noise?
