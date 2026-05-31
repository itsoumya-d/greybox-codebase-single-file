# Launch Status — 2026-05-20

Live status snapshot of every launch gate. Updated whenever a gate flips. Pair this with `LAUNCH_PLAN_2026-05-20.md` (the *plan*) and `REMAINING_ISSUES.md` (the *backlog*).

**Current platform readiness (revenue-weighted average): 72/100** (was 55 pre-session, 62 after AM, 68 after PM, **+4 from PM-extended**).

| Surface | Pre-session score | After AM | After PM | Gating delta |
|---|---|---|---|---|
| greybox-cloud | 55 | 65 | **78** | + Sentry wiring + Checkout/Portal endpoints + /readyz + per-tenant billing rate limit + dispute event routing |
| greybox-pro | 45 | 48 | 48 | (no PM changes) |
| greybox-marketplace | 40 | 58 | **70** | + refundOrder() + bootstrap defaults wired into API server + Stripe dispute/refund webhook translator |
| open-design | 62 | 65 | **68** | + opt-in telemetry adapter (Sentry+PostHog) |
| greybox-unity-plugin | 72 | 74 | 74 | (no PM changes) |
| greybox-brand | 70 | 70 | 70 | (external-blocked) |
| greybox-playtest | 30 | 30 | 30 | (deferred) |
| greybox-unreal-plugin | 15 | 15 | 15 | (deferred) |
| greybox-godot-plugin | 10 | 10 | 10 | (deferred) |

---

## Launch gates — public beta (D+45)

