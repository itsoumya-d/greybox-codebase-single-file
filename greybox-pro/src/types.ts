// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

export const PRO_MODULE_BUNDLE_FORMAT = 'agds-pro-module-bundle/v1';

export type ProModuleMountKind = 'skill' | 'game-art-bible' | 'engine-target';

export interface ProModuleMountDescriptor {
  kind: ProModuleMountKind;
  id: string;
  title?: string;
  description?: string;
  entry?: string;
  digestSha256?: string;
}

export interface ProModuleManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  licenseTier?: string;
  minAgdsVersion?: string;
  mounts: {
    skills?: ProModuleMountDescriptor[];
    gameArtBibles?: ProModuleMountDescriptor[];
    engineTargets?: ProModuleMountDescriptor[];
  };
}

export interface ProModuleBundleSignature {
  algorithm: 'ed25519';
  keyId: string;
  value: string;
  signedFields?: 'format+manifest+payloadSha256';
}

export interface ProModuleBundleEnvelope {
  format: typeof PRO_MODULE_BUNDLE_FORMAT;
  manifest: ProModuleManifest;
  payloadSha256: string;
  encryptedPayload?: string;
  signature?: ProModuleBundleSignature;
}

export type ProModuleCategory =
  | 'combat'
  | 'shooter'
  | 'cozy-sim'
  | 'mobile'
  | 'roguelike'
  | 'live-ops'
  | 'monetization'
  | 'launch'
  | 'compliance'
  | 'engine-export';

export type ProModuleStatus = 'alpha-ready' | 'planned';

export interface ProModulePrice {
  currency: 'USD';
  oneTimeUsd: number;
  monthlyUsd?: number;
}

export interface ProModuleFile {
  path: string;
  mediaType: 'text/markdown' | 'application/json';
  body: string;
  digestSha256: string;
}

export interface ProModuleDefinition {
  order: number;
  category: ProModuleCategory;
  price: ProModulePrice;
  audience: string;
  status: ProModuleStatus;
  targetShipWindowWeeks: number;
  manifest: ProModuleManifest;
  files: ProModuleFile[];
  positioning: string;
}

export interface ProModulePublicListing {
  id: string;
  name: string;
  version: string;
  category: ProModuleCategory;
  price: ProModulePrice;
  audience: string;
  status: ProModuleStatus;
  mountCount: number;
}

export interface ProModuleReleaseReadinessTargets {
  launchModuleCount: number;
  yearOneModuleCount: number;
  minModulesByMonth12: number;
  maxWeeksBetweenReleases: number;
  month12Weeks: number;
  minMountsPerModule: number;
}

export type ProModuleReleaseReadinessStatus = 'pass' | 'warn' | 'fail';

export interface ProModuleReleaseScheduleItem {
  order: number;
  moduleId: string;
  name: string;
  status: ProModuleStatus;
  shipWeek: number;
  price: ProModulePrice;
  audience: string;
  mountCount: number;
  fileCount: number;
  publicListingSafe: boolean;
  payloadClassesComplete: boolean;
  payloadContractsComplete: boolean;
  disclosureContractsComplete: boolean;
  bundleVerified: boolean;
}

export interface ProModuleReleaseReadinessCheck {
  id: string;
  label: string;
  status: ProModuleReleaseReadinessStatus;
  detail: string;
}

export interface ProModuleReleaseReadinessIssue {
  code:
    | 'catalog_invalid'
    | 'launch_module_shortfall'
    | 'year_one_module_shortfall'
    | 'month12_shortfall'
    | 'release_cadence_slip'
    | 'mount_shortfall'
    | 'payload_file_shortfall'
    | 'payload_class_missing'
    | 'engine_target_contract_missing'
    | 'ai_disclosure_contract_missing'
    | 'public_listing_unsafe'
    | 'engine_companion_missing'
    | 'bundle_verification_not_run'
    | 'bundle_verification_failed';
  severity: 'warning' | 'error';
  moduleId?: string;
  detail: string;
  remediation?: string;
}

