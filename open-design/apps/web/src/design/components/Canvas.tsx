// SPDX-License-Identifier: Apache-2.0
'use client';
/**
 * Center canvas. Picks between 2D / 3D screen rendering.
 *
 * The 3D placeholder defers to Stream 2's `/preview` runtime, which owns the
 * Babylon prototype. From this editor's point of view, a 3D screen is just a
 * list of components that gets exported to the runner.
 */
import { useProjectEditor } from './ProjectContext.js';
import { CanvasComponent } from './CanvasComponent.js';
import { ComponentPalette } from './ComponentPalette.js';

const GRID = 40;

/** Decide whether this screen renders as a freeform 2D UI or a 3D placeholder. */
function classifyScreen(kind: string): 'ui' | '3d' {
  if (kind === 'gameplay' || kind === 'cutscene') return '3d';
  return 'ui';
}

export function Canvas() {
  const { state, dispatch } = useProjectEditor();
  const screen = state.project.screens.find((s) => s.id === state.selectedScreenId);
  if (!screen) {
    return (
      <div className='design-canvas design-canvas--empty' data-testid='design-canvas-empty'>
        <p>No screens yet. Click <strong>+ Add screen</strong> on the left to start.</p>
      </div>
    );
  }

  const surface = classifyScreen(screen.kind);

  return (
    <div className='design-canvas' data-testid='design-canvas'>
      <div className='design-canvas__toolbar'>
        <span className='design-canvas__crumb'>
          {screen.name} <em>({screen.kind})</em>
        </span>
        <ComponentPalette screenId={screen.id} />
      </div>
      {surface === '3d' ? (
        <div
          className='design-canvas__3d-placeholder'
          data-testid='design-canvas-3d'
          aria-label='3D preview placeholder'
        >
          <p>3D preview — see <code>/preview</code> route (Stream 2)</p>
          <p className='design-muted'>
            {screen.components.length} component{screen.components.length === 1 ? '' : 's'} on
            this screen. The preview runner renders them with Babylon.
          </p>
        </div>
      ) : (
        <div
          data-testid='design-canvas-2d'
          className='design-canvas__2d'
          style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            background:
              screen.background?.type === 'color' ? screen.background.color : 'var(--bg-panel)',
            backgroundImage: `
              linear-gradient(to right, rgba(127,127,127,0.12) 1px, transparent 1px),
              linear-gradient(to bottom, rgba(127,127,127,0.12) 1px, transparent 1px)
            `,
            backgroundSize: `${GRID}px ${GRID}px`,
            overflow: 'auto',
          }}
          onClick={(e) => {
            // Background click clears selection.
            if (e.target === e.currentTarget) {
              dispatch({ type: 'component/select', componentId: null });
            }
          }}
        >
          {screen.components.map((c) => (
            <CanvasComponent
              key={c.id}
              component={c}
              screenId={screen.id}
              selected={c.id === state.selectedComponentId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
