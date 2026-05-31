# Greybox Studio - Verified Implementation Plan

**Date:** 2026-05-21  
**Workspace:** `/Users/soumyadebnath16/Developer/game desine`  
**Purpose:** Turn the Sale-Now vs. Enhance-Then-Sell memo into a current, evidence-backed founder decision and 90-day execution plan.  
**Decision posture:** Do not sell as-is unless the founder is unwilling to commit to the next 18-24 months.

---

## 0. Bottom Line

The memo's central asymmetry still holds: selling now is likely an asset/acqui-hire process, while a focused 90-day push can move Greybox into a meaningfully higher valuation band. The reason is still the same: legal ownership + Unity distribution + first revenue + Pro attach + credible telemetry changes the buyer frame from "interesting codebase" to "early commercial category position."

However, the current worktree is materially ahead of the memo in several places:

- Pro is no longer "zero content." All 12 Pro modules are `alpha-ready` in code, with authored closed-core content and 47 passing tests.
- Unity conflict UI is no longer merely partial. `GreyboxConflictWindow.cs` includes Accept Web/Unity/Manual merge actions and manual draft editing.
- Unity CI matrix exists. `.github/workflows/unity-validation.yml` includes GameCI smoke jobs for 2022.3, 2023.2, and Unity 6, gated by `UNITY_LICENSE`.
- Daemon-side Unity package FBX/material import is implemented in the existing `/api/projects/:id/unity-package` flow, not the memo's proposed `/fbx-export` endpoint.
- Cloud is further along than `LAUNCH_STATUS.md`: 402 tests pass, with Postgres stores for tenant snapshots, audit log, SCIM, billing ledger, licenses, privacy requests, incidents, legal holds, model-training consent, and more.
- Marketplace is further along than the memo: 93 tests pass plus 2 Stripe-testmode skips, with refund and dispute webhook coverage.

The remaining blockers are therefore more operational than raw implementation:

1. Legal/brand is still not done: trademark, domains, C-corp, org rename.
2. No revenue path is visible in the open-design web UI: Stripe server endpoints exist, but there is no dashboard Subscribe/Indie button.
3. Unity is not submission-complete: validation passes dry-run/static gates, but the package is still prerelease, real Unity editor smoke was not executed locally, and Verified Solution evidence is intentionally blocked until stable version, customer references, and support evidence exist.
4. Open-design test health is not green on the current Node 25 runtime: daemon is 1856/1857 passing, web is 909/921 passing, packaged is 107/107 passing, and workspace typecheck fails in packaged test config. The repo declares `node: "~24"` while several sibling repos have already widened to `>=24 <27`.
5. Telemetry adapters exist, but the actual optional SDK packages are not present in the open-design app package manifests.

---

## 1. Current Codebase Verification

### 1.1 LOC Snapshot

Method: `rg --files`, excluding `node_modules`, `dist`, `.pnpm-store`, `.git`, `coverage`, and `.next`.

| Repo | Files counted | Current LOC | Notes |
|---|---:|---:|---|
| `open-design` | 707 | 272,905 | TS/TSX/JS/JSX only. The repo has a very dirty worktree, so treat exact LOC as directional. |
| `greybox-unity-plugin` | 86 | 13,200 | C# only. Matches the sale memo's ~13K claim. |
| `greybox-cloud` | 154 | 42,466 | TS/TSX/JS including tests. Current test count exceeds memo. |
| `greybox-marketplace` | 22 | 12,113 | TS/TSX/JS including tests. Current code exceeds older audit counts. |
| `greybox-pro` | 21 | 5,191 | TS/TSX/JS including tests. Matches memo. |
| `greybox-playtest` | 21 | 4,372 | TS/TSX/JS including tests. Matches memo. |
| `greybox-brand` | 20 | 794 | Tokens/logo/docs only. |
| `greybox-unreal-plugin` | 22 | 2,024 | C++/headers/manifest. More than skeleton, still far behind Unity. |
| `greybox-godot-plugin` | 11 | 964 | GDScript/resources. More than skeleton, still far behind Unity. |

