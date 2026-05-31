// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createProjectRealtimeSession, realtimeSocketUrl } from '../../src/providers/realtime';
import { useProjectRealtimeSession } from '../../src/hooks/useProjectRealtimeSession';

type SocketEvent = 'open' | 'message' | 'close' | 'error';
type SocketListener = ((event?: { data?: Uint8Array }) => void);

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static OPEN = 1;
  binaryType?: BinaryType;
  readyState = 0;
  sent: Uint8Array[] = [];
  closed = false;
  listeners = new Map<SocketEvent, Set<SocketListener>>();

  constructor(public readonly url: string) {
    MockWebSocket.instances.push(this);
  }

  addEventListener(event: SocketEvent, listener: SocketListener): void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(listener);
  }

  removeEventListener(event: SocketEvent, listener: SocketListener): void {
    this.listeners.get(event)?.delete(listener);
  }

  send(data: Uint8Array): void {
    this.sent.push(data);
  }

  close(): void {
    this.closed = true;
    this.readyState = 3;
    this.dispatch('close');
  }

  open(): void {
    this.readyState = MockWebSocket.OPEN;
    this.dispatch('open');
  }

  dispatch(event: SocketEvent, payload?: { data?: Uint8Array }): void {
    for (const listener of this.listeners.get(event) ?? []) listener(payload);
  }
}

afterEach(() => {
  cleanup();
  MockWebSocket.instances = [];
  vi.restoreAllMocks();
});

describe('realtimeSocketUrl', () => {
  it('targets the daemon realtime endpoint over ws or wss', () => {
    expect(realtimeSocketUrl('project 1', 'http://127.0.0.1:3000/project')).toBe(
      'ws://127.0.0.1:3000/api/realtime?projectId=project+1',
    );
    expect(realtimeSocketUrl('p2', 'https://greybox.local/projects/p2')).toBe(
      'wss://greybox.local/api/realtime?projectId=p2',
    );
  });
});

describe('createProjectRealtimeSession', () => {
  it('keeps browser transport options separate from realtime document seed options', () => {
    const session = createProjectRealtimeSession('p1', {
      baseUrl: 'http://127.0.0.1:4000/',
      WebSocketCtor: MockWebSocket as unknown as typeof WebSocket,
      initialArtifactHtml: '<main>Playable slice</main>',
      initialDesignMarkdown: '# Design\n\nShip the loop.',
    });

    expect(MockWebSocket.instances[0]?.url).toBe('ws://127.0.0.1:4000/api/realtime?projectId=p1');
    expect(session.realtime.activeArtifact.toString()).toBe('<main>Playable slice</main>');
    expect(session.realtime.designMarkdown.toString()).toBe('# Design\n\nShip the loop.');

    session.close();
  });
});

describe('useProjectRealtimeSession', () => {
  it('opens a realtime session and increments revision for document edits', async () => {
    const { result, unmount } = renderHook(() => useProjectRealtimeSession('p1', true, {
      baseUrl: 'http://127.0.0.1:4000/',
      WebSocketCtor: MockWebSocket as unknown as typeof WebSocket,
    }));

    await waitFor(() => expect(result.current.session).not.toBeNull());
    const socket = MockWebSocket.instances[0]!;
    expect(socket.url).toBe('ws://127.0.0.1:4000/api/realtime?projectId=p1');
    expect(result.current.status).toBe('connecting');

    act(() => socket.open());
    expect(result.current.status).toBe('open');
    const openedRevision = result.current.revision;

    act(() => {
      result.current.session!.realtime.activeArtifact.insert(0, '<main>sync</main>');
    });

    expect(result.current.revision).toBeGreaterThan(openedRevision);
    expect(socket.sent.length).toBeGreaterThan(0);

    unmount();
    expect(socket.closed).toBe(true);
  });

  it('stays idle when realtime is disabled', () => {
    const { result } = renderHook(() => useProjectRealtimeSession('p1', false, {
      WebSocketCtor: MockWebSocket as unknown as typeof WebSocket,
    }));

    expect(result.current.status).toBe('idle');
    expect(result.current.session).toBeNull();
    expect(MockWebSocket.instances).toHaveLength(0);
  });
});
