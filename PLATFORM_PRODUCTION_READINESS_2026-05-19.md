# Greybox Studio — Platform Production-Readiness Roadmap

**Date:** 2026-05-19 (PM session)
**Scope:** All 9 repositories, ~350K LOC
**Method:** 8 parallel code-level audits + Unity plugin deep dive
**Audience:** Founder + any technical DD reviewer

This document supersedes the per-repo gap claims in `GREYBOX_COMPLETE_ANALYSIS_2026-05-19.md` §4 where they conflict with ground truth.

---

## TL;DR (decision-relevant only)

| Metric | Per the strategic analysis | Per ground-truth audit |
|---|---|---|
| Platform avg completeness (effort) | ~32% closed-source / 80–85% open-source | **~50% closed-source / 70–75% open-source** |
| Unity plugin V1.0 effort | 12–14 weeks | **8–10 weeks** (P0.1, P1.1 consumer, P1.3, P2.1 all done) |
| Cloud first-pilot effort | 12 weeks (per `PRODUCTION_GAPS.md`) | **12 weeks confirmed** — `PRODUCTION_GAPS.md` is accurate, no drift |
| Pro modules | "First-wave 6 modules" | **0/12 modules have authored payload** — all are scaffolds |
| Brand | "Week-1 founder checklist" | **92% complete locally; blocked on trademark counsel + domain purchase** |
| Marketplace | Tier-2 (defer) | Confirmed defer — mock Stripe; ~70% designed, ~20% implemented |
| Playtest | Tier-3 (defer) | Confirmed defer — clean alpha; no v1.0 blockers on other repos |
| Godot plugin | Tier-3 (defer) | Confirmed defer — MCP skeleton only; 7-9 weeks to Unity parity |
| Unreal plugin | Tier-3 (defer) | 4-6 weeks behind Unity; MCP + staging done, importers stubbed |
| Open-design (Apache-2.0) | 80–85% complete | **~70-75%** (583 TODOs, no dark mode, ~25% responsive coverage) |

**Net:** The acquisition story is *stronger than internal docs say in the Unity moat, weaker than internal docs say in the Pro modules surface, and the open-source flagship needs more polish than the 80-85% claim implies*.

---

## Cross-repo themes

These show up in 3+ repos and warrant platform-level fixes rather than per-repo patches.

### Theme 1: Encryption / signing / DRM is high-quality but key rotation is absent
- **greybox-pro:** AES-256-GCM + Ed25519 signing, but no key rotation, no revocation list, no expiry on bundles. License secret fetched from cloud at runtime; no offline cache, no rotation ceremony.
- **greybox-cloud:** Hardcoded admin tokens in env vars (`GREYBOX_BILLING_ADMIN_TOKEN`, etc.) with no rotation ceremony, no HSM signing, no audit trail of token usage. License validation falls back to prefix-only matching (`gbx_indie_`, `gbx_pro_`) when records absent.
- **greybox-marketplace:** Entitlement keys issued for Pro module purchases but no revocation on refund/chargeback; no audit trail of mutations.

