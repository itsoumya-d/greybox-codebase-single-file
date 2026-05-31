import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createCommandInvocation } from '@ai-game-design-studio/platform';
import type { Project } from '@ai-game-design-studio/contracts/api/projects';
import type {
  GameStudioAgentExecution,
  GameStudioOrchestrationReconciliation,
  GameStudioOrchestrationResponse,
} from '@ai-game-design-studio/contracts/api/projects';
import type { GameSystemSpecDocument } from '@ai-game-design-studio/contracts/api/files';

import { agentCliEnvForAgent, readAppConfig, type AppConfigPrefs } from './app-config.js';
import {
  getAgentDef,
  isKnownModel,
  resolveAgentBin,
  sanitizeCustomModel,
  spawnEnvForAgent,
} from './agents.js';
import { openDatabase, getProject, updateProject } from './db.js';
import { buildGameTelemetryInsights, readGameTelemetryEvents } from './game-telemetry.js';
import {
  buildGameAutonomousIteration,
  completeGameAutonomousIterationLoopRun,
  loopRequestFromConfig,
  readGameAutonomousIterationLoopConfig,
  writeGameAutonomousIterationLoopConfig,
} from './game-autonomous-iteration.js';
import {
  applyGameBalanceAdjustmentsToSystemDocument,
  balanceLoopRequestFromConfig,
  buildGameBalanceLoop,
  completeGameBalanceLoopRun,
  readGameBalanceLoopConfig,
  writeGameBalanceLoopConfig,
} from './game-balance-loop.js';
import {
  buildGameStudioWorkOrderPrompt,
  buildGameStudioOrchestration,
  completeGameStudioOrchestrationLoopRun,
  readGameStudioOrchestrationLoopConfig,
  reconcileGameStudioOrchestrationExecutions,
  studioOrchestrationExecutionRequestFromConfig,
  studioOrchestrationRequestFromConfig,
  writeGameStudioOrchestrationLoopConfig,
} from './game-studio-orchestration.js';
import { simulateGameViewportPlaytest } from './game-playtest-simulation.js';
import {
  completeGameWorldSimulationLoopRun,
  readGameWorldSimulationLoopConfig,
  simulateGameViewportWorld,
  worldSimulationRequestFromLoopConfig,
  writeGameWorldSimulationLoopConfig,
} from './game-world-simulation.js';
import { listFiles, readProjectFile, resolveProjectDir, writeProjectFile } from './projects.js';
import { resolveProjectRelativePath } from './home-expansion.js';

export const STUDIO_SCHEDULER_TASKS = ['world-simulation', 'autonomous-iteration', 'balance-loop', 'studio-orchestration'] as const;

export type StudioSchedulerTask = (typeof STUDIO_SCHEDULER_TASKS)[number];
export type StudioSchedulerTaskStatus = 'run' | 'skipped' | 'error';

export interface StudioSchedulerTaskResult {
  task: StudioSchedulerTask;
  status: StudioSchedulerTaskStatus;
  projectId: string;
  reason?: string;
  summary?: string;
  fileName?: string;
  eventCount?: number;
  findingCount?: number;
  actionCount?: number;
  adjustmentCount?: number;
  appliedCount?: number;
  workOrderCount?: number;
  handoffCount?: number;
  executionCount?: number;
  runIds?: string[];
  reconciliationSummary?: string;
  lastRunAt?: number;
  nextRunAt?: number;
}

export interface StudioSchedulerRunResult {
  projectId: string;
  dataDir: string;
  generatedAt: number;
  results: StudioSchedulerTaskResult[];
}

export interface StudioSchedulerRunInput {
  projectId: string;
  projectRoot?: string;
  dataDir?: string;
  tasks?: StudioSchedulerTask[];
  force?: boolean;
  now?: number;
}

type ProjectFile = {
  name: string;
  kind?: string;
  path?: string;
  buffer: Buffer;
};

type ResolveFileResult =
  | { ok: true; file: ProjectFile }
  | { ok: false; reason: string };

type ResolveOptionalFileResult =
  | { ok: true; file?: ProjectFile }
  | { ok: false; reason: string };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OFFLINE_STUDIO_AGENT_TIMEOUT_MS = 45_000;

export function resolveStudioSchedulerProjectRoot(moduleDir = __dirname): string {
  const base = path.basename(moduleDir);
  const daemonDir = base === 'dist' || base === 'src' ? path.dirname(moduleDir) : moduleDir;
  return path.resolve(daemonDir, '../..');
}

