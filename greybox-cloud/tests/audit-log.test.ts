// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  exportAuditCsv,
  exportAuditSplunkJson,
  FileAuditLog,
  auditSealOptionsFromEnv,
  hashAuditEntry,
  type AuditLogEntry,
  verifyAuditChain,
} from '../src/enterprise/auditLog.js';

function entry(overrides: Partial<AuditLogEntry> = {}): AuditLogEntry {
  const record: AuditLogEntry = {
    id: overrides.id ?? 'audit_1',
    tenantId: overrides.tenantId ?? 'tenant-a',
    actorId: overrides.actorId ?? 'admin-a',
    actorType: overrides.actorType ?? 'admin',
    action: overrides.action ?? 'billing.invoice_job_run',
    targetType: overrides.targetType ?? 'billing-period',
    targetId: overrides.targetId ?? 'tenant-a:2026-05',
    createdAt: overrides.createdAt ?? '2026-05-15T12:00:00.000Z',
    ip: overrides.ip ?? '203.0.113.7',
    userAgent: overrides.userAgent ?? 'Okta SCIM Client',
    metadata: overrides.metadata ?? { totalUsd: 38, note: 'needs "escaping"' },
  };
  if (overrides.projectId) record.projectId = overrides.projectId;
  return record;
}

test('file audit log appends and filters entries', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-audit-log-'));
  try {
    const auditLog = new FileAuditLog(dir);
    await auditLog.append(entry({ id: 'audit-a', tenantId: 'tenant-a' }));
    await auditLog.append(entry({ id: 'audit-b', tenantId: 'tenant-b', action: 'scim.user_created' }));

    const tenantEntries = await auditLog.readEntries({ tenantId: 'tenant-a' });
    assert.deepEqual(tenantEntries.map((record) => record.id), ['audit-a']);
    const scimEntries = await auditLog.readEntries({ action: 'scim.user_created' });
    assert.deepEqual(scimEntries.map((record) => record.id), ['audit-b']);

    const verification = await auditLog.verify({ tenantId: 'tenant-a' });
    assert.equal(verification.valid, true);
    assert.equal(verification.checked, 2);
    assert.equal(verification.matching, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('file audit log seals appended entries with a tamper-evident hash chain', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-audit-chain-'));
  try {
    const auditLog = new FileAuditLog(dir);
    await auditLog.append(entry({ id: 'audit-a', createdAt: '2026-05-15T12:00:00.000Z' }));
    await auditLog.append(entry({ id: 'audit-b', createdAt: '2026-05-15T12:01:00.000Z' }));

    const entries = await auditLog.readEntries();
    assert.equal(entries[0]?.schemaVersion, 1);
    assert.equal(entries[0]?.sequence, 1);
    assert.equal(entries[0]?.previousHash, null);
    assert.match(entries[0]?.hash ?? '', /^[a-f0-9]{64}$/u);
    assert.equal(entries[1]?.sequence, 2);
    assert.equal(entries[1]?.previousHash, entries[0]?.hash);
    assert.deepEqual(verifyAuditChain(entries), { valid: true, checked: 2 });

    const tampered = structuredClone(entries);
    tampered[1] = { ...tampered[1]!, actorId: 'attacker' };
    const verification = verifyAuditChain(tampered);
    assert.equal(verification.valid, false);
    assert.equal(verification.reason, 'hash_mismatch');
    assert.equal(verification.brokenAt, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('file audit log redacts sensitive entry fields before hashing and export', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-audit-redaction-'));
  try {
    const auditLog = new FileAuditLog(dir);
    await auditLog.append(entry({
      id: 'audit-redaction',
      actorId: 'designer@example.com',
      targetId: 'pi_test_sensitive_123',
      ip: '10.0.0.42',
      userAgent: 'Greybox CLI Bearer auditsecret0123456789abcdef from /Users/kai/Secret/Game',
      metadata: {
        stripeAccount: 'acct_sensitive_123',
        providerKey: 'sk_live_cloud_secret',
        licenseHash: 'abc123rawlicense',
        buyerEmail: 'buyer@example.com',
        card: '4242 4242 4242 4242',
        nested: {
          path: '/private/tmp/greybox/raw.log',
          phone: '+1 (555) 123-4567',
        },
      },
    }));

    const [stored] = await auditLog.readEntries({ action: 'billing.invoice_job_run' });
    assert.ok(stored);
    const serialized = JSON.stringify(stored);
    assert.match(serialized, /\[redacted-email\]/u);
    assert.match(serialized, /\[redacted-ip\]/u);
    assert.match(serialized, /\[redacted-secret\]/u);
    assert.match(serialized, /\[redacted-card\]/u);
    assert.match(serialized, /\[redacted-path\]/u);
    assert.match(serialized, /\[redacted-phone\]/u);
    assert.match(serialized, /\[redacted-reference\]/u);
    assert.equal(stored.targetId, 'pi_test_sensitive_123');
    assert.equal(stored.metadata?.stripeAccount, 'acct_sensitive_123');
    assert.doesNotMatch(serialized, /designer@example\.com|buyer@example\.com|10\.0\.0\.42|auditsecret0123456789abcdef|sk_live_cloud_secret|4242 4242|\/Users\/kai|\/private\/tmp|555/u);
    assert.deepEqual(await auditLog.verify(), { valid: true, checked: 1, matching: 1 });
    assert.doesNotMatch(exportAuditCsv([stored]), /designer@example\.com|sk_live_cloud_secret/u);
    assert.doesNotMatch(exportAuditSplunkJson([stored]), /buyer@example\.com|10\.0\.0\.42|\/private\/tmp/u);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('file audit log serializes concurrent appends into one valid chain', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-audit-concurrent-chain-'));
  try {
    const auditLog = new FileAuditLog(dir);
    await Promise.all(Array.from({ length: 25 }, async (_, index) => {
      await auditLog.append(entry({
        id: `audit-${index.toString().padStart(2, '0')}`,
        createdAt: `2026-05-15T12:${index.toString().padStart(2, '0')}:00.000Z`,
      }));
    }));

    const entries = await auditLog.readEntries();
    assert.equal(entries.length, 25);
    assert.deepEqual(entries.map((record) => record.sequence), Array.from({ length: 25 }, (_, index) => index + 1));
    assert.equal(entries[0]?.previousHash, null);
    for (let index = 1; index < entries.length; index += 1) {
      assert.equal(entries[index]?.previousHash, entries[index - 1]?.hash);
    }
    assert.deepEqual(await auditLog.verify(), { valid: true, checked: 25, matching: 25 });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('file audit log can HMAC-seal entries to detect recomputed hash tampering', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-audit-hmac-seal-'));
  const seal = { keyId: 'prod-2026-q2', secret: 'audit-seal-secret-0123456789abcdef' };
  try {
    const auditLog = new FileAuditLog(dir, 'audit-log.jsonl', { seal });
    await auditLog.append(entry({ id: 'audit-a' }));
    await auditLog.append(entry({ id: 'audit-b' }));

    const entries = await auditLog.readEntries();
    assert.equal(entries[0]?.sealAlgorithm, 'hmac-sha256');
    assert.equal(entries[0]?.sealKeyId, seal.keyId);
    assert.match(entries[0]?.sealSignature ?? '', /^[a-f0-9]{64}$/u);
    assert.deepEqual(await auditLog.verify(), {
      valid: true,
      checked: 2,
      matching: 2,
      sealChecked: 2,
      sealKeyId: seal.keyId,
    });

    const tampered = structuredClone(entries);
    tampered[1] = { ...tampered[1]!, actorId: 'attacker' };
    tampered[1]!.hash = hashAuditEntry(tampered[1]!);
    const verification = verifyAuditChain(tampered, seal);
    assert.equal(verification.valid, false);
    assert.equal(verification.reason, 'seal_signature_mismatch');
    assert.equal(verification.brokenAt, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('audit seal options parse only explicit key material from environment', () => {
  assert.equal(auditSealOptionsFromEnv({}), undefined);
  assert.equal(
    auditSealOptionsFromEnv({
      GREYBOX_AUDIT_SEAL_KEY: 'secret',
      GREYBOX_AUDIT_SEAL_KEY_ID: 'bad key id with spaces',
    }),
    undefined,
  );
  assert.deepEqual(
    auditSealOptionsFromEnv({
      GREYBOX_AUDIT_SEAL_KEY: 'audit-seal-secret-0123456789abcdef',
      GREYBOX_AUDIT_SEAL_KEY_ID: 'prod-2026-q2',
    }),
    { keyId: 'prod-2026-q2', secret: 'audit-seal-secret-0123456789abcdef' },
  );
});

test('audit log exports csv and Splunk-compatible ndjson', () => {
  const entries = [entry()];
  const csv = exportAuditCsv(entries);
  assert.match(csv, /^id,schemaVersion,sequence,createdAt,tenantId,actorType,actorId,action,targetType,targetId,projectId,ip,userAgent,metadataJson,previousHash,hash\n/u);
  assert.match(csv, /"billing\.invoice_job_run"/u);
  assert.match(csv, /""note"":""needs/u);
  assert.match(csv, /escaping/u);

  const ndjson = exportAuditSplunkJson(entries);
  const parsed = JSON.parse(ndjson.trim()) as { sourcetype: string; event: AuditLogEntry; time: number };
  assert.equal(parsed.sourcetype, 'greybox:audit');
  assert.equal(parsed.event.tenantId, 'tenant-a');
  assert.equal(parsed.time, 1778846400);
});

test('audit log supports enterprise inference completion actions', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-audit-inference-'));
  try {
    const auditLog = new FileAuditLog(dir);
    await auditLog.append(entry({
      id: 'audit-inference',
      action: 'inference.completed',
      targetType: 'project',
      targetId: 'project-1',
      projectId: 'project-1',
      metadata: {
        provider: 'openai',
        model: 'gpt-4.1-mini',
        inputTokens: 17,
        outputTokens: 9,
      },
    }));

    const entries = await auditLog.readEntries({ action: 'inference.completed' });
    assert.equal(entries.length, 1);
    assert.equal(entries[0]?.projectId, 'project-1');
    assert.equal((entries[0]?.metadata as { provider?: string } | undefined)?.provider, 'openai');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('audit log supports license and Pro module entitlement actions', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-audit-entitlements-'));
  try {
    const auditLog = new FileAuditLog(dir);
    await auditLog.append(entry({
      id: 'audit-license',
      action: 'license.validated',
      targetType: 'license',
      targetId: 'abc123def4567890',
      metadata: { tier: 'studio', roundTripSync: true },
    }));
    await auditLog.append(entry({
      id: 'audit-pro-secret',
      action: 'pro_module.secret_issued',
      targetType: 'pro-module',
      targetId: 'soulslike-combat-pack',
      metadata: {
        moduleId: 'soulslike-combat-pack',
        entitlementPath: 'license-tier',
      },
    }));

    const licenseEntries = await auditLog.readEntries({ action: 'license.validated' });
    assert.equal(licenseEntries.length, 1);
    assert.equal(licenseEntries[0]?.targetId, 'abc123def4567890');
    const proEntries = await auditLog.readEntries({ action: 'pro_module.secret_issued' });
    assert.equal(proEntries.length, 1);
    assert.equal(proEntries[0]?.targetType, 'pro-module');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
