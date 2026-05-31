// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { test as base, expect, Page } from '@playwright/test';

/**
 * Shared mocks for the Next.js proxy. We pin every backend call to a
 * deterministic JSON response so tests don't need a live marketplace server.
 * The `MARKETPLACE_INTEGRATION=1` env flag short-circuits all of these so
 * `pnpm test:integration` runs against a real local marketplace.
 */

export interface MockStateOverrides {
  catalog?: unknown;
  listings?: unknown;
  reviewDashboard?: unknown;
  stats?: unknown;
  onboardingLink?: unknown;
  payoutReadiness?: unknown;
  submitListing?: unknown;
  taxProfile?: unknown;
  upsertCreator?: unknown;
  approveReview?: unknown;
  checkoutSession?: unknown;
}

export const defaultMocks: Required<MockStateOverrides> = {
  catalog: {
    catalog: {
      total: 2,
      offset: 0,
      limit: 24,
      facets: { categories: [], tags: [{ value: 'tactics', count: 1 }] },
      listings: [
        {
          id: 'listing-pf-1',
          title: 'Hex tactics starter',
          description: 'Production-ready hex tactics base.',
          category: 'template',
          priceCents: 4900,
          currency: 'usd',
          licenseSummary: 'Single team commercial use.',
          tags: ['tactics', 'hex'],
          publishedAt: 1716480000000,
          creator: { id: 'creator-1', displayName: 'Avery Loops', country: 'US' },
          score: 1,
          salesCount: 12,
        },
        {
          id: 'listing-pf-2',
          title: 'Art bible: cosy farming',
          description: 'Style guide for cosy farm games.',
          category: 'custom-art-bible',
          priceCents: 2900,
          currency: 'usd',
          licenseSummary: 'Studio license.',
          tags: ['cosy', 'farming'],
          publishedAt: 1716480000000,
          creator: { id: 'creator-2', displayName: 'Sora Plains', country: 'JP' },
          score: 1,
          salesCount: 3,
        },
      ],
    },
  },
  listings: {
    listings: [
      {
        id: 'listing-pf-1',
        creatorId: 'creator-1',
        title: 'Hex tactics starter',
        description: 'Production-ready hex tactics base.',
        category: 'template',
        priceCents: 4900,
        currency: 'usd',
        licenseSummary: 'Single team commercial use.',
        tags: ['tactics', 'hex'],
        status: 'published',
        createdAt: 1716480000000,
        updatedAt: 1716480000000,
        publishedAt: 1716480000000,
        reviewId: 'review-pf-1',
      },
    ],
  },
  reviewDashboard: {
    dashboard: {
      generatedAt: Date.now(),
      summary: {
        totalReviews: 1,
        pendingHumanReviews: 1,
        rejectedReviews: 0,
        passedReviews: 0,
        criticalFlags: 0,
        highFlags: 0,
        flaglessHumanReviews: 1,
        oldestPendingAgeMs: 7200000,
      },
      reviews: [
        {
          reviewId: 'review-pf-pending',
          listingId: 'listing-pf-pending',
          creatorId: 'creator-1',
          title: 'New pending listing',
          category: 'template',
          priceCents: 1900,
          currency: 'usd',
          status: 'human-required',
          humanReviewRequired: true,
          flagCount: 0,
          flagIds: [],
          createdAt: Date.now() - 7200000,
          ageMs: 7200000,
          recommendedAction: 'investigate',
        },
      ],
    },
  },
  stats: {
    stats: {
      gmvCents: 1_250_000,
      platformRevenueCents: 87_500,
      creatorNetCents: 1_162_500,
      orders: 24,
      activeCreatorsWithSales: 6,
      publishedListings: 3,
    },
  },
  onboardingLink: {
    result: {
      creator: {
        id: 'creator-pf-new',
        displayName: 'Test Creator',
        country: 'US',
        active: true,
        stripeConnectAccountId: 'acct_pf_new',
        hasTaxProfile: false,
      },
      plan: {
        creatorId: 'creator-pf-new',
        readiness: {
          creatorId: 'creator-pf-new',
          status: 'needs-onboarding',
          canReceivePayouts: false,
          hasTaxProfile: false,
          requirements: [
            { code: 'stripe_connect_onboarding_required', severity: 'required', message: 'Complete Stripe onboarding' },
          ],
        },
      },
      account: { stripeConnectAccountId: 'acct_pf_new' },
      accountLink: { url: '/creator/onboard?step=2&stripe=return' },
    },
  },
  payoutReadiness: {
    readiness: {
      creatorId: 'creator-pf-new',
      status: 'ready',
      canReceivePayouts: true,
      stripeConnectAccountId: 'acct_pf_new',
      hasTaxProfile: true,
      requirements: [],
    },
  },
  submitListing: {
    listing: {
      id: 'listing-pf-new',
      creatorId: 'creator-pf-new',
      title: 'Walked listing',
      description: 'wizard description',
      category: 'template',
      priceCents: 2900,
      currency: 'usd',
      licenseSummary: 'studio',
      tags: ['playwright'],
      status: 'pending-human-review',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      reviewId: 'review-pf-new',
    },
    review: {
      id: 'review-pf-new',
      listingId: 'listing-pf-new',
      status: 'human-required',
      flags: [],
      humanReviewRequired: true,
      createdAt: Date.now(),
    },
  },
  taxProfile: {
    result: {
      creator: {
        id: 'creator-pf-new',
        displayName: 'Test Creator',
        country: 'US',
        active: true,
        stripeConnectAccountId: 'acct_pf_new',
        hasTaxProfile: true,
      },
      readiness: {
        creatorId: 'creator-pf-new',
        status: 'ready',
        canReceivePayouts: true,
        hasTaxProfile: true,
        requirements: [],
      },
      taxProfile: {
        referencePresent: true,
        provider: 'stripe-tax',
        country: 'US',
        collectedAt: Date.now(),
      },
    },
  },
  upsertCreator: {
    creator: {
      id: 'creator-pf-new',
      displayName: 'Test Creator',
      country: 'US',
      monthlyGmvCents: 0,
      lifetimeGmvCents: 0,
      active: true,
    },
  },
  approveReview: {
    listing: {
      id: 'listing-pf-pending',
      creatorId: 'creator-1',
      title: 'New pending listing',
      description: 'desc',
      category: 'template',
      priceCents: 1900,
      currency: 'usd',
      licenseSummary: 'studio',
      tags: [],
      status: 'published',
      createdAt: Date.now() - 7200000,
      updatedAt: Date.now(),
      publishedAt: Date.now(),
    },
  },
  checkoutSession: {
    plan: {
      listingId: 'listing-pf-1',
      buyerId: 'buyer-1',
      creatorId: 'creator-1',
      orderPreview: {
        id: 'order-1',
        buyerId: 'buyer-1',
        creatorId: 'creator-1',
        listingId: 'listing-pf-1',
        grossCents: 4900,
        platformFeeCents: 343,
        creatorNetCents: 4557,
        currency: 'usd',
        createdAt: Date.now(),
      },
      readiness: { status: 'ready', requirements: [] },
    },
    checkout: { id: 'cs_test_pf', url: 'https://example.test/checkout/cs_test_pf' },
  },
};

