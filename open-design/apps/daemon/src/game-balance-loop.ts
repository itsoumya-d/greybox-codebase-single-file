import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { GameSystemSpecDocument } from '@ai-game-design-studio/contracts/api/files';
import type {
  GameBalanceLoopAdjustment,
  GameBalanceLoopAdjustmentDecision,
  GameBalanceLoopConfig,
  GameBalanceLoopPriority,
  GameBalanceLoopRequest,
  GameBalanceLoopResponse,
  GamePlaytestPersonaId,
  GamePlaytestPersonaReport,
  GamePlaytestSimulationFinding,
  GamePlaytestSimulationResponse,
  GameTelemetryInsight,
  GameTelemetryInsightsResponse,
} from '@ai-game-design-studio/contracts/api/projects';

const DEFAULT_MAX_ADJUSTMENTS = 8;
const MAX_ADJUSTMENTS = 20;
const DEFAULT_LOOP_INTERVAL_MINUTES = 120;
const MIN_LOOP_INTERVAL_MINUTES = 15;
const MAX_LOOP_INTERVAL_MINUTES = 10080;
const LOOP_DIR = '.agds/game-balance-loop';
const LOOP_CONFIG_FILE = 'loop.json';
const LOOP_DECISIONS_FILE = 'decisions.json';

export type NormalizedGameBalanceLoopRequest = {
  fileName?: string;
  systemFileName?: string;
  focus?: string;
  maxAdjustments: number;
  includeTelemetry: boolean;
  includePlaytest: boolean;
  apply: boolean;
  persona?: GamePlaytestPersonaId;
  personas: GamePlaytestPersonaId[];
};

type NormalizeRequestResult =
  | { ok: true; request: NormalizedGameBalanceLoopRequest }
  | { ok: false; error: string };

type NormalizeLoopResult =
  | { ok: true; config: GameBalanceLoopConfig }
  | { ok: false; error: string };

type NormalizeAdjustmentDecisionResult =
  | {
    ok: true;
    decision: GameBalanceLoopAdjustmentDecision;
    adjustment: GameBalanceLoopAdjustment;
    note?: string;
  }
  | { ok: false; error: string };

export type GameBalanceLoopInput = {
  request: NormalizedGameBalanceLoopRequest;
  fileName?: string;
  systemFileName?: string;
  systemDocument?: GameSystemSpecDocument;
  telemetry?: GameTelemetryInsightsResponse;
  playtest?: GamePlaytestSimulationResponse;
  generatedAt?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cleanString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const clean = value.replace(/\0/g, '').trim();
  return clean ? clean.slice(0, maxLength) : undefined;
}

function cleanPersonaId(value: unknown): GamePlaytestPersonaId | undefined {
  if (typeof value !== 'string') return undefined;
  const clean = value
    .replace(/\0/g, '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
  if (!clean) return undefined;
  if (clean === 'ragequitter') return 'rage-quitter';
  if (clean === 'completion') return 'completionist';
  return clean;
}

function cleanPersonas(source: Record<string, unknown>): GamePlaytestPersonaId[] {
  const candidates: unknown[] = [];
  if (Array.isArray(source.personas)) candidates.push(...source.personas);
  candidates.push(source.persona);
  const seen = new Set<string>();
  const personas: GamePlaytestPersonaId[] = [];
  for (const candidate of candidates) {
    const persona = cleanPersonaId(candidate);
    if (!persona || seen.has(persona)) continue;
    seen.add(persona);
    personas.push(persona);
    if (personas.length >= 10) break;
  }
  return personas;
}

function cleanBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (/^(true|1|yes)$/i.test(value.trim())) return true;
    if (/^(false|0|no)$/i.test(value.trim())) return false;
  }
  return fallback;
}

function cleanMaxAdjustments(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return DEFAULT_MAX_ADJUSTMENTS;
  return Math.max(1, Math.min(MAX_ADJUSTMENTS, Math.trunc(n)));
}

function cleanLoopIntervalMinutes(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return DEFAULT_LOOP_INTERVAL_MINUTES;
  return Math.max(MIN_LOOP_INTERVAL_MINUTES, Math.min(MAX_LOOP_INTERVAL_MINUTES, Math.trunc(n)));
}

