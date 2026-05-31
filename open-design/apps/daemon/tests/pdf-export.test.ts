import { mkdtempSync, rmSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildDesktopPdfExportInput } from '../src/pdf-export.js';
import { startServer } from '../src/server.js';

describe('buildDesktopPdfExportInput', () => {
  let projectsRoot = '';
  const projectId = 'proj-pdf-test';

  beforeEach(async () => {
    projectsRoot = mkdtempSync(path.join(tmpdir(), 'agds-pdf-export-'));
    await mkdir(path.join(projectsRoot, projectId, 'deck', 'assets'), { recursive: true });
    await writeFile(
      path.join(projectsRoot, projectId, 'deck', 'index.html'),
      '<!doctype html><section class="slide">One</section>',
    );
  });

  afterEach(() => {
    if (projectsRoot) rmSync(projectsRoot, { recursive: true, force: true });
  });

  it('reads the project file and derives a raw-route baseHref from the file directory', async () => {
    const input = await buildDesktopPdfExportInput({
      daemonUrl: 'http://127.0.0.1:7456',
      deck: true,
      fileName: 'deck/index.html',
      projectId,
      projectsRoot,
      title: 'Seed Deck',
    });

    expect(input).toEqual({
      baseHref: 'http://127.0.0.1:7456/api/projects/proj-pdf-test/raw/deck/',
      deck: true,
      defaultFilename: 'Seed-Deck.pdf',
      html: '<!doctype html><section class="slide">One</section>',
      title: 'Seed Deck',
    });
  });

  it('falls back to the file basename when the caller omits a title', async () => {
    const input = await buildDesktopPdfExportInput({
      daemonUrl: 'http://127.0.0.1:7456',
      deck: false,
      fileName: 'deck/index.html',
      projectId,
      projectsRoot,
    });

    expect(input.title).toBe('index');
    expect(input.defaultFilename).toBe('index.pdf');
  });
});

describe('POST /api/projects/:id/export/pdf', () => {
  it('forwards the project HTML file to the configured desktop PDF exporter', async () => {
    const projectId = `proj-pdf-route-${Date.now()}`;
    const html = '<!doctype html><section class="slide dark" data-screen-label="01 Seed GDD"><h1>Seed Game Design Document</h1><p>Player objective, level flow, combat HUD, and economy tuning with readable HUD scaling, colorblind-safe feedback, production scope, and vertical-slice QA notes.</p></section>';
    const calls: unknown[] = [];
    const started = await startServer({
      port: 0,
      returnServer: true,
      desktopPdfExporter: async (input: unknown) => {
        calls.push(input);
        return { ok: true, path: '/tmp/seed.pdf' };
      },
    }) as { server: { close(cb: () => void): void }; url: string };

    try {
      const projectResponse = await fetch(`${started.url}/api/projects`, {
        body: JSON.stringify({ id: projectId, name: 'Seed PDF export game' }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      expect(projectResponse.status).toBe(200);

      const fileResponse = await fetch(`${started.url}/api/projects/${encodeURIComponent(projectId)}/files`, {
        body: JSON.stringify({
          content: html,
          name: 'deck/index.html',
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      expect(fileResponse.status).toBe(200);

      const response = await fetch(`${started.url}/api/projects/${encodeURIComponent(projectId)}/export/pdf`, {
        body: JSON.stringify({ deck: true, fileName: 'deck/index.html', title: 'Seed Deck' }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true, path: '/tmp/seed.pdf' });
      expect(calls).toEqual([
        {
          baseHref: `${started.url}/api/projects/${encodeURIComponent(projectId)}/raw/deck/`,
          deck: true,
          defaultFilename: 'Seed-Deck.pdf',
          html,
          title: 'Seed Deck',
        },
      ]);
    } finally {
      await new Promise<void>((resolve) => started.server.close(resolve));
    }
  });
});
