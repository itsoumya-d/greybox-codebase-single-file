// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildStripeCheckoutSessionRequest,
  buildStripeConnectAccountCreateRequest,
  buildStripeConnectAccountLinkRequest,
  buildStripeConnectOnboardingPlan,
  buildStripeConnectTransferRequest,
  buildMarketplaceTaxPreview,
  buildStripeTaxCalculationRequest,
  buildStripeTaxTransactionCreateRequest,
  creatorPayoutReadiness,
  FileBackedMarketplaceStore,
  InMemoryMarketplaceAuditLog,
  InMemoryMarketplaceStore,
  LiveStripeCheckoutClient,
  LiveStripeConnectProvider,
  assertPriceAllowed,
  publicProModuleListingMetadataFromEnvelope,
  takeRateForCreator,
  topGmvHumanReviewRequired,
} from '../src/index.js';
import type {
  Creator,
  ListingDraft,
  MarketplaceListing,
  PayoutProvider,
  ProModuleListingMetadata,
  StripeConnectOnboardingProvider,
  StripeCheckoutCompletedEvent,
  StripeCheckoutMetadata,
} from '../src/index.js';

type CreatorOverrides = Partial<Omit<Creator, 'stripeConnectAccountId' | 'taxProfileId'>> & {
  stripeConnectAccountId?: string | undefined;
  taxProfileId?: string | undefined;
};

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

function listingDraft(overrides: Partial<ListingDraft> = {}): ListingDraft {
  return {
    creatorId: overrides.creatorId ?? 'creator-1',
    title: overrides.title ?? 'Soulslike Combat Art Bible',
    category: overrides.category ?? 'custom-art-bible',
    priceCents: overrides.priceCents ?? 4_900,
    description: overrides.description
      ?? 'A production-ready AI-assisted combat art bible for readable boss arenas, stamina tells, dodge windows, lock-on HUD states, and animation priority.',
    licenseSummary: overrides.licenseSummary
      ?? 'Commercial studio license for one shipped game with royalty-free usage.',
    tags: overrides.tags ?? ['soulslike', 'combat'],
    ...(overrides.proModule ? { proModule: overrides.proModule } : {}),
  };
}

function queuedPayoutProvider(calls: { count: number }): PayoutProvider {
  return {
    async createTransfer(order, creator) {
      calls.count += 1;
      return {
        id: `payout-${order.id}`,
        orderId: order.id,
        creatorId: creator.id,
        stripeConnectAccountId: creator.stripeConnectAccountId ?? '',
        amountCents: order.creatorNetCents,
        currency: order.currency,
        status: 'queued',
        delivery: 'manual-transfer',
      };
    },
  };
}

