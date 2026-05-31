// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import type http from 'node:http';
import test from 'node:test';

import { createGreyboxCloudServer } from '../src/server.js';
import { TenantStore } from '../src/routers/tenants.js';
import { requiredEncryptionDatasets } from '../src/enterprise/encryptionReadiness.js';
import type { LicenseRecordStore } from '../src/routers/licenses.js';
import type { ProModuleEntitlementGrantStore } from '../src/routers/pro-modules.js';
import type { AuditLog } from '../src/enterprise/auditLog.js';
import type { BillingLedger } from '../src/metering/billingLedger.js';
import { ScimUserStore } from '../src/enterprise/scim.js';
import type { ModelTrainingConsentStore } from '../src/enterprise/modelTrainingConsent.js';
import type { PrivacyRequestStore } from '../src/enterprise/privacyRequests.js';
import type { SecurityIncidentStore } from '../src/enterprise/incidents.js';
import type { LegalHoldStore } from '../src/enterprise/retention.js';

async function withServer<T>(
  options: Parameters<typeof createGreyboxCloudServer>[0],
  run: (baseUrl: string) => Promise<T>,
): Promise<T> {
  const server: http.Server = createGreyboxCloudServer(options);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  try {
    return await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

async function withEnv<T>(
  entries: Record<string, string | undefined>,
  run: () => Promise<T>,
): Promise<T> {
  const previous = Object.fromEntries(Object.keys(entries).map((key) => [key, process.env[key]]));
  try {
    for (const [key, value] of Object.entries(entries)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    return await run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function proModuleEntitlementRegistryArtifact(): Record<string, unknown> {
  return {
    format: 'greybox.pro.entitlement-registry/v1',
    generatedAt: Date.parse('2026-05-20T00:00:00.000Z'),
    ready: true,
    releaseChannel: 'launch',
    objectPrefix: 'greybox-pro',
    keyId: 'greybox-entitlement-registry',
    provider: 'r2',
    itemCount: 1,
    summary: {
      manifestModules: 1,
      uploadPlanBundleObjects: 1,
      publishProofBundleModules: 1,
      productionPublishProof: true,
      cloudHandoffChecked: true,
    },
    checks: [
      { id: 'formats', status: 'pass', detail: 'Release, upload, and publish formats are valid' },
      { id: 'release-fields', status: 'pass', detail: 'Release fields match' },
      { id: 'publish-proof-ready', status: 'pass', detail: 'Publish proof is ready' },
      { id: 'production-provider', status: 'pass', detail: 'r2 production-backed' },
      { id: 'module-coverage', status: 'pass', detail: 'All module entitlement metadata is covered' },
      { id: 'manifest-upload-alignment', status: 'pass', detail: 'Release and upload metadata align' },
      { id: 'registry-safety', status: 'pass', detail: 'Registry is sanitized' },
    ],
    issues: [],
    importItems: [{
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
      price: { currency: 'USD', oneTimeUsd: 199, monthlyUsd: 29 },
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
    }],
    disclaimer: 'Sanitized entitlement registry import artifact.',
  };
}

test('/healthz returns 200 with a stable service identifier', async () => {
  await withServer({}, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/healthz`);
    assert.equal(response.status, 200);
    const body = await response.json() as { ok: boolean; service: string };
    assert.equal(body.ok, true);
    assert.equal(body.service, 'greybox-cloud');
  });
});

test('/readyz reports missing Pro module bundle registries as degraded', async () => {
  await withEnv({
    GREYBOX_PRO_MODULE_ENTITLEMENT_REGISTRY_JSON: undefined,
    GREYBOX_PRO_MODULE_BUNDLES_JSON: undefined,
    GREYBOX_PRO_MODULE_BUNDLE_UPLOAD_PLAN_JSON: undefined,
    GREYBOX_PRO_MODULE_BUNDLE_PUBLISH_PROOF_JSON: undefined,
  }, async () => {
    await withServer({}, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/readyz`);
      const body = await response.json() as {
        degraded: boolean;
        checks: Record<string, { configured?: boolean; detail?: string }>;
      };

      assert.equal(body.degraded, true);
      assert.equal(body.checks.proModuleBundleRegistry?.configured, false);
      assert.equal(body.checks.proModuleBundleRegistry?.detail, 'missing');
    });
  });
});

test('/readyz reports Pro module entitlement registry imports without leaking bundle metadata', async () => {
  await withEnv({
    GREYBOX_PRO_MODULE_ENTITLEMENT_REGISTRY_JSON: JSON.stringify(proModuleEntitlementRegistryArtifact()),
    GREYBOX_PRO_MODULE_BUNDLES_JSON: undefined,
    GREYBOX_PRO_MODULE_BUNDLE_UPLOAD_PLAN_JSON: undefined,
    GREYBOX_PRO_MODULE_BUNDLE_PUBLISH_PROOF_JSON: undefined,
  }, async () => {
    await withServer({}, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/readyz`);
      const body = await response.json() as {
        checks: Record<string, { configured?: boolean; detail?: string }>;
      };
      const serialized = JSON.stringify(body.checks.proModuleBundleRegistry);

      assert.equal(body.checks.proModuleBundleRegistry?.configured, true);
      assert.equal(body.checks.proModuleBundleRegistry?.detail, 'entitlement-registry; 1 bundles');
      assert.doesNotMatch(serialized, /live-ops-pro|gbpro\.|pro-module:|greybox-pro\/launch|aaaaaaaa|bbbbbbbb/u);
    });
  });
});

test('/readyz reports degraded:true when optional subsystems are unconfigured but never 5xx', async () => {
  await withServer({}, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/readyz`);
    assert.equal(response.status, 200);
    const body = await response.json() as {
      ok: boolean;
      degraded: boolean;
      service: string;
      checks: Record<string, { ok: boolean; configured?: boolean }>;
    };
    assert.equal(body.ok, true);
    // In the bare default config nothing optional is wired, so the readiness
    // report MUST flag degraded so operators see what's missing.
    assert.equal(body.degraded, true);
    assert.equal(body.checks.metrics?.ok, true);
    assert.equal(body.checks.stripeApi?.configured, false);
    assert.equal(body.checks.billingPrices?.configured, false);
  });
});

test('/readyz flips degraded:false when Stripe billing prices and API key are configured', async () => {
  await withServer({
    stripeApiKey: 'sk_test_present',
    billingPriceIds: { indie: 'price_indie_test', studio: 'price_studio_test' },
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/readyz`);
    const body = await response.json() as {
      degraded: boolean;
      checks: Record<string, { configured?: boolean }>;
    };
    assert.equal(body.checks.stripeApi?.configured, true);
    assert.equal(body.checks.billingPrices?.configured, true);
    // Sentry, WorkOS, audit log, tenant store, rate limiter are still
    // unconfigured here, so degraded is still expected to be true.
    assert.equal(body.degraded, true);
  });
});

test('/readyz reports injected tenant stores as configured persistence', async () => {
  await withServer({
    tenantStore: new TenantStore(),
    tenantStorePersistence: 'postgres',
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/readyz`);
    const body = await response.json() as {
      checks: Record<string, { configured?: boolean; detail?: string }>;
    };
    assert.equal(body.checks.tenantStore?.configured, true);
    assert.equal(body.checks.tenantStore?.detail, 'postgres');
  });
});

