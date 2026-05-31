// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

// Lightweight glTF/.glb inspector + skeleton normaliser.
//
// We deliberately do not pull in `@gltf-transform/core` (would push us
// into a heavier dep + I/O surface we don't want at the cloud edge).
// Instead, this module parses the GLB container header and the embedded
// JSON chunk directly. That is sufficient for the two things we need:
//
//   1. Validate that the file is a real GLB (magic, version, chunk shape).
//   2. Inspect node names + animation channel targets so we can map
//      provider-specific joint names onto the Mixamo canonical set and
//      label common animation clips (idle / walk / run / jump / attack).
//
// Mesh data is *not* parsed. We only care about the lightweight JSON.

import { CharacterGenUpstreamError } from './types.js';

/** Maximum size we'll accept for a generated character .glb (32 MiB). */
const MAX_GLB_BYTES = 32 * 1024 * 1024;

const GLB_MAGIC = 0x46546c67; // 'glTF' little-endian
const CHUNK_TYPE_JSON = 0x4e4f534a; // 'JSON' little-endian
const CHUNK_TYPE_BIN = 0x004e4942; // 'BIN\0' little-endian

/**
 * Canonical Mixamo joint set. Copied verbatim from
 * `open-design/packages/schema/src/character.ts`. Keep in sync.
 */
export const MIXAMO_STANDARD_JOINTS: readonly string[] = [
  'mixamorig:Hips',
  'mixamorig:Spine',
  'mixamorig:Spine1',
  'mixamorig:Spine2',
  'mixamorig:Neck',
  'mixamorig:Head',
  'mixamorig:HeadTop_End',
  'mixamorig:LeftShoulder',
  'mixamorig:LeftArm',
  'mixamorig:LeftForeArm',
  'mixamorig:LeftHand',
  'mixamorig:RightShoulder',
  'mixamorig:RightArm',
  'mixamorig:RightForeArm',
  'mixamorig:RightHand',
  'mixamorig:LeftUpLeg',
  'mixamorig:LeftLeg',
  'mixamorig:LeftFoot',
  'mixamorig:LeftToeBase',
  'mixamorig:LeftToe_End',
  'mixamorig:RightUpLeg',
  'mixamorig:RightLeg',
  'mixamorig:RightFoot',
  'mixamorig:RightToeBase',
  'mixamorig:RightToe_End',
];

const MIXAMO_SET = new Set(MIXAMO_STANDARD_JOINTS);

/** Canonical animation clip labels we try to recover from clip names. */
export const STANDARD_ANIMATION_LABELS = ['idle', 'walk', 'run', 'jump', 'attack'] as const;
export type StandardAnimationLabel = typeof STANDARD_ANIMATION_LABELS[number];

/**
 * Mapping from common provider/Tripo/Mixamo source joint names to Mixamo
 * canonical names. Generated/hand-curated based on observed outputs.
 *
 * Matching is *case-insensitive* and tolerates the common alternative
 * separators (underscore, dot, dash) so we handle 'left_upper_arm' the
 * same way as 'LeftUpperArm'.
 */
