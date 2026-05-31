// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import * as Y from "yjs";

import {
  activeSectionLocks,
  addPinnedComment,
  appendPinnedCommentReply,
  claimTodoPlanItem,
  createRealtimeDocument,
  extractMarkdownSections,
  isPinnedCommentResolved,
  listPinnedComments,
  listTodoPlanItems,
  lockMarkdownSection,
  releaseExpiredSectionLocks,
  releaseSectionLocksForHolder,
  releaseTodoPlanItem,
  resolvePinnedCommentThread,
  syncTodoPlanItems,
  todoPlanItemId,
  tryLockMarkdownSection,
} from "../src/client.js";
import { setLocalPresence, summarizePresence, summarizePresenceStates } from "../src/awareness.js";
import { mergeGameArtifact } from "../src/conflict-resolver.js";
import { createSnapshotScheduler, encodeSnapshot, restoreSnapshot, type RealtimeSnapshot, type RealtimeSnapshotStore } from "../src/persistence.js";
import {
  decodeRealtimeMessage,
  createRealtimeRelay,
  isYWebSocketMessageType,
  Y_WEBSOCKET_MESSAGE_AWARENESS,
  Y_WEBSOCKET_MESSAGE_SYNC,
  type RealtimeTransportSocket,
} from "../src/server.js";
import { bindRealtimeWebSocket, type RealtimeWebSocketLike, type RealtimeWebSocketMessageEvent } from "../src/websocket-client.js";

class MemorySocket implements RealtimeTransportSocket {
  received: Uint8Array[] = [];
  closed = false;
  closeCode?: number;
  closeReason?: string;
  private messageHandlers: Array<(data: Uint8Array) => void> = [];
  private closeHandlers: Array<() => void> = [];

  send(data: Uint8Array): void {
    this.received.push(data);
  }

  on(event: "message", listener: (data: Uint8Array) => void): void;
  on(event: "close", listener: () => void): void;
  on(event: "message" | "close", listener: ((data: Uint8Array) => void) | (() => void)): void {
    if (event === "message") this.messageHandlers.push(listener as (data: Uint8Array) => void);
    if (event === "close") this.closeHandlers.push(listener as () => void);
  }

  emitMessage(data: Uint8Array): void {
    for (const handler of this.messageHandlers) handler(data);
  }

  close(code?: number, reason?: string): void {
    this.closed = true;
    this.closeCode = code;
    this.closeReason = reason;
    for (const handler of this.closeHandlers) handler();
  }
}

type BrowserSocketEvent = "open" | "message" | "close" | "error";
type BrowserSocketListener = (() => void) | ((event: RealtimeWebSocketMessageEvent) => void);

class BrowserSocketMock implements RealtimeWebSocketLike {
  binaryType?: BinaryType;
  readyState = 1;
  sent: Uint8Array[] = [];
  closed = false;
  closeCode?: number;
  closeReason?: string;
  private listeners = new Map<BrowserSocketEvent, Set<BrowserSocketListener>>();

  send(data: Uint8Array): void {
    this.sent.push(data);
  }

  close(code?: number, reason?: string): void {
    this.closed = true;
    this.closeCode = code;
    this.closeReason = reason;
    this.dispatch("close");
  }

  addEventListener(event: BrowserSocketEvent, listener: BrowserSocketListener): void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(listener);
  }

  removeEventListener(event: BrowserSocketEvent, listener: BrowserSocketListener): void {
    this.listeners.get(event)?.delete(listener);
  }

  receive(data: Uint8Array): void {
    this.dispatch("message", { data });
  }

  private dispatch(event: "message", payload: RealtimeWebSocketMessageEvent): void;
  private dispatch(event: Exclude<BrowserSocketEvent, "message">): void;
  private dispatch(event: BrowserSocketEvent, payload?: RealtimeWebSocketMessageEvent): void {
    for (const listener of this.listeners.get(event) ?? []) {
      if (event === "message") {
        (listener as (message: RealtimeWebSocketMessageEvent) => void)(payload!);
      } else {
        (listener as () => void)();
      }
    }
  }
}

