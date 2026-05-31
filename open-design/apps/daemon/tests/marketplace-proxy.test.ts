// SPDX-License-Identifier: Apache-2.0

import http from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

type StartedServer = { server: http.Server; url: string };

let daemon: http.Server | undefined;
let baseUrl = '';
let marketplace: http.Server | undefined;
let marketplaceUrl = '';
let lastMarketplaceAuth: string | undefined;
let lastMarketplaceCheckoutBody: unknown;
let lastMarketplaceOrderBody: unknown;

const originalMarketplaceUrl = process.env.AGDS_MARKETPLACE_URL;
const originalMarketplaceToken = process.env.AGDS_MARKETPLACE_TOKEN;
const originalMarketplaceCheckoutUrl = process.env.AGDS_MARKETPLACE_CHECKOUT_URL;
const originalMarketplaceCheckoutSuccessUrl = process.env.AGDS_MARKETPLACE_CHECKOUT_SUCCESS_URL;
const originalMarketplaceCheckoutCancelUrl = process.env.AGDS_MARKETPLACE_CHECKOUT_CANCEL_URL;

async function listen(server: http.Server): Promise<string> {
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('server did not bind to TCP');
  return `http://${address.address}:${address.port}`;
}

async function close(server: http.Server | undefined): Promise<void> {
  if (!server) return;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function json(res: http.ServerResponse, body: unknown, status = 200): void {
  const encoded = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Length': Buffer.byteLength(encoded),
    'Content-Type': 'application/json',
  });
  res.end(encoded);
}

async function readJson(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return chunks.length > 0
    ? JSON.parse(Buffer.concat(chunks).toString('utf8'))
    : {};
}

async function startFakeMarketplace(): Promise<void> {
  marketplace = http.createServer((req, res) => {
    lastMarketplaceAuth = req.headers.authorization;
    if (req.url === '/health') {
      json(res, { ok: true, service: 'greybox-marketplace' });
      return;
    }
    if (req.url === '/v1/marketplace/stats') {
      json(res, {
        stats: {
          gmvCents: 25_000,
          platformRevenueCents: 3_750,
          creatorNetCents: 21_250,
          orders: 5,
          activeCreatorsWithSales: 3,
          publishedListings: 2,
        },
      });
      return;
    }
    if (req.url === '/v1/marketplace/listings?status=published') {
      json(res, {
        listings: [
          {
            id: 'listing-1',
            creatorId: 'creator-1',
            title: 'Readable Boss Arena Template',
            description: 'AI-assisted boss arena pacing, counterplay, stamina tells, and phase transition template.',
            category: 'template',
            priceCents: 5_000,
            currency: 'usd',
            tags: ['boss', 'combat'],
            status: 'published',
            createdAt: 100,
            updatedAt: 200,
            publishedAt: 200,
          },
        ],
      });
      return;
    }
    if (req.method === 'POST' && req.url === '/v1/marketplace/orders') {
      void (async () => {
        lastMarketplaceOrderBody = await readJson(req);
        json(res, {
          order: {
            id: 'order-1',
            buyerId: 'project-1',
            creatorId: 'creator-1',
            listingId: 'listing-1',
            grossCents: 5_000,
            platformFeeCents: 750,
            creatorNetCents: 4_250,
            currency: 'usd',
            createdAt: 300,
            payoutId: 'payout-1',
            taxRecordId: 'tax-1',
          },
          payout: { id: 'payout-1' },
          taxRecord: { id: 'tax-1' },
        }, 201);
      })();
      return;
    }
    if (req.method === 'POST' && req.url === '/v1/marketplace/checkout/sessions') {
      void (async () => {
        lastMarketplaceCheckoutBody = await readJson(req);
        json(res, {
          plan: {
            listingId: 'listing-1',
            buyerId: 'project-1',
            readiness: { status: 'ready', requirements: [] },
          },
          checkout: {
            id: 'cs_test_marketplace_ready',
            url: 'https://checkout.stripe.com/c/pay/cs_test_marketplace_ready',
            livemode: false,
            expiresAt: 1_800,
          },
        }, 201);
      })();
      return;
    }
    json(res, { error: { code: 'NOT_FOUND' } }, 404);
  });
  marketplaceUrl = await listen(marketplace);
}

beforeEach(async () => {
  delete process.env.AGDS_MARKETPLACE_CHECKOUT_CANCEL_URL;
  delete process.env.AGDS_MARKETPLACE_CHECKOUT_SUCCESS_URL;
  delete process.env.AGDS_MARKETPLACE_CHECKOUT_URL;
  delete process.env.AGDS_MARKETPLACE_URL;
  delete process.env.AGDS_MARKETPLACE_TOKEN;
  lastMarketplaceAuth = undefined;
  lastMarketplaceCheckoutBody = undefined;
  lastMarketplaceOrderBody = undefined;
  const started = (await startServer({ port: 0, returnServer: true })) as StartedServer;
  daemon = started.server;
  baseUrl = started.url;
});

