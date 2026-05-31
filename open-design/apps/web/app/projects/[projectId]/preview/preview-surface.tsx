// SPDX-License-Identifier: Apache-2.0
'use client';

import { useCallback, useState } from 'react';

import { PrototypeRunnerView } from '@greybox/prototype-runner/react';

/**
 * Full-screen wrapper around `PrototypeRunnerView`. Wires the project URL
 * (served by the daemon at `/api/projects/<id>/design`) and the asset
 * base URL (the daemon's per-project asset endpoint) into the runner.
 *
 * Errors / screen changes are surfaced in a small status overlay so QA
 * can see what's happening even without the dev tools open.
 */
export function PreviewSurface({ projectId }: { projectId: string }) {
  const [screenId, setScreenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onScreenChange = useCallback((id: string) => {
    setScreenId(id);
  }, []);
  const onError = useCallback((err: Error) => {
    setError(err.message);
  }, []);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#0b0f17',
        color: '#e5e7eb',
        font: '14px/1.4 system-ui, sans-serif',
      }}
    >
      <PrototypeRunnerView
        projectUrl={`/api/projects/${encodeURIComponent(projectId)}/design`}
        assetBaseUrl={`/api/projects/${encodeURIComponent(projectId)}/assets`}
        onScreenChange={onScreenChange}
        onError={onError}
        showControls
      />
      <div
        role="status"
        style={{
          position: 'absolute',
          bottom: 8,
          left: 8,
          padding: '6px 10px',
          background: 'rgba(15, 23, 42, 0.75)',
          borderRadius: 6,
          fontSize: 12,
          pointerEvents: 'none',
        }}
      >
        {error ? `Error: ${error}` : `Project ${projectId} · screen ${screenId ?? '—'}`}
      </div>
    </div>
  );
}
