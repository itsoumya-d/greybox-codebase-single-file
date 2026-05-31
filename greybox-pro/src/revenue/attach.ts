// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { proModuleCatalog } from '../catalog/modules.js';
import type {
  ProModuleAttachModuleSummary,
  ProModuleAttachReport,
  ProModuleAttachShortfall,
  ProModuleAttachSnapshot,
  ProModuleAttachTargets,
  ProModuleCustomerPlan,
  ProModuleDefinition,
} from '../types.js';

const DEFAULT_ATTACH_TARGETS: ProModuleAttachTargets = {
  minAttachRateBps: 4_000,
  minMultiModuleAttachRateBps: 1_500,
  minStudioEnterpriseAttachRateBps: 6_000,
  minModulesWithActiveCustomers: 5,
  minExpansionArrCents: 250_000,
  maxChurnedProCustomerRateBps: 1_000,
};

const PAID_PLANS = new Set<ProModuleCustomerPlan>(['indie', 'studio', 'enterprise']);
const STUDIO_ENTERPRISE_PLANS = new Set<ProModuleCustomerPlan>(['studio', 'enterprise']);

export interface ProModuleAttachOptions {
  snapshots: readonly ProModuleAttachSnapshot[];
  generatedAt?: number;
  period?: ProModuleAttachReport['period'];
  targets?: Partial<ProModuleAttachTargets>;
  catalog?: readonly ProModuleDefinition[];
}

export function buildProModuleAttachReport(options: ProModuleAttachOptions): ProModuleAttachReport {
  const generatedAt = options.generatedAt ?? Date.now();
  const period = options.period ?? currentUtcMonthPeriod(generatedAt);
  const targets = attachTargets(options.targets ?? {});
  const catalog = options.catalog ?? proModuleCatalog;
  const latestSnapshots = latestSnapshotsByCustomer(options.snapshots, period);
  validateSnapshots(latestSnapshots);

  const paidCustomers = latestSnapshots.filter((snapshot) => (
    snapshot.active && PAID_PLANS.has(snapshot.plan)
  ));
  const attachedCustomers = paidCustomers.filter(hasActiveProAttach);
  const multiModuleCustomers = attachedCustomers.filter((snapshot) => uniqueModuleIds(snapshot).length >= 2);
  const studioEnterpriseCustomers = latestSnapshots.filter((snapshot) => (
    snapshot.active && STUDIO_ENTERPRISE_PLANS.has(snapshot.plan)
  ));
  const studioEnterpriseAttachedCustomers = studioEnterpriseCustomers.filter(hasActiveProAttach);
  const churnedProCustomers = latestSnapshots.filter((snapshot) => (
    !snapshot.active && isProChurn(snapshot, period)
  ));
  const activeProArrCents = sumBy(attachedCustomers, (snapshot) => snapshot.proArrCents);
  const expansionArrCents = sumBy(
    latestSnapshots.filter((snapshot) => snapshot.active),
    (snapshot) => snapshot.expansionArrCents ?? 0,
  );
  const modules = attachModuleSummaries(attachedCustomers, catalog);
  const summary: ProModuleAttachReport['summary'] = {
    paidCustomers: paidCustomers.length,
    attachedCustomers: attachedCustomers.length,
    attachRateBps: rateBps(attachedCustomers.length, paidCustomers.length),
    multiModuleCustomers: multiModuleCustomers.length,
    multiModuleAttachRateBps: rateBps(multiModuleCustomers.length, paidCustomers.length),
    studioEnterpriseCustomers: studioEnterpriseCustomers.length,
    studioEnterpriseAttachedCustomers: studioEnterpriseAttachedCustomers.length,
    studioEnterpriseAttachRateBps: rateBps(
      studioEnterpriseAttachedCustomers.length,
      studioEnterpriseCustomers.length,
    ),
    activeProArrCents,
    expansionArrCents,
    churnedProCustomers: churnedProCustomers.length,
    churnedProCustomerRateBps: rateBps(
      churnedProCustomers.length,
      attachedCustomers.length + churnedProCustomers.length,
    ),
    modulesWithActiveCustomers: modules.length,
  };
  const shortfalls = attachShortfalls(summary, targets);
  return {
    ready: shortfalls.length === 0,
    generatedAt,
    period,
    targets,
    summary,
    modules,
    shortfalls,
  };
}

