// SPDX-License-Identifier: Apache-2.0
'use client';
/**
 * React context wrapper for the {@link projectReducer}.
 *
 * Wraps the editor tree with a `useReducer` instance so any descendant can
 * read state and dispatch actions without prop-drilling. The provider also
 * owns the debounced REST sync — if/when a Yjs provider exists, swap this
 * file's `useEffect` for a Y.Doc observer; consumers stay unchanged.
 */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type Dispatch,
  type ReactNode,
} from 'react';

import type { GameProject } from '@greybox/schema';

import { putDesignProject } from '../lib/persistence.js';
import {
  createEditorState,
  projectReducer,
  type ProjectAction,
  type ProjectEditorState,
} from '../store/projectStore.js';

/** Bundle of state + dispatch + project id, returned by {@link useProjectEditor}. */
export interface ProjectEditorContextValue {
  projectId: string;
  state: ProjectEditorState;
  dispatch: Dispatch<ProjectAction>;
}

const ProjectEditorContext = createContext<ProjectEditorContextValue | null>(null);

/** Read context. Throws when called outside the provider tree — by design. */
export function useProjectEditor(): ProjectEditorContextValue {
  const ctx = useContext(ProjectEditorContext);
  if (!ctx) {
    throw new Error('useProjectEditor must be called inside <ProjectEditorProvider>');
  }
  return ctx;
}

export interface ProjectEditorProviderProps {
  projectId: string;
  initial: GameProject;
  /** Debounce delay in ms before PUT. Pass `0` to disable auto-save. */
  saveDebounceMs?: number;
  children: ReactNode;
}

/** Provider: instantiates the reducer + wires debounced PUT. */
export function ProjectEditorProvider({
  projectId,
  initial,
  saveDebounceMs = 600,
  children,
}: ProjectEditorProviderProps) {
  const [state, dispatch] = useReducer(projectReducer, initial, createEditorState);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track the first render so we don't fire a PUT for the initial server-loaded value.
  const firstRender = useRef(true);

  useEffect(() => {
    if (saveDebounceMs <= 0) return;
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      dispatch({ type: 'persist/started' });
      putDesignProject(projectId, state.project)
        .then((result) => {
          if (result.ok) {
            dispatch({ type: 'persist/succeeded' });
          } else {
            dispatch({ type: 'persist/failed', error: result.message });
          }
        })
        .catch((err: unknown) => {
          dispatch({
            type: 'persist/failed',
            error: err instanceof Error ? err.message : String(err),
          });
        });
    }, saveDebounceMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // state.project is the only persisted slice; selection changes shouldn't trigger PUTs.
  }, [projectId, state.project, saveDebounceMs]);

  const value = useMemo<ProjectEditorContextValue>(
    () => ({ projectId, state, dispatch }),
    [projectId, state],
  );

  return (
    <ProjectEditorContext.Provider value={value}>{children}</ProjectEditorContext.Provider>
  );
}
