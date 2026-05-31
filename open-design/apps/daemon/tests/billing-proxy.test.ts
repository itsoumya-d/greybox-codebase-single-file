// SPDX-License-Identifier: Apache-2.0

import http from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

type StartedServer = { server: http.Server; url: string };

let daemon: http.Server | undefined;
let baseUrl = '';
let cloud: http.Server | undefined;
let cloudUrl = '';

interface CapturedRequest {
  method: string | undefined;
  url: string | undefined;
  authorization: string | undefined;
  contentType: string | undefined;
  body: unknown;
}

let lastCloudRequest: CapturedRequest | undefined;
let nextCloudResponse: {
  status: number;
  body: unknown;
} = { status: 200, body: {} };

const originalCloudUrl = process.env.GREYBOX_CLOUD_URL;
const originalCloudToken = process.env.GREYBOX_CLOUD_TOKEN;
const originalLicenseKey = process.env.GREYBOX_LICENSE_KEY;
const originalAgdsCloudUrl = process.env.AGDS_GREYBOX_CLOUD_URL;
const originalAgdsBillingUrl = process.env.AGDS_BILLING_CLOUD_URL;
const originalAgdsBillingToken = process.env.AGDS_BILLING_CLOUD_TOKEN;

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

async function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return null;
  }
}

async function startFakeCloud(): Promise<void> {
  cloud = http.createServer((req, res) => {
    void (async () => {
      const body = await readJsonBody(req);
      lastCloudRequest = {
        method: req.method,
        url: req.url,
        authorization:
          typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined,
        contentType:
          typeof req.headers['content-type'] === 'string' ? req.headers['content-type'] : undefined,
        body,
      };
      json(res, nextCloudResponse.body, nextCloudResponse.status);
    })();
  });
  cloudUrl = await listen(cloud);
}

beforeEach(async () => {
  delete process.env.GREYBOX_CLOUD_URL;
  delete process.env.GREYBOX_CLOUD_TOKEN;
  delete process.env.GREYBOX_LICENSE_KEY;
  delete process.env.AGDS_GREYBOX_CLOUD_URL;
  delete process.env.AGDS_BILLING_CLOUD_URL;
  delete process.env.AGDS_BILLING_CLOUD_TOKEN;
  lastCloudRequest = undefined;
  nextCloudResponse = { status: 200, body: {} };
  const started = (await startServer({ port: 0, returnServer: true })) as StartedServer;
  daemon = started.server;
  baseUrl = started.url;
});

afterEach(async () => {
  await close(daemon);
  await close(cloud);
  daemon = undefined;
  cloud = undefined;
  cloudUrl = '';
  if (originalCloudUrl === undefined) delete process.env.GREYBOX_CLOUD_URL;
  else process.env.GREYBOX_CLOUD_URL = originalCloudUrl;
  if (originalCloudToken === undefined) delete process.env.GREYBOX_CLOUD_TOKEN;
  else process.env.GREYBOX_CLOUD_TOKEN = originalCloudToken;
  if (originalLicenseKey === undefined) delete process.env.GREYBOX_LICENSE_KEY;
  else process.env.GREYBOX_LICENSE_KEY = originalLicenseKey;
  if (originalAgdsCloudUrl === undefined) delete process.env.AGDS_GREYBOX_CLOUD_URL;
  else process.env.AGDS_GREYBOX_CLOUD_URL = originalAgdsCloudUrl;
  if (originalAgdsBillingUrl === undefined) delete process.env.AGDS_BILLING_CLOUD_URL;
  else process.env.AGDS_BILLING_CLOUD_URL = originalAgdsBillingUrl;
  if (originalAgdsBillingToken === undefined) delete process.env.AGDS_BILLING_CLOUD_TOKEN;
  else process.env.AGDS_BILLING_CLOUD_TOKEN = originalAgdsBillingToken;
});

