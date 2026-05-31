// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { proModuleBundleSourceProofFromEnv } from '../routers/pro-modules.js';
import {
  buildCheckoutReadinessReport,
  stripeWebhookEventsFromEnv,
} from '../routers/billing.js';

export type BusinessModelProofStatus = 'pass' | 'warn' | 'fail';

export interface ManagedInferenceProofInput {
  arrUsd?: number;
  meteredBillingAudited?: boolean;
  providerReconciliationOk?: boolean;
  stripeMeterEvents?: number;
  grossMargin?: number;
}

export interface ProModuleProofInput {
  revenueShare?: number;
  shippedModules?: number;
  paidPurchases?: number;
  signedBundles?: number;
  publishedObjects?: number;
  attachRateBps?: number;
  multiModuleAttachRateBps?: number;
  studioEnterpriseAttachRateBps?: number;
  expansionArrUsd?: number;
  proChurnedCustomerRateBps?: number;
  modulesWithActiveCustomers?: number;
  betaValidatedModules?: number;
  betaDesignPartners?: number;
  betaReviewedExports?: number;
  betaAcceptedDiffRateBps?: number;
  attachReady?: boolean;
  betaReady?: boolean;
  loaderRejectsUnsigned?: boolean;
  publishProductionReady?: boolean;
  publishHandoffReady?: boolean;
  publishReleaseMatchReady?: boolean;
  sourceBusinessModelReady?: boolean;
}

export interface MarketplaceProofInput {
  monthlyGmvUsd?: number;
  activeSellers?: number;
  uniqueBuyers?: number;
  platformReady?: boolean;
  sourceBusinessModelReady?: boolean;
  checkoutOrderShareBps?: number;
  checkoutGmvShareBps?: number;
  settlementReady?: boolean;
  settlementPayoutShareBps?: number;
  topCreatorGmvShareBps?: number;
  topBuyerGmvShareBps?: number;
  payoutBlockers?: number;
  taxBlockers?: number;
  reconciliationReady?: boolean;
  reconciliationIssues?: number;
  riskReserveReady?: boolean;
  reserveShortfallCents?: number;
  stripeEventForwardingReady?: boolean;
  forwardedStripeEvents?: number;
}

export interface PlaytestProofInput {
  activePayingStudios?: number;
  personasInProduction?: number;
  acceptedTuningSuggestions?: number;
  completedRuns?: number;
  qaSavingsUsd?: number;
  personaProductionReady?: boolean;
  sourceBusinessModelReady?: boolean;
}

export interface BusinessModelProofInput {
  managedInference?: ManagedInferenceProofInput;
  proModules?: ProModuleProofInput;
  marketplace?: MarketplaceProofInput;
  playtest?: PlaytestProofInput;
}

export interface BusinessModelProofMetrics {
  managedInference: Required<ManagedInferenceProofInput>;
  proModules: Required<ProModuleProofInput>;
  marketplace: Required<MarketplaceProofInput>;
  playtest: Required<PlaytestProofInput>;
}

export interface BusinessModelProofCheck {
  id: string;
  label: string;
  status: BusinessModelProofStatus;
  current: string;
  target: string;
  owner: string;
  detail: string;
  evidence: string[];
  remediation?: string;
}

export interface BusinessModelProofReport {
  generatedAt: string;
  disclaimer: string;
  targets: {
    managedInferenceArrUsd: number;
    managedInferenceGrossMargin: number;
    proModuleRevenueShare: number;
    shippedProModules: number;
    publishedProObjects: number;
    proModuleAttachRateBps: number;
    proModuleMultiModuleAttachRateBps: number;
    proModuleStudioEnterpriseAttachRateBps: number;
    proModuleExpansionArrUsd: number;
    proModuleMaxChurnedCustomerRateBps: number;
    proModuleActiveCustomerModules: number;
    proModuleBetaValidatedModules: number;
    proModuleBetaDesignPartners: number;
    proModuleBetaReviewedExports: number;
    proModuleMinBetaAcceptedDiffRateBps: number;
    marketplaceMonthlyGmvUsd: number;
    marketplaceActiveSellers: number;
    marketplaceUniqueBuyers: number;
    checkoutOrderShareBps: number;
    checkoutGmvShareBps: number;
    marketplaceSettlementPayoutShareBps: number;
    marketplaceMaximumTopCreatorGmvShareBps: number;
    marketplaceMaximumTopBuyerGmvShareBps: number;
    marketplaceForwardedStripeEvents: number;
    activePlaytestStudios: number;
    playtestPersonas: number;
    playtestQaSavingsUsd: number;
  };
  metrics: BusinessModelProofMetrics;
  summary: {
    status: BusinessModelProofStatus;
    checks: number;
    pass: number;
    warn: number;
    fail: number;
    managedInferenceArrUsd: number;
    managedInferenceReady: boolean;
    proModuleRevenueShare: number;
    proModuleAttachRateBps: number;
    proModuleExpansionArrUsd: number;
    proModuleBetaValidatedModules: number;
    proModuleBetaDesignPartners: number;
    proModuleBetaReviewedExports: number;
    proModuleBetaAcceptedDiffRateBps: number;
    proModuleReady: boolean;
    marketplaceMonthlyGmvUsd: number;
    marketplaceUniqueBuyers: number;
    marketplaceTopCreatorGmvShareBps: number;
    marketplaceTopBuyerGmvShareBps: number;
    marketplaceReady: boolean;
    marketplaceReconciliationReady: boolean;
    marketplaceReconciliationIssues: number;
    marketplaceSettlementReady: boolean;
    marketplaceSettlementPayoutShareBps: number;
    marketplaceRiskReserveReady: boolean;
    marketplaceReserveShortfallCents: number;
    marketplaceStripeEventForwardingReady: boolean;
    marketplaceForwardedStripeEvents: number;
    playtestActiveStudios: number;
    playtestQaSavingsUsd: number;
    playtestReady: boolean;
    acquisitionBusinessModelReady: boolean;
  };
  checks: BusinessModelProofCheck[];
}

