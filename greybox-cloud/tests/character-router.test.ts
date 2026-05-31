// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CharacterRouterError,
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

function makeContext(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    tenantId: 'tenant-acme',
    userId: 'user-1',
    tier: 'indie',
    tokenHash: 'hash',
    roles: ['designer'],
    ...overrides,
  };
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

class InMemoryAssetStorage implements AssetStorage {
  readonly stored = new Map<string, Uint8Array>();
  constructor(readonly publicBaseUrl: string = 'https://assets.test') {}
  async store(
    input: { tenantId: string; characterId: string; sourceUrl: string },
    bytes: Uint8Array,
  ): Promise<{ uri: string; publicUrl: string }> {
    const key = `characters/${input.tenantId}/${input.characterId}.glb`;
    this.stored.set(key, bytes);
    return {
      uri: `memory://${key}`,
      publicUrl: `${this.publicBaseUrl}/${key}`,
    };
  }
}

function buildService(options: { now?: () => Date; allowedTiers?: PlanTier[] } = {}): {
  service: CharacterService;
  mock: MockCharacterGenProvider;
  store: InMemoryCharacterJobStore;
  storage: InMemoryAssetStorage;
} {
  let now = options.now ? options.now() : new Date('2026-05-27T00:00:00Z');
  const clock = () => now;
  const mock = new MockCharacterGenProvider({ totalDurationMs: 100, now: () => now.getTime() });
  const store = new InMemoryCharacterJobStore({ now: clock });
  const storage = new InMemoryAssetStorage();
  const fixtureBytes = buildGlbFixture();
  const registrar = new AssetRegistrar({
    storage,
    mockFixtureBytes: fixtureBytes,
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
    ...(options.allowedTiers ? { allowedTiers: options.allowedTiers } : {}),
    now: clock,
    idGenerator: () => `id-${++counter}`,
  });
  // Allow tests to tick the clock.
  (service as unknown as { _setNow: (d: Date) => void })._setNow = (d) => { now = d; };
  return { service, mock, store, storage };
}

test('submitGenerate rejects free-tier callers', async () => {
  const { service } = buildService();
  const context = makeContext({ tier: 'free' });
  await assert.rejects(
    () => service.submitGenerate({
      body: {
        prompt: 'orc warrior',
        style: 'realistic',
        rigged: true,
        targetPolyCount: 5000,
      },
      context,
    }),
    (error: unknown) => {
      assert.ok(error instanceof CharacterRouterError);
      assert.equal((error as CharacterRouterError).status, 403);
      assert.equal((error as CharacterRouterError).code, 'license_required');
      return true;
    },
  );
});

test('submitGenerate accepts pro-tier and creates job', async () => {
  const { service, store } = buildService();
  const result = await service.submitGenerate({
    body: {
      prompt: 'orc warrior',
      style: 'realistic',
      rigged: true,
      targetPolyCount: 5000,
    },
    context: makeContext(),
  });
  assert.equal(result.providerName, 'mock');
  assert.equal(result.jobId, 'id-1');
  const jobs = await store.listJobsForTenant('tenant-acme');
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0]?.state, 'queued');
});

test('submitGenerate rejects body without required fields (400)', async () => {
  const { service } = buildService();
  await assert.rejects(
    () => service.submitGenerate({
      body: { prompt: 'p' },
      context: makeContext(),
    }),
  );
});

test('getJob returns 404 for missing job', async () => {
  const { service } = buildService();
  await assert.rejects(
    () => service.getJob('not-found', makeContext()),
    (error: unknown) => {
      assert.ok(error instanceof CharacterRouterError);
      assert.equal((error as CharacterRouterError).status, 404);
      return true;
    },
  );
});

test('getJob polls provider, transitions to done, and auto-imports', async () => {
  const { service, mock, store } = buildService();
  const submission = await service.submitGenerate({
    body: {
      prompt: 'paladin in plate armor',
      style: 'realistic',
      rigged: true,
      targetPolyCount: 5000,
    },
    context: makeContext(),
  });
  // Fast-forward the mock provider's clock so the next poll resolves "done".
  mock.advanceForTesting(submission.providerJobId, 200);
  // Stub the registrar to use the greybox-mock fixture protocol; otherwise
  // the mock fixture URL is https://greybox-fixtures.s3...
  // The registrar in buildService already reads bytes from the in-memory
  // buffer via the supplied fetch. So we can directly poll.
  const result = await service.getJob(submission.jobId, makeContext());
  assert.equal(result.status.state, 'done');
  assert.ok(result.importedCharacter);
  assert.equal(result.importedCharacter?.name.length > 0, true);
  // Job got updated.
  const updated = await store.getJob(submission.jobId, 'tenant-acme');
  assert.equal(updated?.state, 'done');
  assert.equal(updated?.importedCharacterId, result.importedCharacter?.id);
});

