import http from 'node:http';
import { rm } from 'node:fs/promises';
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
  const id = `game-telemetry-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  projectIds.push(id);
  return id;
}

async function createProject(projectId: string) {
  const response = await fetch(`${baseUrl}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: projectId, name: 'Telemetry playtest' }),
  });
  expect(response.status).toBe(200);
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

describe('game telemetry routes', () => {
  it('ingests, summarizes, lists, and broadcasts project-scoped gameplay telemetry', async () => {
    const projectId = uniqueProjectId();
    await createProject(projectId);
    const stream = await openProjectEvents(projectId);

    const ingest = await fetch(`${baseUrl}/api/projects/${projectId}/game-telemetry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        events: [
          {
            eventId: 'evt-start',
            type: 'session_start',
            timestamp: 1000,
            sessionId: 'session-a',
            playerId: 'player-1',
            sceneId: 'foundry-approach',
            platform: 'pc',
            tags: ['vertical-slice', 'playtest'],
          },
          {
            eventId: 'evt-death',
            type: 'death',
            timestamp: 1400,
            sessionId: 'session-a',
            sceneId: 'foundry-approach',
            encounterId: 'pressure-wave-a',
            position: { x: 512, y: 330, z: 4 },
            payload: { cause: 'ranged-telegraph-missed', readable: false },
          },
        ],
      }),
    });
    expect(ingest.status).toBe(200);
    const ingested = (await ingest.json()) as any;
    expect(ingested.stored).toBe(2);
    expect(ingested.events).toHaveLength(2);
    expect(ingested.events[1]).toMatchObject({
      projectId,
      type: 'death',
      sceneId: 'foundry-approach',
      encounterId: 'pressure-wave-a',
      position: { x: 512, y: 330, z: 4 },
    });
    expect(ingested.summary).toMatchObject({
      total: 2,
      byType: { session_start: 1, death: 1 },
      byScene: { 'foundry-approach': 2 },
      sessionCount: 1,
      latestTimestamp: 1400,
    });

    const telemetryEvent = await stream.waitFor((event) => event.event === 'game_telemetry');
    expect(telemetryEvent.data).toMatchObject({
      type: 'game_telemetry',
      action: 'ingested',
      projectId,
      count: 2,
      summary: { total: 2, byType: { death: 1 } },
    });

    const listed = await fetch(`${baseUrl}/api/projects/${projectId}/game-telemetry?limit=10`);
    expect(listed.status).toBe(200);
    const listedBody = (await listed.json()) as any;
    expect(listedBody.events.map((event: { eventId?: string }) => event.eventId)).toEqual([
      'evt-start',
      'evt-death',
    ]);
    expect(listedBody.summary.byType.death).toBe(1);

    await stream.close();
  });

  it('turns stored gameplay telemetry into production design insights and heatmap cells', async () => {
    const projectId = uniqueProjectId();
    await createProject(projectId);

    const ingest = await fetch(`${baseUrl}/api/projects/${projectId}/game-telemetry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        events: [
          { type: 'level_start', timestamp: 2000, sessionId: 'session-b', sceneId: 'arena-bridge' },
          {
            type: 'death',
            timestamp: 2100,
            sessionId: 'session-b',
            sceneId: 'arena-bridge',
            position: { x: 510, y: 330 },
          },
          {
            type: 'frustration_signal',
            timestamp: 2150,
            sessionId: 'session-b',
            sceneId: 'arena-bridge',
            position: { x: 520, y: 340 },
          },
          {
            type: 'accessibility_event',
            timestamp: 2200,
            sessionId: 'session-b',
            sceneId: 'arena-bridge',
            payload: { requested: 'reduced-motion' },
          },
          {
            type: 'combat_event',
            timestamp: 2250,
            sessionId: 'session-b',
            sceneId: 'arena-bridge',
            payload: { readable: false, result: 'failed' },
          },
          {
            type: 'economy_event',
            timestamp: 2300,
            sessionId: 'session-b',
            sceneId: 'arena-bridge',
            value: -25,
          },
        ],
      }),
    });
    expect(ingest.status).toBe(200);

    const response = await fetch(`${baseUrl}/api/projects/${projectId}/game-telemetry/insights?limit=20`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    expect(body.summary.total).toBe(6);
    expect(body.heatmap[0]).toMatchObject({ sceneId: 'arena-bridge', x: 500, y: 350, count: 2 });
    expect(body.insights.map((insight: { category: string }) => insight.category)).toEqual(
      expect.arrayContaining([
        'frustration',
        'progression',
        'accessibility',
        'combat-balance',
        'economy',
        'heatmap',
      ]),
    );
    expect(body.insights.find((insight: { id: string }) => insight.id === 'frustration-hotspot')).toMatchObject({
      severity: 'medium',
      title: 'Player frustration hotspot detected',
    });
  });

  it('rejects telemetry payloads without event types', async () => {
    const projectId = uniqueProjectId();
    await createProject(projectId);

    const response = await fetch(`${baseUrl}/api/projects/${projectId}/game-telemetry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: [{ sessionId: 'missing-type' }] }),
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as any;
    expect(String(body.error?.message ?? body.error)).toContain('events.0.type is required');
  });
});
