/**
 * `useProjectLoader` React hook: fetches a GameProject (from URL or
 * literal), validates it against the schema, and reports ready / error /
 * progress state.
 *
 * @packageDocumentation
 */

import { useEffect, useState } from 'react';

import {
  type GameProject,
  safeParseGameProject,
} from '@greybox/schema';

/** Options accepted by {@link useProjectLoader}. */
export interface UseProjectLoaderOptions {
  /** Project URL — supply this OR `project`, not both. */
  projectUrl?: string;
  /** Pre-validated project object — supply this OR `projectUrl`, not both. */
  project?: GameProject;
  /** Custom fetch implementation (defaults to global fetch). */
  fetchImpl?: typeof fetch;
}

/**
 * State returned by {@link useProjectLoader}. Mirrors a small finite state
 * machine: `idle → loading → ready` or `idle → loading → error`.
 */
export interface UseProjectLoaderState {
  state: 'idle' | 'loading' | 'ready' | 'error';
  project: GameProject | null;
  error: Error | null;
}

/**
 * Hook implementation.
 *
 * Re-runs whenever `projectUrl` changes. Passing a `project` literal makes
 * the hook synchronous (no network).
 */
export function useProjectLoader(
  options: UseProjectLoaderOptions,
): UseProjectLoaderState {
  const [s, setS] = useState<UseProjectLoaderState>(() => {
    if (options.project) {
      return { state: 'ready', project: options.project, error: null };
    }
    return { state: 'idle', project: null, error: null };
  });

  useEffect(() => {
    let cancelled = false;
    async function run(): Promise<void> {
      if (options.project) {
        setS({ state: 'ready', project: options.project, error: null });
        return;
      }
      if (!options.projectUrl) return;
      setS({ state: 'loading', project: null, error: null });
      try {
        const fetcher = options.fetchImpl ?? fetch;
        const response = await fetcher(options.projectUrl);
        if (!response.ok) {
          throw new Error(
            `Failed to fetch project ${options.projectUrl}: ${response.status} ${response.statusText}`,
          );
        }
        const raw = await response.json();
        const result = safeParseGameProject(raw);
        if (!result.success) {
          throw new Error(
            `Invalid GameProject at ${options.projectUrl}: ${result.error.issues
              .map((i) => `${i.path.join('.')}: ${i.message}`)
              .join(', ')}`,
          );
        }
        if (!cancelled) {
          setS({ state: 'ready', project: result.data, error: null });
        }
      } catch (err) {
        if (cancelled) return;
        setS({
          state: 'error',
          project: null,
          error: err instanceof Error ? err : new Error(String(err)),
        });
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.projectUrl, options.project]);

  return s;
}
