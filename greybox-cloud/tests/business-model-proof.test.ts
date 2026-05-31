// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import type http from 'node:http';
import test from 'node:test';
import {
  buildBusinessModelProofReport,
  businessModelProofFromEnv,
  formatBusinessModelProofMarkdown,
  type BusinessModelProofInput,
} from '../src/enterprise/businessModelProof.js';
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

function checkStatus(report: ReturnType<typeof buildBusinessModelProofReport>, checkId: string): string {
  const check = report.checks.find((candidate) => candidate.id === checkId);
  assert.ok(check, `missing ${checkId}`);
  return check.status;
}

function completeProSourcePacket() {
  return {
    reports: [
      'pro-module-revenue-mix',
      'pro-module-release-readiness',
      'pro-module-publish-proof',
      'pro-module-cloud-handoff',
      'pro-module-attach-readiness',
      'pro-module-beta-validation',
    ],
    revenueMixReady: true,
    releaseReady: true,
    publishReady: true,
    publishProductionReady: true,
    publishHandoffReady: true,
    publishReleaseMatchReady: true,
    attachReady: true,
    betaReady: true,
    businessModelReady: true,
  };
}

function completeMarketplaceSourcePacket() {
  return {
    report: 'marketplace-platform-readiness',
    platformReady: true,
    checkoutAttributionReady: true,
    reconciliationReady: true,
    settlementReady: true,
    riskReserveReady: true,
    taxReady: true,
    payoutReady: true,
    businessModelReady: true,
  };
}

function hex64(seed: number): string {
  return seed.toString(16).padStart(64, '0').slice(-64);
}

function proModuleReleaseEvidence(moduleCount: number) {
  const generatedAt = Date.parse('2026-05-20T00:00:00.000Z');
  const releaseChannel = 'launch';
  const objectPrefix = 'greybox-pro';
  const items = Array.from({ length: moduleCount }, (_, index) => {
    const moduleNumber = index + 1;
    const moduleId = `pack-${String(moduleNumber).padStart(2, '0')}`;
    const version = '0.1.0';
    const fileName = `${moduleId}-${version}.gbpro`;
    const envelopeBytes = 40_000 + moduleNumber;
    return {
      moduleId,
      version,
      payloadSha256: hex64(1_000 + moduleNumber),
      envelopeSha256: hex64(2_000 + moduleNumber),
      envelopeBytes,
      contentType: 'application/vnd.greybox.gbpro+json',
      fileName,
      cdnPath: `${objectPrefix}/${releaseChannel}/${fileName}`,
      entitlement: {
        sku: `gbpro.${moduleId}`,
        licenseTier: 'pro',
        grantKey: `pro-module:${moduleId}`,
        price: {
          currency: 'USD',
          oneTimeUsd: 79,
        },
      },
    };
  });
  const manifestObject = {
    kind: 'manifest',
    sourceFileName: 'manifest.json',
    objectKey: `${objectPrefix}/${releaseChannel}/manifest.json`,
    contentType: 'application/json',
    sha256: hex64(9_999),
    bytes: 4_096,
  };
  const bundleObjects = items.map((item) => ({
    kind: 'bundle',
    sourceFileName: item.fileName,
    objectKey: item.cdnPath,
    contentType: item.contentType,
    sha256: item.envelopeSha256,
    bytes: item.envelopeBytes,
    moduleId: item.moduleId,
    version: item.version,
    payloadSha256: item.payloadSha256,
    envelopeSha256: item.envelopeSha256,
  }));
  const totalBytes = manifestObject.bytes + bundleObjects.reduce((sum, object) => sum + object.bytes, 0);
  const uploadPlan = {
    format: 'greybox.pro.bundle-upload-plan/v1',
    generatedAt,
    releaseChannel,
    objectPrefix,
    objectCount: moduleCount + 1,
    totalBytes,
    objects: [manifestObject, ...bundleObjects],
  };
  return {
    releaseManifest: {
      format: 'greybox.pro.bundle-release/v1',
      generatedAt,
      releaseChannel,
      objectPrefix,
      items,
    },
    uploadPlan,
    publishProof: publishProofFromUploadPlan(uploadPlan),
  };
}

function publishProofFromUploadPlan(uploadPlan: {
  generatedAt?: number;
  releaseChannel: string;
  objectPrefix: string;
  objectCount: number;
  totalBytes: number;
}) {
  return {
    format: 'greybox.pro.bundle-publish-proof/v1',
    generatedAt: Math.max(
      Date.parse('2026-05-20T00:00:00.000Z'),
      'generatedAt' in uploadPlan && typeof uploadPlan.generatedAt === 'number' ? uploadPlan.generatedAt : 0,
    ),
    ready: true,
    releaseChannel: uploadPlan.releaseChannel,
    objectPrefix: uploadPlan.objectPrefix,
    keyId: 'greybox-business-model-test',
    uploadPlan: {
      objectCount: uploadPlan.objectCount,
      totalBytes: uploadPlan.totalBytes,
    },
    receipt: {
      provider: 'r2',
      objectCount: uploadPlan.objectCount,
      totalBytes: uploadPlan.totalBytes,
    },
    checks: [
      { id: 'format', status: 'pass', detail: 'Receipt format greybox.pro.bundle-publish-receipt/v1' },
      { id: 'release-channel', status: 'pass', detail: `${uploadPlan.releaseChannel} vs ${uploadPlan.releaseChannel}` },
      { id: 'object-prefix', status: 'pass', detail: `${uploadPlan.objectPrefix} vs ${uploadPlan.objectPrefix}` },
      { id: 'object-count', status: 'pass', detail: `${uploadPlan.objectCount}/${uploadPlan.objectCount} receipt objects matched the upload plan` },
      { id: 'object-integrity', status: 'pass', detail: 'All receipt metadata matches' },
      { id: 'receipt-timeline', status: 'pass', detail: 'Receipt timestamps prove objects were published after this upload plan' },
      { id: 'receipt-safety', status: 'pass', detail: 'Receipt is sanitized' },
    ],
    missingObjectKeys: [],
    extraObjectKeys: [],
    duplicateObjectKeys: [],
    mismatches: [],
    unsafeReceiptFields: [],
    receiptTimelineIssues: [],
  };
}

