-- Proprietary and confidential. Copyright (c) 2026 Greybox Studio.
--
-- Character generation usage metering table.
-- Tracks per-tenant monthly generation counts for quota enforcement.
-- The TypeScript `CharacterMeteringEmitter` will lazy-create this on first
-- use, but operators who prefer explicit migrations can run this file directly.

CREATE TABLE IF NOT EXISTS character_generation_usage (
    id                   TEXT PRIMARY KEY,
    tenant_id            TEXT NOT NULL,
    job_id               TEXT NOT NULL REFERENCES character_jobs(id) UNIQUE,
    provider             TEXT NOT NULL,  -- 'meshy-v3' | 'tripo3d' | 'mock'
    state                TEXT NOT NULL DEFAULT 'queued',  -- queued | processing | complete | failed
    model_credits_used   INTEGER,
    cost_usd             NUMERIC(10,4),
    period_start         DATE NOT NULL,  -- First day of billing month (DATE_TRUNC('month', NOW()))
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at         TIMESTAMPTZ
);

-- Composite index for counting monthly usage per tenant
CREATE INDEX IF NOT EXISTS char_gen_usage_tenant_period_idx
    ON character_generation_usage(tenant_id, period_start);

-- Partial index for counting only completed generations (quota counting)
CREATE INDEX IF NOT EXISTS char_gen_usage_tenant_month_count_idx
    ON character_generation_usage(tenant_id, period_start) WHERE state = 'complete';
