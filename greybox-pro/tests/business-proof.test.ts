// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';

import {
  PRO_MODULE_BUNDLE_PUBLISH_RECEIPT_FORMAT,
  buildProBusinessModelProofExport,
  buildProModuleAttachReport,
  buildProModuleBetaValidationReport,
  buildProModuleBundlePublishProof,
  buildProModuleBundleRelease,
  buildProModuleBundleUploadPlan,
  buildProModuleReleaseReadinessReport,
  buildProModuleRevenueMixReport,
  proModuleCatalog,
  type ProModuleAttachSnapshot,
  type ProModuleBetaValidationRecord,
  type ProModuleRoundTripValueType,
  type ProModuleRevenueRecord,
} from '../src/index.js';

const ROUND_TRIP_VALUE_TYPES: ProModuleRoundTripValueType[] = ['int', 'float', 'string', 'Color', 'Vector3'];

function record(input: {
  id: string;
  moduleId: string;
  customerId: string;
  amountCents: number;
  arrContributionCents: number;
}): ProModuleRevenueRecord {
  return {
    id: input.id,
    moduleId: input.moduleId,
    customerId: input.customerId,
    source: 'direct-pack',
    occurredAt: Date.UTC(2026, 4, 18),
    amountCents: input.amountCents,
    arrContributionCents: input.arrContributionCents,
  };
}

function readyRevenueMixReport() {
  return buildProModuleRevenueMixReport({
    records: [
      record({ id: 'order-1', moduleId: 'soulslike-combat-pack', customerId: 'customer-a@example.com', amountCents: 7_900, arrContributionCents: 120_000 }),
      record({ id: 'order-2', moduleId: 'hero-shooter-toolkit', customerId: 'customer-b@example.com', amountCents: 9_900, arrContributionCents: 120_000 }),
      record({ id: 'order-3', moduleId: 'cozy-sim-pack', customerId: 'customer-c@example.com', amountCents: 5_900, arrContributionCents: 120_000 }),
      record({ id: 'order-4', moduleId: 'live-ops-pro', customerId: 'customer-d@example.com', amountCents: 19_900, arrContributionCents: 180_000 }),
      record({ id: 'order-5', moduleId: 'unity-full-prefab-export-pro', customerId: 'customer-e@example.com', amountCents: 9_900, arrContributionCents: 120_000 }),
    ],
    totalArrCents: 2_000_000,
    generatedAt: Date.UTC(2026, 4, 18),
    targets: {
      minPayingCustomers: 5,
    },
  });
}

function readyReleaseReadinessReport() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return buildProModuleReleaseReadinessReport({
    now: Date.UTC(2026, 4, 18),
    bundleVerification: {
      privateKey,
      keyId: 'greybox-proof-test',
      publicKeys: { 'greybox-proof-test': publicKey },
      licenseSecret: 'release-readiness-license-secret',
      nonceForModule: (_module, index) => Buffer.alloc(12, index + 1),
    },
  });
}

function snapshot(input: {
  id: string;
  customerId: string;
  plan: ProModuleAttachSnapshot['plan'];
  moduleIds?: string[];
  proArrCents?: number;
  totalArrCents: number;
  expansionArrCents?: number;
}): ProModuleAttachSnapshot {
  return {
    id: input.id,
    customerId: input.customerId,
    plan: input.plan,
    observedAt: Date.UTC(2026, 4, 18),
    active: true,
    moduleIds: input.moduleIds ?? [],
    proArrCents: input.proArrCents ?? 0,
    totalArrCents: input.totalArrCents,
    ...(input.expansionArrCents === undefined ? {} : { expansionArrCents: input.expansionArrCents }),
  };
}

