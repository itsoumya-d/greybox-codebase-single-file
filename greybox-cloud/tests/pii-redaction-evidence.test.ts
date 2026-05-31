// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  buildPiiRedactionEvidenceReport,
  formatPiiRedactionEvidenceMarkdown,
  piiRedactionEvidenceFromEnv,
} from '../src/enterprise/piiRedactionEvidence.js';
import {
  buildPiiRedactionEvidenceDotenv,
  buildPiiRedactionEvidenceGithubEnv,
  buildPiiRedactionEvidenceSourceArtifacts,
} from '../src/enterprise/piiRedactionEvidenceSource.js';
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

const hashA = 'a'.repeat(64);
const hashB = 'b'.repeat(64);
const hashC = 'c'.repeat(64);
const hashD = 'd'.repeat(64);

function readyEnv(): Record<string, string> {
  return {
    GREYBOX_PII_REDACTION_EVIDENCE_JSON: JSON.stringify({
      artifacts: [
        { id: 'redaction-100-case-suite', status: 'pass', sourceHash: hashA, generatedAt: '2026-05-22T00:00:00.000Z' },
        { id: 'provider-boundary-redaction', status: 'pass', sourceHash: hashB, generatedAt: '2026-05-22T00:00:00.000Z' },
        { id: 'audit-classification-tags', status: 'pass', sourceHash: hashC, generatedAt: '2026-05-22T00:00:00.000Z' },
        { id: 'public-error-sanitization', status: 'pass', sourceHash: hashD, generatedAt: '2026-05-22T00:00:00.000Z' },
        { id: 'unexpected', status: 'pass', sourceHash: 'secret' },
      ],
    }),
  };
}

test('PII redaction evidence fails closed without sanitized source hashes', () => {
  const report = buildPiiRedactionEvidenceReport({ env: {}, now: new Date('2026-05-22T00:00:00.000Z') });

  assert.equal(report.summary.status, 'fail');
  assert.equal(report.summary.passingArtifacts, 0);
  assert.equal(report.summary.missingArtifacts.length, 4);
  assert.equal(report.controls.every((control) => control.status === 'fail'), true);
});

test('PII redaction evidence passes with all required customer-safe artifacts', () => {
  const report = buildPiiRedactionEvidenceReport({
    env: readyEnv(),
    now: new Date('2026-05-22T00:00:00.000Z'),
  });

  assert.equal(report.summary.status, 'pass');
  assert.equal(report.summary.passingArtifacts, 4);
  assert.deepEqual(report.summary.missingArtifacts, []);
  assert.equal(report.controls.every((control) => control.status === 'pass'), true);
  assert.equal(JSON.stringify(report).includes('lead@example.com'), false);
  assert.equal(JSON.stringify(report).includes('unexpected'), false);
});

test('PII redaction evidence parser ignores malformed hashes and raw fields', () => {
  const artifacts = piiRedactionEvidenceFromEnv({
    GREYBOX_PII_REDACTION_EVIDENCE_JSON: JSON.stringify({
      artifacts: [
        { id: 'provider-boundary-redaction', status: 'pass', sourceHash: 'not-a-hash', generatedAt: 'soon', secret: 'do-not-return' },
        { id: 'public-error-sanitization', status: 'pass', sourceHash: hashD, generatedAt: '2026-05-22T00:00:00.000Z', rawPrompt: 'lead@example.com' },
      ],
    }),
  }, {
    now: new Date('2026-05-22T00:00:00.000Z'),
  });

  assert.equal(artifacts.find((artifact) => artifact.id === 'provider-boundary-redaction')?.status, 'missing');
  assert.equal(artifacts.find((artifact) => artifact.id === 'public-error-sanitization')?.status, 'missing');
  assert.equal(JSON.stringify(artifacts).includes('do-not-return'), false);
  assert.equal(JSON.stringify(artifacts).includes('lead@example.com'), false);
});

test('PII redaction evidence parser rejects missing, stale, and future timestamps', () => {
  const artifacts = piiRedactionEvidenceFromEnv({
    GREYBOX_PII_REDACTION_EVIDENCE_JSON: JSON.stringify({
      artifacts: [
        { id: 'redaction-100-case-suite', status: 'pass', sourceHash: hashA },
        { id: 'provider-boundary-redaction', status: 'pass', sourceHash: hashB, generatedAt: '2026-03-01T00:00:00.000Z' },
        { id: 'audit-classification-tags', status: 'pass', sourceHash: hashC, generatedAt: '2026-05-23T00:00:00.000Z' },
        { id: 'public-error-sanitization', status: 'pass', sourceHash: hashD, generatedAt: '2026-05-22T00:00:00.000Z' },
      ],
    }),
  }, {
    now: new Date('2026-05-22T00:00:00.000Z'),
  });

  assert.equal(artifacts.find((artifact) => artifact.id === 'redaction-100-case-suite')?.status, 'missing');
  assert.equal(artifacts.find((artifact) => artifact.id === 'provider-boundary-redaction')?.status, 'missing');
  assert.equal(artifacts.find((artifact) => artifact.id === 'audit-classification-tags')?.status, 'missing');
  assert.equal(artifacts.find((artifact) => artifact.id === 'public-error-sanitization')?.status, 'pass');
});

