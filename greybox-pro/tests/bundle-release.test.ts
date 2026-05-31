// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync } from 'node:crypto';
import test from 'node:test';

import {
  buildProModuleBundleUploadPlan,
  buildProModuleBundleRelease,
  decryptGbproBundle,
  proModuleCatalog,
  verifyGbproBundleSignature,
} from '../src/index.js';
import { stableStringify } from '../src/bundles/stableStringify.js';

const licenseSecret = 'test-license-secret-from-greybox-cloud';

const launchModuleIds = [
  'soulslike-combat-pack',
  'hero-shooter-toolkit',
  'cozy-sim-pack',
  'hyper-casual-mobile-pack',
  'roguelike-generator-pro',
] as const;

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

test('bundle release emits CDN manifest and signed artifacts for the five launch SKUs', () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const release = buildProModuleBundleRelease({
    moduleIds: launchModuleIds,
    privateKey,
    publicKeys: { 'greybox-release-test': publicKey },
    keyId: 'greybox-release-test',
    licenseSecret,
    releaseChannel: 'launch',
    outputPrefix: '/greybox-pro/',
    now: 1_779_235_200_000,
    nonceForModule: (_module, index) => Buffer.alloc(12, index + 1),
  });

  assert.equal(release.manifest.format, 'greybox.pro.bundle-release/v1');
  assert.equal(release.manifest.releaseChannel, 'launch');
  assert.equal(release.manifest.objectPrefix, 'greybox-pro');
  assert.equal(release.manifest.itemCount, 5);
  assert.deepEqual(release.manifest.items.map((item) => item.moduleId), launchModuleIds);
  assert.equal(JSON.stringify(release.manifest).includes('encryptedPayload'), false);
  assert.equal(JSON.stringify(release.manifest).includes(licenseSecret), false);
  assert.equal(JSON.stringify(release.manifest).includes('Proprietary and confidential'), false);
  assert.ok(release.manifest.totalEnvelopeBytes > 0);

  for (const [index, artifact] of release.artifacts.entries()) {
    const item = release.manifest.items[index];
    assert.ok(item);
    assert.equal(artifact.fileName, item.fileName);
    assert.equal(item.contentType, 'application/vnd.greybox.gbpro+json');
    assert.equal(item.cdnPath, `greybox-pro/launch/${item.fileName}`);
    assert.deepEqual(item.entitlement, {
      sku: `gbpro.${item.moduleId}`,
      licenseTier: 'pro',
      grantKey: `pro-module:${item.moduleId}`,
      price: {
        currency: 'USD',
        oneTimeUsd: [79, 99, 59, 49, 69][index],
      },
    });
    assert.equal(item.payloadSha256, artifact.envelope.payloadSha256);
    assert.equal(item.envelopeSha256, sha256(artifact.body));
    assert.equal(
      item.fileName,
      `${item.moduleId}-${item.version}-${item.envelopeSha256.slice(0, 12)}.gbpro`,
    );
    assert.equal(item.envelopeBytes, Buffer.byteLength(artifact.body, 'utf8'));
    assert.equal(artifact.body.includes('Proprietary and confidential'), false);
    assert.equal(artifact.body.includes(licenseSecret), false);

    const verified = verifyGbproBundleSignature(artifact.envelope, { 'greybox-release-test': publicKey });
    assert.equal(verified.ok, true);
    const payload = decryptGbproBundle(artifact.envelope, licenseSecret);
    assert.equal(payload.moduleId, item.moduleId);
    assert.equal(payload.files.length, 5);
  }

  const uploadPlan = buildProModuleBundleUploadPlan(release);
  assert.equal(uploadPlan.format, 'greybox.pro.bundle-upload-plan/v1');
  assert.equal(uploadPlan.releaseChannel, 'launch');
  assert.equal(uploadPlan.objectPrefix, 'greybox-pro');
  assert.equal(uploadPlan.objectCount, 6);
  assert.equal(uploadPlan.totalBytes, release.manifest.totalEnvelopeBytes + Buffer.byteLength(stableStringify(release.manifest), 'utf8'));
  assert.equal(JSON.stringify(uploadPlan).includes('encryptedPayload'), false);
  assert.equal(JSON.stringify(uploadPlan).includes(licenseSecret), false);

  const [manifestObject, ...bundleObjects] = uploadPlan.objects;
  assert.ok(manifestObject);
  assert.equal(manifestObject.kind, 'manifest');
  assert.equal(manifestObject.sourceFileName, 'manifest.json');
  assert.equal(manifestObject.objectKey, 'greybox-pro/launch/manifest.json');
  assert.equal(manifestObject.contentType, 'application/json');
  assert.equal(manifestObject.sha256, sha256(stableStringify(release.manifest)));
  assert.equal(manifestObject.cacheControl, 'public, max-age=60');

  for (const [index, object] of bundleObjects.entries()) {
    const item = release.manifest.items[index];
    assert.ok(item);
    assert.equal(object.kind, 'bundle');
    assert.equal(object.sourceFileName, item.fileName);
    assert.equal(object.objectKey, item.cdnPath);
    assert.equal(object.objectKey.endsWith(`-${item.envelopeSha256.slice(0, 12)}.gbpro`), true);
    assert.equal(object.contentType, item.contentType);
    assert.equal(object.sha256, item.envelopeSha256);
    assert.equal(object.bytes, item.envelopeBytes);
    assert.equal(object.cacheControl, 'public, max-age=31536000, immutable');
    assert.equal(object.moduleId, item.moduleId);
    assert.equal(object.entitlementSku, item.entitlement.sku);
    assert.equal(object.entitlementGrantKey, item.entitlement.grantKey);
    assert.equal(object.entitlementLicenseTier, item.entitlement.licenseTier);
  }
});

