// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

// End-to-end character-flow integration test. Runs the full lifecycle
// using the mock provider, the in-memory job store, and an in-memory
// asset storage so the test is hermetic.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CharacterService,
  handleCharacterRoute,
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
import type { AuthContext, PlanTier } from '../src/types.js';

class InMemoryAssetStorage implements AssetStorage {
  readonly stored = new Map<string, Uint8Array>();
  async store(
    input: { tenantId: string; characterId: string; sourceUrl: string },
    bytes: Uint8Array,
  ): Promise<{ uri: string; publicUrl: string }> {
    const key = `characters/${input.tenantId}/${input.characterId}.glb`;
    this.stored.set(key, bytes);
    return {
      uri: `memory://${key}`,
      publicUrl: `https://assets.test/${key}`,
    };
  }
}

function buildFixtureGlb(): Uint8Array {
  const json = {
    asset: { version: '2.0', generator: 'character-flow-test' },
    nodes: [
      { name: 'Armature', children: [1] },
      { name: 'mixamorig:Hips', children: [2, 3] },
      { name: 'mixamorig:Spine', children: [] },
      { name: 'mixamorig:LeftUpLeg', children: [] },
    ],
    skins: [{ joints: [1, 2, 3] }],
    animations: [
      { name: 'idle', samplers: [{ input: 0 }] },
      { name: 'walk', samplers: [{ input: 1 }] },
    ],
    accessors: [{ max: [2.0] }, { max: [1.0] }],
  };
  const jsonText = JSON.stringify(json);
  const padded = jsonText + ' '.repeat((4 - (jsonText.length % 4)) % 4);
  const jsonBytes = Buffer.from(padded, 'utf8');
  const total = 12 + 8 + jsonBytes.byteLength;
  const buffer = Buffer.alloc(total);
  buffer.writeUInt32LE(0x46546c67, 0);
  buffer.writeUInt32LE(2, 4);
  buffer.writeUInt32LE(total, 8);
  buffer.writeUInt32LE(jsonBytes.byteLength, 12);
  buffer.writeUInt32LE(0x4e4f534a, 16);
  jsonBytes.copy(buffer, 20);
  return new Uint8Array(buffer);
}

function context(tenantId: string, tier: PlanTier = 'indie'): AuthContext {
  return {
    tenantId,
    userId: 'user-it',
    tier,
    tokenHash: 'h',
    roles: ['designer'],
  };
}

test('character-flow: submit -> poll until done -> import -> list', async () => {
  let now = new Date('2026-05-27T00:00:00Z');
  let clockMs = now.getTime();
  const tickClockMs = (delta: number) => {
    clockMs += delta;
    now = new Date(clockMs);
  };
  const mock = new MockCharacterGenProvider({ totalDurationMs: 200, now: () => clockMs });
  const store = new InMemoryCharacterJobStore({ now: () => now });
  const storage = new InMemoryAssetStorage();
  const fixtureBytes = buildFixtureGlb();
  const registrar = new AssetRegistrar({
    storage,
    fetch: async () => ({
      ok: true,
      status: 200,
      async text() {
        return Buffer.from(fixtureBytes).toString('binary');
      },
    }),
  });
  let counter = 0;
  const service = new CharacterService({
    registry: new DefaultCharacterGenRegistry({ providers: [mock], defaultProviderName: 'mock' }),
    store,
    registrar,
    now: () => now,
    idGenerator: () => `id-${++counter}`,
  });

  const ctx = context('tenant-int');

  // 1. Submit a generation request.
  const submission = await service.submitGenerate({
    body: {
      prompt: 'a brave knight in shining armor',
      style: 'stylized',
      rigged: true,
      targetPolyCount: 8000,
      seed: 17,
    },
    context: ctx,
  });
  assert.equal(submission.providerName, 'mock');

  // 2. First poll: still queued or processing.
  const firstPoll = await service.getJob(submission.jobId, ctx);
  assert.ok(
    firstPoll.status.state === 'queued' || firstPoll.status.state === 'processing',
    `expected queued/processing, got ${firstPoll.status.state}`,
  );

  // 3. Advance clock past the mock duration, poll again -> done + import.
  tickClockMs(500);
  mock.advanceForTesting(submission.providerJobId, 500);
  const finalPoll = await service.getJob(submission.jobId, ctx);
  assert.equal(finalPoll.status.state, 'done');
  assert.ok(finalPoll.importedCharacter, 'character should be auto-imported');
  const character = finalPoll.importedCharacter;
  assert.ok(character);
  assert.equal(character?.gltfAssetUri.startsWith('memory://'), true);
  assert.equal(character?.sha256.length, 64);
  assert.equal(character?.provenance.genProvider, 'mock');
  assert.equal(character?.provenance.seed, 17);
  assert.equal(character?.animations.length, 2);
  assert.ok(character?.animations.some((c) => c.name === 'idle' && c.loop));
  // Should map all canonical joints.
  const jointNames = (character?.rig.joints ?? []).map((j) => j.name);
  assert.ok(jointNames.includes('mixamorig:Hips'));
  assert.ok(jointNames.includes('mixamorig:Spine'));
  assert.ok(jointNames.includes('mixamorig:LeftUpLeg'));

  // 4. listCharacters returns the imported character.
  const characters = await service.listCharacters(ctx);
  assert.equal(characters.length, 1);
  assert.equal(characters[0]?.id, character?.id);

  // 5. Re-importing the same job is idempotent.
  const reimport = await service.importByJobId({ jobId: submission.jobId, context: ctx });
  assert.equal(reimport.id, character?.id);

  // 6. Route handler integration.
  const listRes = await handleCharacterRoute(
    {
      method: 'GET',
      url: new URL('http://localhost/v1/characters'),
      headers: new Headers(),
      async readJson() { return {}; },
    },
    service,
    async () => ctx,
  );
  assert.equal(listRes?.status, 200);
  const listBody = listRes?.body as { characters: Array<{ id: string }> };
  assert.equal(listBody.characters.length, 1);

  // 7. Cross-tenant isolation.
  const otherCtx = context('tenant-other');
  await assert.rejects(
    () => service.getCharacter(character?.id ?? '', otherCtx),
    (error: unknown) => {
      const code = (error as { code?: string })?.code;
      assert.equal(code, 'character_not_found');
      return true;
    },
  );
});

test('character-flow: failed generation surfaces error and does not import', async () => {
  let clockMs = 0;
  const mock = new MockCharacterGenProvider({ totalDurationMs: 100, now: () => clockMs });
  const store = new InMemoryCharacterJobStore();
  const storage = new InMemoryAssetStorage();
  const registrar = new AssetRegistrar({
    storage,
    fetch: async () => ({ ok: false, status: 500, async text() { return ''; } }),
  });
  let counter = 0;
  const service = new CharacterService({
    registry: new DefaultCharacterGenRegistry({ providers: [mock], defaultProviderName: 'mock' }),
    store,
    registrar,
    idGenerator: () => `id-${++counter}`,
  });
  const ctx = context('tenant-fail');
  const submission = await service.submitGenerate({
    body: {
      prompt: 'should FAIL on purpose',
      style: 'realistic',
      rigged: false,
      targetPolyCount: 1000,
    },
    context: ctx,
  });
  clockMs += 1000;
  mock.advanceForTesting(submission.providerJobId, 1000);
  const result = await service.getJob(submission.jobId, ctx);
  assert.equal(result.status.state, 'failed');
  const characters = await service.listCharacters(ctx);
  assert.equal(characters.length, 0);
});