export function resolveStudioSchedulerDataDir({
  dataDir,
  projectRoot = resolveStudioSchedulerProjectRoot(),
  env = process.env,
}: {
  dataDir?: string;
  projectRoot?: string;
  env?: NodeJS.ProcessEnv;
} = {}): string {
  const configured = cleanString(dataDir) ?? cleanString(env.AGDS_DATA_DIR);
  return configured
    ? resolveProjectRelativePath(configured, projectRoot)
    : path.join(projectRoot, '.agds');
}

export function normalizeStudioSchedulerTasks(value: unknown): StudioSchedulerTask[] {
  if (value === undefined || value === null || value === '' || value === 'all') {
    return [...STUDIO_SCHEDULER_TASKS];
  }
  const raw = Array.isArray(value) ? value : String(value).split(',');
  const tasks: StudioSchedulerTask[] = [];
  for (const item of raw) {
    const task = cleanString(item);
    if (!task) continue;
    if (
      task !== 'world-simulation'
      && task !== 'autonomous-iteration'
      && task !== 'balance-loop'
      && task !== 'studio-orchestration'
    ) {
      throw new Error(`unsupported studio scheduler task: ${task}`);
    }
    if (!tasks.includes(task)) tasks.push(task);
  }
  return tasks.length > 0 ? tasks : [...STUDIO_SCHEDULER_TASKS];
}

export function studioSchedulerCommandExample(projectId: string): string {
  return `agds studio-scheduler run --project ${projectId} --task all`;
}

function cleanString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const clean = value.replace(/\0/g, '').trim();
  return clean.length > 0 ? clean : undefined;
}

function shouldRunLoop(
  config: { enabled: boolean; nextRunAt?: number },
  force: boolean,
  now: number,
): { run: true } | { run: false; reason: string } {
  if (force) return { run: true };
  if (!config.enabled) return { run: false, reason: 'loop disabled' };
  if (typeof config.nextRunAt === 'number' && config.nextRunAt > now) {
    return { run: false, reason: `not due until ${new Date(config.nextRunAt).toISOString()}` };
  }
  return { run: true };
}

async function resolveGameViewportForScheduler(
  projectsRoot: string,
  project: Project,
  request: { fileName?: string },
  missingMessage: string,
): Promise<ResolveFileResult> {
  if (request.fileName && !/\.gameview\.json$/i.test(request.fileName)) {
    return { ok: false, reason: 'fileName must target a .gameview.json document' };
  }
  if (request.fileName) {
    return {
      ok: true,
      file: await readProjectFile(projectsRoot, project.id, request.fileName, project.metadata) as ProjectFile,
    };
  }

  const files = await listFiles(projectsRoot, project.id, { metadata: project.metadata });
  const candidate = files.find((entry) => entry.kind === 'game-viewport' || /\.gameview\.json$/i.test(entry.name));
  if (!candidate) return { ok: false, reason: missingMessage };
  return {
    ok: true,
    file: await readProjectFile(projectsRoot, project.id, candidate.path || candidate.name, project.metadata) as ProjectFile,
  };
}

async function findOptionalGameViewportForScheduler(
  projectsRoot: string,
  project: Project,
  request: { fileName?: string },
): Promise<ResolveOptionalFileResult> {
  if (request.fileName) {
    return resolveGameViewportForScheduler(
      projectsRoot,
      project,
      request,
      'no .gameview.json viewport document found for autonomous iteration',
    );
  }

  const files = await listFiles(projectsRoot, project.id, { metadata: project.metadata });
  const candidate = files.find((entry) => entry.kind === 'game-viewport' || /\.gameview\.json$/i.test(entry.name));
  if (!candidate) return { ok: true };
  return {
    ok: true,
    file: await readProjectFile(projectsRoot, project.id, candidate.path || candidate.name, project.metadata) as ProjectFile,
  };
}

