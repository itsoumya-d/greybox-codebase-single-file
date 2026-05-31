// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import type {
  ProBusinessModelProofExport,
  ProModuleAttachReport,
  ProModuleBetaValidationReport,
  ProModuleReleaseReadinessReport,
  ProModuleRevenueMixReport,
} from '../types.js';
import type { ProModuleBundlePublishProof } from '../release/publishProof.js';

export interface ProBusinessModelProofOptions {
  revenueMixReport: ProModuleRevenueMixReport;
  releaseReadinessReport: ProModuleReleaseReadinessReport;
  attachReport?: ProModuleAttachReport;
  betaValidationReport?: ProModuleBetaValidationReport;
  publishProof?: ProModuleBundlePublishProof;
  cloudHandoffReport?: ProModuleCloudHandoffEvidence;
  loaderRejectsUnsigned?: boolean;
  generatedAt?: number;
}

export interface ProModuleCloudHandoffEvidence {
  ready: boolean;
  provider: string;
  moduleIds: readonly string[];
  objectCount: number;
}

export function buildProBusinessModelProofExport(
  options: ProBusinessModelProofOptions,
): ProBusinessModelProofExport {
  const generatedAt = options.generatedAt
    ?? Math.max(
      options.revenueMixReport.generatedAt,
      options.releaseReadinessReport.generatedAt,
      options.attachReport?.generatedAt ?? 0,
      options.betaValidationReport?.generatedAt ?? 0,
      options.publishProof?.generatedAt ?? 0,
    );
  const revenueMixReady = options.revenueMixReport.ready;
  const releaseReady = options.releaseReadinessReport.ready;
  const publishReady = options.publishProof?.ready === true;
  const publishProductionReady = publishProofUsesProductionStorage(options.publishProof);
  const publishReleaseMatchReady = publishProofMatchesReleaseReadiness(
    options.releaseReadinessReport,
    options.publishProof,
  );
  const publishHandoffReady = cloudHandoffMatchesReleaseReadiness(
    options.releaseReadinessReport,
    options.cloudHandoffReport,
  );
  const attachReady = options.attachReport?.ready === true;
  const betaReady = options.betaValidationReport?.ready === true;
  const businessModelReady = revenueMixReady
    && releaseReady
    && publishReady
    && publishProductionReady
    && publishHandoffReady
    && publishReleaseMatchReady
    && attachReady
    && betaReady
    && options.loaderRejectsUnsigned === true;
  return {
    proModules: {
      revenueShare: businessModelReady ? bpsToRate(options.revenueMixReport.summary.proRevenueShareBps) : 0,
      shippedModules: businessModelReady ? options.releaseReadinessReport.summary.yearOneModulesScheduled : 0,
      paidPurchases: businessModelReady ? options.revenueMixReport.summary.orders : 0,
      signedBundles: businessModelReady
        ? options.releaseReadinessReport.schedule.filter((item) => item.bundleVerified).length
        : 0,
      publishedObjects: businessModelReady ? options.publishProof?.receipt.objectCount ?? 0 : 0,
      attachRateBps: businessModelReady ? options.attachReport?.summary.attachRateBps ?? 0 : 0,
      multiModuleAttachRateBps: businessModelReady ? options.attachReport?.summary.multiModuleAttachRateBps ?? 0 : 0,
      studioEnterpriseAttachRateBps: businessModelReady
        ? options.attachReport?.summary.studioEnterpriseAttachRateBps ?? 0
        : 0,
      expansionArrUsd: businessModelReady ? centsToUsd(options.attachReport?.summary.expansionArrCents ?? 0) : 0,
      proChurnedCustomerRateBps: businessModelReady
        ? options.attachReport?.summary.churnedProCustomerRateBps ?? 0
        : 0,
      modulesWithActiveCustomers: businessModelReady
        ? options.attachReport?.summary.modulesWithActiveCustomers ?? 0
        : 0,
      betaValidatedModules: businessModelReady
        ? options.betaValidationReport?.summary.launchModulesReady ?? 0
        : 0,
      betaDesignPartners: businessModelReady
        ? options.betaValidationReport?.summary.designPartners ?? 0
        : 0,
      betaReviewedExports: businessModelReady
        ? options.betaValidationReport?.summary.reviewedExports ?? 0
        : 0,
      betaAcceptedDiffRateBps: businessModelReady
        ? options.betaValidationReport?.summary.acceptedDiffRateBps ?? 0
        : 0,
      attachReady,
      betaReady,
      loaderRejectsUnsigned: options.loaderRejectsUnsigned === true,
      publishProductionReady,
      publishHandoffReady,
      publishReleaseMatchReady,
      sourceBusinessModelReady: businessModelReady,
    },
    source: {
      reports: [
        'pro-module-revenue-mix',
        'pro-module-release-readiness',
        'pro-module-publish-proof',
        'pro-module-cloud-handoff',
        'pro-module-attach-readiness',
        'pro-module-beta-validation',
      ],
      generatedAt,
      revenuePeriod: options.revenueMixReport.period,
      ...(options.attachReport ? { attachPeriod: options.attachReport.period } : {}),
      ...(options.betaValidationReport ? { betaPeriod: options.betaValidationReport.period } : {}),
      revenueMixReady,
      releaseReady,
      publishReady,
      publishProductionReady,
      publishHandoffReady,
      publishReleaseMatchReady,
      attachReady,
      betaReady,
      businessModelReady,
    },
    disclaimer: 'Pro business-model proof is sanitized aggregate evidence for GREYBOX_BUSINESS_MODEL_PROOF_JSON. It excludes customer ids, order ids, design partner ids, license secrets, private module payloads, encrypted bundle bodies, signed URLs, and signing material.',
  };
}

