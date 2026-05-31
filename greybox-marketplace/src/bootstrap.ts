// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

/**
 * Production bootstrap for greybox-marketplace.
 *
 * Wires the InMemoryMarketplaceStore with the right payoutProvider and
 * auditLog based on environment variables. Use this from the service
 * entrypoint instead of constructing the store directly so production
 * safety guards are always enforced.
 *
 * Example:
 *
 *   import { createProductionMarketplaceStore } from './bootstrap.js';
 *   const store = createProductionMarketplaceStore();
 *   // store now has LiveStripeConnectProvider + FileMarketplaceAuditLog
 *   // wired automatically. Refuses to instantiate in NODE_ENV=production
 *   // without STRIPE_SECRET_KEY. Production dry-run also requires
 *   // a reasoned and time-bound GREYBOX_MARKETPLACE_ALLOW_PRODUCTION_DRY_RUN=1.
 */

import {
  InMemoryMarketplaceStore,
  marketplacePayoutReservePolicyFromEnv,
  type MarketplacePayoutReservePolicyEnv,
} from './store/marketplaceStore.js';
import { LiveStripeConnectProvider, MockStripeConnectProvider } from './payouts/stripeConnect.js';
import { FileMarketplaceAuditLog, InMemoryMarketplaceAuditLog } from './store/auditLog.js';
import { FileBackedMarketplaceStore } from './store/fileMarketplaceStore.js';
import {
  productionDryRunBreakGlassAllowed,
  productionDryRunBreakGlassMessage,
  type ProductionDryRunEnv,
} from './safety/productionDryRun.js';
import { assertHostedStripeSecretKey } from './safety/stripeProduction.js';

export interface MarketplaceBootstrapEnv extends MarketplacePayoutReservePolicyEnv, ProductionDryRunEnv {
  readonly NODE_ENV?: string;
  readonly STRIPE_SECRET_KEY?: string;
  readonly STRIPE_CONNECT_DRY_RUN?: string;
  readonly STRIPE_API_BASE?: string;
  readonly GREYBOX_MARKETPLACE_AUDIT_LOG_PATH?: string;
  readonly GREYBOX_MARKETPLACE_STORE_FILE?: string;
}

export interface MarketplaceBootstrapOptions {
  /** Env override; defaults to process.env. */
  env?: MarketplaceBootstrapEnv;
  /** Force the mock provider even in production. ONLY for controlled tests. */
  allowMockPayoutsInProduction?: boolean;
  /** Override clock for tests. */
  clock?: { now: () => number };
}

export function createProductionMarketplaceStore(
  options: MarketplaceBootstrapOptions = {},
): InMemoryMarketplaceStore {
  const env = options.env ?? process.env;
  const isProduction = (env.NODE_ENV ?? '').toLowerCase() === 'production';
  const stripeSecretKey = env.STRIPE_SECRET_KEY?.trim();

  const dryRunExplicit = env.STRIPE_CONNECT_DRY_RUN === '1';
  const dryRunExplicitOff = env.STRIPE_CONNECT_DRY_RUN === '0';
  if (isProduction && stripeSecretKey) {
    assertHostedStripeSecretKey('createProductionMarketplaceStore', stripeSecretKey);
  }
  if (isProduction && !stripeSecretKey && dryRunExplicitOff) {
    throw new Error(
      'createProductionMarketplaceStore refused to start in NODE_ENV=production without ' +
      'STRIPE_SECRET_KEY when STRIPE_CONNECT_DRY_RUN=0. Either set STRIPE_SECRET_KEY (recommended) ' +
      'or set STRIPE_CONNECT_DRY_RUN=1 to emit synthetic queued payouts.',
    );
  }
  if (isProduction && stripeSecretKey && !dryRunExplicit && !dryRunExplicitOff) {
    throw new Error(
      'createProductionMarketplaceStore refused to start in NODE_ENV=production without explicit ' +
      'STRIPE_CONNECT_DRY_RUN=0 or STRIPE_CONNECT_DRY_RUN=1.',
    );
  }
  const dryRun = dryRunExplicit || !stripeSecretKey;
  const allowProductionDryRun = productionDryRunBreakGlassAllowed(env);
  if (isProduction && dryRun && !allowProductionDryRun) {
    throw new Error(productionDryRunBreakGlassMessage('createProductionMarketplaceStore'));
  }
  const payoutProvider = options.allowMockPayoutsInProduction === true && !stripeSecretKey
    ? new MockStripeConnectProvider({ allowInProduction: true, env })
    : new LiveStripeConnectProvider({
        ...(stripeSecretKey ? { apiKey: stripeSecretKey } : {}),
        dryRun,
        ...(env.STRIPE_API_BASE ? { stripeApiBase: env.STRIPE_API_BASE } : {}),
      });

  const auditPath = env.GREYBOX_MARKETPLACE_AUDIT_LOG_PATH?.trim();
  const storePath = env.GREYBOX_MARKETPLACE_STORE_FILE?.trim();
  if (isProduction && !auditPath) {
    throw new Error(
      'createProductionMarketplaceStore refused to start in NODE_ENV=production without ' +
      'GREYBOX_MARKETPLACE_AUDIT_LOG_PATH for hash-chained audit evidence.',
    );
  }
  if (isProduction && !storePath) {
    throw new Error(
      'createProductionMarketplaceStore refused to start in NODE_ENV=production without ' +
      'GREYBOX_MARKETPLACE_STORE_FILE for durable creator, order, payout, tax, and entitlement state.',
    );
  }
  const auditLog = auditPath
    ? new FileMarketplaceAuditLog(auditPath)
    : new InMemoryMarketplaceAuditLog();
  const payoutReservePolicy = marketplacePayoutReservePolicyFromEnv(env);

  const storeOptions: ConstructorParameters<typeof InMemoryMarketplaceStore>[0] = {
    payoutProvider,
    auditLog,
    ...(payoutReservePolicy ? { payoutReservePolicy } : {}),
    ...(options.clock ? { clock: options.clock } : {}),
    ...(options.env ? { env: options.env } : {}),
    ...(options.allowMockPayoutsInProduction ? { allowMockPayoutsInProduction: true } : {}),
  };

  if (isProduction && dryRun) {
    // Log loudly so operators don't silently run with dry-run in production.
    // eslint-disable-next-line no-console
    console.warn(
      '[greybox-marketplace] starting in DRY-RUN mode in production. ' +
      'Real Stripe transfers will NOT be sent. Set STRIPE_CONNECT_DRY_RUN=0 ' +
      'and ensure STRIPE_SECRET_KEY is set to enable live payouts.',
    );
  }

  return storePath
    ? new FileBackedMarketplaceStore({ ...storeOptions, snapshotPath: storePath })
    : new InMemoryMarketplaceStore(storeOptions);
}