export function proModuleAttachMarkdown(report: ProModuleAttachReport): string {
  const lines = [
    '# Greybox Pro Attach Readiness',
    '',
    `- Ready: ${report.ready ? 'yes' : 'no'}`,
    `- Period: ${report.period.label}`,
    `- Attach rate: ${basisPointsPercent(report.summary.attachRateBps)} / ${basisPointsPercent(report.targets.minAttachRateBps)}`,
    `- Multi-module attach: ${basisPointsPercent(report.summary.multiModuleAttachRateBps)} / ${basisPointsPercent(report.targets.minMultiModuleAttachRateBps)}`,
    `- Studio/Enterprise attach: ${basisPointsPercent(report.summary.studioEnterpriseAttachRateBps)} / ${basisPointsPercent(report.targets.minStudioEnterpriseAttachRateBps)}`,
    `- Active Pro ARR: ${money(report.summary.activeProArrCents)}`,
    `- Expansion ARR: ${money(report.summary.expansionArrCents)} / ${money(report.targets.minExpansionArrCents)}`,
    `- Pro churned customer rate: ${basisPointsPercent(report.summary.churnedProCustomerRateBps)} / ${basisPointsPercent(report.targets.maxChurnedProCustomerRateBps)} max`,
    `- Modules with active customers: ${report.summary.modulesWithActiveCustomers}/${report.targets.minModulesWithActiveCustomers}`,
    '',
    '## Shortfalls',
    ...(
      report.shortfalls.length > 0
        ? report.shortfalls.map((shortfall) => `- [${shortfall.severity}] ${shortfall.code}: ${shortfall.detail}`)
        : ['- none']
    ),
    '',
    '## Active Modules',
    ...report.modules.slice(0, 10).map((module) =>
      `- ${module.name ?? module.moduleId}: ${module.activeCustomers} active customer(s), ${money(module.proArrCents)} Pro ARR`,
    ),
  ];
  return `${lines.join('\n')}\n`;
}

function attachTargets(overrides: Partial<ProModuleAttachTargets>): ProModuleAttachTargets {
  const targets = { ...DEFAULT_ATTACH_TARGETS, ...overrides };
  for (const [key, value] of Object.entries(targets)) {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`${key} must be a non-negative integer`);
    }
  }
  for (const key of [
    'minAttachRateBps',
    'minMultiModuleAttachRateBps',
    'minStudioEnterpriseAttachRateBps',
    'maxChurnedProCustomerRateBps',
  ] as const) {
    if (targets[key] > 10_000) throw new Error(`${key} cannot exceed 10000`);
  }
  return targets;
}

function currentUtcMonthPeriod(timestamp: number): ProModuleAttachReport['period'] {
  const date = new Date(timestamp);
  const from = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
  const to = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
  return {
    from,
    to,
    label: new Date(from).toISOString().slice(0, 7),
  };
}

function latestSnapshotsByCustomer(
  snapshots: readonly ProModuleAttachSnapshot[],
  period: ProModuleAttachReport['period'],
): ProModuleAttachSnapshot[] {
  const scopedSnapshots = snapshots
    .filter((snapshot) => snapshot.observedAt >= period.from && snapshot.observedAt < period.to)
    .sort((left, right) => left.observedAt - right.observedAt || left.id.localeCompare(right.id));
  const latestByCustomer = new Map<string, ProModuleAttachSnapshot>();
  for (const snapshot of scopedSnapshots) {
    latestByCustomer.set(snapshot.customerId, snapshot);
  }
  return [...latestByCustomer.values()].sort((left, right) => left.customerId.localeCompare(right.customerId));
}

