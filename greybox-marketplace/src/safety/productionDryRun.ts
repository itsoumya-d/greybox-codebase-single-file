// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

export interface ProductionDryRunEnv {
  readonly GREYBOX_MARKETPLACE_ALLOW_PRODUCTION_DRY_RUN?: string;
  readonly GREYBOX_MARKETPLACE_ALLOW_PRODUCTION_DRY_RUN_REASON?: string;
  readonly GREYBOX_MARKETPLACE_ALLOW_PRODUCTION_DRY_RUN_EXPIRES_AT?: string;
  readonly GREYBOX_MARKETPLACE_ALLOW_PRODUCTION_DRY_RUN_NOW?: string;
}

const maxProductionDryRunMs = 24 * 60 * 60 * 1000;
const maxFutureClockSkewMs = 5 * 60 * 1000;
const minReasonLength = 12;

export function productionDryRunBreakGlassAllowed(env: ProductionDryRunEnv): boolean {
  if (env.GREYBOX_MARKETPLACE_ALLOW_PRODUCTION_DRY_RUN !== '1') return false;
  const reason = env.GREYBOX_MARKETPLACE_ALLOW_PRODUCTION_DRY_RUN_REASON?.trim() ?? '';
  if (reason.length < minReasonLength) return false;
  const expiresAt = timestampMs(env.GREYBOX_MARKETPLACE_ALLOW_PRODUCTION_DRY_RUN_EXPIRES_AT);
  if (expiresAt === undefined) return false;
  const now = timestampMs(env.GREYBOX_MARKETPLACE_ALLOW_PRODUCTION_DRY_RUN_NOW) ?? Date.now();
  if (expiresAt <= now) return false;
  return expiresAt - now <= maxProductionDryRunMs + maxFutureClockSkewMs;
}

export function productionDryRunBreakGlassMessage(service: string): string {
  return `${service} refused to start in NODE_ENV=production with payout dry-run enabled. ` +
    'Set STRIPE_CONNECT_DRY_RUN=0 for live payouts, or use a time-bound ' +
    'GREYBOX_MARKETPLACE_ALLOW_PRODUCTION_DRY_RUN=1 rehearsal with ' +
    'GREYBOX_MARKETPLACE_ALLOW_PRODUCTION_DRY_RUN_REASON and ' +
    'GREYBOX_MARKETPLACE_ALLOW_PRODUCTION_DRY_RUN_EXPIRES_AT.';
}

function timestampMs(value: string | undefined): number | undefined {
  if (!value?.trim()) return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
