// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import { createSign, generateKeyPairSync, type JsonWebKey } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import type http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { FileAuditLog } from '../src/enterprise/auditLog.js';
import { FileSecurityIncidentStore } from '../src/enterprise/incidents.js';
import { FileModelTrainingConsentStore } from '../src/enterprise/modelTrainingConsent.js';
import { FilePrivacyRequestStore } from '../src/enterprise/privacyRequests.js';
import { FileLegalHoldStore } from '../src/enterprise/retention.js';
import { ScimUserStore } from '../src/enterprise/scim.js';
import { buildTrustControlReport } from '../src/enterprise/trustControls.js';
import { FileBillingLedger, type BillingLedger } from '../src/metering/billingLedger.js';
import { TenantStore } from '../src/routers/tenants.js';
import { WorkOsJwtVerifier, type WorkOsClaims } from '../src/routers/workos-auth.js';
import { createGreyboxCloudServer } from '../src/server.js';

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = publicKey.export({ format: 'jwk' }) as JsonWebKey;
jwk.kid = 'trust-controls-test-key';
jwk.alg = 'RS256';
jwk.use = 'sig';

function b64url(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function signWorkOsJwt(claims: Partial<WorkOsClaims> = {}): string {
  const header = b64url({ alg: 'RS256', typ: 'JWT', kid: jwk.kid });
  const payload = b64url({
    iss: 'https://api.workos.test',
    aud: 'greybox-cloud',
    sub: 'trust-admin',
    org_id: 'org_trust',
    roles: ['admin'],
    permissions: ['audit:read'],
    exp: 1_893_456_000,
    ...claims,
  });
  const signature = createSign('RSA-SHA256')
    .update(`${header}.${payload}`)
    .end()
    .sign(privateKey)
    .toString('base64url');
  return `${header}.${payload}.${signature}`;
}

function verifier(): WorkOsJwtVerifier {
  return new WorkOsJwtVerifier({
    jwks: { keys: [jwk] },
    issuer: 'https://api.workos.test',
    audience: 'greybox-cloud',
    now: () => Date.parse('2026-05-17T00:00:00.000Z'),
  });
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

test('trust controls endpoint is admin protected', async () => {
  await withServer({ auditAdminToken: 'trust-admin-token-0123456789' }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/enterprise/trust-controls`);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: 'audit_admin_required' });
  });
});

test('trust controls do not mark memory SCIM stores as implemented', async () => {
  await withServer({
    auditAdminToken: 'trust-admin-token-0123456789',
    workosVerifier: verifier(),
    tenantStore: new TenantStore(),
    tenantStorePersistence: 'durable-injected',
    scimStore: new ScimUserStore(),
    scimStorePersistence: 'memory',
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/enterprise/trust-controls`, {
      headers: { authorization: 'Bearer trust-admin-token-0123456789' },
    });
    assert.equal(response.status, 200);
    const report = await response.json() as {
      controls: Array<{ id: string; status: string; evidence: Array<{ id: string; status: string; detail: string }> }>;
    };
    const identity = report.controls.find((control) => control.id === 'GBX-SEC-001');
    const scim = identity?.evidence.find((item) => item.id === 'scim-store');
    assert.equal(identity?.status, 'partial');
    assert.equal(scim?.status, 'partial');
    assert.match(scim?.detail ?? '', /memory persistence/u);
    assert.match(scim?.detail ?? '', /Postgres or durable-injected/u);
  });
});

