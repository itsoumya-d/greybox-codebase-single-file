// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

/**
 * Append-only, hash-chained mutation audit log for the marketplace store.
 *
 * Required for DD, compliance, and post-incident forensics. Every mutation
 * appends a single immutable record whose hash incorporates the previous
 * record's hash so any tampering produces a detectable break in the chain.
 *
 * Implementations:
 *   - InMemoryMarketplaceAuditLog: ephemeral, suitable for tests
 *   - FileMarketplaceAuditLog: JSONL append-only file for local persistence
 *
 * Wire via MarketplaceStoreOptions.auditLog so marketplace mutations append
 * sanitized compliance records without leaking buyer PII, Stripe account ids,
 * tax profile ids, or license material.
 */

import { createHash } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { appendFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

export type MarketplaceAuditAction =
  | 'creator.registered'
  | 'creator.updated'
  | 'creator.stripe_connect_account_created'
  | 'creator.stripe_connect_onboarding_link.created'
  | 'creator.stripe_connect_status.updated'
  | 'creator.tax_profile.recorded'
  | 'listing.created'
  | 'listing.updated'
  | 'listing.published'
  | 'listing.archived'
  | 'review.submitted'
  | 'order.recorded'
  | 'order.refunded'
  | 'entitlement.granted'
  | 'entitlement.claimed'
  | 'entitlement.revoked'
  | 'payout.queued'
  | 'payout.sent'
  | 'payout.blocked'
  | 'risk_event.recorded'
  | 'risk_event.resolved'
  | 'stripe_event.ignored'
  | 'snapshot.exported'
  | 'snapshot.imported';

export interface MarketplaceAuditRecord {
  readonly id: string;
  readonly timestamp: string;
  readonly action: MarketplaceAuditAction;
  readonly actorId: string;
  readonly actorType: 'system' | 'creator' | 'buyer' | 'admin' | 'webhook';
  readonly entityType: string;
  readonly entityId: string;
  readonly metadata?: Record<string, unknown>;
  readonly previousHash: string;
  readonly hash: string;
}

export interface MarketplaceAuditLog {
  append(input: {
    action: MarketplaceAuditAction;
    actorId: string;
    actorType: MarketplaceAuditRecord['actorType'];
    entityType: string;
    entityId: string;
    metadata?: Record<string, unknown>;
  }): MarketplaceAuditRecord;
  list(filters?: {
    action?: MarketplaceAuditAction;
    actorId?: string;
    entityId?: string;
    since?: string;
  }): readonly MarketplaceAuditRecord[];
  verifyChain(): { valid: true } | { valid: false; brokenAt: string };
}

const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';
const REQUEST_ID_ALLOWED_CHARS = /^[A-Za-z0-9_.:-]{1,128}$/u;
const BEARER_TOKEN_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}(?=$|[^A-Za-z0-9._~+/=-])/giu;
const STRIPE_SECRET_PATTERN = /\b(?:Bearer\s+)?(?:sk|rk)_(?:live|test)_[A-Za-z0-9_]+\b|\bwhsec_[A-Za-z0-9_]+\b/giu;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu;
const IP_ADDRESS_PATTERN = /\b(?:\d{1,3}\.){3}\d{1,3}\b/gu;
const CARD_LIKE_PATTERN = /\b(?:\d[ -]*?){13,19}\b/gu;
const PHONE_PATTERN = /\+?\b(?:\d[\s().-]?){7,}\d\b/gu;
const STRIPE_OBJECT_ID_PATTERN = /\b(?:acct|ch|cs|cus|dp|evt|pi|re|taxcalc|tr|txr)_[A-Za-z0-9_-]+\b/gu;
const AUDIT_SECRET_KEY_PATTERN = /(?:secret|token|password|credential|taxprofileid|licensehash|lookupkey)/iu;

const auditContext = new AsyncLocalStorage<{ requestId?: string }>();

