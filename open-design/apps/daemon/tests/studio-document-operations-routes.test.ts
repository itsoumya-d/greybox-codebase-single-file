import http from 'node:http';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

type StartedServer = { server: http.Server; url: string };
type ProjectEvent = { event: string; data: any };

let server: http.Server | undefined;
let baseUrl = '';
const projectIds: string[] = [];

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '../../..');
const templatesRoot = path.join(projectRoot, 'templates');
const serverRuntimeDataRoot = process.env.AGDS_DATA_DIR
  ? path.resolve(projectRoot, process.env.AGDS_DATA_DIR)
  : path.join(projectRoot, '.agds');

beforeEach(async () => {
  const started = (await startServer({ port: 0, returnServer: true })) as StartedServer;
  server = started.server;
  baseUrl = started.url;
});

afterEach(async () => {
  await new Promise((resolve, reject) => {
    if (!server) return resolve(undefined);
    server.close((error?: Error) => (error ? reject(error) : resolve(undefined)));
  });
  server = undefined;
  const ids = projectIds.splice(0);
  await Promise.all(
    ids.map((projectId) =>
      rm(path.join(serverRuntimeDataRoot, 'projects', projectId), { recursive: true, force: true }),
    ),
  );
});

function uniqueProjectId(): string {
  const id = `studio-document-ops-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  projectIds.push(id);
  return id;
}

async function createProject(projectId: string) {
  const response = await fetch(`${baseUrl}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: projectId, name: 'Studio document operation merge' }),
  });
  expect(response.status).toBe(200);
}

async function writeProjectText(projectId: string, fileName: string, content: string) {
  const dir = path.join(serverRuntimeDataRoot, 'projects', projectId);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, fileName), content, 'utf8');
}

