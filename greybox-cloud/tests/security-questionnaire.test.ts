// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import type http from 'node:http';
import test from 'node:test';
import {
  buildSecurityQuestionnaireReport,
  exportSecurityQuestionnaireCsv,
} from '../src/enterprise/securityQuestionnaire.js';
import type { EnterpriseContractPacket } from '../src/enterprise/contractPacket.js';
import type { BillingLedger } from '../src/metering/billingLedger.js';
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

function blockedContractPacket(): EnterpriseContractPacket {
  return {
    generatedAt: '2026-05-17T00:00:00.000Z',
    disclaimer: 'Injected blocked contract packet.',
    summary: {
      documents: 3,
      readyToSign: 1,
      supportingEvidence: 0,
      blocked: 2,
      blockingIssues: 2,
    },
    documents: [],
    orderFormFields: [],
    signingSequence: [],
  };
}

function reservationCapableBillingLedger(): BillingLedger {
  return {
    async appendRecord() {},
    async appendUsage() {},
    async appendInvoice() {},
    async appendStripeMeterEvent() {},
    async readRecords() {
      return [];
    },
    async readUsageEvents() {
      return [];
    },
    async reserveMonthlyUsage(request) {
      return request.event;
    },
  };
}

test('security questionnaire generates honest customer answers from trust evidence', async () => {
  const report = await buildSecurityQuestionnaireReport({
    now: new Date('2026-05-17T00:00:00.000Z'),
  });

  assert.equal(report.generatedAt, '2026-05-17T00:00:00.000Z');
  assert.match(report.disclaimer, /not legal advice/u);
  assert.ok(report.summary.answers >= 16);
  assert.ok(report.summary.needsReview > 0);
  assert.equal(report.answers.find((answer) => answer.id === 'certifications-current-status')?.status, 'needs-review');
  assert.equal(report.answers.find((answer) => answer.id === 'contracting-documents')?.status, 'ready');
  assert.match(report.answers.find((answer) => answer.id === 'contracting-documents')?.answer ?? '', /ready-to-sign templates/u);
  assert.match(report.answers.find((answer) => answer.id === 'model-training')?.answer ?? '', /No\./u);
  assert.match(report.answers.find((answer) => answer.id === 'encryption-production')?.answer ?? '', /Not yet/u);
  assert.match(report.answers.find((answer) => answer.id === 'billing-reconciliation')?.answer ?? '', /Postgres-backed monthly reservation evidence is incomplete/u);
  assert.doesNotMatch(JSON.stringify(report), /API_KEY|SECRET|TOKEN|anthropic-configured/u);
});

test('security questionnaire reports configured monthly reservation controls without certification claims', async () => {
  const report = await buildSecurityQuestionnaireReport({
    billingLedger: reservationCapableBillingLedger(),
    billingLedgerPersistence: 'postgres',
    now: new Date('2026-05-17T00:00:00.000Z'),
  });
  const billing = report.answers.find((answer) => answer.id === 'billing-reconciliation');

  assert.equal(billing?.status, 'ready');
  assert.match(billing?.answer ?? '', /Postgres-backed monthly reservation controls configured/u);
  assert.match(billing?.answer ?? '', /included-token classification/u);
  assert.doesNotMatch(billing?.answer ?? '', /SOC 2|ISO 27001|certified/u);
  assert.ok(billing?.evidence.includes('src/metering/billingLedgerPostgres.ts'));
});

test('security questionnaire CSV export is stable and escaped', async () => {
  const report = await buildSecurityQuestionnaireReport({
    now: new Date('2026-05-17T00:00:00.000Z'),
  });
  const csv = exportSecurityQuestionnaireCsv(report);

  assert.match(csv, /^id,category,status,owner,question,answer,evidence\n/u);
  assert.match(csv, /"model-training","ai"/u);

  const escapedCsv = exportSecurityQuestionnaireCsv({
    ...report,
    answers: [{
      ...report.answers[0],
      question: 'Can a "quoted" field export?',
      answer: 'Yes, quotes are "escaped" for spreadsheet upload.',
    }],
  });
  assert.match(escapedCsv, /"Can a ""quoted"" field export\?"/u);
  assert.match(escapedCsv, /"Yes, quotes are ""escaped"" for spreadsheet upload\."/u);
});

test('security questionnaire endpoint is admin protected and supports csv', async () => {
  await withServer({
    auditAdminToken: 'questionnaire-admin-0123456789abcdef',
    enterpriseContractPacket: blockedContractPacket(),
  }, async (baseUrl) => {
    const denied = await fetch(`${baseUrl}/v1/enterprise/security-questionnaire`);
    assert.equal(denied.status, 401);
    assert.deepEqual(await denied.json(), { error: 'audit_admin_required' });

    const jsonResponse = await fetch(`${baseUrl}/v1/enterprise/security-questionnaire`, {
      headers: { authorization: 'Bearer questionnaire-admin-0123456789abcdef' },
    });
    assert.equal(jsonResponse.status, 200);
    const report = await jsonResponse.json() as {
      summary: { answers: number };
      answers: Array<{ id: string; status: string }>;
    };
    assert.ok(report.summary.answers >= 16);
    assert.ok(report.answers.some((answer) => answer.id === 'private-networking'));
    assert.equal(report.answers.find((answer) => answer.id === 'contracting-documents')?.status, 'blocked');

    const csvResponse = await fetch(`${baseUrl}/v1/enterprise/security-questionnaire?format=csv`, {
      headers: { authorization: 'Bearer questionnaire-admin-0123456789abcdef' },
    });
    assert.equal(csvResponse.status, 200);
    assert.match(csvResponse.headers.get('content-type') ?? '', /text\/csv/u);
    assert.match(await csvResponse.text(), /certifications-current-status/u);
  });
});
