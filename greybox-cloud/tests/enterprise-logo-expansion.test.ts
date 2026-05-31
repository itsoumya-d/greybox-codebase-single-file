// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import type http from 'node:http';
import test from 'node:test';
import {
  buildEnterpriseLogoExpansionReport,
  enterpriseLogoMetricsFromEnv,
  formatEnterpriseLogoExpansionMarkdown,
} from '../src/enterprise/enterpriseLogoExpansion.js';
import type { EnterpriseContractPacket } from '../src/enterprise/contractPacket.js';
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

function missionMetrics() {
  return {
    workosSsoLive: true,
    scimLive: true,
    auditExportLive: true,
    onPremBundleLive: true,
    privateNetworkingLive: true,
    dataResidencyLive: true,
    dpaMsaReady: true,
    signedEnterpriseLogos: 52,
    activeEnterpriseLogos: 50,
    qualifiedPipelineAccounts: 30,
    pilotsInProgress: 8,
    averageAcvUsd: 72_000,
    enterpriseArrUsd: 3_700_000,
    netRevenueRetention: 1.23,
    expansionArrUsd: 820_000,
    churnedEnterpriseLogos: 2,
    securityReviewsPassed: 50,
    procurementPacketsSent: 50,
    ssoEnabledLogos: 48,
    scimEnabledLogos: 35,
    auditExportEnabledLogos: 48,
    onPremEnabledLogos: 6,
    privateNetworkEnabledLogos: 7,
    dataResidencyEnabledLogos: 12,
    csmAssignedLogos: 50,
    qbrsCompletedThisQuarter: 12,
    renewalRiskLogos: 3,
    referenceableLogos: 12,
    caseStudyApprovedLogos: 5,
  };
}

function passingTrustControlReport(): TrustControlReport {
  const controls = [
    'GBX-SEC-001',
    'GBX-SEC-002',
    'GBX-OPS-001',
    'GBX-OPS-002',
    'GBX-PRI-006',
  ].map((id) => ({
    id,
    title: `${id} control`,
    frameworks: ['SOC 2 Security'],
    owner: 'Enterprise Engineering',
    status: 'implemented' as const,
    description: 'Test evidence for enterprise control proof.',
    evidence: [{
      id: `${id}-evidence`,
      label: `${id} evidence`,
      status: 'implemented' as const,
      detail: 'Implemented in test proof packet.',
    }],
  }));
  return {
    generatedAt: '2026-05-18T00:00:00.000Z',
    disclaimer: 'Readiness evidence only.',
    summary: { implemented: controls.length, partial: 0, missing: 0 },
    controls,
  };
}

function passingContractPacket(): EnterpriseContractPacket {
  return {
    generatedAt: '2026-05-18T00:00:00.000Z',
    disclaimer: 'Contract packet test evidence only.',
    summary: {
      documents: 6,
      readyToSign: 3,
      supportingEvidence: 3,
      blocked: 0,
      blockingIssues: 0,
    },
    documents: [],
    orderFormFields: [],
    signingSequence: [],
  };
}