function realTransferPayoutProvider(calls: { count: number } = { count: 0 }): PayoutProvider {
  return {
    async createTransfer(order, creator) {
      calls.count += 1;
      return {
        id: `tr_test_${order.id.replace(/[^A-Za-z0-9_]/gu, '_')}`,
        orderId: order.id,
        creatorId: creator.id,
        stripeConnectAccountId: creator.stripeConnectAccountId ?? '',
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
      id: 'soulslike-combat-pack',
      name: 'Soulslike Combat Pack',
      version: '1.0.0',
      description: 'Signed combat systems bundle for stamina, lock-on, and readable boss pacing.',
      licenseTier: 'pro',
      mounts: {
        skills: [
          {
            kind: 'skill',
            id: 'soulslike-combat',
            title: 'Soulslike Combat Skill',
            entry: 'skills/soulslike/SKILL.md',
            digestSha256: 'b'.repeat(64),
          },
        ],
        engineTargets: [
          {
            kind: 'engine-target',
            id: 'soulslike-unity',
            title: 'Soulslike Unity Export',
            entry: 'engine-targets/unity.json',
          },
        ],
      },
    },
    ...overrides,
  };
}

function checkoutCompletedEvent(input: {
  listing: MarketplaceListing;
  metadata: StripeCheckoutMetadata;
  sessionId?: string;
  eventId?: string;
  paymentIntentId?: string;
  amountSubtotalCents?: number;
  amountTotalCents?: number;
  taxAmountCents?: number;
  paymentStatus?: string;
  automaticTaxStatus?: 'complete' | 'failed' | 'requires_location_inputs';
  automaticTaxLiability?: { type?: string; account?: string | null } | null;
}): StripeCheckoutCompletedEvent {
  const sessionId = input.sessionId ?? 'cs_test_greybox_checkout_1';
  const liability = input.automaticTaxLiability === null
    ? null
    : {
      type: input.automaticTaxLiability?.type ?? 'account',
      account: input.automaticTaxLiability?.account ?? 'acct_creator_1',
    };
  return {
    id: input.eventId ?? `evt_${sessionId}`,
    type: 'checkout.session.completed',
    data: {
      object: {
        id: sessionId,
        object: 'checkout.session',
        mode: 'payment',
        payment_status: input.paymentStatus ?? 'paid',
        client_reference_id: input.metadata.greybox_checkout_reference,
        currency: input.listing.currency,
        amount_subtotal: input.amountSubtotalCents ?? input.listing.priceCents,
        amount_total: input.amountTotalCents ?? input.listing.priceCents + (input.taxAmountCents ?? 0),
        payment_intent: input.paymentIntentId ?? 'pi_test_greybox_checkout_1',
        metadata: input.metadata,
        automatic_tax: {
          enabled: true,
          status: input.automaticTaxStatus ?? 'complete',
          liability,
        },
        total_details: {
          amount_tax: input.taxAmountCents ?? 0,
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
  };
}

async function fulfillCheckoutForBuyer(
  store: InMemoryMarketplaceStore,
  listing: MarketplaceListing,
  buyerId: string,
  sessionId: string,
): Promise<void> {
  const plan = store.checkoutPlan({
    listingId: listing.id,
    buyerId,
    successUrl: 'https://greybox.studio/marketplace/success',
    cancelUrl: 'https://greybox.studio/marketplace/cancel',
  });
  const metadata = plan.checkoutSessionRequest?.body.metadata;
  const creator = store.creator(listing.creatorId);
  assert.ok(metadata);
  assert.ok(creator?.stripeConnectAccountId);
  await store.fulfillCheckoutSession(checkoutCompletedEvent({
    listing,
    metadata,
    sessionId,
    eventId: `evt_${sessionId}`,
    paymentIntentId: `pi_${sessionId}`,
    automaticTaxLiability: { type: 'account', account: creator.stripeConnectAccountId },
  }));
}

async function fulfillProModuleCheckout(
  store: InMemoryMarketplaceStore,
  input: {
    buyerId?: string;
    sessionId?: string;
    priceCents?: number;
  } = {},
) {
  const metadata = publicProModuleListingMetadataFromEnvelope(signedProModuleEnvelope());
  store.upsertCreator(creator({ monthlyGmvCents: 0 }));
  const { listing } = store.submitListing(listingDraft({
    title: 'Soulslike Combat Pack',
    category: 'pro-module',
    priceCents: input.priceCents ?? 7_900,
    proModule: metadata,
  }));
  const plan = store.checkoutPlan({
    listingId: listing.id,
    buyerId: input.buyerId ?? 'studio-buyer',
    successUrl: 'https://greybox.studio/marketplace/success',
    cancelUrl: 'https://greybox.studio/marketplace/cancel',
  });
  assert.ok(plan.checkoutSessionRequest);
  const sessionId = input.sessionId ?? 'cs_test_pro_module_refund';
  return store.fulfillCheckoutSession(checkoutCompletedEvent({
    listing,
    metadata: plan.checkoutSessionRequest.body.metadata,
    sessionId,
    paymentIntentId: `pi_${sessionId}`,
  }));
}

test('category price bounds enforce marketplace pricing bands', () => {
  assert.doesNotThrow(() => assertPriceAllowed('asset-pack', 20_000));
  assert.doesNotThrow(() => assertPriceAllowed('pro-module', 19_900));
  assert.throws(() => assertPriceAllowed('template', 50_000), /template price/u);
});

test('creator take rate scales from 15 percent to 8 percent', () => {
  assert.equal(takeRateForCreator(500_000), 0.15);
  assert.equal(takeRateForCreator(5_000_000), 0.08);
  assert.ok(takeRateForCreator(3_000_000) < 0.15);
  assert.ok(takeRateForCreator(3_000_000) > 0.08);
});

test('auto review publishes clean listings and routes top GMV creators to human review', () => {
  const store = new InMemoryMarketplaceStore({ clock: { now: () => 100 } });
  store.upsertCreator(creator());
  const clean = store.submitListing(listingDraft(), { creatorRankByGmv: 11, creatorCount: 100 });
  assert.equal(clean.listing.status, 'published');
  assert.equal(clean.review.status, 'passed');

  const top = store.submitListing(listingDraft({ title: 'Hero Shooter Toolkit' }), {
    creatorRankByGmv: 3,
    creatorCount: 100,
  });
  assert.equal(top.listing.status, 'pending-human-review');
  assert.equal(top.review.humanReviewRequired, true);
  assert.equal(topGmvHumanReviewRequired({ listingRankByCreatorGmv: 10, creatorCount: 100, now: 0 }), true);
});

test('store derives top GMV human review routing when caller omits rank context', () => {
  const store = new InMemoryMarketplaceStore({ clock: { now: () => 110 } });
  for (let index = 1; index <= 20; index += 1) {
    store.upsertCreator(creator({
      id: `creator-${index}`,
      monthlyGmvCents: (21 - index) * 100_000,
    }));
  }

  const top = store.submitListing(listingDraft({
    creatorId: 'creator-1',
    title: 'Top Creator Live Ops Pack',
  }));
  assert.equal(top.listing.status, 'pending-human-review');
  assert.equal(top.review.humanReviewRequired, true);

  const longTail = store.submitListing(listingDraft({
    creatorId: 'creator-20',
    title: 'Long Tail Cozy Template',
  }));
  assert.equal(longTail.listing.status, 'published');
  assert.equal(longTail.review.status, 'passed');
});

test('auto review rejects critical IP-risk listings', () => {
  const store = new InMemoryMarketplaceStore({ clock: { now: () => 100 } });
  store.upsertCreator(creator());
  const result = store.submitListing(listingDraft({
    title: 'Ripped From Famous Game Pack',
    description: 'This stolen pack is ripped from a famous game and promises guaranteed sales for your launch.',
  }));
  assert.equal(result.listing.status, 'rejected');
  assert.equal(result.review.status, 'rejected');
  assert.ok(result.review.flags.some((flag) => flag.severity === 'critical'));
});

test('human approval cannot publish auto-rejected IP-risk listings', () => {
  const store = new InMemoryMarketplaceStore({ clock: { now: () => 101 } });
  store.upsertCreator(creator());
  const result = store.submitListing(listingDraft({
    title: 'Ripped From Famous Game Pack',
    description: 'This stolen pack is ripped from a famous game and promises guaranteed sales for your launch.',
  }));

  assert.equal(result.listing.status, 'rejected');
  assert.throws(
    () => store.approveReview(result.review.id, 'reviewer-1'),
    /rejected listing reviews cannot be approved/u,
  );
  assert.equal(store.listing(result.listing.id)?.status, 'rejected');
});

test('auto review routes off-platform contact details to human review without leaking PII', () => {
  const store = new InMemoryMarketplaceStore({ clock: { now: () => 120 } });
  store.upsertCreator(creator());
  const result = store.submitListing(listingDraft({
    title: 'Unity Boss Arena Template',
    description: 'A production-ready AI-assisted Unity boss arena template with readable attack tells, encounter pacing, arena hazards, and HUD states. Email me at creator@example.com or call +1 (415) 555-0100 for a direct deal.',
  }));

  assert.equal(result.listing.status, 'pending-human-review');
  assert.equal(result.review.status, 'human-required');
  const flag = result.review.flags.find((candidate) => candidate.id === 'off-platform-contact');
  assert.equal(flag?.severity, 'high');
  assert.match(flag?.reason ?? '', /route buyers around marketplace checkout/u);
  assert.doesNotMatch(JSON.stringify(result.review), /creator@example\.com|\+1 \(415\) 555-0100/u);
  assert.match(JSON.stringify(result.review), /\[redacted-email\]|\[redacted-phone\]/u);
});

test('purchase splits GMV, queues Stripe Connect payout, and writes tax evidence', async () => {
  const store = new InMemoryMarketplaceStore({ clock: { now: () => 200 } });
  store.upsertCreator(creator({ monthlyGmvCents: 0 }));
  const { listing } = store.submitListing(listingDraft());

  const result = await store.purchaseListing({ listingId: listing.id, buyerId: 'studio-buyer' });
  assert.equal(result.order.grossCents, 4_900);
  assert.equal(result.order.platformFeeCents, 735);
  assert.equal(result.order.creatorNetCents, 4_165);
  assert.equal(result.payout.status, 'queued');
  assert.equal(result.taxRecord.stripeTaxDelegated, true);
  assert.equal(result.taxRecord.stripeTaxCode, 'txcd_10000000');
  assert.equal(store.stats().gmvCents, 4_900);
  assert.equal(store.stats().activeCreatorsWithSales, 1);
});

test('marketplace mutations append sanitized hash-chained audit records', async () => {
  const auditLog = new InMemoryMarketplaceAuditLog(() => new Date('2026-05-20T00:00:00Z'));
  const metadata = publicProModuleListingMetadataFromEnvelope(signedProModuleEnvelope());
  const store = new InMemoryMarketplaceStore({
    clock: { now: () => 205 },
    auditLog,
  });
  store.upsertCreator(creator({
    email: 'creator@example.com',
    monthlyGmvCents: 0,
  }));
  const { listing } = store.submitListing(listingDraft({
    title: 'Audited Soulslike Combat Pack',
    category: 'pro-module',
    priceCents: 7_900,
    proModule: metadata,
  }));

  const purchased = await store.purchaseListing({
    listingId: listing.id,
    buyerId: 'studio-buyer@example.com',
  });
  assert.ok(purchased.entitlement);
  const claimed = store.claimEntitlement({
    lookupKey: purchased.entitlement.activation.lookupKey,
    licenseHash: '1'.repeat(16),
    moduleId: 'soulslike-combat-pack',
  });
  store.claimEntitlement({
    lookupKey: claimed.activation.lookupKey,
    licenseHash: '1'.repeat(16),
    moduleId: 'soulslike-combat-pack',
  });

  assert.deepEqual(store.verifyAuditLog(), { valid: true });
  assert.deepEqual(store.auditRecords().map((record) => record.action), [
    'creator.registered',
    'listing.created',
    'review.submitted',
    'listing.published',
    'order.recorded',
    'payout.queued',
    'entitlement.granted',
    'entitlement.claimed',
  ]);
  assert.equal(store.auditRecords({ action: 'entitlement.claimed' }).length, 1);
  const orderRecord = store.auditRecords({ action: 'order.recorded' })[0];
  assert.ok(orderRecord?.actorId.startsWith('buyer:'));
  assert.notEqual(orderRecord?.actorId, 'studio-buyer@example.com');
  const serialized = JSON.stringify(store.auditRecords());
  assert.equal(serialized.includes('studio-buyer@example.com'), false);
  assert.equal(serialized.includes('creator@example.com'), false);
  assert.equal(serialized.includes('acct_creator_1'), false);
  assert.equal(serialized.includes('tax_creator_1'), false);
  assert.equal(serialized.includes('1111111111111111'), false);
});

test('Checkout fulfillment audit records are idempotent and avoid raw Stripe session ids', async () => {
  const auditLog = new InMemoryMarketplaceAuditLog(() => new Date('2026-05-20T00:00:00Z'));
  const store = new InMemoryMarketplaceStore({
    clock: { now: () => 206 },
    auditLog,
  });
  store.upsertCreator(creator({ monthlyGmvCents: 0 }));
  const { listing } = store.submitListing(listingDraft({
    title: 'Audited Checkout Template',
    category: 'template',
    priceCents: 5_000,
  }));
  const plan = store.checkoutPlan({
    listingId: listing.id,
    buyerId: 'studio-buyer@example.com',
    successUrl: 'https://greybox.studio/marketplace/success',
    cancelUrl: 'https://greybox.studio/marketplace/cancel',
  });
  const metadata = plan.checkoutSessionRequest?.body.metadata;
  assert.ok(metadata);

  await store.fulfillCheckoutSession(checkoutCompletedEvent({
    listing,
    metadata,
    sessionId: 'cs_test_audit_checkout',
    paymentIntentId: 'pi_test_audit_checkout',
  }));
  const countAfterFirstFulfillment = store.auditRecords().length;
  const replay = await store.fulfillCheckoutSession(checkoutCompletedEvent({
    listing,
    metadata,
    sessionId: 'cs_test_audit_checkout',
    eventId: 'evt_replayed_audit_checkout',
    paymentIntentId: 'pi_test_audit_checkout',
  }));

  assert.equal(replay.idempotent, true);
  assert.equal(store.auditRecords().length, countAfterFirstFulfillment);
  assert.ok(store.auditRecords().some((record) => record.action === 'payout.sent'));
  const serialized = JSON.stringify(store.auditRecords());
  assert.equal(serialized.includes('studio-buyer@example.com'), false);
  assert.equal(serialized.includes('cs_test_audit_checkout'), false);
  assert.equal(serialized.includes('pi_test_audit_checkout'), false);
  assert.equal(serialized.includes('acct_creator_1'), false);
});

test('production marketplace stores require an explicit payout provider', () => {
  assert.throws(
    () => new InMemoryMarketplaceStore({ env: { NODE_ENV: 'production' } }),
    /requires a payoutProvider/u,
  );
  assert.doesNotThrow(() => new InMemoryMarketplaceStore({
    env: { NODE_ENV: 'production' },
    payoutProvider: new LiveStripeConnectProvider({ dryRun: true }),
  }));
});

test('payout reserve enforcement blocks direct transfers before provider submission', async () => {
  const providerCalls = { count: 0 };
  const store = new InMemoryMarketplaceStore({
    clock: { now: () => Date.UTC(2026, 4, 18) },
    payoutProvider: queuedPayoutProvider(providerCalls),
    payoutReservePolicy: {
      mode: 'enforce',
      availableReserveCents: 0,
    },
  });
  store.upsertCreator(creator({ monthlyGmvCents: 0 }));
  const { listing } = store.submitListing(listingDraft());

  const purchase = await store.purchaseListing({ listingId: listing.id, buyerId: 'studio-buyer' });

  assert.equal(providerCalls.count, 0);
  assert.equal(purchase.payout.status, 'blocked');
  assert.equal(purchase.payout.reason, 'risk_reserve_reserve_shortfall');
  assert.equal(purchase.payout.delivery, 'manual-transfer');
  assert.equal(store.reconciliationReport().summary.blockedPayouts, 1);
  assert.equal(store.riskReserveReport({ availableReserveCents: 0 }).summary.queuedOrSentPayoutCents, 0);
});

test('payout reserve enforcement allows direct transfers when reserve is funded', async () => {
  const providerCalls = { count: 0 };
  const store = new InMemoryMarketplaceStore({
    clock: { now: () => Date.UTC(2026, 4, 18) },
    payoutProvider: queuedPayoutProvider(providerCalls),
    payoutReservePolicy: {
      mode: 'enforce',
      availableReserveCents: 100_000,
    },
  });
  store.upsertCreator(creator({ monthlyGmvCents: 0 }));
  const { listing } = store.submitListing(listingDraft());

  const purchase = await store.purchaseListing({ listingId: listing.id, buyerId: 'studio-buyer' });

  assert.equal(providerCalls.count, 1);
  assert.equal(purchase.payout.status, 'queued');
  assert.equal(purchase.payout.reason, undefined);
});

test('reserve-blocked direct payouts release once reserves are funded', async () => {
  const providerCalls = { count: 0 };
  const store = new InMemoryMarketplaceStore({
    clock: { now: () => Date.UTC(2026, 4, 18) },
    auditLog: new InMemoryMarketplaceAuditLog(() => new Date(Date.UTC(2026, 4, 18))),
    payoutProvider: queuedPayoutProvider(providerCalls),
    payoutReservePolicy: {
      mode: 'enforce',
      availableReserveCents: 0,
    },
  });
  store.upsertCreator(creator({ monthlyGmvCents: 0 }));
  const { listing } = store.submitListing(listingDraft());
  const purchase = await store.purchaseListing({ listingId: listing.id, buyerId: 'studio-buyer' });

  const held = await store.releaseBlockedPayout({
    orderId: purchase.order.id,
    availableReserveCents: 0,
  });
  assert.equal(held.released, false);
  assert.equal(held.idempotent, false);
  assert.equal(held.payout.id, purchase.payout.id);
  assert.equal(providerCalls.count, 0);

  const released = await store.releaseBlockedPayout({
    orderId: purchase.order.id,
    availableReserveCents: 100_000,
    actorId: 'ops-lead',
    actorType: 'admin',
  });

  assert.equal(providerCalls.count, 1);
  assert.equal(released.released, true);
  assert.equal(released.idempotent, false);
  assert.equal(released.previousPayout.id, purchase.payout.id);
  assert.equal(released.payout.status, 'queued');
  assert.equal(released.order.payoutId, released.payout.id);
  assert.equal(store.reconciliationReport().summary.blockedPayouts, 0);
  assert.ok(store.auditRecords().some((record) => (
    record.action === 'payout.queued'
    && record.entityId === released.payout.id
    && record.metadata?.releasedFromPayoutId === purchase.payout.id
  )));

  const replay = await store.releaseBlockedPayout({
    orderId: purchase.order.id,
    availableReserveCents: 100_000,
    actorId: 'ops-lead',
    actorType: 'admin',
  });

  assert.equal(providerCalls.count, 1);
  assert.equal(replay.released, true);
  assert.equal(replay.idempotent, true);
  assert.equal(replay.previousPayout.id, purchase.payout.id);
  assert.equal(replay.payout.id, released.payout.id);
  assert.equal(replay.order.payoutId, released.payout.id);
});

test('reserve-blocked direct payouts stay held while the order has an open dispute', async () => {
  const providerCalls = { count: 0 };
  const store = new InMemoryMarketplaceStore({
    clock: { now: () => Date.UTC(2026, 4, 18) },
    payoutProvider: queuedPayoutProvider(providerCalls),
    payoutReservePolicy: {
      mode: 'enforce',
      availableReserveCents: 0,
    },
  });
  store.upsertCreator(creator({ monthlyGmvCents: 0 }));
  const { listing } = store.submitListing(listingDraft());
  const purchase = await store.purchaseListing({ listingId: listing.id, buyerId: 'studio-buyer' });
  const dispute = store.recordRiskEvent({
    type: 'dispute',
    orderId: purchase.order.id,
    amountCents: purchase.order.grossCents,
    status: 'open',
    stripeDisputeId: 'dp_test_open_payout_release',
    reason: 'chargeback_under_review',
  });

  const held = await store.releaseBlockedPayout({
    orderId: purchase.order.id,
    availableReserveCents: 100_000,
    actorId: 'ops-lead',
    actorType: 'admin',
  });

  assert.equal(held.released, false);
  assert.equal(held.idempotent, false);
  assert.equal(held.payout.id, purchase.payout.id);
  assert.equal(held.releaseBlocker?.code, 'open_dispute');
  assert.equal(held.releaseBlocker?.riskEventId, dispute.id);
  assert.equal(held.releaseBlocker?.amountCents, purchase.order.grossCents);
  assert.equal(providerCalls.count, 0);
  assert.equal(store.reconciliationReport().summary.blockedPayouts, 1);

  store.recordRiskEvent({
    type: 'dispute',
    orderId: purchase.order.id,
    amountCents: purchase.order.grossCents,
    status: 'won',
    stripeDisputeId: 'dp_test_open_payout_release',
  });

  const released = await store.releaseBlockedPayout({
    orderId: purchase.order.id,
    availableReserveCents: 100_000,
    actorId: 'ops-lead',
    actorType: 'admin',
  });

  assert.equal(released.released, true);
  assert.equal(released.payout.status, 'queued');
  assert.equal(providerCalls.count, 1);
});

test('reserve-blocked direct payouts stay held while the order has a pending refund', async () => {
  const providerCalls = { count: 0 };
  const store = new InMemoryMarketplaceStore({
    clock: { now: () => Date.UTC(2026, 4, 18) },
    payoutProvider: queuedPayoutProvider(providerCalls),
    payoutReservePolicy: {
      mode: 'enforce',
      availableReserveCents: 0,
    },
  });
  store.upsertCreator(creator({ monthlyGmvCents: 0 }));
  const { listing } = store.submitListing(listingDraft());
  const purchase = await store.purchaseListing({ listingId: listing.id, buyerId: 'studio-buyer' });
  const refund = store.recordRiskEvent({
    type: 'refund',
    orderId: purchase.order.id,
    amountCents: purchase.order.grossCents,
    status: 'open',
    stripeRefundId: 're_test_pending_payout_release',
    reason: 'requested_by_customer',
  });

  const held = await store.releaseBlockedPayout({
    orderId: purchase.order.id,
    availableReserveCents: 100_000,
    actorId: 'ops-lead',
    actorType: 'admin',
  });

  assert.equal(held.released, false);
  assert.equal(held.releaseBlocker?.code, 'open_refund');
  assert.equal(held.releaseBlocker?.riskEventId, refund.id);
  assert.equal(providerCalls.count, 0);

  store.recordRiskEvent({
    type: 'refund',
    orderId: purchase.order.id,
    amountCents: purchase.order.grossCents,
    status: 'resolved',
    stripeRefundId: 're_test_pending_payout_release',
  });

  const stillHeld = await store.releaseBlockedPayout({
    orderId: purchase.order.id,
    availableReserveCents: 100_000,
    actorId: 'ops-lead',
    actorType: 'admin',
  });

  assert.equal(stillHeld.released, false);
  assert.equal(stillHeld.releaseBlocker, undefined);
  assert.equal(stillHeld.riskReserveReport?.ready, false);
  assert.equal(providerCalls.count, 0);
});

test('payout reserve enforcement blocks Checkout fulfillment payout records when underfunded', async () => {
  const store = new InMemoryMarketplaceStore({
    clock: { now: () => Date.UTC(2026, 4, 18) },
    payoutReservePolicy: {
      mode: 'enforce',
      availableReserveCents: 0,
    },
  });
  store.upsertCreator(creator({ monthlyGmvCents: 0 }));
  const { listing } = store.submitListing(listingDraft());
  const plan = store.checkoutPlan({
    listingId: listing.id,
    buyerId: 'studio-buyer',
    successUrl: 'https://market.greybox.studio/success',
    cancelUrl: 'https://market.greybox.studio/cancel',
  });
  assert.ok(plan.checkoutSessionRequest);

  const fulfilled = await store.fulfillCheckoutSession(checkoutCompletedEvent({
    listing,
    metadata: plan.checkoutSessionRequest.body.metadata,
    sessionId: 'cs_test_reserve_blocked',
    paymentIntentId: 'pi_test_reserve_blocked',
  }));

  assert.equal(fulfilled.payout.status, 'blocked');
  assert.equal(fulfilled.payout.reason, 'risk_reserve_reserve_shortfall');
  assert.equal(fulfilled.payout.delivery, 'checkout-destination-charge');
  assert.equal(fulfilled.payout.stripeCheckoutSessionId, 'cs_test_reserve_blocked');
  assert.equal(fulfilled.payout.stripePaymentIntentId, 'pi_test_reserve_blocked');
  assert.equal(store.reconciliationReport().summary.blockedPayouts, 1);
  assert.equal(store.riskReserveReport({ availableReserveCents: 0 }).summary.queuedOrSentPayoutCents, 0);
});

test('reserve-blocked Checkout payout records release to sent once reserves are funded', async () => {
  const store = new InMemoryMarketplaceStore({
    clock: { now: () => Date.UTC(2026, 4, 18) },
    payoutReservePolicy: {
      mode: 'enforce',
      availableReserveCents: 0,
    },
  });
  store.upsertCreator(creator({ monthlyGmvCents: 0 }));
  const { listing } = store.submitListing(listingDraft());
  const plan = store.checkoutPlan({
    listingId: listing.id,
    buyerId: 'studio-buyer',
    successUrl: 'https://market.greybox.studio/success',
    cancelUrl: 'https://market.greybox.studio/cancel',
  });
  assert.ok(plan.checkoutSessionRequest);
  const fulfilled = await store.fulfillCheckoutSession(checkoutCompletedEvent({
    listing,
    metadata: plan.checkoutSessionRequest.body.metadata,
    sessionId: 'cs_test_reserve_release',
    paymentIntentId: 'pi_test_reserve_release',
  }));

  const released = await store.releaseBlockedPayout({
    orderId: fulfilled.order.id,
    availableReserveCents: 100_000,
  });

  assert.equal(released.released, true);
  assert.equal(released.previousPayout.id, fulfilled.payout.id);
  assert.equal(released.payout.status, 'sent');
  assert.equal(released.payout.delivery, 'checkout-destination-charge');
  assert.equal(released.payout.stripeCheckoutSessionId, 'cs_test_reserve_release');
  assert.equal(released.payout.stripePaymentIntentId, 'pi_test_reserve_release');
  assert.equal(store.reconciliationReport().summary.blockedPayouts, 0);
});

test('risk reserve report fails closed on refunds, disputes, and underfunded payout exposure', async () => {
  const store = new InMemoryMarketplaceStore({ clock: { now: () => Date.UTC(2026, 4, 18) } });
  store.upsertCreator(creator({ monthlyGmvCents: 0 }));
  const { listing } = store.submitListing(listingDraft());
  await store.purchaseListing({ listingId: listing.id, buyerId: 'studio-buyer' });

  const report = store.riskReserveReport({
    availableReserveCents: 0,
    reportedRefundsCents: 2_000,
    reportedDisputeCents: 200,
    minimumReserveBps: 500,
    minimumReserveCents: 0,
    maximumRefundRateBps: 1_000,
    maximumDisputeRateBps: 100,
    maximumUnreservedPayoutExposureBps: 2_000,
  });

  assert.equal(report.ready, false);
  assert.equal(report.summary.gmvCents, 4_900);
  assert.equal(report.summary.requiredReserveCents, 2_200);
  assert.equal(report.summary.reserveShortfallCents, 2_200);
  assert.equal(report.summary.manualTransferOrders, 1);
  assert.deepEqual(report.issues.map((issue) => issue.code).sort(), [
    'dispute_rate_high',
    'manual_transfer_exposure',
    'refund_rate_high',
    'reserve_shortfall',
    'unreserved_payout_exposure',
  ]);
  assert.ok(report.checks.some((check) => check.status === 'fail'));
});

test('risk events persist refund and dispute evidence into reserve calculations', async () => {
  const store = new InMemoryMarketplaceStore({ clock: { now: () => Date.UTC(2026, 4, 18) } });
  store.upsertCreator(creator({ monthlyGmvCents: 0 }));
  const { listing } = store.submitListing(listingDraft());
  const purchase = await store.purchaseListing({ listingId: listing.id, buyerId: 'studio-buyer' });

  const refund = store.recordRiskEvent({
    type: 'refund',
    orderId: purchase.order.id,
    amountCents: 1_000,
    status: 'resolved',
    reason: 'Duplicate purchase by qa@example.com +1 (555) 123-4567 from 10.0.0.42 for pi_risk_123 on acct_creator_1 with Bearer risk-admin-0123456789abcdef',
    stripeRefundId: 're_test_123',
  });
  const wonDispute = store.recordRiskEvent({
    type: 'dispute',
    orderId: purchase.order.id,
    amountCents: 500,
    status: 'won',
    stripeDisputeId: 'dp_won_123',
  });
  assert.equal(refund.creatorId, 'creator-1');
  assert.equal(refund.reason, 'Duplicate purchase by [redacted-email] [redacted-phone] from [redacted-ip] for [redacted-stripe-id] on [redacted-stripe-id] with [redacted-secret]');
  assert.equal(wonDispute.status, 'won');
  assert.deepEqual(store.listRiskEvents({ type: 'refund' }).map((event) => event.id), [refund.id]);
  assert.doesNotMatch(JSON.stringify(store.listRiskEvents()), /qa@example\.com|\+1 \(555\) 123-4567|10\.0\.0\.42|pi_risk_123|acct_creator_1|risk-admin-0123456789abcdef/u);

  const report = store.riskReserveReport({
    availableReserveCents: 0,
    minimumReserveBps: 500,
    minimumReserveCents: 0,
    maximumRefundRateBps: 1_000,
    maximumDisputeRateBps: 100,
  });

  assert.equal(report.ready, false);
  assert.equal(report.summary.recordedRefundsCents, 1_000);
  assert.equal(report.summary.recordedDisputeCents, 0);
  assert.equal(report.summary.reportedRefundsCents, 1_000);
  assert.equal(report.summary.reportedDisputeCents, 0);
  assert.ok(report.issues.some((issue) => issue.code === 'refund_rate_high'));
  assert.equal(JSON.stringify(report).includes('studio-buyer'), false);
});

test('refund risk events fail closed when cumulative Stripe evidence exceeds order gross', async () => {
  const store = new InMemoryMarketplaceStore({ clock: { now: () => Date.UTC(2026, 4, 18) } });
  store.upsertCreator(creator({ monthlyGmvCents: 0 }));
  const { listing } = store.submitListing(listingDraft());
  const purchase = await store.purchaseListing({ listingId: listing.id, buyerId: 'studio-buyer' });

  store.recordRiskEvent({
    type: 'refund',
    orderId: purchase.order.id,
    amountCents: 3_000,
    status: 'resolved',
    stripeRefundId: 're_partial_1',
  });

  assert.throws(
    () => store.recordRiskEvent({
      type: 'refund',
      orderId: purchase.order.id,
      amountCents: 2_000,
      status: 'resolved',
      stripeRefundId: 're_partial_2',
    }),
    /cumulative refund amount cannot exceed order gross/u,
  );
  assert.equal(store.listRiskEvents({ type: 'refund' }).length, 1);
  assert.equal(store.riskReserveReport().summary.recordedRefundsCents, 3_000);
});

test('risk events deduplicate Stripe refund and dispute replays by Stripe evidence id', async () => {
  let now = Date.UTC(2026, 4, 18);
  const store = new InMemoryMarketplaceStore({ clock: { now: () => now } });
  store.upsertCreator(creator({ monthlyGmvCents: 0 }));
  const { listing } = store.submitListing(listingDraft());
  const purchase = await store.purchaseListing({ listingId: listing.id, buyerId: 'studio-buyer' });

  const refund = store.recordRiskEvent({
    type: 'refund',
    orderId: purchase.order.id,
    amountCents: 1_000,
    status: 'resolved',
    stripeRefundId: 're_replay_123',
  });
  const refundReplay = store.recordRiskEvent({
    type: 'refund',
    orderId: purchase.order.id,
    amountCents: 1_000,
    status: 'resolved',
    stripeRefundId: 're_replay_123',
  });
  assert.equal(refundReplay.id, refund.id);

  const dispute = store.recordRiskEvent({
    type: 'dispute',
    orderId: purchase.order.id,
    amountCents: 750,
    status: 'open',
    stripeDisputeId: 'dp_replay_123',
  });
  now += 1_000;
  const closedDispute = store.recordRiskEvent({
    type: 'dispute',
    orderId: purchase.order.id,
    amountCents: 750,
    status: 'lost',
    stripeDisputeId: 'dp_replay_123',
  });
  assert.equal(closedDispute.id, dispute.id);
  assert.equal(closedDispute.status, 'lost');
  assert.equal(closedDispute.createdAt, dispute.createdAt);
  assert.equal(closedDispute.updatedAt, now);
  now += 1_000;
  const staleOpenDisputeReplay = store.recordRiskEvent({
    type: 'dispute',
    orderId: purchase.order.id,
    amountCents: 750,
    status: 'open',
    stripeDisputeId: 'dp_replay_123',
  });
  assert.equal(staleOpenDisputeReplay.status, 'lost');
  assert.equal(staleOpenDisputeReplay.updatedAt, closedDispute.updatedAt);

  assert.deepEqual(store.listRiskEvents({ type: 'refund' }).map((event) => event.id), [refund.id]);
  assert.deepEqual(store.listRiskEvents({ type: 'dispute' }).map((event) => event.id), [dispute.id]);
  assert.throws(
    () => store.recordRiskEvent({
      type: 'dispute',
      orderId: purchase.order.id,
      amountCents: 750,
      status: 'won',
      stripeDisputeId: 'dp_replay_123',
    }),
    /risk event stripe status conflict/u,
  );
  assert.throws(
    () => store.recordRiskEvent({
      type: 'refund',
      orderId: purchase.order.id,
      amountCents: 500,
      status: 'resolved',
      stripeRefundId: 're_replay_123',
    }),
    /risk event stripe id replay mismatch/u,
  );

  const report = store.riskReserveReport({
    availableReserveCents: 0,
    minimumReserveBps: 500,
    minimumReserveCents: 0,
    maximumRefundRateBps: 1_000,
    maximumDisputeRateBps: 100,
  });
  assert.equal(report.summary.recordedRefundsCents, 1_000);
  assert.equal(report.summary.recordedDisputeCents, 750);
});

test('risk reserve report passes when Checkout orders are covered by marketplace reserve', async () => {
  const store = new InMemoryMarketplaceStore({ clock: { now: () => Date.UTC(2026, 4, 18) } });
  store.upsertCreator(creator({ monthlyGmvCents: 0 }));
  const { listing } = store.submitListing(listingDraft());
  const plan = store.checkoutPlan({
    listingId: listing.id,
    buyerId: 'studio-buyer',
    successUrl: 'https://market.greybox.studio/success',
    cancelUrl: 'https://market.greybox.studio/cancel',
  });
  assert.ok(plan.checkoutSessionRequest);
  await store.fulfillCheckoutSession(checkoutCompletedEvent({
    listing,
    metadata: plan.checkoutSessionRequest.body.metadata,
    sessionId: 'cs_test_risk_reserve',
    taxAmountCents: 425,
  }));

  const report = store.riskReserveReport({ availableReserveCents: 100_000 });

  assert.equal(report.ready, true);
  assert.equal(report.summary.checkoutOrders, 1);
  assert.equal(report.summary.manualTransferOrders, 0);
  assert.equal(report.summary.reserveShortfallCents, 0);
  assert.deepEqual(report.issues, []);
  const serialized = JSON.stringify(report);
  assert.equal(serialized.includes('acct_creator_1'), false);
  assert.equal(serialized.includes('tax_creator_1'), false);
  assert.equal(serialized.includes('studio-buyer'), false);
});

test('Stripe Tax preview and transaction builders use category tax codes and buyer address only', async () => {
  const store = new InMemoryMarketplaceStore({ clock: { now: () => 210 } });
  store.upsertCreator(creator());
  const { listing } = store.submitListing(listingDraft({
    title: 'Consulting Hour',
    category: 'consulting-hour',
    priceCents: 20_000,
  }));

  const preview = store.taxPreview({
    listingId: listing.id,
    buyerId: 'studio-buyer',
    buyerTaxAddress: {
      country: 'us',
      postalCode: '94107',
      state: 'CA',
    },
  });
  assert.equal(preview.readiness.status, 'ready');
  assert.equal(preview.calculationRequest?.endpoint, '/v1/tax/calculations');
  assert.equal(preview.calculationRequest?.body.customer_details.address.country, 'US');
  assert.equal(preview.calculationRequest?.body.customer_details.address.postal_code, '94107');
  assert.equal(preview.calculationRequest?.body.customer_details.address_source, 'billing');
  assert.equal(preview.calculationRequest?.body.line_items[0]?.tax_code, 'txcd_20060000');
  assert.equal(preview.calculationRequest?.body.line_items[0]?.amount, 20_000);
  assert.equal(JSON.stringify(preview).includes('sk_live'), false);

  const purchased = await store.purchaseListing({
    listingId: listing.id,
    buyerId: 'studio-buyer',
    buyerTaxAddress: { country: 'US', postalCode: '94107' },
    stripeTaxCalculationId: 'taxcalc_marketplace_123',
    stripeTaxTransactionId: 'tax_123',
    taxAmountCents: 1_725,
  });
  assert.equal(purchased.taxRecord.buyerCountry, 'US');
  assert.equal(purchased.taxRecord.buyerPostalCode, '94107');
  assert.equal(purchased.taxRecord.stripeTaxCalculationId, 'taxcalc_marketplace_123');
  assert.equal(purchased.taxRecord.taxAmountCents, 1_725);
  assert.equal(purchased.taxRecord.transactionRequest?.endpoint, '/v1/tax/transactions/create_from_calculation');
  assert.equal(purchased.taxRecord.transactionRequest?.body.reference, purchased.order.id);
});

test('tax builders reject missing customer location and malformed calculation ids', () => {
  const store = new InMemoryMarketplaceStore({ clock: { now: () => 215 } });
  store.upsertCreator(creator());
  const { listing } = store.submitListing(listingDraft());
  const preview = buildMarketplaceTaxPreview({
    listing,
    buyerId: 'buyer-no-address',
  });
  assert.equal(preview.readiness.status, 'needs-customer-address');
  assert.equal(preview.calculationRequest, undefined);

  const order = {
    id: 'order-tax',
    buyerId: 'buyer-tax',
    creatorId: listing.creatorId,
    listingId: listing.id,
    grossCents: listing.priceCents,
    platformFeeCents: 735,
    creatorNetCents: 4_165,
    currency: 'usd' as const,
    createdAt: 1,
  };
  assert.throws(
    () => buildStripeTaxCalculationRequest({ order, listing, buyerTaxAddress: { country: 'USA' } }),
    /alpha-2/u,
  );
  assert.throws(
    () => buildStripeTaxTransactionCreateRequest({ order, listing, calculationId: 'calc_bad' }),
    /tax calculation id/u,
  );
});

test('Stripe Checkout session plans use destination charges, tax liability, and stable metadata', () => {
  const store = new InMemoryMarketplaceStore({ clock: { now: () => 230 } });
  store.upsertCreator(creator({ monthlyGmvCents: 0 }));
  const { listing } = store.submitListing(listingDraft({
    title: 'Readable Boss Arena Template',
    category: 'template',
    priceCents: 5_000,
  }));

  const plan = store.checkoutPlan({
    listingId: listing.id,
    buyerId: 'studio-buyer',
    successUrl: 'https://greybox.studio/marketplace/success?session_id={CHECKOUT_SESSION_ID}',
    cancelUrl: 'https://greybox.studio/marketplace/cancel',
  });
  const request = plan.checkoutSessionRequest;
  assert.equal(plan.readiness.status, 'ready');
  assert.equal(plan.orderPreview.platformFeeCents, 750);
  assert.equal(request?.endpoint, '/v1/checkout/sessions');
  assert.equal(request?.body.mode, 'payment');
  assert.equal(request?.body.automatic_tax.enabled, true);
  assert.equal(request?.body.automatic_tax.liability.account, 'acct_creator_1');
  assert.equal(request?.body.line_items[0]?.price_data.product_data.tax_code, 'txcd_10000000');
  assert.equal(request?.body.line_items[0]?.price_data.unit_amount, 5_000);
  assert.equal(request?.body.payment_intent_data.application_fee_amount, 750);
  assert.equal(request?.body.payment_intent_data.on_behalf_of, 'acct_creator_1');
  assert.equal(request?.body.payment_intent_data.transfer_data.destination, 'acct_creator_1');
  assert.equal(request?.body.metadata.greybox_listing_id, listing.id);
  assert.equal(request?.body.metadata.greybox_buyer_id, 'studio-buyer');
  assert.equal(request?.body.metadata.greybox_category, 'template');
  assert.equal(JSON.stringify(plan).includes('sk_live'), false);

  const directRequest = buildStripeCheckoutSessionRequest({
    listing,
    creator: creator(),
    buyerId: 'studio-buyer',
    successUrl: 'https://greybox.studio/marketplace/success',
    cancelUrl: 'https://greybox.studio/marketplace/cancel',
  });
  assert.equal(directRequest.idempotencyKey, request?.idempotencyKey);
});

test('Stripe Checkout session plans reject unsafe return URLs', () => {
  const store = new InMemoryMarketplaceStore({ clock: { now: () => 231 } });
  store.upsertCreator(creator({ monthlyGmvCents: 0 }));
  const { listing } = store.submitListing(listingDraft({
    title: 'Safe Return URL Template',
    category: 'template',
    priceCents: 5_000,
  }));

  assert.throws(
    () => store.checkoutPlan({
      listingId: listing.id,
      buyerId: 'studio-buyer',
      successUrl: 'http://greybox.studio/marketplace/success',
      cancelUrl: 'https://greybox.studio/marketplace/cancel',
    }),
    /successUrl must be an absolute https URL/u,
  );
  assert.throws(
    () => buildStripeCheckoutSessionRequest({
      listing,
      creator: creator(),
      buyerId: 'studio-buyer',
      successUrl: 'https://user:secret@greybox.studio/marketplace/success',
      cancelUrl: 'https://greybox.studio/marketplace/cancel',
    }),
    /successUrl must not include credentials/u,
  );
  assert.doesNotThrow(() => store.checkoutPlan({
    listingId: listing.id,
    buyerId: 'studio-buyer',
    successUrl: 'http://localhost:3000/marketplace/success',
    cancelUrl: 'http://127.0.0.1:3000/marketplace/cancel',
  }));
});

test('LiveStripeCheckoutClient submits encoded requests and returns the hosted URL', async () => {
  const store = new InMemoryMarketplaceStore({ clock: { now: () => 238 } });
  store.upsertCreator(creator());
  const { listing } = store.submitListing(listingDraft({
    title: 'Stripe Checkout Template',
    category: 'template',
    priceCents: 5_000,
  }));
  const request = buildStripeCheckoutSessionRequest({
    listing,
    creator: creator(),
    buyerId: 'studio-buyer',
    successUrl: 'https://greybox.studio/marketplace/success',
    cancelUrl: 'https://greybox.studio/marketplace/cancel',
  });
  let sawEncodedBody = false;
  const client = new LiveStripeCheckoutClient({
    apiKey: 'sk_test_marketplace_secret',
    stripeApiBase: 'https://stripe.test',
    fetchFn: async (url, init) => {
      assert.equal(url, 'https://stripe.test/v1/checkout/sessions');
      assert.equal(init?.method, 'POST');
      assert.equal((init?.headers as Record<string, string>)?.Authorization, 'Bearer sk_test_marketplace_secret');
      assert.equal((init?.headers as Record<string, string>)?.['Idempotency-Key'], request.idempotencyKey);
      assert.ok(init?.body instanceof URLSearchParams);
      const body = init.body;
      assert.equal(body.get('mode'), 'payment');
      assert.equal(body.get('line_items[0][price_data][unit_amount]'), '5000');
      assert.equal(body.get('payment_intent_data[transfer_data][destination]'), 'acct_creator_1');
      sawEncodedBody = true;
      return new Response(JSON.stringify({
        id: 'cs_test_created',
        url: 'https://checkout.stripe.com/c/pay/cs_test_created',
        livemode: false,
        expires_at: 1_800,
        payment_status: 'unpaid',
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      });
    },
  });

  const session = await client.createSession(request);

  assert.equal(sawEncodedBody, true);
  assert.equal(session.id, 'cs_test_created');
  assert.equal(session.url, 'https://checkout.stripe.com/c/pay/cs_test_created');
  assert.equal(session.expiresAt, 1_800);
  assert.equal(session.paymentStatus, 'unpaid');
});

test('LiveStripeCheckoutClient rejects non-Stripe Checkout session URLs', async () => {
  const store = new InMemoryMarketplaceStore({ clock: { now: () => 239 } });
  store.upsertCreator(creator());
  const { listing } = store.submitListing(listingDraft({
    title: 'Malicious Checkout URL Template',
    category: 'template',
    priceCents: 5_000,
  }));
  const request = buildStripeCheckoutSessionRequest({
    listing,
    creator: creator(),
    buyerId: 'studio-buyer',
    successUrl: 'https://greybox.studio/marketplace/success',
    cancelUrl: 'https://greybox.studio/marketplace/cancel',
  });
  const client = new LiveStripeCheckoutClient({
    apiKey: 'sk_test_marketplace_secret',
    stripeApiBase: 'https://stripe.test',
    fetchFn: async () => new Response(JSON.stringify({
      id: 'cs_test_created',
      url: 'https://example.com/pay/cs_test_created',
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    }),
  });

  await assert.rejects(
    () => client.createSession(request),
    /hosted on checkout\.stripe\.com/u,
  );
});

test('LiveStripeCheckoutClient redacts Stripe Checkout failures before surfacing them', async () => {
  const store = new InMemoryMarketplaceStore({ clock: { now: () => 239 } });
  store.upsertCreator(creator());
  const { listing } = store.submitListing(listingDraft({
    title: 'Checkout Failure Template',
    category: 'template',
    priceCents: 5_000,
  }));
  const request = buildStripeCheckoutSessionRequest({
    listing,
    creator: creator(),
    buyerId: 'studio-buyer',
    successUrl: 'https://greybox.studio/marketplace/success',
    cancelUrl: 'https://greybox.studio/marketplace/cancel',
  });
  const client = new LiveStripeCheckoutClient({
    apiKey: 'sk_test_marketplace_secret',
    stripeApiBase: 'https://stripe.test',
    fetchFn: async () => new Response(
      'Checkout cs_test_leaky failed for buyer@example.com at 10.0.0.42 with sk_live_checkout_secret and card 4242 4242 4242 4242',
      { status: 400 },
    ),
  });

  await assert.rejects(
    () => client.createSession(request),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /Stripe Checkout returned 400/u);
      assert.match(error.message, /\[redacted-email\]/u);
      assert.match(error.message, /\[redacted-ip\]/u);
      assert.match(error.message, /\[redacted-secret\]/u);
      assert.match(error.message, /\[redacted-card\]/u);
      assert.match(error.message, /\[redacted-stripe-id\]/u);
      assert.doesNotMatch(error.message, /buyer@example\.com|10\.0\.0\.42|sk_live_checkout_secret|4242 4242|cs_test_leaky/u);
      return true;
    },
  );
});

test('LiveStripeCheckoutClient redacts transport errors before surfacing them', async () => {
  const store = new InMemoryMarketplaceStore({ clock: { now: () => 239 } });
  store.upsertCreator(creator());
  const { listing } = store.submitListing(listingDraft({
    title: 'Checkout Transport Template',
    category: 'template',
    priceCents: 5_000,
  }));
  const request = buildStripeCheckoutSessionRequest({
    listing,
    creator: creator(),
    buyerId: 'studio-buyer',
    successUrl: 'https://greybox.studio/marketplace/success',
    cancelUrl: 'https://greybox.studio/marketplace/cancel',
  });
  const client = new LiveStripeCheckoutClient({
    apiKey: 'sk_test_marketplace_secret',
    stripeApiBase: 'https://stripe.test',
    fetchFn: async () => {
      throw new Error('network failed with Bearer checkouttransportsecret123456 and ops@example.com');
    },
  });

  await assert.rejects(
    () => client.createSession(request),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /stripe_checkout_transport_error/u);
      assert.match(error.message, /\[redacted-secret\]/u);
      assert.match(error.message, /\[redacted-email\]/u);
      assert.doesNotMatch(error.message, /checkouttransportsecret123456|ops@example\.com/u);
      return true;
    },
  );
});

test('Stripe network clients refuse non-Stripe API bases unless transport is injected', () => {
  const fetchFn: typeof fetch = async () => new Response('{}', { status: 200 });
  assert.throws(
    () => new LiveStripeCheckoutClient({
      apiKey: 'sk_live_marketplace',
      stripeApiBase: 'https://stripe.test',
    }),
    /api\.stripe\.com/u,
  );
  assert.throws(
    () => new LiveStripeConnectProvider({
      apiKey: 'sk_live_marketplace',
      stripeApiBase: 'http://api.stripe.com',
    }),
    /absolute https URL/u,
  );
  assert.doesNotThrow(() => new LiveStripeCheckoutClient({
    apiKey: 'sk_live_marketplace',
    stripeApiBase: 'https://stripe.test',
    fetchFn,
  }));
  assert.doesNotThrow(() => new LiveStripeConnectProvider({
    apiKey: 'sk_live_marketplace',
    stripeApiBase: 'https://stripe.test',
    fetchFn,
  }));
});

test('Checkout plans block unready creators before Stripe payment handoff', () => {
  const store = new InMemoryMarketplaceStore({ clock: { now: () => 235 } });
  store.upsertCreator(creator({
    stripeConnectAccountId: undefined,
    taxProfileId: undefined,
  }));
  const { listing } = store.submitListing(listingDraft());

  const plan = store.checkoutPlan({
    listingId: listing.id,
    buyerId: 'studio-buyer',
    successUrl: 'https://greybox.studio/marketplace/success',
    cancelUrl: 'https://greybox.studio/marketplace/cancel',
  });

  assert.equal(plan.readiness.status, 'blocked');
  assert.equal(plan.checkoutSessionRequest, undefined);
  assert.deepEqual(plan.readiness.requirements.map((requirement) => requirement.code), [
    'stripe_connect_account_required',
    'tax_profile_required',
  ]);
});

test('Checkout fulfillment records paid sessions idempotently without a second transfer request', async () => {
  const store = new InMemoryMarketplaceStore({ clock: { now: () => 240 } });
  store.upsertCreator(creator({ monthlyGmvCents: 0 }));
  const { listing } = store.submitListing(listingDraft({
    title: 'Checkout Fulfilled Template',
    category: 'template',
    priceCents: 5_000,
  }));
  const plan = store.checkoutPlan({
    listingId: listing.id,
    buyerId: 'studio-buyer',
    successUrl: 'https://greybox.studio/marketplace/success',
    cancelUrl: 'https://greybox.studio/marketplace/cancel',
  });
  const metadata = plan.checkoutSessionRequest?.body.metadata;
  assert.ok(metadata);

  const fulfilled = await store.fulfillCheckoutSession(checkoutCompletedEvent({
    listing,
    metadata,
    sessionId: 'cs_test_checkout_fulfilled',
    paymentIntentId: 'pi_test_checkout_fulfilled',
    amountTotalCents: 5_425,
    taxAmountCents: 425,
  }));

  assert.equal(fulfilled.idempotent, false);
  // Order id is derived from a SHA-256 hash of the Stripe session id so
  // session identifiers never leak into downstream audit / public surfaces.
  assert.match(fulfilled.order.id, /^checkout-[0-9a-f]{16}$/u);
  assert.equal(fulfilled.order.grossCents, 5_000);
  assert.equal(fulfilled.order.platformFeeCents, 750);
  assert.equal(fulfilled.order.stripeCheckoutSessionId, 'cs_test_checkout_fulfilled');
  assert.equal(fulfilled.order.stripePaymentIntentId, 'pi_test_checkout_fulfilled');
  assert.equal(fulfilled.payout.status, 'sent');
  assert.equal(fulfilled.payout.delivery, 'checkout-destination-charge');
  assert.equal(fulfilled.payout.amountCents, 4_250);
  assert.equal(fulfilled.taxRecord.stripeCheckoutSessionId, 'cs_test_checkout_fulfilled');
  assert.equal(fulfilled.taxRecord.stripePaymentIntentId, 'pi_test_checkout_fulfilled');
  assert.equal(fulfilled.taxRecord.stripeAutomaticTaxStatus, 'complete');
  assert.equal(fulfilled.taxRecord.stripeTaxLiabilityType, 'account');
  assert.equal(fulfilled.taxRecord.stripeTaxLiabilityAccount, 'acct_creator_1');
  assert.equal(fulfilled.taxRecord.taxAmountCents, 425);
  assert.equal(fulfilled.taxRecord.buyerCountry, 'US');
  assert.equal(fulfilled.taxRecord.buyerPostalCode, '10001');
  assert.equal(store.stats().gmvCents, 5_000);

  const replay = await store.fulfillCheckoutSession(checkoutCompletedEvent({
    listing,
    metadata,
    sessionId: 'cs_test_checkout_fulfilled',
    eventId: 'evt_replayed_checkout_fulfilled',
    paymentIntentId: 'pi_test_checkout_fulfilled',
    amountTotalCents: 5_425,
    taxAmountCents: 425,
  }));
  assert.equal(replay.idempotent, true);
  assert.equal(replay.order.id, fulfilled.order.id);
  assert.equal(store.stats().gmvCents, 5_000);
  assert.equal(store.stats().orders, 1);
});

test('Checkout fulfillment rejects idempotent replay metadata drift', async () => {
  const store = new InMemoryMarketplaceStore({ clock: { now: () => 243 } });
  store.upsertCreator(creator({ monthlyGmvCents: 0 }));
  const { listing } = store.submitListing(listingDraft({
    title: 'Checkout Replay Guard Template',
    category: 'template',
    priceCents: 5_000,
  }));
  const plan = store.checkoutPlan({
    listingId: listing.id,
    buyerId: 'studio-buyer',
    successUrl: 'https://greybox.studio/marketplace/success',
    cancelUrl: 'https://greybox.studio/marketplace/cancel',
  });
  const metadata = plan.checkoutSessionRequest?.body.metadata;
  assert.ok(metadata);

  await store.fulfillCheckoutSession(checkoutCompletedEvent({
    listing,
    metadata,
    sessionId: 'cs_test_checkout_replay_guard',
    paymentIntentId: 'pi_test_checkout_replay_guard',
  }));

  await assert.rejects(
    () => store.fulfillCheckoutSession(checkoutCompletedEvent({
      listing,
      metadata: {
        ...metadata,
        greybox_buyer_id: 'different-buyer',
      },
      sessionId: 'cs_test_checkout_replay_guard',
      eventId: 'evt_replayed_checkout_replay_guard',
      paymentIntentId: 'pi_test_checkout_replay_guard',
    })),
    /replay does not match stored order/iu,
  );

  await assert.rejects(
    () => store.fulfillCheckoutSession(checkoutCompletedEvent({
      listing,
      metadata,
      sessionId: 'cs_test_checkout_replay_guard',
      eventId: 'evt_replayed_checkout_payment_drift',
      paymentIntentId: 'pi_test_checkout_replay_different',
    })),
    /replay does not match stored order/iu,
  );

  await assert.rejects(
    () => store.fulfillCheckoutSession(checkoutCompletedEvent({
      listing,
      metadata,
      sessionId: 'cs_test_checkout_replay_guard',
      eventId: 'evt_replayed_checkout_tax_drift',
      paymentIntentId: 'pi_test_checkout_replay_guard',
      amountTotalCents: listing.priceCents + 1,
      taxAmountCents: 1,
    })),
    /replay does not match stored order/iu,
  );
  assert.equal(store.stats().orders, 1);
});

test('Checkout fulfillment rejects unpaid, tax-failed, and price-mismatched sessions', async () => {
  const store = new InMemoryMarketplaceStore({ clock: { now: () => 245 } });
  store.upsertCreator(creator());
  const { listing } = store.submitListing(listingDraft());
  const plan = store.checkoutPlan({
    listingId: listing.id,
    buyerId: 'studio-buyer',
    successUrl: 'https://greybox.studio/marketplace/success',
    cancelUrl: 'https://greybox.studio/marketplace/cancel',
  });
  const metadata = plan.checkoutSessionRequest?.body.metadata;
  assert.ok(metadata);

  await assert.rejects(
    store.fulfillCheckoutSession(checkoutCompletedEvent({ listing, metadata, paymentStatus: 'unpaid' })),
    /payment_status must be paid/u,
  );
  await assert.rejects(
    store.fulfillCheckoutSession(checkoutCompletedEvent({ listing, metadata, automaticTaxStatus: 'failed' })),
    /automatic tax must be complete/u,
  );
  await assert.rejects(
    store.fulfillCheckoutSession(checkoutCompletedEvent({
      listing,
      metadata,
      automaticTaxLiability: { type: 'self', account: 'acct_creator_1' },
    })),
    /automatic tax liability must be delegated/u,
  );
  await assert.rejects(
    store.fulfillCheckoutSession(checkoutCompletedEvent({
      listing,
      metadata,
      automaticTaxLiability: null,
    })),
    /automatic tax liability must be delegated/u,
  );
  await assert.rejects(
    store.fulfillCheckoutSession(checkoutCompletedEvent({
      listing,
      metadata,
      automaticTaxLiability: { type: 'account', account: 'acct_other_creator' },
    })),
    /tax liability account does not match/u,
  );
  await assert.rejects(
    store.fulfillCheckoutSession(checkoutCompletedEvent({
      listing,
      metadata,
      amountSubtotalCents: listing.priceCents - 1,
      amountTotalCents: listing.priceCents - 1,
    })),
    /subtotal does not match/u,
  );
  await assert.rejects(
    store.fulfillCheckoutSession(checkoutCompletedEvent({
      listing,
      metadata,
      amountTotalCents: listing.priceCents + 10,
      taxAmountCents: 5,
    })),
    /amount_total must equal/u,
  );
});

test('Stripe Connect readiness exposes account, onboarding, transfer, and tax blockers', async () => {
  const onboardableCreator = creator({
    email: 'creator@example.com',
    stripeConnectAccountId: undefined,
    taxProfileId: undefined,
  });
  const readiness = creatorPayoutReadiness(onboardableCreator);
  assert.equal(readiness.status, 'needs-onboarding');
  assert.equal(readiness.canReceivePayouts, false);
  assert.equal(readiness.nextAction, 'create_stripe_connect_account');
  assert.deepEqual(readiness.requirements.map((requirement) => requirement.code), [
    'stripe_connect_account_required',
    'tax_profile_required',
  ]);

  const accountRequest = buildStripeConnectAccountCreateRequest(onboardableCreator);
  assert.equal(accountRequest.endpoint, '/v1/accounts');
  assert.equal(accountRequest.body.type, 'express');
  assert.equal(accountRequest.body.email, 'creator@example.com');
  assert.deepEqual(accountRequest.body.capabilities, { transfers: { requested: true } });

  const connectedCreator = creator({
    stripeConnectAccountId: 'acct_ready_creator',
    taxProfileId: undefined,
  });
  const onboardingPlan = buildStripeConnectOnboardingPlan(connectedCreator, {
    returnUrl: 'https://greybox.studio/marketplace/return',
    refreshUrl: 'https://greybox.studio/marketplace/refresh',
  });
  assert.equal(onboardingPlan.readiness.nextAction, 'collect_tax_profile');
  assert.equal(onboardingPlan.accountCreateRequest, undefined);
  assert.equal(onboardingPlan.accountLinkRequest?.endpoint, '/v1/account_links');
  assert.equal(onboardingPlan.accountLinkRequest?.body.account, 'acct_ready_creator');

  const incompleteConnectCreator = creator({
    stripeConnectAccountId: 'acct_incomplete_creator',
    stripeConnectOnboardingComplete: false,
    stripeConnectTransfersEnabled: false,
    taxProfileId: 'tax-ready',
  });
  const incompleteReadiness = creatorPayoutReadiness(incompleteConnectCreator);
  assert.equal(incompleteReadiness.status, 'needs-onboarding');
  assert.equal(incompleteReadiness.canReceivePayouts, false);
  assert.equal(incompleteReadiness.nextAction, 'complete_stripe_connect_onboarding');
  assert.deepEqual(incompleteReadiness.requirements.map((requirement) => requirement.code), [
    'stripe_connect_onboarding_required',
  ]);

  const order = {
    id: 'order-ready',
    buyerId: 'buyer-1',
    creatorId: 'creator-1',
    listingId: 'listing-ready',
    grossCents: 10_000,
    platformFeeCents: 1_500,
    creatorNetCents: 8_500,
    currency: 'usd' as const,
    createdAt: 1,
  };
  const transferRequest = buildStripeConnectTransferRequest(order, creator({
    stripeConnectAccountId: 'acct_ready_creator',
    taxProfileId: 'tax-ready',
  }));
  assert.equal(transferRequest.endpoint, '/v1/transfers');
  assert.equal(transferRequest.idempotencyKey, 'greybox-transfer-order-ready');
  assert.equal(transferRequest.body.destination, 'acct_ready_creator');
  assert.equal(transferRequest.body.metadata.greybox_listing_id, 'listing-ready');
});

test('Stripe Connect onboarding rejects unsafe callback URLs before account-link creation', () => {
  const connectedCreator = creator({
    stripeConnectAccountId: 'acct_ready_creator',
    taxProfileId: undefined,
  });
  const accountlessCreator = creator({
    stripeConnectAccountId: undefined,
    taxProfileId: undefined,
  });

  assert.throws(
    () => buildStripeConnectAccountLinkRequest(connectedCreator, {
      returnUrl: 'http://greybox.studio/marketplace/return',
      refreshUrl: 'https://greybox.studio/marketplace/refresh',
    }),
    /returnUrl must be an https URL/u,
  );
  assert.throws(
    () => buildStripeConnectAccountLinkRequest(connectedCreator, {
      returnUrl: 'https://user:pass@greybox.studio/marketplace/return',
      refreshUrl: 'https://greybox.studio/marketplace/refresh',
    }),
    /returnUrl must not include credentials/u,
  );
  assert.throws(
    () => buildStripeConnectOnboardingPlan(connectedCreator, {
      returnUrl: 'https://greybox.studio/marketplace/return',
      refreshUrl: 'javascript:location.href="https://attacker.example"',
    }),
    /refreshUrl must be an https URL/u,
  );
  assert.throws(
    () => buildStripeConnectOnboardingPlan(accountlessCreator, {
      returnUrl: 'http://greybox.studio/marketplace/return',
      refreshUrl: 'https://greybox.studio/marketplace/refresh',
    }),
    /returnUrl must be an https URL/u,
  );
});

test('Stripe Connect onboarding creates accounts, persists creator state, and keeps audits sanitized', async () => {
  const auditLog = new InMemoryMarketplaceAuditLog(() => new Date('2026-05-20T00:00:00Z'));
  const calls = { accounts: 0, links: 0 };
  const onboardingProvider: StripeConnectOnboardingProvider = {
    async createAccount(inputCreator) {
      calls.accounts += 1;
      assert.equal(inputCreator.id, 'creator-1');
      assert.equal(inputCreator.stripeConnectAccountId, undefined);
      return {
        stripeConnectAccountId: 'acct_live_created_123',
        livemode: false,
      };
    },
    async createAccountLink(inputCreator, input) {
      calls.links += 1;
      assert.equal(inputCreator.stripeConnectAccountId, 'acct_live_created_123');
      assert.equal(input.returnUrl, 'https://greybox.studio/marketplace/return');
      return {
        url: `https://connect.stripe.com/setup/e/test_${calls.links}`,
        expiresAt: 1_800 + calls.links,
      };
    },
  };
  const store = new InMemoryMarketplaceStore({
    auditLog,
    stripeConnectOnboardingProvider: onboardingProvider,
  });
  store.upsertCreator(creator({
    email: 'creator@example.com',
    stripeConnectAccountId: undefined,
    taxProfileId: undefined,
  }));

  const created = await store.createStripeConnectOnboardingLink('creator-1', {
    returnUrl: 'https://greybox.studio/marketplace/return',
    refreshUrl: 'https://greybox.studio/marketplace/refresh',
  });

  assert.equal(created.account?.stripeConnectAccountId, 'acct_live_created_123');
  assert.equal(created.creator.stripeConnectAccountId, 'acct_live_created_123');
  assert.equal(created.creator.stripeConnectOnboardingComplete, false);
  assert.equal(created.creator.stripeConnectTransfersEnabled, false);
  assert.equal(created.accountLink.url, 'https://connect.stripe.com/setup/e/test_1');
  assert.equal(created.plan.readiness.nextAction, 'complete_stripe_connect_onboarding');
  assert.equal(store.creator('creator-1')?.stripeConnectAccountId, 'acct_live_created_123');
  assert.equal(store.creator('creator-1')?.stripeConnectOnboardingComplete, false);
  assert.equal(store.creator('creator-1')?.stripeConnectTransfersEnabled, false);

  const status = store.recordStripeConnectAccountStatus('creator-1', {
    onboardingComplete: true,
    transfersEnabled: true,
    syncedAt: 1_801,
    actorId: 'stripe-connect-sync',
    actorType: 'system',
  });
  assert.equal(status.readiness.nextAction, 'collect_tax_profile');
  assert.equal(status.accountStatus.onboardingComplete, true);
  assert.equal(status.accountStatus.transfersEnabled, true);

  const reused = await store.createStripeConnectOnboardingLink('creator-1', {
    returnUrl: 'https://greybox.studio/marketplace/return',
    refreshUrl: 'https://greybox.studio/marketplace/refresh',
  });
  assert.equal(reused.account, undefined);
  assert.equal(reused.accountLink.url, 'https://connect.stripe.com/setup/e/test_2');
  assert.deepEqual(calls, { accounts: 1, links: 2 });
  assert.deepEqual(store.auditRecords().map((record) => record.action), [
    'creator.registered',
    'creator.stripe_connect_account_created',
    'creator.stripe_connect_onboarding_link.created',
    'creator.stripe_connect_status.updated',
    'creator.stripe_connect_onboarding_link.created',
  ]);
  const serialized = JSON.stringify(store.auditRecords());
  assert.equal(serialized.includes('creator@example.com'), false);
  assert.equal(serialized.includes('acct_live_created_123'), false);
  assert.deepEqual(store.verifyAuditLog(), { valid: true });
});

test('tax profile evidence unlocks payout readiness without leaking raw tax references', async () => {
  const auditLog = new InMemoryMarketplaceAuditLog(() => new Date('2026-05-20T00:00:00Z'));
  const store = new InMemoryMarketplaceStore({
    auditLog,
    clock: { now: () => 1_234 },
  });
  store.upsertCreator(creator({
    stripeConnectAccountId: 'acct_tax_ready_123',
    taxProfileId: undefined,
  }));

  const recorded = store.recordCreatorTaxProfile('creator-1', {
    taxProfileId: 'taxprof_sensitive_123',
    provider: 'stripe-tax',
    country: 'US',
    collectedAt: 1_235,
    actorId: 'finance-admin',
    actorType: 'admin',
  });

  assert.equal(recorded.creator.hasTaxProfile, true);
  assert.equal(recorded.readiness.status, 'ready');
  assert.equal(recorded.readiness.hasTaxProfile, true);
  assert.equal(recorded.taxProfile.provider, 'stripe-tax');
  assert.equal(store.creator('creator-1')?.taxProfileId, 'taxprof_sensitive_123');
  assert.equal(JSON.stringify(recorded).includes('taxprof_sensitive_123'), false);

  const { listing } = store.submitListing(listingDraft({
    title: 'Tax Ready Unity Template',
    category: 'template',
  }));
  const purchase = await store.purchaseListing({ listingId: listing.id, buyerId: 'studio-buyer' });
  assert.equal(purchase.payout.status, 'queued');
  const serializedAudit = JSON.stringify(store.auditRecords());
  assert.equal(serializedAudit.includes('taxprof_sensitive_123'), false);
  assert.ok(store.auditRecords().some((record) => record.action === 'creator.tax_profile.recorded'));
});

test('Live Stripe Connect provider submits transfer requests with idempotency and retry', async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const provider = new LiveStripeConnectProvider({
    apiKey: 'sk_live_test_123',
    dryRun: false,
    stripeApiBase: 'https://stripe.test',
    maxRetries: 1,
    retryBackoffMs: 0,
    fetchFn: async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      if (calls.length === 1) return new Response('try again', { status: 500 });
      return new Response(JSON.stringify({
        id: 'tr_test_123',
        balance_transaction: 'txn_test_123',
      }), { status: 200 });
    },
  });
  const payout = await provider.createTransfer({
    id: 'order-live',
    buyerId: 'buyer-live',
    creatorId: 'creator-1',
    listingId: 'listing-live',
    grossCents: 10_000,
    platformFeeCents: 1_500,
    creatorNetCents: 8_500,
    currency: 'usd',
    createdAt: 1,
  }, creator({
    stripeConnectAccountId: 'acct_ready_creator',
    taxProfileId: 'tax-ready',
  }));

  assert.equal(payout.id, 'tr_test_123');
  assert.equal(payout.status, 'queued');
  assert.equal(payout.delivery, 'manual-transfer');
  assert.equal(payout.stripeTransferBalanceTransactionId, 'txn_test_123');
  assert.equal(calls.length, 2);
  assert.equal(calls[1]?.url, 'https://stripe.test/v1/transfers');
  const headers = calls[1]?.init.headers as Record<string, string>;
  assert.equal(headers['Idempotency-Key'], 'greybox-transfer-order-live');
  assert.equal(headers.Authorization, 'Bearer sk_live_test_123');
  assert.match(String(calls[1]?.init.body), /destination=acct_ready_creator/u);
  assert.match(String(calls[1]?.init.body), /amount=8500/u);
});

