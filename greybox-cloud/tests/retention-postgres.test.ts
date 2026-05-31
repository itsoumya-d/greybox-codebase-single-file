// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  PostgresLegalHoldStore,
  type PostgresLegalHoldClient,
} from '../src/enterprise/retentionPostgres.js';
import { buildRetentionReport } from '../src/enterprise/retention.js';

function createInMemoryClient(): {
  client: PostgresLegalHoldClient;
  rows: Array<{
    revision: number;
    id: string;
    tenant_id: string;
    status: string;
    datasets: string[];
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
    datasets: string[];
    created_at: string;
    updated_at: string;
    record: string;
  }> = [];
  let nextRevision = 1;
  const client: PostgresLegalHoldClient = {
    async query(text, values) {
      const trimmed = text.trim();
      if (/^CREATE TABLE/i.test(trimmed) || /^CREATE INDEX/i.test(trimmed)) return { rows: [] };
      if (/^INSERT INTO/i.test(trimmed)) {
        const [id, tenant_id, status, datasets, created_at, updated_at, record] = values as [
          string,
          string,
          string,
          string[],
          string,
          string,
          string,
        ];
        rows.push({
          revision: nextRevision++,
          id,
          tenant_id,
          status,
          datasets,
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
        if (trimmed.includes('= ANY(datasets)')) {
          const dataset = params[i++] as string;
          filtered = filtered.filter((row) => row.datasets.includes(dataset));
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

test('PostgresLegalHoldStore creates deletion blockers and supports retention reports', async () => {
  const { client, rows } = createInMemoryClient();
  const store = await PostgresLegalHoldStore.create({ client });
  const created = await store.create({
    tenantId: 'tenant-retention',
    title: 'Litigation hold',
    reason: 'Preserve project and audit records for counsel review.',
    datasets: ['project-artifacts', 'audit-log'],
    projectIds: ['project-1'],
    userIds: ['user-1'],
    expiresAt: '2026-08-17T00:00:00.000Z',
  }, 'privacy-admin', new Date('2026-05-20T10:00:00.000Z'));

  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.tenant_id, 'tenant-retention');
  assert.deepEqual(rows[0]?.datasets, ['project-artifacts', 'audit-log']);
  assert.equal(created.status, 'active');
  assert.equal(created.timeline[0]?.actorId, 'privacy-admin');

  const report = await buildRetentionReport({ tenantId: 'tenant-retention', legalHoldStore: store });
  assert.equal(report.deletionBlocked, true);
  assert.equal(report.activeLegalHolds[0]?.id, created.id);
});

test('PostgresLegalHoldStore appends releases and filters latest records', async () => {
  const { client, rows } = createInMemoryClient();
  const store = await PostgresLegalHoldStore.create({ client });
  const first = await store.create({
    tenantId: 'tenant-a',
    title: 'Project hold',
    reason: 'Deletion blocked until dispute closes.',
    datasets: ['project-artifacts'],
  }, 'privacy-admin', new Date('2026-05-20T10:00:00.000Z'));
  await store.create({
    tenantId: 'tenant-b',
    title: 'Billing hold',
    reason: 'Preserve billing evidence for tax review.',
    datasets: ['billing-ledger'],
  }, 'privacy-admin', new Date('2026-05-20T10:01:00.000Z'));
  const released = await store.update(
    first.id,
    { status: 'released', note: 'Counsel released the hold.' },
    'counsel-1',
    new Date('2026-05-20T10:02:00.000Z'),
  );

  assert.equal(rows.length, 3);
  assert.equal(released.status, 'released');
  assert.ok(released.releasedAt);
  assert.equal(released.timeline.at(-1)?.note, 'Counsel released the hold.');

  const activeProjectHolds = await store.list({ dataset: 'project-artifacts', status: 'active' });
  assert.equal(activeProjectHolds.length, 0);

  const activeBillingHolds = await store.list({ dataset: 'billing-ledger', status: 'active' });
  assert.equal(activeBillingHolds.length, 1);
  assert.equal(activeBillingHolds[0]?.tenantId, 'tenant-b');
});

test('PostgresLegalHoldStore rejects malicious table names', async () => {
  const { client } = createInMemoryClient();
  await assert.rejects(
    () => PostgresLegalHoldStore.create({ client, tableName: 'holds; DROP TABLE users; --' }),
    /invalid postgres identifier/u,
  );
});
