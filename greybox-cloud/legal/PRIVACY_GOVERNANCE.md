# Greybox Privacy Governance

Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

This is readiness evidence, not legal advice, a regulator filing, or a
counsel-approved compliance certificate.

## Product Control

`GET /v1/enterprise/privacy-governance` is admin protected by the audit admin
token or WorkOS `privacy:read` / `audit:read` scopes. It returns:

- ROPA records for current processing activities.
- DPIA assessments for higher-risk workflows.
- DPO appointment evidence.
- Official GDPR article pointers for Article 30, Article 35, and Article 37.

Scoped views are available at:

- `GET /v1/enterprise/privacy-governance/ropa`
- `GET /v1/enterprise/privacy-governance/dpia`
- `GET /v1/enterprise/privacy-governance/dpo`

The endpoint never returns API keys, provider tokens, raw prompts, game IP,
license keys, incident summaries, or pasted secrets.

## ROPA

Default records cover managed inference, SSO/SCIM, billing, privacy rights,
opt-in analytics, Greybox Native opt-in training, and agentic playtesting.
Each record carries purpose, role, legal basis, data-subject categories,
personal-data categories, recipients, subprocessors, transfer notes, retention,
security measures, systems, owner, and last review date.

Override defaults per deployment with `GREYBOX_PRIVACY_GOVERNANCE_JSON` when
counsel approves customer-specific ROPA language.

## DPIA

Default DPIAs cover managed inference, Greybox Native opt-in training, and
agentic playtesting. Draft or review-needed assessments are intentionally
reported as pending evidence until counsel and the DPO complete review.

## DPO

DPO evidence is not fabricated. It becomes configured only when all three are
set:

```bash
export GREYBOX_DPO_NAME="Greybox Privacy Lead"
export GREYBOX_DPO_EMAIL=privacy@greybox.studio
export GREYBOX_DPO_APPOINTED_AT=2026-05-17T00:00:00.000Z
```

Optional:

```bash
export GREYBOX_DPO_REGION=global
export GREYBOX_DPO_SUPERVISORY_AUTHORITY_NOTIFIED=true
export GREYBOX_DPO_PUBLICATION_CHANNEL="Privacy policy and enterprise trust packet"
```

## Official Reference Pointers

- GDPR Article 30: records of processing activities.
- GDPR Article 35: data protection impact assessments.
- GDPR Article 37: designation of the data protection officer.

Source: https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32016R0679

## Evidence

- `src/enterprise/privacyGovernance.ts` builds default and deployment-specific
  privacy governance evidence.
- `tests/privacy-governance.test.ts` verifies Article pointers, sanitized
  defaults, DPO evidence, JSON overrides, and endpoint protection.
- `tests/trust-controls.test.ts` verifies the privacy governance control is
  included in the enterprise evidence map.
