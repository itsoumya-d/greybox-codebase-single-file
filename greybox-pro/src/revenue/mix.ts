// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { proModuleCatalog } from '../catalog/modules.js';
import type {
  ProModuleDefinition,
  ProModuleRevenueMixReport,
  ProModuleRevenueMixShortfall,
  ProModuleRevenueMixTargets,
  ProModuleRevenueModuleSummary,
  ProModuleRevenueRecord,
} from '../types.js';

const DEFAULT_REVENUE_MIX_TARGETS: ProModuleRevenueMixTargets = {
  proRevenueShareBps: 3_000,
  minModulesWithRevenue: 5,
  minPayingCustomers: 50,
  maxSingleModuleProRevenueShareBps: 4_000,
  maxSingleCustomerProRevenueShareBps: 4_000,
};

export interface ProModuleRevenueMixOptions {
  records: readonly ProModuleRevenueRecord[];
  totalArrCents: number;
  generatedAt?: number;
  period?: ProModuleRevenueMixReport['period'];
  targets?: Partial<ProModuleRevenueMixTargets>;
  catalog?: readonly ProModuleDefinition[];
}

export function buildProModuleRevenueMixReport(
  options: ProModuleRevenueMixOptions,
): ProModuleRevenueMixReport {
  if (!Number.isInteger(options.totalArrCents) || options.totalArrCents < 0) {
    throw new Error('totalArrCents must be a non-negative integer');
  }
  const generatedAt = options.generatedAt ?? Date.now();
  const period = options.period ?? currentUtcMonthPeriod(generatedAt);
  const targets = revenueMixTargets(options.targets ?? {});
  const catalog = options.catalog ?? proModuleCatalog;
  const scopedRecords = options.records
    .filter((record) => record.occurredAt >= period.from && record.occurredAt < period.to)
    .sort((left, right) => left.occurredAt - right.occurredAt || left.id.localeCompare(right.id));
  validateRecords(scopedRecords);
  const modules = revenueModuleSummaries(scopedRecords, catalog);
  const proArrContributionCents = sum(scopedRecords, 'arrContributionCents');
  const topModuleArrContributionCents = modules[0]?.arrContributionCents ?? 0;
  const topCustomerArrContributionCents = topCustomerArrContribution(scopedRecords);
  const summary = {
    totalArrCents: options.totalArrCents,
    proArrContributionCents,
    proRevenueShareBps: rateBps(proArrContributionCents, options.totalArrCents),
    revenueCents: sum(scopedRecords, 'amountCents'),
    orders: scopedRecords.length,
    modulesWithRevenue: modules.length,
    payingCustomers: new Set(scopedRecords.map((record) => record.customerId)).size,
    topModuleProRevenueShareBps: rateBps(topModuleArrContributionCents, proArrContributionCents),
    topCustomerProRevenueShareBps: rateBps(topCustomerArrContributionCents, proArrContributionCents),
  };
  const shortfalls = revenueMixShortfalls(summary, targets);
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

export function proRevenueMixMarkdown(report: ProModuleRevenueMixReport): string {
  const lines = [
    '# Greybox Pro Revenue Mix',
    '',
    `- Ready: ${report.ready ? 'yes' : 'no'}`,
    `- Period: ${report.period.label}`,
    `- Pro ARR share: ${basisPointsPercent(report.summary.proRevenueShareBps)} / ${basisPointsPercent(report.targets.proRevenueShareBps)}`,
    `- Pro ARR contribution: ${money(report.summary.proArrContributionCents)}`,
    `- Total ARR: ${money(report.summary.totalArrCents)}`,
    `- Modules with revenue: ${report.summary.modulesWithRevenue}/${report.targets.minModulesWithRevenue}`,
    `- Paying customers: ${report.summary.payingCustomers}/${report.targets.minPayingCustomers}`,
    `- Single-module concentration: ${basisPointsPercent(report.summary.topModuleProRevenueShareBps)} / ${basisPointsPercent(report.targets.maxSingleModuleProRevenueShareBps)} max`,
    `- Single-customer concentration: ${basisPointsPercent(report.summary.topCustomerProRevenueShareBps)} / ${basisPointsPercent(report.targets.maxSingleCustomerProRevenueShareBps)} max`,
    '',
    '## Shortfalls',
    ...(
      report.shortfalls.length > 0
        ? report.shortfalls.map((shortfall) => `- [${shortfall.severity}] ${shortfall.code}: ${shortfall.detail}`)
        : ['- none']
    ),
    '',
    '## Top Modules',
    ...report.modules.slice(0, 10).map((module) =>
      `- ${module.name ?? module.moduleId}: ${money(module.arrContributionCents)} ARR, ${module.payingCustomers} customer(s)`,
    ),
  ];
  return `${lines.join('\n')}\n`;
}

function revenueMixTargets(overrides: Partial<ProModuleRevenueMixTargets>): ProModuleRevenueMixTargets {
  const targets = { ...DEFAULT_REVENUE_MIX_TARGETS, ...overrides };
  for (const [key, value] of Object.entries(targets)) {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`${key} must be a non-negative integer`);
    }
  }
  if (targets.proRevenueShareBps > 10_000) throw new Error('proRevenueShareBps cannot exceed 10000');
  if (targets.maxSingleModuleProRevenueShareBps > 10_000) {
    throw new Error('maxSingleModuleProRevenueShareBps cannot exceed 10000');
  }
  if (targets.maxSingleCustomerProRevenueShareBps > 10_000) {
    throw new Error('maxSingleCustomerProRevenueShareBps cannot exceed 10000');
  }
  return targets;
}

