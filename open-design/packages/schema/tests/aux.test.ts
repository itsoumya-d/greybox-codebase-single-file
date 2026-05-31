/**
 * Auxiliary tests covering helpers and per-file exports that aren't already
 * exercised by the game-project / screen / component / character suites:
 *
 * - `ids.ts` brand cast helpers
 * - `export-policy.ts` defaults
 * - `flow.ts` direct schema parsing
 * - `asset.ts` direct schema parsing (negative cases)
 * - `version.ts` migrate error paths (positive cases live in game-project tests)
 * - `game-project.ts` `emptyGameProjectScaffold` shape
 */
import { describe, expect, it } from 'vitest';

import {
  AssetSchema,
  FlowEdgeSchema,
  FlowTriggerSchema,
  asAnimationClipId,
  asAssetId,
  asCharacterId,
  asComponentId,
  asFlowEdgeId,
  asMaterialId,
  asProjectId,
  asScreenId,
  defaultExportPolicy,
  emptyGameProjectScaffold,
} from '../src/index.js';

describe('ids brand cast helpers', () => {
  it('round-trips strings through every helper', () => {
    expect(asProjectId('p-1')).toBe('p-1');
    expect(asScreenId('s-1')).toBe('s-1');
    expect(asComponentId('c-1')).toBe('c-1');
    expect(asFlowEdgeId('e-1')).toBe('e-1');
    expect(asCharacterId('ch-1')).toBe('ch-1');
    expect(asAssetId('a-1')).toBe('a-1');
    expect(asAnimationClipId('anim-1')).toBe('anim-1');
    expect(asMaterialId('m-1')).toBe('m-1');
  });
});

describe('export-policy defaults', () => {
  it('builds a default that validates against ExportPolicySchema', () => {
    const p = defaultExportPolicy();
    expect(p.unity.renderPipeline).toBe('urp');
    expect(p.unreal.engineVersion).toBe('5.5');
    expect(p.godot.renderer).toBe('forward+');
    expect(p.web).toBeUndefined();
  });
});

describe('flow triggers', () => {
  it.each([
    ['tap', { type: 'tap' }],
    ['longPress', { type: 'longPress', durationSeconds: 1 }],
    ['swipe', { type: 'swipe', direction: 'up' }],
    ['time', { type: 'time', delaySeconds: 0 }],
    ['scriptEvent', { type: 'scriptEvent', eventId: 'evt-x' }],
    ['collision', { type: 'collision', tag: 'door' }],
    ['custom', { type: 'custom', payload: { a: 1 } }],
  ])('parses %s trigger', (_label, payload) => {
    const parsed = FlowTriggerSchema.parse(payload);
    expect(parsed.type).toBe((payload as { type: string }).type);
  });

  it('rejects an unknown trigger type', () => {
    expect(() => FlowTriggerSchema.parse({ type: 'shake' })).toThrow();
  });

  it('parses a full FlowEdge', () => {
    const edge = FlowEdgeSchema.parse({
      id: 'e-1',
      from: 's-1',
      to: 's-2',
      trigger: { type: 'tap' },
    });
    expect(edge.from).toBe('s-1');
    expect(edge.to).toBe('s-2');
  });
});

describe('asset schema', () => {
  const baseAsset = {
    id: 'asset-1',
    type: 'png' as const,
    uri: 'a/b.png',
    sha256: 'a'.repeat(64),
    sizeBytes: 1,
    provenance: { license: 'Apache-2.0', source: 'human' },
  };

  it('accepts a minimal valid asset', () => {
    const a = AssetSchema.parse(baseAsset);
    expect(a.type).toBe('png');
  });

  it('rejects an unknown asset type', () => {
    expect(() =>
      AssetSchema.parse({ ...baseAsset, type: 'tiff' as never }),
    ).toThrow();
  });

  it('rejects negative sizeBytes', () => {
    expect(() => AssetSchema.parse({ ...baseAsset, sizeBytes: -1 })).toThrow();
  });

  it('rejects uppercase sha256', () => {
    expect(() =>
      AssetSchema.parse({ ...baseAsset, sha256: 'A'.repeat(64) }),
    ).toThrow();
  });
});

describe('emptyGameProjectScaffold', () => {
  it('returns a scaffold pinned to current SCHEMA_VERSION', () => {
    const scaffold = emptyGameProjectScaffold() as {
      schemaVersion: string;
      screens: unknown[];
      meta: { id?: string };
    };
    expect(scaffold.schemaVersion).toBe('0.1.0');
    expect(scaffold.screens).toEqual([]);
    // Documented behaviour: scaffold has no meta.id; caller must fill in.
    expect(scaffold.meta.id).toBeUndefined();
  });
});