function cloudHandoffReportFromRelease(release: ReturnType<typeof proModuleReleaseEvidence>) {
  return {
    format: 'greybox.pro.cloud-handoff-report/v1',
    generatedAt: release.publishProof.generatedAt + 1,
    ready: true,
    provider: release.publishProof.receipt.provider,
    releaseChannel: release.uploadPlan.releaseChannel,
    objectPrefix: release.uploadPlan.objectPrefix,
    keyId: release.publishProof.keyId,
    moduleIds: release.releaseManifest.items.map((item) => item.moduleId).sort(),
    objectCount: release.uploadPlan.objectCount,
    totalBytes: release.uploadPlan.totalBytes,
    checks: [
      { id: 'cloud-env-format', status: 'pass', detail: 'Cloud source env format greybox.pro.cloud-source-env/v1' },
      { id: 'required-variables', status: 'pass', detail: 'All Cloud source env variables are present' },
      { id: 'parse-GREYBOX_PRO_MODULE_BUNDLES_JSON', status: 'pass', detail: 'release manifest parses' },
      { id: 'parse-GREYBOX_PRO_MODULE_BUNDLE_UPLOAD_PLAN_JSON', status: 'pass', detail: 'upload plan parses' },
      { id: 'parse-GREYBOX_PRO_MODULE_BUNDLE_PUBLISH_PROOF_JSON', status: 'pass', detail: 'publish proof parses' },
      { id: 'release-format', status: 'pass', detail: 'Release manifest format greybox.pro.bundle-release/v1' },
      { id: 'upload-plan-format', status: 'pass', detail: 'Upload plan format greybox.pro.bundle-upload-plan/v1' },
      { id: 'publish-proof-format', status: 'pass', detail: 'Publish proof format greybox.pro.bundle-publish-proof/v1' },
      { id: 'publish-proof-ready', status: 'pass', detail: 'Publish proof is ready' },
      { id: 'production-provider', status: 'pass', detail: 'r2 production-backed' },
      { id: 'module-coverage', status: 'pass', detail: 'All module bundles are covered' },
      { id: 'release-fields-match', status: 'pass', detail: 'Release fields match' },
      { id: 'object-counts-match', status: 'pass', detail: 'Object counts match' },
      { id: 'handoff-timeline', status: 'pass', detail: 'Timeline is fresh' },
      { id: 'sanitized-evidence', status: 'pass', detail: 'Evidence is sanitized' },
    ],
  };
}

test('business model proof passes acquisition margin and platform gates', () => {
  const report = buildBusinessModelProofReport({
    proof: passingBusinessModelProof(),
    now: new Date('2026-05-18T00:00:00.000Z'),
  });

  assert.equal(report.generatedAt, '2026-05-18T00:00:00.000Z');
  assert.equal(report.summary.status, 'pass');
  assert.equal(report.summary.acquisitionBusinessModelReady, true);
  assert.equal(report.summary.managedInferenceReady, true);
  assert.equal(report.summary.proModuleReady, true);
  assert.equal(report.summary.marketplaceReady, true);
  assert.equal(report.summary.marketplaceReconciliationReady, true);
  assert.equal(report.summary.marketplaceReconciliationIssues, 0);
  assert.equal(report.summary.marketplaceRiskReserveReady, true);
  assert.equal(report.summary.marketplaceReserveShortfallCents, 0);
  assert.equal(report.summary.marketplaceStripeEventForwardingReady, true);
  assert.equal(report.summary.marketplaceForwardedStripeEvents, 4);
  assert.equal(report.summary.playtestReady, true);
  assert.equal(report.summary.managedInferenceArrUsd, 1_250_000);
  assert.equal(report.summary.proModuleRevenueShare, 0.34);
  assert.equal(report.summary.proModuleAttachRateBps, 8_333);
  assert.equal(report.summary.proModuleExpansionArrUsd, 3_000);
  assert.equal(report.summary.proModuleBetaValidatedModules, 5);
  assert.equal(report.summary.proModuleBetaDesignPartners, 10);
  assert.equal(report.summary.proModuleBetaReviewedExports, 10);
  assert.equal(report.summary.proModuleBetaAcceptedDiffRateBps, 7_500);
  assert.equal(report.summary.marketplaceMonthlyGmvUsd, 310_000);
  assert.equal(report.summary.marketplaceUniqueBuyers, 260);
  assert.equal(report.summary.marketplaceTopCreatorGmvShareBps, 2_200);
  assert.equal(report.summary.marketplaceTopBuyerGmvShareBps, 2_100);
  assert.equal(report.summary.marketplaceSettlementReady, true);
  assert.equal(report.summary.marketplaceSettlementPayoutShareBps, 9_400);
  assert.equal(report.summary.playtestActiveStudios, 120);
  assert.equal(report.summary.playtestQaSavingsUsd, 820_000);
  assert.equal(report.summary.pass, report.summary.checks);
  assert.doesNotMatch(JSON.stringify(report), /customer@example\.com|API_KEY|SECRET|TOKEN/u);
});

test('business model proof fails closed when aggregate evidence is missing', () => {
  const report = buildBusinessModelProofReport({
    now: new Date('2026-05-18T00:00:00.000Z'),
  });

  assert.equal(report.summary.status, 'fail');
  assert.equal(report.summary.acquisitionBusinessModelReady, false);
  assert.equal(report.summary.managedInferenceReady, false);
  assert.equal(report.summary.proModuleReady, false);
  assert.equal(report.summary.marketplaceReady, false);
  assert.equal(report.summary.playtestReady, false);
  assert.equal(report.summary.fail, report.summary.checks);
});

