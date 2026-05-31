// SPDX-License-Identifier: Apache-2.0

import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import * as awarenessProtocol from "y-protocols/awareness";
import * as syncProtocol from "y-protocols/sync";
import * as Y from "yjs";

import type { RealtimeDocument } from "./client.js";
import {
  decodeRealtimeMessage,
  Y_WEBSOCKET_MESSAGE_AWARENESS,
  Y_WEBSOCKET_MESSAGE_SYNC,
  type RealtimeMessage,
} from "./protocol.js";

export interface RealtimeWebSocketLike {
  binaryType?: BinaryType;
  readyState: number;
  send(data: Uint8Array): void;
  close(code?: number, reason?: string): void;
  addEventListener(event: "open", listener: () => void): void;
  addEventListener(event: "message", listener: (event: RealtimeWebSocketMessageEvent) => void): void;
  addEventListener(event: "close", listener: () => void): void;
  addEventListener(event: "error", listener: () => void): void;
  removeEventListener(event: "open", listener: () => void): void;
  removeEventListener(event: "message", listener: (event: RealtimeWebSocketMessageEvent) => void): void;
  removeEventListener(event: "close", listener: () => void): void;
  removeEventListener(event: "error", listener: () => void): void;
}

export interface RealtimeWebSocketMessageEvent {
  data: RealtimeMessage;
}

export interface RealtimeWebSocketBinding {
  disconnect(): void;
}

const WEBSOCKET_OPEN = 1;

export function bindRealtimeWebSocket(
  realtime: RealtimeDocument,
  socket: RealtimeWebSocketLike,
): RealtimeWebSocketBinding {
  socket.binaryType = "arraybuffer";
  let connected = true;

  const send = (data: Uint8Array): void => {
    if (connected && socket.readyState === WEBSOCKET_OPEN) socket.send(data);
  };

  const sendSyncStep1 = (): void => {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, Y_WEBSOCKET_MESSAGE_SYNC);
    syncProtocol.writeSyncStep1(encoder, realtime.doc);
    send(encoding.toUint8Array(encoder));
  };

  const sendFullDocumentState = (): void => {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, Y_WEBSOCKET_MESSAGE_SYNC);
    syncProtocol.writeUpdate(encoder, Y.encodeStateAsUpdate(realtime.doc));
    send(encoding.toUint8Array(encoder));
  };

  const sendLocalAwareness = (): void => {
    const localState = realtime.awareness.getLocalState();
    if (!localState) return;
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, Y_WEBSOCKET_MESSAGE_AWARENESS);
    encoding.writeVarUint8Array(
      encoder,
      awarenessProtocol.encodeAwarenessUpdate(realtime.awareness, [realtime.doc.clientID]),
    );
    send(encoding.toUint8Array(encoder));
  };

  const onOpen = (): void => {
    sendSyncStep1();
    sendFullDocumentState();
    sendLocalAwareness();
  };

  const onDocUpdate = (update: Uint8Array, origin: unknown): void => {
    if (origin === socket) return;
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, Y_WEBSOCKET_MESSAGE_SYNC);
    syncProtocol.writeUpdate(encoder, update);
    send(encoding.toUint8Array(encoder));
  };

  const onAwarenessUpdate = (
    { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ): void => {
    if (origin === socket) return;
    const changedClients = added.concat(updated, removed);
    if (changedClients.length === 0) return;
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, Y_WEBSOCKET_MESSAGE_AWARENESS);
    encoding.writeVarUint8Array(
      encoder,
      awarenessProtocol.encodeAwarenessUpdate(realtime.awareness, changedClients),
    );
    send(encoding.toUint8Array(encoder));
  };

  const onMessage = (event: RealtimeWebSocketMessageEvent): void => {
    try {
      const { decoder, messageType } = decodeRealtimeMessage(event.data);
      if (messageType === Y_WEBSOCKET_MESSAGE_SYNC) {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, Y_WEBSOCKET_MESSAGE_SYNC);
        syncProtocol.readSyncMessage(decoder, encoder, realtime.doc, socket);
        const reply = encoding.toUint8Array(encoder);
        if (reply.length > 1) send(reply);
        return;
      }
      if (messageType === Y_WEBSOCKET_MESSAGE_AWARENESS) {
        awarenessProtocol.applyAwarenessUpdate(
          realtime.awareness,
          decoding.readVarUint8Array(decoder),
          socket,
        );
      }
    } catch {
      socket.close(1003, "bad realtime message");
    }
  };

  const onClose = (): void => {
    connected = false;
  };

  realtime.doc.on("update", onDocUpdate);
  realtime.awareness.on("update", onAwarenessUpdate);
  socket.addEventListener("open", onOpen);
  socket.addEventListener("message", onMessage);
  socket.addEventListener("close", onClose);
  socket.addEventListener("error", onClose);
  if (socket.readyState === WEBSOCKET_OPEN) onOpen();

  return {
    disconnect() {
      connected = false;
      realtime.doc.off("update", onDocUpdate);
      realtime.awareness.off("update", onAwarenessUpdate);
      socket.removeEventListener("open", onOpen);
      socket.removeEventListener("message", onMessage);
      socket.removeEventListener("close", onClose);
      socket.removeEventListener("error", onClose);
    },
  };
}
