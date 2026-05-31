// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GameStudioDocumentEditor } from '../../src/components/GameStudioDocumentEditor';
import {
  applyProjectStudioDocumentDraftOperations,
  applyProjectStudioDocumentOperations,
  fetchProjectFileText,
  writeProjectTextFile,
} from '../../src/providers/registry';
import type { ProjectFile } from '../../src/types';

vi.mock('../../src/providers/registry', async () => {
  const actual = await vi.importActual<typeof import('../../src/providers/registry')>(
    '../../src/providers/registry',
  );
  return {
    ...actual,
    applyProjectStudioDocumentDraftOperations: vi.fn(),
    applyProjectStudioDocumentOperations: vi.fn(),
    fetchProjectFileText: vi.fn(),
    writeProjectTextFile: vi.fn(),
  };
});

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const templatesRoot = resolve(repoRoot, 'templates');

const mockedFetchProjectFileText = vi.mocked(fetchProjectFileText);
const mockedWriteProjectTextFile = vi.mocked(writeProjectTextFile);
const mockedApplyProjectStudioDocumentDraftOperations = vi.mocked(applyProjectStudioDocumentDraftOperations);
const mockedApplyProjectStudioDocumentOperations = vi.mocked(applyProjectStudioDocumentOperations);

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const STUDIO_DOCUMENT_CASES = [
  {
    fileName: 'gameplay-encounter.gameview.json',
    kind: 'game-viewport',
    label: 'Game Viewport',
    title: 'Gameplay Encounter Viewport',
    hierarchyText: 'Shortcut Core',
    renderedText: 'Readable Cover',
    advancedText: [
      /Objective Sightline/i,
      /Storm state lowers long sightlines/i,
      /Ember Court controls the shortcut core/i,
      /Upper Cover Field/i,
      /Foundry Hazard Pocket/i,
      /Ash Safe Read/i,
      /Molten Ridge Sculpt/i,
      /third-person shoulder/i,
    ],
  },
  {
    fileName: 'gameplay-logic.nodegraph.json',
    kind: 'node-graph',
    label: 'Node Graph',
    title: 'Gameplay Logic Graph',
    hierarchyText: 'Grant Shortcut Reward',
    renderedText: 'Spawn Encounter Wave',
    advancedText: [
      /Gameplay Mechanics/i,
      /Economy & Progression/i,
      /reward-budget check/i,
      /Procedural variants/i,
    ],
  },
  {
    fileName: 'enemy-captain.btree.json',
    kind: 'behavior-tree',
    label: 'Behavior Tree',
    title: 'Enemy Captain Behavior Tree',
    hierarchyText: 'Combat Director',
    renderedText: 'Telegraphed Burst',
    advancedText: [
      /Flashlight cone widens/i,
      /Every support call has a cancel window/i,
      /Delay support calls when player health is critical/i,
    ],
  },
  {
    fileName: 'combat-camera.systems.json',
    kind: 'game-system',
    label: 'Game System',
    title: 'Combat And Camera System Spec',
    hierarchyText: 'Time To Master Core Verb',
    renderedText: 'Combat Core Loop',
    advancedText: [
      /Vertical slice combat encounter/i,
      /death-readability/i,
      /No pay-to-win combat tuning/i,
      /mobile/i,
      /solo/i,
    ],
  },
] satisfies Array<{
  advancedText: RegExp[];
  fileName: string;
  hierarchyText: string;
  kind: Extract<ProjectFile['kind'], 'game-viewport' | 'node-graph' | 'behavior-tree' | 'game-system'>;
  label: string;
  renderedText: string;
  title: string;
}>;

beforeEach(() => {
  mockedApplyProjectStudioDocumentDraftOperations.mockResolvedValue(null);
  mockedApplyProjectStudioDocumentOperations.mockResolvedValue(null);
  mockedWriteProjectTextFile.mockImplementation(async (_projectId, name) => fileFor(name, 'text'));
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  vi.clearAllMocks();
});

function fileFor(name: string, kind: ProjectFile['kind']): ProjectFile {
  return {
    name,
    path: name,
    type: 'file',
    size: 100,
    mtime: 1700000000,
    kind,
    mime: 'application/json',
  };
}

