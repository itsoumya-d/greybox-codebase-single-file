// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import type http from 'node:http';
import test from 'node:test';
import {
  buildSalesMotionReadinessReport,
  formatSalesMotionReadinessMarkdown,
  salesMotionMetricsFromEnv,
} from '../src/enterprise/salesMotionReadiness.js';
import {
  buildBusinessModelProofReport,
  type BusinessModelProofInput,
} from '../src/enterprise/businessModelProof.js';
import type { EnterpriseContractPacket } from '../src/enterprise/contractPacket.js';
import {
  buildEnterpriseLogoExpansionReport,
  type EnterpriseLogoMetricInput,
} from '../src/enterprise/enterpriseLogoExpansion.js';
import type { TrustControlReport } from '../src/enterprise/trustControls.js';
import {
  buildUnityPluginAdoptionReport,
  type UnityPluginAdoptionMetricInput,
} from '../src/enterprise/unityPluginAdoption.js';
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

function passingBusinessModelProof(): BusinessModelProofInput {
  return {
    managedInference: {
      arrUsd: 1_250_000,
      meteredBillingAudited: true,
      providerReconciliationOk: true,
      stripeMeterEvents: 82_000,
      grossMargin: 0.68,
    },
    proModules: {
      revenueShare: 0.34,
      shippedModules: 12,
      paidPurchases: 4_800,
      signedBundles: 12,
      publishedObjects: 13,
      attachRateBps: 8_333,
      multiModuleAttachRateBps: 5_000,
      studioEnterpriseAttachRateBps: 10_000,
      expansionArrUsd: 3_000,
      proChurnedCustomerRateBps: 0,
      modulesWithActiveCustomers: 8,
      betaValidatedModules: 5,
      betaDesignPartners: 10,
      betaReviewedExports: 10,
      betaAcceptedDiffRateBps: 7_500,
      attachReady: true,
      betaReady: true,
      loaderRejectsUnsigned: true,
      publishProductionReady: true,
      publishHandoffReady: true,
      publishReleaseMatchReady: true,
      sourceBusinessModelReady: true,
    },
    marketplace: {
      monthlyGmvUsd: 310_000,
      activeSellers: 225,
      uniqueBuyers: 260,
      platformReady: true,
      sourceBusinessModelReady: true,
      checkoutOrderShareBps: 9_350,
      checkoutGmvShareBps: 9_250,
      settlementReady: true,
      settlementPayoutShareBps: 9_400,
      topCreatorGmvShareBps: 2_200,
      topBuyerGmvShareBps: 2_100,
      payoutBlockers: 0,
      taxBlockers: 0,
      reconciliationReady: true,
      reconciliationIssues: 0,
      riskReserveReady: true,
      reserveShortfallCents: 0,
      stripeEventForwardingReady: true,
      forwardedStripeEvents: 4,
    },
    playtest: {
      activePayingStudios: 120,
      personasInProduction: 12,
      acceptedTuningSuggestions: 42,
      completedRuns: 9_600,
      qaSavingsUsd: 820_000,
      personaProductionReady: true,
      sourceBusinessModelReady: true,
    },
  };
}

function unityAdoptionMetrics(payingCustomers = 120): UnityPluginAdoptionMetricInput {
  return {
    assetStoreLive: true,
    unityVerifiedSolutionApplied: true,
    unityVerifiedSolutionAchieved: true,
    payingCustomers,
    activeMonthlyLicenses: Math.ceil(payingCustomers * 0.75),
    roundTripActiveCustomers: Math.min(payingCustomers, 110),
    mcpActiveCustomers: Math.min(payingCustomers, 60),
    successfulSampleImports: 12,
    averageSampleImportSeconds: 24,
    p95RoundTripLatencyMs: 1_700,
    supportBlockers: 0,
    realEditorSmokeVersions: ['2022.3', '2023.2', '6000.0'],
    sourceAdoptionReady: true,
    sourceReleaseReadinessReady: true,
  };
}

