// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';

import {
  PRO_MODULE_BUNDLE_PUBLISH_RECEIPT_FORMAT,
  buildProModuleBundlePublishProof,
  buildProModuleBundleRelease,
  buildProModuleBundleUploadPlan,
  buildProModuleEntitlementRegistry,
  type ProModuleBundlePublishReceipt,
  type ProModuleBundleRelease,
  type ProModuleBundleReleaseManifest,
  type ProModuleBundleReleaseUploadPlan,
} from '../src/index.js';

const licenseSecret = 'entitlement-registry-license-secret';
const moduleIds = ['soulslike-combat-pack', 'roguelike-generator-pro'] as const;

test('entitlement registry builds a sanitized Cloud import artifact from release, upload, and publish proof', () => {
  const { release, uploadPlan, proof } = readyInputs();
  const registry = buildProModuleEntitlementRegistry({
    releaseManifest: release.manifest,
    uploadPlan,
    publishProof: proof,
    generatedAt: 1_779_235_400_000,
    cloudHandoff: {
      ready: true,
      provider: 'r2',
      releaseChannel: 'launch',
      objectPrefix: 'greybox-pro',
      keyId: 'greybox-entitlement-registry',
      moduleIds: ['roguelike-generator-pro', 'soulslike-combat-pack'],
      objectCount: uploadPlan.objectCount,
      totalBytes: uploadPlan.totalBytes,
    },
  });

  assert.equal(registry.ready, true);
  assert.equal(registry.format, 'greybox.pro.entitlement-registry/v1');
  assert.equal(registry.itemCount, 2);
  assert.equal(registry.provider, 'r2');
  assert.equal(registry.summary.productionPublishProof, true);
  assert.equal(registry.summary.cloudHandoffChecked, true);
  assert.equal(registry.checks.every((check) => check.status === 'pass'), true);
  assert.deepEqual(
    registry.importItems.map((item) => item.moduleId),
    ['soulslike-combat-pack', 'roguelike-generator-pro'],
  );

  for (const item of registry.importItems) {
    const manifestItem = release.manifest.items.find((candidate) => candidate.moduleId === item.moduleId);
    const uploadObject = uploadPlan.objects.find((object) => object.kind === 'bundle' && object.moduleId === item.moduleId);
    assert.ok(manifestItem);
    assert.ok(uploadObject);
    assert.equal(item.sku, `gbpro.${item.moduleId}`);
    assert.equal(item.grantKey, `pro-module:${item.moduleId}`);
    assert.equal(item.payloadSha256, manifestItem.payloadSha256);
    assert.equal(item.envelopeSha256, manifestItem.envelopeSha256);
    assert.equal(item.objectKey, uploadObject.objectKey);
    assert.equal(item.cdnPath, manifestItem.cdnPath);
    assert.equal(item.licenseTier, 'pro');
    assert.equal(item.price.currency, 'USD');
    assert.equal(item.keyId, manifestItem.keyId);
    assert.deepEqual(item.readiness, {
      manifestPresent: true,
      uploadPlanned: true,
      publishProofReady: true,
      productionPublishProof: true,
      cloudHandoffAligned: true,
    });
  }

  assert.doesNotMatch(
    JSON.stringify(registry),
    /encryptedPayload|ciphertext|PRIVATE|entitlement-registry-license-secret|gbx_pro_|X-Amz-Signature|token=|customerId/u,
  );
});

test('entitlement registry fails closed on duplicate module ids, SKUs, and grant keys', () => {
  const { release, uploadPlan, proof } = readyInputs();
  const first = release.manifest.items[0];
  const second = release.manifest.items[1];
  assert.ok(first);
  assert.ok(second);
  const manifest: ProModuleBundleReleaseManifest = {
    ...release.manifest,
    itemCount: 2,
    items: [
      first,
      {
        ...second,
        moduleId: first.moduleId,
        entitlement: {
          ...second.entitlement,
          sku: first.entitlement.sku,
          grantKey: first.entitlement.grantKey,
        },
      },
    ],
  };

  const registry = buildProModuleEntitlementRegistry({
    releaseManifest: manifest,
    uploadPlan,
    publishProof: proof,
  });

  assert.equal(registry.ready, false);
  assert.ok(registry.issues.some((issue) => issue.code === 'duplicate_module_id'));
  assert.ok(registry.issues.some((issue) => issue.code === 'duplicate_sku'));
  assert.ok(registry.issues.some((issue) => issue.code === 'duplicate_grant_key'));
});