const targets = {
  managedInferenceArrUsd: 1_000_000,
  managedInferenceGrossMargin: 0.5,
  proModuleRevenueShare: 0.3,
  shippedProModules: 12,
  publishedProObjects: 13,
  proModuleAttachRateBps: 4_000,
  proModuleMultiModuleAttachRateBps: 1_500,
  proModuleStudioEnterpriseAttachRateBps: 6_000,
  proModuleExpansionArrUsd: 2_500,
  proModuleMaxChurnedCustomerRateBps: 1_000,
  proModuleActiveCustomerModules: 5,
  proModuleBetaValidatedModules: 5,
  proModuleBetaDesignPartners: 10,
  proModuleBetaReviewedExports: 10,
  proModuleMinBetaAcceptedDiffRateBps: 5_000,
  marketplaceMonthlyGmvUsd: 250_000,
  marketplaceActiveSellers: 200,
  marketplaceUniqueBuyers: 200,
  checkoutOrderShareBps: 9_000,
  checkoutGmvShareBps: 9_000,
  marketplaceSettlementPayoutShareBps: 9_000,
  marketplaceMaximumTopCreatorGmvShareBps: 2_500,
  marketplaceMaximumTopBuyerGmvShareBps: 2_500,
  marketplaceForwardedStripeEvents: 4,
  activePlaytestStudios: 100,
  playtestPersonas: 10,
  playtestQaSavingsUsd: 500_000,
} as const;

export function businessModelProofFromEnv(
  env: Record<string, string | undefined> = process.env,
): BusinessModelProofInput {
  const raw = env.GREYBOX_BUSINESS_MODEL_PROOF_JSON;
  let parsed: Record<string, unknown> = {};
  if (raw?.trim()) {
    try {
      const candidate = JSON.parse(raw);
      if (isRecord(candidate)) parsed = candidate;
    } catch {
      parsed = {};
    }
  }
  const proModules = mergeProofInput(
    isRecord(parsed.proModules) ? proModulesFromRecord(parsed.proModules) : {},
    isRecord(parsed.source) && isProModuleSourceRecord(parsed.source) ? proModuleSourceFromRecord(parsed.source) : {},
    proModuleSourceProofFromEnv(env),
  );
  const marketplace = mergeProofInput(
    isRecord(parsed.marketplace) ? marketplaceFromRecord(parsed.marketplace) : {},
    isRecord(parsed.source) && isMarketplaceSourceRecord(parsed.source) ? marketplaceSourceFromRecord(parsed.source) : {},
    marketplaceSourceProofFromEnv(env),
  );
  const playtest = playtestProofInputFromParsed(parsed);
  return {
    ...(isRecord(parsed.managedInference)
      ? { managedInference: managedInferenceFromRecord(parsed.managedInference) }
      : {}),
    ...(hasProofFields(proModules) ? { proModules } : {}),
    ...(hasProofFields(marketplace) ? { marketplace } : {}),
    ...(hasProofFields(playtest) ? { playtest } : {}),
  };
}

function playtestProofInputFromParsed(parsed: Record<string, unknown>): PlaytestProofInput {
  return mergeProofInput(
    isRecord(parsed.playtest) ? playtestFromRecord(parsed.playtest) : {},
    isRecord(parsed.source) && isPlaytestSourceRecord(parsed.source) ? playtestSourceFromRecord(parsed.source) : {},
  );
}

function proModuleSourceProofFromEnv(env: Record<string, string | undefined>): ProModuleProofInput {
  const sourceProof = proModuleBundleSourceProofFromEnv(env);
  if (!sourceProof) return {};
  return {
    shippedModules: sourceProof.shippedModules,
    signedBundles: sourceProof.signedBundles,
    ...(sourceProof.publishedObjects === undefined ? {} : { publishedObjects: sourceProof.publishedObjects }),
    publishProductionReady: sourceProof.publishProductionReady,
    publishHandoffReady: sourceProof.publishHandoffReady,
    publishReleaseMatchReady: sourceProof.publishReleaseMatchReady,
  };
}

function marketplaceSourceProofFromEnv(env: Record<string, string | undefined>): MarketplaceProofInput {
  const hasWebhookEnv = [
    env.STRIPE_WEBHOOK_SECRET,
    env.GREYBOX_STRIPE_WEBHOOK_EVENTS,
    env.GREYBOX_MARKETPLACE_URL,
    env.GREYBOX_MARKETPLACE_ADMIN_TOKEN,
    env.GREYBOX_AUDIT_LOG_DIR,
    env.GREYBOX_AUDIT_LOG_PG_URL,
    env.GREYBOX_MARKETPLACE_STRIPE_EVENT_FORWARD_COUNT,
  ].some((value) => Boolean(value?.trim()));
  if (!hasWebhookEnv) return {};
  const readiness = buildCheckoutReadinessReport({
    stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET,
    stripeWebhookEvents: stripeWebhookEventsFromEnv(env),
    requireStripeWebhookEvents: true,
    marketplaceUrl: env.GREYBOX_MARKETPLACE_URL,
    marketplaceAdminToken: env.GREYBOX_MARKETPLACE_ADMIN_TOKEN,
    auditLogConfigured: Boolean(env.GREYBOX_AUDIT_LOG_DIR?.trim() || env.GREYBOX_AUDIT_LOG_PG_URL?.trim()),
  });
  return {
    stripeEventForwardingReady: readiness.ready,
    ...optionalEnvNumber('forwardedStripeEvents', env.GREYBOX_MARKETPLACE_STRIPE_EVENT_FORWARD_COUNT),
  };
}

