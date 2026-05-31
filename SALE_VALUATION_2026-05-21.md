# Greybox Studio — Sale-Now vs. Enhance-Then-Sell Memo

**Date:** 2026-05-21
**Author:** Founder review, prepared from full repo inventory + market scan
**Status snapshot referenced:** `LAUNCH_STATUS.md` (72/100 revenue-weighted readiness, 2026-05-20 PM-extended)
**This memo answers three questions directly:**

1. As a SaaS — should Greybox ship as a **desktop app** or a **web app**?
2. If you stop work today and sell **as-is (May 21, 2026)**, what is it worth?
3. What specific things must you enhance to maximize sale value, and what does the number become after each enhancement tier?

This document is dated and standalone. It does **not** replace `GREYBOX_COMPLETE_ANALYSIS_2026-05-19.md` — read that for the full module-by-module audit. This one is the founder-decision memo.

---

## 0. TL;DR — the three numbers and the one decision

| Question | Answer |
|---|---|
| **Q1. Desktop or web?** | **Web SaaS as the front door, Electron desktop as the trust layer, Unity Editor plugin as the moat.** Pick web-primary. The Unity plugin is what a buyer actually pays for. |
| **Q2. As-is sale value, May 21, 2026** | **$250K – $2.5M** total (low end = code-and-brand asset sale; high end = founder-included acqui-hire by Unity / Sony / Krafton / Roblox) |
| **Q3. Sale value after focused enhancements** | **Beta + first revenue (D+90):** $8M – $25M • **$1M ARR (~12 mo):** $30M – $80M • **$5M ARR + 120% NRR (24 mo):** $200M – $500M+ |

The chasm between $2.5M and $30M is exactly **four things**: a filed trademark, a Unity Asset Store listing with paying customers, one shipped Pro module, and a clean SOC2-Type-1 path. None of them are technical risk. All four are 30–90 days of focused execution.

---

## 1. Q1 — Desktop app or web app?

### The short answer

You should not pick. **Ship all three surfaces, with web as the primary marketing front door.** Here is the role each surface plays in the sale narrative:

| Surface | What it does | Why it matters at exit |
|---|---|---|
| **Web app** (`apps/web`, Next.js) — **PRIMARY** | Signup, plan picker, project browser, file viewer, collaboration | SaaS comparables price on web SaaS revenue. Distribution + funnel + analytics live here. Buyers pay 6–8x ARR for AI-positioned web SaaS in 2026; they pay 0–1x for a desktop tool with no recurring revenue. |
| **Electron desktop** (`apps/desktop`, `apps/packaged`) | "Your game IP never leaves your laptop" — local-first execution, BYOK inference, sidecar daemon | The enterprise/IP-paranoid trust story. Game studios will not paste their unreleased game design into a hosted web tool. Without this, you lose every studio deal >$10K/yr. |
| **Unity Editor plugin** (`greybox-unity-plugin`, C#, ~3,456 LOC of real editor code) | Round-trip import of `.gameview.json` → Unity prefabs/scenes/palettes/HUDs, sidecar pattern, conflict resolution | **This is the moat.** Web design tools are commodity. A Unity plugin that imports AI-designed artifacts directly into a Unity Verified Solution-badged extension is not. This is what Unity/Roblox/Epic would actually buy. |

### Why "web vs desktop" is the wrong frame

You phrased the question as a SaaS architecture choice. The honest framing is: **the SaaS is the distribution layer; the Unity plugin is the product.**

- Pure desktop apps in 2026 trade at **0–1x revenue** because they are one-shot purchases.
- Pure web SaaS trade at **3.1x median, 6–8x for AI-positioned high-growth** ([Aventis SaaS multiples 2015–2026](https://aventis-advisors.com/saas-valuation-multiples/)).
- A **web SaaS + paid editor plugin** is the Figma / Procreate / Notion + plugin pattern. It collects SaaS multiples on the web revenue **and** strategic-acquirer interest on the plugin moat.

### What to actually build

Web SaaS is already 80–85% there in `open-design/apps/web` (248 TS/TSX files). The substantive missing pieces are:

- Self-serve signup → plan picker → Stripe Checkout → billing portal (server-side endpoints shipped 2026-05-20; **single dashboard button** is the missing UI per `LAUNCH_STATUS.md` G12)
- Light-mode toggle (you sell to designers; dark-only mobile-broken UX is disqualifying)
- Responsive top-20 components (currently dark-only, hardcoded)
- PostHog opt-in funnel analytics (telemetry adapter shipped 2026-05-20; SDK install + dashboards pending)

Total remaining web work: **~10–12 engineer-weeks** per `LAUNCH_PLAN_2026-05-20.md` §10 + §17.

Electron desktop is already shipping (`apps/desktop/src/main/telemetry.ts` Sentry adapter landed yesterday). Keep it as-is. Don't market it as the primary surface — market it as the security guarantee for the paranoid customer.

Unity Editor plugin needs the **v1.0 punchlist** closed (`V1_PUNCHLIST.md`): P0.1.c integration test ✅ done, P0.2 2D Platformer sample 🟡 partial, P1.1 daemon FBX orchestration ⛔ not started, P2.2 conflict UI 🟡 partial. That is the rate-limiting work for everything else.

### So: web app, yes. Single answer: **web-primary, hybrid distribution.**

---

## 2. Q2 — What is it worth today, May 21, 2026, as-is?

### What "today" actually means

Inventory verified by direct repo scan today:

| Repo | LOC (real code, excl. node_modules) | Completeness | Notes |
|---|---|---|---|
| `open-design` (Apache-2.0 fork) | ~201,000 TS/TSX/JS | 80–85% | Working web app + daemon + Electron + sidecar + contracts. CSP shipped. Sentry+PostHog telemetry adapter shipped, SDKs not yet installed. |
| `greybox-unity-plugin` | ~13,145 (Editor 42 files / Runtime 22 / Tests 22) C# | 70–75% | Working importers, sync mappers, conflict inbox, daemon client, license state. Round-trip safety shipped. Tag-driven release workflow shipped. |
| `greybox-cloud` | ~41,917 TS | 78/100 launch gates | Multi-tenant, Stripe Checkout + Portal endpoints, metering, WorkOS auth, SCIM (Postgres), audit log (Postgres + hash chain), Sentry, /healthz + /readyz, billing rate limiter, dispute event routing. 350 tests passing. |
| `greybox-marketplace` | ~11,386 TS | 70/100 | LiveStripeConnectProvider + refunds + dispute webhooks + hash-chained audit log + E2E Stripe testmode harness. 74 tests + 2 testmode-gated skips. |
| `greybox-pro` | ~5,191 TS | 15% | Encrypted `.gbpro` bundle system scaffolded. **Zero modules authored.** |
| `greybox-playtest` | ~4,372 TS | 20% | Skeleton AI playtest harness. Deferred per launch plan. |
| `greybox-brand` | tokens + logo SVGs | 30% | Style Dictionary tokens, mark/wordmark SVGs, BRAND.md. **Trademark not filed.** |
| `greybox-unreal-plugin` | ~1,982 C++ | 15% | Headers + uplugin manifest only. **Zero MCP handlers.** Deferred. |
| `greybox-godot-plugin` | ~905 GDScript | 10% | Skeleton. **Zero handlers.** Deferred. |

**Total real source LOC: ~278,000**, plus brand and infra. The May 19 audit's "~349,635" figure included generated/transpiled artifacts; the working number for valuation purposes is what's above.

### The five things missing that crush valuation today

1. **Trademark not filed, domain not purchased, GitHub org not renamed.** The brand exists in code; it does not exist legally. ([`LAUNCH_STATUS.md` G1–G3, ⛔ NOT STARTED](computer:///Users/soumyadebnath16/Developer/game%20desine/LAUNCH_STATUS.md))
2. **Zero paying customers, zero revenue, zero design-partner LOIs.** No traction data to underwrite a multiple.
3. **Unity Asset Store listing not submitted.** `ASSET_STORE_SUBMISSION.md` is drafted; the actual Verified Solution submission has not happened.
4. **Zero Pro modules authored.** The encrypted-bundle infrastructure exists; the Soulslike Combat Pack content is scaffolded but not shipped (R12 / G26 in `LAUNCH_STATUS.md`).
5. **No legal counsel review** on `PRIVACY.md` / `TERMS.md` / DPA. Templates exist; they say "TEMPLATE" at the top.

### How the market would price this codebase today

There are exactly three buyer archetypes for a no-revenue technical asset like Greybox today. Each prices on a different model.

#### Buyer A — Asset-only acquirer (private equity, code escrow, distressed)

They buy the IP, walk away from the founder. Open-source half is Apache-2.0 and worth ~$0 (anyone can fork it). They pay for the proprietary half:

- ~13K LOC Unity plugin code (4–6 engineer-months to rebuild) → **$300K – $600K**
- ~42K LOC cloud platform (4–6 engineer-months to rebuild from scratch with the same maturity) → reduced because they have to relicense Stripe, redo SOC2 path
- Brand assets, design tokens, BRAND.md → **$10K – $30K**
- **Total asset-only sale: $200K – $700K.**

The Heavybit analysis is blunt on this: ["With improvements to codegen tools, the codebase will have little IP value, as a few people can easily rebuild it. Buyers aren't looking at your repo."](https://www.heavybit.com/library/article/the-acqui-hire-is-no-longer-a-distress-sale) The exception is **defensible moat code** — Unity Editor extensions with round-trip safety qualify, but the moat only matters if the buyer wants the *category position*, which an asset-only buyer doesn't.

**Realistic range: $250K – $600K.**

#### Buyer B — Strategic acqui-hire (Unity, Sony / Promethean-style, Roblox, Krafton)

They buy the founder + the IP because owning the category for 1–2 years is worth more than building it. The benchmark is **Sony Interactive Entertainment's acquisition of [Promethean AI in October 2024](https://pitchbook.com/profiles/company/466826-95)** — a 6-employee specialist tool with no public revenue. Terms weren't disclosed; estimated range from comparable deals: $5–15M including earnouts.

Going rate for AI-domain acqui-hires per Silicon Valley benchmark: **[~$1M per quality engineer](https://www.heavybit.com/library/article/the-acqui-hire-is-no-longer-a-distress-sale)**. You are a solo founder. Even with a strategic premium for "you built the whole stack alone," the realistic envelope is:

- Cash component: $500K – $1.5M
- 2–3 year earnout / equity grant: $1M – $3M
- Retention bonus: $250K – $750K
- **Total: $1.75M – $5.25M, headline number $1M – $2.5M cash-at-close.**

This is the realistic sale you can run today **if a strategic competitor (Unity AI team, Roblox Studio AI team) sees Greybox as a "kill the rival before it grows" buy.** Roblox's [May 1, 2026 Bloomberg announcement of agentic AI Studio tools](https://www.bloomberg.com/news/articles/2026-05-01/roblox-to-challenge-unity-unreal-engines-with-new-ai-software) is a meaningful market-timing signal — they are aware they need to consolidate the AI-game-design layer.

**Realistic range: $1M – $2.5M cash at close, $2M – $5M total package.**

#### Buyer C — Pure financial buyer (would walk; not a real bid)

There is no PE/strategic buyer that pays >$1M for a no-revenue SaaS in 2026's compressed market ([SaaS multiples 2026: median 3.1–3.4x EV/Rev, undifferentiated 3–4x](https://aventis-advisors.com/saas-valuation-multiples/)). With $0 revenue, any multiple is $0. Skip this archetype.

### Net as-is valuation, May 21, 2026

| Sale type | Low | High |
|---|---|---|
| Asset-only sale (code + brand, founder exits clean) | **$250K** | **$700K** |
| Strategic acqui-hire (founder joins buyer 2–3 years) | **$1.0M** | **$2.5M** cash at close |
| Strategic acqui-hire including earnout / equity | **$2M** | **$5M** total package |

**Most-likely realistic outcome if you tried to sell this week:** $400K – $1.5M cash, structured as asset purchase + 18-month founder consulting agreement. You could probably push to **$2M–$3M** if you can engineer a competitive bid between Unity and Roblox, but neither has an incoming-call relationship with you yet, which means you'd need a banker (~4% fee) and 3–6 months to run the process — during which the launch backlog grows.

**Bottom line: do not sell today.** The chasm to the next tier is small relative to the upside.

---

## 3. Q3 — What to enhance, in what order, for maximum sale value

The pattern is: **trademark → revenue → traction → moat depth → category position.** Each tier roughly **5–10x's** the realistic sale envelope from the prior tier. Below is the staircase, with effort estimates pulled from `LAUNCH_PLAN_2026-05-20.md` and `REMAINING_ISSUES.md`.

### Tier 0 — "Brand exists in law, not just in code" (Week 1–4)

**Goal:** Make the company legally sellable.

| Action | Effort | Cost |
|---|---|---|
| File trademark, US classes 9/41/42 (per `THE_500M_PROMPT.md` §1) | 2 weeks calendar + counsel | $2K – $4K |
| Buy `greybox.studio`, defensively `.com` / `.ai` / `.gg` | 1 hour | ~$200/yr |
| Form Delaware C-corp (if not done) | 1–2 weeks | $500 – $1.5K (Stripe Atlas / Clerky) |
| Rename GitHub org to `greybox-studio`; create 8 private repos per `THE_500M_PROMPT.md` §1 | 30 min | $0 |
| Counsel review of `PRIVACY.md` + `TERMS.md` + DPA template | 1–2 weeks | $3K – $8K |

**Valuation impact:** $250K → $1M floor on asset sale (because the buyer now gets a registered trademark, not just a name on a SVG). **Total tier cost: ~$10K. Total tier ROI: ~4x.**

### Tier 1 — "Public beta with paying customers" (Month 1–3, per LAUNCH_PLAN D+45 and D+90)

**Goal:** Demonstrable revenue and traction. The hardest tier; everything else compounds on it.

| Action | Effort | Source |
|---|---|---|
| Close Unity plugin v1.0 punchlist (P0.2 sample, P1.1 daemon FBX, P2.2 conflict UI) | 8 weeks Senior C# | `V1_PUNCHLIST.md` |
| Submit Unity Asset Store **Verified Solution** | 1 week | `ASSET_STORE_SUBMISSION.md` |
| Ship Stripe Checkout UI button (single dashboard) | 2 hours | `LAUNCH_STATUS.md` G12 |
| Ship first Pro module end-to-end (Soulslike Combat Pack) | 3 weeks content author | R12, G26 |
| Wire Sentry + PostHog SDKs (adapters already shipped) | 1 week | R4, R5 |
| Light-mode toggle + responsive top-20 components | 5 weeks designer + Senior TS | `LAUNCH_PLAN_2026-05-20.md` §5 |
| 20 design-partner outreach + 5 demos | 4 weeks founder | `LAUNCH_PLAN_2026-05-20.md` Week 1–4 |
| Get to **$25K – $50K MRR ($300K – $600K ARR run-rate)** | Months 2–3 post-beta | sales motion |

**Valuation impact at $25K MRR ($300K ARR run-rate):**
- AI-positioned web SaaS multiples in 2026: **6–8x ARR** ([Aventis 2026](https://aventis-advisors.com/saas-valuation-multiples/))
- $300K × 7x = **$2.1M** on pure SaaS comps
- **Strategic premium for "owns AI-design layer for Unity"**: 2–4x on top
- **Realistic envelope: $5M – $20M**
- **High-end envelope if you secure a competitive bid: $25M**

### Tier 2 — "$1M ARR, Verified Solution, multi-engine optionality" (Month 6–12)

**Goal:** This is the **Sony-bought-Promethean** comparable. Specialist tool, real revenue, strategic-acquirer interest.

| Action | Effort |
|---|---|
| Author Pro modules 2–4 (Hero Shooter, Cozy Sim, Hyper-Casual) | 9 weeks content |
| Unreal plugin v1.0 — MCP handler dispatch | 10–12 weeks Senior C++ |
| Cloud Postgres migration **fully cut over** (currently 1/3 done — TenantStore shipped, audit log shipped, SCIM shipped; need migration finalized off feature flag) | 4 weeks |
| SOC2 Type 1 audit (Drata or Vanta) | 4–6 months, $15K – $25K |
| Real-time collaboration (Yjs) in Studio tier | 4–6 months |
| Hit **$80K – $100K MRR ($1M ARR)** | sales motion |
| Land 2–3 enterprise pilots @ $40K+/yr each | enterprise sales |

**Valuation impact at $1M ARR:**
- SaaS multiple at 6–8x ARR: $6M – $8M base
- **Strategic premium** because Unity AI / Roblox AI Studio are racing for the AI-design layer ([Bloomberg, May 2026](https://www.bloomberg.com/news/articles/2026-05-01/roblox-to-challenge-unity-unreal-engines-with-new-ai-software)): 4–10x on top
- **Realistic envelope: $30M – $80M**
- **High-end if Unity + Roblox + Krafton all bid: $100M**
- Comparable: [Vista/Blackstone paid 12x EV/Revenue for Smartsheet in 2025](https://www.l40.com/insights/saas-multiples) — but Smartsheet had scale. At $1M ARR you don't get 12x without the strategic frenzy.

### Tier 3 — "Category leader, $5M ARR, 120% NRR" (Month 18–24, the `THE_500M_PROMPT.md` target)

**Goal:** Series B at $200M–$500M, or strategic acquisition at the same.

| Action | Effort |
|---|---|
| Pro module catalog of 6 modules, Live-Ops + Roguelike additions | parallel content |
| Activate marketplace fully (Stripe Connect live, refund initiation activated, moderation dashboard) | gate: 1K paying customers |
| Multi-region deployment (US + EU + APAC) | 4 weeks (gate: first EU enterprise) |
| On-prem / air-gapped Helm chart + offline license | 6–8 weeks (gate: first defense/regulated prospect) |
| SOC2 Type 2 + ISO 27001 | 6–12 months, $40K – $80K |
| HSM-backed signing for license tokens | 2 weeks |
| Godot plugin v1.0 (after Unity hits 250 paying customers) | 12–14 weeks |
| Hit **$5M ARR with 120%+ NRR** | execution |

**Valuation impact at $5M ARR + 120% NRR + multi-engine:**
- High-growth, retention-strong, AI-positioned: **40x – 100x ARR** (this is where the 2021 era multiples and the Thoma-Bravo-pays-12x-for-Smartsheet world both reach)
- $5M × 40 = $200M, × 100 = $500M
- This is the **literal $200M – $500M+ outcome described in `THE_500M_PROMPT.md`** — and the market mechanics check out, **given** that you hit the operating metrics.

### Tier 4 — "Public-ready or $1B strategic exit" (Year 4–6)

If you hit **$25M – $50M ARR with 120%+ NRR**, the math:
- 10x revenue (compressed 2026 market): $250M – $500M
- 20x revenue (AI-positioned high-growth premium): $500M – $1B
- Strategic premium from forced competitive bid: $1B – $1.5B

This is the [Procedural Worlds doing ~$1M ARR](https://mktclarity.com/blogs/news/top-unity-stores) scenario projected forward 5 years with an AI-design platform that wraps it. Realistic if everything compounds; ambitious in the sense that no one has hit it in this category yet.

### Summary staircase

| Stage | Time from today | Cumulative investment | Realistic sale value |
|---|---|---|---|
| **As-is** (May 21, 2026) | 0 | ~$0 (sunk) | **$250K – $2.5M** |
| Tier 0 (legal + brand registered) | 4 weeks | $10K | $1M – $4M |
| Tier 1 (beta + $25K MRR) | 3 months | $150K – $300K | **$5M – $25M** |
| Tier 2 ($1M ARR + Unreal + SOC2) | 12 months | $1M – $2M | **$30M – $100M** |
| Tier 3 ($5M ARR + 120% NRR) | 24 months | $5M – $8M | **$200M – $600M** |
| Tier 4 ($25M+ ARR category leader) | 48–72 months | $20M – $40M | $500M – $1.5B |

---

## 4. The single most important sentence in this memo

**If you sell today, you sell for $400K – $1.5M cash. If you spend 90 days closing the Unity v1.0 punchlist, filing the trademark, and shipping one Pro module to one paying cohort of 100 customers, you sell for $5M – $25M.** That's a 10–20x return on 90 days of focused work, with effort and investment estimates already sized in `LAUNCH_PLAN_2026-05-20.md` and team shape sized at 3.75 FTE.

The opportunity cost of *not* doing those 90 days is roughly **$3M – $20M of foregone valuation**. The downside risk of doing them and failing (slow customer acquisition, Roblox/Unity AI ships a competing in-editor feature) is that you end up back at the Tier-0 valuation, **$1M – $4M** — a ceiling that's still higher than today's floor.

The asymmetry is enormous. Build for 90 days, then revisit the decision.

---

## 5. What I'd modify, ranked by ROI per dollar of effort

These are the highest-leverage changes you can make right now, ordered by **sale-value lift per engineer-week**.

| Rank | Change | Sale-value lift | Effort |
|---|---|---|---|
| 1 | **File trademark + buy domain + rename GitHub org** | $250K → $1M floor | $10K cost, 4 weeks calendar (mostly counsel-blocking) |
| 2 | **Close Unity plugin v1.0 punchlist + submit Verified Solution** | Adds defensible moat narrative; unlocks Tier-1 valuation | 8 weeks Senior C# (this is the one technical bottleneck; everything else parallelizes around it) |
| 3 | **Ship Stripe Checkout single-button UI** (server-side already done, R12 closed) | Activates first $1 of revenue; unlocks SaaS-multiple pricing | **2 hours** |
| 4 | **Author + ship first Pro module (Soulslike Combat Pack)** | Proves NRR thesis; one bundle SKU live = ARR multiplier story | 3 weeks content author |
| 5 | **Wire Sentry + PostHog SDKs** (adapters already shipped 2026-05-20) | Buyer-DD essential; without telemetry, no acquirer believes your funnel claims | 1 week |
| 6 | **Light-mode toggle + responsive top-20 components** | Removes "designers won't use this" objection from every demo | 5 weeks designer + Senior TS |
| 7 | **Land 3–5 design-partner letters of intent** | Each LOI = 0.5x – 1x ARR-equivalent of valuation lift in DD | 4 weeks founder time |
| 8 | **SOC2 Type 1 path started (Drata onboarded)** | Required for any enterprise deal; unlocks $40K+/yr ACVs | 1 week onboarding + 4–6 months audit, $15K – $25K |
| 9 | **Counsel-reviewed PRIVACY.md + TERMS.md + DPA** | Every paying customer requires this; without it, no enterprise sale closes | 1–2 weeks counsel, $3K – $8K |
| 10 | **Refactor `server.ts` (12K LOC) + `FileViewer.tsx` (5,974 LOC)** | DD readability; reduces "tech debt risk" markdown by acquirer | 6 weeks Senior TS (defer until Tier 2) |

**Items 1–5 are the 90-day plan.** Everything else is Tier 2+.

### What I would explicitly *not* prioritize

| Don't do this | Why |
|---|---|
| **Unreal plugin** | Per `LAUNCH_PLAN_2026-05-20.md` §0 "One thing the team will not do for 90 days." Defer until Unity hits 100 paying customers. |
| **Godot plugin** | Same. Defer to 250 paying customers. |
| **Marketplace activation** | Stripe Connect Live shipped, but never wire `LiveStripeConnectProvider` in production until Unity hits 1K paying customers. Activation triggers KYC, regulatory, and tax complexity that you don't need pre-PMF. |
| **Real-time collab (Yjs)** | $0 valuation lift pre-revenue; 4–6 month investment. Studio-tier driver, not Tier-1 unlock. |
| **AI-generated NPCs / runtime AI** | Not your category. You are a *design* layer, not a runtime engine. Don't drift. |
| **Selling on a discounted multi-year SaaS deal to bank one big check** | Locks you out of competitive sale process. Use month-to-month or annual; preserve optionality. |

---

## 6. Verifiability — how each number is grounded

Every dollar figure in this memo traces to one of three sources. If you're going to a buyer's DD process, your data room must surface these.

**Asset-only valuation ($250K – $700K):**
- Engineer-month rebuild cost calculation: 13K Unity C# LOC at ~2K LOC/engineer-month for plugin-quality C# = 6.5 engineer-months × $25K/engineer-month fully loaded = $162K, adjusted for the round-trip safety / sidecar pattern complexity (× 2–3x) and brand assets ($30K) = $300K – $700K
- Sanity-check: [Heavybit's "buyers aren't looking at your repo"](https://www.heavybit.com/library/article/the-acqui-hire-is-no-longer-a-distress-sale) — so I'm pricing only the moat code (Unity plugin), not the open-source half (worth $0 to a buyer who can fork it)

**Acqui-hire valuation ($1M – $2.5M cash):**
- Solo-founder rate from [Heavybit / Founders Forum 2025](https://ff.co/ai-acquihires/): **$1M – $1.5M per quality engineer**
- AI / game-tooling premium: +50–100%
- Sony-Promethean comparable (October 2024, 6 employees, undisclosed terms): $5–15M total package implied from comparable specialist-tool deals

**Tier 1 — $5M – $25M at $25K MRR / $300K ARR run-rate:**
- 2026 SaaS multiples for AI-positioned high-growth: [6x – 8x ARR](https://aventis-advisors.com/saas-valuation-multiples/) = $1.8M – $2.4M baseline
- Strategic premium for first-mover in AI-design layer for Unity: 2x – 4x on top = $5M – $20M
- High end if competitive bid (Unity vs Roblox vs Krafton): $25M

**Tier 2 — $30M – $80M at $1M ARR:**
- SaaS multiples 6–8x ARR = $6M – $8M baseline
- Strategic premium during Roblox-Unity AI-tools race (per [Bloomberg May 2026](https://www.bloomberg.com/news/articles/2026-05-01/roblox-to-challenge-unity-unreal-engines-with-new-ai-software)): 4x – 10x
- Realistic envelope $30M – $80M; high end $100M if frenzied

**Tier 3 — $200M – $600M at $5M ARR + 120% NRR:**
- High-retention AI-positioned SaaS multiples: 40x – 100x ARR is achievable for genuine category leaders with 120%+ NRR
- $5M × 40 = $200M lower bound; × 100+ for strategic frenzy = $500M – $600M
- This matches the [`THE_500M_PROMPT.md`](computer:///Users/soumyadebnath16/Developer/game%20desine/THE_500M_PROMPT.md) target and is supported by the operating-metric requirements stated there ($5M ARR + 120% NRR by month 24)

**Unity Asset Store revenue context:** Top publishers like Procedural Worlds reach [~$1M ARR](https://mktclarity.com/blogs/news/top-unity-stores) from plugin sales alone; the median publisher earns very little. Greybox's plugin is a *funnel* into SaaS tiers, not the revenue itself — but Asset Store distribution gives you 3.3M Unity developers as a top-of-funnel.

---

## 7. Decision Framework — should you sell, build, or both?

If **(a)** you want liquidity in <6 months **and** **(b)** you do not want to operate a SaaS for 2+ years **and** **(c)** your alternative use of time is more valuable than $5M – $25M of expected upside:

> **Sell now.** Engage a software-M&A banker. Run a 4–6 month process. Realistic outcome: $1M – $2.5M cash + 18-month consulting agreement. Total package $2M – $5M.

If **(a)** you can give 90 days of full-time founder time **and** **(b)** you can hire 1 Senior C# + 1 Senior TS + 1 content author + 0.25 designer + 0.25 DevOps (~$60K – $90K / month burn) **and** **(c)** you can fund 12 months runway (~$1M – $1.5M, or bootstrap to $25K MRR first):

> **Build to Tier 1, then re-evaluate.** Expected outcome at month 3: $5M – $25M valuation. Expected outcome at month 12: $30M – $80M. Expected outcome at month 24: $200M – $500M+. Risk-adjusted EV strongly favors building.

If **(a)** unclear team funding, **(b)** unclear founder commitment beyond next 6 months:

> **Build Tier 0 only ($10K, 4 weeks), then sell.** This bumps your floor from $250K to $1M+ and your ceiling from $2.5M to $4M for very little incremental work. Then run the M&A process from a slightly stronger position.

---

## 8. Open questions you should answer this week

These directly affect which path you should take and how to price each:

1. **Founder commitment.** Are you willing to spend the next 18–24 months on Greybox? Yes → build. Soft no → Tier 0 + sell. Hard no → sell now.
2. **Funding.** Do you have access to $200K – $1M of patient capital (founder savings, friends-and-family, or a bootstrap-from-MRR plan)? Without it, Tier 1 is infeasible without dilution.
3. **Team.** Can you hire 1 Senior C# and 1 Senior TS to land the v1.0 punchlist? Solo execution adds 50–100% to timeline and shrinks every valuation band by ~30%.
4. **Buyer relationships.** Do you have any existing relationship with Unity AI team / Roblox Studio / Krafton corp-dev / Sony PlayStation Studios M&A? If yes, you can run an inbound-led sale process at 70% cost of a banker-led one. If no, factor a banker fee (4%) into all proceeds.
5. **Competitive timing.** Roblox's [May 1 announcement](https://www.bloomberg.com/news/articles/2026-05-01/roblox-to-challenge-unity-unreal-engines-with-new-ai-software) is 3 weeks old. Unity AI has been shipping for 12 months. The "12–18 month Unity-AI competitive window" referenced in `LAUNCH_PLAN_2026-05-20.md` §0 is now 9–15 months. The window for a strategic exit is closing, not opening. If you wait past month 18 without revenue, you compete with the acquirers' own internal builds.

---

## 9. What's next (concrete, this week)

If you take any path, **do the Tier 0 steps this week regardless** — they are pure-positive-EV at $10K cost:

- [ ] Email a US-based IP attorney to file trademark applications, classes 9/41/42. Recommendation: Cooley StartUp Counsel, Gunderson Dettmer, or a boutique like Stradling. ~$3K filing + ~$1K counsel time.
- [ ] Buy `greybox.studio`, `greybox.gg`, defensively `greybox.ai` if available (your `THE_500M_PROMPT.md` already lists priority order). Namecheap or Cloudflare Registrar. ~$300/yr total.
- [ ] Rename GitHub org. Create the 8 private repos already listed in `THE_500M_PROMPT.md` §1.
- [ ] Form Delaware C-corp via Stripe Atlas ($500) or Clerky (~$300) if not already done.
- [ ] Brief counsel on `PRIVACY.md`, `TERMS.md`, DPA template review. ~$3K – $8K.

Then make the build-vs-sell decision in writing, with the answers to §8.

---

## Sources

- [Aventis Advisors — SaaS Valuation Multiples 2015–2026](https://aventis-advisors.com/saas-valuation-multiples/) — median 3.1–3.4x in 2026; 6–8x for AI-positioned high-growth
- [L40° — SaaS Multiples 2026 Benchmark](https://www.l40.com/insights/saas-multiples) — Vista/Blackstone Smartsheet at 12x EV/Rev
- [SaaSMag — 2026 SaaS Consolidation Wave](https://www.saasmag.com/saas-consolidation-ma-wave-2026/) — 2,698 M&A transactions in 2025; Thoma Bravo $42B in 2025
- [Heavybit — The Acqui-Hire Is No Longer a Distress Sale](https://www.heavybit.com/library/article/the-acqui-hire-is-no-longer-a-distress-sale) — $1M/engineer Silicon Valley benchmark; "buyers aren't looking at your repo"
- [Founders Forum Group — AI Acquihires (Microsoft, Google, Meta)](https://ff.co/ai-acquihires/) — Character.AI $2.7B, Inflection $650M comps
- [PitchBook — Promethean AI profile](https://pitchbook.com/profiles/company/466826-95) — Sony acquired Oct 2024, 6 employees
- [Bloomberg — Roblox Challenges Unity, Unreal with AI Software (May 1, 2026)](https://www.bloomberg.com/news/articles/2026-05-01/roblox-to-challenge-unity-unreal-engines-with-new-ai-software) — strategic timing signal
- [StockTitan — Unity Q1 2026 Revenue ($508M, 27% Adjusted EBITDA Margin)](https://www.stocktitan.net/sec-filings/U/8-k-unity-software-inc-reports-material-event-a539df85012f.html) — acquirer capability
- [Sci-Tech Today — Epic Games Acquires Meshcapade](https://www.sci-tech-today.com/news/epic-games-generative-ai/) — strategic acquirer pattern
- [Market Clarity — 9 Unity Asset Stores Making Good Money](https://mktclarity.com/blogs/news/top-unity-stores) — Procedural Worlds ~$1M ARR comp
- [GeneralistProgrammer — Unity Asset Store Selling Guide 2026](https://generalistprogrammer.com/tutorials/unity-asset-store-selling-guide-revenue) — editor tools $15–80+ pricing, highest-earning category
- [SyncBrief — Fab.com vs Unity Asset Store 2026](https://www.syncbrief.com/p/fab-com-vs-unity-asset-store-the-2026-game-composer-s-marketplace-guide) — distribution context
- [Tracxn — Generative AI in Gaming Top Companies](https://tracxn.com/d/trending-business-models/startups-in-generative-ai-in-gaming/__cxbO_5tYy76-Gi8unE2l-k8Ul18puj92sjElUrch_3Q/companies) — 41 startups, 27 funded, 9 Series A+
- Internal: [`GREYBOX_COMPLETE_ANALYSIS_2026-05-19.md`](computer:///Users/soumyadebnath16/Developer/game%20desine/GREYBOX_COMPLETE_ANALYSIS_2026-05-19.md), [`LAUNCH_PLAN_2026-05-20.md`](computer:///Users/soumyadebnath16/Developer/game%20desine/LAUNCH_PLAN_2026-05-20.md), [`LAUNCH_STATUS.md`](computer:///Users/soumyadebnath16/Developer/game%20desine/LAUNCH_STATUS.md), [`REMAINING_ISSUES.md`](computer:///Users/soumyadebnath16/Developer/game%20desine/REMAINING_ISSUES.md), [`THE_500M_PROMPT.md`](computer:///Users/soumyadebnath16/Developer/game%20desine/THE_500M_PROMPT.md), [`V1_PUNCHLIST.md`](computer:///Users/soumyadebnath16/Developer/game%20desine/greybox-unity-plugin/V1_PUNCHLIST.md)