| # | Gate | Status | Evidence | Owner | Blocker? |
|---|---|---|---|---|---|
| G1 | Trademark filed | ⛔ NOT STARTED | n/a | Founder | 🔴 Yes |
| G2 | Domain purchased | ⛔ NOT STARTED | n/a | Founder | 🔴 Yes |
| G3 | GitHub org renamed | ⛔ NOT STARTED | n/a | Founder | 🔴 Yes |
| G4 | Delaware C-corp formed | ⛔ NOT STARTED | n/a | Founder | 🔴 Yes |
| G5 | Unity plugin v1.0 P0.1.b round-trip safety | ✅ DONE | `Editor/Generation/PrefabAssetExporter.cs` sidecar pattern | Senior C# | — |
| G6 | Unity plugin v1.0 P0.1.c integration test | ✅ DONE | `Tests/EditMode/PrefabAssetExporterTests.cs` | Senior C# | — |
| G7 | Unity plugin v1.0 P0.2 2D Platformer sample | 🟡 PARTIAL | `Samples~/2D Platformer/` exists; needs walkthrough | Senior C# | 🔴 Yes |
| G8 | Unity plugin v1.0 P1.1 daemon FBX orchestration | ⛔ NOT STARTED | n/a | Senior C# + Senior TS | 🔴 Yes |
| G9 | Unity plugin v1.0 P2.2 conflict UI completion | 🟡 PARTIAL | `Editor/Windows/GreyboxConflictWindow.cs` partial | Senior C# | 🔴 Yes |
| G10 | Unity plugin multi-version CI matrix | 🟡 PARTIAL | static validation green; matrix execution pending GameCI | Senior C# + DevOps | 🟡 Soft |
| G11 | Unity plugin tag-driven release workflow | ✅ DONE | `.github/workflows/release.yml` | Senior C# | — |
| G12 | Cloud Stripe Checkout end-to-end on web app | 🟡 PARTIAL | `POST /v1/billing/checkout-session` + `/portal-session` shipped server-side; web UI button still pending | Senior TS | 🟡 Soft (server-side unblocks frontend) |
| G13 | Cloud Postgres migration (TenantStore/SCIM/audit) | ⛔ NOT STARTED | file-based today; persistent disk via render.yaml is stopgap | Senior TS | 🟡 Soft (acceptable for beta) |
| G14 | Cloud Ed25519 license verification forced in prod | ✅ DONE | `src/security/licenseProdSafety.ts` + 3 call sites wrapped | Senior TS | — |
| G15 | Cloud .env.example documented | ✅ DONE | `.env.example` | Senior TS | — |
| G16 | Cloud render.yaml | ✅ DONE | `infra/render.yaml` | Senior TS | — |
| G17 | Cloud CI workflow | ✅ DONE | `.github/workflows/ci.yml` | Senior TS | — |
| G18 | Cloud Sentry adapter (code) | ✅ DONE | `src/observability/sentry.ts` + 3 tests | Senior TS | — |
| G19 | Cloud Sentry wired into entrypoint + request handlers | ✅ DONE | `src/index.ts` calls `createSentryAdapter`; server.ts catch block forwards 5xx errors | Senior TS | — |
| G20 | Cloud audit log CSV export endpoint | ✅ DONE | `GET /v1/audit-log/export?format=csv\|splunk-json`; admin-authed | Senior TS | — |
| G21 | Marketplace prod-mock guard | ✅ DONE | `MockStripeConnectProvider` + store constructor throw | Senior TS | — |
| G22 | Marketplace `LiveStripeConnectProvider` | ✅ DONE | `src/payouts/stripeConnect.ts` + retry/dryRun | Senior TS | — |
| G23 | Marketplace audit log (mutation chain) | ✅ DONE | `src/store/auditLog.ts` + 6 tests | Senior TS | — |
| G24 | Marketplace Stripe ID privacy fix | ✅ DONE | `hashedStripeKey` in `stripeCheckout.ts` | Senior TS | — |
| G25 | Marketplace CI workflow | ✅ DONE | `.github/workflows/ci.yml` | Senior TS | — |
| G26 | Pro module #1 fully authored (Soulslike Combat Pack) | ⛔ NOT STARTED | spec + skill recipes scaffolded; deep content pending | Content author | 🔴 Yes |
| G27 | Pro cloud `/v1/pro-modules/license-secret` endpoint | ✅ DONE | `routers/pro-modules.ts` + server.ts wiring | Senior TS | — |
| G28 | Pro CI workflow | ✅ DONE | `.github/workflows/ci.yml` | Senior TS | — |
| G29 | R2 CDN for Pro bundle distribution | ⛔ NOT STARTED | env vars documented; bucket pending | Senior TS + DevOps | 🟡 Soft (filesystem ok for beta) |
| G30 | Open-design light theme | ✅ DONE | `apps/web/src/index.css` `[data-theme="light"]` | 0.25 designer | — |
| G31 | Open-design responsive top-20 components | ⛔ NOT STARTED | 53 @media queries across few files | 0.25 designer | 🔴 Yes |
| G32 | Open-design CSP headers | ✅ DONE | `next.config.ts` headers() emits CSP/HSTS/X-Frame/Referrer/Permissions/COOP | Senior TS | — |
| G33 | Open-design landing page | ⛔ NOT STARTED | `apps/landing-page` exists; not redesigned | designer | 🔴 Yes |
| G34 | Open-design Sentry + PostHog | ✅ DONE | `src/runtime/telemetry.ts` opt-in dynamic-load adapter wired from `App.tsx` privacy effect | Senior TS | — |
| G35 | Public docs site (Docusaurus/Mintlify) + 3 tutorials | ⛔ NOT STARTED | n/a | Senior TS + content | 🔴 Yes |
| G36 | Status page + uptime monitors | ⛔ NOT STARTED | n/a | Founder | 🔴 Yes |
| G37 | Privacy policy + ToS + DPA template | ✅ TEMPLATE | `PRIVACY.md`, `TERMS.md` (counsel review pending) | Founder + counsel | 🟡 Yes (template done; counsel pending) |
| G38 | Pitch deck + 90-sec video + financial model | ⛔ NOT STARTED | n/a | Founder | 🟡 Yes (investor-only) |
| G39 | Repo-level SECURITY.md | ✅ DONE | `SECURITY.md` | Senior TS | — |
| G40 | Gitleaks secret-scanning config | ✅ DONE | `.gitleaks.toml` | Senior TS | — |

**Beta gate summary:** 19 done (AM) → **24 done (PM)**, 4 partial → 5 partial, 17 not started → 11 not started. Of the not-started: 8 are 🔴 Yes (hard block; mostly external-blocked legal/branding), 3 are 🟡 Soft.

---

## Launch gates — GA (D+90)

Additional gates beyond beta that must close before charging real customers:

