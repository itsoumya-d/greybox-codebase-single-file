'use client';

import dynamic from 'next/dynamic';

// The studio shell is a fully client-driven SPA — every component reads
// localStorage, window.location, etc. — so we opt out of static-time
// rendering for the entire tree. This keeps `next build --output export`
// from trying to evaluate browser-only code while still emitting a real
// shell HTML the daemon can serve as the SPA fallback.
const App = dynamic(() => import('../../src/App').then((m) => m.App), {
  ssr: false,
  loading: () => <div className="agds-loading-shell">Loading AI Game Design Studio…</div>,
});

export function ClientApp() {
  return <App />;
}
