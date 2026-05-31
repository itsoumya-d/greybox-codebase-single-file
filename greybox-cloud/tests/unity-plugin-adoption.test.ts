// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import type http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { AuditLogEntry } from '../src/enterprise/auditLog.js';
import { FileAuditLog } from '../src/enterprise/auditLog.js';
import {
  buildUnityPluginAdoptionReport,
  formatUnityPluginAdoptionMarkdown,
  unityPluginAdoptionMetricsFromEnv,
} from '../src/enterprise/unityPluginAdoption.js';
import { licenseHash, type LicenseRecord } from '../src/routers/licenses.js';
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

function paidRecord(token: string, tier: LicenseRecord['tier'] = 'pro'): LicenseRecord {
  return {
    tokenHash: licenseHash(token, 64),
    tier,
    status: 'active',
    expiresAt: '2027-05-18T00:00:00.000Z',
  };
}

function licenseAudit(
  token: string,
  tier: string,
  overrides: Partial<AuditLogEntry> = {},
): AuditLogEntry {
  const hash = licenseHash(token);
  return {
    id: `audit-${hash}`,
    tenantId: `license:${hash}`,
    actorId: `license:${hash}`,
    actorType: 'user',
    action: 'license.validated',
    targetType: 'license',
    targetId: hash,
    createdAt: '2026-05-18T00:00:00.000Z',
    userAgent: 'UnityEditor/2022.3 GreyboxStudio',
    metadata: {
      route: '/v1/licenses/validate',
      tier,
      roundTripSync: tier === 'pro' || tier === 'studio',
      mcpBridge: tier === 'pro' || tier === 'studio',
    },
    ...overrides,
  };
}

function unitySourcePacket(overrides: Record<string, unknown> = {}) {
  return {
    report: 'unity-adoption-source-proof',
    sourceReady: true,
    applicationPacketReady: true,
    releaseReadinessReady: true,
    releaseReadinessStatus: 'pass',
    evidenceTypes: [
      'asset-store-sales-export',
      'cloud-license-registry',
      'partner-portal-status',
      'real-unity-smoke-matrix',
      'support-sla-export',
    ],
    missingEvidenceTypes: [],
    blockers: [],
    ...overrides,
  };
}

test('Unity adoption report passes the Unreal and acquisition plugin gates with live adoption evidence', async () => {
  const report = await buildUnityPluginAdoptionReport({
    now: new Date('2026-05-18T00:00:00.000Z'),
    metrics: {
      assetStoreLive: true,
      unityVerifiedSolutionApplied: true,
      payingCustomers: 1_250,
      activeMonthlyLicenses: 900,
      roundTripActiveCustomers: 260,
      mcpActiveCustomers: 110,
      successfulSampleImports: 180,
      averageSampleImportSeconds: 24.5,
      p95RoundTripLatencyMs: 1_450,
      supportBlockers: 0,
      realEditorSmokeVersions: ['2022.3.74f1', '2023.2.20f1', 'Unity 6'],
      sourceAdoptionReady: true,
      sourceReleaseReadinessReady: true,
    },
  });

  assert.equal(report.summary.status, 'warn');
  assert.equal(report.summary.readyForUnrealExpansion, true);
  assert.equal(report.summary.acquisitionPluginGate, true);
  assert.equal(report.summary.readyForUnityV1Growth, true);
  assert.equal(report.checks.find((check) => check.id === 'unity-verified-solution')?.status, 'warn');
  assert.equal(report.metrics.realEditorSmokeVersions.join(','), '2022.3,2023.2,6000.0');
});

test('Unity adoption report blocks raw paid-customer scale without source proof', async () => {
  const report = await buildUnityPluginAdoptionReport({
    now: new Date('2026-05-18T00:00:00.000Z'),
    metrics: {
      assetStoreLive: true,
      payingCustomers: 1_250,
      activeMonthlyLicenses: 900,
      roundTripActiveCustomers: 260,
      mcpActiveCustomers: 110,
      successfulSampleImports: 180,
      averageSampleImportSeconds: 24.5,
      p95RoundTripLatencyMs: 1_450,
      supportBlockers: 0,
      realEditorSmokeVersions: ['2022.3.74f1', '2023.2.20f1', 'Unity 6'],
      sourceAdoptionReady: false,
    },
  });

  assert.equal(report.summary.readyForUnrealExpansion, false);
  assert.equal(report.summary.acquisitionPluginGate, false);
  assert.equal(report.summary.readyForUnityV1Growth, false);
  assert.equal(report.checks.find((check) => check.id === 'unreal-expansion-gate')?.status, 'warn');
  const acquisitionCheck = report.checks.find((check) => check.id === 'acquisition-plugin-gate');
  assert.equal(acquisitionCheck?.status, 'warn');
  assert.match(acquisitionCheck?.current ?? '', /source blocked/u);
});