test('Live Stripe Connect provider blocks malformed successful transfer responses', async () => {
  const provider = new LiveStripeConnectProvider({
    apiKey: 'sk_live_test_123',
    dryRun: false,
    stripeApiBase: 'https://stripe.test',
    maxRetries: 0,
    fetchFn: async () => new Response(JSON.stringify({ id: 'po_not_a_stripe_transfer' }), { status: 200 }),
  });

  const payout = await provider.createTransfer({
    id: 'order-malformed-transfer',
    buyerId: 'buyer-malformed',
    creatorId: 'creator-1',
    listingId: 'listing-malformed',
    grossCents: 10_000,
    platformFeeCents: 1_500,
    creatorNetCents: 8_500,
    currency: 'usd',
    createdAt: 1,
  }, creator({
    stripeConnectAccountId: 'acct_ready_creator',
    taxProfileId: 'tax-ready',
  }));

  assert.equal(payout.id, 'payout-failed-order-malformed-transfer');
  assert.equal(payout.status, 'blocked');
  assert.equal(payout.reason, 'stripe_malformed_response:missing_transfer_id');
});

test('Live Stripe Connect provider redacts PII and secrets from transfer failures', async () => {
  const provider = new LiveStripeConnectProvider({
    apiKey: 'sk_live_test_123',
    dryRun: false,
    stripeApiBase: 'https://stripe.test',
    maxRetries: 0,
    fetchFn: async () => new Response(
      'Card 4242 4242 4242 4242 for qa@example.com from 10.0.0.42 failed on acct_ready_creator pi_live_failed tr_live_failed with sk_live_should_not_leak and Bearer payout-admin-0123456789abcdef',
      { status: 402 },
    ),
  });

  const payout = await provider.createTransfer({
    id: 'order-redact',
    buyerId: 'buyer-redact',
    creatorId: 'creator-1',
    listingId: 'listing-redact',
    grossCents: 10_000,
    platformFeeCents: 1_500,
    creatorNetCents: 8_500,
    currency: 'usd',
    createdAt: 1,
  }, creator({
    stripeConnectAccountId: 'acct_ready_creator',
    taxProfileId: 'tax-ready',
  }));

  assert.equal(payout.status, 'blocked');
  assert.match(payout.reason ?? '', /^stripe_402:/u);
  assert.match(payout.reason ?? '', /\[redacted-card\]/u);
  assert.match(payout.reason ?? '', /\[redacted-email\]/u);
  assert.match(payout.reason ?? '', /\[redacted-ip\]/u);
  assert.match(payout.reason ?? '', /\[redacted-secret\]/u);
  assert.match(payout.reason ?? '', /\[redacted-stripe-id\]/u);
  assert.doesNotMatch(payout.reason ?? '', /qa@example\.com|10\.0\.0\.42|sk_live_should_not_leak|payout-admin-0123456789abcdef|4242 4242|acct_ready_creator|pi_live_failed|tr_live_failed/u);
});

