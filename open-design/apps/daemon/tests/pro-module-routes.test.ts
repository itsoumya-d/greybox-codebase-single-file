// SPDX-License-Identifier: Apache-2.0

import type http from 'node:http';
import { createCipheriv, createHash, generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PRO_MODULE_BUNDLE_FORMAT, type ProModuleBundleEnvelope, type ProModuleManifest } from '@ai-game-design-studio/contracts/api/pro-modules';

import { createProModuleSigningPayload } from '../src/pro-module-loader.js';
import { startServer } from '../src/server.js';

const licenseSecret = 'route-license-secret-from-greybox-cloud';

function tarAssets(buffer: Buffer): Map<string, Buffer> {
  const tar = gunzipSync(buffer);
  const pathnamesByRoot = new Map<string, string>();
  const bodiesByRoot = new Map<string, Buffer>();
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
    const root = fullName.split('/')[0] ?? '';
    if (fullName.endsWith('/pathname')) pathnamesByRoot.set(root, tar.subarray(bodyStart, bodyEnd).toString('utf8'));
    if (fullName.endsWith('/asset')) bodiesByRoot.set(root, tar.subarray(bodyStart, bodyEnd));
    offset = bodyStart + size + ((512 - (size % 512)) % 512);
  }
  const assets = new Map<string, Buffer>();
  for (const [root, pathname] of pathnamesByRoot) {
    const body = bodiesByRoot.get(root);
    if (body) assets.set(pathname, body);
  }
  return assets;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
}

function testManifest(id: string, name: string): ProModuleManifest {
  return {
    id,
    name,
    version: '1.0.0',
    description: `${name} closed payload metadata.`,
    licenseTier: 'pro',
    mounts: {
      skills: [
        {
          kind: 'skill',
          id: `${id}-skill`,
          title: name,
          entry: `skills/${id}/SKILL.md`,
          digestSha256: createHash('sha256').update(`skill:${id}`).digest('hex'),
        },
      ],
      gameArtBibles: [
        {
          kind: 'game-art-bible',
          id: `${id}-art-bible`,
          title: `${name} Art Bible`,
          entry: `game-art-bibles/${id}/DESIGN.md`,
          digestSha256: createHash('sha256').update(`bible:${id}`).digest('hex'),
        },
      ],
      engineTargets: [
        {
          kind: 'engine-target',
          id: `${id}-unity-target`,
          title: `${name} Unity Target`,
          entry: `engine-targets/${id}/unity.json`,
          digestSha256: createHash('sha256').update(`unity:${id}`).digest('hex'),
        },
      ],
    },
  };
}

function encryptedBundle(
  manifest: ProModuleManifest,
  keys: { privateKey: KeyObject },
): ProModuleBundleEnvelope {
  const payload = {
    generatedBy: 'greybox-pro',
    license: 'proprietary',
    moduleId: manifest.id,
    version: manifest.version,
    files: [
      {
        path: `skills/${manifest.id}/SKILL.md`,
        mediaType: 'text/markdown',
        body: `skill:${manifest.id}`,
        digestSha256: createHash('sha256').update(`skill:${manifest.id}`).digest('hex'),
      },
      {
        path: `game-art-bibles/${manifest.id}/DESIGN.md`,
        mediaType: 'text/markdown',
        body: `bible:${manifest.id}`,
        digestSha256: createHash('sha256').update(`bible:${manifest.id}`).digest('hex'),
      },
      {
        path: `engine-targets/${manifest.id}/unity.json`,
        mediaType: 'application/json',
        body: `unity:${manifest.id}`,
        digestSha256: createHash('sha256').update(`unity:${manifest.id}`).digest('hex'),
      },
    ],
  };
  const nonce = Buffer.alloc(12, 9);
  const cipher = createCipheriv('aes-256-gcm', createHash('sha256').update(licenseSecret).digest(), nonce);
  cipher.setAAD(Buffer.from(stableStringify(manifest), 'utf8'));
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(stableStringify(payload), 'utf8')),
    cipher.final(),
  ]);
  const encryptedPayload = Buffer.from(stableStringify({
    algorithm: 'aes-256-gcm',
    keyDerivation: 'sha256-license-secret',
    nonce: nonce.toString('base64url'),
    authTag: cipher.getAuthTag().toString('base64url'),
    ciphertext: ciphertext.toString('base64url'),
  }), 'utf8').toString('base64url');
  const payloadSha256 = createHash('sha256').update(encryptedPayload).digest('hex');
  const signingPayload = createProModuleSigningPayload({
    format: PRO_MODULE_BUNDLE_FORMAT,
    manifest,
    payloadSha256,
  });
  return {
    format: PRO_MODULE_BUNDLE_FORMAT,
    manifest,
    payloadSha256,
    encryptedPayload,
    signature: {
      algorithm: 'ed25519',
      keyId: 'greybox-route-test',
      value: sign(null, Buffer.from(signingPayload, 'utf8'), keys.privateKey).toString('base64url'),
      signedFields: 'format+manifest+payloadSha256',
    },
  };
}