test('/readyz reports postgres audit logs as configured persistence', async () => {
  const auditLog: AuditLog = {
    async append() {},
    async readEntries() {
      return [];
    },
    async verify() {
      return { valid: true, checked: 0 };
    },
  };
  await withServer({
    auditLog,
    auditLogPersistence: 'postgres',
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/readyz`);
    const body = await response.json() as {
      checks: Record<string, { configured?: boolean; detail?: string }>;
    };
    assert.equal(body.checks.auditLog?.configured, true);
    assert.equal(body.checks.auditLog?.detail, 'postgres');
  });
});

test('/readyz reports postgres billing ledgers as configured persistence', async () => {
  const billingLedger: BillingLedger = {
    async appendRecord() {},
    async appendUsage() {},
    async appendInvoice() {},
    async appendStripeMeterEvent() {},
    async readRecords() {
      return [];
    },
    async readUsageEvents() {
      return [];
    },
  };
  await withServer({
    billingLedger,
    billingLedgerPersistence: 'postgres',
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/readyz`);
    const body = await response.json() as {
      checks: Record<string, { configured?: boolean; detail?: string }>;
    };
    assert.equal(body.checks.billingLedger?.configured, true);
    assert.equal(body.checks.billingLedger?.detail, 'postgres');
  });
});

