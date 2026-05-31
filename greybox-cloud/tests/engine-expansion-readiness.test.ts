// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import type http from 'node:http';
import test from 'node:test';
import {
  buildEngineExpansionReadinessReport,
  engineExpansionMetricsFromEnv,
  formatEngineExpansionReadinessMarkdown,
} from '../src/enterprise/engineExpansionReadiness.js';
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

function triEngineMetrics() {
  return {
    unityAssetStoreLive: true,
    unityVerifiedSolutionApplied: true,
    unityVerifiedSolutionAchieved: true,
    unityPayingCustomers: 1_100,
    unityRoundTripActiveCustomers: 240,
    unityMcpActiveCustomers: 90,
    unityAverageSampleImportSeconds: 24,
    unityP95RoundTripLatencyMs: 1_600,
    unitySupportBlockers: 0,
    unrealPluginStaticValidation: true,
    unrealMarketplaceSubmitted: true,
    unrealMarketplaceLive: true,
    unrealEditorSmokeVersions: ['5.3', '5.4'],
    unrealSampleImportSeconds: 27,
    unrealRoundTripFieldTypes: 5,
    unrealMcpToolsPassing: 8,
    unrealDemandSignals: 24,
    unrealSourceReady: true,
    godotAddonStaticValidation: true,
    godotAssetLibrarySubmitted: true,
    godotAssetLibraryLive: true,
    godotEditorSmokeVersions: ['4.3'],
    godotSampleImportSeconds: 22,
    godotRoundTripFieldTypes: 6,
    godotMcpToolsPassing: 8,
    godotCommunityDemandSignals: 32,
    godotSourceReady: true,
    openCoreApiDeprecationPlan: true,
    triEngineDocsReady: true,
  };
}

test('engine expansion readiness passes when Unity, Unreal, Godot, and API safety gates are met', () => {
  const report = buildEngineExpansionReadinessReport({
    metrics: triEngineMetrics(),
    now: new Date('2026-05-18T00:00:00.000Z'),
  });

  assert.equal(report.generatedAt, '2026-05-18T00:00:00.000Z');
  assert.equal(report.summary.status, 'pass');
  assert.equal(report.summary.unrealExpansionAllowed, true);
  assert.equal(report.summary.unrealV1Gate, true);
  assert.equal(report.summary.godotCommunityGate, true);
  assert.equal(report.summary.triEngineAcquisitionGate, true);
  assert.equal(report.checks.every((check) => check.status === 'pass'), true);
});

test('engine expansion readiness blocks Unreal when Unity adoption is not irreproachable', () => {
  const report = buildEngineExpansionReadinessReport({
    metrics: {
      ...triEngineMetrics(),
      unityVerifiedSolutionAchieved: false,
      unityPayingCustomers: 75,
      unityRoundTripActiveCustomers: 30,
      unityMcpActiveCustomers: 10,
      unityP95RoundTripLatencyMs: 2_500,
      unitySupportBlockers: 2,
    },
    now: new Date('2026-05-18T00:00:00.000Z'),
  });

  assert.equal(report.summary.status, 'warn');
  assert.equal(report.summary.unrealExpansionAllowed, false);
  assert.equal(report.summary.unrealV1Gate, false);
  assert.equal(report.summary.triEngineAcquisitionGate, false);
  assert.ok(report.checks.some((check) => check.id === 'unity-prerequisites' && check.status === 'warn'));
});

test('engine expansion readiness blocks raw Unreal and Godot metrics without source proof', () => {
  const report = buildEngineExpansionReadinessReport({
    metrics: {
      ...triEngineMetrics(),
      unrealSourceReady: false,
      godotSourceReady: false,
    },
    now: new Date('2026-05-18T00:00:00.000Z'),
  });

  assert.equal(report.summary.status, 'warn');
  assert.equal(report.summary.unrealExpansionAllowed, true);
  assert.equal(report.summary.unrealV1Gate, false);
  assert.equal(report.summary.godotCommunityGate, false);
  assert.equal(report.summary.triEngineAcquisitionGate, false);
  const unrealCheck = report.checks.find((check) => check.id === 'unreal-runtime-readiness');
  const godotCheck = report.checks.find((check) => check.id === 'godot-community-readiness');
  assert.equal(unrealCheck?.status, 'warn');
  assert.equal(godotCheck?.status, 'warn');
  assert.match(unrealCheck?.current ?? '', /source blocked/u);
  assert.match(godotCheck?.current ?? '', /source blocked/u);
});

test('engine expansion readiness fails closed without engine evidence', () => {
  const report = buildEngineExpansionReadinessReport({
    now: new Date('2026-05-18T00:00:00.000Z'),
  });

  assert.equal(report.summary.status, 'fail');
  assert.equal(report.summary.unrealExpansionAllowed, false);
  assert.equal(report.summary.unrealV1Gate, false);
  assert.equal(report.summary.godotCommunityGate, false);
  assert.ok(report.checks.some((check) => check.id === 'open-core-api-safety' && check.status === 'fail'));
});

