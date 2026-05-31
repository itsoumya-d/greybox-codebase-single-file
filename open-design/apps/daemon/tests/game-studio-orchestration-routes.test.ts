import http from 'node:http';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path, { delimiter } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

type StartedServer = { server: http.Server; url: string };
type ProjectEvent = { event: string; data: any };

let server: http.Server | undefined;
let baseUrl = '';
const projectIds: string[] = [];

const projectRoot = path.resolve(import.meta.dirname, '../../..');
const serverRuntimeDataRoot = process.env.AGDS_DATA_DIR
  ? path.resolve(projectRoot, process.env.AGDS_DATA_DIR)
  : path.join(projectRoot, '.agds');

beforeEach(async () => {
  const started = (await startServer({ port: 0, returnServer: true })) as StartedServer;
  server = started.server;
  baseUrl = started.url;
});

afterEach(async () => {
  await new Promise((resolve, reject) => {
    if (!server) return resolve(undefined);
    server.close((error?: Error) => (error ? reject(error) : resolve(undefined)));
  });
  server = undefined;
  const ids = projectIds.splice(0);
  await Promise.all(
    ids.map((projectId) =>
      rm(path.join(serverRuntimeDataRoot, 'projects', projectId), { recursive: true, force: true }),
    ),
  );
});

function uniqueProjectId(): string {
  const id = `studio-orchestration-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  projectIds.push(id);
  return id;
}

async function createProject(projectId: string) {
  const response = await fetch(`${baseUrl}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: projectId, name: 'Studio orchestration lab' }),
  });
  expect(response.status).toBe(200);
}

async function writeProjectFixture(projectId: string) {
  const dir = path.join(serverRuntimeDataRoot, 'projects', projectId);
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, 'orchestration-arena.gameview.json'),
    JSON.stringify({
      version: 1,
      kind: 'game-viewport',
      surface: 'gameplay',
      title: 'Orchestration Arena',
      entities: [
        { id: 'spawn', name: 'Player spawn', type: 'player-spawn', x: 80, y: 180 },
        { id: 'boss', name: 'Phase boss', type: 'enemy-spawn', x: 480, y: 260 },
      ],
      paths: [{ id: 'route', name: 'Critical path', type: 'objective', points: [{ x: 80, y: 180 }, { x: 480, y: 260 }] }],
    }, null, 2),
    'utf8',
  );
  await writeFile(
    path.join(dir, 'combat.systems.json'),
    JSON.stringify({
      version: 1,
      kind: 'game-system',
      systemType: 'combat',
      title: 'Combat System',
      tuning: { enemyTelegraphMs: 360, incomingDamageMultiplier: 1 },
    }, null, 2),
    'utf8',
  );
  await writeFile(
    path.join(dir, 'gameplay-logic.nodegraph.json'),
    JSON.stringify({
      version: 1,
      kind: 'node-graph',
      graphType: 'gameplay-logic',
      title: 'Gameplay Logic',
      nodes: [
        { id: 'start', title: 'Start encounter', category: 'event', x: 40, y: 80 },
        { id: 'reward', title: 'Drop reward', category: 'reward', x: 260, y: 80 },
      ],
      edges: [{ id: 'edge', from: 'start', to: 'reward', label: 'complete' }],
    }, null, 2),
    'utf8',
  );
}

