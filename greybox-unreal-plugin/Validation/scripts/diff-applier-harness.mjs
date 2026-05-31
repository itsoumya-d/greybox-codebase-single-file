#!/usr/bin/env node
// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

/**
 * Node-side port of the GreyboxDiffApplier 3-way merge algorithm. Used by
 * `diff-applier-harness.test.mjs` to verify the C++ behavior without
 * standing up an Unreal editor.
 *
 * The C++ implementation in
 * `Source/GreyboxStudioEditor/Private/GreyboxDiffApplier.cpp` follows the
 * exact same rules; the two are intended to stay symmetric. If you change
 * the algorithm in C++ you MUST mirror the change here.
 */

const STABLE_ID_KEYS = ['id', 'componentId', 'screenId', 'characterId', 'assetId', 'edgeId'];

function encodePointer(segment) {
  return String(segment).replaceAll('~', '~0').replaceAll('/', '~1');
}

function stableId(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  for (const key of STABLE_ID_KEYS) {
    if (typeof value[key] === 'string' && value[key].length > 0) return value[key];
  }
  return null;
}

function valuesEqual(a, b) {
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (!valuesEqual(a[i], b[i])) return false;
    }
    return true;
  }
  if (typeof a === 'object') {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    for (const key of keysA) {
      if (!valuesEqual(a[key], b[key])) return false;
    }
    return true;
  }
  if (typeof a === 'number' && typeof b === 'number') {
    return Math.abs(a - b) < 1e-6;
  }
  return false;
}

function clone(value) {
  if (value === null || typeof value !== 'object') return value;
  return JSON.parse(JSON.stringify(value));
}

function recordConflict(conflicts, pointer, base, local, remote) {
  conflicts.push({
    jsonPointer: pointer,
    baseValueJson: JSON.stringify(base),
    localValueJson: JSON.stringify(local),
    remoteValueJson: JSON.stringify(remote),
    resolution: 'pending',
  });
}

function mergeObject(baseObj, localObj, remoteObj, pointer, conflicts) {
  const merged = {};
  const allKeys = new Set([
    ...(baseObj ? Object.keys(baseObj) : []),
    ...(localObj ? Object.keys(localObj) : []),
    ...(remoteObj ? Object.keys(remoteObj) : []),
  ]);
  for (const key of allKeys) {
    const childPointer = `${pointer}/${encodePointer(key)}`;
    const childMerged = mergeValue(
      baseObj ? baseObj[key] : undefined,
      localObj ? localObj[key] : undefined,
      remoteObj ? remoteObj[key] : undefined,
      childPointer,
      conflicts,
    );
    if (childMerged !== undefined) merged[key] = childMerged;
  }
  return merged;
}

function buildIdMap(array) {
  const map = new Map();
  for (let i = 0; i < array.length; i += 1) {
    const id = stableId(array[i]);
    if (id === null) return null;
    map.set(id, i);
  }
  return map;
}

function mergeArrayPositional(baseArray, localArray, remoteArray, pointer, conflicts) {
  const maxLen = Math.max(baseArray.length, localArray.length, remoteArray.length);
  const merged = [];
  for (let i = 0; i < maxLen; i += 1) {
    const childPointer = `${pointer}/${i}`;
    const childMerged = mergeValue(baseArray[i], localArray[i], remoteArray[i], childPointer, conflicts);
    if (childMerged !== undefined) merged.push(childMerged);
  }
  return merged;
}

function mergeArrayById(baseArray, localArray, remoteArray, pointer, conflicts) {
  const baseIndex = buildIdMap(baseArray);
  const localIndex = buildIdMap(localArray);
  const remoteIndex = buildIdMap(remoteArray);
  if (!baseIndex || !localIndex || !remoteIndex) {
    return mergeArrayPositional(baseArray, localArray, remoteArray, pointer, conflicts);
  }
  const order = [];
  const seen = new Set();
  for (const item of localArray) {
    const id = stableId(item);
    if (id !== null && !seen.has(id)) {
      order.push(id);
      seen.add(id);
    }
  }
  for (const item of remoteArray) {
    const id = stableId(item);
    if (id !== null && !seen.has(id)) {
      order.push(id);
      seen.add(id);
    }
  }
  for (const item of baseArray) {
    const id = stableId(item);
    if (id !== null && !seen.has(id)) {
      order.push(id);
      seen.add(id);
    }
  }
  const merged = [];
  for (const id of order) {
    const baseAt = baseIndex.get(id);
    const localAt = localIndex.get(id);
    const remoteAt = remoteIndex.get(id);
    const childPointer = `${pointer}/${encodePointer(id)}`;
    const inBase = baseAt !== undefined;
    const inLocal = localAt !== undefined;
    const inRemote = remoteAt !== undefined;
    const baseValue = inBase ? baseArray[baseAt] : undefined;
    const localValue = inLocal ? localArray[localAt] : undefined;
    const remoteValue = inRemote ? remoteArray[remoteAt] : undefined;
    if (inBase && (!inLocal || !inRemote)) {
      if (!inLocal && !inRemote) continue;
      if (!inLocal && inRemote) {
        if (valuesEqual(baseValue, remoteValue)) continue;
        recordConflict(conflicts, childPointer, baseValue, null, remoteValue);
        merged.push(clone(remoteValue));
        continue;
      }
      if (!inRemote && inLocal) {
        if (valuesEqual(baseValue, localValue)) continue;
        recordConflict(conflicts, childPointer, baseValue, localValue, null);
        merged.push(clone(localValue));
        continue;
      }
    }
    const childMerged = mergeValue(baseValue, localValue, remoteValue, childPointer, conflicts);
    if (childMerged !== undefined) merged.push(childMerged);
  }
  return merged;
}

