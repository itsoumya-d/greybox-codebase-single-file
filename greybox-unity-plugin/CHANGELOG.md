# Changelog

All notable changes to **Greybox Studio for Unity** (`com.greybox.studio`)
are documented in this file. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned for 1.1.0

- Document-level MCP tools that wrap `unity.buildAddressables`,
  `unity.runEditModeTest`, and Greybox round-trip operations.
- Enemy AI behaviors for the 2D Platformer sample (patrol, aggro, melee).
- Full PBR material import (base color, normal, roughness, metallic, ao).
- UI Toolkit (`UIDocument`) as the default HUD path for new samples.
- Cloud-driven preset packs delivered via the priority queue.

## [1.0.0] - 2026-05-27

First stable release. Stream 8 of the platform-wide v1 launch closes the
Unity Asset Store submission path: deterministic UPM build, real-editor
smoke gates, `.unitypackage` exporter, and store listing artifacts are
green.

### Added

- Stable `com.greybox.studio@1.0.0` UPM package with Unity 2022.3 LTS,
  Unity 2023.2, and Unity 6 (`6000.0.x`) explicitly supported.
- `Editor/Generation/PrefabAssetExporter.cs` writes generated prefabs to
  stable paths with GUID preservation across re-exports and routes
  user-modified prefabs to `.greybox-incoming.prefab` sidecars for manual
  merge in `GreyboxConflictWindow`.
- `Editor/Importers/ArtBibleAssetExporter.cs` writes runtime
  ScriptableObject palette assets alongside standalone `.mat` assets via
  `MaterialAssetExporter.cs`. Both preserve GUIDs on re-export so prefab
  references remain valid.
- `Editor/Importers/GreyboxProjectArtifactImporter.cs` adds the
  `Greybox Studio > Import Project Artifacts` menu and mirrors
  `.gameview.json`, `DESIGN.md`, HUD HTML, and `.levelboard` artifacts
  into deterministic Unity-side proxies (including the `.design` proxy
  for `DESIGN.md`).
- `Editor/Generation/PrefabBuilder.cs` resolves `prefabAssetPath`,
  `meshAssetPath`, and `unityAssetGuid` references from the daemon
  package manifest before falling back to primitives.
- `Editor/McpBridge/GreyboxMcpServer.cs` exposes the v1 MCP surface for
  coding-agent CLIs: `unity.getSceneHierarchy`,
  `unity.createGameObject`, `unity.addComponent`, `unity.setField`,
  `unity.assignAsset`, `unity.runEditModeTest`,
  `unity.captureGameViewScreenshot`, and `unity.buildAddressables`. The
  bridge is loopback-only with a local editor bearer token.
- `unity.buildAddressables` returns `buildDurationMs`,
  `buildCompletedAtUtc`, `generatedEntryCount`, `labelCounts`,
  `missingLabels`, bounded `generatedEntries` with `assetExists` and
  `assetType`, plus `greybox-generated`, `greybox-sample-scene`, and
  `greybox-2d-platformer` labels.
- `Editor/Sync/GreyboxRoundTripFieldMapper.cs` and
  `Editor/Sync/GreyboxRoundTripMetadataSync.cs` implement the three-way
  JSON merge with stable name-selector path rewriting and
  GameObject/component metadata round-trip.
- `Editor/Windows/GreyboxConflictWindow.cs` adds the round-trip conflict
  inbox with Accept Web, Accept Unity, Accept Manual, batch Accept All,
  prefab-sidecar Adopt Incoming / Keep Canonical, and Pro/Studio gating.
- `Editor/Sync/GreyboxArtifactRefresher.cs` pulls daemon-changed
  artifacts into matching local `.gameview`, `.levelboard`, `.gbhud`,
  and `.design` proxies, requests Unity package preflight when assets
  are package-backed, and refuses local-network or private URLs in
  artifact JSON.
- `Editor/Sync/GreyboxEnginePackagePreflightClient.cs` performs the
  SHA-256-verified import for native runtime assets before downloading
  them into `Assets/GreyboxGenerated/EnginePackage`.
- `Editor/Windows/GreyboxLicenseWindow.cs` and
  `GreyboxLicenseState.cs` validate license tier with Greybox Cloud,
  cache the current tier in `EditorPrefs`, fail closed when no paid
  tier is present, and gate round-trip + MCP to Pro/Studio.
- `Editor/Generation/GreyboxWatermarkBuilder.cs` enforces Free Personal
  watermarks on generated scene and HUD roots and a 3-project local cap
  with hashed project ids.
- `Samples~/2D Platformer` with `Greybox2DPlatformerSampleBuilder.cs`
  produces a playable scene with player, hazards, coins, HUD, exit
  trigger, and imported design artifacts.
- `Samples~/Top-Down Roguelike` and `Samples~/Mobile Idle` scene
  fixtures for the second and third package samples.
