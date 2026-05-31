// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import test from 'node:test';

import { licenseHash, type LicenseRecord } from '../src/routers/licenses.js';
import {
  PostgresLicenseRecordStore,
  type PostgresLicenseRecordClient,
} from '../src/routers/licenseRecordsPostgres.js';

function createInMemoryClient(): {
  client: PostgresLicenseRecordClient;
  rows: Map<string, Record<string, unknown>>;
  queries: string[];
} {
  const rows = new Map<string, Record<string, unknown>>();
  const queries: string[] = [];
  const client: PostgresLicenseRecordClient = {
    async query(text, values) {
      queries.push(text);
      const trimmed = text.trim();
      if (/^CREATE TABLE IF NOT EXISTS/iu.test(trimmed)) return { rows: [] };
      if (/^SELECT token_hash/iu.test(trimmed)) {
        return {
          rows: [...rows.values()].sort((left, right) => String(left.token_hash).localeCompare(String(right.token_hash))),
        };
      }
      if (/^INSERT INTO/iu.test(trimmed)) {
        const [tokenHash, tier, plan, status, expiresAt, features] = values as [
          string,
          string,
          string | null,
          string,
          string | null,
          string,
        ];
        rows.set(tokenHash, {
          token_hash: tokenHash,
          tier,
          plan,
          status,
          expires_at: expiresAt,
          features,
        });
        return { rows: [] };
      }
      throw new Error(`unexpected query: ${trimmed}`);
    },
  };
  return { client, rows, queries };
}

test('PostgresLicenseRecordStore persists and lists sanitized license records', async () => {
  const { client, queries } = createInMemoryClient();
  const store = await PostgresLicenseRecordStore.create({ client });
  const token = 'gbx_pro_pg_license_123';
  const record: LicenseRecord = {
    tokenHash: licenseHash(token, 64),
    tier: 'pro',
    plan: 'pro',
    status: 'active',
    expiresAt: '2027-05-21T00:00:00.000Z',
    features: {
      priorityQueue: false,
      seatLimit: 3,
    },
  };

  await store.upsert(record);
  const listed = await store.list();

  assert.ok(queries.some((query) => /^CREATE TABLE IF NOT EXISTS/iu.test(query.trim())));
  assert.equal(listed.length, 1);
  assert.deepEqual(listed[0], record);
  assert.doesNotMatch(JSON.stringify(listed), /gbx_pro_pg_license_123/u);
});

test('PostgresLicenseRecordStore filters malformed rows without leaking secrets', async () => {
  const { client, rows } = createInMemoryClient();
  rows.set('bad', {
    token_hash: 'not-a-hash',
    tier: 'pro',
    status: 'active',
    features: {},
  });
  const token = 'gbx_studio_pg_license_123';
  rows.set('good', {
    token_hash: licenseHash(token, 64),
    tier: 'studio',
    plan: 'enterprise',
    status: 'suspended',
    expires_at: new Date('2027-05-21T00:00:00.000Z'),
    features: { sso: true, customSkillPacks: true },
  });
  const store = await PostgresLicenseRecordStore.create({ client });

  const listed = await store.list();

  assert.equal(listed.length, 1);
  assert.equal(listed[0]?.tier, 'studio');
  assert.equal(listed[0]?.status, 'suspended');
  assert.equal(listed[0]?.expiresAt, '2027-05-21T00:00:00.000Z');
  assert.equal(listed[0]?.features?.sso, true);
});

test('PostgresLicenseRecordStore rejects unsafe table names and token hashes', async () => {
  const { client } = createInMemoryClient();
  await assert.rejects(
    () => PostgresLicenseRecordStore.create({ client, tableName: 'licenses; DROP TABLE users; --' }),
    /invalid postgres identifier/u,
  );
  const store = await PostgresLicenseRecordStore.create({ client });
  await assert.rejects(
    () => store.upsert({ tokenHash: 'not-a-hash', tier: 'pro' }),
    /tokenHash/u,
  );
});
