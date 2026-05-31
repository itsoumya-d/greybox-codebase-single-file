// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { publishBundles } from '../src/cli/publishBundles.js';
import { releaseBundles } from '../src/cli/releaseBundles.js';
import type {
  ProModuleBundlePublishProof,
  ProModuleBundlePublishReceipt,
  ProModuleCloudSourceEnvExport,
  ProModuleBundleReleaseUploadPlan,
  ProModuleEntitlementRegistry,
} from '../src/index.js';

const licenseSecret = 'publish-bundles-license-secret';

test('publish-bundles stages release artifacts and emits Cloud-safe receipt proof', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-publish-bundles-'));
  try {
    const release = await createRelease(dir);
    const receiptPath = path.join(dir, 'publish', 'receipt.json');
    const proofPath = path.join(dir, 'publish', 'proof.json');
    const cloudEnvPath = path.join(dir, 'publish', 'cloud-source-env.json');
    const storageDir = path.join(dir, 'cdn');
    const uploadPlan = JSON.parse(await readFile(release.uploadPlanPath, 'utf8')) as ProModuleBundleReleaseUploadPlan;

    const result = publishBundles({
      releaseDir: release.outputDir,
      uploadPlan: release.uploadPlanPath,
      storageDir,
      receipt: receiptPath,
      proof: proofPath,
      cloudEnv: cloudEnvPath,
      provider: 'local-dry-run',
      publicBaseUrl: 'https://cdn.greybox.studio',
    }, uploadPlan.generatedAt + 1_000);

    assert.equal(result.objectCount, 3);
    assert.equal(result.provider, 'local-dry-run');
    assert.equal(result.proofReady, true);
    assert.equal(result.cloudEnvPath, cloudEnvPath);

    const receipt = JSON.parse(await readFile(receiptPath, 'utf8')) as ProModuleBundlePublishReceipt;
    const proof = JSON.parse(await readFile(proofPath, 'utf8')) as ProModuleBundlePublishProof;
    const cloudEnv = JSON.parse(await readFile(cloudEnvPath, 'utf8')) as ProModuleCloudSourceEnvExport;
    assert.equal(receipt.format, 'greybox.pro.bundle-publish-receipt/v1');
    assert.equal(receipt.objects.length, uploadPlan.objectCount);
    assert.equal(proof.ready, true);
    assert.equal(proof.receipt.objectCount, uploadPlan.objectCount);
    assert.equal(proof.uploadPlan.totalBytes, uploadPlan.totalBytes);
    assert.equal(cloudEnv.format, 'greybox.pro.cloud-source-env/v1');
    assert.equal(cloudEnv.generatedAt, receipt.generatedAt);
    assert.equal(JSON.parse(cloudEnv.variables.GREYBOX_PRO_MODULE_BUNDLES_JSON).format, 'greybox.pro.bundle-release/v1');
    assert.equal(JSON.parse(cloudEnv.variables.GREYBOX_PRO_MODULE_BUNDLE_UPLOAD_PLAN_JSON).format, 'greybox.pro.bundle-upload-plan/v1');
    assert.equal(JSON.parse(cloudEnv.variables.GREYBOX_PRO_MODULE_BUNDLE_PUBLISH_PROOF_JSON).ready, true);
    assert.ok(cloudEnv.variables.GREYBOX_PRO_MODULE_ENTITLEMENT_REGISTRY_JSON);
    const registry = JSON.parse(cloudEnv.variables.GREYBOX_PRO_MODULE_ENTITLEMENT_REGISTRY_JSON) as ProModuleEntitlementRegistry;
    assert.equal(registry.format, 'greybox.pro.entitlement-registry/v1');
    assert.equal(registry.ready, false);
    assert.equal(registry.itemCount, 2);
    assert.equal(registry.summary.productionPublishProof, false);
    assert.deepEqual(
      registry.importItems.map((item) => item.moduleId),
      ['soulslike-combat-pack', 'roguelike-generator-pro'],
    );

    for (const object of uploadPlan.objects) {
      const stored = await readFile(path.join(storageDir, ...object.objectKey.split('/')));
      assert.equal(stored.byteLength, object.bytes);
      const receiptObject = receipt.objects.find((candidate) => candidate.objectKey === object.objectKey);
      assert.ok(receiptObject);
      assert.equal(receiptObject.sha256, object.sha256);
      assert.equal(receiptObject.publicUrl, `https://cdn.greybox.studio/${object.objectKey}`);
    }

    const serializedEvidence = `${JSON.stringify(receipt)}\n${JSON.stringify(proof)}\n${JSON.stringify(cloudEnv)}`;
    assert.doesNotMatch(serializedEvidence, /encryptedPayload|PRIVATE|publish-bundles-license-secret|gbx_pro_/u);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('publish-bundles fails closed when Cloud env export lacks a publish proof', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-publish-bundles-cloud-env-'));
  try {
    const release = await createRelease(dir);
    assert.throws(
      () => publishBundles({
        releaseDir: release.outputDir,
        uploadPlan: release.uploadPlanPath,
        storageDir: path.join(dir, 'cdn'),
        receipt: path.join(dir, 'receipt.json'),
        cloudEnv: path.join(dir, 'cloud-source-env.json'),
        provider: 'local-dry-run',
      }, 1_779_235_400_000),
      /--cloud-env requires --proof/u,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('publish-bundles fails closed when a source artifact drifts after release', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-publish-bundles-drift-'));
  try {
    const release = await createRelease(dir);
    const uploadPlan = JSON.parse(await readFile(release.uploadPlanPath, 'utf8')) as ProModuleBundleReleaseUploadPlan;
    const bundle = uploadPlan.objects.find((object) => object.kind === 'bundle');
    assert.ok(bundle);
    await writeFile(path.join(release.outputDir, bundle.sourceFileName), '{"tampered":true}\n', 'utf8');

    assert.throws(
      () => publishBundles({
        releaseDir: release.outputDir,
        uploadPlan: release.uploadPlanPath,
        storageDir: path.join(dir, 'cdn'),
        receipt: path.join(dir, 'receipt.json'),
        provider: 'local-dry-run',
      }, 1_779_235_400_000),
      /byte count drift|sha256 drift/u,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('publish-bundles refuses unsafe object paths and drifted storage overwrites', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-publish-bundles-paths-'));
  try {
    const release = await createRelease(dir);
    const uploadPlan = JSON.parse(await readFile(release.uploadPlanPath, 'utf8')) as ProModuleBundleReleaseUploadPlan;
    const unsafePlanPath = path.join(dir, 'unsafe-upload-plan.json');
    await writeFile(unsafePlanPath, JSON.stringify({
      ...uploadPlan,
      objects: uploadPlan.objects.map((object, index) => (
        index === 0 ? { ...object, objectKey: '../private/manifest.json' } : object
      )),
    }), 'utf8');

    assert.throws(
      () => publishBundles({
        releaseDir: release.outputDir,
        uploadPlan: unsafePlanPath,
        storageDir: path.join(dir, 'cdn'),
        receipt: path.join(dir, 'receipt.json'),
        provider: 'local-dry-run',
      }, 1_779_235_400_000),
      /object key contains unsafe path segment/u,
    );

    const storageDir = path.join(dir, 'cdn-conflict');
    const [manifestObject] = uploadPlan.objects;
    assert.ok(manifestObject);
    const targetPath = path.join(storageDir, ...manifestObject.objectKey.split('/'));
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, 'stale-object', 'utf8');
    assert.throws(
      () => publishBundles({
        releaseDir: release.outputDir,
        uploadPlan: release.uploadPlanPath,
        storageDir,
        receipt: path.join(dir, 'receipt.json'),
        provider: 'local-dry-run',
      }, 1_779_235_400_000),
      /refusing to overwrite drifted storage object/u,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

async function createRelease(dir: string): Promise<ReturnType<typeof releaseBundles>> {
  const { privateKey } = generateKeyPairSync('ed25519');
  const privateKeyPath = path.join(dir, 'release-key.pem');
  await writeFile(privateKeyPath, privateKey.export({ format: 'pem', type: 'pkcs8' }), 'utf8');
  return releaseBundles({
    privateKey: privateKeyPath,
    keyId: 'greybox-publish-bundles-test',
    licenseSecretEnv: 'GBPRO_LICENSE_SECRET',
    outputDir: path.join(dir, 'dist'),
    channel: 'launch',
    prefix: 'greybox-pro',
    moduleIds: ['soulslike-combat-pack', 'roguelike-generator-pro'],
  }, {
    GBPRO_LICENSE_SECRET: licenseSecret,
  });
}
