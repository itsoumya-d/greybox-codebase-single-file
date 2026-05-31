// SPDX-License-Identifier: Apache-2.0

import * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";

import type { PinnedComment, PresenceState, TodoPlanItem } from "./awareness.js";

export type { TodoPlanItem } from "./awareness.js";

export const REALTIME_SCHEMA_VERSION = 1;

export interface ChatThreadMessage {
  id: string;
  authorId: string;
  role: "designer" | "agent" | "system";
  body: string;
  createdAt: number;
  artifactId?: string;
}

export interface RealtimeDocument {
  doc: Y.Doc;
  awareness: Awareness;
  chatThread: Y.Array<ChatThreadMessage>;
  discoveryAnswers: Y.Map<unknown>;
  activeArtifact: Y.Text;
  artifactOverrides: Y.Map<unknown>;
  designMarkdown: Y.Text;
  comments: Y.Array<PinnedComment>;
  todoPlan: Y.Array<TodoPlanItem>;
  sectionLocks: Y.Map<SectionLock>;
  meta: Y.Map<unknown>;
}

export interface SectionLock {
  sectionId: string;
  filePath?: string;
  sectionTitle?: string;
  startLine?: number;
  endLine?: number;
  holderId: string;
  holderName: string;
  expiresAt: number;
  reason: "agent-edit" | "human-edit" | "merge-review";
}

export interface MarkdownSectionLockInput {
  filePath: string;
  markdown: string;
  offset?: number;
  holderId: string;
  holderName: string;
  reason: SectionLock["reason"];
  now?: number;
  ttlMs?: number;
}

export type SectionLockAttempt =
  | { ok: true; lock: SectionLock; section: MarkdownSection }
  | { ok: false; conflict: SectionLock; section: MarkdownSection };

export interface MarkdownSection {
  sectionId: string;
  filePath: string;
  title: string;
  level: number;
  startLine: number;
  endLine: number;
  startOffset: number;
  endOffset: number;
}

export interface TodoPlanSeedItem {
  body: string;
  status: TodoPlanItem["status"];
}

export interface RealtimeDocumentOptions {
  guid?: string;
  initialArtifactHtml?: string;
  initialDesignMarkdown?: string;
  presence?: PresenceState;
}

export function createRealtimeDocument(options: RealtimeDocumentOptions = {}): RealtimeDocument {
  const doc = new Y.Doc({ guid: options.guid });
  const awareness = new Awareness(doc);
  const realtime = {
    doc,
    awareness,
    chatThread: doc.getArray<ChatThreadMessage>("chatThread"),
    discoveryAnswers: doc.getMap<unknown>("discoveryAnswers"),
    activeArtifact: doc.getText("activeArtifact"),
    artifactOverrides: doc.getMap<unknown>("artifactOverrides"),
    designMarkdown: doc.getText("designMarkdown"),
    comments: doc.getArray<PinnedComment>("comments"),
    todoPlan: doc.getArray<TodoPlanItem>("todoPlan"),
    sectionLocks: doc.getMap<SectionLock>("sectionLocks"),
    meta: doc.getMap<unknown>("meta"),
  } satisfies RealtimeDocument;

  realtime.meta.set("schemaVersion", REALTIME_SCHEMA_VERSION);
  if (options.initialArtifactHtml) realtime.activeArtifact.insert(0, options.initialArtifactHtml);
  if (options.initialDesignMarkdown) realtime.designMarkdown.insert(0, options.initialDesignMarkdown);
  if (options.presence) awareness.setLocalState(options.presence);
  return realtime;
}

export function encodeRealtimeState(doc: Y.Doc): Uint8Array {
  return Y.encodeStateAsUpdate(doc);
}

export function applyRealtimeState(doc: Y.Doc, update: Uint8Array, origin: unknown = "remote"): void {
  Y.applyUpdate(doc, update, origin);
}

export function appendChatMessage(realtime: RealtimeDocument, message: ChatThreadMessage): void {
  realtime.chatThread.push([message]);
}

export function addPinnedComment(realtime: RealtimeDocument, comment: PinnedComment): void {
  realtime.comments.push([comment]);
}

