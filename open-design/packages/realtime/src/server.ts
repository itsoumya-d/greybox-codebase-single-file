// SPDX-License-Identifier: Apache-2.0

import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import * as awarenessProtocol from "y-protocols/awareness";
import type { Awareness } from "y-protocols/awareness";
import * as syncProtocol from "y-protocols/sync";

import { createRealtimeDocument, type RealtimeDocument } from "./client.js";
import { createSnapshotScheduler, restoreSnapshot, type RealtimeSnapshotStore, type SnapshotScheduler } from "./persistence.js";
import {
  decodeRealtimeMessage,
  Y_WEBSOCKET_MESSAGE_AWARENESS,
  Y_WEBSOCKET_MESSAGE_SYNC,
  type RealtimeMessage,
} from "./protocol.js";

export * from "./protocol.js";

export interface RealtimeTransportSocket {
  send(data: Uint8Array): void;
  close?(code?: number, reason?: string): void;
  on?(event: "message", listener: (data: RealtimeMessage) => void): void;
  on?(event: "close", listener: () => void): void;
}

export interface RealtimeRelayRoom {
  projectId: string;
  realtime: RealtimeDocument;
  sockets: Set<RealtimeTransportSocket>;
}

export interface RealtimeRelayOptions {
  snapshotStore?: RealtimeSnapshotStore;
  snapshotIntervalMs?: number;
}

export interface RealtimeRelay {
  getRoom(projectId: string): RealtimeRelayRoom;
  connect(projectId: string, socket: RealtimeTransportSocket): Promise<void>;
  disconnect(projectId: string, socket: RealtimeTransportSocket): void;
  handleMessage(projectId: string, socket: RealtimeTransportSocket, data: RealtimeMessage): void;
  flush(): Promise<void>;
  destroy(): Promise<void>;
}

interface InternalRoom extends RealtimeRelayRoom {
  awarenessClients: Map<RealtimeTransportSocket, Set<number>>;
  scheduler?: SnapshotScheduler;
  restored?: Promise<void>;
}

