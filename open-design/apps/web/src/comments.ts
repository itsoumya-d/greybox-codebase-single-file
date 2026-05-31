// SPDX-License-Identifier: Apache-2.0

import type {
  ChatCommentAttachment,
  ChatMessage,
  PreviewCommentAnchor,
  PreviewCommentMember,
  PreviewComment,
  PreviewCommentSsePayload,
  PreviewCommentSelectionKind,
  PreviewCommentTarget,
} from './types';

export interface PreviewCommentSnapshot {
  filePath: string;
  elementId: string;
  selector: string;
  label: string;
  text: string;
  position: { x: number; y: number; width: number; height: number };
  htmlHint: string;
  anchor?: PreviewCommentAnchor;
  selectionKind?: PreviewCommentSelectionKind;
  memberCount?: number;
  podMembers?: PreviewCommentMember[];
}

export interface CommentOverlayBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function targetFromSnapshot(snapshot: PreviewCommentSnapshot): PreviewCommentTarget {
  const podMembers = normalizeMembers(snapshot.podMembers);
  const position = normalizePosition(snapshot.position);
  return {
    filePath: snapshot.filePath,
    elementId: snapshot.elementId,
    selector: snapshot.selector,
    label: snapshot.label,
    text: trimContextText(snapshot.text),
    position,
    htmlHint: trimHtmlHint(snapshot.htmlHint),
    anchor: normalizePreviewCommentAnchor(snapshot.anchor, snapshot.selector, position),
    selectionKind: snapshot.selectionKind === 'pod' ? 'pod' : 'element',
    memberCount:
      snapshot.selectionKind === 'pod'
        ? (podMembers.length > 0
            ? podMembers.length
            : Number.isFinite(snapshot.memberCount)
              ? Math.round(snapshot.memberCount as number)
              : 0)
        : undefined,
    podMembers: podMembers.length > 0 ? podMembers : undefined,
  };
}

export function overlayBoundsFromSnapshot(
  snapshot: PreviewCommentSnapshot,
  scale: number,
): CommentOverlayBounds {
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const position = normalizePosition(snapshot.position);
  return {
    left: position.x * safeScale,
    top: position.y * safeScale,
    width: Math.max(1, position.width * safeScale),
    height: Math.max(1, position.height * safeScale),
  };
}

export function liveSnapshotForComment(
  comment: PreviewComment,
  snapshots: Map<string, PreviewCommentSnapshot>,
): PreviewCommentSnapshot | null {
  const snapshot = snapshots.get(comment.elementId);
  if (!snapshot || snapshot.filePath !== comment.filePath) return null;
  return snapshot;
}

export function commentToAttachment(
  comment: PreviewComment,
  order: number,
): ChatCommentAttachment {
  const podMembers = normalizeMembers(comment.podMembers);
  const pagePosition = normalizePosition(comment.position);
  return {
    id: comment.id,
    order,
    filePath: comment.filePath,
    elementId: comment.elementId,
    selector: comment.selector,
    label: comment.label,
    comment: comment.note,
    currentText: trimContextText(comment.text),
    pagePosition,
    htmlHint: trimHtmlHint(comment.htmlHint),
    anchor: normalizePreviewCommentAnchor(comment.anchor, comment.selector, pagePosition),
    selectionKind: comment.selectionKind === 'pod' ? 'pod' : 'element',
    memberCount:
      comment.selectionKind === 'pod'
        ? (podMembers.length > 0
            ? podMembers.length
            : typeof comment.memberCount === 'number'
              ? Math.round(comment.memberCount)
              : 0)
        : undefined,
    podMembers: podMembers.length > 0 ? podMembers : undefined,
    source: 'saved-comment',
  };
}

export function commentsToAttachments(comments: PreviewComment[]): ChatCommentAttachment[] {
  return comments.map((comment, index) => commentToAttachment(comment, index + 1));
}

export function buildBoardCommentAttachments(input: {
  target: PreviewCommentTarget;
  notes: string[];
}): ChatCommentAttachment[] {
  const podMembers = normalizeMembers(input.target.podMembers);
  const selectionKind = input.target.selectionKind === 'pod' ? 'pod' : 'element';
  const pagePosition = normalizePosition(input.target.position);
  const anchor = normalizePreviewCommentAnchor(input.target.anchor, input.target.selector, pagePosition);
  const memberCount =
    selectionKind === 'pod'
      ? (podMembers.length > 0
          ? podMembers.length
          : typeof input.target.memberCount === 'number'
            ? Math.round(input.target.memberCount)
            : 0)
      : undefined;
  return input.notes
    .map((note) => note.trim())
    .filter(Boolean)
    .map((note, index) => ({
      id: `${input.target.elementId}-board-${index + 1}`,
      order: index + 1,
      filePath: input.target.filePath,
      elementId: input.target.elementId,
      selector: input.target.selector,
      label: input.target.label,
      comment: note,
      currentText: trimContextText(input.target.text),
      pagePosition,
      htmlHint: trimHtmlHint(input.target.htmlHint),
      anchor,
      selectionKind,
      memberCount,
      podMembers: podMembers.length > 0 ? podMembers : undefined,
      source: 'board-batch',
    }));
}

export function messageContentWithCommentAttachments(
  content: string,
  commentAttachments: ChatCommentAttachment[],
): string {
  if (commentAttachments.length === 0) return content;
  const visibleContent = content.trim() || '(No extra typed instruction.)';
  return `${visibleContent}${renderCommentAttachmentContext(commentAttachments)}`;
}

export function historyWithCommentAttachmentContext(
  history: ChatMessage[],
  messageId: string,
): ChatMessage[] {
  return history.map((message) => {
    const commentAttachments = message.commentAttachments ?? [];
    if (message.id !== messageId || message.role !== 'user' || commentAttachments.length === 0) return message;
    return {
      ...message,
      content: messageContentWithCommentAttachments(message.content, commentAttachments),
    };
  });
}

