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
  const id = `game-world-sim-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  projectIds.push(id);
  return id;
}

async function createProject(projectId: string) {
  const response = await fetch(`${baseUrl}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: projectId, name: 'World simulation lab' }),
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

describe('game world simulation routes', () => {
  it('simulates dynamic world pressure from a game viewport and broadcasts the result', async () => {
    const projectId = uniqueProjectId();
    await createProject(projectId);
    await writeGameViewport(projectId, 'frontier-world.gameview.json', {
      version: 1,
      kind: 'game-viewport',
      surface: 'world-map',
      title: 'Frontier Storm World',
      entities: [
        { id: 'player-camp', name: 'Player camp', type: 'player-spawn', x: 120, y: 220 },
        { id: 'ash-faction', name: 'Ash Pact territory', type: 'faction', x: 400, y: 180, faction: 'Ash Pact' },
        { id: 'ranger-npc', name: 'Ranger outpost', type: 'npc', x: 320, y: 260, faction: 'Rangers' },
        { id: 'ore-node', name: 'Moon ore seam', type: 'resource-node', x: 520, y: 300 },
        { id: 'toxic-vent', name: 'Toxic vent field', type: 'hazard', x: 600, y: 340 },
        { id: 'storm-front', name: 'Storm front volume', type: 'weather-volume', x: 480, y: 120 },
      ],
      terrainZones: [
        { id: 'red-biome', name: 'Red salt flats', type: 'biome', x: 260, y: 100, w: 260, h: 160 },
        { id: 'vent-hazard', name: 'Vent hazard belt', type: 'hazard-field', x: 560, y: 300, w: 180, h: 120 },
      ],
      dynamicEvents: [
        {
          id: 'ash-invasion',
          name: 'Ash Pact invasion',
          trigger: 'Faction control reaches the ranger outpost.',
          impact: 'War pressure adds patrols, blocks a resource route, and opens a rescue objective.',
        },
        {
          id: 'world-boss-roam',
          name: 'World boss migration',
          trigger: 'Storm reaches the salt flats.',
          impact: 'Boss route forces players to choose stealth, co-op combat, or a longer traversal detour.',
        },
      ],
      worldSimulation: {
        ecosystem: 'Storm grazers flee toxic vents and pull predators toward safer ridge lines.',
        factionTerritory: ['Ash Pact border', 'Ranger outpost', 'neutral ore road'],
        weather: 'Ion storm reduces long-range visibility and raises traversal risk.',
      },
    });
    const stream = await openProjectEvents(projectId);

    const response = await fetch(`${baseUrl}/api/projects/${projectId}/world-simulation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: 'frontier-world.gameview.json', ticks: 6, scenario: 'storm escalation' }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    expect(body.fileName).toBe('frontier-world.gameview.json');
    expect(body.ticks).toBe(6);
    expect(body.scenario).toBe('storm escalation');
    expect(body.metrics.map((metric: { id: string }) => metric.id)).toEqual(
      expect.arrayContaining([
        'dynamic-events',
        'faction-signals',
        'biome-signals',
        'reactive-rules',
        'world-state-pressure',
        'faction-control-nodes',
      ]),
    );
    expect(body.events.map((event: { type: string }) => event.type)).toEqual(
      expect.arrayContaining(['dynamic-event', 'faction-pressure', 'weather-shift', 'hazard-escalation']),
    );
    expect(body.findings.map((finding: { id: string }) => finding.id)).toEqual(
      expect.arrayContaining(['factions-without-reactivity', 'weather-without-persistence']),
    );
    expect(body.state).toMatchObject({
      tick: 6,
      activeWeather: 'Ion storm reduces long-range visibility and raises traversal risk.',
      dynamicEventPressure: expect.any(Number),
      hazardPressure: expect.any(Number),
      resourcePressure: expect.any(Number),
      ecosystemPressure: expect.any(Number),
    });
    expect(body.state.factionControl).toEqual(
      expect.objectContaining({
        'Ash Pact border': expect.any(Number),
        'Ranger outpost': expect.any(Number),
      }),
    );

    const worldEvent = await stream.waitFor((event) => event.event === 'game_world_simulation');
    expect(worldEvent.data).toMatchObject({
      type: 'game_world_simulation',
      action: 'simulated',
      projectId,
      fileName: 'frontier-world.gameview.json',
      ticks: 6,
      eventCount: body.events.length,
      findingCount: body.findings.length,
      highestRisk: 'high',
    });

    await stream.close();
  });

  it('returns a clear error when a project has no game viewport document to simulate', async () => {
    const projectId = uniqueProjectId();
    await createProject(projectId);

    const response = await fetch(`${baseUrl}/api/projects/${projectId}/world-simulation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticks: 4 }),
    });

    expect(response.status).toBe(404);
    const body = (await response.json()) as any;
    expect(String(body.error?.message ?? body.error)).toContain('no .gameview.json viewport document found');
  });

  it('configures and manually runs a daemon-local live world simulation loop', async () => {
    const projectId = uniqueProjectId();
    await createProject(projectId);
    await writeGameViewport(projectId, 'living-frontier.gameview.json', {
      version: 1,
      kind: 'game-viewport',
      surface: 'world-map',
      title: 'Living Frontier Loop',
      entities: [
        { id: 'camp', name: 'Player camp', type: 'player-spawn', x: 100, y: 200 },
        { id: 'pact-border', name: 'Ash Pact border', type: 'faction', x: 420, y: 180, faction: 'Ash Pact' },
        { id: 'ore-road', name: 'Ore road', type: 'resource-node', x: 540, y: 300 },
        { id: 'storm-cell', name: 'Storm cell', type: 'weather-volume', x: 640, y: 160 },
      ],
      terrainZones: [
        { id: 'biome-1', name: 'Glass flats biome', type: 'biome', x: 280, y: 120, w: 220, h: 140 },
      ],
      dynamicEvents: [
        {
          id: 'faction-raid',
          name: 'Faction raid pressure',
          trigger: 'Raid meter crosses the neutral ore road.',
          impact: 'War pressure changes patrol density and unlocks a rescue objective.',
        },
      ],
      worldSimulation: {
        ecosystem: 'Predators migrate away from storm-lit flats and toward player supply routes.',
        factionTerritory: ['Ash Pact border', 'neutral ore road'],
        weather: 'Storm fronts reduce visibility and raise traversal risk.',
        persistence: 'Storm state and faction control persist between sessions.',
        reactiveRules: ['If players clear raid scouts, patrol density drops for two ticks.'],
      },
    });

    const readDefault = await fetch(`${baseUrl}/api/projects/${projectId}/world-simulation/loop`);
    expect(readDefault.status).toBe(200);
    const defaultBody = (await readDefault.json()) as any;
    expect(defaultBody.config).toMatchObject({ enabled: false, intervalMinutes: 15, ticks: 6 });

    const stream = await openProjectEvents(projectId);
    const configured = await fetch(`${baseUrl}/api/projects/${projectId}/world-simulation/loop`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enabled: true,
        intervalMinutes: 1,
        fileName: 'living-frontier.gameview.json',
        ticks: 4,
        scenario: 'daemon live frontier loop',
      }),
    });

    expect(configured.status).toBe(200);
    const configuredBody = (await configured.json()) as any;
    expect(configuredBody.config).toMatchObject({
      enabled: true,
      intervalMinutes: 1,
      fileName: 'living-frontier.gameview.json',
      ticks: 4,
      scenario: 'daemon live frontier loop',
    });
    expect(configuredBody.config.nextRunAt).toEqual(expect.any(Number));

    const configuredEvent = await stream.waitFor((event) => event.event === 'game_world_simulation_loop');
    expect(configuredEvent.data).toMatchObject({
      type: 'game_world_simulation_loop',
      action: 'configured',
      projectId,
      enabled: true,
      intervalMinutes: 1,
    });

    const run = await fetch(`${baseUrl}/api/projects/${projectId}/world-simulation/loop/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });

    expect(run.status).toBe(200);
    const runBody = (await run.json()) as any;
    expect(runBody.simulation.fileName).toBe('living-frontier.gameview.json');
    expect(runBody.simulation.ticks).toBe(4);
    expect(runBody.simulation.events.length).toBeGreaterThan(0);
    expect(runBody.config.lastRunAt).toEqual(expect.any(Number));
    expect(runBody.config.lastEventCount).toBe(runBody.simulation.events.length);
    expect(runBody.config.lastFindingCount).toBe(runBody.simulation.findings.length);
    expect(runBody.config.lastState).toMatchObject({
      tick: 4,
      activeWeather: 'Storm fronts reduce visibility and raise traversal risk.',
      persistenceKeys: expect.arrayContaining(['weather', 'ecosystem', 'factionTerritory', 'reactiveRules']),
    });
    expect(runBody.config.lastState.factionControl).toEqual(
      expect.objectContaining({ 'Ash Pact border': expect.any(Number) }),
    );
    expect(runBody.config.nextRunAt).toBeGreaterThan(runBody.config.lastRunAt);

    const simulationEvent = await stream.waitFor((event) => event.event === 'game_world_simulation');
    expect(simulationEvent.data).toMatchObject({
      type: 'game_world_simulation',
      action: 'simulated',
      projectId,
      fileName: 'living-frontier.gameview.json',
      ticks: 4,
      eventCount: runBody.simulation.events.length,
    });
    const loopRunEvent = await stream.waitFor((event) =>
      event.event === 'game_world_simulation_loop' && event.data.action === 'run',
    );
    expect(loopRunEvent.data).toMatchObject({
      type: 'game_world_simulation_loop',
      action: 'run',
      projectId,
      enabled: true,
      intervalMinutes: 1,
      eventCount: runBody.simulation.events.length,
      findingCount: runBody.simulation.findings.length,
    });

    const persisted = await fetch(`${baseUrl}/api/projects/${projectId}/world-simulation/loop`);
    expect(persisted.status).toBe(200);
    const persistedBody = (await persisted.json()) as any;
    expect(persistedBody.config.lastEventCount).toBe(runBody.simulation.events.length);

    await stream.close();
  });
});
