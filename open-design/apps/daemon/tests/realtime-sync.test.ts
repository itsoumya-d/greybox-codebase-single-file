// SPDX-License-Identifier: Apache-2.0

import { once } from 'node:events';
import { createServer, type Server } from 'node:http';
import { connect, type AddressInfo, type Socket } from 'node:net';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';

import { WebSocket } from 'undici';
import { describe, expect, it } from 'vitest';

import { createRealtimeDocument } from '@ai-game-design-studio/realtime/client';
import {
  listPresenceStates,
  setLocalPresence,
} from '@ai-game-design-studio/realtime/awareness';
import {
  bindRealtimeWebSocket,
  type RealtimeWebSocketLike,
} from '@ai-game-design-studio/realtime/websocket-client';

import { createDaemonRealtimeHub } from '../src/realtime-sync.js';

async function listen(server: Server): Promise<number> {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address() as AddressInfo;
  return address.port;
}

async function rawUpgradeRequest(port: number, headers: string[]): Promise<string> {
  const socket = connect({ host: '127.0.0.1', port });
  const chunks: Buffer[] = [];
  socket.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
  await once(socket, 'connect');
  socket.write([
    'GET /api/realtime?projectId=project-1 HTTP/1.1',
    `Host: 127.0.0.1:${port}`,
    ...headers,
    '',
    '',
  ].join('\r\n'));
  await Promise.race([
    once(socket, 'close'),
    once(socket, 'end'),
    delay(500),
  ]);
  socket.destroy();
  return Buffer.concat(chunks).toString('utf8');
}

async function waitFor(assertion: () => void | boolean, timeoutMs = 2_000): Promise<void> {
  const startedAt = Date.now();
  let lastError: unknown;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const result = assertion();
      if (result !== false) return;
    } catch (error) {
      lastError = error;
    }
    await delay(25);
  }
  if (lastError) throw lastError;
  throw new Error('Timed out waiting for realtime assertion.');
}

async function waitForOpen(socket: WebSocket): Promise<void> {
  if (socket.readyState === WebSocket.OPEN) return;
  await once(socket, 'open');
}

async function waitForPresence(
  realtime: ReturnType<typeof createRealtimeDocument>,
  predicate: () => boolean,
  timeoutMs = 2_000,
): Promise<number> {
  const startedAt = performance.now();
  if (predicate()) return 0;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      realtime.awareness.off('update', onUpdate);
      reject(new Error('Timed out waiting for realtime presence update.'));
    }, timeoutMs);
    const onUpdate = (): void => {
      if (!predicate()) return;
      clearTimeout(timeout);
      realtime.awareness.off('update', onUpdate);
      resolve(performance.now() - startedAt);
    };
    realtime.awareness.on('update', onUpdate);
  });
}