test('listCharacters returns saved characters for tenant', async () => {
  const { service, mock } = buildService();
  const sub = await service.submitGenerate({
    body: {
      prompt: 'ranger',
      style: 'cartoon',
      rigged: true,
      targetPolyCount: 6000,
    },
    context: makeContext(),
  });
  mock.advanceForTesting(sub.providerJobId, 200);
  await service.getJob(sub.jobId, makeContext());
  const list = await service.listCharacters(makeContext());
  assert.equal(list.length, 1);
  assert.ok(list[0]?.gltfAssetUri.startsWith('memory://'));
});

test('importByUrl creates a character from an arbitrary glb URL', async () => {
  const { service } = buildService();
  const character = await service.importByUrl({
    gltfUrl: 'https://example.com/cool-character.glb',
    providerProvenance: { genProvider: 'manual', license: 'CC-BY-4.0' },
    name: 'My Custom Character',
    context: makeContext(),
  });
  assert.equal(character.name, 'My Custom Character');
  assert.equal(character.provenance.genProvider, 'manual');
  assert.equal(character.provenance.license, 'CC-BY-4.0');
  assert.ok(character.sha256.length === 64);
});

test('importByUrl rejects non-http urls', async () => {
  const { service } = buildService();
  await assert.rejects(
    () => service.importByUrl({
      gltfUrl: 'ftp://example/illegal.glb',
      context: makeContext(),
    }),
    /invalid_gltf_url|http\(s\)/u,
  );
});

test('handleCharacterRoute mounts /v1/characters/providers (auth-only)', async () => {
  const { service } = buildService();
  const result = await handleCharacterRoute(
    {
      method: 'GET',
      url: new URL('http://localhost/v1/characters/providers'),
      headers: new Headers(),
      async readJson() { return {}; },
    },
    service,
    async () => makeContext(),
  );
  assert.ok(result);
  assert.equal(result?.status, 200);
  const body = result?.body as { providers: Array<{ name: string }>; canUse: boolean };
  assert.ok(body.providers.some((p) => p.name === 'mock'));
  assert.equal(body.canUse, true);
});

test('handleCharacterRoute returns undefined for non-matching paths', async () => {
  const { service } = buildService();
  const result = await handleCharacterRoute(
    {
      method: 'GET',
      url: new URL('http://localhost/v1/other'),
      headers: new Headers(),
      async readJson() { return {}; },
    },
    service,
    async () => makeContext(),
  );
  assert.equal(result, undefined);
});

test('handleCharacterRoute returns 403 for free tier callers on generate', async () => {
  const { service } = buildService();
  const result = await handleCharacterRoute(
    {
      method: 'POST',
      url: new URL('http://localhost/v1/characters/generate'),
      headers: new Headers(),
      async readJson() {
        return {
          prompt: 'orc',
          style: 'realistic',
          rigged: false,
          targetPolyCount: 1000,
        };
      },
    },
    service,
    async () => makeContext({ tier: 'free' }),
  );
  assert.equal(result?.status, 403);
});

test('handleCharacterRoute /v1/characters/generate returns 202 with jobId', async () => {
  const { service } = buildService();
  const result = await handleCharacterRoute(
    {
      method: 'POST',
      url: new URL('http://localhost/v1/characters/generate'),
      headers: new Headers(),
      async readJson() {
        return {
          prompt: 'orc warrior',
          style: 'realistic',
          rigged: true,
          targetPolyCount: 5000,
        };
      },
    },
    service,
    async () => makeContext(),
  );
  assert.equal(result?.status, 202);
  const body = result?.body as { jobId: string; providerName: string };
  assert.ok(body.jobId);
  assert.equal(body.providerName, 'mock');
});
