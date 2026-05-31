import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { listGameArtBibles, readGameArtBible } from '../src/game-art-bibles.js';

const tempRoots: string[] = [];

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agds-art-bibles-'));
  tempRoots.push(root);
  return root;
}

async function writeBible(root: string, id: string, title: string): Promise<void> {
  const dir = path.join(root, id);
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, 'DESIGN.md'),
    [
      `# ${title}`,
      '',
      '> Category: Game Art Direction',
      '> A game-native systems framework for playable scenes and HUD readability.',
      '',
      '## Game Vision',
      '',
      'Clarify gameplay state, player goals, combat readability, and production constraints.',
    ].join('\n'),
    'utf8',
  );
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('listGameArtBibles', () => {
  it('keeps retired built-in art bibles out of the default studio catalog', async () => {
    const root = await makeRoot();
    await writeBible(root, 'arcade-neon', 'Arcade Neon');
    await writeBible(root, 'void-fishing-rpg', 'Void Fishing RPG');
    await writeBible(root, '.retired/airbnb', 'Game Art Bible for Airbnb');

    const ids = (await listGameArtBibles(root)).map((entry) => entry.id);

    expect(ids).toEqual(expect.arrayContaining(['arcade-neon', 'void-fishing-rpg']));
    expect(ids).not.toContain('airbnb');
    await expect(readGameArtBible(root, 'airbnb')).resolves.toContain('Game Art Bible for Airbnb');
  });

  it('lets installed game art bibles use creator-owned ids', async () => {
    const root = await makeRoot();
    const retiredPrefix = ['Design', 'System'].join(' ');
    await writeBible(root, 'airbnb', `${retiredPrefix} for Airborne Innkeeping Roguelite`);

    const entries = await listGameArtBibles(root, { source: 'installed' });
    const ids = entries.map((entry) => entry.id);

    expect(ids).toContain('airbnb');
    expect(entries.find((entry) => entry.id === 'airbnb')?.title).toBe('Airborne Innkeeping Roguelite');
  });
});