describe('billing proxy routes', () => {
  it('forwards POST /api/billing/checkout body, headers, and surfaces the cloud checkout URL', async () => {
    await startFakeCloud();
    process.env.GREYBOX_CLOUD_URL = cloudUrl;
    process.env.GREYBOX_CLOUD_TOKEN = 'cloud-token-XYZ';
    nextCloudResponse = {
      status: 200,
      body: {
        url: 'https://checkout.stripe.com/c/pay/cs_test_billing_proxy',
        id: 'cs_test_billing_proxy',
        dryRun: false,
      },
    };

    const response = await fetch(`${baseUrl}/api/billing/checkout`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tier: 'studio',
        seats: 3,
        successUrl: 'http://localhost:3000/billing/success?session_id={CHECKOUT_SESSION_ID}',
        cancelUrl: 'http://localhost:3000/billing/cancel',
        customerEmail: 'creator@example.com',
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      url: 'https://checkout.stripe.com/c/pay/cs_test_billing_proxy',
      id: 'cs_test_billing_proxy',
      dryRun: false,
    });

    expect(lastCloudRequest?.method).toBe('POST');
    expect(lastCloudRequest?.url).toBe('/v1/billing/checkout-session');
    expect(lastCloudRequest?.authorization).toBe('Bearer cloud-token-XYZ');
    expect(lastCloudRequest?.contentType).toMatch(/application\/json/u);
    expect(lastCloudRequest?.body).toMatchObject({
      tier: 'studio',
      seats: 3,
      successUrl: 'http://localhost:3000/billing/success?session_id={CHECKOUT_SESSION_ID}',
      cancelUrl: 'http://localhost:3000/billing/cancel',
      customerEmail: 'creator@example.com',
    });
  });

  it('rejects checkout requests with a non-https returnable URL', async () => {
    const response = await fetch(`${baseUrl}/api/billing/checkout`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tier: 'studio',
        successUrl: 'ftp://evil.example.com/x',
        cancelUrl: 'http://localhost:3000/billing/cancel',
      }),
    });
    expect(response.status).toBe(400);
  });

  it('rejects checkout requests with an unsupported tier', async () => {
    const response = await fetch(`${baseUrl}/api/billing/checkout`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tier: 'platinum',
        successUrl: 'http://localhost:3000/billing/success',
        cancelUrl: 'http://localhost:3000/billing/cancel',
      }),
    });
    expect(response.status).toBe(400);
  });

  it('propagates cloud errors with the original status code', async () => {
    await startFakeCloud();
    process.env.GREYBOX_CLOUD_URL = cloudUrl;
    nextCloudResponse = {
      status: 503,
      body: { error: 'stripe_price_not_configured', message: 'price missing' },
    };
    const response = await fetch(`${baseUrl}/api/billing/checkout`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tier: 'indie',
        successUrl: 'http://localhost:3000/billing/success',
        cancelUrl: 'http://localhost:3000/billing/cancel',
      }),
    });
    expect(response.status).toBe(503);
    const payload = (await response.json()) as { error?: { code?: string } };
    expect(payload.error?.code).toBe('STRIPE_PRICE_NOT_CONFIGURED');
  });

  it('forwards POST /api/billing/portal and surfaces the customer portal URL', async () => {
    await startFakeCloud();
    process.env.GREYBOX_CLOUD_URL = cloudUrl;
    nextCloudResponse = {
      status: 200,
      body: {
        url: 'https://billing.stripe.com/p/session/test_bps',
        id: 'bps_test_billing_proxy',
        dryRun: false,
      },
    };
    const response = await fetch(`${baseUrl}/api/billing/portal`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        customerId: 'cus_test_billing_proxy',
        returnUrl: 'http://localhost:3000/billing',
      }),
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      url: 'https://billing.stripe.com/p/session/test_bps',
      id: 'bps_test_billing_proxy',
    });
    expect(lastCloudRequest?.url).toBe('/v1/billing/portal-session');
    expect(lastCloudRequest?.body).toMatchObject({
      customerId: 'cus_test_billing_proxy',
      returnUrl: 'http://localhost:3000/billing',
    });
  });

  it('returns a free baseline from /api/billing/me when the cloud does not yet expose /v1/billing/me', async () => {
    await startFakeCloud();
    process.env.GREYBOX_CLOUD_URL = cloudUrl;
    nextCloudResponse = { status: 404, body: { error: 'not_found' } };
    const response = await fetch(`${baseUrl}/api/billing/me`);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      configured: true,
      status: 'ok',
      tier: 'free',
      portalAvailable: false,
    });
  });

  it('returns the cloud subscription snapshot when /v1/billing/me is available', async () => {
    await startFakeCloud();
    process.env.GREYBOX_CLOUD_URL = cloudUrl;
    nextCloudResponse = {
      status: 200,
      body: {
        tier: 'studio',
        seats: 5,
        customerId: 'cus_test_billing_proxy',
        currentPeriodEnd: 1_800_000_000,
        cancelAtPeriodEnd: false,
        includedInputTokens: 5_000_000,
        includedOutputTokens: 1_000_000,
      },
    };
    const response = await fetch(`${baseUrl}/api/billing/me`);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      configured: true,
      status: 'ok',
      tier: 'studio',
      seats: 5,
      customerId: 'cus_test_billing_proxy',
      portalAvailable: true,
    });
  });

  it('routes Razorpay provider to the Razorpay cloud endpoint', async () => {
    await startFakeCloud();
    process.env.GREYBOX_CLOUD_URL = cloudUrl;
    nextCloudResponse = {
      status: 200,
      body: {
        url: 'https://rzp.io/l/test-razorpay',
        id: 'sub_razorpay_test',
        dryRun: false,
      },
    };

    const response = await fetch(`${baseUrl}/api/billing/checkout`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tier: 'indie',
        provider: 'razorpay',
        successUrl: 'http://localhost:3000/billing/success',
        cancelUrl: 'http://localhost:3000/billing/cancel',
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      url: 'https://rzp.io/l/test-razorpay',
    });
    expect(lastCloudRequest?.method).toBe('POST');
    expect(lastCloudRequest?.url).toBe('/v1/billing/razorpay/checkout-session');
  });

  it('routes Dodo provider to the Dodo cloud endpoint', async () => {
    await startFakeCloud();
    process.env.GREYBOX_CLOUD_URL = cloudUrl;
    nextCloudResponse = {
      status: 200,
      body: {
        url: 'https://checkout.dodopayments.com/c/pay/dodo_test',
        dryRun: false,
      },
    };

    const response = await fetch(`${baseUrl}/api/billing/checkout`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tier: 'studio',
        provider: 'dodo',
        successUrl: 'http://localhost:3000/billing/success',
        cancelUrl: 'http://localhost:3000/billing/cancel',
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      url: 'https://checkout.dodopayments.com/c/pay/dodo_test',
    });
    expect(lastCloudRequest?.method).toBe('POST');
    expect(lastCloudRequest?.url).toBe('/v1/billing/dodo/checkout-session');
  });

  it('GET /api/billing/geo returns country from cf-ipcountry header', async () => {
    const response = await fetch(`${baseUrl}/api/billing/geo`, {
      headers: { 'cf-ipcountry': 'IN' },
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ country: 'IN' });
  });

  it('GET /api/billing/geo defaults to US when no GeoIP header is present', async () => {
    const response = await fetch(`${baseUrl}/api/billing/geo`);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ country: 'US' });
  });

  it('auto-routes to Razorpay when no provider specified and cf-ipcountry is IN', async () => {
    await startFakeCloud();
    process.env.GREYBOX_CLOUD_URL = cloudUrl;
    nextCloudResponse = {
      status: 200,
      body: {
        url: 'https://rzp.io/l/auto-india',
        dryRun: false,
      },
    };

    const response = await fetch(`${baseUrl}/api/billing/checkout`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'cf-ipcountry': 'IN',
      },
      body: JSON.stringify({
        tier: 'indie',
        successUrl: 'http://localhost:3000/billing/success',
        cancelUrl: 'http://localhost:3000/billing/cancel',
      }),
    });

    expect(response.status).toBe(200);
    expect(lastCloudRequest?.url).toBe('/v1/billing/razorpay/checkout-session');
  });

  it('auto-routes to Dodo when no provider specified and cf-ipcountry is DE', async () => {
    await startFakeCloud();
    process.env.GREYBOX_CLOUD_URL = cloudUrl;
    nextCloudResponse = {
      status: 200,
      body: {
        url: 'https://checkout.dodopayments.com/c/pay/auto-de',
        dryRun: false,
      },
    };

    const response = await fetch(`${baseUrl}/api/billing/checkout`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'cf-ipcountry': 'DE',
      },
      body: JSON.stringify({
        tier: 'studio',
        successUrl: 'http://localhost:3000/billing/success',
        cancelUrl: 'http://localhost:3000/billing/cancel',
      }),
    });

    expect(response.status).toBe(200);
    expect(lastCloudRequest?.url).toBe('/v1/billing/dodo/checkout-session');
  });
});
