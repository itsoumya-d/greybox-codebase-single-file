// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

// Monthly quota enforcement for 2D sprite generation via Fal.ai.
//
// Tier limits:
//   free       -> 2 generations/month (trial, drives upgrade)
//   indie      -> 20 generations/month
//   studio     -> 200 generations/month
//   enterprise -> unlimited (null), metered for billing only
//
// Both in-memory (for tests / single-process dev) and Postgres backends are
// supported, following the same dual-backend pattern used by
// CharacterMeteringEmitter.

import { randomUUID } from 'node:crypto';
import { currentPeriodStart, nextPeriodStart } from './characterMeteringEmitter.js';

export { currentPeriodStart, nextPeriodStart };

export const SPRITE_TIER_GENERATION_LIMITS: Record<string, number | null> = {
  free: 2,
  indie: 20,
  studio: 200,
  enterprise: null, // null = unlimited
};

// -- In-memory record --------------------------------------------------------

interface UsageRecord {
  id: string;
  tenantId: string;
  jobId: string;
  provider: string;
  state: 'queued' | 'processing' | 'complete' | 'failed';
  modelCreditsUsed?: number;
  costUsd?: number;
  periodStart: string;
  createdAt: string;
  completedAt?: string;
}

// -- Postgres client interface ------------------------------------------------

export interface SpriteMeteringClient {
  query(text: string, values?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
}

// -- Main class ---------------------------------------------------------------

export class SpriteMeteringEmitter {
  private readonly client: SpriteMeteringClient | null;
  /** In-memory fallback: Map keyed by record id. */
  private readonly memoryStore = new Map<string, UsageRecord>();
  private readonly now: () => Date;

  constructor(client?: SpriteMeteringClient | null, options: { now?: () => Date } = {}) {
    this.client = client ?? null;
    this.now = options.now ?? (() => new Date());
  }

  /**
   * Get the count of *completed* generations for tenant in the current billing month.
   */
  async getMonthlyUsage(tenantId: string, at?: Date): Promise<number> {
    const period = currentPeriodStart(at ?? this.now());
    if (this.client) {
      await this.ensureSchema();
      const result = await this.client.query(
        `SELECT COUNT(*) AS cnt
         FROM sprite_generation_usage
         WHERE tenant_id = $1 AND period_start = $2 AND state = 'complete'`,
        [tenantId, period],
      );
      const row = result.rows[0];
      return row ? Number(row.cnt ?? 0) : 0;
    }
    // In-memory fallback
    let count = 0;
    for (const record of this.memoryStore.values()) {
      if (record.tenantId === tenantId && record.periodStart === period && record.state === 'complete') {
        count++;
      }
    }
    return count;
  }

  /**
   * Returns the number of remaining generations this month, or null if unlimited.
   */
  async getRemainingGenerations(tenantId: string, tier: string, at?: Date): Promise<number | null> {
    const limitEntry = Object.prototype.hasOwnProperty.call(SPRITE_TIER_GENERATION_LIMITS, tier)
      ? SPRITE_TIER_GENERATION_LIMITS[tier]
      : 0;
    if (limitEntry === null) return null; // enterprise: unlimited
    const limit = limitEntry ?? 0;
    const used = await this.getMonthlyUsage(tenantId, at);
    return Math.max(0, limit - used);
  }

  /**
   * Record that a sprite generation job was submitted. Call before the provider
   * call so usage is tracked even for jobs that fail.
   */
  async recordJobStart(jobId: string, tenantId: string, provider: string): Promise<void> {
    const at = this.now();
    const id = randomUUID();
    const period = currentPeriodStart(at);
    const createdAt = at.toISOString();

    if (this.client) {
      await this.ensureSchema();
      // Idempotency: if a record for this job already exists, skip.
      const existing = await this.client.query(
        `SELECT id FROM sprite_generation_usage WHERE job_id = $1 AND tenant_id = $2`,
        [jobId, tenantId],
      );
      if (existing.rows.length > 0) return;
      await this.client.query(
        `INSERT INTO sprite_generation_usage (id, tenant_id, job_id, provider, state, period_start, created_at)
         VALUES ($1, $2, $3, $4, 'queued', $5, $6)`,
        [id, tenantId, jobId, provider, period, createdAt],
      );
      return;
    }
    // In-memory fallback: idempotency check
    for (const record of this.memoryStore.values()) {
      if (record.jobId === jobId && record.tenantId === tenantId) return;
    }
    this.memoryStore.set(id, {
      id,
      tenantId,
      jobId,
      provider,
      state: 'queued',
      periodStart: period,
      createdAt,
    });
  }

