# apps/packaged

Follow the root `AGENTS.md` and `apps/AGENTS.md` first. This app owns only the packaged Electron runtime assembly entry.

## Owns

- Packaged Electron entry glue.
- Packaged config loading.
- Runtime startup of daemon/studio-shell sidecars before desktop main.
- `agds://` packaged entry routing to the internal studio web shell.

## Does not own

- Product/business logic.
- Web, daemon, or desktop implementation details.
- Sidecar protocol definitions or process stamp semantics.

## Rules

- Consume `@ai-game-design-studio/sidecar-proto`, `@ai-game-design-studio/sidecar`, and `@ai-game-design-studio/platform` primitives; do not hand-build stamp flags or process matching logic.
- Keep data/log/runtime/cache paths namespace-scoped and independent from daemon/web ports.
- Keep Next.js packaged runtime as SSR/web-sidecar-owned; do not put Next output under `AGDS_RESOURCE_ROOT`.
- `AGDS_RESOURCE_ROOT` is only for daemon non-Next read-only resources: `skills/`, game-art-bible storage under `game-art-bibles/`, and `frames/`.
