// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';

import { asScreenId } from '@greybox/schema';

import { scaffoldGameProject } from '../../src/design/lib/projectScaffold';
import {
  createEditorState,
  getScreen,
  getSelectedComponent,
  projectReducer,
} from '../../src/design/store/projectStore';

function seedState() {
  return createEditorState(scaffoldGameProject({ projectId: 'p1', name: 'Test' }));
}

describe('projectReducer / screens', () => {
  it('adds a screen and selects it', () => {
    const start = seedState();
    const next = projectReducer(start, { type: 'screen/add' });
    expect(next.project.screens).toHaveLength(2);
    expect(next.selectedScreenId).toBe(next.project.screens[1]!.id);
    expect(next.selectedComponentId).toBeNull();
  });

  it('updates a screen field without disturbing its components', () => {
    const start = seedState();
    const screenId = start.project.screens[0]!.id;
    const next = projectReducer(start, {
      type: 'screen/update',
      screenId,
      patch: { name: 'Renamed' },
    });
    expect(next.project.screens[0]!.name).toBe('Renamed');
    expect(next.project.screens[0]!.components).toBe(
      start.project.screens[0]!.components,
    );
  });

  it('reorders screens', () => {
    const start = seedState();
    const withSecond = projectReducer(start, { type: 'screen/add', name: 'B' });
    expect(withSecond.project.screens.map((s) => s.name)).toEqual(['Main Menu', 'B']);
    const reordered = projectReducer(withSecond, {
      type: 'screen/reorder',
      from: 0,
      to: 1,
    });
    expect(reordered.project.screens.map((s) => s.name)).toEqual(['B', 'Main Menu']);
  });

  it('deletes a screen and any edges that reference it', () => {
    const start = seedState();
    const addedB = projectReducer(start, { type: 'screen/add', name: 'B' });
    const screenAId = addedB.project.screens[0]!.id;
    const screenBId = addedB.project.screens[1]!.id;
    const withEdge = projectReducer(addedB, {
      type: 'flow/addEdge',
      from: screenAId,
      to: screenBId,
    });
    expect(withEdge.project.flow).toHaveLength(1);
    const deleted = projectReducer(withEdge, {
      type: 'screen/delete',
      screenId: screenBId,
    });
    expect(deleted.project.screens).toHaveLength(1);
    expect(deleted.project.flow).toHaveLength(0);
  });
});

describe('projectReducer / components', () => {
  it('adds a Button with sensible defaults', () => {
    const start = seedState();
    const screenId = start.project.screens[0]!.id;
    const next = projectReducer(start, {
      type: 'component/add',
      screenId,
      kind: 'Button',
    });
    const screen = getScreen(next, screenId);
    expect(screen?.components).toHaveLength(1);
    const cmp = screen!.components[0]!;
    expect(cmp.kind).toBe('Button');
    expect(cmp.visible).toBe(true);
    expect(next.selectedComponentId).toBe(cmp.id);
  });

  it('updates a component field', () => {
    const start = seedState();
    const screenId = start.project.screens[0]!.id;
    const added = projectReducer(start, {
      type: 'component/add',
      screenId,
      kind: 'Button',
    });
    const cmpId = added.selectedComponentId!;
    const updated = projectReducer(added, {
      type: 'component/update',
      screenId,
      componentId: cmpId,
      patch: { name: 'Play' },
    });
    expect(getSelectedComponent(updated)?.name).toBe('Play');
  });

  it('deletes the selected component and clears selection', () => {
    const start = seedState();
    const screenId = start.project.screens[0]!.id;
    const added = projectReducer(start, {
      type: 'component/add',
      screenId,
      kind: 'Text',
    });
    const cmpId = added.selectedComponentId!;
    const removed = projectReducer(added, {
      type: 'component/delete',
      screenId,
      componentId: cmpId,
    });
    expect(removed.project.screens[0]!.components).toHaveLength(0);
    expect(removed.selectedComponentId).toBeNull();
  });

  it('supports all 19 component kinds with valid defaults', async () => {
    const { COMPONENT_KINDS, safeParseGameProject } = await import('@greybox/schema');
    let state = seedState();
    const screenId = state.project.screens[0]!.id;
    for (const kind of COMPONENT_KINDS) {
      state = projectReducer(state, { type: 'component/add', screenId, kind });
    }
    expect(state.project.screens[0]!.components).toHaveLength(COMPONENT_KINDS.length);
    // The project must remain valid per the canonical schema.
    const parsed = safeParseGameProject(state.project);
    expect(parsed.success).toBe(true);
  });
});

describe('projectReducer / flow + persistence', () => {
  it('adds and removes a flow edge', () => {
    const start = seedState();
    const screenA = start.project.screens[0]!.id;
    const withB = projectReducer(start, { type: 'screen/add', name: 'B' });
    const screenB = withB.project.screens[1]!.id;
    const withEdge = projectReducer(withB, {
      type: 'flow/addEdge',
      from: screenA,
      to: screenB,
    });
    expect(withEdge.project.flow).toHaveLength(1);
    const edgeId = withEdge.project.flow[0]!.id;
    const removed = projectReducer(withEdge, { type: 'flow/deleteEdge', edgeId });
    expect(removed.project.flow).toHaveLength(0);
  });

  it('tracks save-status transitions', () => {
    const start = seedState();
    const saving = projectReducer(start, { type: 'persist/started' });
    expect(saving.saveStatus).toBe('saving');
    const saved = projectReducer(saving, { type: 'persist/succeeded' });
    expect(saved.saveStatus).toBe('saved');
    expect(saved.lastError).toBeNull();
    const failed = projectReducer(saved, { type: 'persist/failed', error: 'boom' });
    expect(failed.saveStatus).toBe('error');
    expect(failed.lastError).toBe('boom');
  });

  it('returns the input state for screen/select with a non-existent id', () => {
    const start = seedState();
    const next = projectReducer(start, {
      type: 'screen/select',
      screenId: asScreenId('not-real'),
    });
    expect(next.selectedScreenId).toBe('not-real');
    expect(getScreen(next, next.selectedScreenId)).toBeNull();
  });
});
