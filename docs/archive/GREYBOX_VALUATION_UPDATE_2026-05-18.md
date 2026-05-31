# Greybox Studio — Valuation, Form-Factor & ROI Report

**Date:** May 18, 2026
**Project root:** `/Users/soumyadebnath16/Developer/game desine`
**Supersedes (in part):** `VALUATION_AND_ROI_PLAN.md` (May 15, 2026) — that doc looked only at the `open-design` open core. This one looks at the *whole* nine-repo build-out.

---

## 0. Executive summary — answer to your two questions, up front

You asked two specific things. Direct answers, then the explanation.

**Q1. If you ship today, what is it worth?**

| Metric | Today (as-is) |
|---|---|
| Realistic Year-1 ARR | **$80K – $180K** |
| Realistic Year-3 ARR | **$300K – $900K** |
| Sale value if you exited today | **$500K – $3M** (almost entirely acqui-hire) |

Why so low: the open core is Apache-2.0 (anyone can clone it), and the closed-source greybox-* modules where the actual moat lives are on average **only ~28% complete** — Unity plugin importers are scaffolds, Pro module payloads aren't authored, marketplace payouts aren't wired, cloud enterprise controls are *reports* not *enforcement*. There is no shippable proprietary product yet; there is a shippable open-source product wrapped in scaffolding labeled "moat."

**Q2. If you finish the modifications, what is the ceiling?**

| Metric | After Tier-1 enhancements (12–18 months) | Aspirational ceiling (4–6 years) |
|---|---|---|
| Year-3 ARR | **$3M – $8M** | **$20M – $50M** |
| Sale / valuation range | **$15M – $80M** (strategic) | **$200M – $600M+** (category leader, IPO-track) |

**One-line bottom line:** You are not selling the codebase. You are selling **the Unity Asset Store plugin + a managed-inference SaaS + an encrypted Pro-module catalog + a brand.** Today you have ~28% of that built. Finish those four things and the floor moves from $3M to $15M; do it for 4 more years and you are in Inworld territory at $500M.

**Q3 (you also asked): Desktop or web SaaS?**

**Hybrid, but web-first.** Web SaaS is the front door (better multiples, better distribution, real collaboration). Electron desktop stays for the BYOK / on-prem enterprise story. **The Unity Editor plugin is neither — it is the moat** and it is what a buyer will actually pay for. See §4 for the full reasoning.

---

## 1. What you actually have (the inventory)

The repo is a nine-module monorepo, not just `open-design`. Here is what is in each, with an honest completeness grade:

