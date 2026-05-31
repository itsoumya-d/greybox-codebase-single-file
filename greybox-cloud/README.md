# Greybox Cloud

Closed-core managed inference and enterprise control plane.

Alpha services:

- `POST /v1/inference` provider router with managed-inference tier gates,
  failover, usage metering, SSE output, prompt-injection checks, and redacted
  observability logs.
- `GET /v1/models` and `POST /v1/chat/completions` OpenAI-compatible bridge
  for the existing open-core BYOK proxy. In the studio UI, opt in by choosing
  OpenAI-compatible API mode, setting the base URL to `https://cloud.greybox.studio/v1`,
  and using a Greybox token.
- `POST /v1/billing/webhook` Stripe raw-body webhook boundary with HMAC
  signature verification and Checkout fulfillment forwarding to the
  marketplace, plus sanitized audit evidence for fulfilled sessions.
- `GET /v1/billing/checkout-readiness` billing-admin checklist for hosted
  Stripe Checkout cutover: webhook secret, marketplace URL/token, and audit
  evidence without returning secrets.
- `GET /v1/billing/checkout?tier=indie&tenantId=...` renders a hosted
  no-JS Checkout handoff page, and `POST /v1/billing/hosted-checkout` creates
  the Stripe subscription session and redirects without exposing price IDs,
  Stripe keys, or buyer metadata.
- `GET /v1/billing/marketplace-report?report=tax-compliance&format=csv`
  billing-admin proxy for marketplace reconciliation, settlement, and tax
  compliance exports without exposing the marketplace admin token.
- `POST /v1/billing/jobs/invoice` admin job for invoice generation and
  optional Stripe meter-event submission.
- `GET /v1/auth/session` WorkOS-compatible session inspection backed by
  RS256 JWT verification and organization-to-tenant isolation.
- `POST /v1/licenses/validate` Unity plugin license validation for Free
  Personal, Indie, Pro, Studio/site, and Enterprise keys. It returns only the
  parsed tier, feature gates, commercial entitlements, seat limits, and a short
  hash, never the raw key. When `GREYBOX_LICENSE_RECORDS_JSON` is configured,
  validation fails closed against hashed active records with expiry/revocation
  support. Successful checks write sanitized `license.validated` audit entries
  when audit logging is enabled.
- `POST /v1/pro-modules/license-secret` derives per-license, per-module
  `.gbpro` decryption secrets from a server-side master key. Pro/Studio keys
  unlock all modules; Indie keys require explicit module entitlements or a
  marketplace entitlement lookup key bound to the caller's license hash. Secret
  issuance writes `pro_module.secret_issued` audit entries without raw keys,
  lookup keys, or decryption secrets.
- `GET /v1/enterprise/data-residency` tenant region inspection for US/EU/India
  deployment checks.
- `GET /v1/enterprise/data-residency/readiness` admin-protected US/EU/India
  region readiness matrix for deployments, storage, provider egress, transfers,
  and backups.
- `GET /v1/enterprise/provider-policy/readiness` admin-protected managed
  inference provider-policy evidence for tenant/region allowlists, provider
  blocks, and signed DPA coverage.
- `GET /v1/enterprise/encryption-readiness` admin-protected KMS, storage
  encryption, TLS/HSTS, backup encryption, and secret-rotation evidence without
  returning raw key material.
- `GET /v1/enterprise/private-network/readiness` admin-protected AWS VPC
  peering and Azure VNet peering readiness register for enterprise pilots.
- `GET/POST/PATCH/DELETE /v1/scim/v2/Users` SCIM 2.0 provisioning surface for
  Okta, Google Workspace, and Microsoft Entra pilots. SCIM audit entries store
  hashed user identifiers, never raw user emails or external IDs.
- `GET /v1/audit-log/export?format=csv|splunk-json` tenant-filtered enterprise
  audit export plus `GET /v1/audit-log/verify` tamper-evident hash-chain
  verification.
- `GET /v1/enterprise/offline-license` signed offline license health check for
  on-prem deployments.
- `GET /v1/enterprise/subprocessors` subprocessor disclosure registry with
  purposes, data categories, regions, transfer mechanisms, and 30-day notice.
- `GET /v1/privacy/disclosures` public sanitized disclosure checklist for
  CCPA/CPRA, COPPA, and India DPDPA launch readiness.
- `GET /v1/enterprise/onprem-readiness` admin-protected install verification
  for signed license status, durable stores, rotated secrets, and provider
  egress without returning secret values.
- `pnpm onprem:smoke` verifies a live on-prem bundle end to end: signed license
  health, readiness auth gating, green readiness status, and response secret
  minimization.
- `GET /v1/enterprise/trust-controls` admin-protected SOC 2 / ISO 27001
  readiness evidence map with explicit non-certification disclaimer; memory
  or file tenant, SCIM, audit, billing, privacy, incident, consent, and
  legal-hold stores stay partial until Postgres or durable-injected proof is
  wired.
- `GET /v1/enterprise/trust-packet?format=markdown` admin-protected enterprise
  diligence bundle combining controls, subprocessors, privacy evidence,
  retention, document index, and open risks as JSON or buyer-readable Markdown.
- `GET /v1/enterprise/certification-roadmap` admin-protected GDPR, CCPA/COPPA/
  DPDPA, SOC 2, and ISO 27001 roadmap with target months, costs, blockers, and
  an explicit non-certification caveat.
