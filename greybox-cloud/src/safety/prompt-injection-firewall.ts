// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import type { ChatMessage } from '../types.js';

export interface FirewallDecision {
  allowed: boolean;
  reasons: string[];
}

const suspiciousPatterns: Array<[RegExp, string]> = [
  [/ignore (?:all )?(?:previous|prior|above) instructions/iu, 'instruction_override'],
  [/\b(?:forget|disregard|override|bypass).{0,40}\b(?:previous|prior|above|system|developer) instructions?\b/iu, 'instruction_override'],
  [/\b(?:new|updated|replacement).{0,30}\b(?:system|developer).{0,20}\b(?:prompt|message|instructions?)\b/iu, 'role_redefinition'],
  [/<\s*(?:system|developer)\s*>|\[(?:system|developer)\]/iu, 'role_redefinition'],
  [/\b(?:jailbreak|dan mode|do anything now|unfiltered mode)\b/iu, 'jailbreak_attempt'],
  [/\b(?:reveal|print|show|dump|exfiltrate|leak|display|send|transmit|upload|include|append|copy).{0,80}\b(system prompt|developer message|hidden instructions?)\b/iu, 'secret_exfiltration'],
  [/\b(?:reveal|print|show|dump|exfiltrate|leak|display|send|transmit|upload|include|append|copy).{0,60}\b(api key|token|secret|credential|process\.env)\b/iu, 'credential_exfiltration'],
  [/\b(?:read|cat|open).{0,40}\b(?:\.env|\.ssh|id_rsa|credentials?\.json)\b/iu, 'local_secret_access'],
  [/\bdisable.{0,30}\b(safety|guardrail|policy)\b/iu, 'safety_disable'],
];

export function inspectPrompt(messages: ChatMessage[]): FirewallDecision {
  const reasons = new Set<string>();
  for (const message of messages) {
    if (message.role !== 'user') continue;
    for (const [pattern, reason] of suspiciousPatterns) {
      if (pattern.test(message.content)) reasons.add(reason);
    }
  }
  return { allowed: reasons.size === 0, reasons: [...reasons] };
}