test('/readyz reports missing audit logs as unconfigured memory persistence', async () => {
  await withServer({}, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/readyz`);
    const body = await response.json() as {
      checks: Record<string, { configured?: boolean; detail?: string }>;
    };
    assert.equal(body.checks.auditLog?.configured, false);
    assert.equal(body.checks.auditLog?.detail, 'memory');
  });
});

test('/readyz reports postgres SCIM stores as configured persistence', async () => {
  await withServer({
    scimStore: new ScimUserStore(),
    scimStorePersistence: 'postgres',
    scimToken: 'scim_test_token',
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/readyz`);
    const body = await response.json() as {
      checks: Record<string, { configured?: boolean; detail?: string }>;
    };
    assert.equal(body.checks.scimStore?.configured, true);
    assert.equal(body.checks.scimStore?.detail, 'postgres');
    assert.equal(body.checks.scimToken?.configured, true);
  });
});

test('/readyz reports postgres license record stores as configured persistence', async () => {
  const licenseRecordStore: LicenseRecordStore = {
    async list() {
      return [];
    },
  };
  await withServer({
    licenseRecordStore,
    licenseRecordPersistence: 'postgres',
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/readyz`);
    const body = await response.json() as {
      checks: Record<string, { configured?: boolean; detail?: string }>;
    };
    assert.equal(body.checks.licenseRecordStore?.configured, true);
    assert.equal(body.checks.licenseRecordStore?.detail, 'postgres');
  });
});

test('/readyz reports static license records as configured env persistence', async () => {
  await withServer({
    licenseRecords: [{
      tokenHash: '1'.repeat(64),
      tier: 'pro',
      status: 'active',
    }],
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/readyz`);
    const body = await response.json() as {
      checks: Record<string, { configured?: boolean; detail?: string }>;
    };
    assert.equal(body.checks.licenseRecordStore?.configured, true);
    assert.equal(body.checks.licenseRecordStore?.detail, 'env');
  });
});

test('/readyz reports postgres Pro module entitlement stores as configured persistence', async () => {
  const proModuleEntitlementGrantStore: ProModuleEntitlementGrantStore = {
    async list() {
      return [];
    },
    async upsert() {},
  };
  await withServer({
    proModuleEntitlementGrantStore,
    proModuleEntitlementPersistence: 'postgres',
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/readyz`);
    const body = await response.json() as {
      checks: Record<string, { configured?: boolean; detail?: string }>;
    };
    assert.equal(body.checks.proModuleEntitlementStore?.configured, true);
    assert.equal(body.checks.proModuleEntitlementStore?.detail, 'postgres');
  });
});

test('/readyz blocks release-manifest Pro bundle registries without publish proof', async () => {
  const releaseManifest = proModuleReleaseManifest();
  const uploadPlan = proModuleUploadPlan();
  await withEnv({
    GREYBOX_PRO_MODULE_BUNDLES_JSON: JSON.stringify(releaseManifest),
    GREYBOX_PRO_MODULE_BUNDLE_UPLOAD_PLAN_JSON: JSON.stringify(uploadPlan),
    GREYBOX_PRO_MODULE_BUNDLE_PUBLISH_PROOF_JSON: undefined,
  }, async () => {
    await withServer({}, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/readyz`);
      const body = await response.json() as {
        degraded: boolean;
        checks: Record<string, { configured?: boolean; detail?: string }>;
      };

      assert.equal(body.degraded, true);
      assert.equal(body.checks.proModuleBundleRegistry?.configured, false);
      assert.equal(body.checks.proModuleBundleRegistry?.detail, 'release-manifest-missing-publish-proof');
    });
  });
});

