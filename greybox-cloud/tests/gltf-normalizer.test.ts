// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canonicalAnimationLabel,
  mapJointName,
  MIXAMO_STANDARD_JOINTS,
  normalizeSkeleton,
  validateAndNormalizeGltf,
  validateGltf,
  type GltfJson,
} from '../src/providers/character-gen/gltf-normalizer.js';
import { CharacterGenUpstreamError } from '../src/providers/character-gen/types.js';

/**
 * Build a minimal GLB buffer wrapping the given JSON. We only emit a JSON
 * chunk (no BIN chunk) because the normalizer only inspects JSON.
 */
function buildGlb(json: GltfJson): Uint8Array {
  const jsonText = JSON.stringify(json);
  // glTF requires JSON chunks padded to 4-byte boundaries with spaces.
  const padded = jsonText + ' '.repeat((4 - (jsonText.length % 4)) % 4);
  const jsonBytes = Buffer.from(padded, 'utf8');
  const totalLength = 12 + 8 + jsonBytes.byteLength;
  const buffer = Buffer.alloc(totalLength);
  buffer.writeUInt32LE(0x46546c67, 0); // magic 'glTF'
  buffer.writeUInt32LE(2, 4); // version
  buffer.writeUInt32LE(totalLength, 8);
  buffer.writeUInt32LE(jsonBytes.byteLength, 12);
  buffer.writeUInt32LE(0x4e4f534a, 16); // 'JSON'
  jsonBytes.copy(buffer, 20);
  return new Uint8Array(buffer);
}

test('validateGltf rejects non-GLB buffers', () => {
  const garbage = new Uint8Array([1, 2, 3, 4, 5]);
  const result = validateGltf(garbage);
  assert.equal(result.ok, false);
  assert.ok(result.errors.length > 0);
});

test('validateGltf rejects oversized buffers', () => {
  const huge = new Uint8Array(33 * 1024 * 1024); // 33 MiB
  const result = validateGltf(huge);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /maximum allowed size/u);
});

test('validateGltf accepts a minimal valid GLB and parses JSON', () => {
  const json: GltfJson = {
    asset: { version: '2.0', generator: 'test' },
    nodes: [{ name: 'Root', children: [] }],
  };
  const buffer = buildGlb(json);
  const result = validateGltf(buffer);
  assert.equal(result.ok, true);
  assert.equal(result.json?.asset?.version, '2.0');
  assert.equal(result.json?.nodes?.[0]?.name, 'Root');
});

test('validateGltf flags wrong version', () => {
  const buffer = buildGlb({ asset: { version: '2.0' }, nodes: [] });
  // Overwrite version field with 99.
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  view.setUint32(4, 99, true);
  const result = validateGltf(buffer);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /unsupported glb version/u);
});

test('mapJointName recognises Mixamo source, RPM, and Unreal-style joint names', () => {
  // Exact Mixamo source — identity.
  for (const joint of MIXAMO_STANDARD_JOINTS) {
    assert.equal(mapJointName(joint), joint, `identity should hold for ${joint}`);
  }
  // RPM-style snake_case.
  assert.equal(mapJointName('left_upper_arm'), 'mixamorig:LeftArm');
  assert.equal(mapJointName('right_lower_leg'), 'mixamorig:RightLeg');
  // Unreal-style.
  assert.equal(mapJointName('clavicle_l'), 'mixamorig:LeftShoulder');
  assert.equal(mapJointName('upperarm_r'), 'mixamorig:RightArm');
  assert.equal(mapJointName('thigh_l'), 'mixamorig:LeftUpLeg');
  // Aliases.
  assert.equal(mapJointName('hips'), 'mixamorig:Hips');
  assert.equal(mapJointName('chest'), 'mixamorig:Spine2');
  assert.equal(mapJointName('head'), 'mixamorig:Head');
  // Unknown joint -> undefined.
  assert.equal(mapJointName('left_pinky_intermediate'), undefined);
});

