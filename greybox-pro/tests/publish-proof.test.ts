// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';

import {
  PRO_MODULE_BUNDLE_PUBLISH_RECEIPT_FORMAT,
  buildProModuleBundlePublishProof,
  buildProModuleBundleRelease,
  buildProModuleBundleUploadPlan,
  type ProModuleBundlePublishReceipt,
} from '../src/index.js';

const licenseSecret = 'publish-proof-license-secret';

test('Pro publish proof passes when storage receipts match the upload plan', () => {
  const uploadPlan = readyUploadPlan();
  const receipt = receiptFromUploadPlan(uploadPlan, {
    provider: 'r2',
    generatedAt: 1_779_235_300_000,
  });
  const proof = buildProModuleBundlePublishProof({
    uploadPlan,
    receipt,
  });

  assert.equal(proof.ready, true);
  assert.equal(proof.format, 'greybox.pro.bundle-publish-proof/v1');
  assert.equal(proof.releaseChannel, uploadPlan.releaseChannel);
  assert.equal(proof.objectPrefix, uploadPlan.objectPrefix);
  assert.deepEqual(proof.uploadPlan.bundleModuleIds, [
    'roguelike-generator-pro',
    'soulslike-combat-pack',
  ]);
  assert.equal(proof.receipt.provider, 'r2');
  assert.equal(proof.receipt.objectCount, uploadPlan.objectCount);
  assert.equal(proof.receipt.totalBytes, uploadPlan.totalBytes);
  assert.deepEqual(proof.missingObjectKeys, []);
  assert.deepEqual(proof.extraObjectKeys, []);
  assert.deepEqual(proof.duplicateObjectKeys, []);
  assert.deepEqual(proof.mismatches, []);
  assert.deepEqual(proof.receiptTimelineIssues, []);
  assert.equal(proof.checks.every((check) => check.status === 'pass'), true);
  assert.doesNotMatch(JSON.stringify(proof), /encryptedPayload|PRIVATE|publish-proof-license-secret|gbx_pro_/u);
});

test('Pro publish proof fails closed on missing, extra, and mismatched storage objects', () => {
  const uploadPlan = readyUploadPlan();
  const receipt = receiptFromUploadPlan(uploadPlan);
  receipt.objects.shift();
  receipt.objects.push({
    objectKey: 'greybox-pro/launch/extra.gbpro',
    sha256: 'f'.repeat(64),
    bytes: 99,
    contentType: 'application/vnd.greybox.gbpro+json',
    cacheControl: 'public, max-age=31536000, immutable',
    publishedAt: 1_779_235_301_000,
  });
  const bundle = receipt.objects.find((object) => object.objectKey.endsWith('.gbpro'));
  assert.ok(bundle);
  bundle.sha256 = 'e'.repeat(64);
  bundle.bytes += 1;

  const proof = buildProModuleBundlePublishProof({ uploadPlan, receipt });

  assert.equal(proof.ready, false);
  assert.equal(proof.missingObjectKeys.length, 1);
  assert.deepEqual(proof.extraObjectKeys, ['greybox-pro/launch/extra.gbpro']);
  assert.ok(proof.mismatches.some((mismatch) => mismatch.field === 'sha256'));
  assert.ok(proof.mismatches.some((mismatch) => mismatch.field === 'bytes'));
  assert.equal(proof.checks.find((check) => check.id === 'object-count')?.status, 'fail');
  assert.equal(proof.checks.find((check) => check.id === 'object-integrity')?.status, 'fail');
});

test('Pro publish proof fails closed on duplicate storage receipt object keys', () => {
  const uploadPlan = readyUploadPlan();
  const receipt = receiptFromUploadPlan(uploadPlan);
  const duplicate = receipt.objects[1];
  assert.ok(duplicate);
  receipt.objects.push({ ...duplicate, publishedAt: duplicate.publishedAt + 1 });

  const proof = buildProModuleBundlePublishProof({ uploadPlan, receipt });

  assert.equal(proof.ready, false);
  assert.deepEqual(proof.duplicateObjectKeys, [duplicate.objectKey]);
  assert.equal(proof.checks.find((check) => check.id === 'object-count')?.status, 'fail');
  assert.match(
    proof.checks.find((check) => check.id === 'object-count')?.detail ?? '',
    /duplicate receipt object key/u,
  );
});

test('Pro publish proof rejects stale storage receipts that predate the upload plan', () => {
  const uploadPlan = readyUploadPlan();
  const receipt = receiptFromUploadPlan(uploadPlan, {
    generatedAt: uploadPlan.generatedAt - 1,
  });
  const first = receipt.objects[0];
  assert.ok(first);
  first.publishedAt = uploadPlan.generatedAt - 2;

  const proof = buildProModuleBundlePublishProof({ uploadPlan, receipt });

  assert.equal(proof.ready, false);
  assert.equal(proof.checks.find((check) => check.id === 'receipt-timeline')?.status, 'fail');
  assert.ok(proof.receiptTimelineIssues.includes('receipt generatedAt predates upload plan generatedAt'));
  assert.ok(proof.receiptTimelineIssues.some((issue) => issue.includes('publishedAt predates upload plan generatedAt')));
});

