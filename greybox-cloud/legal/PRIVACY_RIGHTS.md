# Greybox Privacy Rights Workflow

Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

This is an engineering control map, not legal advice. Counsel must approve the
public privacy policy and final response playbooks before launch.

## Covered Workflows

- Access and export requests.
- Deletion, correction, completion, and update requests.
- CCPA/CPRA opt-out of sale or sharing.
- COPPA parent/guardian review and deletion requests for child data.
- India DPDPA grievance, correction, update, and erasure workflows.
- Greybox model-training opt-out requests.

## Product Control

`POST /v1/privacy/requests` creates a durable request record in
`GREYBOX_PRIVACY_REQUEST_DIR`. The requester receives a one-time status token;
Greybox stores only its SHA-256 hash. Public status responses mask email
addresses. Admin list/update routes require an admin token or WorkOS privacy
scope.
`GET /v1/privacy/requests/:id/fulfillment-package` gives admins the response
workbench: matching privacy-request records, SCIM account records, tenant-level
billing/audit evidence, active legal holds, due dates, and retention-exception
notes.

Default due-date guardrails:

| Jurisdiction | Default basis | Due | Extension marker |
|---|---|---:|---:|
| GDPR | Article 12 operational clock | 1 calendar month | 3 calendar months total |
| CCPA/CPRA | California 45-day response window | 45 days | 90 days total |
| COPPA | Internal parent-rights SLA | 30 days | none |
| India DPDPA | Internal Data Principal SLA | 30 days | none |
| Other | Internal privacy SLA | 30 days | none |

COPPA and DPDPA defaults are intentionally operational SLAs rather than legal
claims. Update them when counsel finalizes launch jurisdiction rules.

## Evidence

- `tests/privacy-requests.test.ts` verifies GDPR/CCPA deadline defaults,
  durable intake, hashed requester tokens, public email masking, admin list and
  status update, fulfillment-package evidence across privacy, SCIM, billing,
  audit, and legal-hold stores, parent-email enforcement for child requests,
  and fail-closed behavior when storage is not configured.
- `tests/onprem-readiness.test.ts` verifies the on-prem readiness report checks
  the privacy request store.

## Official Reference Pointers

- GDPR Regulation (EU) 2016/679 Article 12:
  https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32016R0679
- California CCPA information and request timing:
  https://www.oag.ca.gov/privacy/ccpa
- California Privacy Protection Agency FAQ:
  https://cppa.ca.gov/faq.html
- FTC COPPA business guidance:
  https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions
- India Digital Personal Data Protection Act, 2023:
  https://www.meity.gov.in/static/uploads/2024/02/Digital-Personal-Data-Protection-Act-2023.pdf
