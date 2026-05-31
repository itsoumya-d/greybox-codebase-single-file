// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  PostgresAuditLog,
  type PostgresAuditLogClient,
} from '../src/enterprise/auditLogPostgres.js';
import type { AuditLogEntry } from '../src/enterprise/auditLog.js';

// In-memory pg client. Records inserts in an array; ORDER BY sequence ASC
// returns them in insertion order. Implements only the subset of SQL the
// audit log actually emits.
function createInMemoryClient(): {
  client: PostgresAuditLogClient;
  rowsRef: { rows: Array<{ sequence: number; id: string; tenant_id: string; action: string; created_at: string; entry: string }> };
  queriesRef: { queries: string[] };
  releasesRef: { count: number };
} {
  const rowsRef = {
    rows: [] as Array<{ sequence: number; id: string; tenant_id: string; action: string; created_at: string; entry: string }>,
  };
  const queriesRef = { queries: [] as string[] };
  const releasesRef = { count: 0 };
  let nextSeq = 1;
  const client: PostgresAuditLogClient = {
    async query(text, values) {
      const trimmed = text.trim();
      queriesRef.queries.push(trimmed);
      if (/^(BEGIN|COMMIT|ROLLBACK)$/i.test(trimmed)) return { rows: [] };
      if (/^SELECT pg_advisory_xact_lock\(\$1::bigint\)$/i.test(trimmed)) return { rows: [{ pg_advisory_xact_lock: values?.[0] }] };
      if (/^CREATE TABLE/i.test(trimmed) || /^CREATE INDEX/i.test(trimmed)) return { rows: [] };
      if (/^SELECT entry FROM .* ORDER BY sequence DESC LIMIT 1$/i.test(trimmed)) {
        if (rowsRef.rows.length === 0) return { rows: [] };
        const last = rowsRef.rows[rowsRef.rows.length - 1]!;
        return { rows: [{ entry: last.entry }] };
      }
      if (/^INSERT INTO/i.test(trimmed)) {
        const [id, tenant_id, action, created_at, entry] = values as [string, string, string, string, string];
        rowsRef.rows.push({ sequence: nextSeq++, id, tenant_id, action, created_at, entry });
        return { rows: [] };
      }
      if (/^SELECT entry FROM .* WHERE .* ORDER BY sequence ASC$/i.test(trimmed)) {
        const ordered = rowsRef.rows.map((r) => ({
          row: r,
          parsed: JSON.parse(r.entry) as AuditLogEntry,
        }));
        const params = values ?? [];
        let i = 0;
        let filtered = [...ordered];
        if (trimmed.includes('tenant_id = $')) {
          const tenantId = params[i++] as string;
          filtered = filtered.filter((x) => x.parsed.tenantId === tenantId);
        }
        if (trimmed.includes('action = $')) {
          const action = params[i++] as string;
          filtered = filtered.filter((x) => x.parsed.action === action);
        }
        if (trimmed.includes('created_at >= $')) {
          const since = Date.parse(params[i++] as string);
          filtered = filtered.filter((x) => Date.parse(x.parsed.createdAt) >= since);
        }
        if (trimmed.includes('created_at < $')) {
          const until = Date.parse(params[i++] as string);
          filtered = filtered.filter((x) => Date.parse(x.parsed.createdAt) < until);
        }
        return { rows: filtered.map((x) => ({ entry: x.row.entry })) };
      }
      if (/^SELECT entry FROM .* ORDER BY sequence ASC$/i.test(trimmed)) {
        return { rows: rowsRef.rows.map((r) => ({ entry: r.entry })) };
      }
      throw new Error(`unexpected sql: ${trimmed}`);
    },
    async connect() {
      return {
        query: (text, values) => client.query(text, values),
        release: () => {
          releasesRef.count += 1;
        },
      };
    },
  };
  return { client, rowsRef, queriesRef, releasesRef };
}

