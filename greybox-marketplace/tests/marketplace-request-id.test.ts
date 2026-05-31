// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { startMarketplaceServer } from '../src/api/server.js';
import { InMemoryMarketplaceAuditLog } from '../src/store/auditLog.js';
import { InMemoryMarketplaceStore } from '../src/store/marketplaceStore.js';

async function startServer() {
  const store = new InMemoryMarketplaceStore({
    payoutProvider: { createTransfer: async () => { throw new Error('not used'); } },
  });
  return await startMarketplaceServer({ store, allowMockPayoutsInProduction: true });
}

test('marketplace X-Request-ID is minted when absent', async () => {
  const started = await startServer();
  try {
    const r = await fetch(`${started.url}/health`);
    assert.equal(r.status, 200);
    const id = r.headers.get('x-request-id');
    assert.ok(id);
    assert.match(id!, /^req_[0-9a-f]{16}$/u);
  } finally {
    await new Promise<void>((resolve) => started.server.close(() => resolve()));
  }
});

test('marketplace X-Request-ID is echoed back from caller', async () => {
  const started = await startServer();
  try {
    const r = await fetch(`${started.url}/health`, {
      headers: { 'x-request-id': 'req_unit_test_42' },
    });
    assert.equal(r.headers.get('x-request-id'), 'req_unit_test_42');
  } finally {
    await new Promise<void>((resolve) => started.server.close(() => resolve()));
  }
});

test('marketplace rejects malicious X-Request-ID and regenerates a clean one', async () => {
  const started = await startServer();
  try {
    const r = await fetch(`${started.url}/health`, {
      headers: { 'x-request-id': 'req_evil value; DROP TABLE users; --' },
    });
    const id = r.headers.get('x-request-id');
    assert.ok(id);
    assert.doesNotMatch(id!, /DROP TABLE/u);
    assert.match(id!, /^req_[0-9a-f]{16}$/u);
  } finally {
    await new Promise<void>((resolve) => started.server.close(() => resolve()));
  }
});

test('marketplace mutation audit records include sanitized request IDs', async () => {
  const auditLog = new InMemoryMarketplaceAuditLog();
  const store = new InMemoryMarketplaceStore({
    auditLog,
    payoutProvider: { createTransfer: async () => { throw new Error('not used'); } },
  });
  const started = await startMarketplaceServer({
    adminToken: 'marketplace-admin-token',
    store,
    allowMockPayoutsInProduction: true,
  });
  try {
    const response = await fetch(`${started.url}/v1/marketplace/creators`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-greybox-marketplace-token': 'marketplace-admin-token',
        'x-request-id': 'req_marketplace-audit-123',
      },
      body: JSON.stringify({
        id: 'creator-request-id',
        displayName: 'Traceable Creator',
        country: 'US',
        active: true,
      }),
    });

    assert.equal(response.status, 201);
    const [entry] = auditLog.list({ action: 'creator.registered' });
    assert.equal(entry?.metadata?.requestId, 'req_marketplace-audit-123');
    assert.equal(entry?.metadata?.country, 'US');
  } finally {
    await new Promise<void>((resolve) => started.server.close(() => resolve()));
  }
});
