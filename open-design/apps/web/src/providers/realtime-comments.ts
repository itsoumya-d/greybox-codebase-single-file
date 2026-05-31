// SPDX-License-Identifier: Apache-2.0

import type { PinnedComment } from '@ai-game-design-studio/realtime/awareness';

import type {
  PreviewComment,
  PreviewCommentAnchor,
  PreviewCommentMember,
  PreviewCommentStatus,
  PreviewCommentThreadEntry,
} from '../types';

const REALTIME_PREVIEW_COMMENT_SOURCE = 'preview-comment';
const PREVIEW_COMMENT_STATUSES = new Set<PreviewCommentStatus>([
  'open',
  'attached',
  'applying',
  'needs_review',
  'resolved',
  'failed',
]);

export type RealtimePreviewComment = PinnedComment & {
  source: typeof REALTIME_PREVIEW_COMMENT_SOURCE;
  projectId: string;
  conversationId: string;
  previewComment: PreviewComment;
};

export interface PreviewCommentConflict {
  id: string;
  projectId: string;
  conversationId: string;
  elementId: string;
  filePath: string;
  latest: PreviewComment;
  alternatives: PreviewComment[];
  versions: PreviewComment[];
}

export interface RealtimeCommentArray {
  readonly length: number;
  toArray(): PinnedComment[];
  insert(index: number, content: PinnedComment[]): void;
  delete(index: number, length?: number): void;
}

export interface RealtimeMetaMap {
  get(key: string): unknown;
  set(key: string, value: unknown): unknown;
}

export function previewCommentToRealtime(comment: PreviewComment): RealtimePreviewComment {
  const previewComment = withoutUndefined(normalizePreviewComment(comment));
  const thread = previewComment.thread && previewComment.thread.length > 0
    ? previewComment.thread
    : previewCommentThreadFromComment(previewComment);
  const anchor = previewCommentAnchorFromComment(previewComment);
  return withoutUndefined({
    id: previewComment.id,
    artifactId: previewComment.filePath,
    anchor,
    thread,
    createdAt: previewComment.createdAt,
    updatedAt: previewComment.updatedAt,
    source: REALTIME_PREVIEW_COMMENT_SOURCE,
    projectId: previewComment.projectId,
    conversationId: previewComment.conversationId,
    previewComment,
  } satisfies RealtimePreviewComment);
}

export function previewCommentsFromRealtime(
  projectId: string,
  conversationId: string,
  comments: PinnedComment[],
): PreviewComment[] {
  const byId = new Map<string, PreviewComment>();
  for (const item of comments) {
    const comment = previewCommentFromRealtime(item);
    if (!comment || comment.projectId !== projectId || comment.conversationId !== conversationId) continue;
    const existing = byId.get(comment.id);
    if (!existing || existing.updatedAt <= comment.updatedAt) byId.set(comment.id, comment);
  }
  return Array.from(byId.values()).sort(comparePreviewComments);
}

export function previewCommentConflictsFromRealtime(
  projectId: string,
  conversationId: string,
  comments: PinnedComment[],
): PreviewCommentConflict[] {
  const byId = realtimePreviewCommentsById(projectId, conversationId, comments);
  const conflicts: PreviewCommentConflict[] = [];
  for (const [id, versions] of byId) {
    const unique = uniquePreviewCommentVersions(versions);
    if (unique.length < 2) continue;
    const sorted = unique.sort(comparePreviewComments);
    const latest = sorted[0]!;
    conflicts.push({
      id,
      projectId,
      conversationId,
      elementId: latest.elementId,
      filePath: latest.filePath,
      latest,
      alternatives: sorted.slice(1),
      versions: sorted,
    });
  }
  return conflicts.sort((a, b) => comparePreviewComments(a.latest, b.latest));
}

export function seedRealtimePreviewComments(
  comments: RealtimeCommentArray,
  meta: RealtimeMetaMap,
  projectId: string,
  conversationId: string,
  next: PreviewComment[],
): void {
  for (const comment of [...next].sort(comparePreviewComments).reverse()) {
    upsertRealtimePreviewComment(comments, meta, comment);
  }
  markRealtimePreviewCommentsInitialized(meta, projectId, conversationId);
}

export function upsertRealtimePreviewComment(
  comments: RealtimeCommentArray,
  meta: RealtimeMetaMap,
  comment: PreviewComment,
): void {
  const next = previewCommentToRealtime(comment);
  const index = findRealtimePreviewCommentIndex(comments, comment.projectId, comment.conversationId, comment.id);
  if (index >= 0) {
    const existing = previewCommentFromRealtime(comments.toArray()[index]!);
    if (existing && previewCommentListKey([existing]) === previewCommentListKey([comment])) {
      markRealtimePreviewCommentsInitialized(meta, comment.projectId, comment.conversationId);
      return;
    }
    comments.delete(index, 1);
  }
  comments.insert(0, [next]);
  markRealtimePreviewCommentsInitialized(meta, comment.projectId, comment.conversationId);
}