test('Live Stripe Connect provider redacts transport failures before surfacing', async () => {
  const leakyMessage = [
    'network for qa@example.com from 10.0.0.42 leaked',
    'acct_ready_creator pi_live_transport tr_live_transport re_live_transport',
    'with sk_live_transport_secret and Bearer transport-admin-0123456789abcdef',
  ].join(' ');
  const provider = new LiveStripeConnectProvider({
    apiKey: 'sk_live_test_123',
    dryRun: false,
    stripeApiBase: 'https://stripe.test',
    maxRetries: 0,
    retryBackoffMs: 1,
    fetchFn: async () => {
      throw new Error(leakyMessage);
    },
  });

  const payout = await provider.createTransfer({
    id: 'order-transport-redact',
    buyerId: 'buyer-redact',
    creatorId: 'creator-1',
    listingId: 'listing-redact',
    grossCents: 10_000,
    platformFeeCents: 1_500,
    creatorNetCents: 8_500,
    currency: 'usd',
    createdAt: 1,
  }, creator({
    stripeConnectAccountId: 'acct_ready_creator',
    taxProfileId: 'tax-ready',
  }));
  assert.equal(payout.status, 'blocked');
  assert.match(payout.reason ?? '', /^stripe_transport_exhausted:/u);
  assert.match(payout.reason ?? '', /\[redacted-email\]/u);
  assert.match(payout.reason ?? '', /\[redacted-ip\]/u);
  assert.match(payout.reason ?? '', /\[redacted-secret\]/u);
  assert.match(payout.reason ?? '', /\[redacted-stripe-id\]/u);
  assert.doesNotMatch(
    payout.reason ?? '',
    /qa@example\.com|10\.0\.0\.42|sk_live_transport_secret|transport-admin-0123456789abcdef|acct_ready_creator|pi_live_transport|tr_live_transport|re_live_transport/u,
  );

  const refund = await provider.createRefund({
    orderId: 'refund-transport-redact',
    stripePaymentIntentId: 'pi_live_transport',
    amountCents: 500,
    currency: 'usd',
  });
  assert.equal(refund.status, 'blocked');
  assert.match(refund.reason ?? '', /^stripe_transport_exhausted:/u);
  assert.doesNotMatch(
    refund.reason ?? '',
    /qa@example\.com|10\.0\.0\.42|sk_live_transport_secret|transport-admin-0123456789abcdef|acct_ready_creator|pi_live_transport|tr_live_transport|re_live_transport/u,
  );

  await assert.rejects(
    provider.createAccountLink(creator({
      stripeConnectAccountId: 'acct_ready_creator',
    }), {
      returnUrl: 'https://greybox.studio/marketplace/return',
      refreshUrl: 'https://greybox.studio/marketplace/refresh',
    }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /^stripe_connect_account_link_creator-1_transport_exhausted:/u);
      assert.match(error.message, /\[redacted-email\]/u);
      assert.match(error.message, /\[redacted-ip\]/u);
      assert.match(error.message, /\[redacted-secret\]/u);
      assert.match(error.message, /\[redacted-stripe-id\]/u);
      assert.doesNotMatch(
        error.message,
        /qa@example\.com|10\.0\.0\.42|sk_live_transport_secret|transport-admin-0123456789abcdef|acct_ready_creator|pi_live_transport|tr_live_transport|re_live_transport/u,
      );
      return true;
    },
  );
});

test('Live Stripe Connect provider submits account and onboarding link requests', async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const provider = new LiveStripeConnectProvider({
    apiKey: 'sk_live_test_123',
    dryRun: false,
    stripeApiBase: 'https://stripe.test',
    maxRetries: 0,
    fetchFn: async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      if (String(url).endsWith('/v1/accounts')) {
        return new Response(JSON.stringify({ id: 'acct_live_created_123', livemode: false }), { status: 200 });
      }
      return new Response(JSON.stringify({
        url: 'https://connect.stripe.com/setup/e/live_created_123',
        expires_at: 1_800,
      }), { status: 200 });
    },
  });

  const account = await provider.createAccount(creator({
    email: 'creator@example.com',
    stripeConnectAccountId: undefined,
  }));
  const link = await provider.createAccountLink(creator({
    stripeConnectAccountId: account.stripeConnectAccountId,
  }), {
    returnUrl: 'https://greybox.studio/marketplace/return',
    refreshUrl: 'https://greybox.studio/marketplace/refresh',
  });

  assert.equal(account.stripeConnectAccountId, 'acct_live_created_123');
  assert.equal(link.url, 'https://connect.stripe.com/setup/e/live_created_123');
  assert.equal(calls[0]?.url, 'https://stripe.test/v1/accounts');
  assert.equal(calls[1]?.url, 'https://stripe.test/v1/account_links');
  const accountHeaders = calls[0]?.init.headers as Record<string, string>;
  const linkHeaders = calls[1]?.init.headers as Record<string, string>;
  assert.equal(accountHeaders['Idempotency-Key'], 'greybox-connect-account-creator-1');
  assert.equal(linkHeaders['Idempotency-Key'], 'greybox-connect-onboarding-creator-1-acct_live_created_123');
  assert.match(String(calls[0]?.init.body), /email=creator%40example.com/u);
  assert.match(String(calls[1]?.init.body), /account=acct_live_created_123/u);
});

test('Live Stripe Connect provider rejects malformed onboarding link responses', async () => {
  const provider = new LiveStripeConnectProvider({
    apiKey: 'sk_live_test_123',
    dryRun: false,
    stripeApiBase: 'https://stripe.test',
    maxRetries: 0,
    fetchFn: async () => new Response(JSON.stringify({
      url: 'http://connect.stripe.com/setup/e/not_secure',
      expires_at: 1_800,
    }), { status: 200 }),
  });

  await assert.rejects(
    provider.createAccountLink(creator({
      stripeConnectAccountId: 'acct_ready_creator',
    }), {
      returnUrl: 'https://greybox.studio/marketplace/return',
      refreshUrl: 'https://greybox.studio/marketplace/refresh',
    }),
    /Stripe account link response url must be an https URL/u,
  );

  const spoofedHostProvider = new LiveStripeConnectProvider({
    apiKey: 'sk_live_test_123',
    dryRun: false,
    stripeApiBase: 'https://stripe.test',
    maxRetries: 0,
    fetchFn: async () => new Response(JSON.stringify({
      url: 'https://connect.stripe.com.attacker.example/setup/e/spoofed',
      expires_at: 1_800,
    }), { status: 200 }),
  });

  await assert.rejects(
    spoofedHostProvider.createAccountLink(creator({
      stripeConnectAccountId: 'acct_ready_creator',
    }), {
      returnUrl: 'https://greybox.studio/marketplace/return',
      refreshUrl: 'https://greybox.studio/marketplace/refresh',
    }),
    /Stripe account link response url must be hosted on connect\.stripe\.com/u,
  );
});

test('purchases block payout release until Stripe Connect and tax profile are ready', async () => {
  const store = new InMemoryMarketplaceStore({ clock: { now: () => 225 } });
  store.upsertCreator(creator({
    stripeConnectAccountId: undefined,
    taxProfileId: undefined,
  }));
  const { listing } = store.submitListing(listingDraft());

  const result = await store.purchaseListing({ listingId: listing.id, buyerId: 'studio-buyer' });
  assert.equal(result.payout.status, 'blocked');
  assert.match(result.payout.reason ?? '', /stripe_connect_account_required/u);
  assert.match(result.payout.reason ?? '', /tax_profile_required/u);
  assert.equal(store.stats().gmvCents, 4_900);
});

test('Pro module listings expose signed public metadata and never payload bodies', async () => {
  const metadata = publicProModuleListingMetadataFromEnvelope(signedProModuleEnvelope());
  assert.equal(metadata.mountCount, 2);
  assert.deepEqual(metadata.entitlement, {
    sku: 'gbpro.soulslike-combat-pack',
    licenseTier: 'pro',
    grantKey: 'pro-module:soulslike-combat-pack',
  });
  assert.equal(JSON.stringify(metadata).includes('entry'), false);

  const auditLog = new InMemoryMarketplaceAuditLog(() => new Date('2026-05-20T00:00:00Z'));
  const store = new InMemoryMarketplaceStore({ clock: { now: () => 250 }, auditLog });
  store.upsertCreator(creator());
  const { listing } = store.submitListing(listingDraft({
    title: 'Soulslike Combat Pack',
    category: 'pro-module',
    priceCents: 7_900,
    proModule: metadata,
  }));

  assert.equal(listing.status, 'published');
  assert.equal(listing.proModule?.manifest.id, 'soulslike-combat-pack');
  assert.equal(listing.proModule?.signature.algorithm, 'ed25519');
  assert.deepEqual(listing.proModule?.entitlement, {
    sku: 'gbpro.soulslike-combat-pack',
    licenseTier: 'pro',
    grantKey: 'pro-module:soulslike-combat-pack',
  });
  assert.equal(JSON.stringify(listing).includes('encryptedPayload'), false);
  assert.equal(JSON.stringify(listing).includes('body'), false);
  assert.equal(JSON.stringify(listing).includes('files'), false);

  const checkout = store.checkoutPlan({
    listingId: listing.id,
    buyerId: 'studio-buyer',
    successUrl: 'https://greybox.studio/marketplace/success',
    cancelUrl: 'https://greybox.studio/marketplace/cancel',
  });
  assert.equal(checkout.checkoutSessionRequest?.body.metadata.greybox_pro_module_id, 'soulslike-combat-pack');
  assert.equal(checkout.checkoutSessionRequest?.body.metadata.greybox_pro_module_version, '1.0.0');
  assert.equal(checkout.entitlementPreview?.proModule?.moduleId, 'soulslike-combat-pack');
  assert.equal(checkout.entitlementPreview?.proModule?.entitlementSku, 'gbpro.soulslike-combat-pack');
  assert.equal(checkout.entitlementPreview?.proModule?.entitlementGrantKey, 'pro-module:soulslike-combat-pack');
  assert.equal(checkout.entitlementPreview?.proModule?.entitlementLicenseTier, 'pro');
  assert.equal(checkout.entitlementPreview?.willIssue, true);

  const purchased = await store.purchaseListing({ listingId: listing.id, buyerId: 'studio-buyer' });
  assert.equal(purchased.entitlement?.status, 'active');
  assert.equal(purchased.entitlement?.proModule?.moduleId, 'soulslike-combat-pack');
  assert.equal(purchased.entitlement?.proModule?.entitlementSku, 'gbpro.soulslike-combat-pack');
  assert.equal(purchased.entitlement?.proModule?.entitlementGrantKey, 'pro-module:soulslike-combat-pack');
  assert.equal(purchased.entitlement?.proModule?.entitlementLicenseTier, 'pro');
  assert.match(purchased.entitlement?.activation.lookupKey ?? '', /^gbx_ent_[A-Za-z0-9_-]{32}$/u);
  assert.doesNotMatch(purchased.entitlement?.activation.lookupKey ?? '', /studio-buyer|soulslike-combat-pack/u);
  assert.deepEqual(store.listEntitlements({ buyerId: 'studio-buyer' }).map((item) => item.id), [purchased.entitlement?.id]);
  assert.deepEqual(store.listEntitlements({ lookupKey: purchased.entitlement?.activation.lookupKey }).map((item) => item.id), [purchased.entitlement?.id]);

  const entitlementId = purchased.entitlement?.id ?? '';
  const lookupKey = purchased.entitlement?.activation.lookupKey ?? '';
  const claimedAuditCountBeforeRejectedClaims = store.auditRecords({ action: 'entitlement.claimed' }).length;
  assert.throws(
    () => store.claimEntitlement({
      lookupKey: '../unsafe',
      licenseHash: '1'.repeat(16),
      moduleId: 'soulslike-combat-pack',
    }),
    /lookupKey/u,
  );
  assert.throws(
    () => store.claimEntitlement({
      lookupKey,
      licenseHash: '1'.repeat(16),
      moduleId: 'Soulslike Combat Pack',
    }),
    /moduleId/u,
  );
  assert.throws(
    () => store.claimEntitlement({
      lookupKey,
      licenseHash: '1'.repeat(16),
      entitlementSku: 'price_unsafe',
    }),
    /entitlementSku/u,
  );
  assert.throws(
    () => store.claimEntitlement({
      lookupKey,
      licenseHash: '1'.repeat(16),
      entitlementGrantKey: 'pro-module:../soulslike-combat-pack',
    }),
    /entitlementGrantKey/u,
  );
  assert.equal(store.entitlement(entitlementId)?.activation.licenseHash, undefined);
  assert.equal(store.auditRecords({ action: 'entitlement.claimed' }).length, claimedAuditCountBeforeRejectedClaims);

  const claimed = store.claimEntitlement({
    lookupKey: purchased.entitlement?.activation.lookupKey ?? '',
    licenseHash: '1'.repeat(16),
    moduleId: 'soulslike-combat-pack',
  });
  assert.equal(claimed.activation.licenseHash, '1'.repeat(16));
  assert.equal(store.claimEntitlement({
    lookupKey: claimed.activation.lookupKey,
    licenseHash: '1'.repeat(16),
    entitlementSku: 'gbpro.soulslike-combat-pack',
  }).activation.licenseHash, '1'.repeat(16));
  assert.equal(store.claimEntitlement({
    lookupKey: claimed.activation.lookupKey,
    licenseHash: '1'.repeat(16),
    entitlementGrantKey: 'pro-module:soulslike-combat-pack',
  }).proModule?.moduleId, 'soulslike-combat-pack');
  assert.throws(
    () => store.claimEntitlement({
      lookupKey: claimed.activation.lookupKey,
      licenseHash: '1'.repeat(16),
      entitlementSku: 'gbpro.wrong-module',
    }),
    /does not include/u,
  );
  assert.throws(
    () => store.claimEntitlement({
      lookupKey: claimed.activation.lookupKey,
      licenseHash: '2'.repeat(16),
      moduleId: 'soulslike-combat-pack',
    }),
    /already claimed/u,
  );
});

