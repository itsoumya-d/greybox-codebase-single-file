// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  PostgresSecurityIncidentStore,
  type PostgresSecurityIncidentClient,
} from '../src/enterprise/incidentsPostgres.js';

function createInMemoryClient(): {
  client: PostgresSecurityIncidentClient;
  rows: Array<{
    revision: number;
    id: string;
    tenant_id: string;
    status: string;
    severity: string;
    category: string;
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
    severity: string;
    category: string;
    created_at: string;
    updated_at: string;
    record: string;
  }> = [];
  let nextRevision = 1;
  const client: PostgresSecurityIncidentClient = {
    async query(text, values) {
      const trimmed = text.trim();
      if (/^CREATE TABLE/i.test(trimmed) || /^CREATE INDEX/i.test(trimmed)) return { rows: [] };
      if (/^INSERT INTO/i.test(trimmed)) {
        const [id, tenant_id, status, severity, category, created_at, updated_at, record] = values as [
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
          severity,
          category,
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
        if (trimmed.includes('severity = $')) {
          const severity = params[i++] as string;
          filtered = filtered.filter((row) => row.severity === severity);
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

test('PostgresSecurityIncidentStore records breach clocks and latest get', async () => {
  const { client, rows } = createInMemoryClient();
  const store = await PostgresSecurityIncidentStore.create({ client });
  const created = await store.create({
    tenantId: 'tenant-sec',
    title: 'EU audit evidence exposure',
    summary: 'Responder pasted a credential into a private incident note.',
    severity: 'sev2',
    category: 'data-breach',
    detectedAt: '2026-05-17T00:15:00.000Z',
    awareAt: '2026-05-17T00:30:00.000Z',
    personalDataBreach: true,
    gdprRiskAssessment: 'likely',
    affectedTenantIds: ['tenant-sec', 'tenant-sec'],
    dataCategories: ['email', 'audit metadata'],
  }, 'security-admin', new Date('2026-05-17T01:00:00.000Z'));

  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.tenant_id, 'tenant-sec');
  assert.equal(created.regulatoryClocks[0]?.basis, 'gdpr-article-33-72-hour');
  assert.equal(created.regulatoryClocks[0]?.dueAt, '2026-05-20T00:30:00.000Z');
  assert.deepEqual(created.affectedTenantIds, ['tenant-sec']);

  const stored = await store.get(created.id);
  assert.equal(stored?.id, created.id);
  assert.equal(stored?.status, 'triage');
});

test('PostgresSecurityIncidentStore appends updates and filters latest records', async () => {
  const { client, rows } = createInMemoryClient();
  const store = await PostgresSecurityIncidentStore.create({ client });
  const first = await store.create({
    tenantId: 'tenant-a',
    title: 'Model abuse spike',
    severity: 'sev3',
    category: 'model-abuse',
  }, 'security-admin', new Date('2026-05-20T10:00:00.000Z'));
  await store.create({
    tenantId: 'tenant-b',
    title: 'Third-party status page outage',
    severity: 'sev4',
    category: 'third-party',
  }, 'security-admin', new Date('2026-05-20T10:01:00.000Z'));
  const updated = await store.update(
    first.id,
    {
      status: 'contained',
      severity: 'sev2',
      gdprRiskAssessment: 'unlikely',
      note: 'Abusive key revoked and inference rate limit reduced.',
    },
    'secops-2',
    new Date('2026-05-20T10:02:00.000Z'),
  );

  assert.equal(rows.length, 3);
  assert.equal(updated.timeline.at(-1)?.actorId, 'secops-2');
  assert.equal(updated.timeline.at(-1)?.note, 'Abusive key revoked and inference rate limit reduced.');

  const containedSev2 = await store.list({ tenantId: 'tenant-a', status: 'contained', severity: 'sev2' });
  assert.equal(containedSev2.length, 1);
  assert.equal(containedSev2[0]?.id, first.id);

  const triage = await store.list({ status: 'triage' });
  assert.equal(triage.length, 1);
  assert.equal(triage[0]?.tenantId, 'tenant-b');
});

test('PostgresSecurityIncidentStore rejects malicious table names', async () => {
  const { client } = createInMemoryClient();
  await assert.rejects(
    () => PostgresSecurityIncidentStore.create({ client, tableName: 'incidents; DROP TABLE users; --' }),
    /invalid postgres identifier/u,
  );
});