function mergeProofInput(...inputs: ProModuleProofInput[]): ProModuleProofInput;
function mergeProofInput<T extends object>(...inputs: Array<Partial<T>>): T;
function mergeProofInput<T extends object>(...inputs: Array<Partial<T>>): T {
  const out = Object.assign({}, ...inputs) as T & {
    publishProductionReady?: boolean;
    publishHandoffReady?: boolean;
    publishReleaseMatchReady?: boolean;
  };
  const publishProductionReady = inputs.flatMap((input) => {
    const value = (input as Partial<ProModuleProofInput>).publishProductionReady;
    return typeof value === 'boolean' ? [value] : [];
  });
  if (publishProductionReady.length > 0) {
    out.publishProductionReady = publishProductionReady.every(Boolean);
  }
  const publishHandoffReady = inputs.flatMap((input) => {
    const value = (input as Partial<ProModuleProofInput>).publishHandoffReady;
    return typeof value === 'boolean' ? [value] : [];
  });
  if (publishHandoffReady.length > 0) {
    out.publishHandoffReady = publishHandoffReady.every(Boolean);
  }
  const publishReleaseMatchReady = inputs.flatMap((input) => {
    const value = (input as Partial<ProModuleProofInput>).publishReleaseMatchReady;
    return typeof value === 'boolean' ? [value] : [];
  });
  if (publishReleaseMatchReady.length > 0) {
    out.publishReleaseMatchReady = publishReleaseMatchReady.every(Boolean);
  }
  return out;
}

function hasProofFields(input: object): boolean {
  return Object.keys(input).length > 0;
}

export function buildBusinessModelProofReport(options: {
  proof?: BusinessModelProofInput;
  now?: Date;
} = {}): BusinessModelProofReport {
  const metrics = normalizeMetrics(options.proof ?? businessModelProofFromEnv());
  const checks = buildChecks(metrics);
  const pass = checks.filter((check) => check.status === 'pass').length;
  const warn = checks.filter((check) => check.status === 'warn').length;
  const fail = checks.filter((check) => check.status === 'fail').length;
  const managedInferenceReady = checks.find((check) => check.id === 'managed-inference-proof')?.status === 'pass';
  const proModuleReady = checks.find((check) => check.id === 'pro-module-proof')?.status === 'pass';
  const marketplaceReady = checks.find((check) => check.id === 'marketplace-proof')?.status === 'pass';
  const playtestReady = checks.find((check) => check.id === 'playtest-proof')?.status === 'pass';
  return {
    generatedAt: (options.now ?? new Date()).toISOString(),
    disclaimer: 'Business model proof is internal aggregate operating evidence only. Stripe, provider invoices, marketplace ledgers, Pro entitlement records, and playtest contracts remain authoritative. Do not include customer names, contact data, raw deal notes, game IP, credentials, or prompt/artifact payloads in the proof JSON.',
    targets,
    metrics,
    summary: {
      status: fail > 0 ? 'fail' : warn > 0 ? 'warn' : 'pass',
      checks: checks.length,
      pass,
      warn,
      fail,
      managedInferenceArrUsd: metrics.managedInference.arrUsd,
      managedInferenceReady,
      proModuleRevenueShare: metrics.proModules.revenueShare,
      proModuleAttachRateBps: metrics.proModules.attachRateBps,
      proModuleExpansionArrUsd: metrics.proModules.expansionArrUsd,
      proModuleBetaValidatedModules: metrics.proModules.betaValidatedModules,
      proModuleBetaDesignPartners: metrics.proModules.betaDesignPartners,
      proModuleBetaReviewedExports: metrics.proModules.betaReviewedExports,
      proModuleBetaAcceptedDiffRateBps: metrics.proModules.betaAcceptedDiffRateBps,
      proModuleReady,
      marketplaceMonthlyGmvUsd: metrics.marketplace.monthlyGmvUsd,
      marketplaceUniqueBuyers: metrics.marketplace.uniqueBuyers,
      marketplaceTopCreatorGmvShareBps: metrics.marketplace.topCreatorGmvShareBps,
      marketplaceTopBuyerGmvShareBps: metrics.marketplace.topBuyerGmvShareBps,
      marketplaceReady,
      marketplaceReconciliationReady: metrics.marketplace.reconciliationReady,
      marketplaceReconciliationIssues: metrics.marketplace.reconciliationIssues,
      marketplaceSettlementReady: metrics.marketplace.settlementReady,
      marketplaceSettlementPayoutShareBps: metrics.marketplace.settlementPayoutShareBps,
      marketplaceRiskReserveReady: metrics.marketplace.riskReserveReady,
      marketplaceReserveShortfallCents: metrics.marketplace.reserveShortfallCents,
      marketplaceStripeEventForwardingReady: metrics.marketplace.stripeEventForwardingReady,
      marketplaceForwardedStripeEvents: metrics.marketplace.forwardedStripeEvents,
      playtestActiveStudios: metrics.playtest.activePayingStudios,
      playtestQaSavingsUsd: metrics.playtest.qaSavingsUsd,
      playtestReady,
      acquisitionBusinessModelReady: managedInferenceReady
        && proModuleReady
        && marketplaceReady
        && playtestReady,
    },
    checks,
  };
}

