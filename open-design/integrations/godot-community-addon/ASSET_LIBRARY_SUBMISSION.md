<!-- SPDX-License-Identifier: Apache-2.0 -->

# Godot Asset Library Submission

Status: package-ready locally; external submission is blocked on public release
URL, raw icon URL, and Asset Library account access.

## Submission Fields

| Field | Value |
| --- | --- |
| Title | Greybox Studio Community Importer |
| Category | Addons |
| License | Apache-2.0 |
| Godot version | 4.2+ |
| Version | 0.1.0-alpha.1 |
| Repository URL | pending public release repository |
| Download provider | Custom |
| Download URL | pending release ZIP containing only this package |
| Icon URL | pending raw URL for `addons/greybox_studio_community/icon.svg` |
| Issue tracker | pending public issue URL |

## Short Description

Import Greybox AI-assisted game-design artifacts into Godot as editable scene,
HUD, art-bible, and level-board planning resources.

## Long Description

Greybox Studio Community Importer is the free, Apache-2.0 Godot path for teams
that want transparent AI-assisted design handoff without cloud services or paid
editor controls. It imports `.gameview.json`, `DESIGN.md`, HUD HTML, and level
board JSON into local Godot planning nodes while preserving human designer
credit in artifact metadata.

This package does not include telemetry, managed inference, license checks,
scene-control bridge tools, or paid round-trip sync.

## Pre-Submission Checks

- Run `pnpm exec tsx scripts/validate-godot-community-addon.ts`.
- Run `pnpm exec tsx scripts/pack-godot-community-addon.ts` and upload the
  generated ZIP from `.tmp/godot-community-addon/`.
- Confirm the release ZIP includes `LICENSE`, `README.md`,
  `ASSET_LIBRARY_SUBMISSION.md`, `PACKAGE_MANIFEST.json`, and
  `addons/greybox_studio_community/**`.
- Confirm every source file uses `SPDX-License-Identifier: Apache-2.0`.
- Confirm no proprietary Greybox plugin files are present.
- Confirm no token, bearer, authorization, sync, managed-inference, or paid
  bridge code is present.
- Confirm the public issue tracker and support route are live.

## No-Claim Rule

Use "package-ready" or "submitted" until the Asset Library listing is approved.
Do not claim Godot approval, sponsorship, partnership, or official endorsement
from this local package.
