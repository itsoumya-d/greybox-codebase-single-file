// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PostgresProModuleEntitlementGrantStore,
  type PostgresProModuleEntitlementGrantClient,
} from '../src/routers/proModuleEntitlementsPostgres.js';

function createInMemoryClient(): {
  client: PostgresProModuleEntitlementGrantClient;
  rows: Map<string, Record<string, unknown>>;
  queries: string[];
} {
  const rows = new Map<string, Record<string, unknown>>();
  const queries: string[] = [];
  const client: PostgresProModuleEntitlementGrantClient = {
    async query(text, values) {
      queries.push(text);
      const trimmed = text.trim();
      if (/^CREATE TABLE IF NOT EXISTS/iu.test(trimmed)) return { rows: [] };
      if (/^CREATE INDEX IF NOT EXISTS/iu.test(trimmed)) return { rows: [] };
      if (/^SELECT license_hash/iu.test(trimmed)) {
        return {
          rows: [...rows.values()].sort((left, right) => String(left.grant_key).localeCompare(String(right.grant_key))),
        };
      }
      if (/^INSERT INTO/iu.test(trimmed)) {
        const [licenseHash, lookupKey, grantKey, status] = values as [
          string,
          string | null,
          string,
          string,
        ];
        rows.set(`${licenseHash}:${grantKey}`, {
          license_hash: licenseHash,
          lookup_key: lookupKey,
          grant_key: grantKey,
          status,
        });
        return { rows: [] };
      }
      throw new Error(`unexpected query: ${trimmed}`);
    },
  };
  return { client, rows, queries };
}

test('PostgresProModuleEntitlementGrantStore persists grants without raw lookup leakage', async () => {
  const { client, queries } = createInMemoryClient();
  const store = await PostgresProModuleEntitlementGrantStore.create({ client });

  await store.upsert({
    licenseHash: 'a'.repeat(16),
    lookupKey: 'gbx_ent_marketplace_lookup_123',
    modules: ['soulslike-combat-pack', 'gbpro.live-ops-pro', 'bad/path'],
  });

  const listed = await store.list();

  assert.ok(queries.some((query) => /^CREATE TABLE IF NOT EXISTS/iu.test(query.trim())));
  assert.ok(queries.some((query) => /^CREATE INDEX IF NOT EXISTS/iu.test(query.trim())));
  assert.equal(listed.length, 2);
  assert.deepEqual(listed.map((record) => record.modules[0]).sort(), ['gbpro.live-ops-pro', 'soulslike-combat-pack']);
  assert.equal(listed[0]?.licenseHash, 'a'.repeat(16));
  assert.equal(listed[0]?.lookupKey, 'gbx_ent_marketplace_lookup_123');
  assert.doesNotMatch(JSON.stringify(listed), /marketplace-admin-token|gbx_indie_raw/u);
});

test('PostgresProModuleEntitlementGrantStore filters malformed rows and revocations', async () => {
  const { client, rows } = createInMemoryClient();
  rows.set('bad', {
    license_hash: 'not-a-hash',
    lookup_key: 'gbx_ent_bad',
    grant_key: 'soulslike-combat-pack',
    status: 'active',
  });
  rows.set('revoked', {
    license_hash: 'b'.repeat(16),
    lookup_key: 'gbx_ent_revoked',
    grant_key: 'cozy-sim-pack',
    status: 'revoked',
  });
  const store = await PostgresProModuleEntitlementGrantStore.create({ client });

  const listed = await store.list();

  assert.equal(listed.length, 1);
  assert.equal(listed[0]?.status, 'revoked');
  assert.equal(listed[0]?.modules[0], 'cozy-sim-pack');
});

test('PostgresProModuleEntitlementGrantStore rejects unsafe inputs', async () => {
  const { client } = createInMemoryClient();
  await assert.rejects(
    () => PostgresProModuleEntitlementGrantStore.create({ client, tableName: 'entitlements; DROP TABLE users; --' }),
    /invalid postgres identifier/u,
  );
  const store = await PostgresProModuleEntitlementGrantStore.create({ client });
  await assert.rejects(
    () => store.upsert({ licenseHash: 'not-a-hash', modules: ['soulslike-combat-pack'] }),
    /licenseHash/u,
  );
  await assert.rejects(
    () => store.upsert({ licenseHash: 'a'.repeat(16), modules: ['bad/path'] }),
    /modules/u,
  );
  await assert.rejects(
    () => store.upsert({
      licenseHash: 'a'.repeat(16),
      lookupKey: 'https://bad.example',
      modules: ['soulslike-combat-pack'],
    }),
    /lookupKey/u,
  );
});
