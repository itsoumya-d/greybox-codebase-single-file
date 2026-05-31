// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import type http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { FileAuditLog } from '../src/enterprise/auditLog.js';
import {
  FileSecurityIncidentStore,
  incidentRegulatoryClocks,
} from '../src/enterprise/incidents.js';
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

test('incident regulatory clocks default to the GDPR Article 33 72-hour timer', () => {
  const [clock] = incidentRegulatoryClocks({
    personalDataBreach: true,
    gdprRiskAssessment: 'likely',
    awareAt: '2026-05-17T00:00:00.000Z',
    now: new Date('2026-05-17T12:00:00.000Z'),
  });
  assert.equal(clock?.basis, 'gdpr-article-33-72-hour');
  assert.equal(clock?.dueAt, '2026-05-20T00:00:00.000Z');
  assert.equal(clock?.status, 'pending');

  const unlikely = incidentRegulatoryClocks({
    personalDataBreach: true,
    gdprRiskAssessment: 'unlikely',
    awareAt: '2026-05-17T00:00:00.000Z',
    now: new Date('2026-05-17T12:00:00.000Z'),
  });
  assert.deepEqual(unlikely, []);
});

test('incident endpoints are admin protected and fail closed without durable storage', async () => {
  await withServer({ auditAdminToken: 'security-admin-token-0123456789' }, async (baseUrl) => {
    const unauthenticated = await fetch(`${baseUrl}/v1/enterprise/incidents`);
    assert.equal(unauthenticated.status, 401);
    assert.deepEqual(await unauthenticated.json(), { error: 'security_admin_required' });

    const unavailable = await fetch(`${baseUrl}/v1/enterprise/incidents`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer security-admin-token-0123456789',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ tenantId: 'tenant-sec', title: 'Test incident' }),
    });
    assert.equal(unavailable.status, 503);
    assert.deepEqual(await unavailable.json(), { error: 'security_incident_store_not_configured' });
  });
});

test('incident workflow records GDPR breach clocks and sanitized audit events', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-security-incidents-'));
  try {
    const incidentStore = new FileSecurityIncidentStore(path.join(dir, 'incidents'));
    const auditLog = new FileAuditLog(path.join(dir, 'audit'));
    const token = 'security-admin-token-0123456789';
    await withServer({ incidentStore, auditLog, auditAdminToken: token }, async (baseUrl) => {
      const create = await fetch(`${baseUrl}/v1/enterprise/incidents`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          'user-agent': 'greybox-test',
        },
        body: JSON.stringify({
          tenantId: 'tenant-sec',
          title: 'EU audit log exposure',
          summary: 'Responder pasted secret gbx_live_secret_123 into the initial ticket.',
          severity: 'sev2',
          category: 'data-breach',
          detectedAt: '2026-05-17T00:15:00.000Z',
          awareAt: '2026-05-17T00:30:00.000Z',
          personalDataBreach: true,
          gdprRiskAssessment: 'likely',
          affectedTenantIds: ['tenant-sec', 'tenant-sec'],
          dataCategories: ['email', 'audit metadata'],
        }),
      });
      assert.equal(create.status, 201);
      const created = await create.json() as {
        id: string;
        dataSubjectNoticeRequired: boolean;
        regulatoryClocks: Array<{ dueAt: string; basis: string }>;
        containmentTasks: Array<{ id: string; status: string }>;
      };
      assert.equal(created.dataSubjectNoticeRequired, false);
      assert.equal(created.regulatoryClocks[0]?.basis, 'gdpr-article-33-72-hour');
      assert.equal(created.regulatoryClocks[0]?.dueAt, '2026-05-20T00:30:00.000Z');
      assert.ok(created.containmentTasks.some((task) => task.id === 'legal-review' && task.status === 'open'));

      const list = await fetch(`${baseUrl}/v1/enterprise/incidents?tenantId=tenant-sec`, {
        headers: { authorization: `Bearer ${token}` },
      });
      assert.equal(list.status, 200);
      const listed = await list.json() as { incidents: Array<{ id: string }> };
      assert.deepEqual(listed.incidents.map((incident) => incident.id), [created.id]);

      const update = await fetch(`${baseUrl}/v1/enterprise/incidents/${created.id}`, {
        method: 'PATCH',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          status: 'contained',
          gdprRiskAssessment: 'high',
          containmentTasks: [
            { id: 'contain-access', title: 'Token revoked and affected session store rotated', status: 'done' },
          ],
          note: 'Containment completed; counsel review started.',
        }),
      });
      assert.equal(update.status, 200);
      const updated = await update.json() as {
        status: string;
        dataSubjectNoticeRequired: boolean;
        timeline: Array<{ actorId: string; action: string; note?: string }>;
      };
      assert.equal(updated.status, 'contained');
      assert.equal(updated.dataSubjectNoticeRequired, true);
      assert.equal(updated.timeline.at(-1)?.actorId, 'token-admin');
      assert.equal(updated.timeline.at(-1)?.note, 'Containment completed; counsel review started.');

      const opened = await auditLog.readEntries({ action: 'security.incident_opened' });
      const changed = await auditLog.readEntries({ action: 'security.incident_updated' });
      assert.equal(opened.length, 1);
      assert.equal(changed.length, 1);
      assert.equal(opened[0]?.tenantId, 'tenant-sec');
      assert.equal(opened[0]?.metadata?.affectedTenantCount, 1);
      assert.doesNotMatch(JSON.stringify([...opened, ...changed]), /gbx_live_secret_123/u);
      assert.doesNotMatch(JSON.stringify([...opened, ...changed]), new RegExp(token, 'u'));
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
