# Greybox Studio — Production Launch Plan

**Date:** 2026-05-20
**Source of truth:** `AUDIT_2026-05-20.md` (verified codebase audit)
**Mission:** Take the platform from `~55/100` readiness → `production-grade commercial platform` in the shortest realistic timeline.
**Identity statement (paste into every customer-facing surface):** "Greybox is an AI-native design studio for games. It runs in your browser or on your desktop, generates the design artifacts your game needs (GDD, art bible, level boards, HUDs, prefab graphs, palettes, key art, trailer beats), and **drops them straight into Unity as real engine assets**. It is not an engine. It is not a Unity replacement. It feeds Unity."

---

## 0. Launch Decisions (set in stone before any work begins)

These are the irrevocable choices that shape every other section. Settle them now or the plan collapses.

| Decision | Choice | Why |
|---|---|---|
| **Launch surface** | **Web SaaS primary + Electron desktop + Unity Asset Store plugin** (in that order of marketing emphasis) | Web = SaaS multiples; Desktop = enterprise trust; Plugin = the moat |
| **Launch date target** | **Public beta D+45** (open-design + plugin Unity Verified Solution submission); **GA D+90** (paid SaaS tiers live + first invoiced enterprise pilot) | Matches the 12-18 month Unity-AI competitive window with margin |
| **Pricing live at GA** | Free/BYOK · Indie $29/mo · Studio $79/seat (5-seat min) · Pro à la carte $79-$199 · Enterprise $40K+/yr | Tested by the prior audit's Year-3 ARR model |
| **Single revenue priority** | **Unity Asset Store plugin ($149 one-time + $9/mo subscription)** as the conversion funnel into SaaS tiers | Asset Store gives distribution nobody else has; SKU brings recurring revenue per Unity TOS |
| **One thing the team will not do for 90 days** | **No Unreal/Godot work, no marketplace activation, no real-time collab, no playtest** | Focus or fail. These all gate on Unity hitting 100-1,000 paying customers anyway |
| **Funding posture at launch** | **Bootstrap to first $25K MRR, then $500K-$1.5M SAFE** | Don't dilute on the promise; raise on the revenue |
| **Brand** | Trademark "Greybox" filed week 1, US classes 9/41/42; domains `greybox.studio` (primary), `.com` and `.ai` (defensive); GitHub org rename to `greybox-studio` | Without trademark + domain, every exit is structurally acqui-hire |
| **Team shape at launch** | **Founder + 1 senior C# (Unity plugin) + 1 senior TS (cloud/SaaS) + 1 content author (Pro modules) + 0.25 designer + 0.25 DevOps** = ~3.75 FTE | Smallest team that ships everything below |

---

## 1. Status Quo vs Launch Bar — Per Focus Area

For each of the 20 focus areas: **what exists today, what is required to launch, what's missing, the fix, and effort.** The "Launch bar" column defines done.

### 1. Stability

| Today | Launch bar | Gap | Fix | Effort |
|---|---|---|---|---|
| No SLO defined. Daemon process restarts lose tenant state. `unity-package-builder.ts` builds full tar in memory (~50MB ceiling). | 99.5% web uptime, 99.0% daemon uptime, graceful degradation, durable state | Migrate cloud `TenantStore` + SCIM + audit log to Postgres; stream tar builder to disk; add health checks + autorestart | Postgres migration 2.5w; tar streaming 1w; health checks 0.5w | **4 weeks** |

### 2. Scalability

| Today | Launch bar | Gap | Fix | Effort |
|---|---|---|---|---|
| Single-replica daemon; no rate-limit per inference key; in-memory `Map` for tenants; whole-file snapshot for marketplace | 500 concurrent SaaS sessions; 5 enterprise tenants; 200 plugin downloads/day | Cloud → Postgres + Redis queue; per-key token bucket on inference proxy; CDN for Pro bundles (Cloudflare R2) | Postgres incl. above; Redis + token bucket 2w; R2 + signed URLs 1w | **3 weeks (after Postgres)** |

### 3. Security

| Today | Launch bar | Gap | Fix | Effort |
|---|---|---|---|---|
| 🔴 License prefix-matching fallback (`gbx_indie_*`) bypassable; admin tokens via env, no rotation; no CSP; no secrets scan in CI; iframe `srcdoc` mitigated but unreviewed | All paid-tier requests Ed25519-verified; CSP shipped; gitleaks in CI; quarterly token rotation runbook; one focused review on iframe path | Force `allowPrefixFallback=false` in prod env; wire Ed25519 verification path in `licenses.ts`; add CSP to `next.config.js`; add gitleaks GitHub Action; document rotation; manual review iframe path | 1w license; 0.5w CSP+gitleaks; 0.5w runbook; 0.5w iframe review | **2.5 weeks** |

### 4. Performance

| Today | Launch bar | Gap | Fix | Effort |
|---|---|---|---|---|
| `server.ts` 12K LOC has sync fs reads on hot paths; `FileViewer.tsx` 5,974 LOC re-renders heavily; no per-key inference rate-limit | p95 web TTI <3s; daemon p95 <500ms on cached artifacts; no head-of-line blocking from a noisy customer | Profile + replace sync fs with async; React.memo + virtualization in FileViewer; per-key token bucket (rolls in from §2) | 1w profiling + fs fix; 1.5w FileViewer; rate-limit rolls in | **2.5 weeks** |

### 5. UX Polish

| Today | Launch bar | Gap | Fix | Effort |
|---|---|---|---|---|
| Hardcoded dark theme, no light-mode toggle; 53 @media queries across 55+ components (~3% coverage by component count); 1,662 TODOs in apps/ | Light-mode toggle works; top 20 components mobile-responsive; landing page world-class; designer-credible | Add light theme via CSS variables (token-driven); responsive pass on top 20 components; new landing page; design polish from contract designer (0.25 FTE) | 2w light mode; 3w responsive top-20; 1w landing | **6 weeks** |

