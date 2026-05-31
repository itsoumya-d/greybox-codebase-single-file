// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import type http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { FileAuditLog } from '../src/enterprise/auditLog.js';
import { FileModelTrainingConsentStore } from '../src/enterprise/modelTrainingConsent.js';
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

test('model-training consent fails closed without durable storage', async () => {
  await withServer({}, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/model-training-consent`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer managed-token',
        'x-greybox-tenant': 'tenant-consent',
        'x-greybox-user': 'designer-1',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        projectId: 'project-1',
        status: 'opted-out',
      }),
    });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'model_training_consent_store_not_configured' });
  });
});

test('model-training opt-in requires a separate explicit checkbox and consent text', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-training-consent-rules-'));
  try {
    const modelTrainingConsentStore = new FileModelTrainingConsentStore(dir);
    await withServer({ modelTrainingConsentStore }, async (baseUrl) => {
      const missingCheckbox = await fetch(`${baseUrl}/v1/model-training-consent`, {
        method: 'POST',
        headers: {
          authorization: 'Bearer managed-token',
          'x-greybox-tenant': 'tenant-consent',
          'x-greybox-user': 'designer-1',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          projectId: 'project-1',
          status: 'opted-in',
          consentText: 'I agree to Greybox Native model training.',
        }),
      });
      assert.equal(missingCheckbox.status, 400);
      assert.deepEqual(await missingCheckbox.json(), { error: 'separate_checkbox_required' });

      const missingText = await fetch(`${baseUrl}/v1/model-training-consent`, {
        method: 'POST',
        headers: {
          authorization: 'Bearer managed-token',
          'x-greybox-tenant': 'tenant-consent',
          'x-greybox-user': 'designer-1',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          projectId: 'project-1',
          status: 'opted-in',
          separateCheckboxAccepted: true,
          consentText: 'I agree to product analytics.',
        }),
      });
      assert.equal(missingText.status, 400);
      assert.deepEqual(await missingText.json(), { error: 'explicit_model_training_consent_text_required' });
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('model-training consent records latest state and sanitized audit evidence', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-training-consent-'));
  try {
    const modelTrainingConsentStore = new FileModelTrainingConsentStore(path.join(dir, 'consents'));
    const auditLog = new FileAuditLog(path.join(dir, 'audit'));
    await withServer({ modelTrainingConsentStore, auditLog }, async (baseUrl) => {
      const headers = {
        authorization: 'Bearer managed-token',
        'x-greybox-tenant': 'tenant-consent',
        'x-greybox-user': 'designer-1',
        'x-greybox-tier': 'studio',
        'content-type': 'application/json',
      };
      const secretPhrase = 'SECRET_LEVEL_NAME_DO_NOT_LOG';
      const privateCategory = 'playtest reviewer qa@example.com at +1 (415) 555-0100';
      const create = await fetch(`${baseUrl}/v1/model-training-consent`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          projectId: 'project-1',
          artifactId: 'artifact-hero-hud',
          status: 'opted-in',
          source: 'settings-checkbox',
          separateCheckboxAccepted: true,
          consentText: `I explicitly allow Greybox Native model training on this project. ${secretPhrase}`,
          allowedUses: ['greybox-native-training', 'artifact-quality-finetuning'],
          dataCategories: ['rated artifact', privateCategory],
        }),
      });
      assert.equal(create.status, 201);
      const created = await create.json() as {
        status: string;
        consentTextHash: string;
        consentText?: string;
        allowedUses: string[];
        dataCategories: string[];
      };
      assert.equal(created.status, 'opted-in');
      assert.equal(created.consentText, undefined);
      assert.match(created.consentTextHash, /^[a-f0-9]{64}$/u);
      assert.deepEqual(created.allowedUses, ['greybox-native-training', 'artifact-quality-finetuning']);
      assert.ok(created.dataCategories.includes('playtest reviewer [REDACTED_EMAIL] at [REDACTED_PHONE]'));
      const rawConsentLedger = await readFile(path.join(dir, 'consents', 'model-training-consents.jsonl'), 'utf8');
      assert.doesNotMatch(rawConsentLedger, new RegExp(secretPhrase, 'u'));
      assert.doesNotMatch(rawConsentLedger, /qa@example\.com|\+1 \(415\) 555-0100/u);
      assert.match(rawConsentLedger, /\[REDACTED_EMAIL\].*\[REDACTED_PHONE\]/u);

      const get = await fetch(`${baseUrl}/v1/model-training-consent?projectId=project-1&artifactId=artifact-hero-hud`, {
        headers,
      });
      assert.equal(get.status, 200);
      const latest = await get.json() as { consent: { id: string; status: string }; defaultStatus: string };
      assert.equal(latest.consent.status, 'opted-in');
      assert.equal(latest.defaultStatus, 'opted-out');

      const revoke = await fetch(`${baseUrl}/v1/model-training-consent`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          projectId: 'project-1',
          artifactId: 'artifact-hero-hud',
          status: 'revoked',
          source: 'settings-checkbox',
        }),
      });
      assert.equal(revoke.status, 201);

      const afterRevoke = await fetch(`${baseUrl}/v1/model-training-consent?projectId=project-1&artifactId=artifact-hero-hud`, {
        headers,
      });
      const revoked = await afterRevoke.json() as { consent: { status: string; allowedUses: string[] } };
      assert.equal(revoked.consent.status, 'revoked');
      assert.deepEqual(revoked.consent.allowedUses, []);

      const auditEntries = await auditLog.readEntries({ action: 'model_training.consent_recorded' });
      assert.equal(auditEntries.length, 2);
      assert.equal(auditEntries[0]?.tenantId, 'tenant-consent');
      assert.equal(auditEntries[0]?.projectId, 'project-1');
      assert.equal(auditEntries[0]?.metadata?.consentTextHash, created.consentTextHash);
      assert.doesNotMatch(JSON.stringify(auditEntries), new RegExp(secretPhrase, 'u'));
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