- `GET /v1/enterprise/security-questionnaire` admin-protected JSON/CSV
  customer questionnaire generated from the trust packet with conservative
  ready/needs-review/blocked statuses.
- `GET /v1/enterprise/contracts?format=markdown` admin-protected procurement
  packet that hashes the Enterprise Order Form, MSA, and DPA, verifies required
  clauses, lists order-form fields, and keeps the legal-advice caveat explicit.
- `GET /v1/enterprise/pilot-readiness?format=markdown` admin-protected
  enterprise go/no-go packet for the first five $40K+ ACV pilots. It combines
  contracts, security questionnaire, support SLA evidence, trust controls,
  residency, on-prem, private networking, and certification-roadmap evidence
  without claiming certification.
- `GET /v1/enterprise/logo-expansion-readiness?format=markdown`
  admin-protected 5-to-50 enterprise-logo scorecard covering Enterprise
  controls, ACV, NRR, procurement throughput, feature adoption, deployment
  depth, customer-success coverage, support SLA scale evidence, and
  referenceability. The gate consumes the `trust-controls` and `contracts`
  proof packets, so raw Enterprise control booleans alone cannot clear it.
- `GET /v1/enterprise/support-sla-readiness?format=markdown`
  admin-protected ticket-level support evidence for Unity Verified Solution and
  enterprise pilots, covering first response, resolution, Unity blockers,
  Studio/Enterprise high-severity breaches, Sev1 postmortems, and ownership.
- `GET /v1/strategy/business-model-proof?format=markdown` admin-protected
  aggregate proof packet for managed inference ARR, Pro module revenue share,
  Pro beta validation, marketplace GMV, and agentic playtest paid-studio
  adoption.
- `GET /v1/strategy/acquisition-readiness?format=markdown` admin-protected
  $200M-$500M readiness scorecard covering ARR, NRR, weekly active engine
  shippers, Unity verification, commercial game credits, enterprise logos,
  ARR/growth from the sales-motion packet, trust certifications from the
  certification-roadmap packet, strategic conversations, tri-engine runtime
  proof, and term-sheet/Series B gates.
- `GET /v1/strategy/unity-plugin-adoption?format=markdown` admin-protected
  Unity paid-customer gate for Asset Store growth, the 100-customer Unreal
  expansion trigger, and the 1,000-customer acquisition signal.
- `GET /v1/strategy/distribution-readiness?format=markdown` admin-protected
  GTM flywheel scorecard for engine marketplaces, Unity/Epic/Godot
  partnerships, education, organic signup, co-marketing, content cadence, and
  shipped-game proof. Strategic readiness requires the source proof packets;
  raw aggregate GTM counters alone cannot satisfy those gates.
- `GET /v1/strategy/commercial-credits?format=markdown` admin-protected
  shipped-game credit evidence registry for the five-commercial-game acquisition
  gate. It returns game/studio names, engines, stores, evidence counts, and
  public proof hosts only.
- `GET /v1/strategy/engine-partnerships?format=markdown` admin-protected
  Unity/Epic/Godot partner evidence registry for the Verified Solution,
  MegaGrant, and Godot sponsorship strategic-interest gates.
- `GET /v1/strategy/coding-agent-partnerships?format=markdown`
  admin-protected Anthropic/OpenAI/Cursor-style partnership evidence registry
  for public co-marketing, CLI integration validation, and MCP bridge proof.
- `GET /v1/strategy/education-adoption?format=markdown` admin-protected
  education evidence registry for the 5+ institution coursework adoption gate,
  with active seats, engine-export courses, and instructor-readiness proof.
- `GET /v1/strategy/content-cadence?format=markdown` admin-protected content
  engine registry for weekly tutorials/social/livestream/newsletter/changelog,
  organic signup attribution, GDC submissions, and game-jam sponsorship proof.
- `GET /v1/strategy/sales-motion-readiness?format=markdown` admin-protected
  sales-motion scorecard for revenue milestones, founder-led onboarding,
  AE/CSM sequencing, qualified pipeline coverage, and no-VC-before-$1M
  discipline. ARR, self-serve customer, and enterprise-account claims are gated
  by business-model, Unity adoption, and enterprise-logo proof packets.
- `GET /v1/strategy/engine-expansion-readiness?format=markdown`
  admin-protected Unity-to-Unreal-to-Godot sequencing gate that blocks Unreal
  until Unity adoption and quality evidence are green, tracks Godot community
  launch readiness, and marks the tri-engine acquisition signal only when all
  engine paths are proven.
- `GET /v1/enterprise/privacy-governance` plus `/ropa`, `/dpia`, and `/dpo`
  scoped views for GDPR Article 30/35/37 readiness evidence.
- `GET/POST/PATCH /v1/enterprise/incidents` admin-protected incident response
  ledger with containment tasks, GDPR breach clocks, and sanitized audit events.
- `GET /v1/enterprise/retention-policies`,
  `GET /v1/enterprise/retention-report`, and
  `GET/POST/PATCH /v1/enterprise/legal-holds` for deletion exceptions,
  retention policies, and legal-hold evidence.
- `GET/POST /v1/model-training-consent` authenticated explicit opt-in ledger
  for future Greybox Native training, defaulting missing consent to opted-out.
- `GET /v1/model-training/native-readiness` admin-protected Greybox Native
  corpus gate that admits only opted-in, human-reviewed, high-rated, hashed
  artifact candidates and fails closed on raw payloads, PII, revoked consent,
  or missing durable consent evidence.
