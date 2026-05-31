# Greybox Unreal Plugin

Closed-core Unreal plugin foundation for Greybox Studio. Unreal stays behind
Unity until Unity v1.0 and 100 paying Unity plugin customers, but the
architecture is now laid down so higher-ACV Unreal teams can be onboarded
without rethinking the engine boundary.

Alpha scope:

- Runtime module with Greybox artifact provenance assets.
- Editor module for `.gameview.json`, `DESIGN.md`, HUD HTML, and level board
  JSON import surfaces.
- Round-trip merge seam shared with the open-core daemon through
  `/api/projects/:id/round-trip-merge`.
- Unreal WebSocket sync path at `/api/sync/unreal?projectId=<id>`.
- Unreal engine package download path at
  `/api/projects/:id/engine-package/unreal`.
- Unreal engine-package preflight path at
  `/api/game-deliverables/:id/engine-package/unreal/preflight`, with manifest,
  runtime-hook, and package-size readiness surfaced before download.
- Safe Unreal package staging under `Saved/Greybox/EnginePackages`; entries are
  path-checked and SHA-256 verified before stored-ZIP extraction into
  `Source/GreyboxGenerated/EnginePackage`.
- Level Editor window tab with project-id/daemon settings, `Check Unreal
  Export`, `Download Unreal Export`, and `Copy MCP Config` actions.
- MCP bridge tool list for coding-agent CLIs, loopback-only by design, with a
  local bearer-token client config.
- Static validation plus release-readiness reporting so the plugin cannot drift
  into unsupported claims before Unreal Marketplace submission. The report
  records Unreal 5.x editor availability and stays honest when local editor
  smokes have not run.

Local commands:

```bash
pnpm validate
pnpm test
pnpm release:readiness
```

This package is proprietary. It does not belong in the Apache-2.0 open core,
and it must not import open-core app internals directly.