async function findOptionalGameSystemForScheduler(
  projectsRoot: string,
  project: Project,
  request: { systemFileName?: string },
): Promise<ResolveOptionalFileResult> {
  if (request.systemFileName) {
    if (!/\.systems\.json$/i.test(request.systemFileName)) {
      return { ok: false, reason: 'systemFileName must target a .systems.json game-system document' };
    }
    const file = await readProjectFile(projectsRoot, project.id, request.systemFileName, project.metadata) as ProjectFile;
    if (file.kind !== 'game-system' && !/\.systems\.json$/i.test(file.name)) {
      return { ok: false, reason: 'systemFileName must target a game-system document' };
    }
    return { ok: true, file };
  }

  const files = await listFiles(projectsRoot, project.id, { metadata: project.metadata });
  const candidate = files.find((entry) => entry.kind === 'game-system' || /\.systems\.json$/i.test(entry.name));
  if (!candidate) return { ok: true };
  return {
    ok: true,
    file: await readProjectFile(projectsRoot, project.id, candidate.path || candidate.name, project.metadata) as ProjectFile,
  };
}

function parseGameSystemForScheduler(file: ProjectFile | undefined): GameSystemSpecDocument | undefined {
  if (!file) return undefined;
  const parsed = JSON.parse(file.buffer.toString('utf8')) as unknown;
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as GameSystemSpecDocument : undefined;
}

function schedulerRunId(projectId: string, workOrderId: string, now: number, index: number): string {
  const safeProject = projectId.replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 32) || 'project';
  const safeOrder = workOrderId.replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 48) || 'work-order';
  return `scheduler-${safeProject}-${safeOrder}-${now}-${index + 1}`;
}

function agentOptionsForOfflineScheduler(def: any, model?: string, reasoning?: string): {
  model?: string;
  reasoning?: string;
} {
  const safeModel = typeof model === 'string'
    ? (isKnownModel(def, model) ? model : sanitizeCustomModel(model))
    : null;
  const safeReasoning = typeof reasoning === 'string' && Array.isArray(def.reasoningOptions)
    ? def.reasoningOptions.find((option: { id?: string }) => option?.id === reasoning)?.id ?? null
    : null;
  return {
    ...(safeModel ? { model: safeModel } : {}),
    ...(safeReasoning ? { reasoning: safeReasoning } : {}),
  };
}

async function runOfflineStudioAgentProcess(input: {
  command: string;
  def: any;
  configuredEnv: Record<string, string>;
  project: Project;
  projectDir: string;
  dataDir: string;
  prompt: string;
  model?: string;
  reasoning?: string;
}): Promise<{ status: string; summary?: string }> {
  if (input.def.streamFormat === 'acp-json-rpc' || input.def.streamFormat === 'pi-rpc') {
    return {
      status: 'failed',
      summary: `Offline scheduler direct execution does not support ${input.def.streamFormat} adapters; run the daemon-local loop for this agent.`,
    };
  }

  const agentOptions = agentOptionsForOfflineScheduler(input.def, input.model, input.reasoning);
  const args = input.def.buildArgs(
    input.prompt,
    [],
    [],
    agentOptions,
    { cwd: input.projectDir },
  );
  const baseEnv: NodeJS.ProcessEnv = {
    ...process.env,
    AGDS_OFFLINE_SCHEDULER: '1',
    AGDS_DATA_DIR: input.dataDir,
    AGDS_PROJECT_ID: input.project.id,
    AGDS_PROJECT_DIR: input.projectDir,
    AGDS_NODE_BIN: process.execPath,
  };
  const cliPath = process.env.AGDS_BIN || process.argv[1];
  if (cliPath) {
    baseEnv.AGDS_BIN = cliPath;
  }
  const env = spawnEnvForAgent(input.def.id, baseEnv, input.configuredEnv);
  const invocation = createCommandInvocation({
    command: input.command,
    args,
    env,
  });
  const stdinMode = input.def.promptViaStdin ? 'pipe' : 'ignore';

  return new Promise((resolve) => {
    const child = spawn(invocation.command, invocation.args, {
      cwd: input.projectDir,
      env,
      shell: false,
      stdio: [stdinMode, 'pipe', 'pipe'],
      windowsVerbatimArguments: invocation.windowsVerbatimArguments,
    });
    let stdout = '';
    let stderr = '';
    const appendOutput = (target: 'stdout' | 'stderr', chunk: Buffer | string) => {
      const text = chunk.toString();
      if (target === 'stdout') {
        stdout = `${stdout}${text}`.slice(-2_000);
      } else {
        stderr = `${stderr}${text}`.slice(-2_000);
      }
    };
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      setTimeout(() => {
        if (!child.killed) child.kill('SIGKILL');
      }, 2_000).unref?.();
      resolve({
        status: 'timed_out',
        summary: `Offline scheduler child-agent execution timed out after ${Math.round(OFFLINE_STUDIO_AGENT_TIMEOUT_MS / 1000)} seconds.`,
      });
    }, OFFLINE_STUDIO_AGENT_TIMEOUT_MS);
    timer.unref?.();

    child.stdout?.on('data', (chunk) => appendOutput('stdout', chunk));
    child.stderr?.on('data', (chunk) => appendOutput('stderr', chunk));
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ status: 'failed', summary: `Offline scheduler spawn failed: ${error.message}` });
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (code === 0) {
        const summary = stdout.trim().split(/\n/).filter(Boolean).slice(-1)[0];
        resolve({
          status: 'succeeded',
          ...(summary ? { summary: summary.slice(0, 240) } : {}),
        });
        return;
      }
      const detail = stderr.trim() || stdout.trim() || (signal ? `signal ${signal}` : `exit code ${code ?? 'unknown'}`);
      resolve({
        status: 'failed',
        summary: `Offline scheduler child-agent execution failed: ${detail.slice(0, 240)}`,
      });
    });

    if (input.def.promptViaStdin && child.stdin) {
      child.stdin.on('error', () => {});
      child.stdin.end(input.prompt, 'utf8');
    }
  });
}