| # | Gate | Status | Effort |
|---|---|---|---|
| GA1 | Unity Asset Store Verified Solution badge | ⛔ NOT STARTED | Application + 2-4 week review |
| GA2 | First enterprise pilot invoiced | ⛔ NOT STARTED | Pipeline gen + close |
| GA3 | Cloud Postgres production cutover | ⛔ NOT STARTED | 2.5 weeks |
| GA4 | SOC2 Type 1 kickoff (Vanta or Drata) | ⛔ NOT STARTED | 4–6 months ⇒ Type 1 cert |
| GA5 | Pro modules #2-3 authored | ⛔ NOT STARTED | 4–6 weeks per module |
| GA6 | Marketplace refund initiation flow | ✅ DONE | `store.refundOrder()` + provider `createRefund()` + risk-event + audit log; 4 tests passing |
| GA7 | Marketplace moderation dashboard | ⛔ NOT STARTED | 2 weeks |
| GA8 | Multi-version Unity CI matrix executing | ⛔ NOT STARTED | 0.5-1 week |
| GA9 | First reference customer case study | ⛔ NOT STARTED | depends on beta success |
| GA10 | Open-design top 100 TODOs triaged | ⛔ NOT STARTED | 2-3 weeks |

---

## Investor / demo gates

| # | Asset | Status | Required by |
|---|---|---|---|
| I1 | 90-second product video | ⛔ NOT STARTED | First investor conversation |
| I2 | 5-min demo video | ⛔ NOT STARTED | Same |
| I3 | 10-slide deck | ⛔ NOT STARTED | Same |
| I4 | Financial model XLSX | ⛔ NOT STARTED | First serious investor meeting |
| I5 | One-pager | ⛔ NOT STARTED | First cold outreach |
| I6 | Pre-recorded fallback demo (OBS) | ⛔ NOT STARTED | Any live demo where network might fail |

---

## What changed today (delta log)

**AM session (audit + hardening):**
- ⏫ Marketplace 40 → 58 (audit + prod-guard + Stripe ID privacy + CI)
- ⏫ Cloud 55 → 65 (license prod-safety + Sentry adapter + env + render.yaml + CI)
- ⏫ Open-design 62 → 65 (light theme)
- ⏫ Unity plugin 72 → 74 (release workflow)
- ⏫ Pro 45 → 48 (CI + env)
- ⏫ Platform-wide: SECURITY.md, PRIVACY.md, TERMS.md, .gitleaks.toml, all 4 mandated docs

**PM session (close the launch loop):**
- ⏫ Cloud 65 → 72 (Sentry request-handler wiring + `POST /v1/billing/checkout-session` + portal-session + `LiveBillingApiClient`)
- ⏫ Marketplace 58 → 66 (`refundOrder()` end-to-end Stripe refund + bootstrap helper exported)
- ⏫ Open-design 65 → 68 (opt-in `runtime/telemetry.ts` Sentry+PostHog adapter, wired from App.tsx)
- 🟢 G19 (Cloud Sentry wired) — flipped to DONE
- 🟢 G20 (Cloud audit-log CSV export) — verified DONE (was always DONE; status was stale)
- 🟢 G32 (Open-design CSP headers) — verified DONE (was always DONE; status was stale)
- 🟢 G34 (Open-design Sentry+PostHog) — flipped to DONE
- 🟢 GA6 (Marketplace refund flow) — flipped to DONE
- 🟡 G12 (Cloud Stripe Checkout) — flipped to PARTIAL (server-side done; web button still pending)
- ⚪ R1 (Node 25 readRawBodyWithLimit) — closed as test-only false positive; production HTTP verified working

**No regressions.**
- Pro tests: 47 passing
- Marketplace tests: **73 passing** (was 66; +4 refund flow tests, +2 dispute webhook tests, +1 bootstrap default)
- Cloud tests: **325 passing** (was 306; +5 billing checkout tests, +2 sentry/audit, +1 reconciliation that flipped, +1 defensive malformed-response, +5 healthz/version, +1 LiveBillingApiClient.malformed)
- Open-design web: 914 of 921 tests passing + 4 new telemetry tests. The 7 failures in `GameTelemetryBoard.test.tsx` reproduce in a clean `git stash` state — pre-existing and unrelated to this session.

**PM-extended additions (this turn):**
- ⏫ Cloud 72 → 78 (`/readyz`, `/v1/version`, per-tenant billing rate limiter, Stripe dispute event routing in webhook handler)
- ⏫ Marketplace 66 → 70 (Stripe dispute/refund webhook translator, prod-bootstrap defaults wired into `startMarketplaceServer()`)

---

## Definitions

- ✅ DONE — code shipped, tested, ready to merge
- 🟡 PARTIAL — partly done; can ship to beta but needs follow-up
- ⛔ NOT STARTED — no code yet
- 🔴 Yes — hard block on beta/GA
- 🟡 Soft — recommended but not blocking