  /**
   * Mark a sprite generation job as complete, recording credit and cost usage.
   * A completed job counts against the tenant's monthly quota.
   */
  async recordJobComplete(jobId: string, creditsUsed: number, costUsd: number): Promise<void> {
    const completedAt = this.now().toISOString();
    if (this.client) {
      await this.client.query(
        `UPDATE sprite_generation_usage
         SET state = 'complete',
             model_credits_used = $1,
             cost_usd = $2,
             completed_at = $3
         WHERE job_id = $4`,
        [creditsUsed, costUsd, completedAt, jobId],
      );
      return;
    }
    for (const [key, record] of this.memoryStore.entries()) {
      if (record.jobId === jobId) {
        this.memoryStore.set(key, {
          ...record,
          state: 'complete',
          modelCreditsUsed: creditsUsed,
          costUsd,
          completedAt,
        });
        return;
      }
    }
  }

  /**
   * Mark a sprite generation job as failed. Failed jobs do NOT count toward quota.
   */
  async recordJobFailed(jobId: string, _error: string): Promise<void> {
    const completedAt = this.now().toISOString();
    if (this.client) {
      await this.client.query(
        `UPDATE sprite_generation_usage
         SET state = 'failed', completed_at = $1
         WHERE job_id = $2`,
        [completedAt, jobId],
      );
      return;
    }
    for (const [key, record] of this.memoryStore.entries()) {
      if (record.jobId === jobId) {
        this.memoryStore.set(key, {
          ...record,
          state: 'failed',
          completedAt,
        });
        return;
      }
    }
  }

  /**
   * Validate that the tenant is allowed to generate a sprite.
   * Throws a SpriteMeteringError (status 402 or 429) if not.
   */
  async validateCanGenerate(tenantId: string, tier: string): Promise<void> {
    const limitEntry = Object.prototype.hasOwnProperty.call(SPRITE_TIER_GENERATION_LIMITS, tier)
      ? SPRITE_TIER_GENERATION_LIMITS[tier]
      : 0;

    if (limitEntry === null) {
      // enterprise (or any future unlimited tier): always allowed
      return;
    }

    const limit = limitEntry ?? 0;

    if (limit === 0) {
      throw new SpriteMeteringError(402, 'generation_not_available', 'Upgrade to Indie or above for 2D sprite generation');
    }

    const used = await this.getMonthlyUsage(tenantId);
    if (used >= limit) {
      const resetsAt = nextPeriodStart(this.now());
      throw new SpriteMeteringError(
        429,
        'generation_quota_exceeded',
        `Monthly sprite generation limit of ${limit} reached`,
        { limit, used, resets_at: `${resetsAt}T00:00:00Z` },
      );
    }
  }

  // -- Postgres schema bootstrap ---------------------------------------------

  private schemaEnsured = false;

  private async ensureSchema(): Promise<void> {
    if (this.schemaEnsured || !this.client) return;
    await this.client.query(
      `CREATE TABLE IF NOT EXISTS sprite_generation_usage (
         id                   TEXT PRIMARY KEY,
         tenant_id            TEXT NOT NULL,
         job_id               TEXT NOT NULL,
         provider             TEXT NOT NULL,
         state                TEXT NOT NULL DEFAULT 'queued',
         model_credits_used   INTEGER,
         cost_usd             NUMERIC(10,4),
         period_start         DATE NOT NULL,
         created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
         completed_at         TIMESTAMPTZ
       )`,
    );
    await this.client.query(
      `CREATE INDEX IF NOT EXISTS sprite_gen_usage_tenant_period_idx
         ON sprite_generation_usage(tenant_id, period_start)`,
    );
    await this.client.query(
      `CREATE INDEX IF NOT EXISTS sprite_gen_usage_tenant_month_count_idx
         ON sprite_generation_usage(tenant_id, period_start) WHERE state = 'complete'`,
    );
    this.schemaEnsured = true;
  }
}

// -- Error -------------------------------------------------------------------

export class SpriteMeteringError extends Error {
  readonly status: number;
  readonly code: string;
  readonly detail: Record<string, unknown>;

  constructor(
    status: number,
    code: string,
    message: string,
    detail: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'SpriteMeteringError';
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}