function enterpriseLogoMetrics(): EnterpriseLogoMetricInput {
  return {
    workosSsoLive: true,
    scimLive: true,
    auditExportLive: true,
    onPremBundleLive: true,
    privateNetworkingLive: true,
    dataResidencyLive: true,
    dpaMsaReady: true,
    signedEnterpriseLogos: 5,
    activeEnterpriseLogos: 5,
    qualifiedPipelineAccounts: 18,
    pilotsInProgress: 4,
    averageAcvUsd: 60_000,
    enterpriseArrUsd: 300_000,
    netRevenueRetention: 1.2,
    expansionArrUsd: 75_000,
    securityReviewsPassed: 5,
    procurementPacketsSent: 6,
    ssoEnabledLogos: 5,
    scimEnabledLogos: 5,
    auditExportEnabledLogos: 5,
    onPremEnabledLogos: 2,
    privateNetworkEnabledLogos: 2,
    dataResidencyEnabledLogos: 5,
    csmAssignedLogos: 5,
    qbrsCompletedThisQuarter: 5,
    referenceableLogos: 3,
    caseStudyApprovedLogos: 1,
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

test('sales motion readiness fails closed when revenue and pipeline evidence are missing', () => {
  const report = buildSalesMotionReadinessReport({
    now: new Date('2026-05-18T00:00:00.000Z'),
  });

  assert.equal(report.generatedAt, '2026-05-18T00:00:00.000Z');
  assert.equal(report.summary.status, 'fail');
  assert.equal(report.summary.readyForNextRevenueMilestone, false);
  assert.equal(report.summary.currentRevenueTargetUsd, 100_000);
  assert.equal(report.summary.nextRevenueTargetUsd, 100_000);
  assert.ok(report.checks.some((check) => check.id === 'revenue-milestone' && check.status === 'fail'));
  assert.ok(report.checks.some((check) => check.id === 'qualified-pipeline-coverage' && check.status === 'fail'));
  assert.doesNotMatch(JSON.stringify(report), /founder@example\.com|TOKEN|SECRET|deal-room/u);
});

test('sales motion readiness passes with founder-led learning, milestone pipeline, and proof packets', async () => {
  const businessModelProofReport = buildBusinessModelProofReport({
    now: new Date('2026-05-18T00:00:00.000Z'),
    proof: passingBusinessModelProof(),
  });
  const unityAdoptionReport = await buildUnityPluginAdoptionReport({
    now: new Date('2026-05-18T00:00:00.000Z'),
    metrics: unityAdoptionMetrics(),
  });
  const enterpriseLogoExpansionReport = buildEnterpriseLogoExpansionReport({
    now: new Date('2026-05-18T00:00:00.000Z'),
    metrics: enterpriseLogoMetrics(),
    trustControlReport: passingTrustControlReport(),
    contractPacket: passingContractPacket(),
  });
  const report = buildSalesMotionReadinessReport({
    now: new Date('2026-05-18T00:00:00.000Z'),
    metrics: {
      monthSinceLaunch: 12,
      arrUsd: 1_200_000,
      indiePayingCustomers: 40,
      studioPayingCustomers: 20,
      founderOnboardedIndieCustomers: 40,
      founderOnboardedStudioCustomers: 20,
      enterpriseAccounts: 5,
      topEnterpriseAccountsFounderOwned: 5,
      firstAeHired: true,
      salesTeamHeadcount: 1,
      accountsAbove40kAcv: 3,
      csmCovered40kAccounts: 3,
      qualifiedPipelineArrUsd: 12_000_000,
    },
    businessModelProofReport,
    unityAdoptionReport,
    enterpriseLogoExpansionReport,
  });

  assert.equal(report.summary.status, 'pass');
  assert.equal(report.summary.readyForNextRevenueMilestone, true);
  assert.equal(report.summary.currentRevenueTargetUsd, 1_000_000);
  assert.equal(report.summary.nextRevenueTargetUsd, 5_000_000);
  assert.equal(report.summary.nextRevenueGapUsd, 3_450_000);
  assert.equal(report.summary.paidSelfServeCustomers, 60);
  assert.equal(report.summary.founderOnboardingCoverage, 1);
  assert.equal(report.summary.noVcBeforePmf, true);
  assert.equal(report.summary.revenueProofReady, true);
  assert.equal(report.summary.unityPluginSalesProofReady, true);
  assert.equal(report.summary.enterpriseAccountProofReady, true);
  assert.deepEqual(report.checks.map((check) => check.status), [
    'pass',
    'pass',
    'pass',
    'pass',
    'pass',
    'pass',
    'pass',
    'pass',
    'pass',
    'pass',
  ]);
  assert.match(formatSalesMotionReadinessMarkdown(report), /Ready for next revenue milestone: yes/u);
});

test('sales motion readiness rejects raw revenue and customer claims without proof packets', () => {
  const report = buildSalesMotionReadinessReport({
    now: new Date('2026-05-18T00:00:00.000Z'),
    metrics: {
      monthSinceLaunch: 12,
      arrUsd: 1_200_000,
      indiePayingCustomers: 40,
      studioPayingCustomers: 20,
      founderOnboardedIndieCustomers: 40,
      founderOnboardedStudioCustomers: 20,
      enterpriseAccounts: 5,
      topEnterpriseAccountsFounderOwned: 5,
      firstAeHired: true,
      salesTeamHeadcount: 1,
      accountsAbove40kAcv: 3,
      csmCovered40kAccounts: 3,
      qualifiedPipelineArrUsd: 12_000_000,
    },
  });

  assert.equal(report.summary.status, 'fail');
  assert.equal(report.summary.readyForNextRevenueMilestone, false);
  assert.equal(report.summary.businessModelProofStatus, 'missing');
  assert.equal(report.summary.unityAdoptionStatus, 'missing');
  assert.equal(report.summary.enterpriseLogoExpansionStatus, 'missing');
  assert.ok(report.checks.some((check) => check.id === 'revenue-source-proof' && check.status === 'fail'));
  assert.ok(report.checks.some((check) => check.id === 'unity-plugin-sales-proof' && check.status === 'fail'));
  assert.ok(report.checks.some((check) => check.id === 'enterprise-account-proof' && check.status === 'fail'));
});

test('sales motion readiness blocks VC before the $1M ARR leverage point', () => {
  const report = buildSalesMotionReadinessReport({
    metrics: {
      monthSinceLaunch: 5,
      arrUsd: 50_000,
      indiePayingCustomers: 12,
      studioPayingCustomers: 3,
      founderOnboardedIndieCustomers: 12,
      founderOnboardedStudioCustomers: 3,
      qualifiedPipelineArrUsd: 300_000,
      vcRaisedUsd: 750_000,
      vcRaisedBeforeOneMillionArr: true,
    },
  });

  assert.equal(report.summary.noVcBeforePmf, false);
  assert.ok(report.checks.some((check) => check.id === 'vc-discipline' && check.status === 'fail'));
  assert.match(
    report.checks.find((check) => check.id === 'vc-discipline')?.remediation ?? '',
    /Do not pursue priced VC/u,
  );
});

test('sales motion env parser keeps aggregate known fields only', () => {
  assert.deepEqual(salesMotionMetricsFromEnv({ GREYBOX_SALES_MOTION_METRICS_JSON: 'nope' }), {});
  const metrics = salesMotionMetricsFromEnv({
    GREYBOX_SALES_MOTION_METRICS_JSON: JSON.stringify({
      monthSinceLaunch: 6,
      arrUsd: 120_000,
      indiePayingCustomers: 12,
      founderOnboardedIndieCustomers: 12,
      firstAeHired: false,
      founderEmail: 'founder@example.com',
      crmDealRoom: 'https://secret.example.com/deal-room',
      token: 'SECRET_TOKEN',
      vcRaisedUsd: -1,
    }),
  });

  assert.deepEqual(metrics, {
    monthSinceLaunch: 6,
    arrUsd: 120_000,
    indiePayingCustomers: 12,
    founderOnboardedIndieCustomers: 12,
    firstAeHired: false,
  });
  const report = buildSalesMotionReadinessReport({ metrics });
  assert.doesNotMatch(JSON.stringify(report), /founder@example\.com|deal-room|SECRET_TOKEN/u);
});

test('sales motion readiness endpoint is admin protected and supports markdown', async () => {
  await withServer({
    auditAdminToken: 'sales-motion-admin-0123456789abcdef',
    salesMotionMetrics: {
      monthSinceLaunch: 6,
      arrUsd: 125_000,
      indiePayingCustomers: 20,
      studioPayingCustomers: 5,
      founderOnboardedIndieCustomers: 20,
      founderOnboardedStudioCustomers: 5,
      firstAeHired: true,
      salesTeamHeadcount: 1,
      qualifiedPipelineArrUsd: 3_000_000,
    },
    unityAdoptionMetrics: unityAdoptionMetrics(25),
  }, async (baseUrl) => {
    const denied = await fetch(`${baseUrl}/v1/strategy/sales-motion-readiness`);
    assert.equal(denied.status, 401);
    assert.deepEqual(await denied.json(), { error: 'audit_admin_required' });

    const response = await fetch(`${baseUrl}/v1/strategy/sales-motion-readiness`, {
      headers: { authorization: 'Bearer sales-motion-admin-0123456789abcdef' },
    });
    assert.equal(response.status, 200);
    const report = await response.json() as {
      summary: {
        readyForNextRevenueMilestone: boolean;
        paidSelfServeCustomers: number;
        unityPluginSalesProofReady: boolean;
      };
      metrics: { arrUsd: number };
    };
    assert.equal(report.summary.readyForNextRevenueMilestone, true);
    assert.equal(report.summary.paidSelfServeCustomers, 25);
    assert.equal(report.summary.unityPluginSalesProofReady, true);
    assert.equal(report.metrics.arrUsd, 125_000);

    const markdownResponse = await fetch(`${baseUrl}/v1/strategy/sales-motion-readiness?format=markdown`, {
      headers: { authorization: 'Bearer sales-motion-admin-0123456789abcdef' },
    });
    assert.equal(markdownResponse.status, 200);
    assert.match(markdownResponse.headers.get('content-type') ?? '', /text\/markdown/u);
    const markdown = await markdownResponse.text();
    assert.match(markdown, /Greybox Sales Motion Readiness/u);
    assert.doesNotMatch(markdown, /sales-motion-admin|TOKEN|SECRET/u);
  });
});
