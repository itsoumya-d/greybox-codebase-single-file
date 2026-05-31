import { afterEach, describe, expect, it, vi } from 'vitest';

import { createProject, importGameStudioZip, patchProject } from '../../src/state/projects';

describe('project persistence helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('serializes canonical gameArtBibleId without the legacy daemon field', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        project: {
          id: 'project-1',
          name: 'Project',
          skillId: null,
          gameArtBibleId: 'arcade-neon',
          createdAt: 1,
          updatedAt: 1,
        },
        conversationId: 'conversation-1',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await createProject({
      name: 'Project',
      gameArtBibleId: 'arcade-neon',
      skillId: null,
      metadata: { kind: 'prototype', deliverableKind: 'prototype' },
    });

    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)).toEqual(
      expect.objectContaining({
        name: 'Project',
        gameArtBibleId: 'arcade-neon',
        skillId: null,
        metadata: { kind: 'prototype', deliverableKind: 'prototype' },
      }),
    );
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)).not.toHaveProperty('designSystemId');
  });

  it('serializes pendingPrompt null so the daemon can clear it', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        project: {
          id: 'project-1',
          name: 'Project',
          skillId: null,
          gameArtBibleId: null,
          createdAt: 1,
          updatedAt: 1,
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await patchProject('project-1', { pendingPrompt: null });

    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)).toEqual({
      pendingPrompt: null,
    });
  });

  it('serializes canonical gameArtBibleId patches without the legacy daemon field', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        project: {
          id: 'project-1',
          name: 'Project',
          skillId: null,
          gameArtBibleId: 'arcade-neon',
          createdAt: 1,
          updatedAt: 1,
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await patchProject('project-1', { gameArtBibleId: 'arcade-neon' });

    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)).toEqual({
      gameArtBibleId: 'arcade-neon',
    });
  });

  it('posts game-studio ZIP imports to the canonical daemon route', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        project: {
          id: 'project-1',
          name: 'Imported arena prototype',
          skillId: null,
          gameArtBibleId: null,
          createdAt: 1,
          updatedAt: 1,
        },
        conversationId: 'conversation-1',
        entryFile: 'index.html',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await importGameStudioZip(new File(['zip'], 'arena-prototype.zip'));

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/import/game-studio',
      expect.objectContaining({
        method: 'POST',
        body: expect.any(FormData),
      }),
    );
  });
});
