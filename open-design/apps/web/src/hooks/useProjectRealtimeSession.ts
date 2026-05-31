// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from 'react';

import {
  createProjectRealtimeSession,
  type ProjectRealtimeSession,
  type ProjectRealtimeSessionOptions,
} from '../providers/realtime';

const WEBSOCKET_OPEN = 1;

export type ProjectRealtimeStatus = 'idle' | 'connecting' | 'open' | 'closed' | 'error';

export interface ProjectRealtimeHookState {
  session: ProjectRealtimeSession | null;
  status: ProjectRealtimeStatus;
  revision: number;
}

export function useProjectRealtimeSession(
  projectId: string | null | undefined,
  enabled = true,
  options: ProjectRealtimeSessionOptions = {},
): ProjectRealtimeHookState {
  const [state, setState] = useState<ProjectRealtimeHookState>({
    session: null,
    status: enabled && projectId ? 'connecting' : 'idle',
    revision: 0,
  });

  useEffect(() => {
    if (!enabled || !projectId) {
      setState((current) => ({
        session: null,
        status: 'idle',
        revision: current.revision + 1,
      }));
      return;
    }

    const session = createProjectRealtimeSession(projectId, options);
    const bump = (status: ProjectRealtimeStatus): void => {
      setState((current) => ({
        session,
        status,
        revision: current.revision + 1,
      }));
    };
    const onOpen = (): void => bump('open');
    const onClose = (): void => bump('closed');
    const onError = (): void => bump('error');
    const onRealtimeUpdate = (): void => bump(session.socket.readyState === WEBSOCKET_OPEN ? 'open' : 'connecting');

    session.socket.addEventListener('open', onOpen);
    session.socket.addEventListener('close', onClose);
    session.socket.addEventListener('error', onError);
    session.realtime.doc.on('update', onRealtimeUpdate);
    session.realtime.awareness.on('update', onRealtimeUpdate);
    setState((current) => ({
      session,
      status: session.socket.readyState === WEBSOCKET_OPEN ? 'open' : 'connecting',
      revision: current.revision + 1,
    }));

    return () => {
      session.socket.removeEventListener('open', onOpen);
      session.socket.removeEventListener('close', onClose);
      session.socket.removeEventListener('error', onError);
      session.realtime.doc.off('update', onRealtimeUpdate);
      session.realtime.awareness.off('update', onRealtimeUpdate);
      session.close();
    };
    // `options` is intentionally caller-owned; pass stable values for long-lived sessions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, enabled, options.baseUrl, options.WebSocketCtor, options.guid]);

  return state;
}
