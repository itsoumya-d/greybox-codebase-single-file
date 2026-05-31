// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

export type EngineExpansionStatus = 'pass' | 'warn' | 'fail';

export interface EngineExpansionMetricInput {
  unityAssetStoreLive?: boolean;
  unityVerifiedSolutionApplied?: boolean;
  unityVerifiedSolutionAchieved?: boolean;
  unityPayingCustomers?: number;
  unityRoundTripActiveCustomers?: number;
  unityMcpActiveCustomers?: number;
  unityAverageSampleImportSeconds?: number;
  unityP95RoundTripLatencyMs?: number;
  unitySupportBlockers?: number;
  unrealPluginStaticValidation?: boolean;
  unrealMarketplaceSubmitted?: boolean;
  unrealMarketplaceLive?: boolean;
  unrealEditorSmokeVersions?: string[];
  unrealSampleImportSeconds?: number;
  unrealRoundTripFieldTypes?: number;
  unrealMcpToolsPassing?: number;
  unrealDemandSignals?: number;
  unrealSourceReady?: boolean;
  godotAddonStaticValidation?: boolean;
  godotAssetLibrarySubmitted?: boolean;
  godotAssetLibraryLive?: boolean;
  godotEditorSmokeVersions?: string[];
  godotSampleImportSeconds?: number;
  godotRoundTripFieldTypes?: number;
  godotMcpToolsPassing?: number;
  godotCommunityDemandSignals?: number;
  godotSourceReady?: boolean;
  openCoreApiDeprecationPlan?: boolean;
  triEngineDocsReady?: boolean;
}

export interface EngineExpansionMetrics {
  unityAssetStoreLive: boolean;
  unityVerifiedSolutionApplied: boolean;
  unityVerifiedSolutionAchieved: boolean;
  unityPayingCustomers: number;
  unityRoundTripActiveCustomers: number;
  unityMcpActiveCustomers: number;
  unityAverageSampleImportSeconds: number;
  unityP95RoundTripLatencyMs: number;
  unitySupportBlockers: number;
  unrealPluginStaticValidation: boolean;
  unrealMarketplaceSubmitted: boolean;
  unrealMarketplaceLive: boolean;
  unrealEditorSmokeVersions: string[];
  unrealSampleImportSeconds: number;
  unrealRoundTripFieldTypes: number;
  unrealMcpToolsPassing: number;
  unrealDemandSignals: number;
  unrealSourceReady: boolean;
  godotAddonStaticValidation: boolean;
  godotAssetLibrarySubmitted: boolean;
  godotAssetLibraryLive: boolean;
  godotEditorSmokeVersions: string[];
  godotSampleImportSeconds: number;
  godotRoundTripFieldTypes: number;
  godotMcpToolsPassing: number;
  godotCommunityDemandSignals: number;
  godotSourceReady: boolean;
  openCoreApiDeprecationPlan: boolean;
  triEngineDocsReady: boolean;
}

export interface EngineExpansionCheck {
  id: string;
  label: string;
  status: EngineExpansionStatus;
  current: string;
  target: string;
  owner: string;
  detail: string;
  evidence: string[];
  remediation?: string;
}

export interface EngineExpansionReadinessReport {
  generatedAt: string;
  disclaimer: string;
  targets: {
    unityCustomersForUnreal: number;
    unityCustomersForAcquisitionSignal: number;
    sampleImportSeconds: number;
    roundTripLatencyMs: number;
    roundTripFieldTypes: number;
    mcpToolsPerEngine: number;
    unrealVersions: string[];
    godotVersions: string[];
  };
  metrics: EngineExpansionMetrics;
  summary: {
    status: EngineExpansionStatus;
    checks: number;
    pass: number;
    warn: number;
    fail: number;
    unrealExpansionAllowed: boolean;
    unrealV1Gate: boolean;
    godotCommunityGate: boolean;
    triEngineAcquisitionGate: boolean;
  };
  checks: EngineExpansionCheck[];
}

