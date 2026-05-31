// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import type http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { FileAuditLog } from '../src/enterprise/auditLog.js';
import { ScimUserStore, type ScimUser } from '../src/enterprise/scim.js';
import { createGreyboxCloudServer } from '../src/server.js';

async function withServer<T>(
  options: Parameters<typeof createGreyboxCloudServer>[0],
  run: (baseUrl: string, server: http.Server) => Promise<T>,
): Promise<T> {
  const server = createGreyboxCloudServer(options);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  try {
    return await run(`http://127.0.0.1:${address.port}`, server);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

function userBody(userName = 'designer@example.com') {
  return {
    schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
    userName,
    externalId: 'okta-123',
    name: { givenName: 'Dina', familyName: 'Designer' },
    emails: [{ value: userName, primary: true, type: 'work' }],
    active: true,
  };
}

function scimSubjectHash(value: string): string {
  return createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}

test('SCIM endpoints require tenant bearer token', async () => {
  await withServer(
    { scimStore: new ScimUserStore(), scimToken: 'scim-secret' },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/v1/scim/v2/ServiceProviderConfig`);
      assert.equal(response.status, 401);
      assert.match(response.headers.get('content-type') ?? '', /application\/scim\+json/u);
      assert.equal((await response.json() as { detail: string }).detail, 'SCIM bearer token required');
    },
  );
});

test('SCIM service metadata is discoverable by identity providers', async () => {
  await withServer(
    { scimStore: new ScimUserStore(), scimToken: 'scim-secret' },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/v1/scim/v2/ServiceProviderConfig`, {
        headers: { authorization: 'Bearer scim-secret' },
      });
      assert.equal(response.status, 200);
      const json = await response.json() as { patch: { supported: boolean }; filter: { supported: boolean } };
      assert.equal(json.patch.supported, true);
      assert.equal(json.filter.supported, true);
    },
  );
});