### 6. Developer Onboarding

| Today | Launch bar | Gap | Fix | Effort |
|---|---|---|---|---|
| `CLAUDE.md` + `AGENTS.md` exist; no contributor `docs/` quickstart for outside engineers; no recorded screencasts | New contributor productive in 1 day; first commit in 3 days; clean `docs/contributing.md` + 1 screencast | Trim AGENTS.md into public CONTRIBUTING.md; 5-min screencast of "fork → first PR → CI green"; pin good-first-issue labels | 1w | **1 week** |

### 7. Asset Pipeline Reliability

| Today | Launch bar | Gap | Fix | Effort |
|---|---|---|---|---|
| Unity importer 70-75% complete; prefab round-trip safety shipped via sidecar pattern; daemon FBX orchestration absent (P1.1) | A designer can generate a `.gameview.json` and one-click import to Unity 2022.3 / 2023.2 / Unity 6 reliably; round-trip merge works on 5 field types | Ship P0.1.c integration test, P0.2 2D Platformer sample, P1.1 daemon FBX orchestration, P2.2 conflict UI completion | 8 weeks per V1_PUNCHLIST.md (Unity plugin alone) | **8 weeks** |

### 8. Unity Integration Quality

| Today | Launch bar | Gap | Fix | Effort |
|---|---|---|---|---|
| MCP server (1086 LOC, 8 tools); real PrefabBuilder; palette `.asset` export; 20 EditMode tests | Asset Store **Verified Solution** badge; tested on Unity 2022.3 / 2023.2 / Unity 6; 1 published sample (.unitypackage); MCP demo video | Multi-version CI matrix; Verified Solution submission; 2D Platformer sample; demo video + tutorial | 0.5w CI; 1.5w sample; 1w submission + video; rolled in with §7 | **3 weeks** (overlap with §7) |

### 9. Plugin Packaging

| Today | Launch bar | Gap | Fix | Effort |
|---|---|---|---|---|
| `package.json` for UPM exists; `STORE_LISTING.md` drafted; no `.unitypackage` automated build; no asset-store metadata bundle | One-click `make plugin-release` that emits both UPM tarball + Asset Store `.unitypackage`, signed and versioned; LICENSE.md present | GitHub Action: tag → build → sign → attach release; semver discipline; ASSET_STORE_SUBMISSION.md filled out | 1w | **1 week** |

### 10. SaaS Readiness

| Today | Launch bar | Gap | Fix | Effort |
|---|---|---|---|---|
| Stripe Checkout in `routers/billing.ts`; Stripe metering shipped 2026-05-19 (`dryRun` default verified); no user signup UI; no plan-gating UI | Self-serve signup, plan selection, checkout, plan-gated features; failed-payment recovery; receipts | Web app: signup + plan picker + Stripe Checkout redirect + billing portal; daemon: plan-gating middleware against cloud license API | 4w web + 2w daemon + 1w QA | **7 weeks** |

### 11. Enterprise Readiness

| Today | Launch bar | Gap | Fix | Effort |
|---|---|---|---|---|
| WorkOS auth router exists; SCIM JSONL durable; audit-log hash chain; region tag not enforced; no SOC2; no DPA | First pilot can be invoiced: SSO works end-to-end, audit log exports CSV, region enforced, DPA available | Wire SAML happy-path + SCIM provisioning test; add CSV export endpoint; enforce region tag in inference proxy; DPA template with counsel | 3w SSO+SCIM; 1w audit export; 3w region enforce; 1w DPA | **8 weeks (parallel to SaaS)** |

### 12. Marketplace Completion

| Today | Launch bar (GA, not v1.0) | Gap | Fix | Effort |
|---|---|---|---|---|
| ~60-65% impl; `MockStripeConnectProvider`; no refund initiation; no moderation UI; snapshot persistence | **Hidden behind feature flag at launch**; activate only after Unity hits 1K paying customers | Don't ship for launch. Keep contract-stable. Add audit log + Postgres migration when activated. | 0w pre-launch | **DEFER** |

### 13. Monetization Systems

| Today | Launch bar | Gap | Fix | Effort |
|---|---|---|---|---|
| 5-tier pricing modeled but not live; Asset Store SKU not submitted; Pro modules not deeply authored; cloud has Stripe metering wired | Free + Indie + Studio + Pro à la carte live; Asset Store SKU live with $149+$9/mo; 1 Pro module shippable | Wire plan-gating (§10); submit Asset Store; author Soulslike Combat Pack via `pnpm author-module`; stand up cloud `/v1/pro-modules/license-secret` endpoint + R2 CDN | 3w content author; 1w cloud endpoint; 1w R2 | **5 weeks** |

### 14. Billing / Auth / Team Systems

| Today | Launch bar | Gap | Fix | Effort |
|---|---|---|---|---|
| Stripe Checkout, metering, billing-jobs router; WorkOS auth; no team-management UI; no invitation flow; no seat-license enforcement | Studio 5-seat plan works: org owner can invite users, transfer seats, see usage, cancel | Team management UI in web app; seat-license check in cloud (Postgres-backed); invitation email via Postmark/Resend | 4w web; 2w cloud; 1w email infra | **7 weeks (parallel SaaS)** |

### 15. Cloud Infrastructure

| Today | Launch bar | Gap | Fix | Effort |
|---|---|---|---|---|
| File-based persistence; single-region; no managed Postgres; no Redis; no Cloudflare config | Render or Fly.io: 2 daemon replicas + Postgres + Redis + Cloudflare R2 (Pro bundles) + Cloudflare proxy (web); region tag enforced; backups nightly | Terraform or Pulumi config; staging + prod environments; Sentry; Postgres backups; runbooks in `OPERATIONS.md` | 2w IaC; 1w staging; 1w runbooks | **4 weeks (parallel)** |

