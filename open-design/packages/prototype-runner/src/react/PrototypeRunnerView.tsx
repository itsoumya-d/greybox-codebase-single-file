/**
 * `PrototypeRunnerView`: a React component that mounts a Babylon canvas
 * and wires it to a {@link PrototypeRunner}.
 *
 * Two source modes: pass a `projectUrl` (fetched + validated) OR a
 * pre-validated `project` literal. Pass an optional `assetBaseUrl` for
 * project-relative asset URIs.
 *
 * @packageDocumentation
 */

import { useEffect, useRef, useState } from 'react';

import type { GameProject, ScreenId } from '@greybox/schema';

import { PrototypeRunner } from '../PrototypeRunner.js';
import type { PrototypeRunnerOptions } from '../types.js';
import { PrototypeControls } from './PrototypeControls.js';
import { useProjectLoader } from './useProjectLoader.js';

/** Props for {@link PrototypeRunnerView}. */
export interface PrototypeRunnerViewProps {
  /** Project URL (one of `projectUrl` / `project` required). */
  projectUrl?: string;
  /** Pre-validated project literal. */
  project?: GameProject;
  /** Base URL for project-relative asset URIs. */
  assetBaseUrl?: string;
  /** Initial screen to render; defaults to first screen in the project. */
  initialScreenId?: string;
  /** Show the play/pause/restart overlay. Default true. */
  showControls?: boolean;
  /** Forwarded to the runner constructor. */
  runnerOptions?: Omit<PrototypeRunnerOptions, 'assetBaseUrl' | 'initialScreenId'>;
  /** Callback fired on each screen change. */
  onScreenChange?: (screenId: string) => void;
  /** Callback fired on any runner error. */
  onError?: (error: Error) => void;
  /** Callback fired once preload completes. */
  onReady?: (runner: PrototypeRunner) => void;
  /** Wrapper CSS class. */
  className?: string;
  /** Wrapper inline style. */
  style?: React.CSSProperties;
}

/**
 * Mount a Babylon canvas and drive it via the {@link PrototypeRunner}.
 *
 * @example
 * ```tsx
 * <PrototypeRunnerView
 *   projectUrl="/api/projects/abc/design"
 *   assetBaseUrl="/api/projects/abc/assets"
 *   onScreenChange={(id) => router.push(`?screen=${id}`)}
 * />
 * ```
 */
export function PrototypeRunnerView(
  props: PrototypeRunnerViewProps,
): JSX.Element {
  const {
    projectUrl,
    project,
    assetBaseUrl,
    initialScreenId,
    showControls = true,
    runnerOptions,
    onScreenChange,
    onError,
    onReady,
    className,
    style,
  } = props;

  const loaderOptions: Parameters<typeof useProjectLoader>[0] = {};
  if (projectUrl !== undefined) loaderOptions.projectUrl = projectUrl;
  if (project !== undefined) loaderOptions.project = project;
  const loader = useProjectLoader(loaderOptions);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [runner, setRunner] = useState<PrototypeRunner | null>(null);

  // Build the runner once the project is ready.
  useEffect(() => {
    if (loader.state !== 'ready' || !loader.project) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const options: PrototypeRunnerOptions = {
      ...runnerOptions,
      ...(assetBaseUrl ? { assetBaseUrl } : {}),
      ...(initialScreenId
        ? { initialScreenId: initialScreenId as ScreenId }
        : {}),
    };
    const r = new PrototypeRunner(loader.project, options);
    setRunner(r);

    const offScreen = r.on('screen-change', (e) => {
      onScreenChange?.(e.to);
    });
    const offError = r.on('error', (e) => onError?.(e.error));
    const offLoaded = r.on('load-complete', () => onReady?.(r));

    let cancelled = false;
    void (async (): Promise<void> => {
      try {
        await r.preload();
        if (cancelled) return;
        r.attach(canvas);
        const startId =
          initialScreenId ?? loader.project!.screens[0]?.id;
        if (startId) await r.goToScreen(startId);
      } catch (err) {
        if (!cancelled) onError?.(err instanceof Error ? err : new Error(String(err)));
      }
    })();

    return () => {
      cancelled = true;
      offScreen();
      offError();
      offLoaded();
      r.dispose();
      setRunner(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loader.state, loader.project]);

  // Resize the canvas with the container.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      // Babylon Engine.resize() is invoked by the runner's render loop via
      // the canvas size automatically when its bounding rect changes.
      // We just nudge the canvas backing buffer here.
      const dpr = window.devicePixelRatio || 1;
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      className={className}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        background: '#0b0f17',
        overflow: 'hidden',
        ...style,
      }}
    >
      {loader.state === 'loading' && (
        <div role="status" style={overlayStyle}>
          Loading project…
        </div>
      )}
      {loader.state === 'error' && (
        <div role="alert" style={errorStyle}>
          {loader.error?.message ?? 'Failed to load project'}
        </div>
      )}
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          outline: 'none',
          touchAction: 'none',
        }}
      />
      {showControls && loader.state === 'ready' && (
        <PrototypeControls
          runner={runner}
          {...(initialScreenId ? { initialScreenId } : {})}
        />
      )}
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#e5e7eb',
  font: '14px/1.4 system-ui, sans-serif',
  background: 'rgba(11,15,23,0.85)',
  zIndex: 5,
};

const errorStyle: React.CSSProperties = {
  ...overlayStyle,
  color: '#fecaca',
  background: 'rgba(76, 5, 25, 0.92)',
  padding: 16,
  textAlign: 'center',
};