export function listPinnedComments(
  realtime: RealtimeDocument,
  options: { artifactId?: string; unresolvedOnly?: boolean } = {},
): PinnedComment[] {
  return realtime.comments.toArray()
    .filter((comment) => !options.artifactId || comment.artifactId === options.artifactId)
    .filter((comment) => !options.unresolvedOnly || !isPinnedCommentResolved(comment))
    .sort((left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id));
}

export function appendPinnedCommentReply(
  realtime: RealtimeDocument,
  commentId: string,
  reply: {
    authorId: string;
    body: string;
    createdAt?: number;
  },
): PinnedComment | null {
  const authorId = reply.authorId.trim();
  const body = reply.body.trim();
  if (!authorId || !body) return null;
  const createdAt = reply.createdAt ?? Date.now();
  return updatePinnedComment(realtime, commentId, (comment) => ({
    ...comment,
    thread: [
      ...comment.thread,
      { authorId, body, createdAt },
    ],
    updatedAt: createdAt,
  }));
}

export function resolvePinnedCommentThread(
  realtime: RealtimeDocument,
  commentId: string,
  resolution: {
    authorId: string;
    body: string;
    resolvedAt?: number;
  },
): PinnedComment | null {
  const authorId = resolution.authorId.trim();
  const body = resolution.body.trim();
  if (!authorId || !body) return null;
  const resolvedAt = resolution.resolvedAt ?? Date.now();
  return updatePinnedComment(realtime, commentId, (comment) => ({
    ...comment,
    thread: [
      ...comment.thread,
      { authorId, body, createdAt: resolvedAt, resolved: true },
    ],
    updatedAt: resolvedAt,
  }));
}

export function isPinnedCommentResolved(comment: PinnedComment): boolean {
  return comment.thread.some((message) => message.resolved === true);
}

export function listTodoPlanItems(realtime: RealtimeDocument): TodoPlanItem[] {
  return realtime.todoPlan.toArray();
}