### 1.2 Test Verification Run

Commands were run on 2026-05-21 with Node `v25.9.0`.

| Surface | Command | Result |
|---|---|---|
| `greybox-cloud` | `pnpm test` | 402 passing, 0 failing |
| `greybox-marketplace` | `pnpm test` | 93 passing, 2 Stripe-testmode skips, 0 failing |
| `greybox-pro` | `pnpm test` | 47 passing, 0 failing |
| `greybox-playtest` | `pnpm test` | 25 passing, 0 failing |
| `greybox-unity-plugin` | Node validation scripts | 75 passing Node validation tests; metadata/submission/readiness dry-run gates pass |
| `open-design` packaged | `pnpm --filter @ai-game-design-studio/packaged test` | 107 passing, 0 failing |
| `open-design` daemon | `pnpm --filter @ai-game-design-studio/daemon test` | 1856 passing, 1 failing realtime latency assertion |
| `open-design` web | `pnpm --filter @ai-game-design-studio/web test` | 909 passing, 12 failing |
| `open-design` workspace | `pnpm typecheck` | Fails in packaged typecheck: desktop telemetry test imports a file outside packaged `rootDir` |

Open-design failures are important DD risk, not fatal launch blockers. They should be fixed before using any "all tests green" claim in investor or buyer materials.

---

## 2. Gate Corrections vs. Existing Docs

`LAUNCH_STATUS.md` is now stale in several places. Current source and test evidence supports these corrections:

| Gate | Old status | Current verified status | Evidence |
|---|---|---|---|
| G1-G4 legal/brand/corp | Not started | Still not started | No local evidence can prove external legal work. |
| G5 round-trip safety | Done | Done | `Editor/Generation/PrefabAssetExporter.cs` sidecar pattern. |
| G6 integration test | Done | Done | Unity validation accepts round-trip and prefab safety tests. |
| G7 2D Platformer sample | Partial | Mostly done; needs real Unity walkthrough | `Samples~/2D Platformer/*`; validation accepts playable sample surface. |
| G8 daemon FBX orchestration | Not started | Implemented in package route; real Unity smoke still missing | `open-design/apps/daemon/src/unity-package-builder.ts` rewrites local/remote mesh/material refs; tests cover FBX and material import. |
| G9 conflict UI | Partial | Code-complete for value conflicts; needs real editor QA | `GreyboxConflictWindow.cs` has Accept Web, Accept Unity, Accept Manual, and draft editor. |
| G10 Unity CI matrix | Partial | Workflow present; execution depends on Unity license secrets | `.github/workflows/unity-validation.yml` GameCI matrix for 2022.3, 2023.2, Unity 6. |
| G12 Stripe Checkout web E2E | Partial | Still partial | Cloud endpoints pass; open-design web has no visible checkout/Subscribe UI. |
| G13 Cloud Postgres migration | Not started | Code substantially started; production cutover not proven | Multiple Postgres stores and `/readyz` coverage pass cloud tests. |
| G26 Pro module #1 | Not started | Superseded: all 12 modules alpha-ready in code | `greybox-pro/src/catalog/modules.ts`; catalog/release tests pass. |
| G27 Pro license-secret endpoint | Done | Done | `/v1/pro-modules/license-secret` tests pass. |
| G29 Pro CDN/R2 | Not started | Signed CDN URL route implemented; actual bucket/env not proven | Cloud route uses `GREYBOX_PRO_MODULE_CDN_BASE_URL`; tests use mock CDN base URL. |
| G30 light theme | Done | Done | `[data-theme="light"]` in `apps/web/src/index.css`. |
| G31 responsive top-20 | Not started | Still not proven | 54 `@media` hits exist, but no component-level responsive proof. |
| G34 Sentry + PostHog | Done in adapter sense only | Adapters present; SDK package install still missing | Dynamic imports in web/daemon/desktop, but app package manifests do not include `@sentry/browser`, `posthog-js`, `@sentry/node`, or `@sentry/electron`. |

