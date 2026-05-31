// SPDX-License-Identifier: Apache-2.0

export interface RoundTripMergeInput {
  baseContent?: string;
  webContent: string;
  unityContent?: string;
  unityDiff?: Array<{ path: string | string[]; value: unknown }>;
}

export type RoundTripMergeEngine = 'unity' | 'unreal' | 'godot';

export interface NormalizedRoundTripMergeRequest {
  engine: RoundTripMergeEngine;
  fileName: string;
  baseContent?: string;
  engineContent?: string;
  engineDiff?: Array<{ path: string | string[]; value: unknown }>;
  force: boolean;
}

export interface RoundTripMergeConflict {
  path: string;
  baseValue: unknown;
  webValue: unknown;
  unityValue: unknown;
}

export interface RoundTripMergeResult {
  content: string;
  conflicts: RoundTripMergeConflict[];
  strategy: 'json-three-way' | 'text-three-way';
}

interface TextEdit {
  start: number;
  end: number;
  replacement: string;
  changed: boolean;
}

const FORBIDDEN_PATH_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);
const MAX_ENGINE_DIFF_ENTRIES = 256;
const MAX_DIFF_PATH_SEGMENTS = 32;
const MAX_DIFF_VALUE_DEPTH = 16;
const MAX_DIFF_VALUE_OBJECT_PROPERTIES = 128;
const MAX_DIFF_VALUE_ARRAY_ITEMS = 512;
const MAX_DIFF_VALUE_STRING_LENGTH = 4096;
const MAX_DIFF_VALUE_PROPERTY_LENGTH = 512;
const MAX_STABLE_ARRAY_SELECTOR_VALUE_LENGTH = 160;
const MAX_MERGE_TREE_DEPTH = 32;
const MAX_MERGE_OBJECT_PROPERTIES = 2048;
const MAX_MERGE_ARRAY_ITEMS = 8192;
const MAX_MERGE_STRING_LENGTH = 1024 * 1024;
const MAX_TEXT_MERGE_CONTENT_LENGTH = 1024 * 1024;
const MAX_MERGE_PATH_LENGTH = 512;
const MAX_MERGE_CONFLICTS = 100;
const SELECTOR_SEGMENT_RE = /^([A-Za-z0-9_-]+)\[([A-Za-z0-9_-]+)=([^\]\0]{1,160})\]$/;
const ROUND_TRIP_ENGINES: readonly RoundTripMergeEngine[] = ['unity', 'unreal', 'godot'];
const STABLE_ARRAY_KEY_FIELDS = [
  'id',
  'actorId',
  'spawnId',
  'objectiveId',
  'hazardId',
  'roomId',
  'encounterId',
  'connectionId',
  'nodeId',
  'slug',
  'guid',
  'name',
] as const;
type StableArrayKeyField = typeof STABLE_ARRAY_KEY_FIELDS[number];
const STABLE_ARRAY_KEY_FIELD_SET = new Set<string>(STABLE_ARRAY_KEY_FIELDS);

