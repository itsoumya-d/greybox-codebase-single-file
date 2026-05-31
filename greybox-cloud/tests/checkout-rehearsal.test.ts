// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import type http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { FileAuditLog } from '../src/enterprise/auditLog.js';
import { createGreyboxCloudServer } from '../src/server.js';

const stripeWebhookSecret = 'whsec_local_rehearsal_secret';
const marketplaceAdminToken = 'marketplace-local-admin-token';

interface ApiResult<T> {
  status: number;
  body: T;
}

async function withCloudServer<T>(
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

async function loadMarketplaceApi(): Promise<{
  startMarketplaceServer: (options: {
    adminToken: string;
    checkoutClient?: {
      createSession(request: {
        endpoint: string;
        idempotencyKey: string;
        body: {
          metadata: Record<string, string>;
          payment_intent_data?: {
            transfer_data?: {
              destination?: string;
            };
          };
        };
      }): Promise<{
        id: string;
        url: string;
        livemode?: boolean;
        expiresAt?: number;
        paymentStatus?: string;
      }>;
    };
    persistencePath?: string;
    clock?: { now(): number };
  }) => Promise<{
    server: { close(callback: (error?: Error) => void): void };
    url: string;
  }>;
}> {
  const marketplaceModule = await import(new URL('../../greybox-marketplace/src/index.ts', import.meta.url).href);
  return marketplaceModule as Awaited<ReturnType<typeof loadMarketplaceApi>>;
}

async function api<T>(baseUrl: string, pathName: string, init: RequestInit = {}): Promise<ApiResult<T>> {
  const response = await fetch(`${baseUrl}${pathName}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...init.headers,
    },
  });
  return {
    status: response.status,
    body: await response.json() as T,
  };
}

function admin(init: RequestInit = {}): RequestInit {
  return {
    ...init,
    headers: {
      authorization: `Bearer ${marketplaceAdminToken}`,
      ...init.headers,
    },
  };
}

async function closeMarketplaceServer(server: { close(callback: (error?: Error) => void): void }): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error?: Error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function stripeSignatureHeader(rawBody: string): string {
  const timestamp = Math.floor(Date.now() / 1_000);
  const signature = createHmac('sha256', stripeWebhookSecret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

function signedProModuleEnvelope(): Record<string, unknown> {
  return {
    format: 'agds-pro-module-bundle/v1',
    payloadSha256: 'c'.repeat(64),
    signature: { algorithm: 'ed25519', keyId: 'greybox-rehearsal' },
    manifest: {
      id: 'soulslike-combat-pack',
      name: 'Soulslike Combat Pack',
      version: '1.0.0',
      licenseTier: 'pro',
      mounts: {
        skills: [{
          kind: 'skill',
          id: 'soulslike-combat',
          title: 'Soulslike Combat Skill',
          entry: 'skills/soulslike/SKILL.md',
        }],
        engineTargets: [{
          kind: 'engine-target',
          id: 'soulslike-unity',
          title: 'Soulslike Unity Export',
          entry: 'engine-targets/unity.json',
        }],
      },
    },
  };
}

test('local checkout rehearsal runs cloud webhook into the real marketplace server', async () => {
  const { startMarketplaceServer } = await loadMarketplaceApi();
  const marketplaceDataDir = await mkdtemp(path.join(os.tmpdir(), 'greybox-checkout-rehearsal-marketplace-'));
  const marketplaceSnapshotPath = path.join(marketplaceDataDir, 'marketplace.snapshot.json');
  let hostedCheckoutMetadata: Record<string, string> | undefined;
  const marketplace = await startMarketplaceServer({
    adminToken: marketplaceAdminToken,
    checkoutClient: {
      async createSession(request) {
        assert.equal(request.endpoint, '/v1/checkout/sessions');
        assert.match(request.idempotencyKey, /^greybox-checkout-/u);
        assert.equal(request.body.metadata.greybox_buyer_id, 'studio-buyer');
        assert.equal(request.body.payment_intent_data?.transfer_data?.destination, 'acct_rehearsal_creator');
        hostedCheckoutMetadata = request.body.metadata;
        return {
          id: 'cs_test_local_rehearsal',
          url: 'https://checkout.stripe.com/c/pay/cs_test_local_rehearsal',
          livemode: false,
          expiresAt: Math.floor(Date.parse('2026-05-17T12:30:00.000Z') / 1000),
          paymentStatus: 'unpaid',
        };
      },
    },
    persistencePath: marketplaceSnapshotPath,
    clock: { now: () => Date.parse('2026-05-17T12:00:00.000Z') },
  });
  let marketplaceOpen = true;
  const auditDir = await mkdtemp(path.join(os.tmpdir(), 'greybox-checkout-rehearsal-audit-'));
  try {
    const auditLog = new FileAuditLog(auditDir);
    await withCloudServer({
      stripeWebhookSecret,
      marketplaceUrl: marketplace.url,
      marketplaceAdminToken,
      auditLog,
    }, async (cloudUrl) => {
      const creator = await api<{ creator: { id: string } }>(marketplace.url, '/v1/marketplace/creators', admin({
        method: 'POST',
        body: JSON.stringify({
          id: 'creator-rehearsal',
          displayName: 'Rehearsal Creator',
          country: 'US',
          email: 'creator@example.com',
          stripeConnectAccountId: 'acct_rehearsal_creator',
          taxProfileId: 'tax_rehearsal_creator',
          monthlyGmvCents: 0,
          lifetimeGmvCents: 0,
          active: true,
        }),
      }));
      assert.equal(creator.status, 201);

      const submitted = await api<{
        listing: {
          id: string;
          status: string;
          priceCents: number;
        };
      }>(marketplace.url, '/v1/marketplace/listings', admin({
        method: 'POST',
        body: JSON.stringify({
          creatorId: 'creator-rehearsal',
          title: 'Soulslike Combat Pack',
          description: 'A signed AI-assisted Pro module for stamina loops, readable boss pacing, lock-on HUD states, dodge windows, and Unity export setup.',
          category: 'pro-module',
          priceCents: 7_900,
          licenseSummary: 'Commercial Greybox Pro module license for one studio account.',
          proModule: signedProModuleEnvelope(),
        }),
      }));
      assert.equal(submitted.status, 201);
      assert.equal(submitted.body.listing.status, 'published');

      const checkout = await api<{
        plan: {
          checkoutSessionRequest: {
            body: {
              metadata: Record<string, string>;
            };
          };
        };
        checkout: {
          id: string;
          url: string;
          paymentStatus?: string;
        };
      }>(marketplace.url, '/v1/marketplace/checkout/sessions', admin({
        method: 'POST',
        body: JSON.stringify({
          listingId: submitted.body.listing.id,
          buyerId: 'studio-buyer',
          successUrl: 'https://greybox.studio/marketplace/success',
          cancelUrl: 'https://greybox.studio/marketplace/cancel',
        }),
      }));
      assert.equal(checkout.status, 201);
      assert.equal(checkout.body.checkout.id, 'cs_test_local_rehearsal');
      assert.equal(checkout.body.checkout.url, 'https://checkout.stripe.com/c/pay/cs_test_local_rehearsal');
      assert.equal(checkout.body.checkout.paymentStatus, 'unpaid');
      assert.deepEqual(checkout.body.plan.checkoutSessionRequest.body.metadata, hostedCheckoutMetadata);

      const rawBody = JSON.stringify({
        id: 'evt_local_checkout_rehearsal',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: checkout.body.checkout.id,
            object: 'checkout.session',
            mode: 'payment',
            payment_status: 'paid',
            client_reference_id: checkout.body.plan.checkoutSessionRequest.body.metadata.greybox_checkout_reference,
            currency: 'usd',
            amount_subtotal: submitted.body.listing.priceCents,
            amount_total: 8_579,
            payment_intent: 'pi_test_local_rehearsal',
            metadata: checkout.body.plan.checkoutSessionRequest.body.metadata,
            automatic_tax: {
              enabled: true,
              status: 'complete',
              liability: {
                type: 'account',
                account: 'acct_rehearsal_creator',
              },
            },
            total_details: { amount_tax: 679 },
            customer_details: {
              address: {
                country: 'US',
                postal_code: '94107',
                state: 'CA',
              },
            },
          },
        },
      });

      const webhook = await api<{
        forwarded: boolean;
        idempotent: boolean;
        marketplaceStatus: number;
        stripeObjectId: string;
      }>(cloudUrl, '/v1/billing/webhook', {
        method: 'POST',
        headers: {
          'stripe-signature': stripeSignatureHeader(rawBody),
        },
        body: rawBody,
      });
      assert.equal(webhook.status, 200);
      assert.deepEqual(webhook.body, {
        ok: true,
        received: true,
        verified: true,
        eventId: 'evt_local_checkout_rehearsal',
        eventType: 'checkout.session.completed',
        stripeObjectId: 'cs_test_local_rehearsal',
        forwarded: true,
        marketplaceStatus: 201,
        idempotent: false,
      });

      const replay = await api<{ idempotent: boolean; marketplaceStatus: number }>(
        cloudUrl,
        '/v1/billing/webhook',
        {
          method: 'POST',
          headers: {
            'stripe-signature': stripeSignatureHeader(rawBody),
          },
          body: rawBody,
        },
      );
      assert.equal(replay.status, 200);
      assert.equal(replay.body.idempotent, true);
      assert.equal(replay.body.marketplaceStatus, 200);

      const refundBody = JSON.stringify({
        id: 'evt_local_refund_rehearsal',
        type: 'charge.refunded',
        data: {
          object: {
            id: 'ch_test_local_rehearsal',
            object: 'charge',
            payment_intent: 'pi_test_local_rehearsal',
            amount: 8_579,
            amount_refunded: 1_900,
            metadata: checkout.body.plan.checkoutSessionRequest.body.metadata,
            refunds: {
              object: 'list',
              data: [{
                id: 're_test_local_partial_refund',
                object: 'refund',
                amount: 1_900,
                created: Math.floor(Date.parse('2026-05-17T12:02:00.000Z') / 1000),
              }],
            },
          },
        },
      });
      const refundWebhook = await api<{
        eventType: string;
        forwarded: boolean;
        marketplaceStatus: number;
        stripeObjectId: string;
      }>(cloudUrl, '/v1/billing/webhook', {
        method: 'POST',
        headers: {
          'stripe-signature': stripeSignatureHeader(refundBody),
        },
        body: refundBody,
      });
      assert.equal(refundWebhook.status, 200);
      assert.equal(refundWebhook.body.eventType, 'charge.refunded');
      assert.equal(refundWebhook.body.forwarded, true);
      assert.equal(refundWebhook.body.marketplaceStatus, 201);
      assert.equal(refundWebhook.body.stripeObjectId, 'ch_test_local_rehearsal');

      const disputeBody = JSON.stringify({
        id: 'evt_local_dispute_rehearsal',
        type: 'charge.dispute.created',
        data: {
          object: {
            id: 'dp_test_local_dispute',
            object: 'dispute',
            payment_intent: 'pi_test_local_rehearsal',
            amount: 2_400,
            status: 'needs_response',
            metadata: checkout.body.plan.checkoutSessionRequest.body.metadata,
          },
        },
      });
      const disputeWebhook = await api<{
        eventType: string;
        forwarded: boolean;
        marketplaceStatus: number;
        stripeObjectId: string;
      }>(cloudUrl, '/v1/billing/webhook', {
        method: 'POST',
        headers: {
          'stripe-signature': stripeSignatureHeader(disputeBody),
        },
        body: disputeBody,
      });
      assert.equal(disputeWebhook.status, 200);
      assert.equal(disputeWebhook.body.eventType, 'charge.dispute.created');
      assert.equal(disputeWebhook.body.forwarded, true);
      assert.equal(disputeWebhook.body.marketplaceStatus, 201);
      assert.equal(disputeWebhook.body.stripeObjectId, 'dp_test_local_dispute');

      const refunds = await api<{
        riskEvents: Array<{ type: string; status: string; amountCents: number; stripeRefundId?: string }>;
      }>(marketplace.url, '/v1/marketplace/risk-events?type=refund', admin());
      assert.deepEqual(refunds.body.riskEvents.map((event) => ({
        type: event.type,
        status: event.status,
        amountCents: event.amountCents,
        stripeRefundId: event.stripeRefundId,
      })), [{
        type: 'refund',
        status: 'resolved',
        amountCents: 1_900,
        stripeRefundId: 're_test_local_partial_refund',
      }]);

      const disputes = await api<{
        riskEvents: Array<{ type: string; status: string; amountCents: number; stripeDisputeId?: string }>;
      }>(marketplace.url, '/v1/marketplace/risk-events?type=dispute', admin());
      assert.deepEqual(disputes.body.riskEvents.map((event) => ({
        type: event.type,
        status: event.status,
        amountCents: event.amountCents,
        stripeDisputeId: event.stripeDisputeId,
      })), [{
        type: 'dispute',
        status: 'open',
        amountCents: 2_400,
        stripeDisputeId: 'dp_test_local_dispute',
      }]);

      const stats = await api<{ stats: { orders: number; gmvCents: number } }>(
        marketplace.url,
        '/v1/marketplace/stats',
        admin(),
      );
      assert.equal(stats.body.stats.orders, 1);
      assert.equal(stats.body.stats.gmvCents, 7_900);

      const entitlements = await api<{ entitlements: Array<{ activation: { lookupKey: string } }> }>(
        marketplace.url,
        '/v1/marketplace/entitlements?buyerId=studio-buyer',
        admin(),
      );
      assert.equal(entitlements.body.entitlements.length, 1);
      assert.match(entitlements.body.entitlements[0]?.activation.lookupKey ?? '', /^gbx_ent_[A-Za-z0-9_-]{32}$/u);
      assert.doesNotMatch(entitlements.body.entitlements[0]?.activation.lookupKey ?? '', /studio-buyer|soulslike-combat-pack/u);

      const reconciliation = await api<{
        report: {
          ready: boolean;
          summary: {
            orders: number;
            checkoutOrders: number;
            directOrders: number;
            gmvCents: number;
            platformRevenueCents: number;
            creatorNetCents: number;
            payoutCents: number;
            blockedPayouts: number;
            taxAmountCents: number;
            entitlementsIssued: number;
            entitlementsClaimed: number;
            creatorsWithSales: number;
          };
          checks: Array<{ id: string; status: string }>;
          issues: unknown[];
        };
      }>(marketplace.url, '/v1/marketplace/reconciliation', admin());
      assert.equal(reconciliation.status, 200);
      assert.equal(reconciliation.body.report.ready, true);
      assert.deepEqual(reconciliation.body.report.summary, {
        orders: 1,
        checkoutOrders: 1,
        directOrders: 0,
        gmvCents: 7_900,
        platformRevenueCents: 1_185,
        creatorNetCents: 6_715,
        payoutCents: 6_715,
        blockedPayouts: 0,
        taxAmountCents: 679,
        entitlementsIssued: 1,
        entitlementsClaimed: 0,
        creatorsWithSales: 1,
      });
      assert.deepEqual(reconciliation.body.report.checks.map((check) => [check.id, check.status]), [
        ['order-ledger', 'pass'],
        ['payout-ledger', 'pass'],
        ['tax-ledger', 'pass'],
        ['checkout-ledger', 'pass'],
        ['entitlement-ledger', 'pass'],
      ]);
      assert.deepEqual(reconciliation.body.report.issues, []);
    });

    await closeMarketplaceServer(marketplace.server);
    marketplaceOpen = false;
    const restartedMarketplace = await startMarketplaceServer({
      adminToken: marketplaceAdminToken,
      persistencePath: marketplaceSnapshotPath,
      clock: { now: () => Date.parse('2026-05-17T12:01:00.000Z') },
    });
    try {
      const persistedStats = await api<{ stats: { orders: number; gmvCents: number } }>(
        restartedMarketplace.url,
        '/v1/marketplace/stats',
        admin(),
      );
      assert.equal(persistedStats.body.stats.orders, 1);
      assert.equal(persistedStats.body.stats.gmvCents, 7_900);

      const persistedReconciliation = await api<{
        report: {
          ready: boolean;
          summary: { orders: number; checkoutOrders: number; entitlementsIssued: number };
          issues: unknown[];
        };
      }>(restartedMarketplace.url, '/v1/marketplace/reconciliation', admin());
      assert.equal(persistedReconciliation.status, 200);
      assert.equal(persistedReconciliation.body.report.ready, true);
      assert.equal(persistedReconciliation.body.report.summary.orders, 1);
      assert.equal(persistedReconciliation.body.report.summary.checkoutOrders, 1);
      assert.equal(persistedReconciliation.body.report.summary.entitlementsIssued, 1);
      assert.deepEqual(persistedReconciliation.body.report.issues, []);
    } finally {
      await closeMarketplaceServer(restartedMarketplace.server);
    }

    const auditEntries = await auditLog.readEntries({ action: 'billing.checkout_fulfilled' });
    assert.equal(auditEntries.length, 2);
    assert.deepEqual(auditEntries.map((entry) => entry.metadata && (entry.metadata as { idempotent?: boolean }).idempotent), [
      false,
      true,
    ]);
    assert.equal(auditEntries[0]?.targetId, 'cs_test_local_rehearsal');
    const riskAuditEntries = await auditLog.readEntries({ action: 'billing.marketplace_stripe_event_forwarded' });
    assert.deepEqual(riskAuditEntries.map((entry) => ({
      targetId: entry.targetId,
      eventType: entry.metadata?.eventType,
      marketplaceStatus: entry.metadata?.marketplaceStatus,
    })), [
      {
        targetId: 'ch_test_local_rehearsal',
        eventType: 'charge.refunded',
        marketplaceStatus: 201,
      },
      {
        targetId: 'dp_test_local_dispute',
        eventType: 'charge.dispute.created',
        marketplaceStatus: 201,
      },
    ]);
    assert.equal((await auditLog.verify()).valid, true);
  } finally {
    if (marketplaceOpen) await closeMarketplaceServer(marketplace.server);
    await rm(auditDir, { recursive: true, force: true });
    await rm(marketplaceDataDir, { recursive: true, force: true });
  }
});
