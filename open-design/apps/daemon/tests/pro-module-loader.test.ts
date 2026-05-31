// SPDX-License-Identifier: Apache-2.0

import { createCipheriv, createHash, generateKeyPairSync, sign } from 'node:crypto';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { PRO_MODULE_BUNDLE_FORMAT, type ProModuleBundleEnvelope, type ProModuleManifest } from '@ai-game-design-studio/contracts/api/pro-modules';
import { describe, expect, it } from 'vitest';

import {
  createProModuleSigningPayload,
  decryptProModuleBundlePayload,
  fetchProModuleLicenseSecretFromCloud,
  loadLicensedProModuleBundles,
  listVerifiedProModuleManifests,
  verifyProModuleBundle,
} from '../src/pro-module-loader.js';

function keyPair() {
  return generateKeyPairSync('ed25519');
}

function testManifest(overrides: Partial<ProModuleManifest> = {}): ProModuleManifest {
  return {
    id: 'soulslike-combat-pack',
    name: 'Soulslike Combat Pack',
    version: '1.0.0',
    description: 'Closed combat tuning pack exposed through signed open-core metadata.',
    licenseTier: 'pro',
    mounts: {
      skills: [
        {
          kind: 'skill',
          id: 'soulslike-combat',
          title: 'Soulslike Combat',
          entry: 'skills/soulslike-combat/SKILL.md',
          digestSha256: createHash('sha256').update('skill').digest('hex'),
        },
      ],
      gameArtBibles: [
        {
          kind: 'game-art-bible',
          id: 'dark-fantasy-arena',
          title: 'Dark Fantasy Arena',
          entry: 'game-art-bibles/dark-fantasy-arena/DESIGN.md',
          digestSha256: createHash('sha256').update('bible').digest('hex'),
        },
      ],
      engineTargets: [
        {
          kind: 'engine-target',
          id: 'unity-prefab-export',
          title: 'Unity Prefab Export',
          entry: 'engine-targets/unity-prefab-export.json',
          digestSha256: createHash('sha256').update('unity').digest('hex'),
        },
      ],
    },
    ...overrides,
  };
}

function signedBundle(
  manifest: ProModuleManifest,
  keys: ReturnType<typeof keyPair>,
  keyId = 'greybox-test-key',
): ProModuleBundleEnvelope {
  const payloadSha256 = createHash('sha256').update('encrypted closed payload').digest('hex');
  const payload = createProModuleSigningPayload({
    format: PRO_MODULE_BUNDLE_FORMAT,
    manifest,
    payloadSha256,
  });
  const signature = sign(null, Buffer.from(payload, 'utf8'), keys.privateKey).toString('base64url');
  return {
    format: PRO_MODULE_BUNDLE_FORMAT,
    manifest,
    payloadSha256,
    encryptedPayload: Buffer.from('encrypted closed payload').toString('base64url'),
    signature: {
      algorithm: 'ed25519',
      keyId,
      value: signature,
      signedFields: 'format+manifest+payloadSha256',
    },
  };
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

function encryptedSignedBundle(
  manifest: ProModuleManifest,
  keys: ReturnType<typeof keyPair>,
  licenseSecret: string,
  keyId = 'greybox-test-key',
): ProModuleBundleEnvelope {
  const payload = {
    generatedBy: 'greybox-pro',
    license: 'proprietary',
    moduleId: manifest.id,
    version: manifest.version,
    files: [
      {
        path: 'skills/soulslike-combat/SKILL.md',
        mediaType: 'text/markdown',
        body: 'skill',
        digestSha256: createHash('sha256').update('skill').digest('hex'),
      },
      {
        path: 'game-art-bibles/dark-fantasy-arena/DESIGN.md',
        mediaType: 'text/markdown',
        body: 'bible',
        digestSha256: createHash('sha256').update('bible').digest('hex'),
      },
      {
        path: 'engine-targets/unity-prefab-export.json',
        mediaType: 'application/json',
        body: 'unity',
        digestSha256: createHash('sha256').update('unity').digest('hex'),
      },
    ],
  };
  const nonce = Buffer.alloc(12, 7);
  const key = createHash('sha256').update(licenseSecret).digest();
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
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
      keyId,
      value: sign(null, Buffer.from(signingPayload, 'utf8'), keys.privateKey).toString('base64url'),
      signedFields: 'format+manifest+payloadSha256',
    },
  };
}

