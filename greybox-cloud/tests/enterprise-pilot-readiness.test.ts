// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import type http from 'node:http';
import test from 'node:test';
import {
  buildEnterprisePilotReadinessReport,
  formatEnterprisePilotReadinessMarkdown,
} from '../src/enterprise/enterprisePilotReadiness.js';
import type { EnterpriseContractPacket } from '../src/enterprise/contractPacket.js';
import { requiredEncryptionDatasets } from '../src/enterprise/encryptionReadiness.js';
import type { SupportSlaTicketInput } from '../src/enterprise/supportSlaReadiness.js';
import type { TrustControlReport } from '../src/enterprise/trustControls.js';
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

function supportTicket(overrides: Partial<SupportSlaTicketInput> = {}): SupportSlaTicketInput {
  return {
    id: 'SUP-PILOT-1',
    productArea: 'cloud',
    severity: 'sev3',
    customerTier: 'studio',
    status: 'closed',
    channel: 'portal',
    createdAt: '2026-05-16T00:00:00.000Z',
    firstResponseAt: '2026-05-16T02:00:00.000Z',
    resolvedAt: '2026-05-17T00:00:00.000Z',
    owner: 'support-lead',
    ...overrides,
  };
}

function passingSupportTickets(): SupportSlaTicketInput[] {
  return [
    supportTicket({
      id: 'SUP-PILOT-001',
      productArea: 'unity-plugin',
      severity: 'sev1',
      customerTier: 'enterprise',
      firstResponseAt: '2026-05-16T00:30:00.000Z',
      resolvedAt: '2026-05-16T18:00:00.000Z',
      escalationOwner: 'founder',
      postmortemUrl: 'https://status.greybox.studio/incidents/pilot-sev1',
    }),
    supportTicket({ id: 'SUP-PILOT-002', severity: 'sev2', customerTier: 'studio', firstResponseAt: '2026-05-16T01:00:00.000Z', resolvedAt: '2026-05-17T00:00:00.000Z' }),
    supportTicket({ id: 'SUP-PILOT-003', productArea: 'marketplace', severity: 'sev2', customerTier: 'enterprise', firstResponseAt: '2026-05-16T01:30:00.000Z', resolvedAt: '2026-05-17T06:00:00.000Z' }),
    supportTicket({ id: 'SUP-PILOT-004', productArea: 'playtest' }),
    supportTicket({ id: 'SUP-PILOT-005', productArea: 'pro-module' }),
    supportTicket({ id: 'SUP-PILOT-006', productArea: 'billing', severity: 'sev4', firstResponseAt: '2026-05-16T08:00:00.000Z', resolvedAt: '2026-05-17T08:00:00.000Z' }),
    supportTicket({ id: 'SUP-PILOT-007', productArea: 'cloud', severity: 'sev4', firstResponseAt: '2026-05-16T08:00:00.000Z', resolvedAt: '2026-05-17T08:00:00.000Z' }),
    supportTicket({ id: 'SUP-PILOT-008', productArea: 'other', severity: 'sev4', customerTier: 'free', firstResponseAt: '2026-05-16T08:00:00.000Z', resolvedAt: '2026-05-17T08:00:00.000Z' }),
    supportTicket({ id: 'SUP-PILOT-009', productArea: 'unity-plugin', severity: 'sev3', status: 'pending-customer', createdAt: '2026-05-16T23:00:00.000Z', firstResponseAt: '2026-05-16T23:30:00.000Z', resolvedAt: undefined }),
    supportTicket({ id: 'SUP-PILOT-010', productArea: 'cloud', severity: 'sev3' }),
  ];
}

function injectedTrustControlReport(): TrustControlReport {
  const controls = [
    'GBX-SEC-001',
    'GBX-SEC-002',
    'GBX-AI-001',
    'GBX-PRI-001',
    'GBX-PRI-004',
    'GBX-PRI-005',
    'GBX-OPS-001',
  ].map((id) => ({
    id,
    title: `${id} control`,
    frameworks: ['SOC 2 Security'],
    owner: 'Enterprise Engineering',
    status: 'implemented' as const,
    description: 'Injected pilot-readiness proof.',
    evidence: [{
      id: `${id}-evidence`,
      label: `${id} evidence`,
      status: 'implemented' as const,
      detail: 'Implemented in injected trust packet.',
    }],
  }));
  return {
    generatedAt: '2026-05-17T00:00:00.000Z',
    disclaimer: 'Injected trust-control evidence only.',
    summary: { implemented: controls.length, partial: 0, missing: 0 },
    controls,
  };
}

