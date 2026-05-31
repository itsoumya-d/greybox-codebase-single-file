// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  hardenLicenseOptionsForProd,
  isProductionEnv,
  legacyPrefixFallbackExplicitlyEnabled,
} from '../src/security/licenseProdSafety.js';

function validBreakGlassEnv(): Record<string, string> {
  return {
    GREYBOX_CLOUD_ALLOW_PREFIX_FALLBACK: '1',
    GREYBOX_CLOUD_ALLOW_PREFIX_FALLBACK_REASON: 'Incident INC-1234 legacy license fallback rehearsal',
    GREYBOX_CLOUD_ALLOW_PREFIX_FALLBACK_EXPIRES_AT: '2026-05-23T12:00:00.000Z',
    GREYBOX_CLOUD_ALLOW_PREFIX_FALLBACK_NOW: '2026-05-23T00:00:00.000Z',
  };
}

describe('licenseProdSafety', () => {
  describe('isProductionEnv', () => {
    it('returns true only when NODE_ENV is the literal "production"', () => {
      assert.equal(isProductionEnv({ NODE_ENV: 'production' }), true);
      assert.equal(isProductionEnv({ NODE_ENV: 'PRODUCTION' }), true);
      assert.equal(isProductionEnv({ NODE_ENV: 'staging' }), false);
      assert.equal(isProductionEnv({ NODE_ENV: 'development' }), false);
      assert.equal(isProductionEnv({}), false);
    });
  });

  describe('legacyPrefixFallbackExplicitlyEnabled', () => {
    it('requires an exact, reasoned, time-bound break-glass', () => {
      assert.equal(legacyPrefixFallbackExplicitlyEnabled(validBreakGlassEnv()), true);
      assert.equal(legacyPrefixFallbackExplicitlyEnabled({ GREYBOX_CLOUD_ALLOW_PREFIX_FALLBACK: '1' }), false);
      assert.equal(legacyPrefixFallbackExplicitlyEnabled({ GREYBOX_CLOUD_ALLOW_PREFIX_FALLBACK: 'true' }), false);
      assert.equal(legacyPrefixFallbackExplicitlyEnabled({ GREYBOX_CLOUD_ALLOW_PREFIX_FALLBACK: 'yes' }), false);
      assert.equal(legacyPrefixFallbackExplicitlyEnabled({ GREYBOX_CLOUD_ALLOW_PREFIX_FALLBACK: ' 1 ' }), false);
      assert.equal(legacyPrefixFallbackExplicitlyEnabled({
        ...validBreakGlassEnv(),
        GREYBOX_CLOUD_ALLOW_PREFIX_FALLBACK_REASON: 'test',
      }), false);
      assert.equal(legacyPrefixFallbackExplicitlyEnabled({
        ...validBreakGlassEnv(),
        GREYBOX_CLOUD_ALLOW_PREFIX_FALLBACK_EXPIRES_AT: '2026-05-25T00:00:00.000Z',
      }), false);
      assert.equal(legacyPrefixFallbackExplicitlyEnabled({}), false);
    });
  });

  describe('hardenLicenseOptionsForProd', () => {
    it('passes options through unchanged outside production', () => {
      const opts = { allowPrefixFallback: true };
      assert.equal(hardenLicenseOptionsForProd(opts, { NODE_ENV: 'development' }), opts);
      assert.equal(hardenLicenseOptionsForProd(opts, {}), opts);
    });

    it('forces allowPrefixFallback=false in production by default', () => {
      const hardened = hardenLicenseOptionsForProd(
        { allowPrefixFallback: true },
        { NODE_ENV: 'production' },
      );
      assert.equal(hardened.allowPrefixFallback, false);
    });

    it('also forces allowPrefixFallback=false when the caller left it undefined', () => {
      const hardened = hardenLicenseOptionsForProd(
        {} as { allowPrefixFallback?: boolean },
        { NODE_ENV: 'production' },
      );
      assert.equal(hardened.allowPrefixFallback, false);
    });

    it('respects the explicit opt-in env var in production', () => {
      const hardened = hardenLicenseOptionsForProd(
        { allowPrefixFallback: true },
        { NODE_ENV: 'production', ...validBreakGlassEnv() },
      );
      assert.equal(hardened.allowPrefixFallback, true);
    });

    it('preserves caller-supplied records/signingKeys', () => {
      const records = [{ tokenHash: 'abc', tier: 'pro' as const }];
      const signingKeys = new Map();
      const hardened = hardenLicenseOptionsForProd(
        { records, signingKeys, allowPrefixFallback: true },
        { NODE_ENV: 'production' },
      );
      assert.equal(hardened.records, records);
      assert.equal(hardened.signingKeys, signingKeys);
      assert.equal(hardened.allowPrefixFallback, false);
    });
  });
});
