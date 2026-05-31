// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

export interface TimeBoundBreakGlassOptions {
  readonly flagKey: string;
  readonly reasonKey?: string;
  readonly expiresAtKey?: string;
  readonly nowKey?: string;
  readonly minReasonLength?: number;
  readonly maxDurationMs?: number;
}

const defaultMinReasonLength = 12;
const defaultMaxDurationMs = 24 * 60 * 60 * 1000;
const maxFutureClockSkewMs = 5 * 60 * 1000;

export function timeBoundBreakGlassAllowed(
  env: object,
  options: TimeBoundBreakGlassOptions,
): boolean {
  if (envValue(env, options.flagKey) !== '1') return false;
  const reasonKey = options.reasonKey ?? `${options.flagKey}_REASON`;
  const expiresAtKey = options.expiresAtKey ?? `${options.flagKey}_EXPIRES_AT`;
  const nowKey = options.nowKey ?? `${options.flagKey}_NOW`;
  const reason = envValue(env, reasonKey)?.trim() ?? '';
  if (reason.length < (options.minReasonLength ?? defaultMinReasonLength)) return false;
  const expiresAt = timestampField(envValue(env, expiresAtKey));
  if (expiresAt === undefined) return false;
  const now = timestampField(envValue(env, nowKey)) ?? Date.now();
  if (expiresAt <= now) return false;
  return expiresAt - now <= (options.maxDurationMs ?? defaultMaxDurationMs) + maxFutureClockSkewMs;
}

function envValue(env: object, key: string): string | undefined {
  return (env as Record<string, string | undefined>)[key];
}

function timestampField(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