export function formatBusinessModelProofMarkdown(report: BusinessModelProofReport): string {
  const lines = [
    '# Greybox Business Model Proof',
    '',
    `Generated: ${report.generatedAt}`,
    `Status: ${report.summary.status}`,
    `Acquisition business model ready: ${report.summary.acquisitionBusinessModelReady ? 'yes' : 'no'}`,
    `Disclaimer: ${report.disclaimer}`,
    '',
    '## Summary',
    '',
    `- Managed inference ARR: ${money(report.summary.managedInferenceArrUsd)}`,
    `- Managed inference ready: ${report.summary.managedInferenceReady ? 'yes' : 'no'}`,
    `- Pro module revenue share: ${percent(report.summary.proModuleRevenueShare)}`,
    `- Pro module attach: ${basisPoints(report.summary.proModuleAttachRateBps)}`,
    `- Pro module expansion ARR: ${money(report.summary.proModuleExpansionArrUsd)}`,
    `- Pro beta validation: ${integer(report.summary.proModuleBetaValidatedModules)} module(s), ${integer(report.summary.proModuleBetaDesignPartners)} partner(s), ${integer(report.summary.proModuleBetaReviewedExports)} reviewed export(s), ${basisPoints(report.summary.proModuleBetaAcceptedDiffRateBps)} accepted diffs`,
    `- Pro modules ready: ${report.summary.proModuleReady ? 'yes' : 'no'}`,
    `- Marketplace GMV/month: ${money(report.summary.marketplaceMonthlyGmvUsd)}`,
    `- Marketplace unique buyers: ${integer(report.summary.marketplaceUniqueBuyers)}`,
    `- Marketplace top seller: ${basisPoints(report.summary.marketplaceTopCreatorGmvShareBps)}`,
    `- Marketplace top buyer: ${basisPoints(report.summary.marketplaceTopBuyerGmvShareBps)}`,
    `- Marketplace ready: ${report.summary.marketplaceReady ? 'yes' : 'no'}`,
    `- Marketplace reconciliation: ${report.summary.marketplaceReconciliationReady ? 'ready' : 'blocked'} (${integer(report.summary.marketplaceReconciliationIssues)} issue(s))`,
    `- Marketplace settlement: ${report.summary.marketplaceSettlementReady ? 'ready' : 'blocked'} (${basisPoints(report.summary.marketplaceSettlementPayoutShareBps)} settled payout value)`,
    `- Marketplace risk reserve: ${report.summary.marketplaceRiskReserveReady ? 'ready' : 'blocked'} (${money(report.summary.marketplaceReserveShortfallCents / 100)} shortfall)`,
    `- Marketplace Stripe event forwarding: ${report.summary.marketplaceStripeEventForwardingReady ? 'ready' : 'blocked'} (${integer(report.summary.marketplaceForwardedStripeEvents)} forwarded event(s))`,
    `- Playtest paying studios: ${integer(report.summary.playtestActiveStudios)}`,
    `- Playtest QA savings: ${money(report.summary.playtestQaSavingsUsd)}`,
    `- Playtest ready: ${report.summary.playtestReady ? 'yes' : 'no'}`,
    '',
    '## Checks',
    '',
    '| Check | Status | Current | Target | Owner |',
    '| --- | --- | --- | --- | --- |',
  ];
  for (const check of report.checks) {
    lines.push(`| ${escapeTableCell(check.label)} | ${check.status} | ${escapeTableCell(check.current)} | ${escapeTableCell(check.target)} | ${escapeTableCell(check.owner)} |`);
  }
  lines.push('');
  return lines.join('\n');
}

function buildChecks(metrics: BusinessModelProofMetrics): BusinessModelProofCheck[] {
  return [
    managedInferenceCheck(metrics.managedInference),
    proModuleCheck(metrics.proModules),
    marketplaceCheck(metrics.marketplace),
    playtestCheck(metrics.playtest),
  ];
}

function managedInferenceCheck(metrics: BusinessModelProofMetrics['managedInference']): BusinessModelProofCheck {
  const ready = metrics.arrUsd >= targets.managedInferenceArrUsd
    && metrics.meteredBillingAudited
    && metrics.providerReconciliationOk
    && metrics.stripeMeterEvents > 0
    && metrics.grossMargin >= targets.managedInferenceGrossMargin;
  const scaleClaim = metrics.arrUsd >= targets.managedInferenceArrUsd;
  const status: BusinessModelProofStatus = ready
    ? 'pass'
    : scaleClaim
      ? 'fail'
    : metrics.arrUsd >= 100_000 && (metrics.meteredBillingAudited || metrics.providerReconciliationOk)
      ? 'warn'
      : 'fail';
  return {
    id: 'managed-inference-proof',
    label: 'Managed inference proof',
    status,
    current: `${money(metrics.arrUsd)} ARR, ${integer(metrics.stripeMeterEvents)} meter event(s), ${percent(metrics.grossMargin)} gross margin`,
    target: '$1M+ ARR with audited Stripe metering, provider reconciliation, and 50%+ gross margin',
    owner: 'Cloud / Finance',
    detail: 'Managed inference has to prove both revenue and billing accuracy before it counts as the margin layer.',
    evidence: ['Stripe Metered Billing export', 'Anthropic/OpenAI/Bedrock reconciliation', 'Langfuse usage rollup'],
    ...(status === 'pass' ? {} : { remediation: 'Reconcile provider invoices to Stripe meter events and move more BYOK usage into managed plans.' }),
  };
}

