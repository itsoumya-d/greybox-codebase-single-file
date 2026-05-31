# Greybox Pro — First-Wave Module Scope

**Date:** 2026-05-21
**Source:** Audit against `GREYBOX_COMPLETE_ANALYSIS_2026-05-19.md` §4.2
**Effort estimate:** authored payloads and CLI shipped; remaining work is cloud-backed distribution, paid beta validation, and telemetry-backed iteration
**Projected lift:** SaaS multiple from 4.5x → 7–9x via NRR engine

---

## 1. Crypto envelope — verified production-grade

**Format:** `agds-pro-module-bundle/v1`. JSON envelope with three crypto layers.

**Output `.gbpro` structure:**
```
{
  "format": "agds-pro-module-bundle/v1",
  "manifest": { /* safe, public metadata */ },
  "payloadSha256": "hex-digest",
  "encryptedPayload": "base64url(AES-256-GCM)",
  "signature": {
    "algorithm": "ed25519",
    "keyId": "key-identifier",
    "value": "base64url(signature)",
    "signedFields": "format+manifest+payloadSha256"
  }
}
```

**Implementation:** `pro-module-loader.ts` (743 LOC)
- **Signing:** Ed25519 over (format + manifest + payloadSha256) with stable JSON stringification
- **Encryption:** AES-256-GCM, 12-byte random nonce per encrypt, SHA256-derived key from license secret, manifest as AAD
- **Integrity:** SHA-256 digest of encrypted payload verified before decryption; file body digests re-verified post-decryption

**Strength:** thorough input validation (safe-id regex, path sanitization, digest format checks, 25 MB bundle cap). No obvious flaws. License secret rotation belongs in greybox-cloud, not the loader.

---

## 2. The 12 modules — canonical list & payload intent

| # | ID | Price | Audience | Status |
|---|---|---|---|---|
| 1 | soulslike-combat-pack | $79 | Action-RPG indies | alpha-ready authored payload |
| 2 | hero-shooter-toolkit | $99 | Multiplayer teams | alpha-ready authored payload |
| 3 | cozy-sim-pack | $59 | Casual mobile | alpha-ready authored payload |
| 4 | hyper-casual-mobile-pack | $49 | Ad-monetized mobile | alpha-ready authored payload |
| 5 | roguelike-generator-pro | $69 | Roguelike indies | alpha-ready authored payload |
| 6 | live-ops-pro | $199 + $29/mo | Mobile live service | alpha-ready authored payload |
| 7 | monetization-simulator | $129 | F2P teams | alpha-ready authored payload |
| 8 | steam-next-fest-planner | $79 | Indies (launch prep) | alpha-ready authored payload |
| 9 | console-submission-checklist | $149 | Console-bound indies | alpha-ready authored payload |
| 10 | unity-full-prefab-export-pro | $99 | Unity teams | alpha-ready authored payload |
| 11 | unreal-blueprint-export-pro | $99 | Unreal teams | alpha-ready authored payload |
| 12 | godot-scene-tree-export-pro | $79 | Godot teams | alpha-ready authored payload |

**Current finding:** all 12 modules now ship authored closed-core payloads generated from `ProModuleSpec` and validated by `buildProModuleReleaseReadinessReport()`. Each module carries the required 5-file payload (`SKILL.md`, `DESIGN.md`, `engine-targets/*.json`, `PLAYBOOK.md`, `signals.json`) plus module-specific recipes, art direction, reference encounter beats, Unity implementation steps, tuning defaults, aggregate telemetry signals, and schema-versioned engine round-trip contracts. The release gate fails if payload classes, mounts, engine field contracts, public listing safety, engine-export companions, cadence, or signed `.gbpro` verification are missing.

**Payload structure per module:**
- `skills/{id}/SKILL.md` — AI-assisted design prompt (workflow + designer review gates + tuning vocabulary)
- `game-art-bibles/{id}/DESIGN.md` — visual pillars + interaction feel + tuning fields
- `engine-targets/{id}/{engine}.json` — engine contract (export fields, round-trip safe fields, QA gates)
- `playbooks/{id}/PLAYBOOK.md` — 3-day sprint shape + QA gates + round-trip fields
- `telemetry/{id}/signals.json` — aggregate-only signals + dashboards (privacy-by-design)

---

## 3. Author tooling — shipped

**Status:** `pnpm author-module` is available through `src/cli/authorModule.ts`. It turns a checked-in module spec plus authored payload files into a signed, encrypted `.gbpro` bundle that the open-core daemon loader can verify and decrypt.

