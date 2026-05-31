// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from 'node:crypto';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  ActivationFunnelEvent,
  ActivationFunnelStep,
  EngineShipmentEngine,
  EngineShipmentRecord,
  NorthStarAnalytics,
  NorthStarWeek,
  ProductAnalyticsDashboard,
  ProductAnalyticsPostHogDashboardProvisionResponse,
  ProductAnalyticsPostHogDashboardSeed,
  ProductAnalyticsPostHogInsightSeed,
  ProductAnalyticsPostHogPayload,
  ProductAnalyticsWeeklyReport,
  ProductUsageEvent,
  ProductUsageKind,
  ProductUsageOutcome,
  ProductUsageSummaryItem,
  PlaytestPersonaUsageSummaryItem,
  RetentionCohortSummary,
  RetentionPeriod,
  RevenueRetentionCohortSummary,
  RevenueRetentionEvent,
} from '@ai-game-design-studio/contracts/api/product-analytics';

export type {
  ActivationFunnelEvent,
  ActivationFunnelStep,
  EngineShipmentEngine,
  EngineShipmentRecord,
  NorthStarAnalytics,
  NorthStarWeek,
  ProductAnalyticsDashboard,
  ProductAnalyticsPostHogDashboardProvisionResponse,
  ProductAnalyticsPostHogDashboardSeed,
  ProductAnalyticsPostHogPayload,
  ProductAnalyticsWeeklyReport,
  ProductUsageEvent,
  ProductUsageKind,
  ProductUsageOutcome,
  RevenueRetentionEvent,
} from '@ai-game-design-studio/contracts/api/product-analytics';

const PRODUCT_ANALYTICS_DIR = '.agds/product-analytics';
const ENGINE_SHIPMENTS_FILE = 'engine-shipments.jsonl';
const ACTIVATION_EVENTS_FILE = 'activation-events.jsonl';
const PRODUCT_USAGE_FILE = 'product-usage.jsonl';
const REVENUE_RETENTION_FILE = 'revenue-retention.jsonl';
const SLACK_WEEKLY_STATE_FILE = 'slack-weekly-state.json';
const MAX_LIST_EVENTS = 10_000;

type NormalizeResult =
  | { ok: true; event: EngineShipmentRecord }
  | { ok: false; error: string };

interface ActivationEventInput {
  step: ActivationFunnelStep;
  designerId: string;
  projectId?: string;
  fileName?: string;
  source?: string;
  occurredAt?: number;
}

interface ProductUsageEventInput {
  kind: ProductUsageKind;
  itemId: string;
  designerId: string;
  projectId?: string;
  source?: string;
  outcome?: ProductUsageOutcome;
  occurredAt?: number;
}

type RevenueRetentionNormalizeResult =
  | { ok: true; event: RevenueRetentionEvent }
  | { ok: false; error: string };

export interface ProductAnalyticsSlackWeeklyState {
  lastSentWeekStart?: string;
  lastSentAt?: number;
}

const ACTIVATION_FUNNEL_STEPS: ActivationFunnelStep[] = [
  'signup',
  'first_project',
  'first_artifact',
  'first_save',
  'first_engine_export',
];

const ACTIVATION_STEP_LABELS: Record<ActivationFunnelStep, string> = {
  signup: 'Signup',
  first_project: 'First project',
  first_artifact: 'First artifact',
  first_save: 'First save',
  first_engine_export: 'First engine export',
};

const ENGINE_SET = new Set<EngineShipmentEngine>(['unity', 'unreal', 'godot']);
const PRODUCT_USAGE_KINDS = new Set<ProductUsageKind>(['skill', 'game_art_bible', 'playtest_persona']);
const PRODUCT_USAGE_OUTCOMES = new Set<ProductUsageOutcome>(['used', 'attempted', 'completed']);
const RETENTION_PERIODS: Array<{ period: RetentionPeriod; label: string; days: number }> = [
  { period: 'd1', label: 'D1', days: 1 },
  { period: 'd7', label: 'D7', days: 7 },
  { period: 'd28', label: 'D28', days: 28 },
  { period: 'm3', label: 'M3', days: 90 },
  { period: 'm6', label: 'M6', days: 180 },
];
const DAY_MS = 24 * 60 * 60 * 1000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cleanString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const clean = value.replace(/\0/g, '').trim();
  return clean ? clean.slice(0, maxLength) : undefined;
}

function cleanTimestamp(value: unknown, fallback: number): number {
  const timestamp = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : fallback;
}

function cleanCents(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.round(n);
}

function cleanMonth(value: unknown): string | undefined {
  const clean = cleanString(value, 16);
  if (!clean || !/^\d{4}-\d{2}$/.test(clean)) return undefined;
  const month = Number(clean.slice(5, 7));
  if (month < 1 || month > 12) return undefined;
  return clean;
}

function normalizeEngine(value: unknown): EngineShipmentEngine | undefined {
  const clean = cleanString(value, 32)?.toLowerCase();
  if (!clean || !ENGINE_SET.has(clean as EngineShipmentEngine)) return undefined;
  return clean as EngineShipmentEngine;
}

export function normalizeEngineShipmentEvent(
  input: unknown,
  projectId: string,
  fallbackDesignerId: string,
  receivedAt = Date.now(),
): NormalizeResult {
  const body = isRecord(input) ? input : {};
  const engine = normalizeEngine(body.engine);
  if (!engine) return { ok: false, error: 'engine must be one of unity, unreal, or godot' };

  const designerId = cleanString(body.designerId, 128) ?? cleanString(fallbackDesignerId, 128) ?? 'local-designer';
  const artifactId = cleanString(body.artifactId, 160);
  const fileName = cleanString(body.fileName, 512);
  const source = cleanString(body.source, 80);
  if (!artifactId && !fileName) return { ok: false, error: 'artifactId or fileName is required' };

  return {
    ok: true,
    event: {
      id: randomUUID(),
      type: 'engine_shipment',
      projectId,
      engine,
      designerId,
      shippedAt: cleanTimestamp(body.shippedAt ?? body.timestamp, receivedAt),
      receivedAt,
      ...(artifactId ? { artifactId } : {}),
      ...(fileName ? { fileName } : {}),
      ...(source ? { source } : {}),
    },
  };
}

