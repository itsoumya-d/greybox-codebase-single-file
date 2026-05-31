# Greybox Studio — Production-Ready AI Game Designer Plan
**Date:** 2026-05-27
**Mission:** Make Greybox an AI that designs whole games (any genre, any engine, with 3D characters, playable prototypes, page-by-page + component-by-component) production-ready for launch.

## 1. Verified Current State (post-audit 2026-05-27)

| Repo | Completion | Critical Gap |
|------|------------|--------------|
| **open-design** (web + daemon) | 70-80% | No visual page editor; chat-first; no 3D viewport |
| **greybox-cloud** (backend) | 50-55% | No game schema; no character-gen integration; dryRun Stripe |
| **greybox-unity-plugin** | 70% | Needs smoke tests + Asset Store packaging |
| **greybox-unreal-plugin** | 30-35% | Plan generators only; no Actor instantiation |
| **greybox-godot-plugin** | 25-30% | Plan generators only; no Node instantiation |
| **greybox-playtest** | Alpha | Mock vision provider; no durable ledger |
| **greybox-marketplace** | 60-65% | Stripe live, no creator UI/onboarding |
| **greybox-pro** | Alpha | Crypto done; no CDN publish; 12 modules scaffolded |
| **greybox-brand** | 70% | Tokens done; no TM filing, no website |

## 2. Vision Gaps to Close

The founder's vision: **AI designs whole games page-by-page and component-by-component, generates 3D characters, exportable to any engine, with playable prototypes.**

Hard-blocker gaps:

1. **No canonical game data model** — each repo invents its own format; no shared schema for Game / Screen / Component / Flow / Character / Asset
2. **No visual page-by-page editor** — open-design is chat-first; needs a structured visual surface
3. **No 3D character generation** — zero infrastructure today
4. **No 3D playable prototype runner** — HTML iframes only; need WebGL runner
5. **Unreal + Godot can't instantiate** — they parse plans but produce nothing real
6. **No revenue flow** — Stripe Checkout server endpoints exist, no UI button
7. **No first paying customer** — Pro module CDN unpublished, marketplace creator UI missing

## 3. Architecture — The Foundational Decision

All work that follows depends on **one canonical game schema** shared across cloud, open-design, Unity, Unreal, Godot, playtest, and pro modules.

**Schema package: `@greybox/schema`** (TypeScript + JSON Schema + protobuf-compatible)

Top-level entity tree:

```
GameProject
├── meta (id, name, version, genre, targetEngine[], platforms[])
├── art (paletteRef, typographyRef, materialOverrides[])
├── screens[] (Screen)
│   ├── components[] (Component)
│   ├── transitions[] (FlowEdge)
│   └── prototypeSpec (Babylon scene config, optional)
├── characters[] (Character)
│   ├── meshRef (glTF asset ref)
│   ├── rig (skeleton spec)
│   ├── animations[] (clipRef)
│   └── stats (gameplay attributes)
├── assets[] (Asset)
│   ├── glTF/FBX/PNG/audio
│   └── provenance (genProvider, hash, license)
├── flows[] (FlowEdge: from screen + trigger → to screen + transition)
└── exports[] (per-engine ExportPolicy)
```

Each engine plugin consumes a single canonical `GameProject` JSON + a `bundle.zip` of binary assets (glTF, FBX, PNG, audio) and produces engine-native objects.

## 4. The Plan — 8 Parallel Implementation Streams + 1 Foundation

### Stream 0 (FOUNDATION, blocks everything else)
**Build `@greybox/schema` package — canonical game data model**

- Location: new package at `/Users/soumyadebnath16/Developer/game desine/open-design/packages/schema/`
- Exports: TypeScript types + Zod validators + JSON Schema + protobuf .proto files
- Test coverage: 80%+ on all type guards and validators
- Entities: GameProject, Screen, Component, FlowEdge, Character, Asset, ExportPolicy, all enums and discriminated unions
- Versioning: schema version field on every root object; migration helpers
- Documentation: README explaining model invariants

### Stream 1: Visual page-by-page editor in open-design
**Add structured page/component editor next to existing chat**