function cleanTimestamp(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : undefined;
}

function primitiveValue(value: unknown): string | number | boolean | undefined {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  return undefined;
}

function cleanPrimitivePath(value: unknown): string | number | undefined {
  if (typeof value === 'string') return cleanString(value, 96);
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  return undefined;
}

function cleanBalanceAdjustment(value: unknown): GameBalanceLoopAdjustment | null {
  if (!isRecord(value)) return null;
  const id = cleanString(value.id, 128);
  const priority = cleanString(value.priority, 16) as GameBalanceLoopPriority | undefined;
  const owner = cleanString(value.owner, 80);
  const source = cleanString(value.source, 80);
  const category = cleanString(value.category, 80);
  const title = cleanString(value.title, 160);
  const evidence = cleanString(value.evidence, 600);
  const rationale = cleanString(value.rationale, 600);
  const recommendation = cleanString(value.recommendation, 600);
  if (!id || !priority || !owner || !source || !category || !title || !evidence || !rationale || !recommendation) {
    return null;
  }
  const targetFileName = cleanString(value.targetFileName, 240);
  const targetPath = Array.isArray(value.targetPath)
    ? value.targetPath.flatMap((entry) => {
      const clean = cleanPrimitivePath(entry);
      return clean === undefined ? [] : [clean];
    }).slice(0, 8)
    : undefined;
  const currentValue = primitiveValue(value.currentValue);
  const suggestedValue = primitiveValue(value.suggestedValue);
  const applyStatus = value.applyStatus === 'applied' || value.applyStatus === 'not-applicable'
    ? value.applyStatus
    : 'suggested';
  return {
    id,
    priority,
    owner,
    source,
    category,
    title,
    evidence,
    rationale,
    recommendation,
    ...(targetFileName ? { targetFileName } : {}),
    ...(targetPath && targetPath.length > 0 ? { targetPath } : {}),
    ...(currentValue === undefined ? {} : { currentValue }),
    ...(suggestedValue === undefined ? {} : { suggestedValue }),
    applyStatus,
  };
}

export function normalizeGameBalanceLoopRequest(input: unknown): NormalizeRequestResult {
  if (input !== undefined && input !== null && !isRecord(input)) {
    return { ok: false, error: 'request body must be an object' };
  }
  const source = isRecord(input) ? input : {};
  const fileName = cleanString(source.fileName, 240);
  const systemFileName = cleanString(source.systemFileName, 240);
  const focus = cleanString(source.focus, 96);
  const personas = cleanPersonas(source);
  return {
    ok: true,
    request: {
      maxAdjustments: cleanMaxAdjustments(source.maxAdjustments),
      includeTelemetry: cleanBoolean(source.includeTelemetry, true),
      includePlaytest: cleanBoolean(source.includePlaytest, true),
      apply: cleanBoolean(source.apply, false),
      personas,
      ...(fileName ? { fileName } : {}),
      ...(systemFileName ? { systemFileName } : {}),
      ...(focus ? { focus } : {}),
      ...(personas[0] ? { persona: personas[0] } : {}),
    },
  };
}

export function normalizeGameBalanceAdjustmentDecision(input: unknown): NormalizeAdjustmentDecisionResult {
  if (!isRecord(input)) return { ok: false, error: 'decision body must be an object' };
  const rawDecision = cleanString(input.decision, 24);
  if (rawDecision !== 'accepted' && rawDecision !== 'rejected') {
    return { ok: false, error: 'decision must be accepted or rejected' };
  }
  const adjustment = cleanBalanceAdjustment(input.adjustment);
  if (!adjustment) return { ok: false, error: 'adjustment is required' };
  const note = cleanString(input.note, 500);
  return {
    ok: true,
    decision: rawDecision,
    adjustment,
    ...(note ? { note } : {}),
  };
}

export function defaultGameBalanceLoopConfig(now = Date.now()): GameBalanceLoopConfig {
  return {
    enabled: false,
    intervalMinutes: DEFAULT_LOOP_INTERVAL_MINUTES,
    maxAdjustments: DEFAULT_MAX_ADJUSTMENTS,
    includeTelemetry: true,
    includePlaytest: true,
    apply: false,
    nextRunAt: now + DEFAULT_LOOP_INTERVAL_MINUTES * 60_000,
  };
}