const unrealVersions = ['5.3', '5.4', '5.5'] as const;
const godotVersions = ['4.2', '4.3', '4.4'] as const;

export function engineExpansionMetricsFromEnv(
  env: Record<string, string | undefined> = process.env,
): EngineExpansionMetricInput {
  const raw = env.GREYBOX_ENGINE_EXPANSION_METRICS_JSON;
  if (!raw?.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!isRecord(parsed)) return {};
    const flatMetrics: EngineExpansionMetricInput = {
      ...optionalBool('unityAssetStoreLive', parsed.unityAssetStoreLive),
      ...optionalBool('unityVerifiedSolutionApplied', parsed.unityVerifiedSolutionApplied),
      ...optionalBool('unityVerifiedSolutionAchieved', parsed.unityVerifiedSolutionAchieved),
      ...optionalNumber('unityPayingCustomers', parsed.unityPayingCustomers),
      ...optionalNumber('unityRoundTripActiveCustomers', parsed.unityRoundTripActiveCustomers),
      ...optionalNumber('unityMcpActiveCustomers', parsed.unityMcpActiveCustomers),
      ...optionalNumber('unityAverageSampleImportSeconds', parsed.unityAverageSampleImportSeconds),
      ...optionalNumber('unityP95RoundTripLatencyMs', parsed.unityP95RoundTripLatencyMs),
      ...optionalNumber('unitySupportBlockers', parsed.unitySupportBlockers),
      ...optionalBool('unrealPluginStaticValidation', parsed.unrealPluginStaticValidation),
      ...optionalBool('unrealMarketplaceSubmitted', parsed.unrealMarketplaceSubmitted),
      ...optionalBool('unrealMarketplaceLive', parsed.unrealMarketplaceLive),
      ...optionalVersions('unrealEditorSmokeVersions', parsed.unrealEditorSmokeVersions, unrealVersions),
      ...optionalNumber('unrealSampleImportSeconds', parsed.unrealSampleImportSeconds),
      ...optionalNumber('unrealRoundTripFieldTypes', parsed.unrealRoundTripFieldTypes),
      ...optionalNumber('unrealMcpToolsPassing', parsed.unrealMcpToolsPassing),
      ...optionalNumber('unrealDemandSignals', parsed.unrealDemandSignals),
      ...optionalBool('godotAddonStaticValidation', parsed.godotAddonStaticValidation),
      ...optionalBool('godotAssetLibrarySubmitted', parsed.godotAssetLibrarySubmitted),
      ...optionalBool('godotAssetLibraryLive', parsed.godotAssetLibraryLive),
      ...optionalVersions('godotEditorSmokeVersions', parsed.godotEditorSmokeVersions, godotVersions),
      ...optionalNumber('godotSampleImportSeconds', parsed.godotSampleImportSeconds),
      ...optionalNumber('godotRoundTripFieldTypes', parsed.godotRoundTripFieldTypes),
      ...optionalNumber('godotMcpToolsPassing', parsed.godotMcpToolsPassing),
      ...optionalNumber('godotCommunityDemandSignals', parsed.godotCommunityDemandSignals),
      ...optionalBool('openCoreApiDeprecationPlan', parsed.openCoreApiDeprecationPlan),
      ...optionalBool('triEngineDocsReady', parsed.triEngineDocsReady),
    };
    return {
      ...flatMetrics,
      ...releaseReadinessCloudMetrics(parsed.unrealReleaseReadiness, 'unreal'),
      ...releaseReadinessCloudMetrics(parsed.godotReleaseReadiness, 'godot'),
    };
  } catch {
    return {};
  }
}

