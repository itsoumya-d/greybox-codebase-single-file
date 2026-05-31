# Greybox Cloud Operations

## WorkOS Auth

Production managed inference should verify WorkOS-issued RS256 JWTs before
creating tenant-scoped usage records.

Required environment:

```bash
export WORKOS_JWKS_URL=<jwks-url-from-workos>
export WORKOS_ISSUER=https://api.workos.com
export GREYBOX_AUTH_AUDIENCE=greybox-cloud
export GREYBOX_WORKOS_GROUP_ROLE_MAP='{"Design Leads":{"roles":["admin","designer"],"scopes":["audit:read","inference:write"]},"External Reviewers":{"roles":["viewer"],"scopes":["project:read"]}}'
```

When a JWT contains `org_id` or `organization_id`, Greybox maps it to
`workos:<org-id>` and ignores any caller-supplied `x-greybox-tenant` header.
Use `GET /v1/auth/session` to inspect the resolved tenant context without
exposing token hashes.

Default group mappings are built in for `Greybox Admins`,
`Greybox Billing Admins`, `Greybox Designers`, and `Greybox Viewers`. The JSON
map above extends or overrides customer-specific IdP group names.
Admin endpoints accept either their long random admin token or a signed WorkOS
JWT with the mapped scope: `audit:read` for audit export and `billing:write`
for billing invoice jobs.

## Unity License Validation

The Unity editor calls `POST /v1/licenses/validate` with its license key in the
Authorization bearer token. The response returns `tier`, `plan`,
`licenseHash`, and feature booleans for import, round-trip sync, MCP bridge,
watermarking, and project limits. It must never return the raw key.
Successful validation writes a `license.validated` audit entry with the short
license hash, tier, feature gates, route, region, and auth provider only.

Accepted alpha key prefixes are `gbx_indie_`, `gbx_pro_`, `gbx_studio_`,
`gbx_enterprise_`, and equivalent `greybox_*` prefixes. Site and Enterprise
keys map to the Studio editor tier so round-trip sync and MCP stay enabled.
Unknown prefixes return `401 invalid_license`; missing keys return
`401 license_required`.

Production and enterprise deployments should set `GREYBOX_LICENSE_RECORDS_JSON`
to an array of hashed active licenses. Once any records are configured, prefix
fallback is disabled for bearer keys: unregistered keys return
`401 invalid_license`, expired records return `401 license_expired`, and
`status:"revoked"` / `status:"suspended"` records return matching failures.
Records use the full SHA-256 hash of the license key and may override feature
limits returned to Unity:

```bash
export GREYBOX_LICENSE_RECORDS_JSON='[{"tokenHash":"<64-char-sha256>","tier":"pro","plan":"pro","status":"active","expiresAt":"2027-05-17T00:00:00.000Z","features":{"seatLimit":4}}]'
```

### Signed License Tokens (Ed25519, rotation-capable)

For licenses issued out-of-band (sales-led contracts, on-prem trials, embedded
deployments), Cloud accepts self-contained Ed25519-signed bearer tokens with the
`gbxv2.<base64url-payload>.<base64url-signature>` shape. The payload is the
canonical-JSON form of:

```json
{
  "licenseId": "lic-abc-001",
  "tier": "pro",
  "plan": "pro",
  "publicKeyId": "k1",
  "issuedAt": "2026-01-01T00:00:00.000Z",
  "expiresAt": "2027-01-01T00:00:00.000Z",
  "features": { "seatLimit": 10 }
}
```

Configure the trust-anchor public keys (current + previous, for rotation):

```bash
export GREYBOX_LICENSE_SIGNING_KEYS_JSON='[
  {"keyId":"k1","publicKeyPem":"-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"},
  {"keyId":"k2-current","publicKeyPem":"-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"}
]'
```

When *any* signing key is configured, prefix fallback is disabled, so an
unregistered `gbx_pro_*` token returns `401 invalid_license`. Signed tokens
travel through the same `license.validated` audit path as record-backed
licenses. Rotation procedure: add the new keyId alongside the old, re-issue new
licenses against the new key, then remove the old keyId once outstanding tokens
have rolled.

## Tenant Configuration Persistence

`TenantStore` is in-memory by default. For first-pilot deployments, point it at
a durable directory and tenant data survives restart:

```bash
export GREYBOX_TENANT_STORE_DIR=/secure/greybox/tenants
```

The store writes `tenants.json` atomically (temp file + rename) after every
`getOrCreate`, `getOrCreateForOrganization`, and `upsert`. Snapshot format is
`{ version: 1, tenants: [...], organizationTenantIds: [...] }`. Corrupt or
future-version snapshots are ignored and the process starts with an empty
store rather than crashing; investigate immediately when this happens.

This persistence layer is a step on the way to a Postgres backend: the
`TenantStore` interface is unchanged across backends, so the swap can land
without touching callers.

## Audit Log Sealing

`GREYBOX_AUDIT_LOG_DIR` writes a SHA-256 hash chain. For production and
on-prem pilots, also configure an operator-held seal key so every entry gets an
HMAC-SHA256 signature over its sequence and entry hash:

```bash
export GREYBOX_AUDIT_SEAL_KEY_ID=prod-2026-q2
export GREYBOX_AUDIT_SEAL_KEY=<long-random-secret>
```

The raw seal key never appears in exports. `GET /v1/audit-log/verify` validates
both the hash chain and the HMAC seal when the key is configured. This does not
replace KMS/HSM signing, but it blocks the easy failure mode where a filesystem
attacker rewrites JSONL entries and recomputes plain hashes.

## Pro Module Secrets

The open-core daemon calls `POST /v1/pro-modules/license-secret` with the
creator's Greybox bearer key plus `{ "moduleId", "payloadSha256" }`. Cloud
returns only a derived `decryptionSecret`, the short `licenseHash`, algorithm,
and expiry metadata. It must never return the raw key or proprietary bundle
payload bytes.
Successful issuance writes a `pro_module.secret_issued` audit entry with the
module id, short license hash, expiry, algorithm, payload digest, and entitlement
path only. Raw license keys, marketplace lookup keys, and decryption secrets are
excluded from the audit log.

Required environment:

```bash
export GREYBOX_PRO_MODULE_SECRET_MASTER_KEY=<long-random-secret>
```

Pro, Studio, site, and Enterprise keys can unlock all signed `.gbpro` bundles.
Indie/pay-per-pack unlocks use explicit entitlements keyed by the 16-character
license hash returned from `/v1/licenses/validate`:

```bash
export GREYBOX_PRO_MODULE_ENTITLEMENTS_JSON='{"abc123def4567890":["cozy-sim-pack","steam-next-fest-planner"]}'
```

## Data Residency

Greybox supports tenant residency labels for US, EU, and India from day one.

```bash
export GREYBOX_DEFAULT_REGION=us # us | eu | in
```

Managed-token callers may set `x-greybox-region`, `x-greybox-data-region`, or
`x-greybox-data-residency`. WorkOS customers should send `data_region` or the
custom claim `https://greybox.studio/data-region`. Supported aliases include
`us`, `usa`, `eu`, `eea`, `european-union`, `in`, and `india`.

The resolved region is returned by `GET /v1/auth/session` and
`GET /v1/enterprise/data-residency`, stored on newly created tenants, and used
when managed inference creates usage records. See `legal/DATA_RESIDENCY.md` for
the production cutover checklist.

Region-readiness matrix:

```bash
export GREYBOX_DATA_RESIDENCY_ENFORCEMENT=strict
export GREYBOX_REGION_US_BASE_URL=https://cloud-us.greybox.studio
export GREYBOX_REGION_US_STORAGE_BOUNDARY=local
export GREYBOX_REGION_US_PROVIDER_EGRESS=customer-selected
export GREYBOX_REGION_US_TRANSFER_BASIS=same-region
export GREYBOX_REGION_US_BACKUP_BOUNDARY=local

curl -sS "https://cloud.greybox.studio/v1/enterprise/data-residency/readiness" \
  -H "authorization: Bearer $GREYBOX_AUDIT_ADMIN_TOKEN"
```

Repeat those `GREYBOX_REGION_<US|EU|IN>_*` settings for every committed
enterprise region before signing data-residency language. The readiness matrix
does not pass hosted regions unless strict runtime enforcement is enabled.

Hosted regional deployments should also set
`GREYBOX_DATA_RESIDENCY_ENFORCEMENT=strict`. In strict mode, managed inference
and OpenAI-compatible chat requests are rejected unless `x-forwarded-host` (or
`host`) matches the tenant region's `GREYBOX_REGION_<REGION>_BASE_URL`.