async function executeStudioOrchestrationForOfflineScheduler(input: {
  project: Project;
  projectDir: string;
  dataDir: string;
  orchestration: GameStudioOrchestrationResponse;
  config: Awaited<ReturnType<typeof readGameStudioOrchestrationLoopConfig>>;
  now: number;
}): Promise<
  | {
      ok: true;
      adapterAgentId: string;
      executions: GameStudioAgentExecution[];
      reconciliation: GameStudioOrchestrationReconciliation;
      summary: string;
    }
  | { ok: false; reason: string }
> {
  const appConfig: AppConfigPrefs = await readAppConfig(input.dataDir).catch(() => ({}));
  const request = studioOrchestrationExecutionRequestFromConfig(input.config);
  const adapterAgentId = request.agentId || appConfig.agentId || undefined;
  if (!adapterAgentId) {
    return { ok: false, reason: 'No offline execution agent is configured for studio-orchestration autoExecute.' };
  }
  const def = getAgentDef(adapterAgentId);
  if (!def) return { ok: false, reason: `unknown execution agent: ${adapterAgentId}` };

  const configuredEnv = agentCliEnvForAgent(appConfig.agentCliEnv, adapterAgentId);
  const command = resolveAgentBin(adapterAgentId, configuredEnv);
  if (!command) {
    return {
      ok: false,
      reason: `Agent "${def.name ?? adapterAgentId}" is not installed or not on PATH for offline scheduler execution.`,
    };
  }

  const selectedIds = new Set(request.workOrderIds);
  const selectedWorkOrders = input.orchestration.workOrders
    .filter((order) => selectedIds.size === 0 || selectedIds.has(order.id))
    .slice(0, request.maxExecutions);
  if (selectedWorkOrders.length === 0) {
    return { ok: false, reason: 'no matching studio-agent work orders selected for offline execution' };
  }

  const executions: GameStudioAgentExecution[] = [];
  for (const [index, workOrder] of selectedWorkOrders.entries()) {
    const prompt = buildGameStudioWorkOrderPrompt({
      orchestration: input.orchestration,
      workOrder,
    });
    const result = await runOfflineStudioAgentProcess({
      command,
      def,
      configuredEnv,
      project: input.project,
      projectDir: input.projectDir,
      dataDir: input.dataDir,
      prompt,
      ...(request.model ? { model: request.model } : {}),
      ...(request.reasoning ? { reasoning: request.reasoning } : {}),
    });
    executions.push({
      workOrderId: workOrder.id,
      studioAgentId: workOrder.agentId,
      roleTitle: workOrder.roleTitle,
      priority: workOrder.priority,
      title: workOrder.title,
      adapterAgentId,
      runId: schedulerRunId(input.project.id, workOrder.id, input.now, index),
      status: result.status,
    });
  }

  const reconciliation = reconcileGameStudioOrchestrationExecutions(input.orchestration, executions);
  return {
    ok: true,
    adapterAgentId,
    executions,
    reconciliation,
    summary: `Ran ${executions.length} offline scheduler child-agent studio execution run${executions.length === 1 ? '' : 's'} through ${adapterAgentId}. ${reconciliation.summary}`,
  };
}

