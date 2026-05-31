# Greybox Cloud - Production-Readiness Gaps & 3-Month Plan

**Date:** 2026-05-19
**Source:** Audit against `GREYBOX_COMPLETE_ANALYSIS_2026-05-19.md` §4.3
**Effort estimate:** ~3 months, 1 senior backend engineer
**Projected lift:** +3-5x SaaS ARR multiple (per strategic analysis). Goal: first enterprise pilot invoiced.

---

## Subsystem audit

### 1. Inference router - REAL
**Files:** `src/routers/inference.ts`, `src/providers/{anthropic,openai,bedrock,greybox-native}.ts`, `src/providers/selector.ts`
- Full provider abstraction with cost-aware selection (`selector.ts:67-85`), 2-attempt retry + failover (`inference.ts:63-94`), token bucket rate limiting per tenant/user/tier (`:56-60`), PII redaction + prompt-injection firewall pre-observability (`:41-78`).
- **Gaps:** no active health-check loop (`candidate.available` is static); OpenAI token counts are rough estimates (TikToken not integrated); Bedrock region isolation isn't enforced; no request tracing correlation ID across hops.
- **Effort to v1.0:** 1.5 engineer-weeks.

### 2. License validation - REAL (but weak crypto)
**Files:** `src/routers/licenses.ts`
- SHA-256 token hashing (`:72-74`), prefix-based tier inference (`gbx_indie_*`, `gbx_pro_*`, etc. - `:54-59`), optional durable store via `GREYBOX_LICENSE_RECORDS_JSON` (`:86-114`), feature-gating + expiry/revocation (`:193-206`), sanitized audit logging.
- **Gaps:** no Ed25519 signature verification (hash matching only); JSON-env record store doesn't scale; no distributed cache (~50ms per validate); no key-rotation ceremony; no audit trail of revocations.
- **Effort to v1.0:** 2 engineer-weeks.

### 3. Enterprise endpoints - REPORTS vs ENFORCEMENT

| Route | Type | Status |
|---|---|---|
| `GET /v1/enterprise/data-residency` | Readiness | Generates US/EU/IN matrix from env. **No hot-path enforcement.** |
| `GET /v1/enterprise/data-residency/readiness` | Evidence | Reports storage/egress/backup config |
| `GET /v1/enterprise/encryption-readiness` | Evidence | Exports KMS/TLS/secret-rotation status |
| `GET /v1/enterprise/provider-policy/readiness` | Stub | No DPA signature verification |
| `GET /v1/enterprise/private-network/readiness` | Stub | No CIDR/route validation |
| `GET /v1/enterprise/trust-controls` | Stub | SOC 2 / ISO 27001 checklist only |
| `GET /v1/enterprise/certification-roadmap` | Stub | Historical roadmap |
| `GET /v1/enterprise/security-questionnaire?format=csv` | Evidence | Admin-facing, not customer-fillable |
| `GET /v1/enterprise/contracts?format=markdown` | Stub | No document upload/store |
| `GET /v1/scim/v2/Users` | **Real** | Full CRUD + durable store (`scim.ts:56-186`) |

**Pattern:** "readiness-first" - APIs report compliance evidence but don't actively enforce in request hot path. Two endpoints (SCIM, license validation) carry real enforcement.

### 4. Metered billing - PARTIAL
**Files:** `src/metering/{billingLedger.ts,stripeMeterSubmitter.ts,usageEmitter.ts}`, `src/routers/billing.ts`
- Append-only JSONL ledger (`billingLedger.ts:38-74`), dry-run-first Stripe meter submitter with 2-attempt retry (`stripeMeterSubmitter.ts:47-107`), webhook signature verification + `checkout.session.completed` handling (`billing.ts:467-485`), tier plan metering with overage rates (`:175-212`).
- **Gaps:** Stripe live integration not enabled (`dryRun=true` by default `:42-44`); no seat-count enforcement at request time (only at invoice generation); no reconciliation tool to match provider invoices <-> ledger <-> Stripe usage; Free tier still sent to Stripe (should be filtered); only 2 retry attempts (need exponential backoff).
- **Effort to v1.0:** 2.5 engineer-weeks.

