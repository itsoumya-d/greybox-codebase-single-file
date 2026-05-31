# Round-Trip Sync

Greybox uses the local daemon at `/api/sync/unity?projectId=<id>` for live
artifact events. Unity sends `unity-edit` JSON messages and receives
`artifact-changed` messages when the web artifact changes.

The merge base is the last synced artifact version. Web edits and Unity edits
are merged structurally for JSON fields. Independent text-field edits are merged
when their changed ranges do not overlap, and overlapping scalar conflicts are
surfaced to the Unity conflict list. Unity-side merge preserves real deletions:
if one side removes a field or stable-id array item while the other side is
unchanged, the merged draft removes it instead of materializing a `null`
placeholder. Delete versus edit remains a conflict and keeps the Unity edit in
the draft until the team resolves it. When the daemon sends a `round_trip_merge`
conflict frame, `GreyboxConflictInbox` records the file, field path, base value,
Greybox web value, and Unity value. The `Window/Greybox/Round-Trip Conflicts`
panel lets the team copy either side's value while they resolve the artifact in
Greybox or Unity. If the daemon includes a merged draft, the panel also exposes
`Accept Unity Merge`, which posts the draft back to `/round-trip-merge` with
`force: true` so the resolution remains deliberate and auditable. After the
forced merge succeeds, Unity immediately pulls the updated artifact source from
the daemon and reimports the matching local asset.

Generated viewport and level-board objects carry a `GreyboxMarker` component
with source file, collection, stable marker id, JSON path, and position JSON
path. Scene transform edits can therefore sync back through stable selectors
such as `$.spawnPoints[spawnId=spawn_start].position` instead of fragile array
indices. Imported markers and the daemon merge engine share the same stable
selector vocabulary, including `actorId`, `spawnId`, `objectiveId`, `hazardId`,
`roomId`, `encounterId`, `connectionId`, `checkpointId`, `goalId`, `coinId`,
`tileId`, `abilityId`, `routeId`, `waveId`, and `lootTableId`. Unsafe selector
values with spaces, dots, or path delimiters are skipped; Unity uses the next
safe stable field such as `name` or `guid` before falling back to index paths so
the conflict list stays parseable. Mixed arrays can keep stable selectors for
keyed actors, rooms, spawns, and playable-domain objects while preserving index
fallback only for unkeyed decoration or draft items. When round-trip sync is
enabled, `GreyboxSceneChangeWatcher` observes
Unity Undo transform edits on marked objects, debounces them, connects to the
daemon, and sends the marker's stable position path. Unity keeps that path under
an explicit 2-second budget: Scene edits debounce for 250ms, WebSocket connect
and send each fail soft after 750ms, and outbound `unity-edit` frames carry the
latency budget for daemon-side observability. Direct Unity edit sends also
attempt that reconnect before dropping an edit, so MCP-driven field writes and
Scene watcher writes share the same latency contract.

Inspector and MCP field edits map back to canonical artifact keys for imported
gameplay data, including hazard types, room connection ids, explicit level
connection endpoints, playable checkpoints, goals, and coins. That keeps
level-graph and playable-object tuning in Unity from becoming local-only scene
tweaks. MCP `unity.setField` also accepts bounded string arrays for ids such as
abilities, target ids, actor ids, and connected room ids, so agents can tune
authored graph relationships instead of only scalar values.
MCP `unity.createGameObject` uses the collection's canonical id field in its
insert draft (`actorId`, `spawnId`, `objectiveId`, `hazardId`, `roomId`,
`encounterId`, `connectionId`, or nested `tileId` entries under level-board
tilemaps, plus playable `checkpointId`, `goalId`, and `coinId` nodes) so new
Unity-authored nodes reimport with the same stable selectors as web-authored
artifacts. The queued insert draft also carries the same minimal gameplay
defaults Unity attaches in the Scene, such as connection travel cost, checkpoint
respawn metadata, exit objective requirements, and collectible source links.
Inspector-originated string arrays use the same bounds and control-character
filter before they enter the pending round-trip queue.

When a daemon `.unitypackage` converts web artifacts to Unity importer
extensions, the package embeds the original daemon source path in artifact
metadata. Imported markers therefore still send edits back to source files such
as `levels/arena.gameview.json`, even though Unity imports
`levels/arena.gameview`.

Imported roots also expose durable receipt health through
`unity.getSceneHierarchy`. The MCP bridge reports the stamped receipt id, receipt
path, receipt GUID, existence, and a bounded summary of generated asset paths,
addressable labels, and missing reference records. Receipt lookup is limited to
`Assets/Greybox/Generated/<project>/Receipts/*.asset`, so scene inspection never
loads arbitrary asset paths from component metadata.

## Unity Package Import Contract

The daemon package export is the canonical handoff for mesh, material, and
prefab assets used by live sync. Each package includes
`GreyboxProjectManifest.json` with `assets`, `importedAssets`,
`proEngineTargets`, and `contentRevisionSha256`. Unity treats
`importedAssets` as the sync contract: every record must use
`kind: "unity-imported-asset"`, include `source`, `sourceType`,
`path`, `guid`, `sha256`, and `bytes`, and place imported files under
`Assets/Greybox/Imported/<sha-prefix>/...`.

