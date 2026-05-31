# Unity Editor Plugin - v1.0 Release Punch List

Date: 2026-05-20
Source: code audit against the current `greybox-unity-plugin` tree
Target: Asset Store alpha that imports a playable 2D Platformer sample and proves the round-trip/MCP moat.

## Current Truth

| Area | Status | Evidence |
|---|---|---|
| Prefab asset emission | Done | `Editor/Generation/PrefabAssetExporter.cs` writes generated prefabs. `Tests/EditMode/PrefabAssetExporterTests.cs` covers generated paths, importer output, GUID stability, and sidecar routing. |
| User-edit safety | Done | User-modified canonical prefabs are preserved; regenerated output is written to `.greybox-incoming.prefab` for manual merge. |
| Palette/material asset export | Done | `ArtBibleAssetExporter.cs` writes standalone palette assets; `MaterialAssetExporter.cs` writes standalone `.mat` assets. Both preserve GUIDs on re-export. |
| Project artifact import menu | Done | `GreyboxProjectArtifactImporter.cs` imports selected `Assets/` artifact folders, mirrors daemon `.json` / HUD HTML files to Unity importer extensions, and now maps `DESIGN.md` directly to the deterministic `.design` proxy. |
| Mesh/prefab consumer support | Done on Unity side | `PrefabBuilder` resolves `prefabAssetPath`, `meshAssetPath`, `unityAssetGuid`, and related fields before primitive fallback. |
| MCP bridge | Done for v1 | `GreyboxMcpServer.cs` exposes the 8 editor-action tools needed by agent CLIs. Document-level wrapper tools can wait for v1.1. |
| 2D Platformer sample | Implemented, needs real-editor smoke | `Greybox2DPlatformerSampleBuilder.cs`, `GreyboxPlatformerSample*.cs`, and `GreyboxPlatformerSamplePlayTests.cs` create and validate the playable loop. A real Unity editor must still prove import-to-PlayMode timing. |
| Daemon FBX orchestration | Done for package export | `../open-design/apps/daemon/src/unity-package-builder.ts` downloads safe remote assets, caches by content hash, packages vendored mesh/material assets under `Assets/Greybox/Imported/<sha>/`, rewrites `.gameview` nodes, and emits Unity `.meta` files. Tests cover vendored mesh/materials, remote cache reuse, unsafe URL blocking, and offline fallback. |
| Live sync import-plan handoff | Done in static gates, needs real-editor smoke | `GreyboxArtifactRefresher` pulls daemon raw artifact sources, requests Unity package preflight when `.gameview` / `.levelboard` references package-backed assets, and never fetches local/private-network URLs from artifact JSON. `Documentation~/round-trip-sync.md`, `GreyboxArtifactRefresherTests.cs`, and `asset-store-metadata-check.mjs` lock the contract. |
| Conflict UI | Done for v1, needs real-editor smoke | `GreyboxConflictWindow.cs` includes Accept Web, Accept Unity, Accept Manual, Accept All Web, Accept All Unity, manual draft editing, prefab sidecar actions, and Pro/Studio gating. `GreyboxConflictResolverTests.cs` covers web, manual, and batch resolution. |
| Release packaging | Static path done, needs real-editor export | `.github/workflows/release.yml` ships deterministic UPM tarballs, checksums, and readiness evidence. `GreyboxAssetStorePackageExporter.cs` is the Unity-only `.unitypackage` exporter; it must run after real smoke is green. |
| UI Toolkit HUD emission | Static path done, needs real-editor smoke | `HudLayoutBuilder` emits `UIDocument` + `PanelSettings`, `GreyboxUiToolkitHud` renders runtime controls and Free Personal watermarks, and smoke gates verify centered slot offsets. v1 remains uGUI-first for samples. |

## Release Gates

Do not tag v1.0 until all of these pass:

- `node Validation~/asset-store-metadata-check.mjs`
- `node Validation~/asset-store-submission-check.mjs`
- `node --test Validation~/*.test.mjs`
- `node Validation~/unity-import-smoke.mjs --dry-run ...`
- Real Unity smoke on 2022.3 LTS, 2023.2, and Unity 6 when editor licenses are available.
- 2D Platformer sample imports into an empty project and enters Play mode in under 30 seconds.

## Critical Path

### P0 - Real Unity smoke for 2D Platformer sample

Files: `Samples~/2D Platformer`, `Tests/PlayMode`, `Validation~/unity-import-smoke.mjs`

Acceptance:

- Unity editor imports `.gameview`, `.design`, `.gbhud`, and `.levelboard` artifacts from the sample.
- `Greybox2DPlatformerSampleBuilder.BuildScene()` creates the generated scene in a clean project.
- PlayMode smoke confirms player spawn, movement, hazard respawn, coin collection, HUD updates, and goal completion.
- New Input System path and keyboard fallback both remain intact.
- Package import into a clean Unity project remains under 30 seconds.

Estimate: 2 to 4 days once Unity editor/license access is available.

### P1 - Real Unity smoke for live sync import-plan handoff

Files: `../open-design/apps/daemon/src/*`, Unity consumer already in `PrefabBuilder`.

Decision: v1 package export is the authoritative mesh/material import path. Live sync should reuse the same cache and manifest contract instead of inventing a separate asset path scheme.

Acceptance:

- Static gates confirm package manifest imported-asset records are documented as the Unity sync contract.
- Static gates confirm Unity refresh can request a rebuilt package after a gameview model source changes.
- Static gates confirm no local filesystem or private-network URL is fetched from gameview JSON.
- Real Unity smoke proves a changed `.gameview` with package-backed references triggers preflight and keeps checksum-verified package import as the only asset handoff.

Estimate: 1 day once Unity editor/license access is available.

### P2 - Real Unity smoke for conflict UI

Files: `Editor/Windows/GreyboxConflictWindow.cs`, `Editor/Sync/GreyboxConflictResolver.cs`

Acceptance:

- Inject a representative round-trip conflict into the inbox in a real Unity editor.
- Accept Web, Accept Unity, and Accept Manual all post a resolved merge and refresh the artifact.
- Batch accept handles multiple conflicts in one document.
- Prefab sidecar actions ping, adopt incoming, and keep canonical without losing user-added components.
- Keep each conflict resolvable in under 30 seconds.

Estimate: 1 to 2 days once Unity editor/license access is available.

### P3 - Release packaging

Files: `.github/workflows/release.yml`, `Validation~/package-builder.mjs`, `STORE_LISTING.md`

Acceptance:

- Tag release builds deterministic UPM tarball.
- Package manifest, release evidence, and SHA-256 checksums are attached to the GitHub Release.
- True Asset Store `.unitypackage` export is produced only by `GreyboxAssetStorePackageExporter` from a Unity editor run after real smoke is green.
- Stable release tags fail if `package.json` version does not match the tag.
- Prerelease tags are marked prerelease automatically.

Estimate: 2 to 3 days.

## v1 Decisions

- MCP stays local-only with bearer-token auth.
- Editor-action MCP tools are the v1 surface; document-level wrappers are v1.1.
- uGUI is the v1 HUD target.
- PBR scope is base color plus authored Unity material metadata; full texture stack is v1.1.
- Sample gameplay is movement, hazards, HUD, checkpoint, and completion. Enemy AI is v1.1.