export function todoPlanBodyKey(body: string): string {
  return String(body ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

export function todoPlanItemId(body: string, occurrence = 0): string {
  const key = todoPlanBodyKey(body);
  const slug = key
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "task";
  return `todo:${Math.max(0, Math.round(occurrence))}:${slug}:${hashTodoPlanKey(key)}`;
}

export function syncTodoPlanItems(
  realtime: RealtimeDocument,
  items: TodoPlanSeedItem[],
  options: { now?: number } = {},
): TodoPlanItem[] {
  const now = options.now ?? Date.now();
  const existingById = new Map(realtime.todoPlan.toArray().map((item) => [item.id, item]));
  const occurrences = new Map<string, number>();
  const nextItems: TodoPlanItem[] = [];

  for (const item of items) {
    const body = String(item.body ?? "").trim();
    if (!body) continue;
    const bodyKey = todoPlanBodyKey(body);
    const occurrence = occurrences.get(bodyKey) ?? 0;
    occurrences.set(bodyKey, occurrence + 1);
    const id = todoPlanItemId(body, occurrence);
    const status = normalizeTodoStatus(item.status);
    const existing = existingById.get(id);
    const claimedBy = status === "completed" ? undefined : existing?.claimedBy;
    const updatedAt =
      existing &&
      existing.body === body &&
      existing.status === status &&
      existing.claimedBy === claimedBy
        ? existing.updatedAt
        : now;
    nextItems.push({
      id,
      body,
      status,
      ...(claimedBy ? { claimedBy } : {}),
      updatedAt,
    });
  }

  replaceTodoPlanItems(realtime, nextItems);
  return nextItems;
}

export function claimTodoPlanItem(
  realtime: RealtimeDocument,
  itemId: string,
  claimedBy: string,
  options: { now?: number; force?: boolean } = {},
): TodoPlanItem | null {
  const claimant = claimedBy.trim();
  if (!claimant) return null;
  return updateTodoPlanItem(realtime, itemId, (item) => {
    if (item.status === "completed") return null;
    if (item.claimedBy && item.claimedBy !== claimant && !options.force) return null;
    if (item.claimedBy === claimant) return item;
    return { ...item, claimedBy: claimant, updatedAt: options.now ?? Date.now() };
  });
}

export function releaseTodoPlanItem(
  realtime: RealtimeDocument,
  itemId: string,
  options: { claimedBy?: string; now?: number; force?: boolean } = {},
): TodoPlanItem | null {
  return updateTodoPlanItem(realtime, itemId, (item) => {
    if (!item.claimedBy) return item;
    if (options.claimedBy && item.claimedBy !== options.claimedBy && !options.force) return null;
    const { claimedBy: _claimedBy, ...released } = item;
    return { ...released, updatedAt: options.now ?? Date.now() };
  });
}

export function upsertSectionLock(realtime: RealtimeDocument, lock: SectionLock): void {
  realtime.sectionLocks.set(lock.sectionId, lock);
}

export function releaseSectionLocksForHolder(realtime: RealtimeDocument, holderId: string): string[] {
  const released: string[] = [];
  realtime.sectionLocks.forEach((lock, sectionId) => {
    if (lock.holderId === holderId) {
      realtime.sectionLocks.delete(sectionId);
      released.push(sectionId);
    }
  });
  return released;
}

export function releaseExpiredSectionLocks(realtime: RealtimeDocument, now = Date.now()): string[] {
  const released: string[] = [];
  realtime.sectionLocks.forEach((lock, sectionId) => {
    if (lock.expiresAt <= now) {
      realtime.sectionLocks.delete(sectionId);
      released.push(sectionId);
    }
  });
  return released;
}

export function activeSectionLocks(
  realtime: RealtimeDocument,
  options: { filePath?: string; now?: number } = {},
): SectionLock[] {
  const now = options.now ?? Date.now();
  const locks: SectionLock[] = [];
  realtime.sectionLocks.forEach((lock) => {
    if (lock.expiresAt <= now) return;
    if (options.filePath && lock.filePath !== options.filePath) return;
    locks.push(lock);
  });
  return locks.sort((a, b) =>
    (a.filePath ?? "").localeCompare(b.filePath ?? "") ||
    (a.startLine ?? 0) - (b.startLine ?? 0) ||
    a.holderName.localeCompare(b.holderName),
  );
}

export function markdownSectionId(filePath: string, title: string, startLine: number): string {
  const safePath = filePath.trim() || "DESIGN.md";
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "document";
  return `${safePath}#${slug}:${Math.max(1, Math.round(startLine))}`;
}

export function extractMarkdownSections(markdown: string, filePath = "DESIGN.md"): MarkdownSection[] {
  const source = String(markdown ?? "");
  const lineMatches = Array.from(source.matchAll(/^(#{1,6})\s+(.+?)\s*#*\s*$/gm));
  if (lineMatches.length === 0) {
    return [{
      sectionId: markdownSectionId(filePath, "Document", 1),
      filePath,
      title: "Document",
      level: 1,
      startLine: 1,
      endLine: Math.max(1, source.split("\n").length),
      startOffset: 0,
      endOffset: source.length,
    }];
  }

  return lineMatches.map((match, index) => {
    const startOffset = match.index ?? 0;
    const next = lineMatches[index + 1];
    const endOffset = next?.index ?? source.length;
    const startLine = lineNumberAtOffset(source, startOffset);
    return {
      sectionId: markdownSectionId(filePath, String(match[2] ?? "").trim(), startLine),
      filePath,
      title: String(match[2] ?? "").trim() || "Document",
      level: String(match[1] ?? "#").length,
      startLine,
      endLine: Math.max(startLine, lineNumberAtOffset(source, Math.max(startOffset, endOffset - 1))),
      startOffset,
      endOffset,
    };
  });
}

export function markdownSectionAtOffset(
  markdown: string,
  offset: number,
  filePath = "DESIGN.md",
): MarkdownSection {
  const sections = extractMarkdownSections(markdown, filePath);
  const safeOffset = Math.max(0, Math.min(String(markdown ?? "").length, Math.round(offset)));
  return (
    sections.find((section) => safeOffset >= section.startOffset && safeOffset <= section.endOffset) ??
    sections.at(-1)!
  );
}

export function tryLockMarkdownSection(
  realtime: RealtimeDocument,
  input: MarkdownSectionLockInput,
): SectionLockAttempt {
  const now = input.now ?? Date.now();
  const section = markdownSectionAtOffset(
    input.markdown,
    input.offset ?? String(input.markdown ?? "").length,
    input.filePath,
  );
  const existing = realtime.sectionLocks.get(section.sectionId);
  if (existing && existing.expiresAt > now && existing.holderId !== input.holderId) {
    return { ok: false, conflict: existing, section };
  }
  const lock = buildMarkdownSectionLock(input, section, now);
  upsertSectionLock(realtime, lock);
  return { ok: true, lock, section };
}

export function lockMarkdownSection(realtime: RealtimeDocument, input: MarkdownSectionLockInput): SectionLock {
  const now = input.now ?? Date.now();
  const section = markdownSectionAtOffset(
    input.markdown,
    input.offset ?? String(input.markdown ?? "").length,
    input.filePath,
  );
  const lock = buildMarkdownSectionLock(input, section, now);
  upsertSectionLock(realtime, lock);
  return lock;
}

function buildMarkdownSectionLock(
  input: MarkdownSectionLockInput,
  section: MarkdownSection,
  now: number,
): SectionLock {
  return {
    sectionId: section.sectionId,
    filePath: section.filePath,
    sectionTitle: section.title,
    startLine: section.startLine,
    endLine: section.endLine,
    holderId: input.holderId,
    holderName: input.holderName,
    reason: input.reason,
    expiresAt: now + (input.ttlMs ?? 120_000),
  };
}

function lineNumberAtOffset(source: string, offset: number): number {
  if (offset <= 0) return 1;
  let line = 1;
  for (let index = 0; index < Math.min(offset, source.length); index += 1) {
    if (source[index] === "\n") line += 1;
  }
  return line;
}

function normalizeTodoStatus(status: TodoPlanItem["status"]): TodoPlanItem["status"] {
  if (status === "in_progress" || status === "completed") return status;
  return "pending";
}

function replaceTodoPlanItems(realtime: RealtimeDocument, nextItems: TodoPlanItem[]): void {
  const current = realtime.todoPlan.toArray();
  if (todoPlanItemsEqual(current, nextItems)) return;
  realtime.doc.transact(() => {
    if (realtime.todoPlan.length > 0) realtime.todoPlan.delete(0, realtime.todoPlan.length);
    if (nextItems.length > 0) realtime.todoPlan.push(nextItems);
  }, "todo-plan");
}

function updatePinnedComment(
  realtime: RealtimeDocument,
  commentId: string,
  update: (comment: PinnedComment) => PinnedComment,
): PinnedComment | null {
  const comments = realtime.comments.toArray();
  const index = comments.findIndex((comment) => comment.id === commentId);
  if (index < 0) return null;
  const next = update(comments[index]!);
  realtime.doc.transact(() => {
    realtime.comments.delete(index, 1);
    realtime.comments.insert(index, [next]);
  }, "comments");
  return next;
}

function updateTodoPlanItem(
  realtime: RealtimeDocument,
  itemId: string,
  update: (item: TodoPlanItem) => TodoPlanItem | null,
): TodoPlanItem | null {
  const items = realtime.todoPlan.toArray();
  const index = items.findIndex((item) => item.id === itemId);
  if (index < 0) return null;
  const current = items[index]!;
  const next = update(current);
  if (!next) return null;
  if (todoPlanItemsEqual([current], [next])) return current;
  realtime.doc.transact(() => {
    realtime.todoPlan.delete(index, 1);
    realtime.todoPlan.insert(index, [next]);
  }, "todo-plan");
  return next;
}

function todoPlanItemsEqual(left: TodoPlanItem[], right: TodoPlanItem[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((item, index) => {
    const other = right[index]!;
    return (
      item.id === other.id &&
      item.body === other.body &&
      item.status === other.status &&
      item.claimedBy === other.claimedBy &&
      item.updatedAt === other.updatedAt
    );
  });
}

function hashTodoPlanKey(key: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}
