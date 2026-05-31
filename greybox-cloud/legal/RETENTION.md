# Greybox Retention And Legal Holds

Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

This file is operational evidence, not a legal opinion. Counsel-approved order
forms, DPAs, local law, and litigation instructions remain authoritative.

## Product Surface

- `GET /v1/enterprise/retention-policies`
- `GET /v1/enterprise/retention-report?tenantId=<id>`
- `GET /v1/enterprise/legal-holds`
- `POST /v1/enterprise/legal-holds`
- `PATCH /v1/enterprise/legal-holds/:id`

Legal-hold routes require the audit admin bearer token or WorkOS privacy
scopes. Set `GREYBOX_LEGAL_HOLD_DIR` to enable the durable JSONL legal-hold
ledger.

## Default Retention Map

| Dataset | Default | Days | Basis |
|---|---:|---:|---|
| Project artifacts | delete | 30 | customer instruction |
| SCIM users | anonymize | 30 | customer instruction |
| Billing ledger | retain | 2555 | tax/accounting |
| Audit log | retain | 730 | security audit |
| Privacy requests | retain | 1095 | privacy compliance |
| Security incidents | retain | 1095 | security audit |
| Model-training consents | retain | 1095 | privacy compliance |
| Support records | review | 365 | abuse prevention |

## Deletion Workflow

Privacy deletion fulfillment now includes active legal holds as a source. If a
hold is active, the package marks scoped datasets as `retain` and omits the raw
hold reason from the response package. Billing, audit, privacy, incident, and
consent ledgers remain documented exceptions rather than being blindly deleted.

## Audit Evidence

Creating and updating legal holds writes:

- `retention.legal_hold_created`
- `retention.legal_hold_updated`

Audit metadata includes status, dataset count, project count, user count, and
expiry. It excludes raw legal strategy, hold reason text, case names, secrets,
and bearer tokens.

## GDPR Pointers

GDPR Article 17 supports erasure while preserving exceptions such as legal
claims. Article 28 requires processors to delete or return personal data after
processing ends unless law requires storage. Greybox models those exceptions as
explicit policies and legal holds so deletion decisions are reviewable.

## Evidence

- `tests/retention.test.ts` verifies default policies, legal-hold blocking,
  sanitized audit entries, and privacy fulfillment integration.
- `tests/onprem-readiness.test.ts` verifies the legal-hold store is checked in
  on-prem readiness.
- `tests/trust-controls.test.ts` includes retention/legal-hold evidence in the
  trust-control map.

## Official Reference Pointer

- EUR-Lex GDPR Regulation (EU) 2016/679:
  https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32016R0679
