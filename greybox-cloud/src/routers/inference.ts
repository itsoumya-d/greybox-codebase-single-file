// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import type { AuthContext, InferenceChunk, InferenceRequest, InferenceResult, ProviderClient } from '../types.js';
import { estimateMessageTokens } from '../metering/tokenCounter.js';
import { TokenBucketLimiter } from '../metering/tokenBucket.js';
import { UsageEmitter } from '../metering/usageEmitter.js';
import { LangfuseBridge } from '../observability/langfuse.js';
import { MetricsRegistry } from '../observability/metrics.js';
import { normalizeRequestId } from '../observability/requestId.js';
import { isTransientProviderError } from '../providers/errors.js';
import { ProviderSelector, type ProviderPolicyConfig } from '../providers/selector.js';
import { inspectPrompt } from '../safety/prompt-injection-firewall.js';
import { classifyPii, redactPii, redactPiiText } from '../safety/piiRedactor.js';
import { scoreSlop } from '../safety/slopDetector.js';
import { TenantStore } from './tenants.js';

export interface InferenceServiceOptions {
  providers: ProviderClient[];
  providerPolicy?: ProviderPolicyConfig;
  tenants: TenantStore;
  limiter?: TokenBucketLimiter;
  usageEmitter: UsageEmitter;
  langfuse: LangfuseBridge;
  metrics: MetricsRegistry;
}

const maxProviderAttempts = 2;

export class InferenceService {
  private readonly selector: ProviderSelector;
  private readonly limiter: TokenBucketLimiter;

  constructor(private readonly options: InferenceServiceOptions) {
    this.selector = new ProviderSelector(options.providers, options.providerPolicy);
    this.limiter = options.limiter ?? new TokenBucketLimiter();
  }

  async run(request: InferenceRequest, context: AuthContext): Promise<InferenceResult> {
    if (!request.projectId) throw new Error('projectId is required');
    if (!Array.isArray(request.messages) || request.messages.length === 0) throw new Error('messages are required');

    const firewall = inspectPrompt(request.messages);
    if (!firewall.allowed) {
      this.options.metrics.increment('inference.firewall_block');
      throw new Error(`Prompt blocked: ${firewall.reasons.join(',')}`);
    }

    await this.options.tenants.refreshFromPersister();
    const tenant = this.options.tenants.getOrCreate(
      context.tenantId,
      context.tier,
      context.dataResidencyRegion ? { region: context.dataResidencyRegion } : {},
    );
    const pii = classifyPii(request);
    const sanitizedRequest = redactInferenceRequest(request);
    const providers = this.selector.select(sanitizedRequest, tenant);
    if (providers.length === 0) throw new Error('Managed inference is not available for this tenant');

    const estimated = estimateMessageTokens(sanitizedRequest.messages);
    const limit = this.limiter.reserve(`${context.tenantId}:${context.userId}`, tenant.tier, estimated);
    if (!limit.allowed) {
      this.options.metrics.increment('inference.rate_limited');
      throw new Error(`Rate limited until ${new Date(limit.resetAt).toISOString()}`);
    }

    let lastError: unknown;
    for (const provider of providers) {
      if (!provider.candidate.available) {
        lastError = new Error(`${provider.candidate.provider} unavailable`);
        continue;
      }
      for (let attempt = 1; attempt <= maxProviderAttempts; attempt++) {
        const startedAt = Date.now();
        let result: InferenceResult;
        try {
          result = await provider.complete(sanitizedRequest, context);
          validateProviderResult(result, provider.candidate);
        } catch (error) {
          lastError = error;
          if (attempt < maxProviderAttempts && isTransientProviderError(error)) {
            this.options.metrics.increment(`inference.retry.${provider.candidate.provider}`);
            continue;
          }
          this.options.metrics.increment(`inference.failover.${provider.candidate.provider}`);
          break;
        }

        const elapsedMs = Date.now() - startedAt;
        const slop = scoreSlop(result.text);
        const requestId = normalizeRequestId(context.requestId);
        result.redactedLog = redactPii({
          ...(requestId ? { requestId } : {}),
          provider: result.provider,
          model: result.model,
          projectId: sanitizedRequest.projectId,
          metadata: sanitizedRequest.metadata ?? {},
          messages: sanitizedRequest.messages,
          pii,
          slop,
        });
        try {
          await this.options.usageEmitter.emit(context, sanitizedRequest, result, provider.candidate, new Date(), tenant);
        } catch (error) {
          this.options.metrics.increment('inference.usage_emit_failed');
          throw meteringFailureError(error);
        }
        try {
          await this.options.langfuse.trace(context, sanitizedRequest, result);
        } catch (error) {
          this.options.metrics.increment('inference.trace_failed');
        }
        this.options.metrics.increment(`inference.success.${result.provider}`);
        // Latency + cost observations power the p95 / p99 dashboards
        // ops uses to spot vendor regressions. Bucket boundaries align
        // with the typical SLA breakpoints for chat completions.
        this.options.metrics.observe(`inference.latency_ms.${result.provider}`, elapsedMs);
        this.options.metrics.observe(`inference.latency_ms.all`, elapsedMs);
        // Cost is computed from token counts times provider per-1K rates; expressed
        // in cents to match Stripe's smallest accounting unit so dashboards
        // can pivot directly against billing data without unit conversion.
        const costCents =
          (result.usage.inputTokens * provider.candidate.inputCostPer1K) / 1000 * 100
          + (result.usage.outputTokens * provider.candidate.outputCostPer1K) / 1000 * 100;
        if (Number.isFinite(costCents) && costCents > 0) {
          this.options.metrics.observe(
            `inference.cost_cents.${result.provider}`,
            costCents,
            { bucketsCents: true },
          );
          this.options.metrics.observe(
            `inference.cost_cents.all`,
            costCents,
            { bucketsCents: true },
          );
        }
        return result;
      }
    }
    throw sanitizedInferenceError(lastError);
  }
}