function validateSnapshots(snapshots: readonly ProModuleAttachSnapshot[]): void {
  for (const snapshot of snapshots) {
    if (!snapshot.id.trim()) throw new Error('attach snapshot id is required');
    if (!snapshot.customerId.trim()) throw new Error('attach snapshot customerId is required');
    if (!PAID_PLANS.has(snapshot.plan) && snapshot.plan !== 'free') {
      throw new Error(`attach snapshot plan is invalid: ${snapshot.plan}`);
    }
    if (!Number.isInteger(snapshot.observedAt) || snapshot.observedAt < 0) {
      throw new Error('attach snapshot observedAt must be a non-negative integer');
    }
    if (!Array.isArray(snapshot.moduleIds)) {
      throw new Error('attach snapshot moduleIds must be an array');
    }
    if (snapshot.moduleIds.some((moduleId) => !moduleId.trim())) {
      throw new Error('attach snapshot moduleIds cannot contain blank ids');
    }
    if (!Number.isInteger(snapshot.proArrCents) || snapshot.proArrCents < 0) {
      throw new Error('attach snapshot proArrCents must be a non-negative integer');
    }
    if (!Number.isInteger(snapshot.totalArrCents) || snapshot.totalArrCents < 0) {
      throw new Error('attach snapshot totalArrCents must be a non-negative integer');
    }
    if (snapshot.proArrCents > snapshot.totalArrCents) {
      throw new Error('attach snapshot proArrCents cannot exceed totalArrCents');
    }
    if (
      snapshot.expansionArrCents !== undefined
      && (!Number.isInteger(snapshot.expansionArrCents) || snapshot.expansionArrCents < 0)
    ) {
      throw new Error('attach snapshot expansionArrCents must be a non-negative integer');
    }
    if (
      snapshot.churnedAt !== undefined
      && (!Number.isInteger(snapshot.churnedAt) || snapshot.churnedAt < 0)
    ) {
      throw new Error('attach snapshot churnedAt must be a non-negative integer');
    }
    if (snapshot.active && snapshot.churnedAt !== undefined) {
      throw new Error('active attach snapshots cannot include churnedAt');
    }
  }
}

function hasActiveProAttach(snapshot: ProModuleAttachSnapshot): boolean {
  return snapshot.moduleIds.length > 0 && snapshot.proArrCents > 0;
}

function isProChurn(
  snapshot: ProModuleAttachSnapshot,
  period: ProModuleAttachReport['period'],
): boolean {
  const churnedInPeriod = snapshot.churnedAt !== undefined
    && snapshot.churnedAt >= period.from
    && snapshot.churnedAt < period.to;
  return churnedInPeriod || snapshot.moduleIds.length > 0 || snapshot.proArrCents > 0;
}

function attachModuleSummaries(
  attachedCustomers: readonly ProModuleAttachSnapshot[],
  catalog: readonly ProModuleDefinition[],
): ProModuleAttachModuleSummary[] {
  const moduleById = new Map(catalog.map((module) => [module.manifest.id, module]));
  const summaries = new Map<string, ProModuleAttachModuleSummary>();
  for (const customer of attachedCustomers) {
    const moduleIds = uniqueModuleIds(customer);
    const arrPerModule = Math.floor(customer.proArrCents / moduleIds.length);
    let remainder = customer.proArrCents - (arrPerModule * moduleIds.length);
    for (const moduleId of moduleIds) {
      const module = moduleById.get(moduleId);
      const current = summaries.get(moduleId) ?? {
        moduleId,
        ...(module?.manifest.name ? { name: module.manifest.name } : {}),
        ...(module?.category ? { category: module.category } : {}),
        activeCustomers: 0,
        proArrCents: 0,
      };
      current.activeCustomers += 1;
      current.proArrCents += arrPerModule + (remainder > 0 ? 1 : 0);
      remainder = Math.max(0, remainder - 1);
      summaries.set(moduleId, current);
    }
  }
  return [...summaries.values()].sort((left, right) => (
    right.proArrCents - left.proArrCents
    || right.activeCustomers - left.activeCustomers
    || left.moduleId.localeCompare(right.moduleId)
  ));
}