test('business model proof fails target-scale claims without controls', () => {
  const cases: Array<{
    name: string;
    checkId: string;
    mutate: (proof: BusinessModelProofInput) => void;
  }> = [
    {
      name: 'managed inference revenue without metering controls',
      checkId: 'managed-inference-proof',
      mutate: (proof) => {
        proof.managedInference = {
          ...proof.managedInference!,
          providerReconciliationOk: false,
          stripeMeterEvents: 0,
        };
      },
    },
    {
      name: 'Pro module revenue without signed bundle enforcement',
      checkId: 'pro-module-proof',
      mutate: (proof) => {
        proof.proModules = {
          ...proof.proModules!,
          signedBundles: 6,
          loaderRejectsUnsigned: false,
        };
      },
    },
    {
      name: 'Pro module revenue without CDN publish proof',
      checkId: 'pro-module-proof',
      mutate: (proof) => {
        proof.proModules = {
          ...proof.proModules!,
          publishedObjects: 0,
        };
      },
    },
    {
      name: 'Pro module revenue without attach readiness handoff',
      checkId: 'pro-module-proof',
      mutate: (proof) => {
        proof.proModules = {
          ...proof.proModules!,
          attachReady: false,
        };
      },
    },
    {
      name: 'Pro module revenue without multi-module expansion',
      checkId: 'pro-module-proof',
      mutate: (proof) => {
        proof.proModules = {
          ...proof.proModules!,
          multiModuleAttachRateBps: 200,
          expansionArrUsd: 0,
        };
      },
    },
    {
      name: 'Pro module revenue without beta validation proof',
      checkId: 'pro-module-proof',
      mutate: (proof) => {
        proof.proModules = {
          ...proof.proModules!,
          betaReady: false,
          betaValidatedModules: 0,
          betaDesignPartners: 0,
          betaReviewedExports: 0,
          betaAcceptedDiffRateBps: 0,
        };
      },
    },
    {
      name: 'marketplace GMV without buyer diversity',
      checkId: 'marketplace-proof',
      mutate: (proof) => {
        proof.marketplace = {
          ...proof.marketplace!,
          uniqueBuyers: 1,
        };
      },
    },
    {
      name: 'marketplace GMV concentrated in one buyer',
      checkId: 'marketplace-proof',
      mutate: (proof) => {
        proof.marketplace = {
          ...proof.marketplace!,
          topBuyerGmvShareBps: 8_500,
        };
      },
    },
    {
      name: 'marketplace GMV concentrated in one seller',
      checkId: 'marketplace-proof',
      mutate: (proof) => {
        proof.marketplace = {
          ...proof.marketplace!,
          topCreatorGmvShareBps: 8_500,
        };
      },
    },
    {
      name: 'marketplace GMV without seller concentration handoff',
      checkId: 'marketplace-proof',
      mutate: (proof) => {
        const { topCreatorGmvShareBps, ...marketplace } = proof.marketplace!;
        void topCreatorGmvShareBps;
        proof.marketplace = marketplace;
      },
    },
    {
      name: 'marketplace GMV without buyer concentration handoff',
      checkId: 'marketplace-proof',
      mutate: (proof) => {
        const { topBuyerGmvShareBps, ...marketplace } = proof.marketplace!;
        void topBuyerGmvShareBps;
        proof.marketplace = marketplace;
      },
    },
    {
      name: 'marketplace GMV without platform readiness',
      checkId: 'marketplace-proof',
      mutate: (proof) => {
        proof.marketplace = {
          ...proof.marketplace!,
          platformReady: false,
        };
      },
    },
    {
      name: 'marketplace GMV without clean reconciliation evidence',
      checkId: 'marketplace-proof',
      mutate: (proof) => {
        proof.marketplace = {
          ...proof.marketplace!,
          reconciliationReady: false,
          reconciliationIssues: 1,
        };
      },
    },
    {
      name: 'marketplace GMV without Stripe event forwarding',
      checkId: 'marketplace-proof',
      mutate: (proof) => {
        proof.marketplace = {
          ...proof.marketplace!,
          stripeEventForwardingReady: false,
          forwardedStripeEvents: 0,
        };
      },
    },
    {
      name: 'marketplace GMV without settled payout proof',
      checkId: 'marketplace-proof',
      mutate: (proof) => {
        proof.marketplace = {
          ...proof.marketplace!,
          settlementReady: false,
          settlementPayoutShareBps: 1_200,
        };
      },
    },
    {
      name: 'marketplace GMV without reconciliation handoff fields',
      checkId: 'marketplace-proof',
      mutate: (proof) => {
        const { reconciliationReady, reconciliationIssues, ...marketplace } = proof.marketplace!;
        void reconciliationReady;
        void reconciliationIssues;
        proof.marketplace = marketplace;
      },
    },
    {
      name: 'playtest studio adoption without production runs',
      checkId: 'playtest-proof',
      mutate: (proof) => {
        proof.playtest = {
          ...proof.playtest!,
          acceptedTuningSuggestions: 0,
          completedRuns: 0,
        };
      },
    },
    {
      name: 'playtest studio adoption without QA savings proof',
      checkId: 'playtest-proof',
      mutate: (proof) => {
        proof.playtest = {
          ...proof.playtest!,
          qaSavingsUsd: 0,
        };
      },
    },
  ];

  for (const scenario of cases) {
    const proof = passingBusinessModelProof();
    scenario.mutate(proof);
    const report = buildBusinessModelProofReport({
      proof,
      now: new Date('2026-05-18T00:00:00.000Z'),
    });

    assert.equal(report.summary.status, 'fail', scenario.name);
    assert.equal(report.summary.acquisitionBusinessModelReady, false, scenario.name);
    assert.equal(checkStatus(report, scenario.checkId), 'fail', scenario.name);
  }
});

