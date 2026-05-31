/**
 * `PrototypeControls`: a minimal floating control panel rendered above
 * the canvas with play/pause, restart, and a screen breadcrumb.
 *
 * The visual style is deliberately spartan; consumers can override with
 * the `className` prop or replace this component entirely.
 *
 * @packageDocumentation
 */

import { useEffect, useState } from 'react';

import type { PrototypeRunner } from '../PrototypeRunner.js';

/** Props accepted by {@link PrototypeControls}. */
export interface PrototypeControlsProps {
  runner: PrototypeRunner | null;
  /** Optional CSS class for the outer wrapper. */
  className?: string;
  /** Override the initial screen used by the Restart button. */
  initialScreenId?: string;
}

interface ControlState {
  paused: boolean;
  current: string | null;
  history: string[];
}

/**
 * Floating play/pause + breadcrumb panel.
 */
export function PrototypeControls(props: PrototypeControlsProps): JSX.Element {
  const { runner, className, initialScreenId } = props;
  const [state, setState] = useState<ControlState>(() => ({
    paused: runner?.status().paused ?? false,
    current: runner?.status().currentScreenId ?? null,
    history: runner?.status().screenHistory ?? [],
  }));

  useEffect(() => {
    if (!runner) return;
    const sync = (): void => {
      const s = runner.status();
      setState({
        paused: s.paused,
        current: s.currentScreenId,
        history: s.screenHistory,
      });
    };
    const offSc = runner.on('screen-change', sync);
    const offP = runner.on('paused', sync);
    const offR = runner.on('resumed', sync);
    sync();
    return () => {
      offSc();
      offP();
      offR();
    };
  }, [runner]);

  if (!runner) return <div className={className} aria-hidden />;

  return (
    <div
      className={className}
      role="toolbar"
      aria-label="Prototype controls"
      style={{
        position: 'absolute',
        top: 8,
        right: 8,
        zIndex: 10,
        display: 'flex',
        gap: 6,
        alignItems: 'center',
        padding: '6px 10px',
        background: 'rgba(15, 23, 42, 0.75)',
        color: '#e5e7eb',
        borderRadius: 8,
        font: '12px/1.3 system-ui, sans-serif',
      }}
    >
      <button
        type="button"
        onClick={(): void => {
          if (state.paused) runner.resume();
          else runner.pause();
        }}
        style={btnStyle}
        aria-pressed={state.paused}
        aria-label={state.paused ? 'Resume' : 'Pause'}
      >
        {state.paused ? 'Resume' : 'Pause'}
      </button>
      <button
        type="button"
        onClick={(): void => {
          const target = initialScreenId ?? state.history[0];
          if (target) void runner.goToScreen(target);
        }}
        style={btnStyle}
        aria-label="Restart prototype"
      >
        Restart
      </button>
      <span aria-label="Current screen" style={{ marginLeft: 6, opacity: 0.85 }}>
        {state.current ? renderBreadcrumb(state.history) : 'idle'}
      </span>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  background: '#111827',
  color: '#e5e7eb',
  border: '1px solid #1f2937',
  borderRadius: 6,
  padding: '4px 8px',
  cursor: 'pointer',
  font: 'inherit',
};

function renderBreadcrumb(history: string[]): string {
  if (history.length <= 4) return history.join(' › ');
  return `... › ${history.slice(-3).join(' › ')}`;
}
