# apps/AGENTS.md

Follow the root `AGENTS.md` first. This file only records module-level boundaries for `apps/`.

## Active apps

- `apps/web`: Next.js 16 App Router + React 18 studio shell. Entrypoints live in `apps/web/app/`; the main client shell is `apps/web/src/App.tsx`. During local `tools-dev` web runs, `apps/web/next.config.ts` rewrites `/api/*`, `/artifacts/*`, and `/frames/*` to `AGDS_PORT`.
- `apps/daemon`: Express + SQLite local daemon and canonical `agds` CLI. It owns REST/SSE APIs, agent CLI spawning, skills, game art bibles, artifact persistence, static serving, and local data under `.agds/` with retired data-root migration compatibility.
- `apps/desktop`: Electron shell. Desktop does not guess the web port; it reads runtime status through sidecar IPC and opens the reported web URL.
- `apps/packaged`: Thin packaged Electron runtime entry. It starts packaged daemon/web sidecars, registers the `agds://` entry protocol, treats retired URI schemes as non-surfaces, and delegates desktop host behavior to `apps/desktop`.

## Daemon layout

- `apps/daemon/src/` contains only daemon app source.
- `apps/daemon/tests/` contains daemon tests.
- `apps/daemon/sidecar/` contains the daemon sidecar entry.
- CLI/agent argument changes or stdout parser changes belong in `apps/daemon/src/agents.ts` and the matching parser tests.

## Test layout

- App tests live in each app's `tests/` directory, sibling to `src/`; preserve source-relative subpaths inside `tests/` when useful.
- Keep app `src/` directories source-only; do not add new `*.test.ts` or `*.test.tsx` files under `src/`.
- `apps/web/tests/` contains web-owned Vitest tests and uses `*.test.ts` / `*.test.tsx`.
- Playwright UI automation belongs in `e2e/ui/`; do not add Playwright suites or UI automation helper scripts under `apps/web`.

## Sidecar awareness

- App business layers must not import sidecar packages or branch on `runtime.mode`, `namespace`, `ipc`, or `source`.
- Keep sidecar awareness in `apps/<app>/sidecar` or the desktop sidecar entry wrapper.

## Packaged runtime

- `apps/nextjs` has been removed; do not restore it.
- Packaged web uses Next.js SSR through the web sidecar; do not put Next output under daemon `AGDS_RESOURCE_ROOT`.
- Packaged `AGDS_RESOURCE_ROOT` is only for daemon non-Next read-only resources: `skills/`, game-art-bible storage under `game-art-bibles/`, and `frames/`.
- Packaged data/log/runtime/cache paths must be namespace-scoped and must not depend on daemon or web ports.
- Daemon↔web packaged traffic still uses an HTTP origin/port because Next.js dev server and SSR proxy paths assume HTTP origins; switching to Unix sockets would require patching Next internals. The invariant is that data/log/runtime/cache paths never embed ports.

## Common app commands

```bash
pnpm --filter @ai-game-design-studio/web typecheck
pnpm --filter @ai-game-design-studio/web test
pnpm --filter @ai-game-design-studio/daemon typecheck
pnpm --filter @ai-game-design-studio/daemon test
pnpm --filter @ai-game-design-studio/daemon build
pnpm --filter @ai-game-design-studio/desktop typecheck
pnpm --filter @ai-game-design-studio/desktop build
pnpm --filter @ai-game-design-studio/packaged typecheck
pnpm --filter @ai-game-design-studio/packaged build
```