### 5. Region enforcement - READINESS ONLY
**Files:** `src/routers/tenants.ts`, `src/enterprise/dataResidencyReadiness.ts`
- Tenant region (`types.ts:31`); provider selector applies `regionAllowedProviders[region]` (`selector.ts:79-80`); readiness report generated per region.
- **Gaps:** single-region storage (no replicas in EU/IN); provider region policy is advisory in selector but not enforced at request time; no data-transfer audit trail; no GDPR SCC/adequacy mechanisms documented.
- **Effort to v1.0:** 3 engineer-weeks.

### 6. SCIM provisioning - REAL
**Files:** `src/enterprise/scim.ts`
- RFC 7644 SCIM 2.0 compliant, full Users CRUD (`:235-267`), durable in-memory + JSON file persistence (`:56-86`), bearer token with constant-time comparison (`:278-282`), audit logging on every op (`:348-370`).
- **Gaps:** in-memory + JSON not durable for prod; no Groups endpoints; no bulk ops; no schema extensions; not validated against Okta sandbox.
- **Effort to v1.0:** 1.5 engineer-weeks.

### 7. PII redaction - REAL
**Files:** `src/safety/piiRedactor.ts`
- Regex detection for emails, IPv4/IPv6, phones, Luhn-valid cards (`:5-10`); deep-object recursion (`:53-60`); redaction applied to observability logs pre-sink (`inference.ts:72-78`); 100-case regression suite.
- Redaction now runs before managed inference calls provider clients, so Anthropic/OpenAI/Bedrock receive sanitized prompt, metadata, and project fields; billing usage and Langfuse traces use the same sanitized request envelope.
- PII classification now emits type/count metadata into inference audit entries, and public HTTP error messages are sanitized before returning to clients.
- `GET /v1/enterprise/pii-redaction-evidence` now exposes a customer-safe evidence packet gated on sanitized SHA-256 proof for the redactor suite, provider-boundary test, audit-classification test, and public-error sanitization test.
- `pnpm pii:evidence` now produces sanitized JSON, dotenv, and GitHub Actions env payloads; CI uploads the dotenv payload as a release evidence artifact; Cloud can load the artifact from `GREYBOX_PII_REDACTION_EVIDENCE_FILE`.
- **Gaps:** no non-regex DLP classifier; production deployment still needs to mount or promote the CI artifact into Cloud env/secrets.
- **Effort to v1.0:** 1 day.

### 8. Audit log + hash-chain sealing - PARTIAL
**Files:** `src/enterprise/auditLog.ts`
- Append-only JSONL with SHA-256 hash chain (`:67-119`), optional HMAC-SHA256 seal key, 22 action types (`:7-22`), CSV + Splunk JSON export (`:147-162`), verification routine detects tampering (`:195-245`), wired into inference/SCIM/license/billing.
- **Gaps:** HMAC seal is operator-held but not HSM-backed; no real-time export (batch only); no tamper-detection alerting; audit + billing in same filesystem (no separation of duties); no retention/archive pipeline.
- **Effort to v1.0:** 2.5 engineer-weeks.

---

## 3-month sequenced plan (1 senior backend engineer FT)

### Month 1 - Revenue-blocking foundations
**Goal:** first pilot invoiced + audit trail sealed.

**Week 1 - Stripe live + billing**
- Obtain live Stripe API key, configure billing.meter_events + dashboard
- Update `stripeMeterSubmitter.ts`: `dryRun=false`, exponential retry backoff (4h)
- Verify test meter event reporting end-to-end
- **Deliverable:** webhook accepts `checkout.session.completed`; meter events post to Stripe

**Weeks 1-2 - Metered billing reconciliation**
- Invoice audit report: provider costs vs. ledger vs. Stripe usage (target ±0.5% USD)
- Seat-count enforcement at request time (return 402 if over tier minimum)
- Filter Free tier from Stripe submission
- **Deliverable:** passing audit report; correctly billed studio/enterprise usage

**Weeks 2-3 - Audit trail sealing**
- Migrate audit log JSONL → PostgreSQL with indexed schema
- AWS KMS / Azure Key Vault integration for Ed25519 signing on each sealed entry
- Real-time Splunk export every 60s
- Weekly verification job + alerting on failure
- **Deliverable:** tamper-evident audit trail; HSM signature verification working

