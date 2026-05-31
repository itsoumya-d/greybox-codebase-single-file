# Greybox Security Questionnaire

Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

This is sales and security-review readiness evidence. It is not legal advice,
auditor assurance, production console evidence, or customer-specific contract
language.

## Product Control

`GET /v1/enterprise/security-questionnaire` is admin protected by the audit
admin token or WorkOS audit/privacy/security scopes. It generates recurring
customer security-questionnaire answers from the current trust packet:

- SSO and SCIM.
- Audit logging.
- Incident response.
- Privacy rights and subprocessors.
- Retention and legal holds.
- ROPA, DPIA, DPO, CCPA/COPPA/DPDPA disclosures.
- US/EU/India residency readiness.
- AWS/Azure private networking.
- KMS, storage, TLS, backup, and secret-manager encryption readiness.
- On-prem readiness.
- Managed inference logging and model-training consent.
- Billing reconciliation.
- Encryption evidence status.

JSON:

```bash
curl -sS "https://cloud.greybox.studio/v1/enterprise/security-questionnaire" \
  -H "authorization: Bearer $GREYBOX_AUDIT_ADMIN_TOKEN"
```

CSV:

```bash
curl -sS "https://cloud.greybox.studio/v1/enterprise/security-questionnaire?format=csv" \
  -H "authorization: Bearer $GREYBOX_AUDIT_ADMIN_TOKEN"
```

The generated answers are intentionally conservative. They say `not yet` or
`needs-review` where production KMS evidence, auditor reports, legal approval,
regional deployment proof, or customer-specific network validation is missing.

## Evidence

- `src/enterprise/securityQuestionnaire.ts` builds JSON and CSV outputs.
- `tests/security-questionnaire.test.ts` verifies honest answers, CSV export,
  admin protection, and secret minimization.
- `tests/encryption-readiness.test.ts` verifies the encryption answer upgrades
  only when the readiness report passes.
