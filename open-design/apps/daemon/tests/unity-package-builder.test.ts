// SPDX-License-Identifier: Apache-2.0

import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

import { buildUnityPackageFromProject } from '../src/unity-package-builder.js';

function tarAssets(buffer: Buffer): Map<string, Buffer> {
  const entries = tarEntries(buffer);
  const pathnamesByRoot = new Map<string, string>();
  const bodiesByRoot = new Map<string, Buffer>();
  for (const [fullName, body] of entries) {
    const root = fullName.split('/')[0] ?? '';
    if (fullName.endsWith('/pathname')) pathnamesByRoot.set(root, body.toString('utf8'));
    if (fullName.endsWith('/asset')) bodiesByRoot.set(root, body);
  }
  const assets = new Map<string, Buffer>();
  for (const [root, pathname] of pathnamesByRoot) {
    const body = bodiesByRoot.get(root);
    if (body) assets.set(pathname, body);
  }
  return assets;
}

function tarEntries(buffer: Buffer): Map<string, Buffer> {
  const tar = gunzipSync(buffer);
  const entries = new Map<string, Buffer>();
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/u, '');
    const prefix = header.subarray(345, 500).toString('utf8').replace(/\0.*$/u, '');
    const fullName = prefix ? `${prefix}/${name}` : name;
    const sizeText = header.subarray(124, 136).toString('ascii').replace(/\0.*$/u, '').trim();
    const size = Number.parseInt(sizeText || '0', 8);
    const bodyStart = offset + 512;
    const bodyEnd = bodyStart + size;
    entries.set(fullName, tar.subarray(bodyStart, bodyEnd));
    offset = bodyStart + size + ((512 - (size % 512)) % 512);
  }
  return entries;
}

function tarPathnames(buffer: Buffer): string[] {
  return [...tarAssets(buffer).keys()].sort();
}

