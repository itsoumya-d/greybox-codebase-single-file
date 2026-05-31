<!-- SPDX-License-Identifier: Apache-2.0 -->

# Greybox Studio Community Importer For Godot

This is the open-core Godot Asset Library package for Greybox Studio. It is
import-only, local-only, and Apache-2.0 licensed so Godot developers can inspect
and modify the addon before putting it in a shipped game.

## What It Does

- Imports `.gameview.json` scene layout notes into a Godot node plan.
- Imports `DESIGN.md` into a `GreyboxCommunityArtifact` resource.
- Imports HUD HTML into a Control-tree planning node.
- Imports level board JSON into a TileMap-ready planning node.
- Preserves the human designer credit in imported artifact metadata.

## What It Does Not Do

- No telemetry.
- No cloud calls.
- No managed inference.
- No paid bridge controls.
- No license keys.
- No model training on project data.

Paid round-trip sync, scene-control bridge tools, priority queues, and custom
skill packs stay in the proprietary Greybox engine plugins and Greybox Cloud.

## Install

Copy `addons/greybox_studio_community` into a Godot 4.2+ project, then enable
`Greybox Studio Community Importer` in Project Settings > Plugins.

## Asset Library Notes

Use the custom download provider when submitting this package so Asset Library
users download only this directory, not the full open-design repository.
Complete the fields in `ASSET_LIBRARY_SUBMISSION.md` after the public repository
URL, direct raw icon URL, and release ZIP URL exist.

Build the local release package from the repository root:

```bash
pnpm exec tsx scripts/pack-godot-community-addon.ts
```

The ZIP and SHA-256 report are written under `.tmp/godot-community-addon/`.
