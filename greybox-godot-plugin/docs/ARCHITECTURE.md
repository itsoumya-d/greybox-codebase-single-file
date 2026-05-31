# Greybox Godot Architecture

The Godot addon mirrors the Unity and Unreal protocol shape while staying
Godot-native:

- Open-core daemon remains the HTTP/WebSocket protocol boundary.
- Closed-core Godot code owns editor dock UI, importers, sync, MCP bridge, and
  paid feature gates.
- `.gameview.json` maps to scene-tree plans.
- `DESIGN.md` maps to Godot `Resource` palettes.
- HUD HTML maps to `Control` scene plans.
- Level board JSON maps to `TileMap` scene plans.
- Round-trip merge posts base, web edit, and Godot edit payloads to
  `/api/projects/:id/round-trip-merge`.
- Sync uses `/api/sync/godot?projectId=<id>`.
- Engine package preflight calls
  `/api/game-deliverables/:id/engine-package/godot/preflight` so the dock can
  show package readiness, `GreyboxEnginePackageManifest.json`, runtime hooks,
  source `.gameview.json`, and download size before touching disk.
- Engine package import downloads Godot runtime hooks from
  `/api/projects/:id/engine-package/godot`.
- Downloaded zips stage under `user://greybox/engine-packages`, then
  `ZIPReader` extracts verified entries into
  `res://GreyboxGenerated/EnginePackage`. Package entries must pass
  `is_safe_package_entry_path`, match manifest SHA-256 values, and file-count
  plus extracted-byte limits fail closed before project files are written.

MCP clients send `Authorization: Bearer <local-token>` to
`http://127.0.0.1:38469/mcp`. The bearer token is editor-local configuration,
not runtime game content.