function mergeValue(baseValue, localValue, remoteValue, pointer, conflicts) {
  const localChanged = !valuesEqual(baseValue, localValue);
  const remoteChanged = !valuesEqual(baseValue, remoteValue);
  if (!localChanged && !remoteChanged) return clone(baseValue);
  if (!localChanged) return clone(remoteValue);
  if (!remoteChanged) return clone(localValue);
  if (valuesEqual(localValue, remoteValue)) return clone(localValue);

  const localIsObject = localValue && typeof localValue === 'object' && !Array.isArray(localValue);
  const remoteIsObject = remoteValue && typeof remoteValue === 'object' && !Array.isArray(remoteValue);
  if (localIsObject && remoteIsObject) {
    return mergeObject(
      baseValue && typeof baseValue === 'object' && !Array.isArray(baseValue) ? baseValue : undefined,
      localValue,
      remoteValue,
      pointer,
      conflicts,
    );
  }
  if (Array.isArray(localValue) && Array.isArray(remoteValue)) {
    const baseArray = Array.isArray(baseValue) ? baseValue : [];
    const allIdentifiable = (
      localValue.every((item) => stableId(item) !== null)
      && remoteValue.every((item) => stableId(item) !== null)
    );
    if (allIdentifiable) {
      return mergeArrayById(baseArray, localValue, remoteValue, pointer, conflicts);
    }
    return mergeArrayPositional(baseArray, localValue, remoteValue, pointer, conflicts);
  }
  recordConflict(conflicts, pointer, baseValue, localValue, remoteValue);
  return clone(localValue);
}

export function merge(request) {
  if (!request.baseArtifactJson || !request.webArtifactJson || !request.unrealEditJson) {
    return { succeeded: false, hasConflicts: false, mergedArtifactJson: '', conflicts: [] };
  }
  const base = JSON.parse(request.baseArtifactJson);
  const local = JSON.parse(request.unrealEditJson);
  const remote = JSON.parse(request.webArtifactJson);
  const conflicts = [];
  const merged = mergeValue(base, local, remote, '', conflicts);
  return {
    succeeded: true,
    hasConflicts: conflicts.length > 0,
    mergedArtifactJson: JSON.stringify(merged),
    conflicts,
    conflictPaths: conflicts.map((c) => c.jsonPointer),
  };
}

function parsePointer(pointer) {
  if (!pointer || pointer === '/') return [];
  return pointer.replace(/^\//, '').split('/').map((segment) => segment.replaceAll('~1', '/').replaceAll('~0', '~'));
}

function replaceAt(root, tokens, tokenIndex, replacement) {
  if (tokenIndex >= tokens.length) return replacement;
  if (Array.isArray(root)) {
    const next = [...root];
    const segment = tokens[tokenIndex];
    const indexFromSegment = Number.parseInt(segment, 10);
    if (!Number.isNaN(indexFromSegment) && indexFromSegment >= 0 && indexFromSegment < next.length) {
      next[indexFromSegment] = replaceAt(next[indexFromSegment], tokens, tokenIndex + 1, replacement);
      return next;
    }
    const ix = next.findIndex((item) => stableId(item) === segment);
    if (ix >= 0) {
      next[ix] = replaceAt(next[ix], tokens, tokenIndex + 1, replacement);
    }
    return next;
  }
  if (root && typeof root === 'object') {
    const next = { ...root };
    const segment = tokens[tokenIndex];
    next[segment] = replaceAt(next[segment], tokens, tokenIndex + 1, replacement);
    return next;
  }
  return replacement;
}

export function resolve(previousResult, jsonPointer, choice) {
  if (choice === 'pending') return previousResult;
  const conflict = previousResult.conflicts.find((c) => c.jsonPointer === jsonPointer);
  if (!conflict) return previousResult;
  const chosen = choice === 'local' ? JSON.parse(conflict.localValueJson) : JSON.parse(conflict.remoteValueJson);
  const tokens = parsePointer(jsonPointer);
  const merged = JSON.parse(previousResult.mergedArtifactJson);
  const updated = replaceAt(merged, tokens, 0, chosen);
  conflict.resolution = choice;
  return {
    ...previousResult,
    mergedArtifactJson: JSON.stringify(updated),
    hasConflicts: previousResult.conflicts.some((c) => c.resolution === 'pending'),
  };
}
