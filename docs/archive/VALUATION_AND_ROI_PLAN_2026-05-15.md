# AI Game Design Studio — Valuation & ROI Plan

**Project under review:** `/Users/soumyadebnath16/Developer/game desine/open-design`
**Git remote:** `https://github.com/nexu-io/open-design.git`
**License:** Apache-2.0
**Date of analysis:** May 15, 2026
**Scope:** Honest valuation if shipped as-is; modifications required to maximize sale value; web vs. desktop recommendation.

---

## 0. Executive summary (read this first)

You asked for a number. Here are the honest numbers, and then the report explains how I got there.

| Scenario | One-time license (perpetual seat) | SaaS ARR — realistic year-3 | Strategic acquisition value |
|---|---|---|---|
| **Ship as-is, today** | $0 effective (Apache-2.0; anyone can fork) | $80K – $400K ARR | $250K – $2M (acqui-hire only) |
| **After "Tier-1" enhancements** (Unity Editor plugin + first-party AI margin + closed-source pro modules + collaboration) | $199 – $499 perpetual desktop license; $999 – $4,999 studio site license | $1.5M – $8M ARR | $15M – $80M (strategic to Unity / Roblox / Epic / Krafton) |
| **Aspirational ceiling** (Inworld-class category leader for AI game design) | n/a (pure SaaS) | $20M – $50M ARR | $200M – $500M+ |

**The blunt truth up front:** the codebase you're holding is a fork of an Apache-2.0 open-source project (`nexu-io/open-design`, itself a downstream fork of three other OSS projects), with 534 commits from 167 contributors over ~3 weeks. **You do not own the IP.** Anyone — including Unity itself — can fork it tomorrow. You can absolutely run a profitable SaaS on top of it (Confluent on Kafka, Databricks on Spark do exactly this), but the valuation lever is **what proprietary value you stack on top of the open core**, not the open core itself.

**Form factor recommendation: Hybrid — web SaaS as the primary surface, with a thin Electron desktop wrapper for the "agent runs on your laptop" story and a Unity Editor extension as the killer differentiator.** The codebase already supports all three; the question is which one you market as the front door. Web wins for distribution and valuation multiples.

---

## 1. What this codebase actually is

I read the top-level architecture, walked `apps/`, `packages/`, `craft/`, `skills/`, `templates/`, `game-art-bibles/`, and the engine-export pipeline. Here's the ground truth, not the marketing.

### 1.1 Product summary

`ai-game-design-studio` (package name; brand "AI Game Design Studio" / `agds`) is a **local-first AI orchestration shell for game pre-production**. It does not contain an AI model. Instead it:

1. Scans your `PATH` for **16 supported coding-agent CLIs** (Claude Code, Codex, Devin, Gemini CLI, Cursor Agent, OpenCode, Qwen, Qoder, Copilot CLI, Hermes, Kimi, Pi, Kiro, Kilo, Mistral Vibe, DeepSeek TUI). Whichever ones you have installed become the design "engine."
2. Falls back to a **BYOK proxy** (`/api/proxy/{anthropic,openai,azure,google}/stream`) if no CLI is found. SSRF-blocked at the daemon edge.
3. Wraps the chosen agent in a **prompt stack** = Discovery brief + identity charter + active `DESIGN.md` (game art bible) + active `SKILL.md` + project metadata + skill side files.
4. Spawns the agent in a per-project `cwd` under `.agds/projects/<id>/`, gives it real `Read`/`Write`/`Bash`/`WebFetch` against that folder, and parses the `<artifact>` output into a sandboxed iframe preview.

### 1.2 What it produces

