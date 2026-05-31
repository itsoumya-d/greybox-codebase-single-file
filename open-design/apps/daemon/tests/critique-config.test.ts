import { describe, it, expect } from 'vitest';
import { defaultCritiqueConfig } from '@ai-game-design-studio/contracts/critique';
import { loadCritiqueConfigFromEnv } from '../src/critique/config.js';

describe('loadCritiqueConfigFromEnv', () => {
  it('returns defaults when env is empty', () => {
    const cfg = loadCritiqueConfigFromEnv({});
    const defaults = defaultCritiqueConfig();
    expect(cfg).toEqual(defaults);
  });

  it('AGDS_CRITIQUE_ENABLED=true enables the feature', () => {
    const cfg = loadCritiqueConfigFromEnv({ AGDS_CRITIQUE_ENABLED: 'true' });
    expect(cfg.enabled).toBe(true);
  });

  it('AGDS_CRITIQUE_* values map correctly together', () => {
    const cfg = loadCritiqueConfigFromEnv({
      AGDS_CRITIQUE_ENABLED: '1',
      AGDS_CRITIQUE_MAX_ROUNDS: '4',
      AGDS_CRITIQUE_SCORE_THRESHOLD: '7',
      AGDS_CRITIQUE_SCORE_SCALE: '10',
      AGDS_CRITIQUE_PER_ROUND_TIMEOUT_MS: '45000',
      AGDS_CRITIQUE_TOTAL_TIMEOUT_MS: '180000',
      AGDS_CRITIQUE_PARSER_MAX_BLOCK_BYTES: '524288',
      AGDS_CRITIQUE_FALLBACK_POLICY: 'ship_last',
    });
    expect(cfg.enabled).toBe(true);
    expect(cfg.maxRounds).toBe(4);
    expect(cfg.scoreThreshold).toBeCloseTo(7);
    expect(cfg.scoreScale).toBe(10);
    expect(cfg.perRoundTimeoutMs).toBe(45000);
    expect(cfg.totalTimeoutMs).toBe(180000);
    expect(cfg.parserMaxBlockBytes).toBe(524288);
    expect(cfg.fallbackPolicy).toBe('ship_last');
  });

  it('uses AGDS_CRITIQUE_* when deprecated aliases are also present', () => {
    const cfg = loadCritiqueConfigFromEnv({
      AGDS_CRITIQUE_MAX_ROUNDS: '6',
      OD_CRITIQUE_MAX_ROUNDS: '2',
    });
    expect(cfg.maxRounds).toBe(6);
  });

  it('ignores deprecated OD_CRITIQUE_* values', () => {
    const cfg = loadCritiqueConfigFromEnv({
      OD_CRITIQUE_ENABLED: '1',
      OD_CRITIQUE_MAX_ROUNDS: '4',
      OD_CRITIQUE_SCORE_THRESHOLD: '7',
      OD_CRITIQUE_SCORE_SCALE: '10',
      OD_CRITIQUE_PER_ROUND_TIMEOUT_MS: '45000',
      OD_CRITIQUE_TOTAL_TIMEOUT_MS: '180000',
      OD_CRITIQUE_PARSER_MAX_BLOCK_BYTES: '524288',
      OD_CRITIQUE_FALLBACK_POLICY: 'ship_last',
    });
    expect(cfg).toEqual(defaultCritiqueConfig());
  });

  // Invalid AGDS values throw RangeError at boot.
  it('non-numeric AGDS_CRITIQUE_MAX_ROUNDS throws RangeError', () => {
    expect(() => loadCritiqueConfigFromEnv({ AGDS_CRITIQUE_MAX_ROUNDS: 'abc' })).toThrow(RangeError);
  });

  it('negative AGDS_CRITIQUE_MAX_ROUNDS throws RangeError', () => {
    expect(() => loadCritiqueConfigFromEnv({ AGDS_CRITIQUE_MAX_ROUNDS: '-1' })).toThrow(RangeError);
  });

  it('zero AGDS_CRITIQUE_MAX_ROUNDS throws RangeError', () => {
    expect(() => loadCritiqueConfigFromEnv({ AGDS_CRITIQUE_MAX_ROUNDS: '0' })).toThrow(RangeError);
  });

  it('non-numeric AGDS_CRITIQUE_SCORE_THRESHOLD throws RangeError', () => {
    expect(() => loadCritiqueConfigFromEnv({ AGDS_CRITIQUE_SCORE_THRESHOLD: 'high' })).toThrow(RangeError);
  });

  it('negative AGDS_CRITIQUE_SCORE_THRESHOLD throws RangeError', () => {
    expect(() => loadCritiqueConfigFromEnv({ AGDS_CRITIQUE_SCORE_THRESHOLD: '-1' })).toThrow(RangeError);
  });

  it('non-numeric AGDS_CRITIQUE_PER_ROUND_TIMEOUT_MS throws RangeError', () => {
    expect(() => loadCritiqueConfigFromEnv({ AGDS_CRITIQUE_PER_ROUND_TIMEOUT_MS: 'fast' })).toThrow(RangeError);
  });

  it('invalid AGDS_CRITIQUE_FALLBACK_POLICY throws RangeError', () => {
    expect(() => loadCritiqueConfigFromEnv({ AGDS_CRITIQUE_FALLBACK_POLICY: 'maybe' })).toThrow(RangeError);
  });

  it('invalid deprecated OD_CRITIQUE_* values are ignored', () => {
    expect(() => loadCritiqueConfigFromEnv({
      OD_CRITIQUE_MAX_ROUNDS: 'abc',
      OD_CRITIQUE_FALLBACK_POLICY: 'maybe',
    })).not.toThrow();
  });

  it('threshold exceeding scale throws RangeError', () => {
    expect(() =>
      loadCritiqueConfigFromEnv({
        AGDS_CRITIQUE_SCORE_THRESHOLD: '15',
        AGDS_CRITIQUE_SCORE_SCALE: '10',
      }),
    ).toThrow(RangeError);
  });

  it('valid threshold equal to scale passes', () => {
    const cfg = loadCritiqueConfigFromEnv({
      AGDS_CRITIQUE_SCORE_THRESHOLD: '10',
      AGDS_CRITIQUE_SCORE_SCALE: '10',
    });
    expect(cfg.scoreThreshold).toBe(10);
    expect(cfg.scoreScale).toBe(10);
  });
});