### 16. CI/CD

| Today | Launch bar | Gap | Fix | Effort |
|---|---|---|---|---|
| No multi-version CI on plugins; basic test workflows on TS repos | Every PR: lint + type-check + unit + integration; tag push → release artifact; Unity matrix (2022.3/2023.2/U6); Unreal matrix later | GitHub Actions: TS repos (pnpm + vitest + playwright); Unity matrix (GameCI or self-hosted runner); release tags signed | 1w TS; 1.5w Unity matrix; 0.5w release tagging | **3 weeks** |

### 17. Telemetry + Analytics

| Today | Launch bar | Gap | Fix | Effort |
|---|---|---|---|---|
| None | Product analytics (PostHog or Mixpanel); SaaS funnel (signup → activation → conversion); plugin install events; opt-in only | PostHog self-hosted or cloud; integrate into web + daemon + plugin; privacy policy + opt-out; document events catalog | 1w integration; 0.5w privacy + opt-out; 0.5w docs | **2 weeks** |

### 18. Crash Reporting

| Today | Launch bar | Gap | Fix | Effort |
|---|---|---|---|---|
| None | Sentry on web, daemon, Electron, plugin (where possible); release tagging; source maps uploaded | Sentry SDK on each surface + release CI; Electron `@sentry/electron`; Unity `Sentry.Unity` package | 1w | **1 week** |

### 19. Documentation

| Today | Launch bar | Gap | Fix | Effort |
|---|---|---|---|---|
| README + CLAUDE.md + AGENTS.md in each repo; PRODUCTION_GAPS, V1_PUNCHLIST internal docs | Public docs site: getting started, Unity integration guide, Pro module catalog, API reference, enterprise FAQ | Docusaurus or Mintlify; auto-generate API ref from OpenAPI; record 3 tutorials (signup → first project → first Unity import) | 2w site; 1w tutorials | **3 weeks** |

### 20. Investor / Demo Polish

| Today | Launch bar | Gap | Fix | Effort |
|---|---|---|---|---|
| `THE_500M_PROMPT.md` strategic doc; `GREYBOX_COMPLETE_ANALYSIS_2026-05-19.md`; AUDIT_2026-05-20.md | 10-slide deck; 90-sec product video; 5-min demo video; financial model XLSX; pre-recorded fallback demo; one-pager | Deck (Figma); video (Descript or Loom + light editing); model (Causal or Google Sheets); fallback recorded with OBS | 2w | **2 weeks** |

**Total focused engineering effort: 50-60 engineer-weeks** = ~12-15 weeks of calendar time with the proposed team of ~3.75 FTE running parallel tracks. Matches the 90-day GA target with a 2-week buffer.

---

## 2. Blocker Triage

### A. Critical Launch Blockers — MUST ship before public beta (D+45) or GA (D+90)

| # | Blocker | Owner | Why critical |
|---|---|---|---|
| L1 | Trademark filing + domain purchase + GitHub org rename | Founder | Without these, every commercial conversation is structurally an acqui-hire and Asset Store listing is risky |
| L2 | Unity plugin v1.0 punchlist (P0.1.b round-trip, P0.1.c integration test, P0.2 2D Platformer sample, P1.1 daemon FBX, P2.2 conflict UI) | Senior C# | The moat. Without it, the platform is "yet another web tool" |
| L3 | Multi-version Unity CI matrix + Verified Solution submission | Senior C# | Asset Store rejects without; "Verified Solution" badge is the conversion lever |
| L4 | Plugin packaging GitHub Action (UPM tarball + Asset Store `.unitypackage` signed release) | Senior C# | One-click release; required for tag-driven distribution |
| L5 | Cloud Postgres migration of TenantStore + SCIM + audit log | Senior TS | File-based persistence loses paying customers' state on restart |
| L6 | Cloud Ed25519 license verification in prod (force `allowPrefixFallback=false`) | Senior TS | Without this, paid tiers are bypassable; security finding #1 |
| L7 | Stripe Checkout end-to-end on web app (signup → plan → checkout → portal) | Senior TS + 0.25 designer | No revenue without it |
| L8 | Web app responsive top-20 components + light-mode toggle | 0.25 designer + 0.5 Senior TS | Tool sold to designers cannot ship dark-only mobile-broken UI |
| L9 | Public docs site (Docusaurus) + 3 tutorial videos | Content + Senior TS | First-touch conversion |
| L10 | Sentry + PostHog wired across web + daemon + plugin | Senior TS | Cannot debug paying customers without this; cannot improve funnel without this |
| L11 | CSP + gitleaks CI + iframe `srcdoc` focused review | Senior TS | Security hygiene table-stakes for any paid customer |
| L12 | First Pro module fully authored (Soulslike Combat Pack) + cloud `/v1/pro-modules/license-secret` endpoint + R2 CDN | Content author + Senior TS | One bundle SKU live = NRR engine proven |
| L13 | 10-slide deck + 90-sec video + financial model XLSX | Founder | Investor pitch fallback |
| L14 | Status page + SLA published (statuspage.io + uptime monitors) | Senior TS | Required by first enterprise pilot |
| L15 | Privacy policy + ToS + DPA template | Counsel + Founder | Required by every paying customer |

**Total: 15 critical blockers, all owned, all sized.**

### B. Post-Launch Improvements — ship D+90 to D+180