afterEach(async () => {
  await close(daemon);
  await close(marketplace);
  daemon = undefined;
  marketplace = undefined;
  marketplaceUrl = '';
  if (originalMarketplaceUrl === undefined) delete process.env.AGDS_MARKETPLACE_URL;
  else process.env.AGDS_MARKETPLACE_URL = originalMarketplaceUrl;
  if (originalMarketplaceToken === undefined) delete process.env.AGDS_MARKETPLACE_TOKEN;
  else process.env.AGDS_MARKETPLACE_TOKEN = originalMarketplaceToken;
  if (originalMarketplaceCheckoutUrl === undefined) delete process.env.AGDS_MARKETPLACE_CHECKOUT_URL;
  else process.env.AGDS_MARKETPLACE_CHECKOUT_URL = originalMarketplaceCheckoutUrl;
  if (originalMarketplaceCheckoutSuccessUrl === undefined) delete process.env.AGDS_MARKETPLACE_CHECKOUT_SUCCESS_URL;
  else process.env.AGDS_MARKETPLACE_CHECKOUT_SUCCESS_URL = originalMarketplaceCheckoutSuccessUrl;
  if (originalMarketplaceCheckoutCancelUrl === undefined) delete process.env.AGDS_MARKETPLACE_CHECKOUT_CANCEL_URL;
  else process.env.AGDS_MARKETPLACE_CHECKOUT_CANCEL_URL = originalMarketplaceCheckoutCancelUrl;
});

