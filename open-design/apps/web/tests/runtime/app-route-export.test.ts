import { describe, expect, it, vi } from 'vitest';
import nextConfig from '../../next.config';
import * as spaShellRoute from '../../app/[[...slug]]/page';

describe('SPA shell export route', () => {
  it('stays compatible with static export builds', () => {
    expect(nextConfig.output).toBe('export');
    expect('dynamicParams' in spaShellRoute).toBe(false);
    expect(spaShellRoute.generateStaticParams()).toEqual([{ slug: [] }]);
  });

  it('proxies local prompt-template media assets to the daemon in dev', async () => {
    try {
      vi.resetModules();
      vi.stubEnv('NODE_ENV', 'development');
      vi.stubEnv('AGDS_PORT', '8123');

      const { default: devNextConfig } = await import('../../next.config');
      expect(devNextConfig.rewrites).toEqual(expect.any(Function));

      const rewrites = await (
        devNextConfig.rewrites as () => Promise<Array<{ source: string; destination: string }>>
      )();

      expect(rewrites).toContainEqual({
        source: '/assets/prompt-templates/:path*',
        destination: 'http://127.0.0.1:8123/assets/prompt-templates/:path*',
      });
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });

  it('ignores deprecated OD runtime envs in Next config resolution', async () => {
    try {
      vi.resetModules();
      vi.stubEnv('NODE_ENV', 'development');
      vi.stubEnv('OD_PORT', '8999');
      vi.stubEnv('OD_WEB_OUTPUT_MODE', 'standalone');
      vi.stubEnv('OD_WEB_DIST_DIR', 'legacy-dist');
      vi.stubEnv('OD_WEB_TSCONFIG_PATH', 'legacy-tsconfig.json');
      vi.stubEnv('OD_WEB_PROD', '1');

      const { default: devNextConfig } = await import('../../next.config');
      const rewrites = await (
        devNextConfig.rewrites as () => Promise<Array<{ source: string; destination: string }>>
      )();

      expect(devNextConfig.output).toBeUndefined();
      expect(devNextConfig.distDir).toBe('.next');
      expect(devNextConfig.typescript).toBeUndefined();
      expect(rewrites).toContainEqual({
        source: '/api/:path*',
        destination: 'http://127.0.0.1:7456/api/:path*',
      });
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });

  it('proxies server-mode Vercel builds to an explicit daemon tunnel', async () => {
    try {
      vi.resetModules();
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('AGDS_WEB_OUTPUT_MODE', 'server');
      vi.stubEnv('AGDS_DAEMON_ORIGIN', 'https://agds-demo.trycloudflare.com/some/path');

      const { default: serverNextConfig } = await import('../../next.config');
      expect(serverNextConfig.output).toBeUndefined();
      expect(serverNextConfig.rewrites).toEqual(expect.any(Function));

      const rewrites = await (
        serverNextConfig.rewrites as () => Promise<Array<{ source: string; destination: string }>>
      )();

      expect(rewrites).toContainEqual({
        source: '/api/:path*',
        destination: 'https://agds-demo.trycloudflare.com/api/:path*',
      });
      expect(rewrites).toContainEqual({
        source: '/frames/:path*',
        destination: 'https://agds-demo.trycloudflare.com/frames/:path*',
      });
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });

  it('ignores unsafe production daemon origins instead of adding rewrites', async () => {
    try {
      vi.resetModules();
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('AGDS_WEB_OUTPUT_MODE', 'server');
      vi.stubEnv('AGDS_DAEMON_ORIGIN', 'http://192.168.1.50:7456');

      const { default: serverNextConfig } = await import('../../next.config');
      expect(serverNextConfig.rewrites).toBeUndefined();
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });
});
