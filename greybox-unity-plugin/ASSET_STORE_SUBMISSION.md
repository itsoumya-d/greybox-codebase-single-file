# Greybox Studio Unity Asset Store Submission

Ready to submit: no

Greybox Studio is the AI-assisted design layer for shipped games. This packet
is the reviewer handoff for submitting `com.greybox.studio` to the Unity Asset
Store once the package exits alpha and the real Unity Editor smoke matrix passes.

## Listing Metadata

- Publisher: Greybox Studio
- Package name: Greybox Studio
- Package id: com.greybox.studio
- Category: Tools / Game Toolkits
- Target Unity versions: 2022.3 LTS, 2023.2, Unity 6
- Support email: support@greybox.studio
- Support URL: https://greybox.studio/support
- Documentation URL: https://greybox.studio/docs/unity
- Privacy URL: https://greybox.studio/privacy
- License URL: https://greybox.studio/docs/unity/license
- Changelog URL: https://greybox.studio/docs/unity/changelog

## Review Notes

- The package imports `.gameview.json`, `DESIGN.md`, HUD HTML, and level-board
  artifacts into Unity.
- Round-trip sync, the MCP bridge, and priority queue features require Pro or
  Studio licensing validated through Greybox Cloud.
- Free Personal imports remain watermarked and capped at 3 locally tracked projects.
- No API keys, license keys, customer artifacts, or game IP are bundled in the
  package. License keys are stored only in Unity `EditorPrefs`.
- The MCP bridge binds to loopback only and requires a local editor bearer token.
- Greybox uses AI-assisted language throughout public surfaces. Shipped
  artifacts preserve human designer credit.

## Pricing And Entitlements

- Free Personal: 3 projects max, watermarked artifacts, no round-trip sync.
- Indie: $149 one-time. Unlimited projects, no watermark, one-way import only.
- Pro: $399 one-time + $9/mo. Round-trip sync, MCP bridge, priority queue.
- Studio site license: $2,999 one-time + $499/yr. Up to 25 seats, SSO, custom skill packs.

## External Services And Costs

Greybox Studio connects to the local Greybox daemon for one-way import and
round-trip sync. Pro and Studio tiers may connect to Greybox Cloud for license
checks, priority queue handling, and managed inference. Managed inference and
subscriptions may create additional costs beyond the Asset Store package.

## Required Visual Assets

- Icon: `Documentation~/asset-store/icon-1600.png`
- Cover image: `Documentation~/asset-store/cover-1950x1300.png`
- Screenshot 1: `Documentation~/asset-store/screenshot-importers.png`
- Screenshot 2: `Documentation~/asset-store/screenshot-round-trip.png`
- Screenshot 3: `Documentation~/asset-store/screenshot-mcp-bridge.png`
- Screenshot 4: `Documentation~/asset-store/screenshot-samples.png`

## Submission Blockers

- Change `package.json` to a stable `1.0.0` or later version.
- Run `node Validation~/release-readiness.mjs --submission --require-unity`
  with Unity 2022.3 LTS installed.
- Run the Unity smoke matrix for 2022.3 LTS, 2023.2, and Unity 6 with real
  Unity Editors, not dry-run mode.
- Run `node Validation~/stable-release-candidate.mjs --require-ready` after
  release readiness and `.unitypackage` export evidence are generated.
- Attach the required visual assets listed above in the publisher portal.
- Complete trademark/domain clearance and Asset Store publisher credentials.

## Reviewer Test Path

1. Install the package into a clean Unity 2022.3 LTS project.
2. Import the `2D Platformer` sample.
3. Use `Greybox Studio > Import Project Artifacts` to import the sample
   `.gameview`, `.design`, `.gbhud`, and `.levelboard` files.
4. Confirm generated prefabs, materials, ScriptableObjects, HUD canvas, and
   Addressables labels are present.
5. Confirm Free Personal watermarks appear without a paid license.
6. Validate a Pro or Studio license through Greybox Cloud to unlock round-trip
   sync and MCP bridge controls.
7. Connect the local daemon and confirm artifact refresh or Unity-side edits
   sync within the 2-second budget.

## Final Submission Command

```bash
node Validation~/release-readiness.mjs --submission --require-unity \
  --unity-target "2022.3.74f1=/Applications/Unity/Hub/Editor/2022.3.74f1/Unity.app/Contents/MacOS/Unity" \
  --unity-target "2023.2.20f1=/Applications/Unity/Hub/Editor/2023.2.20f1/Unity.app/Contents/MacOS/Unity" \
  --unity-target "6000.0.58f1=/Applications/Unity/Hub/Editor/6000.0.58f1/Unity.app/Contents/MacOS/Unity" \
  --output Validation~/artifacts/release-readiness.json
node Validation~/package-builder.mjs --submission --output dist/com.greybox.studio.tgz --manifest dist/com.greybox.studio.manifest.json --summary dist/com.greybox.studio.summary.md
# This runner invokes -executeMethod Greybox.Editor.Export.GreyboxAssetStorePackageExporter.ExportFromCommandLine
# and passes -greyboxAssetStorePackageOutput to produce the final Asset Store file.
node Validation~/unity-package-export.mjs --unity "/Applications/Unity/Hub/Editor/2022.3.74f1/Unity.app/Contents/MacOS/Unity" --unity-version 2022.3.74f1 --project-path .tmp/asset-store-export --output dist/com.greybox.studio.unitypackage --manifest Validation~/artifacts/unitypackage-export.json
node Validation~/stable-release-candidate.mjs --require-ready --output Validation~/artifacts/stable-release-candidate.json
```
