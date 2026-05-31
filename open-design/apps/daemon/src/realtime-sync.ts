// SPDX-License-Identifier: Apache-2.0

import { createHash } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Socket } from 'node:net';
import { URL } from 'node:url';

import {
  createRealtimeRelay,
  type RealtimeMessage,
  type RealtimeRelay,
  type RealtimeRelayOptions,
  type RealtimeTransportSocket,
} from '@ai-game-design-studio/realtime/server';

const MAX_REALTIME_FRAME_BYTES = 2 * 1024 * 1024;
const PROJECT_ID_RE = /^[A-Za-z0-9._:-]{1,160}$/;
const WEBSOCKET_VERSION = '13';

interface RealtimeSocket extends RealtimeTransportSocket {
  raw: Socket;
}

type DecodedFrame =
  | { kind: 'message'; payload: Uint8Array; bytesRead: number }
  | { kind: 'close'; bytesRead: number }
  | { kind: 'incomplete' }
  | { kind: 'invalid' };

export interface DaemonRealtimeHub {
  handleUpgrade(req: IncomingMessage, socket: Socket, head: Buffer): boolean;
  clientCount(projectId?: string): number;
  flush(): Promise<void>;
  destroy(): Promise<void>;
}

function encodeFrame(payload: Uint8Array): Buffer {
  const body = Buffer.from(payload);
  if (body.length < 126) return Buffer.concat([Buffer.from([0x82, body.length]), body]);
  if (body.length <= 0xffff) {
    const header = Buffer.alloc(4);
    header[0] = 0x82;
    header[1] = 126;
    header.writeUInt16BE(body.length, 2);
    return Buffer.concat([header, body]);
  }
  const header = Buffer.alloc(10);
  header[0] = 0x82;
  header[1] = 127;
  header.writeBigUInt64BE(BigInt(body.length), 2);
  return Buffer.concat([header, body]);
}

function headerValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function headerIncludes(value: string | string[] | undefined, expected: string): boolean {
  const normalizedExpected = expected.toLowerCase();
  const values = Array.isArray(value) ? value : [value ?? ''];
  return values.some((entry) => (
    entry
      .toLowerCase()
      .split(',')
      .map((part) => part.trim())
      .includes(normalizedExpected)
  ));
}

function isValidWebSocketKey(value: string | null): value is string {
  if (!value) return false;
  const key = value.trim();
  if (key !== value) return false;
  try {
    const decoded = Buffer.from(key, 'base64');
    return decoded.length === 16 && decoded.toString('base64') === key;
  } catch {
    return false;
  }
}

function isValidRealtimeUpgrade(req: IncomingMessage, key: string | null): key is string {
  return (
    headerIncludes(req.headers.upgrade, 'websocket') &&
    headerIncludes(req.headers.connection, 'upgrade') &&
    headerValue(req.headers['sec-websocket-version']) === WEBSOCKET_VERSION &&
    isValidWebSocketKey(key)
  );
}

function isLoopbackAddress(address: string | undefined): boolean {
  if (!address) return false;
  const normalized = address.trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (normalized.startsWith('::ffff:')) return isLoopbackAddress(normalized.slice('::ffff:'.length));
  return normalized === '127.0.0.1' || normalized.startsWith('127.') || normalized === '::1' || normalized === 'localhost';
}

function isLocalOrigin(value: string | string[] | undefined): boolean {
  const raw = headerValue(value);
  if (!raw) return true;  // no Origin header — native client or same-origin (allow)
  try {
    const url = new URL(raw.trim());
    return url.protocol === 'http:' && isLoopbackAddress(url.hostname);
  } catch {
    return false;
  }
}

function isAuthorizedRealtimeUpgrade(req: IncomingMessage, socket: Socket): boolean {
  // Block if the remote peer is not on the loopback interface.
  if (!isLoopbackAddress(socket.remoteAddress ?? '')) return false;
  // Block if an Origin header is present but is not a local http origin.
  if (!isLocalOrigin(req.headers.origin)) return false;
  return true;
}

