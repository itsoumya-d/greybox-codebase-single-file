// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { mkdir, readFile, appendFile } from 'node:fs/promises';
import path from 'node:path';
import type { BillingInvoice, StripeMeterEvent } from '../routers/billing.js';
import type { UsageEvent } from '../types.js';
import type {
  MonthlyUsageReservationRequest,
  MonthlyUsageSnapshot,
  MonthlyUsageSnapshotRequest,
} from './monthlyUsage.js';

export type BillingLedgerRecord =
  | {
      type: 'usage';
      id: string;
      createdAt: string;
      payload: UsageEvent;
    }
  | {
      type: 'invoice';
      id: string;
      createdAt: string;
      payload: BillingInvoice;
    }
  | {
      type: 'stripe-meter-event';
      id: string;
      createdAt: string;
      payload: StripeMeterEvent;
      dryRun: boolean;
      stripeRequestId?: string;
      error?: string;
      evidence?: StripeMeterEvent['evidence'];
    };

export interface BillingLedger {
  appendRecord(record: BillingLedgerRecord): Promise<void>;
  appendUsage(event: UsageEvent): Promise<void>;
  appendInvoice(invoice: BillingInvoice, createdAt?: Date): Promise<void>;
  appendStripeMeterEvent(
    event: StripeMeterEvent,
    options: { dryRun: boolean; stripeRequestId?: string; error?: string; createdAt?: Date },
  ): Promise<void>;
  readRecords(): Promise<BillingLedgerRecord[]>;
  readUsageEvents(): Promise<UsageEvent[]>;
  readMonthlyUsageSnapshot?(request: MonthlyUsageSnapshotRequest): Promise<MonthlyUsageSnapshot>;
  reserveMonthlyUsage?(request: MonthlyUsageReservationRequest): Promise<UsageEvent>;
}

export class FileBillingLedger implements BillingLedger {
  constructor(private readonly rootDir: string, private readonly filename = 'billing-ledger.jsonl') {}

  private get filePath(): string {
    return path.join(this.rootDir, this.filename);
  }

  async appendRecord(record: BillingLedgerRecord): Promise<void> {
    await mkdir(this.rootDir, { recursive: true });
    await appendFile(this.filePath, `${JSON.stringify(record)}\n`, 'utf8');
  }

  async appendUsage(event: UsageEvent): Promise<void> {
    await this.appendRecord({
      type: 'usage',
      id: event.id,
      createdAt: event.createdAt,
      payload: event,
    });
  }

  async appendInvoice(invoice: BillingInvoice, createdAt = new Date()): Promise<void> {
    await this.appendRecord({
      type: 'invoice',
      id: `${invoice.tenantId}:${invoice.period.start}:${invoice.tier}`,
      createdAt: createdAt.toISOString(),
      payload: invoice,
    });
  }

  async appendStripeMeterEvent(
    event: StripeMeterEvent,
    options: { dryRun: boolean; stripeRequestId?: string; error?: string; createdAt?: Date },
  ): Promise<void> {
    await this.appendRecord({
      type: 'stripe-meter-event',
      id: event.identifier,
      createdAt: (options.createdAt ?? new Date()).toISOString(),
      payload: event,
      dryRun: options.dryRun,
      ...(options.stripeRequestId ? { stripeRequestId: options.stripeRequestId } : {}),
      ...(options.error ? { error: options.error } : {}),
      ...(event.evidence ? { evidence: event.evidence } : {}),
    });
  }

  async readRecords(): Promise<BillingLedgerRecord[]> {
    let text = '';
    try {
      text = await readFile(this.filePath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
    return text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as BillingLedgerRecord);
  }

  async readUsageEvents(): Promise<UsageEvent[]> {
    const records = await this.readRecords();
    return records
      .filter((record): record is Extract<BillingLedgerRecord, { type: 'usage' }> => record.type === 'usage')
      .map((record) => record.payload);
  }

  async readMonthlyUsageSnapshot(request: MonthlyUsageSnapshotRequest): Promise<MonthlyUsageSnapshot> {
    const events = await this.readUsageEvents();
    return usageSnapshotFromEvents(request, events);
  }
}

export class FileUsageSink {
  private readonly ledger: BillingLedger;
  readonly reserveMonthlyUsage?: (request: MonthlyUsageReservationRequest) => Promise<UsageEvent>;

  constructor(ledger: BillingLedger) {
    this.ledger = ledger;
    if (ledger.reserveMonthlyUsage) {
      this.reserveMonthlyUsage = (request) => {
        const reserve = ledger.reserveMonthlyUsage;
        if (!reserve) return Promise.reject(new Error('monthly usage reservation unavailable'));
        return reserve.call(ledger, request);
      };
    }
  }

  async emit(event: UsageEvent): Promise<void> {
    await this.ledger.appendUsage(event);
  }

  async readMonthlyUsageSnapshot(request: MonthlyUsageSnapshotRequest): Promise<MonthlyUsageSnapshot> {
    if (this.ledger.readMonthlyUsageSnapshot) return await this.ledger.readMonthlyUsageSnapshot(request);
    return usageSnapshotFromEvents(request, await this.ledger.readUsageEvents());
  }
}

export function usageSnapshotFromEvents(
  request: MonthlyUsageSnapshotRequest,
  events: UsageEvent[],
): MonthlyUsageSnapshot {
  const periodStartMs = Date.parse(request.periodStart);
  const periodEndMs = Date.parse(request.periodEnd);
  let inputTokens = 0;
  let outputTokens = 0;

  for (const event of events) {
    if (event.tenantId !== request.tenantId) continue;
    if (!usageEventMatchesPeriod(event, request, periodStartMs, periodEndMs)) continue;
    inputTokens += event.inputTokens;
    outputTokens += event.outputTokens;
  }

  return {
    tenantId: request.tenantId,
    periodStart: request.periodStart,
    periodEnd: request.periodEnd,
    inputTokens,
    outputTokens,
  };
}

function usageEventMatchesPeriod(
  event: UsageEvent,
  request: MonthlyUsageSnapshotRequest,
  periodStartMs: number,
  periodEndMs: number,
): boolean {
  if (event.billingPeriodStart) return event.billingPeriodStart === request.periodStart;
  const createdAtMs = Date.parse(event.createdAt);
  return Number.isFinite(createdAtMs) && createdAtMs >= periodStartMs && createdAtMs < periodEndMs;
}
