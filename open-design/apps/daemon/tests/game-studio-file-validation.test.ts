import type http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

describe('game studio project file validation', () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    const started = (await startServer({ port: 0, returnServer: true })) as {
      url: string;
      server: http.Server;
    };
    baseUrl = started.url;
    server = started.server;
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  async function createProject() {
    const id = `studio-docs-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const resp = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name: id }),
    });
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as { project: { id: string } };
    return body.project.id;
  }

  async function writeProjectFile(projectId: string, name: string, content: string) {
    return fetch(`${baseUrl}/api/projects/${projectId}/files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, content }),
    });
  }

  async function renameProjectFile(projectId: string, from: string, to: string) {
    return fetch(`${baseUrl}/api/projects/${projectId}/files/rename`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to }),
    });
  }

  async function listFiles(projectId: string) {
    const resp = await fetch(`${baseUrl}/api/projects/${projectId}/files`);
    expect(resp.status).toBe(200);
    return (await resp.json()) as { files: Array<{ name: string; kind: string; mime: string }> };
  }

  it('accepts valid game viewport documents saved through the project file route', async () => {
    const projectId = await createProject();
    const content = JSON.stringify({
      version: 1,
      kind: 'game-viewport',
      surface: 'combat arena',
      title: 'Foundry Ambush',
      objective: 'Teach cover movement while enemies flank from the catwalk.',
      entities: [
        {
          id: 'player_spawn',
          name: 'Player Spawn',
          type: 'spawn',
          x: 120,
          y: 220,
          objective: 'Start with a clear sightline to the first objective marker.',
        },
      ],
    });

    const resp = await writeProjectFile(projectId, 'foundry-ambush.gameview.json', content);
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as { file: { kind: string; mime: string } };
    expect(body.file.kind).toBe('game-viewport');
    expect(body.file.mime).toBe(
      'application/vnd.ai-game-design-studio.game-viewport+json; charset=utf-8',
    );

    const raw = await fetch(`${baseUrl}/api/projects/${projectId}/raw/foundry-ambush.gameview.json`);
    expect(raw.status).toBe(200);
    expect(await raw.json()).toMatchObject({ kind: 'game-viewport', title: 'Foundry Ambush' });
  });

  it('rejects malformed or schema-invalid game studio JSON and does not persist it', async () => {
    const projectId = await createProject();

    const malformed = await writeProjectFile(
      projectId,
      'broken.gameview.json',
      '{"version":1,"kind":"game-viewport"',
    );
    expect(malformed.status).toBe(400);
    const malformedBody = (await malformed.json()) as {
      error?: { code?: string; details?: { file?: string; issues?: string[] } };
    };
    expect(malformedBody.error?.code).toBe('INVALID_GAME_STUDIO_DOCUMENT');
    expect(malformedBody.error?.details?.file).toBe('broken.gameview.json');
    expect(malformedBody.error?.details?.issues?.[0]).toContain('Invalid JSON');

    const invalid = await writeProjectFile(
      projectId,
      'missing-nodes.nodegraph.json',
      JSON.stringify({
        version: 1,
        kind: 'node-graph',
        graphType: 'quest-logic',
        title: 'Missing Nodes',
      }),
    );
    expect(invalid.status).toBe(400);
    const invalidBody = (await invalid.json()) as {
      error?: { code?: string; details?: { issues?: string[] } };
    };
    expect(invalidBody.error?.code).toBe('INVALID_GAME_STUDIO_DOCUMENT');
    expect(invalidBody.error?.details?.issues?.some((issue) => issue.includes('nodes'))).toBe(true);

    const files = await listFiles(projectId);
    expect(files.files.some((file) => file.name === 'broken.gameview.json')).toBe(false);
    expect(files.files.some((file) => file.name === 'missing-nodes.nodegraph.json')).toBe(false);
  });

  it('rejects renames that would turn invalid JSON into a game studio document', async () => {
    const projectId = await createProject();
    const writeResp = await writeProjectFile(projectId, 'draft.txt', 'not json');
    expect(writeResp.status).toBe(200);

    const renameResp = await renameProjectFile(projectId, 'draft.txt', 'draft.gameview.json');
    expect(renameResp.status).toBe(400);
    const body = (await renameResp.json()) as {
      error?: { code?: string; details?: { file?: string; issues?: string[] } };
    };
    expect(body.error?.code).toBe('INVALID_GAME_STUDIO_DOCUMENT');
    expect(body.error?.details?.file).toBe('draft.gameview.json');
    expect(body.error?.details?.issues?.[0]).toContain('Invalid JSON');

    const files = await listFiles(projectId);
    expect(files.files.some((file) => file.name === 'draft.txt')).toBe(true);
    expect(files.files.some((file) => file.name === 'draft.gameview.json')).toBe(false);
  });

  it('hard-blocks legacy non-game text artifacts saved through the project file route', async () => {
    const projectId = await createProject();
    const resp = await writeProjectFile(
      projectId,
      'legacy-package.md',
      [
        '# Legacy Package',
        'Create a SaaS landing page with pricing cards, CRM dashboard widgets, login, and customer journey funnels.',
      ].join('\n'),
    );

    expect(resp.status).toBe(400);
    const body = (await resp.json()) as {
      error?: {
        code?: string;
        details?: {
          file?: string;
          findings?: Array<{ id: string; severity: string; message: string }>;
        };
      };
    };
    expect(body.error?.code).toBe('INVALID_GAME_STUDIO_ARTIFACT');
    expect(body.error?.details?.file).toBe('legacy-package.md');
    expect(body.error?.details?.findings?.some((finding) => finding.severity === 'P0')).toBe(true);

    const files = await listFiles(projectId);
    expect(files.files.some((file) => file.name === 'legacy-package.md')).toBe(false);
  });

  it('blocks renames that would publish legacy text as a game-studio artifact', async () => {
    const projectId = await createProject();
    const content = 'Pricing page with free trial, invoice checkout, admin panel, and marketing site sections.';
    const writeResp = await writeProjectFile(projectId, 'legacy.note', content);
    expect(writeResp.status).toBe(200);

    const renameResp = await renameProjectFile(projectId, 'legacy.note', 'legacy.md');
    expect(renameResp.status).toBe(400);
    const body = (await renameResp.json()) as {
      error?: { code?: string; details?: { file?: string } };
    };
    expect(body.error?.code).toBe('INVALID_GAME_STUDIO_ARTIFACT');
    expect(body.error?.details?.file).toBe('legacy.md');

    const files = await listFiles(projectId);
    expect(files.files.some((file) => file.name === 'legacy.note')).toBe(true);
    expect(files.files.some((file) => file.name === 'legacy.md')).toBe(false);
  });

  it('allows game-native Markdown artifacts even when lint advisories remain non-blocking', async () => {
    const projectId = await createProject();
    const resp = await writeProjectFile(
      projectId,
      'foundry-arena.md',
      [
        '# Foundry Arena Combat Brief',
        'Game: a tactical action prototype where the player clears a level, tracks the objective, and can pause or restart after a failed wave.',
        'Core loop: enter the scene, read enemy telegraphs, spend stamina, collect loot, and upgrade the combat build between encounters.',
      ].join('\n'),
    );

    expect(resp.status).toBe(200);
    const files = await listFiles(projectId);
    expect(files.files.some((file) => file.name === 'foundry-arena.md')).toBe(true);
  });

  it('leaves ordinary JSON files editable without game-studio schema checks', async () => {
    const projectId = await createProject();
    const resp = await writeProjectFile(
      projectId,
      'scratchpad.json',
      JSON.stringify({ kind: 'notes', missingGameStudioFields: true }),
    );

    expect(resp.status).toBe(200);
    const body = (await resp.json()) as { file: { kind: string; mime: string } };
    expect(body.file.kind).toBe('code');
    expect(body.file.mime).toBe('application/json; charset=utf-8');
  });

  it('validates content when a file is renamed into a game-studio document extension', async () => {
    const projectId = await createProject();
    expect((await writeProjectFile(projectId, 'notes.txt', 'not json')).status).toBe(200);

    const invalidRename = await renameProjectFile(projectId, 'notes.txt', 'notes.gameview.json');
    expect(invalidRename.status).toBe(400);
    const invalidBody = (await invalidRename.json()) as {
      error?: { code?: string; details?: { file?: string; issues?: string[] } };
    };
    expect(invalidBody.error?.code).toBe('INVALID_GAME_STUDIO_DOCUMENT');
    expect(invalidBody.error?.details?.file).toBe('notes.gameview.json');

    const filesAfterInvalid = await listFiles(projectId);
    expect(filesAfterInvalid.files.some((file) => file.name === 'notes.txt')).toBe(true);
    expect(filesAfterInvalid.files.some((file) => file.name === 'notes.gameview.json')).toBe(false);

    const validViewport = JSON.stringify({
      version: 1,
      kind: 'game-viewport',
      surface: 'tutorial arena',
      title: 'Rename Validated Arena',
    });
    expect((await writeProjectFile(projectId, 'arena.txt', validViewport)).status).toBe(200);
    const validRename = await renameProjectFile(projectId, 'arena.txt', 'arena.gameview.json');
    expect(validRename.status).toBe(200);
    const validBody = (await validRename.json()) as { file: { name: string; kind: string } };
    expect(validBody.file.name).toBe('arena.gameview.json');
    expect(validBody.file.kind).toBe('game-viewport');
  });

  it('rejects invalid game studio documents uploaded through the chat attachment route', async () => {
    const projectId = await createProject();
    const form = new FormData();
    form.append(
      'files',
      new Blob([JSON.stringify({ version: 1, kind: 'game-viewport', title: 'No Surface' })], {
        type: 'application/json',
      }),
      'bad-arena.gameview.json',
    );

    const resp = await fetch(`${baseUrl}/api/projects/${projectId}/upload`, {
      method: 'POST',
      body: form,
    });
    expect(resp.status).toBe(400);
    const body = (await resp.json()) as { error?: { code?: string; details?: { file?: string } } };
    expect(body.error?.code).toBe('INVALID_GAME_STUDIO_DOCUMENT');
    expect(body.error?.details?.file).toMatch(/bad-arena\.gameview\.json$/);

    const files = await listFiles(projectId);
    expect(files.files.some((file) => file.name.endsWith('bad-arena.gameview.json'))).toBe(false);
  });

  it('rejects legacy non-game text artifacts uploaded through the chat attachment route', async () => {
    const projectId = await createProject();
    const form = new FormData();
    form.append(
      'files',
      new Blob([
        [
          '# Legacy Launch Surface',
          'SaaS pricing cards, login page, CRM dashboard, checkout, and customer journey sections.',
        ].join('\n'),
      ], { type: 'text/markdown' }),
      'legacy-package.md',
    );

    const resp = await fetch(`${baseUrl}/api/projects/${projectId}/upload`, {
      method: 'POST',
      body: form,
    });
    expect(resp.status).toBe(400);
    const body = (await resp.json()) as { error?: { code?: string; details?: { file?: string } } };
    expect(body.error?.code).toBe('INVALID_GAME_STUDIO_ARTIFACT');
    expect(body.error?.details?.file).toMatch(/legacy-package\.md$/);

    const files = await listFiles(projectId);
    expect(files.files.some((file) => file.name.endsWith('legacy-package.md'))).toBe(false);
  });
});
