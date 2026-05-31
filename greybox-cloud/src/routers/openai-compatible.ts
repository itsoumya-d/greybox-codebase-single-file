// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { randomUUID } from 'node:crypto';
import type { AuthContext, ChatMessage, InferenceRequest, InferenceResult, InferenceTask, ProviderName } from '../types.js';

export interface OpenAiCompatibleMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | Array<{ type?: string; text?: string }>;
}

export interface OpenAiCompatibleChatRequest {
  model?: string;
  messages?: OpenAiCompatibleMessage[];
  stream?: boolean;
  metadata?: Record<string, unknown>;
}

export interface OpenAiCompatibleModel {
  id: string;
  object: 'model';
  created: number;
  owned_by: string;
}

const visibleModels: OpenAiCompatibleModel[] = [
  { id: 'greybox-design', object: 'model', created: 1_778_844_700, owned_by: 'greybox-studio' },
  { id: 'greybox-cheap-chat', object: 'model', created: 1_778_844_700, owned_by: 'greybox-studio' },
  { id: 'greybox-playtest', object: 'model', created: 1_778_844_700, owned_by: 'greybox-studio' },
  { id: 'greybox-native', object: 'model', created: 1_778_844_700, owned_by: 'greybox-studio' },
];

function contentToText(content: OpenAiCompatibleMessage['content']): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => (typeof part?.text === 'string' ? part.text : ''))
    .filter(Boolean)
    .join('\n');
}

function roleToChatMessage(message: OpenAiCompatibleMessage): ChatMessage {
  if (message.role === 'tool') {
    return { role: 'user', content: `Tool result:\n${contentToText(message.content)}` };
  }
  return { role: message.role, content: contentToText(message.content) };
}

function taskForModel(model: string): InferenceTask {
  if (model === 'greybox-cheap-chat') return 'cheap-chat';
  if (model === 'greybox-playtest') return 'playtest';
  return 'design';
}

function providerModelFor(model: string): string | undefined {
  return model.startsWith('greybox-') ? undefined : model;
}

function preferredProviderFor(model: string): ProviderName | undefined {
  return model === 'greybox-native' ? 'greybox-native' : undefined;
}

function metadataString(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object') return {};
  return Object.fromEntries(
    Object.entries(input)
      .filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value))
      .map(([key, value]) => [key, String(value)]),
  );
}

export function openAiCompatibleModelsResponse(): { object: 'list'; data: OpenAiCompatibleModel[] } {
  return { object: 'list', data: visibleModels };
}

export function openAiCompatibleToInferenceRequest(
  body: OpenAiCompatibleChatRequest,
  context: AuthContext,
): InferenceRequest {
  const model = typeof body.model === 'string' && body.model.trim() ? body.model.trim() : 'greybox-design';
  const messages = Array.isArray(body.messages) ? body.messages.map(roleToChatMessage) : [];
  if (messages.length === 0) throw new Error('messages are required');
  const metadata = metadataString(body.metadata);
  const projectId =
    typeof body.metadata?.projectId === 'string' && body.metadata.projectId.trim()
      ? body.metadata.projectId.trim()
      : `managed-${context.tenantId}`;
  return {
    projectId,
    task: taskForModel(model),
    preferredProvider: preferredProviderFor(model),
    model: providerModelFor(model),
    messages,
    stream: body.stream,
    metadata: {
      ...metadata,
      openAiCompatModel: model,
      openAiCompat: 'true',
    },
  };
}

export function openAiCompatibleCompletionResponse(
  result: InferenceResult,
  id = `chatcmpl_${randomUUID()}`,
  created = Math.floor(Date.now() / 1_000),
): Record<string, unknown> {
  return {
    id,
    object: 'chat.completion',
    created,
    model: result.model,
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content: result.text },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: result.usage.inputTokens,
      completion_tokens: result.usage.outputTokens,
      total_tokens: result.usage.inputTokens + result.usage.outputTokens,
    },
  };
}

export function encodeOpenAiCompatibleSse(
  result: InferenceResult,
  id = `chatcmpl_${randomUUID()}`,
  created = Math.floor(Date.now() / 1_000),
): string {
  const start = {
    id,
    object: 'chat.completion.chunk',
    created,
    model: result.model,
    choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }],
  };
  const delta = {
    id,
    object: 'chat.completion.chunk',
    created,
    model: result.model,
    choices: [{ index: 0, delta: { content: result.text }, finish_reason: null }],
  };
  const stop = {
    id,
    object: 'chat.completion.chunk',
    created,
    model: result.model,
    choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
  };
  return [start, delta, stop]
    .map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`)
    .join('') + 'data: [DONE]\n\n';
}
