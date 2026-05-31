# Greybox Enterprise Trust Packet

Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

This packet is diligence-readiness evidence. It is not a SOC 2 report, ISO
27001 certificate, penetration test, legal opinion, regulator filing, or final
customer security addendum.

## Product Control

`GET /v1/enterprise/trust-packet` is admin protected by the audit admin token or
WorkOS audit/privacy/security scopes. It returns a single sanitized bundle for
enterprise security review:

- Trust controls evidence map.
- Generated security questionnaire answers.
- Subprocessor registry.
- CCPA/COPPA/DPDPA privacy disclosure readiness.
- ROPA, DPIA, and DPO governance readiness.
- US/EU/India data residency readiness.
- Encryption and KMS readiness.
- AWS/Azure private-network readiness.
- Retention policies.
- Legal/trust document index.
- Contract packet with Enterprise Order Form, MSA, and DPA hashes plus a signing checklist.
- Open risk summary.

```bash
curl -sS "https://cloud.greybox.studio/v1/enterprise/trust-packet" \
  -H "authorization: Bearer $GREYBOX_AUDIT_ADMIN_TOKEN"
```

```bash
curl -sS "https://cloud.greybox.studio/v1/enterprise/contracts?format=markdown" \
  -H "authorization: Bearer $GREYBOX_AUDIT_ADMIN_TOKEN"
```

The response excludes raw prompts, game IP, provider keys, admin tokens, license
keys, incident summaries, legal-hold reasons, marketplace lookup keys, and
decryption material.

## Document Index

The packet references:

- `legal/ORDER_FORM_TEMPLATE.md`
- `legal/MSA_TEMPLATE.md`
- `legal/DPA_TEMPLATE.md`
- `legal/DATA_RESIDENCY.md`
- `legal/ENCRYPTION_READINESS.md`
- `legal/PRIVATE_NETWORKING.md`
- `legal/PRIVACY_DISCLOSURES.md`
- `legal/PRIVACY_GOVERNANCE.md`
- `legal/PRIVACY_RIGHTS.md`
- `legal/RETENTION.md`
- `legal/SUBPROCESSORS.md`
- `legal/INCIDENT_RESPONSE.md`
- `legal/SECURITY_QUESTIONNAIRE.md`
- `legal/TRUST_CONTROLS.md`

## Evidence

- `src/enterprise/trustPacket.ts` assembles the packet.
- `src/enterprise/contractPacket.ts` verifies Enterprise Order Form, MSA, and
  DPA clause coverage and generates the procurement signing checklist.
- `tests/trust-packet.test.ts` verifies admin protection, combined evidence,
  risk summaries, and secret minimization.
- `tests/contract-packet.test.ts` verifies contract readiness, hashing,
  markdown export, and admin protection.