---

## 3. Market Validation

### 3.1 Multiples

The valuation staircase should use a conservative 2026 market frame:

| Claim | Current validation |
|---|---|
| Private SaaS M&A median around 3.1x-3.4x | Supported by Aventis. Their 2026 SaaS multiples page reports 3.4x median EV/revenue as of March 2026; their M&A advisor landscape article reports 3.1x in early 2026. |
| Public cloud/SaaS higher than private | Directionally supported by BVP Cloud Index, which tracks revenue multiple/growth/FCF metrics for public cloud constituents. Use it as a public-market temperature check, not a private M&A price. |
| AI-positioned high-growth SaaS can justify 6x-10x+ | Reasonable, but only with growth, retention, and differentiation. Do not present this as automatic. |
| Smartsheet at 12x | Not supported by public numbers. Blackstone/Vista bought Smartsheet for ~$8.4B; Smartsheet reported ~$1.133B ARR in Q3 FY2025, implying roughly 7.4x ARR, not 12x. |
| Tier 3 40x-100x ARR | Treat as speculative. A defensible external pitch should use 20x-60x only if $5M ARR, 120%+ NRR, 60%+ growth, and a strategic auction are real. |

Sources:

- Aventis SaaS valuation multiples: https://aventis-advisors.com/saas-valuation-multiples/
- Aventis software M&A advisor landscape 2026: https://aventis-advisors.com/the-software-ma-advisor-landscape-in-2026/
- BVP Nasdaq Emerging Cloud Index: https://cloudindex.bvp.com/explore-index
- Smartsheet acquisition completion: https://www.businesswire.com/news/home/20250121169669/en/Blackstone-and-Vista-Equity-Partners-Complete-Acquisition-of-Smartsheet
- Smartsheet Q3 FY2025 ARR: https://www.businesswire.com/news/home/20241205301940/en/Smartsheet-Inc.-Announces-Third-Quarter-Fiscal-Year-2025-Results

### 3.2 Competitors

| Competitor | Current take |
|---|---|
| Unity AI / Unity MCP | Public discussion strongly indicates Unity AI Assistant/MCP activity in 2026, including local MCP server discussions and paid-access controversy. I did not find a clean official Unity docs page in the quick source pass, so phrase this as "public evidence indicates," not as a hard official-doc claim unless counsel/BD verifies. |
| Roblox | Confirmed strategic pressure. Bloomberg reported on 2026-05-01 that Roblox is launching AI-powered development software to challenge Unity/Unreal; TechCrunch covered agentic Roblox Studio tools on 2026-04-16. |
| Ludo AI | Confirmed acquired by Xsolla on 2025-05-08. Removed as independent competitor. |
| Inworld AI | Confirmed as different vertical. Inworld currently positions itself as realtime voice AI; GamesBeat reported a $500M+ valuation in 2023, and Inworld says it has raised $125M+. |
| Rosebud AI | Still a relevant no-code/game-creation competitor. Public high-quality funding source found: Forbes says $9.9M total raised. The memo's $18M-$20M number appears in less authoritative sources and should be treated as unverified. |
| Promethean AI / Sony | The memo's Sony-Promethean acquisition comparable could not be cleanly verified from primary public sources in this pass. Use it as a plausible analogy only if a banker can validate privately. |

Sources:

- Bloomberg Roblox article: https://www.bloomberg.com/news/articles/2026-05-01/roblox-to-challenge-unity-unreal-engines-with-new-ai-software
- TechCrunch Roblox agentic tools: https://techcrunch.com/2026/04/16/robloxs-ai-assistant-gets-new-agentic-tools-to-plan-build-and-test-games/
- Xsolla Ludo acquisition: https://xsolla.com/newsroom/xsolla-acquires-ludo-to-advance-player-engagement-and-monetization
- Inworld current positioning: https://inworld.ai/resources/what-is-inworld-ai
- Inworld $500M valuation report: https://gamesbeat.com/inworld-ai-raises-new-round-at-500m-valuation-for-ai-game-characters
- Rosebud AI Forbes profile: https://www.forbes.com/companies/rosebud-ai/
- Heavybit acqui-hire context: https://www.heavybit.com/library/article/the-acqui-hire-is-no-longer-a-distress-sale