- `POST /v1/privacy/requests`, requester-token status lookup, and
  admin-protected list/update routes for GDPR, CCPA, COPPA, India DPDPA, and
  model-training opt-out operations. Admins can generate a fulfillment package
  with matching request, SCIM, billing, and audit evidence.
- Billing audit helpers for plan includes, overage quantities, provider invoice
  reconciliation, and Stripe meter reconciliation.
- Local Checkout rehearsal coverage starts the real sibling marketplace server,
  signs a Stripe-style Checkout webhook, runs it through cloud, and verifies
  one persisted Pro-module order, entitlement, marketplace reconciliation
  report, replay, restart restore, and audit chain.
- Per-tenant month-to-date usage classification so every inference event records
  included-token application and billable overage before invoice generation.
- Post-provider usage metering failures fail closed without retrying or
  failing over to another model provider, preventing duplicate COGS after a
  successful completion. Observability failures are best-effort after metering
  succeeds and do not trigger model failover.
- Append-only file or Postgres billing ledger for usage, invoices, and Stripe
  meter-event attempts.
- Dry-run-first Stripe meter-event submitter; set `dryRun=false` only after
  provider and Stripe reconciliation passes. Live meter events require durable
  tenant billing identity and emit Stripe-compatible
  `payload[stripe_customer_id]` and `payload[value]` fields.
- Managed inference records usage into the billing ledger; Stripe meter-event
  submission is invoice-job only, and direct inference-time Stripe sinks fail
  closed to avoid silent non-metering.
- `GET /healthz` and `GET /metrics`.
- Tenant-aware defaults for Free, Indie, Studio, and Enterprise plans.
- PII redaction for emails, phones, credit cards, IPv4/IPv6 addresses, and
  nested inference logs. Managed inference redacts request payloads before
  provider calls, billing usage, and Langfuse traces; audit entries store only
  PII type/count classifications, and public errors are sanitized. The suite
  includes 100 redaction cases plus provider-boundary and error-boundary tests.
- `GET /v1/enterprise/pii-redaction-evidence` admin-protected customer-safe
  evidence packet for the redaction suite, provider-boundary redaction,
  audit-classification tags, and public error sanitization.
  Run `pnpm pii:evidence` in CI to produce the sanitized
  `GREYBOX_PII_REDACTION_EVIDENCE_JSON` source-hash payload. Use
  `pnpm --silent pii:evidence --format=dotenv` for hosting secrets and
  `pnpm --silent pii:evidence --format=github-env` for GitHub Actions env injection.
  Deployments can also mount that dotenv/json payload as a secret file and set
  `GREYBOX_PII_REDACTION_EVIDENCE_FILE`.

## Local Commands

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
pnpm start
pnpm onprem:smoke -- --url http://localhost:8080
```

Provider API keys are optional in alpha. Without them, the provider selector
marks the provider unavailable and the service fails over to the next available
candidate. Bedrock failover uses the AWS Bedrock Runtime API directly with
SigV4 signing; configure `AWS_REGION` or `AWS_DEFAULT_REGION`,
`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and optionally
`AWS_SESSION_TOKEN`. Override the Claude model id with `GREYBOX_BEDROCK_MODEL`
or `AWS_BEDROCK_MODEL`.
Configure Greybox Native with `GREYBOX_NATIVE_INFERENCE_URL`,
`GREYBOX_NATIVE_API_KEY`, optional `GREYBOX_NATIVE_MODEL`, and
`GREYBOX_NATIVE_MODEL_CARD_JSON`. The endpoint must be HTTPS except local smoke
tests on `localhost` or `127.0.0.1`; otherwise the provider remains unavailable
and requests fail over. The model card must show a passing readiness report,
10K+ consented projects, 50K+ eligible hashed artifacts, missing-consent
default opt-out, revoked-consent exclusion, PII sweep, human review, native-use
permission, and training-provider DPA evidence.
Set `GREYBOX_PROVIDER_POLICY_JSON` to enforce tenant or region-specific managed
inference provider allowlists/blocks at request time. Supported keys are
`allowedProviders`, `blockedProviders`, `regionAllowedProviders`, and `tenants`;
providers are `anthropic`, `openai`, `bedrock`, and `greybox-native`.
Set `GREYBOX_DATA_RESIDENCY_ENFORCEMENT=strict` plus
`GREYBOX_REGION_<US|EU|IN>_BASE_URL` on hosted regional Cloud deployments to
reject managed inference requests that arrive at the wrong regional endpoint;
the data-residency readiness report only marks hosted regions ready when this
strict runtime guard is active. Set `GREYBOX_TRUST_PROXY_HEADERS=1` only when a
trusted load balancer strips client-supplied `x-forwarded-*` headers and
rewrites them.
Set `GREYBOX_PROVIDER_DPA_JSON` with signed provider DPA evidence before
calling `GET /v1/enterprise/provider-policy/readiness`; the readiness report
fails closed when an allowed provider lacks signed DPA coverage for its region.
Set `GREYBOX_ENCRYPTION_EVIDENCE_JSON` from production KMS/storage/TLS/backup
exports before answering customer encryption questionnaires. Each residency
region must include a sanitized SHA-256 KMS export `sourceHash`; the report
never echoes raw key ids, key material, or secrets.