function readyAttachReport() {
  return buildProModuleAttachReport({
    snapshots: [
      snapshot({ id: 'snap-a', customerId: 'customer-a@example.com', plan: 'indie', moduleIds: ['soulslike-combat-pack', 'unity-full-prefab-export-pro'], proArrCents: 120_000, totalArrCents: 300_000, expansionArrCents: 60_000 }),
      snapshot({ id: 'snap-b', customerId: 'customer-b@example.com', plan: 'studio', moduleIds: ['hero-shooter-toolkit', 'unity-full-prefab-export-pro'], proArrCents: 120_000, totalArrCents: 500_000, expansionArrCents: 70_000 }),
      snapshot({ id: 'snap-c', customerId: 'customer-c@example.com', plan: 'enterprise', moduleIds: ['live-ops-pro', 'monetization-simulator', 'console-submission-checklist'], proArrCents: 180_000, totalArrCents: 800_000, expansionArrCents: 80_000 }),
      snapshot({ id: 'snap-d', customerId: 'customer-d@example.com', plan: 'studio', moduleIds: ['cozy-sim-pack'], proArrCents: 70_000, totalArrCents: 300_000, expansionArrCents: 50_000 }),
      snapshot({ id: 'snap-e', customerId: 'customer-e@example.com', plan: 'indie', moduleIds: ['roguelike-generator-pro'], proArrCents: 70_000, totalArrCents: 200_000, expansionArrCents: 40_000 }),
      snapshot({ id: 'snap-f', customerId: 'customer-f@example.com', plan: 'indie', totalArrCents: 100_000, expansionArrCents: 0 }),
    ],
    generatedAt: Date.UTC(2026, 4, 18),
  });
}

function betaRecord(input: {
  id: string;
  moduleId: string;
  partner: string;
}): ProModuleBetaValidationRecord {
  return {
    id: input.id,
    moduleId: input.moduleId,
    designPartnerId: input.partner,
    observedAt: Date.UTC(2026, 4, 18),
    engine: 'unity',
    artifactExported: true,
    designerReviewed: true,
    acceptedDiffs: 3,
    rejectedDiffs: 1,
    openCriticalIssues: 0,
    roundTripValueTypes: ROUND_TRIP_VALUE_TYPES,
  };
}

function readyBetaValidationReport() {
  return buildProModuleBetaValidationReport({
    records: proModuleCatalog.slice(0, 5).flatMap((module, index) => [
      betaRecord({
        id: `beta-${index + 1}-a`,
        moduleId: module.manifest.id,
        partner: `partner-${index + 1}-a@example.com`,
      }),
      betaRecord({
        id: `beta-${index + 1}-b`,
        moduleId: module.manifest.id,
        partner: `partner-${index + 1}-b@example.com`,
      }),
    ]),
    generatedAt: Date.UTC(2026, 4, 18),
  });
}

function readyPublishProof(moduleIds?: readonly string[], provider = 'r2') {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const uploadPlan = buildProModuleBundleUploadPlan(buildProModuleBundleRelease({
    ...(moduleIds ? { moduleIds } : {}),
    privateKey,
    publicKeys: { 'greybox-publish-proof': publicKey },
    keyId: 'greybox-publish-proof',
    licenseSecret: 'publish-proof-license-secret',
    releaseChannel: 'launch',
    outputPrefix: 'greybox-pro',
    now: Date.UTC(2026, 4, 18),
    nonceForModule: (_module, index) => Buffer.alloc(12, index + 1),
  }));
  return buildProModuleBundlePublishProof({
    uploadPlan,
    receipt: {
      format: PRO_MODULE_BUNDLE_PUBLISH_RECEIPT_FORMAT,
      generatedAt: Date.UTC(2026, 4, 18),
      provider,
      releaseChannel: uploadPlan.releaseChannel,
      objectPrefix: uploadPlan.objectPrefix,
      objects: uploadPlan.objects.map((object, index) => ({
        objectKey: object.objectKey,
        sha256: object.sha256,
        bytes: object.bytes,
        contentType: object.contentType,
        cacheControl: object.cacheControl,
        publishedAt: Date.UTC(2026, 4, 18) + index,
      })),
    },
  });
}

function readyCloudHandoffReport(releaseReadinessReport: ReturnType<typeof readyReleaseReadinessReport>, provider = 'r2') {
  const moduleIds = releaseReadinessReport.schedule
    .filter((item) => item.bundleVerified)
    .map((item) => item.moduleId);
  return {
    ready: true,
    provider,
    moduleIds,
    objectCount: moduleIds.length + 1,
  };
}

