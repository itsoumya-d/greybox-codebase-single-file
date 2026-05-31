// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import type { ChatMessage, TokenUsage } from '../types.js';

const averageCharsPerToken = 4;

export function estimateTextTokens(text: string): number {
  const normalized = text.trim();
  if (!normalized) return 0;
  const wordish = normalized.split(/\s+/u).length;
  const charish = Math.ceil(normalized.length / averageCharsPerToken);
  return Math.max(1, Math.ceil((wordish + charish) / 2));
}

export function estimateMessageTokens(messages: ChatMessage[]): number {
  return messages.reduce((sum, message) => sum + estimateTextTokens(message.content) + 4, 0);
}

export function estimateUsage(messages: ChatMessage[], outputText: string): TokenUsage {
  return {
    inputTokens: estimateMessageTokens(messages),
    outputTokens: estimateTextTokens(outputText),
  };
}
