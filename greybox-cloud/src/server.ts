// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import {
  applyCorsHeaders,
  corsPolicyFromEnv,
  handleCorsPreflight,
  type CorsPolicy,
} from './security/cors.js';
import { assertHostedProductionCors } from './security/corsProdSafety.js';
import {
  clientKey,
  HttpRateLimiter,
  httpRateLimiterFromEnv,
  sendRateLimited,
} from './security/httpRateLimit.js';
import { assertHostedProductionRateLimit } from './security/rateLimitProdSafety.js';
import { reserveGenerationQuota } from './security/generationRateLimit.js';
import {
  maxPayloadBytesFromEnv,
  PayloadTooLargeError,
  readJsonWithLimit,
  readRawBodyWithLimit,
} from './security/payloadLimit.js';
import { hardenLicenseOptionsForProd } from './security/licenseProdSafety.js';
import {
  assertHostedProductionAuth,
  authBreakGlassAllowed,
  hostedProductionWorkOsJwksUrlVerified,
} from './security/authProdSafety.js';
import { assertHostedProductionPersistence, isHostedProductionEnv } from './security/persistenceProdSafety.js';
import { assertHostedProductionProviderPolicy } from './security/providerPolicyProdSafety.js';
import { providerPolicyFromEnv } from './providers/selector.js';
import { assertHostedProductionCheckoutReady } from './security/billingCheckoutProdSafety.js';
import {
  assertHostedProductionMeteringLive,
  HostedProductionMeteringError,
} from './security/billingMeterProdSafety.js';
import { assertHostedProductionEncryption } from './security/encryptionProdSafety.js';
import { assertHostedProductionDataResidency } from './security/dataResidencyProdSafety.js';
import {
  assertHostedProductionPublicBaseUrl,
  normalizePublicBaseUrl,
} from './security/publicBaseUrlProdSafety.js';
import { assertHostedProductionScimToken } from './security/scimProdSafety.js';
import type { SentryAdapter } from './observability/sentry.js';
import { isBillingAdmin } from './routers/admin-auth.js';
import { AnthropicProvider } from './providers/anthropic.js';
import { BedrockProvider } from './providers/bedrock.js';
import { GreyboxNativeProvider } from './providers/greybox-native.js';
import { OpenAiProvider } from './providers/openai.js';
import { InferenceService, encodeSse, toSseChunks } from './routers/inference.js';
import {
  authenticateRequest,
  AuthenticationError,
  workOsGroupRoleMapFromEnv,
  type AuthenticateOptions,
  type WorkOsGroupRoleMap,
} from './routers/auth.js';
import {
  DATA_RESIDENCY_REGIONS,
  TenantStore,
} from './routers/tenants.js';
import { buildDataResidencyReadinessReport } from './enterprise/dataResidencyReadiness.js';
import {
  assertTenantRegionRuntime,
  dataResidencyRuntimeModeFromEnv,
  DataResidencyRuntimeError,
  type DataResidencyRuntimeDecision,
} from './enterprise/dataResidencyRuntime.js';
import { buildEncryptionReadinessReport } from './enterprise/encryptionReadiness.js';
import { buildProviderPolicyReadinessReport } from './enterprise/providerPolicyReadiness.js';
import {
  buildPiiRedactionEvidenceReport,
  formatPiiRedactionEvidenceMarkdown,
} from './enterprise/piiRedactionEvidence.js';
import {
  BillingWebhookError,
  LiveBillingApiClient,
  PLAN_METERING,
  buildCheckoutReadinessReport,
  handleStripeWebhook,
  stripeWebhookEventsFromEnv,
  type BillingCheckoutSessionInput,
  type BillingPortalSessionInput,
} from './routers/billing.js';
import {
  RazorpayBillingError,
  createRazorpaySubscription,
  handleRazorpayWebhook,
  buildRazorpaySubscriptionStatus,
  getRazorpaySubscriptionLive,
  processRazorpayVerifyPayment,
  razorpayPlanIdFromEnv,
  buildRazorpayPortalUrl,
} from './routers/billing-razorpay.js';
import {
  DodoBillingError,
  createDodoCheckout,
  getDodoCustomerPortal,
  handleDodoWebhook,
  dodoProductIdFromEnv,
} from './routers/billing-dodo.js';
import {
  LemonSqueezyBillingError,
  createLemonSqueezyCheckout,
  handleLemonSqueezyWebhook,
  getLemonSqueezyCustomerPortalUrl,
  lemonSqueezyVariantIdFromEnv,
} from './routers/billing-lemonsqueezy.js';
import { MemoryUsageSink, UsageEmitter, type UsageSink } from './metering/usageEmitter.js';
import { FileBillingLedger, FileUsageSink, type BillingLedger } from './metering/billingLedger.js';
import {
  CharacterMeteringEmitter,
  TIER_GENERATION_LIMITS,
  nextPeriodStart,
} from './metering/characterMeteringEmitter.js';
import { SpriteMeteringEmitter, SpriteMeteringError } from './metering/spriteMeteringEmitter.js';
import { generateSprite, FalAiError } from './providers/falAi.js';
import { LangfuseBridge } from './observability/langfuse.js';
import { MetricsRegistry } from './observability/metrics.js';
import { normalizeRequestId, randomRequestId } from './observability/requestId.js';
import { redactPiiText } from './safety/piiRedactor.js';
import type { AuthContext, InferenceRequest, InferenceResult } from './types.js';
import {
  BillingInvoiceBillingIdentityError,
  BillingInvoiceJobError,
  BillingInvoicePeriodError,
  parseBillingInvoiceJobRequest,
  runBillingInvoiceJob,
} from './routers/billing-jobs.js';
import { StripeMeterSubmitter } from './metering/stripeMeterSubmitter.js';
import {
  encodeOpenAiCompatibleSse,
  openAiCompatibleCompletionResponse,
  openAiCompatibleModelsResponse,
  openAiCompatibleToInferenceRequest,
  type OpenAiCompatibleChatRequest,
} from './routers/openai-compatible.js';
import { WorkOsJwtVerifier } from './routers/workos-auth.js';
import {
  auditSealOptionsFromEnv,
  auditId,
  exportAuditCsv,
  exportAuditSplunkJson,
  FileAuditLog,
  type AuditAction,
  type AuditLog,
} from './enterprise/auditLog.js';
import {
  FileSecurityIncidentStore,
  SecurityIncidentError,
  type SecurityIncidentSeverity,
  type SecurityIncidentStatus,
  type SecurityIncidentRecord,
  type SecurityIncidentStore,
} from './enterprise/incidents.js';
import {
  FileModelTrainingConsentStore,
  ModelTrainingConsentError,
  publicModelTrainingConsentView,
  type ModelTrainingConsentStore,
  type ModelTrainingConsentRecord,
} from './enterprise/modelTrainingConsent.js';
import {
  buildNativeTrainingReadinessReport,
  formatNativeTrainingReadinessMarkdown,
  nativeTrainingCandidatesFromEnv,
  type NativeTrainingArtifactCandidateInput,
} from './enterprise/nativeTrainingReadiness.js';
import {
  buildSubprocessorRegistry,
  type SubprocessorPurpose,
  type SubprocessorStatus,
} from './enterprise/subprocessors.js';
import {
  buildRetentionReport,
  defaultRetentionPolicies,
  FileLegalHoldStore,
  RetentionError,
  type LegalHoldStore,
  type LegalHoldRecord,
  type LegalHoldStatus,
  type RetentionDataset,
} from './enterprise/retention.js';
import {
  buildPrivacyGovernanceReport,
  PrivacyGovernanceError,
} from './enterprise/privacyGovernance.js';
import {
  buildPrivacyDisclosureReport,
  PrivacyDisclosureError,
  type PrivacyDisclosureJurisdiction,
} from './enterprise/privacyDisclosures.js';
import {
  buildPrivateNetworkReadinessReport,
  PrivateNetworkReadinessError,
  type PrivateNetworkProvider,
  type PrivateNetworkStatus,
} from './enterprise/privateNetworkReadiness.js';
import {
  buildSecurityQuestionnaireReport,
  exportSecurityQuestionnaireCsv,
} from './enterprise/securityQuestionnaire.js';
import {
  buildEnterpriseContractPacket,
  formatEnterpriseContractPacketMarkdown,
  type EnterpriseContractPacket,
} from './enterprise/contractPacket.js';
import {
  buildEnterprisePilotReadinessReport,
  formatEnterprisePilotReadinessMarkdown,
} from './enterprise/enterprisePilotReadiness.js';
import {
  buildEnterpriseLogoExpansionReport,
  enterpriseLogoMetricsFromEnv,
  formatEnterpriseLogoExpansionMarkdown,
  type EnterpriseLogoMetricInput,
} from './enterprise/enterpriseLogoExpansion.js';
import {
  acquisitionMetricsFromEnv,
  buildAcquisitionReadinessReport,
  formatAcquisitionReadinessMarkdown,
  type AcquisitionReadinessMetricInput,
} from './enterprise/acquisitionReadiness.js';
import {
  buildBusinessModelProofReport,
  businessModelProofFromEnv,
  formatBusinessModelProofMarkdown,
  type BusinessModelProofInput,
} from './enterprise/businessModelProof.js';
import {
  buildStrategicOutreachReport,
  formatStrategicOutreachMarkdown,
  strategicOutreachRecordsFromEnv,
  type StrategicOutreachRecordInput,
} from './enterprise/strategicOutreach.js';
import {
  buildCommercialCreditReport,
  commercialCreditRecordsFromEnv,
  formatCommercialCreditMarkdown,
  type CommercialGameCreditRecordInput,
} from './enterprise/commercialCredits.js';
import {
  buildEnginePartnershipReport,
  enginePartnershipRecordsFromEnv,
  formatEnginePartnershipMarkdown,
  type EnginePartnershipRecordInput,
} from './enterprise/enginePartnerships.js';
import {
  buildCodingAgentPartnershipReport,
  codingAgentPartnershipRecordsFromEnv,
  formatCodingAgentPartnershipMarkdown,
  type CodingAgentPartnershipRecordInput,
} from './enterprise/codingAgentPartnerships.js';
import {
  buildEducationAdoptionReport,
  educationAdoptionRecordsFromEnv,
  formatEducationAdoptionMarkdown,
  type EducationInstitutionRecordInput,
} from './enterprise/educationAdoption.js';
import {
  buildContentCadenceReport,
  contentCadenceRecordsFromEnv,
  formatContentCadenceMarkdown,
  type ContentCadenceRecordInput,
} from './enterprise/contentCadence.js';
import {
  buildSalesMotionReadinessReport,
  formatSalesMotionReadinessMarkdown,
  salesMotionMetricsFromEnv,
  type SalesMotionMetricInput,
  type SalesMotionReadinessReport,
} from './enterprise/salesMotionReadiness.js';
import {
  buildSupportSlaReadinessReport,
  formatSupportSlaReadinessMarkdown,
  supportSlaTicketsFromEnv,
  type SupportSlaTicketInput,
} from './enterprise/supportSlaReadiness.js';
import {
  buildUnityPluginAdoptionReport,
  formatUnityPluginAdoptionMarkdown,
  unityPluginAdoptionMetricsFromEnv,
  type UnityPluginAdoptionMetricInput,
} from './enterprise/unityPluginAdoption.js';
import {
  buildDistributionReadinessReport,
  distributionMetricsFromEnv,
  formatDistributionReadinessMarkdown,
  type DistributionMetricInput,
} from './enterprise/distributionReadiness.js';
import {
  buildEngineExpansionReadinessReport,
  engineExpansionMetricsFromEnv,
  formatEngineExpansionReadinessMarkdown,
  type EngineExpansionMetricInput,
} from './enterprise/engineExpansionReadiness.js';
import {
  buildNorthStarReport,
  formatNorthStarMarkdown,
  northStarEventsFromEnv,
  type ProductAnalyticsEvent,
} from './analytics/northStar.js';
import { handleScimRequest, ScimUserStore } from './enterprise/scim.js';
import { loadOfflineLicenseStatus } from './enterprise/offlineLicense.js';
import { assessOnPremReadiness, type OnPremReadinessOptions } from './enterprise/onPremReadiness.js';
import { buildPrivacyFulfillmentPackage } from './enterprise/privacyFulfillment.js';
import {
  buildEnterpriseTrustPacket,
  formatEnterpriseTrustPacketMarkdown,
  type EnterpriseTrustPacket,
} from './enterprise/trustPacket.js';
import { buildTrustControlReport, type TrustControlReport } from './enterprise/trustControls.js';
import {
  buildCertificationRoadmapReport,
  type CertificationRoadmapReport,
} from './enterprise/certificationRoadmap.js';
import {
  adminPrivacyRequestView,
  FilePrivacyRequestStore,
  normalizePrivacyStatusUpdate,
  type PrivacyJurisdiction,
  PrivacyRequestError,
  privacyRequestAuthorized,
  type PrivacyRequestStore,
  type PrivacyRequestStatus,
  publicPrivacyRequestView,
} from './enterprise/privacyRequests.js';
import {
  LicenseValidationError,
  type LicenseRecord,
  type LicenseRecordStore,
  type LicenseValidationResponse,
  licenseRecordsFromEnv,
  licenseTokenFromHeaders,
  licenseValidationResponse,
  unityTierFromAuthContext,
  validateLicenseToken,
} from './routers/licenses.js';
import {
  signedLicenseKeysFromEnv,
  type SignedLicenseKeyRegistry,
} from './routers/signedLicenseToken.js';
import {
  marketplaceEntitlementGrantForRequest,
  mergeProModuleEntitlementLookupKeys,
  mergeProModuleEntitlements,
  proModuleBundleDownloadResponse,
  proModuleBundleRegistryFromEnv,
  proModuleEntitlementLookupKeysFromEnv,
  proModuleEntitlementLookupKeysFromGrantRecords,
  proModuleEntitlementsFromGrantRecords,
  normalizeProModuleSecretRequest,
  proModuleEntitlementsFromEnv,
  ProModuleSecretError,
  type ProModuleBundleDownloadResponse,
  type ProModuleBundleRecord,
  type ProModuleBundleRegistry,
  type ProModuleSecretRequest,
  type ProModuleSecretResponse,
  proModuleSecretResponse,
  type ProModuleEntitlementGrantStore,
  type ProModuleEntitlementLookupKeys,
  type ProModuleEntitlements,
  type ProModuleMarketplaceFetch,
} from './routers/pro-modules.js';
import {
  CharacterService,
  handleCharacterRoute,
} from './routers/characters.js';
import { characterGenRegistryFromEnv } from './providers/character-gen/index.js';
import {
  AssetRegistrar,
  assetStorageFromEnv,
} from './providers/character-gen/asset-registry.js';
import {
  type CharacterJobStore,
  postgresCharacterJobStoreFromEnv,
} from './stores/CharacterJobStore.js';

export interface GreyboxCloudServerOptions {
  service?: Pick<InferenceService, 'run'>;
  metrics?: MetricsRegistry;
  billingLedger?: BillingLedger;
  billingLedgerPersistence?: 'memory' | 'file' | 'postgres' | 'injected' | 'durable-injected';
  billingAdminToken?: string;
  stripeWebhookSecret?: string;
  stripeSubmitter?: StripeMeterSubmitter;
  tenantStore?: TenantStore;
  tenantStorePersistence?: 'memory' | 'file' | 'postgres' | 'injected' | 'durable-injected';
  workosVerifier?: Pick<WorkOsJwtVerifier, 'verify'>;
  workosGroupRoleMap?: WorkOsGroupRoleMap;
  auditLog?: AuditLog;
  auditLogPersistence?: 'memory' | 'file' | 'postgres' | 'injected' | 'durable-injected';
  auditAdminToken?: string;
  scimStore?: ScimUserStore;
  scimStorePersistence?: 'memory' | 'file' | 'postgres' | 'injected' | 'durable-injected';
  scimToken?: string;
  scimTenantId?: string;
  offlineLicensePath?: string;
  offlineLicensePublicKeyPem?: string;
  offlineLicensePublicKeyPath?: string;
  proModuleSecretMasterKey?: string;
  proModuleEntitlements?: ProModuleEntitlements;
  proModuleEntitlementLookupKeys?: ProModuleEntitlementLookupKeys;
  proModuleEntitlementGrantStore?: ProModuleEntitlementGrantStore;
  proModuleEntitlementPersistence?: 'memory' | 'env' | 'postgres' | 'injected' | 'durable-injected';
  proModuleBundleRegistry?: ProModuleBundleRegistry;
  proModuleCdnBaseUrl?: string;
  proModuleDownloadSigningKey?: string;
  marketplaceUrl?: string;
  marketplaceAdminToken?: string;
  marketplaceFetch?: ProModuleMarketplaceFetch;
  marketplaceReportFetch?: MarketplaceReportFetch;
  onPremReadiness?: OnPremReadinessOptions;
  privacyRequestStore?: PrivacyRequestStore;
  privacyRequestStorePersistence?: 'memory' | 'file' | 'postgres' | 'injected' | 'durable-injected';
  incidentStore?: SecurityIncidentStore;
  incidentStorePersistence?: 'memory' | 'file' | 'postgres' | 'injected' | 'durable-injected';
  modelTrainingConsentStore?: ModelTrainingConsentStore;
  modelTrainingConsentStorePersistence?: 'memory' | 'file' | 'postgres' | 'injected' | 'durable-injected';
  legalHoldStore?: LegalHoldStore;
  legalHoldStorePersistence?: 'memory' | 'file' | 'postgres' | 'injected' | 'durable-injected';
  nativeTrainingCandidates?: readonly NativeTrainingArtifactCandidateInput[];
  privacyGovernanceEnv?: Record<string, string | undefined>;
  privacyDisclosureEnv?: Record<string, string | undefined>;
  dataResidencyEnv?: Record<string, string | undefined>;
  encryptionEnv?: Record<string, string | undefined>;
  privateNetworkEnv?: Record<string, string | undefined>;
  providerPolicyEnv?: Record<string, string | undefined>;
  authEnv?: Record<string, string | undefined>;
  corsEnv?: Record<string, string | undefined>;
  rateLimitEnv?: Record<string, string | undefined>;
  piiRedactionEvidenceEnv?: Record<string, string | undefined>;
  billingCheckoutEnv?: Record<string, string | undefined>;
  stripeWebhookEvents?: readonly string[];
  billingMeteringEnv?: Record<string, string | undefined>;
  publicBaseUrlEnv?: Record<string, string | undefined>;
  contractRoot?: string;
  trustControlReport?: TrustControlReport;
  certificationRoadmapReport?: CertificationRoadmapReport;
  enterpriseContractPacket?: EnterpriseContractPacket;
  licenseRecords?: readonly LicenseRecord[];
  licenseRecordStore?: LicenseRecordStore;
  licenseRecordPersistence?: 'memory' | 'env' | 'postgres' | 'injected' | 'durable-injected';
  licenseSigningKeys?: SignedLicenseKeyRegistry;
  acquisitionMetrics?: AcquisitionReadinessMetricInput;
  corsPolicy?: CorsPolicy;
  rateLimiter?: HttpRateLimiter;
  sentry?: SentryAdapter;
  businessModelProof?: BusinessModelProofInput;
  strategicOutreachRecords?: readonly StrategicOutreachRecordInput[];
  commercialCreditRecords?: readonly CommercialGameCreditRecordInput[];
  enginePartnershipRecords?: readonly EnginePartnershipRecordInput[];
  codingAgentPartnershipRecords?: readonly CodingAgentPartnershipRecordInput[];
  educationAdoptionRecords?: readonly EducationInstitutionRecordInput[];
  contentCadenceRecords?: readonly ContentCadenceRecordInput[];
  contentCadenceNow?: Date;
  salesMotionMetrics?: SalesMotionMetricInput;
  salesMotionReadinessReport?: SalesMotionReadinessReport;
  supportSlaTickets?: readonly SupportSlaTicketInput[];
  unityAdoptionMetrics?: UnityPluginAdoptionMetricInput;
  distributionMetrics?: DistributionMetricInput;
  enterpriseLogoMetrics?: EnterpriseLogoMetricInput;
  engineExpansionMetrics?: EngineExpansionMetricInput;
  northStarEvents?: readonly ProductAnalyticsEvent[];
  northStarGeneratedAt?: Date;
  /**
   * Stripe billing client for /v1/billing/checkout-session and /v1/billing/portal-session.
   * Defaults to LiveBillingApiClient(STRIPE_API_KEY); set to a mock for tests.
   */
  billingApiClient?: LiveBillingApiClient;
  stripeApiKey?: string;
  /** Testable clock for billing invoice period-close enforcement. */
  billingInvoiceJobNow?: () => Date;
  /** Stripe price ids per tier; resolves from STRIPE_PRICE_INDIE/STUDIO env when omitted. */
  billingPriceIds?: { indie?: string; studio?: string };
  /** Canonical public Cloud origin for SCIM metadata and identity-provider callbacks. */
  publicBaseUrl?: string;
  /** Optional character service for AI-generated 3D character workflows. */
  characterService?: CharacterService;
  /** Optional injected CharacterJobStore. Falls back to in-memory or postgres-from-env. */
  characterJobStore?: CharacterJobStore;
  characterJobStorePersistence?: 'memory' | 'postgres' | 'injected';
}

export type MarketplaceReportFetch = (
  url: string,
  init: {
    method: 'GET';
    headers: Record<string, string>;
  },
) => Promise<Pick<Response, 'ok' | 'status' | 'text'>>;

let configuredMaxPayloadBytes = maxPayloadBytesFromEnv();

export function setMaxPayloadBytesForTesting(bytes: number): void {
  if (bytes <= 0) throw new Error('max payload bytes must be > 0');
  configuredMaxPayloadBytes = bytes;
}

export function resetMaxPayloadBytesForTesting(): void {
  configuredMaxPayloadBytes = maxPayloadBytesFromEnv();
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  return readJsonWithLimit(request, configuredMaxPayloadBytes);
}

async function readRawBody(request: IncomingMessage): Promise<string> {
  return readRawBodyWithLimit(request, configuredMaxPayloadBytes);
}

const hostedCheckoutTenantIdPattern = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u;

type HostedCheckoutTier = 'indie' | 'studio';

interface ReadinessCheck {
  ok: boolean;
  configured?: boolean;
  detail?: string;
}

interface HostedCheckoutRequest {
  tier: HostedCheckoutTier;
  tenantId?: string;
  seats: number;
  customerEmail?: string;
}

function readinessRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function proModuleBundleRegistryReadiness(options: Pick<GreyboxCloudServerOptions, 'proModuleBundleRegistry'>): ReadinessCheck {
  if (options.proModuleBundleRegistry) {
    const bundleCount = Object.keys(options.proModuleBundleRegistry).length;
    return {
      ok: true,
      configured: bundleCount > 0,
      detail: bundleCount > 0 ? `injected; ${bundleCount} bundles` : 'injected-empty',
    };
  }

  const entitlementRegistryRaw = process.env.GREYBOX_PRO_MODULE_ENTITLEMENT_REGISTRY_JSON?.trim();
  if (entitlementRegistryRaw) {
    const registry = proModuleBundleRegistryFromEnv(process.env);
    const bundleCount = Object.keys(registry).length;
    return {
      ok: true,
      configured: bundleCount > 0,
      detail: bundleCount > 0 ? `entitlement-registry; ${bundleCount} bundles` : 'invalid-entitlement-registry',
    };
  }

  const raw = process.env.GREYBOX_PRO_MODULE_BUNDLES_JSON?.trim();
  if (!raw) {
    return { ok: true, configured: false, detail: 'missing' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: true, configured: false, detail: 'invalid-json' };
  }

  const releaseManifest = readinessRecord(parsed)
    && parsed.format === 'greybox.pro.bundle-release/v1'
    && Array.isArray(parsed.items);
  const hasUploadPlan = Boolean(process.env.GREYBOX_PRO_MODULE_BUNDLE_UPLOAD_PLAN_JSON?.trim());
  const hasPublishProof = Boolean(process.env.GREYBOX_PRO_MODULE_BUNDLE_PUBLISH_PROOF_JSON?.trim());
  const registry = proModuleBundleRegistryFromEnv(process.env);
  const bundleCount = Object.keys(registry).length;
  if (bundleCount > 0) {
    return {
      ok: true,
      configured: true,
      detail: releaseManifest
        ? `release-manifest-publish-proof; ${bundleCount} bundles`
        : `direct-registry; ${bundleCount} bundles`,
    };
  }

  if (releaseManifest && !hasUploadPlan) {
    return { ok: true, configured: false, detail: 'release-manifest-missing-upload-plan' };
  }
  if (releaseManifest && !hasPublishProof) {
    return { ok: true, configured: false, detail: 'release-manifest-missing-publish-proof' };
  }
  return { ok: true, configured: false, detail: 'invalid-or-unpublished' };
}

function encryptionRuntimeReadiness(env: Record<string, string | undefined>): ReadinessCheck {
  const report = buildEncryptionReadinessReport({ env });
  const summary = report.summary;
  return {
    ok: true,
    configured: summary.status === 'pass',
    detail: [
      summary.status,
      summary.kmsProvider,
      `${summary.encryptedDatasets}/${summary.requiredDatasets} datasets`,
      `${summary.regionsWithKeys}/${summary.requiredRegions} regions`,
      `kms exports ${summary.regionsWithKmsExportProof}/${summary.requiredRegions}`,
      `tls ${summary.tlsReady ? 'ready' : 'blocked'}`,
      `backups ${summary.backupsEncrypted ? 'ready' : 'blocked'}`,
      `secrets ${summary.secretManagerConfigured ? 'ready' : 'blocked'}`,
    ].join('; '),
  };
}

function hostedCheckoutTierFrom(value: string | null | undefined): HostedCheckoutTier | undefined {
  if (value === 'indie' || value === 'studio') return value;
  if (!value) return 'indie';
  return undefined;
}

function hostedCheckoutPlanLabel(tier: HostedCheckoutTier): string {
  return tier === 'studio' ? 'Studio' : 'Indie';
}

function hostedCheckoutSeatLabel(tier: HostedCheckoutTier, seats: number): string {
  return tier === 'studio' ? `${seats} seats` : '1 seat';
}

function normalizeHostedCheckoutTenantId(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim() ?? '';
  return hostedCheckoutTenantIdPattern.test(trimmed) ? trimmed : undefined;
}

function normalizeHostedCheckoutEmail(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim() ?? '';
  if (!trimmed || trimmed.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(trimmed)) return undefined;
  return trimmed;
}

function normalizeHostedCheckoutSeats(tier: HostedCheckoutTier, value: string | null | undefined): number {
  const plan = PLAN_METERING[tier];
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed)) return plan.minimumSeats;
  return Math.max(plan.minimumSeats, Math.min(1000, parsed));
}

function hostedCheckoutRequestFromSearch(searchParams: URLSearchParams): HostedCheckoutRequest | undefined {
  const tier = hostedCheckoutTierFrom(searchParams.get('tier'));
  if (!tier) return undefined;
  return {
    tier,
    tenantId: normalizeHostedCheckoutTenantId(searchParams.get('tenantId')),
    seats: normalizeHostedCheckoutSeats(tier, searchParams.get('seats')),
  };
}

async function hostedCheckoutRequestFromForm(request: IncomingMessage): Promise<HostedCheckoutRequest | undefined> {
  const body = await readRawBody(request);
  const params = new URLSearchParams(body);
  const tier = hostedCheckoutTierFrom(params.get('tier'));
  if (!tier) return undefined;
  return {
    tier,
    tenantId: normalizeHostedCheckoutTenantId(params.get('tenantId')),
    seats: normalizeHostedCheckoutSeats(tier, params.get('seats')),
    customerEmail: normalizeHostedCheckoutEmail(params.get('customerEmail') ?? params.get('email')),
  };
}

function hostedCheckoutPriceId(
  tier: HostedCheckoutTier,
  options: Pick<GreyboxCloudServerOptions, 'billingPriceIds'>,
): string | undefined {
  return options.billingPriceIds?.[tier]
    ?? (tier === 'indie' ? process.env.STRIPE_PRICE_INDIE : process.env.STRIPE_PRICE_STUDIO);
}

function hostedCheckoutReturnUrl(
  env: Record<string, string | undefined>,
  key: 'GREYBOX_BILLING_CHECKOUT_SUCCESS_URL' | 'GREYBOX_BILLING_CHECKOUT_CANCEL_URL',
  fallback: string,
): string {
  const candidate = env[key]?.trim();
  if (!candidate) return fallback;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') return parsed.toString();
  } catch {
    return fallback;
  }
  return fallback;
}