**Week 3 - License validation hardening**
- Migrate license records JSON-env → PostgreSQL
- Ed25519 JWT validation (fallback to prefix-based for alpha)
- Redis or local TTL cache with 2s revocation invalidation
- **Deliverable:** production key validation; real-time revocation

### Month 2 - Tenant isolation & enterprise controls
**Goal:** first enterprise pilot contract enforceable.

**Weeks 4-5 - Region enforcement in hot path**
- Inference fails with 403 if provider not allowed in tenant region
- Provider selector returns empty if no provider matches region+tier
- Data-residency audit logging on every cross-region call
- **Deliverable:** hot-path region enforcement; audit shows data transfers

**Week 5 - Contract enforcement at tenant creation**
- Enterprise contract payload at tenant create (Order Form hash, MSA, DPA, pricing terms)
- Contract-hash verification on every invoice (fail if changed mid-period)
- Immutability of tier+region+pricing post-signature
- **Deliverable:** contract pinned; 12-month pricing lock

**Week 6 - Multi-region storage foundation**
- PostgreSQL read replicas in EU + India (async replication)
- Write-to-primary, read-from-replica routing by tenant region
- **Deliverable:** geo-replicated usage/audit/SCIM; <100ms cross-region reads

**Week 6 - SCIM production integration**
- Move SCIM store file JSON → PostgreSQL
- Implement Groups CRUD (POST/PATCH/DELETE)
- Okta sandbox validator passes
- **Deliverable:** SCIM Okta-validated; groups working

### Month 3 - Compliance evidence + first pilot launch
**Goal:** SOC 2 evidence ready; contract signed.

**Weeks 7-8 - Compliance evidence automation**
- Active checks (not just readiness): KMS rotation <90d, TLS cert expiry <30d alert, Sev1 post-mortem coverage
- Trust-packet endpoint reports live pass/fail/warn
- **Deliverable:** compliance dashboard; trust-packet reflects live status

**Week 8 - PII DLP hardening**
- Evaluate a non-regex DLP classifier for edge cases
- Promote the generated source-hash evidence artifact into Cloud env/secrets
- Keep outbound provider payload redaction, audit classification, error sanitization, and customer-safe evidence export locked by regression coverage
- **Deliverable:** PII evidence export backed by fresh CI proof and stronger detection coverage

**Week 8 - Incident response readiness**
- `POST /v1/enterprise/incidents` (create/update/close)
- GDPR breach-clock tracking (30-day notification deadline)
- PagerDuty auto-page on Sev1
- **Deliverable:** workflow tested; breach-clock in trust-packet

**Weeks 9-12 - First pilot launch**
- Run enterprise-pilot-readiness report; verify all checks pass
- Sign first customer contract (Order Form + MSA + DPA)
- Staging: full checkout rehearsal (webhook → checkout → invoice → Stripe meter)
- Cutover: update `STRIPE_WEBHOOK_SECRET` + marketplace token to live
- Invoice first month (reconciliation audit + Stripe submission)
- **Deliverable:** first enterprise pilot invoiced

---

## Critical path summary

- **3 weeks to first invoice:** Stripe live + RDBMS migration (audit/license/SCIM) + HSM signing
- **6 weeks to enforceable contract:** + region validation in hot path + contract-hash verification + multi-region replication
- **12 weeks to pilot launch:** + compliance automation + PII redaction + incident response + production deployment

## External dependencies & risks

| Dependency | Impact | Mitigation |
|---|---|---|
| Stripe production account | Blocks metered billing | Request >=2 weeks before month-1 end; pre-test in sandbox |
| AWS KMS / Azure Key Vault | Blocks HSM-signed audit | Budget ~$2K/mo; vendor evaluation in week 1 |
| Okta / Google Workspace trial | Blocks SCIM cert | Create free trial; test against staging |
| PostgreSQL multi-region | Blocks geo-enforcement | Load test before pilot; target <100ms |
| Anthropic/OpenAI keys | Inference (low risk, already have) | Per-tenant token budgets enforced in meter |
| Legal counsel DPA review | Blocks contract signature | Engage by month-1 week-3; use `/legal` templates |

**Sequencing risk:** if Stripe setup delays, mock Stripe responses in staging and unblock downstream work; backfill live integration when account is provisioned.
