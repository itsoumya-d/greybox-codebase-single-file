// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import type http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { FileAuditLog } from '../src/enterprise/auditLog.js';
import { createGreyboxCloudServer } from '../src/server.js';
import { TenantStore } from '../src/routers/tenants.js';
import type { InferenceRequest, InferenceResult } from '../src/types.js';

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

function inferenceBody(overrides: Partial<InferenceRequest> = {}): InferenceRequest {
  return {
    projectId: overrides.projectId ?? 'project-region',
    task: overrides.task ?? 'cheap-chat',
    messages: overrides.messages ?? [{ role: 'user', content: 'Sketch a readable pause menu.' }],
    ...overrides,
  };
}

function inferenceResult(): InferenceResult {
  return {
    provider: 'openai',
    model: 'gpt-4.1-mini',
    text: 'Use a compact three-option pause menu with resume, settings, and quit.',
    usage: { inputTokens: 12, outputTokens: 14 },
    redactedLog: {},
  };
}

const strictResidencyEnv = {
  GREYBOX_DATA_RESIDENCY_ENFORCEMENT: 'strict',
  GREYBOX_REGION_EU_BASE_URL: 'https://cloud-eu.greybox.studio',
  GREYBOX_REGION_US_BASE_URL: 'https://cloud-us.greybox.studio',
  GREYBOX_TRUST_PROXY_HEADERS: '1',
};

test('strict data residency allows managed inference on the tenant regional host', async () => {
  const tenantStore = new TenantStore();
  tenantStore.getOrCreate('tenant-eu', 'studio', { region: 'eu' });
  let calls = 0;
  await withServer({
    tenantStore,
    dataResidencyEnv: strictResidencyEnv,
    service: {
      async run() {
        calls += 1;
        return inferenceResult();
      },
    },
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/inference`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-greybox-tenant': 'tenant-eu',
        'x-greybox-tier': 'studio',
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'cloud-eu.greybox.studio',
      },
      body: JSON.stringify(inferenceBody()),
    });

    assert.equal(response.status, 200);
    assert.equal(calls, 1);
  });
});

test('strict data residency rejects managed inference on the wrong regional host', async () => {
  const tenantStore = new TenantStore();
  tenantStore.getOrCreate('tenant-eu', 'studio', { region: 'eu' });
  let calls = 0;
  await withServer({
    tenantStore,
    dataResidencyEnv: strictResidencyEnv,
    service: {
      async run() {
        calls += 1;
        return inferenceResult();
      },
    },
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/inference`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-greybox-tenant': 'tenant-eu',
        'x-greybox-tier': 'studio',
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'cloud-us.greybox.studio',
      },
      body: JSON.stringify(inferenceBody()),
    });

    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { error: 'data_residency_region_mismatch' });
    assert.equal(calls, 0);
  });
});

test('audit-mode data residency records strict-mode drift without blocking inference', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-data-residency-audit-mode-'));
  try {
    const tenantStore = new TenantStore();
    const auditLog = new FileAuditLog(dir);
    tenantStore.getOrCreate('tenant-eu', 'studio', { region: 'eu' });
    let calls = 0;
    await withServer({
      auditLog,
      tenantStore,
      dataResidencyEnv: {
        ...strictResidencyEnv,
        GREYBOX_DATA_RESIDENCY_ENFORCEMENT: 'audit',
      },
      service: {
        async run() {
          calls += 1;
          return inferenceResult();
        },
      },
    }, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/v1/inference`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-greybox-tenant': 'tenant-eu',
          'x-greybox-tier': 'studio',
          'x-forwarded-proto': 'https',
          'x-forwarded-host': 'cloud-us.greybox.studio',
        },
        body: JSON.stringify(inferenceBody()),
      });

      assert.equal(response.status, 200);
      assert.equal(calls, 1);
    });

    const entries = await auditLog.readEntries({ action: 'data_residency.runtime_checked' });
    assert.equal(entries.length, 1);
    assert.equal(entries[0]?.metadata?.result, 'allowed');
    assert.equal(entries[0]?.metadata?.mode, 'audit');
    assert.equal(entries[0]?.metadata?.enforced, false);
    assert.equal(entries[0]?.metadata?.wouldRejectInStrict, true);
    assert.equal(entries[0]?.metadata?.strictFailureCode, 'data_residency_region_mismatch');
    assert.equal(entries[0]?.metadata?.expectedOrigin, 'https://cloud-eu.greybox.studio');
    assert.equal(entries[0]?.metadata?.actualOrigin, 'https://cloud-us.greybox.studio');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('strict data residency ignores spoofed forwarded hosts unless proxy headers are trusted', async () => {
  const tenantStore = new TenantStore();
  tenantStore.getOrCreate('tenant-eu', 'studio', { region: 'eu' });
  let calls = 0;
  await withServer({
    tenantStore,
    dataResidencyEnv: {
      GREYBOX_DATA_RESIDENCY_ENFORCEMENT: 'strict',
      GREYBOX_REGION_EU_BASE_URL: 'https://cloud-eu.greybox.studio',
    },
    service: {
      async run() {
        calls += 1;
        return inferenceResult();
      },
    },
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/inference`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-greybox-tenant': 'tenant-eu',
        'x-greybox-tier': 'studio',
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'cloud-eu.greybox.studio',
      },
      body: JSON.stringify(inferenceBody()),
    });

    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { error: 'data_residency_region_mismatch' });
    assert.equal(calls, 0);
  });
});

