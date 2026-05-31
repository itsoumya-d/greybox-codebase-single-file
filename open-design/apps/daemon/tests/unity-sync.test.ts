// SPDX-License-Identifier: Apache-2.0

import { createServer } from 'node:http';
import type { Socket } from 'node:net';
import { describe, expect, it } from 'vitest';
import { WebSocket } from 'undici';

import {
  UNITY_ROUND_TRIP_LATENCY_BUDGET_MS,
  createUnitySyncHub,
  decodeUnityClientFrames,
  normalizeEngineEditMessage,
  normalizeUnityEditMessage,
} from '../src/unity-sync.js';

async function waitForCondition<T>(probe: () => T | undefined, label: string): Promise<T> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 1500) {
    const value = probe();
    if (value !== undefined) return value;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function waitForOpen(socket: WebSocket): Promise<void> {
  if (socket.readyState === WebSocket.OPEN) return;
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener('open', () => resolve(), { once: true });
    socket.addEventListener('error', () => reject(new Error('websocket open failed')), { once: true });
  });
}

function encodeMaskedClientFrame(payload: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  let header: Buffer;
  if (body.length < 126) {
    header = Buffer.from([0x81, 0x80 | body.length]);
  } else if (body.length <= 0xffff) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 0x80 | 126;
    header.writeUInt16BE(body.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 0x80 | 127;
    header.writeBigUInt64BE(BigInt(body.length), 2);
  }
  const mask = Buffer.from([0x12, 0x34, 0x56, 0x78]);
  const masked = Buffer.alloc(body.length);
  for (let index = 0; index < body.length; index++) {
    masked[index] = body[index]! ^ mask[index % 4]!;
  }
  return Buffer.concat([header, mask, masked]);
}

