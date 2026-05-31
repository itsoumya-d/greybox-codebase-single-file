// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { generateAssetStoreVisuals } from './generate-asset-store-visuals.mjs';

test('Asset Store visual generator writes deterministic PNG dimensions', () => {
  const root = mkdtempSync(join(tmpdir(), 'greybox-asset-store-visuals-'));
  const assets = generateAssetStoreVisuals(root);

  assert.deepEqual(
    assets.map((asset) => [asset.file, asset.width, asset.height]),
    [
      ['Documentation~/asset-store/icon-1600.png', 1600, 1600],
      ['Documentation~/asset-store/cover-1950x1300.png', 1950, 1300],
      ['Documentation~/asset-store/screenshot-importers.png', 1600, 900],
      ['Documentation~/asset-store/screenshot-round-trip.png', 1600, 900],
      ['Documentation~/asset-store/screenshot-mcp-bridge.png', 1600, 900],
      ['Documentation~/asset-store/screenshot-samples.png', 1600, 900],
    ],
  );

  for (const asset of assets) {
    const png = readFileSync(join(root, asset.file));
    assert.deepEqual(png.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    assert.equal(png.readUInt32BE(16), asset.width);
    assert.equal(png.readUInt32BE(20), asset.height);
    assert.equal(asset.bytes, png.length);
    assert.match(asset.sha256, /^[a-f0-9]{64}$/u);
  }
});
