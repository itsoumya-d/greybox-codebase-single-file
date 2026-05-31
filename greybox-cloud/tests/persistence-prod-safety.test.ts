// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  HostedProductionPersistenceError,
  assertHostedProductionPersistence,
  ephemeralStoresExplicitlyAllowed,
  hostedProductionUnsafePersistence,
  isHostedProductionEnv,
  type PersistenceSurface,
} from '../src/security/persistenceProdSafety.js';

const hostedEnv = { NODE_ENV: 'production' };
const durableInjectedEvidenceHash = 'a'.repeat(64);
const evidenceNow = '2026-05-23T00:00:00.000Z';
const freshGeneratedAt = '2026-05-22T00:00:00.000Z';
const validBreakGlassEnv = {
  GREYBOX_CLOUD_ALLOW_EPHEMERAL_STORES: '1',
  GREYBOX_CLOUD_ALLOW_EPHEMERAL_STORES_REASON: 'Incident INC-1234 durable store failover rehearsal',
  GREYBOX_CLOUD_ALLOW_EPHEMERAL_STORES_EXPIRES_AT: '2026-05-23T12:00:00.000Z',
  GREYBOX_CLOUD_ALLOW_EPHEMERAL_STORES_NOW: evidenceNow,
};
const hostedEnvWithDurableInjectedEvidence = {
  ...hostedEnv,
  GREYBOX_DURABLE_INJECTED_EVIDENCE_NOW: evidenceNow,
  GREYBOX_DURABLE_INJECTED_EVIDENCE_JSON: JSON.stringify({
    surfaces: [
      {
        surfaceId: 'audit-log',
        surfaceLabel: 'Audit log',
        status: 'ready',
        adapter: 'custom-audit-log-adapter',
        backingStore: 'postgres',
        evidenceHash: durableInjectedEvidenceHash,
        generatedAt: freshGeneratedAt,
      },
    ],
  }),
};

const durableSurfaces: PersistenceSurface[] = [
  { id: 'tenant-store', label: 'Tenant store', persistence: 'postgres' },
  { id: 'audit-log', label: 'Audit log', persistence: 'durable-injected' },
];

test('hosted production detection exempts on-prem bundles', () => {
  assert.equal(isHostedProductionEnv({ NODE_ENV: 'production' }), true);
  assert.equal(isHostedProductionEnv({ NODE_ENV: 'PRODUCTION', GREYBOX_DEPLOYMENT_MODE: 'hosted' }), true);
  assert.equal(isHostedProductionEnv({ NODE_ENV: 'production', GREYBOX_DEPLOYMENT_MODE: 'on-prem' }), false);
  assert.equal(isHostedProductionEnv({ NODE_ENV: 'development' }), false);
});

test('ephemeral store override must be explicit', () => {
  assert.equal(ephemeralStoresExplicitlyAllowed(validBreakGlassEnv), true);
  assert.equal(ephemeralStoresExplicitlyAllowed({ GREYBOX_CLOUD_ALLOW_EPHEMERAL_STORES: '1' }), false);
  assert.equal(ephemeralStoresExplicitlyAllowed({ GREYBOX_CLOUD_ALLOW_EPHEMERAL_STORES: 'true' }), false);
  assert.equal(ephemeralStoresExplicitlyAllowed({ GREYBOX_CLOUD_ALLOW_EPHEMERAL_STORES: ' 1 ' }), false);
  assert.equal(ephemeralStoresExplicitlyAllowed({
    ...validBreakGlassEnv,
    GREYBOX_CLOUD_ALLOW_EPHEMERAL_STORES_REASON: 'test',
  }), false);
  assert.equal(ephemeralStoresExplicitlyAllowed({
    ...validBreakGlassEnv,
    GREYBOX_CLOUD_ALLOW_EPHEMERAL_STORES_EXPIRES_AT: '2026-05-22T23:59:59.000Z',
  }), false);
  assert.equal(ephemeralStoresExplicitlyAllowed({
    ...validBreakGlassEnv,
    GREYBOX_CLOUD_ALLOW_EPHEMERAL_STORES_EXPIRES_AT: '2026-05-25T00:00:00.000Z',
  }), false);
});

test('hosted production guard accepts postgres or explicit durable-injected stores', () => {
  assert.doesNotThrow(() => assertHostedProductionPersistence(durableSurfaces, hostedEnvWithDurableInjectedEvidence));
});

