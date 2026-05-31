# Greybox Incident Response Workflow

Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

This is operational evidence, not a legal opinion. Counsel owns final breach
classification, notification language, and regulator/customer submissions.

## Product Surface

Set `GREYBOX_SECURITY_INCIDENT_DIR` to enable the durable incident ledger.
Admins use:

- `GET /v1/enterprise/incidents`
- `POST /v1/enterprise/incidents`
- `PATCH /v1/enterprise/incidents/:id`

The routes accept the audit admin bearer token or WorkOS security scopes. Each
incident records severity, category, status, affected tenants, data categories,
containment tasks, timeline notes, and regulatory clocks.

## GDPR Breach Clock

For personal-data breach incidents, Greybox creates a 72-hour operational timer
unless counsel records the GDPR risk assessment as `unlikely`. This follows
GDPR Article 33's supervisory-authority notification window from awareness of a
personal data breach when risk to rights and freedoms is not unlikely.

If the assessment is `high`, Greybox also marks data-subject notice as required
for counsel review. Article 34 uses an undue-delay standard, so the product does
not invent a fixed statutory customer-notice deadline.

## Audit Evidence

Opening and updating incidents writes hash-chained audit entries:

- `security.incident_opened`
- `security.incident_updated`

The audit metadata intentionally excludes incident summaries, raw tokens, raw
provider keys, raw license keys, customer game content, and pasted secrets. It
keeps only operational fields such as severity, status, category, breach flags,
counts, and clock counts.

## Response Runbook

1. Open an incident as soon as security or privacy impact is suspected.
2. Confirm affected tenants, data categories, systems, and initial severity.
3. Complete containment tasks before switching status to `contained`.
4. Preserve audit, billing, SCIM, inference, and infrastructure logs.
5. Ask counsel to set `gdprRiskAssessment` to `unlikely`, `likely`, or `high`.
6. Export audit evidence and incident timeline for the post-incident review.
7. Close only after remediation, customer/regulator decisions, and follow-up
   controls are documented.

## Official Reference Pointer

- EUR-Lex GDPR Regulation (EU) 2016/679, Article 33:
  https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32016R0679