async function runWorldSimulationSchedulerTask(input: {
  project: Project;
  projectsRoot: string;
  projectDir: string;
  force: boolean;
  now: number;
  db: ReturnType<typeof openDatabase>;
}): Promise<StudioSchedulerTaskResult> {
  const config = await readGameWorldSimulationLoopConfig(input.projectDir);
  const due = shouldRunLoop(config, input.force, input.now);
  if (!due.run) {
    return {
      task: 'world-simulation',
      status: 'skipped',
      projectId: input.project.id,
      reason: due.reason,
      ...(config.nextRunAt ? { nextRunAt: config.nextRunAt } : {}),
    };
  }

  const request = worldSimulationRequestFromLoopConfig(config);
  const resolved = await resolveGameViewportForScheduler(
    input.projectsRoot,
    input.project,
    request,
    'no .gameview.json viewport document found for external world simulation scheduling',
  );
  if (!resolved.ok) {
    return {
      task: 'world-simulation',
      status: 'error',
      projectId: input.project.id,
      reason: resolved.reason,
    };
  }

  const simulation = simulateGameViewportWorld(
    resolved.file.name,
    resolved.file.buffer.toString('utf8'),
    request,
  );
  const nextConfig = completeGameWorldSimulationLoopRun(config, simulation, input.now);
  await writeGameWorldSimulationLoopConfig(input.projectDir, nextConfig);
  updateProject(input.db, input.project.id, {});
  return {
    task: 'world-simulation',
    status: 'run',
    projectId: input.project.id,
    fileName: simulation.fileName,
    summary: simulation.summary,
    eventCount: simulation.events.length,
    findingCount: simulation.findings.length,
    ...(nextConfig.lastRunAt ? { lastRunAt: nextConfig.lastRunAt } : {}),
    ...(nextConfig.nextRunAt ? { nextRunAt: nextConfig.nextRunAt } : {}),
  };
}

async function runAutonomousIterationSchedulerTask(input: {
  project: Project;
  projectsRoot: string;
  projectDir: string;
  force: boolean;
  now: number;
  db: ReturnType<typeof openDatabase>;
}): Promise<StudioSchedulerTaskResult> {
  const config = await readGameAutonomousIterationLoopConfig(input.projectDir);
  const due = shouldRunLoop(config, input.force, input.now);
  if (!due.run) {
    return {
      task: 'autonomous-iteration',
      status: 'skipped',
      projectId: input.project.id,
      reason: due.reason,
      ...(config.nextRunAt ? { nextRunAt: config.nextRunAt } : {}),
    };
  }

  const request = loopRequestFromConfig(config);
  const telemetryEvents = request.includeTelemetry ? await readGameTelemetryEvents(input.projectDir, 1000) : [];
  const telemetry = request.includeTelemetry ? buildGameTelemetryInsights(telemetryEvents) : undefined;
  const resolved = await findOptionalGameViewportForScheduler(input.projectsRoot, input.project, request);
  if (!resolved.ok) {
    return {
      task: 'autonomous-iteration',
      status: 'error',
      projectId: input.project.id,
      reason: resolved.reason,
    };
  }

  let playtest;
  let world;
  if (resolved.file) {
    const content = resolved.file.buffer.toString('utf8');
    if (request.includePlaytest) {
      playtest = simulateGameViewportPlaytest(resolved.file.name, content, {
        runs: 5,
        ...(request.focus ? { focus: request.focus } : {}),
        ...(request.personas.length > 0 ? { personas: request.personas } : {}),
      });
    }
    if (request.includeWorldSimulation) {
      world = simulateGameViewportWorld(resolved.file.name, content, {
        ticks: 6,
        ...(request.focus ? { scenario: request.focus } : {}),
      });
    }
  }

  const iteration = buildGameAutonomousIteration({
    request,
    ...(resolved.file ? { fileName: resolved.file.name } : {}),
    ...(telemetry ? { telemetry } : {}),
    ...(playtest ? { playtest } : {}),
    ...(world ? { world } : {}),
    generatedAt: input.now,
  });
  const nextConfig = completeGameAutonomousIterationLoopRun(config, iteration, input.now);
  await writeGameAutonomousIterationLoopConfig(input.projectDir, nextConfig);
  updateProject(input.db, input.project.id, {});
  return {
    task: 'autonomous-iteration',
    status: 'run',
    projectId: input.project.id,
    summary: iteration.summary,
    actionCount: iteration.actions.length,
    ...(iteration.fileName ? { fileName: iteration.fileName } : {}),
    ...(nextConfig.lastRunAt ? { lastRunAt: nextConfig.lastRunAt } : {}),
    ...(nextConfig.nextRunAt ? { nextRunAt: nextConfig.nextRunAt } : {}),
  };
}

