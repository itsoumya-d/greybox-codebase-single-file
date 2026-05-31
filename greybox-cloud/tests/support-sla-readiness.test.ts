// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import type http from 'node:http';
import test from 'node:test';
import {
  buildSupportSlaReadinessReport,
  formatSupportSlaReadinessMarkdown,
  supportSlaTicketsFromEnv,
  type SupportSlaTicketInput,
} from '../src/enterprise/supportSlaReadiness.js';
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

function ticket(overrides: Partial<SupportSlaTicketInput> = {}): SupportSlaTicketInput {
  return {
    id: 'SUP-1',
    productArea: 'unity-plugin',
    severity: 'sev3',
    customerTier: 'indie',
    status: 'closed',
    channel: 'portal',
    createdAt: '2026-05-17T00:00:00.000Z',
    firstResponseAt: '2026-05-17T02:00:00.000Z',
    resolvedAt: '2026-05-18T00:00:00.000Z',
    owner: 'support-lead',
    ...overrides,
  };
}

function passingTickets(): SupportSlaTicketInput[] {
  return [
    ticket({
      id: 'SUP-001',
      severity: 'sev1',
      customerTier: 'enterprise',
      createdAt: '2026-05-16T00:00:00.000Z',
      firstResponseAt: '2026-05-16T00:30:00.000Z',
      resolvedAt: '2026-05-16T20:00:00.000Z',
      owner: 'csm-enterprise',
      escalationOwner: 'founder',
      postmortemUrl: 'https://status.greybox.studio/incidents/unity-import-sev1?token=secret',
    }),
    ticket({ id: 'SUP-002', severity: 'sev2', customerTier: 'studio', firstResponseAt: '2026-05-17T01:00:00.000Z', resolvedAt: '2026-05-18T00:00:00.000Z', owner: 'support-lead' }),
    ticket({ id: 'SUP-003', productArea: 'cloud', severity: 'sev2', customerTier: 'enterprise', firstResponseAt: '2026-05-17T01:30:00.000Z', resolvedAt: '2026-05-18T10:00:00.000Z', owner: 'infra-lead' }),
    ticket({ id: 'SUP-004', productArea: 'marketplace', severity: 'sev3', customerTier: 'studio' }),
    ticket({ id: 'SUP-005', productArea: 'playtest', severity: 'sev3', customerTier: 'indie' }),
    ticket({ id: 'SUP-006', productArea: 'pro-module', severity: 'sev4', customerTier: 'indie', firstResponseAt: '2026-05-17T06:00:00.000Z', resolvedAt: '2026-05-18T06:00:00.000Z' }),
    ticket({ id: 'SUP-007', productArea: 'billing', severity: 'sev4', customerTier: 'studio', firstResponseAt: '2026-05-17T04:00:00.000Z', resolvedAt: '2026-05-18T04:00:00.000Z' }),
    ticket({ id: 'SUP-008', productArea: 'unity-plugin', severity: 'sev3', customerTier: 'enterprise', status: 'pending-customer', createdAt: '2026-05-17T22:00:00.000Z', firstResponseAt: '2026-05-17T23:00:00.000Z', resolvedAt: undefined }),
    ticket({ id: 'SUP-009', productArea: 'other', severity: 'sev4', customerTier: 'free', firstResponseAt: '2026-05-17T08:00:00.000Z', resolvedAt: '2026-05-18T08:00:00.000Z' }),
    ticket({ id: 'SUP-010', productArea: 'unity-plugin', severity: 'sev4', customerTier: 'indie', firstResponseAt: '2026-05-17T12:00:00.000Z', resolvedAt: '2026-05-18T12:00:00.000Z' }),
  ];
}

test('support SLA readiness passes with ticket-level Unity and enterprise support evidence', () => {
  const report = buildSupportSlaReadinessReport({
    now: new Date('2026-05-18T00:00:00.000Z'),
    tickets: passingTickets(),
  });

  assert.equal(report.summary.status, 'pass');
  assert.equal(report.summary.readyForUnityVerifiedSolution, true);
  assert.equal(report.summary.readyForEnterprisePilots, true);
  assert.equal(report.summary.totalTickets, 10);
  assert.equal(report.summary.openUnityBlockers, 0);
  assert.equal(report.summary.enterpriseHighSeverityBreaches, 0);
  assert.equal(report.summary.missingSev1Postmortems, 0);
  assert.equal(report.summary.firstResponseCompliancePct, 100);
  assert.equal(report.summary.resolutionCompliancePct, 100);
  assert.equal(report.tickets[0]?.postmortemUrl, 'https://status.greybox.studio/incidents/unity-import-sev1');
});