test('business model proof requires proprietary source-readiness handoff flags', () => {
  const cases: Array<{
    name: string;
    checkId: string;
    mutate: (proof: BusinessModelProofInput) => void;
  }> = [
    {
      name: 'Pro module proof without production publish source flag',
      checkId: 'pro-module-proof',
      mutate: (proof) => {
        proof.proModules = {
          ...proof.proModules!,
          publishProductionReady: false,
        };
      },
    },
    {
      name: 'Pro module proof without source-ready export flag',
      checkId: 'pro-module-proof',
      mutate: (proof) => {
        proof.proModules = {
          ...proof.proModules!,
          sourceBusinessModelReady: false,
        };
      },
    },
    {
      name: 'marketplace proof without source-ready export flag',
      checkId: 'marketplace-proof',
      mutate: (proof) => {
        proof.marketplace = {
          ...proof.marketplace!,
          sourceBusinessModelReady: false,
        };
      },
    },
    {
      name: 'playtest proof without production persona source flag',
      checkId: 'playtest-proof',
      mutate: (proof) => {
        proof.playtest = {
          ...proof.playtest!,
          personaProductionReady: false,
        };
      },
    },
    {
      name: 'playtest proof without source-ready export flag',
      checkId: 'playtest-proof',
      mutate: (proof) => {
        proof.playtest = {
          ...proof.playtest!,
          sourceBusinessModelReady: false,
        };
      },
    },
  ];

  for (const scenario of cases) {
    const proof = passingBusinessModelProof();
    scenario.mutate(proof);
    const report = buildBusinessModelProofReport({
      proof,
      now: new Date('2026-05-18T00:00:00.000Z'),
    });

    assert.equal(report.summary.status, 'fail', scenario.name);
    assert.equal(report.summary.acquisitionBusinessModelReady, false, scenario.name);
    assert.equal(checkStatus(report, scenario.checkId), 'fail', scenario.name);
    const check = report.checks.find((candidate) => candidate.id === scenario.checkId);
    assert.match(check?.current ?? '', /blocked/u, scenario.name);
  }
});

test('business model proof env parser sanitizes known aggregate fields', () => {
  assert.deepEqual(businessModelProofFromEnv({ GREYBOX_BUSINESS_MODEL_PROOF_JSON: 'not-json' }), {});
  const parsed = businessModelProofFromEnv({
    GREYBOX_BUSINESS_MODEL_PROOF_JSON: JSON.stringify({
      managedInference: {
        arrUsd: 125_000,
        grossMargin: 68,
        meteredBillingAudited: true,
        customerEmail: 'customer@example.com',
      },
      proModules: {
        revenueShare: 30,
        shippedModules: 6,
        publishedObjects: 7,
        attachRateBps: 4_200,
        multiModuleAttachRateBps: 1_700,
        studioEnterpriseAttachRateBps: 6_100,
        expansionArrUsd: 3_000,
        proChurnedCustomerRateBps: 900,
        modulesWithActiveCustomers: 5,
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
        licenseToken: 'gbx_secret',
      },
      marketplace: {
        monthlyGmvUsd: 26_000,
        activeSellers: 52,
        uniqueBuyers: 53,
        platformReady: true,
        sourceBusinessModelReady: true,
        checkoutOrderShareBps: 9_100,
        checkoutGmvShareBps: 9_050,
        settlementReady: true,
        settlementPayoutShareBps: 9_200,
        topCreatorGmvShareBps: 2_300,
        topBuyerGmvShareBps: 2_400,
        payoutBlockers: 0,
        taxBlockers: 0,
        reconciliationReady: true,
        reconciliationIssues: 0,
        riskReserveReady: true,
        reserveShortfallCents: 0,
        stripeEventForwardingReady: true,
        forwardedStripeEvents: 4,
        creatorName: 'private creator',
      },
      playtest: {
        activePayingStudios: 24,
        personasInProduction: 6,
        completedRuns: 120,
        personaProductionReady: true,
        sourceBusinessModelReady: true,
        privateGameIp: '<html>secret</html>',
      },
    }),
  });

  assert.deepEqual(parsed, {
    managedInference: {
      arrUsd: 125_000,
      grossMargin: 68,
      meteredBillingAudited: true,
    },
    proModules: {
      revenueShare: 30,
      shippedModules: 6,
      publishedObjects: 7,
      attachRateBps: 4_200,
      multiModuleAttachRateBps: 1_700,
      studioEnterpriseAttachRateBps: 6_100,
      expansionArrUsd: 3_000,
      proChurnedCustomerRateBps: 900,
      modulesWithActiveCustomers: 5,
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
    },
    marketplace: {
      monthlyGmvUsd: 26_000,
      activeSellers: 52,
      uniqueBuyers: 53,
      platformReady: true,
      checkoutOrderShareBps: 9_100,
      checkoutGmvShareBps: 9_050,
      settlementReady: true,
      settlementPayoutShareBps: 9_200,
      topCreatorGmvShareBps: 2_300,
      topBuyerGmvShareBps: 2_400,
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
      activePayingStudios: 24,
      personasInProduction: 6,
      completedRuns: 120,
      personaProductionReady: true,
    },
  });
  assert.doesNotMatch(JSON.stringify(parsed), /customer@example\.com|gbx_secret|private creator|secret/u);
});

test('business model proof rejects raw Pro and Playtest source-ready aggregate flags', () => {
  const parsed = businessModelProofFromEnv({
    GREYBOX_BUSINESS_MODEL_PROOF_JSON: JSON.stringify({
      proModules: passingBusinessModelProof().proModules,
      playtest: passingBusinessModelProof().playtest,
    }),
  });

  assert.equal(parsed.proModules?.sourceBusinessModelReady, undefined);
  assert.equal(parsed.playtest?.sourceBusinessModelReady, undefined);

  const proof = passingBusinessModelProof();
  proof.proModules = parsed.proModules;
  proof.playtest = parsed.playtest;
  const report = buildBusinessModelProofReport({
    proof,
    now: new Date('2026-05-18T00:00:00.000Z'),
  });

  assert.equal(report.summary.proModuleReady, false);
  assert.equal(report.summary.playtestReady, false);
  assert.equal(checkStatus(report, 'pro-module-proof'), 'fail');
  assert.equal(checkStatus(report, 'playtest-proof'), 'fail');
});

