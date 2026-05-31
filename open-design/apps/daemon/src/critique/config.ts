import { defaultCritiqueConfig, FALLBACK_POLICIES } from '@ai-game-design-studio/contracts/critique';
import type { CritiqueConfig } from '@ai-game-design-studio/contracts/critique';

/**
 * Load CritiqueConfig from process.env. Keys map 1:1 to AGDS_CRITIQUE_*.
 * Missing values fall back to defaultCritiqueConfig(). Invalid values
 * (non-numeric, negative, out-of-range) throw RangeError so misconfig
 * surfaces at boot, never silently.
 *
 * @see specs/current/critique-theater.md § Configuration (env vars)
 */
export function loadCritiqueConfigFromEnv(env: NodeJS.ProcessEnv = process.env): CritiqueConfig {
  const defaults = defaultCritiqueConfig();

  const enabledEnv = readCritiqueEnv(env, 'ENABLED');
  const maxRoundsEnv = readCritiqueEnv(env, 'MAX_ROUNDS');
  const scoreThresholdEnv = readCritiqueEnv(env, 'SCORE_THRESHOLD');
  const scoreScaleEnv = readCritiqueEnv(env, 'SCORE_SCALE');
  const perRoundTimeoutEnv = readCritiqueEnv(env, 'PER_ROUND_TIMEOUT_MS');
  const totalTimeoutEnv = readCritiqueEnv(env, 'TOTAL_TIMEOUT_MS');
  const parserMaxBlockBytesEnv = readCritiqueEnv(env, 'PARSER_MAX_BLOCK_BYTES');
  const fallbackPolicyEnv = readCritiqueEnv(env, 'FALLBACK_POLICY');

  const enabled = parseEnabled(enabledEnv.raw, defaults.enabled);
  const maxRounds = parsePositiveInt(maxRoundsEnv.key, maxRoundsEnv.raw, defaults.maxRounds);
  const scoreThreshold = parseNonNegativeFloat(scoreThresholdEnv.key, scoreThresholdEnv.raw, defaults.scoreThreshold);
  const scoreScale = parsePositiveInt(scoreScaleEnv.key, scoreScaleEnv.raw, defaults.scoreScale);
  const perRoundTimeoutMs = parsePositiveInt(perRoundTimeoutEnv.key, perRoundTimeoutEnv.raw, defaults.perRoundTimeoutMs);
  const totalTimeoutMs = parsePositiveInt(totalTimeoutEnv.key, totalTimeoutEnv.raw, defaults.totalTimeoutMs);
  const parserMaxBlockBytes = parsePositiveInt(parserMaxBlockBytesEnv.key, parserMaxBlockBytesEnv.raw, defaults.parserMaxBlockBytes);
  const fallbackPolicy = parseFallbackPolicy(fallbackPolicyEnv.key, fallbackPolicyEnv.raw, defaults.fallbackPolicy);

  // Cross-field validation: threshold cannot exceed scale.
  if (scoreThreshold > scoreScale + 1e-9) {
    throw new RangeError(
      `AGDS_CRITIQUE_SCORE_THRESHOLD (${scoreThreshold}) must be <= AGDS_CRITIQUE_SCORE_SCALE (${scoreScale})`,
    );
  }

  return {
    ...defaults,
    enabled,
    maxRounds,
    scoreThreshold,
    scoreScale,
    perRoundTimeoutMs,
    totalTimeoutMs,
    parserMaxBlockBytes,
    fallbackPolicy,
  };
}

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

function readCritiqueEnv(env: NodeJS.ProcessEnv, suffix: string): { key: string; raw: string | undefined } {
  const canonical = `AGDS_CRITIQUE_${suffix}`;
  return {
    key: canonical,
    raw: env[canonical],
  };
}

function parseEnabled(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined) return fallback;
  const v = raw.trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes';
}

function parsePositiveInt(key: string, raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) {
    throw new RangeError(
      `${key} must be a positive integer, got "${raw}"`,
    );
  }
  return n;
}

function parseNonNegativeFloat(key: string, raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    throw new RangeError(
      `${key} must be a non-negative finite number, got "${raw}"`,
    );
  }
  return n;
}

function parseFallbackPolicy(
  key: string,
  raw: string | undefined,
  fallback: CritiqueConfig['fallbackPolicy'],
): CritiqueConfig['fallbackPolicy'] {
  if (raw === undefined) return fallback;
  const trimmed = raw.trim();
  if (FALLBACK_POLICIES.includes(trimmed as CritiqueConfig['fallbackPolicy'])) {
    return trimmed as CritiqueConfig['fallbackPolicy'];
  }
  throw new RangeError(
    `${key} must be one of ${FALLBACK_POLICIES.join(', ')}, got "${raw}"`,
  );
}
