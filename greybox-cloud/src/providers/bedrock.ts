// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { createHash, createHmac } from 'node:crypto';
import type { AuthContext, ChatMessage, InferenceRequest, InferenceResult, ProviderCandidate, ProviderClient } from '../types.js';
import { estimateUsage } from '../metering/tokenCounter.js';
import { ProviderHttpError } from './errors.js';

interface BedrockCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

interface BedrockProviderOptions {
  region?: string;
  model?: string;
  credentials?: BedrockCredentials | null;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

interface BedrockAnthropicResponse {
  content?: Array<{ type?: string; text?: string }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}

const defaultBedrockModel = 'anthropic.claude-3-5-sonnet-20241022-v2:0';
const service = 'bedrock';

export class BedrockProvider implements ProviderClient {
  readonly candidate: ProviderCandidate;
  private readonly region: string;
  private readonly model: string;
  private readonly credentials?: BedrockCredentials;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;

  constructor(options: BedrockProviderOptions = {}) {
    this.region = options.region ?? process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? '';
    this.model = options.model ?? process.env.GREYBOX_BEDROCK_MODEL ?? process.env.AWS_BEDROCK_MODEL ?? defaultBedrockModel;
    this.credentials = options.credentials === undefined ? credentialsFromEnv() : options.credentials ?? undefined;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? (() => new Date());
    this.candidate = {
      provider: 'bedrock',
      model: this.model,
      inputCostPer1K: 0.012,
      outputCostPer1K: 0.04,
      supports: ['design', 'playtest', 'code', 'vision'],
      slaMs: 2_500,
      available: Boolean(this.region && this.credentials?.accessKeyId && this.credentials.secretAccessKey),
    };
  }

  async complete(request: InferenceRequest, _context: AuthContext): Promise<InferenceResult> {
    if (!this.region) throw new Error('AWS region is not configured for Bedrock');
    if (!this.credentials?.accessKeyId || !this.credentials.secretAccessKey) {
      throw new Error('AWS credentials are not configured for Bedrock');
    }

    const model = request.model ?? this.model;
    const body = JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 1200,
      ...anthropicMessages(request.messages),
    });
    const url = new URL(`https://bedrock-runtime.${this.region}.amazonaws.com${bedrockInvokePath(model)}`);
    const signed = signBedrockRequest({
      body,
      credentials: this.credentials,
      now: this.now(),
      region: this.region,
      url,
    });
    const response = await this.fetchImpl(url, {
      method: 'POST',
      headers: signed,
      body,
    });
    if (!response.ok) throw new ProviderHttpError('bedrock', response.status, `Bedrock ${response.status}`);

    const payload = await response.json() as BedrockAnthropicResponse;
    const text = payload.content
      ?.filter((part) => !part.type || part.type === 'text')
      .map((part) => part.text ?? '')
      .join('') ?? '';
    const fallbackUsage = estimateUsage(request.messages, text);
    return {
      provider: 'bedrock',
      model,
      text,
      usage: {
        inputTokens: payload.usage?.input_tokens ?? fallbackUsage.inputTokens,
        outputTokens: payload.usage?.output_tokens ?? fallbackUsage.outputTokens,
      },
      redactedLog: {},
    };
  }
}

function credentialsFromEnv(): BedrockCredentials | undefined {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim();
  if (!accessKeyId || !secretAccessKey) return undefined;
  const sessionToken = process.env.AWS_SESSION_TOKEN?.trim();
  return {
    accessKeyId,
    secretAccessKey,
    ...(sessionToken ? { sessionToken } : {}),
  };
}

function anthropicMessages(messages: ChatMessage[]): { system?: string; messages: Array<{ role: 'user' | 'assistant'; content: string }> } {
  const system = messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content)
    .join('\n\n')
    .trim();
  const conversation = messages
    .filter((message) => message.role !== 'system')
    .map((message) => ({
      role: message.role === 'assistant' ? 'assistant' as const : 'user' as const,
      content: message.content,
    }));
  return {
    ...(system ? { system } : {}),
    messages: conversation.length > 0 ? conversation : [{ role: 'user', content: system || 'Continue the game-design task.' }],
  };
}

function bedrockInvokePath(model: string): string {
  return `/model/${encodeURIComponent(model)}/invoke`;
}

function signBedrockRequest(input: {
  body: string;
  credentials: BedrockCredentials;
  now: Date;
  region: string;
  url: URL;
}): Record<string, string> {
  const amzDate = input.now.toISOString().replace(/[:-]|\.\d{3}/gu, '');
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(input.body);
  const headers: Record<string, string> = {
    accept: 'application/json',
    'content-type': 'application/json',
    host: input.url.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  if (input.credentials.sessionToken) headers['x-amz-security-token'] = input.credentials.sessionToken;

  const canonical = canonicalHeaders(headers);
  const canonicalRequest = [
    'POST',
    input.url.pathname,
    '',
    canonical.headers,
    canonical.signedHeaders,
    payloadHash,
  ].join('\n');
  const credentialScope = `${dateStamp}/${input.region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');
  const signingKey = awsSigningKey(input.credentials.secretAccessKey, dateStamp, input.region, service);
  const signature = hmacHex(signingKey, stringToSign);
  return {
    ...headers,
    authorization: [
      `AWS4-HMAC-SHA256 Credential=${input.credentials.accessKeyId}/${credentialScope}`,
      `SignedHeaders=${canonical.signedHeaders}`,
      `Signature=${signature}`,
    ].join(', '),
  };
}

function canonicalHeaders(headers: Record<string, string>): { headers: string; signedHeaders: string } {
  const entries = Object.entries(headers)
    .map(([key, value]) => [key.toLowerCase(), value.trim().replace(/\s+/gu, ' ')] as const)
    .sort(([a], [b]) => a.localeCompare(b));
  return {
    headers: entries.map(([key, value]) => `${key}:${value}\n`).join(''),
    signedHeaders: entries.map(([key]) => key).join(';'),
  };
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function hmac(key: string | Buffer, value: string): Buffer {
  return createHmac('sha256', key).update(value, 'utf8').digest();
}

function hmacHex(key: string | Buffer, value: string): string {
  return createHmac('sha256', key).update(value, 'utf8').digest('hex');
}

function awsSigningKey(secret: string, dateStamp: string, region: string, serviceName: string): Buffer {
  const dateKey = hmac(`AWS4${secret}`, dateStamp);
  const dateRegionKey = hmac(dateKey, region);
  const dateRegionServiceKey = hmac(dateRegionKey, serviceName);
  return hmac(dateRegionServiceKey, 'aws4_request');
}