function analyticsFile(projectDir: string): string {
  return path.join(projectDir, PRODUCT_ANALYTICS_DIR, ENGINE_SHIPMENTS_FILE);
}

function runtimeAnalyticsFile(dataDir: string, fileName: string): string {
  return path.join(dataDir, PRODUCT_ANALYTICS_DIR, fileName);
}

export async function appendEngineShipmentEvent(projectDir: string, event: EngineShipmentRecord): Promise<void> {
  await mkdir(path.dirname(analyticsFile(projectDir)), { recursive: true });
  await appendFile(analyticsFile(projectDir), `${JSON.stringify(event)}\n`, 'utf8');
}

export async function readEngineShipmentEvents(projectDir: string, limit = 1000): Promise<EngineShipmentRecord[]> {
  const safeLimit = Math.max(1, Math.min(MAX_LIST_EVENTS, Math.trunc(limit || 1000)));
  let body = '';
  try {
    body = await readFile(analyticsFile(projectDir), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  return body
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      try {
        return JSON.parse(line) as EngineShipmentRecord;
      } catch {
        return null;
      }
    })
    .filter((event): event is EngineShipmentRecord => Boolean(event))
    .slice(-safeLimit);
}

export function createActivationFunnelEvent(
  input: ActivationEventInput,
  receivedAt = Date.now(),
): ActivationFunnelEvent {
  return {
    id: randomUUID(),
    type: 'activation_funnel',
    step: input.step,
    designerId: cleanString(input.designerId, 128) ?? 'local-designer',
    occurredAt: cleanTimestamp(input.occurredAt, receivedAt),
    receivedAt,
    ...(input.projectId ? { projectId: cleanString(input.projectId, 160) ?? input.projectId } : {}),
    ...(input.fileName ? { fileName: cleanString(input.fileName, 512) ?? input.fileName } : {}),
    ...(input.source ? { source: cleanString(input.source, 80) ?? input.source } : {}),
  };
}

export async function appendActivationFunnelEvent(dataDir: string, event: ActivationFunnelEvent): Promise<void> {
  const file = runtimeAnalyticsFile(dataDir, ACTIVATION_EVENTS_FILE);
  await mkdir(path.dirname(file), { recursive: true });
  await appendFile(file, `${JSON.stringify(event)}\n`, 'utf8');
}

export async function readActivationFunnelEvents(dataDir: string, limit = 1000): Promise<ActivationFunnelEvent[]> {
  const safeLimit = Math.max(1, Math.min(MAX_LIST_EVENTS, Math.trunc(limit || 1000)));
  let body = '';
  try {
    body = await readFile(runtimeAnalyticsFile(dataDir, ACTIVATION_EVENTS_FILE), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  return body
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      try {
        return JSON.parse(line) as ActivationFunnelEvent;
      } catch {
        return null;
      }
    })
    .filter((event): event is ActivationFunnelEvent => Boolean(event))
    .filter((event) => ACTIVATION_FUNNEL_STEPS.includes(event.step))
    .slice(-safeLimit);
}

export function createProductUsageEvent(
  input: ProductUsageEventInput,
  receivedAt = Date.now(),
): ProductUsageEvent | null {
  if (!PRODUCT_USAGE_KINDS.has(input.kind)) return null;
  const itemId = cleanString(input.itemId, 160);
  if (!itemId) return null;
  const outcome = input.outcome && PRODUCT_USAGE_OUTCOMES.has(input.outcome) ? input.outcome : undefined;
  return {
    id: randomUUID(),
    type: 'product_usage',
    kind: input.kind,
    itemId,
    designerId: cleanString(input.designerId, 128) ?? 'local-designer',
    occurredAt: cleanTimestamp(input.occurredAt, receivedAt),
    receivedAt,
    ...(input.projectId ? { projectId: cleanString(input.projectId, 160) ?? input.projectId } : {}),
    ...(input.source ? { source: cleanString(input.source, 80) ?? input.source } : {}),
    ...(outcome ? { outcome } : {}),
  };
}

export async function appendProductUsageEvent(dataDir: string, event: ProductUsageEvent): Promise<void> {
  const file = runtimeAnalyticsFile(dataDir, PRODUCT_USAGE_FILE);
  await mkdir(path.dirname(file), { recursive: true });
  await appendFile(file, `${JSON.stringify(event)}\n`, 'utf8');
}

export async function readProductUsageEvents(dataDir: string, limit = 1000): Promise<ProductUsageEvent[]> {
  const safeLimit = Math.max(1, Math.min(MAX_LIST_EVENTS, Math.trunc(limit || 1000)));
  let body = '';
  try {
    body = await readFile(runtimeAnalyticsFile(dataDir, PRODUCT_USAGE_FILE), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  return body
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      try {
        return JSON.parse(line) as ProductUsageEvent;
      } catch {
        return null;
      }
    })
    .filter((event): event is ProductUsageEvent => Boolean(event))
    .filter((event) => PRODUCT_USAGE_KINDS.has(event.kind) && Boolean(cleanString(event.itemId, 160)))
    .slice(-safeLimit);
}

export function normalizeRevenueRetentionEvent(
  input: unknown,
  receivedAt = Date.now(),
): RevenueRetentionNormalizeResult {
  const body = isRecord(input) ? input : {};
  const accountId = cleanString(body.accountId, 160);
  if (!accountId) return { ok: false, error: 'accountId is required' };
  const signupMonth = cleanMonth(body.signupMonth);
  if (!signupMonth) return { ok: false, error: 'signupMonth must be YYYY-MM' };
  const periodMonth = cleanMonth(body.periodMonth);
  if (!periodMonth) return { ok: false, error: 'periodMonth must be YYYY-MM' };
  const startingMrrCents = cleanCents(body.startingMrrCents);
  if (startingMrrCents === undefined) return { ok: false, error: 'startingMrrCents must be a non-negative number' };
  const currentMrrCents = cleanCents(body.currentMrrCents);
  if (currentMrrCents === undefined) return { ok: false, error: 'currentMrrCents must be a non-negative number' };
  const source = cleanString(body.source, 80);
  return {
    ok: true,
    event: {
      id: randomUUID(),
      type: 'revenue_retention',
      accountId,
      signupMonth,
      periodMonth,
      startingMrrCents,
      currentMrrCents,
      receivedAt,
      ...(source ? { source } : {}),
    },
  };
}

