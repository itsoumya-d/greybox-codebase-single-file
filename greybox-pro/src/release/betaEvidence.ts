// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { proModuleCatalog } from '../catalog/modules.js';
import type {
  ProModuleBetaEngine,
  ProModuleBetaValidationModuleSummary,
  ProModuleBetaValidationRecord,
  ProModuleBetaValidationReport,
  ProModuleBetaValidationShortfall,
  ProModuleBetaValidationTargets,
  ProModuleDefinition,
  ProModuleRoundTripValueType,
} from '../types.js';

const ROUND_TRIP_VALUE_TYPES: readonly ProModuleRoundTripValueType[] = ['int', 'float', 'string', 'Color', 'Vector3'];

const ENGINES = new Set<ProModuleBetaEngine>(['unity', 'unreal', 'godot']);

const DEFAULT_BETA_VALIDATION_TARGETS: ProModuleBetaValidationTargets = {
  launchModuleCount: 5,
  minDesignPartnersPerLaunchModule: 2,
  minReviewedExportsPerLaunchModule: 2,
  minAcceptedDiffRateBps: 5_000,
  maxOpenCriticalIssues: 0,
  requiredRoundTripValueTypes: [...ROUND_TRIP_VALUE_TYPES],
};

export interface ProModuleBetaValidationOptions {
  records: readonly ProModuleBetaValidationRecord[];
  generatedAt?: number;
  period?: ProModuleBetaValidationReport['period'];
  targets?: Partial<ProModuleBetaValidationTargets>;
  catalog?: readonly ProModuleDefinition[];
}

export function buildProModuleBetaValidationReport(
  options: ProModuleBetaValidationOptions,
): ProModuleBetaValidationReport {
  const generatedAt = options.generatedAt ?? Date.now();
  const period = options.period ?? currentUtcMonthPeriod(generatedAt);
  const targets = betaValidationTargets(options.targets ?? {});
  const catalog = [...(options.catalog ?? proModuleCatalog)].sort((left, right) => left.order - right.order);
  const launchModules = catalog
    .filter((module) => module.status === 'alpha-ready')
    .slice(0, targets.launchModuleCount);
  const scopedRecords = options.records
    .filter((record) => record.observedAt >= period.from && record.observedAt < period.to)
    .sort((left, right) => left.observedAt - right.observedAt || left.id.localeCompare(right.id));
  validateRecords(scopedRecords);

  const recordsByModule = new Map<string, ProModuleBetaValidationRecord[]>();
  for (const record of scopedRecords) {
    const records = recordsByModule.get(record.moduleId) ?? [];
    records.push(record);
    recordsByModule.set(record.moduleId, records);
  }

  const modules = launchModules.map((module) => betaModuleSummary(
    module,
    recordsByModule.get(module.manifest.id) ?? [],
    targets,
  ));
  const shortfalls = betaValidationShortfalls(modules, targets);
  const acceptedDiffs = sumBy(modules, (module) => module.acceptedDiffs);
  const rejectedDiffs = sumBy(modules, (module) => module.rejectedDiffs);
  const launchModuleIds = new Set(launchModules.map((module) => module.manifest.id));
  const launchRecords = scopedRecords.filter((record) => launchModuleIds.has(record.moduleId));
  const reviewedLaunchRecords = launchRecords.filter((record) => record.artifactExported && record.designerReviewed);
  return {
    ready: shortfalls.length === 0,
    generatedAt,
    period,
    targets,
    summary: {
      launchModulesEvaluated: modules.length,
      launchModulesReady: modules.filter((module) => module.ready).length,
      designPartners: new Set(reviewedLaunchRecords.map((record) => record.designPartnerId)).size,
      reviewedExports: sumBy(modules, (module) => module.reviewedExports),
      acceptedDiffs,
      rejectedDiffs,
      acceptedDiffRateBps: rateBps(acceptedDiffs, acceptedDiffs + rejectedDiffs),
      modulesWithRoundTripCoverage: modules.filter((module) => hasRoundTripCoverage(module, targets)).length,
      openCriticalIssues: sumBy(modules, (module) => module.openCriticalIssues),
    },
    modules,
    shortfalls,
  };
}

export function proModuleBetaValidationMarkdown(report: ProModuleBetaValidationReport): string {
  const lines = [
    '# Greybox Pro Beta Validation',
    '',
    `- Ready: ${report.ready ? 'yes' : 'no'}`,
    `- Period: ${report.period.label}`,
    `- Launch modules ready: ${report.summary.launchModulesReady}/${report.summary.launchModulesEvaluated}`,
    `- Design partners: ${report.summary.designPartners}`,
    `- Reviewed engine exports: ${report.summary.reviewedExports}`,
    `- Accepted diff rate: ${basisPointsPercent(report.summary.acceptedDiffRateBps)} / ${basisPointsPercent(report.targets.minAcceptedDiffRateBps)}`,
    `- Round-trip coverage: ${report.summary.modulesWithRoundTripCoverage}/${report.summary.launchModulesEvaluated}`,
    `- Open critical issues: ${report.summary.openCriticalIssues}/${report.targets.maxOpenCriticalIssues} max`,
    '',
    '## Shortfalls',
    ...(
      report.shortfalls.length > 0
        ? report.shortfalls.map((shortfall) => `- [${shortfall.severity}] ${shortfall.code}: ${shortfall.detail}`)
        : ['- none']
    ),
    '',
    '## Launch Modules',
    ...report.modules.map((module) =>
      `- ${module.name ?? module.moduleId}: ${module.designPartners} partner(s), ${module.reviewedExports} reviewed export(s), ${basisPointsPercent(module.acceptedDiffRateBps)} accepted diffs`,
    ),
  ];
  return `${lines.join('\n')}\n`;
}