---

## 4. Decision Framework

### Path A - Sell Now

Expected outcome: $400K-$1.5M cash, possibly $2M-$5M headline with earnout/retention if a strategic acquirer values the founder plus Unity/MCP work.

Use this path only if:

- The founder is not willing to spend 18-24 months on Greybox.
- The founder cannot tolerate a 90-day focused push.
- There is a warm strategic buyer path now.

Major weakness: no trademark, no revenue, no validated customer pull. Buyers will price as team + code, not SaaS.

### Path B - Tier 0 Then Sell

Expected outcome: $1M-$4M floor if legal ownership is cleaned up and the sale process is run deliberately.

Do this if the founder wants optionality but is not ready to fund Tier 1.

Must close:

- Trademark search and filing.
- Domains.
- Delaware C-corp.
- GitHub/org/brand ownership cleanup.
- Counsel-reviewed Privacy/ToS/DPA.

### Path C - 90-Day Tier 1 Push

Expected outcome: $5M-$25M if the company can show public beta, first revenue, Unity distribution progress, working Pro attach, and credible telemetry.

This remains the recommended path if the founder can access $150K-$300K and hire or contract the right people quickly.

The current worktree makes Path C more plausible than the original memo suggested, because the remaining work is concentrated in legal, productization, evidence, and GTM.

---

## 5. Updated 90-Day Plan

### The Five Highest-ROI Workstreams

#### 1. Legal and Brand Ownership

Owner: Founder + counsel  
Timing: Week 1-4  
Budget: $7K-$13K

Tasks:

- Run trademark search for Greybox in classes 9, 41, 42.
- Pre-screen fallback names: Greyfield Studio, Cantrip, Frame Zero, Loom Studio.
- File trademark if clear.
- Buy primary and defensive domains.
- Form or confirm Delaware C-corp.
- Rename GitHub org once naming risk is resolved.
- Counsel-review `PRIVACY.md`, `TERMS.md`, and DPA.

Why it matters: this is the difference between selling code and selling an ownable company.

#### 2. Unity Submission Evidence, Not More Internal Narrative

Owner: Senior C# + DevOps  
Timing: Week 1-6  
Budget: 4-6 focused engineer-weeks

Current status:

- Static validation passes.
- Unity Node validation suite passes 75/75.
- Asset Store metadata gate passes with prerelease warning.
- Submission/Verified Solution packets pass but explicitly warn that final submission is blocked.
- GameCI matrix exists but requires Unity credentials.
- Real Unity editor smoke was not run locally; dry-run says editors are missing.

Tasks:

- Cut a stable package version.
- Run real Unity EditMode smoke on 2022.3, 2023.2, and Unity 6.
- Package `.unitypackage` and UPM tarball from a stable tag.
- Run full import walkthrough for the 2D Platformer sample.
- Record the tutorial/demo.
- Submit Asset Store listing first; Verified Solution can follow when customer/support evidence exists.

Reframed blocker: Unity v1.0 is less "write missing code" and more "prove it in real editors, stable version it, and submit it."

#### 3. Stripe Checkout UI and First Revenue

Owner: Senior TS  
Timing: Week 1  
Budget: 0.5-1 day

Current status:

- Cloud checkout and portal endpoints pass tests.
- Web app search found no `checkout-session`, `portal-session`, `Subscribe`, `Indie`, or billing UI beyond unrelated SSE "Subscribe" wording.

Tasks:

- Add a minimal creator-facing billing panel in open-design web.
- POST to `/v1/billing/checkout-session`.
- Redirect to returned Stripe URL.
- Add portal-session action for account management.
- Capture one real testmode E2E and one production dry-run checklist.