test('Pro business-model proof exports the cloud proModules slice without leaking customers', () => {
  const releaseReadinessReport = readyReleaseReadinessReport();
  const revenueMixReport = readyRevenueMixReport();
  const publishProof = readyPublishProof();

  const proof = buildProBusinessModelProofExport({
    releaseReadinessReport,
    revenueMixReport,
    attachReport: readyAttachReport(),
    betaValidationReport: readyBetaValidationReport(),
    publishProof,
    cloudHandoffReport: readyCloudHandoffReport(releaseReadinessReport),
    loaderRejectsUnsigned: true,
  });

  assert.deepEqual(proof.proModules, {
    revenueShare: 0.33,
    shippedModules: 12,
    paidPurchases: 5,
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
  });
  assert.equal(proof.source.revenueMixReady, true);
  assert.equal(proof.source.releaseReady, true);
  assert.equal(proof.source.publishReady, true);
  assert.equal(proof.source.publishProductionReady, true);
  assert.equal(proof.source.publishHandoffReady, true);
  assert.equal(proof.source.publishReleaseMatchReady, true);
  assert.equal(proof.source.attachReady, true);
  assert.equal(proof.source.betaReady, true);
  assert.equal(proof.source.businessModelReady, true);
  assert.equal(proof.source.revenuePeriod.label, '2026-05');
  assert.equal(proof.source.attachPeriod?.label, '2026-05');
  assert.equal(proof.source.betaPeriod?.label, '2026-05');
  const serialized = JSON.stringify(proof);
  assert.doesNotMatch(serialized, /customer-a@example\.com|customer-f@example\.com|partner-1-a@example\.com|partner-5-b@example\.com|release-readiness-license-secret|publish-proof-license-secret|encryptedPayload|PRIVATE/u);
});

test('Pro business-model proof zeroes counters when unsigned rejection evidence is absent', () => {
  const releaseReadinessReport = readyReleaseReadinessReport();
  const proof = buildProBusinessModelProofExport({
    releaseReadinessReport,
    revenueMixReport: readyRevenueMixReport(),
    attachReport: readyAttachReport(),
    betaValidationReport: readyBetaValidationReport(),
    publishProof: readyPublishProof(),
    cloudHandoffReport: readyCloudHandoffReport(releaseReadinessReport),
  });

  assert.deepEqual(proof.proModules, {
    revenueShare: 0,
    shippedModules: 0,
    paidPurchases: 0,
    signedBundles: 0,
    publishedObjects: 0,
    attachRateBps: 0,
    multiModuleAttachRateBps: 0,
    studioEnterpriseAttachRateBps: 0,
    expansionArrUsd: 0,
    proChurnedCustomerRateBps: 0,
    modulesWithActiveCustomers: 0,
    betaValidatedModules: 0,
    betaDesignPartners: 0,
    betaReviewedExports: 0,
    betaAcceptedDiffRateBps: 0,
    attachReady: true,
    betaReady: true,
    loaderRejectsUnsigned: false,
    publishProductionReady: true,
    publishHandoffReady: true,
    publishReleaseMatchReady: true,
    sourceBusinessModelReady: false,
  });
  assert.equal(proof.source.revenueMixReady, true);
  assert.equal(proof.source.releaseReady, true);
  assert.equal(proof.source.publishReady, true);
  assert.equal(proof.source.publishProductionReady, true);
  assert.equal(proof.source.publishHandoffReady, true);
  assert.equal(proof.source.publishReleaseMatchReady, true);
  assert.equal(proof.source.attachReady, true);
  assert.equal(proof.source.betaReady, true);
  assert.equal(proof.source.businessModelReady, false);
});

test('Pro business-model proof zeroes counters when publish proof does not match the release train', () => {
  const releaseReadinessReport = readyReleaseReadinessReport();
  const proof = buildProBusinessModelProofExport({
    releaseReadinessReport,
    revenueMixReport: readyRevenueMixReport(),
    attachReport: readyAttachReport(),
    betaValidationReport: readyBetaValidationReport(),
    publishProof: readyPublishProof(['soulslike-combat-pack', 'hero-shooter-toolkit']),
    cloudHandoffReport: readyCloudHandoffReport(releaseReadinessReport),
    loaderRejectsUnsigned: true,
  });

  assert.deepEqual(proof.proModules, {
    revenueShare: 0,
    shippedModules: 0,
    paidPurchases: 0,
    signedBundles: 0,
    publishedObjects: 0,
    attachRateBps: 0,
    multiModuleAttachRateBps: 0,
    studioEnterpriseAttachRateBps: 0,
    expansionArrUsd: 0,
    proChurnedCustomerRateBps: 0,
    modulesWithActiveCustomers: 0,
    betaValidatedModules: 0,
    betaDesignPartners: 0,
    betaReviewedExports: 0,
    betaAcceptedDiffRateBps: 0,
    attachReady: true,
    betaReady: true,
    loaderRejectsUnsigned: true,
    publishProductionReady: true,
    publishHandoffReady: true,
    publishReleaseMatchReady: false,
    sourceBusinessModelReady: false,
  });
  assert.equal(proof.source.revenueMixReady, true);
  assert.equal(proof.source.releaseReady, true);
  assert.equal(proof.source.publishReady, true);
  assert.equal(proof.source.publishProductionReady, true);
  assert.equal(proof.source.publishHandoffReady, true);
  assert.equal(proof.source.publishReleaseMatchReady, false);
  assert.equal(proof.source.attachReady, true);
  assert.equal(proof.source.betaReady, true);
  assert.equal(proof.source.businessModelReady, false);
});

