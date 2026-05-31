// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  PostgresTenantSnapshotPersister,
  type PostgresTenantClient,
} from '../src/routers/tenantsPostgres.js';
import { TenantStore } from '../src/routers/tenants.js';

// In-memory pg-shaped client. Implements only what the persister calls so
// we don't take on a real Postgres dependency for unit tests.
function createInMemoryClient(): {
  client: PostgresTenantClient;
  rows: Map<string, Record<string, unknown>>;
  queries: string[];
} {
  const rows = new Map<string, Record<string, unknown>>();
  const queries: string[] = [];
  const client: PostgresTenantClient = {
    async query(text, values) {
      queries.push(text);
      const trimmed = text.trim();
      if (/^CREATE TABLE IF NOT EXISTS/i.test(trimmed)) return { rows: [] };
      if (/^SELECT snapshot FROM/i.test(trimmed)) {
        const id = (values?.[0] ?? '') as string;
        const row = rows.get(id);
        return { rows: row ? [row] : [] };
      }
      if (/^INSERT INTO/i.test(trimmed)) {
        const [id, snapshot] = values as [string, string];
        rows.set(id, { snapshot });
        return { rows: [] };
      }
      throw new Error(`unexpected query: ${trimmed}`);
    },
  };
  return { client, rows, queries };
}

test('PostgresTenantSnapshotPersister loads an empty snapshot when no row exists', async () => {
  const { client, queries } = createInMemoryClient();
  const persister = await PostgresTenantSnapshotPersister.create({ client });
  assert.equal(persister.loadSync(), undefined);
  assert.ok(queries.some((q) => /^CREATE TABLE IF NOT EXISTS/i.test(q)), 'schema bootstrap fired');
});

test('PostgresTenantSnapshotPersister round-trips a tenant snapshot through saveSync + reload', async () => {
  const { client } = createInMemoryClient();
  const persister = await PostgresTenantSnapshotPersister.create({ client });

  const store = new TenantStore({ persister });
  store.getOrCreate('tenant_alice', 'studio');
  store.getOrCreateForOrganization('org_xyz', 'enterprise');
  await persister.drain();

  // Build a fresh persister against the same in-memory rows and verify the
  // snapshot survives a "process restart".
  const reloaded = await PostgresTenantSnapshotPersister.create({
    client,
    // Reuse the original snapshotId by default.
  });
  const restoredStore = new TenantStore({ persister: reloaded });
  const alice = restoredStore.get('tenant_alice');
  assert.ok(alice, 'tenant_alice survived reload');
  assert.equal(alice.tier, 'studio');
  const org = restoredStore.get('workos:org_xyz');
  assert.ok(org, 'organization-derived tenant survived reload');
  assert.equal(org.tier, 'enterprise');
  assert.equal(org.organizationId, 'org_xyz');
});

test('PostgresTenantSnapshotPersister refreshes an existing replica from the database', async () => {
  const { client } = createInMemoryClient();
  const writerPersister = await PostgresTenantSnapshotPersister.create({ client });
  const readerPersister = await PostgresTenantSnapshotPersister.create({ client });

  const writerStore = new TenantStore({ persister: writerPersister });
  const readerStore = new TenantStore({ persister: readerPersister });
  writerStore.getOrCreate('tenant_shared', 'enterprise', { region: 'eu' });
  await writerPersister.drain();

  assert.equal(readerStore.get('tenant_shared'), undefined);
  await readerStore.refreshFromPersister();

  const refreshed = readerStore.get('tenant_shared');
  assert.ok(refreshed, 'reader replica observed the writer snapshot after refresh');
  assert.equal(refreshed.tier, 'enterprise');
  assert.equal(refreshed.region, 'eu');
});

test('PostgresTenantSnapshotPersister serialises overlapping saves and exposes errors via drain()', async () => {
  let attempts = 0;
  let injectFailure = false;
  const stored: Record<string, unknown> = {};
  const flakyClient: PostgresTenantClient = {
    async query(text, values) {
      attempts += 1;
      if (/^CREATE TABLE/i.test(text)) return { rows: [] };
      if (/^SELECT snapshot/i.test(text)) return { rows: [] };
      if (/^INSERT INTO/i.test(text)) {
        if (injectFailure) {
          throw new Error('postgres conflict');
        }
        const [, snapshot] = values as [string, string];
        stored.snapshot = snapshot;
        return { rows: [] };
      }
      throw new Error(`unexpected: ${text}`);
    },
  };
  const persister = await PostgresTenantSnapshotPersister.create({ client: flakyClient });
  const store = new TenantStore({ persister });
  store.getOrCreate('a', 'indie');
  store.getOrCreate('b', 'studio');
  await persister.drain();
  assert.ok(stored.snapshot, 'snapshot persisted to in-memory client');

  injectFailure = true;
  store.getOrCreate('c', 'studio');
  await assert.rejects(() => persister.drain(), /postgres conflict/u);
  assert.ok(attempts > 3, 'multiple queries fired');
});

test('PostgresTenantSnapshotPersister rejects malicious table names', async () => {
  const { client } = createInMemoryClient();
  await assert.rejects(
    () => PostgresTenantSnapshotPersister.create({ client, tableName: 'tenants; DROP TABLE users; --' }),
    /invalid postgres identifier/u,
  );
});
