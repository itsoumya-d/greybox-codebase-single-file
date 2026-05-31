// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { startMarketplaceServer } from '../src/index.js';
import { stripeWebhookSignatureHeader } from '../src/safety/stripeProduction.js';
import type {
  Creator,
  CreatorPayoutReadinessSafe,
  ListingReview,
  MarketplaceListing,
  MarketplaceOrder,
  MarketplaceEntitlement,
  MarketplaceEventReceipt,
  MarketplaceCatalogSearchResult,
  MarketplaceCheckoutPlan,
  MarketplaceCheckoutSessionResponse,
  MarketplaceCheckoutFulfillmentResult,
  MarketplaceBusinessModelProofExport,
  MarketplaceCreatorActivationReport,
  MarketplaceCreatorStorefront,
  MarketplaceGrowthProgress,
  MarketplaceLaunchReadinessReport,
  MarketplacePayoutReleaseResult,
  MarketplacePlatformReadinessReport,
  MarketplaceReconciliationReport,
  MarketplaceReviewDashboard,
  MarketplaceRiskEvent,
  MarketplaceRiskReserveReport,
  MarketplaceSettlementReport,
  MarketplaceStats,
  MarketplaceTaxComplianceReport,
  MarketplaceTaxPreview,
  PayoutInstruction,
  PayoutProvider,
  CreatorTaxProfileRecordResult,
  StripeConnectAccountStatusRecordResult,
  StripeConnectOnboardingLinkResult,
  TaxRecord,
} from '../src/index.js';

const ADMIN_TOKEN = 'gb_mkt_admin_live_0123456789abcdef0123456789abcdef';
const STRIPE_LIVE_SECRET_KEY = 'sk_live_greyboxMarketplace0123456789abcdef';
const STRIPE_WEBHOOK_SECRET = 'whsec_greyboxMarketplace0123456789abcdef';

function productionDryRunBreakGlass() {
  return {
    GREYBOX_MARKETPLACE_ALLOW_PRODUCTION_DRY_RUN: '1',
    GREYBOX_MARKETPLACE_ALLOW_PRODUCTION_DRY_RUN_REASON: 'controlled payout rehearsal before Stripe Connect cutover',
    GREYBOX_MARKETPLACE_ALLOW_PRODUCTION_DRY_RUN_NOW: '2026-05-25T00:00:00.000Z',
    GREYBOX_MARKETPLACE_ALLOW_PRODUCTION_DRY_RUN_EXPIRES_AT: '2026-05-25T08:00:00.000Z',
  };
}

type CreatorOverrides = Partial<Omit<Creator, 'stripeConnectAccountId' | 'taxProfileId'>> & {
  stripeConnectAccountId?: string | undefined;
  taxProfileId?: string | undefined;
};

interface ApiResult<T> {
  ok: boolean;
  status: number;
  body: T;
}

async function closeServer(server: { close(callback: (err?: Error) => void): void }): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function api<T>(baseUrl: string, path: string, init: RequestInit = {}): Promise<ApiResult<T>> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
  return {
    ok: response.ok,
    status: response.status,
    body: await response.json() as T,
  };
}

async function apiText(baseUrl: string, path: string, init: RequestInit = {}): Promise<{
  status: number;
  headers: Headers;
  body: string;
}> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
  return {
    status: response.status,
    headers: response.headers,
    body: await response.text(),
  };
}

function admin(init: RequestInit = {}): RequestInit {
  return {
    ...init,
    headers: {
      Authorization: `Bearer ${ADMIN_TOKEN}`,
      ...init.headers,
    },
  };
}

function creator(overrides: CreatorOverrides = {}): Creator {
  const hasStripeAccount = Object.hasOwn(overrides, 'stripeConnectAccountId');
  const hasTaxProfile = Object.hasOwn(overrides, 'taxProfileId');
  return {
    id: overrides.id ?? 'creator-1',
    displayName: overrides.displayName ?? 'Avery Loops',
    country: overrides.country ?? 'US',
    ...(overrides.email ? { email: overrides.email } : {}),
    ...(!hasStripeAccount || overrides.stripeConnectAccountId ? { stripeConnectAccountId: overrides.stripeConnectAccountId ?? 'acct_creator_1' } : {}),
    ...(overrides.stripeConnectOnboardingComplete !== undefined ? { stripeConnectOnboardingComplete: overrides.stripeConnectOnboardingComplete } : {}),
    ...(overrides.stripeConnectTransfersEnabled !== undefined ? { stripeConnectTransfersEnabled: overrides.stripeConnectTransfersEnabled } : {}),
    ...(overrides.stripeConnectDisabledReason ? { stripeConnectDisabledReason: overrides.stripeConnectDisabledReason } : {}),
    ...(overrides.stripeConnectStatusSyncedAt !== undefined ? { stripeConnectStatusSyncedAt: overrides.stripeConnectStatusSyncedAt } : {}),
    ...(!hasTaxProfile || overrides.taxProfileId ? { taxProfileId: overrides.taxProfileId ?? 'tax_creator_1' } : {}),
    monthlyGmvCents: overrides.monthlyGmvCents ?? 0,
    lifetimeGmvCents: overrides.lifetimeGmvCents ?? 0,
    active: overrides.active ?? true,
  };
}

function realTransferPayoutProvider(calls: { count: number } = { count: 0 }): PayoutProvider {
  return {
    async createTransfer(order, createdBy) {
      calls.count += 1;
      return {
        id: `tr_test_${order.id.replace(/[^A-Za-z0-9_]/gu, '_')}`,
        orderId: order.id,
        creatorId: createdBy.id,
        stripeConnectAccountId: createdBy.stripeConnectAccountId ?? '',
        amountCents: order.creatorNetCents,
        currency: order.currency,
        status: 'queued',
        delivery: 'manual-transfer',
        stripeTransferBalanceTransactionId: `txn_test_${order.id.replace(/[^A-Za-z0-9_]/gu, '_')}`,
      };
    },
  };
}

function signedProModuleEnvelope(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    format: 'agds-pro-module-bundle/v1',
    payloadSha256: 'a'.repeat(64),
    signature: { algorithm: 'ed25519', keyId: 'greybox-test' },
    manifest: {
      id: 'hero-shooter-toolkit',
      name: 'Hero Shooter Toolkit',
      version: '1.0.0',
      licenseTier: 'studio',
      mounts: {
        skills: [
          {
            kind: 'skill',
            id: 'hero-shooter',
            title: 'Hero Shooter Skill',
            entry: 'skills/hero-shooter/SKILL.md',
          },
        ],
        gameArtBibles: [
          {
            kind: 'game-art-bible',
            id: 'hero-shooter-art',
            title: 'Hero Shooter Art Bible',
          },
        ],
      },
    },
    ...overrides,
  };
}

test('marketplace API refuses hosted production without auth, persistence, and explicit payout mode', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-marketplace-prod-guard-'));
  try {
    const baseEnv = {
      NODE_ENV: 'production',
      STRIPE_SECRET_KEY: STRIPE_LIVE_SECRET_KEY,
      STRIPE_CONNECT_DRY_RUN: '0',
      GREYBOX_MARKETPLACE_ADMIN_TOKEN: ADMIN_TOKEN,
      GREYBOX_MARKETPLACE_STRIPE_WEBHOOK_SECRET: STRIPE_WEBHOOK_SECRET,
      GREYBOX_MARKETPLACE_STORE_FILE: path.join(dir, 'marketplace.snapshot.json'),
      GREYBOX_MARKETPLACE_AUDIT_LOG_PATH: path.join(dir, 'audit.jsonl'),
      GREYBOX_MARKETPLACE_PUBLIC_BASE_URL: 'https://marketplace.greybox.studio',
    };
    const { GREYBOX_MARKETPLACE_ADMIN_TOKEN: _adminToken, ...missingAdminEnv } = baseEnv;
    const { GREYBOX_MARKETPLACE_STRIPE_WEBHOOK_SECRET: _webhookSecret, ...missingWebhookSecretEnv } = baseEnv;
    const { GREYBOX_MARKETPLACE_STORE_FILE: _storeFile, ...missingStoreEnv } = baseEnv;
    const { GREYBOX_MARKETPLACE_AUDIT_LOG_PATH: _auditPath, ...missingAuditEnv } = baseEnv;
    const { STRIPE_CONNECT_DRY_RUN: _dryRun, ...missingDryRunEnv } = baseEnv;
    const { GREYBOX_MARKETPLACE_PUBLIC_BASE_URL: _publicBaseUrl, ...missingPublicBaseUrlEnv } = baseEnv;

    await assert.rejects(
      startMarketplaceServer({
        env: missingAdminEnv,
      }),
      /GREYBOX_MARKETPLACE_ADMIN_TOKEN/iu,
    );
    await assert.rejects(
      startMarketplaceServer({
        env: missingWebhookSecretEnv,
      }),
      /GREYBOX_MARKETPLACE_STRIPE_WEBHOOK_SECRET/iu,
    );
    await assert.rejects(
      startMarketplaceServer({
        env: {
          ...baseEnv,
          GREYBOX_MARKETPLACE_STRIPE_WEBHOOK_SECRET: 'whsec_test_abc',
        },
      }),
      /GREYBOX_MARKETPLACE_STRIPE_WEBHOOK_SECRET/iu,
    );
    await assert.rejects(
      startMarketplaceServer({
        env: {
          ...baseEnv,
          GREYBOX_MARKETPLACE_ADMIN_TOKEN: 'short-admin-token',
        },
      }),
      /non-placeholder/iu,
    );
    await assert.rejects(
      startMarketplaceServer({
        env: {
          ...baseEnv,
          GREYBOX_MARKETPLACE_ADMIN_TOKEN: 'test-marketplace-admin-token-0123456789abcdef',
        },
      }),
      /non-placeholder/iu,
    );
    await assert.rejects(
      startMarketplaceServer({
        env: {
          ...baseEnv,
          STRIPE_SECRET_KEY: 'sk_test_marketplace0123456789abcdef',
        },
      }),
      /STRIPE_SECRET_KEY/iu,
    );
    await assert.rejects(
      startMarketplaceServer({
        env: {
          ...baseEnv,
          STRIPE_SECRET_KEY: 'sk_live_test_abc',
        },
      }),
      /STRIPE_SECRET_KEY/iu,
    );
    await assert.rejects(
      startMarketplaceServer({
        env: missingStoreEnv,
      }),
      /GREYBOX_MARKETPLACE_STORE_FILE/iu,
    );
    await assert.rejects(
      startMarketplaceServer({
        env: missingAuditEnv,
      }),
      /GREYBOX_MARKETPLACE_AUDIT_LOG_PATH/iu,
    );
    await assert.rejects(
      startMarketplaceServer({
        env: missingDryRunEnv,
      }),
      /STRIPE_CONNECT_DRY_RUN/iu,
    );
    await assert.rejects(
      startMarketplaceServer({
        env: missingPublicBaseUrlEnv,
      }),
      /GREYBOX_MARKETPLACE_PUBLIC_BASE_URL/iu,
    );
    await assert.rejects(
      startMarketplaceServer({
        env: {
          ...baseEnv,
          STRIPE_CONNECT_DRY_RUN: '1',
          GREYBOX_MARKETPLACE_ALLOW_PRODUCTION_DRY_RUN: '1',
        },
      }),
      /GREYBOX_MARKETPLACE_ALLOW_PRODUCTION_DRY_RUN/iu,
    );

    const started = await startMarketplaceServer({
      env: {
        ...baseEnv,
        STRIPE_CONNECT_DRY_RUN: '1',
        ...productionDryRunBreakGlass(),
      },
    });
    await closeServer(started.server);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('marketplace API can boot hosted production from environment-backed controls', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-marketplace-prod-ready-'));
  const started = await startMarketplaceServer({
    env: {
      NODE_ENV: 'production',
      STRIPE_SECRET_KEY: STRIPE_LIVE_SECRET_KEY,
      STRIPE_CONNECT_DRY_RUN: '0',
      GREYBOX_MARKETPLACE_ADMIN_TOKEN: ADMIN_TOKEN,
      GREYBOX_MARKETPLACE_STRIPE_WEBHOOK_SECRET: STRIPE_WEBHOOK_SECRET,
      GREYBOX_MARKETPLACE_STORE_FILE: path.join(dir, 'marketplace.snapshot.json'),
      GREYBOX_MARKETPLACE_AUDIT_LOG_PATH: path.join(dir, 'audit.jsonl'),
      GREYBOX_MARKETPLACE_PUBLIC_BASE_URL: 'https://marketplace.greybox.studio',
    },
    clock: { now: () => 900 },
  });
  try {
    const deniedMetrics = await api<{ error: { code: string } }>(started.url, '/metrics');
    assert.equal(deniedMetrics.status, 401);
    assert.equal(deniedMetrics.body.error.code, 'UNAUTHORIZED');

    const metrics = await api<Record<string, unknown>>(started.url, '/metrics', admin());
    assert.equal(metrics.status, 200);

    const created = await api<{ creator: Creator }>(started.url, '/v1/marketplace/creators', admin({
      method: 'POST',
      body: JSON.stringify(creator({ id: 'creator-prod-ready' })),
    }));
    assert.equal(created.status, 201);
    assert.equal(created.body.creator.id, 'creator-prod-ready');
  } finally {
    await closeServer(started.server);
    await rm(dir, { recursive: true, force: true });
  }
});

test('marketplace API pins hosted production CORS to the public origin', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-marketplace-prod-cors-'));
  const started = await startMarketplaceServer({
    env: {
      NODE_ENV: 'production',
      STRIPE_SECRET_KEY: STRIPE_LIVE_SECRET_KEY,
      STRIPE_CONNECT_DRY_RUN: '0',
      GREYBOX_MARKETPLACE_ADMIN_TOKEN: ADMIN_TOKEN,
      GREYBOX_MARKETPLACE_STRIPE_WEBHOOK_SECRET: STRIPE_WEBHOOK_SECRET,
      GREYBOX_MARKETPLACE_STORE_FILE: path.join(dir, 'marketplace.snapshot.json'),
      GREYBOX_MARKETPLACE_AUDIT_LOG_PATH: path.join(dir, 'audit.jsonl'),
      GREYBOX_MARKETPLACE_PUBLIC_BASE_URL: 'https://marketplace.greybox.studio',
    },
  });
  try {
    const allowed = await fetch(`${started.url}/healthz`, {
      headers: { origin: 'https://marketplace.greybox.studio' },
    });
    assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://marketplace.greybox.studio');
    assert.equal(allowed.headers.get('vary'), 'Origin');

    const serverSide = await fetch(`${started.url}/healthz`);
    assert.equal(serverSide.headers.get('access-control-allow-origin'), null);

    const wrongOrigin = await fetch(`${started.url}/healthz`, {
      headers: { origin: 'https://evil.example' },
    });
    assert.equal(wrongOrigin.status, 200);
    assert.equal(wrongOrigin.headers.get('access-control-allow-origin'), null);

    const blockedPreflight = await fetch(`${started.url}/v1/marketplace/stats`, {
      method: 'OPTIONS',
      headers: {
        origin: 'https://evil.example',
        'access-control-request-method': 'GET',
        'access-control-request-headers': 'authorization',
      },
    });
    assert.equal(blockedPreflight.status, 403);
    assert.equal(blockedPreflight.headers.get('access-control-allow-origin'), null);
  } finally {
    await closeServer(started.server);
    await rm(dir, { recursive: true, force: true });
  }
});

