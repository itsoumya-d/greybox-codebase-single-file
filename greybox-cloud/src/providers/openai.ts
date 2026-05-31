// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import type { AuthContext, InferenceRequest, InferenceResult, ProviderCandidate, ProviderClient } from '../types.js';
import { estimateUsage } from '../metering/tokenCounter.js';
import { ProviderHttpError } from './errors.js';

export class OpenAiProvider implements ProviderClient {
  readonly candidate: ProviderCandidate = {
    provider: 'openai',
    model: 'gpt-4.1-mini',
    inputCostPer1K: 0.003,
    outputCostPer1K: 0.012,
    supports: ['cheap-chat', 'design', 'code'],
    slaMs: 1_500,
    available: Boolean(process.env.OPENAI_API_KEY),
  };

  async complete(request: InferenceRequest, _context: AuthContext): Promise<InferenceResult> {
    if (!process.env.OPENAI_API_KEY) throw new Error('OpenAI API key is not configured');
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: request.model ?? this.candidate.model,
        messages: request.messages,
      }),
    });
    if (!response.ok) throw new ProviderHttpError('openai', response.status, `OpenAI ${response.status}`);
    const body = await response.json() as { choices?: Array<{ message?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number } };
    const text = body.choices?.[0]?.message?.content ?? '';
    return {
      provider: 'openai',
      model: request.model ?? this.candidate.model,
      text,
      usage: {
        inputTokens: body.usage?.prompt_tokens ?? estimateUsage(request.messages, text).inputTokens,
        outputTokens: body.usage?.completion_tokens ?? estimateUsage(request.messages, text).outputTokens,
      },
      redactedLog: {},
    };
  }
}