function decodeFrame(buffer: Buffer): DecodedFrame {
  if (buffer.length < 2) return { kind: 'incomplete' };
  const opcode = buffer[0]! & 0x0f;
  if (opcode === 0x8) return { kind: 'close', bytesRead: 2 };
  if (opcode !== 0x1 && opcode !== 0x2) return { kind: 'invalid' };
  const masked = (buffer[1]! & 0x80) !== 0;
  let length = buffer[1]! & 0x7f;
  let offset = 2;
  if (length === 126) {
    if (buffer.length < offset + 2) return { kind: 'incomplete' };
    length = buffer.readUInt16BE(offset);
    offset += 2;
  } else if (length === 127) {
    if (buffer.length < offset + 8) return { kind: 'incomplete' };
    const bigLength = buffer.readBigUInt64BE(offset);
    if (bigLength > BigInt(MAX_REALTIME_FRAME_BYTES)) return { kind: 'invalid' };
    length = Number(bigLength);
    offset += 8;
  }
  if (length > MAX_REALTIME_FRAME_BYTES) return { kind: 'invalid' };
  if (!masked) return { kind: 'invalid' };
  if (buffer.length < offset + 4 + length) return { kind: 'incomplete' };
  const mask = buffer.subarray(offset, offset + 4);
  offset += 4;
  const body = Buffer.alloc(length);
  for (let index = 0; index < length; index++) body[index] = buffer[offset + index]! ^ mask[index % 4]!;
  return {
    kind: 'message',
    payload: new Uint8Array(body),
    bytesRead: offset + length,
  };
}

function createSocket(raw: Socket, onClose: () => void): RealtimeSocket {
  const messageHandlers = new Set<(data: RealtimeMessage) => void>();
  const closeHandlers = new Set<() => void>();
  let pending = Buffer.alloc(0);
  raw.setNoDelay(true);
  raw.on('close', () => {
    onClose();
    for (const handler of closeHandlers) handler();
  });
  raw.on('error', () => {
    onClose();
    for (const handler of closeHandlers) handler();
  });
  raw.on('data', (chunk) => {
    pending = Buffer.concat([pending, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]);
    if (pending.length > MAX_REALTIME_FRAME_BYTES + 14) {
      raw.destroy();
      return;
    }
    while (pending.length > 0) {
      const frame = decodeFrame(pending);
      if (frame.kind === 'incomplete') return;
      if (frame.kind === 'invalid') {
        raw.destroy();
        return;
      }
      pending = pending.subarray(frame.bytesRead);
      if (frame.kind === 'close') {
        raw.end();
        return;
      }
      for (const handler of messageHandlers) handler(frame.payload);
    }
  });
  return {
    raw,
    send(data) {
      if (!raw.destroyed) raw.write(encodeFrame(data));
    },
    close() {
      raw.end();
    },
    on(event, listener) {
      if (event === 'message') messageHandlers.add(listener as (data: RealtimeMessage) => void);
      if (event === 'close') closeHandlers.add(listener as () => void);
    },
  };
}

export function createDaemonRealtimeHub(options: RealtimeRelayOptions = {}): DaemonRealtimeHub {
  const relay: RealtimeRelay = createRealtimeRelay(options);
  const clients = new Map<Socket, { projectId: string; transport: RealtimeSocket }>();

  function remove(socket: Socket): void {
    const client = clients.get(socket);
    if (!client) return;
    clients.delete(socket);
    relay.disconnect(client.projectId, client.transport);
  }

  return {
    handleUpgrade(req, socket, head) {
      const host = req.headers.host ?? '127.0.0.1';
      const url = new URL(req.url ?? '/', `http://${host}`);
      if (url.pathname !== '/api/realtime') return false;
      const projectId = url.searchParams.get('projectId')?.trim();
      const key = headerValue(req.headers['sec-websocket-key']);
      if (
        !projectId ||
        !PROJECT_ID_RE.test(projectId) ||
        !isValidRealtimeUpgrade(req, key) ||
        !isAuthorizedRealtimeUpgrade(req, socket)
      ) {
        socket.destroy();
        return true;
      }
      const accept = createHash('sha1')
        .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
        .digest('base64');
      socket.setNoDelay(true);
      socket.write([
        'HTTP/1.1 101 Switching Protocols',
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Accept: ${accept}`,
        '',
        '',
      ].join('\r\n'));
      const transport = createSocket(socket, () => remove(socket));
      clients.set(socket, { projectId, transport });
      void relay.connect(projectId, transport);
      if (head.length > 0) socket.emit('data', head);
      return true;
    },
    clientCount(projectId) {
      if (!projectId) return clients.size;
      return Array.from(clients.values()).filter((client) => client.projectId === projectId).length;
    },
    flush() {
      return relay.flush();
    },
    async destroy() {
      for (const socket of clients.keys()) socket.destroy();
      clients.clear();
      await relay.destroy();
    },
  };
}
