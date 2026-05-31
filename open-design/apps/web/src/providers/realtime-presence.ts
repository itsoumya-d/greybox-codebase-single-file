// SPDX-License-Identifier: Apache-2.0

import {
  PROJECT_STUDIO_PRESENCE_MODES,
  PROJECT_STUDIO_PRESENCE_SELECTION_KINDS,
  PROJECT_STUDIO_PRESENCE_SURFACES,
  type ProjectStudioPresenceCursor,
  type ProjectStudioPresenceMode,
  type ProjectStudioPresenceSsePayload,
  type ProjectStudioPresenceSurface,
  type ProjectStudioPresenceSelectionKind,
} from '@ai-game-design-studio/contracts';
import {
  summarizePresenceStates,
  type PresenceState,
  type PresenceSummary,
  type PresenceSummaryOptions,
  type ProjectPresenceState,
} from '@ai-game-design-studio/realtime/awareness';

const presenceModeSet = new Set<string>(PROJECT_STUDIO_PRESENCE_MODES);
const presenceSurfaceSet = new Set<string>(PROJECT_STUDIO_PRESENCE_SURFACES);
const selectionKindSet = new Set<string>(PROJECT_STUDIO_PRESENCE_SELECTION_KINDS);

function asPresenceMode(value: unknown): ProjectStudioPresenceMode | null {
  return typeof value === 'string' && presenceModeSet.has(value)
    ? (value as ProjectStudioPresenceMode)
    : null;
}

function asPresenceSurface(value: unknown): ProjectStudioPresenceSurface | undefined {
  return typeof value === 'string' && presenceSurfaceSet.has(value)
    ? (value as ProjectStudioPresenceSurface)
    : undefined;
}

function asSelectionKind(value: unknown): ProjectStudioPresenceSelectionKind | undefined {
  return typeof value === 'string' && selectionKindSet.has(value)
    ? (value as ProjectStudioPresenceSelectionKind)
    : undefined;
}

function normalizeCursor(
  cursor: ProjectPresenceState['cursor'],
): ProjectStudioPresenceCursor | undefined {
  if (!cursor || typeof cursor !== 'object') return undefined;
  const next: ProjectStudioPresenceCursor = {};
  if (typeof cursor.line === 'number' && Number.isFinite(cursor.line)) {
    next.line = Math.max(0, Math.floor(cursor.line));
  }
  if (typeof cursor.column === 'number' && Number.isFinite(cursor.column)) {
    next.column = Math.max(0, Math.floor(cursor.column));
  }
  const selectionKind = asSelectionKind(cursor.selectionKind);
  if (selectionKind) next.selectionKind = selectionKind;
  if (typeof cursor.selectionLabel === 'string' && cursor.selectionLabel.trim()) {
    next.selectionLabel = cursor.selectionLabel.slice(0, 120);
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

export function projectStudioPresenceFromRealtime(
  projectId: string,
  presence: PresenceState,
): ProjectStudioPresenceSsePayload | null {
  const projectPresence = presence.projectPresence;
  if (!projectPresence || projectPresence.projectId !== projectId) return null;
  const mode = asPresenceMode(projectPresence.mode);
  if (!mode) return null;
  const surface = asPresenceSurface(projectPresence.surface);
  const cursor = normalizeCursor(projectPresence.cursor);
  const clientId = projectPresence.clientId ?? presence.userId;
  if (!clientId) return null;

  return {
    type: 'studio_presence',
    projectId,
    clientId,
    actorName: projectPresence.actorName ?? presence.name,
    mode,
    ...(surface ? { surface } : {}),
    ...(projectPresence.filePath ? { filePath: projectPresence.filePath } : {}),
    ...(projectPresence.artifactId ? { artifactId: projectPresence.artifactId } : {}),
    ...(cursor ? { cursor } : {}),
    updatedAt: presence.updatedAt,
  };
}

export function hasRealtimeAgentWriting(
  projectId: string,
  presences: PresenceState[],
): boolean {
  return presences.some((presence) => {
    if (presence.agent?.writing !== true) return false;
    return !presence.projectPresence || presence.projectPresence.projectId === projectId;
  });
}

export interface SummarizeProjectRealtimePresenceOptions extends PresenceSummaryOptions {
  includeGlobalAgents?: boolean;
}

export function summarizeProjectRealtimePresence(
  projectId: string,
  presences: PresenceState[],
  options: SummarizeProjectRealtimePresenceOptions = {},
): PresenceSummary {
  const includeGlobalAgents = options.includeGlobalAgents ?? true;
  return summarizePresenceStates(
    presences.filter((presence) => {
      if (presence.projectPresence?.projectId === projectId) return true;
      return includeGlobalAgents && presence.kind === 'agent' && !presence.projectPresence;
    }),
    options,
  );
}

export interface MergeStudioPresencePayloadsOptions {
  ssePayloads: ProjectStudioPresenceSsePayload[];
  realtimePayloads: ProjectStudioPresenceSsePayload[];
  localClientId?: string | null;
  now?: number;
  staleMs?: number;
}

export function mergeStudioPresencePayloads({
  ssePayloads,
  realtimePayloads,
  localClientId,
  now = Date.now(),
  staleMs = 60_000,
}: MergeStudioPresencePayloadsOptions): ProjectStudioPresenceSsePayload[] {
  const cutoff = now - staleMs;
  const byClient = new Map<string, ProjectStudioPresenceSsePayload>();
  for (const payload of [...ssePayloads, ...realtimePayloads]) {
    if (payload.clientId === localClientId) continue;
    if (payload.updatedAt < cutoff) continue;
    const existing = byClient.get(payload.clientId);
    if (!existing || existing.updatedAt <= payload.updatedAt) {
      byClient.set(payload.clientId, payload);
    }
  }
  return Array.from(byClient.values()).sort((a, b) => b.updatedAt - a.updatedAt);
}