export function enterMarketplaceAuditContext(context: { requestId?: string }): void {
  const requestId = safeAuditRequestId(context.requestId);
  auditContext.enterWith(requestId ? { requestId } : {});
}

function auditMetadataWithContext(metadata: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  const requestId = auditContext.getStore()?.requestId;
  if (!requestId) return metadata;
  return { ...(metadata ?? {}), requestId };
}

function safeAuditRequestId(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || !REQUEST_ID_ALLOWED_CHARS.test(trimmed)) return undefined;
  return trimmed;
}

/**
 * Maps a PayoutInstruction.status onto the matching audit action. Centralised
 * so any future status additions are caught at compile time across all call
 * sites in the store.
 */
export function payoutAuditAction(
  payout: { status: 'queued' | 'sent' | 'blocked' },
): MarketplaceAuditAction {
  switch (payout.status) {
    case 'sent': return 'payout.sent';
    case 'blocked': return 'payout.blocked';
    case 'queued':
    default: return 'payout.queued';
  }
}

function computeRecordHash(input: {
  id: string;
  timestamp: string;
  action: string;
  actorId: string;
  actorType: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
  previousHash: string;
}): string {
  const payload = JSON.stringify({
    id: input.id,
    timestamp: input.timestamp,
    action: input.action,
    actorId: input.actorId,
    actorType: input.actorType,
    entityType: input.entityType,
    entityId: input.entityId,
    metadata: input.metadata ?? null,
    previousHash: input.previousHash,
  });
  return createHash('sha256').update(payload).digest('hex');
}

export class InMemoryMarketplaceAuditLog implements MarketplaceAuditLog {
  private readonly records: MarketplaceAuditRecord[] = [];
  private seq = 0;

  constructor(private readonly clock: () => Date = () => new Date()) {}

  append(input: {
    action: MarketplaceAuditAction;
    actorId: string;
    actorType: MarketplaceAuditRecord['actorType'];
    entityType: string;
    entityId: string;
    metadata?: Record<string, unknown>;
  }): MarketplaceAuditRecord {
    const previousHash = this.records.length > 0
      ? this.records[this.records.length - 1]!.hash
      : GENESIS_HASH;
    this.seq += 1;
    const id = `mlog_${this.seq.toString(36)}`;
    const timestamp = this.clock().toISOString();
    const partial = {
      id,
      timestamp,
      action: input.action,
      actorId: input.actorId,
      actorType: input.actorType,
      entityType: input.entityType,
      entityId: input.entityId,
      ...optionalAuditMetadata(input.metadata),
      previousHash,
    };
    const hash = computeRecordHash(partial);
    const record: MarketplaceAuditRecord = { ...partial, hash };
    this.records.push(record);
    return record;
  }

  list(filters: {
    action?: MarketplaceAuditAction;
    actorId?: string;
    entityId?: string;
    since?: string;
  } = {}): readonly MarketplaceAuditRecord[] {
    return this.records.filter((record) => {
      if (filters.action && record.action !== filters.action) return false;
      if (filters.actorId && record.actorId !== filters.actorId) return false;
      if (filters.entityId && record.entityId !== filters.entityId) return false;
      if (filters.since && record.timestamp < filters.since) return false;
      return true;
    });
  }

  verifyChain(): { valid: true } | { valid: false; brokenAt: string } {
    let previousHash = GENESIS_HASH;
    for (const record of this.records) {
      if (record.previousHash !== previousHash) {
        return { valid: false, brokenAt: record.id };
      }
      const recomputed = computeRecordHash({
        id: record.id,
        timestamp: record.timestamp,
        action: record.action,
        actorId: record.actorId,
        actorType: record.actorType,
        entityType: record.entityType,
        entityId: record.entityId,
        ...(record.metadata ? { metadata: record.metadata } : {}),
        previousHash: record.previousHash,
      });
      if (recomputed !== record.hash) {
        return { valid: false, brokenAt: record.id };
      }
      previousHash = record.hash;
    }
    return { valid: true };
  }
}