test('business model proof derives Marketplace Stripe event forwarding from hosted webhook env', () => {
  const parsed = businessModelProofFromEnv({
    GREYBOX_BUSINESS_MODEL_PROOF_JSON: JSON.stringify({
      marketplace: {
        ...passingBusinessModelProof().marketplace,
        stripeEventForwardingReady: false,
        forwardedStripeEvents: 0,
      },
      source: completeMarketplaceSourcePacket(),
    }),
    STRIPE_WEBHOOK_SECRET: 'whsec_ready_0123456789abcdef',
    GREYBOX_STRIPE_WEBHOOK_EVENTS: 'checkout.session.completed,charge.dispute.created,charge.dispute.closed,charge.refunded',
    GREYBOX_MARKETPLACE_URL: 'https://marketplace.greybox.studio',
    GREYBOX_MARKETPLACE_ADMIN_TOKEN: 'marketplace-admin-0123456789abcdef',
    GREYBOX_AUDIT_LOG_DIR: '/secure/audit',
    GREYBOX_MARKETPLACE_STRIPE_EVENT_FORWARD_COUNT: '4',
  });

  assert.equal(parsed.marketplace?.stripeEventForwardingReady, true);
  assert.equal(parsed.marketplace?.forwardedStripeEvents, 4);
  assert.equal(parsed.marketplace?.sourceBusinessModelReady, true);

  const proof = passingBusinessModelProof();
  proof.marketplace = parsed.marketplace;
  const report = buildBusinessModelProofReport({
    proof,
    now: new Date('2026-05-18T00:00:00.000Z'),
  });

  assert.equal(report.summary.marketplaceReady, true);
  assert.equal(checkStatus(report, 'marketplace-proof'), 'pass');
  assert.doesNotMatch(JSON.stringify(parsed), /marketplace-admin|whsec_ready|secure\/audit/u);
});

test('business model proof accepts complete Marketplace source handoff packet', () => {
  const parsed = businessModelProofFromEnv({
    GREYBOX_BUSINESS_MODEL_PROOF_JSON: JSON.stringify({
      marketplace: passingBusinessModelProof().marketplace,
      source: completeMarketplaceSourcePacket(),
    }),
  });

  assert.equal(parsed.marketplace?.platformReady, true);
  assert.equal(parsed.marketplace?.reconciliationReady, true);
  assert.equal(parsed.marketplace?.settlementReady, true);
  assert.equal(parsed.marketplace?.riskReserveReady, true);
  assert.equal(parsed.marketplace?.sourceBusinessModelReady, true);

  const proof = passingBusinessModelProof();
  proof.marketplace = parsed.marketplace;
  const report = buildBusinessModelProofReport({
    proof,
    now: new Date('2026-05-18T00:00:00.000Z'),
  });

  assert.equal(report.summary.marketplaceReady, true);
  assert.equal(checkStatus(report, 'marketplace-proof'), 'pass');
});

test('business model proof rejects incomplete Marketplace source handoff packet', () => {
  const source = completeMarketplaceSourcePacket();
  source.riskReserveReady = false;
  const parsed = businessModelProofFromEnv({
    GREYBOX_BUSINESS_MODEL_PROOF_JSON: JSON.stringify({
      marketplace: passingBusinessModelProof().marketplace,
      source,
    }),
  });

  assert.equal(parsed.marketplace?.riskReserveReady, false);
  assert.equal(parsed.marketplace?.sourceBusinessModelReady, false);

  const proof = passingBusinessModelProof();
  proof.marketplace = parsed.marketplace;
  const report = buildBusinessModelProofReport({
    proof,
    now: new Date('2026-05-18T00:00:00.000Z'),
  });

  assert.equal(report.summary.marketplaceReady, false);
  assert.equal(checkStatus(report, 'marketplace-proof'), 'fail');
  const check = report.checks.find((candidate) => candidate.id === 'marketplace-proof');
  assert.match(check?.current ?? '', /source blocked/u);
});

test('business model proof derives Pro bundle counters from release publish evidence', () => {
  const release = proModuleReleaseEvidence(12);
  const parsed = businessModelProofFromEnv({
    GREYBOX_BUSINESS_MODEL_PROOF_JSON: JSON.stringify({
      proModules: {
        ...passingBusinessModelProof().proModules,
        shippedModules: 0,
        signedBundles: 0,
        publishedObjects: 0,
      },
      source: completeProSourcePacket(),
    }),
    GREYBOX_PRO_MODULE_BUNDLES_JSON: JSON.stringify(release.releaseManifest),
    GREYBOX_PRO_MODULE_BUNDLE_UPLOAD_PLAN_JSON: JSON.stringify(release.uploadPlan),
    GREYBOX_PRO_MODULE_BUNDLE_PUBLISH_PROOF_JSON: JSON.stringify(release.publishProof),
    GREYBOX_PRO_MODULE_CLOUD_HANDOFF_REPORT_JSON: JSON.stringify(cloudHandoffReportFromRelease(release)),
  });

  assert.equal(parsed.proModules?.shippedModules, 12);
  assert.equal(parsed.proModules?.signedBundles, 12);
  assert.equal(parsed.proModules?.publishedObjects, 13);
  assert.equal(parsed.proModules?.publishProductionReady, true);
  assert.equal(parsed.proModules?.publishHandoffReady, true);
  assert.equal(parsed.proModules?.publishReleaseMatchReady, true);
  assert.doesNotMatch(JSON.stringify(parsed), /greybox-pro\/launch|gbpro\.pack|pro-module:pack/u);

  const proof = passingBusinessModelProof();
  proof.proModules = parsed.proModules;
  const report = buildBusinessModelProofReport({
    proof,
    now: new Date('2026-05-18T00:00:00.000Z'),
  });

  assert.equal(report.summary.proModuleReady, true);
  assert.equal(checkStatus(report, 'pro-module-proof'), 'pass');
});

