// SPDX-License-Identifier: Apache-2.0

import { createHash } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Socket } from 'node:net';
import { URL } from 'node:url';

export type EngineSyncName = 'unity' | 'unreal' | 'godot';

interface UnitySyncClient {
  engine: EngineSyncName;
  projectId: string;
  socket: Socket;
}

type EngineEditType = `${EngineSyncName}-edit`;

export interface EngineEditMessage {
  type: EngineEditType;
  engine: EngineSyncName;
  fileName?: string;
  path?: string;
  value?: unknown;
  engineContent?: string;
  engineDiff?: Array<{ path: string | string[]; value: unknown }>;
  sentAt?: number;
  receivedAt: number;
  latencyBudgetMs: number;
  observedLatencyMs?: number;
  overLatencyBudget?: boolean;
}

export interface UnityEditMessage {
  type: 'unity-edit';
  fileName?: string;
  path?: string;
  value?: unknown;
  unityContent?: string;
  unityDiff?: unknown;
  sentAt?: number;
  receivedAt: number;
  latencyBudgetMs: number;
  observedLatencyMs?: number;
  overLatencyBudget?: boolean;
}

export interface UnitySyncHub {
  handleUpgrade(req: IncomingMessage, socket: Socket, head: Buffer): void;
  broadcastArtifactChanged(projectId: string, payload: unknown): void;
  clientCount(projectId?: string): number;
  clientCountByEngine(engine: EngineSyncName, projectId?: string): number;
}

const MAX_FRAME_BYTES = 1024 * 1024;
const MAX_UNITY_EDIT_FILE_NAME_LENGTH = 260;
const MAX_UNITY_EDIT_PATH_LENGTH = 2048;
const MAX_UNITY_EDIT_VALUE_DEPTH = 16;
const MAX_UNITY_EDIT_VALUE_OBJECT_PROPERTIES = 128;
const MAX_UNITY_EDIT_VALUE_ARRAY_ITEMS = 512;
const MAX_UNITY_EDIT_VALUE_STRING_LENGTH = 4096;
const MAX_UNITY_EDIT_VALUE_PROPERTY_LENGTH = 512;
export const UNITY_ROUND_TRIP_LATENCY_BUDGET_MS = 2000;
const PROJECT_ID_RE = /^[A-Za-z0-9._:-]{1,160}$/;
const CLOSE_FRAME = Buffer.from([0x88, 0x00]);
const FORBIDDEN_PROJECT_PATH_SEGMENTS = new Set(['.', '..', '.live-artifacts']);
const FORBIDDEN_DIFF_PATH_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);
const DEFAULT_SYNC_ENGINES: readonly EngineSyncName[] = ['unity', 'unreal', 'godot'];

export interface DecodedUnityClientFrames {
  messages: string[];
  remaining: Buffer;
  close: boolean;
  protocolError: boolean;
  oversized: boolean;
}

function encodeFrame(payload: string): Buffer {
  const body = Buffer.from(payload, 'utf8');
  if (body.length < 126) return Buffer.concat([Buffer.from([0x81, body.length]), body]);
  if (body.length <= 0xffff) {
    const header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(body.length, 2);
    return Buffer.concat([header, body]);
  }
  const header = Buffer.alloc(10);
  header[0] = 0x81;
  header[1] = 127;
  header.writeBigUInt64BE(BigInt(body.length), 2);
  return Buffer.concat([header, body]);
}