| # | Improvement | Justification |
|---|---|---|
| P1 | Real-time collaboration (Yjs) on Studio tier | Studio ARR multiplier; gate-of-entry comp with Figma |
| P2 | TODO triage in open-design (top 200 of 1,662) | Tech-debt narrative for DD |
| P3 | Refactor `server.ts` (split routes); split `FileViewer.tsx` | Recruiting + acquirer DD ergonomics |
| P4 | Test coverage thresholds in open-design (unit + critical-path) | Quality gate |
| P5 | Pro modules 2–6 authored (Hero Shooter, Cozy Sim, Hyper-Casual, Roguelike, Live-Ops) | Catalog depth = attach rate = NRR |
| P6 | Inference proxy multi-provider fallback (Together / Replicate) | Single-provider price/rate-limit risk |
| P7 | Documentation: API reference auto-generated from OpenAPI | DevEx + enterprise reviews |
| P8 | Public roadmap on GitHub Projects | Trust-building with OSS community |
| P9 | Unreal plugin v1.0 — MCP handler dispatch + real importers | Gate: Unity 100 paying customers |
| P10 | Internationalization scaffolding (i18n keys) | Enables Japanese + Korean later |

### C. Enterprise-Only Upgrades — ship D+180 to D+365 (gated on first enterprise pipeline)

| # | Upgrade | Justification |
|---|---|---|
| E1 | SOC2 Type 1 audit ($15-25K, 4-6 months) | Unlocks every deal >$50K |
| E2 | Multi-region deployment (US + EU + APAC) | EU residency requirement |
| E3 | On-prem / air-gapped deployment (Helm chart + offline license) | Defense / regulated finance / large studios |
| E4 | HSM-backed signing for license tokens | Procurement security review |
| E5 | SOC2 Type 2 + ISO 27001 | $500K+ deals |
| E6 | Dedicated CSM tier + 24h SLA | Enterprise expectation |
| E7 | Marketplace activation (Stripe Connect Custom, refund initiation, moderation dashboard) | Gate: Unity 1K paying customers |
| E8 | Godot plugin v1.0 | Gate: Unity 250 paying customers |
| E9 | Federated billing / PO / invoice flow (NetSuite or QuickBooks integration) | Enterprise procurement |
| E10 | Data residency tagging + delete-by-tenant tooling | GDPR right-to-delete |

---

## 3. 30-Day Roadmap (D+1 to D+30) — "Build the launchpad"

**Goal:** Trademark filed, plugin v1.0 in CI, cloud foundations migrating, first Pro module half-authored. Public beta visible to a closed group of 20 design-partner studios.

### Week 1 (D+1 to D+7)

- **Founder:** Engage trademark counsel (US classes 9/41/42); buy `greybox.studio`/`.com`/`.ai`; create GitHub org `greybox-studio`; book domain forwarding; Delaware C-corp formation if not done
- **Senior C#:** Start P0.1.c integration test; begin Unity multi-version CI matrix (GameCI)
- **Senior TS:** Force `allowPrefixFallback=false` env in prod; add CSP headers to `next.config.js`; add gitleaks GitHub Action
- **Content author (joining D+1):** Read `MODULE_1_SCOPE.md`; start Soulslike Combat Pack outline (skill recipes + art direction)
- **0.25 Designer:** Audit FileViewer + ProjectView for theme variables; start light-mode design tokens
- **0.25 DevOps:** Set up Render/Fly staging environment

### Week 2

- **Founder:** Draft pitch deck (10 slides); record 90-sec product video; draft DPA + ToS + privacy policy with counsel
- **Senior C#:** Ship P0.2 2D Platformer sample skeleton; start P1.1 daemon FBX orchestration
- **Senior TS:** Begin Postgres schema for TenantStore + SCIM + audit log; spin up managed Postgres (Neon or Render)
- **Content author:** Author 3 of 6 skill recipes for Soulslike Pack; produce 1 reference encounter
- **Designer:** Theme variables landed in `apps/web/src/index.css`; light-mode CSS drafts
- **DevOps:** Sentry SDK integrated into web + daemon; PostHog wired

### Week 3

- **Founder:** Send 20 design-partner outreach emails; book 5 demo calls; finish financial model XLSX; record 5-min demo video
- **Senior C#:** Plugin packaging GitHub Action (tag → UPM tarball + signed `.unitypackage`); ASSET_STORE_SUBMISSION.md updated; submit to Verified Solution program
- **Senior TS:** TenantStore Postgres migration shipped behind feature flag with shadow-write; CSV export endpoint for audit log
- **Content author:** Finish Soulslike Combat Pack content; encrypt via `pnpm author-module`
- **Designer:** Top-10 components mobile-responsive (Project, FileViewer header, Settings, Sidebar, Modal shell, Toolbar, Tabs, Toast, Form, Empty-state)
- **DevOps:** Postgres backups nightly; status page (statuspage.io) live with daemon + web monitors

### Week 4

- **Founder:** Run 5 design-partner demos; collect feedback; begin private beta enrollment; trademark application filed
- **Senior C#:** Verified Solution validation passes; P2.2 conflict UI completion; close out plugin v1.0 punchlist
- **Senior TS:** Stripe Checkout end-to-end on web app (signup → plan → portal); cloud `/v1/pro-modules/license-secret` endpoint shipped
- **Content author:** First Pro module shipped end-to-end (signed bundle → cloud license endpoint → desktop verify); start outline of Hero Shooter Toolkit
- **Designer:** Light-mode toggle works; next 10 components responsive (15-20)
- **DevOps:** Cloudflare R2 bucket for Pro bundles + signed URLs; production environment ready (parallel to staging)

**30-Day deliverables (verifiable):**
- Trademark filed, domains owned, GitHub org migrated
- Unity plugin v1.0 punchlist closed; Verified Solution submitted
- Cloud Postgres migration shadow-writing (cutover D+45)
- Stripe Checkout flow live on staging
- First Pro module signed, encrypted, verifiable
- Sentry + PostHog instrumented
- 20 design partners contacted, 5 demoed
- Pitch deck + videos + model done

---

## 4. 60-Day Roadmap (D+31 to D+60) — "Public beta"