export interface ProModuleReleaseReadinessReport {
  ready: boolean;
  generatedAt: number;
  targets: ProModuleReleaseReadinessTargets;
  summary: {
    totalModules: number;
    alphaReadyModules: number;
    launchModulesScheduled: number;
    yearOneModulesScheduled: number;
    cumulativeLaunchPriceUsd: number;
    cumulativeYearOnePriceUsd: number;
    monthlyRecurringUsd: number;
    latestLaunchShipWeek: number;
    latestYearOneShipWeek: number;
    engineExportModules: number;
  };
  schedule: ProModuleReleaseScheduleItem[];
  publicCatalog: ProModulePublicListing[];
  checks: ProModuleReleaseReadinessCheck[];
  issues: ProModuleReleaseReadinessIssue[];
}

export type ProModuleRevenueSource =
  | 'direct-pack'
  | 'marketplace'
  | 'studio-bundle'
  | 'enterprise-allocation';

export interface ProModuleRevenueRecord {
  id: string;
  moduleId: string;
  customerId: string;
  source: ProModuleRevenueSource;
  occurredAt: number;
  amountCents: number;
  arrContributionCents: number;
}

export interface ProModuleRevenueMixTargets {
  proRevenueShareBps: number;
  minModulesWithRevenue: number;
  minPayingCustomers: number;
  maxSingleModuleProRevenueShareBps: number;
  maxSingleCustomerProRevenueShareBps: number;
}

export interface ProModuleRevenueModuleSummary {
  moduleId: string;
  name?: string;
  category?: ProModuleCategory;
  revenueCents: number;
  arrContributionCents: number;
  orders: number;
  payingCustomers: number;
}

export interface ProModuleRevenueMixShortfall {
  code:
    | 'total_arr_missing'
    | 'pro_revenue_share_shortfall'
    | 'module_revenue_shortfall'
    | 'paying_customer_shortfall'
    | 'module_concentration_too_high'
    | 'customer_concentration_too_high';
  severity: 'warning' | 'error';
  detail: string;
  remediation?: string;
}

export interface ProModuleRevenueMixReport {
  ready: boolean;
  generatedAt: number;
  period: {
    from: number;
    to: number;
    label: string;
  };
  targets: ProModuleRevenueMixTargets;
  summary: {
    totalArrCents: number;
    proArrContributionCents: number;
    proRevenueShareBps: number;
    revenueCents: number;
    orders: number;
    modulesWithRevenue: number;
    payingCustomers: number;
    topModuleProRevenueShareBps: number;
    topCustomerProRevenueShareBps: number;
  };
  modules: ProModuleRevenueModuleSummary[];
  shortfalls: ProModuleRevenueMixShortfall[];
}

export type ProModuleCustomerPlan = 'free' | 'indie' | 'studio' | 'enterprise';

export interface ProModuleAttachSnapshot {
  id: string;
  customerId: string;
  plan: ProModuleCustomerPlan;
  observedAt: number;
  active: boolean;
  moduleIds: string[];
  proArrCents: number;
  totalArrCents: number;
  expansionArrCents?: number;
  churnedAt?: number;
}

export interface ProModuleAttachTargets {
  minAttachRateBps: number;
  minMultiModuleAttachRateBps: number;
  minStudioEnterpriseAttachRateBps: number;
  minModulesWithActiveCustomers: number;
  minExpansionArrCents: number;
  maxChurnedProCustomerRateBps: number;
}

export interface ProModuleAttachModuleSummary {
  moduleId: string;
  name?: string;
  category?: ProModuleCategory;
  activeCustomers: number;
  proArrCents: number;
}

export interface ProModuleAttachShortfall {
  code:
    | 'paid_customer_missing'
    | 'attach_rate_shortfall'
    | 'multi_module_shortfall'
    | 'studio_enterprise_attach_shortfall'
    | 'module_breadth_shortfall'
    | 'expansion_arr_shortfall'
    | 'pro_churn_too_high';
  severity: 'warning' | 'error';
  detail: string;
  remediation?: string;
}

