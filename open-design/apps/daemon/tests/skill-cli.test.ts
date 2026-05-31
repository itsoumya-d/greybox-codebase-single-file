// SPDX-License-Identifier: Apache-2.0

import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { normalizeGitHubSkillTarget, resolveSkillCliDirs } from '../src/skill-cli.js';

const cliPath = path.resolve(import.meta.dirname, '../src/cli.ts');
const repoRoot = path.resolve(import.meta.dirname, '../../..');
const tempRoots: string[] = [];

async function makeTempRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agds-skill-cli-'));
  tempRoots.push(root);
  return root;
}

async function writeSkillFixture(root: string, id = 'tempo-combat-lab'): Promise<string> {
  const dir = path.join(root, id);
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, 'SKILL.md'),
    `---
name: ${id}
description: Tempo combat tuning lab for readable action-game encounters.
triggers:
  - combat tuning
  - encounter pacing
agds:
  mode: prototype
  surface: web
  scenario: gameplay
  game:
    genre: action
    camera: side-on
  craft:
    requires: [game-feel, hud-readability]
---

# Tempo Combat Lab

Use this skill to tune a playable combat loop with readable tells, fail states,
player recovery windows, and production-safe HUD feedback.
`,
    'utf8',
  );
  return dir;
}

function runCli(args: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}): string {
  return execFileSync(process.execPath, ['--import', 'tsx', cliPath, ...args], {
    cwd: options.cwd ?? repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      AGDS_PORT: '',
      OD_PORT: '',
      ...(options.env ?? {}),
    },
  });
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('skill CLI helpers', () => {
  it('normalizes GitHub shorthand without accepting non-GitHub strings', () => {
    expect(normalizeGitHubSkillTarget('studio/skill-pack')).toBe('https://github.com/studio/skill-pack');
    expect(normalizeGitHubSkillTarget('https://github.com/studio/skill-pack.git')).toBe('https://github.com/studio/skill-pack');
    expect(normalizeGitHubSkillTarget('/tmp/local-skill')).toBeNull();
  });

  it('resolves AGDS data and resource directories for offline skill management', async () => {
    const root = await makeTempRoot();
    const dirs = resolveSkillCliDirs({
      dataDir: 'runtime',
      env: { AGDS_RESOURCE_ROOT: root },
      moduleDir: path.join(repoRoot, 'apps', 'daemon', 'src'),
    });

    expect(dirs.dataDir).toBe(path.join(repoRoot, 'runtime'));
    expect(dirs.builtInSkillsDir).toBe(path.join(root, 'skills'));
    expect(dirs.installedSkillsDir).toBe(path.join(repoRoot, 'runtime', 'skills'));
  });
});

describe('agds skill CLI', () => {
  it('adds, lists, tests, and removes a local skill without starting the daemon', async () => {
    const root = await makeTempRoot();
    const dataDir = path.join(root, 'data');
    const skillDir = await writeSkillFixture(root);

    const addOutput = JSON.parse(runCli(['skill', 'add', skillDir, '--data-dir', dataDir, '--json']));
    expect(addOutput.ok).toBe(true);
    expect(addOutput.skill.id).toBe('tempo-combat-lab');

    const installedLink = path.join(dataDir, 'skills', 'tempo-combat-lab');
    expect(existsSync(installedLink)).toBe(true);

    const listOutput = JSON.parse(runCli(['skill', 'list', '--installed', '--data-dir', dataDir, '--json']));
    expect(listOutput.skills).toEqual([
      expect.objectContaining({
        id: 'tempo-combat-lab',
        source: 'installed',
        mode: 'prototype',
        scenario: 'gameplay',
      }),
    ]);

    const testOutput = runCli(['skill', 'test', 'tempo-combat-lab', '--data-dir', dataDir]);
    expect(testOutput).toContain('Skill tempo-combat-lab passed manifest scan');

    const removeOutput = JSON.parse(runCli(['skill', 'remove', 'tempo-combat-lab', '--data-dir', dataDir, '--json']));
    expect(removeOutput).toEqual({ ok: true, id: 'tempo-combat-lab' });
    expect(existsSync(installedLink)).toBe(false);
  });

  it('keeps built-in skills protected from removal', async () => {
    const root = await makeTempRoot();
    const dataDir = path.join(root, 'data');

    expect(() => runCli(['skill', 'remove', 'playable-game-prototype', '--data-dir', dataDir])).toThrow(
      /Cannot uninstall built-in items/u,
    );
  });
});
