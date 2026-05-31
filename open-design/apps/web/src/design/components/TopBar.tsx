// SPDX-License-Identifier: Apache-2.0
'use client';
/**
 * Top bar: project name, preview, export dropdown, save status.
 */
import { useState } from 'react';

import { exportEnginePackage, type ExportEngine } from '../lib/export.js';
import { useProjectEditor } from './ProjectContext.js';

const ENGINES: readonly { engine: ExportEngine; label: string }[] = [
  { engine: 'unity', label: 'Unity (.unitypackage)' },
  { engine: 'unreal', label: 'Unreal (.uasset zip)' },
  { engine: 'godot', label: 'Godot (.zip)' },
];

export function TopBar() {
  const { state, dispatch, projectId } = useProjectEditor();
  const { saveStatus, lastError, project } = state;
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState<ExportEngine | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  return (
    <header className='design-topbar' data-testid='design-topbar'>
      <input
        className='design-topbar__name'
        data-testid='project-name'
        type='text'
        value={project.meta.name}
        aria-label='Project name'
        onChange={(e) => dispatch({ type: 'project/setName', name: e.target.value })}
      />
      <div className='design-topbar__actions'>
        <button
          type='button'
          className='design-btn'
          data-testid='open-preview'
          onClick={() => {
            const url = `/projects/${encodeURIComponent(projectId)}/preview`;
            window.open(url, '_blank', 'noopener,noreferrer');
          }}
        >
          Preview
        </button>
        <div className='design-export'>
          <button
            type='button'
            className='design-btn'
            data-testid='export-toggle'
            aria-expanded={exportOpen}
            onClick={() => setExportOpen((v) => !v)}
          >
            Export ▾
          </button>
          {exportOpen && (
            <ul
              className='design-export__menu'
              role='menu'
              aria-label='Export to engine'
              data-testid='export-menu'
            >
              {ENGINES.map(({ engine, label }) => (
                <li key={engine} role='none'>
                  <button
                    type='button'
                    role='menuitem'
                    className='design-export__item'
                    data-testid={`export-${engine}`}
                    disabled={exporting !== null}
                    onClick={async () => {
                      setExportOpen(false);
                      setExporting(engine);
                      setExportError(null);
                      try {
                        await exportEnginePackage(projectId, engine);
                      } catch (err) {
                        setExportError(
                          err instanceof Error ? err.message : String(err),
                        );
                      } finally {
                        setExporting(null);
                      }
                    }}
                  >
                    {label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <SaveStatus status={saveStatus} error={lastError ?? exportError} />
      </div>
    </header>
  );
}

function SaveStatus({
  status,
  error,
}: {
  status: 'idle' | 'saving' | 'saved' | 'error';
  error: string | null;
}) {
  if (status === 'saving') {
    return (
      <span className='design-save-status design-save-status--saving' data-testid='save-status'>
        Saving…
      </span>
    );
  }
  if (status === 'saved') {
    return (
      <span className='design-save-status design-save-status--saved' data-testid='save-status'>
        Saved
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span
        className='design-save-status design-save-status--error'
        data-testid='save-status'
        title={error ?? undefined}
      >
        Save failed
      </span>
    );
  }
  return (
    <span className='design-save-status' data-testid='save-status'>
      Idle
    </span>
  );
}
