// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MockCharacterGenProvider,
  mockJobId,
} from '../src/providers/character-gen/mock.js';
import {
  CharacterGenInputError,
  parseCharacterGenInput,
  type CharacterGenInput,
} from '../src/providers/character-gen/types.js';

function exampleInput(overrides: Partial<CharacterGenInput> = {}): CharacterGenInput {
  return {
    prompt: 'a wandering goblin scout in leather armor',
    style: 'stylized',
    rigged: true,
    targetPolyCount: 8000,
    seed: 42,
    ...overrides,
  };
}

test('MockCharacterGenProvider returns deterministic jobId per input', async () => {
  const provider = new MockCharacterGenProvider({ totalDurationMs: 1000 });
  const a = await provider.submitJob(exampleInput());
  const b = await provider.submitJob(exampleInput());
  assert.equal(a.jobId, b.jobId, 'same input should produce same jobId');
  assert.equal(a.jobId, mockJobId(exampleInput()));
});

test('MockCharacterGenProvider transitions queued -> processing -> done', async () => {
  let now = 1_700_000_000_000;
  const provider = new MockCharacterGenProvider({
    totalDurationMs: 1000,
    now: () => now,
    fixtureUrl: 'https://example/fixture.glb',
    thumbnailUrl: 'https://example/fixture.png',
  });
  const { jobId } = await provider.submitJob(exampleInput());

  // T=0: queued (still within first 10% window).
  let status = await provider.pollJob(jobId);
  assert.equal(status.state, 'queued');

  // T=400 (40%): processing.
  now += 400;
  status = await provider.pollJob(jobId);
  assert.equal(status.state, 'processing');
  if (status.state === 'processing') {
    assert.ok(status.percent >= 1 && status.percent <= 99, `percent out of range: ${status.percent}`);
  }

  // T=2000 (past total): done.
  now += 2000;
  status = await provider.pollJob(jobId);
  assert.equal(status.state, 'done');
  if (status.state === 'done') {
    assert.equal(status.outputs.gltfUrl, 'https://example/fixture.glb');
    assert.equal(status.outputs.thumbnailUrl, 'https://example/fixture.png');
    assert.ok(status.outputs.license);
  }
});

test('MockCharacterGenProvider supports forced failure via FAIL in prompt', async () => {
  let now = 0;
  const provider = new MockCharacterGenProvider({
    totalDurationMs: 600,
    now: () => now,
  });
  const { jobId } = await provider.submitJob(exampleInput({ prompt: 'goblin FAIL', seed: 1 }));
  now += 300;
  const status = await provider.pollJob(jobId);
  assert.equal(status.state, 'failed');
  if (status.state === 'failed') {
    assert.match(status.error, /forced failure/u);
  }
});

test('MockCharacterGenProvider rejects unknown jobIds', async () => {
  const provider = new MockCharacterGenProvider();
  await assert.rejects(() => provider.pollJob('definitely-not-a-job'), /no record of job/u);
});

test('MockCharacterGenProvider.advanceForTesting fast-forwards a job', async () => {
  let now = 0;
  const provider = new MockCharacterGenProvider({
    totalDurationMs: 10_000,
    now: () => now,
  });
  const { jobId } = await provider.submitJob(exampleInput({ seed: 7 }));
  provider.advanceForTesting(jobId, 12_000);
  const status = await provider.pollJob(jobId);
  assert.equal(status.state, 'done');
});

test('MockCharacterGenProvider descriptor advertises all canonical styles', () => {
  const provider = new MockCharacterGenProvider();
  assert.equal(provider.descriptor.name, 'mock');
  assert.equal(provider.descriptor.requiresApiKey, false);
  for (const style of ['realistic', 'stylized', 'anime', 'low-poly', 'cartoon'] as const) {
    assert.ok(provider.descriptor.styles.includes(style), `missing style ${style}`);
  }
});

test('parseCharacterGenInput rejects empty prompt and out-of-range polyCount', () => {
  assert.throws(() => parseCharacterGenInput({ ...exampleInput(), prompt: '' }), CharacterGenInputError);
  assert.throws(
    () => parseCharacterGenInput({ ...exampleInput(), targetPolyCount: 50 }),
    CharacterGenInputError,
  );
  assert.throws(
    () => parseCharacterGenInput({ ...exampleInput(), targetPolyCount: 2_000_000 }),
    CharacterGenInputError,
  );
});

test('parseCharacterGenInput accepts all canonical styles', () => {
  for (const style of ['realistic', 'stylized', 'anime', 'low-poly', 'cartoon']) {
    const parsed = parseCharacterGenInput({
      ...exampleInput(),
      style,
    });
    assert.equal(parsed.style, style);
  }
});

test('parseCharacterGenInput rejects invalid referenceImageUrl', () => {
  assert.throws(
    () => parseCharacterGenInput({ ...exampleInput(), referenceImageUrl: 'not a url' }),
    CharacterGenInputError,
  );
  assert.throws(
    () => parseCharacterGenInput({ ...exampleInput(), referenceImageUrl: 'ftp://example.com/x.png' }),
    CharacterGenInputError,
  );
  // valid http(s) URL passes
  const ok = parseCharacterGenInput({
    ...exampleInput(),
    referenceImageUrl: 'https://example.com/x.png',
  });
  assert.equal(ok.referenceImageUrl, 'https://example.com/x.png');
});