| Surface | Output format | Production-ready? |
|---|---|---|
| Playable concept | Single-file HTML game in a sandboxed `<iframe>` | Prototype only |
| Mobile / desktop game UI flow | HTML with device frames | Mockup |
| Game HUD system | HTML | Mockup |
| Level design board | HTML | Diagram |
| Game art bible | Markdown `DESIGN.md` + swatch grid | Yes |
| Pitch / GDD deck | HTML deck → PDF / PPTX | Yes |
| Key art / character / environment | PNG (via gpt-image-2 / Azure / OpenAI) | Yes |
| Trailer beats | MP4 (via Seedance 2.0 / HyperFrames HTML→MP4) | Yes |
| Audio kit | Music loops, UI SFX, ambience prompts (audio file) | Prompts → audio |
| **Engine runtime hooks** | **Unity `.cs` MonoBehaviour, Godot `.gd`, Unreal `.h`/`.cpp`** | **Thin scaffold** (572 LOC generator) |

### 1.3 The "drops directly on Unity" claim — reality check

You said the studio designs things "that can be directly dropped on Unity." After reading `apps/daemon/src/game-engine-runtime.ts` (572 lines) and the `/api/projects/:id/game-engine-runtime` endpoint in `server.ts`, here's what actually exists:

- **What it does:** Takes a `.gameview.json` document from the project and emits a single `AGDSGameViewRuntime.cs` `MonoBehaviour` (or `.gd` script for Godot, or `.h`/`.cpp` for Unreal) containing terrain zones, sculpt patches, faction territory, dynamic events, and tick advancement.
- **What it does NOT do:**
  - No `.unitypackage` builder.
  - No prefab serialization (no `.prefab` YAML emission).
  - No `ScriptableObject` asset generation (`.asset` files).
  - No FBX / USD / glTF mesh export.
  - No Unity Editor extension (no C# editor scripts, no `UnityEditor` namespace).
  - No Unity package manager (`com.studio.agds`) listing.
  - No materials, animations, animator controllers, Timeline assets, Addressables.
- **Honest characterization:** It is a **terrain/world-tick scaffold generator**, not a Unity pipeline. A Unity developer would have to manually drop the file into `Assets/`, attach the component, wire references, and write all the actual gameplay glue themselves.

**For the "drop into Unity" promise to be real, see §5 enhancements.**

### 1.4 Architecture & footprint

```
~223,583 lines of TypeScript across apps/ + packages/
108 .ts files in apps/daemon/src
132 .ts/.tsx files in apps/web/src
86  .ts files in packages/
44  skill files
49  craft rule files
166 game-art-bible files
21  starter templates
```

Stack:
- **Frontend:** Next.js 16 App Router + React 18 (`apps/web`)
- **Daemon:** Node 24 + Express + SSE + `better-sqlite3` (`apps/daemon`, ~10,452 LOC in `server.ts` alone)
- **Desktop shell:** Electron with sidecar IPC (`apps/desktop`, `apps/packaged`)
- **Contracts:** Pure TypeScript `packages/contracts`
- **Sidecar:** Generic process control (`packages/sidecar`, `packages/sidecar-proto`, `packages/platform`)

This is a serious, well-engineered codebase. The boundaries in `AGENTS.md` (no `apps/web → apps/daemon/src` imports, contracts package must stay pure TS, sidecar stamps must have exactly five fields) read like a senior architect wrote them. The maintainability is high.

---

## 2. The legal/IP context that determines every number below

| Fact | Implication |
|---|---|
| License is **Apache-2.0** | You can sell SaaS, modify, sublicense; you cannot stop a competitor (or Unity) from forking and outcompeting you on distribution. |
| Project is a **fork of `nexu-io/open-design`** | Upstream may change direction, fork may diverge, naming conflicts possible. |
| Upstream is itself a fork of `huashu-design`, `open-codesign`, `multica` | The "core" intellectual property is community-distributed across 3-4 lineages. |
| **167 unique contributors, 534 commits, 151 in the last 7 days** | This is an actively maintained community project, not a solo work. You don't own the velocity; if you stop contributing upstream, you fall behind. |
| **Your local git status:** lots of `M` modifications, no commits authored by you | You currently hold a working-copy customization, not a brand or a fork. |
| **BYOK model** — users pay OpenAI/Anthropic directly | You earn $0 margin on every token spent in your product. This is the single biggest revenue ceiling. |

**What this means for valuation:**

- A buyer paying you for "the codebase" is paying ~$0 for the code (they can fork it for free) and 100% of their offer for: **brand, distribution, customer base, proprietary additions, and the team**.
- One-time license sales on the open core itself are non-viable; perpetual licenses must be on **closed-source pro modules** you build on top.
- The most valuable thing you can do in week 1 is start authoring commits under your own name and identity (so there's a "founder of the commercial fork" narrative for any future buyer).

---

## 3. Web vs. desktop vs. hybrid — recommendation

### 3.1 What the codebase already supports

- `apps/web` (Next.js 16) — the studio shell, deployable to Vercel.
- `apps/desktop` (Electron) — discovers the daemon URL via sidecar IPC.
- `apps/packaged` (Electron entry) — owns the `agds://` URL scheme; macOS Apple Silicon and Windows x64 builds via `pnpm tools-pack`.
- `deploy/` (Docker Compose) — single-container deployment, port 7456, `agds_data` volume.

So you have all three form factors **already built**. The only question is product positioning.

### 3.2 Recommendation: **hybrid, web-first, with a Unity Editor extension as the spear-tip**

**Primary surface: Hosted web SaaS** (Vercel + a managed daemon-as-a-service). Reasons:
1. **Distribution.** A URL is ten thousand times easier to share than a desktop installer for indie devs, students, and game-jam teams (your highest-volume top of funnel).
2. **Conversion analytics.** You instrument signup → first-artifact → save → upgrade. With desktop you fly blind.
3. **Multiplayer collaboration.** A Figma-style "two designers in the same project" feature only makes sense on the web.
4. **Higher SaaS multiples.** Pure SaaS comps trade at 4.8–10x ARR; desktop-licensed software trades at 2-4x revenue. (See [Public SaaS multiples — May 2026](https://multiples.vc/insights/software-saas-valuation-multiples) and [Breakwater M&A 2026 multiples](https://www.breakwaterma.com/blog/saas-valuation-multiples-2026-1m-5m-arr).)

**Secondary surface: Electron desktop** for the "the agent runs on your laptop, your code never leaves" pitch. Keep building it because:
1. Studio buyers (Krafton, NetEase, Gameloft, indie publishers) require on-prem for IP-sensitive projects.
2. It's the only way to ship the "BYOK with your local Claude Code CLI" loop the README is built around.
3. It's the *trust layer* that justifies premium enterprise pricing.

**Spear-tip: Unity Editor extension** (proprietary, closed-source, sold separately on the Asset Store). This is the differentiator that turns "another AI design tool" into "the missing AI design layer for Unity." See §5.1.

### 3.3 What you should NOT do

- Do not ship desktop-only — you cap your top-of-funnel and lose collaboration revenue.
- Do not ship web-only — you lose the BYOK/local-CLI story and the on-prem enterprise tier.
- Do not ignore Unity — every other surface (HTML prototype, art bible, pitch deck) is a commodity in a market full of competitors. Unity integration is your moat.

---

## 4. As-is valuation (no enhancements)

These numbers assume you ship the codebase substantially as-is — clean up the brand, host it, add Stripe, write docs. No new engineering moats.

### 4.1 SaaS ARR scenario (as-is)

**Pricing tiers** (modeled on Ludo AI's published prices; see [Ludo.ai](https://ludo.ai/)):

| Tier | Price | Limits | Target |
|---|---|---|---|
| Free | $0 | 5 projects, watermarked exports, BYOK only | Acquisition |
| Indie | $19 / mo | Unlimited projects, no watermark, full export | Solo devs, jammers |
| Studio | $99 / mo per seat | Team workspace, 5 seats min, priority queue | Indie studios (3–25 ppl) |
| Enterprise | $20K+ / yr | On-prem desktop, SSO, custom skills, support SLA | 100+ headcount studios |

**Conversion model** (conservative; based on [Indie game stats 2026](https://gitnux.org/indie-game-industry-statistics/) ~250K active indie devs globally and typical 1–2% paid conversion for dev tools):

| Year | Free signups | Indie paid | Studio seats | Enterprise | ARR |
|---|---|---|---|---|---|
| Year 1 | 8,000 | 80 ($18.2K) | 25 ($29.7K) | 1 ($25K) | **~$73K** |
| Year 2 | 25,000 | 350 ($79.8K) | 120 ($142.5K) | 4 ($110K) | **~$332K** |
| Year 3 | 60,000 | 900 ($205.2K) | 320 ($380.2K) | 10 ($280K) | **~$865K** |

**As-is realistic year-3 ARR: $80K – $400K** (the higher end requires very strong content marketing and a viral moment; the conservative midpoint is ~$300K).

### 4.2 One-time perpetual license (as-is)

Effectively **$0** as a defensible business. Apache-2.0 makes it impossible to charge for the open core itself — any buyer can clone the GitHub repo for free.

You *could* sell a "managed install + 1 year of support" package at $2K–$10K to enterprise studios that don't want to self-host. Realistic volume: 5–20 contracts/year = $10K–$200K/year. This is consulting revenue, not product revenue, and it does not generate enterprise value.

### 4.3 Strategic acquisition (as-is)

A buyer would value:
- The brand, domain (`ai-game-design.studio`), and any customer accounts you've signed → **$0–$500K.**
- The team's deep familiarity with this codebase + adjacent agent-tooling expertise → **$200K–$1.5M acqui-hire** (1–3 engineers × $150K–$500K each).
- The IP itself → **$0** (Apache-2.0).

**As-is acquisition range: $250K – $2M, almost entirely an acqui-hire.** No buyer is paying a strategic premium for an open-source fork they could clone in a weekend.

### 4.4 Why these numbers are low

The competitive set is brutal:
- **Rosebud AI** raised a $15M Series A in October 2024 (a16z, Khosla, Animoca; total funding $9.2M+) for a comparable AI-game-creation product. ([Crunchbase](https://www.crunchbase.com/organization/rosebud-ai))
- **Inworld AI** is at a **$500M valuation** with $120M raised for AI game characters. ([VentureBeat, August 2023](https://venturebeat.com/games/inworld-ai-raises-new-round-at-500m-valuation-for-ai-game-characters/))
- **Unity itself** ships [Unity AI Generators](https://unity.com/features/ai) free with subscription — direct prefab/animation generation built into the editor. This is the existential threat.
- **Ludo AI** charges $20/mo Indie and $300/mo Studio with the brand and SEO advantage of a ~3-year head start.

You are walking into a $5.5B indie market ([Mordor Intelligence](https://www.mordorintelligence.com/industry-reports/indie-game-market)) with no proprietary moat, against funded incumbents and the engine vendor itself.

---

## 5. Modifications to maximize ROI (ranked by valuation impact)

Each item below is scored on **valuation lift × execution cost**. Build them in this order.

### 5.1 [Tier-1, MUST-DO] Real Unity Editor extension as a closed-source paid plugin

**What:** A C# Unity package (`com.aigds.studio`) installed via Package Manager that:
- Connects to a running AGDS daemon (local or hosted).
- Exposes `AGDS Studio` window inside the Unity Editor (like JetBrains Rider's panel).
- One-click **import** of a generated `.gameview.json` as a real prefab tree, with `MonoBehaviour` references wired, `ScriptableObject` assets created in `Assets/AGDS/Generated/`, and Addressables labels applied.
- Two-way sync: edit in AGDS web → the editor refreshes; tweak in Unity → AGDS sees the diff.
- Optional MCP bridge so Claude Code / Cursor can call Unity tools directly (model after [IvanMurzak/Unity-MCP](https://github.com/IvanMurzak/Unity-MCP)).
- Sold separately on the Unity Asset Store ($79–$199 perpetual; $9/mo subscription).

**Why it's #1:**
- It's the **single feature that converts "another AI design tool" into "AI design tool that actually ships into Unity."**
- The Unity Asset Store is the single highest-intent distribution channel for game devs (Unity has ~5M users, [82% of indies use it as primary engine](https://gitnux.org/indie-game-industry-statistics/)).
- A closed-source C# plugin is **not subject to Apache-2.0** because you wrote it from scratch — this becomes your defensible IP.
- A Unity Editor plugin is the kind of feature Unity itself buys ([Unity acquired ProBuilder in 2018](https://www.cgchannel.com/2018/02/unity-now-comes-with-probuilder-built-in-for-free/)).

**Effort:** 3–5 months of one senior C# engineer + one TS engineer.
**Valuation lift:** **+10x – 20x** on acquisition value (you go from "fork of OSS" to "the AI-design-to-Unity bridge"). Minimum $5M strategic floor; up to $50M+ if Unity wants to defensively acquire.

### 5.2 [Tier-1, MUST-DO] First-party AI inference as a margin tier

**What:** Keep BYOK as the free/Indie default (it's a great trust story), but add a **"Studio Cloud"** tier where AGDS proxies inference through your own Anthropic / OpenAI / Bedrock contract at marked-up rates ($0.05/1K tokens vs. $0.015 wholesale = 70% gross margin).

**Why:** BYOK is your **revenue ceiling.** Every token your users spend goes to Anthropic, not you. If a Studio user burns $200/mo of Claude tokens, you make $0 today; with managed inference you'd make $140/mo in gross profit on top of the seat price.

**Effort:** 4–6 weeks (the proxy already exists; you just add metering, billing, rate limiting, and a token-bucket SLA tier).
**Valuation lift:** **+3x – 5x** on SaaS ARR multiple (managed-inference SaaS comps trade at higher multiples than pure subscription because COGS-to-revenue scales better).

### 5.3 [Tier-1, MUST-DO] Closed-source "Studio Pro" modules as a commercial overlay

**What:** Build the next generation of `skills/` and `game-art-bibles/` as **closed-source, license-key-gated** modules:
- Pro art bibles for hot genres (e.g., Soulslike, Survival Crafting, Hero Shooter) with proprietary palettes and asset packs.
- Pro skills (procedural quest generator, monetization simulator, store-listing optimizer, Steam Next Fest planner).
- Pro engine targets (Unity full prefab export, Unreal Blueprint export, Godot scene tree export).

These ship as **encrypted bundles** loaded by the daemon when a license key is present. The Apache-2.0 license does not infect modules you ship separately.

**Effort:** Ongoing — ship 1 pro module/month.
**Valuation lift:** Builds the **NRR (net revenue retention)** that pushes you into the 7–9x ARR multiple band ([Breakwater M&A](https://www.breakwaterma.com/blog/saas-valuation-multiples-2026-1m-5m-arr)).

### 5.4 [Tier-2, SHOULD-DO] Real-time collaboration (Figma for game design)

**What:** Multi-cursor presence, comments anchored to artifacts, version history, branch/merge on `DESIGN.md`. The Yjs CRDT model used by Figma works here.

**Why:** Game design is a team sport (designer + artist + producer). Single-player tools are commodities; multi-player tools are platforms. Figma sold for $20B because of collaboration, not because it was a better Sketch. ([Adobe-Figma deal background](https://news.adobe.com/news/news-details/2022/adobe-to-acquire-figma); Figma later IPO'd at $57B+ market cap in July 2025.)

**Effort:** 4–6 months of one senior frontend engineer + one realtime-infra engineer.
**Valuation lift:** Unlocks Studio and Enterprise tiers (5+ seat minimums double effective ARPU). +2x – 3x on ARR.

### 5.5 [Tier-2, SHOULD-DO] Asset-store / marketplace surface

**What:** Let designers **sell** the art bibles, skills, templates, and HUD packs they create on AGDS. You take 15–30% of every transaction (Unity Asset Store takes 30%; Roblox Marketplace takes 30%).

**Why:** Marketplace revenue is the highest-multiple revenue in software (GitHub, Shopify, Roblox). Even at 100 sellers averaging $500/yr in sales, that's $50K GMV → $15K take-rate, but the **multiple** on marketplace revenue is 10–15x vs. 5–7x for subscription.

**Effort:** 3–4 months. Requires Stripe Connect, content moderation, payouts.
**Valuation lift:** Reframes the company from "tool" to "platform." +2x on multiple at exit.

### 5.6 [Tier-3, NICE-TO-HAVE] Direct publishing pipelines

**What:** One-click publish to itch.io, Steam Workshop, Google Play (for the playable HTML prototype packaged as a PWA), and Roblox (if you add Lua export).

**Why:** Closes the loop for the Indie tier ("design AND ship"). Mostly a marketing feature — gives you a great demo video.

**Effort:** 1–2 months per platform.
**Valuation lift:** Marginal on its own; multiplicative when paired with §5.4 (collaboration) and §5.5 (marketplace).

### 5.7 [Tier-3, DO LATER] Domain-specific verticals

**What:** Specialized variants for narrative games, hyper-casual mobile, live-ops sims, educational games. Each has its own pricing page, art bibles, skills, and marketing site.

**Why:** Verticalization is the standard play for SaaS to escape commodity pricing (think Ramp vs. Brex vs. Mercury).

**Effort:** Ongoing.
**Valuation lift:** Helps with category creation — important once you cross $5M ARR.

### 5.8 [Critical foundation, do in week 1] Brand, domain, trademark

**What:** Pick a brand name that is NOT "AI Game Design Studio" (too generic, conflicts with upstream). Buy the .com. File a trademark in your jurisdiction. Register the org. Author every commit going forward under your name and a company GitHub org.

**Why:** A trademark and clean brand is the only thing a buyer can actually exclusively own. Without it, the acquisition story is "we're hiring you and your two friends," not "we're buying a company."

**Effort:** 1–2 weeks + ~$2K legal.
**Valuation lift:** Doubles or triples acquisition value because it makes a deal *closeable.*

---

## 6. Post-enhancement valuation

Assume you execute §5.1, §5.2, §5.3, §5.4, and §5.8 over 12–18 months. (§5.5–§5.7 are accretive but not in the base case.)

### 6.1 SaaS ARR scenario (post-enhancement)

| Tier | Price | Year-3 paid count | Year-3 ARR |
|---|---|---|---|
| Free / BYOK | $0 | 80,000 signups | — |
| Indie | $29 / mo | 1,800 | $626K |
| Studio (5-seat min) | $79 / seat / mo | 250 teams × 7 avg seats = 1,750 | $1.66M |
| Enterprise | $40K+ / yr | 25 logos | $1.1M |
| Managed inference (margin) | 70% GM on $X tokens | Studio + Enterprise users | $700K |
| Unity Asset Store plugin | $149 perpetual + $9/mo | 8,000 perpetual + 1,500 sub | $1.36M |

**Total realistic year-3 ARR: $5.4M** (range $1.5M – $8M depending on execution).

At Q1 2026 SaaS multiples ([multiples.vc](https://multiples.vc/insights/software-saas-valuation-multiples), [Breakwater M&A](https://www.breakwaterma.com/blog/saas-valuation-multiples-2026-1m-5m-arr)):
- Bootstrapped, moderate growth: ~4.8x → **$25M**
- Equity-backed, healthy NRR (>110%): ~7x → **$38M**
- High-growth + competitive process: 10–12x → **$54M – $65M**

### 6.2 One-time perpetual license (post-enhancement)

Now meaningful, because there's a **closed-source Unity plugin** to sell.

- Asset Store plugin (perpetual seat): **$149 – $199** (Unity Asset Store comps: top-100 tools sit in $40–$300 range)
- Studio site license (up to 25 seats): **$2,499 perpetual** + $499/yr maintenance
- On-prem enterprise license: **$25K – $75K** annual subscription (no perpetual — keep recurring)

Realistic mix at year 3: 8,000 plugin perpetuals × $149 + 200 site licenses × $2,499 = **$1.7M one-time license revenue**, attached to the SaaS as a paid add-on.

### 6.3 Strategic acquisition (post-enhancement)

Comparable transactions for context:
- **Rosebud AI** Series A valued at ~$60M post-money (estimated from the $15M raise) for AI game generation. ([Crunchbase](https://www.crunchbase.com/organization/rosebud-ai))
- **Inworld AI** at **$500M** for AI game characters. ([VentureBeat](https://venturebeat.com/games/inworld-ai-raises-new-round-at-500m-valuation-for-ai-game-characters/))
- **Figma** sold to Adobe for **$20B** (later abandoned) and IPO'd at **$57B+** market cap in 2025. ([HubSpot](https://blog.hubspot.com/website/adobe-figma-buyout), [Wikipedia](https://en.wikipedia.org/wiki/Figma))
- **Unity acquired ProBuilder** in 2018 for an undisclosed sum (estimated $5–15M) and folded it into the engine. ([CG Channel](https://www.cgchannel.com/2018/02/unity-now-comes-with-probuilder-built-in-for-free/))

**Likely strategic buyers and their motivation:**

| Buyer | Why they'd buy | Likely range |
|---|---|---|
| Unity | Defensive — kill the AI-design-to-Unity threat by absorbing it; same playbook as ProBuilder, Pixyz, Bolt | $15M – $50M |
| Roblox | Wants AI-assisted creation tools for UGC creators | $20M – $80M |
| Epic Games | Bolt-on for Unreal AI tooling; cross-engine creator funnel | $10M – $40M |
| Krafton / NetEase / Tencent | Studio-internal IP + acqui-hire of a strong applied-AI team | $8M – $25M |
| Adobe | Less likely — overlaps with Substance + Mixamo, but possible | $20M – $60M |
| Anthropic / OpenAI | Unlikely direct buyer — but a "Claude-native game design studio" framing could earn a partnership/licensing deal worth $5–15M ARR |

**Realistic post-enhancement acquisition range: $15M – $80M** at $3–6M ARR run rate.

### 6.4 Aspirational ceiling

If you become **the** category leader for AI game design — meaning you cross $20M ARR with strong NRR, build a real moat (collaboration + marketplace + Unity/Unreal/Godot exports), and get a competitive auction — you're in Inworld territory.

- $20M – $50M ARR × 10–12x = **$200M – $600M valuation.**
- This requires 4–6 years of compounding execution, $20M+ of venture funding, and a real category-defining brand.

---

## 7. Recommended execution sequence

| Quarter | Focus | Goal |
|---|---|---|
| **Q1** | Brand + domain + trademark; rebrand the codebase; ship hosted SaaS at `<your-brand>.com`; Stripe + auth + free/Indie tiers | First 50 paying users; $5–15K MRR |
| **Q2** | Unity Editor plugin v1 (one-way import) on the Asset Store; managed-inference pricing tier | First 500 plugin sales; first $100K ARR |
| **Q3** | Closed-source Pro modules (3 art bibles + 2 skills + Unity prefab full export); Enterprise SSO + on-prem desktop tier | First 2 Enterprise contracts |
| **Q4** | Real-time collaboration v1; bi-directional Unity sync; first Y Combinator-style metrics deck | Crossing $1M ARR run rate |
| **Year 2** | Marketplace; Unreal plugin; vertical pricing; raise Series A on these metrics | $3–5M ARR; raise at ~$30–60M post |
| **Year 3** | Scale GTM; expand to console/AAA; either acquire competitors or position for exit | $5–8M ARR; entertain $30M+ strategic offers |

---

## 8. Bottom line

| Question | Answer |
|---|---|
| **If I ship as-is, what is it worth?** | $80K–$400K ARR by year 3; $250K–$2M acqui-hire. The Apache-2.0 fork has no defensible IP. |
| **Web or desktop?** | Hybrid. Web SaaS is the front door (better multiples, distribution, collaboration). Electron desktop is the trust layer for enterprise. Unity Editor extension is the moat. |
| **What's the single highest-ROI modification?** | A real Unity Editor plugin (closed-source, paid). Without it, you compete on the same axis as Rosebud AI. With it, you become the AI-design-to-Unity bridge — the kind of company Unity itself buys. |
| **What's the realistic ceiling after all enhancements?** | $5–8M ARR at year 3, valued $30–80M in a strategic acquisition. The aspirational ceiling (Inworld-class) is $200–500M+ if you raise venture and execute for 5+ years. |
| **What's the biggest risk?** | Unity ships their own AI tools natively (already happening — see [Unity AI Generators](https://unity.com/features/ai)). You have a 12–18 month window to establish the bridge before they make it irrelevant. |

The codebase is real and well-engineered, but the business is built or lost on the proprietary layer you stack on top, the brand you create, and the Unity-specific moat you ship in the next two quarters.

---

## Sources

- [Public SaaS Valuation Multiples — May 2026 (multiples.vc)](https://multiples.vc/insights/software-saas-valuation-multiples)
- [SaaS Valuation Multiples 2026: $1M–$5M ARR (Breakwater M&A)](https://www.breakwaterma.com/blog/saas-valuation-multiples-2026-1m-5m-arr)
- [Indie Game Market 2026 (Mordor Intelligence)](https://www.mordorintelligence.com/industry-reports/indie-game-market)
- [Indie Game Industry Statistics 2026 (Gitnux)](https://gitnux.org/indie-game-industry-statistics/)
- [Unity Engine market share (6sense)](https://6sense.com/tech/game-development/unity-market-share)
- [Rosebud AI on Crunchbase](https://www.crunchbase.com/organization/rosebud-ai)
- [Inworld AI raises $50M at $500M valuation (VentureBeat)](https://venturebeat.com/games/inworld-ai-raises-new-round-at-500m-valuation-for-ai-game-characters/)
- [Ludo AI pricing](https://ludo.ai/)
- [Rosebud AI](https://rosebud.ai/)
- [Unity AI features](https://unity.com/features/ai)
- [Unity AI Generators (needle-mirror)](https://github.com/needle-mirror/com.unity.ai.generators)
- [Unity-MCP (IvanMurzak)](https://github.com/IvanMurzak/Unity-MCP)
- [Unity acquires ProBuilder, makes it free (CG Channel, 2018)](https://www.cgchannel.com/2018/02/unity-now-comes-with-probuilder-built-in-for-free/)
- [Adobe to Acquire Figma (Adobe news, 2022)](https://news.adobe.com/news/news-details/2022/Adobe-to-Acquire-Figma/default.aspx)
- [Figma — Wikipedia](https://en.wikipedia.org/wiki/Figma)
- [Apache 2.0 commercial use (FOSSA)](https://fossa.com/blog/open-source-licenses-101-apache-license-2-0/)
- [Open source business models (Palark blog)](https://blog.palark.com/open-source-business-models/)
- [Upstream repo: nexu-io/open-design](https://github.com/nexu-io/open-design)
