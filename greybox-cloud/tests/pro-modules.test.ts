// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import type http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { FileAuditLog } from '../src/enterprise/auditLog.js';
import { licenseValidationResponse } from '../src/routers/licenses.js';
import {
  deriveProModuleDecryptionSecret,
  proModuleEntitlementsFromEnv,
  proModuleEntitlementLookupKeysFromEnv,
  proModuleBundleDownloadResponse,
  proModuleBundleRegistryFromEntitlementRegistry,
  proModuleBundleRegistryFromEnv,
  proModuleBundleRegistryFromReleaseManifest,
  proModuleBundleSourceProofFromEnv,
  ProModuleSecretError,
  type ProModuleEntitlementGrantRecord,
  type ProModuleEntitlementGrantStore,
  verifyProModuleDownloadUrl,
} from '../src/routers/pro-modules.js';
import { createGreyboxCloudServer } from '../src/server.js';

async function withServer<T>(
  options: Parameters<typeof createGreyboxCloudServer>[0],
  run: (baseUrl: string, server: http.Server) => Promise<T>,
): Promise<T> {
  const server = createGreyboxCloudServer(options);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  try {
    return await run(`http://127.0.0.1:${address.port}`, server);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

function licenseHash(token: string): string {
  return createHash('sha256').update(token).digest('hex').slice(0, 16);
}

test('Pro module decryption secret is stable before payload encryption', () => {
  const base = {
    masterKey: 'master-secret',
    licenseHash: licenseHash('gbx_pro_test_123'),
    moduleId: 'soulslike-combat-pack',
  };
  const secret = deriveProModuleDecryptionSecret({
    ...base,
    payloadSha256: 'a'.repeat(64),
  });
  const sameModuleDifferentPayload = deriveProModuleDecryptionSecret({
    ...base,
    payloadSha256: 'b'.repeat(64),
  });
  const otherModule = deriveProModuleDecryptionSecret({
    ...base,
    moduleId: 'hero-shooter-toolkit',
    payloadSha256: 'a'.repeat(64),
  });

  assert.equal(secret, sameModuleDifferentPayload);
  assert.notEqual(secret, otherModule);
});

test('Pro module bundle registry parses publishable bundle metadata only', () => {
  const registry = proModuleBundleRegistryFromEnv({
    GREYBOX_PRO_MODULE_BUNDLES_JSON: JSON.stringify([
      {
        moduleId: 'soulslike-combat-pack',
        version: '0.1.0',
        payloadSha256: 'a'.repeat(64),
        storageKey: 'soulslike-combat-pack/0.1.0/soulslike-combat-pack.gbpro.json',
        sizeBytes: 42_000,
        createdAt: '2026-05-20T00:00:00.000Z',
      },
      {
        moduleId: 'bad/path',
        version: '0.1.0',
        payloadSha256: 'b'.repeat(64),
        storageKey: '../secret.gbpro',
      },
    ]),
  });

  assert.deepEqual(Object.keys(registry), ['soulslike-combat-pack']);
  assert.equal(registry['soulslike-combat-pack']?.contentType, 'application/vnd.greybox.gbpro+json');
  assert.equal(registry['soulslike-combat-pack']?.sizeBytes, 42_000);
});

test('Pro module bundle registry ingests Greybox Pro release manifests', () => {
  const registry = proModuleBundleRegistryFromReleaseManifest({
    format: 'greybox.pro.bundle-release/v1',
    generatedAt: Date.parse('2026-05-20T00:00:00.000Z'),
    releaseChannel: 'launch',
    keyId: 'greybox-release-test',
    items: [
      {
        moduleId: 'roguelike-generator-pro',
        version: '0.1.0',
        payloadSha256: 'c'.repeat(64),
        envelopeSha256: 'd'.repeat(64),
        envelopeBytes: 45_678,
        contentType: 'application/vnd.greybox.gbpro+json',
        fileName: 'roguelike-generator-pro-0.1.0.gbpro',
        cdnPath: 'greybox-pro/launch/roguelike-generator-pro-0.1.0.gbpro',
        entitlement: {
          sku: 'gbpro.roguelike-generator-pro',
          licenseTier: 'pro',
          grantKey: 'pro-module:roguelike-generator-pro',
          price: {
            currency: 'USD',
            oneTimeUsd: 69,
          },
        },
      },
      {
        moduleId: 'bad/module',
        version: '0.1.0',
        payloadSha256: 'e'.repeat(64),
        envelopeBytes: 10,
        contentType: 'application/vnd.greybox.gbpro+json',
        cdnPath: '../private/bad.gbpro',
      },
    ],
  });

  assert.deepEqual(Object.keys(registry), ['roguelike-generator-pro']);
  assert.equal(registry['roguelike-generator-pro']?.storageKey, 'greybox-pro/launch/roguelike-generator-pro-0.1.0.gbpro');
  assert.equal(registry['roguelike-generator-pro']?.envelopeSha256, 'd'.repeat(64));
  assert.equal(registry['roguelike-generator-pro']?.sizeBytes, 45_678);
  assert.equal(registry['roguelike-generator-pro']?.createdAt, '2026-05-20T00:00:00.000Z');
  assert.deepEqual(registry['roguelike-generator-pro']?.entitlement, {
    sku: 'gbpro.roguelike-generator-pro',
    licenseTier: 'pro',
    grantKey: 'pro-module:roguelike-generator-pro',
    price: {
      currency: 'USD',
      oneTimeUsd: 69,
    },
  });
});

test('Pro module entitlement env accepts release-manifest SKU and grant keys', () => {
  const hash = licenseHash('gbx_indie_test_123');
  const entitlements = proModuleEntitlementsFromEnv({
    GREYBOX_PRO_MODULE_ENTITLEMENTS_JSON: JSON.stringify({
      [hash]: [
        'gbpro.roguelike-generator-pro',
        'pro-module:cozy-sim-pack',
        'bad/path',
      ],
    }),
  });

  assert.deepEqual(entitlements[hash], [
    'gbpro.roguelike-generator-pro',
    'pro-module:cozy-sim-pack',
  ]);
});

test('Pro module entitlement lookup env honors revoked marketplace grants', () => {
  const hash = licenseHash('gbx_indie_refunded_lookup_123');
  const lookupKey = 'gbx_ent_refunded_lookup';
  const lookupKeys = proModuleEntitlementLookupKeysFromEnv({
    GREYBOX_PRO_MODULE_ENTITLEMENT_LOOKUP_KEYS_JSON: JSON.stringify({
      [lookupKey]: {
        licenseHash: hash,
        modules: ['soulslike-combat-pack'],
        status: 'revoked',
      },
    }),
  });

  assert.deepEqual(lookupKeys[lookupKey], {
    licenseHash: hash,
    modules: ['soulslike-combat-pack'],
    status: 'revoked',
  });
  assert.throws(
    () => proModuleBundleDownloadResponse(
      {
        moduleId: 'soulslike-combat-pack',
        entitlementLookupKey: lookupKey,
      },
      licenseValidationResponse('indie', 'indie', 'gbx_indie_refunded_lookup_123'),
      {
        registry: {
          'soulslike-combat-pack': {
            moduleId: 'soulslike-combat-pack',
            version: '0.1.0',
            payloadSha256: 'a'.repeat(64),
            storageKey: 'greybox-pro/launch/soulslike-combat-pack.gbpro',
            contentType: 'application/vnd.greybox.gbpro+json',
          },
        },
        cdnBaseUrl: 'https://cdn.greybox.test/pro-modules',
        downloadSigningKey: 'download-signing-key',
        entitlementLookupKeys: lookupKeys,
      },
    ),
    (error: unknown) => error instanceof ProModuleSecretError
      && error.code === 'pro_module_not_entitled'
      && error.status === 403,
  );
});

test('Pro module downloads honor release-manifest entitlement SKU and grant keys', () => {
  const token = 'gbx_indie_release_manifest_entitlement_123';
  const hash = licenseHash(token);
  const registry = proModuleBundleRegistryFromReleaseManifest({
    format: 'greybox.pro.bundle-release/v1',
    generatedAt: Date.parse('2026-05-20T00:00:00.000Z'),
    items: [
      {
        moduleId: 'live-ops-pro',
        version: '0.1.0',
        payloadSha256: 'f'.repeat(64),
        envelopeSha256: 'e'.repeat(64),
        envelopeBytes: 50_000,
        contentType: 'application/vnd.greybox.gbpro+json',
        cdnPath: 'greybox-pro/launch/live-ops-pro-0.1.0.gbpro',
        fileName: 'live-ops-pro-0.1.0.gbpro',
        entitlement: {
          sku: 'gbpro.live-ops-pro',
          licenseTier: 'studio',
          grantKey: 'pro-module:live-ops-pro',
          price: {
            currency: 'USD',
            oneTimeUsd: 199,
            monthlyUsd: 29,
          },
        },
      },
    ],
  });

  const indie = licenseValidationResponse('indie', 'indie', token);
  assert.throws(
    () => proModuleBundleDownloadResponse({ moduleId: 'live-ops-pro' }, indie, {
      registry,
      cdnBaseUrl: 'https://cdn.greybox.test/pro-modules',
      downloadSigningKey: 'download-signing-key',
    }),
    (error) => error instanceof ProModuleSecretError && error.code === 'pro_module_not_entitled',
  );
  assert.throws(
    () => proModuleBundleDownloadResponse({ moduleId: 'live-ops-pro' }, indie, {
      registry,
      cdnBaseUrl: 'https://cdn.greybox.test/pro-modules',
      downloadSigningKey: 'download-signing-key',
      entitlements: {
        [hash]: ['live-ops-pro'],
      },
    }),
    (error) => error instanceof ProModuleSecretError && error.code === 'pro_module_not_entitled',
  );

  const bySku = proModuleBundleDownloadResponse({ moduleId: 'live-ops-pro' }, indie, {
    registry,
    cdnBaseUrl: 'https://cdn.greybox.test/pro-modules',
    downloadSigningKey: 'download-signing-key',
    entitlements: {
      [hash]: ['gbpro.live-ops-pro'],
    },
    now: new Date('2026-05-20T00:00:00.000Z'),
  });
  const byGrantKey = proModuleBundleDownloadResponse({ moduleId: 'live-ops-pro' }, indie, {
    registry,
    cdnBaseUrl: 'https://cdn.greybox.test/pro-modules',
    downloadSigningKey: 'download-signing-key',
    entitlements: {
      [hash]: ['pro-module:live-ops-pro'],
    },
    now: new Date('2026-05-20T00:00:00.000Z'),
  });

  assert.equal(bySku.moduleId, 'live-ops-pro');
  assert.equal(byGrantKey.moduleId, 'live-ops-pro');
  assert.equal(bySku.envelopeSha256, 'e'.repeat(64));
});

test('Pro module release manifest registry requires envelope hashes and matching file names', () => {
  const registry = proModuleBundleRegistryFromReleaseManifest({
    format: 'greybox.pro.bundle-release/v1',
    generatedAt: Date.parse('2026-05-20T00:00:00.000Z'),
    items: [
      {
        moduleId: 'soulslike-combat-pack',
        version: '0.1.0',
        payloadSha256: 'a'.repeat(64),
        envelopeBytes: 42_000,
        contentType: 'application/vnd.greybox.gbpro+json',
        fileName: 'soulslike-combat-pack-0.1.0.gbpro',
        cdnPath: 'greybox-pro/launch/soulslike-combat-pack-0.1.0.gbpro',
      },
      {
        moduleId: 'hero-shooter-toolkit',
        version: '0.1.0',
        payloadSha256: 'b'.repeat(64),
        envelopeSha256: 'c'.repeat(64),
        envelopeBytes: 43_000,
        contentType: 'application/vnd.greybox.gbpro+json',
        fileName: 'hero-shooter-toolkit-0.1.0.gbpro',
        cdnPath: 'greybox-pro/launch/renamed.gbpro',
      },
    ],
  });

  assert.deepEqual(registry, {});
});

test('Pro module release manifest registry cross-checks upload plans', () => {
  const releaseManifest = {
    format: 'greybox.pro.bundle-release/v1',
    generatedAt: Date.parse('2026-05-20T00:00:00.000Z'),
    releaseChannel: 'launch',
    objectPrefix: 'greybox-pro',
    items: [
      {
        moduleId: 'soulslike-combat-pack',
        version: '0.1.0',
        payloadSha256: 'a'.repeat(64),
        envelopeSha256: 'b'.repeat(64),
        envelopeBytes: 42_000,
        contentType: 'application/vnd.greybox.gbpro+json',
        fileName: 'soulslike-combat-pack-0.1.0.gbpro',
        cdnPath: 'greybox-pro/launch/soulslike-combat-pack-0.1.0.gbpro',
        entitlement: {
          sku: 'gbpro.soulslike-combat-pack',
          licenseTier: 'pro',
          grantKey: 'pro-module:soulslike-combat-pack',
          price: {
            currency: 'USD',
            oneTimeUsd: 79,
          },
        },
      },
    ],
  };
  const uploadPlan = {
    format: 'greybox.pro.bundle-upload-plan/v1',
    generatedAt: Date.parse('2026-05-20T00:00:00.000Z'),
    releaseChannel: 'launch',
    objectPrefix: 'greybox-pro',
    objectCount: 2,
    totalBytes: 46_000,
    objects: [
      {
        kind: 'manifest',
        sourceFileName: 'manifest.json',
        objectKey: 'greybox-pro/launch/manifest.json',
        contentType: 'application/json',
        sha256: 'c'.repeat(64),
        bytes: 4_000,
      },
      {
        kind: 'bundle',
        sourceFileName: 'soulslike-combat-pack-0.1.0.gbpro',
        objectKey: 'greybox-pro/launch/soulslike-combat-pack-0.1.0.gbpro',
        contentType: 'application/vnd.greybox.gbpro+json',
        sha256: 'b'.repeat(64),
        bytes: 42_000,
        moduleId: 'soulslike-combat-pack',
        version: '0.1.0',
        payloadSha256: 'a'.repeat(64),
        envelopeSha256: 'b'.repeat(64),
      },
    ],
  };
  const publishProof = publishProofFromUploadPlan(uploadPlan);
  const cloudHandoffReport = cloudHandoffReportFromReleaseEvidence(releaseManifest, uploadPlan, publishProof);

  const registry = proModuleBundleRegistryFromReleaseManifest(releaseManifest, uploadPlan);
  assert.deepEqual(Object.keys(registry), ['soulslike-combat-pack']);
  assert.equal(registry['soulslike-combat-pack']?.storageKey, 'greybox-pro/launch/soulslike-combat-pack-0.1.0.gbpro');

  const envRegistry = proModuleBundleRegistryFromEnv({
    GREYBOX_PRO_MODULE_BUNDLES_JSON: JSON.stringify(releaseManifest),
    GREYBOX_PRO_MODULE_BUNDLE_UPLOAD_PLAN_JSON: JSON.stringify(uploadPlan),
    GREYBOX_PRO_MODULE_BUNDLE_PUBLISH_PROOF_JSON: JSON.stringify(publishProof),
  });
  assert.deepEqual(Object.keys(envRegistry), ['soulslike-combat-pack']);
  const cloudSourceEnv = {
    format: 'greybox.pro.cloud-source-env/v1',
    generatedAt: uploadPlan.generatedAt,
    variables: {
      GREYBOX_PRO_MODULE_BUNDLES_JSON: JSON.stringify(releaseManifest),
      GREYBOX_PRO_MODULE_BUNDLE_UPLOAD_PLAN_JSON: JSON.stringify(uploadPlan),
      GREYBOX_PRO_MODULE_BUNDLE_PUBLISH_PROOF_JSON: JSON.stringify(publishProof),
    },
  };
  const cloudEnvRegistry = proModuleBundleRegistryFromEnv({
    GREYBOX_PRO_MODULE_CLOUD_SOURCE_ENV_JSON: JSON.stringify(cloudSourceEnv),
  });
  assert.deepEqual(Object.keys(cloudEnvRegistry), ['soulslike-combat-pack']);
  assert.deepEqual(proModuleBundleSourceProofFromEnv({
    GREYBOX_PRO_MODULE_CLOUD_SOURCE_ENV_JSON: JSON.stringify(cloudSourceEnv),
    GREYBOX_PRO_MODULE_CLOUD_HANDOFF_REPORT_JSON: JSON.stringify(cloudHandoffReport),
  }), {
    shippedModules: 1,
    signedBundles: 1,
    publishedObjects: 2,
    publishProductionReady: true,
    publishHandoffReady: true,
    publishReleaseMatchReady: true,
  });
  assert.deepEqual(proModuleBundleRegistryFromEnv({
    GREYBOX_PRO_MODULE_BUNDLES_JSON: JSON.stringify(releaseManifest),
    GREYBOX_PRO_MODULE_BUNDLE_UPLOAD_PLAN_JSON: JSON.stringify(uploadPlan),
  }), {});

  const mismatchedUploadPlan = {
    ...uploadPlan,
    objects: uploadPlan.objects.map((object) => (
      object.kind === 'bundle'
        ? { ...object, sha256: 'd'.repeat(64) }
        : object
    )),
  };
  assert.deepEqual(proModuleBundleRegistryFromReleaseManifest(releaseManifest, mismatchedUploadPlan), {});
  assert.deepEqual(proModuleBundleRegistryFromEnv({
    GREYBOX_PRO_MODULE_BUNDLES_JSON: JSON.stringify(releaseManifest),
    GREYBOX_PRO_MODULE_BUNDLE_UPLOAD_PLAN_JSON: JSON.stringify(mismatchedUploadPlan),
    GREYBOX_PRO_MODULE_BUNDLE_PUBLISH_PROOF_JSON: JSON.stringify(publishProofFromUploadPlan(uploadPlan)),
  }), {});

  const mismatchedPublishProof = {
    ...publishProofFromUploadPlan(uploadPlan),
    receipt: {
      ...publishProofFromUploadPlan(uploadPlan).receipt,
      totalBytes: 1,
    },
  };
  assert.deepEqual(proModuleBundleRegistryFromReleaseManifest(releaseManifest, uploadPlan, mismatchedPublishProof), {});
  assert.deepEqual(proModuleBundleRegistryFromEnv({
    GREYBOX_PRO_MODULE_BUNDLES_JSON: JSON.stringify(releaseManifest),
    GREYBOX_PRO_MODULE_BUNDLE_UPLOAD_PLAN_JSON: JSON.stringify(uploadPlan),
    GREYBOX_PRO_MODULE_BUNDLE_PUBLISH_PROOF_JSON: JSON.stringify(mismatchedPublishProof),
  }), {});

  const duplicateReceiptPublishProof = {
    ...publishProofFromUploadPlan(uploadPlan),
    duplicateObjectKeys: ['greybox-pro/launch/soulslike-combat-pack-0.1.0.gbpro'],
  };
  assert.deepEqual(proModuleBundleRegistryFromReleaseManifest(releaseManifest, uploadPlan, duplicateReceiptPublishProof), {});
  assert.deepEqual(proModuleBundleRegistryFromEnv({
    GREYBOX_PRO_MODULE_BUNDLES_JSON: JSON.stringify(releaseManifest),
    GREYBOX_PRO_MODULE_BUNDLE_UPLOAD_PLAN_JSON: JSON.stringify(uploadPlan),
    GREYBOX_PRO_MODULE_BUNDLE_PUBLISH_PROOF_JSON: JSON.stringify(duplicateReceiptPublishProof),
  }), {});

  const stalePublishProof = {
    ...publishProofFromUploadPlan(uploadPlan),
    generatedAt: uploadPlan.generatedAt - 1,
  };
  assert.deepEqual(proModuleBundleRegistryFromReleaseManifest(releaseManifest, uploadPlan, stalePublishProof), {});
  assert.deepEqual(proModuleBundleRegistryFromEnv({
    GREYBOX_PRO_MODULE_BUNDLES_JSON: JSON.stringify(releaseManifest),
    GREYBOX_PRO_MODULE_BUNDLE_UPLOAD_PLAN_JSON: JSON.stringify(uploadPlan),
    GREYBOX_PRO_MODULE_BUNDLE_PUBLISH_PROOF_JSON: JSON.stringify(stalePublishProof),
  }), {});

  const dryRunPublishProof = {
    ...publishProofFromUploadPlan(uploadPlan),
    receipt: {
      ...publishProofFromUploadPlan(uploadPlan).receipt,
      provider: 'local-dry-run',
    },
  };
  assert.deepEqual(proModuleBundleSourceProofFromEnv({
    GREYBOX_PRO_MODULE_BUNDLES_JSON: JSON.stringify(releaseManifest),
    GREYBOX_PRO_MODULE_BUNDLE_UPLOAD_PLAN_JSON: JSON.stringify(uploadPlan),
    GREYBOX_PRO_MODULE_BUNDLE_PUBLISH_PROOF_JSON: JSON.stringify(dryRunPublishProof),
  }), {
    shippedModules: 1,
    signedBundles: 1,
    publishedObjects: 2,
    publishProductionReady: false,
    publishHandoffReady: false,
    publishReleaseMatchReady: true,
  });
  assert.deepEqual(proModuleBundleRegistryFromEnv({
    GREYBOX_PRO_MODULE_CLOUD_SOURCE_ENV_JSON: JSON.stringify(cloudSourceEnv),
    GREYBOX_PRO_MODULE_BUNDLE_PUBLISH_PROOF_JSON: JSON.stringify(stalePublishProof),
  }), {});

  const unsafeTimelinePublishProof = {
    ...publishProofFromUploadPlan(uploadPlan),
    receiptTimelineIssues: ['receipt generatedAt predates upload plan generatedAt'],
  };
  assert.deepEqual(proModuleBundleRegistryFromReleaseManifest(releaseManifest, uploadPlan, unsafeTimelinePublishProof), {});
  assert.deepEqual(proModuleBundleRegistryFromEnv({
    GREYBOX_PRO_MODULE_BUNDLES_JSON: JSON.stringify(releaseManifest),
    GREYBOX_PRO_MODULE_BUNDLE_UPLOAD_PLAN_JSON: JSON.stringify(uploadPlan),
    GREYBOX_PRO_MODULE_BUNDLE_PUBLISH_PROOF_JSON: JSON.stringify(unsafeTimelinePublishProof),
  }), {});

  const shallowChecksPublishProof = {
    ...publishProofFromUploadPlan(uploadPlan),
    checks: [{ id: 'only-ready', status: 'pass', detail: 'forged shallow proof' }],
  };
  assert.deepEqual(proModuleBundleRegistryFromReleaseManifest(releaseManifest, uploadPlan, shallowChecksPublishProof), {});
  assert.deepEqual(proModuleBundleRegistryFromEnv({
    GREYBOX_PRO_MODULE_BUNDLES_JSON: JSON.stringify(releaseManifest),
    GREYBOX_PRO_MODULE_BUNDLE_UPLOAD_PLAN_JSON: JSON.stringify(uploadPlan),
    GREYBOX_PRO_MODULE_BUNDLE_PUBLISH_PROOF_JSON: JSON.stringify(shallowChecksPublishProof),
  }), {});
});

test('Pro module bundle registry imports ready entitlement registry metadata', () => {
  const liveOpsItem = proModuleEntitlementRegistryImportItem({ sizeBytes: 50_000 });
  const cozySimItem = proModuleEntitlementRegistryImportItem({
    sku: 'gbpro.cozy-sim-pack',
    grantKey: 'pro-module:cozy-sim-pack',
    moduleId: 'cozy-sim-pack',
    name: 'Cozy Sim Pack',
    version: '1.2.3',
    payloadSha256: 'c'.repeat(64),
    envelopeSha256: 'd'.repeat(64),
    objectKey: 'greybox-pro/launch/cozy-sim-pack-1.2.3.gbpro',
    cdnPath: 'greybox-pro/launch/cozy-sim-pack-1.2.3.gbpro',
  });
  const registry = proModuleBundleRegistryFromEnv({
    GREYBOX_PRO_MODULE_ENTITLEMENT_REGISTRY_JSON: JSON.stringify(proModuleEntitlementRegistryArtifact({
      itemCount: 2,
      importItems: [liveOpsItem, cozySimItem],
    })),
  });
  const directRegistry = proModuleBundleRegistryFromEntitlementRegistry(proModuleEntitlementRegistryArtifact());

  assert.deepEqual(Object.keys(registry), ['live-ops-pro', 'cozy-sim-pack']);
  assert.deepEqual(Object.keys(directRegistry), ['live-ops-pro']);
  assert.deepEqual(registry['live-ops-pro'], {
    moduleId: 'live-ops-pro',
    version: '0.1.0',
    payloadSha256: 'a'.repeat(64),
    envelopeSha256: 'b'.repeat(64),
    storageKey: 'greybox-pro/launch/live-ops-pro-0.1.0.gbpro',
    contentType: 'application/vnd.greybox.gbpro+json',
    entitlement: {
      sku: 'gbpro.live-ops-pro',
      licenseTier: 'pro',
      grantKey: 'pro-module:live-ops-pro',
      price: {
        currency: 'USD',
        oneTimeUsd: 199,
        monthlyUsd: 29,
      },
    },
    sizeBytes: 50_000,
    createdAt: '2026-05-20T00:00:00.000Z',
  });
  assert.equal(registry['cozy-sim-pack']?.entitlement?.sku, 'gbpro.cozy-sim-pack');
});

test('Pro module bundle registry imports entitlement registry from Cloud source env', () => {
  const releaseManifest = {
    format: 'greybox.pro.bundle-release/v1',
    generatedAt: Date.parse('2026-05-20T00:00:00.000Z'),
    releaseChannel: 'launch',
    objectPrefix: 'greybox-pro',
    items: [],
  };
  const uploadPlan = {
    format: 'greybox.pro.bundle-upload-plan/v1',
    generatedAt: Date.parse('2026-05-20T00:00:00.000Z'),
    releaseChannel: 'launch',
    objectPrefix: 'greybox-pro',
    objectCount: 1,
    totalBytes: 4_000,
    objects: [{
      kind: 'manifest',
      sourceFileName: 'manifest.json',
      objectKey: 'greybox-pro/launch/manifest.json',
      contentType: 'application/json',
      sha256: 'c'.repeat(64),
      bytes: 4_000,
    }],
  };
  const publishProof = publishProofFromUploadPlan(uploadPlan);
  const cloudSourceEnv = {
    format: 'greybox.pro.cloud-source-env/v1',
    generatedAt: Date.parse('2026-05-20T00:00:01.000Z'),
    variables: {
      GREYBOX_PRO_MODULE_BUNDLES_JSON: JSON.stringify(releaseManifest),
      GREYBOX_PRO_MODULE_BUNDLE_UPLOAD_PLAN_JSON: JSON.stringify(uploadPlan),
      GREYBOX_PRO_MODULE_BUNDLE_PUBLISH_PROOF_JSON: JSON.stringify(publishProof),
      GREYBOX_PRO_MODULE_ENTITLEMENT_REGISTRY_JSON: JSON.stringify(proModuleEntitlementRegistryArtifact()),
    },
  };

  const registry = proModuleBundleRegistryFromEnv({
    GREYBOX_PRO_MODULE_CLOUD_SOURCE_ENV_JSON: JSON.stringify(cloudSourceEnv),
  });

  assert.deepEqual(Object.keys(registry), ['live-ops-pro']);
  assert.equal(registry['live-ops-pro']?.storageKey, 'greybox-pro/launch/live-ops-pro-0.1.0.gbpro');
  assert.equal(registry['live-ops-pro']?.entitlement?.grantKey, 'pro-module:live-ops-pro');

  const notReadyCloudSourceEnv = {
    ...cloudSourceEnv,
    variables: {
      ...cloudSourceEnv.variables,
      GREYBOX_PRO_MODULE_ENTITLEMENT_REGISTRY_JSON: JSON.stringify(proModuleEntitlementRegistryArtifact({
        ready: false,
      })),
    },
  };
  assert.deepEqual(proModuleBundleRegistryFromEnv({
    GREYBOX_PRO_MODULE_CLOUD_SOURCE_ENV_JSON: JSON.stringify(notReadyCloudSourceEnv),
  }), {});
});

test('Pro module entitlement registry import fails closed on not-ready, unsafe, or drifted metadata', () => {
  const fallbackRegistry = [{
    moduleId: 'fallback-pack',
    version: '0.1.0',
    payloadSha256: 'f'.repeat(64),
    storageKey: 'greybox-pro/launch/fallback-pack-0.1.0.gbpro',
  }];
  const failingChecks = proModuleEntitlementRegistryChecks().map((check) => (
    check.id === 'registry-safety' ? { ...check, status: 'fail' as const } : check
  ));

  assert.deepEqual(proModuleBundleRegistryFromEnv({
    GREYBOX_PRO_MODULE_ENTITLEMENT_REGISTRY_JSON: JSON.stringify(proModuleEntitlementRegistryArtifact({ ready: false })),
    GREYBOX_PRO_MODULE_BUNDLES_JSON: JSON.stringify(fallbackRegistry),
  }), {});
  assert.deepEqual(proModuleBundleRegistryFromEnv({
    GREYBOX_PRO_MODULE_ENTITLEMENT_REGISTRY_JSON: JSON.stringify(proModuleEntitlementRegistryArtifact({ provider: 'local-dry-run' })),
  }), {});
  assert.deepEqual(proModuleBundleRegistryFromEnv({
    GREYBOX_PRO_MODULE_ENTITLEMENT_REGISTRY_JSON: JSON.stringify(proModuleEntitlementRegistryArtifact({
      issues: [{ code: 'hash_drift', severity: 'error', detail: 'hash drift' }],
    })),
  }), {});
  assert.deepEqual(proModuleBundleRegistryFromEnv({
    GREYBOX_PRO_MODULE_ENTITLEMENT_REGISTRY_JSON: JSON.stringify(proModuleEntitlementRegistryArtifact({ checks: failingChecks })),
  }), {});
  assert.deepEqual(proModuleBundleRegistryFromEnv({
    GREYBOX_PRO_MODULE_ENTITLEMENT_REGISTRY_JSON: JSON.stringify(proModuleEntitlementRegistryArtifact({
      unsafeToken: 'gbx_pro_secret1234567890',
    })),
  }), {});
  assert.deepEqual(proModuleBundleRegistryFromEnv({
    GREYBOX_PRO_MODULE_ENTITLEMENT_REGISTRY_JSON: JSON.stringify(proModuleEntitlementRegistryArtifact({
      importItems: [proModuleEntitlementRegistryImportItem({
        grantKey: 'pro-module:wrong-module',
      })],
    })),
  }), {});
  assert.deepEqual(proModuleBundleRegistryFromEnv({
    GREYBOX_PRO_MODULE_ENTITLEMENT_REGISTRY_JSON: JSON.stringify(proModuleEntitlementRegistryArtifact({
      importItems: [proModuleEntitlementRegistryImportItem({
        objectKey: 'greybox-pro/launch/live-ops-pro-0.1.0.gbpro',
        cdnPath: 'greybox-pro/launch/drifted.gbpro',
      })],
    })),
  }), {});
  assert.deepEqual(proModuleBundleRegistryFromEnv({
    GREYBOX_PRO_MODULE_ENTITLEMENT_REGISTRY_JSON: JSON.stringify(proModuleEntitlementRegistryArtifact({
      importItems: [proModuleEntitlementRegistryImportItem({
        objectKey: 'greybox-pro/launch/live-ops-pro-0.1.0.json',
        cdnPath: 'greybox-pro/launch/live-ops-pro-0.1.0.json',
        contentType: 'application/json',
      })],
    })),
  }), {});
  assert.deepEqual(proModuleBundleRegistryFromEnv({
    GREYBOX_PRO_MODULE_ENTITLEMENT_REGISTRY_JSON: JSON.stringify(proModuleEntitlementRegistryArtifact({
      importItems: [proModuleEntitlementRegistryImportItem({
        price: { currency: 'USD', oneTimeUsd: 0 },
      })],
    })),
  }), {});
  assert.deepEqual(proModuleBundleRegistryFromEnv({
    GREYBOX_PRO_MODULE_ENTITLEMENT_REGISTRY_JSON: JSON.stringify(proModuleEntitlementRegistryArtifact({
      importItems: [proModuleEntitlementRegistryImportItem({
        readiness: {
          manifestPresent: true,
          uploadPlanned: true,
          publishProofReady: true,
          productionPublishProof: true,
          cloudHandoffAligned: false,
        },
      })],
    })),
  }), {});
});

test('Pro module bundle downloads honor entitlement registry SKU and grant keys for Indie licenses', () => {
  const registry = proModuleBundleRegistryFromEnv({
    GREYBOX_PRO_MODULE_ENTITLEMENT_REGISTRY_JSON: JSON.stringify(proModuleEntitlementRegistryArtifact()),
  });
  const skuToken = 'gbx_indie_registry_sku_123';
  const grantToken = 'gbx_indie_registry_grant_123';
  const deniedToken = 'gbx_indie_registry_denied_123';

  assert.throws(
    () => proModuleBundleDownloadResponse({ moduleId: 'live-ops-pro' }, licenseValidationResponse('indie', 'indie', deniedToken), {
      registry,
      cdnBaseUrl: 'https://cdn.greybox.test/pro-modules',
      downloadSigningKey: 'download-signing-key',
      entitlements: {
        [licenseHash(deniedToken)]: ['live-ops-pro'],
      },
    }),
    (error) => error instanceof ProModuleSecretError
      && error.code === 'pro_module_not_entitled'
      && error.status === 403,
  );

  const bySku = proModuleBundleDownloadResponse({ moduleId: 'live-ops-pro' }, licenseValidationResponse('indie', 'indie', skuToken), {
    registry,
    cdnBaseUrl: 'https://cdn.greybox.test/pro-modules',
    downloadSigningKey: 'download-signing-key',
    entitlements: {
      [licenseHash(skuToken)]: ['gbpro.live-ops-pro'],
    },
    now: new Date('2026-05-20T00:00:00.000Z'),
  });
  const byGrant = proModuleBundleDownloadResponse({ moduleId: 'live-ops-pro' }, licenseValidationResponse('indie', 'indie', grantToken), {
    registry,
    cdnBaseUrl: 'https://cdn.greybox.test/pro-modules',
    downloadSigningKey: 'download-signing-key',
    entitlements: {
      [licenseHash(grantToken)]: ['pro-module:live-ops-pro'],
    },
    now: new Date('2026-05-20T00:00:00.000Z'),
  });

  assert.equal(bySku.moduleId, 'live-ops-pro');
  assert.equal(bySku.envelopeSha256, 'b'.repeat(64));
  assert.match(new URL(bySku.downloadUrl).pathname, /\/live-ops-pro-0\.1\.0\.gbpro$/u);
  assert.equal(verifyProModuleDownloadUrl({
    downloadUrl: bySku.downloadUrl,
    signingKey: 'download-signing-key',
    now: new Date('2026-05-20T00:00:01.000Z'),
  }), true);
  assert.equal(byGrant.moduleId, 'live-ops-pro');
});

test('Pro module bundle route issues a registry-backed signed .gbpro URL', async () => {
  const registry = proModuleBundleRegistryFromEnv({
    GREYBOX_PRO_MODULE_ENTITLEMENT_REGISTRY_JSON: JSON.stringify(proModuleEntitlementRegistryArtifact()),
  });
  const token = 'gbx_indie_registry_route_123';
  await withServer({
    proModuleBundleRegistry: registry,
    proModuleCdnBaseUrl: 'https://cdn.greybox.test/pro-modules',
    proModuleDownloadSigningKey: 'download-signing-key',
    proModuleEntitlements: {
      [licenseHash(token)]: ['gbpro.live-ops-pro'],
    },
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/pro-modules/live-ops-pro.gbpro?payloadSha256=${'a'.repeat(64)}`, {
      headers: { authorization: `Bearer ${token}` },
    });

    assert.equal(response.status, 200);
    const json = await response.json() as { moduleId: string; downloadUrl: string; envelopeSha256: string };
    assert.equal(json.moduleId, 'live-ops-pro');
    assert.equal(json.envelopeSha256, 'b'.repeat(64));
    assert.match(new URL(json.downloadUrl).pathname, /\/live-ops-pro-0\.1\.0\.gbpro$/u);
    assert.equal(verifyProModuleDownloadUrl({
      downloadUrl: json.downloadUrl,
      signingKey: 'download-signing-key',
    }), true);
  });
});

type RegistryCheckFixture = {
  id: string;
  status: 'pass' | 'fail';
  detail: string;
};

function proModuleEntitlementRegistryChecks(): RegistryCheckFixture[] {
  return [
    { id: 'formats', status: 'pass', detail: 'Release, upload, and publish formats are valid' },
    { id: 'release-fields', status: 'pass', detail: 'Release fields match' },
    { id: 'publish-proof-ready', status: 'pass', detail: 'Publish proof is ready' },
    { id: 'production-provider', status: 'pass', detail: 'r2 production-backed' },
    { id: 'module-coverage', status: 'pass', detail: 'All module entitlement metadata is covered' },
    { id: 'manifest-upload-alignment', status: 'pass', detail: 'Release and upload metadata align' },
    { id: 'cloud-handoff-alignment', status: 'pass', detail: 'Cloud handoff report aligns' },
    { id: 'registry-safety', status: 'pass', detail: 'Registry is sanitized' },
  ];
}

function proModuleEntitlementRegistryImportItem(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    sku: 'gbpro.live-ops-pro',
    grantKey: 'pro-module:live-ops-pro',
    moduleId: 'live-ops-pro',
    name: 'Live Ops Pro',
    version: '0.1.0',
    payloadSha256: 'a'.repeat(64),
    envelopeSha256: 'b'.repeat(64),
    objectKey: 'greybox-pro/launch/live-ops-pro-0.1.0.gbpro',
    cdnPath: 'greybox-pro/launch/live-ops-pro-0.1.0.gbpro',
    licenseTier: 'pro',
    price: {
      currency: 'USD',
      oneTimeUsd: 199,
      monthlyUsd: 29,
    },
    keyId: 'greybox-entitlement-registry',
    releaseChannel: 'launch',
    objectPrefix: 'greybox-pro',
    readiness: {
      manifestPresent: true,
      uploadPlanned: true,
      publishProofReady: true,
      productionPublishProof: true,
      cloudHandoffAligned: true,
    },
    ...overrides,
  };
}

function proModuleEntitlementRegistryArtifact(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const importItems = Array.isArray(overrides.importItems)
    ? overrides.importItems
    : [proModuleEntitlementRegistryImportItem()];
  const summary = {
    manifestModules: importItems.length,
    uploadPlanBundleObjects: importItems.length,
    publishProofBundleModules: importItems.length,
    productionPublishProof: true,
    cloudHandoffChecked: true,
    ...(typeof overrides.summary === 'object' && overrides.summary && !Array.isArray(overrides.summary)
      ? overrides.summary
      : {}),
  };
  return {
    format: 'greybox.pro.entitlement-registry/v1',
    generatedAt: Date.parse('2026-05-20T00:00:00.000Z'),
    ready: true,
    releaseChannel: 'launch',
    objectPrefix: 'greybox-pro',
    keyId: 'greybox-entitlement-registry',
    provider: 'r2',
    itemCount: importItems.length,
    summary,
    checks: proModuleEntitlementRegistryChecks(),
    issues: [],
    importItems,
    disclaimer: 'Sanitized entitlement registry import artifact.',
    ...overrides,
  };
}

function publishProofFromUploadPlan(uploadPlan: {
  generatedAt?: number;
  releaseChannel: string;
  objectPrefix: string;
  objectCount: number;
  totalBytes: number;
}) {
  return {
    format: 'greybox.pro.bundle-publish-proof/v1',
    generatedAt: Math.max(
      Date.parse('2026-05-20T00:00:00.000Z'),
      'generatedAt' in uploadPlan && typeof uploadPlan.generatedAt === 'number' ? uploadPlan.generatedAt : 0,
    ),
    ready: true,
    releaseChannel: uploadPlan.releaseChannel,
    objectPrefix: uploadPlan.objectPrefix,
    keyId: 'greybox-release-test',
    uploadPlan: {
      objectCount: uploadPlan.objectCount,
      totalBytes: uploadPlan.totalBytes,
    },
    receipt: {
      provider: 'r2',
      objectCount: uploadPlan.objectCount,
      totalBytes: uploadPlan.totalBytes,
    },
    checks: [
      { id: 'format', status: 'pass', detail: 'Receipt format greybox.pro.bundle-publish-receipt/v1' },
      { id: 'release-channel', status: 'pass', detail: `${uploadPlan.releaseChannel} vs ${uploadPlan.releaseChannel}` },
      { id: 'object-prefix', status: 'pass', detail: `${uploadPlan.objectPrefix} vs ${uploadPlan.objectPrefix}` },
      { id: 'object-count', status: 'pass', detail: '2/2 receipt objects matched the upload plan' },
      { id: 'object-integrity', status: 'pass', detail: 'All receipt metadata matches' },
      { id: 'receipt-timeline', status: 'pass', detail: 'Receipt timestamps prove objects were published after this upload plan' },
      { id: 'receipt-safety', status: 'pass', detail: 'Receipt is sanitized' },
    ],
    missingObjectKeys: [],
    extraObjectKeys: [],
    duplicateObjectKeys: [],
    mismatches: [],
    unsafeReceiptFields: [],
    receiptTimelineIssues: [],
  };
}

function cloudHandoffReportFromReleaseEvidence(
  releaseManifest: { releaseChannel?: string; objectPrefix?: string; items: Array<{ moduleId: string }> },
  uploadPlan: { releaseChannel: string; objectPrefix: string; objectCount: number; totalBytes: number },
  publishProof: { generatedAt: number; keyId: string; receipt: { provider: string } },
) {
  return {
    format: 'greybox.pro.cloud-handoff-report/v1',
    generatedAt: publishProof.generatedAt + 1,
    ready: true,
    provider: publishProof.receipt.provider,
    releaseChannel: releaseManifest.releaseChannel ?? uploadPlan.releaseChannel,
    objectPrefix: releaseManifest.objectPrefix ?? uploadPlan.objectPrefix,
    keyId: publishProof.keyId,
    moduleIds: releaseManifest.items.map((item) => item.moduleId).sort(),
    objectCount: uploadPlan.objectCount,
    totalBytes: uploadPlan.totalBytes,
    checks: [
      { id: 'cloud-env-format', status: 'pass', detail: 'Cloud source env format greybox.pro.cloud-source-env/v1' },
      { id: 'required-variables', status: 'pass', detail: 'All Cloud source env variables are present' },
      { id: 'parse-GREYBOX_PRO_MODULE_BUNDLES_JSON', status: 'pass', detail: 'release manifest parses' },
      { id: 'parse-GREYBOX_PRO_MODULE_BUNDLE_UPLOAD_PLAN_JSON', status: 'pass', detail: 'upload plan parses' },
      { id: 'parse-GREYBOX_PRO_MODULE_BUNDLE_PUBLISH_PROOF_JSON', status: 'pass', detail: 'publish proof parses' },
      { id: 'release-format', status: 'pass', detail: 'Release manifest format greybox.pro.bundle-release/v1' },
      { id: 'upload-plan-format', status: 'pass', detail: 'Upload plan format greybox.pro.bundle-upload-plan/v1' },
      { id: 'publish-proof-format', status: 'pass', detail: 'Publish proof format greybox.pro.bundle-publish-proof/v1' },
      { id: 'publish-proof-ready', status: 'pass', detail: 'Publish proof is ready' },
      { id: 'production-provider', status: 'pass', detail: 'r2 production-backed' },
      { id: 'module-coverage', status: 'pass', detail: 'All module bundles are covered' },
      { id: 'release-fields-match', status: 'pass', detail: 'Release fields match' },
      { id: 'object-counts-match', status: 'pass', detail: 'Object counts match' },
      { id: 'handoff-timeline', status: 'pass', detail: 'Timeline is fresh' },
      { id: 'sanitized-evidence', status: 'pass', detail: 'Evidence is sanitized' },
    ],
  };
}

test('Pro module bundle downloads are entitlement-gated signed CDN URLs', () => {
  const token = 'gbx_pro_test_123';
  const license = licenseValidationResponse('pro', 'pro', token);
  const response = proModuleBundleDownloadResponse({
    moduleId: 'soulslike-combat-pack',
    payloadSha256: 'a'.repeat(64),
  }, license, {
    registry: {
      'soulslike-combat-pack': {
        moduleId: 'soulslike-combat-pack',
        version: '0.1.0',
        payloadSha256: 'a'.repeat(64),
        envelopeSha256: 'b'.repeat(64),
        storageKey: 'soulslike-combat-pack/0.1.0/soulslike-combat-pack.gbpro.json',
        contentType: 'application/vnd.greybox.gbpro+json',
        sizeBytes: 42_000,
      },
    },
    cdnBaseUrl: 'https://cdn.greybox.test/pro-modules',
    downloadSigningKey: 'download-signing-key',
    now: new Date('2026-05-20T00:00:00.000Z'),
    ttlSeconds: 900,
  });

  assert.equal(response.moduleId, 'soulslike-combat-pack');
  assert.equal(response.version, '0.1.0');
  assert.equal(response.payloadSha256, 'a'.repeat(64));
  assert.equal(response.envelopeSha256, 'b'.repeat(64));
  assert.equal(response.sizeBytes, 42_000);
  assert.equal(response.expiresAt, '2026-05-20T00:15:00.000Z');
  assert.equal(verifyProModuleDownloadUrl({
    downloadUrl: response.downloadUrl,
    signingKey: 'download-signing-key',
    now: new Date('2026-05-20T00:00:01.000Z'),
  }), true);
  const serialized = JSON.stringify(response);
  assert.doesNotMatch(serialized, /gbx_pro_test_123/u);
  assert.doesNotMatch(serialized, /download-signing-key/u);

  const tampered = new URL(response.downloadUrl);
  tampered.searchParams.set('payloadSha256', 'b'.repeat(64));
  assert.equal(verifyProModuleDownloadUrl({
    downloadUrl: tampered.toString(),
    signingKey: 'download-signing-key',
    now: new Date('2026-05-20T00:00:01.000Z'),
  }), false);

  const wrongOrigin = new URL(response.downloadUrl);
  wrongOrigin.hostname = 'cdn.evil.test';
  assert.equal(verifyProModuleDownloadUrl({
    downloadUrl: wrongOrigin.toString(),
    signingKey: 'download-signing-key',
    now: new Date('2026-05-20T00:00:01.000Z'),
  }), false);

  const duplicateSignature = new URL(response.downloadUrl);
  duplicateSignature.searchParams.append('signature', duplicateSignature.searchParams.get('signature') ?? '');
  assert.equal(verifyProModuleDownloadUrl({
    downloadUrl: duplicateSignature.toString(),
    signingKey: 'download-signing-key',
    now: new Date('2026-05-20T00:00:01.000Z'),
  }), false);

  const malformedSignature = new URL(response.downloadUrl);
  malformedSignature.searchParams.set('signature', 'not+base64url');
  assert.equal(verifyProModuleDownloadUrl({
    downloadUrl: malformedSignature.toString(),
    signingKey: 'download-signing-key',
    now: new Date('2026-05-20T00:00:01.000Z'),
  }), false);
});

test('Pro module bundle downloads fail closed without entitlement or matching payload', () => {
  const registry = {
    'soulslike-combat-pack': {
      moduleId: 'soulslike-combat-pack',
      version: '0.1.0',
      payloadSha256: 'a'.repeat(64),
      storageKey: 'soulslike-combat-pack/0.1.0/soulslike-combat-pack.gbpro.json',
      contentType: 'application/vnd.greybox.gbpro+json' as const,
    },
  };
  const indie = licenseValidationResponse('indie', 'indie', 'gbx_indie_test_123');

  assert.throws(
    () => proModuleBundleDownloadResponse({ moduleId: 'soulslike-combat-pack' }, indie, {
      registry,
      cdnBaseUrl: 'https://cdn.greybox.test',
      downloadSigningKey: 'download-signing-key',
    }),
    (error) => error instanceof ProModuleSecretError
      && error.code === 'pro_module_not_entitled'
      && error.status === 403,
  );
  assert.throws(
    () => proModuleBundleDownloadResponse({
      moduleId: 'soulslike-combat-pack',
      payloadSha256: 'b'.repeat(64),
    }, licenseValidationResponse('pro', 'pro', 'gbx_pro_test_123'), {
      registry,
      cdnBaseUrl: 'https://cdn.greybox.test',
      downloadSigningKey: 'download-signing-key',
    }),
    (error) => error instanceof ProModuleSecretError
      && error.code === 'pro_module_payload_mismatch'
      && error.status === 409,
  );

  const entitled = proModuleBundleDownloadResponse({ moduleId: 'soulslike-combat-pack' }, indie, {
    registry,
    cdnBaseUrl: 'https://cdn.greybox.test',
    downloadSigningKey: 'download-signing-key',
    entitlements: {
      [licenseHash('gbx_indie_test_123')]: ['soulslike-combat-pack'],
    },
    now: new Date('2026-05-20T00:00:00.000Z'),
  });
  assert.equal(entitled.moduleId, 'soulslike-combat-pack');
});

test('Pro module bundle route returns a signed entitlement-gated download URL', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-pro-module-download-audit-'));
  try {
    const auditLog = new FileAuditLog(dir);
    const token = 'gbx_pro_download_route_123';
    await withServer({
      auditLog,
      proModuleBundleRegistry: {
        'soulslike-combat-pack': {
          moduleId: 'soulslike-combat-pack',
          version: '0.1.0',
          payloadSha256: 'a'.repeat(64),
          envelopeSha256: 'b'.repeat(64),
          storageKey: 'soulslike-combat-pack/0.1.0/soulslike-combat-pack.gbpro.json',
          contentType: 'application/vnd.greybox.gbpro+json',
          sizeBytes: 42_000,
        },
      },
      proModuleCdnBaseUrl: 'https://cdn.greybox.test/pro-modules',
      proModuleDownloadSigningKey: 'download-signing-key',
    }, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/v1/pro-modules/soulslike-combat-pack.gbpro?payloadSha256=${'a'.repeat(64)}`, {
        headers: {
          authorization: `Bearer ${token}`,
          'user-agent': 'GreyboxUnity/1.0',
          'x-request-id': 'req_pro-download-123',
        },
      });

      assert.equal(response.status, 200);
      assert.equal(response.headers.get('x-request-id'), 'req_pro-download-123');
      const json = await response.json() as {
        moduleId: string;
        version: string;
        payloadSha256: string;
        downloadUrl: string;
        expiresAt: string;
      };
      assert.equal(json.moduleId, 'soulslike-combat-pack');
      assert.equal(json.version, '0.1.0');
      assert.equal(json.payloadSha256, 'a'.repeat(64));
      assert.equal(verifyProModuleDownloadUrl({
        downloadUrl: json.downloadUrl,
        signingKey: 'download-signing-key',
      }), true);

      const [entry] = await auditLog.readEntries({ action: 'pro_module.bundle_download_issued' });
      assert.equal(entry?.tenantId, `license:${licenseHash(token)}`);
      assert.equal(entry?.targetType, 'pro-module');
      assert.equal(entry?.targetId, 'soulslike-combat-pack');
      assert.equal((entry?.metadata as { payloadSha256?: string } | undefined)?.payloadSha256, 'a'.repeat(64));
      assert.equal((entry?.metadata as { envelopeSha256?: string } | undefined)?.envelopeSha256, 'b'.repeat(64));
      assert.equal((entry?.metadata as { entitlementPath?: string } | undefined)?.entitlementPath, 'license-tier');
      assert.equal((entry?.metadata as { requestId?: string } | undefined)?.requestId, 'req_pro-download-123');
      const serialized = JSON.stringify({ json, entry });
      assert.doesNotMatch(serialized, /gbx_pro_download_route_123/u);
      assert.doesNotMatch(serialized, /download-signing-key/u);
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('Pro module bundle route fails closed for missing entitlements and payload drift', async () => {
  await withServer({
    proModuleBundleRegistry: {
      'soulslike-combat-pack': {
        moduleId: 'soulslike-combat-pack',
        version: '0.1.0',
        payloadSha256: 'a'.repeat(64),
        storageKey: 'soulslike-combat-pack/0.1.0/soulslike-combat-pack.gbpro.json',
        contentType: 'application/vnd.greybox.gbpro+json',
      },
    },
    proModuleCdnBaseUrl: 'https://cdn.greybox.test/pro-modules',
    proModuleDownloadSigningKey: 'download-signing-key',
  }, async (baseUrl) => {
    const missingLicense = await fetch(`${baseUrl}/v1/pro-modules/soulslike-combat-pack.gbpro`);
    const notEntitled = await fetch(`${baseUrl}/v1/pro-modules/soulslike-combat-pack.gbpro`, {
      headers: { authorization: 'Bearer gbx_indie_download_route_123' },
    });
    const payloadMismatch = await fetch(`${baseUrl}/v1/pro-modules/soulslike-combat-pack.gbpro?payloadSha256=${'b'.repeat(64)}`, {
      headers: { authorization: 'Bearer gbx_pro_download_route_123' },
    });

    assert.equal(missingLicense.status, 401);
    assert.deepEqual(await missingLicense.json(), { error: 'license_required' });
    assert.equal(notEntitled.status, 403);
    assert.deepEqual(await notEntitled.json(), { error: 'pro_module_not_entitled' });
    assert.equal(payloadMismatch.status, 409);
    assert.deepEqual(await payloadMismatch.json(), { error: 'pro_module_payload_mismatch' });
  });
});

test('Pro module secret endpoint derives deterministic per-license module secrets', async () => {
  await withServer({ proModuleSecretMasterKey: 'master-secret' }, async (baseUrl) => {
    const request = {
      moduleId: 'soulslike-combat-pack',
      payloadSha256: 'a'.repeat(64),
    };
    const response = await fetch(`${baseUrl}/v1/pro-modules/license-secret`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer gbx_pro_test_123',
        'content-type': 'application/json',
      },
      body: JSON.stringify(request),
    });
    const repeat = await fetch(`${baseUrl}/v1/pro-modules/license-secret`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer gbx_pro_test_123',
        'content-type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    assert.equal(response.status, 200);
    assert.equal(repeat.status, 200);
    const json = await response.json() as {
      moduleId: string;
      licenseHash: string;
      algorithm: string;
      decryptionSecret: string;
      expiresAt: string;
    };
    const repeated = await repeat.json() as { decryptionSecret: string };
    assert.equal(json.moduleId, 'soulslike-combat-pack');
    assert.equal(json.licenseHash, licenseHash('gbx_pro_test_123'));
    assert.equal(json.algorithm, 'hmac-sha256-license-module-v1');
    assert.equal(json.decryptionSecret, repeated.decryptionSecret);
    assert.ok(Date.parse(json.expiresAt) > Date.now());
    assert.doesNotMatch(JSON.stringify(json), /gbx_pro_test_123/u);
  });
});

test('Pro module secret endpoint records sanitized audit entries without raw secrets', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-pro-module-audit-'));
  try {
    const auditLog = new FileAuditLog(dir);
    const token = 'gbx_pro_secret_audit_123';
    await withServer({
      auditLog,
      proModuleSecretMasterKey: 'master-secret',
    }, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/v1/pro-modules/license-secret`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          'user-agent': 'GreyboxUnity/1.0',
          'x-request-id': 'req_pro-secret-123',
        },
        body: JSON.stringify({
          moduleId: 'soulslike-combat-pack',
          payloadSha256: 'a'.repeat(64),
        }),
      });

      assert.equal(response.status, 200);
      assert.equal(response.headers.get('x-request-id'), 'req_pro-secret-123');
      const secret = await response.json() as {
        moduleId: string;
        licenseHash: string;
        decryptionSecret: string;
      };
      const [entry] = await auditLog.readEntries({ action: 'pro_module.secret_issued' });
      assert.equal(entry?.tenantId, `license:${secret.licenseHash}`);
      assert.equal(entry?.targetType, 'pro-module');
      assert.equal(entry?.targetId, 'soulslike-combat-pack');
      assert.equal((entry?.metadata as { entitlementPath?: string } | undefined)?.entitlementPath, 'license-tier');
      assert.equal((entry?.metadata as { payloadSha256?: string } | undefined)?.payloadSha256, 'a'.repeat(64));
      assert.equal((entry?.metadata as { requestId?: string } | undefined)?.requestId, 'req_pro-secret-123');
      const serialized = JSON.stringify(entry);
      assert.doesNotMatch(serialized, /gbx_pro_secret_audit_123/u);
      assert.doesNotMatch(serialized, new RegExp(secret.decryptionSecret, 'u'));
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('Pro module secret endpoint denies Indie licenses without module entitlement', async () => {
  await withServer({ proModuleSecretMasterKey: 'master-secret' }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/pro-modules/license-secret`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer gbx_indie_test_123',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ moduleId: 'soulslike-combat-pack' }),
    });

    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: 'pro_module_not_entitled' });
  });
});

