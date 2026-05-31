# Greybox Privacy Disclosures

Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

This is readiness evidence, not legal advice or final public policy copy.

## Product Control

`GET /v1/privacy/disclosures` returns a sanitized public checklist for launch
privacy disclosures. It covers:

- California CCPA/CPRA notice at collection, privacy policy, sale/share
  opt-out, and sensitive-personal-information limit notices.
- COPPA children privacy policy, parent direct notice, verifiable parental
  consent, and school authorization boundaries.
- India DPDPA notice, consent withdrawal, erasure, grievance, and child
  safeguards.

Filter by jurisdiction:

```bash
curl -sS "https://cloud.greybox.studio/v1/privacy/disclosures?jurisdiction=coppa"
```

The route intentionally exposes no API keys, model-provider secrets, raw
prompts, game IP, license keys, or incident details.

## Deployment Settings

```bash
export GREYBOX_LEGAL_NAME="Greybox Studio"
export GREYBOX_PRIVACY_POLICY_URL=https://greybox.studio/privacy
export GREYBOX_PRIVACY_CONTACT_EMAIL=privacy@greybox.studio
export GREYBOX_PRIVACY_RIGHTS_URL=https://cloud.greybox.studio/v1/privacy/requests
export GREYBOX_CHILDREN_PRIVACY_CONTACT_EMAIL=privacy@greybox.studio
export GREYBOX_GRIEVANCE_EMAIL=privacy@greybox.studio
```

The default commercial posture is privacy-preserving:

```bash
export GREYBOX_CCPA_SELLS_OR_SHARES_PERSONAL_INFORMATION=false
export GREYBOX_CCPA_LIMITABLE_SENSITIVE_PI=false
export GREYBOX_SERVICE_DIRECTED_TO_CHILDREN=false
export GREYBOX_COLLECTS_CHILD_PERSONAL_INFORMATION=false
export GREYBOX_SUPPORTS_SCHOOL_USE=false
```

If any of those flags become `true`, the disclosure report marks the relevant
notice or consent item as `needs-counsel` until public copy and product flows
are approved.

Optional `GREYBOX_PRIVACY_DISCLOSURES_JSON` can replace default disclosures
with counsel-approved records.

## Official Reference Pointers

- California Attorney General CCPA required notices:
  https://oag.ca.gov/privacy/ccpa
- California Privacy Protection Agency CCPA regulations:
  https://cppa.ca.gov/regulations/
- FTC COPPA compliance FAQ:
  https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions
- India Digital Personal Data Protection Act, 2023:
  https://www.meity.gov.in/static/uploads/2024/02/Digital-Personal-Data-Protection-Act-2023.pdf

## Evidence

- `src/enterprise/privacyDisclosures.ts` builds the disclosure register.
- `tests/privacy-disclosures.test.ts` verifies default posture, launch flags,
  deployment overrides, filtering, and secret minimization.
- `tests/trust-controls.test.ts` verifies the disclosure control is included in
  the enterprise evidence map.
