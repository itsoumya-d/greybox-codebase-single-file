import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  GameAutonomousIterationAction,
  GameAutonomousIterationLoopConfig,
  GameAutonomousIterationPriority,
  GameAutonomousIterationRequest,
  GameAutonomousIterationResponse,
  GamePlaytestPersonaReport,
  GamePlaytestSimulationFinding,
  GamePlaytestSimulationResponse,
  GameTelemetryInsight,
  GameTelemetryInsightsResponse,
  GameWorldSimulationFinding,
  GameWorldSimulationResponse,
} from '@ai-game-design-studio/contracts/api/projects';

const DEFAULT_MAX_ACTIONS = 8;
const MAX_ACTIONS = 20;
const DEFAULT_LOOP_INTERVAL_MINUTES = 240;
const MIN_LOOP_INTERVAL_MINUTES = 15;
const MAX_LOOP_INTERVAL_MINUTES = 10080;
const LOOP_DIR = '.agds/autonomous-iteration';
const LOOP_CONFIG_FILE = 'loop.json';

export type NormalizedGameAutonomousIterationRequest = {
  fileName?: string;
  focus?: string;
  maxActions: number;
  includeTelemetry: boolean;
  includePlaytest: boolean;
  includeWorldSimulation: boolean;
  persona?: string;
  personas: string[];
};

type NormalizeResult =
  | { ok: true; request: NormalizedGameAutonomousIterationRequest }
  | { ok: false; error: string };

type NormalizeLoopResult =
  | { ok: true; config: GameAutonomousIterationLoopConfig }
  | { ok: false; error: string };

export type GameAutonomousIterationInput = {
  request: NormalizedGameAutonomousIterationRequest;
  fileName?: string;
  telemetry?: GameTelemetryInsightsResponse;
  playtest?: GamePlaytestSimulationResponse;
  world?: GameWorldSimulationResponse;
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

function cleanBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (/^(true|1|yes)$/i.test(value.trim())) return true;
    if (/^(false|0|no)$/i.test(value.trim())) return false;
  }
  return fallback;
}

function cleanMaxActions(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return DEFAULT_MAX_ACTIONS;
  return Math.max(1, Math.min(MAX_ACTIONS, Math.trunc(n)));
}

