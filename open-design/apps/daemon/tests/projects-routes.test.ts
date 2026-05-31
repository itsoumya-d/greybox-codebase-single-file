/**
 * Coverage for `GET /api/projects/:id`. The route was extended (#451) to
 * include a derived `resolvedDir` field so the web client can address the
 * on-disk working directory directly without reconstructing it from the
 * daemon's internal projects root. Two cases:
 *   1. Folder-imported project — `resolvedDir === metadata.baseDir`.
 *   2. Native project — `resolvedDir === path.join(<projects root>, id)`.
 *
 * Pre-existing daemon test files cover specific subdomains
 * (folder-import-projects, project-status, project-watchers, ...);
 * none own this route, so a dedicated `projects-routes` file is cleaner
 * than expanding any of them.
 */
import type http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

describe('GET /api/projects/:id resolvedDir', () => {
  let server: http.Server;
  let baseUrl: string;
  const tempDirs: string[] = [];

  beforeAll(async () => {
    const started = (await startServer({ port: 0, returnServer: true })) as {
      url: string;
      server: http.Server;
    };
    baseUrl = started.url;
    server = started.server;
  });

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  afterAll(() => {
    return new Promise<void>((resolve) => server.close(() => resolve()));
  });

  function makeFolder(): string {
    const d = mkdtempSync(path.join(tmpdir(), 'agds-projects-routes-'));
    tempDirs.push(d);
    return d;
  }

  async function openProjectEvents(projectId: string): Promise<{
    waitFor(predicate: (evt: { event: string; data: any }) => boolean): Promise<{ event: string; data: any }>;
    close(): Promise<void>;
  }> {
    const response = await fetch(`${baseUrl}/api/projects/${encodeURIComponent(projectId)}/events`, {
      headers: { Accept: 'text/event-stream' },
    });
    if (!response.ok || !response.body) {
      throw new Error(`failed to open project events stream: ${response.status}`);
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const events: Array<{ event: string; data: any }> = [];
    let buffer = '';
    let closed = false;

    const pump = (async () => {
      while (!closed) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let boundary = buffer.indexOf('\n\n');
        while (boundary >= 0) {
          const raw = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          boundary = buffer.indexOf('\n\n');
          if (!raw.trim() || raw.startsWith(':')) continue;
          const evt: { event: string; data: any } = { event: 'message', data: '' };
          for (const line of raw.split('\n')) {
            if (line.startsWith('event: ')) evt.event = line.slice(7);
            if (line.startsWith('data: ')) evt.data += line.slice(6);
          }
          evt.data = evt.data ? JSON.parse(evt.data) : null;
          events.push(evt);
        }
      }
    })();

    return {
      async waitFor(predicate) {
        const deadline = Date.now() + 3_000;
        while (Date.now() < deadline) {
          const hit = events.find(predicate);
          if (hit) return hit;
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
        throw new Error(`timed out waiting for project event; seen=${JSON.stringify(events)}`);
      },
      async close() {
        closed = true;
        await reader.cancel().catch(() => {});
        await pump.catch(() => {});
      },
    };
  }

  async function waitForCondition<T>(read: () => T | undefined, label: string): Promise<T> {
    const deadline = Date.now() + 3_000;
    while (Date.now() < deadline) {
      const value = read();
      if (value !== undefined) return value;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(`timed out waiting for ${label}`);
  }

  async function eventDataToText(data: any): Promise<string> {
    if (typeof data === 'string') return data;
    if (data instanceof ArrayBuffer) return new TextDecoder().decode(new Uint8Array(data));
    if (ArrayBuffer.isView(data)) {
      return new TextDecoder().decode(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
    }
    if (data && typeof data.text === 'function') return data.text();
    return String(data);
  }

  async function closeWebSocket(ws: any, WebSocketCtor: any): Promise<void> {
    if (!ws || ws.readyState === WebSocketCtor.CLOSED) return;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 1_000);
      ws.addEventListener('close', () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
      ws.close();
    });
  }

  it('returns resolvedDir === metadata.baseDir for an imported-folder project', async () => {
    const folder = makeFolder();
    await writeFile(path.join(folder, 'index.html'), '<!doctype html>');

    const importResp = await fetch(`${baseUrl}/api/import/folder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseDir: folder }),
    });
    expect(importResp.status).toBe(200);
    const importBody = (await importResp.json()) as {
      project: { id: string; metadata?: { baseDir?: string } };
    };
    const projectId = importBody.project.id;
    const baseDir = importBody.project.metadata?.baseDir;
    expect(baseDir).toBeTruthy();

    const detailResp = await fetch(`${baseUrl}/api/projects/${projectId}`);
    expect(detailResp.status).toBe(200);
    const detail = (await detailResp.json()) as {
      project: { id: string };
      resolvedDir: string;
    };
    expect(detail.project.id).toBe(projectId);
    expect(detail.resolvedDir).toBe(baseDir);
  });

  it('returns resolvedDir under <projects root>/<id> for a native project', async () => {
    const projectId = `proj-routes-${Date.now()}`;
    const createResp = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: projectId,
        name: 'Native fixture',
        skillId: null,
      }),
    });
    expect(createResp.status).toBe(200);

    const detailResp = await fetch(`${baseUrl}/api/projects/${projectId}`);
    expect(detailResp.status).toBe(200);
    const detail = (await detailResp.json()) as {
      project: { id: string; metadata?: { baseDir?: string } };
      resolvedDir: string;
    };
    expect(detail.project.metadata?.baseDir).toBeUndefined();

    const dataDir = process.env.AGDS_DATA_DIR;
    if (!dataDir) throw new Error('AGDS_DATA_DIR is required for daemon route tests');
    const expected = path.join(dataDir, 'projects', projectId);
    expect(detail.resolvedDir).toBe(expected);
    expect(path.isAbsolute(detail.resolvedDir)).toBe(true);
  });

  it('serves lower-level studio resources through game-deliverables routes', async () => {
    const projectId = `deliverable-resource-${Date.now()}`;
    const createResp = await fetch(`${baseUrl}/api/game-deliverables`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: projectId,
        name: 'Deliverable resource fixture',
        gameSkillId: 'game-design-document',
      }),
    });
    expect(createResp.status).toBe(200);

    const writeResp = await fetch(`${baseUrl}/api/game-deliverables/${projectId}/files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'alias-notes.md',
        content: '# Game deliverable resource alias\n\nThis route stays game-native.',
      }),
    });
    expect(writeResp.status).toBe(200);

    const filesResp = await fetch(`${baseUrl}/api/game-deliverables/${projectId}/files`);
    expect(filesResp.status).toBe(200);
    const filesBody = (await filesResp.json()) as { files: Array<{ name: string }> };
    expect(filesBody.files.map((file) => file.name)).toContain('alias-notes.md');

    const rawResp = await fetch(`${baseUrl}/api/game-deliverables/${projectId}/raw/alias-notes.md`);
    expect(rawResp.status).toBe(200);
    await expect(rawResp.text()).resolves.toContain('game-native');

    const tabsResp = await fetch(`${baseUrl}/api/game-deliverables/${projectId}/tabs`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tabs: ['alias-notes.md'], active: 'alias-notes.md' }),
    });
    expect(tabsResp.status).toBe(200);
  });

  it('accepts canonical game deliverable fields and returns compatibility aliases', async () => {
    const projectId = `game-deliverable-${Date.now()}`;
    const createResp = await fetch(`${baseUrl}/api/game-deliverables`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: projectId,
        name: 'Mobile roguelike',
        gameSkillId: 'playable-game-prototype',
        gameArtBibleId: 'arcade-neon',
        deliverableKind: 'prototype',
        gameDesign: {
          genre: 'mobile roguelike dungeon crawler',
          camera: 'top-down',
          platforms: ['mobile portrait'],
        },
      }),
    });
    expect(createResp.status).toBe(200);
    const created = (await createResp.json()) as {
      project: {
        gameSkillId?: string | null;
        skillId?: string | null;
        gameArtBibleId?: string | null;
        metadata?: {
          kind?: string;
          deliverableKind?: string;
          gameDesign?: { genre?: string; platforms?: string[] };
        };
      };
    };

    expect(created.project.gameSkillId).toBe('playable-game-prototype');
    expect(created.project.skillId).toBe('playable-game-prototype');
    expect(created.project.gameArtBibleId).toBe('arcade-neon');
    expect(created.project).not.toHaveProperty('designSystemId');
    expect(created.project.metadata?.kind).toBe('prototype');
    expect(created.project.metadata?.deliverableKind).toBe('prototype');
    expect(created.project.metadata?.gameDesign?.genre).toBe('mobile roguelike dungeon crawler');

    const patchResp = await fetch(`${baseUrl}/api/game-deliverables/${projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gameSkillId: 'game-hud-system',
        gameArtBibleId: 'soulslike-dark',
        gameDesign: { genre: 'mobile roguelike dungeon crawler', camera: 'isometric' },
      }),
    });
    expect(patchResp.status).toBe(200);
    const patched = (await patchResp.json()) as {
      project: {
        gameSkillId?: string | null;
        skillId?: string | null;
        gameArtBibleId?: string | null;
        metadata?: { gameDesign?: { camera?: string; platforms?: string[] } };
      };
    };
    expect(patched.project.gameSkillId).toBe('game-hud-system');
    expect(patched.project.skillId).toBe('game-hud-system');
    expect(patched.project.gameArtBibleId).toBe('soulslike-dark');
    expect(patched.project).not.toHaveProperty('designSystemId');
    expect(patched.project.metadata?.gameDesign?.camera).toBe('isometric');
    expect(patched.project.metadata?.gameDesign?.platforms).toEqual(['mobile portrait']);
  });

  it('ignores retired art-bible request aliases on game deliverable routes', async () => {
    const projectId = `retired-art-bible-alias-${Date.now()}`;
    const retiredArtBibleAlias = 'design'.concat('SystemId');
    const createResp = await fetch(`${baseUrl}/api/game-deliverables`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: projectId,
        name: 'Retired art-bible alias fixture',
        gameSkillId: 'game-design-document',
        [retiredArtBibleAlias]: 'arcade-neon',
      }),
    });
    expect(createResp.status).toBe(200);
    const created = (await createResp.json()) as {
      project: Record<string, string | null | undefined> & { gameArtBibleId?: string | null };
    };
    expect(created.project.gameArtBibleId).toBeNull();
    expect(created.project).not.toHaveProperty(retiredArtBibleAlias);

    const patchResp = await fetch(`${baseUrl}/api/game-deliverables/${projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gameArtBibleId: 'fantasy-rpg',
      }),
    });
    expect(patchResp.status).toBe(200);

    const stalePatchResp = await fetch(`${baseUrl}/api/game-deliverables/${projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        [retiredArtBibleAlias]: 'soulslike-dark',
      }),
    });
    expect(stalePatchResp.status).toBe(200);
    const stalePatched = (await stalePatchResp.json()) as {
      project: Record<string, string | null | undefined> & { gameArtBibleId?: string | null };
    };
    expect(stalePatched.project.gameArtBibleId).toBe('fantasy-rpg');
    expect(stalePatched.project).not.toHaveProperty(retiredArtBibleAlias);
  });

  it('persists normalized game memory entities and links', async () => {
    const projectId = `game-memory-${Date.now()}`;
    const createResp = await fetch(`${baseUrl}/api/game-deliverables`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: projectId,
        name: 'Faction memory fixture',
        gameSkillId: 'game-design-document',
        gameArtBibleId: 'fantasy-rpg',
        deliverableKind: 'other',
      }),
    });
    expect(createResp.status).toBe(200);

    const upsertResp = await fetch(`${baseUrl}/api/game-deliverables/${projectId}/game-memory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'faction_ember_court',
        type: 'faction',
        name: 'Ember Court',
        summary: 'A firebound noble faction that controls volcanic trade routes.',
        payload: {
          ideology: 'order through ritual',
          palette: ['obsidian', 'ember'],
        },
      }),
    });
    expect(upsertResp.status).toBe(200);
    const upserted = (await upsertResp.json()) as {
      entity: {
        id: string;
        projectId: string;
        type: string;
        name: string;
        payload: { ideology?: string };
      };
    };
    expect(upserted.entity.projectId).toBe(projectId);
    expect(upserted.entity.type).toBe('faction');
    expect(upserted.entity.payload.ideology).toBe('order through ritual');

    const mergeResp = await fetch(`${baseUrl}/api/projects/${projectId}/game-memory/merge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entities: [
          {
            id: 'biome_ash_delta',
            type: 'biome',
            name: 'Ash Delta',
            summary: 'A lava-silt wetland built for traversal hazards.',
            payload: { dangerLevel: 4 },
          },
        ],
        links: [
          {
            id: 'link_ember_controls_delta',
            fromEntityId: 'faction_ember_court',
            toEntityId: 'biome_ash_delta',
            relationship: 'controls',
            payload: { stability: 'contested' },
          },
        ],
      }),
    });
    expect(mergeResp.status).toBe(200);
    const merged = (await mergeResp.json()) as {
      upsertedEntityIds: string[];
      upsertedLinkIds: string[];
      entities: Array<{ id: string; type: string }>;
      links: Array<{ id: string; relationship: string }>;
    };
    expect(merged.upsertedEntityIds).toEqual(['biome_ash_delta']);
    expect(merged.upsertedLinkIds).toEqual(['link_ember_controls_delta']);
    expect(merged.entities.map((entity) => entity.id).sort()).toEqual([
      'biome_ash_delta',
      'faction_ember_court',
    ]);
    expect(merged.links[0]?.relationship).toBe('controls');

    const factionOnlyResp = await fetch(
      `${baseUrl}/api/game-deliverables/${projectId}/game-memory?type=faction`,
    );
    expect(factionOnlyResp.status).toBe(200);
    const factionOnly = (await factionOnlyResp.json()) as {
      entities: Array<{ id: string; type: string }>;
      links: unknown[];
    };
    expect(factionOnly.entities).toEqual([
      expect.objectContaining({ id: 'faction_ember_court', type: 'faction' }),
    ]);
    expect(factionOnly.links).toHaveLength(1);

    const deleteResp = await fetch(
      `${baseUrl}/api/game-deliverables/${projectId}/game-memory/faction_ember_court`,
      { method: 'DELETE' },
    );
    expect(deleteResp.status).toBe(200);

    const afterDeleteResp = await fetch(`${baseUrl}/api/projects/${projectId}/game-memory`);
    expect(afterDeleteResp.status).toBe(200);
    const afterDelete = (await afterDeleteResp.json()) as {
      entities: Array<{ id: string }>;
      links: unknown[];
    };
    expect(afterDelete.entities.map((entity) => entity.id)).toEqual(['biome_ash_delta']);
    expect(afterDelete.links).toHaveLength(0);
  });

  it('rejects unsupported game memory entity types', async () => {
    const projectId = `game-memory-invalid-${Date.now()}`;
    const createResp = await fetch(`${baseUrl}/api/game-deliverables`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: projectId, name: 'Invalid memory fixture' }),
    });
    expect(createResp.status).toBe(200);

    const upsertResp = await fetch(`${baseUrl}/api/projects/${projectId}/game-memory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'pricing_card',
        name: 'Wrong surface',
      }),
    });
    expect(upsertResp.status).toBe(400);
    const body = (await upsertResp.json()) as { error?: { message?: string } };
    expect(body.error?.message).toMatch(/unsupported game entity type/i);
  });

  it('broadcasts preview comments over project SSE for collaborative studio review', async () => {
    const projectId = `comment-events-${Date.now()}`;
    const createResp = await fetch(`${baseUrl}/api/game-deliverables`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: projectId, name: 'Collaborative boss arena' }),
    });
    expect(createResp.status).toBe(200);

    const conversationResp = await fetch(`${baseUrl}/api/projects/${projectId}/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Arena review' }),
    });
    expect(conversationResp.status).toBe(200);
    const conversationBody = (await conversationResp.json()) as { conversation: { id: string } };
    const conversationId = conversationBody.conversation.id;
    const stream = await openProjectEvents(projectId);

    try {
      await stream.waitFor((evt) => evt.event === 'ready' && evt.data.projectId === projectId);
      const target = {
        filePath: 'boss-arena.html',
        elementId: 'boss-hud',
        selector: '[data-agds-id="boss-hud"]',
        label: 'Boss HUD',
        text: 'Enrage timer',
        position: { x: 10, y: 20, width: 120, height: 40 },
        htmlHint: '<section data-agds-id="boss-hud">',
      };

      const upsertResp = await fetch(`${baseUrl}/api/projects/${projectId}/conversations/${conversationId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target, note: 'Make this readable for controller players.' }),
      });
      expect(upsertResp.status).toBe(200);
      const upsertBody = (await upsertResp.json()) as { comment: { id: string } };
      const commentId = upsertBody.comment.id;
      await stream.waitFor((evt) =>
        evt.event === 'preview_comment' &&
        evt.data.action === 'upserted' &&
        evt.data.comment?.id === commentId &&
        evt.data.conversationId === conversationId,
      );

      const patchResp = await fetch(`${baseUrl}/api/projects/${projectId}/conversations/${conversationId}/comments/${commentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'needs_review' }),
      });
      expect(patchResp.status).toBe(200);
      await stream.waitFor((evt) =>
        evt.event === 'preview_comment' &&
        evt.data.action === 'status-updated' &&
        evt.data.comment?.status === 'needs_review' &&
        evt.data.commentId === commentId,
      );

      const deleteResp = await fetch(`${baseUrl}/api/projects/${projectId}/conversations/${conversationId}/comments/${commentId}`, {
        method: 'DELETE',
      });
      expect(deleteResp.status).toBe(200);
      await stream.waitFor((evt) =>
        evt.event === 'preview_comment' &&
        evt.data.action === 'deleted' &&
        evt.data.commentId === commentId,
      );
    } finally {
      await stream.close();
    }
  });

  it('broadcasts project file saves for Unity artifact refresh subscribers', async () => {
    const projectId = `unity-file-events-${Date.now()}`;
    const createResp = await fetch(`${baseUrl}/api/game-deliverables`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: projectId, name: 'Unity file refresh' }),
    });
    expect(createResp.status).toBe(200);

    const stream = await openProjectEvents(projectId);
    try {
      await stream.waitFor((evt) => evt.event === 'ready' && evt.data.projectId === projectId);
      const saveResp = await fetch(`${baseUrl}/api/projects/${projectId}/files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'arena.gameview.json',
          content: JSON.stringify({
            version: 1,
            kind: 'game-viewport',
            surface: 'combat arena',
            title: 'Unity Refresh Arena',
          }),
        }),
      });
      expect(saveResp.status).toBe(200);

      await stream.waitFor((evt) =>
        evt.event === 'file_changed' &&
        evt.data.action === 'saved' &&
        evt.data.fileName === 'arena.gameview.json' &&
        evt.data.file?.kind === 'game-viewport',
      );
    } finally {
      await stream.close();
    }
  });

  it('broadcasts project file saves over the Unity sync websocket', async () => {
    const WebSocketCtor = (globalThis as any).WebSocket;
    expect(typeof WebSocketCtor).toBe('function');

    const projectId = `unity-ws-file-events-${Date.now()}`;
    const createResp = await fetch(`${baseUrl}/api/game-deliverables`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: projectId, name: 'Unity websocket refresh' }),
    });
    expect(createResp.status).toBe(200);

    const frames: any[] = [];
    const ws = new WebSocketCtor(`${baseUrl.replace(/^http/, 'ws')}/api/sync/unity?projectId=${encodeURIComponent(projectId)}`);
    ws.addEventListener('message', (event: any) => {
      void eventDataToText(event.data).then((text) => frames.push(JSON.parse(text)));
    });

    try {
      await waitForCondition(() => ws.readyState === WebSocketCtor.OPEN ? true : undefined, 'Unity websocket open');
      const saveResp = await fetch(`${baseUrl}/api/projects/${projectId}/files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'arena.gameview.json',
          content: JSON.stringify({
            version: 1,
            kind: 'game-viewport',
            surface: 'combat arena',
            title: 'Unity WebSocket Arena',
          }),
        }),
      });
      expect(saveResp.status).toBe(200);

      const frame = await waitForCondition(
        () => frames.find((item) =>
          item.type === 'artifact-changed' &&
          item.projectId === projectId &&
          item.payload?.type === 'file_changed' &&
          item.payload?.action === 'saved' &&
          item.payload?.fileName === 'arena.gameview.json'),
        'Unity artifact-changed frame',
      );
      expect(frame.payload.file.kind).toBe('game-viewport');
    } finally {
      await closeWebSocket(ws, WebSocketCtor);
    }
  });

  it('sends Unity round-trip conflict frames with a merged draft', async () => {
    const WebSocketCtor = (globalThis as any).WebSocket;
    expect(typeof WebSocketCtor).toBe('function');

    const projectId = `unity-ws-conflict-${Date.now()}`;
    const createResp = await fetch(`${baseUrl}/api/game-deliverables`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: projectId, name: 'Unity conflict draft' }),
    });
    expect(createResp.status).toBe(200);

    const fileName = 'arena.gameview.json';
    const baseDocument = {
      version: 1,
      kind: 'game-viewport',
      surface: 'combat arena',
      title: 'Conflict Arena',
      actors: [{ id: 'boss', health: 1 }],
    };
    const baseSaveResp = await fetch(`${baseUrl}/api/projects/${projectId}/files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: fileName, content: JSON.stringify(baseDocument) }),
    });
    expect(baseSaveResp.status).toBe(200);

    const frames: any[] = [];
    const ws = new WebSocketCtor(`${baseUrl.replace(/^http/, 'ws')}/api/sync/unity?projectId=${encodeURIComponent(projectId)}`);
    ws.addEventListener('message', (event: any) => {
      void eventDataToText(event.data).then((text) => frames.push(JSON.parse(text)));
    });

    try {
      await waitForCondition(() => ws.readyState === WebSocketCtor.OPEN ? true : undefined, 'Unity websocket open');
      ws.send(JSON.stringify({
        type: 'unity-edit',
        fileName,
        path: '$.actors[id=boss].health',
        value: 1,
        sentAt: Date.now() - 250,
        latencyBudgetMs: 2000,
      }));
      await waitForCondition(
        () => frames.find((item) =>
          item.payload?.type === 'round_trip_merge' &&
          item.payload?.action === 'unity-edit-merged' &&
          item.payload?.fileName === fileName),
        'initial Unity merge frame',
      );

      const webDocument = { ...baseDocument, actors: [{ id: 'boss', health: 3 }] };
      const webSaveResp = await fetch(`${baseUrl}/api/projects/${projectId}/files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: fileName, content: JSON.stringify(webDocument) }),
      });
      expect(webSaveResp.status).toBe(200);

      ws.send(JSON.stringify({
        type: 'unity-edit',
        fileName,
        path: '$.actors[id=boss].health',
        value: 2,
        sentAt: Date.now() - 2501,
        latencyBudgetMs: 2000,
      }));
      const frame = await waitForCondition(
        () => frames.find((item) =>
          item.payload?.type === 'round_trip_merge' &&
          item.payload?.action === 'conflict' &&
          item.payload?.fileName === fileName),
        'Unity conflict frame',
      );
      expect(frame.payload.conflicts).toEqual([
        expect.objectContaining({ path: '$.actors[id=boss].health', webValue: 3, unityValue: 2 }),
      ]);
      expect(frame.payload.latencyBudgetMs).toBe(2000);
      expect(frame.payload.observedLatencyMs).toBeGreaterThanOrEqual(2501);
      expect(frame.payload.overLatencyBudget).toBe(true);
      expect(JSON.parse(frame.payload.mergedContent).actors[0].health).toBe(2);
    } finally {
      await closeWebSocket(ws, WebSocketCtor);
    }
  });

  it('broadcasts studio presence over every project SSE subscriber for shared game-surface review', async () => {
    const projectId = `presence-events-${Date.now()}`;
    const createResp = await fetch(`${baseUrl}/api/game-deliverables`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: projectId, name: 'Behavior tree review' }),
    });
    expect(createResp.status).toBe(200);

    const directorStream = await openProjectEvents(projectId);
    const systemsStream = await openProjectEvents(projectId);
    try {
      await Promise.all([
        directorStream.waitFor((evt) => evt.event === 'ready' && evt.data.projectId === projectId),
        systemsStream.waitFor((evt) => evt.event === 'ready' && evt.data.projectId === projectId),
      ]);

      const presenceResp = await fetch(`${baseUrl}/api/projects/${projectId}/presence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: 'director-1',
          actorName: 'Creative Director',
          surface: 'behavior-tree',
          filePath: 'enemy-captain.btree.json',
          mode: 'reviewing',
          cursor: {
            selectionKind: 'node',
            selectionLabel: 'Phase 2 counterplay branch',
            line: 42,
            column: 7,
          },
        }),
      });
      expect(presenceResp.status).toBe(200);
      const presenceBody = (await presenceResp.json()) as {
        presence: {
          type: string;
          projectId: string;
          clientId: string;
          actorName?: string;
          surface?: string;
          filePath?: string;
          mode: string;
          cursor?: {
            selectionKind?: string;
            selectionLabel?: string;
            line?: number;
            column?: number;
          };
          updatedAt: number;
        };
      };
      expect(presenceBody.presence).toMatchObject({
        type: 'studio_presence',
        projectId,
        clientId: 'director-1',
        actorName: 'Creative Director',
        surface: 'behavior-tree',
        filePath: 'enemy-captain.btree.json',
        mode: 'reviewing',
        cursor: {
          selectionKind: 'node',
          selectionLabel: 'Phase 2 counterplay branch',
          line: 42,
          column: 7,
        },
      });
      expect(typeof presenceBody.presence.updatedAt).toBe('number');

      const matchesStudioPresence = (evt: { event: string; data: any }) =>
        evt.event === 'studio_presence' &&
        evt.data.projectId === projectId &&
        evt.data.clientId === 'director-1' &&
        evt.data.surface === 'behavior-tree' &&
        evt.data.filePath === 'enemy-captain.btree.json' &&
        evt.data.mode === 'reviewing' &&
        evt.data.cursor?.selectionLabel === 'Phase 2 counterplay branch' &&
        evt.data.cursor?.line === 42 &&
        evt.data.cursor?.column === 7;

      await Promise.all([
        directorStream.waitFor(matchesStudioPresence),
        systemsStream.waitFor(matchesStudioPresence),
      ]);
    } finally {
      await Promise.all([
        directorStream.close(),
        systemsStream.close(),
      ]);
    }
  });

  it('returns 404 with PROJECT_NOT_FOUND for unknown ids', async () => {
    const resp = await fetch(`${baseUrl}/api/projects/does-not-exist-${Date.now()}`);
    expect(resp.status).toBe(404);
    const body = (await resp.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('PROJECT_NOT_FOUND');
  });

  // PR #974: `fromTrustedPicker` is privileged the same way `baseDir`
  // is — only the HMAC-gated POST /api/import/folder may set it. POST
  // /api/projects (the generic create endpoint) and PATCH
  // /api/projects/:id must reject any client-supplied attempt to
  // acquire or flip the marker, otherwise a compromised renderer could
  // mark a previously-untrusted folder-imported project as trusted and
  // re-open the openPath bypass.
  it('rejects fromTrustedPicker on POST /api/projects', async () => {
    const projectId = `proj-trusted-${Date.now()}`;
    const resp = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: projectId,
        name: 'Smuggled trust',
        skillId: null,
        metadata: { kind: 'prototype', fromTrustedPicker: true },
      }),
    });
    expect(resp.status).toBe(400);
    const body = (await resp.json()) as { error?: { code?: string; message?: string } };
    expect(body.error?.code).toBe('BAD_REQUEST');
    expect(body.error?.message).toMatch(/fromTrustedPicker/i);
  });

  it('rejects fromTrustedPicker on PATCH /api/projects/:id', async () => {
    // Create a vanilla native project, then try to PATCH the
    // trusted-picker marker onto it. The handler must refuse —
    // PATCHing privileged metadata fields is the same threat surface
    // as setting them on creation.
    const projectId = `proj-trusted-patch-${Date.now()}`;
    const createResp = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: projectId,
        name: 'Native fixture',
        skillId: null,
      }),
    });
    expect(createResp.status).toBe(200);

    const patchResp = await fetch(`${baseUrl}/api/projects/${projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ metadata: { kind: 'prototype', fromTrustedPicker: true } }),
    });
    expect(patchResp.status).toBe(400);
    const body = (await patchResp.json()) as { error?: { code?: string; message?: string } };
    expect(body.error?.code).toBe('BAD_REQUEST');
    expect(body.error?.message).toMatch(/fromTrustedPicker/i);
  });
});