export function deleteRealtimePreviewComment(
  comments: RealtimeCommentArray,
  meta: RealtimeMetaMap,
  projectId: string,
  conversationId: string,
  commentId: string,
): void {
  const index = findRealtimePreviewCommentIndex(comments, projectId, conversationId, commentId);
  if (index >= 0) comments.delete(index, 1);
  markRealtimePreviewCommentsInitialized(meta, projectId, conversationId);
}

export function resolveRealtimePreviewCommentConflict(
  comments: RealtimeCommentArray,
  meta: RealtimeMetaMap,
  chosen: PreviewComment,
): void {
  const indexes = findRealtimePreviewCommentIndexes(
    comments,
    chosen.projectId,
    chosen.conversationId,
    chosen.id,
  );
  for (const index of indexes.reverse()) comments.delete(index, 1);
  comments.insert(0, [previewCommentToRealtime(chosen)]);
  markRealtimePreviewCommentsInitialized(meta, chosen.projectId, chosen.conversationId);
}

export function isRealtimePreviewCommentsInitialized(
  meta: RealtimeMetaMap,
  projectId: string,
  conversationId: string,
): boolean {
  return meta.get(realtimePreviewCommentsMetaKey(projectId, conversationId)) === true;
}

export function markRealtimePreviewCommentsInitialized(
  meta: RealtimeMetaMap,
  projectId: string,
  conversationId: string,
): void {
  meta.set(realtimePreviewCommentsMetaKey(projectId, conversationId), true);
}

export function previewCommentListKey(comments: PreviewComment[]): string {
  return comments
    .slice()
    .sort(comparePreviewComments)
    .map((comment) => [
      comment.id,
      comment.updatedAt,
      comment.status,
      comment.note,
      threadKey(comment.thread ?? previewCommentThreadFromComment(comment)),
      anchorKey(comment.anchor ?? previewCommentAnchorFromComment(comment)),
      comment.filePath,
      comment.elementId,
    ].join(':'))
    .join('|');
}

export function previewCommentListsEqual(a: PreviewComment[], b: PreviewComment[]): boolean {
  return previewCommentListKey(a) === previewCommentListKey(b);
}

export function syncAttachedCommentsFromPreview(
  attached: PreviewComment[],
  comments: PreviewComment[],
): PreviewComment[] {
  const byId = new Map(comments.map((comment) => [comment.id, comment]));
  const next = attached
    .map((comment) => byId.get(comment.id))
    .filter((comment): comment is PreviewComment => comment !== undefined && comment.status !== 'resolved');
  return previewCommentListsEqual(attached, next) ? attached : next;
}

function realtimePreviewCommentsMetaKey(projectId: string, conversationId: string): string {
  return `preview-comments:${projectId}:${conversationId}:initialized`;
}

function findRealtimePreviewCommentIndex(
  comments: RealtimeCommentArray,
  projectId: string,
  conversationId: string,
  commentId: string,
): number {
  return findRealtimePreviewCommentIndexes(comments, projectId, conversationId, commentId)[0] ?? -1;
}

function findRealtimePreviewCommentIndexes(
  comments: RealtimeCommentArray,
  projectId: string,
  conversationId: string,
  commentId: string,
): number[] {
  const indexes: number[] = [];
  comments.toArray().forEach((item, index) => {
    const comment = previewCommentFromRealtime(item);
    if (comment?.projectId === projectId &&
      comment.conversationId === conversationId &&
      comment.id === commentId) {
      indexes.push(index);
    }
  });
  return indexes;
}

function realtimePreviewCommentsById(
  projectId: string,
  conversationId: string,
  comments: PinnedComment[],
): Map<string, PreviewComment[]> {
  const byId = new Map<string, PreviewComment[]>();
  for (const item of comments) {
    const comment = previewCommentFromRealtime(item);
    if (!comment || comment.projectId !== projectId || comment.conversationId !== conversationId) continue;
    const list = byId.get(comment.id) ?? [];
    list.push(comment);
    byId.set(comment.id, list);
  }
  return byId;
}

function uniquePreviewCommentVersions(comments: PreviewComment[]): PreviewComment[] {
  const byKey = new Map<string, PreviewComment>();
  for (const comment of comments) {
    byKey.set(previewCommentListKey([comment]), comment);
  }
  return Array.from(byKey.values());
}

function previewCommentFromRealtime(item: PinnedComment): PreviewComment | null {
  const record = item as Partial<RealtimePreviewComment>;
  if (record.source !== REALTIME_PREVIEW_COMMENT_SOURCE) return null;
  if (!record.previewComment) return null;
  if (!isPreviewComment(record.previewComment)) return null;
  return normalizePreviewComment({
    ...record.previewComment,
    anchor: record.previewComment.anchor ?? item.anchor,
    thread: Array.isArray(record.previewComment.thread) && record.previewComment.thread.length > 0
      ? record.previewComment.thread
      : item.thread,
  });
}

function isPreviewComment(value: unknown): value is PreviewComment {
  if (!value || typeof value !== 'object') return false;
  const comment = value as Partial<PreviewComment>;
  return typeof comment.id === 'string' &&
    typeof comment.projectId === 'string' &&
    typeof comment.conversationId === 'string' &&
    typeof comment.filePath === 'string' &&
    typeof comment.elementId === 'string' &&
    typeof comment.selector === 'string' &&
    typeof comment.note === 'string' &&
    typeof comment.createdAt === 'number' &&
    typeof comment.updatedAt === 'number';
}

