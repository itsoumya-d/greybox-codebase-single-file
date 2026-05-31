import http from 'node:http';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

type StartedServer = { server: http.Server; url: string };
type ProjectEvent = { event: string; data: any };

let server: http.Server | undefined;
let baseUrl = '';
const projectIds: string[] = [];

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '../../..');
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
  const id = `game-auto-iteration-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  projectIds.push(id);
  return id;
}

async function createProject(projectId: string) {
  const response = await fetch(`${baseUrl}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: projectId, name: 'Autonomous iteration lab' }),
  });
  expect(response.status).toBe(200);
}

async function writeGameViewport(projectId: string, fileName: string, document: unknown) {
  const dir = path.join(serverRuntimeDataRoot, 'projects', projectId);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, fileName), JSON.stringify(document, null, 2), 'utf8');
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

describe('game autonomous iteration routes', () => {
  it('synthesizes telemetry, playtest, and world-simulation findings into a prioritized studio backlog', async () => {
    const projectId = uniqueProjectId();
    await createProject(projectId);
    await writeGameViewport(projectId, 'iteration-arena.gameview.json', {
      version: 1,
      kind: 'game-viewport',
      surface: 'gameplay',
      title: 'Iteration Arena',
      entities: [
        { id: 'spawn', name: 'Player spawn', type: 'player-spawn', x: 80, y: 180 },
        { id: 'enemy-a', name: 'Shield squad', type: 'enemy-spawn', x: 380, y: 220 },
        { id: 'enemy-b', name: 'Sniper squad', type: 'enemy-spawn', x: 540, y: 260 },
        { id: 'faction-a', name: 'Ash Pact', type: 'faction', x: 430, y: 190, faction: 'Ash Pact' },
        { id: 'ore-node', name: 'Moon ore cache', type: 'resource-node', x: 560, y: 320 },
        { id: 'hazard-a', name: 'Volatile vent', type: 'hazard', x: 480, y: 300 },
      ],
      paths: [{ id: 'short-path', name: 'Short path', type: 'objective', points: [{ x: 80, y: 180 }] }],
      dynamicEvents: [
        {
          id: 'ash-raid',
          name: 'Ash Pact raid',
          trigger: 'Timer reaches two minutes.',
          impact: 'War pressure blocks the ore route and forces combat under hazard pressure.',
        },
      ],
      worldSimulation: {
        ecosystem: 'Vent heat pushes wildlife toward the player route.',
        factionTerritory: ['Ash Pact arena edge', 'neutral ore cache'],
        weather: 'Ash storm lowers visibility near sniper lanes.',
      },
    });

    const telemetry = await fetch(`${baseUrl}/api/projects/${projectId}/game-telemetry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        events: [
          { type: 'level_start', sessionId: 'session-c', sceneId: 'iteration-arena' },
          { type: 'death', sessionId: 'session-c', sceneId: 'iteration-arena', position: { x: 500, y: 300 } },
          { type: 'frustration_signal', sessionId: 'session-c', sceneId: 'iteration-arena', position: { x: 510, y: 310 } },
          { type: 'combat_event', sessionId: 'session-c', sceneId: 'iteration-arena', payload: { readable: false } },
        ],
      }),
    });
    expect(telemetry.status).toBe(200);
    const stream = await openProjectEvents(projectId);

    try {
      const response = await fetch(`${baseUrl}/api/projects/${projectId}/autonomous-iteration`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: 'iteration-arena.gameview.json',
          focus: 'combat readability',
          maxActions: 20,
          personas: ['casual', 'completionist', 'rage-quitter'],
        }),
      });

      expect(response.status).toBe(200);
      const body = (await response.json()) as any;
      expect(body.fileName).toBe('iteration-arena.gameview.json');
      expect(body.focus).toBe('combat readability');
      expect(body.actions.length).toBeGreaterThan(2);
      expect(body.actions[0].priority).toBe('p0');
      expect(body.actions.map((action: { source: string }) => action.source)).toEqual(
        expect.arrayContaining(['telemetry', 'playtest-simulation', 'world-simulation']),
      );
      expect(body.actions.map((action: { id: string }) => action.id)).toEqual(
        expect.arrayContaining(['playtest-persona-rage-quitter']),
      );
      expect(body.summary).toContain('3 persona reports');
      expect(body.actions.map((action: { owner: string }) => action.owner)).toEqual(
        expect.arrayContaining(['gameplay-mechanics', 'level-design']),
      );
      expect(body.sources).toMatchObject({
        telemetryInsights: expect.any(Number),
        playtestFindings: expect.any(Number),
        personaReports: 3,
        worldFindings: expect.any(Number),
      });
      expect(body.sources.telemetryInsights).toBeGreaterThan(0);
      expect(body.sources.playtestFindings).toBeGreaterThan(0);
      expect(body.sources.worldFindings).toBeGreaterThan(0);

      const iterationEvent = await stream.waitFor((event) => event.event === 'game_autonomous_iteration');
      expect(iterationEvent.data).toMatchObject({
        type: 'game_autonomous_iteration',
        action: 'synthesized',
        projectId,
        fileName: 'iteration-arena.gameview.json',
        actionCount: body.actions.length,
        topPriority: 'p0',
      });
    } finally {
      await stream.close();
    }
  });

  it('falls back to a production-planning action when no iteration evidence exists yet', async () => {
    const projectId = uniqueProjectId();
    await createProject(projectId);

    const response = await fetch(`${baseUrl}/api/projects/${projectId}/autonomous-iteration`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ maxActions: 3 }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    expect(body.actions).toHaveLength(1);
    expect(body.actions[0]).toMatchObject({
      id: 'studio-synthesis-next-playtest',
      priority: 'p2',
      owner: 'production-planning',
    });
  });

  it('configures and runs a project-scoped autonomous iteration loop', async () => {
    const projectId = uniqueProjectId();
    await createProject(projectId);
    await writeGameViewport(projectId, 'loop-arena.gameview.json', {
      version: 1,
      kind: 'game-viewport',
      surface: 'gameplay',
      title: 'Loop Arena',
      entities: [
        { id: 'spawn', name: 'Player spawn', type: 'player-spawn', x: 80, y: 180 },
        { id: 'enemy-a', name: 'Pressure squad', type: 'enemy-spawn', x: 420, y: 220 },
      ],
      paths: [{ id: 'too-short', name: 'Too short', type: 'objective', points: [{ x: 80, y: 180 }] }],
    });

    const defaultConfig = await fetch(`${baseUrl}/api/projects/${projectId}/autonomous-iteration/loop`);
    expect(defaultConfig.status).toBe(200);
    expect((await defaultConfig.json()) as any).toMatchObject({
      projectId,
      config: {
        enabled: false,
        intervalMinutes: expect.any(Number),
      },
    });

    const stream = await openProjectEvents(projectId);
    try {
      const configure = await fetch(`${baseUrl}/api/projects/${projectId}/autonomous-iteration/loop`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: true,
          intervalMinutes: 15,
          fileName: 'loop-arena.gameview.json',
          focus: 'loop tuning',
          maxActions: 4,
          includeTelemetry: false,
          includePlaytest: true,
          includeWorldSimulation: false,
        }),
      });
      expect(configure.status).toBe(200);
      const configured = (await configure.json()) as any;
      expect(configured.config).toMatchObject({
        enabled: true,
        intervalMinutes: 15,
        fileName: 'loop-arena.gameview.json',
        focus: 'loop tuning',
        maxActions: 4,
        includeTelemetry: false,
        includePlaytest: true,
        includeWorldSimulation: false,
        nextRunAt: expect.any(Number),
      });

      const configuredEvent = await stream.waitFor((event) => event.event === 'game_autonomous_iteration_loop'
        && event.data.action === 'configured');
      expect(configuredEvent.data).toMatchObject({
        type: 'game_autonomous_iteration_loop',
        action: 'configured',
        projectId,
        enabled: true,
        intervalMinutes: 15,
      });

      const run = await fetch(`${baseUrl}/api/projects/${projectId}/autonomous-iteration/loop/run`, {
        method: 'POST',
      });
      expect(run.status).toBe(200);
      const body = (await run.json()) as any;
      expect(body.projectId).toBe(projectId);
      expect(body.iteration).toMatchObject({
        fileName: 'loop-arena.gameview.json',
        focus: 'loop tuning',
      });
      expect(body.iteration.actions.length).toBeGreaterThan(0);
      expect(body.config).toMatchObject({
        enabled: true,
        lastRunAt: expect.any(Number),
        lastActionCount: body.iteration.actions.length,
        lastSummary: body.iteration.summary,
        nextRunAt: expect.any(Number),
      });
      expect(body.config.nextRunAt).toBeGreaterThan(body.config.lastRunAt);

      const iterationEvent = await stream.waitFor((event) => event.event === 'game_autonomous_iteration'
        && event.data.fileName === 'loop-arena.gameview.json');
      expect(iterationEvent.data).toMatchObject({
        type: 'game_autonomous_iteration',
        action: 'synthesized',
        projectId,
        actionCount: body.iteration.actions.length,
      });

      const runEvent = await stream.waitFor((event) => event.event === 'game_autonomous_iteration_loop'
        && event.data.action === 'run');
      expect(runEvent.data).toMatchObject({
        type: 'game_autonomous_iteration_loop',
        action: 'run',
        projectId,
        enabled: true,
        intervalMinutes: 15,
        actionCount: body.iteration.actions.length,
      });
    } finally {
      await stream.close();
    }
  });
});
