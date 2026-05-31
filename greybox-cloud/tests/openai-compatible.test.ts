// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import type http from 'node:http';
import test from 'node:test';
import { createGreyboxCloudServer } from '../src/server.js';
import {
  encodeOpenAiCompatibleSse,
  openAiCompatibleToInferenceRequest,
} from '../src/routers/openai-compatible.js';
import type { AuthContext, InferenceRequest, InferenceResult } from '../src/types.js';

const mockResult: InferenceResult = {
  provider: 'openai',
  model: 'gpt-4.1-mini',
  text: 'Greybox managed inference is wired through the existing BYOK proxy.',
  usage: { inputTokens: 17, outputTokens: 11 },
  redactedLog: {},
};

async function withServer<T>(
  run: (request: InferenceRequest, context: AuthContext) => Promise<InferenceResult>,
  body: (baseUrl: string, server: http.Server) => Promise<T>,
): Promise<T> {
  const server = createGreyboxCloudServer({ service: { run } });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    return await body(baseUrl, server);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test('lists OpenAI-compatible Greybox managed models', async () => {
  await withServer(
    async () => mockResult,
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/v1/models`, {
        headers: { authorization: 'Bearer gb_live_test' },
      });
      assert.equal(response.status, 200);
      const json = await response.json() as { data: Array<{ id: string }> };
      assert.deepEqual(
        json.data.map((model) => model.id),
        ['greybox-design', 'greybox-cheap-chat', 'greybox-playtest', 'greybox-native'],
      );
    },
  );
});

test('maps OpenAI-compatible chat completions into managed inference requests', async () => {
  const observed: { request?: InferenceRequest; context?: AuthContext } = {};
  await withServer(
    async (request, context) => {
      observed.request = request;
      observed.context = context;
      return mockResult;
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          authorization: 'Bearer gb_live_test',
          'content-type': 'application/json',
          'x-greybox-tenant': 'tenant-openai-compat',
          'x-greybox-user': 'designer-1',
          'x-greybox-tier': 'studio',
        },
        body: JSON.stringify({
          model: 'greybox-design',
          metadata: { projectId: 'unity-slice', ignored: { nested: true } },
          messages: [
            { role: 'system', content: 'AI-assisted only.' },
            { role: 'user', content: 'Tune the checkpoint pacing.' },
          ],
        }),
      });
      assert.equal(response.status, 200);
      const json = await response.json() as {
        choices: Array<{ message: { content: string } }>;
        usage: { prompt_tokens: number; completion_tokens: number };
      };
      assert.equal(json.choices[0]?.message.content, mockResult.text);
      assert.equal(json.usage.prompt_tokens, 17);
      assert.equal(json.usage.completion_tokens, 11);
    },
  );

  assert.ok(observed.context);
  assert.ok(observed.request);
  assert.equal(observed.context.tenantId, 'tenant-openai-compat');
  assert.equal(observed.context.tier, 'studio');
  assert.equal(observed.request.projectId, 'unity-slice');
  assert.equal(observed.request.task, 'design');
  assert.equal(observed.request.model, undefined);
  assert.equal(observed.request.metadata?.openAiCompatModel, 'greybox-design');
  assert.equal(observed.request.messages[1]?.content, 'Tune the checkpoint pacing.');
});

test('streams OpenAI-compatible chunks for the existing daemon BYOK parser', async () => {
  await withServer(
    async () => mockResult,
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          authorization: 'Bearer gb_live_test',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'greybox-cheap-chat',
          stream: true,
          messages: [{ role: 'user', content: 'Say this is wired.' }],
        }),
      });
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type') ?? '', /text\/event-stream/u);
      const text = await response.text();
      assert.match(text, /data: \{"id":"chatcmpl_/u);
      assert.match(text, /"delta":\{"content":"Greybox managed inference/u);
      assert.match(text, /data: \[DONE\]/u);
    },
  );
});

test('converts tool messages and hosted model aliases without leaking aliases upstream', () => {
  const request = openAiCompatibleToInferenceRequest(
    {
      model: 'greybox-playtest',
      messages: [
        { role: 'tool', content: [{ type: 'text', text: 'Deaths: 4' }] },
        { role: 'user', content: 'Summarize the run.' },
      ],
    },
    {
      tenantId: 'tenant-a',
      userId: 'user-a',
      tier: 'studio',
      tokenHash: 'hash',
      roles: ['designer'],
    },
  );

  assert.equal(request.task, 'playtest');
  assert.equal(request.model, undefined);
  assert.equal(request.messages[0]?.role, 'user');
  assert.match(request.messages[0]?.content ?? '', /Tool result:\nDeaths: 4/u);
});

test('maps the Greybox Native alias to the native provider preference', () => {
  const request = openAiCompatibleToInferenceRequest(
    {
      model: 'greybox-native',
      messages: [{ role: 'user', content: 'Use the native model for cheap artifact critique.' }],
    },
    {
      tenantId: 'tenant-a',
      userId: 'user-a',
      tier: 'studio',
      tokenHash: 'hash',
      roles: ['designer'],
    },
  );

  assert.equal(request.task, 'design');
  assert.equal(request.model, undefined);
  assert.equal(request.preferredProvider, 'greybox-native');
  assert.equal(request.metadata?.openAiCompatModel, 'greybox-native');
});

test('OpenAI-compatible SSE includes a role chunk before content', () => {
  const sse = encodeOpenAiCompatibleSse(mockResult, 'chatcmpl_test', 123);
  assert.match(sse, /"delta":\{"role":"assistant"\}/u);
  assert.match(sse, /"finish_reason":"stop"/u);
});
