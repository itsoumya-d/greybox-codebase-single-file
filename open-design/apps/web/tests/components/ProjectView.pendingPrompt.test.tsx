// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { act, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProjectView } from '../../src/components/ProjectView';
import {
  createRealtimeDocument,
  type RealtimeDocument,
} from '@ai-game-design-studio/realtime/client';
import {
  listPresenceStates,
  setLocalPresence,
} from '@ai-game-design-studio/realtime/awareness';
import type {
  AgentInfo,
  AppConfig,
  Conversation,
  GameArtBibleSummary,
  Project,
  SkillSummary,
} from '../../src/types';
import {
  createConversation,
  listConversations,
  listMessages,
} from '../../src/state/projects';
import {
  fetchPreviewComments,
  fetchProjectFiles,
  sendProjectStudioPresence,
} from '../../src/providers/registry';
import { useProjectFileEvents, type ProjectEvent } from '../../src/providers/project-events';
import {
  useProjectRealtimeSession,
  type ProjectRealtimeHookState,
} from '../../src/hooks/useProjectRealtimeSession';

vi.mock('../../src/i18n', () => ({
  useT: () => (key: string) => key,
}));

vi.mock('../../src/router', () => ({
  navigate: vi.fn(),
}));

vi.mock('../../src/providers/anthropic', () => ({
  streamMessage: vi.fn(),
}));

vi.mock('../../src/providers/daemon', () => ({
  fetchChatRunStatus: vi.fn(),
  listActiveChatRuns: vi.fn().mockResolvedValue([]),
  reattachDaemonRun: vi.fn(),
  streamViaDaemon: vi.fn(),
}));

vi.mock('../../src/providers/project-events', () => ({
  useProjectFileEvents: vi.fn(),
}));

vi.mock('../../src/hooks/useProjectRealtimeSession', () => ({
  useProjectRealtimeSession: vi.fn(),
}));

vi.mock('../../src/providers/registry', async () => {
  const actual = await vi.importActual<typeof import('../../src/providers/registry')>(
    '../../src/providers/registry',
  );
  return {
    ...actual,
    deletePreviewComment: vi.fn(),
    fetchGameArtBible: vi.fn(),
    fetchLiveArtifacts: vi.fn().mockResolvedValue([]),
    fetchPreviewComments: vi.fn(),
    fetchProjectFiles: vi.fn().mockResolvedValue([]),
    fetchProjectProModules: vi.fn().mockResolvedValue(null),
    fetchSkill: vi.fn(),
    getTemplate: vi.fn(),
    patchPreviewCommentStatus: vi.fn(),
    sendProjectStudioPresence: vi.fn(),
    upsertPreviewComment: vi.fn(),
    writeProjectTextFile: vi.fn(),
  };
});

vi.mock('../../src/state/projects', async () => {
  const actual = await vi.importActual<typeof import('../../src/state/projects')>(
    '../../src/state/projects',
  );
  return {
    ...actual,
    createConversation: vi.fn(),
    listConversations: vi.fn(),
    listMessages: vi.fn(),
    loadTabs: vi.fn().mockResolvedValue({ tabs: [], active: null }),
    patchConversation: vi.fn(),
    patchProject: vi.fn(),
    saveMessage: vi.fn(),
    saveTabs: vi.fn(),
  };
});

vi.mock('../../src/components/StudioChromeHeader', () => ({
  StudioChromeHeader: ({ children }: { children: ReactNode }) => (
    <header>{children}</header>
  ),
}));

vi.mock('../../src/components/AvatarMenu', () => ({
  AvatarMenu: () => null,
}));

vi.mock('../../src/components/FileWorkspace', () => ({
  FileWorkspace: ({ onPresenceChange }: {
    onPresenceChange?: (target: {
      cursor?: {
        column?: number;
        line?: number;
        selectionKind?: 'cursor' | 'node' | 'range' | 'region';
        selectionLabel?: string;
      };
      filePath?: string;
      mode: 'editing' | 'reviewing' | 'commenting' | 'viewing';
      surface: 'node-graph';
    }) => void;
  }) => (
    <div data-testid="file-workspace">
      <button
        type="button"
        data-testid="emit-presence-cursor"
        onClick={() => onPresenceChange?.({
          surface: 'node-graph',
          mode: 'editing',
          filePath: 'gameplay-logic.nodegraph.json',
          cursor: {
            selectionKind: 'node',
            selectionLabel: 'Phase Gate',
            line: 12,
            column: 4,
          },
        })}
      >
        Emit cursor
      </button>
    </div>
  ),
}));

vi.mock('../../src/components/Loading', () => ({
  CenteredLoader: () => <div data-testid="loader" />,
}));

vi.mock('../../src/components/ChatPane', () => ({
  ChatPane: ({ initialDraft }: { initialDraft?: string }) => (
    <textarea
      data-testid="chat-composer-input"
      readOnly
      value={initialDraft ?? ''}
    />
  ),
}));