test('Pro module secret endpoint grants explicit module entitlements for paid packs', async () => {
  const token = 'gbx_indie_test_123';
  await withServer({
    proModuleSecretMasterKey: 'master-secret',
    proModuleEntitlements: {
      [licenseHash(token)]: ['cozy-sim-pack'],
    },
  }, async (baseUrl) => {
    const allowed = await fetch(`${baseUrl}/v1/pro-modules/license-secret`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ moduleId: 'cozy-sim-pack' }),
    });
    const denied = await fetch(`${baseUrl}/v1/pro-modules/license-secret`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ moduleId: 'hero-shooter-toolkit' }),
    });

    assert.equal(allowed.status, 200);
    assert.equal((await allowed.json() as { moduleId: string }).moduleId, 'cozy-sim-pack');
    assert.equal(denied.status, 403);
  });
});

test('Pro module secret endpoint honors release-manifest entitlement SKUs', async () => {
  const token = 'gbx_indie_manifest_sku_123';
  await withServer({
    proModuleSecretMasterKey: 'master-secret',
    proModuleBundleRegistry: {
      'live-ops-pro': {
        moduleId: 'live-ops-pro',
        version: '0.1.0',
        payloadSha256: 'f'.repeat(64),
        storageKey: 'greybox-pro/launch/live-ops-pro-0.1.0.gbpro',
        contentType: 'application/vnd.greybox.gbpro+json',
        entitlement: {
          sku: 'gbpro.live-ops-pro',
          licenseTier: 'studio',
          grantKey: 'pro-module:live-ops-pro',
          price: {
            currency: 'USD',
            oneTimeUsd: 199,
            monthlyUsd: 29,
          },
        },
      },
    },
    proModuleEntitlements: {
      [licenseHash(token)]: ['gbpro.live-ops-pro'],
    },
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/pro-modules/license-secret`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        moduleId: 'live-ops-pro',
        payloadSha256: 'f'.repeat(64),
      }),
    });

    assert.equal(response.status, 200);
    assert.equal((await response.json() as { moduleId: string }).moduleId, 'live-ops-pro');
  });
});

test('Pro module secret endpoint fails closed on registered payload drift', async () => {
  await withServer({
    proModuleSecretMasterKey: 'master-secret',
    proModuleBundleRegistry: {
      'soulslike-combat-pack': {
        moduleId: 'soulslike-combat-pack',
        version: '0.1.0',
        payloadSha256: 'a'.repeat(64),
        storageKey: 'greybox-pro/launch/soulslike-combat-pack-0.1.0.gbpro',
        contentType: 'application/vnd.greybox.gbpro+json',
      },
    },
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/pro-modules/license-secret`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer gbx_pro_payload_drift_123',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        moduleId: 'soulslike-combat-pack',
        payloadSha256: 'b'.repeat(64),
      }),
    });

    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { error: 'pro_module_payload_mismatch' });
  });
});