export function buildEngineExpansionReadinessReport(options: {
  metrics?: EngineExpansionMetricInput;
  now?: Date;
} = {}): EngineExpansionReadinessReport {
  const metrics = normalizeMetrics(options.metrics ?? engineExpansionMetricsFromEnv());
  const checks = buildChecks(metrics);
  const pass = checks.filter((check) => check.status === 'pass').length;
  const warn = checks.filter((check) => check.status === 'warn').length;
  const fail = checks.filter((check) => check.status === 'fail').length;
  const unityGate = checks.find((check) => check.id === 'unity-prerequisites')?.status === 'pass';
  const unrealRuntime = checks.find((check) => check.id === 'unreal-runtime-readiness')?.status === 'pass';
  const unrealMarketplace = checks.find((check) => check.id === 'unreal-marketplace-readiness')?.status === 'pass';
  const godotCommunity = checks.find((check) => check.id === 'godot-community-readiness')?.status === 'pass';
  const apiSafety = checks.find((check) => check.id === 'open-core-api-safety')?.status === 'pass';
  const unrealV1Gate = unityGate && unrealRuntime && unrealMarketplace && apiSafety;
  const godotCommunityGate = godotCommunity && apiSafety;
  return {
    generatedAt: (options.now ?? new Date()).toISOString(),
    disclaimer: 'Engine expansion readiness is internal sequencing evidence only. Unity Asset Store sales, Unreal Marketplace status, Godot Asset Library status, editor smoke logs, and customer contracts remain authoritative. Do not include customer names, partner contacts, private deal notes, or game IP in the metrics JSON.',
    targets: {
      unityCustomersForUnreal: 100,
      unityCustomersForAcquisitionSignal: 1_000,
      sampleImportSeconds: 30,
      roundTripLatencyMs: 2_000,
      roundTripFieldTypes: 5,
      mcpToolsPerEngine: 8,
      unrealVersions: [...unrealVersions],
      godotVersions: [...godotVersions],
    },
    metrics,
    summary: {
      status: fail > 0 ? 'fail' : warn > 0 ? 'warn' : 'pass',
      checks: checks.length,
      pass,
      warn,
      fail,
      unrealExpansionAllowed: unityGate,
      unrealV1Gate,
      godotCommunityGate,
      triEngineAcquisitionGate: metrics.unityPayingCustomers >= 1_000
        && unrealV1Gate
        && godotCommunityGate
        && metrics.unityVerifiedSolutionAchieved,
    },
    checks,
  };
}

