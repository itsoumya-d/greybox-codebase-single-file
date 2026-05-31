// SPDX-License-Identifier: Apache-2.0
/**
 * Engine export helpers. Talks to the daemon's per-engine package builder
 * and triggers a browser download.
 */

/** Engines the export dropdown supports. */
export type ExportEngine = 'unity' | 'unreal' | 'godot';

/**
 * Fire-and-forget download of an engine-specific zip.
 *
 * The daemon implements `POST /api/projects/:id/design/export?engine=<engine>`
 * which streams a `application/zip` response. On success the browser navigates
 * via a hidden anchor; on failure we throw so the caller can surface a toast.
 */
export async function exportEnginePackage(
  projectId: string,
  engine: ExportEngine,
): Promise<void> {
  const url = `/api/projects/${encodeURIComponent(projectId)}/design/export?engine=${engine}`;
  const res = await fetch(url, { method: 'POST' });
  if (!res.ok) {
    throw new Error(`export ${engine} failed: HTTP ${res.status}`);
  }
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = `${projectId}-${engine}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    // Free the temp ObjectURL after the click handler has consumed it.
    // (Some browsers race a tick — schedule a microtask to be safe.)
    setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  }
}
