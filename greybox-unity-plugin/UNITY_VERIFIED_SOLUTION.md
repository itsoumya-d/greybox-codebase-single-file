# Greybox Studio Unity Verified Solution Readiness

Ready to apply: no

## Program Target

- Program: Unity Verified Solutions Program
- Product: Greybox Studio
- Publisher: Greybox Studio
- Package name: Greybox Studio
- Package id: com.greybox.studio
- Integration category: AI-assisted game design Editor extension
- Target Unity versions: 2022.3 LTS, 2023.2, Unity 6
- Support email: support@greybox.studio
- Support URL: https://greybox.studio/support
- Documentation URL: https://greybox.studio/docs/unity
- Privacy URL: https://greybox.studio/privacy

## Technical Evidence

- Asset Store packet: `ASSET_STORE_SUBMISSION.md`
- Release gate: `node Validation~/release-readiness.mjs --submission --require-unity`
- Unity smoke matrix: Unity 2022.3 LTS, 2023.2, Unity 6
- MCP conformance report: `Validation~/artifacts/mcp-conformance.md`
- Deterministic package manifest: `Validation~/artifacts/package-manifest.json`
- Stable release candidate proof: `Validation~/artifacts/stable-release-candidate.json`
- Stable release command: `node Validation~/stable-release-candidate.mjs --require-ready`
- Round-trip latency target: 2-second p95 web-to-Unity and Unity-to-web sync
- Sample import target: 2D Platformer imports in under 30 seconds
- Licensing gate: Free Personal and Indie stay one-way import only; Pro and Studio unlock round-trip sync, MCP bridge, and priority queue.
- Free Personal controls: 3 locally tracked projects and visible watermarked generated artifacts.

## Security And Privacy Evidence

- No API keys, license keys, customer artifacts, or game IP are bundled in the package.
- License keys are stored in Unity `EditorPrefs`, never in runtime assets, prefabs, scenes, or ScriptableObjects.
- MCP bridge is loopback-only and requires a local editor bearer token.
- Greybox is AI-assisted; shipped artifacts credit the human designer.
- Greybox Studio does not train models on customer game IP without separate explicit opt-in consent.
- Third-party dependencies are Unity Package Manager dependencies documented in `Third-Party Notices.txt`.

## Customer Evidence Needed

- 100+ paying Unity plugin customers.
- 100+ active round-trip sync customers.
- 50+ active MCP bridge customers.
- 5+ shipped commercial games crediting Greybox.
- 3+ public Unity customer references approved for partner review.
- Support SLA evidence for Studio and Enterprise customers.

## Application Blockers

- Change `package.json` to a stable `1.0.0` or later version.
- Pass the real Unity smoke matrix for 2022.3 LTS, 2023.2, and Unity 6.
- Run `node Validation~/stable-release-candidate.mjs --require-ready` after
  release readiness, package export, and adoption source evidence are fresh.
- Upload the Asset Store package and required visual assets.
- Complete trademark/domain clearance and Unity publisher credentials.
- Collect Unity customer references and support SLA evidence.
- Confirm counsel-approved privacy, DPA, and AI-assisted disclosure copy.