const JOINT_ALIASES: ReadonlyMap<string, string> = new Map<string, string>([
  // Identity (Mixamo source) — we still allow case mismatch via normalise().
  ...MIXAMO_STANDARD_JOINTS.map((name) => [normalise(name), name] as const),

  // Tripo3D / Ready Player Me / generic style names.
  [normalise('hips'), 'mixamorig:Hips'],
  [normalise('pelvis'), 'mixamorig:Hips'],
  [normalise('root'), 'mixamorig:Hips'],
  [normalise('Armature'), 'mixamorig:Hips'],
  [normalise('spine'), 'mixamorig:Spine'],
  [normalise('spine_01'), 'mixamorig:Spine'],
  [normalise('spine1'), 'mixamorig:Spine1'],
  [normalise('spine_02'), 'mixamorig:Spine1'],
  [normalise('spine2'), 'mixamorig:Spine2'],
  [normalise('spine_03'), 'mixamorig:Spine2'],
  [normalise('chest'), 'mixamorig:Spine2'],
  [normalise('upper_chest'), 'mixamorig:Spine2'],
  [normalise('neck'), 'mixamorig:Neck'],
  [normalise('neck_01'), 'mixamorig:Neck'],
  [normalise('head'), 'mixamorig:Head'],
  [normalise('head_top'), 'mixamorig:HeadTop_End'],
  [normalise('head_end'), 'mixamorig:HeadTop_End'],

  // Arms — left
  [normalise('LeftShoulder'), 'mixamorig:LeftShoulder'],
  [normalise('left_shoulder'), 'mixamorig:LeftShoulder'],
  [normalise('clavicle_l'), 'mixamorig:LeftShoulder'],
  [normalise('LeftArm'), 'mixamorig:LeftArm'],
  [normalise('left_upper_arm'), 'mixamorig:LeftArm'],
  [normalise('upperarm_l'), 'mixamorig:LeftArm'],
  [normalise('LeftForeArm'), 'mixamorig:LeftForeArm'],
  [normalise('left_lower_arm'), 'mixamorig:LeftForeArm'],
  [normalise('lowerarm_l'), 'mixamorig:LeftForeArm'],
  [normalise('LeftHand'), 'mixamorig:LeftHand'],
  [normalise('left_hand'), 'mixamorig:LeftHand'],
  [normalise('hand_l'), 'mixamorig:LeftHand'],

  // Arms — right
  [normalise('RightShoulder'), 'mixamorig:RightShoulder'],
  [normalise('right_shoulder'), 'mixamorig:RightShoulder'],
  [normalise('clavicle_r'), 'mixamorig:RightShoulder'],
  [normalise('RightArm'), 'mixamorig:RightArm'],
  [normalise('right_upper_arm'), 'mixamorig:RightArm'],
  [normalise('upperarm_r'), 'mixamorig:RightArm'],
  [normalise('RightForeArm'), 'mixamorig:RightForeArm'],
  [normalise('right_lower_arm'), 'mixamorig:RightForeArm'],
  [normalise('lowerarm_r'), 'mixamorig:RightForeArm'],
  [normalise('RightHand'), 'mixamorig:RightHand'],
  [normalise('right_hand'), 'mixamorig:RightHand'],
  [normalise('hand_r'), 'mixamorig:RightHand'],

  // Legs — left
  [normalise('LeftUpLeg'), 'mixamorig:LeftUpLeg'],
  [normalise('left_upper_leg'), 'mixamorig:LeftUpLeg'],
  [normalise('thigh_l'), 'mixamorig:LeftUpLeg'],
  [normalise('LeftLeg'), 'mixamorig:LeftLeg'],
  [normalise('left_lower_leg'), 'mixamorig:LeftLeg'],
  [normalise('calf_l'), 'mixamorig:LeftLeg'],
  [normalise('LeftFoot'), 'mixamorig:LeftFoot'],
  [normalise('left_foot'), 'mixamorig:LeftFoot'],
  [normalise('foot_l'), 'mixamorig:LeftFoot'],
  [normalise('LeftToeBase'), 'mixamorig:LeftToeBase'],
  [normalise('left_toe'), 'mixamorig:LeftToeBase'],

  // Legs — right
  [normalise('RightUpLeg'), 'mixamorig:RightUpLeg'],
  [normalise('right_upper_leg'), 'mixamorig:RightUpLeg'],
  [normalise('thigh_r'), 'mixamorig:RightUpLeg'],
  [normalise('RightLeg'), 'mixamorig:RightLeg'],
  [normalise('right_lower_leg'), 'mixamorig:RightLeg'],
  [normalise('calf_r'), 'mixamorig:RightLeg'],
  [normalise('RightFoot'), 'mixamorig:RightFoot'],
  [normalise('right_foot'), 'mixamorig:RightFoot'],
  [normalise('foot_r'), 'mixamorig:RightFoot'],
  [normalise('RightToeBase'), 'mixamorig:RightToeBase'],
  [normalise('right_toe'), 'mixamorig:RightToeBase'],
]);

/**
 * Normalize a joint name for matching: lowercase, strip 'mixamorig:'
 * prefix, replace separators with underscores, collapse repeats.
 */
function normalise(name: string): string {
  return name
    .toLowerCase()
    .replace(/^mixamorig[:_-]/u, '')
    .replace(/[\s.\-:]+/gu, '_')
    .replace(/_+/gu, '_')
    .trim();
}

