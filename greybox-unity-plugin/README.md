# Greybox Studio for Unity

[![Unity 2022.3 LTS | 2023.2 | 6000.0](https://img.shields.io/badge/Unity-2022.3%20LTS%20%7C%202023.2%20%7C%206000.0-6CA7FF)](https://unity.com/releases)
[![License: Proprietary](https://img.shields.io/badge/license-proprietary-FFC669)](LICENSE.md)
[![Package](https://img.shields.io/badge/UPM-com.greybox.studio%401.0.0-ECF0F7)](package.json)

**Greybox Studio is the AI-assisted game-design layer for shipped games.**
Import design artifacts from the Greybox web app into Unity, keep level
and HUD edits round-tripping between designer and developer, and expose
your scene to coding-agent CLIs through a local MCP bridge - all without
leaving the Unity Editor.

## 30-second quickstart

1. Open your Unity project (2022.3 LTS, 2023.2, or Unity 6).
2. Add the package via `Window > Package Manager > + > Add package from git URL`
   (or `file:` path for local installs):
   ```
   file:/absolute/path/to/greybox-unity-plugin
   ```
3. From the menu bar pick `Greybox Studio > Import Project Artifacts`.
4. Select the sample folder
   `Packages/com.greybox.studio/Samples~/2D Platformer/` and confirm.
5. Open `Window > Greybox > Greybox Studio`, paste a Pro or Studio
   license key, then press **Refresh**.
6. Press **Play** - the imported platformer scene runs end to end.

The 2D Platformer sample imports `.gameview`, `DESIGN.md`, HUD HTML, and
level board artifacts and reaches Play mode in under 30 seconds on a
clean project.

## Supported Unity versions

| Stream | Tested editor | Status |
|---|---|---|
| Unity 2022.3 LTS | `2022.3.74f1` | First-class - default target |
| Unity 2023.2 | `2023.2.20f1` | First-class |
| Unity 6 | `6000.0.58f1` | First-class |
| Unity 2021.3 LTS | not tested | Out of scope for v1 |

The static metadata gate (`Validation~/asset-store-metadata-check.mjs`)
locks the minimum `package.json` Unity version to `2022.3`.

## Supported render pipelines

| Pipeline | Sample coverage | Notes |
|---|---|---|
| Built-in | 2D Platformer, Top-Down Roguelike, Mobile Idle | All v1 samples ship in Built-in for maximum compatibility. |
| URP | 2D Platformer | Works without code changes; switch the active render pipeline asset before import. |
| HDRP | n/a | Works for prefab + material round-trip. Sample HDRP scenes are slated for v1.1. |

Material round-trip is base-color-aware in v1; full PBR (normal,
roughness, metallic, ao) ships in v1.1.

## License-tier feature matrix

| Capability | Free Personal | Indie ($149) | Pro ($399 + $9/mo) | Studio site ($2,999 + $499/yr) |
|---|---|---|---|---|
| One-way import (`.gameview`, `DESIGN.md`, HUD, levelboard) | yes | yes | yes | yes |
| Generated `.mat` and palette `ScriptableObject` assets | yes | yes | yes | yes |
| Free Personal watermark on generated assets | yes | no | no | no |
| Locally tracked project cap | 3 | unlimited | unlimited | unlimited |
| Round-trip sync (Accept Web / Unity / Manual) | no | no | yes | yes |
| MCP bridge for coding-agent CLIs | no | no | yes | yes |
| Priority daemon queue + managed inference | no | no | yes | yes |
| SSO + custom skill packs | no | no | no | yes (25 seats) |

Free Personal and Indie remain perpetually free of round-trip and MCP
controls; Pro and Studio unlock those features once the license is
validated against Greybox Cloud. See `STORE_LISTING.md` for the canonical
pricing copy.

## What's in the box

- Importers for `.gameview.json`, `DESIGN.md`, HUD HTML, and `.levelboard`.
- Stable prefab + material asset emission with GUID preservation across
  re-imports.
- A three-way JSON round-trip merge with a dedicated
  `Window > Greybox > Round-Trip Conflicts` UI. See
  [Conflict-Resolution.md](Documentation~/Conflict-Resolution.md).
- Local MCP bridge exposing the eight v1 editor-action tools
  (`unity.getSceneHierarchy`, `unity.createGameObject`,
  `unity.addComponent`, `unity.setField`, `unity.assignAsset`,
  `unity.runEditModeTest`, `unity.captureGameViewScreenshot`,
  `unity.buildAddressables`).
- Addressables labelling (`greybox-generated`, `greybox-sample-scene`,
  `greybox-2d-platformer`).
- Three playable samples (2D Platformer, Top-Down Roguelike, Mobile Idle).
- A SHA-256-verified Unity engine package preflight so generated native
  runtime files cannot be hijacked before import.

## Building from source

| Goal | Command |
|---|---|
| UPM tarball (no Unity needed) | `node Validation~/package-builder.mjs --output dist/com.greybox.studio.tgz --manifest dist/com.greybox.studio.manifest.json` |
| Asset Store `.unitypackage` | `./scripts/build-unitypackage.sh` (bash) or `node scripts/build-unitypackage.mjs` (cross-platform) |
| Regenerate store visual placeholders | `python3 scripts/generate-store-assets.py` |
| Full local release gate | `node Validation~/release-readiness.mjs --output Validation~/artifacts/release-readiness.json` |
| End-to-end daemon smoke (mock) | `node Validation~/smoke/smoke.mjs --dry-run` |

See [BUILDING.md](BUILDING.md) for the full build manual.

### Building the real Asset Store `.unitypackage`

The Asset Store `.unitypackage` is produced exclusively by
`Greybox.Editor.Export.GreyboxAssetStorePackageExporter.ExportFromCommandLine`
running inside a real Unity Editor. Both the bash and Node wrappers call
the same headless entrypoint and accept the
`GREYBOX_ASSET_STORE_PACKAGE_OUTPUT` environment variable so the editor
writes the package exactly where CI expects it:

```bash
# Cross-platform: produces dist/com.greybox.studio.unitypackage
GREYBOX_ASSET_STORE_PACKAGE_OUTPUT=dist/com.greybox.studio.unitypackage \
  node scripts/build-unitypackage.mjs --unity "$UNITY_PATH"
```

CI never fabricates this file; the editor is the single source of truth.

### Addressables build proof

The MCP bridge tool `unity.buildAddressables` is the reviewer-facing
"prove the package shipped real Unity assets" surface. Every call
returns:

- `buildDurationMs` and `buildCompletedAtUtc` - timing of the Addressables
  player content build, captured by `Stopwatch` and `DateTime.UtcNow`.
- `generatedEntryCount` and `labelCounts` - how many addressable entries
  came from Greybox plus per-label counts.
- `missingLabels` - any expected label that Addressables could not
  resolve.
- `generatedEntries` - bounded list of `assetExists` / `assetType` per
  entry. The list is truncated at `MaxMcpAddressablesSummaryEntries` to
  keep responses small for reviewers.
- The labels `greybox-generated`, `greybox-sample-scene`, and
  `greybox-2d-platformer` so the imported 2D Platformer sample is
  trivially discoverable from the Addressables window.

This makes it easy for a reviewer to confirm the package imports real
Unity assets rather than placeholder JSON. See
[Documentation~/round-trip-sync.md](Documentation~/round-trip-sync.md)
for the full contract.

## Releases and CI

- **Pull requests:** GitHub Actions
  (`.github/workflows/unity-validation.yml`) runs the Node validator
  suite, Asset Store metadata gate, deterministic UPM dry-run package
  build, and the in-process smoke daemon on every push. The Unity test
  matrix (`game-ci/unity-test-runner@v4`) runs on Ubuntu + macOS across
  Unity 2022.3.74f1 / 2023.2.20f1 / 6000.0.58f1 when `UNITY_LICENSE` is
  configured.
- **Tag releases:** Pushing a `v*` tag triggers
  `.github/workflows/release.yml` to produce the deterministic UPM
  tarball, SHA-256 checksums, and (when `UNITY_LICENSE` is configured)
  the real `.unitypackage` via `game-ci/unity-builder@v4`. CI never
  fabricates the Asset Store `.unitypackage`.

## Documentation, support, and changelog

| Topic | Where |
|---|---|
| Round-trip sync contract | [Documentation~/round-trip-sync.md](Documentation~/round-trip-sync.md) |
| Conflict resolution flow | [Documentation~/Conflict-Resolution.md](Documentation~/Conflict-Resolution.md) |
| Build manual | [BUILDING.md](BUILDING.md) |
| Asset Store submission packet | [ASSET_STORE_SUBMISSION.md](ASSET_STORE_SUBMISSION.md) |
| Store listing copy | [STORE_LISTING.md](STORE_LISTING.md) |
| License | [LICENSE.md](LICENSE.md) |
| Third-party notices | [Third-Party Notices.txt](Third-Party%20Notices.txt) |
| Changelog | [CHANGELOG.md](CHANGELOG.md) |

Customer support: [support@greybox.studio](mailto:support@greybox.studio).

User docs hub: <https://greybox.studio/docs/unity>.

## Security and privacy

- MCP bridge binds to `127.0.0.1:38467` only and requires a local editor
  bearer token.
- License keys live exclusively in Unity `EditorPrefs`; `GreyboxConfig`
  never serialises secrets into scenes, prefabs, or ScriptableObjects.
- No customer API keys are bundled.
- The package never fetches local-network or private URLs referenced from
  artifact JSON; only daemon-verified, SHA-256-checked engine package
  downloads are imported.
- Greybox does not train models on customer game IP through this Unity
  plugin. Managed inference is opt-in and governed by the Greybox Studio
  service terms.
