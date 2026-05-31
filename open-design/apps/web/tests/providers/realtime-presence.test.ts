// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';

import type { PresenceState } from '@ai-game-design-studio/realtime/awareness';

import {
  hasRealtimeAgentWriting,
  mergeStudioPresencePayloads,
  projectStudioPresenceFromRealtime,
  summarizeProjectRealtimePresence,
} from '../../src/providers/realtime-presence';

describe('realtime presence adapters', () => {
  it('converts Yjs awareness into studio presence payloads', () => {
    const payload = projectStudioPresenceFromRealtime('project-1', {
      userId: 'socket-1',
      name: 'Avery',
      color: '#ff6b35',
      kind: 'human',
      updatedAt: 42,
      projectPresence: {
        projectId: 'project-1',
        clientId: 'client-1',
        mode: 'editing',
        surface: 'game-files',
        filePath: 'DESIGN.md',
        cursor: {
          line: 12.8,
          column: 5,
          selectionKind: 'range',
          selectionLabel: 'Spawn cadence',
        },
      },
    } satisfies PresenceState);

    expect(payload).toEqual({
      type: 'studio_presence',
      projectId: 'project-1',
      clientId: 'client-1',
      actorName: 'Avery',
      mode: 'editing',
      surface: 'game-files',
      filePath: 'DESIGN.md',
      cursor: {
        line: 12,
        column: 5,
        selectionKind: 'range',
        selectionLabel: 'Spawn cadence',
      },
      updatedAt: 42,
    });
  });

  it('drops awareness for other projects or unknown modes', () => {
    const base: PresenceState = {
      userId: 'socket-1',
      name: 'Avery',
      color: '#ff6b35',
      kind: 'human',
      updatedAt: 42,
      projectPresence: {
        projectId: 'project-2',
        mode: 'editing',
      },
    };

    expect(projectStudioPresenceFromRealtime('project-1', base)).toBeNull();
    expect(projectStudioPresenceFromRealtime('project-2', {
      ...base,
      projectPresence: {
        projectId: 'project-2',
        mode: 'drifting',
      },
    })).toBeNull();
  });

  it('merges realtime payloads over stale SSE entries', () => {
    const merged = mergeStudioPresencePayloads({
      now: 1_000,
      staleMs: 500,
      localClientId: 'self',
      ssePayloads: [
        {
          type: 'studio_presence',
          projectId: 'project-1',
          clientId: 'client-1',
          mode: 'viewing',
          updatedAt: 200,
        },
        {
          type: 'studio_presence',
          projectId: 'project-1',
          clientId: 'client-2',
          mode: 'viewing',
          updatedAt: 700,
        },
      ],
      realtimePayloads: [
        {
          type: 'studio_presence',
          projectId: 'project-1',
          clientId: 'client-2',
          mode: 'editing',
          updatedAt: 900,
        },
        {
          type: 'studio_presence',
          projectId: 'project-1',
          clientId: 'self',
          mode: 'editing',
          updatedAt: 950,
        },
      ],
    });

    expect(merged).toEqual([
      {
        type: 'studio_presence',
        projectId: 'project-1',
        clientId: 'client-2',
        mode: 'editing',
        updatedAt: 900,
      },
    ]);
  });

  it('detects remote agent writing awareness scoped to the current project', () => {
    const presences: PresenceState[] = [
      {
        userId: 'agent-1',
        name: 'Greybox Agent',
        color: '#3CC2E0',
        kind: 'agent',
        updatedAt: 100,
        agent: { writing: true, label: 'AGENT' },
        projectPresence: { projectId: 'project-1', mode: 'editing' },
      },
      {
        userId: 'agent-2',
        name: 'Other Agent',
        color: '#3CC2E0',
        kind: 'agent',
        updatedAt: 101,
        agent: { writing: true, label: 'AGENT' },
        projectPresence: { projectId: 'project-2', mode: 'editing' },
      },
    ];

    expect(hasRealtimeAgentWriting('project-1', presences)).toBe(true);
    expect(hasRealtimeAgentWriting('project-3', presences)).toBe(false);
  });

  it('detects a collaborator tab running an agent from its human awareness state', () => {
    const presences: PresenceState[] = [
      {
        userId: 'designer-1',
        name: 'Combat Designer',
        color: '#FF6B35',
        kind: 'human',
        updatedAt: 100,
        agent: { writing: true, label: 'AGENT' },
        projectPresence: {
          projectId: 'project-1',
          clientId: 'designer-1',
          mode: 'editing',
          surface: 'node-graph',
          filePath: 'gameplay-logic.nodegraph.json',
        },
      },
      {
        userId: 'designer-2',
        name: 'Level Designer',
        color: '#FF6B35',
        kind: 'human',
        updatedAt: 101,
        projectPresence: { projectId: 'project-1', mode: 'reviewing' },
      },
    ];

    expect(hasRealtimeAgentWriting('project-1', presences)).toBe(true);
    expect(hasRealtimeAgentWriting('project-2', presences)).toBe(false);
  });

  it('summarizes project-scoped realtime awareness for the presence rail', () => {
    const presences: PresenceState[] = [
      {
        userId: 'designer-1',
        name: 'Systems Designer',
        color: '#FF6B35',
        kind: 'human',
        updatedAt: 800,
        projectPresence: { projectId: 'project-1', mode: 'editing' },
      },
      {
        userId: 'designer-2',
        name: 'Narrative Designer',
        color: '#FF6B35',
        kind: 'human',
        updatedAt: 950,
        projectPresence: { projectId: 'project-1', mode: 'reviewing' },
      },
      {
        userId: 'agent-1',
        name: 'Greybox Agent',
        color: '#3CC2E0',
        kind: 'agent',
        updatedAt: 900,
        agent: { writing: true, label: 'Plan Writer' },
        projectPresence: { projectId: 'project-1', mode: 'editing' },
      },
      {
        userId: 'agent-global',
        name: 'Background Agent',
        color: '#3CC2E0',
        kind: 'agent',
        updatedAt: 870,
        agent: { writing: true, label: 'AGENT' },
      },
      {
        userId: 'designer-other',
        name: 'Other Project',
        color: '#FF6B35',
        kind: 'human',
        updatedAt: 990,
        projectPresence: { projectId: 'project-2', mode: 'editing' },
      },
      {
        userId: 'designer-stale',
        name: 'Stale Designer',
        color: '#FF6B35',
        kind: 'human',
        updatedAt: 100,
        projectPresence: { projectId: 'project-1', mode: 'editing' },
      },
    ];

    const summary = summarizeProjectRealtimePresence('project-1', presences, {
      maxAvatars: 2,
      now: 1_000,
      staleMs: 500,
    });

    expect(summary.totalCount).toBe(4);
    expect(summary.humanCount).toBe(2);
    expect(summary.agentCount).toBe(2);
    expect(summary.overflowCount).toBe(2);
    expect(summary.agentWriting).toBe(true);
    expect(summary.agentWritingLabels).toEqual(['Plan Writer', 'AGENT']);
    expect(summary.latestUpdatedAt).toBe(950);
    expect(summary.avatars.map((presence) => presence.userId)).toEqual([
      'agent-1',
      'agent-global',
    ]);
  });

  it('can exclude global agent awareness from project summaries', () => {
    const summary = summarizeProjectRealtimePresence('project-1', [
      {
        userId: 'agent-project',
        name: 'Project Agent',
        color: '#3CC2E0',
        kind: 'agent',
        updatedAt: 100,
        agent: { writing: true, label: 'Project Agent' },
        projectPresence: { projectId: 'project-1', mode: 'editing' },
      },
      {
        userId: 'agent-global',
        name: 'Global Agent',
        color: '#3CC2E0',
        kind: 'agent',
        updatedAt: 101,
        agent: { writing: true, label: 'Global Agent' },
      },
    ], {
      includeGlobalAgents: false,
    });

    expect(summary.totalCount).toBe(1);
    expect(summary.agentWritingLabels).toEqual(['Project Agent']);
  });
});