test('Pro business-model proof zeroes counters when release readiness is weak', () => {
  const releaseReadinessReport = buildProModuleReleaseReadinessReport({
    now: Date.UTC(2026, 4, 18),
  });
  const proof = buildProBusinessModelProofExport({
    releaseReadinessReport,
    revenueMixReport: readyRevenueMixReport(),
    attachReport: readyAttachReport(),
    betaValidationReport: readyBetaValidationReport(),
    publishProof: readyPublishProof(),
    cloudHandoffReport: readyCloudHandoffReport(releaseReadinessReport),
    loaderRejectsUnsigned: true,
  });

  assert.deepEqual(proof.proModules, {
    revenueShare: 0,
    shippedModules: 0,
    paidPurchases: 0,
    signedBundles: 0,
    publishedObjects: 0,
    attachRateBps: 0,
    multiModuleAttachRateBps: 0,
    studioEnterpriseAttachRateBps: 0,
    expansionArrUsd: 0,
    proChurnedCustomerRateBps: 0,
    modulesWithActiveCustomers: 0,
    betaValidatedModules: 0,
    betaDesignPartners: 0,
    betaReviewedExports: 0,
    betaAcceptedDiffRateBps: 0,
    attachReady: true,
    betaReady: true,
    loaderRejectsUnsigned: true,
    publishProductionReady: true,
    publishHandoffReady: false,
    publishReleaseMatchReady: false,
    sourceBusinessModelReady: false,
  });
  assert.equal(proof.source.revenueMixReady, true);
  assert.equal(proof.source.releaseReady, false);
  assert.equal(proof.source.publishReady, true);
  assert.equal(proof.source.publishProductionReady, true);
  assert.equal(proof.source.publishHandoffReady, false);
  assert.equal(proof.source.publishReleaseMatchReady, false);
  assert.equal(proof.source.attachReady, true);
  assert.equal(proof.source.betaReady, true);
  assert.equal(proof.source.businessModelReady, false);
});

test('Pro business-model proof zeroes counters when revenue mix is weak', () => {
  const releaseReadinessReport = readyReleaseReadinessReport();
  const proof = buildProBusinessModelProofExport({
    releaseReadinessReport,
    revenueMixReport: buildProModuleRevenueMixReport({
      records: [],
      totalArrCents: 0,
      generatedAt: Date.UTC(2026, 4, 18),
    }),
    attachReport: readyAttachReport(),
    betaValidationReport: readyBetaValidationReport(),
    publishProof: readyPublishProof(),
    cloudHandoffReport: readyCloudHandoffReport(releaseReadinessReport),
    loaderRejectsUnsigned: true,
  });

  assert.deepEqual(proof.proModules, {
    revenueShare: 0,
    shippedModules: 0,
    paidPurchases: 0,
    signedBundles: 0,
    publishedObjects: 0,
    attachRateBps: 0,
    multiModuleAttachRateBps: 0,
    studioEnterpriseAttachRateBps: 0,
    expansionArrUsd: 0,
    proChurnedCustomerRateBps: 0,
    modulesWithActiveCustomers: 0,
    betaValidatedModules: 0,
    betaDesignPartners: 0,
    betaReviewedExports: 0,
    betaAcceptedDiffRateBps: 0,
    attachReady: true,
    betaReady: true,
    loaderRejectsUnsigned: true,
    publishProductionReady: true,
    publishHandoffReady: true,
    publishReleaseMatchReady: true,
    sourceBusinessModelReady: false,
  });
  assert.equal(proof.source.revenueMixReady, false);
  assert.equal(proof.source.releaseReady, true);
  assert.equal(proof.source.publishReady, true);
  assert.equal(proof.source.publishProductionReady, true);
  assert.equal(proof.source.publishHandoffReady, true);
  assert.equal(proof.source.publishReleaseMatchReady, true);
  assert.equal(proof.source.attachReady, true);
  assert.equal(proof.source.betaReady, true);
  assert.equal(proof.source.businessModelReady, false);
});