describe("@ai-game-design-studio/realtime", () => {
  it("syncs Yjs artifact edits between two y-websocket clients", async () => {
    const relay = createRealtimeRelay();
    const socketA = new MemorySocket();
    const socketB = new MemorySocket();
    await relay.connect("project-1", socketA);
    await relay.connect("project-1", socketB);

    const clientA = new Y.Doc();
    const clientB = new Y.Doc();
    clientA.on("update", (update: Uint8Array) => socketA.emitMessage(encodeSyncUpdate(update)));
    clientB.on("update", (update: Uint8Array) => socketB.emitMessage(encodeSyncUpdate(update)));
    flushClientMessages(clientA, socketA);
    flushClientMessages(clientB, socketB);

    const artifact = clientA.getText("activeArtifact");
    artifact.insert(0, "<main>boss arena</main>");
    artifact.insert(artifact.length, "\n<!-- tuned -->");
    flushClientMessages(clientB, socketB);

    expect(clientB.getText("activeArtifact").toString()).toContain("tuned");
    await relay.destroy();
  });

  it("reconciles 1000 simultaneous artifact text edits without data loss", async () => {
    const relay = createRealtimeRelay();
    const socketA = new MemorySocket();
    const socketB = new MemorySocket();
    await relay.connect("project-1000-edits", socketA);
    await relay.connect("project-1000-edits", socketB);

    const clientA = new Y.Doc();
    const clientB = new Y.Doc();
    clientA.on("update", (update: Uint8Array) => socketA.emitMessage(encodeSyncUpdate(update)));
    clientB.on("update", (update: Uint8Array) => socketB.emitMessage(encodeSyncUpdate(update)));
    drainClientMessages(clientA, socketA, clientB, socketB);

    const artifactA = clientA.getText("activeArtifact");
    const artifactB = clientB.getText("activeArtifact");
    const expectedTokens: string[] = [];
    for (let index = 0; index < 500; index += 1) {
      const tokenA = `[A${index}]`;
      const tokenB = `[B${index}]`;
      expectedTokens.push(tokenA, tokenB);
      artifactA.insert(artifactA.length, tokenA);
      artifactB.insert(artifactB.length, tokenB);
    }

    drainClientMessages(clientA, socketA, clientB, socketB);

    const finalA = artifactA.toString();
    const finalB = artifactB.toString();
    expect(finalA).toBe(finalB);
    for (const token of expectedTokens) {
      expect(finalA).toContain(token);
    }
    expect(finalA.match(/\[[AB]\d+\]/g)).toHaveLength(1000);
    await relay.destroy();
  });

  it("relays human and agent awareness state", async () => {
    const relay = createRealtimeRelay();
    const socketA = new MemorySocket();
    const socketB = new MemorySocket();
    await relay.connect("project-2", socketA);
    await relay.connect("project-2", socketB);

    const docA = createRealtimeDocument({ guid: "client-a" });
    const docB = createRealtimeDocument({ guid: "client-b" });
    docA.awareness.setLocalState({
      userId: "agent-1",
      name: "Greybox Agent",
      color: "#3CC2E0",
      kind: "agent",
      agent: { writing: true, label: "AGENT" },
      updatedAt: 1,
    });

    socketA.emitMessage(encodeAwareness(docA.awareness, [docA.doc.clientID]));
    flushAwarenessMessages(docB.awareness, socketB);

    const states = Array.from(docB.awareness.getStates().values());
    expect(states).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userId: "agent-1",
          kind: "agent",
          agent: expect.objectContaining({ writing: true }),
        }),
      ]),
    );
    await relay.destroy();
  });

  it("summarizes avatars, overflow, and AGENT writing presence", () => {
    const doc = createRealtimeDocument({ guid: "presence-summary" });
    setLocalPresence(doc.awareness, {
      userId: "designer-1",
      name: "Creative Director",
      color: "#FF6B35",
      kind: "human",
      cursor: { surface: "artifact", path: "/main", x: 10, y: 20 },
      updatedAt: 10,
    });
    expect(summarizePresence(doc.awareness).totalCount).toBe(1);

    const summary = summarizePresenceStates([
      {
        userId: "designer-1",
        name: "Creative Director",
        color: "#FF6B35",
        kind: "human",
        cursor: { surface: "artifact", path: "/main", x: 10, y: 20 },
        updatedAt: 10,
      },
      {
        userId: "designer-2",
        name: "Level Designer",
        color: "#2ECC71",
        kind: "human",
        cursor: { surface: "design-md", path: "DESIGN.md", index: 8 },
        updatedAt: 12,
      },
      {
        userId: "agent-1",
        name: "Greybox Agent",
        color: "#3CC2E0",
        kind: "agent",
        agent: { writing: true, label: "AGENT" },
        updatedAt: 13,
      },
      {
        userId: "designer-3",
        name: "UI Designer",
        color: "#F4C95D",
        kind: "human",
        updatedAt: 11,
      },
      {
        userId: "stale-agent",
        name: "Idle Agent",
        color: "#5C6166",
        kind: "agent",
        updatedAt: 1,
      },
    ], { maxAvatars: 3, now: 20, staleMs: 10 });

    expect(summary.totalCount).toBe(4);
    expect(summary.humanCount).toBe(3);
    expect(summary.agentCount).toBe(1);
    expect(summary.agentWriting).toBe(true);
    expect(summary.agentWritingLabels).toEqual(["AGENT"]);
    expect(summary.overflowCount).toBe(1);
    expect(summary.latestUpdatedAt).toBe(13);
    expect(summary.avatars.map((state) => state.userId)).toEqual([
      "agent-1",
      "designer-2",
      "designer-3",
    ]);
  });

  it("removes human and agent awareness when relay sockets disconnect", async () => {
    const relay = createRealtimeRelay();
    const socketA = new MemorySocket();
    const socketB = new MemorySocket();
    await relay.connect("project-presence-disconnect", socketA);
    await relay.connect("project-presence-disconnect", socketB);

    const docA = createRealtimeDocument({ guid: "client-a" });
    const docB = createRealtimeDocument({ guid: "client-b" });
    docA.awareness.setLocalState({
      userId: "agent-1",
      name: "Greybox Agent",
      color: "#3CC2E0",
      kind: "agent",
      agent: { writing: true, label: "AGENT" },
      updatedAt: 1,
    });

    socketA.emitMessage(encodeAwareness(docA.awareness, [docA.doc.clientID]));
    flushAwarenessMessages(docB.awareness, socketB);
    expect(presenceStatesWithUserId(docB.awareness)).toEqual([
      expect.objectContaining({ userId: "agent-1", kind: "agent" }),
    ]);

    socketA.close();
    flushAwarenessMessages(docB.awareness, socketB);

    expect(presenceStatesWithUserId(docB.awareness)).toEqual([]);
    expect(presenceStatesWithUserId(relay.getRoom("project-presence-disconnect").realtime.awareness)).toEqual([]);
    await relay.destroy();
  });

  it("closes malformed realtime messages without throwing through the relay", async () => {
    const relay = createRealtimeRelay();
    const socket = new MemorySocket();
    await relay.connect("project-bad-frame", socket);

    expect(() => relay.handleMessage("project-bad-frame", socket, new Uint8Array([255]))).not.toThrow();
    expect(socket.closed).toBe(true);
    expect(socket.closeCode).toBe(1003);
    expect(socket.closeReason).toBe("bad realtime message");
    expect(relay.getRoom("project-bad-frame").sockets.size).toBe(0);
    await relay.destroy();
  });

  it("exports guards and bounded decoder helpers for realtime message types", () => {
    expect(isYWebSocketMessageType(Y_WEBSOCKET_MESSAGE_SYNC)).toBe(true);
    expect(isYWebSocketMessageType(Y_WEBSOCKET_MESSAGE_AWARENESS)).toBe(true);
    expect(isYWebSocketMessageType(2)).toBe(false);
    expect(decodeRealtimeMessage(encodeMessageType(Y_WEBSOCKET_MESSAGE_SYNC)).messageType).toBe(
      Y_WEBSOCKET_MESSAGE_SYNC,
    );
    expect(() => decodeRealtimeMessage(encodeMessageType(2))).toThrow("unknown realtime message type");
    expect(() => decodeRealtimeMessage(new Uint8Array([0, 1, 2]), { maxBytes: 2 })).toThrow(
      "realtime message exceeds maximum size",
    );
  });

  it("closes unknown realtime message types through the relay", async () => {
    const relay = createRealtimeRelay();
    const socket = new MemorySocket();
    await relay.connect("project-unknown-frame", socket);

    expect(() => relay.handleMessage("project-unknown-frame", socket, encodeMessageType(2))).not.toThrow();
    expect(socket.closed).toBe(true);
    expect(socket.closeCode).toBe(1003);
    expect(socket.closeReason).toBe("bad realtime message");
    await relay.destroy();
  });

  it("closes unknown realtime message types through the browser binding", () => {
    const doc = createRealtimeDocument({ guid: "browser-unknown-frame" });
    const socket = new BrowserSocketMock();
    const binding = bindRealtimeWebSocket(doc, socket);

    expect(() => socket.receive(encodeMessageType(2))).not.toThrow();
    expect(socket.closed).toBe(true);
    expect(socket.closeCode).toBe(1003);
    expect(socket.closeReason).toBe("bad realtime message");
    binding.disconnect();
  });

  it("persists snapshots and restores comments after a refresh", async () => {
    const store = new MemorySnapshotStore();
    const doc = createRealtimeDocument({ guid: "project-3" });
    const scheduler = createSnapshotScheduler({
      projectId: "project-3",
      doc: doc.doc,
      store,
      intervalMs: 10_000,
      setIntervalFn: vi.fn(() => 1 as unknown as NodeJS.Timeout),
      clearIntervalFn: vi.fn(),
      now: () => 10,
    });

    doc.comments.push([
      {
        id: "c1",
        artifactId: "artifact-1",
        anchor: { xpath: "/html/body/main", charOffset: 4 },
        thread: [{ authorId: "u1", body: "Move this spawn readout closer to the HUD.", createdAt: 9 }],
        createdAt: 9,
        updatedAt: 9,
      },
    ]);
    await scheduler.flush();

    const nextDoc = createRealtimeDocument({ guid: "project-3" });
    await restoreSnapshot(nextDoc.doc, store, "project-3");

    expect(nextDoc.comments.toArray()[0]?.thread[0]?.body).toContain("spawn readout");
    scheduler.stop();
  });

  it("appends and resolves pinned comment threads without losing refresh persistence", async () => {
    const store = new MemorySnapshotStore();
    const doc = createRealtimeDocument({ guid: "project-comment-thread" });
    addPinnedComment(doc, {
      id: "comment-1",
      artifactId: "artifact-1",
      anchor: { xpath: "/html/body/main/section[2]", charOffset: 12, pixelX: 40, pixelY: 80 },
      thread: [{ authorId: "director-1", body: "Move the spawn marker away from the hazard.", createdAt: 10 }],
      createdAt: 10,
      updatedAt: 10,
    });

    expect(appendPinnedCommentReply(doc, "comment-1", {
      authorId: "designer-1",
      body: "Moved it to the checkpoint safe zone.",
      createdAt: 12,
    })).toMatchObject({ updatedAt: 12 });
    const resolved = resolvePinnedCommentThread(doc, "comment-1", {
      authorId: "director-1",
      body: "Accepted for the platformer sample.",
      resolvedAt: 13,
    });

    expect(resolved?.thread).toHaveLength(3);
    expect(isPinnedCommentResolved(resolved!)).toBe(true);
    expect(listPinnedComments(doc, { unresolvedOnly: true })).toEqual([]);
    expect(appendPinnedCommentReply(doc, "missing-comment", {
      authorId: "designer-1",
      body: "No-op",
      createdAt: 14,
    })).toBeNull();

    await store.save(encodeSnapshot("project-comment-thread", doc.doc, 14));
    const restored = createRealtimeDocument({ guid: "project-comment-thread-restored" });
    await restoreSnapshot(restored.doc, store, "project-comment-thread");

    const [comment] = listPinnedComments(restored, { artifactId: "artifact-1" });
    expect(comment?.thread.map((message) => message.body)).toEqual([
      "Move the spawn marker away from the hazard.",
      "Moved it to the checkpoint safe zone.",
      "Accepted for the platformer sample.",
    ]);
    expect(isPinnedCommentResolved(comment!)).toBe(true);
  });

  it("restores persisted comments before the relay accepts the first client sync request", async () => {
    const store = new DelayedLoadSnapshotStore();
    const seeded = createRealtimeDocument({ guid: "project-restore-first-sync" });
    seeded.comments.push([
      {
        id: "c1",
        artifactId: "artifact-1",
        anchor: { xpath: "/html/body/main", charOffset: 8 },
        thread: [{ authorId: "designer-1", body: "Persist this spawn note across daemon restarts.", createdAt: 30 }],
        createdAt: 30,
        updatedAt: 30,
      },
    ]);
    store.save(encodeSnapshot("project-restore-first-sync", seeded.doc, 31));

    const relay = createRealtimeRelay({ snapshotStore: store });
    const socket = new MemorySocket();
    await relay.connect("project-restore-first-sync", socket);

    const client = createRealtimeDocument({ guid: "client-after-restart" });
    flushClientMessages(client.doc, socket);
    socket.emitMessage(encodeSyncStep1(client.doc));
    flushClientMessages(client.doc, socket);

    expect(client.comments.toArray()[0]?.thread[0]?.body).toContain("daemon restarts");
    await relay.destroy();
  });

  it("restores active section locks before the relay accepts the first client sync request", async () => {
    const store = new DelayedLoadSnapshotStore();
    const seeded = createRealtimeDocument({ guid: "project-lock-restore" });
    const markdown = [
      "# DESIGN.md",
      "",
      "## Combat",
      "",
      "Tune the boss windup readability.",
      "",
      "## HUD",
      "",
      "Keep the low-health meter clear.",
    ].join("\n");
    const expectedLock = lockMarkdownSection(seeded, {
      filePath: "DESIGN.md",
      markdown,
      offset: markdown.indexOf("low-health"),
      holderId: "agent-1",
      holderName: "AGENT",
      reason: "agent-edit",
      now: 40,
      ttlMs: 120_000,
    });
    store.save(encodeSnapshot("project-lock-restore", seeded.doc, 41));

    const relay = createRealtimeRelay({ snapshotStore: store });
    const socket = new MemorySocket();
    await relay.connect("project-lock-restore", socket);

    const client = createRealtimeDocument({ guid: "client-lock-after-restart" });
    flushClientMessages(client.doc, socket);
    socket.emitMessage(encodeSyncStep1(client.doc));
    flushClientMessages(client.doc, socket);

    expect(activeSectionLocks(client, { filePath: "DESIGN.md", now: 50 })).toEqual([
      expect.objectContaining({
        sectionId: expectedLock.sectionId,
        holderName: "AGENT",
        sectionTitle: "HUD",
      }),
    ]);
    await relay.destroy();
  });

  it("flushes dirty snapshots when the relay is destroyed", async () => {
    const store = new MemorySnapshotStore();
    const relay = createRealtimeRelay({ snapshotStore: store, snapshotIntervalMs: 10_000 });
    const socket = new MemorySocket();
    await relay.connect("project-destroy-flush", socket);

    relay.getRoom("project-destroy-flush").realtime.activeArtifact.insert(0, "<main>saved on shutdown</main>");
    await relay.destroy();

    const restored = createRealtimeDocument({ guid: "project-destroy-flush-restored" });
    await restoreSnapshot(restored.doc, store, "project-destroy-flush");
    expect(restored.activeArtifact.toString()).toContain("saved on shutdown");
  });

  it("syncs, claims, releases, and snapshots TodoWrite plan items", async () => {
    const store = new MemorySnapshotStore();
    const doc = createRealtimeDocument({ guid: "project-todos" });
    const scheduler = createSnapshotScheduler({
      projectId: "project-todos",
      doc: doc.doc,
      store,
      intervalMs: 10_000,
      setIntervalFn: vi.fn(() => 1 as unknown as NodeJS.Timeout),
      clearIntervalFn: vi.fn(),
      now: () => 20,
    });

    const items = syncTodoPlanItems(doc, [
      { body: "Build HUD import", status: "in_progress" },
      { body: "Run Unity sample QA", status: "pending" },
    ], { now: 10 });
    expect(items.map((item) => item.id)).toEqual([
      todoPlanItemId("Build HUD import"),
      todoPlanItemId("Run Unity sample QA"),
    ]);

    const claimed = claimTodoPlanItem(doc, todoPlanItemId("Run Unity sample QA"), "designer-1", { now: 11 });
    expect(claimed).toMatchObject({ claimedBy: "designer-1", updatedAt: 11 });
    expect(claimTodoPlanItem(doc, todoPlanItemId("Run Unity sample QA"), "designer-2", { now: 12 })).toBeNull();

    syncTodoPlanItems(doc, [
      { body: "Build HUD import", status: "completed" },
      { body: "Run Unity sample QA", status: "in_progress" },
    ], { now: 13 });
    const updatedItems = listTodoPlanItems(doc);
    expect(updatedItems).toEqual([
      expect.objectContaining({ body: "Build HUD import", status: "completed" }),
      expect.objectContaining({ body: "Run Unity sample QA", status: "in_progress", claimedBy: "designer-1" }),
    ]);
    expect(updatedItems[0]).not.toHaveProperty("claimedBy");

    expect(releaseTodoPlanItem(doc, todoPlanItemId("Run Unity sample QA"), { claimedBy: "designer-2" })).toBeNull();
    const released = releaseTodoPlanItem(doc, todoPlanItemId("Run Unity sample QA"), { claimedBy: "designer-1", now: 14 });
    expect(released).toMatchObject({ updatedAt: 14 });
    expect(released).not.toHaveProperty("claimedBy");
    claimTodoPlanItem(doc, todoPlanItemId("Run Unity sample QA"), "designer-1", { now: 15 });
    await scheduler.flush();

    const restored = createRealtimeDocument({ guid: "project-todos" });
    await restoreSnapshot(restored.doc, store, "project-todos");

    const restoredItems = listTodoPlanItems(restored);
    expect(restoredItems).toEqual([
      expect.objectContaining({ body: "Build HUD import", status: "completed" }),
      expect.objectContaining({ body: "Run Unity sample QA", status: "in_progress", claimedBy: "designer-1" }),
    ]);
    expect(restoredItems[0]).not.toHaveProperty("claimedBy");
    scheduler.stop();
  });

  it("tracks markdown section locks for agent edits", () => {
    const doc = createRealtimeDocument({ guid: "project-locks" });
    const markdown = [
      "# DESIGN.md",
      "",
      "## Combat Pillars",
      "",
      "Readable boss pressure.",
      "",
      "## HUD",
      "",
      "Controller-safe meters.",
    ].join("\n");

    expect(extractMarkdownSections(markdown, "DESIGN.md").map((section) => section.title)).toEqual([
      "DESIGN.md",
      "Combat Pillars",
      "HUD",
    ]);

    const lock = lockMarkdownSection(doc, {
      filePath: "DESIGN.md",
      markdown,
      offset: markdown.indexOf("Controller-safe"),
      holderId: "agent-1",
      holderName: "AGENT",
      reason: "agent-edit",
      now: 1_000,
      ttlMs: 120_000,
    });

    expect(lock).toMatchObject({
      filePath: "DESIGN.md",
      sectionTitle: "HUD",
      holderName: "AGENT",
      expiresAt: 121_000,
    });
    expect(activeSectionLocks(doc, { filePath: "DESIGN.md", now: 2_000 })).toHaveLength(1);
    expect(releaseExpiredSectionLocks(doc, 122_000)).toEqual([lock.sectionId]);
    expect(activeSectionLocks(doc, { filePath: "DESIGN.md", now: 122_000 })).toEqual([]);

    lockMarkdownSection(doc, {
      filePath: "DESIGN.md",
      markdown,
      holderId: "agent-1",
      holderName: "AGENT",
      reason: "agent-edit",
      now: 130_000,
    });
    expect(releaseSectionLocksForHolder(doc, "agent-1")).toHaveLength(1);
  });

  it("rejects overlapping markdown section locks from different holders", () => {
    const doc = createRealtimeDocument({ guid: "project-lock-conflicts" });
    const markdown = [
      "# DESIGN.md",
      "",
      "## Combat",
      "",
      "Tune enemy health.",
      "",
      "## HUD",
      "",
      "Keep meters readable.",
    ].join("\n");
    const agentAttempt = tryLockMarkdownSection(doc, {
      filePath: "DESIGN.md",
      markdown,
      offset: markdown.indexOf("enemy health"),
      holderId: "agent-1",
      holderName: "AGENT",
      reason: "agent-edit",
      now: 1_000,
      ttlMs: 120_000,
    });

    expect(agentAttempt).toMatchObject({ ok: true, lock: { holderName: "AGENT", sectionTitle: "Combat" } });
    const humanAttempt = tryLockMarkdownSection(doc, {
      filePath: "DESIGN.md",
      markdown,
      offset: markdown.indexOf("enemy health"),
      holderId: "designer-1",
      holderName: "Creative Director",
      reason: "human-edit",
      now: 2_000,
    });
    expect(humanAttempt).toMatchObject({
      ok: false,
      conflict: { holderId: "agent-1", holderName: "AGENT", reason: "agent-edit" },
      section: { title: "Combat" },
    });
    expect(activeSectionLocks(doc, { filePath: "DESIGN.md", now: 2_000 })).toEqual([
      expect.objectContaining({ holderId: "agent-1" }),
    ]);

    const refreshAttempt = tryLockMarkdownSection(doc, {
      filePath: "DESIGN.md",
      markdown,
      offset: markdown.indexOf("enemy health"),
      holderId: "agent-1",
      holderName: "AGENT",
      reason: "agent-edit",
      now: 3_000,
      ttlMs: 60_000,
    });
    expect(refreshAttempt).toMatchObject({ ok: true, lock: { expiresAt: 63_000 } });

    const expiredAttempt = tryLockMarkdownSection(doc, {
      filePath: "DESIGN.md",
      markdown,
      offset: markdown.indexOf("enemy health"),
      holderId: "designer-1",
      holderName: "Creative Director",
      reason: "human-edit",
      now: 64_000,
    });
    expect(expiredAttempt).toMatchObject({ ok: true, lock: { holderId: "designer-1" } });
  });

  it("merges independent game artifact fields and reports same-field conflicts", () => {
    const result = mergeGameArtifact({
      base: { boss: { hp: 3, color: "red" }, hud: { scale: 1 } },
      local: { boss: { hp: 2, color: "red" }, hud: { scale: 1 } },
      remote: { boss: { hp: 4, color: "blue" }, hud: { scale: 1.2 } },
    });

    expect(result.merged).toMatchObject({ boss: { hp: 4, color: "blue" }, hud: { scale: 1.2 } });
    expect(result.conflicts).toEqual([
      expect.objectContaining({ path: "/boss/hp", reason: "both-edited-scalar" }),
    ]);
  });

  it("merges independent keyed game artifact array edits", () => {
    const result = mergeGameArtifact({
      base: {
        actors: [
          { id: "boss", hp: 3, color: "red" },
          { id: "scout", hp: 1, color: "blue" },
        ],
      },
      local: {
        actors: [
          { id: "boss", hp: 2, color: "red" },
          { id: "scout", hp: 1, color: "blue" },
          { id: "healer", hp: 1, color: "green" },
        ],
      },
      remote: {
        actors: [
          { id: "boss", hp: 3, color: "red" },
          { id: "scout", hp: 2, color: "blue" },
          { id: "sniper", hp: 1, color: "purple" },
        ],
      },
    });

    expect(result.conflicts).toEqual([]);
    expect(result.merged).toEqual({
      actors: [
        { id: "boss", hp: 2, color: "red" },
        { id: "scout", hp: 2, color: "blue" },
        { id: "healer", hp: 1, color: "green" },
        { id: "sniper", hp: 1, color: "purple" },
      ],
    });
  });

  it("reports conflicts on the same keyed game artifact array item field", () => {
    const result = mergeGameArtifact({
      base: { actors: [{ id: "boss", hp: 3, color: "red" }] },
      local: { actors: [{ id: "boss", hp: 2, color: "red" }] },
      remote: { actors: [{ id: "boss", hp: 4, color: "blue" }] },
    });

    expect(result.merged).toEqual({
      actors: [{ id: "boss", hp: 4, color: "blue" }],
    });
    expect(result.conflicts).toEqual([
      expect.objectContaining({
        path: "/actors/boss/hp",
        reason: "both-edited-scalar",
      }),
    ]);
  });

  it("falls back to array conflict when artifact arrays have duplicate keys", () => {
    const result = mergeGameArtifact({
      base: { actors: [{ id: "boss", hp: 3 }] },
      local: { actors: [{ id: "boss", hp: 2 }] },
      remote: { actors: [{ id: "boss", hp: 3 }, { id: "boss", hp: 4 }] },
    });

    expect(result.conflicts).toEqual([
      expect.objectContaining({
        path: "/actors",
        reason: "array-diverged",
      }),
    ]);
  });
});