const mockedListConversations = vi.mocked(listConversations);
const mockedCreateConversation = vi.mocked(createConversation);
const mockedListMessages = vi.mocked(listMessages);
const mockedFetchPreviewComments = vi.mocked(fetchPreviewComments);
const mockedFetchProjectFiles = vi.mocked(fetchProjectFiles);
const mockedSendProjectStudioPresence = vi.mocked(sendProjectStudioPresence);
const mockedUseProjectFileEvents = vi.mocked(useProjectFileEvents);
const mockedUseProjectRealtimeSession = vi.mocked(useProjectRealtimeSession);
let projectEventHandler: ((evt: ProjectEvent) => void) | null = null;

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const config: AppConfig = {
  mode: 'api',
  apiKey: '',
  baseUrl: '',
  model: '',
  agentId: null,
  gameSkillId: null,
  gameArtBibleId: null,
};

const project = (id: string, pendingPrompt?: string): Project => ({
  id,
  name: `Project ${id}`,
  skillId: null,
  gameArtBibleId: null,
  createdAt: 1,
  updatedAt: 1,
  ...(pendingPrompt ? { pendingPrompt } : {}),
});

const conversation = (projectId: string): Conversation => ({
  id: `conv-${projectId}`,
  projectId,
  title: null,
  createdAt: 1,
  updatedAt: 1,
});

function renderProjectView(
  currentProject: Project,
  onClearPendingPrompt = vi.fn(),
  onProjectsRefresh = vi.fn(),
) {
  return render(
    <ProjectView
      project={currentProject}
      routeFileName={null}
      config={config}
      agents={[] as AgentInfo[]}
      skills={[] as SkillSummary[]}
      gameArtBibles={[] as GameArtBibleSummary[]}
      daemonLive
      onModeChange={vi.fn()}
      onAgentChange={vi.fn()}
      onAgentModelChange={vi.fn()}
      onRefreshAgents={vi.fn()}
      onOpenSettings={vi.fn()}
      onBack={vi.fn()}
      onClearPendingPrompt={onClearPendingPrompt}
      onTouchProject={vi.fn()}
      onProjectChange={vi.fn()}
      onProjectsRefresh={onProjectsRefresh}
    />,
  );
}