test('bundle release content-addresses immutable bundle objects by encrypted envelope hash', () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const first = buildProModuleBundleRelease({
    moduleIds: ['soulslike-combat-pack'],
    privateKey,
    publicKeys: { 'greybox-release-test': publicKey },
    keyId: 'greybox-release-test',
    licenseSecret,
    releaseChannel: 'launch',
    outputPrefix: 'greybox-pro',
    now: 1_779_235_200_000,
    nonceForModule: () => Buffer.alloc(12, 1),
  });
  const second = buildProModuleBundleRelease({
    moduleIds: ['soulslike-combat-pack'],
    privateKey,
    publicKeys: { 'greybox-release-test': publicKey },
    keyId: 'greybox-release-test',
    licenseSecret,
    releaseChannel: 'launch',
    outputPrefix: 'greybox-pro',
    now: 1_779_235_200_000,
    nonceForModule: () => Buffer.alloc(12, 2),
  });

  const firstItem = first.manifest.items[0];
  const secondItem = second.manifest.items[0];
  assert.ok(firstItem);
  assert.ok(secondItem);
  assert.equal(firstItem.moduleId, secondItem.moduleId);
  assert.equal(firstItem.version, secondItem.version);
  assert.notEqual(firstItem.envelopeSha256, secondItem.envelopeSha256);
  assert.notEqual(firstItem.fileName, secondItem.fileName);
  assert.notEqual(firstItem.cdnPath, secondItem.cdnPath);

  const firstBundle = buildProModuleBundleUploadPlan(first).objects.find((object) => object.kind === 'bundle');
  const secondBundle = buildProModuleBundleUploadPlan(second).objects.find((object) => object.kind === 'bundle');
  assert.ok(firstBundle);
  assert.ok(secondBundle);
  assert.notEqual(firstBundle.objectKey, secondBundle.objectKey);
  assert.equal(firstBundle.cacheControl, 'public, max-age=31536000, immutable');
  assert.equal(secondBundle.cacheControl, 'public, max-age=31536000, immutable');
});

