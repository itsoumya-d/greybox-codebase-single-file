import { gameViewportDocumentSchema } from '@ai-game-design-studio/contracts/game-studio';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { GameViewportDocument, GameViewportEntity } from '@ai-game-design-studio/contracts/api/files';
import type {
  GameWorldSimulationEvent,
  GameWorldSimulationFinding,
  GameWorldSimulationLoopConfig,
  GameWorldSimulationMetric,
  GameWorldSimulationRequest,
  GameWorldSimulationResponse,
  GameWorldSimulationRisk,
  GameWorldSimulationState,
} from '@ai-game-design-studio/contracts/api/projects';

const DEFAULT_TICKS = 6;
const MAX_TICKS = 24;
const DEFAULT_LOOP_INTERVAL_MINUTES = 15;
const LOOP_DIR = '.agds/world-simulation';
const LOOP_CONFIG_FILE = 'loop.json';

export type NormalizedGameWorldSimulationRequest = {
  fileName?: string;
  ticks: number;
  scenario?: string;
};

type NormalizeResult =
  | { ok: true; request: NormalizedGameWorldSimulationRequest }
  | { ok: false; error: string };

type NormalizeLoopResult =
  | { ok: true; config: GameWorldSimulationLoopConfig }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cleanString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const clean = value.replace(/\0/g, '').trim();
  return clean ? clean.slice(0, maxLength) : undefined;
}

function cleanTicks(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return DEFAULT_TICKS;
  return Math.max(1, Math.min(MAX_TICKS, Math.trunc(n)));
}

function cleanBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const clean = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'enabled'].includes(clean)) return true;
    if (['false', '0', 'no', 'disabled'].includes(clean)) return false;
  }
  return fallback;
}

function cleanLoopIntervalMinutes(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return DEFAULT_LOOP_INTERVAL_MINUTES;
  return Math.max(1, Math.min(24 * 60, Math.trunc(n)));
}

function cleanTimestamp(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.trunc(n);
}