## Private Networking

`GET /v1/enterprise/private-network/readiness` is protected by the audit admin
token. It tracks AWS VPC peering and Azure VNet peering evidence for enterprise
customers that require private connectivity.

```bash
export GREYBOX_AWS_VPC_PEERING_ID=pcx-abc123def456
export GREYBOX_AWS_VPC_CUSTOMER_NETWORK_ID=vpc-aaa111bbb222
export GREYBOX_AWS_VPC_GREYBOX_NETWORK_ID=vpc-ccc333ddd444
export GREYBOX_AWS_VPC_CIDR_NON_OVERLAP=true
export GREYBOX_AWS_VPC_ROUTES_UPDATED=true
export GREYBOX_AWS_VPC_SECURITY_RULES_SCOPED=true
export GREYBOX_AWS_VPC_LAST_VALIDATED_AT=2026-05-17T00:00:00.000Z

curl -sS "https://cloud.greybox.studio/v1/enterprise/private-network/readiness" \
  -H "authorization: Bearer $GREYBOX_AUDIT_ADMIN_TOKEN"
```

Use `GREYBOX_PRIVATE_NETWORKS_JSON` for multiple customer profiles. Do not
store cloud credentials, route table dumps, firewall exports, or packet
captures in the readiness report.

## SCIM Provisioning

SCIM is tenant-scoped by token. Generate a unique token per enterprise customer
and store its tenant id in the deployment environment that serves that customer.

Required environment:

```bash
export GREYBOX_SCIM_TOKEN=<long-random-token>
export GREYBOX_SCIM_TENANT_ID=tenant_enterprise_123
export GREYBOX_SCIM_STORE_DIR=/secure/greybox/scim
export GREYBOX_AUDIT_LOG_DIR=/secure/greybox/audit
```

Identity provider base URL:

```text
https://cloud.greybox.studio/v1/scim/v2
```

Supported now: service discovery, user create, user list/filter, user read,
full replace, PATCH updates, and DELETE-as-deactivate. Group provisioning is a
future extension once the Studio workspace role model is finalized.

## Privacy Rights Intake

Enable durable GDPR/CCPA/COPPA/DPDPA intake before launch:

```bash
export GREYBOX_PRIVACY_REQUEST_DIR=/secure/greybox/privacy-requests
```

Public intake:

```bash
curl -sS https://cloud.greybox.studio/v1/privacy/requests \
  -H "content-type: application/json" \
  -d '{"tenantId":"tenant_eu","jurisdiction":"gdpr","requestType":"access","contactEmail":"player@example.com"}'
```

The response returns a requester `accessToken` once. Store only the hashed token
server-side. Requesters check status with `authorization: Bearer <accessToken>`.
Admin list/update uses `GREYBOX_AUDIT_ADMIN_TOKEN` or WorkOS `privacy:read` /
`privacy:write` scopes:

```bash
curl -sS "https://cloud.greybox.studio/v1/privacy/requests?tenantId=tenant_eu" \
  -H "authorization: Bearer $GREYBOX_AUDIT_ADMIN_TOKEN"

curl -sS -X PATCH "https://cloud.greybox.studio/v1/privacy/requests/prv_example" \
  -H "authorization: Bearer $GREYBOX_AUDIT_ADMIN_TOKEN" \
  -H "content-type: application/json" \
  -d '{"status":"in-progress","note":"Identity verification passed."}'
```

Fulfillment package:

```bash
curl -sS "https://cloud.greybox.studio/v1/privacy/requests/prv_example/fulfillment-package" \
  -H "authorization: Bearer $GREYBOX_AUDIT_ADMIN_TOKEN"
```

The package gathers matching privacy-request records, SCIM account records,
tenant billing evidence, tenant audit evidence, active legal holds, due dates,
and recommended response actions. Billing, security audit, and legal-hold
records are marked as retention exceptions rather than blindly deleted.

Default due dates are operational guardrails: GDPR uses one calendar month with
a two-month extension marker, CCPA uses 45/90 days, and COPPA/DPDPA default to
a 30-day internal SLA until counsel overrides the workflow.

## Privacy Disclosures