test('marketplace API pins hosted production Checkout and Connect callbacks to the public origin', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-marketplace-prod-redirects-'));
  const started = await startMarketplaceServer({
    env: {
      NODE_ENV: 'production',
      STRIPE_SECRET_KEY: STRIPE_LIVE_SECRET_KEY,
      STRIPE_CONNECT_DRY_RUN: '0',
      GREYBOX_MARKETPLACE_ADMIN_TOKEN: ADMIN_TOKEN,
      GREYBOX_MARKETPLACE_STRIPE_WEBHOOK_SECRET: STRIPE_WEBHOOK_SECRET,
      GREYBOX_MARKETPLACE_STORE_FILE: path.join(dir, 'marketplace.snapshot.json'),
      GREYBOX_MARKETPLACE_AUDIT_LOG_PATH: path.join(dir, 'audit.jsonl'),
      GREYBOX_MARKETPLACE_PUBLIC_BASE_URL: 'https://marketplace.greybox.studio',
    },
  });
  try {
    const checkout = await api<{ error: { message: string } }>(
      started.url,
      '/v1/marketplace/checkout/session-plan',
      admin({
        method: 'POST',
        body: JSON.stringify({
          listingId: 'listing-prod-callback',
          buyerId: 'buyer-prod-callback',
          successUrl: 'https://attacker.example/success',
          cancelUrl: 'https://marketplace.greybox.studio/cancel',
        }),
      }),
    );
    assert.equal(checkout.status, 400);
    assert.match(checkout.body.error.message, /GREYBOX_MARKETPLACE_PUBLIC_BASE_URL/u);

    const onboarding = await api<{ error: { message: string } }>(
      started.url,
      '/v1/marketplace/creators/creator-prod-callback/stripe-connect/onboarding-plan',
      admin({
        method: 'POST',
        body: JSON.stringify({
          returnUrl: 'https://marketplace.greybox.studio/marketplace/stripe/return',
          refreshUrl: 'https://evil.example/marketplace/stripe/refresh',
        }),
      }),
    );
    assert.equal(onboarding.status, 400);
    assert.match(onboarding.body.error.message, /GREYBOX_MARKETPLACE_PUBLIC_BASE_URL/u);
  } finally {
    await closeServer(started.server);
    await rm(dir, { recursive: true, force: true });
  }
});

test('marketplace API verifies Stripe webhook signatures when a signing secret is configured', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-marketplace-prod-webhooks-'));
  const timestampSeconds = 1_800_000_000;
  const event = {
    id: 'evt_signed_unmatched_dispute',
    type: 'charge.dispute.created',
    data: {
      object: {
        id: 'dp_signed_unmatched',
        object: 'dispute',
        amount: 100,
        status: 'needs_response',
        payment_intent: 'pi_signed_unmatched',
      },
    },
  };
  const rawEvent = JSON.stringify(event);
  const started = await startMarketplaceServer({
    env: {
      NODE_ENV: 'production',
      STRIPE_SECRET_KEY: STRIPE_LIVE_SECRET_KEY,
      STRIPE_CONNECT_DRY_RUN: '0',
      GREYBOX_MARKETPLACE_ADMIN_TOKEN: ADMIN_TOKEN,
      GREYBOX_MARKETPLACE_STRIPE_WEBHOOK_SECRET: STRIPE_WEBHOOK_SECRET,
      GREYBOX_MARKETPLACE_STORE_FILE: path.join(dir, 'marketplace.snapshot.json'),
      GREYBOX_MARKETPLACE_AUDIT_LOG_PATH: path.join(dir, 'audit.jsonl'),
      GREYBOX_MARKETPLACE_PUBLIC_BASE_URL: 'https://marketplace.greybox.studio',
    },
    clock: { now: () => timestampSeconds * 1000 },
  });
  try {
    const missingSignature = await api<{ error: { code: string } }>(
      started.url,
      '/v1/marketplace/stripe-events/dispute',
      admin({ method: 'POST', body: rawEvent }),
    );
    assert.equal(missingSignature.status, 401);
    assert.equal(missingSignature.body.error.code, 'STRIPE_WEBHOOK_SIGNATURE_INVALID');

    const staleSignature = await api<{ error: { code: string } }>(
      started.url,
      '/v1/marketplace/stripe-events/dispute',
      admin({
        method: 'POST',
        body: rawEvent,
        headers: {
          'stripe-signature': stripeWebhookSignatureHeader({
            payload: rawEvent,
            secret: STRIPE_WEBHOOK_SECRET,
            timestampSeconds: timestampSeconds - 301,
          }),
        },
      }),
    );
    assert.equal(staleSignature.status, 401);
    assert.equal(staleSignature.body.error.code, 'STRIPE_WEBHOOK_SIGNATURE_INVALID');

    const accepted = await api<{ ok: boolean; ignored: boolean; reason: string }>(
      started.url,
      '/v1/marketplace/stripe-events/dispute',
      admin({
        method: 'POST',
        body: rawEvent,
        headers: {
          'stripe-signature': stripeWebhookSignatureHeader({
            payload: rawEvent,
            secret: STRIPE_WEBHOOK_SECRET,
            timestampSeconds,
          }),
        },
      }),
    );
    assert.equal(accepted.status, 202);
    assert.equal(accepted.body.ignored, true);
    assert.equal(accepted.body.reason, 'unmatched_stripe_event');
  } finally {
    await closeServer(started.server);
    await rm(dir, { recursive: true, force: true });
  }
});

test('marketplace API publishes clean listings, sells them, and exposes GMV stats', async () => {
  const started = await startMarketplaceServer({ adminToken: ADMIN_TOKEN, clock: { now: () => 1_000 } });
  try {
    const health = await api<{ ok: boolean; service: string }>(started.url, '/health');
    assert.equal(health.status, 200);
    assert.equal(health.body.service, 'greybox-marketplace');

    const created = await api<{ creator: Creator }>(started.url, '/v1/marketplace/creators', admin({
      method: 'POST',
      body: JSON.stringify(creator()),
    }));
    assert.equal(created.status, 201);
    assert.equal(created.body.creator.id, 'creator-1');

    const submitted = await api<{ listing: MarketplaceListing; review: ListingReview }>(
      started.url,
      '/v1/marketplace/listings',
      admin({
        method: 'POST',
        body: JSON.stringify({
          creatorId: 'creator-1',
          title: 'Readable Boss Arena Template',
          description: 'A production-ready AI-assisted template for boss arenas, stamina tells, dodge windows, lock-on HUD states, and readable phase transitions.',
          category: 'template',
          priceCents: 5_000,
          licenseSummary: 'Commercial studio license for one shipped game with royalty-free usage.',
          tags: ['boss', 'combat'],
          creatorRankByGmv: 12,
          creatorCount: 100,
        }),
      }),
    );
    assert.equal(submitted.status, 201);
    assert.equal(submitted.body.listing.status, 'published');
    assert.equal(submitted.body.review.status, 'passed');

    const listings = await api<{ listings: MarketplaceListing[] }>(
      started.url,
      '/v1/marketplace/listings?status=published',
    );
    assert.deepEqual(listings.body.listings.map((listing) => listing.id), [submitted.body.listing.id]);

    const purchased = await api<{
      order: MarketplaceOrder;
      payout: PayoutInstruction;
      taxRecord: TaxRecord;
    }>(started.url, '/v1/marketplace/orders', admin({
      method: 'POST',
      body: JSON.stringify({ listingId: submitted.body.listing.id, buyerId: 'studio-buyer' }),
    }));
    assert.equal(purchased.status, 201);
    assert.equal(purchased.body.order.grossCents, 5_000);
    assert.equal(purchased.body.payout.status, 'queued');
    assert.equal(purchased.body.taxRecord.stripeTaxDelegated, true);

    const deniedStats = await api<{ error: { code: string } }>(
      started.url,
      '/v1/marketplace/stats',
    );
    assert.equal(deniedStats.status, 401);
    assert.equal(deniedStats.body.error.code, 'UNAUTHORIZED');

    const stats = await api<{ stats: MarketplaceStats }>(started.url, '/v1/marketplace/stats', admin());
    assert.equal(stats.body.stats.gmvCents, 5_000);
    assert.equal(stats.body.stats.activeCreatorsWithSales, 1);
    assert.equal(stats.body.stats.publishedListings, 1);

    const deniedProgress = await api<{ error: { code: string } }>(
      started.url,
      '/v1/marketplace/growth-targets',
    );
    assert.equal(deniedProgress.status, 401);
    assert.equal(deniedProgress.body.error.code, 'UNAUTHORIZED');

    const progress = await api<{ progress: MarketplaceGrowthProgress }>(
      started.url,
      '/v1/marketplace/growth-targets',
      admin(),
    );
    assert.equal(progress.status, 200);
    assert.equal(progress.body.progress.targets.monthlyGmvCents, 2_500_000);
    assert.equal(progress.body.progress.targets.activeCreatorsWithSales, 50);
    assert.equal(progress.body.progress.achieved, false);
    assert.ok(progress.body.progress.shortfalls.some((shortfall) => shortfall.includes('monthly GMV')));

    const deniedActivation = await api<{ error: { code: string } }>(
      started.url,
      '/v1/marketplace/creator-activation?monthlyGmvCents=5000',
    );
    assert.equal(deniedActivation.status, 401);
    assert.equal(deniedActivation.body.error.code, 'UNAUTHORIZED');

    const activation = await api<{ report: MarketplaceCreatorActivationReport }>(
      started.url,
      '/v1/marketplace/creator-activation?monthlyGmvCents=5000&activeCreatorsWithSales=1&minimumActiveCreators=1&repeatSellers=0',
      admin(),
    );
    assert.equal(activation.status, 200);
    assert.equal(activation.body.report.achieved, true);
    assert.equal(activation.body.report.summary.gmvCents, 5_000);
    assert.equal(activation.body.report.summary.sellingCreators, 1);
    assert.equal(activation.body.report.summary.payoutBlockedCreators, 0);
    assert.deepEqual(activation.body.report.topCreators.map((creator) => creator.creatorId), ['creator-1']);
    assert.deepEqual(activation.body.report.shortfalls, []);
    assert.equal(JSON.stringify(activation.body).includes(ADMIN_TOKEN), false);
    assert.equal(JSON.stringify(activation.body).includes('acct_creator_1'), false);
    assert.equal(JSON.stringify(activation.body).includes('tax_creator_1'), false);
    assert.equal(JSON.stringify(activation.body).includes('studio-buyer'), false);

    const settlement = await api<{ report: MarketplaceSettlementReport }>(
      started.url,
      '/v1/marketplace/settlements?creatorId=creator-1&from=0&to=2000',
      admin(),
    );
    assert.equal(settlement.status, 200);
    assert.equal(settlement.body.report.summary.orders, 1);
    assert.equal(settlement.body.report.summary.grossCents, 5_000);
    assert.equal(settlement.body.report.summary.platformFeeCents, 750);
    assert.equal(settlement.body.report.creators[0]?.creatorId, 'creator-1');
    assert.equal(settlement.body.report.creators[0]?.hasStripeConnectAccount, true);
    assert.equal(settlement.body.report.creators[0]?.hasTaxProfile, true);
    assert.equal(settlement.body.report.lines[0]?.orderId, purchased.body.order.id);
    assert.equal(settlement.body.report.lines[0]?.payoutStatus, 'queued');
    assert.equal(JSON.stringify(settlement.body).includes('acct_creator_1'), false);
    assert.equal(JSON.stringify(settlement.body).includes('tax_creator_1'), false);

    const settlementCsv = await apiText(
      started.url,
      '/v1/marketplace/settlements?creatorId=creator-1&format=csv',
      admin(),
    );
    assert.equal(settlementCsv.status, 200);
    assert.match(settlementCsv.headers.get('content-type') ?? '', /text\/csv/u);
    assert.match(settlementCsv.body, /^order_id,created_at,creator_id/u);
    assert.match(settlementCsv.body, /order-1,1000,creator-1,Avery Loops,listing-1,Readable Boss Arena Template/u);
    assert.equal(settlementCsv.body.includes(ADMIN_TOKEN), false);
  } finally {
    await closeServer(started.server);
  }
});

test('marketplace API creates a Stripe Checkout Session URL for ready listings', async () => {
  let submittedIdempotencyKey = '';
  const started = await startMarketplaceServer({
    adminToken: ADMIN_TOKEN,
    checkoutClient: {
      async createSession(request) {
        submittedIdempotencyKey = request.idempotencyKey;
        assert.equal(request.endpoint, '/v1/checkout/sessions');
        assert.equal(request.body.payment_intent_data.transfer_data.destination, 'acct_creator_1');
        assert.equal(request.body.metadata.greybox_buyer_id, 'studio-buyer');
        return {
          id: 'cs_test_marketplace_ready',
          url: 'https://checkout.stripe.com/c/pay/cs_test_marketplace_ready',
          livemode: false,
          expiresAt: 1_800,
          paymentStatus: 'unpaid',
        };
      },
    },
    clock: { now: () => 1_100 },
  });
  try {
    await api<{ creator: Creator }>(started.url, '/v1/marketplace/creators', admin({
      method: 'POST',
      body: JSON.stringify(creator()),
    }));
    const submitted = await api<{ listing: MarketplaceListing; review: ListingReview }>(
      started.url,
      '/v1/marketplace/listings',
      admin({
        method: 'POST',
        body: JSON.stringify({
          creatorId: 'creator-1',
          title: 'Soulslike Combat Pack',
          description: 'AI-assisted enemy tuning loops, readable attack tells, stamina windows, and boss pacing.',
          category: 'custom-skill',
          priceCents: 7_900,
          licenseSummary: 'Commercial studio license for one shipped game with royalty-free usage.',
          tags: ['combat'],
        }),
      }),
    );

    const session = await api<MarketplaceCheckoutSessionResponse>(
      started.url,
      '/v1/marketplace/checkout/sessions',
      admin({
        method: 'POST',
        body: JSON.stringify({
          listingId: submitted.body.listing.id,
          buyerId: 'studio-buyer',
          successUrl: 'https://greybox.studio/marketplace/success?session_id={CHECKOUT_SESSION_ID}',
          cancelUrl: 'https://greybox.studio/marketplace/cancel',
        }),
      }),
    );

    assert.equal(session.status, 201);
    assert.equal(session.body.plan.readiness.status, 'ready');
    assert.equal(session.body.checkout.id, 'cs_test_marketplace_ready');
    assert.equal(session.body.checkout.url, 'https://checkout.stripe.com/c/pay/cs_test_marketplace_ready');
    assert.match(submittedIdempotencyKey, /^greybox-checkout-/u);
    assert.equal(JSON.stringify(session.body).includes('sk_live'), false);
  } finally {
    await closeServer(started.server);
  }
});