async function runGameBalanceSchedulerTask(input: {
  project: Project;
  projectsRoot: string;
  projectDir: string;
  force: boolean;
  now: number;
  db: ReturnType<typeof openDatabase>;
}): Promise<StudioSchedulerTaskResult> {
  const config = await readGameBalanceLoopConfig(input.projectDir);
  const due = shouldRunLoop(config, input.force, input.now);
  if (!due.run) {
    return {
      task: 'balance-loop',
      status: 'skipped',
      projectId: input.project.id,
      reason: due.reason,
      ...(config.nextRunAt ? { nextRunAt: config.nextRunAt } : {}),
    };
  }

  const request = balanceLoopRequestFromConfig(config);
  const telemetryEvents = request.includeTelemetry ? await readGameTelemetryEvents(input.projectDir, 1000) : [];
  const telemetry = request.includeTelemetry ? buildGameTelemetryInsights(telemetryEvents) : undefined;
  const resolvedViewport = await findOptionalGameViewportForScheduler(input.projectsRoot, input.project, request);
  if (!resolvedViewport.ok) {
    return {
      task: 'balance-loop',
      status: 'error',
      projectId: input.project.id,
      reason: resolvedViewport.reason,
    };
  }
  const resolvedSystem = await findOptionalGameSystemForScheduler(input.projectsRoot, input.project, request);
  if (!resolvedSystem.ok) {
    return {
      task: 'balance-loop',
      status: 'error',
      projectId: input.project.id,
      reason: resolvedSystem.reason,
    };
  }

  let playtest;
  if (request.includePlaytest && resolvedViewport.file) {
    playtest = simulateGameViewportPlaytest(resolvedViewport.file.name, resolvedViewport.file.buffer.toString('utf8'), {
      runs: 5,
      ...(request.focus ? { focus: request.focus } : {}),
    });
  }
  let systemDocument: GameSystemSpecDocument | undefined;
  try {
    systemDocument = parseGameSystemForScheduler(resolvedSystem.file);
  } catch (error) {
    return {
      task: 'balance-loop',
      status: 'error',
      projectId: input.project.id,
      reason: `could not parse game-system document for balance loop: ${(error as Error)?.message || error}`,
    };
  }
  const balance = buildGameBalanceLoop({
    request,
    ...(resolvedViewport.file ? { fileName: resolvedViewport.file.name } : {}),
    ...(resolvedSystem.file ? { systemFileName: resolvedSystem.file.name } : {}),
    ...(systemDocument ? { systemDocument } : {}),
    ...(telemetry ? { telemetry } : {}),
    ...(playtest ? { playtest } : {}),
    generatedAt: input.now,
  });

  if (request.apply && resolvedSystem.file && systemDocument) {
    const applied = applyGameBalanceAdjustmentsToSystemDocument(systemDocument, balance.adjustments);
    if (applied.appliedCount > 0) {
      await writeProjectFile(
        input.projectsRoot,
        input.project.id,
        resolvedSystem.file.name,
        Buffer.from(`${JSON.stringify(applied.document, null, 2)}\n`, 'utf8'),
        {},
        input.project.metadata,
      );
    }
  }

  const nextConfig = completeGameBalanceLoopRun(config, balance, input.now);
  await writeGameBalanceLoopConfig(input.projectDir, nextConfig);
  updateProject(input.db, input.project.id, {});
  return {
    task: 'balance-loop',
    status: 'run',
    projectId: input.project.id,
    summary: balance.summary,
    adjustmentCount: balance.adjustments.length,
    appliedCount: balance.appliedCount,
    ...(balance.fileName ? { fileName: balance.fileName } : {}),
    ...(nextConfig.lastRunAt ? { lastRunAt: nextConfig.lastRunAt } : {}),
    ...(nextConfig.nextRunAt ? { nextRunAt: nextConfig.nextRunAt } : {}),
  };
}