function blockedContractPacket(): EnterpriseContractPacket {
  return {
    generatedAt: '2026-05-17T00:00:00.000Z',
    disclaimer: 'Injected blocked contract packet.',
    summary: {
      documents: 3,
      readyToSign: 1,
      supportingEvidence: 0,
      blocked: 2,
      blockingIssues: 2,
    },
    documents: [],
    orderFormFields: [],
    signingSequence: [],
  };
}

function readyEncryptionEnv(): Record<string, string> {
  const regions = ['us', 'eu', 'in'];
  return {
    GREYBOX_ENCRYPTION_EVIDENCE_JSON: JSON.stringify({
      kmsProvider: 'aws-kms',
      customerManagedKeys: false,
      keyRotationDays: 90,
      regions: {
        us: { keyConfigured: true, sourceHash: 'a'.repeat(64), lastVerifiedAt: '2026-05-17T00:00:00.000Z' },
        eu: { keyConfigured: true, sourceHash: 'b'.repeat(64), lastVerifiedAt: '2026-05-17T00:00:00.000Z' },
        in: { keyConfigured: true, sourceHash: 'c'.repeat(64), lastVerifiedAt: '2026-05-17T00:00:00.000Z' },
      },
      storage: requiredEncryptionDatasets.map((dataset) => ({
        dataset,
        encrypted: true,
        regions,
        algorithm: 'aes-256-gcm',
        lastVerifiedAt: '2026-05-17T00:00:00.000Z',
      })),
      transit: {
        tlsMinVersion: '1.3',
        hstsEnabled: true,
        lastVerifiedAt: '2026-05-17T00:00:00.000Z',
      },
      backups: {
        encrypted: true,
        regions,
        lastVerifiedAt: '2026-05-17T00:00:00.000Z',
      },
      secrets: {
        manager: 'aws-secrets-manager',
        rotationDays: 90,
        lastVerifiedAt: '2026-05-17T00:00:00.000Z',
      },
    }),
  };
}

test('enterprise pilot readiness blocks launch on missing runtime evidence', async () => {
  const report = await buildEnterprisePilotReadinessReport({
    now: new Date('2026-05-17T00:00:00.000Z'),
  });

  assert.equal(report.generatedAt, '2026-05-17T00:00:00.000Z');
  assert.equal(report.readyForPilot, false);
  assert.equal(report.summary.certificationClaims, false);
  assert.equal(report.target.minimumAcvUsd, 40_000);
  assert.equal(report.target.targetAverageAcvUsd, 60_000);
  assert.deepEqual(report.target.supportedRegions, ['us', 'eu', 'in']);
  assert.equal(report.summary.fail, 2);
  assert.equal(report.summary.encryptionStatus, 'fail');
  assert.ok(report.summary.warn > 0);
  assert.equal(report.summary.supportSlaStatus, 'fail');
  assert.ok(report.checks.some((check) => check.id === 'contract-packet' && check.status === 'pass'));
  assert.ok(report.checks.some((check) => check.id === 'support-sla' && check.status === 'fail'));
  assert.ok(report.checks.some((check) => check.id === 'data-residency' && check.status === 'warn'));
  assert.ok(report.checks.some((check) => check.id === 'encryption-kms' && check.status === 'fail'));
  assert.ok(report.checks.some((check) => check.id === 'certification-roadmap' && check.status === 'warn'));
  assert.doesNotMatch(JSON.stringify(report), /API_KEY|SECRET|TOKEN/u);
});

test('enterprise pilot readiness clears the KMS gate only with passing encryption evidence', async () => {
  const report = await buildEnterprisePilotReadinessReport({
    now: new Date('2026-05-17T00:00:00.000Z'),
    encryptionEnv: readyEncryptionEnv(),
  });

  assert.equal(report.summary.encryptionStatus, 'pass');
  assert.equal(report.checks.find((check) => check.id === 'encryption-kms')?.status, 'pass');
  assert.match(report.checks.find((check) => check.id === 'encryption-kms')?.detail ?? '', /9\/9 dataset/u);
});