function proModuleCheck(metrics: BusinessModelProofMetrics['proModules']): BusinessModelProofCheck {
  const attachHealthy = metrics.attachReady
    && metrics.attachRateBps >= targets.proModuleAttachRateBps
    && metrics.multiModuleAttachRateBps >= targets.proModuleMultiModuleAttachRateBps
    && metrics.studioEnterpriseAttachRateBps >= targets.proModuleStudioEnterpriseAttachRateBps
    && metrics.expansionArrUsd >= targets.proModuleExpansionArrUsd
    && metrics.proChurnedCustomerRateBps <= targets.proModuleMaxChurnedCustomerRateBps
    && metrics.modulesWithActiveCustomers >= targets.proModuleActiveCustomerModules;
  const betaHealthy = metrics.betaReady
    && metrics.betaValidatedModules >= targets.proModuleBetaValidatedModules
    && metrics.betaDesignPartners >= targets.proModuleBetaDesignPartners
    && metrics.betaReviewedExports >= targets.proModuleBetaReviewedExports
    && metrics.betaAcceptedDiffRateBps >= targets.proModuleMinBetaAcceptedDiffRateBps;
  const ready = metrics.revenueShare >= targets.proModuleRevenueShare
    && metrics.shippedModules >= targets.shippedProModules
    && metrics.signedBundles >= targets.shippedProModules
    && metrics.publishedObjects >= targets.publishedProObjects
    && attachHealthy
    && betaHealthy
    && metrics.loaderRejectsUnsigned
    && metrics.publishProductionReady
    && metrics.publishHandoffReady
    && metrics.publishReleaseMatchReady
    && metrics.sourceBusinessModelReady;
  const scaleClaim = metrics.revenueShare >= targets.proModuleRevenueShare
    || metrics.shippedModules >= targets.shippedProModules;
  const status: BusinessModelProofStatus = ready
    ? 'pass'
    : scaleClaim
      ? 'fail'
    : metrics.revenueShare >= 0.15 || metrics.shippedModules >= 5
      ? 'warn'
      : 'fail';
  return {
    id: 'pro-module-proof',
    label: 'Pro module proof',
    status,
    current: `${percent(metrics.revenueShare)} of ARR, ${integer(metrics.shippedModules)} shipped module(s), ${integer(metrics.signedBundles)} signed bundle(s), ${integer(metrics.publishedObjects)} published object(s), ${basisPoints(metrics.attachRateBps)} attach, ${basisPoints(metrics.multiModuleAttachRateBps)} multi-module, ${basisPoints(metrics.studioEnterpriseAttachRateBps)} Studio/Enterprise attach, ${money(metrics.expansionArrUsd)} expansion ARR, ${basisPoints(metrics.proChurnedCustomerRateBps)} churn, ${integer(metrics.modulesWithActiveCustomers)} active module(s), beta ${metrics.betaReady ? 'ready' : 'blocked'} / ${integer(metrics.betaValidatedModules)} module(s) / ${integer(metrics.betaDesignPartners)} partner(s) / ${integer(metrics.betaReviewedExports)} export(s) / ${basisPoints(metrics.betaAcceptedDiffRateBps)} accepted, attach ${metrics.attachReady ? 'ready' : 'blocked'}, production publish ${metrics.publishProductionReady ? 'ready' : 'blocked'}, Cloud handoff ${metrics.publishHandoffReady ? 'ready' : 'blocked'}, release match ${metrics.publishReleaseMatchReady ? 'ready' : 'blocked'}, source ${metrics.sourceBusinessModelReady ? 'ready' : 'blocked'}`,
    target: '30%+ ARR share from 12+ shipped, signed Pro modules with 13+ published CDN objects, 40%+ attach, 15%+ multi-module attach, 60%+ Studio/Enterprise attach, $2.5K+ expansion ARR, <=10% Pro churn, 5+ active modules, 5 beta-validated launch modules with 10+ partners, 10+ reviewed exports, 50%+ accepted diffs, unsigned bundle rejection, production publish proof, Cloud handoff report, release-train publish proof, and source proof ready',
    owner: 'Pro Modules',
    detail: 'Closed-source modules create the open-core margin story only if revenue mix, attach expansion, beta outcomes, publish receipts, and bundle enforcement are proven.',
    evidence: ['Pro module sales ledger', 'Pro module attach report', 'Pro beta validation report', '.gbpro signing log', 'CDN publish receipt proof', 'Cloud handoff report', 'license entitlement report'],
    ...(status === 'pass' ? {} : { remediation: 'Ship the remaining vertical packs, expand multi-module attach, capture reviewed beta exports, and keep loader signature enforcement in the purchase path.' }),
  };
}

function marketplaceCheck(metrics: BusinessModelProofMetrics['marketplace']): BusinessModelProofCheck {
  const noComplianceBlockers = metrics.payoutBlockers === 0 && metrics.taxBlockers === 0;
  const ledgerClean = metrics.reconciliationReady && metrics.reconciliationIssues === 0;
  const ledgerStatus = ledgerClean
    ? 'ready'
    : metrics.reconciliationReady
      ? `${integer(metrics.reconciliationIssues)} issue(s)`
      : 'blocked';
  const reserveFunded = metrics.riskReserveReady && metrics.reserveShortfallCents === 0;
  const stripeEventForwardingReady = metrics.stripeEventForwardingReady
    && metrics.forwardedStripeEvents >= targets.marketplaceForwardedStripeEvents;
  const checkoutAttributionReady = metrics.checkoutOrderShareBps >= targets.checkoutOrderShareBps
    && metrics.checkoutGmvShareBps >= targets.checkoutGmvShareBps;
  const settlementReady = metrics.settlementReady
    && metrics.settlementPayoutShareBps >= targets.marketplaceSettlementPayoutShareBps;
  const sellerSupplyDiverse = metrics.topCreatorGmvShareBps > 0
    && metrics.topCreatorGmvShareBps <= targets.marketplaceMaximumTopCreatorGmvShareBps;
  const buyerDemandDiverse = metrics.topBuyerGmvShareBps > 0
    && metrics.topBuyerGmvShareBps <= targets.marketplaceMaximumTopBuyerGmvShareBps;
  const ready = metrics.monthlyGmvUsd >= targets.marketplaceMonthlyGmvUsd
    && metrics.activeSellers >= targets.marketplaceActiveSellers
    && metrics.uniqueBuyers >= targets.marketplaceUniqueBuyers
    && sellerSupplyDiverse
    && buyerDemandDiverse
    && metrics.platformReady
    && metrics.sourceBusinessModelReady
    && checkoutAttributionReady
    && settlementReady
    && noComplianceBlockers
    && ledgerClean
    && reserveFunded
    && stripeEventForwardingReady;
  const scaleClaim = metrics.monthlyGmvUsd >= targets.marketplaceMonthlyGmvUsd
    && metrics.activeSellers >= targets.marketplaceActiveSellers;
  const status: BusinessModelProofStatus = ready
    ? 'pass'
    : scaleClaim || !noComplianceBlockers || !ledgerClean || !reserveFunded || !settlementReady
      ? 'fail'
      : metrics.monthlyGmvUsd >= 25_000 || metrics.activeSellers >= 50
        ? 'warn'
        : 'fail';
  return {
    id: 'marketplace-proof',
    label: 'Marketplace proof',
    status,
    current: `${money(metrics.monthlyGmvUsd)} GMV/month, ${integer(metrics.activeSellers)} active seller(s), ${integer(metrics.uniqueBuyers)} unique buyer(s), ${basisPoints(metrics.topCreatorGmvShareBps)} top seller, ${basisPoints(metrics.topBuyerGmvShareBps)} top buyer, ${basisPoints(metrics.checkoutOrderShareBps)} checkout orders, ${basisPoints(metrics.checkoutGmvShareBps)} checkout GMV, settlement ${metrics.settlementReady ? 'ready' : 'blocked'} / ${basisPoints(metrics.settlementPayoutShareBps)}, ledger ${ledgerStatus}, reserve ${reserveFunded ? 'ready' : `${money(metrics.reserveShortfallCents / 100)} short`}, Stripe events ${metrics.stripeEventForwardingReady ? 'ready' : 'blocked'} / ${integer(metrics.forwardedStripeEvents)} forwarded, source ${metrics.sourceBusinessModelReady ? 'ready' : 'blocked'}`,
    target: '$250K+ GMV/month, 200+ active sellers, 200+ unique buyers, <=25% top-seller and top-buyer GMV concentration, 90%+ checkout order/GMV attribution, 90%+ settled creator payout value, no payout/tax/reconciliation/reserve blockers, 4+ forwarded Checkout/refund/dispute Stripe events, source proof ready',
    owner: 'Marketplace',
    detail: 'Marketplace GMV only changes the valuation multiple when creator supply, diversified buyer demand, checkout attribution, settled creator payouts, tax flows, reconciliation, risk reserves, and Cloud-forwarded Stripe refund/dispute events are all working.',
    evidence: ['Stripe Connect payout report', 'marketplace platform readiness packet', 'settlement report', 'reconciliation report', 'tax compliance export', 'risk reserve report', 'GET /v1/billing/checkout-readiness', 'billing.marketplace_stripe_event_forwarded audit records'],
    ...(status === 'pass' ? {} : { remediation: 'Increase paid creator supply and clear payout settlement, tax, reconciliation, or reserve blockers before treating GMV as platform evidence.' }),
  };
}

