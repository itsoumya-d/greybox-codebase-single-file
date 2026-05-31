# Greybox Marketplace Submission Packet

Status: submission packet ready; external submissions are not complete.

This is operator evidence for distribution workstream 9. It is not proof of
store approval, publisher-account ownership, Unity verification, Fab approval,
Godot Asset Library approval, or any third-party partnership.

Source check date: 2026-05-18.

## Official Sources

- Unity start publishing: https://assetstore.unity.com/publishing/publish-and-sell-assets
- Unity submission guidelines: https://assetstore.unity.com/publishing/submission-guidelines
- Unity Verified Solutions: https://unity.com/partners/verified-solutions
- Fab publisher onboarding: https://www.fab.com/en-US/become-a-publisher
- Epic MegaGrants: https://www.unrealengine.com/megagrants
- Godot Asset Library submit: https://godotengine.org/asset-library/asset/submit
- Godot Asset Library guidelines: https://docs.godotengine.org/en/stable/community/asset_library/submitting_to_assetlib.html

## Channel Matrix

| Channel | Greybox artifact | Submission posture | External blocker |
| --- | --- | --- | --- |
| Unity Asset Store | `../greybox-unity-plugin/STORE_LISTING.md` and package validator | Ready for publisher upload after Unity Editor smoke | Publisher profile, tax interview, Asset Store Tools upload, review approval |
| Unity Verified Solutions | Unity plugin release evidence, 100 paying-customer proof, support packet | Prepare now; apply after Unity v1.0 traction | Verified Solutions application, technical review, Unity decision |
| Fab | `../greybox-unreal-plugin/STORE_LISTING.md` | Prepare listing while Unreal stays behind Unity quality bar | Fab publisher account, Epic review, Unreal editor compile evidence |
| Godot Asset Library | `../greybox-godot-plugin/ASSET_LIBRARY.md` | Prepare free community listing | AssetLib login, approved license/repository, Godot editor smoke |
| itch.io creator tools | Brand assets, Unity/Godot/Fab copy, tutorial demo | Prepare launch mirror | Creator account, downloadable build, support workflow |
| Steamworks partner | Creator-tool positioning and demo videos | Defer until engine plugins are public | Steamworks access and store-review suitability |

## Unity Store Notes

Unity's publisher flow requires a publisher profile, a package created in the
Publisher Portal, upload from the Unity Editor using Asset Store Tools, and
review by Unity's curation team. The current package packet must keep:

- Transparent AI-aided disclosure in marketing metadata.
- No bundled API keys or secrets.
- No automatic redirects outside the Editor.
- No package-origin errors or warnings after setup.
- Clear extra-cost disclosure for managed inference and subscriptions.
- Third-party notices inside the package.

## Godot License Risk

The current `../greybox-godot-plugin` repo is proprietary. Godot Asset Library
submission requires the listed license to match the repository license and the
repository to include the license file. Before submitting, publish a free
community addon package with a compliant license, README, icon, raw icon URL,
and working Godot version evidence. Paid round-trip sync and MCP features stay
in Greybox Cloud/Pro entitlements.

## Submission Evidence To Attach

- Unity: validation artifacts, 2022.3/2023.2/Unity 6 smoke matrix, screenshots,
  pricing tiers, support email, Third-Party Notices, AI disclosure.
- Fab: Unreal plugin package, supported Unreal versions, screenshots,
  documentation, license, support email, MCP loopback disclosure.
- Godot: addon folder, license, README, icon direct URL, version compatibility,
  screenshot/video preview links, issue tracker URL.
- itch.io: downloadable package links, release notes, support policy, demo GIF.

## No-Claim Rule

Until external evidence exists, all decks and status reports must say
"prepared for submission" or "submitted on <date>", not "approved", "verified",
"grant awarded", "sponsored", or "official partner".