test('enterprise pilot readiness clears support gate only with passing support SLA evidence', async () => {
  const report = await buildEnterprisePilotReadinessReport({
    now: new Date('2026-05-17T00:00:00.000Z'),
    supportSlaTickets: passingSupportTickets(),
  });

  assert.equal(report.summary.supportSlaStatus, 'pass');
  assert.equal(report.supportSla.readyForEnterprisePilots, true);
  assert.equal(report.checks.find((check) => check.id === 'support-sla')?.status, 'pass');

  const blocked = await buildEnterprisePilotReadinessReport({
    now: new Date('2026-05-17T00:00:00.000Z'),
    supportSlaTickets: [supportTicket({
      id: 'SUP-PILOT-BLOCKED',
      productArea: 'unity-plugin',
      severity: 'sev2',
      customerTier: 'enterprise',
      status: 'open',
      createdAt: '2026-05-10T00:00:00.000Z',
      firstResponseAt: undefined,
      resolvedAt: undefined,
      blocker: true,
    })],
  });

  assert.equal(blocked.checks.find((check) => check.id === 'support-sla')?.status, 'fail');
  assert.equal(blocked.supportSla.enterpriseHighSeverityBreaches, 1);
});

test('enterprise pilot readiness markdown is phone-readable for sales and security', async () => {
  const markdown = formatEnterprisePilotReadinessMarkdown(await buildEnterprisePilotReadinessReport({
    now: new Date('2026-05-17T00:00:00.000Z'),
  }));

  assert.match(markdown, /# Greybox Enterprise Pilot Readiness/u);
  assert.match(markdown, /Ready for pilot: no/u);
  assert.match(markdown, /Minimum ACV: \$40,000/u);
  assert.match(markdown, /Order form\/MSA\/DPA procurement packet/u);
  assert.match(markdown, /Support SLA and escalation readiness/u);
  assert.match(markdown, /SOC 2 \/ ISO 27001 roadmap caveat/u);
});

test('enterprise pilot readiness endpoint consumes injected trust and contract proof packets', async () => {
  await withServer({
    auditAdminToken: 'pilot-admin-0123456789abcdef',
    trustControlReport: injectedTrustControlReport(),
    enterpriseContractPacket: blockedContractPacket(),
    supportSlaTickets: passingSupportTickets(),
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/enterprise/pilot-readiness`, {
      headers: { authorization: 'Bearer pilot-admin-0123456789abcdef' },
    });
    assert.equal(response.status, 200);
    const report = await response.json() as {
      readyForPilot: boolean;
      summary: { contractDocumentsReady: number };
      checks: Array<{ id: string; status: string }>;
    };

    assert.equal(report.readyForPilot, false);
    assert.equal(report.summary.contractDocumentsReady, 1);
    assert.equal(report.checks.find((check) => check.id === 'contract-packet')?.status, 'fail');
    assert.equal(report.checks.find((check) => check.id === 'identity-access')?.status, 'pass');
    assert.equal(report.checks.find((check) => check.id === 'audit-export')?.status, 'pass');
  });
});

test('enterprise pilot readiness endpoint is admin protected and supports markdown', async () => {
  await withServer({
    auditAdminToken: 'pilot-admin-0123456789abcdef',
  }, async (baseUrl) => {
    const denied = await fetch(`${baseUrl}/v1/enterprise/pilot-readiness`);
    assert.equal(denied.status, 401);
    assert.deepEqual(await denied.json(), { error: 'audit_admin_required' });

    const jsonResponse = await fetch(`${baseUrl}/v1/enterprise/pilot-readiness`, {
      headers: { authorization: 'Bearer pilot-admin-0123456789abcdef' },
    });
    assert.equal(jsonResponse.status, 200);
    const report = await jsonResponse.json() as {
      readyForPilot: boolean;
      summary: { certificationClaims: boolean; checks: number };
      target: { firstLogoTarget: number };
    };
    assert.equal(report.readyForPilot, false);
    assert.equal(report.summary.certificationClaims, false);
    assert.equal(report.summary.checks, 12);
    assert.equal(report.target.firstLogoTarget, 5);

    const markdownResponse = await fetch(`${baseUrl}/v1/enterprise/pilot-readiness?format=markdown`, {
      headers: { authorization: 'Bearer pilot-admin-0123456789abcdef' },
    });
    assert.equal(markdownResponse.status, 200);
    assert.match(markdownResponse.headers.get('content-type') ?? '', /text\/markdown/u);
    assert.match(await markdownResponse.text(), /Greybox Enterprise Pilot Readiness/u);
  });
});
