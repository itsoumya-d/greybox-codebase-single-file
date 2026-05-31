// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import type { AuditLog, AuditLogEntry } from './auditLog.js';
import {
  buildSupportSlaReadinessReport,
  type SupportSlaReadinessReport,
  type SupportSlaTicketInput,
} from './supportSlaReadiness.js';
import type { LicenseRecord, UnityLicenseTier } from '../routers/licenses.js';

export type UnityPluginAdoptionStatus = 'pass' | 'warn' | 'fail';

export interface UnityPluginAdoptionMetricInput {
  assetStoreLive?: boolean;
  unityVerifiedSolutionApplied?: boolean;
  unityVerifiedSolutionAchieved?: boolean;
  payingCustomers?: number;
  assetStorePaidCustomers?: number;
  cloudPaidCustomers?: number;
  activeMonthlyLicenses?: number;
  roundTripActiveCustomers?: number;
  mcpActiveCustomers?: number;
  successfulSampleImports?: number;
  averageSampleImportSeconds?: number;
  p95RoundTripLatencyMs?: number;
  supportBlockers?: number;
  realEditorSmokeVersions?: string[];
  sourceAdoptionReady?: boolean;
  sourceReleaseReadinessReady?: boolean;
}

export interface UnityPluginAdoptionMetrics {
  assetStoreLive: boolean;
  unityVerifiedSolutionApplied: boolean;
  unityVerifiedSolutionAchieved: boolean;
  payingCustomers: number;
  assetStorePaidCustomers: number;
  cloudPaidCustomers: number;
  activeMonthlyLicenses: number;
  roundTripActiveCustomers: number;
  mcpActiveCustomers: number;
  successfulSampleImports: number;
  averageSampleImportSeconds: number;
  p95RoundTripLatencyMs: number;
  supportBlockers: number;
  realEditorSmokeVersions: string[];
  sourceAdoptionReady: boolean;
  sourceReleaseReadinessReady: boolean;
}

export interface UnityPluginAdoptionCheck {
  id: string;
  label: string;
  status: UnityPluginAdoptionStatus;
  current: string;
  target: string;
  owner: string;
  detail: string;
  evidence: string[];
  remediation?: string;
}

export interface UnityPluginAdoptionReport {
  generatedAt: string;
  disclaimer: string;
  lookbackDays: number;
  targets: {
    unrealExpansionPayingCustomers: number;
    acquisitionPayingCustomers: number;
    activeLicenseRatio: number;
    roundTripActiveCustomers: number;
    mcpActiveCustomers: number;
    sampleImportSeconds: number;
    roundTripLatencyMs: number;
    supportedUnityVersions: string[];
  };
  sources: {
    registryRecords: number;
    registryPaidLicenses: number;
    registryRoundTripLicenses: number;
    auditLicenseValidations: number;
    auditActivePaidLicenses: number;
    auditRoundTripLicenses: number;
    auditMcpLicenses: number;
  };
  metrics: UnityPluginAdoptionMetrics;
  summary: {
    status: UnityPluginAdoptionStatus;
    checks: number;
    pass: number;
    warn: number;
    fail: number;
    readyForUnrealExpansion: boolean;
    acquisitionPluginGate: boolean;
    readyForUnityV1Growth: boolean;
  };
  checks: UnityPluginAdoptionCheck[];
}

export interface UnityPluginAdoptionOptions {
  auditEntries?: readonly AuditLogEntry[];
  auditLog?: AuditLog;
  licenseRecords?: readonly LicenseRecord[];
  lookbackDays?: number;
  metrics?: UnityPluginAdoptionMetricInput;
  now?: Date;
  supportSlaReport?: SupportSlaReadinessReport;
  supportSlaTickets?: readonly SupportSlaTicketInput[];
}

const supportedUnityVersions = ['2022.3', '2023.2', '6000.0'] as const;
const paidTiers = new Set<UnityLicenseTier>(['indie', 'pro', 'studio']);
const roundTripTiers = new Set<UnityLicenseTier>(['pro', 'studio']);