function decodeFrameAt(buffer: Buffer, start: number): {
  incomplete?: boolean;
  close?: boolean;
  protocolError?: boolean;
  oversized?: boolean;
  text?: string;
  nextOffset?: number;
} {
  if (buffer.length - start < 2) return { incomplete: true };
  const opcode = buffer[start]! & 0x0f;
  const masked = (buffer[start + 1]! & 0x80) !== 0;
  let length = buffer[start + 1]! & 0x7f;
  let offset = start + 2;
  if (length === 126) {
    if (buffer.length - start < 4) return { incomplete: true };
    length = buffer.readUInt16BE(offset);
    offset += 2;
  } else if (length === 127) {
    if (buffer.length - start < 10) return { incomplete: true };
    const bigLength = buffer.readBigUInt64BE(offset);
    if (bigLength > BigInt(MAX_FRAME_BYTES)) return { oversized: true };
    length = Number(bigLength);
    offset += 8;
  }
  if (length > MAX_FRAME_BYTES) return { oversized: true };
  if (!masked) return { protocolError: true };
  if (buffer.length < offset + 4 + length) return { incomplete: true };
  const mask = buffer.subarray(offset, offset + 4);
  offset += 4;
  const nextOffset = offset + length;
  if (opcode === 0x8) return { close: true, nextOffset };
  // Ping/pong control frames may be emitted by libraries; ignore them here.
  if (opcode === 0x9 || opcode === 0xa) return { nextOffset };
  if (opcode !== 0x1) return { protocolError: true };
  const body = Buffer.alloc(length);
  for (let index = 0; index < length; index++) body[index] = buffer[offset + index]! ^ mask[index % 4]!;
  return { text: body.toString('utf8'), nextOffset };
}

