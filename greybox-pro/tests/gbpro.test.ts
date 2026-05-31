// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import type { KeyObject } from 'node:crypto';
import { access } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  createGbproBundle,
  decryptGbproBundle,
  getProModule,
  verifyGbproBundleSignature,
} from '../src/index.js';
import type { ProModuleBundleEnvelope } from '../src/index.js';

const licenseSecret = 'test-license-secret-from-greybox-cloud';

function signedFixture(): {
  bundle: ProModuleBundleEnvelope;
  publicKey: KeyObject;
} {
  const module = getProModule('soulslike-combat-pack');
  assert.ok(module);
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const bundle = createGbproBundle(module, {
    privateKey,
    keyId: 'greybox-test-key',
    licenseSecret,
    nonce: Buffer.alloc(12, 7),
  });
  return { bundle, publicKey };
}

test('.gbpro bundles are signed, encrypted, and decrypt only with the license secret', () => {
  const { bundle, publicKey } = signedFixture();
  const verified = verifyGbproBundleSignature(bundle, { 'greybox-test-key': publicKey });
  assert.equal(verified.ok, true);
  assert.equal(bundle.format, 'agds-pro-module-bundle/v1');
  assert.ok(bundle.encryptedPayload);
  assert.equal(JSON.stringify(bundle).includes('Proprietary and confidential'), false);

  const payload = decryptGbproBundle(bundle, licenseSecret);
  assert.equal(payload.moduleId, 'soulslike-combat-pack');
  assert.equal(payload.files.length, 5);
  assert.match(payload.files[0]?.body ?? '', /Proprietary and confidential/u);
  assert.ok(payload.files.some((file) => file.path === 'playbooks/soulslike-combat-pack/PLAYBOOK.md'));
  assert.ok(payload.files.some((file) => file.path === 'telemetry/soulslike-combat-pack/signals.json'));
  assert.throws(() => decryptGbproBundle(bundle, 'wrong-secret-with-enough-bytes'), /Unsupported state|authenticate|bad decrypt|unable to authenticate/u);
});

test('.gbpro encryption rejects weak license secrets before payload generation', () => {
  const module = getProModule('soulslike-combat-pack');
  assert.ok(module);
  const { privateKey } = generateKeyPairSync('ed25519');

  assert.throws(
    () => createGbproBundle(module, {
      privateKey,
      keyId: 'greybox-test-key',
      licenseSecret: 'short-secret',
      nonce: Buffer.alloc(12, 7),
    }),
    /gbpro license secret must be at least 24 bytes/u,
  );
  assert.throws(
    () => createGbproBundle(module, {
      privateKey,
      keyId: 'greybox-test-key',
      licenseSecret: ` ${licenseSecret}`,
      nonce: Buffer.alloc(12, 7),
    }),
    /gbpro license secret must not include leading or trailing whitespace/u,
  );
});

test('bundle verification rejects tampered metadata, payloads, and unknown signing keys', () => {
  const { bundle, publicKey } = signedFixture();
  assert.deepEqual(
    verifyGbproBundleSignature(bundle, { other: publicKey }),
    { ok: false, code: 'GBPRO_UNKNOWN_KEY', message: 'signature key is not trusted' },
  );

  const tamperedManifest: ProModuleBundleEnvelope = {
    ...bundle,
    manifest: {
      ...bundle.manifest,
      name: 'Tampered Pack',
    },
  };
  assert.deepEqual(
    verifyGbproBundleSignature(tamperedManifest, { 'greybox-test-key': publicKey }),
    { ok: false, code: 'GBPRO_SIGNATURE_INVALID', message: 'signature does not match bundle metadata' },
  );

  const tamperedPayload: ProModuleBundleEnvelope = {
    ...bundle,
    encryptedPayload: Buffer.from('tampered', 'utf8').toString('base64url'),
  };
  assert.deepEqual(
    verifyGbproBundleSignature(tamperedPayload, { 'greybox-test-key': publicKey }),
    { ok: false, code: 'GBPRO_PAYLOAD_DIGEST_MISMATCH', message: 'encrypted payload digest does not match' },
  );
});

test('bundle verification requires encrypted payload bytes before accepting signed metadata', () => {
  const { bundle, publicKey } = signedFixture();
  const missingPayload = { ...bundle };
  delete missingPayload.encryptedPayload;

  assert.deepEqual(
    verifyGbproBundleSignature(missingPayload, { 'greybox-test-key': publicKey }),
    { ok: false, code: 'GBPRO_PAYLOAD_MISSING', message: 'encrypted payload is required' },
  );

  assert.deepEqual(
    verifyGbproBundleSignature({
      ...bundle,
      encryptedPayload: '',
    }, { 'greybox-test-key': publicKey }),
    { ok: false, code: 'GBPRO_PAYLOAD_MISSING', message: 'encrypted payload is required' },
  );
});