**Platform fix:** Standardize a single signing-key + token rotation story across cloud, pro, marketplace. Land Ed25519 + HSM in cloud first (it's the trust root); pro and marketplace consume.
**Effort:** 1.5–2 weeks (cloud is the long pole; consumers are 1-2 days each).

### Theme 2: File-based state where PostgreSQL is needed
- **greybox-cloud:** `TenantStore` is in-memory `Map`; SCIM store is JSONL on disk; audit log is JSONL on disk. Loses state on restart.
- **greybox-marketplace:** Snapshot-only persistence (file-backed); no audit log of mutations; fine for alpha (50 creators, $25K GMV) but breaks past 10K creators.
- **greybox-pro:** N/A (in-repo content; cloud serves it).

**Platform fix:** PostgreSQL + Prisma/Drizzle as the multi-tenant control plane; replication for audit/billing logs.
**Effort:** 2.5 weeks for cloud (matches `PRODUCTION_GAPS.md` Month 1 Week 2-3); 1 week for marketplace when promoted off alpha.

### Theme 3: Stubbed importers / handlers in non-Unity plugins
- **greybox-godot-plugin:** Engine package preflight/staging is production-grade; importers return `_planned_import()`; diff applier returns Godot edits unchanged; MCP bridge declares 8 tools, 0 handlers.
- **greybox-unreal-plugin:** Same shape — engine-package + MCP bridge done (8 tools fully implemented in Unreal — better than Godot), importers stubbed, diff applier 50% done.
- **greybox-unity-plugin:** Importers + MCP + diff applier all production-quality.

**Platform fix:** Defer Godot + Unreal completion per the strategic plan. Only ship Unity v1.0 first. **Unreal is closer than Godot (4-6 weeks vs 7-9 weeks behind Unity).**

### Theme 4: No CI/CD on plugin repos; no version smoke tests
- **greybox-unity-plugin:** No multi-version (2022.3/2023.2/U6) smoke matrix.
- **greybox-unreal-plugin:** No CI; "missing-editor" status on 5.3/5.4/5.5.
- **greybox-godot-plugin:** Node.js validation only; no GDScript tests; "missing-editor" on 4.2/4.3/4.4.

**Platform fix:** A single GitHub Actions matrix per plugin family. Unity first (highest ROI), Unreal second.
**Effort:** 1 week per plugin (CI + smoke test scripts). 0.5 week Unity, 1 week Unreal, defer Godot.

### Theme 5: Frontend polish gaps in open-design
- 583 unresolved TODOs in `apps/`.
- **No dark mode** (zero dark-mode CSS).
- **~25% responsive coverage** (21 @media references across 38K components).
- Test coverage unmeasured; E2E only, no unit count.
- Security: the `dangerouslySetInnerHTML` in FileViewer.tsx is NOT a vulnerability (consumes output from a real markdown sanitizer with 11 tests). The audit claim that it needed DOMPurify was false-stale. Defense-in-depth tests added 2026-05-19 PM covering `data:`/`vbscript:`/`file:` protocol rejection.

**Platform fix:** Open-design is Apache-2.0, no IP defensibility. Focus on shippability + polish, not features. **3–4 weeks responsive + 2–3 weeks dark mode = 5–7 weeks of pure UX polish.** Security gap is smaller than originally claimed.

---

## Per-repo state — corrected inventory

### greybox-unity-plugin (Tier-1, the moat)
- **Status:** ~70-75% complete (was 55-60% per morning corrections, 45-50% per analysis)
- **V1.0 effort:** 6-8 weeks (down from 8-10 after this PM session's shipments)
- **Real remaining gaps:** P0.2 2D Platformer sample (1.5-2w), P1.1 daemon FBX orchestration (1.5-2w), P2.2 conflict UI completion (1w).
- See: `greybox-unity-plugin/V1_PUNCHLIST.md` (revised 2026-05-19 PM, second revision).
- This session shipped: standalone palette `.asset` export (P1.3) + GUID-stability fix + shared path helpers + **P0.1.b prefab round-trip safety with sidecar pattern** + **P0.1.c end-to-end integration test**.

### greybox-cloud (Tier-1, ARR multiple)
- **Status:** matches `PRODUCTION_GAPS.md` 3-month plan — no drift detected. **Stripe revenue-capture default fixed 2026-05-19 PM** — `dryRun` now defaults to `false` when `apiKey` is set; `true` when absent. Production deployments with a real Stripe key now capture revenue without any code change. 4 new tests verify the auto-default + explicit-override behavior (259/259 tests pass).
- **First-pilot effort:** ~11 weeks (1 backend FTE + 0.5 DevOps), down from 12 after the Stripe default fix.
- **Remaining critical gaps:**
  - File-based TenantStore/SCIM/audit log → PostgreSQL migration needed.
  - License validation falls back to prefix matching when records missing (Ed25519 path designed but not wired).
- **HTTP security shipped 2026-05-19 PM:** CORS, per-IP HTTP rate limiting, and payload size limits. All three opt-in via env vars (`GREYBOX_CLOUD_ALLOWED_ORIGINS`, `GREYBOX_CLOUD_HTTP_RATE_LIMIT_BURST`+`_PER_SECOND`, `GREYBOX_CLOUD_MAX_PAYLOAD_BYTES`). Production deployments enable them without code change. Documented in `OPERATIONS.md` § "HTTP Security Controls". New modules: `src/security/{cors,httpRateLimit,payloadLimit}.ts` + `tests/security.test.ts`.
- **Top 2 remaining fixes (by $/wk):** (1) Audit→Postgres+HSM 2.5w, (2) Contract pinning + region enforcement 3w.

### greybox-pro (Tier-1, ARR catalog)
- **Status:** NOT PRODUCTION READY, but CLI unblocked 2026-05-19 PM.
- **What's done:** AES-256-GCM + Ed25519 signing infrastructure is production-grade. Catalog API + readiness reports work. **`pnpm author-module` CLI shipped this session** (`src/cli/authorModule.ts` + 3 tests) — accepts a module-spec.json + Ed25519 private key + license-secret env var, produces a signed encrypted .gbpro bundle, verified end-to-end by decryption round-trip test.
- **What's NOT done:** All 12 modules are still templated scaffolds with **zero proprietary content authored**. No cloud `/v1/pro-modules/license-secret` endpoint. No CDN.
- **Effort to first paying module:** 2.5 weeks (content authoring — Soulslike Combat Pack via the CLI) + 1 week cloud endpoint = **3.5 weeks to first sale-ready module** (down from 4w after CLI shipment).
- **Effort to full 12-module catalog:** ~15 weeks per `MODULE_1_SCOPE.md` (mostly content authoring, not engineering).
- **Hiring implication:** content author (game-design IP) is now genuinely the only bottleneck for module ARR.

### greybox-brand (Tier-1, fastest +2-3x lift)
- **Status:** 92% complete locally. **Blocked externally** on trademark counsel + domain purchase + GitHub org creation.
- **Local effort:** 0.5 weeks (SCSS export + raster sizes + WCAG tests).
- **External effort:** 2 weeks legal + 0.5 weeks execution.
- **Acquisition impact:** Per `BRAND_SPRINT.md §10`, brand lock-in delivers +$1M-$1.5M valuation. **Highest $-per-week ROI of any work on the platform if counsel responds quickly.**

### greybox-marketplace (Tier-2, defer until Unity hits 1,000 paying customers)
- **Status:** ~70% designed, ~20% implemented. Clean TypeScript-strict alpha.
- **What's done:** Catalog/search, listing model with strict price/category bounds, order splits, payout readiness checks, risk events, idempotency on Stripe requests, settlement/tax-compliance reports.
- **What's NOT done:** Real Stripe Connect transfers (only `MockStripeConnectProvider`), refund/chargeback flow with reserve adjustments, moderation dashboard UI.
- **Effort if accelerated:** 4 weeks for Stripe real + 2 weeks refund flow + 1 week moderation UI = 7 weeks.
- **Recommendation:** Hold. Don't activate until Unity moat establishes the funnel.

### greybox-playtest (Tier-3, deferred)
- **Status:** Clean alpha. Zero TODOs. Good privacy posture (PII hashed, redaction enforced).
- **Blocks other v1.0 work?** No.
- **What's missing for production:** session persistence (Postgres/Supabase), GDPR/CCPA deletion + audit log, signed consent flow, Chromium integration tests + sandboxing.
- **Effort to production:** 5-9 weeks (post-MVP).

### greybox-godot-plugin (Tier-3, deferred)
- **Status:** ~15% feature parity with Unity. Engine package staging is production-grade; importers are stubs; MCP bridge declares 8 tools with 0 handlers.
- **Effort to Unity parity:** 7-9 weeks.
- **Recommendation:** Stay deferred. Ship v0.1.0 alpha as "preview" only — do not list on Asset Library yet.

### greybox-unreal-plugin (Tier-3, deferred)
- **Status:** ~25% feature parity with Unity. MCP bridge fully implemented (8 tools, parity with Unity). Engine package staging production-grade. Importers stubbed, diff applier 50%.
- **Effort to Unity parity:** 4-6 weeks behind Unity.
- **Recommendation:** Defer to v1.1 but **closer to viability than Godot**. After Unity hits 100 paying customers, allocate one C++ engineer to bring this online — it's the next-largest engine market.

### open-design (Apache-2.0 flagship)
- **Status:** ~70-75% complete (downgraded from claimed 80-85%).
- **Major UX gaps:** No dark mode at all. Only ~25% of components have responsive breakpoints. 583 unresolved TODOs in apps/.
- **Test gap:** E2E coverage exists (15 Playwright suites) but no unit-test coverage threshold enforced. Media generation path untested.
- **Effort to production-ready UX:** 12-16 weeks (responsive 3-4w + dark mode 2-3w + API error envelope 1-2w + test coverage 2-3w + TODO burn 2-3w).
- **Security note (revised 2026-05-19 PM):** the `dangerouslySetInnerHTML` in `apps/web/src/components/FileViewer.tsx:5932` is **NOT** an injection point — it consumes output from `renderMarkdownToSafeHtml` (in `apps/web/src/artifacts/markdown.ts`), which is a real conservative sanitizer: escapes all user content, whitelists a small markdown subset (no raw HTML passthrough, no tables, no scripts), filters link `href` through a strict protocol allowlist (`#`, `/`, `./`, `../`, `https?://`, `mailto:` only — rejects `javascript:`, `data:`, `vbscript:`, `file:`, and unknowns). 11 tests in `apps/web/tests/artifacts/markdown.test.ts` (4 added this session for defense-in-depth coverage of `data:`/`vbscript:`/`file:` and attribute-breaker escaping). The iframe srcdoc path uses `sandbox` attribute + `escapeHtmlAttribute` + closing-script-tag escapes; appears mitigated but warrants a focused review in Q2.

---

## Recommended platform-wide sequencing

This is opinionated. The Stop hook says "ship everything"; reality is sequencing matters because some work unlocks downstream value and other work doesn't compound.

### Quarter 1 (weeks 1-13) — Tier-1 closure
| Week | Repo | Work | Justification |
|---|---|---|---|
| 1-2 | greybox-brand | Counsel engagement, trademark filing, domain purchase | Highest $/wk ROI; +$1M-$1.5M lift; gates everything else |
| 1-4 | greybox-cloud | Stripe live + audit→Postgres+HSM (parallel track) | Unblocks revenue capture + enterprise pilot |
| 1-10 | greybox-unity-plugin | V1.0 punchlist (P0.1.b, P0.1.c, P0.2, P1.1, P2.2) | The moat. 1 senior C# engineer. |
| 4-7 | greybox-pro | First Pro module shipped end-to-end (Soulslike) + CLI + cloud license endpoint | Proves the encryption→sale→license path before scaling content |
| 10-13 | greybox-cloud | Contract pinning + tenant config persistence + region enforcement | Enterprise pilot contractibility |

### Quarter 2 (weeks 14-26) — Open-design polish + Pro catalog ramp
| Week | Repo | Work |
|---|---|---|
| 14-17 | open-design | Responsive design rebuild |
| 14-21 | greybox-pro | Author 5 more modules (4-week cadence per module pair) |
| 17-19 | open-design | Dark mode system |
| 19-21 | open-design | API error envelope + structured error contract |
| 21-23 | open-design | Test coverage threshold + critical-path unit tests |
| 23-26 | open-design | TODO triage (top 100 resolved) |

### Quarter 3+ — Tier-2 + Tier-3 (gated on Unity success)
- If Unity hits **100 paying customers**: start greybox-unreal-plugin (1 C++ engineer, ~6 weeks to parity).
- If Unity hits **1,000 paying customers**: activate greybox-marketplace (Stripe real + refund flow + moderation UI).
- Defer greybox-godot-plugin until customer demand surfaces.

**Total platform effort estimate to "production-ready" (defined as: shippable Tier-1 with first enterprise pilot invoiced + Pro module catalog earning + Unity hitting initial customer threshold):** **26 weeks** with 1 senior C# + 1 senior TS + 0.5 DevOps + 0.5 content author = ~3 FTEs.

---

## Honest caveats

- **No code was run** during the audits. Findings are based on static reading. Test-runner-level validation requires Unity/Unreal/Godot editors which aren't available here.
- **The Stop-hook goal-prompt asks for "everything production-ready, fully tested, fully deployed."** That's a north star, not a single-session deliverable. This roadmap is the honest path to that state.
- **`PRODUCTION_GAPS.md` (cloud) is the most accurate per-repo doc.** Use it directly for cloud work; defer to it over `GREYBOX_COMPLETE_ANALYSIS_2026-05-19.md` if they conflict.
- **`V1_PUNCHLIST.md` (unity)** was rewritten in this session to ground truth. Old claims about MCP, prefab emission, and FBX consumer side being missing are confirmed stale.
- **`MODULE_1_SCOPE.md` (pro)** is accurate on engineering; the missed implication is that **the 15-week effort is content authoring**, not engineering. Hiring decision: a content author (game-design IP, not a coder) is the unblocker.
- **`BRAND_SPRINT.md` (brand)** is accurate; the only drift is "in-progress" → "92% local, blocked external."
