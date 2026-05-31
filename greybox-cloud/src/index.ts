// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { createGreyboxCloudServer } from './server.js';
import { createSentryAdapter, type SentryAdapter } from './observability/sentry.js';
import { TenantStore } from './routers/tenants.js';
import { postgresTenantPersisterFromEnv } from './routers/tenantsPostgres.js';
import { auditSealOptionsFromEnv } from './enterprise/auditLog.js';
import { postgresAuditLogFromEnv } from './enterprise/auditLogPostgres.js';
import { ScimUserStore } from './enterprise/scim.js';
import { postgresScimPersisterFromEnv } from './enterprise/scimPostgres.js';
import { postgresModelTrainingConsentStoreFromEnv } from './enterprise/modelTrainingConsentPostgres.js';
import { postgresPrivacyRequestStoreFromEnv } from './enterprise/privacyRequestsPostgres.js';
import { postgresSecurityIncidentStoreFromEnv } from './enterprise/incidentsPostgres.js';
import { postgresLegalHoldStoreFromEnv } from './enterprise/retentionPostgres.js';
import { postgresBillingLedgerFromEnv } from './metering/billingLedgerPostgres.js';
import { postgresLicenseRecordStoreFromEnv } from './routers/licenseRecordsPostgres.js';
import { postgresProModuleEntitlementGrantStoreFromEnv } from './routers/proModuleEntitlementsPostgres.js';
import { postgresCharacterJobStoreFromEnv } from './stores/CharacterJobStore.js';

const port = Number(process.env.PORT ?? 8080);

/**
 * Validate Postgres URL configuration at startup and log clear guidance.
 *
 * - All 5 URLs present → production Postgres mode.
 * - None present       → file/memory dev mode (safe default).
 * - Partial            → warn loudly; remaining stores fall back to file/memory.
 */
function auditPostgresConfig(): void {
  const pgUrls: Record<string, string | undefined> = {
    tenant: process.env.GREYBOX_TENANT_STORE_PG_URL,
    audit: process.env.GREYBOX_AUDIT_LOG_PG_URL,
    billing: process.env.GREYBOX_BILLING_LEDGER_PG_URL,
    scim: process.env.GREYBOX_SCIM_PG_URL,
    characters: process.env.GREYBOX_CHARACTER_JOBS_PG_URL,
  };

  const configured = Object.entries(pgUrls).filter(([, v]) => Boolean(v)).map(([k]) => k);
  const missing = Object.entries(pgUrls).filter(([, v]) => !v).map(([k]) => k);
  const allConfigured = missing.length === 0;
  const noneConfigured = configured.length === 0;

  if (allConfigured) {
    // eslint-disable-next-line no-console
    console.log('[startup] Postgres mode: all stores configured — using Postgres for everything');
  } else if (noneConfigured) {
    if (process.env.NODE_ENV === 'production') {
      // eslint-disable-next-line no-console
      console.warn('[startup] WARNING: NODE_ENV=production but no Postgres URLs are configured — using file-based stores. Set all GREYBOX_*_PG_URL vars for production.');
    } else {
      // eslint-disable-next-line no-console
      console.log('[startup] Dev mode: no Postgres URLs configured — using file-based stores');
    }
  } else {
    // eslint-disable-next-line no-console
    console.warn('[startup] WARNING: partial Postgres config detected');
    // eslint-disable-next-line no-console
    console.warn(`[startup]   configured: ${configured.join(', ')}`);
    // eslint-disable-next-line no-console
    console.warn(`[startup]   missing:    ${missing.join(', ')}`);
    // eslint-disable-next-line no-console
    console.warn('[startup] Each missing store will use file-based fallback. Set all 5 GREYBOX_*_PG_URL vars for full Postgres mode.');
  }
}

