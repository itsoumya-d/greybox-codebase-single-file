# Game Design Completion Audit

This document is the final-audit checklist for the AI Game Design Studio transformation. It is not a completion certificate. It restates the objective as concrete deliverables, maps the prompt to repository artifacts, and records the evidence that must be inspected before anyone can claim the transformation is complete.

## Objective Deliverables

1. Canonical identity: AI Game Design Studio and `agds` are the visible product and command identity.
2. Game-native intelligence: prompts, agents, critique, memory, orchestration, and generation rules reason in game-design terms only.
3. Game-native content systems: skills, craft guides, game art bibles, templates, examples, prompt templates, media prompts, and exports produce game deliverables.
4. Game-native workspace: onboarding, project panels, file viewers, studio document editors, viewport/node/behavior/system renderers, and collaboration surfaces feel like a professional game studio workspace.
5. Game-domain persistence: contracts, SQLite migrations, metadata, memory APIs, and studio document schemas support durable game worlds, systems, scenes, lore, economy, multiplayer, telemetry, and production planning.
6. Compatibility confinement: legacy names and protocols remain only as hidden migration, storage, protocol, or negative-test fixtures, and never as first-class product behavior.
7. Verification: the required guard, typecheck, locale, residual-language, focused package tests, and browser/editor smoke checks pass under the repo-supported Node runtime.

## Prompt-To-Artifact Checklist

| Prompt requirement group | Required artifacts | Verification evidence |
|---|---|---|
| Product identity and terminology | `README*.md`, `QUICKSTART*.md`, `CONTRIBUTING*.md`, `package.json`, public site, locale dictionaries, release metadata, CLI/MCP/packaged labels | `pnpm guard`, `pnpm residual:language-audit`, locale tests, AGDS public identity guard |
| Studio agent architecture | `packages/contracts/src/game-studio.ts`, prompt composers, Critique Theater roles, orchestration and scheduler routes | `packages/contracts/tests/game-studio.test.ts`, `apps/daemon/tests/chat-route.test.ts`, orchestration/scheduler route tests |
| Prompt engineering and discovery | Contract-owned prompt files, daemon re-exports, discovery metadata, craft injection, media contract | `apps/daemon/tests/prompts/system.test.ts`, `apps/daemon/tests/system-prompt-template.test.ts`, prompt-template tests |
| Onboarding and game metadata | `NewProjectPanel`, game brief metadata, design-focus selection, game art bible selection, media controls, connector guidance | `apps/web/tests/components/NewProjectPanel.test.tsx`, locale tests, web typecheck, `pnpm completion:audit` onboarding inventory |
| Game memory and schemas | `packages/contracts/src/api/projects.ts`, `apps/daemon/src/db.ts`, game entity/link APIs, studio JSON schemas | `apps/daemon/tests/game-schema.test.ts`, `packages/contracts/tests/game-studio.test.ts`, daemon route tests |
| Game skills and craft docs | `skills/*/SKILL.md`, `craft/*.md`, game-art-bible catalog, sample artifacts | `apps/daemon/tests/skills.test.ts`, `craft-docs.test.ts`, `sample-artifacts.test.ts`, `pnpm guard` |
| Templates and media generation | `templates/*`, `prompt-templates/image/*`, `prompt-templates/video/*`, live artifact examples | `apps/daemon/tests/prompt-templates.test.ts`, `packages/contracts/tests/game-studio.test.ts`, `e2e/ui/game-template-render.test.ts` |
| Studio document editing | `.gameview.json`, `.nodegraph.json`, `.btree.json`, `.systems.json`, `GameStudioDocumentEditor`, workspace routing | `apps/web/tests/components/GameStudioDocumentEditor.test.ts`, `apps/web/tests/components/GameStudioDocumentEditor.render.test.tsx`, `apps/web/tests/components/FileWorkspace.test.tsx` |
| Viewport/runtime/playtest systems | gameview runtime export, deterministic playtest simulation, browser runtime player-bot, telemetry/balance/autonomous loops | `apps/daemon/tests/game-playtest-simulation-routes.test.ts`, telemetry/balance/autonomous route tests, E2E player-bot tests |
| Export/final package systems | final game package route, GDD/package skill, artifact lint hooks, studio package export guidance | `apps/daemon/tests/finalize-game-package.test.ts`, artifact-lint tests, live-artifact store tests |
| Compatibility confinement | `docs/game-design-compatibility-manifest.md`, migration aliases, legacy import/protocol tests | `apps/daemon/tests/compatibility-manifest.test.ts`, guard compatibility checks, residual-language audit categories |
| Locale and visible copy | `apps/web/src/i18n/locales/*.ts`, visible workspace copy, translated docs | `apps/web/tests/i18n/locales.test.ts`, `apps/daemon/tests/i18n-fallback-audit.test.ts`, `pnpm i18n:fallback-audit`, localized Markdown guard |