test('normalizeSkeleton maps joints in a Mixamo-rigged GLB cleanly', () => {
  const json: GltfJson = {
    nodes: [
      { name: 'Armature', children: [1] },
      { name: 'mixamorig:Hips', children: [2, 3] },
      { name: 'mixamorig:Spine', children: [] },
      { name: 'mixamorig:LeftUpLeg', children: [] },
    ],
    skins: [{ joints: [1, 2, 3], name: 'skin' }],
  };
  const skeleton = normalizeSkeleton(json);
  const names = skeleton.joints.map((j) => j.mixamoName);
  assert.deepEqual(
    names.sort(),
    ['mixamorig:Hips', 'mixamorig:LeftUpLeg', 'mixamorig:Spine'].sort(),
  );
  assert.equal(skeleton.unmappedJoints.length, 0);
});

test('normalizeSkeleton flags non-Mixamo joints as warnings', () => {
  const json: GltfJson = {
    nodes: [
      { name: 'root', children: [1] },
      { name: 'left_upper_arm', children: [2] },
      { name: 'tentacle_left_01', children: [] },
    ],
    skins: [{ joints: [0, 1, 2] }],
  };
  const skeleton = normalizeSkeleton(json);
  assert.ok(skeleton.unmappedJoints.includes('tentacle_left_01'));
  assert.ok(skeleton.joints.find((j) => j.sourceName === 'left_upper_arm')?.mixamoName === 'mixamorig:LeftArm');
  assert.ok(skeleton.warnings.some((w) => w.includes('could not be mapped')));
});

test('normalizeSkeleton finds animations and labels them', () => {
  const json: GltfJson = {
    nodes: [{ name: 'mixamorig:Hips' }],
    skins: [{ joints: [0] }],
    animations: [
      { name: 'character_idle', channels: [], samplers: [{ input: 0 }] },
      { name: 'walk_forward', channels: [], samplers: [{ input: 1 }] },
      { name: 'attack_swing', channels: [], samplers: [{ input: 2 }] },
      { name: 'unknown_clip', channels: [], samplers: [] },
    ],
    accessors: [
      { max: [1.5], count: 30 },
      { max: [2.4], count: 50 },
      { max: [0.8], count: 16 },
    ],
  };
  const skeleton = normalizeSkeleton(json);
  const byLabel = new Map(skeleton.animations.map((c) => [c.sourceName, c]));
  assert.equal(byLabel.get('character_idle')?.canonicalLabel, 'idle');
  assert.equal(byLabel.get('walk_forward')?.canonicalLabel, 'walk');
  assert.equal(byLabel.get('attack_swing')?.canonicalLabel, 'attack');
  assert.equal(byLabel.get('unknown_clip')?.canonicalLabel, undefined);
  assert.equal(byLabel.get('character_idle')?.duration, 1.5);
});

test('canonicalAnimationLabel uses word-boundaries', () => {
  assert.equal(canonicalAnimationLabel('idle_loop'), 'idle');
  assert.equal(canonicalAnimationLabel('walk-cycle'), 'walk');
  assert.equal(canonicalAnimationLabel('runAction'), undefined); // no boundary
  assert.equal(canonicalAnimationLabel('attack-light'), 'attack');
});

test('validateAndNormalizeGltf throws on malformed glb', () => {
  assert.throws(() => validateAndNormalizeGltf(new Uint8Array([0, 0, 0, 0])), CharacterGenUpstreamError);
});

test('validateAndNormalizeGltf normalizes a valid skeleton+animation glb', () => {
  const buffer = buildGlb({
    asset: { version: '2.0' },
    nodes: [
      { name: 'Armature', children: [1] },
      { name: 'mixamorig:Hips' },
    ],
    skins: [{ joints: [1] }],
    animations: [{ name: 'idle', samplers: [{ input: 0 }] }],
    accessors: [{ max: [2.0] }],
  });
  const { validation, skeleton } = validateAndNormalizeGltf(buffer);
  assert.equal(validation.ok, true);
  assert.equal(skeleton.joints.length, 1);
  assert.equal(skeleton.joints[0]?.mixamoName, 'mixamorig:Hips');
  assert.equal(skeleton.animations[0]?.canonicalLabel, 'idle');
  assert.equal(skeleton.animations[0]?.duration, 2.0);
});
