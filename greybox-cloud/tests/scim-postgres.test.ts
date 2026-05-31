// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  PostgresScimUserPersister,
  type PostgresScimClient,
} from '../src/enterprise/scimPostgres.js';
import { ScimUserStore } from '../src/enterprise/scim.js';

function createInMemoryClient(): {
  client: PostgresScimClient;
  rows: Map<string, { id: string; user_name: string; user: string }>;
  inTx: { value: boolean };
  releases: { count: number };
} {
  const rows = new Map<string, { id: string; user_name: string; user: string }>();
  const inTx = { value: false };
  const releases = { count: 0 };
  let staged: Map<string, { id: string; user_name: string; user: string }> | null = null;
  const client: PostgresScimClient = {
    async query(text, values) {
      const trimmed = text.trim();
      if (/^CREATE TABLE/i.test(trimmed)) return { rows: [] };
      if (/^BEGIN/i.test(trimmed)) {
        inTx.value = true;
        staged = new Map(rows);
        return { rows: [] };
      }
      if (/^COMMIT/i.test(trimmed)) {
        if (staged) {
          rows.clear();
          for (const [k, v] of staged.entries()) rows.set(k, v);
        }
        staged = null;
        inTx.value = false;
        return { rows: [] };
      }
      if (/^ROLLBACK/i.test(trimmed)) {
        staged = null;
        inTx.value = false;
        return { rows: [] };
      }
      const target = staged ?? rows;
      if (/^INSERT INTO/i.test(trimmed)) {
        const [id, user_name, user] = values as [string, string, string];
        target.set(id, { id, user_name, user });
        return { rows: [] };
      }
      if (/^DELETE FROM .* WHERE id <> ALL/i.test(trimmed)) {
        const ids = new Set((values?.[0] as string[]) ?? []);
        for (const id of [...target.keys()]) {
          if (!ids.has(id)) target.delete(id);
        }
        return { rows: [] };
      }
      if (/^DELETE FROM/i.test(trimmed)) {
        target.clear();
        return { rows: [] };
      }
      if (/^SELECT "user" FROM .* ORDER BY user_name ASC$/i.test(trimmed)) {
        const ordered = [...rows.values()].sort((a, b) => a.user_name.localeCompare(b.user_name));
        return { rows: ordered.map((r) => ({ user: r.user })) };
      }
      throw new Error(`unexpected sql: ${trimmed}`);
    },
    async connect() {
      return {
        query: (text, values) => client.query(text, values),
        release: () => {
          releases.count += 1;
        },
      };
    },
  };
  return { client, rows, inTx, releases };
}

test('PostgresScimUserPersister persists SCIM users through ScimUserStore', async () => {
  const { client, rows, releases } = createInMemoryClient();
  const persister = await PostgresScimUserPersister.create({ client });
  const store = new ScimUserStore({ persister });

  const baseUrl = 'https://api.greybox.studio';
  const alice = await store.create({ userName: 'alice@example.com', displayName: 'Alice' }, baseUrl);
  const bob = await store.create({ userName: 'bob@example.com', displayName: 'Bob' }, baseUrl);

  assert.equal(rows.size, 2, 'two SCIM users stored');
  assert.ok(rows.has(alice.id));
  assert.ok(rows.has(bob.id));

  // Reload via a fresh store + persister and verify they survive.
  const reloaded = new ScimUserStore({ persister });
  const list = await reloaded.list();
  assert.equal(list.totalResults, 2);
  assert.deepEqual(list.Resources.map((u) => u.userName).sort(), ['alice@example.com', 'bob@example.com']);
  assert.equal(releases.count, 2);
});

test('PostgresScimUserPersister preserves rows absent from stale snapshots', async () => {
  const { client, rows } = createInMemoryClient();
  const firstPersister = await PostgresScimUserPersister.create({ client });
  const secondPersister = await PostgresScimUserPersister.create({ client });
  const firstStore = new ScimUserStore({ persister: firstPersister });
  const secondStore = new ScimUserStore({ persister: secondPersister });

  await Promise.all([
    firstStore.create({ userName: 'alice@example.com' }, 'https://api.greybox.studio'),
    secondStore.create({ userName: 'bob@example.com' }, 'https://api.greybox.studio'),
  ]);

  assert.equal(rows.size, 2, 'concurrent replica creates should not tombstone each other');
  const restored = new ScimUserStore({ persister: firstPersister });
  const list = await restored.list();
  assert.deepEqual(list.Resources.map((user) => user.userName).sort(), [
    'alice@example.com',
    'bob@example.com',
  ]);
});

test('PostgresScimUserPersister rolls back when an upsert throws inside the transaction', async () => {
  const { client, rows } = createInMemoryClient();
  await client.query('CREATE TABLE');
  // Seed one row outside the persister so we can assert rollback.
  rows.set('u_seed', { id: 'u_seed', user_name: 'seed@example.com', user: JSON.stringify({ id: 'u_seed', userName: 'seed@example.com' }) });
  // Wrap the client so the second INSERT throws.
  let insertCount = 0;
  const wrapped: PostgresScimClient = {
    query: async (text, values) => {
      if (/^INSERT INTO/i.test(text.trim())) {
        insertCount += 1;
        if (insertCount === 2) throw new Error('simulated unique violation');
      }
      return client.query(text, values);
    },
  };
  const persister = await PostgresScimUserPersister.create({ client: wrapped });
  await assert.rejects(() => persister.save([
    { schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'], id: 'u_x', userName: 'x@example.com', active: true, meta: { resourceType: 'User', created: new Date().toISOString(), lastModified: new Date().toISOString() } },
    { schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'], id: 'u_y', userName: 'y@example.com', active: true, meta: { resourceType: 'User', created: new Date().toISOString(), lastModified: new Date().toISOString() } },
  ]), /simulated unique violation/u);
  // Rollback preserves the seed row.
  assert.equal(rows.size, 1);
  assert.ok(rows.has('u_seed'));
});

test('PostgresScimUserPersister rejects malicious table names', async () => {
  const { client } = createInMemoryClient();
  await assert.rejects(
    () => PostgresScimUserPersister.create({ client, tableName: 'scim_users; DROP TABLE users; --' }),
    /invalid postgres identifier/u,
  );
});
