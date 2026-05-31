<!-- SPDX-License-Identifier: Apache-2.0 -->

# Greybox Specialized Agent System

This is the operating contract for multi-agent Greybox work. Agents are not generic coders. Each agent gets the acquisition goal, the repo map, the active valuation lever, and a narrow write boundary before it starts.

## Mission Frame

Greybox wins by becoming the AI design layer that ships game artifacts into Unity first, then Unreal and Godot. The highest-leverage order is:

1. Unity plugin moat: import, round-trip sync, MCP bridge, Asset Store proof.
2. Cloud margin layer: managed inference, metered billing, durable enterprise controls.
3. Pro modules: encrypted closed-source payloads with durable entitlements.
4. Marketplace: Stripe Connect, creator payouts, replay-safe commerce evidence.
5. Realtime collaboration: Yjs multiplayer design workflows that justify Studio seats.
6. Enterprise/compliance: SSO, SCIM, audit export, on-prem, data residency evidence.
7. Playtest loop: autonomous persona QA after the core revenue engine is real.

## Agent Roster

| Agent | Owns | Repo scope | Never touches | Required validation |
| --- | --- | --- | --- | --- |
| Unity Moat | importer depth, HUD/level/art-bible realization, MCP bridge, round-trip fields | `greybox-unity-plugin/` | open-core daemon internals unless explicitly assigned | `Validation~/*.test.mjs`, asset metadata, smoke, C# edit-mode tests when Unity is available |
| Cloud Margin | inference routing, usage metering, billing ledger, tenant enforcement | `greybox-cloud/` | marketplace payout state | focused `node --import tsx --test ...`, `pnpm typecheck` |
| Marketplace Trust | Checkout, Connect, tax, reserve, refund/dispute replay evidence | `greybox-marketplace/` | Pro encrypted payload bodies | webhook/rehearsal tests, `pnpm typecheck` |
| Realtime Studio | Yjs relay, awareness, locks, comments, persistence | `open-design/packages/realtime/` | `apps/web` or `apps/daemon` private `src/` unless scoped | package test, package typecheck, 1000-edit reconciliation |
| Pro Catalog | `.gbpro` envelope, entitlements, module authoring pipeline | `greybox-pro/` and assigned cloud entitlement APIs | Apache open core payload material | bundle release tests, license/activation tests |
| Enterprise Gate | SSO, SCIM, audit logs, on-prem readiness, data residency | `greybox-cloud/`, docs/templates | marketing claims without enforcement evidence | auth/SCIM/audit tests plus readiness proof |
| QA Integrator | reviews worker diffs, checks boundaries, stages only intended files | all repos read-only except report docs | feature implementation | path-limited `git diff --check`, package gates, weekly report word count |

## Parallel Work Model

Use three agent classes, in this order:

| Class | Purpose | Write access | Output |
| --- | --- | --- | --- |
| Scout | Read the repo, verify current facts, cite primary docs, pick the highest-leverage safe slice | none | recommendation, exact files, acceptance tests |
| Worker | Implement one approved slice inside one repo or file family | declared write set only | patch, tests, residual risks |
| Integrator | Review, validate, stage, commit, and report | path-limited final files only | commit plus weekly report |

Workers are launched only after a scout identifies a bounded slice or the integrator already has equivalent local evidence. Multiple workers may run together only when their write sets are disjoint, for example `greybox-unity-plugin/` and `greybox-marketplace/`. If two slices need the same file family, one waits.

## Launch Checklist

Every agent prompt must include:

- The $200M-$500M acquisition goal and the specific valuation lever for this slice.
- The exact repo root, relevant `AGENTS.md` boundaries, and the owned write set.
- The non-overlap rule: no touching files owned by another live agent.
- The current codebase fact that motivates the slice, not a generic product wish.
- Primary-source research links required before implementation in volatile areas.
- The focused test/typecheck commands and the real-editor or credential gaps that remain blocked.
- A final handoff format with changed files, validations, residual risks, and next smallest safe step.

## Research Contract

Before planning in a volatile integration area, the agent must cite primary docs in its handoff. Baseline sources:

- Unity package and dependency behavior: [Unity project manifest](https://docs.unity.cn/2023.1/Documentation/Manual/upm-manifestPrj.html).
- Stripe idempotency and duplicate webhooks: [Idempotent requests](https://docs.stripe.com/api/idempotent_requests?api-version=2024-06-20), [Handle duplicate events](https://docs.stripe.com/webhooks#handle-duplicate-events).
- Yjs collaboration transport: [y-websocket](https://docs.yjs.dev/ecosystem/connection-provider/y-websocket), [Awareness & Presence](https://docs.yjs.dev/getting-started/adding-awareness).
- WorkOS enterprise identity: [Directory Sync](https://workos.com/docs/directory-sync).
- MCP tool safety: [MCP tools specification](https://modelcontextprotocol.io/specification/2025-03-26/server/tools).

The agent may use secondary sources only to discover context. Implementation decisions must trace back to codebase facts or primary docs.

## No-Break Rules

- Read the relevant `AGENTS.md` before touching a repo or directory. For `open-design`, re-read the root file and the nearest directory file.
- Declare a write set before editing. Two agents must not write the same file family at the same time.
- Preserve the open-core split. Proprietary code never lands under `open-design/apps/` or `open-design/packages/`.
- Respect `open-design` boundaries: `apps/web` does not import `apps/daemon/src`; `packages/contracts` stays pure TypeScript; sidecar stamps stay five-field.
- Use existing local patterns before adding abstractions.
- Add tests for any behavior that affects money, licenses, engine import, sync, auth, or persisted data.
- Do not stage broad dirty worktrees. Use path-limited `git status`, `git diff`, `git add`, and commit only reviewed files.
- Agents do not merge themselves. The main thread reviews, validates, commits, and reports.

## Handoff Format

Each agent returns:

1. Goal and valuation lever.
2. Files read and files changed.
3. Primary research links used.
4. Implementation summary.
5. Validation commands and exact pass/fail counts.
6. Known residual risks and the next smallest safe step.

## Integration Gate

The main thread accepts an agent patch only after:

1. Boundary review passes.
2. Focused tests and typecheck pass.
3. `git diff --check` passes for the staged files.
4. Commit excludes unrelated dirt and generated artifacts unless intentionally requested.
5. Weekly report is updated in `docs/build-status/week-NN.md` with a <=300-word status delta.