test('business model proof requires Pro Cloud handoff source evidence', () => {
  const release = proModuleReleaseEvidence(12);
  const parsed = businessModelProofFromEnv({
    GREYBOX_BUSINESS_MODEL_PROOF_JSON: JSON.stringify({
      proModules: passingBusinessModelProof().proModules,
    }),
    GREYBOX_PRO_MODULE_BUNDLES_JSON: JSON.stringify(release.releaseManifest),
    GREYBOX_PRO_MODULE_BUNDLE_UPLOAD_PLAN_JSON: JSON.stringify(release.uploadPlan),
    GREYBOX_PRO_MODULE_BUNDLE_PUBLISH_PROOF_JSON: JSON.stringify(release.publishProof),
  });

  assert.equal(parsed.proModules?.publishProductionReady, true);
  assert.equal(parsed.proModules?.publishHandoffReady, false);
  assert.equal(parsed.proModules?.publishReleaseMatchReady, true);

  const proof = passingBusinessModelProof();
  proof.proModules = parsed.proModules;
  const report = buildBusinessModelProofReport({
    proof,
    now: new Date('2026-05-18T00:00:00.000Z'),
  });

  assert.equal(report.summary.proModuleReady, false);
  assert.equal(checkStatus(report, 'pro-module-proof'), 'fail');
  const check = report.checks.find((candidate) => candidate.id === 'pro-module-proof');
  assert.match(check?.current ?? '', /Cloud handoff blocked/u);
});

test('business model proof rejects Pro source evidence from local dry-run publish storage', () => {
  const release = proModuleReleaseEvidence(12);
  const dryRunPublishProof = {
    ...release.publishProof,
    receipt: {
      ...release.publishProof.receipt,
      provider: 'local-dry-run',
    },
  };
  const parsed = businessModelProofFromEnv({
    GREYBOX_BUSINESS_MODEL_PROOF_JSON: JSON.stringify({
      proModules: passingBusinessModelProof().proModules,
    }),
    GREYBOX_PRO_MODULE_BUNDLES_JSON: JSON.stringify(release.releaseManifest),
    GREYBOX_PRO_MODULE_BUNDLE_UPLOAD_PLAN_JSON: JSON.stringify(release.uploadPlan),
    GREYBOX_PRO_MODULE_BUNDLE_PUBLISH_PROOF_JSON: JSON.stringify(dryRunPublishProof),
  });

  assert.equal(parsed.proModules?.shippedModules, 12);
  assert.equal(parsed.proModules?.signedBundles, 12);
  assert.equal(parsed.proModules?.publishedObjects, 13);
  assert.equal(parsed.proModules?.publishReleaseMatchReady, true);
  assert.equal(parsed.proModules?.publishProductionReady, false);
  assert.equal(parsed.proModules?.publishHandoffReady, false);

  const proof = passingBusinessModelProof();
  proof.proModules = parsed.proModules;
  const report = buildBusinessModelProofReport({
    proof,
    now: new Date('2026-05-18T00:00:00.000Z'),
  });

  assert.equal(report.summary.proModuleReady, false);
  assert.equal(checkStatus(report, 'pro-module-proof'), 'fail');
  const check = report.checks.find((candidate) => candidate.id === 'pro-module-proof');
  assert.match(check?.current ?? '', /production publish blocked/u);
});

test('business model proof ignores stale Pro publish evidence', () => {
  const release = proModuleReleaseEvidence(12);
  const parsed = businessModelProofFromEnv({
    GREYBOX_BUSINESS_MODEL_PROOF_JSON: JSON.stringify({
      proModules: {
        ...passingBusinessModelProof().proModules,
        shippedModules: 12,
        signedBundles: 12,
        publishedObjects: 13,
      },
    }),
    GREYBOX_PRO_MODULE_BUNDLES_JSON: JSON.stringify(release.releaseManifest),
    GREYBOX_PRO_MODULE_BUNDLE_UPLOAD_PLAN_JSON: JSON.stringify(release.uploadPlan),
    GREYBOX_PRO_MODULE_BUNDLE_PUBLISH_PROOF_JSON: JSON.stringify({
      ...release.publishProof,
      generatedAt: release.uploadPlan.generatedAt - 1,
    }),
  });

  assert.equal(parsed.proModules?.shippedModules, 0);
  assert.equal(parsed.proModules?.signedBundles, 0);
  assert.equal(parsed.proModules?.publishedObjects, 0);
  assert.equal(parsed.proModules?.publishProductionReady, false);
  assert.equal(parsed.proModules?.publishHandoffReady, false);
  assert.equal(parsed.proModules?.publishReleaseMatchReady, false);

  const proof = passingBusinessModelProof();
  proof.proModules = parsed.proModules;
  const report = buildBusinessModelProofReport({
    proof,
    now: new Date('2026-05-18T00:00:00.000Z'),
  });

  assert.equal(report.summary.proModuleReady, false);
  assert.equal(checkStatus(report, 'pro-module-proof'), 'fail');
});

test('business model proof fails Pro source exports with mismatched publish release train', () => {
  const parsed = businessModelProofFromEnv({
    GREYBOX_BUSINESS_MODEL_PROOF_JSON: JSON.stringify({
      proModules: passingBusinessModelProof().proModules,
      source: {
        publishProductionReady: false,
        publishHandoffReady: false,
        publishReleaseMatchReady: false,
        betaReady: false,
        businessModelReady: false,
      },
    }),
  });

  assert.equal(parsed.proModules?.publishReleaseMatchReady, false);
  assert.equal(parsed.proModules?.publishProductionReady, false);
  assert.equal(parsed.proModules?.publishHandoffReady, false);
  assert.equal(parsed.proModules?.betaReady, false);
  assert.equal(parsed.proModules?.sourceBusinessModelReady, false);

  const proof = passingBusinessModelProof();
  proof.proModules = parsed.proModules;
  const report = buildBusinessModelProofReport({
    proof,
    now: new Date('2026-05-18T00:00:00.000Z'),
  });

  assert.equal(report.summary.proModuleReady, false);
  assert.equal(checkStatus(report, 'pro-module-proof'), 'fail');
  const check = report.checks.find((candidate) => candidate.id === 'pro-module-proof');
  assert.match(check?.current ?? '', /release match blocked/u);
});