**Goal:** Public beta opens at D+45 with Unity plugin on Asset Store (or in review), SaaS signup working, first Pro module purchasable, telemetry live. First enterprise pilot conversation in motion.

### Week 5-6 (D+31 to D+44)

- **Senior C#:** Unity Asset Store submission live; tutorial video + sample walkthrough; respond to Asset Store reviewer feedback
- **Senior TS:** Postgres cutover (production); seat-license enforcement in cloud; team management UI v1 (invitations + seat transfer); failed-payment recovery in Stripe Checkout
- **Content author:** Hero Shooter Toolkit half-authored; begin Cozy Sim Pack
- **Designer:** Landing page redesign live on `greybox.studio`; light-mode polish; mobile responsive across top 30 components
- **DevOps:** Production deploy; load test (k6) to 200 concurrent; tune rate limits; finalize OPERATIONS.md runbooks
- **Founder:** Open public beta to email waitlist (target 500 signups week 5); 3 design-partner reference videos shot

### Week 7-8 (D+45 to D+60) — Public Beta Live

- **Senior C#:** Address Asset Store Verified Solution feedback; ship plugin v1.1 with bug fixes from beta; start Unreal MCP handler dispatch (only when Unity is approved)
- **Senior TS:** Inference proxy multi-key pooling + per-key token bucket (rate limit); region tag enforcement in inference path; OpenAPI spec for cloud API
- **Content author:** Soulslike v1.1 (beta feedback incorporated); Hero Shooter Toolkit shipped (#2 of 6 modules)
- **Designer:** Iterate on signup flow conversion (A/B PostHog); finish responsive on top 50 components
- **DevOps:** Sentry release health + alerts wired to Slack/Discord; first incident response drill
- **Founder:** First enterprise pilot prospect entered into pipeline (target: 1 small Krafton/NetEase studio + 1 indie publisher); raise (cautiously) starts conversations

**60-Day deliverables (verifiable):**
- Unity plugin live on Asset Store with Verified Solution badge (or in final review)
- Public beta open; 500+ signups; 20+ paying Indie subscribers
- 2 Pro modules live and selling
- Cloud Postgres in production with backups
- Status page tracking 99.5% web / 99.0% daemon
- First enterprise pilot conversation in pipeline
- Sentry + PostHog dashboards live; conversion funnel measured

---

## 5. 6-Month Roadmap (D+61 to D+180) — "GA + first revenue scale"

**Goal:** GA at D+90. First enterprise pilot invoiced by D+120. By D+180: $25K MRR, 6 Pro modules earning, 100 paying SaaS customers, Asset Store at >2K plugin downloads.

### Month 3 (D+61 to D+90) — GA

- Unity plugin v1.1 with stability fixes; Asset Store listing optimized (screenshots, video, copy)
- Cloud: Ed25519 license verification fully in prod for all paid tiers; audit log CSV export; region enforcement
- Web: Studio tier (5-seat min) launched; team management complete; usage analytics dashboard for org owners
- Pro: Modules #3-4 authored (Cozy Sim Pack, Hyper-Casual Mobile Pack)
- Open-design: top 100 TODOs triaged; test coverage threshold set
- Founder: GA launch press, ProductHunt, Hacker News, /r/gamedev, Unity forums; influencer outreach (3 Unity YouTubers)

### Month 4 (D+91 to D+120) — First Enterprise Pilot

- Enterprise: SSO + SCIM end-to-end test; DPA + SLA + pricing schedule; first pilot invoiced
- Cloud: SOC2 Type 1 process kickoff (Vanta or Drata)
- Pro: Modules #5-6 authored (Roguelike Generator Pro, Live-Ops Pro)
- Web: failed-payment recovery; dunning emails (Resend)
- Marketing: case studies from 3 design partners; comparison page vs Rosebud / Unity AI

### Month 5 (D+121 to D+150) — Catalog Depth

- Unity plugin v1.2: round-trip merge improvements; Addressables labeling
- Marketplace contract stabilization (still gated/dark); 3rd-party creator onboarding doc
- Real-time collaboration design (Yjs evaluation)
- Open-design: split `server.ts` into modules; first major refactor

### Month 6 (D+151 to D+180) — Investor Window

- Real-time collaboration (Yjs) in Studio tier beta
- Unreal plugin v1.0 work begins (gate already met if Unity hits 100 paying customers)
- First $500K-$1.5M SAFE close (only if MRR > $25K)
- 2nd enterprise pilot invoiced; pipeline of 5 prospects

**6-Month deliverables (verifiable):**
- $25K+ MRR
- 100+ paying SaaS customers
- 6 Pro modules earning revenue
- 1 enterprise pilot invoiced, 5 in pipeline
- Asset Store: >2K plugin downloads, >250 subscriptions
- SOC2 Type 1 in progress
- $500K-$1.5M raised (if conditions met)

---

## 6. Scaling Roadmap (D+181 onward)

**Year 1 H2 (D+181 to D+365):** Unreal plugin v1.0 (gate on Unity 100 paying), real-time collab GA, Pro catalog to 9 modules, SOC2 Type 1 complete, EU region deployed, first $50K+ enterprise deal closed. Target: $75-100K MRR.

**Year 2 (D+365 to D+730):**
- Godot plugin v1.0 (gate on Unity 250 paying)
- Marketplace activation (Stripe Connect Custom, refund flow, moderation UI) — gate on Unity 1K paying
- SOC2 Type 2 + ISO 27001
- Japanese + Korean localization
- Multi-region (US + EU + APAC)
- Series A raise ($3M-$8M at $15M-$30M pre)
- Target: $300K-$500K MRR ($3.6M-$6M ARR)

**Year 3-4:**
- $20M-$50M ARR
- NRR >130% via Pro catalog + seat expansion
- Strategic options: continue independent (raise B), competitive sale auction ($200M-$600M+), or IPO path

**Scaling principles:**
- **Stay capital-efficient until $5M ARR.** A small team is the moat.
- **Refuse work that doesn't compound.** Every line must increase recurring revenue or strategic optionality.
- **Hire ahead of pain by exactly one sprint.** Not earlier.
- **Cut anything that isn't paying within 6 months of launching.** Unreal plugin shipped but no buyers? Pause. Pro module #8 not selling? Don't author #9.

---

## 7. Resource & Cost Estimates

### 7.1 Team — first 90 days (~$110K total cost)

| Role | FTE | $/mo | 90-day cost | Notes |
|---|---|---|---|---|
| Founder | 1.0 | $0 (equity) | $0 | Solo at start; pay yourself ~$10K/mo from raise once MRR > $25K |
| Senior C# engineer (Unity plugin) | 1.0 | $12-15K | $36-45K | Contract; required for plugin v1.0 punchlist |
| Senior TS engineer (cloud + SaaS) | 1.0 | $11-13K | $33-39K | Contract; required for Postgres + Stripe + license + team UI |
| Content author (Pro modules) | 1.0 | $7-10K | $21-30K | Game-design IP background; 1-2 yrs in indie/AA |
| Designer (light-mode + responsive + landing) | 0.25 | $8-10K @ FT | $6-7.5K | Contract; ~10 hrs/wk |
| DevOps (IaC + runbooks + Sentry/PostHog) | 0.25 | $9-11K @ FT | $6.75-8K | Contract; ~10 hrs/wk |
| Trademark counsel | one-shot | — | $2-3K | Trademark + DPA + ToS |
| **Total cost first 90 days** | — | — | **~$105-133K** | |

### 7.2 Team — months 4-6 (~$150K)

- Same team, now full speed
- Add: 0.25 → 0.5 designer; founder draws salary from raise
- ~$45-55K/mo run-rate

### 7.3 Infrastructure cost (first 12 months)

| Item | Monthly | Annual | Notes |
|---|---|---|---|
| Render or Fly.io (2 daemon + 1 web replica) | $200 | $2.4K | Scales linearly with customers |
| Managed Postgres (Neon Pro or Render) | $99 | $1.2K | Until 50K rows / 10GB |
| Redis (Upstash) | $50 | $600 | For inference proxy queue |
| Cloudflare R2 (Pro bundle CDN) | $20 | $240 | Until 1TB egress |
| Cloudflare proxy + WAF | $20 | $240 | Pro plan |
| Vercel (landing + docs) | $20 | $240 | Hobby or Pro |
| Sentry (errors, perf) | $26 | $312 | Team plan |
| PostHog (product analytics) | $50 | $600 | Self-hosted free or cloud growth |
| Postmark or Resend (transactional email) | $15 | $180 | Up to 10K emails |
| Statuspage.io | $29 | $348 | Pro |
| Stripe fees | 2.9% + $0.30 | varies | Already in COGS |
| Docs site (Mintlify cloud) or Docusaurus on Vercel | $0-50 | $0-600 | Mintlify free tier sufficient |
| Domain registration (3 domains × first year) | $50 | $50 one-time | Renews annually |
| GitHub Team + Actions | $44 | $528 | For 4 contributors |
| 1Password Teams | $20 | $240 | Secret management |
| **Total infra** | **~$650** | **~$7.5K** | Scales to ~$2-3K/mo at 500 paying customers |

### 7.4 One-time costs (first 12 months)

| Item | Cost |
|---|---|
| Trademark filing (US, 3 classes) | $2.5-3K |
| DPA + ToS + Privacy Policy (counsel) | $3-5K |
| Delaware C-corp formation + EIN | $500-1K |
| Brand polish (logo refinement, design tokens) | $2-3K |
| SOC2 Type 1 audit (Vanta or Drata + auditor) | $15-25K |
| Marketing launch (ProductHunt, paid Reddit, influencer) | $5-10K |
| Asset Store launch promo | $2-3K |
| Demo videos (Descript subscription + light editing) | $500 |
| Legal review of Apache-2.0 ↔ proprietary boundaries | $2-3K |
| **Total one-time** | **~$33-54K** |

### 7.5 Total launch cost (90-day to GA)

**~$140-185K** including team, infra, and one-time costs.

### 7.6 Total cost to month 6 (first revenue scale)

**~$300-400K** including all team, infra, marketing, SOC2 kickoff, and ongoing costs.

### 7.7 Funding requirement

- **Bootstrap-only path (preferred):** Founder savings + design-partner pre-orders ($25-50K) + Asset Store early revenue ($10-25K month 3+) = ~$80-130K self-funded over 6 months. Requires founder discipline + low burn.
- **SAFE raise (if bootstrap is tight):** $250-500K from angels in month 1-2 covers full 6 months without runway anxiety. Targets: AI/gamedev angels (Gigi Levy-Weiss, Brendan Iribe, ex-Unity executives, ex-Epic).
- **Avoid Seed/Series A until month 6+:** Raise on revenue, not promise.

---

## 8. Valuation Impact

### At Launch (D+90, GA day)

**$3M – $8M** (pre-revenue → first MRR; trademark filed; Unity plugin live; first Pro module live):

| Lever | Pre → Post |
|---|---|
| Trademark + domain owned | $1.5-5M → $3-7M |
| Unity plugin live on Asset Store | +$2-5M |
| First Pro module live | +$0.5-1M |
| 500+ beta signups + 20-50 paying customers | +$0.5-1M |

### At D+180 (6 months post-launch)

**$15M – $30M** if executed on plan:

| Lever | $/Lift |
|---|---|
| $25K+ MRR with growth signal | 4-5x ARR multiple = $1.2-1.5M, but compounds with strategic interest |
| 6 Pro modules earning + NRR signal | +$3-5M strategic |
| 1 enterprise pilot invoiced + 5 in pipeline | +$5-10M strategic |
| Unity plugin >2K downloads + >250 subs | +$3-5M strategic |
| SOC2 Type 1 in progress | +$1-2M |
| Real-time collab beta | +$1-2M |

### At D+365 (12 months post-launch)

**$30M – $80M** if compounding holds (target: $100K MRR / $1.2M ARR + Unreal plugin + SOC2 Type 1 complete + multi-region):
- Strategic auction band with Unity + Roblox + Adobe interest
- Top of band requires competitive process

### Long-term ceiling (4-6 years)

**$200M – $600M+** at $20M-$50M ARR with NRR >130% (per AUDIT_2026-05-20.md §15).

---

## 9. What to BUILD (in order)

1. **Trademark + domain + corp** (no engineering, blocks valuation lift)
2. **Unity plugin v1.0 punchlist + CI matrix + Verified Solution submission + Asset Store packaging** (the moat)
3. **Cloud Postgres migration + Ed25519 license verification + Stripe Checkout** (revenue)
4. **First Pro module fully authored + cloud license endpoint + R2 CDN** (NRR proof)
5. **Light-mode toggle + responsive top-50 components + new landing page** (designer credibility)
6. **Sentry + PostHog + status page + CSP + gitleaks CI** (operational maturity)
7. **Team management UI + invitations + seat-license enforcement** (Studio tier)
8. **Public docs site + 3 tutorial videos** (conversion + DevEx)
9. **DPA + ToS + privacy policy + pitch deck + financial model** (commercial)
10. **Modules #2–6 + enterprise SSO/SCIM/audit-export + SOC2 Type 1 kickoff** (depth + enterprise)

## 10. What to REMOVE / DELETE (kill the noise)

- **Inactive marketing claims in any README** that overstate Unreal/Godot or marketplace readiness. Replace with honest "preview / coming Q2 2027" labels.
- **`MockStripeConnectProvider` references** anywhere outside `greybox-marketplace/src/payouts/*` — do not let it leak into customer-facing surfaces.
- **`greybox-playtest` from the landing page and marketing.** It's deferred; do not advertise.
- **The 1,662 TODOs that aren't actionable.** Pick top 200, file as GitHub issues, delete the rest as code comments.
- **`server.ts` debug log spam** before launch (audit any `console.log` left over).
- **Duplicate strategic docs** (the May-15 valuation, May-18 update) — archive them; `AUDIT_2026-05-20.md` is canonical.
- **Any reference to "Greybox" without the trademark notice** in commercial docs — until filed, use "Greybox Studio (TM filing pending)."
- **Old prompt-templates that don't ship a real artifact** in `open-design/prompt-templates/` — keep only the 21 starter templates that produce content.
- **The `gole.md` empty file** in the working dir.

## 11. What to DELAY (do not work on until milestone hit)

| Work | Delay until | Reason |
|---|---|---|
| Unreal plugin runtime | Unity hits 100 paying customers | Focus discipline |
| Godot plugin runtime | Unity hits 250 paying customers | Focus discipline |
| Marketplace activation (real Stripe Connect) | Unity hits 1K paying customers | Order-of-magnitude prerequisite |
| Real-time collaboration GA | Studio tier proves demand (D+120+) | Pre-revenue feature |
| AI playtest harness | Post Series A | Distraction; not buyer-relevant |
| On-prem / air-gapped | First enterprise prospect demands it | YAGNI |
| SOC2 Type 2 | After Type 1 + first $50K+ deal | Cost discipline |
| Multi-region | First EU enterprise prospect | Cost discipline |
| Internationalization | Post Series A | Premature optimization |
| `server.ts` refactor | After GA; D+120+ | Cosmetic; not blocking |
| Mobile native app | Never (for this product) | Wrong workflow |
| Standalone "AI engine" | Never | Kills Unity story |

## 12. What Creates the Highest Valuation Increase (concentrated answer)

If you do **only five things** in the next 90 days, in this order:

1. **File trademark + buy domain + form C-corp.** (+$1-2M floor) — 1 week elapsed.
2. **Ship Unity plugin v1.0 + Verified Solution submission + Asset Store listing.** (+$10-20M) — 8 weeks elapsed.
3. **Wire Stripe Checkout end-to-end + Postgres migration + Ed25519 license in prod.** (+3-5x ARR multiple) — 8 weeks parallel.
4. **Author 1 Pro module deeply + ship via author CLI + R2 CDN.** (+$2-5M NRR signal) — 4 weeks parallel.
5. **Open public beta with 20 design partners + capture 3 reference customer quotes.** (+1 ARR multiple band) — continuous.

Total elapsed: ~12 weeks of calendar time with the proposed team. Cost: ~$140-185K. Valuation outcome: from $1.5-5M as-is → $3-8M at launch → $15-30M by D+180.

The brutal rule: every other item in this plan is *additive* to the above five. None of the additive items substitutes for any of the core five.

---

## 13. Single-Page Architecture Decisions

For an acquirer's CTO to read in 2 minutes:

| Decision | Choice |
|---|---|
| **Cloud hosting** | Render or Fly.io. Not AWS/GCP. (Faster shipping; can lift-and-shift later if buyer prefers) |
| **Database** | Managed Postgres (Neon or Render). Drizzle ORM (lighter than Prisma). |
| **Queue** | Redis (Upstash). Not SQS/Pub-Sub. |
| **Object storage** | Cloudflare R2 (S3-compatible, no egress fees). |
| **CDN** | Cloudflare. |
| **Auth** | WorkOS (already integrated). Magic-link via Resend for self-serve. |
| **Billing** | Stripe (already integrated). Stripe Connect deferred. |
| **Email** | Resend (transactional). |
| **Frontend** | Next.js 16 App Router (already), React 18, Tailwind, Radix UI. |
| **Daemon** | Node.js 20+, Fastify replacement for the 12K-line server (not blocking GA). |
| **Plugin** | Unity 2022.3 LTS as floor, 2023.2 + Unity 6 supported. Unreal: 5.3-5.5 (when activated). Godot: 4.3+ (when activated). |
| **CI** | GitHub Actions only. GameCI for Unity matrix. |
| **Observability** | Sentry (errors + perf), PostHog (product analytics), statuspage.io (uptime). |
| **Secrets** | 1Password Teams. Doppler if scale demands. |
| **Docs** | Mintlify or Docusaurus on Vercel. |
| **License model** | Closed-source plugin + closed-source cloud + Apache-2.0 open core, no exceptions. Trademark policy: brand belongs to Greybox Studio Inc.; OSS users may modify but not use "Greybox" in distributions. |
| **Telemetry policy** | Opt-in only; documented event catalog; user-facing toggle in Settings. |
| **Data residency** | US (Render/Neon) at launch; EU region D+365+ as enterprise demands. |
| **Backups** | Postgres: nightly snapshots × 30-day retention. Pro bundles: R2 versioning. |

---

## 14. Day-Zero Founder Checklist (do these on D+1)

- [ ] Email trademark counsel — request US class 9/41/42 search + filing quote
- [ ] Register `greybox.studio`, `greybox.com`, `greybox.ai` via Cloudflare Registrar (cheapest, no markup)
- [ ] Create GitHub organization `greybox-studio` and migrate 9 repos
- [ ] Sign contracts with C# eng, TS eng, content author (template + rates)
- [ ] Open Render account, create staging environment, attach Neon Postgres + Upstash Redis
- [ ] Open Sentry + PostHog accounts; capture API keys in 1Password
- [ ] Send 20 design-partner outreach emails (template: "I'm building an AI-native design studio that drops directly into Unity. 20-minute demo this week?")
- [ ] Book trademark counsel for DPA + ToS + privacy policy drafting
- [ ] Start a private Notion or Linear for the launch sprint
- [ ] Cancel any tools/SaaS not needed for the next 90 days (focus discipline + cost discipline)
- [ ] Block 4 hours daily for "founder code" (the only person who knows the whole platform; do not abdicate the architecture)

---

## 15. Risks to This Plan (and the mitigation)

| Risk | Likelihood | Mitigation |
|---|---|---|
| Unity Asset Store reviewer delays Verified Solution by 4-6 weeks | High | Submit D+30 not D+60; have a non-verified listing ready as fallback |
| Senior C# engineer hire takes 4+ weeks | Medium | Have a contract C# engineer on standby; founder can do Unity work in interim (cost: founder bandwidth) |
| First Pro module content quality is below buyer expectations | Medium | Hire content author from real game-design background; ship to design-partner beta first for feedback |
| Stripe account holds funds at high volume (marketplace risk if activated) | Low (we're deferring marketplace) | Verified by deferral; Stripe Connect Custom planned for activation |
| Trademark search reveals "Greybox" is taken in class 9/41 | Medium | Fallback names: `Greyfield Studio`, `Cantrip`, `Frame Zero`, `Loom Studio` — counsel-prescreen all four |
| Postgres migration causes data loss in prod | Low | Shadow-write + dual-read for 2 weeks; explicit cutover decision |
| Inference provider rate-limit kills user experience at launch | Medium | Multi-key pool + queue (in plan); document fallback to BYOK |
| Asset Store rejects for one of 47 reasons | Medium | ASSET_STORE_SUBMISSION.md already drafted; multi-version CI passes before submit |
| Solo founder burnout | High | Strict hiring discipline; non-negotiable 1 day/week off; founder coach if budget allows |
| Unity ships an officially-blessed "AI Design Studio" of their own | Medium | Already mitigated via MCP-extension positioning; would also be an acquisition signal |

---

## 16. Final Recommendation — Top-of-Mind on Day 1

1. **The window is 12-18 months.** Move with urgency on Unity plugin + Asset Store. Everything else is a multiplier.
2. **Trademark first. Code second.** The founder week-1 action is legal, not technical.
3. **Hire 1 senior C# engineer this week.** Without that hire, the plan slips by 4-8 weeks and the launch valuation drops by $5-10M.
4. **Do not start Unreal or Godot work.** Period. Until Unity gates are met, every line of C++ or GDScript is a strategic mistake.
5. **Run the public beta at D+45, not later.** Beta feedback is the single most valuable input you have. Ship messy, fix fast.
6. **Don't raise capital until D+90+** unless bootstrap math fails. Revenue + Unity launch + Pro module sales > investor narrative.
7. **The valuation arithmetic is real and asymmetric.** $1.5-5M today → $15-30M at month 6 → $30-80M at month 12 with disciplined execution. The downside if you do nothing is acqui-hire. The upside if you execute is a 10-20x outcome inside 12 months. There's no scenario where execution doesn't pay.
8. **Document everything weekly.** A 1-page weekly status with metrics (signups, MRR, plugin downloads, MRR, retention, NRR, pipeline) is the artifact every future investor or acquirer asks for.
9. **The one quote to memorize and repeat:** "We're the design surface for Unity AI." This positioning sells to designers, to Unity itself, to investors, and to acquirers. It is the most valuable sentence in this plan.
10. **Build the launch like you're already a public-company CEO who has to defend the quarterly numbers.** Every decision routes through: does this compound revenue, does this increase strategic optionality, does this reduce existential risk? If no to all three: don't do it.

---

**End of launch plan.** This document operationalizes `AUDIT_2026-05-20.md` into a 90-day GA + 6-month scale + multi-year ceiling roadmap. Track execution against §3-§5 weekly; revise quarterly.
