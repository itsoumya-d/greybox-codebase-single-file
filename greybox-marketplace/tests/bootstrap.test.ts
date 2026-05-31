// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createProductionMarketplaceStore } from '../src/bootstrap.js';

function productionDryRunBreakGlass() {
  return {
    GREYBOX_MARKETPLACE_ALLOW_PRODUCTION_DRY_RUN: '1',
    GREYBOX_MARKETPLACE_ALLOW_PRODUCTION_DRY_RUN_REASON: 'controlled payout rehearsal before Stripe Connect cutover',
    GREYBOX_MARKETPLACE_ALLOW_PRODUCTION_DRY_RUN_NOW: '2026-05-25T00:00:00.000Z',
    GREYBOX_MARKETPLACE_ALLOW_PRODUCTION_DRY_RUN_EXPIRES_AT: '2026-05-25T08:00:00.000Z',
  };
}

const STRIPE_LIVE_SECRET_KEY = 'sk_live_greyboxMarketplace0123456789abcdef';

describe('createProductionMarketplaceStore', () => {
  it('wires a LiveStripeConnectProvider when STRIPE_SECRET_KEY is set in production', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gbx-mp-bootstrap-'));
    try {
      const store = createProductionMarketplaceStore({
        env: {
          NODE_ENV: 'production',
          STRIPE_SECRET_KEY: STRIPE_LIVE_SECRET_KEY,
          STRIPE_CONNECT_DRY_RUN: '0',
          GREYBOX_MARKETPLACE_AUDIT_LOG_PATH: join(dir, 'audit.jsonl'),
          GREYBOX_MARKETPLACE_STORE_FILE: join(dir, 'marketplace.snapshot.json'),
        },
      });
      assert.ok(store);
      // Smoke: verifyAuditLog should pass on an empty log.
      const verification = (store as unknown as { verifyAuditLog: () => { valid: boolean } }).verifyAuditLog();
      assert.equal(verification.valid, true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refuses hosted production without durable store and audit evidence', () => {
    assert.throws(
      () => createProductionMarketplaceStore({
        env: {
          NODE_ENV: 'production',
          STRIPE_SECRET_KEY: STRIPE_LIVE_SECRET_KEY,
          STRIPE_CONNECT_DRY_RUN: '0',
        },
      }),
      /GREYBOX_MARKETPLACE_AUDIT_LOG_PATH/iu,
    );
    assert.throws(
      () => createProductionMarketplaceStore({
        env: {
          NODE_ENV: 'production',
          STRIPE_SECRET_KEY: STRIPE_LIVE_SECRET_KEY,
          STRIPE_CONNECT_DRY_RUN: '0',
          GREYBOX_MARKETPLACE_AUDIT_LOG_PATH: join('/tmp', 'audit.jsonl'),
        },
      }),
      /GREYBOX_MARKETPLACE_STORE_FILE/iu,
    );
  });

  it('refuses ambiguous production payout dry-run mode', () => {
    assert.throws(
      () => createProductionMarketplaceStore({
        env: {
          NODE_ENV: 'production',
          STRIPE_SECRET_KEY: STRIPE_LIVE_SECRET_KEY,
          GREYBOX_MARKETPLACE_AUDIT_LOG_PATH: join('/tmp', 'audit.jsonl'),
          GREYBOX_MARKETPLACE_STORE_FILE: join('/tmp', 'marketplace.snapshot.json'),
        },
      }),
      /STRIPE_CONNECT_DRY_RUN/iu,
    );
  });

  it('refuses hosted production with testmode or placeholder Stripe secrets', () => {
    const baseEnv = {
      NODE_ENV: 'production',
      STRIPE_CONNECT_DRY_RUN: '0',
      GREYBOX_MARKETPLACE_AUDIT_LOG_PATH: join('/tmp', 'audit.jsonl'),
      GREYBOX_MARKETPLACE_STORE_FILE: join('/tmp', 'marketplace.snapshot.json'),
    };
    assert.throws(
      () => createProductionMarketplaceStore({
        env: {
          ...baseEnv,
          STRIPE_SECRET_KEY: 'sk_test_marketplace0123456789abcdef',
        },
      }),
      /STRIPE_SECRET_KEY/iu,
    );
    assert.throws(
      () => createProductionMarketplaceStore({
        env: {
          ...baseEnv,
          STRIPE_SECRET_KEY: 'sk_live_test_abc',
        },
      }),
      /STRIPE_SECRET_KEY/iu,
    );
  });

  it('refuses to start in production without STRIPE_SECRET_KEY when dry-run is off', () => {
    assert.throws(
      () => createProductionMarketplaceStore({
        env: {
          NODE_ENV: 'production',
          STRIPE_CONNECT_DRY_RUN: '0',
        },
      }),
      /Stripe|production|payoutProvider|refused/iu,
    );
  });

  it('refuses production payout dry-run without a rehearsal break-glass flag', () => {
    assert.throws(
      () => createProductionMarketplaceStore({
        env: {
          NODE_ENV: 'production',
          STRIPE_SECRET_KEY: STRIPE_LIVE_SECRET_KEY,
          STRIPE_CONNECT_DRY_RUN: '1',
          GREYBOX_MARKETPLACE_AUDIT_LOG_PATH: join('/tmp', 'audit.jsonl'),
          GREYBOX_MARKETPLACE_STORE_FILE: join('/tmp', 'marketplace.snapshot.json'),
        },
      }),
      /GREYBOX_MARKETPLACE_ALLOW_PRODUCTION_DRY_RUN/iu,
    );
  });

  it('allows production payout dry-run only with a reasoned time-bound rehearsal break-glass', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gbx-mp-bootstrap-dry-run-'));
    try {
      const store = createProductionMarketplaceStore({
        env: {
          NODE_ENV: 'production',
          STRIPE_SECRET_KEY: STRIPE_LIVE_SECRET_KEY,
          STRIPE_CONNECT_DRY_RUN: '1',
          ...productionDryRunBreakGlass(),
          GREYBOX_MARKETPLACE_AUDIT_LOG_PATH: join(dir, 'audit.jsonl'),
          GREYBOX_MARKETPLACE_STORE_FILE: join(dir, 'marketplace.snapshot.json'),
        },
      });
      assert.ok(store);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects production payout dry-run break-glass without reason and expiry', () => {
    const baseEnv = {
      NODE_ENV: 'production',
      STRIPE_SECRET_KEY: STRIPE_LIVE_SECRET_KEY,
      STRIPE_CONNECT_DRY_RUN: '1',
      GREYBOX_MARKETPLACE_AUDIT_LOG_PATH: join('/tmp', 'audit.jsonl'),
      GREYBOX_MARKETPLACE_STORE_FILE: join('/tmp', 'marketplace.snapshot.json'),
    };
    assert.throws(
      () => createProductionMarketplaceStore({
        env: {
          ...baseEnv,
          GREYBOX_MARKETPLACE_ALLOW_PRODUCTION_DRY_RUN: '1',
        },
      }),
      /GREYBOX_MARKETPLACE_ALLOW_PRODUCTION_DRY_RUN_EXPIRES_AT/iu,
    );
    assert.throws(
      () => createProductionMarketplaceStore({
        env: {
          ...baseEnv,
          ...productionDryRunBreakGlass(),
          GREYBOX_MARKETPLACE_ALLOW_PRODUCTION_DRY_RUN_REASON: 'short',
        },
      }),
      /GREYBOX_MARKETPLACE_ALLOW_PRODUCTION_DRY_RUN_REASON/iu,
    );
    assert.throws(
      () => createProductionMarketplaceStore({
        env: {
          ...baseEnv,
          ...productionDryRunBreakGlass(),
          GREYBOX_MARKETPLACE_ALLOW_PRODUCTION_DRY_RUN_EXPIRES_AT: '2026-05-27T00:00:00.000Z',
        },
      }),
      /GREYBOX_MARKETPLACE_ALLOW_PRODUCTION_DRY_RUN_EXPIRES_AT/iu,
    );
  });

  it('starts in dev with an in-memory audit log when no path is provided', () => {
    const store = createProductionMarketplaceStore({
      env: { NODE_ENV: 'development' },
    });
    assert.ok(store);
  });

  it('wires payout reserve enforcement from environment before releasing payouts', async () => {
    const store = createProductionMarketplaceStore({
      env: {
        NODE_ENV: 'development',
        GREYBOX_MARKETPLACE_PAYOUT_RESERVE_MODE: 'enforce',
        GREYBOX_MARKETPLACE_AVAILABLE_RESERVE_CENTS: '0',
      },
      clock: { now: () => Date.UTC(2026, 4, 18) },
    });
    store.upsertCreator({
      id: 'creator-bootstrap-reserve',
      displayName: 'Reserve Tester',
      country: 'US',
      stripeConnectAccountId: 'acct_bootstrap_reserve',
      taxProfileId: 'tax_bootstrap_reserve',
      monthlyGmvCents: 0,
      lifetimeGmvCents: 0,
      active: true,
    });
    const { listing } = store.submitListing({
      creatorId: 'creator-bootstrap-reserve',
      title: 'Reserve-Gated Template',
      category: 'template',
      priceCents: 4_900,
      description: 'A production-ready AI-assisted Unity template with reserve-gated creator payout release.',
      licenseSummary: 'Commercial studio license for one shipped game.',
      tags: ['unity', 'reserve'],
    });

    const purchase = await store.purchaseListing({ listingId: listing.id, buyerId: 'studio-buyer' });

    assert.equal(purchase.payout.status, 'blocked');
    assert.equal(purchase.payout.reason, 'risk_reserve_reserve_shortfall');
  });

  it('persists across instances when an audit log file path is provided', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gbx-mp-bootstrap-persist-'));
    try {
      const auditPath = join(dir, 'audit.jsonl');
      const env = {
        NODE_ENV: 'development',
        GREYBOX_MARKETPLACE_AUDIT_LOG_PATH: auditPath,
      };
      const first = createProductionMarketplaceStore({ env });
      assert.ok(first);
      // A fresh instance must rehydrate the same audit log without error.
      const second = createProductionMarketplaceStore({ env });
      assert.ok(second);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
