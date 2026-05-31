# Greybox Unreal Architecture

The Unreal plugin mirrors the Unity moat while staying Unreal-native:

- Open-core daemon remains the protocol boundary.
- Closed-core Unreal code owns editor UI, importers, sync, MCP bridge, and
  Marketplace packaging.
- `.gameview.json` maps to actor tree and Blueprint plans.
- `DESIGN.md` maps to palette/material data assets.
- HUD HTML maps to UMG Widget Blueprint plans.
- Level board JSON maps to Paper2D TileMap or Level plans.
- Round-trip merge uses base, web edit, and Unreal edit payloads through
  `/api/projects/:id/round-trip-merge`.
- Realtime sync uses `/api/sync/unreal?projectId=<id>`.
- Engine package preflight calls
  `/api/game-deliverables/:id/engine-package/unreal/preflight` so the editor can
  show package readiness, `GreyboxEnginePackageManifest.json` counts, runtime
  hooks, source `.gameview.json`, and download size before touching disk.
- Engine package import downloads Unreal C++ runtime hooks from
  `/api/projects/:id/engine-package/unreal`.
- Downloaded packages are staged under `Saved/Greybox/EnginePackages`, then
  extracted as stored ZIP entries. Package entries must pass
  `IsSafePackageEntryPath`, encrypted entries are rejected, unsupported ZIP
  compression methods fail closed, manifest SHA-256 mismatches are rejected,
  and verified runtime hooks land under `Source/GreyboxGenerated/EnginePackage`.
- The editor module registers `SGreyboxStudioDock` as a Nomad tab under
  `LevelEditor.MainMenu.Window`, giving developers project-id/daemon fields,
  `Check Unreal Export`, `Download Unreal Export`, and `Copy MCP Config`
  controls without leaving Unreal Editor.

The MCP bridge exposes:

- `unreal.getWorldActors()`
- `unreal.createActor(name, parent?)`
- `unreal.addComponent(actorId, componentType)`
- `unreal.setProperty(actorId, componentType, propertyName, value)`
- `unreal.assignAsset(actorId, componentType, propertyName, assetPath)`
- `unreal.runAutomationTest(testName)`
- `unreal.captureViewportScreenshot(width, height)`
- `unreal.buildCookedContent()`

MCP clients must send `Authorization: Bearer <local-token>` to the loopback
bridge. The token is local editor configuration, not runtime game content.

## GameProject importer (Stream 4)

The Stream 4 importer turns a canonical Greybox `GameProject` JSON (the same
shape produced by the `@greybox/schema` package and the web editor) into real
Unreal assets. The flow is:

- `FGreyboxProjectImporter::ImportFromJson(JsonPath, AssetBaseDir, OutputContentDir)`
  parses the JSON and dispatches to per-entity importers.
- `FGreyboxAssetImporter` resolves each Asset to an Unreal asset class
  (Texture2D / SkeletalMesh / StaticMesh / SoundWave / DataAsset) and writes a
  deterministic descriptor under `Saved/Greybox/ImportPlans/Assets/`.
- `FGreyboxCharacterImporter` emits the Skeletal Mesh, Skeleton, PhysicsAsset,
  AnimBlueprint, and per-clip AnimSequence package paths and flags any non-
  Mixamo rig joints (`IsMixamoStandardJoint`).
- `FGreyboxScreenImporter` emits one `/Game/Greybox/Levels/<screenId>` and one
  `/Game/Greybox/Widgets/<screenId>/WBP_<screenId>` per Screen, then dispatches
  each component to `FGreyboxComponentImporter`.
- `FGreyboxComponentImporter` maps each `kind` to its Unreal target: UMG
  widgets (Button, Image, Text, HUDBar, ProgressBar, MenuList, TextInput,
  Container) and actors (Character3DRef → ASkeletalMeshActor, GameObject →
  AStaticMeshActor, Camera → ACameraActor, Light → ADirectionalLight/
  APointLight/ASpotLight/ARectLight, Spawner/Trigger/Pickup/Hazard/Checkpoint
  → AStaticMeshActor with a Greybox component tag).
- `FGreyboxFlowImporter` emits a single `AGreyboxFlowDispatcher` actor with a
  `ComponentId -> ScreenId` map plus an `EventId -> ScreenId` map. The
  generated widget blueprints reference this dispatcher from their click
  handlers.
- `ConvertTransformToUnreal` converts canonical Y-up metres to Unreal Z-up
  centimetres, including the handedness flip on yaw.

The editor exposes `SGreyboxStudioDock` → `Import GameProject...` which calls
into `UGreyboxImportSubsystem::ImportProject` (also Blueprint-callable). For
CI, `UGreyboxImportCommandlet` runs the same code path headless:

```
UnrealEditor MyProject.uproject -run=GreyboxImport \
    -ProjectJson=path/to/project.json -AssetBase=path/to/assets
```

Returns exit code 0 on success, 1 on import errors, 2 on bad arguments.

## DiffApplier (Stream 4)

`FGreyboxDiffApplier::Merge({base, web, unrealEdit})` performs a 3-way JSON
merge over the entire canonical shape:

- Scalars (int / float / string / bool, plus tuple types Vector / Rotator /
  Color / Transform): standard 3-way rule (`remote==base → keep local`,
  `local==base → keep remote`, both changed → conflict).
- Arrays: element-wise reconciliation by stable id (`id`, `componentId`,
  `screenId`, `characterId`, `assetId`, `edgeId`); falls back to positional
  compare when items lack ids. Detects additions, deletions, modifications.
- Nested objects: recursive.

Conflicts are surfaced as `FGreyboxMergeConflict` entries with a JSON Pointer
(RFC 6901), the base/local/remote values, and a resolution enum
(`Pending` | `KeepLocal` | `KeepRemote`). `Resolve(result, pointer, choice)`
mutates the merged result.

## Build / test

The C++ side ships UE Automation tests under
`Source/GreyboxStudioEditor/Private/Tests/`:

- `Greybox.ProjectImporter.*` — parse, round-trip, component classification,
  hex colour parsing, transform conversion.
- `Greybox.ComponentImporter.*` — kind dispatch, UMG vs. Level routing.
- `Greybox.DiffApplier.*` — no-change, scalar wins, conflict surfacing,
  conflict resolution, array insert/delete, nested objects.

Run them via:

```
UnrealEditor MyProject.uproject -ExecCmds="Automation RunTests Greybox.*"
```

On the CI box (no UE installed) the same algorithms are mirrored in the
Node-side `Validation/scripts/diff-applier-harness.mjs` + `test-import.mjs`
which run under `npm test`.