function betaModuleSummary(
  module: ProModuleDefinition,
  records: readonly ProModuleBetaValidationRecord[],
  targets: ProModuleBetaValidationTargets,
): ProModuleBetaValidationModuleSummary {
  const reviewedRecords = records.filter((record) => record.artifactExported && record.designerReviewed);
  const acceptedDiffs = sumBy(reviewedRecords, (record) => record.acceptedDiffs);
  const rejectedDiffs = sumBy(reviewedRecords, (record) => record.rejectedDiffs);
  const summary: ProModuleBetaValidationModuleSummary = {
    moduleId: module.manifest.id,
    ...(module.manifest.name ? { name: module.manifest.name } : {}),
    ...(module.category ? { category: module.category } : {}),
    designPartners: new Set(reviewedRecords.map((record) => record.designPartnerId)).size,
    reviewedExports: reviewedRecords.length,
    acceptedDiffs,
    rejectedDiffs,
    acceptedDiffRateBps: rateBps(acceptedDiffs, acceptedDiffs + rejectedDiffs),
    engines: sortedEngines(reviewedRecords.flatMap((record) => [record.engine])),
    roundTripValueTypes: sortedValueTypes(reviewedRecords.flatMap((record) => record.roundTripValueTypes)),
    openCriticalIssues: sumBy(records, (record) => record.openCriticalIssues),
    ready: false,
  };
  summary.ready = moduleReady(summary, targets);
  return summary;
}

function betaValidationShortfalls(
  modules: readonly ProModuleBetaValidationModuleSummary[],
  targets: ProModuleBetaValidationTargets,
): ProModuleBetaValidationShortfall[] {
  const shortfalls: ProModuleBetaValidationShortfall[] = [];
  if (modules.length < targets.launchModuleCount) {
    shortfalls.push({
      code: 'launch_module_evidence_missing',
      severity: 'error',
      detail: `Need ${targets.launchModuleCount - modules.length} more launch module(s) in the beta validation train.`,
      remediation: 'Promote enough alpha-ready paid modules before claiming Pro beta validation.',
    });
  }
  for (const module of modules) {
    if (module.designPartners < targets.minDesignPartnersPerLaunchModule) {
      shortfalls.push({
        code: 'design_partner_shortfall',
        severity: 'error',
        moduleId: module.moduleId,
        detail: `${module.name ?? module.moduleId} has ${module.designPartners} validated design partner(s), below ${targets.minDesignPartnersPerLaunchModule}.`,
        remediation: 'Run the module with at least two distinct paid beta partners and record reviewed export evidence.',
      });
    }
    if (module.reviewedExports < targets.minReviewedExportsPerLaunchModule) {
      shortfalls.push({
        code: 'reviewed_export_shortfall',
        severity: 'error',
        moduleId: module.moduleId,
        detail: `${module.name ?? module.moduleId} has ${module.reviewedExports} reviewed engine export(s), below ${targets.minReviewedExportsPerLaunchModule}.`,
        remediation: 'Capture human-reviewed exports before treating the module as sale-ready.',
      });
    }
    if (!hasRoundTripCoverage(module, targets)) {
      const missing = targets.requiredRoundTripValueTypes.filter((valueType) => !module.roundTripValueTypes.includes(valueType));
      shortfalls.push({
        code: 'round_trip_field_coverage_missing',
        severity: 'error',
        moduleId: module.moduleId,
        detail: `${module.name ?? module.moduleId} is missing beta coverage for ${missing.join(', ')} round-trip field type(s).`,
        remediation: 'Verify int, float, string, Color, and Vector3 fields through accepted designer-reviewed exports.',
      });
    }
    if (module.acceptedDiffRateBps < targets.minAcceptedDiffRateBps) {
      shortfalls.push({
        code: 'accepted_diff_rate_shortfall',
        severity: 'warning',
        moduleId: module.moduleId,
        detail: `${module.name ?? module.moduleId} accepted diff rate is ${basisPointsPercent(module.acceptedDiffRateBps)}, below ${basisPointsPercent(targets.minAcceptedDiffRateBps)}.`,
        remediation: 'Tune module prompts and defaults until design partners accept a majority of reviewed diffs.',
      });
    }
    if (module.openCriticalIssues > targets.maxOpenCriticalIssues) {
      shortfalls.push({
        code: 'critical_issue_open',
        severity: 'error',
        moduleId: module.moduleId,
        detail: `${module.name ?? module.moduleId} has ${module.openCriticalIssues} open critical beta issue(s).`,
        remediation: 'Resolve critical partner-reported bugs before adding the module to revenue proof.',
      });
    }
  }
  return shortfalls;
}

