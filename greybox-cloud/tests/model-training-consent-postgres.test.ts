// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  PostgresModelTrainingConsentStore,
  type PostgresModelTrainingConsentClient,
} from '../src/enterprise/modelTrainingConsentPostgres.js';
import type { AuthContext } from '../src/types.js';

function createInMemoryClient(): {
  client: PostgresModelTrainingConsentClient;
  rows: Array<{
    id: string;
    tenant_id: string;
    user_id: string;
    project_id: string;
    artifact_id: string | null;
    status: string;
    created_at: string;
    record: string;
  }>;
} {
  const rows: Array<{
    id: string;
    tenant_id: string;
    user_id: string;
    project_id: string;
    artifact_id: string | null;
    status: string;
    created_at: string;
    record: string;
  }> = [];
  const client: PostgresModelTrainingConsentClient = {
    async query(text, values) {
      const trimmed = text.trim();
      if (/^CREATE TABLE/i.test(trimmed) || /^CREATE INDEX/i.test(trimmed)) return { rows: [] };
      if (/^INSERT INTO/i.test(trimmed)) {
        const [id, tenant_id, user_id, project_id, artifact_id, status, created_at, record] = values as [
          string,
          string,
          string,
          string,
          string | null,
          string,
          string,
          string,
        ];
        rows.push({ id, tenant_id, user_id, project_id, artifact_id, status, created_at, record });
        return { rows: [] };
      }
      if (/^SELECT record FROM/i.test(trimmed)) {
        const params = values ?? [];
        let i = 0;
        let filtered = [...rows];
        if (trimmed.includes('tenant_id = $')) {
          const tenantId = params[i++] as string;
          filtered = filtered.filter((row) => row.tenant_id === tenantId);
        }
        if (trimmed.includes('user_id = $')) {
          const userId = params[i++] as string;
          filtered = filtered.filter((row) => row.user_id === userId);
        }
        if (trimmed.includes('project_id = $')) {
          const projectId = params[i++] as string;
          filtered = filtered.filter((row) => row.project_id === projectId);
        }
        if (trimmed.includes('artifact_id = $')) {
          const artifactId = params[i++] as string;
          filtered = filtered.filter((row) => row.artifact_id === artifactId);
        }
        filtered.sort((left, right) => (
          right.created_at.localeCompare(left.created_at) || right.id.localeCompare(left.id)
        ));
        return { rows: filtered.map((row) => ({ record: row.record })) };
      }
      throw new Error(`unexpected sql: ${trimmed}`);
    },
  };
  return { client, rows };
}

const context: AuthContext = {
  tenantId: 'tenant-consent',
  userId: 'designer-1',
  tier: 'studio',
  tokenHash: 'token_hash',
  roles: [],
};

test('PostgresModelTrainingConsentStore records explicit opt-in and supports latest lookup', async () => {
  const { client, rows } = createInMemoryClient();
  const store = await PostgresModelTrainingConsentStore.create({ client });
  const consent = await store.create({
    projectId: 'project-1',
    artifactId: 'artifact-hero-hud',
    status: 'opted-in',
    source: 'settings-checkbox',
    separateCheckboxAccepted: true,
    consentText: 'I explicitly allow Greybox Native model training on this project.',
    dataCategories: ['rated artifact', 'reviewer owner@example.com from 2001:db8::1'],
  }, context, new Date('2026-05-20T10:00:00.000Z'));

  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.tenant_id, 'tenant-consent');
  assert.doesNotMatch(rows[0]?.record ?? '', /I explicitly allow Greybox Native model training/u);
  assert.doesNotMatch(rows[0]?.record ?? '', /owner@example\.com|2001:db8::1/u);
  assert.match(rows[0]?.record ?? '', /\[REDACTED_EMAIL\].*\[REDACTED_IP\]/u);
  assert.equal(consent.status, 'opted-in');
  assert.match(consent.consentTextHash ?? '', /^[a-f0-9]{64}$/u);
  assert.ok(consent.dataCategories.includes('reviewer [REDACTED_EMAIL] from [REDACTED_IP]'));

  const latest = await store.latest({ tenantId: 'tenant-consent', projectId: 'project-1', artifactId: 'artifact-hero-hud' });
  assert.equal(latest?.id, consent.id);
});

test('PostgresModelTrainingConsentStore filters and returns latest consent by creation time', async () => {
  const { client } = createInMemoryClient();
  const store = await PostgresModelTrainingConsentStore.create({ client });
  await store.create({
    projectId: 'project-1',
    artifactId: 'artifact-a',
    status: 'opted-out',
  }, context, new Date('2026-05-20T10:00:00.000Z'));
  await store.create({
    projectId: 'project-1',
    artifactId: 'artifact-a',
    status: 'revoked',
  }, context, new Date('2026-05-20T10:01:00.000Z'));
  await store.create({
    projectId: 'project-2',
    status: 'opted-out',
  }, { ...context, userId: 'designer-2' }, new Date('2026-05-20T10:02:00.000Z'));

  const projectOne = await store.list({ tenantId: 'tenant-consent', projectId: 'project-1' });
  assert.equal(projectOne.length, 2);
  assert.deepEqual(projectOne.map((entry) => entry.status), ['revoked', 'opted-out']);

  const latest = await store.latest({ tenantId: 'tenant-consent', projectId: 'project-1', artifactId: 'artifact-a' });
  assert.equal(latest?.status, 'revoked');

  const userTwo = await store.list({ tenantId: 'tenant-consent', userId: 'designer-2' });
  assert.equal(userTwo.length, 1);
  assert.equal(userTwo[0]?.projectId, 'project-2');
});

test('PostgresModelTrainingConsentStore rejects malicious table names', async () => {
  const { client } = createInMemoryClient();
  await assert.rejects(
    () => PostgresModelTrainingConsentStore.create({ client, tableName: 'consents; DROP TABLE users; --' }),
    /invalid postgres identifier/u,
  );
});