test('marketplace API exposes sanitized payout settlement evidence in JSON and CSV', async () => {
  const started = await startMarketplaceServer({
    adminToken: ADMIN_TOKEN,
    clock: { now: () => 1_310 },
    payoutProvider: realTransferPayoutProvider(),
  });
  try {
    await api(started.url, '/v1/marketplace/creators', admin({
      method: 'POST',
      body: JSON.stringify(creator({
        email: 'creator@example.com',
      })),
    }));
    const submitted = await api<{ listing: MarketplaceListing }>(
      started.url,
      '/v1/marketplace/listings',
      admin({
        method: 'POST',
        body: JSON.stringify({
          creatorId: 'creator-1',
          title: 'Settlement Evidence Template',
          description: 'A production-ready AI-assisted Unity template with auditable Stripe transfer payout settlement evidence.',
          category: 'template',
          priceCents: 8_000,
          licenseSummary: 'Commercial studio license for one shipped game.',
        }),
      }),
    );
    assert.equal(submitted.status, 201);
    const purchased = await api<{
      order: MarketplaceOrder;
      payout: PayoutInstruction;
    }>(started.url, '/v1/marketplace/orders', admin({
      method: 'POST',
      body: JSON.stringify({
        listingId: submitted.body.listing.id,
        buyerId: 'buyer@example.com',
      }),
    }));
    assert.equal(purchased.status, 201);
    assert.equal(purchased.body.payout.status, 'queued');
    assert.match(purchased.body.payout.id, /^tr_test_order_1$/u);

    const receipts = await api<{ eventReceipts: MarketplaceEventReceipt[] }>(
      started.url,
      `/v1/marketplace/event-receipts?kind=payout&orderId=${encodeURIComponent(purchased.body.order.id)}`,
      admin(),
    );
    assert.equal(receipts.status, 200);
    assert.equal(receipts.body.eventReceipts.length, 1);
    assert.equal(receipts.body.eventReceipts[0]?.stripeTransferId, purchased.body.payout.id);
    assert.equal(receipts.body.eventReceipts[0]?.payoutId, purchased.body.payout.id);

    const settlement = await api<{ report: MarketplaceSettlementReport }>(
      started.url,
      '/v1/marketplace/settlements?creatorId=creator-1',
      admin(),
    );
    assert.equal(settlement.status, 200);
    assert.equal(settlement.body.report.summary.settledPayoutCents, 6_800);
    assert.equal(settlement.body.report.summary.queuedPayoutCents, 0);
    assert.equal(settlement.body.report.lines[0]?.payoutStatus, 'queued');
    assert.equal(settlement.body.report.lines[0]?.payoutSettlementStatus, 'settled');
    assert.equal(settlement.body.report.lines[0]?.payoutEvidenceKind, 'stripe_transfer');
    assert.equal(settlement.body.report.lines[0]?.stripeTransferId, purchased.body.payout.id);
    const serialized = JSON.stringify(settlement.body);
    assert.equal(serialized.includes('acct_creator_1'), false);
    assert.equal(serialized.includes('creator@example.com'), false);
    assert.equal(serialized.includes('buyer@example.com'), false);
    assert.equal(serialized.includes('tax_creator_1'), false);
    assert.equal(serialized.includes(ADMIN_TOKEN), false);

    const csv = await apiText(
      started.url,
      '/v1/marketplace/settlements?creatorId=creator-1&format=csv',
      admin(),
    );
    assert.equal(csv.status, 200);
    assert.match(csv.body, /payout_settlement_status,payout_evidence_kind,payout_evidence_receipt_id,stripe_transfer_id/u);
    assert.match(csv.body, /queued,manual-transfer,6800,settled,stripe_transfer,[^,]+,tr_test_order_1,txn_test_order_1/u);
    assert.equal(csv.body.includes('acct_creator_1'), false);
    assert.equal(csv.body.includes('creator@example.com'), false);
    assert.equal(csv.body.includes('buyer@example.com'), false);
    assert.equal(csv.body.includes('tax_creator_1'), false);
    assert.equal(csv.body.includes(ADMIN_TOKEN), false);
  } finally {
    await closeServer(started.server);
  }
});

test('marketplace API releases reserve-blocked payouts once funded', async () => {
  const started = await startMarketplaceServer({
    adminToken: ADMIN_TOKEN,
    clock: { now: () => Date.UTC(2026, 4, 18) },
    payoutReservePolicy: {
      mode: 'enforce',
      availableReserveCents: 0,
    },
  });
  try {
    await api<{ creator: Creator }>(started.url, '/v1/marketplace/creators', admin({
      method: 'POST',
      body: JSON.stringify(creator()),
    }));
    const submitted = await api<{ listing: MarketplaceListing; review: ListingReview }>(
      started.url,
      '/v1/marketplace/listings',
      admin({
        method: 'POST',
        body: JSON.stringify({
          creatorId: 'creator-1',
          title: 'Reserve-Gated Unity Template',
          description: 'A production-ready AI-assisted Unity template with reserve-gated creator payout controls.',
          category: 'template',
          priceCents: 5_000,
          licenseSummary: 'Commercial studio license for one shipped game.',
          tags: ['unity', 'reserve'],
        }),
      }),
    );
    const purchased = await api<{
      order: MarketplaceOrder;
      payout: PayoutInstruction;
      taxRecord: TaxRecord;
    }>(started.url, '/v1/marketplace/orders', admin({
      method: 'POST',
      body: JSON.stringify({ listingId: submitted.body.listing.id, buyerId: 'studio-buyer' }),
    }));
    assert.equal(purchased.status, 201);
    assert.equal(purchased.body.payout.status, 'blocked');
    assert.equal(purchased.body.payout.reason, 'risk_reserve_reserve_shortfall');

    const stillHeld = await api<{ result: MarketplacePayoutReleaseResult }>(
      started.url,
      `/v1/marketplace/orders/${purchased.body.order.id}/payout-release`,
      admin({
        method: 'POST',
        body: JSON.stringify({ availableReserveCents: 0 }),
      }),
    );
    assert.equal(stillHeld.status, 409);
    assert.equal(stillHeld.body.result.released, false);
    assert.equal(stillHeld.body.result.idempotent, false);

    const released = await api<{ result: MarketplacePayoutReleaseResult }>(
      started.url,
      `/v1/marketplace/orders/${purchased.body.order.id}/payout-release`,
      admin({
        method: 'POST',
        body: JSON.stringify({ availableReserveCents: 100_000, actorId: 'ops-lead', actorType: 'admin' }),
      }),
    );
    assert.equal(released.status, 200);
    assert.equal(released.body.result.released, true);
    assert.equal(released.body.result.idempotent, false);
    assert.equal(released.body.result.previousPayout.id, purchased.body.payout.id);
    assert.equal(released.body.result.payout.status, 'queued');

    const replay = await api<{ result: MarketplacePayoutReleaseResult }>(
      started.url,
      `/v1/marketplace/orders/${purchased.body.order.id}/payout-release`,
      admin({
        method: 'POST',
        body: JSON.stringify({ availableReserveCents: 100_000, actorId: 'ops-lead', actorType: 'admin' }),
      }),
    );
    assert.equal(replay.status, 200);
    assert.equal(replay.body.result.released, true);
    assert.equal(replay.body.result.idempotent, true);
    assert.equal(replay.body.result.previousPayout.id, purchased.body.payout.id);
    assert.equal(replay.body.result.payout.id, released.body.result.payout.id);

    const metrics = await api<Record<string, unknown>>(started.url, '/metrics', admin());
    assert.equal(metrics.body['payout.release_held'], 1);
    assert.equal(metrics.body['payout.queued'], 1);

    const reconciliation = await api<{ report: MarketplaceReconciliationReport }>(
      started.url,
      '/v1/marketplace/reconciliation',
      admin(),
    );
    assert.equal(reconciliation.body.report.summary.blockedPayouts, 0);
  } finally {
    await closeServer(started.server);
  }
});

test('marketplace API keeps reserve-blocked payouts held while the order has an open dispute', async () => {
  const started = await startMarketplaceServer({
    adminToken: ADMIN_TOKEN,
    clock: { now: () => Date.UTC(2026, 4, 18) },
    payoutReservePolicy: {
      mode: 'enforce',
      availableReserveCents: 0,
    },
  });
  try {
    await api<{ creator: Creator }>(started.url, '/v1/marketplace/creators', admin({
      method: 'POST',
      body: JSON.stringify(creator()),
    }));
    const submitted = await api<{ listing: MarketplaceListing; review: ListingReview }>(
      started.url,
      '/v1/marketplace/listings',
      admin({
        method: 'POST',
        body: JSON.stringify({
          creatorId: 'creator-1',
          title: 'Dispute-Gated Unity Template',
          description: 'A production-ready AI-assisted Unity template with order-level dispute payout holds.',
          category: 'template',
          priceCents: 5_000,
          licenseSummary: 'Commercial studio license for one shipped game.',
          tags: ['unity', 'dispute'],
        }),
      }),
    );
    const purchased = await api<{
      order: MarketplaceOrder;
      payout: PayoutInstruction;
      taxRecord: TaxRecord;
    }>(started.url, '/v1/marketplace/orders', admin({
      method: 'POST',
      body: JSON.stringify({ listingId: submitted.body.listing.id, buyerId: 'studio-buyer' }),
    }));
    assert.equal(purchased.status, 201);
    assert.equal(purchased.body.payout.status, 'blocked');

    const dispute = await api<{ riskEvent: MarketplaceRiskEvent }>(
      started.url,
      '/v1/marketplace/risk-events',
      admin({
        method: 'POST',
        body: JSON.stringify({
          type: 'dispute',
          orderId: purchased.body.order.id,
          amountCents: purchased.body.order.grossCents,
          status: 'open',
          stripeDisputeId: 'dp_test_open_api_payout_release',
          reason: 'chargeback_under_review',
        }),
      }),
    );
    assert.equal(dispute.status, 201);

    const held = await api<{ result: MarketplacePayoutReleaseResult }>(
      started.url,
      `/v1/marketplace/orders/${purchased.body.order.id}/payout-release`,
      admin({
        method: 'POST',
        body: JSON.stringify({ availableReserveCents: 100_000, actorId: 'ops-lead', actorType: 'admin' }),
      }),
    );
    assert.equal(held.status, 409);
    assert.equal(held.body.result.released, false);
    assert.equal(held.body.result.releaseBlocker?.code, 'open_dispute');
    assert.equal(held.body.result.releaseBlocker?.riskEventId, dispute.body.riskEvent.id);
    assert.equal(held.body.result.payout.id, purchased.body.payout.id);

    const metrics = await api<Record<string, unknown>>(started.url, '/metrics', admin());
    assert.equal(metrics.body['payout.release_held'], 1);

    await api<{ riskEvent: MarketplaceRiskEvent }>(
      started.url,
      '/v1/marketplace/risk-events',
      admin({
        method: 'POST',
        body: JSON.stringify({
          type: 'dispute',
          orderId: purchased.body.order.id,
          amountCents: purchased.body.order.grossCents,
          status: 'won',
          stripeDisputeId: 'dp_test_open_api_payout_release',
        }),
      }),
    );

    const released = await api<{ result: MarketplacePayoutReleaseResult }>(
      started.url,
      `/v1/marketplace/orders/${purchased.body.order.id}/payout-release`,
      admin({
        method: 'POST',
        body: JSON.stringify({ availableReserveCents: 100_000, actorId: 'ops-lead', actorType: 'admin' }),
      }),
    );
    assert.equal(released.status, 200);
    assert.equal(released.body.result.released, true);
    assert.equal(released.body.result.payout.status, 'queued');
  } finally {
    await closeServer(started.server);
  }
});

test('marketplace API keeps reserve-blocked payouts held while the order has a pending refund', async () => {
  const started = await startMarketplaceServer({
    adminToken: ADMIN_TOKEN,
    clock: { now: () => Date.UTC(2026, 4, 18) },
    payoutReservePolicy: {
      mode: 'enforce',
      availableReserveCents: 0,
    },
  });
  try {
    await api<{ creator: Creator }>(started.url, '/v1/marketplace/creators', admin({
      method: 'POST',
      body: JSON.stringify(creator()),
    }));
    const submitted = await api<{ listing: MarketplaceListing; review: ListingReview }>(
      started.url,
      '/v1/marketplace/listings',
      admin({
        method: 'POST',
        body: JSON.stringify({
          creatorId: 'creator-1',
          title: 'Refund-Gated Unity Template',
          description: 'A production-ready AI-assisted Unity template with pending refund payout holds.',
          category: 'template',
          priceCents: 5_000,
          licenseSummary: 'Commercial studio license for one shipped game.',
          tags: ['unity', 'refund'],
        }),
      }),
    );
    const purchased = await api<{
      order: MarketplaceOrder;
      payout: PayoutInstruction;
      taxRecord: TaxRecord;
    }>(started.url, '/v1/marketplace/orders', admin({
      method: 'POST',
      body: JSON.stringify({ listingId: submitted.body.listing.id, buyerId: 'studio-buyer' }),
    }));
    assert.equal(purchased.status, 201);
    assert.equal(purchased.body.payout.status, 'blocked');

    const refund = await api<{ riskEvent: MarketplaceRiskEvent }>(
      started.url,
      '/v1/marketplace/risk-events',
      admin({
        method: 'POST',
        body: JSON.stringify({
          type: 'refund',
          orderId: purchased.body.order.id,
          amountCents: purchased.body.order.grossCents,
          status: 'open',
          stripeRefundId: 're_test_pending_api_payout_release',
          reason: 'requested_by_customer',
        }),
      }),
    );
    assert.equal(refund.status, 201);

    const held = await api<{ result: MarketplacePayoutReleaseResult }>(
      started.url,
      `/v1/marketplace/orders/${purchased.body.order.id}/payout-release`,
      admin({
        method: 'POST',
        body: JSON.stringify({ availableReserveCents: 100_000, actorId: 'ops-lead', actorType: 'admin' }),
      }),
    );
    assert.equal(held.status, 409);
    assert.equal(held.body.result.released, false);
    assert.equal(held.body.result.releaseBlocker?.code, 'open_refund');
    assert.equal(held.body.result.releaseBlocker?.riskEventId, refund.body.riskEvent.id);
    assert.equal(held.body.result.payout.id, purchased.body.payout.id);

    await api<{ riskEvent: MarketplaceRiskEvent }>(
      started.url,
      '/v1/marketplace/risk-events',
      admin({
        method: 'POST',
        body: JSON.stringify({
          type: 'refund',
          orderId: purchased.body.order.id,
          amountCents: purchased.body.order.grossCents,
          status: 'resolved',
          stripeRefundId: 're_test_pending_api_payout_release',
        }),
      }),
    );

    const stillHeld = await api<{ result: MarketplacePayoutReleaseResult }>(
      started.url,
      `/v1/marketplace/orders/${purchased.body.order.id}/payout-release`,
      admin({
        method: 'POST',
        body: JSON.stringify({ availableReserveCents: 100_000, actorId: 'ops-lead', actorType: 'admin' }),
      }),
    );
    assert.equal(stillHeld.status, 409);
    assert.equal(stillHeld.body.result.released, false);
    assert.equal(stillHeld.body.result.releaseBlocker, undefined);
    assert.equal(stillHeld.body.result.riskReserveReport?.ready, false);
  } finally {
    await closeServer(started.server);
  }
});

