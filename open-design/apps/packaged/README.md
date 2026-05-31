# apps/packaged

Thin packaged Electron runtime entry for AI Game Design Studio.

This package starts the packaged daemon and web sidecars, registers the `agds://`
entry protocol, and then delegates to `@ai-game-design-studio/desktop/main` for
the host window. Product logic stays in `apps/daemon`, `apps/web`, and
`apps/desktop`.

## Runtime Boundary

The packaged layer is a launcher, not a separate game-design product surface. It
owns install-time paths, packaged process startup, protocol registration,
sidecar lifecycle, logging, and handoff into the desktop host window. Game
studio behavior such as project memory, game art bible loading, skill execution,
playable artifact rendering, and creator-facing workspace UI belongs in the
daemon, web, and desktop packages.

Keep this package deliberately small so packaged builds do not drift from the
same AI Game Design Studio runtime used by local development. If a change would
alter gameplay artifact generation, game-studio prompts, project schemas, or
HUD/document rendering, make that change in the owning package and let packaged
startup consume it.

## Verification

Use the packaged and packager tests when this boundary changes:

```bash
pnpm --filter @ai-game-design-studio/packaged typecheck
pnpm --filter @ai-game-design-studio/packaged test
pnpm --filter @ai-game-design-studio/tools-pack test
```

For release packaging work, also run `pnpm guard` so AGDS identity and
game-studio documentation wording stay aligned across the packaged runtime and
installer resources.
