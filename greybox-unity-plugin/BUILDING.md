# Building `com.greybox.studio`

Greybox Studio is shipped as both a UPM tarball (for engineers consuming
the package directly) and a Unity Asset Store `.unitypackage` (for
publisher-portal submission). The two share a single source tree under
`Editor/`, `Runtime/`, `Samples~/`, and `Documentation~/`.

This document covers the *local* build flow. CI lives in
`.github/workflows/unity-validation.yml` and `.github/workflows/release.yml`.

## Prerequisites

| Component | Minimum | Notes |
|---|---|---|
| Node.js | 24.x LTS | Required for `Validation~/` validators and the cross-platform build wrapper. |
| Python | 3.10 | Required only for `scripts/generate-store-assets.py`. |
| Pillow | 10.x | Optional - enables watermarked placeholder PNGs. Install with `python3 -m pip install --user Pillow`. |
| Unity Editor | 2022.3.74f1 LTS, 2023.2.20f1, or 6000.0.58f1 | Required only to produce the real `.unitypackage`. CI does not fake Unity output. |
| `UNITY_PATH` env var | The exporter scripts honour `UNITY_PATH=/path/to/Unity` or Unity Hub auto-discovery. |

The UPM tarball and the static gates **do not** require a Unity install.

## Quick start: UPM tarball

```bash
node Validation~/asset-store-metadata-check.mjs
node --test Validation~/*.test.mjs
node Validation~/package-builder.mjs \
  --output dist/com.greybox.studio.tgz \
  --manifest dist/com.greybox.studio.manifest.json
```

Outputs:

- `dist/com.greybox.studio.tgz` - deterministic UPM tarball.
- `dist/com.greybox.studio.manifest.json` - file list, byte counts, and
  per-file SHA-256.

## Asset Store `.unitypackage`

The `.unitypackage` is the publisher-portal submission artifact. It is
produced by `Greybox.Editor.Export.GreyboxAssetStorePackageExporter`
(`Editor/Export/GreyboxAssetStorePackageExporter.cs`) running inside a real
Unity Editor. CI never fabricates this file.

Two equivalent local entry points are provided:

### Bash (macOS / Linux)

```bash
export UNITY_PATH=/Applications/Unity/Hub/Editor/2022.3.74f1/Unity.app/Contents/MacOS/Unity
./scripts/build-unitypackage.sh
```

### Cross-platform Node

```bash
node scripts/build-unitypackage.mjs \
  --unity /Applications/Unity/Hub/Editor/2022.3.74f1/Unity.app/Contents/MacOS/Unity \
  --output dist/greybox-studio-1.0.0.unitypackage
```

Behind the scenes both scripts call `Validation~/unity-package-export.mjs`
which:

1. Creates a temporary smoke project at `.tmp/asset-store-export/`.
2. Adds `com.greybox.studio` to that project's `Packages/manifest.json`
   as a file: dependency.
3. Invokes Unity in batch mode with
   `-executeMethod
   Greybox.Editor.Export.GreyboxAssetStorePackageExporter.ExportFromCommandLine`
   and the `-greyboxAssetStorePackageOutput` argument.
4. Verifies the `.unitypackage` exists, captures its byte count and
   SHA-256, and writes
   `Validation~/artifacts/unitypackage-export.json`.

Add `--dry-run` to either script to stage the smoke project and print the
exporter command without actually launching Unity (useful in CI lanes that
do not own a Unity license).

## Store visual assets

```bash
python3 scripts/generate-store-assets.py             # writes placeholders
python3 scripts/generate-store-assets.py --force     # overwrite existing
python3 scripts/generate-store-assets.py --dry-run   # report status only
```

Required dimensions are validated by
`Validation~/asset-store-submission-check.mjs`. Real screenshots must be
captured from a live Unity Editor running the v1.0 samples; the script
emits watermarked placeholders when Pillow is installed and flat-colour
PNGs otherwise so the submission gate's PNG-dimension check still passes.

### Replacing placeholders with real screenshots

| File | Source view |
|---|---|
| `screenshot-importers.png` | Unity Project window with `Greybox Studio > Import Project Artifacts` open and the sample `.gameview` selected. |
| `screenshot-round-trip.png` | `Window > Greybox > Round-Trip Conflicts` window with the example conflict injected (`Add Example Conflict`). |
| `screenshot-mcp-bridge.png` | `Window > Greybox > Greybox Studio` window showing the MCP bridge status panel. |
| `screenshot-samples.png` | 2D Platformer sample scene in Play mode with HUD visible. |

All screenshots must be 1600x900 PNG.

## Full release gate

```bash
node Validation~/release-readiness.mjs --output Validation~/artifacts/release-readiness.json
```

For Asset Store submission mode (requires Unity editors available):

```bash
node Validation~/release-readiness.mjs --submission --require-unity \
  --unity-target "2022.3.74f1=/Applications/Unity/Hub/Editor/2022.3.74f1/Unity.app/Contents/MacOS/Unity" \
  --unity-target "2023.2.20f1=/Applications/Unity/Hub/Editor/2023.2.20f1/Unity.app/Contents/MacOS/Unity" \
  --unity-target "6000.0.58f1=/Applications/Unity/Hub/Editor/6000.0.58f1/Unity.app/Contents/MacOS/Unity" \
  --output Validation~/artifacts/release-readiness.json

node Validation~/stable-release-candidate.mjs --require-ready \
  --output Validation~/artifacts/stable-release-candidate.json
```

## Smoke test (no Unity required)

`Validation~/smoke/smoke.mjs` runs an end-to-end orchestration test that
talks to the local Greybox daemon, submits a fixture
`sample-platformer.gameview.json`, polls the engine-package endpoint,
downloads the produced Unity zip, and validates its contents against
`Validation~/smoke/expected-manifest.json`. It is CI-callable on any
machine with a daemon binary available; no real Unity is needed.

```bash
node Validation~/smoke/smoke.mjs --daemon http://127.0.0.1:5174
```

## Troubleshooting

- `Unity Editor binary not found.` - set `UNITY_PATH` or pass
  `--unity /absolute/path/to/Unity`.
- `submission mode requires package version 1.0.0 or later` - ensure
  `package.json` and `Editor/McpBridge/GreyboxMcpServer.cs` agree on the
  release version. The metadata gate enforces that the MCP `serverInfo`
  version matches `package.json`.
- `visual asset not yet exported: ...` (warning) - safe before
  submission, but `Validation~/asset-store-submission-check.mjs
  --submission` upgrades these to errors. Re-run
  `scripts/generate-store-assets.py` or attach the real screenshots.
- `--dry-run-only was supplied` - this is the expected status when no
  Unity editor is available; smoke and `.unitypackage` steps fall back
  to `skipped` rather than failing.