describe('marketplace proxy routes', () => {
  it('reports an unconfigured bridge without requiring the closed-core marketplace', async () => {
    const status = await fetch(`${baseUrl}/api/marketplace/status`);
    expect(status.status).toBe(200);
    expect(await status.json()).toEqual({
      configured: false,
      status: 'unconfigured',
    });

    const listings = await fetch(`${baseUrl}/api/marketplace/listings`);
    expect(listings.status).toBe(200);
    expect(await listings.json()).toEqual({
      configured: false,
      status: 'unconfigured',
      listings: [],
    });

    const order = await fetch(`${baseUrl}/api/marketplace/orders`, {
      body: JSON.stringify({ buyerId: 'project-1', listingId: 'listing-1' }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });
    expect(order.status).toBe(200);
    expect(await order.json()).toMatchObject({
      configured: false,
      status: 'unconfigured',
    });
  });

  it('proxies marketplace health, stats, published listings, and purchase handoff with a service token', async () => {
    await startFakeMarketplace();
    process.env.AGDS_MARKETPLACE_URL = marketplaceUrl;
    process.env.AGDS_MARKETPLACE_TOKEN = 'proxy-token';

    const status = await fetch(`${baseUrl}/api/marketplace/status`);
    expect(status.status).toBe(200);
    expect(await status.json()).toMatchObject({
      configured: true,
      status: 'online',
      service: 'greybox-marketplace',
      stats: {
        gmvCents: 25_000,
        activeCreatorsWithSales: 3,
        publishedListings: 2,
      },
    });
    expect(lastMarketplaceAuth).toBe('Bearer proxy-token');

    const listings = await fetch(`${baseUrl}/api/marketplace/listings`);
    expect(listings.status).toBe(200);
    expect(await listings.json()).toMatchObject({
      configured: true,
      status: 'online',
      listings: [
        {
          id: 'listing-1',
          title: 'Readable Boss Arena Template',
          category: 'template',
          priceCents: 5_000,
          status: 'published',
        },
      ],
    });

    const order = await fetch(`${baseUrl}/api/marketplace/orders`, {
      body: JSON.stringify({ buyerId: 'project-1', listingId: 'listing-1' }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });
    expect(order.status).toBe(200);
    expect(await order.json()).toMatchObject({
      configured: true,
      status: 'online',
      order: {
        id: 'order-1',
        buyerId: 'project-1',
        creatorId: 'creator-1',
        listingId: 'listing-1',
        grossCents: 5_000,
        platformFeeCents: 750,
        creatorNetCents: 4_250,
        payoutId: 'payout-1',
        taxRecordId: 'tax-1',
      },
    });
    expect(lastMarketplaceAuth).toBe('Bearer proxy-token');
    expect(lastMarketplaceOrderBody).toEqual({ buyerId: 'project-1', listingId: 'listing-1' });
    expect(lastMarketplaceCheckoutBody).toBeUndefined();
  });

  it('requires the service token before proxying marketplace purchases', async () => {
    await startFakeMarketplace();
    process.env.AGDS_MARKETPLACE_URL = marketplaceUrl;

    const response = await fetch(`${baseUrl}/api/marketplace/orders`, {
      body: JSON.stringify({ buyerId: 'project-1', listingId: 'listing-1' }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      configured: true,
      status: 'error',
      error: 'AGDS_MARKETPLACE_TOKEN is required for marketplace purchases',
    });
    expect(lastMarketplaceOrderBody).toBeUndefined();
  });

  it('creates an upstream Checkout Session when success and cancel URLs are configured', async () => {
    await startFakeMarketplace();
    process.env.AGDS_MARKETPLACE_URL = marketplaceUrl;
    process.env.AGDS_MARKETPLACE_TOKEN = 'proxy-token';
    process.env.AGDS_MARKETPLACE_CHECKOUT_SUCCESS_URL = 'https://greybox.studio/marketplace/success?session_id={CHECKOUT_SESSION_ID}';
    process.env.AGDS_MARKETPLACE_CHECKOUT_CANCEL_URL = 'https://greybox.studio/marketplace/cancel';

    const response = await fetch(`${baseUrl}/api/marketplace/orders`, {
      body: JSON.stringify({ buyerId: 'project-1', listingId: 'listing-1' }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      configured: true,
      status: 'online',
      checkoutSessionId: 'cs_test_marketplace_ready',
      checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_test_marketplace_ready',
      nextAction: 'checkout',
    });
    expect(lastMarketplaceAuth).toBe('Bearer proxy-token');
    expect(lastMarketplaceOrderBody).toBeUndefined();
    expect(lastMarketplaceCheckoutBody).toEqual({
      buyerId: 'project-1',
      listingId: 'listing-1',
      successUrl: 'https://greybox.studio/marketplace/success?session_id={CHECKOUT_SESSION_ID}',
      cancelUrl: 'https://greybox.studio/marketplace/cancel',
    });
  });

  it('requires paired Checkout Session return URLs before proxying checkout sessions', async () => {
    await startFakeMarketplace();
    process.env.AGDS_MARKETPLACE_URL = marketplaceUrl;
    process.env.AGDS_MARKETPLACE_TOKEN = 'proxy-token';
    process.env.AGDS_MARKETPLACE_CHECKOUT_SUCCESS_URL = 'https://greybox.studio/marketplace/success';

    const response = await fetch(`${baseUrl}/api/marketplace/orders`, {
      body: JSON.stringify({ buyerId: 'project-1', listingId: 'listing-1' }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      configured: true,
      status: 'error',
      error: 'AGDS_MARKETPLACE_CHECKOUT_SUCCESS_URL and AGDS_MARKETPLACE_CHECKOUT_CANCEL_URL must be configured together',
    });
    expect(lastMarketplaceOrderBody).toBeUndefined();
    expect(lastMarketplaceCheckoutBody).toBeUndefined();
  });

  it('returns a checkout handoff without proxying a purchase when checkout is configured', async () => {
    await startFakeMarketplace();
    process.env.AGDS_MARKETPLACE_URL = marketplaceUrl;
    process.env.AGDS_MARKETPLACE_CHECKOUT_URL = 'https://cloud.greybox.studio/marketplace/checkout';

    const response = await fetch(`${baseUrl}/api/marketplace/orders`, {
      body: JSON.stringify({ buyerId: 'project-1', listingId: 'listing-1' }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      configured: true,
      status: 'online',
      checkoutUrl: 'https://cloud.greybox.studio/marketplace/checkout?buyerId=project-1&listingId=listing-1',
      nextAction: 'checkout',
    });
    expect(lastMarketplaceOrderBody).toBeUndefined();
  });

  it('reports invalid checkout handoff configuration without proxying a purchase', async () => {
    await startFakeMarketplace();
    process.env.AGDS_MARKETPLACE_URL = marketplaceUrl;
    process.env.AGDS_MARKETPLACE_CHECKOUT_URL = 'mailto:checkout@greybox.studio';

    const response = await fetch(`${baseUrl}/api/marketplace/orders`, {
      body: JSON.stringify({ buyerId: 'project-1', listingId: 'listing-1' }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      configured: true,
      status: 'error',
      error: 'AGDS_MARKETPLACE_CHECKOUT_URL must be an http(s) URL',
    });
    expect(lastMarketplaceOrderBody).toBeUndefined();
  });

  it('rejects unsupported marketplace listing filters before calling upstream', async () => {
    await startFakeMarketplace();
    process.env.AGDS_MARKETPLACE_URL = marketplaceUrl;

    const response = await fetch(`${baseUrl}/api/marketplace/listings?category=unsupported`);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: {
        code: 'BAD_REQUEST',
        message: 'unsupported marketplace category',
      },
    });
  });
});
