import type http from 'node:http';
import fs from 'node:fs';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

describe('game art bible routes', () => {
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

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  async function writeLocalGameArtBible(idPrefix: string, title: string) {
    const dir = await mkdtemp(path.join(os.tmpdir(), idPrefix));
    tempDirs.push(dir);
    await writeFile(
      path.join(dir, 'DESIGN.md'),
      [
        `# ${title}`,
        '',
        '> Category: Game Art Direction',
        '> Surface: web',
        '',
        '## Game Vision',
        '',
        'Tune combat readability, HUD hierarchy, player feedback, and production constraints.',
      ].join('\n'),
      'utf8',
    );
    return dir;
  }

  it('serves only game-art-bible endpoints with canonical payloads', async () => {
    const listResp = await fetch(`${baseUrl}/api/game-art-bibles`);
    expect(listResp.status).toBe(200);
    const listBody = (await listResp.json()) as {
      gameArtBibles: Array<{ id: string; title: string }>;
    };

    expect(listBody.gameArtBibles.length).toBeGreaterThan(0);
    expect(listBody).not.toHaveProperty('designSystems');
    expect(listBody.gameArtBibles.some((entry) => entry.id === 'arcade-neon')).toBe(true);
    const listedIds = listBody.gameArtBibles.map((entry) => entry.id);
    expect(listedIds).not.toEqual(
      expect.arrayContaining(['airbnb', 'enterprise', 'notion', 'shopify', 'slack', 'stripe']),
    );

    const detailResp = await fetch(`${baseUrl}/api/game-art-bibles/arcade-neon`);
    expect(detailResp.status).toBe(200);
    const detailBody = (await detailResp.json()) as { id: string; body: string };
    expect(detailBody.id).toBe('arcade-neon');
    expect(detailBody.body).toContain('# Arcade Neon');
    expect(detailBody.body).toContain('Gameplay tokens');

    const legacyDetailResp = await fetch(`${baseUrl}/api/game-art-bibles/airbnb`);
    expect(legacyDetailResp.status).toBe(200);
    const legacyDetailBody = (await legacyDetailResp.json()) as { id: string; body: string };
    expect(legacyDetailBody.id).toBe('airbnb');
    expect(legacyDetailBody.body).toContain('Game Art Bible for Airbnb');

    const retiredListResp = await fetch(`${baseUrl}/api/design-systems`);
    expect(retiredListResp.status).toBe(404);
    const retiredDetailResp = await fetch(`${baseUrl}/api/design-systems/arcade-neon`);
    expect(retiredDetailResp.status).toBe(404);
  });

  it('installs creator art bibles into the canonical runtime folder while reading legacy installs', async () => {
    const dataDir = process.env.AGDS_DATA_DIR;
    if (!dataDir) throw new Error('AGDS_DATA_DIR is required for daemon route tests');

    const localBibleDir = await writeLocalGameArtBible(
      'agds-local-combat-bible-',
      'Creator Combat Bible',
    );
    const localBibleId = path.basename(await realpath(localBibleDir));

    const installResp = await fetch(`${baseUrl}/api/game-art-bibles/install`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'local', path: localBibleDir }),
    });
    expect(installResp.status).toBe(200);
    const installBody = (await installResp.json()) as {
      gameArtBible: { id: string; title: string; body?: string; dir?: string } | null;
    };
    expect(installBody.gameArtBible?.id).toBe(localBibleId);
    expect(installBody.gameArtBible).not.toHaveProperty('body');
    expect(installBody.gameArtBible).not.toHaveProperty('dir');
    expect(fs.existsSync(path.join(dataDir, 'game-art-bibles', localBibleId))).toBe(true);
    expect(fs.existsSync(path.join(dataDir, 'design-systems', localBibleId))).toBe(false);

    const legacyInstalledId = `legacy-installed-${Date.now()}`;
    const legacyInstallDir = path.join(dataDir, 'design-systems', legacyInstalledId);
    await mkdir(legacyInstallDir, { recursive: true });
    await writeFile(
      path.join(legacyInstallDir, 'DESIGN.md'),
      [
        '# Legacy Installed Boss Bible',
        '',
        '> Category: Game Art Direction',
        '',
        '## Game Vision',
        '',
        'Preserve old creator-installed boss arena art direction.',
      ].join('\n'),
      'utf8',
    );

    const legacyDetailResp = await fetch(`${baseUrl}/api/game-art-bibles/${legacyInstalledId}`);
    expect(legacyDetailResp.status).toBe(200);
    const legacyDetailBody = (await legacyDetailResp.json()) as { body: string };
    expect(legacyDetailBody.body).toContain('Legacy Installed Boss Bible');

    const listResp = await fetch(`${baseUrl}/api/game-art-bibles`);
    const listBody = (await listResp.json()) as {
      gameArtBibles: Array<{ id: string; title: string }>;
    };
    const listedIds = listBody.gameArtBibles.map((entry) => entry.id);
    expect(listedIds).toEqual(expect.arrayContaining([localBibleId, legacyInstalledId]));
  });
});