export function formatEngineExpansionReadinessMarkdown(report: EngineExpansionReadinessReport): string {
  const lines = [
    '# Greybox Engine Expansion Readiness',
    '',
    `Generated: ${report.generatedAt}`,
    `Status: ${report.summary.status}`,
    `Unreal expansion allowed: ${report.summary.unrealExpansionAllowed ? 'yes' : 'no'}`,
    `Unreal v1 gate: ${report.summary.unrealV1Gate ? 'yes' : 'no'}`,
    `Godot community gate: ${report.summary.godotCommunityGate ? 'yes' : 'no'}`,
    `Tri-engine acquisition gate: ${report.summary.triEngineAcquisitionGate ? 'yes' : 'no'}`,
    `Disclaimer: ${report.disclaimer}`,
    '',
    '## Summary',
    '',
    `- Unity paying customers: ${report.metrics.unityPayingCustomers}`,
    `- Unity round-trip active: ${report.metrics.unityRoundTripActiveCustomers}`,
    `- Unity MCP active: ${report.metrics.unityMcpActiveCustomers}`,
    `- Unreal editor smokes: ${report.metrics.unrealEditorSmokeVersions.join(', ') || 'none'}; source ${report.metrics.unrealSourceReady ? 'ready' : 'blocked'}`,
    `- Godot editor smokes: ${report.metrics.godotEditorSmokeVersions.join(', ') || 'none'}; source ${report.metrics.godotSourceReady ? 'ready' : 'blocked'}`,
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

function buildChecks(metrics: EngineExpansionMetrics): EngineExpansionCheck[] {
  return [
    unityPrerequisitesCheck(metrics),
    unrealRuntimeReadinessCheck(metrics),
    unrealMarketplaceReadinessCheck(metrics),
    godotCommunityReadinessCheck(metrics),
    openCoreApiSafetyCheck(metrics),
  ];
}

function unityPrerequisitesCheck(metrics: EngineExpansionMetrics): EngineExpansionCheck {
  const qualityReady = metrics.unityAverageSampleImportSeconds > 0
    && metrics.unityAverageSampleImportSeconds <= 30
    && metrics.unityP95RoundTripLatencyMs > 0
    && metrics.unityP95RoundTripLatencyMs <= 2_000
    && metrics.unitySupportBlockers === 0;
  const status: EngineExpansionStatus = metrics.unityPayingCustomers >= 100
    && metrics.unityAssetStoreLive
    && qualityReady
    && metrics.unityRoundTripActiveCustomers >= 100
    && metrics.unityMcpActiveCustomers >= 50
    ? 'pass'
    : metrics.unityPayingCustomers >= 50 || metrics.unityVerifiedSolutionApplied
      ? 'warn'
      : 'fail';
  return {
    id: 'unity-prerequisites',
    label: 'Unity prerequisites',
    status,
    current: `${metrics.unityPayingCustomers} paid, ${metrics.unityRoundTripActiveCustomers} round-trip, ${metrics.unityMcpActiveCustomers} MCP, ${metrics.unitySupportBlockers} blocker(s)`,
    target: '100+ paying Unity customers, Asset Store live, round-trip <2s p95, imports <30s, no support blockers',
    owner: 'Unity Plugin',
    detail: 'Unreal expansion should wait until Unity proves the wedge and quality bar.',
    evidence: ['Unity Asset Store sales export', 'license validation logs', 'round-trip latency dashboard', 'Unity smoke report'],
    ...(status === 'pass' ? {} : { remediation: 'Keep focus on Unity v1 reliability, paid adoption, and MCP usage before shifting engineering weight to Unreal.' }),
  };
}

function unrealRuntimeReadinessCheck(metrics: EngineExpansionMetrics): EngineExpansionCheck {
  const smokeVersions = metrics.unrealEditorSmokeVersions.length;
  const runtimeReady = metrics.unrealPluginStaticValidation
    && metrics.unrealSourceReady
    && smokeVersions >= 1
    && metrics.unrealSampleImportSeconds > 0
    && metrics.unrealSampleImportSeconds <= 30
    && metrics.unrealRoundTripFieldTypes >= 5
    && metrics.unrealMcpToolsPassing >= 8;
  const status: EngineExpansionStatus = runtimeReady
    ? 'pass'
    : metrics.unrealPluginStaticValidation || smokeVersions > 0
      ? 'warn'
      : 'fail';
  return {
    id: 'unreal-runtime-readiness',
    label: 'Unreal runtime readiness',
    status,
    current: `${smokeVersions} editor smoke(s), ${metrics.unrealRoundTripFieldTypes} field type(s), ${metrics.unrealMcpToolsPassing} MCP tool(s), source ${metrics.unrealSourceReady ? 'ready' : 'blocked'}`,
    target: 'Static validation, source proof, at least one real Unreal 5.x editor smoke, 5 round-trip field types, and 8 MCP tools',
    owner: 'Unreal Plugin',
    detail: 'Unreal has higher ACV potential, but only if the editor path is real rather than a static scaffold.',
    evidence: ['greybox-unreal-plugin release readiness', 'Unreal editor smoke logs', 'MCP conformance report'],
    ...(status === 'pass' ? {} : { remediation: 'Run real Unreal editor import, round-trip, and MCP smokes before Marketplace submission.' }),
  };
}

function unrealMarketplaceReadinessCheck(metrics: EngineExpansionMetrics): EngineExpansionCheck {
  const status: EngineExpansionStatus = metrics.unrealMarketplaceLive
    ? 'pass'
    : metrics.unrealMarketplaceSubmitted || metrics.unrealDemandSignals >= 10
      ? 'warn'
      : 'fail';
  return {
    id: 'unreal-marketplace-readiness',
    label: 'Unreal Marketplace readiness',
    status,
    current: `${metrics.unrealMarketplaceLive ? 'live' : metrics.unrealMarketplaceSubmitted ? 'submitted' : 'not submitted'}, ${metrics.unrealDemandSignals} demand signal(s)`,
    target: 'Unreal Marketplace live after Unity quality gate and validated Unreal editor path',
    owner: 'Distribution',
    detail: 'Unreal should become the higher-ACV second engine once Unity is irreproachable.',
    evidence: ['Unreal Marketplace portal', 'qualified Unreal customer requests', 'STORE_LISTING.md'],
    ...(status === 'pass' ? {} : { remediation: 'Submit Unreal only after Unity prerequisites and runtime readiness are green.' }),
  };
}

function godotCommunityReadinessCheck(metrics: EngineExpansionMetrics): EngineExpansionCheck {
  const smokeVersions = metrics.godotEditorSmokeVersions.length;
  const addonReady = metrics.godotAddonStaticValidation
    && metrics.godotSourceReady
    && metrics.godotAssetLibraryLive
    && smokeVersions >= 1
    && metrics.godotSampleImportSeconds > 0
    && metrics.godotSampleImportSeconds <= 30
    && metrics.godotRoundTripFieldTypes >= 5
    && metrics.godotMcpToolsPassing >= 8;
  const status: EngineExpansionStatus = addonReady
    ? 'pass'
    : metrics.godotAddonStaticValidation || metrics.godotAssetLibrarySubmitted || metrics.godotCommunityDemandSignals >= 10
      ? 'warn'
      : 'fail';
  return {
    id: 'godot-community-readiness',
    label: 'Godot community readiness',
    status,
    current: `${metrics.godotAssetLibraryLive ? 'live' : metrics.godotAssetLibrarySubmitted ? 'submitted' : 'not submitted'}, ${smokeVersions} editor smoke(s), ${metrics.godotCommunityDemandSignals} community signal(s), source ${metrics.godotSourceReady ? 'ready' : 'blocked'}`,
    target: 'Godot Asset Library live with source proof, real Godot 4.x smoke, 5 field types, and 8 MCP tools',
    owner: 'Godot Plugin',
    detail: 'Godot earns community goodwill and broadens the category without distracting from Unreal ACV.',
    evidence: ['Godot Asset Library listing', 'Godot editor smoke logs', 'MCP conformance report'],
    ...(status === 'pass' ? {} : { remediation: 'Keep the free Godot import path generous, then validate paid sync/MCP with real editor smokes.' }),
  };
}

function openCoreApiSafetyCheck(metrics: EngineExpansionMetrics): EngineExpansionCheck {
  const status: EngineExpansionStatus = metrics.openCoreApiDeprecationPlan && metrics.triEngineDocsReady
    ? 'pass'
    : metrics.openCoreApiDeprecationPlan || metrics.triEngineDocsReady
      ? 'warn'
      : 'fail';
  return {
    id: 'open-core-api-safety',
    label: 'Open-core API safety',
    status,
    current: `deprecation plan ${metrics.openCoreApiDeprecationPlan ? 'ready' : 'missing'}, docs ${metrics.triEngineDocsReady ? 'ready' : 'missing'}`,
    target: '90-day deprecation path and tri-engine docs ready before public engine expansion',
    owner: 'Developer Platform',
    detail: 'Engine expansion must not break community APIs or blur open-core boundaries.',
    evidence: ['API migration guide', 'tri-engine export docs', 'AGENTS.md boundary review'],
    ...(status === 'pass' ? {} : { remediation: 'Document API compatibility and migration windows before broad Unreal/Godot launch.' }),
  };
}

function normalizeMetrics(input: EngineExpansionMetricInput): EngineExpansionMetrics {
  return {
    unityAssetStoreLive: input.unityAssetStoreLive === true,
    unityVerifiedSolutionApplied: input.unityVerifiedSolutionApplied === true,
    unityVerifiedSolutionAchieved: input.unityVerifiedSolutionAchieved === true,
    unityPayingCustomers: nonNegative(input.unityPayingCustomers),
    unityRoundTripActiveCustomers: nonNegative(input.unityRoundTripActiveCustomers),
    unityMcpActiveCustomers: nonNegative(input.unityMcpActiveCustomers),
    unityAverageSampleImportSeconds: nonNegative(input.unityAverageSampleImportSeconds),
    unityP95RoundTripLatencyMs: nonNegative(input.unityP95RoundTripLatencyMs),
    unitySupportBlockers: nonNegative(input.unitySupportBlockers),
    unrealPluginStaticValidation: input.unrealPluginStaticValidation === true,
    unrealMarketplaceSubmitted: input.unrealMarketplaceSubmitted === true,
    unrealMarketplaceLive: input.unrealMarketplaceLive === true,
    unrealEditorSmokeVersions: normalizeVersions(input.unrealEditorSmokeVersions ?? [], unrealVersions),
    unrealSampleImportSeconds: nonNegative(input.unrealSampleImportSeconds),
    unrealRoundTripFieldTypes: nonNegative(input.unrealRoundTripFieldTypes),
    unrealMcpToolsPassing: nonNegative(input.unrealMcpToolsPassing),
    unrealDemandSignals: nonNegative(input.unrealDemandSignals),
    unrealSourceReady: input.unrealSourceReady === true,
    godotAddonStaticValidation: input.godotAddonStaticValidation === true,
    godotAssetLibrarySubmitted: input.godotAssetLibrarySubmitted === true,
    godotAssetLibraryLive: input.godotAssetLibraryLive === true,
    godotEditorSmokeVersions: normalizeVersions(input.godotEditorSmokeVersions ?? [], godotVersions),
    godotSampleImportSeconds: nonNegative(input.godotSampleImportSeconds),
    godotRoundTripFieldTypes: nonNegative(input.godotRoundTripFieldTypes),
    godotMcpToolsPassing: nonNegative(input.godotMcpToolsPassing),
    godotCommunityDemandSignals: nonNegative(input.godotCommunityDemandSignals),
    godotSourceReady: input.godotSourceReady === true,
    openCoreApiDeprecationPlan: input.openCoreApiDeprecationPlan === true,
    triEngineDocsReady: input.triEngineDocsReady === true,
  };
}

function optionalBool(key: keyof EngineExpansionMetricInput, value: unknown): Partial<EngineExpansionMetricInput> {
  return typeof value === 'boolean' ? { [key]: value } : {};
}

function optionalNumber(key: keyof EngineExpansionMetricInput, value: unknown): Partial<EngineExpansionMetricInput> {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? { [key]: value } : {};
}

function optionalVersions(
  key: 'unrealEditorSmokeVersions' | 'godotEditorSmokeVersions',
  value: unknown,
  allowed: readonly string[],
): Partial<EngineExpansionMetricInput> {
  if (!Array.isArray(value)) return {};
  const versions = normalizeVersions(value, allowed);
  return versions.length > 0 ? { [key]: versions } : {};
}

function releaseReadinessCloudMetrics(
  value: unknown,
  engine: 'unreal' | 'godot',
): Partial<EngineExpansionMetricInput> {
  if (!isRecord(value) || !isRecord(value.cloudMetrics)) return {};
  const metrics = value.cloudMetrics;
  if (engine === 'unreal') {
    return {
      ...optionalBool('unrealSourceReady', metrics.unrealSourceReady),
      ...optionalBool('unrealPluginStaticValidation', metrics.unrealPluginStaticValidation),
      ...optionalVersions('unrealEditorSmokeVersions', metrics.unrealEditorSmokeVersions, unrealVersions),
    };
  }
  return {
    ...optionalBool('godotSourceReady', metrics.godotSourceReady),
    ...optionalBool('godotAddonStaticValidation', metrics.godotAddonStaticValidation),
    ...optionalVersions('godotEditorSmokeVersions', metrics.godotEditorSmokeVersions, godotVersions),
  };
}

function normalizeVersions(value: readonly unknown[], allowed: readonly string[]): string[] {
  return Array.from(new Set(value.filter((item): item is string => (
    typeof item === 'string' && allowed.includes(item)
  ))));
}

function nonNegative(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

function escapeTableCell(value: string): string {
  return value.replaceAll('|', '\\|').replaceAll('\n', '<br>');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