`GET /v1/privacy/disclosures` is public and returns sanitized launch-readiness
evidence for CCPA/CPRA, COPPA, and India DPDPA disclosures.

```bash
export GREYBOX_PRIVACY_CONTACT_EMAIL=privacy@greybox.studio
export GREYBOX_GRIEVANCE_EMAIL=privacy@greybox.studio

curl -sS "https://cloud.greybox.studio/v1/privacy/disclosures?jurisdiction=ccpa-cpra"
```

The default posture is no sale/share of personal information, no limitable
sensitive-personal-information use, no child-directed collection, and no
school-use flow until counsel approves the public copy and product gates.

## Privacy Governance

`GET /v1/enterprise/privacy-governance` returns the GDPR readiness register for
ROPA, DPIA, and DPO evidence. It is admin protected by
`GREYBOX_AUDIT_ADMIN_TOKEN` or WorkOS `privacy:read` / `audit:read` scopes.
Scoped views are available at `/ropa`, `/dpia`, and `/dpo`.

```bash
export GREYBOX_DPO_NAME="Greybox Privacy Lead"
export GREYBOX_DPO_EMAIL=privacy@greybox.studio
export GREYBOX_DPO_APPOINTED_AT=2026-05-17T00:00:00.000Z

curl -sS "https://cloud.greybox.studio/v1/enterprise/privacy-governance" \
  -H "authorization: Bearer $GREYBOX_AUDIT_ADMIN_TOKEN"
```

Optional `GREYBOX_PRIVACY_GOVERNANCE_JSON` lets counsel replace the default
ROPA/DPIA records without code changes. The report is readiness evidence only;
it is not a regulator filing or legal opinion.

## Retention And Legal Holds

Set `GREYBOX_LEGAL_HOLD_DIR` to enable the durable legal-hold ledger, or
`GREYBOX_LEGAL_HOLD_PG_URL` for hosted multi-replica hold evidence.

```bash
curl -sS "https://cloud.greybox.studio/v1/enterprise/retention-policies"

curl -sS "https://cloud.greybox.studio/v1/enterprise/retention-report?tenantId=tenant_eu" \
  -H "authorization: Bearer $GREYBOX_AUDIT_ADMIN_TOKEN"

curl -sS -X POST "https://cloud.greybox.studio/v1/enterprise/legal-holds" \
  -H "authorization: Bearer $GREYBOX_AUDIT_ADMIN_TOKEN" \
  -H "content-type: application/json" \
  -d '{"tenantId":"tenant_eu","title":"Counsel hold","reason":"Preserve records for dispute review.","datasets":["project-artifacts","audit-log"]}'
```

Project artifacts default to delete/return after 30 days. Billing, audit,
privacy, incident, and consent ledgers are documented exceptions. Active legal
holds block deletion for scoped datasets until released. Legal-hold audit
records omit raw reasons, case names, and secrets. The Postgres store mirrors
the file store's append-version model: every create/release writes a new row,
and reads return the latest state per hold.

## Subprocessors

`GET /v1/enterprise/subprocessors` returns the current subprocessor registry
for enterprise diligence. The default list is planned until production
credentials and contracts are configured. Override it per deployment with
`GREYBOX_SUBPROCESSORS_JSON` so order forms and region-specific DPAs can stay
authoritative without code changes.

```bash
curl -sS "https://cloud.greybox.studio/v1/enterprise/subprocessors?purpose=managed-inference"
```

Each record includes purpose, data categories, regions, transfer mechanisms,
customer-configurable status, effective/review dates, and privacy-policy
pointers. Greybox uses a 30-day material-change notice as the operational
guardrail for customer review and objection.

## Security Incidents

Set `GREYBOX_SECURITY_INCIDENT_DIR` to enable the durable incident ledger, or
`GREYBOX_SECURITY_INCIDENT_PG_URL` for hosted multi-replica incident evidence.
Routes are admin protected by `GREYBOX_AUDIT_ADMIN_TOKEN` or WorkOS
`security:read` / `security:write` scopes:

