// SPDX-License-Identifier: Apache-2.0
'use client';

import dynamic from 'next/dynamic';

// Defer to a `next/dynamic` import with `ssr: false` so the design surface
// (which reads `window`, `document`, the daemon's projects API, etc.) never
// runs at static-export time. Mirrors the existing `[[...slug]]` client shell.
const DesignSurface = dynamic(
  () => import('../../../../src/design/components/DesignSurface').then((m) => m.DesignSurface),
  {
    ssr: false,
    loading: () => <div className='design-shell design-shell--loading'>Loading designer…</div>,
  },
);

export function DesignClient({ projectId }: { projectId: string }) {
  return <DesignSurface projectId={projectId} />;
}