function cleanPersonaId(value: unknown): string | undefined {
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

function cleanPersonas(source: Record<string, unknown>): string[] {
  const candidates: unknown[] = [];
  if (Array.isArray(source.personas)) candidates.push(...source.personas);
  candidates.push(source.persona);
  const seen = new Set<string>();
  const personas: string[] = [];
  for (const candidate of candidates) {
    const persona = cleanPersonaId(candidate);
    if (!persona || seen.has(persona)) continue;
    seen.add(persona);
    personas.push(persona);
    if (personas.length >= 10) break;
  }
  return personas;
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

export function normalizeGameAutonomousIterationRequest(input: unknown): NormalizeResult {
  if (input !== undefined && input !== null && !isRecord(input)) {
    return { ok: false, error: 'request body must be an object' };
  }
  const source = isRecord(input) ? input : {};
  const fileName = cleanString(source.fileName, 240);
  const focus = cleanString(source.focus, 96);
  const personas = cleanPersonas(source);
  return {
    ok: true,
    request: {
      maxActions: cleanMaxActions(source.maxActions),
      includeTelemetry: cleanBoolean(source.includeTelemetry, true),
      includePlaytest: cleanBoolean(source.includePlaytest, true),
      includeWorldSimulation: cleanBoolean(source.includeWorldSimulation, true),
      personas,
      ...(fileName ? { fileName } : {}),
      ...(focus ? { focus } : {}),
      ...(personas[0] ? { persona: personas[0] } : {}),
    },
  };
}

export function defaultGameAutonomousIterationLoopConfig(now = Date.now()): GameAutonomousIterationLoopConfig {
  return {
    enabled: false,
    intervalMinutes: DEFAULT_LOOP_INTERVAL_MINUTES,
    maxActions: DEFAULT_MAX_ACTIONS,
    includeTelemetry: true,
    includePlaytest: true,
    includeWorldSimulation: true,
    nextRunAt: now + DEFAULT_LOOP_INTERVAL_MINUTES * 60_000,
  };
}

export function normalizeGameAutonomousIterationLoopConfig(
  input: unknown,
  previous: GameAutonomousIterationLoopConfig = defaultGameAutonomousIterationLoopConfig(),
  now = Date.now(),
): NormalizeLoopResult {
  if (input !== undefined && input !== null && !isRecord(input)) {
    return { ok: false, error: 'request body must be an object' };
  }
  const source = isRecord(input) ? input : {};
  const enabled = cleanBoolean(source.enabled, previous.enabled);
  const intervalMinutes = cleanLoopIntervalMinutes(source.intervalMinutes ?? previous.intervalMinutes);
  const iteration = normalizeGameAutonomousIterationRequest({
    fileName: source.fileName ?? previous.fileName,
    focus: source.focus ?? previous.focus,
    maxActions: source.maxActions ?? previous.maxActions,
    includeTelemetry: source.includeTelemetry ?? previous.includeTelemetry,
    includePlaytest: source.includePlaytest ?? previous.includePlaytest,
    includeWorldSimulation: source.includeWorldSimulation ?? previous.includeWorldSimulation,
    persona: source.persona ?? previous.persona,
    personas: source.personas ?? previous.personas,
  });
  if (!iteration.ok) return iteration;
  const nextRunAt = enabled
    ? cleanTimestamp(source.nextRunAt) ?? now + intervalMinutes * 60_000
    : undefined;
  const lastRunAt = cleanTimestamp(source.lastRunAt) ?? previous.lastRunAt;
  const lastActionCount = typeof source.lastActionCount === 'number'
    ? Math.max(0, Math.trunc(source.lastActionCount))
    : previous.lastActionCount;
  const lastSummary = cleanString(source.lastSummary, 240) ?? previous.lastSummary;
  return {
    ok: true,
    config: {
      enabled,
      intervalMinutes,
      ...iteration.request,
      ...(nextRunAt ? { nextRunAt } : {}),
      ...(lastRunAt ? { lastRunAt } : {}),
      ...(lastSummary ? { lastSummary } : {}),
      ...(lastActionCount === undefined ? {} : { lastActionCount }),
    },
  };
}

function loopConfigFile(projectDir: string): string {
  return path.join(projectDir, LOOP_DIR, LOOP_CONFIG_FILE);
}

export async function readGameAutonomousIterationLoopConfig(projectDir: string): Promise<GameAutonomousIterationLoopConfig> {
  let raw = '';
  try {
    raw = await readFile(loopConfigFile(projectDir), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return defaultGameAutonomousIterationLoopConfig();
    throw error;
  }
  try {
    const parsed = JSON.parse(raw);
    const normalized = normalizeGameAutonomousIterationLoopConfig(parsed, defaultGameAutonomousIterationLoopConfig());
    return normalized.ok ? normalized.config : defaultGameAutonomousIterationLoopConfig();
  } catch {
    return defaultGameAutonomousIterationLoopConfig();
  }
}

export async function writeGameAutonomousIterationLoopConfig(
  projectDir: string,
  config: GameAutonomousIterationLoopConfig,
): Promise<void> {
  const file = loopConfigFile(projectDir);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

export function loopRequestFromConfig(config: GameAutonomousIterationLoopConfig): NormalizedGameAutonomousIterationRequest {
  const personas = cleanPersonas({ persona: config.persona, personas: config.personas });
  return {
    maxActions: cleanMaxActions(config.maxActions),
    includeTelemetry: cleanBoolean(config.includeTelemetry, true),
    includePlaytest: cleanBoolean(config.includePlaytest, true),
    includeWorldSimulation: cleanBoolean(config.includeWorldSimulation, true),
    personas,
    ...(config.fileName ? { fileName: config.fileName } : {}),
    ...(config.focus ? { focus: config.focus } : {}),
    ...(personas[0] ? { persona: personas[0] } : {}),
  };
}

export function completeGameAutonomousIterationLoopRun(
  config: GameAutonomousIterationLoopConfig,
  iteration: GameAutonomousIterationResponse,
  now = Date.now(),
): GameAutonomousIterationLoopConfig {
  const { nextRunAt: _previousNextRunAt, ...rest } = config;
  return {
    ...rest,
    lastRunAt: now,
    lastSummary: iteration.summary,
    lastActionCount: iteration.actions.length,
    ...(config.enabled ? { nextRunAt: now + config.intervalMinutes * 60_000 } : {}),
  };
}

function priorityFromSeverity(severity: string): GameAutonomousIterationPriority {
  if (severity === 'high') return 'p0';
  if (severity === 'medium') return 'p1';
  return 'p2';
}

function priorityRank(priority: GameAutonomousIterationPriority): number {
  if (priority === 'p0') return 0;
  if (priority === 'p1') return 1;
  return 2;
}

function ownerForTelemetry(insight: GameTelemetryInsight): GameAutonomousIterationAction['owner'] {
  if (insight.category === 'accessibility') return 'accessibility-design';
  if (insight.category === 'economy') return 'economy-progression';
  if (insight.category === 'combat-balance') return 'gameplay-mechanics';
  if (insight.category === 'progression' || insight.category === 'heatmap') return 'level-design';
  if (insight.category === 'retention') return 'live-ops';
  return 'game-director';
}

function ownerForPlaytest(finding: GamePlaytestSimulationFinding): GameAutonomousIterationAction['owner'] {
  if (finding.category === 'accessibility') return 'accessibility-design';
  if (finding.category === 'combat' || finding.category === 'pacing') return 'gameplay-mechanics';
  if (finding.category === 'navigation' || finding.category === 'readability') return 'level-design';
  if (finding.category === 'retention') return 'live-ops';
  return 'game-director';
}

function ownerForWorld(finding: GameWorldSimulationFinding): GameAutonomousIterationAction['owner'] {
  if (/\bfaction|territory|world\b/i.test(finding.id)) return 'narrative-design';
  if (/\bweather|hazard|resource\b/i.test(finding.id)) return 'level-design';
  if (/\breactiv|simulation|persistence\b/i.test(finding.id)) return 'technical-game-systems';
  return 'game-director';
}

function telemetryAction(insight: GameTelemetryInsight): GameAutonomousIterationAction {
  return {
    id: `telemetry-${insight.id}`,
    priority: priorityFromSeverity(insight.severity),
    owner: ownerForTelemetry(insight),
    source: 'telemetry',
    title: insight.title,
    evidence: insight.evidence,
    rationale: `Telemetry indicates a ${insight.category} issue affecting real playtest behavior.`,
    recommendation: insight.recommendation,
  };
}

function playtestAction(finding: GamePlaytestSimulationFinding): GameAutonomousIterationAction {
  return {
    id: `playtest-${finding.id}`,
    priority: priorityFromSeverity(finding.severity),
    owner: ownerForPlaytest(finding),
    source: 'playtest-simulation',
    title: finding.message,
    evidence: finding.evidence,
    rationale: `Deterministic playtest simulation flagged a ${finding.category} risk before runtime QA.`,
    recommendation: finding.recommendation,
  };
}

function ownerForPersonaReport(report: GamePlaytestPersonaReport): GameAutonomousIterationAction['owner'] {
  if (report.id === 'speedrunner') return 'level-design';
  if (report.id === 'completionist' || report.id === 'explorer') return 'live-ops';
  if (report.id === 'casual') return 'accessibility-design';
  if (report.id === 'rage-quitter') return 'gameplay-mechanics';
  return 'game-director';
}

function compactList(values: string[], fallback: string): string {
  const clean = values
    .map((value) => value.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 3);
  return clean.length > 0 ? clean.join('; ') : fallback;
}

function personaAction(report: GamePlaytestPersonaReport): GameAutonomousIterationAction {
  const friction = compactList(
    [...report.frustrationMoments, ...report.balanceIssues],
    `${report.label} completed the deterministic pass with ${report.risk} risk.`,
  );
  return {
    id: `playtest-persona-${report.id}`,
    priority: priorityFromSeverity(report.risk),
    owner: ownerForPersonaReport(report),
    source: 'playtest-simulation',
    title: `${report.label} persona reports ${report.risk}-risk session friction`,
    evidence: `completionTimeSec=${report.completionTimeSec}, deaths=${report.deaths}, friction=${friction}`,
    rationale: `Synthetic ${report.label} playtesting captures player-motivation risk beyond raw deterministic findings.`,
    recommendation: compactList(
      [...report.balanceIssues, ...report.frustrationMoments, ...report.unusedContent],
      'Review persona-specific friction and retune the next playtest pass around this player motivation.',
    ),
  };
}

function worldAction(finding: GameWorldSimulationFinding): GameAutonomousIterationAction {
  return {
    id: `world-${finding.id}`,
    priority: priorityFromSeverity(finding.severity),
    owner: ownerForWorld(finding),
    source: 'world-simulation',
    title: finding.title,
    evidence: finding.evidence,
    rationale: 'World-simulation analysis found a systemic design gap that can weaken replayability or coherence.',
    recommendation: finding.recommendation,
  };
}

export function buildGameAutonomousIteration(input: GameAutonomousIterationInput): GameAutonomousIterationResponse {
  const actions: GameAutonomousIterationAction[] = [];
  const telemetryInsights = input.telemetry?.insights ?? [];
  const playtestFindings = input.playtest?.findings ?? [];
  const personaReports = input.playtest?.personaReports ?? [];
  const worldFindings = input.world?.findings ?? [];

  if (input.request.includeTelemetry) {
    actions.push(...telemetryInsights.map(telemetryAction));
  }
  if (input.request.includePlaytest) {
    actions.push(...playtestFindings.map(playtestAction));
    actions.push(...personaReports.map(personaAction));
  }
  if (input.request.includeWorldSimulation) {
    actions.push(...worldFindings.map(worldAction));
  }

  if (actions.length === 0) {
    actions.push({
      id: 'studio-synthesis-next-playtest',
      priority: 'p2',
      owner: 'production-planning',
      source: 'studio-synthesis',
      title: 'Schedule a broader instrumented playtest pass',
      evidence: 'No deterministic telemetry, playtest, or world-simulation findings were available.',
      rationale: 'The studio needs fresh evidence before autonomous iteration can safely prioritize deeper changes.',
      recommendation: 'Run a targeted playtest with telemetry events, a `.gameview.json` scene, and explicit worldSimulation fields.',
    });
  }

  const deduped = new Map<string, GameAutonomousIterationAction>();
  for (const action of actions) {
    if (!deduped.has(action.id)) deduped.set(action.id, action);
  }
  const ranked = [...deduped.values()]
    .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || a.owner.localeCompare(b.owner))
    .slice(0, input.request.maxActions);
  const topPriority = ranked[0]?.priority ?? 'p2';
  const focusText = input.request.focus ? ` for ${input.request.focus}` : '';
  const personaText = personaReports.length > 0
    ? ` using ${personaReports.length} persona report${personaReports.length === 1 ? '' : 's'}`
    : '';
  const summary = `Synthesized ${ranked.length} prioritized game-studio iteration action${ranked.length === 1 ? '' : 's'}${focusText}${personaText}; top priority is ${topPriority}.`;

  return {
    ...(input.fileName ? { fileName: input.fileName } : {}),
    ...(input.request.focus ? { focus: input.request.focus } : {}),
    summary,
    actions: ranked,
    sources: {
      telemetryInsights: telemetryInsights.length,
      playtestFindings: playtestFindings.length,
      ...(personaReports.length > 0 ? { personaReports: personaReports.length } : {}),
      worldFindings: worldFindings.length,
    },
    generatedAt: input.generatedAt ?? Date.now(),
  };
}
