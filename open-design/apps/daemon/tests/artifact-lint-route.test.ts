import type http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

describe('artifact lint route', () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    const started = await startServer({ port: 0, returnServer: true }) as {
      url: string;
      server: http.Server;
    };
    baseUrl = started.url;
    server = started.server;
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it('accepts markdown/spec text so non-HTML game documents share studio quality lint', async () => {
    const response = await fetch(`${baseUrl}/api/artifacts/lint`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text: `# SaaS pricing page

Create pricing tiers, a CRM dashboard, a signup CTA, and a customer journey funnel.`,
      }),
    });

    expect(response.status).toBe(200);
    const body = await response.json() as {
      findings?: Array<{ id?: string; severity?: string }>;
      agentMessage?: string | null;
    };
    expect(body.findings?.some((finding) => finding.id === 'static-non-game-deliverable')).toBe(true);
    expect(body.agentMessage).toContain('static-non-game-deliverable');
  });

  it('rejects empty lint payloads with the broadened input contract', async () => {
    const response = await fetch(`${baseUrl}/api/artifacts/lint`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(400);
    const body = await response.json() as { error?: string };
    expect(body.error).toBe('html, text, or content required');
  });

  it('blocks P0 legacy artifacts on save before writing a public URL', async () => {
    const response = await fetch(`${baseUrl}/api/artifacts/save`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        identifier: 'legacy-saas',
        html: '<main><h1>SaaS pricing page</h1><p>Login, checkout, CRM dashboard widgets, testimonials, and a marketing-site landing page.</p></main>',
      }),
    });

    expect(response.status).toBe(400);
    const body = await response.json() as {
      error?: string;
      path?: string;
      url?: string;
      lint?: Array<{ id?: string; severity?: string }>;
    };
    expect(body.error).toBe('artifact failed game-studio lint');
    expect(body.path).toBeUndefined();
    expect(body.url).toBeUndefined();
    expect(body.lint?.some((finding) => finding.severity === 'P0')).toBe(true);
  });

  it('saves game-native artifacts and returns non-blocking lint findings', async () => {
    const response = await fetch(`${baseUrl}/api/artifacts/save`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        identifier: 'boss-arena-control-center',
        html: [
          '<main>',
          '<h1>Game Control Center</h1>',
          '<p>Player objective: defend the boss arena, track HUD health, stamina, quest progress, victory, restart, accessibility, and production scope.</p>',
          '</main>',
        ].join(''),
      }),
    });

    expect(response.status).toBe(200);
    const body = await response.json() as {
      path?: string;
      url?: string;
      lint?: Array<{ id?: string; severity?: string }>;
    };
    expect(body.path).toContain('index.html');
    expect(body.url).toContain('/artifacts/');
    expect(body.lint?.some((finding) => finding.severity === 'P0')).toBe(false);
  });
});
