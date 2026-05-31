-- Proprietary and confidential. Copyright (c) 2026 Greybox Studio.
--
-- Adds billing-provider tracking columns to the tenant snapshot table.
-- Operators who prefer explicit migrations can run this file directly;
-- the Postgres-backed TenantStore will lazy-apply compatible schema changes
-- on first use when tenant JSON contains these fields.
--
-- NOTE: If tenant_snapshot stores tenants as a JSON blob (file-based store),
-- add billingProvider, billingRegion, razorpaySubscriptionId, and
-- dodoSubscriptionId to the TenantBillingConfig JSON schema instead — see
-- src/types.ts:TenantBillingConfig. The columns below are only relevant when
-- a Postgres-backed TenantStore is deployed.

ALTER TABLE tenant_snapshot
  ADD COLUMN IF NOT EXISTS billing_provider TEXT DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS billing_region TEXT DEFAULT 'global',
  ADD COLUMN IF NOT EXISTS razorpay_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS dodo_subscription_id TEXT;

-- Index for provider-based queries (e.g. batch renewal jobs, churn reports)
CREATE INDEX IF NOT EXISTS tenant_billing_provider_idx
  ON tenant_snapshot(billing_provider);