function normalizePreviewComment(comment: PreviewComment): PreviewComment {
  const position = {
    x: finite(comment.position?.x),
    y: finite(comment.position?.y),
    width: finite(comment.position?.width),
    height: finite(comment.position?.height),
  };
  return withoutUndefined({
    ...comment,
    position,
    anchor: normalizePreviewCommentAnchor(comment.anchor, comment.selector, position),
    selectionKind: comment.selectionKind === 'pod' ? 'pod' : 'element',
    memberCount: typeof comment.memberCount === 'number' && Number.isFinite(comment.memberCount)
      ? Math.max(0, Math.round(comment.memberCount))
      : undefined,
    podMembers: normalizeMembers(comment.podMembers),
    thread: normalizeThreadEntries(comment.thread, comment.note, comment.createdAt, comment.status),
    status: PREVIEW_COMMENT_STATUSES.has(comment.status) ? comment.status : 'open',
  });
}

function previewCommentThreadFromComment(comment: PreviewComment): PreviewCommentThreadEntry[] {
  return normalizeThreadEntries(comment.thread, comment.note, comment.createdAt, comment.status);
}

function normalizeThreadEntries(
  entries: PreviewCommentThreadEntry[] | undefined,
  note: string,
  createdAt: number,
  status: PreviewCommentStatus,
): PreviewCommentThreadEntry[] {
  const normalized = Array.isArray(entries)
    ? entries
        .map((entry) => ({
          authorId: String(entry.authorId || 'designer').trim().slice(0, 120) || 'designer',
          body: String(entry.body || '').replace(/\s+/g, ' ').trim().slice(0, 1000),
          createdAt: Number.isFinite(entry.createdAt) ? Math.round(entry.createdAt) : createdAt,
          ...(entry.resolved === true ? { resolved: true } : {}),
        }))
        .filter((entry) => entry.body)
    : [];
  const first = normalized[0];
  const primary = {
    authorId: first?.authorId ?? 'designer',
    body: String(note || '').replace(/\s+/g, ' ').trim().slice(0, 1000),
    createdAt: first?.createdAt ?? createdAt,
    ...(status === 'resolved' ? { resolved: true } : {}),
  };
  return withoutUndefined([
    primary,
    ...normalized.slice(1),
  ]);
}

function threadKey(thread: PreviewCommentThreadEntry[]): string {
  return thread
    .map((entry) => [
      entry.authorId,
      entry.createdAt,
      entry.resolved === true ? 'resolved' : 'open',
      entry.body,
    ].join('~'))
    .join('>');
}

function previewCommentAnchorFromComment(comment: PreviewComment): PreviewCommentAnchor {
  return normalizePreviewCommentAnchor(comment.anchor, comment.selector, comment.position);
}

function normalizePreviewCommentAnchor(
  input: PreviewCommentAnchor | undefined,
  fallbackXpath: string,
  position: PreviewComment['position'],
): PreviewCommentAnchor {
  const xpath = String(input?.xpath || fallbackXpath || '').replace(/\s+/g, ' ').trim().slice(0, 400);
  return {
    xpath: xpath || '/*',
    charOffset:
      typeof input?.charOffset === 'number' && Number.isFinite(input.charOffset)
        ? Math.max(0, Math.round(input.charOffset))
        : 0,
    pixelX:
      typeof input?.pixelX === 'number' && Number.isFinite(input.pixelX)
        ? Math.round(input.pixelX)
        : finite(position?.x),
    pixelY:
      typeof input?.pixelY === 'number' && Number.isFinite(input.pixelY)
        ? Math.round(input.pixelY)
        : finite(position?.y),
  };
}

function anchorKey(anchor: PreviewCommentAnchor): string {
  return [
    anchor.xpath,
    anchor.charOffset,
    anchor.pixelX ?? '',
    anchor.pixelY ?? '',
  ].join('~');
}

function normalizeMembers(members: PreviewCommentMember[] | undefined): PreviewCommentMember[] | undefined {
  if (!Array.isArray(members)) return undefined;
  const normalized = members
    .map((member) => ({
      elementId: String(member.elementId || '').trim(),
      selector: String(member.selector || '').trim(),
      label: String(member.label || '').trim(),
      text: String(member.text || ''),
      position: {
        x: finite(member.position?.x),
        y: finite(member.position?.y),
        width: finite(member.position?.width),
        height: finite(member.position?.height),
      },
      htmlHint: String(member.htmlHint || ''),
    }))
    .filter((member) => member.elementId && member.selector);
  return normalized.length > 0 ? normalized : undefined;
}

function comparePreviewComments(a: PreviewComment, b: PreviewComment): number {
  return b.updatedAt - a.updatedAt || b.createdAt - a.createdAt || a.id.localeCompare(b.id);
}

function finite(value: number | undefined): number {
  return Number.isFinite(value) ? Math.round(value as number) : 0;
}

function withoutUndefined<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