| Module | What it is | LOC | Completeness | Real today? |
|---|---|---|---|---|
| `open-design/` | Open core (Apache-2.0). Next.js 16 web app + Express daemon + 16 coding-agent CLI adapters + BYOK proxy + 31 game skills + 166 art-bible files + 21 starter templates + Electron desktop shell. | ~223K TS | **80–85%** | **Yes — shippable as a free product.** Three-engine runtime hook generator (Unity .cs, Unreal .h/.cpp, Godot .gd) is a thin scaffold, not a real pipeline. |
| `greybox-unity-plugin/` | C# Unity Editor extension — the differentiator. Editor windows, importers, daemon sync, MCP bridge, watermark/license enforcement. | ~5.2K C# | **45–50%** | **Partial.** `PrefabBuilder` *is* implemented (106 LOC) and builds real `GameObject` hierarchies with markers, collections, materials. Some tests assert real behavior (`PrefabBuilderTests.cs`). What's missing: real *mesh / FBX* import (current builder uses primitive cubes as placeholders), real `ScriptableObject` asset emission, real Addressables tagging, round-trip three-way merge with conflict UI, MCP bridge dispatch logic, the `GameViewportImporterTests` are still `Assert.Pass()` placeholders. Shippable as "import-only alpha" in 4–8 weeks. Production v1 with round-trip is 12–16 weeks. |
| `greybox-unreal-plugin/` | C++ Unreal plugin — same architecture, behind Unity on purpose. | ~1.7K C++ | **20%** | **No.** Headers only. No `.uplugin` build, no `AActor`/`UBlueprint` export logic. |
| `greybox-godot-plugin/` | GDScript / C# Godot addon. | ~0.76K | **10%** | **No.** Skeleton. Community-goodwill placeholder. |
| `greybox-cloud/` | TypeScript cloud (Fly.io / AWS). Inference router, license validator, Stripe billing webhook, 20+ enterprise readiness endpoints, SCIM 2.0. | ~33K TS | **45%** | **Partial.** Inference proxy + license validation + billing webhook are real. Enterprise endpoints are *readiness reports* (theater), not *enforcement* (control plane). SCIM has no durable store. PII redaction has no visible test suite. |
| `greybox-marketplace/` | Stripe Connect creator marketplace. | ~8.6K TS | **25%** | **No.** Onboarding plan + checkout session builders are real. *Payout execution is dead code* — no transfer-submission, no idempotency, no settlement polling. Refund ledger has no durable backing. |
| `greybox-playtest/` | AI playtest harness — headless Chromium personas against playable artifacts, vision observer hook. | ~3.6K TS | **20%** | **No.** Personas exist. Rule-based observer has no rules. Vision-observer is an empty seam. Balance tuner has no model. |
| `greybox-pro/` | Encrypted closed-source Pro modules (Soulslike, Hero Shooter, Cozy Sim, etc.) — Ed25519 signature + AES-256-GCM payload. | ~2.9K TS | **15%** | **No.** Envelope format and signature verification are real. **The 12 listed module payloads are not authored and there is no defined storage backend for them.** |
| `greybox-brand/` | Style Dictionary tokens (color, type, space, radius, shadow), logo mark/wordmark, Figma exports, Unity/Unreal token bindings. | 119 files | **30%** | **Partial.** Tokens emit. Logo system exists. No website, no marketing collateral, no PR kit. |

**Total source code (excluding deps/dist/generated):** ~278K LOC. **Weighted closed-source completeness: ~32%** (Unity is further along than other modules; revised after spot-checking the actual `PrefabBuilder` and tests).

This is the gap between *"founder's plan"* (your `THE_500M_PROMPT.md`) and *"shipping reality"* (what `git ls-files` proves). The plan is excellent. Execution is early.

### 1.1 What "drops directly on Unity" actually means today

You described the product as "designs that can be directly dropped on Unity." After reading `open-design/apps/daemon/src/game-engine-runtime.ts` (572 lines), the C# importers in `greybox-unity-plugin/Editor/Importers/`, and the Asset Store package metadata:

- **What works today:** A `.gameview.json` file from the studio gets converted into a single `AGDSGameViewRuntime.cs` MonoBehaviour with terrain zones, sculpt patches, factions, and tick advancement. A Unity developer can drop the file into `Assets/`, attach the component, and see *the data* — like a world-state save file.
- **What does not work today:** No prefab tree generation (`.prefab` YAML emission), no `ScriptableObject` asset creation, no Addressables labeling, no material generation from the active art bible, no UI Toolkit / uGUI emission for HUD, no Animator graph, no FBX/USD/glTF mesh export.
- **What the plugin promises but doesn't deliver:** Round-trip sync (designer tweaks HUD → Unity refreshes in 2 s; dev moves spawn point → web artifact updates in 2 s). The README copy is written. The C# code is not.

**Honest characterization:** the current import is closer to *"writes a JSON-driven script you still have to wire up yourself"* than *"drag and drop a level into Unity."* The marketing promise is the right one — it's just not implemented.

### 1.2 The IP reality check (this is the single biggest valuation governor)

| Fact | Implication for sale price |
|---|---|
| `open-design` is **Apache-2.0** | A buyer pays $0 for the open core code itself. Anyone, including Unity, can clone it. |
| 167 unique upstream contributors, 534 commits | You did not write most of the open core. A buyer is not "buying your code"; they are buying your *additions to* the code. |
| BYOK token flow (user → OpenAI/Anthropic directly) | $0 margin on every token. This is your revenue ceiling on the free / Indie tier. |
| Closed-source greybox-* modules are 28% complete | You have the *shells* of the proprietary moat but not the *interiors*. A buyer's diligence will discount these. |
| No trademark registered, no `.com` domain in your name yet | Without a registered mark, the sale is structurally an acqui-hire, not a company purchase. |