function cloudHandoffMatchesReleaseReadiness(
  releaseReadinessReport: ProModuleReleaseReadinessReport,
  cloudHandoffReport: ProModuleCloudHandoffEvidence | undefined,
): boolean {
  if (!cloudHandoffReport?.ready) return false;
  if (!publishProviderLooksProduction(cloudHandoffReport.provider)) return false;
  const releaseModuleIds = releaseReadinessReport.schedule
    .filter((item) => item.bundleVerified)
    .map((item) => item.moduleId)
    .sort();
  if (releaseModuleIds.length === 0) return false;
  const handoffModuleIds = [...cloudHandoffReport.moduleIds].sort();
  return sameStringList(releaseModuleIds, handoffModuleIds)
    && cloudHandoffReport.objectCount === releaseModuleIds.length + 1;
}

function publishProofUsesProductionStorage(publishProof: ProModuleBundlePublishProof | undefined): boolean {
  if (!publishProof?.ready) return false;
  return publishProviderLooksProduction(publishProof.receipt.provider);
}

function publishProviderLooksProduction(providerName: string): boolean {
  const provider = providerName.trim().toLowerCase();
  return Boolean(provider)
    && !/(?:^|[-_\s])(?:local|dry|dryrun|dry-run|mock|fixture|test)(?:[-_\s]|$)/u.test(provider);
}

function publishProofMatchesReleaseReadiness(
  releaseReadinessReport: ProModuleReleaseReadinessReport,
  publishProof: ProModuleBundlePublishProof | undefined,
): boolean {
  if (!publishProof?.ready) return false;
  const releaseModuleIds = releaseReadinessReport.schedule
    .filter((item) => item.bundleVerified)
    .map((item) => item.moduleId)
    .sort();
  if (releaseModuleIds.length === 0) return false;
  const publishedModuleIds = [...publishProof.uploadPlan.bundleModuleIds].sort();
  if (!sameStringList(releaseModuleIds, publishedModuleIds)) return false;
  const expectedObjectCount = releaseModuleIds.length + 1;
  return publishProof.uploadPlan.objectCount === expectedObjectCount
    && publishProof.receipt.objectCount === expectedObjectCount;
}

function sameStringList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function bpsToRate(value: number): number {
  return Number((value / 10_000).toFixed(4));
}

function centsToUsd(value: number): number {
  return Number((value / 100).toFixed(2));
}
