// SPDX-License-Identifier: Apache-2.0

import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { initGameProject } from '../src/project-init.js';
import { validateGameStudioProjectFile } from '../src/projects.js';

const cliPath = path.resolve(import.meta.dirname, '../src/cli.ts');
const repoRoot = path.resolve(import.meta.dirname, '../../..');
const tempRoots: string[] = [];

async function makeTempRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agds-init-'));
  tempRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('initGameProject', () => {
  it('scaffolds a game project with DESIGN.md and a valid game viewport document', async () => {
    const root = await makeTempRoot();

    const result = await initGameProject({
      cwd: root,
      targetDir: 'ember-run',
      name: 'Ember Run',
      template: '2d-platformer',
      designer: 'Mira Park',
    });

    expect(result.targetDir).toBe(path.join(root, 'ember-run'));
    expect(result.created).toEqual([
      'DESIGN.md',
      'gameplay-encounter.gameview.json',
      'README.md',
    ]);
    const design = await readFile(path.join(result.targetDir, 'DESIGN.md'), 'utf8');
    expect(design).toContain('- Name: Ember Run');
    expect(design).toContain('- Designer: Mira Park');
    expect(design).toContain('Readable movement mastery');
    expect(design).toContain('<meta name="generator" content="Greybox + Mira Park">');

    const gameview = await readFile(path.join(result.targetDir, 'gameplay-encounter.gameview.json'), 'utf8');
    const parsed = validateGameStudioProjectFile('gameplay-encounter.gameview.json', Buffer.from(gameview, 'utf8'));
    expect(parsed).toMatchObject({
      kind: 'game-viewport',
      title: 'Ember Run - First Encounter Blockout',
    });
  });

  it('does not overwrite scaffold files unless --force semantics are requested', async () => {
    const root = await makeTempRoot();
    const target = path.join(root, 'existing-game');
    await initGameProject({ cwd: root, targetDir: 'existing-game', name: 'Existing Game' });
    await writeFile(path.join(target, 'DESIGN.md'), '# Custom direction\n', 'utf8');

    await expect(initGameProject({ cwd: root, targetDir: 'existing-game' })).rejects.toThrow(
      /DESIGN\.md already exists/u,
    );

    await initGameProject({
      cwd: root,
      targetDir: 'existing-game',
      name: 'Forced Rewrite',
      template: 'blank',
      force: true,
    });
    const design = await readFile(path.join(target, 'DESIGN.md'), 'utf8');
    expect(design).toContain('- Name: Forced Rewrite');
    expect(design).toContain('- Template: blank');
  });

  it('infers a readable project name and creates the target directory', async () => {
    const root = await makeTempRoot();
    const target = path.join(root, 'starfall-arena');

    const result = await initGameProject({
      cwd: root,
      targetDir: 'starfall-arena',
      template: 'top-down-roguelike',
    });

    expect(result.name).toBe('Starfall Arena');
    expect(existsSync(target)).toBe(true);
    const design = await readFile(path.join(target, 'DESIGN.md'), 'utf8');
    expect(design).toContain('- Genre: top-down roguelike');
  });

  it('wires the agds init CLI to the same scaffold path', async () => {
    const root = await makeTempRoot();
    const target = path.join(root, 'cli-game');

    const output = execFileSync(
      process.execPath,
      [
        '--import',
        'tsx',
        cliPath,
        'init',
        target,
        '--name',
        'CLI Game',
        '--template',
        'mobile-idle',
        '--designer',
        'Kai',
      ],
      {
        cwd: repoRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          AGDS_PORT: '',
          OD_PORT: '',
        },
      },
    );

    expect(output).toContain('Created CLI Game');
    expect(output).toContain('+ DESIGN.md');
    const design = await readFile(path.join(target, 'DESIGN.md'), 'utf8');
    expect(design).toContain('- Genre: mobile idle RPG');
  });
});