export interface ProModuleAttachReport {
  ready: boolean;
  generatedAt: number;
  period: {
    from: number;
    to: number;
    label: string;
  };
  targets: ProModuleAttachTargets;
  summary: {
    paidCustomers: number;
    attachedCustomers: number;
    attachRateBps: number;
    multiModuleCustomers: number;
    multiModuleAttachRateBps: number;
    studioEnterpriseCustomers: number;
    studioEnterpriseAttachedCustomers: number;
    studioEnterpriseAttachRateBps: number;
    activeProArrCents: number;
    expansionArrCents: number;
    churnedProCustomers: number;
    churnedProCustomerRateBps: number;
    modulesWithActiveCustomers: number;
  };
  modules: ProModuleAttachModuleSummary[];
  shortfalls: ProModuleAttachShortfall[];
}

export type ProModuleBetaEngine = 'unity' | 'unreal' | 'godot';

export type ProModuleRoundTripValueType = 'int' | 'float' | 'string' | 'Color' | 'Vector3';

export interface ProModuleBetaValidationRecord {
  id: string;
  moduleId: string;
  designPartnerId: string;
  observedAt: number;
  engine: ProModuleBetaEngine;
  artifactExported: boolean;
  designerReviewed: boolean;
  acceptedDiffs: number;
  rejectedDiffs: number;
  openCriticalIssues: number;
  roundTripValueTypes: ProModuleRoundTripValueType[];
}

export interface ProModuleBetaValidationTargets {
  launchModuleCount: number;
  minDesignPartnersPerLaunchModule: number;
  minReviewedExportsPerLaunchModule: number;
  minAcceptedDiffRateBps: number;
  maxOpenCriticalIssues: number;
  requiredRoundTripValueTypes: ProModuleRoundTripValueType[];
}

export interface ProModuleBetaValidationModuleSummary {
  moduleId: string;
  name?: string;
  category?: ProModuleCategory;
  designPartners: number;
  reviewedExports: number;
  acceptedDiffs: number;
  rejectedDiffs: number;
  acceptedDiffRateBps: number;
  engines: ProModuleBetaEngine[];
  roundTripValueTypes: ProModuleRoundTripValueType[];
  openCriticalIssues: number;
  ready: boolean;
}

export interface ProModuleBetaValidationShortfall {
  code:
    | 'launch_module_evidence_missing'
    | 'design_partner_shortfall'
    | 'reviewed_export_shortfall'
    | 'round_trip_field_coverage_missing'
    | 'accepted_diff_rate_shortfall'
    | 'critical_issue_open';
  severity: 'warning' | 'error';
  moduleId?: string;
  detail: string;
  remediation?: string;
}

export interface ProModuleBetaValidationReport {
  ready: boolean;
  generatedAt: number;
  period: {
    from: number;
    to: number;
    label: string;
  };
  targets: ProModuleBetaValidationTargets;
  summary: {
    launchModulesEvaluated: number;
    launchModulesReady: number;
    designPartners: number;
    reviewedExports: number;
    acceptedDiffs: number;
    rejectedDiffs: number;
    acceptedDiffRateBps: number;
    modulesWithRoundTripCoverage: number;
    openCriticalIssues: number;
  };
  modules: ProModuleBetaValidationModuleSummary[];
  shortfalls: ProModuleBetaValidationShortfall[];
}