test('Unity adoption report derives support blockers from support SLA tickets', async () => {
  const report = await buildUnityPluginAdoptionReport({
    now: new Date('2026-05-18T00:00:00.000Z'),
    metrics: {
      assetStoreLive: true,
      unityVerifiedSolutionApplied: true,
      payingCustomers: 1_250,
      activeMonthlyLicenses: 900,
      roundTripActiveCustomers: 260,
      mcpActiveCustomers: 110,
      successfulSampleImports: 180,
      averageSampleImportSeconds: 24.5,
      p95RoundTripLatencyMs: 1_450,
      supportBlockers: 0,
      realEditorSmokeVersions: ['2022.3.74f1', '2023.2.20f1', 'Unity 6'],
      sourceAdoptionReady: true,
      sourceReleaseReadinessReady: true,
    },
    supportSlaTickets: [{
      id: 'SUP-UNITY-BLOCKER',
      productArea: 'unity-plugin',
      severity: 'sev2',
      customerTier: 'studio',
      status: 'open',
      channel: 'asset-store',
      createdAt: '2026-05-17T00:00:00.000Z',
      firstResponseAt: '2026-05-17T01:00:00.000Z',
      owner: 'support-lead',
      blocker: true,
    }],
  });

  assert.equal(report.metrics.supportBlockers, 1);
  assert.equal(report.summary.readyForUnityV1Growth, false);
  assert.equal(report.checks.find((check) => check.id === 'support-blockers')?.status, 'warn');
});

test('Unity adoption report combines registry and audit evidence without exposing license hashes', async () => {
  const oldHash = licenseHash('gbx_pro_old_123');
  const report = await buildUnityPluginAdoptionReport({
    now: new Date('2026-05-18T00:00:00.000Z'),
    licenseRecords: [
      paidRecord('gbx_indie_registry_1', 'indie'),
      paidRecord('gbx_pro_registry_2', 'pro'),
      paidRecord('gbx_studio_registry_3', 'studio'),
      { ...paidRecord('gbx_pro_expired_4', 'pro'), expiresAt: '2026-01-01T00:00:00.000Z' },
      { ...paidRecord('gbx_free_registry_5', 'free-personal'), tier: 'free-personal' },
    ],
    auditEntries: [
      licenseAudit('gbx_pro_active_1', 'pro'),
      licenseAudit('gbx_studio_active_2', 'studio'),
      licenseAudit('gbx_indie_active_3', 'indie'),
      licenseAudit('gbx_free_active_4', 'free-personal'),
      licenseAudit('gbx_pro_old_123', 'pro', { createdAt: '2026-03-01T00:00:00.000Z' }),
    ],
  });

  assert.equal(report.sources.registryRecords, 5);
  assert.equal(report.sources.registryPaidLicenses, 3);
  assert.equal(report.sources.registryRoundTripLicenses, 2);
  assert.equal(report.sources.auditLicenseValidations, 4);
  assert.equal(report.sources.auditActivePaidLicenses, 3);
  assert.equal(report.sources.auditRoundTripLicenses, 2);
  assert.equal(report.sources.auditMcpLicenses, 2);
  assert.equal(report.metrics.payingCustomers, 3);
  assert.equal(report.metrics.activeMonthlyLicenses, 3);
  assert.doesNotMatch(JSON.stringify(report), new RegExp(oldHash, 'u'));
  assert.doesNotMatch(JSON.stringify(report), /gbx_pro_active_1|gbx_pro_registry_2/u);
});

test('Unity adoption env parser sanitizes metrics and ignores malformed JSON', () => {
  assert.deepEqual(unityPluginAdoptionMetricsFromEnv({ GREYBOX_UNITY_ADOPTION_JSON: 'nope' }), {});
  assert.deepEqual(unityPluginAdoptionMetricsFromEnv({
    GREYBOX_UNITY_ADOPTION_JSON: JSON.stringify({
      assetStoreLive: true,
      payingCustomers: 250,
      activeMonthlyLicenses: -1,
      p95RoundTripLatencyMs: 1_800,
      realEditorSmokeVersions: ['2022.3.74f1', 'Unity 6', 'bad'],
      sourceAdoptionReady: true,
      source: unitySourcePacket(),
      customerEmail: 'do-not-return@example.com',
    }),
  }), {
    assetStoreLive: true,
    payingCustomers: 250,
    p95RoundTripLatencyMs: 1_800,
    realEditorSmokeVersions: ['2022.3', '6000.0'],
    sourceAdoptionReady: true,
    sourceReleaseReadinessReady: true,
  });
});

test('Unity adoption env parser rejects raw source-ready claims without source proof', () => {
  assert.deepEqual(unityPluginAdoptionMetricsFromEnv({
    GREYBOX_UNITY_ADOPTION_JSON: JSON.stringify({
      assetStoreLive: true,
      payingCustomers: 250,
      sourceAdoptionReady: true,
      sourceReleaseReadinessReady: true,
      source: { releaseReadinessReady: true },
    }),
  }), {
    assetStoreLive: true,
    payingCustomers: 250,
    sourceAdoptionReady: false,
    sourceReleaseReadinessReady: false,
  });
});

