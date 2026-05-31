// SPDX-License-Identifier: Apache-2.0

import * as awarenessProtocol from "y-protocols/awareness";
import type { Awareness } from "y-protocols/awareness";

export interface CursorPosition {
  surface: "chat" | "artifact" | "design-md" | "todo" | "comments";
  path?: string;
  index?: number;
  x?: number;
  y?: number;
}

export interface SelectionRange {
  surface: "artifact" | "design-md" | "todo";
  anchor: number;
  head: number;
  path?: string;
}

export interface ProjectPresenceState {
  clientId?: string;
  actorName?: string;
  projectId: string;
  surface?: string;
  filePath?: string;
  artifactId?: string;
  mode?: string;
  cursor?: {
    line?: number;
    column?: number;
    selectionKind?: string;
    selectionLabel?: string;
  };
}

export interface PresenceState {
  userId: string;
  name: string;
  color: string;
  avatarUrl?: string;
  kind: "human" | "agent";
  cursor?: CursorPosition;
  selection?: SelectionRange;
  projectPresence?: ProjectPresenceState;
  agent?: {
    writing: boolean;
    label?: string;
    toolCallId?: string;
  };
  updatedAt: number;
}

export interface PresenceSummary {
  totalCount: number;
  humanCount: number;
  agentCount: number;
  avatars: PresenceState[];
  overflowCount: number;
  agentWriting: boolean;
  agentWritingLabels: string[];
  latestUpdatedAt: number;
}

export interface PresenceSummaryOptions {
  maxAvatars?: number;
  now?: number;
  staleMs?: number;
}

export interface PinnedComment {
  id: string;
  artifactId: string;
  anchor: {
    xpath: string;
    charOffset: number;
    pixelX?: number;
    pixelY?: number;
  };
  thread: Array<{
    authorId: string;
    body: string;
    createdAt: number;
    resolved?: boolean;
  }>;
  createdAt: number;
  updatedAt: number;
}

export interface TodoPlanItem {
  id: string;
  body: string;
  status: "pending" | "in_progress" | "completed";
  claimedBy?: string;
  updatedAt: number;
}

export function setLocalPresence(awareness: Awareness, presence: PresenceState): void {
  awareness.setLocalState(presence);
}

export function setAgentWriting(awareness: Awareness, writing: boolean, label = "AGENT"): void {
  const current = awareness.getLocalState() as PresenceState | null;
  if (!current) return;
  awareness.setLocalState({
    ...current,
    kind: current.kind ?? "agent",
    agent: {
      ...(current.agent ?? {}),
      writing,
      label,
    },
    updatedAt: Date.now(),
  } satisfies PresenceState);
}

export function listPresenceStates(awareness: Awareness): PresenceState[] {
  return Array.from(awareness.getStates().values())
    .filter(isPresenceState)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function summarizePresence(
  awareness: Awareness,
  options: PresenceSummaryOptions = {},
): PresenceSummary {
  return summarizePresenceStates(listPresenceStates(awareness), options);
}

export function summarizePresenceStates(
  states: PresenceState[],
  options: PresenceSummaryOptions = {},
): PresenceSummary {
  const visibleStates = states
    .filter(isPresenceState)
    .filter((state) => !isStalePresence(state, options))
    .sort(presenceDisplaySort);
  const maxAvatars = Math.max(0, Math.floor(options.maxAvatars ?? 3));
  const agentWritingLabels = uniqueStrings(
    visibleStates
      .filter((state) => state.kind === "agent" && state.agent?.writing === true)
      .map((state) => state.agent?.label?.trim() || "AGENT"),
  );
  return {
    totalCount: visibleStates.length,
    humanCount: visibleStates.filter((state) => state.kind === "human").length,
    agentCount: visibleStates.filter((state) => state.kind === "agent").length,
    avatars: visibleStates.slice(0, maxAvatars),
    overflowCount: Math.max(0, visibleStates.length - maxAvatars),
    agentWriting: agentWritingLabels.length > 0,
    agentWritingLabels,
    latestUpdatedAt: visibleStates.reduce((latest, state) => Math.max(latest, state.updatedAt), 0),
  };
}

export function encodePresenceUpdate(awareness: Awareness, clientIds: number[]): Uint8Array {
  return awarenessProtocol.encodeAwarenessUpdate(awareness, clientIds);
}

export function applyPresenceUpdate(awareness: Awareness, update: Uint8Array, origin?: unknown): void {
  awarenessProtocol.applyAwarenessUpdate(awareness, update, origin);
}

function isPresenceState(value: unknown): value is PresenceState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PresenceState>;
  return (
    typeof candidate.userId === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.color === "string" &&
    (candidate.kind === "human" || candidate.kind === "agent") &&
    typeof candidate.updatedAt === "number"
  );
}

function isStalePresence(state: PresenceState, options: PresenceSummaryOptions): boolean {
  if (options.staleMs === undefined || options.now === undefined) return false;
  return state.updatedAt + options.staleMs < options.now;
}

function presenceDisplaySort(left: PresenceState, right: PresenceState): number {
  const leftRank = presenceDisplayRank(left);
  const rightRank = presenceDisplayRank(right);
  return leftRank - rightRank ||
    right.updatedAt - left.updatedAt ||
    left.name.localeCompare(right.name) ||
    left.userId.localeCompare(right.userId);
}

function presenceDisplayRank(state: PresenceState): number {
  if (state.kind === "agent" && state.agent?.writing === true) return 0;
  if (state.kind === "human") return 1;
  return 2;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}
