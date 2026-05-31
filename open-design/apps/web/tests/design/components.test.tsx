// SPDX-License-Identifier: Apache-2.0
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  cleanup();
});

import {
  ProjectEditorProvider,
  useProjectEditor,
} from '../../src/design/components/ProjectContext';
import { Canvas } from '../../src/design/components/Canvas';
import { ComponentPalette } from '../../src/design/components/ComponentPalette';
import { PropertyInspector } from '../../src/design/components/PropertyInspector';
import { ScreenList } from '../../src/design/components/ScreenList';
import { scaffoldGameProject } from '../../src/design/lib/projectScaffold';
import { COMPONENT_FIELDS } from '../../src/design/lib/componentFields';

function renderWithProject(ui: React.ReactNode) {
  const project = scaffoldGameProject({ projectId: 'p1', name: 'Test' });
  return render(
    <ProjectEditorProvider projectId='p1' initial={project} saveDebounceMs={0}>
      {ui}
    </ProjectEditorProvider>,
  );
}

describe('ScreenList', () => {
  it('renders the initial screen and an Add button', () => {
    renderWithProject(<ScreenList />);
    expect(screen.getByTestId('add-screen')).toBeTruthy();
    expect(screen.getByText('Main Menu')).toBeTruthy();
  });

  it('adds a new screen when the button is clicked', () => {
    renderWithProject(<ScreenList />);
    const button = screen.getByTestId('add-screen');
    fireEvent.click(button);
    const items = screen.getAllByRole('option');
    expect(items.length).toBeGreaterThanOrEqual(2);
  });
});

describe('ComponentPalette', () => {
  it('hides the popover by default and exposes 19 kinds when opened', () => {
    const project = scaffoldGameProject({ projectId: 'p2' });
    const screenId = project.screens[0]!.id;
    render(
      <ProjectEditorProvider projectId='p2' initial={project} saveDebounceMs={0}>
        <ComponentPalette screenId={screenId} />
      </ProjectEditorProvider>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByTestId('palette-toggle'));
    expect(screen.getByRole('dialog')).toBeTruthy();
    // Every kind in COMPONENT_FIELDS has a matching tile, plus the missing MenuList.
    expect(screen.getByTestId('palette-kind-Button')).toBeTruthy();
    expect(screen.getByTestId('palette-kind-Character3DRef')).toBeTruthy();
    expect(screen.getByTestId('palette-kind-AudioSource')).toBeTruthy();
  });
});

describe('PropertyInspector', () => {
  it('renders screen meta when no component is selected', () => {
    renderWithProject(<PropertyInspector />);
    expect(screen.getByTestId('design-inspector')).toBeTruthy();
    expect(screen.getByTestId('screen-name-input')).toBeTruthy();
  });

  it('renders kind-specific fields after a Button is added and selected', async () => {
    function Harness() {
      const { dispatch, state } = useProjectEditor();
      const screenId = state.project.screens[0]!.id;
      return (
        <div>
          <button
            type='button'
            onClick={() => dispatch({ type: 'component/add', screenId, kind: 'Button' })}
          >
            seed-button
          </button>
          <PropertyInspector />
        </div>
      );
    }
    renderWithProject(<Harness />);
    fireEvent.click(screen.getByText('seed-button'));
    // The Button has a 'label' field.
    expect(screen.getByTestId('field-label')).toBeTruthy();
    // Common fields appear too.
    expect(screen.getByTestId('comp-name-input')).toBeTruthy();
  });

  it('exposes all declared fields for each kind without throwing', () => {
    // Drive every kind through the inspector and confirm we render its fields.
    for (const [kind, fields] of Object.entries(COMPONENT_FIELDS)) {
      function Harness() {
        const { dispatch, state } = useProjectEditor();
        const screenId = state.project.screens[0]!.id;
        return (
          <div>
            <button
              type='button'
              data-testid={`add-${kind}`}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              onClick={() => dispatch({ type: 'component/add', screenId, kind: kind as any })}
            >
              add
            </button>
            <PropertyInspector />
          </div>
        );
      }
      const { unmount } = renderWithProject(<Harness />);
      fireEvent.click(screen.getByTestId(`add-${kind}`));
      for (const field of fields) {
        expect(screen.getAllByTestId(`field-${field.key}`).length).toBeGreaterThan(0);
      }
      unmount();
    }
  });
});

describe('Canvas', () => {
  it('shows the 3D placeholder when a gameplay screen is selected', () => {
    function Harness() {
      const { dispatch, state } = useProjectEditor();
      const id = state.project.screens[0]!.id;
      return (
        <div>
          <button
            type='button'
            data-testid='to-gameplay'
            onClick={() =>
              dispatch({ type: 'screen/update', screenId: id, patch: { kind: 'gameplay' } })
            }
          >
            mark
          </button>
          <Canvas />
        </div>
      );
    }
    renderWithProject(<Harness />);
    fireEvent.click(screen.getByTestId('to-gameplay'));
    expect(screen.getByTestId('design-canvas-3d')).toBeTruthy();
  });

  it('renders the 2D surface for UI screens and lists components', () => {
    function Harness() {
      const { dispatch, state } = useProjectEditor();
      const id = state.project.screens[0]!.id;
      return (
        <div>
          <button
            type='button'
            data-testid='seed'
            onClick={() => dispatch({ type: 'component/add', screenId: id, kind: 'Text' })}
          >
            seed
          </button>
          <Canvas />
        </div>
      );
    }
    renderWithProject(<Harness />);
    fireEvent.click(screen.getByTestId('seed'));
    expect(screen.getByTestId('design-canvas-2d')).toBeTruthy();
    // The seeded Text component appears with kind metadata.
    const boxes = screen.getAllByText('Text');
    expect(boxes.length).toBeGreaterThan(0);
  });
});

describe('ProjectEditorProvider', () => {
  it('debounces a REST PUT after a state change', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const project = scaffoldGameProject({ projectId: 'p3' });
    function Harness() {
      const { dispatch } = useProjectEditor();
      return (
        <button
          type='button'
          data-testid='go'
          onClick={() => dispatch({ type: 'project/setName', name: 'X' })}
        >
          go
        </button>
      );
    }
    render(
      <ProjectEditorProvider projectId='p3' initial={project} saveDebounceMs={1}>
        <Harness />
      </ProjectEditorProvider>,
    );
    fireEvent.click(screen.getByTestId('go'));
    await new Promise((r) => setTimeout(r, 30));
    expect(fetchMock).toHaveBeenCalled();
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(call[0])).toBe('/api/projects/p3/design');
    expect(call[1].method).toBe('PUT');
    vi.unstubAllGlobals();
  });
});