test('entitlement registry fails closed on missing or extra module coverage', () => {
  const { release, uploadPlan, proof } = readyInputs();
  const tamperedPlan: ProModuleBundleReleaseUploadPlan = {
    ...uploadPlan,
    objects: uploadPlan.objects.filter((object) => object.moduleId !== 'roguelike-generator-pro'),
    objectCount: uploadPlan.objectCount - 1,
  };
  const tamperedProof = {
    ...proof,
    uploadPlan: {
      ...proof.uploadPlan,
      bundleModuleIds: ['soulslike-combat-pack', 'extra-module'],
    },
  };

  const registry = buildProModuleEntitlementRegistry({
    releaseManifest: release.manifest,
    uploadPlan: tamperedPlan,
    publishProof: tamperedProof,
  });

  assert.equal(registry.ready, false);
  assert.ok(registry.issues.some((issue) => issue.code === 'missing_module_id'));
  assert.ok(registry.issues.some((issue) => issue.code === 'extra_module_id'));
  assert.equal(registry.checks.find((check) => check.id === 'module-coverage')?.status, 'fail');
});

test('entitlement registry fails closed on SKU, grant, object-key, or hash drift', () => {
  const { release, uploadPlan, proof } = readyInputs();
  const tamperedPlan: ProModuleBundleReleaseUploadPlan = {
    ...uploadPlan,
    objects: uploadPlan.objects.map((object) => {
      if (object.kind !== 'bundle' || object.moduleId !== 'soulslike-combat-pack') return object;
      return {
        ...object,
        objectKey: 'greybox-pro/launch/wrong.gbpro',
        sha256: 'e'.repeat(64),
        payloadSha256: 'd'.repeat(64),
        entitlementSku: 'gbpro.wrong',
        entitlementGrantKey: 'pro-module:wrong',
      };
    }),
  };

  const registry = buildProModuleEntitlementRegistry({
    releaseManifest: release.manifest,
    uploadPlan: tamperedPlan,
    publishProof: proof,
  });

  assert.equal(registry.ready, false);
  assert.ok(registry.issues.some((issue) => issue.code === 'sku_grant_drift'));
  assert.ok(registry.issues.some((issue) => issue.code === 'object_key_drift'));
  assert.ok(registry.issues.some((issue) => issue.code === 'hash_drift'));
  assert.equal(registry.checks.find((check) => check.id === 'manifest-upload-alignment')?.status, 'fail');
});

test('entitlement registry does not count local dry-run proof as production entitlement evidence', () => {
  const { release, uploadPlan } = readyInputs();
  for (const provider of ['local-dry-run', 's3-testmode', 'sandbox-r2']) {
    const proof = buildProModuleBundlePublishProof({
      uploadPlan,
      receipt: receiptFromUploadPlan(uploadPlan, { provider }),
    });

    const registry = buildProModuleEntitlementRegistry({
      releaseManifest: release.manifest,
      uploadPlan,
      publishProof: proof,
    });

    assert.equal(proof.ready, true, provider);
    assert.equal(registry.ready, false, provider);
    assert.equal(registry.importItems.every((item) => item.readiness.productionPublishProof === false), true, provider);
    assert.ok(registry.issues.some((issue) => issue.code === 'non_production_provider'), provider);
    assert.equal(registry.checks.find((check) => check.id === 'production-provider')?.status, 'fail', provider);
  }
});

