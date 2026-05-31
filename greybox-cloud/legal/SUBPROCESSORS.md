# Greybox Subprocessor Registry

Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

This registry is readiness evidence for enterprise review. Signed order forms,
DPAs, and counsel-approved notices remain authoritative for production
customers.

## Product Surface

`GET /v1/enterprise/subprocessors` returns the current registry with:

- provider name and status,
- processing purposes,
- data categories,
- supported regions,
- transfer mechanisms,
- customer-configurable flag,
- effective and review dates,
- privacy-policy pointer, and
- 30-day material change notice.

Filters:

- `?status=active|planned|deprecated`
- `?purpose=hosting|authentication|billing|managed-inference|observability|analytics|support|playtesting`
- `?region=us|eu|in|self-hosted|customer-selected`

Production deployments can replace the planned default registry with
`GREYBOX_SUBPROCESSORS_JSON`. This keeps order-form subprocessors, region
commitments, and customer-specific DPAs from requiring code changes.

## Default Coverage

The default registry covers planned providers for hosting, authentication,
billing, managed inference, observability, product analytics, Greybox Native
GPU jobs, and agentic playtesting. It intentionally marks providers as
`planned` until production credentials and contracts are configured.

Telemetry remains opt-in. Model-training workloads require separate explicit
consent and must exclude opted-out or revoked projects.

## GDPR Basis

GDPR Article 28 requires processors to use authorized subprocessors, notify
controllers of intended additions or replacements under general authorization,
and remain liable for subprocessor obligations. Greybox's 30-day notice period
is an operational guardrail for that review and objection workflow.

## Evidence

- `tests/subprocessors.test.ts` verifies default disclosure, filters,
  environment overrides, and the public endpoint.
- `tests/trust-controls.test.ts` includes the registry in the auditor-prep
  evidence map.
- `legal/DPA_TEMPLATE.md` references the registry as the subprocessor list.

## Official Reference Pointer

- EUR-Lex GDPR Regulation (EU) 2016/679, Article 28:
  https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32016R0679