export interface GltfJointInfo {
  /** Name as found in the source file. */
  sourceName: string;
  /** Mapped Mixamo name (or undefined if unmapped). */
  mixamoName?: string;
  /** Parent joint *source* name, or null for the root. */
  parent: string | null;
}

export interface GltfAnimationClipInfo {
  /** Name as found in the source file. */
  sourceName: string;
  /** Mapped canonical label (or undefined). */
  canonicalLabel?: StandardAnimationLabel;
  /** Clip duration in seconds; undefined when the GLB doesn't expose it. */
  duration?: number;
  /** Whether the clip is meant to loop (best-effort heuristic). */
  loop: boolean;
}

export interface GltfValidationResult {
  /** True if the buffer is a structurally-valid GLB. */
  ok: boolean;
  /** Hex sha256 of the buffer for caching / dedup. */
  sha256?: string;
  /** Raw byte length. */
  sizeBytes: number;
  /** Parsed JSON chunk; only present on success. */
  json?: GltfJson;
  /** Hard errors (file is unusable). */
  errors: string[];
  /** Soft issues that should be surfaced to the user but don't block. */
  warnings: string[];
}

export interface NormalizedSkeleton {
  /** All joints, in source order, with mapped names where possible. */
  joints: GltfJointInfo[];
  /** Joints whose source name is *not* in the Mixamo canonical set. */
  unmappedJoints: string[];
  /** Animation clips with best-effort canonical labels. */
  animations: GltfAnimationClipInfo[];
  /** Soft warnings the UI should show next to the imported character. */
  warnings: string[];
}

export interface GltfJson {
  asset?: { version?: string; generator?: string };
  nodes?: Array<{ name?: string; children?: number[] }>;
  skins?: Array<{ joints?: number[]; name?: string }>;
  animations?: Array<{
    name?: string;
    channels?: Array<{ target?: { node?: number; path?: string } }>;
    samplers?: Array<{ input?: number; output?: number; interpolation?: string }>;
  }>;
  accessors?: Array<{ max?: number[]; count?: number }>;
}

/**
 * Parse a binary glTF (`.glb`) buffer and report structural validity. The
 * function never throws on malformed input — it returns `ok: false` with
 * `errors`. This lets callers (the router) decide whether to fail import
 * or to continue with a warning.
 */
export function validateGltf(buffer: Uint8Array): GltfValidationResult {
  const sizeBytes = buffer.byteLength;
  const errors: string[] = [];
  const warnings: string[] = [];

  if (sizeBytes > MAX_GLB_BYTES) {
    errors.push(`glb exceeds maximum allowed size of ${MAX_GLB_BYTES} bytes (got ${sizeBytes})`);
    return { ok: false, sizeBytes, errors, warnings };
  }
  if (sizeBytes < 12) {
    errors.push('glb header too small (need >=12 bytes)');
    return { ok: false, sizeBytes, errors, warnings };
  }

  // Header is little-endian: u32 magic, u32 version, u32 totalLength.
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const magic = view.getUint32(0, true);
  const version = view.getUint32(4, true);
  const totalLength = view.getUint32(8, true);

  if (magic !== GLB_MAGIC) {
    errors.push('not a binary glTF (magic mismatch)');
    return { ok: false, sizeBytes, errors, warnings };
  }
  if (version !== 2) {
    errors.push(`unsupported glb version ${version} (expected 2)`);
    return { ok: false, sizeBytes, errors, warnings };
  }
  if (totalLength !== sizeBytes) {
    warnings.push(`glb declared length ${totalLength} != buffer length ${sizeBytes}`);
  }

  // Read first chunk (must be JSON).
  if (sizeBytes < 20) {
    errors.push('glb missing JSON chunk');
    return { ok: false, sizeBytes, errors, warnings };
  }
  const jsonChunkLength = view.getUint32(12, true);
  const jsonChunkType = view.getUint32(16, true);
  if (jsonChunkType !== CHUNK_TYPE_JSON) {
    errors.push('first chunk must be JSON');
    return { ok: false, sizeBytes, errors, warnings };
  }
  const jsonStart = 20;
  const jsonEnd = jsonStart + jsonChunkLength;
  if (jsonEnd > sizeBytes) {
    errors.push('JSON chunk overruns buffer');
    return { ok: false, sizeBytes, errors, warnings };
  }
  let json: GltfJson;
  try {
    const text = new TextDecoder('utf-8').decode(buffer.subarray(jsonStart, jsonEnd));
    json = JSON.parse(text);
  } catch (error) {
    errors.push(`JSON chunk parse failed: ${error instanceof Error ? error.message : String(error)}`);
    return { ok: false, sizeBytes, errors, warnings };
  }

  // Optional BIN chunk.
  if (jsonEnd + 8 <= sizeBytes) {
    const binChunkLength = view.getUint32(jsonEnd, true);
    const binChunkType = view.getUint32(jsonEnd + 4, true);
    if (binChunkType !== CHUNK_TYPE_BIN) {
      warnings.push('second chunk is not BIN');
    }
    if (jsonEnd + 8 + binChunkLength > sizeBytes) {
      warnings.push('BIN chunk overruns buffer (may indicate truncation)');
    }
  }

  if (json.asset?.version && json.asset.version !== '2.0') {
    warnings.push(`unexpected asset.version ${json.asset.version}; expected "2.0"`);
  }
  if (!Array.isArray(json.nodes) || json.nodes.length === 0) {
    warnings.push('glb has no nodes');
  }

  return {
    ok: true,
    sizeBytes,
    json,
    errors,
    warnings,
  };
}

