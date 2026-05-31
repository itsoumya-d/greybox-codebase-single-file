// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

// Unit tests for Fal.ai sprite generation and SpriteMeteringEmitter.

import assert from 'node:assert/strict';
import test from 'node:test';

import { generateSprite, FalAiError } from '../src/providers/falAi.js';
import { SpriteMeteringEmitter, SpriteMeteringError } from '../src/metering/spriteMeteringEmitter.js';

// ---------------------------------------------------------------------------
// generateSprite
// ---------------------------------------------------------------------------

test('generateSprite dry run (no API key) returns SVG placeholder', async () => {
  const result = await generateSprite(
    { prompt: 'hero warrior' },
    { apiKey: '' },
  );
  assert.ok(result.imageUrl.startsWith('data:'), `expected data: URL, got ${result.imageUrl.slice(0, 40)}`);
  assert.equal(result.width, 256);
  assert.equal(result.height, 256);
  assert.equal(result.seed, 0);
});

test('generateSprite with mocked fetch returning valid image returns correct fields', async () => {
  const mockFetch = async (_url: string, _init: unknown) => ({
    ok: true,
    status: 200,
    json: async () => ({
      images: [{ url: 'https://cdn.fal.ai/test/sprite.png', width: 512, height: 512 }],
      seed: 42,
      timings: { inference: 0.8 },
    }),
  });

  const result = await generateSprite(
    { prompt: 'enemy goblin', imageSize: 'square' },
    { apiKey: 'test-key', fetchFn: mockFetch as never },
  );

  assert.equal(result.imageUrl, 'https://cdn.fal.ai/test/sprite.png');
  assert.equal(result.width, 512);
  assert.equal(result.height, 512);
  assert.equal(result.seed, 42);
  assert.equal(result.inferenceTimeMs, 800);
});

test('generateSprite with mocked fetch returning non-ok throws FalAiError', async () => {
  const mockFetch = async (_url: string, _init: unknown) => ({
    ok: false,
    status: 503,
    json: async () => ({}),
    text: async () => 'Service unavailable',
  });

  await assert.rejects(
    () => generateSprite(
      { prompt: 'player ninja' },
      { apiKey: 'test-key', fetchFn: mockFetch as never },
    ),
    (err: unknown) => {
      assert.ok(err instanceof FalAiError, 'should be FalAiError');
      assert.equal((err as FalAiError).status, 503);
      assert.equal((err as FalAiError).code, 'fal_api_error');
      return true;
    },
  );
});

// ---------------------------------------------------------------------------
// SpriteMeteringEmitter
// ---------------------------------------------------------------------------

function makeEmitter(now?: () => Date): SpriteMeteringEmitter {
  return new SpriteMeteringEmitter(null, { now });
}

const JUNE_15 = new Date('2026-06-15T12:00:00Z');

test('SpriteMeteringEmitter.validateCanGenerate with free tier at limit throws SpriteMeteringError status 429', async () => {
  // free tier limit is 2; fill up 2 completed jobs then try a third
  const emitter = makeEmitter(() => JUNE_15);

  await emitter.recordJobStart('job-1', 'tenant-free', 'fal-ai');
  await emitter.recordJobComplete('job-1', 1, 0.01);

  await emitter.recordJobStart('job-2', 'tenant-free', 'fal-ai');
  await emitter.recordJobComplete('job-2', 1, 0.01);

  await assert.rejects(
    () => emitter.validateCanGenerate('tenant-free', 'free'),
    (err: unknown) => {
      assert.ok(err instanceof SpriteMeteringError, 'should be SpriteMeteringError');
      assert.equal((err as SpriteMeteringError).status, 429);
      assert.equal((err as SpriteMeteringError).code, 'generation_quota_exceeded');
      return true;
    },
  );
});

test('SpriteMeteringEmitter.validateCanGenerate with enterprise tier never throws', async () => {
  const emitter = makeEmitter(() => JUNE_15);

  // Record many completed jobs — enterprise should still pass
  for (let i = 0; i < 500; i++) {
    await emitter.recordJobStart(`job-ent-${i}`, 'tenant-enterprise', 'fal-ai');
    await emitter.recordJobComplete(`job-ent-${i}`, 1, 0.01);
  }

  await assert.doesNotReject(() => emitter.validateCanGenerate('tenant-enterprise', 'enterprise'));
});