test('/readyz reports publish-proofed Pro bundle registries without leaking bundle details', async () => {
  const releaseManifest = proModuleReleaseManifest();
  const uploadPlan = proModuleUploadPlan();
  await withEnv({
    GREYBOX_PRO_MODULE_BUNDLES_JSON: JSON.stringify(releaseManifest),
    GREYBOX_PRO_MODULE_BUNDLE_UPLOAD_PLAN_JSON: JSON.stringify(uploadPlan),
    GREYBOX_PRO_MODULE_BUNDLE_PUBLISH_PROOF_JSON: JSON.stringify(proModulePublishProof(uploadPlan)),
  }, async () => {
    await withServer({}, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/readyz`);
      const body = await response.json() as {
        checks: Record<string, { configured?: boolean; detail?: string }>;
      };
      const serialized = JSON.stringify(body);

      assert.equal(body.checks.proModuleBundleRegistry?.configured, true);
      assert.equal(body.checks.proModuleBundleRegistry?.detail, 'release-manifest-publish-proof; 1 bundles');
      assert.doesNotMatch(serialized, /soulslike-combat-pack/u);
      assert.doesNotMatch(serialized, /greybox-pro\/launch/u);
      assert.doesNotMatch(serialized, /[a-f0-9]{64}/iu);
    });
  });
});

test('/readyz reports postgres model-training consent stores as configured persistence', async () => {
  const modelTrainingConsentStore: ModelTrainingConsentStore = {
    async create() {
      throw new Error('not used');
    },
    async list() {
      return [];
    },
    async latest() {
      return undefined;
    },
  };
  await withServer({
    modelTrainingConsentStore,
    modelTrainingConsentStorePersistence: 'postgres',
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/readyz`);
    const body = await response.json() as {
      checks: Record<string, { configured?: boolean; detail?: string }>;
    };
    assert.equal(body.checks.modelTrainingConsentStore?.configured, true);
    assert.equal(body.checks.modelTrainingConsentStore?.detail, 'postgres');
  });
});

test('/readyz reports postgres privacy request stores as configured persistence', async () => {
  const privacyRequestStore: PrivacyRequestStore = {
    async create() {
      throw new Error('not used');
    },
    async list() {
      return [];
    },
    async get() {
      return undefined;
    },
    async updateStatus() {
      throw new Error('not used');
    },
  };
  await withServer({
    privacyRequestStore,
    privacyRequestStorePersistence: 'postgres',
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/readyz`);
    const body = await response.json() as {
      checks: Record<string, { configured?: boolean; detail?: string }>;
    };
    assert.equal(body.checks.privacyRequestStore?.configured, true);
    assert.equal(body.checks.privacyRequestStore?.detail, 'postgres');
  });
});

test('/readyz reports postgres security incident stores as configured persistence', async () => {
  const incidentStore: SecurityIncidentStore = {
    async create() {
      throw new Error('not used');
    },
    async list() {
      return [];
    },
    async get() {
      return undefined;
    },
    async update() {
      throw new Error('not used');
    },
  };
  await withServer({
    incidentStore,
    incidentStorePersistence: 'postgres',
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/readyz`);
    const body = await response.json() as {
      checks: Record<string, { configured?: boolean; detail?: string }>;
    };
    assert.equal(body.checks.securityIncidentStore?.configured, true);
    assert.equal(body.checks.securityIncidentStore?.detail, 'postgres');
  });
});