describe('GameStudioDocumentEditor shipped studio document rendering', () => {
  it.each(STUDIO_DOCUMENT_CASES)(
    'renders and saves $fileName through the studio editor',
    async ({ advancedText, fileName, hierarchyText, kind, label, renderedText, title }) => {
      const template = readFileSync(resolve(templatesRoot, fileName), 'utf8');
      mockedFetchProjectFileText.mockResolvedValueOnce(template);

      render(
        <GameStudioDocumentEditor
          projectId="project-1"
          file={fileFor(fileName, kind) as ProjectFile & { kind: typeof kind }}
        />,
      );

      expect(await screen.findByTestId('game-studio-document-editor')).toBeTruthy();
      expect(screen.getByText(label)).toBeTruthy();
      expect(screen.getAllByText(title).length).toBeGreaterThan(0);
      expect(screen.getAllByText(hierarchyText).length).toBeGreaterThan(0);
      expect(screen.getAllByText(renderedText).length).toBeGreaterThan(0);
      for (const text of advancedText) {
        expect(screen.getAllByText(text).length).toBeGreaterThan(0);
      }
      expect(screen.queryByText(/Invalid JSON/i)).toBeNull();
      expect(screen.queryByText(/Could not save/i)).toBeNull();

      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => {
        expect(mockedWriteProjectTextFile).toHaveBeenCalledWith(
          'project-1',
          fileName,
          expect.stringContaining(`"kind": "${kind}"`),
        );
      });
      const savedContent = mockedWriteProjectTextFile.mock.calls.at(-1)?.[2];
      expect(JSON.parse(String(savedContent))).toMatchObject({ kind, title });
    },
  );

  it('submits browser source edits through the studio document operation merge route', async () => {
    const fileName = 'gameplay-logic.nodegraph.json';
    const template = readFileSync(resolve(templatesRoot, fileName), 'utf8');
    mockedFetchProjectFileText.mockResolvedValueOnce(template);
    mockedApplyProjectStudioDocumentOperations.mockImplementationOnce(async (projectId, input) => {
      const operation = input.operations.find((candidate) => candidate.type === 'text-splice');
      const value = operation?.value as { index: number; deleteCount: number; insertText: string } | undefined;
      const content = value
        ? `${template.slice(0, value.index)}${value.insertText}${template.slice(value.index + value.deleteCount)}`
        : template;
      return {
        projectId,
        fileName: input.fileName,
        revision: 1,
        content,
        appliedOperations: operation
          ? [{
              id: operation.id,
              actorId: operation.actorId,
              type: operation.type,
              path: '/__source__',
              status: 'applied' as const,
            }]
          : [],
        skippedOperations: [],
      };
    });

    render(
      <GameStudioDocumentEditor
        projectId="project-1"
        file={fileFor(fileName, 'node-graph') as ProjectFile & { kind: 'node-graph' }}
      />,
    );

    const source = await screen.findByTestId('game-studio-document-source') as HTMLTextAreaElement;
    const draft = JSON.parse(source.value);
    draft.title = 'Operation Merged Gameplay Logic';
    fireEvent.change(source, { target: { value: JSON.stringify(draft, null, 2) } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(mockedApplyProjectStudioDocumentOperations).toHaveBeenCalledWith(
        'project-1',
        expect.objectContaining({
          fileName,
          operations: expect.arrayContaining([
            expect.objectContaining({
              actorId: expect.stringMatching(/^studio-doc-/),
              path: ['__source__'],
              type: 'text-splice',
              value: expect.objectContaining({
                deleteCount: expect.any(Number),
                index: expect.any(Number),
                insertText: expect.stringContaining('Operation Merged Gameplay Logic'),
              }),
            }),
          ]),
        }),
      );
    });
    expect(mockedWriteProjectTextFile).not.toHaveBeenCalled();
    expect(JSON.parse(source.value).title).toBe('Operation Merged Gameplay Logic');
  });

  it('live-merges valid JSON source edits through debounced text-splice operations', async () => {
    const fileName = 'gameplay-logic.nodegraph.json';
    const template = readFileSync(resolve(templatesRoot, fileName), 'utf8');
    mockedFetchProjectFileText.mockResolvedValueOnce(template);
    mockedApplyProjectStudioDocumentOperations.mockImplementationOnce(async (projectId, input) => {
      const operation = input.operations.find((candidate) => candidate.type === 'text-splice');
      const value = operation?.value as { index: number; deleteCount: number; insertText: string } | undefined;
      const content = value
        ? `${template.slice(0, value.index)}${value.insertText}${template.slice(value.index + value.deleteCount)}`
        : template;
      return {
        projectId,
        fileName: input.fileName,
        revision: 1,
        content,
        appliedOperations: operation
          ? [{
              id: operation.id,
              actorId: operation.actorId,
              type: operation.type,
              path: '/__source__',
              status: 'applied' as const,
            }]
          : [],
        skippedOperations: [],
      };
    });

    render(
      <GameStudioDocumentEditor
        projectId="project-1"
        file={fileFor(fileName, 'node-graph') as ProjectFile & { kind: 'node-graph' }}
      />,
    );

    const source = await screen.findByTestId('game-studio-document-source') as HTMLTextAreaElement;
    vi.useFakeTimers();
    const draft = JSON.parse(source.value);
    draft.title = 'Live Merged Gameplay Logic';
    fireEvent.change(source, { target: { value: JSON.stringify(draft, null, 2) } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });
    vi.useRealTimers();

    await waitFor(() => {
      expect(mockedApplyProjectStudioDocumentOperations).toHaveBeenCalledWith(
        'project-1',
        expect.objectContaining({
          fileName,
          operations: expect.arrayContaining([
            expect.objectContaining({
              actorId: expect.stringMatching(/^studio-doc-/),
              path: ['__source__'],
              type: 'text-splice',
              value: expect.objectContaining({
                insertText: expect.stringContaining('Live Merged Gameplay Logic'),
              }),
            }),
          ]),
        }),
      );
    });
    expect(mockedWriteProjectTextFile).not.toHaveBeenCalled();
    expect(JSON.parse(source.value).title).toBe('Live Merged Gameplay Logic');
  });

  it('streams invalid in-progress JSON source drafts through draft text-splice operations', async () => {
    const fileName = 'gameplay-logic.nodegraph.json';
    const template = readFileSync(resolve(templatesRoot, fileName), 'utf8');
    mockedFetchProjectFileText.mockResolvedValueOnce(template);
    mockedApplyProjectStudioDocumentDraftOperations.mockImplementation(async (projectId, input) => {
      const operation = input.operations.find((candidate) => candidate.type === 'text-splice');
      const value = operation?.value as { index: number; deleteCount: number; insertText: string } | undefined;
      const content = value
        ? `${template.slice(0, value.index)}${value.insertText}${template.slice(value.index + value.deleteCount)}`
        : template;
      return {
        projectId,
        fileName: input.fileName,
        revision: 1,
        content,
        appliedOperations: operation
          ? [{
              id: operation.id,
              actorId: operation.actorId,
              type: operation.type,
              path: '/__source__',
              status: 'applied' as const,
            }]
          : [],
        skippedOperations: [],
      };
    });

    render(
      <GameStudioDocumentEditor
        projectId="project-1"
        file={fileFor(fileName, 'node-graph') as ProjectFile & { kind: 'node-graph' }}
      />,
    );

    const source = await screen.findByTestId('game-studio-document-source') as HTMLTextAreaElement;
    const invalidDraft = source.value.replace('"Gameplay Logic Graph"', '"Gameplay Logic Graph');
    fireEvent.change(source, { target: { value: invalidDraft } });

    await waitFor(() => {
      expect(mockedApplyProjectStudioDocumentDraftOperations).toHaveBeenCalledWith(
        'project-1',
        expect.objectContaining({
          fileName,
          operations: expect.arrayContaining([
            expect.objectContaining({
              actorId: expect.stringMatching(/^studio-doc-/),
              path: ['__source__'],
              type: 'text-splice',
              value: expect.objectContaining({
                deleteCount: expect.any(Number),
                index: expect.any(Number),
              }),
            }),
          ]),
        }),
      );
    });
    expect(mockedApplyProjectStudioDocumentOperations).not.toHaveBeenCalled();
    expect(mockedWriteProjectTextFile).not.toHaveBeenCalled();
    expect(source.value).toBe(invalidDraft);
  });

  it('emits studio presence cursor metadata for document selections and JSON source focus', async () => {
    const fileName = 'gameplay-logic.nodegraph.json';
    const template = readFileSync(resolve(templatesRoot, fileName), 'utf8');
    const onPresenceCursorChange = vi.fn();
    mockedFetchProjectFileText.mockResolvedValueOnce(template);

    render(
      <GameStudioDocumentEditor
        projectId="project-1"
        file={fileFor(fileName, 'node-graph') as ProjectFile & { kind: 'node-graph' }}
        onPresenceCursorChange={onPresenceCursorChange}
      />,
    );

    expect(await screen.findByTestId('game-studio-document-editor')).toBeTruthy();
    fireEvent.click(screen.getAllByText('Grant Shortcut Reward')[0]!.closest('button')!);

    await waitFor(() => {
      expect(onPresenceCursorChange).toHaveBeenCalledWith(
        expect.objectContaining({
          selectionKind: 'node',
          selectionLabel: 'Grant Shortcut Reward',
        }),
      );
    });

    const source = screen.getByTestId('game-studio-document-source') as HTMLTextAreaElement;
    source.setSelectionRange(8, 8);
    fireEvent.select(source);

    expect(onPresenceCursorChange).toHaveBeenCalledWith(
      expect.objectContaining({
        selectionKind: 'cursor',
        selectionLabel: 'JSON Source',
      }),
    );
  });

  it('renders remote collaborator cursors inside the studio document surface', async () => {
    const fileName = 'gameplay-logic.nodegraph.json';
    const template = readFileSync(resolve(templatesRoot, fileName), 'utf8');
    mockedFetchProjectFileText.mockResolvedValueOnce(template);

    render(
      <GameStudioDocumentEditor
        projectId="project-1"
        file={fileFor(fileName, 'node-graph') as ProjectFile & { kind: 'node-graph' }}
        remotePresence={[{
          type: 'studio_presence',
          projectId: 'project-1',
          clientId: 'systems-1',
          actorName: 'Systems Designer',
          surface: 'node-graph',
          mode: 'editing',
          filePath: fileName,
          cursor: {
            selectionKind: 'cursor',
            selectionLabel: 'JSON Source',
            line: 18,
            column: 6,
          },
          updatedAt: Date.now(),
        }]}
      />,
    );

    const cursors = await screen.findByTestId('studio-doc-remote-cursors');
    expect(cursors.textContent).toContain('Systems Designer');
    expect(cursors.textContent).toContain('JSON Source');
    expect(cursors.textContent).toContain('L18:6');

    const sourceCursors = await screen.findByTestId('studio-doc-source-collab-cursors');
    expect(sourceCursors.textContent).toContain('Systems Designer');
    expect(sourceCursors.textContent).toContain('L18:6');
  });

  it('edits a game viewport spatially by adding and nudging an interaction marker before save', async () => {
    const fileName = 'gameplay-encounter.gameview.json';
    const template = readFileSync(resolve(templatesRoot, fileName), 'utf8');
    mockedFetchProjectFileText.mockResolvedValueOnce(template);

    render(
      <GameStudioDocumentEditor
        projectId="project-1"
        file={fileFor(fileName, 'game-viewport') as ProjectFile & { kind: 'game-viewport' }}
      />,
    );

    expect(await screen.findByTestId('game-studio-document-editor')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add Marker' }));

    expect(screen.getAllByText('Interaction Marker').length).toBeGreaterThan(0);
    expect(screen.getByTestId('game-viewport-spatial-controls').textContent).toContain('Position 126, 334');

    fireEvent.click(screen.getByRole('button', { name: 'Nudge Right' }));
    expect(screen.getByTestId('game-viewport-spatial-controls').textContent).toContain('Position 146, 334');

    fireEvent.keyDown(screen.getByTestId('game-viewport-canvas'), { key: 'ArrowDown' });
    expect(screen.getByTestId('game-viewport-spatial-controls').textContent).toContain('Position 146, 354');

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(mockedWriteProjectTextFile).toHaveBeenCalledWith(
        'project-1',
        fileName,
        expect.stringContaining('"interaction-marker-6"'),
      );
    });
    const savedContent = mockedWriteProjectTextFile.mock.calls.at(-1)?.[2];
    const saved = JSON.parse(String(savedContent));
    expect(saved.entities.at(-1)).toMatchObject({
      id: 'interaction-marker-6',
      name: 'Interaction Marker',
      type: 'interaction-zone',
      x: 146,
      y: 354,
    });
  });

  it('edits game viewport routes by adding and nudging path waypoints before save', async () => {
    const fileName = 'gameplay-encounter.gameview.json';
    const template = readFileSync(resolve(templatesRoot, fileName), 'utf8');
    mockedFetchProjectFileText.mockResolvedValueOnce(template);

    render(
      <GameStudioDocumentEditor
        projectId="project-1"
        file={fileFor(fileName, 'game-viewport') as ProjectFile & { kind: 'game-viewport' }}
      />,
    );

    expect(await screen.findByTestId('game-studio-document-editor')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Critical Path/i }));

    expect(screen.getByTestId('game-viewport-path-controls').textContent).toContain('4 waypoints');
    fireEvent.click(screen.getByRole('button', { name: 'Add Waypoint' }));
    expect(screen.getByTestId('game-viewport-path-controls').textContent).toContain('5 waypoints');

    fireEvent.click(screen.getByRole('button', { name: 'Nudge Left' }));
    fireEvent.keyDown(screen.getByTestId('game-viewport-canvas'), { key: 'ArrowUp' });

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(mockedWriteProjectTextFile).toHaveBeenCalledWith(
        'project-1',
        fileName,
        expect.stringContaining('"critical-path"'),
      );
    });
    const savedContent = mockedWriteProjectTextFile.mock.calls.at(-1)?.[2];
    const saved = JSON.parse(String(savedContent));
    const criticalPath = saved.paths.find((path: { id: string }) => path.id === 'critical-path');
    expect(criticalPath.points).toEqual([
      { x: 100, y: 315 },
      { x: 330, y: 272 },
      { x: 540, y: 334 },
      { x: 800, y: 310 },
      { x: 872, y: 338 },
    ]);
  });

  it('edits game viewport camera handles before save', async () => {
    const fileName = 'gameplay-encounter.gameview.json';
    const template = readFileSync(resolve(templatesRoot, fileName), 'utf8');
    mockedFetchProjectFileText.mockResolvedValueOnce(template);

    render(
      <GameStudioDocumentEditor
        projectId="project-1"
        file={fileFor(fileName, 'game-viewport') as ProjectFile & { kind: 'game-viewport' }}
      />,
    );

    expect(await screen.findByTestId('game-studio-document-editor')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add Camera' }));

    expect(screen.getByTestId('game-viewport-camera-controls').textContent).toContain('Camera 260, 180');

    fireEvent.click(screen.getByRole('button', { name: 'Nudge Up' }));
    fireEvent.keyDown(screen.getByTestId('game-viewport-canvas'), { key: 'ArrowRight', shiftKey: true });
    expect(screen.getByTestId('game-viewport-camera-controls').textContent).toContain('Camera 300, 160');

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(mockedWriteProjectTextFile).toHaveBeenCalledWith(
        'project-1',
        fileName,
        expect.stringContaining('"camera-handle-3"'),
      );
    });
    const savedContent = mockedWriteProjectTextFile.mock.calls.at(-1)?.[2];
    const saved = JSON.parse(String(savedContent));
    expect(saved.cameraPlan.at(-1)).toMatchObject({
      id: 'camera-handle-3',
      mode: 'gameplay camera handle',
      x: 300,
      y: 160,
      targetX: 520,
      targetY: 320,
    });
  });

  it('edits game viewport terrain zones before save', async () => {
    const fileName = 'gameplay-encounter.gameview.json';
    const template = readFileSync(resolve(templatesRoot, fileName), 'utf8');
    mockedFetchProjectFileText.mockResolvedValueOnce(template);

    render(
      <GameStudioDocumentEditor
        projectId="project-1"
        file={fileFor(fileName, 'game-viewport') as ProjectFile & { kind: 'game-viewport' }}
      />,
    );

    expect(await screen.findByTestId('game-studio-document-editor')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add Terrain' }));

    expect(screen.getAllByText('Terrain Zone').length).toBeGreaterThan(0);
    expect(screen.getByTestId('game-viewport-terrain-controls').textContent).toContain('Terrain 280, 220');

    fireEvent.click(screen.getByRole('button', { name: 'Nudge Down' }));
    fireEvent.keyDown(screen.getByTestId('game-viewport-canvas'), { key: 'ArrowRight', shiftKey: true });
    expect(screen.getByTestId('game-viewport-terrain-controls').textContent).toContain('Terrain 320, 240');

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(mockedWriteProjectTextFile).toHaveBeenCalledWith(
        'project-1',
        fileName,
        expect.stringContaining('"terrain-zone-4"'),
      );
    });
    const savedContent = mockedWriteProjectTextFile.mock.calls.at(-1)?.[2];
    const saved = JSON.parse(String(savedContent));
    expect(saved.terrainZones.at(-1)).toMatchObject({
      id: 'terrain-zone-4',
      name: 'Terrain Zone',
      type: 'cover-field',
      x: 320,
      y: 240,
      w: 220,
      h: 140,
    });
  });

  it('edits game viewport polygon terrain zones before save', async () => {
    const fileName = 'gameplay-encounter.gameview.json';
    const template = readFileSync(resolve(templatesRoot, fileName), 'utf8');
    mockedFetchProjectFileText.mockResolvedValueOnce(template);

    render(
      <GameStudioDocumentEditor
        projectId="project-1"
        file={fileFor(fileName, 'game-viewport') as ProjectFile & { kind: 'game-viewport' }}
      />,
    );

    expect(await screen.findByTestId('game-studio-document-editor')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add Polygon Terrain' }));

    expect(screen.getAllByText('Polygon Terrain').length).toBeGreaterThan(0);
    expect(screen.getByTestId('game-viewport-terrain-controls').textContent).toContain('Terrain 300, 180 (5 pts)');

    fireEvent.click(screen.getByRole('button', { name: 'Nudge Right' }));
    fireEvent.keyDown(screen.getByTestId('game-viewport-canvas'), { key: 'ArrowDown', shiftKey: true });
    expect(screen.getByTestId('game-viewport-terrain-controls').textContent).toContain('Terrain 320, 220 (5 pts)');

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(mockedWriteProjectTextFile).toHaveBeenCalledWith(
        'project-1',
        fileName,
        expect.stringContaining('"polygon-terrain-4"'),
      );
    });
    const savedContent = mockedWriteProjectTextFile.mock.calls.at(-1)?.[2];
    const saved = JSON.parse(String(savedContent));
    expect(saved.terrainZones.at(-1)).toMatchObject({
      id: 'polygon-terrain-4',
      name: 'Polygon Terrain',
      shape: 'polygon',
      type: 'hazard-field',
      x: 320,
      y: 220,
      points: [
        { x: 320, y: 260 },
        { x: 430, y: 220 },
        { x: 580, y: 270 },
        { x: 520, y: 380 },
        { x: 350, y: 370 },
      ],
    });
  });

  it('edits game viewport terrain paint strokes before save', async () => {
    const fileName = 'gameplay-encounter.gameview.json';
    const template = readFileSync(resolve(templatesRoot, fileName), 'utf8');
    mockedFetchProjectFileText.mockResolvedValueOnce(template);

    render(
      <GameStudioDocumentEditor
        projectId="project-1"
        file={fileFor(fileName, 'game-viewport') as ProjectFile & { kind: 'game-viewport' }}
      />,
    );

    expect(await screen.findByTestId('game-studio-document-editor')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add Terrain Paint' }));

    expect(screen.getAllByText('Terrain Paint Stroke').length).toBeGreaterThan(0);
    expect(screen.getByTestId('game-viewport-terrain-paint-controls').textContent).toContain('Paint 250, 410 (4 pts)');

    fireEvent.click(screen.getByRole('button', { name: 'Nudge Left' }));
    fireEvent.keyDown(screen.getByTestId('game-viewport-canvas'), { key: 'ArrowUp', shiftKey: true });
    expect(screen.getByTestId('game-viewport-terrain-paint-controls').textContent).toContain('Paint 230, 370 (4 pts)');

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(mockedWriteProjectTextFile).toHaveBeenCalledWith(
        'project-1',
        fileName,
        expect.stringContaining('"terrain-paint-3"'),
      );
    });
    const savedContent = mockedWriteProjectTextFile.mock.calls.at(-1)?.[2];
    const saved = JSON.parse(String(savedContent));
    expect(saved.terrainPaintStrokes.at(-1)).toMatchObject({
      id: 'terrain-paint-3',
      name: 'Terrain Paint Stroke',
      type: 'material',
      material: 'ash-scorch traversal read',
      brushSize: 30,
      points: [
        { x: 230, y: 370 },
        { x: 320, y: 355 },
        { x: 435, y: 385 },
        { x: 540, y: 365 },
      ],
    });
  });

  it('edits game viewport terrain sculpt patches before save', async () => {
    const fileName = 'gameplay-encounter.gameview.json';
    const template = readFileSync(resolve(templatesRoot, fileName), 'utf8');
    mockedFetchProjectFileText.mockResolvedValueOnce(template);

    render(
      <GameStudioDocumentEditor
        projectId="project-1"
        file={fileFor(fileName, 'game-viewport') as ProjectFile & { kind: 'game-viewport' }}
      />,
    );

    expect(await screen.findByTestId('game-studio-document-editor')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add Sculpt Patch' }));

    expect(screen.getAllByText('Terrain Sculpt Patch').length).toBeGreaterThan(0);
    expect(screen.getByTestId('game-viewport-terrain-sculpt-controls').textContent).toContain('Sculpt 420, 255 height +1.2m (3 samples)');
    expect(screen.getByTestId('game-viewport-terrain-sculpt-controls').textContent).toContain('25 mesh verts');

    fireEvent.click(screen.getByRole('button', { name: 'Raise Height' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Brush Sample' }));
    fireEvent.click(screen.getByRole('button', { name: 'Broaden Brush' }));
    fireEvent.click(screen.getByRole('button', { name: 'Nudge Right' }));
    fireEvent.keyDown(screen.getByTestId('game-viewport-canvas'), { key: 'ArrowDown', shiftKey: true });
    expect(screen.getByTestId('game-viewport-terrain-sculpt-controls').textContent).toContain('Sculpt 440, 295 height +1.45m (4 samples)');
    const sculptMeshVertices = screen.getAllByTestId(/^terrain-sculpt-vertex-terrain-sculpt-2-/);
    expect(sculptMeshVertices).toHaveLength(25);
    expect(sculptMeshVertices.some((node) => Number(node.getAttribute('data-height')) > 0)).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(mockedWriteProjectTextFile).toHaveBeenCalledWith(
        'project-1',
        fileName,
        expect.stringContaining('"terrain-sculpt-2"'),
      );
    });
    const savedContent = mockedWriteProjectTextFile.mock.calls.at(-1)?.[2];
    const saved = JSON.parse(String(savedContent));
    expect(saved.terrainSculptPatches.at(-1)).toMatchObject({
      id: 'terrain-sculpt-2',
      name: 'Terrain Sculpt Patch',
      type: 'mesh-deformation',
      x: 440,
      y: 295,
      radius: 90,
      height: 1.45,
      samples: [
        { x: 380, y: 285, height: 0.85, radius: 56 },
        { x: 440, y: 295, height: 1.45, radius: 90 },
        { x: 508, y: 322, height: 1.05, radius: 64 },
        { x: 560, y: 344, height: 1.25, radius: 70 },
      ],
    });
  });
});
