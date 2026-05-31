// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import test from 'node:test';
import { BedrockProvider } from '../src/providers/bedrock.js';
import { ProviderHttpError } from '../src/providers/errors.js';
import type { AuthContext, InferenceRequest } from '../src/types.js';

const context: AuthContext = {
  tenantId: 'tenant-bedrock',
  userId: 'designer-bedrock',
  tier: 'enterprise',
  tokenHash: 'hash-bedrock',
  roles: ['designer'],
};

const request: InferenceRequest = {
  projectId: 'project-bedrock',
  task: 'design',
  messages: [
    { role: 'system', content: 'You are Greybox, AI-assisted and designer-first.' },
    { role: 'user', content: 'Tighten this boss loop for a Unity vertical slice.' },
  ],
};

test('Bedrock provider signs and invokes Anthropic messages through Bedrock Runtime', async () => {
  const calls: Array<{ url: string; headers: Record<string, string>; body: any }> = [];
  const fetchImpl = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const headers = init?.headers as Record<string, string>;
    calls.push({
      url: String(url),
      headers,
      body: JSON.parse(String(init?.body ?? '{}')),
    });
    return new Response(JSON.stringify({
      content: [{ type: 'text', text: 'Reduce boss health to two hits and widen the telegraph window.' }],
      usage: { input_tokens: 42, output_tokens: 18 },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const provider = new BedrockProvider({
    region: 'us-east-1',
    credentials: {
      accessKeyId: 'AKIATESTBEDROCK',
      secretAccessKey: 'bedrock-secret-do-not-leak',
      sessionToken: 'session-token',
    },
    fetchImpl,
    now: () => new Date('2026-05-18T00:00:00.000Z'),
  });

  const result = await provider.complete(request, context);

  assert.equal(provider.candidate.available, true);
  assert.equal(result.provider, 'bedrock');
  assert.equal(result.model, 'anthropic.claude-3-5-sonnet-20241022-v2:0');
  assert.equal(result.text, 'Reduce boss health to two hits and widen the telegraph window.');
  assert.deepEqual(result.usage, { inputTokens: 42, outputTokens: 18 });
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /^https:\/\/bedrock-runtime\.us-east-1\.amazonaws\.com\/model\/anthropic\.claude-3-5-sonnet-20241022-v2%3A0\/invoke$/u);
  assert.equal(calls[0].headers.accept, 'application/json');
  assert.equal(calls[0].headers['content-type'], 'application/json');
  assert.equal(calls[0].headers['x-amz-date'], '20260518T000000Z');
  assert.equal(calls[0].headers['x-amz-security-token'], 'session-token');
  assert.match(calls[0].headers.authorization, /^AWS4-HMAC-SHA256 Credential=AKIATESTBEDROCK\/20260518\/us-east-1\/bedrock\/aws4_request/u);
  assert.match(calls[0].headers.authorization, /SignedHeaders=accept;content-type;host;x-amz-content-sha256;x-amz-date;x-amz-security-token/u);
  assert.ok(!JSON.stringify(calls[0].headers).includes('bedrock-secret-do-not-leak'));
  assert.equal(calls[0].body.anthropic_version, 'bedrock-2023-05-31');
  assert.equal(calls[0].body.system, 'You are Greybox, AI-assisted and designer-first.');
  assert.deepEqual(calls[0].body.messages, [
    { role: 'user', content: 'Tighten this boss loop for a Unity vertical slice.' },
  ]);
});

test('Bedrock provider fails closed when credentials are incomplete', async () => {
  const provider = new BedrockProvider({
    region: 'us-east-1',
    credentials: null,
    fetchImpl: async () => new Response('{}'),
  });

  assert.equal(provider.candidate.available, false);
  await assert.rejects(
    () => provider.complete(request, context),
    /AWS credentials are not configured/u,
  );
});

test('Bedrock provider maps runtime HTTP failures to provider errors for failover', async () => {
  const provider = new BedrockProvider({
    region: 'us-west-2',
    credentials: {
      accessKeyId: 'AKIAFAILOVER',
      secretAccessKey: 'secret',
    },
    fetchImpl: async () => new Response('throttle', { status: 503 }),
    now: () => new Date('2026-05-18T01:00:00.000Z'),
  });

  await assert.rejects(
    () => provider.complete(request, context),
    (error: unknown) => {
      assert.ok(error instanceof ProviderHttpError);
      assert.equal(error.provider, 'bedrock');
      assert.equal(error.status, 503);
      assert.equal(error.transient, true);
      return true;
    },
  );
});
