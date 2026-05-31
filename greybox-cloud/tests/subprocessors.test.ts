// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import type http from 'node:http';
import test from 'node:test';
import {
  buildSubprocessorRegistry,
  defaultSubprocessors,
  subprocessorsFromEnv,
} from '../src/enterprise/subprocessors.js';
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

test('subprocessor registry discloses planned providers with Article 28-style change notice', () => {
  const registry = buildSubprocessorRegistry({ now: new Date('2026-05-17T00:00:00.000Z') });
  assert.equal(registry.noticePeriodDays, 30);
  assert.match(registry.disclaimer, /Production order forms/u);
  assert.ok(registry.records.length >= 8);
  assert.ok(registry.records.some((record) => record.id === 'workos' && record.purposes.includes('authentication')));
  assert.ok(registry.records.some((record) => record.id === 'stripe' && record.dataCategories.includes('billing metadata')));
  assert.ok(registry.records.every((record) => record.transferMechanisms.length > 0));
});

test('subprocessor registry supports purpose, status, and region filters', () => {
  const managedInference = buildSubprocessorRegistry({
    records: defaultSubprocessors,
    filter: { purpose: 'managed-inference', status: 'planned' },
  });
  assert.ok(managedInference.records.length >= 3);
  assert.ok(managedInference.records.every((record) => record.purposes.includes('managed-inference')));
  assert.ok(managedInference.records.every((record) => record.status === 'planned'));

  const eu = buildSubprocessorRegistry({
    records: defaultSubprocessors,
    filter: { region: 'eu' },
  });
  assert.ok(eu.records.length >= 3);
  assert.ok(eu.records.every((record) => record.regions.includes('eu')));
});

test('subprocessor registry can be overridden from environment JSON', () => {
  const records = subprocessorsFromEnv({
    GREYBOX_SUBPROCESSORS_JSON: JSON.stringify([{
      id: 'custom-dpa-provider',
      name: 'Custom DPA Provider',
      status: 'active',
      purposes: ['support', 'billing', 'unknown'],
      dataCategories: ['support tickets', 'billing contact'],
      regions: ['eu'],
      transferMechanisms: ['sccs', 'bad'],
      usedForPlans: ['enterprise', 'bogus'],
      customerConfigurable: true,
      effectiveAt: '2026-05-17T00:00:00.000Z',
      lastReviewedAt: '2026-05-17T00:00:00.000Z',
      privacyUrl: 'https://example.com/privacy',
    }]),
  });

  assert.equal(records?.length, 1);
  assert.equal(records?.[0]?.status, 'active');
  assert.deepEqual(records?.[0]?.purposes, ['support', 'billing']);
  assert.deepEqual(records?.[0]?.transferMechanisms, ['sccs']);
  assert.deepEqual(records?.[0]?.usedForPlans, ['enterprise']);
});

test('subprocessor endpoint is available for enterprise diligence without exposing secrets', async () => {
  await withServer({}, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/enterprise/subprocessors?purpose=managed-inference`);
    assert.equal(response.status, 200);
    const registry = await response.json() as {
      noticePeriodDays: number;
      records: Array<{ id: string; purposes: string[]; privacyUrl?: string; notes?: string }>;
    };
    assert.equal(registry.noticePeriodDays, 30);
    assert.ok(registry.records.length >= 3);
    assert.ok(registry.records.every((record) => record.purposes.includes('managed-inference')));
    assert.doesNotMatch(JSON.stringify(registry), /API_KEY|SECRET|TOKEN/u);
  });
});
