// SPDX-License-Identifier: Apache-2.0
'use client';

import dynamic from 'next/dynamic';

/**
 * The Babylon-based runner reaches into `window`, WebGL, and WebAudio, so
 * we defer the actual import to the client via `next/dynamic` with
 * `ssr: false`. This keeps the static-export shell tiny and avoids any
 * SSR-time evaluation of `@babylonjs/*` modules.
 */
const PreviewSurface = dynamic(
  () => import('./preview-surface.js').then((m) => m.PreviewSurface),
  {
    ssr: false,
    loading: () => (
      <div
        style={{
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0b0f17',
          color: '#e5e7eb',
          font: '14px/1.4 system-ui, sans-serif',
        }}
      >
        Loading prototype runner…
      </div>
    ),
  },
);

export function PreviewClient({ projectId }: { projectId: string }) {
  return <PreviewSurface projectId={projectId} />;
}