export async function appendRevenueRetentionEvent(dataDir: string, event: RevenueRetentionEvent): Promise<void> {
  const file = runtimeAnalyticsFile(dataDir, REVENUE_RETENTION_FILE);
  await mkdir(path.dirname(file), { recursive: true });
  await appendFile(file, `${JSON.stringify(event)}\n`, 'utf8');
}

export async function readRevenueRetentionEvents(dataDir: string, limit = 1000): Promise<RevenueRetentionEvent[]> {
  const safeLimit = Math.max(1, Math.min(MAX_LIST_EVENTS, Math.trunc(limit || 1000)));
  let body = '';
  try {
    body = await readFile(runtimeAnalyticsFile(dataDir, REVENUE_RETENTION_FILE), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  return body
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      try {
        return JSON.parse(line) as RevenueRetentionEvent;
      } catch {
        return null;
      }
    })
    .filter((event): event is RevenueRetentionEvent => Boolean(event))
    .filter((event) => Boolean(cleanString(event.accountId, 160)) && Boolean(cleanMonth(event.signupMonth)) && Boolean(cleanMonth(event.periodMonth)))
    .slice(-safeLimit);
}

export async function readProductAnalyticsSlackWeeklyState(
  dataDir: string,
): Promise<ProductAnalyticsSlackWeeklyState> {
  try {
    const body = await readFile(runtimeAnalyticsFile(dataDir, SLACK_WEEKLY_STATE_FILE), 'utf8');
    const parsed = JSON.parse(body);
    if (!isRecord(parsed)) return {};
    const lastSentWeekStart = cleanString(parsed.lastSentWeekStart, 16);
    const lastSentAt = typeof parsed.lastSentAt === 'number' && Number.isFinite(parsed.lastSentAt) && parsed.lastSentAt > 0
      ? parsed.lastSentAt
      : undefined;
    return {
      ...(lastSentWeekStart && /^\d{4}-\d{2}-\d{2}$/.test(lastSentWeekStart) ? { lastSentWeekStart } : {}),
      ...(lastSentAt ? { lastSentAt } : {}),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    return {};
  }
}

export async function writeProductAnalyticsSlackWeeklyState(
  dataDir: string,
  state: ProductAnalyticsSlackWeeklyState,
): Promise<void> {
  const file = runtimeAnalyticsFile(dataDir, SLACK_WEEKLY_STATE_FILE);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

export function startOfUtcWeek(timestamp: number): number {
  const date = new Date(timestamp);
  const day = date.getUTCDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - daysSinceMonday);
}

function startOfUtcDay(timestamp: number): number {
  const date = new Date(timestamp);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function dayKey(timestamp: number): string {
  return new Date(startOfUtcDay(timestamp)).toISOString().slice(0, 10);
}

function weekKey(timestamp: number): string {
  return new Date(startOfUtcWeek(timestamp)).toISOString().slice(0, 10);
}

function emptyWeek(weekStart: string): NorthStarWeek {
  return {
    weekStart,
    activeDesigners: 0,
    shipments: 0,
    projectCount: 0,
    byEngine: { unity: 0, unreal: 0, godot: 0 },
  };
}

export function buildNorthStarAnalytics(
  events: EngineShipmentRecord[],
  options: { now?: number; weeks?: number } = {},
): NorthStarAnalytics {
  const generatedAt = options.now ?? Date.now();
  const weekCount = Math.max(1, Math.min(52, Math.trunc(options.weeks ?? 12)));
  const currentWeekStart = startOfUtcWeek(generatedAt);
  const weeks: NorthStarWeek[] = [];
  const designersByWeek = new Map<string, Set<string>>();
  const projectsByWeek = new Map<string, Set<string>>();

  for (let index = weekCount - 1; index >= 0; index -= 1) {
    const weekStart = new Date(currentWeekStart - index * 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    weeks.push(emptyWeek(weekStart));
    designersByWeek.set(weekStart, new Set());
    projectsByWeek.set(weekStart, new Set());
  }

  const weeksByKey = new Map(weeks.map((week) => [week.weekStart, week]));
  for (const event of events) {
    const key = weekKey(event.shippedAt);
    const week = weeksByKey.get(key);
    if (!week) continue;
    week.shipments += 1;
    week.byEngine[event.engine] += 1;
    designersByWeek.get(key)?.add(event.designerId);
    projectsByWeek.get(key)?.add(event.projectId);
  }

  for (const week of weeks) {
    week.activeDesigners = designersByWeek.get(week.weekStart)?.size ?? 0;
    week.projectCount = projectsByWeek.get(week.weekStart)?.size ?? 0;
  }

  const current = weeks.at(-1) ?? emptyWeek(new Date(currentWeekStart).toISOString().slice(0, 10));
  const previous = weeks.at(-2) ?? emptyWeek('');
  return {
    metric: 'weekly_active_designers_shipping_to_engines',
    label: 'Weekly Active Designers who shipped at least one artifact to Unity, Unreal, or Godot',
    generatedAt,
    currentWeekStart: current.weekStart,
    currentWeekActiveDesigners: current.activeDesigners,
    previousWeekActiveDesigners: previous.activeDesigners,
    weeks,
  };
}

export function buildProductAnalyticsDashboard(
  input: {
    engineShipments: EngineShipmentRecord[];
    activationEvents: ActivationFunnelEvent[];
    productUsageEvents?: ProductUsageEvent[];
    revenueRetentionEvents?: RevenueRetentionEvent[];
  },
  options: { now?: number; weeks?: number } = {},
): ProductAnalyticsDashboard {
  const northStar = buildNorthStarAnalytics(input.engineShipments, options);
  const designersByStep = new Map<ActivationFunnelStep, Set<string>>();
  const eventsByStep = new Map<ActivationFunnelStep, number>();
  for (const step of ACTIVATION_FUNNEL_STEPS) {
    designersByStep.set(step, new Set());
    eventsByStep.set(step, 0);
  }

  for (const event of input.activationEvents) {
    if (!ACTIVATION_FUNNEL_STEPS.includes(event.step)) continue;
    designersByStep.get(event.step)?.add(event.designerId);
    eventsByStep.set(event.step, (eventsByStep.get(event.step) ?? 0) + 1);
  }

  return {
    generatedAt: northStar.generatedAt,
    northStar,
    activationFunnel: ACTIVATION_FUNNEL_STEPS.map((step) => ({
      step,
      label: ACTIVATION_STEP_LABELS[step],
      activeDesigners: designersByStep.get(step)?.size ?? 0,
      events: eventsByStep.get(step) ?? 0,
    })),
    engineExportVolume: {
      weeks: northStar.weeks,
    },
    skillUsage: {
      top: summarizeUsage(input.productUsageEvents ?? [], 'skill'),
    },
    gameArtBibleUsage: {
      top: summarizeUsage(input.productUsageEvents ?? [], 'game_art_bible'),
    },
    playtestPersonaUsage: {
      top: summarizePersonaUsage(input.productUsageEvents ?? []),
    },
    retention: {
      cohorts: summarizeRetention({
        engineShipments: input.engineShipments,
        activationEvents: input.activationEvents,
        productUsageEvents: input.productUsageEvents ?? [],
      }, northStar.generatedAt),
    },
    revenueRetention: {
      cohorts: summarizeRevenueRetention(input.revenueRetentionEvents ?? []),
    },
  };
}

function formatPercent(value: number | undefined): string {
  return value === undefined ? 'n/a' : `${Math.round(value * 100)}%`;
}

function formatSigned(value: number): string {
  if (value > 0) return `+${value}`;
  return String(value);
}

function currentNorthStarWeek(dashboard: ProductAnalyticsDashboard): NorthStarWeek {
  return dashboard.northStar.weeks.find((week) => week.weekStart === dashboard.northStar.currentWeekStart)
    ?? dashboard.northStar.weeks.at(-1)
    ?? emptyWeek(dashboard.northStar.currentWeekStart);
}

function activationDesigners(dashboard: ProductAnalyticsDashboard, step: ActivationFunnelStep): number {
  return dashboard.activationFunnel.find((entry) => entry.step === step)?.activeDesigners ?? 0;
}

function retentionPeriod(
  dashboard: ProductAnalyticsDashboard,
  period: RetentionPeriod,
): RetentionCohortSummary['periods'][number] | undefined {
  return dashboard.retention.cohorts[0]?.periods.find((entry) => entry.period === period);
}

function topUsageLabel(items: ProductUsageSummaryItem[], fallback: string): string {
  const item = items[0];
  return item ? `${item.id} (${item.events} events)` : fallback;
}

export function buildProductAnalyticsWeeklyReport(
  dashboard: ProductAnalyticsDashboard,
): ProductAnalyticsWeeklyReport {
  const week = currentNorthStarWeek(dashboard);
  const activeDesignerDelta =
    dashboard.northStar.currentWeekActiveDesigners - dashboard.northStar.previousWeekActiveDesigners;
  const d1Retention = retentionPeriod(dashboard, 'd1');
  const d7Retention = retentionPeriod(dashboard, 'd7');
  const d28Retention = retentionPeriod(dashboard, 'd28');
  const m3Retention = retentionPeriod(dashboard, 'm3');
  const m6Retention = retentionPeriod(dashboard, 'm6');
  const latestNrr = dashboard.revenueRetention.cohorts[0];
  const topSkill = dashboard.skillUsage.top[0];
  const topArtBible = dashboard.gameArtBibleUsage.top[0];
  const topPersona = dashboard.playtestPersonaUsage.top[0];
  const title = `Greybox Weekly North Star - ${week.weekStart}`;
  const lines = [
    `*${title}*`,
    `- Weekly active designers shipping to engines: ${dashboard.northStar.currentWeekActiveDesigners} (${formatSigned(activeDesignerDelta)} WoW)`,
    `- Engine shipments: ${week.shipments} across ${week.projectCount} projects`,
    `- Engine split: Unity ${week.byEngine.unity}, Unreal ${week.byEngine.unreal}, Godot ${week.byEngine.godot}`,
    `- Activation: ${activationDesigners(dashboard, 'first_engine_export')} designers reached first engine export`,
    `- D7 retention: ${d7Retention ? `${formatPercent(d7Retention.retentionRate)} (${d7Retention.retainedDesigners}/${d7Retention.eligibleDesigners} eligible)` : 'pending'}`,
    `- NRR: ${latestNrr ? `${formatPercent(latestNrr.nrr)} for ${latestNrr.signupMonth}` : 'pending'}`,
    `- Top skill: ${topUsageLabel(dashboard.skillUsage.top, 'none yet')}`,
    `- Top art bible: ${topUsageLabel(dashboard.gameArtBibleUsage.top, 'none yet')}`,
    'Privacy: artifact content, file bodies, designer names, and game IP are excluded from this report.',
  ];
  const markdown = lines.join('\n');
  return {
    generatedAt: dashboard.generatedAt,
    weekStart: week.weekStart,
    title,
    markdown,
    metrics: {
      activeDesigners: dashboard.northStar.currentWeekActiveDesigners,
      previousWeekActiveDesigners: dashboard.northStar.previousWeekActiveDesigners,
      activeDesignerDelta,
      shipments: week.shipments,
      projectCount: week.projectCount,
      byEngine: week.byEngine,
      signupDesigners: activationDesigners(dashboard, 'signup'),
      firstProjectDesigners: activationDesigners(dashboard, 'first_project'),
      firstArtifactDesigners: activationDesigners(dashboard, 'first_artifact'),
      firstSaveDesigners: activationDesigners(dashboard, 'first_save'),
      firstEngineExportDesigners: activationDesigners(dashboard, 'first_engine_export'),
      ...(d1Retention
        ? {
            d1RetentionRate: d1Retention.retentionRate,
            d1EligibleDesigners: d1Retention.eligibleDesigners,
          }
        : {}),
      ...(d7Retention
        ? {
            d7RetentionRate: d7Retention.retentionRate,
            d7EligibleDesigners: d7Retention.eligibleDesigners,
          }
        : {}),
      ...(d28Retention
        ? {
            d28RetentionRate: d28Retention.retentionRate,
            d28EligibleDesigners: d28Retention.eligibleDesigners,
          }
        : {}),
      ...(m3Retention
        ? {
            m3RetentionRate: m3Retention.retentionRate,
            m3EligibleDesigners: m3Retention.eligibleDesigners,
          }
        : {}),
      ...(m6Retention
        ? {
            m6RetentionRate: m6Retention.retentionRate,
            m6EligibleDesigners: m6Retention.eligibleDesigners,
          }
        : {}),
      ...(latestNrr
        ? {
            nrr: latestNrr.nrr,
            nrrSignupMonth: latestNrr.signupMonth,
          }
        : {}),
      ...(topSkill
        ? {
            topSkillId: topSkill.id,
            topSkillEvents: topSkill.events,
          }
        : {}),
      ...(topArtBible
        ? {
            topGameArtBibleId: topArtBible.id,
            topGameArtBibleEvents: topArtBible.events,
          }
        : {}),
      ...(topPersona
        ? {
            topPlaytestPersonaId: topPersona.id,
            topPlaytestPersonaCompletionRate: topPersona.completionRate,
          }
        : {}),
    },
    slack: {
      text: `${title}: ${dashboard.northStar.currentWeekActiveDesigners} active designers shipping to engines`,
      blocks: [
        { type: 'header', text: { type: 'plain_text', text: title } },
        { type: 'section', text: { type: 'mrkdwn', text: markdown } },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: 'Metrics require explicit opt-in and exclude artifact content, file bodies, designer names, and game IP.',
            },
          ],
        },
      ],
    },
  };
}

