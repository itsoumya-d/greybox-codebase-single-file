// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

// Unit tests for CharacterMeteringEmitter: quota checks, per-tier limits,
// period calculation, and job lifecycle recording.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CharacterMeteringEmitter,
  CharacterMeteringError,
  TIER_GENERATION_LIMITS,
  currentPeriodStart,
  nextPeriodStart,
} from '../src/metering/characterMeteringEmitter.js';

// -- Helpers -----------------------------------------------------------------

function makeEmitter(now?: () => Date): CharacterMeteringEmitter {
  return new CharacterMeteringEmitter(null, { now });
}

const JUNE_1 = new Date('2026-06-01T00:00:00Z');
const JUNE_15 = new Date('2026-06-15T12:00:00Z');
const JULY_1 = new Date('2026-07-01T00:00:00Z');

// -- Tier limit constants ----------------------------------------------------

test('TIER_GENERATION_LIMITS contains expected values', () => {
  assert.equal(TIER_GENERATION_LIMITS.free, 0);
  assert.equal(TIER_GENERATION_LIMITS.indie, 5);
  assert.equal(TIER_GENERATION_LIMITS.studio, 50);
  assert.equal(TIER_GENERATION_LIMITS.enterprise, null);
});

// -- Period helpers ----------------------------------------------------------

test('currentPeriodStart returns first day of month as ISO date', () => {
  assert.equal(currentPeriodStart(JUNE_15), '2026-06-01');
  assert.equal(currentPeriodStart(JUNE_1), '2026-06-01');
  assert.equal(currentPeriodStart(JULY_1), '2026-07-01');
});

test('nextPeriodStart returns first day of next month', () => {
  assert.equal(nextPeriodStart(JUNE_15), '2026-07-01');
  assert.equal(nextPeriodStart(JULY_1), '2026-08-01');
  // December -> January rollover
  assert.equal(nextPeriodStart(new Date('2026-12-15T00:00:00Z')), '2027-01-01');
});

// -- getMonthlyUsage ---------------------------------------------------------

test('getMonthlyUsage returns 0 for tenant with no records', async () => {
  const emitter = makeEmitter();
  const count = await emitter.getMonthlyUsage('tenant-a');
  assert.equal(count, 0);
});

test('getMonthlyUsage counts only complete jobs', async () => {
  const emitter = makeEmitter(() => JUNE_15);
  await emitter.recordJobStart('job-1', 'tenant-a', 'mock');
  // job-1 is queued, not complete — should not count
  assert.equal(await emitter.getMonthlyUsage('tenant-a'), 0);

  await emitter.recordJobComplete('job-1', 0, 0);
  assert.equal(await emitter.getMonthlyUsage('tenant-a'), 1);
});

test('getMonthlyUsage does not count failed jobs', async () => {
  const emitter = makeEmitter(() => JUNE_15);
  await emitter.recordJobStart('job-f', 'tenant-b', 'mock');
  await emitter.recordJobFailed('job-f', 'upstream error');
  assert.equal(await emitter.getMonthlyUsage('tenant-b'), 0);
});

test('getMonthlyUsage is scoped per tenant', async () => {
  const emitter = makeEmitter(() => JUNE_15);
  await emitter.recordJobStart('job-a', 'tenant-x', 'mock');
  await emitter.recordJobComplete('job-a', 0, 0);
  await emitter.recordJobStart('job-b', 'tenant-y', 'mock');
  await emitter.recordJobComplete('job-b', 0, 0);

  assert.equal(await emitter.getMonthlyUsage('tenant-x'), 1);
  assert.equal(await emitter.getMonthlyUsage('tenant-y'), 1);
  assert.equal(await emitter.getMonthlyUsage('tenant-z'), 0);
});

// -- Monthly period reset ----------------------------------------------------

test('getMonthlyUsage resets at start of new month', async () => {
  let now = JUNE_15;
  const emitter = makeEmitter(() => now);

  // Record two complete jobs in June
  await emitter.recordJobStart('job-june-1', 'tenant-reset', 'mock');
  await emitter.recordJobComplete('job-june-1', 0, 0);
  await emitter.recordJobStart('job-june-2', 'tenant-reset', 'mock');
  await emitter.recordJobComplete('job-june-2', 0, 0);
  assert.equal(await emitter.getMonthlyUsage('tenant-reset', now), 2);

  // Advance to July
  now = JULY_1;
  assert.equal(await emitter.getMonthlyUsage('tenant-reset', now), 0);

  // Record one job in July
  await emitter.recordJobStart('job-july-1', 'tenant-reset', 'mock');
  await emitter.recordJobComplete('job-july-1', 0, 0);
  assert.equal(await emitter.getMonthlyUsage('tenant-reset', now), 1);
  // June count is still 2
  assert.equal(await emitter.getMonthlyUsage('tenant-reset', JUNE_15), 2);
});

// -- getRemainingGenerations -------------------------------------------------

test('getRemainingGenerations returns 0 for free tier', async () => {
  const emitter = makeEmitter();
  const remaining = await emitter.getRemainingGenerations('tenant-free', 'free');
  assert.equal(remaining, 0);
});

test('getRemainingGenerations returns null for enterprise (unlimited)', async () => {
  const emitter = makeEmitter();
  const remaining = await emitter.getRemainingGenerations('tenant-ent', 'enterprise');
  assert.equal(remaining, null);
});