describe('unity package builder', () => {
  it('builds a gzipped Unity package with Greybox importer-ready artifact assets', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'agds-unity-package-'));
    await mkdir(path.join(root, 'levels'), { recursive: true });
    await mkdir(path.join(root, 'hud'), { recursive: true });
    await mkdir(path.join(root, 'factions'), { recursive: true });
    await writeFile(path.join(root, 'DESIGN.md'), '# Art Bible\n\n- Danger (`#ff0000`): critical combat state\n');
    await writeFile(path.join(root, 'factions', 'DESIGN.md'), '# Faction Bible\n\n- Trust (`#00ff00`): social read state\n');
    await writeFile(path.join(root, 'levels', 'arena.gameview.json'), JSON.stringify({ title: 'Arena' }));
    await writeFile(path.join(root, 'levels', 'arena.levelboard.json'), JSON.stringify({ title: 'Board' }));
    await writeFile(path.join(root, 'hud', 'combat.hud.html'), '<section data-greybox-artifact="hud"></section>');

    const result = await buildUnityPackageFromProject({
      projectId: 'project-a',
      projectName: 'Project A',
      projectRoot: root,
    });

    expect(result.fileName).toBe('Project-A.unitypackage');
    expect(result.assetCount).toBe(6);
    expect(result.buffer.subarray(0, 2).toString('hex')).toBe('1f8b');
    expect(tarPathnames(result.buffer)).toEqual([
      'Assets/Greybox/Generated/Project-A/GreyboxProjectManifest.json',
      'Assets/Greybox/Generated/Project-A/art-bible.design',
      'Assets/Greybox/Generated/Project-A/factions/factions.design',
      'Assets/Greybox/Generated/Project-A/hud/combat.gbhud',
      'Assets/Greybox/Generated/Project-A/levels/arena.gameview',
      'Assets/Greybox/Generated/Project-A/levels/arena.levelboard',
    ]);
    const assets = tarAssets(result.buffer);
    expect(JSON.parse(assets.get('Assets/Greybox/Generated/Project-A/levels/arena.gameview')!.toString('utf8'))).toMatchObject({
      __greyboxSourceFileName: 'levels/arena.gameview.json',
    });
    expect(assets.get('Assets/Greybox/Generated/Project-A/hud/combat.gbhud')!.toString('utf8')).toContain('name="greybox-source-file" content="hud/combat.hud.html"');
  });

  it('keeps importer paths unique when source and generated extensions collide', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'agds-unity-package-collision-'));
    await writeFile(path.join(root, 'arena.gameview.json'), JSON.stringify({ title: 'Json Source' }));
    await writeFile(path.join(root, 'arena.gameview'), JSON.stringify({ title: 'Unity Source' }));

    const result = await buildUnityPackageFromProject({
      projectId: 'project-collision',
      projectName: 'Project Collision',
      projectRoot: root,
    });

    const pathnames = tarPathnames(result.buffer);
    expect(pathnames).toContain('Assets/Greybox/Generated/Project-Collision/arena.gameview');
    expect(pathnames.some((pathname) => /arena-[0-9a-f]{8}\.gameview$/u.test(pathname))).toBe(true);
  });

  it('builds byte-stable Unity packages and exposes the package checksum', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'agds-unity-package-deterministic-'));
    await writeFile(path.join(root, 'DESIGN.md'), '# Stable Package\n\nAI-assisted export.\n');

    const first = await buildUnityPackageFromProject({
      projectId: 'project-stable',
      projectName: 'Project Stable',
      projectRoot: root,
    });
    const second = await buildUnityPackageFromProject({
      projectId: 'project-stable',
      projectName: 'Project Stable',
      projectRoot: root,
    });

    expect(first.buffer.equals(second.buffer)).toBe(true);
    expect(first.sha256).toBe(createHash('sha256').update(first.buffer).digest('hex'));
    expect(second.sha256).toBe(first.sha256);

    const assets = tarAssets(first.buffer);
    const manifest = JSON.parse(
      assets.get('Assets/Greybox/Generated/Project-Stable/GreyboxProjectManifest.json')!.toString('utf8'),
    );
    expect(manifest).toMatchObject({
      generatedAt: '1970-01-01T00:00:00.000Z',
    });
    expect(manifest.contentRevisionSha256).toMatch(/^[0-9a-f]{64}$/u);
  });

  it('embeds licensed Pro engine targets as transient Unity package assets with bodyless manifest metadata', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'agds-unity-package-pro-target-'));
    const targetBody = JSON.stringify({ prefabStrategy: 'boss-arena-addressables' });

    const result = await buildUnityPackageFromProject({
      projectId: 'project-pro',
      projectName: 'Project Pro',
      projectRoot: root,
      proEngineTargets: [
        {
          id: 'soulslike-unity-target',
          moduleId: 'soulslike-combat-pack',
          moduleName: 'Soulslike Combat Pack',
          moduleVersion: '1.0.0',
          fileName: 'soulslike.gbpro',
          title: 'Soulslike Unity Target',
          mediaType: 'application/json',
          digestSha256: createHash('sha256').update(targetBody).digest('hex'),
          body: targetBody,
        },
      ],
    });

    const assets = tarAssets(result.buffer);
    const targetPath = 'Assets/Greybox/Generated/Project-Pro/ProModules/soulslike-combat-pack/soulslike-unity-target.engine-target.json';
    expect(result.assetCount).toBe(2);
    expect(assets.has(targetPath)).toBe(true);
    expect(JSON.parse(assets.get(targetPath)!.toString('utf8'))).toMatchObject({
      generator: 'Greybox',
      kind: 'pro-engine-target',
      id: 'soulslike-unity-target',
      moduleId: 'soulslike-combat-pack',
      payload: targetBody,
    });

    const manifest = JSON.parse(
      assets.get('Assets/Greybox/Generated/Project-Pro/GreyboxProjectManifest.json')!.toString('utf8'),
    );
    expect(manifest.proEngineTargets).toEqual([
      expect.objectContaining({
        id: 'soulslike-unity-target',
        moduleId: 'soulslike-combat-pack',
        path: targetPath,
      }),
    ]);
    expect(JSON.stringify(manifest.proEngineTargets)).not.toContain('boss-arena-addressables');
  });

  it('packages vendored mesh sources and rewrites gameview nodes to Unity asset paths', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'agds-unity-package-mesh-source-'));
    await mkdir(path.join(root, 'levels'), { recursive: true });
    await mkdir(path.join(root, 'assets'), { recursive: true });
    const fbxBytes = Buffer.from('Kaydara FBX Binary  \0greybox-test', 'utf8');
    await writeFile(path.join(root, 'assets', 'boss.fbx'), fbxBytes);
    await writeFile(path.join(root, 'levels', 'arena.gameview.json'), JSON.stringify({
      title: 'Arena',
      actors: [
        {
          id: 'boss',
          name: 'Boss',
          meshSource: '../assets/boss.fbx',
        },
      ],
    }));

    const result = await buildUnityPackageFromProject({
      projectId: 'project-mesh',
      projectName: 'Project Mesh',
      projectRoot: root,
    });

    const sha = createHash('sha256').update(fbxBytes).digest('hex');
    const importedPath = `Assets/Greybox/Imported/${sha.slice(0, 12)}/boss.fbx`;
    const assets = tarAssets(result.buffer);
    expect(assets.get(importedPath)?.toString('utf8')).toBe(fbxBytes.toString('utf8'));

    const rewritten = JSON.parse(assets.get('Assets/Greybox/Generated/Project-Mesh/levels/arena.gameview')!.toString('utf8'));
    expect(rewritten.actors[0]).toMatchObject({
      meshSource: '../assets/boss.fbx',
      meshAssetPath: importedPath,
      greyboxImportedAsset: {
        source: '../assets/boss.fbx',
        assetPath: importedPath,
        sha256: sha,
      },
    });
    expect(rewritten.actors[0].unityAssetGuid).toMatch(/^[0-9a-f]{32}$/u);

    const manifest = JSON.parse(
      assets.get('Assets/Greybox/Generated/Project-Mesh/GreyboxProjectManifest.json')!.toString('utf8'),
    );
    expect(manifest.importedAssets).toEqual([
      expect.objectContaining({
        source: 'assets/boss.fbx',
        path: importedPath,
        sha256: sha,
      }),
    ]);

    const entries = tarEntries(result.buffer);
    const importedRoot = [...entries.entries()].find(([, body]) => body.toString('utf8') === importedPath)?.[0].split('/')[0];
    expect(importedRoot).toBeTruthy();
    expect(entries.get(`${importedRoot}/asset.meta`)!.toString('utf8')).toContain('ModelImporter:');
  });

  it('packages vendored Unity material sources and rewrites nodes to material asset paths', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'agds-unity-package-material-source-'));
    await mkdir(path.join(root, 'levels'), { recursive: true });
    await mkdir(path.join(root, 'assets'), { recursive: true });
    const materialBytes = Buffer.from(`%YAML 1.1
%TAG !u! tag:unity3d.com,2011:
--- !u!21 &2100000
Material:
  m_Name: BossMaterial
  m_ShaderKeywords:
`, 'utf8');
    await writeFile(path.join(root, 'assets', 'boss.mat'), materialBytes);
    await writeFile(path.join(root, 'levels', 'arena.gameview.json'), JSON.stringify({
      title: 'Arena',
      actors: [
        {
          id: 'boss',
          name: 'Boss',
          materialSource: '../assets/boss.mat',
        },
      ],
    }));

    const result = await buildUnityPackageFromProject({
      projectId: 'project-material',
      projectName: 'Project Material',
      projectRoot: root,
    });

    const sha = createHash('sha256').update(materialBytes).digest('hex');
    const importedPath = `Assets/Greybox/Imported/${sha.slice(0, 12)}/boss.mat`;
    const assets = tarAssets(result.buffer);
    expect(assets.get(importedPath)?.toString('utf8')).toBe(materialBytes.toString('utf8'));

    const rewritten = JSON.parse(assets.get('Assets/Greybox/Generated/Project-Material/levels/arena.gameview')!.toString('utf8'));
    expect(rewritten.actors[0]).toMatchObject({
      materialSource: '../assets/boss.mat',
      materialAssetPath: importedPath,
      greyboxImportedAsset: {
        source: '../assets/boss.mat',
        assetPath: importedPath,
        sha256: sha,
      },
    });
    expect(rewritten.actors[0].materialAssetGuid).toMatch(/^[0-9a-f]{32}$/u);
    expect(rewritten.actors[0].unityAssetGuid).toBeUndefined();

    const entries = tarEntries(result.buffer);
    const importedRoot = [...entries.entries()].find(([, body]) => body.toString('utf8') === importedPath)?.[0].split('/')[0];
    expect(importedRoot).toBeTruthy();
    expect(entries.get(`${importedRoot}/asset.meta`)!.toString('utf8')).toContain('NativeFormatImporter:');
  });

  it('preserves separate mesh and material references when a node imports both', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'agds-unity-package-mesh-material-source-'));
    await mkdir(path.join(root, 'levels'), { recursive: true });
    await mkdir(path.join(root, 'assets'), { recursive: true });
    const fbxBytes = Buffer.from('Kaydara FBX Binary  \0mesh-material-greybox-test', 'utf8');
    const materialBytes = Buffer.from('Material:\n  m_Name: SharedBossMaterial\n', 'utf8');
    await writeFile(path.join(root, 'assets', 'boss.fbx'), fbxBytes);
    await writeFile(path.join(root, 'assets', 'boss.mat'), materialBytes);
    await writeFile(path.join(root, 'levels', 'arena.gameview.json'), JSON.stringify({
      title: 'Arena',
      actors: [
        {
          id: 'boss',
          name: 'Boss',
          meshSource: '../assets/boss.fbx',
          materialSource: '../assets/boss.mat',
        },
      ],
    }));

    const result = await buildUnityPackageFromProject({
      projectId: 'project-mesh-material',
      projectName: 'Project Mesh Material',
      projectRoot: root,
    });

    const meshSha = createHash('sha256').update(fbxBytes).digest('hex');
    const materialSha = createHash('sha256').update(materialBytes).digest('hex');
    const meshPath = `Assets/Greybox/Imported/${meshSha.slice(0, 12)}/boss.fbx`;
    const materialPath = `Assets/Greybox/Imported/${materialSha.slice(0, 12)}/boss.mat`;
    const assets = tarAssets(result.buffer);
    const rewritten = JSON.parse(assets.get('Assets/Greybox/Generated/Project-Mesh-Material/levels/arena.gameview')!.toString('utf8'));

    expect(rewritten.actors[0]).toMatchObject({
      meshAssetPath: meshPath,
      materialAssetPath: materialPath,
    });
    expect(rewritten.actors[0].unityAssetGuid).toMatch(/^[0-9a-f]{32}$/u);
    expect(rewritten.actors[0].materialAssetGuid).toMatch(/^[0-9a-f]{32}$/u);
    expect(rewritten.actors[0].greyboxImportedAssets).toEqual([
      expect.objectContaining({ source: '../assets/boss.fbx', assetPath: meshPath, sha256: meshSha }),
      expect.objectContaining({ source: '../assets/boss.mat', assetPath: materialPath, sha256: materialSha }),
    ]);

    const manifest = JSON.parse(
      assets.get('Assets/Greybox/Generated/Project-Mesh-Material/GreyboxProjectManifest.json')!.toString('utf8'),
    );
    expect(manifest.importedAssets).toEqual([
      expect.objectContaining({ source: 'assets/boss.fbx', path: meshPath, sha256: meshSha }),
      expect.objectContaining({ source: 'assets/boss.mat', path: materialPath, sha256: materialSha }),
    ]);
  });

  it('downloads remote mesh sources once, caches by content hash, and rewrites gameview nodes', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'agds-unity-package-remote-mesh-'));
    const cacheRoot = await mkdtemp(path.join(tmpdir(), 'agds-unity-package-remote-cache-'));
    await mkdir(path.join(root, 'levels'), { recursive: true });
    const remoteUrl = 'https://cdn.greybox.test/assets/boss.fbx?signature=demo';
    const fbxBytes = Buffer.from('Kaydara FBX Binary  \0remote-greybox-test', 'utf8');
    let fetchCount = 0;
    await writeFile(path.join(root, 'levels', 'arena.gameview.json'), JSON.stringify({
      title: 'Arena',
      actors: [
        {
          id: 'boss',
          name: 'Boss',
          meshUrl: remoteUrl,
        },
      ],
    }));

    const fetchAsset = async (url: string) => {
      fetchCount += 1;
      expect(url).toBe(remoteUrl);
      return { bytes: fbxBytes };
    };
    const input = {
      projectId: 'project-remote-mesh',
      projectName: 'Project Remote Mesh',
      projectRoot: root,
      assetCacheRoot: cacheRoot,
      fetchAsset,
    };
    const first = await buildUnityPackageFromProject(input);
    const second = await buildUnityPackageFromProject(input);

    expect(fetchCount).toBe(1);
    const sha = createHash('sha256').update(fbxBytes).digest('hex');
    const importedPath = `Assets/Greybox/Imported/${sha.slice(0, 12)}/boss.fbx`;
    const firstAssets = tarAssets(first.buffer);
    const secondAssets = tarAssets(second.buffer);
    expect(firstAssets.get(importedPath)?.toString('utf8')).toBe(fbxBytes.toString('utf8'));
    expect(secondAssets.get(importedPath)?.toString('utf8')).toBe(fbxBytes.toString('utf8'));

    const rewritten = JSON.parse(firstAssets.get('Assets/Greybox/Generated/Project-Remote-Mesh/levels/arena.gameview')!.toString('utf8'));
    expect(rewritten.actors[0]).toMatchObject({
      meshUrl: remoteUrl,
      meshAssetPath: importedPath,
      greyboxImportedAsset: {
        source: remoteUrl,
        assetPath: importedPath,
        sha256: sha,
      },
    });

    const manifest = JSON.parse(
      firstAssets.get('Assets/Greybox/Generated/Project-Remote-Mesh/GreyboxProjectManifest.json')!.toString('utf8'),
    );
    expect(manifest.importedAssets).toEqual([
      expect.objectContaining({
        source: remoteUrl,
        sourceType: 'remote-url',
        path: importedPath,
        sha256: sha,
      }),
    ]);
    expect(JSON.stringify(manifest)).not.toContain(cacheRoot);
  });

  it('rejects unsafe remote mesh URLs instead of fetching internal network targets', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'agds-unity-package-unsafe-remote-mesh-'));
    await mkdir(path.join(root, 'levels'), { recursive: true });
    await writeFile(path.join(root, 'levels', 'arena.gameview.json'), JSON.stringify({
      title: 'Arena',
      actors: [
        {
          id: 'boss',
          meshUrl: 'https://127.0.0.1/private/boss.fbx',
        },
      ],
    }));

    const result = await buildUnityPackageFromProject({
      projectId: 'project-unsafe-remote',
      projectName: 'Project Unsafe Remote',
      projectRoot: root,
      fetchAsset: async () => {
        throw new Error('unsafe URL should not be fetched');
      },
    });

    const assets = tarAssets(result.buffer);
    const rewritten = JSON.parse(assets.get('Assets/Greybox/Generated/Project-Unsafe-Remote/levels/arena.gameview')!.toString('utf8'));
    expect(rewritten.actors[0]).toMatchObject({
      meshUrl: 'https://127.0.0.1/private/boss.fbx',
    });
    expect(rewritten.actors[0].meshAssetPath).toBeUndefined();
    const manifest = JSON.parse(
      assets.get('Assets/Greybox/Generated/Project-Unsafe-Remote/GreyboxProjectManifest.json')!.toString('utf8'),
    );
    expect(manifest.importedAssets).toEqual([]);
  });

  it('keeps artifact metadata when a safe remote mesh download is unavailable', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'agds-unity-package-remote-mesh-offline-'));
    await mkdir(path.join(root, 'levels'), { recursive: true });
    const remoteUrl = 'https://cdn.greybox.test/assets/offline-boss.fbx';
    await writeFile(path.join(root, 'levels', 'arena.gameview.json'), JSON.stringify({
      title: 'Arena',
      actors: [
        {
          id: 'boss',
          meshUrl: remoteUrl,
        },
      ],
    }));

    const result = await buildUnityPackageFromProject({
      projectId: 'project-remote-offline',
      projectName: 'Project Remote Offline',
      projectRoot: root,
      fetchAsset: async () => {
        throw new Error('network unavailable');
      },
    });

    const assets = tarAssets(result.buffer);
    const rewritten = JSON.parse(assets.get('Assets/Greybox/Generated/Project-Remote-Offline/levels/arena.gameview')!.toString('utf8'));
    expect(rewritten).toMatchObject({
      __greyboxSourceFileName: 'levels/arena.gameview.json',
      actors: [
        {
          id: 'boss',
          meshUrl: remoteUrl,
        },
      ],
    });
    expect(rewritten.actors[0].meshAssetPath).toBeUndefined();
  });
});
