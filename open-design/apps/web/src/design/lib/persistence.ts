// SPDX-License-Identifier: Apache-2.0
/**
 * REST persistence helpers for the design surface.
 *
 * The daemon serves the canonical project document at
 * `GET/PUT /api/projects/:id/design`. This module is the only place that
 * touches `fetch` so the editor stays decoupled from the wire format. If a
 * future Yjs provider takes over, only this file needs to grow a branch.
 *
 * @packageDocumentation
 */
import type { GameProject } from '@greybox/schema';
import { safeParseGameProject } from '@greybox/schema';

/**
 * Build the design endpoint URL for a project id.
 *
 * Exported so tests / mocks can compute the same path without duplicating
 * the route string.
 */
export function designEndpoint(projectId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/design`;
}

export interface FetchProjectResult {
  ok: true;
  project: GameProject;
}
export interface FetchProjectMiss {
  ok: false;
  status: number;
  message: string;
}

/**
 * GET the canonical project document.
 *
 * Returns `{ ok: false, status: 404 }` when no document has been written yet
 * — callers should respond by scaffolding a fresh project locally and
 * persisting it on first edit.
 */
export async function fetchDesignProject(
  projectId: string,
  init?: RequestInit,
): Promise<FetchProjectResult | FetchProjectMiss> {
  const res = await fetch(designEndpoint(projectId), { ...init, method: 'GET' });
  if (res.status === 404) {
    return { ok: false, status: 404, message: 'project not found' };
  }
  if (!res.ok) {
    return { ok: false, status: res.status, message: `HTTP ${res.status}` };
  }
  const json = (await res.json()) as unknown;
  const parsed = safeParseGameProject(json);
  if (!parsed.success) {
    return {
      ok: false,
      status: 422,
      message: `invalid project: ${parsed.error.issues[0]?.message ?? 'unknown'}`,
    };
  }
  return { ok: true, project: parsed.data };
}

/**
 * PUT the project document. Daemon revalidates server-side before writing.
 */
export async function putDesignProject(
  projectId: string,
  project: GameProject,
  init?: RequestInit,
): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  const res = await fetch(designEndpoint(projectId), {
    ...init,
    method: 'PUT',
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    body: JSON.stringify(project),
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { message?: string; error?: string };
      detail = body.message ?? body.error ?? detail;
    } catch {
      // Body was not JSON; keep the status code as the message.
    }
    return { ok: false, status: res.status, message: detail };
  }
  return { ok: true };
}