export function buildProductAnalyticsPostHogPayload(
  report: ProductAnalyticsWeeklyReport,
  input: { apiKey: string; distinctId: string },
): ProductAnalyticsPostHogPayload {
  return {
    api_key: input.apiKey,
    event: 'greybox_weekly_north_star',
    distinct_id: input.distinctId,
    timestamp: new Date(report.generatedAt).toISOString(),
    properties: {
      metric: 'weekly_active_designers_shipping_to_engines',
      week_start: report.weekStart,
      active_designers: report.metrics.activeDesigners,
      previous_week_active_designers: report.metrics.previousWeekActiveDesigners,
      active_designer_delta: report.metrics.activeDesignerDelta,
      shipments: report.metrics.shipments,
      project_count: report.metrics.projectCount,
      unity_shipments: report.metrics.byEngine.unity,
      unreal_shipments: report.metrics.byEngine.unreal,
      godot_shipments: report.metrics.byEngine.godot,
      signup_designers: report.metrics.signupDesigners,
      first_project_designers: report.metrics.firstProjectDesigners,
      first_artifact_designers: report.metrics.firstArtifactDesigners,
      first_save_designers: report.metrics.firstSaveDesigners,
      first_engine_export_designers: report.metrics.firstEngineExportDesigners,
      ...(report.metrics.d1RetentionRate !== undefined ? { d1_retention_rate: report.metrics.d1RetentionRate } : {}),
      ...(report.metrics.d1EligibleDesigners !== undefined ? { d1_eligible_designers: report.metrics.d1EligibleDesigners } : {}),
      ...(report.metrics.d7RetentionRate !== undefined ? { d7_retention_rate: report.metrics.d7RetentionRate } : {}),
      ...(report.metrics.d7EligibleDesigners !== undefined ? { d7_eligible_designers: report.metrics.d7EligibleDesigners } : {}),
      ...(report.metrics.d28RetentionRate !== undefined ? { d28_retention_rate: report.metrics.d28RetentionRate } : {}),
      ...(report.metrics.d28EligibleDesigners !== undefined ? { d28_eligible_designers: report.metrics.d28EligibleDesigners } : {}),
      ...(report.metrics.m3RetentionRate !== undefined ? { m3_retention_rate: report.metrics.m3RetentionRate } : {}),
      ...(report.metrics.m3EligibleDesigners !== undefined ? { m3_eligible_designers: report.metrics.m3EligibleDesigners } : {}),
      ...(report.metrics.m6RetentionRate !== undefined ? { m6_retention_rate: report.metrics.m6RetentionRate } : {}),
      ...(report.metrics.m6EligibleDesigners !== undefined ? { m6_eligible_designers: report.metrics.m6EligibleDesigners } : {}),
      ...(report.metrics.nrr !== undefined ? { nrr: report.metrics.nrr } : {}),
      ...(report.metrics.nrrSignupMonth ? { nrr_signup_month: report.metrics.nrrSignupMonth } : {}),
      ...(report.metrics.topSkillId ? { top_skill_id: report.metrics.topSkillId } : {}),
      ...(report.metrics.topSkillEvents !== undefined ? { top_skill_events: report.metrics.topSkillEvents } : {}),
      ...(report.metrics.topGameArtBibleId ? { top_game_art_bible_id: report.metrics.topGameArtBibleId } : {}),
      ...(report.metrics.topGameArtBibleEvents !== undefined ? { top_game_art_bible_events: report.metrics.topGameArtBibleEvents } : {}),
      ...(report.metrics.topPlaytestPersonaId ? { top_playtest_persona_id: report.metrics.topPlaytestPersonaId } : {}),
      ...(report.metrics.topPlaytestPersonaCompletionRate !== undefined
        ? { top_playtest_persona_completion_rate: report.metrics.topPlaytestPersonaCompletionRate }
        : {}),
      privacy_scope: 'aggregate_only_no_artifact_content_designer_names_or_game_ip',
      source: 'greybox_daemon_weekly_report',
      $process_person_profile: false,
    },
  };
}

