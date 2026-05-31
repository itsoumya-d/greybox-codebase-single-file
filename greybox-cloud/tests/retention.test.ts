// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import type http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { FileAuditLog } from '../src/enterprise/auditLog.js';
import {
  buildRetentionReport,
  defaultRetentionPolicies,
  FileLegalHoldStore,
} from '../src/enterprise/retention.js';
import { FilePrivacyRequestStore } from '../src/enterprise/privacyRequests.js';
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

test('default retention policies cover deletion and documented exceptions', () => {
  assert.ok(defaultRetentionPolicies.some((policy) => (
    policy.dataset === 'project-artifacts'
    && policy.defaultAction === 'delete'
    && policy.retentionDays === 30
  )));
  assert.ok(defaultRetentionPolicies.some((policy) => (
    policy.dataset === 'billing-ledger'
    && policy.defaultAction === 'retain'
    && policy.basis === 'tax-accounting'
  )));
  assert.ok(defaultRetentionPolicies.some((policy) => policy.dataset === 'audit-log' && policy.basis === 'security-audit'));
});

test('retention report blocks deletion when an active legal hold exists', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-retention-report-'));
  try {
    const legalHoldStore = new FileLegalHoldStore(dir);
    const reportBefore = await buildRetentionReport({ tenantId: 'tenant-retention', legalHoldStore });
    assert.equal(reportBefore.deletionBlocked, false);

    await legalHoldStore.create({
      tenantId: 'tenant-retention',
      title: 'Litigation hold',
      reason: 'Preserve project and audit records for counsel review.',
      datasets: ['project-artifacts', 'audit-log'],
      projectIds: ['project-1'],
    }, 'privacy-admin', new Date('2026-05-17T00:00:00.000Z'));

    const reportAfter = await buildRetentionReport({ tenantId: 'tenant-retention', legalHoldStore });
    assert.equal(reportAfter.deletionBlocked, true);
    assert.equal(reportAfter.activeLegalHolds.length, 1);
    assert.deepEqual(reportAfter.activeLegalHolds[0]?.datasets, ['project-artifacts', 'audit-log']);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('legal hold endpoints are admin protected and audit sanitized changes', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-legal-holds-'));
  try {
    const legalHoldStore = new FileLegalHoldStore(path.join(dir, 'holds'));
    const auditLog = new FileAuditLog(path.join(dir, 'audit'));
    const token = 'privacy-admin-token-0123456789';
    await withServer({ legalHoldStore, auditLog, auditAdminToken: token }, async (baseUrl) => {
      const unauthenticated = await fetch(`${baseUrl}/v1/enterprise/legal-holds?tenantId=tenant-retention`);
      assert.equal(unauthenticated.status, 401);

      const secretPhrase = 'SECRET_CASE_NAME_DO_NOT_LOG';
      const create = await fetch(`${baseUrl}/v1/enterprise/legal-holds`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          tenantId: 'tenant-retention',
          title: 'Counsel hold',
          reason: `Preserve records for counsel. ${secretPhrase}`,
          datasets: ['project-artifacts', 'audit-log'],
          projectIds: ['project-1'],
          userIds: ['user-1'],
          expiresAt: '2026-08-17T00:00:00.000Z',
        }),
      });
      assert.equal(create.status, 201);
      const created = await create.json() as { id: string; status: string; datasets: string[] };
      assert.equal(created.status, 'active');
      assert.deepEqual(created.datasets, ['project-artifacts', 'audit-log']);

      const report = await fetch(`${baseUrl}/v1/enterprise/retention-report?tenantId=tenant-retention`, {
        headers: { authorization: `Bearer ${token}` },
      });
      assert.equal(report.status, 200);
      const body = await report.json() as { deletionBlocked: boolean; activeLegalHolds: unknown[] };
      assert.equal(body.deletionBlocked, true);
      assert.equal(body.activeLegalHolds.length, 1);

      const release = await fetch(`${baseUrl}/v1/enterprise/legal-holds/${created.id}`, {
        method: 'PATCH',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ status: 'released', note: 'Counsel released the hold.' }),
      });
      assert.equal(release.status, 200);
      const released = await release.json() as { status: string; releasedAt?: string };
      assert.equal(released.status, 'released');
      assert.ok(released.releasedAt);

      const auditEntries = [
        ...await auditLog.readEntries({ action: 'retention.legal_hold_created' }),
        ...await auditLog.readEntries({ action: 'retention.legal_hold_updated' }),
      ];
      assert.equal(auditEntries.length, 2);
      assert.equal(auditEntries[0]?.tenantId, 'tenant-retention');
      assert.equal(auditEntries[0]?.metadata?.datasetCount, 2);
      assert.doesNotMatch(JSON.stringify(auditEntries), new RegExp(secretPhrase, 'u'));
      assert.doesNotMatch(JSON.stringify(auditEntries), new RegExp(token, 'u'));
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('privacy fulfillment package includes active legal hold evidence', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-retention-privacy-'));
  try {
    const privacyRequestStore = new FilePrivacyRequestStore(path.join(dir, 'privacy'));
    const legalHoldStore = new FileLegalHoldStore(path.join(dir, 'holds'));
    await legalHoldStore.create({
      tenantId: 'tenant-retention',
      title: 'Project hold',
      reason: 'Deletion blocked until dispute closes.',
      datasets: ['project-artifacts'],
    }, 'privacy-admin');

    await withServer({
      privacyRequestStore,
      legalHoldStore,
      auditAdminToken: 'privacy-admin-token-0123456789',
    }, async (baseUrl) => {
      const create = await fetch(`${baseUrl}/v1/privacy/requests`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tenantId: 'tenant-retention',
          jurisdiction: 'gdpr',
          requestType: 'delete',
          subjectType: 'adult',
          contactEmail: 'player@example.com',
        }),
      });
      const created = await create.json() as { request: { id: string } };

      const response = await fetch(`${baseUrl}/v1/privacy/requests/${created.request.id}/fulfillment-package`, {
        headers: { authorization: 'Bearer privacy-admin-token-0123456789' },
      });
      assert.equal(response.status, 200);
      const pkg = await response.json() as {
        sources: Array<{ id: string; action: string; matchCount: number; retention: string; records?: Array<{ reason?: string }> }>;
      };
      const holds = pkg.sources.find((source) => source.id === 'legal-holds');
      assert.equal(holds?.action, 'retain');
      assert.equal(holds?.matchCount, 1);
      assert.match(holds?.retention ?? '', /block deletion/u);
      assert.doesNotMatch(JSON.stringify(holds), /Deletion blocked until dispute closes/u);
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