/**
 * Inspect a parsed GLB JSON for skeleton + animations and produce a
 * normalised view: Mixamo-mapped joint names, canonical animation
 * labels, and any soft warnings worth surfacing.
 *
 * Pure: takes JSON only; safe to call in isolation in tests.
 */
export function normalizeSkeleton(json: GltfJson): NormalizedSkeleton {
  const warnings: string[] = [];
  const nodes = Array.isArray(json.nodes) ? json.nodes : [];
  const skinJoints = collectSkinJoints(json, nodes.length);
  const parentByIndex = computeParentMap(nodes);

  const joints: GltfJointInfo[] = skinJoints.map((nodeIndex) => {
    const node = nodes[nodeIndex];
    const sourceName = typeof node?.name === 'string' && node.name.trim()
      ? node.name.trim()
      : `node_${nodeIndex}`;
    const mapped = mapJointName(sourceName);
    const parentIndex = parentByIndex.get(nodeIndex);
    const parentSourceName = parentIndex !== undefined
      ? (typeof nodes[parentIndex]?.name === 'string' && nodes[parentIndex]?.name?.trim()
        ? nodes[parentIndex]?.name?.trim() ?? null
        : `node_${parentIndex}`)
      : null;
    return {
      sourceName,
      ...(mapped ? { mixamoName: mapped } : {}),
      parent: parentSourceName,
    };
  });

  const unmappedJoints = joints
    .filter((joint) => !joint.mixamoName)
    .map((joint) => joint.sourceName);

  if (joints.length === 0) {
    warnings.push('no skeleton joints found; rig retargeting will be skipped');
  } else if (unmappedJoints.length > 0) {
    const sample = unmappedJoints.slice(0, 5).join(', ');
    warnings.push(
      `${unmappedJoints.length} joint(s) could not be mapped to Mixamo canonical names (e.g. ${sample}); animations may not retarget cleanly`,
    );
  }

  const animations = normalizeAnimations(json, warnings);

  return { joints, unmappedJoints, animations, warnings };
}

function collectSkinJoints(json: GltfJson, nodeCount: number): number[] {
  const skins = Array.isArray(json.skins) ? json.skins : [];
  const seen = new Set<number>();
  const ordered: number[] = [];
  for (const skin of skins) {
    if (!Array.isArray(skin.joints)) continue;
    for (const j of skin.joints) {
      if (typeof j === 'number' && j >= 0 && j < nodeCount && !seen.has(j)) {
        seen.add(j);
        ordered.push(j);
      }
    }
  }
  // Some providers (notably the mock fixture below) ship a skeleton via
  // node hierarchy with no explicit skin — fall back to "all nodes that
  // look like joints by name".
  if (ordered.length === 0 && Array.isArray(json.nodes)) {
    for (let i = 0; i < json.nodes.length; i++) {
      const name = json.nodes[i]?.name;
      if (typeof name === 'string' && (mapJointName(name) || /joint|bone/iu.test(name))) {
        ordered.push(i);
      }
    }
  }
  return ordered;
}