**Current command:**
```
pnpm author-module \
  --spec ./modules/soulslike-combat-pack/module-spec.json \
  --private-key ./signing-key.pem \
  --key-id greybox-prod-2026-q2 \
  --license-secret-env GREYBOX_PRO_LICENSE_SECRET \
  --output dist/soulslike-combat-pack.gbpro
```
Pipeline:
1. Validate spec completeness (all 5 files present, digests match)
2. Encrypt payload with license secret (AES-256-GCM, fresh nonce)
3. Sign envelope with Ed25519 key
4. Emit `.gbpro` JSON

**Validated:** CLI tests author a fixture module, verify the Ed25519 signature, decrypt with the license secret, and assert payload round-trip. Release readiness proves all 12 paid modules can sign, encrypt, verify, decrypt, and pass payload class and engine-contract gates.

**Current gap:** replace local-dry-run storage publishing with live R2/S3 credentials, then wire the generated publish proof into greybox-cloud entitlements.

---

## 4. Distribution backend — next gap

**Status:** Cloud entitlement metadata and loader seams exist. Artifact upload automation now has a deterministic local publisher (`pnpm publish-bundles`) that verifies `upload-plan.json`, stages exact CDN object keys, and emits sanitized publish receipts/proofs. Live R2/S3 credentials and signed-URL serving still need production wiring.

**Required flow:**
1. greybox-cloud hosts `GET /v1/pro-modules/{module-id}.gbpro` (TLS, signed URL, license-gated)
2. open-design daemon (`pro-module-loader.ts`) fetches `.gbpro`, verifies signature, decrypts with license secret, mounts payload
3. Marketplace shows public catalog via `publicCatalog()` (metadata only, no payload)
4. License runtime check: `fetchProModuleLicenseSecretFromCloud()` POSTs to greybox-cloud with `moduleId + payloadSha256 + entitlementLookupKey`

**What to build next:**
- S3 or Cloudflare R2 bucket for `.gbpro` files
- greybox-cloud `/v1/pro-modules/license-secret` endpoint
- Cloud entitlement import from `publish-proof.json`
- Cache invalidation on module refresh
- Telemetry: signed bundles shipped, per-studio usage

**Effort:** 0.5–1 week.

---

## 5. License gate + open-design integration seam — exists

**Location:** `open-design/apps/daemon/src/pro-module-loader.ts` (743 LOC).

**Flow:**
1. Daemon enumerates `.gbpro` files in `project-root/pro-modules/`
2. `verifyProModuleBundle()` — Ed25519 verify always (public keys from config)
3. `loadLicensedProModuleBundles()`:
   - Resolve license secret (user callback or cloud fetch)
   - No secret → reject with `PRO_MODULE_LICENSE_REQUIRED`
   - With secret → decrypt, mount files into runtime registries
4. Registries (skills, art bibles, engine targets) merged into project context

**Failure modes:**
- Unsigned bundle → `PRO_MODULE_UNSIGNED`, never decrypted
- Wrong secret → silent AES auth-tag failure → `PRO_MODULE_DECRYPT_FAILED`

**Integration:** daemon `src/server.ts` exposes `GET /api/pro-modules/manifest`, `GET /api/pro-modules/{id}/skill-body`, etc. Web client never sees `.gbpro`; only mounted JSON/Markdown.

---

## 6. First-wave selection — authored launch set

Selected for highest **perceived value ÷ authoring effort**, balanced across audiences.

### #1 Soulslike Combat Pack — $79, week 2
**Why open here:** highest immediate perceived value in a hot indie segment; stamina/tell mechanics are visually learnable; skill scope is narrow and teachable.
**Skill scope (~150 words):** boss encounter brief → stamina costs, punch windows, lock-on HUD deltas, checkpoint logic. QA gates: readable windups, stable lock-on camera, non-trivial checkpoints. Output: Unity C# tuning struct + prefab import plan.
**Art bible:** silhouette readability, contrast-safe design, lock-on HUD contract, dodge feedback timing.
**Engine target:** Unity-only. Prefab hierarchy, material assignments, Addressables labels for boss encounters.
**Status:** authored alpha payload; needs paid beta playtest evidence before GA.

### #2 Hero Shooter Toolkit — $99, week 4
**Why second:** team-based momentum; ability readability is a solved player problem; tight scope (role + ability + cooldown HUD).
**Skill scope (~150 words):** hero role (tank/support/damage) → ability set, cooldown surfaces, scoreboard, counter-pick dynamics. Output: kit cards, HUD cooldown groups, scoreboard, ability prefab deltas. QA gates: readable at streaming res; never obscures objective.
**Art bible:** ability silhouettes, cooldown HUD readability, team-color contrast, role UI tokens.
**Engine target:** Unity-only (Unreal later). Prefab hierarchy for ability scripts, UI canvas trees, Addressables groups.
**Status:** authored alpha payload; needs paid beta playtest evidence before GA.

