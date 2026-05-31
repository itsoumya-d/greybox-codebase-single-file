# Greybox Pro

Closed-core Pro module source for signed, encrypted `.gbpro` bundles.

This repository owns proprietary module payloads only. The Apache-2.0 open core sees safe manifest metadata through `apps/daemon/src/pro-module-loader.ts`; skill bodies, art bibles, engine target details, and paid pack logic remain encrypted inside the `.gbpro` payload.

## Module Queue

| Order | Module | Price | Audience | Status |
| --- | --- | --- | --- | --- |
| 1 | Soulslike Combat Pack | $79 | Action-RPG indies | alpha-ready |
| 2 | Hero Shooter Toolkit | $99 | Multiplayer shooter teams | alpha-ready |
| 3 | Cozy Sim Pack | $59 | Casual mobile / Switch | alpha-ready |
| 4 | Hyper-Casual Mobile Pack | $49 | Ad-monetized mobile | alpha-ready |
| 5 | Roguelike Generator Pro | $69 | Roguelike indies | alpha-ready |
| 6 | Live-Ops Pro | $199 + $29/mo | Mobile / live service | alpha-ready |
| 7 | Monetization Simulator | $129 | F2P teams | alpha-ready |
| 8 | Steam Next Fest Planner | $79 | Indies preparing launches | alpha-ready |
| 9 | Console Submission Checklist | $149 | Indies porting to Switch / PS / Xbox | alpha-ready |
| 10 | Unity Full Prefab Export Pro | $99 | Unity teams | alpha-ready |
| 11 | Unreal Blueprint Export Pro | $99 | Unreal teams | alpha-ready |
| 12 | Godot Scene Tree Export Pro | $79 | Godot teams | alpha-ready |

Each alpha-ready module carries encrypted proprietary payload files for:

- the licensed skill body;
- the module art bible;
- the engine-target contract;
- a production playbook with designer review gates;
- an aggregate-only telemetry signal contract.

Engine-target payloads list supported value types separately from
`roundTripSafeFields`; the latter must contain the actual tuning field names so
engine plugins can mount reviewed diffs without guessing.

## Release Readiness

`buildProModuleReleaseReadinessReport()` is the operator packet for the paid
module launch train. With a signing key and license-secret fixture, it verifies:

- the first five paid modules ship on the 2-4 week cadence;
- all 12 year-one paid modules are alpha-ready and scheduled by week 24;
- at least five modules are alpha-ready for the month-12 target;
- the Unity, Unreal, and Godot paid export companion modules stay alpha-ready;
- every module carries the required skill, art bible, engine target, playbook,
  and aggregate telemetry payload classes;
- public marketplace listings expose metadata only;
- every scheduled `.gbpro` bundle signs, encrypts, verifies, and decrypts without
  leaking proprietary payload bodies.

`buildProModuleBundleRelease()` is the release artifact step. It emits signed
`.gbpro` bodies plus a CDN-safe manifest containing module ids, filenames,
payload hashes, envelope hashes, byte counts, object prefix, key id, and
Cloud-safe entitlement metadata (`gbpro.<module-id>` SKU, required tier, grant
key, and public price). `buildProModuleBundleUploadPlan()` turns the same
release into an operator-safe `upload-plan.json` with local filenames, CDN
object keys, content types, byte counts, hashes, cache policy, and entitlement
SKU metadata for exact storage publishing.
Release channels and CDN prefixes are path-segment validated: no URL schemes,
spaces, empty segments, or traversal markers can enter a public manifest.
Manifest generation also fails closed on duplicate module ids, filenames, CDN
paths, entitlement SKUs, or entitlement grant keys.
The manifest and upload plan exclude encrypted payload bodies, license secrets,
and signing material so they can be copied into Cloud entitlement registry and
storage operations.
`pnpm author-module` is the single-module authoring path for Pro explorer work:
it emits only release-candidate `.gbpro` bundles. Specs must include full paid
module metadata plus skill, art bible, engine target, production playbook, and
aggregate telemetry payloads; shallow scaffold-only modules are rejected before
signing or encryption.
`buildProModuleBundlePublishProof()` compares that upload plan with sanitized
storage receipts from S3/R2/GCS/local-dry-run publishing. It fails closed on
missing objects, extra objects, duplicate object keys, byte/hash/content/cache
mismatches, stale publish timestamps, signed URLs, or credential-shaped receipt
fields before Cloud treats a Pro release as publishable.
`pnpm publish-bundles` is the offline storage publisher for the same contract:
it reads `upload-plan.json`, verifies every source file hash and byte count,
stages objects under the exact CDN keys in a storage-shaped directory, and emits
a sanitized `publish-receipt.json` plus optional Cloud-safe publish proof.
`pnpm validate-cloud-handoff` is the final production gate: it reads the
`cloud-source-env.json`, rejects local/dry-run/mock/test providers, checks the
manifest/upload/proof timeline and module coverage, and emits a sanitized
`cloud-handoff-report.json` for Cloud's Pro evidence gate.
`buildProModuleEntitlementRegistry()` derives the Cloud entitlement import proof
from the release manifest, upload plan, and publish proof, with optional
`cloud-handoff-report.json` alignment. Its `greybox.pro.entitlement-registry/v1`
artifact maps each published module exactly once from SKU to grant key, module
id, payload/envelope hashes, object key/CDN path, license tier, price, and key
id. The registry fails closed on duplicate module ids, duplicate SKUs, duplicate
grant keys, missing or extra module ids, SKU/grant drift, object-key drift, hash
drift, non-production providers, or Cloud handoff mismatch. It is an import
proof only: no encrypted payloads, decrypted payloads, license secrets, signed
URL query strings, customer ids, private keys, or credentials are included.

