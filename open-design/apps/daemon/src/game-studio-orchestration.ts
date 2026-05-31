import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  GAME_STUDIO_AGENTS,
  GAME_STUDIO_COLLABORATION_HANDOFFS,
  GAME_STUDIO_DEBATE_CHECKPOINTS,
  type GameStudioAgentId,
} from '@ai-game-design-studio/contracts/game-studio';
import type {
  GameStudioAgentExecution,
  GameStudioAgentWorkOrder,
  GameStudioOrchestrationFileSignal,
  GameStudioOrchestrationLoopConfig,
  GameStudioOrchestrationPriority,
  GameStudioOrchestrationReconciliation,
  GameStudioOrchestrationRequest,
  GameStudioOrchestrationResponse,
} from '@ai-game-design-studio/contracts/api/projects';

const DEFAULT_MAX_WORK_ORDERS = 8;
const MAX_WORK_ORDERS = 20;
const DEFAULT_MAX_EXECUTIONS = 3;
const MAX_EXECUTIONS = 6;
const DEFAULT_LOOP_INTERVAL_MINUTES = 240;
const MIN_LOOP_INTERVAL_MINUTES = 15;
const MAX_LOOP_INTERVAL_MINUTES = 10080;
const LOOP_DIR = '.agds/studio-orchestration';
const LOOP_CONFIG_FILE = 'loop.json';

export type NormalizedGameStudioOrchestrationRequest = {
  focus?: string;
  maxWorkOrders: number;
  includeDebates: boolean;
  targetFiles: string[];
};

export type NormalizedGameStudioOrchestrationExecutionRequest =
  NormalizedGameStudioOrchestrationRequest & {
    agentId?: string;
    workOrderIds: string[];
    maxExecutions: number;
    waitForCompletion: boolean;
    model?: string;
    reasoning?: string;
  };

type NormalizeRequestResult =
  | { ok: true; request: NormalizedGameStudioOrchestrationRequest }
  | { ok: false; error: string };

type NormalizeExecutionRequestResult =
  | { ok: true; request: NormalizedGameStudioOrchestrationExecutionRequest }
  | { ok: false; error: string };

type NormalizeLoopResult =
  | { ok: true; config: GameStudioOrchestrationLoopConfig }
  | { ok: false; error: string };

export type GameStudioOrchestrationInput = {
  request: NormalizedGameStudioOrchestrationRequest;
  files: GameStudioOrchestrationFileSignal[];
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

function cleanStringArray(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => cleanString(item, maxLength))
    .filter((item): item is string => Boolean(item))
    .slice(0, maxItems);
}

function cleanBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (/^(true|1|yes)$/i.test(value.trim())) return true;
    if (/^(false|0|no)$/i.test(value.trim())) return false;
  }
  return fallback;
}

function cleanMaxWorkOrders(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return DEFAULT_MAX_WORK_ORDERS;
  return Math.max(1, Math.min(MAX_WORK_ORDERS, Math.trunc(n)));
}