- Location: `open-design/apps/web/`
- Build: new route `/projects/:projectId/design`
- UI:
  - Left rail: screen list with reorderable flow graph
  - Center: canvas with React-Flow for screen graph; click a screen → component canvas
  - Component canvas: drag-drop components from palette (Button, Image, Text, 3DCharacter, HUDBar, MenuList, GameObject)
  - Right rail: property inspector (bound to selected entity)
  - Top: page actions (add screen, link flow, simulate)
- Backend: persist via daemon to canonical `GameProject` JSON
- Use existing Yjs realtime; persist to existing project store
- Tests: render tests, drag-drop interaction, save/restore round-trip

### Stream 2: 3D playable prototype runner (Babylon.js)
**Build in-browser 3D runtime that plays canonical `GameProject` directly**

- Location: new package `open-design/packages/prototype-runner/`
- Tech: Babylon.js (latest), React wrapper
- Capability:
  - Load `GameProject` JSON + bundle (glTF assets)
  - Render screens (UI components as Babylon GUI, 3D Characters as glTF meshes)
  - Apply flow transitions (button click navigates to linked screen)
  - Support basic character animations (idle, walk, jump, attack via clipRef)
  - Camera controls per screen spec (orbit, FPS, top-down)
  - Mobile-responsive viewport sizing
- Embed in web app at `/projects/:projectId/preview`
- Tests: load sample GameProject, assert 3D scene renders, simulate click → screen change

### Stream 3: 3D character generation service in cloud
**Cloud adapter for character-gen providers**

- Location: `greybox-cloud/src/routers/characters.ts` + `greybox-cloud/src/providers/character-gen/`
- Providers: Meshy v3 API, Tripo3D, plus a `mock` provider for offline tests
- Routes:
  - `POST /v1/characters/generate` — submit prompt + style + rigging requirements; returns jobId
  - `GET /v1/characters/jobs/:id` — poll; returns status (queued/processing/done/failed) + result URL
  - `POST /v1/characters/import` — validate provider output; normalize to canonical Character spec; store in assets
- Output normalization: ensure glTF 2.0, skeleton with standard joint names (Mixamo-compatible), Idle/Walk/Run/Jump animation clips
- License gate: Pro tier and above
- Tests: mock provider job lifecycle; rejection of invalid glTF; standardized skeleton output

### Stream 4: Unreal real artifact importer
**Convert canonical `GameProject` into Unreal Actors / UMG / Blueprints**

- Location: `greybox-unreal-plugin/Source/GreyboxStudio/Private/Importers/`
- Capability per artifact type:
  - Screen → ULevel + ALevelScript actor with child UMG widget per UI Component
  - Component (Button) → UButton in UMG hierarchy
  - Component (3DCharacter) → ASkeletalMeshActor with imported skeletal mesh + AnimationBlueprint
  - FlowEdge → blueprint action: button click → OpenLevel
  - Character mesh import via glTF (use existing UE5 glTF importer; do not reinvent)
- DiffApplier: implement real 3-way merge for int/float/string/Vector/Rotator/Transform; track deletions
- Tests: load fixture GameProject, run importer in commandlet mode, assert .uasset files created with expected outers
- Output: command `Greybox.ImportProject <path>` available as Editor Subsystem

### Stream 5: Godot real artifact importer
**Convert canonical `GameProject` into Godot Nodes / Scenes**

- Location: `greybox-godot-plugin/addons/greybox_studio/importers/`
- Capability per artifact type:
  - Screen → PackedScene with root Control or Node3D
  - Component (Button) → Button node child
  - Component (3DCharacter) → Node3D with MeshInstance3D (glTF imported) + AnimationPlayer
  - FlowEdge → AutoLoad SceneManager + signal connection
  - Character mesh import via glTF (Godot has native glTF importer; call it)
- DiffApplier: same scalars as Unreal + add support for arrays and deletions
- Tests: GDScript test scripts under `test/`; load fixture, run importer, assert `.tscn` files created
- Output: tool script `addons/greybox_studio/import_project.gd`

### Stream 6: Web Stripe Checkout UI + light mode + responsive
**Ship customer-facing payment + theme + mobile-responsive design**