test('strict data residency fails closed when the tenant region has no configured endpoint', async () => {
  const tenantStore = new TenantStore();
  tenantStore.getOrCreate('tenant-in', 'studio', { region: 'in' });
  await withServer({
    tenantStore,
    dataResidencyEnv: strictResidencyEnv,
    service: {
      async run() {
        return inferenceResult();
      },
    },
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/inference`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-greybox-tenant': 'tenant-in',
        'x-greybox-tier': 'studio',
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'cloud-in.greybox.studio',
      },
      body: JSON.stringify(inferenceBody()),
    });

    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'data_residency_region_not_configured' });
  });
});

test('data residency enforcement also guards OpenAI-compatible chat completions', async () => {
  const tenantStore = new TenantStore();
  tenantStore.getOrCreate('tenant-eu', 'studio', { region: 'eu' });
  let calls = 0;
  await withServer({
    tenantStore,
    dataResidencyEnv: strictResidencyEnv,
    service: {
      async run() {
        calls += 1;
        return inferenceResult();
      },
    },
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-greybox-tenant': 'tenant-eu',
        'x-greybox-tier': 'studio',
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'cloud-us.greybox.studio',
      },
      body: JSON.stringify({
        model: 'greybox-cheap-chat',
        messages: [{ role: 'user', content: 'Sketch a readable pause menu.' }],
      }),
    });

    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { error: 'data_residency_region_mismatch' });
    assert.equal(calls, 0);
  });
});

test('data residency enforcement is off by default for local and on-prem installs', async () => {
  const tenantStore = new TenantStore();
  tenantStore.getOrCreate('tenant-eu', 'studio', { region: 'eu' });
  let calls = 0;
  await withServer({
    tenantStore,
    service: {
      async run() {
        calls += 1;
        return inferenceResult();
      },
    },
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/inference`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-greybox-tenant': 'tenant-eu',
        'x-greybox-tier': 'studio',
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'cloud-us.greybox.studio',
      },
      body: JSON.stringify(inferenceBody()),
    });

    assert.equal(response.status, 200);
    assert.equal(calls, 1);
  });
});

test('runtime data residency writes sanitized audit evidence for allowed and rejected requests', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-data-residency-audit-'));
  try {
    const tenantStore = new TenantStore();
    const auditLog = new FileAuditLog(dir);
    tenantStore.getOrCreate('tenant-eu', 'studio', { region: 'eu' });
    let calls = 0;
    await withServer({
      auditLog,
      tenantStore,
      dataResidencyEnv: strictResidencyEnv,
      service: {
        async run() {
          calls += 1;
          return inferenceResult();
        },
      },
    }, async (baseUrl) => {
      const commonHeaders = {
        'content-type': 'application/json',
        'x-greybox-tenant': 'tenant-eu',
        'x-greybox-tier': 'studio',
        'x-forwarded-proto': 'https',
      };
      const secretPrompt = 'Secret unreleased boss mechanic goes here.';
      const allowed = await fetch(`${baseUrl}/v1/inference`, {
        method: 'POST',
        headers: { ...commonHeaders, 'x-forwarded-host': 'cloud-eu.greybox.studio' },
        body: JSON.stringify(inferenceBody({
          messages: [{ role: 'user', content: secretPrompt }],
        })),
      });
      const rejected = await fetch(`${baseUrl}/v1/inference`, {
        method: 'POST',
        headers: { ...commonHeaders, 'x-forwarded-host': 'cloud-us.greybox.studio' },
        body: JSON.stringify(inferenceBody({
          messages: [{ role: 'user', content: secretPrompt }],
        })),
      });

      assert.equal(allowed.status, 200);
      assert.equal(rejected.status, 409);
      assert.equal(calls, 1);
    });

    const entries = await auditLog.readEntries({ action: 'data_residency.runtime_checked' });
    assert.equal(entries.length, 2);
    assert.equal(entries[0]?.metadata?.result, 'allowed');
    assert.equal(entries[0]?.metadata?.enforced, true);
    assert.equal(entries[0]?.metadata?.tenantRegion, 'eu');
    assert.equal(entries[1]?.metadata?.result, 'rejected');
    assert.equal(entries[1]?.metadata?.code, 'data_residency_region_mismatch');
    assert.equal(entries[1]?.metadata?.actualOrigin, 'https://cloud-us.greybox.studio');
    assert.doesNotMatch(JSON.stringify(entries), /Secret unreleased boss mechanic/u);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