export function mergeAttachedComments(
  current: PreviewComment[],
  next: PreviewComment,
): PreviewComment[] {
  const byId = new Map(current.map((comment) => [comment.id, comment]));
  byId.set(next.id, next);
  return Array.from(byId.values());
}

export function removeAttachedComment(
  current: PreviewComment[],
  commentId: string,
): PreviewComment[] {
  return current.filter((comment) => comment.id !== commentId);
}

export function applyPreviewCommentEvent(
  current: PreviewComment[],
  evt: PreviewCommentSsePayload,
): PreviewComment[] {
  if (evt.action === 'deleted') {
    return evt.commentId ? current.filter((comment) => comment.id !== evt.commentId) : current;
  }
  if (!evt.comment) return current;
  const rest = current.filter((comment) => comment.id !== evt.comment!.id);
  return [evt.comment, ...rest];
}

export function applyPreviewCommentEventToAttached(
  current: PreviewComment[],
  evt: PreviewCommentSsePayload,
): PreviewComment[] {
  if (evt.action === 'deleted') {
    return evt.commentId ? removeAttachedComment(current, evt.commentId) : current;
  }
  if (!evt.comment || !current.some((comment) => comment.id === evt.comment!.id)) return current;
  return current.map((comment) => comment.id === evt.comment!.id ? evt.comment! : comment);
}

export function simplePositionLabel(position: PreviewComment['position']): string {
  const normalized = normalizePosition(position);
  return `x${normalized.x} y${normalized.y}`;
}

export function selectionKindLabel(
  selectionKind: PreviewCommentSelectionKind | undefined,
  memberCount?: number,
): string {
  if (selectionKind === 'pod') {
    return memberCount && memberCount > 0 ? `Pod · ${memberCount} items` : 'Pod';
  }
  return 'Element';
}

export function trimContextText(value: string): string {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > 160 ? `${text.slice(0, 157)}...` : text;
}

export function trimHtmlHint(value: string): string {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > 180 ? `${text.slice(0, 177)}...` : text;
}

function renderCommentAttachmentContext(commentAttachments: ChatCommentAttachment[]): string {
  const lines = [
    '',
    '',
    '<attached-preview-comments>',
    'Scope: apply the creator request to the attached preview target by default. Preserve unrelated elements.',
  ];
  commentAttachments.forEach((item) => {
    const position = normalizePosition(item.pagePosition);
    const selectionKind = item.selectionKind === 'pod' ? 'pod' : 'element';
    lines.push(
      '',
      `${item.order}. ${item.elementId}`,
      `targetKind: ${selectionKind}`,
      `file: ${item.filePath}`,
      `selector: ${item.selector}`,
      ...sourcePathContextLines(item),
      `label: ${item.label || '(unlabeled)'}`,
      `position: x${position.x} y${position.y} ${position.width}x${position.height}`,
      `anchor: ${formatPreviewCommentAnchor(item.anchor, item.selector, position)}`,
      `currentText: ${trimContextText(item.currentText || '') || '(empty)'}`,
      `htmlHint: ${trimHtmlHint(item.htmlHint || '') || '(none)'}`,
      `comment: ${item.comment}`,
    );
    if (selectionKind === 'pod') {
      lines.push(`memberCount: ${item.memberCount || item.podMembers?.length || 0}`);
      (item.podMembers ?? []).slice(0, 8).forEach((member, memberIndex) => {
        lines.push(
          `member.${memberIndex + 1}: ${member.elementId} | ${member.label || '(unlabeled)'} | ${member.selector}`,
        );
      });
    }
  });
  lines.push('</attached-preview-comments>');
  return lines.join('\n');
}

function sourcePathContextLines(item: ChatCommentAttachment): string[] {
  if (!/\[data-(?:agds|od)-source-path=/.test(item.selector)) return [];
  return [
    `sourcePath: ${item.elementId}`,
    'sourcePathRule: path-* addresses the source DOM child path captured before runtime scripts ran; patch that source element and preserve unrelated nodes.',
  ];
}

function normalizePosition(input: PreviewComment['position']): PreviewComment['position'] {
  return {
    x: finite(input?.x),
    y: finite(input?.y),
    width: finite(input?.width),
    height: finite(input?.height),
  };
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
        : position.x,
    pixelY:
      typeof input?.pixelY === 'number' && Number.isFinite(input.pixelY)
        ? Math.round(input.pixelY)
        : position.y,
  };
}

function formatPreviewCommentAnchor(
  input: PreviewCommentAnchor | undefined,
  fallbackXpath: string,
  position: PreviewComment['position'],
): string {
  const anchor = normalizePreviewCommentAnchor(input, fallbackXpath, position);
  const pixel = Number.isFinite(anchor.pixelX) && Number.isFinite(anchor.pixelY)
    ? ` pixel=${anchor.pixelX},${anchor.pixelY}`
    : '';
  return `${anchor.xpath} @${anchor.charOffset}${pixel}`;
}

function finite(value: number | undefined): number {
  return Number.isFinite(value) ? Math.round(value as number) : 0;
}

function normalizeMembers(input: PreviewCommentMember[] | undefined): PreviewCommentMember[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((member) => ({
      elementId: String(member.elementId || '').trim(),
      selector: String(member.selector || '').trim(),
      label: String(member.label || '').trim(),
      text: trimContextText(String(member.text || '')),
      position: normalizePosition(member.position),
      htmlHint: trimHtmlHint(String(member.htmlHint || '')),
    }))
    .filter((member) => member.elementId && member.selector);
}