function uniqueModuleIds(snapshot: ProModuleAttachSnapshot): string[] {
  return [...new Set(snapshot.moduleIds)].sort((left, right) => left.localeCompare(right));
}

function attachShortfalls(
  summary: ProModuleAttachReport['summary'],
  targets: ProModuleAttachTargets,
): ProModuleAttachShortfall[] {
  const shortfalls: ProModuleAttachShortfall[] = [];
  if (summary.paidCustomers <= 0) {
    shortfalls.push({
      code: 'paid_customer_missing',
      severity: 'error',
      detail: 'No active paid customers were present in the attach snapshot period.',
      remediation: 'Sync current paid-customer snapshots from billing before trusting Pro attach readiness.',
    });
  }
  if (summary.attachRateBps < targets.minAttachRateBps) {
    shortfalls.push({
      code: 'attach_rate_shortfall',
      severity: 'error',
      detail: `Pro attach is ${basisPointsPercent(summary.attachRateBps)}, below ${basisPointsPercent(targets.minAttachRateBps)}.`,
      remediation: 'Bundle Pro modules into Indie onboarding, Studio trials, and enterprise success plans.',
    });
  }
  if (summary.multiModuleAttachRateBps < targets.minMultiModuleAttachRateBps) {
    shortfalls.push({
      code: 'multi_module_shortfall',
      severity: 'warning',
      detail: `Multi-module attach is ${basisPointsPercent(summary.multiModuleAttachRateBps)}, below ${basisPointsPercent(targets.minMultiModuleAttachRateBps)}.`,
      remediation: 'Promote genre packs with matching engine-export companions to increase expansion paths.',
    });
  }
  if (summary.studioEnterpriseAttachRateBps < targets.minStudioEnterpriseAttachRateBps) {
    shortfalls.push({
      code: 'studio_enterprise_attach_shortfall',
      severity: 'error',
      detail: `Studio/Enterprise attach is ${basisPointsPercent(summary.studioEnterpriseAttachRateBps)}, below ${basisPointsPercent(targets.minStudioEnterpriseAttachRateBps)}.`,
      remediation: 'Add Pro module adoption to Studio onboarding and enterprise QBR success criteria.',
    });
  }
  if (summary.modulesWithActiveCustomers < targets.minModulesWithActiveCustomers) {
    shortfalls.push({
      code: 'module_breadth_shortfall',
      severity: 'warning',
      detail: `Need ${targets.minModulesWithActiveCustomers - summary.modulesWithActiveCustomers} more module(s) with active customers.`,
      remediation: 'Drive adoption across at least five distinct Pro modules before month 18.',
    });
  }
  if (summary.expansionArrCents < targets.minExpansionArrCents) {
    shortfalls.push({
      code: 'expansion_arr_shortfall',
      severity: 'warning',
      detail: `Expansion ARR is ${money(summary.expansionArrCents)}, below ${money(targets.minExpansionArrCents)}.`,
      remediation: 'Route high-intent module usage into Studio upgrades and Enterprise all-module allocations.',
    });
  }
  if (summary.churnedProCustomerRateBps > targets.maxChurnedProCustomerRateBps) {
    shortfalls.push({
      code: 'pro_churn_too_high',
      severity: 'error',
      detail: `Pro churned customer rate is ${basisPointsPercent(summary.churnedProCustomerRateBps)}, above ${basisPointsPercent(targets.maxChurnedProCustomerRateBps)}.`,
      remediation: 'Review failed module outcomes and assign success interventions to high-risk Pro accounts.',
    });
  }
  return shortfalls;
}

function rateBps(numerator: number, denominator: number): number {
  return denominator > 0 ? Math.floor((numerator * 10_000) / denominator) : 0;
}

function basisPointsPercent(value: number): string {
  return `${(value / 100).toFixed(2)}%`;
}

function money(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function sumBy<T>(items: readonly T[], selector: (item: T) => number): number {
  return items.reduce((total, item) => total + selector(item), 0);
}