function makeEntry(overrides: Partial<AuditLogEntry> = {}): AuditLogEntry {
  return {
    id: overrides.id ?? `evt_${Math.random().toString(36).slice(2, 10)}`,
    tenantId: 'tenant_a',
    actorId: 'system',
    actorType: 'system',
    action: 'license.validated',
    targetType: 'license',
    targetId: 'license_a',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

test('PostgresAuditLog seals and stores entries, then reads them back in order', async () => {
  const { client } = createInMemoryClient();
  const log = await PostgresAuditLog.create({ client });
  const a = makeEntry({ id: 'evt_a', action: 'license.validated' });
  const b = makeEntry({ id: 'evt_b', action: 'inference.completed' });
  await log.append(a);
  await log.append(b);
  const all = await log.readEntries();
  assert.equal(all.length, 2);
  assert.equal(all[0]!.id, 'evt_a');
  assert.equal(all[1]!.id, 'evt_b');
  assert.equal(all[0]!.sequence, 1);
  assert.equal(all[1]!.sequence, 2);
  assert.equal(all[1]!.previousHash, all[0]!.hash);
});

test('PostgresAuditLog chain verification reports valid when all entries link correctly', async () => {
  const { client } = createInMemoryClient();
  const log = await PostgresAuditLog.create({ client });
  for (let i = 0; i < 5; i += 1) {
    await log.append(makeEntry({ id: `evt_${i}` }));
  }
  const verification = await log.verify();
  assert.equal(verification.valid, true);
  assert.equal(verification.checked, 5);
});

test('PostgresAuditLog redacts sensitive fields before insert and hash sealing', async () => {
  const { client, rowsRef } = createInMemoryClient();
  const log = await PostgresAuditLog.create({ client });
  await log.append(makeEntry({
    id: 'evt_sensitive',
    actorId: 'admin@example.com',
    targetId: 're_test_sensitive_123',
    ip: '10.0.0.7',
    userAgent: 'SCIM Bearer postgressecret0123456789abcdef from /Users/admin/raw.log',
    metadata: {
      apiKey: 'sk_live_postgres_secret',
      customerEmail: 'buyer@example.com',
      paymentIntent: 'pi_test_pg_sensitive',
      card: '4000 0000 0000 0002',
      nested: {
        localPath: '/private/tmp/greybox/pg.log',
      },
    },
  }));

  const [stored] = await log.readEntries();
  assert.ok(stored);
  const serialized = JSON.stringify(stored);
  assert.match(serialized, /\[redacted-email\]/u);
  assert.match(serialized, /\[redacted-ip\]/u);
  assert.match(serialized, /\[redacted-secret\]/u);
  assert.match(serialized, /\[redacted-card\]/u);
  assert.match(serialized, /\[redacted-path\]/u);
  assert.match(serialized, /\[redacted-reference\]/u);
  assert.equal(stored.targetId, 're_test_sensitive_123');
  assert.equal(stored.metadata?.paymentIntent, 'pi_test_pg_sensitive');
  assert.doesNotMatch(serialized, /admin@example\.com|buyer@example\.com|10\.0\.0\.7|postgressecret0123456789abcdef|sk_live_postgres_secret|4000 0000|\/Users\/admin|\/private\/tmp/u);
  assert.equal(rowsRef.rows[0]?.id, 'evt_sensitive');
  assert.equal((JSON.parse(rowsRef.rows[0]!.entry) as AuditLogEntry).hash, stored.hash);
  assert.equal((await log.verify()).valid, true);
});

test('PostgresAuditLog filtered reads use SQL WHERE clauses correctly', async () => {
  const { client } = createInMemoryClient();
  const log = await PostgresAuditLog.create({ client });
  await log.append(makeEntry({ id: 'evt_a', tenantId: 'tenant_alpha', action: 'license.validated' }));
  await log.append(makeEntry({ id: 'evt_b', tenantId: 'tenant_beta', action: 'inference.completed' }));
  await log.append(makeEntry({ id: 'evt_c', tenantId: 'tenant_alpha', action: 'inference.completed' }));

  const alphaOnly = await log.readEntries({ tenantId: 'tenant_alpha' });
  assert.equal(alphaOnly.length, 2);
  assert.ok(alphaOnly.every((e) => e.tenantId === 'tenant_alpha'));

  const inferenceOnly = await log.readEntries({ action: 'inference.completed' });
  assert.equal(inferenceOnly.length, 2);
  assert.ok(inferenceOnly.every((e) => e.action === 'inference.completed'));

  const both = await log.readEntries({ tenantId: 'tenant_alpha', action: 'inference.completed' });
  assert.equal(both.length, 1);
  assert.equal(both[0]!.id, 'evt_c');
});

test('PostgresAuditLog seal mode signs every entry when seal key is provided', async () => {
  const { client } = createInMemoryClient();
  const log = await PostgresAuditLog.create({
    client,
    seal: { keyId: 'k_test_2026', secret: 'unit-test-secret' },
  });
  await log.append(makeEntry({ id: 'evt_signed' }));
  const entries = await log.readEntries();
  assert.equal(entries.length, 1);
  assert.equal(entries[0]!.sealAlgorithm, 'hmac-sha256');
  assert.equal(entries[0]!.sealKeyId, 'k_test_2026');
  assert.ok(entries[0]!.sealSignature && entries[0]!.sealSignature.length > 0);
  const verification = await log.verify();
  assert.equal(verification.valid, true);
});

test('PostgresAuditLog rejects malicious table names', async () => {
  const { client } = createInMemoryClient();
  await assert.rejects(
    () => PostgresAuditLog.create({ client, tableName: 'audit; DROP TABLE users; --' }),
    /invalid postgres identifier/u,
  );
});

test('PostgresAuditLog serialises concurrent appends', async () => {
  const { client } = createInMemoryClient();
  const log = await PostgresAuditLog.create({ client });
  const appends: Promise<void>[] = [];
  for (let i = 0; i < 10; i += 1) {
    appends.push(log.append(makeEntry({ id: `evt_${i}` })));
  }
  await Promise.all(appends);
  const entries = await log.readEntries();
  assert.equal(entries.length, 10);
  // Each entry's previousHash matches the prior entry's hash.
  for (let i = 1; i < entries.length; i += 1) {
    assert.equal(entries[i]!.previousHash, entries[i - 1]!.hash, `chain link broken at ${i}`);
  }
  const verification = await log.verify();
  assert.equal(verification.valid, true);
});

test('PostgresAuditLog wraps connected pg clients in an advisory-lock transaction', async () => {
  const { client, queriesRef, releasesRef } = createInMemoryClient();
  const log = await PostgresAuditLog.create({ client });
  await log.append(makeEntry({ id: 'evt_tx' }));
  assert.ok(queriesRef.queries.includes('BEGIN'));
  assert.ok(queriesRef.queries.some((query) => /^SELECT pg_advisory_xact_lock\(\$1::bigint\)$/u.test(query)));
  assert.ok(queriesRef.queries.includes('COMMIT'));
  assert.equal(releasesRef.count, 1);
});