Why it matters: first dollar changes buyer psychology more than almost any remaining code task.

#### 4. Pro Module Release Train and CDN Productionization

Owner: Content author + Senior TS + DevOps  
Timing: Week 1-4  
Budget: 2-4 weeks

Current status:

- All 12 modules are alpha-ready in code.
- Release/bundle CLI tests pass.
- Cloud license-secret and signed CDN URL routes pass tests.
- Actual R2/S3 bucket/env configuration is not proven.

Tasks:

- Pick the first five SKUs for launch: Soulslike Combat, Hero Shooter, Cozy Sim, Hyper-Casual, Live-Ops.
- Run `release-bundles` with production signing keys.
- Configure R2/S3 bucket and `GREYBOX_PRO_MODULE_CDN_BASE_URL`.
- Validate real signed download URL from staging.
- Mount one paid bundle end-to-end in open-design daemon.

Reframed blocker: do not spend three weeks "authoring from zero." Spend it polishing content quality, packaging, CDN, and entitlement flow.

#### 5. Telemetry, Open-Design Health, and Buyer-DD Hygiene

Owner: Senior TS  
Timing: Week 1-5  
Budget: 3-5 weeks

Current status:

- Web, daemon, and Electron telemetry adapters exist.
- SDK packages are absent from app package manifests.
- Open-design tests are not green on Node 25.
- Workspace typecheck fails in packaged test config.

Tasks:

- Add optional telemetry SDK packages where dynamic imports expect them.
- Decide Node strategy: either pin verification to Node 24 everywhere or widen open-design to match `>=24 <27`.
- Fix daemon realtime latency test or prove it passes reliably on Node 24.
- Fix web `GameTelemetryBoard` localStorage harness failures.
- Fix `GameStudioDocumentEditor.render` test timeouts/mismatches.
- Fix packaged typecheck `rootDir` issue.
- Add a verification script that prints one concise platform readiness report.

Why it matters: buyer diligence will punish "mostly green" if the failure list is fuzzy.

---

## 6. Week-by-Week Execution

| Week | Founder | Senior C# | Senior TS | Content/Design | DevOps |
|---|---|---|---|---|---|
| 1 | Counsel, trademark search, domains, corp, 20 design-partner leads | Stable version plan, Unity editor setup, smoke matrix credentials | Stripe checkout UI, SDK deps, Node strategy | Pick Pro launch SKUs, polish Soulslike | R2/S3 staging bucket, Sentry/PostHog projects |
| 2 | 5 demos booked, deck outline, one-pager | Real Unity smoke on 2022.3/2023.2/U6 | Fix open-design test failures, portal UI | Bundle first five launch SKUs | Status page, staging env, backups |
| 3 | Trademark filed, pitch video draft | 2D Platformer walkthrough, package artifacts | Pro CDN route staging validation, billing E2E | Content QA with 3 design partners | Sentry source maps, PostHog dashboard |
| 4 | Private beta enrollment | Asset Store listing submission | Fix typecheck and telemetry release tagging | First Pro bundle mounted end-to-end | Production readiness checklist |
| 5-6 | Public beta to waitlist | Reviewer feedback, v1.0 fixes | Team/seat UI, audit export polish | Hero Shooter/Cozy Sim polish | Load test, incident runbook |
| 7-8 | First paid users, enterprise pilot outreach | v1.1 from beta feedback | Billing analytics, dunning, customer health | Pro module attach telemetry | Release health alerts |
| 9-10 | Pilot negotiation | Defer Unreal unless Unity traction is real | Region enforcement, inference pooling | Live-Ops module validation | Incident drill |
| 11-12 | GA decision, sell/build reevaluation | Package hardening | GA hardening and docs | Third paid SKU ready | GA infra freeze |

---

## 7. Valuation Staircase