test('Unity adoption env parser rejects incomplete source proof packets', () => {
  assert.deepEqual(unityPluginAdoptionMetricsFromEnv({
    GREYBOX_UNITY_ADOPTION_JSON: JSON.stringify({
      assetStoreLive: true,
      payingCustomers: 250,
      sourceAdoptionReady: true,
      source: unitySourcePacket({
        sourceReady: true,
        missingEvidenceTypes: ['real-unity-smoke-matrix'],
      }),
    }),
  }), {
    assetStoreLive: true,
    payingCustomers: 250,
    sourceAdoptionReady: false,
    sourceReleaseReadinessReady: true,
  });
});

test('Unity adoption report rejects source-ready claims without release readiness proof', async () => {
  const report = await buildUnityPluginAdoptionReport({
    now: new Date('2026-05-18T00:00:00.000Z'),
    metrics: {
      assetStoreLive: true,
      payingCustomers: 1_250,
      activeMonthlyLicenses: 900,
      roundTripActiveCustomers: 260,
      mcpActiveCustomers: 110,
      successfulSampleImports: 180,
      averageSampleImportSeconds: 24.5,
      p95RoundTripLatencyMs: 1_450,
      supportBlockers: 0,
      realEditorSmokeVersions: ['2022.3.74f1', '2023.2.20f1', 'Unity 6'],
      sourceAdoptionReady: true,
      sourceReleaseReadinessReady: false,
    },
  });

  assert.equal(report.metrics.sourceAdoptionReady, false);
  assert.equal(report.metrics.sourceReleaseReadinessReady, false);
  assert.equal(report.summary.readyForUnrealExpansion, false);
  assert.equal(report.summary.acquisitionPluginGate, false);
  assert.match(report.checks.find((check) => check.id === 'acquisition-plugin-gate')?.current ?? '', /release blocked/u);
});

test('Unity adoption markdown is concise and secret-safe', async () => {
  const markdown = formatUnityPluginAdoptionMarkdown(await buildUnityPluginAdoptionReport({
    metrics: {
      payingCustomers: 100,
      activeMonthlyLicenses: 42,
      roundTripActiveCustomers: 22,
      mcpActiveCustomers: 11,
      realEditorSmokeVersions: ['2022.3.74f1'],
      sourceAdoptionReady: true,
      sourceReleaseReadinessReady: true,
    },
    now: new Date('2026-05-18T00:00:00.000Z'),
  }));

  assert.match(markdown, /Greybox Unity Plugin Adoption/u);
  assert.match(markdown, /Ready for Unreal expansion: no/u);
  assert.match(markdown, /\| Unity paid customer scale \| warn \| 100 paying customer\(s\)/u);
  assert.doesNotMatch(markdown, /token|licenseHash|gbx_/iu);
});

test('Unity adoption endpoint is admin protected and supports markdown', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-unity-adoption-'));
  try {
    const auditLog = new FileAuditLog(dir);
    await auditLog.append(licenseAudit('gbx_pro_endpoint_1', 'pro'));

    await withServer({
      auditAdminToken: 'unity-adoption-admin-0123456789abcdef',
      auditLog,
      licenseRecords: [paidRecord('gbx_pro_registry_endpoint_1', 'pro')],
      unityAdoptionMetrics: {
        payingCustomers: 125,
        activeMonthlyLicenses: 80,
        roundTripActiveCustomers: 40,
        mcpActiveCustomers: 12,
        successfulSampleImports: 8,
        averageSampleImportSeconds: 26,
        p95RoundTripLatencyMs: 1_700,
        realEditorSmokeVersions: ['2022.3.74f1', '2023.2.20f1'],
        sourceAdoptionReady: true,
        sourceReleaseReadinessReady: true,
      },
    }, async (baseUrl) => {
      const denied = await fetch(`${baseUrl}/v1/strategy/unity-plugin-adoption`);
      assert.equal(denied.status, 401);

      const response = await fetch(`${baseUrl}/v1/strategy/unity-plugin-adoption`, {
        headers: { authorization: 'Bearer unity-adoption-admin-0123456789abcdef' },
      });
      assert.equal(response.status, 200);
      const report = await response.json() as {
        metrics: { payingCustomers: number };
        sources: { auditActivePaidLicenses: number };
        summary: { readyForUnrealExpansion: boolean };
      };
      assert.equal(report.metrics.payingCustomers, 125);
      assert.equal(report.sources.auditActivePaidLicenses, 1);
      assert.equal(report.summary.readyForUnrealExpansion, false);
      assert.doesNotMatch(JSON.stringify(report), /unity-adoption-admin|gbx_pro_endpoint_1/u);

      const markdown = await fetch(`${baseUrl}/v1/strategy/unity-plugin-adoption?format=markdown`, {
        headers: { authorization: 'Bearer unity-adoption-admin-0123456789abcdef' },
      });
      assert.equal(markdown.status, 200);
      assert.match(markdown.headers.get('content-type') ?? '', /text\/markdown/u);
      assert.match(await markdown.text(), /Unity Plugin Adoption/u);
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
