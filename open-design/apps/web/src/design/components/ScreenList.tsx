// SPDX-License-Identifier: Apache-2.0
'use client';
/**
 * Left-rail screen list with drag-to-reorder and "Add screen" button.
 *
 * Drag/drop uses the native HTML5 API to avoid pulling in a heavy
 * drag-and-drop framework for a list that maxes out at ~30 items in
 * practice. Reordering is a pure store action (`screen/reorder`).
 */
import { useState } from 'react';

import type { ScreenKind } from '@greybox/schema';

import { useProjectEditor } from './ProjectContext.js';

const SCREEN_KIND_OPTIONS: readonly ScreenKind[] = [
  'main-menu',
  'gameplay',
  'cutscene',
  'pause',
  'game-over',
  'loading',
  'settings',
  'inventory',
  'shop',
  'credits',
  'custom',
];

export function ScreenList() {
  const { state, dispatch } = useProjectEditor();
  const { project, selectedScreenId } = state;
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  return (
    <div data-testid='design-screen-list' className='design-screen-list'>
      <div className='design-screen-list__header'>
        <h2 className='design-h2'>Screens</h2>
        <button
          type='button'
          className='design-btn design-btn--primary'
          data-testid='add-screen'
          onClick={() => dispatch({ type: 'screen/add' })}
        >
          + Add screen
        </button>
      </div>
      <ul className='design-screen-list__items' role='listbox' aria-label='Screens'>
        {project.screens.map((screen, idx) => {
          const selected = screen.id === selectedScreenId;
          return (
            <li
              key={screen.id}
              data-testid={`screen-item-${screen.id}`}
              role='option'
              aria-selected={selected}
              draggable
              className={`design-screen-list__item${selected ? ' is-selected' : ''}`}
              onDragStart={() => setDragIdx(idx)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragIdx == null || dragIdx === idx) return;
                dispatch({ type: 'screen/reorder', from: dragIdx, to: idx });
                setDragIdx(null);
              }}
              onClick={() => dispatch({ type: 'screen/select', screenId: screen.id })}
            >
              <div className='design-screen-list__name'>{screen.name}</div>
              <div className='design-screen-list__kind'>
                <select
                  data-testid={`screen-kind-${screen.id}`}
                  value={screen.kind}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    dispatch({
                      type: 'screen/update',
                      screenId: screen.id,
                      patch: { kind: e.target.value as ScreenKind },
                    })
                  }
                >
                  {SCREEN_KIND_OPTIONS.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
                <button
                  type='button'
                  className='design-btn design-btn--ghost'
                  aria-label={`Delete ${screen.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    dispatch({ type: 'screen/delete', screenId: screen.id });
                  }}
                >
                  ×
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
