// SPDX-License-Identifier: Apache-2.0

import {
  createRealtimeDocument,
  type RealtimeDocument,
  type RealtimeDocumentOptions,
} from '@ai-game-design-studio/realtime/client';
import {
  bindRealtimeWebSocket,
  type RealtimeWebSocketBinding,
} from '@ai-game-design-studio/realtime/websocket-client';

export interface ProjectRealtimeSession {
  realtime: RealtimeDocument;
  socket: WebSocket;
  binding: RealtimeWebSocketBinding;
  close(): void;
}

export interface ProjectRealtimeSessionOptions extends RealtimeDocumentOptions {
  baseUrl?: string;
  WebSocketCtor?: typeof WebSocket;
}

export function realtimeSocketUrl(projectId: string, baseUrl = window.location.href): string {
  const url = new URL('/api/realtime', baseUrl);
  url.searchParams.set('projectId', projectId);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

export function createProjectRealtimeSession(
  projectId: string,
  options: ProjectRealtimeSessionOptions = {},
): ProjectRealtimeSession {
  const { baseUrl, WebSocketCtor, ...documentOptions } = options;
  const realtime = createRealtimeDocument({
    ...documentOptions,
    guid: documentOptions.guid ?? projectId,
  });
  const Ctor = WebSocketCtor ?? WebSocket;
  const socket = new Ctor(realtimeSocketUrl(projectId, baseUrl));
  const binding = bindRealtimeWebSocket(realtime, socket);
  return {
    realtime,
    socket,
    binding,
    close() {
      binding.disconnect();
      socket.close();
      realtime.awareness.destroy();
      realtime.doc.destroy();
    },
  };
}