function playtestCheck(metrics: BusinessModelProofMetrics['playtest']): BusinessModelProofCheck {
  const ready = metrics.activePayingStudios >= targets.activePlaytestStudios
    && metrics.personasInProduction >= targets.playtestPersonas
    && metrics.acceptedTuningSuggestions > 0
    && metrics.completedRuns > 0
    && metrics.qaSavingsUsd >= targets.playtestQaSavingsUsd
    && metrics.personaProductionReady
    && metrics.sourceBusinessModelReady;
  const scaleClaim = metrics.activePayingStudios >= targets.activePlaytestStudios
    || metrics.personasInProduction >= targets.playtestPersonas;
  const status: BusinessModelProofStatus = ready
    ? 'pass'
    : scaleClaim
      ? 'fail'
    : metrics.activePayingStudios >= 20 || metrics.personasInProduction >= 5
      ? 'warn'
      : 'fail';
  return {
    id: 'playtest-proof',
    label: 'Agentic playtest proof',
    status,
    current: `${integer(metrics.activePayingStudios)} paying studio(s), ${integer(metrics.personasInProduction)} persona(s), ${integer(metrics.completedRuns)} completed run(s), ${money(metrics.qaSavingsUsd)} annualized QA savings, persona source ${metrics.personaProductionReady ? 'ready' : 'blocked'}, source ${metrics.sourceBusinessModelReady ? 'ready' : 'blocked'}`,
    target: '100+ paying studios, 10+ production personas, accepted tuner suggestions, completed playtest runs, $500K+ annualized QA savings, persona source proof ready, source proof ready',
    owner: 'Playtest',
    detail: 'Agentic playtesting becomes a QA budget line only when studios repeatedly pay for production persona runs and the loop proves material QA savings.',
    evidence: ['playtest studio adoption report', 'persona run ledger', 'accepted tuner suggestion audit', 'QA savings report'],
    ...(status === 'pass' ? {} : { remediation: 'Expand design-partner loops until persona reports and tuner suggestions are accepted in paid workflows.' }),
  };
}

function normalizeMetrics(input: BusinessModelProofInput): BusinessModelProofMetrics {
  return {
    managedInference: {
      arrUsd: nonNegative(input.managedInference?.arrUsd),
      meteredBillingAudited: input.managedInference?.meteredBillingAudited === true,
      providerReconciliationOk: input.managedInference?.providerReconciliationOk === true,
      stripeMeterEvents: nonNegative(input.managedInference?.stripeMeterEvents),
      grossMargin: nonNegativeRate(input.managedInference?.grossMargin),
    },
    proModules: {
      revenueShare: nonNegativeRate(input.proModules?.revenueShare),
      shippedModules: nonNegative(input.proModules?.shippedModules),
      paidPurchases: nonNegative(input.proModules?.paidPurchases),
      signedBundles: nonNegative(input.proModules?.signedBundles),
      publishedObjects: nonNegative(input.proModules?.publishedObjects),
      attachRateBps: nonNegative(input.proModules?.attachRateBps),
      multiModuleAttachRateBps: nonNegative(input.proModules?.multiModuleAttachRateBps),
      studioEnterpriseAttachRateBps: nonNegative(input.proModules?.studioEnterpriseAttachRateBps),
      expansionArrUsd: nonNegative(input.proModules?.expansionArrUsd),
      proChurnedCustomerRateBps: nonNegative(input.proModules?.proChurnedCustomerRateBps),
      modulesWithActiveCustomers: nonNegative(input.proModules?.modulesWithActiveCustomers),
      betaValidatedModules: nonNegative(input.proModules?.betaValidatedModules),
      betaDesignPartners: nonNegative(input.proModules?.betaDesignPartners),
      betaReviewedExports: nonNegative(input.proModules?.betaReviewedExports),
      betaAcceptedDiffRateBps: nonNegative(input.proModules?.betaAcceptedDiffRateBps),
      attachReady: input.proModules?.attachReady === true,
      betaReady: input.proModules?.betaReady === true,
      loaderRejectsUnsigned: input.proModules?.loaderRejectsUnsigned === true,
      publishProductionReady: input.proModules?.publishProductionReady === true,
      publishHandoffReady: input.proModules?.publishHandoffReady === true,
      publishReleaseMatchReady: input.proModules?.publishReleaseMatchReady === true,
      sourceBusinessModelReady: input.proModules?.sourceBusinessModelReady === true,
    },
    marketplace: {
      monthlyGmvUsd: nonNegative(input.marketplace?.monthlyGmvUsd),
      activeSellers: nonNegative(input.marketplace?.activeSellers),
      uniqueBuyers: nonNegative(input.marketplace?.uniqueBuyers),
      platformReady: input.marketplace?.platformReady === true,
      sourceBusinessModelReady: input.marketplace?.sourceBusinessModelReady === true,
      checkoutOrderShareBps: nonNegative(input.marketplace?.checkoutOrderShareBps),
      checkoutGmvShareBps: nonNegative(input.marketplace?.checkoutGmvShareBps),
      settlementReady: input.marketplace?.settlementReady === true,
      settlementPayoutShareBps: nonNegative(input.marketplace?.settlementPayoutShareBps),
      topCreatorGmvShareBps: nonNegative(input.marketplace?.topCreatorGmvShareBps),
      topBuyerGmvShareBps: nonNegative(input.marketplace?.topBuyerGmvShareBps),
      payoutBlockers: nonNegative(input.marketplace?.payoutBlockers),
      taxBlockers: nonNegative(input.marketplace?.taxBlockers),
      reconciliationReady: input.marketplace?.reconciliationReady === true,
      reconciliationIssues: nonNegative(input.marketplace?.reconciliationIssues),
      riskReserveReady: input.marketplace?.riskReserveReady === true,
      reserveShortfallCents: nonNegative(input.marketplace?.reserveShortfallCents),
      stripeEventForwardingReady: input.marketplace?.stripeEventForwardingReady === true,
      forwardedStripeEvents: nonNegative(input.marketplace?.forwardedStripeEvents),
    },
    playtest: {
      activePayingStudios: nonNegative(input.playtest?.activePayingStudios),
      personasInProduction: nonNegative(input.playtest?.personasInProduction),
      acceptedTuningSuggestions: nonNegative(input.playtest?.acceptedTuningSuggestions),
      completedRuns: nonNegative(input.playtest?.completedRuns),
      qaSavingsUsd: nonNegative(input.playtest?.qaSavingsUsd),
      personaProductionReady: input.playtest?.personaProductionReady === true,
      sourceBusinessModelReady: input.playtest?.sourceBusinessModelReady === true,
    },
  };
}