function supportTicket(overrides: Partial<SupportSlaTicketInput> = {}): SupportSlaTicketInput {
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

function passingSupportTickets(): SupportSlaTicketInput[] {
  return [
    supportTicket({
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
    supportTicket({ id: 'SUP-002', severity: 'sev2', customerTier: 'studio', firstResponseAt: '2026-05-17T01:00:00.000Z', resolvedAt: '2026-05-18T00:00:00.000Z', owner: 'support-lead' }),
    supportTicket({ id: 'SUP-003', productArea: 'cloud', severity: 'sev2', customerTier: 'enterprise', firstResponseAt: '2026-05-17T01:30:00.000Z', resolvedAt: '2026-05-18T10:00:00.000Z', owner: 'infra-lead' }),
    supportTicket({ id: 'SUP-004', productArea: 'marketplace', severity: 'sev3', customerTier: 'studio' }),
    supportTicket({ id: 'SUP-005', productArea: 'playtest', severity: 'sev3', customerTier: 'indie' }),
    supportTicket({ id: 'SUP-006', productArea: 'pro-module', severity: 'sev4', customerTier: 'indie', firstResponseAt: '2026-05-17T06:00:00.000Z', resolvedAt: '2026-05-18T06:00:00.000Z' }),
    supportTicket({ id: 'SUP-007', productArea: 'billing', severity: 'sev4', customerTier: 'studio', firstResponseAt: '2026-05-17T04:00:00.000Z', resolvedAt: '2026-05-18T04:00:00.000Z' }),
    supportTicket({ id: 'SUP-008', productArea: 'unity-plugin', severity: 'sev3', customerTier: 'enterprise', status: 'pending-customer', createdAt: '2026-05-17T22:00:00.000Z', firstResponseAt: '2026-05-17T23:00:00.000Z', resolvedAt: undefined }),
    supportTicket({ id: 'SUP-009', productArea: 'other', severity: 'sev4', customerTier: 'free', firstResponseAt: '2026-05-17T08:00:00.000Z', resolvedAt: '2026-05-18T08:00:00.000Z' }),
    supportTicket({ id: 'SUP-010', productArea: 'unity-plugin', severity: 'sev4', customerTier: 'indie', firstResponseAt: '2026-05-17T12:00:00.000Z', resolvedAt: '2026-05-18T12:00:00.000Z' }),
  ];
}

test('enterprise logo expansion passes at 50 enterprise logos with ACV, NRR, controls, and references', () => {
  const report = buildEnterpriseLogoExpansionReport({
    metrics: missionMetrics(),
    trustControlReport: passingTrustControlReport(),
    contractPacket: passingContractPacket(),
    supportSlaTickets: passingSupportTickets(),
    now: new Date('2026-05-18T00:00:00.000Z'),
  });

  assert.equal(report.generatedAt, '2026-05-18T00:00:00.000Z');
  assert.equal(report.summary.status, 'pass');
  assert.equal(report.summary.firstFiveLogosSecured, true);
  assert.equal(report.summary.readyFor50LogoScale, true);
  assert.equal(report.summary.missionEnterpriseGate, true);
  assert.equal(report.summary.logoGapToMission, 0);
  assert.equal(report.summary.estimatedEnterpriseArrUsd, 3_700_000);
  assert.equal(report.summary.supportSlaStatus, 'pass');
  assert.equal(report.summary.enterpriseControlProofReady, true);
  assert.equal(report.summary.contractPacketReady, true);
  assert.equal(report.supportSla.readyForEnterprisePilots, true);
  assert.equal(report.checks.every((check) => check.status === 'pass'), true);
});

test('enterprise logo expansion marks five lighthouse logos as scale-ready but not mission-complete', () => {
  const report = buildEnterpriseLogoExpansionReport({
    metrics: {
      ...missionMetrics(),
      signedEnterpriseLogos: 5,
      activeEnterpriseLogos: 5,
      qualifiedPipelineAccounts: 135,
      pilotsInProgress: 5,
      averageAcvUsd: 60_000,
      enterpriseArrUsd: 300_000,
      securityReviewsPassed: 5,
      procurementPacketsSent: 5,
      ssoEnabledLogos: 5,
      scimEnabledLogos: 4,
      auditExportEnabledLogos: 5,
      onPremEnabledLogos: 1,
      privateNetworkEnabledLogos: 1,
      dataResidencyEnabledLogos: 2,
      csmAssignedLogos: 5,
      qbrsCompletedThisQuarter: 5,
      renewalRiskLogos: 0,
      referenceableLogos: 3,
      caseStudyApprovedLogos: 1,
    },
    trustControlReport: passingTrustControlReport(),
    contractPacket: passingContractPacket(),
    supportSlaTickets: passingSupportTickets(),
    now: new Date('2026-05-18T00:00:00.000Z'),
  });

  assert.equal(report.summary.status, 'warn');
  assert.equal(report.summary.firstFiveLogosSecured, true);
  assert.equal(report.summary.readyFor50LogoScale, true);
  assert.equal(report.summary.missionEnterpriseGate, false);
  assert.equal(report.summary.logoGapToMission, 45);
  assert.ok(report.checks.some((check) => check.id === 'enterprise-logo-base' && check.status === 'warn'));
});

test('enterprise logo expansion blocks 5-to-50 scale when support SLA evidence is weak', () => {
  const report = buildEnterpriseLogoExpansionReport({
    metrics: missionMetrics(),
    trustControlReport: passingTrustControlReport(),
    contractPacket: passingContractPacket(),
    supportSlaTickets: [
      supportTicket({
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
    now: new Date('2026-05-18T00:00:00.000Z'),
  });

  assert.equal(report.summary.status, 'fail');
  assert.equal(report.summary.readyFor50LogoScale, false);
  assert.equal(report.summary.missionEnterpriseGate, false);
  assert.equal(report.summary.supportSlaStatus, 'fail');
  assert.equal(report.supportSla.openUnityBlockers, 1);
  assert.ok(report.checks.some((check) => check.id === 'support-sla-scale' && check.status === 'fail'));
});

test('enterprise logo expansion rejects raw enterprise-control booleans without proof packets', () => {
  const report = buildEnterpriseLogoExpansionReport({
    metrics: missionMetrics(),
    supportSlaTickets: passingSupportTickets(),
    now: new Date('2026-05-18T00:00:00.000Z'),
  });

  assert.equal(report.summary.status, 'fail');
  assert.equal(report.summary.readyFor50LogoScale, false);
  assert.equal(report.summary.missionEnterpriseGate, false);
  assert.equal(report.summary.enterpriseControlProofReady, false);
  assert.equal(report.summary.contractPacketReady, false);
  assert.equal(report.summary.trustControlProofStatus, 'missing');
  assert.equal(report.summary.contractPacketStatus, 'missing');
  assert.ok(report.checks.some((check) => check.id === 'enterprise-tier-controls' && check.status === 'fail'));
});

test('enterprise logo expansion fails closed when enterprise evidence is missing', () => {
  const report = buildEnterpriseLogoExpansionReport({
    now: new Date('2026-05-18T00:00:00.000Z'),
  });

  assert.equal(report.summary.status, 'fail');
  assert.equal(report.summary.firstFiveLogosSecured, false);
  assert.equal(report.summary.readyFor50LogoScale, false);
  assert.equal(report.summary.missionEnterpriseGate, false);
  assert.equal(report.summary.logoGapToMission, 50);
  assert.ok(report.checks.some((check) => check.id === 'enterprise-tier-controls' && check.status === 'fail'));
  assert.ok(report.checks.some((check) => check.id === 'support-sla-scale' && check.status === 'fail'));
});

test('enterprise logo env parser returns only sanitized aggregate metrics', () => {
  assert.deepEqual(enterpriseLogoMetricsFromEnv({ GREYBOX_ENTERPRISE_LOGO_METRICS_JSON: 'nope' }), {});
  assert.deepEqual(enterpriseLogoMetricsFromEnv({
    GREYBOX_ENTERPRISE_LOGO_METRICS_JSON: JSON.stringify({
      workosSsoLive: true,
      activeEnterpriseLogos: 6,
      averageAcvUsd: 61_000,
      netRevenueRetention: 1.21,
      renewalRiskLogos: -1,
      customerNames: ['Studio A'],
      crmDealNotes: 'do-not-return',
      contactEmail: 'buyer@example.com',
      token: 'SECRET',
    }),
  }), {
    workosSsoLive: true,
    activeEnterpriseLogos: 6,
    averageAcvUsd: 61_000,
    netRevenueRetention: 1.21,
  });
});

test('enterprise logo endpoint is admin protected, markdown-capable, and secret-safe', async () => {
  const markdown = formatEnterpriseLogoExpansionMarkdown(buildEnterpriseLogoExpansionReport({
    metrics: missionMetrics(),
    trustControlReport: passingTrustControlReport(),
    contractPacket: passingContractPacket(),
    supportSlaTickets: passingSupportTickets(),
    now: new Date('2026-05-18T00:00:00.000Z'),
  }));

  assert.match(markdown, /Greybox Enterprise Logo Expansion/u);
  assert.match(markdown, /Ready for 50-logo scale: yes/u);
  assert.match(markdown, /Mission enterprise gate: yes/u);
  assert.match(markdown, /Support SLA status: pass/u);
  assert.match(markdown, /\| Enterprise tier controls \| pass/u);
  assert.doesNotMatch(markdown, /API_KEY|SECRET|TOKEN|buyer@example|do-not-return/u);

  await withServer({
    auditAdminToken: 'enterprise-logo-admin-0123456789abcdef',
    enterpriseLogoMetrics: missionMetrics(),
    trustControlReport: passingTrustControlReport(),
    enterpriseContractPacket: passingContractPacket(),
    supportSlaTickets: passingSupportTickets(),
  }, async (baseUrl) => {
    const denied = await fetch(`${baseUrl}/v1/enterprise/logo-expansion-readiness`);
    assert.equal(denied.status, 401);
    assert.deepEqual(await denied.json(), { error: 'audit_admin_required' });

    const response = await fetch(`${baseUrl}/v1/enterprise/logo-expansion-readiness`, {
      headers: { authorization: 'Bearer enterprise-logo-admin-0123456789abcdef' },
    });
    assert.equal(response.status, 200);
    const report = await response.json() as {
      summary: { missionEnterpriseGate: boolean; readyFor50LogoScale: boolean; supportSlaStatus: string };
      metrics: { activeEnterpriseLogos: number };
    };
    assert.equal(report.summary.readyFor50LogoScale, true);
    assert.equal(report.summary.missionEnterpriseGate, true);
    assert.equal(report.summary.supportSlaStatus, 'pass');
    assert.equal(report.metrics.activeEnterpriseLogos, 50);
    assert.doesNotMatch(JSON.stringify(report), /enterprise-logo-admin/u);

    const markdownResponse = await fetch(`${baseUrl}/v1/enterprise/logo-expansion-readiness?format=markdown`, {
      headers: { authorization: 'Bearer enterprise-logo-admin-0123456789abcdef' },
    });
    assert.equal(markdownResponse.status, 200);
    assert.match(markdownResponse.headers.get('content-type') ?? '', /text\/markdown/u);
    assert.match(await markdownResponse.text(), /Enterprise Logo Expansion/u);
  });
});
