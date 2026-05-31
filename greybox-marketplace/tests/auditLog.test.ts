// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  FileMarketplaceAuditLog,
  InMemoryMarketplaceAuditLog,
} from '../src/store/auditLog.js';

describe('marketplace audit log', () => {
  describe('InMemoryMarketplaceAuditLog', () => {
    it('chains records by hash', () => {
      const log = new InMemoryMarketplaceAuditLog(() => new Date('2026-05-20T00:00:00Z'));
      const first = log.append({
        action: 'listing.created',
        actorId: 'creator_1',
        actorType: 'creator',
        entityType: 'listing',
        entityId: 'l_1',
      });
      const second = log.append({
        action: 'listing.published',
        actorId: 'creator_1',
        actorType: 'creator',
        entityType: 'listing',
        entityId: 'l_1',
        metadata: { priceCents: 7900 },
      });
      assert.equal(second.previousHash, first.hash);
      assert.notEqual(first.hash, second.hash);
    });

    it('verifies chain integrity', () => {
      const log = new InMemoryMarketplaceAuditLog();
      log.append({ action: 'creator.registered', actorId: 'admin', actorType: 'admin', entityType: 'creator', entityId: 'c_1' });
      log.append({ action: 'listing.created', actorId: 'c_1', actorType: 'creator', entityType: 'listing', entityId: 'l_1' });
      log.append({ action: 'order.recorded', actorId: 'buyer_1', actorType: 'buyer', entityType: 'order', entityId: 'o_1', metadata: { grossCents: 9900 } });
      assert.deepEqual(log.verifyChain(), { valid: true });
    });

    it('redacts sensitive metadata before hashing records', () => {
      const log = new InMemoryMarketplaceAuditLog(() => new Date('2026-05-20T12:00:00Z'));
      const record = log.append({
        action: 'order.refunded',
        actorId: 'admin',
        actorType: 'admin',
        entityType: 'order',
        entityId: 'order_1',
        metadata: {
          stripeRefundId: 're_test_refund_123',
          nested: {
            buyerEmail: 'buyer@example.com',
            paymentIntent: 'pi_test_sensitive_456',
            card: '4242 4242 4242 4242',
            bearer: 'Bearer auditsecret0123456789abcdef',
          },
          taxProfileId: 'taxprof_sensitive_123',
        },
      });

      const serialized = JSON.stringify(record);
      assert.match(serialized, /\[redacted-stripe-id\]/u);
      assert.match(serialized, /\[redacted-email\]/u);
      assert.match(serialized, /\[redacted-card\]/u);
      assert.match(serialized, /\[redacted-secret\]/u);
      assert.match(serialized, /\[redacted-reference\]/u);
      assert.doesNotMatch(serialized, /re_test_refund_123|pi_test_sensitive_456|buyer@example\.com|4242 4242|auditsecret0123456789abcdef|taxprof_sensitive_123/u);
      assert.deepEqual(log.verifyChain(), { valid: true });
    });

    it('detects tampered records', () => {
      const log = new InMemoryMarketplaceAuditLog();
      log.append({ action: 'creator.registered', actorId: 'admin', actorType: 'admin', entityType: 'creator', entityId: 'c_1' });
      log.append({ action: 'listing.created', actorId: 'c_1', actorType: 'creator', entityType: 'listing', entityId: 'l_1' });
      const records = (log as unknown as { records: Array<{ metadata?: Record<string, unknown> }> }).records;
      records[1]!.metadata = { tamperedWith: true };
      const result = log.verifyChain();
      assert.equal(result.valid, false);
      assert.match((result as { brokenAt: string }).brokenAt, /^mlog_/);
    });

    it('filters by action, actor, entity, and since', () => {
      const log = new InMemoryMarketplaceAuditLog(() => new Date('2026-05-20T12:00:00Z'));
      log.append({ action: 'creator.registered', actorId: 'admin', actorType: 'admin', entityType: 'creator', entityId: 'c_1' });
      log.append({ action: 'listing.created', actorId: 'c_1', actorType: 'creator', entityType: 'listing', entityId: 'l_1' });
      log.append({ action: 'listing.published', actorId: 'c_1', actorType: 'creator', entityType: 'listing', entityId: 'l_1' });
      assert.equal(log.list({ action: 'listing.created' }).length, 1);
      assert.equal(log.list({ actorId: 'c_1' }).length, 2);
      assert.equal(log.list({ entityId: 'l_1' }).length, 2);
      assert.equal(log.list({ since: '2026-05-19T00:00:00Z' }).length, 3);
      assert.equal(log.list({ since: '2026-05-21T00:00:00Z' }).length, 0);
    });
  });

  describe('FileMarketplaceAuditLog', () => {
    it('persists records to JSONL and survives restart with chain intact', () => {
      const dir = mkdtempSync(join(tmpdir(), 'gbx-audit-'));
      const file = join(dir, 'audit.jsonl');
      try {
        const log = new FileMarketplaceAuditLog(file);
        log.append({ action: 'creator.registered', actorId: 'admin', actorType: 'admin', entityType: 'creator', entityId: 'c_1' });
        log.append({ action: 'listing.created', actorId: 'c_1', actorType: 'creator', entityType: 'listing', entityId: 'l_1' });
        // Simulate restart by constructing a new log against the same file.
        const reloaded = new FileMarketplaceAuditLog(file);
        assert.equal(reloaded.list().length, 2);
        assert.deepEqual(reloaded.verifyChain(), { valid: true });
        // New appends continue the chain.
        const next = reloaded.append({ action: 'order.recorded', actorId: 'buyer_1', actorType: 'buyer', entityType: 'order', entityId: 'o_1' });
        assert.equal(reloaded.list().length, 3);
        assert.equal(next.previousHash, reloaded.list()[1]!.hash);
        assert.deepEqual(reloaded.verifyChain(), { valid: true });
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('reloads before append so overlapping instances keep one chain', () => {
      const dir = mkdtempSync(join(tmpdir(), 'gbx-audit-overlap-'));
      const file = join(dir, 'audit.jsonl');
      try {
        const first = new FileMarketplaceAuditLog(file);
        const second = new FileMarketplaceAuditLog(file);
        const firstRecord = first.append({
          action: 'creator.registered',
          actorId: 'admin',
          actorType: 'admin',
          entityType: 'creator',
          entityId: 'c_1',
        });
        const secondRecord = second.append({
          action: 'listing.created',
          actorId: 'c_1',
          actorType: 'creator',
          entityType: 'listing',
          entityId: 'l_1',
        });

        assert.equal(secondRecord.previousHash, firstRecord.hash);
        assert.equal(first.list().length, 2);
        assert.equal(second.list().length, 2);
        assert.deepEqual(first.verifyChain(), { valid: true });
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('skips malformed lines and flags integrity break on tampered files', () => {
      const dir = mkdtempSync(join(tmpdir(), 'gbx-audit-tamper-'));
      const file = join(dir, 'audit.jsonl');
      try {
        const log = new FileMarketplaceAuditLog(file);
        log.append({ action: 'creator.registered', actorId: 'admin', actorType: 'admin', entityType: 'creator', entityId: 'c_1' });
        log.append({ action: 'listing.created', actorId: 'c_1', actorType: 'creator', entityType: 'listing', entityId: 'l_1' });
        // Tamper: append a forged record with a wrong previousHash but valid JSON.
        const tampered = {
          id: 'mlog_z', timestamp: '2026-05-20T00:00:00Z', action: 'order.recorded',
          actorId: 'forged', actorType: 'admin', entityType: 'order', entityId: 'o_x',
          previousHash: 'deadbeef'.repeat(8), hash: 'deadbeef'.repeat(8),
        };
        writeFileSync(file, `${JSON.stringify(log.list()[0])}\n${JSON.stringify(log.list()[1])}\nnot-json\n${JSON.stringify(tampered)}\n`);
        const reloaded = new FileMarketplaceAuditLog(file);
        const result = reloaded.verifyChain();
        assert.equal(result.valid, false);
        assert.equal((result as { brokenAt: string }).brokenAt, 'mlog_z');
        assert.throws(
          () => reloaded.append({
            action: 'order.refunded',
            actorId: 'admin',
            actorType: 'admin',
            entityType: 'order',
            entityId: 'o_x',
          }),
          /chain is invalid/u,
        );
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });
});