function currentUtcMonthPeriod(timestamp: number): ProModuleRevenueMixReport['period'] {
  const date = new Date(timestamp);
  const from = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
  const to = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
  return {
    from,
    to,
    label: new Date(from).toISOString().slice(0, 7),
  };
}

function validateRecords(records: readonly ProModuleRevenueRecord[]): void {
  for (const record of records) {
    if (!record.id.trim()) throw new Error('revenue record id is required');
    if (!record.moduleId.trim()) throw new Error('revenue record moduleId is required');
    if (!record.customerId.trim()) throw new Error('revenue record customerId is required');
    if (!Number.isInteger(record.amountCents) || record.amountCents < 0) {
      throw new Error('revenue record amountCents must be a non-negative integer');
    }
    if (!Number.isInteger(record.arrContributionCents) || record.arrContributionCents < 0) {
      throw new Error('revenue record arrContributionCents must be a non-negative integer');
    }
  }
}

function revenueModuleSummaries(
  records: readonly ProModuleRevenueRecord[],
  catalog: readonly ProModuleDefinition[],
): ProModuleRevenueModuleSummary[] {
  const moduleById = new Map(catalog.map((module) => [module.manifest.id, module]));
  const customersByModule = new Map<string, Set<string>>();
  const summaries = new Map<string, ProModuleRevenueModuleSummary>();
  for (const record of records) {
    const module = moduleById.get(record.moduleId);
    const current = summaries.get(record.moduleId) ?? {
      moduleId: record.moduleId,
      ...(module?.manifest.name ? { name: module.manifest.name } : {}),
      ...(module?.category ? { category: module.category } : {}),
      revenueCents: 0,
      arrContributionCents: 0,
      orders: 0,
      payingCustomers: 0,
    };
    current.revenueCents += record.amountCents;
    current.arrContributionCents += record.arrContributionCents;
    current.orders += 1;
    const customers = customersByModule.get(record.moduleId) ?? new Set<string>();
    customers.add(record.customerId);
    customersByModule.set(record.moduleId, customers);
    current.payingCustomers = customers.size;
    summaries.set(record.moduleId, current);
  }
  return [...summaries.values()].sort((left, right) => (
    right.arrContributionCents - left.arrContributionCents
    || right.revenueCents - left.revenueCents
    || left.moduleId.localeCompare(right.moduleId)
  ));
}

function topCustomerArrContribution(records: readonly ProModuleRevenueRecord[]): number {
  const totalsByCustomer = new Map<string, number>();
  for (const record of records) {
    totalsByCustomer.set(
      record.customerId,
      (totalsByCustomer.get(record.customerId) ?? 0) + record.arrContributionCents,
    );
  }
  let top = 0;
  for (const amount of totalsByCustomer.values()) top = Math.max(top, amount);
  return top;
}

function revenueMixShortfalls(
  summary: ProModuleRevenueMixReport['summary'],
  targets: ProModuleRevenueMixTargets,
): ProModuleRevenueMixShortfall[] {
  const shortfalls: ProModuleRevenueMixShortfall[] = [];
  if (summary.totalArrCents <= 0) {
    shortfalls.push({
      code: 'total_arr_missing',
      severity: 'error',
      detail: 'Total ARR must be greater than zero before Pro revenue share can be trusted.',
      remediation: 'Pass current company ARR from billing analytics into the Pro revenue report.',
    });
  }
  if (summary.proRevenueShareBps < targets.proRevenueShareBps) {
    shortfalls.push({
      code: 'pro_revenue_share_shortfall',
      severity: 'error',
      detail: `Pro revenue share is ${basisPointsPercent(summary.proRevenueShareBps)}, below ${basisPointsPercent(targets.proRevenueShareBps)}.`,
      remediation: 'Increase paid module attach, Studio bundle allocation, or enterprise module allocation.',
    });
  }
  if (summary.modulesWithRevenue < targets.minModulesWithRevenue) {
    shortfalls.push({
      code: 'module_revenue_shortfall',
      severity: 'warning',
      detail: `Need ${targets.minModulesWithRevenue - summary.modulesWithRevenue} more module(s) with revenue.`,
      remediation: 'Drive paid adoption across at least five differentiated Pro modules.',
    });
  }
  if (summary.payingCustomers < targets.minPayingCustomers) {
    shortfalls.push({
      code: 'paying_customer_shortfall',
      severity: 'warning',
      detail: `Need ${targets.minPayingCustomers - summary.payingCustomers} more paying Pro customer(s).`,
      remediation: 'Bundle first five Pro modules into onboarding offers and Studio expansion plays.',
    });
  }
  if (summary.topModuleProRevenueShareBps > targets.maxSingleModuleProRevenueShareBps) {
    shortfalls.push({
      code: 'module_concentration_too_high',
      severity: 'warning',
      detail: `Largest Pro module contributes ${basisPointsPercent(summary.topModuleProRevenueShareBps)} of Pro ARR, above ${basisPointsPercent(targets.maxSingleModuleProRevenueShareBps)}.`,
      remediation: 'Reduce module concentration by selling differentiated packs across at least five paid use cases.',
    });
  }
  if (summary.topCustomerProRevenueShareBps > targets.maxSingleCustomerProRevenueShareBps) {
    shortfalls.push({
      code: 'customer_concentration_too_high',
      severity: 'error',
      detail: `Largest Pro customer contributes ${basisPointsPercent(summary.topCustomerProRevenueShareBps)} of Pro ARR, above ${basisPointsPercent(targets.maxSingleCustomerProRevenueShareBps)}.`,
      remediation: 'Treat customer concentration as acquisition diligence risk and grow repeatable Pro adoption before claiming readiness.',
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

function sum<T extends Record<K, number>, K extends keyof T>(items: readonly T[], key: K): number {
  return items.reduce((total, item) => total + item[key], 0);
}