describe('ProjectView pending prompt seeding', () => {
  beforeEach(() => {
    projectEventHandler = null;
    mockedUseProjectRealtimeSession.mockReturnValue(realtimeHookState());
    mockedUseProjectFileEvents.mockImplementation((_projectId, _enabled, onChange) => {
      projectEventHandler = onChange;
    });
    mockedListConversations.mockImplementation(async (projectId) => [
      conversation(projectId),
    ]);
    mockedCreateConversation.mockImplementation(async (projectId) =>
      conversation(projectId),
    );
    mockedListMessages.mockResolvedValue([]);
    mockedFetchPreviewComments.mockResolvedValue([]);
    mockedFetchProjectFiles.mockResolvedValue([]);
    mockedSendProjectStudioPresence.mockResolvedValue(null);
  });

  afterEach(() => {
    cleanup();
    projectEventHandler = null;
    vi.clearAllMocks();
  });

  it('prefills chat once when the project has a pending prompt and requests persistence clear', async () => {
    const onClearPendingPrompt = vi.fn();
    renderProjectView(project('with-prompt', 'Use this prompt'), onClearPendingPrompt);

    await waitFor(() => {
      expect(composerValue()).toBe('Use this prompt');
    });
    expect(onClearPendingPrompt).toHaveBeenCalledTimes(1);
  });

  it('does not prefill when re-entering a project after the pending prompt was cleared', async () => {
    renderProjectView(project('cleared'));

    await waitFor(() => {
      expect(composerValue()).toBe('');
    });
  });

  it('does not leak a prior project prompt into a template project without one', async () => {
    const first = project('source', 'Old seed');
    const second = {
      ...project('template'),
      metadata: { kind: 'template' as const, templateId: 'tmpl-1' },
    };
    const view = renderProjectView(first);

    await waitFor(() => {
      expect(composerValue()).toBe('Old seed');
    });

    view.rerender(
      <ProjectView
        project={second}
        routeFileName={null}
        config={config}
        agents={[]}
        skills={[]}
        gameArtBibles={[]}
        daemonLive
        onModeChange={vi.fn()}
        onAgentChange={vi.fn()}
        onAgentModelChange={vi.fn()}
        onRefreshAgents={vi.fn()}
        onOpenSettings={vi.fn()}
        onBack={vi.fn()}
        onClearPendingPrompt={vi.fn()}
        onTouchProject={vi.fn()}
        onProjectChange={vi.fn()}
        onProjectsRefresh={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(composerValue()).toBe('');
    });
  });

  it('renders live studio presence from project SSE events', async () => {
    renderProjectView(project('presence'));

    await waitFor(() => {
      expect(projectEventHandler).toBeTruthy();
    });

    act(() => {
      projectEventHandler?.({
        type: 'studio_presence',
        projectId: 'presence',
        clientId: 'director-1',
        actorName: 'Creative Director',
        surface: 'behavior-tree',
        filePath: 'enemy-captain.btree.json',
        mode: 'reviewing',
        updatedAt: Date.now(),
      });
      projectEventHandler?.({
        type: 'studio_presence',
        projectId: 'presence',
        clientId: 'systems-1',
        actorName: 'Systems Designer',
        surface: 'node-graph',
        filePath: 'gameplay-logic.nodegraph.json',
        mode: 'editing',
        cursor: {
          selectionKind: 'node',
          selectionLabel: 'Cooldown gate',
          line: 24,
          column: 3,
        },
        updatedAt: Date.now() + 1,
      });
    });

    const rail = await screen.findByTestId('studio-presence-rail');
    expect(rail.textContent).toContain('Creative Director');
    expect(rail.textContent).toContain('enemy-captain.btree.json');
    expect(rail.textContent).toContain('Systems Designer');
    expect(rail.textContent).toContain('gameplay-logic.nodegraph.json');
    expect(rail.textContent).toContain('Cooldown gate');
    expect(rail.textContent).toContain('L24:3');
  });

  it('refreshes open studio workspaces when merged document operations arrive', async () => {
    const onProjectsRefresh = vi.fn();
    renderProjectView(project('ops'), vi.fn(), onProjectsRefresh);

    await waitFor(() => {
      expect(projectEventHandler).toBeTruthy();
      expect(mockedFetchProjectFiles).toHaveBeenCalledWith('ops');
    });
    mockedFetchProjectFiles.mockClear();

    act(() => {
      projectEventHandler?.({
        type: 'studio_document_operations',
        action: 'applied',
        projectId: 'ops',
        fileName: 'gameplay-logic.nodegraph.json',
        revision: 3,
        appliedCount: 2,
        skippedCount: 0,
      });
    });

    await waitFor(() => {
      expect(mockedFetchProjectFiles).toHaveBeenCalledWith('ops');
    });
    expect(onProjectsRefresh).toHaveBeenCalledTimes(1);
  });

  it('publishes workspace cursor metadata through studio presence', async () => {
    renderProjectView(project('cursor'));

    fireEvent.click(await screen.findByTestId('emit-presence-cursor'));

    await waitFor(() => {
      expect(mockedSendProjectStudioPresence).toHaveBeenCalledWith(
        'cursor',
        expect.objectContaining({
          clientId: expect.stringMatching(/^studio-/),
          filePath: 'gameplay-logic.nodegraph.json',
          mode: 'editing',
          surface: 'node-graph',
          cursor: {
            selectionKind: 'node',
            selectionLabel: 'Phase Gate',
            line: 12,
            column: 4,
          },
        }),
      );
    });
  });

  it('publishes workspace cursor metadata into realtime awareness', async () => {
    const realtime = createRealtimeDocument({ guid: 'cursor-realtime' });
    mockedUseProjectRealtimeSession.mockReturnValue(realtimeHookState(realtime));
    renderProjectView(project('cursor-realtime'));

    fireEvent.click(await screen.findByTestId('emit-presence-cursor'));

    await waitFor(() => {
      expect(listPresenceStates(realtime.awareness)).toEqual([
        expect.objectContaining({
          kind: 'human',
          projectPresence: expect.objectContaining({
            projectId: 'cursor-realtime',
            mode: 'editing',
            surface: 'node-graph',
            filePath: 'gameplay-logic.nodegraph.json',
            cursor: {
              selectionKind: 'node',
              selectionLabel: 'Phase Gate',
              line: 12,
              column: 4,
            },
          }),
        }),
      ]);
    });
  });

  it('renders collaborator presence from realtime awareness', async () => {
    const realtime = createRealtimeDocument({ guid: 'presence-realtime' });
    setLocalPresence(realtime.awareness, {
      userId: 'level-designer-1',
      name: 'Remote Level Designer',
      color: '#3CC2E0',
      kind: 'human',
      updatedAt: Date.now(),
      projectPresence: {
        projectId: 'presence-realtime',
        clientId: 'level-designer-1',
        actorName: 'Remote Level Designer',
        mode: 'reviewing',
        surface: 'level-viewport',
        filePath: 'arena.levelboard.json',
        cursor: {
          selectionKind: 'region',
          selectionLabel: 'Spawn lane',
          line: 3,
          column: 2,
        },
      },
    });
    mockedUseProjectRealtimeSession.mockReturnValue(realtimeHookState(realtime, 1));

    renderProjectView(project('presence-realtime'));

    const rail = await screen.findByTestId('studio-presence-rail');
    expect(rail.textContent).toContain('Remote Level Designer');
    expect(rail.textContent).toContain('arena.levelboard.json');
    expect(rail.textContent).toContain('Spawn lane');
    expect(rail.textContent).toContain('L3:2');
  });
});

function composerValue(): string {
  return (screen.getByTestId('chat-composer-input') as HTMLTextAreaElement)
    .value;
}

function realtimeHookState(
  realtime?: RealtimeDocument,
  revision = 0,
): ProjectRealtimeHookState {
  return {
    session: realtime
      ? {
          realtime,
          socket: {} as WebSocket,
          binding: {} as NonNullable<ProjectRealtimeHookState['session']>['binding'],
          close: vi.fn(),
        }
      : null,
    status: realtime ? 'open' : 'idle',
    revision,
  };
}