- `Editor/Export/GreyboxAssetStorePackageExporter.cs` stages the package
  under `Assets/GreyboxStudio`, calls `AssetDatabase.ExportPackage`,
  and emits `dist/com.greybox.studio.unitypackage`. Invoked headlessly
  by `scripts/build-unitypackage.sh` and
  `scripts/build-unitypackage.mjs`.
- `Validation~/release-readiness.mjs`,
  `Validation~/asset-store-metadata-check.mjs`,
  `Validation~/asset-store-submission-check.mjs`,
  `Validation~/stable-release-candidate.mjs`,
  `Validation~/unity-package-export.mjs`,
  `Validation~/unity-import-smoke.mjs`,
  `Validation~/package-builder.mjs`,
  `Validation~/release-workflow-policy.mjs`, and
  `Validation~/verified-solution-readiness.mjs` form the static release
  gate that CI runs on every push.
- `Validation~/smoke/smoke.mjs` orchestrates an end-to-end smoke test
  that submits a fixture `.gameview` to the daemon, polls the
  engine-package endpoint, downloads the Unity zip, and validates its
  contents against `Validation~/smoke/expected-manifest.json`.
- `Documentation~/round-trip-sync.md` and
  `Documentation~/Conflict-Resolution.md` document the round-trip
  contract and the three-way merge with mermaid diagrams referencing
  `GreyboxRoundTripFieldMapper.MergeField`,
  `GreyboxConflictInbox.Record`, and
  `GreyboxConflictResolver.AcceptWebMerge`/`AcceptUnityMerge`/
  `AcceptManualMerge`.
- `.github/workflows/unity-validation.yml` runs the Node validators,
  metadata gates, submission checks, and the Unity test matrix
  (2022.3.74f1, 2023.2.20f1, 6000.0.58f1) via
  `game-ci/unity-test-runner@v4` on Ubuntu and macOS when
  `UNITY_LICENSE` is configured.
- `.github/workflows/release.yml` builds deterministic UPM tarballs,
  generates SHA-256 checksums, attaches release evidence, and gates
  stable releases on `stable-release-candidate.mjs` plus
  `unitypackage-export.mjs`.
- `scripts/build-unitypackage.sh`, `scripts/build-unitypackage.mjs`, and
  `scripts/generate-store-assets.py` give creators a single command to
  build the `.unitypackage` and regenerate store visual assets if the
  shipped Documentation copies need to be replaced.

### Changed

- `Editor/Sync/GreyboxConflictResolver.cs` now exposes
  `AcceptBatchMerge` that accepts arrays of conflicts and skips prefab
  sidecars, matching the new Conflict Window batch buttons.
- `Editor/Sync/GreyboxPackageDownloader.cs` deduplicates downloads by
  manifest SHA, falls back to the deterministic offline cache, and now
  refuses local/private-network URLs in artifact JSON.
- `Documentation~/round-trip-sync.md` is the canonical round-trip
  contract document; `STORE_LISTING.md` and the Asset Store submission
  packet now point readers there.

### Security

- `Editor/McpBridge/GreyboxMcpServer.cs` binds to `127.0.0.1:38467`
  only and rejects requests without the local editor bearer token.
- `GreyboxConfig` never serializes license secrets; license keys live
  only in `EditorPrefs`.
- The package no longer fetches any local or private-network URL from
  artifact JSON (`GreyboxArtifactRefresher.cs`,
  `GreyboxPackageDownloader.cs`).

### Notes

- This is the first version cleared for Asset Store submission. The
  package version, MCP `serverInfo.version`, and CHANGELOG entry are
  all locked to `1.0.0` so the publisher portal, MCP handshake, and
  reviewer notes agree.
- True Asset Store `.unitypackage` export is produced only by
  `GreyboxAssetStorePackageExporter.ExportFromCommandLine` from a real
  Unity Editor after the smoke matrix is green. CI does not fake the
  Unity export.

## [0.1.0-alpha.1] - 2026-05-17

### Added

- Initial Unity package scaffold for Greybox Studio.
- Greybox artifact importers for `.gameview.json`, `DESIGN.md`, HUD
  HTML, and level board JSON.
- Local daemon sync client, cloud license client, package downloader,
  and three-way diff applier.
- MCP bridge tool definitions for scene hierarchy, GameObject and
  component edits, asset assignment, edit-mode tests, Game View
  screenshots, and Addressables builds.
- 2D Platformer, Top-Down Roguelike, and Mobile Idle sample folders.
- One-command release-readiness gate with JSON output for Asset Store
  metadata, Node protocol checks, smoke-project dry run, and real
  Unity smoke blocker reporting.
- Deterministic UPM-style package assembly with a SHA-256 manifest and
  CI artifact upload.

[Unreleased]: https://github.com/greybox-studio/unity-plugin/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/greybox-studio/unity-plugin/compare/v0.1.0-alpha.1...v1.0.0
[0.1.0-alpha.1]: https://github.com/greybox-studio/unity-plugin/releases/tag/v0.1.0-alpha.1