export function unityPluginAdoptionMetricsFromEnv(
  env: Record<string, string | undefined> = process.env,
): UnityPluginAdoptionMetricInput {
  const raw = env.GREYBOX_UNITY_ADOPTION_JSON;
  if (!raw?.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!isRecord(parsed)) return {};
    return {
      ...optionalBool('assetStoreLive', parsed.assetStoreLive),
      ...optionalBool('unityVerifiedSolutionApplied', parsed.unityVerifiedSolutionApplied),
      ...optionalBool('unityVerifiedSolutionAchieved', parsed.unityVerifiedSolutionAchieved),
      ...optionalNumber('payingCustomers', parsed.payingCustomers),
      ...optionalNumber('assetStorePaidCustomers', parsed.assetStorePaidCustomers),
      ...optionalNumber('cloudPaidCustomers', parsed.cloudPaidCustomers),
      ...optionalNumber('activeMonthlyLicenses', parsed.activeMonthlyLicenses),
      ...optionalNumber('roundTripActiveCustomers', parsed.roundTripActiveCustomers),
      ...optionalNumber('mcpActiveCustomers', parsed.mcpActiveCustomers),
      ...optionalNumber('successfulSampleImports', parsed.successfulSampleImports),
      ...optionalNumber('averageSampleImportSeconds', parsed.averageSampleImportSeconds),
      ...optionalNumber('p95RoundTripLatencyMs', parsed.p95RoundTripLatencyMs),
      ...optionalNumber('supportBlockers', parsed.supportBlockers),
      ...optionalUnityVersions(parsed.realEditorSmokeVersions),
      ...sourceReadinessFromRecord(parsed.source),
    };
  } catch {
    return {};
  }
}

export async function buildUnityPluginAdoptionReport(
  options: UnityPluginAdoptionOptions = {},
): Promise<UnityPluginAdoptionReport> {
  const now = options.now ?? new Date();
  const lookbackDays = positiveInteger(options.lookbackDays) ?? 30;
  const since = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();
  const auditEntries = options.auditEntries
    ?? await options.auditLog?.readEntries({ action: 'license.validated', since })
    ?? [];
  const registry = registryStats(options.licenseRecords ?? [], now);
  const audit = auditStats(auditEntries, since);
  const supportSlaReport = options.supportSlaReport
    ?? (options.supportSlaTickets
      ? buildSupportSlaReadinessReport({ tickets: options.supportSlaTickets, now })
      : undefined);
  const metrics = normalizeMetrics(options.metrics ?? unityPluginAdoptionMetricsFromEnv(), registry, audit, supportSlaReport);
  const checks = adoptionChecks(metrics);
  const pass = checks.filter((check) => check.status === 'pass').length;
  const warn = checks.filter((check) => check.status === 'warn').length;
  const fail = checks.filter((check) => check.status === 'fail').length;
  const readyForUnrealExpansion = checks.find((check) => check.id === 'unreal-expansion-gate')?.status === 'pass';
  const acquisitionPluginGate = checks.find((check) => check.id === 'acquisition-plugin-gate')?.status === 'pass';
  return {
    generatedAt: now.toISOString(),
    disclaimer: 'Unity plugin adoption readiness is internal operating evidence only. Asset Store sales exports, Stripe invoices, Unity partner portal records, and customer contracts remain authoritative.',
    lookbackDays,
    targets: {
      unrealExpansionPayingCustomers: 100,
      acquisitionPayingCustomers: 1_000,
      activeLicenseRatio: 0.6,
      roundTripActiveCustomers: 100,
      mcpActiveCustomers: 50,
      sampleImportSeconds: 30,
      roundTripLatencyMs: 2_000,
      supportedUnityVersions: [...supportedUnityVersions],
    },
    sources: {
      registryRecords: options.licenseRecords?.length ?? 0,
      registryPaidLicenses: registry.paidLicenses,
      registryRoundTripLicenses: registry.roundTripLicenses,
      auditLicenseValidations: audit.validations,
      auditActivePaidLicenses: audit.activePaidLicenses,
      auditRoundTripLicenses: audit.roundTripLicenses,
      auditMcpLicenses: audit.mcpLicenses,
    },
    metrics,
    summary: {
      status: fail > 0 ? 'fail' : warn > 0 ? 'warn' : 'pass',
      checks: checks.length,
      pass,
      warn,
      fail,
      readyForUnrealExpansion,
      acquisitionPluginGate,
      readyForUnityV1Growth: acquisitionPluginGate
        && metrics.assetStoreLive
        && qualityReady(metrics)
        && metrics.supportBlockers === 0,
    },
    checks,
  };
}

