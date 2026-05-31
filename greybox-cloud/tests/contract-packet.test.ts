// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type http from 'node:http';
import test from 'node:test';
import {
  buildEnterpriseContractPacket,
  formatEnterpriseContractPacketMarkdown,
} from '../src/enterprise/contractPacket.js';
import { createGreyboxCloudServer } from '../src/server.js';

async function withServer<T>(
  options: Parameters<typeof createGreyboxCloudServer>[0],
  run: (baseUrl: string, server: http.Server) => Promise<T>,
): Promise<T> {
  const server = createGreyboxCloudServer(options);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  try {
    return await run(`http://127.0.0.1:${address.port}`, server);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test('enterprise contract packet validates MSA and DPA templates for procurement', () => {
  const packet = buildEnterpriseContractPacket({
    now: new Date('2026-05-17T00:00:00.000Z'),
  });

  assert.equal(packet.generatedAt, '2026-05-17T00:00:00.000Z');
  assert.match(packet.disclaimer, /not legal advice/u);
  assert.equal(packet.summary.readyToSign, 3);
  assert.equal(packet.summary.blocked, 0);
  assert.ok(packet.orderFormFields.some((field) => field.includes('managed inference')));
  assert.ok(packet.signingSequence.some((step) => step.includes('archive hash')));

  const orderForm = packet.documents.find((document) => document.id === 'order-form');
  const msa = packet.documents.find((document) => document.id === 'msa');
  const dpa = packet.documents.find((document) => document.id === 'dpa');
  assert.equal(orderForm?.status, 'ready-to-sign');
  assert.equal(msa?.status, 'ready-to-sign');
  assert.equal(dpa?.status, 'ready-to-sign');
  assert.match(orderForm?.sha256 ?? '', /^[a-f0-9]{64}$/u);
  assert.match(msa?.sha256 ?? '', /^[a-f0-9]{64}$/u);
  assert.match(dpa?.sha256 ?? '', /^[a-f0-9]{64}$/u);
  assert.ok(orderForm?.clauseChecks.every((check) => check.status === 'pass'));
  assert.ok(msa?.clauseChecks.every((check) => check.status === 'pass'));
  assert.ok(dpa?.clauseChecks.every((check) => check.status === 'pass'));
  assert.doesNotMatch(JSON.stringify(packet), /API_KEY|SECRET|TOKEN/u);
});

test('enterprise contract packet markdown is stable and buyer-readable', () => {
  const markdown = formatEnterpriseContractPacketMarkdown(buildEnterpriseContractPacket({
    now: new Date('2026-05-17T00:00:00.000Z'),
  }));

  assert.match(markdown, /# Greybox Enterprise Contract Packet/u);
  assert.match(markdown, /Ready to sign templates: 3/u);
  assert.match(markdown, /Enterprise Order Form/u);
  assert.match(markdown, /Master Services Agreement/u);
  assert.match(markdown, /Data Processing Addendum/u);
  assert.match(markdown, /Order Form Fields/u);
});

test('enterprise contract packet blocks missing required clauses', async () => {
  const root = path.join(tmpdir(), `greybox-contract-packet-${Date.now()}`);
  await mkdir(path.join(root, 'legal'), { recursive: true });
  await writeFile(path.join(root, 'legal/MSA_TEMPLATE.md'), '# Incomplete MSA\n\nTODO\n');
  await writeFile(path.join(root, 'legal/DPA_TEMPLATE.md'), '# Incomplete DPA\n\n');

  const packet = buildEnterpriseContractPacket({
    root,
    now: new Date('2026-05-17T00:00:00.000Z'),
  });

  assert.equal(packet.summary.readyToSign, 0);
  assert.ok(packet.summary.blocked >= 2);
  assert.ok(packet.documents.find((document) => document.id === 'msa')?.blockingIssues.some((issue) => issue.includes('Services')));
  assert.ok(packet.documents.find((document) => document.id === 'msa')?.blockingIssues.some((issue) => issue.includes('TODO')));
});

test('enterprise contract endpoint is admin protected and supports markdown', async () => {
  await withServer({
    auditAdminToken: 'contract-admin-0123456789abcdef',
  }, async (baseUrl) => {
    const denied = await fetch(`${baseUrl}/v1/enterprise/contracts`);
    assert.equal(denied.status, 401);
    assert.deepEqual(await denied.json(), { error: 'audit_admin_required' });

    const jsonResponse = await fetch(`${baseUrl}/v1/enterprise/contracts`, {
      headers: { authorization: 'Bearer contract-admin-0123456789abcdef' },
    });
    assert.equal(jsonResponse.status, 200);
    const packet = await jsonResponse.json() as {
      summary: { readyToSign: number };
      documents: Array<{ id: string; status: string }>;
    };
    assert.equal(packet.summary.readyToSign, 3);
    assert.ok(packet.documents.some((document) => document.id === 'order-form' && document.status === 'ready-to-sign'));
    assert.ok(packet.documents.some((document) => document.id === 'dpa' && document.status === 'ready-to-sign'));

    const markdownResponse = await fetch(`${baseUrl}/v1/enterprise/contracts?format=markdown`, {
      headers: { authorization: 'Bearer contract-admin-0123456789abcdef' },
    });
    assert.equal(markdownResponse.status, 200);
    assert.match(markdownResponse.headers.get('content-type') ?? '', /text\/markdown/u);
    assert.match(await markdownResponse.text(), /Greybox Enterprise Contract Packet/u);
  });
});
