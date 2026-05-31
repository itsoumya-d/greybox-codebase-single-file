// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import type http from 'node:http';
import test from 'node:test';
import {
  acquisitionMetricsFromEnv,
  buildAcquisitionReadinessReport,
  formatAcquisitionReadinessMarkdown,
} from '../src/enterprise/acquisitionReadiness.js';
import {
  buildNorthStarReport,
  type ProductAnalyticsEvent,
} from '../src/analytics/northStar.js';
import {
  buildCommercialCreditReport,
  type CommercialGameCreditRecordInput,
} from '../src/enterprise/commercialCredits.js';
import {
  buildEnterpriseLogoExpansionReport,
  type EnterpriseLogoMetricInput,
} from '../src/enterprise/enterpriseLogoExpansion.js';
import type { EnterpriseContractPacket } from '../src/enterprise/contractPacket.js';
import {
  buildStrategicOutreachReport,
  type StrategicOutreachRecordInput,
} from '../src/enterprise/strategicOutreach.js';
import { buildUnityPluginAdoptionReport } from '../src/enterprise/unityPluginAdoption.js';
import {
  buildBusinessModelProofReport,
  type BusinessModelProofInput,
} from '../src/enterprise/businessModelProof.js';
import { buildSalesMotionReadinessReport } from '../src/enterprise/salesMotionReadiness.js';
import { buildEngineExpansionReadinessReport } from '../src/enterprise/engineExpansionReadiness.js';
import type {
  CertificationMilestone,
  CertificationRoadmapReport,
} from '../src/enterprise/certificationRoadmap.js';
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