function optionalAuditMetadata(metadata: Record<string, unknown> | undefined): { metadata?: Record<string, unknown> } {
  const enriched = auditMetadataWithContext(metadata);
  const sanitized = enriched ? sanitizeAuditMetadataObject(enriched) : undefined;
  return sanitized && Object.keys(sanitized).length > 0 ? { metadata: sanitized } : {};
}

function sanitizeAuditMetadataObject(metadata: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => [key, sanitizeAuditMetadataValue(value, key)]),
  );
}

function sanitizeAuditMetadataValue(value: unknown, key = '', depth = 0): unknown {
  if (depth > 8) return '[redacted-depth-limit]';
  if (typeof value === 'string') {
    if (AUDIT_SECRET_KEY_PATTERN.test(key)) return '[redacted-reference]';
    return value
      .replace(BEARER_TOKEN_PATTERN, '[redacted-secret]')
      .replace(STRIPE_SECRET_PATTERN, '[redacted-secret]')
      .replace(EMAIL_PATTERN, '[redacted-email]')
      .replace(IP_ADDRESS_PATTERN, '[redacted-ip]')
      .replace(CARD_LIKE_PATTERN, '[redacted-card]')
      .replace(PHONE_PATTERN, '[redacted-phone]')
      .replace(STRIPE_OBJECT_ID_PATTERN, '[redacted-stripe-id]');
  }
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeAuditMetadataValue(item, key, depth + 1));
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([childKey, childValue]) => [
      childKey,
      sanitizeAuditMetadataValue(childValue, childKey, depth + 1),
    ]),
  );
}

export class FileMarketplaceAuditLog implements MarketplaceAuditLog {
  private memory: InMemoryMarketplaceAuditLog;

  constructor(private readonly filePath: string, private readonly clock: () => Date = () => new Date()) {
    this.memory = new InMemoryMarketplaceAuditLog(this.clock);
    this.reloadFromFile();
  }

  private reloadFromFile(): void {
    const nextMemory = new InMemoryMarketplaceAuditLog(this.clock);
    if (existsSync(this.filePath)) {
      const contents = readFileSync(this.filePath, 'utf8');
      for (const line of contents.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const record = JSON.parse(trimmed) as MarketplaceAuditRecord;
          // Reconstruct in-memory chain so verifyChain remains valid across restarts.
          (nextMemory as unknown as { records: MarketplaceAuditRecord[] }).records.push(record);
          if (record.id.startsWith('mlog_')) {
            const seqValue = parseInt(record.id.slice(5), 36);
            if (Number.isFinite(seqValue)) {
              (nextMemory as unknown as { seq: number }).seq = Math.max(
                (nextMemory as unknown as { seq: number }).seq,
                seqValue,
              );
            }
          }
        } catch {
          // Skip malformed lines; verifyChain() will flag any integrity break.
        }
      }
    } else {
      mkdirSync(dirname(this.filePath), { recursive: true });
    }
    this.memory = nextMemory;
  }

  append(input: {
    action: MarketplaceAuditAction;
    actorId: string;
    actorType: MarketplaceAuditRecord['actorType'];
    entityType: string;
    entityId: string;
    metadata?: Record<string, unknown>;
  }): MarketplaceAuditRecord {
    this.reloadFromFile();
    const verification = this.memory.verifyChain();
    if (!verification.valid) {
      throw new Error(`marketplace audit log chain is invalid at ${verification.brokenAt}; refusing append`);
    }
    const record = this.memory.append(input);
    appendFileSync(this.filePath, `${JSON.stringify(record)}\n`);
    return record;
  }

  list(filters?: {
    action?: MarketplaceAuditAction;
    actorId?: string;
    entityId?: string;
    since?: string;
  }): readonly MarketplaceAuditRecord[] {
    this.reloadFromFile();
    return this.memory.list(filters);
  }

  verifyChain(): { valid: true } | { valid: false; brokenAt: string } {
    this.reloadFromFile();
    return this.memory.verifyChain();
  }
}