test('Pro module listings reject unsafe public mount entries before publication', () => {
  const unsafeEntry = signedProModuleEnvelope();
  const manifest = unsafeEntry.manifest as {
    mounts: { skills: Array<Record<string, unknown>> };
  };
  const firstSkillMount = manifest.mounts.skills[0];
  assert.ok(firstSkillMount);
  firstSkillMount.entry = 'skills/./leak.md';

  assert.throws(
    () => publicProModuleListingMetadataFromEnvelope(unsafeEntry),
    /skill\.entry is not a safe Pro module path/u,
  );
});

test('Checkout fulfillment issues Pro module entitlements for cloud activation', async () => {
  const metadata = publicProModuleListingMetadataFromEnvelope(signedProModuleEnvelope());
  const store = new InMemoryMarketplaceStore({ clock: { now: () => 255 } });
  store.upsertCreator(creator());
  const { listing } = store.submitListing(listingDraft({
    title: 'Soulslike Combat Pack',
    category: 'pro-module',
    priceCents: 7_900,
    proModule: metadata,
  }));
  const plan = store.checkoutPlan({
    listingId: listing.id,
    buyerId: 'studio-buyer',
    successUrl: 'https://greybox.studio/marketplace/success',
    cancelUrl: 'https://greybox.studio/marketplace/cancel',
  });
  const checkoutMetadata = plan.checkoutSessionRequest?.body.metadata;
  assert.ok(checkoutMetadata);

  const fulfilled = await store.fulfillCheckoutSession(checkoutCompletedEvent({
    listing,
    metadata: checkoutMetadata,
    sessionId: 'cs_test_pro_module',
    paymentIntentId: 'pi_test_pro_module',
  }));

  assert.equal(fulfilled.entitlement?.status, 'active');
  assert.equal(fulfilled.entitlement?.proModule?.moduleId, 'soulslike-combat-pack');
  assert.equal(fulfilled.entitlement?.proModule?.entitlementSku, 'gbpro.soulslike-combat-pack');
  assert.equal(fulfilled.entitlement?.proModule?.entitlementGrantKey, 'pro-module:soulslike-combat-pack');
  assert.match(fulfilled.entitlement?.activation.lookupKey ?? '', /^gbx_ent_[A-Za-z0-9_-]{32}$/u);
  assert.doesNotMatch(fulfilled.entitlement?.activation.lookupKey ?? '', /studio-buyer|soulslike-combat-pack/u);
  assert.deepEqual(store.listEntitlements({ lookupKey: fulfilled.entitlement?.activation.lookupKey }).map((item) => item.id), [
    fulfilled.entitlement?.id,
  ]);
});

test('marketplace reconciliation balances Checkout orders, payouts, tax evidence, and Pro entitlements', async () => {
  const metadata = publicProModuleListingMetadataFromEnvelope(signedProModuleEnvelope());
  const store = new InMemoryMarketplaceStore({ clock: { now: () => 256 } });
  store.upsertCreator(creator());
  const { listing } = store.submitListing(listingDraft({
    title: 'Reconciled Soulslike Combat Pack',
    category: 'pro-module',
    priceCents: 7_900,
    proModule: metadata,
  }));
  const plan = store.checkoutPlan({
    listingId: listing.id,
    buyerId: 'studio-buyer',
    successUrl: 'https://greybox.studio/marketplace/success',
    cancelUrl: 'https://greybox.studio/marketplace/cancel',
  });
  const checkoutMetadata = plan.checkoutSessionRequest?.body.metadata;
  assert.ok(checkoutMetadata);

  const fulfilled = await store.fulfillCheckoutSession(checkoutCompletedEvent({
    listing,
    metadata: checkoutMetadata,
    sessionId: 'cs_test_reconciled_checkout',
    paymentIntentId: 'pi_test_reconciled_checkout',
    taxAmountCents: 671,
  }));
  assert.ok(fulfilled.entitlement);
  store.claimEntitlement({
    lookupKey: fulfilled.entitlement.activation.lookupKey,
    licenseHash: 'f'.repeat(16),
    moduleId: 'soulslike-combat-pack',
  });

  const report = store.reconciliationReport();
  assert.equal(report.ready, true);
  assert.deepEqual(report.summary, {
    orders: 1,
    checkoutOrders: 1,
    directOrders: 0,
    gmvCents: 7_900,
    platformRevenueCents: 1_185,
    creatorNetCents: 6_715,
    payoutCents: 6_715,
    blockedPayouts: 0,
    taxAmountCents: 671,
    entitlementsIssued: 1,
    entitlementsClaimed: 1,
    creatorsWithSales: 1,
  });
  assert.deepEqual(report.checks.map((check) => [check.id, check.status]), [
    ['order-ledger', 'pass'],
    ['payout-ledger', 'pass'],
    ['tax-ledger', 'pass'],
    ['checkout-ledger', 'pass'],
    ['entitlement-ledger', 'pass'],
  ]);
  assert.deepEqual(report.issues, []);
});

test('marketplace reconciliation flags blocked payout release for creator onboarding', async () => {
  const store = new InMemoryMarketplaceStore({ clock: { now: () => 257 } });
  store.upsertCreator(creator({
    stripeConnectAccountId: undefined,
    taxProfileId: undefined,
  }));
  const { listing } = store.submitListing(listingDraft({
    title: 'Blocked Payout Template',
    category: 'template',
  }));

  await store.purchaseListing({ listingId: listing.id, buyerId: 'studio-buyer' });
  const report = store.reconciliationReport();
  assert.equal(report.ready, true);
  assert.equal(report.summary.blockedPayouts, 1);
  assert.equal(report.checks.find((check) => check.id === 'payout-ledger')?.status, 'warn');
  assert.deepEqual(report.issues.map((issue) => [issue.code, issue.severity, issue.referenceType]), [
    ['payout_blocked', 'warning', 'payout'],
  ]);
});

test('marketplace settlement report aggregates creator payouts and exports CSV', async () => {
  const store = new InMemoryMarketplaceStore({ clock: { now: () => 257.5 } });
  store.upsertCreator(creator({
    displayName: 'Avery, Loops',
  }));
  const { listing } = store.submitListing(listingDraft({
    title: 'Settlement, Boss Arena Template',
    category: 'template',
    priceCents: 8_000,
  }));
  const purchased = await store.purchaseListing({
    listingId: listing.id,
    buyerId: 'studio-buyer',
    buyerTaxAddress: { country: 'US', postalCode: '94107' },
    stripeTaxCalculationId: 'taxcalc_settlement_123',
    stripeTaxTransactionId: 'tax_txn_settlement_123',
    taxAmountCents: 680,
  });

  const report = store.settlementReport({ creatorId: 'creator-1', from: 200, to: 300 });
  assert.equal(report.summary.orders, 1);
  assert.equal(report.summary.grossCents, 8_000);
  assert.equal(report.summary.platformFeeCents, 1_200);
  assert.equal(report.summary.creatorNetCents, 6_800);
  assert.equal(report.summary.payoutCents, 6_800);
  assert.equal(report.summary.taxAmountCents, 680);
  assert.equal(report.creators[0]?.displayName, 'Avery, Loops');
  assert.equal(report.creators[0]?.hasStripeConnectAccount, true);
  assert.equal(report.creators[0]?.hasTaxProfile, true);
  assert.equal(report.lines[0]?.orderId, purchased.order.id);
  assert.equal(report.lines[0]?.stripeTaxCalculationId, 'taxcalc_settlement_123');
  assert.equal(JSON.stringify(report).includes('acct_creator_1'), false);
  assert.equal(JSON.stringify(report).includes('tax_creator_1'), false);

  const csv = store.settlementCsv({ creatorId: 'creator-1' });
  assert.match(csv, /^order_id,created_at,creator_id/u);
  assert.match(csv, /"Avery, Loops"/u);
  assert.match(csv, /"Settlement, Boss Arena Template"/u);
  assert.match(csv, /taxcalc_settlement_123,tax_txn_settlement_123/u);
});

test('manual Stripe transfer receipts make payouts settlement-ready without exposing creator secrets', async () => {
  const store = new InMemoryMarketplaceStore({
    clock: { now: () => 258 },
    payoutProvider: realTransferPayoutProvider(),
  });
  store.upsertCreator(creator({
    email: 'creator@example.com',
  }));
  const { listing } = store.submitListing(listingDraft({
    title: 'Manual Transfer Evidence Template',
    category: 'template',
    priceCents: 8_000,
  }));

  const purchased = await store.purchaseListing({
    listingId: listing.id,
    buyerId: 'buyer@example.com',
  });

  assert.match(purchased.payout.id, /^tr_test_order_1$/u);
  assert.equal(purchased.payout.status, 'queued');
  const receipts = store.listEventReceipts({ kind: 'payout', orderId: purchased.order.id });
  assert.equal(receipts.length, 1);
  assert.equal(receipts[0]?.receiptKey, purchased.payout.id);
  assert.equal(receipts[0]?.payoutId, purchased.payout.id);
  assert.equal(receipts[0]?.stripeTransferId, purchased.payout.id);
  assert.equal(receipts[0]?.stripeTransferBalanceTransactionId, 'txn_test_order_1');

  const report = store.settlementReport({ creatorId: 'creator-1' });
  assert.equal(report.summary.payoutCents, 6_800);
  assert.equal(report.summary.settledPayoutCents, 6_800);
  assert.equal(report.summary.queuedPayoutCents, 0);
  assert.equal(report.lines[0]?.payoutStatus, 'queued');
  assert.equal(report.lines[0]?.payoutSettlementStatus, 'settled');
  assert.equal(report.lines[0]?.payoutEvidenceKind, 'stripe_transfer');
  assert.equal(report.lines[0]?.payoutEvidenceReceiptId, receipts[0]?.id);
  assert.equal(report.lines[0]?.stripeTransferId, purchased.payout.id);
  assert.equal(report.lines[0]?.stripeTransferBalanceTransactionId, 'txn_test_order_1');
  const serialized = JSON.stringify(report);
  assert.equal(serialized.includes('acct_creator_1'), false);
  assert.equal(serialized.includes('tax_creator_1'), false);
  assert.equal(serialized.includes('creator@example.com'), false);
  assert.equal(serialized.includes('buyer@example.com'), false);

  const csv = store.settlementCsv({ creatorId: 'creator-1' });
  assert.match(csv, /payout_settlement_status,payout_evidence_kind,payout_evidence_receipt_id,stripe_transfer_id/u);
  assert.match(csv, /queued,manual-transfer,6800,settled,stripe_transfer,[^,]+,tr_test_order_1,txn_test_order_1/u);
  assert.equal(csv.includes('acct_creator_1'), false);
  assert.equal(csv.includes('tax_creator_1'), false);
  assert.equal(csv.includes('creator@example.com'), false);
  assert.equal(csv.includes('buyer@example.com'), false);

  const restored = new InMemoryMarketplaceStore({ clock: { now: () => 259 } })
    .restoreSnapshot(store.snapshot(), { audit: false });
  assert.equal(restored.listEventReceipts({ kind: 'payout', orderId: purchased.order.id }).length, 1);
  assert.equal(restored.settlementReport().summary.settledPayoutCents, 6_800);
});

test('mock and dry-run manual payouts remain queued without settlement evidence', async () => {
  const mockStore = new InMemoryMarketplaceStore({ clock: { now: () => 258.1 } });
  mockStore.upsertCreator(creator());
  const { listing: mockListing } = mockStore.submitListing(listingDraft({
    title: 'Mock Manual Payout Template',
    category: 'template',
    priceCents: 5_000,
  }));
  const mockPurchase = await mockStore.purchaseListing({
    listingId: mockListing.id,
    buyerId: 'studio-buyer',
  });

  assert.match(mockPurchase.payout.id, /^po_order-1$/u);
  assert.equal(mockStore.listEventReceipts({ kind: 'payout', orderId: mockPurchase.order.id }).length, 0);
  const mockReport = mockStore.settlementReport();
  assert.equal(mockReport.summary.settledPayoutCents, 0);
  assert.equal(mockReport.summary.queuedPayoutCents, 4_250);
  assert.equal(mockReport.lines[0]?.payoutSettlementStatus, 'queued');
  assert.equal(mockReport.lines[0]?.payoutEvidenceKind, undefined);

  const dryRunStore = new InMemoryMarketplaceStore({
    clock: { now: () => 258.2 },
    payoutProvider: new LiveStripeConnectProvider({ apiKey: 'sk_test_dryrun', dryRun: true }),
  });
  dryRunStore.upsertCreator(creator());
  const { listing: dryRunListing } = dryRunStore.submitListing(listingDraft({
    title: 'Dry Run Manual Payout Template',
    category: 'template',
    priceCents: 5_000,
  }));
  const dryRunPurchase = await dryRunStore.purchaseListing({
    listingId: dryRunListing.id,
    buyerId: 'studio-buyer',
  });

  assert.match(dryRunPurchase.payout.id, /^po_dryrun_order-1$/u);
  assert.equal(dryRunStore.listEventReceipts({ kind: 'payout', orderId: dryRunPurchase.order.id }).length, 0);
  const dryRunReport = dryRunStore.settlementReport();
  assert.equal(dryRunReport.summary.settledPayoutCents, 0);
  assert.equal(dryRunReport.summary.queuedPayoutCents, 4_250);
  assert.equal(dryRunReport.lines[0]?.payoutSettlementStatus, 'queued');
});

test('Checkout destination-charge payout receipts drive settlement evidence idempotently', async () => {
  const store = new InMemoryMarketplaceStore({ clock: { now: () => 258.3 } });
  store.upsertCreator(creator());
  const { listing } = store.submitListing(listingDraft({
    title: 'Checkout Settlement Evidence Template',
    category: 'template',
    priceCents: 5_000,
  }));
  const plan = store.checkoutPlan({
    listingId: listing.id,
    buyerId: 'studio-buyer',
    successUrl: 'https://greybox.studio/marketplace/success',
    cancelUrl: 'https://greybox.studio/marketplace/cancel',
  });
  assert.ok(plan.checkoutSessionRequest);
  const first = await store.fulfillCheckoutSession(checkoutCompletedEvent({
    listing,
    metadata: plan.checkoutSessionRequest.body.metadata,
    sessionId: 'cs_test_payout_receipt',
    eventId: 'evt_test_payout_receipt_first',
    paymentIntentId: 'pi_test_payout_receipt',
  }));
  const replay = await store.fulfillCheckoutSession(checkoutCompletedEvent({
    listing,
    metadata: plan.checkoutSessionRequest.body.metadata,
    sessionId: 'cs_test_payout_receipt',
    eventId: 'evt_test_payout_receipt_replay',
    paymentIntentId: 'pi_test_payout_receipt',
  }));

  assert.equal(replay.idempotent, true);
  const payoutReceipts = store.listEventReceipts({ kind: 'payout', orderId: first.order.id });
  assert.equal(payoutReceipts.length, 1);
  assert.equal(payoutReceipts[0]?.receiptKey, 'cs_test_payout_receipt');
  assert.equal(payoutReceipts[0]?.payoutId, first.payout.id);
  assert.equal(payoutReceipts[0]?.stripeEventId, 'evt_test_payout_receipt_first');
  assert.equal(payoutReceipts[0]?.lastStripeEventId, 'evt_test_payout_receipt_replay');
  assert.equal(payoutReceipts[0]?.replayCount, 1);

  const report = store.settlementReport();
  assert.equal(report.summary.settledPayoutCents, 4_250);
  assert.equal(report.summary.queuedPayoutCents, 0);
  assert.equal(report.lines[0]?.payoutSettlementStatus, 'settled');
  assert.equal(report.lines[0]?.payoutEvidenceKind, 'checkout_destination_charge');
  assert.equal(report.lines[0]?.payoutEvidenceReceiptId, payoutReceipts[0]?.id);
});

test('blocked payouts do not receive settlement evidence even when reserves are later required', async () => {
  const store = new InMemoryMarketplaceStore({
    clock: { now: () => 258.4 },
    payoutProvider: realTransferPayoutProvider(),
    payoutReservePolicy: {
      mode: 'enforce',
      availableReserveCents: 0,
      minimumReserveCents: 100_000,
      minimumReserveBps: 500,
    },
  });
  store.upsertCreator(creator());
  const { listing } = store.submitListing(listingDraft({
    title: 'Blocked Settlement Evidence Template',
    category: 'template',
    priceCents: 5_000,
  }));
  const purchased = await store.purchaseListing({
    listingId: listing.id,
    buyerId: 'studio-buyer',
  });

  assert.equal(purchased.payout.status, 'blocked');
  assert.equal(store.listEventReceipts({ kind: 'payout', orderId: purchased.order.id }).length, 0);
  const report = store.settlementReport();
  assert.equal(report.summary.settledPayoutCents, 0);
  assert.equal(report.summary.queuedPayoutCents, 0);
  assert.equal(report.summary.blockedPayouts, 1);
  assert.equal(report.lines[0]?.payoutSettlementStatus, 'blocked');
  assert.equal(report.lines[0]?.payoutEvidenceKind, undefined);
});

test('marketplace tax compliance report flags creator filing readiness and buyer-country totals', async () => {
  const store = new InMemoryMarketplaceStore({ clock: { now: () => 520 } });
  store.upsertCreator(creator({
    displayName: 'Avery, Loops',
    email: 'avery@example.com',
    stripeConnectAccountId: undefined,
    taxProfileId: undefined,
  }));
  const { listing } = store.submitListing(listingDraft({
    title: 'Tax Compliance Boss Template',
    category: 'template',
    priceCents: 8_000,
  }));

  await store.purchaseListing({
    listingId: listing.id,
    buyerId: 'studio-buyer-us',
    buyerTaxAddress: { country: 'US', postalCode: '94107' },
    stripeTaxCalculationId: 'taxcalc_compliance_us',
    stripeTaxTransactionId: 'tax_txn_compliance_us',
    taxAmountCents: 680,
  });
  await store.purchaseListing({
    listingId: listing.id,
    buyerId: 'studio-buyer-in',
    buyerTaxAddress: { country: 'IN', postalCode: '560001' },
    stripeTaxCalculationId: 'taxcalc_compliance_in',
    stripeTaxTransactionId: 'tax_txn_compliance_in',
    taxAmountCents: 1_440,
  });

  const report = store.taxComplianceReport({
    from: 500,
    to: 600,
    us1099KGrossThresholdCents: 10_000,
  });
  assert.equal(report.summary.orders, 2);
  assert.equal(report.summary.grossCents, 16_000);
  assert.equal(report.summary.taxAmountCents, 2_120);
  assert.equal(report.summary.reportable1099KCreators, 1);
  assert.equal(report.summary.missingStripeConnectAccounts, 1);
  assert.equal(report.summary.missingTaxProfiles, 1);
  assert.equal(report.creators[0]?.reportable1099K, true);
  assert.equal(report.creators[0]?.hasStripeConnectAccount, false);
  assert.equal(report.creators[0]?.hasTaxProfile, false);
  assert.equal(report.creators[0]?.missingStripeConnectAccount, true);
  assert.equal(report.creators[0]?.missingTaxProfile, true);
  assert.deepEqual(report.buyerCountries.map((country) => [country.country, country.orders, country.taxAmountCents]), [
    ['IN', 1, 1_440],
    ['US', 1, 680],
  ]);
  assert.deepEqual(report.issues.map((issue) => issue.code), [
    'creator_stripe_connect_account_missing',
    'creator_tax_profile_missing',
  ]);

  const csv = store.taxComplianceCsv({ us1099KGrossThresholdCents: 10_000 });
  assert.match(csv, /^record_type,reference_type,reference_id/u);
  assert.match(csv, /"Avery, Loops"/u);
  assert.match(csv, /creator_tax_profile_missing/u);
  assert.equal(csv.includes('avery@example.com'), false);
  assert.equal(csv.includes('94107'), false);
});

test('creator storefront exposes public listings and hides payout, tax, and buyer data', async () => {
  const store = new InMemoryMarketplaceStore({ clock: { now: () => 530 } });
  store.upsertCreator(creator({
    displayName: 'Avery Storefront',
    email: 'avery@example.com',
  }));
  const published = store.submitListing(listingDraft({
    title: 'Public Boss Arena Template',
    category: 'template',
    priceCents: 8_000,
    tags: ['boss', 'unity'],
  }), { creatorRankByGmv: 11, creatorCount: 20 });
  const pending = store.submitListing(listingDraft({
    title: 'Pending Human Review Toolkit',
    category: 'custom-skill',
    priceCents: 9_900,
  }), { creatorRankByGmv: 1, creatorCount: 20 });
  assert.equal(pending.listing.status, 'pending-human-review');
  await store.purchaseListing({
    listingId: published.listing.id,
    buyerId: 'studio-buyer',
    buyerTaxAddress: { country: 'US', postalCode: '94107' },
    stripeTaxCalculationId: 'taxcalc_storefront_123',
    stripeTaxTransactionId: 'tax_txn_storefront_123',
    taxAmountCents: 680,
  });

  const storefront = store.creatorStorefront('creator-1');
  assert.deepEqual(storefront.creator, {
    id: 'creator-1',
    displayName: 'Avery Storefront',
    country: 'US',
  });
  assert.deepEqual(storefront.stats, {
    publishedListings: 1,
    salesCount: 1,
    categories: ['template'],
    priceRangeCents: { min: 8_000, max: 8_000 },
  });
  assert.deepEqual(storefront.listings.map((listing) => listing.title), ['Public Boss Arena Template']);
  assert.deepEqual(storefront.listings[0]?.tags, ['boss', 'unity']);
  const serialized = JSON.stringify(storefront);
  assert.equal(serialized.includes('avery@example.com'), false);
  assert.equal(serialized.includes('acct_creator_1'), false);
  assert.equal(serialized.includes('tax_creator_1'), false);
  assert.equal(serialized.includes('studio-buyer'), false);
  assert.equal(serialized.includes('taxcalc_storefront_123'), false);
  assert.equal(serialized.includes('Pending Human Review Toolkit'), false);
});