Set `GREYBOX_BILLING_LEDGER_DIR=/path/to/ledger` to persist managed-inference
usage events as append-only JSONL records for invoice and audit jobs.
Use `GREYBOX_BILLING_LEDGER_PG_URL` instead for hosted multi-replica metering;
the ledger keeps append-only usage, invoice, and Stripe meter-event records in
database order.
Set `GREYBOX_DEPLOYMENT_MODE=on-prem` in customer-managed Docker deployments so
the readiness report can distinguish a deliberate on-prem install.
Hosted production boot refuses memory, env, file, or unproven injected control
stores; use Postgres adapters or mark custom adapters `durable-injected` only
after production storage evidence exists. Set
`GREYBOX_DURABLE_INJECTED_EVIDENCE_JSON` to a sanitized packet of `{surfaceId,
surfaceLabel, status:"ready", adapter, backingStore, evidenceHash, generatedAt}`
entries; `surfaceLabel` must match the configured control surface,
`evidenceHash` must be a SHA-256 digest, `generatedAt` must be fresh within 30
days, and `backingStore` cannot be memory, file, env, local, or tmp.
`GREYBOX_CLOUD_ALLOW_EPHEMERAL_STORES=1` is break-glass only: it also requires
`GREYBOX_CLOUD_ALLOW_EPHEMERAL_STORES_REASON` and an ISO
`GREYBOX_CLOUD_ALLOW_EPHEMERAL_STORES_EXPIRES_AT` no more than 24 hours out.
All hosted-production bypass flags follow the same rule, including
`GREYBOX_CLOUD_ALLOW_UNVERIFIED_DATA_RESIDENCY`,
`GREYBOX_CLOUD_ALLOW_UNVERIFIED_PROVIDER_POLICY`,
`GREYBOX_CLOUD_ALLOW_UNVERIFIED_ENCRYPTION`,
`GREYBOX_CLOUD_ALLOW_UNVERIFIED_CHECKOUT`, and
`GREYBOX_CLOUD_ALLOW_DRY_RUN_METERING`. Legacy license prefix fallback uses
the same companion reason/expiry contract for
`GREYBOX_CLOUD_ALLOW_PREFIX_FALLBACK`.
Set `GREYBOX_BILLING_ADMIN_TOKEN` before calling billing job endpoints.
In hosted production, billing jobs that submit Stripe meter events must send
`dryRun=false` with a live `sk_live_` or `rk_live_` Stripe key; use
`GREYBOX_CLOUD_ALLOW_DRY_RUN_METERING=1` only as time-boxed break-glass
rehearsal mode. Live invoice jobs fail before invoice append unless the durable
tenant snapshot has `billing.stripeCustomerId`; `billing.stripeMeterPayload`
may override the default `stripe_customer_id` and `value` meter payload keys.
Set `STRIPE_WEBHOOK_SECRET`, `GREYBOX_STRIPE_WEBHOOK_EVENTS`,
`GREYBOX_MARKETPLACE_URL`, and `GREYBOX_MARKETPLACE_ADMIN_TOKEN` before
enabling marketplace Checkout webhooks. `GREYBOX_STRIPE_WEBHOOK_EVENTS` must
include `checkout.session.completed`, `charge.dispute.created`,
`charge.dispute.closed`, and `charge.refunded` in hosted production. The
billing webhook fails closed without a valid Stripe signature and forwards only
verified Checkout, dispute, and refund events to the matching marketplace
endpoints. When `GREYBOX_AUDIT_LOG_DIR` or
`GREYBOX_AUDIT_LOG_PG_URL` is configured, successful
forwarded Checkout sessions write a `billing.checkout_fulfilled` audit entry
with event id, session id, forwarding status, and idempotency status, but not
the raw Stripe payload, signature, webhook secret, buyer metadata, or
marketplace admin token.
Use `GET /v1/billing/checkout-readiness` with the billing admin token before
adding the hosted Stripe webhook endpoint.
Set `STRIPE_PRICE_INDIE`, `STRIPE_PRICE_STUDIO`, and optional
`GREYBOX_BILLING_CHECKOUT_SUCCESS_URL` / `GREYBOX_BILLING_CHECKOUT_CANCEL_URL`
before sharing hosted Checkout links. The public Checkout page requires a valid
tenant id, fails closed when price IDs are missing, rate-limits session
creation per tenant, and writes `billing.checkout_session_created` audit
evidence without Stripe keys, price IDs, or buyer email.
Use `GET /v1/billing/marketplace-report` with `report=reconciliation`,
`report=settlements`, or `report=tax-compliance` to pull JSON/CSV marketplace
finance exports through cloud. Cloud forwards only the server-held marketplace
admin token, copies safe report query parameters, and writes an audit entry.
Set `WORKOS_JWKS_URL`, `WORKOS_ISSUER`, and `GREYBOX_AUTH_AUDIENCE` to enable
WorkOS JWT verification. Signed WorkOS organization ids map to isolated
Greybox tenant ids and override any caller-supplied tenant headers.
Set `GREYBOX_DEFAULT_REGION=us|eu|in` to choose the default data-residency
region. Managed-token callers may send `x-greybox-region`; WorkOS JWTs may
carry `data_region` or `https://greybox.studio/data-region`.
Set `GREYBOX_REGION_<US|EU|IN>_BASE_URL`, `STORAGE_BOUNDARY`,
`PROVIDER_EGRESS`, `TRANSFER_BASIS`, and `BACKUP_BOUNDARY` to populate the
data-residency readiness matrix for enterprise review.
Set `GREYBOX_AWS_VPC_*`, `GREYBOX_AZURE_VNET_*`, or
`GREYBOX_PRIVATE_NETWORKS_JSON` to populate private-network readiness for AWS
VPC peering and Azure VNet peering pilots.
Set `GREYBOX_WORKOS_GROUP_ROLE_MAP` to map WorkOS groups to Greybox roles and
scopes for enterprise SSO. Audit export accepts `audit:read` or `admin`;
billing invoice jobs accept `billing:write`, `billing-admin`, or `admin`.
Set `GREYBOX_TENANT_STORE_DIR` for durable tenant isolation state. Add
`GREYBOX_TENANT_STORE_SEAL_KEY` and `GREYBOX_TENANT_STORE_SEAL_KEY_ID` to HMAC
seal tenant snapshots with a KMS-held or rotation-managed secret; sealed stores
fail closed when the file is edited or loaded with the wrong key.
Set `GREYBOX_SCIM_TOKEN`, `GREYBOX_SCIM_TENANT_ID`, and
`GREYBOX_SCIM_STORE_DIR` to enable durable SCIM provisioning.
Use `GREYBOX_SCIM_PG_URL` instead of `GREYBOX_SCIM_STORE_DIR` for
multi-replica SCIM provisioning; the Postgres adapter applies full-snapshot
updates in a single transaction.
Set `GREYBOX_PRIVACY_REQUEST_DIR` to enable durable privacy-rights request
intake and admin processing.
Use `GREYBOX_PRIVACY_REQUEST_PG_URL` instead for hosted multi-replica privacy
ops; requester access tokens are stored only as SHA-256 hashes.
Set `GREYBOX_SECURITY_INCIDENT_DIR` to enable durable incident-response
tracking and GDPR breach-clock evidence.
Use `GREYBOX_SECURITY_INCIDENT_PG_URL` instead for hosted multi-replica
incident evidence; every update appends a new version and reads return the
latest incident state.
Set `GREYBOX_SUPPORT_SLA_JSON` to a sanitized support-ticket export before
calling `GET /v1/enterprise/support-sla-readiness`; include ticket id, product
area, severity, tier, status, timestamps, owner/escalation owner, blocker flag,
and postmortem URL, never raw ticket bodies or customer personal data.
Set `GREYBOX_MODEL_TRAINING_CONSENT_DIR` to enable durable explicit opt-in
records for future Greybox Native training.
Use `GREYBOX_MODEL_TRAINING_CONSENT_PG_URL` instead for hosted multi-replica
consent enforcement; prompts, outputs, and game-IP payload bodies remain out of
the consent store.
Set `GREYBOX_NATIVE_TRAINING_CANDIDATES_JSON` to a sanitized array of candidate
artifact metadata before calling `GET /v1/model-training/native-readiness`.
Each candidate should include `projectId`, optional `artifactId`, `artifactType`,
`contentSha256`, `qualityScore`, `humanReviewed`, `piiDetected`, and
`dataCategories`; do not include prompt, output, HTML, markdown, or game-IP
payload bodies.
Set `GREYBOX_LEGAL_HOLD_DIR` to enable durable legal-hold tracking for
deletion exceptions and retention reports.
Use `GREYBOX_LEGAL_HOLD_PG_URL` instead for hosted multi-replica legal-hold
evidence; every release or update appends a new version and latest-state reads
keep privacy deletion blockers current.
Set `GREYBOX_AUDIT_LOG_DIR` or `GREYBOX_AUDIT_LOG_PG_URL`, plus
`GREYBOX_AUDIT_ADMIN_TOKEN`, for append-only, hash-chained audit logs,
CSV/Splunk JSON export, and verification. Use Postgres for multi-replica
enterprise deployments; the app takes a transaction-scoped advisory lock during
append so the global hash chain stays intact.
Set `GREYBOX_OFFLINE_LICENSE_FILE` plus either `GREYBOX_OFFLINE_LICENSE_PUBLIC_KEY`
or `GREYBOX_OFFLINE_LICENSE_PUBLIC_KEY_FILE` for on-prem license validation.
Unity plugin license validation accepts bearer keys prefixed with
`gbx_indie_`, `gbx_pro_`, `gbx_studio_`, `gbx_enterprise_`, or matching
`greybox_*` prefixes. Pro keys unlock round-trip sync, the MCP bridge, and the
priority queue for one seat. Studio, site, and Enterprise keys also return SSO,
custom skill-pack, site-license, and 25-seat entitlements. In production, set
`GREYBOX_LICENSE_RECORDS_JSON` to an array of hashed records so prefix-only
alpha keys are rejected unless their SHA-256 hash is registered:
`[{"tokenHash":"<64-char-sha256>","tier":"pro","status":"active","expiresAt":"2027-05-17T00:00:00.000Z","features":{"seatLimit":4}}]`.
Use `status:"revoked"` or `status:"suspended"` to fail closed immediately.
Set `GREYBOX_PRO_MODULE_SECRET_MASTER_KEY` before serving Pro module secrets.
Set `GREYBOX_PRO_MODULE_BUNDLES_JSON` to the Greybox Pro release manifest,
`GREYBOX_PRO_MODULE_BUNDLE_UPLOAD_PLAN_JSON` to the matching upload plan, and
`GREYBOX_PRO_MODULE_BUNDLE_PUBLISH_PROOF_JSON` to the sanitized publish proof so
Cloud cross-checks object keys, filenames, hashes, byte counts, content types,
and storage receipt readiness before serving release-manifest bundle downloads.
Alternatively set `GREYBOX_PRO_MODULE_CLOUD_SOURCE_ENV_JSON` to the
`publish-bundles --cloud-env` artifact; direct env vars override the artifact.
Optional `GREYBOX_PRO_MODULE_ENTITLEMENTS_JSON` maps short license hashes to
paid pack ids for Indie/pay-per-pack unlocks.
Optional `GREYBOX_PRO_MODULE_ENTITLEMENT_LOOKUP_KEYS_JSON` maps marketplace
lookup keys to `{ licenseHash, modules, status }` records for Pro-module
checkout activation; `status:"revoked"` fails closed for refunded or revoked
Marketplace entitlements.
Set `GREYBOX_MARKETPLACE_URL` and `GREYBOX_MARKETPLACE_ADMIN_TOKEN` to let
cloud claim marketplace entitlements on demand before deriving `.gbpro`
secrets. Revoked Marketplace claims are persisted before Cloud checks cached
grants, so stale active records cannot survive a refund lookup.
Set `GREYBOX_SUBPROCESSORS_JSON` to override the planned default subprocessor
registry for production order forms or customer-specific DPAs.
Set `GREYBOX_DPO_NAME`, `GREYBOX_DPO_EMAIL`, and
`GREYBOX_DPO_APPOINTED_AT` after counsel appoints the DPO. Optional
`GREYBOX_PRIVACY_GOVERNANCE_JSON` overrides the default ROPA/DPIA evidence for
customer-specific or counsel-approved processing records.
Set `GREYBOX_PRIVACY_CONTACT_EMAIL`, `GREYBOX_GRIEVANCE_EMAIL`, and
`GREYBOX_PRIVACY_POLICY_URL` before launch. Optional
`GREYBOX_PRIVACY_DISCLOSURES_JSON` overrides the default CCPA/COPPA/DPDPA
disclosure checklist after counsel approval.
Use `GET /v1/enterprise/onprem-readiness` with the audit admin bearer token
after `docker compose -f infra/docker/compose.onprem.yaml up --build`; the
response reports pass/warn/fail checks and never includes raw token values.
Use `GET /v1/enterprise/trust-controls` with the same admin path for a
SOC 2 / ISO 27001 readiness evidence map across identity, audit logging,
incident response, privacy, billing, on-prem operations, and AI log
minimization.
Use `GET /v1/enterprise/trust-packet?format=markdown` to collect the
enterprise diligence bundle for security review.
Use `GET /v1/enterprise/certification-roadmap` to track the month 6 GDPR/
CCPA/COPPA/DPDPA, month 12 SOC 2 Type I, month 18 SOC 2 Type II, and month 24
ISO 27001 readiness plan. The response is roadmap evidence only, not a
certification artifact.
Use `GET /v1/enterprise/security-questionnaire?format=csv` to generate a
customer-review questionnaire without hand-copying trust evidence.
Use `GET /v1/enterprise/pilot-readiness?format=markdown` before committing to
the first five enterprise pilots, $40K+ annual contracts, on-prem installs, or
private-network/data-residency commitments. The pilot gate consumes
`GREYBOX_SUPPORT_SLA_JSON` and fails when ticket-level support evidence has
Unity blockers, Studio/Enterprise high-severity breaches, missing Sev1
postmortems, or ownership gaps.
Set `GREYBOX_ENTERPRISE_LOGO_METRICS_JSON` to sanitized aggregate Enterprise
sales and customer-success metrics before calling
`GET /v1/enterprise/logo-expansion-readiness`. The response returns only
counts, ratios, and readiness gates for the 5-to-50 logo plan; never include
customer names, contact data, deal notes, or game IP in the metrics JSON. The
logo-expansion gate also consumes `GREYBOX_SUPPORT_SLA_JSON` and fails closed
when support evidence is missing, Unity blockers remain open, or high-severity
Studio/Enterprise SLA breaches exist. It also consumes
`GET /v1/enterprise/trust-controls` and `GET /v1/enterprise/contracts`; SSO,
SCIM, audit export, on-prem, private-network, data-residency, or DPA/MSA
booleans in the metrics JSON do not clear Enterprise control readiness without
those proof packets.
Set `GREYBOX_ACQUISITION_METRICS_JSON` to a sanitized aggregate metrics object
before calling `GET /v1/strategy/acquisition-readiness`, for example
`{"arrUsd":5000000,"nrr":1.2,"weeklyActiveDesignersShippingToEngines":30000}`.
The endpoint also consumes the enterprise logo expansion packet from
`GREYBOX_ENTERPRISE_LOGO_METRICS_JSON`, `GREYBOX_SUPPORT_SLA_JSON`,
`GREYBOX_COMMERCIAL_CREDITS_JSON`, `GREYBOX_STRATEGIC_OUTREACH_JSON`,
`GREYBOX_NORTH_STAR_EVENTS_JSON`, `GREYBOX_UNITY_ADOPTION_JSON`, and
`GREYBOX_BUSINESS_MODEL_PROOF_JSON`, plus the engine-expansion packet from
`GREYBOX_ENGINE_EXPANSION_METRICS_JSON`, the sales-motion packet, and the
certification-roadmap packet; raw counts alone cannot satisfy acquisition
readiness. ARR and YoY growth must reconcile to the sales-motion packet and its
revenue-source proof. NRR in the acquisition pitch must be backed by the
enterprise expansion packet's NRR, expansion ARR, and low-churn evidence. SOC 2
Type II / ISO 27001 claims must reconcile to the certification-roadmap packet,
auditor/certification-body evidence, and the enterprise trust packet; raw
SOC/ISO fields alone do not clear the pitch gate. $200M+ valuation outcomes
must reconcile to sanitized strategic-outreach term-sheet evidence; raw
term-sheet or Series B valuation fields alone do not mark the mission complete.
It is admin-protected and returns only normalized operating metrics, never
buyer notes, customer names, game IP, tokens, or raw CRM exports.
Set `GREYBOX_BUSINESS_MODEL_PROOF_JSON` to sanitized aggregate evidence before
calling `GET /v1/strategy/business-model-proof`. The packet covers managed
inference ARR and billing reconciliation, Pro module revenue mix, attach and
expansion proof, Pro beta validation, signed bundle enforcement, and
published-object proof, marketplace GMV with source-ready seller/buyer
concentration, Checkout order/GMV attribution, settled creator-payout value,
and Cloud-forwarded Checkout/refund/dispute Stripe event audit evidence,
payout/tax/risk-reserve readiness, and paid studio adoption with QA-savings
proof for agentic playtest.
Do not include customer names, contacts, deal notes, provider secrets, design
partner ids, raw prompts, artifact payloads, or private game IP.
Set `GREYBOX_STRATEGIC_OUTREACH_JSON` to sanitized strategic-buyer outreach
records before calling `GET /v1/strategy/strategic-outreach`. The response
tracks acquisition conversations with Unity, Roblox, Epic, Krafton, Tencent,
or Adobe using stages and evidence counts only; never include contacts, raw
meeting notes, deal-room URLs, buyer confidential materials, or game IP.
Set `GREYBOX_NORTH_STAR_EVENTS_JSON` to opt-in product analytics events before
calling `GET /v1/strategy/north-star`. Raw identifiers are used only for
deduplication; the response returns aggregate weekly active designers shipping
to Unity, Unreal, or Godot plus activation-funnel and engine breakdown counts.
Duplicate event ids are ignored, and activation conversion is counted only when
the designer progresses through signup, project, artifact, save, and engine
export in order.
Set `GREYBOX_UNITY_ADOPTION_JSON` to sanitized aggregate plugin metrics before
calling `GET /v1/strategy/unity-plugin-adoption`. The report also reads hashed
license registry records and `license.validated` audit entries, but returns
only counts and gate status. Unreal expansion and acquisition-scale plugin
claims require `sourceAdoptionReady:true` from the Unity adoption packet, not
raw paid-customer counts alone.
Set `GREYBOX_DISTRIBUTION_METRICS_JSON` to sanitized aggregate GTM metrics
before calling `GET /v1/strategy/distribution-readiness`. The response returns
only channel counts and readiness gates, not partner contacts, customer names,
or unpublished deal notes. Distribution readiness also consumes
`GREYBOX_ENGINE_PARTNERSHIPS_JSON`, `GREYBOX_CODING_AGENT_PARTNERSHIPS_JSON`,
`GREYBOX_EDUCATION_ADOPTION_JSON`, `GREYBOX_CONTENT_CADENCE_JSON`, and
`GREYBOX_COMMERCIAL_CREDITS_JSON`; raw partner, education, signup,
co-marketing, content, or game-credit counters alone cannot prove readiness.
Set `GREYBOX_COMMERCIAL_CREDITS_JSON` to sanitized shipped-game credit records
before calling `GET /v1/strategy/commercial-credits`. Each counted game needs a
commercial release flag, Greybox credit flag, human-designer credit flag,
generator metadata flag, store-page evidence, and credit evidence with SHA-256
source hashes. The response never returns hashes, contacts, private builds, raw
game IP, contracts, or unpublished revenue data.
Set `GREYBOX_ENGINE_PARTNERSHIPS_JSON` to sanitized Unity, Epic, and Godot
program records before calling `GET /v1/strategy/engine-partnerships`. Records
track stages and SHA-256 evidence hashes for Unity Verified Solution, Epic
MegaGrant, and Godot sponsorship; responses return only program status, counts,
staleness, public proof hosts, and readiness gates.
Set `GREYBOX_CODING_AGENT_PARTNERSHIPS_JSON` to sanitized Anthropic, OpenAI,
Cursor, Cognition, Google, or other coding-agent partner records before calling
`GET /v1/strategy/coding-agent-partnerships`. The gate requires a public
Anthropic/OpenAI co-marketing announcement, three active CLI partner motions,
validated MCP/CLI integration evidence, and fresh SHA-256 evidence digests.
Set `GREYBOX_EDUCATION_ADOPTION_JSON` to sanitized education program records
before calling `GET /v1/strategy/education-adoption`. Each counted institution
needs active-term coursework, accreditation, free education licensing,
instructor readiness, engine-export coursework, and SHA-256 syllabus/license
evidence without personal learner data or private rosters.
Set `GREYBOX_CONTENT_CADENCE_JSON` to sanitized content and event records
before calling `GET /v1/strategy/content-cadence`. The gate requires weekly
tutorial, social, livestream, newsletter, and changelog archives, 200+
attributed organic signups, a GDC submission, two active jam sponsorships, and
SHA-256 public archive evidence.
Set `GREYBOX_SALES_MOTION_METRICS_JSON` to sanitized aggregate revenue, sales,
pipeline, onboarding, CSM, and financing metrics before calling
`GET /v1/strategy/sales-motion-readiness`. Do not include customer names,
contacts, private deal notes, investor drafts, or credentials. Sales readiness
also consumes `GREYBOX_BUSINESS_MODEL_PROOF_JSON`, `GREYBOX_UNITY_ADOPTION_JSON`,
and `GREYBOX_ENTERPRISE_LOGO_METRICS_JSON`; raw ARR, self-serve, or enterprise
account counts alone cannot clear diligence-grade sales readiness.
Set `GREYBOX_ENGINE_EXPANSION_METRICS_JSON` to sanitized aggregate engine
metrics before calling `GET /v1/strategy/engine-expansion-readiness`. The gate
keeps Unreal behind the 100-paying-Unity-customer quality trigger, treats Godot
as the community goodwill path, and requires
`unrealReleaseReadiness.cloudMetrics.unrealSourceReady:true` plus
`godotReleaseReadiness.cloudMetrics.godotSourceReady:true` before counting
second-engine runtime claims. Raw top-level source-ready booleans are ignored;
never include partner contacts, customer names, private deal notes, or game IP.
Use `GET /v1/enterprise/data-residency/readiness` to verify US/EU/India
regional deployment, storage, provider egress, transfer, and backup evidence.
Use `GET /v1/enterprise/private-network/readiness` to verify AWS/Azure peering
IDs, CIDR overlap checks, route/security updates, DNS needs, and reachability
timestamps.
Use `GET /v1/enterprise/subprocessors` to disclose planned or active
subprocessors for enterprise diligence. Filter by `status`, `purpose`, or
`region`.
Use `GET /v1/privacy/disclosures` for public CCPA/CPRA, COPPA, and India DPDPA
disclosure readiness. Filter by `jurisdiction=ccpa-cpra|coppa|india-dpdpa`.
Use `GET /v1/enterprise/privacy-governance` to review ROPA, DPIA, and DPO
evidence. Scoped views live at `/ropa`, `/dpia`, and `/dpo`.
Use `GET /v1/enterprise/retention-report?tenantId=<id>` and
`GET/POST/PATCH /v1/enterprise/legal-holds` to make deletion exceptions and
legal holds reviewable.
Use `GET/POST/PATCH /v1/enterprise/incidents` with the audit admin token or
WorkOS security scopes to track incidents without putting raw summaries or
secrets into the audit log.
Use `GET/POST /v1/model-training-consent` to record separate model-training
opt-ins, opt-outs, and revocations. Missing records are treated as opted-out,
and audit entries keep only a consent-text hash.
Use `GET /v1/model-training/native-readiness?format=markdown` with an admin
token before any Greybox Native fine-tuning job. The report is readiness
evidence only; it never exports customer artifact content.
Use `POST /v1/privacy/requests` for public rights intake. The response returns
a requester status token once; only a hash is stored. Admin list/update routes
use the audit admin token or WorkOS privacy scopes. Admins can call
`GET /v1/privacy/requests/:id/fulfillment-package` to collect response evidence
and retention exceptions.