describe('pro module loader', () => {
  it('verifies a signed .gbpro manifest without exposing proprietary payload bytes', () => {
    const keys = keyPair();
    const bundle = signedBundle(testManifest(), keys);

    const result = verifyProModuleBundle(JSON.stringify(bundle), {
      'greybox-test-key': keys.publicKey,
    });

    expect(result).toMatchObject({
      ok: true,
      bundle: {
        manifest: {
          id: 'soulslike-combat-pack',
          mounts: {
            skills: [{ id: 'soulslike-combat', kind: 'skill' }],
            gameArtBibles: [{ id: 'dark-fantasy-arena', kind: 'game-art-bible' }],
            engineTargets: [{ id: 'unity-prefab-export', kind: 'engine-target' }],
          },
        },
        signature: {
          keyId: 'greybox-test-key',
        },
      },
    });
    expect(JSON.stringify(result)).not.toContain('encrypted closed payload');
  });

  it('rejects unsigned, tampered, and unsafe pro module bundles', () => {
    const keys = keyPair();
    const manifest = testManifest();
    const bundle = signedBundle(manifest, keys);

    const unsigned = { ...bundle, signature: undefined };
    expect(verifyProModuleBundle(JSON.stringify(unsigned), { 'greybox-test-key': keys.publicKey })).toMatchObject({
      ok: false,
      code: 'PRO_MODULE_UNSIGNED',
    });

    const tampered = {
      ...bundle,
      manifest: {
        ...bundle.manifest,
        name: 'Tampered Combat Pack',
      },
    };
    expect(verifyProModuleBundle(JSON.stringify(tampered), { 'greybox-test-key': keys.publicKey })).toMatchObject({
      ok: false,
      code: 'PRO_MODULE_SIGNATURE_INVALID',
    });

    const unsafeManifest = testManifest({
      mounts: {
        skills: [{ kind: 'skill', id: 'unsafe-skill', entry: '../closed/SKILL.md' }],
      },
    });
    const unsafe = signedBundle(unsafeManifest, keys);
    expect(verifyProModuleBundle(JSON.stringify(unsafe), { 'greybox-test-key': keys.publicKey })).toMatchObject({
      ok: false,
      code: 'PRO_MODULE_BAD_MANIFEST',
    });
  });

  it('scans project pro-modules and rejects unsigned bundles while loading signed manifests', async () => {
    const keys = keyPair();
    const projectRoot = await mkdtemp(path.join(tmpdir(), 'agds-pro-modules-'));
    const proModulesRoot = path.join(projectRoot, 'pro-modules');
    await mkdir(proModulesRoot, { recursive: true });

    await writeFile(
      path.join(proModulesRoot, 'signed.gbpro'),
      JSON.stringify(signedBundle(testManifest(), keys)),
      'utf8',
    );
    await writeFile(
      path.join(proModulesRoot, 'unsigned.gbpro'),
      JSON.stringify({
        format: PRO_MODULE_BUNDLE_FORMAT,
        manifest: testManifest({ id: 'unsigned-pack', name: 'Unsigned Pack' }),
        payloadSha256: createHash('sha256').update('payload').digest('hex'),
      }),
      'utf8',
    );

    const result = await listVerifiedProModuleManifests(projectRoot, {
      'greybox-test-key': keys.publicKey,
    });

    expect(result.loaded).toHaveLength(1);
    expect(result.loaded[0]).toMatchObject({
      fileName: 'signed.gbpro',
      manifest: { id: 'soulslike-combat-pack' },
    });
    expect(result.rejected).toEqual([
      expect.objectContaining({
        fileName: 'unsigned.gbpro',
        code: 'PRO_MODULE_UNSIGNED',
      }),
    ]);
  });

  it('decrypts a licensed .gbpro payload into mountable skill, art bible, and engine target files', () => {
    const keys = keyPair();
    const licenseSecret = 'licensed-secret-from-greybox-cloud';
    const bundle = encryptedSignedBundle(testManifest(), keys, licenseSecret);

    const result = decryptProModuleBundlePayload(JSON.stringify(bundle), licenseSecret);

    expect(result).toMatchObject({
      ok: true,
      payload: {
        moduleId: 'soulslike-combat-pack',
        files: [
          { path: 'skills/soulslike-combat/SKILL.md' },
          { path: 'game-art-bibles/dark-fantasy-arena/DESIGN.md' },
          { path: 'engine-targets/unity-prefab-export.json' },
        ],
      },
      mounted: {
        skills: [{ body: 'skill' }],
        gameArtBibles: [{ body: 'bible' }],
        engineTargets: [{ body: 'unity' }],
      },
    });

    expect(decryptProModuleBundlePayload(JSON.stringify(bundle), 'wrong-secret')).toMatchObject({
      ok: false,
      code: 'PRO_MODULE_DECRYPT_FAILED',
    });
  });

  it('loads only licensed encrypted bundles and rejects missing licenses or tampered payloads', async () => {
    const keys = keyPair();
    const licenseSecret = 'licensed-secret-from-greybox-cloud';
    const projectRoot = await mkdtemp(path.join(tmpdir(), 'agds-licensed-pro-modules-'));
    const proModulesRoot = path.join(projectRoot, 'pro-modules');
    await mkdir(proModulesRoot, { recursive: true });
    const licensed = encryptedSignedBundle(testManifest(), keys, licenseSecret);
    const unlicensed = encryptedSignedBundle(
      testManifest({ id: 'hero-shooter-toolkit', name: 'Hero Shooter Toolkit' }),
      keys,
      licenseSecret,
    );
    const tampered = {
      ...encryptedSignedBundle(
        testManifest({ id: 'cozy-sim-pack', name: 'Cozy Sim Pack' }),
        keys,
        licenseSecret,
      ),
      encryptedPayload: Buffer.from('tampered', 'utf8').toString('base64url'),
    };

    await writeFile(path.join(proModulesRoot, 'licensed.gbpro'), JSON.stringify(licensed), 'utf8');
    await writeFile(path.join(proModulesRoot, 'unlicensed.gbpro'), JSON.stringify(unlicensed), 'utf8');
    await writeFile(path.join(proModulesRoot, 'tampered.gbpro'), JSON.stringify(tampered), 'utf8');

    const result = await loadLicensedProModuleBundles(
      projectRoot,
      { 'greybox-test-key': keys.publicKey },
      (manifest) => manifest.id === 'hero-shooter-toolkit' ? null : licenseSecret,
    );

    expect(result.loaded).toHaveLength(1);
    expect(result.loaded[0]).toMatchObject({
      fileName: 'licensed.gbpro',
      manifest: { id: 'soulslike-combat-pack' },
      mounted: {
        skills: [{ body: 'skill' }],
      },
    });
    expect(result.rejected).toEqual(expect.arrayContaining([
      expect.objectContaining({
        fileName: 'unlicensed.gbpro',
        code: 'PRO_MODULE_LICENSE_REQUIRED',
      }),
      expect.objectContaining({
        fileName: 'tampered.gbpro',
        code: 'PRO_MODULE_PAYLOAD_DIGEST_MISMATCH',
      }),
    ]));
  });

  it('fetches cloud-derived license secrets without sending proprietary payload bodies', async () => {
    const keys = keyPair();
    const bundle = encryptedSignedBundle(testManifest(), keys, 'cloud-derived-secret');
    const verified = verifyProModuleBundle(JSON.stringify(bundle), {
      'greybox-test-key': keys.publicKey,
    });
    expect(verified.ok).toBe(true);
    if (!verified.ok) throw new Error('expected verified bundle');

    const requests: Array<{ url: string; init: { headers: Record<string, string>; body: string } }> = [];
    const secret = await fetchProModuleLicenseSecretFromCloud(
      verified.bundle.manifest,
      { ...verified.bundle, fileName: 'soulslike.gbpro' },
      {
        cloudUrl: 'https://cloud.greybox.studio/',
        licenseKey: 'gbx_pro_test_123',
        entitlementLookupKeys: {
          'soulslike-combat-pack': 'gbx_studio-buyer_soulslike-combat-pack_aaaaaaaaaaaa',
        },
        fetchFn: async (url, init) => {
          requests.push({ url, init });
          return {
            ok: true,
            status: 200,
            json: async () => ({
              decryptionSecret: 'cloud-derived-secret-with-enough-entropy-123',
            }),
          };
        },
      },
    );

    expect(secret).toBe('cloud-derived-secret-with-enough-entropy-123');
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe('https://cloud.greybox.studio/v1/pro-modules/license-secret');
    expect(requests[0]?.init.headers.authorization).toBe('Bearer gbx_pro_test_123');
    expect(JSON.parse(requests[0]?.init.body ?? '{}')).toEqual({
      moduleId: 'soulslike-combat-pack',
      payloadSha256: bundle.payloadSha256,
      entitlementLookupKey: 'gbx_studio-buyer_soulslike-combat-pack_aaaaaaaaaaaa',
    });
    expect(requests[0]?.init.body).not.toContain('skill');
    expect(requests[0]?.init.body).not.toContain('encryptedPayload');
  });
});
