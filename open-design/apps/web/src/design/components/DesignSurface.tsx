// SPDX-License-Identifier: Apache-2.0
'use client';
/**
 * Top-level design surface. Loads (or scaffolds) the project, hosts the
 * provider, and lays out the 3-column editor.
 */
import { useEffect, useState } from 'react';

import type { GameProject } from '@greybox/schema';

import { fetchDesignProject } from '../lib/persistence.js';
import { scaffoldGameProject } from '../lib/projectScaffold.js';
import { Canvas } from './Canvas.js';
import { FlowGraph } from './FlowGraph.js';
import { ProjectEditorProvider } from './ProjectContext.js';
import { PropertyInspector } from './PropertyInspector.js';
import { ScreenList } from './ScreenList.js';
import { TopBar } from './TopBar.js';

export interface DesignSurfaceProps {
  projectId: string;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; project: GameProject };

export function DesignSurface({ projectId }: DesignSurfaceProps) {
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await fetchDesignProject(projectId);
      if (cancelled) return;
      if (result.ok) {
        setLoad({ kind: 'ready', project: result.project });
        return;
      }
      if (result.status === 404) {
        // Fresh project — scaffold a valid GameProject locally.
        setLoad({ kind: 'ready', project: scaffoldGameProject({ projectId }) });
        return;
      }
      setLoad({ kind: 'error', message: result.message });
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (load.kind === 'loading') {
    return (
      <div className='design-shell design-shell--loading' data-testid='design-loading'>
        Loading project…
      </div>
    );
  }
  if (load.kind === 'error') {
    return (
      <div className='design-shell design-shell--error' data-testid='design-error'>
        <h2>Could not load design</h2>
        <p>{load.message}</p>
      </div>
    );
  }

  return (
    <ProjectEditorProvider projectId={projectId} initial={load.project}>
      <div className='design-shell' data-testid='design-shell'>
        <TopBar />
        <div className='design-shell__cols'>
          <aside className='design-shell__left'>
            <ScreenList />
            <FlowGraph />
          </aside>
          <main className='design-shell__center'>
            <Canvas />
          </main>
          <aside className='design-shell__right'>
            <PropertyInspector />
          </aside>
        </div>
      </div>
    </ProjectEditorProvider>
  );
}