test('Pro module secret endpoint accepts marketplace entitlement lookup keys', async () => {
  const token = 'gbx_indie_test_123';
  const marketplaceLookupKey = 'gbx_ent_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  await withServer({
    proModuleSecretMasterKey: 'master-secret',
    proModuleEntitlementLookupKeys: {
      [marketplaceLookupKey]: {
        licenseHash: licenseHash(token),
        modules: ['hero-shooter-toolkit'],
      },
    },
  }, async (baseUrl) => {
    const allowed = await fetch(`${baseUrl}/v1/pro-modules/license-secret`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        moduleId: 'hero-shooter-toolkit',
        payloadSha256: 'a'.repeat(64),
        entitlementLookupKey: marketplaceLookupKey,
      }),
    });
    const wrongLicense = await fetch(`${baseUrl}/v1/pro-modules/license-secret`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer gbx_indie_other_456',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        moduleId: 'hero-shooter-toolkit',
        entitlementLookupKey: marketplaceLookupKey,
      }),
    });
    const wrongModule = await fetch(`${baseUrl}/v1/pro-modules/license-secret`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        moduleId: 'soulslike-combat-pack',
        entitlementLookupKey: marketplaceLookupKey,
      }),
    });

    assert.equal(allowed.status, 200);
    assert.equal((await allowed.json() as { moduleId: string }).moduleId, 'hero-shooter-toolkit');
    assert.equal(wrongLicense.status, 403);
    assert.equal(wrongModule.status, 403);
  });
});