export function buildProductAnalyticsPostHogDashboardSeed(
  input: {
    appHost?: string;
    environmentId?: string;
    generatedAt?: string;
    dashboardName?: string;
  } = {},
): ProductAnalyticsPostHogDashboardSeed {
  const appHost = normalizePostHogAppHost(input.appHost ?? 'https://app.posthog.com');
  const environmentId = cleanPostHogPathPart(input.environmentId ?? ':environment_id');
  const dashboardEndpoint = `${appHost}/api/environments/${environmentId}/dashboards/`;
  const insightEndpoint = `${appHost}/api/environments/${environmentId}/insights/`;
  const insights = postHogDashboardInsights();
  return {
    version: 1,
    generatedAt: input.generatedAt ?? new Date(0).toISOString(),
    privacyScope: 'aggregate_only_no_artifact_content_designer_names_or_game_ip',
    eventContract: {
      event: 'greybox_weekly_north_star',
      requiredProperties: [
        'metric',
        'week_start',
        'active_designers',
        'previous_week_active_designers',
        'active_designer_delta',
        'shipments',
        'project_count',
        'unity_shipments',
        'unreal_shipments',
        'godot_shipments',
        'signup_designers',
        'first_project_designers',
        'first_artifact_designers',
        'first_save_designers',
        'first_engine_export_designers',
        'privacy_scope',
        'source',
        '$process_person_profile',
      ],
    },
    api: {
      dashboardEndpoint,
      insightEndpoint,
      requiredScopes: ['dashboard:write', 'insight:write'],
    },
    dashboard: {
      name: input.dashboardName ?? 'Greybox North Star',
      description: [
        'Weekly Active Designers shipping at least one artifact to Unity, Unreal, or Godot.',
        'Seeded by the Greybox daemon from aggregate-only PostHog events; excludes artifact content, file bodies, designer names, and game IP.',
      ].join(' '),
      pinned: true,
      tags: ['greybox', 'north-star', 'engine-shipping'],
    },
    insights,
  };
}

