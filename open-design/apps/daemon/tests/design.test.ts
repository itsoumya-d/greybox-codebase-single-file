// SPDX-License-Identifier: Apache-2.0
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  buildEnginePackage,
  readDesignProject,
  writeDesignProject,
} from '../src/design.js';

function tmpRoot() {
  return mkdtempSync(path.join(tmpdir(), 'design-test-'));
}

function validProject(projectId: string) {
  return {
    schemaVersion: '0.1.0',
    meta: {
      id: projectId,
      name: 'Test Project',
      version: '0.1.0',
      genre: 'other',
      targetEngines: ['unity'],
      platforms: ['windows'],
    },
    art: {
      palette: { name: 'default', colors: [{ role: 'primary', hex: '#000000' }] },
      typography: {
        styles: [{ role: 'body', family: 'Inter', size: 16, weight: 400, lineHeight: 1.4 }],
      },
      materials: [],
    },
    exportPolicy: {
      unity: { renderPipeline: 'urp', inputSystem: 'new', scriptingBackend: 'il2cpp' },
      unreal: { engineVersion: '5.5', inputSystem: 'enhanced' },
      godot: { engineVersion: '4.4', renderer: 'forward+' },
    },
    assets: [],
    characters: [],
    screens: [
      {
        id: 'screen_a',
        name: 'Main Menu',
        kind: 'main-menu',
        components: [],
      },
    ],
    flow: [],
  };
}

describe('writeDesignProject', () => {
  it('rejects an invalid project body', async () => {
    const root = tmpRoot();
    const result = await writeDesignProject(root, 'p1', { not: 'a project' });
    expect(result.ok).toBe(false);
  });

  it('persists a valid project and reads it back', async () => {
    const root = tmpRoot();
    const project = validProject('p1');
    const write = await writeDesignProject(root, 'p1', project);
    expect(write.ok).toBe(true);
    const read = await readDesignProject(root, 'p1');
    expect(read).toMatchObject({ meta: { name: 'Test Project' } });
  });

  it('returns null on a missing document', async () => {
    const root = tmpRoot();
    const read = await readDesignProject(root, 'never');
    expect(read).toBeNull();
  });
});

describe('buildEnginePackage', () => {
  it('rejects an unsupported engine', async () => {
    const root = tmpRoot();
    await writeDesignProject(root, 'p1', validProject('p1'));
    const result = await buildEnginePackage(root, 'p1', 'commodore64');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
  });

  it('returns 404 when there is no design document', async () => {
    const root = tmpRoot();
    const result = await buildEnginePackage(root, 'missing', 'unity');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(404);
  });

  it('produces a non-empty zip for unity', async () => {
    const root = tmpRoot();
    await writeDesignProject(root, 'p1', validProject('p1'));
    const result = await buildEnginePackage(root, 'p1', 'unity');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.buffer.length).toBeGreaterThan(0);
      expect(result.filename).toBe('p1-unity.zip');
    }
  });
});