test('bundle upload plan rejects immutable bundle paths without the envelope hash prefix', () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const release = buildProModuleBundleRelease({
    moduleIds: ['soulslike-combat-pack'],
    privateKey,
    publicKeys: { 'greybox-release-test': publicKey },
    keyId: 'greybox-release-test',
    licenseSecret,
    releaseChannel: 'launch',
    outputPrefix: 'greybox-pro',
    now: 1_779_235_200_000,
    nonceForModule: () => Buffer.alloc(12, 1),
  });
  const item = release.manifest.items[0];
  assert.ok(item);
  const staleName = `${item.moduleId}-${item.version}.gbpro`;
  const tampered = {
    ...release,
    manifest: {
      ...release.manifest,
      items: [{
        ...item,
        fileName: staleName,
        cdnPath: `greybox-pro/launch/${staleName}`,
      }],
    },
  };

  assert.throws(
    () => buildProModuleBundleUploadPlan(tampered),
    /must include content-addressed envelope hash prefix/u,
  );
});

test('bundle release rejects unsafe module selection and CDN prefixes', () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const baseOptions = {
    privateKey,
    publicKeys: { 'greybox-release-test': publicKey },
    keyId: 'greybox-release-test',
    licenseSecret,
  };

  assert.throws(
    () => buildProModuleBundleRelease({
      ...baseOptions,
      moduleIds: ['soulslike-combat-pack', 'soulslike-combat-pack'],
    }),
    /duplicates/u,
  );
  assert.throws(
    () => buildProModuleBundleRelease({
      ...baseOptions,
      moduleIds: ['missing-module'],
    }),
    /unknown Pro module missing-module/u,
  );
  assert.throws(
    () => buildProModuleBundleRelease({
      ...baseOptions,
      outputPrefix: '../private',
    }),
    /safe CDN path/u,
  );
  assert.throws(
    () => buildProModuleBundleRelease({
      ...baseOptions,
      outputPrefix: 'https://cdn.greybox.studio/pro',
    }),
    /not a URL or URI/u,
  );
  assert.throws(
    () => buildProModuleBundleRelease({
      ...baseOptions,
      outputPrefix: 'greybox pro',
    }),
    /safe CDN path/u,
  );
  assert.throws(
    () => buildProModuleBundleRelease({
      ...baseOptions,
      releaseChannel: 'launch/../../private',
    }),
    /releaseChannel must use safe CDN path/u,
  );
});

test('bundle release rejects manifest collisions from catalog drift', () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const firstLaunchModule = proModuleCatalog.find((module) => module.manifest.id === 'soulslike-combat-pack');
  assert.ok(firstLaunchModule);

  assert.throws(
    () => buildProModuleBundleRelease({
      catalog: [
        firstLaunchModule,
        {
          ...firstLaunchModule,
          order: firstLaunchModule.order + 1,
        },
      ],
      privateKey,
      publicKeys: { 'greybox-release-test': publicKey },
      keyId: 'greybox-release-test',
      licenseSecret,
      nonceForModule: (_module, index) => Buffer.alloc(12, index + 1),
    }),
    /duplicate module id: soulslike-combat-pack/u,
  );
});

test('bundle release rejects daemon-incompatible catalog drift before emitting artifacts', () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const firstLaunchModule = proModuleCatalog.find((module) => module.manifest.id === 'soulslike-combat-pack');
  assert.ok(firstLaunchModule);

  assert.throws(
    () => buildProModuleBundleRelease({
      catalog: [{
        ...firstLaunchModule,
        files: firstLaunchModule.files.map((file, index) => (
          index === 0 ? { ...file, path: '/tmp/leaked-skill.md' } : file
        )),
      }],
      privateKey,
      publicKeys: { 'greybox-release-test': publicKey },
      keyId: 'greybox-release-test',
      licenseSecret,
    }),
    /unsafe file path \/tmp\/leaked-skill\.md/u,
  );
});
