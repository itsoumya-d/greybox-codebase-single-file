// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.
import type { NextConfig } from 'next';

/**
 * Next.js config for the marketplace web app.
 *
 * The web app talks to greybox-marketplace via the in-process proxy at
 * `/api/proxy/...`. That proxy reads `MARKETPLACE_API_URL` at request time so
 * deploys can target prod, staging, or a local dev instance without rebuild.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    typedRoutes: false,
  },
};

export default nextConfig;
