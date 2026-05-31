// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';

import { createRealtimeDocument } from '@ai-game-design-studio/realtime/client';

import {
  deleteRealtimePreviewComment,
  isRealtimePreviewCommentsInitialized,
  previewCommentConflictsFromRealtime,
  previewCommentToRealtime,
  previewCommentListsEqual,
  previewCommentsFromRealtime,
  resolveRealtimePreviewCommentConflict,
  seedRealtimePreviewComments,
  syncAttachedCommentsFromPreview,
  upsertRealtimePreviewComment,
} from '../../src/providers/realtime-comments';
import type { PreviewComment } from '../../src/types';

describe('realtime preview comment adapters', () => {
  it('mirrors preview comments into the Yjs comments array and restores them', () => {
    const realtime = createRealtimeDocument({ guid: 'comments-project' });
    const first = comment({ id: 'c1', elementId: 'boss-health', note: 'Make HP readability stronger.', updatedAt: 10 });
    const second = comment({ id: 'c2', elementId: 'spawn-gate', note: 'Clarify spawn timing.', updatedAt: 12 });

    seedRealtimePreviewComments(
      realtime.comments,
      realtime.meta,
      'project-1',
      'conversation-1',
      [first, second],
    );

    expect(isRealtimePreviewCommentsInitialized(realtime.meta, 'project-1', 'conversation-1')).toBe(true);
    expect(previewCommentsFromRealtime('project-1', 'conversation-1', realtime.comments.toArray())).toEqual([
      withPrimaryThread(second),
      withPrimaryThread(first),
    ]);
    expect(previewCommentsFromRealtime('project-1', 'conversation-2', realtime.comments.toArray())).toEqual([]);
  });

  it('upserts, deletes, and keeps attached comment copies in sync', () => {
    const realtime = createRealtimeDocument({ guid: 'comments-project' });
    const first = comment({ id: 'c1', elementId: 'boss-health', note: 'Original', updatedAt: 10 });
    const updated = comment({
      id: 'c1',
      elementId: 'boss-health',
      note: 'Use controller-readable damage cadence.',
      status: 'needs_review',
      updatedAt: 14,
    });
    const other = comment({ id: 'c2', elementId: 'spawn-gate', note: 'Clarify spawn timing.', updatedAt: 12 });

    upsertRealtimePreviewComment(realtime.comments, realtime.meta, first);
    upsertRealtimePreviewComment(realtime.comments, realtime.meta, other);
    upsertRealtimePreviewComment(realtime.comments, realtime.meta, updated);

    const restored = previewCommentsFromRealtime('project-1', 'conversation-1', realtime.comments.toArray());
    expect(restored).toEqual([withPrimaryThread(updated), withPrimaryThread(other)]);
    expect(syncAttachedCommentsFromPreview([first, other], restored)).toEqual([
      withPrimaryThread(updated),
      withPrimaryThread(other),
    ]);

    deleteRealtimePreviewComment(realtime.comments, realtime.meta, 'project-1', 'conversation-1', 'c1');
    expect(previewCommentsFromRealtime('project-1', 'conversation-1', realtime.comments.toArray())).toEqual([
      withPrimaryThread(other),
    ]);
    expect(syncAttachedCommentsFromPreview([updated, other], [other])).toEqual([other]);
    expect(syncAttachedCommentsFromPreview([updated, other], [
      { ...updated, status: 'resolved' },
      other,
    ])).toEqual([other]);
  });

  it('compares comment lists by saved comment identity and revision fields', () => {
    const first = comment({ id: 'c1', note: 'Original', updatedAt: 10 });
    expect(previewCommentListsEqual([first], [comment({ id: 'c1', note: 'Original', updatedAt: 10 })])).toBe(true);
    expect(previewCommentListsEqual([first], [comment({ id: 'c1', note: 'Updated', updatedAt: 11 })])).toBe(false);
  });

  it('maps resolved preview comments onto the Yjs thread resolved flag', () => {
    const open = previewCommentToRealtime(comment({ id: 'c1', status: 'open' }));
    const resolved = previewCommentToRealtime(comment({ id: 'c1', status: 'resolved' }));

    expect(open.thread[0]).toMatchObject({ body: 'Comment' });
    expect(open.thread[0]?.resolved).toBeUndefined();
    expect(resolved.thread[0]).toMatchObject({ body: 'Comment', resolved: true });
  });

  it('preserves threaded replies when converting through the realtime comment model', () => {
    const threaded = comment({
      id: 'c1',
      note: 'Primary note',
      thread: [
        { authorId: 'designer', body: 'Primary note', createdAt: 10 },
        { authorId: 'combat-designer', body: 'Ship it with larger boss HP.', createdAt: 12 },
      ],
      updatedAt: 12,
    });

    const realtime = previewCommentToRealtime(threaded);

    expect(realtime.thread).toEqual(threaded.thread);
    expect(previewCommentsFromRealtime('project-1', 'conversation-1', [realtime])[0]?.thread).toEqual(threaded.thread);
  });

  it('detects duplicate Yjs versions as conflicts and resolves to the chosen version', () => {
    const realtime = createRealtimeDocument({ guid: 'comments-project' });
    const local = comment({ id: 'c1', note: 'Keep the HUD near the boss lane.', updatedAt: 20 });
    const remote = comment({ id: 'c1', note: 'Move the HUD under the minimap.', updatedAt: 22 });

    realtime.comments.insert(0, [
      previewCommentToRealtime(local),
      previewCommentToRealtime(remote),
    ]);

    const conflicts = previewCommentConflictsFromRealtime('project-1', 'conversation-1', realtime.comments.toArray());
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      id: 'c1',
      latest: expect.objectContaining({ note: 'Move the HUD under the minimap.' }),
      alternatives: [expect.objectContaining({ note: 'Keep the HUD near the boss lane.' })],
    });

    resolveRealtimePreviewCommentConflict(realtime.comments, realtime.meta, local);

    expect(previewCommentConflictsFromRealtime('project-1', 'conversation-1', realtime.comments.toArray())).toEqual([]);
    expect(previewCommentsFromRealtime('project-1', 'conversation-1', realtime.comments.toArray())).toEqual([
      withPrimaryThread(local),
    ]);
  });
});

function comment(patch: Partial<PreviewComment>): PreviewComment {
  return {
    id: 'c1',
    projectId: 'project-1',
    conversationId: 'conversation-1',
    filePath: 'arena.html',
    elementId: 'boss-health',
    selector: '[data-agds-id="boss-health"]',
    label: 'div.boss-health',
    text: 'Boss HP: 3',
    position: { x: 10, y: 20, width: 120, height: 40 },
    htmlHint: '<div data-agds-id="boss-health">',
    selectionKind: 'element',
    note: 'Comment',
    status: 'open',
    createdAt: 9,
    updatedAt: 10,
    ...patch,
  };
}

function withPrimaryThread(comment: PreviewComment): PreviewComment {
  const anchor = comment.anchor ?? {
    xpath: comment.selector,
    charOffset: 0,
    pixelX: comment.position.x,
    pixelY: comment.position.y,
  };
  if (comment.thread?.length) return { ...comment, anchor };
  return {
    ...comment,
    anchor,
    thread: [
      {
        authorId: 'designer',
        body: comment.note,
        createdAt: comment.createdAt,
        ...(comment.status === 'resolved' ? { resolved: true } : {}),
      },
    ],
  };
}
