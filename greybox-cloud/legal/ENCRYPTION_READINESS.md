<!-- Proprietary and confidential. Copyright (c) 2026 Greybox Studio. -->

# Encryption Readiness

This is enterprise security-review evidence only. It is not a SOC 2 report,
ISO 27001 certificate, cloud-provider console export, legal opinion, or
customer-specific order-form commitment.

Use `GET /v1/enterprise/encryption-readiness` with the audit/security admin
token before answering buyer encryption questionnaires. The route fails closed
until production evidence is attached and sanitized.

## Evidence Packet

Set `GREYBOX_ENCRYPTION_EVIDENCE_JSON` with sanitized production evidence:

```json
{
  "kmsProvider": "aws-kms",
  "customerManagedKeys": true,
  "keyRotationDays": 90,
  "regions": {
    "us": {
      "keyConfigured": true,
      "sourceHash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "lastVerifiedAt": "2026-05-18T00:00:00.000Z"
    },
    "eu": {
      "keyConfigured": true,
      "sourceHash": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      "lastVerifiedAt": "2026-05-18T00:00:00.000Z"
    },
    "in": {
      "keyConfigured": true,
      "sourceHash": "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      "lastVerifiedAt": "2026-05-18T00:00:00.000Z"
    }
  },
  "storage": [
    {
      "dataset": "audit-log",
      "encrypted": true,
      "regions": ["us", "eu", "in"],
      "algorithm": "AES-256-GCM",
      "lastVerifiedAt": "2026-05-18T00:00:00.000Z"
    }
  ],
  "transit": { "tlsMinVersion": "1.3", "hstsEnabled": true },
  "backups": { "encrypted": true, "regions": ["us", "eu", "in"] },
  "secrets": { "manager": "aws-secrets-manager", "rotationDays": 90 }
}
```

Required datasets: audit log, billing ledger, SCIM store, privacy store,
incident store, legal-hold store, model-training consent, project artifacts, and
backups.

Never put raw KMS key ids, key material, passwords, API keys, or provider console
screenshots into the JSON. Put only a SHA-256 `sourceHash` of the sanitized
regional KMS export for each residency region. Keep the raw exports in the
controlled evidence folder for the auditor/customer review room. The readiness
route only returns booleans, supported provider names, SHA-256 source hashes,
region coverage, dates, and algorithm names.

## Pass Criteria

- Supported KMS provider configured with rotation evidence.
- US, EU, and India each have regional key evidence with a SHA-256 KMS export
  proof hash.
- Every required dataset is encrypted in all supported regions with a strong
  algorithm or managed envelope encryption.
- TLS 1.2+ and HSTS are configured at ingress.
- Backups are encrypted in all supported regions.
- Secrets live in a supported secret manager with rotation evidence.

## Evidence

- `src/enterprise/encryptionReadiness.ts` builds the sanitized report.
- `tests/encryption-readiness.test.ts` verifies pass/fail behavior, secret
  minimization, endpoint auth, and questionnaire integration.
- `GET /v1/enterprise/trust-packet` includes encryption readiness in buyer
  diligence packets.