function hostedCheckoutHtml(input: {
  request?: HostedCheckoutRequest;
  priceConfigured: boolean;
  status: 'ready' | 'missing-tenant' | 'unsupported-plan' | 'missing-price' | 'stripe-error';
  stripeError?: string;
}): string {
  const tier = input.request?.tier ?? 'indie';
  const plan = PLAN_METERING[tier];
  const planLabel = hostedCheckoutPlanLabel(tier);
  const seats = input.request?.seats ?? plan.minimumSeats;
  const total = plan.monthlyBaseUsd * seats;
  const statusCopy: Record<typeof input.status, string> = {
    ready: 'Confirm the plan, then continue to Stripe for payment.',
    'missing-tenant': 'This checkout link needs a valid Greybox tenant id.',
    'unsupported-plan': 'This checkout link needs a supported plan.',
    'missing-price': 'Checkout is not configured yet. Stripe price IDs must be set before taking payment.',
    'stripe-error': 'Stripe could not create a Checkout session. Please try again or contact support.',
  };
  const canSubmit = input.status === 'ready' && input.priceConfigured && Boolean(input.request?.tenantId);
  const form = canSubmit
    ? `<form method="post" action="/v1/billing/hosted-checkout">
        <input type="hidden" name="tier" value="${escapeHtml(tier)}">
        <input type="hidden" name="tenantId" value="${escapeHtml(input.request?.tenantId ?? '')}">
        <input type="hidden" name="seats" value="${escapeHtml(String(seats))}">
        <button type="submit">Continue to Stripe</button>
      </form>`
    : '<p class="disabled">Checkout is disabled for this link.</p>';
  const error = input.stripeError ? `<p class="error">${escapeHtml(input.stripeError)}</p>` : '';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Greybox ${escapeHtml(planLabel)} Checkout</title>
  <style>
    :root { color-scheme: light; font-family: Inter, system-ui, sans-serif; background: #fafaf7; color: #0a0a0d; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; }
    main { width: min(100%, 520px); border: 1px solid #d8d8dc; border-radius: 8px; background: #fff; padding: 28px; box-shadow: 0 18px 42px rgba(10, 10, 13, 0.08); }
    .mark { width: 32px; height: 32px; margin-bottom: 20px; }
    h1 { margin: 0 0 8px; font-size: 28px; line-height: 36px; }
    p { margin: 0 0 16px; color: #5c6166; line-height: 24px; }
    dl { display: grid; grid-template-columns: 1fr auto; gap: 10px 16px; margin: 24px 0; }
    dt { color: #5c6166; }
    dd { margin: 0; font-weight: 700; text-align: right; }
    button { width: 100%; border: 0; border-radius: 8px; background: #ff6b35; color: #0a0a0d; font: inherit; font-weight: 700; padding: 13px 16px; cursor: pointer; }
    .disabled, .error { border-radius: 8px; padding: 12px; background: #fff4ef; color: #7f2e12; }
    a { color: #0a0a0d; }
    small { display: block; margin-top: 16px; color: #5c6166; line-height: 20px; }
  </style>
</head>
<body>
  <main>
    <svg class="mark" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Greybox">
      <rect x="0" y="0" width="8" height="8" fill="#D8D8DC"/><rect x="8" y="0" width="8" height="8" fill="#BFBFC4"/><rect x="16" y="0" width="8" height="8" fill="#A6A6AC"/>
      <rect x="0" y="8" width="8" height="8" fill="#BFBFC4"/><rect x="8" y="8" width="8" height="8" fill="#8C8C92"/><rect x="16" y="8" width="8" height="8" fill="#5C5C62"/>
      <rect x="0" y="16" width="8" height="8" fill="#A6A6AC"/><rect x="8" y="16" width="8" height="8" fill="#5C5C62"/><rect x="16" y="16" width="8" height="8" fill="#2F2F35"/>
      <polygon points="24,24 32,28 24,32" fill="#FF6B35"/>
    </svg>
    <h1>Greybox ${escapeHtml(planLabel)}</h1>
    <p>${escapeHtml(statusCopy[input.status])}</p>
    ${error}
    <dl>
      <dt>Monthly price</dt><dd>$${escapeHtml(String(total))}/mo</dd>
      <dt>Seats</dt><dd>${escapeHtml(hostedCheckoutSeatLabel(tier, seats))}</dd>
      <dt>Included input</dt><dd>${escapeHtml(formatTokenCount(plan.includedInputTokens))}</dd>
      <dt>Included output</dt><dd>${escapeHtml(formatTokenCount(plan.includedOutputTokens))}</dd>
    </dl>
    ${form}
    <small>No model training on your game data without separate opt-in. Checkout is processed by Stripe. See <a href="https://greybox.studio/privacy">Privacy</a> and <a href="https://greybox.studio/terms">Terms</a>.</small>
  </main>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;');
}

function formatTokenCount(value: number): string {
  if (value >= 1_000_000) return `${value / 1_000_000}M tokens`;
  if (value >= 1_000) return `${value / 1_000}K tokens`;
  return `${value} tokens`;
}

function headersFromIncoming(request: IncomingMessage): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) headers.set(key, value.join(','));
    else if (typeof value === 'string') headers.set(key, value);
  }
  return headers;
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

function sendHtml(response: ServerResponse, status: number, body: string): void {
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    'content-type': 'text/html; charset=utf-8',
    'x-content-type-options': 'nosniff',
  });
  response.end(body);
}

function sendText(response: ServerResponse, status: number, body: string, contentType: string): void {
  response.writeHead(status, { 'content-type': contentType });
  response.end(body);
}

function makeWorkOsVerifierFromEnv(env: Record<string, string | undefined> = process.env): WorkOsJwtVerifier | undefined {
  if (!env.WORKOS_JWKS_URL) return undefined;
  return new WorkOsJwtVerifier({
    jwksUrl: env.WORKOS_JWKS_URL,
    issuer: env.WORKOS_ISSUER,
    audience: env.GREYBOX_AUTH_AUDIENCE,
  });
}

function hasHostedProductionWorkOsValidation(
  env: Record<string, string | undefined>,
  verifier: Pick<WorkOsJwtVerifier, 'verify'> | undefined,
  injectedVerifier: Pick<WorkOsJwtVerifier, 'verify'> | undefined,
): boolean {
  if (injectedVerifier) return true;
  if (!verifier) return false;
  return Boolean(
    hostedProductionWorkOsJwksUrlVerified(env.WORKOS_JWKS_URL)
      && env.WORKOS_ISSUER
      && env.GREYBOX_AUTH_AUDIENCE,
  );
}

function publicAuthContext(context: Awaited<ReturnType<typeof authenticateRequest>>) {
  return {
    tenantId: context.tenantId,
    userId: context.userId,
    tier: context.tier,
    roles: context.roles,
    dataResidencyRegion: context.dataResidencyRegion,
    authProvider: context.authProvider,
    organizationId: context.organizationId,
    email: context.email,
    scopes: context.scopes ?? [],
  };
}

function requestBaseUrl(headers: Headers, configuredBaseUrl?: string): string {
  const configured = normalizePublicBaseUrl(configuredBaseUrl, { allowLocalHttp: true });
  if (configured) return configured;
  const protocol = firstForwardedHeaderValue(headers.get('x-forwarded-proto')) ?? 'http';
  const host = firstForwardedHeaderValue(headers.get('host')) ?? 'localhost';
  return normalizePublicBaseUrl(`${protocol}://${host}`, { allowLocalHttp: true }) ?? 'http://localhost';
}

function firstForwardedHeaderValue(value: string | null): string | undefined {
  return value?.split(',')[0]?.trim() || undefined;
}

function requestIp(request: IncomingMessage, headers: Headers): string | undefined {
  return headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.socket.remoteAddress || undefined;
}

function auditFilterFromUrl(url: URL): { tenantId?: string; action?: AuditAction; since?: string; until?: string } {
  const action = url.searchParams.get('action') ?? undefined;
  return {
    tenantId: url.searchParams.get('tenantId') ?? undefined,
    action: action as AuditAction | undefined,
    since: url.searchParams.get('since') ?? undefined,
    until: url.searchParams.get('until') ?? undefined,
  };
}

type MarketplaceReportName = 'reconciliation' | 'settlements' | 'tax-compliance';

function cleanMarketplaceUrl(url: string | undefined): string | undefined {
  const clean = url?.trim().replace(/\/+$/u, '');
  if (!clean) return undefined;
  try {
    const parsed = new URL(clean);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString().replace(/\/+$/u, '') : undefined;
  } catch {
    return undefined;
  }
}

function marketplaceReportProxyRequest(url: URL): {
  reportName: MarketplaceReportName;
  format: 'json' | 'csv';
  upstreamPath: string;
} {
  const report = url.searchParams.get('report') ?? 'tax-compliance';
  if (report !== 'reconciliation' && report !== 'settlements' && report !== 'tax-compliance') {
    throw new Error('unsupported_marketplace_report');
  }
  const format = url.searchParams.get('format') ?? 'json';
  if (format !== 'json' && format !== 'csv') throw new Error('unsupported_marketplace_report_format');

  const forwarded = new URLSearchParams();
  for (const key of ['creatorId', 'format', 'from', 'thresholdCents', 'to', 'year']) {
    const value = url.searchParams.get(key);
    if (value !== null && value.trim().length > 0) forwarded.set(key, value);
  }
  const query = forwarded.toString();
  return {
    reportName: report,
    format,
    upstreamPath: `/v1/marketplace/${report}${query ? `?${query}` : ''}`,
  };
}

async function appendInferenceAudit(options: {
  auditLog?: AuditLog;
  context: AuthContext;
  request: InferenceRequest;
  result: InferenceResult;
  headers: Headers;
  incoming: IncomingMessage;
  route: '/v1/inference' | '/v1/chat/completions';
}): Promise<void> {
  const pii = inferencePiiAuditMetadata(options.result.redactedLog.pii);
  const requestId = normalizeRequestId(options.context.requestId);
  await options.auditLog?.append({
    id: auditId('audit'),
    tenantId: options.context.tenantId,
    actorId: options.context.userId,
    actorType: 'user',
    action: 'inference.completed',
    targetType: 'project',
    targetId: options.request.projectId,
    projectId: options.request.projectId,
    createdAt: new Date().toISOString(),
    ip: requestIp(options.incoming, options.headers),
    userAgent: options.headers.get('user-agent') ?? undefined,
    metadata: {
      ...(requestId ? { requestId } : {}),
      route: options.route,
      task: options.request.task ?? 'design',
      provider: options.result.provider,
      model: options.result.model,
      inputTokens: options.result.usage.inputTokens,
      outputTokens: options.result.usage.outputTokens,
      stream: options.request.stream === true,
      tier: options.context.tier,
      authProvider: options.context.authProvider ?? 'managed-token',
      dataResidencyRegion: options.context.dataResidencyRegion ?? null,
      ...(pii ? { pii } : {}),
    },
  });
}

function inferencePiiAuditMetadata(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  const counts = record.counts && typeof record.counts === 'object' ? record.counts as Record<string, unknown> : {};
  const allowedTypes = new Set(['email', 'phone', 'ip', 'card']);
  return {
    redacted: record.redacted === true,
    types: Array.isArray(record.types)
      ? record.types.filter((type) => typeof type === 'string' && allowedTypes.has(type))
      : [],
    counts: {
      email: finiteCount(counts.email),
      phone: finiteCount(counts.phone),
      ip: finiteCount(counts.ip),
      card: finiteCount(counts.card),
    },
  };
}

function finiteCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

async function enforceDataResidencyRuntimeForRoute(options: {
  auditLog?: AuditLog;
  context: AuthContext;
  headers: Headers;
  incoming: IncomingMessage;
  route: '/v1/inference' | '/v1/chat/completions';
  tenantStore: TenantStore;
  env?: Record<string, string | undefined>;
}): Promise<void> {
  try {
    const decision = assertTenantRegionRuntime({
      headers: options.headers,
      context: options.context,
      tenantStore: options.tenantStore,
      env: options.env,
    });
    if (decision.mode !== 'off') {
      await appendDataResidencyRuntimeAudit({ ...options, decision });
    }
  } catch (error) {
    if (error instanceof DataResidencyRuntimeError) {
      await appendDataResidencyRuntimeAudit({ ...options, error });
    }
    throw error;
  }
}

async function appendDataResidencyRuntimeAudit(options: {
  auditLog?: AuditLog;
  context: AuthContext;
  decision?: DataResidencyRuntimeDecision;
  error?: DataResidencyRuntimeError;
  headers: Headers;
  incoming: IncomingMessage;
  route: '/v1/inference' | '/v1/chat/completions';
}): Promise<void> {
  const details = options.error?.details;
  await options.auditLog?.append({
    id: auditId('audit'),
    tenantId: options.context.tenantId,
    actorId: options.context.userId,
    actorType: 'user',
    action: 'data_residency.runtime_checked',
    targetType: 'regional-endpoint',
    targetId: options.route,
    createdAt: new Date().toISOString(),
    ip: requestIp(options.incoming, options.headers),
    userAgent: options.headers.get('user-agent') ?? undefined,
    metadata: {
      route: options.route,
      result: options.error ? 'rejected' : 'allowed',
      code: options.error?.code ?? null,
      status: options.error?.status ?? null,
      mode: options.decision?.mode ?? details?.mode ?? 'off',
      tenantRegion: options.decision?.tenant.region ?? details?.tenantRegion ?? options.context.dataResidencyRegion ?? null,
      expectedOrigin: options.decision?.expectedOrigin ?? details?.expectedOrigin ?? null,
      actualOrigin: options.decision?.actualOrigin ?? details?.actualOrigin ?? null,
      enforced: options.decision?.enforced ?? false,
      wouldRejectInStrict: options.decision?.wouldRejectInStrict ?? Boolean(options.error),
      strictFailureCode: options.decision?.strictFailureCode ?? options.error?.code ?? null,
      tier: options.context.tier,
      authProvider: options.context.authProvider ?? 'managed-token',
    },
  });
}

async function appendLicenseValidationAudit(options: {
  auditLog?: AuditLog;
  license: LicenseValidationResponse;
  context?: AuthContext;
  requestId?: string;
  headers: Headers;
  incoming: IncomingMessage;
}): Promise<void> {
  const standaloneId = `license:${options.license.licenseHash}`;
  const requestId = normalizeRequestId(options.context?.requestId ?? options.requestId);
  await options.auditLog?.append({
    id: auditId('audit'),
    tenantId: options.context?.tenantId ?? standaloneId,
    actorId: options.context?.userId ?? standaloneId,
    actorType: 'user',
    action: 'license.validated',
    targetType: 'license',
    targetId: options.license.licenseHash,
    createdAt: new Date().toISOString(),
    ip: requestIp(options.incoming, options.headers),
    userAgent: options.headers.get('user-agent') ?? undefined,
    metadata: {
      ...(requestId ? { requestId } : {}),
      route: '/v1/licenses/validate',
      tier: options.license.tier,
      plan: options.license.plan,
      import: options.license.features.import,
      roundTripSync: options.license.features.roundTripSync,
      mcpBridge: options.license.features.mcpBridge,
      watermark: options.license.features.watermark,
      maxProjects: options.license.features.maxProjects,
      priorityQueue: options.license.features.priorityQueue,
      sso: options.license.features.sso,
      customSkillPacks: options.license.features.customSkillPacks,
      seatLimit: options.license.features.seatLimit,
      siteLicense: options.license.features.siteLicense,
      authProvider: options.context?.authProvider ?? 'license-token',
      dataResidencyRegion: options.context?.dataResidencyRegion ?? null,
    },
  });
}

function proModuleEntitlementPath(
  request: ProModuleSecretRequest,
  license: LicenseValidationResponse,
  entitlementLookupKeys: ProModuleEntitlementLookupKeys,
  bundleRecord?: Pick<ProModuleBundleRecord, 'entitlement'>,
): 'license-tier' | 'explicit-license-entitlement' | 'entitlement-lookup' {
  if (bundleRecord?.entitlement && unityLicenseTierRank(license.tier) >= unityLicenseTierRank(bundleRecord.entitlement.licenseTier)) {
    return 'license-tier';
  }
  if (license.tier === 'pro' || license.tier === 'studio') return 'license-tier';
  if (request.entitlementLookupKey && entitlementLookupKeys[request.entitlementLookupKey]) return 'entitlement-lookup';
  return 'explicit-license-entitlement';
}

function unityLicenseTierRank(tier: LicenseValidationResponse['tier']): number {
  switch (tier) {
    case 'free-personal':
      return 0;
    case 'indie':
      return 1;
    case 'pro':
      return 2;
    case 'studio':
      return 3;
  }
}

function proModuleBundleRequestFromUrl(url: URL): ProModuleSecretRequest | undefined {
  const match = url.pathname.match(/^\/v1\/pro-modules\/([a-z0-9][a-z0-9-]{0,79})\.gbpro$/u);
  if (!match?.[1]) return undefined;
  return normalizeProModuleSecretRequest({
    moduleId: match[1],
    payloadSha256: url.searchParams.get('payloadSha256') ?? undefined,
    entitlementLookupKey: url.searchParams.get('entitlementLookupKey') ?? undefined,
  });
}

async function appendProModuleBundleDownloadAudit(options: {
  auditLog?: AuditLog;
  request: ProModuleSecretRequest;
  response: ProModuleBundleDownloadResponse;
  license: LicenseValidationResponse;
  context?: AuthContext;
  requestId?: string;
  entitlementLookupKeys: ProModuleEntitlementLookupKeys;
  bundleRecord?: Pick<ProModuleBundleRecord, 'entitlement'>;
  headers: Headers;
  incoming: IncomingMessage;
}): Promise<void> {
  const standaloneId = `license:${options.license.licenseHash}`;
  const requestId = normalizeRequestId(options.context?.requestId ?? options.requestId);
  await options.auditLog?.append({
    id: auditId('audit'),
    tenantId: options.context?.tenantId ?? standaloneId,
    actorId: options.context?.userId ?? standaloneId,
    actorType: 'user',
    action: 'pro_module.bundle_download_issued',
    targetType: 'pro-module',
    targetId: options.request.moduleId,
    createdAt: new Date().toISOString(),
    ip: requestIp(options.incoming, options.headers),
    userAgent: options.headers.get('user-agent') ?? undefined,
    metadata: {
      ...(requestId ? { requestId } : {}),
      route: '/v1/pro-modules/:moduleId.gbpro',
      moduleId: options.request.moduleId,
      version: options.response.version,
      licenseHash: options.license.licenseHash,
      tier: options.license.tier,
      plan: options.license.plan,
      payloadSha256: options.response.payloadSha256,
      envelopeSha256: options.response.envelopeSha256 ?? null,
      contentType: options.response.contentType,
      sizeBytes: options.response.sizeBytes ?? null,
      expiresAt: options.response.expiresAt,
      entitlementPath: proModuleEntitlementPath(options.request, options.license, options.entitlementLookupKeys, options.bundleRecord),
      usedEntitlementLookup: options.request.entitlementLookupKey !== undefined,
      authProvider: options.context?.authProvider ?? 'license-token',
      dataResidencyRegion: options.context?.dataResidencyRegion ?? null,
    },
  });
}

async function appendProModuleSecretAudit(options: {
  auditLog?: AuditLog;
  request: ProModuleSecretRequest;
  response: ProModuleSecretResponse;
  license: LicenseValidationResponse;
  context?: AuthContext;
  requestId?: string;
  entitlementLookupKeys: ProModuleEntitlementLookupKeys;
  bundleRecord?: Pick<ProModuleBundleRecord, 'entitlement'>;
  headers: Headers;
  incoming: IncomingMessage;
}): Promise<void> {
  const standaloneId = `license:${options.license.licenseHash}`;
  const requestId = normalizeRequestId(options.context?.requestId ?? options.requestId);
  await options.auditLog?.append({
    id: auditId('audit'),
    tenantId: options.context?.tenantId ?? standaloneId,
    actorId: options.context?.userId ?? standaloneId,
    actorType: 'user',
    action: 'pro_module.secret_issued',
    targetType: 'pro-module',
    targetId: options.request.moduleId,
    createdAt: new Date().toISOString(),
    ip: requestIp(options.incoming, options.headers),
    userAgent: options.headers.get('user-agent') ?? undefined,
    metadata: {
      ...(requestId ? { requestId } : {}),
      route: '/v1/pro-modules/license-secret',
      moduleId: options.request.moduleId,
      licenseHash: options.license.licenseHash,
      tier: options.license.tier,
      plan: options.license.plan,
      algorithm: options.response.algorithm,
      expiresAt: options.response.expiresAt,
      payloadSha256: options.request.payloadSha256 ?? null,
      entitlementPath: proModuleEntitlementPath(options.request, options.license, options.entitlementLookupKeys, options.bundleRecord),
      usedEntitlementLookup: options.request.entitlementLookupKey !== undefined,
      authProvider: options.context?.authProvider ?? 'license-token',
      dataResidencyRegion: options.context?.dataResidencyRegion ?? null,
    },
  });
}

async function appendSecurityIncidentAudit(options: {
  auditLog?: AuditLog;
  incident: SecurityIncidentRecord;
  action: 'security.incident_opened' | 'security.incident_updated';
  authorization: ScopedAdminAuthorization;
  headers: Headers;
  incoming: IncomingMessage;
}): Promise<void> {
  await options.auditLog?.append({
    id: auditId('audit'),
    tenantId: options.incident.tenantId,
    actorId: options.authorization.actorId,
    actorType: options.authorization.actorType,
    action: options.action,
    targetType: 'security-incident',
    targetId: options.incident.id,
    createdAt: new Date().toISOString(),
    ip: requestIp(options.incoming, options.headers),
    userAgent: options.headers.get('user-agent') ?? undefined,
    metadata: {
      severity: options.incident.severity,
      status: options.incident.status,
      category: options.incident.category,
      personalDataBreach: options.incident.personalDataBreach,
      gdprRiskAssessment: options.incident.gdprRiskAssessment,
      dataSubjectNoticeRequired: options.incident.dataSubjectNoticeRequired,
      affectedTenantCount: options.incident.affectedTenantIds.length,
      dataCategoryCount: options.incident.dataCategories.length,
      regulatoryClockCount: options.incident.regulatoryClocks.length,
    },
  });
}

async function appendModelTrainingConsentAudit(options: {
  auditLog?: AuditLog;
  consent: ModelTrainingConsentRecord;
  context: AuthContext;
  headers: Headers;
  incoming: IncomingMessage;
}): Promise<void> {
  await options.auditLog?.append({
    id: auditId('audit'),
    tenantId: options.context.tenantId,
    actorId: options.context.userId,
    actorType: 'user',
    action: 'model_training.consent_recorded',
    targetType: 'project',
    targetId: options.consent.projectId,
    projectId: options.consent.projectId,
    createdAt: new Date().toISOString(),
    ip: requestIp(options.incoming, options.headers),
    userAgent: options.headers.get('user-agent') ?? undefined,
    metadata: {
      status: options.consent.status,
      source: options.consent.source,
      artifactId: options.consent.artifactId ?? null,
      separateCheckboxAccepted: options.consent.separateCheckboxAccepted,
      allowedUses: options.consent.allowedUses,
      dataCategoryCount: options.consent.dataCategories.length,
      consentTextHash: options.consent.consentTextHash ?? null,
      authProvider: options.context.authProvider ?? 'managed-token',
      dataResidencyRegion: options.context.dataResidencyRegion ?? null,
    },
  });
}

async function appendLegalHoldAudit(options: {
  auditLog?: AuditLog;
  hold: LegalHoldRecord;
  action: 'retention.legal_hold_created' | 'retention.legal_hold_updated';
  authorization: ScopedAdminAuthorization;
  headers: Headers;
  incoming: IncomingMessage;
}): Promise<void> {
  await options.auditLog?.append({
    id: auditId('audit'),
    tenantId: options.hold.tenantId,
    actorId: options.authorization.actorId,
    actorType: options.authorization.actorType,
    action: options.action,
    targetType: 'legal-hold',
    targetId: options.hold.id,
    createdAt: new Date().toISOString(),
    ip: requestIp(options.incoming, options.headers),
    userAgent: options.headers.get('user-agent') ?? undefined,
    metadata: {
      status: options.hold.status,
      datasetCount: options.hold.datasets.length,
      projectCount: options.hold.projectIds.length,
      userCount: options.hold.userIds.length,
      expiresAt: options.hold.expiresAt ?? null,
    },
  });
}

function offlineLicenseStatusCode(status: Awaited<ReturnType<typeof loadOfflineLicenseStatus>>): number {
  if (status.valid) return 200;
  return status.configured ? 403 : 503;
}

function bearerToken(headers: Headers): string {
  return headers.get('authorization')?.match(/^Bearer\s+(.+)$/iu)?.[1]?.trim() ?? '';
}

function isJwt(token: string): boolean {
  return token.split('.').length === 3;
}

interface ScopedAdminRequirements {
  token?: string;
  roles: string[];
  scopes: string[];
  workosVerifier?: Pick<WorkOsJwtVerifier, 'verify'>;
  tenantStore: TenantStore;
  workosGroupRoleMap?: WorkOsGroupRoleMap;
  authEnv?: Record<string, string | undefined>;
}

interface ScopedAdminAuthorization {
  actorId: string;
  actorType: 'admin' | 'user';
  context?: AuthContext;
}

async function authorizeScopedAdmin(
  headers: Headers,
  requirements: ScopedAdminRequirements,
): Promise<ScopedAdminAuthorization | undefined> {
  if (isBillingAdmin(headers, requirements.token, requirements.authEnv)) {
    return { actorId: 'token-admin', actorType: 'admin' };
  }
  const token = bearerToken(headers);
  if (!token || !isJwt(token) || !requirements.workosVerifier) return undefined;
  const context = await authenticateRequest(headers, {
    workosVerifier: requirements.workosVerifier,
    tenantStore: requirements.tenantStore,
    workosGroupRoleMap: requirements.workosGroupRoleMap,
  });
  const roles = new Set(context.roles);
  const scopes = new Set(context.scopes ?? []);
  const hasRole = roles.has('admin') || requirements.roles.some((role) => roles.has(role));
  const hasScope = requirements.scopes.some((scope) => scopes.has(scope));
  return hasRole || hasScope ? { actorId: context.userId, actorType: 'user', context } : undefined;
}

export function createGreyboxCloudServer(options: GreyboxCloudServerOptions = {}) {
  const memoryUsage = new MemoryUsageSink();
  const metrics = options.metrics ?? new MetricsRegistry();
  const dataResidencyRuntimeEnv = { ...process.env, ...(options.dataResidencyEnv ?? {}) };
  const encryptionRuntimeEnv = { ...process.env, ...(options.encryptionEnv ?? {}) };
  const providerPolicyRuntimeEnv = { ...process.env, ...(options.providerPolicyEnv ?? {}) };
  const authRuntimeEnv = { ...process.env, ...(options.authEnv ?? {}) };
  const corsRuntimeEnv = { ...process.env, ...(options.corsEnv ?? {}) };
  const rateLimitRuntimeEnv = { ...process.env, ...(options.rateLimitEnv ?? {}) };
  const billingCheckoutRuntimeEnv = { ...process.env, ...(options.billingCheckoutEnv ?? {}) };
  const billingMeteringRuntimeEnv = { ...process.env, ...(options.billingMeteringEnv ?? {}) };
  const publicBaseUrlRuntimeEnv = { ...process.env, ...(options.publicBaseUrlEnv ?? {}) };
  const publicBaseUrl = options.publicBaseUrl ?? publicBaseUrlRuntimeEnv.GREYBOX_PUBLIC_BASE_URL;
  const tenantStorePersistence = options.tenantStorePersistence
    ?? (options.tenantStore
      ? 'injected'
      : process.env.GREYBOX_TENANT_STORE_DIR
        ? 'file'
        : 'memory');
  const tenantStore = options.tenantStore ?? new TenantStore({
    ...(process.env.GREYBOX_TENANT_STORE_DIR ? { rootDir: process.env.GREYBOX_TENANT_STORE_DIR } : {}),
  });
  const workosVerifier = options.workosVerifier ?? makeWorkOsVerifierFromEnv(authRuntimeEnv);
  const workosGroupRoleMap = options.workosGroupRoleMap ?? workOsGroupRoleMapFromEnv();
  assertHostedProductionAuth({
    env: authRuntimeEnv,
    workosVerifierConfigured: hasHostedProductionWorkOsValidation(authRuntimeEnv, workosVerifier, options.workosVerifier),
    workosVerifierSource: options.workosVerifier ? 'injected' : 'env',
  });
  const requestAuthOptions: AuthenticateOptions = {
    workosVerifier,
    tenantStore,
    workosGroupRoleMap,
    requireVerifiedWorkOs: isHostedProductionEnv(authRuntimeEnv) && !authBreakGlassAllowed(authRuntimeEnv),
  };
  const authorizeAdmin = (
    adminHeaders: Headers,
    requirements: Omit<ScopedAdminRequirements, 'authEnv'>,
  ) => authorizeScopedAdmin(adminHeaders, { ...requirements, authEnv: authRuntimeEnv });
  const auditLog = options.auditLog ?? (
    process.env.GREYBOX_AUDIT_LOG_DIR
      ? new FileAuditLog(process.env.GREYBOX_AUDIT_LOG_DIR, 'audit-log.jsonl', {
        seal: auditSealOptionsFromEnv(process.env),
      })
      : undefined
  );
  const auditLogPersistence = options.auditLogPersistence
    ?? (options.auditLog
      ? 'injected'
      : process.env.GREYBOX_AUDIT_LOG_DIR
        ? 'file'
        : 'memory');
  const scimStore = options.scimStore ?? new ScimUserStore(process.env.GREYBOX_SCIM_STORE_DIR);
  const scimStorePersistence = options.scimStorePersistence
    ?? (options.scimStore
      ? 'injected'
      : process.env.GREYBOX_SCIM_STORE_DIR
        ? 'file'
        : 'memory');
  const scimToken = options.scimToken ?? authRuntimeEnv.GREYBOX_SCIM_TOKEN ?? process.env.GREYBOX_SCIM_TOKEN;
  assertHostedProductionScimToken({
    env: authRuntimeEnv,
    token: scimToken,
  });
  const scimTenantId = options.scimTenantId ?? process.env.GREYBOX_SCIM_TENANT_ID ?? 'enterprise-scim';
  const licenseRecords = options.licenseRecords ?? licenseRecordsFromEnv(process.env);
  const licenseRecordStore = options.licenseRecordStore;
  const licenseRecordPersistence = options.licenseRecordPersistence
    ?? (licenseRecordStore
      ? 'injected'
      : licenseRecords.length > 0
        ? 'env'
        : 'memory');
  const licenseSigningKeys = options.licenseSigningKeys ?? signedLicenseKeysFromEnv(process.env);
  const licenseRecordsForRequest = async (): Promise<readonly LicenseRecord[]> => (
    licenseRecordStore ? await licenseRecordStore.list() : licenseRecords
  );
  const proModuleEntitlementGrantStore = options.proModuleEntitlementGrantStore;
  const staticProModuleEntitlements = (): ProModuleEntitlements => (
    options.proModuleEntitlements ?? proModuleEntitlementsFromEnv(process.env)
  );
  const staticProModuleEntitlementLookupKeys = (): ProModuleEntitlementLookupKeys => (
    options.proModuleEntitlementLookupKeys ?? proModuleEntitlementLookupKeysFromEnv(process.env)
  );
  const proModuleEntitlementPersistence = options.proModuleEntitlementPersistence
    ?? (proModuleEntitlementGrantStore
      ? 'injected'
      : Object.keys(staticProModuleEntitlements()).length > 0
        || Object.keys(staticProModuleEntitlementLookupKeys()).length > 0
        ? 'env'
        : 'memory');
  const proModuleEntitlementSourcesForRequest = async (): Promise<{
    entitlements: ProModuleEntitlements;
    entitlementLookupKeys: ProModuleEntitlementLookupKeys;
  }> => {
    const records = proModuleEntitlementGrantStore
      ? await proModuleEntitlementGrantStore.list()
      : [];
    return {
      entitlements: mergeProModuleEntitlements(
        staticProModuleEntitlements(),
        proModuleEntitlementsFromGrantRecords(records),
      ),
      entitlementLookupKeys: mergeProModuleEntitlementLookupKeys(
        staticProModuleEntitlementLookupKeys(),
        proModuleEntitlementLookupKeysFromGrantRecords(records),
      ),
    };
  };
  const marketplaceEntitlementLookupKeysAndPersist = async (
    body: ProModuleSecretRequest,
    license: Pick<LicenseValidationResponse, 'licenseHash'>,
    bundleRecord?: Pick<ProModuleBundleRecord, 'entitlement'>,
  ): Promise<ProModuleEntitlementLookupKeys> => {
    const claim = await marketplaceEntitlementGrantForRequest(body, license, {
      marketplaceUrl: options.marketplaceUrl ?? process.env.GREYBOX_MARKETPLACE_URL,
      marketplaceAdminToken: options.marketplaceAdminToken ?? process.env.GREYBOX_MARKETPLACE_ADMIN_TOKEN,
      fetchFn: options.marketplaceFetch,
      bundleRecord,
    });
    if (claim && proModuleEntitlementGrantStore) {
      await proModuleEntitlementGrantStore.upsert({
        licenseHash: claim.licenseHash,
        modules: claim.modules,
        status: claim.status ?? 'active',
        ...(claim.lookupKey ? { lookupKey: claim.lookupKey } : {}),
      });
    }
    if (!claim || claim.status === 'revoked' || !claim.lookupKey) return {};
    return {
      [claim.lookupKey]: {
        licenseHash: claim.licenseHash,
        modules: claim.modules,
        status: 'active',
      },
    };
  };
  const privacyRequestStore = options.privacyRequestStore ?? (
    process.env.GREYBOX_PRIVACY_REQUEST_DIR ? new FilePrivacyRequestStore(process.env.GREYBOX_PRIVACY_REQUEST_DIR) : undefined
  );
  const privacyRequestStorePersistence = options.privacyRequestStorePersistence
    ?? (options.privacyRequestStore
      ? 'injected'
      : process.env.GREYBOX_PRIVACY_REQUEST_DIR
        ? 'file'
        : 'memory');
  const incidentStore = options.incidentStore ?? (
    process.env.GREYBOX_SECURITY_INCIDENT_DIR
      ? new FileSecurityIncidentStore(process.env.GREYBOX_SECURITY_INCIDENT_DIR)
      : undefined
  );
  const incidentStorePersistence = options.incidentStorePersistence
    ?? (options.incidentStore
      ? 'injected'
      : process.env.GREYBOX_SECURITY_INCIDENT_DIR
        ? 'file'
        : 'memory');
  const modelTrainingConsentStore = options.modelTrainingConsentStore ?? (
    process.env.GREYBOX_MODEL_TRAINING_CONSENT_DIR
      ? new FileModelTrainingConsentStore(process.env.GREYBOX_MODEL_TRAINING_CONSENT_DIR)
      : undefined
  );
  const modelTrainingConsentStorePersistence = options.modelTrainingConsentStorePersistence
    ?? (options.modelTrainingConsentStore
      ? 'injected'
      : process.env.GREYBOX_MODEL_TRAINING_CONSENT_DIR
        ? 'file'
        : 'memory');
  const legalHoldStore = options.legalHoldStore ?? (
    process.env.GREYBOX_LEGAL_HOLD_DIR
      ? new FileLegalHoldStore(process.env.GREYBOX_LEGAL_HOLD_DIR)
      : undefined
  );
  const legalHoldStorePersistence = options.legalHoldStorePersistence
    ?? (options.legalHoldStore
      ? 'injected'
      : process.env.GREYBOX_LEGAL_HOLD_DIR
        ? 'file'
        : 'memory');
  const billingLedger = options.billingLedger ?? (
    process.env.GREYBOX_BILLING_LEDGER_DIR
      ? new FileBillingLedger(process.env.GREYBOX_BILLING_LEDGER_DIR)
      : undefined
  );
  const billingLedgerPersistence = options.billingLedgerPersistence
    ?? (options.billingLedger
      ? 'injected'
      : process.env.GREYBOX_BILLING_LEDGER_DIR
        ? 'file'
        : 'memory');
  const usageSinks: UsageSink[] = [memoryUsage];
  if (billingLedger) {
    usageSinks.push(new FileUsageSink(billingLedger));
  }
  assertHostedProductionPersistence([
    { id: 'tenant-store', label: 'Tenant store', persistence: tenantStorePersistence },
    { id: 'audit-log', label: 'Audit log', persistence: auditLogPersistence },
    { id: 'scim-store', label: 'SCIM user store', persistence: scimStorePersistence },
    { id: 'license-records', label: 'License record store', persistence: licenseRecordPersistence },
    {
      id: 'pro-module-entitlements',
      label: 'Pro module entitlement store',
      persistence: proModuleEntitlementPersistence,
    },
    { id: 'privacy-requests', label: 'Privacy request store', persistence: privacyRequestStorePersistence },
    { id: 'security-incidents', label: 'Security incident store', persistence: incidentStorePersistence },
    {
      id: 'model-training-consent',
      label: 'Model training consent store',
      persistence: modelTrainingConsentStorePersistence,
    },
    { id: 'legal-holds', label: 'Legal hold store', persistence: legalHoldStorePersistence },
    { id: 'billing-ledger', label: 'Billing ledger', persistence: billingLedgerPersistence },
  ]);
  assertHostedProductionDataResidency({
    env: dataResidencyRuntimeEnv,
  });
  assertHostedProductionProviderPolicy({
    env: providerPolicyRuntimeEnv,
  });
  assertHostedProductionCheckoutReady({
    env: billingCheckoutRuntimeEnv,
    stripeWebhookSecret: options.stripeWebhookSecret ?? process.env.STRIPE_WEBHOOK_SECRET,
    stripeWebhookEvents: options.stripeWebhookEvents ?? stripeWebhookEventsFromEnv(billingCheckoutRuntimeEnv),
    requireStripeWebhookEvents: true,
    marketplaceUrl: options.marketplaceUrl ?? process.env.GREYBOX_MARKETPLACE_URL,
    marketplaceAdminToken: options.marketplaceAdminToken ?? process.env.GREYBOX_MARKETPLACE_ADMIN_TOKEN,
    auditLogConfigured: Boolean(auditLog),
  });
  assertHostedProductionEncryption({
    env: encryptionRuntimeEnv,
  });
  assertHostedProductionPublicBaseUrl({
    env: publicBaseUrlRuntimeEnv,
    publicBaseUrl,
  });
  const service = options.service ?? new InferenceService({
    providers: [new AnthropicProvider(), new OpenAiProvider(), new BedrockProvider(), new GreyboxNativeProvider()],
    providerPolicy: providerPolicyFromEnv(providerPolicyRuntimeEnv),
    tenants: tenantStore,
    usageEmitter: new UsageEmitter(usageSinks),
    langfuse: new LangfuseBridge(),
    metrics,
  });

  const corsPolicy: CorsPolicy | undefined = options.corsPolicy ?? corsPolicyFromEnv(corsRuntimeEnv);
  assertHostedProductionCors({
    env: corsRuntimeEnv,
    policy: corsPolicy,
  });
  const rateLimiter: HttpRateLimiter | undefined = options.rateLimiter ?? httpRateLimiterFromEnv(rateLimitRuntimeEnv);
  assertHostedProductionRateLimit({
    env: rateLimitRuntimeEnv,
    rateLimiter,
  });
  // Per-tenant limiter for the billing checkout/portal endpoints. Stricter than
  // the global IP limiter because every successful call costs a real Stripe API
  // request and can mutate billing state. Defaults to 10 requests in 60s per
  // tenant (token bucket, 1 token / 6s); overridable via env.
  const billingRateLimiterBurst = Number.parseInt(process.env.GREYBOX_BILLING_RATE_LIMIT_BURST ?? '10', 10);
  const billingRateLimiterPerSecond = Number.parseFloat(process.env.GREYBOX_BILLING_RATE_LIMIT_PER_SECOND ?? '0.1667');
  const billingRateLimiter = new HttpRateLimiter({
    capacity: Number.isFinite(billingRateLimiterBurst) && billingRateLimiterBurst > 0 ? billingRateLimiterBurst : 10,
    refillPerSecond: Number.isFinite(billingRateLimiterPerSecond) && billingRateLimiterPerSecond > 0 ? billingRateLimiterPerSecond : 0.1667,
  });
  const sentry: SentryAdapter | undefined = options.sentry;
  const trustControlReportForRequest = async (): Promise<TrustControlReport> => (
    options.trustControlReport ?? await buildTrustControlReport({
      tenantStorePersistence,
      auditLog,
      auditLogPersistence,
      billingLedger,
      billingLedgerPersistence,
      scimStore,
      scimStorePersistence,
      privacyRequestStore,
      privacyRequestStorePersistence,
      incidentStore,
      incidentStorePersistence,
      modelTrainingConsentStore,
      modelTrainingConsentStorePersistence,
      legalHoldStore,
      legalHoldStorePersistence,
      workosVerifier,
      privacyGovernanceEnv: options.privacyGovernanceEnv ?? process.env,
      privacyDisclosureEnv: options.privacyDisclosureEnv ?? process.env,
      dataResidencyEnv: options.dataResidencyEnv ?? process.env,
      encryptionEnv: options.encryptionEnv ?? process.env,
      privateNetworkEnv: options.privateNetworkEnv ?? process.env,
      offlineLicenseConfigured: Boolean(
        options.offlineLicensePath
          ?? process.env.GREYBOX_OFFLINE_LICENSE_FILE,
      ),
      onPremReadinessConfigured: Boolean(
        options.onPremReadiness
          ?? process.env.GREYBOX_DEPLOYMENT_MODE
          ?? process.env.GREYBOX_OFFLINE_LICENSE_FILE,
      ),
    })
  );
  const enterpriseContractPacketForRequest = (): EnterpriseContractPacket => (
    options.enterpriseContractPacket ?? buildEnterpriseContractPacket({
      root: options.contractRoot ?? process.cwd(),
    })
  );
  const enterpriseTrustPacketForRequest = async (): Promise<EnterpriseTrustPacket> => buildEnterpriseTrustPacket({
    auditLog,
    billingLedger,
    scimStore,
    privacyRequestStore,
    incidentStore,
    modelTrainingConsentStore,
    legalHoldStore,
    privacyGovernanceEnv: options.privacyGovernanceEnv ?? process.env,
    privacyDisclosureEnv: options.privacyDisclosureEnv ?? process.env,
    dataResidencyEnv: options.dataResidencyEnv ?? process.env,
    encryptionEnv: options.encryptionEnv ?? process.env,
    privateNetworkEnv: options.privateNetworkEnv ?? process.env,
    workosVerifier,
    offlineLicenseConfigured: Boolean(
      options.offlineLicensePath
        ?? process.env.GREYBOX_OFFLINE_LICENSE_FILE,
    ),
    onPremReadinessConfigured: Boolean(
      options.onPremReadiness
        ?? process.env.GREYBOX_DEPLOYMENT_MODE
        ?? process.env.GREYBOX_OFFLINE_LICENSE_FILE,
    ),
    trustControlReport: await trustControlReportForRequest(),
  });

  // Character generation service: provider registry (Meshy/Tripo3D/mock),
  // job + library store (in-memory by default; postgres-backed store can be
  // injected via options.characterJobStore from index.ts), and asset
  // registrar wired to either local disk (default) or S3 (when
  // GREYBOX_S3_BUCKET is set). We do not await any async setup here so the
  // factory stays synchronous.
  const characterAssetStorage = assetStorageFromEnv();
  const characterJobStore = options.characterJobStore;
  const characterJobStorePersistence: 'memory' | 'postgres' | 'injected' = options.characterJobStorePersistence
    ?? (options.characterJobStore ? 'injected' : 'memory');
  const characterMetering = new CharacterMeteringEmitter();
  const spriteMeteringEmitter = new SpriteMeteringEmitter();
  const characterService = options.characterService ?? new CharacterService({
    registry: characterGenRegistryFromEnv(),
    ...(characterJobStore ? { store: characterJobStore } : {}),
    registrar: new AssetRegistrar({
      storage: characterAssetStorage.storage,
      // file:// reads are allowed only in non-production so tests and
      // local dev can ship a fixture-on-disk; production hosts must use
      // S3 or a public HTTP endpoint.
      allowFileUrls: !isHostedProductionEnv(process.env),
    }),
    metering: characterMetering,
  });
  // Silence "unused" warning when the persistence value isn't surfaced
  // anywhere yet — this keeps the discriminator available for a future
  // /readyz check without forcing it into the API surface today.
  void characterJobStorePersistence;

  return createServer(async (request, response) => {
    // Request ID propagation: accept the caller's X-Request-ID when present
    // (allowed shape: 1-128 chars of [A-Za-z0-9_.:-]) otherwise mint a fresh
    // crypto-random one. Echo it back on every response so logs across the
    // greybox-cloud -> marketplace -> daemon path can be stitched together.
    const incomingRequestId = request.headers['x-request-id'];
    const requestId = normalizeRequestId(incomingRequestId) ?? randomRequestId();
    response.setHeader('X-Request-ID', requestId);

    // Global request timeout — prevents hung requests from holding connections
    // indefinitely. Health probes (/healthz, /readyz) are exempt.
    const url0 = new URL(request.url ?? '/', 'http://localhost');
    let requestTimeoutHandle: ReturnType<typeof setTimeout> | undefined;
    if (url0.pathname !== '/healthz' && url0.pathname !== '/readyz') {
      const timeoutMs = parsePositiveIntEnv(process.env.REQUEST_TIMEOUT_MS, 30_000);
      requestTimeoutHandle = setTimeout(() => {
        if (!response.writableEnded) {
          response.writeHead(504, { 'content-type': 'application/json; charset=utf-8' });
          response.end(JSON.stringify({ error: 'request_timeout' }));
        }
      }, timeoutMs);
      const clearRequestTimeout = () => clearTimeout(requestTimeoutHandle);
      request.on('close', clearRequestTimeout);
      response.on('finish', clearRequestTimeout);
    }

    try {
      const url = new URL(request.url ?? '/', 'http://localhost');
      const headers = headersFromIncoming(request);
      const origin = request.headers.origin?.toString();
      if (corsPolicy) {
        if (handleCorsPreflight(request, response, corsPolicy)) return;
        applyCorsHeaders(response, corsPolicy, origin);
      }
      if (rateLimiter
        && url.pathname !== '/healthz'
        && url.pathname !== '/readyz'
        && url.pathname !== '/metrics'
        && url.pathname !== '/v1/version'
      ) {
        const decision = rateLimiter.reserve(clientKey(request));
        if (!decision.allowed) {
          sendRateLimited(response, decision);
          return;
        }
      }
      if (request.method === 'GET' && url.pathname === '/healthz') {
        // Lightweight liveness probe; must stay cheap so K8s/Render probes
        // don't introduce timeouts under load. Deeper Postgres checks live at /readyz.
        const pgConfigured = Boolean(
          process.env.GREYBOX_TENANT_STORE_PG_URL
          || process.env.GREYBOX_AUDIT_LOG_PG_URL
          || process.env.GREYBOX_BILLING_LEDGER_PG_URL
          || process.env.GREYBOX_SCIM_PG_URL
          || process.env.GREYBOX_CHARACTER_JOBS_PG_URL,
        );
        sendJson(response, 200, {
          ok: true,
          service: 'greybox-cloud',
          postgres: pgConfigured ? 'configured' : 'not-configured',
          uptime: process.uptime(),
          version: process.env.GREYBOX_CLOUD_VERSION ?? 'unknown',
        });
        return;
      }
      if (request.method === 'GET' && url.pathname === '/readyz') {
        // Deep readiness probe; exposes whether each optional subsystem is
        // wired. Reports `degraded:true` (but still 200) when something is
        // unconfigured so load balancers don't pull a working replica out of
        // rotation just because Sentry isn't set. Returns 503 only when a
        // structural invariant fails (e.g. metrics registry not initialised).
        const dataResidencyEnv = options.dataResidencyEnv ?? process.env;
        const dataResidencyMode = dataResidencyRuntimeModeFromEnv(dataResidencyEnv);
        const dataResidencyReadiness = buildDataResidencyReadinessReport({ env: dataResidencyEnv });
        const dataResidencyReady = dataResidencyMode === 'strict'
          && dataResidencyReadiness.summary.readyRegions === dataResidencyReadiness.supportedRegions.length
          && dataResidencyReadiness.summary.blockedRegions === 0;
        const checks: Record<string, ReadinessCheck> = {
          metrics: { ok: Boolean(metrics) },
          tenantStore: {
            ok: true,
            configured: tenantStorePersistence !== 'memory',
            detail: tenantStorePersistence,
          },
          auditLog: {
            ok: true,
            configured: Boolean(auditLog),
            detail: auditLogPersistence,
          },
          scimStore: {
            ok: true,
            configured: scimStorePersistence !== 'memory',
            detail: scimStorePersistence,
          },
          scimToken: { ok: true, configured: Boolean(scimToken) },
          licenseRecordStore: {
            ok: true,
            configured: licenseRecordPersistence !== 'memory',
            detail: licenseRecordPersistence,
          },
          proModuleEntitlementStore: {
            ok: true,
            configured: proModuleEntitlementPersistence !== 'memory',
            detail: proModuleEntitlementPersistence,
          },
          proModuleBundleRegistry: proModuleBundleRegistryReadiness(options),
          privacyRequestStore: {
            ok: true,
            configured: Boolean(privacyRequestStore),
            detail: privacyRequestStorePersistence,
          },
          securityIncidentStore: {
            ok: true,
            configured: Boolean(incidentStore),
            detail: incidentStorePersistence,
          },
          legalHoldStore: {
            ok: true,
            configured: Boolean(legalHoldStore),
            detail: legalHoldStorePersistence,
          },
          modelTrainingConsentStore: {
            ok: true,
            configured: Boolean(modelTrainingConsentStore),
            detail: modelTrainingConsentStorePersistence,
          },
          billingLedger: {
            ok: true,
            configured: Boolean(billingLedger),
            detail: billingLedgerPersistence,
          },
          sentry: { ok: true, configured: Boolean(sentry?.enabled) },
          stripeApi: { ok: true, configured: Boolean(options.stripeApiKey ?? process.env.STRIPE_API_KEY) },
          billingPrices: {
            ok: true,
            configured: Boolean((options.billingPriceIds?.indie ?? process.env.STRIPE_PRICE_INDIE)
              && (options.billingPriceIds?.studio ?? process.env.STRIPE_PRICE_STUDIO)),
          },
          dataResidencyRuntime: {
            ok: true,
            configured: dataResidencyReady,
            detail: `${dataResidencyMode}; ${dataResidencyReadiness.summary.readyRegions}/${dataResidencyReadiness.supportedRegions.length} regions ready; ${dataResidencyReadiness.summary.blockedRegions} blocked`,
          },
          encryptionRuntime: encryptionRuntimeReadiness(options.encryptionEnv ?? process.env),
          workos: { ok: true, configured: Boolean(workosVerifier) },
          rateLimiter: { ok: true, configured: Boolean(rateLimiter) },
        };
        const structuralFail = Object.values(checks).some((check) => check.ok === false);
        const degraded = Object.values(checks).some((check) => check.configured === false);
        sendJson(response, structuralFail ? 503 : 200, {
          ok: !structuralFail,
          degraded,
          service: 'greybox-cloud',
          version: process.env.GREYBOX_CLOUD_VERSION ?? 'unknown',
          checks,
          generatedAt: new Date().toISOString(),
        });
        return;
      }
      if (request.method === 'GET' && url.pathname === '/v1/version') {
        // Standardised version surface for canary identification, incident
        // triage, and client-side compat checks. Static; safe to expose
        // unauthed since it does not leak operational state.
        sendJson(response, 200, {
          service: 'greybox-cloud',
          version: process.env.GREYBOX_CLOUD_VERSION ?? 'unknown',
          commit: process.env.GREYBOX_CLOUD_COMMIT_SHA ?? null,
          builtAt: process.env.GREYBOX_CLOUD_BUILT_AT ?? null,
          node: process.versions.node,
        });
        return;
      }
      if (request.method === 'GET' && url.pathname === '/metrics') {
        // Content negotiation: Prometheus / Grafana Agent scrapers send
        // `Accept: text/plain` (or no Accept at all but a `format=prometheus`
        // query parameter); legacy JSON dashboards still get JSON.
        const acceptHeader = headers.get('accept') ?? '';
        const formatQuery = url.searchParams.get('format')?.toLowerCase();
        const wantsPrometheus =
          formatQuery === 'prometheus'
          || acceptHeader.includes('text/plain')
          || acceptHeader.includes('application/openmetrics-text');
        if (wantsPrometheus) {
          sendText(
            response,
            200,
            metrics.prometheusText(),
            'text/plain; version=0.0.4; charset=utf-8',
          );
          return;
        }
        sendJson(response, 200, metrics.snapshot());
        return;
      }
      if (request.method === 'GET' && url.pathname === '/v1/models') {
        sendJson(response, 200, openAiCompatibleModelsResponse());
        return;
      }
      if (request.method === 'GET' && url.pathname === '/v1/auth/session') {
        const context = await authenticateRequest(headers, requestAuthOptions);
        sendJson(response, 200, {
          auth: publicAuthContext(context),
          tenant: tenantStore.get(context.tenantId) ?? null,
        });
        return;
      }
      if (request.method === 'POST' && url.pathname === '/v1/licenses/validate') {
        const token = licenseTokenFromHeaders(headers);
        if (!token) {
          sendJson(response, 401, { error: 'license_required' });
          return;
        }
        if (isJwt(token) && workosVerifier) {
          const context = {
            ...(await authenticateRequest(headers, requestAuthOptions)),
            requestId,
          };
          const license = licenseValidationResponse(
            unityTierFromAuthContext(context),
            context.tier,
            token,
          );
          await appendLicenseValidationAudit({
            auditLog,
            license,
            context,
            requestId,
            headers,
            incoming: request,
          });
          sendJson(response, 200, license);
          return;
        }
        const license = validateLicenseToken(token, hardenLicenseOptionsForProd({
          records: await licenseRecordsForRequest(),
          signingKeys: licenseSigningKeys,
          failClosed: Boolean(licenseRecordStore),
        }));
        await appendLicenseValidationAudit({
          auditLog,
          license,
          requestId,
          headers,
          incoming: request,
        });
        sendJson(response, 200, license);
        return;
      }
      if (request.method === 'POST' && url.pathname === '/v1/pro-modules/license-secret') {
        const token = licenseTokenFromHeaders(headers);
        if (!token) {
          sendJson(response, 401, { error: 'license_required' });
          return;
        }
        const body = normalizeProModuleSecretRequest(await readJson(request));
        let license: LicenseValidationResponse;
        let context: AuthContext | undefined;
        if (isJwt(token) && workosVerifier) {
          context = {
            ...(await authenticateRequest(headers, requestAuthOptions)),
            requestId,
          };
          license = licenseValidationResponse(
            unityTierFromAuthContext(context),
            context.tier,
            token,
          );
        } else {
          license = validateLicenseToken(token, hardenLicenseOptionsForProd({
            records: await licenseRecordsForRequest(),
            signingKeys: licenseSigningKeys,
            failClosed: Boolean(licenseRecordStore),
          }));
        }
        const proModuleRegistry = options.proModuleBundleRegistry ?? proModuleBundleRegistryFromEnv(process.env);
        const bundleRecord = proModuleRegistry[body.moduleId];
        const marketplaceLookupKeys = await marketplaceEntitlementLookupKeysAndPersist(body, license, bundleRecord);
        const entitlementSources = await proModuleEntitlementSourcesForRequest();
        const entitlementLookupKeys = mergeProModuleEntitlementLookupKeys(
          entitlementSources.entitlementLookupKeys,
          marketplaceLookupKeys,
        );
        const secret = proModuleSecretResponse(body, license, {
          masterKey: options.proModuleSecretMasterKey ?? process.env.GREYBOX_PRO_MODULE_SECRET_MASTER_KEY,
          entitlements: entitlementSources.entitlements,
          entitlementLookupKeys,
          bundleRecord,
        });
        await appendProModuleSecretAudit({
          auditLog,
          request: body,
          response: secret,
          license,
          ...(context ? { context } : {}),
          requestId,
          entitlementLookupKeys,
          bundleRecord,
          headers,
          incoming: request,
        });
        sendJson(response, 200, secret);
        return;
      }
      if (request.method === 'GET') {
        const body = proModuleBundleRequestFromUrl(url);
        if (body) {
          const token = licenseTokenFromHeaders(headers);
          if (!token) {
            sendJson(response, 401, { error: 'license_required' });
            return;
          }
          let license: LicenseValidationResponse;
          let context: AuthContext | undefined;
          if (isJwt(token) && workosVerifier) {
            context = {
              ...(await authenticateRequest(headers, requestAuthOptions)),
              requestId,
            };
            license = licenseValidationResponse(
              unityTierFromAuthContext(context),
              context.tier,
              token,
            );
          } else {
            license = validateLicenseToken(token, hardenLicenseOptionsForProd({
              records: await licenseRecordsForRequest(),
              signingKeys: licenseSigningKeys,
              failClosed: Boolean(licenseRecordStore),
            }));
          }
          const proModuleRegistry = options.proModuleBundleRegistry ?? proModuleBundleRegistryFromEnv(process.env);
          const bundleRecord = proModuleRegistry[body.moduleId];
          const marketplaceLookupKeys = await marketplaceEntitlementLookupKeysAndPersist(body, license, bundleRecord);
          const entitlementSources = await proModuleEntitlementSourcesForRequest();
          const entitlementLookupKeys = mergeProModuleEntitlementLookupKeys(
            entitlementSources.entitlementLookupKeys,
            marketplaceLookupKeys,
          );
          const download = proModuleBundleDownloadResponse(body, license, {
            registry: proModuleRegistry,
            cdnBaseUrl: options.proModuleCdnBaseUrl ?? process.env.GREYBOX_PRO_MODULE_CDN_BASE_URL,
            downloadSigningKey: options.proModuleDownloadSigningKey ?? process.env.GREYBOX_PRO_MODULE_DOWNLOAD_SIGNING_KEY,
            entitlements: entitlementSources.entitlements,
            entitlementLookupKeys,
          });
          await appendProModuleBundleDownloadAudit({
            auditLog,
            request: body,
            response: download,
            license,
            ...(context ? { context } : {}),
            requestId,
            entitlementLookupKeys,
            bundleRecord,
            headers,
            incoming: request,
          });
          sendJson(response, 200, download);
          return;
        }
      }
      if (request.method === 'GET' && url.pathname === '/v1/enterprise/data-residency') {
        const context = await authenticateRequest(headers, requestAuthOptions);
        const tenant = tenantStore.getOrCreate(
          context.tenantId,
          context.tier,
          context.dataResidencyRegion ? { region: context.dataResidencyRegion } : {},
        );
        sendJson(response, 200, {
          tenantId: tenant.id,
          organizationId: tenant.organizationId ?? null,
          dataResidencyRegion: tenant.region,
          requestedRegion: context.dataResidencyRegion ?? null,
          supportedRegions: DATA_RESIDENCY_REGIONS,
          authProvider: context.authProvider ?? null,
          enforcement: 'tenant-region',
        });
        return;
      }
      if (request.method === 'GET' && url.pathname === '/v1/enterprise/data-residency/readiness') {
        const authorization = await authorizeAdmin(headers, {
          token: options.auditAdminToken
            ?? process.env.GREYBOX_AUDIT_ADMIN_TOKEN
            ?? options.billingAdminToken
            ?? process.env.GREYBOX_BILLING_ADMIN_TOKEN,
          roles: ['admin', 'privacy-admin', 'security-admin'],
          scopes: ['audit:read', 'privacy:read', 'security:read'],
          workosVerifier,
          tenantStore,
          workosGroupRoleMap,
        });
        if (!authorization) {
          sendJson(response, 401, { error: 'audit_admin_required' });
          return;
        }
        sendJson(response, 200, buildDataResidencyReadinessReport({
          env: options.dataResidencyEnv ?? process.env,
        }));
        return;
      }
      if (request.method === 'GET' && url.pathname === '/v1/enterprise/provider-policy/readiness') {
        const authorization = await authorizeAdmin(headers, {
          token: options.auditAdminToken
            ?? process.env.GREYBOX_AUDIT_ADMIN_TOKEN
            ?? options.billingAdminToken
            ?? process.env.GREYBOX_BILLING_ADMIN_TOKEN,
          roles: ['admin', 'privacy-admin', 'security-admin'],
          scopes: ['audit:read', 'privacy:read', 'security:read'],
          workosVerifier,
          tenantStore,
          workosGroupRoleMap,
        });
        if (!authorization) {
          sendJson(response, 401, { error: 'audit_admin_required' });
          return;
        }
        sendJson(response, 200, buildProviderPolicyReadinessReport({
          env: options.providerPolicyEnv ?? process.env,
        }));
        return;
      }
      if (request.method === 'GET' && url.pathname === '/v1/enterprise/pii-redaction-evidence') {
        const authorization = await authorizeAdmin(headers, {
          token: options.auditAdminToken
            ?? process.env.GREYBOX_AUDIT_ADMIN_TOKEN
            ?? options.billingAdminToken
            ?? process.env.GREYBOX_BILLING_ADMIN_TOKEN,
          roles: ['admin', 'privacy-admin', 'security-admin'],
          scopes: ['audit:read', 'privacy:read', 'security:read'],
          workosVerifier,
          tenantStore,
          workosGroupRoleMap,
        });
        if (!authorization) {
          sendJson(response, 401, { error: 'audit_admin_required' });
          return;
        }
        const report = buildPiiRedactionEvidenceReport({
          env: options.piiRedactionEvidenceEnv ?? process.env,
        });
        if (url.searchParams.get('format') === 'markdown') {
          sendText(response, 200, formatPiiRedactionEvidenceMarkdown(report), 'text/markdown; charset=utf-8');
          return;
        }
        sendJson(response, 200, report);
        return;
      }
      if (request.method === 'GET' && url.pathname === '/v1/enterprise/encryption-readiness') {
        const authorization = await authorizeAdmin(headers, {
          token: options.auditAdminToken
            ?? process.env.GREYBOX_AUDIT_ADMIN_TOKEN
            ?? options.billingAdminToken
            ?? process.env.GREYBOX_BILLING_ADMIN_TOKEN,
          roles: ['admin', 'security-admin', 'privacy-admin'],
          scopes: ['audit:read', 'security:read', 'privacy:read'],
          workosVerifier,
          tenantStore,
          workosGroupRoleMap,
        });
        if (!authorization) {
          sendJson(response, 401, { error: 'audit_admin_required' });
          return;
        }
        sendJson(response, 200, buildEncryptionReadinessReport({
          env: options.encryptionEnv ?? process.env,
        }));
        return;
      }
      if (request.method === 'GET' && url.pathname === '/v1/enterprise/private-network/readiness') {
        const authorization = await authorizeAdmin(headers, {
          token: options.auditAdminToken
            ?? process.env.GREYBOX_AUDIT_ADMIN_TOKEN
            ?? options.billingAdminToken
            ?? process.env.GREYBOX_BILLING_ADMIN_TOKEN,
          roles: ['admin', 'security-admin'],
          scopes: ['audit:read', 'security:read'],
          workosVerifier,
          tenantStore,
          workosGroupRoleMap,
        });
        if (!authorization) {
          sendJson(response, 401, { error: 'audit_admin_required' });
          return;
        }
        sendJson(response, 200, buildPrivateNetworkReadinessReport({
          env: options.privateNetworkEnv ?? process.env,
          filter: {
            provider: (url.searchParams.get('provider') ?? undefined) as PrivateNetworkProvider | undefined,
            status: (url.searchParams.get('status') ?? undefined) as PrivateNetworkStatus | undefined,
          },
        }));
        return;
      }
      if (request.method === 'GET' && url.pathname === '/v1/enterprise/offline-license') {
        const status = await loadOfflineLicenseStatus({
          licensePath: options.offlineLicensePath ?? process.env.GREYBOX_OFFLINE_LICENSE_FILE,
          publicKeyPem: options.offlineLicensePublicKeyPem ?? process.env.GREYBOX_OFFLINE_LICENSE_PUBLIC_KEY,
          publicKeyPath: options.offlineLicensePublicKeyPath ?? process.env.GREYBOX_OFFLINE_LICENSE_PUBLIC_KEY_FILE,
        });
        sendJson(response, offlineLicenseStatusCode(status), status);
        return;
      }
      if (request.method === 'GET' && url.pathname === '/v1/enterprise/subprocessors') {
        sendJson(response, 200, buildSubprocessorRegistry({
          filter: {
            status: (url.searchParams.get('status') ?? undefined) as SubprocessorStatus | undefined,
            purpose: (url.searchParams.get('purpose') ?? undefined) as SubprocessorPurpose | undefined,
            region: url.searchParams.get('region') ?? undefined,
          },
        }));
        return;
      }
      if (request.method === 'GET' && url.pathname === '/v1/privacy/disclosures') {
        sendJson(response, 200, buildPrivacyDisclosureReport({
          env: options.privacyDisclosureEnv ?? process.env,
          filter: {
            jurisdiction: (url.searchParams.get('jurisdiction') ?? undefined) as PrivacyDisclosureJurisdiction | undefined,
          },
        }));
        return;
      }
      if (request.method === 'GET' && url.pathname === '/v1/enterprise/onprem-readiness') {
        const adminToken = options.auditAdminToken
          ?? process.env.GREYBOX_AUDIT_ADMIN_TOKEN
          ?? options.billingAdminToken
          ?? process.env.GREYBOX_BILLING_ADMIN_TOKEN;
        const authorization = await authorizeAdmin(headers, {
          token: adminToken,
          roles: ['admin'],
          scopes: ['audit:read'],
          workosVerifier,
          tenantStore,
          workosGroupRoleMap,
        });
        if (!authorization) {
          sendJson(response, 401, { error: 'audit_admin_required' });
          return;
        }
        const report = await assessOnPremReadiness({
          ...options.onPremReadiness,
          licensePath: options.onPremReadiness?.licensePath
            ?? options.offlineLicensePath
            ?? process.env.GREYBOX_OFFLINE_LICENSE_FILE,
          publicKeyPem: options.onPremReadiness?.publicKeyPem
            ?? options.offlineLicensePublicKeyPem
            ?? process.env.GREYBOX_OFFLINE_LICENSE_PUBLIC_KEY,
          publicKeyPath: options.onPremReadiness?.publicKeyPath
            ?? options.offlineLicensePublicKeyPath
            ?? process.env.GREYBOX_OFFLINE_LICENSE_PUBLIC_KEY_FILE,
        });
        sendJson(response, report.ready ? 200 : 503, report);
        return;
      }
      if (request.method === 'GET' && url.pathname === '/v1/enterprise/trust-controls') {
        const adminToken = options.auditAdminToken
          ?? process.env.GREYBOX_AUDIT_ADMIN_TOKEN
          ?? options.billingAdminToken
          ?? process.env.GREYBOX_BILLING_ADMIN_TOKEN;
        const authorization = await authorizeAdmin(headers, {
          token: adminToken,
          roles: ['admin'],
          scopes: ['audit:read'],
          workosVerifier,
          tenantStore,
          workosGroupRoleMap,
        });
        if (!authorization) {
          sendJson(response, 401, { error: 'audit_admin_required' });
          return;
        }
        sendJson(response, 200, await trustControlReportForRequest());
        return;
      }
      if (request.method === 'GET' && url.pathname === '/v1/enterprise/trust-packet') {
        const adminToken = options.auditAdminToken
          ?? process.env.GREYBOX_AUDIT_ADMIN_TOKEN
          ?? options.billingAdminToken
          ?? process.env.GREYBOX_BILLING_ADMIN_TOKEN;
        const authorization = await authorizeAdmin(headers, {
          token: adminToken,
          roles: ['admin', 'security-admin', 'privacy-admin'],
          scopes: ['audit:read', 'privacy:read', 'security:read'],
          workosVerifier,
          tenantStore,
          workosGroupRoleMap,
        });
        if (!authorization) {
          sendJson(response, 401, { error: 'audit_admin_required' });
          return;
        }
        const packet = await enterpriseTrustPacketForRequest();
        if (url.searchParams.get('format') === 'markdown') {
          sendText(response, 200, formatEnterpriseTrustPacketMarkdown(packet), 'text/markdown; charset=utf-8');
          return;
        }
        sendJson(response, 200, packet);
        return;
      }
      if (request.method === 'GET' && url.pathname === '/v1/enterprise/certification-roadmap') {
        const adminToken = options.auditAdminToken
          ?? process.env.GREYBOX_AUDIT_ADMIN_TOKEN
          ?? options.billingAdminToken
          ?? process.env.GREYBOX_BILLING_ADMIN_TOKEN;
        const authorization = await authorizeAdmin(headers, {
          token: adminToken,
          roles: ['admin', 'security-admin', 'privacy-admin'],
          scopes: ['audit:read', 'privacy:read', 'security:read'],
          workosVerifier,
          tenantStore,
          workosGroupRoleMap,
        });
        if (!authorization) {
          sendJson(response, 401, { error: 'audit_admin_required' });
          return;
        }
        sendJson(response, 200, await buildCertificationRoadmapReport({
          trustPacket: await enterpriseTrustPacketForRequest(),
        }));
        return;
      }
      if (request.method === 'GET' && url.pathname === '/v1/enterprise/security-questionnaire') {
        const adminToken = options.auditAdminToken
          ?? process.env.GREYBOX_AUDIT_ADMIN_TOKEN
          ?? options.billingAdminToken
          ?? process.env.GREYBOX_BILLING_ADMIN_TOKEN;
        const authorization = await authorizeAdmin(headers, {
          token: adminToken,
          roles: ['admin', 'security-admin', 'privacy-admin'],
          scopes: ['audit:read', 'privacy:read', 'security:read'],
          workosVerifier,
          tenantStore,
          workosGroupRoleMap,
        });
        if (!authorization) {
          sendJson(response, 401, { error: 'audit_admin_required' });
          return;
        }
        const questionnaire = await buildSecurityQuestionnaireReport({
          packet: await enterpriseTrustPacketForRequest(),
          contractPacket: enterpriseContractPacketForRequest(),
        });
        if (url.searchParams.get('format') === 'csv') {
          sendText(response, 200, exportSecurityQuestionnaireCsv(questionnaire), 'text/csv; charset=utf-8');
          return;
        }
        sendJson(response, 200, questionnaire);
        return;
      }
      if (request.method === 'GET' && url.pathname === '/v1/enterprise/contracts') {
        const adminToken = options.auditAdminToken
          ?? process.env.GREYBOX_AUDIT_ADMIN_TOKEN
          ?? options.billingAdminToken
          ?? process.env.GREYBOX_BILLING_ADMIN_TOKEN;
        const authorization = await authorizeAdmin(headers, {
          token: adminToken,
          roles: ['admin', 'security-admin', 'privacy-admin'],
          scopes: ['audit:read', 'privacy:read', 'security:read'],
          workosVerifier,
          tenantStore,
          workosGroupRoleMap,
        });
        if (!authorization) {
          sendJson(response, 401, { error: 'audit_admin_required' });
          return;
        }
        const packet = enterpriseContractPacketForRequest();
        if (url.searchParams.get('format') === 'markdown') {
          sendText(response, 200, formatEnterpriseContractPacketMarkdown(packet), 'text/markdown; charset=utf-8');
          return;
        }
        sendJson(response, 200, packet);
        return;
      }
      if (request.method === 'GET' && url.pathname === '/v1/enterprise/pilot-readiness') {
        const adminToken = options.auditAdminToken
          ?? process.env.GREYBOX_AUDIT_ADMIN_TOKEN
          ?? options.billingAdminToken
          ?? process.env.GREYBOX_BILLING_ADMIN_TOKEN;
        const authorization = await authorizeAdmin(headers, {
          token: adminToken,
          roles: ['admin', 'security-admin', 'privacy-admin'],
          scopes: ['audit:read', 'privacy:read', 'security:read'],
          workosVerifier,
          tenantStore,
          workosGroupRoleMap,
        });
        if (!authorization) {
          sendJson(response, 401, { error: 'audit_admin_required' });
          return;
        }
        const supportSlaTickets = options.supportSlaTickets ?? supportSlaTicketsFromEnv(process.env);
        const report = await buildEnterprisePilotReadinessReport({
          auditLog,
          billingLedger,
          scimStore,
          privacyRequestStore,
          incidentStore,
          modelTrainingConsentStore,
          legalHoldStore,
          privacyGovernanceEnv: options.privacyGovernanceEnv ?? process.env,
          privacyDisclosureEnv: options.privacyDisclosureEnv ?? process.env,
          dataResidencyEnv: options.dataResidencyEnv ?? process.env,
          encryptionEnv: options.encryptionEnv ?? process.env,
          privateNetworkEnv: options.privateNetworkEnv ?? process.env,
          workosVerifier,
          offlineLicenseConfigured: Boolean(
            options.offlineLicensePath
              ?? process.env.GREYBOX_OFFLINE_LICENSE_FILE,
          ),
          onPremReadinessConfigured: Boolean(
            options.onPremReadiness
              ?? process.env.GREYBOX_DEPLOYMENT_MODE
              ?? process.env.GREYBOX_OFFLINE_LICENSE_FILE,
          ),
          trustControlReport: await trustControlReportForRequest(),
          contractPacket: enterpriseContractPacketForRequest(),
          contractRoot: options.contractRoot ?? process.cwd(),
          supportSlaTickets,
        });
        if (url.searchParams.get('format') === 'markdown') {
          sendText(response, 200, formatEnterprisePilotReadinessMarkdown(report), 'text/markdown; charset=utf-8');
          return;
        }
        sendJson(response, 200, report);
        return;
      }
      if (request.method === 'GET' && url.pathname === '/v1/enterprise/logo-expansion-readiness') {
        const adminToken = options.auditAdminToken
          ?? process.env.GREYBOX_AUDIT_ADMIN_TOKEN
          ?? options.billingAdminToken
          ?? process.env.GREYBOX_BILLING_ADMIN_TOKEN;
        const authorization = await authorizeAdmin(headers, {
          token: adminToken,
          roles: ['admin', 'revenue-admin', 'sales-admin', 'customer-success-admin'],
          scopes: ['audit:read', 'revenue:read'],
          workosVerifier,
          tenantStore,
          workosGroupRoleMap,
        });
        if (!authorization) {
          sendJson(response, 401, { error: 'audit_admin_required' });
          return;
        }
        const supportSlaTickets = options.supportSlaTickets ?? supportSlaTicketsFromEnv(process.env);
        const report = buildEnterpriseLogoExpansionReport({
          metrics: options.enterpriseLogoMetrics ?? enterpriseLogoMetricsFromEnv(process.env),
          trustControlReport: await trustControlReportForRequest(),
          contractPacket: enterpriseContractPacketForRequest(),
          supportSlaTickets,
        });
        if (url.searchParams.get('format') === 'markdown') {
          sendText(response, 200, formatEnterpriseLogoExpansionMarkdown(report), 'text/markdown; charset=utf-8');
          return;
        }
        sendJson(response, 200, report);
        return;
      }
      if (request.method === 'GET' && url.pathname === '/v1/enterprise/support-sla-readiness') {
        const adminToken = options.auditAdminToken
          ?? process.env.GREYBOX_AUDIT_ADMIN_TOKEN
          ?? options.billingAdminToken
          ?? process.env.GREYBOX_BILLING_ADMIN_TOKEN;
        const authorization = await authorizeAdmin(headers, {
          token: adminToken,
          roles: ['admin', 'customer-success-admin', 'support-admin', 'sales-admin', 'revenue-admin'],
          scopes: ['audit:read', 'revenue:read'],
          workosVerifier,
          tenantStore,
          workosGroupRoleMap,
        });
        if (!authorization) {
          sendJson(response, 401, { error: 'audit_admin_required' });
          return;
        }
        const report = buildSupportSlaReadinessReport({
          tickets: options.supportSlaTickets ?? supportSlaTicketsFromEnv(process.env),
        });
        if (url.searchParams.get('format') === 'markdown') {
          sendText(response, 200, formatSupportSlaReadinessMarkdown(report), 'text/markdown; charset=utf-8');
          return;
        }
        sendJson(response, 200, report);
        return;
      }
      if (request.method === 'GET' && url.pathname === '/v1/strategy/business-model-proof') {
        const adminToken = options.auditAdminToken
          ?? process.env.GREYBOX_AUDIT_ADMIN_TOKEN
          ?? options.billingAdminToken
          ?? process.env.GREYBOX_BILLING_ADMIN_TOKEN;
        const authorization = await authorizeAdmin(headers, {
          token: adminToken,
          roles: ['admin', 'finance-admin', 'revenue-admin', 'product-admin'],
          scopes: ['audit:read', 'revenue:read'],
          workosVerifier,
          tenantStore,
          workosGroupRoleMap,
        });
        if (!authorization) {
          sendJson(response, 401, { error: 'audit_admin_required' });
          return;
        }
        const report = buildBusinessModelProofReport({
          proof: options.businessModelProof ?? businessModelProofFromEnv(process.env),
        });
        if (url.searchParams.get('format') === 'markdown') {
          sendText(response, 200, formatBusinessModelProofMarkdown(report), 'text/markdown; charset=utf-8');
          return;
        }
        sendJson(response, 200, report);
        return;
      }
      if (request.method === 'GET' && url.pathname === '/v1/strategy/acquisition-readiness') {
        const adminToken = options.auditAdminToken
          ?? process.env.GREYBOX_AUDIT_ADMIN_TOKEN
          ?? options.billingAdminToken
          ?? process.env.GREYBOX_BILLING_ADMIN_TOKEN;
        const authorization = await authorizeAdmin(headers, {
          token: adminToken,
          roles: ['admin', 'finance-admin', 'revenue-admin'],
          scopes: ['audit:read', 'revenue:read'],
          workosVerifier,
          tenantStore,
          workosGroupRoleMap,
        });
        if (!authorization) {
          sendJson(response, 401, { error: 'audit_admin_required' });
          return;
        }
        const supportSlaTickets = options.supportSlaTickets ?? supportSlaTicketsFromEnv(process.env);
        const enterpriseLogoExpansionReport = buildEnterpriseLogoExpansionReport({
          metrics: options.enterpriseLogoMetrics ?? enterpriseLogoMetricsFromEnv(process.env),
          trustControlReport: await trustControlReportForRequest(),
          contractPacket: enterpriseContractPacketForRequest(),
          supportSlaTickets,
        });
        const commercialCreditReport = buildCommercialCreditReport({
          records: options.commercialCreditRecords ?? commercialCreditRecordsFromEnv(process.env),
        });
        const strategicOutreachReport = buildStrategicOutreachReport({
          records: options.strategicOutreachRecords ?? strategicOutreachRecordsFromEnv(process.env),
        });
        const northStarReport = buildNorthStarReport({
          events: options.northStarEvents ?? northStarEventsFromEnv(process.env),
          generatedAt: options.northStarGeneratedAt,
        });
        const unityAdoptionReport = await buildUnityPluginAdoptionReport({
          auditLog,
          licenseRecords,
          metrics: options.unityAdoptionMetrics ?? unityPluginAdoptionMetricsFromEnv(process.env),
          ...(supportSlaTickets.length > 0 ? { supportSlaTickets } : {}),
        });
        const businessModelProofReport = buildBusinessModelProofReport({
          proof: options.businessModelProof ?? businessModelProofFromEnv(process.env),
        });
        const engineExpansionReport = buildEngineExpansionReadinessReport({
          metrics: options.engineExpansionMetrics ?? engineExpansionMetricsFromEnv(process.env),
        });
        const certificationRoadmapReport = options.certificationRoadmapReport ?? await buildCertificationRoadmapReport({
          trustPacket: await enterpriseTrustPacketForRequest(),
        });
        const salesMotionReadinessReport = options.salesMotionReadinessReport ?? buildSalesMotionReadinessReport({
          metrics: options.salesMotionMetrics ?? salesMotionMetricsFromEnv(process.env),
          businessModelProofReport,
          unityAdoptionReport,
          enterpriseLogoExpansionReport,
        });
        const report = buildAcquisitionReadinessReport({
          metrics: options.acquisitionMetrics ?? acquisitionMetricsFromEnv(process.env),
          salesMotionReadinessReport,
          enterpriseLogoExpansionReport,
          commercialCreditReport,
          strategicOutreachReport,
          certificationRoadmapReport,
          northStarReport,
          unityAdoptionReport,
          businessModelProofReport,
          engineExpansionReport,
        });
        if (url.searchParams.get('format') === 'markdown') {
          sendText(response, 200, formatAcquisitionReadinessMarkdown(report), 'text/markdown; charset=utf-8');
          return;
        }
        sendJson(response, 200, report);
        return;
      }
      if (request.method === 'GET' && url.pathname === '/v1/strategy/strategic-outreach') {
        const adminToken = options.auditAdminToken
          ?? process.env.GREYBOX_AUDIT_ADMIN_TOKEN
          ?? options.billingAdminToken
          ?? process.env.GREYBOX_BILLING_ADMIN_TOKEN;
        const authorization = await authorizeAdmin(headers, {
          token: adminToken,
          roles: ['admin', 'finance-admin', 'revenue-admin', 'partnerships-admin'],
          scopes: ['audit:read', 'revenue:read'],
          workosVerifier,
          tenantStore,
          workosGroupRoleMap,
        });
        if (!authorization) {
          sendJson(response, 401, { error: 'audit_admin_required' });
          return;
        }
        const report = buildStrategicOutreachReport({
          records: options.strategicOutreachRecords ?? strategicOutreachRecordsFromEnv(process.env),
        });
        if (url.searchParams.get('format') === 'markdown') {
          sendText(response, 200, formatStrategicOutreachMarkdown(report), 'text/markdown; charset=utf-8');
          return;
        }
        sendJson(response, 200, report);
        return;
      }
      if (request.method === 'GET' && url.pathname === '/v1/strategy/commercial-credits') {
        const adminToken = options.auditAdminToken
          ?? process.env.GREYBOX_AUDIT_ADMIN_TOKEN
          ?? options.billingAdminToken
          ?? process.env.GREYBOX_BILLING_ADMIN_TOKEN;
        const authorization = await authorizeAdmin(headers, {
          token: adminToken,
          roles: ['admin', 'product-admin', 'revenue-admin', 'partnerships-admin'],
          scopes: ['audit:read', 'revenue:read'],
          workosVerifier,
          tenantStore,
          workosGroupRoleMap,
        });
        if (!authorization) {
          sendJson(response, 401, { error: 'audit_admin_required' });
          return;
        }
        const report = buildCommercialCreditReport({
          records: options.commercialCreditRecords ?? commercialCreditRecordsFromEnv(process.env),
        });
        if (url.searchParams.get('format') === 'markdown') {
          sendText(response, 200, formatCommercialCreditMarkdown(report), 'text/markdown; charset=utf-8');
          return;
        }
        sendJson(response, 200, report);
        return;
      }
      if (request.method === 'GET' && url.pathname === '/v1/strategy/engine-partnerships') {
        const adminToken = options.auditAdminToken
          ?? process.env.GREYBOX_AUDIT_ADMIN_TOKEN
          ?? options.billingAdminToken
          ?? process.env.GREYBOX_BILLING_ADMIN_TOKEN;
        const authorization = await authorizeAdmin(headers, {
          token: adminToken,
          roles: ['admin', 'product-admin', 'revenue-admin', 'partnerships-admin'],
          scopes: ['audit:read', 'revenue:read'],
          workosVerifier,
          tenantStore,
          workosGroupRoleMap,
        });
        if (!authorization) {
          sendJson(response, 401, { error: 'audit_admin_required' });
          return;
        }
        const report = buildEnginePartnershipReport({
          records: options.enginePartnershipRecords ?? enginePartnershipRecordsFromEnv(process.env),
        });
        if (url.searchParams.get('format') === 'markdown') {
          sendText(response, 200, formatEnginePartnershipMarkdown(report), 'text/markdown; charset=utf-8');
          return;
        }
        sendJson(response, 200, report);
        return;
      }
      if (request.method === 'GET' && url.pathname === '/v1/strategy/coding-agent-partnerships') {
        const adminToken = options.auditAdminToken
          ?? process.env.GREYBOX_AUDIT_ADMIN_TOKEN
          ?? options.billingAdminToken
          ?? process.env.GREYBOX_BILLING_ADMIN_TOKEN;
        const authorization = await authorizeAdmin(headers, {
          token: adminToken,
          roles: ['admin', 'product-admin', 'revenue-admin', 'partnerships-admin'],
          scopes: ['audit:read', 'revenue:read'],
          workosVerifier,
          tenantStore,
          workosGroupRoleMap,
        });
        if (!authorization) {
          sendJson(response, 401, { error: 'audit_admin_required' });
          return;
        }
        const report = buildCodingAgentPartnershipReport({
          records: options.codingAgentPartnershipRecords ?? codingAgentPartnershipRecordsFromEnv(process.env),
        });
        if (url.searchParams.get('format') === 'markdown') {
          sendText(response, 200, formatCodingAgentPartnershipMarkdown(report), 'text/markdown; charset=utf-8');
          return;
        }
        sendJson(response, 200, report);
        return;
      }
      if (request.method === 'GET' && url.pathname === '/v1/strategy/education-adoption') {
        const adminToken = options.auditAdminToken
          ?? process.env.GREYBOX_AUDIT_ADMIN_TOKEN
          ?? options.billingAdminToken
          ?? process.env.GREYBOX_BILLING_ADMIN_TOKEN;
        const authorization = await authorizeAdmin(headers, {
          token: adminToken,
          roles: ['admin', 'product-admin', 'revenue-admin', 'partnerships-admin'],
          scopes: ['audit:read', 'revenue:read'],
          workosVerifier,
          tenantStore,
          workosGroupRoleMap,
        });
        if (!authorization) {
          sendJson(response, 401, { error: 'audit_admin_required' });
          return;
        }
        const report = buildEducationAdoptionReport({
          records: options.educationAdoptionRecords ?? educationAdoptionRecordsFromEnv(process.env),
        });
        if (url.searchParams.get('format') === 'markdown') {
          sendText(response, 200, formatEducationAdoptionMarkdown(report), 'text/markdown; charset=utf-8');
          return;
        }
        sendJson(response, 200, report);
        return;
      }
      if (request.method === 'GET' && url.pathname === '/v1/strategy/content-cadence') {
        const adminToken = options.auditAdminToken
          ?? process.env.GREYBOX_AUDIT_ADMIN_TOKEN
          ?? options.billingAdminToken
          ?? process.env.GREYBOX_BILLING_ADMIN_TOKEN;
        const authorization = await authorizeAdmin(headers, {
          token: adminToken,
          roles: ['admin', 'product-admin', 'revenue-admin', 'partnerships-admin'],
          scopes: ['audit:read', 'revenue:read'],
          workosVerifier,
          tenantStore,
          workosGroupRoleMap,
        });
        if (!authorization) {
          sendJson(response, 401, { error: 'audit_admin_required' });
          return;
        }
        const report = buildContentCadenceReport({
          records: options.contentCadenceRecords ?? contentCadenceRecordsFromEnv(process.env),
          now: options.contentCadenceNow,
        });
        if (url.searchParams.get('format') === 'markdown') {
          sendText(response, 200, formatContentCadenceMarkdown(report), 'text/markdown; charset=utf-8');
          return;
        }
        sendJson(response, 200, report);
        return;
      }
      if (request.method === 'GET' && url.pathname === '/v1/strategy/sales-motion-readiness') {
        const adminToken = options.auditAdminToken
          ?? process.env.GREYBOX_AUDIT_ADMIN_TOKEN
          ?? options.billingAdminToken
          ?? process.env.GREYBOX_BILLING_ADMIN_TOKEN;
        const authorization = await authorizeAdmin(headers, {
          token: adminToken,
          roles: ['admin', 'finance-admin', 'revenue-admin', 'sales-admin', 'customer-success-admin'],
          scopes: ['audit:read', 'revenue:read'],
          workosVerifier,
          tenantStore,
          workosGroupRoleMap,
        });
        if (!authorization) {
          sendJson(response, 401, { error: 'audit_admin_required' });
          return;
        }
        const businessModelProof = options.businessModelProof ?? businessModelProofFromEnv(process.env);
        const supportSlaTickets = options.supportSlaTickets ?? supportSlaTicketsFromEnv(process.env);
        const hasBusinessModelProof = options.businessModelProof !== undefined
          || Boolean(process.env.GREYBOX_BUSINESS_MODEL_PROOF_JSON?.trim());
        const hasUnityAdoptionMetrics = options.unityAdoptionMetrics !== undefined
          || Boolean(process.env.GREYBOX_UNITY_ADOPTION_JSON?.trim())
          || licenseRecords.length > 0;
        const hasEnterpriseLogoMetrics = options.enterpriseLogoMetrics !== undefined
          || Boolean(process.env.GREYBOX_ENTERPRISE_LOGO_METRICS_JSON?.trim());
        const report = buildSalesMotionReadinessReport({
          metrics: options.salesMotionMetrics ?? salesMotionMetricsFromEnv(process.env),
          ...(hasBusinessModelProof
            ? { businessModelProofReport: buildBusinessModelProofReport({ proof: businessModelProof }) }
            : {}),
          ...(hasUnityAdoptionMetrics
            ? {
              unityAdoptionReport: await buildUnityPluginAdoptionReport({
                auditLog,
                licenseRecords,
                metrics: options.unityAdoptionMetrics ?? unityPluginAdoptionMetricsFromEnv(process.env),
                ...(supportSlaTickets.length > 0 ? { supportSlaTickets } : {}),
              }),
            }
            : {}),
          ...(hasEnterpriseLogoMetrics
            ? {
              enterpriseLogoExpansionReport: buildEnterpriseLogoExpansionReport({
                metrics: options.enterpriseLogoMetrics ?? enterpriseLogoMetricsFromEnv(process.env),
                trustControlReport: await trustControlReportForRequest(),
                contractPacket: enterpriseContractPacketForRequest(),
                ...(supportSlaTickets.length > 0 ? { supportSlaTickets } : {}),
              }),
            }
            : {}),
        });
        if (url.searchParams.get('format') === 'markdown') {
          sendText(response, 200, formatSalesMotionReadinessMarkdown(report), 'text/markdown; charset=utf-8');
          return;
        }
        sendJson(response, 200, report);
        return;
      }
      if (request.method === 'GET' && url.pathname === '/v1/strategy/north-star') {
        const adminToken = options.auditAdminToken
          ?? process.env.GREYBOX_AUDIT_ADMIN_TOKEN
          ?? options.billingAdminToken
          ?? process.env.GREYBOX_BILLING_ADMIN_TOKEN;
        const authorization = await authorizeAdmin(headers, {
          token: adminToken,
          roles: ['admin', 'product-admin', 'revenue-admin'],
          scopes: ['audit:read', 'revenue:read'],
          workosVerifier,
          tenantStore,
          workosGroupRoleMap,
        });
        if (!authorization) {
          sendJson(response, 401, { error: 'audit_admin_required' });
          return;
        }
        const report = buildNorthStarReport({
          events: options.northStarEvents ?? northStarEventsFromEnv(process.env),
          generatedAt: options.northStarGeneratedAt,
        });
        if (url.searchParams.get('format') === 'markdown') {
          sendText(response, 200, formatNorthStarMarkdown(report), 'text/markdown; charset=utf-8');
          return;
        }
        sendJson(response, 200, report);
        return;
      }
      if (request.method === 'GET' && url.pathname === '/v1/strategy/unity-plugin-adoption') {
        const adminToken = options.auditAdminToken
          ?? process.env.GREYBOX_AUDIT_ADMIN_TOKEN
          ?? options.billingAdminToken
          ?? process.env.GREYBOX_BILLING_ADMIN_TOKEN;
        const authorization = await authorizeAdmin(headers, {
          token: adminToken,
          roles: ['admin', 'product-admin', 'revenue-admin'],
          scopes: ['audit:read', 'revenue:read'],
          workosVerifier,
          tenantStore,
          workosGroupRoleMap,
        });
        if (!authorization) {
          sendJson(response, 401, { error: 'audit_admin_required' });
          return;
        }
        const supportSlaTickets = options.supportSlaTickets ?? supportSlaTicketsFromEnv(process.env);
        const report = await buildUnityPluginAdoptionReport({
          auditLog,
          licenseRecords,
          metrics: options.unityAdoptionMetrics ?? unityPluginAdoptionMetricsFromEnv(process.env),
          ...(supportSlaTickets.length > 0 ? { supportSlaTickets } : {}),
        });
        if (url.searchParams.get('format') === 'markdown') {
          sendText(response, 200, formatUnityPluginAdoptionMarkdown(report), 'text/markdown; charset=utf-8');
          return;
        }
        sendJson(response, 200, report);
        return;
      }
      if (request.method === 'GET' && url.pathname === '/v1/strategy/distribution-readiness') {
        const adminToken = options.auditAdminToken
          ?? process.env.GREYBOX_AUDIT_ADMIN_TOKEN
          ?? options.billingAdminToken
          ?? process.env.GREYBOX_BILLING_ADMIN_TOKEN;
        const authorization = await authorizeAdmin(headers, {
          token: adminToken,
          roles: ['admin', 'product-admin', 'revenue-admin', 'partnerships-admin'],
          scopes: ['audit:read', 'revenue:read'],
          workosVerifier,
          tenantStore,
          workosGroupRoleMap,
        });
        if (!authorization) {
          sendJson(response, 401, { error: 'audit_admin_required' });
          return;
        }
        const report = buildDistributionReadinessReport({
          metrics: options.distributionMetrics ?? distributionMetricsFromEnv(process.env),
          enginePartnershipReport: buildEnginePartnershipReport({
            records: options.enginePartnershipRecords ?? enginePartnershipRecordsFromEnv(process.env),
          }),
          codingAgentPartnershipReport: buildCodingAgentPartnershipReport({
            records: options.codingAgentPartnershipRecords ?? codingAgentPartnershipRecordsFromEnv(process.env),
          }),
          educationAdoptionReport: buildEducationAdoptionReport({
            records: options.educationAdoptionRecords ?? educationAdoptionRecordsFromEnv(process.env),
          }),
          contentCadenceReport: buildContentCadenceReport({
            records: options.contentCadenceRecords ?? contentCadenceRecordsFromEnv(process.env),
            now: options.contentCadenceNow,
          }),
          commercialCreditReport: buildCommercialCreditReport({
            records: options.commercialCreditRecords ?? commercialCreditRecordsFromEnv(process.env),
          }),
        });
        if (url.searchParams.get('format') === 'markdown') {
          sendText(response, 200, formatDistributionReadinessMarkdown(report), 'text/markdown; charset=utf-8');
          return;
        }
        sendJson(response, 200, report);
        return;
      }
      if (request.method === 'GET' && url.pathname === '/v1/strategy/engine-expansion-readiness') {
        const adminToken = options.auditAdminToken
          ?? process.env.GREYBOX_AUDIT_ADMIN_TOKEN
          ?? options.billingAdminToken
          ?? process.env.GREYBOX_BILLING_ADMIN_TOKEN;
        const authorization = await authorizeAdmin(headers, {
          token: adminToken,
          roles: ['admin', 'product-admin', 'revenue-admin', 'partnerships-admin'],
          scopes: ['audit:read', 'revenue:read'],
          workosVerifier,
          tenantStore,
          workosGroupRoleMap,
        });
        if (!authorization) {
          sendJson(response, 401, { error: 'audit_admin_required' });
          return;
        }
        const report = buildEngineExpansionReadinessReport({
          metrics: options.engineExpansionMetrics ?? engineExpansionMetricsFromEnv(process.env),
        });
        if (url.searchParams.get('format') === 'markdown') {
          sendText(response, 200, formatEngineExpansionReadinessMarkdown(report), 'text/markdown; charset=utf-8');
          return;
        }
        sendJson(response, 200, report);
        return;
      }
      if (request.method === 'GET' && url.pathname === '/v1/model-training/native-readiness') {
        const adminToken = options.auditAdminToken
          ?? process.env.GREYBOX_AUDIT_ADMIN_TOKEN
          ?? options.billingAdminToken
          ?? process.env.GREYBOX_BILLING_ADMIN_TOKEN;
        const authorization = await authorizeAdmin(headers, {
          token: adminToken,
          roles: ['admin', 'privacy-admin', 'ml-admin'],
          scopes: ['audit:read', 'privacy:read', 'model-training:read'],
          workosVerifier,
          tenantStore,
          workosGroupRoleMap,
        });
        if (!authorization) {
          sendJson(response, 401, { error: 'model_training_admin_required' });
          return;
        }
        const report = await buildNativeTrainingReadinessReport({
          consentStore: modelTrainingConsentStore,
          candidates: options.nativeTrainingCandidates ?? nativeTrainingCandidatesFromEnv(process.env),
        });
        if (url.searchParams.get('format') === 'markdown') {
          sendText(response, 200, formatNativeTrainingReadinessMarkdown(report), 'text/markdown; charset=utf-8');
          return;
        }
        sendJson(response, 200, report);
        return;
      }
      if (request.method === 'GET' && url.pathname.startsWith('/v1/enterprise/privacy-governance')) {
        const authorization = await authorizeAdmin(headers, {
          token: options.auditAdminToken
            ?? process.env.GREYBOX_AUDIT_ADMIN_TOKEN
            ?? options.billingAdminToken
            ?? process.env.GREYBOX_BILLING_ADMIN_TOKEN,
          roles: ['admin', 'privacy-admin'],
          scopes: ['privacy:read', 'audit:read'],
          workosVerifier,
          tenantStore,
          workosGroupRoleMap,
        });
        if (!authorization) {
          sendJson(response, 401, { error: 'privacy_admin_required' });
          return;
        }
        const report = buildPrivacyGovernanceReport({
          env: options.privacyGovernanceEnv ?? process.env,
        });
        if (url.pathname === '/v1/enterprise/privacy-governance') {
          sendJson(response, 200, report);
          return;
        }
        if (url.pathname === '/v1/enterprise/privacy-governance/ropa') {
          sendJson(response, 200, {
            generatedAt: report.generatedAt,
            articleReferences: report.articleReferences.filter((reference) => reference.id === 'gdpr-article-30'),
            records: report.ropaRecords,
          });
          return;
        }
        if (url.pathname === '/v1/enterprise/privacy-governance/dpia') {
          sendJson(response, 200, {
            generatedAt: report.generatedAt,
            articleReferences: report.articleReferences.filter((reference) => reference.id === 'gdpr-article-35'),
            assessments: report.dpiaAssessments,
          });
          return;
        }
        if (url.pathname === '/v1/enterprise/privacy-governance/dpo') {
          sendJson(response, 200, {
            generatedAt: report.generatedAt,
            articleReferences: report.articleReferences.filter((reference) => reference.id === 'gdpr-article-37'),
            dpo: report.dpo,
          });
          return;
        }
        sendJson(response, 404, { error: 'not_found' });
        return;
      }
      if (request.method === 'GET' && url.pathname === '/v1/enterprise/retention-report') {
        const authorization = await authorizeAdmin(headers, {
          token: options.auditAdminToken
            ?? process.env.GREYBOX_AUDIT_ADMIN_TOKEN
            ?? options.billingAdminToken
            ?? process.env.GREYBOX_BILLING_ADMIN_TOKEN,
          roles: ['admin', 'privacy-admin'],
          scopes: ['privacy:read', 'audit:read'],
          workosVerifier,
          tenantStore,
          workosGroupRoleMap,
        });
        if (!authorization) {
          sendJson(response, 401, { error: 'privacy_admin_required' });
          return;
        }
        const tenantId = url.searchParams.get('tenantId')?.trim();
        if (!tenantId) {
          sendJson(response, 400, { error: 'tenantId_required' });
          return;
        }
        sendJson(response, 200, await buildRetentionReport({
          tenantId,
          legalHoldStore,
        }));
        return;
      }
      if (request.method === 'GET' && url.pathname === '/v1/enterprise/retention-policies') {
        sendJson(response, 200, {
          generatedAt: new Date().toISOString(),
          policies: defaultRetentionPolicies,
          disclaimer: 'Retention readiness evidence only. Counsel-approved order forms and local law remain authoritative.',
        });
        return;
      }
      if (request.method === 'GET' && url.pathname === '/v1/enterprise/legal-holds') {
        const authorization = await authorizeAdmin(headers, {
          token: options.auditAdminToken
            ?? process.env.GREYBOX_AUDIT_ADMIN_TOKEN
            ?? options.billingAdminToken
            ?? process.env.GREYBOX_BILLING_ADMIN_TOKEN,
          roles: ['admin', 'privacy-admin'],
          scopes: ['privacy:read', 'audit:read'],
          workosVerifier,
          tenantStore,
          workosGroupRoleMap,
        });
        if (!authorization) {
          sendJson(response, 401, { error: 'privacy_admin_required' });
          return;
        }
        if (!legalHoldStore) {
          sendJson(response, 503, { error: 'legal_hold_store_not_configured' });
          return;
        }
        sendJson(response, 200, {
          holds: await legalHoldStore.list({
            tenantId: url.searchParams.get('tenantId') ?? undefined,
            status: (url.searchParams.get('status') ?? undefined) as LegalHoldStatus | undefined,
            dataset: (url.searchParams.get('dataset') ?? undefined) as RetentionDataset | undefined,
          }),
        });
        return;
      }
      if (request.method === 'POST' && url.pathname === '/v1/enterprise/legal-holds') {
        const authorization = await authorizeAdmin(headers, {
          token: options.auditAdminToken
            ?? process.env.GREYBOX_AUDIT_ADMIN_TOKEN
            ?? options.billingAdminToken
            ?? process.env.GREYBOX_BILLING_ADMIN_TOKEN,
          roles: ['admin', 'privacy-admin'],
          scopes: ['privacy:write'],
          workosVerifier,
          tenantStore,
          workosGroupRoleMap,
        });
        if (!authorization) {
          sendJson(response, 401, { error: 'privacy_admin_required' });
          return;
        }
        if (!legalHoldStore) {
          sendJson(response, 503, { error: 'legal_hold_store_not_configured' });
          return;
        }
        const hold = await legalHoldStore.create(await readJson(request), authorization.actorId);
        await appendLegalHoldAudit({
          auditLog,
          hold,
          action: 'retention.legal_hold_created',
          authorization,
          headers,
          incoming: request,
        });
        sendJson(response, 201, hold);
        return;
      }
      const legalHoldMatch = /^\/v1\/enterprise\/legal-holds\/([^/]+)$/u.exec(url.pathname);
      if (request.method === 'PATCH' && legalHoldMatch) {
        const authorization = await authorizeAdmin(headers, {
          token: options.auditAdminToken
            ?? process.env.GREYBOX_AUDIT_ADMIN_TOKEN
            ?? options.billingAdminToken
            ?? process.env.GREYBOX_BILLING_ADMIN_TOKEN,
          roles: ['admin', 'privacy-admin'],
          scopes: ['privacy:write'],
          workosVerifier,
          tenantStore,
          workosGroupRoleMap,
        });
        if (!authorization) {
          sendJson(response, 401, { error: 'privacy_admin_required' });
          return;
        }
        if (!legalHoldStore) {
          sendJson(response, 503, { error: 'legal_hold_store_not_configured' });
          return;
        }
        const hold = await legalHoldStore.update(
          decodeURIComponent(legalHoldMatch[1]!),
          await readJson(request),
          authorization.actorId,
        );
        await appendLegalHoldAudit({
          auditLog,
          hold,
          action: 'retention.legal_hold_updated',
          authorization,
          headers,
          incoming: request,
        });
        sendJson(response, 200, hold);
        return;
      }
      if (url.pathname === '/v1/model-training-consent') {
        const context = await authenticateRequest(headers, requestAuthOptions);
        if (!modelTrainingConsentStore) {
          sendJson(response, 503, { error: 'model_training_consent_store_not_configured' });
          return;
        }
        if (request.method === 'GET') {
          const projectId = url.searchParams.get('projectId')?.trim();
          if (!projectId) {
            sendJson(response, 400, { error: 'projectId_required' });
            return;
          }
          const artifactId = url.searchParams.get('artifactId')?.trim() || undefined;
          const consent = await modelTrainingConsentStore.latest({
            tenantId: context.tenantId,
            userId: context.userId,
            projectId,
            artifactId,
          });
          sendJson(response, 200, {
            consent: consent ? publicModelTrainingConsentView(consent) : null,
            defaultStatus: 'opted-out',
          });
          return;
        }
        if (request.method === 'POST') {
          const consent = await modelTrainingConsentStore.create(await readJson(request), context);
          await appendModelTrainingConsentAudit({
            auditLog,
            consent,
            context,
            headers,
            incoming: request,
          });
          sendJson(response, 201, publicModelTrainingConsentView(consent));
          return;
        }
      }
      if (request.method === 'GET' && url.pathname === '/v1/enterprise/incidents') {
        const authorization = await authorizeAdmin(headers, {
          token: options.auditAdminToken
            ?? process.env.GREYBOX_AUDIT_ADMIN_TOKEN
            ?? options.billingAdminToken
            ?? process.env.GREYBOX_BILLING_ADMIN_TOKEN,
          roles: ['admin', 'security-admin'],
          scopes: ['security:read', 'audit:read'],
          workosVerifier,
          tenantStore,
          workosGroupRoleMap,
        });
        if (!authorization) {
          sendJson(response, 401, { error: 'security_admin_required' });
          return;
        }
        if (!incidentStore) {
          sendJson(response, 503, { error: 'security_incident_store_not_configured' });
          return;
        }
        const statusFilter = url.searchParams.get('status') as SecurityIncidentStatus | null;
        const severityFilter = url.searchParams.get('severity') as SecurityIncidentSeverity | null;
        sendJson(response, 200, {
          incidents: await incidentStore.list({
            tenantId: url.searchParams.get('tenantId') ?? undefined,
            status: statusFilter ?? undefined,
            severity: severityFilter ?? undefined,
          }),
        });
        return;
      }
      if (request.method === 'POST' && url.pathname === '/v1/enterprise/incidents') {
        const authorization = await authorizeAdmin(headers, {
          token: options.auditAdminToken
            ?? process.env.GREYBOX_AUDIT_ADMIN_TOKEN
            ?? options.billingAdminToken
            ?? process.env.GREYBOX_BILLING_ADMIN_TOKEN,
          roles: ['admin', 'security-admin'],
          scopes: ['security:write'],
          workosVerifier,
          tenantStore,
          workosGroupRoleMap,
        });
        if (!authorization) {
          sendJson(response, 401, { error: 'security_admin_required' });
          return;
        }
        if (!incidentStore) {
          sendJson(response, 503, { error: 'security_incident_store_not_configured' });
          return;
        }
        const incident = await incidentStore.create(await readJson(request), authorization.actorId);
        await appendSecurityIncidentAudit({
          auditLog,
          incident,
          action: 'security.incident_opened',
          authorization,
          headers,
          incoming: request,
        });
        sendJson(response, 201, incident);
        return;
      }
      const securityIncidentMatch = /^\/v1\/enterprise\/incidents\/([^/]+)$/u.exec(url.pathname);
      if (request.method === 'PATCH' && securityIncidentMatch) {
        const authorization = await authorizeAdmin(headers, {
          token: options.auditAdminToken
            ?? process.env.GREYBOX_AUDIT_ADMIN_TOKEN
            ?? options.billingAdminToken
            ?? process.env.GREYBOX_BILLING_ADMIN_TOKEN,
          roles: ['admin', 'security-admin'],
          scopes: ['security:write'],
          workosVerifier,
          tenantStore,
          workosGroupRoleMap,
        });
        if (!authorization) {
          sendJson(response, 401, { error: 'security_admin_required' });
          return;
        }
        if (!incidentStore) {
          sendJson(response, 503, { error: 'security_incident_store_not_configured' });
          return;
        }
        const incident = await incidentStore.update(
          decodeURIComponent(securityIncidentMatch[1]!),
          await readJson(request),
          authorization.actorId,
        );
        await appendSecurityIncidentAudit({
          auditLog,
          incident,
          action: 'security.incident_updated',
          authorization,
          headers,
          incoming: request,
        });
        sendJson(response, 200, incident);
        return;
      }
      if (request.method === 'POST' && url.pathname === '/v1/privacy/requests') {
        if (!privacyRequestStore) {
          sendJson(response, 503, { error: 'privacy_request_store_not_configured' });
          return;
        }
        const created = await privacyRequestStore.create(await readJson(request));
        sendJson(response, 202, {
          request: publicPrivacyRequestView(created.request),
          accessToken: created.accessToken,
        });
        return;
      }
      if (request.method === 'GET' && url.pathname === '/v1/privacy/requests') {
        const authorization = await authorizeAdmin(headers, {
          token: options.auditAdminToken
            ?? process.env.GREYBOX_AUDIT_ADMIN_TOKEN
            ?? options.billingAdminToken
            ?? process.env.GREYBOX_BILLING_ADMIN_TOKEN,
          roles: ['admin'],
          scopes: ['audit:read', 'privacy:read'],
          workosVerifier,
          tenantStore,
          workosGroupRoleMap,
        });
        if (!authorization) {
          sendJson(response, 401, { error: 'privacy_admin_required' });
          return;
        }
        if (!privacyRequestStore) {
          sendJson(response, 503, { error: 'privacy_request_store_not_configured' });
          return;
        }
        const statusFilter = url.searchParams.get('status') as PrivacyRequestStatus | null;
        const jurisdictionFilter = url.searchParams.get('jurisdiction') as PrivacyJurisdiction | null;
        sendJson(response, 200, {
          requests: (await privacyRequestStore.list({
            tenantId: url.searchParams.get('tenantId') ?? undefined,
            status: statusFilter ?? undefined,
            jurisdiction: jurisdictionFilter ?? undefined,
          })).map(adminPrivacyRequestView),
        });
        return;
      }
      const privacyRequestMatch = /^\/v1\/privacy\/requests\/([^/]+)$/u.exec(url.pathname);
      const privacyFulfillmentMatch = /^\/v1\/privacy\/requests\/([^/]+)\/fulfillment-package$/u.exec(url.pathname);
      if (request.method === 'GET' && privacyFulfillmentMatch) {
        const authorization = await authorizeAdmin(headers, {
          token: options.auditAdminToken
            ?? process.env.GREYBOX_AUDIT_ADMIN_TOKEN
            ?? options.billingAdminToken
            ?? process.env.GREYBOX_BILLING_ADMIN_TOKEN,
          roles: ['admin'],
          scopes: ['privacy:read'],
          workosVerifier,
          tenantStore,
          workosGroupRoleMap,
        });
        if (!authorization) {
          sendJson(response, 401, { error: 'privacy_admin_required' });
          return;
        }
        if (!privacyRequestStore) {
          sendJson(response, 503, { error: 'privacy_request_store_not_configured' });
          return;
        }
        const record = await privacyRequestStore.get(decodeURIComponent(privacyFulfillmentMatch[1]!));
        if (!record) {
          sendJson(response, 404, { error: 'privacy_request_not_found' });
          return;
        }
        sendJson(response, 200, await buildPrivacyFulfillmentPackage({
          request: record,
          privacyRequestStore,
          scimStore,
          billingLedger,
          auditLog,
          legalHoldStore,
        }));
        return;
      }
      if (request.method === 'GET' && privacyRequestMatch) {
        if (!privacyRequestStore) {
          sendJson(response, 503, { error: 'privacy_request_store_not_configured' });
          return;
        }
        const record = await privacyRequestStore.get(decodeURIComponent(privacyRequestMatch[1]!));
        const accessToken = bearerToken(headers) || headers.get('x-greybox-privacy-token')?.trim() || '';
        if (!record || !accessToken || !privacyRequestAuthorized(record, accessToken)) {
          sendJson(response, 404, { error: 'privacy_request_not_found' });
          return;
        }
        sendJson(response, 200, publicPrivacyRequestView(record));
        return;
      }
      if (request.method === 'PATCH' && privacyRequestMatch) {
        const authorization = await authorizeAdmin(headers, {
          token: options.auditAdminToken
            ?? process.env.GREYBOX_AUDIT_ADMIN_TOKEN
            ?? options.billingAdminToken
            ?? process.env.GREYBOX_BILLING_ADMIN_TOKEN,
          roles: ['admin'],
          scopes: ['privacy:write'],
          workosVerifier,
          tenantStore,
          workosGroupRoleMap,
        });
        if (!authorization) {
          sendJson(response, 401, { error: 'privacy_admin_required' });
          return;
        }
        if (!privacyRequestStore) {
          sendJson(response, 503, { error: 'privacy_request_store_not_configured' });
          return;
        }
        const updated = await privacyRequestStore.updateStatus(
          decodeURIComponent(privacyRequestMatch[1]!),
          normalizePrivacyStatusUpdate(await readJson(request)),
          authorization.actorId,
        );
        sendJson(response, 200, adminPrivacyRequestView(updated));
        return;
      }
      if (request.method === 'GET' && url.pathname === '/v1/billing/checkout') {
        const checkoutRequest = hostedCheckoutRequestFromSearch(url.searchParams);
        if (!checkoutRequest) {
          sendHtml(response, 400, hostedCheckoutHtml({
            priceConfigured: false,
            status: 'unsupported-plan',
          }));
          return;
        }
        if (!checkoutRequest.tenantId) {
          sendHtml(response, 400, hostedCheckoutHtml({
            request: checkoutRequest,
            priceConfigured: Boolean(hostedCheckoutPriceId(checkoutRequest.tier, options)),
            status: 'missing-tenant',
          }));
          return;
        }
        const priceConfigured = Boolean(hostedCheckoutPriceId(checkoutRequest.tier, options));
        sendHtml(response, priceConfigured ? 200 : 503, hostedCheckoutHtml({
          request: checkoutRequest,
          priceConfigured,
          status: priceConfigured ? 'ready' : 'missing-price',
        }));
        return;
      }
      if (request.method === 'POST' && url.pathname === '/v1/billing/hosted-checkout') {
        const checkoutRequest = await hostedCheckoutRequestFromForm(request);
        if (!checkoutRequest) {
          sendHtml(response, 400, hostedCheckoutHtml({
            priceConfigured: false,
            status: 'unsupported-plan',
          }));
          return;
        }
        if (!checkoutRequest.tenantId) {
          sendHtml(response, 400, hostedCheckoutHtml({
            request: checkoutRequest,
            priceConfigured: Boolean(hostedCheckoutPriceId(checkoutRequest.tier, options)),
            status: 'missing-tenant',
          }));
          return;
        }
        const billingDecision = billingRateLimiter.reserve(`hosted-checkout:${checkoutRequest.tenantId}`);
        if (!billingDecision.allowed) {
          sendRateLimited(response, billingDecision);
          return;
        }
        const priceId = hostedCheckoutPriceId(checkoutRequest.tier, options);
        if (!priceId) {
          sendHtml(response, 503, hostedCheckoutHtml({
            request: checkoutRequest,
            priceConfigured: false,
            status: 'missing-price',
          }));
          return;
        }
        const apiKey = options.stripeApiKey ?? process.env.STRIPE_API_KEY;
        const client = options.billingApiClient ?? new LiveBillingApiClient({
          ...(apiKey ? { apiKey } : {}),
        });
        const successUrl = hostedCheckoutReturnUrl(
          billingCheckoutRuntimeEnv,
          'GREYBOX_BILLING_CHECKOUT_SUCCESS_URL',
          'https://app.greybox.studio/billing/success?session_id={CHECKOUT_SESSION_ID}',
        );
        const cancelUrl = hostedCheckoutReturnUrl(
          billingCheckoutRuntimeEnv,
          'GREYBOX_BILLING_CHECKOUT_CANCEL_URL',
          'https://app.greybox.studio/billing/cancel',
        );
        try {
          const result = await client.createCheckoutSession({
            tenantId: checkoutRequest.tenantId,
            tier: checkoutRequest.tier,
            seats: checkoutRequest.seats,
            successUrl,
            cancelUrl,
            ...(checkoutRequest.customerEmail ? { customerEmail: checkoutRequest.customerEmail } : {}),
            priceId,
          });
          if (auditLog) {
            const userAgentHeader = request.headers['user-agent'];
            const userAgent = Array.isArray(userAgentHeader) ? userAgentHeader.join(',') : userAgentHeader;
            await auditLog.append({
              id: auditId('audit'),
              tenantId: checkoutRequest.tenantId,
              actorId: 'hosted-checkout',
              actorType: 'user',
              action: 'billing.checkout_session_created',
              targetType: 'stripe-checkout-session',
              targetId: result.id,
              createdAt: new Date().toISOString(),
              ip: clientKey(request),
              ...(userAgent ? { userAgent } : {}),
              metadata: {
                dryRun: result.dryRun,
                seats: checkoutRequest.seats,
                tier: checkoutRequest.tier,
              },
            });
          }
          response.writeHead(303, {
            'cache-control': 'no-store',
            location: result.url,
          });
          response.end();
        } catch (error) {
          if (error instanceof BillingWebhookError) {
            sendHtml(response, error.status, hostedCheckoutHtml({
              request: checkoutRequest,
              priceConfigured: true,
              status: 'stripe-error',
              stripeError: error.code,
            }));
            return;
          }
          throw error;
        }
        return;
      }
      if (request.method === 'POST' && url.pathname === '/v1/billing/checkout-session') {
        const context = await authenticateRequest(headers, requestAuthOptions);
        // Tenant-scoped rate limit. Per-tenant key so a single abusive tenant
        // can't deny Stripe Checkout to the rest of the platform.
        const billingDecision = billingRateLimiter.reserve(`checkout:${context.tenantId ?? clientKey(request)}`);
        if (!billingDecision.allowed) {
          sendRateLimited(response, billingDecision);
          return;
        }
        const body = await readJsonWithLimit(request, configuredMaxPayloadBytes) as Partial<BillingCheckoutSessionInput>;
        const tier = body.tier;
        if (tier !== 'indie' && tier !== 'studio') {
          sendJson(response, 400, { error: 'unsupported_tier' });
          return;
        }
        if (!body.successUrl || !body.cancelUrl) {
          sendJson(response, 400, { error: 'successUrl_and_cancelUrl_required' });
          return;
        }
        const priceId = options.billingPriceIds?.[tier]
          ?? (tier === 'indie' ? process.env.STRIPE_PRICE_INDIE : process.env.STRIPE_PRICE_STUDIO);
        if (!priceId) {
          sendJson(response, 503, { error: 'stripe_price_not_configured' });
          return;
        }
        const apiKey = options.stripeApiKey ?? process.env.STRIPE_API_KEY;
        const client = options.billingApiClient ?? new LiveBillingApiClient({
          ...(apiKey ? { apiKey } : {}),
        });
        const tenantId = context.tenantId ?? 'unknown-tenant';
        try {
          const result = await client.createCheckoutSession({
            tenantId,
            tier,
            ...(typeof body.seats === 'number' ? { seats: body.seats } : {}),
            successUrl: body.successUrl,
            cancelUrl: body.cancelUrl,
            ...(body.customerId ? { customerId: body.customerId } : {}),
            ...(body.customerEmail ? { customerEmail: body.customerEmail } : {}),
            priceId,
          });
          sendJson(response, 200, { url: result.url, id: result.id, dryRun: result.dryRun });
        } catch (error) {
          if (error instanceof BillingWebhookError) {
            sendJson(response, error.status, { error: error.code, message: error.message });
            return;
          }
          throw error;
        }
        return;
      }
      if (request.method === 'POST' && url.pathname === '/v1/billing/portal-session') {
        const context = await authenticateRequest(headers, requestAuthOptions);
        const portalDecision = billingRateLimiter.reserve(`portal:${context.tenantId ?? clientKey(request)}`);
        if (!portalDecision.allowed) {
          sendRateLimited(response, portalDecision);
          return;
        }
        const body = await readJsonWithLimit(request, configuredMaxPayloadBytes) as Partial<BillingPortalSessionInput>;
        if (!body.customerId || !body.returnUrl) {
          sendJson(response, 400, { error: 'customerId_and_returnUrl_required' });
          return;
        }
        const apiKey = options.stripeApiKey ?? process.env.STRIPE_API_KEY;
        const client = options.billingApiClient ?? new LiveBillingApiClient({
          ...(apiKey ? { apiKey } : {}),
        });
        try {
          const result = await client.createPortalSession({
            tenantId: context.tenantId ?? 'unknown-tenant',
            customerId: body.customerId,
            returnUrl: body.returnUrl,
          });
          sendJson(response, 200, { url: result.url, id: result.id, dryRun: result.dryRun });
        } catch (error) {
          if (error instanceof BillingWebhookError) {
            sendJson(response, error.status, { error: error.code, message: error.message });
            return;
          }
          throw error;
        }
        return;
      }
      if (request.method === 'GET' && url.pathname === '/v1/billing/usage-summary') {
        const context = await authenticateRequest(headers, requestAuthOptions)
          .then((ctx) => ({ ...ctx, requestId }));
        const tier = context.tier;
        const genLimit = TIER_GENERATION_LIMITS[tier] ?? 0;
        const genUsed = await characterMetering.getMonthlyUsage(context.tenantId);
        const genRemaining = genLimit === null ? null : Math.max(0, (genLimit ?? 0) - genUsed);
        const resetsAt = `${nextPeriodStart()}T00:00:00Z`;

        // Token usage snapshot via billing ledger when available.
        let inputUsed = 0;
        let outputUsed = 0;
        let inputLimit = PLAN_METERING[tier].includedInputTokens;
        let outputLimit = PLAN_METERING[tier].includedOutputTokens;
        if (billingLedger) {
          try {
            const now = new Date();
            const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
            const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
            const sink = new FileUsageSink(billingLedger);
            const snapshot = await sink.readMonthlyUsageSnapshot({
              tenantId: context.tenantId,
              periodStart,
              periodEnd,
            });
            inputUsed = snapshot.inputTokens;
            outputUsed = snapshot.outputTokens;
          } catch {
            // Non-fatal: return 0 if ledger is unavailable.
          }
        }

        sendJson(response, 200, {
          tier,
          character_generations: {
            used: genUsed,
            limit: genLimit,
            remaining: genRemaining,
            resets_at: resetsAt,
          },
          inference_tokens: {
            input_used: inputUsed,
            output_used: outputUsed,
            input_limit: inputLimit,
            output_limit: outputLimit,
          },
        });
        return;
      }
      if (request.method === 'GET' && url.pathname === '/v1/billing/checkout-readiness') {
        const authorization = await authorizeAdmin(headers, {
          token: options.billingAdminToken ?? process.env.GREYBOX_BILLING_ADMIN_TOKEN,
          roles: ['billing-admin'],
          scopes: ['billing:read'],
          workosVerifier,
          tenantStore,
          workosGroupRoleMap,
        });
        if (!authorization) {
          sendJson(response, 401, { error: 'billing_admin_required' });
          return;
        }
        const report = buildCheckoutReadinessReport({
          stripeWebhookSecret: options.stripeWebhookSecret ?? process.env.STRIPE_WEBHOOK_SECRET,
          stripeWebhookEvents: options.stripeWebhookEvents ?? stripeWebhookEventsFromEnv(billingCheckoutRuntimeEnv),
          requireStripeWebhookEvents: isHostedProductionEnv(billingCheckoutRuntimeEnv),
          marketplaceUrl: options.marketplaceUrl ?? process.env.GREYBOX_MARKETPLACE_URL,
          marketplaceAdminToken: options.marketplaceAdminToken ?? process.env.GREYBOX_MARKETPLACE_ADMIN_TOKEN,
          auditLogConfigured: Boolean(auditLog),
        });
        sendJson(response, report.ready ? 200 : 503, report);
        return;
      }
      if (request.method === 'GET' && url.pathname === '/v1/billing/marketplace-report') {
        const authorization = await authorizeAdmin(headers, {
          token: options.billingAdminToken ?? process.env.GREYBOX_BILLING_ADMIN_TOKEN,
          roles: ['billing-admin'],
          scopes: ['billing:read'],
          workosVerifier,
          tenantStore,
          workosGroupRoleMap,
        });
        if (!authorization) {
          sendJson(response, 401, { error: 'billing_admin_required' });
          return;
        }
        const marketplaceUrl = cleanMarketplaceUrl(options.marketplaceUrl ?? process.env.GREYBOX_MARKETPLACE_URL);
        const marketplaceAdminToken = (options.marketplaceAdminToken ?? process.env.GREYBOX_MARKETPLACE_ADMIN_TOKEN)?.trim();
        if (!marketplaceUrl || !marketplaceAdminToken) {
          sendJson(response, 503, { error: 'marketplace_report_forwarding_not_configured' });
          return;
        }
        let reportRequest: ReturnType<typeof marketplaceReportProxyRequest>;
        try {
          reportRequest = marketplaceReportProxyRequest(url);
        } catch (error) {
          sendJson(response, 400, { error: error instanceof Error ? error.message : 'invalid_marketplace_report_request' });
          return;
        }
        const upstream = await (options.marketplaceReportFetch ?? fetch)(`${marketplaceUrl}${reportRequest.upstreamPath}`, {
          method: 'GET',
          headers: {
            authorization: `Bearer ${marketplaceAdminToken}`,
          },
        });
        if (!upstream.ok) {
          sendJson(response, 502, {
            error: 'marketplace_report_forward_failed',
            upstreamStatus: upstream.status,
          });
          return;
        }
        const body = await upstream.text();
        await auditLog?.append({
          id: auditId('audit'),
          tenantId: 'marketplace',
          actorId: authorization.actorId,
          actorType: authorization.actorType,
          action: 'billing.marketplace_report_exported',
          targetType: 'marketplace-report',
          targetId: reportRequest.reportName,
          createdAt: new Date().toISOString(),
          ip: requestIp(request, headers),
          userAgent: headers.get('user-agent') ?? undefined,
          metadata: {
            report: reportRequest.reportName,
            format: reportRequest.format,
            upstreamStatus: upstream.status,
          },
        });
        sendText(
          response,
          200,
          body,
          reportRequest.format === 'csv' ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8',
        );
        return;
      }
      if (request.method === 'POST' && url.pathname === '/v1/billing/webhook') {
        try {
          const result = await handleStripeWebhook({
            rawBody: await readRawBody(request),
            signatureHeader: headers.get('stripe-signature'),
            webhookSecret: options.stripeWebhookSecret ?? process.env.STRIPE_WEBHOOK_SECRET,
            marketplaceUrl: options.marketplaceUrl ?? process.env.GREYBOX_MARKETPLACE_URL,
            marketplaceAdminToken: options.marketplaceAdminToken ?? process.env.GREYBOX_MARKETPLACE_ADMIN_TOKEN,
            fetchFn: options.marketplaceFetch,
            requestId,
          });
          if (result.eventType === 'checkout.session.completed' && result.forwarded) {
            await auditLog?.append({
              id: auditId('audit'),
              tenantId: 'marketplace',
              actorId: 'stripe:webhook',
              actorType: 'system',
              action: 'billing.checkout_fulfilled',
              targetType: 'stripe-checkout-session',
              targetId: result.stripeObjectId ?? result.eventId,
              createdAt: new Date().toISOString(),
              ip: requestIp(request, headers),
              userAgent: headers.get('user-agent') ?? undefined,
              metadata: {
                stripeEventId: result.eventId,
                eventType: result.eventType,
                forwarded: result.forwarded,
                marketplaceStatus: result.marketplaceStatus,
                idempotent: result.idempotent ?? false,
              },
            });
          }
          if (result.eventType !== 'checkout.session.completed' && result.forwarded) {
            await auditLog?.append({
              id: auditId('audit'),
              tenantId: 'marketplace',
              actorId: 'stripe:webhook',
              actorType: 'system',
              action: 'billing.marketplace_stripe_event_forwarded',
              targetType: 'stripe-marketplace-event',
              targetId: result.stripeObjectId ?? result.eventId,
              createdAt: new Date().toISOString(),
              ip: requestIp(request, headers),
              userAgent: headers.get('user-agent') ?? undefined,
              metadata: {
                stripeEventId: result.eventId,
                eventType: result.eventType,
                forwarded: result.forwarded,
                marketplaceStatus: result.marketplaceStatus,
                idempotent: result.idempotent ?? false,
              },
            });
          }
          sendJson(response, 200, result);
        } catch (error) {
          if (error instanceof BillingWebhookError) {
            sendJson(response, error.status, { error: error.code });
            return;
          }
          throw error;
        }
        return;
      }
      // --- Razorpay routes -------------------------------------------------
      if (request.method === 'POST' && url.pathname === '/v1/billing/razorpay/create-subscription') {
        const context = await authenticateRequest(headers, requestAuthOptions);
        const billingDecision = billingRateLimiter.reserve(`razorpay-sub:${context.tenantId ?? clientKey(request)}`);
        if (!billingDecision.allowed) {
          sendRateLimited(response, billingDecision);
          return;
        }
        const body = await readJson(request) as Partial<{ tier: string; customerEmail?: string; customerContact?: string }>;
        const tier = body.tier;
        if (tier !== 'indie' && tier !== 'studio') {
          sendJson(response, 400, { error: 'unsupported_tier' });
          return;
        }
        const planId = razorpayPlanIdFromEnv(tier);
        if (!planId) {
          sendJson(response, 503, { error: 'razorpay_plan_not_configured' });
          return;
        }
        try {
          const result = await createRazorpaySubscription(
            {
              tenantId: context.tenantId,
              tier,
              planId,
              ...(body.customerEmail ? { customerEmail: body.customerEmail } : {}),
              ...(body.customerContact ? { customerContact: body.customerContact } : {}),
            },
            {
              keyId: process.env.RAZORPAY_KEY_ID,
              keySecret: process.env.RAZORPAY_KEY_SECRET,
            },
          );
          sendJson(response, 200, result);
        } catch (error) {
          if (error instanceof RazorpayBillingError) {
            sendJson(response, error.status, { error: error.code, message: error.message });
            return;
          }
          throw error;
        }
        return;
      }
      if (request.method === 'POST' && url.pathname === '/v1/billing/razorpay/verify-payment') {
        const context = await authenticateRequest(headers, requestAuthOptions);
        const billingDecision = billingRateLimiter.reserve(`razorpay-verify:${context.tenantId ?? clientKey(request)}`);
        if (!billingDecision.allowed) {
          sendRateLimited(response, billingDecision);
          return;
        }
        const body = await readJson(request) as Partial<{
          razorpay_payment_id: string;
          razorpay_subscription_id: string;
          razorpay_signature: string;
          tier: string;
        }>;
        const tier = body.tier;
        if (tier !== 'indie' && tier !== 'studio') {
          sendJson(response, 400, { error: 'unsupported_tier' });
          return;
        }
        try {
          const result = processRazorpayVerifyPayment({
            tenantId: context.tenantId,
            tier,
            razorpay_payment_id: body.razorpay_payment_id ?? '',
            razorpay_subscription_id: body.razorpay_subscription_id ?? '',
            razorpay_signature: body.razorpay_signature ?? '',
            keySecret: process.env.RAZORPAY_KEY_SECRET,
          });
          await auditLog?.append({
            id: auditId('audit'),
            tenantId: context.tenantId,
            actorId: context.userId,
            actorType: 'user',
            action: 'billing.checkout_session_created',
            targetType: 'razorpay-subscription',
            targetId: result.subscriptionId,
            createdAt: new Date().toISOString(),
            ip: requestIp(request, headers),
            userAgent: headers.get('user-agent') ?? undefined,
            metadata: {
              provider: 'razorpay',
              tier,
              paymentId: result.paymentId,
            },
          });
          sendJson(response, 200, result);
        } catch (error) {
          if (error instanceof RazorpayBillingError) {
            sendJson(response, error.status, { error: error.code, message: error.message });
            return;
          }
          throw error;
        }
        return;
      }
      if (request.method === 'POST' && url.pathname === '/v1/billing/webhook/razorpay') {
        try {
          const result = await handleRazorpayWebhook({
            rawBody: await readRawBody(request),
            signatureHeader: headers.get('x-razorpay-signature'),
            webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET,
            requestId,
          });
          await auditLog?.append({
            id: auditId('audit'),
            tenantId: result.tenantId ?? 'razorpay',
            actorId: 'razorpay:webhook',
            actorType: 'system',
            action: 'billing.checkout_fulfilled',
            targetType: 'razorpay-subscription',
            targetId: result.subscriptionId ?? result.eventId,
            createdAt: new Date().toISOString(),
            ip: requestIp(request, headers),
            userAgent: headers.get('user-agent') ?? undefined,
            metadata: {
              provider: 'razorpay',
              eventId: result.eventId,
              eventType: result.eventType,
            },
          });
          sendJson(response, 200, result);
        } catch (error) {
          if (error instanceof RazorpayBillingError) {
            sendJson(response, error.status, { error: error.code });
            return;
          }
          throw error;
        }
        return;
      }
      if (request.method === 'GET' && url.pathname === '/v1/billing/razorpay/subscription-status') {
        const context = await authenticateRequest(headers, requestAuthOptions);
        const tenant = tenantStore.get(context.tenantId);
        const subscriptionId = tenant?.billing?.razorpaySubscriptionId;

        if (subscriptionId && process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
          try {
            const live = await getRazorpaySubscriptionLive(subscriptionId, {
              keyId: process.env.RAZORPAY_KEY_ID,
              keySecret: process.env.RAZORPAY_KEY_SECRET,
            });
            sendJson(response, 200, {
              tenantId: context.tenantId,
              subscriptionId,
              status: live.status,
              tier: context.tier,
              provider: 'razorpay',
              live: true,
            });
          } catch {
            const result = buildRazorpaySubscriptionStatus({
              tenantId: context.tenantId,
              tier: context.tier,
              subscriptionId,
            });
            sendJson(response, 200, { ...result, live: false });
          }
        } else {
          const result = buildRazorpaySubscriptionStatus({
            tenantId: context.tenantId,
            tier: context.tier,
            subscriptionId,
          });
          sendJson(response, 200, { ...result, live: false });
        }
        return;
      }
      if (request.method === 'GET' && url.pathname === '/v1/billing/razorpay/portal-url') {
        const context = await authenticateRequest(headers, requestAuthOptions);
        const portalDecision = billingRateLimiter.reserve(`razorpay-portal:${context.tenantId ?? clientKey(request)}`);
        if (!portalDecision.allowed) {
          sendRateLimited(response, portalDecision);
          return;
        }
        const tenant = tenantStore.get(context.tenantId);
        const result = buildRazorpayPortalUrl({
          tenantId: context.tenantId,
          subscriptionId: tenant?.billing?.razorpaySubscriptionId,
          keyId: process.env.RAZORPAY_KEY_ID,
        });
        sendJson(response, 200, result);
        return;
      }
      // --- Dodo Payments routes -------------------------------------------
      if (request.method === 'POST' && url.pathname === '/v1/billing/dodo/create-checkout') {
        const context = await authenticateRequest(headers, requestAuthOptions);
        const billingDecision = billingRateLimiter.reserve(`dodo-checkout:${context.tenantId ?? clientKey(request)}`);
        if (!billingDecision.allowed) {
          sendRateLimited(response, billingDecision);
          return;
        }
        const body = await readJson(request) as Partial<{ tier: string; currency?: string; successUrl?: string; cancelUrl?: string; customerEmail?: string }>;
        const tier = body.tier;
        if (tier !== 'indie' && tier !== 'studio') {
          sendJson(response, 400, { error: 'unsupported_tier' });
          return;
        }
        const productId = dodoProductIdFromEnv(tier);
        if (!productId) {
          sendJson(response, 503, { error: 'dodo_product_not_configured' });
          return;
        }
        try {
          const result = await createDodoCheckout(
            {
              tenantId: context.tenantId,
              tier,
              productId,
              ...(body.currency ? { currency: body.currency } : {}),
              ...(body.successUrl ? { successUrl: body.successUrl } : {}),
              ...(body.cancelUrl ? { cancelUrl: body.cancelUrl } : {}),
              ...(body.customerEmail ? { customerEmail: body.customerEmail } : {}),
            },
            { apiKey: process.env.DODO_API_KEY },
          );
          sendJson(response, 200, result);
        } catch (error) {
          if (error instanceof DodoBillingError) {
            sendJson(response, error.status, { error: error.code, message: error.message });
            return;
          }
          throw error;
        }
        return;
      }
      if (request.method === 'POST' && url.pathname === '/v1/billing/webhook/dodo') {
        try {
          const result = await handleDodoWebhook({
            rawBody: await readRawBody(request),
            signatureHeader: headers.get('dodo-signature'),
            webhookSecret: process.env.DODO_WEBHOOK_SECRET,
            requestId,
          });
          // Token quotas per tier (matches tenants.ts includedTokens)
          const DODO_TIER_TOKENS: Record<string, { monthlyInputTokensIncluded: number; monthlyOutputTokensIncluded: number }> = {
            indie: { monthlyInputTokensIncluded: 1_000_000, monthlyOutputTokensIncluded: 200_000 },
            studio: { monthlyInputTokensIncluded: 5_000_000, monthlyOutputTokensIncluded: 1_000_000 },
            free: { monthlyInputTokensIncluded: 0, monthlyOutputTokensIncluded: 0 },
          };
          if (result.eventType === 'payment.succeeded' || result.eventType === 'subscription.active') {
            const tid = result.tenantId;
            const rawTier = result.tier;
            if (tid && (rawTier === 'indie' || rawTier === 'studio')) {
              const existing = tenantStore.get(tid);
              if (existing) {
                tenantStore.upsert({
                  ...existing,
                  tier: rawTier,
                  ...DODO_TIER_TOKENS[rawTier],
                  billing: {
                    ...existing.billing,
                    billingProvider: 'dodo',
                    dodoSubscriptionId: result.subscriptionId ?? existing.billing?.dodoSubscriptionId,
                  },
                });
              }
            }
          } else if (result.eventType === 'subscription.cancelled') {
            const tid = result.tenantId;
            if (tid) {
              const existing = tenantStore.get(tid);
              if (existing) {
                tenantStore.upsert({
                  ...existing,
                  tier: 'free',
                  ...DODO_TIER_TOKENS.free,
                });
              }
            }
          }
          const isRenewal = result.eventType === 'subscription.renewed';
          await auditLog?.append({
            id: auditId('audit'),
            tenantId: result.tenantId ?? 'dodo',
            actorId: 'dodo:webhook',
            actorType: 'system',
            action: isRenewal ? 'billing.invoice_job_run' : 'billing.checkout_fulfilled',
            targetType: 'dodo-subscription',
            targetId: result.subscriptionId ?? result.eventId,
            createdAt: new Date().toISOString(),
            ip: requestIp(request, headers),
            userAgent: headers.get('user-agent') ?? undefined,
            metadata: {
              provider: 'dodo',
              eventId: result.eventId,
              eventType: result.eventType,
            },
          });
          sendJson(response, 200, result);
        } catch (error) {
          if (error instanceof DodoBillingError) {
            sendJson(response, error.status, { error: error.code });
            return;
          }
          throw error;
        }
        return;
      }
      if (request.method === 'GET' && url.pathname === '/v1/billing/dodo/customer-portal') {
        const context = await authenticateRequest(headers, requestAuthOptions);
        const portalDecision = billingRateLimiter.reserve(`dodo-portal:${context.tenantId ?? clientKey(request)}`);
        if (!portalDecision.allowed) {
          sendRateLimited(response, portalDecision);
          return;
        }
        const tenant = tenantStore.get(context.tenantId);
        const returnUrl = url.searchParams.get('returnUrl') ?? undefined;
        try {
          const result = await getDodoCustomerPortal(
            {
              tenantId: context.tenantId,
              customerId: tenant?.billing?.dodoSubscriptionId,
              ...(returnUrl ? { returnUrl } : {}),
            },
            { apiKey: process.env.DODO_API_KEY },
          );
          sendJson(response, 200, result);
        } catch (error) {
          if (error instanceof DodoBillingError) {
            sendJson(response, error.status, { error: error.code, message: error.message });
            return;
          }
          throw error;
        }
        return;
      }
      // --- LemonSqueezy routes ---------------------------------------------
      if (request.method === 'POST' && url.pathname === '/v1/billing/lemonsqueezy/create-checkout') {
        const context = await authenticateRequest(headers, requestAuthOptions);
        const billingDecision = billingRateLimiter.reserve(`ls-checkout:${context.tenantId ?? clientKey(request)}`);
        if (!billingDecision.allowed) {
          sendRateLimited(response, billingDecision);
          return;
        }
        const body = await readJson(request) as Partial<{ tier: string; successUrl?: string; cancelUrl?: string; customerEmail?: string }>;
        const tier = body.tier;
        if (tier !== 'indie' && tier !== 'studio') {
          sendJson(response, 400, { error: 'unsupported_tier' });
          return;
        }
        const variantId = lemonSqueezyVariantIdFromEnv(tier);
        if (!variantId) {
          sendJson(response, 503, { error: 'ls_variant_not_configured' });
          return;
        }
        const storeId = process.env.LEMON_SQUEEZY_STORE_ID?.trim() ?? '';
        try {
          const result = await createLemonSqueezyCheckout(
            {
              tenantId: context.tenantId,
              tier,
              storeId,
              variantId,
              ...(body.successUrl ? { successUrl: body.successUrl } : {}),
              ...(body.cancelUrl ? { cancelUrl: body.cancelUrl } : {}),
              ...(body.customerEmail ? { customerEmail: body.customerEmail } : {}),
            },
            { apiKey: process.env.LEMON_SQUEEZY_API_KEY },
          );
          sendJson(response, 200, result);
        } catch (error) {
          if (error instanceof LemonSqueezyBillingError) {
            sendJson(response, error.status, { error: error.code, message: error.message });
            return;
          }
          throw error;
        }
        return;
      }
      if (request.method === 'POST' && url.pathname === '/v1/billing/webhook/lemonsqueezy') {
        try {
          const result = await handleLemonSqueezyWebhook({
            rawBody: await readRawBody(request),
            signatureHeader: headers.get('x-signature'),
            webhookSecret: process.env.LEMON_SQUEEZY_WEBHOOK_SECRET,
          });
          await auditLog?.append({
            id: auditId('audit'),
            tenantId: result.tenantId ?? 'lemonsqueezy',
            actorId: 'lemonsqueezy:webhook',
            actorType: 'system',
            action: 'billing.checkout_fulfilled',
            targetType: 'lemonsqueezy-subscription',
            targetId: result.subscriptionId ?? result.eventId,
            createdAt: new Date().toISOString(),
            ip: requestIp(request, headers),
            userAgent: headers.get('user-agent') ?? undefined,
            metadata: {
              provider: 'lemonsqueezy',
              eventId: result.eventId,
              eventType: result.eventType,
            },
          });
          sendJson(response, 200, result);
        } catch (error) {
          if (error instanceof LemonSqueezyBillingError) {
            sendJson(response, error.status, { error: error.code });
            return;
          }
          throw error;
        }
        return;
      }
      if (request.method === 'GET' && url.pathname === '/v1/billing/lemonsqueezy/customer-portal') {
        const context = await authenticateRequest(headers, requestAuthOptions);
        const portalDecision = billingRateLimiter.reserve(`ls-portal:${context.tenantId ?? clientKey(request)}`);
        if (!portalDecision.allowed) {
          sendRateLimited(response, portalDecision);
          return;
        }
        const result = getLemonSqueezyCustomerPortalUrl({
          tenantId: context.tenantId,
          storeSubdomain: process.env.LEMON_SQUEEZY_STORE_SUBDOMAIN?.trim(),
        });
        sendJson(response, 200, result);
        return;
      }
      if (url.pathname.startsWith('/v1/scim/v2')) {
        const result = await handleScimRequest({
          method: request.method,
          url,
          headers,
          body: () => readJson(request),
          baseUrl: requestBaseUrl(headers, publicBaseUrl),
          ip: requestIp(request, headers),
          userAgent: headers.get('user-agent') ?? undefined,
        }, {
          store: scimStore,
          token: scimToken,
          tenantId: scimTenantId,
          auditLog,
        });
        if (result.status === 204) {
          response.writeHead(204, result.headers);
          response.end();
        } else {
          response.writeHead(result.status, {
            'content-type': 'application/scim+json; charset=utf-8',
            ...(result.headers ?? {}),
          });
          response.end(JSON.stringify(result.body ?? {}));
        }
        return;
      }
      if (request.method === 'GET' && url.pathname === '/v1/audit-log/export') {
        const adminToken = options.auditAdminToken
          ?? process.env.GREYBOX_AUDIT_ADMIN_TOKEN
          ?? options.billingAdminToken
          ?? process.env.GREYBOX_BILLING_ADMIN_TOKEN;
        const authorization = await authorizeAdmin(headers, {
          token: adminToken,
          roles: ['admin'],
          scopes: ['audit:read'],
          workosVerifier,
          tenantStore,
          workosGroupRoleMap,
        });
        if (!authorization) {
          sendJson(response, 401, { error: 'audit_admin_required' });
          return;
        }
        if (!auditLog) {
          sendJson(response, 503, { error: 'audit_log_not_configured' });
          return;
        }
        const entries = await auditLog.readEntries(auditFilterFromUrl(url));
        const format = url.searchParams.get('format') ?? 'csv';
        if (format === 'csv') {
          sendText(response, 200, exportAuditCsv(entries), 'text/csv; charset=utf-8');
          return;
        }
        if (format === 'splunk-json') {
          sendText(response, 200, exportAuditSplunkJson(entries), 'application/x-ndjson; charset=utf-8');
          return;
        }
        sendJson(response, 400, { error: 'unsupported_audit_export_format' });
        return;
      }
      if (request.method === 'GET' && url.pathname === '/v1/audit-log/verify') {
        const adminToken = options.auditAdminToken
          ?? process.env.GREYBOX_AUDIT_ADMIN_TOKEN
          ?? options.billingAdminToken
          ?? process.env.GREYBOX_BILLING_ADMIN_TOKEN;
        const authorization = await authorizeAdmin(headers, {
          token: adminToken,
          roles: ['admin'],
          scopes: ['audit:read'],
          workosVerifier,
          tenantStore,
          workosGroupRoleMap,
        });
        if (!authorization) {
          sendJson(response, 401, { error: 'audit_admin_required' });
          return;
        }
        if (!auditLog) {
          sendJson(response, 503, { error: 'audit_log_not_configured' });
          return;
        }
        sendJson(response, 200, {
          ...await auditLog.verify(auditFilterFromUrl(url)),
          scope: 'full-log-hash-chain',
        });
        return;
      }
      if (request.method === 'POST' && url.pathname === '/v1/billing/jobs/invoice') {
        const authorization = await authorizeAdmin(headers, {
          token: options.billingAdminToken ?? process.env.GREYBOX_BILLING_ADMIN_TOKEN,
          roles: ['billing-admin'],
          scopes: ['billing:write'],
          workosVerifier,
          tenantStore,
          workosGroupRoleMap,
        });
        if (!authorization) {
          sendJson(response, 401, { error: 'billing_admin_required' });
          return;
        }
        if (!billingLedger) {
          sendJson(response, 503, { error: 'billing_ledger_not_configured' });
          return;
        }
        const body = parseBillingInvoiceJobRequest(await readJson(request));
        const stripeApiKey = options.stripeApiKey ?? process.env.STRIPE_API_KEY;
        try {
          assertHostedProductionMeteringLive({
            env: billingMeteringRuntimeEnv,
            submitStripe: body.submitStripe ?? false,
            dryRun: body.dryRun,
            stripeApiKey,
          });
        } catch (error) {
          if (error instanceof HostedProductionMeteringError) {
            sendJson(response, error.status, { error: error.code, reasons: error.reasons });
            return;
          }
          throw error;
        }
        let result: Awaited<ReturnType<typeof runBillingInvoiceJob>>;
        try {
          result = await runBillingInvoiceJob(body, {
            ledger: billingLedger,
            stripeSubmitter: options.stripeSubmitter,
            stripeApiKey,
            now: options.billingInvoiceJobNow,
            tenantStore,
          });
        } catch (error) {
          if (error instanceof BillingInvoiceBillingIdentityError) {
            await auditLog?.append({
              id: auditId('audit'),
              tenantId: body.tenantId,
              actorId: authorization.actorId,
              actorType: authorization.actorType,
              action: 'billing.invoice_job_run',
              targetType: 'billing-period',
              targetId: `${body.tenantId}:${body.period.start}:${body.period.end}`,
              createdAt: new Date().toISOString(),
              ip: requestIp(request, headers),
              userAgent: headers.get('user-agent') ?? undefined,
              metadata: {
                tier: body.tier,
                dryRun: body.dryRun,
                submitStripe: body.submitStripe ?? false,
                status: 'failed',
                failureCode: error.code,
                reasons: error.reasons,
              },
            });
            sendJson(response, error.status, { error: error.code, reasons: error.reasons });
            return;
          }
          if (error instanceof BillingInvoicePeriodError) {
            await auditLog?.append({
              id: auditId('audit'),
              tenantId: body.tenantId,
              actorId: authorization.actorId,
              actorType: authorization.actorType,
              action: 'billing.invoice_job_run',
              targetType: 'billing-period',
              targetId: `${body.tenantId}:${body.period.start}:${body.period.end}`,
              createdAt: new Date().toISOString(),
              ip: requestIp(request, headers),
              userAgent: headers.get('user-agent') ?? undefined,
              metadata: {
                tier: body.tier,
                dryRun: body.dryRun,
                submitStripe: body.submitStripe ?? false,
                status: 'failed',
                failureCode: error.code,
                periodEnd: error.periodEnd,
              },
            });
            sendJson(response, error.status, {
              error: error.code,
              periodEnd: error.periodEnd,
              now: error.now,
            });
            return;
          }
          if (error instanceof BillingInvoiceJobError) {
            await auditLog?.append({
              id: auditId('audit'),
              tenantId: body.tenantId,
              actorId: authorization.actorId,
              actorType: authorization.actorType,
              action: 'billing.invoice_job_run',
              targetType: 'billing-period',
              targetId: `${body.tenantId}:${body.period.start}:${body.period.end}`,
              createdAt: new Date().toISOString(),
              ip: requestIp(request, headers),
              userAgent: headers.get('user-agent') ?? undefined,
              metadata: {
                tier: body.tier,
                dryRun: body.dryRun,
                submitStripe: body.submitStripe ?? false,
                status: 'failed',
                failureCode: error.code,
                failureCount: error.failures.length,
                failures: error.failures.map((failure) => ({
                  identifier: failure.identifier,
                  eventName: failure.eventName,
                  ...(failure.stripeRequestId ? { stripeRequestId: failure.stripeRequestId } : {}),
                })),
              },
            });
            sendJson(response, error.status, { error: error.code, failures: error.failures });
            return;
          }
          throw error;
        }
        await auditLog?.append({
          id: auditId('audit'),
          tenantId: body.tenantId,
          actorId: authorization.actorId,
          actorType: authorization.actorType,
          action: 'billing.invoice_job_run',
          targetType: 'billing-period',
          targetId: `${body.tenantId}:${body.period.start}:${body.period.end}`,
          createdAt: new Date().toISOString(),
          ip: requestIp(request, headers),
          userAgent: headers.get('user-agent') ?? undefined,
          metadata: {
            tier: body.tier,
            dryRun: result.dryRun,
            submitStripe: body.submitStripe ?? false,
            totalUsd: result.invoice.totalUsd,
            meterEventCount: result.meterEvents.length,
          },
        });
        sendJson(response, 200, result);
        return;
      }
      if (request.method === 'POST' && url.pathname === '/v1/chat/completions') {
        const context = {
          ...(await authenticateRequest(headers, requestAuthOptions)),
          requestId,
        };
        await enforceDataResidencyRuntimeForRoute({
          auditLog,
          headers,
          context,
          incoming: request,
          route: '/v1/chat/completions',
          tenantStore,
          env: options.dataResidencyEnv ?? process.env,
        });
        const body = await readJson(request) as OpenAiCompatibleChatRequest;
        const inferenceRequest = openAiCompatibleToInferenceRequest(body, context);
        const result = await service.run(inferenceRequest, context);
        await appendInferenceAudit({
          auditLog,
          context,
          request: inferenceRequest,
          result,
          headers,
          incoming: request,
          route: '/v1/chat/completions',
        });
        if (body.stream) {
          response.writeHead(200, {
            'content-type': 'text/event-stream; charset=utf-8',
            'cache-control': 'no-cache',
            connection: 'keep-alive',
          });
          response.end(encodeOpenAiCompatibleSse(result));
        } else {
          sendJson(response, 200, openAiCompatibleCompletionResponse(result));
        }
        return;
      }
      if (request.method === 'POST' && url.pathname === '/v1/inference') {
        const context = {
          ...(await authenticateRequest(headers, requestAuthOptions)),
          requestId,
        };
        {
          const genDecision = reserveGenerationQuota(context.tenantId);
          if (!genDecision.allowed) {
            sendRateLimited(response, genDecision);
            return;
          }
        }
        await enforceDataResidencyRuntimeForRoute({
          auditLog,
          headers,
          context,
          incoming: request,
          route: '/v1/inference',
          tenantStore,
          env: options.dataResidencyEnv ?? process.env,
        });
        const body = await readJson(request) as InferenceRequest;
        const result = await service.run(body, context);
        await appendInferenceAudit({
          auditLog,
          context,
          request: body,
          result,
          headers,
          incoming: request,
          route: '/v1/inference',
        });
        if (body.stream) {
          response.writeHead(200, {
            'content-type': 'text/event-stream; charset=utf-8',
            'cache-control': 'no-cache',
            connection: 'keep-alive',
          });
          response.end(encodeSse(toSseChunks(result)));
        } else {
          sendJson(response, 200, result);
        }
        return;
      }
      // --- Sprites route ---
      if (url.pathname === '/v1/sprites/generate' && request.method === 'POST') {
        const context = await authenticateRequest(headers, requestAuthOptions);
        const rateDecision = reserveGenerationQuota(context.tenantId);
        if (!rateDecision.allowed) {
          sendRateLimited(response, rateDecision);
          return;
        }
        await spriteMeteringEmitter.validateCanGenerate(context.tenantId, context.tier);
        const body = await readJson(request) as Partial<{ prompt: string; style?: string; negative_prompt?: string; seed?: number }>;
        if (!body.prompt || typeof body.prompt !== 'string' || !body.prompt.trim()) {
          sendJson(response, 400, { error: 'prompt_required' });
          return;
        }
        const gamePrompt = [
          '2D game sprite',
          body.prompt.trim(),
          body.style ? `${body.style} style` : '',
          'game asset, clean design',
        ].filter(Boolean).join(', ');
        try {
          await spriteMeteringEmitter.recordJobStart(`sprite-${requestId}`, context.tenantId, 'fal-ai');
          const result = await generateSprite(
            {
              prompt: gamePrompt,
              negativePrompt: body.negative_prompt ?? 'blurry, low quality, text, watermark',
              imageSize: 'square',
              numInferenceSteps: 4,
              ...(body.seed != null ? { seed: body.seed } : {}),
            },
            { apiKey: process.env.FAL_KEY },
          );
          await spriteMeteringEmitter.recordJobComplete(`sprite-${requestId}`, 1, 0.01);
          const remaining = await spriteMeteringEmitter.getRemainingGenerations(context.tenantId, context.tier);
          sendJson(response, 200, { imageUrl: result.imageUrl, width: result.width, height: result.height, seed: result.seed, remaining });
        } catch (err) {
          await spriteMeteringEmitter.recordJobFailed(`sprite-${requestId}`, String(err));
          if (err instanceof SpriteMeteringError) {
            sendJson(response, err.status, { error: err.code, message: err.message });
            return;
          }
          if (err instanceof FalAiError) {
            sendJson(response, err.status, { error: err.code, message: err.message });
            return;
          }
          throw err;
        }
        return;
      }
      if (url.pathname === '/v1/characters' || url.pathname.startsWith('/v1/characters/')) {
        if (request.method === 'POST') {
          // Resolve auth first so we have a tenantId for the generation quota bucket.
          // handleCharacterRoute will re-authenticate internally; this is a shallow
          // pre-flight to get the tenant key only.
          const preAuthContext = await authenticateRequest(headers, requestAuthOptions);
          const genDecision = reserveGenerationQuota(preAuthContext.tenantId);
          if (!genDecision.allowed) {
            sendRateLimited(response, genDecision);
            return;
          }
        }
        const routed = await handleCharacterRoute(
          {
            method: request.method ?? 'GET',
            url,
            headers,
            readJson: () => readJson(request),
          },
          characterService,
          (incomingHeaders) => authenticateRequest(incomingHeaders, requestAuthOptions)
            .then((context) => ({ ...context, requestId })),
        );
        if (routed) {
          sendJson(response, routed.status, routed.body);
          return;
        }
      }
      sendJson(response, 404, { error: 'not_found' });
    } catch (error) {
      if (error instanceof PayloadTooLargeError) {
        sendJson(response, 413, { error: 'payload_too_large', maxBytes: error.maxBytes });
        return;
      }
      const isExpectedError = error instanceof AuthenticationError || error instanceof LicenseValidationError || error instanceof ProModuleSecretError || error instanceof PrivacyRequestError || error instanceof SecurityIncidentError || error instanceof ModelTrainingConsentError || error instanceof RetentionError || error instanceof PrivacyGovernanceError || error instanceof PrivacyDisclosureError || error instanceof PrivateNetworkReadinessError || error instanceof DataResidencyRuntimeError;
      const status = isExpectedError ? (error as { status: number }).status : 400;
      // Only forward truly unexpected errors (status 500-class or unknown) to telemetry.
      // 4xx-class expected errors are domain signal, not noise we want to page on.
      if (sentry && (status >= 500 || !isExpectedError)) {
        try {
          sentry.captureException(error, {
            kind: 'http_handler',
            method: request.method ?? 'UNKNOWN',
            path: (request.url ?? '/').split('?')[0],
          });
        } catch {
          // Never let telemetry failures shadow the original error.
        }
      }
      sendJson(response, status, { error: publicErrorCode(error) });
    }
  });
}

function parsePositiveIntEnv(value: string | undefined, defaultValue: number): number {
  if (!value) return defaultValue;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

function publicErrorCode(error: unknown): string {
  if (error instanceof PrivacyRequestError || error instanceof SecurityIncidentError || error instanceof ModelTrainingConsentError || error instanceof RetentionError || error instanceof PrivacyGovernanceError || error instanceof PrivacyDisclosureError || error instanceof PrivateNetworkReadinessError || error instanceof DataResidencyRuntimeError) {
    return error.code;
  }
  if (error instanceof Error) return redactPiiText(error.message);
  return 'unknown_error';
}
