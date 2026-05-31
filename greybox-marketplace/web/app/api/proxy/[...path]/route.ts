// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

/**
 * Server-side proxy from the browser to greybox-marketplace.
 *
 * The browser never sees the admin token. This route injects it for paths
 * that require it (anything except `/health`, `/healthz`, `/readyz`,
 * `/v1/marketplace/catalog`, `/v1/marketplace/listings?status=published`, and
 * the per-creator storefronts).
 *
 * URL: `/api/proxy/v1/marketplace/...` => `${MARKETPLACE_API_URL}/v1/marketplace/...`
 */

import { NextRequest, NextResponse } from 'next/server';
import { readServerApiConfig } from '@/lib/server-api';
import { isPublicPath } from '@/lib/proxy-policy';

async function proxy(req: NextRequest, context: { params: Promise<{ path: string[] }> }): Promise<NextResponse> {
  const { path } = await context.params;
  const config = readServerApiConfig();
  const url = new URL(req.url);
  const upstreamPath = `/${path.join('/')}`;
  const upstreamUrl = `${config.baseUrl}${upstreamPath}${url.search}`;

  const headers: Record<string, string> = {};
  const contentType = req.headers.get('content-type');
  if (contentType) headers['content-type'] = contentType;
  const accept = req.headers.get('accept');
  if (accept) headers.accept = accept;
  if (!isPublicPath(upstreamPath, url.search) && config.adminToken) {
    headers.authorization = `Bearer ${config.adminToken}`;
  }

  const init: RequestInit = { method: req.method, headers };
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const body = await req.arrayBuffer();
    if (body.byteLength > 0) init.body = body;
  }

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, init);
  } catch (err) {
    return NextResponse.json(
      {
        error: {
          code: 'UPSTREAM_UNREACHABLE',
          message: err instanceof Error ? err.message : 'marketplace upstream unreachable',
        },
      },
      { status: 502 },
    );
  }

  const responseHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    // Strip hop-by-hop + CORS headers; Next adds its own.
    if (['content-encoding', 'content-length', 'transfer-encoding', 'connection'].includes(key)) return;
    if (key.toLowerCase().startsWith('access-control-')) return;
    responseHeaders.set(key, value);
  });
  const buffer = await upstream.arrayBuffer();
  return new NextResponse(buffer, { status: upstream.status, headers: responseHeaders });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;

export const dynamic = 'force-dynamic';