function computeParentMap(nodes: GltfJson['nodes']): Map<number, number> {
  const map = new Map<number, number>();
  if (!Array.isArray(nodes)) return map;
  for (let i = 0; i < nodes.length; i++) {
    const children = nodes[i]?.children;
    if (!Array.isArray(children)) continue;
    for (const child of children) {
      if (typeof child === 'number' && !map.has(child)) {
        map.set(child, i);
      }
    }
  }
  return map;
}

/**
 * Attempt to find a Mixamo canonical name for a given source joint.
 */
export function mapJointName(sourceName: string): string | undefined {
  if (!sourceName) return undefined;
  if (MIXAMO_SET.has(sourceName)) return sourceName;
  const key = normalise(sourceName);
  return JOINT_ALIASES.get(key);
}

/**
 * Best-effort canonical animation labels. We look for the standard
 * keywords (`idle`, `walk`, `run`, `jump`, `attack`) anywhere in the
 * clip name; loop heuristics use the clip name suffix.
 */
function normalizeAnimations(json: GltfJson, warnings: string[]): GltfAnimationClipInfo[] {
  const animations = Array.isArray(json.animations) ? json.animations : [];
  const out: GltfAnimationClipInfo[] = animations.map((clip, index) => {
    const sourceName = typeof clip.name === 'string' && clip.name.trim()
      ? clip.name.trim()
      : `clip_${index}`;
    const canonicalLabel = canonicalAnimationLabel(sourceName);
    const duration = clipDuration(clip, json);
    const loop = /^(?:idle|walk|run|fly|swim|patrol|stand)(?:[_\-\s]|$)/iu.test(sourceName)
      || /loop|cycle/iu.test(sourceName);
    return {
      sourceName,
      ...(canonicalLabel ? { canonicalLabel } : {}),
      ...(typeof duration === 'number' && Number.isFinite(duration) ? { duration } : {}),
      loop,
    };
  });

  const haveIdle = out.some((clip) => clip.canonicalLabel === 'idle');
  if (out.length > 0 && !haveIdle) {
    warnings.push('no idle animation found; UI should pick a default pose');
  }
  return out;
}

export function canonicalAnimationLabel(name: string): StandardAnimationLabel | undefined {
  const lowered = name.toLowerCase();
  for (const label of STANDARD_ANIMATION_LABELS) {
    const re = new RegExp(`(?:^|[_\\-\\s])${label}(?:[_\\-\\s]|$)`, 'u');
    if (re.test(lowered)) return label;
  }
  return undefined;
}

function clipDuration(
  clip: NonNullable<GltfJson['animations']>[number],
  json: GltfJson,
): number | undefined {
  // glTF animation duration is `max` of all sampler input accessors.
  if (!Array.isArray(clip.samplers) || !Array.isArray(json.accessors)) return undefined;
  let max = 0;
  for (const sampler of clip.samplers) {
    if (typeof sampler.input !== 'number') continue;
    const accessor = json.accessors[sampler.input];
    if (!accessor || !Array.isArray(accessor.max)) continue;
    const value = accessor.max[0];
    if (typeof value === 'number' && Number.isFinite(value) && value > max) max = value;
  }
  return max > 0 ? max : undefined;
}

/**
 * Convenience helper used by the router: validate + normalise + return a
 * shape suitable for direct embedding into a Character record. Throws
 * {@link CharacterGenUpstreamError} on hard validation failures.
 */
export function validateAndNormalizeGltf(buffer: Uint8Array): {
  validation: GltfValidationResult;
  skeleton: NormalizedSkeleton;
} {
  const validation = validateGltf(buffer);
  if (!validation.ok || !validation.json) {
    throw new CharacterGenUpstreamError(
      `glb validation failed: ${validation.errors.join('; ')}`,
    );
  }
  const skeleton = normalizeSkeleton(validation.json);
  return { validation, skeleton };
}