```bash
curl -sS "https://cloud.greybox.studio/v1/enterprise/incidents?tenantId=tenant_eu" \
  -H "authorization: Bearer $GREYBOX_AUDIT_ADMIN_TOKEN"

curl -sS -X POST "https://cloud.greybox.studio/v1/enterprise/incidents" \
  -H "authorization: Bearer $GREYBOX_AUDIT_ADMIN_TOKEN" \
  -H "content-type: application/json" \
  -d '{"tenantId":"tenant_eu","title":"Audit metadata exposure","severity":"sev2","personalDataBreach":true,"gdprRiskAssessment":"likely"}'
```

Personal-data breach incidents create a GDPR Article 33 72-hour operational
timer unless counsel records the risk assessment as `unlikely`. Updates write
`security.incident_updated` audit records, but summaries and pasted secrets are
kept out of the hash-chained audit metadata. The Postgres store preserves the
same append-version semantics as the file store: every update inserts a new row
and reads return the latest version per incident.

## Model-Training Consent

Set `GREYBOX_MODEL_TRAINING_CONSENT_DIR` before any Greybox Native training
workflow. Missing records are treated as `opted-out`. Opt-ins require a
separate checkbox and explicit consent text:

```bash
curl -sS -X POST "https://cloud.greybox.studio/v1/model-training-consent" \
  -H "authorization: Bearer $GREYBOX_TOKEN" \
  -H "x-greybox-tenant: tenant_eu" \
  -H "x-greybox-user: designer_123" \
  -H "content-type: application/json" \
  -d '{"projectId":"project_123","status":"opted-in","separateCheckboxAccepted":true,"consentText":"I explicitly allow Greybox Native model training on this project."}'
```

Consent audit records keep status, project, optional artifact id, allowed-use
labels, and a consent-text hash. They never store raw consent text, artifact
content, prompts, game IP, or pasted secrets.

## Audit Export

Audit export is admin-token protected and supports CSV for legal review plus
Splunk-compatible newline-delimited JSON for SIEM ingestion. Each appended
record is sealed with a SHA-256 hash of its canonical JSON payload and the
previous sealed record hash.

Managed inference writes `inference.completed` entries when `GREYBOX_AUDIT_LOG_DIR`
or an injected audit log is configured. License validation writes
`license.validated`, and Pro-module secret issuance writes
`pro_module.secret_issued`. Incident opening and updates write
`security.incident_opened` and `security.incident_updated`. Model-training
choices write `model_training.consent_recorded`; legal holds write
`retention.legal_hold_created` and `retention.legal_hold_updated`. Entries are
tenant/user scoped, project-scoped when the action touches a project, and
include provider, model, task, token counts, route, tier, region, feature-gate,
entitlement, incident-state, consent-state, and hold-state metadata. Prompt
text, assistant output, customer game IP, raw consent text, raw hold reasons,
raw incident summaries, raw license/API keys, marketplace lookup keys, and
decryption secrets are intentionally excluded from audit records.

```bash
export GREYBOX_AUDIT_ADMIN_TOKEN=<long-random-token>

curl -sS "https://cloud.greybox.studio/v1/audit-log/export?tenantId=tenant_enterprise_123&format=splunk-json" \
  -H "authorization: Bearer $GREYBOX_AUDIT_ADMIN_TOKEN"

curl -sS "https://cloud.greybox.studio/v1/audit-log/verify?tenantId=tenant_enterprise_123" \
  -H "authorization: Bearer $GREYBOX_AUDIT_ADMIN_TOKEN"
```

## On-Prem Readiness

`GET /v1/enterprise/onprem-readiness` is protected by the audit admin token.
Use it after Compose startup to prove the install is ready for customer
handoff. The report checks the signed offline license, writable billing, audit,
SCIM, privacy request, security incident, model-training consent, and legal
hold stores, rotated admin and SCIM secrets, DPO appointment evidence, explicit
on-prem mode, and managed inference egress. It returns pass/warn/fail statuses
only; raw tokens, provider keys, license signatures, and decryption material
are never included.

Bedrock egress is considered configured only when a region and AWS access key
pair are present: `AWS_REGION` or `AWS_DEFAULT_REGION`,
`AWS_ACCESS_KEY_ID`, and `AWS_SECRET_ACCESS_KEY`. A lone region is treated as
BYOK/offline-only until credentials are supplied.

```bash
curl -sS http://localhost:8080/v1/enterprise/onprem-readiness \
  -H "authorization: Bearer $GREYBOX_AUDIT_ADMIN_TOKEN"
```