export function decodeUnityClientFrames(buffer: Buffer): DecodedUnityClientFrames {
  const messages: string[] = [];
  let offset = 0;
  while (offset < buffer.length) {
    const frame = decodeFrameAt(buffer, offset);
    if (frame.incomplete) break;
    if (frame.oversized) {
      return { messages, remaining: Buffer.alloc(0), close: false, protocolError: false, oversized: true };
    }
    if (frame.protocolError) {
      return { messages, remaining: Buffer.alloc(0), close: false, protocolError: true, oversized: false };
    }
    if (frame.close) {
      return { messages, remaining: Buffer.alloc(0), close: true, protocolError: false, oversized: false };
    }
    if (typeof frame.text === 'string') messages.push(frame.text);
    offset = frame.nextOffset ?? buffer.length;
  }
  return {
    messages,
    remaining: offset >= buffer.length ? Buffer.alloc(0) : buffer.subarray(offset),
    close: false,
    protocolError: false,
    oversized: false,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cleanUnityEditFileName(value: unknown): string {
  if (typeof value !== 'string') return '';
  const normalized = value.trim().replace(/\\/g, '/');
  if (
    !normalized
    || normalized.length > MAX_UNITY_EDIT_FILE_NAME_LENGTH
    || normalized.includes('\0')
    || normalized.startsWith('/')
    || /^[A-Za-z]:/u.test(normalized)
  ) {
    return '';
  }
  const parts = normalized.split('/').filter(Boolean);
  if (
    parts.length === 0
    || parts.some((part) => FORBIDDEN_PROJECT_PATH_SEGMENTS.has(part))
    || parts.some((part) => part.length > 120)
  ) {
    return '';
  }
  const clean = parts.join('/');
  const leaf = parts[parts.length - 1]!.toLowerCase();
  if (
    leaf === 'design.md'
    || leaf.endsWith('.design')
    || leaf.endsWith('.gameview')
    || leaf.endsWith('.gameview.json')
    || leaf.endsWith('.levelboard')
    || leaf.endsWith('.levelboard.json')
    || leaf.endsWith('.gbhud')
    || leaf.endsWith('.hud.html')
  ) {
    return clean;
  }
  return '';
}

function cleanUnityEditPath(value: unknown): string {
  if (typeof value !== 'string') return '';
  const clean = value.trim();
  if (!clean || clean.length > MAX_UNITY_EDIT_PATH_LENGTH || clean.includes('\0')) return '';
  const parts = clean
    .replace(/^\$\.?/u, '')
    .split(/[.[\]]/u)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.some((part) => FORBIDDEN_DIFF_PATH_SEGMENTS.has(part))) return '';
  return clean;
}

function isSafeUnityEditValue(value: unknown, depth = 0): boolean {
  if (depth > MAX_UNITY_EDIT_VALUE_DEPTH || value === null || value === undefined) return false;
  if (typeof value === 'string') return value.length <= MAX_UNITY_EDIT_VALUE_STRING_LENGTH;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'boolean') return true;
  if (Array.isArray(value)) {
    if (value.length > MAX_UNITY_EDIT_VALUE_ARRAY_ITEMS) return false;
    return value.every((item) => isSafeUnityEditValue(item, depth + 1));
  }
  if (!isRecord(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const entries = Object.entries(value);
  if (entries.length > MAX_UNITY_EDIT_VALUE_OBJECT_PROPERTIES) return false;
  return entries.every(([key, child]) => (
    isSafeUnityEditValuePropertyName(key) && isSafeUnityEditValue(child, depth + 1)
  ));
}

function isSafeUnityEditValuePropertyName(value: string): boolean {
  if (
    !value.trim()
    || value.length > MAX_UNITY_EDIT_VALUE_PROPERTY_LENGTH
    || FORBIDDEN_DIFF_PATH_SEGMENTS.has(value)
    || value.includes('\0')
    || value.includes('://')
    || value.includes('/')
    || value.includes('\\')
    || value.includes('..')
  ) {
    return false;
  }
  return !/[\u0000-\u001f\u007f]/u.test(value);
}

function cleanUnityDiff(value: unknown): Array<{ path: string | string[]; value: unknown }> | undefined {
  if (!Array.isArray(value)) return undefined;
  const edits: Array<{ path: string | string[]; value: unknown }> = [];
  for (const item of value.slice(0, 64)) {
    if (!isRecord(item)) continue;
    if (!isSafeUnityEditValue(item.value)) continue;
    if (typeof item.path === 'string') {
      const path = cleanUnityEditPath(item.path);
      if (path) edits.push({ path, value: item.value });
      continue;
    }
    if (Array.isArray(item.path)) {
      const rawPath = item.path.map((segment) => String(segment));
      const path = rawPath.map(cleanUnityEditPath);
      if (path.length > 0 && path.every(Boolean)) edits.push({ path, value: item.value });
    }
  }
  return edits.length > 0 ? edits : undefined;
}

function cleanLatencyBudgetMs(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return UNITY_ROUND_TRIP_LATENCY_BUDGET_MS;
  }
  return Math.min(Math.max(1, Math.round(value)), UNITY_ROUND_TRIP_LATENCY_BUDGET_MS);
}

export function normalizeUnityEditMessage(input: unknown, receivedAt = Date.now()): UnityEditMessage | null {
  const message = normalizeEngineEditMessage(input, 'unity', receivedAt);
  if (!message) return null;
  const { engine: _engine, engineContent, engineDiff, type: _type, ...rest } = message;
  return {
    type: 'unity-edit',
    ...rest,
    ...(engineContent !== undefined ? { unityContent: engineContent } : {}),
    ...(engineDiff !== undefined ? { unityDiff: engineDiff } : {}),
  };
}

export function normalizeEngineEditMessage(
  input: unknown,
  engine: EngineSyncName,
  receivedAt = Date.now(),
): EngineEditMessage | null {
  if (!isRecord(input) || input.type !== `${engine}-edit`) return null;
  const fileName = cleanUnityEditFileName(input.fileName);
  const editPath = cleanUnityEditPath(input.path);
  const contentKey = `${engine}Content`;
  const diffKey = `${engine}Diff`;
  const engineContent = typeof input.engineContent === 'string'
    ? input.engineContent
    : typeof input[contentKey] === 'string'
      ? input[contentKey]
      : typeof input.unityContent === 'string'
        ? input.unityContent
        : undefined;
  const hasValue = Object.hasOwn(input, 'value');
  if (hasValue && !isSafeUnityEditValue(input.value)) return null;
  const engineDiff = cleanUnityDiff(input.engineDiff ?? input[diffKey] ?? input.unityDiff);
  if (!fileName || (engineContent === undefined && !engineDiff && !editPath)) return null;
  const latencyBudgetMs = cleanLatencyBudgetMs(input.latencyBudgetMs);
  const sentAt = typeof input.sentAt === 'number' && Number.isFinite(input.sentAt) ? input.sentAt : undefined;
  const observedLatencyMs = sentAt === undefined ? undefined : Math.max(0, Math.round(receivedAt - sentAt));
  return {
    type: `${engine}-edit`,
    engine,
    fileName,
    ...(editPath ? { path: editPath } : {}),
    ...(hasValue ? { value: input.value } : {}),
    ...(engineContent !== undefined ? { engineContent } : {}),
    ...(engineDiff !== undefined ? { engineDiff } : {}),
    ...(sentAt !== undefined ? { sentAt } : {}),
    receivedAt,
    latencyBudgetMs,
    ...(observedLatencyMs !== undefined ? {
      observedLatencyMs,
      overLatencyBudget: observedLatencyMs > latencyBudgetMs,
    } : {}),
  };
}

function engineForSyncPath(pathname: string, engines: readonly EngineSyncName[]): EngineSyncName | undefined {
  const match = pathname.match(/^\/api\/sync\/(unity|unreal|godot)$/u);
  const engine = match?.[1] as EngineSyncName | undefined;
  return engine && engines.includes(engine) ? engine : undefined;
}

export function createUnitySyncHub(
  onUnityEdit?: (projectId: string, message: unknown) => void,
  options: { engines?: readonly EngineSyncName[] } = {},
): UnitySyncHub {
  const clients = new Set<UnitySyncClient>();
  const engines = options.engines ?? DEFAULT_SYNC_ENGINES;

  function remove(socket: Socket): void {
    for (const client of Array.from(clients)) {
      if (client.socket === socket) clients.delete(client);
    }
  }

  return {
    handleUpgrade(req, socket, head) {
      const host = req.headers.host ?? '127.0.0.1';
      const url = new URL(req.url ?? '/', `http://${host}`);
      const engine = engineForSyncPath(url.pathname, engines);
      if (!engine) {
        socket.destroy();
        return;
      }
      const projectId = url.searchParams.get('projectId')?.trim();
      const key = req.headers['sec-websocket-key'];
      if (!projectId || !PROJECT_ID_RE.test(projectId) || typeof key !== 'string') {
        socket.destroy();
        return;
      }
      const accept = createHash('sha1')
        .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
        .digest('base64');
      socket.write([
        'HTTP/1.1 101 Switching Protocols',
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Accept: ${accept}`,
        '',
        '',
      ].join('\r\n'));
      const client = { engine, projectId, socket };
      let pending: Buffer = Buffer.alloc(0);
      clients.add(client);
      socket.on('close', () => remove(socket));
      socket.on('error', () => remove(socket));
      socket.on('data', (chunk) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        pending = pending.length > 0 ? Buffer.concat([pending, buffer]) : buffer;
        const decoded = decodeUnityClientFrames(pending);
        pending = decoded.remaining;
        if (decoded.oversized || decoded.protocolError || pending.length > MAX_FRAME_BYTES + 14) {
          socket.destroy();
          return;
        }
        if (decoded.close) {
          remove(socket);
          if (!socket.destroyed) socket.write(CLOSE_FRAME);
          socket.end();
          return;
        }
        for (const text of decoded.messages) {
          try {
            const message = normalizeEngineEditMessage(JSON.parse(text), engine);
            if (message) onUnityEdit?.(projectId, message);
          } catch {
            // Ignore malformed Unity sync messages rather than rebroadcasting
            // arbitrary text into project event streams.
          }
        }
      });
      if (head.length > 0) socket.emit('data', head);
    },
    broadcastArtifactChanged(projectId, payload) {
      const message = encodeFrame(JSON.stringify({ type: 'artifact-changed', projectId, payload, sentAt: Date.now() }));
      for (const client of Array.from(clients)) {
        if (client.projectId !== projectId) continue;
        if (client.socket.destroyed) {
          clients.delete(client);
          continue;
        }
        client.socket.write(message);
      }
    },
    clientCount(projectId) {
      if (!projectId) return clients.size;
      return Array.from(clients).filter((client) => client.projectId === projectId).length;
    },
    clientCountByEngine(engine, projectId) {
      return Array.from(clients).filter((client) => (
        client.engine === engine && (!projectId || client.projectId === projectId)
      )).length;
    },
  };
}
