// SPDX-License-Identifier: Apache-2.0

export interface ArtifactMergeInput<T = unknown> {
  base: T;
  local: T;
  remote: T;
}

export interface ArtifactMergeConflict {
  path: string;
  base: unknown;
  local: unknown;
  remote: unknown;
  reason: "both-edited-scalar" | "array-diverged" | "type-changed";
}

export interface ArtifactMergeResult<T = unknown> {
  merged: T;
  conflicts: ArtifactMergeConflict[];
}

const STABLE_ARRAY_KEY_FIELDS = ["id", "key", "slug"] as const;

export function mergeGameArtifact<T = unknown>(input: ArtifactMergeInput<T>): ArtifactMergeResult<T> {
  const conflicts: ArtifactMergeConflict[] = [];
  const merged = mergeValue(input.base, input.local, input.remote, "", conflicts);
  return { merged: merged as T, conflicts };
}

function mergeValue(
  base: unknown,
  local: unknown,
  remote: unknown,
  path: string,
  conflicts: ArtifactMergeConflict[],
): unknown {
  if (Object.is(local, remote)) return clone(local);
  if (Object.is(base, local)) return clone(remote);
  if (Object.is(base, remote)) return clone(local);

  if (isPlainObject(base) && isPlainObject(local) && isPlainObject(remote)) {
    const out: Record<string, unknown> = {};
    const keys = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)]);
    for (const key of keys) {
      out[key] = mergeValue(base[key], local[key], remote[key], appendPath(path, key), conflicts);
    }
    return out;
  }

  if (Array.isArray(base) && Array.isArray(local) && Array.isArray(remote)) {
    if (JSON.stringify(local) === JSON.stringify(remote)) return clone(local);
    const keyedMerge = tryMergeKeyedArray(base, local, remote, path, conflicts);
    if (keyedMerge) return keyedMerge;
    conflicts.push({ path, base, local, remote, reason: "array-diverged" });
    return clone(remote);
  }

  if (typeof local !== typeof remote) {
    conflicts.push({ path, base, local, remote, reason: "type-changed" });
    return clone(remote);
  }

  conflicts.push({ path, base, local, remote, reason: "both-edited-scalar" });
  return clone(remote);
}

interface KeyedArrayIndex {
  keyField: string;
  base: Map<string, Record<string, unknown>>;
  local: Map<string, Record<string, unknown>>;
  remote: Map<string, Record<string, unknown>>;
  order: string[];
}

function tryMergeKeyedArray(
  base: unknown[],
  local: unknown[],
  remote: unknown[],
  path: string,
  conflicts: ArtifactMergeConflict[],
): unknown[] | null {
  const index = buildKeyedArrayIndex(base, local, remote);
  if (!index) return null;

  const merged: unknown[] = [];
  for (const key of index.order) {
    const baseHas = index.base.has(key);
    const localHas = index.local.has(key);
    const remoteHas = index.remote.has(key);
    const baseItem = index.base.get(key);
    const localItem = index.local.get(key);
    const remoteItem = index.remote.get(key);
    const itemPath = appendPath(path, key);

    if (!baseHas) {
      if (localHas && remoteHas) {
        merged.push(mergeValue({}, localItem, remoteItem, itemPath, conflicts));
      } else {
        merged.push(clone((localHas ? localItem : remoteItem)!));
      }
      continue;
    }

    if (!localHas && !remoteHas) continue;

    if (!localHas || !remoteHas) {
      const survivingItem = (localHas ? localItem : remoteItem)!;
      if (JSON.stringify(survivingItem) === JSON.stringify(baseItem)) continue;
      conflicts.push({
        path: itemPath,
        base: baseItem,
        local: localHas ? localItem : undefined,
        remote: remoteHas ? remoteItem : undefined,
        reason: "array-diverged",
      });
      merged.push(clone(survivingItem));
      continue;
    }

    merged.push(mergeValue(baseItem, localItem, remoteItem, itemPath, conflicts));
  }

  return merged;
}

function buildKeyedArrayIndex(base: unknown[], local: unknown[], remote: unknown[]): KeyedArrayIndex | null {
  for (const keyField of STABLE_ARRAY_KEY_FIELDS) {
    const baseIndex = buildArrayIndex(base, keyField);
    const localIndex = buildArrayIndex(local, keyField);
    const remoteIndex = buildArrayIndex(remote, keyField);
    if (!baseIndex || !localIndex || !remoteIndex) continue;
    return {
      keyField,
      base: baseIndex.map,
      local: localIndex.map,
      remote: remoteIndex.map,
      order: orderedKeys(baseIndex.order, localIndex.order, remoteIndex.order),
    };
  }
  return null;
}

function buildArrayIndex(items: unknown[], keyField: string): { map: Map<string, Record<string, unknown>>; order: string[] } | null {
  const map = new Map<string, Record<string, unknown>>();
  const order: string[] = [];
  for (const item of items) {
    if (!isPlainObject(item)) return null;
    const key = stableArrayKey(item[keyField]);
    if (!key || map.has(key)) return null;
    map.set(key, item);
    order.push(key);
  }
  return { map, order };
}

function orderedKeys(...orders: string[][]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const order of orders) {
    for (const key of order) {
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(key);
    }
  }
  return result;
}

function stableArrayKey(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

export function mergeArtifactText(base: string, local: string, remote: string): ArtifactMergeResult<string> {
  if (local === remote) return { merged: local, conflicts: [] };
  if (base === local) return { merged: remote, conflicts: [] };
  if (base === remote) return { merged: local, conflicts: [] };
  return {
    merged: [
      "<<<<<<< local",
      local,
      "=======",
      remote,
      ">>>>>>> remote",
    ].join("\n"),
    conflicts: [
      {
        path: "",
        base,
        local,
        remote,
        reason: "both-edited-scalar",
      },
    ],
  };
}

function appendPath(path: string, segment: string): string {
  if (!path) return `/${escapeJsonPointer(segment)}`;
  return `${path}/${escapeJsonPointer(segment)}`;
}

function escapeJsonPointer(value: string): string {
  return value.replace(/~/g, "~0").replace(/\//g, "~1");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clone<T>(value: T): T {
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value)) as T;
}