describe('project pro module routes', () => {
  let server: http.Server;
  let baseUrl: string;
  const previousPublicKeys = process.env.AGDS_PRO_MODULE_PUBLIC_KEYS_JSON;
  const previousLicenseSecrets = process.env.AGDS_PRO_MODULE_LICENSE_SECRETS_JSON;

  beforeAll(async () => {
    const keys = generateKeyPairSync('ed25519');
    process.env.AGDS_PRO_MODULE_PUBLIC_KEYS_JSON = JSON.stringify({
      'greybox-route-test': keys.publicKey.export({ type: 'spki', format: 'pem' }),
    });
    process.env.AGDS_PRO_MODULE_LICENSE_SECRETS_JSON = JSON.stringify({
      'soulslike-combat-pack': licenseSecret,
      'cozy-sim-pack': licenseSecret,
    });

    const started = (await startServer({ port: 0, returnServer: true })) as {
      url: string;
      server: http.Server;
    };
    baseUrl = started.url;
    server = started.server;

    const projectId = 'pro-route-fixture';
    await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: projectId, name: 'Pro route fixture', skillId: null }),
    });
    const detailResp = await fetch(`${baseUrl}/api/projects/${projectId}`);
    const detail = (await detailResp.json()) as { resolvedDir: string };
    const proModulesDir = path.join(detail.resolvedDir, 'pro-modules');
    await mkdir(proModulesDir, { recursive: true });
    await writeFile(
      path.join(detail.resolvedDir, 'pro-runtime.gameview.json'),
      JSON.stringify({
        version: 1,
        kind: 'game-viewport',
        surface: 'gameplay',
        title: 'Pro Runtime Arena',
        objective: 'Validate licensed Pro engine targets in native exports.',
        entities: [
          { id: 'player-start', name: 'Player Start', type: 'player-spawn', x: 32, y: 48 },
          { id: 'boss-spawn', name: 'Boss Spawn', type: 'enemy-spawn', x: 320, y: 160 },
        ],
      }),
      'utf8',
    );
    await writeFile(
      path.join(proModulesDir, 'licensed.gbpro'),
      JSON.stringify(encryptedBundle(testManifest('soulslike-combat-pack', 'Soulslike Combat Pack'), keys)),
      'utf8',
    );
    await writeFile(
      path.join(proModulesDir, 'unlicensed.gbpro'),
      JSON.stringify(encryptedBundle(testManifest('hero-shooter-toolkit', 'Hero Shooter Toolkit'), keys)),
      'utf8',
    );
    const tampered = encryptedBundle(testManifest('cozy-sim-pack', 'Cozy Sim Pack'), keys);
    await writeFile(
      path.join(proModulesDir, 'tampered.gbpro'),
      JSON.stringify({ ...tampered, encryptedPayload: Buffer.from('tampered').toString('base64url') }),
      'utf8',
    );
  }, 60_000);

  afterAll(async () => {
    if (previousPublicKeys === undefined) delete process.env.AGDS_PRO_MODULE_PUBLIC_KEYS_JSON;
    else process.env.AGDS_PRO_MODULE_PUBLIC_KEYS_JSON = previousPublicKeys;
    if (previousLicenseSecrets === undefined) delete process.env.AGDS_PRO_MODULE_LICENSE_SECRETS_JSON;
    else process.env.AGDS_PRO_MODULE_LICENSE_SECRETS_JSON = previousLicenseSecrets;
    await rm(path.join(process.env.AGDS_DATA_DIR ?? '', 'projects', 'pro-route-fixture'), { recursive: true, force: true }).catch(() => {});
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  }, 30_000);

  it('lists project-local Pro modules without exposing decrypted proprietary payload bodies', async () => {
    const response = await fetch(`${baseUrl}/api/projects/pro-route-fixture/pro-modules`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      trustedKeyCount: number;
      modules: Array<{ fileName: string; status: string; mountCount: number; mounted?: unknown; manifest: { id: string } }>;
      registries: {
        skills: Array<{ id: string; moduleId: string; mediaType?: string }>;
        gameArtBibles: Array<{ id: string; moduleId: string; mediaType?: string }>;
        engineTargets: Array<{ id: string; moduleId: string; mediaType?: string }>;
      };
      rejected: Array<{ fileName: string; code: string }>;
    };

    expect(body.trustedKeyCount).toBe(1);
    expect(body.modules).toEqual(expect.arrayContaining([
      expect.objectContaining({
        fileName: 'licensed.gbpro',
        status: 'licensed',
        mountCount: 3,
        manifest: expect.objectContaining({ id: 'soulslike-combat-pack' }),
      }),
      expect.objectContaining({
        fileName: 'unlicensed.gbpro',
        status: 'license-required',
        mountCount: 3,
        manifest: expect.objectContaining({ id: 'hero-shooter-toolkit' }),
      }),
    ]));
    expect(body.rejected).toEqual(expect.arrayContaining([
      expect.objectContaining({
        fileName: 'tampered.gbpro',
        code: 'PRO_MODULE_PAYLOAD_DIGEST_MISMATCH',
      }),
    ]));
    expect(body.registries.skills).toEqual([
      expect.objectContaining({
        id: 'soulslike-combat-pack-skill',
        moduleId: 'soulslike-combat-pack',
        mediaType: 'text/markdown',
      }),
    ]);
    expect(body.registries.gameArtBibles).toEqual([
      expect.objectContaining({
        id: 'soulslike-combat-pack-art-bible',
        moduleId: 'soulslike-combat-pack',
        mediaType: 'text/markdown',
      }),
    ]);
    expect(body.registries.engineTargets).toEqual([
      expect.objectContaining({
        id: 'soulslike-combat-pack-unity-target',
        moduleId: 'soulslike-combat-pack',
        mediaType: 'application/json',
      }),
    ]);
    expect(JSON.stringify(body)).not.toContain('skill:soulslike-combat-pack');
    expect(JSON.stringify(body)).not.toContain('bible:soulslike-combat-pack');
  });

  it('serves licensed Pro runtime registry payloads one mount at a time', async () => {
    const skillResponse = await fetch(`${baseUrl}/api/projects/pro-route-fixture/pro-modules/skills/soulslike-combat-pack-skill`);
    expect(skillResponse.status).toBe(200);
    const skill = (await skillResponse.json()) as { body: string; item: { id: string; moduleId: string; source: string } };
    expect(skill.body).toBe('skill:soulslike-combat-pack');
    expect(skill.item).toEqual(expect.objectContaining({
      id: 'soulslike-combat-pack-skill',
      moduleId: 'soulslike-combat-pack',
      source: 'pro-module',
    }));

    const bibleResponse = await fetch(`${baseUrl}/api/projects/pro-route-fixture/pro-modules/game-art-bibles/soulslike-combat-pack-art-bible`);
    expect(bibleResponse.status).toBe(200);
    const bible = (await bibleResponse.json()) as { body: string };
    expect(bible.body).toBe('bible:soulslike-combat-pack');

    const targetResponse = await fetch(`${baseUrl}/api/projects/pro-route-fixture/pro-modules/engine-targets/soulslike-combat-pack-unity-target`);
    expect(targetResponse.status).toBe(200);
    const target = (await targetResponse.json()) as { body: string };
    expect(target.body).toBe('unity:soulslike-combat-pack');

    const unlicensedResponse = await fetch(`${baseUrl}/api/projects/pro-route-fixture/pro-modules/skills/hero-shooter-toolkit-skill`);
    expect(unlicensedResponse.status).toBe(404);
  });

  it('merges licensed Pro entries into project-scoped skill and art-bible catalogs', async () => {
    const skillsResponse = await fetch(`${baseUrl}/api/projects/pro-route-fixture/skills`);
    expect(skillsResponse.status).toBe(200);
    const skillsBody = (await skillsResponse.json()) as {
      skills: Array<{ id: string; source?: string; moduleId?: string; hasBody?: boolean; body?: string }>;
    };
    expect(skillsBody.skills).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'soulslike-combat-pack-skill',
        source: 'pro-module',
        moduleId: 'soulslike-combat-pack',
        hasBody: true,
      }),
    ]));
    expect(JSON.stringify(skillsBody)).not.toContain('skill:soulslike-combat-pack');

    const projectSkillResponse = await fetch(`${baseUrl}/api/projects/pro-route-fixture/skills/soulslike-combat-pack-skill`);
    expect(projectSkillResponse.status).toBe(200);
    const projectSkill = (await projectSkillResponse.json()) as { body: string; source: string };
    expect(projectSkill.source).toBe('pro-module');
    expect(projectSkill.body).toBe('skill:soulslike-combat-pack');

    const deliverableSkillResponse = await fetch(`${baseUrl}/api/game-deliverables/pro-route-fixture/skills/soulslike-combat-pack-skill`);
    expect(deliverableSkillResponse.status).toBe(200);

    const biblesResponse = await fetch(`${baseUrl}/api/projects/pro-route-fixture/game-art-bibles`);
    expect(biblesResponse.status).toBe(200);
    const biblesBody = (await biblesResponse.json()) as {
      gameArtBibles: Array<{ id: string; source?: string; moduleId?: string; body?: string }>;
    };
    expect(biblesBody.gameArtBibles).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'soulslike-combat-pack-art-bible',
        source: 'pro-module',
        moduleId: 'soulslike-combat-pack',
      }),
    ]));
    expect(JSON.stringify(biblesBody)).not.toContain('bible:soulslike-combat-pack');

    const projectBibleResponse = await fetch(`${baseUrl}/api/projects/pro-route-fixture/game-art-bibles/soulslike-combat-pack-art-bible`);
    expect(projectBibleResponse.status).toBe(200);
    const projectBible = (await projectBibleResponse.json()) as { body: string; source: string };
    expect(projectBible.source).toBe('pro-module');
    expect(projectBible.body).toBe('bible:soulslike-combat-pack');

    const deliverableBibleResponse = await fetch(`${baseUrl}/api/game-deliverables/pro-route-fixture/game-art-bibles/soulslike-combat-pack-art-bible`);
    expect(deliverableBibleResponse.status).toBe(200);
  });

  it('includes licensed Pro engine targets in transient Unity package exports', async () => {
    const response = await fetch(`${baseUrl}/api/game-deliverables/pro-route-fixture/unity-package`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/vnd.unity');

    const assets = tarAssets(Buffer.from(await response.arrayBuffer()));
    const targetPath = 'Assets/Greybox/Generated/Pro-route-fixture/ProModules/soulslike-combat-pack/soulslike-combat-pack-unity-target.engine-target.json';
    expect(assets.has(targetPath)).toBe(true);
    expect(JSON.parse(assets.get(targetPath)!.toString('utf8'))).toMatchObject({
      generator: 'Greybox',
      kind: 'pro-engine-target',
      id: 'soulslike-combat-pack-unity-target',
      moduleId: 'soulslike-combat-pack',
      payload: 'unity:soulslike-combat-pack',
    });

    const manifest = JSON.parse(
      assets.get('Assets/Greybox/Generated/Pro-route-fixture/GreyboxProjectManifest.json')!.toString('utf8'),
    );
    expect(manifest.proEngineTargets).toEqual([
      expect.objectContaining({
        id: 'soulslike-combat-pack-unity-target',
        moduleId: 'soulslike-combat-pack',
        path: targetPath,
      }),
    ]);
    expect(JSON.stringify(manifest.proEngineTargets)).not.toContain('unity:soulslike-combat-pack');
  });

  it('adds bodyless Pro engine-target metadata to native engine exports without writing payload bytes', async () => {
    const response = await fetch(`${baseUrl}/api/game-deliverables/pro-route-fixture/gameview-runtime`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: 'pro-runtime.gameview.json',
        engine: 'native-package',
        writePackage: true,
        packageDirectory: 'engine-exports/pro-runtime',
      }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      files: Array<{ path: string; language: string; content: string }>;
      writtenFileNames: string[];
      runtimeHooks: string[];
    };
    const metadataFile = body.files.find((file) => file.path.endsWith('/pro-modules/PRO_ENGINE_TARGETS.json'));
    expect(metadataFile).toBeTruthy();
    expect(metadataFile?.language).toBe('json');
    expect(metadataFile?.content).toContain('soulslike-combat-pack-unity-target');
    expect(metadataFile?.content).toContain('/api/game-deliverables/pro-route-fixture/pro-modules/engine-targets/soulslike-combat-pack-unity-target');
    expect(metadataFile?.content).not.toContain('unity:soulslike-combat-pack');
    expect(body.runtimeHooks).toContain('Greybox Pro engine targets: pro-modules/PRO_ENGINE_TARGETS.json');

    const writtenMetadata = body.writtenFileNames.find((name) => name.endsWith('/pro-modules/PRO_ENGINE_TARGETS.json'));
    expect(writtenMetadata).toBeTruthy();
    const writtenContent = await readFile(
      path.join(process.env.AGDS_DATA_DIR ?? '', 'projects', 'pro-route-fixture', writtenMetadata!),
      'utf8',
    );
    expect(writtenContent).toContain('soulslike-combat-pack-unity-target');
    expect(writtenContent).not.toContain('unity:soulslike-combat-pack');
  });
});