export function createRealtimeRelay(options: RealtimeRelayOptions = {}): RealtimeRelay {
  const rooms = new Map<string, InternalRoom>();

  function getRoom(projectId: string): InternalRoom {
    const existing = rooms.get(projectId);
    if (existing) return existing;
    const realtime = createRealtimeDocument({ guid: projectId });
    const room: InternalRoom = {
      awarenessClients: new Map(),
      projectId,
      realtime,
      sockets: new Set(),
    };
    room.realtime.doc.on("update", (update: Uint8Array, origin: unknown) => {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, Y_WEBSOCKET_MESSAGE_SYNC);
      syncProtocol.writeUpdate(encoder, update);
      broadcast(room, encoding.toUint8Array(encoder), origin);
    });
    room.realtime.awareness.on("update", ({ added, updated, removed }: AwarenessChange, origin: unknown) => {
      const changedClients = added.concat(updated, removed);
      if (changedClients.length === 0) return;
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, Y_WEBSOCKET_MESSAGE_AWARENESS);
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(room.realtime.awareness, changedClients),
      );
      broadcast(room, encoding.toUint8Array(encoder), origin);
    });
    if (options.snapshotStore) {
      room.restored = restoreSnapshot(room.realtime.doc, options.snapshotStore, projectId).then(() => undefined);
      room.scheduler = createSnapshotScheduler({
        projectId,
        doc: room.realtime.doc,
        store: options.snapshotStore,
        intervalMs: options.snapshotIntervalMs,
      });
    }
    rooms.set(projectId, room);
    return room;
  }

  async function connect(projectId: string, socket: RealtimeTransportSocket): Promise<void> {
    const room = getRoom(projectId);
    await room.restored;
    room.sockets.add(socket);
    socket.on?.("message", (data) => handleMessage(projectId, socket, data));
    socket.on?.("close", () => disconnect(projectId, socket));
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, Y_WEBSOCKET_MESSAGE_SYNC);
    syncProtocol.writeSyncStep1(encoder, room.realtime.doc);
    socket.send(encoding.toUint8Array(encoder));
  }

  function disconnect(projectId: string, socket: RealtimeTransportSocket): void {
    const room = rooms.get(projectId);
    if (!room) return;
    const clientIds = awarenessClientIdsOwnedBySocket(room, socket);
    room.awarenessClients.delete(socket);
    room.sockets.delete(socket);
    if (clientIds.length > 0) {
      awarenessProtocol.removeAwarenessStates(room.realtime.awareness, clientIds, socket);
    }
    if (room.sockets.size === 0) {
      void room.scheduler?.flush();
    }
  }

  function handleMessage(projectId: string, socket: RealtimeTransportSocket, data: RealtimeMessage): void {
    const room = getRoom(projectId);
    try {
      const { decoder, messageType } = decodeRealtimeMessage(data);
      if (messageType === Y_WEBSOCKET_MESSAGE_SYNC) {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, Y_WEBSOCKET_MESSAGE_SYNC);
        syncProtocol.readSyncMessage(decoder, encoder, room.realtime.doc, socket);
        const reply = encoding.toUint8Array(encoder);
        if (reply.length > 1) socket.send(reply);
        return;
      }
      if (messageType === Y_WEBSOCKET_MESSAGE_AWARENESS) {
        const update = decoding.readVarUint8Array(decoder);
        rememberSocketAwarenessClients(room, socket, update);
        awarenessProtocol.applyAwarenessUpdate(
          room.realtime.awareness,
          update,
          socket,
        );
      }
    } catch {
      socket.close?.(1003, "bad realtime message");
    }
  }

  async function flush(): Promise<void> {
    await Promise.all([...rooms.values()].map(async (room) => {
      await room.restored;
      await room.scheduler?.flush();
    }));
  }

  return {
    getRoom,
    connect,
    disconnect,
    handleMessage,
    flush,
    async destroy() {
      await flush();
      for (const room of rooms.values()) {
        room.scheduler?.stop();
        room.sockets.clear();
        room.awarenessClients.clear();
        room.realtime.doc.destroy();
        room.realtime.awareness.destroy();
      }
      rooms.clear();
    },
  };
}

interface AwarenessChange {
  added: number[];
  updated: number[];
  removed: number[];
}

function broadcast(room: RealtimeRelayRoom, data: Uint8Array, origin: unknown): void {
  for (const socket of room.sockets) {
    if (socket === origin) continue;
    socket.send(data);
  }
}

function rememberSocketAwarenessClients(
  room: InternalRoom,
  socket: RealtimeTransportSocket,
  update: Uint8Array,
): void {
  const clientIds = awarenessClientIdsFromUpdate(update);
  if (clientIds.length === 0) return;
  const tracked = room.awarenessClients.get(socket) ?? new Set<number>();
  for (const clientId of clientIds) tracked.add(clientId);
  room.awarenessClients.set(socket, tracked);
}

function awarenessClientIdsOwnedBySocket(
  room: InternalRoom,
  socket: RealtimeTransportSocket,
): number[] {
  const tracked = room.awarenessClients.get(socket);
  if (!tracked) return [];
  return [...tracked].filter((clientId) => {
    for (const [otherSocket, otherClientIds] of room.awarenessClients) {
      if (otherSocket !== socket && otherClientIds.has(clientId)) return false;
    }
    return true;
  });
}

function awarenessClientIdsFromUpdate(update: Uint8Array): number[] {
  try {
    const decoder = decoding.createDecoder(update);
    const count = decoding.readVarUint(decoder);
    const clientIds: number[] = [];
    for (let index = 0; index < count; index += 1) {
      const clientId = decoding.readVarUint(decoder);
      decoding.readVarUint(decoder);
      decoding.readVarString(decoder);
      clientIds.push(clientId);
    }
    return clientIds;
  } catch {
    return [];
  }
}

export function applyServerAwarenessState(awareness: Awareness, update: Uint8Array, origin?: unknown): void {
  awarenessProtocol.applyAwarenessUpdate(awareness, update, origin);
}