class MemorySnapshotStore implements RealtimeSnapshotStore {
  private snapshots = new Map<string, RealtimeSnapshot>();

  load(projectId: string): Promise<RealtimeSnapshot | null> | RealtimeSnapshot | null {
    return this.snapshots.get(projectId) ?? null;
  }

  save(snapshot: RealtimeSnapshot): void {
    this.snapshots.set(snapshot.projectId, snapshot);
  }
}

class DelayedLoadSnapshotStore extends MemorySnapshotStore {
  override async load(projectId: string): Promise<RealtimeSnapshot | null> {
    await new Promise((resolve) => setTimeout(resolve, 5));
    return super.load(projectId);
  }
}

function encodeSyncStep1(doc: Y.Doc): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, Y_WEBSOCKET_MESSAGE_SYNC);
  syncProtocol.writeSyncStep1(encoder, doc);
  return encoding.toUint8Array(encoder);
}

function encodeMessageType(messageType: number): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageType);
  return encoding.toUint8Array(encoder);
}

function encodeSyncUpdate(update: Uint8Array): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, Y_WEBSOCKET_MESSAGE_SYNC);
  syncProtocol.writeUpdate(encoder, update);
  return encoding.toUint8Array(encoder);
}

function encodeAwareness(awareness: awarenessProtocol.Awareness, clientIds: number[]): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, Y_WEBSOCKET_MESSAGE_AWARENESS);
  encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(awareness, clientIds));
  return encoding.toUint8Array(encoder);
}

