// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import { createRealtimeDocument } from "../src/client.js";
import { listPresenceStates, setLocalPresence } from "../src/awareness.js";
import { createRealtimeRelay, type RealtimeMessage, type RealtimeTransportSocket } from "../src/server.js";
import { bindRealtimeWebSocket, type RealtimeWebSocketLike, type RealtimeWebSocketMessageEvent } from "../src/websocket-client.js";

type SocketEvent = "open" | "message" | "close" | "error";
type SocketListener = (() => void) | ((event: RealtimeWebSocketMessageEvent) => void);

class BrowserSocketMock implements RealtimeWebSocketLike {
  binaryType?: BinaryType;
  readyState = 0;
  onSend: (data: Uint8Array) => void = () => {};
  private listeners = new Map<SocketEvent, Set<SocketListener>>();

  addEventListener(event: SocketEvent, listener: SocketListener): void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(listener);
  }

  removeEventListener(event: SocketEvent, listener: SocketListener): void {
    this.listeners.get(event)?.delete(listener);
  }

  open(): void {
    this.readyState = 1;
    this.dispatch("open");
  }

  send(data: Uint8Array): void {
    this.onSend(data);
  }

  receive(data: Uint8Array): void {
    this.dispatch("message", { data });
  }

  close(): void {
    this.readyState = 3;
    this.dispatch("close");
  }

  private dispatch(event: "message", payload: RealtimeWebSocketMessageEvent): void;
  private dispatch(event: Exclude<SocketEvent, "message">): void;
  private dispatch(event: SocketEvent, payload?: RealtimeWebSocketMessageEvent): void {
    for (const listener of this.listeners.get(event) ?? []) {
      if (event === "message") {
        (listener as (message: RealtimeWebSocketMessageEvent) => void)(payload!);
      } else {
        (listener as () => void)();
      }
    }
  }
}

class RelaySocket implements RealtimeTransportSocket {
  private messageHandlers = new Set<(data: RealtimeMessage) => void>();
  private closeHandlers = new Set<() => void>();

  constructor(private readonly browserSocket: BrowserSocketMock) {}

  send(data: Uint8Array): void {
    this.browserSocket.receive(data);
  }

  on(event: "message", listener: (data: RealtimeMessage) => void): void;
  on(event: "close", listener: () => void): void;
  on(event: "message" | "close", listener: ((data: RealtimeMessage) => void) | (() => void)): void {
    if (event === "message") this.messageHandlers.add(listener as (data: RealtimeMessage) => void);
    if (event === "close") this.closeHandlers.add(listener as () => void);
  }

  emitMessage(data: Uint8Array): void {
    for (const handler of this.messageHandlers) handler(data);
  }

  close(): void {
    for (const handler of this.closeHandlers) handler();
  }
}

describe("bindRealtimeWebSocket", () => {
  it("syncs artifact text edits between browser clients through the relay", async () => {
    const relay = createRealtimeRelay();
    const clientA = createRealtimeDocument({ guid: "client-a" });
    const clientB = createRealtimeDocument({ guid: "client-b" });
    const socketA = new BrowserSocketMock();
    const socketB = new BrowserSocketMock();
    const relaySocketA = new RelaySocket(socketA);
    const relaySocketB = new RelaySocket(socketB);
    socketA.onSend = (data) => relaySocketA.emitMessage(data);
    socketB.onSend = (data) => relaySocketB.emitMessage(data);
    await relay.connect("project-1", relaySocketA);
    await relay.connect("project-1", relaySocketB);
    const bindingA = bindRealtimeWebSocket(clientA, socketA);
    const bindingB = bindRealtimeWebSocket(clientB, socketB);

    socketA.open();
    socketB.open();
    clientA.activeArtifact.insert(0, "<main>boss arena</main>");
    clientA.activeArtifact.insert(clientA.activeArtifact.length, "\n<!-- tuned -->");

    expect(clientB.activeArtifact.toString()).toContain("tuned");
    bindingA.disconnect();
    bindingB.disconnect();
    await relay.destroy();
  });

  it("relays human and agent awareness state through the same socket binding", async () => {
    const relay = createRealtimeRelay();
    const humanDoc = createRealtimeDocument({ guid: "human-client" });
    const agentDoc = createRealtimeDocument({ guid: "agent-client" });
    const observerDoc = createRealtimeDocument({ guid: "observer-client" });
    const humanSocket = new BrowserSocketMock();
    const agentSocket = new BrowserSocketMock();
    const observerSocket = new BrowserSocketMock();
    const humanRelaySocket = new RelaySocket(humanSocket);
    const agentRelaySocket = new RelaySocket(agentSocket);
    const observerRelaySocket = new RelaySocket(observerSocket);
    humanSocket.onSend = (data) => humanRelaySocket.emitMessage(data);
    agentSocket.onSend = (data) => agentRelaySocket.emitMessage(data);
    observerSocket.onSend = (data) => observerRelaySocket.emitMessage(data);
    await relay.connect("project-2", humanRelaySocket);
    await relay.connect("project-2", agentRelaySocket);
    await relay.connect("project-2", observerRelaySocket);
    const humanBinding = bindRealtimeWebSocket(humanDoc, humanSocket);
    const agentBinding = bindRealtimeWebSocket(agentDoc, agentSocket);
    const observerBinding = bindRealtimeWebSocket(observerDoc, observerSocket);

    humanSocket.open();
    agentSocket.open();
    observerSocket.open();
    setLocalPresence(humanDoc.awareness, {
      userId: "director-1",
      name: "Creative Director",
      color: "#FF6B35",
      kind: "human",
      cursor: { surface: "artifact", path: "/main", x: 10, y: 20 },
      updatedAt: 10,
    });
    setLocalPresence(agentDoc.awareness, {
      userId: "agent-1",
      name: "Greybox Agent",
      color: "#3CC2E0",
      kind: "agent",
      agent: { writing: true, label: "AGENT" },
      updatedAt: 11,
    });

    expect(listPresenceStates(observerDoc.awareness)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userId: "director-1",
          kind: "human",
          cursor: expect.objectContaining({ path: "/main" }),
        }),
        expect.objectContaining({
          userId: "agent-1",
          kind: "agent",
          agent: expect.objectContaining({ writing: true }),
        }),
      ]),
    );
    humanBinding.disconnect();
    agentBinding.disconnect();
    observerBinding.disconnect();
    await relay.destroy();
  });
});