test('Pro module secret endpoint can claim marketplace entitlements on demand', async () => {
  const token = 'gbx_indie_test_123';
  const marketplaceLookupKey = 'gbx_ent_bbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  let claimBody: unknown = null;
  await withServer({
    proModuleSecretMasterKey: 'master-secret',
    marketplaceUrl: 'https://marketplace.greybox.test',
    marketplaceAdminToken: 'marketplace-admin-token',
    marketplaceFetch: async (url, init) => {
      assert.equal(url, 'https://marketplace.greybox.test/v1/marketplace/entitlements/claim');
      assert.equal(init.headers.authorization, 'Bearer marketplace-admin-token');
      claimBody = JSON.parse(init.body) as unknown;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          entitlement: {
            status: 'active',
            activation: {
              lookupKey: marketplaceLookupKey,
              licenseHash: licenseHash(token),
            },
            proModule: {
              moduleId: 'soulslike-combat-pack',
            },
          },
        }),
      };
    },
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/pro-modules/license-secret`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        moduleId: 'soulslike-combat-pack',
        payloadSha256: 'b'.repeat(64),
        entitlementLookupKey: marketplaceLookupKey,
      }),
    });

    assert.equal(response.status, 200);
    assert.deepEqual(claimBody, {
      lookupKey: marketplaceLookupKey,
      licenseHash: licenseHash(token),
      moduleId: 'soulslike-combat-pack',
    });
    assert.equal((await response.json() as { moduleId: string }).moduleId, 'soulslike-combat-pack');
  });
});

test('Pro module marketplace claims bind to signed bundle entitlement metadata', async () => {
  const token = 'gbx_indie_marketplace_bundle_123';
  const marketplaceLookupKey = 'gbx_ent_dddddddddddddddddddddddddddd';
  const registry = proModuleBundleRegistryFromReleaseManifest({
    format: 'greybox.pro.bundle-release/v1',
    generatedAt: Date.parse('2026-05-20T00:00:00.000Z'),
    items: [
      {
        moduleId: 'live-ops-pro',
        version: '0.1.0',
        payloadSha256: 'f'.repeat(64),
        envelopeSha256: 'e'.repeat(64),
        envelopeBytes: 50_000,
        contentType: 'application/vnd.greybox.gbpro+json',
        cdnPath: 'greybox-pro/launch/live-ops-pro-0.1.0.gbpro',
        fileName: 'live-ops-pro-0.1.0.gbpro',
        entitlement: {
          sku: 'gbpro.live-ops-pro',
          licenseTier: 'studio',
          grantKey: 'pro-module:live-ops-pro',
          price: {
            currency: 'USD',
            oneTimeUsd: 199,
            monthlyUsd: 29,
          },
        },
      },
    ],
  });
  let claimBody: Record<string, unknown> | undefined;

  await withServer({
    proModuleSecretMasterKey: 'master-secret',
    proModuleBundleRegistry: registry,
    marketplaceUrl: 'https://marketplace.greybox.test',
    marketplaceAdminToken: 'marketplace-admin-token',
    marketplaceFetch: async (_url, init) => {
      claimBody = JSON.parse(init.body) as Record<string, unknown>;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          entitlement: {
            status: 'active',
            activation: {
              lookupKey: marketplaceLookupKey,
              licenseHash: licenseHash(token),
            },
            proModule: {
              moduleId: 'live-ops-pro',
              entitlementSku: 'gbpro.live-ops-pro',
              entitlementGrantKey: 'pro-module:live-ops-pro',
              entitlementLicenseTier: 'studio',
            },
          },
        }),
      };
    },
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/pro-modules/license-secret`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        moduleId: 'live-ops-pro',
        entitlementLookupKey: marketplaceLookupKey,
      }),
    });

    assert.equal(response.status, 200);
    assert.equal((await response.json() as { moduleId: string }).moduleId, 'live-ops-pro');
    assert.deepEqual(claimBody, {
      lookupKey: marketplaceLookupKey,
      licenseHash: licenseHash(token),
      moduleId: 'live-ops-pro',
      entitlementSku: 'gbpro.live-ops-pro',
      entitlementGrantKey: 'pro-module:live-ops-pro',
    });
  });

  await withServer({
    proModuleSecretMasterKey: 'master-secret',
    proModuleBundleRegistry: registry,
    marketplaceUrl: 'https://marketplace.greybox.test',
    marketplaceAdminToken: 'marketplace-admin-token',
    marketplaceFetch: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        entitlement: {
          status: 'active',
          activation: {
            lookupKey: marketplaceLookupKey,
            licenseHash: licenseHash(token),
          },
          proModule: {
            moduleId: 'live-ops-pro',
            entitlementSku: 'gbpro.live-ops-pro',
            entitlementGrantKey: 'pro-module:live-ops-pro',
            entitlementLicenseTier: 'pro',
          },
        },
      }),
    }),
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/pro-modules/license-secret`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        moduleId: 'live-ops-pro',
        entitlementLookupKey: marketplaceLookupKey,
      }),
    });

    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: 'pro_module_not_entitled' });
  });
});

test('Pro module marketplace entitlement claims reject remote HTTP URLs outside local rehearsals', async () => {
  const token = 'gbx_indie_http_marketplace_123';
  const marketplaceLookupKey = 'gbx_ent_http_marketplace';
  let calls = 0;
  await withServer({
    proModuleSecretMasterKey: 'master-secret',
    marketplaceUrl: 'http://marketplace.greybox.studio',
    marketplaceAdminToken: 'marketplace-admin-token',
    marketplaceFetch: async () => {
      calls += 1;
      return {
        ok: true,
        status: 200,
        json: async () => ({ entitlement: {} }),
      };
    },
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/pro-modules/license-secret`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        moduleId: 'soulslike-combat-pack',
        entitlementLookupKey: marketplaceLookupKey,
      }),
    });
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: 'pro_module_not_entitled' });
  });
  assert.equal(calls, 0);

  await withServer({
    proModuleSecretMasterKey: 'master-secret',
    marketplaceUrl: 'http://localhost:8787',
    marketplaceAdminToken: 'marketplace-admin-token',
    marketplaceFetch: async (url) => {
      calls += 1;
      assert.equal(url, 'http://localhost:8787/v1/marketplace/entitlements/claim');
      return {
        ok: true,
        status: 200,
        json: async () => ({
          entitlement: {
            status: 'active',
            activation: {
              lookupKey: marketplaceLookupKey,
              licenseHash: licenseHash(token),
            },
            proModule: {
              moduleId: 'soulslike-combat-pack',
            },
          },
        }),
      };
    },
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/pro-modules/license-secret`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        moduleId: 'soulslike-combat-pack',
        entitlementLookupKey: marketplaceLookupKey,
      }),
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json() as { moduleId: string }).moduleId, 'soulslike-combat-pack');
  });
  assert.equal(calls, 1);
});

test('Pro module secret endpoint persists marketplace claims in durable entitlement store', async () => {
  const token = 'gbx_indie_durable_entitlement_123';
  const marketplaceLookupKey = 'gbx_ent_cccccccccccccccccccccccccccc';
  let claimCalls = 0;
  let records: ProModuleEntitlementGrantRecord[] = [];
  const proModuleEntitlementGrantStore: ProModuleEntitlementGrantStore = {
    async list() {
      return records;
    },
    async upsert(record) {
      records = [record];
    },
  };

  await withServer({
    proModuleSecretMasterKey: 'master-secret',
    proModuleEntitlementGrantStore,
    marketplaceUrl: 'https://marketplace.greybox.test',
    marketplaceAdminToken: 'marketplace-admin-token',
    marketplaceFetch: async () => {
      claimCalls += 1;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          entitlement: {
            status: 'active',
            activation: {
              lookupKey: marketplaceLookupKey,
              licenseHash: licenseHash(token),
            },
            proModule: {
              moduleId: 'soulslike-combat-pack',
            },
          },
        }),
      };
    },
  }, async (baseUrl) => {
    const claim = await fetch(`${baseUrl}/v1/pro-modules/license-secret`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        moduleId: 'soulslike-combat-pack',
        entitlementLookupKey: marketplaceLookupKey,
      }),
    });
    assert.equal(claim.status, 200);

    const fromStore = await fetch(`${baseUrl}/v1/pro-modules/license-secret`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        moduleId: 'soulslike-combat-pack',
      }),
    });

    assert.equal(fromStore.status, 200);
    assert.equal((await fromStore.json() as { moduleId: string }).moduleId, 'soulslike-combat-pack');
  });

  assert.equal(claimCalls, 1);
  assert.deepEqual(records, [{
    licenseHash: licenseHash(token),
    lookupKey: marketplaceLookupKey,
    modules: ['soulslike-combat-pack'],
    status: 'active',
  }]);
  assert.doesNotMatch(JSON.stringify(records), /gbx_indie_durable_entitlement_123|marketplace-admin-token/u);
});

test('Pro module secret endpoint persists revoked marketplace claims before checking stale grants', async () => {
  const token = 'gbx_indie_refunded_entitlement_123';
  const marketplaceLookupKey = 'gbx_ent_refunded_entitlement';
  let claimCalls = 0;
  let records: ProModuleEntitlementGrantRecord[] = [{
    licenseHash: licenseHash(token),
    lookupKey: marketplaceLookupKey,
    modules: ['soulslike-combat-pack'],
    status: 'active',
  }];
  const proModuleEntitlementGrantStore: ProModuleEntitlementGrantStore = {
    async list() {
      return records;
    },
    async upsert(record) {
      records = [record];
    },
  };

  await withServer({
    proModuleSecretMasterKey: 'master-secret',
    proModuleEntitlementGrantStore,
    marketplaceUrl: 'https://marketplace.greybox.test',
    marketplaceAdminToken: 'marketplace-admin-token',
    marketplaceFetch: async () => {
      claimCalls += 1;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          entitlement: {
            status: 'revoked',
            activation: {
              lookupKey: marketplaceLookupKey,
              licenseHash: licenseHash(token),
            },
            proModule: {
              moduleId: 'soulslike-combat-pack',
            },
          },
        }),
      };
    },
  }, async (baseUrl) => {
    const withLookup = await fetch(`${baseUrl}/v1/pro-modules/license-secret`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        moduleId: 'soulslike-combat-pack',
        entitlementLookupKey: marketplaceLookupKey,
      }),
    });
    assert.equal(withLookup.status, 403);
    assert.deepEqual(await withLookup.json(), { error: 'pro_module_not_entitled' });

    const withoutLookup = await fetch(`${baseUrl}/v1/pro-modules/license-secret`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        moduleId: 'soulslike-combat-pack',
      }),
    });
    assert.equal(withoutLookup.status, 403);
    assert.deepEqual(await withoutLookup.json(), { error: 'pro_module_not_entitled' });
  });

  assert.equal(claimCalls, 1);
  assert.deepEqual(records, [{
    licenseHash: licenseHash(token),
    lookupKey: marketplaceLookupKey,
    modules: ['soulslike-combat-pack'],
    status: 'revoked',
  }]);
  assert.doesNotMatch(JSON.stringify(records), /gbx_indie_refunded_entitlement_123|marketplace-admin-token/u);
});

test('Pro module secret endpoint fails closed when marketplace claim refresh is unavailable', async () => {
  const token = 'gbx_indie_stale_entitlement_refresh_123';
  const marketplaceLookupKey = 'gbx_ent_stale_entitlement_refresh';
  let claimCalls = 0;
  let records: ProModuleEntitlementGrantRecord[] = [{
    licenseHash: licenseHash(token),
    lookupKey: marketplaceLookupKey,
    modules: ['soulslike-combat-pack'],
    status: 'active',
  }];
  const proModuleEntitlementGrantStore: ProModuleEntitlementGrantStore = {
    async list() {
      return records;
    },
    async upsert(record) {
      records = [record];
    },
  };

  await withServer({
    proModuleSecretMasterKey: 'master-secret',
    proModuleEntitlementGrantStore,
    marketplaceUrl: 'https://marketplace.greybox.test',
    marketplaceAdminToken: 'marketplace-admin-token',
    marketplaceFetch: async () => {
      claimCalls += 1;
      return {
        ok: false,
        status: 503,
        json: async () => ({ error: 'marketplace_unavailable' }),
      };
    },
  }, async (baseUrl) => {
    const withLookup = await fetch(`${baseUrl}/v1/pro-modules/license-secret`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        moduleId: 'soulslike-combat-pack',
        entitlementLookupKey: marketplaceLookupKey,
      }),
    });
    assert.equal(withLookup.status, 403);
    assert.deepEqual(await withLookup.json(), { error: 'pro_module_not_entitled' });

    const withoutLookup = await fetch(`${baseUrl}/v1/pro-modules/license-secret`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        moduleId: 'soulslike-combat-pack',
      }),
    });
    assert.equal(withoutLookup.status, 403);
    assert.deepEqual(await withoutLookup.json(), { error: 'pro_module_not_entitled' });
  });

  assert.equal(claimCalls, 1);
  assert.deepEqual(records, [{
    licenseHash: licenseHash(token),
    lookupKey: marketplaceLookupKey,
    modules: ['soulslike-combat-pack'],
    status: 'revoked',
  }]);
  assert.doesNotMatch(JSON.stringify(records), /gbx_indie_stale_entitlement_refresh_123|marketplace-admin-token/u);
});

test('Pro module secret endpoint fails closed when the master key is not configured', async () => {
  await withServer({}, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/pro-modules/license-secret`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer gbx_pro_test_123',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ moduleId: 'soulslike-combat-pack' }),
    });

    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'pro_module_secret_not_configured' });
  });
});