async function runStudioOrchestrationSchedulerTask(input: {
  project: Project;
  projectsRoot: string;
  projectDir: string;
  force: boolean;
  now: number;
  db: ReturnType<typeof openDatabase>;
}): Promise<StudioSchedulerTaskResult> {
  const config = await readGameStudioOrchestrationLoopConfig(input.projectDir);
  const due = shouldRunLoop(config, input.force, input.now);
  if (!due.run) {
    return {
      task: 'studio-orchestration',
      status: 'skipped',
      projectId: input.project.id,
      reason: due.reason,
      ...(config.nextRunAt ? { nextRunAt: config.nextRunAt } : {}),
    };
  }

  const request = studioOrchestrationRequestFromConfig(config);
  const files = await listFiles(input.projectsRoot, input.project.id, { metadata: input.project.metadata });
  const orchestration = buildGameStudioOrchestration({
    request,
    files: files.map((file) => ({ name: file.path || file.name, kind: file.kind })),
    generatedAt: input.now,
  });
  const execution = config.autoExecute
    ? await executeStudioOrchestrationForOfflineScheduler({
        project: input.project,
        projectDir: input.projectDir,
        dataDir: path.dirname(input.projectsRoot),
        orchestration,
        config,
        now: input.now,
      })
    : null;
  if (execution && !execution.ok) {
    return {
      task: 'studio-orchestration',
      status: 'error',
      projectId: input.project.id,
      reason: execution.reason,
    };
  }
  const nextConfig = completeGameStudioOrchestrationLoopRun(
    config,
    orchestration,
    input.now,
    execution
      ? { executions: execution.executions, reconciliation: execution.reconciliation }
      : undefined,
  );
  await writeGameStudioOrchestrationLoopConfig(input.projectDir, nextConfig);
  updateProject(input.db, input.project.id, {});
  const hasExecutionFailure = Boolean(execution?.executions.some((item) => item.status !== 'succeeded'));
  return {
    task: 'studio-orchestration',
    status: hasExecutionFailure ? 'error' : 'run',
    projectId: input.project.id,
    summary: execution ? `${orchestration.summary} ${execution.summary}` : orchestration.summary,
    workOrderCount: orchestration.workOrders.length,
    handoffCount: orchestration.handoffs.length,
    ...(execution ? { executionCount: execution.executions.length } : {}),
    ...(execution ? { runIds: execution.executions.map((item) => item.runId) } : {}),
    ...(execution ? { reconciliationSummary: execution.reconciliation.summary } : {}),
    ...(nextConfig.lastRunAt ? { lastRunAt: nextConfig.lastRunAt } : {}),
    ...(nextConfig.nextRunAt ? { nextRunAt: nextConfig.nextRunAt } : {}),
  };
}

export async function runStudioSchedulerOnce(input: StudioSchedulerRunInput): Promise<StudioSchedulerRunResult> {
  const projectRoot = input.projectRoot ?? resolveStudioSchedulerProjectRoot();
  const dataDir = resolveStudioSchedulerDataDir({
    projectRoot,
    ...(input.dataDir ? { dataDir: input.dataDir } : {}),
  });
  const projectsRoot = path.join(dataDir, 'projects');
  const now = input.now ?? Date.now();
  const tasks = normalizeStudioSchedulerTasks(input.tasks);
  await mkdir(projectsRoot, { recursive: true });

  const db = openDatabase(projectRoot, { dataDir });
  const project = getProject(db, input.projectId) as Project | null;
  if (!project) {
    throw new Error(`project not found: ${input.projectId}`);
  }

  const projectDir = resolveProjectDir(projectsRoot, project.id, project.metadata);
  const results: StudioSchedulerTaskResult[] = [];
  for (const task of tasks) {
    if (task === 'world-simulation') {
      results.push(await runWorldSimulationSchedulerTask({
        project,
        projectsRoot,
        projectDir,
        force: Boolean(input.force),
        now,
        db,
      }));
    } else if (task === 'autonomous-iteration') {
      results.push(await runAutonomousIterationSchedulerTask({
        project,
        projectsRoot,
        projectDir,
        force: Boolean(input.force),
        now,
        db,
      }));
    } else if (task === 'balance-loop') {
      results.push(await runGameBalanceSchedulerTask({
        project,
        projectsRoot,
        projectDir,
        force: Boolean(input.force),
        now,
        db,
      }));
    } else {
      results.push(await runStudioOrchestrationSchedulerTask({
        project,
        projectsRoot,
        projectDir,
        force: Boolean(input.force),
        now,
        db,
      }));
    }
  }

  return {
    projectId: project.id,
    dataDir,
    generatedAt: now,
    results,
  };
}
