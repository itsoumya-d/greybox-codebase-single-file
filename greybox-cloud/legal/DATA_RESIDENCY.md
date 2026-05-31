# Greybox Data Residency Controls

Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

## Supported Regions

Greybox Cloud recognizes three customer residency regions:

- `us` - United States production region.
- `eu` - European Union / EEA production region.
- `in` - India production region.

Region is tenant-scoped. WorkOS organization tenants keep their first resolved
region unless operations explicitly migrates the tenant by `TenantStore.upsert`.

## Region Resolution

Resolution order:

1. WorkOS JWT claims: `data_region`, `dataResidencyRegion`, `region`,
   `https://greybox.studio/data-region`, `https://greybox.studio/data_residency`,
   or `https://greybox.ai/data-region`.
2. Managed-token headers: `x-greybox-region`, `x-greybox-data-region`, or
   `x-greybox-data-residency`.
3. `GREYBOX_DEFAULT_REGION`.
4. Fallback: `us`.

Accepted aliases map to canonical regions: `usa` and `united-states` -> `us`;
`eea`, `europe`, and `european-union` -> `eu`; `india` -> `in`.

## Production Storage Boundary

Each production deployment must keep these resources in-region:

- Billing ledger JSONL and invoice snapshots.
- Audit log JSONL.
- SCIM directory store.
- Privacy-rights request JSONL.
- Legal-hold JSONL.
- Offline license files for on-prem deployments.
- Langfuse or equivalent LLM trace storage.
- Provider traffic routing for managed inference where a provider offers
  regional processing commitments.

When a dependency cannot provide strict in-region processing, the customer order
form must disclose the sub-processor, `GET /v1/enterprise/subprocessors` must
list the transfer mechanism, and the DPA must list the transfer basis.

## Operational Checklist

- Provision separate `cloud-us`, `cloud-eu`, and `cloud-in` deployments.
- Set `GREYBOX_DEFAULT_REGION` per deployment.
- Keep `GREYBOX_AUDIT_LOG_DIR`, `GREYBOX_BILLING_LEDGER_DIR`, and
  `GREYBOX_SCIM_STORE_DIR` on region-local encrypted storage.
- Keep `GREYBOX_PRIVACY_REQUEST_DIR` on region-local encrypted storage.
- Keep `GREYBOX_LEGAL_HOLD_DIR` on region-local encrypted storage.
- Configure WorkOS organizations with the correct data-region custom claim.
- Verify `GET /v1/auth/session` returns the expected `dataResidencyRegion`.
- Verify `GET /v1/enterprise/data-residency` returns the expected tenant
  `dataResidencyRegion` and `supportedRegions`.
- Verify `GET /v1/enterprise/data-residency/readiness` has no blocked regions
  and the committed customer region is `pass`.
- Set `GREYBOX_PROVIDER_POLICY_JSON` for customer-approved provider allowlists
  or region-specific egress constraints before enabling managed inference.
- Run billing and audit export tests against each deployment before signing an
  enterprise order form.

## Readiness Matrix

`GET /v1/enterprise/data-residency/readiness` is admin protected. It checks
each supported region for:

- HTTPS regional Greybox Cloud URL.
- Region-local durable stores.
- Managed inference provider egress policy.
- Transfer basis.
- Backup boundary.

Configure per region:

```bash
export GREYBOX_REGION_EU_BASE_URL=https://cloud-eu.greybox.studio
export GREYBOX_REGION_EU_STORAGE_BOUNDARY=local
export GREYBOX_REGION_EU_PROVIDER_EGRESS=customer-selected
export GREYBOX_REGION_EU_TRANSFER_BASIS=sccs
export GREYBOX_REGION_EU_BACKUP_BOUNDARY=local
```

Provider policy is enforced during inference routing, not only in diligence
docs. Example:

```bash
export GREYBOX_PROVIDER_POLICY_JSON='{"regionAllowedProviders":{"eu":["bedrock"],"in":["greybox-native"]},"tenants":{"tenant_123":{"blockedProviders":["openai"]}}}'
```

`GET /v1/enterprise/provider-policy/readiness` turns that routing policy into
security-review evidence and fails closed unless allowed providers have signed
DPA coverage for their approved regions.

## Evidence

Current automated evidence:

- `tests/auth.test.ts` verifies WorkOS data-region claims override spoofed
  region headers.
- `tests/auth.test.ts` verifies managed-token region headers normalize to the
  canonical tenant region.
- `tests/auth.test.ts` verifies the enterprise residency endpoint reports the
  tenant region and supported regions.
- `tests/data-residency-readiness.test.ts` verifies the regional readiness
  matrix, blocked cross-region flags, and admin protection.
- `tests/inference.test.ts` verifies provider policy enforcement for region and
  tenant provider constraints.
- `pnpm test` covers session context, audit export, SCIM audit entries, billing
  ledger writes, privacy-rights intake, and offline license health checks.