test('entitlement registry fails closed when optional Cloud handoff does not align', () => {
  const { release, uploadPlan, proof } = readyInputs();
  const registry = buildProModuleEntitlementRegistry({
    releaseManifest: release.manifest,
    uploadPlan,
    publishProof: proof,
    cloudHandoff: {
      ready: true,
      provider: 'r2',
      releaseChannel: 'launch',
      objectPrefix: 'greybox-pro',
      keyId: 'greybox-entitlement-registry',
      moduleIds: ['soulslike-combat-pack'],
      objectCount: uploadPlan.objectCount,
      totalBytes: uploadPlan.totalBytes,
    },
  });

  assert.equal(registry.ready, false);
  assert.ok(registry.issues.some((issue) => issue.code === 'cloud_handoff_drift'));
  assert.equal(registry.importItems.every((item) => item.readiness.cloudHandoffAligned === false), true);
});

test('entitlement registry sanitizes unsafe source values before returning failed artifacts', () => {
  const { release, uploadPlan, proof } = readyInputs();
  const tamperedPlan: ProModuleBundleReleaseUploadPlan = {
    ...uploadPlan,
    objects: uploadPlan.objects.map((object) => {
      if (object.kind !== 'bundle' || object.moduleId !== 'soulslike-combat-pack') return object;
      return {
        ...object,
        objectKey: 'https://cdn.greybox.studio/customerId/jane.doe@example.com/secret.gbpro?X-Amz-Signature=supersecret',
        entitlementSku: 'gbpro.soulslike-combat-pack.gbx_pro_secret1234567890',
      };
    }),
  };

  const registry = buildProModuleEntitlementRegistry({
    releaseManifest: release.manifest,
    uploadPlan: tamperedPlan,
    publishProof: {
      ...proof,
      receipt: {
        ...proof.receipt,
        provider: 'r2-jane.doe@example.com',
      },
    },
  });
  const serialized = JSON.stringify(registry);

  assert.equal(registry.ready, false);
  assert.ok(registry.importItems.some((item) => item.objectKey === '[UNSAFE_OBJECT_KEY]'));
  assert.doesNotMatch(serialized, /jane\.doe@example\.com|gbx_pro_secret1234567890|supersecret|X-Amz-Signature=supersecret/u);
});

function readyInputs(): {
  release: ProModuleBundleRelease;
  uploadPlan: ProModuleBundleReleaseUploadPlan;
  proof: ReturnType<typeof buildProModuleBundlePublishProof>;
} {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const release = buildProModuleBundleRelease({
    moduleIds,
    privateKey,
    publicKeys: { 'greybox-entitlement-registry': publicKey },
    keyId: 'greybox-entitlement-registry',
    licenseSecret,
    releaseChannel: 'launch',
    outputPrefix: 'greybox-pro',
    now: 1_779_235_200_000,
    nonceForModule: (_module, index) => Buffer.alloc(12, index + 1),
  });
  const uploadPlan = buildProModuleBundleUploadPlan(release);
  const proof = buildProModuleBundlePublishProof({
    uploadPlan,
    receipt: receiptFromUploadPlan(uploadPlan, { provider: 'r2' }),
  });
  return { release, uploadPlan, proof };
}

function receiptFromUploadPlan(
  uploadPlan: ProModuleBundleReleaseUploadPlan,
  options: { provider?: string; generatedAt?: number } = {},
): ProModuleBundlePublishReceipt {
  return {
    format: PRO_MODULE_BUNDLE_PUBLISH_RECEIPT_FORMAT,
    generatedAt: options.generatedAt ?? 1_779_235_300_000,
    provider: options.provider ?? 'r2',
    releaseChannel: uploadPlan.releaseChannel,
    objectPrefix: uploadPlan.objectPrefix,
    objects: uploadPlan.objects.map((object, index) => ({
      objectKey: object.objectKey,
      sha256: object.sha256,
      bytes: object.bytes,
      contentType: object.contentType,
      cacheControl: object.cacheControl,
      publishedAt: 1_779_235_300_000 + index,
      publicUrl: `https://cdn.greybox.studio/${object.objectKey}`,
    })),
    disclaimer: 'Sanitized storage receipt. No signed URLs, customer ids, credentials, or encrypted bundle bodies.',
  };
}
