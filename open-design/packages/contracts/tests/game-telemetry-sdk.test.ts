import { describe, expect, it } from 'vitest';

import type { GameTelemetryFetch } from '../src/game-telemetry-sdk';
import { createGameTelemetryClient } from '../src/game-telemetry-sdk';

describe('game telemetry SDK', () => {
  it('queues contextual game telemetry and flushes it to the project ingestion route', async () => {
    const calls: Array<{ url: string; body: any; headers: Record<string, string> }> = [];
    const fetchImpl: GameTelemetryFetch = async (url, init) => {
      calls.push({ url, body: JSON.parse(init.body), headers: init.headers });
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            stored: 2,
            events: [],
            summary: { total: 2, byType: { death: 1, checkpoint: 1 }, byScene: { arena: 2 }, sessionCount: 1 },
          };
        },
      };
    };

    const client = createGameTelemetryClient({
      endpoint: '/api/projects/project-1/game-telemetry',
      fetch: fetchImpl,
      now: () => 1234,
      headers: { 'x-playtest-build': 'vertical-slice' },
      context: {
        sessionId: 'session-1',
        playerId: 'player-a',
        sceneId: 'arena',
        platform: 'browser',
      },
    });

    expect(client.track({ type: 'death', position: { x: 200, y: 320 }, payload: { cause: 'sniper' } })).toBe(1);
    expect(client.track({ type: 'checkpoint', timestamp: 1500 })).toBe(2);
    expect(client.pendingCount()).toBe(2);

    const response = await client.flush();
    expect(response?.stored).toBe(2);
    expect(client.pendingCount()).toBe(0);
    expect(calls).toHaveLength(1);
    expect(calls[0]!).toMatchObject({
      url: '/api/projects/project-1/game-telemetry',
      headers: { 'Content-Type': 'application/json', 'x-playtest-build': 'vertical-slice' },
    });
    expect(calls[0]?.body.events).toEqual([
      {
        type: 'death',
        timestamp: 1234,
        sessionId: 'session-1',
        playerId: 'player-a',
        sceneId: 'arena',
        platform: 'browser',
        position: { x: 200, y: 320 },
        payload: { cause: 'sniper' },
      },
      {
        type: 'checkpoint',
        timestamp: 1500,
        sessionId: 'session-1',
        playerId: 'player-a',
        sceneId: 'arena',
        platform: 'browser',
      },
    ]);
  });

  it('keeps queued events when ingestion fails so a game can retry', async () => {
    const fetchImpl: GameTelemetryFetch = async () => ({
      ok: false,
      status: 503,
      async json() {
        return {};
      },
      async text() {
        return 'playtest telemetry unavailable';
      },
    });
    const client = createGameTelemetryClient({
      endpoint: '/api/projects/project-1/game-telemetry',
      fetch: fetchImpl,
      now: () => 99,
    });

    client.track({ type: 'frustration_signal' });

    await expect(client.flush()).rejects.toThrow('Game telemetry ingest failed (503): playtest telemetry unavailable');
    expect(client.pendingEvents()).toEqual([{ type: 'frustration_signal', timestamp: 99 }]);
    expect(client.pendingCount()).toBe(1);
    client.clear();
    expect(client.pendingCount()).toBe(0);
  });
});