export function redactInferenceRequest(request: InferenceRequest): InferenceRequest {
  return redactPii({
    ...request,
    metadata: request.metadata ? { ...request.metadata } : undefined,
    messages: request.messages.map((message) => ({ ...message })),
  });
}

function validateProviderResult(result: InferenceResult, candidate: ProviderClient['candidate']): void {
  if (result.provider !== candidate.provider) {
    throw new Error(`Provider ${candidate.provider} returned mismatched provider identity`);
  }
  if (typeof result.model !== 'string' || result.model.trim() === '') {
    throw new Error(`Provider ${candidate.provider} returned missing model identity`);
  }
  if (typeof result.text !== 'string') {
    throw new Error(`Provider ${candidate.provider} returned non-text completion`);
  }
  if (!isValidTokenCount(result.usage?.inputTokens) || !isValidTokenCount(result.usage?.outputTokens)) {
    throw new Error(`Provider ${candidate.provider} returned invalid token usage`);
  }
}

function isValidTokenCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function sanitizedInferenceError(error: unknown): Error {
  if (!(error instanceof Error)) return new Error('All providers failed');
  const message = redactPiiText(error.message);
  return message === error.message ? error : new Error(message);
}

function meteringFailureError(error: unknown): Error {
  const sanitized = sanitizedInferenceError(error);
  return new Error(`Usage metering failed after provider completion: ${sanitized.message}`);
}

export function toSseChunks(result: InferenceResult): InferenceChunk[] {
  return [
    { type: 'message_start', provider: result.provider, model: result.model },
    { type: 'content_delta', text: result.text, provider: result.provider, model: result.model },
    { type: 'message_stop', provider: result.provider, model: result.model, usage: result.usage },
  ];
}

export function encodeSse(chunks: InferenceChunk[]): string {
  return chunks.map((chunk) => `event: ${chunk.type}\ndata: ${JSON.stringify(chunk)}\n\n`).join('');
}
