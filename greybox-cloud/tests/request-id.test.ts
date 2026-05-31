// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo, Server } from 'node:net';

import { createGreyboxCloudServer, type GreyboxCloudServerOptions } from '../src/server.js';
import type { AuthContext, InferenceRequest, InferenceResult } from '../src/types.js';

test('X-Request-ID is generated when the caller omits it', async () => {
  const { baseUrl, close } = await startTestServer();
  try {
    const r = await fetch(`${baseUrl}/healthz`);
    assert.equal(r.status, 200);
    const id = r.headers.get('x-request-id');
    assert.ok(id, 'response carries X-Request-ID header');
    assert.match(id!, /^req_[0-9a-f]{16}$/u);
  } finally {
    await close();
  }
});

test('X-Request-ID is echoed back when supplied by the caller', async () => {
  const { baseUrl, close } = await startTestServer();
  try {
    const r = await fetch(`${baseUrl}/healthz`, {
      headers: { 'x-request-id': 'req_caller-trace-1234' },
    });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('x-request-id'), 'req_caller-trace-1234');
  } finally {
    await close();
  }
});

test('X-Request-ID is regenerated when the caller-supplied value contains disallowed chars', async () => {
  const { baseUrl, close } = await startTestServer();
  try {
    // Test injection-style payload (spaces, semicolons) is dropped. We can't
    // send a literal newline via fetch because the WHATWG Headers class
    // rejects them client-side; this confirms our server-side regex catches
    // payloads that *would* sneak past raw HTTP clients (e.g. malicious
    // proxies forwarding non-validated headers).
    const r = await fetch(`${baseUrl}/healthz`, {
      headers: { 'x-request-id': 'req_bad value; DROP TABLE users; --' },
    });
    assert.equal(r.status, 200);
    const id = r.headers.get('x-request-id');
    assert.ok(id);
    // Must NOT echo back the malicious payload.
    assert.doesNotMatch(id!, /DROP TABLE/u);
    assert.match(id!, /^req_[0-9a-f]{16}$/u);
  } finally {
    await close();
  }
});

test('X-Request-ID values are unique across requests', async () => {
  const { baseUrl, close } = await startTestServer();
  try {
    const responses = await Promise.all([
      fetch(`${baseUrl}/healthz`),
      fetch(`${baseUrl}/healthz`),
      fetch(`${baseUrl}/healthz`),
    ]);
    const ids = responses.map((r) => r.headers.get('x-request-id'));
    assert.equal(new Set(ids).size, 3, 'each request has a unique X-Request-ID');
  } finally {
    await close();
  }
});

test('X-Request-ID is attached to inference service context', async () => {
  let capturedContext: AuthContext | undefined;
  let capturedRequest: InferenceRequest | undefined;
  const { baseUrl, close } = await startTestServer({
    service: {
      async run(request: InferenceRequest, context: AuthContext): Promise<InferenceResult> {
        capturedRequest = request;
        capturedContext = context;
        return {
          provider: 'openai',
          model: 'gpt-4.1-mini',
          text: 'ok',
          usage: { inputTokens: 1, outputTokens: 1 },
          redactedLog: {},
        };
      },
    },
  });
  try {
    const r = await fetch(`${baseUrl}/v1/inference`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer gbx_studio_request_id_123',
        'content-type': 'application/json',
        'x-request-id': 'req_inference-hop-123',
      },
      body: JSON.stringify({
        projectId: 'project-a',
        messages: [{ role: 'user', content: 'Tune the jump arc.' }],
      }),
    });

    assert.equal(r.status, 200);
    assert.equal(r.headers.get('x-request-id'), 'req_inference-hop-123');
    assert.equal(capturedContext?.requestId, 'req_inference-hop-123');
    assert.equal(capturedRequest?.projectId, 'project-a');
  } finally {
    await close();
  }
});

async function startTestServer(
  options: GreyboxCloudServerOptions = {},
): Promise<{ baseUrl: string; close: () => Promise<void>; server: Server }> {
  const server = createGreyboxCloudServer(options);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
    server,
  };
}