async function openProjectEvents(projectId: string) {
  const response = await fetch(`${baseUrl}/api/projects/${encodeURIComponent(projectId)}/events`, {
    headers: { Accept: 'text/event-stream' },
  });
  if (!response.ok || !response.body) {
    throw new Error(`failed to open project event stream: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const events: ProjectEvent[] = [];
  const pump = (async () => {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary = buffer.indexOf('\n\n');
      while (boundary >= 0) {
        const raw = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf('\n\n');
        if (!raw.trim() || raw.startsWith(':')) continue;
        const event: ProjectEvent = { event: 'message', data: '' };
        for (const line of raw.split('\n')) {
          if (line.startsWith('event: ')) event.event = line.slice(7);
          if (line.startsWith('data: ')) event.data += line.slice(6);
        }
        event.data = event.data ? JSON.parse(event.data) : null;
        events.push(event);
      }
    }
  })();

  return {
    async waitFor(predicate: (event: ProjectEvent) => boolean) {
      const deadline = Date.now() + 3_000;
      while (Date.now() < deadline) {
        const match = events.find(predicate);
        if (match) return match;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      throw new Error(`timed out waiting for project event; seen=${JSON.stringify(events)}`);
    },
    async close() {
      await reader.cancel().catch(() => {});
      await pump.catch(() => {});
    },
  };
}

async function withFakeAgent<T>(
  binName: string,
  script: string,
  run: () => Promise<T>,
): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), 'agds-studio-orchestration-bin-'));
  const oldPath = process.env.PATH;
  try {
    if (process.platform === 'win32') {
      const runner = path.join(dir, `${binName}-test-runner.cjs`);
      await writeFile(runner, script, 'utf8');
      await writeFile(
        path.join(dir, `${binName}.cmd`),
        `@echo off\r\nnode "${runner}" %*\r\n`,
        'utf8',
      );
    } else {
      const bin = path.join(dir, binName);
      await writeFile(bin, `#!/usr/bin/env node\n${script}`, 'utf8');
      await chmod(bin, 0o755);
    }
    process.env.PATH = `${dir}${delimiter}${oldPath ?? ''}`;
    return await run();
  } finally {
    process.env.PATH = oldPath;
    await rm(dir, { recursive: true, force: true });
  }
}