### #3 Cozy Sim Pack — $59, week 6
**Why third:** lowest mechanical complexity, highest volume potential; reuses existing `cozy-casual` bible from open-design.
**Skill scope (~120 words):** routines (water crops, gift NPCs, decorate) → low-friction tasks with soft failure and return hooks. Output: collection boards, gift affinity curves, decoration budgets, daily energy contracts. QA gates: no harsh penalties for missed days; touch + controller parity.
**Art bible:** extend `cozy-casual` with NPC gift language + soft-failure tone.
**Engine target:** Unity-only. Simple scene hierarchies, inspector tuning for daily costs + rarity.
**Status:** authored alpha payload; needs paid beta playtest evidence before GA.

### #4 Hyper-Casual Mobile Pack — $49, week 8
**Why fourth:** fastest iteration cycle (fail in 3s, retry in 1s); smallest skill surface; validates platform telemetry + A/B hooks.
**Skill scope (~120 words):** compress to one-thumb input, one loss condition, one score. Output: level variant rules (speed/spacing/density), ad-break pacing, haptic moments, fail-state copy. QA gates: first-action clarity without tutorial; ad-safe checkpoint placement.
**Art bible:** reference arcade-neon or pixel-retro; extend with one-thumb readability rules.
**Engine target:** Unity-only. Prefab templates for level grid, obstacle spawn, score UI.
**Status:** authored alpha payload; needs paid beta playtest evidence before GA.

### #5 Live-Ops Pro — $199 + $29/mo, week 10
**Why fifth:** recurring revenue engine; positions platform as "live-service co-author."
**Skill scope (~180 words):** season goals → event calendars, reward tracks, economy sinks, experiment hypotheses. Output: live-ops briefs, calendar JSON, push-safe copy, retention-risk flags. QA gates: prevent pay-to-win escalation; honest deadlines; rollback plans for economy changes. Includes reference event/reward/sink spreadsheet.
**Art bible:** live-ops tone (urgency without pressure), event card design, reward-track readability.
**Engine target:** multi-engine (shared JSON calendar + engine-specific UX scaffolds).
**Status:** authored alpha payload; needs paid beta playtest evidence before GA.

### #6 Monetization Simulator — $129, week 12 (optional)
**Why complement:** ethical economy modeling shields studios from dark-pattern accusations; reputational hedge.
**Skill scope (~150 words):** model currency sources/sinks/offers/progression with trust checks. Output: payer-vs-non-payer scenarios, price sensitivity ranges, dark-pattern blockers. Optional child-safety disable.
**Status:** authored alpha payload; needs paid beta playtest evidence before GA.

---

## Summary table

| Module | Ship week | Status | Price | Rationale |
|---|---|---|---|---|
| Soulslike Combat | 2 | Authored alpha | $79 | Strong opener, action-RPG surge |
| Hero Shooter | 4 | Authored alpha | $99 | Team-play momentum, complexity premium |
| Cozy Sim | 6 | Authored alpha | $59 | Volume play, reuses cozy-casual bible |
| Hyper-Casual | 8 | Authored alpha | $49 | Telemetry validation, fast iteration |
| Live-Ops Pro | 10 | Authored alpha | $199 + $29/mo | Recurring revenue, co-author positioning |
| Monetization Sim | 12 | Authored alpha | $129 | Reputational hedge |

**Total first-wave:** authored payloads are in-repo; remaining launch work is CDN distribution, entitlement recording, paid beta validation, and telemetry-backed iteration.

**Conservative Year-1 revenue:** at 2% adoption of ~15–20K MAU open-design base, 2.5 modules avg attach, $85 avg → **$64–85K one-time + $10–15K MRR (Live-Ops)** = **~$75–100K ARR** soft-launch.

---

## Pre-week-1 sequence

1. Author signing/packaging CLI (done)
2. Author all 12 first-wave payloads (done)
3. End-to-end sign/decrypt/mount validation (done in release readiness)
4. Publish local-dry-run release receipts/proofs with `pnpm publish-bundles` (done)
5. Stand up greybox-cloud license-secret endpoint + R2/S3 bucket
6. Soft-launch Soulslike to 20–50 beta studios; collect telemetry
7. Iterate on skill prompt quality
8. Ship Hero Shooter on week-4 cadence with revenue/attach tracking
