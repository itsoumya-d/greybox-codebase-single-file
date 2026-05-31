// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { TenantStore } from '../src/routers/tenants.js';

test('TenantStore without rootDir keeps existing in-memory semantics', () => {
  const store = new TenantStore();
  const tenant = store.getOrCreate('tenant-a', 'indie');
  assert.equal(tenant.id, 'tenant-a');
  assert.equal(store.get('tenant-a')?.tier, 'indie');
});

test('TenantStore with rootDir persists across restart', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-tenant-store-'));
  try {
    const first = new TenantStore({ rootDir: dir });
    first.getOrCreate('acme', 'studio');
    first.getOrCreateForOrganization('org_abc', 'enterprise', { region: 'eu' });

    const snapshotPath = path.join(dir, 'tenants.json');
    const text = await readFile(snapshotPath, 'utf8');
    const json = JSON.parse(text) as {
      version: number;
      tenants: Array<{ id: string }>;
      organizationTenantIds: Array<[string, string]>;
    };
    assert.equal(json.version, 1);
    assert.ok(json.tenants.some((t) => t.id === 'acme'));
    assert.ok(json.tenants.some((t) => t.id === 'workos:org_abc'));
    assert.deepEqual(json.organizationTenantIds, [['org_abc', 'workos:org_abc']]);

    const second = new TenantStore({ rootDir: dir });
    assert.equal(second.get('acme')?.tier, 'studio');
    const orgTenant = second.getOrCreateForOrganization('org_abc');
    assert.equal(orgTenant.id, 'workos:org_abc');
    assert.equal(orgTenant.organizationId, 'org_abc');
    assert.equal(orgTenant.region, 'eu');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('TenantStore.upsert overwrites existing tenant and persists', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-tenant-upsert-'));
  try {
    const first = new TenantStore({ rootDir: dir });
    first.getOrCreate('beta', 'indie');
    first.upsert({
      id: 'beta',
      tier: 'studio',
      region: 'us',
      ssoEnabled: true,
      monthlyInputTokensIncluded: 5_000_000,
      monthlyOutputTokensIncluded: 1_000_000,
    });

    const second = new TenantStore({ rootDir: dir });
    const reloaded = second.get('beta');
    assert.equal(reloaded?.tier, 'studio');
    assert.equal(reloaded?.ssoEnabled, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('TenantStore reloads snapshots before mutating from overlapping instances', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-tenant-overlap-'));
  try {
    const first = new TenantStore({ rootDir: dir });
    const second = new TenantStore({ rootDir: dir });

    first.getOrCreate('alpha', 'indie');
    second.getOrCreate('beta', 'studio');
    first.getOrCreateForOrganization('org_acme', 'enterprise', { region: 'eu' });

    const reloaded = new TenantStore({ rootDir: dir });
    assert.equal(reloaded.get('alpha')?.tier, 'indie');
    assert.equal(reloaded.get('beta')?.tier, 'studio');
    const orgTenant = reloaded.getOrCreateForOrganization('org_acme');
    assert.equal(orgTenant.tier, 'enterprise');
    assert.equal(orgTenant.region, 'eu');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('TenantStore reloads snapshots before read-only get calls', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-tenant-read-refresh-'));
  try {
    const first = new TenantStore({ rootDir: dir });
    const second = new TenantStore({ rootDir: dir });

    first.getOrCreate('read-fresh', 'indie');
    assert.equal(second.get('read-fresh')?.tier, 'indie');

    first.upsert({
      id: 'read-fresh',
      tier: 'enterprise',
      region: 'eu',
      ssoEnabled: true,
      monthlyInputTokensIncluded: 50_000_000,
      monthlyOutputTokensIncluded: 10_000_000,
    });

    const refreshed = second.get('read-fresh');
    assert.equal(refreshed?.tier, 'enterprise');
    assert.equal(refreshed?.region, 'eu');
    assert.equal(refreshed?.ssoEnabled, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('TenantStore signs tenant snapshots when a seal key is configured', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-tenant-sealed-'));
  try {
    const seal = { keyId: 'kms/us/tenant-store', secret: 'tenant-store-secret' };
    const first = new TenantStore({ rootDir: dir, seal });
    first.getOrCreate('sealed-tenant', 'enterprise', { region: 'in' });

    const snapshotPath = path.join(dir, 'tenants.json');
    const text = await readFile(snapshotPath, 'utf8');
    const json = JSON.parse(text) as {
      seal?: { algorithm?: string; keyId?: string; signature?: string };
    };
    assert.equal(json.seal?.algorithm, 'hmac-sha256');
    assert.equal(json.seal?.keyId, 'kms/us/tenant-store');
    assert.match(json.seal?.signature ?? '', /^[a-f0-9]{64}$/u);

    const second = new TenantStore({ rootDir: dir, seal });
    assert.equal(second.get('sealed-tenant')?.region, 'in');
    assert.throws(
      () => new TenantStore({ rootDir: dir, seal: { ...seal, secret: 'wrong-secret' } }),
      /tenant snapshot seal is invalid/u,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('TenantStore reads snapshot seal keys from env by default', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-tenant-env-seal-'));
  const previousKey = process.env.GREYBOX_TENANT_STORE_SEAL_KEY;
  const previousKeyId = process.env.GREYBOX_TENANT_STORE_SEAL_KEY_ID;
  try {
    process.env.GREYBOX_TENANT_STORE_SEAL_KEY = 'env-tenant-store-secret';
    process.env.GREYBOX_TENANT_STORE_SEAL_KEY_ID = 'kms/env/tenant-store';

    const first = new TenantStore({ rootDir: dir });
    first.getOrCreate('env-sealed-tenant', 'studio');

    const snapshot = JSON.parse(await readFile(path.join(dir, 'tenants.json'), 'utf8')) as {
      seal?: { keyId?: string };
    };
    assert.equal(snapshot.seal?.keyId, 'kms/env/tenant-store');

    const second = new TenantStore({ rootDir: dir });
    assert.equal(second.get('env-sealed-tenant')?.tier, 'studio');
  } finally {
    if (previousKey === undefined) delete process.env.GREYBOX_TENANT_STORE_SEAL_KEY;
    else process.env.GREYBOX_TENANT_STORE_SEAL_KEY = previousKey;
    if (previousKeyId === undefined) delete process.env.GREYBOX_TENANT_STORE_SEAL_KEY_ID;
    else process.env.GREYBOX_TENANT_STORE_SEAL_KEY_ID = previousKeyId;
    await rm(dir, { recursive: true, force: true });
  }
});

test('TenantStore fails closed when a sealed tenant snapshot is tampered', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-tenant-tamper-'));
  try {
    const seal = { keyId: 'kms/us/tenant-store', secret: 'tenant-store-secret' };
    const first = new TenantStore({ rootDir: dir, seal });
    first.getOrCreate('tamper-me', 'indie');

    const snapshotPath = path.join(dir, 'tenants.json');
    const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8')) as {
      tenants: Array<{ id: string; tier: string }>;
    };
    snapshot.tenants[0]!.tier = 'enterprise';
    await writeFile(snapshotPath, JSON.stringify(snapshot, null, 2), 'utf8');

    assert.throws(
      () => new TenantStore({ rootDir: dir, seal }),
      /tenant snapshot seal is invalid/u,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('TenantStore ignores corrupt or future-version snapshots', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-tenant-corrupt-'));
  try {
    const snapshotPath = path.join(dir, 'tenants.json');
    const { mkdir } = await import('node:fs/promises');
    await mkdir(dir, { recursive: true });
    await writeFile(snapshotPath, JSON.stringify({ version: 99, tenants: [] }), 'utf8');

    const store = new TenantStore({ rootDir: dir });
    assert.equal(store.get('anything'), undefined);
    store.getOrCreate('fresh', 'indie');
    assert.equal(store.get('fresh')?.tier, 'indie');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