test('marketplace API exposes admin launch readiness without leaking secrets', async () => {
  const started = await startMarketplaceServer({ adminToken: ADMIN_TOKEN, clock: { now: () => 1_200 } });
  try {
    await api(started.url, '/v1/marketplace/creators', admin({
      method: 'POST',
      body: JSON.stringify(creator()),
    }));
    const submitted = await api<{ listing: MarketplaceListing }>(
      started.url,
      '/v1/marketplace/listings',
      admin({
        method: 'POST',
        body: JSON.stringify({
          creatorId: 'creator-1',
          title: 'Launch Ready Marketplace Template',
          description: 'A production-ready AI-assisted template for marketplace launch validation, payout evidence, and tax review.',
          category: 'template',
          priceCents: 5_000,
          licenseSummary: 'Commercial studio license for one shipped game.',
        }),
      }),
    );
    const purchased = await api<{ order: MarketplaceOrder }>(started.url, '/v1/marketplace/orders', admin({
      method: 'POST',
      body: JSON.stringify({
        listingId: submitted.body.listing.id,
        buyerId: 'studio-buyer',
        buyerTaxAddress: { country: 'US', postalCode: '10001' },
        stripeTaxCalculationId: 'taxcalc_launch_api_123',
        stripeTaxTransactionId: 'tax_txn_launch_api_123',
        taxAmountCents: 425,
      }),
    }));

    const denied = await api<{ error: { code: string } }>(
      started.url,
      '/v1/marketplace/launch-readiness?monthlyGmvCents=5000&activeCreatorsWithSales=1&minimumPublishedListings=1',
    );
    assert.equal(denied.status, 401);
    assert.equal(denied.body.error.code, 'UNAUTHORIZED');

    const readiness = await api<{ report: MarketplaceLaunchReadinessReport }>(
      started.url,
      '/v1/marketplace/launch-readiness?monthlyGmvCents=5000&activeCreatorsWithSales=1&minimumPublishedListings=1',
      admin(),
    );
    assert.equal(readiness.status, 200);
    assert.equal(readiness.body.report.ready, true);
    assert.equal(readiness.body.report.summary.gmvCents, 5_000);
    assert.equal(readiness.body.report.summary.publishedListings, 1);
    assert.deepEqual(readiness.body.report.checks.map((check) => check.status), ['pass', 'pass', 'pass', 'pass', 'pass']);
    assert.deepEqual(readiness.body.report.issues, []);
    assert.equal(JSON.stringify(readiness.body).includes(ADMIN_TOKEN), false);
    assert.equal(JSON.stringify(readiness.body).includes('taxcalc_launch_api_123'), false);

    const deniedPlatform = await api<{ error: { code: string } }>(
      started.url,
      '/v1/marketplace/platform-readiness?monthlyGmvCents=5000&activeSellers=1&minimumPublishedListings=1',
    );
    assert.equal(deniedPlatform.status, 401);
    assert.equal(deniedPlatform.body.error.code, 'UNAUTHORIZED');

    const platform = await api<{ report: MarketplacePlatformReadinessReport }>(
      started.url,
      '/v1/marketplace/platform-readiness?monthlyGmvCents=5000&activeSellers=1&minimumUniqueBuyers=1&minimumPublishedListings=1&repeatSellers=0&maximumTopCreatorGmvShareBps=10000&maximumTopBuyerGmvShareBps=10000&minimumCheckoutOrderShareBps=0&minimumCheckoutGmvShareBps=0&minimumSettledPayoutShareBps=0&availableReserveCents=100000',
      admin(),
    );
    assert.equal(platform.status, 200);
    assert.equal(platform.body.report.ready, true);
    assert.equal(platform.body.report.summary.gmvCents, 5_000);
    assert.equal(platform.body.report.summary.activeSellers, 1);
    assert.equal(platform.body.report.summary.uniqueBuyers, 1);
    assert.equal(platform.body.report.summary.topBuyerGmvShareBps, 10_000);
    assert.equal(platform.body.report.summary.checkoutOrders, 0);
    assert.equal(platform.body.report.summary.directOrders, 1);
    assert.equal(platform.body.report.summary.checkoutGmvCents, 0);
    assert.equal(platform.body.report.summary.directGmvCents, 5_000);
    assert.equal(platform.body.report.summary.checkoutOrderShareBps, 0);
    assert.equal(platform.body.report.summary.checkoutGmvShareBps, 0);
    assert.equal(platform.body.report.summary.settlementPayoutShareBps, 0);
    assert.equal(platform.body.report.summary.settlementReady, true);
    assert.equal(platform.body.report.summary.platformTakeRateBps, 1_500);
    assert.equal(platform.body.report.summary.riskReserveReady, true);
    assert.equal(platform.body.report.summary.reserveShortfallCents, 0);
    assert.deepEqual(platform.body.report.topSellers.map((seller) => seller.creatorId), ['creator-1']);
    assert.deepEqual(platform.body.report.checks.map((check) => check.status), ['pass', 'pass', 'pass', 'pass', 'pass', 'pass', 'pass', 'warn']);
    assert.equal(JSON.stringify(platform.body).includes(ADMIN_TOKEN), false);
    assert.equal(JSON.stringify(platform.body).includes('taxcalc_launch_api_123'), false);

    const deniedProof = await api<{ error: { code: string } }>(
      started.url,
      '/v1/marketplace/business-model-proof?monthlyGmvCents=5000&activeSellers=1&minimumPublishedListings=1',
    );
    assert.equal(deniedProof.status, 401);
    assert.equal(deniedProof.body.error.code, 'UNAUTHORIZED');

    const proof = await api<MarketplaceBusinessModelProofExport>(
      started.url,
      '/v1/marketplace/business-model-proof?monthlyGmvCents=5000&activeSellers=1&minimumUniqueBuyers=1&minimumPublishedListings=1&repeatSellers=0&maximumTopCreatorGmvShareBps=10000&maximumTopBuyerGmvShareBps=10000&minimumCheckoutOrderShareBps=0&minimumCheckoutGmvShareBps=0&minimumSettledPayoutShareBps=0&availableReserveCents=100000',
      admin(),
    );
    assert.equal(proof.status, 200);
    assert.deepEqual(proof.body.marketplace, {
      monthlyGmvUsd: 50,
      activeSellers: 1,
      uniqueBuyers: 1,
      topCreatorGmvShareBps: 10_000,
      topBuyerGmvShareBps: 10_000,
      platformReady: true,
      sourceBusinessModelReady: true,
      checkoutOrderShareBps: 0,
      checkoutGmvShareBps: 0,
      settlementReady: true,
      settlementPayoutShareBps: 0,
      payoutBlockers: 0,
      taxBlockers: 0,
      reconciliationReady: true,
      reconciliationIssues: 0,
      riskReserveReady: true,
      reserveShortfallCents: 0,
    });
    assert.equal(proof.body.source.report, 'marketplace-platform-readiness');
    assert.equal(proof.body.source.generatedAt, 1_200);
    assert.equal(proof.body.source.platformReady, true);
    assert.equal(proof.body.source.checkoutAttributionReady, true);
    assert.equal(proof.body.source.reconciliationReady, true);
    assert.equal(proof.body.source.settlementReady, true);
    assert.equal(proof.body.source.riskReserveReady, true);
    assert.equal(proof.body.source.taxReady, true);
    assert.equal(proof.body.source.payoutReady, true);
    assert.equal(proof.body.source.businessModelReady, true);
    assert.equal(JSON.stringify(proof.body).includes(ADMIN_TOKEN), false);
    assert.equal(JSON.stringify(proof.body).includes('studio-buyer'), false);
    assert.equal(JSON.stringify(proof.body).includes('taxcalc_launch_api_123'), false);
  } finally {
    await closeServer(started.server);
  }
});

