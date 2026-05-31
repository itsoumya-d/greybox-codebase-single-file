# Greybox Studio For Unreal

Greybox Studio for Unreal imports AI-assisted game-design artifacts into Unreal
Editor and keeps designer/developer changes ready for round-trip sync.

## Alpha Positioning

- Import `.gameview.json` into actor/Blueprint plans.
- Import `DESIGN.md` art bibles into Unreal data assets.
- Convert HUD HTML into UMG Widget Blueprint plans.
- Convert level board JSON into Paper2D TileMap or Level plans.
- Preflight native Unreal engine packages before download, including manifest
  count, source `.gameview.json`, runtime hooks, and estimated zip size.
- Stage Unreal engine package zips safely under the project `Saved/` directory
  before extracting SHA-256 verified files into `Source/GreyboxGenerated`.
- Open a Greybox Studio tab from Unreal's Window menu to check export
  readiness, stage native packages, and copy MCP client configuration.
- Expose MCP tools for world hierarchy, actor creation, component/property
  edits, asset assignment, automation tests, viewport screenshots, and cooked
  content builds.

The MCP bridge is loopback-only and requires a local bearer token copied from
the editor configuration. Greybox is AI-assisted; human designers remain the
authors of shipped artifacts.

## Pricing Alignment

Unreal follows the Unity Pro and Studio tiers after Unity v1.0 and 100 paying
Unity plugin customers. Enterprise pilots require the cloud enterprise
pilot-readiness packet before committing to private-network, on-prem, or
data-residency terms.