test('support SLA readiness fails on missing evidence, Unity blockers, and enterprise breaches', () => {
  const empty = buildSupportSlaReadinessReport({ now: new Date('2026-05-18T00:00:00.000Z') });
  assert.equal(empty.summary.status, 'fail');
  assert.equal(empty.checks.find((check) => check.id === 'ticket-evidence-volume')?.status, 'fail');

  const report = buildSupportSlaReadinessReport({
    now: new Date('2026-05-18T00:00:00.000Z'),
    tickets: [
      ticket({
        id: 'SUP-BLOCKER',
        severity: 'sev2',
        customerTier: 'enterprise',
        status: 'open',
        createdAt: '2026-05-10T00:00:00.000Z',
        firstResponseAt: undefined,
        resolvedAt: undefined,
        owner: undefined,
      }),
    ],
  });

  assert.equal(report.summary.status, 'fail');
  assert.equal(report.summary.openUnityBlockers, 1);
  assert.equal(report.summary.enterpriseHighSeverityBreaches, 1);
  assert.equal(report.checks.find((check) => check.id === 'high-severity-ownership')?.status, 'fail');
});

test('support SLA env parser sanitizes records and ignores malformed payloads', () => {
  assert.deepEqual(supportSlaTicketsFromEnv({ GREYBOX_SUPPORT_SLA_JSON: 'nope' }), []);
  const parsed = supportSlaTicketsFromEnv({
    GREYBOX_SUPPORT_SLA_JSON: JSON.stringify({
      tickets: [
        {
          id: 'SUP-PII',
          productArea: 'unity-plugin',
          severity: 'sev3',
          customerTier: 'studio',
          status: 'closed',
          channel: 'portal',
          createdAt: '2026-05-17T00:00:00.000Z',
          firstResponseAt: '2026-05-17T01:00:00.000Z',
          resolvedAt: '2026-05-18T00:00:00.000Z',
          owner: 'designer@example.com',
          rawBody: 'do not keep',
        },
        { id: 'missing-date', severity: 'sev4' },
      ],
    }),
  });

  assert.equal(parsed.length, 1);
  const report = buildSupportSlaReadinessReport({ tickets: parsed });
  assert.doesNotMatch(JSON.stringify(report), /designer@example\.com|rawBody/u);
});

test('support SLA markdown is concise and secret-safe', () => {
  const markdown = formatSupportSlaReadinessMarkdown(buildSupportSlaReadinessReport({
    now: new Date('2026-05-18T00:00:00.000Z'),
    tickets: passingTickets(),
  }));

  assert.match(markdown, /Greybox Support SLA Readiness/u);
  assert.match(markdown, /Unity Verified Solution support-ready: yes/u);
  assert.match(markdown, /\| Unity plugin blockers \| pass \| 0 open blocker\(s\)/u);
  assert.doesNotMatch(markdown, /token=secret|designer@example\.com|rawBody/u);
});

test('support SLA endpoint is admin protected and supports markdown', async () => {
  await withServer({
    auditAdminToken: 'support-admin-token-0123456789abcdef',
    supportSlaTickets: passingTickets(),
  }, async (baseUrl) => {
    const denied = await fetch(`${baseUrl}/v1/enterprise/support-sla-readiness`);
    assert.equal(denied.status, 401);

    const response = await fetch(`${baseUrl}/v1/enterprise/support-sla-readiness`, {
      headers: { authorization: 'Bearer support-admin-token-0123456789abcdef' },
    });
    assert.equal(response.status, 200);
    const report = await response.json() as { summary: { readyForUnityVerifiedSolution: boolean; totalTickets: number } };
    assert.equal(report.summary.readyForUnityVerifiedSolution, true);
    assert.equal(report.summary.totalTickets, 10);
    assert.doesNotMatch(JSON.stringify(report), /support-admin-token/u);

    const markdown = await fetch(`${baseUrl}/v1/enterprise/support-sla-readiness?format=markdown`, {
      headers: { authorization: 'Bearer support-admin-token-0123456789abcdef' },
    });
    assert.equal(markdown.status, 200);
    assert.match(markdown.headers.get('content-type') ?? '', /text\/markdown/u);
    assert.match(await markdown.text(), /Support SLA Readiness/u);
  });
});