test('PII redaction evidence parser accepts mounted secret files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'greybox-pii-evidence-'));
  const evidencePath = join(dir, 'pii-redaction-evidence.env');
  writeFileSync(evidencePath, `GREYBOX_PII_REDACTION_EVIDENCE_JSON='${readyEnv().GREYBOX_PII_REDACTION_EVIDENCE_JSON}'\n`);
  try {
    const artifacts = piiRedactionEvidenceFromEnv({
      GREYBOX_PII_REDACTION_EVIDENCE_FILE: evidencePath,
    });

    assert.equal(artifacts.length, 4);
    assert.equal(artifacts.every((artifact) => artifact.status === 'pass'), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('PII redaction evidence parser accepts GitHub Actions multiline env files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'greybox-pii-github-env-'));
  const evidencePath = join(dir, 'github-env');
  const payload = JSON.stringify(JSON.parse(readyEnv().GREYBOX_PII_REDACTION_EVIDENCE_JSON), null, 2);
  writeFileSync(evidencePath, [
    'GREYBOX_PII_REDACTION_EVIDENCE_JSON<<GREYBOX_PII_REDACTION_EVIDENCE',
    payload,
    'GREYBOX_PII_REDACTION_EVIDENCE',
    '',
  ].join('\n'));
  try {
    const artifacts = piiRedactionEvidenceFromEnv({
      GREYBOX_PII_REDACTION_EVIDENCE_FILE: evidencePath,
    }, {
      now: new Date('2026-05-22T00:00:00.000Z'),
    });

    assert.equal(artifacts.length, 4);
    assert.equal(artifacts.every((artifact) => artifact.status === 'pass'), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('PII redaction evidence markdown is concise and safe', () => {
  const report = buildPiiRedactionEvidenceReport({ env: readyEnv(), now: new Date('2026-05-22T00:00:00.000Z') });
  const markdown = formatPiiRedactionEvidenceMarkdown(report);

  assert.match(markdown, /Status: pass/u);
  assert.match(markdown, /provider-boundary-redaction/u);
  assert.doesNotMatch(markdown, /lead@example.com|secret/u);
});

test('PII redaction evidence source generator produces endpoint-ready hashes', () => {
  const artifacts = buildPiiRedactionEvidenceSourceArtifacts(process.cwd(), new Date('2026-05-22T00:00:00.000Z'));
  const report = buildPiiRedactionEvidenceReport({
    env: { GREYBOX_PII_REDACTION_EVIDENCE_JSON: JSON.stringify({ artifacts }) },
  });

  assert.equal(artifacts.length, 4);
  assert.equal(artifacts.every((artifact) => /^[a-f0-9]{64}$/u.test(artifact.sourceHash ?? '')), true);
  assert.equal(report.summary.status, 'pass');
});

test('PII redaction evidence source generator emits deployment-friendly env formats', () => {
  const now = new Date('2026-05-22T00:00:00.000Z');
  const dotenv = buildPiiRedactionEvidenceDotenv(process.cwd(), now);
  const githubEnv = buildPiiRedactionEvidenceGithubEnv(process.cwd(), now);

  assert.match(dotenv, /^GREYBOX_PII_REDACTION_EVIDENCE_JSON='\{"artifacts":\[/u);
  assert.doesNotMatch(dotenv, /\n\{/u);
  assert.match(githubEnv, /^GREYBOX_PII_REDACTION_EVIDENCE_JSON<<GREYBOX_PII_REDACTION_EVIDENCE\n/u);
  assert.match(githubEnv, /\nGREYBOX_PII_REDACTION_EVIDENCE\n$/u);
});

test('PII redaction evidence endpoint is admin protected and supports markdown', async () => {
  await withServer({
    auditAdminToken: 'pii-admin-0123456789abcdef',
    piiRedactionEvidenceEnv: readyEnv(),
  }, async (baseUrl) => {
    const denied = await fetch(`${baseUrl}/v1/enterprise/pii-redaction-evidence`);
    assert.equal(denied.status, 401);

    const response = await fetch(`${baseUrl}/v1/enterprise/pii-redaction-evidence`, {
      headers: { authorization: 'Bearer pii-admin-0123456789abcdef' },
    });
    assert.equal(response.status, 200);
    const report = await response.json() as { summary: { status: string } };
    assert.equal(report.summary.status, 'pass');

    const markdown = await fetch(`${baseUrl}/v1/enterprise/pii-redaction-evidence?format=markdown`, {
      headers: { authorization: 'Bearer pii-admin-0123456789abcdef' },
    });
    assert.equal(markdown.status, 200);
    assert.match(await markdown.text(), /Greybox PII Redaction Evidence/u);
  });
});