async function openProjectEvents(projectId: string) {
  const response = await fetch(`${baseUrl}/api/projects/${encodeURIComponent(projectId)}/events`, {
    headers: { Accept: 'text/event-stream' },
  });
  if (!response.ok || !response.body) {
    throw new Error(`failed to open project event stream: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const events: ProjectEvent[] = [];
  const pump = (async () => {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary = buffer.indexOf('\n\n');
      while (boundary >= 0) {
        const raw = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf('\n\n');
        if (!raw.trim() || raw.startsWith(':')) continue;
        const event: ProjectEvent = { event: 'message', data: '' };
        for (const line of raw.split('\n')) {
          if (line.startsWith('event: ')) event.event = line.slice(7);
          if (line.startsWith('data: ')) event.data += line.slice(6);
        }
        event.data = event.data ? JSON.parse(event.data) : null;
        events.push(event);
      }
    }
  })();

  return {
    async waitFor(predicate: (event: ProjectEvent) => boolean) {
      const deadline = Date.now() + 3_000;
      while (Date.now() < deadline) {
        const match = events.find(predicate);
        if (match) return match;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      throw new Error(`timed out waiting for project event; seen=${JSON.stringify(events)}`);
    },
    async close() {
      await reader.cancel().catch(() => {});
      await pump.catch(() => {});
    },
  };
}

describe('studio document operation routes', () => {
  it('applies character-level text splice edits through the operation log', async () => {
    const projectId = uniqueProjectId();
    const fileName = 'gameplay-logic.nodegraph.json';
    const template = readFileSync(path.join(templatesRoot, fileName), 'utf8');
    await createProject(projectId);
    await writeProjectText(projectId, fileName, template);
    const nextTitle = 'Gameplay Logic Graph - Text CRDT Splice';
    const oldTitle = 'Gameplay Logic Graph';
    const index = template.indexOf(oldTitle);
    expect(index).toBeGreaterThanOrEqual(0);

    const response = await fetch(`${baseUrl}/api/projects/${projectId}/studio-document-operations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName,
        operations: [
          {
            id: 'op-text-title',
            actorId: 'systems-designer',
            type: 'text-splice',
            path: ['__source__'],
            value: {
              index,
              deleteCount: oldTitle.length,
              insertText: nextTitle,
            },
            lamport: 1,
          },
        ],
      }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    expect(body.revision).toBe(1);
    expect(body.appliedOperations).toEqual([
      expect.objectContaining({
        id: 'op-text-title',
        type: 'text-splice',
        path: '/__source__',
        status: 'applied',
      }),
    ]);
    expect(body.skippedOperations).toHaveLength(0);
    expect(JSON.parse(body.content).title).toBe(nextTitle);
  });

  it('streams invalid in-progress JSON source drafts without overwriting the canonical document', async () => {
    const projectId = uniqueProjectId();
    const fileName = 'gameplay-logic.nodegraph.json';
    const template = readFileSync(path.join(templatesRoot, fileName), 'utf8');
    await createProject(projectId);
    await writeProjectText(projectId, fileName, template);
    const stream = await openProjectEvents(projectId);
    const oldTitle = 'Gameplay Logic Graph';
    const index = template.indexOf(oldTitle);
    expect(index).toBeGreaterThanOrEqual(0);
    const invalidTitle = 'Gameplay Logic Graph - Invalid Draft';

    try {
      const response = await fetch(`${baseUrl}/api/projects/${projectId}/studio-document-draft-operations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName,
          operations: [
            {
              id: 'op-invalid-draft-title',
              actorId: 'level-designer',
              type: 'text-splice',
              path: ['__source__'],
              value: {
                index,
                deleteCount: oldTitle.length + 1,
                insertText: invalidTitle,
              },
              lamport: 1,
            },
          ],
        }),
      });

      expect(response.status).toBe(200);
      const body = (await response.json()) as any;
      expect(body.revision).toBe(1);
      expect(body.content).toContain(invalidTitle);
      expect(() => JSON.parse(body.content)).toThrow();
      expect(body.appliedOperations).toEqual([
        expect.objectContaining({
          id: 'op-invalid-draft-title',
          type: 'text-splice',
          path: '/__source__',
          status: 'applied',
        }),
      ]);

      const canonical = await readFile(path.join(serverRuntimeDataRoot, 'projects', projectId, fileName), 'utf8');
      expect(JSON.parse(canonical).title).toBe(oldTitle);

      const event = await stream.waitFor((candidate) => candidate.event === 'studio_document_draft_operations');
      expect(event.data).toMatchObject({
        type: 'studio_document_draft_operations',
        action: 'applied',
        projectId,
        fileName,
        revision: 1,
        content: body.content,
        appliedCount: 1,
        skippedCount: 0,
        actorIds: ['level-designer'],
      });
    } finally {
      await stream.close();
    }
  });

  it('merges concurrent JSON operations with an idempotent operation log and broadcasts the revision', async () => {
    const projectId = uniqueProjectId();
    const fileName = 'gameplay-logic.nodegraph.json';
    await createProject(projectId);
    await writeProjectText(projectId, fileName, readFileSync(path.join(templatesRoot, fileName), 'utf8'));
    const stream = await openProjectEvents(projectId);

    const response = await fetch(`${baseUrl}/api/projects/${projectId}/studio-document-operations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName,
        operations: [
          {
            id: 'op-set-title',
            actorId: 'game-director',
            type: 'json-set',
            path: ['title'],
            value: 'Gameplay Logic Graph - CRDT Merge',
            lamport: 3,
          },
          {
            id: 'op-append-node',
            actorId: 'systems-designer',
            type: 'json-array-append',
            path: ['nodes'],
            value: {
              id: 'crdt-economy-note',
              title: 'CRDT Economy Note',
              category: 'studio-collaboration',
              x: 1650,
              y: 520,
              description: 'Merged economy pacing note from a concurrent systems-design edit.',
            },
            lamport: 2,
          },
          {
            id: 'op-append-critique',
            actorId: 'narrative-designer',
            type: 'json-array-append',
            path: ['critiqueNotes'],
            value: 'Narrative branch review landed through CRDT-style operation merge.',
            lamport: 1,
          },
        ],
      }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    expect(body.fileName).toBe(fileName);
    expect(body.revision).toBe(3);
    expect(body.appliedOperations).toHaveLength(3);
    expect(body.skippedOperations).toHaveLength(0);
    const merged = JSON.parse(body.content);
    expect(merged.title).toBe('Gameplay Logic Graph - CRDT Merge');
    expect(merged.nodes.some((node: { id: string }) => node.id === 'crdt-economy-note')).toBe(true);
    expect(merged.critiqueNotes).toContain('Narrative branch review landed through CRDT-style operation merge.');

    const event = await stream.waitFor((candidate) => candidate.event === 'studio_document_operations');
    expect(event.data).toMatchObject({
      type: 'studio_document_operations',
      action: 'applied',
      projectId,
      fileName,
      revision: 3,
      appliedCount: 3,
      skippedCount: 0,
    });

    const duplicate = await fetch(`${baseUrl}/api/projects/${projectId}/studio-document-operations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName,
        operations: [
          {
            id: 'op-append-node',
            actorId: 'systems-designer',
            type: 'json-array-append',
            path: ['nodes'],
            value: {
              id: 'crdt-economy-note',
              title: 'CRDT Economy Note',
              category: 'studio-collaboration',
              x: 1650,
              y: 520,
            },
            lamport: 4,
          },
          {
            id: 'op-append-accessibility-note',
            actorId: 'accessibility-designer',
            type: 'json-array-append',
            path: ['critiqueNotes'],
            value: 'Accessibility pass: keep controller-readable prompts in the merged graph.',
            lamport: 5,
          },
        ],
      }),
    });

    expect(duplicate.status).toBe(200);
    const duplicateBody = (await duplicate.json()) as any;
    expect(duplicateBody.revision).toBe(4);
    expect(duplicateBody.appliedOperations.map((op: { id: string }) => op.id)).toEqual(['op-append-accessibility-note']);
    expect(duplicateBody.skippedOperations).toEqual([
      expect.objectContaining({ id: 'op-append-node', status: 'duplicate' }),
    ]);
    const afterDuplicate = JSON.parse(duplicateBody.content);
    expect(afterDuplicate.nodes.filter((node: { id: string }) => node.id === 'crdt-economy-note')).toHaveLength(1);
    expect(afterDuplicate.critiqueNotes).toContain('Accessibility pass: keep controller-readable prompts in the merged graph.');

    await stream.close();
  });
});