test('Pro publish proof rejects unsafe receipt URLs and credential-shaped fields', () => {
  const uploadPlan = readyUploadPlan();
  const receipt = receiptFromUploadPlan(uploadPlan);
  const first = receipt.objects[0];
  assert.ok(first);
  first.publicUrl = 'https://cdn.greybox.studio/greybox-pro/launch/manifest.json?X-Amz-Signature=secret';
  receipt.disclaimer = 'AWS_SECRET_ACCESS_KEY=do-not-commit';

  const proof = buildProModuleBundlePublishProof({ uploadPlan, receipt });

  assert.equal(proof.ready, false);
  assert.equal(proof.checks.find((check) => check.id === 'receipt-safety')?.status, 'fail');
  assert.ok(proof.unsafeReceiptFields.some((field) => field.includes('signed or query URL')));
  assert.ok(proof.unsafeReceiptFields.some((field) => field.includes('AWS_SECRET_ACCESS_KEY')));
});

test('Pro publish proof redacts unsafe receipt evidence before Cloud handoff', () => {
  const uploadPlan = readyUploadPlan();
  const receipt = receiptFromUploadPlan(uploadPlan);
  receipt.provider = 's3-jane.doe@example.com';
  receipt.releaseChannel = 'gbx_pro_releaseSecret1234567890';
  receipt.objectPrefix = 'sk_live_publishSecret1234567890';
  receipt.objects.push({
    objectKey: 'https://storage.example.com/customer/jane.doe@example.com/gbx_pro_customerSecret1234567890.gbpro?token=supersecret',
    sha256: 'a'.repeat(64),
    bytes: 10,
    contentType: 'application/vnd.greybox.gbpro+json',
    cacheControl: 'public, max-age=31536000, immutable',
    publishedAt: uploadPlan.generatedAt - 1,
    publicUrl: 'not-a-url',
  });

  const proof = buildProModuleBundlePublishProof({ uploadPlan, receipt });
  const serialized = JSON.stringify(proof);

  assert.equal(proof.ready, false);
  assert.match(proof.receipt.provider, /\[REDACTED_EMAIL\]/u);
  assert.ok(proof.extraObjectKeys.some((key) => key.includes('[REDACTED_LICENSE_KEY]')));
  assert.ok(proof.receiptTimelineIssues.some((issue) => issue.includes('[REDACTED_EMAIL]')));
  assert.ok(proof.unsafeReceiptFields.some((field) => field.includes('[REDACTED_QUERY_SECRET]')));
  assert.ok(proof.checks.some((check) => check.detail.includes('[REDACTED_LICENSE_KEY]')));
  assert.ok(proof.checks.some((check) => check.detail.includes('[REDACTED_PROVIDER_SECRET]')));
  assert.doesNotMatch(serialized, /jane\.doe@example\.com|gbx_pro_customerSecret1234567890|gbx_pro_releaseSecret1234567890|sk_live_publishSecret1234567890|supersecret/u);
});

test('Pro publish proof rejects public URL evidence that does not match the upload plan object', () => {
  const uploadPlan = readyUploadPlan();
  const receipt = receiptFromUploadPlan(uploadPlan);
  const [manifest, firstBundle, secondBundle] = receipt.objects;
  assert.ok(manifest);
  assert.ok(firstBundle);
  assert.ok(secondBundle);
  manifest.publicUrl = `http://cdn.greybox.studio/${manifest.objectKey}`;
  firstBundle.publicUrl = 'https://cdn.greybox.studio/greybox-pro/launch/wrong-object.gbpro';
  secondBundle.publicUrl = `https://user:pass@cdn.greybox.studio/${secondBundle.objectKey}`;

  const proof = buildProModuleBundlePublishProof({ uploadPlan, receipt });

  assert.equal(proof.ready, false);
  assert.equal(proof.checks.find((check) => check.id === 'receipt-safety')?.status, 'fail');
  assert.ok(proof.unsafeReceiptFields.some((field) => field.includes('must use HTTPS')));
  assert.ok(proof.unsafeReceiptFields.some((field) => field.includes('path does not match object key')));
  assert.ok(proof.unsafeReceiptFields.some((field) => field.includes('must not contain credentials')));
});

function readyUploadPlan() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return buildProModuleBundleUploadPlan(buildProModuleBundleRelease({
    moduleIds: ['soulslike-combat-pack', 'roguelike-generator-pro'],
    privateKey,
    publicKeys: { 'greybox-publish-proof': publicKey },
    keyId: 'greybox-publish-proof',
    licenseSecret,
    releaseChannel: 'launch',
    outputPrefix: 'greybox-pro',
    now: 1_779_235_200_000,
    nonceForModule: (_module, index) => Buffer.alloc(12, index + 1),
  }));
}

function receiptFromUploadPlan(
  uploadPlan: ReturnType<typeof readyUploadPlan>,
  options: { provider?: string; generatedAt?: number } = {},
): ProModuleBundlePublishReceipt {
  return {
    format: PRO_MODULE_BUNDLE_PUBLISH_RECEIPT_FORMAT,
    generatedAt: options.generatedAt ?? 1_779_235_300_000,
    provider: options.provider ?? 's3',
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