## Trust Controls

`GET /v1/enterprise/trust-controls` is an auditor-prep evidence map. It groups
implemented controls across tenant identity, tamper-evident audit logging,
security incident response, privacy rights, billing reconciliation, on-prem
readiness, subprocessor disclosure, public privacy notices, ROPA/DPIA/DPO
privacy governance, retention/legal holds, AI safety/log minimization, and explicit
model-training consent. It
references SOC 2 trust-service categories and ISO/IEC 27001 ISMS readiness, but
it is not a certification or auditor opinion.

```bash
curl -sS http://localhost:8080/v1/enterprise/trust-controls \
  -H "authorization: Bearer $GREYBOX_AUDIT_ADMIN_TOKEN"
```

`GET /v1/enterprise/trust-packet?format=markdown` returns the broader
diligence bundle in buyer-readable Markdown, while the default response remains
structured JSON:
controls, subprocessors, privacy disclosures, privacy governance, data
residency readiness, private networking readiness, retention policies, legal
document index, and open risks.

```bash
curl -sS "http://localhost:8080/v1/enterprise/trust-packet?format=markdown" \
  -H "authorization: Bearer $GREYBOX_AUDIT_ADMIN_TOKEN"
```

`GET /v1/enterprise/certification-roadmap` maps that evidence to the month 6
GDPR/privacy launch readiness, month 12 SOC 2 Type I, month 18 SOC 2 Type II,
and month 24 ISO 27001 plan. It includes owners, costs, blockers, and
`certificationClaims: false`; use it for auditor prep, not as a certificate.

```bash
curl -sS http://localhost:8080/v1/enterprise/certification-roadmap \
  -H "authorization: Bearer $GREYBOX_AUDIT_ADMIN_TOKEN"
```

`GET /v1/enterprise/security-questionnaire` turns the same evidence into
customer questionnaire answers. Use CSV for vendor portals:

```bash
curl -sS "http://localhost:8080/v1/enterprise/security-questionnaire?format=csv" \
  -H "authorization: Bearer $GREYBOX_AUDIT_ADMIN_TOKEN"
```

Answers deliberately stay conservative when auditor reports, production KMS
evidence, legal approval, or customer-specific reachability tests are missing.

## On-Prem Bundle

The on-prem skeleton runs Greybox Cloud with durable local ledgers and validates
an Ed25519-signed enterprise license before reporting healthy.

Setup:

```bash
cd infra/docker
cp env.onprem.example .env.onprem
mkdir -p licenses
# place license.greybox.json and greybox-license-public.pem in ./licenses
docker compose -f compose.onprem.yaml up --build
```

Health check:

```bash
curl -sS http://localhost:8080/v1/enterprise/offline-license
curl -sS http://localhost:8080/v1/enterprise/onprem-readiness \
  -H "authorization: Bearer $GREYBOX_AUDIT_ADMIN_TOKEN"
pnpm onprem:smoke -- --url http://localhost:8080
```

The response intentionally exposes only the license payload plus validity and
expiry metadata. The signature remains file-only. The optional
`greybox-open-design` service is behind the `open-core` compose profile until
release images are published.

The Compose health check and `pnpm onprem:smoke` both call the protected
readiness endpoint, so placeholder admin tokens, missing durable ledgers, or a
bad offline license fail before customer handoff. The smoke run also confirms
the endpoint rejects unauthenticated requests and that responses do not include
configured secret samples or sensitive material keys.

## Billing Dry Run

Managed inference billing should run in dry-run mode until Stripe meter
quantities reconcile against provider invoices for the same billing period.

Required environment:

```bash
export GREYBOX_BILLING_LEDGER_DIR=/secure/greybox/billing-ledger
export GREYBOX_BILLING_ADMIN_TOKEN=<long-random-token>
```

Hosted multi-replica deployments can set `GREYBOX_BILLING_LEDGER_PG_URL`
instead of the file directory. The Postgres ledger preserves append-only order
for usage, invoice, and Stripe meter-event evidence. It also serializes writes
with a per-record advisory transaction lock: repeated usage and invoice records
with the same canonical payload are no-ops, conflicting usage or invoice
payloads fail closed, failed Stripe meter attempts remain append-only, and a
prior live Stripe meter success wins for that meter identifier.