test('hosted production guard rejects memory, file, env, injected, and unproven durable-injected control stores', () => {
  const unsafe: PersistenceSurface[] = [
    { id: 'tenant-store', label: 'Tenant store', persistence: 'memory' },
    { id: 'audit-log', label: 'Audit log', persistence: 'file' },
    { id: 'license-records', label: 'License record store', persistence: 'env' },
    { id: 'billing-ledger', label: 'Billing ledger', persistence: 'injected' },
    { id: 'custom-scim-store', label: 'Custom SCIM store', persistence: 'durable-injected' },
  ];
  assert.throws(
    () => assertHostedProductionPersistence(unsafe, hostedEnv),
    (error) => {
      assert.ok(error instanceof HostedProductionPersistenceError);
      assert.equal(error.code, 'hosted_production_persistence_not_durable');
      assert.deepEqual(error.unsafeSurfaces.map((surface) => surface.id), [
        'tenant-store',
        'audit-log',
        'license-records',
        'billing-ledger',
        'custom-scim-store',
      ]);
      assert.match(error.message, /tenant-store=memory/u);
      assert.match(error.message, /audit-log=file/u);
      assert.match(error.message, /license-records=env/u);
      assert.match(error.message, /billing-ledger=injected/u);
      assert.match(error.message, /custom-scim-store=durable-injected/u);
      assert.match(error.unsafeSurfaces.find((surface) => surface.id === 'billing-ledger')?.remediation ?? '', /without durable-store proof/u);
      assert.match(error.unsafeSurfaces.find((surface) => surface.id === 'custom-scim-store')?.remediation ?? '', /GREYBOX_DURABLE_INJECTED_EVIDENCE_JSON/u);
      return true;
    },
  );
});

test('durable-injected evidence must prove matching, fresh, durable backing evidence', () => {
  const surface: PersistenceSurface[] = [
    { id: 'audit-log', label: 'Audit log', persistence: 'durable-injected' },
  ];
  assert.throws(
    () => assertHostedProductionPersistence(surface, {
      ...hostedEnv,
      GREYBOX_DURABLE_INJECTED_EVIDENCE_JSON: JSON.stringify({
        'audit-log': {
          status: 'ready',
          surfaceLabel: 'Audit log',
          adapter: 'custom-audit-log-adapter',
          backingStore: 'file',
          evidenceHash: durableInjectedEvidenceHash,
          generatedAt: freshGeneratedAt,
        },
      }),
      GREYBOX_DURABLE_INJECTED_EVIDENCE_NOW: evidenceNow,
    }),
    HostedProductionPersistenceError,
  );
  assert.throws(
    () => assertHostedProductionPersistence(surface, {
      ...hostedEnv,
      GREYBOX_DURABLE_INJECTED_EVIDENCE_JSON: JSON.stringify({
        'audit-log': {
          status: 'ready',
          surfaceLabel: 'Audit log',
          adapter: 'custom-audit-log-adapter',
          backingStore: 'postgres',
          evidenceHash: 'not-a-sha',
          generatedAt: freshGeneratedAt,
        },
      }),
      GREYBOX_DURABLE_INJECTED_EVIDENCE_NOW: evidenceNow,
    }),
    HostedProductionPersistenceError,
  );
  assert.throws(
    () => assertHostedProductionPersistence(surface, {
      ...hostedEnv,
      GREYBOX_DURABLE_INJECTED_EVIDENCE_JSON: JSON.stringify({
        'audit-log': {
          status: 'ready',
          surfaceLabel: 'Billing ledger',
          adapter: 'custom-audit-log-adapter',
          backingStore: 'postgres',
          evidenceHash: durableInjectedEvidenceHash,
          generatedAt: freshGeneratedAt,
        },
      }),
      GREYBOX_DURABLE_INJECTED_EVIDENCE_NOW: evidenceNow,
    }),
    HostedProductionPersistenceError,
  );
  assert.throws(
    () => assertHostedProductionPersistence(surface, {
      ...hostedEnv,
      GREYBOX_DURABLE_INJECTED_EVIDENCE_JSON: JSON.stringify({
        'audit-log': {
          status: 'ready',
          surfaceLabel: 'Audit log',
          adapter: 'custom-audit-log-adapter',
          backingStore: 'postgres',
          evidenceHash: durableInjectedEvidenceHash,
          generatedAt: '2026-04-01T00:00:00.000Z',
        },
      }),
      GREYBOX_DURABLE_INJECTED_EVIDENCE_NOW: evidenceNow,
    }),
    HostedProductionPersistenceError,
  );
  assert.doesNotThrow(() => assertHostedProductionPersistence(surface, hostedEnvWithDurableInjectedEvidence));
});

test('hosted production guard is disabled for local, on-prem, and explicit break-glass mode', () => {
  const unsafe: PersistenceSurface[] = [{ id: 'billing-ledger', label: 'Billing ledger', persistence: 'file' }];
  assert.doesNotThrow(() => assertHostedProductionPersistence(unsafe, { NODE_ENV: 'development' }));
  assert.doesNotThrow(() => assertHostedProductionPersistence(unsafe, {
    NODE_ENV: 'production',
    GREYBOX_DEPLOYMENT_MODE: 'on-prem',
  }));
  assert.doesNotThrow(() => assertHostedProductionPersistence(unsafe, {
    NODE_ENV: 'production',
    ...validBreakGlassEnv,
  }));
});

test('unsafe persistence helper adds remediations without mutating input', () => {
  const surfaces: PersistenceSurface[] = [
    { id: 'privacy-requests', label: 'Privacy request store', persistence: 'memory' },
    { id: 'billing-ledger', label: 'Billing ledger', persistence: 'postgres' },
  ];
  const unsafe = hostedProductionUnsafePersistence(surfaces);
  assert.equal(unsafe.length, 1);
  assert.equal(unsafe[0]?.id, 'privacy-requests');
  assert.match(unsafe[0]?.remediation ?? '', /Privacy request store must use Postgres/u);
  assert.equal('remediation' in surfaces[0]!, false);
});