export function formatUnityPluginAdoptionMarkdown(report: UnityPluginAdoptionReport): string {
  const lines = [
    '# Greybox Unity Plugin Adoption',
    '',
    `Generated: ${report.generatedAt}`,
    `Status: ${report.summary.status}`,
    `Ready for Unreal expansion: ${report.summary.readyForUnrealExpansion ? 'yes' : 'no'}`,
    `Acquisition plugin gate: ${report.summary.acquisitionPluginGate ? 'yes' : 'no'}`,
    `Unity v1 growth ready: ${report.summary.readyForUnityV1Growth ? 'yes' : 'no'}`,
    `Disclaimer: ${report.disclaimer}`,
    '',
    '## Summary',
    '',
    `- Paying customers: ${report.metrics.payingCustomers}`,
    `- Active monthly licenses: ${report.metrics.activeMonthlyLicenses}`,
    `- Round-trip active customers: ${report.metrics.roundTripActiveCustomers}`,
    `- MCP active customers: ${report.metrics.mcpActiveCustomers}`,
    `- Real editor smokes: ${report.metrics.realEditorSmokeVersions.join(', ') || 'none'}`,
    `- Source adoption packet: ${report.metrics.sourceAdoptionReady ? 'ready' : 'blocked'}`,
    `- Release readiness packet: ${report.metrics.sourceReleaseReadinessReady ? 'ready' : 'blocked'}`,
    `- Support blockers: ${report.metrics.supportBlockers}`,
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

function normalizeMetrics(
  input: UnityPluginAdoptionMetricInput,
  registry: ReturnType<typeof registryStats>,
  audit: ReturnType<typeof auditStats>,
  supportSlaReport?: SupportSlaReadinessReport,
): UnityPluginAdoptionMetrics {
  const assetStorePaidCustomers = nonNegative(input.assetStorePaidCustomers);
  const cloudPaidCustomers = nonNegative(input.cloudPaidCustomers);
  const suppliedPayingCustomers = nonNegative(input.payingCustomers);
  const payingCustomers = Math.max(
    suppliedPayingCustomers,
    assetStorePaidCustomers + cloudPaidCustomers,
    registry.paidLicenses,
  );
  return {
    assetStoreLive: input.assetStoreLive === true,
    unityVerifiedSolutionApplied: input.unityVerifiedSolutionApplied === true,
    unityVerifiedSolutionAchieved: input.unityVerifiedSolutionAchieved === true,
    payingCustomers,
    assetStorePaidCustomers,
    cloudPaidCustomers,
    activeMonthlyLicenses: Math.max(nonNegative(input.activeMonthlyLicenses), audit.activePaidLicenses),
    roundTripActiveCustomers: Math.max(
      nonNegative(input.roundTripActiveCustomers),
      audit.roundTripLicenses,
      registry.roundTripLicenses,
    ),
    mcpActiveCustomers: Math.max(nonNegative(input.mcpActiveCustomers), audit.mcpLicenses),
    successfulSampleImports: nonNegative(input.successfulSampleImports),
    averageSampleImportSeconds: nonNegative(input.averageSampleImportSeconds),
    p95RoundTripLatencyMs: nonNegative(input.p95RoundTripLatencyMs),
    supportBlockers: Math.max(nonNegative(input.supportBlockers), supportSlaReport?.summary.openUnityBlockers ?? 0),
    realEditorSmokeVersions: normalizeUnityVersions(input.realEditorSmokeVersions ?? []),
    sourceAdoptionReady: input.sourceAdoptionReady === true && input.sourceReleaseReadinessReady === true,
    sourceReleaseReadinessReady: input.sourceReleaseReadinessReady === true,
  };
}

function adoptionChecks(metrics: UnityPluginAdoptionMetrics): UnityPluginAdoptionCheck[] {
  return [
    {
      id: 'asset-store-live',
      label: 'Unity Asset Store listing',
      status: metrics.assetStoreLive ? 'pass' : metrics.payingCustomers > 0 ? 'warn' : 'fail',
      current: metrics.assetStoreLive ? 'live' : 'not live',
      target: 'Asset Store listing live before scaling paid Unity customers',
      owner: 'Unity Plugin',
      detail: 'The Unity plugin needs an official channel before paid adoption can compound.',
      evidence: ['Unity Asset Store publisher portal', 'ASSET_STORE_SUBMISSION.md'],
      ...(metrics.assetStoreLive ? {} : { remediation: 'Complete real Unity smoke, stable package version, visual uploads, and publisher credentials.' }),
    },
    {
      id: 'unity-verified-solution',
      label: 'Unity Verified Solution',
      status: metrics.unityVerifiedSolutionAchieved
        ? 'pass'
        : metrics.unityVerifiedSolutionApplied || metrics.assetStoreLive
          ? 'warn'
          : 'fail',
      current: metrics.unityVerifiedSolutionAchieved
        ? 'achieved'
        : metrics.unityVerifiedSolutionApplied
          ? 'applied'
          : 'not applied',
      target: 'Unity Verified Solution achieved by month 12',
      owner: 'Partnerships',
      detail: 'Unity verification is a strategic signal for engine-vendor acquisition value.',
      evidence: ['Unity partner portal', 'Asset Store listing', 'Unity Verified Solutions application'],
      ...(metrics.unityVerifiedSolutionAchieved ? {} : { remediation: 'Use paid Unity adoption, support quality, and case studies to complete the Verified Solutions application.' }),
    },
    {
      id: 'unreal-expansion-gate',
      label: 'Unreal expansion gate',
      status: metrics.payingCustomers >= 100 && metrics.assetStoreLive && qualityReady(metrics) && metrics.sourceAdoptionReady
        ? 'pass'
        : metrics.payingCustomers >= 100
          ? 'warn'
          : 'fail',
      current: `${metrics.payingCustomers} paying customer(s), Asset Store live = ${metrics.assetStoreLive}, quality matrix = ${qualityReady(metrics)}, source ${metrics.sourceAdoptionReady ? 'ready' : 'blocked'}, release ${metrics.sourceReleaseReadinessReady ? 'ready' : 'blocked'}`,
      target: '100+ paying Unity customers, live listing, real Unity quality matrix, source adoption proof, and release evidence',
      owner: 'Engine Strategy',
      detail: 'Unreal should stay behind Unity until the Unity wedge has real paid pull and operational quality.',
      evidence: ['Asset Store sales export', 'license validation logs', 'Unity release-readiness report'],
      ...(metrics.payingCustomers >= 100 && metrics.assetStoreLive && qualityReady(metrics) && metrics.sourceAdoptionReady ? {} : { remediation: 'Do not prioritize Unreal revenue motion until Unity has 100 paying customers, real editor validation, and source adoption proof.' }),
    },
    {
      id: 'acquisition-plugin-gate',
      label: 'Unity paid customer scale',
      status: metrics.payingCustomers >= 1_000 && metrics.sourceAdoptionReady ? 'pass' : metrics.payingCustomers >= 100 ? 'warn' : 'fail',
      current: `${metrics.payingCustomers} paying customer(s), source ${metrics.sourceAdoptionReady ? 'ready' : 'blocked'}, release ${metrics.sourceReleaseReadinessReady ? 'ready' : 'blocked'}`,
      target: '1,000+ paying Unity plugin customers with source adoption proof and release evidence',
      owner: 'Revenue',
      detail: 'A thousand paid Unity plugin customers makes engine-vendor strategic interest credible.',
      evidence: ['Asset Store sales export', 'Stripe license invoices', 'license registry'],
      ...(metrics.payingCustomers >= 1_000 && metrics.sourceAdoptionReady ? {} : { remediation: 'Drive Unity onboarding, samples, creator content, source evidence, and founder-led conversion before acquisition outreach.' }),
    },
    activeLicenseCheck(metrics),
    thresholdCheck({
      id: 'roundtrip-adoption',
      label: 'Round-trip adoption',
      value: metrics.roundTripActiveCustomers,
      passAt: 100,
      warnAt: 20,
      current: `${metrics.roundTripActiveCustomers} active round-trip customer(s)`,
      target: '100+ active Pro/Studio round-trip customers',
      owner: 'Unity Plugin',
      detail: 'Round-trip sync is the moat, so paid adoption must include it rather than only one-way import.',
      evidence: ['license validation logs', 'sync telemetry opt-in export'],
      remediation: 'Tighten sync onboarding, conflict UX, and Pro conversion for teams using one-way import.',
    }),
    thresholdCheck({
      id: 'mcp-adoption',
      label: 'MCP bridge adoption',
      value: metrics.mcpActiveCustomers,
      passAt: 50,
      warnAt: 10,
      current: `${metrics.mcpActiveCustomers} active MCP customer(s)`,
      target: '50+ active MCP bridge customers',
      owner: 'Unity Plugin',
      detail: 'MCP usage turns Greybox from an importer into the editor-native agent layer.',
      evidence: ['license validation logs', 'MCP bridge usage export'],
      remediation: 'Ship agent workflow examples and make Copy MCP Config part of Pro onboarding.',
    }),
    qualityCheck(metrics),
    {
      id: 'support-blockers',
      label: 'Support blockers',
      status: metrics.supportBlockers === 0 ? 'pass' : metrics.supportBlockers <= 5 ? 'warn' : 'fail',
      current: `${metrics.supportBlockers} blocker(s)`,
      target: '0 open blocker support issues before v1 growth push',
      owner: 'Support',
      detail: 'Unity v1 cannot be treated as a growth surface while install, import, or sync blockers remain open.',
      evidence: ['support queue export', 'release-readiness report'],
      ...(metrics.supportBlockers === 0 ? {} : { remediation: 'Clear install/import/sync blockers before scaling Asset Store paid traffic.' }),
    },
  ];
}

function activeLicenseCheck(metrics: UnityPluginAdoptionMetrics): UnityPluginAdoptionCheck {
  const ratio = metrics.payingCustomers > 0 ? metrics.activeMonthlyLicenses / metrics.payingCustomers : 0;
  const status: UnityPluginAdoptionStatus = ratio >= 0.6 ? 'pass' : ratio >= 0.3 ? 'warn' : 'fail';
  return {
    id: 'monthly-license-activation',
    label: 'Monthly license activation',
    status,
    current: `${metrics.activeMonthlyLicenses}/${metrics.payingCustomers} paid license(s) active (${percent(ratio)})`,
    target: '60%+ paid customers validating the plugin monthly',
    owner: 'Product Analytics',
    detail: 'Paid seats need recurring usage, not shelfware.',
    evidence: ['license.validated audit entries', 'PostHog activation dashboard'],
    ...(status === 'pass' ? {} : { remediation: 'Improve first-run onboarding and nudge paid teams back into engine export workflows.' }),
  };
}

function qualityCheck(metrics: UnityPluginAdoptionMetrics): UnityPluginAdoptionCheck {
  const realVersions = metrics.realEditorSmokeVersions.length;
  const importReady = metrics.successfulSampleImports > 0
    && metrics.averageSampleImportSeconds > 0
    && metrics.averageSampleImportSeconds <= 30;
  const latencyReady = metrics.p95RoundTripLatencyMs > 0 && metrics.p95RoundTripLatencyMs <= 2_000;
  const allVersionsReady = supportedUnityVersions.every((version) => metrics.realEditorSmokeVersions.includes(version));
  const pass = allVersionsReady && importReady && latencyReady;
  const warn = realVersions > 0 || importReady || latencyReady;
  return {
    id: 'unity-quality-matrix',
    label: 'Unity quality matrix',
    status: pass ? 'pass' : warn ? 'warn' : 'fail',
    current: `${realVersions}/3 editor streams, avg import ${seconds(metrics.averageSampleImportSeconds)}, p95 sync ${milliseconds(metrics.p95RoundTripLatencyMs)}`,
    target: '2022.3, 2023.2, Unity 6 real smokes; <30s sample import; <2s p95 round-trip',
    owner: 'Unity Plugin',
    detail: 'The adoption gate should not pass on dry-run validation alone.',
    evidence: ['Validation~/artifacts/release-readiness.json', 'Unity import smoke logs', 'round-trip latency tests'],
    ...(pass ? {} : { remediation: 'Run real editor smokes and capture import/sync latency from customer-like projects.' }),
  };
}

function qualityReady(metrics: UnityPluginAdoptionMetrics): boolean {
  return supportedUnityVersions.every((version) => metrics.realEditorSmokeVersions.includes(version))
    && metrics.successfulSampleImports > 0
    && metrics.averageSampleImportSeconds > 0
    && metrics.averageSampleImportSeconds <= 30
    && metrics.p95RoundTripLatencyMs > 0
    && metrics.p95RoundTripLatencyMs <= 2_000;
}

function thresholdCheck(input: {
  id: string;
  label: string;
  value: number;
  passAt: number;
  warnAt: number;
  current: string;
  target: string;
  owner: string;
  detail: string;
  evidence: string[];
  remediation: string;
}): UnityPluginAdoptionCheck {
  const status: UnityPluginAdoptionStatus = input.value >= input.passAt
    ? 'pass'
    : input.value >= input.warnAt
      ? 'warn'
      : 'fail';
  return {
    id: input.id,
    label: input.label,
    status,
    current: input.current,
    target: input.target,
    owner: input.owner,
    detail: input.detail,
    evidence: input.evidence,
    ...(status === 'pass' ? {} : { remediation: input.remediation }),
  };
}

function registryStats(records: readonly LicenseRecord[], now: Date): {
  paidLicenses: number;
  roundTripLicenses: number;
} {
  const active = records.filter((record) => (record.status ?? 'active') === 'active' && !expired(record.expiresAt, now));
  return {
    paidLicenses: active.filter((record) => paidTiers.has(record.tier)).length,
    roundTripLicenses: active.filter((record) => roundTripTiers.has(record.tier)).length,
  };
}

function auditStats(entries: readonly AuditLogEntry[], sinceIso: string): {
  validations: number;
  activePaidLicenses: number;
  roundTripLicenses: number;
  mcpLicenses: number;
} {
  const sinceMs = Date.parse(sinceIso);
  const paid = new Set<string>();
  const roundTrip = new Set<string>();
  const mcp = new Set<string>();
  let validations = 0;
  for (const entry of entries) {
    if (entry.action !== 'license.validated') continue;
    if (Number.isFinite(sinceMs) && Date.parse(entry.createdAt) < sinceMs) continue;
    validations += 1;
    const tier = metadataString(entry, 'tier');
    const targetId = /^[a-f0-9]{16}$/iu.test(entry.targetId) ? entry.targetId.toLowerCase() : undefined;
    if (!targetId || !paidTiers.has(tier as UnityLicenseTier)) continue;
    paid.add(targetId);
    if (metadataBool(entry, 'roundTripSync')) roundTrip.add(targetId);
    if (metadataBool(entry, 'mcpBridge')) mcp.add(targetId);
  }
  return {
    validations,
    activePaidLicenses: paid.size,
    roundTripLicenses: roundTrip.size,
    mcpLicenses: mcp.size,
  };
}

function expired(expiresAt: string | undefined, now: Date): boolean {
  if (!expiresAt) return false;
  const time = Date.parse(expiresAt);
  return Number.isFinite(time) && time <= now.getTime();
}

function metadataString(entry: AuditLogEntry, key: string): string | undefined {
  const value = entry.metadata?.[key];
  return typeof value === 'string' ? value : undefined;
}

function metadataBool(entry: AuditLogEntry, key: string): boolean {
  return entry.metadata?.[key] === true;
}

function optionalBool(key: keyof UnityPluginAdoptionMetricInput, value: unknown): Partial<UnityPluginAdoptionMetricInput> {
  return typeof value === 'boolean' ? { [key]: value } : {};
}

function sourceReadinessFromRecord(value: unknown): Pick<UnityPluginAdoptionMetricInput, 'sourceAdoptionReady' | 'sourceReleaseReadinessReady'> {
  if (!isRecord(value)) return {};
  const releaseReadinessReady = value.releaseReadinessReady === true
    && value.releaseReadinessStatus === 'pass';
  const missingEvidenceTypes = Array.isArray(value.missingEvidenceTypes) ? value.missingEvidenceTypes : [];
  const blockers = Array.isArray(value.blockers) ? value.blockers : [];
  const sourceAdoptionReady = value.report === 'unity-adoption-source-proof'
    && value.sourceReady === true
    && value.applicationPacketReady === true
    && releaseReadinessReady
    && missingEvidenceTypes.length === 0
    && blockers.length === 0;
  return {
    sourceAdoptionReady,
    sourceReleaseReadinessReady: releaseReadinessReady,
  };
}

function optionalNumber(key: keyof UnityPluginAdoptionMetricInput, value: unknown): Partial<UnityPluginAdoptionMetricInput> {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? { [key]: value } : {};
}

function optionalUnityVersions(value: unknown): Pick<UnityPluginAdoptionMetricInput, 'realEditorSmokeVersions'> {
  return Array.isArray(value) ? { realEditorSmokeVersions: normalizeUnityVersions(value) } : {};
}

function normalizeUnityVersions(values: unknown[]): string[] {
  const versions = values
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .flatMap((value) => {
      if (/^2022\.3/u.test(value)) return ['2022.3'];
      if (/^2023\.2/u.test(value)) return ['2023.2'];
      if (/^(6000\.0|unity\s*6)/iu.test(value)) return ['6000.0'];
      return [];
    });
  return [...new Set(versions)];
}

function nonNegative(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

function positiveInteger(value: number | undefined): number | undefined {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : undefined;
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function seconds(value: number): string {
  return value > 0 ? `${value.toFixed(1)}s` : 'not measured';
}

function milliseconds(value: number): string {
  return value > 0 ? `${Math.round(value)}ms` : 'not measured';
}

function escapeTableCell(value: string): string {
  return value.replaceAll('|', '\\|').replaceAll('\n', '<br>');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
