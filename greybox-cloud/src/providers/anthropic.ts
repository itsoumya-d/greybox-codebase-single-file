// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import type { AuthContext, InferenceRequest, InferenceResult, ProviderCandidate, ProviderClient } from '../types.js';
import { estimateUsage } from '../metering/tokenCounter.js';
import { ProviderHttpError } from './errors.js';

export class AnthropicProvider implements ProviderClient {
  readonly candidate: ProviderCandidate = {
    provider: 'anthropic',
    model: 'claude-sonnet-4.5',
    inputCostPer1K: 0.012,
    outputCostPer1K: 0.04,
    supports: ['design', 'playtest', 'code', 'vision'],
    slaMs: 2_000,
    available: Boolean(process.env.ANTHROPIC_API_KEY),
  };

  async complete(request: InferenceRequest, _context: AuthContext): Promise<InferenceResult> {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('Anthropic API key is not configured');
    const prompt = request.messages.map((message) => `${message.role}: ${message.content}`).join('\n');
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: request.model ?? this.candidate.model,
        max_tokens: 1200,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!response.ok) throw new ProviderHttpError('anthropic', response.status, `Anthropic ${response.status}`);
    const body = await response.json() as { content?: Array<{ text?: string }>; usage?: { input_tokens?: number; output_tokens?: number } };
    const text = body.content?.map((part) => part.text ?? '').join('') ?? '';
    return {
      provider: 'anthropic',
      model: request.model ?? this.candidate.model,
      text,
      usage: {
        inputTokens: body.usage?.input_tokens ?? estimateUsage(request.messages, text).inputTokens,
        outputTokens: body.usage?.output_tokens ?? estimateUsage(request.messages, text).outputTokens,
      },
      redactedLog: {},
    };
  }
}