| Stage | Timeline | Required proof | Conservative value range |
|---|---|---|---|
| As-is | Today | Code, founder, no revenue/legal | $250K-$2.5M cash; possibly higher headline with earnout |
| Tier 0 | 4 weeks | Trademark filing, domains, corp, counsel-reviewed templates | $1M-$4M |
| Tier 1 | 90 days | Asset Store listing submitted/live, first revenue, Pro bundle live, telemetry, design-partner evidence | $5M-$25M |
| Tier 2 | 6-12 months | $1M ARR or credible run-rate, Unity customers, enterprise pilots, SOC2 Type 1 path | $30M-$80M |
| Tier 3 | 18-24 months | $5M ARR, 120%+ NRR, multi-engine proof, strategic auction | Defensible pitch: $100M-$300M; speculative ceiling: $500M+ |

Use $100M-$300M as the external Tier 3 pitch range unless operating metrics genuinely justify more.

---

## 8. Risk Matrix

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Unity AI/MCP reduces perceived moat | Medium | High | Position Greybox as content pipeline + verified extension, not Unity replacement. |
| Trademark unavailable | Medium | High | Pre-screen fallback names before brand spend. |
| No first revenue in 30 days | Medium | High | Ship the single Stripe button before broader billing UX. |
| Open-design test failures linger | High | Medium | Treat as DD hygiene workstream, not optional cleanup. |
| Real Unity smoke reveals editor-version bugs | Medium | High | Run real editor matrix before Asset Store submission. |
| Pro module content feels thin despite alpha-ready code | Medium | Medium | Beta with real designers; improve paid pack specificity before launch. |
| R2/S3 CDN setup drifts from tested mock route | Medium | Medium | Stage signed URL flow with production-like bucket. |
| Founder burnout | High | High | Hire C# and TS contractors immediately or narrow scope to Tier 0 + checkout + Unity evidence. |
| Competitive window closes | Medium | High | Keep 90-day scope brutally focused on Unity, revenue, Pro, telemetry. |

---

## 9. Cost Plan

| Category | 90-day estimate |
|---|---:|
| Legal/brand/corp | $7K-$13K |
| Senior C# contractor | $36K-$45K |
| Senior TS contractor | $33K-$39K |
| Content author | $15K-$30K |
| Designer fractional | $6K-$8K |
| DevOps fractional | $7K-$10K |
| Infra/tools | $2K-$5K |
| Total | $106K-$150K |

The original $150K-$300K funding requirement remains prudent because it includes contingency, founder runway, and hiring slippage. The direct vendor/contractor spend can plausibly fit closer to $115K-$150K if tightly managed.

---

## 10. Founder Decisions

Answer these before starting Path C:

1. **Commitment:** Are you willing to spend 18-24 months on Greybox if the 90-day push works?
2. **Capital:** Can you commit or raise $150K-$300K of patient capital?
3. **Hiring:** Can you hire or contract one senior Unity/C# engineer and one senior TS engineer within two weeks?
4. **Name:** If Greybox is blocked, which fallback name wins?
5. **Exit path:** Do you have warm access to Unity, Roblox, Epic, Krafton, Sony, or a banker who can create a credible process?

Recommended default: Path C for 30 days with a hard checkpoint. If by day 30 legal is filed, Stripe UI is live, Unity real-smoke evidence exists, and one Pro bundle is staged, continue to 90 days. If two of those four miss, switch to Tier 0 + sell/raise optionality.

---

## 11. Immediate Next 10 Tasks

1. File trademark search request and buy defensible domains.
2. Add web Stripe Checkout button and portal button.
3. Configure a real Unity editor smoke environment.
4. Cut a stable Unity package version candidate.
5. Run Asset Store package export, not only dry-run validation.
6. Configure R2/S3 staging bucket for Pro modules.
7. Release one signed `.gbpro` bundle to staging and mount it through open-design.
8. Install telemetry SDK packages matching existing dynamic imports.
9. Fix open-design web/daemon/typecheck failures or pin verification to Node 24.
10. Send 20 design-partner outreach emails with a 90-second demo.

This is the smallest plan that preserves the memo's valuation upside while respecting the current code reality.
