import http from 'node:http';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

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
  const id = `game-balance-loop-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  projectIds.push(id);
  return id;
}

async function createProject(projectId: string) {
  const response = await fetch(`${baseUrl}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: projectId, name: 'Balance loop lab' }),
  });
  expect(response.status).toBe(200);
}

async function writeProjectFixture(projectId: string) {
  const dir = path.join(serverRuntimeDataRoot, 'projects', projectId);
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, 'balance-arena.gameview.json'),
    JSON.stringify({
      version: 1,
      kind: 'game-viewport',
      surface: 'gameplay',
      title: 'Balance Arena',
      entities: [
        { id: 'spawn', name: 'Player spawn', type: 'player-spawn', x: 80, y: 180 },
        { id: 'enemy-a', name: 'Unreadable bruiser', type: 'enemy-spawn', x: 380, y: 220 },
        { id: 'hazard-a', name: 'Shock floor', type: 'hazard', x: 440, y: 260 },
      ],
      paths: [{ id: 'short-path', name: 'Short objective path', type: 'objective', points: [{ x: 80, y: 180 }] }],
    }, null, 2),
    'utf8',
  );
  await writeFile(
    path.join(dir, 'combat-balance.systems.json'),
    JSON.stringify({
      version: 1,
      kind: 'game-system',
      systemType: 'combat',
      title: 'Combat Balance Sheet',
      tuning: {
        enemyTelegraphMs: 320,
        incomingDamageMultiplier: 1.2,
        currencySinkMultiplier: 1.1,
        objectiveHintDelaySeconds: 10,
      },
      risks: [
        {
          id: 'readability-spike',
          label: 'Unreadable enemy burst',
          severity: 'high',
          mitigation: 'Reserve tuning time for telegraph, camera, and recovery-resource passes.',
        },
      ],
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

describe('game balance loop routes', () => {
  it('turns telemetry and playtest findings into applied game-system tuning adjustments', async () => {
    const projectId = uniqueProjectId();
    await createProject(projectId);
    await writeProjectFixture(projectId);
    const telemetry = await fetch(`${baseUrl}/api/projects/${projectId}/game-telemetry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        events: [
          { type: 'level_start', sessionId: 'balance-session', sceneId: 'balance-arena' },
          { type: 'combat_event', sessionId: 'balance-session', sceneId: 'balance-arena', payload: { readable: false } },
          { type: 'economy_event', sessionId: 'balance-session', sceneId: 'balance-arena', value: -25 },
        ],
      }),
    });
    expect(telemetry.status).toBe(200);

    const stream = await openProjectEvents(projectId);
    try {
      const response = await fetch(`${baseUrl}/api/projects/${projectId}/balance-loop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: 'balance-arena.gameview.json',
          systemFileName: 'combat-balance.systems.json',
          focus: 'combat and economy tuning',
          maxAdjustments: 12,
          apply: true,
        }),
      });

      expect(response.status).toBe(200);
      const body = (await response.json()) as any;
      expect(body.systemFileName).toBe('combat-balance.systems.json');
      expect(body.appliedCount).toBeGreaterThan(0);
      expect(body.adjustments.map((entry: { id: string }) => entry.id)).toEqual(
        expect.arrayContaining(['telemetry-combat-telegraph-window', 'telemetry-economy-sink-pressure']),
      );
      expect(body.adjustments.every((entry: { applyStatus: string }) => entry.applyStatus === 'applied')).toBe(true);

      const event = await stream.waitFor((entry) => entry.event === 'game_balance_loop');
      expect(event.data).toMatchObject({
        type: 'game_balance_loop',
        action: 'balanced',
        projectId,
        systemFileName: 'combat-balance.systems.json',
        appliedCount: body.appliedCount,
      });
    } finally {
      await stream.close();
    }

    const updated = JSON.parse(
      await readFile(path.join(serverRuntimeDataRoot, 'projects', projectId, 'combat-balance.systems.json'), 'utf8'),
    ) as any;
    expect(updated.tuning.enemyTelegraphMs).toBeGreaterThan(320);
    expect(updated.tuning.incomingDamageMultiplier).toBeLessThan(1.2);
    expect(updated.tuning.currencySinkMultiplier).toBeLessThan(1.1);
  });

  it('records human balance decisions and applies accepted tuning adjustments', async () => {
    const projectId = uniqueProjectId();
    await createProject(projectId);
    await writeProjectFixture(projectId);

    const stream = await openProjectEvents(projectId);
    const adjustment = {
      id: 'designer-approved-telegraph',
      priority: 'p1',
      owner: 'gameplay-mechanics',
      source: 'playtest-simulation',
      category: 'combat-readability',
      title: 'Increase bruiser telegraph readability',
      evidence: 'Casual and explorer personas missed the first heavy attack tell.',
      rationale: 'The next playtest should validate readability before damage tuning changes.',
      recommendation: 'Raise the enemy telegraph window for the bruiser attack.',
      targetFileName: 'combat-balance.systems.json',
      targetPath: ['tuning', 'enemyTelegraphMs'],
      currentValue: 320,
      suggestedValue: 480,
      applyStatus: 'suggested',
    };

    try {
      const accept = await fetch(
        `${baseUrl}/api/projects/${projectId}/balance-loop/adjustments/${adjustment.id}/decision`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            decision: 'accepted',
            adjustment,
            note: 'Readable tell accepted by designer.',
          }),
        },
      );
      expect(accept.status).toBe(200);
      const accepted = (await accept.json()) as any;
      expect(accepted).toMatchObject({
        projectId,
        decision: 'accepted',
        appliedCount: 1,
        systemFileName: 'combat-balance.systems.json',
        adjustment: {
          id: adjustment.id,
          applyStatus: 'applied',
        },
      });

      const event = await stream.waitFor((entry) => entry.event === 'game_balance_loop_adjustment_decision');
      expect(event.data).toMatchObject({
        type: 'game_balance_loop_adjustment_decision',
        action: 'accepted',
        projectId,
        adjustmentId: adjustment.id,
        appliedCount: 1,
        systemFileName: 'combat-balance.systems.json',
      });
    } finally {
      await stream.close();
    }

    const updated = JSON.parse(
      await readFile(path.join(serverRuntimeDataRoot, 'projects', projectId, 'combat-balance.systems.json'), 'utf8'),
    ) as any;
    expect(updated.tuning.enemyTelegraphMs).toBe(480);

    const reject = await fetch(
      `${baseUrl}/api/game-deliverables/${projectId}/balance-loop/adjustments/${adjustment.id}/decision`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision: 'rejected',
          adjustment: { ...adjustment, suggestedValue: 520 },
        }),
      },
    );
    expect(reject.status).toBe(200);
    expect(await reject.json()).toMatchObject({
      projectId,
      decision: 'rejected',
      appliedCount: 0,
      adjustment: {
        id: adjustment.id,
        applyStatus: 'not-applicable',
      },
    });

    const stillUpdated = JSON.parse(
      await readFile(path.join(serverRuntimeDataRoot, 'projects', projectId, 'combat-balance.systems.json'), 'utf8'),
    ) as any;
    expect(stillUpdated.tuning.enemyTelegraphMs).toBe(480);

    const decisions = JSON.parse(
      await readFile(
        path.join(serverRuntimeDataRoot, 'projects', projectId, '.agds', 'game-balance-loop', 'decisions.json'),
        'utf8',
      ),
    ) as any[];
    expect(decisions.map((decision) => decision.decision)).toEqual(['accepted', 'rejected']);
  });

  it('configures and runs a scheduled balance loop', async () => {
    const projectId = uniqueProjectId();
    await createProject(projectId);
    await writeProjectFixture(projectId);

    const configure = await fetch(`${baseUrl}/api/projects/${projectId}/balance-loop/loop`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enabled: true,
        intervalMinutes: 15,
        fileName: 'balance-arena.gameview.json',
        systemFileName: 'combat-balance.systems.json',
        focus: 'scheduled balance pass',
        maxAdjustments: 4,
        includeTelemetry: false,
        includePlaytest: true,
        personas: ['casual', 'rage-quitter'],
        apply: false,
      }),
    });
    expect(configure.status).toBe(200);
    const configured = (await configure.json()) as any;
    expect(configured.config).toMatchObject({
      enabled: true,
      intervalMinutes: 15,
      systemFileName: 'combat-balance.systems.json',
      apply: false,
      personas: ['casual', 'rage-quitter'],
      nextRunAt: expect.any(Number),
    });

    const run = await fetch(`${baseUrl}/api/projects/${projectId}/balance-loop/loop/run`, {
      method: 'POST',
    });
    expect(run.status).toBe(200);
    const body = (await run.json()) as any;
    expect(body.projectId).toBe(projectId);
    expect(body.balance).toMatchObject({
      systemFileName: 'combat-balance.systems.json',
      focus: 'scheduled balance pass',
    });
    expect(body.balance.adjustments.length).toBeGreaterThan(0);
    expect(body.balance.sources.personaReports).toBe(2);
    expect(body.balance.adjustments.map((entry: { id: string }) => entry.id)).toEqual(
      expect.arrayContaining(['playtest-persona-casual-balance']),
    );
    expect(body.config).toMatchObject({
      enabled: true,
      lastRunAt: expect.any(Number),
      lastAdjustmentCount: body.balance.adjustments.length,
      lastAppliedCount: 0,
      nextRunAt: expect.any(Number),
    });
    expect(body.config.nextRunAt).toBeGreaterThan(body.config.lastRunAt);
  });
});