export async function provisionProductAnalyticsPostHogDashboard(
  input: {
    appHost: string;
    environmentId: string;
    personalApiKey?: string;
    dryRun?: boolean;
    fetchImpl?: typeof fetch;
    generatedAt?: string;
  },
): Promise<ProductAnalyticsPostHogDashboardProvisionResponse> {
  const seed = buildProductAnalyticsPostHogDashboardSeed({
    appHost: input.appHost,
    environmentId: input.environmentId,
    ...(input.generatedAt ? { generatedAt: input.generatedAt } : {}),
  });
  if (input.dryRun || !input.personalApiKey) {
    return {
      dryRun: true,
      seed,
      insights: seed.insights.map((insight) => ({ key: insight.key, status: 'planned' })),
    };
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  const dashboardResponse = await postJson(fetchImpl, seed.api.dashboardEndpoint, input.personalApiKey, seed.dashboard);
  const dashboardId = readPostHogId(dashboardResponse);
  const createdInsights = [];
  for (const insight of seed.insights) {
    const body = {
      name: insight.name,
      description: insight.description,
      query: insight.query,
      order: insight.order,
      dashboards: [dashboardId],
      tags: insight.tags,
    };
    const insightResponse = await postJson(fetchImpl, seed.api.insightEndpoint, input.personalApiKey, body);
    createdInsights.push({
      key: insight.key,
      id: readPostHogId(insightResponse),
      status: 'created' as const,
    });
  }

  return {
    dryRun: false,
    seed,
    dashboard: {
      id: dashboardId,
      url: `${normalizePostHogAppHost(input.appHost)}/project/${cleanPostHogPathPart(input.environmentId)}/dashboard/${dashboardId}`,
    },
    insights: createdInsights,
  };
}

function postHogDashboardInsights(): ProductAnalyticsPostHogInsightSeed[] {
  return [
    hogqlInsight({
      key: 'north-star-weekly-active-designers',
      name: 'North Star: Weekly active designers shipping to engines',
      description: 'Weekly Active Designers who shipped at least one artifact to Unity, Unreal, or Godot.',
      order: 0,
      query: `
SELECT
  properties.week_start AS week_start,
  max(toInt(properties.active_designers)) AS active_designers
FROM events
WHERE event = 'greybox_weekly_north_star'
  AND properties.metric = 'weekly_active_designers_shipping_to_engines'
  AND timestamp >= now() - INTERVAL 26 WEEK
GROUP BY week_start
ORDER BY week_start ASC`,
    }),
    hogqlInsight({
      key: 'activation-funnel',
      name: 'Activation funnel',
      description: 'Signup through first engine export, reported as aggregate weekly designer counts.',
      order: 1,
      query: `
SELECT
  properties.week_start AS week_start,
  max(toInt(properties.signup_designers)) AS signup_designers,
  max(toInt(properties.first_project_designers)) AS first_project_designers,
  max(toInt(properties.first_artifact_designers)) AS first_artifact_designers,
  max(toInt(properties.first_save_designers)) AS first_save_designers,
  max(toInt(properties.first_engine_export_designers)) AS first_engine_export_designers
FROM events
WHERE event = 'greybox_weekly_north_star'
  AND timestamp >= now() - INTERVAL 26 WEEK
GROUP BY week_start
ORDER BY week_start ASC`,
    }),
    hogqlInsight({
      key: 'engine-export-volume',
      name: 'Engine export volume by engine',
      description: 'Unity, Unreal, and Godot export volume by North Star week.',
      order: 2,
      query: `
SELECT
  properties.week_start AS week_start,
  sum(toInt(properties.unity_shipments)) AS unity_shipments,
  sum(toInt(properties.unreal_shipments)) AS unreal_shipments,
  sum(toInt(properties.godot_shipments)) AS godot_shipments
FROM events
WHERE event = 'greybox_weekly_north_star'
  AND timestamp >= now() - INTERVAL 26 WEEK
GROUP BY week_start
ORDER BY week_start ASC`,
    }),
    hogqlInsight({
      key: 'retention-cohort-rates',
      name: 'Retention cohorts',
      description: 'D1, D7, D28, M3, and M6 retention from aggregate weekly reports.',
      order: 3,
      query: `
SELECT
  properties.week_start AS week_start,
  max(toFloat(properties.d1_retention_rate)) AS d1_retention_rate,
  max(toFloat(properties.d7_retention_rate)) AS d7_retention_rate,
  max(toFloat(properties.d28_retention_rate)) AS d28_retention_rate,
  max(toFloat(properties.m3_retention_rate)) AS m3_retention_rate,
  max(toFloat(properties.m6_retention_rate)) AS m6_retention_rate
FROM events
WHERE event = 'greybox_weekly_north_star'
  AND timestamp >= now() - INTERVAL 26 WEEK
GROUP BY week_start
ORDER BY week_start ASC`,
    }),
    hogqlInsight({
      key: 'nrr-by-signup-month',
      name: 'NRR by signup month',
      description: 'Net revenue retention by signup cohort from aggregate billing rollups.',
      order: 4,
      query: `
SELECT
  any(properties.nrr_signup_month) AS signup_month,
  max(toFloat(properties.nrr)) AS nrr
FROM events
WHERE event = 'greybox_weekly_north_star'
  AND isNotNull(properties.nrr_signup_month)
  AND timestamp >= now() - INTERVAL 26 WEEK
GROUP BY signup_month
ORDER BY signup_month ASC`,
    }),
    hogqlInsight({
      key: 'skill-usage',
      name: 'Top skill usage',
      description: 'Aggregate top skill ID by weekly report, without artifact or designer identifiers.',
      order: 5,
      query: `
SELECT
  properties.week_start AS week_start,
  any(properties.top_skill_id) AS top_skill_id,
  max(toInt(properties.top_skill_events)) AS top_skill_events
FROM events
WHERE event = 'greybox_weekly_north_star'
  AND timestamp >= now() - INTERVAL 26 WEEK
GROUP BY week_start
ORDER BY week_start ASC`,
    }),
    hogqlInsight({
      key: 'game-art-bible-usage',
      name: 'Top game art bible usage',
      description: 'Aggregate top game art bible ID by weekly report, without artifact or designer identifiers.',
      order: 6,
      query: `
SELECT
  properties.week_start AS week_start,
  any(properties.top_game_art_bible_id) AS top_game_art_bible_id,
  max(toInt(properties.top_game_art_bible_events)) AS top_game_art_bible_events
FROM events
WHERE event = 'greybox_weekly_north_star'
  AND timestamp >= now() - INTERVAL 26 WEEK
GROUP BY week_start
ORDER BY week_start ASC`,
    }),
    hogqlInsight({
      key: 'playtest-persona-completion',
      name: 'Playtest persona completion rate',
      description: 'Completion rate for the top playtest persona in each weekly report.',
      order: 7,
      query: `
SELECT
  properties.week_start AS week_start,
  any(properties.top_playtest_persona_id) AS top_playtest_persona_id,
  max(toFloat(properties.top_playtest_persona_completion_rate)) AS completion_rate
FROM events
WHERE event = 'greybox_weekly_north_star'
  AND timestamp >= now() - INTERVAL 26 WEEK
GROUP BY week_start
ORDER BY week_start ASC`,
    }),
  ];
}

function hogqlInsight(input: {
  key: string;
  name: string;
  description: string;
  order: number;
  query: string;
}): ProductAnalyticsPostHogInsightSeed {
  return {
    key: input.key,
    name: input.name,
    description: input.description,
    order: input.order,
    tags: ['greybox', 'north-star'],
    query: {
      kind: 'InsightVizNode',
      full: true,
      source: {
        kind: 'HogQLQuery',
        query: input.query.trim(),
      },
    },
  };
}

function normalizePostHogAppHost(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return 'https://app.posthog.com';
    return url.toString().replace(/\/+$/u, '');
  } catch {
    return 'https://app.posthog.com';
  }
}