function cleanMaxExecutions(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return DEFAULT_MAX_EXECUTIONS;
  return Math.max(1, Math.min(MAX_EXECUTIONS, Math.trunc(n)));
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

export function normalizeGameStudioOrchestrationRequest(input: unknown): NormalizeRequestResult {
  if (input !== undefined && input !== null && !isRecord(input)) {
    return { ok: false, error: 'request body must be an object' };
  }
  const source = isRecord(input) ? input : {};
  const focus = cleanString(source.focus, 96);
  return {
    ok: true,
    request: {
      maxWorkOrders: cleanMaxWorkOrders(source.maxWorkOrders),
      includeDebates: cleanBoolean(source.includeDebates, true),
      targetFiles: cleanStringArray(source.targetFiles, 24, 240),
      ...(focus ? { focus } : {}),
    },
  };
}

export function normalizeGameStudioOrchestrationExecutionRequest(input: unknown): NormalizeExecutionRequestResult {
  if (input !== undefined && input !== null && !isRecord(input)) {
    return { ok: false, error: 'request body must be an object' };
  }
  const source = isRecord(input) ? input : {};
  const normalized = normalizeGameStudioOrchestrationRequest(source);
  if (!normalized.ok) return normalized;
  const agentId = cleanString(source.agentId, 64);
  const model = cleanString(source.model, 128);
  const reasoning = cleanString(source.reasoning, 32);
  return {
    ok: true,
    request: {
      ...normalized.request,
      workOrderIds: cleanStringArray(source.workOrderIds, MAX_EXECUTIONS, 160),
      maxExecutions: cleanMaxExecutions(source.maxExecutions),
      waitForCompletion: cleanBoolean(source.waitForCompletion, false),
      ...(agentId ? { agentId } : {}),
      ...(model ? { model } : {}),
      ...(reasoning ? { reasoning } : {}),
    },
  };
}

export function defaultGameStudioOrchestrationLoopConfig(now = Date.now()): GameStudioOrchestrationLoopConfig {
  return {
    enabled: false,
    intervalMinutes: DEFAULT_LOOP_INTERVAL_MINUTES,
    maxWorkOrders: DEFAULT_MAX_WORK_ORDERS,
    includeDebates: true,
    targetFiles: [],
    autoExecute: false,
    maxExecutions: DEFAULT_MAX_EXECUTIONS,
    waitForCompletion: false,
    nextRunAt: now + DEFAULT_LOOP_INTERVAL_MINUTES * 60_000,
  };
}

export function normalizeGameStudioOrchestrationLoopConfig(
  input: unknown,
  previous: GameStudioOrchestrationLoopConfig = defaultGameStudioOrchestrationLoopConfig(),
  now = Date.now(),
): NormalizeLoopResult {
  if (input !== undefined && input !== null && !isRecord(input)) {
    return { ok: false, error: 'request body must be an object' };
  }
  const source = isRecord(input) ? input : {};
  const enabled = cleanBoolean(source.enabled, previous.enabled);
  const intervalMinutes = cleanLoopIntervalMinutes(source.intervalMinutes ?? previous.intervalMinutes);
  const normalized = normalizeGameStudioOrchestrationRequest({
    focus: source.focus ?? previous.focus,
    maxWorkOrders: source.maxWorkOrders ?? previous.maxWorkOrders,
    includeDebates: source.includeDebates ?? previous.includeDebates,
    targetFiles: source.targetFiles ?? previous.targetFiles,
  });
  if (!normalized.ok) return normalized;
  const nextRunAt = enabled
    ? cleanTimestamp(source.nextRunAt) ?? now + intervalMinutes * 60_000
    : undefined;
  const lastRunAt = cleanTimestamp(source.lastRunAt) ?? previous.lastRunAt;
  const lastSummary = cleanString(source.lastSummary, 240) ?? previous.lastSummary;
  const lastWorkOrderCount = typeof source.lastWorkOrderCount === 'number'
    ? Math.max(0, Math.trunc(source.lastWorkOrderCount))
    : previous.lastWorkOrderCount;
  const lastHandoffCount = typeof source.lastHandoffCount === 'number'
    ? Math.max(0, Math.trunc(source.lastHandoffCount))
    : previous.lastHandoffCount;
  const autoExecute = cleanBoolean(source.autoExecute, previous.autoExecute ?? false);
  const agentId = cleanString(source.agentId, 64) ?? previous.agentId;
  const model = cleanString(source.model, 128) ?? previous.model;
  const reasoning = cleanString(source.reasoning, 32) ?? previous.reasoning;
  const maxExecutions = cleanMaxExecutions(source.maxExecutions ?? previous.maxExecutions);
  const waitForCompletion = cleanBoolean(source.waitForCompletion, previous.waitForCompletion ?? false);
  const lastExecutionCount = typeof source.lastExecutionCount === 'number'
    ? Math.max(0, Math.trunc(source.lastExecutionCount))
    : previous.lastExecutionCount;
  const lastRunIds = Array.isArray(source.lastRunIds)
    ? cleanStringArray(source.lastRunIds, MAX_EXECUTIONS, 128)
    : previous.lastRunIds;
  const lastExecutedWorkOrderIds = Array.isArray(source.lastExecutedWorkOrderIds)
    ? cleanStringArray(source.lastExecutedWorkOrderIds, MAX_EXECUTIONS, 160)
    : previous.lastExecutedWorkOrderIds;
  const lastReconciliationSummary = cleanString(source.lastReconciliationSummary, 240)
    ?? previous.lastReconciliationSummary;

  return {
    ok: true,
    config: {
      enabled,
      intervalMinutes,
      ...normalized.request,
      autoExecute,
      maxExecutions,
      waitForCompletion,
      ...(agentId ? { agentId } : {}),
      ...(model ? { model } : {}),
      ...(reasoning ? { reasoning } : {}),
      ...(nextRunAt ? { nextRunAt } : {}),
      ...(lastRunAt ? { lastRunAt } : {}),
      ...(lastSummary ? { lastSummary } : {}),
      ...(lastWorkOrderCount === undefined ? {} : { lastWorkOrderCount }),
      ...(lastHandoffCount === undefined ? {} : { lastHandoffCount }),
      ...(lastExecutionCount === undefined ? {} : { lastExecutionCount }),
      ...(lastRunIds?.length ? { lastRunIds } : {}),
      ...(lastExecutedWorkOrderIds?.length ? { lastExecutedWorkOrderIds } : {}),
      ...(lastReconciliationSummary ? { lastReconciliationSummary } : {}),
    },
  };
}

function loopConfigFile(projectDir: string): string {
  return path.join(projectDir, LOOP_DIR, LOOP_CONFIG_FILE);
}

export async function readGameStudioOrchestrationLoopConfig(projectDir: string): Promise<GameStudioOrchestrationLoopConfig> {
  let raw = '';
  try {
    raw = await readFile(loopConfigFile(projectDir), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return defaultGameStudioOrchestrationLoopConfig();
    throw error;
  }
  try {
    const parsed = JSON.parse(raw);
    const normalized = normalizeGameStudioOrchestrationLoopConfig(parsed, defaultGameStudioOrchestrationLoopConfig());
    return normalized.ok ? normalized.config : defaultGameStudioOrchestrationLoopConfig();
  } catch {
    return defaultGameStudioOrchestrationLoopConfig();
  }
}

export async function writeGameStudioOrchestrationLoopConfig(
  projectDir: string,
  config: GameStudioOrchestrationLoopConfig,
): Promise<void> {
  const file = loopConfigFile(projectDir);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

export function studioOrchestrationRequestFromConfig(
  config: GameStudioOrchestrationLoopConfig,
): NormalizedGameStudioOrchestrationRequest {
  return {
    maxWorkOrders: cleanMaxWorkOrders(config.maxWorkOrders),
    includeDebates: cleanBoolean(config.includeDebates, true),
    targetFiles: cleanStringArray(config.targetFiles, 24, 240),
    ...(config.focus ? { focus: config.focus } : {}),
  };
}

export function studioOrchestrationExecutionRequestFromConfig(
  config: GameStudioOrchestrationLoopConfig,
): NormalizedGameStudioOrchestrationExecutionRequest {
  return {
    ...studioOrchestrationRequestFromConfig(config),
    workOrderIds: [],
    maxExecutions: cleanMaxExecutions(config.maxExecutions),
    waitForCompletion: cleanBoolean(config.waitForCompletion, false),
    ...(config.agentId ? { agentId: config.agentId } : {}),
    ...(config.model ? { model: config.model } : {}),
    ...(config.reasoning ? { reasoning: config.reasoning } : {}),
  };
}

export function completeGameStudioOrchestrationLoopRun(
  config: GameStudioOrchestrationLoopConfig,
  orchestration: GameStudioOrchestrationResponse,
  now = Date.now(),
  execution?: {
    executions?: GameStudioAgentExecution[];
    reconciliation?: GameStudioOrchestrationReconciliation;
  },
): GameStudioOrchestrationLoopConfig {
  const { nextRunAt: _previousNextRunAt, ...rest } = config;
  const executions = execution?.executions ?? [];
  const reconciliation = execution?.reconciliation;
  return {
    ...rest,
    lastRunAt: now,
    lastSummary: orchestration.summary,
    lastWorkOrderCount: orchestration.workOrders.length,
    lastHandoffCount: orchestration.handoffs.length,
    ...(config.autoExecute || executions.length > 0 ? { lastExecutionCount: executions.length } : {}),
    ...(executions.length > 0 ? { lastRunIds: executions.map((item) => item.runId) } : {}),
    ...(executions.length > 0 ? { lastExecutedWorkOrderIds: executions.map((item) => item.workOrderId) } : {}),
    ...(reconciliation ? { lastReconciliationSummary: reconciliation.summary } : {}),
    ...(config.enabled ? { nextRunAt: now + config.intervalMinutes * 60_000 } : {}),
  };
}

export function reconcileGameStudioOrchestrationExecutions(
  orchestration: GameStudioOrchestrationResponse,
  executions: GameStudioAgentExecution[],
): GameStudioOrchestrationReconciliation {
  const executedWorkOrderIds = executions.map((execution) => execution.workOrderId);
  const executed = new Set(executedWorkOrderIds);
  const workOrderById = new Map(orchestration.workOrders.map((order) => [order.id, order]));
  let resolvedDependencyCount = 0;

  for (const workOrderId of executedWorkOrderIds) {
    const workOrder = workOrderById.get(workOrderId);
    if (!workOrder) continue;
    resolvedDependencyCount += workOrder.dependsOn.filter((dependencyId) => executed.has(dependencyId)).length;
  }

  const remaining = orchestration.workOrders.filter((order) => !executed.has(order.id));
  const readyForFollowUpWorkOrderIds = remaining
    .filter((order) => order.dependsOn.length > 0 && order.dependsOn.every((dependencyId) => executed.has(dependencyId)))
    .map((order) => order.id);
  const blockedWorkOrderIds = remaining
    .filter((order) => order.dependsOn.length > 0 && order.dependsOn.some((dependencyId) => !executed.has(dependencyId)))
    .map((order) => order.id);
  const dependencyWord = resolvedDependencyCount === 1 ? 'dependency link' : 'dependency links';
  const followUpWord = readyForFollowUpWorkOrderIds.length === 1 ? 'work order' : 'work orders';
  const blockedWord = blockedWorkOrderIds.length === 1 ? 'blocked order' : 'blocked orders';

  return {
    executionCount: executions.length,
    runIds: executions.map((execution) => execution.runId),
    executedWorkOrderIds,
    resolvedDependencyCount,
    readyForFollowUpWorkOrderIds,
    blockedWorkOrderIds,
    summary: `Reconciled ${executions.length} child-agent execution run${executions.length === 1 ? '' : 's'} across ${new Set(executions.map((execution) => execution.studioAgentId)).size} studio discipline${executions.length === 1 ? '' : 's'}; resolved ${resolvedDependencyCount} ${dependencyWord}, unlocked ${readyForFollowUpWorkOrderIds.length} follow-up ${followUpWord}, and left ${blockedWorkOrderIds.length} downstream ${blockedWord}.`,
  };
}

function priorityRank(priority: GameStudioOrchestrationPriority): number {
  if (priority === 'p0') return 0;
  if (priority === 'p1') return 1;
  return 2;
}

function hasKind(files: GameStudioOrchestrationFileSignal[], pattern: RegExp): boolean {
  return files.some((file) => pattern.test(file.kind) || pattern.test(file.name));
}

function fileNamesFor(files: GameStudioOrchestrationFileSignal[], pattern: RegExp): string[] {
  return files
    .filter((file) => pattern.test(file.kind) || pattern.test(file.name))
    .map((file) => file.name)
    .slice(0, 4);
}

function roleTitle(agentId: GameStudioAgentId): string {
  return GAME_STUDIO_AGENTS.find((agent) => agent.id === agentId)?.title ?? agentId;
}

function workOrder(input: {
  agentId: GameStudioAgentId;
  priority: GameStudioOrchestrationPriority;
  title: string;
  objective: string;
  inputs: string[];
  expectedOutputs: string[];
  handoffIds?: string[];
  dependsOn?: string[];
}): GameStudioAgentWorkOrder {
  return {
    id: `${input.agentId}-${input.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48)}`,
    agentId: input.agentId,
    roleTitle: roleTitle(input.agentId),
    priority: input.priority,
    title: input.title,
    objective: input.objective,
    inputs: input.inputs,
    expectedOutputs: input.expectedOutputs,
    handoffIds: input.handoffIds ?? [],
    dependsOn: input.dependsOn ?? [],
    status: (input.dependsOn?.length ?? 0) > 0 ? 'blocked' : 'ready',
  };
}

export function buildGameStudioWorkOrderPrompt(input: {
  orchestration: GameStudioOrchestrationResponse;
  workOrder: GameStudioAgentWorkOrder;
}): string {
  const { orchestration, workOrder } = input;
  const handoffs = orchestration.handoffs.filter((handoff) =>
    handoff.requiredForAgents.includes(workOrder.agentId) ||
    handoff.from === workOrder.agentId ||
    handoff.to === workOrder.agentId,
  );
  const debates = orchestration.debates.filter((debate) =>
    debate.chair === workOrder.agentId || debate.challengers.includes(workOrder.agentId),
  );
  const lines = [
    `Execute this AI Game Design Studio work order as the ${workOrder.roleTitle}.`,
    '',
    `Studio role id: ${workOrder.agentId}`,
    `Priority: ${workOrder.priority}`,
    `Work order: ${workOrder.title}`,
    `Objective: ${workOrder.objective}`,
    '',
    'Inputs to inspect:',
    ...(workOrder.inputs.length > 0 ? workOrder.inputs.map((item) => `- ${item}`) : ['- Current project files and game design memory']),
    '',
    'Expected outputs:',
    ...workOrder.expectedOutputs.map((item) => `- ${item}`),
    '',
    'Relevant studio handoffs:',
    ...(handoffs.length > 0
      ? handoffs.map((handoff) => `- ${handoff.id}: ${handoff.from} -> ${handoff.to}; coordinate ${handoff.coordinates.join(', ')}; resolve ${handoff.resolves}`)
      : ['- No required peer handoff for this pass.']),
    '',
    'Relevant debate checkpoints:',
    ...(debates.length > 0
      ? debates.map((debate) => `- ${debate.id}: ${debate.question} Decision rule: ${debate.decisionRule}`)
      : ['- No formal debate checkpoint is assigned to this role.']),
    '',
    'Project file signals:',
    ...orchestration.fileSignals.slice(0, 20).map((file) => `- ${file.kind}: ${file.name}`),
    '',
    'Return a concise studio execution note with:',
    '- findings grounded in the project files',
    '- concrete proposed edits or specs',
    '- dependencies or handoffs needed before another role proceeds',
    '- production and accessibility risks if relevant',
  ];
  return lines.join('\n');
}

export function buildGameStudioOrchestration(input: GameStudioOrchestrationInput): GameStudioOrchestrationResponse {
  const targetSet = new Set(input.request.targetFiles);
  const files = targetSet.size > 0
    ? input.files.filter((file) => targetSet.has(file.name))
    : input.files;
  const fileSignals = files.slice(0, 40);
  const focus = input.request.focus ?? '';
  const hasViewport = hasKind(fileSignals, /game-viewport|\.gameview\.json/i);
  const hasSystem = hasKind(fileSignals, /game-system|\.systems\.json/i);
  const hasPlayable = hasKind(fileSignals, /\bhtml\b|\.html?$/i);
  const hasLogic = hasKind(fileSignals, /node-graph|behavior-tree|\.nodegraph\.json|\.btree\.json/i);
  const hasMedia = hasKind(fileSignals, /\bimage\b|\bvideo\b|\baudio\b|\.png|\.jpg|\.webp|\.mp3|\.wav|\.mp4/i);
  const wantsMultiplayer = /\b(multiplayer|co-?op|pvp|ranked|matchmaking|guild|clan)\b/i.test(focus);
  const wantsLiveOps = /\b(live ops|season|retention|event|battle pass)\b/i.test(focus);
  const wantsNarrative = /\b(narrative|story|quest|dialogue|faction|lore)\b/i.test(focus);

  const orders: GameStudioAgentWorkOrder[] = [
    workOrder({
      agentId: 'game-director',
      priority: 'p0',
      title: 'Lock game pillars and scope',
      objective: 'Resolve the player fantasy, genre promise, emotional target, and scope boundary before specialist work proceeds.',
      inputs: fileSignals.map((file) => `${file.kind}:${file.name}`).slice(0, 8),
      expectedOutputs: ['updated gameplay pillars', 'scope decision', 'specialist acceptance criteria'],
      handoffIds: ['director-to-production-scope'],
    }),
  ];

  if (hasViewport) {
    orders.push(workOrder({
      agentId: 'level-design',
      priority: 'p0',
      title: 'Audit scene flow and encounter readability',
      objective: 'Review spawn placement, traversal rhythm, sightlines, hazards, rewards, checkpoints, and environmental storytelling density.',
      inputs: fileNamesFor(fileSignals, /game-viewport|\.gameview\.json/i),
      expectedOutputs: ['level flow notes', 'encounter adjustment list', 'readability risks'],
      handoffIds: ['narrative-to-level-storytelling', 'multiplayer-to-level-fairness'],
      dependsOn: ['game-director-lock-game-pillars-and-scope'],
    }));
  }

  if (hasSystem || hasLogic || /combat|mechanic|movement|difficulty|feel/i.test(focus)) {
    orders.push(workOrder({
      agentId: 'gameplay-mechanics',
      priority: 'p0',
      title: 'Tune mechanics and game feel',
      objective: 'Convert the game pillars into concrete verbs, timing windows, recovery beats, counterplay, and mastery hooks.',
      inputs: [
        ...fileNamesFor(fileSignals, /game-system|\.systems\.json/i),
        ...fileNamesFor(fileSignals, /node-graph|behavior-tree|\.nodegraph\.json|\.btree\.json/i),
      ],
      expectedOutputs: ['mechanic tuning pass', 'risk-reward notes', 'difficulty curve changes'],
      handoffIds: ['gameplay-to-hud-readability', 'economy-to-gameplay-progression', 'audio-to-gameplay-feedback'],
      dependsOn: ['game-director-lock-game-pillars-and-scope'],
    }));
  }

  if (hasSystem || /economy|progression|loot|currency|reward|monetization/i.test(focus)) {
    orders.push(workOrder({
      agentId: 'economy-progression',
      priority: 'p1',
      title: 'Balance reward and progression loops',
      objective: 'Review XP, currency, loot, reward cadence, rarity, sinks, and ethical monetization pressure.',
      inputs: fileNamesFor(fileSignals, /game-system|\.systems\.json/i),
      expectedOutputs: ['economy balance notes', 'progression risks', 'ethical monetization checks'],
      handoffIds: ['economy-to-gameplay-progression', 'liveops-to-economy-retention'],
      dependsOn: ['game-director-lock-game-pillars-and-scope'],
    }));
  }

  if (hasPlayable || hasViewport || /hud|ui|inventory|minimap|controller|touch|accessibility/i.test(focus)) {
    orders.push(workOrder({
      agentId: 'game-ui-hud',
      priority: 'p1',
      title: 'Protect HUD and input readability',
      objective: 'Coordinate HUD state, control affordances, gameplay overlays, touch/controller support, and combat readability.',
      inputs: [
        ...fileNamesFor(fileSignals, /\bhtml\b|\.html?$/i),
        ...fileNamesFor(fileSignals, /game-viewport|\.gameview\.json/i),
      ],
      expectedOutputs: ['HUD state checklist', 'input readability notes', 'accessibility handoff'],
      handoffIds: ['gameplay-to-hud-readability', 'accessibility-to-hud-inclusive-readability'],
      dependsOn: ['gameplay-mechanics-tune-mechanics-and-game-feel'],
    }));
  }

  if (wantsNarrative || hasViewport) {
    orders.push(workOrder({
      agentId: 'narrative-design',
      priority: 'p1',
      title: 'Check story-world continuity',
      objective: 'Verify quests, factions, dialogue beats, cinematic pacing, and environmental storytelling reinforce the same player emotion.',
      inputs: fileNamesFor(fileSignals, /game-viewport|\.gameview\.json|\.md$/i),
      expectedOutputs: ['narrative continuity notes', 'quest/faction risks', 'environmental storytelling handoff'],
      handoffIds: ['narrative-to-level-storytelling'],
      dependsOn: ['game-director-lock-game-pillars-and-scope'],
    }));
  }

  if (hasMedia || /art|lighting|vfx|style|concept|biome/i.test(focus)) {
    orders.push(workOrder({
      agentId: 'art-direction',
      priority: 'p1',
      title: 'Protect visual language and performance budget',
      objective: 'Review visual identity, lighting, VFX hierarchy, material language, silhouettes, and engine/device budgets.',
      inputs: fileNamesFor(fileSignals, /\bimage\b|\bvideo\b|game-viewport|\.png|\.jpg|\.webp|\.gameview\.json/i),
      expectedOutputs: ['art direction notes', 'VFX/readability risks', 'technical budget handoff'],
      handoffIds: ['technical-to-art-performance'],
      dependsOn: ['game-director-lock-game-pillars-and-scope'],
    }));
  }

  if (hasMedia || /audio|music|sound|voice|sfx/i.test(focus)) {
    orders.push(workOrder({
      agentId: 'audio-direction',
      priority: 'p2',
      title: 'Map gameplay audio feedback',
      objective: 'Plan adaptive music, danger tells, combat feedback, UI cues, soundscape, and accessibility alternatives.',
      inputs: fileNamesFor(fileSignals, /\baudio\b|\.mp3|\.wav|\.m4a|game-viewport/i),
      expectedOutputs: ['audio cue map', 'adaptive intensity notes', 'gameplay feedback handoff'],
      handoffIds: ['audio-to-gameplay-feedback'],
      dependsOn: ['gameplay-mechanics-tune-mechanics-and-game-feel'],
    }));
  }

  if (wantsMultiplayer) {
    orders.push(workOrder({
      agentId: 'multiplayer-systems',
      priority: 'p1',
      title: 'Review multiplayer fairness and social systems',
      objective: 'Audit matchmaking, PvP/co-op roles, ranked health, latency-aware mechanics, social hooks, and spectator clarity.',
      inputs: fileSignals.map((file) => `${file.kind}:${file.name}`).slice(0, 8),
      expectedOutputs: ['multiplayer fairness risks', 'matchmaking notes', 'level fairness handoff'],
      handoffIds: ['multiplayer-to-level-fairness'],
      dependsOn: ['game-director-lock-game-pillars-and-scope'],
    }));
  }

  if (wantsLiveOps || hasSystem) {
    orders.push(workOrder({
      agentId: 'live-ops',
      priority: 'p2',
      title: 'Plan retention and seasonal health',
      objective: 'Check events, seasons, content rotation, community loops, burnout prevention, and reward trust.',
      inputs: fileNamesFor(fileSignals, /game-system|\.systems\.json|\.md$/i),
      expectedOutputs: ['live-ops cadence notes', 'retention risks', 'economy handoff'],
      handoffIds: ['liveops-to-economy-retention'],
      dependsOn: ['economy-progression-balance-reward-and-progression-loops'],
    }));
  }

  orders.push(
    workOrder({
      agentId: 'technical-game-systems',
      priority: 'p1',
      title: 'Validate engine and runtime feasibility',
      objective: 'Audit engine fit, memory/GPU budgets, networking needs, save/runtime systems, and procedural constraints.',
      inputs: fileSignals.map((file) => `${file.kind}:${file.name}`).slice(0, 8),
      expectedOutputs: ['technical feasibility risks', 'engine constraint notes', 'production scope handoff'],
      handoffIds: ['technical-to-art-performance', 'director-to-production-scope'],
      dependsOn: ['game-director-lock-game-pillars-and-scope'],
    }),
    workOrder({
      agentId: 'accessibility-design',
      priority: 'p1',
      title: 'Gate accessibility and readability',
      objective: 'Check HUD scaling, colorblind-safe feedback, subtitles/captions, remappable input, assist modes, and cognitive load.',
      inputs: fileSignals.map((file) => `${file.kind}:${file.name}`).slice(0, 8),
      expectedOutputs: ['accessibility acceptance criteria', 'input/readability risks', 'HUD handoff'],
      handoffIds: ['accessibility-to-hud-inclusive-readability'],
      dependsOn: ['game-ui-hud-protect-hud-and-input-readability'],
    }),
    workOrder({
      agentId: 'production-planning',
      priority: 'p1',
      title: 'Convert work into milestone-ready scope',
      objective: 'Turn specialist findings into milestone scope, asset budget, QA risk, and dependency order.',
      inputs: fileSignals.map((file) => `${file.kind}:${file.name}`).slice(0, 8),
      expectedOutputs: ['milestone work order', 'dependency map', 'scope cuts'],
      handoffIds: ['producer-to-director-scope-lock'],
      dependsOn: ['technical-game-systems-validate-engine-and-runtime-feasibility'],
    }),
  );

  const deduped = new Map<string, GameStudioAgentWorkOrder>();
  for (const order of orders) {
    if (!deduped.has(order.id)) deduped.set(order.id, order);
  }
  const workOrders = [...deduped.values()]
    .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || a.agentId.localeCompare(b.agentId))
    .slice(0, input.request.maxWorkOrders);
  const activeAgents = new Set(workOrders.map((order) => order.agentId));
  const handoffs = GAME_STUDIO_COLLABORATION_HANDOFFS
    .filter((handoff) => activeAgents.has(handoff.from) && activeAgents.has(handoff.to))
    .map((handoff) => ({
      id: handoff.id,
      from: handoff.from,
      to: handoff.to,
      coordinates: [...handoff.coordinates],
      resolves: handoff.resolves,
      requiredForAgents: [handoff.from, handoff.to],
    }));
  const debates = input.request.includeDebates
    ? GAME_STUDIO_DEBATE_CHECKPOINTS
      .filter((checkpoint) => activeAgents.has(checkpoint.chair) || checkpoint.challengers.some((agent) => activeAgents.has(agent)))
      .map((checkpoint) => ({
        id: checkpoint.id,
        chair: checkpoint.chair,
        challengers: [...checkpoint.challengers],
        question: checkpoint.question,
        decisionRule: checkpoint.decisionRule,
        evidence: [...checkpoint.evidence],
      }))
    : [];
  const focusText = input.request.focus ? ` for ${input.request.focus}` : '';
  const summary = `Planned ${workOrders.length} studio-agent work order${workOrders.length === 1 ? '' : 's'}${focusText} across ${activeAgents.size} disciplines with ${handoffs.length} handoff${handoffs.length === 1 ? '' : 's'} and ${debates.length} debate checkpoint${debates.length === 1 ? '' : 's'}.`;

  return {
    ...(input.request.focus ? { focus: input.request.focus } : {}),
    summary,
    workOrders,
    handoffs,
    debates,
    fileSignals,
    generatedAt: input.generatedAt ?? Date.now(),
  };
}
