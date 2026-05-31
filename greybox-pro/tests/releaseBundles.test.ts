// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  decryptGbproBundle,
  verifyGbproBundleSignature,
} from '../src/index.js';
import { releaseBundles } from '../src/cli/releaseBundles.js';
import type {
  ProModuleBundleEnvelope,
  ProModuleBundleReleaseManifest,
  ProModuleBundleReleaseUploadPlan,
} from '../src/index.js';

const licenseSecret = 'release-bundles-license-secret';

test('release-bundles CLI writes manifest and signed .gbpro artifacts', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-release-bundles-'));
  try {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const privateKeyPath = path.join(dir, 'release-key.pem');
    await writeFile(privateKeyPath, privateKey.export({ format: 'pem', type: 'pkcs8' }), 'utf8');

    const result = releaseBundles({
      privateKey: privateKeyPath,
      keyId: 'greybox-release-test',
      licenseSecretEnv: 'GBPRO_LICENSE_SECRET',
      outputDir: path.join(dir, 'dist'),
      channel: 'launch',
      prefix: 'greybox-pro',
      moduleIds: ['soulslike-combat-pack', 'roguelike-generator-pro'],
    }, {
      GBPRO_LICENSE_SECRET: licenseSecret,
    });

    assert.equal(result.artifactCount, 2);
    assert.deepEqual(result.moduleIds, ['soulslike-combat-pack', 'roguelike-generator-pro']);

    const manifest = JSON.parse(await readFile(result.manifestPath, 'utf8')) as ProModuleBundleReleaseManifest;
    const uploadPlan = JSON.parse(await readFile(result.uploadPlanPath, 'utf8')) as ProModuleBundleReleaseUploadPlan;
    assert.equal(manifest.itemCount, 2);
    assert.equal(uploadPlan.format, 'greybox.pro.bundle-upload-plan/v1');
    assert.equal(uploadPlan.objectCount, 3);
    assert.equal(uploadPlan.objects[0]?.objectKey, 'greybox-pro/launch/manifest.json');
    assert.equal(JSON.stringify(manifest).includes('encryptedPayload'), false);
    assert.equal(JSON.stringify(manifest).includes(licenseSecret), false);
    assert.equal(JSON.stringify(uploadPlan).includes('encryptedPayload'), false);
    assert.equal(JSON.stringify(uploadPlan).includes(licenseSecret), false);

    for (const item of manifest.items) {
      assert.equal(item.entitlement.sku, `gbpro.${item.moduleId}`);
      assert.equal(item.entitlement.licenseTier, 'pro');
      assert.equal(item.entitlement.grantKey, `pro-module:${item.moduleId}`);
      assert.equal(item.entitlement.price.currency, 'USD');
      assert.ok(item.entitlement.price.oneTimeUsd > 0);

      const body = await readFile(path.join(result.outputDir, item.fileName), 'utf8');
      const envelope = JSON.parse(body) as ProModuleBundleEnvelope;
      assert.equal(body.includes('Proprietary and confidential'), false);
      assert.equal(envelope.payloadSha256, item.payloadSha256);
      const uploadObject = uploadPlan.objects.find((object) => object.kind === 'bundle' && object.moduleId === item.moduleId);
      assert.ok(uploadObject);
      assert.equal(uploadObject.sourceFileName, item.fileName);
      assert.equal(uploadObject.objectKey, item.cdnPath);
      assert.equal(uploadObject.sha256, item.envelopeSha256);
      assert.equal(uploadObject.bytes, item.envelopeBytes);
      assert.equal(uploadObject.entitlementSku, item.entitlement.sku);
      assert.equal(uploadObject.entitlementGrantKey, item.entitlement.grantKey);
      assert.equal(uploadObject.entitlementLicenseTier, item.entitlement.licenseTier);
      const verified = verifyGbproBundleSignature(envelope, { 'greybox-release-test': publicKey });
      assert.equal(verified.ok, true);
      const payload = decryptGbproBundle(envelope, licenseSecret);
      assert.equal(payload.moduleId, item.moduleId);
      assert.equal(payload.files.length, 5);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('release-bundles CLI fails closed without the license secret env var', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-release-bundles-missing-env-'));
  try {
    const { privateKey } = generateKeyPairSync('ed25519');
    const privateKeyPath = path.join(dir, 'release-key.pem');
    await writeFile(privateKeyPath, privateKey.export({ format: 'pem', type: 'pkcs8' }), 'utf8');

    assert.throws(
      () => releaseBundles({
        privateKey: privateKeyPath,
        keyId: 'greybox-release-test',
        licenseSecretEnv: 'GBPRO_LICENSE_SECRET',
        outputDir: path.join(dir, 'dist'),
        channel: 'launch',
        prefix: 'greybox-pro',
        moduleIds: ['soulslike-combat-pack'],
      }, {}),
      /GBPRO_LICENSE_SECRET is empty/u,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('release-bundles CLI refuses stale release output directories', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-release-bundles-stale-'));
  try {
    const { privateKey } = generateKeyPairSync('ed25519');
    const privateKeyPath = path.join(dir, 'release-key.pem');
    const outputDir = path.join(dir, 'dist');
    await writeFile(privateKeyPath, privateKey.export({ format: 'pem', type: 'pkcs8' }), 'utf8');
    await mkdir(outputDir, { recursive: true });
    await writeFile(path.join(outputDir, 'stale.gbpro'), '{"old":true}', 'utf8');
    await writeFile(path.join(outputDir, 'upload-plan.json'), '{"old":true}', 'utf8');

    assert.throws(
      () => releaseBundles({
        privateKey: privateKeyPath,
        keyId: 'greybox-release-test',
        licenseSecretEnv: 'GBPRO_LICENSE_SECRET',
        outputDir,
        channel: 'launch',
        prefix: 'greybox-pro',
        moduleIds: ['soulslike-combat-pack'],
      }, {
        GBPRO_LICENSE_SECRET: licenseSecret,
      }),
      /previous release artifacts: stale\.gbpro, upload-plan\.json/u,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
