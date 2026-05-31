# Greybox Godot Plugin

Closed-core Godot addon foundation for Greybox Studio. Godot follows Unreal
after Unity is irreproachable, but the community-facing import path stays
generous so Greybox earns trust beyond commercial engine ecosystems.

Alpha scope:

- Godot 4 addon metadata under `addons/greybox_studio`.
- Editor dock for Greybox project import, sync, and MCP config actions.
- Import seams for `.gameview.json`, `DESIGN.md`, HUD HTML, and level board
  JSON into scenes/resources.
- Round-trip merge seam for int, float, String, Color, Vector2, and Vector3
  fields.
- Sync paths for `/api/sync/godot?projectId=<id>` and
  `/api/projects/:id/round-trip-merge`.
- Godot engine package download path at
  `/api/projects/:id/engine-package/godot`.
- Godot engine-package preflight path at
  `/api/game-deliverables/:id/engine-package/godot/preflight`, including
  manifest, runtime-hook, file-count, and package-size readiness.
- Safe package staging under `user://greybox/engine-packages`; verified ZIP
  entries extract into `res://GreyboxGenerated/EnginePackage` with file-count,
  byte-limit, manifest SHA-256, and path traversal guards.
- Loopback MCP tool list with local bearer-token config.
- Static validation plus release-readiness reporting for Godot Asset Library
  readiness. The report records target Godot editor availability and stays
  honest when local editor smokes have not run.

Local commands:

```bash
pnpm validate
pnpm test
pnpm release:readiness
```

This package is proprietary. The eventual free Godot Asset Library listing can
ship generous import capability, but closed-core sync, MCP, and Pro module
features stay in this repo.
