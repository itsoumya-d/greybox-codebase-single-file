import type { OkResponse } from '../common.js';

export type PreviewCommentStatus =
  | 'open'
  | 'attached'
  | 'applying'
  | 'needs_review'
  | 'resolved'
  | 'failed';

export interface PreviewCommentPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type PreviewCommentSelectionKind = 'element' | 'pod';

export interface PreviewCommentMember {
  elementId: string;
  selector: string;
  label: string;
  text: string;
  position: PreviewCommentPosition;
  htmlHint: string;
}

export interface PreviewCommentAnchor {
  xpath: string;
  charOffset: number;
  pixelX?: number;
  pixelY?: number;
}

export interface PreviewCommentTarget {
  filePath: string;
  elementId: string;
  selector: string;
  label: string;
  text: string;
  position: PreviewCommentPosition;
  htmlHint: string;
  anchor?: PreviewCommentAnchor;
  selectionKind?: PreviewCommentSelectionKind;
  memberCount?: number;
  podMembers?: PreviewCommentMember[];
}

export interface PreviewCommentThreadEntry {
  authorId: string;
  body: string;
  createdAt: number;
  resolved?: boolean;
}

export interface PreviewComment {
  id: string;
  projectId: string;
  conversationId: string;
  filePath: string;
  elementId: string;
  selector: string;
  label: string;
  text: string;
  position: PreviewCommentPosition;
  htmlHint: string;
  anchor?: PreviewCommentAnchor;
  selectionKind?: PreviewCommentSelectionKind;
  memberCount?: number;
  podMembers?: PreviewCommentMember[];
  note: string;
  thread?: PreviewCommentThreadEntry[];
  status: PreviewCommentStatus;
  createdAt: number;
  updatedAt: number;
}

export interface PreviewCommentUpsertRequest {
  target: PreviewCommentTarget;
  note: string;
  thread?: PreviewCommentThreadEntry[];
}

export interface PreviewCommentStatusRequest {
  status: PreviewCommentStatus;
}

export interface PreviewCommentReplyRequest {
  body: string;
  authorId?: string;
}

export interface PreviewCommentResponse {
  comment: PreviewComment;
}

export interface PreviewCommentsResponse {
  comments: PreviewComment[];
}

export interface PreviewCommentDeleteResponse extends OkResponse {}

export type PreviewCommentSseAction = 'upserted' | 'status-updated' | 'replied' | 'deleted';

export interface PreviewCommentSsePayload {
  type: 'preview_comment';
  action: PreviewCommentSseAction;
  projectId: string;
  conversationId: string;
  comment?: PreviewComment;
  commentId?: string;
}