test('marketplace API restores persisted orders and reconciliation after restart', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-marketplace-api-store-'));
  const persistencePath = path.join(dir, 'marketplace.snapshot.json');
  try {
    const first = await startMarketplaceServer({
      adminToken: ADMIN_TOKEN,
      persistencePath,
      clock: { now: () => 1_500 },
    });
    try {
      await api(first.url, '/v1/marketplace/creators', admin({
        method: 'POST',
        body: JSON.stringify(creator()),
      }));
      const submitted = await api<{ listing: MarketplaceListing }>(
        first.url,
        '/v1/marketplace/listings',
        admin({
          method: 'POST',
          body: JSON.stringify({
            creatorId: 'creator-1',
            title: 'Persistent Boss Arena Template',
            description: 'A production-ready AI-assisted template for restart-safe marketplace orders, payout evidence, and tax review.',
            category: 'template',
            priceCents: 5_500,
            licenseSummary: 'Commercial studio license for one shipped game.',
          }),
        }),
      );
      await api(first.url, '/v1/marketplace/orders', admin({
        method: 'POST',
        body: JSON.stringify({
          listingId: submitted.body.listing.id,
          buyerId: 'studio-buyer',
          buyerTaxAddress: { country: 'US', postalCode: '10001' },
          stripeTaxCalculationId: 'taxcalc_api_persisted_123',
          stripeTaxTransactionId: 'tax_txn_api_persisted_123',
          taxAmountCents: 468,
        }),
      }));
    } finally {
      await closeServer(first.server);
    }

    const second = await startMarketplaceServer({
      adminToken: ADMIN_TOKEN,
      persistencePath,
      clock: { now: () => 1_600 },
    });
    try {
      const stats = await api<{ stats: MarketplaceStats }>(second.url, '/v1/marketplace/stats', admin());
      assert.equal(stats.body.stats.orders, 1);
      assert.equal(stats.body.stats.gmvCents, 5_500);

      const reconciliation = await api<{ report: MarketplaceReconciliationReport }>(
        second.url,
        '/v1/marketplace/reconciliation',
        admin(),
      );
      assert.equal(reconciliation.status, 200);
      assert.equal(reconciliation.body.report.ready, true);
      assert.equal(reconciliation.body.report.summary.taxAmountCents, 468);
      assert.deepEqual(reconciliation.body.report.issues, []);
    } finally {
      await closeServer(second.server);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('marketplace API exports tax compliance summaries in JSON and CSV', async () => {
  const started = await startMarketplaceServer({
    adminToken: ADMIN_TOKEN,
    clock: { now: () => Date.UTC(2026, 0, 15) },
  });
  try {
    await api(started.url, '/v1/marketplace/creators', admin({
      method: 'POST',
      body: JSON.stringify(creator({
        email: 'creator@example.com',
        taxProfileId: undefined,
      })),
    }));
    const submitted = await api<{ listing: MarketplaceListing }>(
      started.url,
      '/v1/marketplace/listings',
      admin({
        method: 'POST',
        body: JSON.stringify({
          creatorId: 'creator-1',
          title: 'Tax Compliance Unity Template',
          description: 'A production-ready AI-assisted Unity template with Stripe Tax evidence, creator payout tracking, and engine handoff metadata.',
          category: 'template',
          priceCents: 8_000,
          licenseSummary: 'Commercial studio license for one shipped game.',
        }),
      }),
    );
    assert.equal(submitted.status, 201);
    const purchased = await api<{ order: MarketplaceOrder }>(started.url, '/v1/marketplace/orders', admin({
      method: 'POST',
      body: JSON.stringify({
        listingId: submitted.body.listing.id,
        buyerId: 'studio-buyer',
        buyerTaxAddress: { country: 'IN', postalCode: '560001' },
        stripeTaxCalculationId: 'taxcalc_api_compliance_123',
        stripeTaxTransactionId: 'tax_txn_api_compliance_123',
        taxAmountCents: 2_160,
      }),
    }));

    const denied = await api<{ error: { code: string } }>(
      started.url,
      '/v1/marketplace/tax-compliance?year=2026',
    );
    assert.equal(denied.status, 401);
    assert.equal(denied.body.error.code, 'UNAUTHORIZED');

    const compliance = await api<{ report: MarketplaceTaxComplianceReport }>(
      started.url,
      '/v1/marketplace/tax-compliance?year=2026&thresholdCents=5000',
      admin(),
    );
    assert.equal(compliance.status, 200);
    assert.equal(compliance.body.report.period?.year, 2026);
    assert.equal(compliance.body.report.operationalThresholds.us1099KGrossThresholdCents, 5_000);
    assert.equal(compliance.body.report.summary.orders, 1);
    assert.equal(compliance.body.report.summary.reportable1099KCreators, 1);
    assert.equal(compliance.body.report.summary.missingTaxProfiles, 1);
    assert.equal(compliance.body.report.creators[0]?.hasStripeConnectAccount, true);
    assert.equal(compliance.body.report.creators[0]?.hasTaxProfile, false);
    assert.equal(compliance.body.report.buyerCountries[0]?.country, 'IN');
    assert.equal(JSON.stringify(compliance.body).includes('acct_creator_1'), false);
    assert.deepEqual(compliance.body.report.issues.map((issue) => issue.code), [
      'creator_tax_profile_missing',
    ]);

    const csv = await apiText(
      started.url,
      '/v1/marketplace/tax-compliance?year=2026&thresholdCents=5000&format=csv',
      admin(),
    );
    assert.equal(csv.status, 200);
    assert.match(csv.headers.get('content-type') ?? '', /text\/csv/u);
    assert.match(csv.body, /^record_type,reference_type,reference_id/u);
    assert.match(csv.body, /creator_tax_profile_missing/u);
    assert.equal(csv.body.includes('creator@example.com'), false);
    assert.equal(csv.body.includes('560001'), false);
    assert.equal(csv.body.includes(ADMIN_TOKEN), false);
  } finally {
    await closeServer(started.server);
  }
});

test('marketplace API exposes admin risk reserve gate without leaking payment secrets', async () => {
  const started = await startMarketplaceServer({
    adminToken: ADMIN_TOKEN,
    clock: { now: () => Date.UTC(2026, 4, 18) },
  });
  try {
    await api(started.url, '/v1/marketplace/creators', admin({
      method: 'POST',
      body: JSON.stringify(creator({
        email: 'creator@example.com',
      })),
    }));
    const submitted = await api<{ listing: MarketplaceListing }>(
      started.url,
      '/v1/marketplace/listings',
      admin({
        method: 'POST',
        body: JSON.stringify({
          creatorId: 'creator-1',
          title: 'Risk Reserve Unity Template',
          description: 'A production-ready AI-assisted Unity template with payout reserve, refund, dispute, and tax evidence.',
          category: 'template',
          priceCents: 8_000,
          licenseSummary: 'Commercial studio license for one shipped game.',
        }),
      }),
    );
    const purchased = await api<{ order: MarketplaceOrder }>(started.url, '/v1/marketplace/orders', admin({
      method: 'POST',
      body: JSON.stringify({
        listingId: submitted.body.listing.id,
        buyerId: 'studio-buyer',
        buyerTaxAddress: { country: 'US', postalCode: '10001' },
        stripeTaxCalculationId: 'taxcalc_risk_api_123',
        stripeTaxTransactionId: 'tax_txn_risk_api_123',
        taxAmountCents: 640,
      }),
    }));

    const denied = await api<{ error: { code: string } }>(
      started.url,
      '/v1/marketplace/risk-reserve?availableReserveCents=100000',
    );
    assert.equal(denied.status, 401);
    assert.equal(denied.body.error.code, 'UNAUTHORIZED');

    const riskEvent = await api<{ riskEvent: MarketplaceRiskEvent }>(
      started.url,
      '/v1/marketplace/risk-events',
      admin({
        method: 'POST',
        body: JSON.stringify({
          type: 'refund',
          orderId: purchased.body.order.id,
          amountCents: 1_000,
          status: 'resolved',
          reason: 'Buyer duplicate purchase by qa@example.com from 10.0.0.42 on pi_api_risk_123 acct_creator_1',
          stripeRefundId: 're_api_risk_123',
        }),
      }),
    );
    assert.equal(riskEvent.status, 201);
    assert.equal(riskEvent.body.riskEvent.type, 'refund');
    assert.equal(riskEvent.body.riskEvent.creatorId, 'creator-1');
    assert.equal(riskEvent.body.riskEvent.reason, 'Buyer duplicate purchase by [redacted-email] from [redacted-ip] on [redacted-stripe-id] [redacted-stripe-id]');

    const riskEvents = await api<{ riskEvents: MarketplaceRiskEvent[] }>(
      started.url,
      '/v1/marketplace/risk-events?type=refund',
      admin(),
    );
    assert.deepEqual(riskEvents.body.riskEvents.map((event) => event.id), [riskEvent.body.riskEvent.id]);
    assert.doesNotMatch(JSON.stringify(riskEvents.body), /qa@example\.com|10\.0\.0\.42|pi_api_risk_123|acct_creator_1/u);

    const reserve = await api<{ report: MarketplaceRiskReserveReport }>(
      started.url,
      '/v1/marketplace/risk-reserve?availableReserveCents=0&reportedRefundsCents=2000&reportedDisputeCents=200&minimumReserveCents=0',
      admin(),
    );

    assert.equal(reserve.status, 200);
    assert.equal(reserve.body.report.ready, false);
    assert.equal(reserve.body.report.summary.gmvCents, 8_000);
    assert.equal(reserve.body.report.summary.recordedRefundsCents, 1_000);
    assert.equal(reserve.body.report.summary.reportedRefundsCents, 3_000);
    assert.ok(reserve.body.report.issues.some((issue) => issue.code === 'reserve_shortfall'));
    assert.ok(reserve.body.report.issues.some((issue) => issue.code === 'manual_transfer_exposure'));
    const serialized = JSON.stringify(reserve.body);
    assert.equal(serialized.includes('creator@example.com'), false);
    assert.equal(serialized.includes('acct_creator_1'), false);
    assert.equal(serialized.includes('tax_creator_1'), false);
    assert.equal(serialized.includes('studio-buyer'), false);
    assert.equal(serialized.includes('taxcalc_risk_api_123'), false);
  } finally {
    await closeServer(started.server);
  }
});

test('marketplace API exposes admin event receipts with Stripe replay filters', async () => {
  const now = Date.UTC(2026, 4, 18, 12);
  const started = await startMarketplaceServer({
    adminToken: ADMIN_TOKEN,
    clock: { now: () => now },
  });
  try {
    await api(started.url, '/v1/marketplace/creators', admin({
      method: 'POST',
      body: JSON.stringify(creator()),
    }));
    const listing = await api<{ listing: MarketplaceListing }>(
      started.url,
      '/v1/marketplace/listings',
      admin({
        method: 'POST',
        body: JSON.stringify({
          creatorId: 'creator-1',
          title: 'Receipt Ledger Platformer Pack',
          description: 'A Unity-ready sample pack used to rehearse Stripe refund receipt inspection.',
          category: 'template',
          priceCents: 6_000,
          licenseSummary: 'Commercial studio license for one shipped game.',
        }),
      }),
    );
    const purchased = await api<{ order: MarketplaceOrder }>(started.url, '/v1/marketplace/orders', admin({
      method: 'POST',
      body: JSON.stringify({
        listingId: listing.body.listing.id,
        buyerId: 'studio-receipts',
        buyerTaxAddress: { country: 'US', postalCode: '10001' },
        stripeTaxCalculationId: 'taxcalc_receipt_api_123',
        stripeTaxTransactionId: 'tax_txn_receipt_api_123',
        taxAmountCents: 480,
      }),
    }));

    const denied = await api<{ error: { code: string } }>(
      started.url,
      '/v1/marketplace/event-receipts',
    );
    assert.equal(denied.status, 401);
    assert.equal(denied.body.error.code, 'UNAUTHORIZED');

    const invalidKind = await api<{ error: { code: string; message: string } }>(
      started.url,
      '/v1/marketplace/event-receipts?kind=unknown',
      admin(),
    );
    assert.equal(invalidKind.status, 400);
    assert.equal(invalidKind.body.error.message, 'event receipt kind is not supported');

    const riskEvent = await api<{ riskEvent: MarketplaceRiskEvent }>(
      started.url,
      '/v1/marketplace/risk-events',
      admin({
        method: 'POST',
        body: JSON.stringify({
          type: 'refund',
          orderId: purchased.body.order.id,
          amountCents: 1_000,
          status: 'resolved',
          stripeEventId: 'evt_test_receipt_api',
          stripeRefundId: 're_test_receipt_api',
        }),
      }),
    );
    assert.equal(riskEvent.status, 201);

    const receipts = await api<{ eventReceipts: MarketplaceEventReceipt[] }>(
      started.url,
      `/v1/marketplace/event-receipts?kind=refund&orderId=${encodeURIComponent(purchased.body.order.id)}&from=${now - 1}&to=${now + 1}`,
      admin(),
    );
    assert.equal(receipts.status, 200);
    assert.equal(receipts.body.eventReceipts.length, 2);
    assert.deepEqual(receipts.body.eventReceipts.map((receipt) => receipt.source).sort(), [
      'stripe_event',
      'stripe_object',
    ]);
    const stripeObject = receipts.body.eventReceipts.find((receipt) => receipt.source === 'stripe_object');
    const stripeEvent = receipts.body.eventReceipts.find((receipt) => receipt.source === 'stripe_event');
    assert.equal(stripeObject?.receiptKey, 're_test_receipt_api');
    assert.equal(stripeObject?.lastStripeEventId, 'evt_test_receipt_api');
    assert.equal(stripeObject?.riskEventId, riskEvent.body.riskEvent.id);
    assert.equal(stripeEvent?.receiptKey, 'evt_test_receipt_api');
    assert.equal(stripeEvent?.stripeRefundId, 're_test_receipt_api');
    assert.equal(stripeEvent?.riskEventId, riskEvent.body.riskEvent.id);
  } finally {
    await closeServer(started.server);
  }
});

test('marketplace API exposes public creator storefronts without admin secrets', async () => {
  const started = await startMarketplaceServer({ adminToken: ADMIN_TOKEN, clock: { now: () => 1_700 } });
  try {
    await api(started.url, '/v1/marketplace/creators', admin({
      method: 'POST',
      body: JSON.stringify(creator({
        email: 'creator@example.com',
      })),
    }));
    const submitted = await api<{ listing: MarketplaceListing }>(
      started.url,
      '/v1/marketplace/listings',
      admin({
        method: 'POST',
        body: JSON.stringify({
          creatorId: 'creator-1',
          title: 'Storefront Unity Template',
          description: 'A production-ready AI-assisted Unity template for readable HUDs, engine handoff, and boss arena pacing.',
          category: 'template',
          priceCents: 8_000,
          licenseSummary: 'Commercial studio license for one shipped game.',
          tags: ['unity', 'boss'],
        }),
      }),
    );
    await api(started.url, '/v1/marketplace/orders', admin({
      method: 'POST',
      body: JSON.stringify({
        listingId: submitted.body.listing.id,
        buyerId: 'studio-buyer',
        buyerTaxAddress: { country: 'US', postalCode: '10001' },
        stripeTaxCalculationId: 'taxcalc_storefront_api_123',
        stripeTaxTransactionId: 'tax_txn_storefront_api_123',
        taxAmountCents: 680,
      }),
    }));

    const storefront = await api<{ storefront: MarketplaceCreatorStorefront }>(
      started.url,
      '/v1/marketplace/creators/creator-1/storefront',
    );
    assert.equal(storefront.status, 200);
    assert.equal(storefront.body.storefront.creator.displayName, 'Avery Loops');
    assert.equal(storefront.body.storefront.stats.salesCount, 1);
    assert.deepEqual(storefront.body.storefront.listings.map((listing) => listing.title), ['Storefront Unity Template']);
    assert.deepEqual(storefront.body.storefront.listings[0]?.tags, ['unity', 'boss']);

    const serialized = JSON.stringify(storefront.body);
    assert.equal(serialized.includes(ADMIN_TOKEN), false);
    assert.equal(serialized.includes('creator@example.com'), false);
    assert.equal(serialized.includes('acct_creator_1'), false);
    assert.equal(serialized.includes('tax_creator_1'), false);
    assert.equal(serialized.includes('studio-buyer'), false);
    assert.equal(serialized.includes('taxcalc_storefront_api_123'), false);
  } finally {
    await closeServer(started.server);
  }
});

test('marketplace API exposes public catalog search for published supply only', async () => {
  const started = await startMarketplaceServer({ adminToken: ADMIN_TOKEN, clock: { now: () => 1_800 } });
  try {
    await api(started.url, '/v1/marketplace/creators', admin({
      method: 'POST',
      body: JSON.stringify(creator({ email: 'creator@example.com' })),
    }));
    const submitted = await api<{ listing: MarketplaceListing }>(
      started.url,
      '/v1/marketplace/listings',
      admin({
        method: 'POST',
        body: JSON.stringify({
          creatorId: 'creator-1',
          title: 'Catalog Unity Boss Template',
          description: 'A production-ready AI-assisted Unity template for boss arenas, readable combat, and engine handoff.',
          category: 'template',
          priceCents: 8_000,
          licenseSummary: 'Commercial studio license for one shipped game.',
          tags: ['unity', 'boss'],
        }),
      }),
    );
    await api(started.url, '/v1/marketplace/listings', admin({
      method: 'POST',
      body: JSON.stringify({
        creatorId: 'creator-1',
        title: 'Catalog Pending Combat Toolkit',
        description: 'A production-ready AI-assisted custom skill for combat pacing, boss readability, and tuning.',
        category: 'custom-skill',
        priceCents: 9_900,
        licenseSummary: 'Commercial studio license for one shipped game.',
        creatorRankByGmv: 1,
        creatorCount: 20,
      }),
    }));
    await api(started.url, '/v1/marketplace/orders', admin({
      method: 'POST',
      body: JSON.stringify({
        listingId: submitted.body.listing.id,
        buyerId: 'studio-buyer',
        buyerTaxAddress: { country: 'US', postalCode: '10001' },
        stripeTaxCalculationId: 'taxcalc_catalog_api_123',
        stripeTaxTransactionId: 'tax_txn_catalog_api_123',
        taxAmountCents: 680,
      }),
    }));

    const catalog = await api<{ catalog: MarketplaceCatalogSearchResult }>(
      started.url,
      '/v1/marketplace/catalog?q=unity%20boss&tag=boss&category=template&limit=5',
    );
    assert.equal(catalog.status, 200);
    assert.equal(catalog.body.catalog.total, 1);
    assert.equal(catalog.body.catalog.listings[0]?.title, 'Catalog Unity Boss Template');
    assert.equal(catalog.body.catalog.listings[0]?.creator.displayName, 'Avery Loops');
    assert.equal(catalog.body.catalog.listings[0]?.salesCount, 1);
    assert.deepEqual(catalog.body.catalog.facets.tags, [
      { value: 'boss', count: 1 },
      { value: 'unity', count: 1 },
    ]);

    const serialized = JSON.stringify(catalog.body);
    assert.equal(serialized.includes(ADMIN_TOKEN), false);
    assert.equal(serialized.includes('creator@example.com'), false);
    assert.equal(serialized.includes('acct_creator_1'), false);
    assert.equal(serialized.includes('tax_creator_1'), false);
    assert.equal(serialized.includes('studio-buyer'), false);
    assert.equal(serialized.includes('taxcalc_catalog_api_123'), false);
    assert.equal(serialized.includes('Catalog Pending Combat Toolkit'), false);
  } finally {
    await closeServer(started.server);
  }
});

test('marketplace API exposes human review queue and approval path for top sellers', async () => {
  const started = await startMarketplaceServer({ adminToken: ADMIN_TOKEN, clock: { now: () => 2_000 } });
  try {
    await api(started.url, '/v1/marketplace/creators', admin({
      method: 'POST',
      body: JSON.stringify(creator({ monthlyGmvCents: 2_000_000 })),
    }));
    const submitted = await api<{ listing: MarketplaceListing; review: ListingReview }>(
      started.url,
      '/v1/marketplace/listings',
      admin({
        method: 'POST',
        body: JSON.stringify({
          creatorId: 'creator-1',
          title: 'Hero Shooter Ultimate Ability Skill Pack',
          description: 'A production-ready AI-assisted custom skill pack for hero shooter ability pacing, counterplay readability, ult charge loops, and role clarity.',
          category: 'custom-skill',
          priceCents: 9_900,
          licenseSummary: 'Studio seat license for shipped commercial projects.',
          creatorRankByGmv: 1,
          creatorCount: 20,
        }),
      }),
    );
    assert.equal(submitted.body.listing.status, 'pending-human-review');
    assert.equal(submitted.body.review.humanReviewRequired, true);

    const deniedQueue = await api<{ error: { code: string } }>(
      started.url,
      '/v1/marketplace/reviews?humanReviewRequired=true',
    );
    assert.equal(deniedQueue.status, 401);
    assert.equal(deniedQueue.body.error.code, 'UNAUTHORIZED');

    const queue = await api<{ reviews: ListingReview[] }>(
      started.url,
      '/v1/marketplace/reviews?humanReviewRequired=true',
      admin(),
    );
    assert.deepEqual(queue.body.reviews.map((review) => review.id), [submitted.body.review.id]);

    const deniedDashboard = await api<{ error: { code: string } }>(
      started.url,
      '/v1/marketplace/review-dashboard',
    );
    assert.equal(deniedDashboard.status, 401);
    assert.equal(deniedDashboard.body.error.code, 'UNAUTHORIZED');

    const dashboard = await api<{ dashboard: MarketplaceReviewDashboard }>(
      started.url,
      '/v1/marketplace/review-dashboard?limit=5',
      admin(),
    );
    assert.equal(dashboard.status, 200);
    assert.equal(dashboard.body.dashboard.summary.pendingHumanReviews, 1);
    assert.equal(dashboard.body.dashboard.summary.flaglessHumanReviews, 1);
    assert.deepEqual(dashboard.body.dashboard.reviews.map((review) => ({
      reviewId: review.reviewId,
      title: review.title,
      recommendedAction: review.recommendedAction,
      ageMs: review.ageMs,
    })), [{
      reviewId: submitted.body.review.id,
      title: 'Hero Shooter Ultimate Ability Skill Pack',
      recommendedAction: 'approve',
      ageMs: 0,
    }]);
    assert.doesNotMatch(JSON.stringify(dashboard.body), /production-ready AI-assisted custom skill pack/u);

    const approved = await api<{ listing: MarketplaceListing }>(
      started.url,
      `/v1/marketplace/reviews/${encodeURIComponent(submitted.body.review.id)}/approve`,
      admin({
        method: 'POST',
        body: JSON.stringify({ reviewerId: 'reviewer-1' }),
      }),
    );
    assert.equal(approved.status, 200);
    assert.equal(approved.body.listing.status, 'published');
  } finally {
    await closeServer(started.server);
  }
});

test('marketplace API publishes Pro module manifest listings without bundle payloads', async () => {
  const started = await startMarketplaceServer({ adminToken: ADMIN_TOKEN, clock: { now: () => 2_500 } });
  try {
    await api(started.url, '/v1/marketplace/creators', admin({
      method: 'POST',
      body: JSON.stringify(creator()),
    }));

    const submitted = await api<{ listing: MarketplaceListing; review: ListingReview }>(
      started.url,
      '/v1/marketplace/listings',
      admin({
        method: 'POST',
        body: JSON.stringify({
          creatorId: 'creator-1',
          title: 'Hero Shooter Toolkit',
          description: 'A signed AI-assisted Pro module for ult charge loops, class readability, counterplay, and teamfight pacing.',
          category: 'pro-module',
          priceCents: 9_900,
          licenseSummary: 'Commercial Greybox Pro module license for one studio account.',
          proModule: signedProModuleEnvelope(),
        }),
      }),
    );

    assert.equal(submitted.status, 201);
    assert.equal(submitted.body.listing.status, 'published');
    assert.equal(submitted.body.listing.proModule?.mountCount, 2);
    assert.equal(submitted.body.listing.proModule?.manifest.mounts.skills?.[0]?.id, 'hero-shooter');
    assert.deepEqual(submitted.body.listing.proModule?.entitlement, {
      sku: 'gbpro.hero-shooter-toolkit',
      licenseTier: 'studio',
      grantKey: 'pro-module:hero-shooter-toolkit',
    });

    const purchased = await api<{
      order: MarketplaceOrder;
      entitlement: MarketplaceEntitlement;
    }>(started.url, '/v1/marketplace/orders', admin({
      method: 'POST',
      body: JSON.stringify({ listingId: submitted.body.listing.id, buyerId: 'studio-buyer' }),
    }));
    assert.equal(purchased.status, 201);
    assert.equal(purchased.body.entitlement.proModule?.moduleId, 'hero-shooter-toolkit');
    assert.equal(purchased.body.entitlement.proModule?.entitlementSku, 'gbpro.hero-shooter-toolkit');
    assert.equal(purchased.body.entitlement.proModule?.entitlementGrantKey, 'pro-module:hero-shooter-toolkit');
    assert.equal(purchased.body.entitlement.proModule?.entitlementLicenseTier, 'studio');
    assert.match(purchased.body.entitlement.activation.lookupKey, /^gbx_ent_[A-Za-z0-9_-]{32}$/u);
    assert.doesNotMatch(purchased.body.entitlement.activation.lookupKey, /studio-buyer|hero-shooter-toolkit/u);

    const entitlements = await api<{ entitlements: MarketplaceEntitlement[] }>(
      started.url,
      '/v1/marketplace/entitlements?buyerId=studio-buyer',
      admin(),
    );
    assert.deepEqual(entitlements.body.entitlements.map((entitlement) => entitlement.id), [purchased.body.entitlement.id]);

    const claimed = await api<{ entitlement: MarketplaceEntitlement }>(
      started.url,
      '/v1/marketplace/entitlements/claim',
      admin({
        method: 'POST',
        body: JSON.stringify({
          lookupKey: purchased.body.entitlement.activation.lookupKey,
          licenseHash: '1'.repeat(16),
          moduleId: 'hero-shooter-toolkit',
        }),
      }),
    );
    assert.equal(claimed.status, 200);
    assert.equal(claimed.body.entitlement.activation.licenseHash, '1'.repeat(16));

    const claimedBySku = await api<{ entitlement: MarketplaceEntitlement }>(
      started.url,
      '/v1/marketplace/entitlements/claim',
      admin({
        method: 'POST',
        body: JSON.stringify({
          lookupKey: purchased.body.entitlement.activation.lookupKey,
          licenseHash: '1'.repeat(16),
          entitlementSku: 'gbpro.hero-shooter-toolkit',
        }),
      }),
    );
    assert.equal(claimedBySku.status, 200);
    assert.equal(claimedBySku.body.entitlement.proModule?.entitlementGrantKey, 'pro-module:hero-shooter-toolkit');

    const byLookupKey = await api<{ entitlements: MarketplaceEntitlement[] }>(
      started.url,
      `/v1/marketplace/entitlements?lookupKey=${encodeURIComponent(purchased.body.entitlement.activation.lookupKey)}`,
      admin(),
    );
    assert.deepEqual(byLookupKey.body.entitlements.map((entitlement) => entitlement.id), [purchased.body.entitlement.id]);

    const encoded = JSON.stringify({ listing: submitted.body.listing, entitlement: purchased.body.entitlement });
    assert.equal(encoded.includes('encryptedPayload'), false);
    assert.equal(encoded.includes('body'), false);
    assert.equal(encoded.includes('files'), false);
    assert.equal(encoded.includes('entry'), false);

    const unsafe = await api<{ error: { code: string; message: string } }>(
      started.url,
      '/v1/marketplace/listings',
      admin({
        method: 'POST',
        body: JSON.stringify({
          creatorId: 'creator-1',
          title: 'Unsafe Hero Shooter Toolkit',
          description: 'A signed AI-assisted Pro module that tries to smuggle closed payload material.',
          category: 'pro-module',
          priceCents: 9_900,
          licenseSummary: 'Commercial Greybox Pro module license for one studio account.',
          proModule: signedProModuleEnvelope({ encryptedPayload: 'ciphertext' }),
        }),
      }),
    );
    assert.equal(unsafe.status, 400);
    assert.match(unsafe.body.error.message, /encryptedPayload is not allowed/u);
  } finally {
    await closeServer(started.server);
  }
});

test('marketplace API rejects unsafe or malformed commerce requests', async () => {
  const started = await startMarketplaceServer({ adminToken: ADMIN_TOKEN, clock: { now: () => 3_000 } });
  try {
    await api(started.url, '/v1/marketplace/creators', admin({
      method: 'POST',
      body: JSON.stringify(creator()),
    }));
    const malformed = await api<{ error: { code: string; message: string } }>(
      started.url,
      '/v1/marketplace/listings',
      admin({
        method: 'POST',
        body: JSON.stringify({
          creatorId: 'creator-1',
          title: 'Bad Listing',
          description: 'Too short.',
          category: 'unsupported',
          priceCents: 100,
          licenseSummary: 'Commercial license.',
        }),
      }),
    );
    assert.equal(malformed.status, 400);
    assert.match(malformed.body.error.message, /category/u);

    const unsafe = await api<{ listing: MarketplaceListing; review: ListingReview }>(
      started.url,
      '/v1/marketplace/listings',
      admin({
        method: 'POST',
        body: JSON.stringify({
          creatorId: 'creator-1',
          title: 'Ripped From Famous Game Pack',
          description: 'This stolen asset pack is ripped from a famous game and promises guaranteed sales.',
          category: 'asset-pack',
          priceCents: 5_000,
          licenseSummary: 'Commercial license for one studio.',
        }),
      }),
    );
    assert.equal(unsafe.status, 201);
    assert.equal(unsafe.body.listing.status, 'rejected');
    assert.equal(unsafe.body.review.status, 'rejected');
    const unsafeApproval = await api<{ error: { code: string; message: string } }>(
      started.url,
      `/v1/marketplace/reviews/${encodeURIComponent(unsafe.body.review.id)}/approve`,
      admin({
        method: 'POST',
        body: JSON.stringify({ reviewerId: 'reviewer-1' }),
      }),
    );
    assert.equal(unsafeApproval.status, 400);
    assert.match(unsafeApproval.body.error.message, /rejected listing reviews cannot be approved/u);

    const offPlatform = await api<{ listing: MarketplaceListing; review: ListingReview }>(
      started.url,
      '/v1/marketplace/listings',
      admin({
        method: 'POST',
        body: JSON.stringify({
          creatorId: 'creator-1',
          title: 'Unity Boss Arena Template',
          description: 'A production-ready AI-assisted Unity boss arena template with readable attack tells, encounter pacing, arena hazards, and HUD states. Contact me at creator@example.com for Paypal checkout.',
          category: 'template',
          priceCents: 8_000,
          licenseSummary: 'Commercial license for one studio.',
        }),
      }),
    );
    assert.equal(offPlatform.status, 201);
    assert.equal(offPlatform.body.listing.status, 'pending-human-review');
    assert.equal(offPlatform.body.review.status, 'human-required');
    assert.equal(offPlatform.body.review.flags.some((flag) => flag.id === 'off-platform-contact'), true);
    assert.doesNotMatch(JSON.stringify(offPlatform.body.review), /creator@example\.com/u);
    assert.match(JSON.stringify(offPlatform.body.review), /\[redacted-email\]|paypal/u);

    const malformedClaim = await api<{ error: { code: string; message: string } }>(
      started.url,
      '/v1/marketplace/entitlements/claim',
      admin({
        method: 'POST',
        body: JSON.stringify({
          lookupKey: 'gbx_ent_bad',
          licenseHash: '1'.repeat(16),
          moduleId: 'hero-shooter-toolkit',
        }),
      }),
    );
    assert.equal(malformedClaim.status, 400);
    assert.match(malformedClaim.body.error.message, /lookupKey/u);
  } finally {
    await closeServer(started.server);
  }
});

test('marketplace API write routes require an admin token', async () => {
  const started = await startMarketplaceServer({ adminToken: ADMIN_TOKEN, clock: { now: () => 4_000 } });
  try {
    const denied = await api<{ error: { code: string; message: string } }>(
      started.url,
      '/v1/marketplace/creators',
      {
        method: 'POST',
        body: JSON.stringify(creator()),
      },
    );
    assert.equal(denied.status, 401);
    assert.equal(denied.body.error.code, 'UNAUTHORIZED');

    const deniedPrivateListings = await api<{ error: { code: string; message: string } }>(
      started.url,
      '/v1/marketplace/listings',
    );
    assert.equal(deniedPrivateListings.status, 401);
    assert.equal(deniedPrivateListings.body.error.code, 'UNAUTHORIZED');

    const unsafeToken = 'ops@example.com 10.0.0.42 sk_live_marketplace_secret Bearer marketplace-admin-0123456789abcdef';
    const rejected = await api<{ error: { code: string; message: string } }>(
      started.url,
      '/v1/marketplace/creators',
      {
        method: 'POST',
        headers: { 'x-greybox-marketplace-token': unsafeToken },
        body: JSON.stringify(creator({ id: 'creator-rejected' })),
      },
    );
    assert.equal(rejected.status, 401);
    assert.equal(rejected.body.error.code, 'UNAUTHORIZED');
    assert.doesNotMatch(JSON.stringify(rejected.body), /ops@example\.com|10\.0\.0\.42|sk_live_marketplace_secret|marketplace-admin/u);

    const accepted = await api<{ creator: Creator }>(
      started.url,
      '/v1/marketplace/creators',
      {
        method: 'POST',
        headers: { 'x-greybox-marketplace-token': ADMIN_TOKEN },
        body: JSON.stringify(creator({ id: 'creator-token-header' })),
      },
    );
    assert.equal(accepted.status, 201);
    assert.equal(accepted.body.creator.id, 'creator-token-header');
  } finally {
    await closeServer(started.server);
  }
});

test('marketplace API exposes Stripe Connect payout readiness and onboarding plan', async () => {
  const started = await startMarketplaceServer({ adminToken: ADMIN_TOKEN, clock: { now: () => 5_000 } });
  try {
    await api(started.url, '/v1/marketplace/creators', admin({
      method: 'POST',
      body: JSON.stringify(creator({
        email: 'creator@example.com',
        stripeConnectAccountId: undefined,
        taxProfileId: undefined,
      })),
    }));

    const readiness = await api<{
      readiness: {
        status: string;
        canReceivePayouts: boolean;
        nextAction: string;
        requirements: Array<{ code: string }>;
      };
    }>(
      started.url,
      '/v1/marketplace/creators/creator-1/payout-readiness',
      admin(),
    );
    assert.equal(readiness.status, 200);
    assert.equal(readiness.body.readiness.status, 'needs-onboarding');
    assert.equal(readiness.body.readiness.canReceivePayouts, false);
    assert.equal(readiness.body.readiness.nextAction, 'create_stripe_connect_account');
    assert.deepEqual(readiness.body.readiness.requirements.map((requirement) => requirement.code), [
      'stripe_connect_account_required',
      'tax_profile_required',
    ]);

    const plan = await api<{
      plan: {
        accountCreateRequest?: { endpoint: string; body: { email?: string; metadata: { greybox_creator_id: string } } };
        accountLinkRequest?: unknown;
      };
    }>(
      started.url,
      '/v1/marketplace/creators/creator-1/stripe-connect/onboarding-plan',
      admin({
        method: 'POST',
        body: JSON.stringify({
          returnUrl: 'https://greybox.studio/marketplace/stripe/return',
          refreshUrl: 'https://greybox.studio/marketplace/stripe/refresh',
        }),
      }),
    );
    assert.equal(plan.status, 200);
    assert.equal(plan.body.plan.accountCreateRequest?.endpoint, '/v1/accounts');
    assert.equal(plan.body.plan.accountCreateRequest?.body.email, 'creator@example.com');
    assert.equal(plan.body.plan.accountCreateRequest?.body.metadata.greybox_creator_id, 'creator-1');
    assert.equal(plan.body.plan.accountLinkRequest, undefined);
    assert.equal(JSON.stringify(plan.body).includes('sk_live'), false);

    const executableLink = await api<{ result: StripeConnectOnboardingLinkResult }>(
      started.url,
      '/v1/marketplace/creators/creator-1/stripe-connect/onboarding-link',
      admin({
        method: 'POST',
        body: JSON.stringify({
          returnUrl: 'https://greybox.studio/marketplace/stripe/return',
          refreshUrl: 'https://greybox.studio/marketplace/stripe/refresh',
        }),
      }),
    );
    assert.equal(executableLink.status, 201);
    assert.ok(executableLink.body.result.account?.stripeConnectAccountId.startsWith('acct_mock_creator_1'));
    assert.ok(executableLink.body.result.creator.stripeConnectAccountId?.startsWith('acct_mock_creator_1'));
    assert.equal(executableLink.body.result.creator.stripeConnectOnboardingComplete, false);
    assert.equal(executableLink.body.result.creator.stripeConnectTransfersEnabled, false);
    assert.match(executableLink.body.result.accountLink.url, /^https:\/\/connect\.stripe\.com\/setup\/e\//u);
    assert.equal(executableLink.body.result.plan.readiness.nextAction, 'complete_stripe_connect_onboarding');
    assert.equal(JSON.stringify(executableLink.body).includes('creator@example.com'), false);
    assert.equal(JSON.stringify(executableLink.body).includes('sk_live'), false);

    const blockedAfterAccountCreate = await api<{ readiness: CreatorPayoutReadinessSafe }>(
      started.url,
      '/v1/marketplace/creators/creator-1/payout-readiness',
      admin(),
    );
    assert.equal(blockedAfterAccountCreate.status, 200);
    assert.equal(blockedAfterAccountCreate.body.readiness.nextAction, 'complete_stripe_connect_onboarding');
    assert.deepEqual(blockedAfterAccountCreate.body.readiness.requirements.map((requirement) => requirement.code), [
      'stripe_connect_onboarding_required',
      'tax_profile_required',
    ]);

    const status = await api<{ result: StripeConnectAccountStatusRecordResult }>(
      started.url,
      '/v1/marketplace/creators/creator-1/stripe-connect/account-status',
      admin({
        method: 'POST',
        body: JSON.stringify({
          onboardingComplete: true,
          transfersEnabled: true,
          syncedAt: 5_002,
          actorId: 'stripe-connect-sync',
          actorType: 'system',
        }),
      }),
    );
    assert.equal(status.status, 200);
    assert.equal(status.body.result.accountStatus.onboardingComplete, true);
    assert.equal(status.body.result.accountStatus.transfersEnabled, true);
    assert.equal(status.body.result.readiness.nextAction, 'collect_tax_profile');
    assert.equal(JSON.stringify(status.body).includes('creator@example.com'), false);
    assert.equal(JSON.stringify(status.body).includes('taxprof_api_sensitive_123'), false);

    const taxProfile = await api<{ result: CreatorTaxProfileRecordResult }>(
      started.url,
      '/v1/marketplace/creators/creator-1/tax-profile',
      admin({
        method: 'POST',
        body: JSON.stringify({
          taxProfileId: 'taxprof_api_sensitive_123',
          provider: 'stripe-tax',
          country: 'US',
          collectedAt: 5_001,
          actorId: 'finance-admin',
          actorType: 'admin',
        }),
      }),
    );
    assert.equal(taxProfile.status, 200);
    assert.equal(taxProfile.body.result.creator.hasTaxProfile, true);
    assert.equal(taxProfile.body.result.readiness.status, 'ready');
    assert.equal(taxProfile.body.result.taxProfile.referencePresent, true);
    assert.equal(JSON.stringify(taxProfile.body).includes('taxprof_api_sensitive_123'), false);

    await api(started.url, '/v1/marketplace/creators', admin({
      method: 'POST',
      body: JSON.stringify(creator({
        stripeConnectAccountId: 'acct_creator_1',
        taxProfileId: undefined,
      })),
    }));
    const linkPlan = await api<{
      plan: {
        accountLinkRequest?: { endpoint: string; body: { account: string; return_url: string } };
      };
    }>(
      started.url,
      '/v1/marketplace/creators/creator-1/stripe-connect/onboarding-plan',
      admin({
        method: 'POST',
        body: JSON.stringify({
          returnUrl: 'https://greybox.studio/marketplace/stripe/return',
          refreshUrl: 'https://greybox.studio/marketplace/stripe/refresh',
        }),
      }),
    );
    assert.equal(linkPlan.status, 200);
    assert.equal(linkPlan.body.plan.accountLinkRequest?.endpoint, '/v1/account_links');
    assert.equal(linkPlan.body.plan.accountLinkRequest?.body.account, 'acct_creator_1');
    assert.equal(linkPlan.body.plan.accountLinkRequest?.body.return_url, 'https://greybox.studio/marketplace/stripe/return');
  } finally {
    await closeServer(started.server);
  }
});

test('marketplace API prepares Stripe Tax calculation preview and persists calculation evidence on orders', async () => {
  const started = await startMarketplaceServer({ adminToken: ADMIN_TOKEN, clock: { now: () => 6_000 } });
  try {
    await api(started.url, '/v1/marketplace/creators', admin({
      method: 'POST',
      body: JSON.stringify(creator()),
    }));
    const submitted = await api<{ listing: MarketplaceListing; review: ListingReview }>(
      started.url,
      '/v1/marketplace/listings',
      admin({
        method: 'POST',
        body: JSON.stringify({
          creatorId: 'creator-1',
          title: 'Taxable Unity Export Template',
          description: 'A production-ready AI-assisted template for Unity export setup, readable HUD states, and engine handoff.',
          category: 'template',
          priceCents: 8_000,
          licenseSummary: 'Commercial studio license for one shipped game.',
        }),
      }),
    );
    assert.equal(submitted.body.listing.status, 'published');

    const missingAddress = await api<{ preview: MarketplaceTaxPreview }>(
      started.url,
      '/v1/marketplace/tax/preview',
      admin({
        method: 'POST',
        body: JSON.stringify({
          listingId: submitted.body.listing.id,
          buyerId: 'studio-buyer',
        }),
      }),
    );
    assert.equal(missingAddress.status, 200);
    assert.equal(missingAddress.body.preview.readiness.status, 'needs-customer-address');

    const preview = await api<{ preview: MarketplaceTaxPreview }>(
      started.url,
      '/v1/marketplace/tax/preview',
      admin({
        method: 'POST',
        body: JSON.stringify({
          listingId: submitted.body.listing.id,
          buyerId: 'studio-buyer',
          buyerTaxAddress: {
            country: 'US',
            postalCode: '10001',
            state: 'NY',
          },
        }),
      }),
    );
    assert.equal(preview.status, 200);
    assert.equal(preview.body.preview.readiness.status, 'ready');
    assert.equal(preview.body.preview.calculationRequest?.endpoint, '/v1/tax/calculations');
    assert.equal(preview.body.preview.calculationRequest?.body.line_items[0]?.tax_code, 'txcd_10000000');
    assert.equal(preview.body.preview.calculationRequest?.body.customer_details.address.postal_code, '10001');

    const purchased = await api<{
      order: MarketplaceOrder;
      taxRecord: TaxRecord;
    }>(started.url, '/v1/marketplace/orders', admin({
      method: 'POST',
      body: JSON.stringify({
        listingId: submitted.body.listing.id,
        buyerId: 'studio-buyer',
        buyerTaxAddress: {
          country: 'US',
          postalCode: '10001',
        },
        stripeTaxCalculationId: 'taxcalc_order_123',
        stripeTaxTransactionId: 'tax_txn_123',
        taxAmountCents: 710,
      }),
    }));
    assert.equal(purchased.status, 201);
    assert.equal(purchased.body.taxRecord.stripeTaxCode, 'txcd_10000000');
    assert.equal(purchased.body.taxRecord.stripeTaxCalculationId, 'taxcalc_order_123');
    assert.equal(purchased.body.taxRecord.taxAmountCents, 710);
    assert.equal(purchased.body.taxRecord.calculationRequest?.body.metadata.greybox_buyer_id, 'studio-buyer');
    assert.equal(purchased.body.taxRecord.transactionRequest?.endpoint, '/v1/tax/transactions/create_from_calculation');
    assert.equal(JSON.stringify(purchased.body).includes('sk_live'), false);
  } finally {
    await closeServer(started.server);
  }
});

test('marketplace API prepares Stripe Checkout session plans without exposing secrets', async () => {
  const started = await startMarketplaceServer({ adminToken: ADMIN_TOKEN, clock: { now: () => 7_000 } });
  try {
    await api(started.url, '/v1/marketplace/creators', admin({
      method: 'POST',
      body: JSON.stringify(creator()),
    }));
    const submitted = await api<{ listing: MarketplaceListing; review: ListingReview }>(
      started.url,
      '/v1/marketplace/listings',
      admin({
        method: 'POST',
        body: JSON.stringify({
          creatorId: 'creator-1',
          title: 'Checkout Ready Unity Template',
          description: 'A production-ready AI-assisted Unity handoff template with HUD readability, import notes, and clean engine metadata.',
          category: 'template',
          priceCents: 6_000,
          licenseSummary: 'Commercial studio license for one shipped game.',
        }),
      }),
    );

    const plan = await api<{ plan: MarketplaceCheckoutPlan }>(
      started.url,
      '/v1/marketplace/checkout/session-plan',
      admin({
        method: 'POST',
        body: JSON.stringify({
          listingId: submitted.body.listing.id,
          buyerId: 'studio-buyer',
          successUrl: 'https://greybox.studio/marketplace/success?session_id={CHECKOUT_SESSION_ID}',
          cancelUrl: 'https://greybox.studio/marketplace/cancel',
        }),
      }),
    );

    assert.equal(plan.status, 200);
    assert.equal(plan.body.plan.readiness.status, 'ready');
    assert.equal(plan.body.plan.orderPreview.platformFeeCents, 900);
    assert.equal(plan.body.plan.checkoutSessionRequest?.endpoint, '/v1/checkout/sessions');
    assert.equal(plan.body.plan.checkoutSessionRequest?.body.automatic_tax.enabled, true);
    assert.equal(plan.body.plan.checkoutSessionRequest?.body.automatic_tax.liability.account, 'acct_creator_1');
    assert.equal(plan.body.plan.checkoutSessionRequest?.body.payment_intent_data.application_fee_amount, 900);
    assert.equal(plan.body.plan.checkoutSessionRequest?.body.payment_intent_data.transfer_data.destination, 'acct_creator_1');
    assert.equal(plan.body.plan.checkoutSessionRequest?.body.line_items[0]?.price_data.product_data.tax_code, 'txcd_10000000');
    assert.equal(plan.body.plan.checkoutSessionRequest?.body.metadata.greybox_listing_id, submitted.body.listing.id);
    assert.equal(JSON.stringify(plan.body).includes('sk_live'), false);

    await api(started.url, '/v1/marketplace/creators', admin({
      method: 'POST',
      body: JSON.stringify(creator({
        stripeConnectAccountId: undefined,
        taxProfileId: undefined,
      })),
    }));
    const blocked = await api<{ plan: MarketplaceCheckoutPlan }>(
      started.url,
      '/v1/marketplace/checkout/session-plan',
      admin({
        method: 'POST',
        body: JSON.stringify({
          listingId: submitted.body.listing.id,
          buyerId: 'studio-buyer',
          successUrl: 'https://greybox.studio/marketplace/success',
          cancelUrl: 'https://greybox.studio/marketplace/cancel',
        }),
      }),
    );
    assert.equal(blocked.status, 200);
    assert.equal(blocked.body.plan.readiness.status, 'blocked');
    assert.equal(blocked.body.plan.checkoutSessionRequest, undefined);
    assert.deepEqual(blocked.body.plan.readiness.requirements.map((requirement) => requirement.code), [
      'stripe_connect_account_required',
      'tax_profile_required',
    ]);
  } finally {
    await closeServer(started.server);
  }
});

test('marketplace API fulfills completed Stripe Checkout sessions idempotently', async () => {
  const started = await startMarketplaceServer({ adminToken: ADMIN_TOKEN, clock: { now: () => 8_000 } });
  try {
    await api(started.url, '/v1/marketplace/creators', admin({
      method: 'POST',
      body: JSON.stringify(creator()),
    }));
    const submitted = await api<{ listing: MarketplaceListing; review: ListingReview }>(
      started.url,
      '/v1/marketplace/listings',
      admin({
        method: 'POST',
        body: JSON.stringify({
          creatorId: 'creator-1',
          title: 'Webhook Fulfilled Template',
          description: 'A production-ready AI-assisted template for Checkout webhook fulfillment, license lookup, and engine handoff.',
          category: 'template',
          priceCents: 7_000,
          licenseSummary: 'Commercial studio license for one shipped game.',
        }),
      }),
    );
    const plan = await api<{ plan: MarketplaceCheckoutPlan }>(
      started.url,
      '/v1/marketplace/checkout/session-plan',
      admin({
        method: 'POST',
        body: JSON.stringify({
          listingId: submitted.body.listing.id,
          buyerId: 'studio-buyer',
          successUrl: 'https://greybox.studio/marketplace/success',
          cancelUrl: 'https://greybox.studio/marketplace/cancel',
        }),
      }),
    );
    const metadata = plan.body.plan.checkoutSessionRequest?.body.metadata;
    assert.ok(metadata);

    const event = {
      id: 'evt_checkout_api_fulfilled',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_api_fulfilled',
          object: 'checkout.session',
          mode: 'payment',
          payment_status: 'paid',
          client_reference_id: metadata.greybox_checkout_reference,
          currency: 'usd',
          amount_subtotal: 7_000,
          amount_total: 7_602,
          payment_intent: 'pi_test_api_fulfilled',
          metadata,
          automatic_tax: {
            enabled: true,
            status: 'complete',
            liability: {
              type: 'account',
              account: 'acct_creator_1',
            },
          },
          total_details: {
            amount_tax: 602,
          },
          customer_details: {
            address: {
              country: 'US',
              postal_code: '94107',
              state: 'CA',
            },
          },
        },
      },
    };

    const fulfilled = await api<{ result: MarketplaceCheckoutFulfillmentResult }>(
      started.url,
      '/v1/marketplace/checkout/fulfill',
      admin({
        method: 'POST',
        body: JSON.stringify(event),
      }),
    );
    assert.equal(fulfilled.status, 201);
    assert.equal(fulfilled.body.result.idempotent, false);
    assert.equal(fulfilled.body.result.order.stripeCheckoutSessionId, 'cs_test_api_fulfilled');
    assert.equal(fulfilled.body.result.payout.delivery, 'checkout-destination-charge');
    assert.equal(fulfilled.body.result.taxRecord.taxAmountCents, 602);
    assert.equal(fulfilled.body.result.taxRecord.buyerPostalCode, '94107');
    assert.equal(JSON.stringify(fulfilled.body).includes('sk_live'), false);

    const replay = await api<{ result: MarketplaceCheckoutFulfillmentResult }>(
      started.url,
      '/v1/marketplace/checkout/fulfill',
      admin({
        method: 'POST',
        body: JSON.stringify({ ...event, id: 'evt_checkout_api_replayed' }),
      }),
    );
    assert.equal(replay.status, 200);
    assert.equal(replay.body.result.idempotent, true);
    assert.equal(replay.body.result.order.id, fulfilled.body.result.order.id);

    const stats = await api<{ stats: MarketplaceStats }>(started.url, '/v1/marketplace/stats', admin());
    assert.equal(stats.body.stats.orders, 1);
    assert.equal(stats.body.stats.gmvCents, 7_000);

    const deniedReconciliation = await api<{ error: { code: string } }>(
      started.url,
      '/v1/marketplace/reconciliation',
    );
    assert.equal(deniedReconciliation.status, 401);
    assert.equal(deniedReconciliation.body.error.code, 'UNAUTHORIZED');

    const reconciliation = await api<{ report: MarketplaceReconciliationReport }>(
      started.url,
      '/v1/marketplace/reconciliation?from=7000&to=9000',
      admin(),
    );
    assert.equal(reconciliation.status, 200);
    assert.equal(reconciliation.body.report.ready, true);
    assert.equal(reconciliation.body.report.period?.from, 7_000);
    assert.equal(reconciliation.body.report.period?.to, 9_000);
    assert.equal(reconciliation.body.report.summary.orders, 1);
    assert.equal(reconciliation.body.report.summary.checkoutOrders, 1);
    assert.equal(reconciliation.body.report.summary.gmvCents, 7_000);
    assert.equal(reconciliation.body.report.summary.payoutCents, 5_950);
    assert.deepEqual(reconciliation.body.report.checks.map((check) => [check.id, check.status]), [
      ['order-ledger', 'pass'],
      ['payout-ledger', 'pass'],
      ['tax-ledger', 'pass'],
      ['checkout-ledger', 'pass'],
      ['entitlement-ledger', 'pass'],
    ]);
    const serialized = JSON.stringify(reconciliation.body);
    assert.equal(serialized.includes(ADMIN_TOKEN), false);
    assert.equal(serialized.includes('sk_live'), false);
  } finally {
    await closeServer(started.server);
  }
});

test('marketplace API refunds fulfilled Checkout orders through the admin route', async () => {
  const started = await startMarketplaceServer({ adminToken: ADMIN_TOKEN, clock: { now: () => 8_500 } });
  try {
    await api(started.url, '/v1/marketplace/creators', admin({
      method: 'POST',
      body: JSON.stringify(creator()),
    }));
    const submitted = await api<{ listing: MarketplaceListing; review: ListingReview }>(
      started.url,
      '/v1/marketplace/listings',
      admin({
        method: 'POST',
        body: JSON.stringify({
          creatorId: 'creator-1',
          title: 'Refundable Checkout Template',
          description: 'A production-ready AI-assisted template for Checkout refunds, risk reserve evidence, and marketplace trust controls.',
          category: 'template',
          priceCents: 7_500,
          licenseSummary: 'Commercial studio license for one shipped game.',
        }),
      }),
    );
    const plan = await api<{ plan: MarketplaceCheckoutPlan }>(
      started.url,
      '/v1/marketplace/checkout/session-plan',
      admin({
        method: 'POST',
        body: JSON.stringify({
          listingId: submitted.body.listing.id,
          buyerId: 'studio-buyer',
          successUrl: 'https://greybox.studio/marketplace/success',
          cancelUrl: 'https://greybox.studio/marketplace/cancel',
        }),
      }),
    );
    const metadata = plan.body.plan.checkoutSessionRequest?.body.metadata;
    assert.ok(metadata);
    const fulfilled = await api<{ result: MarketplaceCheckoutFulfillmentResult }>(
      started.url,
      '/v1/marketplace/checkout/fulfill',
      admin({
        method: 'POST',
        body: JSON.stringify({
          id: 'evt_checkout_api_refundable',
          type: 'checkout.session.completed',
          data: {
            object: {
              id: 'cs_test_api_refundable',
              object: 'checkout.session',
              mode: 'payment',
              payment_status: 'paid',
              client_reference_id: metadata.greybox_checkout_reference,
              currency: 'usd',
              amount_subtotal: 7_500,
              amount_total: 7_500,
              payment_intent: 'pi_test_api_refundable',
              metadata,
              automatic_tax: {
                enabled: true,
                status: 'complete',
                liability: {
                  type: 'account',
                  account: 'acct_creator_1',
                },
              },
              total_details: {
                amount_tax: 0,
              },
              customer_details: {
                address: {
                  country: 'US',
                  postal_code: '10001',
                  state: 'NY',
                },
              },
            },
          },
        }),
      }),
    );
    assert.equal(fulfilled.status, 201);
    const order = fulfilled.body.result.order;

    const denied = await api<{ error: { code: string } }>(
      started.url,
      `/v1/marketplace/orders/${order.id}/refund`,
      {
        method: 'POST',
        body: JSON.stringify({
          amountCents: order.grossCents,
          reason: 'requested_by_customer',
        }),
      },
    );
    assert.equal(denied.status, 401);
    assert.equal(denied.body.error.code, 'UNAUTHORIZED');

    const refunded = await api<{
      refund: { stripeRefundId: string; status: string };
      riskEvent: MarketplaceRiskEvent;
    }>(
      started.url,
      `/v1/marketplace/orders/${order.id}/refund`,
      admin({
        method: 'POST',
        body: JSON.stringify({
          amountCents: order.grossCents,
          reason: 'requested_by_customer',
          actorId: 'admin-refunds',
          actorType: 'admin',
        }),
      }),
    );
    assert.equal(refunded.status, 201);
    assert.equal(refunded.body.refund.status, 'succeeded');
    assert.ok(refunded.body.refund.stripeRefundId.startsWith('re_mock_'));
    assert.equal(refunded.body.riskEvent.type, 'refund');
    assert.equal(refunded.body.riskEvent.status, 'resolved');
    assert.equal(refunded.body.riskEvent.amountCents, order.grossCents);
    assert.equal(refunded.body.riskEvent.orderId, order.id);

    const riskEvents = await api<{ riskEvents: MarketplaceRiskEvent[] }>(
      started.url,
      '/v1/marketplace/risk-events?type=refund',
      admin(),
    );
    assert.deepEqual(riskEvents.body.riskEvents.map((event) => event.id), [refunded.body.riskEvent.id]);

    const overRefund = await api<{ error: { message: string } }>(
      started.url,
      `/v1/marketplace/orders/${order.id}/refund`,
      admin({
        method: 'POST',
        body: JSON.stringify({
          amountCents: 1,
          reason: 'requested_by_customer',
        }),
      }),
    );
    assert.equal(overRefund.status, 400);
    assert.match(overRefund.body.error.message, /cumulative refund amount/iu);

    const serialized = JSON.stringify({ refunded: refunded.body, riskEvents: riskEvents.body });
    assert.equal(serialized.includes(ADMIN_TOKEN), false);
    assert.equal(serialized.includes('pi_test_api_refundable'), false);
    assert.equal(serialized.includes('studio-buyer'), false);
  } finally {
    await closeServer(started.server);
  }
});

test('marketplace API translates Stripe charge.dispute.created webhooks into open dispute risk events', async () => {
  const started = await startMarketplaceServer({ adminToken: ADMIN_TOKEN, clock: { now: () => 9_000 } });
  try {
    await api(started.url, '/v1/marketplace/creators', admin({
      method: 'POST',
      body: JSON.stringify(creator()),
    }));
    const submitted = await api<{ listing: MarketplaceListing; review: ListingReview }>(
      started.url, '/v1/marketplace/listings',
      admin({
        method: 'POST',
        body: JSON.stringify({
          creatorId: 'creator-1',
          title: 'Dispute Flow Listing',
          description: 'A production-ready AI-assisted listing used to exercise the Stripe dispute webhook translation path.',
          category: 'template',
          priceCents: 4_900,
          licenseSummary: 'Commercial studio license.',
        }),
      }),
    );
    const plan = await api<{ plan: MarketplaceCheckoutPlan }>(
      started.url, '/v1/marketplace/checkout/session-plan',
      admin({
        method: 'POST',
        body: JSON.stringify({
          listingId: submitted.body.listing.id,
          buyerId: 'studio-buyer-dispute',
          successUrl: 'https://greybox.studio/marketplace/success',
          cancelUrl: 'https://greybox.studio/marketplace/cancel',
        }),
      }),
    );
    const metadata = plan.body.plan.checkoutSessionRequest?.body.metadata;
    assert.ok(metadata);
    const fulfilled = await api<{ result: MarketplaceCheckoutFulfillmentResult }>(
      started.url, '/v1/marketplace/checkout/fulfill',
      admin({
        method: 'POST',
        body: JSON.stringify({
          id: 'evt_checkout_dispute',
          type: 'checkout.session.completed',
          data: {
            object: {
              id: 'cs_test_dispute',
              object: 'checkout.session',
              mode: 'payment',
              payment_status: 'paid',
              client_reference_id: metadata.greybox_checkout_reference,
              currency: 'usd',
              amount_subtotal: 4_900,
              amount_total: 4_900,
              payment_intent: 'pi_test_dispute_flow',
              metadata,
              automatic_tax: { enabled: true, status: 'complete', liability: { type: 'account', account: 'acct_creator_1' } },
              total_details: { amount_tax: 0 },
              customer_details: { address: { country: 'US', postal_code: '10001' } },
            },
          },
        }),
      }),
    );
    const order = fulfilled.body.result.order;
    assert.ok(order);

    const disputeEvent = {
      id: 'evt_charge_dispute',
      type: 'charge.dispute.created',
      data: {
        object: {
          id: 'dp_test_dispute_flow',
          object: 'dispute',
          amount: order.grossCents,
          status: 'needs_response',
          payment_intent: 'pi_test_dispute_flow',
          metadata: { greybox_order_id: order.id },
        },
      },
    };
    const disputed = await api<{ riskEvent: MarketplaceRiskEvent }>(
      started.url, '/v1/marketplace/stripe-events/dispute',
      admin({ method: 'POST', body: JSON.stringify(disputeEvent) }),
    );
    assert.equal(disputed.status, 201);
    assert.equal(disputed.body.riskEvent.type, 'dispute');
    assert.equal(disputed.body.riskEvent.status, 'open');
    assert.equal(disputed.body.riskEvent.stripeDisputeId, 'dp_test_dispute_flow');
    assert.equal(disputed.body.riskEvent.amountCents, order.grossCents);
    const disputedReplay = await api<{ riskEvent: MarketplaceRiskEvent }>(
      started.url, '/v1/marketplace/stripe-events/dispute',
      admin({ method: 'POST', body: JSON.stringify(disputeEvent) }),
    );
    assert.equal(disputedReplay.status, 201);
    assert.equal(disputedReplay.body.riskEvent.id, disputed.body.riskEvent.id);

    const refundEvent = {
      id: 'evt_charge_refunded',
      type: 'charge.refunded',
      data: {
        object: {
          id: 'ch_test_refund_flow',
          object: 'charge',
          payment_intent: 'pi_test_dispute_flow',
          refunds: {
            data: [
              { id: 're_test_refund_newest', amount: 1_000, created: 1_800 },
              { id: 're_test_refund_older', amount: 500, created: 1_700 },
            ],
          },
        },
      },
    };
    const refunded = await api<{ riskEvent: MarketplaceRiskEvent }>(
      started.url,
      '/v1/marketplace/stripe-events/refund',
      admin({ method: 'POST', body: JSON.stringify(refundEvent) }),
    );
    assert.equal(refunded.status, 201);
    assert.equal(refunded.body.riskEvent.type, 'refund');
    assert.equal(refunded.body.riskEvent.status, 'resolved');
    assert.equal(refunded.body.riskEvent.stripeRefundId, 're_test_refund_newest');
    assert.equal(refunded.body.riskEvent.amountCents, 1_000);
    const refundedReplay = await api<{ riskEvent: MarketplaceRiskEvent }>(
      started.url,
      '/v1/marketplace/stripe-events/refund',
      admin({ method: 'POST', body: JSON.stringify(refundEvent) }),
    );
    assert.equal(refundedReplay.status, 201);
    assert.equal(refundedReplay.body.riskEvent.id, refunded.body.riskEvent.id);

    const wrongRoute = await api<{ ok: boolean; ignored: boolean; reason: string }>(
      started.url,
      '/v1/marketplace/stripe-events/refund',
      admin({ method: 'POST', body: JSON.stringify(disputeEvent) }),
    );
    assert.equal(wrongRoute.status, 202);
    assert.equal(wrongRoute.body.ignored, true);
    assert.equal(wrongRoute.body.reason, 'wrong_stripe_event_route');
    const ignoredAudit = started.store.auditRecords({ action: 'stripe_event.ignored' });
    assert.equal(ignoredAudit.length, 1);
    assert.equal(ignoredAudit[0]?.actorType, 'webhook');
    assert.match(ignoredAudit[0]?.entityId ?? '', /^stripe_event:[a-f0-9]{16}$/u);
    const { requestId: wrongRouteRequestId, ...wrongRouteMetadata } = ignoredAudit[0]?.metadata ?? {};
    assert.match(String(wrongRouteRequestId), /^req_[0-9a-f]{16}$/u);
    assert.deepEqual(wrongRouteMetadata, {
      route: 'refund',
      reason: 'wrong_stripe_event_route',
      eventType: 'charge.dispute.created',
      hasPaymentIntent: true,
      hasMetadataOrderId: true,
      amountCents: order.grossCents,
    });

    const riskEvents = await api<{ riskEvents: MarketplaceRiskEvent[] }>(
      started.url,
      `/v1/marketplace/risk-events?orderId=${encodeURIComponent(order.id)}`,
      admin(),
    );
    assert.equal(riskEvents.body.riskEvents.length, 2);
    assert.deepEqual(
      riskEvents.body.riskEvents.map((event) => event.id).sort(),
      [disputed.body.riskEvent.id, refunded.body.riskEvent.id].sort(),
    );
  } finally {
    await closeServer(started.server);
  }
});

test('marketplace stripe-events endpoint returns 202 when the event cannot be matched to a marketplace order', async () => {
  const started = await startMarketplaceServer({ adminToken: ADMIN_TOKEN, clock: { now: () => 9_500 } });
  try {
    const unmatched = await api<{ ok: boolean; ignored: boolean; reason: string }>(
      started.url, '/v1/marketplace/stripe-events/dispute',
      admin({
        method: 'POST',
        body: JSON.stringify({
          id: 'evt_unmatched_dispute',
          type: 'charge.dispute.created',
          data: {
            object: {
              id: 'dp_unmatched',
              object: 'dispute',
              amount: 100,
              status: 'needs_response',
              payment_intent: 'pi_not_in_marketplace',
            },
          },
        }),
      }),
    );
    assert.equal(unmatched.status, 202);
    assert.equal(unmatched.body.ignored, true);
    assert.equal(unmatched.body.reason, 'unmatched_stripe_event');
    const ignoredAudit = started.store.auditRecords({ action: 'stripe_event.ignored' });
    assert.equal(ignoredAudit.length, 1);
    assert.equal(ignoredAudit[0]?.actorType, 'webhook');
    assert.match(ignoredAudit[0]?.entityId ?? '', /^stripe_event:[a-f0-9]{16}$/u);
    const { requestId: unmatchedRequestId, ...unmatchedMetadata } = ignoredAudit[0]?.metadata ?? {};
    assert.match(String(unmatchedRequestId), /^req_[0-9a-f]{16}$/u);
    assert.deepEqual(unmatchedMetadata, {
      route: 'dispute',
      reason: 'unmatched_stripe_event',
      eventType: 'charge.dispute.created',
      hasPaymentIntent: true,
      hasMetadataOrderId: false,
      amountCents: 100,
    });
    const serializedAudit = JSON.stringify(ignoredAudit);
    assert.equal(serializedAudit.includes('evt_unmatched_dispute'), false);
    assert.equal(serializedAudit.includes('pi_not_in_marketplace'), false);
    assert.equal(serializedAudit.includes('dp_unmatched'), false);
    const metrics = await api<Record<string, unknown>>(started.url, '/metrics', admin());
    assert.equal(metrics.body['stripe_event.ignored'], 1);
    assert.equal(metrics.body['stripe_event.ignored.unmatched_stripe_event'], 1);
  } finally {
    await closeServer(started.server);
  }
});

test('marketplace stripe-events endpoint rejects conflicting payment intent and metadata order ids', async () => {
  const started = await startMarketplaceServer({ adminToken: ADMIN_TOKEN, clock: { now: () => 9_700 } });
  try {
    await api(started.url, '/v1/marketplace/creators', admin({
      method: 'POST',
      body: JSON.stringify(creator()),
    }));
    const submitted = await api<{ listing: MarketplaceListing; review: ListingReview }>(
      started.url, '/v1/marketplace/listings',
      admin({
        method: 'POST',
        body: JSON.stringify({
          creatorId: 'creator-1',
          title: 'Conflicting Webhook Evidence Template',
          description: 'A production-ready AI-assisted listing used to verify Stripe webhook order binding.',
          category: 'template',
          priceCents: 4_900,
          licenseSummary: 'Commercial studio license.',
        }),
      }),
    );

    async function fulfillBuyer(input: {
      buyerId: string;
      sessionId: string;
      paymentIntentId: string;
    }): Promise<MarketplaceOrder> {
      const plan = await api<{ plan: MarketplaceCheckoutPlan }>(
        started.url, '/v1/marketplace/checkout/session-plan',
        admin({
          method: 'POST',
          body: JSON.stringify({
            listingId: submitted.body.listing.id,
            buyerId: input.buyerId,
            successUrl: 'https://greybox.studio/marketplace/success',
            cancelUrl: 'https://greybox.studio/marketplace/cancel',
          }),
        }),
      );
      const metadata = plan.body.plan.checkoutSessionRequest?.body.metadata;
      assert.ok(metadata);
      const fulfilled = await api<{ result: MarketplaceCheckoutFulfillmentResult }>(
        started.url, '/v1/marketplace/checkout/fulfill',
        admin({
          method: 'POST',
          body: JSON.stringify({
            id: `evt_${input.sessionId}`,
            type: 'checkout.session.completed',
            data: {
              object: {
                id: input.sessionId,
                object: 'checkout.session',
                mode: 'payment',
                payment_status: 'paid',
                client_reference_id: metadata.greybox_checkout_reference,
                currency: 'usd',
                amount_subtotal: 4_900,
                amount_total: 4_900,
                payment_intent: input.paymentIntentId,
                metadata,
                automatic_tax: { enabled: true, status: 'complete', liability: { type: 'account', account: 'acct_creator_1' } },
                total_details: { amount_tax: 0 },
                customer_details: { address: { country: 'US', postal_code: '10001' } },
              },
            },
          }),
        }),
      );
      return fulfilled.body.result.order;
    }

    const firstOrder = await fulfillBuyer({
      buyerId: 'studio-buyer-conflict-a',
      sessionId: 'cs_test_conflict_a',
      paymentIntentId: 'pi_test_conflict_a',
    });
    const secondOrder = await fulfillBuyer({
      buyerId: 'studio-buyer-conflict-b',
      sessionId: 'cs_test_conflict_b',
      paymentIntentId: 'pi_test_conflict_b',
    });

    const conflicted = await api<{ ok: boolean; ignored: boolean; reason: string }>(
      started.url,
      '/v1/marketplace/stripe-events/refund',
      admin({
        method: 'POST',
        body: JSON.stringify({
          id: 'evt_conflicting_refund',
          type: 'charge.refunded',
          data: {
            object: {
              id: 'ch_test_conflicting_refund',
              object: 'charge',
              payment_intent: 'pi_test_conflict_a',
              metadata: { greybox_order_id: secondOrder.id },
              refunds: {
                data: [{ id: 're_test_conflicting_refund', amount: 1_000 }],
              },
            },
          },
        }),
      }),
    );
    assert.equal(conflicted.status, 202);
    assert.equal(conflicted.body.ignored, true);
    assert.equal(conflicted.body.reason, 'unmatched_stripe_event');
    const ignoredAudit = started.store.auditRecords({ action: 'stripe_event.ignored' });
    assert.equal(ignoredAudit.length, 1);
    const { requestId: conflictedRequestId, ...conflictedMetadata } = ignoredAudit[0]?.metadata ?? {};
    assert.match(String(conflictedRequestId), /^req_[0-9a-f]{16}$/u);
    assert.deepEqual(conflictedMetadata, {
      route: 'refund',
      reason: 'unmatched_stripe_event',
      eventType: 'charge.refunded',
      hasPaymentIntent: true,
      hasMetadataOrderId: true,
      amountCents: 1_000,
    });
    const serializedAudit = JSON.stringify(ignoredAudit);
    assert.equal(serializedAudit.includes('pi_test_conflict_a'), false);
    assert.equal(serializedAudit.includes('evt_conflicting_refund'), false);
    assert.equal(serializedAudit.includes(secondOrder.id), false);

    const firstRiskEvents = await api<{ riskEvents: MarketplaceRiskEvent[] }>(
      started.url,
      `/v1/marketplace/risk-events?orderId=${encodeURIComponent(firstOrder.id)}`,
      admin(),
    );
    const secondRiskEvents = await api<{ riskEvents: MarketplaceRiskEvent[] }>(
      started.url,
      `/v1/marketplace/risk-events?orderId=${encodeURIComponent(secondOrder.id)}`,
      admin(),
    );
    assert.deepEqual(firstRiskEvents.body.riskEvents, []);
    assert.deepEqual(secondRiskEvents.body.riskEvents, []);
  } finally {
    await closeServer(started.server);
  }
});