## Required Commands

The final completion pass must include these commands under Node `~24`:

- `pnpm guard`
- `pnpm completion:audit`
- `pnpm residual:language-audit`
- `pnpm i18n:fallback-audit`
- `pnpm typecheck`
- `pnpm --filter @ai-game-design-studio/daemon exec vitest run -c vitest.config.ts tests/i18n-fallback-audit.test.ts tests/requirement-matrix.test.ts --testTimeout 30000 --hookTimeout 30000`
- `pnpm --filter @ai-game-design-studio/web exec vitest run -c vitest.config.ts tests/i18n/locales.test.ts --testTimeout 30000`
- `pnpm --filter @ai-game-design-studio/daemon exec vitest run -c vitest.config.ts tests/game-schema.test.ts tests/prompt-templates.test.ts --testTimeout 30000`
- `pnpm --filter @ai-game-design-studio/contracts exec vitest run tests/game-studio.test.ts --testTimeout 30000`
- `pnpm --filter @ai-game-design-studio/web exec vitest run -c vitest.config.ts tests/components/NewProjectPanel.test.tsx tests/components/GameStudioDocumentEditor.test.ts tests/components/GameStudioDocumentEditor.render.test.tsx tests/lib/parse-provenance.test.ts tests/lib/build-clipboard-prompt.test.ts --testTimeout 30000`
- `pnpm --filter @ai-game-design-studio/daemon exec vitest run -c vitest.config.ts tests/requirement-matrix.test.ts --testTimeout 30000 --hookTimeout 30000`
- `pnpm --filter @ai-game-design-studio/daemon test`
- `pnpm --filter @ai-game-design-studio/web test`
- `pnpm --filter @ai-game-design-studio/contracts test`
- `pnpm --filter @ai-game-design-studio/tools-dev test`
- `pnpm --filter @ai-game-design-studio/tools-pack test`
- `pnpm --filter @ai-game-design-studio/e2e typecheck`
- `pnpm --filter @ai-game-design-studio/e2e exec playwright test ui/game-studio-first-screen.test.ts ui/game-studio-documents.test.ts ui/game-template-render.test.ts ui/game-studio-collaboration.test.ts ui/game-studio-presence.test.ts ui/game-runtime-player-bot.test.ts --config playwright.config.ts --project=chromium`
- Manual browser smoke: start `pnpm tools-dev run web --namespace agds-smoke --daemon-port 17645 --web-port 17646`, open `http://127.0.0.1:17646`, then verify new project creation, game art bible selection, game memory persistence, studio document rendering, playable HTML preview, and desktop/mobile screenshot checks for overlapping text or legacy visible copy.
- `git diff --check`

## Current Open Findings