function cleanPostHogPathPart(value: string): string {
  const clean = value.trim();
  if (clean === ':environment_id') return clean;
  return encodeURIComponent(clean.replace(/^\/+|\/+$/gu, '').slice(0, 128));
}

async function postJson(fetchImpl: typeof fetch, url: string, token: string, body: unknown): Promise<unknown> {
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await response.text().catch(() => '');
  if (!response.ok) {
    throw new Error(`PostHog API rejected request with status ${response.status}${text ? `: ${text.slice(0, 160)}` : ''}`);
  }
  if (!text) return {};
  return JSON.parse(text);
}

function readPostHogId(value: unknown): number | string {
  if (isRecord(value) && (typeof value.id === 'number' || typeof value.id === 'string')) return value.id;
  throw new Error('PostHog response did not include an id');
}

function summarizeRetention(
  input: {
    engineShipments: EngineShipmentRecord[];
    activationEvents: ActivationFunnelEvent[];
    productUsageEvents: ProductUsageEvent[];
  },
  now: number,
  limit = 8,
): RetentionCohortSummary[] {
  const activityByDesigner = new Map<string, number[]>();
  const addActivity = (designerId: string | undefined, timestamp: number | undefined) => {
    if (!designerId || timestamp === undefined || !Number.isFinite(timestamp) || timestamp > now) return;
    if (!activityByDesigner.has(designerId)) activityByDesigner.set(designerId, []);
    activityByDesigner.get(designerId)?.push(timestamp);
  };
  for (const event of input.activationEvents) addActivity(event.designerId, event.occurredAt);
  for (const event of input.productUsageEvents) addActivity(event.designerId, event.occurredAt);
  for (const event of input.engineShipments) addActivity(event.designerId, event.shippedAt);

  const designers = Array.from(activityByDesigner.entries())
    .map(([designerId, timestamps]) => ({ designerId, timestamps: timestamps.sort((a, b) => a - b) }))
    .filter((entry) => entry.timestamps.length > 0);
  const cohorts = new Map<string, Array<{ designerId: string; timestamps: number[] }>>();
  for (const designer of designers) {
    const firstSeen = designer.timestamps[0]!;
    const key = dayKey(firstSeen);
    const entries = cohorts.get(key) ?? [];
    entries.push(designer);
    cohorts.set(key, entries);
  }

  return Array.from(cohorts.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, limit)
    .map(([cohortStart, entries]) => {
      const cohortStartMs = Date.parse(`${cohortStart}T00:00:00.000Z`);
      return {
        cohortStart,
        cohortSize: entries.length,
        periods: RETENTION_PERIODS.map(({ period, label, days }) => {
          const threshold = cohortStartMs + days * DAY_MS;
          const eligible = entries.filter(() => now >= threshold);
          const retained = eligible.filter((entry) => entry.timestamps.some((timestamp) => timestamp >= threshold));
          return {
            period,
            label,
            eligibleDesigners: eligible.length,
            retainedDesigners: retained.length,
            retentionRate: eligible.length > 0 ? Number((retained.length / eligible.length).toFixed(4)) : 0,
          };
        }),
      };
    });
}

