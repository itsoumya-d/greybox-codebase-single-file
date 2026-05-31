# Controller UI Guidelines

Use when designing gamepad, console, Steam Deck, TV, and couch-play interfaces.

## Principles

- Focus order is a first-class layout system.
- Every control must be reachable by D-pad/left stick, confirm, cancel, shoulder tabs, and shortcut hints when needed.
- Selected, focused, disabled, locked, new, and dangerous states must be visibly distinct.
- Text and targets need couch-distance scale.
- Remapping, hold/toggle, vibration, aim assist, and deadzone settings belong in production plans.

## Checklist

- There is a clear default focus on every screen.
- Focus never gets trapped or lost.
- Button prompts match platform conventions and can be swapped.
- Sliders, tabs, grids, inventory, and radial menus have controller behavior.
- Critical actions require confirmation or undo.

## Production Notes

- Test couch-distance readability at the smallest supported UI scale, not only in desktop screenshots.
- Account for platform certification expectations: safe areas, remapping, profile switching, disconnected controllers, and suspend/resume.
- Record any focus-order exceptions in the spec so QA can reproduce them and engineers can avoid invisible navigation traps.