Preview and persist an invoice without sending Stripe events:

```bash
curl -sS https://cloud.greybox.studio/v1/billing/jobs/invoice \
  -H "authorization: Bearer $GREYBOX_BILLING_ADMIN_TOKEN" \
  -H "content-type: application/json" \
  -d '{
    "tenantId": "tenant_123",
    "tier": "studio",
    "period": {
      "start": "2026-05-01T00:00:00.000Z",
      "end": "2026-06-01T00:00:00.000Z"
    },
    "seatCount": 7,
    "submitStripe": true,
    "dryRun": true
  }'
```

The response returns the invoice, generated meter events, and dry-run
submissions. Review those quantities against Stripe and provider invoices before
live submission.

Live Stripe submission is allowed only when all three conditions are true:

- `STRIPE_API_KEY` is present.
- The request sets `"submitStripe": true`.
- The request either sets `"dryRun": false` explicitly or omits the `dryRun`
  field entirely.

As of 2026-05-19, `dryRun` defaults to `false` when `STRIPE_API_KEY` is
configured and `true` when it is absent. This prevents the silent-no-revenue
failure mode where a production deploy with valid Stripe credentials would
still submit only dry-run meter events because callers forgot to set
`"dryRun": false`. Callers that want to preview a live-configured environment
must now set `"dryRun": true` explicitly.

Keep the configured ledger as the source of truth for audit trails. It records
usage events, invoice snapshots, and every Stripe meter-event attempt.

## Checkout Cutover Readiness

Before adding the production Stripe webhook URL, verify Checkout fulfillment is
configured and auditable:

```bash
curl -sS "https://cloud.greybox.studio/v1/billing/checkout-readiness" \
  -H "authorization: Bearer $GREYBOX_BILLING_ADMIN_TOKEN"
```

The report fails closed until `STRIPE_WEBHOOK_SECRET`,
`GREYBOX_MARKETPLACE_URL`, `GREYBOX_MARKETPLACE_ADMIN_TOKEN`, and hash-chained
audit logging are configured. Localhost marketplace URLs are warning-only for
rehearsal; hosted cutover must use HTTPS. The report never returns webhook
secrets, marketplace admin tokens, or billing admin tokens.

## HTTP Security Controls (CORS, Rate Limiting, Payload Limits)

The HTTP server enforces three security controls when configured via env vars.
All three are opt-in to preserve developer ergonomics for local-only sandboxes;
production deployments must enable them explicitly.

### CORS

By default the server does not emit any `Access-Control-Allow-*` headers, so
browser-based clients on other origins cannot reach `/v1/*`. To allow specific
origins, set a comma-separated list:

```bash
export GREYBOX_CLOUD_ALLOWED_ORIGINS="https://app.greybox.studio,https://staging.greybox.studio"
export GREYBOX_CLOUD_ALLOW_CREDENTIALS=false
```

Wildcards (`*`) are supported but mutually exclusive with credentials. Preflight
`OPTIONS` requests from allowed origins receive 204 with the standard headers;
preflight from any other origin gets a 403 `origin_not_allowed` response.

### HTTP Rate Limiting

When both rate-limit env vars are set, the server applies a per-IP token bucket
to every route except `/healthz` and `/metrics`:

```bash
export GREYBOX_CLOUD_HTTP_RATE_LIMIT_BURST=120
export GREYBOX_CLOUD_HTTP_RATE_LIMIT_PER_SECOND=2
```

The example permits 120 requests in a burst, refilling at 2 requests/second.
Clients exceeding the bucket receive `429 rate_limited` with `Retry-After` and
`X-Greybox-RateLimit-Remaining` headers. The client identifier is taken from
the leading `X-Forwarded-For` entry if present (so put the load balancer in
front), otherwise the socket remote address. Buckets live in process memory;
a single-replica deployment is sufficient until SREs need cross-replica
coordination (likely 2027+).

### Payload Size Limits

`POST`/`PUT` request bodies are capped at 1 MiB by default. Override with:

```bash
export GREYBOX_CLOUD_MAX_PAYLOAD_BYTES=2097152
```

Requests over the cap receive `413 payload_too_large` with the configured cap
echoed back so clients can adjust. The check honours `Content-Length` for fast
rejection and re-checks streamed bytes to catch chunked requests that omit the
header.