test('catalog search ranks published listings and hides private commerce records', async () => {
  const store = new InMemoryMarketplaceStore({ clock: { now: () => 540 } });
  store.upsertCreator(creator({
    displayName: 'Avery Catalog',
    email: 'avery@example.com',
  }));
  store.upsertCreator(creator({
    id: 'creator-2',
    displayName: 'Mika Templates',
    stripeConnectAccountId: 'acct_creator_2',
  }));
  const boss = store.submitListing(listingDraft({
    title: 'Unity Boss Arena Template',
    category: 'template',
    priceCents: 8_000,
    tags: ['unity', 'boss'],
  }));
  store.submitListing(listingDraft({
    creatorId: 'creator-2',
    title: 'Cozy Sim Crop Planner',
    category: 'custom-art-bible',
    priceCents: 4_900,
    tags: ['cozy', 'economy'],
  }));
  store.submitListing(listingDraft({
    title: 'Pending Unity Combat Toolkit',
    category: 'custom-skill',
    priceCents: 9_900,
  }), { creatorRankByGmv: 1, creatorCount: 20 });
  await store.purchaseListing({
    listingId: boss.listing.id,
    buyerId: 'studio-buyer',
    buyerTaxAddress: { country: 'US', postalCode: '94107' },
    stripeTaxCalculationId: 'taxcalc_catalog_123',
    stripeTaxTransactionId: 'tax_txn_catalog_123',
    taxAmountCents: 680,
  });

  const catalog = store.catalogSearch({ query: 'unity boss', tag: 'boss', limit: 10 });
  assert.equal(catalog.total, 1);
  assert.equal(catalog.listings[0]?.title, 'Unity Boss Arena Template');
  assert.equal(catalog.listings[0]?.creator.displayName, 'Avery Catalog');
  assert.equal(catalog.listings[0]?.salesCount, 1);
  assert.deepEqual(catalog.facets.categories, [{ value: 'template', count: 1 }]);
  assert.deepEqual(catalog.facets.tags, [
    { value: 'boss', count: 1 },
    { value: 'unity', count: 1 },
  ]);

  const serialized = JSON.stringify(catalog);
  assert.equal(serialized.includes('avery@example.com'), false);
  assert.equal(serialized.includes('acct_creator_1'), false);
  assert.equal(serialized.includes('tax_creator_1'), false);
  assert.equal(serialized.includes('studio-buyer'), false);
  assert.equal(serialized.includes('taxcalc_catalog_123'), false);
  assert.equal(serialized.includes('Pending Unity Combat Toolkit'), false);
});