test('trust controls do not mark memory tenant stores as implemented', async () => {
  await withServer({
    auditAdminToken: 'trust-admin-token-0123456789',
    workosVerifier: verifier(),
    tenantStore: new TenantStore(),
    tenantStorePersistence: 'memory',
    scimStore: new ScimUserStore(),
    scimStorePersistence: 'durable-injected',
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/enterprise/trust-controls`, {
      headers: { authorization: 'Bearer trust-admin-token-0123456789' },
    });
    assert.equal(response.status, 200);
    const report = await response.json() as {
      controls: Array<{ id: string; status: string; evidence: Array<{ id: string; status: string; detail: string }> }>;
    };
    const identity = report.controls.find((control) => control.id === 'GBX-SEC-001');
    const tenantStore = identity?.evidence.find((item) => item.id === 'tenant-store');
    assert.equal(identity?.status, 'partial');
    assert.equal(tenantStore?.status, 'partial');
    assert.match(tenantStore?.detail ?? '', /memory persistence/u);
    assert.match(tenantStore?.detail ?? '', /Postgres or durable-injected/u);
  });
});

test('trust controls do not mark memory audit logs as implemented', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-trust-audit-memory-'));
  try {
    const auditLog = new FileAuditLog(path.join(dir, 'audit'));
    await auditLog.append({
      id: 'audit-memory-control',
      tenantId: 'tenant-trust',
      actorId: 'trust-admin',
      actorType: 'admin',
      action: 'billing.invoice_job_run',
      targetType: 'billing-period',
      targetId: 'tenant-trust:2026-05',
      createdAt: '2026-05-17T00:00:00.000Z',
    });
    await withServer({
      auditAdminToken: 'trust-admin-token-0123456789',
      auditLog,
      auditLogPersistence: 'memory',
    }, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/v1/enterprise/trust-controls`, {
        headers: { authorization: 'Bearer trust-admin-token-0123456789' },
      });
      assert.equal(response.status, 200);
      const report = await response.json() as {
        controls: Array<{ id: string; status: string; evidence: Array<{ id: string; status: string; detail: string }> }>;
      };
      const audit = report.controls.find((control) => control.id === 'GBX-SEC-002');
      const evidence = audit?.evidence.find((item) => item.id === 'audit-log-hash-chain');
      assert.equal(audit?.status, 'partial');
      assert.equal(evidence?.status, 'partial');
      assert.match(evidence?.detail ?? '', /Persistence is memory/u);
      assert.match(evidence?.detail ?? '', /Postgres or durable-injected/u);
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('trust controls do not mark memory operational ledgers as implemented', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-trust-ledger-memory-'));
  try {
    const billingLedger = new FileBillingLedger(path.join(dir, 'billing'));
    const privacyRequestStore = new FilePrivacyRequestStore(path.join(dir, 'privacy'));
    const incidentStore = new FileSecurityIncidentStore(path.join(dir, 'incidents'));
    const modelTrainingConsentStore = new FileModelTrainingConsentStore(path.join(dir, 'model-training-consents'));
    const legalHoldStore = new FileLegalHoldStore(path.join(dir, 'legal-holds'));
    await billingLedger.appendUsage({
      id: 'usage-memory',
      tenantId: 'tenant-trust',
      userId: 'trust-admin',
      projectId: 'project-trust',
      provider: 'openai',
      model: 'gpt-4.1-mini',
      inputTokens: 12,
      outputTokens: 6,
      inputCostUsd: 0.001,
      outputCostUsd: 0.002,
      createdAt: '2026-05-17T00:00:00.000Z',
    });
    await privacyRequestStore.create({
      tenantId: 'tenant-trust',
      jurisdiction: 'gdpr',
      requestType: 'access',
      contactEmail: 'privacy@example.com',
    }, new Date('2026-05-17T00:00:00.000Z'));
    await incidentStore.create({
      tenantId: 'tenant-trust',
      title: 'Tabletop incident',
      personalDataBreach: false,
      awareAt: '2026-05-17T00:00:00.000Z',
    }, 'trust-admin', new Date('2026-05-17T00:00:00.000Z'));
    await modelTrainingConsentStore.create({
      projectId: 'project-trust',
      status: 'opted-in',
      separateCheckboxAccepted: true,
      consentText: 'I explicitly allow Greybox Native model training on this project.',
    }, {
      tenantId: 'tenant-trust',
      userId: 'designer-trust',
      tier: 'studio',
      tokenHash: 'test',
      roles: ['designer'],
    }, new Date('2026-05-17T00:00:00.000Z'));
    await legalHoldStore.create({
      tenantId: 'tenant-trust',
      title: 'Tabletop legal hold',
      reason: 'Counsel review.',
      datasets: ['project-artifacts'],
    }, 'trust-admin', new Date('2026-05-17T00:00:00.000Z'));

    await withServer({
      auditAdminToken: 'trust-admin-token-0123456789',
      billingLedger,
      billingLedgerPersistence: 'memory',
      privacyRequestStore,
      privacyRequestStorePersistence: 'memory',
      incidentStore,
      incidentStorePersistence: 'memory',
      modelTrainingConsentStore,
      modelTrainingConsentStorePersistence: 'memory',
      legalHoldStore,
      legalHoldStorePersistence: 'memory',
    }, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/v1/enterprise/trust-controls`, {
        headers: { authorization: 'Bearer trust-admin-token-0123456789' },
      });
      assert.equal(response.status, 200);
      const report = await response.json() as {
        controls: Array<{ id: string; status: string; evidence: Array<{ status: string; detail: string }> }>;
      };
      for (const id of ['GBX-SEC-003', 'GBX-PRI-001', 'GBX-PRI-003', 'GBX-BIL-001', 'GBX-AI-001']) {
        const control = report.controls.find((item) => item.id === id);
        assert.equal(control?.status, 'partial');
        assert.ok(control?.evidence.some((item) => item.status === 'partial' && item.detail.includes('persistence is memory')));
      }
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('trust controls expose Postgres monthly usage reservation enforcement', async () => {
  const report = await buildTrustControlReport({
    billingLedger: reservationCapableBillingLedger(),
    billingLedgerPersistence: 'postgres',
    now: new Date('2026-05-17T00:00:00.000Z'),
  });

  const billing = report.controls.find((control) => control.id === 'GBX-BIL-001');
  const reservation = billing?.evidence.find((item) => item.id === 'monthly-usage-reservation-control');
  assert.equal(billing?.status, 'implemented');
  assert.equal(reservation?.status, 'implemented');
  assert.match(reservation?.detail ?? '', /Postgres billing ledger/u);
  assert.match(reservation?.detail ?? '', /lock-backed monthly usage reservation/u);
  assert.deepEqual(reservation?.references, [
    'tests/billing-ledger-postgres.test.ts',
    'src/metering/billingLedgerPostgres.ts',
    'src/metering/monthlyUsage.ts',
  ]);
});

test('trust controls endpoint reports configured evidence without claiming certification', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-trust-controls-'));
  try {
    const auditLog = new FileAuditLog(path.join(dir, 'audit'));
    const billingLedger = new FileBillingLedger(path.join(dir, 'billing'));
    const privacyRequestStore = new FilePrivacyRequestStore(path.join(dir, 'privacy'));
    const incidentStore = new FileSecurityIncidentStore(path.join(dir, 'incidents'));
    const modelTrainingConsentStore = new FileModelTrainingConsentStore(path.join(dir, 'model-training-consents'));
    const legalHoldStore = new FileLegalHoldStore(path.join(dir, 'legal-holds'));
    const scimStore = new ScimUserStore(path.join(dir, 'scim'));
    await auditLog.append({
      id: 'audit-trust-control',
      tenantId: 'tenant-trust',
      actorId: 'trust-admin',
      actorType: 'admin',
      action: 'billing.invoice_job_run',
      targetType: 'billing-period',
      targetId: 'tenant-trust:2026-05',
      createdAt: '2026-05-17T00:00:00.000Z',
    });
    await billingLedger.appendUsage({
      id: 'usage-trust',
      tenantId: 'tenant-trust',
      userId: 'trust-admin',
      projectId: 'project-trust',
      provider: 'openai',
      model: 'gpt-4.1-mini',
      inputTokens: 12,
      outputTokens: 6,
      inputCostUsd: 0.001,
      outputCostUsd: 0.002,
      createdAt: '2026-05-17T00:00:00.000Z',
    });
    await privacyRequestStore.create({
      tenantId: 'tenant-trust',
      jurisdiction: 'gdpr',
      requestType: 'access',
      contactEmail: 'privacy@example.com',
    }, new Date('2026-05-17T00:00:00.000Z'));
    await incidentStore.create({
      tenantId: 'tenant-trust',
      title: 'Tabletop incident',
      personalDataBreach: true,
      gdprRiskAssessment: 'likely',
      awareAt: '2026-05-17T00:00:00.000Z',
    }, 'trust-admin', new Date('2026-05-17T00:00:00.000Z'));
    await modelTrainingConsentStore.create({
      projectId: 'project-trust',
      status: 'opted-in',
      separateCheckboxAccepted: true,
      consentText: 'I explicitly allow Greybox Native model training on this project.',
    }, {
      tenantId: 'tenant-trust',
      userId: 'designer-trust',
      tier: 'studio',
      tokenHash: 'test',
      roles: ['designer'],
    }, new Date('2026-05-17T00:00:00.000Z'));
    await legalHoldStore.create({
      tenantId: 'tenant-trust',
      title: 'Tabletop legal hold',
      reason: 'Counsel review of deletion exception.',
      datasets: ['project-artifacts'],
    }, 'trust-admin', new Date('2026-05-17T00:00:00.000Z'));

    await withServer({
      auditLog,
      tenantStorePersistence: 'durable-injected',
      auditLogPersistence: 'durable-injected',
      billingLedger,
      billingLedgerPersistence: 'durable-injected',
      privacyRequestStore,
      privacyRequestStorePersistence: 'durable-injected',
      incidentStore,
      incidentStorePersistence: 'durable-injected',
      modelTrainingConsentStore,
      modelTrainingConsentStorePersistence: 'durable-injected',
      legalHoldStore,
      legalHoldStorePersistence: 'durable-injected',
      scimStore,
      scimStorePersistence: 'durable-injected',
      workosVerifier: verifier(),
      tenantStore: new TenantStore(),
      offlineLicensePath: path.join(dir, 'license.greybox.json'),
      onPremReadiness: { env: { GREYBOX_DEPLOYMENT_MODE: 'on-prem' }, probeWrites: false },
      privacyGovernanceEnv: {
        GREYBOX_DPO_NAME: 'Greybox Privacy Lead',
        GREYBOX_DPO_EMAIL: 'privacy@greybox.studio',
        GREYBOX_DPO_REGION: 'global',
        GREYBOX_DPO_APPOINTED_AT: '2026-05-17T00:00:00.000Z',
      },
      privacyDisclosureEnv: {
        GREYBOX_PRIVACY_CONTACT_EMAIL: 'privacy@greybox.studio',
        GREYBOX_GRIEVANCE_EMAIL: 'privacy@greybox.studio',
      },
      dataResidencyEnv: {
        GREYBOX_DATA_RESIDENCY_ENFORCEMENT: 'strict',
        GREYBOX_REGION_US_BASE_URL: 'https://cloud-us.greybox.studio',
        GREYBOX_REGION_US_STORAGE_BOUNDARY: 'local',
        GREYBOX_REGION_US_PROVIDER_EGRESS: 'customer-selected',
        GREYBOX_REGION_US_TRANSFER_BASIS: 'same-region',
        GREYBOX_REGION_US_BACKUP_BOUNDARY: 'local',
      },
      privateNetworkEnv: {
        GREYBOX_AWS_VPC_PEERING_ID: 'pcx-trust123',
        GREYBOX_AWS_VPC_CUSTOMER_NETWORK_ID: 'vpc-customer123',
        GREYBOX_AWS_VPC_GREYBOX_NETWORK_ID: 'vpc-greybox123',
        GREYBOX_AWS_VPC_CIDR_NON_OVERLAP: 'true',
        GREYBOX_AWS_VPC_ROUTES_UPDATED: 'true',
        GREYBOX_AWS_VPC_SECURITY_RULES_SCOPED: 'true',
        GREYBOX_AWS_VPC_DNS_ENABLED: 'true',
        GREYBOX_AWS_VPC_LAST_VALIDATED_AT: '2026-05-17T00:00:00.000Z',
      },
    }, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/v1/enterprise/trust-controls`, {
        headers: { authorization: `Bearer ${signWorkOsJwt()}` },
      });
      assert.equal(response.status, 200);
      const report = await response.json() as {
        disclaimer: string;
        summary: { implemented: number; partial: number; missing: number };
        controls: Array<{ id: string; status: string; evidence: Array<{ id: string; status: string; detail: string }> }>;
      };
      assert.match(report.disclaimer, /not a SOC 2, ISO 27001, legal, or auditor certification/u);
      assert.ok(report.summary.implemented >= 5);
      assert.equal(report.summary.missing, 0);
      assert.equal(report.controls.find((control) => control.id === 'GBX-SEC-002')?.status, 'implemented');
      assert.equal(report.controls.find((control) => control.id === 'GBX-SEC-003')?.status, 'implemented');
      assert.equal(report.controls.find((control) => control.id === 'GBX-PRI-001')?.status, 'implemented');
      assert.equal(report.controls.find((control) => control.id === 'GBX-PRI-002')?.status, 'implemented');
      assert.equal(report.controls.find((control) => control.id === 'GBX-PRI-003')?.status, 'implemented');
      assert.equal(report.controls.find((control) => control.id === 'GBX-PRI-004')?.status, 'partial');
      assert.equal(report.controls.find((control) => control.id === 'GBX-PRI-005')?.status, 'partial');
      assert.equal(report.controls.find((control) => control.id === 'GBX-PRI-006')?.status, 'partial');
      assert.equal(report.controls.find((control) => control.id === 'GBX-BIL-001')?.status, 'partial');
      assert.equal(report.controls.find((control) => control.id === 'GBX-OPS-002')?.status, 'implemented');
      assert.match(
        report.controls.find((control) => control.id === 'GBX-PRI-001')?.evidence[0]?.detail ?? '',
        /1 current request records/u,
      );
      assert.match(
        report.controls.find((control) => control.id === 'GBX-SEC-003')?.evidence[0]?.detail ?? '',
        /1 current incidents/u,
      );
      assert.match(
        report.controls.find((control) => control.id === 'GBX-AI-001')?.evidence.at(-1)?.detail ?? '',
        /1 records/u,
      );
      assert.match(
        report.controls.find((control) => control.id === 'GBX-PRI-002')?.evidence[0]?.detail ?? '',
        /30-day change notice/u,
      );
      assert.match(
        report.controls.find((control) => control.id === 'GBX-PRI-003')?.evidence[0]?.detail ?? '',
        /1 active holds/u,
      );
      assert.match(
        report.controls.find((control) => control.id === 'GBX-BIL-001')?.evidence.find((item) => item.id === 'monthly-usage-reservation-control')?.detail ?? '',
        /does not expose lock-backed monthly usage reservation/u,
      );
      assert.match(
        report.controls.find((control) => control.id === 'GBX-PRI-004')?.evidence[0]?.detail ?? '',
        /processing activities/u,
      );
      assert.match(
        report.controls.find((control) => control.id === 'GBX-PRI-005')?.evidence[0]?.detail ?? '',
        /3 jurisdictions/u,
      );
      assert.match(
        report.controls.find((control) => control.id === 'GBX-PRI-006')?.evidence[0]?.detail ?? '',
        /1\/3 ready regions/u,
      );
      assert.match(
        report.controls.find((control) => control.id === 'GBX-OPS-002')?.evidence[0]?.detail ?? '',
        /1 profiles/u,
      );
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