- Full native-language editorial review remains outside automated checks. `apps/web/tests/i18n/locales.test.ts` now proves every non-English dictionary declares the same key set as English and rejects scoped mixed-English external-MCP connectivity/OAuth fragments, `pnpm i18n:fallback-audit` fails if any unreviewed exact English fallback or scoped mixed-English phrase appears beyond the technical/proper-noun allowlist, and `apps/daemon/tests/i18n-fallback-audit.test.ts` proves the report and failure paths, but these checks cannot prove natural native-language quality.
- Broad final end-state claims remain subject to this checklist. Passing a guard or matrix test is useful evidence, not a substitute for inspecting whether every requirement has a real artifact and a relevant verifier.
- Compatibility aliases remain intentionally present only where documented in `docs/game-design-compatibility-manifest.md`; any new retained alias must be added there and classified by `pnpm residual:language-audit`.

## Latest Evidence Snapshot

May 15, 2026 verification after the Greybox kickoff pass:

- `pnpm completion:audit` passed with 7 objective deliverables, 12 prompt-to-artifact rows, 20 required-command rows, 100 requirement-matrix rows, 13 studio roles, 10 collaboration handoffs, 4 debate checkpoints, an inspected surface inventory of 41 skills, 21 templates, 23 image prompts, 31 video prompts, and 17 art bibles, 17 required image prompt families and 20 required video prompt families, 20 required game entity types verified across contracts and daemon DB tables/indexes, 22 visual/motion/audio game token families verified across contracts, prompt rules, and the systems template, 38 studio-grade evaluation axes verified with artifact lint enforcement, 12 required game-brief onboarding prompts verified with retired app/website onboarding copy blocked, dedicated community/modding skill, craft, memory, and evaluator inventory, dedicated difficulty-director skill, craft, memory, behavior-tree template, and evaluator inventory, dedicated companion/party skill, craft, memory, narrative template, and evaluator inventory, dedicated dungeon/raid skill, craft, memory, dungeon/live-ops templates, and evaluator inventory, dedicated narrative-simulation skill, craft, memory, narrative template, and evaluator inventory, plus dedicated adaptive-scaling skill, craft, memory, systems template, prompt memory ids, and evaluator inventory.
- `pnpm residual:language-audit` passed after scanning 1200 source files and classifying 536 legacy-language matches with 0 undocumented matches; generated Playwright `.agds-data` runtime folders are skipped.
- `pnpm i18n:fallback-audit` initially found 1 French exact-English fallback, `settings.mediaProvidersNavHint`; it was localized to `Image / vidéo / audio`, and the audit now passes with 0 unreviewed exact-English values and 0 scoped mixed-English phrase values.
- `pnpm guard` passed after the kickoff docs, locale fix, daemon spawn fix, and aborted-agent test hardening.
- `pnpm --filter @ai-game-design-studio/web exec vitest run -c vitest.config.ts tests/i18n/locales.test.ts --testTimeout 30000` passed: 55 tests, including explicit locale key-set parity against English, mixed-English external-MCP status-copy coverage, reviewed project-action/external-MCP helper-copy regression coverage, and reviewed artifact inspection/refresh-history helper-copy coverage.
- `pnpm --filter @ai-game-design-studio/daemon exec vitest run -c vitest.config.ts tests/i18n-fallback-audit.test.ts tests/requirement-matrix.test.ts --testTimeout 30000 --hookTimeout 30000` passed: 6 tests across 2 files, including the locale fallback report check, forced-failure fixture, and concrete matrix evidence-path checks.
- `pnpm --filter @ai-game-design-studio/daemon exec vitest run -c vitest.config.ts tests/game-schema.test.ts tests/prompt-templates.test.ts tests/requirement-matrix.test.ts --testTimeout 30000 --hookTimeout 30000` passed: 16 tests across 3 files.
- A full daemon package run initially exposed a chat/orchestration spawn regression, `activeGameArtBibleId is not defined`; `apps/daemon/src/server.ts` now passes the canonical `gameArtBibleId` into prompt composition.
- The same package pass exposed a race in the aborted fake-agent connection test; `apps/daemon/tests/connection-test.test.ts` now waits until the fake agent has installed its `SIGTERM` handler before aborting.
- `pnpm --filter @ai-game-design-studio/daemon exec vitest run -c vitest.config.ts tests/chat-route.test.ts tests/game-studio-orchestration-routes.test.ts tests/mcp-spawn.test.ts tests/finalize-route-abort.test.ts --testTimeout 30000 --hookTimeout 30000` passed: 27 tests across 4 files.
- `pnpm --filter @ai-game-design-studio/daemon exec vitest run -c vitest.config.ts tests/connection-test.test.ts --testTimeout 30000 --hookTimeout 30000` passed: 48 tests.
- `pnpm --filter @ai-game-design-studio/daemon test` passed on rerun after the fixes: 126 files, 1760 tests.
- Persona-backed playtesting now has focused route and web-surface evidence: `tests/game-playtest-simulation-routes.test.ts` proves `.gameview.json`, playable-artifact, and daemon headless-browser playtests can return persona reports, broadcast `personaCount`, and persist shared persona playtest presets under the project; `tests/game-autonomous-iteration-routes.test.ts` proves persona reports become prioritized autonomous-iteration actions and source counts; `apps/web/tests/components/GameTelemetryBoard.test.tsx` proves the Production board can run selected persona playtests, route scene/runtime/browser modes to the correct daemon endpoint, target a named artifact, save/apply/remove repeatable presets, hydrate shared daemon presets, safely hand persona setups to autonomous iteration and balance-loop review, and render persona findings.
- `pnpm --filter @ai-game-design-studio/contracts exec vitest run tests/game-studio.test.ts --testTimeout 30000` passed: 17 tests.
- `pnpm --filter @ai-game-design-studio/web exec vitest run -c vitest.config.ts tests/components/NewProjectPanel.test.tsx tests/components/GameStudioDocumentEditor.test.ts tests/components/GameStudioDocumentEditor.render.test.tsx tests/lib/parse-provenance.test.ts tests/lib/build-clipboard-prompt.test.ts --testTimeout 30000` passed: 40 tests across 5 files.
- `pnpm --filter @ai-game-design-studio/contracts test` passed: 28 tests across 5 files.
- `pnpm --filter @ai-game-design-studio/tools-dev test` passed: 13 tests.
- `pnpm --filter @ai-game-design-studio/tools-pack test` passed on standalone rerun: 67 tests across 14 files. The first parallel attempt hit four 5-second timeout failures under concurrent load, then the identical command passed when run by itself.
- `pnpm --filter @ai-game-design-studio/e2e typecheck` passed.
- `pnpm --filter @ai-game-design-studio/e2e exec playwright test ui/game-studio-first-screen.test.ts ui/game-studio-documents.test.ts ui/game-template-render.test.ts ui/game-studio-collaboration.test.ts ui/game-studio-presence.test.ts ui/game-runtime-player-bot.test.ts --config playwright.config.ts --project=chromium` passed: 23 browser tests across the first-screen, studio-document, template-render, collaboration, presence, and runtime player-bot shards.
- `pnpm typecheck` passed across the workspace, including landing page, E2E, contracts, platform, sidecar packages, daemon, desktop, web, tools-dev, tools-pack, packaged app, and scripts.
- Evidence sampling confirmed 35 game skill folders, 21 top-level templates, 23 image prompt templates, 31 video prompt templates, and 17 visible game art bibles.
- Evidence sampling confirmed studio agents in `packages/contracts/src/game-studio.ts`, game-domain memory tables in `apps/daemon/src/db.ts`, discovery/onboarding metadata in `packages/contracts/src/prompts/discovery.ts` and `apps/web/src/components/NewProjectPanel.tsx`, and viewport/node/behavior/system document rendering in `apps/web/src/components/GameStudioDocumentEditor.tsx`.
- Commercial build-out gaps from the Greybox brief remain outside the completed open-core transformation evidence and are tracked in `docs/greybox-commercial-readiness.md`: no sibling `../greybox-brand`, `../greybox-unity-plugin`, or closed-core repos were found; no Unity package, `/api/sync/unity`, or round-trip merge endpoint exists; `packages/realtime` is not present; legal filings, domains, and GitHub org creation remain founder-owned.
