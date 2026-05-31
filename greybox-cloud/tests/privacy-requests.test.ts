// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import type http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { FileAuditLog } from '../src/enterprise/auditLog.js';
import { ScimUserStore } from '../src/enterprise/scim.js';
import {
  FilePrivacyRequestStore,
  privacyDeadline,
  privacyRequestAuthorized,
} from '../src/enterprise/privacyRequests.js';
import { FileBillingLedger } from '../src/metering/billingLedger.js';
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

test('privacy deadline defaults track GDPR and CCPA response windows', () => {
  const receivedAt = new Date('2026-05-17T00:00:00.000Z');
  assert.deepEqual(privacyDeadline('gdpr', receivedAt), {
    dueAt: '2026-06-17T00:00:00.000Z',
    extensionDueAt: '2026-08-17T00:00:00.000Z',
    basis: 'gdpr-article-12',
  });
  assert.deepEqual(privacyDeadline('ccpa', receivedAt), {
    dueAt: '2026-07-01T00:00:00.000Z',
    extensionDueAt: '2026-08-15T00:00:00.000Z',
    basis: 'ccpa-45-day',
  });
});

test('privacy request intake returns requester status token without exposing raw emails publicly', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-privacy-requests-'));
  try {
    const privacyRequestStore = new FilePrivacyRequestStore(dir);
    await withServer({ privacyRequestStore, auditAdminToken: 'privacy-admin-token-0123456789' }, async (baseUrl) => {
      const create = await fetch(`${baseUrl}/v1/privacy/requests`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tenantId: 'tenant-eu',
          jurisdiction: 'gdpr',
          requestType: 'access',
          subjectType: 'adult',
          contactEmail: 'Player.One@Example.com',
          subjectEmail: 'player.one@example.com',
          notes: 'Please export my account data.',
        }),
      });

      assert.equal(create.status, 202);
      const created = await create.json() as {
        accessToken: string;
        request: { id: string; contactEmail: string; subjectEmail: string; deadlineBasis: string };
      };
      assert.match(created.accessToken, /^[A-Za-z0-9_-]{32}$/u);
      assert.equal(created.request.deadlineBasis, 'gdpr-article-12');
      assert.notEqual(created.request.contactEmail, 'player.one@example.com');
      assert.notEqual(created.request.subjectEmail, 'player.one@example.com');

      const [stored] = await privacyRequestStore.list({ tenantId: 'tenant-eu' });
      assert.ok(stored);
      assert.equal(stored.contactEmail, 'player.one@example.com');
      assert.equal(stored.subjectEmail, 'player.one@example.com');
      assert.notEqual(stored.accessTokenHash, created.accessToken);
      assert.doesNotMatch(JSON.stringify(stored), new RegExp(created.accessToken, 'u'));
      assert.equal(privacyRequestAuthorized(stored, created.accessToken), true);
      assert.equal(privacyRequestAuthorized(stored, 'wrong-token-player.one@example.com-4111111111111111'), false);
      assert.equal(privacyRequestAuthorized({
        ...stored,
        accessTokenHash: stored.accessTokenHash.slice(0, 24),
      }, created.accessToken), false);

      const status = await fetch(`${baseUrl}/v1/privacy/requests/${created.request.id}`, {
        headers: { authorization: `Bearer ${created.accessToken}` },
      });
      assert.equal(status.status, 200);
      const publicStatus = await status.json() as { status: string; contactEmail: string };
      assert.equal(publicStatus.status, 'received');
      assert.notEqual(publicStatus.contactEmail, 'player.one@example.com');

      const wrongToken = await fetch(`${baseUrl}/v1/privacy/requests/${created.request.id}`, {
        headers: { authorization: 'Bearer wrong-token-player.one@example.com-4111111111111111' },
      });
      assert.equal(wrongToken.status, 404);
      assert.doesNotMatch(await wrongToken.text(), /player\.one@example\.com|4111111111111111/u);
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('privacy request admin can list and update request status', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-privacy-admin-'));
  try {
    const privacyRequestStore = new FilePrivacyRequestStore(dir);
    await withServer({ privacyRequestStore, auditAdminToken: 'privacy-admin-token-0123456789' }, async (baseUrl) => {
      const create = await fetch(`${baseUrl}/v1/privacy/requests`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tenantId: 'tenant-ca',
          jurisdiction: 'ccpa',
          requestType: 'delete',
          subjectType: 'authorized-agent',
          contactEmail: 'agent@example.org',
          subjectEmail: 'consumer@example.org',
        }),
      });
      const created = await create.json() as { request: { id: string } };

      const unauthenticated = await fetch(`${baseUrl}/v1/privacy/requests?tenantId=tenant-ca`);
      assert.equal(unauthenticated.status, 401);

      const list = await fetch(`${baseUrl}/v1/privacy/requests?tenantId=tenant-ca`, {
        headers: { authorization: 'Bearer privacy-admin-token-0123456789' },
      });
      assert.equal(list.status, 200);
      const listed = await list.json() as { requests: Array<{ id: string; contactEmail: string; status: string }> };
      assert.equal(listed.requests.length, 1);
      assert.equal(listed.requests[0]?.contactEmail, 'agent@example.org');

      const update = await fetch(`${baseUrl}/v1/privacy/requests/${created.request.id}`, {
        method: 'PATCH',
        headers: {
          authorization: 'Bearer privacy-admin-token-0123456789',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ status: 'in-progress', note: 'Identity verification passed.' }),
      });
      assert.equal(update.status, 200);
      const updated = await update.json() as { status: string; timeline: Array<{ actorId: string; status: string; note?: string }> };
      assert.equal(updated.status, 'in-progress');
      assert.equal(updated.timeline.at(-1)?.actorId, 'token-admin');
      assert.equal(updated.timeline.at(-1)?.note, 'Identity verification passed.');
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('privacy fulfillment package gathers account, billing, audit, and request evidence', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-privacy-fulfillment-'));
  try {
    const privacyRequestStore = new FilePrivacyRequestStore(path.join(dir, 'privacy'));
    const scimStore = new ScimUserStore(path.join(dir, 'scim'));
    const billingLedger = new FileBillingLedger(path.join(dir, 'billing'));
    const auditLog = new FileAuditLog(path.join(dir, 'audit'));
    await scimStore.create({
      userName: 'player.one@example.com',
      displayName: 'Player One',
      emails: [{ value: 'player.one@example.com', primary: true }],
    }, 'https://cloud.greybox.test');
    await billingLedger.appendUsage({
      id: 'usage-1',
      tenantId: 'tenant-eu',
      userId: 'user-1',
      projectId: 'project-1',
      provider: 'openai',
      model: 'gpt-4.1-mini',
      inputTokens: 10,
      outputTokens: 4,
      inputCostUsd: 0.001,
      outputCostUsd: 0.002,
      createdAt: '2026-05-17T00:00:00.000Z',
    });
    await auditLog.append({
      id: 'audit-privacy-test',
      tenantId: 'tenant-eu',
      actorId: 'user-1',
      actorType: 'user',
      action: 'inference.completed',
      targetType: 'project',
      targetId: 'project-1',
      createdAt: '2026-05-17T00:00:00.000Z',
    });

    await withServer({
      privacyRequestStore,
      scimStore,
      billingLedger,
      auditLog,
      auditAdminToken: 'privacy-admin-token-0123456789',
    }, async (baseUrl) => {
      const create = await fetch(`${baseUrl}/v1/privacy/requests`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tenantId: 'tenant-eu',
          jurisdiction: 'gdpr',
          requestType: 'delete',
          subjectType: 'adult',
          contactEmail: 'player.one@example.com',
          subjectEmail: 'player.one@example.com',
        }),
      });
      const created = await create.json() as { request: { id: string }; accessToken: string };

      const unauthenticated = await fetch(`${baseUrl}/v1/privacy/requests/${created.request.id}/fulfillment-package`);
      assert.equal(unauthenticated.status, 401);

      const response = await fetch(`${baseUrl}/v1/privacy/requests/${created.request.id}/fulfillment-package`, {
        headers: { authorization: 'Bearer privacy-admin-token-0123456789' },
      });
      assert.equal(response.status, 200);
      const pkg = await response.json() as {
        requestType: string;
        subjectEmails: string[];
        sources: Array<{ id: string; action: string; matchCount: number; records?: unknown[] }>;
        recommendedActions: string[];
      };
      assert.equal(pkg.requestType, 'delete');
      assert.deepEqual(pkg.subjectEmails, ['player.one@example.com']);
      assert.equal(pkg.sources.find((source) => source.id === 'privacy-requests')?.matchCount, 1);
      assert.equal(pkg.sources.find((source) => source.id === 'scim-users')?.matchCount, 1);
      assert.equal(pkg.sources.find((source) => source.id === 'billing-ledger')?.matchCount, 1);
      assert.equal(pkg.sources.find((source) => source.id === 'audit-log')?.matchCount, 1);
      assert.equal(pkg.sources.find((source) => source.id === 'scim-users')?.action, 'delete-review');
      assert.ok(pkg.recommendedActions.some((action) => /legal, billing, security/u.test(action)));
      assert.doesNotMatch(JSON.stringify(pkg), new RegExp(created.accessToken, 'u'));
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('privacy request intake enforces parent contact for child requests and fails closed without storage', async () => {
  await withServer({}, async (baseUrl) => {
    const unavailable = await fetch(`${baseUrl}/v1/privacy/requests`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        requestType: 'parental-review',
        contactEmail: 'parent@example.org',
      }),
    });
    assert.equal(unavailable.status, 503);
  });

  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-privacy-child-'));
  try {
    const privacyRequestStore = new FilePrivacyRequestStore(dir);
    await withServer({ privacyRequestStore }, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/v1/privacy/requests`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          requestType: 'parental-delete',
          contactEmail: 'parent@example.org',
        }),
      });
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'parent_email_required' });
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