test('Pro business-model proof zeroes counters when publish proof is absent', () => {
  const releaseReadinessReport = readyReleaseReadinessReport();
  const proof = buildProBusinessModelProofExport({
    releaseReadinessReport,
    revenueMixReport: readyRevenueMixReport(),
    attachReport: readyAttachReport(),
    betaValidationReport: readyBetaValidationReport(),
    cloudHandoffReport: readyCloudHandoffReport(releaseReadinessReport),
    loaderRejectsUnsigned: true,
  });

  assert.deepEqual(proof.proModules, {
    revenueShare: 0,
    shippedModules: 0,
    paidPurchases: 0,
    signedBundles: 0,
    publishedObjects: 0,
    attachRateBps: 0,
    multiModuleAttachRateBps: 0,
    studioEnterpriseAttachRateBps: 0,
    expansionArrUsd: 0,
    proChurnedCustomerRateBps: 0,
    modulesWithActiveCustomers: 0,
    betaValidatedModules: 0,
    betaDesignPartners: 0,
    betaReviewedExports: 0,
    betaAcceptedDiffRateBps: 0,
    attachReady: true,
    betaReady: true,
    loaderRejectsUnsigned: true,
    publishProductionReady: false,
    publishHandoffReady: true,
    publishReleaseMatchReady: false,
    sourceBusinessModelReady: false,
  });
  assert.equal(proof.source.revenueMixReady, true);
  assert.equal(proof.source.releaseReady, true);
  assert.equal(proof.source.publishReady, false);
  assert.equal(proof.source.publishProductionReady, false);
  assert.equal(proof.source.publishHandoffReady, true);
  assert.equal(proof.source.publishReleaseMatchReady, false);
  assert.equal(proof.source.attachReady, true);
  assert.equal(proof.source.betaReady, true);
  assert.equal(proof.source.businessModelReady, false);
});

test('Pro business-model proof zeroes counters when Cloud handoff evidence is absent', () => {
  const releaseReadinessReport = readyReleaseReadinessReport();
  const proof = buildProBusinessModelProofExport({
    releaseReadinessReport,
    revenueMixReport: readyRevenueMixReport(),
    attachReport: readyAttachReport(),
    betaValidationReport: readyBetaValidationReport(),
    publishProof: readyPublishProof(),
    loaderRejectsUnsigned: true,
  });

  assert.equal(proof.source.publishReady, true);
  assert.equal(proof.source.publishProductionReady, true);
  assert.equal(proof.source.publishHandoffReady, false);
  assert.equal(proof.source.publishReleaseMatchReady, true);
  assert.equal(proof.source.businessModelReady, false);
  assert.equal(proof.proModules.publishHandoffReady, false);
  assert.equal(proof.proModules.sourceBusinessModelReady, false);
  assert.equal(proof.proModules.revenueShare, 0);
});

test('Pro business-model proof rejects Cloud handoff module drift', () => {
  const releaseReadinessReport = readyReleaseReadinessReport();
  const handoff = readyCloudHandoffReport(releaseReadinessReport);
  const proof = buildProBusinessModelProofExport({
    releaseReadinessReport,
    revenueMixReport: readyRevenueMixReport(),
    attachReport: readyAttachReport(),
    betaValidationReport: readyBetaValidationReport(),
    publishProof: readyPublishProof(),
    cloudHandoffReport: {
      ...handoff,
      moduleIds: handoff.moduleIds.slice(0, -1),
      objectCount: handoff.objectCount - 1,
    },
    loaderRejectsUnsigned: true,
  });

  assert.equal(proof.source.publishReady, true);
  assert.equal(proof.source.publishProductionReady, true);
  assert.equal(proof.source.publishHandoffReady, false);
  assert.equal(proof.source.publishReleaseMatchReady, true);
  assert.equal(proof.source.businessModelReady, false);
  assert.equal(proof.proModules.publishHandoffReady, false);
  assert.equal(proof.proModules.sourceBusinessModelReady, false);
  assert.equal(proof.proModules.publishedObjects, 0);
});

