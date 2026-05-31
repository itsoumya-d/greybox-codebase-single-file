// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  PostgresPrivacyRequestStore,
  type PostgresPrivacyRequestClient,
} from '../src/enterprise/privacyRequestsPostgres.js';
import {
  privacyRequestAuthorized,
} from '../src/enterprise/privacyRequests.js';

function createInMemoryClient(): {
  client: PostgresPrivacyRequestClient;
  rows: Array<{
    revision: number;
    id: string;
    tenant_id: string;
    status: string;
    jurisdiction: string;
    request_type: string;
    created_at: string;
    updated_at: string;
    record: string;
  }>;
} {
  const rows: Array<{
    revision: number;
    id: string;
    tenant_id: string;
    status: string;
    jurisdiction: string;
    request_type: string;
    created_at: string;
    updated_at: string;
    record: string;
  }> = [];
  let nextRevision = 1;
  const client: PostgresPrivacyRequestClient = {
    async query(text, values) {
      const trimmed = text.trim();
      if (/^CREATE TABLE/i.test(trimmed) || /^CREATE INDEX/i.test(trimmed)) return { rows: [] };
      if (/^INSERT INTO/i.test(trimmed)) {
        const [id, tenant_id, status, jurisdiction, request_type, created_at, updated_at, record] = values as [
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
        ];
        rows.push({
          revision: nextRevision++,
          id,
          tenant_id,
          status,
          jurisdiction,
          request_type,
          created_at,
          updated_at,
          record,
        });
        return { rows: [] };
      }
      if (/^SELECT record FROM .* WHERE id = \$1 ORDER BY revision DESC LIMIT 1$/i.test(trimmed)) {
        const id = values?.[0] as string;
        const latest = [...rows].filter((row) => row.id === id).sort((a, b) => b.revision - a.revision)[0];
        return { rows: latest ? [{ record: latest.record }] : [] };
      }
      if (/^SELECT record\s+FROM \(/i.test(trimmed)) {
        const latest = latestRows(rows);
        const params = values ?? [];
        let i = 0;
        let filtered = latest;
        if (trimmed.includes('tenant_id = $')) {
          const tenantId = params[i++] as string;
          filtered = filtered.filter((row) => row.tenant_id === tenantId);
        }
        if (trimmed.includes('status = $')) {
          const status = params[i++] as string;
          filtered = filtered.filter((row) => row.status === status);
        }
        if (trimmed.includes('jurisdiction = $')) {
          const jurisdiction = params[i++] as string;
          filtered = filtered.filter((row) => row.jurisdiction === jurisdiction);
        }
        filtered.sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
        return { rows: filtered.map((row) => ({ record: row.record })) };
      }
      throw new Error(`unexpected sql: ${trimmed}`);
    },
  };
  return { client, rows };
}

function latestRows<T extends { revision: number; id: string }>(rows: T[]): T[] {
  const byId = new Map<string, T>();
  for (const row of rows) {
    const previous = byId.get(row.id);
    if (!previous || row.revision > previous.revision) byId.set(row.id, row);
  }
  return [...byId.values()];
}

test('PostgresPrivacyRequestStore creates requests with hashed requester access tokens', async () => {
  const { client, rows } = createInMemoryClient();
  const store = await PostgresPrivacyRequestStore.create({ client });
  const created = await store.create({
    tenantId: 'tenant-eu',
    jurisdiction: 'gdpr',
    requestType: 'access',
    subjectType: 'adult',
    contactEmail: 'Player.One@Example.com',
    subjectEmail: 'player.one@example.com',
  }, new Date('2026-05-20T12:00:00.000Z'));

  assert.equal(rows.length, 1);
  assert.equal(created.request.contactEmail, 'player.one@example.com');
  assert.notEqual(created.request.accessTokenHash, created.accessToken);
  assert.equal(privacyRequestAuthorized(created.request, created.accessToken), true);

  const stored = await store.get(created.request.id);
  assert.equal(stored?.id, created.request.id);
  assert.equal(stored?.deadlineBasis, 'gdpr-article-12');
});

test('PostgresPrivacyRequestStore returns only latest versions for list and get', async () => {
  const { client, rows } = createInMemoryClient();
  const store = await PostgresPrivacyRequestStore.create({ client });
  const created = await store.create({
    tenantId: 'tenant-ca',
    jurisdiction: 'ccpa',
    requestType: 'delete',
    subjectType: 'authorized-agent',
    contactEmail: 'agent@example.org',
    subjectEmail: 'consumer@example.org',
  }, new Date('2026-05-20T12:00:00.000Z'));

  const updated = await store.updateStatus(
    created.request.id,
    { status: 'in-progress', note: 'Identity verification passed.' },
    'privacy-admin',
    new Date('2026-05-20T12:05:00.000Z'),
  );

  assert.equal(rows.length, 2);
  assert.equal(updated.timeline.length, 2);
  assert.equal(updated.timeline.at(-1)?.note, 'Identity verification passed.');

  const listed = await store.list({ tenantId: 'tenant-ca' });
  assert.equal(listed.length, 1);
  assert.equal(listed[0]?.status, 'in-progress');

  const fetched = await store.get(created.request.id);
  assert.equal(fetched?.status, 'in-progress');
});

test('PostgresPrivacyRequestStore filters by tenant, status, and jurisdiction', async () => {
  const { client } = createInMemoryClient();
  const store = await PostgresPrivacyRequestStore.create({ client });
  const first = await store.create({
    tenantId: 'tenant-a',
    jurisdiction: 'gdpr',
    requestType: 'access',
    contactEmail: 'a@example.com',
  }, new Date('2026-05-20T12:00:00.000Z'));
  await store.create({
    tenantId: 'tenant-b',
    jurisdiction: 'dpdpa',
    requestType: 'delete',
    contactEmail: 'b@example.com',
  }, new Date('2026-05-20T12:01:00.000Z'));
  await store.updateStatus(first.request.id, { status: 'fulfilled' }, 'privacy-admin', new Date('2026-05-20T12:02:00.000Z'));

  const fulfilledGdpr = await store.list({ tenantId: 'tenant-a', status: 'fulfilled', jurisdiction: 'gdpr' });
  assert.equal(fulfilledGdpr.length, 1);
  assert.equal(fulfilledGdpr[0]?.tenantId, 'tenant-a');

  const received = await store.list({ status: 'received' });
  assert.equal(received.length, 1);
  assert.equal(received[0]?.tenantId, 'tenant-b');
});

test('PostgresPrivacyRequestStore rejects malicious table names', async () => {
  const { client } = createInMemoryClient();
  await assert.rejects(
    () => PostgresPrivacyRequestStore.create({ client, tableName: 'privacy; DROP TABLE users; --' }),
    /invalid postgres identifier/u,
  );
});
