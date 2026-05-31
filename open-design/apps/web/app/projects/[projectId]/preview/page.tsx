// SPDX-License-Identifier: Apache-2.0
import { PreviewClient } from './preview-client.js';

/**
 * Server entry for the playable-prototype runner.
 *
 * Next.js 16 exposes `params` as a Promise; we await once and hand the
 * project id off to the dynamic client shell.
 */
export default async function PreviewPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <PreviewClient projectId={projectId} />;
}

// Mirror the design route's SPA-style static-export fallback so `next
// build --output export` emits a single shell the daemon's projects
// API can hydrate at runtime.
export function generateStaticParams() {
  return [{ projectId: 'demo' }];
}
