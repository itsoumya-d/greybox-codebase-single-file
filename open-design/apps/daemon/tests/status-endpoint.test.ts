import type http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer } from '../src/server.js';

describe('GET /api/status', () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    const started = (await startServer({ port: 0, returnServer: true })) as {
      url: string;
      server: http.Server;
    };
    baseUrl = started.url;
    server = started.server;
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it('returns 200 with status ok or degraded', async () => {
    const res = await fetch(`${baseUrl}/api/status`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status?: unknown };
    expect(['ok', 'degraded']).toContain(body.status);
  });

  it('response shape has version, uptime, and components.sqlite', async () => {
    const res = await fetch(`${baseUrl}/api/status`);
    const body = (await res.json()) as {
      status?: unknown;
      version?: unknown;
      uptime?: unknown;
      components?: { sqlite?: { status?: unknown }; billing_cloud?: { status?: unknown } };
    };
    expect(typeof body.version).toBe('string');
    expect(typeof body.uptime).toBe('number');
    expect(body.components?.sqlite?.status).toBeDefined();
  });

  it('sets Cache-Control: no-store', async () => {
    const res = await fetch(`${baseUrl}/api/status`);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('sqlite component is ok in a healthy test environment', async () => {
    const res = await fetch(`${baseUrl}/api/status`);
    const body = (await res.json()) as {
      status?: unknown;
      components?: { sqlite?: { status?: unknown } };
    };
    expect(body.components?.sqlite?.status).toBe('ok');
    expect(body.status).toBe('ok');
  });
});