test('/readyz reports postgres legal hold stores as configured persistence', async () => {
  const legalHoldStore: LegalHoldStore = {
    async create() {
      throw new Error('not used');
    },
    async list() {
      return [];
    },
    async get() {
      return undefined;
    },
    async update() {
      throw new Error('not used');
    },
  };
  await withServer({
    legalHoldStore,
    legalHoldStorePersistence: 'postgres',
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/readyz`);
    const body = await response.json() as {
      checks: Record<string, { configured?: boolean; detail?: string }>;
    };
    assert.equal(body.checks.legalHoldStore?.configured, true);
    assert.equal(body.checks.legalHoldStore?.detail, 'postgres');
  });
});

test('/readyz reports hosted data residency runtime readiness', async () => {
  const dataResidencyEnv = {
    GREYBOX_DATA_RESIDENCY_ENFORCEMENT: 'strict',
    GREYBOX_REGION_US_BASE_URL: 'https://cloud-us.greybox.studio',
    GREYBOX_REGION_US_STORAGE_BOUNDARY: 'local',
    GREYBOX_REGION_US_PROVIDER_EGRESS: 'customer-selected',
    GREYBOX_REGION_US_TRANSFER_BASIS: 'same-region',
    GREYBOX_REGION_US_BACKUP_BOUNDARY: 'local',
    GREYBOX_REGION_EU_BASE_URL: 'https://cloud-eu.greybox.studio',
    GREYBOX_REGION_EU_STORAGE_BOUNDARY: 'local',
    GREYBOX_REGION_EU_PROVIDER_EGRESS: 'customer-selected',
    GREYBOX_REGION_EU_TRANSFER_BASIS: 'sccs',
    GREYBOX_REGION_EU_BACKUP_BOUNDARY: 'local',
    GREYBOX_REGION_IN_BASE_URL: 'https://cloud-in.greybox.studio',
    GREYBOX_REGION_IN_STORAGE_BOUNDARY: 'local',
    GREYBOX_REGION_IN_PROVIDER_EGRESS: 'customer-selected',
    GREYBOX_REGION_IN_TRANSFER_BASIS: 'same-region',
    GREYBOX_REGION_IN_BACKUP_BOUNDARY: 'local',
  };
  await withServer({ dataResidencyEnv }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/readyz`);
    const body = await response.json() as {
      checks: Record<string, { configured?: boolean; detail?: string }>;
    };

    assert.equal(body.checks.dataResidencyRuntime?.configured, true);
    assert.equal(body.checks.dataResidencyRuntime?.detail, 'strict; 3/3 regions ready; 0 blocked');
  });
});

test('/readyz reports unpinned data residency runtime as degraded', async () => {
  await withServer({ dataResidencyEnv: { GREYBOX_DATA_RESIDENCY_ENFORCEMENT: 'audit' } }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/readyz`);
    const body = await response.json() as {
      degraded: boolean;
      checks: Record<string, { configured?: boolean; detail?: string }>;
    };

    assert.equal(body.degraded, true);
    assert.equal(body.checks.dataResidencyRuntime?.configured, false);
    assert.match(body.checks.dataResidencyRuntime?.detail ?? '', /^audit; 0\/3 regions ready; 0 blocked$/u);
  });
});

test('/readyz reports missing encryption evidence as degraded without leaking raw config', async () => {
  await withServer({ encryptionEnv: {} }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/readyz`);
    const body = await response.json() as {
      degraded: boolean;
      checks: Record<string, { configured?: boolean; detail?: string }>;
    };

    assert.equal(body.degraded, true);
    assert.equal(body.checks.encryptionRuntime?.configured, false);
    assert.equal(body.checks.encryptionRuntime?.detail, 'fail; unconfigured; 0/9 datasets; 0/3 regions; kms exports 0/3; tls blocked; backups blocked; secrets blocked');
  });
});

test('/readyz reports KMS-backed encryption evidence as configured and sanitized', async () => {
  await withServer({ encryptionEnv: encryptionReadyEnv() }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/readyz`);
    const body = await response.json() as {
      checks: Record<string, { configured?: boolean; detail?: string }>;
    };
    const serialized = JSON.stringify(body);

    assert.equal(body.checks.encryptionRuntime?.configured, true);
    assert.equal(body.checks.encryptionRuntime?.detail, 'pass; aws-kms; 9/9 datasets; 3/3 regions; kms exports 3/3; tls ready; backups ready; secrets ready');
    assert.doesNotMatch(serialized, /kms-key-123|secret-key-material|do-not-return|GREYBOX_ENCRYPTION_EVIDENCE_JSON/u);
  });
});

test('/v1/version reports service, version, and Node runtime info', async () => {
  await withServer({}, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/version`);
    assert.equal(response.status, 200);
    const body = await response.json() as {
      service: string;
      version: string;
      node: string;
    };
    assert.equal(body.service, 'greybox-cloud');
    assert.ok(typeof body.version === 'string');
    assert.match(body.node, /^\d+\.\d+\.\d+/u, 'node version must look like x.y.z');
  });
});