test('SCIM creates, lists, filters, and reads users', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-scim-'));
  try {
    await withServer(
      { scimStore: new ScimUserStore(dir), scimToken: 'scim-secret' },
      async (baseUrl) => {
        const create = await fetch(`${baseUrl}/v1/scim/v2/Users`, {
          method: 'POST',
          headers: {
            authorization: 'Bearer scim-secret',
            'content-type': 'application/scim+json',
          },
          body: JSON.stringify(userBody()),
        });
        assert.equal(create.status, 201);
        const created = await create.json() as ScimUser;
        assert.equal(created.userName, 'designer@example.com');
        assert.equal(created.active, true);
        assert.match(create.headers.get('location') ?? '', new RegExp(`/v1/scim/v2/Users/${created.id}$`, 'u'));

        const list = await fetch(`${baseUrl}/v1/scim/v2/Users?filter=${encodeURIComponent('userName eq "designer@example.com"')}`, {
          headers: { authorization: 'Bearer scim-secret' },
        });
        assert.equal(list.status, 200);
        const listed = await list.json() as { totalResults: number; Resources: ScimUser[] };
        assert.equal(listed.totalResults, 1);
        assert.equal(listed.Resources[0]?.id, created.id);

        const read = await fetch(`${baseUrl}/v1/scim/v2/Users/${created.id}`, {
          headers: { authorization: 'Bearer scim-secret' },
        });
        assert.equal(read.status, 200);
        assert.equal((await read.json() as ScimUser).externalId, 'okta-123');
      },
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('SCIM user locations ignore spoofed forwarded hosts and prefer canonical public base', async () => {
  await withServer(
    {
      scimStore: new ScimUserStore(),
      scimToken: 'scim-secret',
      publicBaseUrl: 'https://cloud.greybox.studio/',
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/v1/scim/v2/Users`, {
        method: 'POST',
        headers: {
          authorization: 'Bearer scim-secret',
          'content-type': 'application/scim+json',
          'x-forwarded-host': 'attacker.example',
          'x-forwarded-proto': 'https',
        },
        body: JSON.stringify(userBody('canonical@example.com')),
      });
      assert.equal(response.status, 201);
      const created = await response.json() as ScimUser;
      const location = response.headers.get('location') ?? '';
      assert.equal(location, `https://cloud.greybox.studio/v1/scim/v2/Users/${created.id}`);
      assert.equal(created.meta.location, location);
      assert.doesNotMatch(location, /attacker|@/u);
    },
  );
});

test('SCIM user locations do not trust forwarded host without canonical base config', async () => {
  await withServer(
    { scimStore: new ScimUserStore(), scimToken: 'scim-secret' },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/v1/scim/v2/Users`, {
        method: 'POST',
        headers: {
          authorization: 'Bearer scim-secret',
          'content-type': 'application/scim+json',
          'x-forwarded-host': 'user:secret@attacker.example',
          'x-forwarded-proto': 'https',
        },
        body: JSON.stringify(userBody('fallback@example.com')),
      });
      assert.equal(response.status, 201);
      const created = await response.json() as ScimUser;
      const location = response.headers.get('location') ?? '';
      assert.match(location, new RegExp(`/v1/scim/v2/Users/${created.id}$`, 'u'));
      assert.doesNotMatch(location, /attacker|secret|@/u);
    },
  );
});

test('file-backed SCIM store reloads before mutation to avoid stale snapshot overwrites', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-scim-'));
  try {
    const first = new ScimUserStore(dir);
    const second = new ScimUserStore(dir);

    assert.equal((await second.list()).totalResults, 0);
    await first.create(userBody('alice@example.com'), 'https://cloud.greybox.studio');
    await second.create(userBody('bob@example.com'), 'https://cloud.greybox.studio');

    const restored = new ScimUserStore(dir);
    const list = await restored.list();
    assert.equal(list.totalResults, 2);
    assert.deepEqual(list.Resources.map((user) => user.userName).sort(), [
      'alice@example.com',
      'bob@example.com',
    ]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('SCIM rejects duplicate userName values', async () => {
  await withServer(
    { scimStore: new ScimUserStore(), scimToken: 'scim-secret' },
    async (baseUrl) => {
      for (let i = 0; i < 2; i += 1) {
        const response = await fetch(`${baseUrl}/v1/scim/v2/Users`, {
          method: 'POST',
          headers: {
            authorization: 'Bearer scim-secret',
            'content-type': 'application/scim+json',
          },
          body: JSON.stringify(userBody('dupe@example.com')),
        });
        assert.equal(response.status, i === 0 ? 201 : 409);
      }
    },
  );
});

test('SCIM PATCH deactivates users and records audit entries', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-scim-audit-'));
  try {
    const auditLog = new FileAuditLog(dir, 'audit.jsonl');
    await withServer(
      {
        scimStore: new ScimUserStore(dir),
        scimToken: 'scim-secret',
        scimTenantId: 'tenant-enterprise',
        auditLog,
        auditAdminToken: 'audit-admin',
      },
      async (baseUrl) => {
        const create = await fetch(`${baseUrl}/v1/scim/v2/Users`, {
          method: 'POST',
          headers: {
            authorization: 'Bearer scim-secret',
            'content-type': 'application/scim+json',
            'user-agent': 'Okta SCIM Client',
          },
          body: JSON.stringify(userBody('patch@example.com')),
        });
        const created = await create.json() as ScimUser;

        const patch = await fetch(`${baseUrl}/v1/scim/v2/Users/${created.id}`, {
          method: 'PATCH',
          headers: {
            authorization: 'Bearer scim-secret',
            'content-type': 'application/scim+json',
          },
          body: JSON.stringify({
            schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
            Operations: [{ op: 'Replace', path: 'active', value: false }],
          }),
        });
        assert.equal(patch.status, 200);
        assert.equal((await patch.json() as ScimUser).active, false);

        const deletion = await fetch(`${baseUrl}/v1/scim/v2/Users/${created.id}`, {
          method: 'DELETE',
          headers: { authorization: 'Bearer scim-secret' },
        });
        assert.equal(deletion.status, 204);

        const csv = await fetch(`${baseUrl}/v1/audit-log/export?format=csv&tenantId=tenant-enterprise`, {
          headers: { authorization: 'Bearer audit-admin' },
        });
        assert.equal(csv.status, 200);
        const csvText = await csv.text();
        assert.match(csvText, /scim\.user_created/u);
        assert.match(csvText, /scim\.user_patched/u);
        assert.match(csvText, /scim\.user_deactivated/u);
        assert.doesNotMatch(csvText, /patch@example\.com|okta-123/u);
        assert.match(csvText, new RegExp(scimSubjectHash('patch@example.com'), 'u'));
        assert.match(csvText, new RegExp(scimSubjectHash('okta-123'), 'u'));

        const splunk = await fetch(`${baseUrl}/v1/audit-log/export?format=splunk-json&tenantId=tenant-enterprise`, {
          headers: { authorization: 'Bearer audit-admin' },
        });
        assert.equal(splunk.status, 200);
        const firstLine = (await splunk.text()).trim().split('\n')[0];
        const event = JSON.parse(firstLine ?? '{}') as {
          sourcetype: string;
          event: { action: string; metadata?: { userNameHash?: string; externalIdHash?: string; emailHashes?: string[] } };
        };
        assert.equal(event.sourcetype, 'greybox:audit');
        assert.equal(event.event.action, 'scim.user_created');
        assert.equal(event.event.metadata?.userNameHash, scimSubjectHash('patch@example.com'));
        assert.equal(event.event.metadata?.externalIdHash, scimSubjectHash('okta-123'));
        assert.deepEqual(event.event.metadata?.emailHashes, [scimSubjectHash('patch@example.com')]);

        const verification = await fetch(`${baseUrl}/v1/audit-log/verify?tenantId=tenant-enterprise`, {
          headers: { authorization: 'Bearer audit-admin' },
        });
        assert.equal(verification.status, 200);
        assert.deepEqual(await verification.json(), {
          valid: true,
          checked: 3,
          matching: 3,
          scope: 'full-log-hash-chain',
        });
      },
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