test('engine expansion env parser sanitizes aggregate metrics and known editor versions only', () => {
  assert.deepEqual(engineExpansionMetricsFromEnv({ GREYBOX_ENGINE_EXPANSION_METRICS_JSON: 'nope' }), {});
  assert.deepEqual(engineExpansionMetricsFromEnv({
    GREYBOX_ENGINE_EXPANSION_METRICS_JSON: JSON.stringify({
      unityAssetStoreLive: true,
      unityPayingCustomers: 101,
      unitySupportBlockers: -1,
      unrealEditorSmokeVersions: ['5.3', '5.2', 'secret@example.com'],
      godotEditorSmokeVersions: ['4.4', '3.5'],
      openCoreApiDeprecationPlan: true,
      unrealSourceReady: true,
      godotSourceReady: true,
      partnerContactEmail: 'do-not-return@example.com',
      dealNotes: 'SECRET',
    }),
  }), {
    unityAssetStoreLive: true,
    unityPayingCustomers: 101,
    unrealEditorSmokeVersions: ['5.3'],
    godotEditorSmokeVersions: ['4.4'],
    openCoreApiDeprecationPlan: true,
  });
});

test('engine expansion env parser accepts source proof only from plugin release-readiness packets', () => {
  assert.deepEqual(engineExpansionMetricsFromEnv({
    GREYBOX_ENGINE_EXPANSION_METRICS_JSON: JSON.stringify({
      unrealPluginStaticValidation: false,
      godotAddonStaticValidation: false,
      unrealReleaseReadiness: {
        packageRoot: '/private/customer/project',
        command: 'SECRET_TOKEN=abc node Validation/release-readiness.mjs',
        cloudMetrics: {
          unrealSourceReady: true,
          unrealPluginStaticValidation: true,
          unrealEditorSmokeVersions: ['5.3', '5.2', 'secret@example.com'],
          customerEmail: 'do-not-return@example.com',
        },
      },
      godotReleaseReadiness: {
        steps: [{ stdout: 'PRIVATE GAME IP' }],
        cloudMetrics: {
          godotSourceReady: true,
          godotAddonStaticValidation: true,
          godotEditorSmokeVersions: ['4.4', '../secret'],
        },
      },
    }),
  }), {
    unrealPluginStaticValidation: true,
    unrealEditorSmokeVersions: ['5.3'],
    unrealSourceReady: true,
    godotAddonStaticValidation: true,
    godotEditorSmokeVersions: ['4.4'],
    godotSourceReady: true,
  });
});

test('engine expansion endpoint is admin protected, markdown-capable, and secret-safe', async () => {
  const markdown = formatEngineExpansionReadinessMarkdown(buildEngineExpansionReadinessReport({
    metrics: triEngineMetrics(),
    now: new Date('2026-05-18T00:00:00.000Z'),
  }));

  assert.match(markdown, /Greybox Engine Expansion Readiness/u);
  assert.match(markdown, /Unreal expansion allowed: yes/u);
  assert.match(markdown, /Tri-engine acquisition gate: yes/u);
  assert.match(markdown, /\| Unity prerequisites \| pass/u);
  assert.doesNotMatch(markdown, /API_KEY|SECRET|TOKEN|do-not-return|@/u);

  await withServer({
    auditAdminToken: 'engine-expansion-admin-0123456789abcdef',
    engineExpansionMetrics: triEngineMetrics(),
  }, async (baseUrl) => {
    const denied = await fetch(`${baseUrl}/v1/strategy/engine-expansion-readiness`);
    assert.equal(denied.status, 401);
    assert.deepEqual(await denied.json(), { error: 'audit_admin_required' });

    const response = await fetch(`${baseUrl}/v1/strategy/engine-expansion-readiness`, {
      headers: { authorization: 'Bearer engine-expansion-admin-0123456789abcdef' },
    });
    assert.equal(response.status, 200);
    const report = await response.json() as {
      summary: { unrealExpansionAllowed: boolean; triEngineAcquisitionGate: boolean };
      metrics: { unityPayingCustomers: number };
    };
    assert.equal(report.summary.unrealExpansionAllowed, true);
    assert.equal(report.summary.triEngineAcquisitionGate, true);
    assert.equal(report.metrics.unityPayingCustomers, 1_100);
    assert.doesNotMatch(JSON.stringify(report), /engine-expansion-admin/u);

    const markdownResponse = await fetch(`${baseUrl}/v1/strategy/engine-expansion-readiness?format=markdown`, {
      headers: { authorization: 'Bearer engine-expansion-admin-0123456789abcdef' },
    });
    assert.equal(markdownResponse.status, 200);
    assert.match(markdownResponse.headers.get('content-type') ?? '', /text\/markdown/u);
    assert.match(await markdownResponse.text(), /Engine Expansion Readiness/u);
  });
});
