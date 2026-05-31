# Greybox Studio

Greybox Studio is the AI-assisted design layer for shipped games. Import
Greybox artifacts into Unity, keep level and HUD tweaks round-tripping with the
designer, and expose your scene to coding-agent CLIs through a local MCP bridge.

## External Services, API Keys, And Costs

Greybox Studio connects to a local Greybox daemon for import and sync. Pro and
Studio features can also connect to Greybox Cloud for license verification,
priority queues, and managed inference. No API keys are bundled in this package,
and customer keys are stored only in Editor preferences, not in scenes, prefabs,
ScriptableObjects, or runtime builds. `GreyboxConfig` never serializes license
secrets. Managed inference and subscriptions have additional costs described in
the tiers below and in the included documentation.

Third-party notices are included in `Third-Party Notices.txt`.

## Tiers

- Free Personal: 3 projects max, watermarked artifacts, no round-trip sync.
- Indie: $149 one-time. Unlimited projects, no watermark, one-way import only.
- Pro: $399 one-time + $9/mo. Round-trip sync, MCP bridge, priority queue.
- Studio site license: $2,999 one-time + $499/yr. Up to 25 seats, SSO, custom skill packs.

The Unity editor enforces these gates locally after license validation in the
license window: Free Personal and Indie can import, while round-trip sync and
MCP controls remain disabled unless the cached tier is Pro or Studio. Free
Personal imports add visible Greybox watermarks to generated scene and HUD
artifacts and are capped at 3 locally tracked projects; Indie, Pro, and Studio
imports do not carry watermarks or project caps.

## What Ships

- `.gameview.json` to prefab tree.
- `DESIGN.md` to runtime ScriptableObject palette and material sub-assets.
- HUD HTML to generated uGUI Canvas hierarchy.
- Unity engine package preflight and SHA-256 verified safe import for native runtime export readiness.
- Level board JSON importer hook for Tilemap or scene objects.
- Round-trip sync with local Greybox daemon.
- MCP bridge tools for scene hierarchy, component edits, tests, fixed-size Game View screenshots, and Addressables builds with Greybox labels. The `unity.buildAddressables` response reports `buildDurationMs`, `buildCompletedAtUtc`, `generatedEntryCount`, `labelCounts`, `missingLabels`, bounded `generatedEntries` with `assetExists` and `assetType`, plus the `greybox-generated`, `greybox-sample-scene`, and `greybox-2d-platformer` labels so reviewers can confirm generated sample content is included. The bridge is loopback-only and requires a local editor bearer token.