test('Pro business-model proof zeroes counters when attach readiness is absent', () => {
  const releaseReadinessReport = readyReleaseReadinessReport();
  const proof = buildProBusinessModelProofExport({
    releaseReadinessReport,
    revenueMixReport: readyRevenueMixReport(),
    betaValidationReport: readyBetaValidationReport(),
    publishProof: readyPublishProof(),
    cloudHandoffReport: readyCloudHandoffReport(releaseReadinessReport),
    loaderRejectsUnsigned: true,
  });

  assert.deepEqual(proof.proModules, {
    revenueShare: 0,
    shippedModules: 0,
    paidPurchases: 0,
    signedBundles: 0,
    publishedObjects: 0,
    attachRateBps: 0,
    multiModuleAttachRateBps: 0,
    studioEnterpriseAttachRateBps: 0,
    expansionArrUsd: 0,
    proChurnedCustomerRateBps: 0,
    modulesWithActiveCustomers: 0,
    betaValidatedModules: 0,
    betaDesignPartners: 0,
    betaReviewedExports: 0,
    betaAcceptedDiffRateBps: 0,
    attachReady: false,
    betaReady: true,
    loaderRejectsUnsigned: true,
    publishProductionReady: true,
    publishHandoffReady: true,
    publishReleaseMatchReady: true,
    sourceBusinessModelReady: false,
  });
  assert.equal(proof.source.revenueMixReady, true);
  assert.equal(proof.source.releaseReady, true);
  assert.equal(proof.source.publishReady, true);
  assert.equal(proof.source.publishProductionReady, true);
  assert.equal(proof.source.publishHandoffReady, true);
  assert.equal(proof.source.publishReleaseMatchReady, true);
  assert.equal(proof.source.attachReady, false);
  assert.equal(proof.source.betaReady, true);
  assert.equal(proof.source.businessModelReady, false);
});

test('Pro business-model proof zeroes counters when beta validation evidence is absent', () => {
  const releaseReadinessReport = readyReleaseReadinessReport();
  const proof = buildProBusinessModelProofExport({
    releaseReadinessReport,
    revenueMixReport: readyRevenueMixReport(),
    attachReport: readyAttachReport(),
    publishProof: readyPublishProof(),
    cloudHandoffReport: readyCloudHandoffReport(releaseReadinessReport),
    loaderRejectsUnsigned: true,
  });

  assert.deepEqual(proof.proModules, {
    revenueShare: 0,
    shippedModules: 0,
    paidPurchases: 0,
    signedBundles: 0,
    publishedObjects: 0,
    attachRateBps: 0,
    multiModuleAttachRateBps: 0,
    studioEnterpriseAttachRateBps: 0,
    expansionArrUsd: 0,
    proChurnedCustomerRateBps: 0,
    modulesWithActiveCustomers: 0,
    betaValidatedModules: 0,
    betaDesignPartners: 0,
    betaReviewedExports: 0,
    betaAcceptedDiffRateBps: 0,
    attachReady: true,
    betaReady: false,
    loaderRejectsUnsigned: true,
    publishProductionReady: true,
    publishHandoffReady: true,
    publishReleaseMatchReady: true,
    sourceBusinessModelReady: false,
  });
  assert.equal(proof.source.revenueMixReady, true);
  assert.equal(proof.source.releaseReady, true);
  assert.equal(proof.source.publishReady, true);
  assert.equal(proof.source.publishProductionReady, true);
  assert.equal(proof.source.publishHandoffReady, true);
  assert.equal(proof.source.publishReleaseMatchReady, true);
  assert.equal(proof.source.attachReady, true);
  assert.equal(proof.source.betaReady, false);
  assert.equal(proof.source.businessModelReady, false);
});

test('Pro business-model proof rejects local dry-run publish receipts as production evidence', () => {
  const releaseReadinessReport = readyReleaseReadinessReport();
  const proof = buildProBusinessModelProofExport({
    releaseReadinessReport,
    revenueMixReport: readyRevenueMixReport(),
    attachReport: readyAttachReport(),
    betaValidationReport: readyBetaValidationReport(),
    publishProof: readyPublishProof(undefined, 'local-dry-run'),
    cloudHandoffReport: readyCloudHandoffReport(releaseReadinessReport),
    loaderRejectsUnsigned: true,
  });

  assert.equal(proof.source.publishReady, true);
  assert.equal(proof.source.publishProductionReady, false);
  assert.equal(proof.source.publishHandoffReady, true);
  assert.equal(proof.source.publishReleaseMatchReady, true);
  assert.equal(proof.source.businessModelReady, false);
  assert.equal(proof.proModules.sourceBusinessModelReady, false);
  assert.equal(proof.proModules.publishedObjects, 0);
  assert.equal(proof.proModules.revenueShare, 0);
});
