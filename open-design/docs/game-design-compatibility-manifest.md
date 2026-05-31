# Game Design Compatibility Manifest

**Parent:** [`game-design-transformation-audit.md`](game-design-transformation-audit.md)

This manifest defines the only allowed legacy compatibility surfaces in AI Game Design Studio. These aliases exist to keep stored projects, old launchers, saved desktop links, and historical artifact manifests readable after the game-design transformation. They are not product identity, active prompts, visible UI copy, or first-class catalog entries.

`pnpm guard` enforces the code-level boundary through:

- `checkCompatibilityAliasTargets`
- `checkLegacyArtBibleCompatibilityConfinement`
- `checkLegacyRuntimeProtocolConfinement`

## Boundary Rules

- Canonical names must be `agds`, `AGDS_*`, `game-art-bible`, `game-deliverable`, `game module`, `player`, `gameplay loop`, and AI Game Design Studio.
- Compatibility aliases may only parse or redirect old data into canonical game-native structures.
- Compatibility aliases must not appear as first-class skill folders, prompt-template files, game-art-bible catalog entries, onboarding fields, active prompts, visible navigation labels, or user-facing examples.
- When an alias is retained, the surrounding code or documentation must say it is legacy, deprecated, migration-only, or compatibility-only.
- Alias targets must resolve to canonical game-native implementations, never to a recreated non-game workflow.

## Allowed Surfaces

| Surface | Canonical replacement | Allowed owners | Why it remains | Guard or test coverage |
|---|---|---|---|---|
| Legacy art-bible manifest/frontmatter keys | `game-art-bible`, `gameArtBibleId`, `disabledGameArtBibles`, `/api/game-art-bibles` | Artifact manifest validators and MCP resource readers | Existing project metadata and artifact manifests may contain retired design-system names | `checkLegacyArtBibleCompatibilityConfinement`, `apps/daemon/tests/game-art-bibles-routes.test.ts`, `apps/daemon/tests/artifact-manifest.test.ts` |
| Retired built-in art-bible ids | Hidden `.retired` game-art-bible folders plus canonical curated game-art-bible catalog | `game-art-bibles/.retired/` and exact-read fallback in the daemon | Stored projects can open old art-bible ids without advertising them to new creators | `apps/daemon/tests/game-art-bibles.test.ts`, `packages/contracts/tests/game-studio.test.ts` |
| Runtime environment aliases | `AGDS_*` variables | Daemon, packaged runtime, web sidecar, tools-dev, tools-pack, sidecar protocol wrappers | Old launchers and packaged builds may still set `OD_*` variables | `checkLegacyRuntimeProtocolConfinement`, `apps/daemon/tests/server-env-aliases.test.ts`, packaged/tooling tests |
| Stored data roots | `.agds/` | Data-dir resolution and legacy data migrator | Existing local repositories may contain old `.od/` data | `checkLegacyRuntimeProtocolConfinement`, `apps/daemon/tests/resolve-data-dir.test.ts`, `apps/daemon/tests/legacy-data-migrator.test.ts` |
| Desktop import token header alias | `X-AGDS-Desktop-Import-Token` | Daemon folder-import auth | Older desktop shells may send the retired token header during folder import | `apps/daemon/tests/desktop-import-token-gate.test.ts` |
| Release and installer naming aliases | AI Game Design Studio release names and package ids | Release scripts, installer migration hooks, historical changelog notes | Historical tags, package bundles, and distribution paths need upgrade continuity | Guard release identity checks and release-script tests |

## Explicit Non-Surfaces

The following are not allowed compatibility destinations:

- A visible legacy "Open Design" product label.
- First-class non-game skill folders or prompt-template files.
- New documentation that teaches old website, SaaS, or app-builder workflows as current behavior.
- First-party web routes that prefer old design-system APIs over game-native routes.
- Daemon `/api/design-systems` route aliases.
- Legacy compatibility aliases for daemon `/api/import/claude-design` routes; `/api/import/game-studio` is the only active ZIP import route.
- Packaged or MCP `od://` URI aliases; `agds://` is the only active packaged/MCP URI scheme.
- Generated artifacts that contain legacy app-builder copy unless the artifact is a negative test fixture.

When in doubt, delete the alias from the active surface and keep only a narrow parser, redirect, or migration shim.