describe('daemon realtime sync', () => {
  it('rejects malformed realtime websocket handshakes before relay registration', async () => {
    const hub = createDaemonRealtimeHub();
    const server = createServer((_req, res) => {
      res.writeHead(404);
      res.end();
    });
    server.on('upgrade', (req, socket, head) => {
      if (!hub.handleUpgrade(req, socket as Socket, head)) socket.destroy();
    });

    const port = await listen(server);
    const validKey = Buffer.from('0123456789abcdef').toString('base64');

    try {
      const badKeyResponse = await rawUpgradeRequest(port, [
        'Upgrade: websocket',
        'Connection: Upgrade',
        'Sec-WebSocket-Version: 13',
        'Sec-WebSocket-Key: not-a-real-key',
      ]);
      const badVersionResponse = await rawUpgradeRequest(port, [
        'Upgrade: websocket',
        'Connection: Upgrade',
        'Sec-WebSocket-Version: 12',
        `Sec-WebSocket-Key: ${validKey}`,
      ]);
      const missingConnectionResponse = await rawUpgradeRequest(port, [
        'Upgrade: websocket',
        'Sec-WebSocket-Version: 13',
        `Sec-WebSocket-Key: ${validKey}`,
      ]);

      expect(badKeyResponse).not.toContain('101 Switching Protocols');
      expect(badVersionResponse).not.toContain('101 Switching Protocols');
      expect(missingConnectionResponse).not.toContain('101 Switching Protocols');
      expect(hub.clientCount('project-1')).toBe(0);
    } finally {
      await hub.destroy();
      server.close();
      await once(server, 'close').catch(() => undefined);
    }
  });

  it('upgrades /api/realtime and relays Yjs document + awareness updates by project', async () => {
    const hub = createDaemonRealtimeHub();
    const server = createServer((_req, res) => {
      res.writeHead(404);
      res.end();
    });
    server.on('upgrade', (req, socket, head) => {
      if (!hub.handleUpgrade(req, socket as Socket, head)) socket.destroy();
    });

    const port = await listen(server);
    const url = `ws://127.0.0.1:${port}/api/realtime?projectId=project-1`;
    const first = createRealtimeDocument({ guid: 'project-1' });
    const second = createRealtimeDocument({ guid: 'project-1' });
    const agent = createRealtimeDocument({ guid: 'project-1-agent' });
    const firstSocket = new WebSocket(url);
    const secondSocket = new WebSocket(url);
    const agentSocket = new WebSocket(url);
    const firstBinding = bindRealtimeWebSocket(first, firstSocket as unknown as RealtimeWebSocketLike);
    const secondBinding = bindRealtimeWebSocket(second, secondSocket as unknown as RealtimeWebSocketLike);
    const agentBinding = bindRealtimeWebSocket(agent, agentSocket as unknown as RealtimeWebSocketLike);

    try {
      await Promise.all([waitForOpen(firstSocket), waitForOpen(secondSocket), waitForOpen(agentSocket)]);
      expect(hub.clientCount('project-1')).toBe(3);

      first.doc.getArray<string>('chat').push(['Make the boss take 2 hits.']);
      await waitFor(() => {
        expect(second.doc.getArray<string>('chat').toArray()).toEqual([
          'Make the boss take 2 hits.',
        ]);
      });

      let observedPresenceStates = listPresenceStates(first.awareness);
      const observePresenceLatency = waitForPresence(first, () => {
        observedPresenceStates = listPresenceStates(first.awareness);
        return (
          observedPresenceStates.some((presence) => (
            presence.userId === 'client-2' &&
            presence.kind === 'human' &&
            presence.projectPresence?.filePath === 'DESIGN.md' &&
            presence.projectPresence.cursor?.selectionLabel === 'Spawn pacing note'
          )) &&
          observedPresenceStates.some((presence) => (
            presence.userId === 'agent-1' &&
            presence.kind === 'agent' &&
            presence.agent?.writing === true
          ))
        );
      });
      setLocalPresence(second.awareness, {
        userId: 'client-2',
        name: 'Rin',
        color: '#FF6B35',
        kind: 'human',
        updatedAt: 100,
        projectPresence: {
          projectId: 'project-1',
          clientId: 'client-2',
          mode: 'editing',
          surface: 'game-files',
          filePath: 'DESIGN.md',
          cursor: {
            line: 18,
            column: 7,
            selectionKind: 'range',
            selectionLabel: 'Spawn pacing note',
          },
        },
      });
      setLocalPresence(agent.awareness, {
        userId: 'agent-1',
        name: 'Greybox Agent',
        color: '#3CC2E0',
        kind: 'agent',
        agent: { writing: true, label: 'AGENT' },
        updatedAt: 101,
        projectPresence: {
          projectId: 'project-1',
          clientId: 'agent-1',
          mode: 'editing',
          surface: 'production-board',
        },
      });
      const presenceLatencyMs = await observePresenceLatency;
      expect(observedPresenceStates).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            userId: 'client-2',
            kind: 'human',
            projectPresence: expect.objectContaining({
              filePath: 'DESIGN.md',
              cursor: expect.objectContaining({
                selectionLabel: 'Spawn pacing note',
              }),
            }),
          }),
          expect.objectContaining({
            userId: 'agent-1',
            kind: 'agent',
            agent: expect.objectContaining({ writing: true }),
          }),
        ]),
      );
      expect(presenceLatencyMs).toBeLessThan(200);
    } finally {
      firstBinding.disconnect();
      secondBinding.disconnect();
      agentBinding.disconnect();
      firstSocket.close();
      secondSocket.close();
      agentSocket.close();
      first.awareness.destroy();
      second.awareness.destroy();
      agent.awareness.destroy();
      first.doc.destroy();
      second.doc.destroy();
      agent.doc.destroy();
      await hub.destroy();
      server.close();
      await once(server, 'close').catch(() => undefined);
    }
  });
});