export function normalizeGameBalanceLoopConfig(
  input: unknown,
  previous: GameBalanceLoopConfig = defaultGameBalanceLoopConfig(),
  now = Date.now(),
): NormalizeLoopResult {
  if (input !== undefined && input !== null && !isRecord(input)) {
    return { ok: false, error: 'request body must be an object' };
  }
  const source = isRecord(input) ? input : {};
  const enabled = cleanBoolean(source.enabled, previous.enabled);
  const intervalMinutes = cleanLoopIntervalMinutes(source.intervalMinutes ?? previous.intervalMinutes);
  const normalized = normalizeGameBalanceLoopRequest({
    fileName: source.fileName ?? previous.fileName,
    systemFileName: source.systemFileName ?? previous.systemFileName,
    focus: source.focus ?? previous.focus,
    maxAdjustments: source.maxAdjustments ?? previous.maxAdjustments,
    includeTelemetry: source.includeTelemetry ?? previous.includeTelemetry,
    includePlaytest: source.includePlaytest ?? previous.includePlaytest,
    apply: source.apply ?? previous.apply,
    persona: source.persona ?? previous.persona,
    personas: source.personas ?? previous.personas,
  });
  if (!normalized.ok) return normalized;
  const nextRunAt = enabled
    ? cleanTimestamp(source.nextRunAt) ?? now + intervalMinutes * 60_000
    : undefined;
  const lastRunAt = cleanTimestamp(source.lastRunAt) ?? previous.lastRunAt;
  const lastSummary = cleanString(source.lastSummary, 240) ?? previous.lastSummary;
  const lastAdjustmentCount = typeof source.lastAdjustmentCount === 'number'
    ? Math.max(0, Math.trunc(source.lastAdjustmentCount))
    : previous.lastAdjustmentCount;
  const lastAppliedCount = typeof source.lastAppliedCount === 'number'
    ? Math.max(0, Math.trunc(source.lastAppliedCount))
    : previous.lastAppliedCount;

  return {
    ok: true,
    config: {
      enabled,
      intervalMinutes,
      ...normalized.request,
      ...(nextRunAt ? { nextRunAt } : {}),
      ...(lastRunAt ? { lastRunAt } : {}),
      ...(lastSummary ? { lastSummary } : {}),
      ...(lastAdjustmentCount === undefined ? {} : { lastAdjustmentCount }),
      ...(lastAppliedCount === undefined ? {} : { lastAppliedCount }),
    },
  };
}

function loopConfigFile(projectDir: string): string {
  return path.join(projectDir, LOOP_DIR, LOOP_CONFIG_FILE);
}

