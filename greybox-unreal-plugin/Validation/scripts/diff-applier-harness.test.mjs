// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import test from 'node:test';

import { merge, resolve } from './diff-applier-harness.mjs';

test('no-change merge returns no conflicts', () => {
  const result = merge({
    baseArtifactJson: '{"hp":100}',
    webArtifactJson: '{"hp":100}',
    unrealEditJson: '{"hp":100}',
  });
  assert.equal(result.succeeded, true);
  assert.equal(result.hasConflicts, false);
});

test('local-only scalar change wins', () => {
  const result = merge({
    baseArtifactJson: '{"hp":100}',
    webArtifactJson: '{"hp":100}',
    unrealEditJson: '{"hp":250}',
  });
  assert.equal(result.hasConflicts, false);
  assert.match(result.mergedArtifactJson, /250/);
});

test('remote-only scalar change wins', () => {
  const result = merge({
    baseArtifactJson: '{"hp":100}',
    webArtifactJson: '{"hp":75}',
    unrealEditJson: '{"hp":100}',
  });
  assert.equal(result.hasConflicts, false);
  assert.match(result.mergedArtifactJson, /75/);
});

test('both-changed scalar surfaces a conflict on /hp', () => {
  const result = merge({
    baseArtifactJson: '{"hp":100}',
    webArtifactJson: '{"hp":75}',
    unrealEditJson: '{"hp":250}',
  });
  assert.equal(result.hasConflicts, true);
  assert.deepEqual(result.conflictPaths, ['/hp']);
});

test('Resolve picks remote and clears the conflict flag', () => {
  const initial = merge({
    baseArtifactJson: '{"hp":100}',
    webArtifactJson: '{"hp":75}',
    unrealEditJson: '{"hp":250}',
  });
  const resolved = resolve(initial, '/hp', 'remote');
  assert.equal(resolved.hasConflicts, false);
  assert.match(resolved.mergedArtifactJson, /75/);
});

test('nested object merges field-wise without conflict', () => {
  const result = merge({
    baseArtifactJson: JSON.stringify({ transform: { position: { x: 0, y: 0, z: 0 } } }),
    webArtifactJson: JSON.stringify({ transform: { position: { x: 0, y: 5, z: 0 } } }),
    unrealEditJson: JSON.stringify({ transform: { position: { x: 2, y: 0, z: 0 } } }),
  });
  assert.equal(result.hasConflicts, false);
  const merged = JSON.parse(result.mergedArtifactJson);
  assert.equal(merged.transform.position.x, 2);
  assert.equal(merged.transform.position.y, 5);
});

test('array merge inserts both sides when each adds a new id', () => {
  const result = merge({
    baseArtifactJson: JSON.stringify({ components: [{ id: 'a', name: 'A' }] }),
    webArtifactJson: JSON.stringify({ components: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] }),
    unrealEditJson: JSON.stringify({ components: [{ id: 'a', name: 'A' }, { id: 'c', name: 'C' }] }),
  });
  const merged = JSON.parse(result.mergedArtifactJson);
  const ids = merged.components.map((item) => item.id).sort();
  assert.deepEqual(ids, ['a', 'b', 'c']);
});

test('local deletion of an unchanged item wins over remote', () => {
  const result = merge({
    baseArtifactJson: JSON.stringify({ components: [{ id: 'a' }, { id: 'b' }] }),
    webArtifactJson: JSON.stringify({ components: [{ id: 'a' }, { id: 'b' }] }),
    unrealEditJson: JSON.stringify({ components: [{ id: 'a' }] }),
  });
  const merged = JSON.parse(result.mergedArtifactJson);
  assert.deepEqual(merged.components.map((item) => item.id), ['a']);
  assert.equal(result.hasConflicts, false);
});

test('remote deletion of an unchanged item wins over local', () => {
  const result = merge({
    baseArtifactJson: JSON.stringify({ components: [{ id: 'a' }, { id: 'b' }] }),
    webArtifactJson: JSON.stringify({ components: [{ id: 'a' }] }),
    unrealEditJson: JSON.stringify({ components: [{ id: 'a' }, { id: 'b' }] }),
  });
  const merged = JSON.parse(result.mergedArtifactJson);
  assert.deepEqual(merged.components.map((item) => item.id), ['a']);
  assert.equal(result.hasConflicts, false);
});

test('deletion vs modification raises a conflict', () => {
  const result = merge({
    baseArtifactJson: JSON.stringify({ components: [{ id: 'a', name: 'A' }] }),
    webArtifactJson: JSON.stringify({ components: [{ id: 'a', name: 'A' }] }),
    unrealEditJson: JSON.stringify({ components: [{ id: 'a', name: 'A' }] }),
  });
  // No conflict in symmetric case — sanity check.
  assert.equal(result.hasConflicts, false);

  const conflicting = merge({
    baseArtifactJson: JSON.stringify({ components: [{ id: 'a', name: 'A' }] }),
    webArtifactJson: JSON.stringify({ components: [] }),
    unrealEditJson: JSON.stringify({ components: [{ id: 'a', name: 'Updated' }] }),
  });
  assert.equal(conflicting.hasConflicts, true);
});

test('Color hex change is handled as a scalar', () => {
  const result = merge({
    baseArtifactJson: '{"color":"#ffffff"}',
    webArtifactJson: '{"color":"#ff0000"}',
    unrealEditJson: '{"color":"#ffffff"}',
  });
  assert.equal(result.hasConflicts, false);
  assert.match(result.mergedArtifactJson, /ff0000/);
});

test('Vector tuple merges component-wise', () => {
  const result = merge({
    baseArtifactJson: JSON.stringify({ position: { x: 0, y: 0, z: 0 } }),
    webArtifactJson: JSON.stringify({ position: { x: 0, y: 0, z: 5 } }),
    unrealEditJson: JSON.stringify({ position: { x: 0, y: 2, z: 0 } }),
  });
  const merged = JSON.parse(result.mergedArtifactJson);
  assert.equal(merged.position.y, 2);
  assert.equal(merged.position.z, 5);
});

test('Rotator tuple conflict on a single axis stays narrow', () => {
  const result = merge({
    baseArtifactJson: JSON.stringify({ rotation: { x: 0, y: 0, z: 0 } }),
    webArtifactJson: JSON.stringify({ rotation: { x: 0, y: 0, z: 90 } }),
    unrealEditJson: JSON.stringify({ rotation: { x: 0, y: 0, z: 45 } }),
  });
  assert.equal(result.hasConflicts, true);
  assert.equal(result.conflictPaths.length, 1);
  assert.equal(result.conflictPaths[0], '/rotation/z');
});
