// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import test from 'node:test';

import { isPublicPath } from '../lib/proxy-policy';

test('isPublicPath allows catalog without admin token', () => {
  assert.equal(isPublicPath('/v1/marketplace/catalog', ''), true);
  assert.equal(isPublicPath('/v1/marketplace/catalog', '?q=tactics'), true);
});

test('isPublicPath allows published listings only', () => {
  assert.equal(isPublicPath('/v1/marketplace/listings', '?status=published'), true);
  assert.equal(isPublicPath('/v1/marketplace/listings', '?status=draft'), false);
  assert.equal(isPublicPath('/v1/marketplace/listings', ''), false);
});

test('isPublicPath allows creator storefronts', () => {
  assert.equal(isPublicPath('/v1/marketplace/creators/creator-1/storefront', ''), true);
});

test('isPublicPath blocks admin routes', () => {
  assert.equal(isPublicPath('/v1/marketplace/stats', ''), false);
  assert.equal(isPublicPath('/v1/marketplace/review-dashboard', ''), false);
  assert.equal(isPublicPath('/v1/marketplace/creators/creator-1/payout-readiness', ''), false);
});

test('isPublicPath allows health endpoints', () => {
  assert.equal(isPublicPath('/health', ''), true);
  assert.equal(isPublicPath('/healthz', ''), true);
  assert.equal(isPublicPath('/readyz', ''), true);
});