**Translation:** what a buyer pays for is **brand + customers + the closed C# Unity plugin + the encrypted Pro catalog + the team's familiarity**, not the TypeScript code. The TypeScript code is a free Apache-2.0 distribution. That single fact caps as-is sale value below $5M.

---

## 2. As-is valuation — if you shipped this weekend, fully honest

These numbers assume: brand picked, domain bought, Stripe wired, free + Indie tiers live, hosted on Vercel + a managed daemon. **No new engineering moats land in the next 12 months.**

### 2.1 SaaS ARR (as-is)

Pricing modeled on [Ludo.ai pricing](https://ludo.ai/pricing), [Buildbox](https://www.capterra.com/p/158597/Buildbox/), comparable AI game tools:

| Tier | Price | Year-1 paid | Year-3 paid | Year-3 ARR |
|---|---|---|---|---|
| Free / BYOK | $0 | 6,000 signups | 60,000 signups | — |
| Indie | $19 / mo | 80 | 900 | $205K |
| Studio (5-seat min) | $99 / seat / mo | 25 seats | 320 seats | $380K |
| Enterprise self-host | $20K / yr | 1 | 10 | $200K |
| Managed inference (cloud routing on 45%-complete cloud) | 70% GM markup | <$5K | $80K | $80K |

**As-is Year-3 ARR realistic: $300K – $900K.** Conservative midpoint $500K.

Why not higher: without the Unity plugin actually shipping, you are competing head-on with Rosebud AI ([$15M Series A, October 2024](https://www.crunchbase.com/organization/rosebud-ai)), Ludo AI, GDevelop, Buildbox — all of whom have 1–4 year head starts on brand, content, and distribution.

### 2.2 Strategic sale (as-is)

Comp grid, today's state of the codebase:

| Buyer type | What they'd pay for | Likely range |
|---|---|---|
| Acqui-hire (any) | 2–3 engineers × $200K–$500K each, 1-year clawback | $400K – $1.5M |
| Strategic small (Krafton, NetEase, Tencent studio-tooling unit) | Team + adjacent agent-tooling skills + Apache-2.0 fork they could've cloned but the founders already know it | $1M – $3M |
| Strategic large (Unity, Roblox, Epic) | **Not buying today.** Code is OSS; closed moat is 28% scaffolded; brand isn't registered. Would offer a `<$2M` defensive ping at best. |

**As-is realistic sale: $500K – $3M, almost entirely an acqui-hire.** This matches the May 15 doc's estimate; the closed-source work-in-progress nudges the floor up by ~$250K but not more, because *unfinished* proprietary code is *negative* in diligence (it has to be either finished or written off).

### 2.3 One-time license (as-is)

The only saleable one-time SKU today is the Unity plugin — but it isn't shippable. So: **$0 perpetual-license revenue this year.**

You could sell "managed install + 1 year support" packages at $2K–$10K to enterprise studios; realistic volume 5–15/year = **$10K–$150K of consulting revenue**, but this is services, not product, and a buyer will assign it a ~1x multiple, not 5x.

---

## 3. What to fix, in priority order (highest ROI per dollar of effort)

I am ranking by **valuation lift per engineering month**. Build in this exact order.

### 3.1 [TIER-1, MUST] Finish the Unity Editor plugin to a real v1.0

**Current state:** ~45–50% complete. `PrefabBuilder` builds real GameObject hierarchies, materials are color-stamped, the marker system works. But: cubes-as-placeholders instead of real mesh import, no `ScriptableObject` asset emission, no Addressables labeling, no round-trip merge.

**What "done" looks like for v1.0:**
- `PrefabBuilder.BuildFromGameViewport()` actually emits a real prefab tree with `GameObject` hierarchy, attached MonoBehaviours, ScriptableObject references, Addressables labels, URP materials from the active art bible.
- `ArtBibleImporter` produces a real `GreyboxPalette.asset` ScriptableObject the user can drop into any renderer.
- `HudLayoutImporter` produces UI Toolkit or uGUI assets, not just JSON.
- Round-trip three-way merge works for 5 field types (`int`, `float`, `string`, `Color`, `Vector3`), with a real conflict UI.
- Tests assert behavior, not `Assert.Pass()`.
- One paid sample (e.g., 2D Platformer) installs end-to-end into Unity 2022.3 / 2023.2 / Unity 6 in <30 seconds.

**Effort:** 3–5 months × 1 senior C# engineer + 1 TS engineer. Probably 8 engineer-months total.

**Valuation lift:** +10x to +20x on acquisition floor. Without this, sale floor is ~$2M. With this shipped on the Unity Asset Store at $149 perpetual + $9/mo:
- 8,000 perpetual + 1,500 subscriptions × Year 3 = **$1.36M ARR** from the plugin alone.
- This converts you from "fork of OSS" to "AI-design-to-Unity bridge." Floor moves to **$15M strategic**. Ceiling ~$50M+ if Unity wants a defensive buy (cf. the [ProBuilder acquisition, 2018](https://www.cgchannel.com/2018/02/unity-now-comes-with-probuilder-built-in-for-free/), estimated $5–15M for less mature tech).

**This is your #1 priority. Nothing else matters until this lands.**

### 3.2 [TIER-1, MUST] Author and ship 4–6 Pro module payloads

**Current state:** 15%. Envelope format (Ed25519 + AES-256-GCM) is real. The 12 listed modules (Soulslike Combat Pack, Hero Shooter Toolkit, Cozy Sim Pack, etc.) **have no payload content authored** and there is **no defined storage backend** for `.gbpro` files.

**What "done" looks like:**
- 4–6 modules with real skill bodies, art bibles, engine-target code, and playbooks, encrypted into `.gbpro` bundles.
- `.gbpro` files hosted in a CDN bucket with signed-URL distribution gated on license validation.
- Per-license entitlement lookup is durable and tested.
- The open-core loader actually decrypts and mounts a Pro module from a license key on a clean machine.

**Effort:** 2–3 weeks per module × 5 modules + 4 weeks of storage/entitlement plumbing = ~5 months.

**Valuation lift:** This is the **NRR engine**. Studios that buy one Pro module attach a second within 6 months at ~40% rate (the report scaffold says you're targeting that — make it real). Each Pro module is a $59–$99 add-on with no marginal COGS. Year-3 Pro ARR realistic: **$0.5M – $2M.**

NRR > 120% from Pro attach is what moves your SaaS multiple from 4.5x (median) into the **7–9x premium-vertical band** (see [Aventis Advisors SaaS multiples 2026](https://aventis-advisors.com/saas-valuation-multiples/), [multiples.vc](https://multiples.vc/insights/software-saas-valuation-multiples)).

### 3.3 [TIER-1, MUST] Make cloud inference and billing actually production-grade

**Current state:** 45%. Inference router exists. Stripe webhook exists. **Enterprise readiness endpoints are reports, not control planes.** SCIM has no durable store. Data residency is documented but not enforced.

**What "done" looks like:**
- Inference routing measured by tokens with idempotent metering posted to Stripe metered billing.
- Region pinning is *enforced* at the load-balancer / DNS level, not just *claimed* in a JSON report.
- SCIM 2.0 has a durable store with tombstones and idempotency.
- PII redaction has a real 100-case regression suite that passes in CI.
- One pilot enterprise customer (any logo) actually invoiced for managed inference > $5K MRR.

**Effort:** 2–3 months × 1 senior backend.

**Valuation lift:** Margin layer. Without it, your free-tier user spends $200/mo with Anthropic and you make $0. With it, that same workload throws off ~$140/mo gross profit per active Studio user. At 1,750 Studio seats × Year 3, that is **~$700K of pure margin revenue at ~70% GM** — the multiple-moving line item.

### 3.4 [TIER-1, MUST] Brand, trademark, domain, GitHub org — week 1

**Current state:** "Greybox" is selected in `THE_500M_PROMPT.md`. **Not registered. Not filed. Not bought.**

**What "done" looks like:**
- USPTO TESS, EUIPO eSearch, India IP Office trademark search done.
- Trademark filed in US + EU + India.
- `greybox.studio` (or fallback) registered.
- GitHub org `@greybox-studio` created, all 8 closed repos moved into it.
- Every commit from today forward is authored under your name + the company GitHub org.

**Effort:** 1–2 weeks + ~$2K legal.

**Valuation lift:** **2–3x on acquisition.** A registered mark + named org is the difference between *a saleable company* and *a saleable team*. Without it, every deal is structurally an acqui-hire.

### 3.5 [TIER-2, SHOULD] Real-time collaboration (Figma model)

**Current state:** Not started. `THE_500M_PROMPT.md` specifies `packages/realtime/` with Yjs CRDT.

**Valuation lift:** Unlocks Studio tier (5-seat minimums double effective ARPU). +2x to +3x on ARR multiple. Figma's $20B Adobe offer and [$57B+ IPO valuation](https://en.wikipedia.org/wiki/Figma) were earned by *collaboration*, not the drawing tool.

**Effort:** 4–6 months × 2 engineers.

**Sequence note:** Don't start until §3.1 and §3.2 are shipped. Adding collab to a single-player product is a 2x multiplier. Adding collab to a non-product is a 2x × 0 = 0.

### 3.6 [TIER-2, SHOULD] Finish marketplace payouts and onboarding loop

**Current state:** 25%. Stripe Connect onboarding builder exists; payout execution and settlement polling do not.

**Valuation lift:** **Marketplace revenue trades at 10–15x vs. 5–7x for subscription.** Even a modest GMV ($100K Year 3 with 20% take rate = $20K take, $2K margin) reframes the company from "tool" to "platform" — a category shift that adds ~2x to exit multiple.

**Effort:** 4–6 weeks.

### 3.7 [TIER-3, NICE] Unreal plugin v1 — only after Unity hits 1,000 paying customers

Don't build until Unity ships and proves the willingness to pay. Unreal ACVs are higher but Unreal devs are pickier. ROI is real, sequencing is not now.

### 3.8 [TIER-3, NICE] Godot plugin

Community goodwill + PR. Don't sink engineer-months here until both Unity and Unreal are shipping.

### 3.9 [TIER-3, NICE] AI playtest harness (`greybox-playtest`)

Cool feature, weak revenue driver. Studios pay for *creation* tools; QA is a cost center they cut first. Park this until ≥ $3M ARR.

---

## 4. Web SaaS vs Desktop — the form-factor answer

You asked: as a SaaS, web or desktop?

**Answer: hybrid, web-first.** Specifically:

| Surface | What it's for | Build now? |
|---|---|---|
| **Web SaaS** (hosted, `greybox.studio` on Vercel + managed daemon) | The **front door**. Free signup, Indie ($19/mo), Studio ($99/seat). All distribution, conversion analytics, collaboration. | **Yes — primary.** |
| **Electron desktop** (Apple Silicon + Windows x64) | The **trust layer**. "Agent runs on your laptop, your IP never leaves" pitch for enterprise + privacy-conscious studios. | **Yes — keep maintaining; package quarterly.** |
| **Unity Editor plugin** | The **moat**. Closed-source. Sold on the Unity Asset Store. | **Yes — this is what a strategic buyer pays for.** |
| Mobile / tablet apps | Out of scope until ≥ $5M ARR. |  |

### 4.1 Why web-first

1. **Distribution.** A URL is 100x easier to share than a `.dmg` / `.exe`. Your top-of-funnel is indie devs, students, jammers — they discover via TikTok and Twitter, not Sourceforge.
2. **Multiples.** Pure SaaS trades at 4.5x median, 7–9x for premium vertical with NRR >110%. Desktop-licensed software trades at 2–4x. ([Aventis Advisors](https://aventis-advisors.com/saas-valuation-multiples/), [Breakwater M&A](https://www.breakwaterma.com/blog/saas-valuation-multiples-2026-1m-5m-arr).)
3. **Analytics.** Signup → first-artifact → save → upgrade funnel is instrumentable in web. Desktop is a black box.
4. **Collaboration.** The Tier-2 collaboration play (§3.5) is only possible on web. That feature alone adds 2–3x to your exit multiple.

### 4.2 Why keep desktop

1. **On-prem enterprise.** Studios with IP-sensitive projects (Krafton, miHoYo, NCSoft) will not let a hosted SaaS see their unreleased game design. Electron + bring-your-own-CLI is the pitch.
2. **BYOK story.** "Use the Claude Code CLI on your own machine, no data leaves" only makes sense on a local binary.
3. **Trust premium.** Enterprise contracts at $25K–$75K/year (the highest ARPU you have) require on-prem availability.

### 4.3 Why the Unity plugin matters more than either

Web vs desktop is a distribution decision. The Unity plugin is the **product** decision. A web SaaS without the Unity plugin is Ludo AI — a $20/mo commodity. A web SaaS *with* a paid, working, two-way-synced Unity plugin is **the AI design layer for shipped games on the dominant engine**, and that is what gets bought at $50M+.

**Don't optimize the form-factor debate. Ship the plugin.**

---

## 5. Enhanced valuation — after Tier-1 modifications

Assume you execute §3.1 (Unity v1), §3.2 (5 Pro modules), §3.3 (cloud production-grade), §3.4 (brand/trademark) over 12–18 months, then §3.5 (collab) and §3.6 (marketplace) over the next 6.

### 5.1 SaaS ARR (Year 3, post-enhancement)

| Line item | Year-3 ARR |
|---|---|
| Indie subscriptions ($29/mo × 1,800) | $626K |
| Studio seats ($79/seat × 1,750 weighted) | $1.66M |
| Enterprise self-host ($40K+ × 25 logos) | $1.10M |
| Managed inference markup (70% GM) | $700K |
| Unity Asset Store plugin ($149 × 8,000 + $9/mo × 1,500) | $1.36M |
| Pro module attach ($79 avg × 6,500 attaches) | $510K |
| Marketplace take-rate (10–20% of $200K GMV) | $30K |
| **Total** | **~$6.0M** (range $3M – $8M) |

### 5.2 Multiples → enterprise value

At 2026 SaaS comps (sources at bottom):

| Profile | Multiple | EV @ $6M ARR |
|---|---|---|
| Bootstrapped, moderate growth, no premium metrics | 4.5x | **$27M** |
| Equity-backed, NRR > 110%, Rule of 40 > 40 | 6–7x | **$36M – $42M** |
| Competitive auction with strategic interest, NRR > 130% | 8–10x | **$48M – $60M** |
| Top 5% of comps (60%+ growth, NRR 130%+, multiple strategic bidders) | 10–12x | **$60M – $72M** |

### 5.3 Strategic buyer table (post-enhancement)

| Buyer | Motivation | Realistic range |
|---|---|---|
| **Unity** | Defensive — kill the AI-design-to-Unity threat by absorbing it. Same playbook as ProBuilder ($5–15M est., 2018), Pixyz, Bolt. | **$15M – $50M** |
| **Roblox** | Wants AI-assisted creation tools for UGC creators; 100M+ creators on platform. | **$20M – $80M** |
| **Epic Games** | Unreal AI-tooling bolt-on; cross-engine creator funnel; aligns with Quixel/MetaHuman strategy. | **$15M – $40M** |
| **Krafton / NetEase / Tencent / NCSoft** | Studio-internal IP + acqui-hire of an applied-AI gaming team. | **$8M – $25M** |
| **Adobe** | Overlap with Substance + Mixamo, but possible if you frame it as "Figma for game design." | **$20M – $60M** |
| **Anthropic / OpenAI** | Unlikely direct acquirer; possible licensing/partnership at $5–15M annual revenue commitment. |  |

**Realistic post-enhancement sale range: $15M – $80M** at $3M–$6M ARR.

### 5.4 The aspirational ceiling (4–6 years, with Series A/B)

If you become **the** category leader for AI game design:

- $20M – $50M ARR × 8–12x multiple = **$200M – $600M valuation**.
- Inworld AI is the comp: [$500M valuation, August 2023, $120M raised](https://venturebeat.com/games/inworld-ai-raises-new-round-at-500m-valuation-for-ai-game-characters/), focused on AI characters rather than full design.
- This requires: ~$20M+ of venture funding, 4–6 years of compounding execution, real category creation, and either a competitive auction or an IPO window.

This is what `THE_500M_PROMPT.md` describes. It is achievable but requires a *different* operating mode than bootstrapping — VC dilution, an exec team, a real GTM machine, and surviving the [Unity AI Generators](https://unity.com/features/ai) free-with-subscription strategy.

---

## 6. Risks that can kill the number

| Risk | Severity | Mitigation |
|---|---|---|
| **Unity ships native AI design tools** (already happening — Unity AI Generators is free with sub) | High | You have a 12–18 month window. Ship the plugin in months 1–4. Get to 1,000 paying plugin users before Unity catches up. |
| **Apache-2.0 means anyone (including Unity, including a competitor) can fork the open core** | Structural | Move 70%+ of value into closed-core modules within 18 months. Ship Pro modules. Make the brand + customer base + plugin the moat, not the code. |
| **Rosebud AI / Inworld / Ludo raise faster and out-distribute** | Medium | Pick a wedge they don't own: the Unity Editor integration. None of them ship a real Editor plugin today. |
| **BYOK ceiling caps revenue** | Medium | §3.3 — managed-inference tier. Without this, every $200 of Anthropic tokens your user spends is $0 to you. |
| **Closed-source modules stay at 28% complete** | Existential | This is the only one fully in your control. If you do not finish, the valuation is $1M–$3M, period. |
| **You write the deck before you write the product** | Medium | The two existing docs (`THE_500M_PROMPT.md`, `VALUATION_AND_ROI_PLAN.md`) are excellent. They are *plans*. A buyer pays for *artifacts*, not plans. |

---

## 7. 12-month execution plan (concrete)

| Month | Workstream | Deliverable |
|---|---|---|
| **M1** | Brand, trademark, domain, GitHub org. Move 8 closed repos under `@greybox-studio`. Author every commit under your name from today. | Trademark filed; `.studio` domain bought; org live. |
| **M1–M3** | Unity plugin v1 — real `PrefabBuilder`, `ArtBibleImporter`, `HudLayoutImporter`, `LevelBoardImporter`. Real tests. One paid sample (2D Platformer) installs in 30 s. | Alpha submission to Unity Asset Store. |
| **M3–M4** | Cloud production-grade: metered billing, real region enforcement, durable SCIM. First enterprise pilot signed. | Managed-inference SKU live. |
| **M2–M5** | Pro modules 1–4 authored, encrypted, hosted with signed-URL distribution. Entitlement validation tested. | First $50K of Pro revenue. |
| **M4–M6** | Unity plugin v1.1 — round-trip three-way merge. MCP bridge passing Anthropic's MCP test suite. | First 500 plugin sales. |
| **M5–M8** | Real-time collaboration (Yjs). Multi-cursor, comments, presence. | Studio tier 5-seat minimum live. |
| **M6–M9** | Marketplace payouts working end-to-end. First 25 creators paid. | $50K GMV. |
| **M8–M10** | Unreal plugin v1 alpha (gated on Unity hitting 1,000 paying users). | Asset store submission. |
| **M9–M12** | Either: (a) raise Series A at $30M–$60M post on $1M–$2M ARR, or (b) continue bootstrapping toward $3M ARR for a year-3 strategic exit. | Funding decision made. |

The order matters more than the dates. Plugin → cloud margin → Pro modules → collab → marketplace. Anything that doesn't serve that sequence is a distraction.

---

## 8. Final answers to the two questions you actually asked

**"If I execute it as a SaaS, should I make it a desktop app or a web app?"**

Both, web-first. Web is the front door (better multiples, distribution, collaboration). Electron desktop is the trust layer for enterprise + the BYOK story. **But neither matters as much as the Unity Editor plugin** — that is the moat and the thing a buyer will pay for. Web for users, desktop for enterprise, Unity plugin for the exit.

**"How much money can I sell this for?"**

| Stage | Realistic sale value |
|---|---|
| **Today, as-is** (28% closed-source completion) | **$500K – $3M** (acqui-hire) |
| **After Tier-1 enhancements** (Unity v1 + Pro modules + cloud margin + brand) at $3M–$6M ARR | **$15M – $80M** strategic |
| **Category-leader ceiling** (4–6 years, $20M–$50M ARR, IPO-track) | **$200M – $600M+** |

**The single decision that moves the number the most:** ship the Unity plugin to a real v1.0 in the next 12 weeks. Everything else is either subordinate to that or worthless without it.

---

## 9. Sources

**SaaS multiples & valuation methodology:**
- [Public Software Valuation Multiples — May 2026 (multiples.vc)](https://multiples.vc/insights/software-saas-valuation-multiples)
- [SaaS Valuation Multiples 2015–2026 (Aventis Advisors)](https://aventis-advisors.com/saas-valuation-multiples/)
- [SaaS Valuation Multiples 2026: $1M–$5M ARR (Breakwater M&A)](https://www.breakwaterma.com/blog/saas-valuation-multiples-2026-1m-5m-arr)
- [SaaS Valuation Multiples 2026 (Livmo)](https://livmo.com/blog/saas-valuation-multiples-2026/)

**Game-tools market sizing:**
- [Game Development Tools Market — $555M in 2026, $1.5B by 2035 (Market Growth Reports)](https://www.marketgrowthreports.com/market-reports/game-development-tools-market-102115)
- [Game Engines & Development Software Market — $6.33B in 2026 (Business Research Insights)](https://www.businessresearchinsights.com/market-reports/game-engines-and-development-software-market-105475)
- [Indie Game Market 2026 (Mordor Intelligence)](https://www.mordorintelligence.com/industry-reports/indie-game-market)

**Direct competitor / comp data:**
- [Rosebud AI on Crunchbase — $9.2M raised, $15M Series A Oct 2024](https://www.crunchbase.com/organization/rosebud-ai)
- [Rosebud AI Series A coverage (Leads on Trees)](https://www.leadsontrees.com/news/breaking-boundaries-rosebud-ai-secures-15m-in-series-a-funding-for-game-changing-ai-platform)
- [Inworld AI — $500M valuation, $50M round (VentureBeat, Aug 2023)](https://venturebeat.com/games/inworld-ai-raises-new-round-at-500m-valuation-for-ai-game-characters/)
- [Inworld AI on PitchBook](https://pitchbook.com/profiles/company/483614-92)
- [Ludo AI pricing](https://ludo.ai/pricing)

**Unity ecosystem benchmarks:**
- [Unity Asset Store top sellers — Procedural Worlds ~$1M/year (Market Clarity)](https://mktclarity.com/blogs/news/top-unity-stores)
- [Unity Asset Store revenue guide 2026 (Generalist Programmer)](https://generalistprogrammer.com/tutorials/unity-asset-store-selling-guide-revenue)
- [Unity acquires ProBuilder, makes it free (CG Channel, 2018)](https://www.cgchannel.com/2018/02/unity-now-comes-with-probuilder-built-in-for-free/)
- [Unity AI features](https://unity.com/features/ai)
- [Unity-MCP reference (IvanMurzak)](https://github.com/IvanMurzak/Unity-MCP)

**Figma / category-leader comp:**
- [Adobe to Acquire Figma (Adobe news, 2022)](https://news.adobe.com/news/news-details/2022/Adobe-to-Acquire-Figma/default.aspx)
- [Figma — Wikipedia](https://en.wikipedia.org/wiki/Figma)

**License / IP basis:**
- [Apache 2.0 commercial use (FOSSA)](https://fossa.com/blog/open-source-licenses-101-apache-license-2-0/)

**Internal repo references:**
- `open-design/README.md` — open-core feature surface and architecture
- `open-design/AGENTS.md` — module boundary contracts
- `THE_500M_PROMPT.md` — founder's strategic plan (May 15)
- `VALUATION_AND_ROI_PLAN.md` — earlier valuation focused on open-core only (May 15)
- Per-module READMEs: `greybox-unity-plugin/`, `greybox-cloud/`, `greybox-marketplace/`, `greybox-playtest/`, `greybox-pro/`, `greybox-unreal-plugin/`, `greybox-godot-plugin/`, `greybox-brand/`
