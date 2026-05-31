// SPDX-License-Identifier: Apache-2.0
import { DesignClient } from './design-client.js';

/**
 * Server entry. Next.js 16 exposes `params` as a Promise — we await once,
 * extract the projectId, and hand off to the client subtree.
 */
export default async function DesignPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <DesignClient projectId={projectId} />;
}

// Catch-all SPA-style: project IDs are unbounded. Mirror the existing
// `[[...slug]]` page's approach so `next build --output export` emits a
// single shell HTML the daemon's SPA fallback can serve.
export function generateStaticParams() {
  return [{ projectId: 'demo' }];
}