function managedInferenceFromRecord(record: Record<string, unknown>): ManagedInferenceProofInput {
  return {
    ...optionalNumber('arrUsd', record.arrUsd),
    ...optionalBool('meteredBillingAudited', record.meteredBillingAudited),
    ...optionalBool('providerReconciliationOk', record.providerReconciliationOk),
    ...optionalNumber('stripeMeterEvents', record.stripeMeterEvents),
    ...optionalNumber('grossMargin', record.grossMargin),
  };
}

function proModulesFromRecord(record: Record<string, unknown>): ProModuleProofInput {
  return {
    ...optionalNumber('revenueShare', record.revenueShare),
    ...optionalNumber('shippedModules', record.shippedModules),
    ...optionalNumber('paidPurchases', record.paidPurchases),
    ...optionalNumber('signedBundles', record.signedBundles),
    ...optionalNumber('publishedObjects', record.publishedObjects),
    ...optionalNumber('attachRateBps', record.attachRateBps),
    ...optionalNumber('multiModuleAttachRateBps', record.multiModuleAttachRateBps),
    ...optionalNumber('studioEnterpriseAttachRateBps', record.studioEnterpriseAttachRateBps),
    ...optionalNumber('expansionArrUsd', record.expansionArrUsd),
    ...optionalNumber('proChurnedCustomerRateBps', record.proChurnedCustomerRateBps),
    ...optionalNumber('modulesWithActiveCustomers', record.modulesWithActiveCustomers),
    ...optionalNumber('betaValidatedModules', record.betaValidatedModules),
    ...optionalNumber('betaDesignPartners', record.betaDesignPartners),
    ...optionalNumber('betaReviewedExports', record.betaReviewedExports),
    ...optionalNumber('betaAcceptedDiffRateBps', record.betaAcceptedDiffRateBps),
    ...optionalBool('attachReady', record.attachReady),
    ...optionalBool('betaReady', record.betaReady),
    ...optionalBool('loaderRejectsUnsigned', record.loaderRejectsUnsigned),
    ...optionalBool('publishProductionReady', record.publishProductionReady),
    ...optionalBool('publishHandoffReady', record.publishHandoffReady),
    ...optionalBool('publishReleaseMatchReady', record.publishReleaseMatchReady),
  };
}

function proModuleSourceFromRecord(record: Record<string, unknown>): ProModuleProofInput {
  const reportsReady = sourceReportsInclude(record, 'pro-module-revenue-mix')
    && sourceReportsInclude(record, 'pro-module-release-readiness')
    && sourceReportsInclude(record, 'pro-module-publish-proof')
    && sourceReportsInclude(record, 'pro-module-cloud-handoff')
    && sourceReportsInclude(record, 'pro-module-attach-readiness')
    && sourceReportsInclude(record, 'pro-module-beta-validation');
  const revenueMixReady = record.revenueMixReady === true;
  const releaseReady = record.releaseReady === true;
  const publishReady = record.publishReady === true;
  const publishProductionReady = record.publishProductionReady === true;
  const publishHandoffReady = record.publishHandoffReady === true;
  const publishReleaseMatchReady = record.publishReleaseMatchReady === true;
  const attachReady = record.attachReady === true;
  const betaReady = record.betaReady === true;
  const sourceBusinessModelReady = reportsReady
    && revenueMixReady
    && releaseReady
    && publishReady
    && publishProductionReady
    && publishHandoffReady
    && publishReleaseMatchReady
    && attachReady
    && betaReady
    && record.businessModelReady === true;
  return {
    publishProductionReady,
    publishHandoffReady,
    publishReleaseMatchReady,
    attachReady,
    betaReady,
    sourceBusinessModelReady,
  };
}

