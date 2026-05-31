import type http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer } from '../src/server.js';

describe('/healthz and /readyz probes', () => {
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

  it('/healthz returns 200 with status=live (liveness probe)', async () => {
    const res = await fetch(`${baseUrl}/healthz`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok?: unknown; status?: unknown };
    expect(body.ok).toBe(true);
    expect(body.status).toBe('live');
  });

  it('/readyz returns 200 with status=ready and a passing sqlite check', async () => {
    const res = await fetch(`${baseUrl}/readyz`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok?: unknown; status?: unknown; checks?: Record<string, unknown> };
    expect(body.ok).toBe(true);
    expect(body.status).toBe('ready');
    expect(body.checks).toMatchObject({ sqlite: 'ok' });
  });
});