export interface ProBusinessModelProofExport {
  proModules: {
    revenueShare: number;
    shippedModules: number;
    paidPurchases: number;
    signedBundles: number;
    publishedObjects: number;
    attachRateBps: number;
    multiModuleAttachRateBps: number;
    studioEnterpriseAttachRateBps: number;
    expansionArrUsd: number;
    proChurnedCustomerRateBps: number;
    modulesWithActiveCustomers: number;
    betaValidatedModules: number;
    betaDesignPartners: number;
    betaReviewedExports: number;
    betaAcceptedDiffRateBps: number;
    attachReady: boolean;
    betaReady: boolean;
    loaderRejectsUnsigned: boolean;
    publishProductionReady: boolean;
    publishHandoffReady: boolean;
    publishReleaseMatchReady: boolean;
    sourceBusinessModelReady: boolean;
  };
  source: {
    reports: [
      'pro-module-revenue-mix',
      'pro-module-release-readiness',
      'pro-module-publish-proof',
      'pro-module-cloud-handoff',
      'pro-module-attach-readiness',
      'pro-module-beta-validation',
    ];
    generatedAt: number;
    revenuePeriod: ProModuleRevenueMixReport['period'];
    attachPeriod?: ProModuleAttachReport['period'];
    betaPeriod?: ProModuleBetaValidationReport['period'];
    revenueMixReady: boolean;
    releaseReady: boolean;
    publishReady: boolean;
    publishProductionReady: boolean;
    publishHandoffReady: boolean;
    publishReleaseMatchReady: boolean;
    attachReady: boolean;
    betaReady: boolean;
    businessModelReady: boolean;
  };
  disclaimer: string;
}

export type ProModuleEntitlementRegistryCheckStatus = 'pass' | 'fail';

export interface ProModuleEntitlementRegistryCheck {
  id: string;
  status: ProModuleEntitlementRegistryCheckStatus;
  detail: string;
  moduleId?: string;
}

export interface ProModuleEntitlementRegistryIssue {
  code:
    | 'format_invalid'
    | 'duplicate_module_id'
    | 'duplicate_sku'
    | 'duplicate_grant_key'
    | 'missing_module_id'
    | 'extra_module_id'
    | 'sku_grant_drift'
    | 'object_key_drift'
    | 'hash_drift'
    | 'release_field_drift'
    | 'publish_proof_not_ready'
    | 'non_production_provider'
    | 'cloud_handoff_not_ready'
    | 'cloud_handoff_drift'
    | 'unsafe_registry_field';
  severity: 'error';
  moduleId?: string;
  detail: string;
  remediation?: string;
}

export interface ProModuleEntitlementRegistryReadinessFlags {
  manifestPresent: boolean;
  uploadPlanned: boolean;
  publishProofReady: boolean;
  productionPublishProof: boolean;
  cloudHandoffAligned?: boolean;
}

export interface ProModuleEntitlementRegistryImportItem {
  sku: string;
  grantKey: string;
  moduleId: string;
  name: string;
  version: string;
  payloadSha256: string;
  envelopeSha256: string;
  objectKey: string;
  cdnPath: string;
  licenseTier: string;
  price: ProModulePrice;
  keyId: string;
  releaseChannel: string;
  objectPrefix: string;
  readiness: ProModuleEntitlementRegistryReadinessFlags;
}

export interface ProModuleEntitlementRegistryReport {
  ready: boolean;
  generatedAt: number;
  releaseChannel: string;
  objectPrefix: string;
  keyId: string;
  provider: string;
  itemCount: number;
  summary: {
    manifestModules: number;
    uploadPlanBundleObjects: number;
    publishProofBundleModules: number;
    productionPublishProof: boolean;
    cloudHandoffChecked: boolean;
  };
  checks: ProModuleEntitlementRegistryCheck[];
  issues: ProModuleEntitlementRegistryIssue[];
}

export interface ProModuleEntitlementRegistry extends ProModuleEntitlementRegistryReport {
  format: 'greybox.pro.entitlement-registry/v1';
  importItems: ProModuleEntitlementRegistryImportItem[];
  disclaimer: string;
}

export interface GbproPayload {
  generatedBy: 'greybox-pro';
  license: 'proprietary';
  moduleId: string;
  version: string;
  files: ProModuleFile[];
}

export interface GbproEncryptedPayloadEnvelope {
  algorithm: 'aes-256-gcm';
  keyDerivation: 'sha256-license-secret';
  nonce: string;
  authTag: string;
  ciphertext: string;
}