describe('studio orchestration routes', () => {
  it('plans real studio-agent work orders, handoffs, and debate checkpoints from project artifacts', async () => {
    const projectId = uniqueProjectId();
    await createProject(projectId);
    await writeProjectFixture(projectId);
    const stream = await openProjectEvents(projectId);

    try {
      const response = await fetch(`${baseUrl}/api/projects/${projectId}/studio-orchestration`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          focus: 'boss combat with narrative readability',
          maxWorkOrders: 8,
          includeDebates: true,
        }),
      });

      expect(response.status).toBe(200);
      const body = (await response.json()) as any;
      expect(body.workOrders.map((order: { agentId: string }) => order.agentId)).toEqual(
        expect.arrayContaining(['game-director', 'gameplay-mechanics', 'level-design', 'game-ui-hud']),
      );
      expect(body.handoffs.map((handoff: { id: string }) => handoff.id)).toEqual(
        expect.arrayContaining(['gameplay-to-hud-readability']),
      );
      expect(body.debates.map((debate: { id: string }) => debate.id)).toEqual(
        expect.arrayContaining(['mechanic-readability-feasibility']),
      );
      expect(body.fileSignals.map((file: { name: string }) => file.name)).toEqual(
        expect.arrayContaining(['orchestration-arena.gameview.json', 'combat.systems.json']),
      );

      const event = await stream.waitFor((entry) => entry.event === 'game_studio_orchestration');
      expect(event.data).toMatchObject({
        type: 'game_studio_orchestration',
        action: 'planned',
        projectId,
        workOrderCount: body.workOrders.length,
        handoffCount: body.handoffs.length,
      });
    } finally {
      await stream.close();
    }
  });

  it('configures and runs a scheduled studio-agent orchestration loop', async () => {
    const projectId = uniqueProjectId();
    await createProject(projectId);
    await writeProjectFixture(projectId);

    const configure = await fetch(`${baseUrl}/api/projects/${projectId}/studio-orchestration/loop`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enabled: true,
        intervalMinutes: 15,
        focus: 'scheduled multidisciplinary review',
        maxWorkOrders: 6,
        includeDebates: true,
        targetFiles: ['orchestration-arena.gameview.json', 'combat.systems.json'],
      }),
    });
    expect(configure.status).toBe(200);
    const configured = (await configure.json()) as any;
    expect(configured.config).toMatchObject({
      enabled: true,
      intervalMinutes: 15,
      maxWorkOrders: 6,
      nextRunAt: expect.any(Number),
    });

    const run = await fetch(`${baseUrl}/api/projects/${projectId}/studio-orchestration/loop/run`, {
      method: 'POST',
    });
    expect(run.status).toBe(200);
    const body = (await run.json()) as any;
    expect(body.projectId).toBe(projectId);
    expect(body.orchestration.workOrders.length).toBeGreaterThan(0);
    expect(body.orchestration.handoffs.length).toBeGreaterThan(0);
    expect(body.config).toMatchObject({
      enabled: true,
      lastRunAt: expect.any(Number),
      lastWorkOrderCount: body.orchestration.workOrders.length,
      lastHandoffCount: body.orchestration.handoffs.length,
      nextRunAt: expect.any(Number),
    });
    expect(body.config.nextRunAt).toBeGreaterThan(body.config.lastRunAt);
  });

  it('auto-executes and reconciles scheduled studio-agent orchestration loops', async () => {
    const projectId = uniqueProjectId();
    await createProject(projectId);
    await writeProjectFixture(projectId);
    const stream = await openProjectEvents(projectId);
    const captureDir = await mkdtemp(path.join(tmpdir(), 'agds-studio-orchestration-loop-capture-'));
    const captureFile = path.join(captureDir, 'prompts.txt');
    const previousCapture = process.env.AGDS_STUDIO_CAPTURE_PROMPTS;

    try {
      process.env.AGDS_STUDIO_CAPTURE_PROMPTS = captureFile;
      await withFakeAgent(
        'opencode-cli',
        `
const fs = require('fs');
let prompt = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { prompt += chunk; });
process.stdin.on('end', () => {
  fs.appendFileSync(process.env.AGDS_STUDIO_CAPTURE_PROMPTS, prompt + '\\n---AGDS-LOOP-RUN---\\n');
  console.log(JSON.stringify({ type: 'step_start' }));
  console.log(JSON.stringify({ type: 'text', part: { text: 'scheduled studio work order executed' } }));
});
`,
        async () => {
          const configure = await fetch(`${baseUrl}/api/projects/${projectId}/studio-orchestration/loop`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              enabled: true,
              intervalMinutes: 15,
              focus: 'scheduled auto-executed multidisciplinary review',
              maxWorkOrders: 8,
              includeDebates: true,
              targetFiles: ['orchestration-arena.gameview.json', 'combat.systems.json'],
              autoExecute: true,
              agentId: 'opencode',
              maxExecutions: 2,
              waitForCompletion: true,
            }),
          });
          expect(configure.status).toBe(200);

          const run = await fetch(`${baseUrl}/api/projects/${projectId}/studio-orchestration/loop/run`, {
            method: 'POST',
          });
          expect(run.status).toBe(200);
          const body = (await run.json()) as any;
          expect(body.projectId).toBe(projectId);
          expect(body.executions).toHaveLength(2);
          expect(body.executions.map((execution: { status: string }) => execution.status)).toEqual([
            'succeeded',
            'succeeded',
          ]);
          expect(body.reconciliation).toMatchObject({
            executionCount: 2,
            resolvedDependencyCount: expect.any(Number),
            executedWorkOrderIds: body.executions.map((execution: { workOrderId: string }) => execution.workOrderId),
          });
          expect(body.reconciliation.summary).toContain('Reconciled 2 child-agent execution runs');
          expect(body.config).toMatchObject({
            enabled: true,
            autoExecute: true,
            lastExecutionCount: 2,
            lastRunIds: body.executions.map((execution: { runId: string }) => execution.runId),
            lastExecutedWorkOrderIds: body.executions.map((execution: { workOrderId: string }) => execution.workOrderId),
            lastReconciliationSummary: body.reconciliation.summary,
          });

          const executionEvent = await stream.waitFor((entry) => entry.event === 'game_studio_orchestration_execution');
          expect(executionEvent.data).toMatchObject({
            type: 'game_studio_orchestration_execution',
            action: 'started',
            projectId,
            adapterAgentId: 'opencode',
            executionCount: 2,
            runIds: body.executions.map((execution: { runId: string }) => execution.runId),
            reconciliationSummary: body.reconciliation.summary,
          });
          const loopEvent = await stream.waitFor((entry) =>
            entry.event === 'game_studio_orchestration_loop' && entry.data?.action === 'run',
          );
          expect(loopEvent.data).toMatchObject({
            type: 'game_studio_orchestration_loop',
            action: 'run',
            projectId,
            executionCount: 2,
            reconciliationSummary: body.reconciliation.summary,
          });
        },
      );

      const capturedPrompt = await readFile(captureFile, 'utf8');
      expect(capturedPrompt).toContain('Execute this AI Game Design Studio work order as the Game Director.');
      expect(capturedPrompt).toContain('Relevant debate checkpoints:');
    } finally {
      process.env.AGDS_STUDIO_CAPTURE_PROMPTS = previousCapture;
      await stream.close();
      await rm(captureDir, { recursive: true, force: true });
    }
  });

  it('executes selected studio-agent work orders as real child-agent runs', async () => {
    const projectId = uniqueProjectId();
    await createProject(projectId);
    await writeProjectFixture(projectId);
    const stream = await openProjectEvents(projectId);
    const captureDir = await mkdtemp(path.join(tmpdir(), 'agds-studio-orchestration-capture-'));
    const captureFile = path.join(captureDir, 'prompts.txt');
    const previousCapture = process.env.AGDS_STUDIO_CAPTURE_PROMPTS;

    try {
      process.env.AGDS_STUDIO_CAPTURE_PROMPTS = captureFile;
      await withFakeAgent(
        'opencode-cli',
        `
const fs = require('fs');
let prompt = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { prompt += chunk; });
process.stdin.on('end', () => {
  fs.appendFileSync(process.env.AGDS_STUDIO_CAPTURE_PROMPTS, prompt + '\\n---AGDS-RUN---\\n');
  console.log(JSON.stringify({ type: 'step_start' }));
  console.log(JSON.stringify({ type: 'text', part: { text: 'studio work order executed' } }));
});
`,
        async () => {
          const response = await fetch(`${baseUrl}/api/projects/${projectId}/studio-orchestration/execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              agentId: 'opencode',
              focus: 'boss combat with narrative readability',
              maxWorkOrders: 8,
              maxExecutions: 2,
              waitForCompletion: true,
            }),
          });

          expect(response.status).toBe(202);
          const body = (await response.json()) as any;
          expect(body.projectId).toBe(projectId);
          expect(body.executions).toHaveLength(2);
          expect(body.executions.map((execution: { status: string }) => execution.status)).toEqual([
            'succeeded',
            'succeeded',
          ]);
          expect(body.executions.map((execution: { studioAgentId: string }) => execution.studioAgentId)).toEqual(
            expect.arrayContaining(['game-director', 'gameplay-mechanics']),
          );

          const event = await stream.waitFor((entry) => entry.event === 'game_studio_orchestration_execution');
          expect(event.data).toMatchObject({
            type: 'game_studio_orchestration_execution',
            action: 'started',
            projectId,
            adapterAgentId: 'opencode',
            executionCount: 2,
            runIds: body.executions.map((execution: { runId: string }) => execution.runId),
          });
        },
      );

      const capturedPrompt = await readFile(captureFile, 'utf8');
      expect(capturedPrompt).toContain('Execute this AI Game Design Studio work order as the Game Director.');
      expect(capturedPrompt).toContain('Execute this AI Game Design Studio work order as the Gameplay Mechanics Designer.');
      expect(capturedPrompt).toContain('Relevant studio handoffs:');
      expect(capturedPrompt).toContain('Project file signals:');
    } finally {
      await stream.close();
      if (previousCapture == null) {
        delete process.env.AGDS_STUDIO_CAPTURE_PROMPTS;
      } else {
        process.env.AGDS_STUDIO_CAPTURE_PROMPTS = previousCapture;
      }
      await rm(captureDir, { recursive: true, force: true });
    }
  });
});
