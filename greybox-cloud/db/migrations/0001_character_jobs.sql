-- Proprietary and confidential. Copyright (c) 2026 Greybox Studio.
--
-- Character generation job + library tables. The Postgres-backed
-- `CharacterJobStore` will lazy-create these on first use (matching the
-- pattern used by `licenseRecordsPostgres.ts`), but operators who prefer
-- explicit migrations can run this file directly.

CREATE TABLE IF NOT EXISTS character_jobs (
    id                     TEXT PRIMARY KEY,
    tenant_id              TEXT NOT NULL,
    user_id                TEXT NOT NULL,
    provider_name          TEXT NOT NULL,
    provider_job_id        TEXT NOT NULL,
    state                  TEXT NOT NULL DEFAULT 'queued',
    percent                INTEGER NOT NULL DEFAULT 0,
    input                  JSONB NOT NULL DEFAULT '{}'::jsonb,
    outputs                JSONB,
    error                  TEXT,
    imported_character_id  TEXT,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS character_jobs_tenant_created_at_idx
    ON character_jobs (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS characters (
    id              TEXT PRIMARY KEY,
    tenant_id       TEXT NOT NULL,
    name            TEXT NOT NULL,
    gltf_asset_uri  TEXT NOT NULL,
    sha256          TEXT NOT NULL,
    size_bytes      BIGINT NOT NULL DEFAULT 0,
    rig             JSONB NOT NULL DEFAULT '{}'::jsonb,
    animations      JSONB NOT NULL DEFAULT '[]'::jsonb,
    game_stats      JSONB NOT NULL DEFAULT '{}'::jsonb,
    provenance      JSONB NOT NULL DEFAULT '{}'::jsonb,
    schema_version  INTEGER NOT NULL DEFAULT 1,
    warnings        JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS characters_tenant_created_at_idx
    ON characters (tenant_id, created_at DESC);
