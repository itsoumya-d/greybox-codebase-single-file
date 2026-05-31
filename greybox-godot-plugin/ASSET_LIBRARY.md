# Greybox Studio For Godot

Greybox Studio for Godot imports AI-assisted game-design artifacts into Godot 4
projects while preserving the human designer as the author of shipped work.

## Free Community Path

- Import `.gameview.json` scene layouts.
- Import `DESIGN.md` art-bible resources.
- Import HUD HTML into Control-scene plans.
- Import level board JSON into TileMap-scene plans.
- Preflight native Godot engine packages before download, including manifest
  counts, runtime hooks, source `.gameview.json`, and zip size.
- Stage Godot package zips safely under `user://greybox/engine-packages`, then
  extract verified entries into `res://GreyboxGenerated` with file-count,
  byte-limit, manifest SHA-256, and path traversal guards.

## Pro Path

Round-trip sync and MCP bridge access are paid Greybox capabilities. The MCP
bridge is loopback-only and requires a local bearer token copied from the
editor dock.

## Tool Surface

- `godot.getSceneTree()`
- `godot.createNode(name, parent?)`
- `godot.addScript(nodeId, scriptPath)`
- `godot.setProperty(nodeId, propertyName, value)`
- `godot.assignResource(nodeId, propertyName, resourcePath)`
- `godot.runEditorTest(testName)`
- `godot.captureViewportScreenshot(width, height)`
- `godot.exportProject()`