test('business model proof accepts complete Pro source handoff packet', () => {
  const parsed = businessModelProofFromEnv({
    GREYBOX_BUSINESS_MODEL_PROOF_JSON: JSON.stringify({
      proModules: passingBusinessModelProof().proModules,
      source: completeProSourcePacket(),
    }),
  });

  assert.equal(parsed.proModules?.publishProductionReady, true);
  assert.equal(parsed.proModules?.publishHandoffReady, true);
  assert.equal(parsed.proModules?.publishReleaseMatchReady, true);
  assert.equal(parsed.proModules?.attachReady, true);
  assert.equal(parsed.proModules?.betaReady, true);
  assert.equal(parsed.proModules?.sourceBusinessModelReady, true);

  const proof = passingBusinessModelProof();
  proof.proModules = parsed.proModules;
  const report = buildBusinessModelProofReport({
    proof,
    now: new Date('2026-05-18T00:00:00.000Z'),
  });

  assert.equal(report.summary.proModuleReady, true);
  assert.equal(checkStatus(report, 'pro-module-proof'), 'pass');
});

test('business model proof rejects incomplete Pro source report sets', () => {
  const incomplete = completeProSourcePacket();
  incomplete.reports = incomplete.reports.filter((report) => report !== 'pro-module-cloud-handoff');
  const parsed = businessModelProofFromEnv({
    GREYBOX_BUSINESS_MODEL_PROOF_JSON: JSON.stringify({
      proModules: passingBusinessModelProof().proModules,
      source: incomplete,
    }),
  });

  assert.equal(parsed.proModules?.publishHandoffReady, true);
  assert.equal(parsed.proModules?.sourceBusinessModelReady, false);

  const proof = passingBusinessModelProof();
  proof.proModules = parsed.proModules;
  const report = buildBusinessModelProofReport({
    proof,
    now: new Date('2026-05-18T00:00:00.000Z'),
  });

  assert.equal(report.summary.proModuleReady, false);
  assert.equal(checkStatus(report, 'pro-module-proof'), 'fail');
  const check = report.checks.find((candidate) => candidate.id === 'pro-module-proof');
  assert.match(check?.current ?? '', /source blocked/u);
});

test('business model proof requires Playtest source persona production proof', () => {
  const parsed = businessModelProofFromEnv({
    GREYBOX_BUSINESS_MODEL_PROOF_JSON: JSON.stringify({
      playtest: passingBusinessModelProof().playtest,
      source: {
        reports: ['playtest-adoption', 'playtest-qa-savings', 'playtest-regression'],
        adoptionReady: true,
        qaSavingsReady: true,
        regressionReady: true,
        personaProductionReady: false,
        businessModelReady: true,
      },
    }),
  });

  assert.equal(parsed.playtest?.sourceBusinessModelReady, false);
  assert.equal(parsed.playtest?.personaProductionReady, false);

  const proof = passingBusinessModelProof();
  proof.playtest = parsed.playtest;
  const report = buildBusinessModelProofReport({
    proof,
    now: new Date('2026-05-18T00:00:00.000Z'),
  });

  assert.equal(report.summary.playtestReady, false);
  assert.equal(checkStatus(report, 'playtest-proof'), 'fail');
  const check = report.checks.find((candidate) => candidate.id === 'playtest-proof');
  assert.match(check?.current ?? '', /persona source blocked/u);
});

test('business model proof accepts Playtest rehearsal handoff at Cloud target scale', () => {
  const parsed = businessModelProofFromEnv({
    GREYBOX_BUSINESS_MODEL_PROOF_JSON: JSON.stringify({
      playtest: {
        activePayingStudios: 100,
        personasInProduction: 10,
        acceptedTuningSuggestions: 24,
        completedRuns: 2_450,
        qaSavingsUsd: 510_480,
        sourceBusinessModelReady: true,
      },
      source: {
        reports: ['playtest-adoption', 'playtest-qa-savings', 'playtest-regression'],
        generatedAt: Date.UTC(2026, 4, 18, 7),
        adoptionReady: true,
        qaSavingsReady: true,
        regressionReady: true,
        personaProductionReady: true,
        businessModelReady: true,
        adoptionPeriod: {
          from: Date.UTC(2026, 4, 1),
          to: Date.UTC(2026, 5, 1),
          label: '2026-05',
        },
      },
    }),
  });

  assert.deepEqual(parsed.playtest, {
    activePayingStudios: 100,
    personasInProduction: 10,
    acceptedTuningSuggestions: 24,
    completedRuns: 2_450,
    qaSavingsUsd: 510_480,
    personaProductionReady: true,
    sourceBusinessModelReady: true,
  });

  const proof = passingBusinessModelProof();
  proof.playtest = parsed.playtest;
  const report = buildBusinessModelProofReport({
    proof,
    now: new Date('2026-05-18T00:00:00.000Z'),
  });

  assert.equal(report.summary.playtestReady, true);
  assert.equal(checkStatus(report, 'playtest-proof'), 'pass');
  assert.doesNotMatch(JSON.stringify(parsed), /studio_paid_|qa-director@example\.com|<html|greybox:playtest:event/u);
});