test('file-backed marketplace store restores finance records after restart', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-marketplace-store-'));
  const snapshotPath = path.join(dir, 'marketplace.snapshot.json');
  try {
    const store = new FileBackedMarketplaceStore({
      snapshotPath,
      clock: { now: () => 258 },
    });
    store.upsertCreator(creator());
    const { listing } = store.submitListing(listingDraft({
      title: 'Persistent Marketplace Template',
      category: 'template',
      priceCents: 5_900,
    }));
    const purchase = await store.purchaseListing({
      listingId: listing.id,
      buyerId: 'studio-buyer',
      buyerTaxAddress: { country: 'US', postalCode: '94107' },
      stripeTaxCalculationId: 'taxcalc_persisted_123',
      stripeTaxTransactionId: 'tax_txn_persisted_123',
      taxAmountCents: 503,
    });
    store.recordRiskEvent({
      type: 'dispute',
      orderId: purchase.order.id,
      amountCents: 590,
      status: 'open',
      stripeDisputeId: 'dp_persisted_123',
    });

    const restored = new FileBackedMarketplaceStore({
      snapshotPath,
      clock: { now: () => 259 },
    });
    assert.equal(restored.stats().orders, 1);
    assert.equal(restored.stats().gmvCents, 5_900);
    assert.equal(restored.listListings({ status: 'published' }).length, 1);
    assert.equal(restored.reconciliationReport().ready, true);
    assert.equal(restored.listRiskEvents({ type: 'dispute' }).length, 1);
    assert.equal(restored.riskReserveReport({ availableReserveCents: 0 }).summary.recordedDisputeCents, 590);

    const { listing: secondListing } = restored.submitListing(listingDraft({
      title: 'Persistent Marketplace Follow-Up Template',
      category: 'template',
      priceCents: 6_900,
    }));
    assert.equal(secondListing.id, 'listing-2');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('file-backed marketplace store reloads before mutation to avoid stale overwrites', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-marketplace-store-'));
  const snapshotPath = path.join(dir, 'marketplace.snapshot.json');
  try {
    const first = new FileBackedMarketplaceStore({
      snapshotPath,
      clock: { now: () => 260 },
    });
    const second = new FileBackedMarketplaceStore({
      snapshotPath,
      clock: { now: () => 261 },
    });

    first.upsertCreator(creator({
      id: 'creator-a',
      displayName: 'Creator A',
      stripeConnectAccountId: 'acct_creator_a',
      taxProfileId: 'tax_creator_a',
    }));
    second.upsertCreator(creator({
      id: 'creator-b',
      displayName: 'Creator B',
      stripeConnectAccountId: 'acct_creator_b',
      taxProfileId: 'tax_creator_b',
    }));
    second.submitListing(listingDraft({
      creatorId: 'creator-a',
      title: 'Reloaded Snapshot Template',
      category: 'template',
      priceCents: 6_900,
    }));

    const restored = new FileBackedMarketplaceStore({
      snapshotPath,
      clock: { now: () => 262 },
    });
    assert.equal(restored.creator('creator-a')?.displayName, 'Creator A');
    assert.equal(restored.creator('creator-b')?.displayName, 'Creator B');
    assert.equal(restored.listListings().length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('file-backed marketplace store reloads before refunding persisted Checkout orders', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-marketplace-refund-store-'));
  const snapshotPath = path.join(dir, 'marketplace.snapshot.json');
  try {
    const stale = new FileBackedMarketplaceStore({
      snapshotPath,
      clock: { now: () => 263 },
    });
    const active = new FileBackedMarketplaceStore({
      snapshotPath,
      clock: { now: () => 264 },
    });

    active.upsertCreator(creator());
    const { listing } = active.submitListing(listingDraft({
      title: 'Refundable Persistent Checkout Template',
      category: 'template',
      priceCents: 7_900,
    }));
    await fulfillCheckoutForBuyer(active, listing, 'refund-buyer', 'cs_test_file_refund');
    const order = active.orderByStripePaymentIntent('pi_cs_test_file_refund');
    assert.ok(order);

    const refund = await stale.refundOrder({
      orderId: order.id,
      amountCents: 1_000,
      actorId: 'admin-refund',
    });
    assert.equal(refund.riskEvent.type, 'refund');

    const restored = new FileBackedMarketplaceStore({
      snapshotPath,
      clock: { now: () => 265 },
    });
    assert.deepEqual(restored.listRiskEvents({ type: 'refund' }).map((event) => event.id), [
      refund.riskEvent.id,
    ]);
    assert.equal(restored.riskReserveReport({ availableReserveCents: 0 }).summary.recordedRefundsCents, 1_000);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('file-backed marketplace store persists event receipts for Checkout replays', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-marketplace-receipts-'));
  const snapshotPath = path.join(dir, 'marketplace.snapshot.json');
  try {
    const store = new FileBackedMarketplaceStore({
      snapshotPath,
      clock: { now: () => 266 },
    });
    store.upsertCreator(creator());
    const { listing } = store.submitListing(listingDraft({
      title: 'Persistent Checkout Receipt Template',
      category: 'template',
      priceCents: 5_900,
    }));
    const plan = store.checkoutPlan({
      listingId: listing.id,
      buyerId: 'receipt-buyer',
      successUrl: 'https://greybox.studio/marketplace/success',
      cancelUrl: 'https://greybox.studio/marketplace/cancel',
    });
    assert.ok(plan.checkoutSessionRequest);
    const first = await store.fulfillCheckoutSession(checkoutCompletedEvent({
      listing,
      metadata: plan.checkoutSessionRequest.body.metadata,
      sessionId: 'cs_test_receipt_persisted',
      eventId: 'evt_test_receipt_first',
      paymentIntentId: 'pi_test_receipt_persisted',
    }));

    const restored = new FileBackedMarketplaceStore({
      snapshotPath,
      clock: { now: () => 267 },
    });
    const replay = await restored.fulfillCheckoutSession(checkoutCompletedEvent({
      listing,
      metadata: plan.checkoutSessionRequest.body.metadata,
      sessionId: 'cs_test_receipt_persisted',
      eventId: 'evt_test_receipt_replay',
      paymentIntentId: 'pi_test_receipt_persisted',
    }));

    assert.equal(replay.idempotent, true);
    const receipts = restored.listEventReceipts({
      kind: 'checkout.session.completed',
      orderId: first.order.id,
    });
    assert.equal(receipts.length, 1);
    assert.equal(receipts[0]?.receiptKey, 'cs_test_receipt_persisted');
    assert.equal(receipts[0]?.stripeEventId, 'evt_test_receipt_first');
    assert.equal(receipts[0]?.lastStripeEventId, 'evt_test_receipt_replay');
    assert.equal(receipts[0]?.replayCount, 1);
    const payoutReceipts = restored.listEventReceipts({
      kind: 'payout',
      orderId: first.order.id,
    });
    assert.equal(payoutReceipts.length, 1);
    assert.equal(payoutReceipts[0]?.receiptKey, 'cs_test_receipt_persisted');
    assert.equal(payoutReceipts[0]?.payoutId, first.payout.id);
    assert.equal(payoutReceipts[0]?.replayCount, 1);

    const afterReplay = new FileBackedMarketplaceStore({
      snapshotPath,
      clock: { now: () => 268 },
    });
    assert.equal(afterReplay.listEventReceipts({
      kind: 'checkout.session.completed',
      orderId: first.order.id,
    })[0]?.replayCount, 1);
    assert.equal(afterReplay.listEventReceipts({ kind: 'payout', orderId: first.order.id })[0]?.replayCount, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('Pro module listing boundary rejects encrypted payload material', () => {
  const store = new InMemoryMarketplaceStore({ clock: { now: () => 260 } });
  store.upsertCreator(creator());

  assert.throws(
    () => store.submitListing(listingDraft({
      title: 'Unsafe Pro Bundle',
      category: 'pro-module',
      priceCents: 7_900,
      proModule: signedProModuleEnvelope({ encryptedPayload: 'secret-ciphertext' }) as unknown as ProModuleListingMetadata,
    })),
    /encryptedPayload is not allowed/u,
  );
  assert.throws(
    () => store.submitListing(listingDraft({
      title: 'Metadata Missing Bundle',
      category: 'pro-module',
      priceCents: 7_900,
    })),
    /signed public bundle metadata/u,
  );
});

test('marketplace launch readiness fails closed on catalog, review, payout, and tax blockers', async () => {
  const store = new InMemoryMarketplaceStore({ clock: { now: () => 270 } });
  store.upsertCreator(creator({
    stripeConnectAccountId: undefined,
    taxProfileId: undefined,
  }));
  const { listing } = store.submitListing(listingDraft({
    title: 'Launch Blocked Template',
    category: 'template',
    priceCents: 5_000,
  }));
  await store.purchaseListing({
    listingId: listing.id,
    buyerId: 'studio-buyer',
    buyerTaxAddress: { country: 'US', postalCode: '10001' },
  });
  const pending = store.submitListing(listingDraft({
    title: 'Launch Pending Human Review Toolkit',
    category: 'custom-skill',
    priceCents: 9_900,
  }), { creatorRankByGmv: 1, creatorCount: 20 });
  assert.equal(pending.listing.status, 'pending-human-review');

  const report = store.launchReadiness({
    monthlyGmvCents: 5_000,
    activeCreatorsWithSales: 1,
    minimumPublishedListings: 2,
  });

  assert.equal(report.ready, false);
  assert.equal(report.summary.publishedListings, 1);
  assert.equal(report.summary.pendingHumanReviews, 1);
  assert.equal(report.summary.blockedPayouts, 1);
  assert.equal(report.summary.taxComplianceIssues, 1);
  assert.deepEqual(report.issues.map((issue) => issue.code).sort(), [
    'blocked_payouts',
    'human_review_backlog',
    'published_listing_shortfall',
    'tax_compliance_issues',
  ]);
  assert.deepEqual(report.checks.map((check) => [check.id, check.status]), [
    ['growth-targets', 'pass'],
    ['catalog-depth', 'fail'],
    ['review-backlog', 'fail'],
    ['payout-blockers', 'fail'],
    ['tax-readiness', 'fail'],
  ]);
});

test('marketplace launch readiness passes once launch targets and finance gates are clean', async () => {
  const store = new InMemoryMarketplaceStore({ clock: { now: () => 280 } });
  for (let index = 1; index <= 2; index += 1) {
    const creatorId = `creator-ready-${index}`;
    store.upsertCreator(creator({
      id: creatorId,
      displayName: `Ready Creator ${index}`,
      stripeConnectAccountId: `acct_ready_${index}`,
      taxProfileId: `tax_ready_${index}`,
    }));
    const { listing } = store.submitListing(listingDraft({
      creatorId,
      title: `Launch Ready Template ${index}`,
      category: 'template',
      priceCents: 5_000,
    }));
    await store.purchaseListing({
      listingId: listing.id,
      buyerId: `studio-buyer-${index}`,
      buyerTaxAddress: { country: 'US', postalCode: '10001' },
      stripeTaxCalculationId: `taxcalc_launch_ready_${index}`,
      stripeTaxTransactionId: `tax_txn_launch_ready_${index}`,
      taxAmountCents: 425,
    });
  }

  const report = store.launchReadiness({
    monthlyGmvCents: 10_000,
    activeCreatorsWithSales: 2,
    minimumPublishedListings: 2,
  });

  assert.equal(report.ready, true);
  assert.equal(report.growth.achieved, true);
  assert.deepEqual(report.summary, {
    publishedListings: 2,
    pendingHumanReviews: 0,
    rejectedListings: 0,
    blockedPayouts: 0,
    taxComplianceIssues: 0,
    activeCreatorsWithSales: 2,
    gmvCents: 10_000,
  });
  assert.deepEqual(report.checks.map((check) => check.status), ['pass', 'pass', 'pass', 'pass', 'pass']);
  assert.deepEqual(report.issues, []);
});

test('platform target can prove 50 creator sellers and $25K monthly GMV progress', async () => {
  const store = new InMemoryMarketplaceStore({ clock: { now: () => 300 } });
  for (let index = 1; index <= 50; index += 1) {
    const creatorId = `creator-${index}`;
    store.upsertCreator(creator({
      id: creatorId,
      displayName: `Creator ${index}`,
      stripeConnectAccountId: `acct_${index}`,
    }));
    const { listing } = store.submitListing(listingDraft({
      creatorId,
      title: `Game Design Consulting Hour ${index}`,
      category: 'consulting-hour',
      priceCents: 50_000,
    }), { creatorRankByGmv: index, creatorCount: 50 });
    if (listing.status === 'pending-human-review' && listing.reviewId) {
      store.approveReview(listing.reviewId, 'reviewer-1');
    }
    await store.purchaseListing({ listingId: listing.id, buyerId: `buyer-${index}` });
  }
  const stats = store.stats();
  assert.equal(stats.activeCreatorsWithSales, 50);
  assert.equal(stats.gmvCents, 2_500_000);
  assert.ok(stats.platformRevenueCents > 0);
  assert.deepEqual(store.growthProgress(), {
    targets: {
      monthlyGmvCents: 2_500_000,
      activeCreatorsWithSales: 50,
    },
    period: {
      from: 0,
      to: 2_678_400_000,
      label: '1970-01',
    },
    stats: {
      ...stats,
      period: {
        from: 0,
        to: 2_678_400_000,
        label: '1970-01',
      },
    },
    monthlyGmvProgress: 1,
    activeCreatorProgress: 1,
    achieved: true,
    shortfalls: [],
  });
});

test('creator activation report shows supply health, repeat sellers, and payout blockers without private data', async () => {
  const store = new InMemoryMarketplaceStore({ clock: { now: () => Date.UTC(2026, 4, 18) } });
  store.upsertCreator(creator({
    id: 'creator-repeat',
    displayName: 'Repeat Seller',
    email: 'repeat@example.com',
    stripeConnectAccountId: 'acct_repeat',
    taxProfileId: 'tax_repeat',
  }));
  store.upsertCreator(creator({
    id: 'creator-blocked',
    displayName: 'Blocked Seller',
    email: 'blocked@example.com',
    stripeConnectAccountId: undefined,
    taxProfileId: undefined,
  }));
  store.upsertCreator(creator({
    id: 'creator-dormant',
    displayName: 'Dormant Creator',
  }));
  store.upsertCreator(creator({
    id: 'creator-inactive',
    displayName: 'Inactive Creator',
    active: false,
  }));

  const repeatListing = store.submitListing(listingDraft({
    creatorId: 'creator-repeat',
    title: 'Repeatable Boss Arena Template',
    category: 'template',
    priceCents: 8_000,
  }), { creatorRankByGmv: 12, creatorCount: 20 });
  await store.purchaseListing({
    listingId: repeatListing.listing.id,
    buyerId: 'buyer-repeat-1',
    buyerTaxAddress: { country: 'US', postalCode: '10001' },
    stripeTaxCalculationId: 'taxcalc_activation_repeat_1',
  });
  await store.purchaseListing({
    listingId: repeatListing.listing.id,
    buyerId: 'buyer-repeat-2',
    buyerTaxAddress: { country: 'US', postalCode: '10001' },
    stripeTaxCalculationId: 'taxcalc_activation_repeat_2',
  });

  const blockedListing = store.submitListing(listingDraft({
    creatorId: 'creator-blocked',
    title: 'Blocked Payout Combat Template',
    category: 'template',
    priceCents: 7_000,
  }), { creatorRankByGmv: 12, creatorCount: 20 });
  await store.purchaseListing({
    listingId: blockedListing.listing.id,
    buyerId: 'buyer-blocked',
  });
  const pending = store.submitListing(listingDraft({
    creatorId: 'creator-blocked',
    title: 'Manual Review Combat Skill',
    category: 'custom-skill',
    priceCents: 9_900,
  }), { creatorRankByGmv: 1, creatorCount: 20 });
  assert.equal(pending.listing.status, 'pending-human-review');

  const report = store.creatorActivationReport({
    monthlyGmvCents: 20_000,
    activeCreatorsWithSales: 3,
    minimumActiveCreators: 3,
    repeatSellers: 2,
    repeatSellerMinimumOrders: 2,
  });

  assert.equal(report.achieved, false);
  assert.equal(report.period.label, '2026-05');
  assert.deepEqual(report.summary, {
    totalCreators: 4,
    activeCreators: 3,
    inactiveCreators: 1,
    sellingCreators: 2,
    repeatSellers: 1,
    gmvCents: 23_000,
    platformRevenueCents: 3_450,
    creatorNetCents: 19_550,
    orders: 3,
    publishedListings: 2,
    pendingHumanReviews: 1,
    payoutReadyCreators: 2,
    payoutBlockedCreators: 1,
  });
  assert.deepEqual(report.topCreators.map((creator) => [creator.creatorId, creator.orders, creator.grossCents]), [
    ['creator-repeat', 2, 16_000],
    ['creator-blocked', 1, 7_000],
  ]);
  assert.deepEqual(report.shortfalls.map((shortfall) => shortfall.code).sort(), [
    'payout_blockers',
    'repeat_seller_shortfall',
    'selling_creator_shortfall',
  ]);
  assert.equal(report.creators.find((item) => item.creatorId === 'creator-blocked')?.payoutStatus, 'needs-onboarding');
  const serialized = JSON.stringify(report);
  assert.equal(serialized.includes('repeat@example.com'), false);
  assert.equal(serialized.includes('blocked@example.com'), false);
  assert.equal(serialized.includes('acct_repeat'), false);
  assert.equal(serialized.includes('tax_repeat'), false);
  assert.equal(serialized.includes('buyer-repeat'), false);
  assert.equal(serialized.includes('taxcalc_activation'), false);
});

test('platform readiness proves marketplace liquidity without leaking private creator or buyer data', async () => {
  const store = new InMemoryMarketplaceStore({ clock: { now: () => Date.UTC(2026, 4, 18) } });
  for (let index = 1; index <= 3; index += 1) {
    store.upsertCreator(creator({
      id: `creator-${index}`,
      displayName: `Platform Creator ${index}`,
      email: `creator-${index}@example.com`,
      stripeConnectAccountId: `acct_platform_${index}`,
      taxProfileId: `tax_platform_${index}`,
    }));
    store.submitListing(listingDraft({
      creatorId: `creator-${index}`,
      title: `Platform Consulting Hour ${index}`,
      category: 'consulting-hour',
      priceCents: 8_000,
    }), { creatorRankByGmv: 30 + index, creatorCount: 100 });
  }

  const listings = store.listListings({ status: 'published' });
  for (const [index, listing] of listings.entries()) {
    await fulfillCheckoutForBuyer(store, listing, `buyer-platform-${index}`, `cs_test_platform_${index}`);
  }
  const repeatListing = listings.find((listing) => listing.creatorId === 'creator-1');
  assert.ok(repeatListing);
  await fulfillCheckoutForBuyer(
    store,
    repeatListing,
    'buyer-platform-repeat',
    'cs_test_platform_repeat',
  );

  const report = store.platformReadiness({
    monthlyGmvCents: 32_000,
    activeCreatorsWithSales: 3,
    minimumUniqueBuyers: 4,
    minimumPublishedListings: 3,
    repeatSellers: 1,
    maximumTopCreatorGmvShareBps: 5_000,
    maximumTopBuyerGmvShareBps: 5_000,
    maximumPendingHumanReviews: 0,
    maximumBlockedPayouts: 0,
    maximumTaxComplianceIssues: 0,
    availableReserveCents: 100_000,
  });

  assert.equal(report.ready, true);
  assert.equal(report.period.label, '2026-05');
  assert.deepEqual(report.summary, {
    gmvCents: 32_000,
    platformRevenueCents: 4_800,
    creatorNetCents: 27_200,
    orders: 4,
    uniqueBuyers: 4,
    checkoutOrders: 4,
    directOrders: 0,
    checkoutGmvCents: 32_000,
    directGmvCents: 0,
    activeSellers: 3,
    repeatSellers: 1,
    publishedListings: 3,
    pendingHumanReviews: 0,
    blockedPayouts: 0,
    taxComplianceIssues: 0,
    reconciliationReady: true,
    reconciliationIssues: 0,
    topCreatorGmvShareBps: 5_000,
    topBuyerGmvShareBps: 2_500,
    platformTakeRateBps: 1_500,
    checkoutOrderShareBps: 10_000,
    checkoutGmvShareBps: 10_000,
    settledPayoutCents: 27_200,
    queuedPayoutCents: 0,
    settlementPayoutShareBps: 10_000,
    settlementReady: true,
    riskReserveReady: true,
    riskReserveIssues: 0,
    availableReserveCents: 100_000,
    requiredReserveCents: 100_000,
    reserveShortfallCents: 0,
    refundRateBps: 0,
    disputeRateBps: 0,
  });
  assert.deepEqual(report.checks.map((check) => check.status), ['pass', 'pass', 'pass', 'pass', 'pass', 'pass', 'pass', 'pass']);
  assert.deepEqual(report.issues, []);
  assert.deepEqual(report.topSellers.map((seller) => [seller.creatorId, seller.orders, seller.gmvShareBps]), [
    ['creator-1', 2, 5_000],
    ['creator-2', 1, 2_500],
    ['creator-3', 1, 2_500],
  ]);
  const serialized = JSON.stringify(report);
  assert.equal(serialized.includes('@example.com'), false);
  assert.equal(serialized.includes('acct_platform'), false);
  assert.equal(serialized.includes('tax_platform'), false);
  assert.equal(serialized.includes('buyer-platform'), false);
  assert.equal(serialized.includes('taxcalc_platform'), false);
});

test('platform readiness fails closed when GMV has weak buyer diversity', async () => {
  const store = new InMemoryMarketplaceStore({ clock: { now: () => Date.UTC(2026, 4, 18) } });
  const listings: MarketplaceListing[] = [];
  for (let index = 1; index <= 3; index += 1) {
    const creatorId = `buyer-diversity-creator-${index}`;
    store.upsertCreator(creator({
      id: creatorId,
      displayName: `Buyer Diversity Creator ${index}`,
      stripeConnectAccountId: `acct_buyer_diversity_${index}`,
      taxProfileId: `tax_buyer_diversity_${index}`,
    }));
    const { listing } = store.submitListing(listingDraft({
      creatorId,
      title: `Buyer Diversity Template ${index}`,
      category: 'template',
      priceCents: 5_000,
    }), { creatorRankByGmv: 40 + index, creatorCount: 100 });
    listings.push(listing);
  }

  for (const [index, listing] of listings.entries()) {
    await fulfillCheckoutForBuyer(store, listing, 'single-buyer-padding', `cs_test_buyer_diversity_${index}`);
  }

  const targets = {
    monthlyGmvCents: 15_000,
    activeCreatorsWithSales: 3,
    minimumUniqueBuyers: 2,
    minimumPublishedListings: 3,
    repeatSellers: 0,
    maximumTopCreatorGmvShareBps: 10_000,
    availableReserveCents: 100_000,
  };
  const report = store.platformReadiness(targets);

  assert.equal(report.ready, false);
  assert.equal(report.summary.uniqueBuyers, 1);
  assert.equal(report.summary.topBuyerGmvShareBps, 10_000);
  assert.ok(report.issues.some((issue) => issue.code === 'buyer_diversity_shortfall'));
  assert.ok(report.issues.some((issue) => issue.code === 'buyer_concentration'));
  assert.equal(report.checks.find((check) => check.id === 'buyer-diversity')?.status, 'fail');
  assert.equal(JSON.stringify(report).includes('single-buyer-padding'), false);

  const proof = store.businessModelProof(targets);
  assert.equal(proof.marketplace.platformReady, false);
  assert.equal(proof.marketplace.sourceBusinessModelReady, false);
  assert.equal(proof.marketplace.uniqueBuyers, 1);
  assert.equal(proof.marketplace.topCreatorGmvShareBps, 3_333);
  assert.equal(proof.marketplace.topBuyerGmvShareBps, 10_000);
});

test('platform readiness fails closed when reconciliation evidence is broken', async () => {
  const store = new InMemoryMarketplaceStore({ clock: { now: () => Date.UTC(2026, 4, 18) } });
  store.upsertCreator(creator({
    stripeConnectAccountId: 'acct_reconciliation_gate',
    taxProfileId: 'tax_reconciliation_gate',
  }));
  const { listing } = store.submitListing(listingDraft({
    title: 'Reconciliation-Gated Template',
    category: 'template',
    priceCents: 8_000,
  }));
  await fulfillCheckoutForBuyer(
    store,
    listing,
    'buyer-reconciliation-gate',
    'cs_test_reconciliation_gate',
  );

  const snapshot = store.snapshot();
  snapshot.payouts = snapshot.payouts.map((payout) => ({
    ...payout,
    amountCents: payout.amountCents - 100,
  }));
  const corrupted = new InMemoryMarketplaceStore({
    clock: { now: () => Date.UTC(2026, 4, 18) },
  }).restoreSnapshot(snapshot, { audit: false });

  const targets = {
    monthlyGmvCents: 8_000,
    activeCreatorsWithSales: 1,
    minimumUniqueBuyers: 1,
    minimumPublishedListings: 1,
    repeatSellers: 0,
    maximumTopCreatorGmvShareBps: 10_000,
    maximumTopBuyerGmvShareBps: 10_000,
    minimumCheckoutOrderShareBps: 10_000,
    minimumCheckoutGmvShareBps: 10_000,
    availableReserveCents: 100_000,
  };
  const report = corrupted.platformReadiness(targets);

  assert.equal(report.ready, false);
  assert.equal(report.summary.reconciliationReady, false);
  assert.equal(report.summary.reconciliationIssues, 1);
  assert.ok(report.issues.some((issue) => issue.code === 'reconciliation_not_ready'));
  assert.equal(report.checks.find((check) => check.id === 'operations-health')?.status, 'fail');

  const proof = corrupted.businessModelProof(targets);
  assert.equal(proof.marketplace.platformReady, false);
  assert.equal(proof.marketplace.sourceBusinessModelReady, false);
  assert.equal(proof.marketplace.reconciliationReady, false);
  assert.equal(proof.source.platformReady, false);
  assert.equal(proof.source.reconciliationReady, false);
  assert.equal(proof.source.businessModelReady, false);
});

test('platform readiness blocks manual/direct paid volume before marketplace scale', async () => {
  const store = new InMemoryMarketplaceStore({ clock: { now: () => Date.UTC(2026, 4, 18) } });
  store.upsertCreator(creator({
    stripeConnectAccountId: 'acct_direct_scale',
    taxProfileId: 'tax_direct_scale',
  }));
  const { listing } = store.submitListing(listingDraft({
    title: 'Direct Order Scale Template',
    category: 'template',
    priceCents: 8_000,
  }));
  await store.purchaseListing({
    listingId: listing.id,
    buyerId: 'manual-scale-buyer',
    buyerTaxAddress: { country: 'US', postalCode: '10001' },
    stripeTaxCalculationId: 'taxcalc_direct_scale',
    stripeTaxTransactionId: 'tax_txn_direct_scale',
    taxAmountCents: 680,
  });

  const report = store.platformReadiness({
    monthlyGmvCents: 8_000,
    activeCreatorsWithSales: 1,
    minimumUniqueBuyers: 1,
    minimumPublishedListings: 1,
    repeatSellers: 0,
    maximumTopCreatorGmvShareBps: 10_000,
    maximumTopBuyerGmvShareBps: 10_000,
    availableReserveCents: 100_000,
  });

  assert.equal(report.ready, false);
  assert.equal(report.summary.checkoutOrders, 0);
  assert.equal(report.summary.directOrders, 1);
  assert.equal(report.summary.checkoutGmvCents, 0);
  assert.equal(report.summary.directGmvCents, 8_000);
  assert.equal(report.summary.checkoutOrderShareBps, 0);
  assert.equal(report.summary.checkoutGmvShareBps, 0);
  assert.deepEqual(report.issues.map((issue) => issue.code), [
    'checkout_coverage_shortfall',
    'checkout_gmv_coverage_shortfall',
    'settlement_coverage_shortfall',
    'risk_reserve_not_ready',
  ]);
  assert.deepEqual(report.checks.map((check) => [check.id, check.status]), [
    ['seller-liquidity', 'pass'],
    ['buyer-diversity', 'pass'],
    ['catalog-depth', 'pass'],
    ['repeat-seller-proof', 'pass'],
    ['marketplace-quality', 'pass'],
    ['checkout-coverage', 'fail'],
    ['operations-health', 'fail'],
    ['risk-reserve', 'warn'],
  ]);

  const proof = store.businessModelProof({
    monthlyGmvCents: 8_000,
    activeCreatorsWithSales: 1,
    minimumUniqueBuyers: 1,
    minimumPublishedListings: 1,
    repeatSellers: 0,
    maximumTopCreatorGmvShareBps: 10_000,
    maximumTopBuyerGmvShareBps: 10_000,
    availableReserveCents: 100_000,
  });
  assert.equal(proof.marketplace.platformReady, false);
  assert.equal(proof.marketplace.sourceBusinessModelReady, false);
  assert.equal(proof.marketplace.settlementReady, false);
  assert.equal(proof.marketplace.settlementPayoutShareBps, 0);
  assert.equal(proof.source.checkoutAttributionReady, false);
  assert.equal(proof.source.settlementReady, false);
  assert.equal(proof.source.businessModelReady, false);
});

test('platform readiness blocks Checkout order-count padding when GMV stays direct', async () => {
  const store = new InMemoryMarketplaceStore({ clock: { now: () => Date.UTC(2026, 4, 18) } });
  store.upsertCreator(creator({
    stripeConnectAccountId: 'acct_gmv_padding',
    taxProfileId: 'tax_gmv_padding',
  }));
  const checkout = store.submitListing(listingDraft({
    title: 'Checkout Padding Template',
    category: 'template',
    priceCents: 1_000,
  }));
  const direct = store.submitListing(listingDraft({
    title: 'Direct GMV Consulting Sprint',
    category: 'consulting-hour',
    priceCents: 41_000,
  }));
  const checkoutListing = checkout.listing.status === 'pending-human-review' && checkout.listing.reviewId
    ? store.approveReview(checkout.listing.reviewId, 'reviewer-checkout-padding')
    : checkout.listing;
  const directListing = direct.listing.status === 'pending-human-review' && direct.listing.reviewId
    ? store.approveReview(direct.listing.reviewId, 'reviewer-direct-gmv')
    : direct.listing;

  for (let index = 0; index < 9; index += 1) {
    await fulfillCheckoutForBuyer(store, checkoutListing, `buyer-checkout-padding-${index}`, `cs_test_checkout_padding_${index}`);
  }
  await store.purchaseListing({
    listingId: directListing.id,
    buyerId: 'buyer-direct-gmv',
    buyerTaxAddress: { country: 'US', postalCode: '10001' },
    stripeTaxCalculationId: 'taxcalc_direct_gmv',
    stripeTaxTransactionId: 'tax_txn_direct_gmv',
    taxAmountCents: 3_485,
  });

  const report = store.platformReadiness({
    monthlyGmvCents: 50_000,
    activeCreatorsWithSales: 1,
    minimumUniqueBuyers: 10,
    minimumPublishedListings: 2,
    repeatSellers: 1,
    maximumTopCreatorGmvShareBps: 10_000,
    maximumTopBuyerGmvShareBps: 10_000,
    minimumCheckoutOrderShareBps: 9_000,
    minimumCheckoutGmvShareBps: 9_000,
    availableReserveCents: 100_000,
  });

  assert.equal(report.ready, false);
  assert.equal(report.summary.orders, 10);
  assert.equal(report.summary.uniqueBuyers, 10);
  assert.equal(report.summary.checkoutOrders, 9);
  assert.equal(report.summary.directOrders, 1);
  assert.equal(report.summary.checkoutGmvCents, 9_000);
  assert.equal(report.summary.directGmvCents, 41_000);
  assert.equal(report.summary.checkoutOrderShareBps, 9_000);
  assert.equal(report.summary.checkoutGmvShareBps, 1_800);
  assert.ok(report.issues.some((issue) => issue.code === 'checkout_gmv_coverage_shortfall'));
  assert.equal(report.checks.find((check) => check.id === 'checkout-coverage')?.status, 'fail');
});

test('platform readiness defaults map to the 200 seller and $250K GMV milestone', () => {
  const store = new InMemoryMarketplaceStore({ clock: { now: () => Date.UTC(2026, 4, 18) } });
  const report = store.platformReadiness();
  assert.equal(report.ready, false);
  assert.equal(report.targets.monthlyGmvCents, 25_000_000);
  assert.equal(report.targets.activeCreatorsWithSales, 200);
  assert.equal(report.targets.minimumUniqueBuyers, 200);
  assert.equal(report.targets.maximumTopBuyerGmvShareBps, 2_500);
  assert.equal(report.targets.minimumCheckoutOrderShareBps, 9_000);
  assert.equal(report.targets.minimumCheckoutGmvShareBps, 9_000);
  assert.equal(report.targets.minimumSettledPayoutShareBps, 9_000);
  assert.deepEqual(report.issues.map((issue) => issue.code), [
    'marketplace_gmv_shortfall',
    'active_seller_shortfall',
    'buyer_diversity_shortfall',
    'published_listing_shortfall',
    'repeat_seller_shortfall',
  ]);
});

test('platform readiness defaults pass with 200 sellers and $250K Checkout GMV', async () => {
  const store = new InMemoryMarketplaceStore({ clock: { now: () => Date.UTC(2026, 4, 18) } });
  const listings: MarketplaceListing[] = [];
  for (let index = 1; index <= 200; index += 1) {
    const creatorId = `scale-creator-${index}`;
    store.upsertCreator(creator({
      id: creatorId,
      displayName: `Scale Creator ${index}`,
      stripeConnectAccountId: `acct_scale_${index}`,
      taxProfileId: `tax_scale_${index}`,
    }));
    const { listing } = store.submitListing(listingDraft({
      creatorId,
      title: `Scale Consulting Hour ${index}`,
      category: 'consulting-hour',
      priceCents: 50_000,
    }), { creatorRankByGmv: index, creatorCount: 200 });
    if (listing.status === 'pending-human-review' && listing.reviewId) {
      listings.push(store.approveReview(listing.reviewId, 'scale-reviewer'));
    } else {
      listings.push(listing);
    }
  }

  for (let index = 0; index < 500; index += 1) {
    const listing = listings[index % listings.length];
    assert.ok(listing);
    await fulfillCheckoutForBuyer(store, listing, `scale-buyer-${index}`, `cs_test_scale_${index}`);
  }

  const report = store.platformReadiness({ availableReserveCents: 1_250_000 });

  assert.equal(report.ready, true);
  assert.equal(report.summary.gmvCents, 25_000_000);
  assert.equal(report.summary.activeSellers, 200);
  assert.equal(report.summary.uniqueBuyers, 500);
  assert.equal(report.summary.repeatSellers, 200);
  assert.equal(report.summary.publishedListings, 200);
  assert.equal(report.summary.checkoutOrders, 500);
  assert.equal(report.summary.directOrders, 0);
  assert.equal(report.summary.checkoutGmvCents, 25_000_000);
  assert.equal(report.summary.directGmvCents, 0);
  assert.equal(report.summary.checkoutOrderShareBps, 10_000);
  assert.equal(report.summary.checkoutGmvShareBps, 10_000);
  assert.equal(report.summary.settlementPayoutShareBps, 10_000);
  assert.equal(report.summary.settlementReady, true);
  assert.equal(report.summary.topCreatorGmvShareBps, 60);
  assert.equal(report.summary.topBuyerGmvShareBps, 20);
  assert.equal(report.summary.platformTakeRateBps, 1_500);
  assert.equal(report.summary.riskReserveReady, true);
  assert.equal(report.summary.reserveShortfallCents, 0);
  assert.deepEqual(report.checks.map((check) => check.status), ['pass', 'pass', 'pass', 'pass', 'pass', 'pass', 'pass', 'pass']);
  assert.deepEqual(report.issues, []);
});

test('platform readiness fails closed when marketplace scale is under-reserved', async () => {
  const store = new InMemoryMarketplaceStore({ clock: { now: () => Date.UTC(2026, 4, 18) } });
  store.upsertCreator(creator({
    stripeConnectAccountId: 'acct_under_reserved',
    taxProfileId: 'tax_under_reserved',
  }));
  const { listing } = store.submitListing(listingDraft({
    title: 'Under Reserved Marketplace Template',
    category: 'consulting-hour',
    priceCents: 50_000,
  }));
  await fulfillCheckoutForBuyer(store, listing, 'buyer-under-reserved', 'cs_test_under_reserved');

  const report = store.platformReadiness({
    monthlyGmvCents: 50_000,
    activeCreatorsWithSales: 1,
    minimumUniqueBuyers: 1,
    minimumPublishedListings: 1,
    repeatSellers: 0,
    maximumTopCreatorGmvShareBps: 10_000,
    maximumTopBuyerGmvShareBps: 10_000,
    minimumCheckoutOrderShareBps: 10_000,
  });

  assert.equal(report.ready, false);
  assert.equal(report.summary.riskReserveReady, false);
  assert.equal(report.summary.requiredReserveCents, 100_000);
  assert.equal(report.summary.reserveShortfallCents, 100_000);
  assert.ok(report.issues.some((issue) => issue.code === 'risk_reserve_not_ready'));
  assert.deepEqual(report.checks.find((check) => check.id === 'risk-reserve')?.status, 'fail');
});

test('growth target progress reports concrete shortfalls before launch target is met', () => {
  const store = new InMemoryMarketplaceStore({ clock: { now: () => 310 } });
  store.upsertCreator(creator());
  const progress = store.growthProgress();
  assert.equal(progress.achieved, false);
  assert.equal(progress.monthlyGmvProgress, 0);
  assert.equal(progress.activeCreatorProgress, 0);
  assert.deepEqual(progress.shortfalls, [
    'monthly GMV needs 2500000 more cents',
    'creator supply needs 50 more sellers with a sale',
  ]);
});

test('growth and launch readiness count current-month sales instead of stale lifetime GMV', async () => {
  let now = Date.UTC(2026, 3, 15);
  const store = new InMemoryMarketplaceStore({ clock: { now: () => now } });
  for (let index = 1; index <= 50; index += 1) {
    const creatorId = `stale-creator-${index}`;
    store.upsertCreator(creator({
      id: creatorId,
      displayName: `Stale Creator ${index}`,
      stripeConnectAccountId: `acct_stale_${index}`,
    }));
    const { listing } = store.submitListing(listingDraft({
      creatorId,
      title: `Stale Consulting Hour ${index}`,
      category: 'consulting-hour',
      priceCents: 50_000,
    }), { creatorRankByGmv: index, creatorCount: 50 });
    if (listing.status === 'pending-human-review' && listing.reviewId) {
      store.approveReview(listing.reviewId, 'reviewer-1');
    }
    await store.purchaseListing({ listingId: listing.id, buyerId: `stale-buyer-${index}` });
  }

  assert.equal(store.stats().gmvCents, 2_500_000);
  now = Date.UTC(2026, 4, 15);
  const progress = store.growthProgress();
  assert.equal(progress.period.label, '2026-05');
  assert.equal(progress.stats.gmvCents, 0);
  assert.equal(progress.stats.activeCreatorsWithSales, 0);
  assert.equal(progress.achieved, false);
  assert.deepEqual(progress.shortfalls, [
    'monthly GMV needs 2500000 more cents',
    'creator supply needs 50 more sellers with a sale',
  ]);

  const readiness = store.launchReadiness({
    monthlyGmvCents: 2_500_000,
    activeCreatorsWithSales: 50,
    minimumPublishedListings: 50,
  });
  assert.equal(readiness.ready, false);
  assert.equal(readiness.summary.gmvCents, 0);
  assert.equal(readiness.summary.activeCreatorsWithSales, 0);
  assert.ok(readiness.issues.some((issue) => issue.code === 'growth_target_not_met'));
});

test('refundOrder initiates a Stripe refund and records a resolved refund risk event', async () => {
  const auditLog = new InMemoryMarketplaceAuditLog();
  const store = new InMemoryMarketplaceStore({
    clock: { now: () => Date.UTC(2026, 4, 18) },
    auditLog,
  });
  store.upsertCreator(creator({ monthlyGmvCents: 0 }));
  const { listing } = store.submitListing(listingDraft());
  const plan = store.checkoutPlan({
    listingId: listing.id,
    buyerId: 'studio-buyer',
    successUrl: 'https://greybox.studio/marketplace/success',
    cancelUrl: 'https://greybox.studio/marketplace/cancel',
  });
  assert.ok(plan.checkoutSessionRequest);
  const result = await store.fulfillCheckoutSession(checkoutCompletedEvent({
    listing,
    metadata: plan.checkoutSessionRequest.body.metadata,
    sessionId: 'cs_test_refund_flow',
    paymentIntentId: 'pi_test_refund_flow',
  }));
  const order = result.order;

  const { riskEvent, refund } = await store.refundOrder({
    orderId: order.id,
    amountCents: order.grossCents,
    reason: 'requested_by_customer',
    actorId: 'admin-1',
    actorType: 'admin',
  });

  assert.equal(refund.status, 'succeeded');
  assert.ok(refund.stripeRefundId.startsWith('re_mock_'));
  assert.equal(riskEvent.type, 'refund');
  assert.equal(riskEvent.status, 'resolved');
  assert.equal(riskEvent.amountCents, order.grossCents);
  assert.equal(riskEvent.stripeRefundId, refund.stripeRefundId);

  const auditEntries = auditLog.list({ entityId: order.id });
  assert.ok(auditEntries.some((entry) => entry.action === 'order.refunded'));
  const refundEntry = auditEntries.find((entry) => entry.action === 'order.refunded');
  assert.equal(refundEntry?.actorId, 'admin-1');
  assert.equal(refundEntry?.metadata?.hasStripeRefundEvidence, true);
  assert.equal(Object.hasOwn(refundEntry?.metadata ?? {}, 'stripeRefundId'), false);
  // Sensitive Stripe payment intent must not be leaked into audit metadata.
  assert.equal(JSON.stringify(refundEntry?.metadata ?? {}).includes('pi_test_refund_flow'), false);
  assert.equal(JSON.stringify(refundEntry?.metadata ?? {}).includes(refund.stripeRefundId), false);
});

test('refundOrder is idempotent for matching refund retries', async () => {
  const auditLog = new InMemoryMarketplaceAuditLog();
  const store = new InMemoryMarketplaceStore({
    clock: { now: () => Date.UTC(2026, 4, 18) },
    auditLog,
  });
  store.upsertCreator(creator({ monthlyGmvCents: 0 }));
  const { listing } = store.submitListing(listingDraft());
  const plan = store.checkoutPlan({
    listingId: listing.id,
    buyerId: 'studio-buyer',
    successUrl: 'https://greybox.studio/marketplace/success',
    cancelUrl: 'https://greybox.studio/marketplace/cancel',
  });
  assert.ok(plan.checkoutSessionRequest);
  const result = await store.fulfillCheckoutSession(checkoutCompletedEvent({
    listing,
    metadata: plan.checkoutSessionRequest.body.metadata,
    sessionId: 'cs_test_refund_retry',
    paymentIntentId: 'pi_test_refund_retry',
  }));

  const first = await store.refundOrder({
    orderId: result.order.id,
    amountCents: result.order.grossCents,
    reason: 'requested_by_customer',
  });
  const retry = await store.refundOrder({
    orderId: result.order.id,
    amountCents: result.order.grossCents,
    reason: 'requested_by_customer',
  });

  assert.equal(retry.riskEvent.id, first.riskEvent.id);
  assert.equal(retry.refund.stripeRefundId, first.refund.stripeRefundId);
  assert.equal(retry.refund.status, 'succeeded');
  assert.equal(store.listRiskEvents({ type: 'refund', orderId: result.order.id }).length, 1);
  assert.equal(auditLog.list({ action: 'order.refunded', entityId: result.order.id }).length, 1);
  const receipts = store.listEventReceipts({ orderId: result.order.id });
  const adminRefundReceipt = receipts.find((receipt) => receipt.kind === 'admin_refund');
  const stripeRefundReceipt = receipts.find((receipt) => receipt.kind === 'refund');
  assert.equal(adminRefundReceipt?.receiptKey, `greybox-refund-${result.order.id}-${result.order.grossCents}`);
  assert.equal(adminRefundReceipt?.stripeRefundId, first.refund.stripeRefundId);
  assert.equal(adminRefundReceipt?.replayCount, 1);
  assert.equal(stripeRefundReceipt?.receiptKey, first.refund.stripeRefundId);
  assert.equal(stripeRefundReceipt?.riskEventId, first.riskEvent.id);
  assert.equal(stripeRefundReceipt?.replayCount, 0);
});

test('risk event Stripe receipts persist refund and dispute replay evidence across snapshots', async () => {
  const store = new InMemoryMarketplaceStore({ clock: { now: () => 5_000 } });
  store.upsertCreator(creator());
  const { listing } = store.submitListing(listingDraft({
    title: 'Risk Receipt Template',
    category: 'template',
    priceCents: 5_900,
  }));
  const { order } = await store.purchaseListing({
    listingId: listing.id,
    buyerId: 'risk-receipt-buyer',
  });

  const dispute = store.recordRiskEvent({
    type: 'dispute',
    orderId: order.id,
    amountCents: 2_000,
    status: 'open',
    stripeEventId: 'evt_test_receipt_dispute_open',
    stripeDisputeId: 'dp_test_receipt_dispute',
  });
  const closed = store.recordRiskEvent({
    type: 'dispute',
    orderId: order.id,
    amountCents: 2_000,
    status: 'won',
    stripeEventId: 'evt_test_receipt_dispute_won',
    stripeDisputeId: 'dp_test_receipt_dispute',
  });
  const refund = store.recordRiskEvent({
    type: 'refund',
    orderId: order.id,
    amountCents: 1_000,
    status: 'resolved',
    stripeEventId: 'evt_test_receipt_refund',
    stripeRefundId: 're_test_receipt_refund',
  });

  const restored = new InMemoryMarketplaceStore({ clock: { now: () => 5_001 } })
    .restoreSnapshot(store.snapshot(), { audit: false });
  const disputeReceipts = restored.listEventReceipts({ kind: 'dispute', orderId: order.id });
  const disputeReceipt = disputeReceipts.find((receipt) => receipt.source === 'stripe_object');
  const disputeOpenReceipt = disputeReceipts.find((receipt) => receipt.receiptKey === 'evt_test_receipt_dispute_open');
  const disputeWonReceipt = disputeReceipts.find((receipt) => receipt.receiptKey === 'evt_test_receipt_dispute_won');
  const refundReceipts = restored.listEventReceipts({ kind: 'refund', orderId: order.id });
  const refundReceipt = refundReceipts.find((receipt) => receipt.source === 'stripe_object');
  const refundEventReceipt = refundReceipts.find((receipt) => receipt.source === 'stripe_event');

  assert.equal(closed.id, dispute.id);
  assert.equal(disputeReceipt?.receiptKey, 'dp_test_receipt_dispute');
  assert.equal(disputeReceipt?.riskEventId, dispute.id);
  assert.equal(disputeReceipt?.stripeEventId, 'evt_test_receipt_dispute_open');
  assert.equal(disputeReceipt?.lastStripeEventId, 'evt_test_receipt_dispute_won');
  assert.equal(disputeReceipt?.status, 'won');
  assert.equal(disputeReceipt?.replayCount, 1);
  assert.equal(disputeOpenReceipt?.source, 'stripe_event');
  assert.equal(disputeOpenReceipt?.replayCount, 0);
  assert.equal(disputeWonReceipt?.source, 'stripe_event');
  assert.equal(disputeWonReceipt?.status, 'won');
  assert.equal(refundReceipt?.receiptKey, 're_test_receipt_refund');
  assert.equal(refundReceipt?.riskEventId, refund.id);
  assert.equal(refundReceipt?.lastStripeEventId, 'evt_test_receipt_refund');
  assert.equal(refundReceipt?.replayCount, 0);
  assert.equal(refundEventReceipt?.receiptKey, 'evt_test_receipt_refund');
  assert.equal(refundEventReceipt?.stripeRefundId, 're_test_receipt_refund');
});

test('refundOrder revokes Pro module entitlement after a full refund', async () => {
  const auditLog = new InMemoryMarketplaceAuditLog();
  const store = new InMemoryMarketplaceStore({
    clock: { now: () => Date.UTC(2026, 4, 18) },
    auditLog,
  });
  const fulfilled = await fulfillProModuleCheckout(store, { sessionId: 'cs_test_refund_pro_module' });
  assert.ok(fulfilled.entitlement);
  const entitlement = fulfilled.entitlement;

  store.claimEntitlement({
    lookupKey: entitlement.activation.lookupKey,
    licenseHash: 'a'.repeat(16),
    moduleId: 'soulslike-combat-pack',
  });
  await store.refundOrder({
    orderId: fulfilled.order.id,
    amountCents: fulfilled.order.grossCents,
    reason: 'requested_by_customer',
    actorId: 'admin-1',
    actorType: 'admin',
  });

  assert.equal(store.entitlement(entitlement.id)?.status, 'revoked');
  assert.throws(
    () => store.claimEntitlement({
      lookupKey: entitlement.activation.lookupKey,
      licenseHash: 'a'.repeat(16),
      moduleId: 'soulslike-combat-pack',
    }),
    /active entitlement not found/u,
  );
  assert.equal(auditLog.list({ action: 'entitlement.revoked', entityId: entitlement.id }).length, 1);
  assert.equal(JSON.stringify(auditLog.list({ action: 'entitlement.revoked', entityId: entitlement.id })[0]?.metadata ?? {}).includes(entitlement.activation.lookupKey), false);
  assert.deepEqual(store.reconciliationReport().issues, []);
});

test('recordRiskEvent revokes Pro module entitlement after a webhook full refund', async () => {
  const auditLog = new InMemoryMarketplaceAuditLog();
  const store = new InMemoryMarketplaceStore({
    clock: { now: () => Date.UTC(2026, 4, 18) },
    auditLog,
  });
  const fulfilled = await fulfillProModuleCheckout(store, { sessionId: 'cs_test_webhook_refund_pro_module' });
  assert.ok(fulfilled.entitlement);
  const entitlement = fulfilled.entitlement;

  store.claimEntitlement({
    lookupKey: entitlement.activation.lookupKey,
    licenseHash: 'c'.repeat(16),
    moduleId: 'soulslike-combat-pack',
  });
  const refund = store.recordRiskEvent({
    type: 'refund',
    orderId: fulfilled.order.id,
    amountCents: fulfilled.order.grossCents,
    status: 'resolved',
    stripeRefundId: 're_test_webhook_full_refund',
  });
  const replay = store.recordRiskEvent({
    type: 'refund',
    orderId: fulfilled.order.id,
    amountCents: fulfilled.order.grossCents,
    status: 'resolved',
    stripeRefundId: 're_test_webhook_full_refund',
  });

  assert.equal(replay.id, refund.id);
  assert.equal(store.entitlement(entitlement.id)?.status, 'revoked');
  assert.throws(
    () => store.claimEntitlement({
      lookupKey: entitlement.activation.lookupKey,
      licenseHash: 'c'.repeat(16),
      moduleId: 'soulslike-combat-pack',
    }),
    /active entitlement not found/u,
  );
  assert.equal(auditLog.list({ action: 'entitlement.revoked', entityId: entitlement.id }).length, 1);
  assert.deepEqual(store.reconciliationReport().issues, []);
});

test('recordRiskEvent revokes Pro module entitlement after a lost dispute', async () => {
  const auditLog = new InMemoryMarketplaceAuditLog();
  const store = new InMemoryMarketplaceStore({
    clock: { now: () => Date.UTC(2026, 4, 18) },
    auditLog,
  });
  const fulfilled = await fulfillProModuleCheckout(store, { sessionId: 'cs_test_lost_dispute_pro_module' });
  assert.ok(fulfilled.entitlement);
  const entitlement = fulfilled.entitlement;

  store.claimEntitlement({
    lookupKey: entitlement.activation.lookupKey,
    licenseHash: 'd'.repeat(16),
    moduleId: 'soulslike-combat-pack',
  });
  const dispute = store.recordRiskEvent({
    type: 'dispute',
    orderId: fulfilled.order.id,
    amountCents: fulfilled.order.grossCents,
    status: 'lost',
    stripeDisputeId: 'dp_test_webhook_lost_dispute',
  });
  const replay = store.recordRiskEvent({
    type: 'dispute',
    orderId: fulfilled.order.id,
    amountCents: fulfilled.order.grossCents,
    status: 'lost',
    stripeDisputeId: 'dp_test_webhook_lost_dispute',
  });

  assert.equal(replay.id, dispute.id);
  assert.equal(store.entitlement(entitlement.id)?.status, 'revoked');
  assert.throws(
    () => store.claimEntitlement({
      lookupKey: entitlement.activation.lookupKey,
      licenseHash: 'd'.repeat(16),
      moduleId: 'soulslike-combat-pack',
    }),
    /active entitlement not found/u,
  );
  const revokeAudit = auditLog.list({ action: 'entitlement.revoked', entityId: entitlement.id });
  assert.equal(revokeAudit.length, 1);
  assert.equal(revokeAudit[0]?.metadata?.reason, 'lost-dispute');
  assert.equal(revokeAudit[0]?.metadata?.hasStripeDisputeEvidence, true);
  assert.equal(Object.hasOwn(revokeAudit[0]?.metadata ?? {}, 'stripeDisputeId'), false);
  assert.equal(JSON.stringify(revokeAudit[0]?.metadata ?? {}).includes('dp_test_webhook_lost_dispute'), false);
  assert.deepEqual(store.reconciliationReport().issues, []);
});

test('refundOrder keeps Pro module entitlement active after a partial refund', async () => {
  const auditLog = new InMemoryMarketplaceAuditLog();
  const store = new InMemoryMarketplaceStore({
    clock: { now: () => Date.UTC(2026, 4, 18) },
    auditLog,
  });
  const fulfilled = await fulfillProModuleCheckout(store, { sessionId: 'cs_test_partial_refund_pro_module' });
  assert.ok(fulfilled.entitlement);

  await store.refundOrder({
    orderId: fulfilled.order.id,
    amountCents: Math.floor(fulfilled.order.grossCents / 2),
    reason: 'requested_by_customer',
  });

  assert.equal(store.entitlement(fulfilled.entitlement.id)?.status, 'active');
  assert.equal(auditLog.list({ action: 'entitlement.revoked', entityId: fulfilled.entitlement.id }).length, 0);
  assert.equal(store.claimEntitlement({
    lookupKey: fulfilled.entitlement.activation.lookupKey,
    licenseHash: 'b'.repeat(16),
    moduleId: 'soulslike-combat-pack',
  }).status, 'active');
  assert.deepEqual(store.reconciliationReport().issues, []);
});

test('refundOrder does not revoke Pro module entitlement when refund is blocked', async () => {
  const provider: PayoutProvider = {
    async createTransfer(order, createdBy) {
      return {
        id: `payout-${order.id}`,
        orderId: order.id,
        creatorId: createdBy.id,
        stripeConnectAccountId: createdBy.stripeConnectAccountId ?? '',
        amountCents: order.creatorNetCents,
        currency: order.currency,
        status: 'queued',
      };
    },
    async createRefund(input) {
      return {
        stripeRefundId: `re_test_blocked_${input.orderId}`,
        status: 'blocked',
        reason: 'stripe_400_card_declined',
      };
    },
  };
  const auditLog = new InMemoryMarketplaceAuditLog();
  const store = new InMemoryMarketplaceStore({
    clock: { now: () => Date.UTC(2026, 4, 18) },
    payoutProvider: provider,
    auditLog,
  });
  const fulfilled = await fulfillProModuleCheckout(store, { sessionId: 'cs_test_blocked_refund_pro_module' });
  assert.ok(fulfilled.entitlement);

  const result = await store.refundOrder({
    orderId: fulfilled.order.id,
    amountCents: fulfilled.order.grossCents,
    reason: 'requested_by_customer',
  });

  assert.equal(result.refund.status, 'blocked');
  assert.equal(result.riskEvent.refundBlocked, true);
  assert.equal(store.entitlement(fulfilled.entitlement.id)?.status, 'active');
  assert.equal(auditLog.list({ action: 'entitlement.revoked', entityId: fulfilled.entitlement.id }).length, 0);
  assert.equal(store.riskReserveReport().summary.recordedRefundsCents, 0);
});

test('recordRiskEvent does not reverse access for explicitly blocked refund evidence', async () => {
  const auditLog = new InMemoryMarketplaceAuditLog();
  const store = new InMemoryMarketplaceStore({
    clock: { now: () => Date.UTC(2026, 4, 18) },
    auditLog,
  });
  const fulfilled = await fulfillProModuleCheckout(store, { sessionId: 'cs_test_blocked_webhook_refund_pro_module' });
  assert.ok(fulfilled.entitlement);

  const event = store.recordRiskEvent({
    type: 'refund',
    orderId: fulfilled.order.id,
    amountCents: fulfilled.order.grossCents,
    status: 'open',
    stripeRefundId: 're_test_blocked_webhook_refund',
    refundBlocked: true,
    reason: 'stripe_400_refund_blocked',
  });

  assert.equal(event.refundBlocked, true);
  assert.equal(store.entitlement(fulfilled.entitlement.id)?.status, 'active');
  assert.equal(auditLog.list({ action: 'entitlement.revoked', entityId: fulfilled.entitlement.id }).length, 0);
  assert.equal(store.riskReserveReport().summary.recordedRefundsCents, 0);
});

test('refundOrder retry after full refund does not duplicate entitlement revocation audit', async () => {
  const auditLog = new InMemoryMarketplaceAuditLog();
  const store = new InMemoryMarketplaceStore({
    clock: { now: () => Date.UTC(2026, 4, 18) },
    auditLog,
  });
  const fulfilled = await fulfillProModuleCheckout(store, { sessionId: 'cs_test_refund_pro_module_retry' });
  assert.ok(fulfilled.entitlement);

  await store.refundOrder({
    orderId: fulfilled.order.id,
    amountCents: fulfilled.order.grossCents,
    reason: 'requested_by_customer',
  });
  await store.refundOrder({
    orderId: fulfilled.order.id,
    amountCents: fulfilled.order.grossCents,
    reason: 'requested_by_customer',
  });

  assert.equal(store.entitlement(fulfilled.entitlement.id)?.status, 'revoked');
  assert.equal(auditLog.list({ action: 'entitlement.revoked', entityId: fulfilled.entitlement.id }).length, 1);
});

test('refundOrder rejects orders missing stripePaymentIntentId', async () => {
  const store = new InMemoryMarketplaceStore({ clock: { now: () => Date.UTC(2026, 4, 18) } });
  store.upsertCreator(creator({ monthlyGmvCents: 0 }));
  const { listing } = store.submitListing(listingDraft());
  // purchaseListing does not record a payment intent (manual transfer path).
  const purchase = await store.purchaseListing({ listingId: listing.id, buyerId: 'studio-buyer' });

  await assert.rejects(
    () => store.refundOrder({ orderId: purchase.order.id, amountCents: 1_000 }),
    /stripePaymentIntentId/iu,
  );
});

test('refundOrder validates positive integer amounts and order bounds', async () => {
  const store = new InMemoryMarketplaceStore({ clock: { now: () => Date.UTC(2026, 4, 18) } });
  store.upsertCreator(creator({ monthlyGmvCents: 0 }));
  const { listing } = store.submitListing(listingDraft());
  const plan = store.checkoutPlan({
    listingId: listing.id,
    buyerId: 'studio-buyer',
    successUrl: 'https://greybox.studio/marketplace/success',
    cancelUrl: 'https://greybox.studio/marketplace/cancel',
  });
  assert.ok(plan.checkoutSessionRequest);
  const result = await store.fulfillCheckoutSession(checkoutCompletedEvent({
    listing,
    metadata: plan.checkoutSessionRequest.body.metadata,
    sessionId: 'cs_test_refund_bounds',
    paymentIntentId: 'pi_test_refund_bounds',
  }));

  await assert.rejects(
    () => store.refundOrder({ orderId: result.order.id, amountCents: 0 }),
    /positive integer/iu,
  );
  await assert.rejects(
    () => store.refundOrder({ orderId: result.order.id, amountCents: result.order.grossCents + 1 }),
    /exceed/iu,
  );
  await assert.rejects(
    () => store.refundOrder({ orderId: 'no-such-order', amountCents: 100 }),
    /order not found/iu,
  );

  const partialRefundCents = Math.floor(result.order.grossCents / 2);
  await store.refundOrder({
    orderId: result.order.id,
    amountCents: partialRefundCents,
    reason: 'requested_by_customer',
  });
  await assert.rejects(
    () => store.refundOrder({ orderId: result.order.id, amountCents: result.order.grossCents }),
    /cumulative refund amount/iu,
  );
});

test('LiveStripeConnectProvider refund retries 5xx and surfaces 4xx as blocked', async () => {
  let calls = 0;
  const provider = new LiveStripeConnectProvider({
    apiKey: 'sk_live_test',
    maxRetries: 2,
    retryBackoffMs: 1,
    fetchFn: async () => {
      calls += 1;
      if (calls === 1) {
        return new Response('boom', { status: 503 });
      }
      return new Response(JSON.stringify({ id: 're_retry_ok', status: 'succeeded' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });
  const result = await provider.createRefund({
    orderId: 'order-1',
    stripePaymentIntentId: 'pi_test',
    amountCents: 500,
    currency: 'usd',
  });
  assert.equal(calls, 2);
  assert.equal(result.stripeRefundId, 're_retry_ok');
  assert.equal(result.status, 'succeeded');

  let blockedCalls = 0;
  const blockedProvider = new LiveStripeConnectProvider({
    apiKey: 'sk_live_test',
    maxRetries: 0,
    retryBackoffMs: 1,
    fetchFn: async () => {
      blockedCalls += 1;
      return new Response('payment intent pi_test_2 for buyer@example.com at 10.0.0.42 already fully refunded by re_old_123 on acct_refund_1 with sk_live_refund_secret', { status: 400 });
    },
  });
  const blocked = await blockedProvider.createRefund({
    orderId: 'order-2',
    stripePaymentIntentId: 'pi_test_2',
    amountCents: 500,
    currency: 'usd',
  });
  assert.equal(blockedCalls, 1);
  assert.equal(blocked.status, 'blocked');
  assert.ok(blocked.reason?.startsWith('stripe_400'));
  assert.match(blocked.reason ?? '', /\[redacted-email\]/u);
  assert.match(blocked.reason ?? '', /\[redacted-ip\]/u);
  assert.match(blocked.reason ?? '', /\[redacted-secret\]/u);
  assert.match(blocked.reason ?? '', /\[redacted-stripe-id\]/u);
  assert.doesNotMatch(blocked.reason ?? '', /buyer@example\.com|10\.0\.0\.42|sk_live_refund_secret|pi_test_2|re_old_123|acct_refund_1/u);
});

test('LiveStripeConnectProvider refund blocks malformed successful responses', async () => {
  const provider = new LiveStripeConnectProvider({
    apiKey: 'sk_live_test',
    maxRetries: 0,
    retryBackoffMs: 1,
    fetchFn: async () => new Response(JSON.stringify({ id: 'rf_not_a_refund', status: 'succeeded' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  });

  const result = await provider.createRefund({
    orderId: 'order-malformed-refund',
    stripePaymentIntentId: 'pi_test_malformed',
    amountCents: 500,
    currency: 'usd',
  });

  assert.equal(result.stripeRefundId, 'refund-failed-order-malformed-refund');
  assert.equal(result.status, 'blocked');
  assert.equal(result.reason, 'stripe_malformed_response:missing_refund_id');
});