function moduleReady(
  module: ProModuleBetaValidationModuleSummary,
  targets: ProModuleBetaValidationTargets,
): boolean {
  return module.designPartners >= targets.minDesignPartnersPerLaunchModule
    && module.reviewedExports >= targets.minReviewedExportsPerLaunchModule
    && module.acceptedDiffRateBps >= targets.minAcceptedDiffRateBps
    && module.openCriticalIssues <= targets.maxOpenCriticalIssues
    && hasRoundTripCoverage(module, targets);
}

function hasRoundTripCoverage(
  module: ProModuleBetaValidationModuleSummary,
  targets: ProModuleBetaValidationTargets,
): boolean {
  return targets.requiredRoundTripValueTypes.every((valueType) => module.roundTripValueTypes.includes(valueType));
}

function betaValidationTargets(
  overrides: Partial<ProModuleBetaValidationTargets>,
): ProModuleBetaValidationTargets {
  const targets = { ...DEFAULT_BETA_VALIDATION_TARGETS, ...overrides };
  for (const key of [
    'launchModuleCount',
    'minDesignPartnersPerLaunchModule',
    'minReviewedExportsPerLaunchModule',
    'minAcceptedDiffRateBps',
    'maxOpenCriticalIssues',
  ] as const) {
    const value = targets[key];
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`${key} must be a non-negative integer`);
    }
  }
  if (targets.minAcceptedDiffRateBps > 10_000) {
    throw new Error('minAcceptedDiffRateBps cannot exceed 10000');
  }
  if (!Array.isArray(targets.requiredRoundTripValueTypes) || targets.requiredRoundTripValueTypes.length === 0) {
    throw new Error('requiredRoundTripValueTypes must be a non-empty array');
  }
  for (const valueType of targets.requiredRoundTripValueTypes) {
    if (!ROUND_TRIP_VALUE_TYPES.includes(valueType)) {
      throw new Error(`requiredRoundTripValueTypes contains unsupported value type: ${valueType}`);
    }
  }
  return {
    ...targets,
    requiredRoundTripValueTypes: uniqueValueTypes(targets.requiredRoundTripValueTypes),
  };
}

function validateRecords(records: readonly ProModuleBetaValidationRecord[]): void {
  for (const record of records) {
    if (!record.id.trim()) throw new Error('beta validation record id is required');
    if (!record.moduleId.trim()) throw new Error('beta validation record moduleId is required');
    if (!record.designPartnerId.trim()) throw new Error('beta validation record designPartnerId is required');
    if (!Number.isInteger(record.observedAt) || record.observedAt < 0) {
      throw new Error('beta validation record observedAt must be a non-negative integer');
    }
    if (!ENGINES.has(record.engine)) {
      throw new Error(`beta validation record engine is invalid: ${record.engine}`);
    }
    for (const key of ['acceptedDiffs', 'rejectedDiffs', 'openCriticalIssues'] as const) {
      if (!Number.isInteger(record[key]) || record[key] < 0) {
        throw new Error(`beta validation record ${key} must be a non-negative integer`);
      }
    }
    if (!Array.isArray(record.roundTripValueTypes)) {
      throw new Error('beta validation record roundTripValueTypes must be an array');
    }
    for (const valueType of record.roundTripValueTypes) {
      if (!ROUND_TRIP_VALUE_TYPES.includes(valueType)) {
        throw new Error(`beta validation record has unsupported round-trip value type: ${valueType}`);
      }
    }
  }
}

function currentUtcMonthPeriod(timestamp: number): ProModuleBetaValidationReport['period'] {
  const date = new Date(timestamp);
  const from = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
  const to = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
  return {
    from,
    to,
    label: new Date(from).toISOString().slice(0, 7),
  };
}

function sortedEngines(values: readonly ProModuleBetaEngine[]): ProModuleBetaEngine[] {
  const order = new Map<ProModuleBetaEngine, number>([
    ['unity', 0],
    ['unreal', 1],
    ['godot', 2],
  ]);
  return [...new Set(values)].sort((left, right) => (order.get(left) ?? 99) - (order.get(right) ?? 99));
}

function sortedValueTypes(values: readonly ProModuleRoundTripValueType[]): ProModuleRoundTripValueType[] {
  return [...new Set(values)].sort((left, right) => (
    ROUND_TRIP_VALUE_TYPES.indexOf(left) - ROUND_TRIP_VALUE_TYPES.indexOf(right)
  ));
}

function uniqueValueTypes(values: readonly ProModuleRoundTripValueType[]): ProModuleRoundTripValueType[] {
  return sortedValueTypes(values);
}

function rateBps(numerator: number, denominator: number): number {
  return denominator > 0 ? Math.floor((numerator * 10_000) / denominator) : 0;
}

function basisPointsPercent(value: number): string {
  return `${(value / 100).toFixed(2)}%`;
}

function sumBy<T>(items: readonly T[], selector: (item: T) => number): number {
  return items.reduce((total, item) => total + selector(item), 0);
}