test('business model proof rejects Playtest source exports missing component readiness', () => {
  const parsed = businessModelProofFromEnv({
    GREYBOX_BUSINESS_MODEL_PROOF_JSON: JSON.stringify({
      playtest: passingBusinessModelProof().playtest,
      source: {
        reports: ['playtest-adoption', 'playtest-qa-savings', 'playtest-regression'],
        adoptionReady: true,
        qaSavingsReady: false,
        regressionReady: true,
        personaProductionReady: true,
        businessModelReady: true,
      },
    }),
  });

  assert.equal(parsed.playtest?.personaProductionReady, true);
  assert.equal(parsed.playtest?.sourceBusinessModelReady, false);

  const proof = passingBusinessModelProof();
  proof.playtest = parsed.playtest;
  const report = buildBusinessModelProofReport({
    proof,
    now: new Date('2026-05-18T00:00:00.000Z'),
  });

  assert.equal(report.summary.playtestReady, false);
  assert.equal(checkStatus(report, 'playtest-proof'), 'fail');
});

test('business model proof fails closed when marketplace scale is under-reserved', () => {
  const proof = passingBusinessModelProof();
  proof.marketplace = {
    ...proof.marketplace,
    riskReserveReady: false,
    reserveShortfallCents: 100_000,
  };

  const report = buildBusinessModelProofReport({
    proof,
    now: new Date('2026-05-18T00:00:00.000Z'),
  });

  assert.equal(report.summary.status, 'fail');
  assert.equal(report.summary.acquisitionBusinessModelReady, false);
  assert.equal(report.summary.marketplaceReady, false);
  assert.equal(report.summary.marketplaceReconciliationReady, true);
  assert.equal(report.summary.marketplaceReconciliationIssues, 0);
  assert.equal(report.summary.marketplaceRiskReserveReady, false);
  assert.equal(report.summary.marketplaceReserveShortfallCents, 100_000);
  const check = report.checks.find((candidate) => candidate.id === 'marketplace-proof');
  assert.equal(check?.status, 'fail');
  assert.match(check?.current ?? '', /\$1K short/u);
  assert.match(check?.target ?? '', /reserve blockers/u);
});

test('business model proof rejects padded marketplace GMV attribution', () => {
  const proof = passingBusinessModelProof();
  proof.marketplace = {
    ...proof.marketplace,
    checkoutOrderShareBps: 9_500,
    checkoutGmvShareBps: 1_800,
  };

  const report = buildBusinessModelProofReport({
    proof,
    now: new Date('2026-05-18T00:00:00.000Z'),
  });

  assert.equal(report.summary.status, 'fail');
  assert.equal(report.summary.acquisitionBusinessModelReady, false);
  assert.equal(report.summary.marketplaceReady, false);
  const check = report.checks.find((candidate) => candidate.id === 'marketplace-proof');
  assert.equal(check?.status, 'fail');
  assert.match(check?.current ?? '', /18% checkout GMV/u);
  assert.match(check?.target ?? '', /order\/GMV attribution/u);
});

test('business model proof markdown is concise and secret-safe', () => {
  const markdown = formatBusinessModelProofMarkdown(buildBusinessModelProofReport({
    proof: passingBusinessModelProof(),
    now: new Date('2026-05-18T00:00:00.000Z'),
  }));

  assert.match(markdown, /Greybox Business Model Proof/u);
  assert.match(markdown, /Acquisition business model ready: yes/u);
  assert.match(markdown, /Managed inference ARR: \$1\.3M/u);
  assert.match(markdown, /Pro module attach: 83\.33%/u);
  assert.match(markdown, /Pro module expansion ARR: \$3K/u);
  assert.match(markdown, /Pro beta validation: 5 module\(s\), 10 partner\(s\), 10 reviewed export\(s\), 75% accepted diffs/u);
  assert.match(markdown, /Marketplace GMV\/month: \$310K/u);
  assert.match(markdown, /Marketplace unique buyers: 260/u);
  assert.match(markdown, /Marketplace top seller: 22%/u);
  assert.match(markdown, /Marketplace top buyer: 21%/u);
  assert.match(markdown, /Marketplace reconciliation: ready \(0 issue\(s\)\)/u);
  assert.match(markdown, /Marketplace settlement: ready \(94% settled payout value\)/u);
  assert.match(markdown, /Marketplace risk reserve: ready \(\$0 shortfall\)/u);
  assert.match(markdown, /Marketplace Stripe event forwarding: ready \(4 forwarded event\(s\)\)/u);
  assert.match(markdown, /Playtest QA savings: \$820K/u);
  assert.doesNotMatch(markdown, /customer@example\.com|gbx_secret|private creator|<html>secret<\/html>/u);
});

test('business model proof endpoint is admin protected and supports markdown', async () => {
  await withServer({
    auditAdminToken: 'business-model-admin-0123456789abcdef',
    businessModelProof: passingBusinessModelProof(),
  }, async (baseUrl) => {
    const denied = await fetch(`${baseUrl}/v1/strategy/business-model-proof`);
    assert.equal(denied.status, 401);
    assert.deepEqual(await denied.json(), { error: 'audit_admin_required' });

    const jsonResponse = await fetch(`${baseUrl}/v1/strategy/business-model-proof`, {
      headers: { authorization: 'Bearer business-model-admin-0123456789abcdef' },
    });
    assert.equal(jsonResponse.status, 200);
    const report = await jsonResponse.json() as {
      summary: { acquisitionBusinessModelReady: boolean; status: string };
    };
    assert.equal(report.summary.status, 'pass');
    assert.equal(report.summary.acquisitionBusinessModelReady, true);

    const markdownResponse = await fetch(`${baseUrl}/v1/strategy/business-model-proof?format=markdown`, {
      headers: { authorization: 'Bearer business-model-admin-0123456789abcdef' },
    });
    assert.equal(markdownResponse.status, 200);
    assert.match(markdownResponse.headers.get('content-type') ?? '', /text\/markdown/u);
    assert.match(await markdownResponse.text(), /Greybox Business Model Proof/u);
  });
});