function cleanPressure(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return undefined;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function normalizeWorldSimulationState(value: unknown): GameWorldSimulationState | undefined {
  if (!isRecord(value)) return undefined;
  const tick = cleanTicks(value.tick);
  const factionControl: Record<string, number> = {};
  if (isRecord(value.factionControl)) {
    for (const [key, raw] of Object.entries(value.factionControl)) {
      const name = cleanString(key, 120);
      const pressure = cleanPressure(raw);
      if (name && pressure !== undefined) factionControl[name] = pressure;
    }
  }
  const persistenceKeys = Array.isArray(value.persistenceKeys)
    ? value.persistenceKeys
      .map((item) => cleanString(item, 120))
      .filter((item): item is string => Boolean(item))
      .slice(0, 12)
    : [];
  const activeWeather = cleanString(value.activeWeather, 240);
  const state: GameWorldSimulationState = {
    tick,
    ...(activeWeather ? { activeWeather } : {}),
    factionControl,
    resourcePressure: cleanPressure(value.resourcePressure) ?? 0,
    hazardPressure: cleanPressure(value.hazardPressure) ?? 0,
    ecosystemPressure: cleanPressure(value.ecosystemPressure) ?? 0,
    dynamicEventPressure: cleanPressure(value.dynamicEventPressure) ?? 0,
    persistenceKeys,
  };
  return state;
}

export function normalizeGameWorldSimulationRequest(input: unknown): NormalizeResult {
  if (input !== undefined && input !== null && !isRecord(input)) {
    return { ok: false, error: 'request body must be an object' };
  }
  const source = isRecord(input) ? input : {};
  const fileName = cleanString(source.fileName, 240);
  const scenario = cleanString(source.scenario, 96);
  return {
    ok: true,
    request: {
      ticks: cleanTicks(source.ticks),
      ...(fileName ? { fileName } : {}),
      ...(scenario ? { scenario } : {}),
    },
  };
}

export function defaultGameWorldSimulationLoopConfig(): GameWorldSimulationLoopConfig {
  return {
    enabled: false,
    intervalMinutes: DEFAULT_LOOP_INTERVAL_MINUTES,
    ticks: DEFAULT_TICKS,
  };
}

export function normalizeGameWorldSimulationLoopConfig(
  input: unknown,
  previous: GameWorldSimulationLoopConfig = defaultGameWorldSimulationLoopConfig(),
  now = Date.now(),
): NormalizeLoopResult {
  if (input !== undefined && input !== null && !isRecord(input)) {
    return { ok: false, error: 'request body must be an object' };
  }
  const source = isRecord(input) ? input : {};
  const enabled = cleanBoolean(source.enabled, previous.enabled);
  const intervalMinutes = cleanLoopIntervalMinutes(source.intervalMinutes ?? previous.intervalMinutes);
  const normalized = normalizeGameWorldSimulationRequest({
    fileName: source.fileName ?? previous.fileName,
    ticks: source.ticks ?? previous.ticks,
    scenario: source.scenario ?? previous.scenario,
  });
  if (!normalized.ok) return normalized;
  const nextRunAt = enabled
    ? cleanTimestamp(source.nextRunAt) ?? now + intervalMinutes * 60_000
    : undefined;
  const lastRunAt = cleanTimestamp(source.lastRunAt) ?? previous.lastRunAt;
  const lastSummary = cleanString(source.lastSummary, 240) ?? previous.lastSummary;
  const lastEventCount = typeof source.lastEventCount === 'number'
    ? Math.max(0, Math.trunc(source.lastEventCount))
    : previous.lastEventCount;
  const lastFindingCount = typeof source.lastFindingCount === 'number'
    ? Math.max(0, Math.trunc(source.lastFindingCount))
    : previous.lastFindingCount;
  const lastState = normalizeWorldSimulationState(source.lastState) ?? previous.lastState;

  return {
    ok: true,
    config: {
      enabled,
      intervalMinutes,
      ...normalized.request,
      ...(nextRunAt ? { nextRunAt } : {}),
      ...(lastRunAt ? { lastRunAt } : {}),
      ...(lastSummary ? { lastSummary } : {}),
      ...(lastEventCount === undefined ? {} : { lastEventCount }),
      ...(lastFindingCount === undefined ? {} : { lastFindingCount }),
      ...(lastState ? { lastState } : {}),
    },
  };
}

function loopConfigFile(projectDir: string): string {
  return path.join(projectDir, LOOP_DIR, LOOP_CONFIG_FILE);
}

export async function readGameWorldSimulationLoopConfig(projectDir: string): Promise<GameWorldSimulationLoopConfig> {
  let raw = '';
  try {
    raw = await readFile(loopConfigFile(projectDir), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return defaultGameWorldSimulationLoopConfig();
    throw error;
  }
  try {
    const parsed = JSON.parse(raw);
    const normalized = normalizeGameWorldSimulationLoopConfig(parsed, defaultGameWorldSimulationLoopConfig());
    return normalized.ok ? normalized.config : defaultGameWorldSimulationLoopConfig();
  } catch {
    return defaultGameWorldSimulationLoopConfig();
  }
}

export async function writeGameWorldSimulationLoopConfig(
  projectDir: string,
  config: GameWorldSimulationLoopConfig,
): Promise<void> {
  const file = loopConfigFile(projectDir);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

export function worldSimulationRequestFromLoopConfig(config: GameWorldSimulationLoopConfig): NormalizedGameWorldSimulationRequest {
  return {
    ticks: cleanTicks(config.ticks),
    ...(config.fileName ? { fileName: config.fileName } : {}),
    ...(config.scenario ? { scenario: config.scenario } : {}),
  };
}

export function completeGameWorldSimulationLoopRun(
  config: GameWorldSimulationLoopConfig,
  simulation: GameWorldSimulationResponse,
  now = Date.now(),
): GameWorldSimulationLoopConfig {
  const { nextRunAt: _previousNextRunAt, ...rest } = config;
  return {
    ...rest,
    lastRunAt: now,
    lastSummary: simulation.summary,
    lastEventCount: simulation.events.length,
    lastFindingCount: simulation.findings.length,
    lastState: simulation.state,
    ...(config.enabled ? { nextRunAt: now + config.intervalMinutes * 60_000 } : {}),
  };
}

function entityText(entity: GameViewportEntity): string {
  return `${entity.type} ${entity.name} ${entity.faction ?? ''} ${entity.notes ?? ''}`.toLowerCase();
}

function countEntities(entities: GameViewportEntity[], pattern: RegExp): number {
  return entities.filter((entity) => pattern.test(entityText(entity))).length;
}

function riskFromText(text: string): GameWorldSimulationRisk {
  if (/\b(catastrophe|invasion|war|collapse|boss|storm|siege|raid|critical)\b/i.test(text)) return 'high';
  if (/\b(ambush|scarcity|hazard|conflict|pressure|hostile|danger)\b/i.test(text)) return 'medium';
  return 'low';
}

function highestRisk(events: GameWorldSimulationEvent[], findings: GameWorldSimulationFinding[]): GameWorldSimulationRisk {
  if (events.some((event) => event.risk === 'high') || findings.some((finding) => finding.severity === 'high')) return 'high';
  if (events.some((event) => event.risk === 'medium') || findings.some((finding) => finding.severity === 'medium')) return 'medium';
  return 'low';
}

function makeMetric(
  id: string,
  label: string,
  value: number | string,
  target?: number | string,
  risk?: GameWorldSimulationRisk,
): GameWorldSimulationMetric {
  return {
    id,
    label,
    value,
    ...(target === undefined ? {} : { target }),
    ...(risk === undefined ? {} : { risk }),
  };
}

function clampWorldPressure(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function riskPressure(risk: GameWorldSimulationRisk): number {
  if (risk === 'high') return 28;
  if (risk === 'medium') return 16;
  return 8;
}

function persistenceKeysForWorld(world: GameViewportDocument['worldSimulation']): string[] {
  if (!world) return [];
  const keys: string[] = [];
  if (world.persistence) keys.push('persistence');
  if (world.weather) keys.push('weather');
  if (world.ecosystem) keys.push('ecosystem');
  if ((world.factionTerritory ?? []).length > 0) keys.push('factionTerritory');
  if ((world.reactiveRules ?? []).length > 0) keys.push('reactiveRules');
  return keys;
}

function createInitialWorldState(
  ticks: number,
  world: GameViewportDocument['worldSimulation'],
  factionTerritory: string[],
  resourceNodes: number,
  hazards: number,
): GameWorldSimulationState {
  const factionControl: Record<string, number> = {};
  for (const territory of factionTerritory) factionControl[territory] = 50;
  return {
    tick: ticks,
    ...(world?.weather ? { activeWeather: world.weather } : {}),
    factionControl,
    resourcePressure: clampWorldPressure(resourceNodes * 12),
    hazardPressure: clampWorldPressure(hazards * 14),
    ecosystemPressure: world?.ecosystem ? 20 : 0,
    dynamicEventPressure: 0,
    persistenceKeys: persistenceKeysForWorld(world),
  };
}

export function simulateGameViewportWorld(
  fileName: string,
  rawContent: string,
  request: GameWorldSimulationRequest | NormalizedGameWorldSimulationRequest = {},
): GameWorldSimulationResponse {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawContent);
  } catch (error) {
    throw new Error(`invalid game viewport JSON: ${(error as Error).message}`);
  }

  const parsed = gameViewportDocumentSchema.safeParse(parsedJson);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path.length ? issue.path.join('.') : 'document';
    throw new Error(`invalid game viewport document at ${path}: ${issue?.message ?? 'schema validation failed'}`);
  }

  const document = parsed.data as GameViewportDocument;
  const ticks = cleanTicks(request.ticks);
  const scenario = cleanString(request.scenario, 96);
  const entities = document.entities ?? [];
  const world = document.worldSimulation;
  const dynamicEvents = document.dynamicEvents ?? [];
  const reactiveRules = world?.reactiveRules ?? [];
  const factionTerritory = world?.factionTerritory ?? [];
  const biomeSignals = (document.terrainZones ?? []).filter((zone) => /\bbiome|water|safe-zone|hazard-field|high-ground\b/i.test(`${zone.type ?? ''} ${zone.name}`)).length
    + countEntities(entities, /\bbiome|weather-volume\b/i);
  const factionSignals = factionTerritory.length + countEntities(entities, /\bfaction|enemy-spawn|npc\b/i);
  const resourceNodes = countEntities(entities, /\bresource-node|reward\b/i);
  const hazards = countEntities(entities, /\bhazard|destructible\b/i)
    + (document.terrainZones ?? []).filter((zone) => /\bhazard|danger|storm|lava|poison\b/i.test(`${zone.type ?? ''} ${zone.name} ${zone.notes ?? ''}`)).length;
  const events: GameWorldSimulationEvent[] = [];
  const findings: GameWorldSimulationFinding[] = [];
  const state = createInitialWorldState(ticks, world, factionTerritory, resourceNodes, hazards);

  if (!world) {
    findings.push({
      id: 'missing-world-simulation-block',
      severity: 'high',
      title: 'Viewport has no world simulation model',
      evidence: 'worldSimulation is absent.',
      recommendation: 'Add ecosystem, faction territory, weather, persistence, destruction, and reactive rule fields before relying on systemic world planning.',
    });
  }

  if (dynamicEvents.length === 0) {
    findings.push({
      id: 'missing-dynamic-events',
      severity: 'medium',
      title: 'World state has no dynamic event cadence',
      evidence: 'dynamicEvents is empty.',
      recommendation: 'Add invasions, weather shifts, faction moves, roaming encounters, seasonal events, or resource shocks to test replayability.',
    });
  }

  if (factionSignals > 1 && reactiveRules.length === 0) {
    findings.push({
      id: 'factions-without-reactivity',
      severity: 'medium',
      title: 'Faction pressure lacks reactive rules',
      evidence: `factionSignals=${factionSignals}, reactiveRules=0`,
      recommendation: 'Define how factions gain/lose territory, respond to player choices, and affect encounters or economy over time.',
    });
  }

  if (world?.weather && !world.persistence) {
    findings.push({
      id: 'weather-without-persistence',
      severity: 'low',
      title: 'Weather exists without persistence rules',
      evidence: `weather="${world.weather}" but persistence is empty.`,
      recommendation: 'Define whether weather changes hazards, visibility, NPC schedules, traversal, and save/load world state.',
    });
  }

  if (resourceNodes > 0 && dynamicEvents.length === 0) {
    findings.push({
      id: 'resources-without-economy-shifts',
      severity: 'low',
      title: 'Resource nodes are static',
      evidence: `resourceNodes=${resourceNodes}, dynamicEvents=0`,
      recommendation: 'Add depletion, regeneration, faction control, or market-shift rules so resources support systemic play.',
    });
  }

  for (let tick = 1; tick <= ticks; tick += 1) {
    const dynamic = dynamicEvents[(tick - 1) % Math.max(1, dynamicEvents.length)];
    if (dynamic) {
      const text = `${dynamic.name} ${dynamic.trigger ?? ''} ${dynamic.impact ?? ''}`;
      const risk = riskFromText(text);
      events.push({
        id: `dynamic-${dynamic.id}-${tick}`,
        tick,
        type: 'dynamic-event',
        title: dynamic.name,
        impact: dynamic.impact || dynamic.trigger || 'Dynamic event changes local encounter pressure.',
        risk,
      });
      state.dynamicEventPressure = clampWorldPressure(state.dynamicEventPressure + riskPressure(risk));
    }

    if (tick % 2 === 0 && factionSignals > 0) {
      const territory = factionTerritory[(tick / 2 - 1) % Math.max(1, factionTerritory.length)] ?? 'contested route';
      state.factionControl[territory] = clampWorldPressure((state.factionControl[territory] ?? 45) + (reactiveRules.length > 0 ? 6 : 12));
      events.push({
        id: `faction-pressure-${tick}`,
        tick,
        type: 'faction-pressure',
        title: 'Faction influence shifts',
        impact: `${territory} changes patrol density, NPC reactions, or encounter ownership.`,
        risk: factionSignals > 3 ? 'medium' : 'low',
      });
    }

    if (tick % 3 === 0 && world?.weather) {
      const risk = riskFromText(world.weather);
      state.activeWeather = world.weather;
      events.push({
        id: `weather-shift-${tick}`,
        tick,
        type: 'weather-shift',
        title: 'Weather state pressures traversal',
        impact: world.weather,
        risk,
      });
      state.hazardPressure = clampWorldPressure(state.hazardPressure + Math.floor(riskPressure(risk) / 2));
    }

    if (tick % 4 === 0 && resourceNodes > 0) {
      state.resourcePressure = clampWorldPressure(state.resourcePressure + (dynamicEvents.length > 0 ? 8 : 14));
      events.push({
        id: `resource-shift-${tick}`,
        tick,
        type: 'resource-shift',
        title: 'Resource availability shifts',
        impact: `${resourceNodes} reward/resource node${resourceNodes === 1 ? '' : 's'} should refresh, deplete, or change faction value.`,
        risk: dynamicEvents.length > 0 ? 'low' : 'medium',
      });
    }

    if (tick % 5 === 0 && world?.ecosystem) {
      state.ecosystemPressure = clampWorldPressure(state.ecosystemPressure + 10);
      events.push({
        id: `ecosystem-response-${tick}`,
        tick,
        type: 'ecosystem-response',
        title: 'Ecosystem reacts to player pressure',
        impact: world.ecosystem,
        risk: 'low',
      });
    }

    if (tick % 3 === 1 && hazards > 0) {
      const risk: GameWorldSimulationRisk = reactiveRules.length > 0 ? 'medium' : 'high';
      state.hazardPressure = clampWorldPressure(state.hazardPressure + riskPressure(risk));
      events.push({
        id: `hazard-escalation-${tick}`,
        tick,
        type: 'hazard-escalation',
        title: 'Environmental hazard pressure changes',
        impact: `${hazards} hazard/destruction signal${hazards === 1 ? '' : 's'} need readable escalation and recovery windows.`,
        risk,
      });
    }
  }

  const metrics: GameWorldSimulationMetric[] = [
    makeMetric('ticks', 'Simulation ticks', ticks, '1-24', 'low'),
    makeMetric('dynamic-events', 'Dynamic events', dynamicEvents.length, '>= 1', dynamicEvents.length > 0 ? 'low' : 'medium'),
    makeMetric('faction-signals', 'Faction/NPC pressure signals', factionSignals),
    makeMetric('biome-signals', 'Biome/environment signals', biomeSignals, '>= 1', biomeSignals > 0 ? 'low' : 'medium'),
    makeMetric('resource-nodes', 'Reward/resource nodes', resourceNodes),
    makeMetric('hazard-signals', 'Hazard/destruction signals', hazards),
    makeMetric('world-state-pressure', 'World state pressure', Math.max(state.dynamicEventPressure, state.hazardPressure, state.resourcePressure), '<= 70', Math.max(state.dynamicEventPressure, state.hazardPressure, state.resourcePressure) > 70 ? 'medium' : 'low'),
    makeMetric('faction-control-nodes', 'Faction control nodes', Object.keys(state.factionControl).length),
    makeMetric('reactive-rules', 'Reactive world rules', reactiveRules.length, factionSignals > 1 ? '>= 1' : 'optional', factionSignals > 1 && reactiveRules.length === 0 ? 'medium' : 'low'),
    makeMetric('simulated-events', 'Generated world timeline events', events.length, '>= 1', events.length > 0 ? 'low' : 'high'),
  ];

  const risk = highestRisk(events, findings);
  const summary = `Simulated ${ticks} world tick${ticks === 1 ? '' : 's'} for "${document.title}" with ${events.length} timeline event${events.length === 1 ? '' : 's'} and ${findings.length} ${risk}-risk finding${findings.length === 1 ? '' : 's'}.`;

  return {
    fileName,
    ticks,
    ...(scenario ? { scenario } : {}),
    summary,
    metrics,
    events,
    findings,
    state,
  };
}