export async function installProxyMocks(page: Page, overrides: MockStateOverrides = {}): Promise<void> {
  const mocks: Required<MockStateOverrides> = { ...defaultMocks, ...overrides } as Required<MockStateOverrides>;

  await page.route('**/api/proxy/v1/marketplace/**', async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    const path = url.pathname.replace('/api/proxy', '');

    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

    if (method === 'GET' && path.startsWith('/v1/marketplace/catalog')) return json(mocks.catalog);
    if (method === 'GET' && path.startsWith('/v1/marketplace/listings')) return json(mocks.listings);
    if (method === 'GET' && path === '/v1/marketplace/review-dashboard') return json(mocks.reviewDashboard);
    if (method === 'GET' && path === '/v1/marketplace/stats') return json(mocks.stats);
    if (method === 'GET' && /\/v1\/marketplace\/creators\/[^/]+\/payout-readiness/.test(path)) return json(mocks.payoutReadiness);

    if (method === 'POST' && /\/v1\/marketplace\/creators\/[^/]+\/stripe-connect\/onboarding-link/.test(path)) return json(mocks.onboardingLink, 201);
    if (method === 'POST' && /\/v1\/marketplace\/creators\/[^/]+\/tax-profile/.test(path)) return json(mocks.taxProfile);
    if (method === 'POST' && path === '/v1/marketplace/creators') return json(mocks.upsertCreator, 201);
    if (method === 'POST' && path === '/v1/marketplace/listings') return json(mocks.submitListing, 201);
    if (method === 'POST' && /\/v1\/marketplace\/reviews\/[^/]+\/approve/.test(path)) return json(mocks.approveReview);
    if (method === 'POST' && path === '/v1/marketplace/checkout/sessions') return json(mocks.checkoutSession, 201);

    return route.fallback();
  });
}

export const test = base.extend<{
  // No fixtures yet; reserve for future expansion.
}>({});

export { expect };
