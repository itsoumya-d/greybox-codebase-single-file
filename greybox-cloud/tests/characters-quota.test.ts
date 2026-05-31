// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

// Integration tests: quota enforcement on POST /v1/characters/generate.
// Verifies the full flow from CharacterMeteringEmitter through CharacterService.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CharacterService,
  CharacterServiceOptions,
} from '../src/routers/characters.js';
import {
  DefaultCharacterGenRegistry,
  MockCharacterGenProvider,
} from '../src/providers/character-gen/index.js';
import {
  AssetRegistrar,
  type AssetStorage,
} from '../src/providers/character-gen/asset-registry.js';
import { InMemoryCharacterJobStore } from '../src/stores/CharacterJobStore.js';
import { CharacterMeteringEmitter, CharacterMeteringError } from '../src/metering/characterMeteringEmitter.js';
import type { AuthContext, PlanTier } from '../src/types.js';

// -- Fixtures ----------------------------------------------------------------

class InMemoryAssetStorage implements AssetStorage {
  readonly stored = new Map<string, Uint8Array>();
  constructor(readonly publicBaseUrl: string = 'https://assets.test') {}
  async store(
    input: { tenantId: string; characterId: string; sourceUrl: string },
    bytes: Uint8Array,
  ): Promise<{ uri: string; publicUrl: string }> {
    const key = `characters/${input.tenantId}/${input.characterId}.glb`;
    this.stored.set(key, bytes);
    return { uri: `memory://${key}`, publicUrl: `${this.publicBaseUrl}/${key}` };
  }
}

function buildGlbFixture(): Uint8Array {
  const json = {
    asset: { version: '2.0' },
    nodes: [{ name: 'mixamorig:Hips' }],
    skins: [{ joints: [0] }],
    animations: [{ name: 'idle', samplers: [{ input: 0 }] }],
    accessors: [{ max: [1.5] }],
  };
  const jsonText = JSON.stringify(json);
  const padded = jsonText + ' '.repeat((4 - (jsonText.length % 4)) % 4);
  const jsonBytes = Buffer.from(padded, 'utf8');
  const totalLength = 12 + 8 + jsonBytes.byteLength;
  const buffer = Buffer.alloc(totalLength);
  buffer.writeUInt32LE(0x46546c67, 0);
  buffer.writeUInt32LE(2, 4);
  buffer.writeUInt32LE(totalLength, 8);
  buffer.writeUInt32LE(jsonBytes.byteLength, 12);
  buffer.writeUInt32LE(0x4e4f534a, 16);
  jsonBytes.copy(buffer, 20);
  return new Uint8Array(buffer);
}

function makeContext(tier: PlanTier, tenantId = 'tenant-test'): AuthContext {
  return {
    tenantId,
    userId: 'user-1',
    tier,
    tokenHash: 'hash',
    roles: ['designer'],
  };
}

interface TestRig {
  service: CharacterService;
  metering: CharacterMeteringEmitter;
  now: Date;
}

function buildRig(options: {
  tier?: PlanTier;
  now?: Date;
  overrides?: Partial<CharacterServiceOptions>;
} = {}): TestRig {
  let now = options.now ?? new Date('2026-06-15T12:00:00Z');
  const clock = () => now;

  const metering = new CharacterMeteringEmitter(null, { now: clock });
  const mock = new MockCharacterGenProvider({ totalDurationMs: 100, now: () => now.getTime() });
  const store = new InMemoryCharacterJobStore({ now: clock });
  const fixtureBytes = buildGlbFixture();
  const storage = new InMemoryAssetStorage();
  const registrar = new AssetRegistrar({
    storage,
    mockFixtureBytes: fixtureBytes,
    fetch: async () => ({
      ok: true,
      status: 200,
      async text() { return Buffer.from(fixtureBytes).toString('binary'); },
    }),
  });
  let counter = 0;
  const service = new CharacterService({
    registry: new DefaultCharacterGenRegistry({ providers: [mock], defaultProviderName: 'mock' }),
    store,
    registrar,
    allowedTiers: ['indie', 'studio', 'enterprise'],
    now: clock,
    idGenerator: () => `id-${++counter}`,
    metering,
    ...options.overrides,
  });

  const rig: TestRig = { service, metering, now };
  // Expose clock mutation for tests that need to advance time.
  Object.defineProperty(rig, 'now', {
    get: () => now,
    set: (d: Date) => { now = d; },
  });
  return rig;
}

const genBody = {
  prompt: 'orc warrior',
  style: 'realistic',
  rigged: true,
  targetPolyCount: 5000,
};

// -- Tests -------------------------------------------------------------------

test('free tier receives 402 generation_not_available (metering blocks before provider)', async () => {
  // allowedTiers must include 'free' here so assertLicensed does not fire
  // first; metering's validateCanGenerate is what issues the 402.
  const { service } = buildRig({
    overrides: { allowedTiers: ['free', 'indie', 'studio', 'enterprise'] },
  });
  const context = makeContext('free');
  await assert.rejects(
    () => service.submitGenerate({ body: genBody, context }),
    (err: unknown) => {
      assert.ok(err instanceof CharacterMeteringError);
      assert.equal(err.status, 402);
      assert.equal(err.code, 'generation_not_available');
      return true;
    },
  );
});