export async function readGameBalanceLoopConfig(projectDir: string): Promise<GameBalanceLoopConfig> {
  let raw = '';
  try {
    raw = await readFile(loopConfigFile(projectDir), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return defaultGameBalanceLoopConfig();
    throw error;
  }
  try {
    const parsed = JSON.parse(raw);
    const normalized = normalizeGameBalanceLoopConfig(parsed, defaultGameBalanceLoopConfig());
    return normalized.ok ? normalized.config : defaultGameBalanceLoopConfig();
  } catch {
    return defaultGameBalanceLoopConfig();
  }
}

export async function writeGameBalanceLoopConfig(
  projectDir: string,
  config: GameBalanceLoopConfig,
): Promise<void> {
  const file = loopConfigFile(projectDir);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

function loopDecisionsFile(projectDir: string): string {
  return path.join(projectDir, LOOP_DIR, LOOP_DECISIONS_FILE);
}

export async function appendGameBalanceAdjustmentDecision(
  projectDir: string,
  decision: {
    adjustment: GameBalanceLoopAdjustment;
    appliedCount: number;
    decision: GameBalanceLoopAdjustmentDecision;
    note?: string;
    updatedAt: number;
  },
): Promise<void> {
  const file = loopDecisionsFile(projectDir);
  let current: unknown[] = [];
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8'));
    if (Array.isArray(parsed)) current = parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const next = [
    ...current,
    {
      adjustmentId: decision.adjustment.id,
      owner: decision.adjustment.owner,
      source: decision.adjustment.source,
      targetFileName: decision.adjustment.targetFileName,
      targetPath: decision.adjustment.targetPath,
      suggestedValue: decision.adjustment.suggestedValue,
      decision: decision.decision,
      appliedCount: decision.appliedCount,
      note: decision.note,
      updatedAt: decision.updatedAt,
    },
  ].slice(-200);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
}

export function balanceLoopRequestFromConfig(config: GameBalanceLoopConfig): NormalizedGameBalanceLoopRequest {
  return {
    maxAdjustments: cleanMaxAdjustments(config.maxAdjustments),
    includeTelemetry: cleanBoolean(config.includeTelemetry, true),
    includePlaytest: cleanBoolean(config.includePlaytest, true),
    apply: cleanBoolean(config.apply, false),
    personas: config.personas ?? [],
    ...(config.fileName ? { fileName: config.fileName } : {}),
    ...(config.systemFileName ? { systemFileName: config.systemFileName } : {}),
    ...(config.focus ? { focus: config.focus } : {}),
    ...(config.persona ? { persona: config.persona } : {}),
  };
}

export function completeGameBalanceLoopRun(
  config: GameBalanceLoopConfig,
  balance: GameBalanceLoopResponse,
  now = Date.now(),
): GameBalanceLoopConfig {
  const { nextRunAt: _previousNextRunAt, ...rest } = config;
  return {
    ...rest,
    lastRunAt: now,
    lastSummary: balance.summary,
    lastAdjustmentCount: balance.adjustments.length,
    lastAppliedCount: balance.appliedCount,
    ...(config.enabled ? { nextRunAt: now + config.intervalMinutes * 60_000 } : {}),
  };
}

function priorityFromSeverity(severity: string): GameBalanceLoopPriority {
  if (severity === 'high') return 'p0';
  if (severity === 'medium') return 'p1';
  return 'p2';
}

function priorityRank(priority: GameBalanceLoopPriority): number {
  if (priority === 'p0') return 0;
  if (priority === 'p1') return 1;
  return 2;
}

function ownerForPersonaReport(report: GamePlaytestPersonaReport): GameBalanceLoopAdjustment['owner'] {
  if (report.id === 'casual' || report.id === 'rage-quitter') return 'accessibility-design';
  if (report.id === 'completionist' || report.id === 'explorer' || report.id === 'speedrunner') return 'level-design';
  return 'gameplay-mechanics';
}

function personaReportAdjustments(
  report: GamePlaytestPersonaReport,
  systemFileName?: string,
): GameBalanceLoopAdjustment[] {
  const issue = report.balanceIssues[0] ?? report.frustrationMoments[0] ?? report.unusedContent[0];
  if (!issue) return [];
  return [{
    id: `playtest-persona-${report.id}-balance`,
    priority: priorityFromSeverity(report.risk),
    owner: ownerForPersonaReport(report),
    source: 'playtest-simulation',
    category: 'persona-playtest',
    title: `${report.label} balance friction`,
    evidence: `${report.deaths} deaths / ${report.completionTimeSec}s. ${issue}`,
    rationale: 'Synthetic player personas expose motivation-specific tuning pressure before balance changes are applied.',
    recommendation: `Review ${report.label.toLowerCase()} friction before the next playtest: ${issue}`,
    ...(systemFileName ? { targetFileName: systemFileName } : {}),
    applyStatus: 'suggested',
  }];
}

function tuningKeyCount(document?: GameSystemSpecDocument): number {
  return document?.tuning ? Object.keys(document.tuning).length : 0;
}

function currentTuning(document: GameSystemSpecDocument | undefined, key: string): string | number | boolean | undefined {
  return primitiveValue(document?.tuning?.[key]);
}

function rounded(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function suggestNumeric(
  current: string | number | boolean | undefined,
  fallback: number,
  multiplier: number,
  min: number,
  max: number,
): number {
  const base = typeof current === 'number' ? current : fallback;
  return rounded(Math.max(min, Math.min(max, base * multiplier)));
}

function adjustment(input: {
  id: string;
  priority: GameBalanceLoopPriority;
  owner: GameBalanceLoopAdjustment['owner'];
  source: GameBalanceLoopAdjustment['source'];
  category: string;
  title: string;
  evidence: string;
  rationale: string;
  recommendation: string;
  systemFileName?: string | undefined;
  key?: string | undefined;
  currentValue?: string | number | boolean | undefined;
  suggestedValue?: string | number | boolean | undefined;
}): GameBalanceLoopAdjustment {
  return {
    id: input.id,
    priority: input.priority,
    owner: input.owner,
    source: input.source,
    category: input.category,
    title: input.title,
    evidence: input.evidence,
    rationale: input.rationale,
    recommendation: input.recommendation,
    ...(input.systemFileName ? { targetFileName: input.systemFileName } : {}),
    ...(input.key ? { targetPath: ['tuning', input.key] } : {}),
    ...(input.currentValue === undefined ? {} : { currentValue: input.currentValue }),
    ...(input.suggestedValue === undefined ? {} : { suggestedValue: input.suggestedValue }),
  };
}

function telemetryAdjustments(
  insight: GameTelemetryInsight,
  systemDocument: GameSystemSpecDocument | undefined,
  systemFileName: string | undefined,
): GameBalanceLoopAdjustment[] {
  const priority = priorityFromSeverity(insight.severity);
  if (insight.category === 'combat-balance') {
    const telegraphKey = 'enemyTelegraphMs';
    const damageKey = 'incomingDamageMultiplier';
    return [
      adjustment({
        id: 'telemetry-combat-telegraph-window',
        priority,
        owner: 'gameplay-mechanics',
        source: 'telemetry',
        category: 'combat-balance',
        title: 'Open the enemy telegraph window',
        evidence: insight.evidence,
        rationale: 'Failed or unreadable combat telemetry means players need clearer anticipation before damage.',
        recommendation: 'Increase enemy telegraph timing before raising spectacle or damage numbers.',
        systemFileName,
        key: telegraphKey,
        currentValue: currentTuning(systemDocument, telegraphKey),
        suggestedValue: suggestNumeric(currentTuning(systemDocument, telegraphKey), 420, 1.15, 120, 1600),
      }),
      adjustment({
        id: 'telemetry-combat-damage-pressure',
        priority,
        owner: 'gameplay-mechanics',
        source: 'telemetry',
        category: 'combat-balance',
        title: 'Reduce incoming damage pressure',
        evidence: insight.evidence,
        rationale: 'Balance should preserve mastery while removing opaque damage spikes.',
        recommendation: 'Lower incoming damage until playtest deaths correlate with understood mistakes.',
        systemFileName,
        key: damageKey,
        currentValue: currentTuning(systemDocument, damageKey),
        suggestedValue: suggestNumeric(currentTuning(systemDocument, damageKey), 1, 0.9, 0.25, 3),
      }),
    ];
  }

  if (insight.category === 'economy') {
    const key = 'currencySinkMultiplier';
    return [
      adjustment({
        id: 'telemetry-economy-sink-pressure',
        priority,
        owner: 'economy-progression',
        source: 'telemetry',
        category: 'economy',
        title: 'Soften economy sink pressure',
        evidence: insight.evidence,
        rationale: 'Negative economy telemetry can turn progression pressure into punitive grind.',
        recommendation: 'Reduce sink multipliers or increase matching reward cadence before adding more currencies.',
        systemFileName,
        key,
        currentValue: currentTuning(systemDocument, key),
        suggestedValue: suggestNumeric(currentTuning(systemDocument, key), 1, 0.9, 0.1, 5),
      }),
    ];
  }

  if (insight.category === 'progression') {
    const key = 'objectiveHintDelaySeconds';
    return [
      adjustment({
        id: `telemetry-${insight.id}-hint-delay`,
        priority,
        owner: 'level-design',
        source: 'telemetry',
        category: 'progression',
        title: 'Shorten objective hint delay',
        evidence: insight.evidence,
        rationale: 'Start/completion imbalance usually means the level goal or route is not legible soon enough.',
        recommendation: 'Surface objective guidance earlier, then test whether completion improves without removing discovery.',
        systemFileName,
        key,
        currentValue: currentTuning(systemDocument, key),
        suggestedValue: suggestNumeric(currentTuning(systemDocument, key), 8, 0.75, 1, 30),
      }),
    ];
  }

  if (insight.category === 'frustration' || insight.category === 'heatmap') {
    const key = insight.category === 'heatmap' ? 'routeBreadcrumbIntervalMeters' : 'checkpointSpacingMeters';
    return [
      adjustment({
        id: `telemetry-${insight.id}-spatial-pressure`,
        priority,
        owner: 'level-design',
        source: 'telemetry',
        category: insight.category,
        title: insight.category === 'heatmap' ? 'Tighten route readability markers' : 'Reduce checkpoint spacing pressure',
        evidence: insight.evidence,
        rationale: 'Spatial telemetry should convert directly into level pacing and recovery tuning.',
        recommendation: insight.category === 'heatmap'
          ? 'Add nearer route breadcrumbs, sightline breaks, or landmark contrast around the hot cell.'
          : 'Pull recovery points closer to the failure cluster until players can retry the learning beat quickly.',
        systemFileName,
        key,
        currentValue: currentTuning(systemDocument, key),
        suggestedValue: suggestNumeric(currentTuning(systemDocument, key), insight.category === 'heatmap' ? 35 : 60, 0.85, 5, 250),
      }),
    ];
  }

  if (insight.category === 'retention') {
    const key = 'rewardCadenceSeconds';
    return [
      adjustment({
        id: `telemetry-${insight.id}-reward-cadence`,
        priority,
        owner: 'live-ops',
        source: 'telemetry',
        category: 'retention',
        title: 'Tighten reward cadence',
        evidence: insight.evidence,
        rationale: 'Retention signals should tune reward anticipation without leaning on manipulative pressure.',
        recommendation: 'Move the next meaningful reward closer and keep monetization cosmetic or optional.',
        systemFileName,
        key,
        currentValue: currentTuning(systemDocument, key),
        suggestedValue: suggestNumeric(currentTuning(systemDocument, key), 90, 0.85, 15, 600),
      }),
    ];
  }

  if (insight.category === 'accessibility') {
    const key = 'hudScale';
    return [
      adjustment({
        id: 'telemetry-accessibility-hud-scale',
        priority,
        owner: 'accessibility-design',
        source: 'telemetry',
        category: 'accessibility',
        title: 'Increase readable HUD scale',
        evidence: insight.evidence,
        rationale: 'Accessibility telemetry should become explicit tuning, not a vague polish task.',
        recommendation: 'Raise default HUD scale and keep player-facing scaling controls available.',
        systemFileName,
        key,
        currentValue: currentTuning(systemDocument, key),
        suggestedValue: suggestNumeric(currentTuning(systemDocument, key), 1, 1.1, 0.75, 2),
      }),
    ];
  }

  return [];
}

function playtestAdjustments(
  finding: GamePlaytestSimulationFinding,
  systemDocument: GameSystemSpecDocument | undefined,
  systemFileName: string | undefined,
): GameBalanceLoopAdjustment[] {
  const priority = priorityFromSeverity(finding.severity);
  if (finding.category === 'combat') {
    const key = 'recoveryResourceRate';
    return [
      adjustment({
        id: `playtest-${finding.id}-recovery-rate`,
        priority,
        owner: 'gameplay-mechanics',
        source: 'playtest-simulation',
        category: 'combat',
        title: 'Increase combat recovery resources',
        evidence: finding.evidence,
        rationale: 'A deterministic combat finding needs a concrete pressure-valve tuning pass.',
        recommendation: 'Raise recovery resource availability before adding enemies or damage.',
        systemFileName,
        key,
        currentValue: currentTuning(systemDocument, key),
        suggestedValue: suggestNumeric(currentTuning(systemDocument, key), 1, 1.12, 0.25, 4),
      }),
    ];
  }

  if (finding.category === 'pacing') {
    const key = 'encounterRecoverySeconds';
    return [
      adjustment({
        id: `playtest-${finding.id}-recovery-window`,
        priority,
        owner: 'level-design',
        source: 'playtest-simulation',
        category: 'pacing',
        title: 'Add recovery time between pressure beats',
        evidence: finding.evidence,
        rationale: 'Players need recovery windows to parse new mechanics and prepare for escalation.',
        recommendation: 'Widen the recovery beat before the next encounter spike.',
        systemFileName,
        key,
        currentValue: currentTuning(systemDocument, key),
        suggestedValue: suggestNumeric(currentTuning(systemDocument, key), 10, 1.2, 2, 90),
      }),
    ];
  }

  if (finding.category === 'readability' || finding.category === 'navigation') {
    const key = finding.category === 'navigation' ? 'routeBreadcrumbIntervalMeters' : 'objectiveContrastBoost';
    return [
      adjustment({
        id: `playtest-${finding.id}-readability`,
        priority,
        owner: finding.category === 'navigation' ? 'level-design' : 'game-ui-hud',
        source: 'playtest-simulation',
        category: finding.category,
        title: finding.category === 'navigation' ? 'Reduce route breadcrumb spacing' : 'Boost objective readability',
        evidence: finding.evidence,
        rationale: 'Readability findings should tune guidance strength before expanding content scope.',
        recommendation: finding.category === 'navigation'
          ? 'Move route cues closer together and retest traversal comprehension.'
          : 'Increase objective contrast, label hierarchy, or HUD affordance clarity.',
        systemFileName,
        key,
        currentValue: currentTuning(systemDocument, key),
        suggestedValue: finding.category === 'navigation'
          ? suggestNumeric(currentTuning(systemDocument, key), 35, 0.8, 5, 200)
          : suggestNumeric(currentTuning(systemDocument, key), 1, 1.15, 1, 3),
      }),
    ];
  }

  if (finding.category === 'accessibility') {
    const key = 'assistStrength';
    return [
      adjustment({
        id: `playtest-${finding.id}-assist-strength`,
        priority,
        owner: 'accessibility-design',
        source: 'playtest-simulation',
        category: 'accessibility',
        title: 'Raise assist tuning for accessibility blockers',
        evidence: finding.evidence,
        rationale: 'Accessibility blockers should produce concrete assist tuning before the next playtest pass.',
        recommendation: 'Increase default assist strength and make the assist configurable.',
        systemFileName,
        key,
        currentValue: currentTuning(systemDocument, key),
        suggestedValue: suggestNumeric(currentTuning(systemDocument, key), 1, 1.15, 0.5, 3),
      }),
    ];
  }

  if (finding.category === 'retention') {
    const key = 'sessionGoalMinutes';
    return [
      adjustment({
        id: `playtest-${finding.id}-session-goal`,
        priority,
        owner: 'live-ops',
        source: 'playtest-simulation',
        category: 'retention',
        title: 'Shorten session goal pacing',
        evidence: finding.evidence,
        rationale: 'Retention risks often come from session goals taking longer than the game fantasy can support.',
        recommendation: 'Move the first clear session payoff earlier and avoid compulsion-heavy pressure.',
        systemFileName,
        key,
        currentValue: currentTuning(systemDocument, key),
        suggestedValue: suggestNumeric(currentTuning(systemDocument, key), 12, 0.85, 3, 60),
      }),
    ];
  }

  return [];
}

function existingSystemAdjustment(document: GameSystemSpecDocument, systemFileName: string | undefined): GameBalanceLoopAdjustment[] {
  const risks = document.risks ?? [];
  const highRisk = risks.find((risk) => risk.severity === 'high');
  if (!highRisk) return [];
  const key = 'riskMitigationBudget';
  return [
    adjustment({
      id: `system-risk-${highRisk.id}`,
      priority: 'p1',
      owner: 'production-planning',
      source: 'game-system',
      category: 'system-risk',
      title: `Reserve mitigation budget for ${highRisk.label}`,
      evidence: highRisk.mitigation,
      rationale: 'Known high-severity system risks need explicit budget before balance data piles up.',
      recommendation: 'Reserve sprint capacity for the mitigation and rerun the balance loop after the next instrumented playtest.',
      systemFileName,
      key,
      currentValue: currentTuning(document, key),
      suggestedValue: suggestNumeric(currentTuning(document, key), 1, 1.25, 1, 10),
    }),
  ];
}

export function applyGameBalanceAdjustmentsToSystemDocument(
  document: GameSystemSpecDocument,
  adjustments: GameBalanceLoopAdjustment[],
): { document: GameSystemSpecDocument; appliedCount: number } {
  const next: GameSystemSpecDocument = JSON.parse(JSON.stringify(document)) as GameSystemSpecDocument;
  let appliedCount = 0;
  for (const item of adjustments) {
    if (item.targetPath?.length !== 2 || item.targetPath[0] !== 'tuning') continue;
    const key = String(item.targetPath[1]);
    if (item.suggestedValue === undefined) continue;
    next.tuning = { ...(next.tuning ?? {}), [key]: item.suggestedValue };
    appliedCount += 1;
  }
  return { document: next, appliedCount };
}

export function buildGameBalanceLoop(input: GameBalanceLoopInput): GameBalanceLoopResponse {
  const telemetryInsights = input.request.includeTelemetry ? input.telemetry?.insights ?? [] : [];
  const playtestFindings = input.request.includePlaytest ? input.playtest?.findings ?? [] : [];
  const personaReports = input.request.includePlaytest ? input.playtest?.personaReports ?? [] : [];
  const systemDocument = input.systemDocument;
  const systemFileName = input.systemFileName;
  const adjustments: GameBalanceLoopAdjustment[] = [];

  for (const insight of telemetryInsights) {
    adjustments.push(...telemetryAdjustments(insight, systemDocument, systemFileName));
  }
  for (const finding of playtestFindings) {
    adjustments.push(...playtestAdjustments(finding, systemDocument, systemFileName));
  }
  for (const report of personaReports) {
    adjustments.push(...personaReportAdjustments(report, systemFileName));
  }
  if (systemDocument) {
    adjustments.push(...existingSystemAdjustment(systemDocument, systemFileName));
  }

  if (adjustments.length === 0) {
    adjustments.push({
      id: 'balance-loop-next-instrumented-playtest',
      priority: 'p2',
      owner: 'production-planning',
      source: 'studio-synthesis',
      category: 'instrumentation',
      title: 'Instrument the next balance playtest',
      evidence: 'No telemetry, deterministic playtest, or game-system risk signal produced a concrete tuning adjustment.',
      rationale: 'Automatic balance changes need evidence so the studio does not tune from vibes alone.',
      recommendation: 'Capture combat events, deaths, economy deltas, objective starts/completions, and accessibility signals before applying tuning.',
      applyStatus: 'not-applicable',
    });
  }

  const deduped = new Map<string, GameBalanceLoopAdjustment>();
  for (const item of adjustments) {
    if (!deduped.has(item.id)) deduped.set(item.id, item);
  }
  const ranked = [...deduped.values()]
    .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || a.owner.localeCompare(b.owner))
    .slice(0, input.request.maxAdjustments)
    .map((item) => ({
      ...item,
      applyStatus: input.request.apply && systemFileName && item.targetPath && item.suggestedValue !== undefined
        ? 'applied'
        : item.applyStatus ?? 'suggested',
    }));
  const appliedCount = input.request.apply
    ? ranked.filter((item) => item.applyStatus === 'applied').length
    : 0;
  const focusText = input.request.focus ? ` for ${input.request.focus}` : '';
  const targetText = systemFileName ? ` against ${systemFileName}` : '';
  const summary = `Generated ${ranked.length} automatic balance adjustment${ranked.length === 1 ? '' : 's'}${focusText}${targetText}; ${appliedCount} ${appliedCount === 1 ? 'change' : 'changes'} ${input.request.apply ? 'marked for application' : 'held for review'}.`;

  return {
    ...(input.fileName ? { fileName: input.fileName } : {}),
    ...(systemFileName ? { systemFileName } : {}),
    ...(input.request.focus ? { focus: input.request.focus } : {}),
    summary,
    adjustments: ranked,
    appliedCount,
    sources: {
      telemetryInsights: telemetryInsights.length,
      playtestFindings: playtestFindings.length,
      personaReports: personaReports.length,
      systemTuningKeys: tuningKeyCount(systemDocument),
    },
    generatedAt: input.generatedAt ?? Date.now(),
  };
}