test('getRemainingGenerations returns limit minus used for indie', async () => {
  const emitter = makeEmitter(() => JUNE_15);
  // No usage yet
  assert.equal(await emitter.getRemainingGenerations('tenant-indie', 'indie'), 5);

  // Use 3
  for (let i = 0; i < 3; i++) {
    await emitter.recordJobStart(`job-indie-${i}`, 'tenant-indie', 'mock');
    await emitter.recordJobComplete(`job-indie-${i}`, 0, 0);
  }
  assert.equal(await emitter.getRemainingGenerations('tenant-indie', 'indie'), 2);
});

test('getRemainingGenerations returns 0 (not negative) when quota exhausted', async () => {
  const emitter = makeEmitter(() => JUNE_15);
  for (let i = 0; i < 6; i++) {
    await emitter.recordJobStart(`job-over-${i}`, 'tenant-over', 'mock');
    await emitter.recordJobComplete(`job-over-${i}`, 0, 0);
  }
  const remaining = await emitter.getRemainingGenerations('tenant-over', 'indie');
  assert.equal(remaining, 0);
});

// -- validateCanGenerate -----------------------------------------------------

test('validateCanGenerate throws 402 for free tier', async () => {
  const emitter = makeEmitter();
  let thrown: unknown;
  try {
    await emitter.validateCanGenerate('tenant-free', 'free');
    assert.fail('expected an error to be thrown');
  } catch (err) {
    thrown = err;
  }
  assert.ok(thrown instanceof CharacterMeteringError);
  assert.equal(thrown.status, 402);
  assert.equal(thrown.code, 'generation_not_available');
});

test('validateCanGenerate does not throw for enterprise (unlimited)', async () => {
  const emitter = makeEmitter(() => JUNE_15);
  // Even after many jobs, enterprise is never blocked
  for (let i = 0; i < 100; i++) {
    await emitter.recordJobStart(`ent-job-${i}`, 'tenant-ent', 'mock');
    await emitter.recordJobComplete(`ent-job-${i}`, 0, 0);
  }
  await assert.doesNotReject(() => emitter.validateCanGenerate('tenant-ent', 'enterprise'));
});

test('validateCanGenerate allows indie within limit', async () => {
  const emitter = makeEmitter(() => JUNE_15);
  await assert.doesNotReject(() => emitter.validateCanGenerate('tenant-indie', 'indie'));
});

test('validateCanGenerate throws 429 when indie limit exhausted', async () => {
  const emitter = makeEmitter(() => JUNE_15);
  for (let i = 0; i < 5; i++) {
    await emitter.recordJobStart(`job-limit-${i}`, 'tenant-quota', 'mock');
    await emitter.recordJobComplete(`job-limit-${i}`, 0, 0);
  }
  let thrown: unknown;
  try {
    await emitter.validateCanGenerate('tenant-quota', 'indie');
    assert.fail('expected an error to be thrown');
  } catch (err) {
    thrown = err;
  }
  assert.ok(thrown instanceof CharacterMeteringError);
  assert.equal(thrown.status, 429);
  assert.equal(thrown.code, 'generation_quota_exceeded');
  assert.equal(thrown.detail.limit, 5);
  assert.equal(thrown.detail.used, 5);
  assert.ok(typeof thrown.detail.resets_at === 'string');
});

test('validateCanGenerate throws 429 when studio limit (50) exhausted', async () => {
  const emitter = makeEmitter(() => JUNE_15);
  for (let i = 0; i < 50; i++) {
    await emitter.recordJobStart(`job-studio-${i}`, 'tenant-studio', 'mock');
    await emitter.recordJobComplete(`job-studio-${i}`, 0, 0);
  }
  let thrown: unknown;
  try {
    await emitter.validateCanGenerate('tenant-studio', 'studio');
    assert.fail('expected an error to be thrown');
  } catch (err) {
    thrown = err;
  }
  assert.ok(thrown instanceof CharacterMeteringError);
  assert.equal(thrown.status, 429);
  assert.equal(thrown.detail.limit, 50);
});

// -- Idempotency -------------------------------------------------------------

test('recordJobStart is idempotent (double-call does not double-count)', async () => {
  const emitter = makeEmitter(() => JUNE_15);
  await emitter.recordJobStart('job-idem', 'tenant-idem', 'mock');
  await emitter.recordJobStart('job-idem', 'tenant-idem', 'mock'); // duplicate
  await emitter.recordJobComplete('job-idem', 0, 0);
  assert.equal(await emitter.getMonthlyUsage('tenant-idem'), 1);
});

// -- Error response shape ----------------------------------------------------

test('CharacterMeteringError carries expected fields', () => {
  const err = new CharacterMeteringError(429, 'generation_quota_exceeded', 'limit reached', {
    limit: 5,
    used: 5,
    resets_at: '2026-07-01T00:00:00Z',
  });
  assert.equal(err.status, 429);
  assert.equal(err.code, 'generation_quota_exceeded');
  assert.equal(err.detail.limit, 5);
  assert.equal(err.detail.resets_at, '2026-07-01T00:00:00Z');
  assert.ok(err instanceof CharacterMeteringError);
  assert.ok(err instanceof Error);
});