function marketplaceFromRecord(record: Record<string, unknown>): MarketplaceProofInput {
  return {
    ...optionalNumber('monthlyGmvUsd', record.monthlyGmvUsd),
    ...optionalNumber('activeSellers', record.activeSellers),
    ...optionalNumber('uniqueBuyers', record.uniqueBuyers),
    ...optionalBool('platformReady', record.platformReady),
    ...optionalNumber('checkoutOrderShareBps', record.checkoutOrderShareBps),
    ...optionalNumber('checkoutGmvShareBps', record.checkoutGmvShareBps),
    ...optionalBool('settlementReady', record.settlementReady),
    ...optionalNumber('settlementPayoutShareBps', record.settlementPayoutShareBps),
    ...optionalNumber('topCreatorGmvShareBps', record.topCreatorGmvShareBps),
    ...optionalNumber('topBuyerGmvShareBps', record.topBuyerGmvShareBps),
    ...optionalNumber('payoutBlockers', record.payoutBlockers),
    ...optionalNumber('taxBlockers', record.taxBlockers),
    ...optionalBool('reconciliationReady', record.reconciliationReady),
    ...optionalNumber('reconciliationIssues', record.reconciliationIssues),
    ...optionalBool('riskReserveReady', record.riskReserveReady),
    ...optionalNumber('reserveShortfallCents', record.reserveShortfallCents),
    ...optionalBool('stripeEventForwardingReady', record.stripeEventForwardingReady),
    ...optionalNumber('forwardedStripeEvents', record.forwardedStripeEvents),
  };
}

function marketplaceSourceFromRecord(record: Record<string, unknown>): MarketplaceProofInput {
  const platformReady = record.platformReady === true;
  const checkoutAttributionReady = record.checkoutAttributionReady === true;
  const reconciliationReady = record.reconciliationReady === true;
  const settlementReady = record.settlementReady === true;
  const riskReserveReady = record.riskReserveReady === true;
  const taxReady = record.taxReady === true;
  const payoutReady = record.payoutReady === true;
  const sourceBusinessModelReady = record.report === 'marketplace-platform-readiness'
    && platformReady
    && checkoutAttributionReady
    && reconciliationReady
    && settlementReady
    && riskReserveReady
    && taxReady
    && payoutReady
    && record.businessModelReady === true;
  return {
    platformReady,
    reconciliationReady,
    settlementReady,
    riskReserveReady,
    sourceBusinessModelReady,
  };
}

function playtestFromRecord(record: Record<string, unknown>): PlaytestProofInput {
  return {
    ...optionalNumber('activePayingStudios', record.activePayingStudios),
    ...optionalNumber('personasInProduction', record.personasInProduction),
    ...optionalNumber('acceptedTuningSuggestions', record.acceptedTuningSuggestions),
    ...optionalNumber('completedRuns', record.completedRuns),
    ...optionalNumber('qaSavingsUsd', record.qaSavingsUsd),
    ...optionalBool('personaProductionReady', record.personaProductionReady),
  };
}

function playtestSourceFromRecord(record: Record<string, unknown>): PlaytestProofInput {
  const reportsReady = sourceReportsInclude(record, 'playtest-adoption')
    && sourceReportsInclude(record, 'playtest-qa-savings')
    && sourceReportsInclude(record, 'playtest-regression');
  const adoptionReady = record.adoptionReady === true;
  const qaSavingsReady = record.qaSavingsReady === true;
  const regressionReady = record.regressionReady === true;
  const personaProductionReady = record.personaProductionReady === true;
  const sourceBusinessModelReady = reportsReady
    && adoptionReady
    && qaSavingsReady
    && regressionReady
    && personaProductionReady
    && record.businessModelReady === true;
  return {
    personaProductionReady,
    sourceBusinessModelReady,
  };
}

function isProModuleSourceRecord(record: Record<string, unknown>): boolean {
  return sourceReportsInclude(record, 'pro-module-revenue-mix')
    || 'revenueMixReady' in record
    || 'releaseReady' in record
    || 'publishReady' in record
    || 'publishProductionReady' in record
    || 'publishHandoffReady' in record
    || 'publishReleaseMatchReady' in record;
}

function isPlaytestSourceRecord(record: Record<string, unknown>): boolean {
  return sourceReportsInclude(record, 'playtest-adoption')
    || 'adoptionReady' in record
    || 'qaSavingsReady' in record
    || 'regressionReady' in record
    || 'personaProductionReady' in record;
}

function isMarketplaceSourceRecord(record: Record<string, unknown>): boolean {
  return record.report === 'marketplace-platform-readiness'
    || 'checkoutAttributionReady' in record
    || 'riskReserveReady' in record
    || 'taxReady' in record
    || 'payoutReady' in record;
}

function sourceReportsInclude(record: Record<string, unknown>, report: string): boolean {
  return Array.isArray(record.reports) && record.reports.includes(report);
}

function optionalBool<K extends string>(key: K, value: unknown): Partial<Record<K, boolean>> {
  return typeof value === 'boolean' ? { [key]: value } as Record<K, boolean> : {};
}

function optionalNumber<K extends string>(key: K, value: unknown): Partial<Record<K, number>> {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? { [key]: value } as Record<K, number>
    : {};
}

function optionalEnvNumber<K extends string>(key: K, value: string | undefined): Partial<Record<K, number>> {
  const parsed = Number(value);
  return value?.trim() && Number.isFinite(parsed) && parsed >= 0
    ? { [key]: parsed } as Record<K, number>
    : {};
}

function nonNegative(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

function nonNegativeRate(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0;
  if (value > 100) return 0;
  return value > 1 ? value / 100 : value;
}

function money(value: number): string {
  if (value >= 1_000_000) return `$${Number((value / 1_000_000).toFixed(1)).toLocaleString('en-US')}M`;
  if (value >= 1_000) return `$${Math.round(value / 1_000).toLocaleString('en-US')}K`;
  return `$${Math.round(value).toLocaleString('en-US')}`;
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function basisPoints(value: number): string {
  return `${Number((value / 100).toFixed(2)).toLocaleString('en-US')}%`;
}

function integer(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}

function escapeTableCell(value: string): string {
  return value.replaceAll('|', '\\|').replaceAll('\n', '<br>');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