test('/v1/version is reachable without auth and bypasses the rate limiter', async () => {
  await withServer({}, async (baseUrl) => {
    // 30 quick requests should never get 429 because /v1/version is excluded
    // from the rate limiter token bucket in server.ts.
    for (let i = 0; i < 30; i++) {
      const response = await fetch(`${baseUrl}/v1/version`);
      assert.equal(response.status, 200);
    }
  });
});

function proModuleReleaseManifest() {
  return {
    format: 'greybox.pro.bundle-release/v1',
    generatedAt: Date.parse('2026-05-20T00:00:00.000Z'),
    releaseChannel: 'launch',
    keyId: 'greybox-release-test',
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
      },
    ],
  };
}

function proModuleUploadPlan() {
  return {
    format: 'greybox.pro.bundle-upload-plan/v1',
    generatedAt: Date.parse('2026-05-20T00:00:00.000Z'),
    releaseChannel: 'launch',
    objectPrefix: 'greybox-pro/launch',
    provider: 'r2',
    bucket: 'greybox-pro-modules',
    objectCount: 2,
    totalBytes: 45_200,
    objects: [
      {
        kind: 'manifest',
        sourceFileName: 'manifest.json',
        objectKey: 'greybox-pro/launch/manifest.json',
        contentType: 'application/json',
        sha256: 'c'.repeat(64),
        bytes: 3_200,
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
}

function proModulePublishProof(uploadPlan: ReturnType<typeof proModuleUploadPlan>) {
  return {
    format: 'greybox.pro.bundle-publish-proof/v1',
    generatedAt: Date.parse('2026-05-20T00:00:00.000Z'),
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
    missingObjectKeys: [],
    extraObjectKeys: [],
    duplicateObjectKeys: [],
    mismatches: [],
    unsafeReceiptFields: [],
    checks: [
      { id: 'format', status: 'pass' },
      { id: 'release-channel', status: 'pass' },
      { id: 'object-prefix', status: 'pass' },
      { id: 'object-count', status: 'pass' },
      { id: 'object-integrity', status: 'pass' },
      { id: 'receipt-timeline', status: 'pass' },
      { id: 'receipt-safety', status: 'pass' },
    ],
    receiptTimelineIssues: [],
  };
}

function encryptionReadyEnv(): Record<string, string> {
  const regions = ['us', 'eu', 'in'];
  return {
    GREYBOX_ENCRYPTION_EVIDENCE_JSON: JSON.stringify({
      kmsProvider: 'aws-kms',
      customerManagedKeys: true,
      keyRotationDays: 90,
      regions: {
        us: { keyConfigured: true, sourceHash: 'a'.repeat(64), lastVerifiedAt: '2026-05-20T00:00:00.000Z', rawKeyId: 'kms-key-123' },
        eu: { keyConfigured: true, sourceHash: 'b'.repeat(64), lastVerifiedAt: '2026-05-20T00:00:00.000Z' },
        in: { keyConfigured: true, sourceHash: 'c'.repeat(64), lastVerifiedAt: '2026-05-20T00:00:00.000Z' },
      },
      storage: requiredEncryptionDatasets.map((dataset) => ({
        dataset,
        encrypted: true,
        regions,
        algorithm: 'aes-256-gcm',
        lastVerifiedAt: '2026-05-20T00:00:00.000Z',
        keyMaterial: 'secret-key-material',
      })),
      transit: {
        tlsMinVersion: '1.3',
        hstsEnabled: true,
        lastVerifiedAt: '2026-05-20T00:00:00.000Z',
      },
      backups: {
        encrypted: true,
        regions,
        lastVerifiedAt: '2026-05-20T00:00:00.000Z',
      },
      secrets: {
        manager: 'aws-secrets-manager',
        rotationDays: 90,
        lastVerifiedAt: '2026-05-20T00:00:00.000Z',
        secret: 'do-not-return',
      },
    }),
  };
}
