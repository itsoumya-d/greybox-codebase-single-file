// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import type { AuthContext, InferenceRequest, InferenceResult } from '../types.js';
import { redactPii } from '../safety/piiRedactor.js';
import { normalizeRequestId } from './requestId.js';

export interface LangfuseTrace {
  tenantId: string;
  userId: string;
  projectId: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  metadata: Record<string, unknown>;
}

export class LangfuseBridge {
  readonly traces: LangfuseTrace[] = [];

  async trace(context: AuthContext, request: InferenceRequest, result: InferenceResult): Promise<LangfuseTrace> {
    const requestId = normalizeRequestId(context.requestId);
    const trace: LangfuseTrace = {
      tenantId: context.tenantId,
      userId: context.userId,
      projectId: request.projectId,
      provider: result.provider,
      model: result.model,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      metadata: redactPii({
        task: request.task ?? 'design',
        request: request.metadata ?? {},
        ...(requestId ? { requestId } : {}),
        slop: result.redactedLog.slop,
      }),
    };
    this.traces.push(trace);
    return trace;
  }
}
