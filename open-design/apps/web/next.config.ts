import type { NextConfig } from 'next';
import { dirname, isAbsolute, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// Daemon port the local Express server binds to (see apps/daemon/src/cli.ts). The
// dev-all launcher overrides AGDS_PORT after probing for a free port; we read
// the same env so /api, /artifacts, and /frames always reach the right
// daemon instance during `next dev`.
const DAEMON_PORT = Number(resolveEnvironmentValue(process.env.AGDS_PORT)) || 7456;
const DAEMON_ORIGIN = `http://127.0.0.1:${DAEMON_PORT}`;
const EXTERNAL_DAEMON_ORIGIN = resolveDaemonOrigin(process.env.AGDS_DAEMON_ORIGIN);

function resolveEnvironmentValue(value: string | undefined): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function resolveDaemonOrigin(value: string | undefined): string | undefined {
  const clean = resolveEnvironmentValue(value);
  if (!clean) return undefined;
  try {
    const url = new URL(clean);
    if (url.protocol === 'https:') return url.origin;
    const host = url.hostname.toLowerCase();
    if (url.protocol === 'http:' && (host === 'localhost' || host === '127.0.0.1' || host === '[::1]')) {
      return url.origin;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

// The regular CLI build still ships as a static export so the `agds` daemon can
// serve a single-process production build. Packaged desktop builds opt into a
// server runtime with AGDS_WEB_OUTPUT_MODE=server; in that mode the web sidecar
// owns the Next.js SSR server and proxies daemon routes at runtime. The
// packaged-size standalone spike uses AGDS_WEB_OUTPUT_MODE=standalone to ask
// Next.js for a traced standalone server while keeping the sidecar-owned daemon
// proxy in front of it at runtime.
const isProd = process.env.NODE_ENV !== 'development';
const webOutputMode = resolveEnvironmentValue(process.env.AGDS_WEB_OUTPUT_MODE);
const isServerOutput = webOutputMode === 'server' || webOutputMode === 'standalone';
const shouldStaticExport = isProd && !isServerOutput;
const daemonRewriteOrigin = EXTERNAL_DAEMON_ORIGIN ?? (!isProd ? DAEMON_ORIGIN : undefined);

const WEB_ROOT = dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = dirname(dirname(WEB_ROOT));
const toPosixPath = (value: string) => value.replaceAll('\\', '/');

function resolveDistDir(defaultValue: string) {
  if (process.env.AGDS_WEB_PROD === '1') return defaultValue;
  const configured = resolveEnvironmentValue(process.env.AGDS_WEB_DIST_DIR);
  if (!configured) return defaultValue;
  return toPosixPath(isAbsolute(configured) ? relative(WEB_ROOT, configured) || '.' : configured);
}

const DIST_DIR = resolveDistDir(isProd ? (shouldStaticExport ? 'out' : '.next') : '.next');

function resolveDevTsconfigPath() {
  const configured = resolveEnvironmentValue(process.env.AGDS_WEB_TSCONFIG_PATH);
  if (!configured) return undefined;
  return toPosixPath(isAbsolute(configured) ? relative(WEB_ROOT, configured) || 'tsconfig.json' : configured);
}

const DEV_TSCONFIG_PATH = resolveDevTsconfigPath();

function daemonRewrites(daemonOrigin: string): Array<{ source: string; destination: string }> {
  return [
    { source: '/api/:path*', destination: `${daemonOrigin}/api/:path*` },
    { source: '/artifacts/:path*', destination: `${daemonOrigin}/artifacts/:path*` },
    { source: '/frames/:path*', destination: `${daemonOrigin}/frames/:path*` },
    { source: '/assets/prompt-templates/:path*', destination: `${daemonOrigin}/assets/prompt-templates/:path*` },
  ];
}

// Production security headers. Tight by default; dev loosens script-src
// because Next's dev tooling needs eval. The static-export path skips
// headers() (a Next limitation); the daemon mirrors them there.
function buildContentSecurityPolicy(isDev: boolean): string {
  const scriptSrc = isDev ? "'self' 'unsafe-inline' 'unsafe-eval'" : "'self'";
  return [
    "default-src 'self'",
    "base-uri 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: https:",
    "connect-src 'self' https://api.anthropic.com https://api.openai.com https://*.amazonaws.com",
    // FileViewer renders AI-generated HTML inside sandboxed iframes via srcdoc.
    "frame-src 'self' blob: data:",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "upgrade-insecure-requests",
  ].join('; ');
}

const SECURITY_HEADERS: Array<{ key: string; value: string }> = [
  { key: 'Content-Security-Policy', value: buildContentSecurityPolicy(!isProd) },
  // 1y HSTS; preload is opt-in via hstspreload.org once the domain is stable.
  { key: 'Strict-Transport-Security', value: isProd ? 'max-age=31536000; includeSubDomains' : 'max-age=0' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(self), usb=(), magnetometer=()',
  },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
];

const nextConfig: NextConfig = {
  allowedDevOrigins: ['127.0.0.1'],
  outputFileTracingRoot: WORKSPACE_ROOT,
  reactStrictMode: true,
  turbopack: {
    root: WORKSPACE_ROOT,
  },
  ...(shouldStaticExport
    ? {}
    : {
        async headers() {
          return [{ source: '/:path*', headers: SECURITY_HEADERS }];
        },
      }),
  ...(DEV_TSCONFIG_PATH ? { typescript: { tsconfigPath: DEV_TSCONFIG_PATH } } : {}),
  // Keep the bundle output predictable so the daemon's STATIC_DIR can point
  // at it without any glob trickery.
  distDir: DIST_DIR,
  ...(shouldStaticExport
    ? {
        output: 'export' as const,
        // `next export` skips trailing slashes by default; opting in keeps
        // the daemon's static fallback simple (every directory has its own
        // index.html on disk).
        trailingSlash: true,
        images: { unoptimized: true },
      }
    : {
        ...(webOutputMode === 'standalone'
          ? {
              output: 'standalone' as const,
            }
          : {}),
        ...(daemonRewriteOrigin
          ? {
              async rewrites() {
                // In dev we run the daemon on a sibling port; in Topology B a
                // Vercel server build can proxy to an explicitly configured
                // creator-owned tunnel. Static exports stay daemon-served.
                return daemonRewrites(daemonRewriteOrigin);
              },
            }
          : {}),
        ...(!isProd
          ? {
              devIndicators: {
                position: 'bottom-right',
              },
            }
          : {}),
      }),
};

export default nextConfig;
