// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { randomUUID } from 'node:crypto';
import {
  applyMonthlyUsageClassification,
  classifyMonthlyUsageFromSnapshot,
  monthlyUsageSnapshotRequest,
  MonthlyUsageTracker,
  type MonthlyUsageClassification,
  type MonthlyUsageReservationRequest,
  type MonthlyUsageRequest,
  type MonthlyUsageSnapshot,
  type MonthlyUsageSnapshotRequest,
} from './monthlyUsage.js';
import { normalizeRequestId } from '../observability/requestId.js';
import type { AuthContext, InferenceRequest, InferenceResult, ProviderCandidate, TenantConfig, UsageEvent } from '../types.js';

export interface UsageSink {
  emit(event: UsageEvent): Promise<void>;
  readMonthlyUsageSnapshot?(request: MonthlyUsageSnapshotRequest): Promise<MonthlyUsageSnapshot>;
  reserveMonthlyUsage?(request: MonthlyUsageReservationRequest): Promise<UsageEvent>;
}

export class MemoryUsageSink implements UsageSink {
  readonly events: UsageEvent[] = [];

  async emit(event: UsageEvent): Promise<void> {
    this.events.push(event);
  }
}

export class StripeMeteredBillingSink implements UsageSink {
  constructor(private readonly stripeApiKey: string | undefined) {}

  async emit(event: UsageEvent): Promise<void> {
    if (!this.stripeApiKey) return;
    void event;
    throw new Error('Stripe metered billing is submitted by the billing invoice job; attach a BillingLedger usage sink instead');
  }
}

export class UsageEmitter {
  constructor(
    private readonly sinks: UsageSink[],
    private readonly monthlyUsage: MonthlyUsageTracker = new MonthlyUsageTracker(),
  ) {}

  async emit(
    context: AuthContext,
    request: InferenceRequest,
    result: InferenceResult,
    candidate: ProviderCandidate,
    createdAt = new Date(),
    tenant?: TenantConfig,
  ): Promise<UsageEvent> {
    const included = {
      inputTokens: tenant?.monthlyInputTokensIncluded ?? 0,
      outputTokens: tenant?.monthlyOutputTokensIncluded ?? 0,
    };
    const quotaRequest = {
      tenantId: context.tenantId,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      included,
      at: createdAt,
    };
    const requestId = normalizeRequestId(context.requestId);
    const baseEvent: UsageEvent = {
      id: randomUUID(),
      ...(requestId ? { requestId } : {}),
      tenantId: context.tenantId,
      userId: context.userId,
      projectId: request.projectId,
      provider: result.provider,
      model: result.model,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      inputCostUsd: (result.usage.inputTokens / 1_000) * candidate.inputCostPer1K,
      outputCostUsd: (result.usage.outputTokens / 1_000) * candidate.outputCostPer1K,
      createdAt: createdAt.toISOString(),
    };

    const reservationSink = this.sinks.find(hasMonthlyUsageReservation);
    if (reservationSink) {
      const event = await reservationSink.reserveMonthlyUsage({
        event: baseEvent,
        included,
        at: createdAt,
      });
      await Promise.all(this.sinks.filter((sink) => sink !== reservationSink).map((sink) => sink.emit(event)));
      return event;
    }

    const quota = await this.classifyMonthlyUsage(quotaRequest);
    const event = applyMonthlyUsageClassification(baseEvent, quota);
    await Promise.all(this.sinks.map((sink) => sink.emit(event)));
    return event;
  }

  private async classifyMonthlyUsage(request: MonthlyUsageRequest): Promise<MonthlyUsageClassification> {
    const durableUsage = this.sinks.find(hasMonthlyUsageSnapshot);
    if (!durableUsage) return this.monthlyUsage.classifyAndRecord(request);

    const snapshotRequest = monthlyUsageSnapshotRequest(request.tenantId, request.at);
    const snapshot = await durableUsage.readMonthlyUsageSnapshot(snapshotRequest);
    return classifyMonthlyUsageFromSnapshot(request, snapshot);
  }
}

function hasMonthlyUsageSnapshot(sink: UsageSink): sink is UsageSink & {
  readMonthlyUsageSnapshot(request: MonthlyUsageSnapshotRequest): Promise<MonthlyUsageSnapshot>;
} {
  return typeof sink.readMonthlyUsageSnapshot === 'function';
}

function hasMonthlyUsageReservation(sink: UsageSink): sink is UsageSink & {
  reserveMonthlyUsage(request: MonthlyUsageReservationRequest): Promise<UsageEvent>;
} {
  return typeof sink.reserveMonthlyUsage === 'function';
}