function summarizeRevenueRetention(
  events: RevenueRetentionEvent[],
  limit = 8,
): RevenueRetentionCohortSummary[] {
  const latestByAccount = new Map<string, RevenueRetentionEvent>();
  for (const event of events) {
    const key = `${event.signupMonth}:${event.accountId}`;
    const previous = latestByAccount.get(key);
    if (!previous || event.periodMonth.localeCompare(previous.periodMonth) >= 0) {
      latestByAccount.set(key, event);
    }
  }
  const cohorts = new Map<string, RevenueRetentionEvent[]>();
  for (const event of latestByAccount.values()) {
    const list = cohorts.get(event.signupMonth) ?? [];
    list.push(event);
    cohorts.set(event.signupMonth, list);
  }
  return Array.from(cohorts.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, limit)
    .map(([signupMonth, cohortEvents]) => {
      let startingMrrCents = 0;
      let currentMrrCents = 0;
      let expansionMrrCents = 0;
      let contractionMrrCents = 0;
      let churnedAccountCount = 0;
      for (const event of cohortEvents) {
        startingMrrCents += event.startingMrrCents;
        currentMrrCents += event.currentMrrCents;
        expansionMrrCents += Math.max(0, event.currentMrrCents - event.startingMrrCents);
        contractionMrrCents += Math.max(0, event.startingMrrCents - event.currentMrrCents);
        if (event.startingMrrCents > 0 && event.currentMrrCents === 0) churnedAccountCount += 1;
      }
      return {
        signupMonth,
        accountCount: cohortEvents.length,
        startingMrrCents,
        currentMrrCents,
        expansionMrrCents,
        contractionMrrCents,
        churnedAccountCount,
        nrr: startingMrrCents > 0 ? Number((currentMrrCents / startingMrrCents).toFixed(4)) : 0,
      };
    });
}

function summarizeUsage(
  events: ProductUsageEvent[],
  kind: ProductUsageKind,
  limit = 8,
): ProductUsageSummaryItem[] {
  const designersByItem = new Map<string, Set<string>>();
  const eventsByItem = new Map<string, number>();
  for (const event of events) {
    if (event.kind !== kind) continue;
    if (!designersByItem.has(event.itemId)) designersByItem.set(event.itemId, new Set());
    designersByItem.get(event.itemId)?.add(event.designerId);
    eventsByItem.set(event.itemId, (eventsByItem.get(event.itemId) ?? 0) + 1);
  }
  return Array.from(eventsByItem.entries())
    .map(([id, eventCount]) => ({
      id,
      events: eventCount,
      activeDesigners: designersByItem.get(id)?.size ?? 0,
    }))
    .sort((a, b) => b.events - a.events || b.activeDesigners - a.activeDesigners || a.id.localeCompare(b.id))
    .slice(0, limit);
}

function summarizePersonaUsage(
  events: ProductUsageEvent[],
  limit = 8,
): PlaytestPersonaUsageSummaryItem[] {
  const designersByItem = new Map<string, Set<string>>();
  const attemptsByItem = new Map<string, number>();
  const completionsByItem = new Map<string, number>();
  const eventsByItem = new Map<string, number>();
  for (const event of events) {
    if (event.kind !== 'playtest_persona') continue;
    if (!designersByItem.has(event.itemId)) designersByItem.set(event.itemId, new Set());
    designersByItem.get(event.itemId)?.add(event.designerId);
    eventsByItem.set(event.itemId, (eventsByItem.get(event.itemId) ?? 0) + 1);
    if (event.outcome === 'attempted') attemptsByItem.set(event.itemId, (attemptsByItem.get(event.itemId) ?? 0) + 1);
    if (event.outcome === 'completed') completionsByItem.set(event.itemId, (completionsByItem.get(event.itemId) ?? 0) + 1);
  }
  return Array.from(eventsByItem.keys())
    .map((id) => {
      const attempts = attemptsByItem.get(id) ?? 0;
      const completions = completionsByItem.get(id) ?? 0;
      return {
        id,
        events: eventsByItem.get(id) ?? 0,
        activeDesigners: designersByItem.get(id)?.size ?? 0,
        attempts,
        completions,
        completionRate: attempts > 0 ? Number((completions / attempts).toFixed(4)) : 0,
      };
    })
    .sort((a, b) => b.completions - a.completions || b.attempts - a.attempts || a.id.localeCompare(b.id))
    .slice(0, limit);
}