## Revenue Mix

`buildProModuleRevenueMixReport()` tracks the month-18 revenue target that Pro
modules contribute at least 30% of total ARR. It accepts revenue ledger records
with customer ids, but outputs only aggregate customer counts, module summaries,
ARR contribution, and structured shortfalls. Customer identifiers and payload
bodies never appear in the report or Markdown export.

## Attach Readiness

`buildProModuleAttachReport()` tracks whether Pro modules are becoming an NRR
engine instead of one-off pack revenue. It uses latest-in-period customer
snapshots to measure active paid attach, multi-module adoption, Studio and
Enterprise bundle attach, expansion ARR, module breadth, and Pro customer churn.
Reports and Markdown exports remain aggregate-only and never include customer
identifiers.

## Beta Validation

`buildProModuleBetaValidationReport()` closes the diligence gap between
"payloads exist" and "paid modules worked for design partners." It requires the
first five launch modules to show reviewed engine exports from at least two
design partners each, accepted designer-reviewed diffs, coverage for int, float,
string, Color, and Vector3 round-trip fields, and zero open critical beta
issues. Outputs are aggregate-only: design partner ids stay out of JSON and
Markdown reports.

## Cloud Business Proof

`buildProBusinessModelProofExport()` maps Pro release readiness, revenue mix,
publish proof, attach readiness, and beta validation into the `proModules` slice of
`GREYBOX_BUSINESS_MODEL_PROOF_JSON` for Greybox Cloud. It returns revenue share,
shipped modules, paid purchases, signed bundle count, published object count,
attach/multi-attach/Studio attach rates, expansion ARR, churn, active-module
breadth, beta-validated launch modules, design-partner/export counts, accepted
diff rate, the explicit unsigned-bundle rejection flag, and
`sourceBusinessModelReady` only when all source reports pass; otherwise
Cloud-facing counters are zeroed. It excludes customer ids, order ids, license
secrets, design partner ids, encrypted payloads, or signing material.
`pnpm publish-bundles --cloud-env` emits the matching sanitized
`GREYBOX_PRO_MODULE_*` source env JSON so Cloud can derive signed bundle and
published-object counters from release evidence instead of copied manual counts.
Cloud also requires `GREYBOX_PRO_MODULE_CLOUD_HANDOFF_REPORT_JSON` from
`pnpm validate-cloud-handoff`; a `local-dry-run` publish proof is useful for
development, but it is not production evidence.

## Commands

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
pnpm author-module --spec ./module-spec.json --private-key ./signing-key.pem --key-id greybox-prod-2026-q2 --license-secret-env GREYBOX_PRO_LICENSE_SECRET --output ./dist/pro-modules/my-module.gbpro
pnpm release-bundles --private-key ./signing-key.pem --key-id greybox-prod-2026-q2 --license-secret-env GREYBOX_PRO_LICENSE_SECRET --output-dir ./dist/pro-modules --channel alpha --prefix greybox-pro
pnpm publish-bundles --release-dir ./dist/pro-modules --upload-plan ./dist/pro-modules/upload-plan.json --storage-dir ./dist/cdn --receipt ./dist/pro-modules/publish-receipt.json --proof ./dist/pro-modules/publish-proof.json --cloud-env ./dist/pro-modules/cloud-source-env.json --provider r2 --public-base-url https://cdn.greybox.studio
pnpm validate-cloud-handoff --cloud-env ./dist/pro-modules/cloud-source-env.json --report ./dist/pro-modules/cloud-handoff-report.json --min-bundle-modules 12
```

## Bundle Contract

`.gbpro` files are JSON envelopes using `agds-pro-module-bundle/v1`:

- `manifest`: safe module metadata and mount descriptors.
- `payloadSha256`: SHA-256 digest of the encrypted payload string.
- `encryptedPayload`: AES-256-GCM payload encrypted with a per-license secret fetched from `greybox-cloud`.
- `signature`: Ed25519 signature over `format + manifest + payloadSha256`.

The open-core loader verifies the signature and mounts only metadata. Licensed Pro runtimes decrypt the payload after license validation.
