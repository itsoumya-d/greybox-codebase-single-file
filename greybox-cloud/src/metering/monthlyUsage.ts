// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import type { UsageEvent } from '../types.js';

export interface MonthlyUsageIncludes {
  inputTokens: number;
  outputTokens: number;
}

export interface MonthlyUsageRequest {
  tenantId: string;
  inputTokens: number;
  outputTokens: number;
  included: MonthlyUsageIncludes;
  at?: Date;
}

export interface MonthlyUsageSnapshotRequest {
  tenantId: string;
  periodStart: string;
  periodEnd: string;
}

export interface MonthlyUsageSnapshot {
  tenantId: string;
  periodStart: string;
  periodEnd: string;
  inputTokens: number;
  outputTokens: number;
}

export interface MonthlyUsageClassification {
  periodStart: string;
  periodEnd: string;
  includedInputTokensApplied: number;
  includedOutputTokensApplied: number;
  billableInputTokens: number;
  billableOutputTokens: number;
  inputTokensUsedBefore: number;
  outputTokensUsedBefore: number;
}

export interface MonthlyUsageReservationRequest {
  event: UsageEvent;
  included: MonthlyUsageIncludes;
  at?: Date;
}

interface UsageState {
  inputTokens: number;
  outputTokens: number;
}

export function monthPeriod(at: Date): { start: Date; end: Date } {
  const start = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 1, 0, 0, 0, 0));
  return { start, end };
}

function applyIncluded(usedBefore: number, tokens: number, included: number): {
  includedApplied: number;
  billable: number;
} {
  const remainingIncluded = Math.max(0, included - usedBefore);
  const includedApplied = Math.min(tokens, remainingIncluded);
  return {
    includedApplied,
    billable: Math.max(0, tokens - includedApplied),
  };
}

export function monthlyUsageSnapshotRequest(tenantId: string, at = new Date()): MonthlyUsageSnapshotRequest {
  const period = monthPeriod(at);
  return {
    tenantId,
    periodStart: period.start.toISOString(),
    periodEnd: period.end.toISOString(),
  };
}

export function classifyMonthlyUsageFromSnapshot(
  request: MonthlyUsageRequest,
  snapshot: MonthlyUsageSnapshot,
): MonthlyUsageClassification {
  const input = applyIncluded(snapshot.inputTokens, request.inputTokens, request.included.inputTokens);
  const output = applyIncluded(snapshot.outputTokens, request.outputTokens, request.included.outputTokens);

  return {
    periodStart: snapshot.periodStart,
    periodEnd: snapshot.periodEnd,
    includedInputTokensApplied: input.includedApplied,
    includedOutputTokensApplied: output.includedApplied,
    billableInputTokens: input.billable,
    billableOutputTokens: output.billable,
    inputTokensUsedBefore: snapshot.inputTokens,
    outputTokensUsedBefore: snapshot.outputTokens,
  };
}

export function monthlyUsageRequestFromReservation(
  request: MonthlyUsageReservationRequest,
): MonthlyUsageRequest {
  return {
    tenantId: request.event.tenantId,
    inputTokens: request.event.inputTokens,
    outputTokens: request.event.outputTokens,
    included: request.included,
    at: request.at ?? new Date(request.event.createdAt),
  };
}

export function applyMonthlyUsageClassification(
  event: UsageEvent,
  classification: MonthlyUsageClassification,
): UsageEvent {
  return {
    ...event,
    billingPeriodStart: classification.periodStart,
    billingPeriodEnd: classification.periodEnd,
    includedInputTokensApplied: classification.includedInputTokensApplied,
    includedOutputTokensApplied: classification.includedOutputTokensApplied,
    billableInputTokens: classification.billableInputTokens,
    billableOutputTokens: classification.billableOutputTokens,
  };
}

export function classifyMonthlyUsageReservation(
  request: MonthlyUsageReservationRequest,
  snapshot: MonthlyUsageSnapshot,
): UsageEvent {
  const classification = classifyMonthlyUsageFromSnapshot(
    monthlyUsageRequestFromReservation(request),
    snapshot,
  );
  return applyMonthlyUsageClassification(request.event, classification);
}

export class MonthlyUsageTracker {
  private readonly usage = new Map<string, UsageState>();

  classifyAndRecord(request: MonthlyUsageRequest): MonthlyUsageClassification {
    const at = request.at ?? new Date();
    const period = monthPeriod(at);
    const key = `${request.tenantId}:${period.start.toISOString()}`;
    const state = this.usage.get(key) ?? { inputTokens: 0, outputTokens: 0 };
    this.usage.set(key, {
      inputTokens: state.inputTokens + request.inputTokens,
      outputTokens: state.outputTokens + request.outputTokens,
    });

    return classifyMonthlyUsageFromSnapshot(request, {
      tenantId: request.tenantId,
      periodStart: period.start.toISOString(),
      periodEnd: period.end.toISOString(),
      inputTokens: state.inputTokens,
      outputTokens: state.outputTokens,
    });
  }
}