function applyClientMessage(doc: Y.Doc, data: Uint8Array, socket: MemorySocket): void {
  const decoder = decoding.createDecoder(data);
  const messageType = decoding.readVarUint(decoder);
  if (messageType !== Y_WEBSOCKET_MESSAGE_SYNC) return;
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, Y_WEBSOCKET_MESSAGE_SYNC);
  syncProtocol.readSyncMessage(decoder, encoder, doc, socket);
  const reply = encoding.toUint8Array(encoder);
  if (reply.length > 1) socket.emitMessage(reply);
}

function flushClientMessages(doc: Y.Doc, socket: MemorySocket): void {
  for (const update of socket.received.splice(0)) applyClientMessage(doc, update, socket);
}

function drainClientMessages(
  docA: Y.Doc,
  socketA: MemorySocket,
  docB: Y.Doc,
  socketB: MemorySocket,
): void {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const pending = socketA.received.length + socketB.received.length;
    if (pending === 0) return;
    flushClientMessages(docA, socketA);
    flushClientMessages(docB, socketB);
  }
  throw new Error("Timed out draining realtime sync messages.");
}

function flushAwarenessMessages(awareness: awarenessProtocol.Awareness, socket: MemorySocket): void {
  for (const update of socket.received.splice(0)) {
    const decoder = decoding.createDecoder(update);
    const messageType = decoding.readVarUint(decoder);
    if (messageType !== Y_WEBSOCKET_MESSAGE_AWARENESS) continue;
    awarenessProtocol.applyAwarenessUpdate(awareness, decoding.readVarUint8Array(decoder), socket);
  }
}

function presenceStatesWithUserId(awareness: awarenessProtocol.Awareness): unknown[] {
  return Array.from(awareness.getStates().values()).filter((state) => (
    Boolean(state) && typeof state === "object" && "userId" in state
  ));
}