Source artifacts are rewritten before import. Nodes that reference a vendored
asset receive `prefabAssetPath`, `meshAssetPath`, `materialAssetPath`,
`unityAssetGuid`, `materialAssetGuid`, and `greyboxImportedAssets` as
applicable. `PrefabBuilder` resolves GUID aliases first, then Unity asset paths,
and only falls back to primitive markers when the referenced asset is missing.
The fallback still stamps the requested Unity asset path on `GreyboxMarker`, so
round-trip edits and conflict review keep the original intent.

Live sync must reuse this package contract rather than fetching arbitrary asset
paths from `.gameview` JSON. Missing, oversized, blocked private-network, or
non-HTTPS remote assets remain daemon warnings; the Unity plugin consumes only
the already-imported package assets and the manifest metadata. When a refreshed
`.gameview` or `.levelboard` contains package-backed asset references, Unity
requests a new engine-package preflight check so the team can download the
rebuilt export through the normal checksum-verified package path.

When the Studio window is connected, `GreyboxArtifactRefresher` listens for
daemon `artifact-changed` frames and reimports matching local Unity artifacts.
It maps web file names such as `.gameview.json`, `.levelboard.json`,
`.hud.html`, and `DESIGN.md` to Unity importer assets such as `.gameview`,
`.levelboard`, `.gbhud`, and `.design`. For supported artifacts, the refresher
pulls the latest source through `/api/projects/<id>/raw/<file>`, validates the
downloaded text, writes only to an existing matching asset under `Assets/`, and
then forces a synchronous import. It never writes WebSocket payload contents
directly into the Unity project. Ambiguous `DESIGN.md` targets and Unity echo
events such as `unity-edit-merged` fall back to reimport-only behavior. Unresolved
`round_trip_merge` conflict frames never trigger artifact refresh; they must go
through the conflict inbox and an explicit resolution action first. Root
`DESIGN.md` refreshes `art-bible.design`; nested art bibles refresh
`<folder>/<folder>.design` when that exact target exists.

The Unity WebSocket client accumulates fragmented daemon frames until
`EndOfMessage` and drops messages above 1MB. That keeps large conflict payloads
with `mergedContent` intact while still failing closed on oversized or malformed
sync frames.

HUD `.gbhud` imports generate a uGUI Canvas hierarchy by default, or an opt-in
UI Toolkit `UIDocument` when the artifact declares
`data-greybox-renderer="ui-toolkit"` or
`<meta name="greybox-hud-renderer" content="uitoolkit">`. Both paths use
`data-slot` for placement and `data-agds-id` for stable review/sync anchors,
while the original HTML remains attached as a `GreyboxArtifact` sub-asset for
provenance.

Art-bible `.design` imports use a runtime-safe `GreyboxArtBiblePalette`
ScriptableObject and emit one material sub-asset per parsed palette color. The
source markdown remains attached through `GreyboxArtifact` provenance.

## License And Cloud Notes

Round-trip sync and the MCP bridge are Pro/Studio features. Free Personal and
Indie stay one-way import only. The Unity package stores the local daemon
endpoint in `GreyboxConfig` and keeps license keys in editor-only `EditorPrefs`.
The license window validates against Greybox Cloud and caches only the parsed
license tier; editor write paths fail closed when the cached tier does not allow
round-trip sync. Free Personal imports add visible Greybox watermarks to
generated scene/HUD artifacts and record `Watermarked` provenance on imported
artifacts. Free Personal project usage is capped at 3 locally tracked hashed
project ids; paid tiers do not carry watermarks or project caps. The package
must not write API keys or license secrets into scenes, prefabs,
ScriptableObjects, or runtime builds.

Greybox Cloud calls are used for license verification and optional managed
inference. Additional subscription and token usage costs are disclosed in
`STORE_LISTING.md`.

## MCP Bridge

The editor bridge binds only to `127.0.0.1` and exposes a JSON-RPC MCP endpoint
at `/mcp`. It requires the local editor bearer token from `Window/Greybox/Studio`
on `/mcp`, `/tools/list`, and `/tools/call`; use `Copy MCP Config` to copy a
client-ready endpoint/header block, and `Rotate MCP Token` before handing a
project to another machine or teammate. Coding-agent CLIs can call
`initialize`, `tools/list`, and `tools/call`; `tools/call` returns both MCP text
content and structured JSON so agents can safely consume scene hierarchy, edit,
test, screenshot, and Addressables results. Mutation tools return `sceneDirty`
when Unity accepted the scene-dirty mark, and the real-editor smoke suite checks
create, field edit, component add, and asset assignment paths. The older `/tools/list` and
`/tools/call` endpoints remain for local validation tools and pre-MCP
integrations, but they use the same token gate. Screenshot calls create a
temporary fixed-resolution Game View size before capture and report whether
Unity accepted the requested dimensions. Imported Greybox artifacts are queued
for Addressables tagging after import; `unity.buildAddressables()` flushes that
queue, moves entries into `Greybox Generated`, assigns `greybox-generated` plus
per-kind labels, and then builds Addressables content. The structured response
includes `buildDurationMs`, `buildCompletedAtUtc`, `generatedEntryCount`,
`labelCounts`, `missingLabels`, bounded `generatedEntries` details with
`assetExists` and `assetType`, `greybox-sample-scene`, and
`greybox-2d-platformer` so a reviewer or coding agent can verify that the
generated 2D Platformer scene participated in the Addressables build.
