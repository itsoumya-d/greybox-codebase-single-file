// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  Tripo3DProvider,
  extractTripoJobId,
  parseTripoStatus,
} from '../src/providers/character-gen/tripo3d.js';
import {
  CharacterGenConfigError,
  CharacterGenUpstreamError,
  type FetchLike,
} from '../src/providers/character-gen/types.js';

interface FetchCall {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

function recordingFetch(handler: (call: FetchCall) => {
  ok?: boolean;
  status?: number;
  body: unknown;
}): { fetch: FetchLike; calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const fetch: FetchLike = async (input, init) => {
    const call: FetchCall = {
      url: input,
      ...(init?.method ? { method: init.method } : {}),
      ...(init?.headers ? { headers: init.headers } : {}),
      ...(init?.body ? { body: init.body } : {}),
    };
    calls.push(call);
    const out = handler(call);
    const status = out.status ?? (out.ok === false ? 500 : 200);
    const ok = out.ok ?? (status >= 200 && status < 300);
    const text = typeof out.body === 'string' ? out.body : JSON.stringify(out.body);
    return {
      ok,
      status,
      statusText: ok ? 'OK' : 'Error',
      async json() {
        return JSON.parse(text);
      },
      async text() {
        return text;
      },
    };
  };
  return { fetch, calls };
}

test('Tripo3DProvider throws on construction without API key', () => {
  assert.throws(
    () => new Tripo3DProvider({ apiKey: '', fetch: async () => ({ ok: true, status: 200, async text() { return ''; } }) }),
    CharacterGenConfigError,
  );
});

test('Tripo3DProvider.submitJob sends a well-shaped payload', async () => {
  const { fetch, calls } = recordingFetch(() => ({
    body: { code: 0, data: { task_id: 'tripo-1' } },
  }));
  const provider = new Tripo3DProvider({
    apiKey: 'k',
    fetch,
    baseUrl: 'https://api.tripo3d.test',
  });
  const r = await provider.submitJob({
    prompt: 'anime ninja',
    style: 'anime',
    rigged: true,
    targetPolyCount: 12000,
    seed: 7,
  });
  assert.equal(r.jobId, 'tripo-1');
  assert.equal(calls.length, 1);
  const call = calls[0];
  assert.equal(call?.url, 'https://api.tripo3d.test/v2/openapi/task');
  assert.equal(call?.method, 'POST');
  assert.equal(call?.headers?.authorization, 'Bearer k');
  const body = JSON.parse(call?.body ?? '{}') as Record<string, unknown>;
  assert.equal(body.type, 'text_to_model');
  assert.equal(body.prompt, 'anime ninja');
  assert.equal(body.style, 'object:anime');
  assert.equal(body.face_limit, 12000);
  assert.equal(body.seed, 7);
  assert.equal(body.auto_rig, true);
});

test('Tripo3DProvider.submitJob uses image_to_model when referenceImageUrl present', async () => {
  const { fetch, calls } = recordingFetch(() => ({
    body: { code: 0, data: { task_id: 'tripo-img' } },
  }));
  const provider = new Tripo3DProvider({ apiKey: 'k', fetch });
  await provider.submitJob({
    prompt: 'realistic person',
    style: 'realistic',
    rigged: false,
    targetPolyCount: 5000,
    referenceImageUrl: 'https://example/ref.png',
  });
  const body = JSON.parse(calls[0]?.body ?? '{}') as Record<string, unknown>;
  assert.equal(body.type, 'image_to_model');
  assert.equal(body.image_url, 'https://example/ref.png');
});

test('Tripo3DProvider.submitJob fails on non-zero code', async () => {
  const { fetch } = recordingFetch(() => ({
    body: { code: 1001, message: 'invalid api key' },
  }));
  const provider = new Tripo3DProvider({ apiKey: 'k', fetch });
  await assert.rejects(
    () => provider.submitJob({
      prompt: 'x',
      style: 'realistic',
      rigged: false,
      targetPolyCount: 1000,
    }),
    CharacterGenUpstreamError,
  );
});

test('parseTripoStatus maps lifecycle states', () => {
  const queued = parseTripoStatus({ code: 0, data: { status: 'queued', create_time: 1700000000 } });
  assert.equal(queued.state, 'queued');
  const processing = parseTripoStatus({ code: 0, data: { status: 'running', progress: 60 } });
  assert.equal(processing.state, 'processing');
  if (processing.state === 'processing') assert.equal(processing.percent, 60);

  const done = parseTripoStatus({
    code: 0,
    data: {
      status: 'success',
      output: { model_glb: 'https://cdn.tripo/x.glb', rendered_image: 'https://cdn.tripo/x.png' },
      end_time: 1700000120,
      license: 'Tripo-Commercial',
    },
  });
  assert.equal(done.state, 'done');
  if (done.state === 'done') {
    assert.equal(done.outputs.gltfUrl, 'https://cdn.tripo/x.glb');
    assert.equal(done.outputs.thumbnailUrl, 'https://cdn.tripo/x.png');
    assert.equal(done.outputs.license, 'Tripo-Commercial');
  }

  const failed = parseTripoStatus({
    code: 0,
    data: { status: 'failed', fail_reason: 'gpu OOM', end_time: 1700000200 },
  });
  assert.equal(failed.state, 'failed');
  if (failed.state === 'failed') assert.match(failed.error, /OOM/u);

  // Unknown status -> processing.
  const unknown = parseTripoStatus({ code: 0, data: { status: 'mystery' } });
  assert.equal(unknown.state, 'processing');
});

test('parseTripoStatus throws on non-zero envelope code', () => {
  assert.throws(
    () => parseTripoStatus({ code: 500, message: 'server fail' }),
    CharacterGenUpstreamError,
  );
});

test('parseTripoStatus throws when success but no model_glb', () => {
  assert.throws(
    () => parseTripoStatus({
      code: 0,
      data: { status: 'success', output: {} },
    }),
    CharacterGenUpstreamError,
  );
});

test('extractTripoJobId handles success and failure envelopes', () => {
  assert.equal(extractTripoJobId({ code: 0, data: { task_id: 'foo' } }), 'foo');
  assert.equal(extractTripoJobId({ code: 1, data: { task_id: 'bar' } }), undefined);
  assert.equal(extractTripoJobId({}), undefined);
});

test('Tripo3DProvider.pollJob hits the correct URL', async () => {
  const { fetch, calls } = recordingFetch(() => ({
    body: { code: 0, data: { status: 'running', progress: 30 } },
  }));
  const provider = new Tripo3DProvider({
    apiKey: 'k',
    fetch,
    baseUrl: 'https://api.tripo3d.test/',
  });
  const status = await provider.pollJob('tripo-7');
  assert.equal(status.state, 'processing');
  assert.equal(calls[0]?.url, 'https://api.tripo3d.test/v2/openapi/task/tripo-7');
  assert.equal(calls[0]?.method, 'GET');
});
