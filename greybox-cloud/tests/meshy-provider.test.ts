// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MeshyV3Provider,
  extractMeshyJobId,
  parseMeshyStatus,
} from '../src/providers/character-gen/meshy-v3.js';
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

test('MeshyV3Provider throws on construction without API key', () => {
  assert.throws(
    () => new MeshyV3Provider({ apiKey: '', fetch: async () => ({ ok: true, status: 200, async text() { return ''; } }) }),
    CharacterGenConfigError,
  );
  assert.throws(
    () => new MeshyV3Provider({ apiKey: '   ', fetch: async () => ({ ok: true, status: 200, async text() { return ''; } }) }),
    CharacterGenConfigError,
  );
});

test('MeshyV3Provider.submitJob sends a well-shaped payload', async () => {
  const { fetch, calls } = recordingFetch(() => ({ body: { result: 'job-123' } }));
  const provider = new MeshyV3Provider({
    apiKey: 'test-key',
    fetch,
    baseUrl: 'https://api.meshy.test',
  });
  const result = await provider.submitJob({
    prompt: 'orc warrior',
    style: 'low-poly',
    rigged: true,
    targetPolyCount: 5000,
    seed: 99,
    referenceImageUrl: 'https://example.com/ref.png',
  });
  assert.equal(result.jobId, 'job-123');
  assert.equal(calls.length, 1);
  const call = calls[0];
  assert.equal(call?.url, 'https://api.meshy.test/openapi/v1/text-to-3d');
  assert.equal(call?.method, 'POST');
  assert.equal(call?.headers?.authorization, 'Bearer test-key');
  assert.equal(call?.headers?.['content-type'], 'application/json');
  const body = JSON.parse(call?.body ?? '{}') as Record<string, unknown>;
  assert.equal(body.prompt, 'orc warrior');
  assert.equal(body.art_style, 'voxel');
  assert.equal(body.target_polycount, 5000);
  assert.equal(body.seed, 99);
  assert.equal(body.should_rig, true);
  assert.equal(body.reference_image_url, 'https://example.com/ref.png');
});

test('MeshyV3Provider.submitJob handles "id" field (not just "result")', async () => {
  const { fetch } = recordingFetch(() => ({ body: { id: 'job-456' } }));
  const provider = new MeshyV3Provider({ apiKey: 'k', fetch });
  const r = await provider.submitJob({
    prompt: 'p',
    style: 'realistic',
    rigged: false,
    targetPolyCount: 1000,
  });
  assert.equal(r.jobId, 'job-456');
});

test('MeshyV3Provider.submitJob throws on missing id', async () => {
  const { fetch } = recordingFetch(() => ({ body: { other: 'thing' } }));
  const provider = new MeshyV3Provider({ apiKey: 'k', fetch });
  await assert.rejects(
    () => provider.submitJob({
      prompt: 'p',
      style: 'realistic',
      rigged: false,
      targetPolyCount: 1000,
    }),
    CharacterGenUpstreamError,
  );
});

test('MeshyV3Provider.submitJob redacts upstream errors and surfaces status', async () => {
  const { fetch } = recordingFetch(() => ({
    ok: false,
    status: 401,
    body: { error: 'Bearer abcdef-secret-12345 invalid' },
  }));
  const provider = new MeshyV3Provider({ apiKey: 'k', fetch });
  await assert.rejects(
    () => provider.submitJob({
      prompt: 'p',
      style: 'realistic',
      rigged: false,
      targetPolyCount: 1000,
    }),
    (error: unknown) => {
      assert.ok(error instanceof CharacterGenUpstreamError);
      assert.match((error as Error).message, /HTTP 401/u);
      assert.doesNotMatch((error as Error).message, /abcdef-secret-12345/u);
      return true;
    },
  );
});

test('parseMeshyStatus maps each upstream status code', () => {
  const queued = parseMeshyStatus({ status: 'PENDING', created_at: 1700000000 });
  assert.equal(queued.state, 'queued');
  const processing = parseMeshyStatus({ status: 'IN_PROGRESS', progress: 47 });
  assert.equal(processing.state, 'processing');
  if (processing.state === 'processing') assert.equal(processing.percent, 47);
  const done = parseMeshyStatus({
    status: 'SUCCEEDED',
    progress: 100,
    model_urls: { glb: 'https://cdn.meshy/x.glb' },
    thumbnail_url: 'https://cdn.meshy/x.png',
    finished_at: 1700000060,
    license: 'CC-BY-4.0',
  });
  assert.equal(done.state, 'done');
  if (done.state === 'done') {
    assert.equal(done.outputs.gltfUrl, 'https://cdn.meshy/x.glb');
    assert.equal(done.outputs.thumbnailUrl, 'https://cdn.meshy/x.png');
    assert.equal(done.outputs.license, 'CC-BY-4.0');
  }
  const failed = parseMeshyStatus({
    status: 'FAILED',
    task_error: { message: 'gen failed because reasons' },
    finished_at: 1700000120,
  });
  assert.equal(failed.state, 'failed');
  if (failed.state === 'failed') assert.match(failed.error, /reasons/u);
  // Unknown status -> processing fallback.
  const unknown = parseMeshyStatus({ status: 'UNKNOWN' });
  assert.equal(unknown.state, 'processing');
});

test('parseMeshyStatus throws when SUCCEEDED but model_urls.glb missing', () => {
  assert.throws(
    () => parseMeshyStatus({ status: 'SUCCEEDED', model_urls: {} }),
    CharacterGenUpstreamError,
  );
});

test('extractMeshyJobId handles all known shapes', () => {
  assert.equal(extractMeshyJobId({ result: 'a' }), 'a');
  assert.equal(extractMeshyJobId({ id: 'b' }), 'b');
  assert.equal(extractMeshyJobId({ task_id: 'c' }), 'c');
  assert.equal(extractMeshyJobId({ taskId: 'd' }), 'd');
  assert.equal(extractMeshyJobId({}), undefined);
  assert.equal(extractMeshyJobId(null), undefined);
});

test('MeshyV3Provider.pollJob fetches with the correct URL and headers', async () => {
  const { fetch, calls } = recordingFetch(() => ({
    body: { status: 'IN_PROGRESS', progress: 25 },
  }));
  const provider = new MeshyV3Provider({
    apiKey: 'tkn',
    fetch,
    baseUrl: 'https://api.meshy.test/',
  });
  const status = await provider.pollJob('job-789');
  assert.equal(status.state, 'processing');
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, 'https://api.meshy.test/openapi/v1/text-to-3d/job-789');
  assert.equal(calls[0]?.method, 'GET');
  assert.equal(calls[0]?.headers?.authorization, 'Bearer tkn');
});