## Managed Inference Opt-In

The Apache open core stays generic: it already supports OpenAI-compatible BYOK
proxies. Greybox Cloud speaks that surface directly, so no proprietary logic has
to enter `apps/` or `packages/`.

Recommended UI settings:

- Protocol: OpenAI
- Base URL: `https://cloud.greybox.studio/v1`
- API key: Greybox managed-inference token
- Model: `greybox-design`, `greybox-cheap-chat`, `greybox-playtest`, or
  `greybox-native`

The `greybox-native` alias explicitly prefers the Greybox Native provider when
the hosted small-model endpoint is configured; otherwise routing falls back to
the managed provider stack without exposing the Native API key to the open core.

## Enterprise Trust Packet

- `legal/DPA_TEMPLATE.md` - data processing addendum template.
- `legal/ENTERPRISE_PILOT_READINESS.md` - first enterprise pilot go/no-go
  packet.
- `legal/ENTERPRISE_TRUST_PACKET.md` - admin-protected diligence packet.
- `legal/MSA_TEMPLATE.md` - master services agreement template.
- `legal/DATA_RESIDENCY.md` - US/EU/India residency controls and evidence.
- `legal/ENCRYPTION_READINESS.md` - KMS, store, TLS, backup, and secret-manager
  readiness.
- `legal/INCIDENT_RESPONSE.md` - security incident and GDPR breach-clock
  workflow.
- `legal/MODEL_TRAINING_CONSENT.md` - explicit opt-in workflow for future
  Greybox Native training.
- `legal/PRIVATE_NETWORKING.md` - AWS VPC and Azure VNet private-network
  readiness.
- `legal/PRIVACY_DISCLOSURES.md` - CCPA/CPRA, COPPA, and India DPDPA disclosure
  readiness.
- `legal/PRIVACY_GOVERNANCE.md` - ROPA, DPIA, and DPO readiness evidence.
- `legal/PRIVACY_RIGHTS.md` - DSAR/CCPA/COPPA/DPDPA intake workflow and
  evidence references.
- `legal/RETENTION.md` - retention policy and legal-hold workflow.
- `legal/CERTIFICATION_ROADMAP.md` - GDPR, SOC 2, and ISO roadmap evidence.
- `legal/SECURITY_QUESTIONNAIRE.md` - generated enterprise questionnaire.
- `legal/SUBPROCESSORS.md` - subprocessor registry and 30-day change notice
  workflow.