function missionEnterpriseLogoMetrics(): EnterpriseLogoMetricInput {
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

function passingCertificationRoadmapReport(): CertificationRoadmapReport {
  const milestones: CertificationMilestone[] = [
    certificationMilestone('gdpr-readiness', 'GDPR readiness', 6, 'ready'),
    certificationMilestone('ccpa-coppa-dpdpa-readiness', 'CCPA/COPPA/DPDPA readiness', 6, 'ready'),
    certificationMilestone('soc2-type-i', 'SOC 2 Type I readiness', 12, 'ready'),
    certificationMilestone('soc2-type-ii', 'SOC 2 Type II readiness', 18, 'ready'),
    certificationMilestone('iso-27001', 'ISO 27001 readiness', 24, 'on-track'),
  ];
  return {
    generatedAt: '2026-05-18T00:00:00.000Z',
    startAt: '2026-05-17T00:00:00.000Z',
    disclaimer: 'Certification roadmap test evidence only.',
    certificationClaims: false,
    summary: {
      milestones: milestones.length,
      ready: milestones.filter((milestone) => milestone.status === 'ready').length,
      onTrack: milestones.filter((milestone) => milestone.status === 'on-track').length,
      atRisk: 0,
      blocked: 0,
      totalApproxCostUsd: 130_000,
      monthsElapsed: 0,
    },
    milestones,
    issues: [],
  };
}

function certificationMilestone(
  id: CertificationMilestone['id'],
  title: string,
  targetMonth: number,
  status: CertificationMilestone['status'],
): CertificationMilestone {
  return {
    id,
    title,
    targetMonth,
    dueBy: '2027-11-17T00:00:00.000Z',
    approxCostUsd: id === 'soc2-type-ii' ? 40_000 : id === 'iso-27001' ? 60_000 : id === 'soc2-type-i' ? 25_000 : id === 'gdpr-readiness' ? 5_000 : 0,
    owner: 'Security Engineering',
    status,
    frameworks: ['SOC 2 Security'],
    evidence: [{
      id: `${id}-evidence`,
      label: `${title} evidence`,
      status: 'pass',
      detail: 'Passing certification evidence for acquisition-readiness tests.',
      references: ['tests/acquisition-readiness.test.ts'],
    }],
    blockers: [],
    nextAction: 'Keep the certification evidence packet current.',
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

function enterpriseLogoExpansionReport() {
  return buildEnterpriseLogoExpansionReport({
    metrics: missionEnterpriseLogoMetrics(),
    trustControlReport: passingTrustControlReport(),
    contractPacket: passingContractPacket(),
    supportSlaTickets: passingSupportTickets(),
    now: new Date('2026-05-18T00:00:00.000Z'),
  });
}

function commercialCredits(): CommercialGameCreditRecordInput[] {
  return [
    commercialCredit('ember-road', 'Ember Road', 'Aster Signal', 'Unity', 'Steam', 'case-study'),
    commercialCredit('orbit-miners', 'Orbit Miners', 'Latch Labs', 'Unreal', 'Epic Games Store', 'credits-page'),
    commercialCredit('tiny-keepers', 'Tiny Keepers', 'North Tile', 'Godot', 'itch.io', 'credits-screenshot'),
    commercialCredit('hex-runner', 'Hex Runner', 'Mossline', 'Unity', 'App Store', 'customer-approval'),
    commercialCredit('night-market', 'Night Market', 'Pixel Grove', 'Unreal', 'Google Play', 'credits-page'),
  ];
}

function commercialCredit(
  gameSlug: string,
  title: string,
  studioName: string,
  engine: CommercialGameCreditRecordInput['engine'],
  store: CommercialGameCreditRecordInput['store'],
  creditEvidence: NonNullable<CommercialGameCreditRecordInput['evidence']>[number]['type'],
): CommercialGameCreditRecordInput {
  return {
    gameSlug,
    title,
    studioName,
    engine,
    store,
    shippedAt: '2026-04-15T00:00:00.000Z',
    commercialRelease: true,
    greyboxCredited: true,
    humanDesignerCredited: true,
    generatorMetaTag: true,
    evidence: [
      {
        type: 'store-page',
        capturedAt: '2026-04-16T00:00:00.000Z',
        sourceHash: 'a'.repeat(64),
        sourceUrl: `https://store.example.com/${gameSlug}`,
      },
      {
        type: creditEvidence,
        capturedAt: '2026-04-17T00:00:00.000Z',
        sourceHash: 'b'.repeat(64),
        sourceUrl: `https://credits.example.com/${gameSlug}`,
        approvedForPublicUse: creditEvidence === 'case-study',
      },
    ],
  };
}

function commercialCreditReport() {
  return buildCommercialCreditReport({
    records: commercialCredits(),
    now: new Date('2026-05-18T00:00:00.000Z'),
  });
}

function strategicOutreachRecords(): StrategicOutreachRecordInput[] {
  return baseStrategicOutreachRecords();
}

function exitStrategicOutreachRecords(): StrategicOutreachRecordInput[] {
  return [
    ...baseStrategicOutreachRecords(),
    {
      acquirer: 'Roblox',
      stage: 'term-sheet',
      initiatedAt: '2026-05-03T00:00:00.000Z',
      lastActivityAt: '2026-05-18T00:00:00.000Z',
      valuationUsd: 240_000_000,
      evidence: [
        { type: 'term-sheet', capturedAt: '2026-05-18T00:00:00.000Z', sourceHash: 'f'.repeat(64) },
      ],
    },
  ];
}

function baseStrategicOutreachRecords(): StrategicOutreachRecordInput[] {
  return [
    {
      acquirer: 'Unity',
      stage: 'diligence',
      initiatedAt: '2026-04-25T12:00:00.000Z',
      lastActivityAt: '2026-05-17T12:00:00.000Z',
      evidence: [
        { type: 'partner-channel', capturedAt: '2026-04-25T12:00:00.000Z', sourceHash: 'c'.repeat(64) },
        { type: 'diligence-request', capturedAt: '2026-05-17T12:00:00.000Z', sourceHash: 'd'.repeat(64) },
      ],
    },
    {
      acquirer: 'Epic',
      stage: 'intro-completed',
      initiatedAt: '2026-05-01T12:00:00.000Z',
      lastActivityAt: '2026-05-12T12:00:00.000Z',
      evidence: [
        { type: 'founder-intro', capturedAt: '2026-05-01T12:00:00.000Z', sourceHash: 'e'.repeat(64) },
      ],
    },
  ];
}

function strategicOutreachReport() {
  return buildStrategicOutreachReport({
    records: strategicOutreachRecords(),
    now: new Date('2026-05-18T00:00:00.000Z'),
  });
}

function exitStrategicOutreachReport() {
  return buildStrategicOutreachReport({
    records: exitStrategicOutreachRecords(),
    now: new Date('2026-05-18T00:00:00.000Z'),
  });
}

function northStarEvents(): ProductAnalyticsEvent[] {
  return Array.from({ length: 30_000 }, (_, index) => {
    const engine = index % 3 === 0 ? 'unity' : index % 3 === 1 ? 'unreal' : 'godot';
    return {
      id: `engine-export-${index}`,
      name: 'engine-export',
      designerId: `designer-${index}`,
      occurredAt: Date.UTC(2026, 4, 18, 12),
      telemetryOptIn: true,
      engine,
      projectId: `project-${index}`,
      artifactId: `artifact-${index}`,
    };
  });
}

function northStarReport() {
  return buildNorthStarReport({
    events: northStarEvents(),
    generatedAt: new Date(Date.UTC(2026, 4, 18, 12)),
    targets: {
      minActivationToExportRateBps: 0,
    },
  });
}

async function unityAdoptionReport() {
  return buildUnityPluginAdoptionReport({
    now: new Date('2026-05-18T00:00:00.000Z'),
    metrics: {
      assetStoreLive: true,
      unityVerifiedSolutionApplied: true,
      unityVerifiedSolutionAchieved: true,
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
}

function triEngineMetrics() {
  return {
    unityAssetStoreLive: true,
    unityVerifiedSolutionApplied: true,
    unityVerifiedSolutionAchieved: true,
    unityPayingCustomers: 1_250,
    unityRoundTripActiveCustomers: 260,
    unityMcpActiveCustomers: 110,
    unityAverageSampleImportSeconds: 24.5,
    unityP95RoundTripLatencyMs: 1_450,
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
    godotEditorSmokeVersions: ['4.4'],
    godotSampleImportSeconds: 22,
    godotRoundTripFieldTypes: 6,
    godotMcpToolsPassing: 8,
    godotCommunityDemandSignals: 32,
    godotSourceReady: true,
    openCoreApiDeprecationPlan: true,
    triEngineDocsReady: true,
  };
}

function engineExpansionReport() {
  return buildEngineExpansionReadinessReport({
    metrics: triEngineMetrics(),
    now: new Date('2026-05-18T00:00:00.000Z'),
  });
}

function businessModelProof(): BusinessModelProofInput {
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

function businessModelProofReport() {
  return buildBusinessModelProofReport({
    proof: businessModelProof(),
    now: new Date('2026-05-18T00:00:00.000Z'),
  });
}

async function salesMotionReadinessReport() {
  return buildSalesMotionReadinessReport({
    now: new Date('2026-05-18T00:00:00.000Z'),
    metrics: {
      monthSinceLaunch: 24,
      arrUsd: 10_500_000,
      indiePayingCustomers: 1_800,
      studioPayingCustomers: 1_750,
      founderOnboardedIndieCustomers: 1_500,
      founderOnboardedStudioCustomers: 1_400,
      enterpriseAccounts: 52,
      topEnterpriseAccountsFounderOwned: 5,
      firstAeHired: true,
      salesTeamHeadcount: 4,
      accountsAbove40kAcv: 50,
      csmCovered40kAccounts: 50,
      qualifiedPipelineArrUsd: 24_000_000,
    },
    businessModelProofReport: businessModelProofReport(),
    unityAdoptionReport: await unityAdoptionReport(),
    enterpriseLogoExpansionReport: enterpriseLogoExpansionReport(),
  });
}

test('acquisition readiness blocks strategic process when acquisition metrics are missing', () => {
  const report = buildAcquisitionReadinessReport({
    now: new Date('2026-05-18T00:00:00.000Z'),
  });

  assert.equal(report.generatedAt, '2026-05-18T00:00:00.000Z');
  assert.equal(report.summary.readyForStrategicProcess, false);
  assert.equal(report.summary.exitOutcomeSecured, false);
  assert.equal(report.summary.missionCompleteCandidate, false);
  assert.equal(report.targetValuationBandUsd.low, 200_000_000);
  assert.equal(report.targetValuationBandUsd.high, 500_000_000);
  assert.ok(report.targetAcquirers.includes('Unity'));
  assert.ok(report.targetAcquirers.includes('Epic'));
  assert.ok(report.summary.fail > 0);
  assert.ok(report.checks.some((check) => check.id === 'arr-run-rate' && check.status === 'fail'));
  assert.ok(report.checks.some((check) => check.id === 'valuation-event' && check.status === 'fail'));
  assert.doesNotMatch(JSON.stringify(report), /API_KEY|SECRET|TOKEN|studio-founder@example\.com/u);
});

test('acquisition readiness passes only when the strategic pitch and outcome gates are met', async () => {
  const report = buildAcquisitionReadinessReport({
    now: new Date('2026-05-18T00:00:00.000Z'),
    salesMotionReadinessReport: await salesMotionReadinessReport(),
    enterpriseLogoExpansionReport: enterpriseLogoExpansionReport(),
    commercialCreditReport: commercialCreditReport(),
    strategicOutreachReport: exitStrategicOutreachReport(),
    certificationRoadmapReport: passingCertificationRoadmapReport(),
    northStarReport: northStarReport(),
    unityAdoptionReport: await unityAdoptionReport(),
    businessModelProofReport: businessModelProofReport(),
    engineExpansionReport: engineExpansionReport(),
    metrics: {
      arrUsd: 10_500_000,
      yoyGrowthRate: 1.12,
      nrr: 1.24,
      weeklyActiveDesignersShippingToEngines: 32_000,
      unityVerifiedSolution: true,
      shippedCommercialGameCredits: 6,
      enterpriseLogos: 52,
      soc2Type2Achieved: true,
      iso27001Status: 'in-progress',
      cleanCapTable: true,
      strategicConversations: 3,
      termSheetValuationUsd: 240_000_000,
      managedInferenceArrUsd: 1_250_000,
      proModuleRevenueShare: 0.34,
      marketplaceGmvMonthlyUsd: 310_000,
      payingUnityPluginCustomers: 1_250,
      activePlaytestStudios: 120,
    },
  });

  assert.equal(report.summary.readyForStrategicProcess, true);
  assert.equal(report.summary.exitOutcomeSecured, true);
  assert.equal(report.summary.missionCompleteCandidate, true);
  assert.equal(report.summary.pass, report.summary.checks);
  assert.equal(report.summary.warn, 0);
  assert.equal(report.summary.fail, 0);
  assert.equal(report.summary.salesMotionStatus, 'pass');
  assert.equal(report.summary.revenueEvidenceReady, true);
  assert.equal(report.summary.enterpriseLogoScaleReady, true);
  assert.equal(report.summary.nrrExpansionEvidenceReady, true);
  assert.equal(report.summary.enterpriseLogoExpansionStatus, 'pass');
  assert.equal(report.summary.commercialCreditNarrativeReady, true);
  assert.equal(report.summary.strategicConversationEvidenceReady, true);
  assert.equal(report.summary.valuationOutcomeEvidenceReady, true);
  assert.equal(report.summary.trustCertificationEvidenceReady, true);
  assert.equal(report.summary.northStarEngineShippingReady, true);
  assert.equal(report.summary.unityPluginAcquisitionReady, true);
  assert.equal(report.summary.businessModelProofStatus, 'pass');
  assert.equal(report.summary.managedInferenceReady, true);
  assert.equal(report.summary.proModuleRevenueReady, true);
  assert.equal(report.summary.marketplaceGmvReady, true);
  assert.equal(report.summary.playtestAdoptionReady, true);
  assert.equal(report.summary.engineExpansionStatus, 'pass');
  assert.equal(report.summary.triEngineAcquisitionReady, true);
  assert.equal(report.enterpriseLogoExpansion?.missionEnterpriseGate, true);
  assert.equal(report.salesMotion?.revenueProofReady, true);
  assert.equal(report.commercialCredits?.acquisitionNarrativeReady, true);
  assert.equal(report.strategicOutreach?.conversationRequirementMet, true);
  assert.equal(report.strategicOutreach?.exitOutcomeEvidence, true);
  assert.equal(report.certificationRoadmap?.blocked, 0);
  assert.equal(report.northStar?.weeklyActiveDesignersShippingToEngines, 30_000);
  assert.equal(report.unityAdoption?.readyForUnityV1Growth, true);
  assert.equal(report.businessModelProof?.acquisitionBusinessModelReady, true);
  assert.equal(report.metrics.arrUsd, 10_500_000);
  assert.equal(report.metrics.nrr, 1.24);
  assert.equal(report.metrics.iso27001Status, 'in-progress');
  assert.match(report.pitch, /AI design layer that ships games to engines/u);
});

test('acquisition readiness rejects strategic process without tri-engine runtime proof', async () => {
  const report = buildAcquisitionReadinessReport({
    now: new Date('2026-05-18T00:00:00.000Z'),
    salesMotionReadinessReport: await salesMotionReadinessReport(),
    enterpriseLogoExpansionReport: enterpriseLogoExpansionReport(),
    commercialCreditReport: commercialCreditReport(),
    strategicOutreachReport: strategicOutreachReport(),
    certificationRoadmapReport: passingCertificationRoadmapReport(),
    northStarReport: northStarReport(),
    unityAdoptionReport: await unityAdoptionReport(),
    businessModelProofReport: businessModelProofReport(),
    metrics: {
      arrUsd: 10_500_000,
      yoyGrowthRate: 1.12,
      nrr: 1.24,
      weeklyActiveDesignersShippingToEngines: 32_000,
      unityVerifiedSolution: true,
      shippedCommercialGameCredits: 6,
      enterpriseLogos: 52,
      soc2Type2Achieved: true,
      iso27001Status: 'in-progress',
      cleanCapTable: true,
      strategicConversations: 3,
      termSheetValuationUsd: 240_000_000,
      managedInferenceArrUsd: 1_250_000,
      proModuleRevenueShare: 0.34,
      marketplaceGmvMonthlyUsd: 310_000,
      payingUnityPluginCustomers: 1_250,
      activePlaytestStudios: 120,
    },
  });

  assert.equal(report.summary.readyForStrategicProcess, false);
  assert.equal(report.summary.triEngineAcquisitionReady, false);
  assert.equal(report.summary.engineExpansionStatus, 'fail');
  assert.ok(report.checks.some((check) => (
    check.id === 'tri-engine-runtime-proof'
    && check.status === 'fail'
    && check.current.includes('no engine-expansion proof packet')
  )));
});

test('acquisition readiness rejects raw enterprise logo counts without expansion evidence', () => {
  const report = buildAcquisitionReadinessReport({
    now: new Date('2026-05-18T00:00:00.000Z'),
    metrics: {
      arrUsd: 5_500_000,
      yoyGrowthRate: 1.01,
      nrr: 1.2,
      weeklyActiveDesignersShippingToEngines: 30_000,
      unityVerifiedSolution: true,
      shippedCommercialGameCredits: 5,
      enterpriseLogos: 52,
      soc2Type2Achieved: true,
      iso27001Status: 'in-progress',
      cleanCapTable: true,
      strategicConversations: 2,
    },
  });

  assert.equal(report.summary.readyForStrategicProcess, false);
  assert.equal(report.summary.enterpriseLogoScaleReady, false);
  assert.equal(report.summary.nrrExpansionEvidenceReady, false);
  assert.equal(report.summary.enterpriseLogoExpansionStatus, 'fail');
  assert.ok(report.checks.some((check) => (
    check.id === 'enterprise-logos'
    && check.status === 'fail'
    && check.current.includes('no expansion packet')
  )));
  assert.ok(report.checks.some((check) => (
    check.id === 'nrr'
    && check.status === 'fail'
    && check.current.includes('no enterprise expansion packet')
  )));
});

test('acquisition readiness rejects raw ARR and growth without sales-motion evidence', () => {
  const report = buildAcquisitionReadinessReport({
    now: new Date('2026-05-18T00:00:00.000Z'),
    metrics: {
      arrUsd: 10_500_000,
      yoyGrowthRate: 1.12,
    },
  });

  assert.equal(report.summary.readyForStrategicProcess, false);
  assert.equal(report.summary.salesMotionStatus, 'fail');
  assert.equal(report.summary.revenueEvidenceReady, false);
  assert.ok(report.checks.some((check) => (
    check.id === 'arr-run-rate'
    && check.status === 'fail'
    && check.current.includes('no sales-motion proof packet')
  )));
  assert.ok(report.checks.some((check) => (
    check.id === 'yoy-growth'
    && check.status === 'fail'
    && check.current.includes('no sales-motion proof packet')
  )));
});

test('acquisition readiness rejects raw valuation outcomes without strategic outcome evidence', async () => {
  const report = buildAcquisitionReadinessReport({
    now: new Date('2026-05-18T00:00:00.000Z'),
    salesMotionReadinessReport: await salesMotionReadinessReport(),
    enterpriseLogoExpansionReport: enterpriseLogoExpansionReport(),
    commercialCreditReport: commercialCreditReport(),
    strategicOutreachReport: strategicOutreachReport(),
    certificationRoadmapReport: passingCertificationRoadmapReport(),
    northStarReport: northStarReport(),
    unityAdoptionReport: await unityAdoptionReport(),
    businessModelProofReport: businessModelProofReport(),
    engineExpansionReport: engineExpansionReport(),
    metrics: {
      arrUsd: 10_500_000,
      yoyGrowthRate: 1.12,
      nrr: 1.24,
      weeklyActiveDesignersShippingToEngines: 32_000,
      unityVerifiedSolution: true,
      shippedCommercialGameCredits: 6,
      enterpriseLogos: 52,
      soc2Type2Achieved: true,
      iso27001Status: 'in-progress',
      cleanCapTable: true,
      strategicConversations: 3,
      termSheetValuationUsd: 240_000_000,
      seriesBPostMoneyUsd: 260_000_000,
      managedInferenceArrUsd: 1_250_000,
      proModuleRevenueShare: 0.34,
      marketplaceGmvMonthlyUsd: 310_000,
      payingUnityPluginCustomers: 1_250,
      activePlaytestStudios: 120,
    },
  });

  assert.equal(report.summary.readyForStrategicProcess, true);
  assert.equal(report.summary.exitOutcomeSecured, false);
  assert.equal(report.summary.missionCompleteCandidate, false);
  assert.equal(report.summary.valuationOutcomeEvidenceReady, false);
  assert.ok(report.checks.some((check) => (
    check.id === 'valuation-event'
    && check.status === 'warn'
    && check.current.includes('evidence blocked')
  )));
});

test('acquisition readiness rejects raw trust certification claims without roadmap evidence', () => {
  const report = buildAcquisitionReadinessReport({
    now: new Date('2026-05-18T00:00:00.000Z'),
    metrics: {
      soc2Type2Achieved: true,
      iso27001Status: 'in-progress',
    },
  });

  assert.equal(report.summary.readyForStrategicProcess, false);
  assert.equal(report.summary.trustCertificationEvidenceReady, false);
  assert.ok(report.checks.some((check) => (
    check.id === 'trust-certifications'
    && check.status === 'fail'
    && check.current.includes('no certification roadmap packet')
  )));
});

test('acquisition readiness rejects SOC 2 claims when roadmap evidence has caveats', () => {
  const certificationRoadmap = passingCertificationRoadmapReport();
  const soc2 = certificationRoadmap.milestones.find((milestone) => milestone.id === 'soc2-type-ii');
  assert.ok(soc2);
  soc2.status = 'at-risk';
  soc2.evidence = [{
    id: 'auditor-caveat',
    label: 'Auditor engagement caveat',
    status: 'warn',
    detail: 'No SOC 2 auditor report is present.',
    references: ['legal/TRUST_CONTROLS.md'],
  }];
  soc2.blockers = ['Auditor engagement caveat: No SOC 2 auditor report is present.'];
  certificationRoadmap.summary.ready = 3;
  certificationRoadmap.summary.onTrack = 1;
  certificationRoadmap.summary.atRisk = 1;

  const report = buildAcquisitionReadinessReport({
    now: new Date('2026-05-18T00:00:00.000Z'),
    certificationRoadmapReport: certificationRoadmap,
    metrics: {
      soc2Type2Achieved: true,
      iso27001Status: 'in-progress',
    },
  });

  assert.equal(report.summary.readyForStrategicProcess, false);
  assert.equal(report.summary.trustCertificationEvidenceReady, false);
  assert.ok(report.checks.some((check) => (
    check.id === 'trust-certifications'
    && check.status === 'fail'
    && check.current.includes('at-risk roadmap')
  )));
});

test('acquisition readiness rejects raw NRR when expansion evidence is weak', async () => {
  const weakNrrEnterprisePacket = buildEnterpriseLogoExpansionReport({
    metrics: {
      ...missionEnterpriseLogoMetrics(),
      netRevenueRetention: 1.05,
      expansionArrUsd: 0,
      churnedEnterpriseLogos: 8,
    },
    trustControlReport: passingTrustControlReport(),
    contractPacket: passingContractPacket(),
    supportSlaTickets: passingSupportTickets(),
    now: new Date('2026-05-18T00:00:00.000Z'),
  });
  const report = buildAcquisitionReadinessReport({
    now: new Date('2026-05-18T00:00:00.000Z'),
    salesMotionReadinessReport: await salesMotionReadinessReport(),
    enterpriseLogoExpansionReport: weakNrrEnterprisePacket,
    commercialCreditReport: commercialCreditReport(),
    strategicOutreachReport: strategicOutreachReport(),
    certificationRoadmapReport: passingCertificationRoadmapReport(),
    northStarReport: northStarReport(),
    unityAdoptionReport: await unityAdoptionReport(),
    businessModelProofReport: businessModelProofReport(),
    engineExpansionReport: engineExpansionReport(),
    metrics: {
      arrUsd: 10_500_000,
      yoyGrowthRate: 1.12,
      nrr: 1.24,
      weeklyActiveDesignersShippingToEngines: 32_000,
      unityVerifiedSolution: true,
      shippedCommercialGameCredits: 6,
      enterpriseLogos: 52,
      soc2Type2Achieved: true,
      iso27001Status: 'in-progress',
      cleanCapTable: true,
      strategicConversations: 3,
      termSheetValuationUsd: 240_000_000,
      managedInferenceArrUsd: 1_250_000,
      proModuleRevenueShare: 0.34,
      marketplaceGmvMonthlyUsd: 310_000,
      payingUnityPluginCustomers: 1_250,
      activePlaytestStudios: 120,
    },
  });

  assert.equal(report.summary.readyForStrategicProcess, false);
  assert.equal(report.summary.nrrExpansionEvidenceReady, false);
  assert.equal(report.summary.enterpriseLogoScaleReady, false);
  assert.ok(report.checks.some((check) => (
    check.id === 'nrr'
    && check.status === 'warn'
    && check.current.includes('105% enterprise NRR')
    && check.current.includes('$0 expansion ARR')
  )));
});

test('acquisition readiness rejects raw commercial credits and strategic conversations without evidence packets', () => {
  const report = buildAcquisitionReadinessReport({
    now: new Date('2026-05-18T00:00:00.000Z'),
    enterpriseLogoExpansionReport: enterpriseLogoExpansionReport(),
    metrics: {
      arrUsd: 5_500_000,
      yoyGrowthRate: 1.01,
      nrr: 1.2,
      weeklyActiveDesignersShippingToEngines: 30_000,
      unityVerifiedSolution: true,
      shippedCommercialGameCredits: 5,
      enterpriseLogos: 52,
      soc2Type2Achieved: true,
      iso27001Status: 'in-progress',
      cleanCapTable: true,
      strategicConversations: 2,
    },
  });

  assert.equal(report.summary.readyForStrategicProcess, false);
  assert.equal(report.summary.commercialCreditNarrativeReady, false);
  assert.equal(report.summary.strategicConversationEvidenceReady, false);
  assert.ok(report.checks.some((check) => check.id === 'commercial-game-credits' && check.status === 'fail'));
  assert.ok(report.checks.some((check) => check.id === 'strategic-conversations' && check.status === 'fail'));
});

test('acquisition readiness rejects raw Unity and engine-shipper counts without evidence packets', () => {
  const report = buildAcquisitionReadinessReport({
    now: new Date('2026-05-18T00:00:00.000Z'),
    enterpriseLogoExpansionReport: enterpriseLogoExpansionReport(),
    commercialCreditReport: commercialCreditReport(),
    strategicOutreachReport: strategicOutreachReport(),
    metrics: {
      arrUsd: 5_500_000,
      yoyGrowthRate: 1.01,
      nrr: 1.2,
      weeklyActiveDesignersShippingToEngines: 30_000,
      unityVerifiedSolution: true,
      shippedCommercialGameCredits: 5,
      enterpriseLogos: 52,
      soc2Type2Achieved: true,
      iso27001Status: 'in-progress',
      cleanCapTable: true,
      strategicConversations: 2,
      payingUnityPluginCustomers: 1_250,
    },
  });

  assert.equal(report.summary.readyForStrategicProcess, false);
  assert.equal(report.summary.northStarEngineShippingReady, false);
  assert.equal(report.summary.unityPluginAcquisitionReady, false);
  assert.ok(report.checks.some((check) => check.id === 'weekly-active-engine-designers' && check.status === 'fail'));
  assert.ok(report.checks.some((check) => check.id === 'unity-verified-solution' && check.status === 'fail'));
  assert.ok(report.checks.some((check) => check.id === 'unity-plugin-customers' && check.status === 'fail'));
});

test('acquisition readiness rejects raw business model counters without proof packet', async () => {
  const report = buildAcquisitionReadinessReport({
    now: new Date('2026-05-18T00:00:00.000Z'),
    salesMotionReadinessReport: await salesMotionReadinessReport(),
    enterpriseLogoExpansionReport: enterpriseLogoExpansionReport(),
    commercialCreditReport: commercialCreditReport(),
    strategicOutreachReport: strategicOutreachReport(),
    certificationRoadmapReport: passingCertificationRoadmapReport(),
    northStarReport: northStarReport(),
    unityAdoptionReport: await unityAdoptionReport(),
    metrics: {
      arrUsd: 5_500_000,
      yoyGrowthRate: 1.01,
      nrr: 1.2,
      weeklyActiveDesignersShippingToEngines: 30_000,
      unityVerifiedSolution: true,
      shippedCommercialGameCredits: 5,
      enterpriseLogos: 52,
      soc2Type2Achieved: true,
      iso27001Status: 'in-progress',
      cleanCapTable: true,
      strategicConversations: 2,
      managedInferenceArrUsd: 1_250_000,
      proModuleRevenueShare: 0.34,
      marketplaceGmvMonthlyUsd: 310_000,
      payingUnityPluginCustomers: 1_250,
      activePlaytestStudios: 120,
    },
  });

  assert.equal(report.summary.businessModelProofStatus, 'fail');
  assert.equal(report.summary.managedInferenceReady, false);
  assert.equal(report.summary.proModuleRevenueReady, false);
  assert.equal(report.summary.marketplaceGmvReady, false);
  assert.equal(report.summary.playtestAdoptionReady, false);
  assert.ok(report.checks.some((check) => check.id === 'managed-inference-arr' && check.status === 'fail' && check.current.includes('no business-model proof packet')));
  assert.ok(report.checks.some((check) => check.id === 'pro-module-revenue-share' && check.status === 'fail'));
  assert.ok(report.checks.some((check) => check.id === 'marketplace-gmv' && check.status === 'fail'));
  assert.ok(report.checks.some((check) => check.id === 'playtest-studio-adoption' && check.status === 'fail'));
});

test('acquisition readiness rejects marketplace GMV proof when reserves are underfunded', async () => {
  const underReservedProof = businessModelProof();
  underReservedProof.marketplace = {
    ...underReservedProof.marketplace,
    riskReserveReady: false,
    reserveShortfallCents: 100_000,
  };
  const proofReport = buildBusinessModelProofReport({
    proof: underReservedProof,
    now: new Date('2026-05-18T00:00:00.000Z'),
  });

  const report = buildAcquisitionReadinessReport({
    now: new Date('2026-05-18T00:00:00.000Z'),
    salesMotionReadinessReport: await salesMotionReadinessReport(),
    enterpriseLogoExpansionReport: enterpriseLogoExpansionReport(),
    commercialCreditReport: commercialCreditReport(),
    strategicOutreachReport: strategicOutreachReport(),
    certificationRoadmapReport: passingCertificationRoadmapReport(),
    northStarReport: northStarReport(),
    unityAdoptionReport: await unityAdoptionReport(),
    businessModelProofReport: proofReport,
    engineExpansionReport: engineExpansionReport(),
    metrics: {
      arrUsd: 10_500_000,
      yoyGrowthRate: 1.12,
      nrr: 1.24,
      weeklyActiveDesignersShippingToEngines: 32_000,
      unityVerifiedSolution: true,
      shippedCommercialGameCredits: 6,
      enterpriseLogos: 52,
      soc2Type2Achieved: true,
      iso27001Status: 'in-progress',
      cleanCapTable: true,
      strategicConversations: 3,
      termSheetValuationUsd: 240_000_000,
      managedInferenceArrUsd: 1_250_000,
      proModuleRevenueShare: 0.34,
      marketplaceGmvMonthlyUsd: 310_000,
      payingUnityPluginCustomers: 1_250,
      activePlaytestStudios: 120,
    },
  });

  assert.equal(proofReport.summary.marketplaceReady, false);
  assert.equal(report.summary.readyForStrategicProcess, true);
  assert.equal(report.summary.missionCompleteCandidate, false);
  assert.equal(report.summary.marketplaceGmvReady, false);
  assert.equal(report.businessModelProof?.marketplaceRiskReserveReady, false);
  assert.equal(report.businessModelProof?.marketplaceReserveShortfallCents, 100_000);
  assert.ok(report.checks.some((check) => check.id === 'marketplace-gmv' && check.status === 'fail' && check.current.includes('reserve blocked')));
});

test('acquisition metrics env parser accepts aggregate metrics and ignores invalid JSON', () => {
  assert.deepEqual(acquisitionMetricsFromEnv({ GREYBOX_ACQUISITION_METRICS_JSON: 'not-json' }), {});
  const metrics = acquisitionMetricsFromEnv({
    GREYBOX_ACQUISITION_METRICS_JSON: JSON.stringify({
      arrUsd: 5_100_000,
      nrr: 1.21,
      cleanCapTable: true,
      token: 'should-not-be-emitted-as-a-known-field',
    }),
  });

  const report = buildAcquisitionReadinessReport({
    now: new Date('2026-05-18T00:00:00.000Z'),
    metrics,
  });
  assert.equal(report.metrics.arrUsd, 5_100_000);
  assert.equal(report.metrics.nrr, 1.21);
  assert.equal(report.metrics.cleanCapTable, true);
  assert.doesNotMatch(JSON.stringify(report), /should-not-be-emitted/u);
});

test('acquisition readiness markdown is phone-readable', async () => {
  const markdown = formatAcquisitionReadinessMarkdown(buildAcquisitionReadinessReport({
    now: new Date('2026-05-18T00:00:00.000Z'),
    salesMotionReadinessReport: await salesMotionReadinessReport(),
    enterpriseLogoExpansionReport: enterpriseLogoExpansionReport(),
    commercialCreditReport: commercialCreditReport(),
    strategicOutreachReport: strategicOutreachReport(),
    certificationRoadmapReport: passingCertificationRoadmapReport(),
    northStarReport: northStarReport(),
    unityAdoptionReport: await unityAdoptionReport(),
    businessModelProofReport: businessModelProofReport(),
    engineExpansionReport: engineExpansionReport(),
    metrics: {
      arrUsd: 5_500_000,
      yoyGrowthRate: 1.01,
      nrr: 1.2,
      weeklyActiveDesignersShippingToEngines: 30_000,
      unityVerifiedSolution: true,
      shippedCommercialGameCredits: 5,
      enterpriseLogos: 50,
      soc2Type2Achieved: true,
      iso27001Status: 'in-progress',
      cleanCapTable: true,
      strategicConversations: 2,
    },
  }));

  assert.match(markdown, /# Greybox Acquisition Readiness/u);
  assert.match(markdown, /Ready for strategic process: yes/u);
  assert.match(markdown, /Exit outcome secured: no/u);
  assert.match(markdown, /Target valuation band: \$200M-\$500M/u);
  assert.match(markdown, /Sales motion status: pass/u);
  assert.match(markdown, /Revenue evidence ready: yes/u);
  assert.match(markdown, /Enterprise logo scale ready: yes/u);
  assert.match(markdown, /NRR expansion evidence ready: yes/u);
  assert.match(markdown, /Commercial credit narrative ready: yes/u);
  assert.match(markdown, /Strategic conversation evidence ready: yes/u);
  assert.match(markdown, /Valuation outcome evidence ready: no/u);
  assert.match(markdown, /Trust certification evidence ready: yes/u);
  assert.match(markdown, /North Star engine shipping ready: yes/u);
  assert.match(markdown, /Unity plugin acquisition ready: yes/u);
  assert.match(markdown, /Business model proof status: pass/u);
  assert.match(markdown, /Managed inference proof ready: yes/u);
  assert.match(markdown, /Marketplace GMV proof ready: yes/u);
  assert.match(markdown, /Tri-engine acquisition proof ready: yes/u);
  assert.match(markdown, /Weekly active engine shippers/u);
  assert.match(markdown, /Unity Verified Solution/u);
});

test('acquisition readiness endpoint is admin protected and supports markdown', async () => {
  await withServer({
    auditAdminToken: 'acquisition-admin-0123456789abcdef',
    acquisitionMetrics: {
      arrUsd: 5_200_000,
      yoyGrowthRate: 1.03,
      nrr: 1.23,
      weeklyActiveDesignersShippingToEngines: 31_000,
      unityVerifiedSolution: true,
      shippedCommercialGameCredits: 5,
      enterpriseLogos: 50,
      soc2Type2Achieved: true,
      iso27001Status: 'achieved',
      cleanCapTable: true,
      strategicConversations: 2,
      seriesBPostMoneyUsd: 225_000_000,
      managedInferenceArrUsd: 1_000_000,
      proModuleRevenueShare: 0.3,
      marketplaceGmvMonthlyUsd: 250_000,
      payingUnityPluginCustomers: 1_000,
      activePlaytestStudios: 100,
    },
    salesMotionMetrics: {
      monthSinceLaunch: 24,
      arrUsd: 5_200_000,
      indiePayingCustomers: 900,
      studioPayingCustomers: 600,
      founderOnboardedIndieCustomers: 720,
      founderOnboardedStudioCustomers: 480,
      enterpriseAccounts: 50,
      topEnterpriseAccountsFounderOwned: 5,
      firstAeHired: true,
      salesTeamHeadcount: 4,
      accountsAbove40kAcv: 50,
      csmCovered40kAccounts: 50,
      qualifiedPipelineArrUsd: 18_000_000,
    },
    enterpriseLogoMetrics: missionEnterpriseLogoMetrics(),
    trustControlReport: passingTrustControlReport(),
    enterpriseContractPacket: passingContractPacket(),
    supportSlaTickets: passingSupportTickets(),
    commercialCreditRecords: commercialCredits(),
    strategicOutreachRecords: exitStrategicOutreachRecords(),
    certificationRoadmapReport: passingCertificationRoadmapReport(),
    northStarGeneratedAt: new Date(Date.UTC(2026, 4, 18, 12)),
    northStarEvents: northStarEvents(),
    businessModelProof: businessModelProof(),
    unityAdoptionMetrics: {
      assetStoreLive: true,
      unityVerifiedSolutionApplied: true,
      unityVerifiedSolutionAchieved: true,
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
    engineExpansionMetrics: triEngineMetrics(),
  }, async (baseUrl) => {
    const denied = await fetch(`${baseUrl}/v1/strategy/acquisition-readiness`);
    assert.equal(denied.status, 401);
    assert.deepEqual(await denied.json(), { error: 'audit_admin_required' });

    const jsonResponse = await fetch(`${baseUrl}/v1/strategy/acquisition-readiness`, {
      headers: { authorization: 'Bearer acquisition-admin-0123456789abcdef' },
    });
    assert.equal(jsonResponse.status, 200);
    const report = await jsonResponse.json() as {
      summary: {
        readyForStrategicProcess: boolean;
        exitOutcomeSecured: boolean;
        missionCompleteCandidate: boolean;
        pass: number;
        checks: number;
        salesMotionStatus: string;
        revenueEvidenceReady: boolean;
        enterpriseLogoScaleReady: boolean;
        nrrExpansionEvidenceReady: boolean;
        commercialCreditNarrativeReady: boolean;
        strategicConversationEvidenceReady: boolean;
        valuationOutcomeEvidenceReady: boolean;
        trustCertificationEvidenceReady: boolean;
        northStarEngineShippingReady: boolean;
        unityPluginAcquisitionReady: boolean;
        businessModelProofStatus: string;
        managedInferenceReady: boolean;
        proModuleRevenueReady: boolean;
        marketplaceGmvReady: boolean;
        playtestAdoptionReady: boolean;
        triEngineAcquisitionReady: boolean;
      };
      metrics: { arrUsd: number; seriesBPostMoneyUsd: number };
    };
    assert.equal(report.summary.readyForStrategicProcess, true);
    assert.equal(report.summary.exitOutcomeSecured, true);
    assert.equal(report.summary.missionCompleteCandidate, false);
    assert.equal(report.summary.pass, report.summary.checks);
    assert.equal(report.summary.salesMotionStatus, 'pass');
    assert.equal(report.summary.revenueEvidenceReady, true);
    assert.equal(report.summary.enterpriseLogoScaleReady, true);
    assert.equal(report.summary.nrrExpansionEvidenceReady, true);
    assert.equal(report.summary.commercialCreditNarrativeReady, true);
    assert.equal(report.summary.strategicConversationEvidenceReady, true);
    assert.equal(report.summary.valuationOutcomeEvidenceReady, true);
    assert.equal(report.summary.trustCertificationEvidenceReady, true);
    assert.equal(report.summary.northStarEngineShippingReady, true);
    assert.equal(report.summary.unityPluginAcquisitionReady, true);
    assert.equal(report.summary.businessModelProofStatus, 'pass');
    assert.equal(report.summary.managedInferenceReady, true);
    assert.equal(report.summary.proModuleRevenueReady, true);
    assert.equal(report.summary.marketplaceGmvReady, true);
    assert.equal(report.summary.playtestAdoptionReady, true);
    assert.equal(report.summary.triEngineAcquisitionReady, true);
    assert.equal(report.metrics.arrUsd, 5_200_000);
    assert.equal(report.metrics.seriesBPostMoneyUsd, 225_000_000);

    const markdownResponse = await fetch(`${baseUrl}/v1/strategy/acquisition-readiness?format=markdown`, {
      headers: { authorization: 'Bearer acquisition-admin-0123456789abcdef' },
    });
    assert.equal(markdownResponse.status, 200);
    assert.match(markdownResponse.headers.get('content-type') ?? '', /text\/markdown/u);
    assert.match(await markdownResponse.text(), /Greybox Acquisition Readiness/u);
  });
});