test('bundle verification fails closed for malformed signature envelopes', () => {
  const { bundle, publicKey } = signedFixture();
  assert.deepEqual(
    verifyGbproBundleSignature({
      ...bundle,
      payloadSha256: bundle.payloadSha256.toUpperCase(),
    }, { 'greybox-test-key': publicKey }),
    { ok: false, code: 'GBPRO_BAD_SIGNATURE', message: 'payloadSha256 must be a lowercase SHA-256 digest' },
  );

  assert.deepEqual(
    verifyGbproBundleSignature({
      ...bundle,
      signature: {
        ...bundle.signature!,
        value: '',
      },
    }, { 'greybox-test-key': publicKey }),
    { ok: false, code: 'GBPRO_BAD_SIGNATURE', message: 'signature value is required' },
  );

  assert.deepEqual(
    verifyGbproBundleSignature({
      ...bundle,
      signature: {
        ...bundle.signature!,
        signedFields: 'manifest' as 'format+manifest+payloadSha256',
      },
    }, { 'greybox-test-key': publicKey }),
    { ok: false, code: 'GBPRO_BAD_SIGNATURE', message: 'signature signedFields are not supported' },
  );
});

test('generated bundles satisfy the open-core daemon verifier when the sibling repo is present', async () => {
  const { bundle, publicKey } = signedFixture();
  const loaderUrl = new URL('../../open-design/apps/daemon/src/pro-module-loader.ts', import.meta.url);
  try {
    await access(fileURLToPath(loaderUrl));
  } catch {
    return;
  }

  const loader = await import(loaderUrl.href) as {
    verifyProModuleBundle: (
      raw: string,
      publicKeys: Record<string, unknown>,
    ) => { ok: boolean; bundle?: { manifest: { id: string } } };
  };
  const result = loader.verifyProModuleBundle(JSON.stringify(bundle), {
    'greybox-test-key': publicKey,
  });
  assert.equal(result.ok, true);
  assert.equal(result.bundle?.manifest.id, 'soulslike-combat-pack');
});

test('cloud-issued secrets decrypt generated bundles through the open-core daemon loader', async () => {
  const cloudUrl = new URL('../../greybox-cloud/src/server.ts', import.meta.url);
  const loaderUrl = new URL('../../open-design/apps/daemon/src/pro-module-loader.ts', import.meta.url);
  try {
    await access(fileURLToPath(cloudUrl));
    await access(fileURLToPath(loaderUrl));
  } catch {
    return;
  }

  const cloud = await import(cloudUrl.href) as {
    createGreyboxCloudServer: (options: { proModuleSecretMasterKey: string }) => {
      listen: (port: number, callback: () => void) => void;
      address: () => { port: number } | string | null;
      close: (callback: () => void) => void;
    };
  };
  const loader = await import(loaderUrl.href) as {
    verifyProModuleBundle: (
      raw: string,
      publicKeys: Record<string, unknown>,
    ) => { ok: boolean; bundle?: { manifest: { id: string }; payloadSha256: string } };
    fetchProModuleLicenseSecretFromCloud: (
      manifest: { id: string },
      verified: { fileName: string; manifest: { id: string }; payloadSha256: string },
      options: { cloudUrl: string; licenseKey: string; timeoutMs: number },
    ) => Promise<string | null>;
    decryptProModuleBundlePayload: (
      raw: string,
      licenseSecret: string,
    ) => { ok: boolean; payload?: { moduleId: string; files: unknown[] }; mounted?: { skills: unknown[]; gameArtBibles: unknown[]; engineTargets: unknown[] } };
  };
  const module = getProModule('soulslike-combat-pack');
  assert.ok(module);

  const server = cloud.createGreyboxCloudServer({ proModuleSecretMasterKey: 'greybox-cloud-master-secret' });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    const issuedBeforeEncryption = await fetch(`${baseUrl}/v1/pro-modules/license-secret`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer gbx_pro_test_123',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ moduleId: module.manifest.id }),
    });
    assert.equal(issuedBeforeEncryption.status, 200);
    const initialSecret = (await issuedBeforeEncryption.json() as { decryptionSecret: string }).decryptionSecret;

    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const bundle = createGbproBundle(module, {
      privateKey,
      keyId: 'greybox-test-key',
      licenseSecret: initialSecret,
      nonce: Buffer.alloc(12, 9),
    });

    const raw = JSON.stringify(bundle);
    const verified = loader.verifyProModuleBundle(raw, { 'greybox-test-key': publicKey });
    assert.equal(verified.ok, true);
    assert.equal(verified.bundle?.payloadSha256, bundle.payloadSha256);

    const issuedForVerifiedPayload = await loader.fetchProModuleLicenseSecretFromCloud(
      bundle.manifest,
      { ...verified.bundle!, fileName: 'soulslike-combat-pack.gbpro' },
      {
        cloudUrl: baseUrl,
        licenseKey: 'gbx_pro_test_123',
        timeoutMs: 1000,
      },
    );
    assert.equal(issuedForVerifiedPayload, initialSecret);

    const decrypted = loader.decryptProModuleBundlePayload(raw, issuedForVerifiedPayload!);
    assert.equal(decrypted.ok, true);
    assert.equal(decrypted.payload?.moduleId, 'soulslike-combat-pack');
    assert.equal(decrypted.payload?.files.length, 5);
    assert.equal(decrypted.mounted?.skills.length, 1);
    assert.equal(decrypted.mounted?.gameArtBibles.length, 1);
    assert.equal(decrypted.mounted?.engineTargets.length, 1);
  } finally {
    await new Promise<void>((resolve) => server.close(resolve));
  }
});