describe('unity sync message normalization', () => {
  it('accepts safe Unity field edits', () => {
    expect(normalizeUnityEditMessage({
      type: 'unity-edit',
      fileName: 'levels/arena.gameview.json',
      path: 'spawn.position',
      value: { x: 1, y: 2, z: 3 },
      sentAt: 10,
      latencyBudgetMs: 1800,
    }, 1510)).toEqual({
      type: 'unity-edit',
      fileName: 'levels/arena.gameview.json',
      path: 'spawn.position',
      value: { x: 1, y: 2, z: 3 },
      sentAt: 10,
      receivedAt: 1510,
      latencyBudgetMs: 1800,
      observedLatencyMs: 1500,
      overLatencyBudget: false,
    });
  });

  it('defaults and caps Unity edit latency budgets at the 2 second sync target', () => {
    expect(normalizeUnityEditMessage({
      type: 'unity-edit',
      fileName: 'levels/arena.gameview.json',
      path: '$.actors[id=boss].health',
      value: 2,
      sentAt: 1000,
      latencyBudgetMs: 9000,
    }, 3501)).toMatchObject({
      receivedAt: 3501,
      latencyBudgetMs: UNITY_ROUND_TRIP_LATENCY_BUDGET_MS,
      observedLatencyMs: 2501,
      overLatencyBudget: true,
    });

    expect(normalizeUnityEditMessage({
      type: 'unity-edit',
      fileName: 'levels/arena.gameview.json',
      path: '$.actors[id=boss].health',
      value: 2,
      latencyBudgetMs: -1,
    }, 2000)).toMatchObject({
      receivedAt: 2000,
      latencyBudgetMs: UNITY_ROUND_TRIP_LATENCY_BUDGET_MS,
    });
  });

  it('rejects malformed or non-edit payloads', () => {
    expect(normalizeUnityEditMessage({ type: 'artifact-changed' })).toBeNull();
    expect(normalizeUnityEditMessage('unity-edit')).toBeNull();
    expect(normalizeUnityEditMessage({ type: 'unity-edit' })).toBeNull();
  });

  it('normalizes Unreal and Godot edits on the shared engine sync protocol', () => {
    expect(normalizeEngineEditMessage({
      type: 'unreal-edit',
      fileName: 'levels/arena.gameview.json',
      unrealDiff: [{ path: '$.actors[id=boss].health', value: 2 }],
      sentAt: 100,
    }, 'unreal', 500)).toMatchObject({
      type: 'unreal-edit',
      engine: 'unreal',
      fileName: 'levels/arena.gameview.json',
      engineDiff: [{ path: '$.actors[id=boss].health', value: 2 }],
      observedLatencyMs: 400,
    });

    expect(normalizeEngineEditMessage({
      type: 'godot-edit',
      fileName: 'levels/arena.levelboard.json',
      godotContent: '{"nodes":[]}',
    }, 'godot', 700)).toMatchObject({
      type: 'godot-edit',
      engine: 'godot',
      fileName: 'levels/arena.levelboard.json',
      engineContent: '{"nodes":[]}',
    });

    expect(normalizeEngineEditMessage({
      type: 'unity-edit',
      fileName: 'levels/arena.gameview.json',
      path: '$.actors[id=boss].health',
      value: 2,
    }, 'godot')).toBeNull();
  });

  it('rejects unsafe or unsupported Unity edit file names before merge handling', () => {
    for (const fileName of [
      '../arena.gameview.json',
      '/tmp/arena.gameview.json',
      'C:/tmp/arena.gameview.json',
      '.live-artifacts/secret.gameview.json',
      'levels/readme.txt',
    ]) {
      expect(normalizeUnityEditMessage({
        type: 'unity-edit',
        fileName,
        path: '$.actors[id=boss].health',
        value: 2,
      })).toBeNull();
    }
  });

  it('rejects unsafe Unity edit selectors and normalizes safe array diffs', () => {
    expect(normalizeUnityEditMessage({
      type: 'unity-edit',
      fileName: 'levels/arena.gameview.json',
      path: '$.__proto__.polluted',
      value: true,
    })).toBeNull();

    expect(normalizeUnityEditMessage({
      type: 'unity-edit',
      fileName: 'levels/arena.gameview.json',
      unityDiff: [
        { path: ['actors', 'boss', 'health'], value: 2 },
        { path: ['actors', '__proto__'], value: true },
      ],
    })).toMatchObject({
      type: 'unity-edit',
      fileName: 'levels/arena.gameview.json',
      unityDiff: [{ path: ['actors', 'boss', 'health'], value: 2 }],
    });
  });

  it('rejects unsafe Unity edit values before merge handling', () => {
    for (const value of [
      null,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      'x'.repeat(4097),
      JSON.parse('{"__proto__":{"polluted":true}}'),
      JSON.parse('{"constructor":{"polluted":true}}'),
      JSON.parse('{"prototype":{"polluted":true}}'),
      JSON.parse('{"../escape":true}'),
      new Date('2026-05-24T00:00:00.000Z'),
    ]) {
      expect(normalizeUnityEditMessage({
        type: 'unity-edit',
        fileName: 'levels/arena.gameview.json',
        path: '$.actors[id=boss].health',
        value,
      })).toBeNull();
    }
  });

  it('drops Unity diff entries with unsafe values while preserving safe edits', () => {
    expect(normalizeUnityEditMessage({
      type: 'unity-edit',
      fileName: 'levels/arena.gameview.json',
      unityDiff: [
        { path: '$.actors[id=boss].health', value: 2 },
        { path: '$.actors[id=boss].metadata', value: JSON.parse('{"__proto__":{"polluted":true}}') },
        { path: '$.actors[id=boss].name', value: 'Gate Boss' },
        { path: '$.actors[id=boss].raw', value: 'x'.repeat(4097) },
      ],
    })).toMatchObject({
      type: 'unity-edit',
      fileName: 'levels/arena.gameview.json',
      unityDiff: [
        { path: '$.actors[id=boss].health', value: 2 },
        { path: '$.actors[id=boss].name', value: 'Gate Boss' },
      ],
    });
  });

  it('preserves compact stable-id array paths for daemon merge handling', () => {
    expect(normalizeUnityEditMessage({
      type: 'unity-edit',
      fileName: 'levels/arena.gameview.json',
      unityDiff: [{ path: ['actors', 'boss', 'health'], value: 5 }],
    })).toMatchObject({
      unityDiff: [{ path: ['actors', 'boss', 'health'], value: 5 }],
    });
  });

  it('buffers partial WebSocket frames from Unity before decoding edits', () => {
    const frame = encodeMaskedClientFrame({
      type: 'unity-edit',
      fileName: 'levels/arena.gameview.json',
      path: '$.spawnPoints[id=start].position',
      value: { x: 1, y: 2, z: 3 },
    });

    const first = decodeUnityClientFrames(frame.subarray(0, 5));
    expect(first.messages).toEqual([]);
    expect(first.remaining.length).toBe(5);

    const second = decodeUnityClientFrames(Buffer.concat([first.remaining, frame.subarray(5)]));
    expect(second.remaining.length).toBe(0);
    expect(second.close).toBe(false);
    expect(second.protocolError).toBe(false);
    expect(second.oversized).toBe(false);
    expect(second.messages).toHaveLength(1);
    expect(JSON.parse(second.messages[0] ?? '{}')).toMatchObject({
      type: 'unity-edit',
      fileName: 'levels/arena.gameview.json',
      path: '$.spawnPoints[id=start].position',
    });
  });

  it('decodes back-to-back WebSocket frames that arrive in one socket chunk', () => {
    const first = encodeMaskedClientFrame({
      type: 'unity-edit',
      fileName: 'levels/arena.gameview.json',
      path: '$.actors[id=boss].health',
      value: 2,
    });
    const second = encodeMaskedClientFrame({
      type: 'unity-edit',
      fileName: 'levels/arena.gameview.json',
      path: '$.spawnPoints[id=start].position',
      value: { x: 4, y: 5, z: 6 },
    });

    const decoded = decodeUnityClientFrames(Buffer.concat([first, second]));
    expect(decoded.remaining.length).toBe(0);
    expect(decoded.messages.map((message) => JSON.parse(message).path)).toEqual([
      '$.actors[id=boss].health',
      '$.spawnPoints[id=start].position',
    ]);
  });

  it('accepts Unreal and Godot WebSocket upgrade paths without widening project ids', async () => {
    const edits: Array<{ projectId: string; message: any }> = [];
    const hub = createUnitySyncHub((projectId, message) => edits.push({ projectId, message }));
    const server = createServer();
    server.on('upgrade', (req, socket, head) => hub.handleUpgrade(req, socket as Socket, head));
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    expect(address && typeof address === 'object').toBe(true);
    const port = typeof address === 'object' && address ? address.port : 0;
    const projectId = 'engine-sync-project';
    const unreal = new WebSocket(`ws://127.0.0.1:${port}/api/sync/unreal?projectId=${projectId}`);
    const godot = new WebSocket(`ws://127.0.0.1:${port}/api/sync/godot?projectId=${projectId}`);

    try {
      await Promise.all([waitForOpen(unreal), waitForOpen(godot)]);
      expect(hub.clientCountByEngine('unreal', projectId)).toBe(1);
      expect(hub.clientCountByEngine('godot', projectId)).toBe(1);
      unreal.send(JSON.stringify({
        type: 'unreal-edit',
        fileName: 'levels/arena.gameview.json',
        unrealDiff: [{ path: '$.actors[id=boss].health', value: 4 }],
      }));
      godot.send(JSON.stringify({
        type: 'godot-edit',
        fileName: 'levels/arena.levelboard.json',
        godotDiff: [{ path: '$.rooms[name=Boss Door].position', value: { x: 4, y: 2 } }],
      }));
      await waitForCondition(() => edits.length === 2 ? edits : undefined, 'engine edit callbacks');
      expect(edits.map((edit) => edit.message.engine).sort()).toEqual(['godot', 'unreal']);
      expect(edits.every((edit) => edit.projectId === projectId)).toBe(true);
    } finally {
      unreal.close();
      godot.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