test('indie tier succeeds when under the 5-generation limit', async () => {
  const { service } = buildRig();
  const context = makeContext('indie');
  const result = await service.submitGenerate({ body: genBody, context });
  assert.ok(result.jobId);
  assert.equal(result.providerName, 'mock');
  // remaining should reflect 1 queued (not yet complete, so still 5)
  // recordJobStart records as 'queued' — it only counts when 'complete'
  assert.ok(result.remaining === 5 || result.remaining === null || result.remaining === undefined);
});

test('indie tier is blocked after 5 completed generations', async () => {
  const { service, metering } = buildRig();
  const context = makeContext('indie', 'tenant-indie-quota');

  // Record 5 completed generations directly in metering
  for (let i = 0; i < 5; i++) {
    await metering.recordJobStart(`pre-job-${i}`, 'tenant-indie-quota', 'mock');
    await metering.recordJobComplete(`pre-job-${i}`, 0, 0);
  }

  await assert.rejects(
    () => service.submitGenerate({ body: genBody, context }),
    (err: unknown) => {
      assert.ok(err instanceof CharacterMeteringError);
      assert.equal(err.status, 429);
      assert.equal(err.code, 'generation_quota_exceeded');
      assert.equal(err.detail.limit, 5);
      return true;
    },
  );
});

test('studio tier is blocked after 50 completed generations', async () => {
  const { service, metering } = buildRig();
  const context = makeContext('studio', 'tenant-studio-quota');

  for (let i = 0; i < 50; i++) {
    await metering.recordJobStart(`studio-pre-${i}`, 'tenant-studio-quota', 'mock');
    await metering.recordJobComplete(`studio-pre-${i}`, 0, 0);
  }

  await assert.rejects(
    () => service.submitGenerate({ body: genBody, context }),
    (err: unknown) => {
      assert.ok(err instanceof CharacterMeteringError);
      assert.equal(err.status, 429);
      assert.equal(err.detail.limit, 50);
      return true;
    },
  );
});

test('enterprise tier is never blocked regardless of usage volume', async () => {
  const { service, metering } = buildRig();
  const context = makeContext('enterprise', 'tenant-ent');

  // Pre-record 200 completed jobs
  for (let i = 0; i < 200; i++) {
    await metering.recordJobStart(`ent-pre-${i}`, 'tenant-ent', 'mock');
    await metering.recordJobComplete(`ent-pre-${i}`, 0, 0);
  }

  // Should still succeed
  const result = await service.submitGenerate({ body: genBody, context });
  assert.ok(result.jobId);
});

test('failed jobs do not count toward monthly quota', async () => {
  const { service, metering } = buildRig();
  const context = makeContext('indie', 'tenant-indie-fail');

  // Record 4 complete + 1 failed = should still have 1 remaining
  for (let i = 0; i < 4; i++) {
    await metering.recordJobStart(`ok-job-${i}`, 'tenant-indie-fail', 'mock');
    await metering.recordJobComplete(`ok-job-${i}`, 0, 0);
  }
  await metering.recordJobStart('fail-job', 'tenant-indie-fail', 'mock');
  await metering.recordJobFailed('fail-job', 'provider error');

  // Should still allow one more
  const result = await service.submitGenerate({ body: genBody, context });
  assert.ok(result.jobId);
});

test('quota resets at the start of a new month', async () => {
  let now = new Date('2026-06-15T12:00:00Z');
  const clock = () => now;
  const metering = new CharacterMeteringEmitter(null, { now: clock });
  const { service } = buildRig({ overrides: { metering } });
  const context = makeContext('indie', 'tenant-monthly-reset');

  // Exhaust June quota
  for (let i = 0; i < 5; i++) {
    await metering.recordJobStart(`june-job-${i}`, 'tenant-monthly-reset', 'mock');
    await metering.recordJobComplete(`june-job-${i}`, 0, 0);
  }
  // Blocked in June
  await assert.rejects(
    () => service.submitGenerate({ body: genBody, context }),
    (err: unknown) => {
      assert.ok(err instanceof CharacterMeteringError);
      assert.equal(err.status, 429);
      return true;
    },
  );

  // Advance to July
  now = new Date('2026-07-01T00:00:00Z');

  // Should succeed in July
  const result = await service.submitGenerate({ body: genBody, context });
  assert.ok(result.jobId, 'generation allowed after monthly reset');
});

test('service without metering injected skips quota checks (backward compat)', async () => {
  // When metering is not injected, the service uses DEFAULT_ALLOWED_TIERS
  // which doesn't include 'indie' — but if we set it explicitly with no metering,
  // no quota check should fire.
  const mock = new MockCharacterGenProvider({ totalDurationMs: 100 });
  const service = new CharacterService({
    registry: new DefaultCharacterGenRegistry({ providers: [mock], defaultProviderName: 'mock' }),
    allowedTiers: ['indie'],
    // metering intentionally omitted
  });
  const context = makeContext('indie', 'tenant-no-metering');
  // Should not throw quota errors even without metering wired up
  const result = await service.submitGenerate({ body: genBody, context });
  assert.ok(result.jobId);
});