async function main() {
  auditPostgresConfig();

  const sentry: SentryAdapter = await createSentryAdapter({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? 'development',
    release: process.env.GREYBOX_CLOUD_VERSION,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0') || 0,
  });
  let pgTenantPersister: Awaited<ReturnType<typeof postgresTenantPersisterFromEnv>>;

  // Surface uncaught failures to telemetry without crashing the process for
  // non-fatal rejections. Uncaught exceptions still crash (Node default) so
  // the orchestrator (Render/Fly) can restart the replica.
  process.on('uncaughtException', (error) => {
    sentry.captureException(error, { kind: 'uncaughtException' });
    // eslint-disable-next-line no-console
    console.error('[greybox-cloud] uncaughtException:', error);
    // Flush telemetry before exit; 2s ceiling matches Sentry's default.
    sentry.flush(2000).finally(() => {
      process.exit(1);
    });
  });
  process.on('unhandledRejection', (reason) => {
    sentry.captureException(reason, { kind: 'unhandledRejection' });
    // eslint-disable-next-line no-console
    console.error('[greybox-cloud] unhandledRejection:', reason);
  });

  // Graceful shutdown: flush in-flight telemetry before SIGTERM completes.
  const shutdown = async (signal: NodeJS.Signals) => {
    // eslint-disable-next-line no-console
    console.log(`[greybox-cloud] received ${signal}, draining...`);
    await pgTenantPersister?.drain().catch((error) => {
      sentry.captureException(error, { kind: 'tenant_store_pg_shutdown_drain' });
      // eslint-disable-next-line no-console
      console.error('[greybox-cloud] tenant store postgres drain failed:', error);
    });
    await sentry.flush(2000).catch(() => undefined);
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  // Optional Postgres-backed tenant store. Falls back to file-based via
  // GREYBOX_TENANT_STORE_DIR (or in-memory) when GREYBOX_TENANT_STORE_PG_URL
  // is unset. Surface boot failures explicitly so a half-configured Postgres
  // doesn't silently land on the file store.
  pgTenantPersister = await postgresTenantPersisterFromEnv().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[greybox-cloud] fatal: tenant store postgres bootstrap failed:', err);
    sentry.captureException(err, { kind: 'tenant_store_pg_bootstrap' });
    throw err;
  });
  const tenantStore = pgTenantPersister
    ? new TenantStore({ persister: pgTenantPersister })
    : undefined;
  if (tenantStore) {
    // eslint-disable-next-line no-console
    console.log('[greybox-cloud] tenant store: postgres');
  }

  // Optional Postgres-backed audit log. Same fall-back posture as the tenant
  // store: bail loudly on bootstrap errors so a half-configured Postgres
  // doesn't silently degrade to the file-based hash chain.
  const pgAuditLog = await postgresAuditLogFromEnv(process.env, auditSealOptionsFromEnv()).catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[greybox-cloud] fatal: audit log postgres bootstrap failed:', err);
    sentry.captureException(err, { kind: 'audit_log_pg_bootstrap' });
    throw err;
  });
  if (pgAuditLog) {
    // eslint-disable-next-line no-console
    console.log('[greybox-cloud] audit log: postgres');
  }

  // Optional Postgres-backed SCIM user store. Required for multi-replica
  // deployments where the file-based store would race on writes.
  const pgScimPersister = await postgresScimPersisterFromEnv().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[greybox-cloud] fatal: scim store postgres bootstrap failed:', err);
    sentry.captureException(err, { kind: 'scim_pg_bootstrap' });
    throw err;
  });
  const scimStore = pgScimPersister ? new ScimUserStore({ persister: pgScimPersister }) : undefined;
  if (scimStore) {
    // eslint-disable-next-line no-console
    console.log('[greybox-cloud] scim store: postgres');
  }

  // Optional Postgres-backed model-training consent store. This is the hosted
  // enforcement path for separate opt-in across multiple cloud replicas.
  const pgModelTrainingConsentStore = await postgresModelTrainingConsentStoreFromEnv().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[greybox-cloud] fatal: model-training consent postgres bootstrap failed:', err);
    sentry.captureException(err, { kind: 'model_training_consent_pg_bootstrap' });
    throw err;
  });
  if (pgModelTrainingConsentStore) {
    // eslint-disable-next-line no-console
    console.log('[greybox-cloud] model-training consent store: postgres');
  }

  // Optional Postgres-backed privacy request store for GDPR/CCPA/COPPA/DPDPA
  // intake and status workflows across hosted replicas.
  const pgPrivacyRequestStore = await postgresPrivacyRequestStoreFromEnv().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[greybox-cloud] fatal: privacy request postgres bootstrap failed:', err);
    sentry.captureException(err, { kind: 'privacy_request_pg_bootstrap' });
    throw err;
  });
  if (pgPrivacyRequestStore) {
    // eslint-disable-next-line no-console
    console.log('[greybox-cloud] privacy request store: postgres');
  }

  // Optional Postgres-backed security incident store for GDPR breach-clock and
  // containment evidence across hosted replicas.
  const pgSecurityIncidentStore = await postgresSecurityIncidentStoreFromEnv().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[greybox-cloud] fatal: security incident postgres bootstrap failed:', err);
    sentry.captureException(err, { kind: 'security_incident_pg_bootstrap' });
    throw err;
  });
  if (pgSecurityIncidentStore) {
    // eslint-disable-next-line no-console
    console.log('[greybox-cloud] security incident store: postgres');
  }

  // Optional Postgres-backed legal-hold store for deletion blockers and
  // retention-exception evidence across hosted replicas.
  const pgLegalHoldStore = await postgresLegalHoldStoreFromEnv().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[greybox-cloud] fatal: legal hold postgres bootstrap failed:', err);
    sentry.captureException(err, { kind: 'legal_hold_pg_bootstrap' });
    throw err;
  });
  if (pgLegalHoldStore) {
    // eslint-disable-next-line no-console
    console.log('[greybox-cloud] legal hold store: postgres');
  }

  // Optional Postgres-backed billing ledger for hosted metering, invoice, and
  // Stripe meter-event evidence across cloud replicas.
  const pgBillingLedger = await postgresBillingLedgerFromEnv().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[greybox-cloud] fatal: billing ledger postgres bootstrap failed:', err);
    sentry.captureException(err, { kind: 'billing_ledger_pg_bootstrap' });
    throw err;
  });
  if (pgBillingLedger) {
    // eslint-disable-next-line no-console
    console.log('[greybox-cloud] billing ledger: postgres');
  }

  // Optional Postgres-backed license record store for Unity/plugin revocation,
  // suspension, expiry, and feature overrides across hosted replicas.
  const pgLicenseRecordStore = await postgresLicenseRecordStoreFromEnv().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[greybox-cloud] fatal: license record postgres bootstrap failed:', err);
    sentry.captureException(err, { kind: 'license_records_pg_bootstrap' });
    throw err;
  });
  if (pgLicenseRecordStore) {
    // eslint-disable-next-line no-console
    console.log('[greybox-cloud] license records: postgres');
  }

  // Optional Postgres-backed character generation jobs + library store
  // for hosted multi-replica deployments. Falls back to the in-memory
  // store inside createGreyboxCloudServer when GREYBOX_CHARACTER_JOBS_PG_URL
  // is unset.
  const pgCharacterJobStore = await postgresCharacterJobStoreFromEnv().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[greybox-cloud] fatal: character jobs postgres bootstrap failed:', err);
    sentry.captureException(err, { kind: 'character_jobs_pg_bootstrap' });
    throw err;
  });
  if (pgCharacterJobStore) {
    // eslint-disable-next-line no-console
    console.log('[greybox-cloud] character jobs: postgres');
  }

  // Optional Postgres-backed Pro module entitlement grant store for paid
  // pack access and marketplace-claim persistence across hosted replicas.
  const pgProModuleEntitlementStore = await postgresProModuleEntitlementGrantStoreFromEnv().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[greybox-cloud] fatal: Pro module entitlement postgres bootstrap failed:', err);
    sentry.captureException(err, { kind: 'pro_module_entitlements_pg_bootstrap' });
    throw err;
  });
  if (pgProModuleEntitlementStore) {
    // eslint-disable-next-line no-console
    console.log('[greybox-cloud] Pro module entitlements: postgres');
  }

  const server = createGreyboxCloudServer({
    sentry,
    ...(pgBillingLedger ? { billingLedger: pgBillingLedger, billingLedgerPersistence: 'postgres' } : {}),
    ...(pgLicenseRecordStore
      ? { licenseRecordStore: pgLicenseRecordStore, licenseRecordPersistence: 'postgres' }
      : {}),
    ...(pgProModuleEntitlementStore
      ? {
        proModuleEntitlementGrantStore: pgProModuleEntitlementStore,
        proModuleEntitlementPersistence: 'postgres',
      }
      : {}),
    ...(pgCharacterJobStore
      ? {
        characterJobStore: pgCharacterJobStore,
        characterJobStorePersistence: 'postgres' as const,
      }
      : {}),
    ...(tenantStore ? { tenantStore, tenantStorePersistence: 'postgres' } : {}),
    ...(pgAuditLog ? { auditLog: pgAuditLog, auditLogPersistence: 'postgres' } : {}),
    ...(scimStore ? { scimStore, scimStorePersistence: 'postgres' } : {}),
    ...(pgModelTrainingConsentStore
      ? {
        modelTrainingConsentStore: pgModelTrainingConsentStore,
        modelTrainingConsentStorePersistence: 'postgres',
      }
      : {}),
    ...(pgPrivacyRequestStore
      ? {
        privacyRequestStore: pgPrivacyRequestStore,
        privacyRequestStorePersistence: 'postgres',
      }
      : {}),
    ...(pgSecurityIncidentStore
      ? {
        incidentStore: pgSecurityIncidentStore,
        incidentStorePersistence: 'postgres',
      }
      : {}),
    ...(pgLegalHoldStore
      ? {
        legalHoldStore: pgLegalHoldStore,
        legalHoldStorePersistence: 'postgres',
      }
      : {}),
  });
  server.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`greybox-cloud listening on :${port}${sentry.enabled ? ' (sentry: on)' : ''}`);
  });
}

void main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('[greybox-cloud] fatal boot error:', error);
  process.exit(1);
});