interface DiffPathSegment {
  key: string;
  selector?: {
    field: StableArrayKeyField;
    value: string;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeRoundTripEngine(body: Record<string, unknown>): RoundTripMergeEngine {
  if (typeof body.engine === 'string') {
    const clean = body.engine.trim().toLowerCase();
    if (ROUND_TRIP_ENGINES.includes(clean as RoundTripMergeEngine)) return clean as RoundTripMergeEngine;
  }
  if (typeof body.unrealContent === 'string' || Array.isArray(body.unrealDiff)) return 'unreal';
  if (typeof body.godotContent === 'string' || Array.isArray(body.godotDiff)) return 'godot';
  return 'unity';
}

export function normalizeRoundTripMergeRequest(input: unknown): NormalizedRoundTripMergeRequest {
  const body = isRecord(input) ? input : {};
  const engine = normalizeRoundTripEngine(body);
  const contentKey = `${engine}Content`;
  const diffKey = `${engine}Diff`;
  const engineContent = typeof body.engineContent === 'string'
    ? body.engineContent
    : typeof body[contentKey] === 'string'
      ? body[contentKey]
      : typeof body.unityContent === 'string'
        ? body.unityContent
        : undefined;
  const engineDiff = Array.isArray(body.engineDiff)
    ? body.engineDiff as NormalizedRoundTripMergeRequest['engineDiff']
    : Array.isArray(body[diffKey])
      ? body[diffKey] as NormalizedRoundTripMergeRequest['engineDiff']
      : Array.isArray(body.unityDiff)
        ? body.unityDiff as NormalizedRoundTripMergeRequest['engineDiff']
        : undefined;
  return {
    engine,
    fileName: typeof body.fileName === 'string' ? body.fileName.trim() : '',
    ...(typeof body.baseContent === 'string' ? { baseContent: body.baseContent } : {}),
    ...(engineContent !== undefined ? { engineContent } : {}),
    ...(engineDiff !== undefined ? { engineDiff } : {}),
    force: body.force === true,
  };
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function assertSafePathSegment(value: string, label: string): void {
  if (FORBIDDEN_PATH_SEGMENTS.has(value) || value.includes('\0')) {
    throw new Error(`unsafe unityDiff path segment: ${value}`);
  }
  if (value.length > 200) {
    throw new Error(`unityDiff ${label} is too long`);
  }
}

function isStableArrayKeyField(value: string): value is StableArrayKeyField {
  return STABLE_ARRAY_KEY_FIELD_SET.has(value);
}

function parsePathPart(part: string): DiffPathSegment {
  const selectorMatch = part.match(SELECTOR_SEGMENT_RE);
  if (selectorMatch) {
    const [, key, field, value] = selectorMatch;
    const selectorField = field!;
    assertSafePathSegment(key!, 'segment');
    if (!isStableArrayKeyField(selectorField)) throw new Error(`unsafe unityDiff path segment: ${part}`);
    assertSafePathSegment(value!, 'selector');
    if (!isSafeStableArraySelectorValue(value!)) throw new Error(`unsafe unityDiff path segment: ${part}`);
    return { key: key!, selector: { field: selectorField, value: value! } };
  }
  if (part.includes('[') || part.includes(']')) {
    throw new Error(`unsafe unityDiff path segment: ${part}`);
  }
  assertSafePathSegment(part, 'segment');
  return { key: part };
}

function parsePath(pathValue: string | string[]): DiffPathSegment[] {
  const rawParts = Array.isArray(pathValue) ? pathValue.map(String) : String(pathValue)
    .replace(/^\$\.?/, '')
    .split('.');
  const parts = rawParts.map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0 || parts.length > MAX_DIFF_PATH_SEGMENTS) {
    throw new Error('unityDiff path must contain 1-32 safe segments');
  }
  return parts.map(parsePathPart);
}

function cloneJson<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function setPath(target: unknown, pathValue: string | string[], value: unknown): unknown {
  const parts = parsePath(pathValue);
  return setPathNode(target, parts, 0, value);
}

function setPathNode(target: unknown, parts: DiffPathSegment[], index: number, value: unknown): unknown {
  if (index >= parts.length) return value;
  const part = parts[index]!;
  if (Array.isArray(target) && !part.selector) {
    const existing = [...target];
    const numericIndex = parseArrayIndex(part.key);
    let itemIndex = numericIndex ?? findStableArrayItemIndex(existing, part.key);
    if (itemIndex < 0) {
      itemIndex = existing.length;
      existing.push({ id: part.key });
    }
    existing[itemIndex] = setPathNode(existing[itemIndex], parts, index + 1, value);
    return existing;
  }
  const root: unknown = Array.isArray(target) ? [...target] : isRecord(target) ? { ...target } : {};
  if (part.selector) {
    const cursor = root as Record<string, unknown>;
    const existing = Array.isArray(cursor[part.key]) ? [...(cursor[part.key] as unknown[])] : [];
    let itemIndex = existing.findIndex((item) => isRecord(item) && String(item[part.selector!.field]) === part.selector!.value);
    if (itemIndex < 0) {
      itemIndex = existing.length;
      existing.push({ [part.selector.field]: part.selector.value });
    }
    existing[itemIndex] = setPathNode(existing[itemIndex], parts, index + 1, value);
    cursor[part.key] = existing;
    return root;
  }
  const cursor = root as Record<string, unknown>;
  cursor[part.key] = setPathNode(cursor[part.key], parts, index + 1, value);
  return root;
}

function parseArrayIndex(value: string): number | undefined {
  if (!/^(0|[1-9]\d*)$/u.test(value)) return undefined;
  const index = Number(value);
  return Number.isSafeInteger(index) ? index : undefined;
}

function assertSafeDiffValue(value: unknown): void {
  if (!isSafeDiffValue(value)) throw new Error('unsafe unityDiff value');
}

function isSafeDiffValue(value: unknown, depth = 0): boolean {
  if (depth > MAX_DIFF_VALUE_DEPTH || value === null || value === undefined) return false;
  if (typeof value === 'string') return value.length <= MAX_DIFF_VALUE_STRING_LENGTH;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'boolean') return true;
  if (Array.isArray(value)) {
    if (value.length > MAX_DIFF_VALUE_ARRAY_ITEMS) return false;
    return value.every((item) => isSafeDiffValue(item, depth + 1));
  }
  if (!isRecord(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const entries = Object.entries(value);
  if (entries.length > MAX_DIFF_VALUE_OBJECT_PROPERTIES) return false;
  return entries.every(([key, child]) => (
    isSafeDiffValuePropertyName(key) && isSafeDiffValue(child, depth + 1)
  ));
}

function isSafeDiffValuePropertyName(value: string): boolean {
  if (
    !value.trim()
    || value.length > MAX_DIFF_VALUE_PROPERTY_LENGTH
    || FORBIDDEN_PATH_SEGMENTS.has(value)
    || value.includes('\0')
    || value.includes('://')
    || value.includes('/')
    || value.includes('\\')
    || value.includes('..')
    || containsConflictPathDelimiter(value)
  ) {
    return false;
  }
  return !/[\u0000-\u001f\u007f]/u.test(value);
}

function containsConflictPathDelimiter(value: string): boolean {
  return value.includes('.') || value.includes('[') || value.includes(']') || value.includes('=') || value.includes(' ');
}

function assertSafeMergeObjectKey(value: string, path: string): void {
  if (!isSafeDiffValuePropertyName(value)) {
    throw new Error(`unsafe round-trip object key at ${path}.${value}`);
  }
}

function assertSafeMergeObjectKeys(value: unknown, path: string): void {
  if (!isRecord(value)) return;
  for (const key of Object.keys(value)) assertSafeMergeObjectKey(key, path);
}

function assertSafeMergeObjectTreeKeys(value: unknown, path: string): void {
  const stack: Array<{ value: unknown; path: string; depth: number }> = [{ value, path, depth: 0 }];
  for (let cursor = 0; cursor < stack.length; cursor += 1) {
    const item = stack[cursor]!;
    if (item.depth > MAX_MERGE_TREE_DEPTH) throw new Error(`unsafe round-trip tree depth at ${item.path}`);
    if (item.path.length > MAX_MERGE_PATH_LENGTH) throw new Error(`unsafe round-trip path length at ${item.path}`);
    assertSafeMergeTreeValue(item.value, item.path);
    if (Array.isArray(item.value)) {
      if (item.value.length > MAX_MERGE_ARRAY_ITEMS) throw new Error(`unsafe round-trip array width at ${item.path}`);
      for (const [index, child] of item.value.entries()) {
        if (child !== null && child !== undefined) stack.push({ value: child, path: `${item.path}[${index}]`, depth: item.depth + 1 });
      }
      continue;
    }
    if (!isRecord(item.value)) continue;
    const keys = Object.keys(item.value);
    if (keys.length > MAX_MERGE_OBJECT_PROPERTIES) throw new Error(`unsafe round-trip object width at ${item.path}`);
    for (const key of keys) {
      assertSafeMergeObjectKey(key, item.path);
      const child = item.value[key];
      if (child !== null && child !== undefined) stack.push({ value: child, path: `${item.path}.${key}`, depth: item.depth + 1 });
    }
  }
}

function assertSafeMergeTreeValue(value: unknown, path: string): void {
  if (value === undefined || value === null || typeof value === 'boolean') return;
  if (typeof value === 'string') {
    if (value.length <= MAX_MERGE_STRING_LENGTH) return;
    throw new Error(`unsafe round-trip string length at ${path}`);
  }
  if (typeof value === 'number') {
    if (Number.isFinite(value)) return;
    throw new Error(`unsafe round-trip numeric value at ${path}`);
  }
  if (Array.isArray(value)) return;
  if (isRecord(value)) {
    const prototype = Object.getPrototypeOf(value);
    if (prototype === Object.prototype || prototype === null) return;
  }
  throw new Error(`unsafe round-trip value type at ${path}`);
}

function applyUnityDiff(webJson: unknown, unityDiff?: RoundTripMergeInput['unityDiff']): unknown | undefined {
  if (!unityDiff || unityDiff.length === 0) return undefined;
  if (unityDiff.length > MAX_ENGINE_DIFF_ENTRIES) throw new Error('too many unityDiff entries');
  let next = cloneJson(webJson);
  for (const edit of unityDiff) {
    assertSafeDiffValue(edit.value);
    next = setPath(next, edit.path, edit.value);
  }
  return next;
}

function mergeJsonNode(
  baseValue: unknown,
  webValue: unknown,
  unityValue: unknown,
  path: string,
  conflicts: RoundTripMergeConflict[],
): unknown {
  assertSafeMergeObjectKeys(baseValue, path);
  assertSafeMergeObjectKeys(webValue, path);
  assertSafeMergeObjectKeys(unityValue, path);

  if (deepEqual(webValue, unityValue)) return cloneJson(webValue);
  if (deepEqual(baseValue, webValue)) return cloneJson(unityValue);
  if (deepEqual(baseValue, unityValue)) return cloneJson(webValue);

  if (isRecord(webValue) && isRecord(unityValue)) {
    const merged: Record<string, unknown> = {};
    const keys = new Set([...Object.keys(webValue), ...Object.keys(unityValue)]);
    for (const key of keys) {
      assertSafeMergeObjectKey(key, path);
      merged[key] = mergeJsonNode(
        isRecord(baseValue) ? baseValue[key] : undefined,
        webValue[key],
        unityValue[key],
        `${path}.${key}`,
        conflicts,
      );
    }
    return merged;
  }

  if (Array.isArray(webValue) && Array.isArray(unityValue)) {
    return mergeJsonArray(
      Array.isArray(baseValue) ? baseValue : undefined,
      webValue,
      unityValue,
      path,
      conflicts,
    );
  }

  const mergedText = tryMergeIndependentText(baseValue, webValue, unityValue);
  if (mergedText !== undefined) return mergedText;

  addMergeConflict(conflicts, path, baseValue, webValue, unityValue);
  return cloneJson(unityValue);
}

function addMergeConflict(
  conflicts: RoundTripMergeConflict[],
  path: string,
  baseValue: unknown,
  webValue: unknown,
  unityValue: unknown,
): void {
  if (conflicts.length >= MAX_MERGE_CONFLICTS) {
    throw new Error(`too many round-trip merge conflicts at ${path}`);
  }
  conflicts.push({
    path,
    baseValue: cloneJson(baseValue),
    webValue: cloneJson(webValue),
    unityValue: cloneJson(unityValue),
  });
}

function mergeJsonArray(
  baseValue: unknown[] | undefined,
  webValue: unknown[],
  unityValue: unknown[],
  path: string,
  conflicts: RoundTripMergeConflict[],
): unknown[] {
  const useStableKeys = canUseStableArrayKeys(baseValue, webValue, unityValue);
  const baseMap = mapArrayItems(baseValue ?? [], useStableKeys);
  const webMap = mapArrayItems(webValue, useStableKeys);
  const unityMap = mapArrayItems(unityValue, useStableKeys);
  const keys = orderedArrayKeys(webMap, unityMap, baseMap);
  const merged: unknown[] = [];
  for (const key of keys) {
    const value = mergeJsonNode(
      baseMap.get(key),
      webMap.get(key),
      unityMap.get(key),
      appendArrayPath(path, key),
      conflicts,
    );
    if (value !== undefined) merged.push(value);
  }
  return merged;
}

function canUseStableArrayKeys(...arrays: Array<unknown[] | undefined>): boolean {
  let hasItems = false;
  for (const array of arrays) {
    const seen = new Set<string>();
    for (const item of array ?? []) {
      hasItems = true;
      const key = stableArrayItemKey(item);
      if (!key || seen.has(key)) return false;
      seen.add(key);
    }
  }
  return hasItems;
}

function stableArrayItemKey(item: unknown): string | undefined {
  if (!isRecord(item)) return undefined;
  for (const field of STABLE_ARRAY_KEY_FIELDS) {
    const value = stableArraySelectorValue(item[field]);
    if (value) return stableArrayItemKeyForField(field, value);
  }
  return undefined;
}

function stableArrayItemKeyForField(field: StableArrayKeyField, value: string): string {
  return field === 'id' || field === 'name'
    ? `${field}:${value}`
    : `field:${field}:${value}`;
}

function findStableArrayItemIndex(items: unknown[], value: string): number {
  return items.findIndex((item) => (
    isRecord(item)
    && STABLE_ARRAY_KEY_FIELDS.some((field) => stableArraySelectorValue(item[field]) === value)
  ));
}

function stableArraySelectorValue(value: unknown): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  if (typeof value === 'number' && !Number.isFinite(value)) return undefined;
  const text = String(value);
  return isSafeStableArraySelectorValue(text) ? text : undefined;
}

function isSafeStableArraySelectorValue(value: string): boolean {
  if (
    !value.trim()
    || value.length > MAX_STABLE_ARRAY_SELECTOR_VALUE_LENGTH
    || value.includes('[')
    || value.includes(']')
    || value.includes('/')
    || value.includes('\\')
    || value.includes('..')
    || value.includes('://')
  ) {
    return false;
  }
  return !/[\u0000-\u001f\u007f]/u.test(value);
}

function mapArrayItems(items: unknown[], stableKeys: boolean): Map<string, unknown> {
  const map = new Map<string, unknown>();
  for (const [index, item] of items.entries()) {
    map.set(stableKeys ? stableArrayItemKey(item)! : `index:${index}`, item);
  }
  return map;
}

function orderedArrayKeys(...maps: Array<Map<string, unknown>>): string[] {
  const seen = new Set<string>();
  const keys: string[] = [];
  for (const map of maps) {
    for (const key of map.keys()) {
      if (seen.has(key)) continue;
      seen.add(key);
      keys.push(key);
    }
  }
  return keys;
}

function appendArrayPath(path: string, key: string): string {
  if (key.startsWith('id:')) return `${path}[id=${key.slice(3)}]`;
  if (key.startsWith('name:')) return `${path}[name=${key.slice(5)}]`;
  if (key.startsWith('field:')) {
    const separator = key.indexOf(':', 'field:'.length);
    if (separator > 0) return `${path}[${key.slice('field:'.length, separator)}=${key.slice(separator + 1)}]`;
  }
  if (key.startsWith('index:')) return `${path}[${key.slice(6)}]`;
  return `${path}[${key}]`;
}

function tryParseJson(content: string): unknown | undefined {
  try {
    return JSON.parse(content);
  } catch {
    return undefined;
  }
}

function isStringValue(value: unknown): value is string {
  return typeof value === 'string';
}

function findTextEdit(baseText: string, changedText: string): TextEdit {
  if (baseText === changedText) return { start: 0, end: 0, replacement: '', changed: false };

  let prefix = 0;
  const maxPrefix = Math.min(baseText.length, changedText.length);
  while (prefix < maxPrefix && baseText[prefix] === changedText[prefix]) prefix++;

  let suffix = 0;
  while (
    suffix < baseText.length - prefix &&
    suffix < changedText.length - prefix &&
    baseText[baseText.length - 1 - suffix] === changedText[changedText.length - 1 - suffix]
  ) {
    suffix++;
  }

  const end = baseText.length - suffix;
  const replacementLength = changedText.length - prefix - suffix;
  return {
    start: prefix,
    end,
    replacement: replacementLength > 0 ? changedText.slice(prefix, prefix + replacementLength) : '',
    changed: true,
  };
}

function textEditsMatch(left: TextEdit, right: TextEdit): boolean {
  return left.start === right.start && left.end === right.end && left.replacement === right.replacement;
}

function textEditsOverlap(baseText: string, left: TextEdit, right: TextEdit): boolean {
  if (left.start === left.end && right.start === right.end && left.start === right.start) return true;
  if (left.start < right.end && right.start < left.end) return true;
  return textEditsTouchSameToken(baseText, left, right);
}

function textEditsTouchSameToken(baseText: string, left: TextEdit, right: TextEdit): boolean {
  const first = left.start <= right.start ? left : right;
  const second = left.start <= right.start ? right : left;
  if (first.end !== second.start || first.end <= 0 || second.start >= baseText.length) return false;
  return !/\s/u.test(baseText[first.end - 1]!) && !/\s/u.test(baseText[second.start]!);
}

function applyTextEdits(baseText: string, first: TextEdit, second: TextEdit): string {
  const left = first.start > second.start ? first : second;
  const right = first.start > second.start ? second : first;
  const withLeft = baseText.slice(0, left.start) + left.replacement + baseText.slice(left.end);
  return withLeft.slice(0, right.start) + right.replacement + withLeft.slice(right.end);
}

function tryMergeIndependentText(baseValue: unknown, webValue: unknown, unityValue: unknown): string | undefined {
  if (!isStringValue(baseValue) || !isStringValue(webValue) || !isStringValue(unityValue)) return undefined;
  const webEdit = findTextEdit(baseValue, webValue);
  const unityEdit = findTextEdit(baseValue, unityValue);
  if (!webEdit.changed || !unityEdit.changed) return undefined;
  if (textEditsMatch(webEdit, unityEdit)) return webValue;
  if (textEditsOverlap(baseValue, webEdit, unityEdit)) return undefined;
  return applyTextEdits(baseValue, webEdit, unityEdit);
}

function assertSafeTextMergeContent(value: string, label: string): void {
  if (value.length > MAX_TEXT_MERGE_CONTENT_LENGTH) {
    throw new Error(`unsafe round-trip text length at ${label}`);
  }
}

function mergeText(input: RoundTripMergeInput): RoundTripMergeResult {
  const base = input.baseContent ?? '';
  const unity = input.unityContent ?? input.webContent;
  assertSafeTextMergeContent(base, 'baseContent');
  assertSafeTextMergeContent(input.webContent, 'webContent');
  assertSafeTextMergeContent(unity, 'unityContent');
  if (input.webContent === unity) return { content: input.webContent, conflicts: [], strategy: 'text-three-way' };
  if (base === input.webContent) return { content: unity, conflicts: [], strategy: 'text-three-way' };
  if (base === unity) return { content: input.webContent, conflicts: [], strategy: 'text-three-way' };
  const merged = tryMergeIndependentText(base, input.webContent, unity);
  if (merged !== undefined) return { content: merged, conflicts: [], strategy: 'text-three-way' };
  return {
    content: unity,
    conflicts: [{ path: '$', baseValue: base, webValue: input.webContent, unityValue: unity }],
    strategy: 'text-three-way',
  };
}

export function mergeRoundTripContent(input: RoundTripMergeInput): RoundTripMergeResult {
  const webJson = tryParseJson(input.webContent);
  const baseJson = input.baseContent ? tryParseJson(input.baseContent) : undefined;
  const unityJson = input.unityContent ? tryParseJson(input.unityContent) : applyUnityDiff(webJson, input.unityDiff);
  if (webJson === undefined || unityJson === undefined) return mergeText(input);
  assertSafeMergeObjectTreeKeys(baseJson, '$');
  assertSafeMergeObjectTreeKeys(webJson, '$');
  assertSafeMergeObjectTreeKeys(unityJson, '$');
  const conflicts: RoundTripMergeConflict[] = [];
  const merged = mergeJsonNode(baseJson, webJson, unityJson, '$', conflicts);
  return {
    content: JSON.stringify(merged, null, 2) + '\n',
    conflicts,
    strategy: 'json-three-way',
  };
}