- Location: `open-design/apps/web/`
- Stripe Checkout:
  - Add `Subscribe` button in `Settings/Billing` page; calls existing `/v1/billing/checkout` cloud endpoint
  - Plans grid (Free / Pro / Studio / Enterprise) with feature comparison
  - Success + cancel landing pages
  - Customer Portal link for existing subscribers
- Light mode:
  - Add theme toggle in user menu (persists per-user)
  - Audit top 50 components for hardcoded colors; replace with CSS variables
  - Both themes pass WCAG AA contrast
- Responsive:
  - Add @media queries for: 768px (tablet), 1024px (laptop), 1280px (desktop)
  - Top 20 highest-traffic components (chat panel, project sidebar, file workspace, artifact preview, settings, billing, login, signup)
- Tests: Playwright snapshots in dark + light; mobile viewport; checkout button click → mock Stripe redirect

### Stream 7: Marketplace creator onboarding UI
**Self-serve creator flow + listing wizard + admin review queue**

- Location: `greybox-marketplace/` (likely needs a small web frontend addition)
- Capability:
  - `/creator/onboard` — multi-step wizard: profile → Stripe Connect Express onboarding link → tax info → bank account → approval pending
  - `/creator/listings/new` — listing wizard: asset upload → metadata (title, description, category, tags, price) → preview → submit for review
  - `/admin/review` — moderation queue: pending listings with approve/reject/request-changes actions
  - Status dashboard for creators: sales, payouts, dispute queue
- Backend: hits existing marketplace API routes; adds frontend layer
- Tests: end-to-end Playwright: onboard → list → approve → buy → payout

### Stream 8: Unity plugin smoke tests + Asset Store packaging
**Close the 30% remaining work on Unity plugin**

- Location: `greybox-unity-plugin/`
- Capability:
  - Run EditMode + PlayMode tests against real Unity 2022.3 / Unity 6 (use GameCI Docker)
  - Generate `.unitypackage` artifact via `GreyboxAssetStorePackageExporter`
  - Validate Asset Store submission checklist: package size, descriptions, screenshots, license, third-party notices
  - Bump version 0.1.0-alpha.1 → 1.0.0
  - Add CHANGELOG.md with v1.0.0 entry
- Tests: green CI matrix across Unity versions
- Output: `dist/greybox-studio-1.0.0.unitypackage` ready for upload

## 5. Quality Gates (per stream)

Each stream's implementer subagent must:
- Write TypeScript / C++ / GDScript / C# with strict mode + lint clean
- Provide tests with 70%+ coverage for the new code
- Update relevant README / package.json / .uplugin / plugin.cfg / package.json
- Pass typecheck / compile in their respective toolchain
- Produce a `STREAM_<N>_REPORT.md` summarizing what landed + what's still TODO

Then a code-quality reviewer subagent reviews each stream's diff.

## 6. Sequencing

- **T+0:** Dispatch Stream 0 (foundation) — blocks all others.
- **T+0 (parallel):** Streams 6, 7, 8 (UI + ops work, independent of schema).
- **T+stream-0-done:** Dispatch Streams 1, 2, 3, 4, 5 in parallel (all consume schema).
- **T+all-done:** Final integration review subagent.

## 7. Out-of-Scope (explicit deferrals)

- Trademark filing, domain purchase, legal entity formation (founder's manual work).
- SOC2 audit (4-6 month engagement; not a coding task).
- Real CDN provisioning (S3/R2 account setup is manual).
- Marketing website build (separate creative project).
- Brand asset finalization (designer + counsel work).

## 8. Success Definition

Greybox is production-launch-ready when:

1. A user can sign up on the web app, pay via Stripe Checkout, and access Pro features.
2. A user can visually design a multi-screen game with components and 3D characters in the page-by-page editor.
3. A user can generate a 3D character from a text prompt via the cloud service.
4. A user can preview the prototype playably in 3D in their browser.
5. A user can export the project to Unity, Unreal, or Godot and the engine instantiates real actors/nodes/widgets.
6. A creator can list a Pro module / template on marketplace and get paid.
7. All test suites green across all 9 repos.

These are the targets for this session's implementation subagents.
