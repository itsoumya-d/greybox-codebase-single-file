// SPDX-License-Identifier: Apache-2.0
'use client';
/**
 * Popover palette of all 19 component kinds.
 *
 * Click a kind → dispatches `component/add` with a sensible default position
 * (40,40 unless the click happened on the canvas at a different spot, in
 * which case the Canvas component overrides via its own handler).
 */
import { useState } from 'react';

import type { ScreenId } from '@greybox/schema';
import { COMPONENT_KINDS } from '@greybox/schema';

import { useProjectEditor } from './ProjectContext.js';

export interface ComponentPaletteProps {
  screenId: ScreenId;
}

/**
 * Group the 19 kinds into the three families the schema documents (UI / Game
 * / 3D). Keeps the popover scannable.
 */
const FAMILY: Record<string, readonly (typeof COMPONENT_KINDS)[number][]> = {
  UI: ['Button', 'Image', 'Text', 'TextInput', 'ProgressBar', 'HUDBar', 'MenuList', 'Container'],
  Game: [
    'Character3DRef',
    'GameObject',
    'Spawner',
    'Trigger',
    'Pickup',
    'Hazard',
    'Checkpoint',
    'Camera',
  ],
  '3D': ['Light', 'Particle', 'AudioSource'],
};

export function ComponentPalette({ screenId }: ComponentPaletteProps) {
  const { dispatch } = useProjectEditor();
  const [open, setOpen] = useState(false);

  return (
    <div className='design-palette' data-testid='component-palette'>
      <button
        type='button'
        className='design-btn design-btn--primary'
        data-testid='palette-toggle'
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        + Add component
      </button>
      {open && (
        <div className='design-palette__popover' role='dialog' aria-label='Component palette'>
          {Object.entries(FAMILY).map(([family, kinds]) => (
            <div key={family} className='design-palette__group'>
              <h4 className='design-palette__group-label'>{family}</h4>
              <div className='design-palette__grid'>
                {kinds.map((kind) => (
                  <button
                    type='button'
                    key={kind}
                    data-testid={`palette-kind-${kind}`}
                    className='design-palette__tile'
                    onClick={() => {
                      dispatch({ type: 'component/add', screenId, kind });
                      setOpen(false);
                    }}
                  >
                    {kind}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
